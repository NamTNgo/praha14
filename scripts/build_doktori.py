#!/usr/bin/env python3
"""Lékaři v Praze 9 a 14 z NRPZS -> docs/data/doktori.json.

Zdroj: ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb, datová sada
„Místa poskytování zdravotních služeb" (CC BY 4.0, aktualizace měsíčně).

NRPZS má u pražských záznamů jen správní obvod (Praha 9 = i Kbely, Letňany,
Čakovice…), ne městskou část. Na přesnou MČ se proto každý záznam páruje přes
adresy z RÚIAN (docs/data/addresses.json) – stejně jako u dopravních uzavírek.
Co se nespáruje, do naší oblasti nepatří a vypadne.
"""
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
URL = "https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


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
    nespar = skip_nelekar = 0
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

    (DATA / "doktori.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    from collections import Counter
    kat = Counter(r["o"] for r in out)
    mc = Counter(r["mc"] for r in out)
    log("\nlékařů v Praze 9 a 14: %d" % len(out))
    log("podle MČ: " + ", ".join("Praha %s=%d" % (k, v) for k, v in sorted(mc.items())))
    log("podle kategorie: " + ", ".join("%s=%d" % (k, kat[k]) for k in PRIORITA))
    log("nespárováno s našimi adresami: %d | vyřazeno nelékařských: %d" % (nespar, skip_nelekar))
    log("\nUKÁZKY:")
    for r in out[:12]:
        log("  [%s] %s — %s, Praha %s — %s" % (r["o"], r["n"][:40], r["a"], r["mc"], ", ".join(r["obory"])[:60]))
    (DATA / "doktori_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
