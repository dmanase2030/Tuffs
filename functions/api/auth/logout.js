import { json, bearer, sha256hex } from "./_shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = bearer(request);
  if (token && env.DB) {
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256hex(token)).run();
    } catch { /* signing out locally is enough */ }
  }
  return json({ ok: true });
}
