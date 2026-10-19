#!/usr/bin/env python3
"""Automatická aktualizace VOK a BIO VOK pro Prahu 14 -> docs/data/vok.json.

Na stránce Odpady Prahy 14 najde čtyři aktuální PDF (VOK a BIO VOK, systém HMP
i systém MČ), rozparsuje je a každému stanovišti dopočítá souřadnice z RÚIAN.

Pojistka jako u Prahy 9: když se parsování nepovede (málo stanovišť, nízká
úspěšnost geokódování), docs/data/vok.json se NEPŘEPÍŠE a skript skončí chybou.
Čistý text PDF se ukládá do docs/data/vok14_report.txt.
"""
import datetime as dt
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
ODPADY = "https://www.praha14.cz/urad-mestske-casti/hledam-informaci/zivotni-prostredi/odpady/"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
LOG = []
ROK = dt.date.today().year
ALIAS = {"genjanouska": "generalajanouska", "avalenty": "arnostavalenty",
         "namzdenkybraunerove": "namestizdenkybraunerove", "manzdostalovych": "manzeludostalovych"}


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def fetch(url, binary=False, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read() if binary else r.read().decode("utf-8", "replace")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s.]", "", s)


def hav(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))


def pdftext(raw):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(raw)
        c = f.name
    try:
        return subprocess.run(["pdftotext", "-layout", c, "-"], capture_output=True, text=True, timeout=120).stdout
    finally:
        os.unlink(c)


# ---- nalezení čtyř PDF ----
def najdi_pdf(html):
    found = {}
    for href in re.findall(r'href="([^"]+\.pdf[^"]*)"', html, re.I):
        n = norm(href)
        if "bio" in n and "hmp" in n:
            found.setdefault(("bio", "hmp"), href)
        elif "bio" in n and ("mc" in n or "p14" in n):
            found.setdefault(("bio", "mc"), href)
        elif "vok" in n and "hmp" in n:
            found.setdefault(("vok", "hmp"), href)
        elif "vok" in n and ("mc" in n or "p14" in n):
            found.setdefault(("vok", "mc"), href)
    return {k: urllib.parse.urljoin(ODPADY, v) for k, v in found.items()}


# ---- datum a čas ----
def datum(d, m, y):
    y = int(y)
    if y < ROK or y > ROK + 1:          # překlepy v harmonogramu (2025/2029…) srovnáme
        y = ROK if int(m) >= dt.date.today().month else ROK + 1
    try:
        return "%04d-%02d-%02d" % (y, int(m), int(d))
    except ValueError:
        return None


def cas(a, b):
    def h(x):
        x = x.replace(".", ":")
        hh, mm = x.split(":")
        return "%d:%s" % (int(hh), mm)
    return h(a) + "–" + h(b)


ROW_VOK = re.compile(r"^\s*\d+\s+(.+?)\s+(?:PO|ÚT|UT|ST|ČT|CT|PÁ|PA|SO|NE)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})"
                     r"(?:\s+(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2}))?\s*$", re.I)
ROW_BIO = re.compile(r"^\s*\d+\s+(.+?)\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2})[:.](\d{2})\s+(\d{1,2})[:.](\d{2})\s*$")


def parse(typ, layout):
    out = []
    for ln in layout.splitlines():
        if typ == "vok":
            m = ROW_VOK.search(ln)
            if not m:
                continue
            d = datum(m.group(2), m.group(3), m.group(4))
            t = cas(m.group(5) + ":" + m.group(6), m.group(7) + ":" + m.group(8)) if m.group(5) else ""
        else:
            m = ROW_BIO.search(ln)
            if not m:
                continue
            d = datum(m.group(2), m.group(3), m.group(4))
            t = cas(m.group(5) + ":" + m.group(6), m.group(7) + ":" + m.group(8))
        if d:
            out.append((d, m.group(1).strip(), t))
    return out


