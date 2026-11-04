import { json, guard, readBody, verifyPassword, createSession, getSettings } from "./_shared.js";
import { clientIp, throttleCheck, throttleFail, throttleClear } from "./_throttle.js";

/* Brute-force policy, two buckets:
 *  - per (account, IP): 8 fails inside 10 min locks that pair for 5 min
 *    (never locks the account for anyone else);
 *  - per account (all IPs): 30 fails inside 1 hour locks sign-in for 10 min
 *    (stops distributed guessing; the tradeoff is a determined attacker can
 *    briefly lock the account — accepted, and admin can still be reset).
 * A correct password clears both counters. */
const MAX_FAILS = 8, WINDOW_MS = 10 * 60 * 1000, LOCK_MS = 5 * 60 * 1000;
const ACCT_MAX = 30, ACCT_WINDOW_MS = 60 * 60 * 1000, ACCT_LOCK_MS = 10 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const body = await readBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const key = username.toLowerCase();

  const tkey = "login|" + key + "|" + clientIp(request);
  const akey = "login-acct|" + key;
  const lockedFor = Math.max(
    await throttleCheck(env.DB, tkey),
    await throttleCheck(env.DB, akey)
  );
  if (lockedFor > 0) {
    return json({ error: "Too many failed attempts — try again in " + Math.ceil(lockedFor / 60) + " min." }, 429);
  }

  const user = await env.DB.prepare("SELECT username, salt, hash, is_admin, is_banned FROM users WHERE username_key = ?1").bind(key).first();
  const recordFail = async () => {
    await throttleFail(env.DB, tkey, MAX_FAILS, WINDOW_MS, LOCK_MS);
    await throttleFail(env.DB, akey, ACCT_MAX, ACCT_WINDOW_MS, ACCT_LOCK_MS);
  };
  if (!user) {
    await recordFail();
    return json({ error: "Incorrect username or password" }, 401);
  }
  const ok = await verifyPassword(password, user.salt, user.hash);
  if (!ok) {
    await recordFail();
    return json({ error: "Incorrect username or password" }, 401);
  }
  await throttleClear(env.DB, tkey);
  await throttleClear(env.DB, akey);
  if (user.is_banned) return json({ error: "This account has been suspended." }, 403);
  const settings = await getSettings(env.DB);
  if (settings.maintenance && !user.is_admin) return json({ error: "Lumio is under maintenance — please try again later." }, 503);

  const token = await createSession(env.DB, key);
  return json({ username: user.username, token, isAdmin: !!user.is_admin });
}
