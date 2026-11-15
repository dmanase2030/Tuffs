/**
 * Lumio /service/ proxy — Cloudflare Pages Function.
 *
 * Pages load as  /service/<scheme>:/<host>/<path>  e.g. /service/https:/en.wikipedia.org/wiki/Cat
 * (one slash after the scheme: Cloudflare Pages does not route paths that
 * contain "//" to Functions).
 * Keeping the target's own path in ours means relative URLs (including ones
 * built by the page's JavaScript) resolve back inside the proxy.
 * The older form  /service/<encodeURIComponent(target URL)>  is still
 * accepted; page loads in that form are redirected to the path form.
 *
 * The function fetches the target server-side and returns it without the
 * headers that block framing (X-Frame-Options / CSP). HTML is rewritten with
 * HTMLRewriter (quoted and unquoted attributes, srcset, inline styles, meta
 * refresh), CSS url()/@import are rewritten, and Subresource Integrity /
 * meta CSP tags are dropped because rewritten files no longer match them.
 * Pages also get a small script that registers /service/__sw.js, a service
 * worker that routes anything the page's JavaScript requests (fetch, XHR,
 * dynamic <script>/<img>, root-relative paths) through the proxy too.
 *
 * Honest limits (same class as every basic web proxy): websockets, login
 * sessions (cookies are not carried) and sites that block Cloudflare's
 * network (Google, Hacker News, DuckDuckGo show "sorry"/captcha pages) won't
 * work. Private/loopback destinations are blocked, mirroring the Tuffs
 * server's own policy.
 */

const P = "/service/";
const SW_PATH = P + "__sw.js";
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|metadata\.google\.internal)$/i;
const BLOCKED_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|\[::1\]$)/;

/* Absolute http(s) URL -> proxied path. */
function toP(href) {
  return P + String(href).replace(/^(https?):\/\//i, "$1:/");
}

function text(msg, status) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/* "/service/..." pathname + search -> target URL string, or null. */
function parseProxied(pathname, search) {
  const raw = pathname.slice(P.length);
  if (!raw) return null;
  let m = raw.match(/^(https?):\/+(.*)$/i); // path form (tolerates collapsed slashes)
  if (m) return m[1].toLowerCase() + "://" + m[2] + (search || "");
  if (/^https?%3A/i.test(raw)) { // legacy encoded form
    let t;
    try { t = decodeURIComponent(raw); } catch { return null; }
    if (search) t += (t.includes("?") ? "&" : "?") + search.slice(1);
    return t;
  }
  let d = raw;
  try { d = decodeURIComponent(raw); } catch { /* keep raw */ }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(d)) return "https://" + d + (search || "");
  return null;
}

/* Bing (the browser's search engine) wraps result links in /ck/a?u=a1<base64url>
 * and leaves that page with a script redirect the proxy can't catch, so the
 * result opened outside the proxy. Link straight to the real result instead. */
function unwrap(abs) {
  if (/(^|\.)bing\.com$/i.test(abs.hostname) && abs.pathname === "/ck/a") {
    const u = abs.searchParams.get("u") || "";
    if (u.startsWith("a1")) {
      try {
        let b = u.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        b += "=".repeat((4 - (b.length % 4)) % 4);
        const real = new URL(atob(b));
        if (real.protocol === "http:" || real.protocol === "https:") return real;
      } catch { /* not a wrapped link */ }
    }
  }
  return abs;
}

/* Rewrite one URL found in a page so it loads through the proxy. */
function px(rawValue, base) {
  const v = (rawValue || "").replace(/&amp;/g, "&").trim();
  if (!v || v.startsWith("#")) return null;
  if (/^(javascript|mailto|tel|sms|data|blob|about|chrome|view-source):/i.test(v)) return null;
  let abs;
  try { abs = new URL(v, base.href); } catch { return null; }
  if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
  abs = unwrap(abs);
  if (abs.host === base.selfHost) {
    if (abs.pathname.startsWith(P)) return abs.pathname + abs.search + abs.hash;
    return abs.href; // our own site, served directly
  }
  return toP(abs.href);
}

function rewriteCss(css, base) {
  css = css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, val) => {
    const r = px(val, base);
    return r === null ? m : "url(" + q + r + q + ")";
  });
  return css.replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, val) => {
    const r = px(val, base);
    return r === null ? m : "@import " + q + r + q;
  });
}

