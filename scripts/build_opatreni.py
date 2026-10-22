"""Přechodné úpravy provozu (opatření obecné povahy) z úředních desek Prahy 9 a 14.

Zdroje
  Praha 9  – praha9.cz úřední deska: „Opatření OP_…“, „MHMP_Opatření OP_…“, „… - OOP (…)“
  Praha 14 – edeska.praha14.cz, kategorie „Oznámení odboru dopravy“: „… stanovení přechodné úpravy provozu v ul. …“
Vynecháváme návrhy (ještě neplatí) a vyhrazená parkoviště (obsahují SPZ konkrétních lidí).

Z dokumentu bereme jen ulice, termín a důvod („z důvodu výměny kabelů NN“), žádná jména.
Výstup docs/data/opatreni.json – stejný tvar jako rizeni.json › oop, aplikace je zobrazí
v Dopravě › Uzavírky a práce:
  {gen, ok, oop: [{n, mc, ul: [ulice], lat, lon, od, do, p, u, z: "oop"}]}
"""
import datetime as dt
import json
import re
import sys
import urllib.parse
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_rizeni import DATA, NOW, P9, P9_DESKA, P14, html_text, plain, stahni  # noqa: E402
from build_elektrina import text_vyhlasky, DATUM  # noqa: E402

VERZE = 1
LOG = []
P9_OOP = re.compile(r"\bOP_|\bOOP\b|opatření obecné povahy", re.I)
P14_OOP = re.compile(r"přechodné úpravy provozu", re.I)
NE = re.compile(r"návrh|vyhrazen|parkovací místo|ZTP", re.I)


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def nacti_ulice():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    ul = {}
    for u, c, o, la, lo, mc, cast in adr:
        if la:
            ul.setdefault(plain(u), {"n": u, "mc": mc, "b": []})["b"].append((la, lo))
    for v in ul.values():
        v["lat"] = round(sum(b[0] for b in v["b"]) / len(v["b"]), 6)
        v["lon"] = round(sum(b[1] for b in v["b"]) / len(v["b"]), 6)
        del v["b"]
    return ul


def praha9():
    h = stahni(P9_DESKA)
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
        if len(td) < 2:
            continue
        nazev = html_text(td[0])
        a = re.search(r'href="([^"]+)"', td[0])
        vyv = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", html_text(td[1]))
        if a and vyv and P9_OOP.search(nazev) and not NE.search(nazev):
            out.append({"src": "p9", "mc": "9", "nazev": nazev, "url": urllib.parse.urljoin(P9, a.group(1)),
                        "vyv": "%04d-%02d-%02d" % (int(vyv.group(3)), int(vyv.group(2)), int(vyv.group(1)))})
    log("Praha 9: opatření na desce %d" % len(out))
    return out


def praha14():
    h = stahni(P14 + "eDeskaAktualni.jsp", data={"order": "vyveseno", "desc": "true", "first": "0", "oblast": "",
                                                  "kategorie": "Oznámení odboru dopravy", "nazev": "", "text": "", "count": "100"})
    out = []
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        td = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr)
        if len(td) < 7:
            continue
        a = re.search(r'href="([^"]*eDeskaDetail\.jsp\?detailId=\d+)"', tr)
        pr = re.findall(r'href="([^"]*download\.jsp\?idPriloha=\d+)"', tr)
        vyv = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", html_text(td[6]))
        nazev = html_text(td[2])
        if a and vyv and P14_OOP.search(nazev) and not NE.search(nazev):
            out.append({"src": "p14", "mc": "14", "nazev": nazev, "url": urllib.parse.urljoin(P14, a.group(1)),
                        "pdf": [urllib.parse.urljoin(P14, x) for x in pr],
                        "vyv": "%s-%s-%s" % (vyv.group(3), vyv.group(2), vyv.group(1))})
    log("Praha 14: přechodných úprav provozu na desce %d" % len(out))
    return out


def pdf_odkazy(v):
    if v.get("pdf"):
        return v["pdf"]
    h = stahni(v["url"])
    return [urllib.parse.urljoin(P9, x) for x in re.findall(r'href="([^"]+\.pdf)"', h, re.I)]


def termin(t):
    """„v termínu 12.11.2026“, „v termínu 28.10. – 31. 10.2026“, „v termínu od 7. 10. 2026 do 23. 1. 2027“."""
    s = re.sub(r"\s+", " ", t)
    m = re.search(r"v\s*termínu\s*(.{0,70})", s, re.I) or re.search(r"(?:v době|ve dnech|dne)\s*(.{0,60}?)(?:,| z důvodu)", s, re.I)
    if not m:
        return None, None
    kus = m.group(1)
    dd = [(int(x.group(1)), int(x.group(2)), x.group(3)) for x in re.finditer(r"(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(20\d\d)?", kus)]
    dd = [d for d in dd if 1 <= d[0] <= 31 and 1 <= d[1] <= 12]
    if not dd:
        return None, None
    rok = next((d[2] for d in reversed(dd) if d[2]), str(NOW.year))
    out = []
    for d, mth, r in dd[:2]:
        r = r or rok
        if not dd[-1][2] and not r:
            r = str(NOW.year)
        out.append("%s-%02d-%02d" % (r, mth, d))
    if len(out) == 2 and out[0] > out[1]:        # „28.12. – 3. 1. 2027“
        out[0] = "%d%s" % (int(out[0][:4]) - 1, out[0][4:])
    return out[0], out[-1]


