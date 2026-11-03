/**
 * Tuffs local storage layer.
 * Namespaced under "tuffs.v1" and safe when localStorage is unavailable
 * (private browsing, disabled storage, malformed data).
 */
(function () {
  "use strict";

  var NS = "tuffs.v1";
  var available = false;
  try {
    var probe = NS + ".probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    available = true;
  } catch (e) {
    available = false;
  }

  // In-memory fallback so the portal still works (without persistence)
  // when localStorage is blocked.
  var memory = {};

  function read(key, fallback) {
    if (!available) return key in memory ? memory[key] : fallback;
    try {
      var raw = window.localStorage.getItem(NS + "." + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    if (!available) { memory[key] = value; return; }
    try {
      window.localStorage.setItem(NS + "." + key, JSON.stringify(value));
    } catch (e) {
      /* quota exceeded or blocked - preferences simply won't persist */
    }
  }

  function remove(key) {
    if (!available) { delete memory[key]; return; }
    try { window.localStorage.removeItem(NS + "." + key); } catch (e) {}
  }

  // ----- Favorites: ordered list of game ids (oldest first) -----

  function getFavorites() {
    var v = read("favorites", []);
    return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }) : [];
  }

  function isFavorite(id) {
    return getFavorites().indexOf(id) !== -1;
  }

  function toggleFavorite(id) {
    var list = getFavorites();
    var i = list.indexOf(id);
    var nowFav;
    if (i === -1) { list.push(id); nowFav = true; }
    else { list.splice(i, 1); nowFav = false; }
    write("favorites", list);
    return nowFav;
  }

  // ----- Recently played: [{id, ts}] newest first, capped -----

  function getHistory() {
    var v = read("history", []);
    if (!Array.isArray(v)) return [];
    return v.filter(function (x) {
      return x && typeof x.id === "string" && typeof x.ts === "number";
    });
  }

  function recordPlay(id) {
    var list = getHistory().filter(function (x) { return x.id !== id; });
    list.unshift({ id: id, ts: Date.now() });
    write("history", list.slice(0, 30));
  }

  function clearHistory() { remove("history"); }

  function clearFavorites() { remove("favorites"); }

  // ----- Settings -----

  var DEFAULT_SETTINGS = {
    accent: "violet",   // violet | blue | teal
    motion: "full",     // full | reduced
    density: "comfortable" // comfortable | compact
  };

  function getSettings() {
    var v = read("settings", {}) || {};
    var out = {};
    ["accent", "motion", "density"].forEach(function (k) {
      out[k] = typeof v[k] === "string" ? v[k] : DEFAULT_SETTINGS[k];
    });
    return out;
  }

  function setSetting(k, v) {
    var s = getSettings();
    s[k] = v;
    write("settings", s);
  }

  function resetSettings() { remove("settings"); }

  // What the portal stores, for the settings page.
  var STORAGE_KEYS = [
    { key: "tuffs.v1.favorites", desc: "Game IDs you marked as favorites." },
    { key: "tuffs.v1.history", desc: "Recently played game IDs and timestamps (max 30). Never synced anywhere." },
    { key: "tuffs.v1.settings", desc: "Portal preferences: accent color, motion, card density." }
  ];

  window.TuffsStorage = {
    available: available,
    keys: STORAGE_KEYS,
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    getHistory: getHistory,
    recordPlay: recordPlay,
    clearHistory: clearHistory,
    clearFavorites: clearFavorites,
    getSettings: getSettings,
    setSetting: setSetting,
    resetSettings: resetSettings
  };
})();
