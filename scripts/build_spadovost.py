"""Spádové obvody základních škol v Praze 9 a 14.

Zdroj: obecně závazná vyhláška hl. m. Prahy č. 19/2025 o školských obvodech,
účinná od 1. 1. 2026. Z PDF je vytažený jen text pro obě městské části
(data/vyhlaska_19_2025_p9_p14.txt), aby šel build kdykoli zopakovat a zkontrolovat.

Vyhláška zapisuje obvody po ulicích ve dvou sloupcích. Většina položek je celá
ulice, u Prahy 9 se ale ulice dělí mezi školy podle čísel — a to v jedné položce
jednou orientačních, jednou popisných. Všechno se proto vyhodnotí tady a do
aplikace jde hotové pravidlo, aby v prohlížeči nebylo co zkazit.

Spustit: python3 scripts/build_spadovost.py
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "vyhlaska_19_2025_p9_p14.txt"
DATA = ROOT / "docs" / "data"

VYHLASKA = "obecně závazné vyhlášky hl. m. Prahy č. 19/2025"
OD = "2026-01-01"

# nadpis ve vyhlášce -> IZO školy v rejstříku (IZO je stálé, na rozdíl od pořadí v souboru)
MC = {"045245525": "9", "045243590": "9", "102301816": "9", "102301573": "9",
      "045243581": "9", "181142198": "9", "102301760": "14", "102301646": "14",
      "102761451": "14", "102301841": "14", "045244570": "14", "108001296": "14"}

IZO = {
    "Základní škola Novoborská": "045245525",
    "Základní škola Litvínovská 500": "045243590",
    "Základní škola Litvínovská 600": "102301816",
    "Základní škola a Mateřská škola Na Balabence": "102301573",
    "Základní škola Špitálská": "045243581",
    "Základní škola a Mateřská škola Elektra": "181142198",
    "Základní škola, Praha 9 - Kyje, Šimanovská 16, příspěvková organizace": "102301760",
    "Základní škola, Praha 9 - Hloubětín, Hloubětínská 700": "102301646",
    "Základní škola Generála Janouška, Praha 9 - Černý Most, Dygrýnova 1006/21": "102761451",
    "Základní škola, Praha 9 - Černý Most, Bří. Venclíků 1140": "102301841",
    "Základní škola, Praha 9 - Lehovec, Chvaletická 918": "045244570",
    "Základní škola, Praha 9 - Černý Most, Vybíralova 964": "108001296",
}

CONT = re.compile(r"^(č\.\s*[po]|[po]\.\s*[:.]|lich|sud|\d|[–\-]|\)|,)", re.I)
HEAD = re.compile(r"^(Základní škola|ZŠ a MŠ)")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def num(x):
    m = re.match(r"(\d+)", str(x or ""))
    return int(m.group(1)) if m else None


def cols(l):
    """Dva sloupce: dělí je běh mezer, který končí až za 45. znakem."""
    for m in re.finditer(r"\s{3,}", l):
        if m.end() >= 45:
            return l[:m.start()].strip(), l[m.end():].strip()
    return l.strip(), ""


def rozsahy(txt):
    """'352 - 365, 409 - 420, 713' -> [[352,365],[409,420],[713,713]]"""
    out = []
    for part in txt.split(","):
        p = part.strip().rstrip(".,")
        if not p:
            continue
        m = re.match(r"^(\d+)\s*[-–]\s*(\d+)$", p)
        if m:
            out.append([int(m.group(1)), int(m.group(2))])
            continue
        m = re.match(r"^(\d+)", p)
        if m:
            out.append([int(m.group(1)), int(m.group(1))])
    return out


def pravidlo(entry):
    """Text položky -> (ulice, popis pro výpis, pravidlo)."""
    t = re.sub(r"\s+", " ", entry).strip()
    # "Poděbradská – pouze na území Prahy 14": omezení už drží filtr podle městské části
    t = re.sub(r"\s*[–—-]\s*pouze na území Prahy \d+\s*$", "", t, flags=re.I)
    m = re.match(r"^(.*?)\s*\(vyjma\s*(.*?)\)?$", t, re.I)
    if m:  # celá ulice kromě vyjmenovaných domů
        pary = [[int(a), norm(b)] for a, b in re.findall(r"(\d+)/(\w+)", m.group(2))]
        return m.group(1).strip(), t, {"t": "krome", "p": pary}
    if re.search(r"\d+/\w+", t) and not re.search(r"č\.\s*[po]", t, re.I):
        ulice = re.split(r"\s+\d", t)[0].strip()  # jen vyjmenované domy
        pary = [[int(a), norm(b)] for a, b in re.findall(r"(\d+)/(\w+)", t)]
        return ulice, t, {"t": "jen", "p": pary}
    if re.search(r"č\.\s*[po]", t, re.I):  # rozsahy orientačních a výčet popisných čísel
        ulice = re.split(r"\s*[–—-]?\s*č\.\s*[po]", t, flags=re.I)[0].strip(" –—-")
        cs = re.search(r"sud[áa]\s*:?\s*([\d\s,–-]+?)(?=lich|č\.\s*p|$)", t, re.I)
        cl = re.search(r"lich[áa]\s*:?\s*([\d\s,–-]+?)(?=sud|č\.\s*p|$)", t, re.I)
        cp = re.search(r"č\.\s*p\.?\s*:?\s*(.+)$", t, re.I)
        return ulice, t, {"t": "cisla",
                          "cs": rozsahy(cs.group(1)) if cs else [],
                          "cl": rozsahy(cl.group(1)) if cl else [],
                          "cp": rozsahy(cp.group(1)) if cp else []}
    return t, t, {"t": "cela"}


def sedi(pr, cp, co):
    """Orientační číslo má přednost; výčet popisných platí jen pro domy bez orientačního."""
    if pr["t"] == "cela":
        return True
    if pr["t"] == "jen":
        return [cp, norm(co)] in pr["p"]
    if pr["t"] == "krome":
        return [cp, norm(co)] not in pr["p"]
    n = num(co)
    if n is not None:
        return any(a <= n <= b for a, b in (pr["cs"] if n % 2 == 0 else pr["cl"]))
    return cp is not None and any(a <= cp <= b for a, b in pr["cp"])


def polozky(lines):
    """Text vyhlášky -> {nadpis školy: [položky]}; čte se po stránkách, v každé levý sloupec, pak pravý."""
    pages, cur = [], []
    for l in lines:
        if "\f" in l:
            pages.append(cur)
            cur = [l.replace("\f", "")]
        else:
            cur.append(l)
    pages.append(cur)

    seq = []
    for pg in pages:
        heads = [i for i, l in enumerate(pg) if HEAD.match(l.strip())]
        bounds = [0] + heads + [len(pg)]
        for bi in range(len(bounds) - 1):
            a, b = bounds[bi], bounds[bi + 1]
            band = pg[a:b]
            if bi > 0:  # nadpis platí pro oba sloupce od svého řádku dolů
                seq.append(("HEAD", pg[a].strip()))
                band = pg[a + 1:b]
            L, R = [], []
            for l in band:
                t = l.strip()
                if not t or t.isdigit() or t.startswith("sídlo:") or t.startswith("Městská část"):
                    continue
                x, y = cols(l)
                if x and not x.isdigit():
                    L.append(x)
                if y and not y.isdigit():
                    R.append(y)
            seq += [("X", t) for t in L + R]

    out, cur_s, items = {}, None, []
    for kind, t in seq:
        if kind == "HEAD":
            if cur_s:
                out[cur_s] = items
            cur_s, items = t, []
        elif cur_s is not None:
            if items and CONT.match(t):
                items[-1] += " " + t
            else:
                items.append(t)
    if cur_s:
        out[cur_s] = items
    return out


def main():
    raw = polozky(SRC.read_text(encoding="utf-8").split("\n"))
    nezname = [k for k in raw if k not in IZO]
    if nezname:
        raise SystemExit("neznámá škola ve vyhlášce: " + "; ".join(nezname))

    ulice = defaultdict(list)   # norm(ulice) -> [{izo, pravidlo}]
    vypis = defaultdict(list)   # izo -> [text položky pro zobrazení]
    for skola, ps in raw.items():
        izo = IZO[skola]
        for p in ps:
            u, popis, pr = pravidlo(p)
            ulice[norm(u)].append({"i": izo, "m": MC[izo], **pr})
            vypis[izo].append(popis)

    out = {"v": VYHLASKA, "od": OD, "s": {k: sorted(v) for k, v in vypis.items()}, "u": dict(ulice)}
    (DATA / "spadovost.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # kontrola proti adresám: kolik jich vyjde a co zbývá
    adr = json.loads((DATA / "addresses.json").read_text(encoding="utf-8"))
    poc, zbyva = defaultdict(int), defaultdict(int)
    for a in adr:
        if a[5] not in ("9", "14"):
            continue
        k = norm(a[0])
        if k not in ulice:
            poc["bez ulice ve vyhlášce"] += 1
            zbyva[a[0]] += 1
            continue
        hit = [r["i"] for r in ulice[k] if r["m"] == a[5] and sedi(r, num(a[1]), a[2])]
        if len(hit) == 1:
            poc[hit[0]] += 1
        elif not hit:
            poc["číslo mimo rozsah"] += 1
            zbyva[a[0] + " (čísla)"] += 1
        else:
            poc["KOLIZE"] += 1
            zbyva[f"{a[0]} {a[1]}/{a[2]} → {hit}"] += 1

    jmena = {v: k for k, v in IZO.items()}
    tot = sum(poc.values())
    prir = sum(n for k, n in poc.items() if k in jmena)
    rep = [f"{VYHLASKA}, účinné od {OD}",
           f"adres v Praze 9 a 14: {tot}, přiřazeno: {prir} ({100 * prir // tot} %)", ""]
    for k, n in sorted(poc.items(), key=lambda x: -x[1]):
        rep.append(f"{n:6}  {jmena.get(k, k)}")
    rep += ["", "nepřiřazené:"] + [f"{n:6}  {u}" for u, n in sorted(zbyva.items(), key=lambda x: -x[1])]
    (DATA / "spadovost_report.txt").write_text("\n".join(rep) + "\n", encoding="utf-8")
    print("\n".join(rep))


if __name__ == "__main__":
    main()
