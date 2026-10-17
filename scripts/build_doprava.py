#!/usr/bin/env python3
"""Dopravní komplikace v Praze 9 a 14 -> docs/data/doprava.json.

Tři zdroje, každý zvlášť a odolně: když jeden selže, ostatní se uloží a v
docs/data/doprava_report.txt je napsané proč. Když selže všechno, soubor se
nepřepíše (aplikace dál ukazuje poslední funkční data) a skript skončí chybou.

  1. blokové čištění  – rozpisy TSK z webů městských částí (PDF)
  2. uzavírky a práce – aktuality odborů dopravy Prahy 9 a Prahy 14
  3. výluky PID       – Golemio /v3/pid/infotexts + seznam zastávek z data.pid.cz

Souřadnice u uzavírek nevznikají geokódováním: název ulice se spáruje s adresami
z docs/data/addresses.json (RÚIAN) a bere se těžiště jejích adres. Proto umíme
uzavírku umístit jen v Praze 9 a 14 – což je přesně území aplikace.
"""
import datetime as dt
import html as htmllib
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
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
DNES = dt.date.today()
LOG = []

P9_AKT = "https://www.praha9.cz/urad-a-samosprava/doprava/aktuality-v-doprave-na-uzemi-mc-praha-9"
P14_AKT = "https://www.praha14.cz/zivot-na-praze-14/dopravni-omezeni-2/"
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


def fetch(url, key=None, binary=False, timeout=30):
    h = {"User-Agent": UA, "Accept-Language": "cs"}
    if key:
        h["X-Access-Token"] = key
        h["Accept"] = "application/json"
    url = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return raw if binary else raw.decode("utf-8", "replace")


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


def datumy(t):
    """Všechna data v textu jako (date, pozice). Bere 1. 2. 2026, 15.10. i 1. února."""
    out = []
    for m in re.finditer(r"(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?:\s*(\d{4}))?", t):
        d = _rok(int(m.group(1)), int(m.group(2)), int(m.group(3)) if m.group(3) else None)
        if d:
            out.append((d, m.start()))
    for m in re.finditer(r"(\d{1,2})\s*\.\s*([a-zA-Zěščřžýáíéůúňťď]+)\s*(\d{4})?", t):
        mo = mesic_cislo(m.group(2))
        if not mo:
            continue
        d = _rok(int(m.group(1)), mo, int(m.group(3)) if m.group(3) else None)
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


# ---------- 2. uzavírky a práce ----------
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
    for klic, fn in (("cisteni", lambda: cisteni(ulice)),
                     ("uzavirky", lambda: clanky(P9_AKT, "9", ulice) + clanky(P14_AKT, "14", ulice, 1)),
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
