# Tuffs

Browser games and a small web desktop. Live at [riseboosts.com](https://riseboosts.com).

On a computer you get the desktop: windows, a dock, and apps like Files,
Terminal, Notes and Chat. On a phone you get a simple scrollable list of
games and apps instead (there's a "Desktop" button if you want the full
thing).

## What's in it

- About 180 HTML5 games, all hosted in this repo under `public/games/`.
  Most come from [BlazerGames](https://github.com/beforeblazergithub/BlazerGames)
  and [NettleWeb](https://github.com/BlueDonuts/unblocked-games). Tuffs isn't
  affiliated with either.
- Accounts, chat and an admin panel, run as Cloudflare Pages Functions
  (`functions/`).
- A browser tab. On Cloudflare Pages it uses a basic fetch proxy
  (`functions/service/`), so simple pages load but logins, websockets and
  heavy JavaScript sites often don't. The full Scramjet browser needs the
  Node server (below), which Pages can't run.

No trackers and no web fonts. Settings, favorites and history are kept in
your browser's localStorage.

## Run it locally

Needs Node 20+.

```bash
npm install
npm start        # http://localhost:8080
```

There's no build step. Edit files in `public/` and refresh.

| Command | What it does |
|---|---|
| `npm start` | Node server: site + Scramjet browser backend |
| `npm run verify` | Checks the game catalog (ids, paths, thumbnails) |
| `npm test` | `verify` plus a smoke test of the server routes |

Settings for the Node server are environment variables; see `.env.example`.
Set `TUFFS_ACCESS_TOKEN` and `TUFFS_SESSION_SECRET` if you want it
password-protected.

## Deploying

- **Cloudflare Pages** (what riseboosts.com uses): pushes to `main` deploy
  automatically. `public/` is the site, `functions/` is the API. Unknown
  paths get `public/404.html`.
- **Node host**: needed for the full Scramjet browser (`/scram/`, `/wisp/`).
  Put it behind HTTPS; service workers and websockets need it.

## Adding a game

1. Put the game's folder in `public/games/<slug>/` (it has to work with
   relative paths).
2. Add an entry to `public/data/games.json` with `id`, `slug`, `title`,
   `entry`, `thumb` and `category`. Copy an existing entry for the format.
3. Drop a 16:10 thumbnail in `public/images/thumbs/`.
4. Run `npm run verify`.

## Limits

The browser tab is not a privacy tool. Sites see your server's IP, and some
sites (strict logins, captchas, DRM video) won't work. Rate limiting on the
Node server covers HTTP, not the `/wisp/` websocket; use a reverse proxy for
that if it's public.

## Credits

Games belong to their original authors; see each game's folder and the
`source` field in `games.json`. The browser uses
[Scramjet](https://github.com/MercuryWorkshop/scramjet) by Mercury Workshop.
