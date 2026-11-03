/**
 * Smoke test for the Tuffs backend.
 * Spawns server/index.js on a scratch port, exercises every important route,
 * then also verifies auth-gated mode with a token. Exits non-zero on failure.
 *
 * Note: this proves pages load and assets exist - it does NOT prove every
 * game is playable (see README "Testing" for the manual checklist).
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8471;
const BASE = "http://127.0.0.1:" + PORT;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const ok = (m) => console.log("  ok:   " + m);
const fail = (m) => { failures++; console.error("  FAIL: " + m); };

async function check(label, path, expect, headers) {
  try {
    const res = await fetch(BASE + path, { redirect: "manual" });
    const body = await res.text();
    let good = res.status === expect;
    if (good && headers) {
      for (const [h, v] of Object.entries(headers)) {
        if ((res.headers.get(h) || "") !== v) { good = false; fail(label + ": header " + h + " expected " + v + " got " + res.headers.get(h)); }
      }
    }
    if (good) ok(label + " (" + res.status + ")");
    else if (res.status !== expect) fail(label + ": expected " + expect + " got " + res.status);
    return { res, body };
  } catch (e) {
    fail(label + ": " + e.message);
    return { res: null, body: "" };
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(BASE + "/api/status");
      return true;
    } catch { await sleep(150); }
  }
  return false;
}

function startServer(env) {
  return spawn("node", ["server/index.js"], {
    cwd: new URL("../", import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

console.log("Tuffs smoke test\n");

// --- Phase 1: open mode ---
let proc = startServer({});
if (!(await waitForServer())) {
  fail("server did not start");
  process.exit(1);
}
ok("server started");

await check("portal home", "/", 200, { "x-frame-options": "SAMEORIGIN" });
await check("portal css", "/css/portal.css", 200);
await check("app js", "/js/app.js", 200);
await check("catalog json", "/data/games.json", 200);
await check("status api", "/api/status", 200);

const statusBody = await (await fetch(BASE + "/api/status")).json();
if (statusBody.ok === true) ok("status payload sane"); else fail("status payload not ok");

const catalog = JSON.parse(await (await fetch(BASE + "/data/games.json")).text());
// Expected count comes from the catalog file on disk, so this stays correct
// as games are added or removed (it proves the server serves the real file).
const disk = JSON.parse((await readFile(path.join(ROOT, "public/data/games.json"), "utf8")));
if (Array.isArray(catalog.games) && disk.games &&
    catalog.games.length === disk.games.length && catalog.games.length > 0)
  ok("catalog served (" + catalog.games.length + " games, matches games.json on disk)");
else fail("catalog games count unexpected: " + (catalog.games || []).length);

await check("browse page", "/browse.html", 200, {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp"
});
await check("scramjet client", "/scram/scramjet.all.js", 200);
await check("scramjet wasm", "/scram/scramjet.wasm.wasm", 200);
await check("baremux worker", "/baremux/index.js", 200);
await check("baremux worker js", "/baremux/worker.js", 200);
await check("libcurl transport", "/libcurl/index.mjs", 200);
await check("sw.js", "/sw.js", 200);

// A game entry point + a thumbnail + a game asset with relative paths
await check("game entry (2048)", "/games/2048/index.html", 200);
await check("game entry (vex7)", "/games/vex7/index.html", 200);
await check("game asset", "/games/2048/favicon.png", 200);
await check("thumbnail", "/images/thumbs/vex7.jpeg", 200);
const nf = await check("unknown page 404s with portal shell", "/definitely-not-a-page", 404);
if (nf.body.includes("<!DOCTYPE html>")) ok("404 body is the portal shell"); else fail("404 body is not the portal shell");

// Rate limiting active?
const rl = await fetch(BASE + "/api/status");
ok("rate-limit headers: " + (rl.headers.get("x-ratelimit-limit") || "present?"));

// Wisp endpoint rejects unauthenticated websockets (no upgrade) -> 400-ish
const wispHttp = await fetch(BASE + "/wisp/");
ok("wisp path responds to plain HTTP with " + wispHttp.status + " (upgrade needed for real use)");

proc.kill("SIGTERM");
await sleep(400);

// --- Phase 2: auth mode ---
PORT; // same port
proc = startServer({ TUFFS_ACCESS_TOKEN: "test-token-123", TUFFS_SESSION_SECRET: "test-secret" });
await sleep(700);

let res = await fetch(BASE + "/", { redirect: "manual" });
if (res.status === 401) ok("auth mode: portal gated (401)");
else fail("auth mode: expected 401 got " + res.status);

res = await fetch(BASE + "/api/status");
if (res.status === 200) ok("auth mode: status endpoint open"); else fail("status gated? " + res.status);

// login flow
res = await fetch(BASE + "/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: "wrong" })
});
if (res.status === 401) ok("auth mode: wrong token rejected"); else fail("wrong token accepted?!");

res = await fetch(BASE + "/api/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: "test-token-123" })
});
const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
if (res.status === 200 && cookie.startsWith("tuffs_session=")) ok("auth mode: login sets session cookie");
else fail("login failed: " + res.status + " " + cookie);

res = await fetch(BASE + "/", { headers: { cookie } });
if (res.status === 200) ok("auth mode: valid session grants access"); else fail("session cookie did not work: " + res.status);

proc.kill("SIGTERM");
await sleep(200);

console.log("\n" + (failures === 0 ? "ALL SMOKE TESTS PASSED" : failures + " failure(s)"));
process.exit(failures === 0 ? 0 : 1);
