#!/usr/bin/env python3
"""Pátrání po pohřešovaných osobách v okolí -> docs/data/patrani.json.

Zdroj: zpravodajství Krajského ředitelství policie hl. m. Prahy
(policie.gov.cz/hlavni-mesto-praha/zpravodajstvi). Policie tam vyhlašuje
pátrání, která potřebují pomoc veřejnosti, a stejný článek později aktualizuje
(„Nalezena“, „VYPÁTRÁN“, „odvoláváme pátrání“).

Proč ne databáze policie.gov.cz/patrani-osoby: vyhledávání je chráněné
reCAPTCHA a ta se neobchází; bydliště je navíc jen na úrovni okresu (Praha).

Bereme jen POHŘEŠOVANÉ osoby – hledané pachatele záměrně ne (policie u nich
varuje před svépomocí a v sousedské aplikaci by to sloužilo spíš ke strachu).

Do dat jde jen titulek, perex (bez jmen, jak je píše policie), místa a odkaz.
Celý popis a fotky zůstávají u policie – po nalezení tak nic nezůstane u nás.
"""
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
BASE = "https://policie.gov.cz"
LIST = BASE + "/hlavni-mesto-praha/zpravodajstvi?page=%d"
STRAN = 3            # ~24 článků na stránku = zhruba poslední 3–5 týdnů
MAX_DNI = 30         # bez aktualizace déle než měsíc už nezobrazujeme (platí databáze policie)
NALEZENO_H = 24      # vyřešený případ ještě den ukážeme jako „nalezen“
UA = "Mozilla/5.0 (compatible; pod-okny-bot; +https://github.com/NamTNgo/praha14)"
LOG = []

# kandidát podle titulku/perexu ve výpisu (pak se ověří v článku)
KANDIDAT = re.compile(r"pohřeš|pátr|ztrat|ztratil|nevrátil|neviděli|vypátr|nalezen|odešel|hledáme (?:muže|ženu|seniork|chlap|dív|dítě)", re.I)
POHRESOVANY = re.compile(r"pohřešovan|ztratil[ai]? se|nevrátil[ai]? (?:se )?(?:domů|z )|odešel.{0,60}neznámo kam|obava o (?:jeho|její) život", re.I)
PODEZRELY = re.compile(r"podezřel|pachatel|útočník|obviněn|odcizil|ukradl|vězn|uprchl|svědk|sprejer|loupež|napadl", re.I)
VYRESENO = re.compile(r"(?<![a-zá])(?:nalezen[aiy]?|vypátrán[aiy]?|odvolá(?:vá|v)(?:me|ají|áme)? pátrání|odvolání pátrání|je v pořádku|jsou v pořádku|bez známek života|zemřel[a]?)(?![a-zá])", re.I)
NEGACE = re.compile(r"(?:nebyl[aiy]?|dosud ne|zatím ne|nepodařilo)\s*\S*\s*$", re.I)

