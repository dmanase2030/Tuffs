# Tuffs upgrade report — 2026-11-04

What was inspected, what was confirmed broken or missing, what changed, and
what is still open. Everything under "Verified" was exercised against the
live site (https://riseboosts.com) or a local test harness — nothing here is
claimed on the basis of code reading alone.

## 1. Baseline: what the repository actually is

The repo contains **two generations** of the product:

- **Live (riseboosts.com):** a Cloudflare Pages site. `public/index.html` is
  a single-file Hyprland-style desktop launcher (games, tabbed browser via a
  basic `/service/` rewriting proxy, terminal, files, notes, chat, admin).
  Backend = Pages Functions in `functions/` + a D1 database: accounts
  (PBKDF2-SHA256 @ 100k, SHA-256-hashed 30-day sessions), shared chat, admin
  panel, per-account cloud save (`/api/data`). `public/portal.html` is the
  legacy Tuffs portal, kept for rollback/reference.
- **Dormant:** the original Node backend (`server/index.js`, Fastify 5 +
  `@fastify/static` + `@fastify/rate-limit`, Wisp + Scramjet 1.1.0 +
  bare-mux + libcurl-transport in `package.json`). It is well built (Wisp
  hostname allow/block lists, private/loopback blocking, HTTP rate limits)
  but **deployed nowhere** — no host has been chosen, so the Scramjet
  browser is not wired into the live site. `public/browse.html`,
  `public/config.js`, `public/sw.js` belong to that stack.
- **Catalog:** `public/data/games.json` currently holds 11,283 entries in the
  newer flat format (mostly external URLs). The repo's own
  `scripts/verify-catalog.js` still checks the **legacy** schema
  (license info, local entry points), so it fails against the shipped
  catalog by design until the catalog is reconciled (owner decision
  pending: re-trim to the ~96 local games or keep the full set).

## 2. Confirmed problems found

| # | Problem | Status |
|---|---------|--------|
| 1 | No rate limiting on `/api/auth/login` or `/api/auth/signup` — online password brute force and account spam were unbounded | **Fixed + verified** |
| 2 | Launcher data (files, notes, settings, favorites) was browser-local only — lost on a new device/browser | **Fixed + verified** (account cloud save) |
| 3 | Decorative-only workspace dots in the top bar; no real workspaces | **Fixed + verified** |
| 4 | No tiling; windows float only | **Fixed + verified** (tile cycle with gaps) |
| 5 | No CI at all | **Fixed** (GitHub Actions workflow) |
| 6 | Game thumbnails loaded eagerly | **Fixed** (`loading="lazy"`, `decoding="async"`) |
| 7 | Search engine was a raw URL text field | **Fixed + verified** (Google / DuckDuckGo / Bing / Brave / Custom selector) |
| 8 | Boot terminal + Windows-style loading animation gated every visit | **Removed + verified** (owner request) |
| 9 | `scripts/verify-catalog.js` schema no longer matches the shipped catalog | Open — tied to the catalog decision |
| 10 | Scramjet/Wisp backend undeployed; heavy sites (e.g. YouTube) fail through the basic proxy | Open — blocked on host choice (below) |
| 11 | npm audit could not run in the build sandbox (registry policy 403) | Mitigated — CI runs `npm audit` on GitHub |

Already in good shape (verified, unchanged): password hashing and session
storage, guest games-only gating enforced server-side, the basic proxy's
SSRF blocklist (localhost / .local / .internal / metadata hostnames +
private destinations), safe-area handling on the dock, responsive layout.

## 3. Changes by phase

**Phase 1 — Security & reliability**
- `functions/api/auth/_throttle.js` (new): D1-backed, self-creating
  throttle table; every helper fails open so a throttle error can never
  break sign-in.
- `login.js`: two buckets — per (account, IP): 8 fails / 10 min → 5 min
  lock; per account (all IPs): 30 fails / 1 h → 10 min lock. Correct
  password clears both. Tradeoff documented in code: a determined attacker
  can briefly lock an account with 30+ distributed attempts.
- `signup.js`: 6 signups / IP / hour → 30 min pause.
- CI workflow (`.github/workflows/ci.yml`): ESM syntax checks for all
  Pages Functions, parse-only check of the launcher client
  (`scripts/check-client.mjs`, new), catalog JSON validation, `npm ci`,
  `npm audit --audit-level=high`.

**Phase 2 — Mobile & touch**
- Existing safe-area + responsive work verified on the live build;
  thumbnails lazy-load; workspace switcher and tile controls are
  tappable buttons ≥ 21 px with the dock at iPhone sizes.

**Phase 3 — Browser**
- The live tabbed browser (tabs, back/forward, reload, home, fullscreen,
  per-tab state) was verified earlier today, including real Bing results
  through the proxy. **Scramjet upgrade remains blocked**: it needs the
  Node backend hosted (see §5). No fake Scramjet functionality was added.

**Phase 4 — Performance & cleanup**
- Lazy/async thumbnails; favorites added to the cloud-sync set;
  catalog render cap (240 tiles) already in place. The 8.6 MB catalog
  fetch is the largest remaining startup cost — resolving it is the
  pending catalog decision, not a code change.

**Phase 5 — Hyprland UI (researched from wiki.hypr.land + real configs)**
- Real workspaces: waybar-style numbered switcher (1–4) in the top bar,
  occupied-workspace dots, `Alt+1..4` to switch, `Alt+Shift+1..4` to move
  the focused window (Hyprland's SUPER bindings, adapted to the web).
  Reopening an app jumps to its workspace; minimized windows stay
  minimized across switches.
- Tiling: titlebar tile button cycles float → left half → right half →
  full, with configurable gaps (Settings → Appearance → Window gaps,
  0–24 px, default 10 — Hyprland's gaps_in/gaps_out idea).
- Signature gradient active border `45deg, #33ccee → #00ff99` (the
  canonical `col.active_border` from hyprland.conf examples), inactive
  windows keep the subtle gray border.
- Window pop-in animation on the wiki's overshoot Bézier
  (0.05, 0.9, 0.1, 1.05); reduced-motion still respected globally.
- Theme presets in Settings → Appearance → Style: Hyprland (mono dark),
  Tokyo Night, Catppuccin, Midnight — each sets the window/glass palette
  + matching accent. Wallpaper field now notes GIF support (animated
  wallpapers work through the existing image wallpaper path).

## 4. Verification log (live, 2026-11-04)

- Login throttle, local mock-D1 harness: counting, lock at threshold,
  clear-on-success, window expiry — all pass.
- Login throttle, live: 30 wrong-password attempts → HTTP 401;
  attempts 31–32 → **HTTP 429** (per-account bucket).
- `/api/data`: unauthenticated GET and PUT → **401**; signed-in note
  typed → Saved → present after close/reopen; Settings engine change
  persisted.
- Search selector: chose Bing, saved, Browser search loaded real Bing
  results through the proxy.
- Workspaces: opened Games + Notes, switched to workspace 2 (windows
  hidden, empty desktop), back to 1 (windows restored).
- Tiling: Games snapped left half, then right half.
- Gradient border visible on the focused window (cyan/green edge).
- Tokyo Night preset visibly re-tinted all windows; restored to
  Hyprland afterwards.
- Every deploy was byte-compared against the served `index.html`.

## 5. Still open (owner decisions)

1. **Full-proxy host** (unblocks Scramjet): no free host offers
   no-card + persistent Node + WebSockets (researched 2026-11-04).
   Realistic options: Northflank Sandbox ($0, card on file), Square
   Cloud Hobby (~$2.25/mo), Hugging Face PRO ($9/mo, package prepped),
   Render ($0, card on file, service configured). Client wiring is
   prepped locally; it lands as soon as a host exists.
2. **Catalog**: keep 11,283 entries or re-trim to the ~96 local games
   (also re-enables `scripts/verify-catalog.js` after a schema update).
3. **Maintenance mode** is still ON (admin-side setting): signups are
   paused; the admin account is unaffected.

## 6. Deployment

Pushes to `main` auto-deploy via Cloudflare Pages (functions + static).
Large `public/index.html` updates go through the GitHub web upload (the
API push helper caps near 128 KB); small files use the API. Rollback for
the whole site remains the pre-Lumio backup of Arising Boosts plus git
history on `main`.

## Addendum — 2026-11-04 (evening, after the main report)

- **CI audit finding + fix:** the first CI runs failed `npm audit --audit-level=high` on the dormant backend: @fastify/static ≤10.1.8 (GHSA-8pvw-jcv7-9cmj auth bypass, GHSA-83w8-p2f5-377r traversal) + glob/minimatch moderates. Bumped to @fastify/static ^10.1.10 and regenerated the lockfile (glob 14.0.3 / minimatch 11.0.4 also clear their ranges); local smoke test passed (static 200, traversal probe 403). CI green on the bump commit. Local sandbox cannot reach the npm audit endpoint (403 policy) — CI on GitHub is the audit source of truth.
- **Hyprland pack (live):** real workspaces 1–4 (windows carry dataset.ws, Alt+1..4 switch, Alt+Shift+1..4 move), titlebar tile button (float → left → right → full) with a Settings gap slider, gradient active-window border, pop-in animation, theme presets (Hyprland / Tokyo Night / Catppuccin / Midnight), lazy game thumbnails.
- **Rofi-style launcher (live):** fuzzy search across apps, games, bookmarks and settings shortcuts; keyboard navigation; Recent row; Alt+Space. Workspaces remember their windows across reloads (per-account sync), touch swipe switches workspace.
- **Terminal (live):** rewritten as a realistic tuffs-sh — neofetch with real session data (game count, preset, uptime), virtual FS over the real catalog, theme/play/open commands, history, Tab autocomplete, Ctrl+L / Ctrl+C, Ctrl+Alt+T.
- **Tuffs Code (live):** the uploaded VS Code-style editor is integrated as the Code app, bridged to the built-in file explorer: explorer text files appear under `files/…` in the editor tree, and saving writes back into the explorer's `vfs` store (verified round-trip both ways). Editor projects sync to the account via the `codeFiles` key.
- **Incident note:** one deploy briefly broke the desktop (TDZ: render() runs before later let/const declarations). Hotfixed within ~10 minutes; a TDZ simulation check is now part of the release routine (see AGENTS.md).
- Still open: the full Scramjet proxy awaits a backend host decision (no free + no-card + persistent Node + WebSockets host exists); `scripts/verify-catalog.js` still expects the legacy catalog schema.

