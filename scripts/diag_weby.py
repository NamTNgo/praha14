#!/usr/bin/env python3
"""Diagnostika webů lékařů: stáhne text úvodní stránky a podstránek s kontaktem /
ordinačními hodinami a uloží ho do diag/weby.json (artefakt workflow, necommituje se).
Slouží k ruční kontrole, co weby uvádějí a co z nich build vytáhl."""
import concurrent.futures
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_doktori as b  # noqa: E402

KLIC = re.compile(r"kontakt|hodin|ordinac|ordinace|o-nas|onas|o-ordinaci|about|info|provoz|lekar|tym|team|sestr|kde-nas|contact", re.I)


def crawl(w):
    host = w.split("/")[0]
    out, base = {}, None
    for scheme in ("https://", "http://"):
        try:
            h = b._stahni_text(scheme + w + ("" if "/" in w else "/"))
            if h:
                base = scheme + host
                out[scheme + w] = h
                break
        except Exception as e:
            out["ERR " + scheme + w] = str(e)[:200]
    if not base:
        return w, {"chyba": out, "stranky": {}}
    first = next(iter(v for k, v in out.items() if not k.startswith("ERR")))
    odkazy = []
    for href, txt in re.findall(r'<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', first, re.I | re.S):
        u = urllib.parse.urljoin(base + "/", href)
        t = b._bez_diakr(href + " " + re.sub(r"<[^>]+>", " ", txt))
        if KLIC.search(t) and b._domena(urllib.parse.urlparse(u).hostname or "") == b._domena(host) and u not in odkazy:
            odkazy.append(u)
    for c in ("/kontakt", "/kontakt/", "/kontakty/", "/ordinacni-hodiny/"):
        if base + c not in odkazy:
            odkazy.append(base + c)
    for u in odkazy[:12]:
        try:
            h = b._stahni_text(u)
            if h:
                out[u] = h
        except Exception:
            pass
    stranky = {}
    for u, h in out.items():
        if u.startswith("ERR"):
            continue
        radky = b._html_na_radky(h)
        stranky[u] = {
            "text": "\n".join(" | ".join(r) for r in radky)[:25000],
            "mailto": sorted(set(m.lower() for m in re.findall(r"mailto:([^\"'?>\s]+)", h, re.I))),
            "tel": sorted(set(re.findall(r"tel:\+?([0-9\s ]{6,})", h))),
            "jsonld": bool(re.search(r"openingHours", h)),
        }
    return w, {"stranky": stranky}


def main():
    d = json.loads((b.DATA / "doktori.json").read_text(encoding="utf-8"))
    weby = sorted({x["w"] for x in d if x.get("w")})
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        res = dict(ex.map(crawl, weby))
    Path("diag").mkdir(exist_ok=True)
    Path("diag/weby.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print("webů:", len(weby), "nenačteno:", sum(1 for v in res.values() if not v["stranky"]))


if __name__ == "__main__":
    main()
