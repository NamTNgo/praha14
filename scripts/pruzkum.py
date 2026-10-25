# jaké druhy kontejnerů vrací Golemio v okolí Prahy 9 a 14 (hledáme textil)
import json, os
from collections import Counter
from pathlib import Path
import requests
Path("diag").mkdir(exist_ok=True)
r = requests.get("https://api.golemio.cz/v2/sortedwastestations", headers={"X-Access-Token": os.environ["GOLEMIO_API_KEY"]},
                 params={"latlng": "50.1050,14.5350", "range": 8000, "limit": 10000}, timeout=90)
f = r.json().get("features", [])
typy, pristup, ukazka = Counter(), Counter(), []
for x in f:
    p = x["properties"]
    for c in p.get("containers", []):
        d = (c.get("trash_type") or {}).get("description", "")
        typy[d] += 1
        pristup[(d, (p.get("accessibility") or {}).get("description"))] += 1
        if "extil" in d and len(ukazka) < 5:
            ukazka.append({"name": p.get("name"), "acc": p.get("accessibility"), "c": c})
Path("diag/pruzkum.txt").write_text(json.dumps({"stanovist": len(f), "typy": typy.most_common(), "pristup": [[list(k), v] for k, v in pristup.most_common()], "textil": ukazka}, ensure_ascii=False, indent=1), encoding="utf-8")
