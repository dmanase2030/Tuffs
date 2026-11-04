/* Cờ Gánh — cờ dân gian Việt Nam (Đà Nẵng) — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn 5×5 giao điểm. Đường NGANG/DỌC luôn nối; đường CHÉO chỉ ở giao điểm có
   (hàng+cột) CHẴN. Mỗi bên 8 quân, xếp ở 16 điểm rìa ngoài; 9 điểm trong để trống.
   Mỗi lượt: di chuyển MỘT quân tới giao điểm TRỐNG kề theo đường kẻ.
   - GÁNH: chủ động đi quân vào GIỮA hai quân địch trên một đường thẳng → hai quân
     địch đó đổi màu thành quân mình (có thể "chầu" nhiều trục cùng lúc).
   - VÂY: quân địch bị bịt hết ô trống quanh nó (không đi được) → đổi màu.
   THẮNG khi đối thủ hết quân (mình giữ cả 16).
   P1 (Đỏ) ở dưới, P2 (Xanh) ở trên. */
(function () {
  const N = 5;
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function create(ctx) {
    // board[r][c] = null | 0 (P1 Đỏ) | 1 (P2 Xanh)
    let board = Array.from({ length: N }, () => Array(N).fill(null));
    // P2 (trên): toàn hàng 0 + (1,0) + (1,4) + (2,0)
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [1, 4], [2, 0]].forEach(([r, c]) => board[r][c] = 1);
    // P1 (dưới): toàn hàng 4 + (3,0) + (3,4) + (2,4)
    [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 0], [3, 4], [2, 4]].forEach(([r, c]) => board[r][c] = 0);

    let turn = 0;
    let over = false;
    let selected = null;     // [r,c]
    let lastMove = null;     // {from,to}
    let flippedCells = [];   // ô vừa đổi màu (highlight)
    let movesSinceFlip = 0;  // chống lặp: số nước liên tiếp không ai ăn quân
    let totalPlies = 0;      // tổng số nước (chặn ván kéo dài vô tận do lật qua lại)
    const STALL_CAP = 200;   // quá ngưỡng này -> phân thắng theo số quân

    const root = document.createElement("div");
    root.className = "cg-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "cg-hud";
    root.appendChild(hud);

    const wrap = document.createElement("div");
    wrap.className = "cg-wrap";
    root.appendChild(wrap);

    // ----- vẽ đường kẻ bằng SVG -----
    const px = (c) => 10 + c * 20;  // toạ độ 0..100
    const py = (r) => 10 + r * 20;
    function hasDiag(r, c) { return (r + c) % 2 === 0; }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "cg-lines");
    function addLine(r1, c1, r2, c2) {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", px(c1)); ln.setAttribute("y1", py(r1));
      ln.setAttribute("x2", px(c2)); ln.setAttribute("y2", py(r2));
      ln.setAttribute("class", "cg-line");
      svg.appendChild(ln);
    }
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (c + 1 < N) addLine(r, c, r, c + 1);          // ngang
        if (r + 1 < N) addLine(r, c, r + 1, c);          // dọc
        if (hasDiag(r, c)) {                              // chéo (chỉ điểm chẵn)
          if (r + 1 < N && c + 1 < N) addLine(r, c, r + 1, c + 1);
          if (r + 1 < N && c - 1 >= 0) addLine(r, c, r + 1, c - 1);
        }
      }
    }
    wrap.appendChild(svg);

    // ----- các giao điểm bấm được -----
    const pointEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const pt = document.createElement("button");
        pt.type = "button";
        pt.className = "cg-point";
        pt.style.left = px(c) + "%";
        pt.style.top = py(r) + "%";
        const rr = r, cc = c;
        pt.addEventListener("click", () => onClick(rr, cc));
        wrap.appendChild(pt);
        pointEls[r][c] = pt;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    // các giao điểm kề (theo đường kẻ) của (r,c)
    function neighbors(r, c) {
      const out = [];
      for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (inB(nr, nc)) out.push([nr, nc]); }
      if (hasDiag(r, c)) for (const [dr, dc] of DIAG) { const nr = r + dr, nc = c + dc; if (inB(nr, nc)) out.push([nr, nc]); }
      return out;
    }
    function emptyNeighbors(B, r, c) { return neighbors(r, c).filter(([nr, nc]) => B[nr][nc] === null); }
    function countPieces(B, p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (B[r][c] === p) n++;
      return n;
    }
    function pieceMoves(B, r, c) { return emptyNeighbors(B, r, c); }
    function allMoves(B, p) {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (B[r][c] !== p) continue;
        for (const [tr, tc] of pieceMoves(B, r, c)) out.push({ from: [r, c], to: [tr, tc] });
      }
      return out;
    }

    // áp dụng GÁNH + VÂY sau khi quân p vừa tới (cr,cc); trả về danh sách ô đã đổi màu
    function applyCaptures(B, cr, cc, p) {
      const opp = 1 - p;
      const flipped = [];
      // GÁNH: với mỗi TRỤC qua (cr,cc), nếu hai đầu đều là quân địch -> kẹp
      const axes = [[0, 1], [1, 0]];
      if (hasDiag(cr, cc)) axes.push([1, 1], [1, -1]);
      for (const [dr, dc] of axes) {
        const ar = cr + dr, ac = cc + dc, br = cr - dr, bc = cc - dc;
        if (inB(ar, ac) && inB(br, bc) && B[ar][ac] === opp && B[br][bc] === opp) {
          B[ar][ac] = p; B[br][bc] = p; flipped.push([ar, ac], [br, bc]);
        }
      }
      // VÂY: quân địch nào không còn ô trống kề -> đổi màu
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (B[r][c] !== opp) continue;
        if (emptyNeighbors(B, r, c).length === 0) { B[r][c] = p; flipped.push([r, c]); }
      }
      return flipped;
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay()) return;
      if (board[r][c] === turn) { selected = [r, c]; render(); return; }
      if (selected && board[r][c] === null) {
        const ms = pieceMoves(board, selected[0], selected[1]);
        if (ms.some(([mr, mc]) => mr === r && mc === c)) {
          applyMove({ from: selected.slice(), to: [r, c] }, false);
        }
      }
    }

    function isLegal(move) {
      if (!move || !move.from || !move.to) return false;
      const [fr, fc] = move.from, [tr, tc] = move.to;
      if (!inB(fr, fc) || !inB(tr, tc)) return false;
      if (board[fr][fc] !== turn || board[tr][tc] !== null) return false;
      return pieceMoves(board, fr, fc).some(([mr, mc]) => mr === tr && mc === tc);
    }

    function applyMove(move, fromRemote) {
      if (over || !isLegal(move)) return;
      if (!fromRemote) ctx.sendMove({ from: move.from.slice(), to: move.to.slice() });
      const p = turn;
      const [fr, fc] = move.from, [tr, tc] = move.to;
      board[fr][fc] = null;
      board[tr][tc] = p;
      const flipped = applyCaptures(board, tr, tc, p);
      lastMove = { from: [fr, fc], to: [tr, tc] };
      flippedCells = flipped;
      selected = null;
      ctx.sound(flipped.length ? "capture" : "place");
      movesSinceFlip = flipped.length ? 0 : movesSinceFlip + 1;
      totalPlies++;

      // thắng: đối thủ hết quân
      if (countPieces(board, 1 - p) === 0) {
        over = true;
        render();
        ctx.incScore(p);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${p + 1} thắng — đã chiếm toàn bộ quân cờ!`,
          `🎉 Player ${p + 1} wins — captured every piece!`));
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

      // chống lặp vô hạn: quá nhiều nước không ai ăn quân, HOẶC ván kéo dài quá lâu
      // (cờ gánh có thể lật qua lại mãi) -> phân thắng theo số quân.
      if (movesSinceFlip >= 60 || totalPlies >= STALL_CAP) {
        over = true;
        render();
        const c0 = countPieces(board, 0), c1 = countPieces(board, 1);
        const w = c0 === c1 ? -1 : (c0 > c1 ? 0 : 1);
        if (w >= 0) ctx.incScore(w);
        ctx.setTurn(-1);
        ctx.setStatus(w < 0
          ? ctx.t("🤝 Hòa — quá nhiều nước đi qua lại không ai ăn quân!", "🤝 Draw — too many moves with no captures!")
          : ctx.t(`🎉 Người chơi ${w + 1} thắng do nhiều quân hơn (${Math.max(c0, c1)}-${Math.min(c0, c1)})!`,
            `🎉 Player ${w + 1} wins on piece count (${Math.max(c0, c1)}-${Math.min(c0, c1)})!`));
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
        <div class="cg-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🔴 ${ctx.t("Đỏ", "Red")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(board, 0)}</b>
        </div>
        <div class="cg-mid">${over ? "🏁" : "VS"}</div>
        <div class="cg-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🔵 ${ctx.t("Xanh", "Blue")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(board, 1)}</b>
        </div>`;
    }

    function render() {
      renderHud();
      const hintSet = new Set();
      if (selected && canPlay() && board[selected[0]][selected[1]] === turn) {
        pieceMoves(board, selected[0], selected[1]).forEach(([r, c]) => hintSet.add(r * N + c));
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const pt = pointEls[r][c];
          pt.className = "cg-point";
          pt.innerHTML = "";
          const v = board[r][c];
          if (v === 0 || v === 1) {
            const pawn = document.createElement("div");
            pawn.className = "cg-pawn " + (v === 0 ? "p1" : "p2");
            if (selected && selected[0] === r && selected[1] === c) pawn.classList.add("sel");
            if (flippedCells.some(([fr, fc]) => fr === r && fc === c)) pawn.classList.add("flip");
            pt.appendChild(pawn);
          }
          if (lastMove) {
            if (lastMove.from[0] === r && lastMove.from[1] === c) pt.classList.add("lastfrom");
            if (lastMove.to[0] === r && lastMove.to[1] === c) pt.classList.add("lastto");
          }
          if (hintSet.has(r * N + c)) pt.classList.add("hint");
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1} — bấm một quân của bạn rồi bấm giao điểm SÁNG để đi. Đi vào giữa hai quân địch để "gánh"!`,
        `Player ${turn + 1} — click your piece then a HIGHLIGHTED point to move. Land between two enemy pieces to "carry" them!`));
    }

    // ---------- AI ----------
    function cloneB(B) { return B.map((row) => row.slice()); }
    function simulate(B, move, p) {
      const C = cloneB(B);
      C[move.from[0]][move.from[1]] = null;
      C[move.to[0]][move.to[1]] = p;
      applyCaptures(C, move.to[0], move.to[1], p);
      return C;
    }
    function evalB(B, me) { return countPieces(B, me) - countPieces(B, 1 - me); }

    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const moves = allMoves(board, me);
      if (!moves.length) return null;
      // thắng ngay
      for (const mv of moves) if (countPieces(simulate(board, mv, me), opp) === 0) return mv;
      if (level === "easy" && Math.random() < 0.5) return moves[Math.floor(Math.random() * moves.length)];

      let best = -Infinity, pick = moves[0];
      for (const mv of moves) {
        const C = simulate(board, mv, me);
        let sc = evalB(C, me) * 10;
        if (level === "hard") {
          // đối thủ phản đòn tốt nhất (ăn nhiều quân mình nhất)
          const replies = allMoves(C, opp);
          let worst = Infinity;
          for (const rmv of replies) {
            const C2 = simulate(C, rmv, opp);
            worst = Math.min(worst, evalB(C2, me) * 10);
            if (countPieces(C2, me) === 0) { worst = -100000; break; }
          }
          if (replies.length) sc = sc * 0.3 + worst * 0.7;
        } else if (level === "normal") {
          sc += Math.random() * 3;
        }
        sc += Math.random() * 0.5;
        if (sc > best) { best = sc; pick = mv; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "coganh",
    name: "Cờ Gánh",
    emoji: "🔴",
    description: "Cờ dân gian Việt Nam (Đà Nẵng): di quân trên bàn 5×5, đi vào giữa hai quân địch để 'gánh' đổi màu, hoặc 'vây' kín quân địch. Chiếm hết quân đối thủ để thắng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Bàn 5×5 giao điểm. Đường ngang/dọc luôn nối; đường chéo chỉ có ở những giao điểm nhất định (vẽ sẵn trên bàn). Mỗi bên 8 quân xếp ở rìa ngoài; Người chơi 1 (Đỏ) ở dưới, Người chơi 2 (Xanh) ở trên. Đỏ đi trước.",
      "Mỗi lượt: bấm một quân của mình rồi bấm một giao điểm TRỐNG kề (theo đường kẻ) để di chuyển tới đó — mỗi nước chỉ đi 1 bước.",
      "GÁNH: nếu bạn chủ động đi quân vào GIỮA hai quân địch nằm thẳng hàng (hai bên là địch), thì hai quân địch đó bị 'gánh' và đổi thành quân của bạn. Có thể gánh nhiều hướng cùng lúc (chầu 4, chầu 6).",
      "Lưu ý: chỉ gánh được khi CHÍNH BẠN đi quân vào giữa. Tự đặt quân mình vào giữa hai quân địch lúc đối thủ đi thì KHÔNG bị mất — nên có thể 'mở' nhử đối thủ.",
      "VÂY: nếu một quân địch bị bịt kín hết các giao điểm trống xung quanh (không còn nước đi), nó bị 'vây' và cũng đổi thành quân của bạn.",
      "THẮNG khi đối thủ không còn quân nào (bạn giữ cả 16 quân), hoặc khi đối thủ hết nước đi.",
    ],
    create,
  });
})();
