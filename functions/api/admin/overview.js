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

  const [users, admins, banned, newDay, newWeek, sessions] = await Promise.all([
    one("SELECT COUNT(*) AS c FROM users"),
    one("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1"),
    one("SELECT COUNT(*) AS c FROM users WHERE is_banned = 1"),
    one("SELECT COUNT(*) AS c FROM users WHERE created_at > ?1", dayAgo),
    one("SELECT COUNT(*) AS c FROM users WHERE created_at > ?1", weekAgo),
    one("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?1", now),
  ]);
  const latestUsersRes = await env.DB.prepare(
    "SELECT username, created_at, is_admin, is_banned FROM users ORDER BY created_at DESC LIMIT 5"
  ).all();

  // Lumio Chat numbers (lc_* tables). Latest messages only come from the public
  // Lumio server: DMs and private servers aren't listed here.
  let chatTotal = 0, chatDay = 0, servers = 0, openReports = 0, latestChat = [];
  try {
    [chatTotal, chatDay, servers, openReports] = await Promise.all([
      one("SELECT COUNT(*) AS c FROM lc_msgs WHERE deleted = 0 AND sys = 0"),
      one("SELECT COUNT(*) AS c FROM lc_msgs WHERE deleted = 0 AND sys = 0 AND created_at > ?1", dayAgo),
      one("SELECT COUNT(*) AS c FROM lc_servers"),
      one("SELECT COUNT(*) AS c FROM lc_reports WHERE status = 'open'"),
    ]);
    const r = await env.DB.prepare(
      "SELECT m.id, m.author_key, c.name AS room, COALESCE(u.username, m.author_key) AS username, m.text, m.created_at FROM lc_msgs m LEFT JOIN lc_chans c ON c.id = m.chan LEFT JOIN users u ON u.username_key = m.author_key WHERE m.server_id = 'lumio' AND m.deleted = 0 AND m.sys = 0 ORDER BY m.id DESC LIMIT 8"
    ).all();
    latestChat = (r.results || []).map(m => ({ id: m.id, room: m.room || "", user: m.author_key === "~ai" ? "Lumio AI" : m.username, text: m.text, ts: m.created_at }));
  } catch (e) { /* chat tables not created yet */ }

  return json({
    users, admins, banned, newDay, newWeek, sessions, chatTotal, chatDay, servers, openReports,
    latestUsers: (latestUsersRes.results || []).map(u => ({
      username: u.username, created_at: u.created_at, is_admin: !!u.is_admin, is_banned: !!u.is_banned,
    })),
    latestChat,
  });
}
