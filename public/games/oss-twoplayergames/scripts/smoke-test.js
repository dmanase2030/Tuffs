#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const WebSocket = require("ws");

const ROOT = path.resolve(__dirname, "..");

function fromRoot(...parts) {
  return path.join(ROOT, ...parts);
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(fullPath);
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function runSyntaxChecks() {
  const files = [
    fromRoot("server.js"),
    ...listJsFiles(fromRoot("js")),
    ...listJsFiles(fromRoot("scripts")),
  ];

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const details = (result.stderr || result.stdout || "").trim();
      throw new Error(`Syntax check failed for ${rel(file)}\n${details}`);
    }
  }

  console.log(`ok syntax: ${files.length} JS files`);
}

function loadGamesFromIndex() {
  const html = fs.readFileSync(fromRoot("index.html"), "utf8");
  const scriptTags = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
  const gameScripts = scriptTags.filter((src) => src.startsWith("js/games/"));
  const gameFiles = fs.readdirSync(fromRoot("js", "games"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `js/games/${name}`)
    .sort();

  assert(sameSet([...gameScripts].sort(), gameFiles), [
    "index.html game scripts do not match js/games files",
    `missing scripts: ${gameFiles.filter((file) => !gameScripts.includes(file)).join(", ") || "none"}`,
    `missing files: ${gameScripts.filter((file) => !gameFiles.includes(file)).join(", ") || "none"}`,
  ].join("\n"));

  assert(scriptTags.indexOf("js/registry.js") !== -1, "index.html must load js/registry.js");
  assert(scriptTags.indexOf("js/main.js") !== -1, "index.html must load js/main.js");
  assert(scriptTags.indexOf("js/registry.js") < scriptTags.indexOf(gameScripts[0]), "registry must load before game files");
  assert(scriptTags.indexOf("js/main.js") > scriptTags.indexOf(gameScripts[gameScripts.length - 1]), "main.js must load after game files");

  global.window = {
    GameRegistry: {
      games: [],
      register(game) {
        this.games.push(game);
      },
    },
    makeRng(seed) {
      let a = seed >>> 0;
      return function rng() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  global.GameRegistry = global.window.GameRegistry;

  for (const src of gameScripts) {
    require(fromRoot(src));
  }

  const games = global.window.GameRegistry.games;
  assert(games.length === gameFiles.length, `expected ${gameFiles.length} registered games, got ${games.length}`);

  const ids = games.map((game) => game.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicateIds.length === 0, `duplicate game ids: ${[...new Set(duplicateIds)].join(", ")}`);

  for (const game of games) {
    assert(typeof game.id === "string" && game.id, "game is missing id");
    assert(typeof game.name === "string" && game.name, `${game.id} is missing name`);
    assert(typeof game.description === "string" && game.description, `${game.id} is missing description`);
    assert(typeof game.create === "function", `${game.id} is missing create(ctx)`);
    assert(Array.isArray(game.howTo) && game.howTo.length > 0, `${game.id} is missing howTo`);
  }

  const mainJs = fs.readFileSync(fromRoot("js", "main.js"), "utf8");
  const groupedIds = [...mainJs.matchAll(/games:\s*\[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((idMatch) => idMatch[1]));
  const ungrouped = ids.filter((id) => !groupedIds.includes(id));
  const unknownGrouped = groupedIds.filter((id) => !ids.includes(id));
  assert(ungrouped.length === 0, `registered games missing from GAME_GROUPS: ${ungrouped.join(", ")}`);
  assert(unknownGrouped.length === 0, `GAME_GROUPS references unknown games: ${unknownGrouped.join(", ")}`);

  console.log(`ok registry: ${games.length} games`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function httpGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: requestPath }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.once("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error(`HTTP timeout for ${requestPath}`)));
  });
}

async function waitForServer(port, child) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const res = await httpGet(port, "/");
      if (res.statusCode === 200) return;
    } catch {
      // Server is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not become ready in time");
}

function waitOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 3000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", reject);
  });
}

function waitForMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`WebSocket message timeout: ${type}`));
    }, 3000);

    function onMessage(raw) {
      const msg = JSON.parse(raw);
      if (msg.type !== type) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(msg);
    }

    ws.on("message", onMessage);
  });
}

async function runServerSmokeTest() {
  const port = await getFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpg-smoke-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));

  try {
    await waitForServer(port, child);

    const home = await httpGet(port, "/");
    assert(home.statusCode === 200, `GET / returned ${home.statusCode}`);
    assert(home.body.includes("js/main.js"), "GET / did not return index.html");

    const health = await httpGet(port, "/health");
    assert(health.statusCode === 200, `GET /health returned ${health.statusCode}`);
    assert(JSON.parse(health.body).ok === true, "GET /health did not report healthy storage");

    const traversal = await httpGet(port, "/..%2fpackage.json");
    assert(traversal.statusCode === 403, `path traversal probe returned ${traversal.statusCode}`);

    const a = new WebSocket(`ws://127.0.0.1:${port}`);
    const b = new WebSocket(`ws://127.0.0.1:${port}`);
    const c = new WebSocket(`ws://127.0.0.1:${port}`);
    await Promise.all([waitOpen(a), waitOpen(b), waitOpen(c)]);

    const invalidJoinP = waitForMessage(c, "error");
    c.send(JSON.stringify({ type: "join", code: "abcd" }));
    const invalidJoin = await invalidJoinP;
    assert(invalidJoin.message.includes("4 chữ số"), "invalid room code did not return validation error");

    const createdP = waitForMessage(a, "created");
    a.send(JSON.stringify({ type: "create", gameId: "tictactoe", options: {}, playerName: "Alice" }));
    const created = await createdP;
    assert(/^\d{4}$/.test(created.code), `invalid room code: ${created.code}`);
    assert(created.playerNames?.[0] === "Alice", "created message did not include host name");

    const startA = waitForMessage(a, "start");
    const startB = waitForMessage(b, "start");
    b.send(JSON.stringify({ type: "join", code: created.code, playerName: "Bob" }));
    const starts = await Promise.all([startA, startB]);
    assert(starts.every((msg) => msg.gameId === "tictactoe"), "start messages used wrong gameId");
    assert(starts.every((msg) => msg.playerNames?.[0] === "Alice" && msg.playerNames?.[1] === "Bob"), "start messages did not include both player names");

    const moveP = waitForMessage(b, "move");
    a.send(JSON.stringify({ type: "move", move: { cell: 0 } }));
    const move = await moveP;
    assert(move.move.cell === 0, "move relay payload mismatch");

    const chatP = waitForMessage(a, "chat");
    b.send(JSON.stringify({ type: "chat", text: "hello" }));
    const chat = await chatP;
    assert(chat.text === "hello", "chat relay payload mismatch");

    const restartA = waitForMessage(a, "restart_pending");
    const restartB = waitForMessage(b, "restart_pending");
    a.send(JSON.stringify({ type: "restart" }));
    const pending = await Promise.all([restartA, restartB]);
    assert(pending.every((msg) => msg.ready?.includes(0) && msg.requester === 0), "restart_pending payload mismatch");

    a.close();
    b.close();
    c.close();
  } catch (error) {
    error.message += `\nserver logs:\n${logs.join("").trim() || "(none)"}`;
    throw error;
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
  }

  console.log("ok server: HTTP + health + traversal guard + WebSocket relay");
}

async function main() {
  runSyntaxChecks();
  loadGamesFromIndex();
  await runServerSmokeTest();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
