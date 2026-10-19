"""Vytvoří docs/data/vok.json z harmonogramů VOK a BIO VOK Prahy 14 (podzim 2026).
Místa se převádějí na souřadnice podle ulic v docs/data/addresses.json."""
import json, math, re, sys, unicodedata
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "docs" / "data"

def rows(text, typ, src):
    out = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        date, place, time = (x.strip() for x in line.split("|"))
        out.append({"type": typ, "src": src, "date": date, "place": place, "time": time})
    return out

# datum | místo | čas (prázdný = harmonogram čas neuvádí). Jen termíny od 15. 10. 2026.
VOK_HMP = """
2026-10-15|Koclířova/Kačínská|13:00–17:00
2026-10-15|Lásenická/Lipnická|14:00–18:00
2026-10-16|Stropnická/Za Černým mostem|14:00–18:00
2026-10-16|Babylonská/Jordánská|15:00–19:00
2026-10-21|Nedvědická/Žehuňská|14:00–18:00
2026-10-21|Vodňanská/Skorkovská|15:00–19:00
2026-10-22|Hamerská/Církvičná|13:00–17:00
2026-10-22|Jednostranná|14:00–18:00
2026-10-23|Herdovská/Bošilecká|13:00–17:00
2026-10-23|Kardašovská u obch. střediska|14:00–18:00
2026-10-23|Slévačská 902/11|15:00–19:00
2026-10-29|Dřítenská/Velkoborská|13:00–17:00
2026-10-29|Novozámecká/Vidlák|14:00–18:00
2026-10-30|Nežárská/Jansova|14:00–18:00
2026-10-30|Sicherova 1601/14|15:00–19:00
2026-11-04|Cvrčkova/Burdova|15:00–19:00
2026-11-05|Splavná/Svárovská|13:00–17:00
2026-11-05|Cidlinská/Maršovská|14:00–18:00
2026-11-06|Jezdovická/Froncova|14:00–18:00
2026-11-06|Mochovská/Zelenečská 686|15:00–19:00
2026-11-11|Konzumní/Na Obrátce|14:00–18:00
2026-11-11|Liblická/Klánovická|15:00–19:00
2026-11-12|Kukelská/Chvaletická|14:00–18:00
2026-11-13|Zámečnická/Mochovská|14:00–18:00
2026-11-13|Hejtmanská/Vranovská|15:00–19:00
2026-11-18|Tálinská/Oborská|14:00–18:00
2026-11-18|Kardašovská u obch. střediska|15:00–19:00
2026-11-20|Lásenická/Lipnická|14:00–18:00
2026-11-20|Světská/Lipnická|15:00–19:00
2026-11-25|Horusická/Osická|14:00–18:00
2026-11-25|Hodějovská/Za Rokytkou|15:00–19:00
2026-11-27|Koclířova/Vodňanská|14:00–18:00
2026-11-27|Zvíkovská/Dářská|15:00–19:00
2026-12-02|Nehvizdská/Zelenečská|14:00–18:00
2026-12-02|Jordánská/Svárovská|15:00–19:00
2026-12-03|Vodňanská/Skorkovská|13:00–17:00
2026-12-03|Rožmberská/Podlišovská|14:00–18:00
2026-12-04|Svépravická/Šestajovická|15:00–19:00
2026-12-09|Poříčanská/Klánovická|14:00–18:00
2026-12-09|Lipenské náměstí|15:00–19:00
2026-12-11|Kardašovská u obch. střediska|14:00–18:00
2026-12-11|Slévačská 902/11|15:00–19:00
"""
VOK_MC = """
2026-10-15|Kpt.Stránského/Vybíralova|
2026-10-19|Mansfeldova/Kučerova|
2026-10-20|Anderleho/gen.Janouška|
2026-10-21|Lomnická/Zalinská|
2026-10-22|Dygrýnova/Breicetlova|
2026-10-26|Bryksova č.p. 762/44 u separace|
2026-10-27|Doubecká/Baštýřská|
2026-10-29|Dobrovolného u separace|
2026-11-02|Pospíchalova/Vlčkova|
2026-11-03|Smikova/gen.Janouška|
2026-11-04|Bryksova/Fejfarova|
2026-11-05|Kpt. Stránského 961/35|
2026-11-09|9.května/Píščitá|
2026-11-10|Vašátkova/Doležalova|
2026-11-11|Bobkova/Maňákova|
2026-11-12|Kpt.Stránského/Vybíralova|
2026-11-16|Pospíchalova/Paculova|
2026-11-18|Šromova/gen.Janouška|
2026-11-19|Mansfeldova/Kučerova|
2026-11-23|Vašátkova 1012/18|
2026-11-24|Travná/Kostlivého|
2026-11-25|A.Valenty/Šedova|
"""
BIO_HMP = """
2026-10-24|Jordánská x Svárovská|09:00–12:00
2026-10-25|Vodňanská x Skorkovská|09:00–12:00
2026-10-31|Tálinská x U Rybníka|09:00–12:00
2026-10-31|Zvíkovská x Dářská|13:00–16:00
2026-11-07|Lipenské náměstí|09:00–12:00
2026-11-07|Nám. Zdenky Braunerové|13:00–16:00
2026-11-14|Borská x Těrlická|09:00–12:00
2026-11-15|Travná naproti č. p. 472|09:00–12:00
"""
BIO_MC = """
2026-11-14|Sadská x V Humenci|08:00–08:30
2026-11-14|Svatojánská x Vodňanská|08:45–09:15
2026-11-14|Borská x U Járku|09:30–10:00
2026-11-14|Světská x Lipnická|10:15–10:45
2026-11-14|Žehuňská u separace|11:15–11:45
2026-11-14|Hůrská u č.p. 528|12:00–12:30
2026-11-14|V Chaloupkách x Poříčanská|12:45–13:15
2026-11-14|V Chaloupkách x Kyjská|13:45–14:15
2026-11-14|V Chaloupkách x Hloubětínská|14:30–15:00
2026-11-14|Svépravická x Šestajovická|15:15–15:45
2026-11-15|Tálinská u č.p. 1038|08:00–08:30
2026-11-15|Hodějovská u separace|08:45–09:15
2026-11-15|Vlkovická x Dvořišťská|09:30–10:00
2026-11-15|Podedvorská x Podlišovská|10:15–10:45
2026-11-15|Rožmberská x Medlovská|11:15–11:45
2026-11-15|Sýkovecká x Pávovské nám.|12:00–12:30
2026-11-15|Lomnická x Panenská|12:45–13:15
2026-11-15|9. května x Píščitá|13:45–14:15
2026-11-15|Doubecká x Baštýřská|14:30–15:00
2026-11-15|Staňkovská x Pasecká|15:15–15:45
"""

