#!/usr/bin/env python3
"""Lékaři v Praze 9 a 14 z NRPZS -> docs/data/doktori.json.

Zdroj: ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb, datová sada
„Místa poskytování zdravotních služeb" (CC BY 4.0, aktualizace měsíčně).

NRPZS má u pražských záznamů jen správní obvod (Praha 9 = i Kbely, Letňany,
Čakovice…), ne městskou část. Na přesnou MČ se proto každý záznam páruje přes
adresy z RÚIAN (docs/data/addresses.json) – stejně jako u dopravních uzavírek.
Co se nespáruje, do naší oblasti nepatří a vypadne.
"""
import concurrent.futures
import csv
import io
import json
import re
import socket
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
URL = "https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
# na ověřování webů bereme běžný prohlížečový UA – weby lékařů občas „bota“ blokují
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def _domena(h):
    """Registrovatelná doména (poslední dvě části), bez www."""
    h = (h or "").lower().strip()
    if h.startswith("www."):
        h = h[4:]
    casti = [x for x in h.split(".") if x]
    return ".".join(casti[-2:]) if len(casti) >= 2 else h


EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
TEL_RE = re.compile(r"(?:\+?420[\s ]?)?(\d{3}[\s ]?\d{3}[\s ]?\d{3})")
# bezplatné pošty – malé ordinace je používají běžně, webmaster/agentura ne
FREEMAIL = {"seznam.cz", "email.cz", "post.cz", "centrum.cz", "atlas.cz", "volny.cz",
            "tiscali.cz", "quick.cz", "iol.cz", "gmail.com", "googlemail.com",
            "icloud.com", "me.com", "outlook.com", "hotmail.com", "yahoo.com", "outlook.cz"}
KONTAKT_CESTY = ("", "/kontakt", "/kontakt/", "/kontakty/", "/contact/")


def _stahni_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=12) as r:
        if not (r.headers.get_content_type() or "").startswith("text"):
            return ""
        return r.read(700000).decode("utf-8", "replace")


def _norm_tel(s):
    d = re.sub(r"\D", "", s or "")
    if len(d) == 12 and d.startswith("420"):
        d = d[3:]
    if len(d) != 9:
        return ""
    return d[:3] + " " + d[3:6] + " " + d[6:]


def kontakt_z_webu(w):
    """Z webu ordinace vytáhne telefon a e-mail. Bere jen e-mail na vlastní doméně
    (ať nechytneme hosting/webmastera) a první rozumné české číslo."""
    host = (w or "").split("/")[0]
    dom = _domena(host)
    maily, tel_odkazy, tel_text, nacteno = [], [], [], False
    for scheme in ("https://", "http://"):
        for cesta in KONTAKT_CESTY:
            try:
                html = _stahni_text(scheme + host + cesta)
            except Exception:
                continue
            if not html:
                continue
            nacteno = True
            maily += [m.lower() for m in re.findall(r"mailto:([^\"'?>\s]+)", html, re.I)]
            maily += [m.lower() for m in EMAIL_RE.findall(html)]
            tel_odkazy += re.findall(r"tel:\+?([0-9\s ]{6,})", html)   # strukturované = jisté
            tel_text += TEL_RE.findall(html)                                # z textu = méně jisté
            has_mail = any(m.split("@")[-1].endswith(dom) for m in maily)
            if tel_odkazy and has_mail:
                break
        if nacteno:
            break   # když první scheme načetl stránky, nestřídej na http
    mail = next((m for m in maily if m.split("@")[-1].endswith(dom)), "")
    mail_free = next((m for m in maily if m.split("@")[-1] in FREEMAIL), "")
    tel_odkaz = next((t for t in map(_norm_tel, tel_odkazy) if t), "")
    tel_volny = next((t for t in map(_norm_tel, tel_text) if t), "")
    return tel_odkaz, tel_volny, mail, mail_free


def doplnit_kontakty(out):
    """Doplní (a u cizích/osobních i opraví) telefon a e-mail z webu ordinace.

    Registr NRPZS kontakty často nemá, nebo má osobní/staré (např. mail na
    icloud.com místo ordinačního). Web ordinace je pro veřejný kontakt
    autoritativnější: e-mail na vlastní doméně a telefon z odkazu `tel:` proto
    přepíšou i vyplněný registrový údaj, pokud je ten zjevně cizí.
    """
    weby = sorted({r["w"] for r in out if r.get("w")})
    if not weby:
        return
    log("ověřuji kontakty z %d webů…" % len(weby))
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        kont = dict(zip(weby, ex.map(kontakt_z_webu, weby)))
    pt = pe = 0
    for r in out:
        if not r.get("w"):
            continue
        tel_odkaz, tel_volny, mail, mail_free = kont.get(r["w"], ("", "", "", ""))
        dom = _domena(r["w"].split("/")[0])
        # e-mail: doplnit chybějící, nebo přepsat registrový z CIZÍ domény
        reg_cizi = r.get("e") and not r["e"].lower().split("@")[-1].endswith(dom)
        if mail and (not r.get("e") or reg_cizi):
            r["e"] = mail
            pe += 1
        elif mail_free and not r.get("e"):
            # e-mail na bezplatné poště jen doplní prázdné (menší jistota než vlastní doména)
            r["e"] = mail_free
            pe += 1
        # telefon: tel: odkaz přepíše registr; volné číslo jen doplní chybějící
        if tel_odkaz and _norm_tel(r.get("tel", "")) != tel_odkaz:
            r["tel"] = tel_odkaz
            pt += 1
        elif tel_volny and not r.get("tel"):
            r["tel"] = tel_volny
            pt += 1
    log("z webů doplněno/opraveno: %d telefonů, %d e-mailů" % (pt, pe))


