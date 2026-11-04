/* Game of the Amazons (Cờ Nữ Hoàng Amazon) — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn NxN. Mỗi bên có 4 quân Hậu (Amazon) đi như quân Hậu cờ vua (8 hướng,
   xa tùy ý, không nhảy). Mỗi lượt gồm 2 phần BẮT BUỘC:
     1) Di chuyển 1 Hậu của mình theo đường thẳng/chéo tới ô trống.
     2) Từ ô MỚI, "bắn" một MŨI TÊN theo đường thẳng/chéo tới ô trống — ô đó
        bị chặn vĩnh viễn (không ai đi qua hay đứng lên được nữa).
   Bàn dần bị bịt kín. Ai tới lượt mà KHÔNG còn nước đi nào thì THUA.
   P1 = Trắng, P2 = Đen. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  function create(ctx) {
    const o = ctx.options || {};
    const N = Number(o.size) === 8 ? 8 : 10;

    // grid[r][c]: null | 0 (hậu P1) | 1 (hậu P2) | "x" (mũi tên/chặn)
    let grid = Array.from({ length: N }, () => Array(N).fill(null));
    // vị trí hậu khởi đầu (chuẩn 10x10; co lại cho 8x8)
    function setup() {
      if (N === 10) {
        const w = [[9, 3], [9, 6], [6, 0], [6, 9]];
        const b = [[0, 3], [0, 6], [3, 0], [3, 9]];
        w.forEach(([r, c]) => grid[r][c] = 0);
        b.forEach(([r, c]) => grid[r][c] = 1);
      } else {
        const w = [[7, 2], [7, 5], [5, 0], [5, 7]];
        const b = [[0, 2], [0, 5], [2, 0], [2, 7]];
        w.forEach(([r, c]) => grid[r][c] = 0);
        b.forEach(([r, c]) => grid[r][c] = 1);
      }
    }
    setup();

    let turn = 0;
    let over = false;
    let phase = "move";     // "move" -> chọn & di chuyển hậu; "shoot" -> bắn tên
    let selected = null;    // [r,c] hậu đang chọn
    let movedTo = null;     // [r,c] hậu vừa di chuyển (đang chờ bắn)
    let movedFrom = null;
    let lastMove = null;    // {from,to,arrow}
    let winner = -1;

    const root = document.createElement("div");
    root.className = "amz-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "amz-hud";
    root.appendChild(hud);

    const wrap = document.createElement("div");
    wrap.className = "amz-wrap";
    const board = document.createElement("div");
    board.className = "amz-board";
    board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    wrap.appendChild(board);
    root.appendChild(wrap);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "amz-cell " + ((r + c) % 2 ? "d" : "l");
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        board.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function rayTargets(G, r, c) {
      const out = [];
      for (const [dr, dc] of DIRS) {
        let nr = r + dr, nc = c + dc;
        while (inB(nr, nc) && G[nr][nc] === null) { out.push([nr, nc]); nr += dr; nc += dc; }
      }
      return out;
    }
    function queenPositions(G, p) {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G[r][c] === p) out.push([r, c]);
      return out;
    }
    function hasAnyMove(G, p) {
      for (const [r, c] of queenPositions(G, p)) if (rayTargets(G, r, c).length) return true;
      return false;
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay()) return;
      if (phase === "move") {
        if (grid[r][c] === turn) { selected = [r, c]; render(); return; }
        if (selected) {
          const ms = rayTargets(grid, selected[0], selected[1]);
          if (ms.some(([mr, mc]) => mr === r && mc === c)) {
            // di chuyển hậu (chưa gửi — chờ bắn tên xong mới gửi trọn nước)
            movedFrom = selected.slice();
            grid[selected[0]][selected[1]] = null;
            grid[r][c] = turn;
            movedTo = [r, c];
            selected = null;
            phase = "shoot";
            ctx.sound("place");
            render();
            updateStatus();
          }
        }
        return;
      }
      // phase shoot: bắn tên từ movedTo
      // bấm lại chính ô hậu vừa dời -> HOÀN TÁC nước đi để chọn lại
      if (movedTo && r === movedTo[0] && c === movedTo[1]) {
        grid[movedTo[0]][movedTo[1]] = null;
        grid[movedFrom[0]][movedFrom[1]] = turn;
        selected = movedFrom.slice();
        movedTo = null; movedFrom = null;
        phase = "move";
        render();
        updateStatus();
        return;
      }
      const ms = rayTargets(grid, movedTo[0], movedTo[1]);
      if (ms.some(([mr, mc]) => mr === r && mc === c)) {
        finalizeMove([r, c], false);
      }
    }

    function finalizeMove(arrow, fromRemote) {
      grid[arrow[0]][arrow[1]] = "x";
      lastMove = { from: movedFrom.slice(), to: movedTo.slice(), arrow: arrow.slice() };
      if (!fromRemote) ctx.sendMove({ from: movedFrom.slice(), to: movedTo.slice(), arrow: arrow.slice() });
      ctx.sound("capture");
      const justMoved = turn;
      movedTo = null; movedFrom = null;
      phase = "move";
      selected = null;

      const next = 1 - justMoved;
      if (!hasAnyMove(grid, next)) {
        over = true;
        winner = justMoved;
        render();
        ctx.incScore(justMoved);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${justMoved + 1} thắng — đối thủ hết nước đi!`,
          `🎉 Player ${justMoved + 1} wins — opponent has no moves left!`));
        return;
      }
      turn = next;
      render();
      ctx.setTurn(turn);
      updateStatus();
    }

    // áp dụng trọn một nước từ remote (đi + bắn)
    function applyMove(move, fromRemote) {
      if (over) return;
      if (!fromRemote) {
        // local đi qua onClick/finalizeMove; nhánh này chủ yếu cho remote/replay
      }
      const [fr, fc] = move.from, [tr, tc] = move.to, [ar, ac] = move.arrow;
      grid[fr][fc] = null;
      grid[tr][tc] = turn;
      movedFrom = [fr, fc]; movedTo = [tr, tc];
      phase = "shoot";
      finalizeMove([ar, ac], true);
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const mob = (p) => queenPositions(grid, p).reduce((s, [r, c]) => s + rayTargets(grid, r, c).length, 0);
      const step = over ? "🏁"
        : (phase === "move"
          ? ctx.t("Bước 1/2: DI CHUYỂN ♛", "Step 1/2: MOVE ♛")
          : ctx.t("Bước 2/2: BẮN TÊN 🏹", "Step 2/2: SHOOT 🏹"));
      hud.innerHTML = `
        <div class="amz-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>⚪ ${ctx.t("Trắng", "White")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${ctx.t("nước", "moves")}: ${mob(0)}</b>
        </div>
        <div class="amz-mid">${step}</div>
        <div class="amz-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>⚫ ${ctx.t("Đen", "Black")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${ctx.t("nước", "moves")}: ${mob(1)}</b>
        </div>`;
    }

    function render() {
      renderHud();
      const hintSet = new Set();
      if (phase === "move" && selected) {
        rayTargets(grid, selected[0], selected[1]).forEach(([r, c]) => hintSet.add(r * N + c));
      } else if (phase === "shoot" && movedTo) {
        rayTargets(grid, movedTo[0], movedTo[1]).forEach(([r, c]) => hintSet.add(r * N + c));
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.classList.remove("hint", "sel", "lastfrom", "lastto", "lastarrow", "movedto");
          const v = grid[r][c];
          if (v === 0 || v === 1) {
            const q = document.createElement("div");
            q.className = "amz-queen " + (v === 0 ? "p1" : "p2");
            q.textContent = "♛";
            if (selected && selected[0] === r && selected[1] === c) q.classList.add("sel");
            if (movedTo && movedTo[0] === r && movedTo[1] === c) cell.classList.add("movedto");
            if (over && v === winner) q.classList.add("win");
            cell.appendChild(q);
          } else if (v === "x") {
            const a = document.createElement("div");
            a.className = "amz-arrow";
            cell.appendChild(a);
          }
          if (lastMove) {
            if (lastMove.from[0] === r && lastMove.from[1] === c) cell.classList.add("lastfrom");
            if (lastMove.to[0] === r && lastMove.to[1] === c) cell.classList.add("lastto");
            if (lastMove.arrow[0] === r && lastMove.arrow[1] === c) cell.classList.add("lastarrow");
          }
          if (hintSet.has(r * N + c)) cell.classList.add(phase === "shoot" ? "hint shoot" : "hint");
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      if (phase === "move") {
        if (selected) {
          ctx.setStatus(ctx.t(
            "Bước 1/2 — bấm một ô XANH để di chuyển Hậu tới đó (hoặc bấm Hậu khác để đổi).",
            "Step 1/2 — click a GREEN cell to move the Queen there (or click another Queen to switch)."));
        } else {
          ctx.setStatus(ctx.t(
            `Người chơi ${turn + 1} — Bước 1/2: bấm một Hậu ♛ của bạn để chọn (đi như hậu cờ vua: 8 hướng).`,
            `Player ${turn + 1} — Step 1/2: click one of your Queens ♛ to select (moves like a chess queen).`));
        }
      } else {
        ctx.setStatus(ctx.t(
          "Bước 2/2 — bấm một ô CAM để BẮN mũi tên 🏹 (chặn ô đó vĩnh viễn). Bấm lại Hậu vừa đi để chọn lại.",
          "Step 2/2 — click an ORANGE cell to SHOOT an arrow 🏹 (blocks it forever). Click the moved Queen again to redo."));
      }
    }

    // ---------- AI ----------
    function mobility(G, p) {
      let m = 0;
      for (const [r, c] of queenPositions(G, p)) m += rayTargets(G, r, c).length;
      return m;
    }
    // AI 2 giai đoạn (nhanh, không clone hàng nghìn lần):
    //  1) chọn nước DI CHUYỂN hậu tốt nhất theo độ cơ động (mutate tại chỗ).
    //  2) với vài nước đi tốt nhất, chọn MŨI TÊN làm giảm cơ động đối thủ nhiều nhất.
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const opp = 1 - me;
      const G = grid; // mutate tại chỗ rồi hoàn lại

      // --- giai đoạn 1: liệt kê & chấm điểm các nước đi hậu ---
      const queens = queenPositions(G, me);
      const moveCands = [];
      for (const [qr, qc] of queens) {
        for (const [mr, mc] of rayTargets(G, qr, qc)) {
          G[qr][qc] = null; G[mr][mc] = me;
          if (!hasAnyMove(G, opp)) { const a = bestArrowQuick2(G, mr, mc, me); G[mr][mc] = null; G[qr][qc] = me; return { from: [qr, qc], to: [mr, mc], arrow: a }; }
          const score = mobility(G, me) - mobility(G, opp);
          G[mr][mc] = null; G[qr][qc] = me;
          moveCands.push({ from: [qr, qc], to: [mr, mc], score });
        }
      }
      if (!moveCands.length) return null;
      moveCands.sort((a, b) => b.score - a.score);
      if (level === "easy" && Math.random() < 0.5) {
        const m = moveCands[Math.floor(Math.random() * Math.min(moveCands.length, 8))];
        return { from: m.from, to: m.to, arrow: bestArrowQuick(G, m.from, m.to, me) };
      }
      const topK = level === "hard" ? 14 : level === "normal" ? 7 : 3;

      // --- giai đoạn 2: với top-K nước đi, tìm mũi tên tốt nhất ---
      let best = -Infinity, pick = null;
      for (let i = 0; i < Math.min(topK, moveCands.length); i++) {
        const m = moveCands[i];
        const [qr, qc] = m.from, [mr, mc] = m.to;
        G[qr][qc] = null; G[mr][mc] = me;
        for (const [ar, ac] of rayTargets(G, mr, mc)) {
          G[ar][ac] = "x";
          if (!hasAnyMove(G, opp)) { G[ar][ac] = null; G[mr][mc] = null; G[qr][qc] = me; return { from: [qr, qc], to: [mr, mc], arrow: [ar, ac] }; }
          const sc = (mobility(G, me) - mobility(G, opp)) + Math.random() * 0.3;
          G[ar][ac] = null;
          if (sc > best) { best = sc; pick = { from: [qr, qc], to: [mr, mc], arrow: [ar, ac] }; }
        }
        G[mr][mc] = null; G[qr][qc] = me;
      }
      if (pick) return pick;
      const m0 = moveCands[0];
      return { from: m0.from, to: m0.to, arrow: bestArrowQuick(G, m0.from, m0.to, me) };
    }
    // chọn nhanh 1 mũi tên tốt nhất khi hậu ĐÃ ở (mr,mc) trên G (không hoàn lại G).
    function bestArrowQuick2(G, mr, mc, me) {
      const opp = 1 - me;
      const shots = rayTargets(G, mr, mc);
      let best = -Infinity, pick = shots[0] || [mr, mc];
      for (const [ar, ac] of shots) {
        G[ar][ac] = "x";
        const sc = -mobility(G, opp);
        G[ar][ac] = null;
        if (sc > best) { best = sc; pick = [ar, ac]; }
      }
      return pick;
    }
    // chọn nhanh 1 mũi tên tốt cho nước đi from->to: mutate G tạm rồi HOÀN LẠI.
    function bestArrowQuick(G, from, to, me) {
      const [qr, qc] = from, [mr, mc] = to;
      G[qr][qc] = null; G[mr][mc] = me;
      const pick = bestArrowQuick2(G, mr, mc, me);
      G[mr][mc] = null; G[qr][qc] = me;
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Trắng)", "Player 1 (White)"), ctx.t("Người chơi 2 (Đen)", "Player 2 (Black)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "amazons",
    name: "Cờ Amazon (Amazons)",
    emoji: "♛",
    description: "Cờ vây lãnh thổ: 4 Hậu mỗi bên đi như quân Hậu rồi bắn một mũi tên chặn ô vĩnh viễn. Bàn dần bị bịt kín — ai hết nước đi trước thì thua.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Cỡ bàn", default: "10",
        choices: [
          { value: "8", label: "8×8 (nhanh)" },
          { value: "10", label: "10×10 (chuẩn)" },
        ],
      },
    ],
    howTo: [
      "MỖI LƯỢT CÓ 2 BƯỚC bắt buộc: (1) DI CHUYỂN một Hậu ♛, rồi (2) BẮN một mũi tên 🏹 từ ô Hậu vừa tới. Phải làm đủ cả hai mới hết lượt.",
      "Mỗi bên có 4 Hậu ♛ (Người chơi 1 Trắng, Người chơi 2 Đen). Hậu đi như quân Hậu cờ vua: thẳng hoặc chéo, xa tùy ý, không nhảy qua quân/mũi tên.",
      "Cách chơi: bấm một Hậu của mình → các ô đi được sáng XANH, bấm ô xanh để di chuyển. Sau đó các ô bắn được sáng CAM, bấm ô cam để bắn tên. (Đổi ý? Bấm lại Hậu vừa đi để chọn lại.)",
      "Ô bị mũi tên bắn trúng bị CHẶN VĨNH VIỄN — không ai đi qua hay đứng lên được nữa. Bàn cứ thế hẹp dần sau mỗi lượt.",
      "THUA nếu tới lượt mà bạn không còn nước đi nào (mọi Hậu đều bị vây kín). Vì vậy hãy giành và giữ không gian rộng cho mình.",
      "Chiến thuật: dùng mũi tên để vây nhốt Hậu địch và chia bàn thành các vùng mà bạn có nhiều ô trống hơn — cuối ván ai còn nước đi là người thắng.",
    ],
    create,
  });
})();
