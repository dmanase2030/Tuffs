import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";
import { logAdminAI } from "./_log.js";
import { allGames } from "./_site.js";
import { onRequestGet as overviewGet } from "../admin/overview.js";
import { onRequestGet as settingsGet, onRequestPost as settingsPost } from "../admin/settings.js";
import { onRequestPost as bannedPost } from "../admin/set-banned.js";
import { onRequestPost as gamePost } from "../admin/game.js";

/* POST /api/ai/admin-action { action, ...params }
 * Runs an admin action that Lumio AI prepared and the admin confirmed in the app.
 * Admin-only (checked here AND again by each /api/admin endpoint it calls).
 * Every attempt by an admin is written to the ai_admin_log table.
 * GET /api/ai/admin-action → the 30 most recent log rows (admins only). */

const ACTIONS = new Set(["announce", "settings", "ban", "unban", "game_add", "game_edit", "game_hide", "stats"]);

export async function onRequestGet(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  if (!(await requireAdmin(request, env))) return json({ error: "Admins only" }, 403);
  try {
    const r = await env.DB.prepare("SELECT created_at, username, action, params, ok, result FROM ai_admin_log ORDER BY id DESC LIMIT 30").all();
    return json({ log: r.results || [] });
  } catch { return json({ log: [] }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const action = String(body.action || "");
  if (!ACTIONS.has(action)) return json({ error: "Unknown admin action." }, 400);
  const params = { ...body }; delete params.action;

  // Call the existing admin endpoint with the admin's own session, so it re-checks admin itself.
  const call = async (handler, path, method, payload) => {
    const headers = { authorization: request.headers.get("authorization") || "", "content-type": "application/json" };
    const req = new Request(new URL(path, request.url), { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    const res = await handler({ ...context, request: req });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  };
  const current = () => call(settingsGet, "/api/admin/settings", "GET");
  const save = (s) => call(settingsPost, "/api/admin/settings", "POST", s);

  let result, summary;
  try {
    switch (action) {
      case "announce": {
        const text = String(params.text ?? "").trim().slice(0, 200);
        result = await save({ ...(await current()), announcement: text });
        summary = text ? "Announcement set: " + text : "Announcement removed.";
        break;
      }
      case "settings": {
        const s = await current(), next = { ...s }, changed = [];
        for (const k of ["signupsOpen", "chatEnabled", "maintenance"]) {
          if (typeof params[k] === "boolean") { next[k] = params[k]; changed.push(k + " " + (params[k] ? "on" : "off")); }
        }
        if (!changed.length) throw new Error("No setting to change.");
        result = await save(next);
        summary = "Site settings changed: " + changed.join(", ") + ".";
        break;
      }
      case "ban": case "unban": {
        const username = String(params.username || "").trim();
        result = await call(bannedPost, "/api/admin/set-banned", "POST", { username, banned: action === "ban" });
        summary = result.username + (result.banned ? " is suspended." : " is unsuspended.");
        break;
      }
      case "game_add": {
        result = await call(gamePost, "/api/admin/game", "POST", { add: true, title: params.title, url: params.url, category: params.category });
        summary = "Added game " + result.title + " (" + result.id + ").";
        break;
      }
      case "game_edit": case "game_hide": {
        const id = String(params.id || "").trim();
        if (!(await allGames(request, env)).some(g => g.id === id)) throw new Error("No game with id " + id + " in the catalog.");
        let cur = {};
        try {
          const row = await env.DB.prepare("SELECT title, hidden FROM game_overrides WHERE id = ?1").bind(id).first();
          if (row) cur = { title: row.title || "", hidden: !!row.hidden };
        } catch { /* no overrides yet */ }
        const payload = action === "game_edit"
          ? { id, title: String(params.title || "").trim(), hidden: !!cur.hidden }
          : { id, title: cur.title || "", hidden: !!params.hidden };
        result = await call(gamePost, "/api/admin/game", "POST", payload);
        summary = action === "game_edit" ? (result.title ? "Renamed " + id + " to " + result.title + "." : "Name of " + id + " reset.") : (result.hidden ? id + " is hidden." : id + " is visible.");
        break;
      }
      case "stats": {
        const o = await call(overviewGet, "/api/admin/overview", "GET");
        result = { users: o.users, admins: o.admins, banned: o.banned, newDay: o.newDay, newWeek: o.newWeek, sessions: o.sessions, chatTotal: o.chatTotal, chatDay: o.chatDay };
        summary = `${o.users} accounts (${o.admins} admins, ${o.banned} suspended) · ${o.newDay} new in 24h, ${o.newWeek} in 7 days · ${o.sessions} active sessions · ${o.chatTotal} chat messages (${o.chatDay} in 24h)`;
        break;
      }
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    await logAdminAI(env, admin.username, action, params, false, msg);
    return json({ error: msg }, 400);
  }
  await logAdminAI(env, admin.username, action, params, true, summary);
  return json({ ok: true, action, summary, result });
}