def sjednotit_telefony(out):
    """Telefony z registru (+420266610451) do stejného tvaru jako z webu (266 610 451)."""
    for r in out:
        t = _norm_tel(r.get("tel", ""))
        if t:
            r["tel"] = t


def rucni_prepisy(out):
    """Ruční opravy z scripts/doktori_rucne.json – mají poslední slovo."""
    p = Path(__file__).resolve().parent / "doktori_rucne.json"
    try:
        prep = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    n = 0
    for r in out:
        for k, v in (prep.get(r["id"]) or {}).items():
            if k in ("tel", "e", "w"):
                r[k] = v
                n += 1
    log("ručních přepisů kontaktů: %d" % n)


def web_zije(w):
    """True = web žije na své doméně. False = mrtvý nebo přesměrovaný jinam.

    Prošlé/prodané domény (etoile.cz -> zonky.cz) se poznají podle přesměrování
    na cizí doménu; mrtvé podle chyby. Pomalý web ani bot-blokaci nezahazujeme.
    """
    host = (w or "").split("/")[0]
    cil = _domena(host)
    if not cil or "." not in cil:
        return False
    for scheme in ("https://", "http://"):
        try:
            req = urllib.request.Request(scheme + w, headers={"User-Agent": BROWSER_UA})
            with urllib.request.urlopen(req, timeout=12) as r:
                fin = urllib.parse.urlparse(r.geturl()).hostname or ""
                return _domena(fin) == cil
        except urllib.error.HTTPError as e:
            # 404/410/5xx = nefunkční; 401/403/429 = blokace bota, web ale žije
            return not (e.code in (404, 410) or 500 <= e.code < 600)
        except (socket.timeout, TimeoutError):
            return True
        except Exception:
            continue   # zkus http; když i to spadne, bereme jako mrtvý
    return False


def nacti_blocklist():
    """Ruční seznam domén, které se nikdy nemají ukazovat jako web lékaře.

    Pro případy, co automatika nechytí – hlavně geo/JS přesměrování prošlých
    domén (etoile.cz -> zonky.cz jen z české IP). Stačí doplnit doménu.
    """
    p = Path(__file__).resolve().parent / "doktori_web_blocklist.json"
    try:
        return {_domena(x) for x in json.loads(p.read_text(encoding="utf-8"))}
    except Exception:
        return set()


