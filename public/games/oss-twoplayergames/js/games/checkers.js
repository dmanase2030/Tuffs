/* Cờ Đam (Checkers) 8x8 — chơi chung máy & online
   P1 (Đỏ) ở dưới đi lên, P2 (Đen) ở trên đi xuống. Tới hàng cuối thành Vua.
   Bắt buộc ăn khi có thể, ăn liên hoàn. Tùy chọn Vua bay (ăn/đi xa tùy ý). */
(function () {
  const N = 8;

  function create(ctx) {
    const o = ctx.options || {};
    const FLYING = o.kings === "flying";

    let board = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if ((r + c) % 2 === 1) {
          if (r < 3) board[r][c] = { p: 1, king: false };
          else if (r > 4) board[r][c] = { p: 0, king: false };
        }
      }
    }
    let turn = 0;
    let selected = null;
    let mustContinue = null;
    let over = false;
    let lastMove = null;     // {from:[r,c], to:[r,c]}
    const eaten = [0, 0];    // số quân mỗi người đã ăn
    let aiPlan = null;       // chuỗi nước ăn liên hoàn AI đã chọn
    let aiPlanIdx = 0;

    const root = document.createElement("div");
    root.className = "chk-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "chk-hud";
    root.appendChild(hud);

    const grid = document.createElement("div");
    grid.className = "chk-board";
    root.appendChild(grid);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "chk-cell " + ((r + c) % 2 === 1 ? "dark" : "light");
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function dirsFor(piece) {
      if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      return piece.p === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    }

    function pieceMoves(r, c, capturesOnly) {
      const piece = board[r][c];
      if (!piece) return [];
      const moves = [];
      if (piece.king && FLYING) {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let rr = r + dr, cc = c + dc;
          // đi qua các ô trống
          while (inB(rr, cc) && board[rr][cc] === null) {
            if (!capturesOnly) moves.push({ to: [rr, cc], cap: null });
            rr += dr; cc += dc;
          }
          // gặp quân địch -> có thể ăn nếu phía sau trống
          if (inB(rr, cc) && board[rr][cc] && board[rr][cc].p !== piece.p) {
            const cap = [rr, cc];
            let lr = rr + dr, lc = cc + dc;
            while (inB(lr, lc) && board[lr][lc] === null) {
              moves.push({ to: [lr, lc], cap });
              lr += dr; lc += dc;
            }
          }
        }
        return moves;
      }
      for (const [dr, dc] of dirsFor(piece)) {
        const ar = r + dr, ac = c + dc;
        const lr = r + 2 * dr, lc = c + 2 * dc;
        if (inB(lr, lc) && board[ar][ac] && board[ar][ac].p !== piece.p && board[lr][lc] === null) {
          moves.push({ to: [lr, lc], cap: [ar, ac] });
        } else if (!capturesOnly && inB(ar, ac) && board[ar][ac] === null) {
          moves.push({ to: [ar, ac], cap: null });
        }
      }
      return moves;
    }

    function playerHasCapture(p) {
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (board[r][c] && board[r][c].p === p && pieceMoves(r, c, true).length) return true;
      return false;
    }
    function legalMoves(r, c) {
      if (mustContinue) {
        if (mustContinue[0] !== r || mustContinue[1] !== c) return [];
        return pieceMoves(r, c, true);
      }
      return pieceMoves(r, c, playerHasCapture(turn));
    }
    function playerHasAnyMove(p) {
      const forced = playerHasCapture(p);
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (board[r][c] && board[r][c].p === p && pieceMoves(r, c, forced).length) return true;
      return false;
    }
    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay()) return;
      const piece = board[r][c];
      if (selected) {
        const mv = legalMoves(selected[0], selected[1]).find((m) => m.to[0] === r && m.to[1] === c);
        if (mv) {
          applyMove({ from: selected.slice(), to: [r, c], cap: mv.cap || null }, false);
          return;
        }
      }
      if (!mustContinue && piece && piece.p === turn && legalMoves(r, c).length) {
        selected = [r, c];
        render();
      }
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const [fr, fc] = move.from;
      const [tr, tc] = move.to;
      const piece = board[fr][fc];
      if (!piece) return;
      const cap = move.cap || null;

      board[tr][tc] = piece;
      board[fr][fc] = null;
      if (cap) { board[cap[0]][cap[1]] = null; eaten[turn]++; }
      lastMove = { from: [fr, fc], to: [tr, tc] };

      let promoted = false;
      if (!piece.king && ((piece.p === 0 && tr === 0) || (piece.p === 1 && tr === N - 1))) {
        piece.king = true;
        promoted = true;
      }

      if (!fromRemote) ctx.sendMove({ from: [fr, fc], to: [tr, tc], cap });
      ctx.sound(cap ? "capture" : "place");

      if (cap && !promoted && pieceMoves(tr, tc, true).length) {
        mustContinue = [tr, tc];
        selected = [tr, tc];
        render();
        ctx.setTurn(turn); // báo lại lượt để engine AI tiếp tục chuỗi ăn
        ctx.setStatus(ctx.t(`Người chơi ${turn + 1} ăn tiếp! Tiếp tục bắt quân.`,
          `Player ${turn + 1} captures again! Keep jumping.`));
        return;
      }

      mustContinue = null;
      selected = null;
      turn = 1 - turn;
      render();

      if (!playerHasAnyMove(turn)) {
        over = true;
        ctx.incScore(1 - turn);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${(1 - turn) + 1} thắng — đối thủ không còn nước đi!`,
          `🎉 Player ${(1 - turn) + 1} wins — opponent has no moves left!`));
        return;
      }
      ctx.setTurn(turn);
      updateStatus();
    }

    function countPieces(p) {
      let n = 0, k = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const b = board[r][c];
        if (b && b.p === p) { n++; if (b.king) k++; }
      }
      return { n, k };
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const a = countPieces(0), b = countPieces(1);
      const trayP = (cnt, cls) => `<div class="chk-tray">${Array.from({ length: cnt }, () => `<i class="chk-mini ${cls}"></i>`).join("")}</div>`;
      const forced = !over && playerHasCapture(turn);
      hud.innerHTML = `
        <div class="chk-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🔴 ${ctx.t("Đỏ", "Red")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${a.n} ${ctx.t("quân", "pcs")}${a.k ? " · ♔" + a.k : ""}</b>
          ${trayP(eaten[0], "p2")}
        </div>
        <div class="chk-mid">${over ? "🏁" : forced ? ctx.t("⚠️ buộc ăn", "⚠️ must capture") : "VS"}</div>
        <div class="chk-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>⚫ ${ctx.t("Đen", "Black")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${b.n} ${ctx.t("quân", "pcs")}${b.k ? " · ♔" + b.k : ""}</b>
          ${trayP(eaten[1], "p1")}
        </div>
      `;
    }

    function render() {
      renderHud();
      const moveSet = new Set();
      const capSet = new Set();
      if (selected) {
        legalMoves(selected[0], selected[1]).forEach((m) => {
          const k = m.to[0] * N + m.to[1];
          if (m.cap) capSet.add(k); else moveSet.add(k);
          if (m.cap) capSet.add("c" + (m.cap[0] * N + m.cap[1]));
        });
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.classList.remove("sel", "hint", "caphint", "captarget", "lastfrom", "lastto");
          const piece = board[r][c];
          if (piece) {
            const disc = document.createElement("div");
            disc.className = "chk-piece " + (piece.p === 0 ? "p1" : "p2") + (piece.king ? " king" : "");
            if (piece.king) disc.innerHTML = "<i>♔</i>";
            cell.appendChild(disc);
          }
          if (lastMove) {
            if (lastMove.from[0] === r && lastMove.from[1] === c) cell.classList.add("lastfrom");
            if (lastMove.to[0] === r && lastMove.to[1] === c) cell.classList.add("lastto");
          }
          if (selected && selected[0] === r && selected[1] === c) cell.classList.add("sel");
          const k = r * N + c;
          if (moveSet.has(k)) cell.classList.add("hint");
          if (capSet.has(k)) cell.classList.add("caphint");
          if (capSet.has("c" + k)) cell.classList.add("captarget");
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      ctx.setStatus(playerHasCapture(turn)
        ? ctx.t(`Người chơi ${turn + 1}: BẮT BUỘC ăn quân! Chọn quân có thể ăn.`,
                `Player ${turn + 1}: capture is MANDATORY! Pick a piece that can capture.`)
        : ctx.t(`Người chơi ${turn + 1}: chọn quân để đi (ô xanh = đi, ô đỏ = ăn).`,
                `Player ${turn + 1}: pick a piece to move (green = move, red = capture).`));
    }

    // ----- AI: minimax theo lượt đầy đủ (ăn liên hoàn) -----
    function dirsForB(piece) {
      if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      return piece.p === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
    }
    function movesB(b, r, c, capturesOnly) {
      const piece = b[r][c];
      if (!piece) return [];
      const moves = [];
      if (piece.king && FLYING) {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let rr = r + dr, cc = c + dc;
          while (inB(rr, cc) && b[rr][cc] === null) { if (!capturesOnly) moves.push({ to: [rr, cc], cap: null }); rr += dr; cc += dc; }
          if (inB(rr, cc) && b[rr][cc] && b[rr][cc].p !== piece.p) {
            const cap = [rr, cc]; let lr = rr + dr, lc = cc + dc;
            while (inB(lr, lc) && b[lr][lc] === null) { moves.push({ to: [lr, lc], cap }); lr += dr; lc += dc; }
          }
        }
        return moves;
      }
      for (const [dr, dc] of dirsForB(piece)) {
        const ar = r + dr, ac = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (inB(lr, lc) && b[ar][ac] && b[ar][ac].p !== piece.p && b[lr][lc] === null) moves.push({ to: [lr, lc], cap: [ar, ac] });
        else if (!capturesOnly && inB(ar, ac) && b[ar][ac] === null) moves.push({ to: [ar, ac], cap: null });
      }
      return moves;
    }
    function hasCapB(b, p) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c] && b[r][c].p === p && movesB(b, r, c, true).length) return true;
      return false;
    }
    function cloneB(b) { return b.map((row) => row.map((x) => x ? { p: x.p, king: x.king } : null)); }
    function applySubB(b, sub) {
      const [fr, fc] = sub.from, [tr, tc] = sub.to; const piece = b[fr][fc];
      b[tr][tc] = piece; b[fr][fc] = null; if (sub.cap) b[sub.cap[0]][sub.cap[1]] = null;
      let promoted = false;
      if (!piece.king && ((piece.p === 0 && tr === 0) || (piece.p === 1 && tr === N - 1))) { piece.king = true; promoted = true; }
      return promoted;
    }
    function expandCaps(b, r, c, seq, out) {
      const caps = movesB(b, r, c, true);
      if (!caps.length) { out.push(seq); return; }
      for (const m of caps) {
        const nb = cloneB(b); const sub = { from: [r, c], to: m.to, cap: m.cap };
        const promoted = applySubB(nb, sub);
        if (promoted) out.push(seq.concat([sub]));
        else expandCaps(nb, m.to[0], m.to[1], seq.concat([sub]), out);
      }
    }
    function genTurns(b, p) {
      const out = []; const forced = hasCapB(b, p);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const piece = b[r][c]; if (!piece || piece.p !== p) continue;
        const ms = movesB(b, r, c, forced);
        for (const m of ms) {
          if (m.cap) {
            const nb = cloneB(b); const sub = { from: [r, c], to: m.to, cap: m.cap };
            const promoted = applySubB(nb, sub);
            if (promoted) out.push([sub]); else expandCaps(nb, m.to[0], m.to[1], [sub], out);
          } else out.push([{ from: [r, c], to: m.to, cap: null }]);
        }
      }
      return out;
    }
    function applyTurnB(b, t) { const nb = cloneB(b); for (const sub of t) applySubB(nb, sub); return nb; }
    function evalB(b, me) {
      let s = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const x = b[r][c]; if (!x) continue;
        let v = x.king ? 3.2 : 1;
        if (!x.king) v += (x.p === 0 ? (N - 1 - r) : r) * 0.05;
        s += (x.p === me ? v : -v);
      }
      return s;
    }
    function searchT(b, p, me, depth, alpha, beta) {
      const turns = genTurns(b, p);
      if (!turns.length) return p === me ? -10000 + (12 - depth) : 10000 - (12 - depth);
      if (depth === 0) return evalB(b, me);
      if (p === me) {
        let v = -Infinity;
        for (const t of turns) { v = Math.max(v, searchT(applyTurnB(b, t), 1 - p, me, depth - 1, alpha, beta)); alpha = Math.max(alpha, v); if (alpha >= beta) break; }
        return v;
      }
      let v = Infinity;
      for (const t of turns) { v = Math.min(v, searchT(applyTurnB(b, t), 1 - p, me, depth - 1, alpha, beta)); beta = Math.min(beta, v); if (alpha >= beta) break; }
      return v;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      // tiếp tục chuỗi ăn đã định
      if (mustContinue) {
        if (aiPlan && aiPlanIdx < aiPlan.length) { const s = aiPlan[aiPlanIdx++]; return { from: s.from.slice(), to: s.to.slice(), cap: s.cap }; }
        const ms = legalMoves(mustContinue[0], mustContinue[1]);
        if (ms.length) { const m = ms[0]; return { from: mustContinue.slice(), to: m.to, cap: m.cap || null }; }
        return null;
      }
      const turns = genTurns(board, me);
      if (!turns.length) return null;
      let pick;
      if (level === "easy" && Math.random() < 0.5) {
        pick = turns[Math.floor(Math.random() * turns.length)];
      } else {
        const depth = level === "easy" ? 2 : level === "hard" ? 6 : 4;
        let best = -Infinity; pick = turns[0];
        for (const t of turns) {
          const sc = searchT(applyTurnB(board, t), 1 - me, me, depth - 1, -Infinity, Infinity);
          if (sc > best) { best = sc; pick = t; }
        }
      }
      aiPlan = pick; aiPlanIdx = 1;
      const s = pick[0];
      return { from: s.from.slice(), to: s.to.slice(), cap: s.cap };
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Đen)", "Player 2 (Black)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "checkers",
    name: "Cờ Đam (Checkers)",
    emoji: "🔴",
    description: "Cờ ăn quân nhảy chéo kinh điển. Bắt buộc ăn, ăn liên hoàn, phong Vua. Có chế độ Vua bay và bảng đếm quân/khay quân đã ăn.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "kings", label: "Kiểu Vua", default: "standard",
        choices: [
          { value: "standard", label: "Vua thường (đi 1 ô)" },
          { value: "flying", label: "Vua bay (đi/ăn xa tùy ý)" },
        ],
      },
    ],
    howTo: [
      "Người chơi 1 dùng quân 🔴 Đỏ (ở dưới, đi lên), Người chơi 2 dùng quân ⚫ Đen (ở trên, đi xuống). Đỏ đi trước.",
      "Bấm quân của mình để chọn — ô XANH là nước đi, ô ĐỎ là nước ăn (quân bị ăn cũng được tô đỏ). Bấm ô sáng để thực hiện.",
      "Quân thường đi chéo tiến 1 ô; ăn bằng cách nhảy chéo qua quân địch vào ô trống ngay sau. Nếu có thể ăn thì BẮT BUỘC phải ăn, và ăn liên hoàn nếu còn ăn được.",
      "Quân tới hàng cuối phía đối thủ thành Vua ♔ (đi & ăn cả 4 hướng chéo).",
      "Chế độ 'Vua bay': Vua đi và ăn theo đường chéo XA tùy ý (như cờ đam quốc tế) — mạnh hơn nhiều, hấp dẫn hơn.",
      "Bảng trên đếm số quân và Vua còn lại, kèm khay hiển thị số quân mỗi bên đã ăn. Thắng khi đối thủ hết quân hoặc không còn nước đi.",
    ],
    create,
  });
})();
