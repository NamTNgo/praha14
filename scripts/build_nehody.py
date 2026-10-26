#!/usr/bin/env python3
"""Nehody a mimořádné události z NDIC -> docs/data/nehody.json.

Běží každých 5 minut (spouští ho Cloudflare Worker), zatímco uzavírky a zbytek dopravy se staví jednou denně
(scripts/build_doprava.py). Důvod je věcný: uzavírka trvá týdny, nehoda desítky
minut, a nehoda zobrazená o pět hodin později už jen mate. Vlastní soubor také
znamená, že si oba běhy nepřepisují výsledky navzájem.

Když rozhraní NDIC selže nebo chybí přístupové údaje, zapíše se prázdný seznam:
stará nehoda je horší než žádná.
"""
import datetime as dt
import json
import os
import sys

from build_doprava import DATA, LOG, datex, nacti_ulice


def main():
    # dokud nejsou přístupové údaje, soubor vůbec nevzniká: jinak by každý běh
    # commitoval jen nové razítko času a repozitář by zaplavil prázdnými změnami
    if not os.environ.get("NDIC_URL"):
        print("Chybí NDIC_URL, nehody se zatím nestahují.")
        return

    nehody = []
    chyba = None
    try:
        _, nehody = datex(os.environ.get("NDIC_URL"), os.environ.get("NDIC_TOKEN"),
                          nacti_ulice())
    except Exception as e:
        chyba = e
        LOG.append("nehody SELHALY: %s" % e)

    (DATA / "nehody.json").write_text(json.dumps({
        "gen": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ndic": bool(nehody) or (chyba is None and bool(os.environ.get("NDIC_URL"))),
        "nehody": nehody,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "nehody_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))
    if chyba:
        sys.exit("Rozhraní NDIC selhalo: %s" % chyba)


if __name__ == "__main__":
    main()