ALIAS = {"genjanouska": "generalajanouska", "avalenty": "arnostavalenty", "namzdenkybraunerove": "namestizdenkybraunerove"}

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s.]", "", s)

def hav(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))

# Praha 9: klasické VOK (podzim 2026 – zima 2027). Přepis z harmonogramu VOK.
VOK9_SRC = "https://www.praha9.cz/sites/default/files/downloads/2026/08/VOK_2026_09-12_2026_01-02_2027.pdf"
VOK_P9 = """
2026-10-19|Vysočanská 85/546|15:00–19:00
2026-10-24|Granitova x Saarinenova|8:00–12:00
2026-10-24|Bílinská x Litvínovská|9:00–13:00
2026-10-26|Novoborská x Českolipská|15:00–19:00
2026-10-27|Teplická x Litoměřická|13:00–17:00
2026-10-27|Pod Strojírnami|14:00–18:00
2026-10-27|Jablonecká x Šluknovská|15:00–19:00
2026-10-31|Lihovarská u č. 11|8:00–12:00
2026-10-31|Pod Harfou x Kabešova|9:00–13:00
2026-11-02|Vysočanská 113/243|15:00–19:00
2026-11-03|Kovanecká x Podvinný mlýn|13:00–17:00
2026-11-03|náměstí Na Balabence|14:00–18:00
2026-11-03|Na Břehu x Mlékárenská|15:00–19:00
2026-11-07|Pod Krocínkou proti č. 55|8:00–12:00
2026-11-07|Hrdlořezská u č.p. 64/43|9:00–13:00
2026-11-09|Kovářská x U Školičky|15:00–19:00
2026-11-10|Kytlická|13:00–17:00
2026-11-10|Stoupající|14:00–18:00
2026-11-10|Jablonecká u č.p. 715/9|15:00–19:00
2026-11-14|Prouzova|8:00–12:00
2026-11-14|Svatošových x Smržových|9:00–13:00
2026-11-16|Matějkova x Čihákova|15:00–19:00
2026-11-21|Pešlova x Paříkova|8:00–12:00
2026-11-21|Vysočanská 39/573|9:00–13:00
2026-11-23|Prosecká 131|15:00–19:00
2026-11-24|Měšická x Novoborská|13:00–17:00
2026-11-24|Rumburská x Litvínovská|14:00–18:00
2026-11-24|Novoborská x Českolipská|15:00–19:00
2026-11-28|U Elektry x Modrého|8:00–12:00
2026-11-28|Kopečná x Nad Šestikopy|9:00–13:00
2026-11-30|Novoborská x Varnsdorfská|15:00–19:00
2026-12-01|Ctěnická x Měšická|13:00–17:00
2026-12-01|Pod Strojírnami|14:00–18:00
2026-12-01|Bílinská x Litvínovská|15:00–19:00
2026-12-05|Poděbradská x Podkovářská|8:00–12:00
2026-12-05|Vysočanská 85/546|9:00–13:00
2026-12-07|Makedonská u č. 1|15:00–19:00
2026-12-08|Veltruská x Litvínovská|13:00–17:00
2026-12-08|Pískovcová|14:00–18:00
2026-12-08|Lihovarská u č. 11|15:00–19:00
2026-12-12|Na Břehu x Mlékárenská|8:00–12:00
2026-12-12|K Lipám x Chrastavská|9:00–13:00
2026-12-14|Měšická x Novoborská|15:00–19:00
2026-12-15|Jablonecká x Šluknovská|15:00–19:00
"""

