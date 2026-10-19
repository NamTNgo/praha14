#!/usr/bin/env python3
"""Dopravní komplikace v Praze 9 a 14 -> docs/data/doprava.json.

Čtyři zdroje, každý zvlášť a odolně: když jeden selže, ostatní se uloží a v
docs/data/doprava_report.txt je napsané proč. Když selže všechno, soubor se
nepřepíše (aplikace dál ukazuje poslední funkční data) a skript skončí chybou.

  1. blokové čištění  – rozpisy TSK z webů městských částí (PDF)
  2. uzavírky a práce – NDIC (DATEX II) jako hlavní zdroj, aktuality odborů
                        dopravy Prahy 9 a Prahy 14 jako doplněk
  3. výluky PID       – Golemio /v3/pid/infotexts + seznam zastávek z data.pid.cz

Souřadnice u uzavírek z aktualit MČ nevznikají geokódováním: název ulice se
spáruje s adresami z docs/data/addresses.json (RÚIAN) a bere se těžiště jejích
adres. Proto umíme takovou uzavírku umístit jen v Praze 9 a 14 – což je přesně
území aplikace. DATEX II nosí souřadnice s sebou; městská část se u něj určuje
podle nejbližší adresy z RÚIAN.

Podmínky použití NDIC: data se zpřístupňují v nezměněné podobě (popisy událostí
nepřepisujeme), zdroj se uvádí v předepsaném znění „Zdrojem digitalizovaných
informací o silničním provozu je NDIC“ a nikde nenaznačujeme, že by ŘSD bylo
s aplikací spojené.
"""
import datetime as dt
import gzip
import html as htmllib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
DNES = dt.date.today()
LOG = []

P9_AKT = "https://www.praha9.cz/urad-a-samosprava/doprava/aktuality-v-doprave-na-uzemi-mc-praha-9"
P14_AKT = "https://www.praha14.cz/zivot-na-praze-14/dopravni-omezeni-2/"
P14_HUB = "https://www.praha14.cz/urad-mestske-casti/doprava-v-praze-14/"
P14_CISTENI = "https://www.praha14.cz/urad-mestske-casti/blokove-cisteni-ulic/"
P9_CISTENI = "https://www.praha9.cz/harmonogram-blokoveho-cisteni-jaro-podzim-2026"
PID_STOPS = "https://data.pid.cz/stops/json/stops.json"
PID_INFO = "https://api.golemio.cz/v3/pid/infotexts"

MESICE = [("led", 1), ("uno", 2), ("bre", 3), ("dub", 4), ("kve", 5), ("cervenc", 7),
          ("cerven", 6), ("srp", 8), ("zar", 9), ("rij", 10), ("list", 11), ("pros", 12)]


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def plain(s):
    s = re.sub(r"[‐-―−]", "-", s or "").replace(" ", " ")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def fetch(url, key=None, binary=False, timeout=30, auth=None, accept=None, bearer=None):
    h = {"User-Agent": UA, "Accept-Language": "cs"}
    if key:
        h["X-Access-Token"] = key
        h["Accept"] = "application/json"
    if accept:
        h["Accept"] = accept
    if bearer:
        h["Authorization"] = "Bearer " + bearer
        h["Accept-Encoding"] = "gzip"
    if auth:
        import base64
        h["Authorization"] = "Basic " + base64.b64encode(
            ("%s:%s" % auth).encode("utf-8")).decode("ascii")
        h["Accept-Encoding"] = "gzip"
    url = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        enc = (r.headers.get("Content-Encoding") or "").lower()
    raw = rozbal(raw, enc)
    return raw if binary else raw.decode("utf-8", "replace")


def rozbal(raw, enc=""):
    """Rozhraní ŘSD posílá XML zabalené různě; poznáme to z hlavičky i z obsahu."""
    if "gzip" in enc or raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            jmena = [n for n in z.namelist() if n.lower().endswith(".xml")] or z.namelist()
            return z.read(jmena[0])
    return raw


