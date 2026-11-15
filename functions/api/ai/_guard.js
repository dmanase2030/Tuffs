/* Lumio AI privacy guards. Kept narrow on purpose: only clear attempts to get
 * the hidden instructions, the site's own code/config/secrets, or the model and
 * provider behind Lumio AI are refused. Coding help, HTML, explanations and
 * questions about using Lumio must go through. */

export const REFUSAL = "I can't share how I'm set up, but I'm happy to help with something else.";

const PROBE = [
  // the hidden instructions themselves
  /\b(your|the|this|lumio ai'?s?)\s+(own\s+|full\s+|hidden\s+)?(system|developer|pre)[\s-]?(prompt|message)s?\b/i,
  /\b(your|lumio ai'?s?|the ai'?s?)\s+(own\s+|full\s+|exact\s+|whole\s+|original\s+|initial\s+|hidden\s+|secret\s+|system\s+)*(prompt|instructions|guidelines|directives|rules|programming|configuration|config)\b/i,
  /\b(hidden|secret|initial|previous|prior|earlier|preceding)\s+(instructions|prompt|guidelines|directives)\b/i,
  /\b(hidden|secret)\s+rules\b/i,
  /\b(ignore|disregard|forget|bypass|override)\s+(all\s+|any\s+|every\s+)?(of\s+)?(your|the|my|these|those)?\s*(previous|prior|above|earlier|preceding|original|existing)?\s*(instructions|prompts?|rules|directions|guidelines|programming)\b/i,
  /\b(repeat|print|output|show|copy|write out|reproduce)\b[^.?!\n]{0,30}\b(text|everything|words?|messages?|content)\s+(above|before)\b/i,
  /\bstarting with\s+["'“‘]?you are\b/i,
  // the site's own code, config and secrets
  /\b(lumio'?s?|(this|the|your)\s+(site|website|server|backend|app)'?s?)\s+(own\s+)?(source(\s*code)?|code\s*base|env(ironment)?\s*var(iable)?s?|api\s*keys?|secrets?|tokens?|config(uration)?|database\s+(password|credentials|url|schema)|credentials|passwords?)\b/i,
  /\b(api\s*keys?|secrets?|tokens?|env(ironment)?\s*var(iable)?s?|credentials)\b[^.?!\n]{0,30}\b(does|do|is|are)\s+(lumio|this site|the site|this website|you)\s+(use|using|have|need)\b/i,
  // the model / provider behind Lumio AI
  /\b(what|which)\s+(ai\s+|llm\s+|language\s+|large language\s+|underlying\s+)*model\s+(are|is|do|does|powers|runs|is behind)\s+(you|lumio|this ai|it)\b/i,
  /\bare you\s+(really\s+)?(based on\s+|built on\s+|powered by\s+|running on\s+|made by\s+)?(an?\s+)?(gpt|chatgpt|openai|llama|meta|claude|anthropic|gemini|google|grok|xai|mistral|deepseek|qwen|cloudflare)\b/i,
  /\b(who|what|which)\s+(company\s+|companies\s+|provider\s+)?(made|built|created|trained|developed|owns|runs|hosts)\s+(you|lumio ai|this ai)\b/i,
  /\b(which|what)\s+(company|provider|llm|ai)\b[^.?!\n]{0,40}\b(powers|runs|is behind|made|built|trained)\s+(you|lumio ai|this ai)\b/i,
  /\bwhat\s+(powers|runs)\s+(you|lumio ai)\b/i,
];
export function isProbe(text) { const t = String(text || ""); return PROBE.some(re => re.test(t)); }

/* Literal fragments only the hidden instructions contain. Common words and
 * normal markdown (tables, HTML) never match these. */
export const MARKERS = [/\[\[open:(game|app):<id>\]\]/i, /lumio-(admin|code)\b[^`]*\{\s*"action"\s*:\s*"\.\.\."/i, /##\s*privacy rules/i];

/* Stops a reply that echoes a long verbatim stretch (about 14 words) of the
 * hidden instructions. Short shared phrases ("Lumio AI", "open a game") don't count. */
export function promptGuard(privateText) {
  const N = 80, norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const src = norm(privateText), shingles = new Set();
  for (let i = 0; i + N <= src.length; i += 1) shingles.add(src.slice(i, i + N));
  let seen = "", tripped = false;
  return {
    get tripped() { return tripped; },
    check(text) {
      if (tripped) return false;
      seen = (seen + norm(text)).slice(-600);
      for (let i = 0; i + N <= seen.length; i++) if (shingles.has(seen.slice(i, i + N))) { tripped = true; return false; }
      return true;
    },
  };
}
