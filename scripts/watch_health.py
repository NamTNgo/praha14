#!/usr/bin/env python3
"""Hlídač zdraví datového kanálu – hlavně NDIC, který je nejkřehčí.

Co kontroluje:
  1. NDIC přes Worker/R2 vrací data (HTTP 200, XML).
  2. Feed má rozumný počet záznamů (ŘSD nevypadlo, formát se nezměnil).
  3. Náš filtr pořád nachází uzavírky pro Prahu 9/14 (nespadl na 0).
  4. doprava.json a nehody.json se opravdu obnovují (čerstvost podle `gen`).

Když něco nesedí, zapíše watch/health_issue.md s DIAGNÓZOU i POSTUPEM, co udělat –
z toho workflow založí GitHub Issue. Stav si drží ve watch/health.json a hlásí
jen NOVÉ problémy, ať nespamuje; vyřešení pozná a do příště mlčí.

Spouští se z GitHub Actions (secrets NDIC_URL, NDIC_TOKEN). Když chybí, NDIC
kontroly se přeskočí a hlídají se jen soubory.
"""
import datetime as dt
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_doprava as B  # noqa: E402  (sdílíme parser, ať hlídač testuje totéž co build)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
WATCH = ROOT / "watch"
NOW = dt.datetime.now(dt.timezone.utc)

# Prahy, za kterými je něco špatně. Drží se v health.json, aby se hlásily jen nové.
MIN_ZAZNAMU = 500          # feed celé ČR; výrazně míň = výpadek nebo změna formátu
DOPRAVA_MAX_H = 36         # denní build; starší = úloha neběží
NEHODY_MAX_MIN = 60        # cron á 10 min; 60 min bez obnovy = problém


def fetch_ndic(url, token):
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, B.rozbal(r.read(), (r.headers.get("Content-Encoding") or "").lower())


def stari_h(cesta):
    """Stáří souboru podle pole `gen` (ISO) v hodinách, nebo None když nejde přečíst."""
    try:
        gen = json.loads(cesta.read_text(encoding="utf-8")).get("gen")
        t = dt.datetime.fromisoformat(gen.replace("Z", "+00:00"))
        return (NOW - t).total_seconds() / 3600
    except Exception:
        return None


def kontroly():
    """Vrátí seznam problémů: (klíč, nadpis, detaily, co_s_tim)."""
    problemy = []
    url, token = os.environ.get("NDIC_URL"), os.environ.get("NDIC_TOKEN")

    # --- NDIC feed přes Worker/R2 ---
    if url and token:
        try:
            status, raw = fetch_ndic(url, token)
            if status != 200 or len(raw) < 10000:
                problemy.append((
                    "ndic-fetch",
                    "NDIC: Worker nevrací data",
                    "Odpověď HTTP %s, %d B." % (status, len(raw)),
                    "Zkontroluj Cloudflare Worker (běží?), R2 (naplněné?) a cron. "
                    "Ručně spusť `GET /refresh` s tokenem z pražské IP a mrkni na "
                    "Worker → Logs."))
            else:
                koren = ET.fromstring(raw)
                zazn = sum(1 for e in koren.iter() if B.lok(e.tag) == "situationrecord")
                if zazn < MIN_ZAZNAMU:
                    ukazka = next((ET.tostring(e, encoding="unicode")[:400]
                                   for e in koren.iter() if B.lok(e.tag) == "situationrecord"), "(žádný záznam)")
                    problemy.append((
                        "ndic-maly-feed",
                        "NDIC: podezřele málo záznamů (%d)" % zazn,
                        "Feed celé ČR má obvykle tisíce situationRecordů, teď %d.\n"
                        "Ukázka prvního záznamu:\n```xml\n%s\n```" % (zazn, ukazka),
                        "Buď výpadek na straně ŘSD (počkat), nebo změna formátu. "
                        "Porovnej strukturu s parserem v build_doprava.py (funkce "
                        "ndic_typ, ndic_souradnice, iterace `situation`)."))
                else:
                    # náš filtr pustíme na stažená data (bez druhého stahování)
                    B.fetch = lambda *a, **k: raw
                    prace, nehody = B.datex(url, token, B.nacti_ulice())
                    if not prace:
                        ukazka = next((ET.tostring(e, encoding="unicode")[:500]
                                       for e in koren.iter() if B.lok(e.tag) == "situationrecord"), "")
                        problemy.append((
                            "ndic-filtr-0",
                            "NDIC: filtr nenašel žádnou uzavírku pro Prahu 9/14",
                            "Feed je zdravý (%d záznamů), ale pro P9/14 prošlo 0 prací/uzavírek.\n"
                            "Buď opravdu nic není, nebo se rozbil filtr podle textu "
                            "(mc_z_textu) či druhy událostí (D_TYPY).\n"
                            "Ukázka záznamu:\n```xml\n%s\n```" % (zazn, ukazka),
                            "Zkontroluj, zda ŘSD nezměnilo formát popisu (hledáme "
                            "„Praha 9/14“ v textu) nebo názvy xsi:type. Dočasně nic "
                            "nerozbíjí – aplikace jede dál na aktualitách MČ."))
        except Exception as e:  # noqa: BLE001
            problemy.append((
                "ndic-chyba",
                "NDIC: kontrola spadla",
                "Výjimka: %r" % e,
                "Nejspíš nedostupný Worker nebo neplatný XML. Ověř Worker a R2."))

    # --- čerstvost výstupních souborů ---
    d = stari_h(DATA / "doprava.json")
    if d is not None and d > DOPRAVA_MAX_H:
        problemy.append((
            "doprava-stara",
            "Uzavírky se neaktualizují",
            "doprava.json je starý %.0f h (limit %d h)." % (d, DOPRAVA_MAX_H),
            "Mrkni na workflow „Dopravní komplikace“ v Actions – jestli neselhává."))

    n = stari_h(DATA / "nehody.json")
    if n is not None and n * 60 > NEHODY_MAX_MIN:
        problemy.append((
            "nehody-stare",
            "Nehody se neobnovují",
            "nehody.json je starý %.0f min (limit %d min)." % (n * 60, NEHODY_MAX_MIN),
            "Workflow „Nehody (NDIC)“ neběží, nebo Worker/R2 nevrací data – viz Actions."))

    return problemy


def main():
    WATCH.mkdir(exist_ok=True)
    sp = WATCH / "health.json"
    stav = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
    otevrene = set(stav.get("otevrene", []))

    problemy = kontroly()
    akt = {k for k, *_ in problemy}
    nove = akt - otevrene          # jen nově vzniklé problémy spustí Issue

    issue = WATCH / "health_issue.md"
    if nove:
        bloky = []
        for k, nadpis, detail, co in problemy:
            znak = "🆕 " if k in nove else ""
            bloky.append("### %s%s\n%s\n\n**Co s tím:** %s" % (znak, nadpis, detail, co))
        issue.write_text(
            "Hlídač dat našel problém (%s UTC). Nově označené 🆕.\n\n%s\n"
            % (NOW.strftime("%Y-%m-%d %H:%M"), "\n\n".join(bloky)), encoding="utf-8")
    elif issue.exists():
        issue.unlink()

    stav["otevrene"] = sorted(akt)
    stav["kdy"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
    sp.write_text(json.dumps(stav, ensure_ascii=False, indent=1), encoding="utf-8")

    print("problémy: %s | nové: %s" % (sorted(akt) or "žádné", sorted(nove) or "žádné"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
