/* Shared helpers for Lumio accounts (Pages Functions + D1).
 * Passwords: PBKDF2-SHA256 (100k iterations — the Cloudflare Workers cap), per-user salt.
 * Sessions: random bearer tokens, stored only as SHA-256 hashes, 30-day expiry.
 */

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const enc = new TextEncoder();

function toB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 },
    key,
    256
  );
  return { salt: toB64(salt), hash: toB64(new Uint8Array(bits)) };
}

export async function verifyPassword(password, saltB64, expectedB64) {
  const { hash } = await hashPassword(password, saltB64);
  const a = fromB64(hash), b = fromB64(expectedB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256hex(str) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function createSession(db, usernameKey) {
  const token = newToken();
  const now = Date.now();
  await db.prepare("INSERT INTO sessions (token_hash, username_key, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256hex(token), usernameKey, now, now + 30 * 24 * 60 * 60 * 1000)
    .run();
  return token;
}

export function bearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function sessionUser(request, env) {
  const token = bearer(request);
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare(
    "SELECT u.username, u.username_key, u.is_admin, u.is_banned FROM sessions s JOIN users u ON u.username_key = s.username_key WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(await sha256hex(token), Date.now()).first();
  if (!row || row.is_banned) return null;
  return row;
}

/* Site-wide admin settings (site_settings key/value table). Reads tolerate a
 * missing table so the site keeps working with defaults before migration. */
export async function getSettings(db) {
  const d = { announcement: "", signupsOpen: true, chatEnabled: true, maintenance: false };
  if (!db) return d;
  try {
    const res = await db.prepare("SELECT key, value FROM site_settings").all();
    for (const row of res.results || []) {
      if (row.key === "announcement") d.announcement = row.value || "";
      else if (row.key === "signups_open") d.signupsOpen = row.value !== "0";
      else if (row.key === "chat_enabled") d.chatEnabled = row.value !== "0";
      else if (row.key === "maintenance") d.maintenance = row.value === "1";
    }
  } catch { /* table not created yet — defaults apply */ }
  return d;
}

export async function setSetting(db, key, value) {
  await db.prepare(
    "INSERT INTO site_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, String(value)).run();
}

/* The signed-in user, only if their account is flagged admin in the database. */
export async function requireAdmin(request, env) {
  const user = await sessionUser(request, env);
  if (!user || !user.is_admin) return null;
  return user;
}

/* Returns an error Response, or null when the request may proceed. */
export function guard(request, env) {
  if (!env.DB) return json({ error: "Accounts are not set up yet — try again in a minute." }, 503);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return json({ error: "Cross-origin request blocked." }, 403);
    } catch { return json({ error: "Bad origin." }, 403); }
  }
  return null;
}

export async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

export const USERNAME_RE = /^[\w.-]{3,20}$/;
