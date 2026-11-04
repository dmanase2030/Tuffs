import { json, guard, requireAdmin } from "../auth/_shared.js";

const ROOMS = new Set(["General", "Games", "Random"]);

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const url = new URL(request.url);
  const roomParam = String(url.searchParams.get("room") || "All");
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50;

  let res;
  if (roomParam === "All") {
    res = await env.DB.prepare(
      "SELECT id, room, username, text, created_at FROM chat_messages ORDER BY id DESC LIMIT ?1"
    ).bind(limit).all();
  } else if (ROOMS.has(roomParam)) {
    res = await env.DB.prepare(
      "SELECT id, room, username, text, created_at FROM chat_messages WHERE room = ?1 ORDER BY id DESC LIMIT ?2"
    ).bind(roomParam, limit).all();
  } else {
    return json({ error: "Unknown chat room." }, 400);
  }

  const messages = (res.results || []).map(m => ({
    id: m.id, room: m.room, user: m.username, text: m.text, ts: m.created_at,
  }));
  return json({ messages });
}
