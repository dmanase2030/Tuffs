import { json, guard, readBody, verifyPassword, createSession, getSettings } from "./_shared.js";
import { clientIp, throttleCheck, throttleFail, throttleClear } from "./_throttle.js";

/* Brute-force policy: 8 failed attempts per (account, IP) inside 10 minutes
 * locks that pair for 5 minutes. A correct password clears the counter. */
const MAX_FAILS = 8, WINDOW_MS = 10 * 60 * 1000, LOCK_MS = 5 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const body = await readBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const key = username.toLowerCase();

  const tkey = "login|" + key + "|" + clientIp(request);
  const lockedFor = await throttleCheck(env.DB, tkey);
  if (lockedFor > 0) {
    return json({ error: "Too many failed attempts — try again in " + Math.ceil(lockedFor / 60) + " min." }, 429);
  }

  const user = await env.DB.prepare("SELECT username, salt, hash, is_admin, is_banned FROM users WHERE username_key = ?1").bind(key).first();
  if (!user) {
    await throttleFail(env.DB, tkey, MAX_FAILS, WINDOW_MS, LOCK_MS);
    return json({ error: "Incorrect username or password" }, 401);
  }
  const ok = await verifyPassword(password, user.salt, user.hash);
  if (!ok) {
    await throttleFail(env.DB, tkey, MAX_FAILS, WINDOW_MS, LOCK_MS);
    return json({ error: "Incorrect username or password" }, 401);
  }
  await throttleClear(env.DB, tkey);
  if (user.is_banned) return json({ error: "This account has been suspended." }, 403);
  const settings = await getSettings(env.DB);
  if (settings.maintenance && !user.is_admin) return json({ error: "Lumio is under maintenance — please try again later." }, 503);

  const token = await createSession(env.DB, key);
  return json({ username: user.username, token, isAdmin: !!user.is_admin });
}
