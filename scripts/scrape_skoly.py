"""Automatický sběr údajů z webů škol: telefon, dny otevřených dveří, zápisy, přijímací zkoušky, školné.
Vstup: docs/data/skoly.json (pole "w" = doména odvozená z e-mailu v rejstříku). Výstup: docs/data/skoly_extra.json (klíč = doména).
Co se nenajde, se nezobrazí (aplikace ukáže "Neuvedeno"). U každé hodnoty je uložen odkaz na stránku, odkud pochází."""
import html as htmllib, json, re, sys, time, unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
UA = "Mozilla/5.0 (compatible; skoly-praha-bot; +https://github.com/NamTNgo/praha14)"
KEYS = ("zapis", "otevren", "prijim", "skolne", "cenik", "poplatk", "platb", "kontakt", "dod", "uchazec", "rodic", "pro-zaky", "o-skole")
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
            out.append(u.split("#")[0])
    seen, res = set(), []
    for u in out:
        if u not in seen:
            seen.add(u); res.append(u)
    return res


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


def skolne(text, mcs=None):
    """Školné; u webů s více pobočkami ('PRAHA 14 školné … / PRAHA 6 školné …') jen pro naši městskou část."""
    for m in re.finditer(r"(?i)školné", text):
        pm = re.search(r"(?i)praha\s*(\d{1,2})\s*$", text[max(0, m.start() - 40):m.start()])
        if pm and mcs and pm.group(1) not in mcs:
            continue
        seg = text[m.end():m.end() + 220]
        for a in re.finditer(r"(?<![\d/.,])(\d{1,3}(?:[  ]\d{3})+|\d{3,6})\s*(?:,-|Kč)", seg):
            amt = re.sub(r"[  ]", " ", a.group(1))
            n = int(amt.replace(" ", ""))
            if not 200 <= n <= 400000:
                continue
            ctx = seg[:a.end() + 40]
            unit = "měsíc" if re.search(r"(?i)měsíč|měs\.|/\s*měs", ctx) else ("rok" if re.search(r"(?i)ročn|školní rok|/\s*rok", ctx) else "")
            return f"{amt} Kč" + (f" / {unit}" if unit else "")
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
        pages = [(base, h)]
        for u in links(h, base, host)[:5]:
            try:
                ph, pb = fetch(u)
                if ph:
                    pages.append((pb, ph))
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.7)
        for u, ph in pages:
            t = to_text(ph)
            if "tel" not in res:
                p = phone(ph, t)
                if p:
                    res["tel"], src["tel"] = p, u
            if "dod" not in res:
                d = dates_after(t, r"(?:dny|den|dne|dnech)\s+otevrenych\s+dveri|\bdod\b", today, r"zapis|prijimac|skolne")
                if d:
                    res["dod"], src["dod"] = d, u
            if "zap" not in res:
                z = zapis(t, today)
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


def main():
    today = date.today()
    skoly = json.loads((DATA / "skoly.json").read_text(encoding="utf-8"))
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
    # prošlé termíny nezobrazovat
    for r in new.values():
        for k in ("dod", "pz"):
            if k in r:
                r[k] = [x for x in r[k] if x["d"] >= today.isoformat()]
                if not r[k]:
                    del r[k]
    path.write_text(json.dumps(new, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stat = {k: sum(1 for r in new.values() if k in r) for k in ("tel", "dod", "zap", "pz", "sk")}
    (DATA / "skoly_extra_report.txt").write_text(f"webů: {len(hosts)}, načteno: {ok}\nnalezeno: {json.dumps(stat)}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
