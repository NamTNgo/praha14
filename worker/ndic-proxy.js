// Cloudflare Worker: proxy k NDIC (ŘSD) s mezipamětí v R2.
//
// ŘSD nepouští cloudové IP a živé stažení 45 MB přes vzdálenou Cloudflare edge
// (kam padá GitHub Actions) končí na 522. Proto Worker stahuje ŘSD na POZADÍ
// (cron / waitUntil, kde je delší časový limit) do R2, a GitHubu pak servíruje
// jen hotovou kopii z R2 — to je rychlé a globální.
//
// R2 binding (Settings -> Bindings):  NDIC_BUCKET  -> bucket ndic-data
// Cron trigger (Settings -> Triggers): */30 * * * *
// Secrets (Settings -> Variables, Encrypt): NDIC_USER, NDIC_PASS, PROXY_TOKEN

const UPSTREAM = "https://mobilitydata.rsd.cz/Resources/Dynamic/CommonTIDatex/";
const KEY = "latest.xml";

async function refresh(env) {
  const r = await fetch(UPSTREAM, {
    headers: {
      Authorization: "Basic " + btoa(env.NDIC_USER + ":" + env.NDIC_PASS),
      Accept: "application/xml, text/xml, */*",
    },
  });
  if (!r.ok) throw new Error("upstream " + r.status);
  await env.NDIC_BUCKET.put(KEY, r.body, {
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
  // cron: pravidelné stažení ŘSD do R2 na pozadí
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  },
};