def text_of(h):
    """HTML -> text, bez skriptů a stylů, se zachovanými zlomy mezi bloky."""
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    h = htmllib.unescape(h)
    h = re.sub(r"[ \t ]+", " ", h)
    return re.sub(r"\n\s*\n+", "\n", h).strip()


# ---------- datum ----------
def mesic_cislo(w):
    w = plain(w)
    for k, n in MESICE:
        if w.startswith(k):
            return n
    return None


def _rok(den, mesic, rok):
    """Bez uvedeného roku bere ten, ve kterém datum padne nejblíž dnešku."""
    if rok:
        try:
            return dt.date(rok, mesic, den)
        except ValueError:
            return None
    nej = None
    for r in (DNES.year - 1, DNES.year, DNES.year + 1):
        try:
            d = dt.date(r, mesic, den)
        except ValueError:
            continue
        if nej is None or abs((d - DNES).days) < abs((nej - DNES).days):
            nej = d
    return nej


def datumy(t, rok_hint=None):
    """Všechna data v textu jako (date, pozice). Bere 1. 2. 2026, 15.10. i 1. února.

    rok_hint použijeme tam, kde je rok uvedený jen u jednoho data v řádku
    (rozpis čištění: „13.04. a 07.10.2026“ jsou obě z roku 2026).
    """
    if rok_hint is None:
        roky = re.findall(r"\b(20\d{2})\b", t)
        rok_hint = int(roky[0]) if len(set(roky)) == 1 else None
    out = []
    for m in re.finditer(r"(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?:\s*(\d{4}))?", t):
        d = _rok(int(m.group(1)), int(m.group(2)), int(m.group(3)) if m.group(3) else rok_hint)
        if d:
            out.append((d, m.start()))
    for m in re.finditer(r"(\d{1,2})\s*\.\s*([a-zA-Zěščřžýáíéůúňťď]+)\s*(\d{4})?", t):
        mo = mesic_cislo(m.group(2))
        if not mo:
            continue
        d = _rok(int(m.group(1)), mo, int(m.group(3)) if m.group(3) else rok_hint)
        if d:
            out.append((d, m.start()))
    out.sort(key=lambda x: x[1])
    return out


def rozsah(t):
    """Z textu vytáhne (od, do). Jedno datum = jednodenní akce; 'do X' = jen konec."""
    ds = [d for d, _ in datumy(t)]
    ds = [d for d in ds if DNES - dt.timedelta(days=400) < d < DNES + dt.timedelta(days=800)]
    if not ds:
        return None, None
    if len(ds) == 1:
        if re.search(r"\bdo\s*$|\bdo\s+\d", plain(t)[:plain(t).find(str(ds[0].day))] or " "):
            return None, ds[0]
        return ds[0], ds[0]
    return min(ds), max(ds)


# ---------- ulice -> souřadnice ----------
def nacti_ulice():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    ulice = {}
    for a in adr:
        k = plain(a[0])
        if not k:
            continue
        u = ulice.setdefault(k, {"n": a[0], "mc": a[5], "lat": 0.0, "lon": 0.0, "k": 0})
        u["lat"] += a[3]
        u["lon"] += a[4]
        u["k"] += 1
    for u in ulice.values():
        u["lat"] /= u["k"]
        u["lon"] /= u["k"]
    return ulice


def vzor(k):
    """Regulár na název ulice včetně skloňování: Kbelská -> Kbelské, Vašátkova -> Vašátkově."""
    slova = k.split()
    slova[-1] = re.escape(slova[-1][:-2]) + r"[a-z]{0,3}" if len(slova[-1]) > 5 else re.escape(slova[-1])
    return r"(?<![a-z])" + r"\s+".join(re.escape(x) if x != slova[-1] else x for x in slova) + r"(?![a-z])"


