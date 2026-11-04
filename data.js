import { json, guard, readBody, sessionUser } from "./auth/_shared.js";

/* Per-account cloud save for the launcher's local data (files, notes,
 * settings, custom games, calendar events, code drafts...).
 * The table is created on first use so no dashboard migration is needed. */

const KEYS = ["S", "notes", "files", "ug", "events", "codeDraft", "rec", "cfg", "fmview", "fmorder", "fav", "recent", "wsm", "codeFiles"];
const MAXV = 900000; // chars per stored value

async function ensure(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS user_data (username_key TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (username_key, k))"
  ).run();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const g = guard(request, env);
  if (g) return g;
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Not signed in" }, 401);
  await ensure(env.DB);
  const res = await env.DB.prepare("SELECT k, v FROM user_data WHERE username_key = ?1")
    .bind(user.username_key)
    .all();
  const data = {};
  for (const row of res.results || []) {
    try { data[row.k] = JSON.parse(row.v); } catch { /* skip corrupt rows */ }
  }
  return json({ data });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const g = guard(request, env);
  if (g) return g;
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Not signed in" }, 401);
  const body = await readBody(request);
  const k = body && body.k;
  if (!KEYS.includes(k)) return json({ error: "Unknown key" }, 400);
  const v = JSON.stringify(body.v ?? null);
  if (v.length > MAXV) return json({ error: "That is too large to save to your account." }, 413);
  await ensure(env.DB);
  await env.DB.prepare(
    "INSERT INTO user_data (username_key, k, v, updated_at) VALUES (?1, ?2, ?3, ?4) " +
    "ON CONFLICT(username_key, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at"
  ).bind(user.username_key, k, v, Date.now()).run();
  return json({ ok: true });
}
