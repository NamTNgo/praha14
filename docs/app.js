"use strict";
(function () {
  var RADIUS = 1000;
  var KEY = "praha14.address";
  var app = document.getElementById("app");
  var data = null;       // {stations, addresses}
  var state = { address: null, query: "", tab: "doprava", skF: "all", skZ: "all", skM: "all", skView: "list", skHist: [], skSel: null, skQ: "", skSheet: false, spadVse: false, dopVse: false,
    dkView: "list", dkHist: [], dkSel: null, dkF: "all", dkQ: "",
    akView: "list", akHist: [], akSel: null, akF: "vse", akK: "all", akDenVse: {}, akDay: null, akKal: false, akKalM: null, akKalSel: null };

  var TYPES = [
    { id: "papir", name: "Papír", core: true, bg: "#dce8fb", fg: "#2f6fb0",
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>' },
    { id: "plast", name: "Plast a nápojové kartony", core: true, bg: "#fdf1cb", fg: "#a9791a",
      icon: '<path d="M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/>' },
    { id: "sklo", name: "Sklo", core: true, bg: "#def3e4", fg: "#2e8f55",
      icon: '<path d="M9 2h6v4l2 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3Z"/><path d="M7 11h10"/>' },
    { id: "kovy", name: "Kovy", core: false, bg: "#e6e8ec", fg: "#5b6573",
      icon: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>' },
    { id: "oleje", name: "Jedlé tuky a oleje", core: false, bg: "#fbe9c8", fg: "#a86a10",
      icon: '<path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z"/>' },
    { id: "elektro", name: "Elektrozařízení", core: false, bg: "#e8e0f5", fg: "#6a4fb0",
      icon: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>' }
  ];
  var SVG = function (inner, sz, stroke, w) {
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="' + stroke +
      '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  };
  var PIN = '<path d="M12 22s7-7.1 7-12A7 7 0 0 0 5 10c0 4.9 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>';
  var ARROW = '<path d="M7 17 17 7M8 7h9v9"/>';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function label(a) { return a[0] + " " + (a[2] ? a[1] + "/" + a[2] : a[1]); }

  function dist(lat1, lon1, lat2, lon2) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ---- uložená adresa (jen v prohlížeči) ----
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.lat === "number") return v; } catch (e) {} return null; }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ---- hledání adres ----
  var index = null;
  function buildIndex() {
    index = data.addresses.map(function (a) {
      return { a: a, street: norm(a[0]), cd: a[1], co: a[2].toLowerCase() };
    }).sort(function (x, y) {
      return x.street < y.street ? -1 : x.street > y.street ? 1 : (parseInt(x.cd, 10) || 0) - (parseInt(y.cd, 10) || 0);
    });
  }
  function search(q) {
    var toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var num = null;
    if (toks.length > 1 && /^\d/.test(toks[toks.length - 1])) num = toks.pop();
    var street = toks.join(" ");
    var out = [], exact = [];
    for (var i = 0; i < index.length && exact.length + out.length < 40; i++) {
      var e = index[i];
      if (e.street.indexOf(street) !== 0 && !e.street.split(" ").some(function (w, k, arr) { return arr.slice(k).join(" ").indexOf(street) === 0; })) continue;
      if (num) {
        var n = num.split("/");
        var ok = n.length === 2 ? (e.cd.indexOf(n[0]) === 0 && e.co.indexOf(n[1]) === 0)
                                : (e.co.indexOf(num) === 0 || e.cd.indexOf(num) === 0);
        if (!ok) continue;
      }
      var isExact = num && (e.co === num || e.cd === num);
      (isExact ? exact : out).push(e.a);
    }
    return exact.concat(out).slice(0, 6);
  }

  // ---- výpočet výsledků ----
  function results(addr) {
    var near = [];
    data.stations.forEach(function (s) {
      var d = dist(addr.lat, addr.lon, s.lat, s.lon);
      if (d <= RADIUS) near.push({ s: s, d: d });
    });
    near.sort(function (a, b) { return a.d - b.d; });
    var byType = {};
    near.forEach(function (x) {
      Object.keys(x.s.t).forEach(function (t) { if (!byType[t]) byType[t] = { s: x.s, d: x.d, info: x.s.t[t] }; });
    });
    return { near: near, byType: byType };
  }
  var DAYS = ["ne", "po", "út", "st", "čt", "pá", "so"];
  function schedule(info) {
    var parts = [];
    if (info.d) parts.push("svoz orientačně: " + info.d.toLowerCase());
    if (info.n) {
      var d = new Date(info.n + "T00:00:00"), today = new Date(); today.setHours(0, 0, 0, 0);
      if (!isNaN(d) && d >= today) parts.push("příště " + DAYS[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + ".");
    }
    return parts.join(" · ");
  }
  function meters(d) { return Math.round(d / 10) * 10 + " m"; }

  // ---- šablony ----
  var FOOT = '<div class="foot">Zdroj dat: Golemio (Operátor ICT) · Adresy: ČÚZK (RÚIAN)</div>';
  var MC_URL = {
    "14": ["praha14.cz", "https://www.praha14.cz/urad-mestske-casti/hledam-informaci/zivotni-prostredi/odpady/"],
    "9": ["praha9.cz", "https://www.praha9.cz/urad-a-samosprava/zivotni-prostredi"]
  };
  function links(mc) {
    var m = MC_URL[mc] || MC_URL["14"];
    return '<div class="links">' +
      '<a class="link" href="https://ksnko.praha.eu/map-bulky/" target="_blank" rel="noopener">Mapa KSNKO ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a>" +
      '<a class="link" href="' + m[1] + '" target="_blank" rel="noopener">Harmonogramy na ' + m[0] + ' ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div>";
  }

  function viewSearch() {
    var q = state.query, res = q.trim().length >= 2 ? search(q) : [], none = q.trim().length >= 2 && !res.length;
    var h = '<div class="head"><div class="eyebrow">Praha 9 a 14</div><h1>Kam s odpadem?</h1>' +
      '<div class="sub">Zadejte adresu a uvidíte, kde a kdy v okolí odnést odpad.</div></div><div class="body">' +
      '<div class="input-wrap">' + SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18, "#8a8572", 2.2) +
      '<input id="q" class="input' + (none ? " bad" : "") + (q.trim().length >= 2 ? " has-clear" : "") + '" type="text" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Adresa" placeholder="Ulice a číslo" value="' + esc(q) + '">' +
      '<button type="button" class="clear-btn" id="clr" aria-label="Vymazat text"' + (q.trim().length >= 2 ? "" : " hidden") + '><span class="clear-dot">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 10, "#fff", 3.2) + "</span></button></div>";
    h += '<div id="sres" class="list">' + searchRes(res, none) + "</div></div>" + FOOT;
    return h;
  }
  function searchRes(res, none) {
    var h = "";
    if (res.length) {
      h += '<div class="card sugg" role="list">' + res.map(function (a, i) {
        return '<button type="button" data-i="' + i + '"><span class="pin">' + SVG(PIN, 16, "#1f4d36", 2.1) + '</span><span><span class="p">' + esc(label(a)) + '</span><span class="s">Praha ' + (a[5] || "14") + '</span></span></button>';
      }).join("") + "</div>";
    } else if (none) {
      h += '<div class="card center"><span class="big-badge" style="background:#fbeadb">' + SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M9 9l4 4m0-4-4 4"/>', 26, "#b5631f") +
        '</span><div class="t1">Tuhle adresu jsme nenašli</div><p>Zkontrolujte prosím, jestli je ulice a číslo napsané správně, a zkuste to znovu.</p></div>' +
        '<div class="hint" style="text-align:center">Appka zatím pokrývá jen adresy v Praze 9 a Praze 14.</div>';
    } else {
      h += '<div class="hint">Našeptávač se spustí po druhém napsaném písmenu.</div>';
    }
    return h;
  }

  // ---- mobilní sběr nebezpečného odpadu (jen Praha 14) ----
  var HDAYS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  function hazardInfo(addr) {
    var hz = data.hazard && data.hazard[addr.mc || "14"];
    if (!hz) return null;
    var best = null;
    Object.keys(hz.routes).forEach(function (rk) {
      hz.routes[rk].stops.forEach(function (st) {
        var d = dist(addr.lat, addr.lon, st.lat, st.lon);
        if (!best || d < best.d) best = { d: d, st: st, rk: rk };
      });
    });
    if (!best) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dates = hz.routes[best.rk].dates.map(function (x) { return new Date(x + "T00:00:00"); }).filter(function (x) { return x >= today; });
    best.next = dates[0] || null;
    best.last = dates.length <= 1;
    best.src = hz.src;
    return best;
  }
  function hazardCard(addr) {
    var x = hazardInfo(addr);
    if (!x) return "";
    var h = '<div class="card row top"><span class="badge" style="background:#f7dede">' +
      SVG('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>', 18, "#b03a3a") +
      '</span><div class="grow"><div class="t1">Sběr nebezpečného odpadu</div><div class="note">Mobilní sběr: vozidlo zastaví na křižovatce, odpad předáte na místě.</div>' +
      '<div class="hbox"><div class="eyebrow" style="color:#a13333">Nejbližší zastávka</div><div class="hname">' + esc(x.st.name) + " · " + meters(x.d) + "</div>";
    if (x.next) {
      var t = x.next.getDay() === 6 ? x.st.sat : x.st.wk;
      h += '<div class="hdate">' + HDAYS[x.next.getDay()] + " " + x.next.getDate() + ". " + (x.next.getMonth() + 1) + ". · " + t + "</div>";
    }
    h += '<div class="hnote">trasa ' + x.rk + (x.st.note ? " · " + esc(x.st.note) : "") + "</div></div>";
    if (!x.next || x.last) h += '<div class="note" style="margin-top:8px">' + (x.next ? "Po tomto termínu už v roce " : "V roce ") + "2026" + (x.next ? " další zastávka na této trase není" : " už další zastávka na této trase není") + ". Harmonogram na příští rok zatím nebyl zveřejněn.</div>";
    h += '<div class="links"><a class="link" href="' + x.src + '" target="_blank" rel="noopener">' + (/\.pdf$/.test(x.src) ? "Celý harmonogram (PDF) " : "Harmonogram na praha9.cz ") + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
    return h;
  }

  // ---- VOK a BIO VOK (Praha 14 i Praha 9 – nejbližší kontejner k adrese) ----
  function vokNearest(addr, typ, list) {
    var today = new Date(), best = null; today.setHours(0, 0, 0, 0);
    (list || []).forEach(function (r) {
      if (r.t !== typ) return;
      var d = new Date(r.d + "T00:00:00");
      if (isNaN(d) || d < today) return;
      var dd = dist(addr.lat, addr.lon, r.lat, r.lon);
      if (!best || dd < best.dist || (dd === best.dist && d < best.date)) best = { r: r, date: d, dist: dd };
    });
    return best;
  }
  function vokBlock(x, cls, label) {
    if (!x) return "";
    var d = x.date;
    return '<div class="hbox ' + cls + '"><div class="eyebrow">' + label + '</div><div class="hname">' + esc(x.r.n) + " · " + meters(x.dist) + "</div>" +
      '<div class="hdate">' + HDAYS[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + "." + (x.r.h ? " · " + x.r.h : "") + "</div></div>";
  }
  function vokCard(addr) {
    var mc = addr.mc || "14";
    var list = mc === "9" ? (data.vok9 && data.vok9.mista) : data.vok;
    var v = list ? [vokNearest(addr, "vok", list), vokNearest(addr, "bio", list)] : null;
    var head = '<div class="card row top"><span class="badge" style="background:#fbe3d4">' +
      SVG('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>', 18, "#b8582a") +
      '</span><div class="grow"><div class="t1">Velkoobjemové kontejnery (VOK a BIO VOK)</div>';
    if (v && (v[0] || v[1])) {
      var zdroj = mc === "9" && data.vok9 ? vok9Links(data.vok9.src) : links("14");
      return head + vokBlock(v[0], "hvok", "Nejbližší VOK") + vokBlock(v[1], "hbio", "Nejbližší BIO VOK") +
        '<div class="note" style="margin-top:8px">Nejbližší kontejner k vaší adrese. Termíny se mohou změnit, ověřte je v mapě KSNKO nebo na webu městské části.</div>' + zdroj + "</div></div>";
    }
    return head + '<div class="note">Termíny a místa přistavení najdete v mapě KSNKO a na webu městské části Praha ' + mc + "." + "</div>" + links(mc) + "</div></div>";
  }
  function vok9Links(src) {
    return '<div class="links"><a class="link" href="' + esc(src.vok) + '" target="_blank" rel="noopener">Harmonogram VOK (PDF) ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a>" +
      '<a class="link" href="' + esc(src.bio) + '" target="_blank" rel="noopener">Harmonogram BIO VOK (PDF) ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a>" +
      '<a class="link" href="https://ksnko.praha.eu/map-bulky/" target="_blank" rel="noopener">Mapa KSNKO ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div>";
  }

  // ---- odstávka teplé vody ----
  function outageFor(addr) {
    if (!data.outages) return null;
    var mc = addr.mc || "14", st = addr.street || String(addr.label || "").replace(/\s+\d.*$/, "");
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var hit = data.outages.list.filter(function (o) {
      if (o.mc !== mc || new Date(o.to + "T00:00:00") < today) return false;
      return (addr.part && o.parts.indexOf(addr.part) >= 0) || o.streets.indexOf(st) >= 0;
    }).sort(function (a, b) { return a.from < b.from ? -1 : 1; })[0];
    return hit || null;
  }
  function outageRange(o) {
    var f = new Date(o.from + "T00:00:00"), t = new Date(o.to + "T00:00:00");
    return f.getDate() + ". " + (f.getMonth() + 1) + ". – " + t.getDate() + ". " + (t.getMonth() + 1) + ". " + t.getFullYear();
  }
  var DROP = '<path d="M12 2.7s6 6.1 6 10.8a6 6 0 0 1-12 0C6 8.8 12 2.7 12 2.7Z"/><path d="M9.5 14.5a2.7 2.7 0 0 0 2.5 2"/>';
  function outageTop(addr) {
    var o = outageFor(addr);
    if (!o) return "";
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var from = new Date(o.from + "T00:00:00"), days = Math.round((from - today) / 86400000);
    var chip = days <= 0 ? "Právě probíhá" : days === 1 ? "Zítra" : days <= 4 ? "Za " + days + " dny" : "Za " + days + " dní";
    return '<div class="card row top" style="background:#fff8ec;border-color:#f0d9a8"><span class="badge" style="background:#fbe3d4">' + SVG(DROP, 18, "#b8582a") + '</span><div class="grow">' +
      '<div class="t1">Odstávka teplé vody <span class="chip">' + chip + '</span></div><div class="t2">' + esc(o.name) + " · " + outageRange(o) + '</div>' +
      '<div class="note">Dodávku teplé vody přerušuje Pražská teplárenská kvůli plánovaným pracím.</div>' +
      '<div class="links"><a class="link" href="https://www.ptas.cz/aktuality/" target="_blank" rel="noopener">Podrobnosti u PTAS ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
  }
  function outageNone(addr) {
    if (!data.outages || outageFor(addr)) return "";
    return '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(DROP, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Odstávka teplé vody</div>' +
      '<div class="note" style="margin-top:2px">Pro vaši lokalitu teď žádná plánovaná odstávka není. Letní odstávky bývají v červenci a srpnu.</div>' +
      '<div class="links"><a class="link" href="https://udalosti.vecr.cz/udalosti/pte.html" target="_blank" rel="noopener">Aktuální poruchy ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
  }

  function viewResult() {
    var a = state.address, r = results(a);
    var h = '<div class="head addr"><div><div class="eyebrow">Vaše adresa</div><div class="addr-name">' + esc(a.label) + '</div></div>' +
      '<button type="button" class="btn-edit" id="edit" aria-label="Změnit adresu">' + SVG('<path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 13, "currentColor", 2.3) + "Změnit</button></div>";
    if (state.tab === "skoly") return h + '<div class="body">' + skolyBody(a) + "</div>" + FOOT_SK;
    if (state.tab === "doprava") return h + '<div class="body">' + dopravaBody(a) + "</div>" + FOOT_DO;
    if (state.tab === "doktori") return h + '<div class="body">' + doktoriBody(a) + "</div>" + FOOT_DK;
    if (state.tab === "akce") return h + '<div class="body">' + akceBody() + "</div>" + FOOT_AK;
    h += '<div class="body">';
    h += cisteniPruh(a);
    h += outageTop(a);
    if (!r.near.length) {
      h += '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#6b6652") +
        '</span><div class="grow"><div class="t1">V okruhu 1 km jsme nenašli žádné stanoviště tříděného odpadu</div><div class="note">Další stanoviště můžete hledat v mapě KSNKO.</div>' +
        '<div class="links"><a class="link" href="https://ksnko.praha.eu/map-bulky/" target="_blank" rel="noopener">Mapa KSNKO ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
    } else {
      var n = r.near[0], types = TYPES.filter(function (t) { return n.s.t[t.id]; }).map(function (t) { return t.name.split(" a ")[0].toLowerCase(); });
      h += '<div class="card row near"><span class="badge" style="background:#e9f0e9">' + SVG(PIN, 19, "#1f4d36", 2.1) + '</span><div><div class="eyebrow">Nejbližší kontejner</div>' +
        '<div class="big">' + esc(n.s.name) + " · " + meters(n.d) + '</div><div class="t3" style="font-size:12.5px;color:#6b6652">' + esc(types.join(", ")) + "</div></div></div>";
      h += '<div class="list"><div class="label">V okruhu 1 km od adresy</div>';
      TYPES.forEach(function (t) {
        var f = r.byType[t.id];
        if (f) {
          var sch = schedule(f.info);
          h += '<div class="card row"><span class="badge" style="background:' + t.bg + '">' + SVG(t.icon, 18, t.fg) + '</span><div class="grow"><div class="t1">' + t.name +
            '</div><div class="t2">' + esc(f.s.name) + " · " + meters(f.d) + "</div>" + (sch ? '<div class="t3">' + sch + "</div>" : "") + "</div></div>";
        } else if (t.core) {
          h += '<div class="card-dashed row"><span class="badge" style="background:#efece2">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#6b6652") +
            '</span><div class="grow"><div class="t1" style="color:#6b6557">' + t.name + '</div><div class="note" style="margin-top:1px">v okruhu 1 km jsme nic nenašli</div></div></div>';
        }
      });
      h += "</div>";
    }
    h += vokCard(a);
    h += hazardCard(a);
    h += outageNone(a);
    h += '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' +
      SVG('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 18, "#5b5b54") +
      '</span><div class="grow"><div class="t1">Popelnice (směsný odpad)</div><div class="note" style="margin-top:2px">Svoz popelnic se liší podle domu. Termín zjistíte u správce domu nebo SVJ.</div></div></div>';
    return h + "</div>" + FOOT;
  }

  // ---- školy a školky ----
  var FOOT_SK = '<div class="foot">Zdroj dat: MŠMT (Rejstřík škol a školských zařízení) · Weby škol · Adresy: ČÚZK (RÚIAN)</div>';
  var SK_T = { ms: "MŠ", zs: "ZŠ", ss: "SŠ" };
  var SK_FULL = { ms: "Mateřská škola", zs: "Základní škola", ss: "Střední škola" };
  var SK_CHIPS = [["all", "Vše"], ["ms", "Školky"], ["zs", "Základní"], ["ss", "Střední"]];
  var SK_Z = [["all", "Vše"], ["s", "Veřejné"], ["p", "Soukromé"], ["c", "Církevní"]];
  var SK_M = [["all", "Praha 9 a 14"], ["9", "Praha 9"], ["14", "Praha 14"]];
  var MONTHS_CS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  var I_LAND = '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M3 10l9-6 9 6"/>';
  var I_CASE = '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>';
  var I_CROSS = '<path d="M12 3v18M6 9h12"/>';
  var I_SLIDERS = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
  var I_CHEV = '<path d="m9 6 6 6-6 6"/>';
  var I_EXT = '<path d="M7 17 17 7M8 7h9v9"/>';

  function plain(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function skById(id) { return (data.skoly || []).filter(function (s) { return s.id === id; })[0]; }

  // ---- spádové obvody ZŠ (vyhláška hl. m. Prahy, vyhodnocená při buildu) ----
  function spadUlice(s) { return plain(s).replace(/\s+/g, " ").trim(); }
  function spadCislo() {
    var a = state.address;
    if (!a) return null;
    if (a.cp) return { cp: parseInt(a.cp, 10), co: String(a.co || "") };
    var m = /(\d+)(?:\/(\w+))?\s*$/.exec(a.label || "");  // adresa uložená dřív má čísla jen v popisku
    return m ? { cp: parseInt(m[1], 10), co: m[2] || "" } : null;
  }
  function spadSedi(r, n) {
    var co = plain(n.co), i;
    if (r.t === "cela") return true;
    if (r.t === "jen" || r.t === "krome") {
      var je = r.p.some(function (x) { return x[0] === n.cp && String(x[1]) === co; });
      return r.t === "jen" ? je : !je;
    }
    function v(rs, x) { return rs.some(function (q) { return x >= q[0] && x <= q[1]; }); }
    i = parseInt(co, 10);
    if (!isNaN(i)) return v(i % 2 === 0 ? r.cs : r.cl, i);   // orientační číslo má přednost
    return !isNaN(n.cp) && v(r.cp, n.cp);
  }
  function spadIzo() {
    var a = state.address, n = spadCislo();
    if (!data.spad || !a || !n) return null;
    var rs = data.spad.u[spadUlice(a.street)];
    if (!rs) return null;
    var hit = rs.filter(function (r) { return r.m === a.mc && spadSedi(r, n); });
    return hit.length === 1 ? hit[0].i : null;
  }
  function izoOf(s) { return String(s.id || "").split("-")[0]; }
  function jeSpadova(s) { var i = spadIzo(); return s.t === "zs" && !!i && izoOf(s) === i; }
  function spadSkola() {               // škola, do jejíhož obvodu uložená adresa patří
    var i = spadIzo();
    return i ? (data.skoly || []).filter(function (x) { return x.t === "zs" && izoOf(x) === i; })[0] : null;
  }
  function spadCard(s) {
    if (s.t !== "zs" || !data.spad) return "";
    var ulice = data.spad.s[izoOf(s)], a = state.address;
    var h = '<div class="card dcard"><div class="dtitle">Spádová oblast</div>';
    if (!ulice || !ulice.length) {     // obvody má jen škola zřízená městskou částí
      return h + '<p class="spadstav">' + SVG(I_INFO, 17, "#8a8572", 2.2) +
        "<b>Tato škola nemá spádový obvod.</b> Přijímá žáky bez ohledu na adresu bydliště.</p>" +
        '<div class="dnote">Spádové obvody stanovuje ' + esc(data.spad.v) + " jen u škol zřízených městskou částí.</div></div>";
    }
    if (a && jeSpadova(s)) h += '<p class="spadstav">' + SVG('<path d="m5 13 4 4L19 7"/>', 17, "#2f6b43", 3.2) +
      "<b>" + esc(a.label) + " sem spadá.</b> Děti z této adresy mají při zápisu přednost.</p>";
    else if (a) {
      var jina = spadSkola();
      h += '<p class="spadstav">' + SVG(I_INFO, 17, "#8a8572", 2.2) + "<b>" + esc(a.label) + " sem nespadá.</b> " +
        (jina ? 'Spádová je <a class="spadlink" href="#" data-sk="' + esc(jina.id) + '">' + esc(zkratka(jina.n)) + SVG(I_CHEV, 13, "currentColor", 2.6) + "</a>"
              : "Vyhláška tuto adresu neuvádí, ověřte ji na městské části.") + "</p>";
    }
    var vse = state.spadVse, zob = vse ? ulice : ulice.slice(0, SPAD_N);
    h += '<div class="ulicelbl">Ulice ve spádové oblasti</div><div class="ulice">' + zob.map(esc).join(" · ") + "</div>";
    if (ulice.length > SPAD_N) h += '<button type="button" class="spadvic" id="spadvic">' +
      (vse ? "Zobrazit méně" : "Zobrazit všech " + ulice.length + " ulic") + SVG(vse ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    h += '<div class="dnote">Podle ' + esc(data.spad.v) + ", účinné od " + fmtDate(data.spad.od) + ". Zápis vždy potvrdí škola.</div></div>";
    return h;
  }
  var I_INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>';
  // dlouhé názvy z rejstříku se v odkazu zkrátí na to, co rodič pozná
  function zkratka(n) { return n.replace(/,\s*Praha 9[^,]*/i, "").replace(/,\s*(Dygrýnova|Bří\.|Vybíralova|Chvaletická|Šimanovská|Hloubětínská)[^,]*$/i, "").trim(); }
  var SPAD_N = 8;
  // Škola vedená v rejstříku ve víc částech (MŠ + ZŠ) má u kapacity upřesněný popisek.
  var SK_T = { ms: "MŠ", zs: "ZŠ", ss: "SŠ" };
  function kapLabel(s) {
    var more = (data.skoly || []).some(function (x) { return x.n === s.n && x.t !== s.t; });
    return more ? "Kapacita " + (SK_T[s.t] || "") : "Kapacita";
  }
  function skExtra(s) { return s && s.w && data.skolyExtra ? data.skolyExtra[s.w] || null : null; }
  function fmtDate(iso) { var p = iso.split("-"); return +p[2] + ". " + +p[1] + ". " + p[0]; }
  function skActive() { return (state.skZ !== "all" ? 1 : 0) + (state.skM !== "all" ? 1 : 0); }
  function skMatch(s) {
    return (state.skF === "all" || s.t === state.skF) && (state.skZ === "all" || s.z === state.skZ) && (state.skM === "all" || s.mc === state.skM);
  }
  // Škola může mít odloučená pracoviště (pole `p`): hlavní adresa je vždy první.
  function skSites(s) { return [{ a: s.a, mc: s.mc, lat: s.lat, lon: s.lon }].concat(s.p || []); }
  function skNear(a) {
    var r = [];
    data.skoly.forEach(function (s) {
      if (!skMatch(s)) return;
      var best = null;
      skSites(s).forEach(function (p) { var d = dist(a.lat, a.lon, p.lat, p.lon); if (!best || d < best.d) best = { d: d, p: p }; });
      if (best && best.d <= RADIUS) r.push({ s: s, d: best.d, p: best.p });
    });
    return r.sort(function (x, y) { return x.d - y.d; });
  }
  function skFull() {
    var q = plain(state.skQ.trim());
    var r = data.skoly.filter(function (s) {
      return skMatch(s) && (!q || plain(s.n + " " + skSites(s).map(function (p) { return p.a; }).join(" ")).indexOf(q) >= 0);
    });
    // Pod filtrem základních škol jde spádová nahoru; jinde by vyskočila z abecedy bez souvislosti.
    if (state.skF === "zs") {
      var i = r.findIndex(jeSpadova);
      if (i > 0) r = [r[i]].concat(r.slice(0, i), r.slice(i + 1));
    }
    return r;
  }
  function skCount() { return state.skView === "full" ? skFull().length : skNear(state.address).length; }

  function tabsHtml() {
    return '<div class="tabs" role="tablist">' + [["odpad", "Odpad"], ["skoly", "Školy"], ["doprava", "Doprava"]].map(function (t) {
      return '<button type="button" role="tab" class="tab' + (state.tab === t[0] ? " on" : "") + '" aria-selected="' + (state.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>";
  }
  function typeChip(t) {
    return '<span class="tp tp-' + t + '">' + SK_T[t] + "</span>";
  }
  function secTag(z) {
    if (z === "p") return '<span class="stag">' + SVG(I_CASE, 12, "currentColor", 2.2) + "Soukromá</span>";
    if (z === "c") return '<span class="stag">' + SVG(I_CROSS, 12, "currentColor", 2.2) + "Církevní</span>";
    return "";
  }
  function filterBar() {
    var n = skActive();
    return '<div class="fbar"><button type="button" class="fbtn' + (n ? " on" : "") + '" data-sheet="1" aria-haspopup="dialog">' + SVG(I_SLIDERS, 16, "currentColor", 2.2) + "Filtry" +
      (n ? '<span class="fbadge">' + n + "</span>" : "") + '</button><div class="chips fchips">' +
      SK_CHIPS.map(function (c) { return '<button type="button" class="chip' + (state.skF === c[0] ? " on" : "") + '" data-skf="' + c[0] + '">' + c[1] + "</button>"; }).join("") + "</div></div>";
  }
  function sheetHtml() {
    function sec(title, list, cur, attr) {
      return '<div class="shsec"><div class="shtitle">' + title + '</div><div class="chips">' + list.map(function (c) {
        return '<button type="button" class="chip big' + (cur === c[0] ? " on" : "") + '" ' + attr + '="' + c[0] + '">' + c[1] + "</button>";
      }).join("") + "</div></div>";
    }
    var n = skCount();
    return '<div class="sheet-bg" data-sheetclose="1"></div><div class="sheet" role="dialog" aria-label="Filtry"><div class="grab"></div>' +
      '<div class="shhead"><div class="shh">Filtry</div><button type="button" class="shx" data-sheetclose="1" aria-label="Zavřít">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 16, "currentColor", 2.4) + "</button></div>" +
      sec("Typ školy", SK_CHIPS, state.skF, "data-skf") + sec("Zřizovatel", SK_Z, state.skZ, "data-skz") + sec("Městská část", SK_M, state.skM, "data-skm") +
      '<div class="shfoot"><button type="button" class="shreset" id="skreset">Zrušit vše</button><button type="button" class="btn shgo" data-sheetclose="1">Zobrazit ' + n + " " + (n === 1 ? "místo" : n >= 2 && n <= 4 ? "místa" : "míst") + "</button></div></div>";
  }
  // Karta školy: 1) typ + městská část (v okolí vzdálenost), 2) název, 3) adresa, 4) štítky
  function skolaCard(s, d, p) {
    p = p || skSites(s)[0];
    var tags = (jeSpadova(s) ? '<span class="spadtag">' + SVG('<path d="m5 13 4 4L19 7"/>', 11, "currentColor", 3) + "Spádová pro tuto adresu</span>" : "") + secTag(s.z);
    return '<button type="button" class="card skcard" data-sk="' + esc(s.id) + '"><div class="skl">' +
      '<div class="skmeta">' + typeChip(s.t) + '<span class="skmisto">' + (d == null ? "Praha " + esc(p.mc) : meters(d)) + "</span></div>" +
      '<div class="sknm"><span class="cl">' + esc(s.n) + "</span></div>" +
      '<div class="skadr">' + esc(p.a) + "</div>" +
      (tags ? '<div class="sktags">' + tags + "</div>" : "") +
      "</div>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  function skolyBody(a) {
    if (!data.skoly) return '<div class="card-dashed row top"><div class="grow"><div class="t1">Seznam škol se připravuje</div><div class="note" style="margin-top:2px">Data z rejstříku škol se právě doplňují. Zkuste to prosím později.</div></div></div>';
    var near = skNear(a);
    var h = filterBar() + '<div class="list"><div class="label">V okruhu 1 km od adresy · ' + near.length + "</div>";
    if (!near.length) h += '<div class="card-dashed row top"><div class="grow"><div class="t1">V okruhu 1 km nic nenajdeme</div><div class="note" style="margin-top:2px">Zkuste jiný filtr nebo celý seznam.</div></div></div>';
    near.forEach(function (x) { h += skolaCard(x.s, x.d, x.p); });
    h += "</div>" + '<button type="button" class="btn-link" id="skfull">Celý seznam Prahy 9 a 14 (' + data.skoly.length + ")" + SVG(I_CHEV, 14, "currentColor", 2.4) + "</button>";
    return h;
  }
  function skolyListHtml() {
    var r = skFull();
    return '<div class="label">Nalezeno: ' + r.length + "</div>" + (r.length ? r.map(function (s) { return skolaCard(s); }).join("") :
      '<div class="card-dashed row top"><div class="grow"><div class="t1">Nic jsme nenašli</div><div class="note" style="margin-top:2px">Zkuste jiný název, ulici nebo filtr.</div></div></div>');
  }
  function viewSkolyFull() {
    return '<div class="head"><button type="button" class="btn-edit" id="skback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button>" +
      '<h1 style="margin-top:10px">Školy a školky</h1><div class="eyebrow">Praha 9 a 14</div></div><div class="body">' +
      '<div class="input-wrap">' + SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18, "#726c5a", 2) +
      '<input id="skq" class="input" type="search" placeholder="Název školy nebo ulice" autocomplete="off" value="' + esc(state.skQ) + '"></div>' +
      filterBar() + '<div class="list" id="sklist">' + skolyListHtml() + "</div></div>" + FOOT_SK;
  }

  // ---- detail školy ----
  function drow(label, val, o) {
    o = o || {};
    var v;
    if (val == null || val === "") v = '<span class="none">Neuvedeno</span>';
    else if (o.href) v = '<a class="vlink" href="' + esc(o.href) + '"' + (o.ext ? ' target="_blank" rel="noopener"' : "") + ">" + (o.icon || "") + esc(val) + "</a>";
    else v = '<span class="val' + (o.nowrap ? " nw" : "") + '">' + esc(val) + "</span>";
    return '<div class="drow"><span class="dl">' + label + '</span><span class="dv">' + v + "</span></div>";
  }
  function dcard(title, rows, note) { return '<div class="card dcard"><div class="dtitle">' + title + "</div>" + rows + (note ? '<div class="dnote">' + note + "</div>" : "") + "</div>"; }
  var I_PH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>';
  var I_MA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>';
  var I_CAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
  function dateList(arr) { return arr.map(function (x) { return fmtDate(x.d) + (x.t ? ", " + x.t.replace(/:00(?=–|$)/g, "").replace(/–/, "–") + " h" : ""); }); }
  function viewSkolaDetail(s) {
    var ex = skExtra(s) || {}, src = ex.src || {};
    var z = { s: [I_LAND, "Veřejná"], p: [I_CASE, "Soukromá"], c: [I_CROSS, "Církevní"] }[s.z];
    var gm = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.n + ", " + s.a + ", Praha");
    var web = s.w ? ["https://" + s.w, "Web školy"] : ["https://www.google.com/search?q=" + encodeURIComponent(s.n + " Praha " + s.a), "Najít web školy"];
    var h = '<div class="head" style="padding-bottom:6px"><button type="button" class="btn-edit" id="skback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px"><div class="dbadges"><span class="tp tp-' + s.t + ' lg">' + SK_T[s.t] + "</span>" +
      (z ? '<span class="stag lg">' + SVG(z[0], 12, "currentColor", 2.2) + z[1] + "</span>" : "") + "</div>" +
      '<h1 class="dname">' + esc(s.n) + "</h1>" +
      '<div class="daddr">' + SVG(PIN, 15, "#6b6652", 2) + esc(s.a) + " · Praha " + esc(s.mc) + "</div>" +
      '<div class="dlinks"><a class="btn-ext" href="' + gm + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" +
      '<a class="btn-ext" href="' + esc(web[0]) + '" target="_blank" rel="noopener">' + web[1] + " " + SVG(I_EXT, 12, "currentColor", 2.4) + "</a></div>";
    var hasTerms = !!(ex.dod || ex.zap || ex.pz);
    if (!ex.tel && !hasTerms) h += '<div class="dinfo warn">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#a9791a", 2.2) + "<span>U této školy nemáme všechny údaje. Chybějící informace zjistíte na webu školy.</span></div>";
    if (s.z === "c") h += '<div class="dinfo">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#6b6652", 2.2) + "<span>Církevní škola, výuka podle stejného vzdělávacího programu jako veřejné školy. Může mít duchovní zaměření.</span></div>";
    if (s.z === "p" || s.z === "c") h += dcard("Školné a poplatky", drow("Školné", ex.sk), ex.sk ? "Údaj z webu školy, částky se mohou měnit. Aktuální výši ověřte u školy." : "");
    // Veřejná MŠ školné nemá, ale vybírá úplatu za předškolní vzdělávání; veřejná ZŠ neplatí nic.
    else if (s.z === "s" && s.t === "ms" && ex.sk) h += dcard("Úplata za předškolní vzdělávání", drow("Měsíční úplata", ex.sk.replace(/\s*\/\s*měsíc$/, "").replace(/\d{4,}/g, function (n) { return n.replace(/\B(?=(\d{3})+$)/g, " "); })), "Údaj z webu školy, výši schvaluje zřizovatel. Předškoláci a děti s odkladem ji neplatí.");
    h += spadCard(s);
    h += dcard("Kontakt", drow("Telefon", ex.tel, ex.tel ? { href: "tel:" + ex.tel.replace(/\s/g, ""), icon: I_PH } : {}) + drow("E-mail", s.e, s.e ? { href: "mailto:" + s.e, icon: I_MA } : {}));
    var termSrc = src.dod || src.zap || src.pz;
    var termNote = "Termíny jsou zjištěny automaticky z webu školy" + (termSrc ? ' (<a href="' + esc(termSrc) + '" target="_blank" rel="noopener">zdroj</a>)' : "") + ". Před návštěvou si je ověřte u školy.";
    var zapLabel = s.t === "ms" ? "Zápis do MŠ" : "Zápis do 1. třídy";
    var zapVal = null;
    if (ex.zap) zapVal = ex.zap.dates ? dateList(ex.zap.dates).join(" a ") : (function (m) { var p = m.split("-"); return MONTHS_CS[+p[1] - 1] + " " + p[0]; })(ex.zap.month);
    if (s.t === "ss") {
      var r = drow("Podání přihlášek", "do 1. 3.", { nowrap: true });
      r += ex.pz ? ex.pz.map(function (x, i) { return drow(i ? "Další termín zkoušky" : "Přijímací zkouška", dateList([x])[0], { nowrap: true }); }).join("") : drow("Přijímací zkouška", null);
      r += ex.dod ? dateList(ex.dod).map(function (t, i) { return drow(i ? "Další den otevřených dveří" : "Den otevřených dveří", t, i ? { nowrap: true } : { href: src.dod || "#", ext: 1, icon: I_CAL }); }).join("") : drow("Den otevřených dveří", null);
      h += dcard("Přijímací řízení", r, "Přihlášky na obory bez talentové zkoušky se podávají do 1. března, u oborů s talentovou zkouškou do 30. listopadu. " + (ex.pz || ex.dod ? termNote : ""));
    } else if (hasTerms) {
      var rr = ex.dod ? dateList(ex.dod).map(function (t, i) { return drow(i ? "Další den otevřených dveří" : "Den otevřených dveří", t, i ? { nowrap: true } : { href: src.dod || "#", ext: 1, icon: I_CAL }); }).join("") : drow("Den otevřených dveří", null);
      rr += drow(zapLabel, zapVal);
      h += dcard("Termíny", rr, termNote);
    } else {
      h += '<div class="card-dashed row top" style="flex-direction:column;align-items:stretch;gap:12px"><div style="display:flex;align-items:center;gap:10px"><span class="badge" style="background:#efece2">' + I_CAL.replace('width="14" height="14"', 'width="18" height="18"') + '</span><div><div class="t1" style="color:#6b6557">Termíny zatím nemáme</div><div class="note" style="margin-top:2px">Den otevřených dveří a zápis zjistíte na webu školy.</div></div></div>' +
        '<div><a class="btn-ext" href="' + esc(web[0]) + '" target="_blank" rel="noopener">' + web[1] + " " + SVG(I_EXT, 12, "currentColor", 2.4) + "</a></div></div>";
    }
    var prac = s.p && s.p.length ? '<div class="dgrp">' + s.p.map(function (p, i) { return drow(i ? "" : "Další pracoviště", p.a); }).join("") + "</div>" : "";
    h += dcard("O škole", drow("Zřizovatel", s.zn) + (s.pf ? drow("Právní forma", s.pf) : "") + drow("Ředitel/ka", s.rd) + prac + drow(kapLabel(s), s.k ? s.k + " " + (s.t === "ms" ? "dětí" : "žáků") : null) + (s.j ? drow("Vyučovací jazyk", s.j) : ""));
    h += '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>', 18, "#6b6652", 2) +
      '</span><div class="grow"><div class="t1" style="color:#6b6557">Hodnocení od rodičů</div><div class="note" style="margin-top:2px">Brzy: hodnotit školu budou moct rodiče z appky.</div></div></div>';
    return h + "</div>" + FOOT_SK;
  }

  function viewOffline() {
    return '<div class="full"><span class="big-badge" style="width:64px;height:64px;border-radius:20px;background:#ececea">' +
      SVG('<path d="M1 9a16 16 0 0 1 22 0"/><path d="M5 12.5a10.8 10.8 0 0 1 14 0"/><path d="M8.5 16a6 6 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M2 2l20 20"/>', 30, "#6b6557") +
      '</span><h2>Nejste připojeni k internetu</h2><p>Pro zobrazení stanovišť a termínů potřebuje appka internetové připojení. Zkontrolujte prosím Wi-Fi nebo mobilní data.</p>' +
      '<button type="button" class="btn" id="retry">Zkusit znovu</button></div>';
  }
  function viewLoading() { return '<div class="head"><div class="eyebrow">Praha 9 a 14</div><h1>Kam s odpadem?</h1></div><div class="body"><div class="skel"></div><div class="skel"></div></div>'; }

  // Z detailu se dá otevřít další detail (odkaz na spádovou školu), proto zásobník,
  // ne jedna předchozí obrazovka – jinak by se zpět vracelo samo na sebe.
  function openSkola(id) {
    state.skHist.push({ v: state.skView, s: state.skSel, y: window.scrollY });
    state.skView = "detail"; state.skSel = id; state.skSheet = false; state.spadVse = false;
    try { history.pushState({ sk: state.skHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function oKrokZpet() {
    var p = state.skHist.pop() || { v: "list", s: null, y: 0 };
    state.skView = p.v; state.skSel = p.s; state.skSheet = false; state.spadVse = false;
    render(); window.scrollTo(0, p.y || 0);
  }
  function skBack() {
    // přes historii, ať tlačítko v aplikaci a tlačítko zpět v prohlížeči zůstanou v souladu
    if (state.skHist.length && history.state && history.state.sk) { history.back(); return; }
    oKrokZpet();
  }
  window.addEventListener("popstate", function () {
    if (state.tab === "akce" && state.akHist.length) akKrokZpet();
    else if (state.tab === "doktori" && state.dkHist.length) dkKrokZpet();
    else if (state.skHist.length) oKrokZpet();
  });

  // ---- doprava: blokové čištění, uzavírky a práce, výluky PID ----
  // Znění zdroje NDIC je dané podmínkami ŘSD, neměnit.
  var NDIC_ZDROJ = "Zdrojem digitalizovaných informací o silničním provozu je NDIC";
  var FOOT_DO = '<div class="foot">' + NDIC_ZDROJ +
    ' · Zdroj dat: PID (Golemio) · praha9.cz · praha14.cz · TSK (rozpisy blokového čištění)</div>';
  var I_SWEEP = '<path d="M2.5 14V8a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v6"/>' +
    '<path d="M12.6 14v-3.4a1 1 0 0 1 .3-.7l1.2-1.2a1 1 0 0 1 .7-.3h1.9a1 1 0 0 1 .8.4l1.6 2.2a1 1 0 0 1 .2.6V14"/>' +
    '<circle cx="6" cy="16.3" r="1.6"/><path d="M13.2 16.1h8.3"/><path d="M15 16.1v2.4M17.4 16.1v2.4M19.8 16.1v2.4"/>';
  var I_CONE = '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>';
  var I_BUS2 = '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/><path d="M4 11h16"/>' +
    '<circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/><path d="M6 21h2M16 21h2"/>';
  var I_OK = '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.6 2.6L16 9.5"/>';
  var I_CRASH = '<path d="M3 16.5V13a1 1 0 0 1 .2-.6l1.9-2.6a1 1 0 0 1 .8-.4h5.4a1 1 0 0 1 .7.3l2.6 2.5"/>' +
    '<path d="M3.2 12.8h10.9"/><circle cx="6.2" cy="16.6" r="1.6"/><circle cx="12.4" cy="16.6" r="1.6"/>' +
    '<path d="m17.6 11.3 1.5-1.6-2.4-.5 1.6-1.8-2.5-.2"/><path d="m18.4 15.2 2.2.3-1.3 1.7 2.3.6"/>';

  function den0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function dnu(iso) { return Math.round((new Date(iso + "T00:00:00") - den0()) / 86400000); }
  function kdy(n) { return n <= 0 ? "Dnes" : n === 1 ? "Zítra" : n <= 14 ? "Za " + n + " dní" : null; }
  function dden(iso) { var d = new Date(iso + "T00:00:00"); return HDAYS[d.getDay()] + " " + d.getDate() + ". " + (d.getMonth() + 1) + "."; }
  function obdobi(od, aDo) {
    if (od && aDo && od !== aDo) return fmtDate(od).replace(/ \d{4}$/, "") + " – " + fmtDate(aDo);
    if (od) return fmtDate(od);
    if (aDo) return "do " + fmtDate(aDo);
    return "termín neuveden";
  }
  function probiha(x) {
    var d = den0().toISOString().slice(0, 10);
    return (!x.od || x.od <= d) && (!x.do || x.do >= d);
  }

  function cisteniPro(a) {
    if (!data.doprava || !a || !a.street) return null;
    var u = plain(a.street), d = den0().toISOString().slice(0, 10);
    // jarní kolo bývá v rozpisu půl roku dopředu; tak daleko je to ještě zpráva, ne upozornění
    var konec = new Date(den0().getTime() + 60 * 86400000).toISOString().slice(0, 10);
    return (data.doprava.cisteni || []).filter(function (c) {
      return plain(c.u) === u && c.mc === a.mc && c.d >= d && c.d <= konec;
    }).sort(function (x, y) { return x.d < y.d ? -1 : 1; })[0] || null;
  }
  function uzavirkyPro(a) {
    if (!data.doprava || !a) return [];
    return (data.doprava.uzavirky || []).map(function (x) {
      // bez souřadnic ulici neumístíme; zůstane jen pro správnou městskou část
      var dd = x.lat == null ? null : dist(a.lat, a.lon, x.lat, x.lon);
      return { x: x, d: dd };
    }).filter(function (r) {
      // celá čtvrť, ne jen okruh; mc2 má uzavírka na hranici obou městských částí
      return r.x.mc === a.mc || r.x.mc2 === a.mc;
    }).sort(function (p, q) {
      if (probiha(p.x) !== probiha(q.x)) return probiha(p.x) ? -1 : 1;
      if ((p.d == null) !== (q.d == null)) return p.d == null ? 1 : -1;
      return (p.d || 0) - (q.d || 0);
    });
  }
  // nehody mají vlastní soubor, obnovovaný každých 10 minut
  function nehodyPro(a) {
    if (!data.nehody || !data.nehody.ndic || !a) return [];
    var d = den0().toISOString().slice(0, 10);
    return (data.nehody.nehody || []).filter(function (x) {
      if (x.mc !== a.mc && x.mc2 !== a.mc) return false;
      if (x.do && x.do < d) return false;
      return !(!x.do && x.od && dnu(x.od) < -2);
    }).map(function (x) {
      return { x: x, d: x.lat == null ? null : dist(a.lat, a.lon, x.lat, x.lon) };
    }).sort(function (p, q) { return (p.d == null ? 1e9 : p.d) - (q.d == null ? 1e9 : q.d); }).slice(0, 3);
  }
  function pidPro(a) {
    if (!data.doprava || !a) return { v: [], z: 0 };
    var blizke = (data.doprava.zastavky || []).filter(function (z) {
      return dist(a.lat, a.lon, z.lat, z.lon) <= 1000;
    }).map(function (z) { return z.n; });
    var v = (data.doprava.pid || []).filter(function (p) {
      return (p.st || []).some(function (s) { return blizke.indexOf(s) >= 0; });
    }).slice(0, 5);
    return { v: v, z: blizke.length };
  }

  function dkarta(icon, bg, fg, titul, tag, telo, zdroj, odkaz, text) {
    return '<div class="card row top"><span class="badge" style="background:' + bg + '">' + SVG(icon, 18, fg) + "</span>" +
      '<div class="grow"><div class="dhead"><div class="t1">' + titul + "</div>" + (tag || "") + "</div>" + telo +
      (zdroj ? '<div class="dsrc">' + esc(zdroj) + "</div>" : "") +
      (odkaz ? '<div class="links"><a class="link" href="' + esc(odkaz) + '" target="_blank" rel="noopener">' + esc(text) + " " + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div>" : "") +
      "</div></div>";
  }
  function dtag(x) {
    if (probiha(x)) return '<span class="dtag now">Probíhá</span>';
    var n = x.od ? dnu(x.od) : null, k = n == null ? null : kdy(n);
    return '<span class="dtag ' + (n != null && n <= 14 ? "soon" : "plan") + '">' + (k || (x.od ? "Od " + fmtDate(x.od).replace(/ \d{4}$/, "") : "Plánováno")) + "</span>";
  }

  function cisteniKarta(a) {
    var c = cisteniPro(a);
    if (!c) {
      return dkarta(I_SWEEP, "#efece2", "#6b6652", '<span style="color:#6b6557">Blokové čištění</span>', null,
        '<div class="note" style="margin-top:2px">' + (a.street ? "V " + esc(sklon(a.street)) : "Ve vaší ulici") +
        " v nejbližších týdnech čištění nemáme. Další kolo TSK zveřejňuje zhruba měsíc dopředu.</div>", null, null, null);
    }
    var n = dnu(c.d), k = kdy(n);
    return dkarta(I_SWEEP, "#f7dede", "#b03a3a", "Blokové čištění",
      '<span class="dtag ' + (n <= 1 ? "now" : "soon") + '">' + (k || fmtDate(c.d)) + "</span>",
      '<div class="hbox hcist"><div class="eyebrow">Ve vaší ulici</div><div class="hname">' + esc(c.u) + "</div>" +
      '<div class="hdate">' + dden(c.d) + (c.od ? " · " + esc(c.od) + "–" + esc(c.do || "") : "") + "</div>" +
      '<div class="hnote">zákaz zastavení, vozidla se odtahují na náklady majitele</div></div>',
      "Rozpis TSK pro Prahu " + c.mc, c.src, "Celý rozpis (PDF)");
  }
  // "Vašátkova" -> "ve Vašátkově" se neobejde bez skloňování; raději ulici necháme v 1. pádě
  function sklon(u) { return "ulici " + u; }

  function dopravaBody(a) {
    var c = cisteniPro(a), uz = uzavirkyPro(a), pi = pidPro(a), h = "";
    if (!data.doprava) {
      return '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG(I_INFO, 18, "#6b6652") +
        '</span><div class="grow"><div class="t1">Dopravní omezení se připravují</div>' +
        '<div class="note" style="margin-top:2px">Data se právě doplňují. Zkuste to prosím později.</div></div></div>';
    }
    if (!c && !uz.length && !pi.v.length && !nehodyPro(a).length) {
      h += '<div class="card row top" style="background:#f4f8f3;border-color:#dfe8dd"><span class="badge" style="background:#e9f0e9">' +
        SVG(I_OK, 19, "#1f4d36", 2.2) + '</span><div class="grow"><div class="t1">Teď se vás nic netýká</div>' +
        '<div class="note" style="margin-top:3px">V okolí vaší adresy neevidujeme žádné omezení.</div><div class="sled">' +
        sledr(I_SWEEP, "<b>Blokové čištění</b> v " + esc(sklon(a.street || "")) + " — nejbližší týdny nic") +
        sledr(I_CONE, "<b>Uzavírky a práce</b> v Praze " + esc(a.mc) + " — nic") +
        (data.doprava.ndic ? sledr(I_CRASH, "<b>Nehody</b> v Praze " + esc(a.mc) + " — nic") : "") +
        sledr(I_BUS2, "<b>Výluky PID</b> na " + pi.z + " zastávkách do 1 km — nic") +
        "</div>" + genNote() + "</div></div>";
      h += mimoDosah();
      return h;
    }
    h += cisteniKarta(a);
    if (!uz.length) {
      h += '<div class="label">Uzavírky a práce v Praze ' + esc(a.mc) + "</div>";
      h += '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG(I_INFO, 18, "#6b6652") +
        '</span><div class="grow"><div class="t1" style="color:#6b6557">V Praze ' + esc(a.mc) + " teď nic neevidujeme</div>" +
        '<div class="note" style="margin-top:2px">' + hlidame() + ' Úplně čerstvé události se sem můžou dostat s malým zpožděním.</div>' +
        genNote() + "</div></div>";
    } else {
      h += '<div class="lblrow"><div class="label">Uzavírky a práce v Praze ' + esc(a.mc) +
        '</div><div class="lblcnt">' + (uz.length === 1 ? "1 aktivní" : uz.length + " aktivních") + "</div></div>";
      var zob = state.dopVse ? uz : uz.slice(0, DOP_N);
      h += '<div class="list">' + zob.map(function (r) {
        var x = r.x, bg = probiha(x) ? "#f7dede" : "#efece2", fg = probiha(x) ? "#b03a3a" : "#6b6652";
        var ndic = x.z === "ndic";
        return dkarta(I_CONE, bg, fg, esc(x.ul && x.ul.length ? vyjmenuj(x.ul) : x.n), dtag(x),
          '<div class="t2">' + obdobi(x.od, x.do) + (r.d != null ? " · " + meters(r.d) : "") + "</div>" +
          (x.ul && x.ul.length ? '<div class="t3">' + esc(x.n) + "</div>" : "") +
          (popis(x) ? '<div class="t3">' + esc(zkrat(popis(x), 150)) + "</div>" : ""),
          ndic ? "Evidence dopravních informací (NDIC)" : null, x.u,
          ndic ? "Mapa dopravních informací" : "Detail na praha" + x.mc + ".cz");
      }).join("") + "</div>";
      if (uz.length > DOP_N) h += '<button type="button" class="spadvic" id="dopvic">' +
        (state.dopVse ? "Zobrazit méně" : "Zobrazit všech " + uz.length + " " + sklonCount(uz.length)) +
        SVG(state.dopVse ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    }
    var neh = nehodyPro(a);
    if (neh.length) {
      h += '<div class="label">Nehody a mimořádné události</div>';
      h += '<div class="note" style="margin:-2px 2px 8px">Evidenci kontrolujeme každých 10 minut, ' +
        nehCas() + " — nehoda už přesto může být odklizená.</div>";
      h += '<div class="list">' + neh.map(function (r) {
        var x = r.x;
        return dkarta(I_CRASH, "#fdeedd", "#a2600f",
          esc(x.ul && x.ul.length ? vyjmenuj(x.ul) : x.n), null,
          '<div class="t2">' + esc(x.n) + (r.d != null ? " · " + meters(r.d) : "") + "</div>" +
          (x.p ? '<div class="t3">' + esc(zkrat(x.p, 150)) + "</div>" : ""),
          "Evidence dopravních informací (NDIC)", x.u, "Mapa dopravních informací");
      }).join("") + "</div>";
    }
    h += '<div class="label">MHD v okolí</div>';
    if (!pi.v.length) {
      h += '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG(I_BUS2, 18, "#6b6652") +
        '</span><div class="grow"><div class="t1" style="color:#6b6557">Žádná výluka na zastávkách do 1 km</div>' +
        '<div class="note" style="margin-top:2px">Sledujeme ' + pi.z + " zastávek v okolí vaší adresy.</div></div></div>";
    } else {
      h += '<div class="list">' + pi.v.map(function (p) {
        return dkarta(I_BUS2, "#dce8fb", "#245a93", "Zastávka " + esc(p.st[0]),
          '<span class="dtag now">Probíhá</span>',
          '<div class="t3" style="margin-top:3px">' + esc(p.t) + "</div>", "PID", p.u, "Výluka na pid.cz");
      }).join("") + "</div>";
    }
    h += mimoDosah();
    return h;
  }
  // v článcích bývá za popisem ještě zhotovitel a telefon; do karty se to neplete
  function zkrat(t, n) { return t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)) + "…"; }
  // úvod článku bývá přepsaný nadpis; pak nemá smysl ho v kartě opakovat
  function popis(x) {
    var p = x.p || "";
    if (!p) return "";
    var zacatek = plain(p).slice(0, 140);
    var klic = plain(x.n || "").split(/\s+/).filter(function (w) { return w.length > 4; });
    var shoda = klic.filter(function (w) { return zacatek.indexOf(w) >= 0; }).length;
    return klic.length && shoda / klic.length >= 0.6 ? "" : p;
  }
  function vyjmenuj(a) { return a.length < 2 ? a[0] : a.slice(0, -1).join(", ") + " a " + a[a.length - 1]; }
  var DOP_N = 3;
  function sklonCount(n) { return n === 1 ? "uzavírka" : (n >= 2 && n <= 4 ? "uzavírky" : "uzavírek"); }
  // dokud NDIC nejede, nehlásíme ho jako sledovaný zdroj
  function hlidame() {
    return data.doprava && data.doprava.ndic
      ? "Hlídáme celostátní evidenci dopravních informací a aktuality Prahy 9 a Prahy 14."
      : "Hlídáme aktuality Prahy 9 a Prahy 14.";
  }
  function sledr(icon, text) { return '<div class="sledr">' + SVG(icon, 15, "#8a8572", 2.2) + "<div>" + text + "</div></div>"; }
  // u nehod je zajímavé, jak je to čerstvé v minutách, ne ve dnech
  function nehCas() {
    if (!data.nehody || !data.nehody.gen) return "stav z poslední kontroly";
    var min = Math.round((Date.now() - new Date(data.nehody.gen)) / 60000);
    if (min < 2) return "právě teď";
    if (min < 90) return "před " + min + " minutami";
    var h = Math.round(min / 60);
    return h <= 1 ? "před hodinou" : "před " + h + " hodinami";
  }
  function genNote() {
    if (!data.doprava || !data.doprava.gen) return "";
    var d = new Date(data.doprava.gen), dn = Math.round((den0() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    return '<div class="dsrc">naposledy zkontrolováno ' + (dn <= 0 ? "dnes" : dn === 1 ? "včera" : "před " + dn + " dny") +
      " v " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2) + "</div>";
  }
  function mimoDosah() {
    return '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG(I_INFO, 18, "#6b6652") +
      '</span><div class="grow"><div class="t1" style="color:#6b6557">Ještě než vyrazíte</div>' +
      '<div class="note" style="margin-top:2px">Oficiální evidenci ŘSD i aktuality městských částí kontrolujeme průběžně, ale ne v reálném čase — úplně čerstvá nehoda nebo krátká uzavírka se sem může dostat s odstupem. Aktuální stav ukáže živá mapa.</div>' +
      '<div class="links"><a class="link" href="https://www.dopravniinfo.cz/" target="_blank" rel="noopener">Živá dopravní mapa ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
  }
  function cisteniPruh(a) {
    var c = cisteniPro(a);
    if (!c || dnu(c.d) > 1) return "";
    return '<button type="button" class="warn" id="warncist">' + SVG(I_SWEEP, 18, "#8c3030", 2.2) +
      '<div class="wt">' + (dnu(c.d) <= 0 ? "Dnes" : "Zítra") + (c.od ? " " + esc(c.od) + "–" + esc(c.do || "") : "") +
      " blokové čištění v " + esc(sklon(c.u)) + " — přeparkujte</div>" + SVG(I_CHEV, 16, "#8c3030", 2.4) + "</button>";
  }

  // ---- lékaři (NRPZS) ----
  var FOOT_DK = '<div class="foot">Zdroj dat: ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb (NRPZS) · Adresy: ČÚZK (RÚIAN)</div>';
  var DK_T = { prak: "Praktik", det: "Dětský", zub: "Zubař", gyn: "Gynekolog", spec: "Specialista" };
  var DK_CHIPS = [["all", "Vše"], ["prak", "Praktik"], ["det", "Dětský"], ["zub", "Zubař"], ["gyn", "Gynekolog"], ["spec", "Specialisté"]];
  function dkById(id) { return (data.doktori || []).filter(function (s) { return s.id === id; })[0]; }
  function dkMatch(s) { return state.dkF === "all" || s.o === state.dkF; }
  function dkNear(a) {
    return (data.doktori || []).filter(dkMatch).map(function (s) { return { s: s, d: dist(a.lat, a.lon, s.lat, s.lon) }; })
      .filter(function (x) { return x.d <= RADIUS; }).sort(function (x, y) { return x.d - y.d; });
  }
  function dkFull() {
    var q = plain(state.dkQ.trim());
    return (data.doktori || []).filter(function (s) {
      return dkMatch(s) && (!q || plain(s.n + " " + s.a + " " + (s.obory || []).join(" ")).indexOf(q) >= 0);
    });
  }
  function dkChip(o) { return '<span class="tp tp-dok-' + o + '">' + DK_T[o] + "</span>"; }
  // Karta lékaře: 1) obor + MČ/vzdálenost, 2) název, 3) adresa
  function doktorCard(s, d) {
    return '<button type="button" class="card skcard" data-dk="' + esc(s.id) + '"><div class="skl">' +
      '<div class="skmeta">' + dkChip(s.o) + '<span class="skmisto">' + (d == null ? "Praha " + esc(s.mc) : meters(d)) + "</span></div>" +
      '<div class="sknm"><span class="cl">' + esc(s.n) + "</span></div>" +
      '<div class="skadr">' + esc(s.a) + "</div></div>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  // Posuvná filtrační lišta – jeden řádek, obory se doscrollují (varianta A).
  function dkFilterBar() {
    return '<div class="chipscroll"><div class="chiprow">' + DK_CHIPS.map(function (c) {
      return '<button type="button" class="chip' + (state.dkF === c[0] ? " on" : "") + '" data-dkf="' + c[0] + '">' + c[1] + "</button>";
    }).join("") + '</div><div class="chipfade"></div></div>';
  }
  function dkListHtml() {
    var r = dkFull();
    if (!r.length) return '<div class="card-dashed row top"><div class="grow"><div class="t1">Nic jsme nenašli</div><div class="note" style="margin-top:2px">Zkuste jiný obor, jméno nebo ulici.</div></div></div>';
    return r.map(function (s) { return doktorCard(s, null); }).join("");
  }
  var DK_NEAR = 5;    // v okolí je lékařů klidně přes sto, seznam v okolí proto krátíme
  function doktoriBody(a) {
    if (!data.doktori) return '<div class="card-dashed row top"><div class="grow"><div class="t1">Seznam lékařů se připravuje</div><div class="note" style="margin-top:2px">Data z NRPZS se právě doplňují. Zkuste to prosím později.</div></div></div>';
    var near = dkNear(a), vic = near.length > DK_NEAR;
    var h = dkFilterBar() + '<div class="list"><div class="label">' +
      (vic ? "Nejbližší z " + near.length + " v okruhu 1 km" : "V okruhu 1 km od adresy · " + near.length) + "</div>";
    if (!near.length) h += '<div class="card-dashed row top"><div class="grow"><div class="t1">V okruhu 1 km nic nenajdeme</div><div class="note" style="margin-top:2px">Zkuste jiný obor nebo celý seznam.</div></div></div>';
    near.slice(0, DK_NEAR).forEach(function (x) { h += doktorCard(x.s, x.d); });
    h += "</div>" + '<button type="button" class="btn-link" id="dkfull">Celý seznam Prahy 9 a 14 (' + data.doktori.length + ")" + SVG(I_CHEV, 14, "currentColor", 2.4) + "</button>";
    return h;
  }
  function viewDoktoriFull() {
    return '<div class="head"><button type="button" class="btn-edit" id="dkback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button>" +
      '<h1 style="margin-top:10px">Lékaři</h1><div class="eyebrow">Praha 9 a 14</div></div><div class="body" style="padding-bottom:28px">' +
      '<div class="input-wrap">' + SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18, "#726c5a", 2) +
      '<input id="dkq" class="input" type="search" placeholder="Jméno lékaře, obor nebo ulice" autocomplete="off" value="' + esc(state.dkQ) + '"></div>' +
      dkFilterBar() + '<div class="list" id="dklist">' + dkListHtml() + "</div></div>" + FOOT_DK;
  }
  // ordinační hodiny převzaté z webu ordinace; dnešní den zvýrazněný
  var DNY_ZKR = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  function hodinyCard(s) {
    var h = s.hod;
    if (!h || !h.r || !h.r.length) return "";
    var dnes = DNY_ZKR[new Date().getDay()];
    var rows = h.r.map(function (r) {
      var t = r[0] === dnes;
      return '<div class="drow hrow' + (t ? " today" : "") + '"><span class="dl">' + esc(r[0]) +
        (t ? ' <span class="dtag hdnes">dnes</span>' : "") + '</span><span class="dv hv">' +
        (r[1] || []).map(esc).join("<br>") + "</span></div>";
    }).join("");
    var zdroj = h.u ? '<a href="' + esc(h.u) + '" target="_blank" rel="noopener">webu ordinace</a>' : "webu ordinace";
    return dcard("Ordinační hodiny", rows, (h.h ? "Sloupce: " + esc(h.h) + ". " : "") +
      "Převzato z " + zdroj + ". Kvůli dovoleným a zástupům se hodiny mění, před návštěvou je radši ověřte.");
  }
  function viewDoktorDetail(s) {
    var d = dist(state.address.lat, state.address.lon, s.lat, s.lon);
    var kont = drow("Telefon", s.tel || null, s.tel ? { href: "tel:" + s.tel.replace(/\s/g, ""), icon: I_PH } : null) +
      drow("E-mail", s.e || null, s.e ? { href: "mailto:" + s.e, icon: I_MA } : null);
    var gm = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.n + ", " + s.a + ", Praha");
    var web = s.w ? ["https://" + s.w, "Web ordinace"] : ["https://www.google.com/search?q=" + encodeURIComponent(s.n + " Praha " + s.a), "Najít web ordinace"];
    var obory = (s.obory || []).join(", ") || s.on || "Neuvedeno";
    return '<div class="head"><button type="button" class="btn-edit" id="dkback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px"><div class="dbadges"><span class="tp tp-dok-' + s.o + ' lg">' + DK_T[s.o] + "</span></div>" +
      '<h1 style="margin:4px 0 0;font-size:23px">' + esc(s.n) + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + esc(s.a) + ", Praha " + esc(s.mc) + " · " + meters(d) + "</div>" +
      '<div class="dlinks"><a class="btn-ext" href="' + gm + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" +
      '<a class="btn-ext" href="' + esc(web[0]) + '" target="_blank" rel="noopener">' + web[1] + " " + SVG(I_EXT, 12, "currentColor", 2.4) + "</a></div>" +
      dcard("Kontakt", kont) +
      hodinyCard(s) +
      dcard("Obor a zařízení", drow("Obory", obory) + drow("Druh zařízení", s.dr || null), "Zdroj: ÚZIS ČR – NRPZS, aktualizace měsíčně.") +
      "</div>" + FOOT_DK;
  }
  function openDoktor(id) {
    state.dkHist.push({ v: state.dkView, s: state.dkSel, y: window.scrollY });
    state.dkView = "detail"; state.dkSel = id;
    try { history.pushState({ dk: state.dkHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function dkKrokZpet() {
    var p = state.dkHist.pop() || { v: "list", s: null, y: 0 };
    state.dkView = p.v; state.dkSel = p.s; render(); window.scrollTo(0, p.y || 0);
  }
  function dkBack() {
    if (state.dkHist.length && history.state && history.state.dk) { history.back(); return; }
    dkKrokZpet();
  }

  // ---- akce: kalendáře Prahy 9, Prahy 14 a Městské knihovny (scripts/build_akce.py) ----
  var AK_K = {
    deti: ["Děti a rodina", "#fdf1cb", "#7a5608"], kult: ["Kultura", "#ece6f7", "#5a3f9c"],
    vys: ["Výstavy", "#dce8fb", "#245a93"], sen: ["Senioři", "#f6e1d6", "#8f4524"],
    vzd: ["Vzdělávání", "#e3eef0", "#1d5d66"], sport: ["Sport", "#e1ecf6", "#245a93"],
    zdr: ["Zdraví", "#dfeadd", "#1f4d36"], sous: ["Sousedské", "#efe9dc", "#5c4a1f"]
  };
  var AK_KPOR = ["deti", "kult", "vys", "sen", "vzd", "sport", "zdr", "sous"];
  var AK_CAS = [["vse", "Vše"], ["dny", "Dnes a zítra"], ["tyden", "Tento týden"], ["vikend", "Víkend"]];
  var MES_NOM = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
  var VE_DNI = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];
  var DNY_ZK = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
  var I_CALG = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>';
  var AK_SRC = { p9: ["Kalendář akcí MČ Praha 9", "Prahy 9", "https://www.praha9.cz/o-praze-9/kalendar-akci"],
    p14: ["Kalendář akcí MČ Praha 14", "Prahy 14", "https://www.praha14.cz/zivot-na-praze-14/akce/"],
    mkp: ["Městská knihovna v Praze", "knihovny", "https://www.mlp.cz/akce/vsechny-akce"] };
  var DNY_CELE = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  var MES_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
  var AK_DEN_MAX = 6;   // v jednom dni víc karet nevypisujeme, zbytek pod tlačítkem
  var FOOT_AK = '<div class="foot">Zdroj dat: kalendáře akcí MČ Praha 9 a Praha 14 · Městská knihovna v Praze · Adresy: ČÚZK (RÚIAN)</div>';
  var I_LIVE = '<span class="aklive"><span class="akdot"></span>Probíhá</span>';

  function akD(s) {   // "2026-10-21" | "2026-10-21T15:00" -> Date (místní čas)
    var p = s.split("T"), d = p[0].split("-"), t = (p[1] || "00:00").split(":");
    return new Date(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
  }
  function akDen(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function akIso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function akKonec(a) {   // kdy akce opravdu skončí
    if (a.do.length === 10) { var k = akD(a.do); k.setDate(k.getDate() + 1); return k; }
    var e = akD(a.do);
    return e > akD(a.od) ? e : new Date(akD(a.od).getTime() + 2 * 3600 * 1000);
  }
  function akDlouha(a) {  // výstava, kurz, celé týdny – víc než jeden den (noční akce přes půlnoc ne)
    var d = (akDen(akD(a.do)) - akDen(akD(a.od))) / 864e5;
    return d >= 2 || (d >= 1 && a.do.length === 10);
  }
  function akProbiha(a, ted) { return akDlouha(a) && akD(a.od) <= ted && akKonec(a) > ted; }
  function akDatumTxt(d, rok) { return d.getDate() + ". " + MES_GEN[d.getMonth()] + (rok ? " " + d.getFullYear() : ""); }
  function akCasTxt(a) {
    if (a.cd || a.od.length === 10) return "";
    var o = a.od.slice(11, 16).replace(/^0/, ""), d = a.do.length > 10 ? a.do.slice(11, 16).replace(/^0/, "") : "";
    if (!d || a.do === a.od) return o;
    if (a.do.slice(0, 10) !== a.od.slice(0, 10)) return o + " – " + d + " (" + DNY_CELE[akD(a.do).getDay()].slice(0, 2) + ")";
    return o + " – " + d;
  }
  function akVzd(a) {
    if (a.lat == null || !state.address) return null;
    return dist(state.address.lat, state.address.lon, a.lat, a.lon);
  }
  function akVzdTxt(d) { return d == null ? "" : d < 1000 ? meters(d) : (Math.round(d / 100) / 10).toString().replace(".", ",") + " km"; }
  function akMisto(a, kratce) {
    var m = a.m || "", ad = a.a || "";
    var t = kratce ? (m || ad) : (m && ad && m.indexOf(ad) < 0 ? m + ", " + ad : (m || ad));
    if (!t) t = a.mc ? "Praha " + a.mc : "";
    var d = akVzdTxt(akVzd(a));
    return t + (d ? (t ? " · " : "") + d : "");
  }
  function akById(id) { var r = null; (data.akce && data.akce.akce || []).forEach(function (a) { if (a.id === id) r = a; }); return r; }

  // časové okno filtru [od, do)
  function akOkno(f, ted) {
    var dnes = akDen(ted), od = dnes, d = new Date(dnes);
    if (f === "dny") d.setDate(d.getDate() + 2);
    else if (f === "tyden") d.setDate(d.getDate() + (8 - (dnes.getDay() || 7)));   // kalendářní týden: od dneška do neděle
    else if (f === "vikend") {
      var wd = dnes.getDay();   // 0 = neděle
      if (wd === 0) { d.setDate(d.getDate() + 1); }
      else if (wd === 6) { d.setDate(d.getDate() + 2); }
      else { od = new Date(dnes); od.setDate(od.getDate() + (6 - wd)); d = new Date(od); d.setDate(d.getDate() + 2); }
    } else d.setDate(d.getDate() + 400);
    return [od, d];
  }
  function akVse(ted) {
    var A = data.akce && data.akce.akce || [];
    return A.filter(function (a) { return akKonec(a) > ted; });
  }
  // krátké akce v okně; dlouhé, které už běží, patří do „Právě probíhá“
  function akVOkne(f, k, ted) {
    var w = akOkno(f, ted);
    return akVse(ted).filter(function (a) {
      if (k !== "all" && a.k !== k) return false;
      if (akProbiha(a, ted)) return false;
      var s = akD(a.od);
      if (akDlouha(a)) return s >= w[0] && s < w[1];   // dlouhá akce, která teprve začne
      return s < w[1] && akKonec(a) > w[0] && (s >= w[0] || akKonec(a) > ted);
    }).sort(function (x, y) { return x.od < y.od ? -1 : x.od > y.od ? 1 : 0; });
  }
  function akBezi(k, ted) {
    return akVse(ted).filter(function (a) { return akProbiha(a, ted) && (k === "all" || a.k === k); })
      .sort(function (x, y) { var a = akVzd(x), b = akVzd(y); return (a == null ? 1e9 : a) - (b == null ? 1e9 : b); });
  }

  function akChips(a, velke) {
    var k = AK_K[a.k] || AK_K.kult, s = velke ? " lg" : "";
    return '<span class="akk' + s + '" style="background:' + k[1] + ";color:" + k[2] + '">' + k[0] + "</span>" +
      (a.z ? '<span class="akk akzrus' + s + '">Zrušeno</span>' : "") +
      (a.free ? '<span class="akfree' + s + '">Zdarma</span>' : (a.cena ? '<span class="akfree' + s + '">' + esc(a.cena) + "</span>" : "")) +
      (a.reg ? '<span class="akfree' + s + '">Nutné přihlášení</span>' : "");
  }
  function akFoto(a, cls) {
    if (!a.img) return "";
    return '<img class="' + cls + '" src="' + esc(a.img) + '" alt="" loading="lazy" onerror="this.remove()">';
  }
  function akKarta(a) {
    var cas = akCasTxt(a), o = cas.split(" – ");
    var casHtml = !cas ? '<span class="akcd">Celý den</span>' : esc(o[0]) + (o[1] ? "<small>do " + esc(o[1]) + "</small>" : "");
    var dlouha = akDlouha(a) ? '<div class="akm">' + "do " + akDatumTxt(akD(a.do)) + "</div>" : "";
    return '<button type="button" class="card akcard' + (a.z ? " zrus" : "") + '" data-ak="' + esc(a.id) + '">' +
      '<div class="aktime">' + casHtml + "</div>" +
      '<div class="akbody"><div class="akt">' + esc(a.t) + '</div><div class="akm">' + esc(akMisto(a, true)) + "</div>" + dlouha +
      '<div class="akmeta">' + akChips(a) + "</div></div>" + akFoto(a, "akimg") + "</button>";
  }
  function akDenNadpis(d, ted) {
    var dnes = akDen(ted), z = new Date(dnes); z.setDate(z.getDate() + 1);
    var t = +d === +dnes ? "Dnes" : +d === +z ? "Zítra" : DNY_CELE[d.getDay()].charAt(0).toUpperCase() + DNY_CELE[d.getDay()].slice(1);
    var pod = (+d === +dnes || +d === +z ? DNY_CELE[d.getDay()] + " " : "") + akDatumTxt(d, d.getFullYear() !== dnes.getFullYear());
    return '<div class="akday"><b>' + t + "</b><span>" + pod + "</span></div>";
  }
  function akVypadek() {
    var z = data.akce && data.akce.zdroje || {}, h = "";
    Object.keys(AK_SRC).forEach(function (k) {
      var s = z[k];
      if (!s || s.ok) return;
      var cas = s.cas ? akD(s.cas) : null;
      h += '<div class="dinfo warn">' + SVG('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', 18, "#a9791a", 2.2) +
        "<span><b>Akce " + AK_SRC[k][1] + " můžou být neaktuální.</b> " +
        (cas ? "Kalendář se nám naposledy podařilo načíst " + DNY_CELE[cas.getDay()] + " " + akDatumTxt(cas) + " v " + cas.getHours() + ":" + ("0" + cas.getMinutes()).slice(-2) + ". " : "Kalendář se teď nepodařilo načíst. ") +
        'Úplný přehled je na <a href="' + AK_SRC[k][2] + '" target="_blank" rel="noopener">webu</a>.</span></div>';
    });
    return h;
  }
  function akNic() {
    return '<div class="card-dashed akempty">' + SVG('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.6M15 10.3a10 10 0 0 1 4 2.6M12 20h.01"/>', 28, "#6b6652", 2) +
      '<div class="t1">Akce se teď nepodařilo načíst</div><div class="note">Zkuste to za chvíli. Mezitím najdete akce přímo v kalendářích městských částí.</div>' +
      '<div class="dlinks"><a class="btn-ext" href="' + AK_SRC.p9[2] + '" target="_blank" rel="noopener">Kalendář Prahy 9 ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" +
      '<a class="btn-ext" href="' + AK_SRC.p14[2] + '" target="_blank" rel="noopener">Kalendář Prahy 14 ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a></div></div>";
  }
  function akFiltry(ted) {
    var pritomne = {};
    akVse(ted).forEach(function (a) { pritomne[a.k] = 1; });
    var seg = '<div class="akseg" role="tablist">' + AK_CAS.map(function (c) {
      var on = state.akF === c[0];
      return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? "on" : "") + '" data-akf="' + c[0] + '">' + c[1] + "</button>";
    }).join("") + "</div>";
    var chips = [["all", "Vše"]].concat(AK_KPOR.filter(function (k) { return pritomne[k]; }).map(function (k) { return [k, AK_K[k][0]]; }));
    return seg + (state.akF === "vse" ? akProuzek(ted) : "") + '<div class="chipscroll"><div class="chiprow">' + chips.map(function (c) {
      return '<button type="button" class="chip' + (state.akK === c[0] ? " on" : "") + '" data-akk="' + c[0] + '">' + c[1] + "</button>";
    }).join("") + '</div><div class="chipfade"></div></div>';
  }
  // dny, ve kterých se něco koná (podle zvolené kategorie): iso -> počet
  function akDnyAkci(ted) {
    var m = {};
    akVOkne("vse", state.akK, ted).forEach(function (a) {
      var s = akD(a.od), k = akIso(s < akDen(ted) ? akDen(ted) : akDen(s));
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }
  // proužek dní pod filtrem Vše (Apple Store / Outlook) + tlačítko do měsíčního kalendáře
  function akProuzek(ted) {
    // proužek vede vždy od dneška do posledního dne s akcí (nejméně 4 týdny),
    // takže se chová stejně, ať je vybraný den blízko, nebo daleko
    var dnes = akDen(ted), m = akDnyAkci(ted), konec = new Date(dnes), klice = Object.keys(m).sort();
    konec.setDate(konec.getDate() + 27);
    if (klice.length && akD(klice[klice.length - 1]) > konec) konec = akD(klice[klice.length - 1]);
    var mesic = state.akDay ? akD(state.akDay) : dnes, h = "";
    for (var d = new Date(dnes); d <= konec; d.setDate(d.getDate() + 1)) {
      var iso = akIso(d), on = state.akDay === iso, je = !!m[iso], dn = +d === +dnes;
      h += '<button type="button" data-m="' + MES_NOM[d.getMonth()] + " " + d.getFullYear() + '" class="akdb' + (on ? " on" : "") + (dn ? " dnes" : "") + (je ? "" : " prazdny") + '" data-akday="' + iso + '" aria-pressed="' + on + '" aria-label="' +
        DNY_CELE[d.getDay()] + " " + akDatumTxt(d) + (je ? ", " + m[iso] + " " + (m[iso] === 1 ? "akce" : m[iso] < 5 ? "akce" : "akcí") : ", nic se nekoná") + '">' +
        "<span>" + (dn && !on ? "Dnes" : DNY_ZK[d.getDay()]) + "</span><b>" + d.getDate() + "</b><i></i></button>";
    }
    return '<div class="akprouzek"><div class="akprhl"><b id="akmes">' + MES_NOM[mesic.getMonth()] + " " + mesic.getFullYear() + "</b>" +
      '<span class="akprbtn"><button type="button" class="aktxt" id="akdnes"' + (state.akDay && state.akDay !== akIso(dnes) ? "" : " hidden") + ">Dnes</button>" +
      '<button type="button" class="btn-ext akkalbtn" id="akkal" aria-label="Vybrat den v kalendáři">' + SVG(I_CALG, 18, "currentColor", 2.2) + "Kalendář</button></span></div>" +
      '<div class="akdny">' + h + "</div></div>";
  }
  function akKalendar() {
    var ted = new Date(), dnes = akDen(ted), m = akDnyAkci(ted);
    var klice = Object.keys(m).sort(), posl = klice.length ? akD(klice[klice.length - 1]) : dnes;
    var mes = state.akKalM ? akD(state.akKalM) : new Date(dnes.getFullYear(), dnes.getMonth(), 1);
    var prvni = new Date(dnes.getFullYear(), dnes.getMonth(), 1), maxM = new Date(posl.getFullYear(), posl.getMonth(), 1);
    var sel = state.akKalSel || state.akDay, h = "";
    ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].forEach(function (x) { h += '<span class="akkdn">' + x + "</span>"; });
    var off = (mes.getDay() + 6) % 7;
    for (var i = 0; i < off; i++) h += "<span></span>";
    for (var d = new Date(mes); d.getMonth() === mes.getMonth(); d.setDate(d.getDate() + 1)) {
      var iso = akIso(d), minule = d < dnes;
      h += '<button type="button" class="akkd' + (sel === iso ? " on" : "") + (+d === +dnes ? " dnes" : "") + (m[iso] ? " ma" : "") + '"' +
        (minule ? " disabled" : ' data-akkalday="' + iso + '"') + ' aria-label="' + d.getDate() + ". " + MES_GEN[d.getMonth()] + '">' + d.getDate() + "<i></i></button>";
    }
    var n = sel ? (m[sel] || 0) : 0, sd = sel ? akD(sel) : null;
    return '<div class="sheet-bg" data-akkalclose></div><div class="sheet akkal" role="dialog" aria-label="Vyberte den">' +
      '<div class="akkalhl"><b>Vyberte den</b><span class="akprbtn">' +
      ((mes.getFullYear() !== dnes.getFullYear() || mes.getMonth() !== dnes.getMonth() || (sel && sel !== akIso(dnes))) ? '<button type="button" class="aktxt" id="akkaldnes">Dnes</button>' : "") +
      '<button type="button" class="shx" data-akkalclose aria-label="Zavřít">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 20, "currentColor", 2.4) + "</button></span></div>" +
      '<div class="akkalm"><button type="button" class="akkalnav" data-akkalm="-1"' + (mes <= prvni ? " disabled" : "") + ' aria-label="Předchozí měsíc">' + SVG('<path d="m15 6-6 6 6 6"/>', 18, "currentColor", 2.4) + "</button>" +
      "<b>" + MES_NOM[mes.getMonth()] + " " + mes.getFullYear() + "</b>" +
      '<button type="button" class="akkalnav" data-akkalm="1"' + (mes >= maxM ? " disabled" : "") + ' aria-label="Další měsíc">' + SVG('<path d="m9 6 6 6-6 6"/>', 18, "currentColor", 2.4) + "</button></div>" +
      '<div class="akkgrid">' + h + "</div>" +
      '<div class="akkleg"><i></i>V tento den se něco koná</div>' +
      '<button type="button" class="btn akkalok" id="akkalok"' + (sel ? "" : " disabled") + ">" +
      (sel ? "Zobrazit akce " + VE_DNI[sd.getDay()] + " " + akDatumTxt(sd) + " (" + n + ")" : "Vyberte den") + "</button></div>";
  }
  function akPrazdno(ted) {
    var kdy = { dny: "Dnes a zítra", vikend: "O víkendu", tyden: "Tento týden", vse: "V nejbližších týdnech" }[state.akF];
    if (state.akDay) { var dd = akD(state.akDay); kdy = VE_DNI[dd.getDay()].charAt(0).toUpperCase() + VE_DNI[dd.getDay()].slice(1) + " " + akDatumTxt(dd); }
    var co = state.akK === "all" ? "" : " v kategorii " + AK_K[state.akK][0].toLowerCase();
    var dalsi = akVOkne("vse", state.akK, ted).filter(function (a) { return !state.akDay || a.od.slice(0, 10) > state.akDay; }), nej = dalsi[0];
    var vsech = state.akK === "all" ? 0 : akVOkne(state.akF, "all", ted).length;
    var h = '<div class="card-dashed akempty">' + SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', 28, "#6b6652", 2) +
      '<div class="t1">' + kdy + co + " nic nemáme</div>";
    if (nej) h += '<div class="note">Nejbližší je ' + DNY_CELE[akD(nej.od).getDay()] + " " + akDatumTxt(akD(nej.od)) + ".</div>";
    h += '<div class="dlinks">' + (nej && (state.akF !== "vse" || state.akDay) ? '<button type="button" class="btn akbtn" data-akday="' + akIso(akDen(akD(nej.od) < akDen(ted) ? ted : akD(nej.od))) + '">Zobrazit nejbližší</button>' : "") +
      (vsech ? '<button type="button" class="btn-ext akbtn2" data-akk="all">Všechny akce (' + vsech + ")</button>" : "") + "</div></div>";
    return h;
  }
  function akceBody() {
    if (!data.akce || !(data.akce.akce || []).length) return akNic();
    var ted = new Date(), h = akVypadek() + akFiltry(ted);
    var bezi = akBezi(state.akK, ted);
    if (bezi.length) {
      var n = bezi[0], d = akVzdTxt(akVzd(n));
      h += '<button type="button" class="card akrow" id="akbezi"><div class="akbody">' +
        '<div class="akrowt"><span class="akdot"></span>Právě probíhá</div>' +
        '<div class="akm">' + bezi.length + " " + (bezi.length === 1 ? "výstava nebo kurz" : bezi.length < 5 ? "výstavy a kurzy" : "výstav a kurzů") +
        " · nejblíž " + esc(n.t) + (d ? ", " + d : "") + "</div></div>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    }
    var list = akVOkne(state.akF, state.akK, ted);
    if (state.akF === "vse" && state.akDay) list = list.filter(function (a) {
      var s = akD(a.od); return akIso(s < akDen(ted) ? akDen(ted) : akDen(s)) === state.akDay;
    });
    if (!list.length) return h + akPrazdno(ted);
    var dny = {}, poradi = [];
    list.forEach(function (a) {
      var s = akD(a.od), k = akIso(s < akDen(ted) ? akDen(ted) : akDen(s));
      if (!dny[k]) { dny[k] = []; poradi.push(k); }
      dny[k].push(a);
    });
    poradi.forEach(function (k) {
      var d = akD(k), vse = dny[k], ukaz = state.akDenVse[k] || state.akDay ? vse : vse.slice(0, AK_DEN_MAX);
      h += '<div class="list">' + (state.akDay ? '<div class="akday akdaysel"><span><b>' + DNY_CELE[d.getDay()].charAt(0).toUpperCase() + DNY_CELE[d.getDay()].slice(1) + " " + akDatumTxt(d) + "</b><span>" +
        vse.length + " " + (vse.length < 5 ? "akce" : "akcí") + '</span></span><button type="button" class="aklink" data-akday="">Všechny dny</button></div>' : akDenNadpis(d, ted)) + ukaz.map(akKarta).join("");
      if (vse.length > ukaz.length) h += '<button type="button" class="btn-link" data-akden="' + k + '">Dalších ' + (vse.length - ukaz.length) + " " + (vse.length - ukaz.length < 5 ? "akce" : "akcí") + " " + ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"][d.getDay()] + "</button>";
      h += "</div>";
    });
    h += '<div class="note" style="padding:0 4px">Akce z kalendářů Prahy 9, Prahy 14 a Městské knihovny v Praze. Aktualizujeme dvakrát denně.</div>';
    return h;
  }
  function akHlava(nadpis, pod) {
    return '<div class="head"><button type="button" class="btn-edit" id="akback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button>" +
      (nadpis ? '<h1 style="margin-top:10px">' + nadpis + '</h1><div class="eyebrow">' + pod + "</div>" : "") + "</div>";
  }
  function viewAkceBezi() {
    var ted = new Date(), bezi = akBezi(state.akK, ted);
    var rows = bezi.map(function (a) {
      return '<button type="button" class="akbrow" data-ak="' + esc(a.id) + '"><div class="akbody"><div class="akt">' + esc(a.t) + "</div>" +
        '<div class="akm">' + I_LIVE + " · do " + akDatumTxt(akD(a.do)) + (akMisto(a, true) ? " · " + esc(akMisto(a, true)) : "") + "</div></div>" +
        akFoto(a, "akimg") + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    }).join("");
    return akHlava("Právě probíhá", "Výstavy a kurzy v Praze 9 a 14, nejbližší první") +
      '<div class="body" style="padding-bottom:28px">' + (rows ? '<div class="card akblist">' + rows + "</div>" :
        '<div class="card-dashed akempty"><div class="t1">Teď nic neprobíhá</div></div>') + "</div>" + FOOT_AK;
  }
  function akIcs(a) {
    function f(s) { return s.replace(/[-:]/g, "") + (s.length === 10 ? "" : "00"); }
    var cd = a.od.length === 10, kon = cd ? akIso(akKonec(a)) : (a.do !== a.od ? a.do : akIso(akKonec(a)) + "T" + ("0" + akKonec(a).getHours()).slice(-2) + ":" + ("0" + akKonec(a).getMinutes()).slice(-2));
    var t = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//moji-sousede//akce//CS", "BEGIN:VEVENT", "UID:" + a.id + "@moji-sousede",
      (cd ? "DTSTART;VALUE=DATE:" : "DTSTART;TZID=Europe/Prague:") + f(a.od),
      (cd ? "DTEND;VALUE=DATE:" : "DTEND;TZID=Europe/Prague:") + f(kon),
      "SUMMARY:" + a.t.replace(/[,;]/g, "\\$&"), "LOCATION:" + akMisto(a).replace(/ · [\d,]+ k?m$/, "").replace(/[,;]/g, "\\$&"),
      "URL:" + a.u, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(t);
  }
  function viewAkceDetail(a) {
    var ted = new Date(), s = akD(a.od), cas = akCasTxt(a);
    var kdy = akDlouha(a) ? (akProbiha(a, ted) ? "Probíhá do " + akDatumTxt(akD(a.do), true) : akDatumTxt(s) + " – " + akDatumTxt(akD(a.do), true)) :
      DNY_CELE[s.getDay()].charAt(0).toUpperCase() + DNY_CELE[s.getDay()].slice(1) + " " + akDatumTxt(s) + (cas ? " · " + cas : "");
    var misto = akMisto(a);
    var gm = a.lat != null ? "https://www.google.com/maps/search/?api=1&query=" + a.lat + "," + a.lon :
      (a.a ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a.a + ", Praha") : "");
    var pod = drow("Pro koho", a.pro ? a.pro.replace(/(^|, )Pro /g, "$1").replace(/^./, function (c) { return c.toUpperCase(); }) : null) + drow("Vstupné", a.free ? "Zdarma" : (a.cena || null)) + drow("Pořadatel", AK_SRC[a.src][0]);
    return akHlava() + '<div class="body" style="gap:12px;padding-bottom:28px">' +
      '<div class="dbadges">' + akChips(a, true) + "</div>" +
      '<h1 class="dname">' + esc(a.t) + "</h1>" +
      '<div class="akkdy">' + esc(kdy) + "</div>" +
      (misto ? '<div class="daddr">' + SVG(PIN, 15, "#6b6652", 2) + esc(misto) + "</div>" : "") +
      '<div class="dlinks">' + (gm ? '<a class="btn-ext" href="' + gm + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      '<a class="btn-ext" href="' + esc(a.u) + '" target="_blank" rel="noopener">Web akce ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a></div>" +
      (a.z ? '<div class="dinfo warn">' + SVG(I_INFO, 18, "#a9791a", 2.2) + "<span>Pořadatel akci zrušil.</span></div>" : "") +
      (!misto ? '<div class="dinfo warn">' + SVG(I_INFO, 18, "#a9791a", 2.2) + "<span>Kalendář u této akce neuvádí místo. Podrobnosti najdete na webu akce.</span></div>" : "") +
      akFoto(a, "akhero") +
      (a.pop ? '<div class="card dcard"><div class="dtitle">O akci</div><div class="akpop">' + esc(a.pop) + "</div></div>" : "") +
      dcard("Podrobnosti", pod) +
      (a.z ? "" : '<a class="btn akcal" href="' + akIcs(a) + '" download="akce.ics">' + SVG('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/>', 16, "currentColor", 2.2) + "Přidat do kalendáře</a>") +
      '<div class="note">Zdroj: ' + AK_SRC[a.src][0] + ". Termín se může změnit, před návštěvou ho ověřte na webu akce.</div>" +
      "</div>" + FOOT_AK;
  }
  function openAkce(view, id) {
    state.akHist.push({ v: state.akView, s: state.akSel, y: window.scrollY });
    state.akView = view; state.akSel = id || null;
    try { history.pushState({ ak: state.akHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function akKrokZpet() {
    var p = state.akHist.pop() || { v: "list", s: null, y: 0 };
    state.akView = p.v; state.akSel = p.s; render(); window.scrollTo(0, p.y || 0);
  }
  function akBack() {
    if (state.akHist.length && history.state && history.state.ak) { history.back(); return; }
    akKrokZpet();
  }

  // ---- spodní navigace ----
  var BI_ODPAD = '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>';
  var BI_SKOLY = '<path d="m22 10-10-5L2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>';
  var BI_DOPRAVA = '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/><path d="M4 11h16"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>';
  var BI_LEKARI = '<path d="M11 2a2 2 0 0 0-2 2v2a3 3 0 0 0 6 0V4a2 2 0 0 0-2-2"/><path d="M12 9v3a4 4 0 0 1-8 0v-1"/><path d="M12 9v4a4 4 0 0 0 8 0v-1"/><circle cx="20" cy="11" r="2"/><circle cx="4" cy="11" r="2"/>';
  var BI_AKCE = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
  var NAV = [["doprava", "Doprava", BI_DOPRAVA], ["odpad", "Odpad", BI_ODPAD], ["akce", "Akce", BI_AKCE], ["doktori", "Doktoři", BI_LEKARI], ["skoly", "Školy", BI_SKOLY]];
  function bottomNav() {
    return '<nav class="bnav" role="tablist">' + NAV.map(function (t) {
      var on = state.tab === t[0];
      return '<button type="button" class="' + (on ? "on" : "") + '" data-nav="' + t[0] + '" aria-selected="' + on + '">' +
        SVG(t[2], 24, "currentColor", on ? 2.2 : 2) + "<span>" + t[1] + "</span></button>";
    }).join("") + "</nav>";
  }
  function naSekci() {
    return data && state.address && !window.__err &&
      (state.tab === "odpad" || state.tab === "doprava" ||
       (state.tab === "skoly" && state.skView === "list") ||
       (state.tab === "doktori" && state.dkView === "list") ||
       (state.tab === "akce" && state.akView === "list"));
  }

  // ---- vykreslení a události ----
  function render(keepFocus) {
    var html;
    if (!data) html = window.__err ? viewOffline() : viewLoading();
    else if (!state.address) html = viewSearch();
    else if (state.tab === "skoly" && data.skoly && state.skView === "detail" && skById(state.skSel)) html = viewSkolaDetail(skById(state.skSel));
    else if (state.tab === "skoly" && data.skoly && state.skView === "full") html = viewSkolyFull();
    else if (state.tab === "doktori" && data.doktori && state.dkView === "detail" && dkById(state.dkSel)) html = viewDoktorDetail(dkById(state.dkSel));
    else if (state.tab === "doktori" && data.doktori && state.dkView === "full") html = viewDoktoriFull();
    else if (state.tab === "akce" && data.akce && state.akView === "detail" && akById(state.akSel)) html = viewAkceDetail(akById(state.akSel));
    else if (state.tab === "akce" && data.akce && state.akView === "bezi") html = viewAkceBezi();
    else html = viewResult();
    if (data && state.address && state.tab === "skoly" && state.skSheet && state.skView !== "detail") html += sheetHtml();
    if (data && state.address && state.tab === "akce" && state.akView === "list" && state.akKal) html += akKalendar();
    if (naSekci()) html += bottomNav();
    app.innerHTML = html;
    var q = document.getElementById("q");
    if (q) {
      if (keepFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      q.addEventListener("input", function () {
        state.query = q.value;
        var t = q.value.trim(), res = t.length >= 2 ? search(q.value) : [], none = t.length >= 2 && !res.length;
        q.classList.toggle("bad", none);
        q.classList.toggle("has-clear", t.length >= 2);
        document.getElementById("clr").hidden = t.length < 2;
        document.getElementById("sres").innerHTML = searchRes(res, none);
        bindSugg(res);
      });
      bindSugg(state.query.trim().length >= 2 ? search(state.query) : []);
      document.getElementById("clr").addEventListener("click", function () {
        state.query = ""; q.value = ""; q.classList.remove("bad", "has-clear"); this.hidden = true;
        document.getElementById("sres").innerHTML = searchRes([], false);
        q.focus();
      });
    }
    app.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.getAttribute("data-tab"); state.skView = "list"; state.skHist = []; render(); window.scrollTo(0, 0); }); });
    app.querySelectorAll("[data-skf]").forEach(function (b) { b.addEventListener("click", function () { state.skF = b.getAttribute("data-skf"); render(); }); });
    app.querySelectorAll("[data-skz]").forEach(function (b) { b.addEventListener("click", function () { state.skZ = b.getAttribute("data-skz"); render(); }); });
    app.querySelectorAll("[data-skm]").forEach(function (b) { b.addEventListener("click", function () { state.skM = b.getAttribute("data-skm"); render(); }); });
    app.querySelectorAll("[data-sheet]").forEach(function (b) { b.addEventListener("click", function () { state.skSheet = true; render(); }); });
    app.querySelectorAll("[data-sheetclose]").forEach(function (b) { b.addEventListener("click", function () { state.skSheet = false; render(); }); });
    var rs = document.getElementById("skreset");
    if (rs) rs.addEventListener("click", function () { state.skF = "all"; state.skZ = "all"; state.skM = "all"; render(); });
    app.querySelectorAll("[data-sk]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.preventDefault(); openSkola(b.getAttribute("data-sk")); }); });
    var sv = document.getElementById("spadvic");
    if (sv) sv.addEventListener("click", function () { var y = window.scrollY; state.spadVse = !state.spadVse; render(); window.scrollTo(0, y); });
    var dv = document.getElementById("dopvic");
    if (dv) dv.addEventListener("click", function () { var y = window.scrollY; state.dopVse = !state.dopVse; render(); window.scrollTo(0, y); });
    var wc = document.getElementById("warncist");
    if (wc) wc.addEventListener("click", function () { state.tab = "doprava"; render(); window.scrollTo(0, 0); });
    var sf = document.getElementById("skfull");
    if (sf) sf.addEventListener("click", function () { state.skView = "full"; render(); window.scrollTo(0, 0); });
    var sb = document.getElementById("skback");
    if (sb) sb.addEventListener("click", function () { skBack(); });
    var sq = document.getElementById("skq");
    if (sq) sq.addEventListener("input", function () { state.skQ = sq.value; document.getElementById("sklist").innerHTML = skolyListHtml(); app.querySelectorAll("#sklist [data-sk]").forEach(function (b) { b.addEventListener("click", function () { openSkola(b.getAttribute("data-sk")); }); }); });
    app.querySelectorAll("[data-nav]").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.getAttribute("data-nav"); state.skView = "list"; state.skHist = []; state.dkView = "list"; state.dkHist = []; state.akView = "list"; state.akHist = []; render(); window.scrollTo(0, 0); }); });
    app.querySelectorAll("[data-dk]").forEach(function (b) { b.addEventListener("click", function () { openDoktor(b.getAttribute("data-dk")); }); });
    app.querySelectorAll("[data-dkf]").forEach(function (b) { b.addEventListener("click", function () { state.dkF = b.getAttribute("data-dkf"); render(); }); });
    var df = document.getElementById("dkfull");
    if (df) df.addEventListener("click", function () { state.dkView = "full"; render(); window.scrollTo(0, 0); });
    var db = document.getElementById("dkback");
    if (db) db.addEventListener("click", function () { dkBack(); });
    var dq = document.getElementById("dkq");
    if (dq) dq.addEventListener("input", function () { state.dkQ = dq.value; document.getElementById("dklist").innerHTML = dkListHtml(); app.querySelectorAll("#dklist [data-dk]").forEach(function (b) { b.addEventListener("click", function () { openDoktor(b.getAttribute("data-dk")); }); }); });
    app.querySelectorAll("[data-ak]").forEach(function (b) { b.addEventListener("click", function () { openAkce("detail", b.getAttribute("data-ak")); }); });
    app.querySelectorAll("[data-akf]").forEach(function (b) { b.addEventListener("click", function () { state.akF = b.getAttribute("data-akf"); state.akDenVse = {}; state.akDay = null; state.akScroll = 0; render(); }); });
    app.querySelectorAll("[data-akday]").forEach(function (b) { b.addEventListener("click", function () {
      var v = b.getAttribute("data-akday") || null; state.akF = "vse"; state.akDay = state.akDay === v ? null : v;
      if (!b.classList.contains("akdb")) state.akCenter = true;   // „Zobrazit nejbližší“ může skočit daleko
      render();
    }); });
    var akk = document.getElementById("akkal");
    if (akk) akk.addEventListener("click", function () { var d = state.akDay ? akD(state.akDay) : new Date(); state.akKalM = akIso(new Date(d.getFullYear(), d.getMonth(), 1)); state.akKalSel = state.akDay; state.akKal = true; render(); });
    app.querySelectorAll("[data-akkalclose]").forEach(function (b) { b.addEventListener("click", function () { state.akKal = false; render(); }); });
    app.querySelectorAll("[data-akkalm]").forEach(function (b) { b.addEventListener("click", function () { var d = akD(state.akKalM); state.akKalM = akIso(new Date(d.getFullYear(), d.getMonth() + +b.getAttribute("data-akkalm"), 1)); render(); }); });
    app.querySelectorAll("[data-akkalday]").forEach(function (b) { b.addEventListener("click", function () { state.akKalSel = b.getAttribute("data-akkalday"); render(); }); });
    var akdn = document.getElementById("akdnes");
    if (akdn) akdn.addEventListener("click", function () { state.akDay = null; state.akScroll = 0; render(); });
    var akkdn = document.getElementById("akkaldnes");
    if (akkdn) akkdn.addEventListener("click", function () { var t = new Date(); state.akKalM = akIso(new Date(t.getFullYear(), t.getMonth(), 1)); state.akKalSel = akIso(t); render(); });
    var akok = document.getElementById("akkalok");
    if (akok) akok.addEventListener("click", function () { state.akDay = state.akKalSel; state.akF = "vse"; state.akKal = false; state.akCenter = true; render(); window.scrollTo(0, 0); });
    var akpr = app.querySelector(".akdny");
    if (akpr) {
      // měsíc v nadpisu se mění podle toho, kam je proužek odscrollovaný
      var akMes = function () {
        // měsíc podle dne uprostřed viditelné části proužku
        var r = akpr.getBoundingClientRect(), hr = r.left + Math.min(r.width, window.innerWidth) / 2, el = null;
        akpr.querySelectorAll(".akdb").forEach(function (b) { if (!el && b.getBoundingClientRect().right > hr) el = b; });
        var t = document.getElementById("akmes");
        if (el && t) t.textContent = el.getAttribute("data-m");
        // „Dnes“ jen když dnešek z proužku zmizel nebo je vybraný jiný den
        var dn = document.getElementById("akdnes");
        if (dn) dn.hidden = !(akpr.scrollLeft > 40 || (state.akDay && state.akDay !== akIso(new Date())));
      };
      var akdon = akpr.querySelector(".akdb.on");
      // po výběru v kalendáři vycentrovat vybraný den; klepnutí v proužku s ním nehýbe
      akpr.scrollLeft = state.akCenter && akdon ? akdon.offsetLeft - akpr.offsetLeft - (akpr.clientWidth - akdon.offsetWidth) / 2 : (state.akScroll || 0);
      if (state.akCenter) { state.akCenter = false; state.akScroll = akpr.scrollLeft; }
      akpr.addEventListener("scroll", function () { state.akScroll = akpr.scrollLeft; akMes(); }, { passive: true });
      akMes();
    }
    app.querySelectorAll("[data-akk]").forEach(function (b) { b.addEventListener("click", function () { state.akK = b.getAttribute("data-akk"); render(); }); });
    app.querySelectorAll("[data-akden]").forEach(function (b) { b.addEventListener("click", function () { var y = window.scrollY; state.akDenVse[b.getAttribute("data-akden")] = true; render(); window.scrollTo(0, y); }); });
    var akb = document.getElementById("akbezi");
    if (akb) akb.addEventListener("click", function () { openAkce("bezi"); });
    var akon = app.querySelector("[data-akk].on");
    if (akon && akon.scrollIntoView && state.akK !== "all") akon.scrollIntoView({ block: "nearest", inline: "center" });
    var akx = document.getElementById("akback");
    if (akx) akx.addEventListener("click", function () { akBack(); });
    var e = document.getElementById("edit");
    if (e) e.addEventListener("click", function () { clear(); state.address = null; state.query = ""; state.tab = "doprava"; state.skView = "list"; state.skHist = []; state.dkView = "list"; state.dkHist = []; state.akView = "list"; state.akHist = []; render(); var i = document.getElementById("q"); if (i) i.focus(); });
    var r = document.getElementById("retry");
    if (r) r.addEventListener("click", boot);
  }
  function bindSugg(res) {
    app.querySelectorAll(".sugg button").forEach(function (b) { b.addEventListener("click", function () { pick(res[+b.getAttribute("data-i")]); }); });
  }
  function pick(a) {
    if (!a) return;
    state.address = { label: label(a), lat: a[3], lon: a[4], mc: a[5] || "14", street: a[0], cp: a[1], co: a[2] || "", part: a[6] || "" };
    save(state.address);
    state.tab = "doprava";   // po zadání adresy ukázat nejdřív dopravu (první záložka)
    render();
    window.scrollTo(0, 0);
  }

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function boot() {
    window.__err = false; data = null; render();
    Promise.all([getJSON("data/stations.json"), getJSON("data/addresses.json"), getJSON("data/hazard.json").catch(function () { return null; }), getJSON("data/vok.json").catch(function () { return null; }), getJSON("data/vok9.json").catch(function () { return null; }), getJSON("data/outages.json").catch(function () { return null; }), getJSON("data/skoly.json").catch(function () { return null; }), getJSON("data/skoly_extra.json").catch(function () { return null; }), getJSON("data/skoly_web.json").catch(function () { return null; }), getJSON("data/spadovost.json").catch(function () { return null; }), getJSON("data/doprava.json").catch(function () { return null; }), getJSON("data/doktori.json").catch(function () { return null; }), getJSON("data/nehody.json").catch(function () { return null; }), getJSON("data/akce.json").catch(function () { return null; })]).then(function (v) {
      data = { stations: v[0], addresses: v[1], hazard: v[2], vok: v[3], vok9: v[4], outages: v[5], skoly: v[6], skolyExtra: v[7], skolyWeb: v[8], spad: v[9], doprava: v[10], doktori: v[11], nehody: v[12], akce: v[13] };
      if (data.skoly) data.skoly.forEach(function (x, i) { if (!x.id) x.id = "i" + i; if (data.skolyWeb && data.skolyWeb[x.id]) x.w = data.skolyWeb[x.id]; });
      buildIndex();
      state.address = load();
      render();
    }).catch(function () { window.__err = true; render(); });
  }
  boot();
})();
