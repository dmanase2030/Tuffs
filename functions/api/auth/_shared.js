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
    "SELECT u.username, u.username_key FROM sessions s JOIN users u ON u.username_key = s.username_key WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(await sha256hex(token), Date.now()).first();
  return row || null;
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
