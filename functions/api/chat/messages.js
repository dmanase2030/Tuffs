import { json, guard, readBody, sessionUser, getSettings } from "../auth/_shared.js";
import { clientIp, throttleCheck, throttleFail } from "../auth/_throttle.js";
import { ensureProfiles } from "../auth/_profile.js";
import { ROOMS, MAX_TEXT, whyNoUser, SELECT_MSG, shapeMsg } from "./_chat.js";

/* Lumio Chat.
 * GET  /api/chat/messages?room=General[&after=<id>][&since=<id>]
 *      → { room, rooms, messages, alive?, me }  newest 100, or only those after `after`.
 *        `alive` lists ids ≥ `since` that still exist, so clients drop deleted ones.
 * POST /api/chat/messages { room, text } → { message }
 * Signed-in accounts only; suspended accounts are refused. Sending is rate
 * limited with the shared D1 throttle (8 messages per 15 s, then 30 s pause). */

const SEND_MAX = 8, SEND_WINDOW = 15 * 1000, SEND_LOCK = 30 * 1000;

function cleanRoom(value) {
  const room = String(value || "General");
  return ROOMS.includes(room) ? room : null;
}

async function who(request, env) {
  const user = await sessionUser(request, env);
  if (user) return { user };
  const why = await whyNoUser(request, env);
  return { res: why === "banned"
    ? json({ error: "Your account is suspended, so you can't use chat.", code: "banned" }, 403)
    : json({ error: "Sign in to use chat.", code: "signin" }, 401) };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const { user, res } = await who(request, env);
  if (res) return res;
  const settings = await getSettings(env.DB);
  if (!settings.chatEnabled && !user.is_admin) return json({ error: "Chat is turned off by an admin right now.", code: "off" }, 403);
  await ensureProfiles(env.DB);

  const url = new URL(request.url);
  const room = cleanRoom(url.searchParams.get("room"));
  if (!room) return json({ error: "Unknown chat room." }, 400);
  const num = k => { const v = Math.floor(Number(url.searchParams.get(k) || 0)); return Number.isFinite(v) && v > 0 ? v : 0; };
  const after = num("after"), since = num("since");

  let rows;
  if (after > 0) {
    rows = (await env.DB.prepare(SELECT_MSG + " WHERE m.room = ?1 AND m.id > ?2 ORDER BY m.id ASC LIMIT 100").bind(room, after).all()).results || [];
  } else {
    rows = ((await env.DB.prepare(SELECT_MSG + " WHERE m.room = ?1 ORDER BY m.id DESC LIMIT 100").bind(room).all()).results || []).reverse();
  }
  const out = { room, rooms: ROOMS, messages: rows.map(r => shapeMsg(r, user)), me: { key: user.username_key, isAdmin: !!user.is_admin }, chatEnabled: !!settings.chatEnabled };
  if (since > 0) {
    out.alive = ((await env.DB.prepare("SELECT id FROM chat_messages WHERE room = ?1 AND id >= ?2 ORDER BY id ASC LIMIT 300").bind(room, since).all()).results || []).map(r => r.id);
  }
  return json(out);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const { user, res } = await who(request, env);
  if (res) return res;
  const settings = await getSettings(env.DB);
  if (!settings.chatEnabled && !user.is_admin) return json({ error: "Chat is turned off by an admin right now.", code: "off" }, 403);

  const body = await readBody(request);
  const room = cleanRoom(body.room);
  if (!room) return json({ error: "Unknown chat room." }, 400);
  const text = String(body.text || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return json({ error: "Type a message first." }, 400);
  if (text.length > MAX_TEXT) return json({ error: `Messages are limited to ${MAX_TEXT} characters.` }, 400);

  const ukey = "chat|" + user.username_key, ikey = "chat-ip|" + clientIp(request);
  const wait = Math.max(await throttleCheck(env.DB, ukey), await throttleCheck(env.DB, ikey));
  if (wait > 0) return json({ error: `You're sending messages too fast. Wait ${wait} s.`, code: "rate", wait }, 429);
  await throttleFail(env.DB, ukey, SEND_MAX, SEND_WINDOW, SEND_LOCK);
  await throttleFail(env.DB, ikey, SEND_MAX * 3, SEND_WINDOW, SEND_LOCK);

  const now = Date.now();
  await ensureProfiles(env.DB);
  const ins = await env.DB.prepare(
    "INSERT INTO chat_messages (room, username, username_key, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id"
  ).bind(room, user.username, user.username_key, text, now).first();
  const row = await env.DB.prepare(SELECT_MSG + " WHERE m.id = ?1").bind(ins.id).first();

  // Occasional housekeeping so the table can't grow without bound.
  if (ins.id % 100 === 0) {
    await env.DB.prepare("DELETE FROM chat_messages WHERE id < (SELECT COALESCE(MAX(id), 0) FROM chat_messages) - 3000").run();
  }
  return json({ message: shapeMsg(row, user) }, 201);
}
