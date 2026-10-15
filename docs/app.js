"use strict";
(function () {
  var RADIUS = 1000;
  var KEY = "praha14.address";
  var app = document.getElementById("app");
  var data = null;       // {stations, addresses}
  var state = { address: null, query: "" };

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
    h += '<div class="links"><a class="link" href="' + x.src + '" target="_blank" rel="noopener">Celý harmonogram (PDF) ' + SVG(ARROW, 12, "currentColor", 2.4) + "</a></div></div></div>";
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

  function viewResult() {
    var a = state.address, r = results(a);
    var h = '<div class="head addr"><div><div class="eyebrow">Vaše adresa</div><div class="addr-name">' + esc(a.label) + '</div></div>' +
      '<button type="button" class="btn-edit" id="edit" aria-label="Změnit adresu">' + SVG('<path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 13, "currentColor", 2.3) + "Změnit</button></div><div class=\"body\">";
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
    h += '<div class="card-dashed row top"><span class="badge" style="background:#ececea">' +
      SVG('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 18, "#5b5b54") +
      '</span><div class="grow"><div class="t1">Popelnice (směsný odpad)</div><div class="note" style="margin-top:2px">Svoz popelnic se liší podle domu. Termín zjistíte u správce domu nebo SVJ.</div></div></div>';
    return h + "</div>" + FOOT;
  }

  function viewOffline() {
    return '<div class="full"><span class="big-badge" style="width:64px;height:64px;border-radius:20px;background:#ececea">' +
      SVG('<path d="M1 9a16 16 0 0 1 22 0"/><path d="M5 12.5a10.8 10.8 0 0 1 14 0"/><path d="M8.5 16a6 6 0 0 1 7 0"/><path d="M12 20h.01"/><path d="M2 2l20 20"/>', 30, "#6b6557") +
      '</span><h2>Nejste připojeni k internetu</h2><p>Pro zobrazení stanovišť a termínů potřebuje appka internetové připojení. Zkontrolujte prosím Wi-Fi nebo mobilní data.</p>' +
      '<button type="button" class="btn" id="retry">Zkusit znovu</button></div>';
  }
  function viewLoading() { return '<div class="head"><div class="eyebrow">Praha 9 a 14</div><h1>Kam s odpadem?</h1></div><div class="body"><div class="skel"></div><div class="skel"></div></div>'; }

  // ---- vykreslení a události ----
  function render(keepFocus) {
    var html;
    if (!data) html = window.__err ? viewOffline() : viewLoading();
    else html = state.address ? viewResult() : viewSearch();
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
    var e = document.getElementById("edit");
    if (e) e.addEventListener("click", function () { clear(); state.address = null; state.query = ""; render(); var i = document.getElementById("q"); if (i) i.focus(); });
    var r = document.getElementById("retry");
    if (r) r.addEventListener("click", boot);
  }
  function bindSugg(res) {
    app.querySelectorAll(".sugg button").forEach(function (b) { b.addEventListener("click", function () { pick(res[+b.getAttribute("data-i")]); }); });
  }
  function pick(a) {
    if (!a) return;
    state.address = { label: label(a), lat: a[3], lon: a[4], mc: a[5] || "14" };
    save(state.address);
    render();
    window.scrollTo(0, 0);
  }

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function boot() {
    window.__err = false; data = null; render();
    Promise.all([getJSON("data/stations.json"), getJSON("data/addresses.json"), getJSON("data/hazard.json").catch(function () { return null; }), getJSON("data/vok.json").catch(function () { return null; }), getJSON("data/vok9.json").catch(function () { return null; })]).then(function (v) {
      data = { stations: v[0], addresses: v[1], hazard: v[2], vok: v[3], vok9: v[4] };
      buildIndex();
      state.address = load();
      render();
    }).catch(function () { window.__err = true; render(); });
  }
  boot();
})();
