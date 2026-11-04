/**
 * Add open-source HTML5 games (from GitHub) to the Tuffs catalog.
 *
 * Input:  /tmp/oss-raw.jsonl  (one JSON object per line: full_name, branch,
 *         stars, license, desc, size — from the GitHub search API)
 * Output: public/games/oss-<slug>/ game folders, public/images/thumbs/oss-<slug>.svg
 *         thumbnails, and updated public/data/games.json.
 *
 * Rules:
 *  - only permissive open-source licenses (MIT, Apache-2.0, BSD, CC0, Unlicense, ISC, Zlib)
 *  - game must be a fully static, ready-to-play HTML page (no build step, no server backend)
 *  - max extracted size per game: 6 MB; total budget: --budget MB (default 110)
 *  - repo LICENSE file is copied into the game folder
 *  - titles deduplicated against the existing catalog
 *
 * Usage: node scripts/add-opensource-games.mjs [--max N] [--budget MB]
 */
import { readFile, writeFile, stat, mkdir, readdir, cp, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const gamesDir = path.join(publicDir, "games");
const thumbsDir = path.join(publicDir, "images", "thumbs");
const rawFile = "/tmp/oss-raw.jsonl";
const workDir = "/tmp/oss-work";

const ALLOWED_LICENSES = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0",
  "Unlicense", "ISC", "Zlib", "GPL-3.0", "GPL-2.0", "MPL-2.0",
]);

// server/backend keywords → a game needing these is not statically hostable
const SERVER_DEPS = ["express", "socket.io", "ws", "http-server", "serve", "koa", "fastify", "mysql", "mongodb", "redis"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".github", ".git", ".vscode", ".idea", "test", "tests", "__tests__", "screenshots"]);

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const MAX_CANDIDATES = parseInt(flag("--max", "700"), 10);
const BUDGET_MB = parseInt(flag("--budget", "110"), 10);

const dirSize = async (dir, filter) => {
  let total = 0;
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { if (filter && !filter(p)) continue; total += (await stat(p)).size; }
    }
  };
  await walk(dir);
  return total;
};

