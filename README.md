# Tuffs

A self-hosted arcade portal and private web browser. Tuffs pairs a game
library copied verbatim from the [BlazerGames](https://github.com/beforeblazergithub/BlazerGames)
repository and the self-hosted portion of
[BlueDonuts/unblocked-games (NettleWeb)](https://github.com/BlueDonuts/unblocked-games)
with a [Scramjet](https://github.com/MercuryWorkshop/scramjet)-powered
browse tab, following the official
[Scramjet-App](https://github.com/MercuryWorkshop/Scramjet-App) reference
implementation. Tuffs is an independent project and is not affiliated with
any source project.

- **1,207 games**: 95 self-hosted (13 from BlazerGames, 82 from NettleWeb,
  folders under `public/games/`) and 1,112 external catalog entries that
  stream from third-party CDNs (marked "external" on their cards and
  filterable via the **Self-hosted** chip)
- Search, category filters, sorting, favorites, recently played, random pick
- Dedicated player pages with fullscreen, reload and favorite controls
- The Tuffx browser tab (Scramjet client over your own Wisp backend)
- Settings (accent color, motion, card density) and clear privacy information
- No trackers, no third-party fonts, no frameworks, no build step

---

## 1. Installation

Requirements:

- Node.js 20 or newer (matches the engines field and the Scramjet stack's
  own requirements; developed and tested on Node 20)
- npm 10.x (lockfile is `package-lock.json`; `pnpm`/`yarn` also work if you
  accept an unverified lockfile)

```bash
git clone <this repository> tuffs
cd tuffs
npm install          # installs fastify, scramjet client, wisp backend, transports
npm start            # serves on http://localhost:8080
```

Configuration is optional for local use; see `.env.example` for every
supported variable (port, auth token, destination policy, DNS, limits).

## 2. Local development

There is no build step. The portal is plain HTML/CSS/JS under `public/`,
served statically by `server/index.js`. Edit files and refresh. The Scramjet
client files are served straight out of `node_modules` (no copying needed).

```bash
npm start
# then open http://localhost:8080
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm start` | Runs the backend + portal |
| `npm run verify` | Catalog integrity check (ids, paths, thumbnails) |
| `npm test` | `verify` + full backend smoke test (routes, headers, auth) |

## 3. Production startup

```bash
# choose settings
export PORT=8080
export TUFFS_ACCESS_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
export TUFFS_SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

npm start
```

Put a TLS-terminating reverse proxy (nginx, Caddy) in front. Service workers
and the Wisp websocket require HTTPS outside localhost. See
[nginx guidance from TitaniumNetwork](https://docs.titaniumnetwork.org/guides/nginx/)
for a community-maintained proxy config reference.

## 4. Deployment model — what needs what

| Part | Static hosting enough? | Notes |
|---|---|---|
| Portal UI, catalog, settings, favorites, recently played | Yes | Pure static files; history lives in localStorage |
| Game files | Yes | Served as-is from `public/games/` |
| Tuffx browser tab (Scramjet) | **No** | Needs the Node backend: it serves `/scram/`, `/libcurl/`, `/baremux/` and the `/wisp/` websocket backend |
| Auth, rate limiting, destination policy | **No** | Server-side features |

If you host only the static files (GitHub Pages, plain nginx), the arcade
works fully; the Tuffx tab detects the missing backend and shows a setup
notice instead of a fake browser. This project does not rely on any public
third-party relay.

Verified deployment compatibility: local Node 20 process (what `npm test`
exercises). Compatibility with specific hosts (Render, Railway, Fly, Docker)
was **not** verified in this environment — the only hard requirements are
Node 20+, WebSockets, and serving HTTP; check those against your platform
before assuming support.

## 5. Configuration

All configuration is environment variables (see `.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | 8080 |
| `TUFFS_ACCESS_TOKEN` | Enables auth: everything except `/api/status` and login requires it | unset (open) |
| `TUFFS_SESSION_SECRET` | Signs session cookies (12h HMAC) | random per process |
| `TUFFS_PROXY_ALLOWLIST` | Comma-separated hostname/regex allowlist — replaces all other host rules | unset |
| `TUFFS_PROXY_BLOCKLIST` | Extra blocked hostnames (default blocklist already covers localhost/`.local`/`.internal`/`.lan`/`.home`/metadata endpoints) | unset |
| `TUFFS_STREAM_LIMIT_TOTAL` / `_PER_HOST` | Wisp stream limits per connection | unlimited |
| `TUFFS_ALLOW_UDP` | Allow UDP streams through the proxy | false |
| `TUFFS_DNS_SERVERS` | Proxy DNS resolvers | 1.1.1.3, 1.0.0.3 |
| `TUFFS_STRICT_LICENSE_MODE` | Hide games with unresolved licenses (leaves only 2048) | false |

## 6. Adding or correcting a game

The catalog lives in `public/data/games.json`; the files live in
`public/games/<slug>/`.

To add a game:

1. Copy its self-contained folder into `public/games/<slug>/` (its
   `index.html` must work with relative paths — no server rewrites).
2. Add a record to `public/data/games.json`:

```json
{
  "id": "unique-id",
  "slug": "folder-name",
  "title": "Display Title",
  "entry": "games/folder-name/index.html",
  "thumb": "images/thumbs/folder-name.jpg",
  "category": "Genre",
  "license": { "status": "unresolved", "note": "where it came from" },
  "source": "BlazerGames",
  "knownDependencies": [],
  "verified": { "entryPoint": true, "manualPlay": "no" },
  "featured": false
}
```

3. Run `npm run verify` — it will fail loudly on duplicate ids, missing
   entry points or broken thumbnail references.

Rules the code enforces: never guess an entry path (the verifier checks the
file exists), never reuse a thumbnail from a different game, keep filename
casing and URL encoding exactly as on disk.

## 7. Updating thumbnails

Drop the image into `public/images/thumbs/`, set the `thumb` field, run
`npm run verify`. Thumbnails are lazy-loaded with reserved dimensions
(320x200, 16:10 aspect) to avoid layout shift. Games without a thumbnail
(1v1.LOL, 2048 in the source repo) show a tasteful initials-based gradient
card — deliberately, not a wrong image.

## 8. Security and privacy limitations (read before public deployment)

**What the backend enforces:**

- Destination allowlist/blocklist on hostnames (wisp `hostname_whitelist`)
- Port allow/block lists
- Private, loopback, link-local, CGNAT and reserved IP ranges blocked
  (wisp-js built-ins, always on) — this covers RFC1918, 169.254.169.254
  cloud metadata, etc.
- Hostnames are resolved and the resolved IP is re-checked before
  connecting (mitigates basic DNS rebinding)
- HTTP rate limiting (400 req/min/IP), request timeouts
- Optional token authentication for every page and the websocket backend

**What it does not enforce — do not describe a public deployment as secure
based on this project alone:**

- `@fastify/rate-limit` covers HTTP routes only, **not** the `/wisp/`
  websocket upgrade. Connection-level throttling requires a reverse proxy.
- Redirect chains are followed inside the transport; a redirect to an
  allowlisted-but-different host is permitted by the wisp connection policy,
  but per-redirect interactive approval is not implemented.
- IPv6-mapped-IPv4 (`::ffff:10.0.0.1`) representations rely on ipaddr.js
  parsing; unusual encodings are an accepted residual risk.
- wisp-js does not log destinations (logging disabled by default) — but the
  OS/process level (access logs on your reverse proxy) is your
  responsibility. The portal itself stores no browsing history.
- The proxy provides **no anonymity**: your exit IP is your server's IP,
  TLS terminates at the transport, and site operators can see the traffic
  pattern. It is not a tool for evading device management or monitoring, and
  it will not bypass every filter.
- Scramjet is experimental software; some sites (strict logins, heavy
  CAPTCHAs, DRM video) do not work. That is a limitation, not a bug.

**Admin functions:** there are none beyond the environment variables —
nothing administrative is exposed over HTTP.

## 9. Privacy: what the portal stores

Everything is in your browser's localStorage under `tuffs.v1.*` keys:

| Key | Content |
|---|---|
| `tuffs.v1.favorites` | Game ids you starred |
| `tuffs.v1.history` | Last 30 games played with timestamps |
| `tuffs.v1.settings` | Accent color, motion, density |

No cookies are set for the portal itself (only the optional auth session
cookie). No trackers, no analytics. Game saves (localStorage keys set by the
games themselves) are **never touched** by the portal's clear/reset
functions. Proxy browsing history is not recorded by the portal.

## 10. Licenses and attribution

| Component | License | Notes |
|---|---|---|
| Tuffs portal code | Unlicensed (all rights reserved by the operator) | Written for this project |
| BlazerGames (games) | **No license file** | Third-party games redistributed by that repo without permission terms; see below |
| BlueDonuts/unblocked-games (NettleWeb) | MIT (software only) | Grants no rights to the games themselves; self-hosted folders copied here, external entries link to third-party CDNs |
| 2048 | MIT | Gabriele Cirulli, LICENSE.txt inside the game folder |
| Scramjet client (`@mercuryworkshop/scramjet`) | AGPL-3.0 (per its LICENSE file) | Served as an npm dependency, unmodified |
| wisp-js | LGPL-3.0-or-later | Backend |
| libcurl-transport | AGPL-3.0 | Transport |
| bare-mux | MIT | Transport multiplexer |

**Game licensing honesty:** the BlazerGames and BlueDonuts/unblocked-games
repositories redistribute commercial third-party games (Vex series, Moto X3M,
Retro Bowl, Slope, Drive Mad, Bob the Robber 2, 1v1.LOL, Minecraft/Eaglercraft
copies, and many more) and neither grants rights to the games themselves
(BlueDonuts is MIT for its software only). Tuffs marks every such entry
`license: unresolved` in the catalog and in the player UI. Only you can
decide whether running this on your private network is acceptable; for
anything public, get permission from the rights holders or remove the games
(`TUFFS_STRICT_LICENSE_MODE=true` hides all of them, leaving only the
MIT-licensed 2048). For takedowns, delete the folder under `public/games/`
and its catalog entry.

**About the NettleWeb additions:** the BlueDonuts/unblocked-games repository
(NettleWeb) ships 4,133 catalog entries in three kinds: self-contained HTML5
folders, external CDN links, and Flash/DOS games stored inside a 4.4 GB chunk
archive. Tuffs includes the first two — 82 self-hosted folders (ids prefixed
`nw-`, e.g. Minecraft Classic, Super Mario 64, Cookie Clicker, Run 3, the Vex
and Slope sequels, BitLife, Bitburner, HexGL, Shapez and more) and 1,112
external entries (ids prefixed `nwx-`) that stream from third-party servers
such as `cdn.htmlgames.com` — those are clearly labeled "external", load in
the player from their CDN, and depend entirely on that server being up (the
NettleWeb index did not carry thumbnails for the self-hosted folders, so
those cards use the title-initials fallback). The Flash and DOS entries were
**not** included: their payload lives inside a custom 4.4 GB chunk archive
that is impractical to self-host here. Entries duplicating existing
BlazerGames titles (Vex 3–7, 2048, Slope) and one unindexed folder
(`m890avdt`) were skipped so no game appears twice.

**Also inspected:** [InvisiProxynoxroxynoxy](https://github.com/Americarna/InvisiProxynoxroxynoxy)
(a fork of QuiteAFancyEmerald's InvisiProxy LTS, AGPL-3.0). **No code was
reused from it.** Reasons: (1) it is a complete alternative portal running
Ultraviolet *and* Scramjet — merging engines would duplicate the proxy
layer without a documented need, and the task explicitly keeps Scramjet
primary; (2) its AGPL-3.0 license would force relicensing this entire
project; (3) its game library was moved out to a separate archive (HU-Archive)
and is not part of that repo. Its value here was architectural reference:
its wisp options, blacklisting approach and production-branch guidance
informed the server configuration choices above.

## 11. Test results

Automated (run via `npm test`, all passing at delivery time):

```
Tuffs catalog verification
  games:  1207
  ok: ids unique and present (1207)
  ok: entry points exist (1112 external URL entries validated by format)
  ok: thumbnails verified (1080 with files, fallback used for the rest)
  ok: categories present
  ok: flags well-formed
  license summary: 1206 unresolved, 1 with a license on file

Tuffs smoke test (server + routes)
  ok: server started
  ok: portal home, css, app js, catalog json, status api (200s)
  ok: browse page with COOP/COEP headers
  ok: scramjet client + wasm, baremux, libcurl transport, sw.js
  ok: game entries (2048, vex7), game asset, thumbnail
  ok: unknown page 404s with the portal shell
  ok: auth mode: portal gated, wrong token rejected, login sets cookie, session grants access
  ALL SMOKE TESTS PASSED
```

What automated tests prove and what they don't:

- **Path exists** — verified for every local catalog entry, thumbnail and
  portal asset. The 1,112 external (`nwx-`) entries are validated as URL
  format only; they live on third-party servers.
- **Page loads** — verified over HTTP for local entry points and portal
  routes. External entries were spot-checked (the htmlgames CDN serves real
  games and does not block embedding).
- **Manually playable** — **not** verified for all 1,207 games. The original
  13 BlazerGames entries were confirmed to load and be self-contained, but
  full playthroughs were not performed. The 82 NettleWeb folders were
  checked for a self-contained `index.html`, not played. Caveats discovered
  by inspection: `motox3m2` and `vex4` load external ad/analytics scripts
  (may degrade offline); `1v1.LOL` pulls WebGL data from a DigitalOcean CDN;
  `vex5` ships a distributor sitelock config that could refuse to run on
  some domains.
- Frontend interactions (search, favorites, player, settings) were exercised
  via code review and syntax/static checks, not a real browser session in
  this environment.

Manual checklist for operators (recommended before trusting a deployment):

1. Open the portal, search a title, star a game, reload — favorite persists.
2. Play two games, check "Recently Played" ordering.
3. Fullscreen a game; reload it (confirm dialog appears).
4. Open Browse, load a plain site (e.g. `example.com`), try back/reload/home.
5. With `TUFFS_ACCESS_TOKEN` set, confirm the login gate and that `/wisp/`
   refuses unauthenticated upgrades.
6. With `TUFFS_PROXY_ALLOWLIST=example.com`, confirm other hosts are refused.
7. Mobile viewport: no horizontal scroll, sidebar collapses, cards stack.

## 12. Known issues

- `vex5` includes a sitelock JSON from its original distributor; if it
  refuses to run on your domain, that file is the reason (documented in its
  catalog entry).
- Games with ad SDKs (`motox3m2`, `drive-mad`, `vex4`) may show errors or
  delays when the ad domains are unreachable; the games themselves are local.
- The player's "loading" state relies on the iframe load event; cross-origin
  failures inside a game cannot be detected by the portal (stated in the UI
  too — the open-directly fallback is always offered).
- Address-bar sync in Browse is best-effort (Scramjet exposes the frame URL;
  if a client update changes that API the bar simply keeps what you typed).
- Scramjet 1.1.0 is the current stable npm release (the same version the
  official Scramjet-App pins); the 2.x line is still alpha and was not used.

## 13. Changed files and reused components

Everything under `public/` and `server/` was written for this project. The
verbatim reuse is:

- `public/games/*` — all 13 game folders copied unchanged from BlazerGames
- `public/images/thumbs/*` — 11 thumbnails copied unchanged from BlazerGames
- `public/sw.js` — mirrors the official Scramjet-App service worker
- `server/index.js` — structure follows Scramjet-App's `src/index.js`
  (Fastify + serverFactory + wisp upgrade + package asset routes), extended
  with auth, rate limiting, headers, catalog policy and allowlist logic
- Client integration in `public/js/browse.js` follows Scramjet-App's
  `public/index.js` (controller init, bare-mux transport, frame creation)
