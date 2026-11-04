import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const key = String(body.username || "").trim().toLowerCase();
  const makeAdmin = !!body.isAdmin;
  if (!key) return json({ error: "Username required" }, 400);
  if (key === admin.username_key) return json({ error: "You cannot change your own admin status." }, 400);

  const target = await env.DB.prepare("SELECT username, is_admin FROM users WHERE username_key = ?1").bind(key).first();
  if (!target) return json({ error: "No such account" }, 404);

  if (!makeAdmin && target.is_admin) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1").first();
    if (count && count.c <= 1) return json({ error: "There has to be at least one admin." }, 400);
  }

  await env.DB.prepare("UPDATE users SET is_admin = ?1 WHERE username_key = ?2").bind(makeAdmin ? 1 : 0, key).run();
  return json({ ok: true, username: target.username, isAdmin: makeAdmin });
}