const GRADIENTS = [
  ["#1b2340", "#0d7a72"], ["#4a1a5e", "#b5378f"], ["#5e1a1a", "#d97a2b"],
  ["#0d3b66", "#1d8a8f"], ["#2d5a1e", "#7ab55c"], ["#5c4a1a", "#c9a227"],
  ["#3a1a4a", "#6a4a9a"], ["#1a4a5c", "#2ba0c4"], ["#5c1a2d", "#c4526e"],
  ["#2b3a1a", "#8aa02b"], ["#4a2a1a", "#a06a3a"], ["#1a2a5c", "#4a6ad9"],
];
const esc = (s) => String(s).replace(/[^A-Za-z0-9 ]/g, '');
const makeThumb = (slug, title) => {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [c1, c2] = GRADIENTS[h % GRADIENTS.length];
  const letters = esc(title.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "GA");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#bg)"/>
  <circle cx="270" cy="40" r="60" fill="#ffffff" opacity="0.06"/>
  <circle cx="50" cy="170" r="44" fill="#ffffff" opacity="0.05"/>
  <text x="160" y="118" font-family="Segoe UI, system-ui, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle" opacity="0.92">${letters}</text>
</svg>
`;
};

const humanize = (name) =>
  name.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ").map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ").trim();

const CATEGORY_RULES = [
  ["Puzzle", ["puzzle", "sokoban", "match", "2048", "logic", "chess", "sudoku", "minesweeper", "solitaire", "card"]],
  ["Platformer", ["platform", "platformer", "mario", "jump", "runner", "endless"]],
  ["Shooter", ["shoot", "shooter", "space-invader", "bullet", "fps", "arena", "tank"]],
  ["Racing", ["racing", "race", "car", "drift", "moto", "traffic", "driving"]],
  ["Arcade", ["arcade", "snake", "tetris", "pacman", "breakout", "pong", "flappy", "bird", "retro", "classic", "dino"]],
  ["Action", ["action", "fight", "fighter", "ninja", "samurai", "beat"]],
  ["Strategy", ["strategy", "tower-defense", "defense", "rts", "city-builder", "builder", "tycoon", "management"]],
  ["Sandbox", ["sandbox", "voxel", "minecraft", "world"]],
  ["RPG", ["rpg", "roguelike", "rogue", "dungeon", "adventure", "quest"]],
  ["Sports", ["football", "soccer", "basketball", "golf", "tennis", "pool", "billiard", "bowling", "sport"]],
  ["Idle", ["idle", "clicker", "incremental"]],
  ["Skill", ["skill", "geometry-dash", "impossible", "reflex"]],
];
const guessCategory = (text) => {
  const t = text.toLowerCase();
  for (const [cat, kws] of CATEGORY_RULES) if (kws.some((k) => t.includes(k))) return cat;
  return "Arcade";
};

const findGameDir = async (extractRoot) => {
  // root of extraction contains a single <repo>-<branch>/ folder
  const entries = await readdir(extractRoot, { withFileTypes: true });
  const repoDir = entries.length === 1 && entries[0].isDirectory()
    ? path.join(extractRoot, entries[0].name) : extractRoot;

  const hasIndex = (d) => existsSync(path.join(d, "index.html"));
  if (hasIndex(repoDir)) return { gameDir: repoDir, entry: "index.html" };

  // common static-output subdirectories
  for (const sub of ["public", "docs", "dist", "build", "game", "web", "app"]) {
    const p = path.join(repoDir, sub);
    if (existsSync(p) && hasIndex(p)) return { gameDir: p, entry: "index.html" };
  }

  // a single top-level subdirectory containing index.html
  const subdirs = [];
  for (const e of await readdir(repoDir, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP_DIR_NAMES.has(e.name)) subdirs.push(path.join(repoDir, e.name));
  }
  const withIndex = subdirs.filter(hasIndex);
  if (withIndex.length === 1) return { gameDir: withIndex[0], entry: "index.html" };

  // any root-level *.html page as entry (game.html etc.)
  const rootHtml = (await readdir(repoDir)).filter((f) => f.endsWith(".html"));
  if (rootHtml.length >= 1) return { gameDir: repoDir, entry: rootHtml.sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.length - b.length))[0] };

  return null;
};

const looksLikeServerGame = (gameDir) => {
  const pj = path.join(gameDir, "package.json");
  if (!existsSync(pj)) return false;
  try {
    const j = JSON.parse(require("node:fs").readFileSync(pj, "utf8"));
    const deps = Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) });
    return deps.some((d) => SERVER_DEPS.includes(d));
  } catch { return false; }
};

const main = async () => {
  const lines = (await readFile(rawFile, "utf8")).trim().split("\n").filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (const l of lines) {
    try {
      const r = JSON.parse(l);
      if (!r.full_name || seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      candidates.push(r);
    } catch { /* skip bad line */ }
  }
  candidates.sort((a, b) => b.stars - a.stars);
  console.log(`candidates: ${candidates.length} (deduped)`);

  const catalogPath = path.join(publicDir, "data", "games.json");
  const data = JSON.parse(await readFile(catalogPath, "utf8"));
  const existingTitles = new Set(data.games.map((g) => g.title.toLowerCase()));
  const existingIds = new Set(data.games.map((g) => g.id));

  await mkdir(workDir, { recursive: true });
  const zipsDir = path.join(workDir, "zips");
  const exDir = path.join(workDir, "extracted");
  await mkdir(zipsDir, { recursive: true });
  await rm(exDir, { recursive: true, force: true });
  await mkdir(exDir, { recursive: true });

  let added = 0, skipped = 0, budget = BUDGET_MB * 1024 * 1024, spent = 0;
  const log = [];

  for (const cand of candidates.slice(0, MAX_CANDIDATES)) {
    if (added >= 400 || spent > budget) break;
    const { full_name, branch, stars, license, desc } = cand;
    if (!ALLOWED_LICENSES.has(license)) { skipped++; continue; }
    const repoName = full_name.split("/")[1];
    const slug = "oss-" + repoName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (existingIds.has(slug) || existsSync(path.join(gamesDir, slug))) { skipped++; continue; }

    const title = humanize(repoName);
    if (existingTitles.has(title.toLowerCase())) { skipped++; continue; }

    const zipPath = path.join(zipsDir, slug + ".zip");
    const exPath = path.join(exDir, slug);
    try {
      execFileSync("curl", ["-sL", "--max-time", "90",
        `https://codeload.github.com/${full_name}/zip/refs/heads/${branch}`, "-o", zipPath], { timeout: 100000 });
      if (!existsSync(zipPath) || (await stat(zipPath)).size < 400) throw new Error("zip download failed");
      execFileSync("python3", ["-c",
        `import zipfile,sys,os; z=zipfile.ZipFile(${JSON.stringify(zipPath)}); z.extractall(${JSON.stringify(exPath)})`],
        { timeout: 60000 });
    } catch (e) {
      skipped++;
      log.push(`SKIP (fetch) ${full_name}: ${String(e.message).slice(0, 60)}`);
      continue;
    }

    const found = await findGameDir(exPath);
    if (!found) { skipped++; log.push(`SKIP (no html) ${full_name}`); continue; }
    const { gameDir, entry } = found;

    if (looksLikeServerGame(gameDir)) { skipped++; log.push(`SKIP (server) ${full_name}`); continue; }

    const size = await dirSize(gameDir);
    if (size > 6 * 1024 * 1024) { skipped++; log.push(`SKIP (size ${(size / 1048576).toFixed(1)}MB) ${full_name}`); continue; }
    if (size < 2 * 1024) { skipped++; log.push(`SKIP (empty) ${full_name}`); continue; }

    // sanity: entry html must have some substance
    const entryContent = await readFile(path.join(gameDir, entry), "utf8").catch(() => "");
    if (entryContent.length < 400) { skipped++; log.push(`SKIP (thin html) ${full_name}`); continue; }

    // copy into public/games/<slug>/
    const dest = path.join(gamesDir, slug);
    await rm(dest, { recursive: true, force: true });
    await cp(gameDir, dest, { recursive: true, filter: (p) => !SKIP_DIR_NAMES.has(path.basename(p)) });

    // include the repo LICENSE next to the game if it's not already inside gameDir
    const repoRoot = path.dirname(gameDir);
    if (repoRoot !== gameDir) {
      for (const lic of ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "LICENSE-MIT"]) {
        const src = path.join(repoRoot, lic);
        if (existsSync(src) && !existsSync(path.join(dest, lic))) {
          await cp(src, path.join(dest, lic === "LICENSE-MIT" ? "LICENSE" : lic));
          break;
        }
      }
    }

    // thumbnail
    await writeFile(path.join(thumbsDir, slug + ".svg"), makeThumb(slug, title));

    const catSource = `${desc || ""} ${repoName}`;
    const g = {
      id: slug,
      slug,
      title,
      entry: `games/${slug}/${entry}`,
      thumb: `images/thumbs/${slug}.svg`,
      category: guessCategory(catSource),
      external: false,
      featured: false,
      license: {
        status: license,
        note: `Open-source game from github.com/${full_name} (${license}). License file included in the game folder.`,
      },
      source: `GitHub: ${full_name}`,
      knownDependencies: [],
      verified: { entryPoint: true, manualPlay: "n/a" },
    };
    data.games.push(g);
    existingTitles.add(title.toLowerCase());
    existingIds.add(slug);
    added++;
    spent += size;
    console.log(`  + ${title} (${(size / 1024).toFixed(0)}KB, ${license}, ${stars}★) [${added}]`);
  }

  data.games.sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(catalogPath, JSON.stringify(data, null, 1) + "\n");
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
  await writeFile("/tmp/oss-add-log.txt", log.join("\n"));
  console.log(`\nadded ${added} games, skipped ${skipped}; total spent ${(spent / 1048576).toFixed(1)}MB`);
  console.log(`catalog now: ${data.games.length} games`);
};

main().catch((e) => { console.error(e); process.exit(1); });
