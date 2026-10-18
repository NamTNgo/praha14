#!/usr/bin/env python3
"""Jednorázová sonda struktury NRPZS CSV -> docs/data/doktori_probe.txt.

Ze sandboxu na uzis.gov.cz nedosáhnu, tak si hlavičku, ukázky a četnosti
oborů nechám vypsat v GitHub Action. Podle výstupu pak napíšu parser.
Po zprovoznění parseru tenhle skript i jeho workflow zmizí.
"""
import csv
import io
import sys
import urllib.request
from collections import Counter
from pathlib import Path

URL = "https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv"
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "doktori_probe.txt"
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=180).read()
    log = ["staženo %d B" % len(raw)]

    # detekce kódování a oddělovače z prvního řádku
    text = raw.decode("utf-8-sig", "replace")
    head = text[:3000].splitlines()[0]
    delim = ";" if head.count(";") >= head.count(",") else ","
    log.append("oddělovač: %r" % delim)

    rdr = csv.DictReader(io.StringIO(text), delimiter=delim)
    cols = rdr.fieldnames or []
    log.append("\nSLOUPCE (%d):" % len(cols))
    for c in cols:
        log.append("  " + c)

    obor_col = next((c for c in cols if "obor" in c.lower()), None)
    so_col = next((c for c in cols if "spravni" in c.lower() or "správní" in c.lower()), None)
    obec_col = next((c for c in cols if c.lower().endswith("obec") or "_obec" in c.lower()), None)
    gps_col = next((c for c in cols if "gps" in c.lower() or "soura" in c.lower()), None)

    obory, so_praha = Counter(), Counter()
    ukazky_praha = []
    n = 0
    for row in rdr:
        n += 1
        je_praha = obec_col and "praha" in (row.get(obec_col, "") or "").lower()
        if obor_col and je_praha:
            for o in (row.get(obor_col, "") or "").split(","):
                o = o.strip()
                if o:
                    obory[o] += 1
        if so_col and je_praha:
            so_praha[(row.get(so_col, "") or "").strip()] += 1
        if je_praha and len(ukazky_praha) < 3:
            ukazky_praha.append(row)

    log.append("\nřádků celkem: %d" % n)
    log.append("obor sloupec: %s | obec sloupec: %s | SO sloupec: %s | GPS sloupec: %s"
               % (obor_col, obec_col, so_col, gps_col))
    if gps_col and ukazky_praha:
        log.append("GPS ukázka: %r" % ukazky_praha[0].get(gps_col))
    log.append("\nSPRÁVNÍ OBVODY v Praze (top 20):")
    for k, v in so_praha.most_common(20):
        log.append("  %5d  %s" % (v, k))
    log.append("\nOBORY PÉČE v Praze (top 60):")
    for k, v in obory.most_common(60):
        log.append("  %5d  %s" % (v, k))
    log.append("\nUKÁZKOVÉ ŘÁDKY (Praha):")
    for r in ukazky_praha:
        log.append("  " + " | ".join("%s=%s" % (k, r[k]) for k in cols if r.get(k)))

    OUT.write_text("\n".join(log), encoding="utf-8")
    print("\n".join(log))


if __name__ == "__main__":
    main()
