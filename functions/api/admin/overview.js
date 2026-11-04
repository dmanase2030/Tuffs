import { json, guard, requireAdmin } from "../auth/_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const one = async (sql, ...binds) => {
    const row = await env.DB.prepare(sql).bind(...binds).first();
    return row ? row.c : 0;
  };

  const [users, admins, banned, newDay, newWeek, sessions, chatTotal, chatDay] = await Promise.all([
    one("SELECT COUNT(*) AS c FROM users"),
    one("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1"),
    one("SELECT COUNT(*) AS c FROM users WHERE is_banned = 1"),
    one("SELECT COUNT(*) AS c FROM users WHERE created_at > ?1", dayAgo),
    one("SELECT COUNT(*) AS c FROM users WHERE created_at > ?1", weekAgo),
    one("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?1", now),
    one("SELECT COUNT(*) AS c FROM chat_messages"),
    one("SELECT COUNT(*) AS c FROM chat_messages WHERE created_at > ?1", dayAgo),
  ]);

  const roomRes = await env.DB.prepare(
    "SELECT room, COUNT(*) AS c FROM chat_messages GROUP BY room"
  ).all();
  const rooms = {};
  for (const r of roomRes.results || []) rooms[r.room] = r.c;

  const latestUsersRes = await env.DB.prepare(
    "SELECT username, created_at, is_admin, is_banned FROM users ORDER BY created_at DESC LIMIT 5"
  ).all();
  const latestChatRes = await env.DB.prepare(
    "SELECT id, room, username, text, created_at FROM chat_messages ORDER BY id DESC LIMIT 8"
  ).all();

  return json({
    users, admins, banned, newDay, newWeek, sessions, chatTotal, chatDay, rooms,
    latestUsers: (latestUsersRes.results || []).map(u => ({
      username: u.username, created_at: u.created_at, is_admin: !!u.is_admin, is_banned: !!u.is_banned,
    })),
    latestChat: (latestChatRes.results || []).map(m => ({
      id: m.id, room: m.room, user: m.username, text: m.text, ts: m.created_at,
    })),
  });
}
