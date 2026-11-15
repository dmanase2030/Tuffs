/* /api/shop/checkout
 *  GET   -> { available, packs }   (available is false until both Stripe keys are set)
 *  POST  { pack } -> { url }       a Stripe Checkout Session for one server-side pack
 * 503 { code:"soon" } while payments aren't set up. */
import { json, guard, sessionUser, readBody } from "../auth/_shared.js";
import { throttleCheck, throttleFail } from "../auth/_throttle.js";
import { ensure } from "../lc/_db.js";
import { PACKS } from "../lc/_catalog.js";
import { stripeReady, createSession } from "./_stripe.js";

const soon = () => json({ error: "Buying Orbs is coming soon.", code: "soon" }, 503);
const packs = () => PACKS.map(p => ({ id: p.id, n: p.n, orbs: p.orbs, cents: p.cents }));

export async function onRequestGet({ request, env }) {
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in first.", code: "signin" }, 401);
  return json({ available: stripeReady(env), packs: packs() });
}

export async function onRequestPost({ request, env }) {
  const blocked = guard(request, env); if (blocked) return blocked;
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in to your Lumio account first.", code: "signin" }, 401);
  if (!stripeReady(env)) return soon();
  const body = await readBody(request);
  const pack = PACKS.find(p => p.id === String(body.pack || ""));
  if (!pack) return json({ error: "Pick one of the Orb packs." }, 400);
  const db = env.DB; await ensure(db);
  const k = "orbpay|" + user.username_key;
  if (await throttleCheck(db, k)) return json({ error: "Too many checkouts started. Try again in a few minutes.", code: "rate" }, 429);
  await throttleFail(db, k, 10, 600e3, 600e3);
  const origin = new URL(request.url).origin;
  let s;
  try {
    s = await createSession(env, {
      mode: "payment",
      success_url: origin + "/?orbs=paid",
      cancel_url: origin + "/?orbs=cancel",
      client_reference_id: user.username_key,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(pack.cents),
      "line_items[0][price_data][product_data][name]": `${pack.orbs.toLocaleString("en-US")} Orbs`,
      "line_items[0][price_data][product_data][description]": "Orbs for the Lumio Chat Shop",
      "metadata[user]": user.username_key,
      "metadata[pack]": pack.id,
    }, crypto.randomUUID());
  } catch (e) {
    console.error("stripe checkout", e && e.message);
    return json({ error: "Couldn't start checkout. Try again in a minute." }, 502);
  }
  await db.prepare("INSERT INTO lc_payments (session_id, user_key, pack, orbs, cents, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6)")
    .bind(s.id, user.username_key, pack.id, pack.orbs, pack.cents, Date.now()).run();
  return json({ url: s.url });
}
