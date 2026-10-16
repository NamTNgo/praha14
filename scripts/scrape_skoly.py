"""Automatický sběr údajů z webů škol: telefon, dny otevřených dveří, zápisy, přijímací zkoušky, školné.
Vstup: docs/data/skoly.json (pole "w" = doména odvozená z e-mailu v rejstříku). Výstup: docs/data/skoly_extra.json (klíč = doména).
Co se nenajde, se nezobrazí (aplikace ukáže "Neuvedeno"). U každé hodnoty je uložen odkaz na stránku, odkud pochází."""
import html as htmllib, json, re, sys, time, unicodedata
import urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
UA = "Mozilla/5.0 (compatible; skoly-praha-bot; +https://github.com/NamTNgo/praha14)"
KEYS = ("zapis", "otevren", "prijim", "skolne", "cenik", "poplatk", "platb", "faq", "dotaz", "kontakt", "dod", "uchazec", "rodic", "pro-zaky", "o-skole", "skolniho")
MONTH_RE = r"(ledn[ua]|leden|unor[ua]?|brezn[ua]|brezen|dubn[ua]|duben|kvetn[ua]|kveten|cervn[ua]|cerven|cervenc[ei]|cervenci|srpn[ua]|srpen|zari|rijn[ua]|rijen|listopad[ua]?|prosinc[ei]|prosinec)"
MONTH_NUM = [("led", 1), ("uno", 2), ("bre", 3), ("dub", 4), ("kve", 5), ("cervenc", 7), ("cerven", 6), ("srp", 8), ("zar", 9), ("rij", 10), ("list", 11), ("pros", 12)]


def month_of(w):
    return next(n for k, n in MONTH_NUM if w.startswith(k))


def plain(s):
    s = re.sub(r"[\u2010-\u2015\u2212]", "-", s).replace("\u00a0", " ")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    with urllib.request.urlopen(req, timeout=15) as r:
        ct = r.headers.get("Content-Type", "")
        if "html" not in ct and "text" not in ct:
            return None, url
        raw = r.read(1_500_000)
        m = re.search(r"charset=([\w-]+)", ct) or re.search(rb"charset=[\"']?([\w-]+)", raw[:3000]) and None
        enc = (m.group(1) if m else None) or "utf-8"
        try:
            return raw.decode(enc, "replace"), r.geturl()
        except LookupError:
            return raw.decode("utf-8", "replace"), r.geturl()


def to_text(h):
    h = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", htmllib.unescape(h)).strip()


def links(h, base, host):
    out = []
    for m in re.finditer(r'(?is)<a\s[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', h):
        href, label = m.group(1), to_text(m.group(2))
        u = urljoin(base, href)
        pu = urlparse(u)
        if pu.scheme not in ("http", "https") or not pu.netloc.replace("www.", "").endswith(host.replace("www.", "")):
            continue
        if re.search(r"\.(pdf|jpe?g|png|docx?|xlsx?|zip)$", pu.path, re.I):
            continue
        hl = plain(href + " " + label)
        if any(k in hl for k in KEYS) or re.search(r"praha[\s_-]?(?:9|14)\b(?!\d)", hl):
            out.append((rank(hl), u.split("#")[0]))
    seen, res = set(), []
    # Stránek se bere jen pár, proto napřed ty, kde bývá školné a termíny.
    for _, u in sorted(out, key=lambda x: x[0]):
        if u not in seen:
            seen.add(u); res.append(u)
    return res


RANKS = (("skolne", "cenik", "poplatk", "platb"), ("zapis", "otevren", "prijim", "dod"), ("uchazec", "faq", "dotaz", "skolniho"))


def rank(hl):
    for i, keys in enumerate(RANKS):
        if any(k in hl for k in keys):
            return i
    return len(RANKS)


def phone(h, text):
    for m in re.finditer(r'href=["\']tel:([^"\']+)', h, re.I):
        d = re.sub(r"\D", "", m.group(1))
        d = d[-9:] if len(d) >= 9 else ""
        if d and d[0] in "2345679":
            return f"+420 {d[:3]} {d[3:6]} {d[6:]}"
    for m in re.finditer(r"(?i)(?:tel|telefon|mobil|ředitelna|sekretariát|kancelář)[^0-9+]{0,25}((?:\+?420)?[  ]?[2-9]\d{2}[  ]?\d{3}[  ]?\d{3})", text):
        d = re.sub(r"\D", "", m.group(1))[-9:]
        return f"+420 {d[:3]} {d[3:6]} {d[6:]}"
    return None


