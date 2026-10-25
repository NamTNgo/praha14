# ověření mapy v aplikaci se skutečným podkladem (síť je dostupná jen v Actions)
import subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
Path("diag").mkdir(exist_ok=True)
out = []
for u in ["https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js", "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css",
          "https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js", "https://tiles.openfreemap.org/styles/positron"]:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r: out.append("%s %s" % (r.status, u))
    except Exception as e: out.append("CHYBA %s %s" % (e, u))
srv = subprocess.Popen(["python", "-m", "http.server", "8799", "--directory", "docs"]); time.sleep(2)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    p = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []; p.on("pageerror", lambda e: errs.append(str(e))); p.on("console", lambda m: m.type == "error" and errs.append(m.text))
    p.goto("http://localhost:8799/"); p.wait_for_timeout(4000)
    p.fill("#q", "Veltruská 528"); p.wait_for_timeout(600); p.locator(".sugg button").first.click(); p.wait_for_timeout(1500)
    p.click('[data-nav="okoli"]'); p.wait_for_timeout(9000)
    out.append("maplibre: %s, canvas: %s, piny: %s" % (p.evaluate("!!(window.L && L.maplibreGL)"), p.locator(".mapa canvas").count(), p.locator(".mpin").count()))
    p.screenshot(path="diag/mapa.png")
    out += errs[:10]
    b.close()
srv.terminate()
Path("diag/pruzkum.txt").write_text("\n".join(out), encoding="utf-8")
