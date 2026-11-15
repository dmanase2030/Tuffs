/* Lumio Shop catalog: categories, the visual presets each category may use,
 * and the starting items. Items are seeded into D1 once (INSERT OR IGNORE), so
 * admin edits in the Admin app stick. Every item is drawn by the app from a
 * whitelisted preset id plus up to three hex colors — never from free-form
 * CSS, HTML or URLs — so an item can't inject anything into someone's screen. */

// slot = category id. "stickers" is owned-only (no equip slot).
export const CATS = {
  name_color: { n: "Name Colors", fx: ["solid", "gradient", "shimmer", "glow", "rainbow"] },
  name_font: { n: "Name Fonts", fx: ["serif", "mono", "rounded", "condensed", "script", "wide", "pixel", "slab"] },
  deco: { n: "Avatar Decorations", fx: ["ring", "dual", "orbit", "halo", "sparkle", "flame", "crown", "petals", "pulse", "dashed"] },
  entrance: { n: "Profile Entrances", fx: ["rise", "zoom", "flip", "slide", "glitch", "burst", "drop", "spin"] },
  flair: { n: "Profile Flair", fx: ["eq", "pulse", "wave", "orbit", "spark"] },
  theme: { n: "Chat Themes", fx: ["midnight", "forest", "ember", "ocean", "paper", "rose", "slate", "mono", "dune"] },
  sound: { n: "Notification Sounds", fx: ["chime", "blip", "marimba", "pluck", "retro", "bell", "droplet", "soft"] },
  stickers: { n: "Sticker Packs", fx: ["pack"] },
  react_fx: { n: "Reaction Effects", fx: ["confetti", "hearts", "sparks", "ripple", "stars", "bubbles"] },
};
// The original sticker art lives in the app (SVG); packs reference these ids.
export const STICKERS = ["hi", "gg", "lol", "brb", "wow", "love", "sleepy", "cool", "cry", "angry", "think", "yes", "no", "fire",
  "party", "trophy", "rocket", "controller", "ghost", "cat", "dog", "pizza", "star", "heart", "thumbs", "clap", "skull", "rain", "sun", "moon"];

