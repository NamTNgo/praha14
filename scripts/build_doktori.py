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


def _stahni_text(url, pokusu=2):
    """Text stránky; výpadek spojení nebo 5xx se jednou zopakuje (weby lékařů občas zaváhají)."""
    import time
    for i in range(pokusu):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                if not (r.headers.get_content_type() or "").startswith("text"):
                    return ""
                raw = r.read(700000)
                # kódování z hlavičky, jinak z <meta charset> (starší weby jsou ve windows-1250)
                cs = r.headers.get_content_charset() or ""
                if not cs:
                    m = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', raw[:4000], re.I)
                    cs = m.group(1).decode("ascii", "ignore") if m else "utf-8"
                try:
                    return raw.decode(cs, "replace")
                except LookupError:
                    return raw.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code < 500 or i + 1 == pokusu:
                raise
        except Exception:
            if i + 1 == pokusu:
                raise
        time.sleep(3)


def _odkryj_maily(h):
    """polcare9(a)seznam(,)cz / jmeno [at] domena [dot] cz -> běžný e-mail."""
    h = re.sub(r"\s*(?:\(a\)|\[at\]|\(at\)|\{at\}| zavináč )\s*", "@", h, flags=re.I)
    return re.sub(r"(@[a-z0-9.-]+?)\s*(?:\(,\)|\(\.\)|\[dot\]|\(dot\)| tečka )\s*", r"\1.", h, flags=re.I)


TEL_KONTEXT = re.compile(r"(?:tel(?:efon)?\.?|mobil|mob\.|objedn\w*|volejte|kontakt\w*|recepce|☎|📞)[^\d+]{0,20}(\+?420[\s ]?)?(\d{3}[\s ]?\d{3}[\s ]?\d{3})"
                         r"|\+420[\s ]?(\d{3}[\s ]?\d{3}[\s ]?\d{3})", re.I)


def _tel_z_textu(html):
    """Telefon z viditelného textu, jen když u něj stojí „tel.“, „telefon“… nebo +420
    (čísla ze skriptů a stylů typu 255 255 255 nejsou telefony)."""
    t = " ".join(" ".join(r) for r in _html_na_radky(html))
    return [m.group(2) or m.group(3) for m in TEL_KONTEXT.finditer(t)]


def tel_platny(t):
    """České číslo: 9 číslic, nezačíná 0 ani 1 a nejsou to samé stejné číslice (999 999 999)."""
    d = re.sub(r"\D", "", t or "")
    if len(d) == 12 and d.startswith("420"):
        d = d[3:]
    return len(d) == 9 and d[0] in "23456789" and len(set(d)) > 1


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
            html = _odkryj_maily(html)
            maily += [m.lower() for m in re.findall(r"mailto:([^\"'?>\s]+)", html, re.I)]
            maily += [m.lower() for m in EMAIL_RE.findall(html)]
            tel_odkazy += re.findall(r"tel:\+?([0-9\s ]{6,})", html)   # strukturované = jisté
            tel_text += _tel_z_textu(html)                                  # z textu = méně jisté
            has_mail = any(m.split("@")[-1].endswith(dom) for m in maily)
            if tel_odkazy and has_mail:
                break
        if nacteno:
            break   # když první scheme načetl stránky, nestřídej na http
    mail = next((m for m in maily if m.split("@")[-1].endswith(dom)), "")
    mail_free = next((m for m in maily if m.split("@")[-1] in FREEMAIL), "")
    tel_odkaz = next((t for t in map(_norm_tel, tel_odkazy) if t and tel_platny(t)), "")
    tel_volny = next((t for t in map(_norm_tel, tel_text) if t and tel_platny(t)), "")
    return tel_odkaz, tel_volny, mail, mail_free, nacteno


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
        tel_odkaz, tel_volny, mail, mail_free, nacteno = kont.get(r["w"], ("", "", "", "", False))
        if not nacteno:
            # web teď neodpověděl – nech kontakty z minulého běhu (ty už z webu opravené byly)
            pred = PREDCHOZI.get(r["id"]) or {}
            for k in ("tel", "e"):
                if pred.get(k):
                    r[k] = pred[k]
            continue
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
        # neplatné číslo z registru (035…, 154…, 999 999 999) bereme jako chybějící
        if r.get("tel") and not tel_platny(r["tel"]):
            r["tel"] = ""
        # telefon: tel: odkaz přepíše registr; volné číslo jen doplní chybějící
        if tel_odkaz and _norm_tel(r.get("tel", "")) != tel_odkaz:
            r["tel"] = tel_odkaz
            pt += 1
        elif tel_volny and not r.get("tel"):
            r["tel"] = tel_volny
            pt += 1
    log("z webů doplněno/opraveno: %d telefonů, %d e-mailů" % (pt, pe))