# ---- geokódování (shodné s dřívějším build_vok.py, zná zkratky Prahy 14) ----
def geokoder(by):
    def street_pts(name):
        n = norm(name)
        n = ALIAS.get(n, n)
        n = n.replace("nam", "namesti") if n.endswith("nam") else n
        return by.get(n)

    def part(p):
        p = re.sub(r"\bu obch\. střediska|\bu separace|\b(u|proti|naproti)\s+(?=č\. ?p\.)", " ", p)
        p = re.sub(r"č\. ?p\.", " ", p)
        p = re.sub(r"\b(u|proti|naproti)?\s*č\.\s*\d+[\w/]*", " ", p)
        p = re.sub(r"\([^)]*\)|\s[–-]\s.*$", " ", p)
        p = re.sub(r"\s+", " ", p).strip()
        m = re.match(r"^(.*?)\s+(\d+)(?:/(\d+))?$", p)
        cd = co = None
        if m and not p.startswith("9."):
            p, cd, co = m.group(1).strip(), m.group(2), m.group(3)
        pts = street_pts(p)
        if not pts:
            return None
        if cd:
            hit = [a for a in pts if a[1] == cd and (not co or a[2] == co)] or [a for a in pts if a[1] == cd]
            if hit:
                return [(a[3], a[4]) for a in hit]
        return [(a[3], a[4]) for a in pts]

    def geocode(place):
        parts = re.split(r"\s+x\s+|/(?=\D)", place)
        pts = [part(p) for p in parts]
        ok = [p for p in pts if p]
        if not ok:
            return None
        if len(ok) >= 2:
            b = min(((hav(p, q), p, q) for p in ok[0] for q in ok[1]), key=lambda t: t[0])
            return (b[1][0] + b[2][0]) / 2, (b[1][1] + b[2][1]) / 2
        return sum(p[0] for p in ok[0]) / len(ok[0]), sum(p[1] for p in ok[0]) / len(ok[0])

    return geocode


def label(place):
    n = re.sub(r"/(?=\D)", " x ", place)
    for a, b in (("gen.Janouška", "Generála Janouška"), ("A.Valenty", "Arnošta Valenty"),
                 ("Kpt.Stránského", "Kpt. Stránského"), ("9.května", "9. května"),
                 ("Manž.Dostálových", "Manželů Dostálových"), ("Nám. Zdenky", "náměstí Zdenky")):
        n = n.replace(a, b)
    return n


def main():
    by = {}
    for a in json.loads((DATA / "addresses.json").read_text(encoding="utf-8")):
        by.setdefault(norm(a[0]), []).append(a)
    geocode = geokoder(by)

    pdfs = najdi_pdf(fetch(ODPADY))
    log("nalezené PDF:", {("%s/%s" % k): v.rsplit("/", 1)[-1] for k, v in pdfs.items()})

    out, report = [], []
    pocet = {}
    for (typ, src), url in pdfs.items():
        try:
            layout = pdftext(fetch(url, binary=True))
        except Exception as e:
            log("%s/%s: PDF nedostupné (%s)" % (typ, src, e)); continue
        report.append("===== %s/%s %s =====\n%s" % (typ, src, url, layout[:2000]))
        syrove = parse(typ, layout)
        geo = miss = 0
        for d, place, h in syrove:
            ll = geocode(place)
            if ll:
                out.append({"t": typ, "n": label(place), "d": d, "h": h, "lat": round(ll[0], 5), "lon": round(ll[1], 5)})
                geo += 1
            else:
                miss += 1
        pocet[(typ, src)] = (len(syrove), geo)
        log("%s/%s: %d stanovišť, %d geokódováno, %d bez souřadnic" % (typ, src, len(syrove), geo, miss))

    (DATA / "vok14_report.txt").write_text("\n\n".join(report) + "\n\n" + "\n".join(LOG), encoding="utf-8")

    # pojistka: dohromady rozumný počet a slušná úspěšnost geokódování
    cel = sum(n for n, _ in pocet.values())
    geo = sum(g for _, g in pocet.values())
    if cel < 20 or geo < cel * 0.6:
        print("\n".join(LOG))
        sys.exit("VOK Praha 14 se nepodařilo spolehlivě zpracovat – vok.json ponechán beze změny.")

    out.sort(key=lambda r: (r["d"], r["t"]))
    (DATA / "vok.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
