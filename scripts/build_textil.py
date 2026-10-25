"""Kontejnery na textil a obuv v Praze 9 a 14 a okolí – z OpenStreetMap (Overpass API).

Golemio (tříděný odpad města) textil nemá; kontejnery provozují charity a firmy bez společných
otevřených dat. OpenStreetMap plní dobrovolníci, takže data nemusí být úplná – aplikace to uvádí.
Sběrné dvory (recycling_type=centre) vynecháváme, jde jen o kontejnery na ulici.

Výstup docs/data/textil.json: {gen, ok, k: [[lat, lon, "adresa", "provozovatel", obuv 0/1]]}
Adresu bereme z OSM; když chybí, doplníme nejbližší adresní místo z RÚIAN (do 80 m).
"""
import datetime as dt
import json
import math
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
BBOX = (50.06, 14.44, 50.16, 14.66)
DOTAZ = """[out:json][timeout:90];
(node["amenity"="recycling"]["recycling:clothes"="yes"](%s,%s,%s,%s);
 way["amenity"="recycling"]["recycling:clothes"="yes"](%s,%s,%s,%s););
out center tags;""" % (BBOX * 2)
SERVERY = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def vzd(a, b, c, d):
    return math.hypot((a - c) * 111320, (b - d) * 111320 * math.cos(math.radians(a)))


def main():
    prev = {}
    try:
        prev = json.loads((DATA / "textil.json").read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pass
    el, chyba = None, ""
    for s in SERVERY:
        try:
            r = requests.post(s, data={"data": DOTAZ}, timeout=150, headers={"User-Agent": "pod-okny-bot (github.com/NamTNgo/praha14)"})
            r.raise_for_status()
            el = r.json().get("elements", [])
            break
        except Exception as e:   # noqa: BLE001
            chyba = str(e)
    if el is None:
        print("CHYBA Overpass:", chyba)
        if not prev:
            sys.exit(1)
        prev["ok"] = False
        (DATA / "textil.json").write_text(json.dumps(prev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return
    adr = [a for a in json.loads((DATA / "addresses.json").read_text(encoding="utf-8")) if a[3]]
    k = []
    for e in el:
        t = e.get("tags", {})
        if t.get("recycling_type") == "centre":
            continue
        lat, lon = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
        a = ""
        if t.get("addr:street") and t.get("addr:housenumber"):
            a = t["addr:street"] + " " + t["addr:housenumber"]
        else:
            best = None
            for x in adr:
                if abs(x[3] - lat) > 0.001 or abs(x[4] - lon) > 0.0015:
                    continue
                d = vzd(lat, lon, x[3], x[4])
                if d <= 80 and (best is None or d < best[0]):
                    best = (d, x)
            if best:
                x = best[1]
                a = "u " + x[0] + " " + str(x[1]) + ("/" + str(x[2]) if x[2] else "")
        op = (t.get("operator") or "").strip()
        k.append([round(lat, 6), round(lon, 6), a, op, 1 if t.get("recycling:shoes") == "yes" else 0])
    out = {"gen": dt.datetime.now(ZoneInfo("Europe/Prague")).isoformat(timespec="seconds"), "ok": True, "k": k}
    (DATA / "textil.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("kontejnerů na textil: %d (s adresou %d, s provozovatelem %d)" % (len(k), sum(1 for x in k if x[2]), sum(1 for x in k if x[3])))


if __name__ == "__main__":
    main()