# ---------------------------------------------------------------- ordinační hodiny
DNY = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
_DEN_PLNE = {"pondeli": 0, "utery": 1, "streda": 2, "ctvrtek": 3, "patek": 4, "sobota": 5, "nedele": 6}
_DEN_ZKR = {"po": 0, "ut": 1, "st": 2, "ct": 3, "pa": 4, "so": 5, "ne": 6}
_DEN_TOK = r"(pondeli|utery|streda|ctvrtek|patek|sobota|nedele|po|ut|st|ct|pa|so|ne)\b\.?"
# den, nebo seznam/rozsah dnů: „Po“, „po-pá“, „Pondělí až pátek“, „Po, Út, Čt“, „po a st“
_DEN_RE = re.compile(r"^[\s•·*\-–]*" + _DEN_TOK + r"((?:\s*(?:[-–—]|az|a|,|\+|/|(?<=[.\s]))\s*" + _DEN_TOK + r")*)\s*:?\s*", re.I)
_DEN_DALSI = re.compile(r"\s*([-–—]|az|a|,|\+|/|(?<=[.\s]))\s*" + _DEN_TOK, re.I)
_CAS_RE = re.compile(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hod\.?)?\s*(?:[-–—~]|do)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b")
# volnější tvar „8 - 11“, „08-12 h“, „13–16 hod.“ – jen u řádků, které už patří ke dni
_CAS_VOLNY = re.compile(r"(?<![\d.:/])\b([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*(?:h|hod\.?)?\s*(?:[-–—~]|do|až)\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b(?![.:/]?\d)(?!\.\s?\d)")
_ZAVRENO = re.compile(r"zavreno|neordinuj|neordinace|dovolen", re.I)


