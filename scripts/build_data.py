#!/usr/bin/env python3
"""Denní stažení dat: stanoviště z Golemia a adresy z RÚIAN -> docs/data/*.json.

Klíč Golemia se čte z proměnné prostředí GOLEMIO_API_KEY (GitHub Actions secret).
Když některý zdroj selže, jeho soubor se NEPŘEPÍŠE (aplikace dál ukazuje poslední
funkční data) a skript skončí s chybou, ať se o tom dozvíš z GitHubu.
"""
import csv
import datetime as dt
import io
import json
import os
import sys
import unicodedata
import zipfile
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "docs" / "data"
CENTER = (50.1083, 14.5770)      # střed Prahy 14
RANGE_M = 6000                   # polomer s rezervou pro sousední čtvrti (hranice + 1 km)
PRAHA_OBEC_KOD = "554782"        # Praha jako obec v RÚIAN
MOMC_NAME = "Praha 14"

TYPE_MAP = {
    "Papír": "papir",
    "Multikomoditní sběr": "plast",
    "Barevné sklo": "sklo",
    "Čiré sklo": "sklo",
    "Kovy": "kovy",
    "Jedlé tuky a oleje": "oleje",
    "Elektrozařízení": "elektro",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


# ---------- Golemio ----------
def build_stations():
    key = os.environ.get("GOLEMIO_API_KEY")
    if not key:
        raise RuntimeError("Chybí GOLEMIO_API_KEY (Settings > Secrets and variables > Actions).")
    r = requests.get(
        "https://api.golemio.cz/v2/sortedwastestations",
        headers={"X-Access-Token": key, "Accept": "application/json"},
        params={"latlng": f"{CENTER[0]},{CENTER[1]}", "range": RANGE_M, "limit": 10000},
        timeout=60,
    )
    r.raise_for_status()
    stations = []
    for f in r.json().get("features", []):
        p = f.get("properties", {})
        # jen volně přístupná stanoviště (ne "obyvatelům domu")
        if (p.get("accessibility") or {}).get("id") != 1:
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        types = {}
        for c in p.get("containers", []):
            desc = (c.get("trash_type") or {}).get("description", "")
            t = TYPE_MAP.get(desc)
            if not t:
                continue
            cf = c.get("cleaning_frequency") or {}
            days = (cf.get("pick_days") or "").strip()
            nxt = cf.get("next_pick")
            cur = types.setdefault(t, {"d": "", "n": None})
            if days and not cur["d"]:
                cur["d"] = days
            if nxt and (cur["n"] is None or nxt < cur["n"]):
                cur["n"] = nxt
        if not types:
            continue
        stations.append({
            "id": p.get("id"),
            "name": p.get("name", "").strip(),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "t": types,
        })
    if len(stations) < 20:
        raise RuntimeError(f"Podezřele málo stanovišť ({len(stations)}), data nepřepisuji.")
    return stations


# ---------- RÚIAN ----------
def candidate_dates():
    today = dt.date.today()
    d = today.replace(day=1) - dt.timedelta(days=1)   # poslední den minulého měsíce
    for _ in range(3):
        yield d
        d = d.replace(day=1) - dt.timedelta(days=1)


def find_col(header, *parts):
    for i, h in enumerate(header):
        if all(norm(p) in norm(h) for p in parts):
            return i
    raise RuntimeError(f"V RÚIAN CSV chybí sloupec obsahující {parts}. Hlavička: {header}")


def build_addresses():
    from pyproj import Transformer
    tr = Transformer.from_crs(5514, 4326, always_xy=True)
    blob = None
    tried = []
    for d in candidate_dates():
        url = f"https://vdp.cuzk.cz/vymenny_format/csv/{d:%Y%m%d}_OB_{PRAHA_OBEC_KOD}_ADR.csv.zip"
        try:
            r = requests.get(url, timeout=300, headers={"User-Agent": "praha14-odpad/1.0"})
            tried.append(f"{url} -> HTTP {r.status_code}")
            if r.status_code == 200:
                blob = r.content
                print("RÚIAN:", url)
                break
        except Exception as e:  # noqa: BLE001
            tried.append(f"{url} -> {type(e).__name__}: {e}")
    if blob is None:
        raise RuntimeError("RÚIAN soubor se nepodařilo stáhnout: " + " | ".join(tried))
    zf = zipfile.ZipFile(io.BytesIO(blob))
    raw = zf.read(zf.namelist()[0])
    text = raw.decode("cp1250", errors="replace")
    rows = csv.reader(io.StringIO(text), delimiter=";", quotechar='"')
    header = next(rows)
    c_momc = find_col(header, "název", "momc")
    c_street = find_col(header, "název", "ulice")
    c_part = find_col(header, "název", "části obce")
    c_cd = find_col(header, "číslo domovní")
    c_co = find_col(header, "číslo orientační")
    c_znak = find_col(header, "znak")
    c_y = find_col(header, "souřadnice y")
    c_x = find_col(header, "souřadnice x")
    out, seen = [], set()
    for row in rows:
        if len(row) <= max(c_momc, c_y, c_x) or row[c_momc].strip() != MOMC_NAME:
            continue
        if not row[c_y].strip() or not row[c_x].strip():
            continue
        y, x = float(row[c_y].replace(",", ".")), float(row[c_x].replace(",", "."))
        lon, lat = tr.transform(y, x)
        if not (49.9 < lat < 50.3 and 14.4 < lon < 14.8):
            lon, lat = tr.transform(x, y)
            if not (49.9 < lat < 50.3 and 14.4 < lon < 14.8):
                raise RuntimeError("Souřadnice RÚIAN mimo Prahu, zkontroluj pořadí sloupců X/Y.")
        street = row[c_street].strip() or row[c_part].strip()
        cd = row[c_cd].strip()
        co = (row[c_co].strip() + row[c_znak].strip()) if row[c_co].strip() else ""
        key = (street, cd, co)
        if key in seen or not street or not cd:
            continue
        seen.add(key)
        out.append([street, cd, co, round(lat, 6), round(lon, 6)])
    if len(out) < 1000:
        raise RuntimeError(f"Podezřele málo adres ({len(out)}), data nepřepisuji.")
    out.sort(key=lambda a: (norm(a[0]), a[1]))
    return out


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    failed = False
    errors = []
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for name, fn, key in (("stations.json", build_stations, "stations"),
                          ("addresses.json", build_addresses, "addresses")):
        try:
            data = fn()
            write(name, data)
            meta[key] = {"count": len(data), "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
            print(f"OK {name}: {len(data)}")
        except Exception as e:  # noqa: BLE001
            failed = True
            errors.append(f"{name}: {type(e).__name__}: {e}")
            print(f"CHYBA {name}: {e}", file=sys.stderr)
    write("meta.json", meta)
    err_file = OUT / "last_error.txt"
    if errors:
        err_file.write_text("\n".join(errors)[:3000], encoding="utf-8")
    elif err_file.exists():
        err_file.unlink()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
