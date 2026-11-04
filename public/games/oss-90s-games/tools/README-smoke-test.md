# Visual smoke tests

A lightweight harness that loads every game in `/games/`, watches the
`<canvas>` for actual rendering activity, and flags games that fail to
animate, fail to load, or print errors to the console.

Two entry points exist:

- **`tools/visual-smoke-test.html`** — open it in a browser. Pure vanilla
  JS, no build step, no dependencies. Designed for interactive debugging.
- **`tools/visual-smoke-test.py`** — same logic, but driven by Playwright
  in headless Chromium. Designed for CI and for regenerating
  `docs/SMOKE_TEST_REPORT.md`.

Both implementations use identical hashing / wait timings so the two
tools agree on which games pass.

---

## How a test is run

For each game, the harness:

1. Loads the game in an 800x600 iframe.
2. Waits **3 seconds** for the game to initialize.
3. Calls `getImageData` on every `<canvas>` and computes an FNV-1a hash
   of a centered 200x150 pixel window.
4. Waits **2 more seconds** (t=5s) and hashes again.
5. If both hashes match, dispatches a synthetic `keydown ArrowRight`
   followed by `keydown Space`, then waits **2 more seconds** (t=7s) and
   hashes one last time.
6. Records anything the iframe emits to `window.onerror`,
   `unhandledrejection`, or `console.error`.

The hash window is centered so that static letterbox borders around a
play field do not mask real motion inside it.

---

## Status meanings

| Status          | Meaning                                                                                 | Action                                                                                |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `PASS`          | Canvas pixels changed between t=3s and t=5s. No console errors.                         | None.                                                                                 |
| `STATIC`        | No motion at 5s, but motion appeared 2s after synthetic input.                          | Expected for menu-driven games. Verify the title screen is intentional.               |
| `UNRESPONSIVE`  | No motion at 5s, and still no motion 2s after synthetic input.                          | Likely broken. Open the game by hand and confirm whether it ever animates.            |
| `CONSOLE_ERROR` | The iframe emitted at least one error or unhandled rejection.                           | Open DevTools on the failing game and fix the error. Always takes precedence.        |
| `LOAD_ERROR`    | The iframe never fired `load` within the timeout (default 10 s).                        | Check for parse errors, infinite redirects, or 404s on referenced assets.             |

`CONSOLE_ERROR` is sticky: a game that animates and also throws is
reported as `CONSOLE_ERROR`, not `PASS`, so errors do not get masked by
otherwise-working visuals.

---

## Running it

### Interactive (HTML)

```bash
# From the repo root, serve the repo over HTTP -- file:// URLs cannot
# read iframe canvas pixels because of same-origin restrictions.
python3 -m http.server 8000
# Then open in a browser:
open http://localhost:8000/tools/visual-smoke-test.html
```

Click **Start** to run all 114 games sequentially. Results stream into
the live table on the right; the JSON report is in the collapsible
panel and can be copied or downloaded.

Single-game mode:

```
http://localhost:8000/tools/visual-smoke-test.html?game=asteroids
http://localhost:8000/tools/visual-smoke-test.html?game=asteroids.html
```

Both forms work. Useful when you are iterating on one game and do not
want to wait through a 12-minute full sweep.

### Headless (Python)

```bash
# One-time setup:
pip install playwright
python -m playwright install chromium

# Full sweep, writes docs/SMOKE_TEST_REPORT.md and docs/smoke-test-report.json:
python3 tools/visual-smoke-test.py

# Single game:
python3 tools/visual-smoke-test.py --game asteroids.html

# Skip known offenders:
python3 tools/visual-smoke-test.py --skip "2048.html,breakout.html"

# Just regenerate the Markdown from the last JSON without re-running:
python3 tools/visual-smoke-test.py --report-only
```

If Playwright is not installed, the script prints an install hint and
exits 0 so CI never fails purely because of a missing optional dep.

---

## How to skip games

The Python runner accepts `--skip` with a comma-separated list of
filenames (the `.html` extension is optional, both forms work):

```bash
python3 tools/visual-smoke-test.py --skip "agar.html,bullet-hell"
```

In the browser harness, there is no built-in skip UI by design — the
intended workflow for one-off triage is to load
`visual-smoke-test.html?game=<filename>` for the specific game you care
about.

For more permanent exclusions (e.g. a game that is known to take 15+ s
to initialize and would always flag as `STATIC`), edit the `ALL_GAMES`
array near the top of `tools/visual-smoke-test.html`. Keep that array
in sync with the directory listing of `/games/`.

---

## Limitations

- The harness only inspects `<canvas>` pixels. Games that render purely
  through DOM (no `<canvas>`) will always hash to `NO_CANVAS` and be
  reported as `UNRESPONSIVE`. None of the games in this collection
  currently fall into that bucket; if one is added, extend the hashing
  logic in both files.
- WebGL contexts without `preserveDrawingBuffer: true` cannot be read
  back via a 2D `getImageData` call. Those canvases will hash to a
  constant `READ_ERR` string — which still works correctly for the
  same/different check, but means we cannot tell *what* changed, only
  *that* something did (or did not).
- Synthetic key events bypass the OS input layer, so games that gate on
  `document.hasFocus()` or on `PointerLock` may not react. Those will
  show up as `UNRESPONSIVE` even though they work for a human player.
  Cross-check with the interactive HTML harness before filing a bug.
