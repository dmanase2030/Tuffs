/**
 * Tuffs backend server.
 *
 * Serves:
 *  - the portal (public/) as static files
 *  - the Scramjet client from the @mercuryworkshop/scramjet npm package at /scram/
 *  - the libcurl transport at /libcurl/ and bare-mux at /baremux/
 *  - a Wisp backend (websocket upgrade at /wisp/) for the proxy transport
 *  - /api/status (backend health + configuration flags)
 *
 * Optional hardening (all via environment variables, see .env.example):
 *  - TUFFS_ACCESS_TOKEN + TUFFS_SESSION_SECRET -> password-gates the whole portal
 *  - TUFFS_PROXY_ALLOWLIST / TUFFS_PROXY_BLOCKLIST -> destination restrictions enforced
 *    by the wisp backend (regex on hostnames)
 *  - TUFFS_STRICT_LICENSE_MODE -> hides games with unresolved licenses from the catalog
 *  - @fastify/rate-limit on HTTP routes (note: websocket upgrades are not covered by it)
 *
 * Honest limitations (documented in README):
 *  - wisp-js 0.4.1 enforces hostname allow/block lists, port lists, private/loopback
 *    IP blocking and per-connection stream limits. Redirect-level policy (e.g. allowing
 *    a redirect only to allowlisted hosts) is enforced per-connection by wisp, and
 *    DNS rebinding is mitigated by resolving and re-checking the destination IP —
 *    but IPv6-mapped-IPv4 edge cases depend on ipaddr.js parsing.
 *  - Rate limiting does not cover the /wisp/ websocket upgrade path; use a reverse
 *    proxy for connection-level throttling in production.
 */
import { createServer } from "node:http";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.resolve(__dirname, "../public");
const catalogPath = path.join(publicPath, "data/games.json");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const env = process.env;
const CONFIG = {
  port: parseInt(env.PORT || "", 10) || 8080,
  accessToken: env.TUFFS_ACCESS_TOKEN || "",
  sessionSecret: env.TUFFS_SESSION_SECRET || "",
  strictLicenseMode: env.TUFFS_STRICT_LICENSE_MODE === "true",
  allowlist: env.TUFFS_PROXY_ALLOWLIST || "",      // comma-separated hostname regex sources
  blocklist: env.TUFFS_PROXY_BLOCKLIST || "",
  dnsServers: env.TUFFS_DNS_SERVERS || "1.1.1.3,1.0.0.3",
  streamLimitTotal: parseInt(env.TUFFS_STREAM_LIMIT_TOTAL || "", 10) || -1,
  streamLimitPerHost: parseInt(env.TUFFS_STREAM_LIMIT_PER_HOST || "", 10) || -1,
  allowUdp: env.TUFFS_ALLOW_UDP === "true"
};

// ---------------------------------------------------------------------------
// Auth helpers (only active when TUFFS_ACCESS_TOKEN is set)
// ---------------------------------------------------------------------------

function signSession(secret, expiresAt) {
  return createHmac("sha256", secret).update("tuffs-session:" + expiresAt).digest("hex");
}

function makeSessionCookie() {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000; // 12h
  const mac = signSession(CONFIG.sessionSecret, expiresAt);
  return `tuffs_session=${expiresAt}.${mac}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200` +
    (env.NODE_ENV === "production" ? "; Secure" : "");
}