def proper_weby(out):
    """U každého lékaře ověří web a mrtvé/přesměrované/blokované odkazy zahodí."""
    block = nacti_blocklist()
    weby = sorted({r["w"] for r in out if r.get("w")})
    if not weby:
        return
    # blocklist řešíme hned (bez sítě); zbytek ověříme živě
    k_overeni = [w for w in weby if _domena(w.split("/")[0]) not in block]
    log("ověřuji %d webů (blocklist: %d)…" % (len(k_overeni), len(weby) - len(k_overeni)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        stav = dict(zip(k_overeni, ex.map(web_zije, k_overeni)))
    def ok(w):
        return _domena(w.split("/")[0]) not in block and stav.get(w, True)
    mrtve = [w for w in weby if not ok(w)]
    for r in out:
        if r.get("w") and not ok(r["w"]):
            r["w"] = ""
    log("webů vyřazeno (mrtvé/přesměrované/blocklist): %d z %d" % (len(mrtve), len(weby)))
    if mrtve:
        log("  " + ", ".join(mrtve[:15]))


def plain(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


# obor péče -> kategorie v aplikaci
def kategorie(obor):
    o = plain(obor)
    if "vseobecne prakticke lekarstvi" in o:
        return "prak"
    if "prakticke lekarstvi pro deti" in o:
        return "det"
    if "zubni lekarstvi" in o or o == "ortodoncie":
        return "zub"
    if "gynekologie" in o:
        return "gyn"
    return "spec"


# nelékařská povolání, lékárny a čistě laboratorní obory – do adresáře lékařů nepatří
NELEKAR = set(map(plain, [
    "Fyzioterapeut", "Dentální hygienistka", "Všeobecná sestra", "Zubní technik",
    "Klinický psycholog", "Optometrista", "Klinický logoped", "Nutriční terapeut",
    "Porodní asistentka", "Ergoterapeut", "Radiologický fyzik", "Klinický radiologický fyzik",
    "Sestra pro péči v psychiatrii", "Adiktolog", "praktické lékárenství", "Zdravotnický záchranář",
    "Farmaceutický asistent", "Ortotik-protetik", "Biomedicínský technik", "Zrakový terapeut",
    "laboratorní a vyšetřovací metody ve zdravotnictví", "klinická biochemie",
    "lékařská mikrobiologie", "hematologie a transfúzní lékařství", "lékařská genetika",
    "klinická farmacie", "nemocniční lékárenství", "radiologický asistent", "Psychoterapeut",
]))
PRIORITA = ["prak", "det", "zub", "gyn", "spec"]


def nacti_adresy():
    """index: (ulice_bez_diakritiky, č.p.) -> {č.o.: (lat, lon, mc)}"""
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    idx = defaultdict(dict)
    for a in adr:
        ulice, cp, co, lat, lon, mc = a[0], a[1], a[2], a[3], a[4], a[5]
        try:
            key = (plain(ulice), int(re.sub(r"\D", "", str(cp)) or 0))
        except ValueError:
            continue
        idx[key][str(co).lower()] = (lat, lon, mc)
    return idx


def mc_pro(idx, ulice, cislo):
    """č.p./č.o. doktora spáruje s RÚIAN adresou -> (mc, lat, lon) nebo None."""
    m = re.match(r"\s*(\d+)(?:/(\w+))?", cislo or "")
    if not ulice or not m:
        return None
    cp = int(m.group(1))
    co = (m.group(2) or "").lower()
    hit = idx.get((plain(ulice), cp))
    if not hit:
        return None
    v = hit.get(co) or next(iter(hit.values()))   # stejné č.p., jiné č.o. = tatáž budova
    return v[2], v[0], v[1]


def gps(s):
    m = re.search(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", s or "")
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def main():
    idx = nacti_adresy()
    log("adresních klíčů z RÚIAN:", len(idx))

    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=240).read()
    log("staženo %d B" % len(raw))
    rdr = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", "replace")), delimiter=",")

    mista = {}
    nespar = skip_nelekar = 0
    for row in rdr:
        obor = (row.get("ZZ_obor_pece") or "").strip()
        if plain(obor) in NELEKAR:
            skip_nelekar += 1
            continue
        m = mc_pro(idx, row.get("ZZ_ulice"), row.get("ZZ_cislo_domovni_orientacni"))
        if not m:
            nespar += 1
            continue
        mc, lat, lon = m
        if lat is None:
            lat, lon = gps(row.get("ZZ_GPS"))

        mid = row.get("ZZ_misto_poskytovani_ID") or row.get("ZZ_kod")
        r = mista.get(mid)
        if not r:
            r = mista[mid] = {
                "id": "d-" + str(mid),
                "n": (row.get("ZZ_nazev") or row.get("poskytovatel_nazev") or "").strip(),
                "a": ((row.get("ZZ_ulice") or "") + " " + (row.get("ZZ_cislo_domovni_orientacni") or "")).strip(),
                "mc": mc, "lat": lat, "lon": lon,
                "tel": (row.get("poskytovatel_telefon") or "").strip(),
                "e": (row.get("poskytovatel_email") or "").strip(),
                "w": re.sub(r"^https?://", "", (row.get("poskytovatel_web") or "").strip()).rstrip("/"),
                "dr": (row.get("ZZ_druh_nazev") or "").strip(),
                "obory": [],
            }
        if obor and obor not in r["obory"]:
            r["obory"].append(obor)

    out = []
    for r in mista.values():
        kody = [kategorie(o) for o in r["obory"]]
        r["o"] = min(kody, key=lambda k: PRIORITA.index(k)) if kody else "spec"
        r["on"] = r["obory"][0] if r["obory"] else ""
        out.append(r)
    out.sort(key=lambda r: (PRIORITA.index(r["o"]), plain(r["n"])))

    proper_weby(out)
    doplnit_kontakty(out)
    sjednotit_telefony(out)
    rucni_prepisy(out)

    (DATA / "doktori.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    from collections import Counter
    kat = Counter(r["o"] for r in out)
    mc = Counter(r["mc"] for r in out)
    log("\nlékařů v Praze 9 a 14: %d" % len(out))
    log("podle MČ: " + ", ".join("Praha %s=%d" % (k, v) for k, v in sorted(mc.items())))
    log("podle kategorie: " + ", ".join("%s=%d" % (k, kat[k]) for k in PRIORITA))
    log("nespárováno s našimi adresami: %d | vyřazeno nelékařských: %d" % (nespar, skip_nelekar))
    log("\nUKÁZKY:")
    for r in out[:12]:
        log("  [%s] %s — %s, Praha %s — %s" % (r["o"], r["n"][:40], r["a"], r["mc"], ", ".join(r["obory"])[:60]))
    (DATA / "doktori_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
