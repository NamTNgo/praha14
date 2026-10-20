#!/usr/bin/env python3
"""Diagnostika webů lékařů přes skutečný prohlížeč (Playwright/Chromium) – pro weby,
které obsah skládají skriptem (Wix, webnode, SPA). Uloží viditelný text úvodní stránky
a podstránek s kontaktem / ordinačními hodinami do diag/weby_js.json."""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

DATA = Path(__file__).resolve().parent.parent / "docs" / "data"
KLIC = re.compile(r"kontakt|hodin|ordina|o-nas|o nás|o nas|ambulanc|lékař|lekar|pracovi|pobočk|pobock|contact|hours", re.I)


def domena(h):
    h = (h or "").lower()
    h = h[4:] if h.startswith("www.") else h
    return ".".join(h.split(".")[-2:])


def main():
    d = json.loads((DATA / "doktori.json").read_text(encoding="utf-8"))
    vyber = set(sys.argv[1:])
    weby = sorted({x["w"] for x in d if x.get("w") and (not vyber or x["w"] in vyber)})
    out = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(locale="cs-CZ", user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                                         "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"))
        for w in weby:
            p = ctx.new_page()
            zaznam = {"stranky": {}}
            try:
                p.goto("https://" + w, wait_until="domcontentloaded", timeout=30000)
                p.wait_for_timeout(2500)
                start = p.url
                zaznam["konec"] = start
                zaznam["stranky"][start] = p.inner_text("body")[:30000]
                odkazy = p.eval_on_selector_all("a", "els => els.map(a => [a.href, (a.innerText||'') + ' ' + (a.getAttribute('href')||'')])")
                zaznam["tel"] = sorted(set(p.eval_on_selector_all('a[href^="tel:"]', "els => els.map(a => a.getAttribute('href'))")))[:10]
                zaznam["mail"] = sorted(set(p.eval_on_selector_all('a[href^="mailto:"]', "els => els.map(a => a.getAttribute('href'))")))[:10]
                vid = []
                for href, t in odkazy:
                    u = (href or "").split("#")[0]
                    if u and KLIC.search(t) and domena(urlparse(u).hostname) == domena(urlparse(start).hostname) and u not in vid and u != start:
                        vid.append(u)
                for u in vid[:8]:
                    try:
                        p.goto(u, wait_until="domcontentloaded", timeout=25000)
                        p.wait_for_timeout(1500)
                        zaznam["stranky"][u] = p.inner_text("body")[:30000]
                    except Exception as e:
                        zaznam["stranky"][u] = "CHYBA " + str(e)[:150]
            except Exception as e:
                zaznam["chyba"] = str(e)[:300]
            out[w] = zaznam
            p.close()
            print(w, len(zaznam["stranky"]), zaznam.get("chyba", ""), flush=True)
        b.close()
    Path("diag").mkdir(exist_ok=True)
    Path("diag/weby_js.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
