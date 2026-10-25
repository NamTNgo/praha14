import time, urllib.request
from pathlib import Path
T = [(17702, 11094), (17702, 11095), (17702, 11096), (17702, 11097), (17703, 11094), (17703, 11095), (17703, 11096), (17703, 11097)]
URL = {"osm": "https://tile.openstreetmap.org/15/{x}/{y}.png",
       "voyager": "https://a.basemaps.cartocdn.com/rastertiles/voyager/15/{x}/{y}@2x.png",
       "positron": "https://a.basemaps.cartocdn.com/light_all/15/{x}/{y}@2x.png"}
Path("diag").mkdir(exist_ok=True)
for k, u in URL.items():
    for x, y in T:
        req = urllib.request.Request(u.format(x=x, y=y), headers={"User-Agent": "pod-okny-bot (https://github.com/NamTNgo/praha14; náhled stylu mapy)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            Path("diag/%s_%d_%d.png" % (k, x, y)).write_bytes(r.read())
        time.sleep(0.3)
