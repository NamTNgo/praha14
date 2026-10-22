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
for path in ["/v3/parking?primarySource=tsk_v2&boundingBox=50.15,14.45,50.07,14.65&limit=3",
             "/v3/parking?primarySource=tsk_v2&boundingBox=50.15,14.45,50.07,14.65&limit=10000&offset=0",
             "/v3/parking?primarySource=tsk_v2&limit=2&offset=20000"]:
    s, t = get(G + path)
    try:
        j = json.loads(t)
        feats = j["features"] if isinstance(j, dict) and "features" in j else j
        if isinstance(feats, list):
            props = [f.get("properties", f) for f in feats]
            from collections import Counter
            out[path] = {"status": s, "pocet": len(props),
                         "filtry": Counter(str(p.get("filter")) for p in props).most_common(),
                         "politika": Counter(str(p.get("parking_policy")) for p in props).most_common(),
                         "valid_from_max": sorted([str(p.get("valid_from")) for p in props])[-8:],
                         "ukazka": props[:2], "geom": feats[0].get("geometry", {}).get("type") if feats and isinstance(feats[0], dict) else None}
        else:
            out[path] = {"status": s, "ukazka": str(j)[:800]}
    except Exception as e:   # noqa: BLE001
        out[path] = {"status": s, "text": t[:500], "e": str(e)}

Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
