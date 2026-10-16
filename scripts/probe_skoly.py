"""Jednorázový průzkum: stáhne Rejstřík škol (JSON-LD) a uloží strukturu + ukázky do docs/data/skoly_probe.txt."""
import json, sys, urllib.request
from pathlib import Path

URL = "https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld"
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "skoly_probe.txt"


def shape(x, depth=0):
    if depth > 4:
        return "…"
    if isinstance(x, dict):
        return {k: shape(v, depth + 1) for k, v in list(x.items())[:40]}
    if isinstance(x, list):
        return [shape(x[0], depth + 1)] if x else []
    return x if not isinstance(x, str) else x[:60]


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (praha14-odpad)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        raw = r.read()
    data = json.loads(raw.decode("utf-8"))
    lines = [f"bytes: {len(raw)}", f"typ: {type(data).__name__}"]
    if isinstance(data, dict):
        lines.append("klíče: " + ", ".join(list(data.keys())[:30]))
    body = data
    for k in ("list", "položky", "polozky", "@graph", "data", "skoly"):
        if isinstance(data, dict) and k in data:
            body = data[k]; lines.append("seznam v klíči: " + k)
    if isinstance(body, list):
        lines.append(f"počet položek: {len(body)}")
        lines.append("struktura 1. položky:\n" + json.dumps(shape(body[0]), ensure_ascii=False, indent=1)[:6000])
        from collections import Counter
        def prague(b):
            t = json.dumps(b, ensure_ascii=False)
            return ("Praha 14" in t) or ("Praha 9" in t)
        hit = [b for b in body if prague(b)]
        lines.append(f"subjektů s Praha 9/14 kdekoliv: {len(hit)}")
        c = Counter()
        for b in hit:
            for sz in b.get("skolyAZarizeni", []):
                c[str(sz.get("druh"))] += 1
        lines.append("druhy (Praha 9/14): " + json.dumps(c.most_common(40), ensure_ascii=False))
        p14 = [b for b in hit if "Praha 14" in json.dumps(b, ensure_ascii=False) and b.get("skolyAZarizeni")]
        if p14:
            e = dict(p14[0]); e.pop("zrizovatele", None); e.pop("statutarniOrgany", None); e.pop("reditel", None)
            for sz in e.get("skolyAZarizeni", []):
                sz["obory"] = (sz.get("obory") or [])[:1]
            lines.append("ukázka Praha 14:\n" + json.dumps(e, ensure_ascii=False, indent=1)[:12000])
    else:
        lines.append(json.dumps(shape(body), ensure_ascii=False, indent=1)[:8000])
    OUT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        OUT.write_text(f"CHYBA: {type(e).__name__}: {e}", encoding="utf-8")
        sys.exit(1)
