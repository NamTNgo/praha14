#!/usr/bin/env python3
"""Menší stavby a rekonstrukce z úředních desek -> docs/data/rizeni.json.

Velké projekty má databáze CAMP (build_stavby.py). Tady sbíráme to menší, co
stavební úřady Prahy 9 a 14 zveřejňují veřejnou vyhláškou: zateplení, nástavby,
přístavby, rodinné domy, menší bytové domy, chodníky, kanalizace…

Zdroje:
  Praha 9  – www.praha9.cz/urad-a-samosprava/uredni-deska (Drupal, HTML + PDF)
  Praha 14 – edeska.praha14.cz (eDeska, HTML + PDF), kategorie odboru výstavby

Vyhlášky visí jen ~15 dní, proto si držíme vlastní historii (rizeni.json) a
záznamy necháváme rok. Víc vyhlášek k jednomu záměru (zahájení → rozhodnutí)
spojujeme podle čísla záměru v ISSŘ (Z/2025/181342).

Soukromí: dokumenty obsahují jména a data narození stavebníků. Neukládáme z nich
nic kromě názvu záměru, druhu stavby, místa (č. p./ulice/k. ú.) a fáze řízení.
"""
import datetime as dt
import io
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
UA = "Mozilla/5.0 (compatible; pod-okny-bot; +https://github.com/NamTNgo/praha14)"
DRZET_DNI = 365
LOG = []

P9 = "https://www.praha9.cz"
P9_DESKA = P9 + "/urad-a-samosprava/uredni-deska?items_per_page=1000"
P14 = "https://edeska.praha14.cz/eDeska/"

# co je stavba / úprava (název nebo text)
STAVEBNI = re.compile(r"stavb|stavební úprav|úprav[ay] |rekonstr|přístavb|nástavb|zateplen|demolic|odstraněn[íi] stavby|novostavb|"
                      r"bytov[ýé] d[ůo]m|rodinn[ýé]ho? d|záměr|povolen[íi] záměru|chodník|kanalizac|vodovod|komunikac|parkovišt|garáž|"
                      r"fasád|střech|výtah|lodžie|balkon|oplocen|přípojk|terén", re.I)
NE = re.compile(r"volná místa|výběrové řízení|exekut|dražeb|vozidl|volby|kandidát|pronájem|pronajm|přerušení dodávky|"
                r"písemnost(?!i rozhodnut)|zásilk|úmrtí|opatrovník|rozpočet|usnesení zmč|zasedání", re.I)

