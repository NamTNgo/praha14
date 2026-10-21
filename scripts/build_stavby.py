#!/usr/bin/env python3
"""Stavby a proměny okolí -> docs/data/stavby.json.

Zdroj: databáze „Praha zítra“ centra CAMP (Institut plánování a rozvoje hl. m.
Prahy), praha.camp/praha-zitra. Veřejné GraphQL API, které používá jejich mapa:
POST https://praha.camp/graphql  – projects(limit: -1) a project(id: slug).
Obsahuje developerské projekty, školy, parky, veřejná prostranství i dopravní
stavby s fází (záměr → povolování → výstavba → dokončeno), investorem,
termínem, počtem bytů a polohou.

Bereme projekty v Praze 9 a 14 a v pásu ~1 km kolem (sousední čtvrti), bez
dávno dokončených. Opravy silnic aplikace bere z dat Dopravy (TSK, NDIC).
"""
import datetime as dt
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
API = "https://praha.camp/graphql"
WEB = "https://praha.camp/praha-zitra/projekt/"
UA = "Mozilla/5.0 (compatible; pod-okny-bot; +https://github.com/NamTNgo/praha14)"
LOG = []

FAZE = {
    "Výstavba": "stavi",
    "Povolovací řízení": "povoluje", "Územní řízení": "povoluje", "Stavební řízení": "povoluje",
    "Záměr": "planuje", "Studie": "planuje", "Urbanistická studie": "planuje", "Územní studie": "planuje",
    "Koncepční studie": "planuje", "Strategická studie": "planuje", "Prověřovací studie": "planuje",
    "Dokončeno": "hotovo",
}
SEZNAM = """query { projects(limit: -1) { id slug label points address start end invested housingUnits modified
  type { name } status { name } investor { name } } }"""
DETAIL = """query($id: ID) { project(id: $id) { slug name description { __typename ... on Text { content } }
  slides { __typename ... on Image { hash caption author } } } }"""
# CAMP u projektů bez vlastního obrázku dává obecnou ilustraci IPR – ta se nepočítá
ILUSTRACE = re.compile(r"ilustrační", re.I)
PLAN = re.compile(r"schéma|situace|mapa|výkres|studie|koncepc|urbanistick|územní plán", re.I)


def textik(h):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", (h or "").replace("&nbsp;", " "))).strip()


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(API, data=body, headers={"User-Agent": UA, "Content-Type": "application/json"})
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                j = json.loads(r.read().decode("utf-8"))
            if j.get("errors"):
                raise RuntimeError(str(j["errors"])[:200])
            return j["data"]
        except Exception as e:   # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise last


def okno():
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    la = [a[3] for a in adr if a[3]]
    lo = [a[4] for a in adr if a[4]]
    m = 0.03    # ~3 km kolem okrajových adres Prahy 9 a 14 (aplikace ukazuje okruh 3 km)
    return min(la) - m, max(la) + m, min(lo) - m * 1.5, max(lo) + m * 1.5


def rok(s):
    m = re.search(r"(20\d\d)", s or "")
    return int(m.group(1)) if m else None


def cisty(s):
    s = (s or "").strip()
    return "" if s in ("N/A", "-", "–") else s


