#!/usr/bin/env python3
"""Kalendář akcí v Praze 9 a 14 -> docs/data/akce.json.

Zdroje (všechny veřejné, bez klíče):
  p9   praha9.cz/o-praze-9/kalendar-akci  – události leží jako JSON přímo ve stránce
       (drupalSettings.fullCalendarView), včetně úvodního obrázku
  p14  praha14.cz/zivot-na-praze-14/akce  – výpis přes admin-ajax (ys_events),
       popis a souřadnice z RSS kanálu, velký obrázek z detailu akce
  mkp  mlp.cz – akce poboček Městské knihovny v Praze 9 a 14

Když některý zdroj selže, ponechají se jeho akce z minulého běhu a ve „zdroje“
se označí ok=false s časem posledního úspěchu. Aplikace pak ukáže upozornění.
"""
import concurrent.futures
import datetime as dt
import html as htmlmod
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
DNES = NOW.date()
DO_DNU = 60          # kolik dní dopředu akce bereme
LOG = []

P9 = "https://www.praha9.cz"
P14 = "https://www.praha14.cz/zivot-na-praze-14"
MKP = "https://www.mlp.cz"
# pobočky knihovny v Praze 9 a 14 (id z filtru na mlp.cz)
MKP_POBOCKY = {"556": ("Prosek", "prosek"), "568": ("Vysočany", "vysocany"),
               "533": ("Hloubětín", "hloubetin"), "3598": ("Černý Most", "cerny-most")}


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def stahni(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def plain(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def text(h):
    h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h or "")
    h = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", h)
    t = htmlmod.unescape(re.sub(r"<[^>]+>", " ", h)).replace("\xa0", " ").replace("⁠", "")
    t = "\n".join(re.sub(r"[ \t]+", " ", r).strip() for r in t.split("\n"))
    return re.sub(r"\n{2,}", "\n", t).strip()


def zkrat(t, n=700):
    t = (t or "").strip()
    if len(t) <= n:
        return t
    cut = t[:n]
    k = max(cut.rfind(". "), cut.rfind("\n"))
    return (cut[:k + 1] if k > n * 0.5 else cut.rstrip() + "…").strip()


# ------------------------------------------------------------------ adresy
def nacti_adresy():
    idx, ulice = {}, set()
    for u, cp, co, lat, lon, mc, cast in json.loads((DATA / "addresses.json").read_text(encoding="utf-8")):
        k = plain(u)
        ulice.add(k)
        for c in (cp, co):
            if c:
                idx.setdefault((k, str(c).lower()), (lat, lon, mc))
    return idx, ulice


ADR, ULICE = nacti_adresy()
ADR_RE = re.compile(r"([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][\wáčďéěíňóřšťúůýž\.]*(?:\s+[\wáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\.]+){0,3}?)\s+(\d{1,5})(?:\s*/\s*(\d{1,4}[a-z]?))?")


def najdi_adresu(t):
    """První adresa z textu, která existuje v RÚIAN Prahy 9/14 -> (adresa, lat, lon, mc)."""
    for m in ADR_RE.finditer(t or ""):
        ul = m.group(1).strip()
        slova = ul.split()
        # „ve vestibulu Polikliniky Parník (Generála Janouška 902/17)“ – zkoušej i kratší konce
        for i in range(len(slova)):
            k = plain(" ".join(slova[i:]))
            if k not in ULICE:
                continue
            for c in (m.group(2), m.group(3)):
                hit = c and ADR.get((k, c.lower()))
                if hit:
                    cislo = m.group(2) + ("/" + m.group(3) if m.group(3) else "")
                    return (" ".join(slova[i:]) + " " + cislo, hit[0], hit[1], hit[2])
    return None


# ------------------------------------------------------------------ kategorie
KAT = [  # pořadí = priorita
    ("zdr", r"zdravi|preventi|ockovan|darovani krve|cholesterol|zdravotn"),
    ("sen", r"senior|\bvecka\b|60\+|duchodc"),
    ("deti", r"\bdet[ie]|detsk|rodin|pohadk|kojen|batol|skolak|mladez|halloween|mikulas|loutk|drací|draci hlid"),
    ("vys", r"vystav|galerie|vernisaz|expozic|salon"),
    ("sport", r"sport|beh\b|zavod|turnaj|fotbal|rugby|cvicen|joga|hrist"),
    ("vzd", r"prednask|kurz|workshop|beseda|dilna|seminar|angli|jazyk|telefon v klidu|pocitac|vzdelav|kurs"),
    ("kult", r"koncert|divadl|film|kino|hudb|tanec|tanc|predstaveni|cteni|autorsk|festival|fest\b|kultur"),
    ("sous", r"sousedsk|trh|trhy|slavnost|bazar|jarmark|posviceni|komunitn|piknik|uklid"),
]
KAT_MKP = {"vystava": "vys", "prednaska": "vzd", "koncert": "kult", "divadlo": "kult", "film": "kult",
           "kurz": "vzd", "workshop": "vzd", "dilna": "vzd", "beseda": "vzd", "hry": "deti", "cteni": "kult"}


def kategorie(*texty, mkp_typ="", pro=""):
    p = plain(" ".join(t or "" for t in texty))
    if mkp_typ:
        pp = plain(pro)
        if "senior" in pp:
            return "sen"
        if "det" in pp and "dospel" not in pp:
            return "deti"
        for k, v in KAT_MKP.items():
            if k in plain(mkp_typ):
                return v
    for k, rx in KAT:
        if re.search(rx, p):
            return k
    return "kult"


VYRADIT = re.compile(r"uzavreni|uzavren[ay]? (odbor|urad|pracovist)|omezeni provozu|uredni hodiny|odstavk|zmena provozni", re.I)


def priznaky(*texty):
    p = plain(" ".join(t or "" for t in texty))
    return {
        "free": True if re.search(r"vstup(ne)? (je )?(volny|zdarma)|zdarma|vstup volny|bezplatn", p) else None,
        "reg": bool(re.search(r"nutn[aeé] (se )?(prihl|regist|rezerv)|pouze pro prihlasen|prihlaseni nutne|na prihlasku|nutna registrace|nutna rezervace", p)),
        "z": bool(re.search(r"\bzrusen", p)),
    }


def akce(src, id_, t, od, do, celyden, url, misto="", adresa_text="", popis="", img="", lat=None, lon=None, mc=None, **kw):
    t = re.sub(r"\s+", " ", t or "").strip()
    a = None
    if lat is None:
        a = najdi_adresu(adresa_text) or najdi_adresu(misto) or najdi_adresu(popis)
        if a:
            lat, lon, mc = a[1], a[2], a[3]
    r = {
        "id": src + "-" + str(id_), "src": src, "t": t, "od": od, "do": do, "cd": bool(celyden),
        "m": misto or "", "a": (a[0] if a else (adresa_text or "")).strip(" ,"),
        "lat": lat, "lon": lon, "mc": mc, "u": url, "img": img or "", "pop": zkrat(popis),
    }
    r.update(priznaky(t, popis, kw.get("cena", "")))
    if kw.get("cena"):
        c = kw["cena"].strip()
        r["free"] = True if plain(c).startswith("zdarma") else False
        r["cena"] = "" if r["free"] else c
    r["k"] = kategorie(t, popis[:400], misto, mkp_typ=kw.get("typ", ""), pro=kw.get("pro", ""))
    if kw.get("pro"):
        r["pro"] = kw["pro"]
    return r


# ------------------------------------------------------------------ Praha 9
MESTO_RX = re.compile(r"galerie|sin\b|restaurac|knihovn|\bkd\b|sal\b|park\b|hrist|skol|\bzs\b|centrum|kostel|klub|divadl|namesti|\bdum\b|poliklin|kavarn|zahrad|ulice|nadvori|arena|hala|sokol", re.I)
DATUM_RX = re.compile(r"^\s*(\d{1,2}\.\s*\d{1,2}\.?|\d{1,2}\.\s*[a-zá-ž]+|[a-zá-ž]+ \d{4}|\d{4})", re.I)


def _p9_titul(raw):
    casti = [c.strip() for c in raw.split("|") if c.strip()]
    nedat = [c for c in casti if not DATUM_RX.match(c) and not re.match(r"^(leden|únor|březen|duben|květen|červen|červenec|srpen|září|říjen|listopad|prosinec)\b", c, re.I)]
    if not nedat:
        return raw, ""
    if len(nedat) == 1:
        return nedat[0], ""
    mista = [c for c in nedat if MESTO_RX.search(plain(c))]
    misto = mista[0] if mista else ""
    zbytek = [c for c in nedat if c != misto] or nedat
    titul = max(zbytek, key=len)
    return titul, misto


def _hezky(s):
    """VIII. SALON PRAHY 9 -> VIII. Salon Prahy 9 (jen když je celé verzálkami)."""
    pis = [c for c in s if c.isalpha()]
    if not pis or sum(c.isupper() for c in pis) / len(pis) < 0.85:
        return s
    out = []
    for i, w in enumerate(s.lower().split(" ")):
        if re.fullmatch(r"[ivxlc]+\.?", w):
            out.append(w.upper())
        elif w in ("prahy", "praha", "praze", "prahu") or i == 0 or (out and re.fullmatch(r"[IVXLC]+\.?", out[-1])):
            out.append(w[:1].upper() + w[1:])
        else:
            out.append(w)
    return " ".join(out)


def praha9():
    h = stahni(P9 + "/o-praze-9/kalendar-akci")
    m = re.search(r'<script type="application/json" data-drupal-selector="drupal-settings-json">(.*?)</script>', h, re.S)
    nast = json.loads(m.group(1))
    ev = json.loads(nast["fullCalendarView"][0]["calendar_options"])["events"]
    skup = {}
    for e in ev:
        u = e.get("url") or ""
        s = skup.setdefault(u, {"e": e, "od": e["start"], "do": e.get("end") or e["start"], "ad": e.get("allDay")})
        s["od"] = min(s["od"], e["start"])
        s["do"] = max(s["do"], e.get("end") or e["start"])
    out = []
    for u, s in skup.items():
        e = s["e"]
        od, do, cd = s["od"], s["do"], bool(s["ad"])
        if cd and len(do) == 10:   # FullCalendar: konec celodenní akce je výhradní
            do = (dt.date.fromisoformat(do) - dt.timedelta(days=1)).isoformat()
        if do[:10] < DNES.isoformat() or od[:10] > (DNES + dt.timedelta(days=DO_DNU)).isoformat():
            continue
        raw = htmlmod.unescape(e.get("title") or "")
        if VYRADIT.search(plain(raw)):
            continue
        titul, misto = _p9_titul(raw)
        img = (re.search(r'src="([^"]+)"', e.get("des") or "") or [None, ""])[1]
        out.append({"raw": raw, "titul": _hezky(titul), "misto": _hezky(misto), "od": od[:16], "do": do[:16],
                    "cd": cd, "url": P9 + u, "img": (P9 + img) if img.startswith("/") else img, "eid": e.get("eid") or u})

    def detail(x):
        try:
            hh = stahni(x["url"])
            m = re.search(r'field--name-body[^>]*>(.*?)</div>\s*</div>', hh, re.S) or re.search(r'field--name-body[^>]*>(.*?)</div>', hh, re.S)
            x["pop"] = text(m.group(1)) if m else ""
            big = re.search(r'<img[^>]+src="(/sites/default/files/[^"]+)"[^>]*>', hh.split("field--name-body")[0][-6000:]) if "field--name-body" in hh else None
            if big and not x["img"]:
                x["img"] = P9 + big.group(1)
        except Exception as ex:
            log("  p9 detail selhal:", x["url"], ex)
            x["pop"] = ""
        return x

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        out = list(ex.map(detail, out))
    vys = []
    for x in out:
        pop = x.get("pop") or ""
        if plain(pop).strip() == plain(x["raw"]).strip():
            pop = ""
        vys.append(akce("p9", x["eid"], x["titul"], x["od"], x["do"], x["cd"], x["url"],
                        misto=x["misto"], adresa_text=x["misto"] + " " + x["raw"], popis=pop, img=x["img"], mc="9"))
    return vys


# ------------------------------------------------------------------ Praha 14
def _p14_datum(s):
    """'22. 9. 2026 / 16:00 - 29. 6. 2027' | '20. 10. 2026 / 16:30' | '25. 10. 2026 / 15:00 - 17:00'"""
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"(\d{1,2})\. ?(\d{1,2})\. ?(\d{4})(?: ?/ ?(\d{1,2}):(\d{2}))?(?: ?- ?(?:(\d{1,2})\. ?(\d{1,2})\. ?(\d{4}))?(?: ?/? ?(\d{1,2}):(\d{2}))?)?", s)
    if not m:
        return None
    g = m.groups()
    d0 = dt.date(int(g[2]), int(g[1]), int(g[0]))
    od = d0.isoformat() + ("T%02d:%s" % (int(g[3]), g[4]) if g[3] else "")
    cd = not g[3]
    if g[7]:
        d1 = dt.date(int(g[7]), int(g[6]), int(g[5]))
        do = d1.isoformat() + ("T%02d:%s" % (int(g[8]), g[9]) if g[8] else "")
    elif g[8]:
        do = d0.isoformat() + "T%02d:%s" % (int(g[8]), g[9])
    else:
        do = od
    return od, do, cd


