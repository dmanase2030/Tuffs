/* Lumio Chat API router: /api/lc/*
 *  GET  state[?sid=]          everything the app needs for your servers (or one server)
 *  GET  poll?c=&v=&f=          changed messages + typing in one channel; f=1 adds unread/mention/server versions
 *  GET  msgs?c=&before=        message history (50 at a time)
 *  GET  invite/<code>          public invite card (no sign-in needed)
 *  GET  explore                public servers
 *  GET  user?u=  users?k=a,b   profiles
 *  GET  img/<id>               an uploaded image (public, immutable)
 *  GET  reports?sid=           open reports for moderators (Manage Messages)
 *  POST act {op,...}           every change (see _ops.js)
 *  POST upload?kind=avatar|banner|icon|attach[&sid=]   raw image bytes
 *  GET  shop                   Shop catalog + your Orbs, items, equipped slots and daily quests
 *  GET  admin/servers, admin/reports, admin/shop;  POST admin/act, admin/shop   site admins only
 */
import { json, guard, sessionUser, bearer, readBody, sha256hex } from "../auth/_shared.js";
import { throttleCheck, throttleFail, clientIp } from "../auth/_throttle.js";
import {
  BOT, BOT_USER, LUMIO, ensure, err, inList, loadCtx, can, permsOf, usersByKeys, userByName, shapeUser,
  sniff, storeImage, dropImage, serveImage, IMG_CAPS, CODE_RE,
} from "./_db.js";
import { runOp, access, deleteMsg, deleteServerRows } from "./_ops.js";
import { shopState, shopAdmin } from "./_shop.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = (Array.isArray(params.path) ? params.path : [params.path || ""]).filter(Boolean);
  const route = path.join("/"), method = request.method;
  if (!env.DB) return err("Chat isn't set up yet.", 503);
  const db = env.DB;
  await ensure(db);

  // public routes
  if (method === "GET" && path[0] === "img") return serveImage(context, path[1]);
  if (method === "GET" && path[0] === "invite") return inviteCard(context, path[1]);

  const blocked = guard(request, env); if (blocked) return blocked;
  const user = await sessionUser(request, env);
  if (!user) {
    const why = await whyNoUser(request, env);
    return why === "banned" ? err("Your Lumio account has been suspended.", 403, "banned") : err("Sign in to your Lumio account to use Chat.", 401, "signin");
  }
  const me = user.username_key;

  try {
    if (method === "GET" && route === "state") return json(await state(db, user, new URL(request.url).searchParams.get("sid")));
    if (method === "GET" && route === "poll") return json(await poll(db, user, new URL(request.url).searchParams));
    if (method === "GET" && route === "msgs") {
      const q = new URL(request.url).searchParams, c = q.get("c") || "";
      if (!(await access(db, me, c))) return err("You can't see this channel.", 403);
      return json(await history(db, c, Number(q.get("before")) || 0));
    }
    if (method === "GET" && route === "shop") return json(await shopState(db, user));
    if (method === "GET" && route === "search") return await search(db, me, new URL(request.url).searchParams);
    if (method === "GET" && route === "pins") {
      const c = new URL(request.url).searchParams.get("c") || "";
      if (!(await access(db, me, c))) return err("You can't see this channel.", 403);
      const rows = (await db.prepare("SELECT * FROM lc_msgs WHERE chan = ?1 AND pinned_at IS NOT NULL AND deleted = 0 ORDER BY pinned_at DESC LIMIT 50").bind(c).all()).results || [];
      return json({ c, ...(await shapeMsgs(db, rows)) });
    }
    if (method === "GET" && route === "explore") {
      const rows = (await db.prepare("SELECT s.id, s.name, s.color, s.icon, s.descr, (SELECT COUNT(*) FROM lc_members m WHERE m.server_id = s.id) AS members FROM lc_servers s WHERE s.public = 1 ORDER BY members DESC LIMIT 50").all()).results || [];
      return json({ servers: rows.map(r => ({ id: r.id, n: r.name, c: r.color, icon: r.icon || "", desc: r.descr || "", members: r.members })) });
    }
    if (method === "GET" && route === "user") {
      const u = await userByName(db, new URL(request.url).searchParams.get("u"));
      return u ? json({ user: u }) : err("No Lumio account with that username.", 404);
    }
    if (method === "GET" && route === "users") {
      const ks = String(new URL(request.url).searchParams.get("k") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 90);
      return json({ users: await usersByKeys(db, ks) });
    }
    if (method === "GET" && route === "reports") {
      const sid = new URL(request.url).searchParams.get("sid") || "";
      const c = await loadCtx(db, sid, [me]);
      if (!c || !c.members[me] || !can(c, "MANAGE_MESSAGES", me)) return err("You can't see reports for this server.", 403);
      return json(await reports(db, "WHERE r.server_id = ?1 AND r.status = 'open'", [sid]));
    }
    if (method === "POST" && route === "act") {
      const body = await readBody(request);
      return await runOp(context, user, body);
    }
    if (method === "POST" && route === "upload") return await upload(context, user);
    if (path[0] === "admin") {
      if (!user.is_admin) return err("Admins only.", 403);
      return await adminRoute(context, user, path[1], method);
    }
  } catch (e) {
    console.error("lc", route, e && e.stack || e);
    return err("Something went wrong. Try again.", 500);
  }
  return err("Not found.", 404);
}

