/* Lumio Chat (Discord-style) — shared data helpers for the /api/lc/* routes.
 * Everything lives in D1 next to the Lumio accounts (users/sessions/profiles).
 * Files starting with "_" are not routes. Permission rules here are the single
 * source of truth on the server: the app runs the same rules for its buttons,
 * but every change is re-checked here before it is written. */
import { json } from "../auth/_shared.js";

export const BOT = "~ai";            // Lumio AI's member key (can't be a real username: "~" isn't allowed)
export const LUMIO = "lumio";        // the default public community server
export const LUMIO_OWNER = "admin";  // King's admin account owns it
export const PERMS = ["ADMIN", "MANAGE_SERVER", "MANAGE_CHANNELS", "MANAGE_ROLES", "KICK", "BAN", "MANAGE_MESSAGES", "AUDIT", "SEND", "REACT", "MENTION_EVERYONE", "INVITE"];
export const EVERYONE_DEF = ["SEND", "REACT", "INVITE"];
export const PAL = ["#7c5cff", "#2fa557", "#e8368f", "#f0883e", "#3b8eea", "#14b8a6", "#e0b030", "#e5484d", "#8e5cf0", "#64748b", "#f2a54a"];
export const RCOL = ["", "#e5484d", "#f0883e", "#e0b030", "#2fa557", "#14b8a6", "#3b8eea", "#7c5cff", "#e8368f", "#9aa0aa"];
export const MAX_TEXT = 2000;
export const IMG_CAPS = { avatar: 1048576, banner: 2097152, icon: 1048576, attach: 2097152 };
const CHUNK = 450000; // bytes per D1 row (row limit is 2 MB; kept well under)

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS lc_servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, icon TEXT, descr TEXT, owner_key TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 0, pause INTEGER NOT NULL DEFAULT 0, welcome INTEGER NOT NULL DEFAULT 1, ai INTEGER NOT NULL DEFAULT 1, automod INTEGER NOT NULL DEFAULT 0, ver INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS lc_cats (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, pos INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_lc_cats_srv ON lc_cats(server_id)",
  "CREATE TABLE IF NOT EXISTS lc_chans (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, cat_id TEXT, name TEXT NOT NULL, topic TEXT, pos INTEGER NOT NULL DEFAULT 0, last_id INTEGER NOT NULL DEFAULT 0, last_a TEXT, all_id INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_chans_srv ON lc_chans(server_id)",
  "CREATE TABLE IF NOT EXISTS lc_roles (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, perms TEXT NOT NULL DEFAULT '', hoist INTEGER NOT NULL DEFAULT 0, pos INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_lc_roles_srv ON lc_roles(server_id)",
  "CREATE TABLE IF NOT EXISTS lc_members (server_id TEXT NOT NULL, user_key TEXT NOT NULL, nick TEXT, roles TEXT NOT NULL DEFAULT '', joined_at INTEGER NOT NULL, PRIMARY KEY (server_id, user_key))",
  "CREATE INDEX IF NOT EXISTS idx_lc_members_user ON lc_members(user_key)",
  "CREATE TABLE IF NOT EXISTS lc_bans (server_id TEXT NOT NULL, user_key TEXT NOT NULL, reason TEXT, by_key TEXT, ts INTEGER NOT NULL, PRIMARY KEY (server_id, user_key))",
  "CREATE TABLE IF NOT EXISTS lc_invites (code TEXT PRIMARY KEY, server_id TEXT NOT NULL, by_key TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_invites_srv ON lc_invites(server_id)",
  "CREATE TABLE IF NOT EXISTS lc_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, by_key TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_audit_srv ON lc_audit(server_id, id)",
  "CREATE TABLE IF NOT EXISTS lc_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, chan TEXT NOT NULL, server_id TEXT, author_key TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', reply_to INTEGER, att TEXT, sys INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, edited_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_msgs_chan ON lc_msgs(chan, id)",
  "CREATE INDEX IF NOT EXISTS idx_lc_msgs_upd ON lc_msgs(chan, updated_at)",
  "CREATE TABLE IF NOT EXISTS lc_reacts (msg_id INTEGER NOT NULL, user_key TEXT NOT NULL, emoji TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (msg_id, user_key, emoji))",
  "CREATE TABLE IF NOT EXISTS lc_reads (user_key TEXT NOT NULL, chan TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_key, chan))",
  "CREATE TABLE IF NOT EXISTS lc_mentions (user_key TEXT NOT NULL, msg_id INTEGER NOT NULL, chan TEXT NOT NULL, PRIMARY KEY (user_key, msg_id))",
  "CREATE TABLE IF NOT EXISTS lc_dms (chan TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, last_id INTEGER NOT NULL DEFAULT 0, last_a TEXT, last_ts INTEGER NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS idx_lc_dms_a ON lc_dms(a)",
  "CREATE INDEX IF NOT EXISTS idx_lc_dms_b ON lc_dms(b)",
  "CREATE TABLE IF NOT EXISTS lc_typing (chan TEXT NOT NULL, user_key TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (chan, user_key))",
  "CREATE TABLE IF NOT EXISTS lc_presence (user_key TEXT PRIMARY KEY, st TEXT, status TEXT, seen INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS lc_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT, msg_id INTEGER, chan TEXT, author_key TEXT, text TEXT, reporter_key TEXT, reason TEXT, ai INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', ts INTEGER NOT NULL, resolved_by TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_lc_reports_status ON lc_reports(status, id)",
  "CREATE INDEX IF NOT EXISTS idx_lc_reports_srv ON lc_reports(server_id, status)",
  "CREATE TABLE IF NOT EXISTS lc_images (id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, parts INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS lc_image_parts (image_id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (image_id, n))",
  "CREATE TABLE IF NOT EXISTS profiles (username_key TEXT PRIMARY KEY, display_name TEXT, avatar TEXT, bio TEXT, accent TEXT, updated_at INTEGER NOT NULL DEFAULT 0)",
];

