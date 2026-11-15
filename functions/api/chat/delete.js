import { json, guard, readBody, sessionUser } from "../auth/_shared.js";

/* POST /api/chat/delete { id } → delete your own message (admins: any message). */
export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in to use chat." }, 401);
  const id = Number((await readBody(request)).id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "Message id required." }, 400);
  const res = user.is_admin
    ? await env.DB.prepare("DELETE FROM chat_messages WHERE id = ?1").bind(id).run()
    : await env.DB.prepare("DELETE FROM chat_messages WHERE id = ?1 AND username_key = ?2").bind(id, user.username_key).run();
  const n = res && res.meta && typeof res.meta.changes === "number" ? res.meta.changes : 0;
  if (!n) return json({ error: "You can only delete your own messages." }, 404);
  return json({ ok: true, deleted: id });
}
