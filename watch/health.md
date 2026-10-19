Health-check našel problém s daty aplikace. U každého je i návod na opravu.

### ❌ Nehody – čerstvost (cron 10 min)
**Co se děje:** data jsou 5 h stará (limit 2 h) – aktualizace neběží

**Řešení:**
Cron Workeru nebo workflow Nehody neběží. Uzavírky/nehody z ŘSD nedotečou. Projdi postupně:
  1. Otevři URL Workeru s hlavičkou `Authorization: Bearer <NDIC_TOKEN>`.
     • `503 No data yet` → R2 je prázdné: spusť `GET /refresh` z pražské IP
       a zkontroluj Cron Trigger (`*/10 * * * *`) ve Worker → Settings → Triggers.
     • `401` → vypršel odběr: obnov přihlášení na mobilitydata.rsd.cz a secrets
       `NDIC_USER`/`NDIC_PASS` ve Workeru.
     • `403` → nesedí `PROXY_TOKEN` ve Workeru vs. `NDIC_TOKEN` v GitHub secrets.
  2. Když XML teče, ale v datech nic není → nejspíš se změnil formát DATEX;
     nech projet parser `scripts/build_doprava.py` proti čerstvému vzorku.


_Vygenerováno 2026-10-19 20:26 UTC._