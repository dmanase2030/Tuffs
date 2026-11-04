/* Order & Chaos — chơi chung máy & online
   Cả hai người đều được đặt X HOẶC O vào ô trống.
   Order (P1) thắng nếu tạo được chuỗi N ký hiệu giống nhau liên tiếp.
   Chaos (P2) thắng nếu lấp đầy bàn mà không có chuỗi nào đủ dài. */
(function () {
  const SIZES = {
    6: { n: 6, need: 5 },
    8: { n: 8, need: 5 },
    10: { n: 10, need: 6 },
  };
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  function create(ctx) {
    const o = ctx.options || {};
    const conf = SIZES[o.size] || SIZES[8];
    const N = conf.n;
    const NEED = conf.need;
    const CONFIRM = o.confirm !== "off"; // xác nhận 2 lần để tránh bấm nhầm

    let board = Array.from({ length: N }, () => Array(N).fill(null));
    let turn = 0; // 0 = Order, 1 = Chaos
    let chosen = "X";
    let over = false;
    let count = 0;
    let lastMove = null;
    let pending = null; // [r,c] ô đang chờ xác nhận
    const history = []; // ngăn xếp trạng thái để hoàn tác

    const root = document.createElement("div");
    root.className = "oc-root";
    ctx.boardEl.appendChild(root);

    const header = document.createElement("div");
    header.className = "oc-header";
    root.appendChild(header);

    // Bộ chọn ký hiệu
    const picker = document.createElement("div");
    picker.className = "oc-picker";
    picker.innerHTML = `<span class="oc-picker-label">${ctx.t("Đặt:", "Place:")}</span>`;
    const xBtn = document.createElement("button");
    xBtn.type = "button";
    xBtn.className = "oc-sym-btn x active";
    xBtn.textContent = "X";
    const oBtn = document.createElement("button");
    oBtn.type = "button";
    oBtn.className = "oc-sym-btn o";
    oBtn.textContent = "O";
    xBtn.addEventListener("click", () => setSym("X"));
    oBtn.addEventListener("click", () => setSym("O"));
    picker.appendChild(xBtn);
    picker.appendChild(oBtn);
    const hint = document.createElement("span");
    hint.className = "oc-picker-hint";
    hint.textContent = ctx.t("(phím X / O)", "(keys X / O)");
    picker.appendChild(hint);
    root.appendChild(picker);

    const grid = document.createElement("div");
    grid.className = "oc-board";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    if (N >= 10) grid.classList.add("big");
    root.appendChild(grid);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "oc-cell";
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        cell.addEventListener("mouseenter", () => onHover(rr, cc, true));
        cell.addEventListener("mouseleave", () => onHover(rr, cc, false));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function setSym(s) {
      chosen = s;
      xBtn.classList.toggle("active", s === "X");
      oBtn.classList.toggle("active", s === "O");
      if (pending) { // cập nhật xem trước ô đang chờ xác nhận
        const el = cellEls[pending[0]][pending[1]];
        el.classList.remove("x", "o");
        el.classList.add(s === "X" ? "x" : "o");
        el.textContent = s;
        ctx.setStatus(ctx.t(`Bấm LẦN NỮA vào ô đã chọn để xác nhận đặt "${s}". Hoặc chọn ô khác.`,
          `Click the chosen cell AGAIN to confirm placing "${s}". Or pick another cell.`));
      }
    }

    function clearPending() {
      if (!pending) return;
      const [r, c] = pending;
      pending = null;
      if (board[r][c] === null) {
        const el = cellEls[r][c];
        el.classList.remove("pending", "x", "o", "ghost");
        el.textContent = "";
      }
    }

    function setPending(r, c) {
      clearPending();
      pending = [r, c];
      const el = cellEls[r][c];
      el.classList.remove("ghost");
      el.classList.add("pending", chosen === "X" ? "x" : "o");
      el.textContent = chosen;
      ctx.setStatus(ctx.t(`Bấm LẦN NỮA vào ô đó để xác nhận đặt "${chosen}". (chống bấm nhầm)`,
        `Click that cell AGAIN to confirm placing "${chosen}". (mis-tap guard)`));
    }

    function onHover(r, c, on) {
      if (!canPlay() || board[r][c] !== null) return;
      if (pending && pending[0] === r && pending[1] === c) return; // đừng ghi đè ô đang chờ xác nhận
      const el = cellEls[r][c];
      if (on) {
        el.classList.add("ghost", chosen === "X" ? "x" : "o");
        el.textContent = chosen;
      } else {
        el.classList.remove("ghost", "x", "o");
        el.textContent = "";
      }
    }

    function onClick(r, c) {
      if (!canPlay() || board[r][c] !== null) return;
      if (!CONFIRM) { applyMove({ r, c, sym: chosen }, false); return; }
      if (pending && pending[0] === r && pending[1] === c) {
        pending = null;
        applyMove({ r, c, sym: chosen }, false);
        return;
      }
      setPending(r, c);
      ctx.sound("select");
    }

    function applyMove(move, fromRemote) {
      const r = Number(move.r), c = Number(move.c);
      const sym = move.sym === "O" ? "O" : "X";
      if (over || !inB(r, c) || board[r][c] !== null) return;
      history.push({ board: board.map((row) => row.slice()), turn, count, lastMove });
      clearPending();
      board[r][c] = sym;
      count++;
      if (lastMove) cellEls[lastMove[0]][lastMove[1]].classList.remove("last");
      lastMove = [r, c];
      const el = cellEls[r][c];
      el.classList.remove("ghost", "pending");
      el.textContent = sym;
      el.classList.add(sym === "X" ? "x" : "o", "last");
      ctx.sound("place");

      if (!fromRemote) ctx.sendMove({ r, c, sym });

      const line = fiveLine(r, c, sym);
      if (line) {
        over = true;
        line.forEach(([rr, cc]) => cellEls[rr][cc].classList.add("win"));
        ctx.incScore(0);
        ctx.setTurn(-1);
        picker.classList.add("disabled");
        renderHeader();
        ctx.setStatus(ctx.t(`🎉 Order (Người chơi 1) thắng — tạo được chuỗi ${NEED}!`,
          `🎉 Order (Player 1) wins — made a run of ${NEED}!`));
        return;
      }
      if (count === N * N) {
        over = true;
        ctx.incScore(1);
        ctx.setTurn(-1);
        picker.classList.add("disabled");
        renderHeader();
        ctx.setStatus(ctx.t(`🎉 Chaos (Người chơi 2) thắng — bàn đầy, không có chuỗi ${NEED}!`,
          `🎉 Chaos (Player 2) wins — board full with no run of ${NEED}!`));
        return;
      }

      turn = 1 - turn;
      setSym("X");
      ctx.setTurn(turn);
      renderHeader();
      updateStatus();
    }

    function fiveLine(r, c, sym) {
      for (const [dr, dc] of DIRS) {
        const cells = [[r, c]];
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && board[nr][nc] === sym) { cells.push([nr, nc]); nr += dr; nc += dc; }
        nr = r - dr; nc = c - dc;
        while (inB(nr, nc) && board[nr][nc] === sym) { cells.unshift([nr, nc]); nr -= dr; nc -= dc; }
        if (cells.length >= NEED) return cells.slice(0, NEED);
      }
      return null;
    }

    // chuỗi dài nhất hiện có trên bàn (của bất kỳ ký hiệu nào)
    function longestRun() {
      let best = 0;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const sym = board[r][c];
          if (!sym) continue;
          for (const [dr, dc] of DIRS) {
            const pr = r - dr, pc = c - dc;
            if (inB(pr, pc) && board[pr][pc] === sym) continue; // chỉ đếm từ đầu chuỗi
            let len = 1, nr = r + dr, nc = c + dc;
            while (inB(nr, nc) && board[nr][nc] === sym) { len++; nr += dr; nc += dc; }
            if (len > best) best = len;
          }
        }
      }
      return best;
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    function undo() {
      if (!history.length) return false;
      const s = history.pop();
      board = s.board.map((row) => row.slice());
      turn = s.turn;
      count = s.count;
      lastMove = s.lastMove;
      over = false;
      pending = null;
      picker.classList.remove("disabled");
      // dựng lại toàn bộ ô từ board
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const el = cellEls[r][c];
          el.className = "oc-cell";
          el.textContent = "";
          const v = board[r][c];
          if (v) { el.classList.add(v === "X" ? "x" : "o"); el.textContent = v; }
        }
      }
      if (lastMove) cellEls[lastMove[0]][lastMove[1]].classList.add("last");
      setSym("X");
      ctx.setTurn(turn);
      renderHeader();
      updateStatus();
      return true;
    }

    // ----- AI -----
    function runScore(r, c, sym) {
      let score = 0;
      for (const [dr, dc] of DIRS) {
        let total = 1, open = 0;
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && board[nr][nc] === sym) { total++; nr += dr; nc += dc; }
        if (inB(nr, nc) && board[nr][nc] === null) open++;
        nr = r - dr; nc = c - dc;
        while (inB(nr, nc) && board[nr][nc] === sym) { total++; nr -= dr; nc -= dc; }
        if (inB(nr, nc) && board[nr][nc] === null) open++;
        let v = total * total;
        if (total >= NEED) v = 100000;
        else if (total === NEED - 1 && open >= 1) v += 5000;
        score += v + open;
      }
      return score;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const cands = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (board[r][c] === null) { cands.push({ r, c, sym: "X" }); cands.push({ r, c, sym: "O" }); }
      if (!cands.length) return null;
      if (level === "easy" && Math.random() < 0.55) return cands[Math.floor(Math.random() * cands.length)];
      if (me === 0) {
        // Order: thắng ngay nếu được, không thì tối đa tiềm năng chuỗi
        for (const m of cands) { board[m.r][m.c] = m.sym; const w = fiveLine(m.r, m.c, m.sym); board[m.r][m.c] = null; if (w) return m; }
        let best = -Infinity, pick = cands[0];
        for (const m of cands) { board[m.r][m.c] = m.sym; const sc = runScore(m.r, m.c, m.sym); board[m.r][m.c] = null; if (sc > best) { best = sc; pick = m; } }
        return pick;
      }
      // Chaos: tuyệt đối không tạo chuỗi đủ dài; trong các nước an toàn, giảm tối đa chuỗi dài nhất
      let best = Infinity, pick = null, safePick = null;
      for (const m of cands) {
        board[m.r][m.c] = m.sym;
        const makesWin = !!fiveLine(m.r, m.c, m.sym);
        const lr = longestRun();
        board[m.r][m.c] = null;
        if (makesWin) continue;
        if (lr < best) { best = lr; safePick = m; }
      }
      pick = safePick || cands[0];
      return pick;
    }

    function renderHeader() {
      const run = Math.min(longestRun(), NEED);
      const runPct = run / NEED * 100;
      const fillPct = count / (N * N) * 100;
      const roleBadge = over
        ? `<span class="oc-role">${ctx.t("Kết thúc", "Finished")}</span>`
        : `<span class="oc-role ${turn === 0 ? "order" : "chaos"}">${turn === 0 ? "🏆 ORDER" : "🌀 CHAOS"} · ${ctx.t("Người chơi", "Player")} ${turn + 1}</span>`;
      header.innerHTML = `
        ${roleBadge}
        <div class="oc-meters">
          <div class="oc-meter">
            <span>${ctx.t("Chuỗi dài nhất", "Longest run")} ${run}/${NEED}</span>
            <i class="oc-bar order"><i style="width:${runPct}%"></i></i>
          </div>
          <div class="oc-meter">
            <span>${ctx.t("Bàn đầy", "Board filled")} ${count}/${N * N}</span>
            <i class="oc-bar chaos"><i style="width:${fillPct}%"></i></i>
          </div>
        </div>
      `;
    }

    function updateStatus() {
      if (over) return;
      const role = turn === 0 ? ctx.t("Order — tạo chuỗi để thắng", "Order — make a run to win") : ctx.t("Chaos — chặn không cho đủ chuỗi", "Chaos — block any full run");
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi (${role}).`, `Opponent is playing (${role}).`));
      } else {
        ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} (${role}). Chọn X hoặc O rồi đặt vào ô trống.`,
          `Player ${turn + 1}'s turn (${role}). Pick X or O then place on an empty cell.`));
      }
    }

    function onKey(e) {
      if (e.key === "x" || e.key === "X") setSym("X");
      else if (e.key === "o" || e.key === "O") setSym("O");
    }
    window.addEventListener("keydown", onKey);

    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        window.removeEventListener("keydown", onKey);
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setNames("Order (P1)", "Chaos (P2)");
    ctx.setTurn(0);
    renderHeader();
    updateStatus();
    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "orderchaos",
    name: "Order & Chaos",
    emoji: "🔀",
    description: "Biến thể caro độc đáo: cả hai cùng đặt X/O nhưng mục tiêu trái ngược. Bàn rộng tới 10×10, có thanh đo chuỗi & độ đầy bàn.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Bàn cờ", default: 8,
        choices: [
          { value: 6, label: "6×6 · chuỗi 5 (chuẩn)" },
          { value: 8, label: "8×8 · chuỗi 5 (rộng)" },
          { value: 10, label: "10×10 · chuỗi 6 (lớn)" },
        ],
      },
      {
        id: "confirm", label: "Xác nhận nước đi", default: "on",
        choices: [
          { value: "on", label: "Bật (bấm 2 lần)" },
          { value: "off", label: "Tắt (bấm 1 lần)" },
        ],
      },
    ],
    howTo: [
      "Cả hai người đều được đặt ký hiệu X HOẶC O vào ô trống (chọn bằng nút trên bàn hoặc phím X / O).",
      "Người chơi 1 là 'Order': thắng nếu tạo được chuỗi ký hiệu GIỐNG NHAU liên tiếp đủ dài (ngang/dọc/chéo) — 5 với bàn 6×6 và 8×8, 6 với bàn 10×10.",
      "Người chơi 2 là 'Chaos': thắng nếu lấp đầy cả bàn mà KHÔNG xuất hiện chuỗi đủ dài nào.",
      "Bất kỳ chuỗi đủ dài nào (dù do ai đặt) cũng tính Order thắng — nên Chaos phải khéo phá thế bằng cách xen ký hiệu khác.",
      "Thanh 'Chuỗi dài nhất' cho biết Order đang gần thắng đến đâu; thanh 'Bàn đầy' cho biết Chaos sắp về đích chưa. Di chuột lên ô trống để xem trước ký hiệu sắp đặt.",
      "Chống bấm nhầm: mặc định cần bấm 2 LẦN vào cùng một ô để xác nhận (lần 1 chọn & xem trước, lần 2 đặt thật). Có thể tắt ở tùy chọn 'Xác nhận nước đi'.",
      "Chọn bàn lớn hơn ở phần tùy chọn để ván dài và nhiều thế trận hơn.",
    ],
    create,
  });
})();
