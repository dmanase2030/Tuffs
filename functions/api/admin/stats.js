import { json, guard, requireAdmin } from "../auth/_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const users = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
  const sessions = await env.DB.prepare("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?1").bind(Date.now()).first();
  return json({ users: users ? users.c : 0, sessions: sessions ? sessions.c : 0 });
}
