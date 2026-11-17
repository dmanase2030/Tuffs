/* Lumio Chat mutations. POST /api/lc/act { op, ... } lands here.
 * Each op re-checks the actor's permissions on the server (owner > roles by
 * position, Administrator, Manage Channels/Roles/Server/Messages, Kick/Ban,
 * Send Messages, Mention @everyone, Create Invite) before touching D1. */
import { throttleCheck, throttleFail, clientIp } from "../auth/_throttle.js";
import { getSettings } from "../auth/_shared.js";
import {
  BOT, LUMIO, PERMS, PAL, RCOL, MAX_TEXT, ID_RE, CODE_RE, err, cleanLine, cleanText, slug, dmKey, inList,
  loadCtx, permsOf, can, parseChanPerms, chanCan, isOwner, rank, above, roleEditable, roleAssignable, audit, bump, sysMsg, dropImage, userByName,
} from "./_db.js";
import { json } from "../auth/_shared.js";
import { shopOp, questBump, ownsSticker, STICKER_RE } from "./_shop.js";
const ROLE_FONTS = ["serif", "mono", "rounded", "condensed", "script", "wide", "pixel", "slab"];
import { botReply, automodCheck, summarize, wantsBot } from "./_ai.js";

const NOPE = "You don't have permission to do that.";
export const SLOW = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
const slowLabel = s => s < 60 ? s + "s" : s < 3600 ? s / 60 + "m" : s / 3600 + "h";
const ok = (extra = {}) => json({ ok: true, ...extra });
const name = async (db, k) => k === BOT ? "Lumio AI" : ((await db.prepare("SELECT COALESCE(p.display_name, u.username) AS n FROM users u LEFT JOIN profiles p ON p.username_key = u.username_key WHERE u.username_key = ?1").bind(k).first()) || {}).n || k;
const roleOf = (ctx, rid) => ctx.roles.find(r => r.id === (rid === "everyone" ? "@" + ctx.srv.id : rid));

/* channel access: returns { sid, ctx } for a server channel, { dm:[a,b] } for a DM, or null */
export async function access(db, me, chan, extraKeys = []) {
  if (typeof chan !== "string" || chan.length > 120) return null;
  if (chan.startsWith("dm:")) {
    const p = chan.slice(3).split("|");
    if (p.length !== 2 || !p.includes(me) || dmKey(p[0], p[1]) !== chan || p[0] === p[1]) return null;
    return { dm: p, other: p[0] === me ? p[1] : p[0] };
  }
  const ch = await db.prepare("SELECT c.id, c.server_id, c.name, c.perms FROM lc_chans c JOIN lc_members m ON m.server_id = c.server_id AND m.user_key = ?1 WHERE c.id = ?2").bind(me, chan).first();
  if (!ch) return null;
  const ctx = await loadCtx(db, ch.server_id, [me, ...extraKeys]);
  const cp = parseChanPerms(ch.perms);
  if (ctx && !chanCan(ctx, cp, "VIEW", me)) return null;
  return { sid: ch.server_id, chan: ch, ctx, cp };
}