const S = (id, cat, name, price, fx, c, desc, extra = {}) => ({ id, cat, name, price, data: { fx, ...(c ? { c } : {}), ...extra }, desc });
export const SEED = [
  // name colors
  S("nc_ember", "name_color", "Ember", 120, "solid", ["#ff7a45"], "A warm orange name."),
  S("nc_mint", "name_color", "Mint", 120, "solid", ["#3ddc97"], "A fresh green name."),
  S("nc_sky", "name_color", "Sky", 120, "solid", ["#5ab8ff"], "A clear blue name."),
  S("nc_peach", "name_color", "Peach Fade", 260, "gradient", ["#ffb38a", "#ff6f91"], "A soft two-tone gradient."),
  S("nc_lagoon", "name_color", "Lagoon", 260, "gradient", ["#43e8d8", "#3b82f6"], "Teal into deep blue."),
  S("nc_gold", "name_color", "Gold Leaf", 420, "shimmer", ["#f7d774", "#c8901c"], "A slow gold shimmer."),
  S("nc_frost", "name_color", "Frost", 420, "shimmer", ["#e6f4ff", "#7cc4ff"], "An icy shimmer."),
  S("nc_neon", "name_color", "Neon Sign", 520, "glow", ["#ff4fd8"], "A glowing pink name."),
  S("nc_toxic", "name_color", "Toxic", 520, "glow", ["#b6ff3b"], "A glowing green name."),
  S("nc_prism", "name_color", "Prism", 900, "rainbow", null, "The full spectrum, gently moving."),
  // name fonts
  S("nf_serif", "name_font", "Bookish", 150, "serif", null, "A classic serif name."),
  S("nf_mono", "name_font", "Terminal", 150, "mono", null, "Monospace, for the coders."),
  S("nf_round", "name_font", "Bubble", 200, "rounded", null, "Round and friendly."),
  S("nf_cond", "name_font", "Tall", 200, "condensed", null, "Narrow and tall."),
  S("nf_script", "name_font", "Signature", 300, "script", null, "Handwritten style."),
  S("nf_wide", "name_font", "Wide Load", 300, "wide", null, "Extra letter spacing."),
  S("nf_pixel", "name_font", "Arcade", 350, "pixel", null, "Chunky arcade caps."),
  S("nf_slab", "name_font", "Poster", 250, "slab", null, "Heavy slab letters."),
  // avatar decorations
  S("dc_ring_sun", "deco", "Sun Ring", 200, "ring", ["#f2a54a"], "A thin warm ring."),
  S("dc_ring_ice", "deco", "Ice Ring", 200, "ring", ["#7cc4ff"], "A thin cool ring."),
  S("dc_dual", "deco", "Twin Ring", 320, "dual", ["#ff6f91", "#5ab8ff"], "Two rings turning opposite ways."),
  S("dc_orbit", "deco", "Orbit", 420, "orbit", ["#ffd36e"], "A little moon circling your picture."),
  S("dc_halo", "deco", "Halo", 380, "halo", ["#fff3c4"], "A soft floating halo."),
  S("dc_sparkle", "deco", "Sparkles", 450, "sparkle", ["#ffe27a"], "Twinkling sparkles."),
  S("dc_flame", "deco", "Hot Streak", 520, "flame", ["#ff5a1f", "#ffb02e"], "Flickering flames."),
  S("dc_crown", "deco", "Tiny Crown", 650, "crown", ["#f7c948"], "A small crown on top."),
  S("dc_petals", "deco", "Petals", 480, "petals", ["#ff9ec7"], "Petals drifting around."),
  S("dc_pulse", "deco", "Heartbeat", 360, "pulse", ["#3ddc97"], "A ring that pulses."),
  S("dc_dashed", "deco", "Dash", 240, "dashed", ["#c0c4cc"], "A slowly turning dashed ring."),
  // entrances (play when someone opens your profile)
  S("en_rise", "entrance", "Rise", 150, "rise", null, "Your card rises in."),
  S("en_zoom", "entrance", "Pop In", 200, "zoom", null, "A springy zoom."),
  S("en_flip", "entrance", "Flip", 300, "flip", null, "Your card flips into view."),
  S("en_slide", "entrance", "Swoosh", 200, "slide", null, "Slides in from the side."),
  S("en_glitch", "entrance", "Glitch", 450, "glitch", null, "A quick digital glitch."),
  S("en_burst", "entrance", "Burst", 450, "burst", ["#f2a54a"], "A ring bursts behind your picture."),
  S("en_drop", "entrance", "Drop", 250, "drop", null, "Drops in and bounces."),
  S("en_spin", "entrance", "Spin", 350, "spin", null, "Your picture spins in."),
  // flair
  S("fl_eq", "flair", "Equalizer", 350, "eq", ["#3ddc97"], "Little bars dancing under your name."),
  S("fl_eq_hot", "flair", "Equalizer Heat", 350, "eq", ["#ff7a45"], "Warm dancing bars."),
  S("fl_pulse", "flair", "Pulse Dot", 200, "pulse", ["#5ab8ff"], "A beating dot next to your name."),
  S("fl_wave", "flair", "Soundwave", 400, "wave", ["#ff6f91"], "A moving waveform."),
  S("fl_orbit", "flair", "Satellite", 400, "orbit", ["#ffd36e"], "A dot orbiting your name tag."),
  S("fl_spark", "flair", "Spark", 300, "spark", ["#ffe27a"], "Little sparks next to your name."),
  // chat themes
  S("th_midnight", "theme", "Midnight", 300, "midnight", null, "Deep navy for late nights."),
  S("th_forest", "theme", "Forest", 300, "forest", null, "Mossy greens."),
  S("th_ember", "theme", "Ember", 300, "ember", null, "Warm charcoal and orange."),
  S("th_ocean", "theme", "Ocean", 300, "ocean", null, "Cool sea blues."),
  S("th_paper", "theme", "Paper", 250, "paper", null, "A soft cream light theme."),
  S("th_rose", "theme", "Rose", 300, "rose", null, "Dusky pinks."),
  S("th_slate", "theme", "Slate", 250, "slate", null, "Neutral cool greys."),
  S("th_mono", "theme", "Mono", 250, "mono", null, "Pure black and white."),
  S("th_dune", "theme", "Dune", 300, "dune", null, "Sand and sunset, like the Lumio desktop."),
  // sounds (made live in the browser, no recordings)
  S("sd_chime", "sound", "Chime", 150, "chime", null, "Two soft bell notes."),
  S("sd_blip", "sound", "Blip", 100, "blip", null, "A tiny blip."),
  S("sd_marimba", "sound", "Marimba", 200, "marimba", null, "A woody little run."),
  S("sd_pluck", "sound", "Pluck", 150, "pluck", null, "A plucked string."),
  S("sd_retro", "sound", "8-Bit", 200, "retro", null, "A game-console ping."),
  S("sd_bell", "sound", "Desk Bell", 150, "bell", null, "Ding."),
  S("sd_droplet", "sound", "Droplet", 150, "droplet", null, "A water drop."),
  S("sd_soft", "sound", "Whisper", 100, "soft", null, "Very quiet and low."),
  // sticker packs
  S("sp_basics", "stickers", "Hello Pack", 0, "pack", null, "Free starter stickers.", { s: ["hi", "yes", "no", "thumbs", "heart", "star"] }),
  S("sp_moods", "stickers", "Moods", 250, "pack", null, "Faces for every feeling.", { s: ["lol", "wow", "love", "sleepy", "cool", "cry", "angry", "think"] }),
  S("sp_gamer", "stickers", "Gamer", 300, "pack", null, "For game nights.", { s: ["gg", "brb", "controller", "trophy", "fire", "rocket", "skull", "clap"] }),
  S("sp_critters", "stickers", "Critters", 300, "pack", null, "Small friends.", { s: ["cat", "dog", "ghost", "pizza", "party"] }),
  S("sp_weather", "stickers", "Weather", 200, "pack", null, "Sun, moon and rain.", { s: ["sun", "moon", "rain", "star"] }),
  // reaction effects
  S("rx_confetti", "react_fx", "Confetti", 250, "confetti", ["#f2a54a", "#5ab8ff", "#ff6f91"], "Confetti when you react."),
  S("rx_hearts", "react_fx", "Hearts", 250, "hearts", ["#ff6f91"], "Little hearts float up."),
  S("rx_sparks", "react_fx", "Sparks", 200, "sparks", ["#ffd36e"], "A spark burst."),
  S("rx_ripple", "react_fx", "Ripple", 150, "ripple", ["#5ab8ff"], "A soft ripple."),
  S("rx_stars", "react_fx", "Star Pop", 250, "stars", ["#ffe27a"], "Stars pop out."),
  S("rx_bubbles", "react_fx", "Bubbles", 200, "bubbles", ["#7cc4ff"], "Bubbles rise."),
];