DATE = re.compile(r"(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(20\d{2}))?")
TIME = re.compile(r"(\d{1,2})[:.](\d{2})\s*(?:[–—-]|do)\s*(\d{1,2})[:.](\d{2})")


def mkdate(d, m, y, today):
    try:
        if y:
            x = date(int(y), int(m), int(d))
        else:
            x = date(today.year, int(m), int(d))
            if x < today - timedelta(days=30):
                x = date(today.year + 1, int(m), int(d))
        return x
    except ValueError:
        return None


def dates_after(text, pat, today, stop, span=260, horizon=420):
    t = plain(text)
    res = []
    for m in re.finditer(pat, t):
        seg = t[m.end():m.end() + span]
        cut = re.search(stop, seg)
        if cut:
            seg = seg[:cut.start()]
        for dm in DATE.finditer(seg):
            x = mkdate(dm.group(1), dm.group(2), dm.group(3), today)
            if not x or x < today or x > today + timedelta(days=horizon):
                continue
            tm = TIME.search(seg[dm.end():dm.end() + 60])
            tt = f"{int(tm.group(1))}:{tm.group(2)}–{int(tm.group(3))}:{tm.group(4)}" if tm else ""
            res.append((x.isoformat(), tt))
    out, seen = [], set()
    for x in sorted(res):
        if x[0] not in seen:
            seen.add(x[0]); out.append({"d": x[0], **({"t": x[1]} if x[1] else {})})
    return out[:4]


GAP_OK = {"od", "do", "v", "h", "hod", "hodin", "a"}  # mezi datem a štítkem smí stát jen údaj o čase


def labelled(text, label, today, horizon=450):
    """Tabulky 'datum | popis' (např. '10. 11. 2026 Den otevřených dveří'):
    ke každému výskytu štítku se vezme nejbližší datum před ním (do 60 znaků)."""
    t = plain(text)
    res = []
    for m in re.finditer(label, t):
        pre = t[max(0, m.start() - 40):m.start()]
        dm = None
        for dm in DATE.finditer(pre):
            pass  # poslední = nejbližší datum před štítkem
        if not dm:
            continue
        x = mkdate(dm.group(1), dm.group(2), dm.group(3), today)
        if not x or x < today or x > today + timedelta(days=horizon):
            continue
        gap = pre[dm.end():]
        if any(w not in GAP_OK for w in re.findall(r"[a-z]+", gap)):
            continue  # mezi datem a štítkem je jiný text: datum patří k něčemu jinému
        tm = TIME.search(pre[dm.end():])
        res.append((x.isoformat(), f"{int(tm.group(1))}:{tm.group(2)}–{int(tm.group(3))}:{tm.group(4)}" if tm else ""))
    out, seen = [], set()
    for x in sorted(res):
        if x[0] not in seen:
            seen.add(x[0]); out.append({"d": x[0], **({"t": x[1]} if x[1] else {})})
    return out[:4]


ZAP = r"zapis\w*\s+(?:do|k)\s+(?:1\.\s?tridy|1\.\s?rocniku|zakladniho|materske|predskolniho|ms\b|zs\b)"


def zapis(text, today):
    d = dates_after(text, ZAP, today, r"otevren|prijimac|skolne", span=300, horizon=450)
    if d:
        return {"dates": d}
    t = plain(text)
    for m in re.finditer(ZAP, t):
        seg = t[m.end():m.end() + 140]
        cut = re.search(r"otevren|prijimac|skolne", seg)
        if cut:
            seg = seg[:cut.start()]
        mm = re.search(r"\b" + MONTH_RE + r"\b\s*(20\d{2})?", seg)
        if mm:
            y, mo = int(mm.group(2) or today.year), month_of(mm.group(1))
            if y == today.year and mo < today.month:
                y += 1
            if date(y, mo, 28 if mo != 2 else 27) >= today - timedelta(days=30) and date(y, mo, 1) <= today + timedelta(days=450):
                return {"month": f"{y}-{mo:02d}"}
    return None


def _fmt(n):
    return f"{n:,}".replace(",", " ")


