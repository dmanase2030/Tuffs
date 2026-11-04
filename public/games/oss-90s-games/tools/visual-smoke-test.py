#!/usr/bin/env python3
"""
Visual smoke-test runner for the 90s Games collection.

What this does
--------------
1. Starts a local static HTTP server rooted at the repo root.
2. Drives a real browser (headless Chromium via Playwright) at
   ``http://127.0.0.1:<port>/tools/visual-smoke-test.html``.
3. For each game listed under ``/games/`` it:
     - loads the game in an 800x600 iframe,
     - waits 3 s for init and hashes every canvas's pixel buffer,
     - waits 2 more seconds and hashes again (5 s mark),
     - if hashes match, dispatches a synthetic ArrowRight + Space and waits
       2 more seconds for a final hash (7 s mark),
     - records console errors and unhandled rejections from the iframe.
4. Writes ``docs/SMOKE_TEST_REPORT.md`` with one row per game.

Status definitions
------------------
- ``PASS``           : the canvas changed between 3 s and 5 s. No console errors.
- ``STATIC``         : no change at 5 s, but the canvas changed after input.
- ``UNRESPONSIVE``   : no change at 5 s and no change after input either.
- ``CONSOLE_ERROR``  : the iframe surfaced at least one error / rejection.
- ``LOAD_ERROR``     : the iframe never fired ``load`` within the timeout.

Playwright is a *soft* dependency. If it is not installed, we print
install instructions and exit 0 so this script never breaks CI by accident.

Usage
-----
::

    python3 tools/visual-smoke-test.py              # run all games
    python3 tools/visual-smoke-test.py --game asteroids.html
    python3 tools/visual-smoke-test.py --skip 2048.html,breakout.html
    python3 tools/visual-smoke-test.py --report-only  # regenerate MD from JSON
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import json
import os
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
GAMES_DIR = REPO_ROOT / "games"
DOCS_DIR = REPO_ROOT / "docs"
REPORT_PATH = DOCS_DIR / "SMOKE_TEST_REPORT.md"
JSON_PATH = DOCS_DIR / "smoke-test-report.json"
HARNESS_RELPATH = "tools/visual-smoke-test.html"

INSTALL_HINT = """\
Playwright is not installed. To run this script you need:

    pip install playwright
    python -m playwright install chromium

Skipping the run. (Re-run after install -- this script will exit 0 so it
never breaks CI on machines without Playwright.)
"""


def have_playwright() -> bool:
    """Return True iff the playwright package is importable."""
    return importlib.util.find_spec("playwright") is not None


def list_games() -> list[str]:
    """Return sorted list of ``*.html`` filenames in /games/."""
    return sorted(p.name for p in GAMES_DIR.glob("*.html"))


# ---------------------------------------------------------------------------
# Local HTTP server
# ---------------------------------------------------------------------------

class QuietHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that doesn't spam stderr."""
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: D401
        return


