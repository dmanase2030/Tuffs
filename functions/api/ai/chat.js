import { json, guard, readBody, sessionUser, getSettings } from "../auth/_shared.js";
import { clientIp, throttleCheck, throttleFail } from "../auth/_throttle.js";

/* Lumio AI chat — Cloudflare Workers AI through the `AI` binding.
 *
 * Setup (Cloudflare dashboard → Pages project → Settings → Bindings):
 *   add a "Workers AI" binding named  AI .
 * Optional env var AI_MODEL overrides the model (must be a "@cf/..." id).
 * Without the binding this endpoint answers 503 and the launcher says so;
 * it never makes up a reply.
 *
 * GET  /api/ai/chat  → { available, model }  (no auth; lets the UI explain setup)
 * POST /api/ai/chat  { messages: [{ role: "user"|"assistant", content }] }
 *      Signed-in Tuffs accounts only (same bearer session as the rest of the
 *      site). Streams Workers AI server-sent events back unchanged.
 * Rate limits reuse the D1 auth throttle: 20 messages / 10 min per account
 * (then a 10 min pause) and 60 / hour per IP (then 30 min).
 */

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const SYSTEM =
  "You are Lumio AI, the assistant built into the Lumio launcher on the Tuffs site. " +
  "Be friendly, clear and concise. Format answers in Markdown: short paragraphs, bullet or numbered lists, " +
  "and fenced code blocks with a language tag for code. If you are not sure about something, say so " +
  "instead of guessing. Refuse requests that could hurt someone.";
const MAX_MESSAGES = 20, MAX_CHARS = 4000;
const USER_MAX = 20, USER_WINDOW = 10 * 60 * 1000, USER_LOCK = 10 * 60 * 1000;
const IP_MAX = 60, IP_WINDOW = 60 * 60 * 1000, IP_LOCK = 30 * 60 * 1000;

function model(env) {
  return typeof env.AI_MODEL === "string" && env.AI_MODEL.startsWith("@cf/") ? env.AI_MODEL : DEFAULT_MODEL;
}

export async function onRequestGet(context) {
  const { env } = context;
  return json({ available: !!(env.AI && typeof env.AI.run === "function"), model: model(env) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;

  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Sign in to your Tuffs account to use Lumio AI.", code: "signin" }, 401);
  const settings = await getSettings(env.DB);
  if (settings.maintenance && !user.is_admin) return json({ error: "Lumio is under maintenance — please try again later." }, 503);
  if (!env.AI || typeof env.AI.run !== "function") {
    return json({ error: "Lumio AI isn't switched on for this site yet.", code: "no_ai" }, 503);
  }

  const body = await readBody(request);
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages = raw
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Send a message first." }, 400);
  }

  const ukey = "ai|" + user.username_key, ikey = "ai-ip|" + clientIp(request);
  const wait = Math.max(await throttleCheck(env.DB, ukey), await throttleCheck(env.DB, ikey));
  if (wait > 0) {
    return json({ error: "You're sending messages too fast. Try again in " + Math.ceil(wait / 60) + " min.", code: "rate" }, 429);
  }
  await throttleFail(env.DB, ukey, USER_MAX, USER_WINDOW, USER_LOCK);
  await throttleFail(env.DB, ikey, IP_MAX, IP_WINDOW, IP_LOCK);

  let stream;
  try {
    stream = await env.AI.run(model(env), {
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      stream: true,
      max_tokens: 1024,
    });
  } catch (e) {
    return json({ error: "Lumio AI couldn't answer right now. Try again in a moment.", code: "upstream" }, 502);
  }
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