let READY = false;
/* Additive schema only (CREATE ... IF NOT EXISTS, one ADD COLUMN). Runs once per isolate. */
export async function ensure(db) {
  if (READY) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  try { await db.prepare("ALTER TABLE profiles ADD COLUMN banner TEXT").run(); } catch { /* already there */ }
  await ensureLumio(db);
  READY = true;
}

/* The default public "Lumio" community, owned by the admin account. The first
 * time it is created, the old General/Games/Random chat is copied into it. */
async function ensureLumio(db) {
  const now = Date.now();
  const r = await db.prepare("INSERT OR IGNORE INTO lc_servers (id, name, color, descr, owner_key, public, welcome, ai, created_at) VALUES (?1, 'Lumio', '#f2a54a', 'The Lumio community. Say hi, find people to play with, and ask @Lumio AI anything.', ?2, 1, 1, 1, ?3)")
    .bind(LUMIO, LUMIO_OWNER, now).run();
  if (!r.meta || !r.meta.changes) return;
  const st = [
    db.prepare("INSERT OR IGNORE INTO lc_cats (id, server_id, name, pos) VALUES ('k_lumiotext', ?1, 'Text Channels', 0)").bind(LUMIO),
    db.prepare("INSERT OR IGNORE INTO lc_roles (id, server_id, name, perms, pos) VALUES (?1, ?2, '@everyone', ?3, 0)").bind("@" + LUMIO, LUMIO, EVERYONE_DEF.join(",")),
    db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(LUMIO, LUMIO_OWNER, now),
  ];
  [["c_lumiogeneral", "general", "Hang out and say hi", "General"], ["c_lumiogames", "games", "Talk about games and find people to play with", "Games"], ["c_lumiorandom", "random", "Anything else", "Random"]].forEach(([id, n, t], i) =>
    st.push(db.prepare("INSERT OR IGNORE INTO lc_chans (id, server_id, cat_id, name, topic, pos, created_at) VALUES (?1, ?2, 'k_lumiotext', ?3, ?4, ?5, ?6)").bind(id, LUMIO, n, t, i, now)));
  await db.batch(st);
  // Keep the old room chat: copy it (the old table is left untouched).
  try {
    await db.batch([
      db.prepare("INSERT INTO lc_msgs (chan, server_id, author_key, text, created_at, updated_at) SELECT CASE room WHEN 'Games' THEN 'c_lumiogames' WHEN 'Random' THEN 'c_lumiorandom' ELSE 'c_lumiogeneral' END, ?1, username_key, text, created_at, created_at FROM chat_messages ORDER BY id").bind(LUMIO),
      db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) SELECT ?1, username_key, '', MIN(created_at) FROM chat_messages WHERE username_key IN (SELECT username_key FROM users WHERE is_banned = 0) GROUP BY username_key").bind(LUMIO),
      db.prepare("UPDATE lc_chans SET last_id = COALESCE((SELECT MAX(id) FROM lc_msgs WHERE chan = lc_chans.id), 0), last_a = (SELECT author_key FROM lc_msgs WHERE chan = lc_chans.id ORDER BY id DESC LIMIT 1) WHERE server_id = ?1").bind(LUMIO),
    ]);
  } catch { /* no old chat table: nothing to copy */ }
}

