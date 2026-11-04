/* Reversi / Othello (bàn 8x8) — hỗ trợ chơi chung máy & online
   Phiên bản thân thiện người mới: HUD đếm quân, gợi ý số quân sẽ lật trên mỗi ô,
   xem trước khi rê chuột, hiệu ứng lật quân, highlight nước đi cuối. */
(function () {
  const N = 8;
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  function create(ctx) {
    const o = ctx.options || {};
    const HINTS = o.hints !== "off"; // mặc định bật gợi ý

    let board = Array.from({ length: N }, () => Array(N).fill(null));
    board[3][3] = 1; board[3][4] = 0;
    board[4][3] = 0; board[4][4] = 1;
    let turn = 0; // 0 = đen đi trước
    let over = false;
    let lastMove = null;       // [r,c] vừa đặt
    let lastFlips = [];        // các ô vừa bị lật
    const history = [];        // ngăn xếp trạng thái để hoàn tác

    const root = document.createElement("div");
    root.className = "rv-root";
    ctx.boardEl.appendChild(root);

    // ----- HUD đếm quân + chỉ báo lượt -----
    const hud = document.createElement("div");
    hud.className = "rv-hud";
    const sideP1 = document.createElement("div");
    sideP1.className = "rv-side p1";
    sideP1.innerHTML = '<span class="rv-chip p1"></span><span class="rv-count" id="rvc1">2</span><span class="rv-name">' + ctx.t("Đen", "Black") + '</span>';
    const sideP2 = document.createElement("div");
    sideP2.className = "rv-side p2";
    sideP2.innerHTML = '<span class="rv-name">' + ctx.t("Trắng", "White") + '</span><span class="rv-count" id="rvc2">2</span><span class="rv-chip p2"></span>';
    const turnBadge = document.createElement("div");
    turnBadge.className = "rv-turnbadge";
    hud.appendChild(sideP1);
    hud.appendChild(turnBadge);
    hud.appendChild(sideP2);
    root.appendChild(hud);

    // thanh tỉ lệ quân
    const bar = document.createElement("div");
    bar.className = "rv-bar";
    const barFill = document.createElement("div");
    barFill.className = "rv-bar-fill";
    bar.appendChild(barFill);
    root.appendChild(bar);

    const boardEl = document.createElement("div");
    boardEl.className = "rv-board";
    root.appendChild(boardEl);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "rv-cell";
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        cell.addEventListener("mouseenter", () => onHover(rr, cc));
        cell.addEventListener("mouseleave", () => clearPreview());
        boardEl.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inBounds(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    function flipsFor(r, c, p) {
      if (board[r][c] !== null) return [];
      const opp = 1 - p;
      const flips = [];
      for (const [dr, dc] of DIRS) {
        const line = [];
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc) && board[nr][nc] === opp) { line.push([nr, nc]); nr += dr; nc += dc; }
        if (line.length && inBounds(nr, nc) && board[nr][nc] === p) flips.push(...line);
      }
      return flips;
    }

    function legalMoves(p) {
      const moves = [];
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (flipsFor(r, c, p).length) moves.push([r, c]);
      return moves;
    }

    function myTurnNow() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function onHover(r, c) {
      if (!HINTS || !myTurnNow()) return;
      const flips = flipsFor(r, c, turn);
      if (!flips.length) return;
      // hiển thị quân ma tại ô sẽ đặt
      cellEls[r][c].classList.add("preview");
      const ghost = document.createElement("div");
      ghost.className = "rv-disc ghost";
      ghost.innerHTML = `<div class="rv-coin"><div class="rv-face front ${turn === 0 ? "p1" : "p2"}"></div></div>`;
      cellEls[r][c].appendChild(ghost);
      // làm nổi các quân sẽ bị lật
      flips.forEach(([fr, fc]) => cellEls[fr][fc].classList.add("willflip"));
    }

    function clearPreview() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          if (cell.classList.contains("preview")) {
            cell.classList.remove("preview");
            const g = cell.querySelector(".ghost");
            if (g) g.remove();
          }
          cell.classList.remove("willflip");
        }
      }
    }

    function onClick(r, c) {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      if (!flipsFor(r, c, turn).length) return;
      clearPreview();
      applyMove({ r, c }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const { r, c } = move;
      const flips = flipsFor(r, c, turn);
      if (!flips.length) return;
      history.push({
        board: board.map((row) => row.slice()),
        turn, over, lastMove, lastFlips: lastFlips.slice(),
      });
      if (history.length > 100) history.shift();
      board[r][c] = turn;
      flips.forEach(([fr, fc]) => { board[fr][fc] = turn; });
      lastMove = [r, c];
      lastFlips = flips;
      ctx.sound(flips.length >= 3 ? "capture" : "place");

      if (!fromRemote) ctx.sendMove({ r, c });

      render();
      nextTurn();
    }

    function nextTurn() {
      const other = 1 - turn;
      if (legalMoves(other).length) {
        turn = other;
      } else if (legalMoves(turn).length) {
        ctx.setTurn(turn);
        updateHud(ctx.t(`⏭️ ${pname(other)} không có nước đi hợp lệ — bị mất lượt!`,
          `⏭️ ${pname(other)} has no legal move — turn skipped!`));
        render();
        return;
      } else {
        return endGame();
      }
      ctx.setTurn(turn);
      updateHud();
      render();
    }

    function pname(p) { return p === 0 ? ctx.t("Đen", "Black") : ctx.t("Trắng", "White"); }

    function count(p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (board[r][c] === p) n++;
      return n;
    }

    function updateHud(msg) {
      const b = count(0), w = count(1);
      const c1 = document.querySelector("#rvc1"), c2 = document.querySelector("#rvc2");
      if (c1) c1.textContent = b;
      if (c2) c2.textContent = w;
      const total = b + w;
      barFill.style.width = total ? `${(b / total) * 100}%` : "50%";
      sideP1.classList.toggle("active", !over && turn === 0);
      sideP2.classList.toggle("active", !over && turn === 1);
      if (over) {
        turnBadge.textContent = "Kết thúc";
      } else {
        const chip = turn === 0 ? "⚫" : "⚪";
        turnBadge.innerHTML = ctx.t("Lượt:", "Turn:") + ` <b>${chip} ${pname(turn)}</b>`;
      }
      if (msg) ctx.setStatus(msg);
      else ctx.setStatus(ctx.t(
        `⚫ Đen: ${b}  —  ⚪ Trắng: ${w}. ${over ? "" : "Bấm ô có số để đặt quân — số là số quân bạn sẽ lật được."}`,
        `⚫ Black: ${b}  —  ⚪ White: ${w}. ${over ? "" : "Click a numbered cell to place — the number is how many discs you'll flip."}`));
    }

    function endGame() {
      over = true;
      const b = count(0), w = count(1);
      ctx.setTurn(-1);
      updateHud();
      if (b > w) { ctx.incScore(0); ctx.setStatus(ctx.t(`🎉 Người chơi 1 (Đen) thắng ${b}–${w}!`, `🎉 Player 1 (Black) wins ${b}–${w}!`)); }
      else if (w > b) { ctx.incScore(1); ctx.setStatus(ctx.t(`🎉 Người chơi 2 (Trắng) thắng ${w}–${b}!`, `🎉 Player 2 (White) wins ${w}–${b}!`)); }
      else ctx.setStatus(ctx.t(`🤝 Hòa ${b}–${w}!`, `🤝 Draw ${b}–${w}!`));
      render();
    }

    function render() {
      const showHints = HINTS && myTurnNow();
      const legal = showHints ? legalMoves(turn) : [];
      const flipCount = new Map(); // r*N+c -> số quân lật
      legal.forEach(([r, c]) => flipCount.set(r * N + c, flipsFor(r, c, turn).length));
      const lastFlipSet = new Set(lastFlips.map(([r, c]) => r * N + c));

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.className = "rv-cell";
          const v = board[r][c];
          if (v !== null) {
            const isFlip = lastFlipSet.has(r * N + c);
            const isPlaced = lastMove && lastMove[0] === r && lastMove[1] === c;
            const back = isFlip ? 1 - v : v;
            const disc = document.createElement("div");
            disc.className = "rv-disc" + (isPlaced ? " placed" : "");
            const coin = document.createElement("div");
            coin.className = "rv-coin" + (isFlip ? " flip" : "");
            if (isFlip && lastMove) {
              const d = Math.max(Math.abs(r - lastMove[0]), Math.abs(c - lastMove[1]));
              coin.style.animationDelay = Math.min(d * 0.05, 0.4) + "s";
            }
            coin.innerHTML =
              `<div class="rv-face front ${v === 0 ? "p1" : "p2"}"></div>` +
              `<div class="rv-face back ${back === 0 ? "p1" : "p2"}"></div>`;
            disc.appendChild(coin);
            cell.appendChild(disc);
          } else if (flipCount.has(r * N + c)) {
            cell.classList.add("legal");
            const tag = document.createElement("span");
            tag.className = "rv-hint";
            tag.textContent = flipCount.get(r * N + c);
            cell.appendChild(tag);
          }
          if (lastMove && lastMove[0] === r && lastMove[1] === c) cell.classList.add("lastmove");
        }
      }
    }

    function posWeight(r, c) {
      const edgeR = (r === 0 || r === N - 1);
      const edgeC = (c === 0 || c === N - 1);
      if (edgeR && edgeC) return 100;            // góc
      if ((r === 1 || r === N - 2) && (c === 1 || c === N - 2)) return -30; // cạnh góc xấu
      if (edgeR || edgeC) return 12;             // biên
      return 1;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const moves = legalMoves(me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.5) {
        const m = moves[Math.floor(Math.random() * moves.length)];
        return { r: m[0], c: m[1] };
      }
      const cornerW = level === "hard" ? 9 : 6;
      let best = -Infinity, pick = moves[0];
      for (const [r, c] of moves) {
        const flips = flipsFor(r, c, me).length;
        const sc = posWeight(r, c) * cornerW + flips;
        if (sc > best) { best = sc; pick = [r, c]; }
      }
      return { r: pick[0], c: pick[1] };
    }

    function undo() {
      if (!history.length) return false;
      const s = history.pop();
      board = s.board.map((row) => row.slice());
      turn = s.turn;
      over = s.over;
      lastMove = s.lastMove;
      lastFlips = s.lastFlips.slice();
      clearPreview();
      ctx.setTurn(turn);
      render();
      updateHud();
      return true;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đen)", "Player 1 (Black)"), ctx.t("Người chơi 2 (Trắng)", "Player 2 (White)"));
    ctx.setTurn(0);
    render();
    updateHud();
    return { applyMove, undo, aiMove };
  }

  window.GameRegistry.register({
    id: "reversi",
    name: "Cờ Lật (Reversi)",
    emoji: "⚫",
    description: "Kẹp quân đối thủ để lật thành quân mình. Ai nhiều quân hơn khi hết bàn sẽ thắng. Có gợi ý số quân sẽ lật cho người mới.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "hints", label: "Gợi ý cho người mới", default: "on",
        choices: [
          { value: "on", label: "Bật (hiện số quân lật + xem trước)" },
          { value: "off", label: "Tắt (chơi như cao thủ)" },
        ],
      },
    ],
    howTo: [
      "Người chơi 1 dùng quân ⚫ Đen, Người chơi 2 dùng quân ⚪ Trắng. Đen đi trước.",
      "Mục tiêu: kẹp một hàng quân đối thủ giữa quân bạn vừa đặt và một quân khác của bạn — cả hàng đó sẽ LẬT thành quân của bạn.",
      "Khi bật Gợi ý: các ô đánh được sẽ hiện một CON SỐ — đó là số quân bạn sẽ lật nếu đặt vào đó. Số càng to thường càng lợi.",
      "Rê chuột lên ô gợi ý để XEM TRƯỚC: quân ma hiện ra và những quân sắp bị lật sẽ nhấp nháy.",
      "Bạn chỉ được đặt vào ô tạo ra ít nhất 1 lần lật. Không có nước đi hợp lệ thì bị mất lượt.",
      "Bảng trên đếm số quân mỗi bên và cho biết đang tới lượt ai. Khi bàn đầy (hoặc cả hai đều tắc), ai nhiều quân hơn sẽ thắng.",
      "Mẹo: 4 góc bàn rất mạnh vì không bao giờ bị lật lại — cố chiếm góc!",
    ],
    create,
  });
})();
