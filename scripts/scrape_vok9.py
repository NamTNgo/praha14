#!/usr/bin/env python3
"""Automatická aktualizace VOK a BIO VOK pro Prahu 9 -> docs/data/vok9.json.

Na stránce Životní prostředí Prahy 9 najde aktuální články s harmonogramy
velkoobjemového odpadu a bioodpadu, z nich PDF, rozparsuje je a každému
stanovišti dopočítá souřadnice přes adresy z RÚIAN.

Pojistka: PDF úřadu může kdykoli změnit podobu. Když se parsování nepovede
(málo stanovišť, neprojde kontrolní součet, nízká úspěšnost geokódování),
docs/data/vok9.json se NEPŘEPÍŠE – zůstanou poslední funkční data a skript
skončí chybou, ať se o tom dozvíš z GitHubu. Čistý text obou PDF se vždy
uloží do docs/data/vok9_report.txt pro kontrolu.
"""
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
BASE = "https://www.praha9.cz"
ZP = BASE + "/urad-a-samosprava/zivotni-prostredi"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
LOG = []
DNY = "Po|Út|St|Čt|Pá|So|Ne"


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def fetch(url, binary=False, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return raw if binary else raw.decode("utf-8", "replace")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s.]", "", s)


def hav(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))


# ---- hledání článků a PDF ----
def najdi_clanek(html, slug_keys):
    """Najde odkaz na článek podle slugu v URL; z víc ročníků vezme ten nejnovější."""
    kand = []
    for href in re.findall(r'href="([^"]+)"', html):
        h = href.lower()
        if all(k in h for k in slug_keys):
            roky = re.findall(r"20\d{2}", h)
            kand.append((max(int(r) for r in roky) if roky else 0, urllib.parse.urljoin(BASE, href)))
    if not kand:
        return None
    return sorted(kand, reverse=True)[0][1]


def pdf_z_clanku(url):
    h = fetch(url)
    pdfs = re.findall(r'href="([^"]+\.pdf[^"]*)"', h, re.I)
    return urllib.parse.urljoin(url, pdfs[0]) if pdfs else None


def pdftext(raw):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(raw)
        cesta = f.name
    try:
        return subprocess.run(["pdftotext", "-layout", cesta, "-"], capture_output=True, text=True, timeout=120).stdout
    finally:
        os.unlink(cesta)


# ---- parsování harmonogramu VOK (sloupec „počet VOK" umožní spárování) ----
def rok_z_textu(t):
    m = re.search(r"(\d{4})", t)
    return int(m.group(1)) if m else 2026


def parse_vok(layout):
    rok = rok_z_textu(layout)
    date_re = re.compile(r"(?:%s)\s+(\d{1,2})\.(\d{1,2})\.\s+(\d+)\b" % DNY)
    stop_re = re.compile(r"(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})\s+(\S.*?)\s*$")
    stops, markers = [], []
    for ln in layout.splitlines():
        sm = stop_re.search(ln)
        dm = date_re.search(ln)
        if dm:
            markers.append((int(dm.group(1)), int(dm.group(2)), int(dm.group(3))))
        if sm:
            h = "%d:%s–%d:%s" % (int(sm.group(1)), sm.group(2), int(sm.group(3)), sm.group(4))
            stops.append((h, sm.group(5).strip()))
    if sum(c for _, _, c in markers) != len(stops):
        log("  VOK: kontrolní součet nesedí (markerů %d, součet %d, stopů %d)"
            % (len(markers), sum(c for _, _, c in markers), len(stops)))
        return []
    out, idx = [], 0
    for day, mon, cnt in markers:
        yr = rok if mon >= 9 else rok + 1
        for h, place in stops[idx:idx + cnt]:
            out.append(("%04d-%02d-%02d" % (yr, mon, day), place, h))
        idx += cnt
    return out


# ---- parsování BIO: hlavička „Ne 25. října 2026 – 9.00-12.00 hod", pod ní místa ----
MESICE = {"ledna": 1, "unora": 2, "brezna": 3, "dubna": 4, "kvetna": 5, "cervna": 6,
          "cervence": 7, "srpna": 8, "zari": 9, "rijna": 10, "listopadu": 11, "prosince": 12}


