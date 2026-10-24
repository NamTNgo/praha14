import json, urllib.request
from pathlib import Path
U = "https://pod-okny-api.moji-sousede.workers.dev"
def r(path, body=None):
    req = urllib.request.Request(U + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "Origin": "https://namtngo.github.io", "User-Agent": "test"})
    try:
        with urllib.request.urlopen(req, timeout=30) as x:
            return x.status, x.read().decode(), x.headers.get("Access-Control-Allow-Origin")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), None
out = [r("/"), r("/umetaky", {"k": "voda:test", "d": "testtest01", "a": "ano"}), r("/umetaky", {"k": "voda:test", "d": "testtest02", "a": "ne"}),
       r("/umetaky?k=voda:test,el:x&d=testtest01"), r("/umetaky", {"k": "voda:test", "d": "testtest01", "a": "zrus"}),
       r("/umetaky", {"k": "voda:test", "d": "testtest02", "a": "zrus"}), r("/umetaky?k=voda:test")]
Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
