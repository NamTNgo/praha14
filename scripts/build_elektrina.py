"""Plánovaná přerušení dodávky elektřiny (PREdistribuce) pro Prahu 9 a 14.

Zdroj: oznámení PREdistribuce, která městské části vyvěšují na úředních deskách
  Praha 9  – praha9.cz/urad-a-samosprava/uredni-deska (názvy „…oznámení o přerušení dodávky elektřiny…“)
  Praha 14 – edeska.praha14.cz, kategorie „Oznámení PRE o dodávkách elektrické energie“
Web predistribuce.cz s mapou odstávek nemá otevřená data (a v době psaní byl odstavený).

Z PDF oznámení bereme jen adresy (ulice + č. p.), dny a čas. Jména a telefony
dodavatelských firem a pověřených osob do aplikace nedáváme. Naskenovaná PDF
čteme přes OCR (tesseract, čeština). Přečtené vyhlášky si pamatujeme v cache,
aby se OCR nespouštělo pořád dokola.

Výstup docs/data/elektrina.json:
  {gen, ok, udalosti: [{id, mc, dny: ["YYYY-MM-DD"], od: "HH:MM", do: "HH:MM",
                        adresy: [[lat, lon, "Ulice 12/3"]], ulice: ["Ulice"], u: odkaz na vyhlášku, vyv}]}
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_rizeni import (DATA, NOW, P9, P9_DESKA, P14, html_text, pdf_text, plain, stahni)  # noqa: E402

VERZE = 2
LOG = []
LADENI = []
JE_PRE = re.compile(r"přerušení dodávky elektř|preruseni dodavky elektr|vypnutí elektř|odstávk\w* elektř", re.I)


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


# ---------- adresy (RÚIAN, Praha 9 a 14) ----------
def nacti_adresy():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    cp, ulice = {}, {}
    for u, c, o, la, lo, mc, cast in adr:
        if not la:
            continue
        pu = plain(u)
        cp[(pu, c)] = (la, lo, mc, "%s %s%s" % (u, c, "/" + o if o else ""))
        ulice.setdefault(pu, {"n": u, "mc": mc})
    return cp, ulice


# ---------- zdroje ----------
def praha9():
    h = stahni(P9_DESKA)
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
        if len(td) < 2:
            continue
        nazev = html_text(td[0])
        a = re.search(r'href="([^"]+)"', td[0])
        vyv = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", html_text(td[1]))
        if not a or not vyv or not JE_PRE.search(nazev):
            continue
        out.append({"src": "p9", "nazev": nazev, "url": urllib.parse.urljoin(P9, a.group(1)),
                    "vyv": "%04d-%02d-%02d" % (int(vyv.group(3)), int(vyv.group(2)), int(vyv.group(1)))})
    log("Praha 9: oznámení PRE na desce %d" % len(out))
    return out


def praha14():
    h = stahni(P14 + "eDeskaAktualni.jsp", data={"order": "vyveseno", "desc": "true", "first": "0", "oblast": "",
                                                  "kategorie": "Oznámení PRE o dodávkách elektrické energie",
                                                  "nazev": "", "text": "", "count": "100"})
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
        if len(td) < 7:
            continue
        a = re.search(r'href="([^"]*eDeskaDetail\.jsp\?detailId=\d+)"', tr)
        pr = re.findall(r'href="([^"]*download\.jsp\?idPriloha=\d+)"', tr)
        vyv = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", html_text(td[6]))
        nazev = html_text(td[2])
        if not a or not vyv or not JE_PRE.search(nazev):
            continue
        out.append({"src": "p14", "nazev": nazev, "url": urllib.parse.urljoin(P14, a.group(1)),
                    "pdf": [urllib.parse.urljoin(P14, x) for x in pr],
                    "vyv": "%s-%s-%s" % (vyv.group(3), vyv.group(2), vyv.group(1))})
    log("Praha 14: oznámení PRE na desce %d" % len(out))
    return out


def pdf_odkazy(v):
    if v.get("pdf"):
        return v["pdf"]
    h = stahni(v["url"])
    if v["src"] == "p14":
        return [urllib.parse.urljoin(P14, x) for x in re.findall(r'href="([^"]*download\.jsp\?idPriloha=\d+)"', h)]
    return [urllib.parse.urljoin(P9, x) for x in re.findall(r'href="([^"]+\.pdf)"', h, re.I)]


def ocr(b):
    if not (shutil.which("pdftoppm") and shutil.which("tesseract")):
        log("    ! OCR není k dispozici")
        return ""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "in.pdf").write_bytes(b)
        subprocess.run(["pdftoppm", "-r", "300", "-l", "2", "-gray", "-png", str(p / "in.pdf"), str(p / "s")],
                       capture_output=True, timeout=120)
        t = ""
        for img in sorted(p.glob("s*.png")):
            r = subprocess.run(["tesseract", str(img), "-", "-l", "ces", "--psm", "6"], capture_output=True, timeout=120)
            t += r.stdout.decode("utf-8", "replace") + "\n"
    return t


def text_vyhlasky(b):
    t = pdf_text(b)
    if len(re.sub(r"\W", "", t)) < 80:
        t = ocr(b)
        if t.strip():
            log("    OCR: %d znaků" % len(t))
    return t


# ---------- čtení oznámení ----------
DATUM = re.compile(r"(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(20\d\d)")
CAS = re.compile(r"(\d{1,2})\s*[:.]\s*(\d{2})")


def dny_a_cas(t, nazev):
    """Dny přerušení a časové okno z úseku „dne … od … do …“ (před větou „Dodávka elektřiny bude…“).
    V oznámení bývají mezi popisky zbytky tabulky („od: | 8.00 hod.“) a datum někdy až za „od:“,
    proto bereme všechna data a časy z celého úseku. Datum vystavení je až za ním."""
    s = re.sub(r"\s+", " ", t)
    m = re.search(r"\bdne\b(.{0,220}?)(?:Dodávka elektřiny|Dodavka elektriny|$)", s, re.I)
    usek = m.group(1) if m else ""
    # časté chyby OCR v číslech: S→5, O→0, l/I→1 (jen hned vedle číslic)
    usek = re.sub(r"(?<=[\d.])[Oo]|[Oo](?=[\d.])", "0", usek)
    usek = re.sub(r"(?<![A-Za-zÀ-ž])S(?=\.\d)", "5", usek)
    usek = re.sub(r"(?<=[\d.])[lI]|[lI](?=\d)", "1", usek)
    dny = ["%s-%02d-%02d" % (d.group(3), int(d.group(2)), int(d.group(1))) for d in DATUM.finditer(usek)]
    bez_dat = DATUM.sub(" ", usek)
    casy = ["%02d:%s" % (int(c.group(1)), c.group(2)) for c in re.finditer(r"(?<!\d)(\d{1,2})\s*[:.]\s*(\d{2})(?!\d)", bez_dat)
            if int(c.group(1)) <= 24 and int(c.group(2)) < 60]
    od, do = (casy[0], casy[-1]) if len(casy) >= 2 else (None, None)
    # Praha 9 má data často i v názvu („…dne 26.10.2026, 25.11.2026“) – sloučíme
    dny += ["%s-%02d-%02d" % (d.group(3), int(d.group(2)), int(d.group(1))) for d in DATUM.finditer(nazev)]
    if not od:
        c = re.search(r"(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})", nazev)
        if c:
            od, do = "%02d:%s" % (int(c.group(1)), c.group(2)), "%02d:%s" % (int(c.group(3)), c.group(4))
    dny = [d for d in dny if "2020" < d[:4] < "2100"]
    return sorted(set(dny)), od, do


def adresy(t, nazev, cp, ulice):
    """Najde ulice z Prahy 9/14 a čísla popisná za nimi. Vrací (body, ulice bez čísel)."""
    s = re.sub(r"\s+", " ", t)
    m = re.search(r"na adres\w*\s*:?(.*?)(?:\bdne\b|\bod\s*:)", s, re.I | re.S)
    usek = (m.group(1) if m else s[:1500]) + " ; " + nazev
    p = plain(usek)
    jmena = sorted(ulice, key=len, reverse=True)
    vyskyty = []
    for u in jmena:
        if len(u) < 4:
            continue
        for mm in re.finditer(r"(?<![a-z])" + re.escape(u) + r"(?![a-z])", p):
            if not any(a <= mm.start() < b for a, b, _ in vyskyty):
                vyskyty.append((mm.start(), mm.end(), u))
    vyskyty.sort()
    body, cele, s_cisly = {}, [], set()
    for i, (a, b, u) in enumerate(vyskyty):
        konec = vyskyty[i + 1][0] if i + 1 < len(vyskyty) else min(len(p), b + 200)
        kus = re.sub(r"c\s*\.\s*e\s*\.?\s*\d+", " ", p[b:konec])          # č. e. (evidenční) vynecháme
        cisla = re.findall(r"(?<![\d/])(\d{1,4})(?:\s*/\s*\d{1,3}[a-z]?)?", kus)
        for c in cisla:
            x = cp.get((u, c))
            if x:
                body[x[3]] = [round(x[0], 6), round(x[1], 6), x[3], x[2]]
        if cisla:
            s_cisly.add(u)
        elif ulice[u]["n"] not in cele:
            cele.append(ulice[u]["n"])       # ulice bez čísel = týká se celé ulice
    # ulice, která má jinde v textu čísla (nebo čísla mimo Prahu 9/14), celá není
    return list(body.values()), [n for n in cele if plain(n) not in s_cisly]


def main():
    cp, ulice = nacti_adresy()
    cache_p = DATA / "elektrina_cache.json"
    try:
        cache = json.loads(cache_p.read_text(encoding="utf-8"))
        if cache.get("v") != VERZE:
            cache = {"v": VERZE, "vyhlasky": {}}
    except Exception:   # noqa: BLE001
        cache = {"v": VERZE, "vyhlasky": {}}

    ok, seznam = True, []
    for f in (praha9, praha14):
        try:
            seznam += f()
        except Exception as e:   # noqa: BLE001
            ok = False
            log("CHYBA zdroje", f.__name__, e)

    for v in seznam:
        if v["url"] in cache["vyhlasky"]:
            continue
        log("nové:", v["nazev"][:90])
        t = ""
        try:
            for u in pdf_odkazy(v)[:2]:
                t += text_vyhlasky(stahni(u, binarni=True)) + "\n"
        except Exception as e:   # noqa: BLE001
            log("    ! nejde stáhnout:", e)
            continue
        if os.environ.get("LADENI"):   # jen do výpisu běhu, ne do repozitáře: úsek s adresami a termínem
            s1 = re.sub(r"\s+", " ", t)
            i = max(0, plain(s1).find("na adres"))
            LADENI.append("=== %s\n%s\n" % (v["nazev"][:80], s1[i:i + 700]))
        dny, od, do = dny_a_cas(t, v["nazev"])
        body, cele = adresy(t, v["nazev"], cp, ulice)
        cache["vyhlasky"][v["url"]] = {"src": v["src"], "nazev": v["nazev"], "vyv": v["vyv"], "dny": dny, "od": od, "do": do,
                                       "adresy": body, "ulice": cele}
        log("    dny %s %s–%s · adres %d · ulic bez čísla %s" % (",".join(dny) or "?", od, do, len(body), ",".join(cele) or "-"))

    dnes = NOW.strftime("%Y-%m-%d")
    aktualni = {v["url"] for v in seznam}
    ud = []
    for url, x in list(cache["vyhlasky"].items()):
        posl = max(x["dny"]) if x["dny"] else None
        if url not in aktualni and (not posl or posl < dnes):
            del cache["vyhlasky"][url]          # sejmuté a proběhlé zapomeneme
            continue
        if not posl or posl < dnes or not (x["adresy"] or x["ulice"]):
            continue                            # proběhlé, bez data nebo mimo Prahu 9/14
        mc = sorted({a[3] for a in x["adresy"]} or {ulice[plain(u)]["mc"] for u in x["ulice"] if plain(u) in ulice})
        ud.append({"id": str(zlib.crc32(url.encode())), "mc": mc, "dny": x["dny"],
                   "od": x["od"], "do": x["do"], "adresy": [a[:3] for a in x["adresy"]], "ulice": x["ulice"],
                   "u": url, "vyv": x["vyv"]})
    ud.sort(key=lambda u: (u["dny"][0], u["od"] or ""))

    out = {"gen": NOW.isoformat(timespec="seconds"), "ok": ok, "udalosti": ud}
    (DATA / "elektrina.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cache_p.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("výstup: %d plánovaných přerušení v Praze 9/14" % len(ud))
    (DATA / "elektrina_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    if LADENI:
        (DATA / "elektrina_ladeni.txt").write_text("\n".join(LADENI), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
