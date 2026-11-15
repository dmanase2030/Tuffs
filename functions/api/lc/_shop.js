/* Lumio Shop: Orbs wallet, daily quests, buying and equipping cosmetics.
 * Every balance change is one D1 batch (a transaction): the wallet update is
 * conditional (enough Orbs, not owned yet / quest done and unclaimed) and the
 * following rows only go in when it changed (changes() = 1), so a double tap
 * or two tabs can't buy twice or claim twice. Prices always come from D1. */
import { json } from "../auth/_shared.js";
import { err } from "./_db.js";
import { CATS, SEED, QUESTS, WELCOME_ORBS, dayKey, cleanItemData, STICKERS } from "./_catalog.js";

let SEEDED = false;
export async function seedShop(db) {
  if (SEEDED) return;
  const now = Date.now();
  await db.batch(SEED.map((it, i) => db.prepare("INSERT OR IGNORE INTO lc_items (id, cat, name, descr, price, data, active, pos, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?8)")
    .bind(it.id, it.cat, it.name, it.desc, it.price, JSON.stringify(it.data), i, now)));
  SEEDED = true;
}

const shapeItem = (r, now, admin) => {
  let data = {}; try { data = JSON.parse(r.data); } catch { /* bad row */ }
  const o = { id: r.id, cat: r.cat, n: r.name, d: r.descr || "", p: r.price, v: data, on: !!r.active };
  if (r.start_at) o.from = r.start_at;
  if (r.end_at) o.until = r.end_at;
  o.buy = !!r.active && (!r.start_at || r.start_at <= now) && (!r.end_at || r.end_at > now);
  if (admin) { o.pos = r.pos; o.owners = r.owners || 0; }
  return o;
};

export async function wallet(db, me) {
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO lc_wallet (user_key, orbs, earned, spent, created_at) VALUES (?1, ?2, ?2, 0, ?3)").bind(me, WELCOME_ORBS, now),
    db.prepare("INSERT INTO lc_ledger (user_key, delta, reason, ts) SELECT ?1, ?2, 'welcome', ?3 WHERE changes() = 1").bind(me, WELCOME_ORBS, now),
  ]);
  return db.prepare("SELECT orbs, earned, spent FROM lc_wallet WHERE user_key = ?1").bind(me).first();
}

/* Statement that counts one step of a daily quest (added to the caller's batch). */
export const questBump = (db, me, q) => db.prepare("INSERT INTO lc_quests (user_key, day, q, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(user_key, day, q) DO UPDATE SET n = n + 1").bind(me, dayKey(), q);

async function quests(db, me) {
  const day = dayKey();
  const rows = (await db.prepare("SELECT q, n, claimed FROM lc_quests WHERE user_key = ?1 AND day = ?2").bind(me, day).all()).results || [];
  const m = Object.fromEntries(rows.map(r => [r.q, r]));
  const next = Date.parse(day + "T00:00:00Z") + 864e5;
  return { day, resets: next, list: QUESTS.map(q => ({ id: q.id, n: q.n, goal: q.goal, reward: q.reward, done: q.id === "daily" ? 1 : Math.min(q.goal, (m[q.id] && m[q.id].n) || 0), claimed: !!(m[q.id] && m[q.id].claimed) })) };
}

export async function shopState(db, user) {
  const me = user.username_key, now = Date.now();
  await seedShop(db);
  const w = await wallet(db, me);
  const [items, owned, eq] = await db.batch([
    db.prepare("SELECT * FROM lc_items ORDER BY cat, pos, created_at"),
    db.prepare("SELECT item_id, ts FROM lc_owned WHERE user_key = ?1").bind(me),
    db.prepare("SELECT slot, item_id FROM lc_equip WHERE user_key = ?1").bind(me),
  ]);
  return {
    cats: Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, v.n])),
    items: (items.results || []).map(r => shapeItem(r, now, false)),
    owned: Object.fromEntries((owned.results || []).map(r => [r.item_id, r.ts])),
    eq: Object.fromEntries((eq.results || []).map(r => [r.slot, r.item_id])),
    wallet: { orbs: w.orbs, earned: w.earned, spent: w.spent },
    quests: await quests(db, me),
    now,
  };
}

