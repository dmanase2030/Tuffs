import { json, guard, readBody, sessionUser } from "./auth/_shared.js";
import { clientIp, throttleCheck, throttleFail } from "./auth/_throttle.js";
import { ensureProfiles, validateProfile, shapeProfile } from "./auth/_profile.js";
import { dropImage } from "./lc/_db.js";

/* GET  /api/profile            → your own profile
 * GET  /api/profile?u=<name>   → someone's public profile card
 * POST /api/profile            { displayName?, bio?, accent?, avatar? } → update yours
 * Signed-in accounts only. Suspended accounts don't have a public profile. */

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const me = await sessionUser(request, env);
  if (!me) return json({ error: "Sign in to see profiles." }, 401);
  await ensureProfiles(env.DB);
  const key = String(new URL(request.url).searchParams.get("u") || me.username_key).trim().toLowerCase().slice(0, 40);
  const u = await env.DB.prepare("SELECT username, username_key, created_at, is_admin, is_banned FROM users WHERE username_key = ?1").bind(key).first();
  if (!u || (u.is_banned && !me.is_admin)) return json({ error: "No such account." }, 404);
  const p = await env.DB.prepare("SELECT * FROM profiles WHERE username_key = ?1").bind(key).first();
  const out = shapeProfile(u, p);
  out.isMe = key === me.username_key;
  if (me.is_admin) out.isBanned = !!u.is_banned;
  return json({ profile: out });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const me = await sessionUser(request, env);
  if (!me) return json({ error: "Sign in to edit your profile." }, 401);
  const tkey = "profile|" + me.username_key, ikey = "profile-ip|" + clientIp(request);
  const wait = Math.max(await throttleCheck(env.DB, tkey), await throttleCheck(env.DB, ikey));
  if (wait > 0) return json({ error: "Too many profile changes. Try again in " + Math.ceil(wait / 60) + " min." }, 429);
  const body = await readBody(request);
  const v = validateProfile(body || {});
  if (v.error) return json({ error: v.error }, 400);
  await throttleFail(env.DB, tkey, 30, 10 * 60 * 1000, 10 * 60 * 1000);
  await throttleFail(env.DB, ikey, 60, 10 * 60 * 1000, 10 * 60 * 1000);
  await ensureProfiles(env.DB);
  const cols = Object.keys(v.row);
  const now = Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO profiles (username_key, updated_at) VALUES (?1, ?2)").bind(me.username_key, now).run();
  const old = ("avatar" in v.row || "banner" in v.row) ? await env.DB.prepare("SELECT * FROM profiles WHERE username_key = ?1").bind(me.username_key).first() : null;
  if (cols.length) {
    await env.DB.prepare(`UPDATE profiles SET ${cols.map((c, i) => `${c} = ?${i + 1}`).join(", ")}, updated_at = ?${cols.length + 1} WHERE username_key = ?${cols.length + 2}`)
      .bind(...cols.map(c => v.row[c]), now, me.username_key).run();
  }
  if (old) {
    const gone = [];
    if ("avatar" in v.row && /^img:/.test(old.avatar || "") && v.row.avatar !== old.avatar) gone.push(old.avatar.slice(4));
    if ("banner" in v.row && old.banner) gone.push(old.banner);
    for (const id of gone) { try { await dropImage(env.DB, id); } catch { /* chat tables not there */ } }
  }
  const u = await env.DB.prepare("SELECT username, username_key, created_at, is_admin FROM users WHERE username_key = ?1").bind(me.username_key).first();
  const p = await env.DB.prepare("SELECT * FROM profiles WHERE username_key = ?1").bind(me.username_key).first();
  return json({ profile: { ...shapeProfile(u, p), isMe: true } });
}