# místa: Praha 9 a 14 (jádro) a sousední čtvrti (okolí); tvary v různých pádech
JADRO = [
    ("Praha 9", r"Praz?[eaYy]\s*9\b|Praha\s*9\b|Praze\s*9\b"),
    ("Praha 14", r"Praz?[ea]\s*14\b|Praha\s*14\b|Praze\s*14\b"),
    ("Prosek", r"Prosek|Prosk[ue]\b"),
    ("Střížkov", r"Střížkov"),
    ("Vysočany", r"Vysočan"),
    ("Hloubětín", r"Hloubětín"),
    ("Černý Most", r"Čern(?:ý|ého|ém|ým) Most"),
    ("Kyje", r"\bKyj(?:e|ích|í)\b"),
    ("Hostavice", r"Hostavic"),
    ("Lehovec", r"Lehov(?:ec|ci|ce)\b"),
    ("Jahodnice", r"Jahodnic"),
    ("Harfa", r"\bHarf[aěuy]\b"),
    ("Českomoravská", r"Českomoravsk"),
    ("Rajská zahrada", r"Rajsk(?:á|é|ou) zahrad"),
    ("Kolbenova", r"Kolbenov"),
    ("Hloubětínská", r"Hloubětínsk"),
]
OKOLI = [
    ("Praha 8", r"Praz?[ea]\s*8\b|Praha\s*8\b"),
    ("Praha 10", r"Praz?[ea]\s*10\b|Praha\s*10\b"),
    ("Praha 18", r"Praz?[ea]\s*18\b|Praha\s*18\b"),
    ("Praha 19", r"Praz?[ea]\s*19\b|Praha\s*19\b"),
    ("Praha 20", r"Praz?[ea]\s*20\b|Praha\s*20\b"),
    ("Praha 21", r"Praz?[ea]\s*21\b|Praha\s*21\b"),
    ("Libeň", r"Libn[iě]|Libeň"),
    ("Palmovka", r"Palmovk"),
    ("Letňany", r"Letňan"),
    ("Kbely", r"Kbel"),
    ("Čakovice", r"Čakovic"),
    ("Horní Počernice", r"Horní(?:ch)? Počernic"),
    ("Dolní Počernice", r"Dolní(?:ch)? Počernic"),
    ("Běchovice", r"Běchovic"),
    ("Malešice", r"Malešic"),
    ("Hrdlořezy", r"Hrdlořez"),
    ("Štěrboholy", r"Štěrbohol"),
    ("Kobylisy", r"Kobylis"),
    ("Bohnice", r"Bohnic"),
    ("Strašnice", r"Strašnic"),
]


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def stahni(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "cs"})
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:   # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise last


def text(s):
    s = re.sub(r"<(script|style|svg)[\s\S]*?</\1>", " ", s or "")
    s = re.sub(r"<br\s*/?>|</p>|</li>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", "\n", s)).strip()


def vypis(strana):
    h = stahni(LIST % strana)
    out = []
    for m in re.finditer(r'<h3[^>]*>\s*<a[^>]+href="(/hlavni-mesto-praha/[a-z0-9\-]+)"[^>]*>(.*?)</a>\s*</h3>\s*(?:<p[^>]*>(.*?)</p>)?', h, re.S):
        out.append({"url": BASE + m.group(1), "titulek": text(m.group(2)), "perex": text(m.group(3) or "")})
    return out


def meta(h, prop):
    m = re.search(r'<meta[^>]+(?:property|name)="%s"[^>]+content="([^"]*)"' % re.escape(prop), h)
    return html.unescape(m.group(1)) if m else ""


def clanek(url):
    h = stahni(url)
    tit = text((re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S) or [None, ""])[1])
    perex = text((re.search(r'<h1[\s\S]*?<p class="mb-s-nudge[^"]*"[^>]*>(.*?)</p>', h) or [None, ""])[1]) or meta(h, "description")
    sec = re.search(r'<section id="article-chapter-content"[^>]*>([\s\S]*?)</section>', h)
    telo = text(sec.group(1)) if sec else ""
    return {
        "titulek": tit or meta(h, "og:title"),
        "perex": perex,
        "telo": telo,
        "pub": meta(h, "article:published_time")[:16],
        "mod": meta(h, "article:modified_time")[:16],
        "obr": meta(h, "og:image"),
    }


def vyreseno(s):
    for m in VYRESENO.finditer(s):
        if not NEGACE.search(s[max(0, m.start() - 25):m.start()]):
            return True
    return False


def mista(s, seznam):
    return [n for n, rx in seznam if re.search(rx, s)]


def iso(s):
    try:
        d = dt.datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=TZ)
    except Exception:   # noqa: BLE001
        return None