def skolne(text, mcs=None):
    """Školné; u webů s více pobočkami ('PRAHA 14 školné … / PRAHA 6 školné …') jen pro naši městskou část.
    Nejdřív se hledá tabulka cen podle rozsahu docházky (-> rozpětí), teprve potom jediná částka."""
    ms = []
    for m in re.finditer(r"(?i)školné", text):
        pm = re.search(r"(?i)praha\s*(\d{1,2})\s*$", text[max(0, m.start() - 40):m.start()])
        if pm and mcs and pm.group(1) not in mcs:
            continue
        ms.append(m)
    for m in ms:  # 1) tabulka
        seg = text[m.end():m.end() + 400]
        if not re.search(r"(?i)docházk|celodenn|dopoledn", seg):
            continue
        tab = text[m.end():m.end() + 1500]
        cut = next((c for c in re.finditer(r"(?i)prázdnin|školné", tab) if c.start() > 80), None)
        tab = tab[:cut.start()] if cut else tab
        vals = [int(re.sub(r"[  .]", "", x)) for x in re.findall(r"(?<![\d/.,])(\d{1,3}(?:[  .]\d{3})+|\d{4,6})\s*Kč", tab)]
        vals = [v for v in vals if 1000 <= v <= 400000]
        if len(vals) >= 3 and re.search(r"(?i)měsíc|měsíč", text[max(0, m.start() - 20):m.end()] + tab[:300]):
            return f"{_fmt(min(vals))}–{_fmt(max(vals))} Kč / měsíc"
    for m in ms:  # 1b) "27 000 Kč školné za školní rok" – částka stojí před slovem
        pre = text[max(0, m.start() - 40):m.start()]
        a = re.search(r"(?<![\d/.,])(\d{1,3}(?:[  .]\d{3})+|\d{4,6})\s*(?:,-|Kč)\s*$", pre)
        if a:
            n = int(re.sub(r"[  .]", "", a.group(1)))
            if 1000 <= n <= 400000:
                post = text[m.end():m.end() + 40]
                unit = "rok" if re.search(r"(?i)školní rok|ročn|/\s*rok", post) else ("měsíc" if re.search(r"(?i)měsíc|měsíč|měs\.", post) else "")
                return f"{_fmt(n)} Kč" + (f" / {unit}" if unit else "")
    for m in ms:  # 2) jediná částka
        seg = text[m.end():m.end() + 220]
        for a in re.finditer(r"(?<![\d/.,])(\d{1,3}(?:[  .]\d{3})+|\d{3,6})\s*(?:,-|Kč)", seg):
            amt = re.sub(r"[  .]", " ", a.group(1))
            n = int(amt.replace(" ", ""))
            if not 200 <= n <= 400000:
                continue
            ctx = seg[:a.end() + 40]
            unit = "měsíc" if re.search(r"(?i)měsíc|měsíč|měs\.|/\s*měs", ctx) else ("rok" if re.search(r"(?i)ročn|školní rok|/\s*rok", ctx) else "")
            if not unit and n < 3000:
                continue  # bez jednotky a tak nízké: spíš zápisné nebo poplatek, ne školné
            od = "od " if re.search(r"(?i)\bod\s*$", seg[:a.start()]) else ""  # "školné je již od 25.000 Kč"
            return od + f"{amt} Kč" + (f" / {unit}" if unit else "")
    return None


def cenik(text):
    """Ceník bez slova 'školné' (např. tabulka cen za měsíc): vrátí rozpětí měsíčních cen."""
    for m in re.finditer(r"(?i)ceník|cenik|poplatky", text):
        seg = text[m.end():m.end() + 1800]
        if not re.search(r"(?i)měsíc|měs\.", seg):
            continue
        vals = []
        for a in re.finditer(r"(\d{1,3}(?:[  ]\d{3})+|\d{4,6})\s*(?:,-|Kč)(?!\s*/\s*(?:den|hod|dítě|dne))", seg):
            n = int(re.sub(r"[  ]", "", a.group(1)))
            before = seg[max(0, a.start() - 40):a.start()].lower()
            if 1000 <= n <= 100000 and "stravn" not in before:
                vals.append(n)
        if vals:
            f = lambda n: f"{n:,}".replace(",", " ")
            lo, hi = min(vals), max(vals)
            return (f"{f(lo)} Kč" if lo == hi else f"{f(lo)}–{f(hi)} Kč") + " / měsíc"
    return None


