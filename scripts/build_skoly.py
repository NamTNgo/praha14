"""Škol a školky v Praze 9 a 14 -> docs/data/skoly.json
Zdroj: MŠMT Rejstřík škol a školských zařízení (JSON-LD). Městská část a souřadnice se určují
podle adresy místa výuky spárované s docs/data/addresses.json (obvod Prahy v rejstříku MČ neodpovídá)."""
import json
import re
import unicodedata, urllib.request
from collections import Counter
from pathlib import Path

URL = "https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld"
DATA = Path(__file__).resolve().parent.parent / "docs" / "data"


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bulice\b|\bul\.", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


PF = {"331": "Příspěvková organizace", "112": "Společnost s ručením omezeným", "121": "Akciová společnost",
      "141": "Obecně prospěšná společnost", "706": "Spolek", "641": "Školská právnická osoba",
      "721": "Církevní organizace", "722": "Církevní právnická osoba", "801": "Obec", "804": "Kraj",
      "325": "Organizační složka státu", "111": "Veřejná obchodní společnost", "117": "Nadace", "118": "Nadační fond",
      "301": "Státní podnik", "661": "Veřejná výzkumná instituce", "736": "Pobočný spolek", "101": "Fyzická osoba podnikající"}
FREEMAIL = {"gmail.com", "seznam.cz", "email.cz", "centrum.cz", "post.cz", "volny.cz", "atlas.cz", "icloud.com",
            "outlook.com", "hotmail.com", "yahoo.com", "tiscali.cz", "quick.cz", "iol.cz"}


def sector(e):
    """s = státní/obecní, c = církevní, p = soukromá, None = nezjištěno. Podle zřizovatele (právní forma + název)."""
    zs = e.get("zrizovatele") or []
    if not zs:
        # soukromé subjekty (s.r.o., o.p.s.) v rejstříku zřizovatele často nemají
        return "p", "", ""
    z = zs[0]
    pf, name = str(z.get("pravniForma") or ""), (z.get("nazevOsoby") or "").strip()
    n = norm(name)
    if pf in ("801", "804", "325", "301", "803") or n.startswith(("mestskacast", "hlavnimesto", "ministerstvo", "ceskarepublika", "mesto", "kraj", "statnipodnik")) or re.match(r"obec\b", name.lower()):
        return "s", name, pf
    if pf.startswith("72") or any(k in n for k in ("cirkev", "dieceze", "arcibiskup", "biskup", "farnost", "kongregace", "sestry", "rimskokatol", "husitsk", "evangelick", "bratrsk", "kapucin", "salezian", "jezuit")):
        return "c", name, pf
    return "p", name, pf


def web_from_email(emails):
    for m in emails or []:
        d = m.split("@")[-1].strip().lower()
        if d and d not in FREEMAIL and "." in d:
            return d
    return ""


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
    secs, nosec, pfs = Counter(), [], Counter()
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
                z, zname, zpf = sector(e)
                if z == "p" and not zname:
                    # soukromý subjekt bez zřizovatele v rejstříku: zřizovatelem/provozovatelem je on sám
                    zname = (e.get("uplnyNazev") or "").strip()
                    pfe = e.get("pravniForma")
                    zpf = str(pfe.get("kod") or pfe.get("id") or "") if isinstance(pfe, dict) else str(pfe or "")
                secs[z or "?"] += 1
                pfs[f"{zpf}|{z}|{zname[:40]}"] += 1
                if z is None:
                    nosec.append(title)
                emails = e.get("emaily") or []
                cap = next((int(k["nejvyssiPovolenyPocet"]) for k in sz.get("kapacity") or [] if str(k.get("nejvyssiPovolenyPocet") or "").isdigit()), None)
                rec = {"id": f'{sz.get("izo") or e.get("redIzo")}-{len(out)}', "n": title, "t": t, "a": f"{st} {num}".strip(), "mc": mc, "lat": lat, "lon": lon}
                if z:
                    rec["z"] = z
                if zname:
                    rec["zn"] = zname
                if PF.get(zpf):
                    rec["pf"] = PF[zpf]
                rd = (e.get("reditel") or {}).get("nazevOsoby")
                if rd:
                    rec["rd"] = rd.strip()
                if emails:
                    rec["e"] = emails[0].strip()
                w = web_from_email(emails)
                if w:
                    rec["w"] = w
                if cap:
                    rec["k"] = cap
                if str(sz.get("jazyk") or "") == "100":
                    rec["j"] = "český"
                out.append(rec)
    # Duplicitní záznam téže školy (potvrzeno uživatelem): IZO 151014507 zrušit, zůstává IZO 250015773
    # (id obsahuje pořadí, proto se porovnává jen IZO před pomlčkou)
    if any(x["id"].split("-")[0] == "250015773" for x in out):
        out = [x for x in out if x["id"].split("-")[0] != "151014507"]
    out.sort(key=lambda x: (x["t"], norm(x["n"])))
    (DATA / "skoly.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    rep = [f"záznamů: {len(out)}", "podle typu: " + json.dumps(Counter(x["t"] for x in out)),
           "podle MČ: " + json.dumps(Counter(x["mc"] for x in out)),
           "podle zřizovatele (s/p/c/?): " + json.dumps(secs),
           "s webem: " + str(sum(1 for x in out if x.get("w"))) + ", s e-mailem: " + str(sum(1 for x in out if x.get("e"))),
           "právní forma zřizovatele | sektor | název (kontrola třídění):"] + ["  %dx %s" % (c, k) for k, c in pfs.most_common(60)] + [
           "bez zřizovatele: " + "; ".join(nosec[:20]),
           f"mimo Prahu 9/14 (nespárováno): {outside}", f"Praha 9/14 bez shody adresy: {len(unmatched)}"]
    rep += ["  " + u for u in unmatched[:60]]
    rep += ["přeskočené druhy:"] + [f"  {c}x {k}" for k, c in skipped.most_common(40)]
    (DATA / "skoly_report.txt").write_text("\n".join(rep), encoding="utf-8")


if __name__ == "__main__":
    main()