def duvod(t):
    s = re.sub(r"\s+", " ", t)
    m = re.search(r"z\s*důvodu\s+(.{3,90}?)(?:,|\s+dle\b|\s+podle\b|\.\s)", s, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"podal\s+(.{3,80}?)(?:,\s*IČO?|,\s*IC)", s)   # žadatel – jen firma (má IČO)
    if m and not re.search(r"\d{3}\s*\d{2}\s*Praha", m.group(1)):
        return "prací (" + m.group(1).strip() + ")"
    return ""


def ulice_z(t, nazev, ul):
    s = plain(re.sub(r"\s+", " ", nazev + " ; " + t[:3000]))
    m = re.search(r"(?:spocivajici|tato uprava spociva)(.{0,400}?)(?:v\s*terminu|podle prilozene|dle prilozene|z duvodu)", s)
    usek = plain(nazev) + " ; " + (m.group(1) if m else "")
    nalez = []
    for k in sorted(ul, key=len, reverse=True):
        if len(k) < 4:
            continue
        for mm in re.finditer(r"(?<![a-z])" + re.escape(k) + r"(?![a-z])", usek):
            if re.search(r"(k\s*\.?\s*u\s*\.?|praze?\s*\d+\s*[-–]?)\s*$", usek[max(0, mm.start() - 14):mm.start()]):
                continue                     # „k.ú. Libeň“, „Praze 14 - Kyje“ = čtvrť, ne ulice
            if not any(a <= mm.start() < b for a, b, _ in nalez):
                nalez.append((mm.start(), mm.end(), k))
    nalez.sort()
    out = []
    for _, _, k in nalez:
        if ul[k]["n"] not in out:
            out.append(ul[k]["n"])
    return out


def main():
    ul = nacti_ulice()
    cache_p = DATA / "opatreni_cache.json"
    try:
        cache = json.loads(cache_p.read_text(encoding="utf-8"))
        if cache.get("v") != VERZE:
            raise ValueError
    except Exception:   # noqa: BLE001
        cache = {"v": VERZE, "vyhlasky": {}}

    ok, seznam = True, []
    for f in (praha9, praha14):
        try:
            seznam += f()
        except Exception as e:   # noqa: BLE001
            ok = False
            log("CHYBA zdroje", f.__name__, e)

    for v in seznam:
        if v["url"] in cache["vyhlasky"]:
            continue
        t = ""
        try:
            for u in pdf_odkazy(v)[:4]:          # u Prahy 9 bývá první příloha situace, hledáme samotné opatření
                x = text_vyhlasky(stahni(u, binarni=True))
                if re.search(r"opatřen", x, re.I):
                    t = x
                    break
                t = t or x
        except Exception as e:   # noqa: BLE001
            log("    ! nejde stáhnout:", v["nazev"][:60], e)
            continue
        if re.search(r"vyhrazen\w* parkovi", t, re.I):
            cache["vyhlasky"][v["url"]] = {"skip": 1}
            continue
        od, do = termin(t)
        zaznam = {"mc": v["mc"], "nazev": v["nazev"], "vyv": v["vyv"], "od": od, "do": do, "duvod": duvod(t),
                  "ul": ulice_z(t, v["nazev"], ul)}
        cache["vyhlasky"][v["url"]] = zaznam
        log("nové: %s · %s–%s · %s · %s" % (v["nazev"][:60], od, do, ", ".join(zaznam["ul"]) or "?", zaznam["duvod"][:50]))

    dnes = NOW.strftime("%Y-%m-%d")
    aktualni = {v["url"] for v in seznam}
    oop = []
    for url, x in list(cache["vyhlasky"].items()):
        if url not in aktualni:
            del cache["vyhlasky"][url]
            continue
        if x.get("skip") or not x["ul"]:
            continue
        konec = x["do"] or (dt.date.fromisoformat(x["vyv"]) + dt.timedelta(days=30)).isoformat()
        if konec < dnes:
            continue
        hl = ul[plain(x["ul"][0])]
        d = x["duvod"]
        nazev = "Dopravní omezení – " + ", ".join(x["ul"][:3]) + (" a další" if len(x["ul"]) > 3 else "")
        oop.append({"id": str(zlib.crc32(url.encode())), "n": nazev, "mc": x["mc"], "ul": x["ul"], "lat": hl["lat"], "lon": hl["lon"],
                    "od": x["od"] or x["vyv"], "do": x["do"],
                    "p": ("Z důvodu " + d + ". " if d else "") + "Přechodné dopravní značení podle opatření úřadu MČ Praha " + x["mc"] + ".",
                    "u": url, "z": "oop"})
    oop.sort(key=lambda o: o["od"] or "")
    (DATA / "opatreni.json").write_text(json.dumps({"gen": NOW.isoformat(timespec="seconds"), "ok": ok, "oop": oop},
                                                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cache_p.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log("výstup: %d platných opatření" % len(oop))
    (DATA / "opatreni_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
