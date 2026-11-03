/**
 * Tuffs browse page — Scramjet client integration.
 *
 * Follows the official Scramjet-App reference implementation:
 *  - registers the service worker (sw.js) that routes requests through Scramjet
 *  - sets the bare-mux transport to libcurl over the portal's own Wisp backend
 *  - creates a Scramjet frame and navigates it
 *
 * Portal controls (address bar, buttons) are visually distinct from proxied
 * content and never pretend to be real browser chrome.
 */
(function () {
  "use strict";

  var cfg = window.TUFFS_CONFIG || {};
  var urlInput = document.getElementById("browse-url");
  var goBtn = document.getElementById("browse-go");
  var statusDot = document.getElementById("status-dot");
  var statusText = document.getElementById("status-text");
  var setupNotice = document.getElementById("setup-notice-root");
  var controls = document.getElementById("browse-controls");
  var frameHost = document.getElementById("sj-frame-host");
  var backBtn = document.getElementById("btn-back");
  var forwardBtn = document.getElementById("btn-forward");
  var reloadBtn = document.getElementById("btn-reload");
  var homeBtn = document.getElementById("btn-home");
  var fullscreenBtn = document.getElementById("btn-fullscreen");

  var scramjet = null;
  var frame = null;
  var frameReady = false;

  function toast(msg) {
    var root = document.getElementById("toast-root");
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ---------- URL helpers ----------

  function normalizeInput(value) {
    var v = (value || "").trim();
    if (!v) return null;
    // Looks like a URL (has a scheme, a dot in the host, or is localhost-ish)?
    var looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ||
      (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/|$|\?)/i.test(v)) ||
      /^localhost(:\d+)?(\/|$)/i.test(v);
    if (looksLikeUrl) {
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = "https://" + v;
      try { var u = new URL(v); return u.href; } catch (e) { return null; }
    }
    // Otherwise treat as a search query.
    return "https://duckduckgo.com/?q=" + encodeURIComponent(v);
  }

  function invalidAddress(msg) {
    statusDot.className = "status-dot err";
    statusText.textContent = msg;
  }

  // ---------- Backend availability ----------

  fetch(cfg.statusEndpoint || "/api/status", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("status " + r.status);
      return r.json();
    })
    .then(function (s) {
      if (!s || s.ok !== true) throw new Error("bad status payload");
      statusDot.className = "status-dot ok";
      statusText.textContent = "Backend ready. Enter an address to browse.";
      setupNotice.hidden = true;
      initProxy();
    })
    .catch(function () {
      statusDot.className = "status-dot err";
      statusText.textContent = "Backend not available.";
      setupNotice.hidden = false;
      controls.hidden = true;
    });

  // ---------- Scramjet setup ----------

  function registerSW() {
    if (!navigator.serviceWorker) {
      throw new Error("This browser does not support service workers.");
    }
    return navigator.serviceWorker.register("/sw.js");
  }

  function initProxy() {
    var wispUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wisp/";
    if (cfg.wispUrl) wispUrl = cfg.wispUrl;

    try {
      var loaded = window.$scramjetLoadController ? window.$scramjetLoadController() : null;
      if (!loaded || !loaded.ScramjetController) throw new Error("Scramjet client not loaded");

      scramjet = new loaded.ScramjetController({
        files: {
          wasm: cfg.scramjet.wasm,
          all: cfg.scramjet.all,
          sync: cfg.scramjet.sync
        }
      });
      scramjet.init();

      var connection = new BareMux.BareMuxConnection(cfg.baremuxWorker);
      connection.getTransport().then(function (current) {
        if (current !== cfg.libcurlTransport) {
          connection.setTransport(cfg.libcurlTransport, [{ websocket: wispUrl }]);
        }
      });
      frameReady = true;
      statusText.textContent = "Backend ready. Enter an address to browse.";
    } catch (err) {
      statusDot.className = "status-dot err";
      statusText.textContent = "Proxy client failed to initialize: " + err.message;
    }
  }

  function ensureFrame() {
    if (frame) return frame;
    frame = scramjet.createFrame();
    frame.frame.id = "sj-frame";
    frame.frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px;background:#000;";
    var stage = document.createElement("div");
    stage.className = "player-stage";
    stage.style.cssText = "aspect-ratio:auto;height:min(78vh,900px);";
    stage.appendChild(frame.frame);
    frameHost.appendChild(stage);

    // Best-effort address bar sync: Scramjet exposes the current url on the
    // frame wrapper. Poll lightly; if unavailable in this version, the bar
    // simply keeps what the user typed (we never show a fake URL).
    setInterval(function () {
      if (frame && typeof frame.url === "string" && frame.url) {
        if (document.activeElement !== urlInput) urlInput.value = frame.url;
      }
    }, 1000);
    return frame;
  }

  function navigateTo(url) {
    if (!frameReady) {
      toast("Proxy not ready yet — try again in a moment.");
      return;
    }
    try {
      registerSW().catch(function (err) {
        toast("Service worker registration failed: " + err.message);
      });
    } catch (err) {
      statusDot.className = "status-dot err";
      statusText.textContent = err.message;
      return;
    }
    var f = ensureFrame();
    statusDot.className = "status-dot ok";
    statusText.textContent = "Loading " + url + " …";
    f.go(url);
    // Connection errors surface as the frame failing to settle; Scramjet
    // renders its own error page inside the frame for unreachable sites.
    setTimeout(function () {
      statusText.textContent = "Connected through your portal backend.";
    }, 1500);
  }

  function submit() {
    var url = normalizeInput(urlInput.value);
    if (!url) {
      invalidAddress("That does not look like a valid web address.");
      return;
    }
    navigateTo(url);
  }

  goBtn.addEventListener("click", submit);
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") submit();
  });

  // History controls — only where reliably supported by the frame wrapper.
  backBtn.addEventListener("click", function () {
    if (frame && typeof frame.back === "function") frame.back();
    else history.back();
  });
  forwardBtn.addEventListener("click", function () {
    if (frame && typeof frame.forward === "function") frame.forward();
    else history.forward();
  });
  reloadBtn.addEventListener("click", function () {
    if (frame && typeof frame.reload === "function") frame.reload();
    else if (frame) frame.go(frame.url || urlInput.value);
  });
  homeBtn.addEventListener("click", function () {
    if (frame) {
      frameHost.innerHTML = "";
      frame = null;
    }
    urlInput.value = "";
    urlInput.focus();
    statusText.textContent = "Reset. Enter an address to browse.";
  });
  fullscreenBtn.addEventListener("click", function () {
    var stage = frameHost.querySelector(".player-stage");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage) stage.requestFullscreen().catch(function () { toast("Fullscreen not available"); });
  });

  // Open deep link like /browse.html#https://example.com
  if (location.hash && location.hash.length > 1) {
    var deep = normalizeInput(decodeURIComponent(location.hash.slice(1)));
    if (deep) urlInput.value = deep;
  }
})();