def ulice_v_textu(t, ulice):
    """Názvy ulic z našeho území nalezené v textu. Krátké názvy jen s 'ul.' před nimi."""
    p = plain(t)
    out = []
    for k, u in ulice.items():
        if len(k) < 5:
            # krátké názvy (K Žižkovu) jen s výslovným "ulice"/"ul." před nimi
            if not re.search(r"\bul(ice|\.)?\s+" + re.escape(k) + r"\b", p):
                continue
        elif not re.search(vzor(k), p):
            continue
        out.append(u)
    # delší název vyhrává nad kratším, který je jeho částí (Kbelská vs. K Žižkovu)
    out.sort(key=lambda u: -len(u["n"]))
    vyb = []
    for u in out:
        if not any(plain(u["n"]) in plain(v["n"]) for v in vyb):
            vyb.append(u)
    return vyb[:4]


# ---------- 1. blokové čištění ----------
def pdf_text(raw):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(raw)
        cesta = f.name
    try:
        return subprocess.run(["pdftotext", "-layout", cesta, "-"], capture_output=True,
                              text=True, timeout=120).stdout
    except FileNotFoundError:
        try:
            from pypdf import PdfReader
            return "\n".join(s.extract_text() or "" for s in PdfReader(cesta).pages)
        except Exception as e:
            log("  pdftotext ani pypdf nejsou k dispozici:", e)
            return ""
    finally:
        os.unlink(cesta)


def najdi_pdf(stranka_url):
    h = fetch(stranka_url)
    odkazy = re.findall(r'href="([^"]+\.pdf[^"]*)"', h, re.I)
    plne = [urllib.parse.urljoin(stranka_url, o) for o in odkazy]
    return plne, h


def cisteni(ulice):
    """Rozpis TSK je po blocích: řádek s termínem, pod ním výčet ulic bloku.

    Datum se proto nehledá na stejném řádku jako ulice (tam skoro nikdy není),
    ale drží se z posledního řádku s termínem, dokud nezačne další blok.
    """
    out = []
    for mc, url in (("14", P14_CISTENI), ("9", P9_CISTENI)):
        try:
            pdfs, _ = najdi_pdf(url)
        except Exception as e:
            log("čištění P%s: stránka nedostupná (%s)" % (mc, e))
            continue
        log("čištění P%s: %d PDF na %s" % (mc, len(pdfs), url))
        for p in pdfs[:3]:
            try:
                t = pdf_text(fetch(p, binary=True, timeout=60))
            except Exception as e:
                log("  PDF %s nešlo stáhnout (%s)" % (p, e))
                continue
            log("  %s -> %d znaků textu" % (p, len(t)))
            bloku, nalez = 0, 0
            terminy = []
            for radek in t.splitlines():
                ds = [d for d, _ in datumy(radek)]
                if ds and re.search(r"(?i)blok|termin|stanovist", plain(radek)):
                    terminy = ds          # začíná nový blok
                    bloku += 1
                    continue
                if not terminy:
                    continue
                ul = ulice_v_textu(radek, ulice)
                if not ul or ds:
                    continue
                for d in terminy:
                    if DNES <= d <= DNES + dt.timedelta(days=200):
                        out.append({"u": ul[0]["n"], "mc": ul[0]["mc"], "d": d.isoformat(),
                                    "od": None, "do": None, "src": p})
                        nalez += 1
            log("  bloků: %d, budoucích záznamů: %d" % (bloku, nalez))
    # stejná ulice ve dvou blocích: necháme nejbližší termín
    nej = {}
    for c in out:
        k = (plain(c["u"]), c["mc"])
        if k not in nej or c["d"] < nej[k]["d"]:
            nej[k] = c
    return sorted(nej.values(), key=lambda c: c["d"])