def _bez_diakr(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def _html_na_radky(html):
    import html as htmlmod
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    # „Po<span class="d-none">ndělí</span>“ – slovo rozdělené značkou nerozlamovat mezerou
    h = re.sub(r"(?<=[^\W\d_])<(span|b|strong|em|i|small)\b[^>]*>(?=[^\W\d_])", "", h)
    h = re.sub(r"(?i)</t[dh]\s*>", "\t", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|section|article|table|ul|ol|dt|dd)\s*>", "\n", h)
    h = htmlmod.unescape(re.sub(r"<[^>]+>", " ", h)).replace("\xa0", " ")
    radky = []
    for r in h.split("\n"):
        bunky = [re.sub(r"\s+", " ", b).strip() for b in r.split("\t")]
        if len(bunky) > 1 and not bunky[-1]:
            bunky.pop()   # text za posledním </td> – prázdné buňky uvnitř řádku ale nechat
        while bunky and not bunky[0]:
            bunky.pop(0)
        if bunky:
            radky.append(bunky)
    return radky   # každý řádek = seznam buněk (u textu jen jedna)


def _casy(text, volne=False):
    """[('8:00 – 11:00', ...)], zbytek textu bez časů. volne=True bere i časy bez minut."""
    rx = _CAS_VOLNY if volne else _CAS_RE
    out = []
    for m in rx.finditer(text):
        ma, mb = m.group(2) or "00", m.group(4) or "00"
        a, b = int(m.group(1)) * 60 + int(ma), int(m.group(3)) * 60 + int(mb)
        if a < b and (volne is False or m.group(2) or m.group(4) or b - a <= 14 * 60):
            out.append("%d:%s – %d:%s" % (int(m.group(1)), ma, int(m.group(3)), mb))
    zbytek = rx.sub(" ", text)
    return out, zbytek


def _stitek(s):
    s = re.sub(r"\bhod(in)?\.?(?=\s|$)", " ", s or "", flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" ,;-–—|/()*")
    # „Svátek:“ = nadpis pro další řádek; čísla v popisku = rozbité časy
    if not s or s.endswith(":") or re.search(r"\d", s) or len(s) > 60 \
            or not re.search(r"[A-Za-zÀ-ž]{3}", s):
        return ""
    return s[0].upper() + s[1:]


def _radky_casu(text, stitek="", volne=True):
    casy, zbytek = _casy(text, volne)
    st = stitek or _stitek(zbytek)
    return [c + (" · " + st if st else "") for c in casy]


def _den_z_radku(bunka):
    """(seznam indexů dnů, zbytek textu) nebo None."""
    m = _DEN_RE.match(_bez_diakr(bunka))
    if not m:
        return None
    a = m.group(1).lower()
    plne = a in _DEN_PLNE
    zbytek = bunka[m.end():]
    # zkratky (Po, St…) jen když hned za nimi následuje čas (nebo nic) – „Po předchozím
    # objednání v pondělí od 8 do 12“ není rozpis ordinačních hodin
    if not plne:
        z = zbytek.strip(" .:")
        if z and not re.match(r"\d|zavren|neordin|-\s*$", _bez_diakr(z)):
            return None
    idx = lambda t: _DEN_PLNE.get(t.lower(), _DEN_ZKR.get(t.lower()))
    dny = [idx(a)]
    for sep, tok in _DEN_DALSI.findall(m.group(2) or ""):
        j = idx(tok)
        if sep in ("-", "–", "—", "az"):
            if j < dny[-1]:
                return None
            dny += list(range(dny[-1] + 1, j + 1))
        else:
            dny.append(j)
    return sorted(set(dny)), zbytek


_ROZDEL = re.compile(r"(?:(?<=[,;|])|(?<=hodiny)|(?<=doba)|(?<=:))\s*(?=(?:pondeli|utery|streda|ctvrtek|patek|sobota|nedele|po|ut|st|ct|pa|so|ne)\b)", re.I)


def _rozdel(radky):
    """„Po 7:00-16:00, Út 7:30-15:30“ nebo „ordinační hodiny Úterý 11–18“ -> zvláštní řádky po dnech."""
    out = []
    for bunky in radky:
        if len(bunky) != 1:
            out.append(bunky)
            continue
        t = bunky[0]
        p = _bez_diakr(t)
        rezy = [0]
        for m in _ROZDEL.finditer(p):
            z = m.start()
            # řezat jen tam, kde předchozí kus už svůj čas má, nebo to není den („Po, Út, Čt: 8–12“ je jeden kus)
            if z > 0 and _den_z_radku(t[z:].lstrip()) and _casy(t[z:z + 40], True)[0] \
                    and (_casy(t[rezy[-1]:z], True)[0] or not _den_z_radku(t[rezy[-1]:z].strip(" ,;|") or "x")):
                rezy.append(z)
        if len(rezy) == 1:
            out.append(bunky)
            continue
        for i, z in enumerate(rezy):
            kus = t[z:rezy[i + 1] if i + 1 < len(rezy) else len(t)].strip(" ,;|")
            if kus:
                out.append([kus])
    return out


def hodiny_z_textu(radky):
    """Najde blok dnů s časy. Zvládá tabulku (dny v řádcích, sloupce s hlavičkou)
    i seznam (den na vlastním řádku, pod ním časy)."""
    radky = _rozdel(radky)
    bloky, blok, hlavicka, posl_den, mezera = [], None, None, None, 0
    meta, kratka_mezera = None, False   # {"start", "end", "nadpis"} k aktuálnímu bloku
    for i, bunky in enumerate(radky):
        d = _den_z_radku(bunky[0])
        if d:
            dny, zbytek = d
            if blok is None or any(x in blok for x in dny):
                if blok:
                    bloky.append((blok, meta))
                blok = {}
                meta = {"start": i, "end": i, "nadpis": _nadpis_bloku(radky, i)}
                # hlavička tabulky = předchozí vícesloupcový řádek bez dnů a časů
                prev = radky[i - 1] if i else []
                hlavicka = prev if len(prev) > 1 and not _casy("\t".join(prev))[0] else None
            lines = []
            if len(bunky) > 1:
                lines += _radky_casu(zbytek)   # „PO-ČT 9-12 | 13-16“: čas může být i v buňce se dnem
                if not any(_casy(x, True)[0] for x in bunky[1:]):
                    # „Po | : | 9:00 | ~ | 16:00“ – čas rozsekaný do buněk
                    lines += _radky_casu(" ".join(bunky[1:]))
                for j, b in enumerate(bunky[1:], start=1):
                    st = ""
                    if hlavicka:
                        k = j - (len(bunky) - len(hlavicka))   # hlavička bývá bez prvního sloupce
                        st = _stitek(hlavicka[k]) if 0 <= k < len(hlavicka) else ""
                    lines += _radky_casu(b, st)
            else:
                lines += _radky_casu(zbytek)
            if not lines and _ZAVRENO.search(_bez_diakr(" ".join(bunky))):
                lines = ["zavřeno"]
            for x in dny:
                blok[x] = list(lines)
            posl_den, mezera, meta["end"] = dny, 0, i
            continue
        if blok is None:
            continue
        text = " ".join(bunky)
        casy = _radky_casu(text)
        # řádek, který zmiňuje další den („Odběry: po, stř 7:30–10:00“, „1× za 14 dní pondělí 13–18“), už k dni nepatří
        vic_dnu = len(re.findall(r"\b(po|ut|st|str|ct|pa|so|ne|pondeli|utery|streda|ctvrtek|patek)\b",
                                 _bez_diakr(text))) >= 1
        if casy and posl_den is not None and (mezera == 0 or (mezera == 1 and kratka_mezera)) and not vic_dnu:
            for x in posl_den:
                blok[x] += [c for c in casy if c not in blok[x]]
            meta["end"] = i
            mezera = 0
            continue
        if posl_den is not None and mezera == 0 and _ZAVRENO.search(_bez_diakr(text)):
            for x in posl_den:
                blok[x] = blok[x] or ["zavřeno"]
            continue
        mezera += 1
        kratka_mezera = mezera == 1 and len(text) <= 40
        if mezera > 2:   # blok skončil
            bloky.append((blok, meta))
            blok, posl_den = None, None
    if blok:
        bloky.append((blok, meta))
    dobre = [(b, m) for b, m in bloky if sum(1 for v in b.values() if v and v != ["zavřeno"]) >= 3]
    if not dobre:
        return None
    # Hodiny rozdělené do sousedních bloků s nadpisy (Odběry | Pro nemocné | Pro objednané)
    # spojíme do jednoho rozpisu; nadpis se stane popiskem časů.
    skupina = [dobre[0]]
    for b, m in dobre[1:]:
        pb, pm = skupina[-1]
        if m["start"] - pm["end"] <= 4 and m["nadpis"] and pm["nadpis"] and m["nadpis"] != pm["nadpis"]:
            skupina.append((b, m))
        else:
            break
    if len(skupina) == 1:
        b = skupina[0][0]
        return [[DNY[k], b[k]] for k in sorted(b) if b[k]]
    spojeno = {}
    for b, m in skupina:
        for k, casy in b.items():
            for c in casy:
                if c == "zavřeno":
                    continue
                spojeno.setdefault(k, []).append(c if " · " in c else c + " · " + m["nadpis"])
    def zacatek(c):
        h, mi = c.split(" ")[0].split(":")
        return int(h) * 60 + int(mi)
    return [[DNY[k], sorted(spojeno[k], key=zacatek)] for k in sorted(spojeno)]


_NADPIS_NE = re.compile(r"hodin|letn|prazdnin|dovolen|zimn|svat|zmen|kontakt|adres", re.I)


def _nadpis_bloku(radky, i):
    """Krátký nadpis těsně nad blokem dnů („Pro nemocné“), jinak "".
    Nadpis může být zalomený do dvou řádků („Ordinační hodiny pro zdravé / a kojence“)."""
    casti = []
    for j in (i - 1, i - 2):
        if j < 0:
            break
        r = radky[j]
        if len(r) != 1 or _casy(r[0])[0] or _den_z_radku(r[0]) or len(r[0]) > 40:
            break
        casti.insert(0, r[0])
        if not r[0][:1].islower():
            break   # druhý řádek přibírat jen u pokračování („… pro zdravé / a kojence“)
    t = re.sub(r"(?i)^ordina\S*\s+hodiny\s*", "", " ".join(casti)).strip()
    st = _stitek(t)
    if st and len(st) <= 30 and not _NADPIS_NE.search(_bez_diakr(st)):
        return st
    return ""


_SCHEMA_DNY = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
               "mo": 0, "tu": 1, "we": 2, "th": 3, "fr": 4, "sa": 5, "su": 6}


