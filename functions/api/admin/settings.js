import { json, guard, readBody, requireAdmin, getSettings, setSetting } from "../auth/_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);
  return json(await getSettings(env.DB));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const announcement = String(body.announcement || "").trim().slice(0, 200);
  await setSetting(env.DB, "announcement", announcement);
  await setSetting(env.DB, "signups_open", body.signupsOpen ? "1" : "0");
  await setSetting(env.DB, "chat_enabled", body.chatEnabled ? "1" : "0");
  await setSetting(env.DB, "maintenance", body.maintenance ? "1" : "0");

  return json(await getSettings(env.DB));
}