# ---------- 2a. uzavírky z NDIC (DATEX II) ----------
# Podmínky ŘSD: zdroj se uvádí v tomto přesném znění a jen u nezměněných dat.
NDIC_ZDROJ = "Zdrojem digitalizovaných informací o silničním provozu je NDIC"
NDIC_WEB = "https://www.dopravniinfo.cz/"
# xsi:type situationRecordu -> co z toho ukážeme uživateli a do které sekce to
# patří. „prace“ jsou uzavírky a omezení, „nehoda“ jsou mimořádné události;
# počasí a kolony neukazujeme vůbec.
D_TYPY = [
    ("constructionworks", "Stavební práce", "prace"),
    ("maintenanceworks", "Údržbové práce", "prace"),
    ("roadworks", "Práce na komunikaci", "prace"),
    ("roadorcarriagewayorlanemanagement", "Omezení provozu", "prace"),
    ("generalnetworkmanagement", "Dopravní opatření", "prace"),
    ("winterdrivingmanagement", "Zimní opatření", "prace"),
    ("roadsidework", "Práce u komunikace", "prace"),
    ("generalobstruction", "Překážka na komunikaci", "prace"),
    ("transitinformation", "Dopravní informace", "prace"),
    ("accident", "Nehoda", "nehoda"),
    ("vehicleobstruction", "Porucha vozidla", "nehoda"),
    ("animalpresenceobstruction", "Zvíře na komunikaci", "nehoda"),
]


# Části Prahy 9 a 14, které jednoznačně patří jedné městské části. Sdílené
# (Hloubětín, Libeň, Malešice) schválně vynecháváme – ty rozhodne číslo „Praha 9/14“.
CASTI_9 = ("vysocany", "prosek", "strizkov", "hrdlorezy")
CASTI_14 = ("kyje", "hostavice", "cerny most", "dolni pocernice")
def lok(tag):
    return tag.rsplit("}", 1)[-1].lower()


PRAHA9 = re.compile(r"praha\s*9\b")
PRAHA14 = re.compile(r"praha\s*14\b")


def _cast(casti, t):
    # název části jen jako celé slovo – jinak „kyje“ chytí „Kyjevská“ a „Vysočany“
    # u Chomutova se tváří jako Vysočany v Praze
    return any(re.search(r"\b" + re.escape(c) + r"\b", t) for c in casti)


def mc_z_textu(txt):
    """Městská část z popisu události. ŘSD píše spolehlivě „Praha 9“, „Praha-Kyje“.

    Část se uznává jen ve spojení s „Praha“ – holý název obce (Vysočany, Radeč…)
    existuje i jinde v ČR. Vrací '9', '14', nebo None když to z textu nejde určit.
    """
    t = plain(txt)
    praha = "praha" in t
    je14 = bool(PRAHA14.search(t)) or (praha and _cast(CASTI_14, t))
    je9 = bool(PRAHA9.search(t)) or (praha and _cast(CASTI_9, t))
    if je14 and not je9:
        return "14"
    if je9 and not je14:
        return "9"
    return None


def ndic_typ(el):
    """Druh události z xsi:type; bez něj zkusíme jméno rodičovského elementu."""
    for k, v in el.attrib.items():
        if lok(k) == "type":
            t = v.rsplit(":", 1)[-1].lower()
            for vzorek, popis, kat in D_TYPY:
                if vzorek in t:
                    return popis, kat, t
            return None, None, t
    return None, None, ""


def ndic_text(el):
    """Popis události. Bereme jen <value> pod komentáři, nic nepřepisujeme."""
    casti = []
    for d in el.iter():
        if "comment" not in lok(d.tag):
            continue
        for v in d.iter():
            if lok(v.tag) in ("value", "comment") and (v.text or "").strip():
                t = re.sub(r"\s+", " ", v.text).strip()
                if t not in casti:
                    casti.append(t)
    return " ".join(casti)


