/* ============================================================
   Server: phục vụ web tĩnh + WebSocket relay cho chơi online
   ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { WebSocketServer } = require("ws");
const accounts = require("./accounts");

const PORT = process.env.PORT || 8777;
const ROOT = path.resolve(__dirname);
const MAX_MESSAGE_BYTES = 12_000;
const MAX_OPTIONS_BYTES = 2_500;
const MAX_MOVE_BYTES = 4_000;

// ---------- Giới hạn chống lạm dụng / DoS ----------
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS) || 500;     // tổng kết nối đồng thời
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP) || 20; // mỗi IP
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 2000;               // tổng số phòng tồn tại

// Allowlist origin cho WebSocket (chống Cross-Site WebSocket Hijacking).
// Khai báo qua biến môi trường ALLOWED_ORIGINS="https://a.com,https://b.com".
// Mặc định luôn cho phép cùng host (origin trùng Host header) và localhost.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Đếm số kết nối đang mở theo IP để chặn một IP mở quá nhiều kết nối.
const ipConnections = new Map(); // ip -> count
let totalConnections = 0;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

// Kiểu nội dung text nên nén gzip (giảm mạnh CSS/JS lớn như styles.css, vi-dict.js).
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".svg"]);

// Cache-Control theo loại file:
// - HTML/JS/CSS (mã nguồn app): cache ngắn + revalidate, vì service worker đã lo cập nhật.
// - Ảnh/icon (tài nguyên tĩnh ít đổi): cache dài.
function cacheControlFor(ext) {
  if (ext === ".png" || ext === ".ico" || ext === ".svg") {
    return "public, max-age=86400"; // 1 ngày
  }
  if (ext === ".html" || ext === ".webmanifest") {
    return "no-cache"; // luôn revalidate trang/khung
  }
  return "public, max-age=3600, must-revalidate"; // js/css: 1 giờ + revalidate
}

function acceptsGzip(req) {
  return /\bgzip\b/.test(req.headers["accept-encoding"] || "");
}

// ---------- Content-Security-Policy cho static server ----------
// script-src 'self': không inline script (SW registration đã tách ra js/sw-register.js).
// style-src 'unsafe-inline': cần cho các thuộc tính style="..." sinh động trong game,
//   và fonts.googleapis.com cho stylesheet Google Fonts.
// font-src: fonts.gstatic.com (file font Google Fonts).
// connect-src 'self' ws: wss': cho WebSocket online (cùng host, ws/wss theo giao thức trang).
// worker-src 'self': service worker. frame-ancestors 'self': chống nhúng iframe (đồng bộ X-Frame-Options).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' ws: wss:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");

// ---------- HTTP API: tài khoản + đồng bộ hồ sơ ----------
const MAX_API_BODY = 600 * 1024; // trần body JSON cho /api (đủ cho blob trạng thái 512KB)
const API_JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

// Rate-limit đơn giản theo IP cho các endpoint nhạy cảm (đăng ký / đăng nhập).
const apiRate = new Map(); // ip -> { start, count }
function apiRateLimit(ip, limit, windowMs) {
  const now = Date.now();
  const cur = apiRate.get(ip);
  if (!cur || now - cur.start >= windowMs) {
    apiRate.set(ip, { start: now, count: 1 });
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, API_JSON_HEADERS);
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_API_BODY) { reject(new Error("body_too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("bad_json")); }
    });
    req.on("error", reject);
  });
}

function bearerToken(req) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

// Đọc query string đơn giản (?game=gomoku&limit=20).
function parseQuery(url) {
  const out = {};
  const qs = String(url || "").split("?")[1];
  if (!qs) return out;
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = v === undefined ? "" : decodeURIComponent(v);
  }
  return out;
}

// Trả về true nếu đã xử lý xong request API.
async function handleApi(req, res, urlPath) {
  const ip = (req.socket && req.socket.remoteAddress) || "unknown";
  const route = urlPath.replace(/\/+$/, "");

  // Chỉ chấp nhận POST/GET cho các endpoint dưới đây.
  try {
    if (route === "/api/register" && req.method === "POST") {
      if (!apiRateLimit("reg:" + ip, 10, 60_000)) return sendJson(res, 429, { error: "rate_limited" });
      const body = await readJsonBody(req);
      const r = await accounts.register(body.username, body.password);
      if (r.error) return sendJson(res, 400, r);
      return sendJson(res, 200, r);
    }
    if (route === "/api/login" && req.method === "POST") {
      if (!apiRateLimit("login:" + ip, 20, 60_000)) return sendJson(res, 429, { error: "rate_limited" });
      const body = await readJsonBody(req);
      const r = await accounts.login(body.username, body.password);
      if (r.error) return sendJson(res, 401, r);
      return sendJson(res, 200, r);
    }
    if (route === "/api/logout" && req.method === "POST") {
      await accounts.logout(bearerToken(req));
      return sendJson(res, 200, { ok: true });
    }
    if (route === "/api/state" && req.method === "GET") {
      const r = accounts.getState(bearerToken(req));
      if (r.error) return sendJson(res, 401, r);
      return sendJson(res, 200, r);
    }
    if (route === "/api/state" && req.method === "POST") {
      const body = await readJsonBody(req);
      const r = await accounts.putState(bearerToken(req), body.state);
      if (r.error) return sendJson(res, r.error === "unauthorized" ? 401 : 400, r);
      return sendJson(res, 200, r);
    }
    if (route === "/api/leaderboard" && req.method === "GET") {
      const q = parseQuery(req.url);
      const r = accounts.leaderboard(q.game || "overall", q.limit);
      return sendJson(res, 200, r);
    }
    if (route === "/api/rating" && req.method === "GET") {
      const r = accounts.getRating(bearerToken(req));
      if (r.error) return sendJson(res, 401, r);
      return sendJson(res, 200, r);
    }
    // Không khớp endpoint nào -> 404 JSON.
    sendJson(res, 404, { error: "not_found" });
  } catch (e) {
    const msg = e && e.message;
    if (msg === "body_too_large") return sendJson(res, 413, { error: "body_too_large" });
    if (e && e.code === "storage_unavailable") {
      console.error("[api] Account storage unavailable:", e.cause && e.cause.message || e.message);
      return sendJson(res, 503, { error: "storage_unavailable" });
    }
    return sendJson(res, 400, { error: "bad_request" });
  }
  return true;
}

// ---------- HTTP: phục vụ file tĩnh ----------
const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Bad Request");
  }

  // Health check bao gồm khả năng truy cập account storage.
  if (urlPath === "/health") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { error: "method_not_allowed" });
    }
    try {
      accounts.health();
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error("[health] Account storage unavailable:", err.message);
      return sendJson(res, 503, { ok: false, error: "storage_unavailable" });
    }
  }

  // Định tuyến API trước khi phục vụ file tĩnh.
  if (urlPath === "/api" || urlPath.startsWith("/api/")) {
    handleApi(req, res, urlPath);
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  // chặn path traversal
  const filePath = path.resolve(ROOT, "." + urlPath);
  const relPath = path.relative(ROOT, filePath);
  if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": CSP,
      "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
      "Cache-Control": cacheControlFor(ext),
      "Vary": "Accept-Encoding",
    };

    // Nén gzip cho file text khi trình duyệt hỗ trợ (giảm mạnh dung lượng CSS/JS lớn).
    if (COMPRESSIBLE.has(ext) && acceptsGzip(req) && data.length > 1024) {
      zlib.gzip(data, (gzErr, gzipped) => {
        if (gzErr) {
          res.writeHead(200, headers);
          return res.end(data);
        }
        headers["Content-Encoding"] = "gzip";
        res.writeHead(200, headers);
        res.end(gzipped);
      });
      return;
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

// ---------- WebSocket: phòng chơi online ----------
// Cho phép origin nếu: không có Origin (client không phải trình duyệt, ví dụ test),
// trùng host của request, localhost gọi localhost, hoặc nằm trong ALLOWED_ORIGINS.
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function isAllowedOrigin(origin, host) {
  if (!origin) return true; // ws client thuần (test, CLI) không gửi Origin
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const originHost = parsed.host;
  if (host && originHost === host) return true; // cùng host -> an toàn

  let requestHostname = "";
  try { requestHostname = new URL("http://" + host).hostname; } catch { /* host không hợp lệ */ }
  if (isLoopbackHostname(parsed.hostname) && isLoopbackHostname(requestHostname)) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_MESSAGE_BYTES, // chặn frame lớn ngay ở tầng ws, tránh buffer vào RAM
  verifyClient: ({ origin, req }) => isAllowedOrigin(origin, req.headers.host),
});

