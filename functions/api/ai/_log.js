/* Server-side log of every admin action Lumio AI runs (and code proposals). */
export async function logAdminAI(env, username, action, params, ok, result) {
  const row = [Date.now(), String(username || ""), String(action || "").slice(0, 40), JSON.stringify(params || {}).slice(0, 4000), ok ? 1 : 0, String(result || "").slice(0, 1000)];
  console.log("Lumio AI admin action", JSON.stringify(row));
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS ai_admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, username TEXT NOT NULL, action TEXT NOT NULL, params TEXT, ok INTEGER NOT NULL, result TEXT)"
    ).run();
    await env.DB.prepare("INSERT INTO ai_admin_log (created_at, username, action, params, ok, result) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(...row).run();
  } catch (e) {
    console.error("Lumio AI admin log failed", String(e && e.message || e));
  }
}