function cookieValid(cookieHeader) {
  if (!CONFIG.accessToken) return true; // auth disabled
  if (!cookieHeader) return false;
  const m = /tuffs_session=(\d+)\.([a-f0-9]{64})/.exec(cookieHeader);
  if (!m) return false;
  const expiresAt = parseInt(m[1], 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signSession(CONFIG.sessionSecret, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tuffs — sign in</title><link rel="stylesheet" href="/css/portal.css"></head>
<body><div class="login-wrap"><form class="login-card" method="post" action="/api/login">
<h1>Tuffs</h1><p>This portal is private. Enter the access token to continue.</p>
<div class="login-error" id="err">${process.env.TUFFS_LOGIN_ERROR === "1" ? "Wrong token. Try again." : ""}</div>
<input type="password" name="token" placeholder="Access token" aria-label="Access token" autofocus required>
<button class="btn btn-primary" type="submit" style="width:100%">Sign in</button>
</form></div></body></html>`;

// ---------------------------------------------------------------------------
// Wisp backend configuration
// ---------------------------------------------------------------------------

logging.set_level(logging.NONE); // do not log destinations (privacy)

const wispOptions = {
  allow_udp_streams: CONFIG.allowUdp,
  allow_tcp_streams: true,
  allow_private_ips: false,   // SSRF: block RFC1918/link-local/CGNAT/reserved by default
  allow_loopback_ips: false,  // SSRF: block 127.0.0.0/8 and ::1
  allow_direct_ip: true,      // connecting to public IPs by literal is allowed
  stream_limit_total: CONFIG.streamLimitTotal,
  stream_limit_per_host: CONFIG.streamLimitPerHost,
  dns_servers: CONFIG.dnsServers ? CONFIG.dnsServers.split(",").map((s) => s.trim()).filter(Boolean) : null,
  dns_result_order: "verbatim"
};

function compileHostPatterns(spec) {
  return spec.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // Treat an entry as a plain hostname unless it contains regex metacharacters.
      const isRegex = /[\\^$.*+?()[\]{}|]/.test(s.replace(/^\//, "").replace(/\/$/, ""));
      if (isRegex) return new RegExp(s);
      return new RegExp("^" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
    });
}

if (CONFIG.allowlist) {
  wispOptions.hostname_whitelist = compileHostPatterns(CONFIG.allowlist);
  // When an allowlist is configured it fully replaces the blocklist.
} else {
  // Default blocklist: local names + cloud metadata endpoints, on top of the
  // built-in private/loopback IP blocking.
  const defaults = [
    "localhost",
    "*.localhost",
    "*.local",
    "*.internal",
    "*.home",
    "*.lan",
    "metadata.google.internal",
    "169.254.169.254"
  ];
  const extra = compileHostPatterns(CONFIG.blocklist);
  wispOptions.hostname_blacklist = defaults.map((d) => new RegExp(
    "^" + d.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]*") + "$"
  )).concat(extra);
}
Object.assign(wisp.options, wispOptions);

// ---------------------------------------------------------------------------
// Fastify app
// ---------------------------------------------------------------------------

const fastify = Fastify({
  requestTimeout: 30000,
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        // Scramjet's wasm transport needs cross-origin isolation only on the
        // browse page. Portal/game routes intentionally don't get these headers
        // so games with third-party scripts keep working.
        if (req.url === "/browse.html" || req.url.startsWith("/scram/") ||
            req.url.startsWith("/libcurl/") || req.url.startsWith("/baremux/")) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        // Security headers for portal routes (not applied to game files:
        // they are third-party code and run inside our own frame).
        if (!req.url.startsWith("/games/")) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Referrer-Policy", "no-referrer");
          res.setHeader("X-Frame-Options", "SAMEORIGIN");
          res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        } else {
          // Games may be framed by this portal only.
          res.setHeader("X-Frame-Options", "SAMEORIGIN");
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
        if (CONFIG.accessToken && !cookieValid(req.headers.cookie) &&
            !req.url.startsWith("/api/status") && req.url !== "/api/login" &&
            req.url !== "/css/portal.css") {
          res.statusCode = 401;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(LOGIN_PAGE);
          return;
        }
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        // Wisp endpoint, only for authenticated sessions when auth is enabled.
        if (req.url.endsWith("/wisp/") &&
            (!CONFIG.accessToken || cookieValid(req.headers.cookie))) {
          wisp.routeRequest(req, socket, head);
        } else {
          socket.end();
        }
      });
  }
});

// Rate limiting (HTTP only; see README limitation note for websockets).
await fastify.register(rateLimit, {
  global: true,
  max: 400,
  timeWindow: "1 minute"
});

// /api/status - used by the browse page to detect backend availability.
fastify.get("/api/status", async () => ({
  ok: true,
  authRequired: !!CONFIG.accessToken,
  strictLicenseMode: CONFIG.strictLicenseMode,
  proxyConfigured: true,
  name: "tuffs"
}));

// /api/login
fastify.post("/api/login", async (req, reply) => {
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const token = body.token || "";
  if (CONFIG.accessToken && token === CONFIG.accessToken) {
    reply.header("set-cookie", makeSessionCookie());
    return { ok: true };
  }
  return reply.code(401).send({ ok: false, error: "invalid token" });
});

// Catalog: served through an endpoint so strict-license mode can filter it.
fastify.get("/data/games.json", async (_req, reply) => {
  let raw;
  try {
    raw = await readFile(catalogPath, "utf8");
  } catch {
    return reply.code(500).send({ error: "catalog missing" });
  }
  if (!CONFIG.strictLicenseMode) {
    reply.type("application/json");
    return reply.send(raw);
  }
  const data = JSON.parse(raw);
  data.games = data.games.filter((g) => g.license && g.license.status !== "unresolved");
  reply.type("application/json");
  return reply.send(JSON.stringify(data));
});

// Static: portal
await fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true
});

// Static: scramjet client / transports (npm package assets)
await fastify.register(fastifyStatic, { root: scramjetPath, prefix: "/scram/", decorateReply: false });
await fastify.register(fastifyStatic, { root: libcurlPath, prefix: "/libcurl/", decorateReply: false });
await fastify.register(fastifyStatic, { root: baremuxPath, prefix: "/baremux/", decorateReply: false });

fastify.setNotFoundHandler((_req, reply) => {
  return reply.code(404).type("text/html").sendFile("index.html");
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

fastify.server.on("listening", () => {
  const address = fastify.server.address();
  console.log("Tuffs portal listening on:");
  console.log(`  http://localhost:${address.port}`);
  console.log(`  http://${hostname()}:${address.port}`);
  if (CONFIG.accessToken) console.log("  Auth: ENABLED (TUFFS_ACCESS_TOKEN set)");
  if (CONFIG.allowlist) console.log("  Proxy destination allowlist: ACTIVE");
  if (CONFIG.strictLicenseMode) console.log("  Strict license mode: ON (unresolved-license games hidden)");
  if (!CONFIG.sessionSecret && CONFIG.accessToken) {
    console.warn("  WARNING: TUFFS_SESSION_SECRET not set - using a random secret per process (sessions reset on restart).");
  }
});

function shutdown() {
  console.log("Shutting down…");
  fastify.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!CONFIG.sessionSecret && CONFIG.accessToken) {
  CONFIG.sessionSecret = randomBytes(32).toString("hex");
}

fastify.listen({ port: CONFIG.port, host: "0.0.0.0" });
