import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";
import { logAdminAI } from "./_log.js";
import { allGames } from "./_site.js";
import { onRequestGet as overviewGet } from "../admin/overview.js";
import { onRequestGet as settingsGet, onRequestPost as settingsPost } from "../admin/settings.js";
import { onRequestPost as bannedPost } from "../admin/set-banned.js";
import { onRequestPost as gamePost } from "../admin/game.js";
import { onRequestPost as setAdminPost } from "../admin/set-admin.js";
import { onRequestPost as logoutPost } from "../admin/logout-user.js";
import { onRequestPost as resetPost } from "../admin/reset-link.js";
import { onRequestPost as deletePost } from "../admin/delete.js";
import { onRequestPost as chatClearPost } from "../admin/chat-clear.js";
import { onRequestPost as chatDeletePost } from "../admin/chat-delete.js";
import { onRequestGet as usersGet } from "../admin/users.js";
import { onRequest as lcHandler } from "../lc/[[path]].js";

/* POST /api/ai/admin-action { action, ...params }
 * Runs an admin action that Lumio AI prepared and the admin confirmed in the app.
 * Admin-only (checked here AND again by each /api/admin endpoint it calls).
 * Every attempt by an admin is written to the ai_admin_log table.
 * GET /api/ai/admin-action → the 30 most recent log rows (admins only). */

const ACTIONS = new Set(["announce", "settings", "ban", "unban", "game_add", "game_edit", "game_hide", "stats",
  "chat_servers", "chat_reports", "chat_resolve", "chat_delete_message", "chat_server_ban", "chat_transfer", "chat_delete_server",
  "grant_orbs", "shop_items", "shop_save_item", "set_admin", "logout_user", "reset_link", "delete_user", "users", "room_clear", "room_delete"]);

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
  // Lumio Chat admin routes, called with the admin's own session so /api/lc re-checks it.
  const lc = async (path, method, payload) => {
    const headers = { authorization: request.headers.get("authorization") || "", "content-type": "application/json" };
    const req = new Request(new URL("/api/lc/" + path, request.url), { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    const res = await lcHandler({ ...context, request: req, params: { path: path.split("?")[0].split("/") } });
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
      case "chat_servers": {
        const d = await lc("admin/servers", "GET");
        result = { servers: d.servers.slice(0, 50).map(x => ({ id: x.id, name: x.n, owner: x.owner, members: x.members, messages: x.msgs, reports: x.reports })) };
        summary = d.servers.length ? d.servers.slice(0, 15).map(x => `${x.n} (${x.id}) · owner ${x.owner} · ${x.members} members${x.reports ? " · " + x.reports + " open reports" : ""}`).join("\n") : "No chat servers yet.";
        break;
      }
      case "chat_reports": {
        const d = await lc("admin/reports", "GET");
        result = { reports: d.reports.slice(0, 30).map(r => ({ id: r.id, server: r.server, author: r.author, text: String(r.text || "").slice(0, 200), reason: r.reason, ai: r.ai, mid: r.mid })) };
        summary = d.reports.length ? d.reports.slice(0, 10).map(r => `#${r.id} in ${r.server}${r.chan ? " #" + r.chan : ""}: ${r.author}: "${String(r.text || "").slice(0, 80)}" (${r.ai ? "AI flag" : "reported"}: ${r.reason})`).join("\n") : "No open reports.";
        break;
      }
      case "chat_resolve": {
        const d = await lc("admin/act", "POST", { op: "resolveReport", id: Number(params.id) || 0, del: !!params.delete });
        result = d; summary = d.summary; break;
      }
      case "chat_delete_message": {
        const d = await lc("admin/act", "POST", { op: "deleteMessage", mid: Number(params.mid) || 0 });
        result = d; summary = d.summary; break;
      }
      case "chat_server_ban": {
        const d = await lc("admin/act", "POST", { op: "serverBan", sid: String(params.sid || ""), username: String(params.username || ""), reason: String(params.reason || "") });
        result = d; summary = d.summary; break;
      }
      case "chat_transfer": {
        const d = await lc("admin/act", "POST", { op: "transferServer", sid: String(params.sid || ""), to: String(params.to || "") });
        result = d; summary = d.summary; break;
      }
      case "chat_delete_server": {
        const d = await lc("admin/act", "POST", { op: "deleteServer", sid: String(params.sid || "") });
        result = d; summary = d.summary; break;
      }
      case "grant_orbs": {
        const n = Math.round(Number(params.n));
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100000) throw new Error("Amount must be between -100000 and 100000 (not 0).");
        const d = await lc("admin/shop", "POST", { op: "grantOrbs", username: String(params.username || ""), n });
        result = d; summary = d.summary; break;
      }
      case "shop_items": {
        const d = await lc("admin/shop", "GET");
        result = { items: (d.items || []).slice(0, 60).map(x => ({ id: x.id, cat: x.cat, n: x.n, p: x.p, on: x.on, owners: x.owners || 0 })), totals: d.totals };
        summary = (d.items || []).length + " shop items · " + ((d.totals && d.totals.wallets) || 0) + " wallets · " + ((d.totals && d.totals.orbs) || 0) + " Orbs in circulation";
        break;
      }
      case "shop_save_item": {
        const d = await lc("admin/shop", "POST", { op: "saveItem", id: params.id ? String(params.id) : undefined, cat: String(params.cat || ""), n: String(params.n || ""), d: String(params.d || ""), p: params.p, v: params.v || {}, on: params.on !== false });
        result = d; summary = d.summary; break;
      }
      case "set_admin": {
        result = await call(setAdminPost, "/api/admin/set-admin", "POST", { username: String(params.username || ""), isAdmin: !!params.admin });
        summary = result.username + (result.isAdmin ? " is now an admin." : " is no longer an admin.");
        break;
      }
      case "logout_user": {
        result = await call(logoutPost, "/api/admin/logout-user", "POST", { username: String(params.username || "") });
        summary = result.username + " was signed out (" + result.ended + " session" + (result.ended === 1 ? "" : "s") + " ended).";
        break;
      }
      case "reset_link": {
        result = await call(resetPost, "/api/admin/reset-link", "POST", { username: String(params.username || "") });
        summary = "Reset link for " + result.username + ": " + new URL(request.url).origin + result.path + " — works once, expires in 24 hours.";
        break;
      }
      case "delete_user": {
        result = await call(deletePost, "/api/admin/delete", "POST", { username: String(params.username || "") });
        summary = "Deleted account " + result.deleted + ".";
        break;
      }
      case "users": {
        const d = await call(usersGet, "/api/admin/users", "GET");
        const list = (d.users || []).slice(0, 50);
        result = { users: list.map(u => ({ username: u.username, admin: u.is_admin, banned: u.is_banned, sessions: u.sessions, messages: u.messages })) };
        summary = (d.users || []).length + " accounts" + (list.length ? ":\n" + list.slice(0, 20).map(u => u.username + (u.is_admin ? " · admin" : "") + (u.is_banned ? " · suspended" : "") + " · " + u.sessions + " sessions · " + u.messages + " messages").join("\n") : ".");
        break;
      }
      case "room_clear": {
        result = await call(chatClearPost, "/api/admin/chat-clear", "POST", { room: String(params.room || "") });
        summary = "Cleared " + result.cleared + " messages from " + result.room + ".";
        break;
      }
      case "room_delete": {
        result = await call(chatDeletePost, "/api/admin/chat-delete", "POST", { id: Number(params.id) || 0 });
        summary = "Deleted message #" + result.deleted + " from the rooms chat.";
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
