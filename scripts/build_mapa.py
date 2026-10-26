"""Podkladová mapa čtvrti do hlavičky (ulice, koleje, voda, domy) z OpenStreetMap.

Rozdělí Prahu 9 a 14 na dlaždice ~1 km a uloží je do docs/data/mapa/<i>_<j>.json.
Aplikace si stáhne jen dlaždice kolem zvolené adresy. Formát dlaždice:
  {"o":[lat0,lon0], "w":[[druh, dy0, dx0, dy1, dx1, ...], ...]}
souřadnice v 1e-5 stupně, první bod relativně k rohu dlaždice, další jako rozdíly.
druh: 1 hlavní silnice, 2 sběrná, 3 obytná, 4 obslužná, 5 železnice, 6 tok, 7 vodní plocha, 8 dům
"""
import json, sys, time
from pathlib import Path
import requests

B = (50.065, 14.44, 50.155, 14.66)
DLAT, DLON = 0.01, 0.015
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "mapa"
QS = {
    "ulice": 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service)$"]({b});way["railway"="rail"]({b});way["waterway"~"^(river|stream)$"]({b});way["natural"="water"]({b});',
    "domy": 'way["building"]({b});',
}


def druh(t):
    h = t.get("highway")
    if h in ("motorway", "trunk", "primary"): return 1
    if h in ("secondary", "tertiary"): return 2
    if h == "service": return 4
    if h: return 3
    if t.get("railway"): return 5
    if t.get("waterway"): return 6
    if t.get("natural") == "water": return 7
    return 8


def stahni():
    b = "%s,%s,%s,%s" % B
    cesty = []
    for k, body in QS.items():
        for pokus in range(4):
            try:
                r = requests.post("https://overpass-api.de/api/interpreter", data={"data": "[out:json][timeout:240];(" + body.format(b=b) + ");out geom;"},
                                  timeout=320, headers={"User-Agent": "pod-okny-bot (github.com/NamTNgo/praha14)"})
                r.raise_for_status()
                el = r.json()["elements"]
                break
            except Exception as e:
                print(k, "pokus", pokus, e, file=sys.stderr); time.sleep(30)
        else:
            raise SystemExit("Overpass nedostupný: " + k)
        for e in el:
            g = e.get("geometry") or []
            if len(g) >= 2:
                cesty.append((druh(e.get("tags", {})), [(p["lat"], p["lon"]) for p in g]))
        print(k, len(el), file=sys.stderr)
    return cesty


def zjednodus(pts, eps=1.2e-5):
    if len(pts) < 3: return pts
    (y1, x1), (y2, x2) = pts[0], pts[-1]
    dy, dx = y2 - y1, x2 - x1; n = (dx * dx + dy * dy) ** .5 or 1e-12
    i, dm = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dx * (y1 - pts[k][0]) - dy * (x1 - pts[k][1])) / n
        if d > dm: i, dm = k, d
    if dm <= eps: return [pts[0], pts[-1]]
    return zjednodus(pts[:i + 1], eps)[:-1] + zjednodus(pts[i:], eps)


def dlazdice(cesty):
    t = {}
    for k, pts in cesty:
        if k != 8: pts = zjednodus(pts)
        la = [p[0] for p in pts]; lo = [p[1] for p in pts]
        for i in range(int((min(la) - 50) // DLAT), int((max(la) - 50) // DLAT) + 1):
            for j in range(int((min(lo) - 14) // DLON), int((max(lo) - 14) // DLON) + 1):
                t.setdefault((i, j), []).append((k, pts))
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"): f.unlink()
    vel = 0
    for (i, j), cc in t.items():
        y0, x0 = round((50 + i * DLAT) * 1e5), round((14 + j * DLON) * 1e5)
        w = []
        for k, pts in cc:
            q = [(round(a * 1e5), round(b * 1e5)) for a, b in pts]
            r = [k, q[0][0] - y0, q[0][1] - x0]
            for a in range(1, len(q)):
                if q[a] != q[a - 1]: r += [q[a][0] - q[a - 1][0], q[a][1] - q[a - 1][1]]
            w.append(r)
        s = json.dumps({"o": [y0, x0], "w": w}, separators=(",", ":"))
        (OUT / ("%d_%d.json" % (i, j))).write_text(s); vel += len(s)
    print("dlaždic", len(t), "celkem kB", vel // 1024, file=sys.stderr)


if __name__ == "__main__":
    dlazdice(stahni())
