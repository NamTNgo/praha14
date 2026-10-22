"""Záměry s posuzováním vlivů na životní prostředí (EIA) v Praze 9 a 14.

Zdroj: Informační systém EIA (CENIA), portal.cenia.cz/eiasea – rozšířené hledání podle
katastrálního území, detail záměru (stav, fáze, lhůty pro vyjádření veřejnosti, dokumenty).
Bereme záměry v hlavním městě Praze, které se dotýkají katastru Prahy 9 nebo 14 a změnily se
za poslední 2 roky. Oznamovatel je vždy firma nebo instituce (s IČO), jména osob nebereme.

Výstup docs/data/eia.json:
  {gen, ok, zamery: [{kod, n, stav, ku: [...], mc: ["9","14"], urad, ozn, zmena,
                      lhuta: "YYYY-MM-DD" | null (nejbližší ještě otevřená lhůta pro vyjádření),
                      kroky: [{f, d, lhuta}], u}]}
"""
import datetime as dt
import html as H
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
TZ = ZoneInfo("Europe/Prague")
NOW = dt.datetime.now(TZ)
BASE = "https://portal.cenia.cz/eiasea/"
UA = "Mozilla/5.0 (compatible; pod-okny-bot; +https://github.com/NamTNgo/praha14)"
# katastrální území → městská část (Libeň a Hrdlořezy sahají i jinam, Hloubětín je v 9 i 14)
KU = {"Vysočany": ["9"], "Prosek": ["9"], "Střížkov": ["9"], "Libeň": ["9"], "Hrdlořezy": ["9"],
      "Hloubětín": ["14", "9"], "Černý Most": ["14"], "Kyje": ["14"], "Hostavice": ["14"]}
FAZE = [("OZNÁMENÍ", "Oznámení záměru"), ("ZJIŠŤOVACÍ ŘÍZENÍ", "Závěr zjišťovacího řízení"), ("DOKUMENTACE", "Dokumentace vlivů"),
        ("POSUDEK", "Posudek"), ("VEŘEJNÉ PROJEDNÁNÍ", "Veřejné projednání"), ("STANOVISKO", "Stanovisko")]
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def stahni(url, data=None):
    hd = {"User-Agent": UA}
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
        hd["Content-Type"] = "application/x-www-form-urlencoded"
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hd), timeout=60) as r:
                return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
        except Exception as e:   # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise last


def txt(h):
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


def datum(s):
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s or "")
    return "%s-%02d-%02d" % (m.group(3), int(m.group(2)), int(m.group(1))) if m else None


def hledej(ku):
    od = (NOW - dt.timedelta(days=730)).strftime("%d.%m.%Y")
    kody, strana = [], 1
    while strana <= 5:
        h = stahni(BASE + "view/eia100_cr?lang=cs", {"typHledani": "rozsirene", "nazev": "", "kod": "", "oznamovatel": "", "oznamovatelIc": "",
                                                     "zarazeni": "", "poslZmenaOd": od, "poslZmenaDo": "", "umisteni": ku,
                                                     "stavRozsireneHledani": "", "razeniRozsireneHledani": "1", "filtrRozsireneHledani": "",
                                                     "strana": str(strana)})
        nove = [k for k in re.findall(r"/eiasea/detail/EIA_(\w+)", h) if k not in kody]
        kody += nove
        if not nove or not re.search(r"další\s*&gt;&gt;|další >>", h):
            break
        strana += 1
    return kody


def detail(kod):
    h = stahni(BASE + "detail/EIA_%s?lang=cs" % kod)
    z = {"kod": kod, "u": BASE + "detail/EIA_%s?lang=cs" % kod, "ku": [], "kraj": set(), "kroky": []}
    sekce = None
    for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", h):
        bunky = [txt(x) for x in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr)]
        if not bunky:
            continue
        if len(bunky) == 1 and bunky[0] in dict(FAZE):
            sekce = bunky[0]
            z["kroky"].append({"f": dict(FAZE)[sekce]})
            continue
        if len(bunky) == 4 and bunky[0] != "Kraj":
            z["kraj"].add(bunky[0])
            if bunky[0] == "Hlavní město Praha":
                z["ku"].append(bunky[3])
            continue
        if len(bunky) < 2:
            continue
        k, v = bunky[0].rstrip(":").strip(), bunky[1]
        if k == "Název záměru":
            z["n"] = v
        elif k == "Stav":
            z["stav"] = v
        elif k == "Příslušný úřad":
            z["urad"] = v
        elif k == "Oznamovatel":
            z["ozn"] = v
        elif k == "Datum a čas posledních úprav":
            z["zmena"] = datum(v)
        elif sekce and z["kroky"]:
            if k.startswith("Datum zveřejnění"):
                z["kroky"][-1]["d"] = datum(v)
            elif k.startswith("Termín pro zaslání vyjádření"):
                z["kroky"][-1]["lhuta"] = datum(v)
            elif k.startswith("Informace o místě a času konání") and v:
                z["kroky"][-1]["kde"] = v[:200]
    z["kroky"] = [k for k in z["kroky"] if k.get("d") or k.get("lhuta")]
    return z


def main():
    ok, kody = True, {}
    for ku in KU:
        try:
            for k in hledej(ku):
                kody.setdefault(k, set()).add(ku)
        except Exception as e:   # noqa: BLE001
            ok = False
            log("CHYBA hledání", ku, e)
    log("kandidátů: %d" % len(kody))
    dnes = NOW.strftime("%Y-%m-%d")
    zamery = []
    for kod in sorted(kody):
        try:
            z = detail(kod)
        except Exception as e:   # noqa: BLE001
            ok = False
            log("  ! detail", kod, e)
            continue
        nase = [k for k in z["ku"] if k in KU]
        if not nase:               # jiné Vysočany (okres Most) apod.
            continue
        lhuty = sorted(k["lhuta"] for k in z["kroky"] if k.get("lhuta") and k["lhuta"] >= dnes)
        mc = sorted({m for k in nase for m in KU[k]}, key=int)
        zamery.append({"kod": kod, "n": z.get("n", kod), "stav": z.get("stav", ""), "ku": nase, "kuVse": len(z["ku"]),
                       "mc": mc, "urad": z.get("urad", ""), "ozn": z.get("ozn", ""), "zmena": z.get("zmena"),
                       "lhuta": lhuty[0] if lhuty else None, "kroky": z["kroky"], "u": z["u"]})
        log("  %s %s · %s · %s%s" % (kod, z.get("n", "")[:60], z.get("stav"), ", ".join(nase), " · vyjádřit do " + lhuty[0] if lhuty else ""))
        time.sleep(0.5)
    zamery.sort(key=lambda z: (z["lhuta"] is None, z["lhuta"] or "", "" if z["zmena"] is None else z["zmena"]), reverse=False)
    out = {"gen": NOW.isoformat(timespec="seconds"), "ok": ok, "zamery": zamery}
    (DATA / "eia.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "eia_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n".join(LOG))
    if not zamery and not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
