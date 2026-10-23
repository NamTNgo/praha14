// Cloudflare Worker: proxy k NDIC (ŘSD) s mezipamětí v R2.
//
// ŘSD nepouští cloudové IP a živé stažení 45 MB přes vzdálenou Cloudflare edge
// (kam padá GitHub Actions) končí na 522. Proto Worker stahuje ŘSD na POZADÍ
// (cron / waitUntil, kde je delší časový limit) do R2, a GitHubu pak servíruje
// jen hotovou kopii z R2 — to je rychlé a globální.
//
// Protože GitHub Actions cron je u 10min intervalu nespolehlivý, cron Workeru
// (ten jede spolehlivě) po naplnění R2 rovnou spustí i parsování na GitHubu přes
// API (workflow_dispatch). GitHub plánovač tím pádem neřešíme.
//
// R2 binding (Settings -> Bindings):  NDIC_BUCKET  -> bucket ndic-data
// Cron trigger (Settings -> Triggers): */10 * * * *
// Secrets (Settings -> Variables, Encrypt): NDIC_USER, NDIC_PASS, PROXY_TOKEN,
//   GH_TOKEN (fine-grained PAT na NamTNgo/praha14, oprávnění Actions: Read+Write)

const UPSTREAM = "https://mobilitydata.rsd.cz/Resources/Dynamic/CommonTIDatex/";
const KEY = "latest.xml";
const GH_REPO = "NamTNgo/praha14";
const GH_WORKFLOW = "nehody.yml";

const STATUS = "status.json";

import { DurableObject } from "cloudflare:workers";

// Cron Workeru běží kdekoli na světě (např. DFW = Dallas) a odtamtud ŘSD vrací 522.
// Stahování proto dělá Durable Object založený ve východní Evropě (locationHint "eeur"),
// odkud je ŘSD dostupné (ověřeno z VIE). Cron ho jen zavolá.
export class Stahovac extends DurableObject {
  async fetch(request) {
    try {
      await refresh(this.env);
      return new Response("ok");
    } catch (e) {
      return new Response(String(e && e.message || e), { status: 502 });
    }
  }
}

function stahovac(env) {
  const ns = env.STAHOVAC;
  return ns.get(ns.idFromName("ndic-eu"), { locationHint: "eeur" });
}

// jeden pokus o stažení s časovým limitem (bez limitu fetch visí, než ho Cloudflare utne)
async function stahni(env, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(UPSTREAM, {
      signal: ctl.signal,
      headers: {
        Authorization: "Basic " + btoa(env.NDIC_USER + ":" + env.NDIC_PASS),
        Accept: "application/xml, text/xml, */*",
      },
    });
    if (!r.ok) throw new Error("upstream HTTP " + r.status);
    return await r.arrayBuffer();
  } finally {
    clearTimeout(t);
  }
}

// stáhne ŘSD do R2; při chybě jednou zopakuje a výsledek uloží do status.json (čte ho /status)
async function refresh(env) {
  let buf = null, chyby = [];
  for (const ms of [60000, 90000]) {
    try {
      buf = await stahni(env, ms);
      break;
    } catch (e) {
      chyby.push(e && e.name === "AbortError" ? "timeout po " + ms / 1000 + " s" : String(e && e.message || e));
    }
  }
  const stav = { at: new Date().toISOString(), ok: !!buf, chyby, bytes: buf ? buf.byteLength : 0 };
  await env.NDIC_BUCKET.put(STATUS, JSON.stringify(stav), { httpMetadata: { contentType: "application/json" } });
  if (!buf) {
    console.error("NDIC refresh selhal (" + (await colo()) + "): " + chyby.join(" | "));
    throw new Error("NDIC refresh selhal: " + chyby.join(" | "));
  }
  // R2.put chce známou délku; stream z fetche ji nemá, proto napřed do paměti
  await env.NDIC_BUCKET.put(KEY, buf, {
    httpMetadata: { contentType: "application/xml; charset=utf-8" },
  });
  console.log("NDIC refresh ok, " + buf.byteLength + " B");
}

// datové centrum Cloudflare, ve kterém Worker právě běží (např. PRG, FRA)
async function colo() {
  try {
    const t = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
    return (t.match(/colo=(\w+)/) || [])[1] || "?";
  } catch (e) {
    return "?";
  }
}

// diagnostika bez tokenu: jen zkusí spojení s ŘSD (bez přihlášení) – nic tajného nevrací
async function test() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  const t0 = Date.now();
  let vysledek;
  try {
    const r = await fetch(UPSTREAM, { method: "HEAD", signal: ctl.signal });
    vysledek = "HTTP " + r.status;
  } catch (e) {
    vysledek = e && e.name === "AbortError" ? "timeout 20 s" : "chyba: " + (e && e.message || e);
  } finally {
    clearTimeout(t);
  }
  return "datové centrum: " + (await colo()) + "\nŘSD odpověď: " + vysledek + " za " + (Date.now() - t0) + " ms\n" +
    "(HTTP 401 nebo 405 = spojení funguje; 522 nebo timeout = Cloudflare se k ŘSD nedostane)\n";
}

export default {
  // GitHub Actions čte hotovou kopii z R2
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/test") return new Response(await test(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (request.headers.get("Authorization") !== "Bearer " + env.PROXY_TOKEN) {
      return new Response("Forbidden\n", { status: 403 });
    }
    // ruční naplnění: /refresh stáhne ŘSD rovnou a nahlásí výsledek (volá se z Prahy)
    if (new URL(request.url).pathname === "/refresh") {
      if (!env.NDIC_BUCKET) return new Response("chybí binding NDIC_BUCKET\n", { status: 500 });
      const r = await stahovac(env).fetch("https://stahovac/refresh");
      return new Response((r.ok ? "ok" : "refresh error: " + (await r.text())) + "\n", { status: r.ok ? 200 : 500 });
    }
    // stav posledního stahování (bez tajných údajů) – čte ho GitHub a kontrola zdraví dat
    if (new URL(request.url).pathname === "/status") {
      const st = await env.NDIC_BUCKET.get(STATUS);
      return new Response(st ? await st.text() : "{}", { headers: { "Content-Type": "application/json" } });
    }
    const obj = await env.NDIC_BUCKET.get(KEY);
    if (!obj) return new Response("No data yet\n", { status: 503 });
    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Ndic-Updated": obj.uploaded ? obj.uploaded.toISOString() : "",
      },
    });
  },
  // cron: stáhne ŘSD do R2 a hned spustí parsování na GitHubu (spolehlivý plánovač)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const r = await stahovac(env).fetch("https://stahovac/refresh");
      if (!r.ok) {
        console.error("NDIC přes evropský Durable Object selhal: " + (await r.text()));
        return;                      // bez nových dat GitHub nespouštíme
      }
      await spustGithub(env);
    })());
  },
};

async function spustGithub(env) {
  if (!env.GH_TOKEN) return;
  await fetch("https://api.github.com/repos/" + GH_REPO + "/actions/workflows/" + GH_WORKFLOW + "/dispatches", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.GH_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ndic-proxy",
    },
    body: JSON.stringify({ ref: "main" }),
  });
}