def _cas_hm(t):
    m = re.match(r"(\d{1,2}):(\d{2})", t or "")
    return (int(m.group(1)), m.group(2)) if m else None


def _zacatek(c):
    h, mi = c.split(" ")[0].split(":")
    return int(h) * 60 + int(mi)


def hodiny_z_jsonld(html):
    """schema.org openingHoursSpecification / openingHours ze <script type=application/ld+json>."""
    dny = {}

    def pridej(den, od, do, popis=""):
        a, b = _cas_hm(od), _cas_hm(do)
        if den is None or not a or not b or a[0] * 60 + int(a[1]) >= b[0] * 60 + int(b[1]):
            return
        st = _stitek(re.sub(r"(?i)^ordina\S*\s+hodiny\s*", "", popis or ""))
        c = "%d:%s – %d:%s" % (a[0], a[1], b[0], b[1]) + (" · " + st if st else "")
        if c not in dny.setdefault(den, []):
            dny[den].append(c)

    def projdi(o):
        if isinstance(o, list):
            for x in o:
                projdi(x)
        elif isinstance(o, dict):
            for k, v in o.items():
                if k == "openingHoursSpecification":
                    for sp in (v if isinstance(v, list) else [v]):
                        if not isinstance(sp, dict):
                            continue
                        dd = sp.get("dayOfWeek")
                        for d in (dd if isinstance(dd, list) else [dd]):
                            den = _SCHEMA_DNY.get(str(d or "").rstrip("/").split("/")[-1].lower())
                            pridej(den, sp.get("opens"), sp.get("closes"), sp.get("description") or sp.get("name") or "")
                elif k == "openingHours":
                    for t in (v if isinstance(v, list) else [v]):
                        m = re.match(r"\s*([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", str(t))
                        if m:
                            a = _SCHEMA_DNY.get(m.group(1).lower())
                            b = _SCHEMA_DNY.get((m.group(2) or m.group(1)).lower())
                            if a is not None and b is not None:
                                for d in range(a, b + 1):
                                    pridej(d, m.group(3), m.group(4))
                else:
                    projdi(v)

    # mikrodata: <meta itemprop="openingHours" content="Mo 07:30-11:30">
    mikro = re.findall(r'itemprop=["\']openingHours["\'][^>]*content=["\']([^"\']+)', html or "", re.I) + \
        re.findall(r'content=["\']([^"\']+)["\'][^>]*itemprop=["\']openingHours', html or "", re.I)
    if mikro:
        projdi({"openingHours": mikro})
    for blok in re.findall(r'(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html or ""):
        try:
            projdi(json.loads(blok, strict=False))
        except Exception:
            continue
    if sum(1 for v in dny.values() if v) < 3:
        return None
    return [[DNY[k], sorted(dny[k], key=_zacatek)] for k in sorted(dny)]


def _hodiny_ze_stranky(html):
    """Strukturovaná data (schema.org) mají přednost před čtením textu."""
    return hodiny_z_jsonld(html) or hodiny_z_textu(_html_na_radky(html or ""))


# pobočky jinde (Barrandov, Karlovo nám., Ostrava-Bartovice…) – jejich hodiny k místu v Praze 9/14 nepatří
_CIZI_MISTA = re.compile(r"(?:^|[/_.\-])(?:barrandov|karlov|bartovic|vinohrad|smichov|zizkov|dejvic|branik|modran|chodov|haje|stodulk|zlicin|"
                         r"letnan|kbel|liben|karlin|nusle|krc(?![a-z])|pankrac|michle|strasnic|vrsovic|holesovic|bubenec|brevnov|"
                         r"repy|petrin|budejovick|andel|florenc|radlic|mecholup|uhrinev|kladno|brno|ostrav|plzen|olomouc|"
                         r"jilove|beroun|benesov|mlada-boleslav|liberec|pardubic|hradec|ceske-budejovic|jihlav|zlin)")
_NASE_MISTA = re.compile(r"praha-?9|praha-?14|prosek|vysocan|hloubetin|cerny-?most|kyje|hostavic|lehovec|"
                         r"bechovic|dolni-pocernic|horni-pocernic")


def _cizi_pobocka(url):
    """URL podstránky jmenuje jiné místo než Prahu 9/14 → hodiny jsou jiné pobočky."""
    cesta = _bez_diakr(urllib.parse.unquote(urllib.parse.urlparse(url).path)).replace(" ", "-")
    return bool(_CIZI_MISTA.search(cesta)) and not _NASE_MISTA.search(cesta)


def hodiny_z_webu(w):
    host = (w or "").split("/")[0]
    base = None
    kandidati = []
    vlastni = w if "/" in w else w + "/"     # web jako podstránka (gynekolog.cz/karhan) – začni na ní
    for scheme in ("https://", "http://"):
        try:
            html = _stahni_text(scheme + vlastni)
        except Exception:
            continue
        if html:
            base = scheme + host
            kandidati.append((scheme + vlastni, html))
            break
    if not base:
        return NENACTENO
    # odkazy na stránku s hodinami / kontaktem
    odkazy = []
    for href, txt in re.findall(r'<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', kandidati[0][1], re.I | re.S):
        t = _bez_diakr(href + " " + re.sub(r"<[^>]+>", " ", txt))
        if "hodin" in t or "ordinac" in t or "kontakt" in t:
            u = urllib.parse.urljoin(kandidati[0][0], href)
            if _domena(urllib.parse.urlparse(u).hostname or "") == _domena(host) and u not in odkazy:
                odkazy.append(u)
    odkazy.sort(key=lambda u: 0 if "hodin" in _bez_diakr(u) else 1)
    for c in ("/ordinacni-hodiny/", "/kontakt/", "/kontakt"):
        if base + c not in odkazy:
            odkazy.append(base + c)
    odkazy = [u for u in odkazy if not _cizi_pobocka(u)]
    for url, html in kandidati:
        r = _hodiny_ze_stranky(html)
        if r:
            return {"r": r, "u": url}
    for url in odkazy[:6]:
        try:
            html = _stahni_text(url)
        except Exception:
            continue
        r = _hodiny_ze_stranky(html)
        if r:
            return {"r": r, "u": url}
    return None


NENACTENO = "nenacteno"
PREDCHOZI = {}   # id -> záznam z minulého běhu (načte main); slouží jako záloha při výpadku webu


def doplnit_hodiny(out):
    weby = sorted({r["w"] for r in out if r.get("w")})
    if not weby:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        hod = dict(zip(weby, ex.map(lambda w: _bezpecne(hodiny_z_webu, w), weby)))
    n = drz = 0
    for r in out:
        h = hod.get(r.get("w"))
        if h == NENACTENO:
            # web se teď nenačetl – nech hodiny z minula (pokud byly)
            h = (PREDCHOZI.get(r["id"]) or {}).get("hod")
            drz += bool(h)
        if h:
            r["hod"] = h
            n += 1
    if drz:
        log("  hodiny ponechány z minula (web se nenačetl): %d" % drz)
    hod = {w: (None if h == NENACTENO else h) for w, h in hod.items()}
    log("ordinační hodiny z webů: %d lékařů (%d webů z %d)" % (n, sum(1 for v in hod.values() if v), len(weby)))
    log("  bez hodin: " + ", ".join(w for w, h in sorted(hod.items()) if not h))
    for w, h in sorted(hod.items()):
        if h:
            log("  ✓ %s  %s" % (w, " | ".join(d + " " + ", ".join(t) for d, t in h["r"]))[:200])


def _vykresli_web(ctx, w):
    """Web vykreslený v prohlížeči: {url: text} + odkazy tel:/mailto:. Pro weby, které
    obsah skládají skriptem (Wix, Webnode, SPA) a obyčejné stažení HTML je prázdné."""
    host = w.split("/")[0].split(":")[0]
    p = ctx.new_page()
    stranky, tel, mail = {}, [], []
    try:
        p.goto("https://" + w, wait_until="domcontentloaded", timeout=30000)
        p.wait_for_timeout(2500)
        start = p.url
        if _domena(urllib.parse.urlparse(start).hostname or "") != _domena(host):
            return {}, [], []   # přesměrováno na cizí web
        stranky[start] = p.inner_text("body")
        odkazy = p.eval_on_selector_all("a", "els => els.map(a => [a.href, (a.innerText||'') + ' ' + (a.getAttribute('href')||'')])")
        vid = []
        for href, t in odkazy:
            u = (href or "").split("#")[0]
            t = _bez_diakr(t)
            if (u.startswith("http") and u != start and u not in vid and not _cizi_pobocka(u)
                    and ("hodin" in t or "ordinac" in t or "kontakt" in t)
                    and _domena(urllib.parse.urlparse(u).hostname or "") == _domena(host)):
                vid.append(u)
        vid.sort(key=lambda u: 0 if "hodin" in _bez_diakr(u) else 1)
        for u in vid[:6]:
            try:
                p.goto(u, wait_until="domcontentloaded", timeout=25000)
                p.wait_for_timeout(1500)
                stranky[u] = p.inner_text("body")
                odkazy += p.eval_on_selector_all("a", "els => els.map(a => [a.href, ''])")
            except Exception:
                pass
        for href, _ in odkazy:
            h = urllib.parse.unquote(href or "")
            if h.lower().startswith("tel:"):
                tel.append(h[4:])
            elif h.lower().startswith("mailto:"):
                mail.append(h[7:].split("?")[0].lower())
    except Exception as e:
        log("  ! prohlížeč %s: %s" % (w, str(e)[:80]))
    finally:
        p.close()
    return stranky, tel, mail


def doplnit_z_prohlizece(out):
    """Co se z obyčejného HTML nepodařilo (hodiny, telefon, e-mail), zkusí z webu vykresleného
    v Chromiu. Jen doplňuje prázdné údaje, nic nepřepisuje."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("prohlížeč (playwright) není k dispozici – přeskakuji vykreslené weby")
        return
    weby = sorted({r["w"] for r in out if r.get("w") and not (r.get("hod") and r.get("tel") and r.get("e"))})
    log("vykresluji v prohlížeči %d webů s chybějícími údaji…" % len(weby))
    vysl = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(locale="cs-CZ", user_agent=BROWSER_UA, ignore_https_errors=True)
        for w in weby:
            vysl[w] = _vykresli_web(ctx, w)
        b.close()
    nh = nt = ne = 0
    for r in out:
        if r.get("w") not in vysl:
            continue
        stranky, tel, mail = vysl[r["w"]]
        if not stranky:
            continue
        dom = _domena(r["w"].split("/")[0])
        if not r.get("hod"):
            for u, t in stranky.items():
                radky = [[c.strip() for c in l.split("\t") if c.strip()] for l in t.split("\n")]
                h = hodiny_z_textu([x for x in radky if x])
                if h:
                    r["hod"] = {"r": h, "u": u}
                    nh += 1
                    break
        text = _odkryj_maily("\n".join(stranky.values()))
        if not r.get("e"):
            maily = mail + [m.lower() for m in EMAIL_RE.findall(text)]
            m = next((m for m in maily if m.split("@")[-1].endswith(dom)), "") or \
                next((m for m in maily if m.split("@")[-1] in FREEMAIL), "")
            if m:
                r["e"] = m
                ne += 1
        if not r.get("tel"):
            t = next((t for t in map(_norm_tel, tel) if t and tel_platny(t)), "") or \
                next((t for t in (_norm_tel(m.group(2) or m.group(3)) for m in TEL_KONTEXT.finditer(text)) if t and tel_platny(t)), "")
            if t:
                r["tel"] = t
                nt += 1
    log("z vykreslených webů doplněno: %d hodin, %d telefonů, %d e-mailů" % (nh, nt, ne))


POLIKLINIKA_PROSEK = "https://www.poliklinikaprosek.cz/lekarska-pracoviste"
_PRAVNI = re.compile(r"\b(s\.?\s?r\.?\s?o|spol|a\.?\s?s|ico[:\s\d]*|mudr|mddr|mgr|ph\.?d|csc|mba|dr|prof|ing)\b\.?|[.,]", re.I)


def _klic_nazvu(s):
    return re.sub(r"\s+", " ", _PRAVNI.sub(" ", plain(s))).strip()


def doplnit_polikliniku_prosek(out):
    """Poliklinika Prosek (Lovosická 440/40) zveřejňuje u každého pracoviště tabulku
    lékař – telefon – e-mail – organizace. Doplní chybějící telefony a e-maily
    ordinacím na této adrese (i těm bez vlastního webu)."""
    nase = [r for r in out if r["a"].startswith("Lovosická 440/40") and (not r.get("tel") or not r.get("e"))]
    if not nase:
        return
    try:
        rozc = _stahni_text(POLIKLINIKA_PROSEK)
    except Exception as e:
        log("poliklinika Prosek nedostupná: %s" % e)
        return
    stranky = sorted(set(re.findall(r'href=["\'](?:https://www\.poliklinikaprosek\.cz)?(/lekarska-pracoviste/[a-z0-9-]+)["\']', rozc)))
    radky = []   # (lékař, telefon, email, organizace)
    for st in stranky:
        try:
            h = _stahni_text("https://www.poliklinikaprosek.cz" + st)
        except Exception:
            continue
        for b in _html_na_radky(h or ""):
            if len(b) >= 5 and re.search(r"\d{3}\s?\d{3}\s?\d{3}|@", " ".join(b[2:4])):
                radky.append((b[0], b[2], b[3], b[4]))
    log("poliklinika Prosek: %d stránek pracovišť, %d řádků lékařů" % (len(stranky), len(radky)))
    nt = ne = 0
    for r in nase:
        kn = _klic_nazvu(r["n"])
        kand = [x for x in radky if _klic_nazvu(x[3]) and (_klic_nazvu(x[3]) == kn)]
        if not kand:
            # „MUDr. Hana Skalická CSc.“ ↔ „MUDr. Skalická Hana“: obě slova jména v názvu ordinace
            kand = [x for x in radky if (lambda sl: len(sl) >= 2 and all(w in kn.split() for w in sl))(_klic_nazvu(x[0]).split()[:2])]
        if not kand:
            continue
        if not r.get("tel"):
            t = next((_norm_tel(x[1]) for x in kand if tel_platny(_norm_tel(x[1]))), "")
            if t:
                r["tel"] = t
                nt += 1
        if not r.get("e"):
            m = next((x[2].strip().lower() for x in kand if EMAIL_RE.fullmatch(x[2].strip())), "")
            if m:
                r["e"] = m
                ne += 1
    log("z polikliniky Prosek doplněno: %d telefonů, %d e-mailů" % (nt, ne))


def _bezpecne(f, *a):
    try:
        return f(*a)
    except Exception as e:
        log("  ! %s: %s" % (a[0], e))
        return None


def sjednotit_telefony(out):
    """Telefony z registru (+420266610451) do stejného tvaru jako z webu (266 610 451)."""
    for r in out:
        t = _norm_tel(r.get("tel", ""))
        if t:
            r["tel"] = t
        if r.get("tel") and not tel_platny(r["tel"]):
            r["tel"] = ""


def rucni_prepisy(out, klice=("tel", "e", "w", "hod")):
    """Ruční opravy z scripts/doktori_rucne.json – mají poslední slovo."""
    p = Path(__file__).resolve().parent / "doktori_rucne.json"
    try:
        prep = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return
    n = 0
    for r in out:
        for k, v in (prep.get(r["id"]) or {}).items():
            if k in klice:
                if k == "hod" and not v:
                    r.pop("hod", None)
                else:
                    r[k] = v
                n += 1
    log("ručních přepisů kontaktů: %d" % n)


def web_zije(w):
    """True = web žije na své doméně. False = jistě mrtvý (404/410) nebo přesměrovaný
    na cizí doménu. None = nepodařilo se ověřit (výpadek spojení, 5xx) – rozhodne minulý běh.

    Prošlé/prodané domény (etoile.cz -> zonky.cz) se poznají podle přesměrování
    na cizí doménu. Pomalý web ani bot-blokaci nezahazujeme.
    """
    import time
    host = (w or "").split("/")[0]
    cil = _domena(host)
    if not cil or "." not in cil:
        return False
    for pokus in range(3):
        for scheme in ("https://", "http://"):
            try:
                req = urllib.request.Request(scheme + w, headers={"User-Agent": BROWSER_UA})
                with urllib.request.urlopen(req, timeout=15) as r:
                    fin = urllib.parse.urlparse(r.geturl()).hostname or ""
                    if _domena(fin) != cil:
                        return False
                    # zrušený web na subdoméně hostingu (ocni-x.mypage.cz -> mypage.cz)
                    bez = lambda h: h.lower()[4:] if h.lower().startswith("www.") else h.lower()
                    if bez(host).count(".") >= 2 and bez(fin) == cil and bez(host) != cil:
                        return False
                    return True
            except urllib.error.HTTPError as e:
                if e.code in (404, 410):
                    return False
                if e.code < 500:
                    return True    # 401/403/429 = blokace bota, web ale žije
            except (socket.timeout, TimeoutError):
                return True
            except Exception:
                pass
        time.sleep(4)
    return None


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
    minule = {r.get("w") for r in PREDCHOZI.values() if r.get("w")}
    nejiste = [w for w in k_overeni if stav.get(w) is None]
    if nejiste:
        log("  web se nepodařilo ověřit (necháváme, pokud byl i minule): " + ", ".join(nejiste))

    def ok(w):
        if _domena(w.split("/")[0]) in block:
            return False
        st = stav.get(w, True)
        return w in minule if st is None else st
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
    nespar = skip_nelekar = mimo = 0
    log("sloupce registru: " + ", ".join(k for k in (rdr.fieldnames or []) if k.startswith("ZZ_")))
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
        # stejná ulice a číslo existují i mimo Prahu (Teplická 270 v Jílovém u Děčína) –
        # obec z registru musí být Praha a GPS registru nesmí ležet daleko od naší adresy
        obec = next((v for k, v in row.items() if k and k.lower() in ("zz_obec", "zz_obec_nazev", "zz_mesto")), None)
        if obec is not None and obec.strip() and not plain(obec).startswith("praha"):
            mimo += 1
            continue
        glat, glon = gps(row.get("ZZ_GPS"))
        if glat and glat < glon:            # pořadí v POINT() – v Česku je šířka ~50, délka ~15
            glat, glon = glon, glat
        if glat and lat and (abs(glat - lat) > 0.03 or abs(glon - lon) > 0.045):
            mimo += 1
            continue
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

    try:
        PREDCHOZI.update({r["id"]: r for r in json.loads((DATA / "doktori.json").read_text(encoding="utf-8"))})
    except Exception:
        pass
    proper_weby(out)
    rucni_prepisy(out, ("w",))   # opravené weby ať se procházejí už při hledání kontaktů a hodin
    doplnit_kontakty(out)
    doplnit_hodiny(out)
    doplnit_z_prohlizece(out)
    _bezpecne(doplnit_polikliniku_prosek, out)
    sjednotit_telefony(out)
    rucni_prepisy(out)

    (DATA / "doktori.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    from collections import Counter
    kat = Counter(r["o"] for r in out)
    mc = Counter(r["mc"] for r in out)
    log("\nlékařů v Praze 9 a 14: %d" % len(out))
    log("podle MČ: " + ", ".join("Praha %s=%d" % (k, v) for k, v in sorted(mc.items())))
    log("podle kategorie: " + ", ".join("%s=%d" % (k, kat[k]) for k in PRIORITA))
    log("nespárováno s našimi adresami: %d | vyřazeno nelékařských: %d | stejná adresa mimo Prahu: %d" % (nespar, skip_nelekar, mimo))
    log("\nUKÁZKY:")
    for r in out[:12]:
        log("  [%s] %s — %s, Praha %s — %s" % (r["o"], r["n"][:40], r["a"], r["mc"], ", ".join(r["obory"])[:60]))
    (DATA / "doktori_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
