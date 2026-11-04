/* Cờ Vua Mini 5×5 (Gardner Minichess)
   Bàn 5×5, đủ quân: Xe, Mã, Tượng, Hậu, Vua + 5 Tốt mỗi bên. Luật cờ vua chuẩn
   (không nhập thành, không bắt tốt qua đường, tốt đi 1 ô — không đi đôi). Tốt
   phong cấp thành Hậu khi tới hàng cuối. Thắng bằng CHIẾU BÍ; hết nước mà không
   bị chiếu là HÒA (stalemate).

   Trắng = P1 (dưới), Đen = P2 (trên). Online: gửi {from,to}; AI minimax. */
(function () {
  const SZ = 5, TOTAL = 25;
  const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };
  const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const row = (i) => Math.floor(i / SZ), col = (i) => i % SZ, idx = (r, c) => r * SZ + c;
  const onB = (r, c) => r >= 0 && r < SZ && c >= 0 && c < SZ;
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const KING = DIAG.concat(ORTHO);

  function initBoard() {
    const b = Array(TOTAL).fill(null);
    const back = ["r", "n", "b", "q", "k"];
    for (let c = 0; c < SZ; c++) {
      b[idx(0, c)] = { t: back[c], c: 1 };       // đen hàng trên
      b[idx(1, c)] = { t: "p", c: 1 };
      b[idx(3, c)] = { t: "p", c: 0 };           // trắng
      b[idx(4, c)] = { t: back[c], c: 0 };
    }
    return b;
  }
  const clone = (b) => b.map((x) => (x ? { t: x.t, c: x.c } : null));

  // ô mà quân ở idx i "khống chế" (để xét chiếu) — tốt chỉ chéo tiến
  function attackSquares(b, i) {
    const p = b[i]; if (!p) return [];
    const r = row(i), c = col(i), out = [];
    if (p.t === "n") { for (const [dr, dc] of KN) if (onB(r + dr, c + dc)) out.push(idx(r + dr, c + dc)); return out; }
    if (p.t === "k") { for (const [dr, dc] of KING) if (onB(r + dr, c + dc)) out.push(idx(r + dr, c + dc)); return out; }
    if (p.t === "p") { const fr = p.c === 0 ? -1 : 1; for (const dc of [-1, 1]) if (onB(r + fr, c + dc)) out.push(idx(r + fr, c + dc)); return out; }
    const dirs = p.t === "b" ? DIAG : p.t === "r" ? ORTHO : KING;
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (onB(rr, cc)) { out.push(idx(rr, cc)); if (b[idx(rr, cc)]) break; rr += dr; cc += dc; }
    }
    return out;
  }

  function kingSq(b, color) { for (let i = 0; i < TOTAL; i++) { const p = b[i]; if (p && p.t === "k" && p.c === color) return i; } return -1; }
  function attacked(b, sq, byColor) {
    for (let i = 0; i < TOTAL; i++) { const p = b[i]; if (p && p.c === byColor && attackSquares(b, i).includes(sq)) return true; }
    return false;
  }
  function inCheck(b, color) { const k = kingSq(b, color); return k < 0 ? false : attacked(b, k, 1 - color); }

  // nước đi giả hợp lệ (chưa lọc chiếu)
  function pseudoFrom(b, i) {
    const p = b[i]; if (!p) return [];
    const r = row(i), c = col(i), out = [];
    if (p.t === "p") {
      const fr = p.c === 0 ? -1 : 1;
      if (onB(r + fr, c) && !b[idx(r + fr, c)]) out.push(idx(r + fr, c)); // tiến 1
      for (const dc of [-1, 1]) { const tr = r + fr, tc = c + dc; if (onB(tr, tc)) { const tg = b[idx(tr, tc)]; if (tg && tg.c !== p.c) out.push(idx(tr, tc)); } }
      return out.map((to) => ({ from: i, to }));
    }
    for (const to of attackSquares(b, i)) { const tg = b[to]; if (!tg || tg.c !== p.c) out.push({ from: i, to }); }
    return out;
  }
  function doMove(b, m) {
    const nb = clone(b); const p = nb[m.from];
    nb[m.to] = p; nb[m.from] = null;
    if (p.t === "p") { const rr = row(m.to); if ((p.c === 0 && rr === 0) || (p.c === 1 && rr === SZ - 1)) p.t = "q"; }
    return nb;
  }
  function legalMoves(b, color) {
    const out = [];
    for (let i = 0; i < TOTAL; i++) { const p = b[i]; if (!p || p.c !== color) continue; for (const m of pseudoFrom(b, i)) { if (!inCheck(doMove(b, m), color)) out.push(m); } }
    return out;
  }

  function create(ctx) {
    let board = initBoard();
    let turn = 0;
    let over = false;
    let sel = -1;
    let legalSel = [];
    let lastMove = null;
    const history = [];

    const root = document.createElement("div");
    root.className = "mc-root";
    ctx.boardEl.appendChild(root);
    const hud = document.createElement("div");
    hud.className = "mc-hud";
    root.appendChild(hud);
    const grid = document.createElement("div");
    grid.className = "mc-board";
    root.appendChild(grid);

    const cells = [];
    for (let i = 0; i < TOTAL; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mc-cell" + ((row(i) + col(i)) % 2 ? " dark" : " light");
      cell.addEventListener("click", () => onCell(i));
      grid.appendChild(cell);
      cells.push(cell);
    }

    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onCell(i) {
      if (!canAct()) return;
      const p = board[i];
      if (sel === -1) {
        if (p && p.c === turn) { sel = i; legalSel = legalMoves(board, turn).filter((m) => m.from === i); render(); }
        return;
      }
      if (i === sel) { sel = -1; legalSel = []; render(); return; }
      const mv = legalSel.find((m) => m.to === i);
      if (mv) { applyMove({ from: sel, to: i }, false); return; }
      if (p && p.c === turn) { sel = i; legalSel = legalMoves(board, turn).filter((m) => m.from === i); render(); return; }
      sel = -1; legalSel = []; render();
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const from = Number(move && move.from), to = Number(move && move.to);
      const all = legalMoves(board, turn);
      const mv = all.find((m) => m.from === from && m.to === to);
      if (!mv) return;
      history.push({ board: clone(board), turn, lastMove });
      const captured = board[to];
      board = doMove(board, mv);
      lastMove = { from, to };
      sel = -1; legalSel = [];
      ctx.sound(captured ? "capture" : "place");
      if (!fromRemote) ctx.sendMove({ from, to });

      const opp = 1 - turn;
      const oppMoves = legalMoves(board, opp);
      if (oppMoves.length === 0) {
        over = true; ctx.setTurn(-1);
        if (inCheck(board, opp)) {
          ctx.incScore(turn);
          ctx.sound("win");
          const wname = ctx.vsAI ? (turn === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1));
          ctx.setStatus(ctx.t(`🎉 Chiếu bí! ${wname} thắng.`, `🎉 Checkmate! ${wname} wins.`));
        } else {
          ctx.setStatus(ctx.t("🤝 Hết nước nhưng không bị chiếu — hòa (stalemate).", "🤝 Stalemate — draw."));
        }
        render();
        return;
      }
      turn = opp;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function undo() {
      if (!history.length) return false;
      const s = history.pop();
      board = s.board; turn = s.turn; lastMove = s.lastMove; over = false; sel = -1; legalSel = [];
      ctx.setTurn(turn); updateStatus(); render();
      return true;
    }

    function updateStatus() {
      if (over) return;
      const chk = inCheck(board, turn);
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...") + (chk ? ctx.t(" (đang bị chiếu!)", " (in check!)") : ""));
        return;
      }
      const who = ctx.vsAI ? (turn === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1));
      ctx.setStatus((chk ? ctx.t("⚠️ Đang bị CHIẾU! ", "⚠️ In CHECK! ") : "") + ctx.t(`${who}: chọn quân rồi đi.`, `${who}: pick a piece and move.`));
    }

    // ---------------- AI: negamax + alpha-beta ----------------
    function evalBoard(b) {
      let s = 0;
      for (let i = 0; i < TOTAL; i++) { const p = b[i]; if (!p) continue; const v = PVAL[p.t] + centerBonus(i, p); s += p.c === 0 ? v : -v; }
      return s; // dương = lợi cho Trắng
    }
    function centerBonus(i, p) {
      if (p.t === "k") return 0;
      const r = row(i), c = col(i);
      const d = Math.abs(r - 2) + Math.abs(c - 2);
      return (4 - d) * 0.06;
    }
    function negamax(b, color, depth, alpha, beta) {
      const moves = legalMoves(b, color);
      if (moves.length === 0) { return inCheck(b, color) ? -100000 - depth : 0; }
      if (depth === 0) { const sign = color === 0 ? 1 : -1; return sign * evalBoard(b); }
      // sắp xếp: ưu tiên nước bắt quân
      moves.sort((m1, m2) => capVal(b, m2) - capVal(b, m1));
      let best = -Infinity;
      for (const m of moves) {
        const sc = -negamax(doMove(b, m), 1 - color, depth - 1, -beta, -alpha);
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) break;
      }
      return best;
    }
    function capVal(b, m) { const t = b[m.to]; return t ? PVAL[t.t] : 0; }

    function aiMove(level) {
      if (!canAct()) return null;
      const color = turn;
      const moves = legalMoves(board, color);
      if (!moves.length) return null;
      const depth = level === "easy" ? 1 : level === "hard" ? 3 : 2;
      if (level === "easy" && ctx.rng() < 0.35) return moves[Math.floor(ctx.rng() * moves.length)];
      moves.sort((m1, m2) => capVal(board, m2) - capVal(board, m1));
      let best = -Infinity, pick = [moves[0]];
      for (const m of moves) {
        const sc = -negamax(doMove(board, m), 1 - color, depth - 1, -Infinity, Infinity);
        if (sc > best + 1e-6) { best = sc; pick = [m]; }
        else if (Math.abs(sc - best) <= 1e-6) pick.push(m);
      }
      return pick[Math.floor(ctx.rng() * pick.length)];
    }

    // ---------------- Giao diện ----------------
    function render() {
      const chk0 = inCheck(board, 0), chk1 = inCheck(board, 1);
      const p2name = ctx.vsAI ? ctx.t("🤖 Máy (Đen)", "🤖 AI (Black)") : ctx.t("⚫ Người 2 (Đen)", "⚫ P2 (Black)");
      hud.innerHTML =
        `<div class="mc-side p1 ${turn === 0 && !over ? "active" : ""}"><span>⚪ ${ctx.t("Người 1 (Trắng)", "P1 (White)")}</span>${chk0 ? `<i class="mc-chk">${ctx.t("chiếu", "check")}</i>` : ""}</div>` +
        `<div class="mc-mid">${over ? "🏁" : "♟️"}</div>` +
        `<div class="mc-side p2 ${turn === 1 && !over ? "active" : ""}"><span>${p2name}</span>${chk1 ? `<i class="mc-chk">${ctx.t("chiếu", "check")}</i>` : ""}</div>`;

      const legalTo = new Set(legalSel.map((m) => m.to));
      const kingDanger = -1;
      cells.forEach((cell, i) => {
        const p = board[i];
        let cls = "mc-cell" + ((row(i) + col(i)) % 2 ? " dark" : " light");
        cell.innerHTML = "";
        if (p) {
          cls += " has";
          cell.innerHTML = `<span class="mc-pc ${p.c === 0 ? "w" : "b"}">${GLYPH[p.t]}</span>`;
          if (p.t === "k" && inCheck(board, p.c)) cls += " incheck";
        }
        if (i === sel) cls += " sel";
        if (legalTo.has(i)) cls += p ? " capture" : " move";
        if (lastMove && i === lastMove.from) cls += " mc-lastfrom";
        if (lastMove && i === lastMove.to) cls += " mc-lastto";
        cell.disabled = !canAct();
        cell.className = cls;
      });
      void kingDanger;
    }

    ctx.setNames(ctx.t("Người 1 (Trắng)", "Player 1 (White)"), ctx.vsAI ? ctx.t("Máy (Đen)", "AI (Black)") : ctx.t("Người 2 (Đen)", "Player 2 (Black)"));
    ctx.setTurn(0);
    updateStatus();
    render();

    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "minichess",
    name: "Cờ Vua Mini 5×5",
    emoji: "♟️",
    description: "Cờ vua thu nhỏ trên bàn 5×5 đủ quân — luật chuẩn, thắng bằng chiếu bí. Ván nhanh nhưng vẫn đậm chất chiến thuật.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Bàn 5×5, mỗi bên có Xe ♜, Mã ♞, Tượng ♝, Hậu ♛, Vua ♚ và 5 Tốt ♟. Trắng (Người 1) đi trước.",
      "Các quân đi đúng luật cờ vua: Xe đi thẳng, Tượng đi chéo, Hậu cả hai, Mã đi chữ L, Vua đi 1 ô.",
      "Tốt đi thẳng 1 ô (KHÔNG đi đôi), ăn chéo. Không có nhập thành hay bắt tốt qua đường. Tốt tới hàng cuối tự PHONG thành Hậu.",
      "Chọn một quân của mình để xem các ô đi được (xanh = đi, đỏ = ăn quân), rồi bấm ô đích.",
      "Không được để Vua mình bị chiếu sau nước đi. Dồn Vua đối thủ vào thế CHIẾU BÍ (bị chiếu mà không thoát được) để thắng.",
      "Hết nước mà không bị chiếu là HÒA. Chơi chung máy, đấu máy hoặc online.",
    ],
    create,
  });
})();