# Praha 9: BIO VOK, podzim 2026 (čas vždy 9:00–12:00)
BIO9_SRC = "https://www.praha9.cz/sites/default/files/downloads/2026/09/P9_VOK_BIO_2026_podzim_0.pdf"
BIO_P9 = """
2026-10-25|Miškovická x Poleradská|9:00–12:00
2026-10-25|K Lipám x Chrastavská|9:00–12:00
2026-10-25|Nad Krocínkou x Obvodová|9:00–12:00
2026-11-01|Před Mosty x Za Mosty|9:00–12:00
2026-11-01|Kopečná x Nad Šestikopy|9:00–12:00
2026-11-08|Pokorného x Jahodnická|9:00–12:00
2026-11-08|Pod Krocínkou proti č. 55|9:00–12:00
2026-11-08|Hrdlořezská 43|9:00–12:00
2026-11-15|Miškovická x Poleradská|9:00–12:00
2026-11-15|Odlehlá 1|9:00–12:00
2026-11-22|Nad Krocínkou x Obvodová|9:00–12:00
2026-11-22|Kopečná x Nad Šestikopy|9:00–12:00
2026-11-29|K Lipám x Chrastavská|9:00–12:00
2026-11-29|Pod Krocínkou proti č. 55|9:00–12:00
"""


