# ověření měření návštěvnosti na API
import json
from pathlib import Path
import requests
Path("diag").mkdir(exist_ok=True)
U = "https://pod-okny-api.moji-sousede.workers.dev"
H = {"Origin": "https://namtngo.github.io", "Content-Type": "text/plain"}
out = {}
r = requests.post(U + "/m", data=json.dumps({"co": "v:test-overeni", "mc": "-"}), headers=H, timeout=20); out["post"] = [r.status_code, r.text, r.headers.get("Access-Control-Allow-Origin")]
r = requests.post(U + "/m", data=json.dumps({"co": "spatne", "mc": "-"}), headers=H, timeout=20); out["post_spatne"] = [r.status_code, r.text]
r = requests.get(U + "/statistiky?dni=2", timeout=20); out["stat"] = [r.status_code, r.text[:500]]
Path("diag/mereni.txt").write_text(json.dumps(out, ensure_ascii=False, indent=1))
