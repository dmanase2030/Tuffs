// Parse-only syntax check of the launcher's inline <script> in public/index.html.
// Catches syntax errors in CI without executing the client code.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!blocks.length) {
  console.error("check-client: no inline <script> block found in public/index.html");
  process.exit(1);
}
for (const [i, code] of blocks.entries()) {
  new vm.Script(code, { filename: `public/index.html#script-${i}` });
}
console.log(
  `check-client: OK (${blocks.length} script block(s), ${blocks.reduce((n, b) => n + b.length, 0)} chars)`
);