def ndic_datum(el):
    """overallStartTime/overallEndTime, případně start/endOfPeriod."""
    casy = {}
    for d in el.iter():
        n = lok(d.tag)
        if not (d.text or "").strip():
            continue
        if n in ("overallstarttime", "startofperiod", "overallendtime", "endofperiod"):
            casy.setdefault(n, d.text.strip()[:10])
    od = casy.get("overallstarttime") or casy.get("startofperiod")
    do = casy.get("overallendtime") or casy.get("endofperiod")
    return od, do


def ndic_souradnice(el):
    """První pár latitude/longitude v záznamu (DATEX nosí geometrii s sebou)."""
    lat = lon = None
    for d in el.iter():
        n = lok(d.tag)
        try:
            if n == "latitude" and lat is None:
                lat = float(d.text)
            elif n == "longitude" and lon is None:
                lon = float(d.text)
        except (TypeError, ValueError):
            continue
        if lat is not None and lon is not None:
            break
    return lat, lon


def ndic_jmeno(el):
    """Názvy ulic a úseků tak, jak je uvádí NDIC (roadName, areaName, …)."""
    out = []
    for d in el.iter():
        if lok(d.tag) in ("roadname", "roadnumber", "areaname", "name", "descriptor") \
                and (d.text or "").strip():
            t = re.sub(r"\s+", " ", d.text).strip()
            if t not in out:
                out.append(t)
    return out[:4]



def datex(url, token, ulice, body=None):
    """Z proxy NDIC vrátí (práce a uzavírky, nehody) jen pro Prahu 9 a 14.

    Data tahá přes Cloudflare Worker (pevná IP, na kterou ŘSD nepouští jen cloud):
    Worker přidá přihlášení k ŘSD a vrátí XML, my se ověřujeme jeho tokenem.

    Umístění do městské části řídí hlavně text události – ŘSD v něm spolehlivě
    uvádí „Praha 9/14“. Souřadnice samy nestačí: geometrie dlouhých silnic a
    objízdných tras zasahuje přes hranici a tahala by sem i Prahu 3, 8 nebo Dubeč.

    Nehody držíme zvlášť: obnovují se po půlhodině a stárnou rychle, zatímco
    uzavírka trvá týdny; v aplikaci mají vlastní sekci s časem poslední kontroly.
    """
    if not (url and token):
        log("DATEX: chybí NDIC_URL/NDIC_TOKEN, přeskočeno")
        return [], []
    # Snímek je velký (celá ČR, ~45 MB); delší limit a jeden opravný pokus.
    raw = None
    for pokus in (1, 2):
        try:
            t = dt.datetime.now()
            raw = fetch(url, binary=True, timeout=300, bearer=token,
                        accept="application/xml, text/xml, */*")
            log("DATEX: staženo %d B za %.0f s (pokus %d)"
                % (len(raw), (dt.datetime.now() - t).total_seconds(), pokus))
            break
        except Exception as e:
            log("DATEX: pokus %d selhal: %s" % (pokus, e))
            if pokus == 2:
                raise
    koren = ET.fromstring(raw)

    out, nehody = [], []
    videno = {}          # id situace -> nejlepší záznam (nejdelší popis)
    poc = {"rec": 0, "mimo_text": 0, "mimo_sour": 0, "bez": 0, "stare": 0, "jine": {}}
    for sit in koren.iter():
        if lok(sit.tag) != "situation":
            continue
        sid = sit.attrib.get("id") or sit.attrib.get("{http://datex2.eu/schema/2/2_0}id")
        for z in sit.iter():
            if lok(z.tag) != "situationrecord":
                continue
            poc["rec"] += 1
            popis, kat, surovy = ndic_typ(z)
            if not popis:
                poc["jine"][surovy] = poc["jine"].get(surovy, 0) + 1
                continue
            od, do = ndic_datum(z)
            if do and do < DNES.isoformat():
                poc["stare"] += 1
                continue
            txt = ndic_text(z)
            # Část určuje text (spolehlivé „Praha 9/14“). Souřadnice samy neberem:
            # geometrie dlouhých silnic a objížděk sahá přes hranici a tahala by
            # sem Prahu 3, 8, Dubeč i stejnojmenné obce odjinud z ČR.
            mc = mc_z_textu(txt)
            if mc is None:
                poc["mimo_text"] += 1
                continue
            lat, lon = ndic_souradnice(z)
            ul = [u["n"] for u in ulice_v_textu(" ".join(ndic_jmeno(z)) + " " + txt, ulice)[:3]]
            zaznam = {
                "n": popis, "mc": mc, "ul": ul or ndic_jmeno(z)[:2],
                "lat": round(lat, 6) if lat is not None else None,
                "lon": round(lon, 6) if lon is not None else None,
                "od": od, "do": do, "p": txt[:300], "u": NDIC_WEB, "z": "ndic",
                "kat": kat,
            }
            # jedna událost (situace) má často víc záznamů (omezení + práce);
            # necháme ten s nejbohatším popisem, ať karta není dvakrát
            klic = sid or id(z)
            stav = videno.get(klic)
            if stav is None or len(txt) > stav["_len"]:
                zaznam["_len"] = len(txt)
                videno[klic] = zaznam
    for z in videno.values():
        kat = z.pop("kat")
        z.pop("_len", None)
        (nehody if kat == "nehoda" else out).append(z)
    log("DATEX: %d situačních záznamů -> %d prací/uzavírek + %d nehod pro P9/14; "
        "zahozeno: %d jiná část, %d mimo souřadnice, %d bez souřadnic, %d prošlé"
        % (poc["rec"], len(out), len(nehody), poc["mimo_text"], poc["mimo_sour"],
           poc["bez"], poc["stare"]))
    if poc["jine"]:
        log("  jiné druhy událostí: %s" % sorted(poc["jine"].items(), key=lambda x: -x[1])[:12])
    return out, nehody


