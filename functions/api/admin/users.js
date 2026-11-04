import { json, guard, requireAdmin } from "../auth/_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const res = await env.DB.prepare(
    "SELECT username, created_at, is_admin FROM users ORDER BY created_at DESC LIMIT 200"
  ).all();
  const users = (res.results || []).map(u => ({
    username: u.username,
    created_at: u.created_at,
    is_admin: !!u.is_admin,
  }));
  return json({ users });
}
