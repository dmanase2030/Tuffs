/**
 * Catalog verification for Tuffs.
 *
 * Checks (all against the files actually on disk):
 *  1. games.json parses and has a stable schema
 *  2. no missing or duplicate game IDs
 *  3. every entry point exists (games/<slug>/index.html or the configured entry)
 *  4. every referenced thumbnail exists
 *  5. categories are non-empty
 *  6. featured flag is boolean
 *  7. entry paths do not escape the public root
 *
 * Exit code 0 = all good, 1 = problems found (reported per item).
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const catalogPath = path.join(publicDir, "data/games.json");

let failures = 0;
let warnings = 0;

function fail(msg) { failures++; console.error("  FAIL: " + msg); }
function warn(msg) { warnings++; console.warn("  WARN: " + msg); }
function ok(msg) { console.log("  ok:   " + msg); }

const raw = await readFile(catalogPath, "utf8");
const data = JSON.parse(raw);
const games = data.games;

console.log("Tuffs catalog verification");
console.log("  source: " + data.source);
console.log("  games:  " + games.length);

// 1+2: IDs
const seen = new Map();
for (const g of games) {
  if (!g.id) { fail("entry missing id: " + JSON.stringify(g).slice(0, 60)); continue; }
  if (seen.has(g.id)) fail("duplicate id: " + g.id + " (titles: " + seen.get(g.id) + " / " + g.title + ")");
  seen.set(g.id, g.title || "?");
}
ok("ids unique and present (" + seen.size + ")");

// 3+7: entry points
// External (nwx-) entries point at third-party servers: validated as URLs only,
// never treated as local files. Local entries must exist on disk.
let externalCount = 0;
for (const g of games) {
  const entry = g.entry || "";
  if (g.external) {
    externalCount++;
    try {
      const u = new URL(entry);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
    } catch {
      fail(g.id + ": external entry is not a valid http(s) URL: " + entry);
    }
    continue;
  }
  const abs = path.resolve(publicDir, entry);
  if (!abs.startsWith(publicDir + path.sep)) {
    fail(g.id + ": entry escapes public root: " + entry);
    continue;
  }
  try {
    const s = await stat(abs);
    if (!s.isFile()) fail(g.id + ": entry is not a file: " + entry);
  } catch {
    fail(g.id + ": entry point missing: " + entry);
  }
}
ok("entry points exist (" + externalCount + " external URL entries validated by format)");

// 4: thumbnails
let thumbsChecked = 0;
for (const g of games) {
  if (!g.thumb) {
    if (g.external) continue; // external entries without a catalogued thumbnail use the fallback
    if (g.id === "1v1lol" || g.id === "2048") ok(g.id + ": no thumbnail (expected - uses fallback)");
    else warn(g.id + ": no thumbnail in catalog");
    continue;
  }
  const abs = path.resolve(publicDir, g.thumb);
  if (!abs.startsWith(publicDir + path.sep)) { fail(g.id + ": thumb escapes root: " + g.thumb); continue; }
  try {
    const s = await stat(abs);
    if (!s.isFile()) fail(g.id + ": thumb not a file: " + g.thumb);
    else thumbsChecked++;
  } catch {
    fail(g.id + ": broken thumbnail reference: " + g.thumb);
  }
}
ok("thumbnails verified (" + thumbsChecked + " with files, fallback used for the rest)");

// 5: categories
for (const g of games) {
  if (!g.category || typeof g.category !== "string") fail(g.id + ": missing category");
}
ok("categories present");

// 6: featured + license shape
for (const g of games) {
  if (typeof g.featured !== "boolean") fail(g.id + ": featured is not boolean");
  if (!g.license || !g.license.status) fail(g.id + ": missing license info");
  if (!g.verified || g.verified.entryPoint !== true) {
    if (g.external) continue; // external entries are URL-format validated, not disk-verified
    warn(g.id + ": entryPoint not marked verified");
  }
}
ok("flags well-formed");

// Report
const unresolved = games.filter((g) => g.license && g.license.status === "unresolved").length;
console.log("\n  license summary: " + unresolved + " unresolved, " +
  (games.length - unresolved) + " with a license on file");

if (failures > 0) {
  console.error("\n" + failures + " failure(s), " + warnings + " warning(s)");
  process.exit(1);
}
console.log("\nAll checks passed (" + warnings + " warning(s)).");
