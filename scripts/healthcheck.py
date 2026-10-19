#!/usr/bin/env python3
"""Hlídač zdravotního stavu dat aplikace.

Nekontroluje weby zdrojů (to dělá watch_pages.py), ale VÝSTUPNÍ data v
docs/data/. To chytí jakoukoli tichou poruchu kteréhokoli zdroje: když se
změní formát a parser přestane něco chytat, soubor zůstane, ale je prázdný
nebo zastaralý. Navíc přímo proklepne NDIC pipeline (Worker + R2 + cron).

Při problému zapíše watch/health.md s diagnózou A návodem na opravu; workflow
z něj založí/aktualizuje jedno GitHub Issue. Když je vše v pořádku, health.md
smaže (workflow pak issue zavře).
"""
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
WATCH = ROOT / "watch"
NOW = dt.datetime.now(dt.timezone.utc)
H = 3600

# Společné návody na opravu podle zdroje
R_NDIC = (
    "Uzavírky/nehody z ŘSD nedotečou. Projdi postupně:\n"
    "  1. Otevři URL Workeru s hlavičkou `Authorization: Bearer <NDIC_TOKEN>`.\n"
    "     • `503 No data yet` → R2 je prázdné: spusť `GET /refresh` z pražské IP\n"
    "       a zkontroluj Cron Trigger (`*/10 * * * *`) ve Worker → Settings → Triggers.\n"
    "     • `401` → vypršel odběr: obnov přihlášení na mobilitydata.rsd.cz a secrets\n"
    "       `NDIC_USER`/`NDIC_PASS` ve Workeru.\n"
    "     • `403` → nesedí `PROXY_TOKEN` ve Workeru vs. `NDIC_TOKEN` v GitHub secrets.\n"
    "  2. Když XML teče, ale v datech nic není → nejspíš se změnil formát DATEX;\n"
    "     nech projet parser `scripts/build_doprava.py` proti čerstvému vzorku."
)
R_GOLEMIO = (
    "Zdroj Golemio (Operátor ICT). Zkontroluj secret `GOLEMIO_API_KEY` (nevypršel?)\n"
    "a endpoint ve `scripts/build_data.py` / `scripts/build_doprava.py`. Spusť příslušný\n"
    "workflow ručně a mrkni do logu."
)

# file: soubor v docs/data; pocet(d): primární počet záznamů; min: podlaha;
# vek_h: max. stáří (None = stáří neřešíme); cas(d): čas z obsahu nebo None (pak git);
# co: popis; reseni: návod
CHECKS = [
    dict(file="addresses.json", popis="Adresy (RÚIAN)",
         pocet=len, min=5000, vek_h=60 * 24, cas=None,
         reseni="RÚIAN (workflow Adresy). ČÚZK nejspíš změnil formát nebo URL; "
                "zkontroluj build adres a spusť workflow ručně."),
    dict(file="stations.json", popis="Stanoviště tříděného odpadu (Golemio)",
         pocet=len, min=500, vek_h=3 * 24, cas=None, reseni=R_GOLEMIO),
    dict(file="doprava.json", popis="Doprava – zastávky PID (Golemio)",
         pocet=lambda d: d.get("zastavky", 0) if isinstance(d.get("zastavky"), int) else len(d.get("zastavky", [])),
         min=50, vek_h=2 * 24, cas=lambda d: d.get("gen"), reseni=R_GOLEMIO),
    dict(file="doprava.json", popis="Doprava – uzavírky z ŘSD (NDIC)",
         pocet=lambda d: 1 if d.get("ndic") else 0, min=1, vek_h=None, cas=None,
         reseni=R_NDIC),
    dict(file="nehody.json", popis="Nehody z ŘSD (NDIC)",
         pocet=lambda d: 1 if d.get("ndic") else 0, min=1, vek_h=None, cas=None,
         reseni=R_NDIC),
    dict(file="nehody.json", popis="Nehody – čerstvost (cron 10 min)",
         pocet=lambda d: 1, min=1, vek_h=2, cas=lambda d: d.get("gen"),
         reseni="Cron Workeru nebo workflow Nehody neběží. " + R_NDIC),
    dict(file="doktori.json", popis="Lékaři (NRPZS / ÚZIS)",
         pocet=len, min=100, vek_h=45 * 24, cas=None,
         reseni="Registr NRPZS (ÚZIS) změnil export; zkontroluj build lékařů a spusť ho ručně."),
    dict(file="skoly.json", popis="Školy (MŠMT rejstřík)",
         pocet=len, min=50, vek_h=45 * 24, cas=None,
         reseni="Rejstřík škol MŠMT změnil formát; zkontroluj `scripts/scrape_skoly.py` / build škol."),
    dict(file="vok.json", popis="VOK Praha 14",
         pocet=len, min=20, vek_h=45 * 24, cas=None,
         reseni="Harmonogram VOK (praha14.cz) se změnil; zkontroluj `scripts/build_vok.py`."),
    dict(file="vok9.json", popis="VOK Praha 9",
         pocet=lambda d: d.get("mista", 0) if isinstance(d.get("mista"), int) else len(d.get("mista", [])),
         min=20, vek_h=45 * 24, cas=None,
         reseni="Harmonogram VOK (praha9.cz) se změnil; zkontroluj `scripts/build_vok.py`."),
]


