/* Cart page (cart.html). Pure helpers are exported for node tests; the DOM
   wiring runs only when #add-form exists. Item text is set via textContent only. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SunsetCartPage = api;
    if (root.document) api.start(root);
  }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var MAILTO_LIMIT = 1800;
  var MAX_SHELF = 32;
  var NOT_SAVED = "保存できませんでした。ブラウザの設定により、この内容はページを閉じると消えます。注文はメールかFAXでお願いします。";

  // Same wording as SunsetCart.toMailto's body (kept in sync by a node test).
  function buildOrderText(items) {
    if (!Array.isArray(items) || !items.length) return "";
    var body = "以下の内容で注文いたします。\r\n\r\n";
    items.forEach(function (it) {
      body += "リスト番号: " + it.shelf + " / 商品コード: " + it.code + " / 数量: " + it.qty + "\r\n";
    });
    return body + "\r\n氏名:\r\n住所:\r\n電話:\r\n";
  }

  function mailtoTooLong(url) {
    return String(url || "").length > MAILTO_LIMIT;
  }

  // ?shelf=NNNNN or ?SHELF_ID=NNNNN. Digits only, 1..32 chars; anything else -> "".
  function parseShelf(search) {
    if (typeof search !== "string") return "";
    var q = search.charAt(0) === "?" ? search.slice(1) : search;
    q = q.split("#")[0];
    var found = { shelf: "", SHELF_ID: "" };
    q.split("&").forEach(function (pair) {
      var i = pair.indexOf("=");
      if (i < 1) return;
      var k = pair.slice(0, i);
      if (k !== "shelf" && k !== "SHELF_ID") return;
      var v;
      try { v = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " ")); } catch (e) { return; }
      if (/^\d+$/.test(v) && v.length <= MAX_SHELF && !found[k]) found[k] = v;
    });
    return found.shelf || found.SHELF_ID;
  }

  function start(win) {
    var doc = win.document;
    var form = doc.getElementById("add-form");
    if (!form) return;
    var $ = function (id) { return doc.getElementById(id); };
    var CartApi = win.SunsetCart;
    var el = {
      shelf: $("c-shelf"), code: $("c-code"), qty: $("c-qty"), addMsg: $("add-msg"),
      tbody: $("cart-body"), table: $("cart-table-wrap"), empty: $("empty-msg"), notice: $("cart-notice"),
      mail: $("btn-mail"), print: $("btn-print"), clear: $("btn-clear"),
      confirm: $("confirm-bar"), yes: $("confirm-yes"), no: $("confirm-no"),
      mailMsg: $("mail-msg"), fallback: $("mail-fallback"), text: $("mail-text"), copy: $("btn-copy"), copyMsg: $("copy-msg"),
      sync: $("sync-msg"), alert: $("save-alert")
    };

    var storage = null, cart = null;
    try {
      storage = win.localStorage;
      storage.setItem("sunset_probe", "1"); storage.removeItem("sunset_probe");
      cart = CartApi.createCart(storage);
    } catch (e) { cart = null; }
    if (!cart) {
      el.notice.hidden = false;
      el.notice.textContent = "この環境ではカートの保存ができません（ブラウザの設定でサイトデータが無効になっています）。ご注文は、メールまたはFAXでお願いいたします。";
      form.querySelectorAll("input, button").forEach(function (n) { n.disabled = true; });
      [el.mail, el.print, el.clear].forEach(function (n) { n.disabled = true; });
      el.empty.hidden = false;
      return;
    }

    var shelf = parseShelf(win.location.search);
    if (shelf) el.shelf.value = shelf;

    function mk(tag, text) {
      var n = doc.createElement(tag);
      if (text !== undefined) n.textContent = text;
      return n;
    }

    function render() {
      var items = cart.items();
      el.tbody.textContent = "";
      el.empty.hidden = items.length > 0;
      el.table.hidden = items.length === 0;
      items.forEach(function (it, idx) {
        var tr = mk("tr");
        tr.appendChild(mk("td", it.shelf));
        tr.appendChild(mk("td", it.code));
        tr.appendChild(mk("td", String(it.qty)));
        var td = mk("td");
        td.className = "no-print";
        var b = mk("button", "削除");
        b.type = "button";
        b.className = "btn btn-ghost btn-small";
        b.setAttribute("aria-label", "削除: " + it.code + "（リスト番号 " + it.shelf + "）");
        b.addEventListener("click", function () { removeRow(idx, it); });
        td.appendChild(b);
        tr.appendChild(td);
        el.tbody.appendChild(tr);
      });
      var n = items.length;
      el.mail.disabled = false; // an empty cart gets an explanatory message instead
      el.clear.disabled = n === 0;
      var L = win.SunsetLayout;
      if (L && typeof L.updateCartBadges === "function") L.updateCartBadges(doc, storage, CartApi);
    }

    // Indexes may have shifted (other tab). Re-read, and only remove if the
    // row still matches what the user clicked.
    function removeRow(idx, shown) {
      var now = cart.items();
      var cur = now[idx];
      if (!cur || cur.shelf !== shown.shelf || cur.code !== shown.code || cur.qty !== shown.qty) {
        render();
        el.sync.textContent = "カートの内容が他のタブで変更されていました。表示を更新しました。もう一度ご確認ください。";
        return;
      }
      var rr = cart.remove(idx);
      if (rr && rr.persisted === false) { el.alert.textContent = NOT_SAVED; el.alert.hidden = false; }
      el.sync.textContent = "削除しました。";
      render();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var r = cart.add({ shelf: el.shelf.value, code: el.code.value, qty: el.qty.value });
      if (r.ok && r.persisted === false) {
        el.alert.textContent = NOT_SAVED;
        el.alert.hidden = false;
        el.addMsg.textContent = "";
        el.code.value = "";
      } else if (r.ok) {
        el.alert.hidden = true;
        el.addMsg.textContent = "カートに追加しました。";
        el.code.value = "";
        el.code.focus();
      } else {
        el.addMsg.textContent = r.error;
      }
      render();
    });

    // clear with an in-page confirmation (no window.confirm)
    el.clear.addEventListener("click", function () {
      el.confirm.hidden = false;
      el.no.focus();
    });
    el.no.addEventListener("click", function () {
      el.confirm.hidden = true;
      el.clear.focus();
    });
    el.yes.addEventListener("click", function () {
      var rc = cart.clear();
      el.confirm.hidden = true;
      if (rc && rc.persisted === false) { el.alert.textContent = NOT_SAVED; el.alert.hidden = false; }
      el.sync.textContent = "カートを空にしました。";
      render();
      el.shelf.focus();
    });

    el.mail.addEventListener("click", function () {
      el.fallback.hidden = true;
      el.copyMsg.textContent = "";
      var items = cart.items();
      if (!items.length) {
        el.mailMsg.textContent = "カートが空です。商品を追加してからお試しください。";
        return;
      }
      var url = cart.toMailto();
      if (mailtoTooLong(url)) {
        el.mailMsg.textContent = "注文内容が長いため、メールソフトが開かない場合があります。下の注文内容をコピーして、" +
          CartApi.MAIL_TO + " 宛てのメールに貼り付けてお送りください。";
        el.text.value = buildOrderText(items);
        el.fallback.hidden = false;
        return;
      }
      el.mailMsg.textContent = "メールソフトを開きます。開かない場合は " + CartApi.MAIL_TO + " 宛てにご注文内容をお送りください。";
      win.location.href = url;
    });

    el.copy.addEventListener("click", function () {
      var text = el.text.value;
      var done = false;
      try {
        if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
          win.navigator.clipboard.writeText(text).then(
            function () { el.copyMsg.textContent = "コピーしました。"; },
            function () { selectFallback(); });
          done = true;
        }
      } catch (e) { done = false; }
      if (!done) selectFallback();
    });
    function selectFallback() {
      el.text.focus();
      el.text.select();
      el.copyMsg.textContent = "自動でコピーできませんでした。選択された文字を Ctrl+C でコピーしてください。";
    }

    el.print.addEventListener("click", function () { win.print(); });

    // keep several tabs in sync
    function resync() { cart.refresh(); render(); }
    win.addEventListener("storage", resync);
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) resync(); });
    render();
  }

  return {
    NOT_SAVED: NOT_SAVED, MAILTO_LIMIT: MAILTO_LIMIT, buildOrderText: buildOrderText, mailtoTooLong: mailtoTooLong,
    parseShelf: parseShelf, start: start
  };
});