def slouc(ndic, mc_zpravy):
    """NDIC je hlavní zdroj; zprávu MČ zahodíme, když totéž hlásí i evidence."""
    out = list(ndic)
    pridano = 0
    for z in mc_zpravy:
        ulz = {plain(u) for u in (z.get("ul") or [])}
        dvojnik = False
        for n in ndic:
            # městskou část neporovnáváme: u hraničních ulic ji každý zdroj určuje
            # jinak a název ulice je na našem malém území sám o sobě dost jednoznačný
            if not ulz & {plain(u) for u in (n.get("ul") or [])}:
                continue
            # stejná ulice a překrývající se termín = jedna a tatáž uzavírka
            if (not z.get("do") or not n.get("od") or z["do"] >= n["od"]) and \
               (not n.get("do") or not z.get("od") or n["do"] >= z["od"]):
                dvojnik = True
                break
        if not dvojnik:
            z["z"] = "mc"
            out.append(z)
            pridano += 1
    log("sloučení: %d z NDIC + %d z aktualit MČ (%d duplicit zahozeno)"
        % (len(ndic), pridano, len(mc_zpravy) - pridano))
    return out


# ---------- 2b. uzavírky a práce z aktualit MČ ----------
def telo_clanku(h):
    """Text samotného článku, bez menu a bannerů, které jsou na stránce kolem."""
    for vzorek in (r"(?is)<article\b[^>]*>(.*?)</article>",
                   r"(?is)<main\b[^>]*>(.*?)</main>",
                   r'(?is)<div[^>]+class="[^"]*(?:entry-content|node__content|field--name-body|content__text)[^"]*"[^>]*>(.*?)</div>\s*</div>'):
        m = re.search(vzorek, h)
        if m and len(text_of(m.group(1))) > 80:
            return re.sub(r"\s+", " ", text_of(m.group(1))).strip()
    return re.sub(r"\s+", " ", text_of(h)).strip()