def label(place):
    n = re.sub(r"/(?=\D)", " x ", place)
    for a, b in (("gen.Janouška", "Generála Janouška"), ("A.Valenty", "Arnošta Valenty"), ("Kpt.Stránského", "Kpt. Stránského"),
                 ("9.května", "9. května"), ("Nám. Zdenky", "náměstí Zdenky"), ("č. p.", "č.p.")):
        n = n.replace(a, b)
    return n


def main():
    addr = json.loads((D / "addresses.json").read_text(encoding="utf-8"))
    by = {}
    for a in addr:
        by.setdefault(norm(a[0]), []).append(a)

    def street_pts(name):
        n = norm(name)
        n = ALIAS.get(n, n)
        n = n.replace("nam", "namesti") if n.endswith("nam") else n
        return by.get(n)

    def part(p):
        """vrátí seznam (lat, lon) bodů pro jednu část místa"""
        p = re.sub(r"\bu obch\. střediska|\bu separace|\b(u|proti|naproti)\s+(?=č\. ?p\.)", " ", p)
        p = re.sub(r"č\. ?p\.", " ", p)
        # "u č. 11", "proti č. 55" (bez „p") – orientační bod, ne adresa: necháme jen ulici
        p = re.sub(r"\b(u|proti|naproti)?\s*č\.\s*\d+[\w/]*", " ", p)
        p = re.sub(r"\s+", " ", p).strip()
        m = re.match(r"^(.*?)\s+(\d+)(?:/(\d+))?$", p)
        cd = co = None
        if m and not p.startswith("9."):
            p, cd, co = m.group(1).strip(), m.group(2), m.group(3)
        pts = street_pts(p)
        if not pts:
            return None
        if cd:
            hit = [a for a in pts if a[1] == cd and (not co or a[2] == co)] or [a for a in pts if a[1] == cd]
            if hit:
                return [(a[3], a[4]) for a in hit]
        return [(a[3], a[4]) for a in pts]

    def geocode(place):
        """místo -> (lat, lon) nebo None; u křižovatek vezme nejbližší dvojici bodů a střed."""
        parts = re.split(r"\s+x\s+|/(?=\D)", place)
        pts = [part(p) for p in parts]
        pts_ok = [p for p in pts if p]
        if not pts_ok:
            return None, False
        if len(pts_ok) >= 2:
            b = min(((hav(p, q), p, q) for p in pts_ok[0] for q in pts_ok[1]), key=lambda t: t[0])
            return ((b[1][0] + b[2][0]) / 2, (b[1][1] + b[2][1]) / 2), len(pts_ok) < len(parts)
        return (sum(p[0] for p in pts_ok[0]) / len(pts_ok[0]), sum(p[1] for p in pts_ok[0]) / len(pts_ok[0])), len(pts_ok) < len(parts)

    def build(bloky):
        res, miss = [], []
        for typ, src, text in bloky:
            for r in rows(text, typ, src):
                ll, castecne = geocode(r["place"])
                if not ll:
                    miss.append(r["place"]); continue
                if castecne:
                    miss.append(r["place"] + " (jen část)")
                res.append({"t": r["type"], "n": label(r["place"]), "d": r["date"], "h": r["time"],
                            "lat": round(ll[0], 5), "lon": round(ll[1], 5)})
        return res, miss

    out, miss = build((("vok", "hmp", VOK_HMP), ("vok", "mc", VOK_MC), ("bio", "hmp", BIO_HMP), ("bio", "mc", BIO_MC)))
    out9, miss9 = build((("vok", "p9", VOK_P9), ("bio", "p9", BIO_P9)))
    print("Praha 14:", len(out), "| problémy:", miss)
    print("Praha 9:", len(out9), "| problémy:", miss9)
    (D / "vok.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (D / "vok9.json").write_text(json.dumps({"src": {"vok": VOK9_SRC, "bio": BIO9_SRC}, "mista": out9}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

if __name__ == "__main__":
    sys.exit(main())
