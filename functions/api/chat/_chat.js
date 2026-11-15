import { bearer, sha256hex } from "../auth/_shared.js";

export const ROOMS = ["General", "Games", "Random"];
export const MAX_TEXT = 500;

/* Why a request has no usable session: "banned" when the token belongs to a
 * suspended account (so the app can say so), otherwise "out". */
export async function whyNoUser(request, env) {
  const t = bearer(request);
  if (!t) return "out";
  try {
    const row = await env.DB.prepare(
      "SELECT u.is_banned FROM sessions s JOIN users u ON u.username_key = s.username_key WHERE s.token_hash = ?1"
    ).bind(await sha256hex(t)).first();
    return row && row.is_banned ? "banned" : "out";
  } catch { return "out"; }
}

/* Message rows joined with the author's profile (display name, accent, avatar kind). */
export const SELECT_MSG =
  "SELECT m.id, m.room, m.username, m.username_key, m.text, m.created_at, p.display_name, p.accent, " +
  "CASE WHEN p.avatar LIKE 'data:%' THEN 'img' ELSE p.avatar END AS av, p.updated_at AS avv " +
  "FROM chat_messages m LEFT JOIN profiles p ON p.username_key = m.username_key";

export function shapeMsg(row, me) {
  return {
    id: row.id,
    room: row.room,
    user: row.username,
    key: row.username_key,
    name: row.display_name || row.username,
    accent: row.accent || null,
    av: row.av || null,
    avv: row.avv || 0,
    text: row.text,
    ts: row.created_at,
    mine: !!me && row.username_key === me.username_key,
  };
}
