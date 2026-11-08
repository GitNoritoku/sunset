(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SunsetCart = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var STORAGE_KEY = "sunset_cart_v1";
  var MAIL_TO = "sunsetweb@tokyo.email.ne.jp";
  var FAX = "03-3717-9614";
  var MIN_ORDER_YEN = 1000;
  var MAX_CODE = 64;
  var MAX_SHELF = 32;
  var DEFAULT_SHELF = "(未指定)";

  function parseQty(v) {
    if (typeof v === "string") {
      if (!/^\s*\d+\s*$/.test(v)) return NaN;
      v = Number(v);
    }
    return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : NaN;
  }

  function sanitize(raw) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(data)) return [];
    var out = [];
    data.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var code = String(it.code == null ? "" : it.code).trim();
      var qty = parseQty(it.qty);
      if (!code || isNaN(qty)) return;
      var shelf = String(it.shelf == null ? "" : it.shelf).trim() || DEFAULT_SHELF;
      out.push({ shelf: shelf, code: code, qty: qty });
    });
    return out;
  }

  // Every operation re-reads storage first, so several instances/tabs sharing
  // one storage do not overwrite each other. If getItem throws, or the last
  // setItem failed (storage unwritable), the in-memory list is used instead.
  function createCart(storage) {
    var list = [];
    var subs = [];
    var unsynced = false;

    function load() {
      if (unsynced) return;
      try { list = sanitize(storage.getItem(STORAGE_KEY)); } catch (e) { /* keep memory */ }
    }
    function persist() {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); unsynced = false; }
      catch (e) { unsynced = true; }
    }
    function notify() {
      subs.slice().forEach(function (fn) { fn(); });
    }
    function changed() {
      persist();
      notify();
    }
    load();

    return {
      items: function () {
        load();
        return list.map(function (it) { return { shelf: it.shelf, code: it.code, qty: it.qty }; });
      },
      add: function (input) {
        var o = input || {};
        var code = String(o.code == null ? "" : o.code).trim();
        if (!code) return { ok: false, error: "商品コードを入力してください。" };
        if (code.length > MAX_CODE) return { ok: false, error: "商品コードは" + MAX_CODE + "文字以内で入力してください。" };
        var qty = parseQty(o.qty);
        if (isNaN(qty)) return { ok: false, error: "数量は1～5の整数で入力してください。" };
        var shelf = String(o.shelf == null ? "" : o.shelf).trim() || DEFAULT_SHELF;
        if (shelf.length > MAX_SHELF) return { ok: false, error: "リスト番号は" + MAX_SHELF + "文字以内で入力してください。" };
        load();
        list.push({ shelf: shelf, code: code, qty: qty });
        changed();
        return { ok: true, persisted: !unsynced };
      },
      remove: function (index) {
        load();
        if (!Number.isInteger(index) || index < 0 || index >= list.length) return { persisted: !unsynced };
        list.splice(index, 1);
        changed();
        return { persisted: !unsynced };
      },
      clear: function () {
        load();
        list = [];
        changed();
        return { persisted: !unsynced };
      },
      refresh: function () {
        load();
        notify();
      },
      count: function () { load(); return list.length; },
      toMailto: function () {
        load();
        if (!list.length) return "";
        var body = "以下の内容で注文いたします。\r\n\r\n";
        list.forEach(function (it) {
          body += "リスト番号: " + it.shelf + " / 商品コード: " + it.code + " / 数量: " + it.qty + "\r\n";
        });
        body += "\r\n氏名:\r\n住所:\r\n電話:\r\n";
        return "mailto:" + MAIL_TO + "?subject=" + encodeURIComponent("注文") +
          "&body=" + encodeURIComponent(body);
      },
      subscribe: function (fn) {
        subs.push(fn);
        return function () {
          var i = subs.indexOf(fn);
          if (i >= 0) subs.splice(i, 1);
        };
      }
    };
  }

  return {
    createCart: createCart,
    STORAGE_KEY: STORAGE_KEY, MAIL_TO: MAIL_TO, FAX: FAX, MIN_ORDER_YEN: MIN_ORDER_YEN
  };
});
