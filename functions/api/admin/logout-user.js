import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const key = String(body.username || "").trim().toLowerCase();
  if (!key) return json({ error: "Username required" }, 400);
  if (key === admin.username_key) return json({ error: "Use the power button to sign yourself out." }, 400);

  const target = await env.DB.prepare("SELECT username FROM users WHERE username_key = ?1").bind(key).first();
  if (!target) return json({ error: "No such account" }, 404);

  const res = await env.DB.prepare("DELETE FROM sessions WHERE username_key = ?1").bind(key).run();
  const ended = res && res.meta && typeof res.meta.changes === "number" ? res.meta.changes : 0;
  return json({ ok: true, username: target.username, ended });
}
