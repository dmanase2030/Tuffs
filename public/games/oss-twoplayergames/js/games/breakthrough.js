/* Breakthrough (Cờ Đột Phá) — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn NxN. Mỗi bên có 2 hàng quân. Quân đi 1 ô về phía sân đối thủ:
     - THẲNG tiến: chỉ tới ô TRỐNG (không ăn được khi đi thẳng).
     - CHÉO tiến: tới ô trống HOẶC ăn quân địch (chỉ ăn theo đường chéo).
   THẮNG khi: đưa một quân tới HÀNG CUỐI của đối thủ, hoặc ăn hết quân địch,
   hoặc làm đối thủ hết nước đi.
   P1 (Trắng) ở dưới, đi LÊN (r giảm). P2 (Đen) ở trên, đi XUỐNG (r tăng). */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const N = Number(o.size) === 6 ? 6 : 8;

    // board[r][c] = null | 0 (P1) | 1 (P2)
    let board = Array.from({ length: N }, () => Array(N).fill(null));
    for (let c = 0; c < N; c++) {
      board[0][c] = 1; board[1][c] = 1;           // P2 trên cùng
      board[N - 1][c] = 0; board[N - 2][c] = 0;   // P1 dưới cùng
    }

    let turn = 0;
    let over = false;
    let selected = null;    // [r,c] quân đang chọn
    let lastMove = null;    // {from,to}
    let winCells = null;

    const root = document.createElement("div");
    root.className = "bt-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "bt-hud";
    root.appendChild(hud);

    const wrap = document.createElement("div");
    wrap.className = "bt-wrap";
    const grid = document.createElement("div");
    grid.className = "bt-board";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    wrap.appendChild(grid);
    root.appendChild(wrap);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "bt-cell " + ((r + c) % 2 ? "d" : "l");
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function fwd(p) { return p === 0 ? -1 : 1; }          // hướng tiến
    function goalRow(p) { return p === 0 ? 0 : N - 1; }   // hàng đích

    // các nước đi hợp lệ của 1 quân (B = board)
    function pieceMoves(B, r, c, p) {
      const dr = fwd(p);
      const out = [];
      const nr = r + dr;
      if (!inB(nr, c)) return out;
      // thẳng: chỉ tới ô trống
      if (B[nr][c] === null) out.push([nr, c]);
      // chéo: ô trống hoặc ăn quân địch
      for (const nc of [c - 1, c + 1]) {
        if (!inB(nr, nc)) continue;
        if (B[nr][nc] === null || B[nr][nc] === (1 - p)) out.push([nr, nc]);
      }
      return out;
    }

    function allMoves(B, p) {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (B[r][c] !== p) continue;
        for (const [tr, tc] of pieceMoves(B, r, c, p)) out.push({ from: [r, c], to: [tr, tc] });
      }
      return out;
    }

    function countPieces(B, p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (B[r][c] === p) n++;
      return n;
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay()) return;
      // chọn quân của mình
      if (board[r][c] === turn) {
        selected = [r, c];
        render();
        return;
      }
      // di chuyển tới ô hợp lệ
      if (selected) {
        const ms = pieceMoves(board, selected[0], selected[1], turn);
        if (ms.some(([mr, mc]) => mr === r && mc === c)) {
          applyMove({ from: selected.slice(), to: [r, c] }, false);
        }
      }
    }

    function isLegal(move) {
      if (!move || !move.from || !move.to) return false;
      const [fr, fc] = move.from, [tr, tc] = move.to;
      if (!inB(fr, fc) || !inB(tr, tc)) return false;
      if (board[fr][fc] !== turn) return false;
      return pieceMoves(board, fr, fc, turn).some(([mr, mc]) => mr === tr && mc === tc);
    }

    function applyMove(move, fromRemote) {
      if (over || !isLegal(move)) return;
      if (!fromRemote) ctx.sendMove({ from: move.from.slice(), to: move.to.slice() });
      const p = turn;
      const [fr, fc] = move.from, [tr, tc] = move.to;
      const captured = board[tr][tc] !== null;
      board[fr][fc] = null;
      board[tr][tc] = p;
      lastMove = { from: [fr, fc], to: [tr, tc] };
      selected = null;
      ctx.sound(captured ? "capture" : "place");

      // thắng: chạm hàng đích, hoặc ăn hết quân địch
      if (tr === goalRow(p) || countPieces(board, 1 - p) === 0) {
        over = true;
        winCells = [[tr, tc]];
        render();
        ctx.incScore(p);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${p + 1} thắng — ${tr === goalRow(p) ? "đã đột phá tới hàng cuối" : "đã ăn hết quân địch"}!`,
          `🎉 Player ${p + 1} wins — ${tr === goalRow(p) ? "broke through to the last row" : "captured all enemy pieces"}!`));
        return;
      }

      const next = 1 - p;
      // đối thủ hết nước đi -> thua
      if (allMoves(board, next).length === 0) {
        over = true;
        render();
        ctx.incScore(p);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${p + 1} thắng — đối thủ hết nước đi!`,
          `🎉 Player ${p + 1} wins — opponent has no moves left!`));
        return;
      }

      turn = next;
      render();
      ctx.setTurn(turn);
      updateStatus();
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      hud.innerHTML = `
        <div class="bt-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>⚪ ${ctx.t("Trắng", "White")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(board, 0)}</b>
        </div>
        <div class="bt-mid">${over ? "🏁" : "VS"}</div>
        <div class="bt-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>⚫ ${ctx.t("Đen", "Black")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(board, 1)}</b>
        </div>`;
    }

    function render() {
      renderHud();
      const hintSet = new Set();
      if (selected && canPlay() && board[selected[0]][selected[1]] === turn) {
        pieceMoves(board, selected[0], selected[1], turn).forEach(([r, c]) => hintSet.add(r * N + c));
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.classList.remove("hint", "cap", "sel", "lastfrom", "lastto", "win");
          const v = board[r][c];
          if (v === 0 || v === 1) {
            const pawn = document.createElement("div");
            pawn.className = "bt-pawn " + (v === 0 ? "p1" : "p2");
            if (selected && selected[0] === r && selected[1] === c) pawn.classList.add("sel");
            if (winCells && winCells.some(([wr, wc]) => wr === r && wc === c)) pawn.classList.add("win");
            cell.appendChild(pawn);
          }
          if (lastMove) {
            if (lastMove.from[0] === r && lastMove.from[1] === c) cell.classList.add("lastfrom");
            if (lastMove.to[0] === r && lastMove.to[1] === c) cell.classList.add("lastto");
          }
          if (hintSet.has(r * N + c)) {
            cell.classList.add("hint");
            if (board[r][c] === (1 - turn)) cell.classList.add("cap"); // ô có thể ăn
          }
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1} — bấm một quân của bạn rồi bấm ô SÁNG để đi (ô ĐỎ là ăn quân địch).`,
        `Player ${turn + 1} — click your pawn then a HIGHLIGHTED cell (RED cells capture an enemy).`));
    }

    // ---------- AI ----------
    function cloneB(B) { return B.map((row) => row.slice()); }
    function evalB(B, me) {
      const opp = 1 - me;
      let s = (countPieces(B, me) - countPieces(B, opp)) * 12;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = B[r][c];
        if (v === me) s += (me === 0 ? (N - 1 - r) : r);          // tiến về đích
        else if (v === opp) s -= (opp === 0 ? (N - 1 - r) : r);
      }
      return s;
    }
    function doSim(B, move, p) {
      const C = cloneB(B);
      C[move.to[0]][move.to[1]] = p;
      C[move.from[0]][move.from[1]] = null;
      return C;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const moves = allMoves(board, me);
      if (!moves.length) return null;
      // thắng ngay: chạm đích hoặc ăn hết quân
      for (const mv of moves) {
        if (mv.to[0] === goalRow(me)) return mv;
        const C = doSim(board, mv, me);
        if (countPieces(C, opp) === 0) return mv;
      }
      if (level === "easy" && Math.random() < 0.5) return moves[Math.floor(Math.random() * moves.length)];

      let best = -Infinity, pick = moves[0];
      for (const mv of moves) {
        const C = doSim(board, mv, me);
        let sc = evalB(C, me);
        if (level === "hard") {
          // đối thủ phản đòn tốt nhất: nếu họ chạm đích -> rất tệ
          const replies = allMoves(C, opp);
          let worst = Infinity;
          for (const rmv of replies) {
            if (rmv.to[0] === goalRow(opp)) { worst = -100000; break; }
            const C2 = doSim(C, rmv, opp);
            worst = Math.min(worst, evalB(C2, me));
          }
          if (replies.length) sc = sc * 0.35 + worst * 0.65;
        }
        sc += Math.random() * 0.5;
        if (sc > best) { best = sc; pick = mv; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Trắng)", "Player 1 (White)"), ctx.t("Người chơi 2 (Đen)", "Player 2 (Black)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "breakthrough",
    name: "Cờ Đột Phá (Breakthrough)",
    emoji: "♟️",
    description: "Cờ đua quân tinh gọn: quân đi thẳng/chéo tiến, chỉ ăn theo đường chéo. Đưa một quân chạm hàng cuối của đối thủ — hoặc ăn hết quân địch — để thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Cỡ bàn", default: "8",
        choices: [
          { value: "6", label: "6×6 (nhanh)" },
          { value: "8", label: "8×8 (chuẩn)" },
        ],
      },
    ],
    howTo: [
      "Mỗi bên có 2 hàng quân. Người chơi 1 (Trắng) ở dưới và đi LÊN; Người chơi 2 (Đen) ở trên và đi XUỐNG. Trắng đi trước.",
      "Mỗi lượt di chuyển MỘT quân tiến đúng 1 ô: đi THẲNG về phía trước tới ô trống, hoặc đi CHÉO về phía trước.",
      "Quy tắc ăn quân: chỉ ăn được theo đường CHÉO (đi thẳng không ăn được). Ô có thể ăn được tô màu đỏ.",
      "Cách chơi: bấm một quân của mình để chọn — các ô đi được sẽ sáng lên — rồi bấm ô sáng để di chuyển.",
      "THẮNG nếu đưa được một quân chạm tới HÀNG CUỐI phía đối thủ, ăn hết quân địch, hoặc làm đối thủ hết nước đi.",
      "Mẹo: giữ quân thành khối để bảo vệ lẫn nhau — một quân bị ăn chéo thì quân phía sau ăn lại được. Đừng lao lên quá sớm.",
    ],
    create,
  });
})();
