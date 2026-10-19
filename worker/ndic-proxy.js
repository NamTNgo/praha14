// Cloudflare Worker: ověřená proxy k rozhraní NDIC (ŘSD).
//
// ŘSD nepouští na své rozhraní cloudové IP (GitHub Actions z něj dostane jen
// timeout), ale na IP Cloudflare edge ano. Tenhle Worker proto stojí mezi
// GitHub Actions a ŘSD: od ŘSD stáhne XML (s přihlášením, které zná jen on)
// a přepošle ho našemu workflow, které se u Workeru ověří sdíleným tokenem.
//
// Worker jen přeposílá tělo (nic neparsuje), takže se vejde do free tieru.
//
// Tajné hodnoty (Settings -> Variables -> Encrypt), NE do kódu:
//   NDIC_USER   – jméno z odběru mobilitydata.rsd.cz
//   NDIC_PASS   – heslo z odběru
//   PROXY_TOKEN – náhodný řetězec; stejný dáš do GitHub secretu NDIC_TOKEN

const UPSTREAM = "https://mobilitydata.rsd.cz/Resources/Dynamic/CommonTIDatex/";

export default {
  async fetch(request, env) {
    // pustíme jen volání s naším tokenem – ať proxy nestahuje kdokoli
    if (request.headers.get("Authorization") !== "Bearer " + env.PROXY_TOKEN) {
      return new Response("Forbidden\n", { status: 403 });
    }
    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        headers: {
          Authorization: "Basic " + btoa(env.NDIC_USER + ":" + env.NDIC_PASS),
          Accept: "application/xml, text/xml, */*",
          "Accept-Encoding": "gzip",
        },
      });
    } catch (e) {
      return new Response("Upstream error: " + e + "\n", { status: 502 });
    }
    // tělo streamujeme beze změny; stavový kód ŘSD předáme dál, ať workflow pozná 401
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  },
};
