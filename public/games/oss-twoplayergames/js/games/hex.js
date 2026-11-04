/* Hex - cờ kết nối trên lưới lục giác — chơi chung máy & online
   Người chơi 1 (Đỏ) nối cạnh TRÊN với cạnh DƯỚI.
   Người chơi 2 (Xanh) nối cạnh TRÁI với cạnh PHẢI. Không bao giờ hòa. */
(function () {
  const NB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];

  function create(ctx) {
    const o = ctx.options || {};
    const N = [9, 11, 13].includes(Number(o.size)) ? Number(o.size) : 11;

    let board = Array.from({ length: N }, () => Array(N).fill(null));
    let turn = 0; // 0 = đỏ (trên-dưới), 1 = xanh (trái-phải)
    let over = false;
    let lastMove = null;
    let winSet = null;
    const moveStack = []; // ngăn xếp nước đi để hoàn tác

    const root = document.createElement("div");
    root.className = "hex-root";
    ctx.boardEl.appendChild(root);

    const header = document.createElement("div");
    header.className = "hex-header";
    root.appendChild(header);

    const wrap = document.createElement("div");
    wrap.className = "hex-wrap";
    const grid = document.createElement("div");
    grid.className = "hex-grid";
    grid.style.fontSize = (N <= 9 ? 30 : N <= 11 ? 25 : 21) + "px";
    wrap.appendChild(grid);
    root.appendChild(wrap);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "hex-row";
      rowEl.style.marginLeft = (r * 0.95) + "em";
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "hex-cell";
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        rowEl.appendChild(cell);
        cellEls[r][c] = cell;
      }
      grid.appendChild(rowEl);
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onClick(r, c) {
      if (!canPlay() || board[r][c] !== null) return;
      applyMove({ r, c }, false);
    }

    function applyMove(move, fromRemote) {
      const r = Number(move.r), c = Number(move.c);
      if (over || !inB(r, c) || board[r][c] !== null) return;
      const p = turn;
      board[r][c] = p;
      moveStack.push({ r, c, p, prev: lastMove });
      lastMove = [r, c];
      ctx.sound("place");

      if (!fromRemote) ctx.sendMove({ r, c });

      const path = checkWin(p);
      if (path) {
        over = true;
        winSet = new Set(path);
        render();
        ctx.incScore(p);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${p + 1} (${p === 0 ? "Đỏ" : "Xanh"}) đã nối thông — chiến thắng!`,
          `🎉 Player ${p + 1} (${p === 0 ? "Red" : "Blue"}) connected through — wins!`));
        ctx.setTurn(-1);
        return;
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // tập quân của p đang nối liền với cạnh NHÀ (để phát sáng "cầu nối")
    function linkedSet(p) {
      const seen = new Set();
      const queue = [];
      for (let i = 0; i < N; i++) {
        const r = p === 0 ? 0 : i;
        const c = p === 0 ? i : 0;
        if (board[r][c] === p) { seen.add(r * N + c); queue.push([r, c]); }
      }
      while (queue.length) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of NB) {
          const nr = r + dr, nc = c + dc;
          if (inB(nr, nc) && board[nr][nc] === p && !seen.has(nr * N + nc)) {
            seen.add(nr * N + nc);
            queue.push([nr, nc]);
          }
        }
      }
      return seen;
    }

    function checkWin(p) {
      const visited = new Set();
      const queue = [];
      const parent = new Map();
      const isEnd = (r, c) => (p === 0 ? r === N - 1 : c === N - 1);
      for (let i = 0; i < N; i++) {
        const r = p === 0 ? 0 : i;
        const c = p === 0 ? i : 0;
        if (board[r][c] === p) { queue.push([r, c]); visited.add(r * N + c); parent.set(r * N + c, null); }
      }
      while (queue.length) {
        const [r, c] = queue.shift();
        if (isEnd(r, c)) return reconstruct(parent, r * N + c);
        for (const [dr, dc] of NB) {
          const nr = r + dr, nc = c + dc;
          if (inB(nr, nc) && board[nr][nc] === p && !visited.has(nr * N + nc)) {
            visited.add(nr * N + nc);
            parent.set(nr * N + nc, r * N + c);
            queue.push([nr, nc]);
          }
        }
      }
      return null;
    }

    function reconstruct(parent, end) {
      const path = [];
      let cur = end;
      while (cur !== null && cur !== undefined) { path.push(cur); cur = parent.get(cur); }
      return path;
    }

    function render() {
      grid.classList.toggle("turn-p1", turn === 0 && !over);
      grid.classList.toggle("turn-p2", turn === 1 && !over);
      const linked0 = linkedSet(0);
      const linked1 = linkedSet(1);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const el = cellEls[r][c];
          let cls = "hex-cell";
          if (r === 0 || r === N - 1) cls += " edge-red";
          if (c === 0 || c === N - 1) cls += " edge-blue";
          const v = board[r][c];
          if (v === 0) cls += " p1";
          else if (v === 1) cls += " p2";
          const k = r * N + c;
          if (v === 0 && linked0.has(k)) cls += " linked";
          if (v === 1 && linked1.has(k)) cls += " linked";
          if (lastMove && lastMove[0] === r && lastMove[1] === c) cls += " last";
          if (winSet && winSet.has(k)) cls += " win";
          el.className = cls;
        }
      }
    }

    function renderHeader() {
      header.innerHTML = `
        <div class="hex-side p1 ${turn === 0 && !over ? "active" : ""}">${ctx.t("🔴 Đỏ · nối TRÊN ↕ DƯỚI", "🔴 Red · link TOP ↕ BOTTOM")}</div>
        <div class="hex-vs">${over ? "🏁" : "VS"}</div>
        <div class="hex-side p2 ${turn === 1 && !over ? "active" : ""}">${ctx.t("🔵 Xanh · nối TRÁI ↔ PHẢI", "🔵 Blue · link LEFT ↔ RIGHT")}</div>
      `;
    }

    function undo() {
      if (!moveStack.length) return false;
      const m = moveStack.pop();
      board[m.r][m.c] = null;
      lastMove = m.prev;
      winSet = null;
      over = false;
      turn = m.p;
      ctx.setTurn(turn);
      render();
      updateStatus();
      return true;
    }

    function updateStatus() {
      renderHeader();
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang suy nghĩ... (${turn === 0 ? "Đỏ" : "Xanh"} đi)`,
          `Opponent is thinking... (${turn === 0 ? "Red" : "Blue"} to move)`));
      } else {
        const who = turn === 0 ? ctx.t("Đỏ — nối trên ↕ dưới", "Red — link top ↕ bottom") : ctx.t("Xanh — nối trái ↔ phải", "Blue — link left ↔ right");
        ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}: ${who}. Bấm một ô trống để đặt quân.`,
          `Player ${turn + 1}'s turn: ${who}. Click an empty cell to place.`));
      }
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    renderHeader();
    render();
    ctx.setStatus(ctx.t("🔴 Đỏ nối cạnh TRÊN–DƯỚI. 🔵 Xanh nối cạnh TRÁI–PHẢI. Đỏ đi trước. Quân nối được về cạnh nhà sẽ phát sáng.",
      "🔴 Red links TOP–BOTTOM. 🔵 Blue links LEFT–RIGHT. Red goes first. Stones connected to your edge glow."));
    return { applyMove, undo };
  }

  window.GameRegistry.register({
    id: "hex",
    name: "Hex",
    emoji: "⬡",
    description: "Cờ kết nối trên lưới lục giác: tạo một đường quân nối hai cạnh đối diện của mình. Đơn giản mà cực sâu — không bao giờ hòa.",
    onlineReady: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 11,
        choices: [
          { value: 9, label: "9×9 (nhanh)" },
          { value: 11, label: "11×11 (chuẩn)" },
          { value: 13, label: "13×13 (lớn)" },
        ],
      },
    ],
    howTo: [
      "Bàn hình thoi gồm các ô lục giác. Người chơi 1 dùng quân 🔴 Đỏ, Người chơi 2 dùng quân 🔵 Xanh. Đỏ đi trước.",
      "Đến lượt, bấm vào một ô trống bất kỳ để đặt quân. Hai cạnh viền ĐỎ (trên & dưới) là đích của Đỏ; hai cạnh viền XANH (trái & phải) là đích của Xanh.",
      "Mục tiêu của Đỏ: nối liền cạnh TRÊN xuống cạnh DƯỚI bằng một chuỗi quân Đỏ kề nhau.",
      "Mục tiêu của Xanh: nối liền cạnh TRÁI sang cạnh PHẢI bằng chuỗi quân Xanh.",
      "Quân của bạn đã nối được tới cạnh nhà sẽ PHÁT SÁNG — nhìn vào đó để biết 'cây cầu' của mình đang vươn tới đâu, và lo chặn cầu của đối thủ.",
      "Hex không bao giờ hòa — luôn có đúng một người tạo được đường nối hoàn chỉnh. Chọn bàn nhỏ 9×9 để chơi nhanh, 13×13 để đấu trí sâu hơn.",
    ],
    create,
  });
})();
