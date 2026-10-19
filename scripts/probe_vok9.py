#!/usr/bin/env python3
"""Jednorázová sonda: čistý text harmonogramu VOK Prahy 9 -> docs/data/vok9_probe.txt."""
import subprocess
import tempfile
import os
import urllib.request
from pathlib import Path

URL = "https://www.praha9.cz/sites/default/files/downloads/2026/08/VOK_2026_09-12_2026_01-02_2027.pdf"
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "vok9_probe.txt"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"

raw = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=120).read()
with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
    f.write(raw)
    cesta = f.name
try:
    layout = subprocess.run(["pdftotext", "-layout", cesta, "-"], capture_output=True, text=True, timeout=120).stdout
    plain = subprocess.run(["pdftotext", cesta, "-"], capture_output=True, text=True, timeout=120).stdout
finally:
    os.unlink(cesta)
OUT.write_text("=== -layout ===\n" + layout + "\n\n=== plain ===\n" + plain, encoding="utf-8")
print("staženo %d B, layout %d znaků, plain %d znaků" % (len(raw), len(layout), len(plain)))
