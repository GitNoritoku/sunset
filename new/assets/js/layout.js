(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SunsetLayout = api;
    api.init(root);
  }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function formatCartCount(n) {
    var v = Math.floor(Number(n));
    return String(isFinite(v) && v > 0 ? v : 0);
  }

  // storage is passed in (not read here) so a throwing localStorage getter
  // is handled by the caller's try/catch as well.
  function updateCartBadges(doc, storage, cartApi) {
    var n = 0;
    try { n = cartApi.createCart(storage).count(); } catch (e) { n = 0; }
    var text = formatCartCount(n);
    var els = doc.querySelectorAll("[data-cart-count]");
    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }

  function init(win) {
    if (!win || !win.document) return;
    var doc = win.document;
    function refresh() {
      var storage = null;
      try { storage = win.localStorage; } catch (e) { storage = null; }
      updateCartBadges(doc, storage, win.SunsetCart);
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", refresh);
    else refresh();
    win.addEventListener("storage", refresh);
    doc.addEventListener("visibilitychange", refresh);
  }

  return { formatCartCount: formatCartCount, updateCartBadges: updateCartBadges, init: init };
});