def _p14_rss():
    """odkaz -> (popis, lat, lon) z RSS kanálu (stránkovaného)."""
    out = {}
    for p in range(1, 8):
        try:
            x = stahni(P14 + "/akce/feed/" + ("?paged=%d" % p if p > 1 else ""))
        except Exception:
            break
        items = re.findall(r"<item>(.*?)</item>", x, re.S)
        if not items:
            break
        for it in items:
            link = (re.search(r"<link>(.*?)</link>", it) or [None, ""])[1].strip()
            pop = re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]>", it, re.S) or re.search(r"<description><!\[CDATA\[(.*?)\]\]>", it, re.S)
            geo = re.search(r"<georss:point>\s*([\d.]+)\s+([\d.]+)", it)
            out[link] = (text(pop.group(1)) if pop else "", float(geo.group(1)) if geo else None, float(geo.group(2)) if geo else None)
    return out


def praha14():
    arts = []
    for p in range(1, 16):
        h = stahni(P14 + "/wp-admin/admin-ajax.php?action=ys_events&page=%d" % p)
        found = re.findall(r'<article class="p14-archive-akce__article"[^>]*>(.*?)</article>', h, re.S)
        if not found:
            break
        arts += found
    rss = _p14_rss()
    zaznamy = []
    for a in arts:
        href = re.search(r'href="([^"]+)"', a).group(1)
        titul = text(re.search(r'__title">(.*?)</h1>', a, re.S).group(1))
        loc = text((re.search(r'__location">.*?<span>(.*?)</span>', a, re.S) or [None, ""])[1])
        dat = text((re.search(r'__date">.*?<span>(.*?)</span>', a, re.S) or [None, ""])[1])
        exc = text((re.search(r'__excerpt">(.*?)</p>', a, re.S) or [None, ""])[1])
        d = _p14_datum(dat)
        if not d:
            log("  p14: nečitelné datum", repr(dat), titul)
            continue
        od, do, cd = d
        if do[:10] < DNES.isoformat() or od[:10] > (DNES + dt.timedelta(days=DO_DNU)).isoformat():
            continue
        if VYRADIT.search(plain(titul)):
            continue
        casti = [c.strip() for c in loc.split(",")]
        misto = casti[0] if casti and casti[0] and not re.search(r"\d", casti[0]) else ""
        adr = ", ".join(c for c in casti[1:] if c and c not in ("Praha", "Hlavní město Praha", "Czechia")) if misto else ", ".join(c for c in casti if c)
        pop, lat, lon = rss.get(href, ("", None, None))
        zaznamy.append({"href": href, "titul": titul, "misto": misto, "adr": adr, "od": od, "do": do, "cd": cd,
                        "pop": pop or exc, "lat": lat, "lon": lon})

    def obrazek(z):
        try:
            hh = stahni(z["href"])
            m = re.search(r'(https://www\.praha14\.cz/app/uploads/sites/4/[^"\' ]+?-1024x\d+\.?[a-z]*)', hh)
            z["img"] = m.group(1) if m else ""
            if not z["pop"] or z["pop"].endswith("…"):
                body = re.search(r'class="[^"]*(?:entry-content|p14-single-akce__content|content)[^"]*"[^>]*>(.*?)</div>', hh, re.S)
                if body:
                    z["pop"] = text(body.group(1)) or z["pop"]
        except Exception as ex:
            log("  p14 detail selhal:", z["href"], ex)
            z["img"] = ""
        return z

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        zaznamy = list(ex.map(obrazek, zaznamy))
    out = []
    for z in zaznamy:
        lat, lon = z["lat"], z["lon"]
        mc = None
        a = najdi_adresu(z["adr"]) or najdi_adresu(z["pop"])
        if a:
            lat, lon, mc = a[1], a[2], a[3]
        r = akce("p14", re.sub(r"\W+", "-", z["href"].rstrip("/").split("/")[-1]), z["titul"], z["od"], z["do"], z["cd"], z["href"],
                 misto=z["misto"], adresa_text=z["adr"], popis=z["pop"], img=z["img"], lat=lat, lon=lon, mc=mc or "14")
        if a:
            r["a"] = a[0]
        out.append(r)
    return out


