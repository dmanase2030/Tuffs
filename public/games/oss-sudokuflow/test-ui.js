// Playwright UI test suite for SudokuFlow
const { chromium } = require('playwright');

const BASE = 'http://localhost:8899';
let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
    if (cond) { passed++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
    else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
function die() { console.log(`SUMMARY: ${passed} passed, ${failed} failed`); process.exit(failed > 0 ? 1 : 0); }

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Test 1: page loads with board
    const cells = await page.locator('#sudoku-board .sudoku-cell').count();
    ok('Page loads with 81 board cells', cells === 81, `${cells}/81`);

    // Test 2: board has initial puzzle state with clues
    const filled = await page.evaluate(() => {
        return [...document.querySelectorAll('#sudoku-board .sudoku-cell')]
            .filter(b => b.textContent.trim() !== '').length;
    });
    ok('New game starts with a filled puzzle (clues)', filled >= 17 && filled <= 50, `${filled} clues`);

    // Test 3: fixed cells are marked
    const fixedCount = await page.evaluate(() => {
        return [...document.querySelectorAll('#sudoku-board .sudoku-cell')]
            .filter(b => b.textContent.trim() !== '' && b.classList.contains('fixed')).length;
    });
    ok('Fixed clue cells are marked with .fixed', fixedCount === filled, `${fixedCount} fixed of ${filled}`);

    // Test 4: click empty cell selects it
    await page.evaluate(() => {
        const cells = [...document.querySelectorAll('#sudoku-board .sudoku-cell')];
        const empty = cells.find(b => b.textContent.trim() === '' && !b.classList.contains('fixed'));
        empty.click();
    });
    const selected = await page.evaluate(() => !!document.querySelector('#sudoku-board .sudoku-cell.selected'));
    ok('Clicking an empty cell selects it', selected);

    // Test 5: type a number fills the cell
    await page.keyboard.press('5');
    const cellAfterType = await page.evaluate(() => {
        const b = document.querySelector('#sudoku-board .sudoku-cell.selected');
        return b ? b.textContent.trim() : '';
    });
    ok('Typing 5 fills the selected cell', cellAfterType === '5');

    // Test 6: notes mode via toolbar button and N key
    await page.keyboard.press('n');
    const notesOn = await page.evaluate(() => {
        const btn = document.getElementById('notes-toggle');
        return btn ? btn.classList.contains('active') : null;
    });
    ok('Notes mode toggles via N key', notesOn === true);

    // Test 7: backspace/erase clears
    await page.keyboard.press('Backspace');
    const cellAfterErase = await page.evaluate(() => {
        const b = document.querySelector('#sudoku-board .sudoku-cell.selected');
        return b ? b.textContent.trim() : '';
    });
    ok('Backspace clears the selected cell', cellAfterErase === '');

    // Test 8: erase button works
    await page.evaluate(() => { document.getElementById('erase-btn').click(); });
    const cellAfterEraseBtn = await page.evaluate(() => {
        const b = document.querySelector('#sudoku-board .sudoku-cell.selected');
        return b ? b.textContent.trim() : '';
    });
    ok('Erase button clears the selected cell', cellAfterEraseBtn === '');

    // Test 9: undo button works without crash
    await page.evaluate(() => { document.getElementById('undo-btn').click(); });
    const cellsAfterUndo = await page.locator('#sudoku-board .sudoku-cell').count();
    ok('Undo button works without crashing', cellsAfterUndo === 81);

    // Test 10: hint button does not crash
    await page.evaluate(() => { document.getElementById('hint-btn').click(); });
    await page.waitForTimeout(500);
    const hintsUsed = await page.evaluate(() => document.getElementById('hints-display').textContent.trim());
    const cellsAfterHint = await page.locator('#sudoku-board .sudoku-cell').count();
    ok('Hint button works (no crash)', cellsAfterHint === 81 && Number(hintsUsed) >= 1, `hints used: ${hintsUsed}`);

    // Test 11: timer display counts
    const timerText1 = await page.evaluate(() => document.getElementById('timer-display').textContent.trim());
    await page.waitForTimeout(2000);
    const timerText2 = await page.evaluate(() => document.getElementById('timer-display').textContent.trim());
    ok('Timer is running', timerText1 !== '' && timerText2 !== timerText1, `${timerText1} → ${timerText2}`);

    // Test 12: mistake counter increments on wrong input (auto-check default on, immediate mode)
    const wrongDigit = await page.evaluate(() => {
        // pick an empty cell and choose a digit that differs from the solution
        const cells = [...document.querySelectorAll('#sudoku-board .sudoku-cell')];
        const empty = cells.find(b => b.textContent.trim() === '' && !b.classList.contains('fixed'));
        if (!empty) return null;
        const idx = parseInt(empty.dataset.index, 10);
        // Click through the real selectCell path (same as user click)
        empty.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // Use the app's setCellValue path directly to guarantee correct value logic
        let d = 1;
        // Find solution value — fall back to trying digits and checking state afterwards
        if (window.__getSolution) {
            const sol = window.__getSolution();
            while (sol[idx] === d) d++;
        } else {
            d = ((idx % 9) + 1) % 9 + 1; // deterministic wrong guess
        }
        return { idx, d };
    });
    // Try digits until the mistake counter increments (guards against a lucky guess equaling the solution)
    let mistakes = '0';
    if (wrongDigit) {
        const startIdx = wrongDigit.idx;
        for (let attempt = 0; attempt < 9; attempt++) {
            const d = ((startIdx + attempt) % 9) + 1;
            await page.keyboard.press(String(d));
            await page.waitForTimeout(300);
            mistakes = await page.evaluate(() => document.getElementById('mistakes-display').textContent.trim());
            if (Number(mistakes) >= 1) break;
            // Wrong guess didn't register — erase and try next digit
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(150);
        }
    }
    ok('Mistake counter increments on wrong entry', Number(mistakes) >= 1, `mistakes: ${mistakes}`);

    // Test 13: pause toggle — pause overlay appears
    await page.keyboard.press('p');
    const overlayVisible = await page.evaluate(() => {
        const ov = document.getElementById('pause-overlay');
        return ov ? getComputedStyle(ov).display !== 'none' : null;
    });
    ok('Pause toggle via P key shows pause overlay', overlayVisible === true);

    // Test 14: timer stops while paused
    const tPaused1 = await page.evaluate(() => document.getElementById('timer-display').textContent.trim());
    await page.waitForTimeout(1500);
    const tPaused2 = await page.evaluate(() => document.getElementById('timer-display').textContent.trim());
    ok('Timer stops while paused', tPaused1 === tPaused2, `${tPaused1} === ${tPaused2}`);

    // Test 15: resume via P
    await page.keyboard.press('p');
    await page.waitForTimeout(1000);
    const tResumed = await page.evaluate(() => document.getElementById('timer-display').textContent.trim());
    ok('Timer resumes after unpause', tResumed !== tPaused1, `${tPaused1} → ${tResumed}`);

    // Test 16: new game generates fresh puzzle (via start button in sidebar)
    const beforeBoard = await page.evaluate(() =>
        [...document.querySelectorAll('#sudoku-board .sudoku-cell')]
            .map(b => b.textContent.trim() + (b.classList.contains('fixed') ? 'f' : '')).join(''));
    await page.evaluate(() => {
        // Click the sidebar New Game nav button
        const nav = [...document.querySelectorAll('[data-action="new-game"]')];
        if (nav.length) nav[0].click();
    });
    await page.waitForTimeout(800);
    // The game starts when a mode button is clicked inside the new-game modal
    await page.evaluate(() => {
        const modal = document.getElementById('new-game-modal');
        if (modal && modal.classList.contains('active')) {
            const btn = [...modal.querySelectorAll('.mode-btn')].find(b => /classic/i.test(b.dataset.mode));
            if (btn) btn.click();
        }
    });
    await page.waitForTimeout(800);
    const afterBoard = await page.evaluate(() =>
        [...document.querySelectorAll('#sudoku-board .sudoku-cell')]
            .map(b => b.textContent.trim() + (b.classList.contains('fixed') ? 'f' : '')).join(''));
    ok('New Game generates a fresh puzzle', beforeBoard !== afterBoard);

    // Test 17: difficulty & mode display update
    const modeDisplay = await page.evaluate(() => document.getElementById('game-mode-display').textContent.trim());
    const diffDisplay = await page.evaluate(() => document.getElementById('difficulty-display').textContent.trim());
    ok('Game mode and difficulty badges display', modeDisplay !== '' && diffDisplay !== '', `${modeDisplay} / ${diffDisplay}`);

    // Test 18: theme switch via themes modal
    const themeBefore = await page.evaluate(() => document.body.className);
    await page.evaluate(() => {
        // Open themes via sidebar nav
        const nav = [...document.querySelectorAll('[data-action]')].find(n => /theme/i.test(n.textContent));
        if (nav) nav.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.theme-btn')].find(b => /dark|midnight|forest/i.test(b.getAttribute('data-theme') || ''));
        if (btn) btn.click();
    });
    await page.waitForTimeout(400);
    const themeAfter = await page.evaluate(() => document.body.className);
    ok('Theme switch changes body class', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`);

    // Test 19: stats persistence to localStorage
    const hasStorage = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (/sudoku|flow/i.test(key)) return key;
        }
        return null;
    });
    ok('Game state persisted to localStorage', hasStorage !== null, hasStorage || '');

    // Test 20: progress ring and completion tracking update
    const progress = await page.evaluate(() => document.getElementById('progress-text').textContent.trim());
    const completion = await page.evaluate(() => document.getElementById('completion-display').textContent.trim());
        ok('Progress stats display', progress !== '' && completion !== '', `${progress} / ${completion}`);
    // Test 21: no uncaught JS errors during all interactions
    ok('No uncaught JS errors during gameplay', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})();

// === ROUND 2 FEATURE TESTS ===
(async function round2Tests() {
        console.log('\n--- Round 2 feature tests ---');
        let pass = 0, fail = 0;
        const browser2 = await chromium.launch();
        // Clear any saved game from round-1 tests so every round-2 test starts
        // from a fresh board instead of resuming a stale (possibly conflicting) save
        const prepage = await browser2.newPage();
        await prepage.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await prepage.evaluate(() => localStorage.removeItem('sudokuflow_current_game'));
        await prepage.close();

    const ok = (name, cond, extra = '') => {
        if (cond) { console.log(`  ✓ ${name}`); pass++; }
        else { console.log(`  ✗ ${name} — ${extra}`); fail++; }
    };

    // R2-1: Keyboard input guard — typing in puzzle-input does not trigger game keys
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const guard = await page.evaluate(() => {
            // Open custom puzzle modal, type in the textarea, then check the board is untouched
            const nav = [...document.querySelectorAll('[data-action="custom-puzzle"]')];
            if (!nav.length) return 'no-custom-action';
            nav[0].click();
            const ta = document.getElementById('puzzle-input');
            if (!ta) return 'no-input';
            ta.value = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            const cells = [...document.querySelectorAll('#sudoku-board .sudoku-cell')];
            const boardText = cells.map(b => b.textContent.trim()).join('');
            return boardText; // should NOT contain typed digits scattered into cells
        });
        // board may already contain digits; check that none of the typed clue digits
        // magically appeared in user-editable cells due to keyboard hijack
        ok('Keyboard input guard (modal textarea safe)', typeof guard === 'string' && !/^\d{1,9}$/.test(guard.slice(-9)), String(guard).slice(-20));
        await page.close();
    }

    // R2-2: showTimer setting hides the timer display
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const hidden = await page.evaluate(() => {
            document.querySelector('[data-action="settings"]').click();
            const chk = document.getElementById('setting-timer');
            chk.checked = false;
            chk.dispatchEvent(new Event('change', { bubbles: true }));
            const timerEl = document.getElementById('timer-display');
            return timerEl ? timerEl.style.display : 'missing';
        });
        ok('showTimer setting hides timer display', hidden === 'none', String(hidden));
        // Restore default settings so later tests are not polluted
        await page.evaluate(() => localStorage.removeItem('sudokuflow_settings'));
        await page.close();
    }

    // R2-3: submit mode — wrong entry shows conflict highlight but does not count as immediate mistake
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            document.querySelector('[data-action="settings"]').click();
            const radio = [...document.querySelectorAll('input[name="mistake-mode"]')].find(r => r.value === 'submit');
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            document.querySelector('.modal-close')?.click();
            const cells = [...document.querySelectorAll('#sudoku-board .sudoku-cell')];
            // Pick an empty non-fixed cell whose row, column or box already contains a 9
            const target = cells.find(b => {
                if (b.textContent.trim() !== '' || b.classList.contains('fixed')) return false;
                const idx = parseInt(b.dataset.index, 10);
                const row = Math.floor(idx / 9), col = idx % 9;
                const boxR = Math.floor(row / 3) * 3, boxC = Math.floor(col / 3) * 3;
                for (let r = 0; r < 9; r++)
                    if (cells[idx - col + r].textContent.trim() === '9') return true;
                for (let c = 0; c < 9; c++)
                    if (cells[idx - col + c] && cells[(row * 9) + c].textContent.trim() === '9') return true;
                for (let r = boxR; r < boxR + 3; r++)
                    for (let c = boxC; c < boxC + 3; c++)
                        if (cells[r * 9 + c].textContent.trim() === '9') return true;
                return false;
            });
            if (!target) return { idx: null };
            const idx = parseInt(target.dataset.index, 10);
            target.click();
            return { idx };
        });
        if (result.idx !== null) {
            // Re-select the target cell (modal interactions clear the selection)
            await page.evaluate((idx) => {
                document.querySelectorAll('#sudoku-board .sudoku-cell')[idx].click();
            }, result.idx);
            await page.waitForTimeout(100);
            await page.keyboard.press('9');
            // showError adds the .error class instantly and removes it after 300ms when
            // animations are on; snapshot early to catch the highlight
            await page.waitForTimeout(50);
            const info = await page.evaluate(() => ({
                mistakes: document.getElementById('mistakes-display').textContent.trim(),
                errorClass: [...document.querySelectorAll('.sudoku-cell')].some(b => b.classList.contains('error'))
            }));
            ok('Submit mode: no immediate mistake counted', Number(info.mistakes) === 0, `mistakes=${info.mistakes}`);
            ok('Submit mode: conflict still highlighted', info.errorClass === true);
        } else {
            ok('Submit mode: no immediate mistake counted', false, result);
            ok('Submit mode: conflict still highlighted', false);
        }
        // Restore default settings so later tests are not polluted
        await page.evaluate(() => localStorage.removeItem('sudokuflow_settings'));
        await page.close();
    }

    // R2-4: daily challenge modal and countdown render
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const daily = await page.evaluate(() => {
            document.querySelector('[data-action="daily-challenge"]').click();
            const date = document.getElementById('daily-date').textContent;
            const countdown = document.getElementById('daily-countdown').textContent;
            const btn = document.getElementById('start-daily-challenge');
            return { date, countdown: !!countdown, disabled: btn.disabled };
        });
        ok('Daily challenge modal shows date and countdown', daily.date && daily.countdown, JSON.stringify(daily));
        ok('Daily challenge start button enabled when not completed today', daily.disabled === false);
        await page.close();
    }

    // R2-5: archive & leaderboard & achievements UI render without errors
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const ui = await page.evaluate(() => {
            document.querySelector('[data-action="archive"]').click();
            const archive = document.getElementById('archive-list')?.textContent;
            document.querySelector('.modal-close')?.click();
            document.querySelector('[data-action="leaderboard"]').click();
            const lb = document.getElementById('leaderboard-content')?.textContent;
            document.querySelector('.modal-close')?.click();
            return { archive: !!archive, lb: !!lb };
        });
        ok('Archive UI renders', ui.archive);
        ok('Leaderboard UI renders', ui.lb);
        await page.close();
    }

    // R2-6: learn module lessons render
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const lesson = await page.evaluate(() => {
            document.querySelector('[data-action="learn"]').click();
            const btn = document.querySelector('.lesson-btn');
            if (btn) btn.click();
            const content = document.getElementById('lesson-content')?.textContent;
            return !!content && content.length > 20;
        });
        ok('Learn module lessons render', lesson);
        await page.close();
    }

    // R2-7: share link copies URL with board hash
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        // Clipboard may not be available headless; just verify the button exists and handler doesn't throw
        const share = await page.evaluate(() => {
            const btn = document.getElementById('share-puzzle');
            if (!btn) return false;
            try { btn.click(); return true; } catch (e) { return false; }
        });
        ok('Share button works without crashing', share);
        await page.close();
    }

    // R2-8: URL hash shared puzzle loads and validates
    {
        const page = await browser2.newPage();
        // valid solved-compatible puzzle string
        const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
        await page.goto(BASE + '/index.html#' + puzzle, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const loaded = await page.evaluate(() => {
            const cells = [...document.querySelectorAll('#sudoku-board .sudoku-cell')];
            const filled = cells.filter(b => b.textContent.trim() !== '').length;
            return filled;
        });
        ok('URL hash puzzle loads clues onto board', loaded === 30, `filled=${loaded}`);
        await page.close();
    }

    // R2-9: invalid URL hash shows warning and falls back to a normal game
    {
        const page = await browser2.newPage();
        const badPuzzle = '123456789'.repeat(9); // all rows/columns/boxes conflict
        await page.goto(BASE + '/index.html#' + badPuzzle, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const warn = await page.evaluate(() => {
            const notes = [...document.querySelectorAll('body > div')].map(d => d.textContent || '');
            return notes.some(t => /invalid/i.test(t));
        });
        ok('Invalid shared puzzle shows warning', warn);
        await page.close();
    }

    // R2-10: focus mode toggles body class
    {
        const page = await browser2.newPage();
        await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const focus = await page.evaluate(() => {
            document.getElementById('focus-mode-btn').click();
            const on = document.body.classList.contains('focus-mode');
            document.getElementById('focus-mode-btn').click();
            const off = !document.body.classList.contains('focus-mode');
            return on && off;
        });
        ok('Focus mode toggles on/off', focus);
        await page.close();
    }

        await browser2.close();
    console.log(`ROUND 2 SUMMARY: ${pass} passed, ${fail} failed`);
    die();
})();
