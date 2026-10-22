"""Jednorázový průzkum zdrojů z GitHub runneru (výsledek jde do větve „pruzkum“, ne do main)."""
import json
import os
import urllib.request
from pathlib import Path

KEY = os.environ.get("GOLEMIO_API_KEY", "")
out = {}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pod-okny-bot", "X-Access-Token": KEY, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]
    except Exception as e:   # noqa: BLE001
        return 0, str(e)


G = "https://api.golemio.cz"
for path in ["/v3/parking?latlng=50.1059,14.5406&range=1500&limit=5",
             "/v3/parking?latlng=50.1059,14.5406&range=1500&limit=5&category=zone",
             "/v3/parking-sources", "/v3/parking/sources",
             "/v3/parking-tariffs?limit=3", "/v2/parkingzones?limit=3", "/v2/parking-zones?limit=3",
             "/v3/parking?source=tsk_v2&limit=3", "/v3/parking?primarySource=tsk_v2&limit=3",
             "/v3/parking?latlng=50.1269,14.4900&range=800&limit=5"]:
    s, t = get(G + path)
    try:
        j = json.loads(t)
        if isinstance(j, dict) and "features" in j:
            prev = [{k: (v if not isinstance(v, (list, dict)) else "…") for k, v in (f.get("properties") or {}).items()} for f in j["features"][:3]]
            out[path] = {"status": s, "pocet": len(j["features"]), "ukazka": prev}
        elif isinstance(j, list):
            out[path] = {"status": s, "pocet": len(j), "ukazka": [{k: (v if not isinstance(v, (list, dict)) else "…") for k, v in x.items()} if isinstance(x, dict) else x for x in j[:4]]}
        else:
            out[path] = {"status": s, "ukazka": str(j)[:600]}
    except Exception:   # noqa: BLE001
        out[path] = {"status": s, "text": t[:300]}

Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
