import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";

const ROOMS = new Set(["General", "Games", "Random", "All"]);

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const room = String(body.room || "");
  if (!ROOMS.has(room)) return json({ error: "Unknown chat room." }, 400);

  const res = room === "All"
    ? await env.DB.prepare("DELETE FROM chat_messages").run()
    : await env.DB.prepare("DELETE FROM chat_messages WHERE room = ?1").bind(room).run();
  const cleared = res && res.meta && typeof res.meta.changes === "number" ? res.meta.changes : 0;
  return json({ ok: true, room, cleared });
}
