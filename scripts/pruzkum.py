import json, re, urllib.request
from pathlib import Path
UA = {"User-Agent": "Mozilla/5.0 (compatible; pod-okny-bot)", "Accept-Language": "cs-CZ"}
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return str(e), ""
out = {}
for u in ["https://www.praha9.cz/", "https://www.praha9.cz/rss.xml", "https://www.praha9.cz/aktuality", "https://www.praha9.cz/zpravy",
          "https://www.praha9.cz/aktuality/rss.xml", "https://www.praha9.cz/taxonomy/term/1/feed"]:
    st, h = get(u)
    out[u] = {"status": st, "len": len(h), "feeds": re.findall(r'href="([^"]*(?:rss|feed)[^"]*)"', h)[:30],
              "nadpisy": [re.sub(r"<[^>]+>|\s+", " ", x).strip() for x in re.findall(r"<(?:h2|h3|title)[^>]*>([\s\S]*?)</(?:h2|h3|title)>", h)][:40],
              "odkazy": sorted(set(re.findall(r'href="(/[a-z0-9\-/]+)"', h)))[:150] if u.endswith("cz/") else []}
Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
