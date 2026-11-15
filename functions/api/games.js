import { json } from "./auth/_shared.js";

/* Public: admin-set game overrides (renames / hidden games) from the catalog.
 * Returns { overrides: { <gameId>: { title?, hidden? } }, custom: [{ id, title, url, category }] }.
 * Never fails the page: any DB problem just means "no overrides". */
export async function onRequestGet(context) {
  const { env } = context;
  const overrides = {}, custom = [];
  if (env.DB) {
    try {
      const rows = await env.DB.prepare("SELECT id, title, hidden FROM game_overrides").all();
      for (const r of rows.results || []) {
        const o = {};
        if (r.title) o.title = r.title;
        if (r.hidden) o.hidden = true;
        if (o.title || o.hidden) overrides[r.id] = o;
      }
    } catch { /* table not created yet */ }
    try {
      const rows = await env.DB.prepare("SELECT id, title, url, category FROM custom_games ORDER BY created_at").all();
      for (const r of rows.results || []) custom.push({ id: r.id, title: r.title, url: r.url, category: r.category || "Games" });
    } catch { /* no custom games yet */ }
  }
  return json({ overrides, custom });
}