export const err = (msg, status = 400, code) => json({ error: msg, ...(code ? { code } : {}) }, status);
export const ID_RE = /^[skcr]_[a-z0-9]{6,24}$/;
export const CODE_RE = /^[A-Za-z0-9]{6,16}$/;
export const cleanLine = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const cleanText = (v, max) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\n{4,}/g, "\n\n\n").replace(/\s+$/, "").slice(0, max);
export const slug = n => String(n || "").trim().toLowerCase().replace(/[^\p{L}\p{N}_']+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 32);
export const dmKey = (a, b) => "dm:" + [a, b].sort().join("|");
export const inList = n => Array.from({ length: n }, (_, i) => "?" + (i + 1)).join(",");

/* ---------- permission model (mirrors the app) ---------- */
/* ctx = { srv, roles: [everyone, ...by position], members: { key: {roles:[], nick, joined} } } */
export async function loadCtx(db, sid, keys) {
  const srv = await db.prepare("SELECT * FROM lc_servers WHERE id = ?1").bind(sid).first();
  if (!srv) return null;
  const ks = [...new Set(keys.filter(Boolean))];
  const [roles, mem] = await db.batch([
    db.prepare("SELECT * FROM lc_roles WHERE server_id = ?1 ORDER BY pos, id").bind(sid),
    db.prepare(`SELECT * FROM lc_members WHERE server_id = ?1 AND user_key IN (${ks.map((_, i) => "?" + (i + 2)).join(",") || "''"})`).bind(sid, ...ks),
  ]);
  const rl = (roles.results || []).map(r => ({ id: r.id, n: r.name, color: r.color || "", perms: (r.perms || "").split(",").filter(Boolean), hoist: !!r.hoist, pos: r.pos }));
  let ev = rl.findIndex(r => r.id === "@" + sid);
  if (ev < 0) { rl.unshift({ id: "@" + sid, n: "@everyone", color: "", perms: [...EVERYONE_DEF], hoist: false, pos: 0 }); ev = 0; }
  if (ev > 0) rl.unshift(rl.splice(ev, 1)[0]);
  const members = {};
  for (const m of mem.results || []) members[m.user_key] = { roles: (m.roles || "").split(",").filter(Boolean), nick: m.nick || "", joined: m.joined_at };
  return { srv, roles: rl, members };
}
export function permsOf(ctx, u) {
  if (!ctx) return new Set();
  if (u === ctx.srv.owner_key) return new Set(PERMS);
  const m = ctx.members[u];
  if (!m) return new Set();
  const set = new Set(ctx.roles[0].perms);
  for (const r of ctx.roles) if (m.roles.includes(r.id)) r.perms.forEach(p => set.add(p));
  return set.has("ADMIN") ? new Set(PERMS) : set;
}
export const can = (ctx, p, u) => permsOf(ctx, u).has(p);
export const isOwner = (ctx, u) => !!ctx && ctx.srv.owner_key === u;
export function rank(ctx, u) {
  if (u === ctx.srv.owner_key) return 1e9;
  const m = ctx.members[u];
  if (!m) return -1;
  let r = 0;
  ctx.roles.forEach((x, i) => { if (m.roles.includes(x.id)) r = Math.max(r, i); });
  return r;
}
/* Can actor `a` act on member `t`? Nobody touches the owner; you must be strictly above them. */
export const above = (ctx, t, a) => t !== ctx.srv.owner_key && t !== a && !!ctx.members[t] && (a === ctx.srv.owner_key || rank(ctx, a) > rank(ctx, t));
export const roleEditable = (ctx, r, u) => !!r && can(ctx, "MANAGE_ROLES", u) && (u === ctx.srv.owner_key || ctx.roles.indexOf(r) < rank(ctx, u));
export const roleAssignable = (ctx, r, t, u) => !!r && r.id !== "@" + ctx.srv.id && roleEditable(ctx, r, u) && (t === u || above(ctx, t, u));

export async function audit(db, sid, by, text) {
  await db.batch([
    db.prepare("INSERT INTO lc_audit (server_id, by_key, text, ts) VALUES (?1, ?2, ?3, ?4)").bind(sid, by, String(text).slice(0, 300), Date.now()),
    db.prepare("UPDATE lc_servers SET ver = ver + 1 WHERE id = ?1").bind(sid),
  ]);
}
export const bump = (db, sid) => db.prepare("UPDATE lc_servers SET ver = ver + 1 WHERE id = ?1").bind(sid).run();

/* A system line in the server's first channel (only when welcome messages are on). */
export async function sysMsg(db, sid, text) {
  const ch = await db.prepare("SELECT id FROM lc_chans WHERE server_id = ?1 ORDER BY (cat_id IS NOT NULL), pos, id LIMIT 1").bind(sid).first();
  if (!ch) return;
  const now = Date.now();
  const r = await db.prepare("INSERT INTO lc_msgs (chan, server_id, author_key, text, sys, created_at, updated_at) VALUES (?1, ?2, '', ?3, 1, ?4, ?4)").bind(ch.id, sid, text, now).run();
  await db.prepare("UPDATE lc_chans SET last_id = ?1, last_a = '' WHERE id = ?2").bind(r.meta.last_row_id, ch.id).run();
}

/* ---------- people ---------- */
const PROFILE_COLS = "u.username, u.username_key, u.created_at, u.is_admin, p.display_name, p.avatar, p.banner, p.bio, p.accent, p.updated_at, pr.st, pr.status, pr.seen";
const PROFILE_FROM = "FROM users u LEFT JOIN profiles p ON p.username_key = u.username_key LEFT JOIN lc_presence pr ON pr.user_key = u.username_key";
export function shapeUser(r, now = Date.now()) {
  const av = r.avatar || "";
  const online = r.seen && now - r.seen < 150000;
  return {
    id: r.username_key, name: r.display_name || r.username, user: r.username, c: r.accent || "",
    av: av ? (av.startsWith("data:") || av.startsWith("img:") ? "img" : av) : "", avv: r.updated_at || 0,
    bn: r.banner ? String(r.banner) : "", bio: r.bio || "", listen: r.status || "",
    st: online ? (r.st && r.st !== "off" ? r.st : "off") : "off", since: r.created_at || 0, admin: !!r.is_admin,
  };
}
export const BOT_USER = { id: BOT, name: "Lumio AI", user: "lumio-ai", c: "#f2a54a", av: "", avv: 0, bn: "", bio: "Mention @lumio-ai in a channel and I'll answer. I can't see anything outside this chat.", listen: "Ask me anything", st: "online", since: 0, bot: true };
export async function usersByKeys(db, keys) {
  const ks = [...new Set(keys.filter(k => k && k !== BOT))].slice(0, 300);
  const out = {};
  if (keys.includes(BOT)) out[BOT] = BOT_USER;
  const now = Date.now();
  for (let i = 0; i < ks.length; i += 90) {
    const part = ks.slice(i, i + 90);
    const res = await db.prepare(`SELECT ${PROFILE_COLS} ${PROFILE_FROM} WHERE u.username_key IN (${inList(part.length)}) AND u.is_banned = 0`).bind(...part).all();
    for (const r of res.results || []) out[r.username_key] = shapeUser(r, now);
  }
  return out;
}
export async function userByName(db, name) {
  const r = await db.prepare(`SELECT ${PROFILE_COLS} ${PROFILE_FROM} WHERE u.username_key = ?1 AND u.is_banned = 0`).bind(String(name || "").trim().toLowerCase().replace(/^@/, "")).first();
  return r ? shapeUser(r) : null;
}

/* ---------- images (chunked in D1: R2 isn't enabled on this account) ---------- */
export function sniff(b) {
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}
export async function storeImage(db, owner, kind, bytes, mime) {
  const id = "i" + [...crypto.getRandomValues(new Uint8Array(10))].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 18);
  const parts = Math.ceil(bytes.length / CHUNK);
  const st = [db.prepare("INSERT INTO lc_images (id, owner_key, kind, mime, size, parts, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(id, owner, kind, mime, bytes.length, parts, Date.now())];
  for (let n = 0; n < parts; n++) st.push(db.prepare("INSERT INTO lc_image_parts (image_id, n, data) VALUES (?1, ?2, ?3)").bind(id, n, bytes.slice(n * CHUNK, (n + 1) * CHUNK)));
  await db.batch(st);
  return id;
}
export async function dropImage(db, id) {
  if (!id || !/^i[a-z0-9]{6,24}$/.test(id)) return;
  await db.batch([db.prepare("DELETE FROM lc_image_parts WHERE image_id = ?1").bind(id), db.prepare("DELETE FROM lc_images WHERE id = ?1").bind(id)]);
}
/* The image as a Response (immutable: an id never changes content). Edge-cached so repeat views skip D1. */
export async function serveImage(context, id) {
  const { request, env } = context;
  const headers = { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "content-disposition": "inline" };
  if (!/^i[a-z0-9]{6,24}$/.test(id || "")) return new Response("Not found", { status: 404, headers });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const ckey = new Request(new URL("/api/lc/img/" + id, request.url).toString());
  if (cache) { const hit = await cache.match(ckey); if (hit) return hit; }
  const img = await env.DB.prepare("SELECT mime, parts, size FROM lc_images WHERE id = ?1").bind(id).first();
  if (!img) return new Response("Not found", { status: 404, headers: { ...headers, "cache-control": "no-store" } });
  const res = await env.DB.prepare("SELECT data FROM lc_image_parts WHERE image_id = ?1 ORDER BY n").bind(id).all();
  const out = new Uint8Array(img.size);
  let at = 0;
  for (const r of res.results || []) { const d = new Uint8Array(r.data); out.set(d.subarray(0, Math.min(d.length, out.length - at)), at); at += d.length; }
  const resp = new Response(out, { headers: { ...headers, "content-type": img.mime, "cache-control": "public, max-age=31536000, immutable" } });
  if (cache && context.waitUntil) context.waitUntil(cache.put(ckey, resp.clone()).catch(() => {}));
  return resp;
}
