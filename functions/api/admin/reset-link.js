import { json, guard, readBody, requireAdmin, newToken, sha256hex } from "../auth/_shared.js";

/* Generates a one-time password reset link for an account (24h, single use).
 * Only the token's SHA-256 hash is stored; the link itself is returned once,
 * to the signed-in admin who asked for it. */
export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const key = String(body.username || "").trim().toLowerCase();
  if (!key) return json({ error: "Username required" }, 400);

  const target = await env.DB.prepare("SELECT username FROM users WHERE username_key = ?1").bind(key).first();
  if (!target) return json({ error: "No such account" }, 404);

  const token = newToken();
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  await env.DB.prepare("UPDATE users SET reset_hash = ?1, reset_expires = ?2 WHERE username_key = ?3")
    .bind(await sha256hex(token), expires, key).run();

  return json({ ok: true, username: target.username, path: "/#reset=" + token, expires });
}