DRUHY = [   # (vzorek, štítek) – první shoda vyhrává
    (r"demolic|odstraněn[íi] stavby|odstranění objektu", "Demolice"),
    (r"nástavb", "Nástavba"),
    (r"přístavb", "Přístavba"),
    (r"zateplen", "Zateplení"),
    (r"fasád", "Úprava fasády"),
    (r"výtah", "Výtah"),
    (r"střech|podkrov", "Úprava střechy"),
    (r"lodži|balkon", "Balkony a lodžie"),
    (r"rodinn\w*\s+(?:dvoj|troj)?dom|\bRD\b", "Rodinný dům"),
    (r"bytov[ýé]\w* d[ůo]m|\bBD\b", "Bytový dům"),
    (r"chodník", "Chodník"),
    (r"kanalizac|vodovod|přípojk", "Sítě a přípojky"),
    (r"komunikac|silnic|vozovk|parkovišt", "Komunikace"),
    (r"garáž", "Garáž"),
    (r"oplocen|plot", "Oplocení"),
    (r"stavební úprav|úprav|rekonstr", "Stavební úpravy"),
    (r"novostavb", "Novostavba"),
]
FAZE = [    # (vzorek, kód, text) – první shoda vyhrává
    (r"odvolán", "odvolani", "Odvolání"),
    (r"zahájení řízení", "zahajeno", "Řízení zahájeno"),
    (r"seznámení s podklady|podklad[yů] rozhodnutí", "pred", "Před rozhodnutím"),
    (r"rozhodnutí|povoluje|vydává povolení", "rozhodnuto", "Rozhodnuto"),
    (r"zahájen", "zahajeno", "Řízení zahájeno"),
    (r"\bJES\b|environmentální", "jes", "Posouzení vlivu na prostředí"),
    (r"opatření obecné povahy|\bOOP\b", "oop", "Opatření úřadu"),
]


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def stahni(url, data=None, binarni=False, timeout=40):
    hd = {"User-Agent": UA}
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
        hd["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=hd)
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if binarni else b.decode(r.headers.get_content_charset() or "utf-8", "replace")
        except Exception as e:   # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise last


def plain(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def html_text(h):
    import html
    h = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", h or "")
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def pdf_text(b):
    import shutil
    import subprocess
    if shutil.which("pdftotext"):
        try:
            r = subprocess.run(["pdftotext", "-l", "3", "-", "-"], input=b, capture_output=True, timeout=60)
            t = r.stdout.decode("utf-8", "replace")
            if len(t.strip()) > 100:
                return re.sub(r"\s+", " ", t)
        except Exception as e:   # noqa: BLE001
            log("    ! pdftotext:", e)
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(b))
        t = " ".join((p.extract_text() or "") for p in r.pages[:3])
    except Exception as e:   # noqa: BLE001
        log("    ! PDF nejde přečíst:", e)
        return ""
    return re.sub(r"\s+", " ", t)


# ---------- adresy ----------
def nacti_adresy():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    cp, ulc, ul, ku = {}, {}, {}, {}
    for u, c, o, la, lo, mc, cast in adr:
        if not la:
            continue
        cp[(c, plain(cast))] = (la, lo, mc, "%s %s%s" % (u, c, "/" + o if o else ""))
        if o:
            ulc[(plain(u), o)] = (la, lo, mc, "%s %s/%s" % (u, c, o))
        ulc[(plain(u), c)] = (la, lo, mc, "%s %s%s" % (u, c, "/" + o if o else ""))
        ul.setdefault(plain(u), []).append((la, lo, mc, u))
        ku.setdefault(plain(cast), []).append((la, lo, mc))
    ulice = {k: (sum(x[0] for x in v) / len(v), sum(x[1] for x in v) / len(v), v[0][2], v[0][3]) for k, v in ul.items()}
    kus = {k: (sum(x[0] for x in v) / len(v), sum(x[1] for x in v) / len(v), v[0][2]) for k, v in ku.items()}
    return cp, ulc, ulice, kus


CASTI = ["prosek", "strizkov", "vysocany", "liben", "hloubetin", "hrdlorezy", "malesice", "kyje", "hostavice", "cerny most"]


UREDY = re.compile(r"sokolovska\s+(?:14/324|324/14)|bratri venclik\w*\s+1073", re.I)


def _maskuj(p):
    """Adresy úřadů a účastníků (za „nar.“, „IČO“, „se sídlem“) z textu vyřadit – nejsou místem stavby."""
    p = UREDY.sub(" ", p)
    return re.sub(r"(nar\.|ico:?|se sidlem|bytem|trvale bytem)[^;()]{0,90}", " ", p)


def _hledej(p, adresy, s_ulici_bez_prefixu=False):
    cp, ulc, ulice, kus = adresy
    # „Ukl. zn.: D - 571/Vysočany“ a „č.p. 571 … k.ú. Vysočany“
    for m in re.finditer(r"(?:ukl\. ?zn\.?:?\s*[a-z]\s*-\s*|c\.\s*p\.\s*)(\d{1,5})[^\d/]{0,40}?(?:/|k\.\s*u\.\s*|v katastralnim uzemi\s+)\s*([a-z ]{4,12})", p):
        cast = next((c for c in CASTI if m.group(2).strip().startswith(c)), None)
        if cast and (m.group(1), cast) in cp:
            la, lo, mc, txt = cp[(m.group(1), cast)]
            return la, lo, mc, txt, "adresa"
    # „Na Břehu 11“ – ulice + číslo
    for m in re.finditer(r"([a-z][a-z ]{2,30}?)\s+(\d{1,4})(?:/(\d{1,3}[a-z]?))?\b", p):
        u = m.group(1).strip()
        for i in range(len(u.split())):
            kand = " ".join(u.split()[i:])
            for c in (m.group(3), m.group(2)):
                if c and (kand, c) in ulc:
                    la, lo, mc, txt = ulc[(kand, c)]
                    return la, lo, mc, txt, "adresa"
    # jen ulice („ul. Za luhem“, „podél ulice Mezitraťová“)
    for m in re.finditer(r"(?:ul\.|ulicemi|ulic[ei]|ulici)\s+([a-z][a-z ]{2,30})", p):
        slova = m.group(1).split()
        for n in range(min(4, len(slova)), 0, -1):
            kand = " ".join(slova[:n])
            if kand in ulice:
                la, lo, mc, u = ulice[kand]
                return la, lo, mc, "ulice " + u, "ulice"
    if s_ulici_bez_prefixu:   # titulky typu „Drahobejlova - OOP (…)“: nejdelší známá ulice v textu
        nej = None
        for u in ulice:
            if len(u) >= 5 and re.search(r"(?<![a-z])" + re.escape(u) + r"(?![a-z])", p) and (not nej or len(u) > len(nej)):
                nej = u
        if nej:
            for cnum in re.findall(r"c\.\s*p\.\s*(\d{1,5})", p):
                if (nej, cnum) in ulc:
                    la, lo, mc, txt = ulc[(nej, cnum)]
                    return la, lo, mc, txt, "adresa"
            la, lo, mc, u = ulice[nej]
            return la, lo, mc, "ulice " + u, "ulice"
    return None


def najdi_misto(nazev, t, adresy):
    """(lat, lon, mc, popis, presnost): nejdřív titulek vyhlášky, pak část dokumentu o záměru."""
    kus = adresy[3]
    r = _hledej(_maskuj(plain(nazev)), adresy, True)
    if r:
        return r
    p = plain(t)
    i = p.find("zamer")
    telo = _maskuj(p[i:i + 2500] if i >= 0 else p)
    r = _hledej(_maskuj(p[:400]), adresy) if re.search(r"ukl\. ?zn", p[:400]) else None   # hlavička se spisovou značkou
    r = r or _hledej(telo, adresy)
    if r:
        return r
    for c in CASTI:
        if re.search(r"k\.\s*u\.\s*" + c + r"|katastralnim uzemi " + c + r"|/" + c, p):
            la, lo, mc = kus.get(c, (None, None, None))
            return la, lo, mc, c, "ku"
    return None, None, None, "", ""


def druh(nazev, t=""):
    for zdroj in (nazev, t):          # název záměru má přednost před textem dokumentu
        for rx, s in DRUHY:
            if re.search(rx, zdroj, re.I):
                return s
    return "Stavba"


def faze(nazev, t):
    for zdroj in (nazev, t[:1500]):
        for rx, k, s in FAZE:
            if re.search(rx, zdroj, re.I):
                return k, s
    return "info", "Oznámení stavebního úřadu"


def _orez(n):
    return re.split(r",?\s+na pozem[kc]|,?\s+v katastr|,?\s*\(dále|,?\s+k\.\s?ú\.", n)[0].strip(" ,.")


def nazev_zameru(nazev, t):
    """Název záměru z dokumentu („záměru s názvem: „Bytový dům…““), jinak z titulku vyhlášky."""
    m = re.search(r"záměr\w*\s+(?:s\s+)?(?:názvem|nazvaného)\s*:?\s*[„\"“]\s*([^“”\"]{4,140}?)\s*[“”\"]", t)
    if m:
        return _orez(m.group(1))
    m = re.search(r"záměr\w*\s+nazvaného\s*:?\s*(.{6,140}?)(?:,\s*\(dále|\(dále| na pozem[kc])", t)
    if m:
        return _orez(m.group(1))
    n = re.sub(r"^\d+\s*,\s*", "", nazev)                         # „719, Veřejná vyhláška…“
    m = re.match(r"(.*?)\s*-\s*OOP\s*\((.*)\)\s*$", n)
    if m:   # „Drahobejlova - OOP (oprava fasády domu č.p. 1110)“
        return (m.group(2)[:1].upper() + m.group(2)[1:] + ", " + m.group(1)).strip()[:140]
    n = re.sub(r"^JES\s*-\s*", "", n)
    if ":" in n and re.search(r"vyrozumění|sdělení|oznámení|vyhláška|písemnost", n.split(":")[0], re.I):
        n = n.split(":", 1)[1]
    n = re.split(r"\s*[-–:]\s*(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\"„])", n, maxsplit=1)[-1] if re.search(r"vyrozumění|sdělení|vyhláška|oznámení|rozhodnutí|písemnost", n, re.I) else n
    n = re.sub(r"^(stanoviska|písemnosti rozhodnutí|rozhodnutí)\s*[-–:]\s*", "", n, flags=re.I)
    return _orez(n.strip(" |,.\"„“")).strip(" |,.\"„“")[:140]


def popis_zameru(t):
    """Jedna věta o tom, co se staví – jen věcná část, bez jmen."""
    if re.search(r"opatření obecné povahy", t[:1500], re.I):
        return ""
    m = re.search(r"(?:předmětem záměru (?:jsou|je)|záměr spočívá v|spočívající v)\s+(.{20,260}?[^\d\s]\.)(?=\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]|\s*$)", t)
    if not m:
        return ""
    s = m.group(1)
    if re.search(r"nar\.|IČO|Ing\.|Mgr\.|zastoup", s):
        return ""
    return s[:260]


def zamer_id(t):
    m = re.search(r"Z/\s?(\d{4})\s?/\s?(\d{3,7})", t)
    return "Z-%s-%s" % (m.group(1), m.group(2)) if m else None


# ---------- Praha 9 ----------
def praha9():
    h = stahni(P9_DESKA)
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
        if len(td) < 2:
            continue
        a = re.search(r'href="([^"]+)"', td[0])
        nazev = html_text(td[0])
        od = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", html_text(td[1]))
        if not a or not od:
            continue
        out.append({"src": "p9", "nazev": nazev, "url": urllib.parse.urljoin(P9, a.group(1)),
                    "od": "%04d-%02d-%02d" % (int(od.group(3)), int(od.group(2)), int(od.group(1)))})
    log("Praha 9: na desce %d vyhlášek" % len(out))
    return out


def praha9_pdf(url):
    h = stahni(url)
    return [urllib.parse.urljoin(P9, x) for x in re.findall(r'href="([^"]+\.pdf)"', h, re.I)]


# ---------- Praha 14 ----------
def praha14():
    out = []
    for kat in ("Oznámení odboru výstavby",):
        h = stahni(P14 + "eDeskaAktualni.jsp", data={"order": "vyveseno", "desc": "true", "first": "0", "oblast": "",
                                                      "kategorie": kat, "nazev": "", "text": "", "count": "100"})
        for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
            td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
            if len(td) < 7:
                continue
            a = re.search(r'href="([^"]*eDeskaDetail\.jsp\?detailId=\d+)"', tr)
            pr = re.search(r'href="([^"]*download\.jsp\?idPriloha=\d+)"', tr)
            od = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", html_text(td[6]))
            if not a or not od:
                continue
            out.append({"src": "p14", "nazev": html_text(td[2]), "url": urllib.parse.urljoin(P14, a.group(1)),
                        "pdf": [urllib.parse.urljoin(P14, pr.group(1))] if pr else [],
                        "od": "%s-%s-%s" % (od.group(3), od.group(2), od.group(1))})
    log("Praha 14: vyhlášek odboru výstavby %d" % len(out))
    return out


def obdobi_oop(t):
    """Platnost dopravního opatření: „od 12.10.2026 do 31.10.2026“."""
    d = r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})"
    m = re.search(r"od\s+(?:\d{1,2}[:.]\d{2}\s*(?:hod\.?)?\s*)?(?:dne\s+)?" + d + r".{0,40}?do\s+(?:\d{1,2}[:.]\d{2}\s*(?:hod\.?)?\s*)?(?:dne\s+)?" + d, t)
    if not m:
        return None, None
    g = m.groups()
    return "%s-%02d-%02d" % (g[2], int(g[1]), int(g[0])), "%s-%02d-%02d" % (g[5], int(g[4]), int(g[3]))