def _pick_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(root: Path) -> tuple[ThreadingHTTPServer, int]:
    port = _pick_port()
    os.chdir(root)
    server = ThreadingHTTPServer(("127.0.0.1", port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


# ---------------------------------------------------------------------------
# Per-game test logic. Mirrors visual-smoke-test.html so a headless run and
# a manual run produce the same statuses.
# ---------------------------------------------------------------------------

HASH_AND_LISTEN_JS = r"""
(function () {
    // Attach error capture once per page load.
    if (!window.__smokeErrors) {
        window.__smokeErrors = [];
        window.addEventListener("error", function (e) {
            var msg = (e && (e.message || (e.error && e.error.message))) || "error";
            window.__smokeErrors.push(String(msg).slice(0, 240));
        });
        window.addEventListener("unhandledrejection", function (e) {
            var r = e && (e.reason && (e.reason.message || e.reason)) || "rejection";
            window.__smokeErrors.push(String(r).slice(0, 240));
        });
        try {
            var orig = console.error;
            console.error = function () {
                var parts = [];
                for (var i = 0; i < arguments.length; i++) {
                    var a = arguments[i];
                    parts.push(a && a.message ? a.message : String(a));
                }
                window.__smokeErrors.push(parts.join(" ").slice(0, 240));
                return orig.apply(console, arguments);
            };
        } catch (e) { /* ignore */ }
    }
})();
"""

HASH_CANVASES_JS = r"""
(function () {
    function hashCanvas(c) {
        try {
            var w = c.width, h = c.height;
            if (!w || !h) return "EMPTY";
            var ctx = c.getContext("2d");
            if (!ctx) return "NO2D";
            var sw = Math.min(200, w), sh = Math.min(150, h);
            var sx = Math.floor((w - sw) / 2), sy = Math.floor((h - sh) / 2);
            var data = ctx.getImageData(sx, sy, sw, sh).data;
            var hash = 2166136261;
            for (var i = 0; i < data.length; i += 16) {
                hash ^= data[i];
                hash = (hash * 16777619) >>> 0;
            }
            return hash.toString(16) + ":" + w + "x" + h;
        } catch (e) {
            return "READ_ERR";
        }
    }
    var canvases = document.querySelectorAll("canvas");
    if (!canvases.length) return ["NO_CANVAS"];
    var out = [];
    for (var i = 0; i < canvases.length; i++) out.push(hashCanvas(canvases[i]));
    return out;
})();
"""

DISPATCH_INPUT_JS = r"""
(function () {
    function fire(type, opts) {
        try {
            var ev = new KeyboardEvent(type, Object.assign({
                bubbles: true, cancelable: true
            }, opts));
            document.dispatchEvent(ev);
            if (document.body) document.body.dispatchEvent(ev);
            window.dispatchEvent(ev);
            var canvases = document.querySelectorAll("canvas");
            for (var i = 0; i < canvases.length; i++) canvases[i].dispatchEvent(ev);
        } catch (e) { /* ignore */ }
    }
    fire("keydown", { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39 });
    fire("keyup",   { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39 });
    fire("keydown", { key: " ", code: "Space", keyCode: 32, which: 32 });
    fire("keyup",   { key: " ", code: "Space", keyCode: 32, which: 32 });
})();
"""


def test_game(page: Any, base_url: str, filename: str) -> dict[str, Any]:
    """Run the smoke test for a single game and return a result dict."""
    url = f"{base_url}/games/{filename}"
    result: dict[str, Any] = {
        "game": filename,
        "status": "LOAD_ERROR",
        "notes": "",
        "hashes": [],
        "consoleErrors": [],
    }
    console_errors: list[str] = []

    def on_console(msg: Any) -> None:
        if msg.type in ("error", "warning") and msg.type == "error":
            console_errors.append(str(msg.text)[:240])

    def on_pageerror(err: Any) -> None:
        console_errors.append(str(err)[:240])

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)

    try:
        page.goto(url, wait_until="load", timeout=10000)
    except Exception as exc:  # noqa: BLE001
        result["notes"] = f"goto failed: {exc}"
        page.remove_listener("console", on_console)
        page.remove_listener("pageerror", on_pageerror)
        return result

    try:
        page.evaluate(HASH_AND_LISTEN_JS)
    except Exception:  # noqa: BLE001
        pass  # best-effort; native page-level capture still works

    time.sleep(3.0)
    h1 = page.evaluate(HASH_CANVASES_JS)
    time.sleep(2.0)
    h2 = page.evaluate(HASH_CANVASES_JS)
    result["hashes"] = [h1, h2]

    if h1 != h2:
        result["status"] = "PASS"
        result["notes"] = "animates within 5s"
    else:
        page.evaluate(DISPATCH_INPUT_JS)
        # Best-effort native keypress as well.
        with contextlib.suppress(Exception):
            page.keyboard.press("ArrowRight")
        with contextlib.suppress(Exception):
            page.keyboard.press("Space")
        time.sleep(2.0)
        h3 = page.evaluate(HASH_CANVASES_JS)
        result["hashes"].append(h3)
        if h3 != h2:
            result["status"] = "STATIC"
            result["notes"] = "static until input, then animated"
        else:
            result["status"] = "UNRESPONSIVE"
            result["notes"] = "no canvas change after input"

    # Pull in-page errors captured by our injected handlers.
    try:
        injected = page.evaluate("window.__smokeErrors || []")
        if isinstance(injected, list):
            console_errors.extend(str(x)[:240] for x in injected)
    except Exception:  # noqa: BLE001
        pass

    if console_errors:
        result["status"] = "CONSOLE_ERROR"
        result["notes"] = console_errors[0]
    result["consoleErrors"] = console_errors

    page.remove_listener("console", on_console)
    page.remove_listener("pageerror", on_pageerror)
    return result


# ---------------------------------------------------------------------------
# Report writing
# ---------------------------------------------------------------------------

REPORT_HEADER = """\
# Smoke Test Report

Generated by `tools/visual-smoke-test.py`. See
[`tools/README-smoke-test.md`](../tools/README-smoke-test.md) for how to run
this locally and what each status means.

## Status schema

| Status          | Meaning                                                         |
| --------------- | --------------------------------------------------------------- |
| `PASS`          | Canvas pixels changed between t=3s and t=5s with no errors.     |
| `STATIC`        | No motion at 5s, but motion appeared after synthetic input.     |
| `UNRESPONSIVE`  | No motion at 5s, and still no motion 2s after synthetic input.  |
| `CONSOLE_ERROR` | At least one error or unhandled rejection from the game iframe. |
| `LOAD_ERROR`    | Iframe never finished loading within the timeout.               |

A `STATIC` result is normal for menu-driven games: the title screen is
deliberately still until the player presses a key. `UNRESPONSIVE` is the
one that warrants investigation.
"""


def write_report(results: list[dict[str, Any]], total: int, when: str) -> None:
    DOCS_DIR.mkdir(exist_ok=True)
    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    lines: list[str] = [REPORT_HEADER, ""]
    lines.append(f"## Run summary")
    lines.append("")
    lines.append(f"- Generated: `{when}`")
    lines.append(f"- Games tested: **{len(results)} / {total}**")
    for key in ("PASS", "STATIC", "UNRESPONSIVE", "CONSOLE_ERROR", "LOAD_ERROR"):
        lines.append(f"- `{key}`: **{counts.get(key, 0)}**")
    lines.append("")
    lines.append("## Per-game results")
    lines.append("")
    lines.append("| # | Game | Status | Notes |")
    lines.append("| - | ---- | ------ | ----- |")
    for i, r in enumerate(results, start=1):
        notes = (r.get("notes") or "").replace("|", "\\|").replace("\n", " ")
        if len(notes) > 140:
            notes = notes[:137] + "..."
        lines.append(f"| {i} | `{r['game']}` | `{r['status']}` | {notes} |")
    lines.append("")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")

    JSON_PATH.write_text(
        json.dumps(
            {"generatedAt": when, "total": total, "results": results},
            indent=2,
        ),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Visual smoke test for 90s Games.")
    parser.add_argument("--game", help="Run a single game (filename, with or without .html).")
    parser.add_argument(
        "--skip",
        help="Comma-separated list of game filenames to skip.",
        default="",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Regenerate the Markdown report from an existing JSON file without re-running tests.",
    )
    args = parser.parse_args()

    when = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    all_games = list_games()

    if args.report_only:
        if not JSON_PATH.exists():
            print(f"No prior JSON at {JSON_PATH}. Run without --report-only first.")
            return 1
        data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        write_report(data.get("results", []), data.get("total", len(all_games)), when)
        print(f"Wrote {REPORT_PATH}")
        return 0

    if not have_playwright():
        print(INSTALL_HINT, file=sys.stderr)
        return 0

    # Build target list.
    if args.game:
        target = args.game if args.game.endswith(".html") else args.game + ".html"
        if target not in all_games:
            print(f"Unknown game: {target}", file=sys.stderr)
            return 2
        targets = [target]
    else:
        skip = {s.strip() for s in args.skip.split(",") if s.strip()}
        skip |= {s + ".html" for s in list(skip) if not s.endswith(".html")}
        targets = [g for g in all_games if g not in skip]

    print(f"Running smoke test against {len(targets)} game(s)...")

    server, port = start_server(REPO_ROOT)
    base_url = f"http://127.0.0.1:{port}"
    print(f"Local server: {base_url}")

    # Import lazily so the --report-only / no-Playwright paths above still work.
    from playwright.sync_api import sync_playwright  # type: ignore

    results: list[dict[str, Any]] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 800, "height": 600})
            page = context.new_page()
            for i, name in enumerate(targets, start=1):
                print(f"[{i}/{len(targets)}] {name}", end=" ... ", flush=True)
                try:
                    r = test_game(page, base_url, name)
                except Exception as exc:  # noqa: BLE001
                    r = {
                        "game": name,
                        "status": "LOAD_ERROR",
                        "notes": f"runner exception: {exc}",
                        "hashes": [],
                        "consoleErrors": [],
                    }
                results.append(r)
                print(r["status"])
            browser.close()
    finally:
        server.shutdown()

    write_report(results, len(targets), when)
    print(f"\nWrote {REPORT_PATH}")
    print(f"Wrote {JSON_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
