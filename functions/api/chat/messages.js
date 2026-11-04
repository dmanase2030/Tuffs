import { json, guard, readBody, sessionUser, getSettings } from "../auth/_shared.js";

const ROOMS = new Set(["General", "Games", "Random"]);

function cleanRoom(value) {
  const room = String(value || "General");
  return ROOMS.has(room) ? room : null;
}

function shape(row) {
  return {
    id: row.id,
    room: row.room,
    user: row.username,
    text: row.text,
    ts: row.created_at,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in to use chat." }, 401);
  const settings = await getSettings(env.DB);
  if (!settings.chatEnabled && !user.is_admin) return json({ error: "Chat is turned off by an admin right now." }, 403);

  const url = new URL(request.url);
  const room = cleanRoom(url.searchParams.get("room"));
  if (!room) return json({ error: "Unknown chat room." }, 400);

  const afterRaw = Number(url.searchParams.get("after") || 0);
  const after = Number.isFinite(afterRaw) && afterRaw > 0 ? Math.floor(afterRaw) : 0;

  let rows;
  if (after > 0) {
    const result = await env.DB.prepare(
      "SELECT id, room, username, text, created_at FROM chat_messages WHERE room = ?1 AND id > ?2 ORDER BY id ASC LIMIT 100"
    ).bind(room, after).all();
    rows = result.results || [];
  } else {
    const result = await env.DB.prepare(
      "SELECT id, room, username, text, created_at FROM chat_messages WHERE room = ?1 ORDER BY id DESC LIMIT 100"
    ).bind(room).all();
    rows = (result.results || []).reverse();
  }

  return json({ room, messages: rows.map(shape) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in to use chat." }, 401);
  const settings = await getSettings(env.DB);
  if (!settings.chatEnabled && !user.is_admin) return json({ error: "Chat is turned off by an admin right now." }, 403);

  const body = await readBody(request);
  const room = cleanRoom(body.room);
  if (!room) return json({ error: "Unknown chat room." }, 400);

  const text = String(body.text || "").trim().replace(/\s+/g, " ");
  if (!text) return json({ error: "Type a message first." }, 400);
  if (text.length > 500) return json({ error: "Messages are limited to 500 characters." }, 400);

  const now = Date.now();
  const last = await env.DB.prepare(
    "SELECT created_at FROM chat_messages WHERE username_key = ?1 ORDER BY id DESC LIMIT 1"
  ).bind(user.username_key).first();
  if (last && now - last.created_at < 800) {
    return json({ error: "Slow down a moment, then send again." }, 429);
  }

  const row = await env.DB.prepare(
    "INSERT INTO chat_messages (room, username, username_key, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, room, username, text, created_at"
  ).bind(room, user.username, user.username_key, text, now).first();

  // Occasional housekeeping so a busy room cannot grow without bound.
  if (row && row.id % 100 === 0) {
    await env.DB.prepare(
      "DELETE FROM chat_messages WHERE id < (SELECT COALESCE(MAX(id), 0) FROM chat_messages) - 1000"
    ).run();
  }

  return json({ message: shape(row) }, 201);
}
