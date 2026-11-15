import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

/* Admin: rename a catalog game, hide/show it, or reset it to the original.
 * POST { id, title?, hidden? } — empty title + not hidden clears the override.
 * POST { id, reset: true } — removes any override for the game.
 * POST { add: true, title, url, category? } — adds an outside game (https link)
 *      to the catalog; it gets the id "custom-<slug>" and can be renamed/hidden like any other. */
const CUSTOM_TABLE = "CREATE TABLE IF NOT EXISTS custom_games (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, category TEXT, created_at INTEGER NOT NULL, created_by TEXT)";
export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  if (body.add) {
    const title = String(body.title || "").trim().slice(0, 80);
    const category = String(body.category || "Games").trim().slice(0, 30) || "Games";
    let url;
    try { url = new URL(String(body.url || "").trim()); } catch { return json({ error: "Give the game's full https:// link." }, 400); }
    if (url.protocol !== "https:") return json({ error: "Game links must start with https://" }, 400);
    if (!title) return json({ error: "Game title required" }, 400);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "game";
    await env.DB.prepare(CUSTOM_TABLE).run();
    let id = "custom-" + slug;
    if (await env.DB.prepare("SELECT 1 FROM custom_games WHERE id = ?1").bind(id).first()) id += "-" + Date.now().toString(36);
    await env.DB.prepare("INSERT INTO custom_games (id, title, url, category, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(id, title, url.href, category, Date.now(), admin.username).run();
    return json({ ok: true, id, title, url: url.href, category });
  }
  const id = String(body.id || "").trim();
  if (!id || id.length > 100) return json({ error: "Game id required" }, 400);

  if (body.reset) {
    await env.DB.prepare("DELETE FROM game_overrides WHERE id = ?1").bind(id).run();
    return json({ ok: true, id, title: null, hidden: false });
  }

  const title = String(body.title ?? "").trim().slice(0, 80);
  const hidden = !!body.hidden;
  if (!title && !hidden) {
    await env.DB.prepare("DELETE FROM game_overrides WHERE id = ?1").bind(id).run();
    return json({ ok: true, id, title: null, hidden: false });
  }
  await env.DB.prepare(
    "INSERT INTO game_overrides (id, title, hidden, updated_at) VALUES (?1, ?2, ?3, ?4) " +
    "ON CONFLICT(id) DO UPDATE SET title = excluded.title, hidden = excluded.hidden, updated_at = excluded.updated_at"
  ).bind(id, title || null, hidden ? 1 : 0, Date.now()).run();
  return json({ ok: true, id, title: title || null, hidden });
}
