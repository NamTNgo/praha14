import json, os, re, urllib.request, urllib.parse
from collections import Counter
from pathlib import Path
KEY = os.environ.get("GOLEMIO_API_KEY", "")
def get(q):
    req = urllib.request.Request("https://api.golemio.cz/v3/parking?" + urllib.parse.urlencode(q), headers={"X-Access-Token": KEY, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())
allf = []
off = 0
while True:
    j = get({"primarySource": "tsk_v2", "boundingBox": "50.16,14.44,50.06,14.66", "limit": 1000, "offset": off})
    f = j.get("features", j) if isinstance(j, dict) else j
    allf += f
    if len(f) < 1000: break
    off += 1000
props = [x.get("properties", x) for x in allf]
pref = Counter(re.split(r"[-;]", p.get("name") or "")[0] for p in props)
# úseky s centroidem v Praze 9 (zhruba Vysočany/Prosek/Střížkov)
v9 = [p for p in props if (p.get("centroid") or {}).get("coordinates") and 50.095 < p["centroid"]["coordinates"][1] < 50.135 and 14.47 < p["centroid"]["coordinates"][0] < 14.53]
out = {"celkem": len(props), "prefixy": pref.most_common(40), "v9_pocet": len(v9),
       "v9_ukazka": [[p.get("name"), p.get("filter"), p.get("valid_from"), (p.get("address") or {}).get("address_region") if isinstance(p.get("address"), dict) else None] for p in v9[:25]],
       "v9_prefixy": Counter(re.split(r"[-;]", p.get("name") or "")[0] for p in v9).most_common(20)}
Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
