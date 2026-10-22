"""Jednorázový průzkum zdrojů z GitHub runneru (výsledek jde do větve „pruzkum“, ne do main)."""
import json
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (compatible; pod-okny-bot; +https://github.com/NamTNgo/praha14)"}
out = {}


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.status, r.read().decode("utf-8", "replace")


base = "https://mpp.praha.eu/arcgis/rest/services/DOP/Zony_placeneho_stani/MapServer"
try:
    s, t = get(base + "?f=json")
    j = json.loads(t)
    out["sluzba"] = {"status": s, "popis": j.get("serviceDescription") or j.get("description"), "vrstvy": [[l["id"], l["name"]] for l in j.get("layers", [])]}
    for l in j.get("layers", []):
        try:
            s2, t2 = get("%s/%d?f=json" % (base, l["id"]))
            m = json.loads(t2)
            q = {"where": "1=1", "geometry": "14.45,50.08,14.62,50.13", "geometryType": "esriGeometryEnvelope", "inSR": "4326",
                 "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "false", "resultRecordCount": "5", "f": "json"}
            s3, t3 = get("%s/%d/query?%s" % (base, l["id"], urllib.parse.urlencode(q)))
            qq = json.loads(t3)
            sc, tc = get("%s/%d/query?%s" % (base, l["id"], urllib.parse.urlencode(dict(q, returnCountOnly="true"))))
            out["L%d" % l["id"]] = {"nazev": l["name"], "geom": m.get("geometryType"), "pole": [f["name"] + ":" + (f.get("alias") or "") for f in m.get("fields") or []],
                                   "pocet_p9_14": json.loads(tc).get("count"), "ukazka": [f.get("attributes") for f in qq.get("features", [])[:5]], "chyba": qq.get("error")}
        except Exception as e:   # noqa: BLE001
            out["L%d" % l["id"]] = {"chyba": str(e)}
except Exception as e:   # noqa: BLE001
    out["sluzba"] = {"chyba": str(e)}

Path("diag").mkdir(exist_ok=True)
Path("diag/pruzkum.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(out, ensure_ascii=False)[:3000])
