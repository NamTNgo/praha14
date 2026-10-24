import json, time, urllib.request
from pathlib import Path
U = "https://pod-okny-api.moji-sousede.workers.dev"
def r(path, body=None):
    req = urllib.request.Request(U + path, data=json.dumps(body).encode() if body else None, headers={"Content-Type": "application/json", "User-Agent": "test"})
    try:
        with urllib.request.urlopen(req, timeout=30) as x: return x.status, x.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
t = int(time.time() * 1000)
out = [r("/udalost", {"typ": "hlaseni", "part": "TestCtvrt"}), r("/udalost", {"typ": "spatne", "part": "TestCtvrt"}),
       r("/ctvrt?part=TestCtvrt&od=%d&do=%d" % (t - 3600000, t + 3600000))]
Path("diag").mkdir(exist_ok=True); Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
