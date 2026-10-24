"use strict";
(function () {
  var RADIUS = 1000;
  var KEY = "praha14.address";
  var app = document.getElementById("app");
  var data = null;       // {stations, addresses}
  var state = { address: null, query: "", tab: "domu", okSeg: "doktori", vodaSel: null, patSel: null, vodaZ: null, stView: "list", stHist: [], stSel: null, stF: "all", stM: "all", stVse: {}, domuVse: false, skF: "all", skZ: "all", skM: "all", skView: "list", skHist: [], skSel: null, skQ: "", sheet: null, spadVse: false, dopVse: false,
    dkView: "list", dkHist: [], dkSel: null, dkF: "all", dkM: "all", dkQ: "",
    akView: "list", akHist: [], akSel: null, akF: "vse", akK: "all", akM: "all", akDenVse: {}, akDay: null, akKal: false, akKalM: null, akKalSel: null };

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
  // víc uložených adres: {list: [{...adresa, nazev, upoz}], akt}; starší jedna adresa se převede na „Domov“
  var KEY_ADR = "podokny-adresy", ADR_MAX = 5;
  function adrNacti() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY_ADR)); } catch (e) {}
    if (!v || !v.list || !v.list.length) { var a = load(); v = a ? { list: [Object.assign({ nazev: "Domov", upoz: true }, a)], akt: 0 } : { list: [], akt: 0 }; }
    if (v.akt >= v.list.length) v.akt = 0;
    return v;
  }
  function adrUloz(v) { try { localStorage.setItem(KEY_ADR, JSON.stringify(v)); } catch (e) {} if (v.list[v.akt]) save(v.list[v.akt]); }

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
    var h = (state.adrPridat ? '<div class="head"><button type="button" class="btn-edit" id="adrzpet" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button>" +
      '<div class="eyebrow" style="margin-top:12px">Moje adresy</div><h1>Přidat adresu</h1><div class="sub">Rodiče, práce, škola dětí… Najděte adresu v Praze 9 nebo 14.</div></div><div class="body">' :
      '<div class="head"><div class="eyebrow">Praha 9 a 14</div><h1>Pod okny</h1>' +
      '<div class="sub">Zadejte adresu a uvidíte, co se u vás děje: odstávky vody, svoz odpadu, uzavírky, akce, lékaře a školy v okolí.</div></div><div class="body">') +
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
    return '<button type="button" class="card row top uzk" data-tv="' + tvId(o) + '" style="background:#fff8ec;border-color:#f0d9a8"><span class="badge" style="background:#fbe3d4">' + SVG(DROP, 18, "#b8582a") + '</span><span class="grow">' +
      '<span class="t1">Odstávka teplé vody <span class="chip">' + chip + '</span></span><span class="t2">' + esc(o.name) + " · " + outageRange(o) + '</span>' +
      '<span class="note">Dodávku teplé vody přerušuje Pražská teplárenská kvůli plánovaným pracím.</span></span>' + SVG(I_CHEV, 16, "#9a9484", 2.4) + "</button>";
  }
  function outageNone(addr) {
    if (!data.outages || outageFor(addr)) return "";
    return '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(DROP, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Odstávka teplé vody</div>' +
      '<div class="note" style="margin-top:2px">Pro vaši lokalitu teď žádná plánovaná odstávka není. Letní odstávky bývají v červenci a srpnu.</div>' +
      '<div class="links"><a class="link" href="https://udalosti.vecr.cz/udalosti/pte.html" target="_blank" rel="noopener">Aktuální poruchy ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
  }

  function viewResult() {
    var a = state.address, r = results(a);
    var av = adrNacti(), vic = av.list.length > 1, nz = vic && av.list[av.akt] ? av.list[av.akt].nazev : "Vaše adresa";
    var h = '<div class="head addr"><div><div class="eyebrow">' + esc(nz) + '</div>' + (vic ? '<button type="button" class="addr-name adrsw" id="adrsw">' + esc(a.label) + SVG('<path d="m6 9 6 6 6-6"/>', 20, "currentColor", 2.4) + "</button>" : '<div class="addr-name">' + esc(a.label) + "</div>") + "</div>" +
      '<button type="button" class="btn-edit" id="edit" aria-label="Změnit adresu">' + SVG('<path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 13, "currentColor", 2.3) + "Změnit</button></div>";
    if (state.tab === "domu") return h + '<div class="body" style="gap:12px">' + domuBody(a) + "</div>" + FOOT_DOMU;
    if (state.tab === "skoly") return h + '<div class="body">' + okoliSeg() + skolyBody(a) + "</div>" + FOOT_SK;
    if (state.tab === "doprava") return h + '<div class="body">' + dopravaBody(a) + "</div>" + FOOT_DO;
    if (state.tab === "doktori") return h + '<div class="body">' + okoliSeg() + doktoriBody(a) + "</div>" + FOOT_DK;
    if (state.tab === "akce") return h + '<div class="body">' + akceBody() + "</div>" + FOOT_AK;
    if (state.tab === "stavby") return h + '<div class="body">' + okoliSeg() + stavbyBody(a) + "</div>" + FOOT_ST;
    h += '<div class="body">';
    h += cisteniPruh(a);
    h += '<div class="label">Voda, elektřina a teplo</div>' + vodaKarta(a) + elKarta(a) + outageTop(a) + outageNone(a);
    if (!r.near.length) {
      h += '<div class="card-dashed row top"><span class="badge" style="background:#efece2">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#6b6652") +
        '</span><div class="grow"><div class="t1">V okruhu 1 km jsme nenašli žádné stanoviště tříděného odpadu</div><div class="note">Další stanoviště můžete hledat v mapě KSNKO.</div>' +
        '<div class="links"><a class="link" href="https://ksnko.praha.eu/map-bulky/" target="_blank" rel="noopener">Mapa KSNKO ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
    } else {
      var n = r.near[0], types = TYPES.filter(function (t) { return n.s.t[t.id]; }).map(function (t) { return t.name.split(" a ")[0].toLowerCase(); });
      h += '<div class="label" style="margin-top:6px">Odpad a kontejnery</div><div class="card row near"><span class="badge" style="background:#e9f0e9">' + SVG(PIN, 19, "#1f4d36", 2.1) + '</span><div><div class="eyebrow">Nejbližší kontejner</div>' +
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
  // Jednotné filtry (Lékaři, Školy, Stavby, Akce): tlačítko Filtry s panelem + chipy v jedné řadě
  // [Filtry] [Vše] [Praha 9] [Praha 14] [typy…]. Vše ruší městskou část i typ. Odznak na Filtrech
  // počítá jen filtry, které v řadě chipů nejsou vidět (Zřizovatel u škol).
  var MC_OPT = [["all", "Praha 9 i 14"], ["9", "Praha 9"], ["14", "Praha 14"]];
  var FB = {
    dk: { f: "dkF", m: "dkM", t: "Obor", o: function () { return DK_CHIPS; }, x: [], n: ["lékař", "lékaři", "lékařů"], c: function () { return dkCount(); } },
    sk: { f: "skF", m: "skM", t: "Typ školy", o: function () { return SK_CHIPS; }, x: [["Zřizovatel", SK_Z, "skZ"]], n: ["místo", "místa", "míst"], c: function () { return skCount(); } },
    st: { f: "stF", m: "stM", t: "Typ stavby", o: function () { return [["all", "Vše"]].concat(ST_FILTRY.slice(1).map(function (k) { return [k, ST_KAT[k][0]]; })); }, x: [], n: ["stavba", "stavby", "staveb"], c: function () { return stCount(); } },
    ak: { f: "akK", m: "akM", t: "Kategorie", o: function () { return akTypy(); }, x: [], n: ["akce", "akce", "akcí"], c: function () { return akCount(); } }
  };
  // Návrh (Airbnb): jeden rozbalovací chip na každý rozměr. Bez výběru ukazuje název rozměru,
  // po výběru hodnotu. Klepnutí otevře spodní panel s volbami a počtem výsledků; výběr platí hned.
  var I_DOWN = '<path d="m6 9 6 6 6-6"/>';
  var FB_CHIP = { dk: "Obor", sk: "Typ", st: "Typ", ak: "Kategorie" };
  // tvary pro chip při více volbách: „2 obory“, „3 kategorie“, „2 zřizovatelé“
  var FB_N = { dkF: ["obor", "obory", "oborů"], skF: ["typ", "typy", "typů"], stF: ["typ", "typy", "typů"], akK: ["kategorie", "kategorie", "kategorií"], skZ: ["zřizovatel", "zřizovatelé", "zřizovatelů"] };
  // Skupiny filtrů = chipy v řadě. Městská část: jedna volba (radio, platí hned).
  // Druhý chip: typ (u škol i zřizovatel v témže panelu), více voleb (checkboxy).
  function fSkup(k) {
    var d = FB[k];
    return [
      { key: d.m, t: "Městská část", chip: "Městská část", radio: true, dims: [[d.m, "", MC_OPT]] },
      { key: d.f, t: d.x.length ? d.t + " a " + d.x.map(function (x) { return x[0].toLowerCase(); }).join(", ") : d.t, chip: FB_CHIP[k], radio: false,
        dims: [[d.f, d.t, d.o().slice(1)]].concat(d.x.map(function (x) { return [x[2], x[0], x[1].slice(1)]; })) }
    ];
  }
  function fIn(cur, v) { return cur === "all" || cur.split(",").indexOf(v) >= 0; }
  function fVyber(key) { return state[key] === "all" ? [] : state[key].split(","); }
  function fPocet(k, key, v) { var old = state[key]; state[key] = v; var n = FB[k].c(); state[key] = old; return n; }
  function fChipTxt(g) {
    var casti = [];
    g.dims.forEach(function (dm) {
      var vy = fVyber(dm[0]);
      if (!vy.length) return;
      if (vy.length > 1) { casti.push(pl(vy.length, FB_N[dm[0]][0], FB_N[dm[0]][1], FB_N[dm[0]][2])); return; }
      var o = dm[2].filter(function (c) { return c[0] === vy[0]; })[0];
      casti.push(o ? o[2] || o[1] : vy[0]);
    });
    return casti.map(function (c, i) { return i ? c.charAt(0).toLowerCase() + c.slice(1) : c; }).join(", ");
  }
  function fBar(k) {
    var gs = fSkup(k), akt = gs.some(function (g) { return g.dims.some(function (dm) { return state[dm[0]] !== "all"; }); });
    return '<div class="ddrow">' + gs.map(function (g) {
      var txt = fChipTxt(g);
      return '<button type="button" class="dd' + (txt ? " on" : "") + '" data-sheet="' + k + ":" + g.key + '" aria-haspopup="dialog"><span>' + (txt || g.chip) + "</span>" + SVG(I_DOWN, 14, "currentColor", 2.6) + "</button>";
    }).join("") + (akt ? '<button type="button" class="ddclr" data-freset="' + k + '" aria-label="Zrušit filtry">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 16, "currentColor", 2.6) + "</button>" : "") + "</div>";
  }
  function fSheet(sk) {
    var p = sk.split(":"), k = p[0], g = fSkup(k).filter(function (x) { return x.key === p[1]; })[0];
    if (!g) return "";
    var n = FB[k].c(), N = FB[k].n, vybrano = g.dims.some(function (dm) { return state[dm[0]] !== "all"; });
    var h = g.dims.map(function (dm) {
      var vy = fVyber(dm[0]);
      return (g.dims.length > 1 ? '<div class="shtitle fsec">' + dm[1] + "</div>" : "") + '<div class="fopts">' + dm[2].map(function (c) {
        var cnt = fPocet(k, dm[0], c[0]), on = g.radio ? state[dm[0]] === c[0] : vy.indexOf(c[0]) >= 0;
        return '<button type="button" class="fopt' + (g.radio ? "" : " chk") + (on ? " on" : "") + (cnt ? "" : " nula") + '" ' + (g.radio ? "data-fs" : "data-fc") + '="' + dm[0] + '" data-v="' + c[0] + '" role="' + (g.radio ? "radio" : "checkbox") + '" aria-checked="' + on + '">' +
          '<span class="grow">' + c[1] + '</span><span class="fcnt">' + cnt + "</span><i>" + (g.radio ? "" : SVG('<path d="m5 12 5 5 9-10"/>', 14, "#fff", 3)) + "</i></button>";
      }).join("") + "</div>";
    }).join("");
    return '<div class="sheet-bg" data-sheetclose="1"></div><div class="sheet" role="dialog" aria-label="' + g.t + '"><div class="grab"></div>' +
      '<div class="shhead"><div class="shh">' + g.t + '</div><button type="button" class="shx" data-sheetclose="1" aria-label="Zavřít">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 16, "currentColor", 2.4) + "</button></div>" + h +
      (g.radio ? "" : '<div class="shfoot"><button type="button" class="shreset" data-fcclr="' + g.dims.map(function (dm) { return dm[0]; }).join(",") + '"' + (vybrano ? "" : " disabled") + '>Zrušit výběr</button><button type="button" class="btn shgo" data-sheetclose="1">Zobrazit ' + pl(n, N[0], N[1], N[2]) + "</button></div>") + "</div>";
  }
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
  function skActive() { return state.skZ !== "all" ? 1 : 0; }
  function skMatch(s) {
    return fIn(state.skF, s.t) && fIn(state.skZ, s.z) && (state.skM === "all" || s.mc === state.skM);
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
    if (state.skF !== "all" && fIn(state.skF, "zs")) {
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
  function filterBar() { return fBar("sk"); }
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
  function viewLoading() { return '<div class="head"><div class="eyebrow">Praha 9 a 14</div><h1>Pod okny</h1></div><div class="body"><div class="skel"></div><div class="skel"></div></div>'; }

  // Z detailu se dá otevřít další detail (odkaz na spádovou školu), proto zásobník,
  // ne jedna předchozí obrazovka – jinak by se zpět vracelo samo na sebe.
  function openSkola(id) {
    state.skHist.push({ v: state.skView, s: state.skSel, y: window.scrollY });
    state.skView = "detail"; state.skSel = id; state.sheet = null; state.spadVse = false;
    try { history.pushState({ sk: state.skHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function oKrokZpet() {
    var p = state.skHist.pop() || { v: "list", s: null, y: 0 };
    state.skView = p.v; state.skSel = p.s; state.sheet = null; state.spadVse = false;
    render(); window.scrollTo(0, p.y || 0);
  }
  function skBack() {
    // přes historii, ať tlačítko v aplikaci a tlačítko zpět v prohlížeči zůstanou v souladu
    if (state.skHist.length && history.state && history.state.sk) { history.back(); return; }
    oKrokZpet();
  }
  window.addEventListener("popstate", function () {
    if (state.zav && state.zav !== "list" && state.zav !== "par") { state.zav = "list"; render(); window.scrollTo(0, 0); }
    else if (state.vodaSel || state.patSel || state.zav || state.uzSel || state.tvSel) vodaKrokZpet();
    else if (state.tab === "akce" && state.akHist.length) akKrokZpet();
    else if (state.tab === "doktori" && state.dkHist.length) dkKrokZpet();
    else if (state.tab === "stavby" && state.stHist.length) stKrokZpet();
    else if (state.skHist.length) oKrokZpet();
  });

  // ---- doprava: blokové čištění, uzavírky a práce, výluky PID ----
  // Znění zdroje NDIC je dané podmínkami ŘSD, neměnit.
  var NDIC_ZDROJ = "Zdrojem digitalizovaných informací o silničním provozu je NDIC";
  var FOOT_DO = '<div class="foot">' + NDIC_ZDROJ +
    ' · Zdroj dat: PID (Golemio) · praha9.cz · praha14.cz · TSK (rozpisy blokového čištění, zóny placeného stání přes Golemio) · parking.praha.eu</div>';
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
    if (od && !aDo) return "od " + fmtDate(od);
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
    var dnesIso = den0().toISOString().slice(0, 10);
    // opatření úřadů (přechodné úpravy provozu): ze stavebních řízení i z dopravních odborů; stejný odkaz jen jednou
    var vid = {}, oop = (data.opatreni && data.opatreni.oop || []).concat(data.rizeni && data.rizeni.oop || []).filter(function (x) {
      if (vid[x.u] || (x.do && x.do < dnesIso)) return false;
      vid[x.u] = 1; return true;
    });
    return (data.doprava.uzavirky || []).concat(oop).map(function (x) {
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
      h += parkovaniKarta(a);
      h += mimoDosah();
      return h;
    }
    // pořadí: co se právě děje nahoře (MHD výluky, blokové čištění), klidové sekce dole
    var mhd = mhdSekce(pi);
    if (pi.v.length) h += mhd;
    if (c) h += cisteniKarta(a);
    var neh = nehodyPro(a);
    if (neh.length) {
      h += '<div class="label" id="nehody" style="scroll-margin-top:16px">Nehody a mimořádné události</div>';
      h += '<div class="note" style="margin:-2px 2px 8px">Evidenci kontrolujeme každých 10 minut, ' +
        nehCas() + " — nehoda už přesto může být odklizená.</div>";
      h += '<div class="list">' + neh.map(function (r) {
        var x = r.x;
        return dkarta(I_CRASH, "#fdeedd", "#a2600f",
          esc(x.ul && x.ul.length ? vyjmenuj(x.ul) : x.n), null,
          '<div class="t2">' + esc(x.n) + (r.d != null ? " · " + meters(r.d) : "") + "</div>" +
          (x.p ? '<div class="t3">' + esc(zkrat(datumy(x.p), 150)) + "</div>" : ""),
          "Evidence dopravních informací (NDIC)", x.u, "Mapa dopravních informací");
      }).join("") + "</div>";
    }
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
        return '<button type="button" class="card row top uzk" data-uz="' + uzId(x) + '"><span class="badge" style="background:' + bg + '">' + SVG(I_CONE, 18, fg) + "</span>" +
          '<span class="grow"><span class="dhead"><span class="t1">' + esc(x.ul && x.ul.length ? vyjmenuj(x.ul) : x.n) + "</span>" + dtag(x) + "</span>" +
          '<span class="t2">' + obdobi(x.od, x.do) + (r.d != null ? " · " + meters(r.d) : "") + "</span>" +
          (x.ul && x.ul.length ? '<span class="t3">' + esc(x.n) + "</span>" : "") +
          (popis(x) ? '<span class="t3">' + esc(zkrat(datumy(popis(x)), 150)) + "</span>" : "") +
          (ndic ? '<span class="dsrc">Evidence dopravních informací (NDIC)</span>' : "") + "</span>" + SVG(I_CHEV, 16, "#9a9484", 2.4) + "</button>";
      }).join("") + "</div>";
      if (uz.length > DOP_N) h += '<button type="button" class="spadvic" id="dopvic">' +
        (state.dopVse ? "Zobrazit méně" : "Zobrazit všech " + uz.length + " " + sklonCount(uz.length)) +
        SVG(state.dopVse ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    }
    h += parkovaniKarta(a);
    if (!pi.v.length) h += mhd;
    if (!c) h += cisteniKarta(a);
    h += mimoDosah();
    return h;
  }
  function mhdSekce(pi) {
    var h = '<div class="label">MHD v okolí</div>';
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
    return h;
  }
  // v článcích bývá za popisem ještě zhotovitel a telefon; do karty se to neplete
  function datumy(t) { return String(t || "").replace(/\b(\d{1,2}):(\d{1,2}):(\d{4})\b/g, function (m, d, mo, y) { return +d + ". " + +mo + ". " + y; }); }
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
  function dkMatch(s) { return fIn(state.dkF, s.o) && (state.dkM === "all" || s.mc === state.dkM); }
  function dkCount() { return state.dkView === "full" ? dkFull().length : dkNear(state.address).length; }
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
  function dkFilterBar() { return fBar("dk"); }
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
  // mc: městská část z filtru v záložce Akce (Domů filtr nepoužívá)
  function akVOkne(f, k, ted, mc) {
    var w = akOkno(f, ted);
    return akVse(ted).filter(function (a) {
      if (!fIn(k, a.k)) return false;
      if (mc && mc !== "all" && a.mc !== mc) return false;
      if (akProbiha(a, ted)) return false;
      var s = akD(a.od);
      if (akDlouha(a)) return s >= w[0] && s < w[1];   // dlouhá akce, která teprve začne
      return s < w[1] && akKonec(a) > w[0] && (s >= w[0] || akKonec(a) > ted);
    }).sort(function (x, y) { return x.od < y.od ? -1 : x.od > y.od ? 1 : 0; });
  }
  function akBezi(k, ted, mc) {
    return akVse(ted).filter(function (a) { return akProbiha(a, ted) && fIn(k, a.k) && (!mc || mc === "all" || a.mc === mc); })
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
  function akTypy() {
    var pritomne = {};
    akVse(new Date()).forEach(function (a) { pritomne[a.k] = 1; });
    return [["all", "Vše"]].concat(AK_KPOR.filter(function (k) { return pritomne[k]; }).map(function (k) { return [k, AK_K[k][0]]; }));
  }
  function akSeznam(ted) {
    var list = akVOkne(state.akF, state.akK, ted, state.akM);
    if (state.akF === "vse" && state.akDay) list = list.filter(function (a) {
      var s = akD(a.od); return akIso(s < akDen(ted) ? akDen(ted) : akDen(s)) === state.akDay;
    });
    return list;
  }
  function akCount() { var ted = new Date(); return akSeznam(ted).length + akBezi(state.akK, ted, state.akM).length; }
  function akFiltry(ted) {
    var seg = '<div class="akseg" role="tablist">' + AK_CAS.map(function (c) {
      var on = state.akF === c[0];
      return '<button type="button" role="tab" aria-selected="' + on + '" class="' + (on ? "on" : "") + '" data-akf="' + c[0] + '">' + c[1] + "</button>";
    }).join("") + "</div>";
    return seg + (state.akF === "vse" ? akProuzek(ted) : "") + fBar("ak");
  }
  // dny, ve kterých se něco koná (podle zvolené kategorie): iso -> počet
  function akDnyAkci(ted) {
    var m = {};
    akVOkne("vse", state.akK, ted, state.akM).forEach(function (a) {
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
    var vk = fVyber("akK"), co = !vk.length ? "" : vk.length === 1 ? " v kategorii " + AK_K[vk[0]][0].toLowerCase() : " ve vybraných kategoriích";
    var dalsi = akVOkne("vse", state.akK, ted, state.akM).filter(function (a) { return !state.akDay || a.od.slice(0, 10) > state.akDay; }), nej = dalsi[0];
    var vsech = state.akK === "all" ? 0 : akVOkne(state.akF, "all", ted, state.akM).length;
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
    var bezi = akBezi(state.akK, ted, state.akM);
    if (bezi.length) {
      var n = bezi[0], d = akVzdTxt(akVzd(n));
      h += '<button type="button" class="card akrow" id="akbezi"><div class="akbody">' +
        '<div class="akrowt"><span class="akdot"></span>Právě probíhá</div>' +
        '<div class="akm">' + bezi.length + " " + (bezi.length === 1 ? "výstava nebo kurz" : bezi.length < 5 ? "výstavy a kurzy" : "výstav a kurzů") +
        " · nejblíž " + esc(n.t) + (d ? ", " + d : "") + "</div></div>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    }
    var list = akSeznam(ted);
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
    var ted = new Date(), bezi = akBezi(state.akK, ted, state.akM);
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
    var t = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//pod-okny//akce//CS", "BEGIN:VEVENT", "UID:" + a.id + "@pod-okny",
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
      '<a class="btn-ext" href="' + esc(a.u) + '" target="_blank" rel="noopener">Web akce ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("ak", a.id) + "</div>" +
      (a.z ? '<div class="dinfo warn">' + SVG(I_INFO, 18, "#a9791a", 2.2) + "<span>Pořadatel akci zrušil.</span></div>" : "") +
      (!misto ? '<div class="dinfo warn">' + SVG(I_INFO, 18, "#a9791a", 2.2) + "<span>Kalendář u této akce neuvádí místo. Podrobnosti najdete na webu akce.</span></div>" : "") +
      akFoto(a, "akhero") +
      (a.pop ? '<div class="card dcard"><div class="dtitle">O akci</div><div class="akpop">' + esc(a.pop) + "</div></div>" : "") +
      dcard("Podrobnosti", pod) +
      (a.z ? "" : '<a class="btn akcal" href="' + akIcs(a) + '" download="akce.ics">' + SVG('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/>', 16, "currentColor", 2.2) + "Přidat do kalendáře</a>") +
      '<div class="note">Zdroj: ' + AK_SRC[a.src][0] + ". Termín se může změnit, před návštěvou ho ověřte na webu akce.</div>" +
      "</div>" + FOOT_AK;
  }
  function openAkce(view, id, odkud) {
    // odkud = záložka, kam se má Zpět vrátit (např. detail otevřený z Domů)
    state.akHist.push({ v: state.akView, s: state.akSel, y: window.scrollY, tab: odkud || null });
    state.akView = view; state.akSel = id || null;
    try { history.pushState({ ak: state.akHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function akKrokZpet() {
    var p = state.akHist.pop() || { v: "list", s: null, y: 0 };
    state.akView = p.v; state.akSel = p.s;
    if (p.tab) state.tab = p.tab;
    render(); window.scrollTo(0, p.y || 0);
  }
  function akBack() {
    if (state.sdil) { sdilKonec(); return; }
    if (state.akHist.length && history.state && history.state.ak) { history.back(); return; }
    akKrokZpet();
  }

  // ---- voda: odstávky a havárie PVK ----
  var I_NOWATER = '<path d="M12 2.7s6 6.1 6 10.8a6 6 0 0 1-12 0C6 8.8 12 2.7 12 2.7Z"/><path d="m4 4 16 16"/>';
  var I_TRUCK = '<rect x="2" y="8" width="13" height="8" rx="4"/><path d="M15 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>';
  var PVK_MAPA = "https://mapy.veoliavoda.cz/udalosti/?branch=PVK";
  // Odkaz přímo na špendlík události. Mapa PVK bere „bookmark“ = base64("zoom;lat;lon"), díky kterému
  // po načtení nepřeskočí na celou Prahu. Střed = zasažená adresa nejblíž adrese uživatele (u velké
  // odstávky leží střed oblasti klidně kilometr daleko), zoom 18 = maximum mapy. Bez adres střed oblasti, 17.
  function pvkOdkaz(u, a) {
    var c = null, z = 18;
    (u.adresy || []).forEach(function (x) {
      var d = a ? dist(a.lat, a.lon, x[0], x[1]) : 0;
      if (!c || d < c[2]) c = [x[0], x[1], d];
    });
    if (!c && u.stred) { c = u.stred; z = 17; }
    if (!c) return PVK_MAPA;
    var la = (+c[0]).toFixed(6), lo = (+c[1]).toFixed(6);
    return PVK_MAPA + "&bookmark=" + encodeURIComponent(btoa(z + ";" + la + ";" + lo)) + "&lat=" + la + "&lon=" + lo + "&zoom=" + z + "&marker=none";
  }


  var VODA_OKOLI = 700;   // m – odstávky v okolí (ne na adrese) ukážeme jen jako zprávu v Bydlení
  function vCas(s) { return s ? akD(s) : null; }
  function vHod(d) { return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }
  function vDen(d, ted) {
    var n = Math.round((akDen(d) - akDen(ted)) / 864e5);
    if (n === 0) return "dnes";
    if (n === 1) return "zítra";
    if (n === -1) return "včera";
    return HDAYS[d.getDay()].toLowerCase() + " " + d.getDate() + ". " + (d.getMonth() + 1) + ".";
  }
  function vodaStav() {   // ok | stara | chyba | zadna
    var v = data.voda;
    if (!v) return "zadna";
    if (!v.ok) return "chyba";
    try { if (new Date() - new Date(v.gen) > 3 * 3600 * 1000) return "stara"; } catch (e) {}
    return "ok";
  }
  function vodaVnitr(lat, lon, ring) {   // bod v polygonu (ring = [[lat,lon],…])
    var x = lon, y = lat, i, j, ins = false;
    for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function vodaTyka(u, a) {
    var ul = plain(a.street || ""), cis = [String(a.co || "").toLowerCase(), String(a.cp || "").toLowerCase()];
    var hit = (u.adresy || []).some(function (p) {
      var m = /^(.*\S)\s+(\d+\w?)$/.exec(p[2] || "");
      if (m && plain(m[1]) === ul && cis.indexOf(m[2].toLowerCase()) >= 0) return true;
      return dist(a.lat, a.lon, p[0], p[1]) <= 20;
    });
    return hit || (u.obrys || []).some(function (r) { return vodaVnitr(a.lat, a.lon, r); });
  }
  function vodaFaze(u, ted) {   // probiha | po (mělo skončit) | brzy (do 48 h) | pozdeji
    var od = vCas(u.od), dd = vCas(u.do);
    if (dd && dd <= ted) return "po";
    if (u.typ === "probiha" || (od && od <= ted)) return "probiha";
    return od && od - ted <= 48 * 3600 * 1000 ? "brzy" : "pozdeji";
  }
  function vodaRazeni(x, y) {
    var p = { probiha: 0, po: 1, brzy: 2, pozdeji: 3 };
    return p[x.f] - p[y.f] || (x.u.od < y.u.od ? -1 : 1);
  }
  function vodaPro(a) {
    if (!data.voda || !a) return [];
    var ted = new Date();
    return (data.voda.udalosti || []).filter(function (u) { return vodaTyka(u, a); })
      .map(function (u) { return { u: u, f: vodaFaze(u, ted) }; }).sort(vodaRazeni);
  }
  function vodaVOkoli(a) {
    if (!data.voda || !a) return [];
    var ted = new Date();
    return (data.voda.udalosti || []).filter(function (u) { return !vodaTyka(u, a); }).map(function (u) {
      var d = null;
      (u.adresy || []).concat(u.stred ? [u.stred] : []).forEach(function (p) { var x = dist(a.lat, a.lon, p[0], p[1]); if (d == null || x < d) d = x; });
      return { u: u, d: d, f: vodaFaze(u, ted) };
    }).filter(function (x) { return x.d != null && x.d <= VODA_OKOLI; }).sort(function (x, y) { return x.d - y.d; });
  }
  function vodaById(id) { return ((data.voda && data.voda.udalosti) || []).filter(function (u) { return String(u.id) === String(id); })[0]; }
  function vodaCisterny(a) {
    if (!data.voda || !a) return [];
    return (data.voda.cisterny || []).map(function (c) { return { c: c, d: dist(a.lat, a.lon, c.lat, c.lon) }; })
      .filter(function (x) { return x.d <= 2500; }).sort(function (x, y) { return x.d - y.d; });
  }
  // krátký popis „kdy“ pro upozornění
  function vodaKdy(x) {
    var ted = new Date(), od = vCas(x.u.od), dd = vCas(x.u.do);
    if (x.f === "po") return { t: "Voda možná stále neteče", s: "mělo skončit " + vDen(dd, ted) + " v " + vHod(dd) + ", obnovení zatím nepotvrzeno" };
    if (x.f === "probiha") return { t: "Teď bez vody", s: dd ? "obnovení " + vDen(dd, ted) + " kolem " + vHod(dd) : "konec zatím neznámý" };
    var t = (vDen(od, ted).charAt(0).toUpperCase() + vDen(od, ted).slice(1)) + " od " + vHod(od) + " bez vody";
    var s = dd ? "do " + (akDen(dd) - akDen(od) ? vDen(dd, ted) + " " : "") + vHod(dd) : "konec zatím neznámý";
    return { t: t, s: s };
  }
  function vodaCisTxt(a, u) {
    var c = vodaCisterny(a)[0];
    if (c) return "cisterna " + akVzdTxt(c.d);
    return u.nz ? "náhradní zásobování zajištěno" : "";
  }
  function vodaUpozorneni(a) {
    return vodaPro(a).map(function (x) {
      var k = vodaKdy(x), cis = vodaCisTxt(a, x.u);
      return { cls: x.f === "probiha" || x.f === "po" ? "now" : x.f === "brzy" ? "plan" : "info", ic: I_NOWATER,
        fg: x.f === "probiha" || x.f === "po" ? "#a23a30" : x.f === "brzy" ? "#9a6a12" : "#2f6fb0",
        t: k.t, s: k.s + (cis ? " · " + cis : ""), act: "voda:" + x.u.id };
    });
  }
  // karta v Bydlení
  function vodaKarta(a) {
    var st = vodaStav(), moje = vodaPro(a), h = "";
    var kdyOk = data.voda && data.voda.gen ? " Ověřeno " + vDen(new Date(data.voda.gen), new Date()) + " v " + vHod(new Date(data.voda.gen)) + "." : "";
    moje.forEach(function (x) {
      var k = vodaKdy(x), now = x.f === "probiha" || x.f === "po", brzy = x.f === "brzy";
      h += '<button type="button" class="card vkarta' + (now ? " now" : brzy ? " plan" : "") + '" data-voda="' + x.u.id + '"><span class="badge" style="background:' + (now ? "#fbe5e3" : brzy ? "#fdf3dc" : "#e3edf8") + '">' +
        SVG(I_NOWATER, 18, now ? "#a23a30" : brzy ? "#9a6a12" : "#2f6fb0", 2) + '</span><span class="grow"><span class="t1">' + (now ? "Přerušená dodávka vody" : "Odstávka pitné vody") + "</span>" +
        '<span class="t2">' + esc(k.t) + "</span><span class=\"t3\">" + esc(k.s) + (x.u.nz ? " · náhradní zásobování" : "") + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    });
    if (moje.length && st === "ok") return h;
    var okoli = moje.length ? [] : vodaVOkoli(a), txt;
    if (st === "chyba" || st === "zadna") txt = "Stav od Pražských vodovodů a kanalizací se teď nepodařilo ověřit" + (data.voda && data.voda.gen && st === "chyba" ? " (naposledy " + vDen(new Date(data.voda.gen), new Date()) + " v " + vHod(new Date(data.voda.gen)) + ")" : "") + ". Aktuální stav ukáže jejich mapa.";
    else if (st === "stara") txt = "Stav od PVK jsme naposledy ověřili " + vDen(new Date(data.voda.gen), new Date()) + " v " + vHod(new Date(data.voda.gen)) + ". Mezitím mohlo dojít k havárii, aktuální stav ukáže jejich mapa.";
    else if (moje.length) return h;
    else if (okoli.length) {
      var ul = []; okoli.forEach(function (x) { var n = (x.u.adresy[0] || [0, 0, ""])[2].replace(/\s+\d.*$/, ""); if (n && ul.indexOf(n) < 0) ul.push(n); });
      txt = "Vaší adresy se teď nic netýká. V okolí do " + VODA_OKOLI + " m PVK " + (okoli.length === 1 ? "hlásí 1 odstávku" : "hlásí " + okoli.length + (okoli.length < 5 ? " odstávky" : " odstávek")) + (ul.length ? " (" + esc(ul.slice(0, 3).join(", ")) + ")" : "") + "." + kdyOk;
    } else txt = "Pro vaši adresu teď žádná odstávka ani havárie není." + kdyOk;
    return h + '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(DROP, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Pitná voda</div>' +
      '<div class="note" style="margin-top:2px">' + txt + '</div><div class="links"><a class="link" href="' + PVK_MAPA + '" target="_blank" rel="noopener">Mapa odstávek PVK ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
  }
  function viewVodaDetail(u) {
    var a = state.address, ted = new Date(), f = vodaFaze(u, ted), od = vCas(u.od), dd = vCas(u.do), moje = a ? vodaTyka(u, a) : false;
    var chip = f === "probiha" ? '<span class="vchip now"><i></i>Probíhá</span>' : f === "po" ? '<span class="vchip now"><i></i>Mělo skončit</span>' : '<span class="vchip plan"><i></i>Plánovaná odstávka</span>';
    var cis = a ? vodaCisterny(a).slice(0, 3) : [];
    var nz = cis.length ? cis.map(function (x) {
      return '<a class="vcis" href="https://www.google.com/maps/search/?api=1&query=' + x.c.lat + "," + x.c.lon + '" target="_blank" rel="noopener"><span class="ci">' + SVG(I_TRUCK, 16, "#1f4d36", 2) + '</span><span class="cn">' + esc(x.c.a || "Cisterna") + '</span><span class="cd">' + akVzdTxt(x.d) + "</span></a>";
    }).join("") + '<div class="dnote">Cisterny s pitnou vodou. Vezměte si vlastní nádobu.</div>' :
      '<div class="dnote" style="margin-top:0">' + (u.nz ? "Pražské vodovody a kanalizace náhradní zásobování zajistí, místa cisteren zatím nezveřejnily. Objeví se tu, jakmile je zveřejní." : "U této odstávky PVK náhradní zásobování neuvádějí.") + "</div>";
    var gen = data.voda && data.voda.gen ? new Date(data.voda.gen) : null;
    return '<div class="head"><button type="button" class="btn-edit" id="vodaback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px">' + chip +
      '<h1 style="margin:4px 0 0;font-size:23px">' + (f === "pozdeji" || f === "brzy" ? "Odstávka pitné vody" : "Přerušená dodávka vody") + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + (moje ? "Týká se vaší adresy " + esc(a.label) : a ? "V okolí vaší adresy · " + esc(((u.adresy[0] || [0, 0, ""])[2])) : "Týká se ulic " + esc(ulicePrvni(u.adresy, 3))) + "</div>" +
      '<div class="dlinks"><a class="btn-ext" href="' + esc(pvkOdkaz(u, a)) + '" target="_blank" rel="noopener">Otevřít na mapě PVK ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("voda", u.id) + "</div>" + (f === "probiha" || f === "po" ? umtBlok("voda:" + u.id, "voda") : "") +
      '<div class="card dcard"><div class="vtime">' +
      '<div><div class="k">Od</div><div class="v">' + (od ? vHod(od) : "–") + '</div><div class="s">' + (od ? vDen(od, ted) + (Math.abs(akDen(od) - akDen(ted)) <= 864e5 ? ", " + HDAYS[od.getDay()].toLowerCase() + " " + od.getDate() + ". " + (od.getMonth() + 1) + "." : "") : "") + "</div></div>" +
      '<div><div class="k">Do</div><div class="v">' + (dd ? "kolem " + vHod(dd) : "neznámo") + '</div><div class="s">' + (dd ? vDen(dd, ted) + (Math.abs(akDen(dd) - akDen(ted)) <= 864e5 ? ", " + HDAYS[dd.getDay()].toLowerCase() + " " + dd.getDate() + ". " + (dd.getMonth() + 1) + "." : "") : "PVK konec zatím neuvedly") + "</div></div></div>" +
      '<div class="dnote" style="margin-top:10px">' + (f === "po" ? "Podle plánu už mělo skončit, PVK obnovení dodávky zatím nepotvrdily. " : "Čas obnovení je odhad Pražských vodovodů a kanalizací. ") +
      (u.pocet > 1 ? "Odstávka zasahuje " + u.pocet.toLocaleString("cs-CZ") + " odběrných míst." : "") + "</div></div>" +
      '<div class="card dcard"><div class="dtitle">Náhradní zásobování' + (cis.length ? " · nejblíž vám" : "") + "</div>" + nz + "</div>" +
      '<div class="note" style="padding:0 4px">Zdroj: Pražské vodovody a kanalizace' + (gen ? ", ověřeno " + vDen(gen, ted) + " v " + vHod(gen) : "") + ". Stav kontrolujeme každých 15 minut.</div></div>";
  }
  function openVoda(id) {
    state.vodaZ = { tab: state.tab, y: window.scrollY };
    state.vodaSel = String(id);
    try { history.pushState({ voda: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function vodaKrokZpet() {
    var z = state.vodaZ || { tab: state.tab, y: 0 };
    state.vodaSel = null; state.patSel = null; state.elSel = null; state.zav = null; state.uzSel = null; state.tvSel = null; state.tab = z.tab; render(); window.scrollTo(0, z.y || 0);
  }
  function vodaBack() {
    if (state.sdil) { sdilKonec(); return; }
    if (history.state && history.state.voda) { history.back(); return; }
    vodaKrokZpet();
  }

  // ---- Pátrání po pohřešovaných (zpravodajství Policie ČR, KŘP Praha) ----
  var POLICIE_ZPRAVY = "https://policie.gov.cz/hlavni-mesto-praha/zpravodajstvi";
  var I_HLEDANY = '<circle cx="10" cy="7.5" r="3.5"/><path d="M3.5 20v-1.5A5 5 0 0 1 8.5 13.5h3"/><circle cx="17" cy="16.5" r="3"/><path d="m19.2 18.7 2.3 2.3"/>';
  var I_NALEZEN = '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.8"/>';
  var I_TEL = '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>';
  // když zdroj 6 h neodpovídá, nevíme, jestli pátrání trvá → nic neukazovat
  function patraniVse() {
    var d = data && data.patrani;
    if (!d || !d.pripady) return [];
    var g = new Date(d.gen || 0);
    if (isNaN(g) || new Date() - g > 6 * 36e5) return [];
    return d.pripady.filter(function (p) {
      if (p.stav !== "nalezen") return true;
      var m = new Date(p.mod || p.pub || 0);
      return !isNaN(m) && new Date() - m <= 24 * 36e5;
    });
  }
  function patById(id) { return patraniVse().filter(function (p) { return p.id === id; })[0]; }
  function patTitulek(p) { return String(p.titulek || "Pátrání").replace(/\s*[-–]\s*(?:nalezen[aiy]?|vypátrán[aiy]?|aktualizace)!?\s*$/i, "").replace(/\s*[-–]\s*(?:nalezen[aiy]?|vypátrán[aiy]?|aktualizace)!?\s*$/i, ""); }
  function patKdy(s) {
    var d = s ? new Date(s) : null, ted = new Date();
    if (!d || isNaN(d)) return "";
    return vDen(d, ted).toLowerCase() + " " + vHod(d);
  }
  function patUpozorneni() {
    return patraniVse().map(function (p) {
      var m = (p.mista || []).slice(0, 2).join(", ");
      if (p.stav === "nalezen") return { cls: "found", ic: I_NALEZEN, fg: "#2f7a4a", t: "Pátrání odvoláno", s: patTitulek(p) + " · děkujeme za pomoc", act: "pat:" + p.id };
      return { cls: p.zona === "blizko" ? "help" : "info", ic: I_HLEDANY, fg: p.zona === "blizko" ? "#2a5b9a" : "#5b5b54",
        t: (/^p[áa]tr/i.test(patTitulek(p)) ? "" : "Pátrání: ") + patTitulek(p), s: (m ? m + " · " : "") + "vyhlášeno " + patKdy(p.pub), act: "pat:" + p.id };
    });
  }
  function viewPatraniDetail(p) {
    var hotovo = p.stav === "nalezen", d = data.patrani, gen = d && d.gen ? new Date(d.gen) : null, ted = new Date();
    var jinde = Math.max(0, (d.praha || 0) - patraniVse().filter(function (x) { return x.stav === "patra"; }).length);
    var h = '<div class="head"><button type="button" class="btn-edit" id="vodaback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px">' +
      (hotovo ? '<span class="vchip found"><i></i>Pátrání odvoláno</span>' : '<span class="vchip help"><i></i>Policie pátrá · vyhlášeno ' + esc(patKdy(p.pub)) + "</span>") +
      '<h1 style="margin:4px 0 0;font-size:23px">' + esc(patTitulek(p)) + "</h1>" +
      '<div class="dlinks"><a class="btn-ext" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + (hotovo ? "Zpráva na webu policie " : "Foto a popis na webu policie ") + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("pat", p.id) + "</div>";
    if (hotovo) {
      h += '<div class="card dcard"><div class="ptext">Policie pátrání odvolala. Děkujeme všem, kdo zprávu sdíleli a pomáhali. Popis osoby už proto neukazujeme.</div></div>';
    } else {
      h += '<div class="card dcard"><div class="ptext">' + esc(p.perex || "") + "</div>" +
        ((p.mista || []).length ? '<div class="pmista">' + p.mista.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" : "") +
        '<div class="dnote" style="margin-top:10px">Text je úvod policejní zprávy. Celý popis a fotografie jsou jen na webu policie.</div></div>' +
        '<a class="btn-158" href="tel:158">' + SVG(I_TEL, 18, "currentColor", 2.2) + "Viděli jste tuto osobu? Volejte 158</a>" +
        '<div class="card dcard"><div class="dtitle">Když osobu uvidíte</div><div class="ptext" style="font-size:14px">Zůstaňte s ní nebo ji sledujte z dálky, zavolejte 158 a řekněte, kde přesně jste. Osobu nikam neodvážejte.</div></div>';
    }
    return h + '<div class="note" style="padding:0 4px">Zdroj: zpravodajství Policie ČR, KŘP hl. m. Prahy' + (gen ? ", ověřeno " + vDen(gen, ted).toLowerCase() + " v " + vHod(gen) : "") +
      ". Kontrolujeme každých 30 minut; po nalezení zprávu do 24 hodin odstraníme." + (jinde ? " Jinde v Praze policie teď pátrá " + (jinde === 1 ? "po 1 další osobě" : "po " + jinde + " dalších osobách") + ' – <a href="' + POLICIE_ZPRAVY + '" target="_blank" rel="noopener">zpravodajství policie</a>.' : "") + "</div></div>";
  }
  function openPatrani(id) {
    state.vodaZ = { tab: state.tab, y: window.scrollY };
    state.patSel = String(id);
    try { history.pushState({ voda: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  // ---- stavby: databáze Praha zítra (CAMP / IPR), štítek prodeje z novostavby.com ----
  var ST_R = 3000, ST_N = 3;
  var ST_FAZE = { stavi: ["Staví se", "f-stavi"], povoluje: ["Povoluje se", "f-povol"], planuje: ["Plánuje se", "f-plan"], hotovo: ["Dokončeno", "f-hot"] };
  var ST_SEKCE = [["stavi", "Staví se"], ["povoluje", "Povoluje se"], ["planuje", "Plánuje se"], ["hotovo", "Nedávno dokončeno"]];
  var I_JERAB = '<path d="M6 21V4h1l11 3H6"/><path d="M14 7v5"/><rect x="12" y="12" width="4" height="3" rx=".5"/><path d="M3 21h8"/>';
  var ST_KAT = {
    byd: ["Bydlení", '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'],
    ver: ["Školy a služby", '<path d="m3 9 9-5 9 5-9 5Z"/><path d="M7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/>'],
    park: ["Parky a náměstí", '<path d="M12 22v-6"/><path d="M8 16h8a4 4 0 0 0 1-7.9A5 5 0 0 0 7.2 8 4 4 0 0 0 8 16Z"/>'],
    dop: ["Doprava", '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/><path d="M4 11h16"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'],
    kom: ["Obchod a kanceláře", '<path d="M4 7h16l-1 4H5Z"/><path d="M5 11v9h14v-9"/><path d="M9 20v-5h6v5"/>'],
    uzemi: ["Rozvojové území", I_JERAB]
  };
  var ST_FILTRY = ["all", "byd", "ver", "park", "dop", "kom"];
  function stKat(p) {
    var t = (p.typ || []).join(" ");
    if ((p.typ || []).length && (p.typ || []).every(function (x) { return /Transforma|Rozvojov/.test(x); })) return "uzemi";
    if (/Bydlení/.test(t)) return "byd";
    if (/Vzdělávání|Zdravot|Sociál|Kultura|Sport|Veřejná správa|Občanská/.test(t)) return "ver";
    if (/prostranství|Krajin/.test(t)) return "park";
    if (/Doprav|Technická/.test(t)) return "dop";
    return "kom";
  }
  function stById(id) { return data.stavby && (data.stavby.projekty || []).filter(function (p) { return p.id === id; })[0]; }
  function stDist(p, a) {
    var d = null;
    if (!a) return null;
    (p.body || []).forEach(function (b) { var x = dist(a.lat, a.lon, b[0], b[1]); if (d == null || x < d) d = x; });
    return d;
  }
  function stOkoli(a, r) {
    if (!data.stavby || !data.stavby.projekty) return [];
    return data.stavby.projekty.map(function (p) { return { p: p, d: stDist(p, a) }; })
      .filter(function (x) { return x.d != null && x.d <= (r || ST_R); }).sort(function (x, y) { return x.d - y.d; });
  }
  function stTermin(p) {
    var m = /(20\d\d)/.exec(p.do || "");
    return m ? (p.faze === "hotovo" ? "hotovo " : "do ") + m[1] : "";
  }
  function stMeta(p) {
    var x = [stKat(p) === "uzemi" ? "" : stTermin(p)];
    if (p.byty) x.push(p.byty + " " + (p.byty === 1 ? "byt" : p.byty < 5 ? "byty" : "bytů"));
    return x.filter(Boolean).join(" · ");
  }
  function stUlice(p) { var a = p.adr || []; return a.slice(1).filter(Boolean)[0] || a[0] || ""; }
  function stThumb(p, cls, vcetnePlanu) {
    var ic = '<span class="sticon">' + SVG(ST_KAT[stKat(p)][1], cls === "stimg lg" ? 40 : 26, "#8a8572", 1.8) + "</span>";
    var ok = p.obr && (p.obrK === "foto" || (vcetnePlanu && p.obrK));
    return '<span class="' + cls + '">' + ic + (ok ? '<img src="' + esc(data.stavby.img + p.obr) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function stFz(p) { var f = ST_FAZE[p.faze] || ST_FAZE.planuje; return '<span class="fz ' + f[1] + '"><i></i>' + f[0] + "</span>"; }
  function stProdej(p) { return p.prodej ? '<span class="fz f-prodej">' + esc(p.prodej.s) + "</span>" : ""; }
  function stKarta(x) {
    var p = x.p, m = stMeta(p);
    return '<button type="button" class="card stc" data-st="' + esc(p.id) + '">' + stThumb(p, "stimg") + '<span class="stt"><span class="stfz">' + stFz(p) + stProdej(p) + "</span>" +
      '<span class="stn">' + esc(p.n) + "</span>" + (m ? '<span class="stm">' + esc(m) + "</span>" : "") +
      '<span class="sta">' + esc(stUlice(p)) + (x.d != null ? " · " + akVzdTxt(x.d) : "") + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  function stFiltr(xs) {
    return xs.filter(function (x) { return fIn(state.stF, stKat(x.p)) && (state.stM === "all" || x.p.mc === state.stM); });
  }
  function stChips() { return fBar("st"); }
  // počet pro tlačítko v panelu: velké projekty (bez rozvojových území) + záměry na stavebním úřadu
  function stCount() {
    var a = state.address, full = state.stView === "full";
    var xs = full ? stFiltr((data.stavby.projekty || []).filter(function (p) { return p.mc === "9" || p.mc === "14"; }).map(function (p) { return { p: p }; })) : stFiltr(stOkoli(a));
    return xs.filter(function (x) { return stKat(x.p) !== "uzemi"; }).length + (full ? rzVse().length : rzOkoli(a).length);
  }
  function stSekce(xs, vse) {
    var h = "";
    ST_SEKCE.forEach(function (s) {
      var f = xs.filter(function (x) { return x.p.faze === s[0] && stKat(x.p) !== "uzemi"; });
      if (!f.length) return;
      var otevr = vse || state.stVse[s[0]], zob = otevr ? f : f.slice(0, ST_N);
      h += '<div class="stsec"><b>' + s[1] + "</b><span>" + f.length + '</span></div><div class="stlist">' + zob.map(stKarta).join("") + "</div>";
      if (!vse && f.length > ST_N) h += '<button type="button" class="spadvic" data-stvse="' + s[0] + '">' + (otevr ? "Zobrazit méně" : "Další (" + (f.length - ST_N) + ")") +
        SVG(otevr ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    });
    var u = xs.filter(function (x) { return stKat(x.p) === "uzemi"; });
    if (u.length && state.stF === "all") {
      var uo = vse || state.stVse.uzemi;
      h += '<div class="stsec"><b>Rozvojová území</b><span>' + u.length + '</span></div><div class="note" style="padding:0 4px;margin:-2px 0 2px">Velké celky, kde se teprve rozhoduje, co v nich vznikne.</div>' +
        '<div class="stlist">' + (uo ? u : u.slice(0, 2)).map(stKarta).join("") + "</div>";
      if (!vse && u.length > 2) h += '<button type="button" class="spadvic" data-stvse="uzemi">' + (uo ? "Zobrazit méně" : "Další (" + (u.length - 2) + ")") +
        SVG(uo ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    }
    return h;
  }
  function stStav() {
    var d = data.stavby;
    if (!d || !d.projekty) return '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(I_JERAB, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Seznam staveb se nepodařilo načíst</div><div class="note" style="margin-top:2px">Zkuste to prosím později.</div></div></div>';
    if (d.ok === false) return '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(I_JERAB, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Seznam staveb může být starší</div><div class="note" style="margin-top:2px">Databázi CAMP se teď nepodařilo načíst, ukazujeme poslední známý stav. Stavby se mění pomalu, údaje nejspíš pořád platí.</div></div></div>';
    return "";
  }
  function stavbyBody(a) {
    var st = stStav();
    if (!data.stavby || !data.stavby.projekty) return st;
    var vse = stOkoli(a), xs = stFiltr(vse), h = st + stChips() + rzSekce(a);
    if (!vse.length) {
      var nej = stOkoli(a, 1e6)[0];
      h += '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(I_JERAB, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Do 3 km se teď nic nestaví ani neplánuje</div>' +
        (nej ? '<div class="note" style="margin-top:2px">Nejbližší projekt: ' + esc(nej.p.n) + ", " + akVzdTxt(nej.d) + ".</div>" : "") + "</div></div>";
    } else if (!xs.length) {
      h += '<div class="card-dashed row"><div class="grow"><div class="note" style="margin:0">V tomhle filtru do 3 km nic není.</div></div></div>';
    } else {
      h += '<div class="label" style="margin-top:2px">Velké projekty do 3 km · ' + pl(xs.filter(function (x) { return stKat(x.p) !== "uzemi"; }).length, "projekt", "projekty", "projektů") + "</div>" + stSekce(xs, false);
    }
    h += eiaSekce(a);
    var uz = uzavirkyPro(a);
    h += '<button type="button" class="rdlink" data-act="tab:doprava">' + SVG(ST_KAT.dop[1], 20, "#6b6652", 2) + '<span class="grow"><b>Opravy silnic a chodníků</b>' +
      (uz.length ? "V Praze " + esc(a.mc) + " teď " + (uz.length === 1 ? "běží 1 uzavírka nebo práce" : "běží " + uz.length + " " + sklonCount(uz.length)) + ". Najdete je v záložce Doprava." : "Uzavírky a práce na silnicích najdete v záložce Doprava.") +
      "</span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    var n = data.stavby.projekty.filter(function (p) { return p.mc === "9" || p.mc === "14"; }).length;
    h += '<button type="button" class="btn-link" id="stfull">Celý seznam Prahy 9 a 14 (' + n + ")" + SVG(I_CHEV, 14, "currentColor", 2.4) + "</button>";
    return h;
  }
  var FOOT_ST = '<div class="foot">Zdroj dat: CAMP – Praha zítra (Institut plánování a rozvoje hl. m. Prahy) · Stavební řízení: úřední desky MČ Praha 9 a 14 · Posuzování vlivů: Informační systém EIA (CENIA) · Stav prodeje: novostavby.com · Opravy silnic: TSK, NDIC</div>';
  function viewStavbyFull() {
    var a = state.address, xs = stFiltr((data.stavby.projekty || []).filter(function (p) { return p.mc === "9" || p.mc === "14"; })
      .map(function (p) { return { p: p, d: stDist(p, a) }; }).sort(function (x, y) { return x.d - y.d; }));
    return '<div class="head"><button type="button" class="btn-edit" id="stback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button>" +
      '<h1 style="margin-top:6px">Stavby v Praze 9 a 14</h1></div><div class="body">' + stChips() + rzVseSekce(a) + stSekce(xs, true) + "</div>" + FOOT_ST;
  }
  function viewStavbaDetail(p) {
    var a = state.address, d = stDist(p, a), kroky = ["Záměr", "Povolování", "Výstavba", "Hotovo"];
    var i = { planuje: 0, povoluje: 1, stavi: 2, hotovo: 3 }[p.faze] || 0;
    var fakta = [["Dokončení", p.do || "neuvedeno"], ["Byty", p.byty ? String(p.byty) : ""], ["Investice", p.kc], ["Investor", (p.inv || []).slice(0, 2).join(", ")], ["Začátek", p.od]]
      .filter(function (f) { return f[1]; }).slice(0, 4);
    var popis = data.stavbyPopis ? data.stavbyPopis[p.id] || "" : null;
    var b = p.body && p.body[0], mod = p.mod ? p.mod.split("-") : null;
    return '<div class="head"><button type="button" class="btn-edit" id="stback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px">' + stThumb(p, "stimg lg", true) +
      '<div class="stfz">' + stFz(p) + '<span class="fz f-plan">' + ST_KAT[stKat(p)][0] + "</span>" + stProdej(p) + "</div>" +
      '<h1 style="margin:2px 0 0;font-size:23px">' + esc(p.n) + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + esc((p.adr || []).slice(0, 3).join(", ")) + (d != null ? " · " + akVzdTxt(d) + " od vás" : "") + "</div>" +
      // odkazy jako u škol: hned pod adresou, mapa první
      '<div class="dlinks">' + (b ? '<a class="btn-ext" href="https://www.google.com/maps/search/?api=1&query=' + b[0] + "," + b[1] + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      (p.webp ? '<a class="btn-ext" href="' + esc(p.webp) + '" target="_blank" rel="noopener">' + (p.prodej ? "Web developera " : "Web projektu ") + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" :
        p.prodej ? '<a class="btn-ext" href="' + esc(p.prodej.u) + '" target="_blank" rel="noopener">Prodej na novostavby.com ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      '<a class="btn-ext" href="' + esc(data.stavby.web + p.id) + '" target="_blank" rel="noopener">Víc o projektu ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("st", p.id) + "</div>" +
      (stKat(p) !== "uzemi" ? '<div class="card dcard"><div class="krok">' + kroky.map(function (t, k) { return '<div class="' + (k === i ? "now" : k < i ? "done" : "") + '">' + t + "</div>"; }).join("") + "</div></div>" : "") +
      (fakta.length ? '<div class="fgrid">' + fakta.map(function (f) { return '<div><div class="k">' + f[0] + '</div><div class="v">' + esc(f[1]) + "</div></div>"; }).join("") + "</div>" : "") +
      (popis === null && p._p ? '<div class="card dcard"><div class="dtitle">O projektu</div><div class="note" style="margin:0">Načítám popis…</div></div>' :
        popis ? '<div class="card dcard"><div class="dtitle">O projektu</div><div class="ptext stp">' + esc(popis) + "</div></div>" : "") +
      '<div class="note" style="padding:0 4px">Údaje: CAMP – Praha zítra (IPR Praha)' + (mod ? ", naposledy upraveno " + (+mod[2]) + ". " + (+mod[1]) + ". " + mod[0] : "") +
      ". Termíny jsou odhady investora." + (p.obr && p.obrA ? " Obrázek: " + esc(p.obrA) + "." : "") + (p.prodej ? " Stav prodeje podle novostavby.com." : "") + (p.webp ? " Web projektu podle zdrojů IPR." : "") + "</div></div>";
  }
  function stNactiPopis() {
    if (data.stavbyPopis || state.stPopisLoading) return;
    state.stPopisLoading = true;
    getJSON("data/stavby_popis.json").then(function (j) { data.stavbyPopis = j || {}; }).catch(function () { data.stavbyPopis = {}; })
      .then(function () { state.stPopisLoading = false; if (state.stView === "detail") render(); });
  }
  function openStavba(id, odkud) {
    state.stHist.push({ v: state.stView, s: state.stSel, y: window.scrollY, tab: odkud || null });
    state.stView = "detail"; state.stSel = id;
    stNactiPopis();
    try { history.pushState({ st: state.stHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function stKrokZpet() {
    var p = state.stHist.pop() || { v: "list", s: null, y: 0 };
    state.stView = p.v; state.stSel = p.s;
    if (p.tab) state.tab = p.tab;
    render(); window.scrollTo(0, p.y || 0);
  }
  function stBack() {
    if (state.sdil) { sdilKonec(); return; }
    if (state.stHist.length && history.state && history.state.st) { history.back(); return; }
    stKrokZpet();
  }
  // pás „Staví se kolem vás“ na Domů
  function domuStavby(a) {
    var xs = stOkoli(a).filter(function (x) { return x.p.faze === "stavi" && stKat(x.p) !== "uzemi"; }).slice(0, 6);
    if (!xs.length) return "";
    return '<div class="hsec"><b>Staví se kolem vás</b><button type="button" class="hlink" data-act="tab:stavby">Všechny stavby</button></div><div class="hcar">' + xs.map(function (x) {
      var p = x.p, ok = p.obr && p.obrK === "foto";
      return '<button type="button" class="hcc" data-act="st:' + esc(p.id) + '"><span class="ci">' + '<span class="sticon">' + SVG(ST_KAT[stKat(p)][1], 30, "#8a8572", 1.8) + "</span>" +
        (ok ? '<img src="' + esc(data.stavby.img + p.obr) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + '</span><span class="cb">' + stFz(p) +
        '<span class="cn">' + esc(p.n) + '</span><span class="cm">' + esc([stTermin(p), akVzdTxt(x.d)].filter(Boolean).join(" · ")) + "</span></span></button>";
    }).join("") + "</div>";
  }

  // ---- menší stavby: stavební řízení z úředních desek Prahy 9 a 14 (scripts/build_rizeni.py) ----
  var RZ_R = 1500, RZ_DOMU = 500;
  var RZ_FAZE = { zahajeno: ["f-povol", "Řízení zahájeno"], pred: ["f-stavi", "Před rozhodnutím"], rozhodnuto: ["f-hot", "Povoleno"],
    odvolani: ["f-stavi", "Odvolání"], jes: ["f-plan", "Posuzuje se vliv na prostředí"], info: ["f-plan", "Oznámení"] };
  var I_DOC = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>';
  var RZ_IKONY = {
    "Zateplení": '<path d="M4 20V9l8-5 8 5v11"/><path d="M8 20v-7h8v7"/><path d="M2 12h3M19 12h3"/>',
    "Úprava fasády": '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>',
    "Nástavba": '<path d="M5 21V11h14v10"/><path d="M8 11V6h8v5"/><path d="M12 2v3"/>',
    "Přístavba": '<path d="M3 21V10l6-4 6 4v11"/><path d="M15 21v-7h6v7"/>',
    "Rodinný dům": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    "Bytový dům": '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
    "Chodník": '<path d="M7 21 10 3M17 21 14 3M12 7v2M12 13v2"/>',
    "Sítě a přípojky": '<path d="M4 12h6l2-3 2 6 2-3h4"/><circle cx="4" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/>'
  };
  // filtr Staveb platí i pro řízení: sítě a přípojky jen pod „Vše“
  function rzKat(z) {
    if (/dům|Nástavba|Přístavba|Zateplení|fasády|střechy|Balkony|Výtah|Garáž|Stavební úpravy|Novostavba|Demolice/.test(z.druh)) return "byd";
    if (/Chodník|Komunikace/.test(z.druh)) return "dop";
    return "jine";
  }
  function rzVse() {
    var v = data.rizeni && data.rizeni.zamery ? data.rizeni.zamery : [];
    return v.filter(function (z) { return fIn(state.stF, rzKat(z)) && (state.stM === "all" || z.mc === state.stM); });
  }
  function rzById(id) { return (data.rizeni && data.rizeni.zamery || []).filter(function (z) { return z.id === id; })[0]; }
  function rzDist(z, a) { return a && z.lat != null && z.presnost !== "ku" ? dist(a.lat, a.lon, z.lat, z.lon) : null; }
  // v okolí jen záměry se známým místem (adresa nebo ulice); jen katastr → pouze v celém seznamu
  function rzOkoli(a, r, bezFiltru) {
    return (bezFiltru ? (data.rizeni && data.rizeni.zamery || []) : rzVse()).map(function (z) { return { z: z, d: rzDist(z, a) }; })
      .filter(function (x) { return x.d != null && x.d <= (r || RZ_R); }).sort(function (p, q) { return p.d - q.d; });
  }
  function rzDat(s) { var p = (s || "").split("-"); return p.length === 3 ? (+p[2]) + ". " + (+p[1]) + "." : ""; }
  function rzFz(z) { var f = RZ_FAZE[z.faze] || RZ_FAZE.info; return '<span class="fz ' + f[0] + '"><i></i>' + f[1] + "</span>"; }
  function rzMisto(z) {
    if (z.presnost === "ku") return (z.misto || "").charAt(0).toUpperCase() + (z.misto || "").slice(1) + " (místo bez upřesnění)";
    var m = z.misto || ""; return m.charAt(0).toUpperCase() + m.slice(1);
  }
  function rzKarta(x) {
    var z = x.z;
    return '<button type="button" class="card stc" data-rz="' + esc(z.id) + '"><span class="rzi">' + SVG(RZ_IKONY[z.druh] || I_DOC, 24, "#6b6652", 1.8) + "</span>" +
      '<span class="stt"><span class="stfz">' + rzFz(z) + '</span><span class="stn">' + esc(z.n) + '</span><span class="stm">' + esc(z.druh) + " · vyvěšeno " + rzDat(z.d) + "</span>" +
      '<span class="sta">' + esc(rzMisto(z)) + (x.d != null ? " · " + akVzdTxt(x.d) : "") + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  function rzSekce(a) {
    if (!data.rizeni) return "";
    var xs = rzOkoli(a), h = '<div class="stsec"><b>Na stavebním úřadu</b><span>do 1,5 km · ' + xs.length + "</span></div>" +
      '<div class="note" style="padding:0 4px;margin:-2px 0 2px">Menší stavby a úpravy domů, o kterých teď rozhoduje stavební úřad.</div>';
    if (!xs.length && state.stF !== "all") return "";
    if (!xs.length) return h + '<div class="card-dashed row"><div class="grow"><div class="note" style="margin:0">Do 1,5 km teď stavební úřad nic nezveřejnil. Vyhlášky sledujeme od 21. 10. 2026.</div></div></div>';
    var otevr = state.stVse.rizeni, zob = otevr ? xs : xs.slice(0, ST_N);
    h += '<div class="stlist">' + zob.map(rzKarta).join("") + "</div>";
    if (xs.length > ST_N) h += '<button type="button" class="spadvic" data-stvse="rizeni">' + (otevr ? "Zobrazit méně" : "Další (" + (xs.length - ST_N) + ")") +
      SVG(otevr ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    return h;
  }
  function rzVseSekce(a) {
    var xs = rzVse().map(function (z) { return { z: z, d: rzDist(z, a) }; });
    if (!xs.length) return "";
    return '<div class="stsec"><b>Na stavebním úřadu</b><span>' + xs.length + '</span></div><div class="stlist">' + xs.map(rzKarta).join("") + "</div>";
  }
  function viewRizeniDetail(z) {
    var a = state.address, d = rzDist(z, a);
    var tl = (z.kroky || []).map(function (k) {
      var f = RZ_FAZE[k.f] || RZ_FAZE.info;
      return "<div><b>" + f[1] + "</b><small>vyvěšeno " + rzDat(k.d) + " " + k.d.slice(0, 4) + ' · <a href="' + esc(k.u) + '" target="_blank" rel="noopener">vyhláška</a></small></div>';
    }).join("");
    if (z.faze === "zahajeno" || z.faze === "pred") tl += '<div class="next"><b>Rozhodnutí o povolení</b><small>zatím nevydáno</small></div>';
    var last = (z.kroky || [])[z.kroky.length - 1] || {};
    return '<div class="head"><button type="button" class="btn-edit" id="stback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px"><div class="stfz">' + rzFz(z) + '<span class="fz f-plan">' + esc(z.druh) + "</span></div>" +
      '<h1 style="margin:2px 0 0;font-size:23px">' + esc(z.n) + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + esc(rzMisto(z)) + (d != null ? " · " + akVzdTxt(d) + " od vás" : "") + ", Praha " + esc(z.mc) + "</div>" +
      '<div class="dlinks">' + (z.lat != null && z.presnost !== "ku" ? '<a class="btn-ext" href="https://www.google.com/maps/search/?api=1&query=' + z.lat + "," + z.lon + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      (last.u ? '<a class="btn-ext" href="' + esc(last.u) + '" target="_blank" rel="noopener">Vyhláška na úřední desce ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") + sdilBtn("rz", z.id) + "</div>" +
      '<div class="card dcard"><div class="dtitle">Průběh řízení</div><div class="tl">' + tl + "</div></div>" +
      (z.popis ? '<div class="card dcard"><div class="dtitle">Co se má stavět</div><div class="ptext">' + esc(z.popis.charAt(0).toUpperCase() + z.popis.slice(1)) + "</div></div>" : "") +
      (z.faze === "zahajeno" ? '<div class="prz"><b>Jste soused?</b>Vlastníci sousedních pozemků a domů bývají účastníky řízení. Námitky lze podat do 15 dnů od doručení vyhlášky – postup a lhůta jsou v ní.</div>' : "") +
      '<div class="note" style="padding:0 4px">Zdroj: úřední deska MČ Praha ' + esc(z.mc) + "." + (z.presnost === "ulice" ? " Místo je určené jen podle ulice." : "") +
      " Jména stavebníků a další osobní údaje z vyhlášek v aplikaci neukazujeme.</div></div>";
  }
  function openRizeni(id, odkud) {
    state.stHist.push({ v: state.stView, s: state.stSel, y: window.scrollY, tab: odkud || null });
    state.stView = "rizeni"; state.stSel = id;
    try { history.pushState({ st: state.stHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  // ---- záměry s posuzováním vlivů na životní prostředí (EIA, CENIA) ----
  var I_LEAF = '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>';
  var EIA_KONEC = { "Nepodléhá dalšímu posuzování": "Bez dalšího posuzování", "Stanovisko": "Vydáno stanovisko", "Ukončeno z jiných důvodů": "Ukončeno" };
  function isoDen(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function eiaOtevrena(z) { return !!z.lhuta && z.lhuta >= isoDen(new Date()); }
  function eiaPro(a) {
    if (!data.eia || !a) return [];
    var rok = isoDen(new Date(den0() - 365 * 864e5));
    return (data.eia.zamery || []).filter(function (z) {
      if ((z.mc || []).indexOf(a.mc) < 0 || (state.stM !== "all" && (z.mc || []).indexOf(state.stM) < 0)) return false;
      if (z.stav === "Ukončeno z jiných důvodů") return false;
      return eiaOtevrena(z) || !EIA_KONEC[z.stav] || (z.zmena || "") >= rok;
    }).sort(function (x, y) {
      var ox = eiaOtevrena(x), oy = eiaOtevrena(y), ux = a.part && x.ku.indexOf(a.part) >= 0, uy = a.part && y.ku.indexOf(a.part) >= 0;
      return (oy - ox) || (uy - ux) || ((y.zmena || "") < (x.zmena || "") ? -1 : 1);
    });
  }
  function eiaById(k) { return ((data.eia && data.eia.zamery) || []).filter(function (z) { return z.kod === k; })[0]; }
  function eiaStav(z) {
    var o = eiaOtevrena(z);
    return '<span class="fz ' + (o ? "f-povol" : EIA_KONEC[z.stav] ? "f-hot" : "f-plan") + '"><i></i>' + esc(o ? "Můžete se vyjádřit" : EIA_KONEC[z.stav] || z.stav) + "</span>";
  }
  function eiaKarta(z) {
    return '<button type="button" class="card stc" data-eia="' + esc(z.kod) + '"><span class="rzi">' + SVG(I_LEAF, 24, "#3d6b4a", 1.8) + "</span>" +
      '<span class="stt"><span class="stfz">' + eiaStav(z) + '</span><span class="stn">' + esc(z.n.replace(/^"|"$/g, "")) + "</span>" +
      '<span class="stm">' + (eiaOtevrena(z) ? "Vyjádření do " + rzDat(z.lhuta) + " · " : "") + esc(z.stav) + "</span>" +
      '<span class="sta">' + esc(z.ku.join(", ")) + (z.kuVse > z.ku.length ? " a další území" : "") + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  function eiaSekce(a) {
    if (!data.eia || state.stF !== "all") return "";
    var xs = eiaPro(a);
    if (!xs.length) return "";
    var otevr = state.stVse.eia, zob = otevr ? xs : xs.slice(0, ST_N);
    var h = '<div class="stsec"><b>Posuzování vlivů na prostředí</b><span>Praha ' + esc(a.mc) + " · " + xs.length + "</span></div>" +
      '<div class="note" style="padding:0 4px;margin:-2px 0 2px">Velké záměry, u kterých úřad posuzuje vliv na okolí (EIA). Během řízení se k nim může vyjádřit kdokoli.</div>' +
      '<div class="stlist">' + zob.map(eiaKarta).join("") + "</div>";
    if (xs.length > ST_N) h += '<button type="button" class="spadvic" data-stvse="eia">' + (otevr ? "Zobrazit méně" : "Další (" + (xs.length - ST_N) + ")") +
      SVG(otevr ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>";
    return h;
  }
  function viewEiaDetail(z) {
    var tl = (z.kroky || []).map(function (k) {
      return "<div><b>" + esc(k.f) + "</b><small>" + (k.d ? "zveřejněno " + rzDat(k.d) + " " + k.d.slice(0, 4) : "") +
        (k.lhuta ? (k.d ? " · " : "") + "vyjádření do " + rzDat(k.lhuta) + " " + k.lhuta.slice(0, 4) : "") + "</small></div>";
    }).join("");
    if (!EIA_KONEC[z.stav]) tl += '<div class="next"><b>Další krok řízení</b><small>zatím nezveřejněn</small></div>';
    return '<div class="head"><button type="button" class="btn-edit" id="stback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px"><div class="stfz">' + eiaStav(z) + '<span class="fz f-plan">EIA</span></div>' +
      '<h1 style="margin:2px 0 0;font-size:23px">' + esc(z.n.replace(/^"|"$/g, "")) + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + esc(z.ku.join(", ")) + (z.kuVse > z.ku.length ? " a další katastrální území" : "") + "</div>" +
      '<div class="dlinks"><a class="btn-ext" href="' + esc(z.u) + '" target="_blank" rel="noopener">Dokumenty na portálu EIA ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("eia", z.kod) + "</div>" +
      (eiaOtevrena(z) ? '<div class="prz"><b>Můžete se vyjádřit do ' + rzDat(z.lhuta) + "</b>Písemné vyjádření pošlete příslušnému úřadu (" + esc(z.urad) + "). Kde a jak ho podat, najdete v informaci o záměru na portálu EIA.</div>" : "") +
      '<div class="card dcard"><div class="dtitle">Průběh posuzování</div><div class="tl">' + (tl || "<div><b>" + esc(z.stav) + "</b></div>") + "</div></div>" +
      dcard("O záměru", drow("Oznamovatel", z.ozn || null) + drow("Příslušný úřad", z.urad || null) + drow("Kód záměru", z.kod)) +
      '<div class="note" style="padding:0 4px">Zdroj: Informační systém EIA (CENIA). Kontrolujeme jednou denně.</div></div>';
  }
  function openEia(k, odkud) {
    state.stHist.push({ v: state.stView, s: state.stSel, y: window.scrollY, tab: odkud || null });
    state.stView = "eia"; state.stSel = k;
    try { history.pushState({ st: state.stHist.length }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  // ---- parkování: zóny placeného stání (Golemio / TSK) a aktuality parking.praha.eu ----
  var I_PARK = '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>';
  var ZPS_BLIZ = 80;   // m – úsek zóny tak blízko adresy = ulice je v zóně
  var ZPS_BARVA = { b: ["modrá", "jen pro rezidenty"], v: ["fialová", "smíšená – rezidenti s oprávněním, ostatní platí"], o: ["oranžová", "krátkodobé placené stání"] };
  var ZPS_MC = { "9": /Praha\s*9\b|Prosek|Střížkov|Vysočan|Libe[nň]|Hrdlořez/i, "14": /Praha\s*14\b|Černý Most|Kyje|Hostavic|Hloubětín|Lehovec|Jahodnic/i };
  function zpsPro(a) {
    if (!data.zps || !a) return null;
    var nej = null;
    (data.zps.useky || []).forEach(function (u) { if (u[5].replace(/\..*/, "") !== "P" + a.mc) return; var d = dist(a.lat, a.lon, u[0], u[1]); if (!nej || d < nej.d) nej = { u: u, d: d }; });
    var ul = plain(a.street || ""), nove = (data.zps.nove || []).filter(function (n) { return n.mc === a.mc; });
    return { nej: nej, v: !!(nej && nej.d <= ZPS_BLIZ), nove: nove, moje: nove.filter(function (n) { return n.ulice.some(function (x) { return plain(x) === ul; }); })[0],
      zpravy: (data.zps.zpravy || []).filter(function (z) { return ZPS_MC[a.mc] && ZPS_MC[a.mc].test(z.t); }) };
  }
  function zpsUpozorneni(a) {
    var z = zpsPro(a);
    if (!z || !z.moje) return [];
    var dn = Math.round((new Date(z.moje.od + "T00:00:00") - den0()) / 864e5);
    if (dn < -14 || dn > 30) return [];
    return [{ cls: dn <= 7 && dn >= 0 ? "plan" : "info", ic: I_PARK, fg: "#2f6fb0", t: (dn > 0 ? "Od " : "Nově od ") + dden(z.moje.od).toLowerCase() + " placené parkování ve vaší ulici",
      s: "zóna placeného stání · rezidenti potřebují parkovací oprávnění", act: "tab:doprava" }];
  }
  function parkovaniKarta(a) {
    var z = zpsPro(a);
    if (!z) return "";
    var h = '<div class="label">Parkování</div>', t1, txt;
    if (z.v) {
      var b = ZPS_BARVA[z.nej.u[2]] || ["", ""];
      t1 = "Vaše ulice je v zóně placeného stání";
      txt = (b[0] ? "Zóna " + b[0] + " – " + b[1] + ". " : "") + "Jako místní potřebujete rezidentní parkovací oprávnění, vyřídíte ho online.";
    } else if (a.mc === "14") {
      t1 = "Placené parkování tu není";
      txt = "V Praze 14 zóny placeného stání zatím nejsou, v ulicích parkujete zdarma.";
    } else {
      t1 = "Ve vaší ulici placené stání není";
      txt = "V ulici " + esc(a.street) + " parkujete zdarma." + (z.nej && z.nej.d <= 1500 ? (z.nej.u[4] ? " Nejbližší zóna placeného stání je v ulici " + esc(z.nej.u[4]) + ", " + akVzdTxt(z.nej.d) + "." : " Nejbližší zóna placeného stání je " + akVzdTxt(z.nej.d) + " od vás.") : "");
    }
    var nove = z.nove.map(function (n) { return '<div class="dnote" style="margin-top:8px"><b>Rozšíření zóny od ' + dden(n.od).toLowerCase() + ":</b> " + esc(n.ulice.slice(0, 5).join(", ")) + (n.ulice.length > 5 ? " a další" : "") + "</div>"; }).join("");
    var zpr = z.zpravy.slice(0, 3).map(function (x) { return '<a class="zpr" href="' + esc(x.u) + '" target="_blank" rel="noopener"><span>' + esc(x.t) + "</span><small>" + (x.d ? rzDat(x.d) : "") + " " + SVG(I_EXT, 11, "currentColor", 2.4) + "</small></a>"; }).join("");
    h += '<div class="card' + (z.v ? "" : "-dashed") + ' row top"><span class="badge" style="background:' + (z.v ? "#e3edf8" : "#ececea") + '">' + SVG(I_PARK, 18, z.v ? "#2f6fb0" : "#5b5b54", 2) + "</span>" +
      '<div class="grow"><div class="t1">' + t1 + '</div><div class="note" style="margin-top:2px">' + txt + "</div>" + nove +
      '<div class="links">' + (z.v ? '<a class="link" href="https://portal.zpspraha.cz/" target="_blank" rel="noopener">Parkovací oprávnění ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a>" : "") +
      '<a class="link" href="https://parking.praha.eu/cs/mapa/" target="_blank" rel="noopener">Mapa zón ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div>" +
      (zpr ? '<div class="zprs"><div class="shtitle" style="margin:12px 0 4px">Aktuality o parkování</div>' + zpr + "</div>" : "") + "</div></div>";
    return h;
  }

  // ---- elektřina: plánovaná přerušení dodávky (oznámení PREdistribuce z úředních desek) ----
  var I_NOPOWER = '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/><path d="m3 3 18 18"/>';
  var I_POWER = '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>';
  var EL_OKOLI = 500;   // m – vypnutí v okolí ukážeme jen jako zprávu v Bydlení
  var EL_DESKY = { "9": "https://www.praha9.cz/urad-a-samosprava/uredni-deska", "14": "https://edeska.praha14.cz/eDeska/eDeskaAktualni.jsp" };
  function elDen(iso) { return new Date(iso + "T00:00:00"); }
  function elKonec(u) { return new Date(u.dny[u.dny.length - 1] + "T" + (u.do || "23:59") + ":00"); }
  function elTyka(u, a) {
    var ul = plain(a.street || ""), cis = [String(a.co || "").toLowerCase(), String(a.cp || "").toLowerCase()];
    return (u.adresy || []).some(function (p) {
      var m = /^(.*\S)\s+(\d+)(?:\/(\d+\w?))?$/.exec(p[2] || "");
      if (m && plain(m[1]) === ul && String(m[2]) === String(a.cp)) return true;
      return dist(a.lat, a.lon, p[0], p[1]) <= 15;
    }) || (u.ulice || []).some(function (x) { return plain(x) === ul; }) && cis.length > 0;
  }
  // nejbližší den přerušení, který ještě neskončil
  function elDalsi(u, ted) {
    for (var i = 0; i < u.dny.length; i++) {
      var k = new Date(u.dny[i] + "T" + (u.do || "23:59") + ":00");
      if (k > ted) return { den: u.dny[i], od: new Date(u.dny[i] + "T" + (u.od || "00:00") + ":00"), konec: k };
    }
    return null;
  }
  function elFaze(x, ted) { return x.od <= ted ? "probiha" : x.od - ted <= 48 * 3600 * 1000 ? "brzy" : "pozdeji"; }
  function elPro(a) {
    if (!data.elektrina || !a) return [];
    var ted = new Date();
    return (data.elektrina.udalosti || []).filter(function (u) { return elTyka(u, a); }).map(function (u) {
      var x = elDalsi(u, ted); return x ? { u: u, x: x, f: elFaze(x, ted) } : null;
    }).filter(Boolean).sort(function (p, q) { return p.x.od - q.x.od; });
  }
  function elVOkoli(a) {
    if (!data.elektrina || !a) return [];
    var ted = new Date();
    return (data.elektrina.udalosti || []).filter(function (u) { return !elTyka(u, a) && elDalsi(u, ted); }).map(function (u) {
      var d = null;
      (u.adresy || []).forEach(function (p) { var x = dist(a.lat, a.lon, p[0], p[1]); if (d == null || x < d) d = x; });
      return { u: u, d: d };
    }).filter(function (x) { return x.d != null && x.d <= EL_OKOLI; }).sort(function (p, q) { return p.d - q.d; });
  }
  function elById(id) { return ((data.elektrina && data.elektrina.udalosti) || []).filter(function (u) { return String(u.id) === String(id); })[0]; }
  function elKdy(x) {
    var ted = new Date(), d = vDen(x.x.od, ted), cas = (x.u.od ? " od " + x.u.od.replace(/^0/, "") : "");
    if (x.f === "probiha") return { t: "Teď bez proudu", s: x.u.do ? "do " + x.u.do.replace(/^0/, "") + " · plánované vypnutí elektřiny" : "plánované vypnutí elektřiny" };
    return { t: d.charAt(0).toUpperCase() + d.slice(1) + cas + " bez proudu", s: (x.u.do ? "do " + x.u.do.replace(/^0/, "") + " · " : "") + "plánované vypnutí elektřiny" };
  }
  function elUpozorneni(a) {
    return elPro(a).filter(function (x) { return x.x.od - new Date() <= 7 * 864e5; }).map(function (x) {
      var k = elKdy(x);
      return { cls: x.f === "probiha" ? "now" : x.f === "brzy" ? "plan" : "info", ic: I_NOPOWER,
        fg: x.f === "probiha" ? "#a23a30" : x.f === "brzy" ? "#9a6a12" : "#2f6fb0", t: k.t, s: k.s, act: "el:" + x.u.id };
    });
  }
  function elUlice(u) {
    var ul = [];
    (u.adresy || []).forEach(function (p) { var n = (p[2] || "").replace(/\s+\d.*$/, ""); if (n && ul.indexOf(n) < 0) ul.push(n); });
    (u.ulice || []).forEach(function (n) { if (ul.indexOf(n) < 0) ul.push(n); });
    return ul;
  }
  // karta v Bydlení
  function elKarta(a) {
    if (!data.elektrina) return "";
    var moje = elPro(a), h = "";
    moje.forEach(function (x) {
      var k = elKdy(x), now = x.f === "probiha", brzy = x.f === "brzy";
      h += '<button type="button" class="card vkarta' + (now ? " now" : brzy ? " plan" : "") + '" data-el="' + x.u.id + '"><span class="badge" style="background:' + (now ? "#fbe5e3" : brzy ? "#fdf3dc" : "#e3edf8") + '">' +
        SVG(I_NOPOWER, 18, now ? "#a23a30" : brzy ? "#9a6a12" : "#2f6fb0", 2) + '</span><span class="grow"><span class="t1">Plánované vypnutí elektřiny</span>' +
        '<span class="t2">' + esc(k.t) + '</span><span class="t3">' + esc(k.s.replace(/ · plánované vypnutí elektřiny$/, "").replace(/^plánované vypnutí elektřiny$/, "")) + (x.u.dny.length > 1 ? " · " + x.u.dny.length + " dny" : "") + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
    });
    if (moje.length) return h;
    var okoli = elVOkoli(a), ul = [];
    okoli.forEach(function (x) { elUlice(x.u).forEach(function (n) { if (ul.indexOf(n) < 0) ul.push(n); }); });
    var txt = okoli.length ? "Pro vaši adresu není ohlášené žádné vypnutí. V okolí do " + EL_OKOLI + " m " + (okoli.length === 1 ? "je ohlášené 1 vypnutí" : "je ohlášeno " + okoli.length + " vypnutí") + " (" + esc(ul.slice(0, 3).join(", ")) + ")." :
      "Pro vaši adresu není ohlášené žádné plánované vypnutí.";
    return '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' + SVG(I_POWER, 18, "#5b5b54") + '</span><div class="grow"><div class="t1">Elektřina</div>' +
      '<div class="note" style="margin-top:2px">' + txt + " Hlídáme oznámení PREdistribuce na úředních deskách.</div>" +
      (okoli.length ? '<div class="links"><button type="button" class="link" data-el="' + okoli[0].u.id + '">Nejbližší vypnutí ' + SVG(I_CHEV, 12, "currentColor", 2.6) + "</button></div>" : "") + "</div></div>";
  }
  function viewElDetail(u) {
    var a = state.address, ted = new Date(), x = elDalsi(u, ted) || { den: u.dny[0], od: elDen(u.dny[0]) }, f = elFaze(x, ted), moje = a ? elTyka(u, a) : false;
    var nej = null;
    (u.adresy || []).forEach(function (p) { var d = a ? dist(a.lat, a.lon, p[0], p[1]) : 0; if (!nej || d < nej.d) nej = { p: p, d: d }; });
    var gm = nej ? "https://www.google.com/maps/search/?api=1&query=" + nej.p[0] + "," + nej.p[1] : "";
    var dny = u.dny.map(function (d) { var dd = elDen(d); return HDAYS[dd.getDay()] + " " + dd.getDate() + ". " + (dd.getMonth() + 1) + "."; });
    var adr = (u.adresy || []).map(function (p) { return p[2]; }).concat((u.ulice || []).map(function (n) { return n + " (celá ulice)"; }));
    var otevr = state.elVse, zob = otevr ? adr : adr.slice(0, 6);
    var gen = data.elektrina && data.elektrina.gen ? new Date(data.elektrina.gen) : null;
    return '<div class="head"><button type="button" class="btn-edit" id="vodaback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px">' + (f === "probiha" ? '<span class="vchip now"><i></i>Probíhá</span>' : '<span class="vchip plan"><i></i>Plánované vypnutí</span>') +
      '<h1 style="margin:4px 0 0;font-size:23px">Plánované vypnutí elektřiny</h1>' +
      '<div class="skadr" style="font-size:15px">' + (moje ? "Týká se vaší adresy " + esc(a.label) : a ? "V okolí vaší adresy · " + esc(elUlice(u).slice(0, 2).join(", ")) + (nej ? " · " + akVzdTxt(nej.d) : "") : "Týká se ulic " + esc(elUlice(u).slice(0, 3).join(", "))) + "</div>" +
      '<div class="dlinks">' + (gm ? '<a class="btn-ext" href="' + gm + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      '<a class="btn-ext" href="' + esc(u.u) + '" target="_blank" rel="noopener">Oznámení na úřední desce ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("el", u.id) + "</div>" + (f === "probiha" ? umtBlok("el:" + u.id, "el") : "") +
      '<div class="card dcard"><div class="vtime">' +
      '<div><div class="k">Od</div><div class="v">' + (u.od ? u.od.replace(/^0/, "") : "–") + '</div><div class="s">' + vDen(x.od, ted) + (Math.abs(akDen(x.od) - akDen(ted)) <= 864e5 ? ", " + HDAYS[x.od.getDay()].toLowerCase() + " " + x.od.getDate() + ". " + (x.od.getMonth() + 1) + "." : "") + "</div></div>" +
      '<div><div class="k">Do</div><div class="v">' + (u.do ? u.do.replace(/^0/, "") : "neuvedeno") + '</div><div class="s">tentýž den</div></div></div>' +
      (u.dny.length > 1 ? '<div class="dnote" style="margin-top:10px">Vypnutí je ohlášené na ' + u.dny.length + " dny: " + esc(dny.join(", ")) + ".</div>" : "") +
      '<div class="dnote" style="margin-top:10px">Během této doby se může proud opakovaně zapnout a znovu vypnout. Vypněte citlivé spotřebiče a nepoužívejte výtah.</div></div>' +
      '<div class="card dcard"><div class="dtitle">Kterých adres se týká · ' + adr.length + "</div>" + '<div class="ptext" style="font-size:14.5px">' + zob.map(esc).join("<br>") + "</div>" +
      (adr.length > 6 ? '<button type="button" class="spadvic" id="elvse">' + (otevr ? "Zobrazit méně" : "Další (" + (adr.length - 6) + ")") + SVG(otevr ? '<path d="m6 15 6-6 6 6"/>' : '<path d="m6 9 6 6 6-6"/>', 13, "currentColor", 2.8) + "</button>" : "") + "</div>" +
      dcard("Porucha mimo ohlášený čas", drow("Poruchová linka PREdistribuce", "800 823 823", { href: "tel:800823823", icon: I_PH })) +
      '<div class="note" style="padding:0 4px">Zdroj: oznámení PREdistribuce na úřední desce MČ Praha ' + esc(u.mc.join(" a ")) + (gen ? ", ověřeno " + vDen(gen, ted) + " v " + vHod(gen) : "") + ". Desky kontrolujeme dvakrát denně.</div></div>";
  }
  // ---- nahlášení závady (úřad / správce podle MČ, e-mail se připraví za uživatele) ----
  var I_FLAG = '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>';
  var I_MAIL = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>';
  var ZAV_P9 = { kdo: "Kontrola čistoty a černých skládek, ÚMČ Praha 9", m: "fialam@praha9.cz", t: "283 091 369" };
  var ZAV_P14 = { kdo: "Odbor životního prostředí ÚMČ Praha 14", m: "Marketa.Adamkova@praha14.cz", cc: "Lukas.Wesselsky@praha14.cz", t: "225 295 325" };
  var ZAV = [
    { k: "neporadek", n: "Nepořádek a černá skládka", p: "Např. u kontejnerů leží matrace a pytle se sutí", "9": ZAV_P9, "14": ZAV_P14 },
    { k: "kontejner", n: "Přeplněný kontejner na tříděný odpad", p: "Např. plasty přetékají už druhý den", "9": ZAV_P9,
      "14": { kdo: "Odbor životního prostředí ÚMČ Praha 14", m: "Pavel.Brazdil@praha14.cz", t: "225 295 332" } },
    { k: "zelen", n: "Dětské hřiště, zeleň, lavičky", p: "Např. rozbitá houpačka, zlomená větev, poničená lavička",
      "9": { kdo: "Úřad MČ Praha 9", m: "podatelna@praha9.cz", t: "283 091 111" }, "14": ZAV_P14 },
    { k: "lampa", n: "Nesvítí lampa", p: "Např. nesvítí lampa před vchodem, na sloupu je číslo …",
      vse: { kdo: "Technologie hl. m. Prahy", m: "poruchyvo@thmp.cz", t: "800 404 060" } },
    { k: "silnice", n: "Díra v silnici, značka, semafor", vse: { kdo: "Technická správa komunikací (TSK)", web: "https://zavady.tsk-praha.cz/" } },
    { k: "voda", n: "Voda, kanalizace", vse: { kdo: "Pražské vodovody a kanalizace", t: "840 111 112", tel: 1, pozn: "Poruchy vodovodu a kanalizace přijímá dispečink nonstop po telefonu." } },
    { k: "el", n: "Elektřina", vse: { kdo: "PREdistribuce", t: "800 823 823", tel: 1, pozn: "Poruchy dodávky elektřiny přijímá poruchová linka nonstop." } },
    { k: "plyn", n: "Plyn – cítíte plyn", vse: { kdo: "Pražská plynárenská – pohotovost", t: "1239", tel: 1, pozn: "Cítíte-li plyn, nezapínejte elektrické spotřebiče ani světla, otevřete okna, odejděte a volejte." } }
  ];
  function zavKat(k) { return ZAV.filter(function (z) { return z.k === k; })[0]; }
  function zavKam(z) { var a = state.address; return z.vse || z[a && a.mc === "9" ? "9" : "14"]; }
  function zavKarta() {
    return '<button type="button" class="card vkarta zavkarta" id="zavstart"><span class="badge" style="background:#fbe9dc">' + SVG(I_FLAG, 20, "#a2501c") + "</span>" +
      '<span class="grow"><span class="vt">Něco tu není v pořádku?</span><span class="vs">Nahlaste nepořádek, rozbitou lampu nebo díru v silnici</span></span>' + SVG(I_CHEV, 16, "#9a9484", 2.4) + "</button>";
  }
  function zavHlav(t) {
    return '<div class="head"><button type="button" class="btn-edit" id="vodaback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px"><div class="eyebrow">Nahlásit</div><h1 style="margin:0;font-size:24px">' + esc(t) + "</h1>";
  }
  function viewZavada() {
    var a = state.address, z = zavKat(state.zav);
    if (!z) {
      return zavHlav("Co se děje?") + '<div class="card zavlist">' + ZAV.map(function (x) {
        var k = zavKam(x);
        return '<button type="button" class="zavrow" data-zav="' + x.k + '"><span class="grow"><span class="vt">' + esc(x.n) + '</span><span class="vs">' + esc(k.kdo) +
          (k.tel ? " · telefon" : k.web ? " · formulář" : " · e-mail") + "</span></span>" + SVG(I_CHEV, 16, "#9a9484", 2.4) + "</button>";
      }).join("") + "</div></div>";
    }
    var k = zavKam(z), h = zavHlav(z.n);
    if (k.tel) {
      return h + '<div class="card dcard"><div class="ptext" style="font-size:15px">' + esc(k.pozn) + " Volejte <b>" + esc(k.kdo) + "</b>.</div>" +
        '<a class="btn zavbtn" href="tel:' + k.t.replace(/\s/g, "") + '">' + SVG(I_PH_P, 18, "#fff", 2.2) + "Zavolat " + esc(k.t) + "</a>" +
        '<div class="note" style="text-align:center;margin-top:10px">Připravte si adresu: ' + esc(a.label) + "</div></div></div>";
    }
    if (k.web) {
      return h + '<div class="card dcard"><div class="ptext" style="font-size:15px">Díry v silnici, poškozené značky a nefunkční semafory řeší <b>' + esc(k.kdo) + "</b> přes svůj formulář. Uveďte v něm adresu " + esc(a.label) + ".</div>" +
        '<a class="btn zavbtn" href="' + k.web + '" target="_blank" rel="noopener">Otevřít formulář TSK ' + SVG(I_EXT, 14, "#fff", 2.4) + "</a></div></div>";
    }
    var poz = state.zavPoz;
    return h + '<div class="card dcard"><div class="dtitle">Kde</div><div class="zavkde">' + SVG(PIN, 18, "var(--green)", 2.2) +
      '<span class="grow"><b>' + (poz ? "Vaše aktuální poloha" : "U adresy " + esc(a.label)) + "</b></span></div>" +
      (navigator.geolocation ? '<button type="button" class="link" id="zavpoz" style="margin-top:6px">' + (poz ? "Použít adresu " + esc(a.label) : "Použít mou aktuální polohu") + "</button>" : "") + "</div>" +
      '<div class="card dcard"><div class="dtitle">Co přesně</div><textarea id="zavtxt" class="zavtxt" rows="4" placeholder="' + esc(z.p) + '">' + esc(state.zavTxt || "") + "</textarea>" +
      '<div class="note" style="margin-top:8px">Fotku přiložíte v e-mailu.</div></div>' +
      '<button type="button" class="btn zavbtn" id="zavsend">' + SVG(I_MAIL, 18, "#fff", 2.2) + "Odeslat úřadu</button>" +
      '<div class="note" style="text-align:center">Otevře se váš e-mail s připraveným textem a mapou místa. Adresát: ' + esc(k.kdo) + ". Stačí odeslat.</div>" +
      '<div class="card dcard"><div class="dtitle">Raději zavolat?</div><a class="vlink" style="margin-top:6px;display:inline-flex;gap:6px;align-items:center" href="tel:' + k.t.replace(/\s/g, "") + '">' + I_PH + esc(k.t) + "</a></div></div>";
  }
  var I_PH_P = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>';
  function zavOdeslat() {
    komZapis("hlaseni");
    var a = state.address, z = zavKat(state.zav), k = zavKam(z), poz = state.zavPoz;
    var lat = poz ? poz[0] : a.lat, lon = poz ? poz[1] : a.lon;
    var txt = (state.zavTxt || "").trim();
    var body = "Dobrý den,\n\nchci nahlásit: " + z.n.toLowerCase() + ".\n\n" +
      "Místo: " + (poz ? "poblíž adresy " + a.label + " (podle polohy telefonu)" : a.label) + "\n" +
      "Mapa: https://www.google.com/maps/search/?api=1&query=" + lat.toFixed(6) + "," + lon.toFixed(6) + "\n\n" +
      (txt ? "Popis: " + txt + "\n\n" : "") + "Děkuji za vyřešení.\n\n--\nNahlášeno přes aplikaci Pod okny\n";
    location.href = "mailto:" + k.m + "?" + (k.cc ? "cc=" + encodeURIComponent(k.cc) + "&" : "") +
      "subject=" + encodeURIComponent("Hlášení: " + z.n + " – " + a.label) + "&body=" + encodeURIComponent(body);
  }
  function openZav(k) {
    if (!state.zav) state.vodaZ = { tab: state.tab, y: window.scrollY };
    state.zav = k || "list"; state.zavTxt = ""; state.zavPoz = null;
    try { history.pushState({ voda: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  // ---- Zapojte se: participativní rozpočet Prahy 14 (termíny podle pravidel 5. ročníku, kontrolovat jednou ročně) ----
  var I_BULB = '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>';
  var PAR_WEB = "https://projekty.praha14.cz/paroz/participativni-rozpocet";
  var PAR = [
    { k: "podani", n: "Podávání nápadů", od: "2026-10-01", do: "2026-12-31", t: "1. 10. – 31. 12. 2026" },
    { k: "kontrola", n: "Kontrola úřadem", od: "2027-01-01", do: "2027-04-30", t: "leden – duben 2027" },
    { k: "hlasovani", n: "Hlasování obyvatel", od: "2027-06-01", do: "2027-06-20", t: "1. – 20. 6. 2027" },
    { k: "vysledky", n: "Výsledky", od: "2027-07-01", do: "2027-07-31", t: "červenec 2027" },
    { k: "realizace", n: "Realizace", od: "2027-10-01", do: "2029-12-31", t: "od října 2027" }
  ];
  function parFaze() { var d = isoDen(new Date()); return PAR.filter(function (f) { return f.od <= d && d <= f.do; })[0] || null; }
  function parDo(f) { var x = f.do.split("-"); return +x[2] + ". " + +x[1] + "."; }
  function parKarta(a) {
    var f = parFaze();
    if (!a || a.mc !== "14" || !f || (f.k !== "podani" && f.k !== "hlasovani" && f.k !== "vysledky")) return "";
    var t = f.k === "podani" ? ["Máte nápad pro svou čtvrť?", "Praha 14 ho může zaplatit z participativního rozpočtu"] :
      f.k === "hlasovani" ? ["Hlasujte o projektech pro Prahu 14", "Které nápady sousedů se uskuteční, rozhodujete vy"] :
      ["Známe vítěze participativního rozpočtu", "Podívejte se, co se v Praze 14 postaví"];
    return '<button type="button" class="card vkarta parkarta" id="parstart"><span class="badge" style="background:#fff">' + SVG(I_BULB, 20, "var(--green)") + "</span>" +
      '<span class="grow"><span class="pareb">Zapojte se' + (f.k === "vysledky" ? "" : " · do " + parDo(f)) + '</span><span class="vt">' + t[0] + '</span><span class="vs">' + t[1] + "</span></span>" + SVG(I_CHEV, 16, "#7d9a85", 2.4) + "</button>";
  }
  // Praha 9 nemá participativní rozpočet – ukazujeme nejnovější výzvu z aktualit MČ (anketa, projednání, úklid)
  function vyzvaKarta(a) {
    var v = a && a.mc === "9" && data.vyzvy && data.vyzvy.p9 ? data.vyzvy.p9[0] : null;
    if (!v) return "";
    var d = v.do ? v.do.split("-") : null;
    return '<a class="card vkarta parkarta" href="' + esc(v.u) + '" target="_blank" rel="noopener"><span class="badge" style="background:#fff">' + SVG(I_BULB, 20, "var(--green)") + "</span>" +
      '<span class="grow"><span class="pareb">Zapojte se' + (d ? " · do " + +d[2] + ". " + +d[1] + "." : "") + '</span><span class="vt">' + esc(v.t) + '</span><span class="vs">Praha 9 se ptá obyvatel · na webu MČ</span></span>' + SVG(I_EXT, 14, "#7d9a85", 2.4) + "</a>";
  }
  function viewPar() {
    var f = parFaze(), k = f ? f.k : "";
    var cta = k === "podani" ? ["Podat nápad do " + parDo(f), PAR_WEB + "/podat-projekt"] : k === "hlasovani" ? ["Hlasovat do " + parDo(f), PAR_WEB] :
      k === "vysledky" ? ["Výsledky hlasování", PAR_WEB + "/vysledky-hlasovani"] : ["Web participativního rozpočtu", PAR_WEB];
    return zavHlav("Participativní rozpočet").replace('<div class="eyebrow">Nahlásit</div>', '<div class="eyebrow">Zapojte se · Praha 14</div>') +
      '<div class="ptext" style="font-size:15px">Navrhněte, co by se mělo v okolí zlepšit – lavičky, zeleň, hřiště, komunitní akce. Nejlepší nápady vyberou v hlasování sami obyvatelé a městská část je zaplatí.</div>' +
      '<a class="btn zavbtn" href="' + cta[1] + '" target="_blank" rel="noopener">' + esc(cta[0]) + " " + SVG(I_EXT, 14, "#fff", 2.4) + "</a>" +
      '<a class="btn-ext" style="align-self:center" href="' + PAR_WEB + '/zasady" target="_blank" rel="noopener">Pravidla a příklady projektů ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" +
      '<div class="card dcard"><div class="dtitle">Jak to probíhá</div>' + PAR.map(function (x) {
        var on = x.k === k;
        return '<div class="parf' + (on ? " on" : "") + '"><i></i><div><div class="pn">' + esc(x.n) + (on ? ' <span class="parted">teď</span>' : "") + '</div><div class="pt">' + esc(x.t) + "</div></div></div>";
      }).join("") + "</div>" +
      '<div class="note">Až začne hlasování, připomeneme ho tady i na Domů.</div></div>';
  }
  // ---- „U mě taky“: anonymní potvrzení probíhajícího výpadku sousedy (API na Cloudflare, adresa v data/api.json) ----
  var I_USERS = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>';
  var umtApi = null, umtData = {};
  function umtUrl() {
    if (!umtApi) umtApi = getJSON("data/api.json").then(function (j) { return j && j.url; }).catch(function () { return null; });
    return umtApi;
  }
  function umtZarizeni() {
    var d = null;
    try { d = localStorage.getItem("podokny-zarizeni"); } catch (e) {}
    if (!d) {
      d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^\w-]/g, "");
      try { localStorage.setItem("podokny-zarizeni", d); } catch (e) {}
    }
    return d;
  }
  function umtSousede(n) { return n + (n === 1 ? " soused" : n >= 2 && n <= 4 ? " sousedé" : " sousedů"); }
  function umtObsah(k, co) {
    var r = umtData[k];
    if (r && r.ja === "ano") return '<div class="umt hotovo"><div class="umth">' + SVG('<path d="M20 6 9 17l-5-5"/>', 18, "var(--green)", 2.4) + "Díky, zapsáno</div>" +
      '<div class="umtn">' + SVG(I_USERS, 15, "#4d5a4f") + "<span><b>" + umtSousede(r.ano) + "</b> z okolí " + (r.ano >= 2 && r.ano <= 4 ? "jsou" : "je") + " na tom stejně</span></div>" +
      '<button type="button" class="link umtzrus" data-umt="zrus">Zrušit</button></div>';
    if (r && r.ja === "ne") return '<div class="umt hotovo"><div class="umth">' + SVG('<path d="M20 6 9 17l-5-5"/>', 18, "var(--green)", 2.4) + "Díky, zapsáno, že " + (co === "voda" ? "vodu máte" : "proud máte") + "</div>" +
      '<button type="button" class="link umtzrus" data-umt="zrus">Zrušit</button></div>';
    return '<div class="umt"><div class="umtq">' + (co === "voda" ? "Jste teď bez vody?" : "Jste teď bez proudu?") + "</div>" +
      '<div class="umtb"><button type="button" class="btn" data-umt="ano">U mě taky</button><button type="button" class="btn umtne" data-umt="ne">' + (co === "voda" ? "Mám vodu" : "Mám proud") + "</button></div>" +
      '<div class="umtn">' + (r ? (r.ano ? SVG(I_USERS, 15, "#726c5a") + "<span><b>" + umtSousede(r.ano) + "</b> z okolí to " + (r.ano === 1 ? "potvrdil" : r.ano <= 4 ? "potvrdili" : "potvrdilo") + " za poslední hodinu</span>" : "Zatím to nikdo z okolí nepotvrdil.") : "&nbsp;") + "</div></div>";
  }
  function umtBlok(k, co) { return '<div id="umtbox" data-k="' + esc(k) + '" data-co="' + co + '">' + umtObsah(k, co) + "</div>"; }
  function umtNapoj() {
    var box = document.getElementById("umtbox");
    if (!box) return;
    var k = box.getAttribute("data-k"), co = box.getAttribute("data-co"), d = umtZarizeni();
    function prekresli() { var b = document.getElementById("umtbox"); if (b && b.getAttribute("data-k") === k) { b.innerHTML = umtObsah(k, co); umtTlacitka(); } }
    function umtTlacitka() {
      document.querySelectorAll("#umtbox [data-umt]").forEach(function (t) {
        t.addEventListener("click", function () {
          var a = t.getAttribute("data-umt"), r = umtData[k] || { ano: 0, ne: 0, ja: null };
          if (a === "ano" && r.ja !== "ano") komZapis("umt");
          // hned ukázat výsledek, server pak pošle přesná čísla
          if (r.ja) r[r.ja] = Math.max(0, r[r.ja] - 1);
          if (a !== "zrus") r[a] = (r[a] || 0) + 1;
          r.ja = a === "zrus" ? null : a; umtData[k] = r; prekresli();
          umtUrl().then(function (u) {
            if (!u) return;
            return fetch(u + "/umetaky", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: k, d: d, a: a }) })
              .then(function (x) { return x.ok ? x.json() : null; }).then(function (j) { if (j) { umtData[k] = j; prekresli(); } });
          }).catch(function () {});
        });
      });
    }
    umtTlacitka();
    umtUrl().then(function (u) {
      if (!u) return;
      return fetch(u + "/umetaky?k=" + encodeURIComponent(k) + "&d=" + encodeURIComponent(d)).then(function (x) { return x.ok ? x.json() : null; })
        .then(function (j) { if (j && j[k]) { umtData[k] = j[k]; prekresli(); } });
    }).catch(function () {});
  }
  // ---- detail uzavírky a odstávky teplé vody (kvůli sdílení) ----
  function hashId(t) { var h = 0; t = String(t); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function uzVse() {
    if (!data.doprava) return [];
    var vid = {}, oop = (data.opatreni && data.opatreni.oop || []).concat(data.rizeni && data.rizeni.oop || []).filter(function (x) { if (vid[x.u]) return false; vid[x.u] = 1; return true; });
    return (data.doprava.uzavirky || []).concat(oop);
  }
  function uzId(x) { return hashId([x.n, (x.ul || []).join(","), x.od, x.do, x.mc].join("|")); }
  function uzById(id) { return uzVse().filter(function (x) { return uzId(x) === id; })[0]; }
  function tvId(o) { return hashId([o.mc, o.name, o.from].join("|")); }
  function tvById(id) { return (data.outages && data.outages.list || []).filter(function (o) { return tvId(o) === id; })[0]; }
  var DNY_GEN = ["neděle", "pondělí", "úterý", "středy", "čtvrtka", "pátku", "soboty"];
  function detDen(iso) { if (!iso) return ["neuvedeno", ""]; var d = new Date(iso + "T00:00:00"); return [d.getDate() + ". " + (d.getMonth() + 1) + ".", DNY_CELE[d.getDay()]]; }
  function detCas(od, aDo, pozn) {
    var a = detDen(od), b = detDen(aDo);
    return '<div class="card dcard"><div class="vtime"><div><div class="k">Od</div><div class="v">' + a[0] + '</div><div class="s">' + a[1] + "</div></div>" +
      '<div><div class="k">Do</div><div class="v">' + b[0] + '</div><div class="s">' + b[1] + "</div></div></div>" + (pozn ? '<div class="dnote" style="margin-top:10px">' + pozn + "</div>" : "") + "</div>";
  }
  function detHlava() { return '<div class="head"><button type="button" class="btn-edit" id="vodaback" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>"; }
  function viewUzDetail(x) {
    var a = state.address, d = a && x.lat != null ? dist(a.lat, a.lon, x.lat, x.lon) : null, ndic = x.z === "ndic", ted = probiha(x);
    var gm = x.lat != null ? "https://www.google.com/maps/search/?api=1&query=" + x.lat + "," + x.lon : "";
    var p = datumy(x.p || "");
    return detHlava() + '<div class="body" style="gap:12px;padding-bottom:28px">' + (ted ? '<span class="vchip now"><i></i>Probíhá</span>' : '<span class="vchip plan"><i></i>Plánovaná uzavírka</span>') +
      '<h1 style="margin:4px 0 0;font-size:23px">' + esc(x.ul && x.ul.length ? "Uzavírka " + x.ul.join(", ") : x.n) + "</h1>" +
      '<div class="skadr" style="font-size:15px">' + esc(x.ul && x.ul.length ? x.n : "Praha " + x.mc) + (d != null ? " · " + akVzdTxt(d) + " od vás" : "") + "</div>" +
      '<div class="dlinks">' + (gm ? '<a class="btn-ext" href="' + gm + '" target="_blank" rel="noopener">Otevřít v Google Mapách ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      (x.u ? '<a class="btn-ext" href="' + esc(x.u) + '" target="_blank" rel="noopener">' + (ndic ? "Dopravní info " : "Opatření na úřední desce ") + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") + sdilBtn("uz", uzId(x)) + "</div>" +
      detCas(x.od, x.do, x.do ? "Konec je plánovaný termín silničního úřadu, uzavírka může skončit dřív." : "") +
      (p ? '<div class="card dcard"><div class="dtitle">Co se děje</div><div class="ptext" style="font-size:14.5px">' + esc(p) + "</div></div>" : "") +
      '<div class="note" style="padding:0 4px">' + (ndic ? "Zdroj: Národní dopravní informační centrum (NDIC), aktualizace každých 10 minut." : "Zdroj: úřední deska MČ Praha " + esc(x.mc) + ", kontrolujeme dvakrát denně.") + "</div></div>";
  }
  function viewTvDetail(o) {
    var t0 = den0(), f = new Date(o.from + "T00:00:00"), ted = f <= t0;
    var src = data.outages.src && data.outages.src[o.mc];
    return detHlava() + '<div class="body" style="gap:12px;padding-bottom:28px">' + (ted ? '<span class="vchip now"><i></i>Probíhá</span>' : '<span class="vchip plan"><i></i>Plánovaná odstávka</span>') +
      '<h1 style="margin:4px 0 0;font-size:23px">Odstávka teplé vody</h1>' +
      '<div class="skadr" style="font-size:15px">' + esc(o.name) + "</div>" +
      '<div class="dlinks">' + (src ? '<a class="btn-ext" href="' + esc(src) + '" target="_blank" rel="noopener">Oznámení MČ Praha ' + esc(o.mc) + " " + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" : "") +
      '<a class="btn-ext" href="https://www.ptas.cz/aktuality/" target="_blank" rel="noopener">Pražská teplárenská ' + SVG(I_EXT, 12, "currentColor", 2.4) + "</a>" + sdilBtn("tv", tvId(o)) + "</div>" +
      detCas(o.from, o.to, "Dodávku teplé vody přerušuje Pražská teplárenská kvůli plánovaným pracím. Týká se domů napojených na dálkové teplo.") +
      '<div class="note" style="padding:0 4px">Zdroj: ' + (src ? esc(src.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]) : "MČ") + ". Termíny přepisujeme ručně z oznámení MČ, změny na stránce hlídáme denně.</div></div>";
  }
  function openDet(k, id) {
    state.vodaZ = { tab: state.tab, y: window.scrollY };
    state.uzSel = k === "uz" ? id : null; state.tvSel = k === "tv" ? id : null;
    try { history.pushState({ voda: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  // ---- Tento týden u vás (Domů) ----
  var I_T_DROP = '<path d="M12 2.7s6 6.1 6 10.8a6 6 0 0 1-12 0C6 8.8 12 2.7 12 2.7Z"/>';
  var I_T_BOLT = '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>';
  var I_T_FIRE = '<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-9-2 2-2 4-2 4s-1-2-3-3c0 3-5 5-5 8 0 4.3 3 7 7 7Z"/>';
  var I_T_SWEEP = '<path d="M3 21h18M6 21l2-8h8l2 8M10 13V4a2 2 0 0 1 4 0v9"/>';
  var I_T_CONE = '<path d="M9.3 3h5.4l5.3 16H4L9.3 3Z"/><path d="M7 11h10M5.5 15.5h13"/>';
  var I_T_CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
  var I_T_USERS = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>';
  var TYD_N = 5;
  function pricti(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }   // bez 864e5 kvůli změně času
  function tydOkno(ted) {
    var d = den0(), po = pricti(d, -((d.getDay() + 6) % 7));
    var pristi = ted.getDay() === 0 || ted.getDay() === 6;        // o víkendu už příští týden (zbytek týdne ukazuje „Dnes a zítra“)
    if (pristi) po = pricti(po, 7);
    return { od: po, do: pricti(po, 7), pristi: pristi };
  }
  function dm(d) { return d.getDate() + ". " + (d.getMonth() + 1) + "."; }
  function hm(s) { return s ? String(s).replace(/^0/, "") : ""; }
  function tydPolozky(a, ted) {
    var w = tydOkno(ted), r = [], d0 = den0();
    var v = function (d) { return d && d >= w.od && d < w.do && d >= d0; };
    vodaPro(a).forEach(function (x) {
      var od = vCas(x.u.od), dd = vCas(x.u.do);
      if (v(akDen(od))) r.push({ d: od, ic: I_T_DROP, fg: "#2f6fb0", t: "Odstávka vody " + vHod(od) + (dd ? "–" + vHod(dd) : ""), s: ulicePrvni(x.u.adresy, 2), act: "voda:" + x.u.id });
    });
    elPro(a).forEach(function (x) {
      if (v(akDen(x.x.od))) r.push({ d: x.x.od, ic: I_T_BOLT, fg: "#9a6a12", t: "Vypnutý proud" + (x.u.od ? " " + hm(x.u.od) + (x.u.do ? "–" + hm(x.u.do) : "") : ""), s: elUlice(x.u).slice(0, 2).join(", "), act: "el:" + x.u.id });
    });
    var o = outageFor(a);
    if (o && v(new Date(o.from + "T00:00:00"))) r.push({ d: new Date(o.from + "T00:00:00"), ic: I_T_FIRE, fg: "#b8582a", t: "Odstávka teplé vody", s: "do " + dm(new Date(o.to + "T00:00:00")) + " · " + o.name, act: "tv:" + tvId(o) });
    var c = cisteniPro(a);
    if (c && v(new Date(c.d + "T00:00:00"))) {
      var cd = new Date(c.d + "T00:00:00"), pred = pricti(cd, -1);
      r.push({ d: cd, ic: I_T_SWEEP, fg: "#9a6a12", t: "Blokové čištění " + c.u, s: (c.od ? c.od + "–" + (c.do || "") + " · " : "") + "přeparkujte " + (pred < d0 ? "hned" : DNY_GEN[pred.getDay()] === "neděle" ? "v neděli večer" : "v " + DNY_CELE[pred.getDay()].replace("středa", "středu").replace("sobota", "sobotu").replace("neděle", "neděli") + " večer"), act: "tab:doprava" });
    }
    var uz = uzavirkyPro(a).filter(function (x) { return x.d != null && x.d <= 1000; }), trva = null;
    uz.forEach(function (x) {
      var od = x.x.od ? new Date(x.x.od + "T00:00:00") : null;
      if (v(od) && od > d0) r.push({ d: od, ic: I_T_CONE, fg: "#b03a3a", t: "Začíná uzavírka " + (x.x.ul && x.x.ul.length ? x.x.ul.join(", ") : x.x.n), s: (x.x.do ? "do " + dm(new Date(x.x.do + "T00:00:00")) + " · " : "") + akVzdTxt(x.d), act: "uz:" + uzId(x.x) });
      else if (!trva && probiha(x.x) && !w.pristi) trva = x;
    });
    if (data.akce) {
      var pa = pricti(w.od, 4), ak = akVse(ted).filter(function (x) {
        var s = akD(x.od), dz = akVzd(x); return !x.z && s >= pa && s < w.do && (dz == null || dz <= 3000);
      });
      if (ak.length) r.push({ d: pa, dn: "Pá–Ne", ic: I_T_CAL, fg: "#2f6fb0", t: pl(ak.length, "akce", "akce", "akcí") + " v okolí", s: ak[0].t + (ak.length > 1 ? " a další" : ""), act: "tab:akce" });
    }
    r.sort(function (x, y) { return x.d - y.d; });
    if (trva) r.unshift({ d: trva.x.od ? new Date(trva.x.od + "T00:00:00") : d0, trva: 1, ic: I_T_CONE, fg: "#b03a3a", t: "Uzavírka " + (trva.x.ul && trva.x.ul.length ? trva.x.ul.join(", ") : trva.x.n) + " trvá",
      s: (trva.x.do ? "do " + dm(new Date(trva.x.do + "T00:00:00")) + " · " : "") + akVzdTxt(trva.d), act: "uz:" + uzId(trva.x) });
    return { w: w, r: r };
  }
  function tydenKarta(a) {
    var t = tydPolozky(a, new Date()), w = t.w, r = t.r, konec = pricti(w.do, -1);
    var rozsah = dm(w.od) + " – " + dm(konec);
    var zob = state.tydVse ? r : r.slice(0, TYD_N);
    var h = '<div class="hsec"><b>' + (w.pristi ? "Příští týden u vás" : "Tento týden u vás") + '</b><span class="tydr">' + rozsah + "</span></div><div class=\"card tyd\">";
    if (!r.length) h += '<div class="tydklid">' + SVG('<path d="M20 6 9 17l-5-5"/>', 18, "#2f6b45", 2.4) + "<span><b>Klidný týden</b><span>Na vaší adrese se nic neplánuje. Kdyby se něco změnilo, uvidíte to tady.</span></span></div>";
    h += zob.map(function (x) {
      return '<button type="button" class="tydr1" data-act="' + esc(x.act) + '"><span class="tydd"><b>' + (x.dn || (x.trva ? "od " : "") + HDAYS[x.d.getDay()]) + "</b><small>" + dm(x.d) + "</small></span>" +
        '<span class="tydi">' + SVG(x.ic, 16, x.fg, 2.2) + '</span><span class="grow"><span class="tydt">' + esc(x.t) + '</span><span class="tyds">' + esc(x.s) + "</span></span></button>";
    }).join("");
    if (r.length > TYD_N) h += '<button type="button" class="tydvic" id="tydvic">' + (state.tydVse ? "Zobrazit méně" : "Další " + (r.length - TYD_N) + (w.pristi ? " v příštím týdnu" : " v tomto týdnu")) + "</button>";
    h += '<div id="ctvrt" data-part="' + esc(a.part || "Praha " + a.mc) + '"></div></div>';
    return h;
  }
  // komunita: anonymní počty za čtvrť (hlášení, „U mě taky“, sdílení) přes API Pod okny
  function komZapis(typ) {
    var a = state.address; if (!a) return;
    umtUrl().then(function (u) {
      if (!u) return;
      fetch(u + "/udalost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typ: typ, part: a.part || "Praha " + a.mc }) }).catch(function () {});
    }).catch(function () {});
  }
  function komNacti() {
    var el = document.getElementById("ctvrt");
    if (!el) return;
    var part = el.getAttribute("data-part"), po = tydOkno(new Date()).od, od = pricti(po, -7), dO = po;
    var vypis = function (j) {
      var e = document.getElementById("ctvrt"); if (!e || !j) return;
      var c = [];
      if (j.hlaseni) c.push("nahlásili " + pl(j.hlaseni, "problém", "problémy", "problémů"));
      if (j.umt) c.push("potvrdili " + pl(j.umt, "výpadek", "výpadky", "výpadků"));
      if (j.sdileni) c.push("poslali dál " + pl(j.sdileni, "upozornění", "upozornění", "upozornění"));
      if (!c.length) { e.innerHTML = ""; return; }
      e.innerHTML = '<div class="tydkom">' + SVG(I_T_USERS, 18, "#1f4d36", 2) + "<span><b>" + esc(part) + " minulý týden:</b> sousedé " + (c.length > 1 ? c.slice(0, -1).join(", ") + " a " + c[c.length - 1] : c[0]) + ".</span></div>";
    };
    var k = part + od.getTime();
    if (komNacti.c && komNacti.c[k]) { vypis(komNacti.c[k]); return; }
    umtUrl().then(function (u) {
      if (!u) return;
      return fetch(u + "/ctvrt?part=" + encodeURIComponent(part) + "&od=" + od.getTime() + "&do=" + dO.getTime()).then(function (x) { return x.ok ? x.json() : null; })
        .then(function (j) { komNacti.c = komNacti.c || {}; komNacti.c[k] = j; vypis(j); });
    }).catch(function () {});
  }
  // ---- víc adres: panel, přidání, upozornění z dalších adres ----
  var ADR_IC = { "Domov": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    "Rodiče": '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    "Práce": '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    "Škola": '<path d="M2 9 12 4l10 5-10 5Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    "Chata": '<path d="M12 3 4 15h5l-3 5h12l-3-5h5Z"/>' };
  var ADR_BARVY = { "Domov": ["#e7efe5", "#1f4d36"], "Rodiče": ["#fbe9ef", "#a83a5c"], "Práce": ["#e3edf8", "#2f6fb0"], "Škola": ["#f1ebfa", "#6a4aa8"], "Chata": ["#eef4e2", "#4f6b1f"] };
  var ADR_NAZVY = ["Domov", "Rodiče", "Práce", "Škola", "Chata"];
  function adrIkona(n) { var b = ADR_BARVY[n] || ["#efece2", "#6b6652"]; return '<span class="adric" style="background:' + b[0] + '">' + SVG(ADR_IC[n] || PIN, 18, b[1], 2.2) + "</span>"; }
  function adrProblem(x) {
    var al = domuUpozorneni(x).filter(function (u) { return u.cls === "now" || u.cls === "plan"; });
    return al[0] || null;
  }
  function adrJinde() {
    var av = adrNacti(), r = [];
    av.list.forEach(function (x, i) { if (i !== av.akt && x.upoz !== false) { var p = adrProblem(x); if (p) r.push({ i: i, x: x, p: p }); } });
    if (!r.length) return "";
    return '<div class="hsub">Na dalších adresách</div>' + r.slice(0, 2).map(function (y) {
      return '<button type="button" class="card adrj" data-adr="' + y.i + '"><span class="badge" style="background:' + (y.p.cls === "now" ? "#fbe5e3" : "#fdf3dc") + '">' + SVG(y.p.ic, 18, y.p.fg) + "</span>" +
        '<span class="grow"><span class="vt">' + esc(y.x.nazev) + " · " + esc(y.p.t.charAt(0).toLowerCase() + y.p.t.slice(1)) + '</span><span class="vs">' + esc(y.x.label) + " · " + esc(y.p.s) + "</span></span>" + SVG(I_CHEV, 16, "#9a9484", 2.4) + "</button>";
    }).join("");
  }
  function adrPanel() {
    var av = adrNacti();
    var h = '<div class="sheet-bg" data-adrclose="1"></div><div class="sheet" role="dialog" aria-label="Moje adresy"><div class="grab"></div>' +
      '<div class="shhead"><div class="shh">Moje adresy</div><button type="button" class="shx" data-adrclose="1" aria-label="Zavřít">' + SVG('<path d="M6 6l12 12M18 6 6 18"/>', 16, "currentColor", 2.4) + "</button></div>";
    h += av.list.map(function (x, i) {
      var p = i !== av.akt ? adrProblem(x) : null, otev = state.adrMenu === i;
      return '<div class="adrr"><button type="button" class="adrrb" data-adr="' + i + '">' + adrIkona(x.nazev) + '<span class="grow"><span class="vt">' + esc(x.nazev) +
        (p ? ' <span class="adrtag ' + p.cls + '">' + esc(p.t.split(" · ")[0].toLowerCase()) + "</span>" : "") + '</span><span class="vs">' + esc(x.label) + (x.part ? " · " + esc(x.part) : "") + "</span></span>" +
        (i === av.akt ? SVG('<path d="M20 6 9 17l-5-5"/>', 20, "var(--green)", 2.6) : "") + "</button>" +
        '<button type="button" class="adrdots" data-adrmenu="' + i + '" aria-label="Upravit">' + SVG('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', 18, "#9a9484", 2) + "</button></div>" +
        (otev ? '<div class="adrakce"><button type="button" class="btn-ext" data-adrren="' + i + '">Přejmenovat</button><button type="button" class="btn-ext adrdel" data-adrdel="' + i + '">Odebrat</button></div>' : "");
    }).join("");
    h += av.list.length < ADR_MAX ? '<button type="button" class="adradd" id="adradd">' + SVG('<path d="M12 5v14M5 12h14"/>', 20, "var(--green)", 2.4) + "Přidat adresu</button>" :
      '<div class="note" style="padding:12px 0 0">Máte uložených ' + ADR_MAX + " adres. Pro novou nějakou odeberte.</div>";
    return h + '<div class="note" style="margin-top:10px">Uložit můžete až ' + ADR_MAX + " adres v Praze 9 a 14. Zůstávají jen ve vašem telefonu.</div></div>";
  }
  function viewPojmenuj() {
    var x = state.adrNova, ren = state.adrRen != null, n = state.adrNazev || (ren ? x.nazev : "");
    var jine = n && ADR_NAZVY.indexOf(n) < 0;
    return '<div class="head"><button type="button" class="btn-edit" id="adrzpet" style="align-self:flex-start">' + SVG('<path d="m15 6-6 6 6 6"/>', 14, "currentColor", 2.4) + "Zpět</button></div>" +
      '<div class="body" style="gap:12px;padding-bottom:28px"><div class="eyebrow">' + (ren ? "Přejmenovat adresu" : "Přidat adresu") + '</div><h1 style="margin:0;font-size:24px">' + esc(x.label) + "</h1>" +
      '<div class="note" style="margin:-6px 0 4px">' + esc((x.part ? x.part + " · " : "") + "Praha " + x.mc) + '</div><div class="t1">Jak ji pojmenujeme?</div><div class="adrchips">' +
      ADR_NAZVY.map(function (c) { return '<button type="button" class="adrchip' + (n === c ? " on" : "") + '" data-adrnaz="' + c + '">' + c + "</button>"; }).join("") +
      '<button type="button" class="adrchip' + (jine || state.adrJine ? " on" : "") + '" data-adrnaz="">Jiné…</button></div>' +
      (jine || state.adrJine ? '<input id="adrvlastni" class="input" type="text" maxlength="20" placeholder="Např. Babička" value="' + esc(jine ? n : "") + '">' : "") +
      '<label class="card adrup"><span class="grow"><b>Upozorňovat i na tuto adresu</b><span class="vs">Odstávky a výpadky uvidíte na Domů u hlavní adresy</span></span><input type="checkbox" id="adrupoz"' + (x.upoz === false ? "" : " checked") + "></label>" +
      '<button type="button" class="btn zavbtn" id="adruloz"' + (n ? "" : " disabled") + ">" + (ren ? "Uložit" : "Uložit adresu") + "</button></div>";
  }
  function adrPrepni(i) {
    var av = adrNacti(); if (!av.list[i]) return;
    av.akt = i; adrUloz(av); state.address = av.list[i]; state.adrPanel = false; state.adrMenu = null; state.tab = "domu"; state.domuVse = false;
    render(); window.scrollTo(0, 0);
  }
  function openEl(id) {
    state.vodaZ = { tab: state.tab, y: window.scrollY };
    state.elSel = String(id); state.elVse = false;
    try { history.pushState({ voda: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }

  // ---- sdílení upozornění sousedům ----
  // Odkaz #voda=ID / #el=ID / #pat=ID / #eia=KOD otevře u příjemce rovnou detail, i bez zadané adresy.
  var I_SHARE = '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>';
  function sdilUrl(k, id) { return location.origin + location.pathname + "#" + k + "=" + encodeURIComponent(id); }
  function ulicePrvni(adr, n) {
    var ul = [];
    (adr || []).forEach(function (p) { var x = (p[2] || "").replace(/\s+\d.*$/, ""); if (x && ul.indexOf(x) < 0) ul.push(x); });
    return ul.slice(0, n || 2).join(", ") + (ul.length > (n || 2) ? " a okolí" : "");
  }
  function sdilText(k, id) {
    var ted = new Date();
    if (k === "voda") {
      var u = vodaById(id); if (!u) return null;
      var f = vodaFaze(u, ted), od = vCas(u.od), dd = vCas(u.do);
      if (!od) return null;
      var kdy = f === "probiha" || f === "po" ? "Teď neteče voda" : (vDen(od, ted).charAt(0).toUpperCase() + vDen(od, ted).slice(1)) + " od " + vHod(od) + " nepoteče voda";
      return kdy + (dd ? " (do " + (f === "probiha" || akDen(dd) - akDen(od) ? vDen(dd, ted) + " " : "") + vHod(dd) + ")" : "") + " – " + ulicePrvni(u.adresy) + ". Kde budou cisterny:";
    }
    if (k === "el") {
      var e = elById(id); if (!e) return null;
      var x = elDalsi(e, ted); if (!x) return null;      // proběhlé vypnutí už nesdílíme
      return (vDen(x.od, ted).charAt(0).toUpperCase() + vDen(x.od, ted).slice(1)) + (e.od ? " od " + e.od.replace(/^0/, "") : "") + (e.do ? " do " + e.do.replace(/^0/, "") : "") +
        " bude vypnutá elektřina – " + ulicePrvni(e.adresy) + ". Kterých adres se to týká:";
    }
    if (k === "pat") {
      var p = patById(id); if (!p || p.stav === "nalezen") return null;
      return patTitulek(p) + ". Viděli jste tuto osobu? Volejte 158. Popis a foto:";
    }
    if (k === "uz") {
      var uz = uzById(id); if (!uz || (uz.do && dnu(uz.do) < 0)) return null;
      var kde = "uzavírka " + (uz.ul && uz.ul.length ? uz.ul.join(", ") : uz.n), co = uz.ul && uz.ul.length ? " – " + uz.n.charAt(0).toLowerCase() + uz.n.slice(1) : "";
      if (probiha(uz)) return kde.charAt(0).toUpperCase() + kde.slice(1) + (uz.do ? " až do " + detDen(uz.do)[0] : "") + co + ". Podrobnosti:";
      return "Od " + (dnu(uz.od) <= 6 ? DNY_GEN[new Date(uz.od + "T00:00:00").getDay()] + " " : "") + detDen(uz.od)[0] + (uz.do ? " do " + detDen(uz.do)[0] : "") + " " + kde + co + ". Podrobnosti:";
    }
    if (k === "tv") {
      var o = tvById(id); if (!o || dnu(o.to) < 0) return null;
      if (dnu(o.from) <= 0) return "Teď neteče teplá voda – " + o.name + " (do " + DNY_GEN[new Date(o.to + "T00:00:00").getDay()] + " " + detDen(o.to)[0] + "). Podrobnosti:";
      return "Od " + (dnu(o.from) <= 6 ? DNY_GEN[new Date(o.from + "T00:00:00").getDay()] + " " : "") + detDen(o.from)[0] + " do " + detDen(o.to)[0] + " nepoteče teplá voda – " + o.name + ". Podrobnosti:";
    }
    if (k === "ak") {
      var ak = akById(id); if (!ak) return null;
      var ka = akD(ak.do || ak.od); if (ka && akDen(ka) < akDen(ted)) return null;      // proběhlé akce nesdílíme
      var sa = akD(ak.od), ca = akCasTxt(ak), mi = akMisto(ak);
      return "Akce v okolí: " + ak.t + " – " + (akDlouha(ak) ? "do " + akDatumTxt(akD(ak.do), true) : DNY_CELE[sa.getDay()] + " " + akDatumTxt(sa) + (ca ? " " + ca : "")) + (mi ? ", " + mi : "") + ". Podrobnosti:";
    }
    if (k === "st") {
      var st = stById(id); if (!st) return null;
      return (st.faze === "stavi" ? "V okolí se staví: " : st.faze === "hotovo" ? "Nově postaveno v okolí: " : "V okolí se chystá: ") + st.n + ((st.adr || []).length ? " (" + st.adr[0] + ")" : "") + ". Podrobnosti:";
    }
    if (k === "rz") {
      var rz = rzById(id); if (!rz) return null;
      return rz.druh + " v okolí: " + rz.n + " (" + rzMisto(rz) + "). Podrobnosti:";
    }
    if (k === "eia") {
      var z = eiaById(id); if (!z) return null;
      return (eiaOtevrena(z) ? "Do " + rzDat(z.lhuta) + " se můžeme vyjádřit k záměru " : "Posuzování vlivů na prostředí: ") + z.n.replace(/^"|"$/g, "") + ". Podrobnosti:";
    }
    return null;
  }
  function sdilBtn(k, id) {
    return sdilText(k, id) ? '<button type="button" class="btn-ext btn-share" data-share="' + k + ":" + esc(String(id)) + '">' + SVG(I_SHARE, 14, "currentColor", 2.2) + "Sdílet sousedům</button>" : "";
  }
  function toast(t) {
    var el = document.createElement("div");
    el.className = "toast"; el.textContent = t; (document.getElementById("app") || document.body).appendChild(el);
    setTimeout(function () { el.classList.add("pryc"); }, 2200);
    setTimeout(function () { el.remove(); }, 2700);
  }
  function sdilej(k, id) {
    var t = sdilText(k, id), url = sdilUrl(k, id);
    if (!t) return;
    komZapis("sdileni");
    if (navigator.share) { navigator.share({ title: "Pod okny", text: t, url: url }).catch(function () {}); return; }
    var hotovo = function () { toast("Zpráva s odkazem je zkopírovaná, vložte ji sousedům"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t + " " + url).then(hotovo, function () { window.prompt("Zkopírujte zprávu:", t + " " + url); });
    else window.prompt("Zkopírujte zprávu:", t + " " + url);
  }
  // příchod přes sdílený odkaz
  function sdilZHash() {
    var m = /^#(voda|el|pat|eia|ak|st|rz|uz|tv)=(.+)$/.exec(location.hash || "");
    if (!m) return;
    var k = m[1], id = decodeURIComponent(m[2]);
    if (!(k === "voda" ? vodaById(id) : k === "el" ? elById(id) : k === "pat" ? patById(id) : k === "ak" ? akById(id) : k === "st" ? stById(id) : k === "rz" ? rzById(id) : k === "uz" ? uzById(id) : k === "tv" ? tvById(id) : eiaById(id))) return;
    state.sdil = k;
    if (k === "voda") state.vodaSel = id;
    else if (k === "el") state.elSel = id;
    else if (k === "pat") state.patSel = id;
    else if (k === "uz") state.uzSel = id;
    else if (k === "tv") state.tvSel = id;
    else if (k === "ak") { state.tab = "akce"; state.akView = "detail"; state.akSel = id; state.akHist = []; }
    else if (k === "st") { state.tab = "stavby"; state.stView = "detail"; state.stSel = id; state.stHist = []; }
    else if (k === "rz") { state.tab = "stavby"; state.stView = "rizeni"; state.stSel = id; state.stHist = []; }
    else { state.tab = "stavby"; state.stView = "eia"; state.stSel = id; state.stHist = []; }
  }
  function sdilKonec() {
    state.sdil = null; state.vodaSel = null; state.elSel = null; state.patSel = null; state.uzSel = null; state.tvSel = null; state.stView = "list"; state.stSel = null; state.stHist = []; state.akView = "list"; state.akHist = [];
    if (!state.address) state.tab = "domu";
    else if (state.tab === "stavby" || state.tab === "akce") state.tab = "domu";
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  // detail pro příjemce bez adresy + pozvánka
  function sdilHtml() {
    var h = state.patSel && patById(state.patSel) ? viewPatraniDetail(patById(state.patSel)) :
      state.uzSel && uzById(state.uzSel) ? viewUzDetail(uzById(state.uzSel)) :
      state.tvSel && tvById(state.tvSel) ? viewTvDetail(tvById(state.tvSel)) :
      state.vodaSel && vodaById(state.vodaSel) ? viewVodaDetail(vodaById(state.vodaSel)) :
      state.elSel && elById(state.elSel) ? viewElDetail(elById(state.elSel)) :
      state.stView === "eia" && eiaById(state.stSel) ? viewEiaDetail(eiaById(state.stSel)) :
      state.stView === "rizeni" && rzById(state.stSel) ? viewRizeniDetail(rzById(state.stSel)) :
      state.stView === "detail" && data.stavby && stById(state.stSel) ? viewStavbaDetail(stById(state.stSel)) :
      state.akView === "detail" && akById(state.akSel) ? viewAkceDetail(akById(state.akSel)) : null;
    if (!h) return null;
    return h + '<div class="body" style="padding-top:0;padding-bottom:32px"><div class="card sdcta"><div class="t1">Co dalšího se děje u vás?</div>' +
      '<div class="note" style="margin-top:4px">Pod okny hlídá pro vaši adresu v Praze 9 a 14 odstávky vody a elektřiny, uzavírky, svoz odpadu, akce v okolí a další.</div>' +
      '<button type="button" class="btn" id="sdstart" style="margin-top:12px">Zadat svou adresu</button></div></div>';
  }

  // ---- Domů: co se týká vaší adresy ----
  var FOOT_DOMU = '<div class="foot">' + NDIC_ZDROJ + " · Zdroj dat: Pražské vodovody a kanalizace · Policie ČR · CAMP Praha zítra · úřední desky MČ · PTAS · TSK · Golemio · praha9.cz · praha14.cz · Městská knihovna v Praze</div>";
  var DOMU_MAX = 3;
  function domuUpozorneni(a) {
    var r = vodaUpozorneni(a).concat(elUpozorneni(a), zpsUpozorneni(a), patUpozorneni()), ted = den0();
    var eia = data.eia ? (data.eia.zamery || []).filter(function (z) { return eiaOtevrena(z) && a.part && z.ku.indexOf(a.part) >= 0; })[0] : null;
    if (eia) r.push({ cls: "info", ic: I_LEAF, fg: "#3d6b4a", t: "Můžete se vyjádřit k záměru · do " + rzDat(eia.lhuta), s: eia.n.replace(/^"|"$/g, "") + " · posuzování vlivů na prostředí", act: "eia:" + eia.kod });
    var o = outageFor(a);
    if (o) {
      var dn = Math.round((new Date(o.from + "T00:00:00") - ted) / 864e5);
      r.push({ cls: dn <= 0 ? "now" : dn <= 2 ? "plan" : "info", ic: DROP, fg: dn <= 0 ? "#a23a30" : dn <= 2 ? "#9a6a12" : "#b8582a",
        t: (dn <= 0 ? "Teď bez teplé vody" : "Odstávka teplé vody " + (dn === 1 ? "zítra" : "od " + dden(o.from).toLowerCase())), s: outageRange(o) + " · " + o.name, act: "tv:" + tvId(o) });
    }
    var c = cisteniPro(a);
    if (c && dnu(c.d) <= 7) {
      var n = dnu(c.d);
      r.push({ cls: n <= 1 ? "plan" : "info", ic: I_SWEEP, fg: n <= 1 ? "#9a6a12" : "#6b6652",
        t: (n <= 0 ? "Dnes" : n === 1 ? "Zítra" : dden(c.d)) + " blokové čištění", s: "v " + sklon(c.u) + (c.od ? " · " + c.od + "–" + (c.do || "") : "") + " · přeparkujte", act: "tab:doprava" });
    }
    var neh = nehodyPro(a).filter(function (x) { return x.d != null && x.d <= 5000; })[0];
    var uz = uzavirkyPro(a).filter(function (x) { return x.d != null && x.d <= 1000 && probiha(x.x); })[0];   // nejbližší probíhající do 1 km
    var rz = data.rizeni ? rzOkoli(a, RZ_DOMU, true)[0] : null;
    if (rz) r.push({ cls: "info", ic: RZ_IKONY[rz.z.druh] || I_DOC, fg: "#5b5b54", t: rz.z.druh + " · " + akVzdTxt(rz.d) + " od vás",
      s: rz.z.n + " · " + (RZ_FAZE[rz.z.faze] || RZ_FAZE.info)[1].toLowerCase() + " " + rzDat(rz.z.d), act: "rz:" + rz.z.id });
    if (neh) r.push({ cls: "info", ic: I_CRASH, fg: "#a2600f", t: "Nehoda " + (neh.x.ul && neh.x.ul.length ? vyjmenuj(neh.x.ul) : neh.x.n) + " · " + akVzdTxt(neh.d),
      s: (function (t) { var m = /Od\s+[\d:]+\s+(\d{1,2}:\d{2})(?:\s+Do\s+[\d:]+\s+(\d{1,2}:\d{2}))?/.exec(t || ""); return m ? "od " + m[1] + (m[2] ? ", odhad do " + m[2] : "") + " · může omezit provoz" : "může omezit provoz"; })(neh.x.p), act: "dop:nehody" });
    if (uz) r.push({ cls: "info", ic: I_CONE, fg: "#b03a3a", t: "Uzavírka " + (uz.x.ul && uz.x.ul.length ? vyjmenuj(uz.x.ul) : uz.x.n) + " · " + akVzdTxt(uz.d), s: obdobi(uz.x.od, uz.x.do), act: "uz:" + uzId(uz.x) });
    var p = { help: -1, now: 0, plan: 1, found: 1.5, info: 2 };
    return r.sort(function (x, y) { return p[x.cls] - p[y.cls]; });
  }
  function domuAlert(x) {
    return '<button type="button" class="hal ' + x.cls + '" data-act="' + esc(x.act) + '"><span class="hi">' + SVG(x.ic, 20, x.fg, 2.1) + "</span>" +
      '<span class="grow"><span class="ht">' + esc(x.t) + '</span><span class="hs">' + esc(x.s) + "</span></span>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
  }
  function domuDnes(a) {
    var r = [], ted = new Date(), dnes = akDen(ted), r0 = results(a);
    // svoz tříděného odpadu z nejbližšího stanoviště
    TYPES.forEach(function (t) {
      var f = r0.byType[t.id];
      if (!f || !f.info.n) return;
      var d = akD(f.info.n), n = Math.round((d - dnes) / 864e5);
      if (n === 0 || n === 1) r.push({ k: n * 1440 + 360, w: n ? "zítra" : "dnes", h: "", n: SVOZ[t.id] || "Svoz", m: f.s.name + " · " + meters(f.d), act: "tab:odpad" });
    });
    // velkoobjemové kontejnery
    var list = a.mc === "9" ? (data.vok9 && data.vok9.mista) : data.vok;
    [["vok", "Velkoobjemový kontejner"], ["bio", "BIO kontejner"]].forEach(function (v) {
      var x = vokNearest(a, v[0], list || []);
      if (!x || x.dist > 1000) return;
      var n = Math.round((x.date - dnes) / 864e5);
      if (n === 0 || n === 1) r.push({ k: n * 1440 + 600, w: n ? "zítra" : "dnes", h: x.r.h || "", n: v[1], m: x.r.n + " · " + meters(x.dist), act: "tab:odpad" });
    });
    // akce dnes a zítra – nejbližší časově, do 3 km
    if (data.akce) akVOkne("dny", "all", ted).filter(function (x) { var d = akVzd(x); return !x.z && (d == null || d <= 3000); }).slice(0, 4).forEach(function (x) {
      var s = akD(x.od), n = Math.round((akDen(s) - dnes) / 864e5);
      r.push({ k: Math.max(n, 0) * 1440 + s.getHours() * 60 + s.getMinutes(), w: n <= 0 ? "dnes" : "zítra", h: akCasTxt(x).split(" – ")[0], n: x.t, m: akMisto(x, true), act: "akce:" + x.id });
    });
    r.sort(function (x, y) { return x.k - y.k; });
    return r.slice(0, 5);
  }
  var SVOZ = { papir: "Svoz papíru", plast: "Svoz plastu", sklo: "Svoz skla", kovy: "Svoz kovů", oleje: "Svoz jedlých olejů", elektro: "Svoz elektrozařízení" };
  function pl(n, a, b, c) { return n + " " + (n === 1 ? a : n >= 2 && n <= 4 ? b : c); }
  function domuTile(id, ic, nadpis, v, s) {
    return '<button type="button" class="htile" data-act="tab:' + id + '"><span class="tt">' + SVG(ic, 16, "#1f4d36", 2.2) + nadpis + '</span><span class="tv">' + v + '</span><span class="ts">' + s + "</span></button>";
  }
  function domuBody(a) {
    var al = domuUpozorneni(a), h = "", st = vodaStav();
    if (al.length) {
      h += '<div class="hsec"><b>Upozornění pro vaši adresu</b></div>';
      al.slice(0, state.domuVse ? al.length : DOMU_MAX).forEach(function (x) { h += domuAlert(x); });
      if (al.length > DOMU_MAX && !state.domuVse) h += '<button type="button" class="btn-link" id="domuvic" style="align-self:flex-start">Další upozornění (' + (al.length - DOMU_MAX) + ")" + SVG(I_CHEV, 14, "currentColor", 2.4) + "</button>";
    } else {
      h += '<div class="hok">' + SVG('<path d="M20 6 9 17l-5-5"/>', 22, "#1f4d36", 2.6) + "<span><b>U vás je klid</b><span>" +
        (st === "ok" ? "Žádná odstávka vody ani blokové čištění ve vaší ulici." : "Žádné blokové čištění ani uzavírka u vás. Stav vody se teď nepodařilo ověřit.") + "</span></span></div>";
    }
    h += adrJinde();
    var dn = domuDnes(a);
    h += '<div class="hsec"><b>Dnes a zítra</b><button type="button" class="hlink" data-act="tab:akce">Kalendář akcí</button></div>';
    if (dn.length) h += '<div class="hday">' + dn.map(function (x) {
      return '<button type="button" class="hrw" data-act="' + esc(x.act) + '"><span class="hw">' + esc(x.h || (x.w === "dnes" ? "Dnes" : "Zítra")) + "<small>" + (x.h ? x.w : "") + '</small></span><span class="grow"><span class="hn">' + esc(x.n) + '</span><span class="hm">' + esc(x.m) + "</span></span></button>";
    }).join("") + "</div>";
    else h += '<div class="card-dashed row"><div class="grow"><div class="note" style="margin:0">Dnes ani zítra u vás nic naplánovaného nevidíme. Víc akcí najdete v kalendáři.</div></div></div>';
    // rozcestník
    var uz = uzavirkyPro(a), uzb = uz.filter(function (x) { return probiha(x.x) && x.d != null; })[0];
    var r0 = results(a), kont = r0.near[0];
    var ted = new Date(), tyd = data.akce ? akVOkne("tyden", "all", ted).length : null, bez = data.akce ? akBezi("all", ted).length : 0;
    var dk = data.doktori ? (data.doktori || []).filter(function (s) { return dist(a.lat, a.lon, s.lat, s.lon) <= RADIUS; }).length : null;
    var sk = data.skoly ? data.skoly.filter(function (s) { return skSites(s).some(function (p) { return dist(a.lat, a.lon, p.lat, p.lon) <= RADIUS; }); }).length : null;
    var vm = vodaPro(a)[0];
    h += tydenKarta(a);
    h += domuStavby(a);
    var stn = data.stavby && data.stavby.projekty ? stOkoli(a).filter(function (x) { return stKat(x.p) !== "uzemi"; }).length : null;
    h += '<div class="hsec"><b>Ve vašem okolí</b></div><div class="htiles">' +
      domuTile("doprava", BI_DOPRAVA, "Doprava", !data.doprava ? "Nedostupné" : uz.length ? uz.length + " " + sklonCount(uz.length) : "Bez omezení", uzb ? "nejbližší " + akVzdTxt(uzb.d) : "v Praze " + esc(a.mc)) +
      domuTile("odpad", BI_BYDLENI, "Bydlení", kont ? "Kontejnery " + meters(kont.d) : "Kontejnery dál než 1 km", vm ? "odstávka vody " + vodaKdy(vm).t.replace(/ bez vody$/, "").toLowerCase() : st === "ok" ? "voda bez odstávky" : "stav vody neověřen") +
      domuTile("akce", BI_AKCE, "Akce", tyd == null ? "Nedostupné" : tyd + " tento týden", bez ? bez + (bez >= 2 && bez <= 4 ? " právě probíhají" : " právě probíhá") : "v Praze 9 a 14") +
      domuTile("okoli", BI_OKOLI, "Okolí", (dk == null ? "– lékařů" : pl(dk, "lékař", "lékaři", "lékařů")) + " · " + (sk == null ? "– škol" : pl(sk, "škola", "školy", "škol")), stn ? pl(stn, "stavba", "stavby", "staveb") + " do 3 km" : "do 1 km") + "</div>";
    h += parKarta(a) + vyzvaKarta(a) + zavKarta();
    return h;
  }
  function domuAkce(act) {
    var p = String(act).split(":"), t = p[0], v = p.slice(1).join(":");
    if (t === "voda") { openVoda(v); return; }
    if (t === "el") { openEl(v); return; }
    if (t === "uz") { openDet("uz", v); return; }
    if (t === "tv") { openDet("tv", v); return; }
    if (t === "pat") { openPatrani(v); return; }
    if (t === "eia") { var z2 = state.tab; state.stView = "list"; state.stHist = []; openEia(v, z2); state.tab = "stavby"; render(); window.scrollTo(0, 0); return; }
    if (t === "rz") { var z1 = state.tab; state.stView = "list"; state.stHist = []; openRizeni(v, z1); state.tab = "stavby"; render(); window.scrollTo(0, 0); return; }
    if (t === "st") { var z0 = state.tab; state.stView = "list"; state.stHist = []; openStavba(v, z0); state.tab = "stavby"; render(); window.scrollTo(0, 0); return; }
    if (t === "dop") {   // rovnou na konkrétní sekci v Dopravě (např. nehody)
      prepniTab("doprava");
      var el = document.getElementById(v);
      if (el) el.scrollIntoView({ block: "start" });
      return;
    }
    if (t === "akce") { var z = state.tab; state.akView = "list"; state.akHist = []; openAkce("detail", v, z); state.tab = "akce"; render(); window.scrollTo(0, 0); return; }
    if (t === "tab") { prepniTab(v); }
  }
  function prepniTab(t) {
    if (t === "okoli") t = state.okSeg || "doktori";
    if (t === "doktori" || t === "skoly" || t === "stavby") state.okSeg = t;
    state.tab = t; state.skView = "list"; state.skHist = []; state.dkView = "list"; state.dkHist = []; state.akView = "list"; state.akHist = []; state.vodaSel = null; state.patSel = null; state.elSel = null; state.zav = null; state.uzSel = null; state.tvSel = null; state.stView = "list"; state.stHist = [];
    render(); window.scrollTo(0, 0);
  }
  // přepínač Lékaři / Školy v záložce Okolí
  function okoliSeg() {
    return '<div class="seg2" role="tablist" aria-label="Okolí">' + [["doktori", "Lékaři"], ["skoly", "Školy"], ["stavby", "Stavby"]].map(function (x) {
      var on = state.tab === x[0];
      return '<button type="button" role="tab" data-okseg="' + x[0] + '" class="' + (on ? "on" : "") + '" aria-selected="' + on + '">' + x[1] + "</button>";
    }).join("") + "</div>";
  }

  // ---- spodní navigace ----
  var BI_ODPAD = '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>';
  var BI_SKOLY = '<path d="m22 10-10-5L2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/>';
  var BI_DOPRAVA = '<path d="M8.5 3 4 21M15.5 3 20 21"/><path d="M12 4v2.5M12 10.5v3M12 17.5v3"/>';
  var BI_LEKARI = '<path d="M11 2a2 2 0 0 0-2 2v2a3 3 0 0 0 6 0V4a2 2 0 0 0-2-2"/><path d="M12 9v3a4 4 0 0 1-8 0v-1"/><path d="M12 9v4a4 4 0 0 0 8 0v-1"/><circle cx="20" cy="11" r="2"/><circle cx="4" cy="11" r="2"/>';
  var BI_AKCE = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
  var BI_DOMU = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>';
  var BI_BYDLENI = '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15"/><path d="M10.5 21v-2.5h3V21"/>';
  var BI_OKOLI = PIN;
  var NAV = [["domu", "Domů", BI_DOMU], ["doprava", "Doprava", BI_DOPRAVA], ["odpad", "Bydlení", BI_BYDLENI], ["akce", "Akce", BI_AKCE], ["okoli", "Okolí", BI_OKOLI]];
  function navOn(id) { return id === "okoli" ? (state.tab === "doktori" || state.tab === "skoly" || state.tab === "stavby") : state.tab === id; }
  function bottomNav() {
    // nové naléhavé upozornění, když jste mimo Domů → tečka na záložce
    var tecka = false;   // tečku na záložce Domů nepoužíváme
    return '<nav class="bnav" role="tablist">' + NAV.map(function (t) {
      var on = navOn(t[0]);
      return '<button type="button" class="' + (on ? "on" : "") + '" data-nav="' + t[0] + '" aria-selected="' + on + '"' + (t[0] === "domu" && tecka ? ' aria-label="Domů – nové upozornění"' : "") + '>' +
        '<span class="bnic">' + SVG(t[2], 24, "currentColor", on ? 2.2 : 2) + (t[0] === "domu" && tecka ? '<i class="bndot"></i>' : "") + "</span><span>" + t[1] + "</span></button>";
    }).join("") + "</nav>";
  }
  function naSekci() {
    return data && state.address && !window.__err &&
      !state.vodaSel && !state.patSel && !state.elSel && !state.zav && !state.uzSel && !state.tvSel && (state.tab === "domu" || state.tab === "odpad" || state.tab === "doprava" ||
       (state.tab === "skoly" && state.skView === "list") ||
       (state.tab === "doktori" && state.dkView === "list") ||
       (state.tab === "stavby" && state.stView === "list") ||
       (state.tab === "akce" && state.akView === "list"));
  }

  // ---- vykreslení a události ----
  function render(keepFocus) {
    var html;
    if (!data) html = window.__err ? viewOffline() : viewLoading();
    else if (!state.address && state.sdil && sdilHtml()) html = sdilHtml();
    else if (state.adrNova) html = viewPojmenuj();
    else if (!state.address || state.adrPridat) html = viewSearch();
    else if (state.patSel && patById(state.patSel)) html = viewPatraniDetail(patById(state.patSel));
    else if (state.vodaSel && vodaById(state.vodaSel)) html = viewVodaDetail(vodaById(state.vodaSel));
    else if (state.elSel && elById(state.elSel)) html = viewElDetail(elById(state.elSel));
    else if (state.uzSel && uzById(state.uzSel)) html = viewUzDetail(uzById(state.uzSel));
    else if (state.tvSel && tvById(state.tvSel)) html = viewTvDetail(tvById(state.tvSel));
    else if (state.zav === "par") html = viewPar();
    else if (state.zav) html = viewZavada();
    else if (state.tab === "skoly" && data.skoly && state.skView === "detail" && skById(state.skSel)) html = viewSkolaDetail(skById(state.skSel));
    else if (state.tab === "skoly" && data.skoly && state.skView === "full") html = viewSkolyFull();
    else if (state.tab === "doktori" && data.doktori && state.dkView === "detail" && dkById(state.dkSel)) html = viewDoktorDetail(dkById(state.dkSel));
    else if (state.tab === "doktori" && data.doktori && state.dkView === "full") html = viewDoktoriFull();
    else if (state.tab === "stavby" && state.stView === "rizeni" && rzById(state.stSel)) html = viewRizeniDetail(rzById(state.stSel));
    else if (state.tab === "stavby" && state.stView === "eia" && eiaById(state.stSel)) html = viewEiaDetail(eiaById(state.stSel));
    else if (state.tab === "stavby" && data.stavby && state.stView === "detail" && stById(state.stSel)) html = viewStavbaDetail(stById(state.stSel));
    else if (state.tab === "stavby" && data.stavby && data.stavby.projekty && state.stView === "full") html = viewStavbyFull();
    else if (state.tab === "akce" && data.akce && state.akView === "detail" && akById(state.akSel)) html = viewAkceDetail(akById(state.akSel));
    else if (state.tab === "akce" && data.akce && state.akView === "bezi") html = viewAkceBezi();
    else html = viewResult();
    if (state.sheet && html.indexOf('data-sheet="' + state.sheet + '"') >= 0) html += fSheet(state.sheet); else state.sheet = null;
    if (data && state.address && state.tab === "akce" && state.akView === "list" && state.akKal) html += akKalendar();
    if (state.adrPanel && state.address && !state.adrNova && !state.adrPridat) html += adrPanel();
    if (naSekci() && !state.adrPridat && !state.adrNova) html += bottomNav();
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
    app.querySelectorAll("[data-sheet]").forEach(function (b) { b.addEventListener("click", function () { state.sheet = b.getAttribute("data-sheet"); render(); }); });
    app.querySelectorAll("[data-sheetclose]").forEach(function (b) { b.addEventListener("click", function () { state.sheet = null; render(); }); });
    function fZmena() { state.akDenVse = {}; render(); }
    app.querySelectorAll("[data-fc]").forEach(function (b) { b.addEventListener("click", function () {
      var key = b.getAttribute("data-fc"), v = b.getAttribute("data-v"), vy = fVyber(key), i = vy.indexOf(v);
      if (i >= 0) vy.splice(i, 1); else vy.push(v);
      state[key] = vy.length ? vy.join(",") : "all"; fZmena();
    }); });
    app.querySelectorAll("[data-fcclr]").forEach(function (b) { b.addEventListener("click", function () { b.getAttribute("data-fcclr").split(",").forEach(function (key) { state[key] = "all"; }); fZmena(); }); });
    app.querySelectorAll("[data-fs]").forEach(function (b) { b.addEventListener("click", function () { state[b.getAttribute("data-fs")] = b.getAttribute("data-v"); state.sheet = null; fZmena(); }); });
    app.querySelectorAll("[data-freset]").forEach(function (b) { b.addEventListener("click", function () { var d = FB[b.getAttribute("data-freset")]; state[d.f] = "all"; state[d.m] = "all"; d.x.forEach(function (x) { state[x[2]] = "all"; }); fZmena(); }); });
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
    app.querySelectorAll("[data-nav]").forEach(function (b) { b.addEventListener("click", function () { prepniTab(b.getAttribute("data-nav")); }); });
    app.querySelectorAll("[data-act]").forEach(function (b) { b.addEventListener("click", function () { domuAkce(b.getAttribute("data-act")); }); });
    app.querySelectorAll("[data-voda]").forEach(function (b) { b.addEventListener("click", function () { openVoda(b.getAttribute("data-voda")); }); });
    app.querySelectorAll("[data-share]").forEach(function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-share").split(":"); sdilej(p[0], p.slice(1).join(":")); }); });
    var sds = document.getElementById("sdstart");
    if (sds) sds.addEventListener("click", function () { sdilKonec(); var i = document.getElementById("q"); if (i) i.focus(); });
    app.querySelectorAll("[data-el]").forEach(function (b) { b.addEventListener("click", function () { openEl(b.getAttribute("data-el")); }); });
    var elv = document.getElementById("elvse");
    if (elv) elv.addEventListener("click", function () { var y = window.scrollY; state.elVse = !state.elVse; render(); window.scrollTo(0, y); });
    app.querySelectorAll("[data-okseg]").forEach(function (b) { b.addEventListener("click", function () { state.okSeg = b.getAttribute("data-okseg"); prepniTab(state.okSeg); }); });
    app.querySelectorAll("[data-uz]").forEach(function (b) { b.addEventListener("click", function () { openDet("uz", b.getAttribute("data-uz")); }); });
    app.querySelectorAll("[data-tv]").forEach(function (b) { b.addEventListener("click", function () { openDet("tv", b.getAttribute("data-tv")); }); });
    var zs = document.getElementById("zavstart");
    if (zs) zs.addEventListener("click", function () { openZav(); });
    var ps = document.getElementById("parstart");
    if (ps) ps.addEventListener("click", function () { openZav("par"); });
    app.querySelectorAll("[data-zav]").forEach(function (b) { b.addEventListener("click", function () { state.zav = b.getAttribute("data-zav"); state.zavTxt = ""; state.zavPoz = null; try { history.pushState({ voda: 1 }, ""); } catch (e) {} render(); window.scrollTo(0, 0); }); });
    var zt = document.getElementById("zavtxt");
    if (zt) zt.addEventListener("input", function () { state.zavTxt = zt.value; });
    var zsn = document.getElementById("zavsend");
    if (zsn) zsn.addEventListener("click", zavOdeslat);
    var zp = document.getElementById("zavpoz");
    if (zp) zp.addEventListener("click", function () {
      if (state.zavPoz) { state.zavPoz = null; render(); return; }
      zp.textContent = "Zjišťuji polohu…";
      navigator.geolocation.getCurrentPosition(function (g) { state.zavPoz = [g.coords.latitude, g.coords.longitude]; render(); },
        function () { zp.textContent = "Polohu se nepodařilo zjistit"; }, { enableHighAccuracy: true, timeout: 10000 });
    });
    umtNapoj();
    var vb = document.getElementById("vodaback");
    if (vb) vb.addEventListener("click", function () { vodaBack(); });
    var tv = document.getElementById("tydvic");
    if (tv) tv.addEventListener("click", function () { var y = window.scrollY; state.tydVse = !state.tydVse; render(); window.scrollTo(0, y); });
    komNacti();
    var dmv = document.getElementById("domuvic");
    if (dmv) dmv.addEventListener("click", function () { var y = window.scrollY; state.domuVse = true; render(); window.scrollTo(0, y); });
    app.querySelectorAll("[data-dk]").forEach(function (b) { b.addEventListener("click", function () { openDoktor(b.getAttribute("data-dk")); }); });
    app.querySelectorAll("[data-rz]").forEach(function (b) { b.addEventListener("click", function () { openRizeni(b.getAttribute("data-rz")); }); });
    app.querySelectorAll("[data-eia]").forEach(function (b) { b.addEventListener("click", function () { openEia(b.getAttribute("data-eia")); }); });
    app.querySelectorAll("[data-st]").forEach(function (b) { b.addEventListener("click", function () { openStavba(b.getAttribute("data-st")); }); });
    app.querySelectorAll("[data-stvse]").forEach(function (b) { b.addEventListener("click", function () { var y = window.scrollY, k = b.getAttribute("data-stvse"); state.stVse[k] = !state.stVse[k]; render(); window.scrollTo(0, y); }); });
    var stf = document.getElementById("stfull");
    if (stf) stf.addEventListener("click", function () { state.stHist.push({ v: "list", s: null, y: window.scrollY }); state.stView = "full"; try { history.pushState({ st: state.stHist.length }, ""); } catch (e) {} render(); window.scrollTo(0, 0); });
    var stb = document.getElementById("stback");
    if (stb) stb.addEventListener("click", function () { stBack(); });
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
    var akx = document.getElementById("akback");
    if (akx) akx.addEventListener("click", function () { akBack(); });
    var e = document.getElementById("edit");
    if (e) e.addEventListener("click", function () { state.adrPanel = true; state.adrMenu = null; render(); });
    var asw = document.getElementById("adrsw");
    if (asw) asw.addEventListener("click", function () { state.adrPanel = true; state.adrMenu = null; render(); });
    app.querySelectorAll("[data-adrclose]").forEach(function (b) { b.addEventListener("click", function () { state.adrPanel = false; state.adrMenu = null; render(); }); });
    app.querySelectorAll("[data-adr]").forEach(function (b) { b.addEventListener("click", function () { adrPrepni(+b.getAttribute("data-adr")); }); });
    app.querySelectorAll("[data-adrmenu]").forEach(function (b) { b.addEventListener("click", function () { var i = +b.getAttribute("data-adrmenu"); state.adrMenu = state.adrMenu === i ? null : i; render(); }); });
    app.querySelectorAll("[data-adrdel]").forEach(function (b) { b.addEventListener("click", function () {
      var av = adrNacti(), i = +b.getAttribute("data-adrdel"), byla = av.list[av.akt];
      av.list.splice(i, 1); state.adrMenu = null;
      if (!av.list.length) { try { localStorage.removeItem(KEY_ADR); } catch (e) {} clear(); state.address = null; state.adrPanel = false; state.query = ""; state.tab = "domu"; render(); return; }
      av.akt = Math.max(0, av.list.indexOf(byla)); adrUloz(av); state.address = av.list[av.akt]; render();
    }); });
    app.querySelectorAll("[data-adrren]").forEach(function (b) { b.addEventListener("click", function () {
      var av = adrNacti(), i = +b.getAttribute("data-adrren"); state.adrRen = i; state.adrNova = Object.assign({}, av.list[i]); state.adrNazev = av.list[i].nazev; state.adrJine = ADR_NAZVY.indexOf(av.list[i].nazev) < 0; state.adrPanel = false; render(); window.scrollTo(0, 0);
    }); });
    var aad = document.getElementById("adradd");
    if (aad) aad.addEventListener("click", function () { state.adrPanel = false; state.adrPridat = true; state.query = ""; render(); window.scrollTo(0, 0); var q = document.getElementById("q"); if (q) q.focus(); });
    var azp = document.getElementById("adrzpet");
    if (azp) azp.addEventListener("click", function () { state.adrPridat = false; state.adrNova = null; state.adrRen = null; state.query = ""; state.adrPanel = true; render(); });
    app.querySelectorAll("[data-adrnaz]").forEach(function (b) { b.addEventListener("click", function () { var n = b.getAttribute("data-adrnaz"); state.adrJine = !n; state.adrNazev = n; render(); if (!n) { var v = document.getElementById("adrvlastni"); if (v) v.focus(); } }); });
    var avl = document.getElementById("adrvlastni");
    if (avl) avl.addEventListener("input", function () { state.adrNazev = avl.value.trim(); var u = document.getElementById("adruloz"); if (u) u.disabled = !state.adrNazev; });
    var aul = document.getElementById("adruloz");
    if (aul) aul.addEventListener("click", function () {
      var av = adrNacti(), x = state.adrNova, up = document.getElementById("adrupoz");
      x.nazev = state.adrNazev || "Adresa"; x.upoz = up ? up.checked : true;
      if (state.adrRen != null) { av.list[state.adrRen] = x; } else { av.list.push(x); av.akt = av.list.length - 1; }
      adrUloz(av); state.address = av.list[av.akt]; state.adrNova = null; state.adrRen = null; state.tab = "domu"; render(); window.scrollTo(0, 0);
    });
    var r = document.getElementById("retry");
    if (r) r.addEventListener("click", boot);
  }
  function bindSugg(res) {
    app.querySelectorAll(".sugg button").forEach(function (b) { b.addEventListener("click", function () { pick(res[+b.getAttribute("data-i")]); }); });
  }
  function pick(a) {
    if (!a) return;
    var nova = { label: label(a), lat: a[3], lon: a[4], mc: a[5] || "14", street: a[0], cp: a[1], co: a[2] || "", part: a[6] || "" };
    if (state.adrPridat) {
      var av0 = adrNacti(), j = -1;
      av0.list.forEach(function (x, i) { if (x.label === nova.label) j = i; });
      state.adrPridat = false; state.query = "";
      if (j >= 0) { adrPrepni(j); return; }          // už uložená – jen přepnout
      state.adrNova = Object.assign(nova, { upoz: true }); state.adrNazev = ""; state.adrJine = false; state.adrRen = null;
      render(); window.scrollTo(0, 0); return;
    }
    state.address = nova;
    var av1 = adrNacti();
    av1.list = av1.list.filter(function (x) { return x.label !== nova.label; });
    if (!av1.list.length) av1.list.push(Object.assign({ nazev: "Domov", upoz: true }, nova)); else av1.list[av1.akt] = Object.assign({}, av1.list[av1.akt] || { nazev: "Domov", upoz: true }, nova);
    if (av1.akt >= av1.list.length) av1.akt = 0;
    adrUloz(av1); state.address = av1.list[av1.akt];
    save(state.address);
    state.tab = "domu";   // po zadání adresy ukázat přehled pro adresu
    render();
    window.scrollTo(0, 0);
  }

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  // voda a nehody: živá kopie v Cloudflare (každých 5 minut), záloha v repozitáři; bere se novější
  var ZIVA = "https://ndic-proxy.moji-sousede.workers.dev/data/";
  function getZive(n) {
    var c = function () { return null; };
    var ziva = Promise.race([fetch(ZIVA + n).then(function (r) { return r.ok ? r.json() : null; }), new Promise(function (ok) { setTimeout(ok, 5000, null); })]).catch(c);
    return Promise.all([ziva, getJSON("data/" + n).catch(c)]).then(function (v) {
      if (!v[0] || !v[0].gen) return v[1];
      if (!v[1] || !v[1].gen) return v[0];
      return new Date(v[0].gen) >= new Date(v[1].gen) ? v[0] : v[1];
    });
  }
  function boot() {
    window.__err = false; data = null; render();
    Promise.all([getJSON("data/stations.json"), getJSON("data/addresses.json"), getJSON("data/hazard.json").catch(function () { return null; }), getJSON("data/vok.json").catch(function () { return null; }), getJSON("data/vok9.json").catch(function () { return null; }), getJSON("data/outages.json").catch(function () { return null; }), getJSON("data/skoly.json").catch(function () { return null; }), getJSON("data/skoly_extra.json").catch(function () { return null; }), getJSON("data/skoly_web.json").catch(function () { return null; }), getJSON("data/spadovost.json").catch(function () { return null; }), getJSON("data/doprava.json").catch(function () { return null; }), getJSON("data/doktori.json").catch(function () { return null; }), getZive("nehody.json"), getJSON("data/akce.json").catch(function () { return null; }), getZive("voda.json"), getJSON("data/patrani.json").catch(function () { return null; }), getJSON("data/stavby.json").catch(function () { return null; }), getJSON("data/rizeni.json").catch(function () { return null; }), getJSON("data/elektrina.json").catch(function () { return null; }), getJSON("data/opatreni.json").catch(function () { return null; }), getJSON("data/zps.json").catch(function () { return null; }), getJSON("data/eia.json").catch(function () { return null; }), getJSON("data/vyzvy.json").catch(function () { return null; })]).then(function (v) {
      data = { stations: v[0], addresses: v[1], hazard: v[2], vok: v[3], vok9: v[4], outages: v[5], skoly: v[6], skolyExtra: v[7], skolyWeb: v[8], spad: v[9], doprava: v[10], doktori: v[11], nehody: v[12], akce: v[13], voda: v[14], patrani: v[15], stavby: v[16], rizeni: v[17], elektrina: v[18], opatreni: v[19], zps: v[20], eia: v[21], vyzvy: v[22] };
      if (data.skoly) data.skoly.forEach(function (x, i) { if (!x.id) x.id = "i" + i; if (data.skolyWeb && data.skolyWeb[x.id]) x.w = data.skolyWeb[x.id]; });
      buildIndex();
      var av = adrNacti(); state.address = av.list[av.akt] || null; if (av.list.length) adrUloz(av);
      sdilZHash();
      render();
    }).catch(function () { window.__err = true; render(); });
  }
  boot();
})();
