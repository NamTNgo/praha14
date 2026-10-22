"""Zóny placeného stání (ZPS) v Praze 9 a 14 + jejich rozšíření.

Zdroje
  Golemio /v3/parking?primarySource=tsk_v2 – úseky ZPS od TSK (barva zóny, platnost od, poloha)
  parking.praha.eu/cs/feed/ – aktuality o rozšíření zón (jen zprávy s Prahou 9/14 nebo jejich čtvrtěmi)
Klíč Golemia z proměnné GOLEMIO_API_KEY (GitHub Actions secret).

Výstup docs/data/zps.json:
  {gen, ok, useky: [[lat, lon, barva, "YYYY-MM-DD", "ulice", "P9-0123"]], nove: [{od, mc, ulice: [..], n}],
   zpravy: [{t, d, u}]}
  barva: b = modrá (jen rezidenti), v = fialová (smíšená), o = oranžová (krátkodobá)
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
G = "https://api.golemio.cz/v3/parking"
BARVY = {"blue": "b", "violet": "v", "orange": "o"}
NOVE_DNI = 60                              # rozšíření ukazujeme 60 dní po zavedení (a všechna budoucí)
CTVRTI = re.compile(r"Praha\s*9\b|Praha\s*14\b|Prosek|Střížkov|Vysočan|Libe[nň]|Hloubětín|Hrdlořez|Černý Most|Kyje|Hostavic|Lehovec|Jahodnic", re.I)
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def golemio(key, offset, bbox):
    q = {"primarySource": "tsk_v2", "boundingBox": bbox, "limit": 1000, "offset": offset}
    req = urllib.request.Request(G + "?" + urllib.parse.urlencode(q),
                                 headers={"X-Access-Token": key, "Accept": "application/json", "User-Agent": "pod-okny-bot"})
    with urllib.request.urlopen(req, timeout=90) as r:
        j = json.loads(r.read().decode("utf-8"))
    return j.get("features", j) if isinstance(j, dict) else j


def dlazdice():
    """API vrací nejvýš 2000 úseků seřazených podle názvu → území dělíme na menší čtverce."""
    s, w, j, v = 50.16, 14.44, 50.06, 14.66
    krok_la, krok_lo = 0.02, 0.04
    la = j
    while la < s:
        lo = w
        while lo < v:
            yield "%.3f,%.3f,%.3f,%.3f" % (min(la + krok_la, s), lo, la, min(lo + krok_lo, v))
            lo += krok_lo
        la += krok_la


def useky(key):
    out, vid = [], set()
    for bb in dlazdice():
        offset = 0
        while True:
            dav = golemio(key, offset, bb)
            for f in dav:
                p = f.get("properties", f)
                if p.get("id") not in vid:
                    vid.add(p.get("id"))
                    out.append(f)
            if len(dav) < 1000 or offset >= 1000:
                if len(dav) == 1000 and offset >= 1000:
                    log("  ! dlaždice %s má přes 2000 úseků, zmenšit krok" % bb)
                break
            offset += 1000
    vys = []
    for f in out:
        p = f.get("properties", f)
        jm = p.get("name") or ""
        m = re.match(r"(P(9|14)(?:\.\d+)?)-\d+", jm)        # „P9-0123“ i „P9.3-0123“ (podoblast)
        if not m or p.get("parking_policy") != "zone":
            continue
        c = (p.get("centroid") or {}).get("coordinates")
        if not c:
            continue
        vf = (p.get("valid_from") or "")[:10]
        if vf:   # platnost je v UTC (22:00 předchozího dne) → místní datum
            vf = (dt.datetime.fromisoformat(p["valid_from"].replace("Z", "+00:00")).astimezone(TZ)).strftime("%Y-%m-%d")
        ulice = jm.split(";", 1)[1].strip() if ";" in jm else ""
        ulice = re.sub(r"\s*\(.*?\)\s*$", "", ulice)
        vys.append([round(c[1], 6), round(c[0], 6), BARVY.get(p.get("filter"), "?"), vf, ulice, m.group(1)])
    log("úseků ZPS v Praze 9/14: %d (z %d v okolí)" % (len(vys), len(out)))
    return vys


def zpravy():
    req = urllib.request.Request("https://parking.praha.eu/cs/feed/", headers={"User-Agent": "pod-okny-bot"})
    with urllib.request.urlopen(req, timeout=40) as r:
        root = ET.fromstring(r.read())
    out = []
    for it in root.iter("item"):
        t = (it.findtext("title") or "").strip()
        popis = re.sub(r"<[^>]+>", " ", it.findtext("description") or "")
        if not CTVRTI.search(t + " " + popis):
            continue
        try:
            d = dt.datetime.strptime(it.findtext("pubDate")[:25].strip(), "%a, %d %b %Y %H:%M:%S").strftime("%Y-%m-%d")
        except Exception:   # noqa: BLE001
            d = ""
        if d and d < (NOW - dt.timedelta(days=90)).strftime("%Y-%m-%d"):
            continue
        out.append({"t": t, "d": d, "u": (it.findtext("link") or "").strip()})
    log("zpráv parking.praha.eu pro Prahu 9/14: %d" % len(out))
    return out[:8]


def main():
    key = os.environ.get("GOLEMIO_API_KEY")
    ok = True
    prev = {}
    try:
        prev = json.loads((DATA / "zps.json").read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pass
    try:
        if not key:
            raise RuntimeError("chybí GOLEMIO_API_KEY")
        u = useky(key)
    except Exception as e:   # noqa: BLE001
        ok = False
        log("CHYBA Golemio:", e)
        u = prev.get("useky", [])
    try:
        z = zpravy()
    except Exception as e:   # noqa: BLE001
        log("CHYBA parking.praha.eu:", e)
        z = prev.get("zpravy", [])

    hranice = (NOW - dt.timedelta(days=NOVE_DNI)).strftime("%Y-%m-%d")
    skup = defaultdict(lambda: {"ulice": [], "n": 0})
    for x in u:
        if x[3] and x[3] >= hranice:
            g = skup[(x[3], re.match(r"P(\d+)", x[5]).group(1))]
            g["n"] += 1
            if x[4] and x[4] not in g["ulice"]:
                g["ulice"].append(x[4])
    nove = [{"od": k[0], "mc": k[1], "ulice": v["ulice"], "n": v["n"]} for k, v in sorted(skup.items())]
    for n in nove:
        log("rozšíření od %s v Praze %s: %d úseků (%s)" % (n["od"], n["mc"], n["n"], ", ".join(n["ulice"][:6])))

    out = {"gen": NOW.isoformat(timespec="seconds"), "ok": ok, "useky": u, "nove": nove, "zpravy": z}
    (DATA / "zps.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "zps_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n".join(LOG))
    if not ok and not u:
        sys.exit(1)


if __name__ == "__main__":
    main()
