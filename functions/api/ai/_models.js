/* The Workers AI text models Lumio uses, in one place (Lumio AI chat, admin
 * proposals and the @lumio-ai bot in Lumio Chat). Checked against the account's
 * model catalog on 2026-11-15: none of these has a planned deprecation date.
 * The Llama 3.1 8B models we used before were retired (error 5028), which is
 * why a retirement now falls through to the next model instead of failing.
 * Backups: when every Workers AI model fails (daily limit, retired, any error),
 * the same request goes to backup provider A (env.GROQ_API_KEY), then backup
 * provider B (env.GEMINI_API_KEY). Both keys are Pages secrets; a provider
 * whose key is missing is skipped silently.
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

// Backup models, checked against each provider's live model list on 2026-11-15.
export const GROQ_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
export const GROQ_FAST = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const key = (env, k) => !!(env && typeof env[k] === "string" && env[k].length > 10);
const hasWorkersAI = env => !!(env && env.AI && typeof env.AI.run === "function");
/* True when at least one provider can answer. */
export function aiAvailable(env) { return hasWorkersAI(env) || key(env, "GROQ_API_KEY") || key(env, "GEMINI_API_KEY"); }

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

/* fetch with a time limit on getting the response headers only, so a long
 * streamed answer isn't cut off once it has started. */
async function fetchHead(url, init, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function httpFail(r, tag) {
  let msg = "";
  try { const j = await r.json(); const e = j && (Array.isArray(j) ? j[0] : j).error; msg = String((e && (e.status || e.code || e.type)) || ""); } catch { /* ignore */ }
  return new Error(`${tag} HTTP ${r.status} ${msg}`.trim());
}
const enc = new TextEncoder();
const sse = obj => enc.encode("data: " + JSON.stringify(obj) + "\n\n");

/* Backup A (OpenAI-compatible). Streaming returns its SSE body (OpenAI style
 * `choices[0].delta.content`, which the Lumio AI stream rewriter already reads);
 * otherwise `{ response }` like Workers AI. Reasoning text is never returned.
 * Errors carry the HTTP status (429 → "busy") but never the key. */
async function runGroq(env, model, input) {
  const oss = model.startsWith("openai/gpt-oss");
  const body = {
    model,
    messages: input.messages,
    stream: !!input.stream,
    // reasoning models spend tokens before answering, so tiny limits get a floor
    max_tokens: Math.min(8192, Math.max(Number(input.max_tokens) || 1024, oss ? 256 : 32)),
  };
  if (oss) { body.reasoning_effort = "low"; body.include_reasoning = false; } else body.reasoning_format = "hidden";
  const r = await fetchHead(GROQ_URL, {
    method: "POST",
    headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  }, 20000);
  if (!r.ok) throw await httpFail(r, "backup A");
  if (input.stream) return r.body;
  const j = await r.json();
  const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return t ? { response: String(t).replace(/<think>[\s\S]*?<\/think>/g, "").trim() } : null;
}

/* Backup B. System messages become systemInstruction, assistant turns become
 * "model" turns. Streaming (alt=sse) is converted to `data: {"response": ...}`
 * events + `data: [DONE]`, the same format Workers AI streams. */
function geminiBody(input) {
  const sys = [], contents = [];
  for (const m of input.messages || []) {
    const text = String(m.content || "");
    if (!text) continue;
    if (m.role === "system") { sys.push(text); continue; }
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + text;
    else contents.push({ role, parts: [{ text }] });
  }
  if (!contents.length || contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "(continuing the conversation)" }] });
  const body = {
    contents,
    generationConfig: { maxOutputTokens: Math.min(8192, Math.max(Number(input.max_tokens) || 1024, 16)), thinkingConfig: { thinkingLevel: "minimal" } },
  };
  if (sys.length) body.systemInstruction = { parts: [{ text: sys.join("\n\n") }] };
  return body;
}
const geminiText = j => ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
  .filter(p => p && !p.thought && typeof p.text === "string").map(p => p.text).join("");
async function runGemini(env, model, input) {
  const url = GEMINI_URL + encodeURIComponent(model) + (input.stream ? ":streamGenerateContent?alt=sse" : ":generateContent");
  const r = await fetchHead(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(geminiBody(input)),
  }, 20000);
  if (!r.ok) throw await httpFail(r, "backup B");
  if (!input.stream) { const t = geminiText(await r.json()).trim(); return t ? { response: t } : null; }
  const dec = new TextDecoder();
  let buf = "";
  const take = (ctl, line) => {
    line = line.trim();
    if (!line.startsWith("data:")) return;
    let j; try { j = JSON.parse(line.slice(5)); } catch { return; }
    const t = geminiText(j);
    if (t) ctl.enqueue(sse({ response: t }));
  };
  return r.body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      let k;
      while ((k = buf.indexOf("\n")) >= 0) { take(ctl, buf.slice(0, k)); buf = buf.slice(k + 1); }
    },
    flush(ctl) { if (buf) take(ctl, buf); ctl.enqueue(enc.encode("data: [DONE]\n\n")); },
  }));
}

const BACKUPS = [
  { key: "GROQ_API_KEY", tag: "backup A", run: runGroq, models: fast => (fast ? GROQ_FAST : GROQ_MODELS) },
  { key: "GEMINI_API_KEY", tag: "backup B", run: runGemini, models: () => GEMINI_MODELS },
];

/* Run `input` on each Workers AI model in order until one answers, then on each
 * backup provider's models. Returns { result, model } or { error, kinds }. */
export async function runModels(env, models, input, tag = "Lumio AI") {
  const kinds = [];
  if (hasWorkersAI(env)) {
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
  }
  const fast = models[0] === FAST_MODELS[0];
  let backupTried = false;
  for (const b of BACKUPS) {
    if (!key(env, b.key)) continue;
    backupTried = true;
    for (const m of b.models(fast)) {
      try {
        const result = await b.run(env, m, input);
        if (result) return { result, model: m };
        kinds.push("other");
      } catch (e) {
        const s = String((e && e.message) || e);
        const k = /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|rate_limit/i.test(s) ? "busy" : /\b(400|404)\b/.test(s) ? "unavailable" : "other";
        kinds.push(k);
        console.error(tag + ": " + b.tag + " model failed", m, k, s.slice(0, 120));
      }
    }
  }
  // a backup was tried: the daily Workers AI limit is no longer the reason to show
  if (backupTried) for (let i = 0; i < kinds.length; i++) if (kinds[i] === "quota") kinds[i] = "other";
  if (!kinds.length) return { error: "no_ai", kinds };
  return { error: "upstream", kinds };
}
