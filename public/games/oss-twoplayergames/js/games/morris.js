/* Cờ Ba Quân (Three Men's Morris) — chơi chung máy & online
   Bàn 3x3. Đặt 3 quân, rồi di chuyển để xếp 3 quân thẳng hàng. */
(function () {
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const ADJ = {
    0: [1, 3, 4], 1: [0, 2, 4], 2: [1, 4, 5],
    3: [0, 4, 6], 4: [0, 1, 2, 3, 5, 6, 7, 8], 5: [2, 4, 8],
    6: [3, 4, 7], 7: [4, 6, 8], 8: [4, 5, 7],
  };
  const DRAW_LIMIT = 40; // số nước ở giai đoạn di chuyển không thắng -> hòa

  function create(ctx) {
    const o = ctx.options || {};
    const FREE = o.move === "free"; // di chuyển tới điểm trống bất kỳ

    let board = Array(9).fill(null);
    let turn = 0;
    let placed = [0, 0];
    let phase = "place";
    let selected = null;
    let over = false;
    let lastMove = null;  // {from, to} | {to}
    let hover = null;
    let moveCount = 0;
    const history = [];   // ngăn xếp trạng thái để hoàn tác

    const root = document.createElement("div");
    root.className = "mor-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "mor-hud";
    root.appendChild(hud);

    const wrap = document.createElement("div");
    wrap.className = "mor-wrap";
    root.appendChild(wrap);

    const grid = document.createElement("div");
    grid.className = "mor-board";
    wrap.appendChild(grid);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "mor-lines");
    svg.setAttribute("viewBox", "0 0 100 100");
    const segs = [
      [0, 0, 100, 0], [0, 50, 100, 50], [0, 100, 100, 100],
      [0, 0, 0, 100], [50, 0, 50, 100], [100, 0, 100, 100],
      [0, 0, 100, 100], [100, 0, 0, 100],
    ];
    segs.forEach(([x1, y1, x2, y2]) => {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", x1); ln.setAttribute("y1", y1);
      ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
      ln.setAttribute("stroke", "rgba(120,80,40,0.55)");
      ln.setAttribute("stroke-width", "2.5");
      ln.setAttribute("stroke-linecap", "round");
      svg.appendChild(ln);
    });
    grid.appendChild(svg);

    const spotEls = [];
    for (let i = 0; i < 9; i++) {
      const spot = document.createElement("div");
      spot.className = "mor-spot";
      spot.style.left = `${(i % 3) * 50}%`;
      spot.style.top = `${Math.floor(i / 3) * 50}%`;
      const ii = i;
      spot.addEventListener("click", () => onClick(ii));
      spot.addEventListener("mouseenter", () => { hover = ii; render(); });
      spot.addEventListener("mouseleave", () => { if (hover === ii) { hover = null; render(); } });
      grid.appendChild(spot);
      spotEls.push(spot);
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function canMoveTo(from, to) {
      if (board[to] !== null) return false;
      return FREE ? true : ADJ[from].includes(to);
    }

    function onClick(i) {
      if (!canPlay()) return;
      if (phase === "place") {
        if (board[i] !== null) return;
        applyMove({ type: "place", to: i }, false);
        return;
      }
      if (selected === null) {
        if (board[i] === turn) { selected = i; render(); }
        return;
      }
      if (i === selected) { selected = null; render(); return; }
      if (board[i] === turn) { selected = i; render(); return; }
      if (canMoveTo(selected, i)) applyMove({ type: "move", from: selected, to: i }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const snap = { board: board.slice(), turn, placed: placed.slice(), phase, moveCount, lastMove };
      if (move.type === "place") {
        if (board[move.to] !== null || phase !== "place") return;
        board[move.to] = turn;
        placed[turn]++;
        lastMove = { to: move.to };
      } else {
        if (board[move.from] !== turn || !canMoveTo(move.from, move.to)) return;
        board[move.from] = null;
        board[move.to] = turn;
        lastMove = { from: move.from, to: move.to };
        moveCount++;
      }
      history.push(snap);
      if (history.length > 100) history.shift();
      selected = null;
      hover = null;

      if (!fromRemote) ctx.sendMove(move);
      ctx.sound(move.type === "move" ? "select" : "place");

      if (hasLine(turn)) {
        over = true;
        highlight(turn);
        ctx.incScore(turn);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${turn + 1} xếp 3 quân thẳng hàng — chiến thắng!`,
          `🎉 Player ${turn + 1} lined up 3 — wins!`));
        render();
        return;
      }

      if (phase === "move" && moveCount >= DRAW_LIMIT) {
        over = true;
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🤝 Hòa! Đã ${DRAW_LIMIT} nước di chuyển mà chưa ai xếp được hàng.`,
          `🤝 Draw! ${DRAW_LIMIT} moves with no line formed.`));
        render();
        return;
      }

      if (phase === "place" && placed[0] === 3 && placed[1] === 3) phase = "move";

      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function hasLine(p) { return LINES.some((l) => l.every((i) => board[i] === p)); }
    function undo() {
      if (!history.length) return false;
      const s = history.pop();
      board = s.board.slice();
      turn = s.turn;
      placed = s.placed.slice();
      phase = s.phase;
      moveCount = s.moveCount;
      lastMove = s.lastMove;
      selected = null; hover = null; over = false;
      spotEls.forEach((sp) => sp.classList.remove("win"));
      ctx.setTurn(turn);
      render();
      updateStatus();
      return true;
    }
    function highlight(p) {
      const line = LINES.find((l) => l.every((i) => board[i] === p));
      if (line) line.forEach((i) => spotEls[i].classList.add("win"));
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const phaseTxt = over ? ctx.t("Kết thúc", "Finished") : phase === "place" ? ctx.t("📥 Đặt quân", "📥 Place") : ctx.t("🔀 Di chuyển", "🔀 Move");
      const note = (n) => {
        if (over) return "";
        if (phase === "place") return ctx.t(`còn đặt ${3 - placed[n]}`, `${3 - placed[n]} to place`);
        return "";
      };
      hud.innerHTML = `
        <div class="mor-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🔴 ${ctx.t("Người chơi 1", "Player 1")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span><small>${note(0)}</small>
        </div>
        <div class="mor-phase">${phaseTxt}${phase === "move" && !over ? `<i>${DRAW_LIMIT - moveCount} ${ctx.t("nước tới hòa", "moves to draw")}</i>` : ""}</div>
        <div class="mor-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🔵 ${ctx.t("Người chơi 2", "Player 2")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span><small>${note(1)}</small>
        </div>
      `;
    }

    function render() {
      renderHud();
      const movable = (phase === "move" && selected !== null)
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => canMoveTo(selected, i)) : [];
      const moveSet = new Set(movable);
      const act = canPlay();
      for (let i = 0; i < 9; i++) {
        const spot = spotEls[i];
        spot.className = "mor-spot";
        spot.style.left = `${(i % 3) * 50}%`;
        spot.style.top = `${Math.floor(i / 3) * 50}%`;
        spot.innerHTML = "";
        if (board[i] !== null) {
          const m = document.createElement("div");
          m.className = "mor-piece " + (board[i] === 0 ? "p1" : "p2");
          spot.appendChild(m);
        } else if (act && hover === i && (
          (phase === "place" && placed[turn] < 3) ||
          (phase === "move" && selected !== null && moveSet.has(i))
        )) {
          const g = document.createElement("div");
          g.className = "mor-piece ghost " + (turn === 0 ? "p1" : "p2");
          spot.appendChild(g);
        }
        if (selected === i) spot.classList.add("sel");
        if (moveSet.has(i)) spot.classList.add("hint");
        if (lastMove && (lastMove.to === i || lastMove.from === i)) spot.classList.add("last");
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      if (phase === "place") {
        ctx.setStatus(ctx.t(`Giai đoạn ĐẶT QUÂN — Người chơi ${turn + 1} còn ${3 - placed[turn]} quân để đặt.`,
          `PLACING phase — Player ${turn + 1} has ${3 - placed[turn]} pieces left to place.`));
      } else {
        ctx.setStatus(ctx.t(`Giai đoạn DI CHUYỂN — Người chơi ${turn + 1}: chọn quân của mình rồi đi tới điểm ${FREE ? "trống bất kỳ" : "kề trống"}.`,
          `MOVING phase — Player ${turn + 1}: pick your piece then move to ${FREE ? "any empty point" : "an adjacent empty point"}.`));
      }
    }

    // ----- AI: minimax alpha-beta -----
    function hasLineB(b, p) { return LINES.some((l) => l.every((i) => b[i] === p)); }
    function genMovesSim(b, player, ph) {
      const out = [];
      if (ph === "place") { for (let i = 0; i < 9; i++) if (b[i] === null) out.push({ type: "place", to: i }); }
      else {
        for (let f = 0; f < 9; f++) {
          if (b[f] !== player) continue;
          for (let t = 0; t < 9; t++) if (b[t] === null && (FREE || ADJ[f].includes(t))) out.push({ type: "move", from: f, to: t });
        }
      }
      return out;
    }
    function applySim(b, player, ph, placedArr, mv) {
      const nb = b.slice(); const np = placedArr.slice(); let nph = ph;
      if (mv.type === "place") { nb[mv.to] = player; np[player]++; if (np[0] === 3 && np[1] === 3) nph = "move"; }
      else { nb[mv.from] = null; nb[mv.to] = player; }
      return { b: nb, placed: np, phase: nph };
    }
    function evalB(b, me) {
      let s = (b[4] === me ? 3 : b[4] === 1 - me ? -3 : 0);
      for (const l of LINES) {
        let mine = 0, opp = 0;
        for (const i of l) { if (b[i] === me) mine++; else if (b[i] === 1 - me) opp++; }
        if (mine && !opp) s += mine * mine;
        if (opp && !mine) s -= opp * opp;
      }
      return s;
    }
    function search(b, player, ph, placedArr, me, depth, alpha, beta) {
      if (hasLineB(b, me)) return 1000 - (8 - depth);
      if (hasLineB(b, 1 - me)) return -(1000 - (8 - depth));
      if (depth === 0) return evalB(b, me);
      const moves = genMovesSim(b, player, ph);
      if (!moves.length) return evalB(b, me);
      if (player === me) {
        let v = -Infinity;
        for (const mv of moves) { const s = applySim(b, player, ph, placedArr, mv); v = Math.max(v, search(s.b, 1 - player, s.phase, s.placed, me, depth - 1, alpha, beta)); alpha = Math.max(alpha, v); if (alpha >= beta) break; }
        return v;
      }
      let v = Infinity;
      for (const mv of moves) { const s = applySim(b, player, ph, placedArr, mv); v = Math.min(v, search(s.b, 1 - player, s.phase, s.placed, me, depth - 1, alpha, beta)); beta = Math.min(beta, v); if (alpha >= beta) break; }
      return v;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const moves = genMovesSim(board, me, phase);
      if (!moves.length) return null;
      const randChance = level === "easy" ? 0.6 : level === "normal" ? 0.2 : 0;
      if (Math.random() < randChance) return moves[Math.floor(Math.random() * moves.length)];
      // thắng ngay
      for (const mv of moves) { const s = applySim(board, me, phase, placed, mv); if (hasLineB(s.b, me)) return mv; }
      const depth = level === "easy" ? 2 : level === "hard" ? 6 : 4;
      let best = -Infinity, pick = moves[0];
      for (const mv of moves) {
        const s = applySim(board, me, phase, placed, mv);
        const sc = search(s.b, 1 - me, s.phase, s.placed, me, depth - 1, -Infinity, Infinity);
        if (sc > best) { best = sc; pick = mv; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "morris",
    name: "Cờ Ba Quân (Morris)",
    emoji: "⭕",
    description: "Đặt 3 quân rồi di chuyển để xếp thành hàng. Caro phiên bản có di chuyển, thêm chế độ đi tự do.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "move", label: "Cách di chuyển", default: "adjacent",
        choices: [
          { value: "adjacent", label: "Đi sang điểm kề (chuẩn)" },
          { value: "free", label: "Đi tới điểm trống bất kỳ (dễ)" },
        ],
      },
    ],
    howTo: [
      "Bàn có 9 điểm nối với nhau. Mỗi người có 3 quân (🔴 Người chơi 1, 🔵 Người chơi 2). Đỏ đi trước.",
      "Giai đoạn 1 (đặt quân): luân phiên đặt 3 quân lên các điểm trống (di chuột để xem trước vị trí).",
      "Giai đoạn 2 (di chuyển): bấm chọn một quân của bạn rồi bấm điểm sáng để di chuyển. Mặc định chỉ đi sang điểm KỀ; bật 'Đi tới điểm trống bất kỳ' ở tùy chọn để chơi thoáng hơn.",
      "Mục tiêu: xếp 3 quân của mình thẳng hàng (ngang, dọc, hoặc chéo qua tâm).",
      "Bảng trên cho biết giai đoạn, lượt và số quân còn phải đặt. Nếu qua nhiều nước di chuyển mà không ai thắng thì xử HÒA — hãy vừa tấn công vừa chặn đối thủ.",
    ],
    create,
  });
})();