def clanky(url, mc, ulice, stran=3):
    """Aktuality odboru dopravy. Teaser často termín neuvádí, proto se otevře i článek.

    Bereme jen položky, kde najdeme ulici z našeho území i termín — to spolehlivě
    odfiltruje navigaci a rubriky, které jsou ve výpisu zamíchané mezi články.
    """
    out, videno = [], set()
    for i in range(1, stran + 1):
        adr = url if i == 1 else url + ("&" if "?" in url else "?") + "page=%d" % i
        try:
            h = fetch(adr)
        except Exception as e:
            log("uzavírky P%s: %s nedostupné (%s)" % (mc, adr, e))
            break
        bloky = re.findall(r"(?is)<article\b.*?</article>", h) or re.findall(r"(?is)<h[23][^>]*>.*?</(?:li|div)>", h)
        log("uzavírky P%s strana %d: %d bloků" % (mc, i, len(bloky)))
        for b in bloky:
            nadpis = re.search(r"(?is)<h[1-4][^>]*>(.*?)</h[1-4]>", b)
            odkaz = re.search(r'(?is)href="([^"]+)"', b)
            if not nadpis or not odkaz:
                continue
            titul = re.sub(r"\s+", " ", text_of(nadpis.group(1))).strip()
            clanek = urllib.parse.urljoin(adr, odkaz.group(1))
            if not titul or clanek in videno or not ulice_v_textu(titul + " " + text_of(b), ulice):
                continue
            videno.add(clanek)
            try:
                telo = telo_clanku(fetch(clanek))
            except Exception as e:
                log("  článek %s nedostupný (%s)" % (clanek, e))
                telo = re.sub(r"\s+", " ", text_of(b)).strip()
            k = telo.find(titul[:40])
            if k >= 0:
                telo = telo[k + len(titul):].strip(" ·|-")
            # v těle stránky jsou i odkazy na jiné uzavírky, proto nadpis rozhoduje
            ul = ulice_v_textu(titul, ulice) or ulice_v_textu(telo[:300], ulice)
            od, do = rozsah(telo[:900])
            if not ul or (not od and not do):
                continue
            if do and do < DNES:
                continue
            out.append({
                "n": titul[:120],
                "mc": mc,
                "ul": [u["n"] for u in ul[:3]],
                "lat": round(ul[0]["lat"], 6),
                "lon": round(ul[0]["lon"], 6),
                "od": od.isoformat() if od else None,
                "do": do.isoformat() if do else None,
                "p": telo[:220].strip(" ·|-"),
                "u": clanek,
            })
    return out


def aktuality(ulice, mame_ndic):
    """Doplněk k NDIC. Když máme evidenci, výpadek webů MČ už není fatální."""
    try:
        return (clanky(P9_AKT, "9", ulice) + clanky(P14_AKT, "14", ulice, 1)
                + clanky(P14_HUB, "14", ulice, 1))
    except Exception as e:
        if not mame_ndic:
            raise
        log("aktuality MČ SELHALY: %s (jedeme jen na NDIC)" % e)
        return []


# ---------- 3. výluky PID ----------
def zastavky():
    d = json.loads(fetch(PID_STOPS, timeout=60))
    skupiny = d.get("stopGroups") or d.get("stops") or []
    out = []
    for g in skupiny:
        try:
            lat, lon = float(g["avgLat"]), float(g["avgLon"])
        except (KeyError, TypeError, ValueError):
            continue
        # 5 km od středu mezi Prahou 9 a 14; aplikace pak filtruje na 1 km od adresy
        if ((lat - 50.1050) * 111.2) ** 2 + ((lon - 14.5350) * 71.4) ** 2 < 25:
            out.append({"n": g.get("name"), "lat": round(lat, 6), "lon": round(lon, 6)})
    return out


