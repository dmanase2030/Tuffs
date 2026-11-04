import { json, guard, readBody, verifyPassword, createSession, getSettings } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const body = await readBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const key = username.toLowerCase();

  const user = await env.DB.prepare("SELECT username, salt, hash, is_admin, is_banned FROM users WHERE username_key = ?1").bind(key).first();
  if (!user) return json({ error: "Incorrect username or password" }, 401);
  const ok = await verifyPassword(password, user.salt, user.hash);
  if (!ok) return json({ error: "Incorrect username or password" }, 401);
  if (user.is_banned) return json({ error: "This account has been suspended." }, 403);
  const settings = await getSettings(env.DB);
  if (settings.maintenance && !user.is_admin) return json({ error: "Lumio is under maintenance — please try again later." }, 503);

  const token = await createSession(env.DB, key);
  return json({ username: user.username, token, isAdmin: !!user.is_admin });
}
