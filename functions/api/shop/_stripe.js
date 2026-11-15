/* Stripe helpers for Orb purchases. Card details never touch Lumio: people pay on Stripe's
 * hosted Checkout page and Stripe tells us (signed webhook) when a session is paid. */
export const stripeReady = env => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
const API = env => env.STRIPE_API_BASE || "https://api.stripe.com"; // override only for local tests

export async function createSession(env, form, idem) {
  const r = await fetch(API(env) + "/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded", "idempotency-key": idem },
    body: new URLSearchParams(form).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id || !d.url) throw new Error((d.error && d.error.type) || "stripe " + r.status);
  return d;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
function sameHex(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

/* Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.body">[,v1=...]. 5 minute tolerance. */
export async function verifySig(secret, header, raw, nowSec = Math.floor(Date.now() / 1000), tol = 300) {
  if (!secret || !header) return false;
  let t = null; const v1 = [];
  for (const part of String(header).split(",")) { const [k, v] = part.split("=", 2).map(s => (s || "").trim()); if (k === "t") t = v; else if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) v1.push(v); }
  if (!t || !/^\d{1,12}$/.test(t) || !v1.length || Math.abs(nowSec - Number(t)) > tol) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + raw)));
  return v1.some(v => sameHex(v, want));
}
