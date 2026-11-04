/* Siêu Cờ Caro (Ultimate Tic-Tac-Toe) — chơi chung máy, ĐẤU MÁY và ONLINE
   9 bàn caro 3x3 xếp thành lưới 3x3 lớn. Nước đi của bạn quyết định ĐỐI THỦ
   buộc phải đánh ở bàn con nào tiếp theo: bạn đánh ô (r,c) trong một bàn con thì
   đối thủ phải đánh ở BÀN CON số (r*3+c). Nếu bàn con đó đã xong (thắng/hòa) thì
   đối thủ được đánh tự do ở bất kỳ bàn còn mở.
   Thắng một bàn con = chiếm ô đó trên bàn lớn. Thắng 3 bàn con thẳng hàng = THẮNG ván.

   Hoàn toàn tất định (không dùng ngẫu nhiên) nên đồng bộ online chỉ cần gửi nước đi.
   Nước đi: { b, c } với b = chỉ số bàn con (0..8), c = chỉ số ô trong bàn (0..8). */
(function () {
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  function winnerOf(cells) {
    for (const [a, b, c] of LINES) {
      if (cells[a] !== null && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    }
    return null;
  }
  function isFull(cells) { return cells.every((v) => v !== null); }

  function create(ctx) {
    // boards[b][c] = 0 | 1 | null ; bWin[b] = 0 | 1 | "draw" | null
    let boards = Array.from({ length: 9 }, () => Array(9).fill(null));
    let bWin = Array(9).fill(null);
    let turn = ctx.isOnline ? ctx.firstSeat : 0;
    let forced = -1;          // bàn con bắt buộc (-1 = tự do)
    let over = false;
    let winner = null;
    let lastMove = null;      // { b, c } để highlight
    const histStack = [];     // hoàn tác (chung máy)

    const SYM = ["X", "O"];

    const root = document.createElement("div");
    root.className = "uttt-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "uttt-hud";
    root.appendChild(hud);

    const big = document.createElement("div");
    big.className = "uttt-big";
    root.appendChild(big);

    // dựng 9 bàn con × 9 ô (một lần)
    const cellEls = Array.from({ length: 9 }, () => Array(9));
    const subEls = [];
    for (let b = 0; b < 9; b++) {
      const sub = document.createElement("div");
      sub.className = "uttt-sub";
      sub.dataset.b = b;
      const grid = document.createElement("div");
      grid.className = "uttt-subgrid";
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "uttt-cell";
        cell.dataset.b = b;
        cell.dataset.c = c;
        cell.addEventListener("click", () => onClick(b, c));
        grid.appendChild(cell);
        cellEls[b][c] = cell;
      }
      const overlay = document.createElement("div");
      overlay.className = "uttt-suboverlay";
      sub.appendChild(grid);
      sub.appendChild(overlay);
      big.appendChild(sub);
      subEls.push(sub);
    }

    function myTurnNow() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    // bàn con b có còn cho đánh không (theo luật forced)
    function boardPlayable(b) {
      if (bWin[b] !== null) return false;
      if (forced === -1) return true;
      return b === forced;
    }
    function legal(b, c) {
      return !over && boardPlayable(b) && boards[b][c] === null;
    }

    function onClick(b, c) {
      if (!myTurnNow()) return;
      if (!legal(b, c)) return;
      applyMove({ b, c }, false);
    }

    function snapshot() {
      histStack.push({
        boards: boards.map((s) => s.slice()),
        bWin: bWin.slice(),
        turn, forced, over, winner,
        lastMove: lastMove ? { ...lastMove } : null,
      });
      if (histStack.length > 200) histStack.shift();
    }

    function undo() {
      if (!histStack.length) return false;
      const s = histStack.pop();
      boards = s.boards.map((x) => x.slice());
      bWin = s.bWin.slice();
      turn = s.turn; forced = s.forced; over = s.over; winner = s.winner;
      lastMove = s.lastMove ? { ...s.lastMove } : null;
      render();
      updateStatus();
      ctx.setTurn(over ? -1 : turn);
      return true;
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const b = Number(move.b), c = Number(move.c);
      if (!(b >= 0 && b < 9 && c >= 0 && c < 9)) return;
      if (!legal(b, c)) return;

      snapshot();
      const p = turn;
      boards[b][c] = p;
      lastMove = { b, c };
      ctx.sound("place");

      if (!fromRemote) ctx.sendMove({ b, c });

      // cập nhật kết quả bàn con
      const w = winnerOf(boards[b]);
      if (w !== null) bWin[b] = w;
      else if (isFull(boards[b])) bWin[b] = "draw";

      // kiểm tra thắng bàn lớn
      const bigCells = bWin.map((x) => (x === 0 || x === 1) ? x : null);
      const bigW = winnerOf(bigCells);
      if (bigW !== null) {
        over = true; winner = bigW;
        forced = -1;
        ctx.incScore(bigW);
        ctx.setTurn(-1);
        render();
        ctx.setStatus(ctx.t(
          `🎉 ${bigW === 0 ? "Người chơi 1 (X)" : "Người chơi 2 (O)"} thắng — chiếm 3 bàn thẳng hàng!`,
          `🎉 ${bigW === 0 ? "Player 1 (X)" : "Player 2 (O)"} wins — three boards in a row!`));
        return;
      }
      // hết chỗ -> hòa theo số bàn chiếm được
      if (bWin.every((x) => x !== null)) {
        over = true;
        const c0 = bWin.filter((x) => x === 0).length;
        const c1 = bWin.filter((x) => x === 1).length;
        winner = c0 === c1 ? "draw" : (c0 > c1 ? 0 : 1);
        ctx.setTurn(-1);
        render();
        if (winner === "draw") {
          ctx.setStatus(ctx.t(`🤝 Hòa! Mỗi bên chiếm ${c0} bàn.`, `🤝 Draw! ${c0} boards each.`));
        } else {
          ctx.incScore(winner);
          ctx.setStatus(ctx.t(
            `🎉 ${winner === 0 ? "Người chơi 1" : "Người chơi 2"} thắng nhờ nhiều bàn hơn (${Math.max(c0, c1)}–${Math.min(c0, c1)})!`,
            `🎉 ${winner === 0 ? "Player 1" : "Player 2"} wins on boards (${Math.max(c0, c1)}–${Math.min(c0, c1)})!`));
        }
        return;
      }

      // nước tiếp: bàn con bắt buộc = ô vừa đánh; nếu bàn đó đã xong -> tự do
      forced = (bWin[c] === null) ? c : -1;
      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // ---------- AI ----------
    // Heuristic: thắng ngay nếu được, chặn nước thắng lớn của đối thủ, ưu tiên
    // chiếm bàn con + tránh "tặng" cho đối thủ quyền đánh tự do vào bàn nguy hiểm.
    function legalMoves() {
      const out = [];
      for (let b = 0; b < 9; b++) {
        if (!boardPlayable(b)) continue;
        for (let c = 0; c < 9; c++) if (boards[b][c] === null) out.push({ b, c });
      }
      return out;
    }
    function subThreatScore(cells, me) {
      // điểm cho một bàn con theo thế cờ (số đường 2-quân mở...)
      let s = 0;
      for (const [a, b, c] of LINES) {
        const line = [cells[a], cells[b], cells[c]];
        const mine = line.filter((v) => v === me).length;
        const opp = line.filter((v) => v === (1 - me)).length;
        if (opp === 0 && mine === 2) s += 5;
        else if (opp === 0 && mine === 1) s += 1;
        if (mine === 0 && opp === 2) s -= 4;
      }
      // tâm bàn con quý
      if (cells[4] === me) s += 2;
      return s;
    }
    function evalMove(mv, me) {
      const { b, c } = mv;
      let score = 0;
      // thử đánh thử để xem có chiếm được bàn con không
      boards[b][c] = me;
      const w = winnerOf(boards[b]);
      boards[b][c] = null;
      if (w === me) {
        score += 30;
        // chiếm bàn con này có tạo đường thắng lớn không
        const bigCells = bWin.map((x) => (x === 0 || x === 1) ? x : null);
        bigCells[b] = me;
        if (winnerOf(bigCells) === me) score += 1000;
        // hoặc tạo đôi (2 bàn cùng đường, mở)
        for (const [x, y, z] of LINES) {
          if ([x, y, z].includes(b)) {
            const trio = [bigCells[x], bigCells[y], bigCells[z]];
            if (trio.filter((v) => v === me).length === 2 && trio.filter((v) => v === (1 - me)).length === 0) score += 20;
          }
        }
      }
      // vị trí trong bàn con
      if (c === 4) score += 3;
      else if (c === 0 || c === 2 || c === 6 || c === 8) score += 1;
      // ô trung tâm bàn lớn (b===4) giá trị hơn
      if (b === 4 && w === me) score += 8;
      // gửi đối thủ tới bàn nào? (c quyết định bàn kế của đối thủ)
      const nextB = c;
      if (bWin[nextB] !== null) {
        score -= 6; // tặng đối thủ quyền đánh tự do -> bất lợi
      } else {
        // nếu bàn nextB đang để đối thủ sắp thắng -> rất xấu
        score -= subThreatScore(boards[nextB], 1 - me);
      }
      // giá trị thế cờ của chính bàn con sau khi đánh
      boards[b][c] = me;
      score += subThreatScore(boards[b], me) * 0.5;
      boards[b][c] = null;
      return score;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const moves = legalMoves();
      if (!moves.length) return null;
      // thắng lớn ngay
      for (const mv of moves) {
        boards[mv.b][mv.c] = me;
        const w = winnerOf(boards[mv.b]);
        boards[mv.b][mv.c] = null;
        if (w === me) {
          const bigCells = bWin.map((x) => (x === 0 || x === 1) ? x : null);
          bigCells[mv.b] = me;
          if (winnerOf(bigCells) === me) return mv;
        }
      }
      if (level === "easy" && Math.random() < 0.5) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
      let best = -Infinity, pick = moves[0];
      const jitter = level === "hard" ? 0 : (level === "normal" ? 2 : 6);
      for (const mv of moves) {
        const s = evalMove(mv, me) + (jitter ? (Math.random() * jitter) : 0);
        if (s > best) { best = s; pick = mv; }
      }
      return pick;
    }

    // ---------- Render ----------
    function render() {
      const bigCells = bWin.map((x) => (x === 0 || x === 1) ? x : null);
      const bigLine = over && (winner === 0 || winner === 1) ? findBigLine(bigCells, winner) : null;

      for (let b = 0; b < 9; b++) {
        const sub = subEls[b];
        const decided = bWin[b] !== null;
        sub.classList.toggle("uttt-decided", decided);
        sub.classList.toggle("uttt-win-x", bWin[b] === 0);
        sub.classList.toggle("uttt-win-o", bWin[b] === 1);
        sub.classList.toggle("uttt-draw", bWin[b] === "draw");
        // bàn đang được phép đánh (gợi ý)
        const active = !over && myTurnNow() && boardPlayable(b);
        sub.classList.toggle("uttt-active", active);
        sub.classList.toggle("uttt-bigwin", !!bigLine && bigLine.includes(b));

        const overlay = sub.querySelector(".uttt-suboverlay");
        if (decided) {
          overlay.textContent = bWin[b] === "draw" ? "▦" : SYM[bWin[b]];
          overlay.className = "uttt-suboverlay show " + (bWin[b] === 0 ? "ov-x" : bWin[b] === 1 ? "ov-o" : "ov-draw");
        } else {
          overlay.textContent = "";
          overlay.className = "uttt-suboverlay";
        }

        for (let c = 0; c < 9; c++) {
          const cell = cellEls[b][c];
          const v = boards[b][c];
          const txt = v === null ? "" : SYM[v];
          if (cell.textContent !== txt) cell.textContent = txt;
          cell.className = "uttt-cell" +
            (v === 0 ? " c-x" : v === 1 ? " c-o" : "") +
            (lastMove && lastMove.b === b && lastMove.c === c ? " uttt-last" : "") +
            (active && v === null ? " uttt-playable" : "");
          cell.disabled = !active || v !== null;
        }
      }
      renderHud();
    }

    function findBigLine(cells, p) {
      for (const ln of LINES) if (ln.every((i) => cells[i] === p)) return ln;
      return null;
    }

    function renderHud() {
      const c0 = bWin.filter((x) => x === 0).length;
      const c1 = bWin.filter((x) => x === 1).length;
      const meTag = ctx.isOnline ? (ctx.mySeat === 0 ? ctx.t(" (bạn)", " (you)") : "") : "";
      const meTag2 = ctx.isOnline ? (ctx.mySeat === 1 ? ctx.t(" (bạn)", " (you)") : "") : "";
      hud.innerHTML =
        `<div class="uttt-pinfo p1 ${!over && turn === 0 ? "active" : ""}"><span class="uttt-mk">X</span> P1${meTag} · <b>${c0}</b></div>` +
        `<div class="uttt-mid">${over ? ctx.t("Kết thúc", "Finished") : (forced === -1 ? ctx.t("Đánh tự do", "Free move") : ctx.t("Bàn bắt buộc", "Forced board"))}</div>` +
        `<div class="uttt-pinfo p2 ${!over && turn === 1 ? "active" : ""}"><span class="uttt-mk">O</span> P2${meTag2} · <b>${c1}</b></div>`;
    }

    function updateStatus() {
      if (over) return;
      const sym = SYM[turn];
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang suy nghĩ...", "Opponent is thinking..."));
        return;
      }
      const who = ctx.isOnline ? ctx.t("Lượt bạn", "Your turn")
        : ctx.t(`Lượt ${turn === 0 ? "Người chơi 1" : "Người chơi 2"} (${sym})`, `${turn === 0 ? "Player 1" : "Player 2"} (${sym}) turn`);
      const where = forced === -1
        ? ctx.t("đánh vào BẤT KỲ bàn còn mở (sáng).", "play in ANY open board (highlighted).")
        : ctx.t("đánh trong bàn được tô SÁNG.", "play in the highlighted board.");
      ctx.setStatus(`${who} — ${where}`);
    }

    ctx.setTurn(turn);
    render();
    updateStatus();
    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "ultimatettt",
    name: "Siêu Cờ Caro",
    emoji: "⊞",
    description: "Caro lồng caro: 9 bàn nhỏ trong 1 bàn lớn. Nước của bạn ép đối thủ phải đánh ở bàn nào tiếp theo. Thắng 3 bàn thẳng hàng là thắng ván.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Bàn lớn gồm 9 bàn caro 3x3 nhỏ. Mục tiêu cuối: chiếm 3 bàn nhỏ thẳng hàng (ngang/dọc/chéo) trên bàn lớn.",
      "Thắng một bàn nhỏ (xếp 3 ký hiệu thẳng hàng trong bàn đó) thì bạn CHIẾM ô tương ứng trên bàn lớn.",
      "Quy tắc cốt lõi: ô bạn vừa đánh trong một bàn nhỏ quyết định ĐỐI THỦ phải đánh ở bàn nhỏ nào tiếp theo — ví dụ bạn đánh ô góc trên-trái thì đối thủ phải đánh ở bàn nhỏ góc trên-trái.",
      "Nếu bàn nhỏ bị 'gửi tới' đã xong (đã thắng hoặc đầy/hòa), đối thủ được đánh TỰ DO vào bất kỳ bàn còn mở. Các bàn được phép đánh luôn được tô sáng.",
      "Bàn nhỏ đầy mà không ai thắng thì coi như hòa (không thuộc về ai). Nếu hết chỗ cả bàn lớn, ai chiếm nhiều bàn nhỏ hơn sẽ thắng.",
      "Mẹo: đừng chỉ lo thắng bàn nhỏ — hãy tính xem nước đi của mình sẽ 'đẩy' đối thủ tới bàn nào, tránh tặng họ cơ hội.",
    ],
    create,
  });
})();
