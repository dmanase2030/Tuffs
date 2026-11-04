import { json, getSettings } from "./auth/_shared.js";

/* Public site configuration the client needs: the admin announcement and the
 * chat/maintenance switches. Safe to expose — no account data. */
export async function onRequestGet(context) {
  const { env } = context;
  const s = await getSettings(env.DB);
  return json({ announcement: s.announcement, chatEnabled: s.chatEnabled, maintenance: s.maintenance });
}