def vyluky(key, nazvy):
    if not key:
        log("výluky PID: chybí GOLEMIO_API_KEY, přeskočeno")
        return []
    d = json.loads(fetch(PID_INFO, key=key, timeout=60))
    polozky = d if isinstance(d, list) else (d.get("features") or d.get("data") or [])
    log("výluky PID: %d položek, klíče první: %s" % (
        len(polozky), sorted((polozky[0].get("properties", polozky[0]) if polozky else {}).keys())))
    if polozky:
        log("  UKÁZKA:\n    " + json.dumps(polozky[0], ensure_ascii=False)[:1200])
    out = []
    for p in polozky:
        q = p.get("properties", p)
        txt = " ".join(str(q.get(k, "")) for k in ("text", "description", "title", "display_text", "content"))
        if not txt.strip():
            continue
        # zastávky hlásí samo API; text je záloha, když je seznam prázdný
        dotcene = [s["name"] for s in (q.get("related_stops") or []) if s.get("name") in nazvy]
        if not dotcene:
            dotcene = [n for n in nazvy if n and plain(n) in plain(txt)]
        if not dotcene:
            continue
        vid = []
        for n in dotcene:
            if n not in vid:
                vid.append(n)
        out.append({"t": re.sub(r"\s+", " ", text_of(txt))[:300], "st": vid[:4],
                    "od": (q.get("valid_from") or "")[:10] or None,
                    "do": (q.get("valid_to") or "")[:10] or None,
                    "u": q.get("url") or "https://pid.cz/mimoradnosti/"})
    return out


# ---------- sestavení ----------
def main():
    ulice = nacti_ulice()
    log("ulic z RÚIAN:", len(ulice))
    stare = {}
    cesta = DATA / "doprava.json"
    if cesta.exists():
        stare = json.loads(cesta.read_text(encoding="utf-8"))

    vysledek = {"gen": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    chyby = 0

    # NDIC zvlášť: když rozhraní selže, uzavírky z aktualit MČ se stejně sestaví
    # nehody tahá zvlášť scripts/build_nehody.py každou půlhodinu do nehody.json
    z_ndic = []
    try:
        z_ndic, _ = datex(os.environ.get("NDIC_URL"), os.environ.get("NDIC_TOKEN"),
                          ulice)
        vysledek["ndic"] = bool(os.environ.get("NDIC_URL"))
    except Exception as e:
        chyby += 1
        log("DATEX SELHALO: %s" % e)
        vysledek["ndic"] = False

    for klic, fn in (("cisteni", lambda: cisteni(ulice)),
                     ("uzavirky", lambda: slouc(z_ndic, aktuality(ulice, bool(z_ndic)))),
                     ("zastavky", zastavky)):
        try:
            vysledek[klic] = fn()
            log("%s: %d záznamů" % (klic, len(vysledek[klic])))
        except Exception as e:
            chyby += 1
            vysledek[klic] = stare.get(klic, [])
            log("%s SELHALO: %s (ponechána předchozí data: %d)" % (klic, e, len(vysledek[klic])))
    try:
        vysledek["pid"] = vyluky(os.environ.get("GOLEMIO_API_KEY"),
                                 [z["n"] for z in vysledek.get("zastavky", [])])
        log("pid: %d záznamů" % len(vysledek["pid"]))
    except Exception as e:
        chyby += 1
        vysledek["pid"] = stare.get("pid", [])
        log("pid SELHALO: %s (ponechána předchozí data: %d)" % (e, len(vysledek["pid"])))

    if chyby >= 4:
        (DATA / "doprava_report.txt").write_text("\n".join(LOG), encoding="utf-8")
        sys.exit("Všechny zdroje selhaly, doprava.json se nepřepisuje.")
    cesta.write_text(json.dumps(vysledek, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "doprava_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))
    if chyby:
        sys.exit("%d zdrojů selhalo, podrobnosti v doprava_report.txt" % chyby)


if __name__ == "__main__":
    main()
