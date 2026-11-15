/* The Workers AI text models Lumio uses, in one place (Lumio AI chat, admin
 * proposals and the @lumio-ai bot in Lumio Chat). Checked against the account's
 * model catalog on 2026-11-15: none of these has a planned deprecation date.
 * The Llama 3.1 8B models we used before were retired (error 5028), which is
 * why a retirement now falls through to the next model instead of failing.
 * Never shown to users: replies and errors must not name the model or provider. */

// Smart + fast default, then two working fallbacks.
export const CHAT_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
];
// Short jobs (classification, quick bot replies): the lighter models first.
export const FAST_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
];

/* Optional AI_MODEL env override goes first; duplicates removed. */
export function modelOrder(env, list = CHAT_MODELS) {
  const o = env && typeof env.AI_MODEL === "string" && env.AI_MODEL.startsWith("@cf/") ? [env.AI_MODEL] : [];
  return [...new Set([...o, ...list])];
}

/* What kind of failure was it? Every kind moves on to the next model; the kind
 * only decides what the user is told when all of them fail. */
export function failKind(e) {
  const s = String((e && e.message) || e || "");
  if (/\b4006\b|daily free allocation|neurons/i.test(s)) return "quota";
  if (/\b5028\b|deprecat|retired|no longer (available|supported)/i.test(s)) return "retired";
  if (/\b5018\b|not allowed to access|\b5007\b|no such model|not found/i.test(s)) return "unavailable";
  if (/\b3040\b|capacity|overloaded|\b429\b|too many/i.test(s)) return "busy";
  return "other";
}

/* A user-facing reason that never names the model or provider. */
export function publicReason(kinds) {
  if (kinds.includes("quota")) return "Lumio AI has used up today's free allowance. It resets at midnight UTC (7 PM Eastern).";
  if (kinds.includes("busy")) return "Lumio AI is very busy right now.";
  return "";
}

/* Run `input` on each model in order until one answers. Returns { result, model } or { error, kinds }. */
export async function runModels(env, models, input, tag = "Lumio AI") {
  const kinds = [];
  if (!env.AI || typeof env.AI.run !== "function") return { error: "no_ai", kinds };
  for (const m of models) {
    try {
      const result = await env.AI.run(m, input);
      if (result) return { result, model: m };
      kinds.push("other");
    } catch (e) {
      const k = failKind(e);
      kinds.push(k);
      console.error(tag + ": model failed", m, k, String((e && e.message) || e).slice(0, 160));
    }
  }
  return { error: "upstream", kinds };
}
