/* ============================================================
   Tuffs — Hyprland refresh (behavior layer)
   Additive only. Everything is defensive: if the launcher's
   structure changes, each feature quietly does nothing.
   - Smart dim: unfocused windows recede (Hyprland dim plugin)
   - Widgets panel: calendar, uptime, open windows, minimal toggle
   - Minimal mode: Alt+C hides the big clock and compacts the bar
   ============================================================ */
(function () {
  "use strict";

  var bootTime = Date.now();

  /* ---------- Smart dim + focus glow ---------- */

  function focusedWindow() {
    var els = document.querySelectorAll(".win");
    var active = document.activeElement;
    for (var i = 0; i < els.length; i++) {
      if (els[i].contains(active)) return els[i];
    }
    return null;
  }

  function applyDim() {
    var focused = focusedWindow();
    var els = document.querySelectorAll(".win");
    for (var i = 0; i < els.length; i++) {
      var w = els[i];
      if (w === focused) {
        w.classList.remove("hypr-dim");
        w.classList.add("hypr-focus");
      } else {
        w.classList.add("hypr-dim");
        w.classList.remove("hypr-focus");
      }
    }
  }

  document.addEventListener("focusin", applyDim, true);
  document.addEventListener("mousedown", applyDim, true);
  try {
    var dimObserver = new MutationObserver(applyDim);
    dimObserver.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  applyDim();

  /* ---------- Minimal mode ---------- */

  function toggleMinimal() {
    var on = document.body.classList.toggle("hypr-minimal");
    try { localStorage.setItem("tuffs.v1.hyprMinimal", on ? "1" : "0"); } catch (e) {}
  }

  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      toggleMinimal();
    }
    if (e.key === "Escape") closeWidgets();
  });

  try {
    if (localStorage.getItem("tuffs.v1.hyprMinimal") === "1") {
      document.body.classList.add("hypr-minimal");
    }
  } catch (e) {}

  /* ---------- Widgets panel ---------- */

  var panel = null;

  function openWidgets() {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement("div");
    panel.className = "hypr-widgets";
    panel.innerHTML = buildPanelHtml();
    document.body.appendChild(panel);
  }

  function closeWidgets() {
    if (panel) { panel.remove(); panel = null; }
  }

  function buildPanelHtml() {
    var d = new Date();
    var winCount = document.querySelectorAll(".win").length;

    var year = d.getFullYear();
    var month = d.getMonth();
    var first = new Date(year, month, 1).getDay();
    var days = new Date(year, month + 1, 0).getDate();
    var today = d.getDate();

    var cal = ["<div class='cal'>"];
    var headers = ["S","M","T","W","T","F","S"];
    for (var h = 0; h < 7; h++) {
      cal.push("<span style='font-weight:600;opacity:.8'>" + headers[h] + "</span>");
    }
    for (var i = 0; i < first; i++) cal.push("<span></span>");
    for (var day = 1; day <= days; day++) {
      cal.push(day === today ? "<span class='today'>" + day + "</span>" : "<span>" + day + "</span>");
    }
    cal.push("</div>");
    var calHtml = cal.join("");

    var up = Math.floor((Date.now() - bootTime) / 1000);
    var upStr = up < 60 ? up + "s" :
      up < 3600 ? Math.floor(up / 60) + "m" :
      Math.floor(up / 3600) + "h " + Math.floor((up % 3600) / 60) + "m";

    return "" +
      "<h3>" + d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + "</h3>" +
      calHtml +
      "<div class='stat-row'><span>Open windows</span><b>" + winCount + "</b></div>" +
      "<div class='stat-row'><span>Session uptime</span><b>" + upStr + "</b></div>" +
      "<button class='mode-btn' type='button'>Toggle minimal mode (Alt+C)</button>";
  }

  /* ---------- Dock hook: add a widgets icon ---------- */

  var dock = document.getElementById("dock");
  if (dock) {
    var btn = document.createElement("button");
    btn.className = "ic";
    btn.type = "button";
    btn.title = "Widgets";
    btn.setAttribute("aria-label", "Widgets");
    btn.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='7' height='9' rx='2'/><rect x='14' y='3' width='7' height='5' rx='2'/><rect x='14' y='12' width='7' height='9' rx='2'/><rect x='3' y='16' width='7' height='5' rx='2'/></svg>";
    btn.addEventListener("click", openWidgets);
    dock.appendChild(btn);
  }

  // Re-add the dock icon if the launcher rebuilds the dock
  try {
    if (dock) {
      var dockObserver = new MutationObserver(function () {
        if (!dock.contains(btn)) {
          try { dock.appendChild(btn); } catch (e) {}
        }
      });
      dockObserver.observe(dock, { childList: true });
    }
  } catch (e) {}

  // Panel mode button wiring (delegated)
  document.addEventListener("click", function (e) {
    if (panel && e.target && e.target.classList && e.target.classList.contains("mode-btn")) {
      toggleMinimal();
    }
  }, true);

})();
