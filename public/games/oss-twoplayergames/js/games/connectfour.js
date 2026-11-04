/* Connect Four - Xếp 4 — hỗ trợ chơi chung máy & online
   Quân thả rơi từ trên cao xuống dạng động (có nảy), xem trước cột khi rê chuột,
   highlight nước đi cuối và hiệu ứng ăn mừng khi thắng. */
(function () {
  function create(ctx) {
    const COLS = (ctx.options && ctx.options.cols) || 7;
    const ROWS = (ctx.options && ctx.options.rows) || 6;
    const NEED = (ctx.options && ctx.options.need) || 4;
    let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    let turn = 0;
    let over = false;
    const moveStack = []; // ngăn xếp nước đi để hoàn tác

    const boardEl = document.createElement("div");
    boardEl.className = "c4-board";
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, auto)`;
    ctx.boardEl.appendChild(boardEl);

    const cellEls = Array.from({ length: ROWS }, () => Array(COLS));
    const colEls = [];
    for (let c = 0; c < COLS; c++) {
      const colEl = document.createElement("div");
      colEl.className = "c4-col";
      colEl.style.display = "grid";
      colEl.style.gap = "8px";
      const cc = c;
      colEl.addEventListener("click", () => onClick(cc));
      colEl.addEventListener("mouseenter", () => showGhost(cc));
      colEl.addEventListener("mouseleave", () => clearGhost(cc));
      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement("div");
        cell.className = "c4-cell";
        colEl.appendChild(cell);
        cellEls[r][c] = cell;
      }
      boardEl.appendChild(colEl);
      colEls.push(colEl);
    }

    function myTurnNow() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function landingRow(c) {
      for (let row = ROWS - 1; row >= 0; row--) if (board[row][c] === null) return row;
      return -1;
    }

    function showGhost(c) {
      if (!myTurnNow()) return;
      const r = landingRow(c);
      if (r === -1) return;
      const cell = cellEls[r][c];
      cell.classList.add("ghost", turn === 0 ? "g1" : "g2");
      colEls[c].classList.add("hovercol");
    }

    function clearGhost(c) {
      for (let r = 0; r < ROWS; r++) cellEls[r][c].classList.remove("ghost", "g1", "g2");
      colEls[c].classList.remove("hovercol");
    }

    function onClick(c) {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      if (board[0][c] !== null) return; // cột đầy
      clearGhost(c);
      applyMove(c, false);
    }

    function applyMove(c, fromRemote) {
      if (over) return;
      const r = landingRow(c);
      if (r === -1) return;

      const p = turn;
      board[r][c] = p;
      moveStack.push({ r, c, p });

      // xóa highlight nước cũ
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++)
          cellEls[rr][cc].classList.remove("last");

      const cell = cellEls[r][c];
      cell.classList.add(p === 0 ? "p1" : "p2", "last");

      // hiệu ứng rơi từ trên cao: bắt đầu phía trên bàn rồi rơi xuống đúng ô
      const h = (cell.getBoundingClientRect && cell.getBoundingClientRect().height) || 56;
      const dist = (r + 1) * (h + 8);
      cell.style.setProperty("--drop", `-${dist}px`);
      cell.classList.remove("dropping");
      // ép trình duyệt reflow để animation chạy lại nếu cùng ô (an toàn)
      void (cell.offsetWidth);
      cell.classList.add("dropping");
      setTimeout(() => cell.classList.remove("dropping"), 480);

      ctx.sound("drop");

      if (!fromRemote) ctx.sendMove(c);

      const line = winningLine(r, c, p);
      if (line) {
        over = true;
        // ăn mừng sau khi quân rơi xuống
        setTimeout(() => {
          line.forEach(([rr, cc]) => cellEls[rr][cc].classList.add("win"));
          ctx.sound("capture");
        }, 360);
        ctx.incScore(p);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${p + 1} nối được ${line.length} quân — chiến thắng!`,
          `🎉 Player ${p + 1} connected ${line.length} — wins!`));
        ctx.setTurn(-1);
        return;
      }
      if (board[0].every((v) => v !== null)) {
        over = true;
        ctx.setStatus(ctx.t("🤝 Hòa! Bàn cờ đã đầy.", "🤝 Draw! The board is full."));
        ctx.setTurn(-1);
        return;
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} — bấm vào cột để thả quân.`,
        `Player ${turn + 1}'s turn — click a column to drop a disc.`));
    }

    function winningLine(r, c, p) {
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && board[nr][nc] === p) { cells.push([nr, nc]); nr += dr; nc += dc; }
        nr = r - dr; nc = c - dc;
        while (inBounds(nr, nc) && board[nr][nc] === p) { cells.unshift([nr, nc]); nr -= dr; nc -= dc; }
        if (cells.length >= NEED) return cells;
      }
      return null;
    }

    function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

    // ----- AI: minimax alpha-beta -----
    function validCols() { const v = []; for (let c = 0; c < COLS; c++) if (board[0][c] === null) v.push(c); return v; }
    function windowScore(cells, me) {
      let mine = 0, opp = 0;
      for (const v of cells) { if (v === me) mine++; else if (v !== null) opp++; }
      if (mine && opp) return 0;
      if (mine === NEED) return 10000;
      if (opp === NEED) return -10000;
      if (mine) return mine * mine;
      if (opp) return -(opp * opp) * 1.1;
      return 0;
    }
    function c4eval(me) {
      let score = 0;
      // ưu tiên cột giữa
      const mid = Math.floor(COLS / 2);
      for (let r = 0; r < ROWS; r++) if (board[r][mid] === me) score += 3;
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          for (const [dr, dc] of dirs) {
            const cells = [];
            let ok = true;
            for (let k = 0; k < NEED; k++) {
              const nr = r + dr * k, nc = c + dc * k;
              if (!inBounds(nr, nc)) { ok = false; break; }
              cells.push(board[nr][nc]);
            }
            if (ok) score += windowScore(cells, me);
          }
        }
      }
      return score;
    }
    function c4mini(cur, me, depth, alpha, beta) {
      const valid = validCols();
      if (depth === 0 || !valid.length) return c4eval(me);
      if (cur === me) {
        let v = -Infinity;
        for (const c of valid) {
          const r = landingRow(c); board[r][c] = cur;
          const sc = winningLine(r, c, cur) ? 100000 - (10 - depth) : c4mini(1 - cur, me, depth - 1, alpha, beta);
          board[r][c] = null;
          v = Math.max(v, sc); alpha = Math.max(alpha, v); if (alpha >= beta) break;
        }
        return v;
      }
      let v = Infinity;
      for (const c of valid) {
        const r = landingRow(c); board[r][c] = cur;
        const sc = winningLine(r, c, cur) ? -(100000 - (10 - depth)) : c4mini(1 - cur, me, depth - 1, alpha, beta);
        board[r][c] = null;
        v = Math.min(v, sc); beta = Math.min(beta, v); if (alpha >= beta) break;
      }
      return v;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const valid = validCols();
      if (!valid.length) return null;
      // mức Dễ thường đi ngẫu nhiên; thắng ngay luôn được ưu tiên
      for (const c of valid) { const r = landingRow(c); board[r][c] = me; const w = !!winningLine(r, c, me); board[r][c] = null; if (w) return c; }
      if (level === "easy" && Math.random() < 0.55) return valid[Math.floor(Math.random() * valid.length)];
      // chặn thắng đối thủ (Vừa/Khó)
      if (level !== "easy") {
        for (const c of valid) { const r = landingRow(c); board[r][c] = opp; const w = !!winningLine(r, c, opp); board[r][c] = null; if (w) return c; }
      }
      const depth = level === "easy" ? 2 : level === "hard" ? (COLS * ROWS > 56 ? 5 : 6) : 4;
      let best = -Infinity, pick = valid[Math.floor(valid.length / 2)];
      for (const c of valid) {
        const r = landingRow(c); board[r][c] = me;
        const sc = c4mini(opp, me, depth - 1, -Infinity, Infinity);
        board[r][c] = null;
        if (sc > best) { best = sc; pick = c; }
      }
      return pick;
    }

    function undo() {
      if (!moveStack.length) return false;
      const m = moveStack.pop();
      board[m.r][m.c] = null;
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++)
          cellEls[rr][cc].classList.remove("win", "last");
      const cell = cellEls[m.r][m.c];
      cell.className = "c4-cell";
      if (cell.style && cell.style.removeProperty) cell.style.removeProperty("--drop");
      over = false;
      turn = m.p;
      const prev = moveStack[moveStack.length - 1];
      if (prev) cellEls[prev.r][prev.c].classList.add("last");
      ctx.setTurn(turn);
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} — bấm vào cột để thả quân.`,
        `Player ${turn + 1}'s turn — click a column to drop a disc.`));
      return true;
    }

    ctx.setTurn(0);
    ctx.setStatus(ctx.t("Thả quân vào cột. Nối 4 quân cùng màu là thắng.",
      "Drop discs into columns. Connect 4 of your color to win."));
    return { applyMove, undo, aiMove };
  }

  window.GameRegistry.register({
    id: "connectfour",
    name: "Xếp 4 (Connect Four)",
    emoji: "🔴",
    description: "Thả quân xuống cột, ai nối được 4 quân thẳng hàng trước sẽ thắng. Quân rơi từ trên cao xuống có nảy động.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "cols", label: "Số cột", default: 7,
        choices: [
          { value: 5, label: "5 cột" },
          { value: 7, label: "7 cột (chuẩn)" },
          { value: 9, label: "9 cột" },
        ],
      },
      {
        id: "rows", label: "Số hàng", default: 6,
        choices: [
          { value: 5, label: "5 hàng" },
          { value: 6, label: "6 hàng (chuẩn)" },
          { value: 8, label: "8 hàng" },
        ],
      },
      {
        id: "need", label: "Số quân để thắng", default: 4,
        choices: [
          { value: 3, label: "3 quân (dễ)" },
          { value: 4, label: "4 quân (chuẩn)" },
          { value: 5, label: "5 quân (khó)" },
        ],
      },
    ],
    howTo: [
      "Bấm vào một cột để thả quân của mình xuống — quân sẽ RƠI từ trên cao xuống ô trống thấp nhất của cột đó.",
      "Rê chuột lên một cột để xem trước vị trí quân sẽ rơi (quân mờ).",
      "Hai người luân phiên thả quân (Người chơi 1 màu đỏ, Người chơi 2 màu xanh).",
      "Mục tiêu: nối được 4 quân cùng màu thành một hàng — ngang, dọc hoặc chéo.",
      "Ai nối đủ 4 quân trước sẽ thắng (đường thắng sẽ sáng lên). Lấp đầy bàn mà chưa ai thắng thì hòa.",
    ],
    create,
  });
})();
