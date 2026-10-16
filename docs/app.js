"use strict";
(function () {
  var RADIUS = 1000;
  var KEY = "praha14.address";
  var app = document.getElementById("app");
  var data = null;       // {stations, addresses}
  var state = { address: null, query: "", tab: "odpad", skF: "all", skZ: "all", skM: "all", skView: "list", skPrev: "list", skSel: null, skQ: "", skSheet: false, skScroll: 0 };

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

  // ---- VOK a BIO VOK (jen Praha 14) ----
  function vokNearest(addr, typ) {
    var today = new Date(), best = null; today.setHours(0, 0, 0, 0);
    (data.vok || []).forEach(function (r) {
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
  function vok9Next() {
    if (!data.vok9) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var r = data.vok9.dates.filter(function (x) { return new Date(x.d + "T00:00:00") >= today; })[0];
    return r ? { date: new Date(r.d + "T00:00:00"), p: r.p } : null;
  }
  function vokCard(addr) {
    var mc = addr.mc || "14", v = mc === "14" && data.vok ? [vokNearest(addr, "vok"), vokNearest(addr, "bio")] : null;
    var head = '<div class="card row top"><span class="badge" style="background:#fbe3d4">' +
      SVG('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>', 18, "#b8582a") +
      '</span><div class="grow"><div class="t1">Velkoobjemové kontejnery (VOK a BIO VOK)</div>';
    if (v && (v[0] || v[1])) {
      return head + vokBlock(v[0], "hvok", "Nejbližší VOK") + vokBlock(v[1], "hbio", "Nejbližší BIO VOK") +
        '<div class="note" style="margin-top:8px">Termíny se mohou změnit. Aktuální najdete v mapě KSNKO a na praha14.cz.</div>' + links("14") + "</div></div>";
    }
    var n9 = mc === "9" ? vok9Next() : null;
    if (n9) {
      var d9 = n9.date;
      return head + '<div class="note">BIO VOK · podzim 2026 · přistavení po celé Praze 9</div><div class="hbox hvok"><div class="eyebrow">Nejbližší termín</div>' +
        '<div class="hname">' + HDAYS[d9.getDay()] + " " + d9.getDate() + ". " + (d9.getMonth() + 1) + ". · " + data.vok9.time + "</div>" +
        '<div class="hplaces">' + n9.p.map(function (x) { return "<div>" + esc(x) + "</div>"; }).join("") + "</div></div>" +
        '<div class="note" style="margin-top:8px">Další termíny najdete v celém harmonogramu. Místa nejsou řazena podle vzdálenosti od vaší adresy.</div>' +
        '<div class="links"><a class="link" href="' + data.vok9.src + '" target="_blank" rel="noopener">Celý harmonogram (PDF) ' + SVG(ARROW, 12, "currentColor", 2.4) + '</a>' +
        '<a class="link" href="https://ksnko.praha.eu/map-bulky/" target="_blank" rel="noopener">Mapa KSNKO ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
    }
    return head + '<div class="note">Termíny a místa přistavení najdete v mapě KSNKO a na webu městské části Praha ' + mc + "." + "</div>" + links(mc) + "</div></div>";
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
    h += tabsHtml();
    if (state.tab === "skoly") return h + '<div class="body">' + skolyBody(a) + "</div>" + FOOT_SK;
    h += '<div class="body">';
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
  var SK_Z = [["all", "Vše"], ["s", "Státní"], ["p", "Soukromé"], ["c", "Církevní"]];
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
    return data.skoly.filter(function (s) {
      return skMatch(s) && (!q || plain(s.n + " " + skSites(s).map(function (p) { return p.a; }).join(" ")).indexOf(q) >= 0);
    });
  }
  function skCount() { return state.skView === "full" ? skFull().length : skNear(state.address).length; }

  function tabsHtml() {
    return '<div class="tabs" role="tablist">' + [["odpad", "Odpad"], ["skoly", "Školy a školky"]].map(function (t) {
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
  function skolaCard(s, d, p) {
    p = p || skSites(s)[0];
    return '<button type="button" class="card skcard" data-sk="' + esc(s.id) + '"><div class="skl"><div class="skn">' + typeChip(s.t) + '<span class="sknm"><span class="cl">' + esc(s.n) + '</span></span></div><div class="t2">' + esc(p.a) + (d == null ? "" : " · Praha " + esc(p.mc)) + "</div>" +
      (secTag(s.z) ? '<div class="sktag">' + secTag(s.z) + "</div>" : "") + '</div><div class="skr">' + (d == null ? "Praha " + esc(s.mc) : meters(d)) + "</div>" + SVG(I_CHEV, 18, "#8a8572", 2.4) + "</button>";
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
    var z = { s: [I_LAND, "Státní (obecní)"], p: [I_CASE, "Soukromá"], c: [I_CROSS, "Církevní"] }[s.z];
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
    if (s.z === "c") h += '<div class="dinfo">' + SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>', 18, "#6b6652", 2.2) + "<span>Církevní škola, výuka podle stejného vzdělávacího programu jako státní školy. Může mít duchovní zaměření.</span></div>";
    if (s.z === "p" || s.z === "c") h += dcard("Školné a poplatky", drow("Školné", ex.sk), ex.sk ? "Údaj z webu školy, částky se mohou měnit. Aktuální výši ověřte u školy." : "");
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
    var prac = (s.p || []).map(function (p, i) { return drow(i ? "" : "Další pracoviště", p.a + " · Praha " + p.mc); }).join("");
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

  function openSkola(id) {
    state.skScroll = window.scrollY; state.skPrev = state.skView; state.skView = "detail"; state.skSel = id; state.skSheet = false;
    try { history.pushState({ sk: 1 }, ""); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function skBack() {
    if (state.skView === "detail") {
      if (history.state && history.state.sk) { history.back(); return; }
      state.skView = state.skPrev || "list"; render(); window.scrollTo(0, state.skScroll || 0);
    } else { state.skView = "list"; render(); window.scrollTo(0, 0); }
  }
  window.addEventListener("popstate", function () {
    if (state.skView === "detail") { state.skView = state.skPrev || "list"; render(); window.scrollTo(0, state.skScroll || 0); }
  });

  // ---- vykreslení a události ----
  function render(keepFocus) {
    var html;
    if (!data) html = window.__err ? viewOffline() : viewLoading();
    else if (!state.address) html = viewSearch();
    else if (state.tab === "skoly" && data.skoly && state.skView === "detail" && skById(state.skSel)) html = viewSkolaDetail(skById(state.skSel));
    else if (state.tab === "skoly" && data.skoly && state.skView === "full") html = viewSkolyFull();
    else html = viewResult();
    if (data && state.address && state.tab === "skoly" && state.skSheet && state.skView !== "detail") html += sheetHtml();
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
    app.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.getAttribute("data-tab"); state.skView = "list"; render(); window.scrollTo(0, 0); }); });
    app.querySelectorAll("[data-skf]").forEach(function (b) { b.addEventListener("click", function () { state.skF = b.getAttribute("data-skf"); render(); }); });
    app.querySelectorAll("[data-skz]").forEach(function (b) { b.addEventListener("click", function () { state.skZ = b.getAttribute("data-skz"); render(); }); });
    app.querySelectorAll("[data-skm]").forEach(function (b) { b.addEventListener("click", function () { state.skM = b.getAttribute("data-skm"); render(); }); });
    app.querySelectorAll("[data-sheet]").forEach(function (b) { b.addEventListener("click", function () { state.skSheet = true; render(); }); });
    app.querySelectorAll("[data-sheetclose]").forEach(function (b) { b.addEventListener("click", function () { state.skSheet = false; render(); }); });
    var rs = document.getElementById("skreset");
    if (rs) rs.addEventListener("click", function () { state.skF = "all"; state.skZ = "all"; state.skM = "all"; render(); });
    app.querySelectorAll("[data-sk]").forEach(function (b) { b.addEventListener("click", function () { openSkola(b.getAttribute("data-sk")); }); });
    var sf = document.getElementById("skfull");
    if (sf) sf.addEventListener("click", function () { state.skView = "full"; render(); window.scrollTo(0, 0); });
    var sb = document.getElementById("skback");
    if (sb) sb.addEventListener("click", function () { skBack(); });
    var sq = document.getElementById("skq");
    if (sq) sq.addEventListener("input", function () { state.skQ = sq.value; document.getElementById("sklist").innerHTML = skolyListHtml(); app.querySelectorAll("#sklist [data-sk]").forEach(function (b) { b.addEventListener("click", function () { openSkola(b.getAttribute("data-sk")); }); }); });
    var e = document.getElementById("edit");
    if (e) e.addEventListener("click", function () { clear(); state.address = null; state.query = ""; state.tab = "odpad"; state.skView = "list"; render(); var i = document.getElementById("q"); if (i) i.focus(); });
    var r = document.getElementById("retry");
    if (r) r.addEventListener("click", boot);
  }
  function bindSugg(res) {
    app.querySelectorAll(".sugg button").forEach(function (b) { b.addEventListener("click", function () { pick(res[+b.getAttribute("data-i")]); }); });
  }
  function pick(a) {
    if (!a) return;
    state.address = { label: label(a), lat: a[3], lon: a[4], mc: a[5] || "14", street: a[0], part: a[6] || "" };
    save(state.address);
    render();
    window.scrollTo(0, 0);
  }

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function boot() {
    window.__err = false; data = null; render();
    Promise.all([getJSON("data/stations.json"), getJSON("data/addresses.json"), getJSON("data/hazard.json").catch(function () { return null; }), getJSON("data/vok.json").catch(function () { return null; }), getJSON("data/vok9.json").catch(function () { return null; }), getJSON("data/outages.json").catch(function () { return null; }), getJSON("data/skoly.json").catch(function () { return null; }), getJSON("data/skoly_extra.json").catch(function () { return null; }), getJSON("data/skoly_web.json").catch(function () { return null; })]).then(function (v) {
      data = { stations: v[0], addresses: v[1], hazard: v[2], vok: v[3], vok9: v[4], outages: v[5], skoly: v[6], skolyExtra: v[7], skolyWeb: v[8] };
      if (data.skoly) data.skoly.forEach(function (x, i) { if (!x.id) x.id = "i" + i; if (data.skolyWeb && data.skolyWeb[x.id]) x.w = data.skolyWeb[x.id]; });
      buildIndex();
      state.address = load();
      render();
    }).catch(function () { window.__err = true; render(); });
  }
  boot();
})();
