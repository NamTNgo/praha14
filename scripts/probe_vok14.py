#!/usr/bin/env python3
"""Sonda: najít a vypsat text aktuálních PDF harmonogramů VOK/BIO Prahy 14 -> docs/data/vok14_probe.txt."""
import os
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "vok14_probe.txt"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
STRANKY = [
    "https://www.praha14.cz/zivot-na-praze-14/velkoobjemove-kontejnery-3/",
    "https://www.praha14.cz/zivot-na-praze-14/velkoobjemove-kontejnery/",
    "https://www.praha14.cz/urad-mestske-casti/hledam-informaci/zivotni-prostredi/odpady/",
]


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read() if binary else r.read().decode("utf-8", "replace")


def pdftext(raw):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(raw)
        c = f.name
    try:
        return subprocess.run(["pdftotext", "-layout", c, "-"], capture_output=True, text=True, timeout=120).stdout
    finally:
        os.unlink(c)


rep = []
videno = set()
for s in STRANKY:
    try:
        h = fetch(s)
    except Exception as e:
        rep.append("STRÁNKA %s nedostupná: %s" % (s, e))
        continue
    pdfs = re.findall(r'href="([^"]+\.pdf[^"]*)"', h, re.I)
    rep.append("STRÁNKA %s -> %d PDF" % (s, len(pdfs)))
    for p in pdfs:
        full = urllib.parse.urljoin(s, p)
        low = full.lower()
        if full in videno or not re.search(r"vok|velkoobjem|bio|kontejner|objemn", low):
            continue
        videno.add(full)
        try:
            t = pdftext(fetch(full, binary=True))
        except Exception as e:
            rep.append("  PDF %s nešlo (%s)" % (full, e))
            continue
        rep.append("\n===== %s =====\n%s" % (full, t[:3500]))

OUT.write_text("\n".join(rep), encoding="utf-8")
print("\n".join(r.splitlines()[0] for r in rep if r.strip())[:2000])
