# jak dopravniinfo.gov.cz zpracovává show-point (hledáme parametr pro přiblížení)
import re, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
Path("diag").mkdir(exist_ok=True)
out = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 390, "height": 844})
    js = []
    p.on("response", lambda r: js.append(r.url) if r.url.endswith(".js") or ".js?" in r.url else None)
    p.goto("https://dopravniinfo.gov.cz/Praha?do=show-point&x=-737375&y=-1042750", wait_until="networkidle"); p.wait_for_timeout(5000)
    out.append("URL po načtení: " + p.url)
    out.append("JS: " + " ".join(js[:30]))
    p.screenshot(path="diag/a_vychozi.png")
    for u in js:
        if "dopravniinfo" not in u: continue
        try:
            t = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("utf-8", "replace")
        except Exception as e:
            out.append("chyba %s %s" % (u, e)); continue
        for m in re.finditer(r"show-point|showPoint|zoom|scale", t):
            if "show" in m.group(0).lower():
                out.append("%s: …%s…" % (u.rsplit("/", 1)[-1][:40], t[max(0, m.start() - 300):m.end() + 400].replace("\n", " ")))
    for q in ["&zoom=19", "&z=19", "&scale=500", "&level=19"]:
        p.goto("https://dopravniinfo.gov.cz/Praha?do=show-point&x=-737375&y=-1042750" + q, wait_until="networkidle"); p.wait_for_timeout(4000)
        p.screenshot(path="diag/b%s.png" % re.sub(r"\W", "_", q))
    b.close()
Path("diag/pruzkum.txt").write_text("\n\n".join(out)[:60000], encoding="utf-8")
