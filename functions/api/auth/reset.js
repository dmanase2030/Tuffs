import { json, guard, readBody, hashPassword, createSession, sha256hex } from "./_shared.js";

/* One-time password reset. A reset token is generated out-of-band (site owner
 * only); just its SHA-256 hash + expiry live on the user row. Using it sets a
 * new password, burns the token, kills the account's other sessions, and
 * returns a fresh session — same shape as login. */
export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const body = await readBody(request);
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!/^[0-9a-f]{64}$/i.test(token)) return json({ error: "This reset link is invalid or has expired." }, 401);
  if (password.length < 4) return json({ error: "Password must be at least 4 characters" }, 400);

  const tokenHash = await sha256hex(token);
  const user = await env.DB.prepare(
    "SELECT username, username_key, is_admin FROM users WHERE reset_hash = ?1 AND reset_expires > ?2"
  ).bind(tokenHash, Date.now()).first();
  if (!user) return json({ error: "This reset link is invalid or has expired." }, 401);

  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    "UPDATE users SET salt = ?1, hash = ?2, reset_hash = NULL, reset_expires = NULL WHERE username_key = ?3"
  ).bind(salt, hash, user.username_key).run();
  await env.DB.prepare("DELETE FROM sessions WHERE username_key = ?1").bind(user.username_key).run();

  const session = await createSession(env.DB, user.username_key);
  return json({ username: user.username, token: session, isAdmin: !!user.is_admin });
}