# ------------------------------------------------------------------ knihovna
def knihovna():
    out, seen = [], set()
    for pid, (jmeno, slug) in MKP_POBOCKY.items():
        try:
            ph = stahni(MKP + "/cz/pobocky/" + slug)
            adr = text((re.search(r"Adresa:\s*</[^>]+>\s*(.*?)</", ph, re.S) or re.search(r"Adresa:(.*?)<", ph, re.S) or [None, ""])[1])
        except Exception:
            adr = ""
        poloha = najdi_adresu(adr)
        for p in range(0, 6):
            h = stahni(MKP + "/akce/vsechny-akce?nid_entityreference_filter=%s&page=%d" % (pid, p))
            boxy = re.findall(r'<article class="event-box">(.*?)</article>', h, re.S)
            if not boxy:
                break
            for b in boxy:
                href = re.search(r'__title" href="([^"]+)"', b).group(1)
                nid = href.rstrip("/").split("/")[-1]
                if nid in seen:
                    continue
                seen.add(nid)
                tm = re.search(r'<time datetime="([^"]+)"(?: data-end="([^"]*)")?', b)
                if not tm:
                    continue
                od = tm.group(1)[:16]
                do = (tm.group(2) or tm.group(1))[:16]
                if do[:10] < DNES.isoformat() or od[:10] > (DNES + dt.timedelta(days=DO_DNU)).isoformat():
                    continue
                titul = text(re.search(r'__title"[^>]*>\s*<div>(.*?)</div>', b, re.S).group(1))
                typ = text((re.search(r'__category">(.*?)</span>', b) or [None, ""])[1])
                pro = text((re.search(r'__audience">(.*?)</span>', b) or [None, ""])[1])
                cena = text((re.search(r'__price">(.*?)</div>', b, re.S) or [None, ""])[1])
                img = (re.search(r'<img class="event-box__image" src="([^"]+)"', b) or [None, ""])[1]
                out.append({"nid": nid, "href": MKP + href, "titul": titul, "typ": typ, "pro": pro, "cena": cena,
                            "img": img, "od": od, "do": do, "misto": "Knihovna " + jmeno, "adr": adr, "poloha": poloha})

    def detail(x):
        try:
            hh = stahni(x["href"])
            m = re.search(r"Popis akce(.*?)(?:<footer|Další akce|Mohlo by vás zajímat|</main>)", hh, re.S)
            x["pop"] = text(m.group(1)) if m else ""
        except Exception as ex:
            log("  mkp detail selhal:", x["href"], ex)
            x["pop"] = ""
        return x

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        out = list(ex.map(detail, out))
    vys = []
    for x in out:
        pol = x["poloha"]
        r = akce("mkp", x["nid"], x["titul"], x["od"], x["do"], x["od"][11:] == "", x["href"],
                 misto=x["misto"], adresa_text=x["adr"], popis=x.get("pop", ""), img=x["img"],
                 lat=pol[1] if pol else None, lon=pol[2] if pol else None, mc=pol[3] if pol else None,
                 typ=x["typ"], pro=x["pro"], cena=x["cena"])
        if pol:
            r["a"] = pol[0]
        vys.append(r)
    return vys