/* Is this exact sticker in a pack the user owns? */
export async function ownsSticker(db, me, id) {
  if (!STICKERS.includes(id)) return false;
  const rows = (await db.prepare("SELECT i.data FROM lc_owned o JOIN lc_items i ON i.id = o.item_id WHERE o.user_key = ?1 AND i.cat = 'stickers'").bind(me).all()).results || [];
  return rows.some(r => { try { return (JSON.parse(r.data).s || []).includes(id); } catch { return false; } });
}
export const STICKER_RE = /^\[\[sticker:([a-z]{2,12})\]\]$/;

export async function shopOp(context, user, body) {
  const db = context.env.DB, me = user.username_key, now = Date.now();
  await seedShop(db);
  switch (String(body.op || "")) {
    case "shopBuy": {
      const it = await db.prepare("SELECT * FROM lc_items WHERE id = ?1").bind(String(body.item || "")).first();
      if (!it) return err("That item isn't in the shop.", 404);
      if (!it.active || (it.start_at && it.start_at > now) || (it.end_at && it.end_at <= now)) return err("That item isn't available right now.", 409);
      const w = await wallet(db, me);
      const have = await db.prepare("SELECT 1 FROM lc_owned WHERE user_key = ?1 AND item_id = ?2").bind(me, it.id).first();
      if (have) return err("You already own that.", 409, "owned");
      if (w.orbs < it.price) return err(`You need ${it.price - w.orbs} more Orbs for that.`, 402, "orbs");
      const r = await db.batch([
        db.prepare("UPDATE lc_wallet SET orbs = orbs - ?2, spent = spent + ?2 WHERE user_key = ?1 AND orbs >= ?2 AND NOT EXISTS (SELECT 1 FROM lc_owned WHERE user_key = ?1 AND item_id = ?3)").bind(me, it.price, it.id),
        db.prepare("INSERT INTO lc_owned (user_key, item_id, price, ts) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1").bind(me, it.id, it.price, now),
        db.prepare("INSERT INTO lc_ledger (user_key, delta, reason, item_id, ts) SELECT ?1, ?2, 'buy', ?3, ?4 WHERE changes() = 1").bind(me, -it.price, it.id, now),
      ]);
      if (!(r[1].meta && r[1].meta.changes)) return err("That purchase didn't go through. Check your Orbs and try again.", 409);
      const after = await db.prepare("SELECT orbs FROM lc_wallet WHERE user_key = ?1").bind(me).first();
      // equip right away if the slot is empty (not for sticker packs)
      if (it.cat !== "stickers") await db.prepare("INSERT OR IGNORE INTO lc_equip (user_key, slot, item_id) VALUES (?1, ?2, ?3)").bind(me, it.cat, it.id).run();
      return json({ ok: true, orbs: after.orbs, item: it.id });
    }
    case "shopEquip": {
      const slot = String(body.slot || "");
      if (!CATS[slot] || slot === "stickers") return err("Pick something you can wear.");
      if (!body.item) { await db.prepare("DELETE FROM lc_equip WHERE user_key = ?1 AND slot = ?2").bind(me, slot).run(); return json({ ok: true }); }
      const o = await db.prepare("SELECT i.cat FROM lc_owned o JOIN lc_items i ON i.id = o.item_id WHERE o.user_key = ?1 AND o.item_id = ?2").bind(me, String(body.item)).first();
      if (!o) return err("You don't own that yet.", 403);
      if (o.cat !== slot) return err("That doesn't go in that slot.");
      await db.prepare("INSERT INTO lc_equip (user_key, slot, item_id) VALUES (?1, ?2, ?3) ON CONFLICT(user_key, slot) DO UPDATE SET item_id = excluded.item_id").bind(me, slot, String(body.item)).run();
      return json({ ok: true });
    }
    case "shopClaim": {
      const q = QUESTS.find(x => x.id === String(body.q || ""));
      if (!q) return err("Unknown quest.");
      const day = dayKey();
      await wallet(db, me);
      const st = [];
      if (q.id === "daily") st.push(db.prepare("INSERT OR IGNORE INTO lc_quests (user_key, day, q, n) VALUES (?1, ?2, 'daily', 1)").bind(me, day));
      st.push(
        db.prepare("UPDATE lc_quests SET claimed = 1 WHERE user_key = ?1 AND day = ?2 AND q = ?3 AND claimed = 0 AND n >= ?4").bind(me, day, q.id, q.goal),
        db.prepare("UPDATE lc_wallet SET orbs = orbs + ?2, earned = earned + ?2 WHERE user_key = ?1 AND changes() = 1").bind(me, q.reward),
        db.prepare("INSERT INTO lc_ledger (user_key, delta, reason, item_id, ts) SELECT ?1, ?2, ?3, NULL, ?4 WHERE changes() = 1").bind(me, q.reward, "quest:" + q.id, now),
      );
      const r = await db.batch(st);
      const paid = r[r.length - 2].meta && r[r.length - 2].meta.changes;
      if (!paid) return err("Nothing to claim there yet.", 409);
      const after = await db.prepare("SELECT orbs FROM lc_wallet WHERE user_key = ?1").bind(me).first();
      return json({ ok: true, orbs: after.orbs, got: q.reward });
    }
  }
  return null;
}

