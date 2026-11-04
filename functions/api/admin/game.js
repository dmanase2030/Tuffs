import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

/* Admin: rename a catalog game, hide/show it, or reset it to the original.
 * POST { id, title?, hidden? } — empty title + not hidden clears the override.
 * POST { id, reset: true } — removes any override for the game. */
export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
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
