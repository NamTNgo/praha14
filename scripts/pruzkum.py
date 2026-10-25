# vzhled webu molecula.cz – barvy, písma, screenshot
import re
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright
Path("diag").mkdir(exist_ok=True)
U = "https://www.molecula.cz/"
h = requests.get(U, timeout=30, headers={"User-Agent": "Mozilla/5.0"}).text
css = ""
for href in re.findall(r'href="([^"]+\.css[^"]*)"', h)[:10]:
    try: css += requests.get(requests.compat.urljoin(U, href), timeout=30).text
    except Exception: pass
css += "".join(re.findall(r"<style[^>]*>(.*?)</style>", h, re.S))
from collections import Counter
cols = Counter(c.lower() for c in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)", css))
fonts = Counter(re.findall(r"font-family:\s*([^;}]+)", css))
Path("diag/molecula.txt").write_text("BARVY\n" + "\n".join(f"{n} {c}" for c, n in cols.most_common(40)) + "\n\nPISMA\n" + "\n".join(f"{n} {f}" for f, n in fonts.most_common(10)), encoding="utf-8")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for w, hgt, n in ((390, 844, "m"), (1440, 900, "d")):
        p = b.new_page(viewport={"width": w, "height": hgt}); p.goto(U, wait_until="networkidle", timeout=60000); p.wait_for_timeout(1500)
        p.screenshot(path=f"diag/molecula_{n}.png", full_page=True)
    b.close()
