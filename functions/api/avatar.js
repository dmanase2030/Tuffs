import { ensureProfiles } from "./auth/_profile.js";

/* GET /api/avatar?u=<name>&v=<version> → the uploaded profile picture as an image.
 * Public so <img> tags can load it; only real images that passed the upload
 * check are stored, and suspended accounts get nothing. */
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const key = String(url.searchParams.get("u") || "").trim().toLowerCase().slice(0, 40);
  if (!key) return new Response("Not found", { status: 404 });
  await ensureProfiles(env.DB);
  const row = await env.DB.prepare(
    "SELECT p.avatar, p.updated_at FROM profiles p JOIN users u ON u.username_key = p.username_key WHERE p.username_key = ?1 AND u.is_banned = 0"
  ).bind(key).first();
  const m = row && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(row.avatar || "");
  if (!m) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pinned = url.searchParams.get("v") === String(row.updated_at);
  return new Response(bytes, {
    headers: {
      "content-type": m[1],
      "cache-control": pinned ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
