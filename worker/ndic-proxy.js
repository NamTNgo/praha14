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

async function refresh(env) {
  const r = await fetch(UPSTREAM, {
    headers: {
      Authorization: "Basic " + btoa(env.NDIC_USER + ":" + env.NDIC_PASS),
      Accept: "application/xml, text/xml, */*",
    },
  });
  if (!r.ok) throw new Error("upstream " + r.status);
  // R2.put chce známou délku; stream z fetche ji nemá, proto napřed do paměti
  const buf = await r.arrayBuffer();
  await env.NDIC_BUCKET.put(KEY, buf, {
    httpMetadata: { contentType: "application/xml; charset=utf-8" },
  });
}

export default {
  // GitHub Actions čte hotovou kopii z R2
  async fetch(request, env, ctx) {
    if (request.headers.get("Authorization") !== "Bearer " + env.PROXY_TOKEN) {
      return new Response("Forbidden\n", { status: 403 });
    }
    // ruční naplnění: /refresh stáhne ŘSD rovnou a nahlásí výsledek (volá se z Prahy)
    if (new URL(request.url).pathname === "/refresh") {
      if (!env.NDIC_BUCKET) return new Response("chybí binding NDIC_BUCKET\n", { status: 500 });
      try {
        await refresh(env);
        return new Response("ok\n");
      } catch (e) {
        return new Response("refresh error: " + e + "\n", { status: 500 });
      }
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
      await refresh(env);
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