# ------------------------------------------------------------------ sloučení
def klic(r):
    return (re.sub(r"[^a-z0-9]", "", plain(r["t"]))[:40], r["od"][:10])


def sloucit(vse):
    """Stejná akce v knihovně i v kalendáři Prahy 14: necháme knihovnu, doplníme fotku/souřadnice."""
    poradi = {"mkp": 0, "p14": 1, "p9": 2}
    out = {}
    for r in sorted(vse, key=lambda r: poradi[r["src"]]):
        k = klic(r)
        if k in out:
            o = out[k]
            for f in ("img", "lat", "lon", "pop", "a"):
                if not o.get(f) and r.get(f):
                    o[f] = r[f]
            o.setdefault("dalsi", []).append(r["u"])
            continue
        out[k] = r
    return list(out.values())


def main():
    try:
        stare = json.loads((DATA / "akce.json").read_text(encoding="utf-8"))
    except Exception:
        stare = {"zdroje": {}, "akce": []}
    zdroje, vse = {}, []
    ted = NOW.strftime("%Y-%m-%dT%H:%M")
    for kod, fn in (("p9", praha9), ("p14", praha14), ("mkp", knihovna)):
        try:
            r = fn()
            if not r:
                raise RuntimeError("zdroj nevrátil žádnou akci")
            zdroje[kod] = {"ok": True, "n": len(r), "cas": ted}
            vse += r
            log("%s: %d akcí" % (kod, len(r)))
        except Exception as e:
            pred = (stare.get("zdroje") or {}).get(kod) or {}
            zdroje[kod] = {"ok": False, "n": 0, "cas": pred.get("cas") or "", "chyba": str(e)[:200]}
            drzim = [a for a in stare.get("akce", []) if a.get("src") == kod and a["do"][:10] >= DNES.isoformat()]
            vse += drzim
            log("%s SELHAL: %s (ponechávám %d akcí z minula)" % (kod, e, len(drzim)))
    akce_ = sloucit(vse)
    akce_.sort(key=lambda r: (r["od"], r["t"]))
    (DATA / "akce.json").write_text(json.dumps({
        "gen": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "zdroje": zdroje, "akce": akce_,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    from collections import Counter
    log("\ncelkem %d akcí; kategorie: %s" % (len(akce_), dict(Counter(a["k"] for a in akce_))))
    log("s fotkou: %d, se souřadnicemi: %d, zdarma: %d, zrušeno: %d" % (
        sum(1 for a in akce_ if a["img"]), sum(1 for a in akce_ if a["lat"]),
        sum(1 for a in akce_ if a.get("free")), sum(1 for a in akce_ if a.get("z"))))
    for a in akce_:
        log("  [%s %s] %s → %s | %s | %s | %s%s" % (a["src"], a["k"], a["od"], a["do"], a["t"][:60], a["m"][:30],
                                                  a["a"][:40], " 📷" if a["img"] else ""))
    (DATA / "akce_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))
    if not any(z["ok"] for z in zdroje.values()):
        sys.exit("Žádný zdroj akcí nefunguje.")


if __name__ == "__main__":
    main()