def git_cas(relpath):
    """ISO čas posledního commitu, který se souboru dotkl (potřebuje plnou historii)."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", relpath],
                             cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.strip()
        return out or None
    except Exception:
        return None


def stari_h(iso):
    if not iso:
        return None
    try:
        t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=dt.timezone.utc)
        return (NOW - t).total_seconds() / H
    except Exception:
        return None


def ndic_zivy():
    """Přímý test NDIC proxy: vrací (ok, popis). Přeskočí, když nejsou přístupy."""
    url, tok = os.environ.get("NDIC_URL"), os.environ.get("NDIC_TOKEN")
    if not (url and tok):
        return None, "přeskočeno (chybí NDIC_URL/NDIC_TOKEN)"
    req = urllib.request.Request(url, method="HEAD", headers={"Authorization": "Bearer " + tok})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            upd = r.headers.get("X-Ndic-Updated")
    except urllib.error.HTTPError as e:
        kod = {401: "401 – vypršel odběr ŘSD", 403: "403 – nesedí token",
               503: "503 – R2 prázdné (cron neběžel / nutný /refresh)"}.get(e.code, str(e.code))
        return False, "Worker vrací %s" % kod
    except Exception as e:
        return False, "Worker nedostupný: %s" % e
    v = stari_h(upd)
    if v is None:
        return False, "chybí hlavička X-Ndic-Updated (starý kód Workeru?)"
    if v > 40 / 60:
        return False, "R2 zastaralé – poslední aktualizace před %.0f min (cron stojí)" % (v * 60)
    return True, "čerstvé (před %.0f min)" % (v * 60)


def main():
    WATCH.mkdir(exist_ok=True)
    problemy = []

    for c in CHECKS:
        p = DATA / c["file"]
        rel = "docs/data/" + c["file"]
        if not p.exists():
            problemy.append((c["popis"], "soubor %s chybí" % c["file"], c["reseni"]))
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            problemy.append((c["popis"], "%s nejde načíst (%s)" % (c["file"], e), c["reseni"]))
            continue
        # počet záznamů
        try:
            n = c["pocet"](d)
        except Exception as e:
            problemy.append((c["popis"], "nečekaný tvar dat (%s)" % e, c["reseni"]))
            continue
        if n < c["min"]:
            problemy.append((c["popis"], "jen %d záznamů (očekáváme ≥ %d) – zdroj nejspíš přestal dodávat" % (n, c["min"]), c["reseni"]))
            continue
        # stáří
        if c["vek_h"] is not None:
            iso = (c["cas"](d) if c["cas"] else None) or git_cas(rel)
            v = stari_h(iso)
            if v is not None and v > c["vek_h"]:
                problemy.append((c["popis"], "data jsou %.0f h stará (limit %.0f h) – aktualizace neběží"
                                 % (v, c["vek_h"]), c["reseni"]))

    # přímý test NDIC proxy
    ok, zprava = ndic_zivy()
    if ok is False:
        problemy.append(("NDIC proxy (Worker + R2 + cron)", zprava, R_NDIC))

    issue = WATCH / "health.md"
    if problemy:
        lines = ["Health-check našel problém s daty aplikace. U každého je i návod na opravu.\n"]
        for popis, co, reseni in problemy:
            lines.append("### ❌ %s" % popis)
            lines.append("**Co se děje:** %s\n" % co)
            lines.append("**Řešení:**\n%s\n" % reseni)
        lines.append("\n_Vygenerováno %s UTC._" % NOW.strftime("%Y-%m-%d %H:%M"))
        issue.write_text("\n".join(lines), encoding="utf-8")
        print("HEALTH: %d problém(ů)" % len(problemy))
        for popis, co, _ in problemy:
            print("  - %s: %s" % (popis, co))
        return 1
    if issue.exists():
        issue.unlink()
    print("HEALTH: vše v pořádku (NDIC proxy: %s)" % zprava)
    return 0


if __name__ == "__main__":
    sys.exit(main())