async function whyNoUser(request, env) {
  const t = bearer(request);
  if (!t) return "signin";
  const row = await env.DB.prepare("SELECT u.is_banned FROM sessions s JOIN users u ON u.username_key = s.username_key WHERE s.token_hash = ?1").bind(await sha256hex(t)).first();
  return row && row.is_banned ? "banned" : "signin";
}

/* ---------- the app's snapshot ---------- */
async function state(db, user, only) {
  const me = user.username_key, now = Date.now();
  // Everyone is in the Lumio community unless banned from it.
  const lb = await db.prepare("SELECT 1 FROM lc_bans WHERE server_id = ?1 AND user_key = ?2").bind(LUMIO, me).first();
  if (!lb && !only) {
    const r = await db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(LUMIO, me, now).run();
    if (r.meta.changes) {
      const s = await db.prepare("SELECT welcome FROM lc_servers WHERE id = ?1").bind(LUMIO).first();
      const { sysMsg } = await import("./_db.js");
      if (s && s.welcome) await sysMsg(db, LUMIO, user.username + " joined the server. Welcome!");
    }
  }
  const mine = (await db.prepare("SELECT s.* FROM lc_servers s JOIN lc_members m ON m.server_id = s.id WHERE m.user_key = ?1 ORDER BY m.joined_at").bind(me).all()).results || [];
  const srvs = only ? mine.filter(s => s.id === only) : mine;
  const ids = srvs.map(s => s.id).slice(0, 90);
  const out = { me: me, siteAdmin: !!user.is_admin, servers: [], users: {}, now };
  if (ids.length) {
    const L = inList(ids.length);
    const [cats, chans, roles, mems, bans, invs, aud, reps] = await db.batch([
      db.prepare(`SELECT * FROM lc_cats WHERE server_id IN (${L}) ORDER BY pos, id`).bind(...ids),
      db.prepare(`SELECT id, server_id, cat_id, name, topic, pos, last_id, last_a, all_id, slow FROM lc_chans WHERE server_id IN (${L}) ORDER BY pos, id`).bind(...ids),
      db.prepare(`SELECT * FROM lc_roles WHERE server_id IN (${L}) ORDER BY pos, id`).bind(...ids),
      db.prepare(`SELECT m.* FROM lc_members m JOIN users u ON u.username_key = m.user_key WHERE m.server_id IN (${L}) AND u.is_banned = 0`).bind(...ids),
      db.prepare(`SELECT * FROM lc_bans WHERE server_id IN (${L}) ORDER BY ts DESC`).bind(...ids),
      db.prepare(`SELECT * FROM lc_invites WHERE server_id IN (${L}) ORDER BY created_at DESC`).bind(...ids),
      db.prepare(`SELECT * FROM (SELECT a.*, ROW_NUMBER() OVER (PARTITION BY server_id ORDER BY id DESC) AS rn FROM lc_audit a WHERE server_id IN (${L})) WHERE rn <= 100`).bind(...ids),
      db.prepare(`SELECT server_id, COUNT(*) AS n FROM lc_reports WHERE status = 'open' AND server_id IN (${L}) GROUP BY server_id`).bind(...ids),
    ]);
    const by = (res, k = "server_id") => { const m = {}; for (const r of res.results || []) (m[r[k]] = m[r[k]] || []).push(r); return m; };
    const C = by(cats), CH = by(chans), R = by(roles), M = by(mems), B = by(bans), IV = by(invs), A = by(aud), RP = by(reps);
    const keys = new Set([BOT]);
    for (const s of srvs) {
      const rl = (R[s.id] || []).map(r => ({ id: r.id === "@" + s.id ? "everyone" : r.id, n: r.name, color: r.color || "", perms: (r.perms || "").split(",").filter(Boolean), hoist: !!r.hoist }));
      const ei = rl.findIndex(r => r.id === "everyone"); if (ei > 0) rl.unshift(rl.splice(ei, 1)[0]); if (ei < 0) rl.unshift({ id: "everyone", n: "@everyone", color: "", perms: ["SEND", "REACT", "INVITE"], hoist: false });
      const members = {};
      for (const m of M[s.id] || []) { members[m.user_key] = { roles: (m.roles || "").split(",").filter(Boolean), nick: m.nick || "", joined: m.joined_at }; keys.add(m.user_key); }
      if (s.ai) members[BOT] = { roles: [], nick: "", joined: s.created_at, bot: true };
      const ctx = { srv: s, roles: rl.map(r => ({ ...r, id: r.id === "everyone" ? "@" + s.id : r.id })), members };
      const P = permsOf(ctx, me);
      const sv = {
        id: s.id, n: s.name, c: s.color || "#7c5cff", icon: s.icon || "", desc: s.descr || "", ownerId: s.owner_key, ver: s.ver, public: !!s.public,
        set: { pause: !!s.pause, welcome: !!s.welcome, ai: !!s.ai, automod: !!s.automod },
        cats: (C[s.id] || []).map(k => ({ id: k.id, n: k.name, col: false })),
        chans: (CH[s.id] || []).map(c => ({ id: c.id, n: c.name, cat: c.cat_id || null, topic: c.topic || "", last: c.last_id, lastA: c.last_a || "", all: c.all_id, slow: c.slow || 0 })),
        roles: rl, members,
        bans: P.has("BAN") ? (B[s.id] || []).map(b => ({ uid: b.user_key, reason: b.reason || "", ts: b.ts, by: b.by_key })) : [],
        invites: (IV[s.id] || []).filter(i => P.has("MANAGE_SERVER") || i.by_key === me).map(i => ({ code: i.code, by: i.by_key, uses: i.uses, max: i.max_uses, exp: i.expires_at, ts: i.created_at })),
        audit: P.has("AUDIT") ? (A[s.id] || []).reverse().map(a => ({ ts: a.ts, by: a.by_key, t: a.text })) : [],
        reports: P.has("MANAGE_MESSAGES") ? ((RP[s.id] || [])[0] || {}).n || 0 : 0,
      };
      for (const b of sv.bans) keys.add(b.uid);
      for (const a of sv.audit) keys.add(a.by);
      for (const i of sv.invites) keys.add(i.by);
      out.servers.push(sv);
    }
    out.users = await usersByKeys(db, [...keys]);
  }
  if (!only) {
    const [reads, dms] = await db.batch([
      db.prepare("SELECT chan, last_id FROM lc_reads WHERE user_key = ?1").bind(me),
      db.prepare("SELECT * FROM lc_dms WHERE a = ?1 OR b = ?1 ORDER BY last_ts DESC LIMIT 100").bind(me),
    ]);
    out.read = {}; for (const r of reads.results || []) out.read[r.chan] = r.last_id;
    out.dms = (dms.results || []).map(d => ({ k: d.chan, u: d.a === me ? d.b : d.a, last: d.last_id, lastA: d.last_a || "", ts: d.last_ts }));
    const extra = out.dms.map(d => d.u).filter(k => !out.users[k]);
    if (extra.length) Object.assign(out.users, await usersByKeys(db, extra));
    if (!out.users[me]) Object.assign(out.users, await usersByKeys(db, [me]));
    out.ment = await mentionCounts(db, me);
  }
  return out;
}