def main():
    out_p = DATA / "stavby.json"
    try:
        pred = json.loads(out_p.read_text(encoding="utf-8"))
    except Exception:   # noqa: BLE001
        pred = {}
    o = okno()
    try:
        vse = gql(SEZNAM)["projects"]
        if len(vse) < 200:
            raise RuntimeError("API vrátilo jen %d projektů – změna formátu?" % len(vse))
    except Exception as e:   # noqa: BLE001
        log("CHYBA zdroje CAMP:", e)
        pred.update({"ok": False, "chyba": str(e)[:200], "pokus": NOW.isoformat(timespec="minutes")})
        out_p.write_text(json.dumps(pred, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (DATA / "stavby_report.txt").write_text("\n".join(LOG), encoding="utf-8")
        sys.exit(1)
    log("projektů v databázi CAMP: %d" % len(vse))

    stare = {p["id"]: p for p in pred.get("projekty", [])}
    vys = []
    for p in vse:
        body = [(b["lat"], b["lon"]) for b in (p.get("points") or []) if b.get("lat")]
        adr = p.get("address") or []
        mc = re.match(r"Praha[ -–]*(\d+)", adr[0]) if adr else None
        doma = bool(mc and mc.group(1) in ("9", "14"))
        blizko = any(o[0] <= la <= o[1] and o[2] <= lo <= o[3] for la, lo in body)
        if not (doma or blizko) or not body:
            continue
        stav = (p.get("status") or [{}])[0].get("name", "")
        faze = FAZE.get(stav, "planuje")
        konec = rok(p.get("end"))
        if faze == "hotovo" and (not konec or konec < NOW.year - 1):
            continue   # dávno hotové nezajímá
        typy = [t["name"] for t in p.get("type") or [] if t.get("name")]
        vys.append({
            "id": p["slug"],
            "n": p.get("label") or p["slug"],
            "faze": faze,
            "stav": stav,
            "typ": typy,
            "inv": [i["name"] for i in p.get("investor") or [] if i.get("name")],
            "adr": adr,
            "mc": mc.group(1) if mc else "",
            "od": cisty(p.get("start")),
            "do": cisty(p.get("end")),
            "kc": cisty(p.get("invested")),
            "byty": p.get("housingUnits"),
            "body": [[round(la, 6), round(lo, 6)] for la, lo in body[:6]],
            "mod": dt.datetime.fromtimestamp((p.get("modified") or 0) / 1000, TZ).strftime("%Y-%m-%d") if p.get("modified") else "",
            "_m": p.get("modified"),
        })

    # popis a obrázek – jen u nových nebo změněných projektů (šetrné k API)
    nove = 0
    for v in vys:
        s = stare.get(v["id"])
        if s and s.get("_m") == v["_m"] and "obrK" in s:
            for k in ("popis", "obr", "obrK", "obrA"):
                v[k] = s.get(k, "")
            continue
        try:
            d = gql(DETAIL, {"id": v["id"]})["project"] or {}
            ds = d.get("description") or {}
            v["popis"] = re.sub(r"\s+\n", "\n", (ds.get("content") or "").strip())[:900]
            sl = [x for x in d.get("slides") or [] if x.get("hash") and not ILUSTRACE.search(textik(x.get("caption")))]
            foto = [x for x in sl if not PLAN.search(textik(x.get("caption")))]
            x = (foto or sl or [None])[0]
            v["obr"] = x["hash"] if x else ""
            v["obrK"] = "" if not x else ("foto" if foto else "plan")
            v["obrA"] = textik(x.get("author"))[:80] if x else ""
            nove += 1
            time.sleep(0.3)
        except Exception as e:   # noqa: BLE001
            log("  ! detail nejde načíst:", v["id"], e)
            for k in ("popis", "obr", "obrK", "obrA"):
                v[k] = (s or {}).get(k, "")
    for v in vys:
        v["_m"] = v["_m"] or 0

    poradi = {"stavi": 0, "povoluje": 1, "planuje": 2, "hotovo": 3}
    vys.sort(key=lambda v: (poradi[v["faze"]], v["n"]))
    data = {"gen": NOW.isoformat(timespec="minutes"), "ok": True, "zdroj": "https://praha.camp/praha-zitra",
            "web": WEB, "img": "https://praha.camp/img/cache/720/", "projekty": vys}
    stejne = pred.get("projekty") == vys and pred.get("ok")
    try:
        cerstve = NOW - dt.datetime.fromisoformat(pred.get("gen")) < dt.timedelta(hours=20)
    except Exception:   # noqa: BLE001
        cerstve = False
    from collections import Counter
    log("v okolí Prahy 9 a 14: %d (%s); doplněno popisů: %d; obrázky: %s" % (len(vys), dict(Counter(v["faze"] for v in vys)), nove,
        dict(Counter(v.get("obrK") or "žádný" for v in vys))))
    if stejne and cerstve:
        print("beze změny")
    else:
        out_p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "stavby_report.txt").write_text("\n".join(LOG), encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
