# NDIC proxy (Cloudflare Worker + R2)

ŘSD nepouští na rozhraní NDIC cloudové IP a živé stažení 45 MB přes vzdálenou
Cloudflare edge (kam padá GitHub Actions) končí na HTTP 522. Proto Worker stahuje
ŘSD **na pozadí do R2** a GitHubu servíruje jen hotovou kopii.

```
GitHub Actions ──Bearer token──▶ Worker ──čte──▶ R2 (latest.xml)
                                   ▲
                      cron 10 min / /refresh
                                   │
                                stáhne ŘSD (Basic auth)
```

## Nastavení

1. **Zapni R2**: dash.cloudflare.com → R2 → Enable (Cloudflare vyžaduje kartu,
   u našeho provozu se nic neúčtuje).
2. **Bucket**: vytvoř bucket `ndic-data` (nebo nech Clauda přes nástroj).
3. **Worker → Edit code**: vlož `ndic-proxy.js`, Deploy.
4. **Worker → Settings → Bindings → Add → R2 bucket**:
   - Variable name: `NDIC_BUCKET`
   - Bucket: `ndic-data`
5. **Worker → Settings → Triggers → Cron Triggers → Add**: `*/10 * * * *`
6. **Worker → Settings → Variables (Secret/Encrypt)**: `NDIC_USER`, `NDIC_PASS`,
   `PROXY_TOKEN` (pokud tam z dřívějška nejsou).

## GitHub secrets (Settings → Secrets and variables → Actions)

- `NDIC_URL` = `https://ndic-proxy.<subdoména>.workers.dev`
- `NDIC_TOKEN` = stejná hodnota jako `PROXY_TOKEN`

## První naplnění / test

R2 se naplní buď při nejbližším cronu, nebo hned přes `GET /refresh`
(s hlavičkou `Authorization: Bearer <token>`) z pražské IP. Pak má
`GET /` vracet XML (status 200) místo `503 No data yet`.
