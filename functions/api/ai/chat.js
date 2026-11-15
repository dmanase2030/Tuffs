import { json, guard, readBody, sessionUser, getSettings } from "../auth/_shared.js";
import { clientIp, throttleCheck, throttleFail } from "../auth/_throttle.js";
import { loadGames, systemPrompt, actionFilter } from "./_site.js";

/* Lumio AI chat — Cloudflare Workers AI through the `AI` binding.
 *
 * Setup (Cloudflare dashboard → Pages project → Settings → Bindings):
 *   add a "Workers AI" binding named  AI .
 * Optional env var AI_MODEL overrides the model (must be a "@cf/..." id).
 * Without the binding this endpoint answers 503 and the launcher says so;
 * it never makes up a reply.
 *
 * GET  /api/ai/chat  → { available }  (no auth; never names the model)
 * POST /api/ai/chat  { messages: [{ role: "user"|"assistant", content }] }
 *      Signed-in Tuffs accounts only (same bearer session as the rest of the
 *      site). The system prompt (./_site.js) describes the site and carries the
 *      real games catalog. The reply streams back as server-sent events
 *      `data: {"response": "..."}` … `data: [DONE]`, with [[open:game|app:id]]
 *      action tags checked against the real catalog/app list on the way out.
 * Rate limits reuse the D1 auth throttle: 20 messages / 10 min per account
 * (then a 10 min pause) and 60 / hour per IP (then 30 min).
 */

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const FALLBACK_MODELS = ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
const MAX_MESSAGES = 20, MAX_CHARS = 4000;
const USER_MAX = 20, USER_WINDOW = 10 * 60 * 1000, USER_LOCK = 10 * 60 * 1000;
const IP_MAX = 60, IP_WINDOW = 60 * 60 * 1000, IP_LOCK = 30 * 60 * 1000;

function model(env) {
  return typeof env.AI_MODEL === "string" && env.AI_MODEL.startsWith("@cf/") ? env.AI_MODEL : DEFAULT_MODEL;
}

export async function onRequestGet(context) {
  const { env } = context;
  return json({ available: !!(env.AI && typeof env.AI.run === "function") });
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

  // Try the configured model first, then current fallbacks, so one retired or
  // overloaded model doesn't take the whole app down.
  const games = await loadGames(request, env);
  const system = systemPrompt(games, messages[messages.length - 1].content, user.username);
  const tried = [], input = { messages: [{ role: "system", content: system }, ...messages], stream: true, max_tokens: 1024 };
  let stream = null, reason = "";
  for (const m of [...new Set([model(env), ...FALLBACK_MODELS])]) {
    try {
      stream = await env.AI.run(m, input);
      if (stream) break;
    } catch (e) {
      // Shown to the user, so strip anything that names the model or provider.
      reason = String((e && e.message) || e).replace(/@cf\/[^\s"',)]+/gi, "the model").replace(/workers ai|cloudflare|llama|\bmeta\b/gi, "service").slice(0, 200);
      tried.push(m);
      console.error("Lumio AI: env.AI.run failed", m, reason);
    }
  }
  if (!stream) {
    // 503, not 502: Cloudflare swaps a Function's 502 body for its own "error code: 502" page.
    return json({ error: "Lumio AI couldn't answer right now. Try again in a moment.", code: "upstream", reason }, 503);
  }
  return new Response(rewrite(stream, games), {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

/* Upstream SSE (either {response} or OpenAI-style {choices[0].delta.content})
 * → uniform `data: {"response": "..."}` events, run through the action filter. */
function rewrite(stream, games) {
  const filter = actionFilter(games), dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const emit = (ctl, text) => { if (text) ctl.enqueue(enc.encode("data: " + JSON.stringify({ response: text }) + "\n\n")); };
  return stream.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      let k;
      while ((k = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        let j; try { j = JSON.parse(p); } catch { continue; }
        const tok = j.response || (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || "";
        if (tok) emit(ctl, filter.push(tok, false));
      }
    },
    flush(ctl) {
      emit(ctl, filter.push("", true));
      ctl.enqueue(enc.encode("data: [DONE]\n\n"));
    },
  }));
}
