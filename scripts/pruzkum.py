# náhled stylů OpenFreeMap (vektorové, zdarma, bez klíče) – vyrenderuje MapLibre v Chromiu a uloží PNG
from pathlib import Path
from playwright.sync_api import sync_playwright
Path("diag").mkdir(exist_ok=True)
HTML = """<!doctype html><html><head><link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><style>html,body,#m{margin:0;width:390px;height:600px}</style></head>
<body><div id="m"></div><script>
const m = new maplibregl.Map({container:'m', style:'https://tiles.openfreemap.org/styles/STYL', center:[14.49022,50.120835], zoom:14, attributionControl:false, interactive:false});
m.on('idle', ()=>{ window.hotovo = true; });
</script></body></html>"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
    for s in ["positron", "liberty", "bright"]:
        p = b.new_page(viewport={"width": 390, "height": 600}, device_scale_factor=2)
        p.set_content(HTML.replace("STYL", s))
        p.wait_for_function("window.hotovo === true", timeout=90000)
        p.wait_for_timeout(1500)
        p.screenshot(path="diag/ofm_%s.png" % s)
        p.close()
    b.close()