const HEX = /^#[0-9a-f]{6}$/i;
/* Validate an item's category + visual data (used for seeds and admin edits). Returns clean data or an error string. */
export function cleanItemData(cat, data) {
  const C = CATS[cat];
  if (!C) return "Unknown category.";
  const d = data && typeof data === "object" ? data : {};
  if (!C.fx.includes(d.fx)) return "Pick one of the visual styles for this category.";
  const out = { fx: d.fx };
  if (Array.isArray(d.c) && d.c.length) {
    const c = d.c.slice(0, 3).map(String);
    if (!c.every(x => HEX.test(x))) return "Colors must look like #ff7a45.";
    out.c = c.map(x => x.toLowerCase());
  }
  if (cat === "stickers") {
    const s = [...new Set((Array.isArray(d.s) ? d.s : []).map(String))].filter(x => STICKERS.includes(x)).slice(0, 16);
    if (!s.length) return "Pick at least one sticker for the pack.";
    out.s = s;
  }
  return out;
}

/* Categories that were taken out of the shop. Their items are hidden, unequipped and refunded (see _shop.js). */
export const RETIRED = ["banner_fx"];

export const SHOP_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS lc_items (id TEXT PRIMARY KEY, cat TEXT NOT NULL, name TEXT NOT NULL, descr TEXT, price INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, start_at INTEGER, end_at INTEGER, pos INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_items_cat ON lc_items(cat, pos)",
  "CREATE TABLE IF NOT EXISTS lc_wallet (user_key TEXT PRIMARY KEY, orbs INTEGER NOT NULL DEFAULT 0, earned INTEGER NOT NULL DEFAULT 0, spent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS lc_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_key TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, item_id TEXT, by_key TEXT, ts INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_lc_ledger_user ON lc_ledger(user_key, id)",
  "CREATE TABLE IF NOT EXISTS lc_owned (user_key TEXT NOT NULL, item_id TEXT NOT NULL, price INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, PRIMARY KEY (user_key, item_id))",
  "CREATE TABLE IF NOT EXISTS lc_equip (user_key TEXT NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_key, slot))",
  "CREATE TABLE IF NOT EXISTS lc_quests (user_key TEXT NOT NULL, day TEXT NOT NULL, q TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_key, day, q))",
];

/* Daily ways to earn Orbs. Progress is counted by the server from real actions. */
export const QUESTS = [
  { id: "daily", n: "Daily check-in", goal: 1, reward: 40 },
  { id: "msgs", n: "Send 10 messages", goal: 10, reward: 30 },
  { id: "reply", n: "Reply to 3 messages", goal: 3, reward: 25 },
  { id: "react", n: "React to 5 messages", goal: 5, reward: 20 },
];
export const WELCOME_ORBS = 150;
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10); // UTC day
