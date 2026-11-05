/**
 * Lumio /service/ proxy — Cloudflare Pages Function.
 *
 * Lumio's browser loads pages as:  /service/<encodeURIComponent(target URL)>
 * This function fetches the target server-side and returns it without the
 * headers that block framing (X-Frame-Options / CSP), rewriting links,
 * images, stylesheets and form actions in HTML/CSS so navigation stays
 * inside the proxy.
 *
 * Honest limits (same class as every basic web proxy): JavaScript-heavy
 * apps that build their own URLs, websockets, and login sessions (cookies
 * are not carried) will partially or fully fail. Simple and medium pages
 * work. Private/loopback destinations are blocked, mirroring the Tuffs
 * server's own policy.
 */

const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|metadata\.google\.internal)$/i;
const BLOCKED_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|\[::1\]$)/;

function text(msg, status) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function resolveAndProxy(rawValue, base) {
  const v = (rawValue || "").replace(/&amp;/g, "&").replace(/&#0*38;/g, "&").replace(/&#x0*26;/gi, "&").trim();
  if (!v || v.startsWith("#")) return null;
  if (/^(javascript|mailto|tel|sms|data|blob|about|chrome|view-source):/i.test(v)) return null;
  if (v.startsWith("/service/")) return null; // already proxied
  let abs;
  try { abs = new URL(v, base); } catch { return null; }
  if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
  // Our own origin is served directly, never through the proxy (avoids loops).
  if (abs.host === base.__selfHost) return abs.href;
  return "/service/" + encodeURIComponent(abs.href);
}

function navGuard(base) {
  const t = JSON.stringify(base.origin);
  return "<script>(function(){var T=" + t + ";function fx(u){try{var x=new URL(u,location.href);if(x.origin===location.origin){if(x.pathname.indexOf('/service/')===0)return null;return '/service/'+encodeURIComponent(T+x.pathname+x.search)+(x.hash||'')}if(x.origin===T)return '/service/'+encodeURIComponent(x.href);return null}catch(e){return null}}"
    + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(!h||/^(#|javascript:|mailto:|tel:|sms:)/i.test(h))return;var r=fx(a.href);if(r){e.preventDefault();e.stopPropagation();location.href=r}},true);"
    + "document.addEventListener('submit',function(e){var f=e.target;if(f&&f.action){var r=fx(f.action);if(r)f.action=r}},true);"
    + "try{var ps=history.pushState,rs=history.replaceState;function w(fn){return function(s2,t2,u){if(u){var r=fx(new URL(u,location.href).href);if(r)u=r}return fn.call(this,s2,t2,u)}}history.pushState=w(ps);history.replaceState=w(rs)}catch(e){}})();<\/script>";
}

function rewriteHtml(html, base) {
  const px = (m, attr, q, val) => {
    const r = resolveAndProxy(val, base);
    return r === null ? m : attr + "=" + q + r + q;
  };
  // href / src / action / poster attributes (quoted)
  html = html.replace(/\b(href|src|action|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (m, attr, quoted, dq, sq) => px(m, attr, quoted.charAt(0), dq !== undefined ? dq : sq));
  // srcset
  html = html.replace(/\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, quoted, dq, sq) => {
    const val = dq !== undefined ? dq : sq;
    const out = val.split(",").map(part => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      const r = resolveAndProxy(bits[0], base);
      if (r === null) return part;
      bits[0] = r;
      return bits.join(" ");
    }).join(", ");
    return "srcset=" + quoted.charAt(0) + out + quoted.charAt(0);
  });
  // meta refresh
  html = html.replace(/(<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*?url=)([^"'>]+)/gi,
    (m, pre, val) => { const r = resolveAndProxy(val, base); return r === null ? m : pre + r; });
  // CSS url(...) inside <style> blocks and style attributes
  html = html.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, val) => {
    const r = resolveAndProxy(val, base);
    return r === null ? m : "url(" + q + r + q + ")";
  });
  const guard = navGuard(base);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + guard);
  else html = guard + html;
  return html;
}

function rewriteCss(css, base) {
  css = css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, val) => {
    const r = resolveAndProxy(val, base);
    return r === null ? m : "url(" + q + r + q + ")";
  });
  css = css.replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, val) => {
    const r = resolveAndProxy(val, base);
    return r === null ? m : "@import " + q + r + q;
  });
  return css;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  let raw = url.pathname.replace(/^\/service\/?/, "");
  if (!raw) return text("Usage: /service/<encoded URL>", 400);
  let targetStr;
  try { targetStr = decodeURIComponent(raw); } catch { targetStr = raw; }
  if (!/^https?:\/\//i.test(targetStr)) {
    if (/^[\w-]+(\.[\w-]+)+/.test(targetStr)) targetStr = "https://" + targetStr;
    else return text("Bad proxy target.", 400);
  }
  if (url.search) targetStr += (targetStr.includes("?") ? "&" : "?") + url.search.slice(1);

  let target;
  try { target = new URL(targetStr); } catch { return text("Bad proxy target.", 400); }
  if (target.protocol !== "http:" && target.protocol !== "https:") return text("Only http(s) targets.", 400);
  if (BLOCKED_HOST.test(target.hostname) || BLOCKED_IP.test(target.hostname)) {
    return text("That destination is blocked.", 403);
  }

  const headers = new Headers();
  headers.set("user-agent", request.headers.get("user-agent") || "Mozilla/5.0");
  const accept = request.headers.get("accept"); if (accept) headers.set("accept", accept);
  const lang = request.headers.get("accept-language"); if (lang) headers.set("accept-language", lang);
  headers.set("referer", target.origin + "/");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    init.body = await request.arrayBuffer();
  }

  let resp;
  try {
    resp = await fetch(target.href, init);
  } catch (e) {
    return text("Proxy could not reach that site: " + (e && e.message ? e.message : "fetch failed"), 502);
  }

  const out = new Headers();
  const keep = ["content-type", "cache-control", "expires", "last-modified", "etag", "content-language", "vary"];
  for (const h of keep) { const v = resp.headers.get(h); if (v) out.set(h, v); }

  // Redirect: keep the browser inside the proxy.
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (loc) {
      try {
        const abs = new URL(loc, target);
        out.set("location", abs.host === url.host ? abs.href : "/service/" + encodeURIComponent(abs.href));
      } catch { out.set("location", loc); }
    }
    return new Response(null, { status: resp.status, headers: out });
  }

  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  target.__selfHost = url.host;

  if (ct.includes("text/html")) {
    const html = await resp.text();
    return new Response(rewriteHtml(html, target), { status: resp.status, headers: out });
  }
  if (ct.includes("text/css")) {
    const css = await resp.text();
    return new Response(rewriteCss(css, target), { status: resp.status, headers: out });
  }
  return new Response(resp.body, { status: resp.status, headers: out });
}