/* Runs first in every proxied page: service worker + navigation guard. */
function clientScript(base) {
  const T = JSON.stringify(base.origin);
  return "<script>(function(){var P='/service/',T=" + T + ";function tp(h){return P+h.replace(/^(https?):\\/\\//i,'$1:/')}"
    + "function fx(u){try{var x=new URL(u,location.href);if(x.protocol!=='http:'&&x.protocol!=='https:')return null;if(x.origin===location.origin){if(x.pathname.indexOf(P)===0)return null;return tp(T+x.pathname+x.search+x.hash)}return tp(x.href)}catch(e){return null}}"
    + "try{if(navigator.serviceWorker&&window.isSecureContext){navigator.serviceWorker.register(P+'__sw.js',{scope:P}).then(function(){if(!navigator.serviceWorker.controller){var k='lumio_sw_reload';if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,'1');navigator.serviceWorker.ready.then(function(){location.reload()})}}}).catch(function(){})}}catch(e){}"
    + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(!h||/^(#|javascript:|mailto:|tel:|sms:)/i.test(h))return;var r=fx(a.href);if(r){e.preventDefault();e.stopPropagation();location.href=r}},true);"
    + "document.addEventListener('submit',function(e){var f=e.target;if(f&&f.action){var r=fx(f.action);if(r)f.action=r}},true);"
    + "try{var H=History.prototype;['pushState','replaceState'].forEach(function(n){var o=H[n];H[n]=function(s,t,u){if(u!=null){var r=fx(String(u));if(r)u=r}return o.call(this,s,t,u)}})}catch(e){}"
    // Some sites (YouTube) change the address with a History method taken from a fresh iframe,
    // which skips the patch above; put the address back inside the proxy if it escapes.
    + "try{var rs0=History.prototype.replaceState;setInterval(function(){if(location.pathname.indexOf(P)!==0){var r=tp(T+location.pathname+location.search+location.hash);try{rs0.call(history,history.state,'',r)}catch(e){}}},250)}catch(e){}"
    + "try{var wo=window.open;window.open=function(u,n,f){if(u){var r=fx(String(u));if(r)u=r}return wo.call(window,u,n,f)}}catch(e){}"
    + "})();</script>";
}

const SW_SOURCE = `/* Lumio proxy service worker: keeps every request a proxied page makes inside /service/. */
const P = '/service/';
function targetOf(href) {
  try {
    const u = new URL(href);
    if (u.origin !== self.location.origin || u.pathname.indexOf(P) !== 0) return null;
    const raw = u.pathname.slice(P.length);
    const m = raw.match(/^(https?):\\/+(.*)$/i);
    if (m) return new URL(m[1] + '://' + m[2] + u.search);
    if (/^https?%3A/i.test(raw)) return new URL(decodeURIComponent(raw));
  } catch (e) {}
  return null;
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  let u;
  try { u = new URL(req.url); } catch (x) { return; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  if (u.origin === self.location.origin && u.pathname.indexOf(P) === 0) return; // already proxied
  e.respondWith((async () => {
    let abs = u.href;
    if (u.origin === self.location.origin) {
      // A root-relative URL the page built itself: it belongs to the page's site.
      let base = null;
      if (e.clientId) { const c = await self.clients.get(e.clientId); if (c) base = targetOf(c.url); }
      if (!base && req.referrer) base = targetOf(req.referrer);
      if (!base) return fetch(req);
      abs = base.origin + u.pathname + u.search;
    }
    const to = P + abs.replace(/^(https?):\\/\\//i, '$1:/');
    if (req.mode === 'navigate') return Response.redirect(to, 302);
    const init = { method: req.method, headers: req.headers, credentials: 'same-origin', redirect: 'follow' };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();
    return fetch(to, init);
  })());
});
`;

function rewriteHtml(resp, base, out) {
  let injected = false;
  const inject = { element(el) { if (!injected) { injected = true; el.prepend(clientScript(base), { html: true }); } } };
  const attr = name => ({
    element(el) {
      const v = el.getAttribute(name);
      if (v == null) return;
      const r = px(v, base);
      if (r !== null) el.setAttribute(name, r);
    },
  });
  let styleBuf = "";
  return new HTMLRewriter()
    .on("head", inject)
    .on("body", inject)
    .on("[href]", attr("href"))
    .on("[src]", attr("src"))
    .on("[data-src]", attr("data-src"))
    .on("[action]", attr("action"))
    .on("[formaction]", attr("formaction"))
    .on("[poster]", attr("poster"))
    .on("[srcset]", {
      element(el) {
        const out2 = (el.getAttribute("srcset") || "").split(",").map(part => {
          const bits = part.trim().split(/\s+/);
          if (!bits[0]) return part;
          const r = px(bits[0], base);
          if (r !== null) bits[0] = r;
          return bits.join(" ");
        }).join(", ");
        el.setAttribute("srcset", out2);
      },
    })
    .on("[style]", { element(el) { el.setAttribute("style", rewriteCss(el.getAttribute("style") || "", base)); } })
    .on("[integrity]", { element(el) { el.removeAttribute("integrity"); } })
    // Keep links inside the proxied frame: no new tabs, no breaking out of the launcher.
    .on("[target]", { element(el) { if (/^_(top|parent|blank)$/i.test(el.getAttribute("target") || "")) el.setAttribute("target", "_self"); } })
    .on("meta[http-equiv]", {
      element(el) {
        const h = (el.getAttribute("http-equiv") || "").toLowerCase();
        if (h === "content-security-policy" || h === "x-frame-options") { el.remove(); return; }
        if (h === "refresh") {
          const c = el.getAttribute("content") || "";
          const m = c.match(/^(\s*\d+\s*;\s*url\s*=\s*)(['"]?)([^'"]+)\2\s*$/i);
          if (m) { const r = px(m[3], base); if (r !== null) el.setAttribute("content", m[1] + r); }
        }
      },
    })
    .on("style", {
      text(t) {
        styleBuf += t.text;
        if (t.lastInTextNode) { t.replace(rewriteCss(styleBuf, base), { html: true }); styleBuf = ""; }
        else t.remove();
      },
    })
    .transform(new Response(resp.body, { status: resp.status, headers: out }));
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname === SW_PATH) {
    return new Response(SW_SOURCE, {
      headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": P },
    });
  }

  let targetStr = parseProxied(url.pathname, url.search);
  if (!targetStr) {
    // A relative URL that slipped past the rewriter: resolve it against the proxied page that asked.
    const refTarget = (() => {
      try {
        const r = new URL(request.headers.get("referer") || "");
        return r.host === url.host && r.pathname.startsWith(P) ? parseProxied(r.pathname, r.search) : null;
      } catch { return null; }
    })();
    if (!refTarget) return text("Usage: /service/https://example.com", 400);
    try { targetStr = new URL(url.pathname.slice(P.length) + url.search, refTarget).href; } catch { return text("Bad proxy target.", 400); }
    return Response.redirect(new URL(toP(targetStr), url).href, 302);
  }

  let target;
  try { target = new URL(targetStr); } catch { return text("Bad proxy target.", 400); }
  if (target.protocol !== "http:" && target.protocol !== "https:") return text("Only http(s) targets.", 400);
  if (BLOCKED_HOST.test(target.hostname) || BLOCKED_IP.test(target.hostname)) {
    return text("That destination is blocked.", 403);
  }
  if (target.host === url.host) return Response.redirect(target.href, 302);

  // Old encoded links: send page loads to the path form so relative URLs work.
  const legacy = /^https?%3A/i.test(url.pathname.slice(P.length));
  if (legacy && (request.method === "GET" || request.method === "HEAD")) {
    return Response.redirect(new URL(toP(target.href), url).href, 302);
  }

  const headers = new Headers();
  headers.set("user-agent", request.headers.get("user-agent") || "Mozilla/5.0");
  for (const h of ["accept", "accept-language", "range", "cache-control"]) {
    const v = request.headers.get(h); if (v) headers.set(h, v);
  }
  let referer = target.origin + "/";
  try {
    const r = new URL(request.headers.get("referer") || "");
    if (r.host === url.host && r.pathname.startsWith(P)) referer = parseProxied(r.pathname, r.search) || referer;
  } catch { /* keep default */ }
  headers.set("referer", referer);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    headers.set("origin", target.origin);
    init.body = await request.arrayBuffer();
  }

  let resp;
  try {
    resp = await fetch(target.href, init);
  } catch (e) {
    return text("Proxy could not reach that site: " + (e && e.message ? e.message : "fetch failed"), 502);
  }

  const out = new Headers();
  const keep = ["content-type", "cache-control", "expires", "last-modified", "etag", "content-language", "content-disposition", "content-range", "accept-ranges", "vary"];
  for (const h of keep) { const v = resp.headers.get(h); if (v) out.set(h, v); }

  // Redirect: keep the browser inside the proxy.
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (loc) {
      try {
        const abs = new URL(loc, target);
        out.set("location", abs.host === url.host ? abs.href : toP(abs.href));
      } catch { out.set("location", loc); }
    }
    return new Response(null, { status: resp.status, headers: out });
  }

  const base = { href: target.href, origin: target.origin, selfHost: url.host };
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return rewriteHtml(resp, base, out);
  if (ct.includes("text/css")) {
    const css = await resp.text();
    return new Response(rewriteCss(css, base), { status: resp.status, headers: out });
  }
  return new Response(resp.body, { status: resp.status, headers: out });
}