/** rooms: code -> { players: [ws, ws], names: [string, string], gameId, seed, firstSeat, restartVotes } */
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = (1000 + crypto.randomInt(9000)).toString(); // 4 chữ số, RNG bảo mật
  } while (rooms.has(code));
  return code;
}

function makeToken() {
  return crypto.randomBytes(24).toString("base64url"); // token reconnect khó đoán
}

const RECONNECT_GRACE_MS = 45_000;
const MAX_HISTORY = 4000;

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function cleanPlayerName(value, fallback) {
  const name = String(value || "")
    // eslint-disable-next-line no-control-regex -- cố ý loại bỏ ký tự điều khiển khỏi tên người chơi
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return name || fallback;
}

function isValidGameId(value) {
  return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value);
}

function cleanRoomCode(value) {
  const code = String(value || "").trim();
  return /^\d{4}$/.test(code) ? code : "";
}

// ---------- Mật khẩu phòng (phòng riêng tư) ----------
const MAX_PASSWORD_LEN = 32;
function cleanPassword(value) {
  return String(value || "")
    // eslint-disable-next-line no-control-regex -- loại ký tự điều khiển khỏi mật khẩu
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_PASSWORD_LEN);
}
function hashPassword(pw, salt) {
  return crypto.createHash("sha256").update(salt + ":" + pw).digest("hex");
}
// So khớp an toàn theo thời gian; phòng không đặt mật khẩu thì luôn cho qua.
function verifyRoomPassword(room, pw) {
  if (!room.passwordHash) return true;
  const candidate = hashPassword(String(pw || ""), room.passwordSalt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(room.passwordHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function payloadBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Infinity;
  }
}

function cleanOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (payloadBytes(value) > MAX_OPTIONS_BYTES) return null;
  return value;
}

