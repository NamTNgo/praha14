#!/usr/bin/env python3
"""Odstávky a havárie pitné vody (Pražské vodovody a kanalizace) -> docs/data/voda.json.

Zdroj: veřejná mapa událostí PVK (mapy.veoliavoda.cz/udalosti), která čte WFS:
  ppu_pu_om  – zasažená místa: S = jednotlivé adresy (bod), P = obrys oblasti
               (polygon/čára), C = střed oblasti; vše se stejným „id“ události
  nzv_pvk    – místa náhradního zásobování (cisterny, vodní vaky)

Bereme jen události PVK, které zasahují do Prahy 9 a 14 (obdélník kolem adres
z addresses.json) a ještě neskončily. Když zdroj selže, zůstanou data z minulého
běhu a „ok“ je false – aplikace pak upozorní, že stav nemusí být aktuální.
"""
import datetime as dt
import json
import re
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
WFS = "https://mapy.veoliavoda.cz/geom/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=%s&outputFormat=json"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def stahni(typ):
    req = urllib.request.Request(WFS % typ, headers={"User-Agent": UA})
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:   # noqa: BLE001
            last = e
    raise last


def cas(s):
    """„21.10.2026 22:00“ -> „2026-10-21T22:00“ (místní čas)."""
    m = re.match(r"\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?", s or "")
    if not m:
        return None
    d, mo, y, h, mi = m.groups()
    return "%04d-%02d-%02dT%02d:%02d" % (int(y), int(mo), int(d), int(h or 0), int(mi or 0))


def okno():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    la = [a[3] for a in adr if a[3]]
    lo = [a[4] for a in adr if a[4]]
    m = 0.004   # ~400 m rezerva kolem okrajových adres
    return min(la) - m, max(la) + m, min(lo) - m, max(lo) + m


def v_okne(lat, lon, o):
    return o[0] <= lat <= o[1] and o[2] <= lon <= o[3]


def body_geom(g):
    """Všechny body geometrie jako (lat, lon)."""
    t, c = g.get("type"), g.get("coordinates")
    if t == "Point":
        return [(c[1], c[0])]
    if t in ("LineString", "MultiPoint"):
        return [(p[1], p[0]) for p in c]
    if t in ("Polygon", "MultiLineString"):
        return [(p[1], p[0]) for r in c for p in r]
    if t == "MultiPolygon":
        return [(p[1], p[0]) for poly in c for r in poly for p in r]
    return []


def zjednodus(pts, n=60):
    if len(pts) <= n:
        return pts
    k = len(pts) / n
    return [pts[int(i * k)] for i in range(n)] + [pts[-1]]


def main():
    out_p = DATA / "voda.json"
    try:
        pred = json.loads(out_p.read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pred = {}
    o = okno()
    try:
        ppu = stahni("ppu_pu_om")
        nzv = stahni("nzv_pvk")
    except Exception as e:   # noqa: BLE001
        log("CHYBA zdroje PVK:", e)
        pred.update({"ok": False, "chyba": str(e)[:200], "pokus": NOW.isoformat(timespec="minutes")})
        out_p.write_text(json.dumps(pred, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (DATA / "voda_report.txt").write_text("\n".join(LOG), encoding="utf-8")
        sys.exit(1)

    ud = {}
    for f in ppu.get("features", []):
        p = f.get("properties") or {}
        if p.get("zdroj") != "PVK" or not f.get("geometry"):
            continue
        u = ud.setdefault(p["id"], {"id": p["id"], "typ": "probiha" if p.get("typ") == "Prob" else "planovana",
                                    "od": cas(p.get("datum_zahajeni")), "do": cas(p.get("datum_ukonceni")),
                                    "nz": bool(p.get("nzasobovani")), "pocet": p.get("zdroj_pocet") or 0,
                                    "adresy": [], "obrys": [], "stred": None, "_v": False})
        pts = body_geom(f["geometry"])
        if any(v_okne(la, lo, o) for la, lo in pts):
            u["_v"] = True
        fmt = p.get("format")
        if fmt == "S" and pts:
            u["adresy"].append([round(pts[0][0], 6), round(pts[0][1], 6), (p.get("adresa") or "").replace(", Praha", "").strip()])
        elif fmt == "P" and f["geometry"]["type"] in ("Polygon", "MultiPolygon"):
            ring = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"][0][0]
            u["obrys"].append([[round(c[1], 6), round(c[0], 6)] for c in zjednodus(ring)])
        elif fmt == "C" and pts:
            u["stred"] = [round(pts[0][0], 6), round(pts[0][1], 6)]

    nyni = NOW.strftime("%Y-%m-%dT%H:%M")
    vys = []
    for u in ud.values():
        if not u.pop("_v"):
            continue
        # skončené pryč; „probíhá“ po plánovaném konci necháme ještě 12 h (PVK ji zatím neuzavřela)
        if u["do"] and u["do"] < nyni and not (u["typ"] == "probiha" and u["do"] >= (NOW - dt.timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M")):
            continue
        if not u["stred"]:
            pts = [(a[0], a[1]) for a in u["adresy"]] or [tuple(p) for r in u["obrys"] for p in r]
            if pts:
                u["stred"] = [round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6)]
        vys.append(u)
    vys.sort(key=lambda u: (u["od"] or "", u["id"]))

    cis = []
    for f in nzv.get("features", []):
        p = f.get("properties") or {}
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lon, lat = g["coordinates"][:2]
        if v_okne(lat, lon, o):
            cis.append({"lat": round(lat, 6), "lon": round(lon, 6), "a": re.sub(r"^P\d+,\s*", "", (p.get("adresa") or "").strip()),
                        "typ": p.get("typ_nzv") or "", "od": (p.get("dat_inst") or "")[:16].replace(" ", "T")})

    data = {"gen": NOW.isoformat(timespec="minutes"), "ok": True, "udalosti": vys, "cisterny": cis}
    # beze změny nepřepisovat (běží každých 15 min) – jen jednou za 2 h obnovit „gen“, ať aplikace ví, že zdroj žije
    stejne = {k: pred.get(k) for k in ("ok", "udalosti", "cisterny")} == {k: data[k] for k in ("ok", "udalosti", "cisterny")}
    try:
        cerstve = NOW - dt.datetime.fromisoformat(pred.get("gen")) < dt.timedelta(hours=2)
    except Exception:   # noqa: BLE001
        cerstve = False
    if stejne and cerstve:
        print("beze změny")
        return
    out_p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("událostí PVK celkem: %d, v Praze 9/14: %d (probíhá %d, plánované %d), náhradních zásobování: %d"
        % (len(ud), len(vys), sum(u["typ"] == "probiha" for u in vys), sum(u["typ"] == "planovana" for u in vys), len(cis)))
    for u in vys:
        log("  %s %s – %s  %s adres  %s" % (u["typ"], u["od"], u["do"], len(u["adresy"]), (u["adresy"][0][2] if u["adresy"] else "")))
    (DATA / "voda_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
