// API aplikace Pod okny – anonymní potvrzení výpadku sousedy („U mě taky“).
// Data drží jeden Durable Object (SQLite). Ukládá se jen: událost, náhodné ID zařízení
// (z localStorage, ne osobní údaj), odpověď, čas a hash IP pro omezení zneužití.
import { DurableObject } from "cloudflare:workers";

const ORIGINS = ["https://namtngo.github.io", "http://localhost:8788", "http://localhost:8790"];
const OKNO = 60 * 60 * 1000;        // počítáme potvrzení za poslední hodinu
const LIMIT_IP = 30;                 // max. hlasů z jedné IP za hodinu

export class Hlasy extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS h (k TEXT, d TEXT, a TEXT, t INTEGER, ip TEXT, PRIMARY KEY (k, d))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS h_t ON h (t)");
    // komunita: anonymní počty za čtvrť (bez zařízení, jen typ, čtvrť, čas a otisk IP kvůli limitu)
    this.sql.exec("CREATE TABLE IF NOT EXISTS u (t INTEGER, typ TEXT, part TEXT, ip TEXT)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS u_p ON u (part, t)");
  }
  pocty(klice, d) {
    const od = Date.now() - OKNO, out = {};
    for (const k of klice) {
      const r = { ano: 0, ne: 0, ja: null };
      for (const x of this.sql.exec("SELECT a, COUNT(*) AS n FROM h WHERE k = ? AND t > ? GROUP BY a", k, od)) r[x.a] = x.n;
      if (d) for (const x of this.sql.exec("SELECT a FROM h WHERE k = ? AND d = ? AND t > ?", k, d, od)) r.ja = x.a;
      out[k] = r;
    }
    return out;
  }
  udalost(typ, part, ip) {
    const ted = Date.now();
    this.sql.exec("DELETE FROM u WHERE t < ?", ted - 60 * 24 * OKNO);
    const n = [...this.sql.exec("SELECT COUNT(*) AS n FROM u WHERE ip = ? AND t > ?", ip, ted - OKNO)][0].n;
    if (n >= LIMIT_IP) return false;
    this.sql.exec("INSERT INTO u (t, typ, part, ip) VALUES (?, ?, ?, ?)", ted, typ, part, ip);
    return true;
  }
  ctvrt(part, od, dO) {
    const r = { hlaseni: 0, umt: 0, sdileni: 0 };
    for (const x of this.sql.exec("SELECT typ, COUNT(*) AS n FROM u WHERE part = ? AND t >= ? AND t < ? GROUP BY typ", part, od, dO)) r[x.typ] = x.n;
    return r;
  }
  hlas(k, d, a, ip) {
    const ted = Date.now();
    this.sql.exec("DELETE FROM h WHERE t < ?", ted - 7 * 24 * OKNO);
    if (a === "zrus") { this.sql.exec("DELETE FROM h WHERE k = ? AND d = ?", k, d); return true; }
    const n = [...this.sql.exec("SELECT COUNT(*) AS n FROM h WHERE ip = ? AND t > ?", ip, ted - OKNO)][0].n;
    if (n >= LIMIT_IP) return false;
    this.sql.exec("INSERT OR REPLACE INTO h (k, d, a, t, ip) VALUES (?, ?, ?, ?, ?)", k, d, a, ted, ip);
    return true;
  }
}

async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pod-okny:" + s));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const o = request.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const json = (x, st) => new Response(JSON.stringify(x), { status: st || 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    const stub = env.HLASY.get(env.HLASY.idFromName("vse"));
    const platne = (k) => /^(voda|el):[\w-]{1,40}$/.test(k);
    const okD = (d) => /^[\w-]{8,64}$/.test(d || "");
    if (url.pathname === "/umetaky" && request.method === "GET") {
      const klice = (url.searchParams.get("k") || "").split(",").filter(platne).slice(0, 20);
      const d = url.searchParams.get("d");
      return json(await stub.pocty(klice, okD(d) ? d : null));
    }
    if (url.pathname === "/umetaky" && request.method === "POST") {
      let b;
      try { b = await request.json(); } catch (e) { return json({ chyba: "json" }, 400); }
      if (!platne(b.k) || !okD(b.d) || !["ano", "ne", "zrus"].includes(b.a)) return json({ chyba: "vstup" }, 400);
      const ip = await hash(request.headers.get("CF-Connecting-IP") || "?");
      const ok = await stub.hlas(b.k, b.d, b.a, ip);
      if (!ok) return json({ chyba: "limit" }, 429);
      return json((await stub.pocty([b.k], b.d))[b.k]);
    }
    const okPart = (p) => typeof p === "string" && p.length >= 2 && p.length <= 40;
    if (url.pathname === "/udalost" && request.method === "POST") {
      let b;
      try { b = await request.json(); } catch (e) { return json({ chyba: "json" }, 400); }
      if (!["hlaseni", "umt", "sdileni"].includes(b.typ) || !okPart(b.part)) return json({ chyba: "vstup" }, 400);
      const ip = await hash(request.headers.get("CF-Connecting-IP") || "?");
      return (await stub.udalost(b.typ, b.part, ip)) ? json({ ok: true }) : json({ chyba: "limit" }, 429);
    }
    if (url.pathname === "/ctvrt" && request.method === "GET") {
      const part = url.searchParams.get("part"), od = +url.searchParams.get("od"), dO = +url.searchParams.get("do");
      if (!okPart(part) || !(od > 0) || !(dO > od) || dO - od > 31 * 24 * OKNO) return json({ chyba: "vstup" }, 400);
      return json(await stub.ctvrt(part, od, dO));
    }
    return json({ ok: true, sluzba: "pod-okny-api" });
  },
};