function rateLimit(ws, key, limit, windowMs) {
  const now = Date.now();
  if (!ws.rateLimits) ws.rateLimits = new Map();
  const current = ws.rateLimits.get(key);
  if (!current || now - current.start >= windowMs) {
    ws.rateLimits.set(key, { start: now, count: 1 });
    return true;
  }
  current.count++;
  return current.count <= limit;
}

function roomFor(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || room.players[ws.seat] !== ws) return null;
  return room;
}

function otherPlayer(room, ws) {
  return room.players.find((p) => p && p !== ws) || null;
}

// ---------- Matchmaking "Tìm trận nhanh" ----------
// Hàng chờ theo gameId: mỗi phần tử là một ws đang chờ ghép trận.
// Khi có 2 người cùng game -> tạo phòng ranked và start cho cả hai.
const matchQueue = new Map(); // gameId -> [ws, ws, ...]

// Bỏ một ws khỏi mọi hàng chờ (khi rời, rớt mạng, hoặc bấm hủy).
function dequeue(ws) {
  const gid = ws.queueGame;
  if (!gid) return;
  const q = matchQueue.get(gid);
  if (q) {
    const idx = q.indexOf(ws);
    if (idx >= 0) q.splice(idx, 1);
    if (!q.length) matchQueue.delete(gid);
  }
  ws.queueGame = null;
}

// Ghép hai người trong cùng phòng ranked mới, phát start cho cả hai.
function pairMatch(gameId, wsA, wsB) {
  leaveRoom(wsA);
  leaveRoom(wsB);
  const code = makeCode();
  const seed = Math.floor(Math.random() * 1e9);
  const firstSeat = Math.random() < 0.5 ? 0 : 1;
  const token0 = makeToken();
  const token1 = makeToken();
  const acctA = wsA.queueAccount || null;
  const acctB = wsB.queueAccount || null;
  const nameA = wsA.queueName || "Người chơi 1";
  const nameB = wsB.queueName || "Người chơi 2";
  const ranked = !!(acctA && acctB && acctA !== acctB);
  rooms.set(code, {
    players: [wsA, wsB], names: [nameA, nameB], tokens: [token0, token1],
    accounts: [acctA, acctB], results: [null, null], history: [], dcTimers: [null, null],
    gameId, seed, firstSeat, round: 1, restartVotes: new Set(), options: {}, public: false, ranked,
  });
  wsA.roomCode = code; wsA.seat = 0;
  wsB.roomCode = code; wsB.seat = 1;
  const names = [nameA, nameB];
  send(wsA, "matched", { code, seat: 0, token: token0, gameId, seed, firstSeat, round: 1, options: {}, playerNames: names, ranked });
  send(wsB, "matched", { code, seat: 1, token: token1, gameId, seed, firstSeat, round: 1, options: {}, playerNames: names, ranked });
  send(wsA, "start", { code, seat: 0, gameId, seed, firstSeat, round: 1, options: {}, playerNames: names, ranked });
  send(wsB, "start", { code, seat: 1, gameId, seed, firstSeat, round: 1, options: {}, playerNames: names, ranked });
}

