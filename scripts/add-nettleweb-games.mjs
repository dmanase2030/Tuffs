/**
 * Add NettleWeb external HTML5 games to the Tuffs catalog.
 *
 * Source: github.com/BlueDonuts/unblocked-games (NettleWeb) external catalog
 * (games embedded from third-party CDNs, e.g. cdn.htmlgames.com).
 * Thumbnails come from the same repo's /d/<title>.jpg library.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "public", "data", "games.json");
const thumbsDir = path.join(root, "public", "images", "thumbs", "nwx");
const RAW = "https://raw.githubusercontent.com/BlueDonuts/unblocked-games/Main/d/";

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const catMap = {
  puzzle: "Puzzle", arcade: "Arcade", action: "Action", adventure: "Adventure",
  racing: "Racing", driving: "Driving", shooting: "Shooter", shooter: "Shooter",
  sports: "Sports", platformer: "Platformer", platform: "Platformer",
  strategy: "Strategy", simulation: "Simulation", board: "Board", card: "Card",
  cards: "Card", mahjong: "Mahjong", classic: "Classic", space: "Space",
  horror: "Horror", physics: "Physics", runner: "Runner", music: "Music",
  sandbox: "Sandbox", stealth: "Stealth", multiplayer: "Online", io: "Online",
  online: "Online", casual: "Casual", clicker: "Clicker", idle: "Clicker",
  brain: "Puzzle", logic: "Puzzle", match: "Puzzle", matching: "Puzzle",
  tank: "Action", war: "Action", fighting: "Action", mario: "Platformer",
  snake: "Arcade", tetris: "Puzzle", golf: "Sports", pool: "Sports",
  billiards: "Sports", soccer: "Sports", football: "Sports", basketball: "Sports",
  baseball: "Sports", chess: "Board", checkers: "Board", solitaire: "Card",
  poker: "Card", blackjack: "Card", casino: "Gambling", parking: "Driving",
  truck: "Driving", bike: "Racing", motorcycle: "Racing", car: "Racing",
  drag: "Racing", flight: "Simulation", flying: "Simulation", dress: "Casual",
  cooking: "Simulation", restaurant: "Simulation", management: "Simulation",
  defense: "Strategy", tower: "Strategy", word: "Puzzle", typing: "Puzzle",
  math: "Puzzle", educational: "Puzzle", kids: "Casual", girl: "Casual",
  quiz: "Puzzle", trivia: "Puzzle", hidden: "Puzzle", escape: "Puzzle",
  point: "Adventure", click: "Adventure", skill: "Arcade", retro: "Classic",
  pixel: "Classic", "3d": "Arcade", one: "Arcade", two: "Arcade", player: "Arcade",
};

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "Arcade");
const categoryFor = (tags) => {
  const first = (tags || "").split(",")[0].trim().toLowerCase();
  return catMap[first] || cap(first) || "Arcade";
};

const nw = JSON.parse(await readFile("/tmp/nw-catalog.json", "utf8"));
const data = JSON.parse(await readFile(catalogPath, "utf8"));
const existing = new Set(data.games.map((g) => norm(g.title)));
const existingIds = new Set(data.games.map((g) => g.id));

// external HTML5 games only
const ext = nw.filter(
  (g) => g.type === "html5" && /^https:\/\//.test(g.path || "") && g.name
);
console.log("external html5 candidates:", ext.length);

// dedupe against existing catalog and within batch
const seen = new Set(existing);
const picked = [];
let dupes = 0;
for (const g of ext) {
  const k = norm(g.name);
  if (seen.has(k)) { dupes++; continue; }
  seen.add(k);
  let slug = "nwx-" + (slugify(g.name) || "game");
  while (existingIds.has(slug)) slug += "-x";
  existingIds.add(slug);
  picked.push({ ...g, slug, key: k });
}
console.log("after dedupe:", picked.length, "(skipped", dupes, "duplicate titles)");

await mkdir(thumbsDir, { recursive: true });

// download thumbnails with limited concurrency
const results = new Map(); // slug -> ok
const queue = [...picked];
const worker = async () => {
  for (;;) {
    const g = queue.pop();
    if (!g) return;
    const file = path.join(thumbsDir, `${g.slug}.jpg`);
    try {
      await stat(file);
      results.set(g.slug, true); // already have it
      continue;
    } catch {}
    const url = RAW + encodeURIComponent(g.name) + ".jpg";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500 && buf.length < 500000) {
          await writeFile(file, buf);
          results.set(g.slug, true);
          continue;
        }
      }
      results.set(g.slug, false);
    } catch {
      results.set(g.slug, false);
    }
  }
};
await Promise.all(Array.from({ length: 12 }, worker));
const okThumbs = [...results.values()].filter(Boolean).length;
console.log("thumbnails downloaded:", okThumbs, "/", picked.length);

// build catalog entries
const newGames = picked.map((g) => {
  const hasThumb = results.get(g.slug);
  return {
    id: g.slug,
    slug: g.slug,
    title: g.name,
    entry: g.path,
    ...(hasThumb ? { thumb: `images/thumbs/nwx/${g.slug}.jpg` } : {}),
    category: categoryFor(g.tags),
    external: true,
    license: {
      status: "unlicensed",
      note: "Third-party game embedded from an external CDN (via NettleWeb catalog).",
    },
    source: "NettleWeb",
    knownDependencies: [],
    verified: { entryPoint: true, manualPlay: "n/a" },
    featured: false,
  };
});

// merge + keep existing order, new games sorted by title
newGames.sort((a, b) => a.title.localeCompare(b.title));
data.games = [...data.games, ...newGames];
const out = JSON.stringify(data, null, 1) + "\n";
await writeFile(catalogPath, out);
console.log("catalog now has", data.games.length, "games");
