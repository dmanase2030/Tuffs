/* Gomoku - Cờ Caro (nối N quân) — chơi chung máy & online */
(function () {
  function create(ctx) {
    const N = (ctx.options && ctx.options.size) || 15;
    const NEED = (ctx.options && ctx.options.need) || 5;
    let board = Array.from({ length: N }, () => Array(N).fill(null));
    let turn = 0;
    let over = false;

    const boardEl = document.createElement("div");
    boardEl.className = "gmk-board";
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    boardEl.style.setProperty("--n", N);
    ctx.boardEl.appendChild(boardEl);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "gmk-cell";
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        boardEl.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function onClick(r, c) {
      if (over || board[r][c] !== null) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      applyMove({ r, c }, false);
    }

    let lastCell = null;
    const moveStack = []; // ngăn xếp nước đi để hoàn tác

    function applyMove(move, fromRemote) {
      const { r, c } = move;
      if (over || board[r][c] !== null) return;
      const p = turn;
      board[r][c] = p;
      moveStack.push({ r, c, p, prev: lastCell });
      const stone = document.createElement("div");
      stone.className = "gmk-stone " + (p === 0 ? "p1" : "p2");
      stone.textContent = p === 0 ? "X" : "O";
      cellEls[r][c].appendChild(stone);
      // highlight nước đi cuối
      if (lastCell) cellEls[lastCell[0]][lastCell[1]].classList.remove("last");
      cellEls[r][c].classList.add("last");
      lastCell = [r, c];
      ctx.sound("place");

      if (!fromRemote) ctx.sendMove({ r, c });

      const line = winningLine(r, c, p);
      if (line) {
        over = true;
        line.forEach(([rr, cc]) => cellEls[rr][cc].classList.add("win"));
        ctx.incScore(p);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${p + 1} (${p === 0 ? "X" : "O"}) thắng!`,
          `🎉 Player ${p + 1} (${p === 0 ? "X" : "O"}) wins!`));
        ctx.setTurn(-1);
        return;
      }
      if (board.every((row) => row.every((v) => v !== null))) {
        over = true;
        ctx.setStatus(ctx.t("🤝 Hòa! Bàn cờ đã đầy.", "🤝 Draw! The board is full."));
        ctx.setTurn(-1);
        return;
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
    }

    function winningLine(r, c, p) {
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && board[nr][nc] === p) { cells.push([nr, nc]); nr += dr; nc += dc; }
        nr = r - dr; nc = c - dc;
        while (inB(nr, nc) && board[nr][nc] === p) { cells.unshift([nr, nc]); nr -= dr; nc -= dc; }
        if (cells.length >= NEED) return cells;
      }
      return null;
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    // ----- AI: heuristic đe dọa -----
    function lineValue(total, openEnds) {
      if (total >= NEED) return 1000000;
      if (total === NEED - 1) return openEnds === 2 ? 100000 : (openEnds === 1 ? 10000 : 0);
      if (total === NEED - 2) return openEnds === 2 ? 5000 : (openEnds === 1 ? 500 : 0);
      if (total === NEED - 3) return openEnds === 2 ? 200 : (openEnds === 1 ? 20 : 0);
      return total;
    }
    function patternScore(r, c, p) {
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      let score = 0;
      board[r][c] = p;
      for (const [dr, dc] of dirs) {
        let total = 1, open = 0;
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && board[nr][nc] === p) { total++; nr += dr; nc += dc; }
        if (inB(nr, nc) && board[nr][nc] === null) open++;
        nr = r - dr; nc = c - dc;
        while (inB(nr, nc) && board[nr][nc] === p) { total++; nr -= dr; nc -= dc; }
        if (inB(nr, nc) && board[nr][nc] === null) open++;
        score += lineValue(total, open);
      }
      board[r][c] = null;
      return score;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      // ô gần quân đã đặt
      let any = false;
      const cand = new Set();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (board[r][c] === null) continue;
          any = true;
          for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++) {
              const nr = r + dr, nc = c + dc;
              if (inB(nr, nc) && board[nr][nc] === null) cand.add(nr * N + nc);
            }
        }
      }
      if (!any) { const m = Math.floor(N / 2); return { r: m, c: m }; }
      const candArr = [...cand];
      // mức Dễ hay đi ngẫu nhiên quanh khu vực
      if (level === "easy" && Math.random() < 0.5) {
        const k = candArr[Math.floor(Math.random() * candArr.length)];
        return { r: Math.floor(k / N), c: k % N };
      }
      const offense = level === "hard" ? 1.3 : level === "normal" ? 1.15 : 1.0;
      let best = -Infinity, pick = null;
      candArr.forEach((key) => {
        const r = Math.floor(key / N), c = key % N;
        const sc = patternScore(r, c, me) * offense + patternScore(r, c, opp);
        if (sc > best) { best = sc; pick = { r, c }; }
      });
      return pick;
    }

    function undo() {
      if (!moveStack.length) return false;
      const m = moveStack.pop();
      board[m.r][m.c] = null;
      const cell = cellEls[m.r][m.c];
      cell.innerHTML = "";
      cell.classList.remove("last", "win");
      // gỡ highlight thắng trên toàn bàn (nếu vừa thắng)
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cellEls[r][c].classList.remove("win");
      over = false;
      turn = m.p;
      lastCell = m.prev;
      if (lastCell) cellEls[lastCell[0]][lastCell[1]].classList.add("last");
      ctx.setTurn(turn);
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} (${turn === 0 ? "X" : "O"}).`,
        `Player ${turn + 1}'s turn (${turn === 0 ? "X" : "O"}).`));
      return true;
    }

    ctx.setNames(ctx.t("Người chơi 1 (X)", "Player 1 (X)"), ctx.t("Người chơi 2 (O)", "Player 2 (O)"));
    ctx.setTurn(0);
    ctx.setStatus(ctx.t(`X đi trước. Nối ${NEED} quân liên tiếp để thắng.`,
      `X goes first. Connect ${NEED} in a row to win.`));
    return { applyMove, undo, aiMove };
  }

  window.GameRegistry.register({
    id: "gomoku",
    name: "Cờ Caro 15×15",
    emoji: "⚪",
    description: "Cờ caro cỡ lớn dùng ký hiệu X/O: nối được 5 quân liên tiếp (ngang, dọc, chéo) là thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 15,
        choices: [
          { value: 9, label: "9×9 (nhanh)" },
          { value: 13, label: "13×13" },
          { value: 15, label: "15×15 (chuẩn)" },
          { value: 19, label: "19×19 (lớn)" },
        ],
      },
      {
        id: "need", label: "Số quân để thắng", default: 5,
        choices: [
          { value: 4, label: "4 quân (dễ)" },
          { value: 5, label: "5 quân (chuẩn)" },
          { value: 6, label: "6 quân (khó)" },
        ],
      },
    ],
    howTo: [
      "Bàn cờ tùy chỉnh (mặc định 15×15). Người chơi 1 dùng ký hiệu X, Người chơi 2 dùng ký hiệu O. X đi trước.",
      "Đến lượt mình, bấm vào một ô trống bất kỳ để đặt quân.",
      "Mục tiêu: nối được số quân cùng màu liên tiếp (theo tùy chỉnh) thành một hàng — ngang, dọc hoặc chéo.",
      "Ai nối đủ số quân yêu cầu trước sẽ thắng ngay lập tức.",
      "Có thể chỉnh kích thước bàn và số quân cần nối ở màn chọn chế độ để ván dễ hơn hoặc khó hơn.",
    ],
    create,
  });
})();