def scrape_host(host, today, mcs=None):
    res, src = {}, {}
    try:
        h, base = None, None
        for u in (f"https://{host}", f"https://www.{host}", f"http://{host}"):
            try:
                h, base = fetch(u)
                if h:
                    break
            except Exception:  # noqa: BLE001
                continue
        if not h:
            return None
        # Procházení do šířky: školné bývá v podmenu, na které z titulky vede jen rozcestník.
        pages = [(base, h)]
        queue, seen = [(rank(plain(u)), u) for u in links(h, base, host)], {base}
        while queue and len(pages) <= 7:
            queue.sort(key=lambda x: x[0])
            _, u = queue.pop(0)
            if u in seen:
                continue
            seen.add(u)
            ph = pb = None
            for attempt in (1, 2):
                try:
                    ph, pb = fetch(u)
                    break
                except Exception:  # noqa: BLE001
                    time.sleep(2)
            if ph:
                pages.append((pb, ph))
                for v in links(ph, pb, host):
                    if v not in seen:
                        queue.append((rank(plain(v)) + 1, v))  # odkazy z podstránek až po těch z titulky
            time.sleep(0.7)
        for u, ph in pages:
            t = to_text(ph)
            if "tel" not in res:
                p = phone(ph, t)
                if p:
                    res["tel"], src["tel"] = p, u
            if "dod" not in res:
                d = labelled(t, r"(?:dny|den|dne|dnech)\s+otevrenych\s+dveri", today, 420)  # tabulka 'datum | popis' má přednost
                if not d:
                    d = dates_after(t, r"(?:dny|den|dne|dnech)\s+otevrenych\s+dveri|\bdod\b", today, r"zapis|prijimac|skolne")
                if d:
                    res["dod"], src["dod"] = d, u
            if "zap" not in res:
                z = zapis(t, today)
                if not z:
                    ld = labelled(t, r"zapis\w*\s+(?:do|k)\s+(?:1\.\s?trid|1\.\s?rocnik|zakladni|materske|ms\b|zs\b)", today)
                    z = {"dates": ld} if ld else None
                if z:
                    res["zap"], src["zap"] = z, u
            if "pz" not in res:
                d = dates_after(t, r"prijimac\w+\s+(?:zkousk|rizeni|zkousek)", today, r"zapis|otevren|skolne")
                if d:
                    res["pz"], src["pz"] = d, u
            if "sk" not in res:
                s = skolne(t, mcs) or cenik(t)
                if s:
                    res["sk"], src["sk"] = s, u
        res["src"] = src
        res["u"] = today.isoformat()
        return res
    except Exception as e:  # noqa: BLE001
        print("chyba", host, type(e).__name__, e, file=sys.stderr)
        return None


GENERIC = {"materska", "skola", "zakladni", "stredni", "praha", "gymnazium", "skolka", "skolky", "soukroma", "soukrome", "s.r.o.", "obchodni", "akademie", "odborna", "vyssi", "pro", "ceske", "republiky"}


def host_of(u):
    u = (u or "").strip()
    if not u:
        return ""
    if not re.match(r"https?://", u, re.I):
        u = "http://" + u
    h = urlparse(u).netloc.lower().split(":")[0]
    return h[4:] if h.startswith("www.") else h


def tokens(name):
    return {t for t in re.findall(r"[a-z0-9]{4,}", plain(name)) if t not in GENERIC}