async function mentionCounts(db, me) {
  const res = await db.prepare("SELECT chan, COUNT(*) AS n FROM lc_mentions WHERE user_key = ?1 GROUP BY chan").bind(me).all();
  const o = {}; for (const r of res.results || []) o[r.chan] = r.n; return o;
}

/* ---------- messages ---------- */
async function shapeMsgs(db, rows) {
  const ids = rows.filter(r => !r.deleted).map(r => r.id);
  const rx = {}, quotes = {};
  if (ids.length) {
    const L = inList(ids.length);
    const reIds = [...new Set(rows.map(r => r.reply_to).filter(Boolean))];
    const st = [db.prepare(`SELECT msg_id, user_key, emoji FROM lc_reacts WHERE msg_id IN (${L}) ORDER BY ts`).bind(...ids)];
    if (reIds.length) st.push(db.prepare(`SELECT id, author_key, text, deleted, att FROM lc_msgs WHERE id IN (${inList(reIds.length)})`).bind(...reIds));
    const res = await db.batch(st);
    for (const r of res[0].results || []) { const m = rx[r.msg_id] = rx[r.msg_id] || {}; (m[r.emoji] = m[r.emoji] || []).push(r.user_key); }
    if (res[1]) for (const q of res[1].results || []) quotes[q.id] = q.deleted ? null : { a: q.author_key, m: String(q.text || "").slice(0, 200) || (q.att ? "Image" : "") };
  }
  const msgs = rows.map(r => r.deleted ? { id: r.id, del: 1, v: r.updated_at } : {
    id: r.id, ts: r.created_at, a: r.sys ? "" : r.author_key, m: r.text, sys: r.sys ? 1 : undefined, re: r.reply_to || undefined,
    rq: r.reply_to ? (quotes[r.reply_to] || null) : undefined, ed: r.edited_at || undefined, att: r.att || undefined, rx: rx[r.id] || {}, v: r.updated_at, pin: r.pinned_at || undefined,
  });
  const keys = new Set();
  for (const m of msgs) { if (m.a) keys.add(m.a); if (m.rq) keys.add(m.rq.a); for (const e in m.rx || {}) m.rx[e].forEach(k => keys.add(k)); }
  return { msgs, users: await usersByKeys(db, [...keys]) };
}
/* Search messages you're allowed to read: one channel/DM (c=) or every channel of a server you're in (sid=).
 * "from:username" narrows to one author. Plain LIKE matching with escaped wildcards; 25 newest hits per page. */