export async function runOp(context, user, body) {
  const { env, request } = context;
  const db = env.DB, me = user.username_key, op = String(body.op || "");
  const S = async (keys = []) => { const sid = String(body.sid || ""); const c = await loadCtx(db, sid, [me, ...keys]); return c && c.members[me] ? c : null; };
  const now = Date.now();

  switch (op) {
    /* ---------- servers ---------- */
    case "createServer": {
      const id = String(body.id || ""), n = cleanLine(body.n, 40);
      if (!ID_RE.test(id) || !id.startsWith("s_")) return err("Bad server id.");
      if (!n) return err("Give your server a name.");
      const owned = await db.prepare("SELECT COUNT(*) AS n FROM lc_servers WHERE owner_key = ?1").bind(me).first();
      if (owned && owned.n >= 25) return err("You can own up to 25 servers.");
      const wait = await throttleCheck(db, "lcsrv|" + me);
      if (wait) return err("You're creating servers too fast. Try again later.", 429, "rate");
      await throttleFail(db, "lcsrv|" + me, 5, 3600e3, 3600e3);
      const tpl = Array.isArray(body.tpl) ? body.tpl.slice(0, 6) : [["Text Channels", ["general"]]];
      const st = [
        db.prepare("INSERT INTO lc_servers (id, name, color, owner_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, n, PAL.includes(body.c) ? body.c : PAL[0], me, now),
        db.prepare("INSERT INTO lc_roles (id, server_id, name, perms, pos) VALUES (?1, ?2, '@everyone', 'SEND,REACT,INVITE', 0)").bind("@" + id, id),
        db.prepare("INSERT INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(id, me, now),
        db.prepare("INSERT INTO lc_audit (server_id, by_key, text, ts) VALUES (?1, ?2, 'created the server', ?3)").bind(id, me, now),
      ];
      const ids = Array.isArray(body.ids) ? body.ids : [];
      let ci = 0, ki = 0;
      tpl.forEach((t, i) => {
        const kid = String((ids[ki++] || "")); if (!ID_RE.test(kid) || !kid.startsWith("k_")) return;
        st.push(db.prepare("INSERT INTO lc_cats (id, server_id, name, pos) VALUES (?1, ?2, ?3, ?4)").bind(kid, id, cleanLine(t[0], 32) || "Text Channels", i));
        (Array.isArray(t[1]) ? t[1].slice(0, 8) : []).forEach((cn, j) => {
          const cid = String(ids[ki++] || ""); if (!ID_RE.test(cid) || !cid.startsWith("c_")) return;
          st.push(db.prepare("INSERT INTO lc_chans (id, server_id, cat_id, name, pos, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(cid, id, kid, slug(cn) || "general", ci++, now));
        });
      });
      try { await db.batch(st); } catch (e) { return err("Couldn't create the server. Try again."); }
      return ok({ sid: id });
    }
    case "leaveServer": {
      const c = await S(); if (!c) return err(NOPE, 403);
      if (c.srv.id === LUMIO) return err("You can't leave the Lumio server.");
      if (isOwner(c, me)) return err("You own this server. Transfer ownership or delete it instead.");
      await db.prepare("DELETE FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(c.srv.id, me).run();
      await audit(db, c.srv.id, me, "left the server");
      return ok();
    }
    case "updateServer": {
      const c = await S(); if (!c || !can(c, "MANAGE_SERVER", me)) return err(NOPE, 403);
      const s = c.srv, set = {};
      if (body.n != null) { const n = cleanLine(body.n, 40); if (!n) return err("Server name can't be empty."); if (n !== s.name) set.name = n; }
      if (body.c != null && PAL.includes(body.c)) set.color = body.c;
      if (body.desc != null) set.descr = cleanLine(body.desc, 300);
      for (const k of ["welcome", "ai", "automod"]) if (body[k] != null) set[k] = body[k] ? 1 : 0;
      if (body.removeIcon && s.icon) { set.icon = null; await dropImage(db, s.icon); }
      const ks = Object.keys(set); if (!ks.length) return ok();
      await db.prepare(`UPDATE lc_servers SET ${ks.map((k, i) => k + " = ?" + (i + 2)).join(", ")}, ver = ver + 1 WHERE id = ?1`).bind(s.id, ...ks.map(k => set[k])).run();
      const notes = [];
      if (set.name) notes.push(`renamed the server to "${set.name}"`);
      if ("ai" in set) notes.push(set.ai ? "turned Lumio AI on" : "turned Lumio AI off");
      if ("automod" in set) notes.push(set.automod ? "turned AI auto-moderation on" : "turned AI auto-moderation off");
      if (set.icon === null) notes.push("removed the server icon");
      for (const t of notes) await audit(db, s.id, me, t);
      return ok();
    }
    case "deleteServer": {
      const c = await S(); if (!c || !isOwner(c, me)) return err("Only the server owner can delete the server.", 403);
      if (c.srv.id === LUMIO) return err("The Lumio community server can't be deleted.");
      await deleteServerRows(db, c.srv);
      return ok();
    }
    case "transferOwnership": {
      const t = String(body.to || ""); const c = await S([t]); if (!c || !isOwner(c, me)) return err("Only the server owner can transfer ownership.", 403);
      if (!c.members[t] || t === me || t === BOT) return err("Pick a member of this server.");
      await db.prepare("UPDATE lc_servers SET owner_key = ?1 WHERE id = ?2").bind(t, c.srv.id).run();
      await audit(db, c.srv.id, me, `transferred ownership to ${await name(db, t)}`);
      return ok();
    }
    /* ---------- categories / channels ---------- */
    case "createCategory": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const id = String(body.id || ""), n = cleanLine(body.n, 32); if (!ID_RE.test(id) || !id.startsWith("k_") || !n) return err("Give the category a name.");
      const cnt = await db.prepare("SELECT COUNT(*) AS n FROM lc_cats WHERE server_id = ?1").bind(c.srv.id).first();
      if (cnt.n >= 30) return err("A server can have up to 30 categories.");
      await db.prepare("INSERT INTO lc_cats (id, server_id, name, pos) VALUES (?1, ?2, ?3, ?4)").bind(id, c.srv.id, n, cnt.n).run();
      await audit(db, c.srv.id, me, "created category " + n); return ok();
    }
    case "renameCategory": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const n = cleanLine(body.n, 32); if (!n) return err("Give the category a name.");
      const r = await db.prepare("UPDATE lc_cats SET name = ?1 WHERE id = ?2 AND server_id = ?3").bind(n, String(body.kid), c.srv.id).run();
      if (!r.meta.changes) return err("That category is gone."); await audit(db, c.srv.id, me, "renamed category to " + n); return ok();
    }
    case "deleteCategory": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const k = await db.prepare("SELECT name FROM lc_cats WHERE id = ?1 AND server_id = ?2").bind(String(body.kid), c.srv.id).first(); if (!k) return err("That category is gone.");
      await db.batch([db.prepare("UPDATE lc_chans SET cat_id = NULL WHERE cat_id = ?1 AND server_id = ?2").bind(String(body.kid), c.srv.id), db.prepare("DELETE FROM lc_cats WHERE id = ?1").bind(String(body.kid))]);
      await audit(db, c.srv.id, me, "deleted category " + k.name); return ok();
    }
    case "orderCats": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const cur = (await db.prepare("SELECT id FROM lc_cats WHERE server_id = ?1").bind(c.srv.id).all()).results.map(r => r.id);
      const order = Array.isArray(body.order) ? body.order.map(String) : [];
      if (order.length !== cur.length || !cur.every(x => order.includes(x))) return err("The categories changed. Refresh and try again.", 409);
      await db.batch(order.map((id, i) => db.prepare("UPDATE lc_cats SET pos = ?1 WHERE id = ?2").bind(i, id)));
      await bump(db, c.srv.id); return ok();
    }
    case "createChannel": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const id = String(body.id || ""), n = slug(body.n); if (!ID_RE.test(id) || !id.startsWith("c_") || !n) return err("Give the channel a name.");
      const cnt = await db.prepare("SELECT COUNT(*) AS n FROM lc_chans WHERE server_id = ?1").bind(c.srv.id).first();
      if (cnt.n >= 100) return err("A server can have up to 100 channels.");
      let cat = body.cat ? String(body.cat) : null;
      if (cat && !(await db.prepare("SELECT 1 FROM lc_cats WHERE id = ?1 AND server_id = ?2").bind(cat, c.srv.id).first())) cat = null;
      await db.prepare("INSERT INTO lc_chans (id, server_id, cat_id, name, pos, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, c.srv.id, cat, n, Number.isInteger(body.pos) ? body.pos : 1000 + cnt.n, now).run();
      await audit(db, c.srv.id, me, "created #" + n); return ok();
    }
    case "updateChannel": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const ch = await db.prepare("SELECT * FROM lc_chans WHERE id = ?1 AND server_id = ?2").bind(String(body.cid), c.srv.id).first(); if (!ch) return err("That channel is gone.");
      const set = {};
      if (body.n != null) { const n = slug(body.n); if (!n) return err("Channel name can't be empty."); if (n !== ch.name) set.name = n; }
      if (body.topic != null) set.topic = cleanLine(body.topic, 200);
      if (body.slow != null) { const v = Number(body.slow); if (!SLOW.includes(v)) return err("Pick a slowmode from the list."); if (v !== (ch.slow || 0)) set.slow = v; }
      if (body.cat !== undefined) { let cat = body.cat ? String(body.cat) : null; if (cat && !(await db.prepare("SELECT 1 FROM lc_cats WHERE id = ?1 AND server_id = ?2").bind(cat, c.srv.id).first())) cat = null; set.cat_id = cat; }
      const ks = Object.keys(set); if (!ks.length) return ok();
      await db.prepare(`UPDATE lc_chans SET ${ks.map((k, i) => k + " = ?" + (i + 2)).join(", ")} WHERE id = ?1`).bind(ch.id, ...ks.map(k => set[k])).run();
      if (set.name) await audit(db, c.srv.id, me, `renamed #${ch.name} to #${set.name}`);
      else if (set.slow != null) await audit(db, c.srv.id, me, set.slow ? `set slowmode in #${ch.name} to ${slowLabel(set.slow)}` : `turned off slowmode in #${ch.name}`);
      else await bump(db, c.srv.id);
      return ok();
    }
    case "setChannelPerms": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const ch = await db.prepare("SELECT * FROM lc_chans WHERE id = ?1 AND server_id = ?2").bind(String(body.cid), c.srv.id).first(); if (!ch) return err("That channel is gone.");
      const raw = body.perms && typeof body.perms === "object" && !Array.isArray(body.perms) ? body.perms : {};
      const out = {};
      for (const [t, v] of Object.entries(raw).slice(0, 60)) {
        if (!v || typeof v !== "object") continue;
        let okT = t === "@" + c.srv.id || c.roles.some(r => r.id === t);
        if (!okT && t.startsWith("u:")) okT = !!(await db.prepare("SELECT 1 FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(c.srv.id, t.slice(2)).first());
        if (!okT) continue;
        const e = {};
        for (const k of ["VIEW", "SEND"]) if (v[k] === 0 || v[k] === 1) e[k] = v[k];
        if (Object.keys(e).length) out[t] = e;
      }
      await db.prepare("UPDATE lc_chans SET perms = ?2 WHERE id = ?1").bind(ch.id, JSON.stringify(out)).run();
      await audit(db, c.srv.id, me, "updated permissions for #" + ch.name);
      return ok();
    }
    case "deleteChannel": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const ch = await db.prepare("SELECT * FROM lc_chans WHERE id = ?1 AND server_id = ?2").bind(String(body.cid), c.srv.id).first(); if (!ch) return err("That channel is gone.");
      await db.batch([
        db.prepare("DELETE FROM lc_reacts WHERE msg_id IN (SELECT id FROM lc_msgs WHERE chan = ?1)").bind(ch.id),
        db.prepare("DELETE FROM lc_msgs WHERE chan = ?1").bind(ch.id),
        db.prepare("DELETE FROM lc_mentions WHERE chan = ?1").bind(ch.id),
        db.prepare("DELETE FROM lc_reads WHERE chan = ?1").bind(ch.id),
        db.prepare("DELETE FROM lc_chans WHERE id = ?1").bind(ch.id),
      ]);
      await audit(db, c.srv.id, me, "deleted #" + ch.name); return ok();
    }
    case "orderChans": {
      const c = await S(); if (!c || !can(c, "MANAGE_CHANNELS", me)) return err(NOPE, 403);
      const cur = (await db.prepare("SELECT id FROM lc_chans WHERE server_id = ?1").bind(c.srv.id).all()).results.map(r => r.id);
      const cats = new Set((await db.prepare("SELECT id FROM lc_cats WHERE server_id = ?1").bind(c.srv.id).all()).results.map(r => r.id));
      const order = Array.isArray(body.order) ? body.order : [];
      if (order.length !== cur.length || !cur.every(x => order.some(o => Array.isArray(o) && o[0] === x))) return err("The channels changed. Refresh and try again.", 409);
      await db.batch(order.map(([id, cat], i) => db.prepare("UPDATE lc_chans SET pos = ?1, cat_id = ?2 WHERE id = ?3").bind(i, cat && cats.has(cat) ? cat : null, id)));
      await bump(db, c.srv.id); return ok();
    }
    /* ---------- roles ---------- */
    case "createRole": {
      const c = await S(); if (!c || !can(c, "MANAGE_ROLES", me)) return err(NOPE, 403);
      const id = String(body.id || ""); if (!ID_RE.test(id) || !id.startsWith("r_")) return err("Bad role id.");
      if (c.roles.length >= 50) return err("A server can have up to 50 roles.");
      const n = cleanLine(body.n, 32) || "new role";
      const top = isOwner(c, me) ? c.roles.length : Math.max(1, rank(c, me));
      const list = [...c.roles]; list.splice(top, 0, { id });
      const st = [db.prepare("INSERT INTO lc_roles (id, server_id, name, perms, pos) VALUES (?1, ?2, ?3, '', 0)").bind(id, c.srv.id, n)];
      list.forEach((r, i) => st.push(db.prepare("UPDATE lc_roles SET pos = ?1 WHERE id = ?2").bind(i, r.id)));
      await db.batch(st); await audit(db, c.srv.id, me, "created role " + n); return ok();
    }
    case "updateRole": {
      const c = await S(); if (!c) return err(NOPE, 403);
      const r = roleOf(c, String(body.rid)); if (!r || !roleEditable(c, r, me)) return err("You can't edit roles at or above your highest role.", 403);
      const ev = r.id === "@" + c.srv.id, set = {};
      if (body.n != null && !ev) { const n = cleanLine(body.n, 32); if (n) set.name = n; }
      if (body.color != null && !ev) { if (!RCOL.includes(body.color)) return err("Pick one of the role colors."); set.color = body.color; }
      if (body.hoist != null && !ev) set.hoist = body.hoist ? 1 : 0;
      if (body.font != null && !ev) { const f = String(body.font); if (f === "" || ROLE_FONTS.includes(f) || /^custom:[A-Za-z0-9\s\-']{1,40}$/.test(f)) set.font = f; else return err("Pick one of the fonts."); }
      let note = "";
      if (Array.isArray(body.perm)) {
        const [k, on] = body.perm; if (!PERMS.includes(k)) return err("Unknown permission.");
        if (on && !can(c, k, me)) return err("You can't grant a permission you don't have.", 403);
        set.perms = (on ? [...new Set([...r.perms, k])] : r.perms.filter(x => x !== k)).join(",");
        note = `${on ? "granted" : "removed"} ${k} ${on ? "to" : "from"} ${r.n}`;
      }
      const ks = Object.keys(set); if (!ks.length) return ok();
      await db.prepare(`UPDATE lc_roles SET ${ks.map((k, i) => k + " = ?" + (i + 2)).join(", ")} WHERE id = ?1`).bind(r.id, ...ks.map(k => set[k])).run();
      if (note) await audit(db, c.srv.id, me, note); else if (set.name && set.name !== r.n) await audit(db, c.srv.id, me, `renamed role ${r.n} to ${set.name}`); else await bump(db, c.srv.id);
      return ok();
    }
    case "deleteRole": {
      const c = await S(); if (!c) return err(NOPE, 403);
      const r = roleOf(c, String(body.rid)); if (!r || r.id === "@" + c.srv.id || !roleEditable(c, r, me)) return err("You can't delete that role.", 403);
      const holders = (await db.prepare("SELECT user_key, roles FROM lc_members WHERE server_id = ?1 AND (',' || roles || ',') LIKE ?2").bind(c.srv.id, "%," + r.id + ",%").all()).results || [];
      await db.batch([db.prepare("DELETE FROM lc_roles WHERE id = ?1").bind(r.id), ...holders.map(m => db.prepare("UPDATE lc_members SET roles = ?1 WHERE server_id = ?2 AND user_key = ?3").bind(m.roles.split(",").filter(x => x && x !== r.id).join(","), c.srv.id, m.user_key))]);
      await audit(db, c.srv.id, me, "deleted role " + r.n); return ok();
    }
    case "moveRole": {
      const c = await S(); if (!c) return err(NOPE, 403);
      const i = c.roles.findIndex(x => x.id === String(body.rid)), j = i + (body.dir > 0 ? 1 : -1);
      if (i < 1 || j < 1 || j >= c.roles.length) return err("Can't move that role there.");
      const r = c.roles[i], o = c.roles[j];
      if (!roleEditable(c, r, me) || !roleEditable(c, o, me)) return err("You can only reorder roles below your highest role.", 403);
      await db.batch([db.prepare("UPDATE lc_roles SET pos = ?1 WHERE id = ?2").bind(j, r.id), db.prepare("UPDATE lc_roles SET pos = ?1 WHERE id = ?2").bind(i, o.id)]);
      await bump(db, c.srv.id); return ok();
    }
    case "assignRole": {
      const t = String(body.uid || ""); const c = await S([t]); if (!c) return err(NOPE, 403);
      const r = roleOf(c, String(body.rid)); if (!r || !c.members[t]) return err("That member or role is gone.");
      if (!roleAssignable(c, r, t, me)) return err(t === c.srv.owner_key ? "Nobody can change the server owner's roles." : "You can't manage that role for this member.", 403);
      const m = c.members[t], on = !!body.on;
      const roles = on ? [...new Set([...m.roles, r.id])] : m.roles.filter(x => x !== r.id);
      await db.prepare("UPDATE lc_members SET roles = ?1 WHERE server_id = ?2 AND user_key = ?3").bind(roles.join(","), c.srv.id, t).run();
      await audit(db, c.srv.id, me, `${on ? "gave" : "removed"} ${r.n} ${on ? "to" : "from"} ${await name(db, t)}`); return ok();
    }
    case "setNick": {
      const t = String(body.uid || me); const c = await S([t]); if (!c || !c.members[t]) return err(NOPE, 403);
      if (t !== me && !(can(c, "MANAGE_SERVER", me) && above(c, t, me))) return err(NOPE, 403);
      await db.prepare("UPDATE lc_members SET nick = ?1 WHERE server_id = ?2 AND user_key = ?3").bind(cleanLine(body.nick, 32) || null, c.srv.id, t).run();
      await bump(db, c.srv.id); return ok();
    }
    case "kick": case "ban": {
      const t = String(body.uid || ""); const c = await S([t]); const P = op === "kick" ? "KICK" : "BAN";
      if (!c || !can(c, P, me)) return err(NOPE, 403);
      if (op === "ban" && !c.members[t]) {
        // banning someone who already left is allowed for people with Ban Members (not the owner)
        if (t === c.srv.owner_key || t === me) return err("You can't ban that person.", 403);
        if (!(await db.prepare("SELECT 1 FROM users WHERE username_key = ?1").bind(t).first())) return err("No such user.");
      } else if (!above(c, t, me)) return err(t === c.srv.owner_key ? `Nobody can ${op} the server owner.` : `You can only ${op} members below your highest role.`, 403);
      const st = [db.prepare("DELETE FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(c.srv.id, t)];
      if (op === "ban") st.push(db.prepare("INSERT OR REPLACE INTO lc_bans (server_id, user_key, reason, by_key, ts) VALUES (?1, ?2, ?3, ?4, ?5)").bind(c.srv.id, t, cleanLine(body.reason, 200), me, now));
      await db.batch(st);
      await audit(db, c.srv.id, me, `${op === "kick" ? "kicked" : "banned"} ${await name(db, t)}`); return ok();
    }
    case "unban": {
      const c = await S(); if (!c || !can(c, "BAN", me)) return err(NOPE, 403);
      const t = String(body.uid || "");
      const r = await db.prepare("DELETE FROM lc_bans WHERE server_id = ?1 AND user_key = ?2").bind(c.srv.id, t).run();
      if (r.meta.changes) await audit(db, c.srv.id, me, "unbanned " + await name(db, t)); return ok();
    }
    /* ---------- invites ---------- */
    case "createInvite": {
      const c = await S(); if (!c || !can(c, "INVITE", me)) return err(NOPE, 403);
      if (c.srv.pause && !can(c, "MANAGE_SERVER", me)) return err("Invites are paused for this server.");
      const code = String(body.code || ""); if (!CODE_RE.test(code)) return err("Bad invite code.");
      const mins = Math.max(0, Math.min(Number(body.exp) || 0, 60 * 24 * 30)), max = Math.max(0, Math.min(Math.floor(Number(body.max) || 0), 1000));
      const cnt = await db.prepare("SELECT COUNT(*) AS n FROM lc_invites WHERE server_id = ?1").bind(c.srv.id).first();
      if (cnt.n >= 200) return err("This server has too many invites. Revoke some first.");
      try { await db.prepare("INSERT INTO lc_invites (code, server_id, by_key, max_uses, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(code, c.srv.id, me, max, mins ? now + mins * 60e3 : 0, now).run(); }
      catch { return err("That invite code is taken. Try again."); }
      await bump(db, c.srv.id);
      return ok({ invite: { code, by: me, uses: 0, max, exp: mins ? now + mins * 60e3 : 0, ts: now } });
    }
    case "revokeInvite": {
      const c = await S(); if (!c) return err(NOPE, 403);
      const inv = await db.prepare("SELECT * FROM lc_invites WHERE code = ?1 AND server_id = ?2").bind(String(body.code), c.srv.id).first();
      if (!inv) return ok();
      if (!can(c, "MANAGE_SERVER", me) && inv.by_key !== me) return err(NOPE, 403);
      await db.prepare("DELETE FROM lc_invites WHERE code = ?1").bind(inv.code).run();
      await audit(db, c.srv.id, me, "revoked invite " + inv.code); return ok();
    }
    case "setPause": {
      const c = await S(); if (!c || !can(c, "MANAGE_SERVER", me)) return err(NOPE, 403);
      await db.prepare("UPDATE lc_servers SET pause = ?1 WHERE id = ?2").bind(body.on ? 1 : 0, c.srv.id).run();
      await audit(db, c.srv.id, me, body.on ? "paused invites" : "resumed invites"); return ok();
    }
    case "join": {
      const code = String(body.code || "").trim();
      const bad = () => err("The invite is invalid or has expired.", 404, "invalid");
      if (!CODE_RE.test(code)) return bad();
      const inv = await db.prepare("SELECT i.*, s.pause, s.welcome, s.name FROM lc_invites i JOIN lc_servers s ON s.id = i.server_id WHERE i.code = ?1").bind(code).first();
      if (!inv) { await throttleFail(db, "lcinv|" + clientIp(request), 30, 600e3, 600e3); return bad(); }
      if (await db.prepare("SELECT 1 FROM lc_members WHERE server_id = ?1 AND user_key = ?2").bind(inv.server_id, me).first()) return ok({ sid: inv.server_id, already: true });
      if (await db.prepare("SELECT 1 FROM lc_bans WHERE server_id = ?1 AND user_key = ?2").bind(inv.server_id, me).first()) return err("You are banned from this server.", 403, "banned");
      if (inv.expires_at && inv.expires_at < now) return err("This invite has expired.", 410, "expired");
      if (inv.max_uses && inv.uses >= inv.max_uses) return err("This invite has reached its max uses.", 410, "used");
      if (inv.pause) return err("Invites are paused for this server.", 403, "paused");
      const n = await db.prepare("SELECT COUNT(*) AS n FROM lc_members WHERE user_key = ?1").bind(me).first();
      if (n.n >= 100) return err("You're in 100 servers. Leave one first.");
      // uses are counted atomically so max-uses can't be overshot by two joins at once
      const u = await db.prepare("UPDATE lc_invites SET uses = uses + 1 WHERE code = ?1 AND (max_uses = 0 OR uses < max_uses) AND (expires_at = 0 OR expires_at > ?2)").bind(code, now).run();
      if (!u.meta.changes) return err("This invite has reached its max uses.", 410, "used");
      await db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(inv.server_id, me, now).run();
      await audit(db, inv.server_id, me, "joined using invite " + code);
      if (inv.welcome) await sysMsg(db, inv.server_id, (await name(db, me)) + " joined the server. Welcome!");
      return ok({ sid: inv.server_id });
    }
    case "joinPublic": {
      const s = await db.prepare("SELECT * FROM lc_servers WHERE id = ?1 AND public = 1").bind(String(body.sid || "")).first();
      if (!s) return err("That server isn't public.", 404);
      if (await db.prepare("SELECT 1 FROM lc_bans WHERE server_id = ?1 AND user_key = ?2").bind(s.id, me).first()) return err("You are banned from this server.", 403, "banned");
      const r = await db.prepare("INSERT OR IGNORE INTO lc_members (server_id, user_key, roles, joined_at) VALUES (?1, ?2, '', ?3)").bind(s.id, me, now).run();
      if (r.meta.changes) { await audit(db, s.id, me, "joined the server"); if (s.welcome) await sysMsg(db, s.id, (await name(db, me)) + " joined the server. Welcome!"); }
      return ok({ sid: s.id });
    }
    /* ---------- messages ---------- */
    case "send": return sendMsg(context, user, body);
    case "edit": {
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0").bind(Number(body.mid) || 0).first();
      if (!m || !(await access(db, me, m.chan))) return err("That message is gone.", 404);
      if (m.author_key !== me) return err("You can only edit your own messages.", 403);
      const t = cleanText(body.text, MAX_TEXT); if (!t.trim()) return err("Message can't be empty.");
      if (STICKER_RE.test(t.trim()) && t !== m.text) return err("Stickers can't be edited in. Send a new message.");
      if (t !== m.text) await db.prepare("UPDATE lc_msgs SET text = ?1, edited_at = ?2, updated_at = ?2 WHERE id = ?3").bind(t, now, m.id).run();
      return ok({ ed: now });
    }
    case "del": {
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0").bind(Number(body.mid) || 0).first();
      if (!m) return ok();
      const a = await access(db, me, m.chan);
      const mod = a && a.ctx && can(a.ctx, "MANAGE_MESSAGES", me);
      if (!(a && m.author_key === me) && !mod && !user.is_admin) return err("You can only delete your own messages.", 403);
      await deleteMsg(db, m);
      if (m.author_key !== me && m.server_id) await audit(db, m.server_id, me, `deleted a message by ${await name(db, m.author_key)}`);
      return ok();
    }
    case "react": {
      const e = String(body.e || ""); if (!e || e.length > 16 || /[\s<>]/.test(e)) return err("Pick an emoji.");
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0 AND sys = 0").bind(Number(body.mid) || 0).first();
      const a = m && await access(db, me, m.chan); if (!a) return err("That message is gone.", 404);
      const has = await db.prepare("SELECT 1 FROM lc_reacts WHERE msg_id = ?1 AND user_key = ?2 AND emoji = ?3").bind(m.id, me, e).first();
      if (!has) {
        if (a.ctx) { const any = await db.prepare("SELECT 1 FROM lc_reacts WHERE msg_id = ?1 AND emoji = ?2").bind(m.id, e).first(); if (!any && !can(a.ctx, "REACT", me)) return err("You don't have permission to add new reactions.", 403); }
        const cnt = await db.prepare("SELECT COUNT(DISTINCT emoji) AS n FROM lc_reacts WHERE msg_id = ?1").bind(m.id).first(); if (cnt.n >= 20) return err("That message has enough reactions.");
      }
      await db.batch([
        has ? db.prepare("DELETE FROM lc_reacts WHERE msg_id = ?1 AND user_key = ?2 AND emoji = ?3").bind(m.id, me, e) : db.prepare("INSERT INTO lc_reacts (msg_id, user_key, emoji, ts) VALUES (?1, ?2, ?3, ?4)").bind(m.id, me, e, now),
        db.prepare("UPDATE lc_msgs SET updated_at = ?1 WHERE id = ?2").bind(now, m.id),
        ...(has || m.author_key === me ? [] : [questBump(db, me, "react")]),
      ]);
      return ok({ on: !has });
    }
    case "pin": {
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0 AND sys = 0").bind(Number(body.mid) || 0).first();
      const a = m && await access(db, me, m.chan); if (!a) return err("That message is gone.", 404);
      if (a.ctx && !can(a.ctx, "MANAGE_MESSAGES", me)) return err("You need Manage Messages to pin or unpin.", 403);
      const on = !!body.on;
      if (on && !m.pinned_at) {
        const n = await db.prepare("SELECT COUNT(*) AS n FROM lc_msgs WHERE chan = ?1 AND pinned_at IS NOT NULL AND deleted = 0").bind(m.chan).first();
        if (n.n >= 50) return err("This channel already has 50 pins. Unpin one first.");
      }
      if (on === !!m.pinned_at) return ok({ pin: on });
      await db.prepare("UPDATE lc_msgs SET pinned_at = ?1, pinned_by = ?2, updated_at = ?3 WHERE id = ?4").bind(on ? now : null, on ? me : null, now, m.id).run();
      if (a.sid) await audit(db, a.sid, me, `${on ? "pinned" : "unpinned"} a message in #${a.chan.name}`);
      return ok({ pin: on });
    }
    case "read": {
      const ch = String(body.c || ""), id = Math.max(0, Number(body.id) || 0);
      if (!(await access(db, me, ch))) return ok();
      await db.batch([
        db.prepare("INSERT INTO lc_reads (user_key, chan, last_id) VALUES (?1, ?2, ?3) ON CONFLICT(user_key, chan) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)").bind(me, ch, id),
        db.prepare("DELETE FROM lc_mentions WHERE user_key = ?1 AND chan = ?2 AND msg_id <= ?3").bind(me, ch, id),
      ]);
      return ok();
    }
    case "typing": {
      const ch = String(body.c || ""); const a = await access(db, me, ch); if (!a) return ok();
      await db.prepare("INSERT INTO lc_typing (chan, user_key, ts) VALUES (?1, ?2, ?3) ON CONFLICT(chan, user_key) DO UPDATE SET ts = excluded.ts").bind(ch, me, now).run();
      return ok();
    }
    case "report": {
      const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0 AND sys = 0").bind(Number(body.mid) || 0).first();
      if (!m || !(await access(db, me, m.chan))) return err("That message is gone.", 404);
      if (m.author_key === me) return err("You can't report your own message.");
      const wait = await throttleCheck(db, "lcrep|" + me); if (wait) return err("You've sent a lot of reports. Try again later.", 429, "rate");
      await throttleFail(db, "lcrep|" + me, 10, 600e3, 600e3);
      if (await db.prepare("SELECT 1 FROM lc_reports WHERE msg_id = ?1 AND reporter_key = ?2").bind(m.id, me).first()) return ok({ dup: true });
      await db.prepare("INSERT INTO lc_reports (server_id, msg_id, chan, author_key, text, reporter_key, reason, ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)").bind(m.server_id, m.id, m.chan, m.author_key, m.text.slice(0, 2000), me, cleanLine(body.reason, 200) || "No reason given", now).run();
      return ok();
    }
    case "resolveReport": {
      const r = await db.prepare("SELECT * FROM lc_reports WHERE id = ?1").bind(Number(body.id) || 0).first(); if (!r) return err("That report is gone.", 404);
      let allowed = !!user.is_admin;
      if (!allowed && r.server_id) { const c = await loadCtx(db, r.server_id, [me]); allowed = !!c && c.members[me] && can(c, "MANAGE_MESSAGES", me); }
      if (!allowed) return err(NOPE, 403);
      if (body.del && r.msg_id) { const m = await db.prepare("SELECT * FROM lc_msgs WHERE id = ?1 AND deleted = 0").bind(r.msg_id).first(); if (m) { await deleteMsg(db, m); if (m.server_id) await audit(db, m.server_id, me, `deleted a reported message by ${await name(db, m.author_key)}`); } }
      await db.prepare("UPDATE lc_reports SET status = ?1, resolved_by = ?2 WHERE id = ?3 OR (msg_id = ?4 AND status = 'open' AND ?5 = 1)").bind(body.del ? "removed" : "dismissed", me, r.id, r.msg_id || -1, body.del ? 1 : 0).run();
      return ok();
    }
    case "summarize": {
      const a = await access(db, me, String(body.c || ""));
      if (!a || !a.ctx || !can(a.ctx, "MANAGE_SERVER", me)) return err("Only the server owner and people who can manage the server can summarize a channel.", 403);
      return summarize(context, user, a);
    }
    /* ---------- me ---------- */
    case "status": {
      const st = ["online", "idle", "dnd", "off"].includes(body.st) ? body.st : null;
      const status = body.listen != null ? cleanLine(body.listen, 60) : null;
      await db.prepare("INSERT INTO lc_presence (user_key, st, status, seen) VALUES (?1, COALESCE(?2, 'online'), ?3, ?4) ON CONFLICT(user_key) DO UPDATE SET st = COALESCE(?2, st), status = CASE WHEN ?5 = 1 THEN ?3 ELSE status END, seen = ?4").bind(me, st, status, now, body.listen != null ? 1 : 0).run();
      return ok();
    }
  }
  if (op.startsWith("shop")) { const r = await shopOp(context, user, body); if (r) return r; }
  return err("Unknown action.");
}

export async function deleteMsg(db, m) {
  await db.batch([
    db.prepare("UPDATE lc_msgs SET deleted = 1, text = '', att = NULL, updated_at = ?1 WHERE id = ?2").bind(Date.now(), m.id),
    db.prepare("DELETE FROM lc_reacts WHERE msg_id = ?1").bind(m.id),
    db.prepare("DELETE FROM lc_mentions WHERE msg_id = ?1").bind(m.id),
  ]);
  if (m.att) await dropImage(db, m.att);
}

export async function deleteServerRows(db, srv) {
  const sid = srv.id;
  const imgs = (await db.prepare("SELECT att FROM lc_msgs WHERE server_id = ?1 AND att IS NOT NULL").bind(sid).all()).results || [];
  await db.batch([
    db.prepare("DELETE FROM lc_reacts WHERE msg_id IN (SELECT id FROM lc_msgs WHERE server_id = ?1)").bind(sid),
    db.prepare("DELETE FROM lc_mentions WHERE chan IN (SELECT id FROM lc_chans WHERE server_id = ?1)").bind(sid),
    db.prepare("DELETE FROM lc_reads WHERE chan IN (SELECT id FROM lc_chans WHERE server_id = ?1)").bind(sid),
    db.prepare("DELETE FROM lc_msgs WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_chans WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_cats WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_roles WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_members WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_bans WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_invites WHERE server_id = ?1").bind(sid),
    db.prepare("DELETE FROM lc_audit WHERE server_id = ?1").bind(sid),
    db.prepare("UPDATE lc_reports SET status = 'removed' WHERE server_id = ?1 AND status = 'open'").bind(sid),
    db.prepare("DELETE FROM lc_servers WHERE id = ?1").bind(sid),
  ]);
  for (const r of imgs) await dropImage(db, r.att);
  if (srv.icon) await dropImage(db, srv.icon);
}

/* ---------- sending ---------- */
const SEND_MAX = 8, SEND_WINDOW = 10e3, SEND_LOCK = 20e3;
async function sendMsg(context, user, body) {
  const { env, request } = context;
  const db = env.DB, me = user.username_key, now = Date.now();
  const chan = String(body.c || "");
  const settings = await getSettings(db);
  if (!settings.chatEnabled && !user.is_admin) return err("Chat is turned off right now.", 403, "off");
  const text = cleanText(body.text, MAX_TEXT + 1);
  if (text.length > MAX_TEXT) return err(`Messages are up to ${MAX_TEXT} characters.`);
  let att = body.att ? String(body.att) : null;
  if (!text.trim() && !att) return err("Message can't be empty.");
  const stk = STICKER_RE.exec(text.trim());
  if (/\[\[sticker:/.test(text) && (!stk || att)) return err("Send a sticker on its own.");
  const a = await access(db, me, chan);
  if (!a) return err("You can't send messages here.", 403);
  if (a.ctx && !can(a.ctx, "SEND", me)) return err("You don't have permission to send messages in this channel.", 403);
  if (a.ctx && a.cp && !chanCan(a.ctx, a.cp, "SEND", me)) return err("You can't send messages in this channel.", 403);
  if (a.ctx) {
    // slowmode: one message per N seconds, except for people who manage the channel or its messages
    const slow = ((await db.prepare("SELECT slow FROM lc_chans WHERE id = ?1").bind(chan).first()) || {}).slow || 0;
    if (slow && !can(a.ctx, "MANAGE_CHANNELS", me) && !can(a.ctx, "MANAGE_MESSAGES", me)) {
      const last = await db.prepare("SELECT created_at FROM lc_msgs WHERE chan = ?1 AND author_key = ?2 AND sys = 0 ORDER BY id DESC LIMIT 1").bind(chan, me).first();
      const left = last ? Math.ceil((last.created_at + slow * 1000 - now) / 1000) : 0;
      if (left > 0) return json({ error: `Slowmode is on. You can send another message in ${left} s.`, code: "slow", wait: left }, 429);
    }
  }
  if (a.dm) {
    const o = await db.prepare("SELECT is_banned FROM users WHERE username_key = ?1").bind(a.other).first();
    if (!o || o.is_banned) return err("You can't message this person.", 403);
  }
  const k1 = "lcmsg|" + me, k2 = "lcmsg-ip|" + clientIp(request);
  const wait = Math.max(await throttleCheck(db, k1), await throttleCheck(db, k2));
  if (wait) return err(`You're sending messages too fast. Wait ${wait} s.`, 429, "rate");
  await throttleFail(db, k1, SEND_MAX, SEND_WINDOW, SEND_LOCK);
  await throttleFail(db, k2, SEND_MAX * 3, SEND_WINDOW, SEND_LOCK);
  if (stk && !(await ownsSticker(db, me, stk[1]))) return err("Get that sticker pack in the Shop first.", 403, "sticker");
  if (att) {
    const img = await db.prepare("SELECT 1 FROM lc_images WHERE id = ?1 AND owner_key = ?2 AND kind = 'attach'").bind(att, me).first();
    if (!img) return err("That image couldn't be attached. Try adding it again.", 400, "att");
  }
  let re = Number(body.re) || null;
  let reAuthor = null;
  if (re) { const o = await db.prepare("SELECT author_key FROM lc_msgs WHERE id = ?1 AND chan = ?2 AND deleted = 0").bind(re, chan).first(); if (o) reAuthor = o.author_key; else re = null; }
  const r = await db.prepare("INSERT INTO lc_msgs (chan, server_id, author_key, text, reply_to, att, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)").bind(chan, a.sid || null, me, text, re, att, now).run();
  const id = r.meta.last_row_id;
  const st = [];
  // mentions: @username of members (or the DM partner), the replied-to author, and @everyone/@here with permission
  const targets = new Set();
  const lower = text.toLowerCase();
  for (const mm of lower.matchAll(/(^|[^\w])@([\w.\-]{3,20})/g)) targets.add(mm[2]);
  if (reAuthor) targets.add(reAuthor);
  targets.delete(me); targets.delete(BOT);
  let everyone = /(^|\s)@(everyone|here)\b/.test(lower) && a.ctx && can(a.ctx, "MENTION_EVERYONE", me);
  if (a.dm) { st.push(db.prepare("INSERT INTO lc_mentions (user_key, msg_id, chan) VALUES (?1, ?2, ?3)").bind(a.other, id, chan)); }
  else if (targets.size) {
    const list = [...targets].slice(0, 20);
    const mem = await db.prepare(`SELECT user_key FROM lc_members WHERE server_id = ?1 AND user_key IN (${list.map((_, i) => "?" + (i + 2)).join(",")})`).bind(a.sid, ...list).all();
    for (const row of mem.results || []) st.push(db.prepare("INSERT OR IGNORE INTO lc_mentions (user_key, msg_id, chan) VALUES (?1, ?2, ?3)").bind(row.user_key, id, chan));
  }
  if (a.dm) st.push(db.prepare("INSERT INTO lc_dms (chan, a, b, last_id, last_a, last_ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(chan) DO UPDATE SET last_id = excluded.last_id, last_a = excluded.last_a, last_ts = excluded.last_ts").bind(chan, a.dm[0], a.dm[1], id, me, now));
  else st.push(db.prepare(`UPDATE lc_chans SET last_id = ?1, last_a = ?2${everyone ? ", all_id = ?1" : ""} WHERE id = ?3`).bind(id, me, chan));
  st.push(db.prepare("INSERT INTO lc_reads (user_key, chan, last_id) VALUES (?1, ?2, ?3) ON CONFLICT(user_key, chan) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)").bind(me, chan, id));
  st.push(db.prepare("DELETE FROM lc_typing WHERE chan = ?1 AND user_key = ?2").bind(chan, me));
  st.push(questBump(db, me, "msgs"));
  if (re && reAuthor !== me) st.push(questBump(db, me, "reply"));
  await db.batch(st);
  const msg = { id, ts: now, a: me, m: text, re: re || undefined, att: att || undefined, rx: {} };
  let aiLimited = false;
  if (a.ctx && a.ctx.srv.ai && wantsBot(text)) {
    const k = "lcai|" + me, ks = "lcai-s|" + a.sid;
    const w = Math.max(await throttleCheck(db, k), await throttleCheck(db, ks));
    if (w) aiLimited = true;
    else {
      await throttleFail(db, k, 6, 600e3, 600e3);
      await throttleFail(db, ks, 40, 3600e3, 600e3);
      context.waitUntil(botReply(env, a, msg, user).catch(e => console.error("lc bot", e)));
    }
  }
  if (a.ctx && a.ctx.srv.automod && text.trim()) context.waitUntil(automodCheck(env, a, msg).catch(e => console.error("lc automod", e)));
  return ok({ message: msg, aiLimited });
}
