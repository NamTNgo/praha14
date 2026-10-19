# NDIC proxy (Cloudflare Worker)

ŘSD nepouští na rozhraní NDIC cloudové IP, takže GitHub Actions z něj dostane jen
timeout. Z IP Cloudflare edge to jde (ověřeno: endpoint vrátil `401` za 63 ms).
Tenhle Worker proto stojí mezi GitHub Actions a ŘSD a přeposílá XML.

## Nastavení (jednorázově, ~5 minut)

1. Založ si **free účet** na https://dash.cloudflare.com (Workers & Pages).
2. **Create application → Create Worker**, pojmenuj třeba `ndic-proxy`, Deploy.
3. **Edit code**, smaž vzor a vlož obsah `ndic-proxy.js`. Deploy.
4. **Settings → Variables and Secrets** → přidej tři (typ *Secret / Encrypt*):
   - `NDIC_USER` – jméno z odběru mobilitydata.rsd.cz
   - `NDIC_PASS` – heslo z odběru
   - `PROXY_TOKEN` – náhodný řetězec (např. `dhMvrNc4TP_kTFDziY-WG6qWQ3_L-YjR`,
     ale klidně vygeneruj vlastní)
5. Opiš si URL Workeru, vypadá jako `https://ndic-proxy.<tvůj-subdoména>.workers.dev`.

## Do GitHubu (Settings → Secrets and variables → Actions)

- `NDIC_URL` → URL Workeru z kroku 5
- `NDIC_TOKEN` → stejná hodnota jako `PROXY_TOKEN`

Staré `NDIC_USER` / `NDIC_PASS` v GitHub secrets už nejsou potřeba (žijí jen ve
Workeru), můžeš je smazat.

## Ověření

V repu **Actions → „Nehody (NDIC)" → Run workflow**. V `docs/data/nehody_report.txt`
má být „staženo … B" místo timeoutu.