def ulozit(data, pred):
    out_p = DATA / "patrani.json"
    klic = ("ok", "pripady", "praha")
    stejne = {k: pred.get(k) for k in klic} == {k: data.get(k) for k in klic}
    g = iso(pred.get("gen") or "")
    if stejne and g and NOW - g < dt.timedelta(hours=2):
        print("beze změny")
        return
    out_p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    out_p = DATA / "patrani.json"
    try:
        pred = json.loads(out_p.read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pred = {}
    try:
        polozky = []
        for s in range(1, STRAN + 1):
            v = vypis(s)
            log("výpis strana %d: %d článků" % (s, len(v)))
            if not v:
                break
            polozky += v
        if len(polozky) < 10:
            raise RuntimeError("výpis zpravodajství má jen %d článků – změnil se formát?" % len(polozky))
    except Exception as e:   # noqa: BLE001
        log("CHYBA zdroje:", e)
        pred.update({"ok": False, "chyba": str(e)[:200], "pokus": NOW.isoformat(timespec="minutes")})
        out_p.write_text(json.dumps(pred, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (DATA / "patrani_report.txt").write_text("\n".join(LOG), encoding="utf-8")
        sys.exit(1)

    videno = set()
    pripady, praha = [], 0
    for p in polozky:
        if p["url"] in videno or not KANDIDAT.search(p["titulek"] + " " + p["perex"]):
            continue
        videno.add(p["url"])
        try:
            c = clanek(p["url"])
        except Exception as e:   # noqa: BLE001
            log("  ! článek nejde stáhnout:", p["url"], e)
            continue
        hlava = c["titulek"] + " " + c["perex"]
        vse = hlava + "\n" + c["telo"]
        pohres = "patrani---pohresovani" in c["obr"] or bool(POHRESOVANY.search(vse))
        if not pohres or "patrani---podezrely" in c["obr"] or PODEZRELY.search(hlava):
            log("  – není pohřešovaný:", c["titulek"])
            continue
        mod = iso(c["mod"]) or iso(c["pub"])
        pub = iso(c["pub"]) or mod
        hotovo = vyreseno(c["titulek"] + " " + c["telo"][:700]) or vyreseno(vse)
        if hotovo:
            if not mod or NOW - mod > dt.timedelta(hours=NALEZENO_H):
                log("  ✓ vyřešeno (staré):", c["titulek"])
                continue
            stav = "nalezen"
        else:
            if not mod or NOW - mod > dt.timedelta(days=MAX_DNI):
                log("  – staré bez aktualizace:", c["titulek"])
                continue
            stav = "patra"
        jadro, okoli = mista(vse, JADRO), mista(vse, OKOLI)
        zona = "blizko" if jadro else "okoli" if okoli else "praha"
        if stav == "patra":
            praha += 1
        log("  %s [%s] %s  %s" % (stav, zona, c["titulek"], ", ".join(jadro + okoli)))
        if zona == "praha":
            continue   # mimo okolí jen počítáme
        pripady.append({
            "id": p["url"].rsplit("/", 1)[1],
            "stav": stav,
            "zona": zona,
            "titulek": re.sub(r"\s*-\s*(?:aktualizace|AKTUALIZACE|Aktualizace)\s*$", "", c["titulek"]),
            "perex": c["perex"][:400],
            "mista": jadro or okoli,
            "pub": c["pub"],
            "mod": c["mod"],
            "url": p["url"],
        })
    pripady.sort(key=lambda x: (x["stav"] != "patra", x["zona"] != "blizko", x["pub"] and -int(re.sub(r"\D", "", x["pub"]) or 0)))
    data = {"gen": NOW.isoformat(timespec="minutes"), "ok": True, "pripady": pripady, "praha": praha,
            "zdroj": BASE + "/hlavni-mesto-praha/zpravodajstvi"}
    log("výsledek: %d v okolí, %d aktivních pátrání v celé Praze (ze zpravodajství)" % (len(pripady), praha))
    ulozit(data, pred)
    (DATA / "patrani_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
