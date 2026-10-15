"""Jednorázově (ročně) vytvoří docs/data/hazard.json z harmonogramu mobilního sběru
nebezpečného odpadu Prahy 14 a souřadnic ulic z docs/data/addresses.json."""
import json, math, re, sys, unicodedata
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "docs" / "data"
YEAR = 2026
SRC = "https://www.praha14.cz/app/uploads/sites/2/2026/02/NO_2026.pdf"

ROUTES = {
 "A": (["03-05", "05-16", "09-03", "11-10"], [
  "Zámečnická x Mochovská", "Sadská x V Novém Hloubětíně", "Klánovická x Liblická", "Šestajovická x Švépravická",
  "Cidlinská x Maršovská", "Kukelská x Chvaletická x Žárská", "Rochovská x Kardašovská|u nákupního střediska", "Hejtmanská x Vranovská"]),
 "B": (["03-19", "05-30", "09-16", "11-24"], [
  "Sicherova x Federova", "Koclířova x Kačínská", "Vírská x Branská", "Splavná x Okrouhlíkova",
  "Světská x Jordánská", "Jezdovická x Froncova", "Vidlák x Novozámecká", "Lipenské náměstí"]),
 "C": (["02-17", "04-18", "07-16", "10-15"], [
  "Panenská x 9. května", "Baštýřská x Bezdrevská", "Horusická x Osická", "Dářská x Zvíkovská",
  "Zacharská x Velkoborská", "Dvořišťská x Vlkovická", "Za školou x Šimanovská", "Oborská x Tálinská x U Rybníka"]),
 "D": (["02-10", "05-12", "08-06", "11-21"], [
  "Trytova x Paculova", "Vašátkova x Dygrýnova", "Smikova x Generála Janouška", "Himrova x Generála Janouška",
  "Vybíralova x Kapitána Stránského", "Fejfarova x Bryksova", "Kučerova x Mansfeldova", "Šedova x Arnošta Valenty"]),
}

ALIAS = {"Kapitána Stránského": "Kpt. Stránského"}

ROUTES9 = {
 "A": (["03-17", "05-05", "06-02", "09-01", "11-07"], [
  "K Šafránce x Na Pokraji", "Mimoňská x Verneřická|za poštou", "Letňanská x Klíčovská", "Špitálská x Prouzova",
  "Drahobejlova|u metra Českomoravská", "Vysočanské náměstí x U Nové školy", "U Smetanky|u potravin Lidl"]),
 "B": (["04-01", "07-11", "11-26"], [
  "Jahodnická x Smrková", "Paříkova x Pešlova", "Kovanecká x Podvinný mlýn", "Pískovcová x Kopečná",
  "Litoměřická x Vysočanská", "Vysočanská 243", "Jablonecká x Jiřetínská", "Zárybská x Ctěnická"]),
}
SRC9 = "https://www.praha9.cz/urad-a-samosprava/zivotni-prostredi"

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("nam.", "namesti").strip()

def hm(h, m): return f"{h:02d}:{m:02d}"
def slot(start_h, start_m, i):
    t = start_h * 60 + start_m + 30 * i
    e = t + 20
    return f"{hm(t // 60, t % 60)}–{hm(e // 60, e % 60)}"

def hav(a, b):
    p = math.pi / 180
    x = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(x))

def build(routes, mc, addr, missing):
    streets = {}
    for a in addr:
        if a[5] == mc:
            streets.setdefault(norm(a[0]), []).append(a)
    out = {}
    for rk, (dates, stops) in routes.items():
        lst = []
        for i, st in enumerate(stops):
            name, _, note = st.partition("|")
            pts = []
            for p in [x.strip() for x in name.split(" x ")]:
                m = re.match(r"^(.*?)\s+(\d+)$", p)
                street, cd = (m.group(1), m.group(2)) if m else (p, None)
                hit = streets.get(norm(ALIAS.get(street, street)))
                if not hit:
                    missing.append(p)
                    continue
                if cd:
                    hit = [a for a in hit if a[1] == cd] or hit
                pts.append([(a[3], a[4]) for a in hit])
            if not pts:
                missing.append("ZASTÁVKA BEZ SOUŘADNIC: " + name)
                continue
            if len(pts) >= 2:
                best = min(((hav(p, q), p, q) for p in pts[0] for q in pts[1]), key=lambda t: t[0])
                lat, lon = (best[1][0] + best[2][0]) / 2, (best[1][1] + best[2][1]) / 2
            else:
                lat = sum(p[0] for p in pts[0]) / len(pts[0]); lon = sum(p[1] for p in pts[0]) / len(pts[0])
            lst.append({"name": name, "note": note, "lat": round(lat, 5), "lon": round(lon, 5),
                        "wk": slot(15, 0, i), "sat": slot(8, 0, i)})
        out[rk] = {"dates": [f"{YEAR}-{d}" for d in dates], "stops": lst}
    return out


def main():
    addr = json.loads((D / "addresses.json").read_text(encoding="utf-8"))
    missing = []
    out = {"year": YEAR, "14": {"src": SRC, "routes": build(ROUTES, "14", addr, missing)},
           "9": {"src": SRC9, "routes": build(ROUTES9, "9", addr, missing)}}
    print("Ulice bez adres v RÚIAN (použije se druhá ulice zastávky):", sorted(set(missing)))
    print({mc: {k: len(v["stops"]) for k, v in out[mc]["routes"].items()} for mc in ("14", "9")})
    (D / "hazard.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
