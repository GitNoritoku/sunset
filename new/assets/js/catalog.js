/* Catalogue (top page) behaviour. Pure functions are exported for node tests;
   the DOM wiring runs only when #catalog-form exists in the page.
   Data-derived text is only ever set via textContent / value (never innerHTML). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SunsetCatalog = api;
    if (root.document) api.start(root);
  }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var NOT_SAVED = "保存できませんでした。ブラウザの設定により、この内容はページを閉じると消えます。注文はメールかFAXでお願いします。";
  var STEP = 48;
  var MAX_SHOWN = 960;
  var SORTS = { new: "", priceAsc: "pa", priceDesc: "pd" };
  var SORT_FROM_CODE = { pa: "priceAsc", pd: "priceDesc" };
  var SORT_LABELS = { new: "新しい順", priceAsc: "価格の安い順", priceDesc: "価格の高い順" };

  // ------------------------------------------------------------ pure state
  function defaultState() {
    return { years: [], countries: [], priceMin: null, priceMax: null, q: "", hideSoldout: false, sort: "new", shown: STEP };
  }

  // A usable yen amount: finite, >= 0, integer (floored); anything else -> null (ignored).
  function toYen(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = typeof v === "number" ? v : Number(String(v).trim());
    if (!isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  // Coerce any object into a valid state. Reversed price range (min > max) is
  // swapped; negative / NaN / infinite prices are ignored (null).
  function normalizeState(st) {
    var o = st || {};
    var d = defaultState();
    d.years = (Array.isArray(o.years) ? o.years : []).filter(function (y) {
      return typeof y === "number" && isFinite(y) && Math.floor(y) === y && y >= 0 && y <= 9999;
    });
    d.countries = (Array.isArray(o.countries) ? o.countries : []).filter(function (c) {
      return typeof c === "string" && c !== "";
    });
    var mn = toYen(o.priceMin), mx = toYen(o.priceMax);
    if (mn !== null && mx !== null && mn > mx) { var t = mn; mn = mx; mx = t; }
    d.priceMin = mn; d.priceMax = mx;
    d.q = typeof o.q === "string" ? o.q.replace(/\s+/g, " ").trim() : "";
    d.hideSoldout = o.hideSoldout === true;
    d.sort = SORTS.hasOwnProperty(o.sort) ? o.sort : "new";
    var n = o.shown;
    d.shown = typeof n === "number" && Math.floor(n) === n && n >= STEP && n <= MAX_SHOWN ? n : STEP;
    return d;
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return null; }
  }

  function parseHash(hash) {
    var st = defaultState();
    if (typeof hash !== "string") return st;
    var h = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    var raw = { years: [], countries: [] };
    h.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i < 1) return;
      var k = pair.slice(0, i), v = pair.slice(i + 1);
      if (k === "y") {
        v.split(",").forEach(function (p) {
          if (/^\d{1,4}$/.test(p)) { var y = Number(p); if (raw.years.indexOf(y) < 0) raw.years.push(y); }
        });
      } else if (k === "c") {
        v.split(",").forEach(function (p) {
          var c = safeDecode(p);
          if (c && raw.countries.indexOf(c) < 0) raw.countries.push(c);
        });
      } else if (k === "p") {
        var m = /^(\d*)-(\d*)$/.exec(v);
        if (m) { raw.priceMin = m[1] === "" ? null : Number(m[1]); raw.priceMax = m[2] === "" ? null : Number(m[2]); }
      } else if (k === "q") {
        var q = safeDecode(v.replace(/\+/g, "%20"));
        if (q) raw.q = q;
      } else if (k === "h") {
        raw.hideSoldout = v === "1";
      } else if (k === "s") {
        if (SORT_FROM_CODE.hasOwnProperty(v)) raw.sort = SORT_FROM_CODE[v];
      } else if (k === "n") {
        if (/^\d{1,5}$/.test(v)) raw.shown = Number(v);
      }
    });
    return normalizeState(raw);
  }

  function serializeState(state) {
    var st = normalizeState(state);
    var parts = [];
    if (st.years.length) parts.push("y=" + st.years.join(","));
    if (st.countries.length) parts.push("c=" + st.countries.map(encodeURIComponent).join(","));
    if (st.priceMin !== null || st.priceMax !== null) {
      parts.push("p=" + (st.priceMin === null ? "" : st.priceMin) + "-" + (st.priceMax === null ? "" : st.priceMax));
    }
    if (st.q) parts.push("q=" + encodeURIComponent(st.q));
    if (st.hideSoldout) parts.push("h=1");
    if (SORTS[st.sort]) parts.push("s=" + SORTS[st.sort]);
    if (st.shown !== STEP) parts.push("n=" + st.shown);
    return parts.length ? "#" + parts.join("&") : "";
  }

  // True when a narrowing filter that leaves the "latest month" view is active.
  // Sort, paging and 売り切れを隠す alone do not: they keep the latest-month view.
  function isFiltered(state) {
    var st = normalizeState(state);
    return st.years.length > 0 || st.countries.length > 0 || st.priceMin !== null ||
      st.priceMax !== null || st.q !== "";
  }

  // Pure heading/count model for the results area.
  function headingModel(state, latest, total, shownCount) {
    var st = normalizeState(state);
    var filtered = isFiltered(st);
    var lm = latest || { year: 0, month: 0 };
    var sortLabel = SORT_LABELS[st.sort];
    var note = !filtered && st.hideSoldout ? "・売り切れを除く" : "";
    var count = total + "件（" + sortLabel + note + "）";
    if (shownCount < total) count += " うち" + shownCount + "件を表示";
    return {
      filtered: filtered,
      eyebrow: filtered ? "検索結果" : "最近出荷された切手",
      title: filtered ? describeFilters(st)
        : lm.year ? lm.year + "年" + (lm.month ? lm.month + "月" : "") + " 入荷分" : "入荷分",
      count: count
    };
  }

  function describeFilters(state) {
    var st = normalizeState(state);
    var parts = [];
    if (st.years.length) parts.push(st.years.map(function (y) { return y === 0 ? "年不明" : y + "年"; }).join("・"));
    if (st.countries.length) parts.push(st.countries.join("・"));
    if (st.priceMin !== null && st.priceMax !== null) parts.push(st.priceMin + "〜" + st.priceMax + "円");
    else if (st.priceMax !== null) parts.push("〜" + st.priceMax + "円");
    else if (st.priceMin !== null) parts.push(st.priceMin + "円〜");
    if (st.q) parts.push("「" + st.q + "」");
    if (st.hideSoldout) parts.push("売り切れを除く");
    return parts.join("・");
  }

  function nextBatch(total, shown, step) {
    var s = step > 0 ? step : STEP;
    var t = Math.max(0, Number(total) || 0), n = Math.max(0, Number(shown) || 0);
    return Math.min(t, n + s);
  }

  function formatYen(n) {
    var v = Math.floor(Number(n));
    if (!isFinite(v) || v < 0) v = 0;
    return "¥" + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  var STATUS_LABELS = { soldout: "売り切れ", waiting: "入荷待ち", restock: "再入荷(在庫僅)" };

  // Month image page (gazouYYMM.htm) next to the month list, if it exists in the index.
  function gazouFor(source, year, month) {
    if (!year || !month) return "";
    var dir = String(source || "").replace(/[^/]*$/, "");
    var yy = ("0" + (year % 100)).slice(-2), mm = ("0" + month).slice(-2);
    return dir + "gazou" + yy + mm + ".htm";
  }

  function buildCardModel(stamp, gazouPages) {
    var s = stamp || {};
    var status = s.status || "ok";
    var set = gazouPages instanceof Set ? gazouPages : new Set(Array.isArray(gazouPages) ? gazouPages : []);
    var cand = gazouFor(s.source, s.year, s.month);
    var monthLabel = !s.year ? "" : s.month > 0 ? s.year + "年" + s.month + "月" : s.year + "年";
    return {
      countryLabel: s.country || "",
      code: s.code || "",
      title: s.name || "",
      priceText: formatYen(s.price),
      priceNote: s.price_note ? "価格注記: " + s.price_note : "",
      statusKey: status,
      statusLabel: STATUS_LABELS[status] || "",
      canOrder: status !== "soldout",
      monthLabel: monthLabel,
      listHref: s.source || "",
      imageHref: cand && set.has(cand) ? cand : "",
      shelf: s.shelf || ""
    };
  }

  // ------------------------------------------------------------- DOM wiring
  function start(win) {
    var doc = win.document;
    var form = doc.getElementById("catalog-form");
    if (!form) return;
    var $ = function (id) { return doc.getElementById(id); };
    var Search = win.SunsetSearch, CartApi = win.SunsetCart;
    var stamps = win.STAMPS;
    if (!Array.isArray(stamps) || !Search) {
      var fb = $("catalog-fallback");
      if (fb) fb.hidden = false;
      form.hidden = true;
      var rr = $("results-area");
      if (rr) rr.hidden = true;
      return;
    }

    var gazou = new Set(Array.isArray(win.GAZOU_PAGES) ? win.GAZOU_PAGES : []);
    var latest = Search.latestMonth(stamps);
    var el = {
      year: $("f-year"), country: $("f-country"), q: $("f-q"), min: $("f-min"), max: $("f-max"),
      hide: $("f-hide"), sort: $("f-sort"), clear: $("f-clear"),
      eyebrow: $("hero-eyebrow"), title: $("page-title"), count: $("result-count"),
      grid: $("results"), moreWrap: $("more-wrap"), notice: $("catalog-notice"), empty: $("results-empty")
    };

    // storage (cart) -------------------------------------------------------
    var storage = null, storageOk = false;
    try {
      storage = win.localStorage;
      var probe = "sunset_probe";
      storage.setItem(probe, "1"); storage.removeItem(probe);
      storageOk = true;
    } catch (e) { storage = null; storageOk = false; }
    var cart = null;
    if (storageOk && CartApi) { try { cart = CartApi.createCart(storage); } catch (e) { cart = null; } }
    if (!cart) {
      el.notice.hidden = false;
      el.notice.textContent = "この環境ではカートの保存ができません（ブラウザの設定でサイトデータが無効になっています）。カートへの追加はご利用いただけません。ご注文は、メールまたはFAXでお願いいたします。";
    }
    function updateBadges() {
      var L = win.SunsetLayout;
      if (L && typeof L.updateCartBadges === "function") L.updateCartBadges(doc, storage, CartApi);
    }

    // state -------------------------------------------------------------------
    var state = defaultState();
    var results = [];
    var shownCount = 0;
    var lastHash = null;
    var timer = null;

    function readControls() {
      var y = el.year.value, c = el.country.value;
      return normalizeState({
        years: y === "" ? [] : [Number(y)],
        countries: c === "" ? [] : [c],
        priceMin: el.min.value, priceMax: el.max.value,
        q: el.q.value, hideSoldout: el.hide.checked, sort: el.sort.value, shown: STEP
      });
    }
    function ensureOption(sel, value, label) {
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === value) return;
      var o = doc.createElement("option");
      o.value = value; o.textContent = label;
      sel.appendChild(o);
    }
    function writeControls(st) {
      if (st.years.length) { ensureOption(el.year, String(st.years[0]), st.years[0] === 0 ? "年不明" : st.years[0] + "年"); }
      el.year.value = st.years.length ? String(st.years[0]) : "";
      if (st.countries.length) ensureOption(el.country, st.countries[0], st.countries[0]);
      el.country.value = st.countries.length ? st.countries[0] : "";
      el.min.value = st.priceMin === null ? "" : String(st.priceMin);
      el.max.value = st.priceMax === null ? "" : String(st.priceMax);
      el.q.value = st.q;
      el.hide.checked = st.hideSoldout;
      el.sort.value = st.sort;
    }

    function computeResults(st) {
      var list;
      if (!isFiltered(st)) {
        list = Search.filterStamps(stamps, { years: [latest.year], hideSoldout: st.hideSoldout })
          .filter(function (s) { return s.month === latest.month; });
      } else {
        list = Search.filterStamps(stamps, {
          years: st.years, countries: st.countries, priceMin: st.priceMin, priceMax: st.priceMax,
          q: st.q, hideSoldout: st.hideSoldout
        });
      }
      return Search.sortStamps(list, st.sort);
    }

    function setHash(st) {
      var h = serializeState(st);
      lastHash = h;
      try {
        win.history.replaceState(null, "", win.location.pathname + win.location.search + h);
      } catch (e) {
        try { win.location.hash = h; } catch (e2) { /* ignore */ }
      }
    }

    function mk(tag, cls, text) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function cardFor(stamp) {
      var m = buildCardModel(stamp, gazou);
      var card = mk("article", "card" + (m.canOrder ? "" : " is-soldout"));
      card.setAttribute("tabindex", "-1");
      var meta = mk("div", "card-meta");
      meta.appendChild(mk("span", "", m.countryLabel));
      meta.appendChild(mk("span", "", m.code));
      card.appendChild(meta);
      card.appendChild(mk("h3", "card-title", m.title));
      var price = mk("p", "price", m.priceText);
      card.appendChild(price);
      if (m.priceNote) {
        var pn = mk("p", "card-pricenote");
        pn.appendChild(mk("span", "badge", m.priceNote));
        card.appendChild(pn);
      }
      if (m.statusLabel) {
        var sp = mk("p", "card-status-badge");
        sp.appendChild(mk("span", "badge badge-" + m.statusKey, m.statusLabel));
        card.appendChild(sp);
      }
      var links = mk("p", "card-links");
      var a = mk("a", "", (m.monthLabel ? m.monthLabel + "のリスト" : "リストを見る"));
      a.href = m.listHref;
      links.appendChild(a);
      if (m.imageHref) {
        var ia = mk("a", "", "画像を見る");
        ia.href = m.imageHref;
        links.appendChild(ia);
      }
      card.appendChild(links);
      if (m.canOrder) {
        var act = mk("div", "card-actions");
        var qty = mk("input", "qty");
        qty.type = "number"; qty.min = "1"; qty.max = "5"; qty.step = "1"; qty.value = "1";
        qty.setAttribute("inputmode", "numeric");
        qty.setAttribute("aria-label", "数量");
        var btn = mk("button", "btn btn-primary", "カートへ");
        btn.type = "button";
        btn.setAttribute("aria-label", "カートへ " + m.title);
        var msg = mk("p", "card-cart-msg");
        msg.setAttribute("aria-live", "polite");
        btn.addEventListener("click", function () {
          if (!cart) { msg.textContent = "カートを保存できないため追加できません。"; return; }
          var r;
          try { r = cart.add({ shelf: m.shelf, code: m.code, qty: qty.value }); }
          catch (e) { r = { ok: false, error: "カートに追加できませんでした。" }; }
          if (r.ok && r.persisted === false) {
            msg.textContent = "保存されていません";
            el.notice.hidden = false;
            el.notice.textContent = NOT_SAVED;
          } else {
            msg.textContent = r.ok ? "カートに入れました" : r.error;
          }
        });
        act.appendChild(qty);
        act.appendChild(btn);
        card.appendChild(act);
        card.appendChild(msg);
      }
      return card;
    }

    function updateMore() {
      el.moreWrap.textContent = "";
      var rest = results.length - shownCount;
      if (rest <= 0) return;
      var b = mk("button", "btn btn-ghost", "もっと見る（残り" + rest + "件）");
      b.type = "button";
      b.addEventListener("click", function () {
        var from = shownCount;
        shownCount = nextBatch(results.length, shownCount);
        state.shown = shownCount;
        appendCards(from, shownCount);
        updateMore();
        el.count.textContent = headingModel(state, latest, results.length, shownCount).count;
        setHash(state);
        var first = el.grid.children[from];
        if (first) first.focus();
        else el.grid.focus();
      });
      el.moreWrap.appendChild(b);
    }

    function appendCards(from, to) {
      var frag = doc.createDocumentFragment();
      for (var i = from; i < to; i++) frag.appendChild(cardFor(results[i]));
      el.grid.appendChild(frag);
    }

    function render(st, restoreShown) {
      state = st;
      results = computeResults(st);
      shownCount = Math.min(results.length, restoreShown ? st.shown : STEP);
      el.grid.textContent = "";
      appendCards(0, shownCount);
      updateMore();
      var hm = headingModel(st, latest, results.length, shownCount);
      el.eyebrow.textContent = hm.eyebrow;
      el.title.textContent = hm.title;
      doc.title = (hm.filtered ? "検索結果｜" : "") + "サンセットスタンプ";
      el.count.textContent = hm.count;
      el.empty.hidden = results.length > 0;
    }

    function apply() {
      if (timer) { win.clearTimeout(timer); timer = null; }
      var st = readControls();
      render(st, false);
      setHash(st);
    }
    function applyDebounced() {
      if (timer) win.clearTimeout(timer);
      timer = win.setTimeout(apply, 200);
    }

    function fillFacets() {
      var f = Search.facets(stamps);
      var fy = doc.createDocumentFragment(), fc = doc.createDocumentFragment();
      f.years.forEach(function (e) {
        var o = doc.createElement("option");
        o.value = String(e.value);
        o.textContent = (e.value === 0 ? "年不明" : e.value + "年") + " (" + e.count + "件)";
        fy.appendChild(o);
      });
      f.countries.forEach(function (e) {
        var o = doc.createElement("option");
        o.value = e.value;
        o.textContent = e.value + " (" + e.count + "件)";
        fc.appendChild(o);
      });
      el.year.appendChild(fy);
      el.country.appendChild(fc);
    }

    // first paint: cards of the current hash state (no facets needed)
    function fromHash() {
      var st = parseHash(win.location.hash);
      st.years = st.years.slice(0, 1);       // the UI has single selects
      st.countries = st.countries.slice(0, 1);
      return st;
    }
    var initial = fromHash();
    render(initial, true);
    lastHash = serializeState(initial);
    var rawHash = win.location.hash === "#" ? "" : win.location.hash;
    if (rawHash !== lastHash) setHash(initial); // normalise what the UI actually applied
    win.setTimeout(function () {
      fillFacets();
      writeControls(initial);
    }, 0);

    form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
    el.year.addEventListener("change", apply);
    el.country.addEventListener("change", apply);
    el.sort.addEventListener("change", apply);
    el.hide.addEventListener("change", apply);
    ["q", "min", "max"].forEach(function (k) { el[k].addEventListener("input", applyDebounced); });
    el.clear.addEventListener("click", function () {
      writeControls(defaultState());
      apply();
    });
    win.addEventListener("hashchange", function () {
      if (win.location.hash === lastHash || (win.location.hash === "" && lastHash === "")) return;
      var st = fromHash();
      writeControls(st);
      render(st, true);
      lastHash = serializeState(st);
    });
    if (cart) {
      cart.subscribe(updateBadges);
    }
  }

  return {
    STEP: STEP, defaultState: defaultState, normalizeState: normalizeState,
    parseHash: parseHash, serializeState: serializeState, isFiltered: isFiltered,
    describeFilters: describeFilters, headingModel: headingModel, NOT_SAVED: NOT_SAVED, nextBatch: nextBatch, formatYen: formatYen,
    gazouFor: gazouFor, buildCardModel: buildCardModel, start: start
  };
});