// Thêm ws vào hàng chờ; nếu có người khác chờ sẵn thì ghép ngay.
function enqueue(ws, gameId) {
  dequeue(ws);
  const q = matchQueue.get(gameId) || [];
  // Ghép với người đầu hàng còn mở kết nối và không phải chính mình.
  while (q.length) {
    const partner = q.shift();
    if (partner === ws) continue;
    if (partner.readyState !== partner.OPEN) { partner.queueGame = null; continue; }
    if (!q.length) matchQueue.delete(gameId); else matchQueue.set(gameId, q);
    partner.queueGame = null;
    pairMatch(gameId, partner, ws);
    return;
  }
  // Không có ai -> vào hàng chờ.
  q.push(ws);
  matchQueue.set(gameId, q);
  ws.queueGame = gameId;
  send(ws, "queued", { gameId });
}

function leaveRoom(ws) {
  dequeue(ws); // rời phòng cũng rời mọi hàng chờ ghép trận
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    const opp = otherPlayer(room, ws);
    send(opp, "opponent_left");
    if (room.dcTimers) { room.dcTimers.forEach((t) => t && clearTimeout(t)); }
    rooms.delete(code);
  }
  ws.roomCode = null;
  ws.seat = null;
}

// Rớt mạng giữa ván: giữ phòng một lúc để cho phép kết nối lại
function handleDisconnect(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) { ws.roomCode = null; ws.seat = null; return; }
  const seat = ws.seat;
  if (room.players[seat] !== ws) { ws.roomCode = null; ws.seat = null; return; }
  room.players[seat] = null;
  const opp = otherPlayer(room, ws);
  if (!opp) {
    // không còn ai -> xóa luôn
    if (room.dcTimers) room.dcTimers.forEach((t) => t && clearTimeout(t));
    rooms.delete(code);
    ws.roomCode = null; ws.seat = null;
    return;
  }
  send(opp, "opponent_disconnected", { seat });
  room.dcTimers = room.dcTimers || [null, null];
  if (room.dcTimers[seat]) clearTimeout(room.dcTimers[seat]);
  room.dcTimers[seat] = setTimeout(() => {
    const r = rooms.get(code);
    if (!r || r.players[seat]) return; // đã kết nối lại
    const o = r.players.find((p) => p);
    send(o, "opponent_left");
    if (r.dcTimers) r.dcTimers.forEach((t) => t && clearTimeout(t));
    rooms.delete(code);
  }, RECONNECT_GRACE_MS);
  ws.roomCode = null; ws.seat = null;
}