def hav(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, asin, sqrt
    a = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ** 2
    return 12742000 * asin(sqrt(a))


def find_webs(skoly):
    """Weby škol, které nelze odvodit z e-mailu (např. @seznam.cz): OpenStreetMap (Overpass) – objekt škola/školka
    do 150 m od adresy a se společným výrazným slovem v názvu."""
    q = '[out:json][timeout:90];nwr["amenity"~"^(school|kindergarten)$"](49.94,14.2,50.18,14.75);out center tags;'
    els, err = None, None
    for ep in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"):
        try:
            req = urllib.request.Request(ep, data=("data=" + urllib.parse.quote(q)).encode(), headers={"User-Agent": "skoly-praha-bot/1.0 (https://github.com/NamTNgo/praha14)", "Accept": "*/*", "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=120) as r:
                els = json.loads(r.read().decode("utf-8"))["elements"]
            break
        except Exception as e:  # noqa: BLE001
            err = f"{ep.split('/')[2]}: {type(e).__name__} {e}"
            time.sleep(8)
    if els is None:
        raise RuntimeError(err)
    pts = []
    for e in els:
        t = e.get("tags", {})
        w = host_of(t.get("website") or t.get("contact:website") or t.get("url"))
        c = e.get("center") or e
        if w and "lat" in c and not any(x in w for x in ("facebook.", "instagram.", "google.", "praha.eu")):
            pts.append((c["lat"], c["lon"], t.get("name", ""), w))
    find_webs.info = f"OSM objektů s webem: {len(pts)} z {len(els)}"
    out = {}
    for s in skoly:
        if s.get("w"):
            continue
        best = None
        for la, lo, nm, w in pts:
            d = hav(s["lat"], s["lon"], la, lo)
            if d > 150:
                continue
            ok = bool(tokens(s["n"]) & tokens(nm))
            if ok and (best is None or d < best[0]):
                best = (d, w)
        if best:
            out[s["id"]] = best[1]
    return out


def main():
    today = date.today()
    skoly = json.loads((DATA / "skoly.json").read_text(encoding="utf-8"))
    wpath = DATA / "skoly_web.json"
    mpath = DATA / "skoly_web_rucne.json"  # weby doplněné ručně (seznamy MČ, potvrzeno uživatelem)
    webs = json.loads(wpath.read_text(encoding="utf-8")) if wpath.exists() else {}
    osm = ""
    try:
        webs = find_webs(skoly) or webs
        osm = find_webs.info
    except Exception as e:  # noqa: BLE001
        osm = f"OSM chyba: {type(e).__name__} {e}"
        print(osm, file=sys.stderr)
    if mpath.exists():
        webs.update(json.loads(mpath.read_text(encoding="utf-8")))
    wpath.write_text(json.dumps(webs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manual = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    for s in skoly:
        if manual.get(s["id"]):
            s["w"] = manual[s["id"]]  # ruční web má přednost i před webem z e-mailu
        elif not s.get("w") and webs.get(s["id"]):
            s["w"] = webs[s["id"]]
    hosts = sorted({s["w"] for s in skoly if s.get("w")})
    mcmap = {}
    for s in skoly:
        if s.get("w"):
            mcmap.setdefault(s["w"], set()).add(s["mc"])
    path = DATA / "skoly_extra.json"
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    with ThreadPoolExecutor(6) as ex:
        results = list(ex.map(lambda h: (h, scrape_host(h, today, mcmap.get(h))), hosts))
    new, ok = {}, 0
    for h, r in results:
        if r:
            ok += 1
            new[h] = r
        elif h in old:
            new[h] = old[h]  # web teď nedostupný -> ponech poslední známé
    # hodnota, kterou se tentokrát nepodařilo načíst (výpadek podstránky), se nesmí ztratit
    for h, r in new.items():
        for k in ("tel", "sk"):
            if k not in r and k in old.get(h, {}):
                r[k] = old[h][k]
                r.setdefault("src", {})[k] = old[h].get("src", {}).get(k)
    # prošlé termíny nezobrazovat
    for r in new.values():
        for k in ("dod", "pz"):
            if k in r:
                r[k] = [x for x in r[k] if x["d"] >= today.isoformat()]
                if not r[k]:
                    del r[k]
    rpath = DATA / "skoly_extra_rucne.json"  # ručně potvrzené hodnoty mají přednost před scraperem
    if rpath.exists():
        for h, v in json.loads(rpath.read_text(encoding="utf-8")).items():
            r = new.setdefault(h, {})
            r.setdefault("src", {}).update(v.get("src", {}))
            r.update({k: x for k, x in v.items() if k != "src"})
    path.write_text(json.dumps(new, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stat = {k: sum(1 for r in new.values() if k in r) for k in ("tel", "dod", "zap", "pz", "sk")}
    (DATA / "skoly_extra_report.txt").write_text(f"webů: {len(hosts)} (z toho {len(webs)} z OpenStreetMap; {osm}), načteno: {ok}\nnalezeno: {json.dumps(stat)}\nbez webu: " + "; ".join(x["n"] for x in skoly if not x.get("w")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
