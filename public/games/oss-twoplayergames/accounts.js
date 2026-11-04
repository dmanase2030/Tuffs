/* ============================================================
   Accounts: lưu tài khoản + trạng thái người chơi (server-side).
   - SQLite transaction + WAL, tự migration từ data/accounts.json.
   - Mật khẩu băm bằng scrypt + salt ngẫu nhiên.
   - Token phiên sinh bằng crypto, lưu ở dạng băm (không lưu token thô).
   Dùng cho đồng bộ hồ sơ/thống kê giữa nhiều thiết bị và làm nền
   cho bảng xếp hạng / ELO online về sau.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "accounts.sqlite");
const LEGACY_FILE = path.join(DATA_DIR, "accounts.json");

// ---------- Giới hạn ----------
const MAX_STATE_BYTES = 512 * 1024; // trần kích thước blob trạng thái mỗi user (512KB)
const MAX_TOKENS_PER_USER = 5;      // số phiên đăng nhập đồng thời giữ lại
const SCRYPT_KEYLEN = 32;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const SESSION_TTL_DAYS = Math.max(1, Math.min(365, Number(process.env.SESSION_TTL_DAYS) || 30));
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
// Salt cố định chỉ dùng để cân bằng chi phí scrypt khi username không tồn tại.
const DUMMY_LOGIN_SALT = "2f0f85f95b680d1d834ca3c66b92f615";

// ---------- Nạp / lưu (SQLite transaction + hàng đợi mutation) ----------
let db = { users: {} };
let sqlite = null;
let loaded = false;
let mutationChain = Promise.resolve();

class StorageError extends Error {
  constructor(cause) {
    super("Account storage is unavailable", { cause });
    this.name = "StorageError";
    this.code = "storage_unavailable";
  }
}

function openDatabase() {
  if (sqlite) return sqlite;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    sqlite = new Database(DB_FILE);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("busy_timeout = 5000");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        username_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return sqlite;
  } catch (err) {
    console.error("[accounts] Failed to open SQLite database:", err.message);
    throw new StorageError(err);
  }
}

function migrateLegacy(database) {
  if (!fs.existsSync(LEGACY_FILE)) return;
  const count = database.prepare("SELECT COUNT(*) AS count FROM accounts").get().count;
  if (count > 0) return;

  const parsed = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.users || typeof parsed.users !== "object") {
    throw new Error("Invalid legacy accounts.json structure");
  }

  const insert = database.prepare(`
    INSERT INTO accounts (username_key, data, updated_at)
    VALUES (?, ?, ?)
  `);
  database.transaction((entries) => {
    for (const [key, user] of entries) insert.run(key, JSON.stringify(user), Date.now());
  })(Object.entries(parsed.users));

  const backup = LEGACY_FILE + ".migrated.bak";
  try {
    fs.renameSync(LEGACY_FILE, fs.existsSync(backup) ? backup + "." + Date.now() : backup);
    console.log(`[accounts] Migrated ${Object.keys(parsed.users).length} account(s) to SQLite.`);
  } catch (err) {
    console.warn("[accounts] SQLite migration succeeded but legacy backup rename failed:", err.message);
  }
}

function load() {
  if (loaded) return;
  try {
    const database = openDatabase();
    migrateLegacy(database);
    const users = {};
    for (const row of database.prepare("SELECT username_key, data FROM accounts").all()) {
      users[row.username_key] = JSON.parse(row.data);
    }
    db = { users };
    loaded = true;
  } catch (err) {
    console.error("[accounts] Failed to load account data:", err.message);
    throw err instanceof StorageError ? err : new StorageError(err);
  }
}

function cloneDb(source) {
  return JSON.parse(JSON.stringify(source));
}

async function writeSnapshot(nextDb) {
  try {
    const database = openDatabase();
    const upsert = database.prepare(`
      INSERT INTO accounts (username_key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    const remove = database.prepare("DELETE FROM accounts WHERE username_key = ?");
    const persist = database.transaction((users) => {
      const keys = new Set(Object.keys(users));
      for (const row of database.prepare("SELECT username_key FROM accounts").all()) {
        if (!keys.has(row.username_key)) remove.run(row.username_key);
      }
      const now = Date.now();
      for (const [key, user] of Object.entries(users)) upsert.run(key, JSON.stringify(user), now);
    });
    persist(nextDb.users);
  } catch (err) {
    console.error("[accounts] Failed to persist account data:", err.message);
    throw err instanceof StorageError ? err : new StorageError(err);
  }
}

// Tuần tự hóa toàn bộ mutation. Chỉ cập nhật bộ nhớ sau khi transaction đã commit.
function mutateAndPersist(mutator) {
  const operation = mutationChain.then(async () => {
    load();
    const draft = cloneDb(db);
    const result = mutator(draft);
    if (result && result.error) return result;
    await writeSnapshot(draft);
    db = draft;
    return result;
  });
  mutationChain = operation.then(() => undefined, () => undefined);
  return operation;
}

// ---------- Băm mật khẩu / token ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}
function makeToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ---------- Kiểm tra đầu vào ----------
function validUsername(u) { return typeof u === "string" && USERNAME_RE.test(u); }
function isValidGameId(v) { return typeof v === "string" && /^[a-z0-9_-]{1,40}$/i.test(v); }
function validPassword(p) {
  return typeof p === "string" && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;
}
function stateBytes(state) {
  try { return Buffer.byteLength(JSON.stringify(state), "utf8"); } catch { return Infinity; }
}
// Chỉ chấp nhận blob trạng thái dạng { "tpg_xxx": "chuỗi", ... }.
function cleanState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const out = {};
  for (const k of Object.keys(state)) {
    if (k.indexOf("tpg_") === 0 && typeof state[k] === "string") out[k] = state[k];
  }
  return out;
}

// ---------- API nghiệp vụ ----------
async function register(username, password) {
  if (!validUsername(username)) return { error: "invalid_username" };
  if (!validPassword(password)) return { error: "invalid_password" };
  return mutateAndPersist((draft) => {
    const key = username.toLowerCase();
    if (draft.users[key]) return { error: "username_taken" };
    const salt = crypto.randomBytes(16).toString("hex");
    const token = makeToken();
    draft.users[key] = {
      username,
      salt,
      hash: hashPassword(password, salt),
      createdAt: Date.now(),
      tokens: [{ h: hashToken(token), createdAt: Date.now() }],
      state: {},
      stateUpdatedAt: 0,
    };
    return { token, username };
  });
}

async function login(username, password) {
  if (!validUsername(username) || typeof password !== "string" || password.length > MAX_PASSWORD) {
    return { error: "invalid_credentials" };
  }
  return mutateAndPersist((draft) => {
    const user = draft.users[username.toLowerCase()];
    const candidate = hashPassword(password, user ? user.salt : DUMMY_LOGIN_SALT);
    if (!user || !timingEqual(candidate, user.hash)) return { error: "invalid_credentials" };
    const token = makeToken();
    const now = Date.now();
    user.tokens = (user.tokens || []).filter((entry) => (
      entry && typeof entry.createdAt === "number" && now - entry.createdAt <= SESSION_TTL_MS
    ));
    user.tokens.push({ h: hashToken(token), createdAt: now });
    if (user.tokens.length > MAX_TOKENS_PER_USER) user.tokens = user.tokens.slice(-MAX_TOKENS_PER_USER);
    return { token, username: user.username, state: user.state || {}, stateUpdatedAt: user.stateUpdatedAt || 0 };
  });
}

// Tìm user theo token phiên (so khớp băm và bỏ qua phiên đã hết hạn).
function findUserByToken(database, token) {
  if (!token || typeof token !== "string") return null;
  const h = hashToken(token);
  const now = Date.now();
  for (const key of Object.keys(database.users)) {
    const u = database.users[key];
    if (u.tokens && u.tokens.some((entry) => (
      entry && entry.h === h && typeof entry.createdAt === "number" && now - entry.createdAt <= SESSION_TTL_MS
    ))) return u;
  }
  return null;
}

function userByToken(token) {
  load();
  return findUserByToken(db, token);
}

async function logout(token) {
  return mutateAndPersist((draft) => {
    const u = findUserByToken(draft, token);
    if (!u) return { ok: true };
    const h = hashToken(token);
    u.tokens = (u.tokens || []).filter((t) => t.h !== h);
    return { ok: true };
  });
}

function getState(token) {
  const u = userByToken(token);
  if (!u) return { error: "unauthorized" };
  return { state: u.state || {}, stateUpdatedAt: u.stateUpdatedAt || 0, username: u.username };
}

async function putState(token, state) {
  const clean = cleanState(state);
  if (!clean) return { error: "invalid_state" };
  if (stateBytes(clean) > MAX_STATE_BYTES) return { error: "state_too_large" };
  return mutateAndPersist((draft) => {
    const u = findUserByToken(draft, token);
    if (!u) return { error: "unauthorized" };
    u.state = clean;
    u.stateUpdatedAt = Date.now();
    return { ok: true, stateUpdatedAt: u.stateUpdatedAt };
  });
}

// ---------- ELO / bảng xếp hạng ----------
const ELO_START = 1200;
const ELO_K = 32;
const ELO_MIN = 100;

// Kỳ vọng thắng của A trước B theo công thức ELO chuẩn.
function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}
// Rating mới sau một ván. score: 1 thắng, 0.5 hòa, 0 thua.
function newRating(cur, expected, score) {
  const next = Math.round(cur + ELO_K * (score - expected));
  return Math.max(ELO_MIN, next);
}

// Bảo đảm user có cấu trúc rating; trả về object rating của user.
function ensureRatings(u) {
  if (!u.rating) {
    u.rating = { overall: ELO_START, games: {}, wins: 0, losses: 0, draws: 0, played: 0 };
  }
  if (typeof u.rating.overall !== "number") u.rating.overall = ELO_START;
  if (!u.rating.games || typeof u.rating.games !== "object") u.rating.games = {};
  return u.rating;
}
function gameRating(r, gameId) {
  if (typeof r.games[gameId] !== "number") r.games[gameId] = ELO_START;
  return r.games[gameId];
}

// Ghi nhận kết quả một ván online giữa hai tài khoản đã đăng nhập.
// result: "a" (A thắng), "b" (B thắng), "draw".
// Trả về rating mới của từng bên (overall + theo game) để báo lại client.
async function recordMatch(gameId, userAName, userBName, result) {
  if (!isValidGameId(gameId)) return { error: "invalid_game" };
  if (result !== "a" && result !== "b" && result !== "draw") return { error: "invalid_result" };

  return mutateAndPersist((draft) => {
    const a = draft.users[String(userAName || "").toLowerCase()];
    const b = draft.users[String(userBName || "").toLowerCase()];
    if (!a || !b || a === b) return { error: "invalid_players" };

    const ra = ensureRatings(a);
    const rb = ensureRatings(b);
    const scoreA = result === "a" ? 1 : result === "draw" ? 0.5 : 0;
    const scoreB = 1 - scoreA;

    // Cập nhật overall.
    const ea = expectedScore(ra.overall, rb.overall);
    const eb = 1 - ea;
    ra.overall = newRating(ra.overall, ea, scoreA);
    rb.overall = newRating(rb.overall, eb, scoreB);

    // Cập nhật rating theo game (giữ lại giá trị cũ để tính delta).
    const ga = gameRating(ra, gameId);
    const gb = gameRating(rb, gameId);
    const ega = expectedScore(ga, gb);
    ra.games[gameId] = newRating(ga, ega, scoreA);
    rb.games[gameId] = newRating(gb, 1 - ega, scoreB);

    // Thống kê thắng/thua/hòa.
    ra.played++; rb.played++;
    if (result === "draw") { ra.draws++; rb.draws++; }
    else if (result === "a") { ra.wins++; rb.losses++; }
    else { ra.losses++; rb.wins++; }

    return {
      ok: true,
      a: { username: a.username, overall: ra.overall, game: ra.games[gameId], delta: ra.games[gameId] - ga },
      b: { username: b.username, overall: rb.overall, game: rb.games[gameId], delta: rb.games[gameId] - gb },
    };
  });
}

// Bảng xếp hạng: theo game cụ thể hoặc overall (gameId rỗng/"overall").
function leaderboard(gameId, limit) {
  load();
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  const perGame = gameId && gameId !== "overall" && isValidGameId(gameId);
  const rows = [];
  for (const key of Object.keys(db.users)) {
    const u = db.users[key];
    if (!u.rating || !u.rating.played) continue;
    const rating = perGame
      ? (typeof u.rating.games[gameId] === "number" ? u.rating.games[gameId] : null)
      : u.rating.overall;
    if (rating === null) continue;
    rows.push({
      username: u.username,
      rating,
      wins: u.rating.wins || 0,
      losses: u.rating.losses || 0,
      draws: u.rating.draws || 0,
      played: u.rating.played || 0,
    });
  }
  rows.sort((x, y) => (y.rating - x.rating) || (y.played - x.played));
  return { rows: rows.slice(0, n) };
}

// Lấy rating của một user theo token (cho trang hồ sơ).
function getRating(token) {
  const u = userByToken(token);
  if (!u) return { error: "unauthorized" };
  const r = ensureRatings(u);
  return { username: u.username, overall: r.overall, games: r.games, wins: r.wins, losses: r.losses, draws: r.draws, played: r.played };
}

// Kiểm tra storage cho health endpoint; không trả dữ liệu nhạy cảm.
function health() {
  openDatabase().prepare("SELECT 1 AS ok").get();
  return { ok: true };
}

// Cho test: đặt lại trạng thái trong bộ nhớ (không đụng file).
function _reset() { db = { users: {} }; loaded = true; }

module.exports = {
  register, login, logout, getState, putState, userByToken,
  validUsername, validPassword, recordMatch, leaderboard, getRating, health,
  MAX_STATE_BYTES, MIN_PASSWORD, ELO_START, SESSION_TTL_DAYS,
  _reset, _file: DB_FILE,
};
