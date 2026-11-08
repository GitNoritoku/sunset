(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SunsetSearch = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFKC").toLowerCase();
  }

  // NFKC-lowercase with all Unicode whitespace (incl. U+3000) removed: "ZT １" -> "zt1".
  function compact(s) {
    return norm(s).replace(/\s+/g, "");
  }

  function toSet(arr) {
    return Array.isArray(arr) && arr.length ? new Set(arr) : null;
  }

  function filterStamps(stamps, opts) {
    if (!Array.isArray(stamps)) return [];
    var o = opts || {};
    var years = toSet(o.years);
    var countries = toSet(o.countries);
    var min = typeof o.priceMin === "number" && !isNaN(o.priceMin) ? o.priceMin : null;
    var max = typeof o.priceMax === "number" && !isNaN(o.priceMax) ? o.priceMax : null;
    var tokens = norm(o.q).split(/\s+/).filter(Boolean);
    var hide = !!o.hideSoldout;
    return stamps.filter(function (s) {
      if (years && !years.has(s.year)) return false;
      if (countries && !countries.has(s.country)) return false;
      if (min !== null && !(s.price >= min)) return false;
      if (max !== null && !(s.price <= max)) return false;
      if (hide && s.status === "soldout") return false;
      if (tokens.length) {
        var hay = norm(s.name + " " + s.code + " " + s.country) + " " + compact(s.code);
        for (var i = 0; i < tokens.length; i++) if (hay.indexOf(tokens[i]) < 0) return false;
      }
      return true;
    });
  }

  // month 0 (no month) sorts after months 1..12 of the same year when descending.
  function monthRank(m) {
    return m > 0 ? m : -1;
  }

  function sortStamps(stamps, key) {
    if (!Array.isArray(stamps)) return [];
    var cmp;
    if (key === "priceAsc") cmp = function (a, b) { return a.price - b.price; };
    else if (key === "priceDesc") cmp = function (a, b) { return b.price - a.price; };
    else cmp = function (a, b) {
      return (b.year - a.year) || (monthRank(b.month) - monthRank(a.month));
    };
    return stamps
      .map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) { return cmp(a.s, b.s) || a.i - b.i; })
      .map(function (e) { return e.s; });
  }

  function latestMonth(stamps) {
    var best = { year: 0, month: 0 };
    if (!Array.isArray(stamps)) return best;
    for (var i = 0; i < stamps.length; i++) {
      var s = stamps[i];
      if (!s || !s.year) continue;
      if (s.year > best.year || (s.year === best.year && s.month > best.month)) {
        best = { year: s.year, month: s.month };
      }
    }
    return best;
  }

  function facets(stamps) {
    var y = new Map();
    var c = new Map();
    (Array.isArray(stamps) ? stamps : []).forEach(function (s) {
      y.set(s.year, (y.get(s.year) || 0) + 1);
      c.set(s.country, (c.get(s.country) || 0) + 1);
    });
    function toList(m) {
      return Array.from(m, function (e) { return { value: e[0], count: e[1] }; });
    }
    return {
      years: toList(y).sort(function (a, b) { return b.value - a.value; }),
      countries: toList(c).sort(function (a, b) {
        return (b.count - a.count) || String(a.value).localeCompare(String(b.value), "ja");
      })
    };
  }

  return { filterStamps: filterStamps, sortStamps: sortStamps, latestMonth: latestMonth, facets: facets };
});
