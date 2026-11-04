import { json, guard, requireAdmin } from "../auth/_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const now = Date.now();

  const res = await env.DB.prepare(
    `SELECT u.username, u.created_at, u.is_admin, u.is_banned,
       (SELECT COUNT(*) FROM sessions s WHERE s.username_key = u.username_key AND s.expires_at > ?1) AS sessions,
       (SELECT COUNT(*) FROM chat_messages c WHERE c.username_key = u.username_key) AS messages,
       MAX(
         COALESCE((SELECT MAX(s2.created_at) FROM sessions s2 WHERE s2.username_key = u.username_key), 0),
         COALESCE((SELECT MAX(c2.created_at) FROM chat_messages c2 WHERE c2.username_key = u.username_key), 0),
         u.created_at
       ) AS last_active
     FROM users u
     WHERE (?2 = '' OR u.username_key LIKE ?3)
     ORDER BY u.created_at DESC LIMIT 200`
  ).bind(now, q, "%" + q + "%").all();

  const users = (res.results || []).map(u => ({
    username: u.username,
    created_at: u.created_at,
    is_admin: !!u.is_admin,
    is_banned: !!u.is_banned,
    sessions: u.sessions || 0,
    messages: u.messages || 0,
    last_active: u.last_active || u.created_at,
  }));
  return json({ users });
}