async function search(db, me, q) {
  let raw = String(q.get("q") || "").slice(0, 100).trim(), from = null;
  raw = raw.replace(/(^|\s)from:@?([\w.\-]{1,20})/i, (_, s, u) => { from = u.toLowerCase(); return s; }).trim();
  if (!raw && !from) return err("Type something to search for.");
  const before = Number(q.get("before")) || 0;
  let chans = [];
  const c = q.get("c"), sid = q.get("sid");
  if (sid) {
    const mem = await db.prepare("SELECT 1 FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(sid, me).first();
    if (!mem) return err("You can't search this server.", 403);
    chans = ((await db.prepare("SELECT id FROM lc_chans WHERE server_id = ?1").bind(sid).all()).results || []).map(r => r.id);
  } else if (c) {
    if (!(await access(db, me, c))) return err("You can't search this conversation.", 403);
    chans = [c];
  } else return err("Pick a server or conversation to search.");
  if (!chans.length) return json({ msgs: [], users: {}, more: false });
  chans = chans.slice(0, 90);
  const binds = [...chans], where = [`chan IN (${inList(chans.length)})`, "deleted = 0", "sys = 0"];
  if (raw) { binds.push("%" + raw.replace(/[\\%_]/g, m => "\\" + m) + "%"); where.push(`text LIKE ?${binds.length} ESCAPE '\\'`); }
  if (from) { binds.push(from); where.push(`author_key = ?${binds.length}`); }
  if (before) { binds.push(before); where.push(`id < ?${binds.length}`); }
  const rows = (await db.prepare(`SELECT * FROM lc_msgs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 26`).bind(...binds).all()).results || [];
  const more = rows.length > 25;
  const out = await shapeMsgs(db, rows.slice(0, 25));
  out.msgs.forEach((m, i) => { m.c = rows[i].chan; });
  return json({ ...out, more });
}

async function history(db, c, before) {
  const rows = ((await db.prepare(`SELECT * FROM lc_msgs WHERE chan = ?1 AND deleted = 0 ${before ? "AND id < ?2" : ""} ORDER BY id DESC LIMIT 50`).bind(...(before ? [c, before] : [c])).all()).results || []).reverse();
  const out = await shapeMsgs(db, rows);
  return { c, more: rows.length === 50, ...out };
}

async function poll(db, user, q) {
  const me = user.username_key, now = Date.now(), out = { now };
  const c = q.get("c") || "", v = Number(q.get("v")) || 0;
  if (c) {
    const a = await access(db, me, c);
    if (!a) out.gone = c;
    else {
      const [rows, typing] = await db.batch([
        db.prepare("SELECT * FROM lc_msgs WHERE chan = ?1 AND updated_at > ?2 ORDER BY id LIMIT 100").bind(c, v),
        db.prepare("SELECT user_key FROM lc_typing WHERE chan = ?1 AND ts > ?2 AND user_key <> ?3").bind(c, now - 7000, me),
      ]);
      if ((rows.results || []).length) Object.assign(out, await shapeMsgs(db, rows.results));
      out.typing = (typing.results || []).map(r => r.user_key);
    }
  }
  if (q.get("f") === "1") {
    const [chans, vers, dms] = await db.batch([
      db.prepare("SELECT c.id, c.last_id, c.last_a, c.all_id FROM lc_chans c JOIN lc_members m ON m.server_id = c.server_id AND m.user_key = ?1").bind(me),
      db.prepare("SELECT s.id, s.ver FROM lc_servers s JOIN lc_members m ON m.server_id = s.id AND m.user_key = ?1").bind(me),
      db.prepare("SELECT * FROM lc_dms WHERE a = ?1 OR b = ?1 ORDER BY last_ts DESC LIMIT 100").bind(me),
      db.prepare("INSERT INTO lc_presence (user_key, st, seen) VALUES (?1, 'online', ?2) ON CONFLICT(user_key) DO UPDATE SET seen = excluded.seen WHERE lc_presence.seen < ?2 - 60000").bind(me, now),
    ]);
    out.chans = (chans.results || []).map(r => [r.id, r.last_id, r.last_a || "", r.all_id]);
    out.vers = {}; for (const r of vers.results || []) out.vers[r.id] = r.ver;
    out.dms = (dms.results || []).map(d => ({ k: d.chan, u: d.a === me ? d.b : d.a, last: d.last_id, lastA: d.last_a || "", ts: d.last_ts }));
    out.ment = await mentionCounts(db, me);
    const sid = q.get("sid");
    if (sid) {
      const pres = await db.prepare("SELECT m.user_key, pr.st, pr.status, pr.seen FROM lc_members m LEFT JOIN lc_presence pr ON pr.user_key = m.user_key WHERE m.server_id = ?1 AND EXISTS (SELECT 1 FROM lc_members x WHERE x.server_id = ?1 AND x.user_key = ?2) LIMIT 500").bind(sid, me).all();
      out.pres = {}; for (const r of pres.results || []) out.pres[r.user_key] = [r.seen && now - r.seen < 150000 ? (r.st || "online") : "off", r.status || ""];
    }
  }
  return out;
}

/* ---------- invites (public card) ---------- */
async function inviteCard(context, code) {
  const { env, request } = context, db = env.DB;
  const bad = (reason) => json({ valid: false, reason }, 404);
  if (!CODE_RE.test(code || "")) return bad("invalid");
  const ip = "lcinv|" + clientIp(request);
  if (await throttleCheck(db, ip)) return json({ valid: false, reason: "rate" }, 429);
  const r = await db.prepare("SELECT i.*, s.name, s.color, s.icon, s.descr, s.pause, (SELECT COUNT(*) FROM lc_members m WHERE m.server_id = s.id) AS members, (SELECT COUNT(*) FROM lc_members m JOIN lc_presence p ON p.user_key = m.user_key WHERE m.server_id = s.id AND p.seen > ?2) AS online FROM lc_invites i JOIN lc_servers s ON s.id = i.server_id WHERE i.code = ?1").bind(code, Date.now() - 150000).first();
  if (!r) { await throttleFail(db, ip, 30, 600e3, 600e3); return bad("invalid"); }
  const now = Date.now();
  const reason = r.expires_at && r.expires_at < now ? "expired" : r.max_uses && r.uses >= r.max_uses ? "used" : r.pause ? "paused" : "";
  const inviter = await usersByKeys(db, [r.by_key]);
  return json({
    valid: !reason, reason, code, server: { id: r.server_id, n: r.name, c: r.color || "#7c5cff", icon: r.icon || "", desc: r.descr || "" },
    members: r.members, online: r.online, by: inviter[r.by_key] ? inviter[r.by_key].name : "", exp: r.expires_at, max: r.max_uses, uses: r.uses,
  });
}

/* ---------- uploads ---------- */
async function upload(context, user) {
  const { request, env } = context, db = env.DB, me = user.username_key;
  const q = new URL(request.url).searchParams, kind = q.get("kind") || "";
  if (!IMG_CAPS[kind]) return err("Unknown upload type.");
  const k = "lcup|" + me;
  if (await throttleCheck(db, k)) return err("You're uploading too fast. Try again in a few minutes.", 429, "rate");
  await throttleFail(db, k, 30, 600e3, 600e3);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > IMG_CAPS[kind] + 1024) return err(capMsg(kind), 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return err("Pick an image.");
  if (bytes.length > IMG_CAPS[kind]) return err(capMsg(kind), 413);
  const mime = sniff(bytes);
  if (!mime) return err("That file isn't a GIF, PNG, JPEG or WebP image.", 415);
  if (kind === "icon") {
    const sid = q.get("sid") || ""; const c = await loadCtx(db, sid, [me]);
    if (!c || !c.members[me] || !can(c, "MANAGE_SERVER", me)) return err("You can't change this server's icon.", 403);
    const id = await storeImage(db, me, kind, bytes, mime);
    await db.prepare("UPDATE lc_servers SET icon = ?1, ver = ver + 1 WHERE id = ?2").bind(id, sid).run();
    if (c.srv.icon) await dropImage(db, c.srv.icon);
    return json({ ok: true, id, mime });
  }
  const id = await storeImage(db, me, kind, bytes, mime);
  if (kind === "avatar" || kind === "banner") {
    const col = kind === "avatar" ? "avatar" : "banner";
    const old = await db.prepare(`SELECT ${col} AS v FROM profiles WHERE username_key = ?1`).bind(me).first();
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO profiles (username_key, updated_at) VALUES (?1, 0)").bind(me),
      db.prepare(`UPDATE profiles SET ${col} = ?1, updated_at = ?2 WHERE username_key = ?3`).bind(kind === "avatar" ? "img:" + id : id, Date.now(), me),
    ]);
    const prev = old && old.v ? String(old.v).replace(/^img:/, "") : "";
    if (prev && prev !== id && /^i[a-z0-9]+$/.test(prev)) await dropImage(db, prev);
  }
  return json({ ok: true, id, mime });
}
const capMsg = kind => `That image is too big. ${kind === "banner" || kind === "attach" ? "2 MB" : "1 MB"} max.`;

