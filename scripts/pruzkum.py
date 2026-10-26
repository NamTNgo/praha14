# ulice, zeleň, voda a koleje v Praze 9 a 14 z OpenStreetMap (pro podkladovou mapu hlavičky)
import json
from pathlib import Path
import requests
Path("diag").mkdir(exist_ok=True)
B = "50.07,14.45,50.15,14.65"
QS = {
 "ulice": f'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service)$"]({B});way["railway"="rail"]({B});way["waterway"~"^(river|stream)$"]({B});',
 "zelen": f'way["leisure"="park"]({B});way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|allotments)$"]({B});way["natural"~"^(wood|water)$"]({B});',
 "domy": f'way["building"]({B});',
}
el = []; log = {}
import time
for k, body in QS.items():
    for pokus in range(3):
        try:
            r = requests.post("https://overpass-api.de/api/interpreter", data={"data": "[out:json][timeout:240];(" + body + ");out geom;"}, timeout=300, headers={"User-Agent": "pod-okny-bot (github.com/NamTNgo/praha14)"})
            j = r.json(); el += j.get("elements", []); log[k] = [r.status_code, len(j.get("elements", []))]; break
        except Exception as e:
            log[k] = ["chyba", str(e)[:200]]; time.sleep(20)
Path("diag/mapa_log.txt").write_text(json.dumps(log))
def kind(t):
    h = t.get("highway")
    if h in ("motorway", "trunk", "primary"): return "h1"
    if h in ("secondary", "tertiary"): return "h2"
    if h == "service": return "h4"
    if h: return "h3"
    if t.get("railway"): return "rail"
    if t.get("waterway"): return "river"
    if t.get("natural") == "water": return "water"
    if t.get("building"): return "bld"
    return "green"
out = []
for e in el:
    g = e.get("geometry") or []
    if len(g) < 2: continue
    out.append([kind(e.get("tags", {}))] + [v for p in g for v in (round(p["lat"] * 1e5) - 5000000, round(p["lon"] * 1e5) - 1400000)])
Path("diag/mapa.json").write_text(json.dumps(out, separators=(",", ":")))
from collections import Counter
Path("diag/mapa.txt").write_text(json.dumps(Counter(o[0] for o in out)) + " " + str(len(json.dumps(out))))
