import { json, guard, readBody, hashPassword, createSession, USERNAME_RE, getSettings } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const settings = await getSettings(env.DB);
  if (settings.maintenance) return json({ error: "Lumio is under maintenance — please try again later." }, 503);
  if (!settings.signupsOpen) return json({ error: "Signups are closed right now." }, 403);

  const body = await readBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!USERNAME_RE.test(username)) return json({ error: "Username must be 3–20 letters, numbers, dots, _ or -" }, 400);
  if (password.length < 4) return json({ error: "Password must be at least 4 characters" }, 400);

  const key = username.toLowerCase();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username_key = ?1").bind(key).first();
  if (existing) return json({ error: "That username is already taken" }, 409);

  const { salt, hash } = await hashPassword(password);
  try {
    await env.DB.prepare("INSERT INTO users (username, username_key, salt, hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(username, key, salt, hash, Date.now())
      .run();
  } catch (e) {
    // UNIQUE constraint raced the pre-check — username is taken.
    return json({ error: "That username is already taken" }, 409);
  }

  const token = await createSession(env.DB, key);
  return json({ username, token, isAdmin: false }, 201);
}
