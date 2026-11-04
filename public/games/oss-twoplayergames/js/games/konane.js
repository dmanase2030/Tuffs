/* Kōnane (Cờ Hawaii) — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn NxN xếp KÍN quân, xen kẽ Đen/Trắng như bàn cờ vua.
   Mở màn: Đen bỏ 1 quân của mình (ở góc hoặc trung tâm), rồi Trắng bỏ 1 quân
   của mình nằm sát ô vừa trống. Sau đó hai bên thay phiên NHẢY ăn: nhảy theo
   hàng NGANG/DỌC qua 1 quân địch sát bên vào ô trống ngay sau (như cờ đam nhưng
   không đi chéo). Có thể nhảy liên tiếp theo CÙNG MỘT HƯỚNG, ăn nhiều quân.
   Ai tới lượt mà hết nước đi thì THUA. */
(function () {
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size === "8" ? 8 : 6;

    // board[r][c] = 0 (P1/Đen) | 1 (P2/Trắng) | null
    let board = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c) => ((r + c) % 2 === 0 ? 0 : 1))
    );
    let phase = "p1remove";   // p1remove -> p2remove -> play
    let turn = 0;             // p1remove:0, p2remove:1, play: 0/1
    let selected = null;
    let over = false;
    let winnerP = -1;         // người thắng (để tô sáng quân khi kết thúc)
    let lastMove = null;      // {from:[r,c], to:[r,c]}
    let lastRemoved = null;   // [r,c] ô vừa bị bỏ khi mở màn
    const captured = [0, 0];  // số quân mỗi bên đã ăn

    const root = document.createElement("div");
    root.className = "kon-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "kon-hud";
    root.appendChild(hud);

    const grid = document.createElement("div");
    grid.className = "kon-board";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    root.appendChild(grid);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "kon-cell " + ((r + c) % 2 === 0 ? "d" : "l");
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    // Các nước nhảy của 1 quân: mỗi landing (1,2,3... bước cùng hướng) là 1 nước.
    function pieceMovesB(b, r, c) {
      const p = b[r][c];
      if (p == null) return [];
      const out = [];
      for (const [dr, dc] of ORTHO) {
        let caps = [];
        let cr = r, cc = c;
        while (true) {
          const er = cr + dr, ec = cc + dc;       // ô quân địch bị nhảy qua
          const lr = cr + 2 * dr, lc = cc + 2 * dc; // ô đáp
          if (inB(lr, lc) && b[er][ec] != null && b[er][ec] !== p && b[lr][lc] == null) {
            caps = caps.concat([[er, ec]]);
            out.push({ to: [lr, lc], caps: caps.slice() });
            cr = lr; cc = lc;
          } else break;
        }
      }
      return out;
    }
    function pieceMoves(r, c) { return pieceMovesB(board, r, c); }

    function genMovesB(b, p) {
      const out = [];
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (b[r][c] === p)
            for (const m of pieceMovesB(b, r, c)) out.push({ from: [r, c], to: m.to, caps: m.caps });
      return out;
    }
    function hasMove(p) { return genMovesB(board, p).length > 0; }

    // ----- ô được phép bỏ khi mở màn -----
    function openingFirstCells() {
      const m = N >> 1;
      return [
        [0, 0], [0, N - 1], [N - 1, 0], [N - 1, N - 1],
        [m - 1, m - 1], [m - 1, m], [m, m - 1], [m, m],
      ];
    }
    function removableCells() {
      if (phase === "p1remove") {
        return openingFirstCells().filter(([r, c]) => board[r][c] === 0);
      }
      if (phase === "p2remove" && lastRemoved) {
        const out = [];
        for (const [dr, dc] of ORTHO) {
          const r = lastRemoved[0] + dr, c = lastRemoved[1] + dc;
          if (inB(r, c) && board[r][c] === 1) out.push([r, c]);
        }
        return out;
      }
      return [];
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay()) return;
      if (phase !== "play") {
        if (removableCells().some(([rr, cc]) => rr === r && cc === c)) {
          applyMove({ remove: [r, c] }, false);
        }
        return;
      }
      if (selected) {
        const mv = pieceMoves(selected[0], selected[1]).find((m) => m.to[0] === r && m.to[1] === c);
        if (mv) {
          applyMove({ from: selected.slice(), to: [r, c], caps: mv.caps }, false);
          return;
        }
      }
      if (board[r][c] === turn && pieceMoves(r, c).length) {
        selected = [r, c];
        render();
        return;
      }
      selected = null;
      render();
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.remove) {
        const [r, c] = move.remove;
        if (board[r][c] == null) return;
        board[r][c] = null;
        lastRemoved = [r, c];
        selected = null;
        if (!fromRemote) ctx.sendMove({ remove: [r, c] });
        ctx.sound("capture");
        if (phase === "p1remove") { phase = "p2remove"; turn = 1; }
        else { phase = "play"; turn = 0; }
        render();
        ctx.setTurn(turn);
        updateStatus();
        return;
      }

      const [fr, fc] = move.from;
      const [tr, tc] = move.to;
      if (board[fr][fc] !== turn) return;
      board[tr][tc] = board[fr][fc];
      board[fr][fc] = null;
      for (const [er, ec] of (move.caps || [])) {
        if (board[er][ec] != null) { board[er][ec] = null; captured[turn]++; }
      }
      lastMove = { from: [fr, fc], to: [tr, tc] };
      selected = null;
      if (!fromRemote) ctx.sendMove({ from: [fr, fc], to: [tr, tc], caps: move.caps || [] });
      ctx.sound("capture");

      turn = 1 - turn;
      render();

      if (!hasMove(turn)) {
        over = true;
        const winner = 1 - turn;
        winnerP = winner;
        render();
        ctx.incScore(winner);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${winner + 1} thắng — đối thủ hết nước nhảy!`,
          `🎉 Player ${winner + 1} wins — opponent has no jumps left!`));
        return;
      }
      ctx.setTurn(turn);
      updateStatus();
    }

    function countPieces(p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (board[r][c] === p) n++;
      return n;
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      hud.innerHTML = `
        <div class="kon-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>⚫ ${ctx.t("Đen", "Black")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(0)} ${ctx.t("quân", "pcs")}</b>
        </div>
        <div class="kon-mid">${over ? "🏁" : "VS"}</div>
        <div class="kon-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>⚪ ${ctx.t("Trắng", "White")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${countPieces(1)} ${ctx.t("quân", "pcs")}</b>
        </div>
      `;
    }

    function render() {
      renderHud();
      const moveSet = new Set();
      const removeSet = new Set();
      if (phase !== "play" && !over) {
        removableCells().forEach(([r, c]) => removeSet.add(r * N + c));
      } else if (selected) {
        pieceMoves(selected[0], selected[1]).forEach((m) => moveSet.add(m.to[0] * N + m.to[1]));
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.classList.remove("sel", "hint", "remove", "lastfrom", "lastto");
          const p = board[r][c];
          if (p != null) {
            const disc = document.createElement("div");
            disc.className = "kon-piece " + (p === 0 ? "p1" : "p2");
            if (over && p === winnerP) disc.classList.add("win");
            cell.appendChild(disc);
          }
          if (lastMove) {
            if (lastMove.from[0] === r && lastMove.from[1] === c) cell.classList.add("lastfrom");
            if (lastMove.to[0] === r && lastMove.to[1] === c) cell.classList.add("lastto");
          }
          if (selected && selected[0] === r && selected[1] === c) cell.classList.add("sel");
          const k = r * N + c;
          if (moveSet.has(k)) cell.classList.add("hint");
          if (removeSet.has(k)) cell.classList.add("remove");
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving..."));
        return;
      }
      if (phase === "p1remove") {
        ctx.setStatus(ctx.t(
          "Người chơi 1 (Đen): bỏ 1 quân của mình ở GÓC hoặc TRUNG TÂM (ô sáng) để mở màn.",
          "Player 1 (Black): remove one of your pieces from a CORNER or the CENTER (lit cells) to open."));
        return;
      }
      if (phase === "p2remove") {
        ctx.setStatus(ctx.t(
          "Người chơi 2 (Trắng): bỏ 1 quân của mình nằm SÁT ô vừa trống (ô sáng).",
          "Player 2 (White): remove one of your pieces ADJACENT to the empty cell (lit cells)."));
        return;
      }
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1}: chọn quân rồi nhảy ngang/dọc qua quân địch vào ô trống (ô xanh).`,
        `Player ${turn + 1}: pick a piece and jump orthogonally over an enemy into an empty cell (green).`));
    }

    // ----- AI: minimax dựa trên độ cơ động (ai hết nước đi thì thua) -----
    function applyMoveBoard(b, p, move) {
      const nb = b.map((row) => row.slice());
      const [fr, fc] = move.from, [tr, tc] = move.to;
      nb[tr][tc] = nb[fr][fc];
      nb[fr][fc] = null;
      for (const [er, ec] of move.caps) nb[er][ec] = null;
      return nb;
    }
    function countP(b, p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c] === p) n++;
      return n;
    }
    function evalB(b, me) {
      const mine = genMovesB(b, me).length;
      const opp = genMovesB(b, 1 - me).length;
      return 3 * (mine - opp) + 0.1 * (countP(b, me) - countP(b, 1 - me));
    }
    function search(b, p, me, depth, alpha, beta) {
      const moves = genMovesB(b, p);
      if (!moves.length) return p === me ? -10000 - depth : 10000 + depth; // p hết nước -> thua
      if (depth === 0) return evalB(b, me);
      // sắp xếp nước: ưu tiên ăn nhiều quân -> alpha-beta cắt tỉa tốt hơn nhiều
      if (depth >= 2 && moves.length > 1) moves.sort((a, b2) => b2.caps.length - a.caps.length);
      if (p === me) {
        let v = -Infinity;
        for (const m of moves) {
          v = Math.max(v, search(applyMoveBoard(b, p, m), 1 - p, me, depth - 1, alpha, beta));
          alpha = Math.max(alpha, v);
          if (alpha >= beta) break;
        }
        return v;
      }
      let v = Infinity;
      for (const m of moves) {
        v = Math.min(v, search(applyMoveBoard(b, p, m), 1 - p, me, depth - 1, alpha, beta));
        beta = Math.min(beta, v);
        if (alpha >= beta) break;
      }
      return v;
    }

    function aiMove(level) {
      if (over) return null;
      const me = turn;
      if (phase !== "play") {
        const opts = removableCells();
        if (!opts.length) return null;
        // ưu tiên trung tâm cho thế cờ tốt hơn, nếu không thì lấy ô đầu
        const m = N >> 1;
        const center = opts.find(([r, c]) => (r === m - 1 || r === m) && (c === m - 1 || c === m));
        const pick = center || opts[Math.floor(Math.random() * opts.length)];
        return { remove: pick.slice() };
      }
      const moves = genMovesB(board, me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.5) {
        const m = moves[Math.floor(Math.random() * moves.length)];
        return { from: m.from.slice(), to: m.to.slice(), caps: m.caps };
      }
      // sắp xếp gốc: ăn nhiều trước -> alpha-beta hiệu quả hơn
      moves.sort((a, b) => b.caps.length - a.caps.length);
      const depth = level === "easy" ? 2 : level === "hard" ? 5 : 3;
      let best = -Infinity, pick = moves[0];
      for (const m of moves) {
        const sc = search(applyMoveBoard(board, me, m), 1 - me, me, depth - 1, -Infinity, Infinity);
        if (sc > best) { best = sc; pick = m; }
      }
      return { from: pick.from.slice(), to: pick.to.slice(), caps: pick.caps };
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đen)", "Player 1 (Black)"), ctx.t("Người chơi 2 (Trắng)", "Player 2 (White)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "konane",
    name: "Cờ Hawaii (Kōnane)",
    emoji: "🌺",
    description: "Cờ ăn quân cổ của Hawaii. Bàn xếp kín quân Đen/Trắng; nhảy ngang/dọc qua quân địch để ăn (như cờ đam nhưng không đi chéo). Ai hết nước nhảy thì thua.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Cỡ bàn", default: "6",
        choices: [
          { value: "6", label: "6×6 (nhanh)" },
          { value: "8", label: "8×8 (dài hơi)" },
        ],
      },
    ],
    howTo: [
      "Bàn được xếp KÍN quân, xen kẽ ⚫ Đen và ⚪ Trắng như bàn cờ vua. Người chơi 1 là Đen, Người chơi 2 là Trắng.",
      "Mở màn: Đen bỏ 1 quân của mình ở GÓC hoặc TRUNG TÂM (các ô được tô sáng), rồi Trắng bỏ 1 quân của mình nằm SÁT ô vừa trống.",
      "Sau đó hai bên thay phiên ĂN bằng cách NHẢY: nhảy theo hàng ngang hoặc dọc qua đúng 1 quân địch sát bên, đáp xuống ô trống ngay sau và bỏ quân địch đó.",
      "Có thể nhảy liên tiếp nhiều lần theo CÙNG MỘT HƯỚNG trong một lượt (ăn nhiều quân); bấm quân của mình rồi bấm ô xanh đích để đi.",
      "Không đi chéo, không có nước đi thường — mọi nước đều phải là nhảy ăn. Ai tới lượt mà không còn nước nhảy nào thì THUA.",
      "Mẹo: giữ cho mình luôn còn nước đi và bóp nghẹt độ cơ động của đối thủ — Kōnane là cuộc đua xem ai cạn nước trước.",
    ],
    create,
  });
})();
