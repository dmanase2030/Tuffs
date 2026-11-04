/**
 * Tuffs game catalog loader.
 * Reads public/data/games.json, validates ids and paths, exposes:
 *   TuffsCatalog.load(cb)   -> cb() when ready (catalog available immediately)
 *   TuffsCatalog.games      -> array of game records
 *   TuffsCatalog.categories -> sorted unique category names
 */
(function () {
  "use strict";

  var state = {
    games: [],
    categories: [],
    loadError: null
  };

  function normalize(data) {
    var seen = {};
    var out = [];
    var cats = {};
    (data && data.games ? data.games : []).forEach(function (g) {
      if (!g || !g.id || seen[g.id]) return; // drop missing/duplicate ids
      seen[g.id] = true;
      cats[g.category || "Other"] = true;
      out.push({
        id: g.id,
        slug: g.slug || g.id,
        title: g.title || g.id,
        entry: g.entry || ("games/" + (g.slug || g.id) + "/index.html"),
        thumb: g.thumb || null,
        category: g.category || "Other",
        license: g.license || { status: "unresolved", note: "" },
        source: g.source || "BlazerGames",
        knownDependencies: g.knownDependencies || [],
        verified: g.verified || {},
        featured: !!g.featured,
        external: !!g.external
      });
    });
    return { games: out, categories: Object.keys(cats).sort() };
  }

  function load(cb) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      state.categories = normalize({ games: state.games }).categories;
      if (typeof cb === "function") cb();
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "data/games.json", true);
    xhr.onload = function () {
      try {
        var data = JSON.parse(xhr.responseText);
        var norm = normalize(data);
        state.games = norm.games;
        state.categories = norm.categories;
      } catch (e) {
        state.loadError = "Catalog data could not be read. Re-run scripts/verify-catalog.js on the server.";
        state.games = [];
      }
      finish();
    };
    xhr.onerror = function () {
      state.loadError = "Catalog data could not be loaded.";
      finish();
    };
    xhr.send();

    // Safety timeout so the UI never hangs if the request stalls.
    setTimeout(finish, 4000);
  }

  window.TuffsCatalog = {
    load: load,
    get games() { return state.games; },
    get categories() { return state.categories; },
    get loadError() { return state.loadError; }
  };
})();
