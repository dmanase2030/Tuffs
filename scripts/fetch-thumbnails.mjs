/**
 * Fetch thumbnails for catalog entries that have none.
 *
 * Sources:
 *  - NettleWeb game images (github.com/BlueDonuts/unblocked-games, d/<title>.jpg),
 *    matched by game title (case-insensitive).
 *  - "Tuff Client" is Tuffs' own app: gets a locally generated SVG card.
 *
 * Downloads into public/images/thumbs/<slug>.jpg and sets the `thumb` field
 * in public/data/games.json. Idempotent: skips entries that already have a
 * thumbnail.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const thumbsDir = path.join(publicDir, "images", "thumbs");
const catalogPath = path.join(publicDir, "data", "games.json");

const NW_BASE =
  "https://raw.githubusercontent.com/BlueDonuts/unblocked-games/Main/";

const raw = await readFile(catalogPath, "utf8");
const data = JSON.parse(raw);
const games = data.games;

await mkdir(thumbsDir, { recursive: true });

// Build title -> repo path index from the NettleWeb tree listing
const treeRaw = await readFile("/tmp/nw-tree.txt", "utf8");
const byTitle = new Map();
for (const line of treeRaw.split("\n")) {
  if (!line.startsWith("d/") || !line.toLowerCase().endsWith(".jpg")) continue;
  byTitle.set(line.slice(2, -4).toLowerCase(), line);
}

const targets = games.filter((g) => !g.thumb);
console.log("entries without thumbnail:", targets.length);

let downloaded = 0;
let skipped = 0;
const misses = [];

for (const g of targets) {
  const slug = g.slug || g.id;
  const ext = g.id === "tuffclient" ? "svg" : "jpg";
  const file = path.join(thumbsDir, `${slug}.${ext}`);
  const alreadyThere = await stat(file).then((s) => s.isFile()).catch(() => false);

  if (g.id === "tuffclient") {
    if (alreadyThere) {
      g.thumb = `images/thumbs/${slug}.svg`;
      skipped++;
      continue;
    }
    await writeFile(file, tuffClientSvg(), "utf8");
    g.thumb = `images/thumbs/${slug}.svg`;
    downloaded++;
    console.log("  created:", slug + ".svg (Tuff Client)");
    continue;
  }

  const repoPath = byTitle.get(g.title.toLowerCase());
  if (!repoPath) {
    misses.push(g.id + "=" + g.title);
    continue;
  }

  if (alreadyThere) {
    g.thumb = `images/thumbs/${slug}.jpg`;
    skipped++;
    continue;
  }

  const url = NW_BASE + repoPath.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(url);
  if (!res.ok) {
    misses.push(`${g.id}: HTTP ${res.status} for ${repoPath}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // sanity: reject tiny/HTML error bodies
  if (buf.length < 1000 || buf.slice(0, 100).includes("<!DOCTYPE")) {
    misses.push(`${g.id}: bad image body from ${repoPath}`);
    continue;
  }
  await writeFile(file, buf);
  g.thumb = `images/thumbs/${slug}.jpg`;
  downloaded++;
  if (downloaded % 10 === 0) console.log(`  downloaded ${downloaded}...`);
}

console.log("downloaded:", downloaded, "| already present:", skipped, "| misses:", misses.length);
if (misses.length) misses.forEach((m) => console.log("  MISS:", m));

// Sort keys are unchanged; write back pretty-printed like the original
const out = JSON.stringify(data, null, 1) + "\n";
await writeFile(catalogPath, out, "utf8");
console.log("catalog updated.");

function tuffClientSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2340"/>
      <stop offset="1" stop-color="#0d7a72"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#bg)"/>
  <g fill="none" stroke="#eaf6f4" stroke-width="7" stroke-linecap="round">
    <circle cx="160" cy="74" r="34"/>
    <path d="M160 108 v22"/>
    <path d="M138 152 a30 30 0 0 1 44 0"/>
    <path d="M104 96 a64 64 0 0 1 -4 -18"/>
    <path d="M216 96 a64 64 0 0 0 4 -18"/>
  </g>
  <text x="160" y="178" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="#eaf6f4" text-anchor="middle">Tuff Client</text>
</svg>
`;
}