/* ---------- admin: items, prices, dates, Orbs grants ---------- */
export async function shopAdmin(context, user, method, body) {
  const db = context.env.DB, now = Date.now();
  await seedShop(db);
  if (method === "GET") {
    const rows = (await db.prepare("SELECT i.*, (SELECT COUNT(*) FROM lc_owned o WHERE o.item_id = i.id) AS owners FROM lc_items i ORDER BY cat, pos, created_at").all()).results || [];
    const tot = await db.prepare("SELECT COUNT(*) AS wallets, COALESCE(SUM(orbs), 0) AS orbs FROM lc_wallet").first();
    return json({ cats: Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, { n: v.n, fx: v.fx }])), stickers: STICKERS, items: rows.map(r => shapeItem(r, now, true)), totals: tot });
  }
  switch (String(body.op || "")) {
    case "saveItem": {
      const cat = String(body.cat || "");
      const data = cleanItemData(cat, body.v);
      if (typeof data === "string") return err(data);
      const name = String(body.n || "").trim().slice(0, 40);
      if (!name) return err("Give the item a name.");
      const price = Math.round(Number(body.p));
      if (!Number.isFinite(price) || price < 0 || price > 100000) return err("Price must be 0 to 100000 Orbs.");
      const descr = String(body.d || "").trim().slice(0, 140);
      const from = body.from ? Number(body.from) : null, until = body.until ? Number(body.until) : null;
      if ((from && !Number.isFinite(from)) || (until && !Number.isFinite(until))) return err("Dates don't look right.");
      if (from && until && until <= from) return err("The end date has to be after the start date.");
      const active = body.on === false ? 0 : 1;
      let id = String(body.id || "");
      if (id) {
        const cur = await db.prepare("SELECT cat FROM lc_items WHERE id = ?1").bind(id).first();
        if (!cur) return err("No such item.", 404);
        if (cur.cat !== cat) return err("An item can't change category.");
        await db.prepare("UPDATE lc_items SET name = ?2, descr = ?3, price = ?4, data = ?5, active = ?6, start_at = ?7, end_at = ?8, updated_at = ?9 WHERE id = ?1")
          .bind(id, name, descr, price, JSON.stringify(data), active, from, until, now).run();
      } else {
        id = "it_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        await db.prepare("INSERT INTO lc_items (id, cat, name, descr, price, data, active, start_at, end_at, pos, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 999, ?10, ?10)")
          .bind(id, cat, name, descr, price, JSON.stringify(data), active, from, until, now).run();
      }
      return json({ ok: true, id, summary: `Saved ${name}.` });
    }
    case "grantOrbs": {
      const k = String(body.username || "").trim().toLowerCase().replace(/^@/, "");
      const n = Math.round(Number(body.n));
      if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100000) return err("Amount must be between -100000 and 100000 (not 0).");
      const u = await db.prepare("SELECT username, username_key FROM users WHERE username_key = ?1").bind(k).first();
      if (!u) return err("No Lumio account with that username.", 404);
      await wallet(db, u.username_key);
      await db.batch([
        db.prepare("UPDATE lc_wallet SET orbs = MAX(0, orbs + ?2), earned = earned + MAX(0, ?2) WHERE user_key = ?1").bind(u.username_key, n),
        db.prepare("INSERT INTO lc_ledger (user_key, delta, reason, by_key, ts) VALUES (?1, ?2, 'admin', ?3, ?4)").bind(u.username_key, n, user.username_key, now),
      ]);
      const after = await db.prepare("SELECT orbs FROM lc_wallet WHERE user_key = ?1").bind(u.username_key).first();
      return json({ ok: true, orbs: after.orbs, summary: `${u.username} now has ${after.orbs} Orbs.` });
    }
  }
  return err("Unknown shop action.");
}
