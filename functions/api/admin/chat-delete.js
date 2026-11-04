import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Message id required" }, 400);

  const res = await env.DB.prepare("DELETE FROM chat_messages WHERE id = ?1").bind(id).run();
  const deleted = res && res.meta && typeof res.meta.changes === "number" ? res.meta.changes : 0;
  if (!deleted) return json({ error: "No such message" }, 404);
  return json({ ok: true, deleted: id });
}