def main():
    out_p = DATA / "rizeni.json"
    cache_p = DATA / "rizeni_cache.json"     # zpracované vyhlášky – aplikace ho nenačítá
    try:
        pred = json.loads(out_p.read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pred = {}
    try:
        cache = json.loads(cache_p.read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        cache = {"v": pred.get("v"), "vyhlasky": pred.get("_vyhlasky", [])}
    VERZE = 5   # při změně parseru zpracovat vyhlášky znovu
    vyhl = {v["url"]: v for v in cache.get("vyhlasky", [])} if cache.get("v") == VERZE else {}
    adresy = nacti_adresy()
    zdroje = {}
    nove = []
    for jmeno, fn in (("p9", praha9), ("p14", praha14)):
        try:
            seznam = fn()
            zdroje[jmeno] = {"ok": True, "n": len(seznam), "cas": NOW.isoformat(timespec="minutes")}
        except Exception as e:   # noqa: BLE001
            log("CHYBA zdroje", jmeno, e)
            zdroje[jmeno] = dict((pred.get("zdroje") or {}).get(jmeno) or {}, ok=False, chyba=str(e)[:200])
            continue
        for v in seznam:
            if v["url"] in vyhl:
                continue
            if NE.search(v["nazev"]) or not STAVEBNI.search(v["nazev"]):
                continue
            nove.append(v)
    log("nových stavebních vyhlášek ke zpracování: %d" % len(nove))

    for v in nove:
        try:
            pdfy = v.get("pdf")
            if pdfy is None:
                pdfy = praha9_pdf(v["url"])
            t = ""
            for u in pdfy[:2]:
                t = pdf_text(stahni(u, binarni=True))
                if len(t) > 200:
                    break
        except Exception as e:   # noqa: BLE001
            log("  ! nejde stáhnout:", v["url"], e)
            continue
        cely = v["nazev"] + " " + t
        la, lo, mc, misto, presnost = najdi_misto(v["nazev"], t, adresy)
        fk, ft = faze(v["nazev"], t)
        jm = nazev_zameru(v["nazev"], t)
        zaznam = {
            "url": v["url"], "src": v["src"], "od": v["od"],
            "zid": zamer_id(t) or v["url"],
            "n": jm,
            "druh": druh(jm + " " + v["nazev"], t[:3000]),
            "faze": fk, "fazeT": ft,
            "popis": popis_zameru(t),
            "lat": round(la, 6) if la else None, "lon": round(lo, 6) if lo else None,
            "mc": mc or ("9" if v["src"] == "p9" else "14"), "misto": misto, "presnost": presnost,
        }
        if fk == "oop":
            zaznam["oop_od"], zaznam["oop_do"] = obdobi_oop(t)
        vyhl[v["url"]] = zaznam
        if re.match(r"^č\.\s*p\.\s*\d+\s*$", zaznam["n"]) or len(zaznam["n"]) < 6:
            zaznam["n"] = zaznam["druh"] + (", " + misto if presnost == "adresa" else "")
        log("  + [%s] %s · %s · %s (%s)" % (zaznam["faze"], zaznam["n"], zaznam["druh"], misto or "?", presnost or "bez místa"))
        time.sleep(0.5)

    hranice = (NOW - dt.timedelta(days=DRZET_DNI)).strftime("%Y-%m-%d")
    vyhl = {k: v for k, v in vyhl.items() if v["od"] >= hranice}
    # záměry: víc vyhlášek k jednomu záměru → jedna karta s historií
    zam = {}
    # dopravní opatření kvůli stavbám patří do Dopravy (uzavírky a práce), ne mezi záměry
    dnes = NOW.strftime("%Y-%m-%d")
    oop = []
    for v in sorted(vyhl.values(), key=lambda x: x["od"], reverse=True):
        if v["faze"] != "oop":
            continue
        konec = v.get("oop_do") or (dt.date.fromisoformat(v["od"]) + dt.timedelta(days=30)).isoformat()
        if konec < dnes:
            continue
        oop.append({"n": v["n"], "mc": v["mc"], "ul": [v["misto"].replace("ulice ", "")] if v["misto"] else [],
                    "lat": v["lat"], "lon": v["lon"], "od": v.get("oop_od") or v["od"], "do": v.get("oop_do"),
                    "p": "Přechodná úprava provozu kvůli pracím – opatření úřadu MČ Praha " + v["mc"] + ".", "u": v["url"], "z": "oop"})
    for v in sorted(vyhl.values(), key=lambda x: x["od"]):
        if v["faze"] == "oop":
            continue
        z = zam.setdefault(v["zid"], {"id": re.sub(r"\W+", "-", v["zid"])[-40:], "n": v["n"], "druh": v["druh"], "mc": v["mc"],
                                       "lat": v["lat"], "lon": v["lon"], "misto": v["misto"], "presnost": v["presnost"],
                                       "popis": v["popis"], "kroky": []})
        z["kroky"].append({"d": v["od"], "f": v["faze"], "t": v["fazeT"], "u": v["url"]})
        for k in ("lat", "lon", "misto", "presnost", "popis"):
            if not z[k] and v[k]:
                z[k] = v[k]
        if v["druh"] != "Stavba":
            z["druh"] = v["druh"]
    zamery = sorted(zam.values(), key=lambda z: z["kroky"][-1]["d"], reverse=True)
    for z in zamery:
        z["faze"], z["fazeT"], z["d"] = z["kroky"][-1]["f"], z["kroky"][-1]["t"], z["kroky"][-1]["d"]

    ok = any(s.get("ok") for s in zdroje.values())
    data = {"v": VERZE, "gen": NOW.isoformat(timespec="minutes"), "ok": ok, "zdroje": zdroje, "zamery": zamery, "oop": oop}
    out_p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cache_p.write_text(json.dumps({"v": VERZE, "vyhlasky": sorted(vyhl.values(), key=lambda x: x["od"], reverse=True)},
                                  ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("záměrů v datech: %d (s polohou %d), dopravních opatření: %d" % (len(zamery), sum(1 for z in zamery if z["lat"]), len(oop)))
    (DATA / "rizeni_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n".join(LOG))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
