/**
 * Tuffs portal application.
 * Hash-routed single-page app. No frameworks, no build step.
 *
 * Routes:
 *   #/            home
 *   #/games       all games (query params: q, cat, sort)
 *   #/favorites   favorites
 *   #/recent      recently played
 *   #/play/<id>   game player
 *   #/settings    settings
 *   #/about       about / credits
 */
(function () {
  "use strict";

  var view = document.getElementById("view");
  var searchInput = document.getElementById("global-search");
  var navItems = Array.prototype.slice.call(document.querySelectorAll(".nav-item"));
  var confirmDialog = document.getElementById("confirm-dialog");
  var playerFrame = null;        // active player iframe, for cleanup
  var playerTimers = [];

  // ---------------- Catalog ----------------

  var catalog = window.TuffsCatalog;
  var games = catalog.games;

  function gameById(id) {
    for (var i = 0; i < games.length; i++) if (games[i].id === id) return games[i];
    return null;
  }

  // ---------------- Utilities ----------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function toast(msg) {
    var root = document.getElementById("toast-root");
    var t = el("div", { class: "toast" }, [msg]);
    root.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function confirmDialogOpen(title, body, okLabel) {
    return new Promise(function (resolve) {
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-body").textContent = body;
      var ok = document.getElementById("confirm-ok");
      ok.textContent = okLabel || "Confirm";
      function done(v) {
        confirmDialog.close();
        ok.removeEventListener("click", onOk);
        confirmDialog.removeEventListener("cancel", onCancel);
        resolve(v);
      }
      function onOk() { done(true); }
      function onCancel() { done(false); }
      ok.addEventListener("click", onOk);
      confirmDialog.addEventListener("cancel", onCancel);
      confirmDialog.showModal();
    });
  }

  function navigate(hash) { location.hash = hash; }

  function parseRoute() {
    var h = location.hash.replace(/^#/, "") || "/";
    var parts = h.split("?");
    var path = parts[0];
    var params = {};
    if (parts[1]) parts[1].split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
    });
    var seg = path.split("/").filter(Boolean);
    return { path: path, seg: seg, params: params };
  }

  // ---------------- Icons ----------------

  var ICONS = {
    fav: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>',
    favOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-7-7 7 7 7"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11A8 8 0 1 0 20 13"/><path d="M20 4v7h-7"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4 10 14"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
  };

  // ---------------- Game cards ----------------

  function initials(title) {
    var words = title.replace(/[^a-zA-Z0-9 .]/g, "").split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function favButton(game) {
    var active = window.TuffsStorage.isFavorite(game.id);
    return el("button", {
      class: "fav-btn" + (active ? " active" : ""),
      type: "button",
      "aria-pressed": active ? "true" : "false",
      "aria-label": (active ? "Remove " : "Add ") + game.title + (active ? " from favorites" : " to favorites"),
      onclick: function (e) {
        e.preventDefault();
        e.stopPropagation();
        var nowFav = window.TuffsStorage.toggleFavorite(game.id);
        e.currentTarget.classList.toggle("active", nowFav);
        e.currentTarget.setAttribute("aria-pressed", nowFav ? "true" : "false");
        e.currentTarget.setAttribute("aria-label", (nowFav ? "Remove " : "Add ") + game.title + (nowFav ? " from favorites" : " to favorites"));
        toast(nowFav ? "Added to favorites" : "Removed from favorites");
        updateNavCounts();
        refreshIfListRoute();
      }
    }, [html(nowFav(active) ? ICONS.fav : ICONS.favOutline)]);
    function nowFav() { return window.TuffsStorage.isFavorite(game.id); }
  }

  function html(s) { var t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstChild; }

  function gameCard(game) {
    var thumbChildren = [];
    if (game.thumb) {
      thumbChildren.push(el("img", {
        src: game.thumb,
        alt: "",
        loading: "lazy",
        decoding: "async",
        width: "320", height: "200",
        onerror: function () {
          // Broken reference -> tasteful fallback instead of broken image
          this.style.display = "none";
          if (!this.parentNode.querySelector(".thumb-fallback")) {
            this.parentNode.appendChild(fallbackThumb(game));
          }
        }
      }));
    } else {
      thumbChildren.push(fallbackThumb(game));
    }

    return el("article", { class: "game-card" }, [
      el("a", {
        class: "card-link",
        href: "#/play/" + encodeURIComponent(game.id),
        "aria-label": "Play " + game.title
      }, [
        el("div", { class: "thumb" }, thumbChildren),
        el("div", { class: "card-body" }, [
          el("span", { class: "card-title" }, [game.title]),
          el("span", { class: "card-cat" }, [game.category + (game.external ? " · external" : "")])
        ])
      ]),
      favButton(game)
    ]);
  }

  function fallbackThumb(game) {
    return el("div", { class: "thumb-fallback" }, [
      el("span", { class: "initials" }, [initials(game.title)])
    ]);
  }

  // ---------------- Grid with incremental rendering ----------------

  function renderGrid(container, list) {
    var PAGE = 24;
    var rendered = 0;
    container.innerHTML = "";
    if (!list.length) return;

    function renderMore() {
      var frag = document.createDocumentFragment();
      var end = Math.min(rendered + PAGE, list.length);
      for (var i = rendered; i < end; i++) frag.appendChild(gameCard(list[i]));
      rendered = end;
      container.appendChild(frag);
      if (rendered < list.length) {
        container.appendChild(el("div", { class: "show-more-wrap" }, [
          el("button", { class: "btn btn-ghost", onclick: function (e) {
            var w = e.currentTarget.closest(".show-more-wrap");
            w.remove();
            renderMore();
          } }, ["Show more (" + (list.length - rendered) + " left)"])
        ]));
      }
    }
    renderMore();
  }

  function emptyState(title, body, actionLabel, actionHash) {
    var children = [
      html(ICONS.grid),
      el("div", { class: "title" }, [title]),
      el("div", {}, [body])
    ];
    if (actionLabel) children.push(el("a", { class: "btn btn-primary", href: actionHash }, [actionLabel]));
    return el("div", { class: "empty" }, children);
  }

  // ---------------- List view (games / favorites / recent) ----------------

  function recentIds() {
    return window.TuffsStorage.getHistory().map(function (h) { return h.id; });
  }

  function sortOptions(list) {
    return list.slice().sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
  }

  function renderListPage(title, list, opts) {
    opts = opts || {};
    var q = opts.q || "";
    var cat = opts.cat || "All";
    var sort = opts.sort || "az";

    var categories = ["All", "Self-hosted"].concat(catalog.categories);

    var head = el("div", { class: "page-head" }, [
      el("h1", {}, [title]),
      el("span", { class: "sub" }, [list.length + " game" + (list.length === 1 ? "" : "s")])
    ]);

    var filterbar = el("div", { class: "filterbar" });
    categories.forEach(function (c) {
      filterbar.appendChild(el("button", {
        class: "chip",
        type: "button",
        "aria-pressed": c === cat ? "true" : "false",
        onclick: function () {
          var p = parseRoute();
          var params = [];
          if (q) params.push("q=" + encodeURIComponent(q));
          if (c !== "All") params.push("cat=" + encodeURIComponent(c));
          if (sort !== "az") params.push("sort=" + sort);
          navigate("#" + p.path + (params.length ? "?" + params.join("&") : ""));
        }
      }, [c]));
    });

    var sortSel = el("select", {
      class: "select",
      "aria-label": "Sort games",
      onchange: function () {
        var p = parseRoute();
        var params = [];
        if (q) params.push("q=" + encodeURIComponent(q));
        if (cat !== "All") params.push("cat=" + encodeURIComponent(cat));
        if (this.value !== "az") params.push("sort=" + this.value);
        navigate("#" + p.path + (params.length ? "?" + params.join("&") : ""));
      }
    }, [
      el("option", { value: "az", selected: sort === "az" ? "" : null }, ["A – Z"]),
      el("option", { value: "za", selected: sort === "za" ? "" : null }, ["Z – A"]),
      el("option", { value: "recent", selected: sort === "recent" ? "" : null }, ["Recently played"])
    ]);
    filterbar.appendChild(sortSel);
    filterbar.appendChild(el("span", { class: "result-count" }, []));

    // Filter
    var visible = list.slice();
    if (cat === "Self-hosted") visible = visible.filter(function (g) { return !g.external; });
    else if (cat !== "All") visible = visible.filter(function (g) { return g.category === cat; });
    if (q) {
      var needle = q.toLowerCase();
      visible = visible.filter(function (g) { return g.title.toLowerCase().indexOf(needle) !== -1; });
    }
    if (sort === "az") visible = sortOptions(visible);
    else if (sort === "za") visible = sortOptions(visible).reverse();
    else if (sort === "recent") {
      var order = {};
      recentIds().forEach(function (id, i) { order[id] = i; });
      visible.sort(function (a, b) {
        var ai = order[a.id] === undefined ? 1e9 : order[a.id];
        var bi = order[b.id] === undefined ? 1e9 : order[b.id];
        return ai - bi;
      });
    }

    filterbar.querySelector(".result-count").textContent = visible.length + " result" + (visible.length === 1 ? "" : "s");

    var grid = el("div", { class: "grid" });

    view.innerHTML = "";
    view.appendChild(head);
    if (opts.showFilters !== false) view.appendChild(filterbar);
    if (visible.length) {
      renderGrid(grid, visible);
      view.appendChild(grid);
    } else {
      view.appendChild(emptyState(
        "No games found",
        q ? 'Nothing matches "' + q + '". Try another search or category.' :
            "This list is empty. Games you favorite or play will show up here.",
        "Browse all games",
        "#/games"
      ));
    }
  }

  // ---------------- Home ----------------

  function renderHome() {
    view.innerHTML = "";
    var featured = games.filter(function (g) { return g.featured; });
    var history = window.TuffsStorage.getHistory().map(function (h) { return gameById(h.id); }).filter(Boolean);
    var favIds = window.TuffsStorage.getFavorites();
    var favs = favIds.map(gameById).filter(Boolean);

    // Compact welcome
    view.appendChild(el("div", { class: "hero" }, [
      el("div", { class: "hero-text" }, [
        el("h1", {}, ["Welcome to Tuffs"]),
        el("p", {}, [
          games.length + " games ready to play, plus a private web browser. ",
          "Search above, or pick something below."
        ]),
        el("div", { class: "hero-actions" }, [
          el("a", { class: "btn btn-primary", href: "#/games" }, ["Browse all games"]),
          el("a", { class: "btn btn-ghost", href: "/browse.html" }, ["Open Tuffx"])
        ])
      ])
    ]));

    if (featured.length) {
      view.appendChild(section("Popular games", "Well-known favorites, curated in the portal config", featured, "#/games"));
    }
    if (history.length) {
      view.appendChild(section("Continue playing", "Your recent games", history.slice(0, 6), "#/recent"));
    }
    if (favs.length) {
      view.appendChild(section("Favorites", "Games you starred", favs.slice(0, 6), "#/favorites"));
    }
    view.appendChild(section("All games", null, sortOptions(games).slice(0, 12), "#/games"));
  }

  function section(title, sub, list, moreHref) {
    var s = el("div", { class: "section" });
    var head = el("div", { class: "section-head" }, [
      el("h2", {}, [title])
    ]);
    if (sub) head.appendChild(el("span", { class: "sub" }, [sub]));
    head.appendChild(el("span", { class: "spacer" }, []));
    if (moreHref) head.appendChild(el("a", { href: moreHref }, ["View all →"]));
    s.appendChild(head);
    var grid = el("div", { class: "grid" });
    renderGrid(grid, list);
    s.appendChild(grid);
    return s;
  }

  // ---------------- Player ----------------

  function clearPlayer() {
    playerTimers.forEach(clearTimeout);
    playerTimers = [];
    if (playerFrame) {
      // Remove the iframe so the game's timers/renderers are released.
      try { playerFrame.src = "about:blank"; } catch (e) {}
      playerFrame.remove();
      playerFrame = null;
    }
  }

  function renderPlayer(id) {
    clearPlayer();
    var game = gameById(id);
    if (!game) {
      view.innerHTML = "";
      view.appendChild(emptyState("Game not found", "This game is not in the catalog. It may have been removed.", "Back to library", "#/games"));
      return;
    }

    window.TuffsStorage.recordPlay(game.id);
    updateNavCounts();

    view.innerHTML = "";
    var backBtn = el("button", {
      class: "btn btn-ghost btn-sm",
      onclick: function () { navigate("#/games"); }
    }, [html(ICONS.arrowLeft), "Back to library"]);

    var stage = el("div", { class: "player-stage" });
    var loading = el("div", { class: "player-loading" }, [
      el("div", { class: "spinner" }),
      el("div", {}, ["Loading " + game.title + "…"])
    ]);
    stage.appendChild(loading);

    var frame = el("iframe", {
      title: game.title,
      src: game.entry,
      allow: "autoplay; fullscreen; gamepad",
      allowfullscreen: ""
    });
    playerFrame = frame;
    stage.appendChild(frame);

    var loaded = false;
    frame.addEventListener("load", function () {
      loaded = true;
      loading.style.display = "none";
    });

    // Cross-origin games may fail silently; we don't pretend the load event
    // proves the game works. If nothing loads after a while, offer the
    // direct-open fallback instead of an endless spinner.
    playerTimers.push(setTimeout(function () {
      if (!loaded) {
        loading.innerHTML = "";
        loading.appendChild(el("div", {}, [
          game.title + " is taking a long time to load. ",
          el("a", { href: game.entry, target: "_blank", rel: "noopener" }, ["Open it directly"]),
          " in a new tab, or reload the player."
        ]));
      }
    }, 12000));

    var reloadBtn = el("button", {
      class: "btn btn-ghost btn-sm",
      onclick: function () {
        confirmDialogOpen(
          "Reload game?",
          "Reloading will restart the game. Unsaved progress (if the game keeps any) may be lost.",
          "Reload"
        ).then(function (ok) {
          if (!ok) return;
          loading.style.display = "";
          frame.src = "about:blank";
          setTimeout(function () { frame.src = game.entry; }, 30);
        });
      }
    }, [html(ICONS.refresh), "Reload"]);

    var fullscreenBtn = el("button", {
      class: "btn btn-ghost btn-sm",
      onclick: function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else stage.requestFullscreen().catch(function () { toast("Fullscreen not available in this browser"); });
      }
    }, [html(ICONS.expand), "Fullscreen"]);

    view.appendChild(el("div", { class: "player-top" }, [
      backBtn,
      el("h1", {}, [game.title]),
      el("span", { class: "badge badge-neutral" }, [game.category]),
      favButton(game),
      reloadBtn,
      fullscreenBtn
    ]));
    view.appendChild(stage);

    view.appendChild(el("div", { class: "player-note" }, [
      html(ICONS.info),
      el("span", {}, [
        game.external
          ? "This game is streamed from an external server (not your portal's own files). If it fails to load or is blocked, "
          : "This game runs from your portal's own copy of its files. A successful page load does not guarantee every game feature works — if something seems broken, ",
        el("a", { href: game.entry, target: "_blank", rel: "noopener" }, ["open the game directly"]),
        " in a new tab."
      ])
    ]));

    // Details
    var details = el("div", { class: "player-details" });
    details.appendChild(el("div", { class: "detail-card" }, [
      el("h3", {}, ["Source & license"]),
      el("p", {}, [
        game.source === "NettleWeb (external)"
          ? "External entry from the NettleWeb catalog (github.com/BlueDonuts/unblocked-games); runs from a third-party CDN. "
          : (game.source === "NettleWeb"
              ? "Files copied from the NettleWeb repository (github.com/BlueDonuts/unblocked-games). "
              : "Files copied from the BlazerGames repository. "),
        game.license.status === "mit" ? "MIT licensed (see LICENSE.txt in the game folder)." :
          "License unresolved — third-party game redistributed by the source repository without permission terms. See About for details."
      ])
    ]));
    if (game.knownDependencies && game.knownDependencies.length) {
      details.appendChild(el("div", { class: "detail-card" }, [
        el("h3", {}, ["Known dependencies"]),
        el("ul", {}, game.knownDependencies.map(function (d) { return el("li", {}, [d]); }))
      ]));
    }
    view.appendChild(details);
  }

  // ---------------- Settings ----------------

  function renderSettings() {
    var S = window.TuffsStorage;
    var settings = S.getSettings();

    view.innerHTML = "";
    view.appendChild(el("div", { class: "page-head" }, [
      el("h1", {}, ["Settings"]),
      el("span", { class: "sub" }, ["Stored locally on this device only"])
    ]));

    if (!S.available) {
      view.appendChild(el("div", { class: "setup-notice" }, [
        el("h2", {}, ["Local storage unavailable"]),
        el("p", {}, [
          "Your browser is blocking local storage (private browsing or a restrictive setting), so favorites, ",
          "recently played and preferences will not persist between visits. Everything else works normally."
        ])
      ]));
    }

    // Appearance
    var group1 = el("div", { class: "settings-group" }, [el("h2", {}, ["Appearance"])]);

    group1.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Accent color"]),
        el("div", { class: "setting-desc" }, ["Used for highlights, links and buttons"])
      ]),
      el("div", { class: "swatches" }, ["violet", "blue", "teal"].map(function (a) {
        return el("button", {
          class: "swatch swatch-" + a,
          type: "button",
          "aria-pressed": settings.accent === a ? "true" : "false",
          "aria-label": a + " accent",
          onclick: function () {
            S.setSetting("accent", a);
            applySettings();
            renderSettings();
          }
        });
      }))
    ]));

    group1.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Card density"]),
        el("div", { class: "setting-desc" }, ["How tightly game cards are packed"])
      ]),
      el("div", { class: "segmented" }, ["comfortable", "compact"].map(function (d) {
        return el("button", {
          type: "button",
          "aria-pressed": settings.density === d ? "true" : "false",
          onclick: function () { S.setSetting("density", d); applySettings(); renderSettings(); }
        }, [d.charAt(0).toUpperCase() + d.slice(1)]);
      }))
    ]));
    view.appendChild(group1);

    // Motion
    var group2 = el("div", { class: "settings-group" }, [el("h2", {}, ["Motion"])]);

    group2.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Animation"]),
        el("div", { class: "setting-desc" }, ["Reduce transitions and card animations"])
      ]),
      el("div", { class: "segmented" }, [["full", "Full"], ["reduced", "Reduced"]].map(function (pair) {
        return el("button", {
          type: "button",
          "aria-pressed": settings.motion === pair[0] ? "true" : "false",
          onclick: function () { S.setSetting("motion", pair[0]); applySettings(); renderSettings(); }
        }, [pair[1]]);
      }))
    ]));
    view.appendChild(group2);

    // Data
    var group3 = el("div", { class: "settings-group" }, [el("h2", {}, ["Local data"])]);

    group3.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Clear favorites"]),
        el("div", { class: "setting-desc" }, ["Removes your favorites list. Games are not deleted."])
      ]),
      el("button", {
        class: "btn btn-danger-ghost btn-sm", type: "button",
        onclick: function () {
          confirmDialogOpen("Clear favorites?", "This removes every game from your favorites list. This cannot be undone.", "Clear")
            .then(function (ok) {
              if (!ok) return;
              S.clearFavorites(); updateNavCounts(); toast("Favorites cleared"); renderSettings();
            });
        }
      }, ["Clear"])
    ]));

    group3.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Clear recently played"]),
        el("div", { class: "setting-desc" }, ["Forgets which games you opened recently."])
      ]),
      el("button", {
        class: "btn btn-danger-ghost btn-sm", type: "button",
        onclick: function () {
          confirmDialogOpen("Clear recently played?", "This forgets your play history on this device. This cannot be undone.", "Clear")
            .then(function (ok) {
              if (!ok) return;
              S.clearHistory(); toast("History cleared"); renderSettings();
            });
        }
      }, ["Clear"])
    ]));

    group3.appendChild(el("div", { class: "setting-row" }, [
      el("div", {}, [
        el("div", { class: "setting-label" }, ["Reset portal preferences"]),
        el("div", { class: "setting-desc" }, ["Resets accent, motion and density. Keeps favorites and history."])
      ]),
      el("button", {
        class: "btn btn-ghost btn-sm", type: "button",
        onclick: function () {
          S.resetSettings(); applySettings(); toast("Preferences reset"); renderSettings();
        }
      }, ["Reset"])
    ]));
    view.appendChild(group3);

    // What the portal stores
    view.appendChild(el("div", { class: "settings-group" }, [
      el("h2", {}, ["What this portal stores"]),
      el("p", { class: "setting-desc", style: "margin: 0 0 10px" }, [
        "Tuffs stores everything locally in your browser under the tuffs.v1 keys below. Nothing is sent to a server, and clearing portal preferences never touches game saves."
      ]),
      S.keys.map(function (k) {
        return el("div", { class: "setting-row" }, [
          el("div", {}, [
            el("div", { class: "setting-label" }, [el("code", { style: "font-size:12px" }, [k.key])]),
            el("div", { class: "setting-desc" }, [k.desc])
          ])
        ]);
      })
    ]));
  }

  // ---------------- About ----------------

  function renderAbout() {
    view.innerHTML = "";
    view.appendChild(el("div", { class: "page-head" }, [
      el("h1", {}, ["About / Credits"]),
      el("span", { class: "sub" }, ["Sources, licenses and honest limitations"])
    ]));

    view.appendChild(el("div", { class: "prose" }, [
      el("h2", {}, ["What Tuffs is"]),
      el("p", {}, [
        "Tuffs is a self-hosted arcade portal and private web browser. The game library combines self-hosted games from the ",
        el("a", { href: "https://github.com/beforeblazergithub/BlazerGames", target: "_blank", rel: "noopener" }, ["BlazerGames"]),
        " and ",
        el("a", { href: "https://github.com/BlueDonuts/unblocked-games", target: "_blank", rel: "noopener" }, ["BlueDonuts/unblocked-games (NettleWeb)"]),
        " repositories (entries marked 'external' are streamed from third-party CDNs and are not self-hosted), and the Tuffx browser is powered by ",
        el("a", { href: "https://github.com/MercuryWorkshop/scramjet", target: "_blank", rel: "_blank noopener" }, ["Scramjet"]),
        " from Mercury Workshop. Tuffs is an independent portal and is not affiliated with either project."
      ]),
      el("h2", {}, ["Game licensing — read this"]),
      el("p", {}, [
        "The BlazerGames and BlueDonuts/unblocked-games repositories redistribute third-party games; neither grants rights to the games themselves (BlueDonuts is MIT for its software only). ",
        "Only one game in the library ships its own license: 2048 (MIT, Gabriele Cirulli). ",
        "Every other entry is marked 'license unresolved' in the catalog. If you are the rights holder of a game ",
        "listed here and want it removed from your self-hosted copy, delete its folder under games/ and its catalog entry in ",
        el("code", {}, ["public/data/games.json"]), "."
      ]),
      el("h2", {}, ["Proxy: Tuffx"]),
      el("p", {}, [
        "Tuffx uses the Scramjet client (MIT) with the libcurl transport over a Wisp backend, following the official ",
        el("a", { href: "https://github.com/MercuryWorkshop/Scramjet-App", target: "_blank", rel: "noopener" }, ["Scramjet-App"]),
        " reference implementation. The backend that ships with Tuffs can restrict destinations, rate-limit requests and ",
        "block private/internal network ranges — see the README for what it can and cannot enforce. ",
        "Tuffs does not promise anonymity or universal access, and it is not a tool for evading device management."
      ]),
      el("h2", {}, ["Privacy"]),
      el("p", {}, [
        "Favorites, recently played and preferences live only in your browser's local storage (keys under tuffs.v1). ",
        "The portal sets no cookies for itself and includes no trackers or third-party analytics. ",
        "Proxy browsing history is not recorded by the portal. Games are third-party software and may make their own network requests (see each game's catalog entry)."
      ]),
      el("h2", {}, ["Also inspected"]),
      el("p", {}, [
        "During development we also inspected ",
        el("a", { href: "https://github.com/Americarna/InvisiProxynoxroxynoxy", target: "_blank", rel: "noopener" }, ["InvisiProxynoxroxynoxy"]),
        " (a fork of QuiteAFancyEmerald's InvisiProxy LTS, AGPL-3.0). No code was reused from it: it is a complete alternative portal (Ultraviolet + Scramjet) whose license would require relicensing this entire project, and its games live in a separate archive. See the README for the full architectural note."
      ])
    ]));
  }

  // ---------------- Settings application ----------------

  function applySettings() {
    var s = window.TuffsStorage.getSettings();
    var root = document.documentElement;
    root.setAttribute("data-accent", s.accent);
    root.setAttribute("data-density", s.density);
    root.setAttribute("data-motion", s.motion);
  }

  // ---------------- Nav ----------------

  function updateNavCounts() {
    var counts = {
      games: games.length,
      favorites: window.TuffsStorage.getFavorites().length
    };
    document.querySelectorAll("[data-nav-count]").forEach(function (n) {
      var v = counts[n.getAttribute("data-nav-count")];
      if (v != null && v > 0) {
        n.hidden = false;
        n.textContent = v;
      } else {
        n.hidden = true;
      }
    });
  }

  function refreshIfListRoute() {
    var r = parseRoute();
    if (r.path === "/favorites" || r.path === "/recent") route();
  }

  // ---------------- Router ----------------

  function route() {
    var r = parseRoute();
    clearPlayer();
    window.scrollTo(0, 0);

    var current = null;
    if (r.path === "/" || r.path === "") { renderHome(); current = "home"; }
    else if (r.path === "/games") { renderListPage("All Games", games, r.params); current = "games"; }
    else if (r.path === "/favorites") {
      var favs = window.TuffsStorage.getFavorites().map(gameById).filter(Boolean);
      renderListPage("Favorites", favs, r.params);
      current = "favorites";
    }
    else if (r.path === "/recent") {
      var rec = window.TuffsStorage.getHistory().map(function (h) { return gameById(h.id); }).filter(Boolean);
      renderListPage("Recently Played", rec, Object.assign({}, r.params, { sort: r.params.sort || "recent" }));
      current = "recent";
    }
    else if (r.seg[0] === "play") { renderPlayer(decodeURIComponent(r.seg[1] || "")); current = null; }
    else if (r.path === "/settings") { renderSettings(); current = "settings"; }
    else if (r.path === "/about") { renderAbout(); current = "about"; }
    else { renderHome(); current = "home"; }

    navItems.forEach(function (a) {
      if (a.getAttribute("data-route") === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    // Reflect ?q= into the search box
    if (current === "games" && r.params.q) searchInput.value = r.params.q;
    else if (current !== "games" && document.activeElement !== searchInput) searchInput.value = "";
  }

  // ---------------- Events ----------------

  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    var q = this.value;
    searchTimer = setTimeout(function () {
      var r = parseRoute();
      if (r.path !== "/games") {
        navigate("#/games" + (q ? "?q=" + encodeURIComponent(q) : ""));
      } else {
        var params = [];
        if (q) params.push("q=" + encodeURIComponent(q));
        if (r.params.cat && r.params.cat !== "All") params.push("cat=" + encodeURIComponent(r.params.cat));
        if (r.params.sort && r.params.sort !== "az") params.push("sort=" + r.params.sort);
        var newHash = "#/games" + (params.length ? "?" + params.join("&") : "");
        // replaceState-style update without adding history entries per keystroke
        history.replaceState(null, "", location.pathname + location.search + newHash);
        route();
      }
    }, 120);
  });

  document.getElementById("random-btn").addEventListener("click", function () {
    var pick = games[Math.floor(Math.random() * games.length)];
    navigate("#/play/" + encodeURIComponent(pick.id));
  });

  // Mobile nav
  var navToggle = document.getElementById("nav-toggle");
  var sidebar = document.getElementById("sidebar");
  navToggle.addEventListener("click", function () {
    var open = sidebar.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  sidebar.addEventListener("click", function (e) {
    if (e.target.closest(".nav-item, .brand")) {
      sidebar.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.focus();
    }
  });

  window.addEventListener("hashchange", route);

  // ---------------- Init ----------------

  catalog.load(function () {
    games = catalog.games;
    applySettings();
    updateNavCounts();
    route();
  });
})();