def parse_bio(layout):
    hdr = re.compile(r"(\d{1,2})\.\s*([A-Za-zěščřžýáíéúůóťďňĚŠČŘŽÝÁÍÉÚŮÓŤĎŇ]+)\s*(\d{4})"
                     r"\s*[–-]\s*(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})")
    out, cur, cas = [], None, "9:00–12:00"
    for ln in layout.splitlines():
        s = ln.strip()
        if not s:
            cur = None
            continue
        m = hdr.search(s)
        if m:
            mo = MESICE.get(norm(m.group(2)))
            if mo:
                cur = "%04d-%02d-%02d" % (int(m.group(3)), mo, int(m.group(1)))
                cas = "%d:%s–%d:%s" % (int(m.group(4)), m.group(5), int(m.group(6)), m.group(7))
            else:
                cur = None
            continue
        # řádek s místem (ne nadpis, ne informační text)
        if cur and not re.search(r"bioodpad|sber|pristaven|pridelen|hod\b|harmonogram|sluzb|praz", norm(s)):
            out.append((cur, s, cas))
    return out


# ---- geokódování přes RÚIAN (shodné s build_vok.py) ----
def nacti_index():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    by = {}
    for a in adr:
        by.setdefault(norm(a[0]), []).append(a)
    return by


def geokoder(by):
    def street_pts(name):
        return by.get(norm(name))

    def part(p):
        p = re.sub(r"\bu obch\. střediska|\bu separace|\b(u|proti|naproti)\s+(?=č\. ?p\.)", " ", p)
        p = re.sub(r"č\. ?p\.", " ", p)
        p = re.sub(r"\b(u|proti|naproti)?\s*č\.\s*\d+[\w/]*", " ", p)
        p = re.sub(r"\([^)]*\)|\s[–-]\s.*$", " ", p)      # závorky a dovětky „ - ..."
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
    return re.sub(r"/(?=\D)", " x ", place).strip()


def main():
    by = nacti_index()
    geocode = geokoder(by)
    zp = fetch(ZP)
    vok_clanek = najdi_clanek(zp, ["harmonogram", "velkoobjemovy-odpad"]) or najdi_clanek(zp, ["harmonogram", "velkoobjemov"])
    bio_clanek = najdi_clanek(zp, ["harmonogram", "bioodpad"]) or najdi_clanek(zp, ["harmonogram", "bio-odpad"])
    log("VOK článek:", vok_clanek)
    log("BIO článek:", bio_clanek)

    report = []
    vysledek = {"vok": None, "bio": None}
    for klic, clanek, parser in (("vok", vok_clanek, parse_vok), ("bio", bio_clanek, parse_bio)):
        if not clanek:
            log("%s: článek nenalezen" % klic)
            continue
        try:
            pdf = pdf_z_clanku(clanek)
            layout = pdftext(fetch(pdf, binary=True))
        except Exception as e:
            log("%s: PDF nedostupné (%s)" % (klic, e))
            continue
        report.append("=== %s === %s\n%s" % (klic, pdf, layout))
        syrove = parser(layout)
        geo, miss = [], []
        for d, place, h in syrove:
            ll = geocode(place)
            if ll:
                geo.append({"t": klic, "n": label(place), "d": d, "h": h, "lat": round(ll[0], 5), "lon": round(ll[1], 5)})
            else:
                miss.append(place)
        log("%s: %d stanovišť, %d geokódováno, %d bez souřadnic" % (klic, len(syrove), len(geo), len(miss)))
        vysledek[klic] = {"src": pdf, "mista": geo, "stanovist": len(syrove), "geo": len(geo)}

    (DATA / "vok9_report.txt").write_text("\n\n".join(report) + "\n\n" + "\n".join(LOG), encoding="utf-8")

    # pojistka: VOK musí dát rozumný výsledek, jinak poslední dobrá data nepřepisujeme
    v = vysledek["vok"]
    if not v or v["stanovist"] < 10 or v["geo"] < v["stanovist"] * 0.6:
        print("\n".join(LOG))
        sys.exit("VOK se nepodařilo spolehlivě zpracovat – vok9.json ponechán beze změny.")

    stare = {}
    if (DATA / "vok9.json").exists():
        stare = json.loads((DATA / "vok9.json").read_text(encoding="utf-8"))
    bio = vysledek["bio"]
    # BIO je méně spolehlivé; když se nepovede, podrž poslední BIO
    if bio and bio["geo"] >= 3:
        bio_mista, bio_src = bio["mista"], bio["src"]
    else:
        bio_mista = [m for m in stare.get("mista", []) if m["t"] == "bio"]
        bio_src = stare.get("src", {}).get("bio", bio_clanek)
        log("BIO: ponechána předchozí data (%d míst)" % len(bio_mista))

    out = {"src": {"vok": v["src"], "bio": bio_src}, "mista": v["mista"] + bio_mista}
    (DATA / "vok9.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "vok9_report.txt").write_text("\n\n".join(report) + "\n\n" + "\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
