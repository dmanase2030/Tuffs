// === SUDOKU FLOW - COMPLETE JAVASCRIPT ===

(function() {
    'use strict';

    // === CONSTANTS ===
    const GRID_SIZE = 9;
    const BOX_SIZE = 3;
    const STORAGE_PREFIX = 'sudokuflow_';

    const DIFFICULTY = {
        easy: { min: 36, max: 40, name: 'Easy' },
        medium: { min: 30, max: 35, name: 'Medium' },
        hard: { min: 25, max: 29, name: 'Hard' },
        expert: { min: 22, max: 24, name: 'Expert' },
        insane: { min: 17, max: 21, name: 'Insane' },
        custom: { min: 17, max: 50, name: 'Custom' }
    };

    // === STATE ===
    const state = {
        board: Array(81).fill(0),
        solution: Array(81).fill(0),
        fixed: Array(81).fill(false),
        notes: Array(81).fill(null).map(() => new Set()),
        history: [],
        historyIndex: -1,
        selectedCell: null,
        notesMode: false,
        gameMode: 'classic',
        difficulty: 'medium',
        customClues: 30,
        timer: 0,
        timerInterval: null,
        timerRunning: false,
        mistakes: 0,
        hintsUsed: 0,
        score: 0,
        isPaused: false,
        gameActive: false,
        editCounts: Array(81).fill(0),
        cellHistory: Array(81).fill(null).map(() => [])
    };

    const settings = {
        showTimer: true,
        autoCheck: true,
        highlightNumbers: true,
        highlightRCB: true,
        animations: true,
        sound: true,
        autoNotes: false,
        hintPenalty: true,
        mistakeMode: 'immediate',
        hintLevel: 1,
        playerName: '',
        theme: 'notion-light'
    };

    // === UTILITY FUNCTIONS ===
    function getIndex(row, col) {
        return row * GRID_SIZE + col;
    }

    function getRow(index) {
        return Math.floor(index / GRID_SIZE);
    }

    function getCol(index) {
        return index % GRID_SIZE;
    }

    function getBox(index) {
        const row = getRow(index);
        const col = getCol(index);
        return Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(col / BOX_SIZE);
    }

    function getBoxCells(boxIndex) {
        const cells = [];
        const startRow = Math.floor(boxIndex / BOX_SIZE) * BOX_SIZE;
        const startCol = (boxIndex % BOX_SIZE) * BOX_SIZE;
        for (let r = 0; r < BOX_SIZE; r++) {
            for (let c = 0; c < BOX_SIZE; c++) {
                cells.push(getIndex(startRow + r, startCol + c));
            }
        }
        return cells;
    }

    function getRowCells(row) {
        const cells = [];
        for (let col = 0; col < GRID_SIZE; col++) {
            cells.push(getIndex(row, col));
        }
        return cells;
    }

    function getColCells(col) {
        const cells = [];
        for (let row = 0; row < GRID_SIZE; row++) {
            cells.push(getIndex(row, col));
        }
        return cells;
    }

    function getRelatedCells(index) {
        const row = getRow(index);
        const col = getCol(index);
        const box = getBox(index);
        const related = new Set([
            ...getRowCells(row),
            ...getColCells(col),
            ...getBoxCells(box)
        ]);
        related.delete(index);
        return Array.from(related);
    }

    function isValid(board, index, num) {
        const row = getRow(index);
        const col = getCol(index);
        const box = getBox(index);

        // Check row
        for (let c = 0; c < GRID_SIZE; c++) {
            if (c !== col && board[getIndex(row, c)] === num) return false;
        }

        // Check column
        for (let r = 0; r < GRID_SIZE; r++) {
            if (r !== row && board[getIndex(r, col)] === num) return false;
        }

        // Check box
        const boxCells = getBoxCells(box);
        for (const cell of boxCells) {
            if (cell !== index && board[cell] === num) return false;
        }

        return true;
    }

    // Seeded random number generator (Mulberry32)
    function mulberry32(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // === PUZZLE GENERATOR ===
    function generateSolution(seed = null) {
        const board = Array(81).fill(0);
        const random = seed !== null ? mulberry32(seed) : Math.random;

        function shuffle(array) {
            const arr = [...array];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        function solve(board) {
            const empty = board.indexOf(0);
            if (empty === -1) return true;

            const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
            for (const num of numbers) {
                if (isValid(board, empty, num)) {
                    board[empty] = num;
                    if (solve(board)) return true;
                    board[empty] = 0;
                }
            }
            return false;
        }

        solve(board);
        return board;
    }

    function generatePuzzle(difficulty, seed = null, cluesOverride = null) {
        const solution = generateSolution(seed);
        const puzzle = [...solution];
        const random = seed !== null ? mulberry32(seed + 1) : Math.random;

        const { min, max } = DIFFICULTY[difficulty] || DIFFICULTY.medium;
        const clues = cluesOverride !== null
            ? Math.min(max, Math.max(min, cluesOverride))
            : min + Math.floor(random() * (max - min + 1));
        const cellsToRemove = 81 - clues;

        const indices = Array.from({ length: 81 }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        let removed = 0;
        for (const index of indices) {
            if (removed >= cellsToRemove) break;
            const temp = puzzle[index];
            puzzle[index] = 0;

            // Verify unique solution (simplified check)
            const testBoard = [...puzzle];
            if (hasUniqueSolution(testBoard)) {
                removed++;
            } else {
                puzzle[index] = temp;
            }
        }

        return { puzzle, solution };
    }

    function hasUniqueSolution(board) {
        let solutions = 0;

        function solve(b) {
            if (solutions > 1) return;
            const empty = b.indexOf(0);
            if (empty === -1) {
                solutions++;
                return;
            }

            for (let num = 1; num <= 9; num++) {
                if (isValid(b, empty, num)) {
                    b[empty] = num;
                    solve(b);
                    b[empty] = 0;
                }
            }
        }

        solve([...board]);
        return solutions === 1;
    }

    // === SOLVER ENGINE ===
    function solvePuzzle(board) {
        const b = [...board];

        function solve() {
            const empty = b.indexOf(0);
            if (empty === -1) return true;

            for (let num = 1; num <= 9; num++) {
                if (isValid(b, empty, num)) {
                    b[empty] = num;
                    if (solve()) return true;
                    b[empty] = 0;
                }
            }
            return false;
        }

        solve();
        return b;
    }

    function solveStep(board) {
        // Try naked singles
        for (let i = 0; i < 81; i++) {
            if (board[i] === 0) {
                const candidates = getCandidates(board, i);
                if (candidates.length === 1) {
                    return {
                        technique: 'Naked Single',
                        cell: i,
                        value: candidates[0],
                        explanation: `Cell R${getRow(i)+1}C${getCol(i)+1} can only be ${candidates[0]}`
                    };
                }
            }
        }

        // Try hidden singles
        for (let i = 0; i < 81; i++) {
            if (board[i] === 0) {
                const row = getRow(i);
                const col = getCol(i);
                const box = getBox(i);

                for (let num = 1; num <= 9; num++) {
                    if (!isValid(board, i, num)) continue;

                    // Check if only cell in row
                    const rowCells = getRowCells(row);
                    const canPlaceInRow = rowCells.filter(c =>
                        board[c] === 0 && isValid(board, c, num)
                    );
                    if (canPlaceInRow.length === 1 && canPlaceInRow[0] === i) {
                        return {
                            technique: 'Hidden Single (Row)',
                            cell: i,
                            value: num,
                            explanation: `In row ${row+1}, ${num} can only go in R${row+1}C${col+1}`
                        };
                    }

                    // Check if only cell in column
                    const colCells = getColCells(col);
                    const canPlaceInCol = colCells.filter(c =>
                        board[c] === 0 && isValid(board, c, num)
                    );
                    if (canPlaceInCol.length === 1 && canPlaceInCol[0] === i) {
                        return {
                            technique: 'Hidden Single (Column)',
                            cell: i,
                            value: num,
                            explanation: `In column ${col+1}, ${num} can only go in R${row+1}C${col+1}`
                        };
                    }

                    // Check if only cell in box
                    const boxCells = getBoxCells(box);
                    const canPlaceInBox = boxCells.filter(c =>
                        board[c] === 0 && isValid(board, c, num)
                    );
                    if (canPlaceInBox.length === 1 && canPlaceInBox[0] === i) {
                        return {
                            technique: 'Hidden Single (Box)',
                            cell: i,
                            value: num,
                            explanation: `In box ${box+1}, ${num} can only go in R${row+1}C${col+1}`
                        };
                    }
                }
            }
        }

        // Fallback to backtracking
        for (let i = 0; i < 81; i++) {
            if (board[i] === 0) {
                const candidates = getCandidates(board, i);
                if (candidates.length > 0) {
                    return {
                        technique: 'Backtracking Guess',
                        cell: i,
                        value: candidates[0],
                        explanation: `Trying ${candidates[0]} at R${getRow(i)+1}C${getCol(i)+1}`
                    };
                }
            }
        }

        return null;
    }

    function getCandidates(board, index) {
        const candidates = [];
        for (let num = 1; num <= 9; num++) {
            if (isValid(board, index, num)) {
                candidates.push(num);
            }
        }
        return candidates;
    }

    // === HINT ENGINE ===
    function getHint() {
        const level = parseInt(settings.hintLevel);
        const step = solveStep(state.board);

        if (!step) return null;

        const row = getRow(step.cell);
        const col = getCol(step.cell);

        if (level === 1) {
            // Gentle hint
            const hints = [
                `Look at row ${row + 1} — one number is close to being solved`,
                `Check column ${col + 1} carefully`,
                `Box ${getBox(step.cell) + 1} has an opportunity`,
                `Focus on cells with fewer possibilities`
            ];
            return {
                text: hints[Math.floor(Math.random() * hints.length)],
                cell: null,
                value: null
            };
        } else if (level === 2) {
            // Pointed hint
            return {
                text: `Cell R${row+1}C${col+1} can only be ${step.value}`,
                cell: step.cell,
                value: null
            };
        } else {
            // Full hint
            return {
                text: `Using ${step.technique}: ${step.explanation}`,
                cell: step.cell,
                value: step.value
            };
        }
    }

    // === HISTORY STACK ===
    function saveHistory() {
        // Remove any future history
        state.history = state.history.slice(0, state.historyIndex + 1);

        state.history.push({
            board: [...state.board],
            notes: state.notes.map(set => new Set(set)),
            mistakes: state.mistakes,
            hintsUsed: state.hintsUsed,
            timer: state.timer
        });

        state.historyIndex++;

        // Limit history size
        if (state.history.length > 100) {
            state.history.shift();
            state.historyIndex--;
        }

        updateUndoRedoButtons();
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            const snapshot = state.history[state.historyIndex];
            state.board = [...snapshot.board];
            state.notes = snapshot.notes.map(set => new Set(set));
            state.mistakes = snapshot.mistakes;
            state.hintsUsed = snapshot.hintsUsed;
            state.timer = snapshot.timer;

            renderBoard();
            reapplyErrorHighlight();
            updateStats();
            updateUndoRedoButtons();
            playSound('tap');
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            const snapshot = state.history[state.historyIndex];
            state.board = [...snapshot.board];
            state.notes = snapshot.notes.map(set => new Set(set));
            state.mistakes = snapshot.mistakes;
            state.hintsUsed = snapshot.hintsUsed;
            state.timer = snapshot.timer;

            renderBoard();
            reapplyErrorHighlight();
            updateStats();
            updateUndoRedoButtons();
            playSound('tap');
        }
    }

    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        undoBtn.disabled = state.historyIndex <= 0;
        redoBtn.disabled = state.historyIndex >= state.history.length - 1;
    }

    // === TIMER SYSTEM ===
    function startTimer() {
        if (!state.timerRunning && !state.isPaused) {
            state.timerRunning = true;
            state.timerInterval = setInterval(() => {
                if (state.gameMode === 'timed') {
                    // Countdown mode
                    state.timer--;
                    if (state.timer <= 0) {
                        state.timer = 0;
                        gameOver('Time is up!');
                        return;
                    }
                } else {
                    state.timer++;
                }
                updateTimerDisplay();
                autoSaveGame();
            }, 1000);
        }
    }

    function pauseTimer() {
        if (state.timerRunning) {
            clearInterval(state.timerInterval);
            state.timerRunning = false;
            state.isPaused = true;
            document.getElementById('pause-overlay').style.display = 'flex';
        }
    }

    function resumeTimer() {
        if (state.isPaused) {
            state.isPaused = false;
            document.getElementById('pause-overlay').style.display = 'none';
            startTimer();
        }
    }

    function stopTimer() {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        state.timerRunning = false;
    }

    function updateTimerDisplay() {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;

        const minutes = Math.floor(Math.abs(state.timer) / 60);
        const seconds = Math.abs(state.timer) % 60;
        let display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (state.gameMode === 'timed') {
            display = '⏱ ' + display;
        }
        timerEl.textContent = display;
        timerEl.style.display = settings.showTimer ? '' : 'none';
    }

    // === STATS TRACKER ===
    function updateStats() {
        // Mistakes
        const maxMistakes = state.gameMode === 'hardcore' ? 3 : '∞';
        document.getElementById('mistake-counter').textContent = `❌ ${state.mistakes}/${maxMistakes}`;
        document.getElementById('mistakes-display').textContent = state.mistakes;

        // Hints
        document.getElementById('hints-display').textContent = state.hintsUsed;

        // Completion
        const filled = state.board.filter(v => v !== 0).length;
        const total = 81;
        const completion = Math.round((filled / total) * 100);
        document.getElementById('completion-display').textContent = `${completion}%`;
        document.getElementById('progress-text').textContent = `${completion}%`;

        // Progress ring
        const circle = document.getElementById('progress-ring-circle');
        const circumference = 2 * Math.PI * 35;
        const offset = circumference - (completion / 100) * circumference;
        circle.style.strokeDashoffset = offset;

        // Score
        const baseScore = 2000;
        const elapsed = state.gameMode === 'timed' ? (600 - state.timer) : state.timer;
        const timePenalty = Math.floor(elapsed / 10);
        const mistakePenalty = state.mistakes * 100;
        const hintPenalty = state.hintsUsed * 50;
        state.score = Math.max(0, baseScore - timePenalty - mistakePenalty - hintPenalty);
        document.getElementById('score-display').textContent = state.score;

        // Streak
        const streak = getStreak();
        document.getElementById('streak-display').textContent = streak;

        // Best time
        const bestTime = getBestTime(state.difficulty);
        document.getElementById('best-time-display').textContent = bestTime || '--:--';

        // Strategy assistant
        updateStrategyAssistant();

        // Mini heatmap
        drawMiniHeatmap();
    }

    function updateStrategyAssistant() {
        const step = solveStep(state.board);
        const strategyEl = document.getElementById('strategy-hint');

        if (!step) {
            strategyEl.textContent = 'Keep going! You\'re doing great.';
            return;
        }

        const suggestions = [
            `Try looking for ${step.technique.toLowerCase()}`,
            `Focus on row ${getRow(step.cell) + 1}`,
            `Check column ${getCol(step.cell) + 1}`,
            `Examine box ${getBox(step.cell) + 1}`,
            `Look for cells with few candidates`
        ];

        strategyEl.textContent = suggestions[Math.floor(Math.random() * suggestions.length)];
    }

    function drawMiniHeatmap() {
        const canvas = document.getElementById('mini-heatmap');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const cellSize = 10;

        ctx.clearRect(0, 0, 90, 90);

        const maxEdits = Math.max(...state.editCounts, 1);

        for (let i = 0; i < 81; i++) {
            const row = getRow(i);
            const col = getCol(i);
            const intensity = state.editCounts[i] / maxEdits;

            ctx.fillStyle = `rgba(35, 131, 226, ${intensity})`;
            ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.strokeRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
    }

    // === SOUND ENGINE (lazy init to respect browser autoplay policies) ===
    let audioContext = null;

    function getAudioContext() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('Web Audio not supported', e);
                audioContext = null;
            }
        } else if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        return audioContext;
    }

    function playSound(type) {
        if (!settings.sound) return;
        const ctx = getAudioContext();
        if (!ctx) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;

        switch (type) {
            case 'tap':
                oscillator.frequency.setValueAtTime(220, now);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                oscillator.start(now);
                oscillator.stop(now + 0.05);
                break;

            case 'error':
                oscillator.frequency.setValueAtTime(100, now);
                gainNode.gain.setValueAtTime(0.2, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                oscillator.start(now);
                oscillator.stop(now + 0.1);
                break;

            case 'complete':
                // Arpeggio C-E-G
                const notes = [261.63, 329.63, 392.00];
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.setValueAtTime(freq, now + i * 0.1);
                    gain.gain.setValueAtTime(0.2, now + i * 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                    osc.start(now + i * 0.1);
                    osc.stop(now + i * 0.1 + 0.3);
                });
                return;

            case 'victory':
                const victoryNotes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
                victoryNotes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.setValueAtTime(freq, now + i * 0.08);
                    gain.gain.setValueAtTime(0.15, now + i * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
                    osc.start(now + i * 0.08);
                    osc.stop(now + i * 0.08 + 0.2);
                });
                return;
        }
    }

    // === SAVE SYSTEM ===
    function autoSaveGame() {
        if (state.timer % 10 === 0) {
            saveGame();
        }
    }

    function saveGame() {
        const gameState = {
            board: state.board,
            solution: state.solution,
            fixed: state.fixed,
            notes: state.notes.map(set => Array.from(set)),
            timer: state.timer,
            mistakes: state.mistakes,
            hintsUsed: state.hintsUsed,
            gameMode: state.gameMode,
            difficulty: state.difficulty,
            customClues: state.customClues,
            timestamp: Date.now(),
            editCounts: state.editCounts,
            cellHistory: state.cellHistory
        };

        localStorage.setItem(STORAGE_PREFIX + 'current_game', JSON.stringify(gameState));
    }

    function loadGame() {
        const saved = localStorage.getItem(STORAGE_PREFIX + 'current_game');
        if (!saved) return false;

        try {
            const gameState = JSON.parse(saved);
            state.board = gameState.board;
            state.solution = gameState.solution;
            state.fixed = gameState.fixed;
            state.notes = gameState.notes.map(arr => new Set(arr));
            state.timer = gameState.timer || 0;
            state.mistakes = gameState.mistakes || 0;
            state.hintsUsed = gameState.hintsUsed || 0;
            state.gameMode = gameState.gameMode || 'classic';
            state.difficulty = gameState.difficulty || 'medium';
            state.customClues = gameState.customClues || 30;
            state.editCounts = gameState.editCounts || Array(81).fill(0);
            state.cellHistory = gameState.cellHistory || Array(81).fill(null).map(() => []);

            // Sanity check: guard against corrupted saves
            if (!Array.isArray(state.board) || state.board.length !== 81 ||
                !Array.isArray(state.solution) || state.solution.length !== 81) {
                throw new Error('Corrupted save data');
            }

            // Initialize history
            state.history = [{
                board: [...state.board],
                notes: state.notes.map(set => new Set(set)),
                mistakes: state.mistakes,
                hintsUsed: state.hintsUsed,
                timer: state.timer
            }];
            state.historyIndex = 0;
            state.isPaused = false;
            state.gameActive = true;

            renderBoard();
            updateStats();
            updateTimerDisplay();
            updateGameModeDisplay();
            updateUndoRedoButtons();

            return true;
        } catch (e) {
            console.error('Error loading game:', e);
            // Discard corrupted save so it doesn't block the app
            localStorage.removeItem(STORAGE_PREFIX + 'current_game');
            return false;
        }
    }

    function saveCompletedGame() {
        const archive = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'archive') || '[]');

        archive.unshift({
            date: new Date().toISOString(),
            difficulty: state.difficulty,
            gameMode: state.gameMode,
            time: state.gameMode === 'timed' ? (600 - state.timer) : state.timer,
            mistakes: state.mistakes,
            hints: state.hintsUsed,
            score: state.score
        });

        // Keep only last 10
        if (archive.length > 10) {
            archive.pop();
        }

        localStorage.setItem(STORAGE_PREFIX + 'archive', JSON.stringify(archive));
    }

    // === THEME MANAGER ===
    function setTheme(theme) {
        if (!['notion-light', 'notion-dark', 'cream', 'paper', 'forest', 'midnight'].includes(theme)) {
            theme = 'notion-light';
        }
        settings.theme = theme;
        document.body.className = theme;
        saveSettings();
    }

    // === ACHIEVEMENT SYSTEM ===
    const ACHIEVEMENTS = {
        first_victory: { icon: '🏅', title: 'First Victory', desc: 'Complete your first puzzle' },
        ten_wins: { icon: '🔟', title: 'Ten Wins', desc: 'Complete 10 puzzles' },
        zen_master: { icon: '🧘', title: 'Zen Master', desc: 'Complete a puzzle in Zen mode' },
        speed_demon: { icon: '⚡', title: 'Speed Demon', desc: 'Complete in under 3 minutes' },
        perfect_solve: { icon: '💎', title: 'Perfect Solve', desc: 'No mistakes, no hints' },
        seven_streak: { icon: '🔥', title: '7-Day Streak', desc: '7 consecutive daily challenges' },
        no_hints_hero: { icon: '🎓', title: 'No Hints Hero', desc: '5 wins without hints' },
        hardcore_survivor: { icon: '💪', title: 'Hardcore Survivor', desc: 'Complete Hardcore mode' },
        expert_solver: { icon: '🧩', title: 'Expert Solver', desc: 'Complete 5 Expert puzzles' },
        night_owl: { icon: '🌙', title: 'Night Owl', desc: 'Solve after midnight' }
    };

    function checkAchievements() {
        const achievements = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'achievements') || '{}');
        const stats = getStats();

        // First victory
        if (stats.totalCompleted >= 1 && !achievements.first_victory) {
            unlockAchievement('first_victory');
        }

        // Ten wins
        if (stats.totalCompleted >= 10 && !achievements.ten_wins) {
            unlockAchievement('ten_wins');
        }

        // Zen master
        if (state.gameMode === 'zen' && !achievements.zen_master) {
            unlockAchievement('zen_master');
        }

        // Speed demon (use elapsed time — in timed mode the timer counts down)
        const elapsed = state.gameMode === 'timed' ? (600 - state.timer) : state.timer;
        if (elapsed < 180 && !achievements.speed_demon) {
            unlockAchievement('speed_demon');
        }

        // Perfect solve
        if (state.mistakes === 0 && state.hintsUsed === 0 && !achievements.perfect_solve) {
            unlockAchievement('perfect_solve');
        }

        // 7-day streak
        if (getStreak() >= 7 && !achievements.seven_streak) {
            unlockAchievement('seven_streak');
        }

        // Hardcore survivor
        if (state.gameMode === 'hardcore' && !achievements.hardcore_survivor) {
            unlockAchievement('hardcore_survivor');
        }

        // Expert solver
        if (state.difficulty === 'expert' && stats.expertCompleted >= 5 && !achievements.expert_solver) {
            unlockAchievement('expert_solver');
        }

        // Night owl
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 6 && !achievements.night_owl) {
            unlockAchievement('night_owl');
        }
    }

    function unlockAchievement(id) {
        const achievements = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'achievements') || '{}');
        achievements[id] = Date.now();
        localStorage.setItem(STORAGE_PREFIX + 'achievements', JSON.stringify(achievements));

        // Show notification
        const achievement = ACHIEVEMENTS[id];
        showNotification(`🎉 Achievement Unlocked: ${achievement.title}!`);
    }

    // === LEADERBOARD ===
    function addToLeaderboard(type, entry) {
        const key = STORAGE_PREFIX + 'leaderboard_' + type;
        const board = JSON.parse(localStorage.getItem(key) || '[]');

        board.push(entry);
        board.sort((a, b) => a.time - b.time);

        if (type !== 'daily') {
            // Keep top 10 for all-time
            board.splice(10);
        }

        localStorage.setItem(key, JSON.stringify(board));
    }

    function getLeaderboard(type) {
        const key = STORAGE_PREFIX + 'leaderboard_' + type;
        return JSON.parse(localStorage.getItem(key) || '[]');
    }

    // === UI CONTROLLER ===
    function renderBoard() {
        const board = document.getElementById('sudoku-board');
        board.innerHTML = '';

        for (let i = 0; i < 81; i++) {
            const cell = document.createElement('div');
            cell.className = 'sudoku-cell';
            cell.dataset.index = i;

            if (state.fixed[i]) {
                cell.classList.add('fixed');
            }

            if (state.board[i] !== 0) {
                cell.textContent = state.board[i];
            } else if (state.notes[i].size > 0) {
                const notesGrid = document.createElement('div');
                notesGrid.className = 'notes-grid';
                for (let num = 1; num <= 9; num++) {
                    const noteCell = document.createElement('div');
                    noteCell.className = 'note-cell';
                    if (state.notes[i].has(num)) {
                        noteCell.textContent = num;
                    }
                    notesGrid.appendChild(noteCell);
                }
                cell.appendChild(notesGrid);
            }

            cell.addEventListener('click', () => selectCell(i));
            board.appendChild(cell);
        }

        if (state.selectedCell !== null) {
            highlightCell(state.selectedCell);
        }
    }

    function selectCell(index) {
        // Allow selecting any cell for navigation/highlighting (fixed cells can't be edited)
        state.selectedCell = index;
        highlightCell(index);
        playSound('tap');
    }

    function highlightCell(index) {
        // Clear previous highlights
        document.querySelectorAll('.sudoku-cell').forEach(cell => {
            cell.classList.remove('selected', 'highlight-row', 'highlight-col', 'highlight-box', 'highlight-same-number');
        });

        const cells = document.querySelectorAll('.sudoku-cell');
        cells[index].classList.add('selected');

        if (settings.highlightRCB) {
            const row = getRow(index);
            const col = getCol(index);
            const box = getBox(index);

            getRowCells(row).forEach(i => cells[i].classList.add('highlight-row'));
            getColCells(col).forEach(i => cells[i].classList.add('highlight-col'));
            getBoxCells(box).forEach(i => cells[i].classList.add('highlight-box'));
        }

        if (settings.highlightNumbers && state.board[index] !== 0) {
            const num = state.board[index];
            for (let i = 0; i < 81; i++) {
                if (state.board[i] === num) {
                    cells[i].classList.add('highlight-same-number');
                }
            }
        }
    }

    function setCellValue(num) {
        if (state.selectedCell === null) return;
        if (!state.gameActive || state.isPaused) return;
        if (state.fixed[state.selectedCell]) return;

        const index = state.selectedCell;

        // Save to history before change
        saveHistory();

        if (state.notesMode) {
            // Toggle note
            if (state.notes[index].has(num)) {
                state.notes[index].delete(num);
            } else {
                state.notes[index].add(num);
            }
        } else {
            // Set value
            state.board[index] = num;
            state.notes[index].clear();

            // Track edit
            state.editCounts[index]++;
            state.cellHistory[index].push(num);

            // Auto-eliminate notes in related cells
            if (settings.autoCheck) {
                const related = getRelatedCells(index);
                related.forEach(i => {
                    state.notes[i].delete(num);
                });
            }

            // Check if correct
            // Conflict highlighting in all mistake modes (except when checking is off)
            if (settings.autoCheck) {
                const conflicting = getConflictingCells();
                if (conflicting.includes(index)) {
                    showError(index);
                    playSound('error');

                    if (settings.mistakeMode === 'immediate' && num !== state.solution[index]) {
                        state.mistakes++;
                    }

                    // Check hardcore game over
                    if (state.gameMode === 'hardcore' && state.mistakes >= 3) {
                        gameOver('You made 3 mistakes in Hardcore mode.');
                        return;
                    }
                } else if (settings.mistakeMode === 'immediate') {
                    if (settings.animations) {
                        animateCellComplete(index);
                    }
                    playSound('tap');
                } else {
                    playSound('tap');
                }
            } else {
                playSound('tap');
            }

            // Check completion
            if (isPuzzleComplete()) {
                completePuzzle();
            }
        }

        renderBoard();
        reapplyErrorHighlight();

        updateStats();
        saveGame();
    }

    function eraseCell() {
        if (state.selectedCell === null) return;
        if (!state.gameActive || state.isPaused) return;
        if (state.fixed[state.selectedCell]) return;

        const index = state.selectedCell;
        saveHistory();

        state.board[index] = 0;
        state.notes[index].clear();

        renderBoard();
        updateStats();
        playSound('tap');
        saveGame();
    }

    function toggleNotesMode() {
        state.notesMode = !state.notesMode;
        const btn = document.getElementById('notes-toggle');
        btn.classList.toggle('active', state.notesMode);
    }

    function showError(index) {
        const cells = document.querySelectorAll('.sudoku-cell');
        cells[index].classList.add('error');

        if (settings.animations) {
            setTimeout(() => {
                cells[index].classList.remove('error');
            }, 300);
        }

        // Show conflicts
        const num = state.board[index];
        const related = getRelatedCells(index);
        related.forEach(i => {
            if (state.board[i] === num) {
                cells[i].classList.add('error');
                setTimeout(() => cells[i].classList.remove('error'), 300);
            }
        });
    }

    function animateCellComplete(index) {
        const cells = document.querySelectorAll('.sudoku-cell');
        cells[index].classList.add('completed');
        setTimeout(() => {
            cells[index].classList.remove('completed');
        }, 300);
    }

    function isPuzzleComplete() {
        return state.board.every((val, i) => val === state.solution[i]);
    }

    function completePuzzle() {
        if (!state.gameActive) return;
        state.gameActive = false;
        stopTimer();

        // Save to archive
        saveCompletedGame();

        // Update best time (use elapsed time, not the raw countdown value in timed mode)
        const elapsed = state.gameMode === 'timed' ? (600 - state.timer) : state.timer;
        updateBestTime(state.difficulty, elapsed);

        // Update stats
        incrementStat('totalCompleted');
        incrementStat(state.difficulty + 'Completed');

        // Leaderboard: add to all-time (use elapsed time for timed mode)
        addToLeaderboard('all-time', {
            name: settings.playerName || 'Anonymous',
            time: elapsed,
            mistakes: state.mistakes,
            hints: state.hintsUsed,
            difficulty: state.difficulty,
            date: getTodayString()
        });

        // Update daily streak and daily leaderboard
        if (state.gameMode === 'daily') {
            updateDailyStreak();
            addToLeaderboard('daily', {
                name: settings.playerName || 'Anonymous',
                time: state.timer,
                mistakes: state.mistakes,
                hints: state.hintsUsed,
                date: getTodayString()
            });
        }

        // Check achievements
        checkAchievements();

        // Celebration
        playSound('victory');
        if (typeof confetti !== 'undefined') {
            try {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            } catch (e) {
                // Confetti library unavailable; continue without celebration effect
            }
        }

        // Animate board
        animateCompletionGlow();

        // Show completion modal
        setTimeout(() => {
            showCompletionModal();
        }, 1000);

        // Auto-start new game in infinite mode
        if (state.gameMode === 'infinite') {
            setTimeout(() => {
                document.getElementById('completion-modal').classList.remove('active');
                startNewGame(state.difficulty, 'infinite');
            }, 3000);
        }
    }

    function animateCompletionGlow() {
        const cells = document.querySelectorAll('.sudoku-cell');
        cells.forEach((cell, i) => {
            setTimeout(() => {
                cell.style.animation = 'glow 0.5s ease';
            }, i * 10);
        });
    }

    function showCompletionModal() {
        const modal = document.getElementById('completion-modal');

        const elapsed = state.gameMode === 'timed' ? (600 - state.timer) : state.timer;
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const attempts = Math.max(1, state.mistakes + state.board.filter((v, i) => v !== 0 && v === state.solution[i]).length);
        const accuracy = Math.min(100, Math.round(((attempts - state.mistakes) / attempts) * 100));

        let rank = '⭐ Beginner';
        if (state.score > 1500) rank = '⭐⭐ Expert';
        if (state.score > 1800) rank = '⭐⭐⭐ Master';

        document.getElementById('completion-time').textContent = timeStr;
        document.getElementById('completion-accuracy').textContent = accuracy + '%';
        document.getElementById('completion-score').textContent = state.score;
        document.getElementById('completion-rank').textContent = rank;

        modal.classList.add('active');
    }

    function gameOver(message) {
        if (!state.gameActive && state.board.every((v, i) => v !== 0)) return;
        state.gameActive = false;
        stopTimer();

        const modal = document.getElementById('gameover-modal');
        document.getElementById('gameover-message').textContent = message || 'You made 3 mistakes in Hardcore mode.';
        modal.classList.add('active');
    }

    // === KEYBOARD CONTROLLER ===
    function handleKeyPress(e) {
        // Don't hijack keyboard input when the user is typing in a form field
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

        // Number keys
        if (e.key >= '1' && e.key <= '9') {
            setCellValue(parseInt(e.key, 10));
            return;
        }

        // Arrow keys
        if (e.key.startsWith('Arrow') && state.selectedCell !== null) {
            const row = getRow(state.selectedCell);
            const col = getCol(state.selectedCell);

            if (e.key === 'ArrowUp' && row > 0) {
                selectCell(getIndex(row - 1, col));
                e.preventDefault();
            } else if (e.key === 'ArrowDown' && row < 8) {
                selectCell(getIndex(row + 1, col));
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' && col > 0) {
                selectCell(getIndex(row, col - 1));
                e.preventDefault();
            } else if (e.key === 'ArrowRight' && col < 8) {
                selectCell(getIndex(row, col + 1));
                e.preventDefault();
            }
            return;
        }

        // Backspace/Delete
        if (e.key === 'Backspace' || e.key === 'Delete') {
            eraseCell();
            e.preventDefault();
            return;
        }

        // Notes mode
        if (e.key === 'n' || e.key === 'N') {
            toggleNotesMode();
            return;
        }

        // Hint
        if (e.key === 'h' || e.key === 'H') {
            showHint();
            return;
        }

        // Undo/Redo
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                undo();
                e.preventDefault();
            } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
                redo();
                e.preventDefault();
            }
            return;
        }

        // Pause
        if (e.key === 'p' || e.key === 'P') {
            if (state.isPaused) {
                resumeTimer();
            } else {
                pauseTimer();
            }
            return;
        }

        // Focus mode
        if (e.key === 'f' || e.key === 'F') {
            toggleFocusMode();
            return;
        }

        // Shortcuts help
        if (e.key === '?') {
            document.getElementById('shortcuts-modal').classList.add('active');
            return;
        }

        // Escape - close modals / deselect
        if (e.key === 'Escape') {
            closeAllModals();
            state.selectedCell = null;
            renderBoard();
            return;
        }

        // Space - deselect
        if (e.key === ' ') {
            state.selectedCell = null;
            renderBoard();
            e.preventDefault();
            return;
        }
    }

    // === GAME MODES ===
    function startNewGame(difficulty, mode, cluesOverride = null) {
        // Stop current game
        stopTimer();
        closeAllModals();

        // Generate puzzle
        let puzzleData;
        if (mode === 'daily') {
            const seed = getDailySeed();
            puzzleData = generatePuzzle(difficulty, seed, cluesOverride);
        } else {
            puzzleData = generatePuzzle(difficulty, null, cluesOverride);
        }

        state.board = [...puzzleData.puzzle];
        state.solution = [...puzzleData.solution];
        state.fixed = state.board.map(v => v !== 0);
        state.notes = Array(81).fill(null).map(() => new Set());
        state.timer = mode === 'timed' ? 600 : 0;
        state.mistakes = 0;
        state.hintsUsed = 0;
        state.score = 0;
        state.gameMode = mode;
        state.difficulty = difficulty;
        state.customClues = cluesOverride !== null ? cluesOverride : state.customClues;
        state.isPaused = false;
        state.selectedCell = null;
        state.notesMode = false;
        state.gameActive = true;
        state.editCounts = Array(81).fill(0);
        state.cellHistory = Array(81).fill(null).map(() => []);

        // Initialize history
        state.history = [{
            board: [...state.board],
            notes: state.notes.map(set => new Set(set)),
            mistakes: 0,
            hintsUsed: 0,
            timer: state.timer
        }];
        state.historyIndex = 0;

        // Auto-notes if enabled
        if (settings.autoNotes) {
            fillAutoNotes();
        }

        renderBoard();
        updateStats();
        updateTimerDisplay();
        updateGameModeDisplay();
        updateUndoRedoButtons();
        saveGame();

        // Reset notes button visual state
        document.getElementById('notes-toggle').classList.remove('active');

        // Start the timer for the new game
        startTimer();
    }

    function updateGameModeDisplay() {
        const modeNames = {
            classic: 'Classic',
            daily: 'Daily Challenge',
            timed: 'Timed Rush',
            zen: 'Zen Mode',
            hardcore: 'Hardcore',
            infinite: 'Infinite',
            custom: 'Custom'
        };

        document.getElementById('game-mode-display').textContent = modeNames[state.gameMode] || 'Classic';
        document.getElementById('difficulty-display').textContent = DIFFICULTY[state.difficulty]?.name || 'Medium';
    }

    function fillAutoNotes() {
        for (let i = 0; i < 81; i++) {
            if (state.board[i] === 0) {
                const candidates = getCandidates(state.board, i);
                state.notes[i] = new Set(candidates);
            }
        }
    }

    // === DAILY CHALLENGE ===
    function getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    function getDailySeed() {
        return parseInt(getTodayString(), 10);
    }

    function updateDailyChallenge() {
        const today = getTodayString();
        const completed = localStorage.getItem(STORAGE_PREFIX + 'daily_completed');
        const modal = document.getElementById('daily-challenge-modal');

        document.getElementById('daily-date').textContent = new Date().toLocaleDateString();

        if (completed === today) {
            document.getElementById('daily-status').textContent = '✅ You\'ve completed today\'s challenge!';
            document.getElementById('start-daily-challenge').disabled = true;
        } else {
            document.getElementById('daily-status').textContent = 'Ready to start!';
            document.getElementById('start-daily-challenge').disabled = false;
        }

        updateDailyCountdown();
    }

    function updateDailyCountdown() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const countdown = `Next challenge in: ${hours}h ${minutes}m ${seconds}s`;
        const el = document.getElementById('daily-countdown');
        if (el) {
            el.textContent = countdown;
        }
    }

    function updateDailyStreak() {
        const today = getTodayString();
        localStorage.setItem(STORAGE_PREFIX + 'daily_completed', today);

        const streak = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'daily_streak') || '[]');
        if (!streak.includes(today)) {
            streak.push(today);
        }

        localStorage.setItem(STORAGE_PREFIX + 'daily_streak', JSON.stringify(streak));
    }

    function getStreak() {
        const streak = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'daily_streak') || '[]');
        if (streak.length === 0) return 0;

        // Count consecutive days (use local date strings for consistency)
        let count = 0;
        const today = new Date();

        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = getTodayStringFor(date);

            if (streak.includes(dateStr)) {
                count++;
            } else {
                break;
            }
        }

        return count;
    }

    // Local-date version of getTodayString for arbitrary dates
    function getTodayStringFor(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    // === STATS ===
    function getStats() {
        return JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'stats') || JSON.stringify({
            totalCompleted: 0,
            easyCompleted: 0,
            mediumCompleted: 0,
            hardCompleted: 0,
            expertCompleted: 0,
            insaneCompleted: 0
        }));
    }

    function incrementStat(key) {
        const stats = getStats();
        stats[key] = (stats[key] || 0) + 1;
        localStorage.setItem(STORAGE_PREFIX + 'stats', JSON.stringify(stats));
    }

    function getBestTime(difficulty) {
        const best = localStorage.getItem(STORAGE_PREFIX + 'best_time_' + difficulty);
        if (!best) return null;

        const seconds = parseInt(best, 10);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function updateBestTime(difficulty, time) {
        const current = localStorage.getItem(STORAGE_PREFIX + 'best_time_' + difficulty);
        if (!current || time < parseInt(current, 10)) {
            localStorage.setItem(STORAGE_PREFIX + 'best_time_' + difficulty, time.toString());
        }
    }

    // Returns non-fixed cells whose value conflicts with a related cell
    function reapplyErrorHighlight() {
        if (!settings.autoCheck) return;
        const cells = document.querySelectorAll('.sudoku-cell');
        getConflictingCells().forEach(i => {
            cells[i].classList.add('error');
        });
    }

    function getConflictingCells() {
        const conflicting = [];
        for (let i = 0; i < 81; i++) {
            if (state.fixed[i] || state.board[i] === 0) continue;
            const related = getRelatedCells(i);
            if (related.some(r => state.board[r] === state.board[i])) {
                conflicting.push(i);
            }
        }
        return conflicting;
    }

    // === HINT SYSTEM ===
    function showHint() {
        if (!state.gameActive || state.isPaused) return;

        const hint = getHint();
        if (!hint) {
            showNotification('No hints available!');
            return;
        }

        state.hintsUsed++;

        if (settings.hintPenalty) {
            if (state.gameMode === 'timed') {
                state.timer = Math.max(0, state.timer - 30);
            } else {
                state.timer += 30;
            }
        }

        showNotification(hint.text);

        if (hint.cell !== null) {
            selectCell(hint.cell);
        }

        if (hint.value !== null) {
            // Auto-fill the hint value
            setCellValue(hint.value);
        }

        updateStats();
        saveGame();
    }

    // === NOTIFICATIONS ===
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.background = 'var(--accent)';
        notification.style.color = 'white';
        notification.style.padding = '12px 24px';
        notification.style.borderRadius = '8px';
        notification.style.boxShadow = 'var(--shadow-hover)';
        notification.style.zIndex = '9999';
        notification.style.transition = 'opacity 0.3s ease';
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // === EXPORT / SHARE ===
    function exportPuzzle() {
        try {
            const puzzleString = state.board.map(v => v || 0).join('');
            navigator.clipboard.writeText(puzzleString).then(() => {
                showNotification('Puzzle copied to clipboard!');
            }).catch(() => {
                showNotification('Could not copy — clipboard access denied.');
            });
        } catch (e) {
            showNotification('Could not copy — clipboard not available.');
        }
    }

    function sharePuzzle() {
        try {
            const puzzleString = state.board.map(v => v || 0).join('');
            const url = `${window.location.origin}${window.location.pathname}#${puzzleString}`;
            navigator.clipboard.writeText(url).then(() => {
                showNotification('Share link copied to clipboard!');
            }).catch(() => {
                showNotification('Could not copy — clipboard access denied.');
            });
        } catch (e) {
            showNotification('Could not copy — clipboard not available.');
        }
    }

    function downloadPuzzleImage() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 540;
        canvas.width = size;
        canvas.height = size;

        // Draw board
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const cellSize = size / 9;
        ctx.font = '24px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < 81; i++) {
            const row = getRow(i);
            const col = getCol(i);
            const x = col * cellSize;
            const y = row * cellSize;

            // Grid lines
            ctx.strokeStyle = '#e8e8e5';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cellSize, cellSize);

            // Box borders
            if (col % 3 === 2 && col < 8) {
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x + cellSize, y);
                ctx.lineTo(x + cellSize, y + cellSize);
                ctx.stroke();
            }
            if (row % 3 === 2 && row < 8) {
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, y + cellSize);
                ctx.lineTo(x + cellSize, y + cellSize);
                ctx.stroke();
            }

            // Numbers
            if (state.board[i] !== 0) {
                ctx.fillStyle = state.fixed[i] ? '#1a1a1a' : '#2383e2';
                ctx.fillText(state.board[i], x + cellSize / 2, y + cellSize / 2);
            }
        }

        // Outer border
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, size, size);

        // Download
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sudoku.png';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // === LEARN MODULE ===
    const LESSONS = {
        'naked-singles': {
            title: 'Naked Singles',
            description: 'A naked single is a cell that has only one possible candidate.',
            example: 'If a cell can only be filled with the number 5 because all other numbers 1-9 already appear in its row, column, or box, then 5 is a naked single.'
        },
        'hidden-singles': {
            title: 'Hidden Singles',
            description: 'A hidden single occurs when a number can only go in one cell within a row, column, or box, even though that cell has other candidates.',
            example: 'If the number 7 can only go in one specific cell in a row, even if that cell could also be 2 or 8, the 7 is a hidden single.'
        },
        'naked-pairs': {
            title: 'Naked Pairs',
            description: 'When two cells in the same row, column, or box both have exactly the same two candidates, those candidates can be eliminated from other cells.',
            example: 'If two cells both can only be 3 or 7, then no other cell in that row can be 3 or 7.'
        },
        'pointing-pairs': {
            title: 'Pointing Pairs',
            description: 'When a candidate appears only in one box within a row or column, it can be eliminated from that row or column outside the box.',
            example: 'If 6 can only appear in the top row of a box, then 6 can be eliminated from the rest of that row outside the box.'
        },
        'x-wing': {
            title: 'X-Wing',
            description: 'When a candidate appears in exactly two cells in two different rows, and these cells are in the same two columns, the candidate can be eliminated from other cells in those columns.',
            example: 'Advanced pattern - forms an X shape on the grid.'
        },
        'swordfish': {
            title: 'Swordfish',
            description: 'Similar to X-Wing but with three rows and three columns instead of two.',
            example: 'Very advanced pattern - rarely needed in most puzzles.'
        }
    };

    function showLesson(lessonId) {
        const lesson = LESSONS[lessonId];
        if (!lesson) return;
        const content = document.getElementById('lesson-content');

        content.innerHTML = `
            <h3>${lesson.title}</h3>
            <p><strong>Description:</strong> ${lesson.description}</p>
            <p><strong>Example:</strong> ${lesson.example}</p>
            <p>Practice this technique by playing puzzles and looking for opportunities to apply it!</p>
        `;
    }

    // === ARCHIVE ===
    function showArchive() {
        const archive = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'archive') || '[]');
        const list = document.getElementById('archive-list');

        if (archive.length === 0) {
            list.innerHTML = '<p>No completed puzzles yet.</p>';
            return;
        }

        list.innerHTML = archive.map((game, index) => {
            const timeStr = `${Math.floor(game.time / 60).toString().padStart(2, '0')}:${(game.time % 60).toString().padStart(2, '0')}`;
            return `
            <div class="archive-item">
                <div class="archive-info">
                    <div class="archive-date">${new Date(game.date).toLocaleDateString()}</div>
                    <div class="archive-meta">
                        ${DIFFICULTY[game.difficulty]?.name || game.difficulty} •
                        ${timeStr} •
                        Score: ${game.score}
                    </div>
                </div>
            </div>
        `}).join('');
    }

    // === LEADERBOARD UI ===
    function showLeaderboard(tab = 'daily') {
        const content = document.getElementById('leaderboard-content');
        const board = getLeaderboard(tab);

        if (board.length === 0) {
            content.innerHTML = '<p>No entries yet. Be the first!</p>';
            return;
        }

        content.innerHTML = board.map((entry, index) => `
            <div class="leaderboard-entry">
                <span class="rank-badge">#${index + 1}</span>
                <span>${entry.name || 'Anonymous'}</span>
                <span>${Math.floor(entry.time / 60).toString().padStart(2, '0')}:${(entry.time % 60).toString().padStart(2, '0')}</span>
            </div>
        `).join('');
    }

    // === ACHIEVEMENTS UI ===
    function showAchievements() {
        const grid = document.getElementById('achievements-grid');
        const unlocked = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'achievements') || '{}');

        grid.innerHTML = Object.entries(ACHIEVEMENTS).map(([id, achievement]) => `
            <div class="achievement-card ${unlocked[id] ? 'unlocked' : 'locked'}">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-title">${achievement.title}</div>
                <div class="achievement-desc">${achievement.desc}</div>
            </div>
        `).join('');
    }

    // === CUSTOM PUZZLE ===
    function loadCustomPuzzle() {
        const input = document.getElementById('puzzle-input');
        const raw = (input.value || '').replace(/[^0-9.]/g, '').replace(/\./g, '0');

        if (raw.length !== 81) {
            showNotification('Invalid puzzle: must be exactly 81 characters (0 for empty cells).');
            return;
        }

        const puzzle = raw.split('').map(Number);

        // Validate the given clues don't conflict with themselves
        const testBoard = Array(81).fill(0);
        for (let i = 0; i < 81; i++) {
            if (puzzle[i] !== 0) {
                if (!isValid(testBoard, i, puzzle[i])) {
                    showNotification('Invalid puzzle: the given clues conflict with each other.');
                    return;
                }
                testBoard[i] = puzzle[i];
            }
        }

        // Solve to verify at least one solution exists
        const solution = solvePuzzle([...puzzle]);
        const full = solution.every(v => v !== 0);
        if (!full) {
            showNotification('Invalid puzzle: no valid solution exists for these clues.');
            return;
        }

        state.board = [...puzzle];
        state.solution = [...solution];
        state.fixed = puzzle.map(v => v !== 0);
        state.notes = Array(81).fill(null).map(() => new Set());
        state.timer = 0;
        state.mistakes = 0;
        state.hintsUsed = 0;
        state.score = 0;
        state.gameMode = 'custom';
        state.difficulty = 'custom';
        state.isPaused = false;
        state.selectedCell = null;
        state.notesMode = false;
        state.gameActive = true;
        state.editCounts = Array(81).fill(0);
        state.cellHistory = Array(81).fill(null).map(() => []);

        state.history = [{
            board: [...state.board],
            notes: state.notes.map(set => new Set(set)),
            mistakes: 0,
            hintsUsed: 0,
            timer: 0
        }];
        state.historyIndex = 0;

        renderBoard();
        updateStats();
        updateTimerDisplay();
        updateGameModeDisplay();
        updateUndoRedoButtons();
        saveGame();

        closeAllModals();
        showNotification('Custom puzzle loaded!');
        startTimer();
    }

    // === SETTINGS ===
    function loadSettings() {
        const saved = localStorage.getItem(STORAGE_PREFIX + 'settings');
        if (saved) {
            try {
                Object.assign(settings, JSON.parse(saved));
            } catch (e) {
                console.error('Error loading settings:', e);
            }
        }

        // Apply settings to UI
        document.getElementById('setting-timer').checked = settings.showTimer;
        document.getElementById('setting-auto-check').checked = settings.autoCheck;
        document.getElementById('setting-highlight-numbers').checked = settings.highlightNumbers;
        document.getElementById('setting-highlight-rcb').checked = settings.highlightRCB;
        document.getElementById('setting-animations').checked = settings.animations;
        document.getElementById('setting-sound').checked = settings.sound;
        document.getElementById('setting-auto-notes').checked = settings.autoNotes;
        document.getElementById('setting-hint-penalty').checked = settings.hintPenalty;
        document.getElementById('player-name').value = settings.playerName;

        document.querySelectorAll('input[name="mistake-mode"]').forEach(radio => {
            radio.checked = radio.value === settings.mistakeMode;
        });

        document.querySelectorAll('input[name="hint-level"]').forEach(radio => {
            radio.checked = radio.value === settings.hintLevel.toString();
        });

        setTheme(settings.theme);

        // Update sound button
        document.getElementById('sound-toggle').textContent = settings.sound ? '🔊' : '🔇';

        // Apply timer visibility after settings load
        updateTimerDisplay();
    }

    function saveSettings() {
        localStorage.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(settings));
    }

    function applySettings() {
        settings.showTimer = document.getElementById('setting-timer').checked;
        settings.autoCheck = document.getElementById('setting-auto-check').checked;
        settings.highlightNumbers = document.getElementById('setting-highlight-numbers').checked;
        settings.highlightRCB = document.getElementById('setting-highlight-rcb').checked;
        settings.animations = document.getElementById('setting-animations').checked;
        settings.sound = document.getElementById('setting-sound').checked;
        settings.autoNotes = document.getElementById('setting-auto-notes').checked;
        settings.hintPenalty = document.getElementById('setting-hint-penalty').checked;
        settings.playerName = document.getElementById('player-name').value;

        const mistakeMode = document.querySelector('input[name="mistake-mode"]:checked');
        if (mistakeMode) settings.mistakeMode = mistakeMode.value;

        const hintLevel = document.querySelector('input[name="hint-level"]:checked');
        if (hintLevel) settings.hintLevel = parseInt(hintLevel.value, 10);

        saveSettings();
        updateTimerDisplay();

        // Update sound button
        document.getElementById('sound-toggle').textContent = settings.sound ? '🔊' : '🔇';

        // Refresh highlights if number/row-col-box highlighting changed
        renderBoard();
    }

    // === MODAL HELPERS ===
    function closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    function toggleFocusMode() {
        document.body.classList.toggle('focus-mode');
    }

    // === EVENT LISTENERS ===
    function initEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });

        // Nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;

                switch (action) {
                    case 'new-game':
                        document.getElementById('new-game-modal').classList.add('active');
                        break;
                    case 'continue':
                        if (loadGame()) {
                            state.gameActive = true;
                            startTimer();
                            showNotification('Game loaded!');
                        } else {
                            showNotification('No saved game found.');
                        }
                        break;
                    case 'daily-challenge':
                        updateDailyChallenge();
                        document.getElementById('daily-challenge-modal').classList.add('active');
                        break;
                    case 'archive':
                        showArchive();
                        document.getElementById('archive-modal').classList.add('active');
                        break;
                    case 'leaderboard':
                        showLeaderboard('daily');
                        document.getElementById('leaderboard-modal').classList.add('active');
                        break;
                    case 'themes':
                        document.getElementById('themes-modal').classList.add('active');
                        break;
                    case 'stats':
                        showAchievements();
                        document.getElementById('stats-modal').classList.add('active');
                        break;
                    case 'learn':
                        document.getElementById('learn-modal').classList.add('active');
                        break;
                    case 'settings':
                        document.getElementById('settings-modal').classList.add('active');
                        break;
                }
            });
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });

        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Toolbar buttons
        document.getElementById('undo-btn').addEventListener('click', undo);
        document.getElementById('redo-btn').addEventListener('click', redo);
        document.getElementById('pause-btn').addEventListener('click', () => {
            if (state.isPaused) {
                resumeTimer();
            } else {
                pauseTimer();
            }
        });
        document.getElementById('resume-btn').addEventListener('click', resumeTimer);
        document.getElementById('sound-toggle').addEventListener('click', () => {
            settings.sound = !settings.sound;
            document.getElementById('sound-toggle').textContent = settings.sound ? '🔊' : '🔇';
            saveSettings();
        });
        document.getElementById('focus-mode-btn').addEventListener('click', toggleFocusMode);

        // Number pad
        document.querySelectorAll('.num-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const num = parseInt(btn.dataset.num, 10);
                setCellValue(num);
            });
        });

        document.getElementById('notes-toggle').addEventListener('click', toggleNotesMode);
        document.getElementById('erase-btn').addEventListener('click', eraseCell);
        document.getElementById('hint-btn').addEventListener('click', showHint);

        // New game modal
        let selectedDifficulty = 'medium';
        let selectedMode = 'classic';

        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedDifficulty = btn.dataset.difficulty;

                if (selectedDifficulty === 'custom') {
                    document.getElementById('custom-clues-container').style.display = 'block';
                } else {
                    document.getElementById('custom-clues-container').style.display = 'none';
                }
            });
        });

        document.getElementById('clue-count').addEventListener('input', (e) => {
            state.customClues = parseInt(e.target.value, 10);
            document.getElementById('clue-count-value').textContent = e.target.value;
        });

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedMode = btn.dataset.mode;

                // Start game immediately with chosen difficulty
                const clues = selectedDifficulty === 'custom' ? state.customClues : null;
                startNewGame(selectedDifficulty, selectedMode, clues);
            });
        });

        // Daily challenge
        document.getElementById('start-daily-challenge').addEventListener('click', () => {
            startNewGame('medium', 'daily');
        });

        // Settings
        document.getElementById('settings-modal').addEventListener('change', applySettings);

        document.getElementById('clear-leaderboard').addEventListener('click', () => {
            if (confirm('Clear all leaderboard data?')) {
                localStorage.removeItem(STORAGE_PREFIX + 'leaderboard_daily');
                localStorage.removeItem(STORAGE_PREFIX + 'leaderboard_all-time');
                showNotification('Leaderboard cleared!');
            }
        });

        document.getElementById('clear-all-data').addEventListener('click', () => {
            if (confirm('Clear ALL game data? This cannot be undone!')) {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith(STORAGE_PREFIX)) {
                        localStorage.removeItem(key);
                    }
                });
                location.reload();
            }
        });

        // Themes
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setTheme(btn.dataset.theme);
            });
        });

        // Leaderboard tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                showLeaderboard(btn.dataset.tab);
            });
        });

        // Learn
        document.querySelectorAll('.lesson-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showLesson(btn.dataset.lesson);
            });
        });

        // Completion modal
        document.getElementById('puzzle-rating').addEventListener('click', (e) => {
            if (e.target.classList.contains('star')) {
                const rating = parseInt(e.target.dataset.rating, 10);
                document.querySelectorAll('.star').forEach((star, i) => {
                    star.classList.toggle('filled', i < rating);
                    star.textContent = i < rating ? '★' : '☆';
                });
            }
        });

        document.getElementById('share-puzzle').addEventListener('click', sharePuzzle);
        document.getElementById('new-game-completion').addEventListener('click', () => {
            document.getElementById('completion-modal').classList.remove('active');
            document.getElementById('new-game-modal').classList.add('active');
        });

        // Game over modal
        document.getElementById('gameover-new-game').addEventListener('click', () => {
            document.getElementById('gameover-modal').classList.remove('active');
            document.getElementById('new-game-modal').classList.add('active');
        });

        // Custom puzzle
        document.getElementById('load-custom-puzzle').addEventListener('click', loadCustomPuzzle);

        // Keyboard
        document.addEventListener('keydown', handleKeyPress);

        // Resume audio context on first user interaction (browser autoplay policy)
        function unlockAudio() {
            getAudioContext();
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
        }
        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
    }

    // === INITIALIZATION ===
    function init() {
        loadSettings();
        initEventListeners();

        // Try to load saved game
        if (!loadGame()) {
            // Start a new game (timer is auto-started inside startNewGame)
            startNewGame('medium', 'classic');
        } else {
            // Resumed a saved game — start the timer
            state.gameActive = true;
            startTimer();
        }

        // Update daily countdown every second
        setInterval(updateDailyCountdown, 1000);

        // Check for URL hash (shared puzzle)
        if (window.location.hash) {
            const puzzleString = window.location.hash.substring(1);
            if (puzzleString.length === 81 && /^[0-9.]+$/.test(puzzleString)) {
                const puzzle = puzzleString.split('').map(ch => ch === '.' ? 0 : Number(ch));

                // Validate clues
                const testBoard = Array(81).fill(0);
                let valid = true;
                for (let i = 0; i < 81; i++) {
                    if (puzzle[i] !== 0) {
                        if (!isValid(testBoard, i, puzzle[i])) {
                            valid = false;
                            break;
                        }
                        testBoard[i] = puzzle[i];
                    }
                }

                if (valid) {
                    // Solve to find the solution
                    state.board = [...puzzle];
                    state.fixed = puzzle.map(v => v !== 0);
                    state.solution = solvePuzzle([...puzzle]);
                    state.notes = Array(81).fill(null).map(() => new Set());
                    state.timer = 0;
                    state.mistakes = 0;
                    state.hintsUsed = 0;
                    state.score = 0;
                    state.gameMode = 'custom';
                    state.difficulty = 'custom';
                    state.gameActive = true;
                    state.editCounts = Array(81).fill(0);
                    state.cellHistory = Array(81).fill(null).map(() => []);

                    state.history = [{
                        board: [...state.board],
                        notes: state.notes.map(set => new Set(set)),
                        mistakes: 0,
                        hintsUsed: 0,
                        timer: 0
                    }];
                    state.historyIndex = 0;

                    renderBoard();
                    updateStats();
                    updateTimerDisplay();
                    updateGameModeDisplay();
                    updateUndoRedoButtons();
                    saveGame();
                    startTimer();
                    showNotification('Shared puzzle loaded!');
                } else {
                    showNotification('Shared puzzle is invalid — starting a new game.');
                }
            }
        }
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
