#!/usr/bin/env python3
"""Jednorázová sonda: kudy se dá dostat k městské evidenci uzavírek.

Ze sandboxu nemám síť, tak se kandidáti zkoušejí v GitHub Action a výsledek
se ukládá do docs/data/probe_report.txt. Až bude jasné, který zdroj funguje,
tenhle skript i jeho workflow zmizí.
"""
import json
import os
import re
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "probe_report.txt"
KEY = os.environ.get("GOLEMIO_API_KEY", "")
UA = "Mozilla/5.0 (compatible; praha14-bot; +https://github.com/NamTNgo/praha14)"
ARC = "https://services5.arcgis.com/m8NdPSKOX90dAI3V/ArcGIS/rest/services/"
Q = "/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=3&f=json"

KANDIDATI = [
    ("dopravniinfo robots", "https://dopravniinfo.gov.cz/robots.txt", False),
    ("dopravniinfo homepage", "https://dopravniinfo.gov.cz/", False),
    ("dopravniinfo mapa", "https://dopravniinfo.gov.cz/mapa-dopravnich-informaci", False),
    ("geoportal dcat katalog", "https://opendata.geoportalpraha.cz/api/feed/dcat-ap/2.1.1.json", False),
    ("geoportal hledání", "https://opendata.geoportalpraha.cz/api/search/v1?q=uzav%C3%ADrky", False),
    ("gis.praha.eu arcgis", "https://gis.praha.eu/arcgis/rest/services?f=pjson", False),
    ("ipr arcgis", "https://app.iprpraha.cz/arcgis/rest/services?f=pjson", False),
    ("golemio v3 infotexts (kontrola klíče)", "https://api.golemio.cz/v3/pid/infotexts", True),
    ("golemio openapi", "https://api.golemio.cz/docs/openapi.json", False),
    ("golemio public openapi", "https://api.golemio.cz/docs/public-openapi.json", False),
    ("golemio openapi (v2)", "https://api.golemio.cz/v2/docs/openapi.json", False),
    ("golemio trafficrestrictions", "https://api.golemio.cz/v2/trafficrestrictions", True),
    ("golemio roadclosures", "https://api.golemio.cz/v2/roadclosures", True),
    ("golemio traffic", "https://api.golemio.cz/v2/traffic", True),
    ("arcgis uzavírky aktualizované (meta)", ARC + "Uzav%C3%ADrky_Praha___aktualizovan%C3%A9_WFL1/FeatureServer/0?f=pjson", False),
    ("arcgis uzavírky aktualizované (data)", ARC + "Uzav%C3%ADrky_Praha___aktualizovan%C3%A9_WFL1/FeatureServer/0" + Q, False),
    ("arcgis 2025_uzavírky (meta)", ARC + "2025_uzav%C3%ADrky/FeatureServer?f=pjson", False),
    ("arcgis 2025_uzavírky (data)", ARC + "2025_uzav%C3%ADrky/FeatureServer/0" + Q, False),
    ("opravujeme.to html", "https://opravujeme.to/", False),
    ("opravujeme.to přehled", "https://opravujeme.to/prehled-omezeni/", False),
]


def zkus(nazev, url, s_klicem):
    h = {"User-Agent": UA, "Accept": "application/json,text/html"}
    if s_klicem:
        h["X-Access-Token"] = KEY
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r:
            raw = r.read(400000).decode("utf-8", "replace")
            kod = r.status
    except Exception as e:
        return "%-40s CHYBA %s" % (nazev, e)
    hlava = raw[:600].replace("\n", " ")
    extra = ""
    if "openapi" in nazev:
        try:
            cesty = sorted(json.loads(raw).get("paths", {}))
            extra = "\n    CESTY: " + ", ".join(cesty)
        except Exception:
            pass
    if "dcat" in nazev or "arcgis" in nazev or "hledání" in nazev:
        kusy = re.findall(r"[^\"]{0,80}[Uu]zav[ií]r[^\"]{0,120}", raw)
        extra = "\n    ZMÍNKY: " + (" | ".join(sorted(set(kusy))[:15]) or "žádné")
    if "dopravniinfo" in nazev or "opravujeme" in nazev:
        odkazy = sorted(set(re.findall(r'["\'](/?(?:api|data|rest|services|geoserver)/[^"\'\\s]{3,90})', raw)))
        extra = "\n    API ODKAZY: " + (", ".join(odkazy[:30]) or "žádné")
    return "%-40s HTTP %s  %d B\n    %s%s" % (nazev, kod, len(raw), hlava, extra)


radky = [zkus(*k) for k in KANDIDATI]
OUT.write_text("\n".join(radky), encoding="utf-8")
print("\n".join(radky))
