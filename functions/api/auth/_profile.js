/* Lumio profiles: one optional row per account in `profiles`. Accounts without
 * a row just use their username and the default avatar. Avatars are either a
 * preset id ("p1"…"p12") or a small uploaded image stored as a data URL. */

export const PRESETS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"];
export const ACCENTS = ["#f2a54a", "#ff7a59", "#ff5d8f", "#b07cff", "#5b8cff", "#3fc1c9", "#4cd07d", "#e0c341"];
export const MAX_AVATAR = 64000; // characters of data URL (~46 KB image)
export const MAX_BIO = 160, MAX_NAME = 24;

export async function ensureProfiles(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS profiles (username_key TEXT PRIMARY KEY, display_name TEXT, avatar TEXT, bio TEXT, accent TEXT, updated_at INTEGER NOT NULL DEFAULT 0)"
  ).run();
}

const clean = (v, max) => String(v == null ? "" : v)
  .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, max);

/* Check an uploaded avatar: a base64 PNG/JPEG/WebP data URL whose bytes really are that image type. */
export function checkImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || "");
  if (!m) return "Pick a PNG, JPEG or WebP image.";
  if (dataUrl.length > MAX_AVATAR) return "That picture is too big. Try a smaller one.";
  let head;
  try { head = atob(m[2].slice(0, 24)); } catch { return "That picture couldn't be read."; }
  const b = [...head].map(c => c.charCodeAt(0));
  const ok = m[1] === "png" ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    : m[1] === "jpeg" ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP";
  return ok ? "" : "That file isn't a real image.";
}

/* Validate a profile update. Returns { error } or { row } (only the fields that change). */
export function validateProfile(body) {
  const row = {};
  if ("displayName" in body) {
    const n = clean(body.displayName, MAX_NAME + 1);
    if (n.length > MAX_NAME) return { error: `Display names are up to ${MAX_NAME} characters.` };
    row.display_name = n || null;
  }
  if ("bio" in body) {
    const raw = String(body.bio == null ? "" : body.bio);
    if (raw.length > MAX_BIO + 40) return { error: `Bios are up to ${MAX_BIO} characters.` };
    const b = clean(raw, MAX_BIO + 1);
    if (b.length > MAX_BIO) return { error: `Bios are up to ${MAX_BIO} characters.` };
    row.bio = b || null;
  }
  if ("accent" in body) {
    const a = String(body.accent || "").toLowerCase();
    if (!ACCENTS.includes(a)) return { error: "Pick one of the accent colors." };
    row.accent = a;
  }
  if ("avatar" in body) {
    const v = body.avatar;
    if (v === null || v === "") row.avatar = null;
    else if (PRESETS.includes(v)) row.avatar = v;
    else { const e = checkImage(String(v)); if (e) return { error: e }; row.avatar = String(v); }
  }
  return { row };
}

/* Public shape. `av` is a preset id, "img" for an uploaded picture, or null. */
export function shapeProfile(u, p) {
  const avatar = p && p.avatar;
  return {
    username: u.username,
    key: u.username_key,
    displayName: (p && p.display_name) || u.username,
    av: avatar ? (avatar.startsWith("data:") ? "img" : avatar) : null,
    avv: (p && p.updated_at) || 0,
    bio: (p && p.bio) || "",
    accent: (p && p.accent) || null,
    joined: u.created_at,
    isAdmin: !!u.is_admin,
  };
}
