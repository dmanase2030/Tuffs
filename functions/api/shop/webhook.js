/* POST /api/shop/webhook — Stripe events. Signature-checked; credits Orbs once per Checkout
 * Session id (the lc_payments row flips to 'paid' only once, and the wallet/ledger writes only
 * happen in the same batch when it did). Amounts come from our own row, never from the event. */
import { json } from "../auth/_shared.js";
import { ensure } from "../lc/_db.js";
import { wallet } from "../lc/_shop.js";
import { stripeReady, verifySig } from "./_stripe.js";

export async function onRequestPost({ request, env }) {
  if (!stripeReady(env)) return json({ error: "Payments aren't set up." }, 503);
  const raw = await request.text();
  if (raw.length > 262144) return json({ error: "Too large." }, 413);
  if (!(await verifySig(env.STRIPE_WEBHOOK_SECRET, request.headers.get("stripe-signature"), raw))) return json({ error: "Bad signature." }, 400);
  let ev; try { ev = JSON.parse(raw); } catch { return json({ error: "Bad JSON." }, 400); }
  const s = ev && ev.data && ev.data.object;
  if (!s || s.object !== "checkout.session" || typeof s.id !== "string") return json({ received: true, ignored: true });
  const db = env.DB; await ensure(db);
  const row = await db.prepare("SELECT * FROM lc_payments WHERE session_id = ?1").bind(s.id).first();
  if (!row) { console.warn("stripe: unknown session"); return json({ received: true, ignored: true }); }
  const now = Date.now();
  if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && s.payment_status === "paid") {
    if (s.amount_total !== row.cents || String(s.currency).toLowerCase() !== "usd" || (s.client_reference_id && s.client_reference_id !== row.user_key)) {
      await db.prepare("UPDATE lc_payments SET status = 'mismatch', event_id = ?2 WHERE session_id = ?1 AND status <> 'paid'").bind(s.id, String(ev.id || "")).run();
      console.error("stripe: amount/user mismatch"); return json({ received: true, credited: false });
    }
    await wallet(db, row.user_key);
    const r = await db.batch([
      db.prepare("UPDATE lc_payments SET status = 'paid', paid_at = ?2, event_id = ?3 WHERE session_id = ?1 AND status <> 'paid'").bind(s.id, now, String(ev.id || "")),
      db.prepare("UPDATE lc_wallet SET orbs = orbs + ?2, earned = earned + ?2 WHERE user_key = ?1 AND changes() = 1").bind(row.user_key, row.orbs),
      db.prepare("INSERT INTO lc_ledger (user_key, delta, reason, item_id, ts) SELECT ?1, ?2, 'purchase', ?3, ?4 WHERE changes() = 1").bind(row.user_key, row.orbs, s.id, now),
    ]);
    return json({ received: true, credited: !!(r[1].meta && r[1].meta.changes) });
  }
  if (ev.type === "checkout.session.expired" || ev.type === "checkout.session.async_payment_failed") {
    await db.prepare("UPDATE lc_payments SET status = ?2, event_id = ?3 WHERE session_id = ?1 AND status = 'open'").bind(s.id, ev.type.endsWith("expired") ? "expired" : "failed", String(ev.id || "")).run();
  }
  return json({ received: true });
}
