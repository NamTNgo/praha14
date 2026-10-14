# Kam s odpadem? Praha 14

Webová aplikace pro nové obyvatele Prahy 14: po zadání adresy ukáže nejbližší stanoviště
tříděného odpadu v okruhu 1 km. Bez účtu, adresa se ukládá jen v prohlížeči.

- `docs/` – statický web (GitHub Pages)
- `docs/data/` – denně obnovovaná data (`stations.json`, `addresses.json`, `meta.json`)
- `scripts/build_data.py` – stažení stanovišť z Golemia a adres z RÚIAN
- `.github/workflows/data.yml` – spouští skript jednou denně

## Nastavení
1. Settings → Secrets and variables → Actions → New repository secret: `GOLEMIO_API_KEY`.
2. Settings → Pages → Source: Deploy from a branch → `main` / `/docs`.
3. Actions → „Denní aktualizace dat“ → Run workflow (první naplnění dat).

Zdroje: Golemio (Operátor ICT), adresy ČÚZK (RÚIAN, CC BY 4.0).
