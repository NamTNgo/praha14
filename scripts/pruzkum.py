import json, urllib.request
from pathlib import Path
out = {}
for n in ["voda.json", "nehody.json"]:
    req = urllib.request.Request("https://ndic-proxy.moji-sousede.workers.dev/data/" + n, headers={"Origin": "https://namtngo.github.io", "User-Agent": "test"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
        out[n] = {"status": r.status, "cors": r.headers.get("Access-Control-Allow-Origin"), "gen": d.get("gen"), "klice": list(d)[:6]}
Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
