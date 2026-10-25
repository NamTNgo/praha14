# kontejnery na textil v OpenStreetMap (recycling:clothes=yes) v okolí Prahy 9 a 14
import json
from pathlib import Path
import requests
Path("diag").mkdir(exist_ok=True)
q = """[out:json][timeout:60];
(node["amenity"="recycling"]["recycling:clothes"="yes"](50.06,14.44,50.16,14.66);
 way["amenity"="recycling"]["recycling:clothes"="yes"](50.06,14.44,50.16,14.66););
out center tags;"""
r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, timeout=120, headers={"User-Agent": "pod-okny-bot (github.com/NamTNgo/praha14)"})
el = r.json().get("elements", [])
ops = {}
for e in el:
    o = e.get("tags", {}).get("operator", "?"); ops[o] = ops.get(o, 0) + 1
Path("diag/pruzkum.txt").write_text(json.dumps({"pocet": len(el), "provozovatele": ops, "ukazka": [e.get("tags") for e in el[:8]], "check_date": sorted({e.get("tags", {}).get("check_date", "") for e in el})[-10:]}, ensure_ascii=False, indent=1), encoding="utf-8")
