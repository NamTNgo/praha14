"""Škol a školky v Praze 9 a 14 -> docs/data/skoly.json
Zdroj: MŠMT Rejstřík škol a školských zařízení (JSON-LD). Městská část a souřadnice se určují
podle adresy místa výuky spárované s docs/data/addresses.json (obvod Prahy v rejstříku MČ neodpovídá)."""
import json, re, unicodedata, urllib.request
from collections import Counter
from pathlib import Path

URL = "https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld"
DATA = Path(__file__).resolve().parent.parent / "docs" / "data"


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bulice\b|\bul\.", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def kind(name):
    n = norm(name)
    if n.startswith("materskaskola"):
        return "ms"
    if n.startswith("zakladniskola"):
        return "zs"
    if n.startswith(("gymnazium", "stredniskola", "strednioborn", "obchodniakademie", "lyceum", "konzervator", "vyssioborn", "hotelovaskola", "prumyslovaskola")):
        return "ss"
    return None


def main():
    addrs = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    by3, by2 = {}, {}
    for st, cd, co, lat, lon, mc, *_ in addrs:
        by3.setdefault((norm(st), cd, co.lower()), (lat, lon, mc, st, cd, co))
        by2.setdefault((norm(st), cd), (lat, lon, mc, st, cd, co))
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (praha14-odpad)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        doc = json.loads(r.read().decode("utf-8"))
    ents = doc["list"] if isinstance(doc, dict) else doc
    out, seen = [], set()
    skipped, unmatched, outside = Counter(), [], 0
    for e in ents:
        title = re.sub(r"\s+", " ", e.get("zkracenyNazev") or e.get("uplnyNazev") or "").strip()
        full = re.sub(r"\s+", " ", e.get("uplnyNazev") or "").strip()
        # obecné názvy ("Základní škola") nejdou odlišit -> použij úplný název s ulicí
        if full and norm(title) in ("materskaskola", "zakladniskola", "gymnazium", "zakladniskolaamaterskaskola", "materskaskolaazakladniskola", "strednicskola"):
            title = full
        for sz in e.get("skolyAZarizeni") or []:
            t = kind(sz.get("uplnyNazev"))
            if not t:
                skipped[f'{sz.get("druh")}|{sz.get("uplnyNazev")}'] += 1
                continue
            places = sz.get("mistaVyuky") or []
            if not places:
                places = [{"adresa": e.get("adresa") or {}}]
            for p in places:
                ad = p.get("adresa") or {}
                st, cd = ad.get("ulice") or "", str(ad.get("cisloDomovni") or "")
                co = (str(ad.get("cisloOrientacni") or "") + (ad.get("dodatekOrientacnihoCisla") or "")).lower()
                hit = by3.get((norm(st), cd, co)) or by2.get((norm(st), cd))
                if not hit:
                    cast = str(ad.get("cisloObvoduPrahy") or "") + " " + str(ad.get("castObce") or "")
                    if re.search(r"Praha (9|14)\b", cast):
                        unmatched.append(f"{title} | {st} {cd}/{co} | {cast}")
                    else:
                        outside += 1
                    continue
                lat, lon, mc, hst, hcd, hco = hit
                key = (norm(title), t, round(lat, 4), round(lon, 4))
                if key in seen:
                    continue
                seen.add(key)
                ao = ad.get("cisloOrientacni")
                num = f"{cd}/{ao}{ad.get('dodatekOrientacnihoCisla') or ''}" if ao else cd
                out.append({"n": title, "t": t, "a": f"{st} {num}".strip(), "mc": mc, "lat": lat, "lon": lon})
    out.sort(key=lambda x: (x["t"], norm(x["n"])))
    (DATA / "skoly.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rep = [f"záznamů: {len(out)}", "podle typu: " + json.dumps(Counter(x["t"] for x in out)),
           "podle MČ: " + json.dumps(Counter(x["mc"] for x in out)),
           f"mimo Prahu 9/14 (nespárováno): {outside}", f"Praha 9/14 bez shody adresy: {len(unmatched)}"]
    rep += ["  " + u for u in unmatched[:60]]
    rep += ["přeskočené druhy:"] + [f"  {c}x {k}" for k, c in skipped.most_common(40)]
    (DATA / "skoly_report.txt").write_text("\n".join(rep), encoding="utf-8")


if __name__ == "__main__":
    main()