/* ---------- reports ---------- */
async function reports(db, where, binds) {
  const rows = (await db.prepare(`SELECT r.*, s.name AS sname, c.name AS cname FROM lc_reports r LEFT JOIN lc_servers s ON s.id = r.server_id LEFT JOIN lc_chans c ON c.id = r.chan ${where} ORDER BY r.id DESC LIMIT 100`).bind(...binds).all()).results || [];
  const users = await usersByKeys(db, rows.flatMap(r => [r.author_key, r.reporter_key]));
  return { reports: rows.map(r => ({ id: r.id, sid: r.server_id, server: r.sname || (r.server_id ? "(deleted server)" : "Direct message"), chan: r.cname || "", mid: r.msg_id, author: r.author_key, text: r.text, by: r.reporter_key, reason: r.reason, ai: !!r.ai, status: r.status, ts: r.ts })), users };
}

/* ---------- site admin ---------- */
export async function adminRoute(context, user, sub, method) {
  const { request, env } = context, db = env.DB;
  if (method === "GET" && sub === "servers") {
    const rows = (await db.prepare("SELECT s.id, s.name, s.color, s.icon, s.owner_key, s.public, s.created_at, (SELECT COUNT(*) FROM lc_members m WHERE m.server_id = s.id) AS members, (SELECT COUNT(*) FROM lc_msgs x WHERE x.server_id = s.id AND x.deleted = 0) AS msgs, (SELECT COUNT(*) FROM lc_reports r WHERE r.server_id = s.id AND r.status = 'open') AS reports FROM lc_servers s ORDER BY members DESC, s.created_at LIMIT 500").all()).results || [];
    const users = await usersByKeys(db, rows.map(r => r.owner_key));
    return json({ servers: rows.map(r => ({ id: r.id, n: r.name, c: r.color, icon: r.icon || "", owner: r.owner_key, ownerName: users[r.owner_key] ? users[r.owner_key].name : r.owner_key, public: !!r.public, members: r.members, msgs: r.msgs, reports: r.reports, ts: r.created_at })) });
  }
  if (method === "GET" && sub === "reports") {
    const all = new URL(request.url).searchParams.get("all") === "1";
    return json(await reports(db, all ? "" : "WHERE r.status = 'open'", []));
  }
  if (method === "POST" && sub === "act") return adminAct(context, user, await readBody(request));
  if (sub === "shop") return shopAdmin(context, user, method, method === "POST" ? await readBody(request) : {});
  return err("Not found.", 404);
}
export async function adminAct(context, user, body) {
  const db = context.env.DB, me = user.username_key;
  const { audit } = await import("./_db.js");
  switch (String(body.op || "")) {
    case "deleteServer": {
      const s = await db.prepare("SELECT * FROM lc_servers WHERE id = ?1").bind(String(body.sid || "")).first();
      if (!s) return err("No such server.", 404);
      if (s.id === LUMIO) return err("The Lumio community server can't be deleted.");
      await deleteServerRows(db, s);
      return json({ ok: true, summary: `Deleted server ${s.name}.` });
    }
    case "transferServer": {
      const s = await db.prepare("SELECT * FROM lc_servers WHERE id = ?1").bind(String(body.sid || "")).first();
      if (!s) return err("No such server.", 404);
      const to = await userByName(db, body.to);
      if (!to) return err("No Lumio account with that username.", 404);
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(s.id, to.id, Date.now()),
        db.prepare("DELETE FROM lc_bans WHERE server_id = ?1 AND user_key = ?2").bind(s.id, to.id),
        db.prepare("UPDATE lc_servers SET owner_key = ?1 WHERE id = ?2").bind(to.id, s.id),
      ]);
      await audit(db, s.id, me, `(site admin) transferred ownership to ${to.name}`);
      return json({ ok: true, summary: `${s.name} now belongs to ${to.user}.` });
    }
    case "deleteMessage": {
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0").bind(Number(body.mid) || 0).first();
      if (!m) return err("That message is already gone.", 404);
      await deleteMsg(db, m);
      await db.prepare("UPDATE lc_reports SET status = 'removed', resolved_by = ?1 WHERE msg_id = ?2 AND status = 'open'").bind(me, m.id).run();
      if (m.server_id) await audit(db, m.server_id, me, "(site admin) deleted a message");
      return json({ ok: true, summary: `Deleted message ${m.id}.` });
    }
    case "resolveReport": {
      const r = await db.prepare("SELECT * FROM lc_reports WHERE id = ?1").bind(Number(body.id) || 0).first();
      if (!r) return err("No such report.", 404);
      if (body.del && r.msg_id) { const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0").bind(r.msg_id).first(); if (m) await deleteMsg(db, m); }
      await db.prepare("UPDATE lc_reports SET status = ?1, resolved_by = ?2 WHERE id = ?3").bind(body.del ? "removed" : "dismissed", me, r.id).run();
      return json({ ok: true, summary: body.del ? `Removed the reported message (report ${r.id}).` : `Dismissed report ${r.id}.` });
    }
    case "serverBan": {
      const s = await db.prepare("SELECT * FROM lc_servers WHERE id = ?1 OR lower(name) = lower(?1) ORDER BY (id = ?1) DESC LIMIT 1").bind(String(body.sid || "")).first();
      if (!s) return err("No such server.", 404);
      const t = await userByName(db, body.username);
      if (!t) return err("No Lumio account with that username.", 404);
      if (t.id === s.owner_key) return err("That's the server owner. Transfer the server first.");
      await db.batch([
        db.prepare("DELETE FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(s.id, t.id),
        db.prepare("INSERT OR REPLACE INTO lc_bans (server_id, user_key, reason, by_key, ts) VALUES (?1, ?2, ?3, ?4, ?5)").bind(s.id, t.id, String(body.reason || "Banned by a site admin").slice(0, 200), me, Date.now()),
      ]);
      await audit(db, s.id, me, `(site admin) banned ${t.name}`);
      return json({ ok: true, summary: `${t.user} is banned from ${s.name}.` });
    }
  }
  return err("Unknown admin action.");
}
