"""Výzvy k zapojení obyvatel Prahy 9 (ankety, veřejná projednání, úklidy, dobrovolnictví).

Zdroj: RSS aktualit praha9.cz (/rss.xml, posledních ~10 zpráv). Protože RSS drží jen pár zpráv,
nalezené výzvy si pamatujeme v docs/data/vyzvy.json až 60 dní (nebo do termínu, pokud ho text uvádí).

Výstup docs/data/vyzvy.json: {gen, ok, p9: [{id, t, u, d: "YYYY-MM-DD", do: "YYYY-MM-DD" | null}]}
"""
import datetime as dt
import email.utils
import html as H
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
NOW = dt.datetime.now(ZoneInfo("Europe/Prague"))
RSS = "https://www.praha9.cz/rss.xml"
VYZVA = re.compile(r"anket|dotazník|průzkum mezi|veřejné projednání|projednání s veřejností|plánovací setkání|veřejné setkání|"
                   r"participa|zapojte se|zapojit se|řekněte nám|vyjádři|připomínk|ukliďme|úklid|dobrovoln|sázení|výsadb|hlasován", re.I)
NE = re.compile(r"volby|výsledky voleb|zastupitelstv[oa] (?:se )?(?:koná|zasedá)", re.I)
DNI = 60
LOG = []


def txt(s):
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def termin(s, rok):
    """„do 15. 11.“, „do 15. listopadu 2026“, „nejpozději 30. 11. 2026“ → YYYY-MM-DD."""
    m = re.search(r"(?:do|nejpozději|až do)\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)?", s)
    if not m:
        return None
    try:
        return dt.date(int(m.group(3) or rok), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


def main():
    p = DATA / "vyzvy.json"
    try:
        prev = json.loads(p.read_text(encoding="utf-8")).get("p9", [])
    except Exception:   # noqa: BLE001
        prev = []
    ok, nove = True, []
    try:
        req = urllib.request.Request(RSS, headers={"User-Agent": "Mozilla/5.0 (compatible; pod-okny-bot)"})
        with urllib.request.urlopen(req, timeout=40) as r:
            root = ET.fromstring(r.read())
        for it in root.iter("item"):
            t, u = txt(it.findtext("title")), (it.findtext("link") or "").strip()
            popis = txt(it.findtext("description"))
            if not VYZVA.search(t + " " + popis[:1500]) or NE.search(t):
                continue
            try:
                d = email.utils.parsedate_to_datetime(it.findtext("pubDate")).astimezone(NOW.tzinfo).date().isoformat()
            except Exception:   # noqa: BLE001
                d = NOW.date().isoformat()
            nove.append({"id": str(zlib.crc32(u.encode())), "t": t, "u": u, "d": d, "do": termin(popis, int(d[:4]))})
        LOG.append("RSS Praha 9: %d výzev" % len(nove))
    except Exception as e:   # noqa: BLE001
        ok = False
        LOG.append("CHYBA RSS Praha 9: %s" % e)
    dnes, hranice = NOW.date().isoformat(), (NOW.date() - dt.timedelta(days=DNI)).isoformat()
    vse = {x["id"]: x for x in prev}
    vse.update({x["id"]: x for x in nove})
    p9 = [x for x in vse.values() if (x["do"] >= dnes if x.get("do") else x["d"] >= hranice)]
    p9.sort(key=lambda x: x["d"], reverse=True)
    for x in p9:
        LOG.append("  %s %s%s" % (x["d"], x["t"][:80], " · do " + x["do"] if x.get("do") else ""))
    p.write_text(json.dumps({"gen": NOW.isoformat(timespec="seconds"), "ok": ok, "p9": p9}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "vyzvy_report.txt").write_text("\n".join(LOG) + "\n", encoding="utf-8")
    print("\n".join(LOG))


if __name__ == "__main__":
    main()