wss.on("connection", (ws, req) => {
  // Giới hạn tổng kết nối + theo IP để chống DoS / lách rate-limit bằng nhiều socket.
  const ip = (req.socket && req.socket.remoteAddress) || "unknown";
  if (totalConnections >= MAX_CONNECTIONS) {
    send(ws, "error", { message: "Máy chủ đang quá tải. Thử lại sau." });
    ws.close(1013, "server busy");
    return;
  }
  const ipCount = ipConnections.get(ip) || 0;
  if (ipCount >= MAX_CONNECTIONS_PER_IP) {
    send(ws, "error", { message: "Quá nhiều kết nối từ thiết bị của bạn." });
    ws.close(1008, "too many connections");
    return;
  }
  ipConnections.set(ip, ipCount + 1);
  totalConnections++;
  ws.ip = ip;

  ws.roomCode = null;
  ws.seat = null;
  ws.isAlive = true;
  ws.rateLimits = new Map();

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) {
      send(ws, "error", { message: "Tin nhắn quá lớn." });
      return;
    }

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "create": {
        if (!rateLimit(ws, "lobby", 18, 60_000)) return send(ws, "error", { message: "Bạn thao tác tạo/vào phòng quá nhanh. Hãy thử lại sau." });
        if (!isValidGameId(msg.gameId)) return send(ws, "error", { message: "Game không hợp lệ." });
        if (rooms.size >= MAX_ROOMS) return send(ws, "error", { message: "Máy chủ đã đạt giới hạn số phòng. Thử lại sau." });
        const options = cleanOptions(msg.options);
        if (options === null) return send(ws, "error", { message: "Tùy chỉnh ván quá lớn." });
        leaveRoom(ws);
        const code = makeCode();
        const seed = Math.floor(Math.random() * 1e9);
        const firstSeat = Math.random() < 0.5 ? 0 : 1;
        const playerName = cleanPlayerName(msg.playerName, "Người chơi 1");
        const password = cleanPassword(msg.password);
        const token0 = makeToken();
        const acct0 = accounts.userByToken(msg.auth);
        rooms.set(code, { players: [ws, null], names: [playerName, null], tokens: [token0, null], accounts: [acct0 ? acct0.username : null, null], results: [null, null], history: [], dcTimers: [null, null], gameId: msg.gameId, seed, firstSeat, round: 1, restartVotes: new Set(), options, public: !!msg.public });
        if (password) {
          const room = rooms.get(code);
          room.passwordSalt = crypto.randomBytes(8).toString("hex");
          room.passwordHash = hashPassword(password, room.passwordSalt);
        }
        ws.roomCode = code;
        ws.seat = 0;
        send(ws, "created", { code, seat: 0, token: token0, gameId: msg.gameId, seed, firstSeat, round: 1, options, playerNames: [playerName, null], hasPassword: !!password });
        break;
      }

      case "join": {
        if (!rateLimit(ws, "lobby", 18, 60_000)) return send(ws, "error", { message: "Bạn thao tác tạo/vào phòng quá nhanh. Hãy thử lại sau." });
        const code = cleanRoomCode(msg.code);
        if (!code) return send(ws, "error", { message: "Mã phòng phải gồm 4 chữ số." });
        leaveRoom(ws);
        const room = rooms.get(code);
        if (!room) return send(ws, "error", { message: "Mã phòng không tồn tại." });
        if (!verifyRoomPassword(room, msg.password)) return send(ws, "error", { message: "Sai mật khẩu phòng.", reason: "bad_password" });
        if (room.players[1]) return send(ws, "error", { message: "Phòng đã đủ người." });
        room.players[1] = ws;
        room.names[1] = cleanPlayerName(msg.playerName, "Người chơi 2");
        const token1 = makeToken();
        room.tokens = room.tokens || [null, null];
        room.tokens[1] = token1;
        const acct1 = accounts.userByToken(msg.auth);
        room.accounts = room.accounts || [null, null];
        room.accounts[1] = acct1 ? acct1.username : null;
        room.results = [null, null]; // reset báo cáo kết quả cho ván mới
        room.history = [];
        ws.roomCode = code;
        ws.seat = 1;
        const ranked = !!(room.accounts && room.accounts[0] && room.accounts[1] && room.accounts[0] !== room.accounts[1]);
        room.ranked = ranked;
        send(ws, "joined", { code, seat: 1, token: token1, gameId: room.gameId, seed: room.seed, firstSeat: room.firstSeat, round: room.round, options: room.options, playerNames: room.names, ranked });
        // báo cho cả hai bắt đầu (kèm options của chủ phòng)
        send(room.players[0], "start", { code, seat: 0, gameId: room.gameId, seed: room.seed, firstSeat: room.firstSeat, round: room.round, options: room.options, playerNames: room.names, ranked });
        send(room.players[1], "start", { code, seat: 1, gameId: room.gameId, seed: room.seed, firstSeat: room.firstSeat, round: room.round, options: room.options, playerNames: room.names, ranked });
        break;
      }

      case "queue": {
        if (!rateLimit(ws, "lobby", 18, 60_000)) return send(ws, "error", { message: "Bạn thao tác quá nhanh. Hãy thử lại sau." });
        if (!isValidGameId(msg.gameId)) return send(ws, "error", { message: "Game không hợp lệ." });
        if (rooms.size >= MAX_ROOMS) return send(ws, "error", { message: "Máy chủ đã đạt giới hạn số phòng. Thử lại sau." });
        const acct = accounts.userByToken(msg.auth);
        ws.queueAccount = acct ? acct.username : null;
        ws.queueName = cleanPlayerName(msg.playerName, "Người chơi");
        enqueue(ws, msg.gameId);
        break;
      }

      case "unqueue": {
        dequeue(ws);
        send(ws, "unqueued", {});
        break;
      }

      case "move": {
        if (!rateLimit(ws, "move", 100, 5_000)) return;
        if (payloadBytes(msg.move) > MAX_MOVE_BYTES) return send(ws, "error", { message: "Nước đi quá lớn." });
        const room = roomFor(ws);
        if (!room) return;
        if (room.history) { room.history.push(msg.move); if (room.history.length > MAX_HISTORY) room.history.shift(); }
        const opp = otherPlayer(room, ws);
        send(opp, "move", { move: msg.move });
        break;
      }

      case "restart": {
        if (!rateLimit(ws, "restart", 8, 30_000)) return send(ws, "error", { message: "Bạn bấm chơi lại quá nhanh. Hãy chờ một chút." });
        const room = roomFor(ws);
        if (!room) return;
        // Chơi lại online: đủ hai người đồng ý mới tạo seed mới, rồi đảo người đi trước.
        if (!room.restartVotes) room.restartVotes = new Set();
        room.restartVotes.add(ws.seat);
        const ready = Array.from(room.restartVotes);
        room.players.forEach((p) => send(p, "restart_pending", { code: ws.roomCode, ready, requester: ws.seat }));

        if (!room.players[0] || !room.players[1] || room.restartVotes.size < 2) return;

        const seed = Math.floor(Math.random() * 1e9);
        room.seed = seed;
        room.round = (room.round || 1) + 1;
        room.firstSeat = typeof room.firstSeat === "number" ? 1 - room.firstSeat : (Math.random() < 0.5 ? 0 : 1);
        room.restartVotes.clear();
        room.history = [];
        room.results = [null, null]; // ván mới -> chờ báo cáo kết quả mới
        room.players.forEach((p, i) => send(p, "restart", { code: ws.roomCode, gameId: room.gameId, seed, seat: i, firstSeat: room.firstSeat, round: room.round, options: room.options, playerNames: room.names, ranked: !!(room.accounts && room.accounts[0] && room.accounts[1]) }));
        break;
      }

      case "chat": {
        if (!rateLimit(ws, "chat", 8, 10_000)) return send(ws, "error", { message: "Bạn gửi chat quá nhanh. Hãy chờ một chút." });
        const room = roomFor(ws);
        if (!room) return;
        send(otherPlayer(room, ws), "chat", { text: String(msg.text || "").slice(0, 200) });
        break;
      }

      case "react": {
        if (!rateLimit(ws, "react", 12, 8_000)) return;
        const room = roomFor(ws);
        if (!room) return;
        const emoji = String(msg.emoji || "").slice(0, 8);
        if (!emoji) return;
        send(otherPlayer(room, ws), "react", { emoji });
        break;
      }

      case "reportResult": {
        if (!rateLimit(ws, "report", 10, 30_000)) return;
        const room = roomFor(ws);
        if (!room) return;
        if (!room.ranked || !room.accounts || !room.accounts[0] || !room.accounts[1]) return; // chỉ tính khi cả hai đăng nhập
        // Kết quả theo góc nhìn ghế của người báo: "win" | "lose" | "draw".
        const outcome = msg.outcome;
        if (outcome !== "win" && outcome !== "lose" && outcome !== "draw") return;
        const round = Number(msg.round) || room.round || 1;
        room.results = room.results || [null, null];
        // Gắn kèm round để tránh nhầm báo cáo của ván trước với ván sau.
        room.results[ws.seat] = { outcome, round };
        const r0 = room.results[0];
        const r1 = room.results[1];
        if (!r0 || !r1 || r0.round !== r1.round) return; // chờ đủ hai báo cáo cùng ván
        if (room.ratedRound === r0.round) return; // đã tính cho ván này rồi

        // Quy về kết quả theo ghế 0. Hai báo cáo phải NHẤT QUÁN mới tính.
        // seat0 thắng khi: seat0 báo "win" và seat1 báo "lose".
        let result = null;
        if (r0.outcome === "draw" && r1.outcome === "draw") result = "draw";
        else if (r0.outcome === "win" && r1.outcome === "lose") result = "a";
        else if (r0.outcome === "lose" && r1.outcome === "win") result = "b";
        if (!result) { room.results = [null, null]; return; } // báo cáo mâu thuẫn -> bỏ qua

        room.ratedRound = r0.round;
        accounts.recordMatch(room.gameId, room.accounts[0], room.accounts[1], result)
          .then((rec) => {
            if (!rec || !rec.ok) {
              if (room.ratedRound === r0.round) room.ratedRound = null;
              return;
            }
            send(room.players[0], "rated", { gameId: room.gameId, overall: rec.a.overall, game: rec.a.game, delta: rec.a.delta, result: result === "draw" ? "draw" : (result === "a" ? "win" : "lose") });
            send(room.players[1], "rated", { gameId: room.gameId, overall: rec.b.overall, game: rec.b.game, delta: rec.b.delta, result: result === "draw" ? "draw" : (result === "b" ? "win" : "lose") });
          })
          .catch((err) => {
            if (room.ratedRound === r0.round) room.ratedRound = null;
            console.error("[accounts] Failed to record ranked match:", err.message);
            room.players.forEach((player) => send(player, "error", { message: "Không thể lưu điểm xếp hạng. Vui lòng thử lại." }));
          });
        break;
      }

      case "leave": {
        leaveRoom(ws);
        ws.roomCode = null;
        ws.seat = null;
        break;
      }

      case "listRooms": {
        if (!rateLimit(ws, "list", 30, 60_000)) return;
        const list = [];
        for (const [code, room] of rooms) {
          if (room.public && room.players[0] && !room.players[1]) {
            list.push({ code, gameId: room.gameId, hostName: room.names[0] || "Người chơi 1", round: room.round || 1, locked: !!room.passwordHash });
          }
          if (list.length >= 40) break;
        }
        send(ws, "roomList", { rooms: list });
        break;
      }

      case "rejoin": {
        if (!rateLimit(ws, "lobby", 18, 60_000)) return send(ws, "error", { message: "Thao tác quá nhanh." });
        const code = cleanRoomCode(msg.code);
        const seat = msg.seat === 1 ? 1 : 0;
        const room = code && rooms.get(code);
        if (!room || !room.tokens || room.tokens[seat] !== msg.token) {
          return send(ws, "rejoin_failed", { message: "Phiên chơi đã hết hạn." });
        }
        if (room.players[seat]) {
          return send(ws, "rejoin_failed", { message: "Chỗ này đã có người." });
        }
        leaveRoom(ws);
        if (room.dcTimers && room.dcTimers[seat]) { clearTimeout(room.dcTimers[seat]); room.dcTimers[seat] = null; }
        room.players[seat] = ws;
        ws.roomCode = code;
        ws.seat = seat;
        send(ws, "rejoined", {
          code, seat, gameId: room.gameId, seed: room.seed, firstSeat: room.firstSeat,
          round: room.round, options: room.options, playerNames: room.names,
          history: room.history || [],
        });
        send(otherPlayer(room, ws), "opponent_reconnected", { seat });
        break;
      }
    }
  });

  ws.on("close", () => {
    dequeue(ws); // rời hàng chờ tìm trận nếu đang xếp
    handleDisconnect(ws);
    // Giải phóng bộ đếm kết nối theo IP + tổng.
    const n = (ipConnections.get(ws.ip) || 1) - 1;
    if (n <= 0) ipConnections.delete(ws.ip);
    else ipConnections.set(ws.ip, n);
    totalConnections = Math.max(0, totalConnections - 1);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch { ws.terminate(); }
  });
}, 15_000);

wss.on("close", () => clearInterval(heartbeatInterval));

server.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://localhost:${PORT}`);
  console.log(`   Mở trình duyệt và bắt đầu chơi. Ctrl+C để dừng.`);
});
