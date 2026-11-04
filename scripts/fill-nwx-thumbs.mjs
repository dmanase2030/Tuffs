/**
 * Fill thumbnails for nwx- (external NettleWeb) catalog entries.
 *
 * Priority:
 *  1. cdn.htmlgames.com/<Game>/img/icon/image-300x200.jpg (og:image pattern)
 *  2. og:image parsed from the game's index.html
 *  3. NettleWeb /d/<title>.jpg library
 *  4. Generated SVG letter tile as last resort
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const thumbsDir = path.join(publicDir, "images", "thumbs", "nwx");
const catalogPath = path.join(publicDir, "data", "games.json");

const raw = await readFile(catalogPath, "utf8");
const data = JSON.parse(raw);
const targets = data.games.filter((g) => g.id.startsWith("nwx-") && !g.thumb);
console.log("nwx entries without thumb:", targets.length);
await mkdir(thumbsDir, { recursive: true });

const palette = [
  ["#0a84e8", "#0a5bc4"], ["#7a3ff0", "#4a3fc4"], ["#e3008c", "#a1306e"],
  ["#107c10", "#0a5a2a"], ["#ff8c00", "#c25e00"], ["#d13438", "#8f2326"],
  ["#038387", "#02606a"], ["#525e54", "#333d36"],
];
const tile = (title, i) => {
  const [c1, c2] = palette[i % palette.length];
  const ch = (title || "?").trim().charAt(0).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="300" height="200" fill="url(#g)"/><text x="150" y="128" font-family="system-ui,sans-serif" font-size="86" font-weight="700" fill="rgba(255,255,255,.92)" text-anchor="middle">${ch}</text></svg>\n`;
};

const isImg = (buf) =>
  buf.length > 800 &&
  (buf[0] === 0xff && buf[1] === 0xd8 || // jpeg
   buf[0] === 0x89 && buf[1] === 0x50);   // png

let ok = 0, svg = 0, fail = 0;
const queue = [...targets.entries()];
const worker = async () => {
  for (;;) {
    const item = queue.pop();
    if (!item) return;
    const [idx, g] = item;
    const file = path.join(thumbsDir, `${g.id}.jpg`);
    try {
      const m = g.entry.match(/^https:\/\/cdn\.htmlgames\.com\/([^/]+)\/index\.html$/);
      let done = false;
      if (m) {
        const u = `https://cdn.htmlgames.com/${m[1]}/img/icon/image-300x200.jpg`;
        try {
          const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (isImg(buf)) { await writeFile(file, buf); done = true; }
          }
        } catch {}
        if (!done) {
          // parse og:image from the game page
          try {
            const res = await fetch(g.entry, { signal: AbortSignal.timeout(15000) });
            if (res.ok) {
              const html = await res.text();
              const om = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/) ||
                         html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/);
              if (om) {
                const res2 = await fetch(om[1], { signal: AbortSignal.timeout(15000) });
                if (res2.ok) {
                  const buf = Buffer.from(await res2.arrayBuffer());
                  if (isImg(buf)) { await writeFile(file, buf); done = true; }
                }
              }
            }
          } catch {}
        }
      }
      if (!done) {
        const f = path.join(thumbsDir, `${g.id}.svg`);
        await writeFile(f, tile(g.title, idx));
        g.thumb = `images/thumbs/nwx/${g.id}.svg`;
        svg++;
        continue;
      }
      g.thumb = `images/thumbs/nwx/${g.id}.jpg`;
      ok++;
    } catch (e) {
      fail++;
    }
  }
};
await Promise.all(Array.from({ length: 12 }, worker));
console.log("jpg thumbs:", ok, "| svg tiles:", svg, "| failures:", fail);

const out = JSON.stringify(data, null, 1) + "\n";
await writeFile(catalogPath, out);
console.log("catalog updated; total games:", data.games.length);
