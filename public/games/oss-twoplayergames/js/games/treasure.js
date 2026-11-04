/* Trộm Kho Báu — chơi chung máy & ONLINE (giấu thông tin)
   Mỗi người giấu NHIỀU kho báu trên lưới. Thay nhau đào ô lưới đối thủ.
   - Đào trúng kho: ghi điểm + ĐƯỢC ĐÀO TIẾP (giữ lượt).
   - Đào trượt: nhận gợi ý khoảng cách tới kho GẦN NHẤT chưa tìm, rồi chuyển lượt.
   Ai tìm đủ hết kho của đối thủ trước sẽ thắng.
   Kho báu KHÔNG gửi qua mạng. Giao thức:
     { kind:"ready" }
     { kind:"dig", r, c }
     { kind:"result", r, c, dist, hit, found, total, gameOver } */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 8;
    const NT = o.treasures || 3;     // số kho mỗi người

    let phase = "hide";
    let iReady = false, oppReady = false;
    let turn = 0;
    let awaiting = false;

    // kho của tôi (online) / cả hai (hot-seat)
    const myTreasures = [];          // [{r,c,found}]
    const localTreasures = [[], []]; // hot-seat
    let placingSeat = 0;             // hot-seat: ai đang giấu

    // tiến độ đào: số kho đã tìm được của đối thủ
    const foundByMe = [0, 0];        // [foundByP0, foundByP1] kho tìm được
    // lịch sử đào của từng người trên lưới đối thủ: attack[seat]["r,c"] = {dist,hit}
    const attack = [{}, {}];
    const oppDigsOnMe = {};          // ô đối thủ đào trên lưới tôi (online)

    const root = document.createElement("div");
    root.className = "tr-root";
    ctx.boardEl.appendChild(root);

    const info = document.createElement("div");
    info.className = "tr-info";
    root.appendChild(info);

    const controls = document.createElement("div");
    controls.className = "tr-controls";
    const placeInfo = document.createElement("span");
    placeInfo.className = "tr-place-info";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn primary";
    confirmBtn.textContent = ctx.t("✓ Sẵn sàng", "✓ Ready");
    confirmBtn.disabled = true;
    const randomBtn = document.createElement("button");
    randomBtn.className = "btn";
    randomBtn.textContent = ctx.t("🎲 Giấu ngẫu nhiên", "🎲 Hide randomly");
    controls.appendChild(placeInfo);
    controls.appendChild(randomBtn);
    controls.appendChild(confirmBtn);
    root.appendChild(controls);

    const boards = document.createElement("div");
    boards.className = "tr-boards";
    root.appendChild(boards);

    const myWrap = makeBoard(ctx.t("Lưới của bạn", "Your grid"));
    const oppWrap = makeBoard(ctx.t("Lưới đối thủ — đào tìm", "Enemy grid — dig to find"));
    boards.appendChild(myWrap.wrap);
    boards.appendChild(oppWrap.wrap);

    function makeBoard(title) {
      const wrap = document.createElement("div");
      wrap.className = "tr-board-wrap";
      const h = document.createElement("div");
      h.className = "tr-board-title";
      h.textContent = title;
      const grid = document.createElement("div");
      grid.className = "tr-grid";
      grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
      const cells = [];
      for (let i = 0; i < N * N; i++) {
        const cell = document.createElement("div");
        cell.className = "tr-cell";
        grid.appendChild(cell);
        cells.push(cell);
      }
      wrap.appendChild(h);
      wrap.appendChild(grid);
      return { wrap, grid, cells, title: h };
    }

    function dist(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c); }
    function hintFor(d) {
      if (d <= 1) return { t: ctx.t("🔥 Cực nóng", "🔥 Burning"), cls: "hot" };
      if (d <= 2) return { t: ctx.t("♨️ Nóng", "♨️ Hot"), cls: "warm" };
      if (d <= 4) return { t: ctx.t("🌤️ Ấm", "🌤️ Warm"), cls: "mild" };
      return { t: ctx.t("❄️ Lạnh", "❄️ Cold"), cls: "cold" };
    }
    // khoảng cách tới kho CHƯA tìm gần nhất trong danh sách
    function nearestUnfound(treasures, r, c) {
      let best = Infinity;
      for (const t of treasures) {
        if (t.found) continue;
        best = Math.min(best, dist({ r, c }, t));
      }
      return best;
    }

    // ====================== Giấu kho ======================
    function activeTreasures() { return ctx.isOnline ? myTreasures : localTreasures[placingSeat]; }

    myWrap.grid.addEventListener("click", (e) => {
      if (phase === "hide") {
        const cell = e.target.closest(".tr-cell");
        if (!cell) return;
        const i = [...myWrap.grid.children].indexOf(cell);
        const r = Math.floor(i / N), c = i % N;
        toggleTreasure(r, c);
        return;
      }
      // hot-seat khi chơi: bàn trái là bàn đào của P1
      if (phase === "play" && !ctx.isOnline) {
        attackGridClick(0, myWrap.grid, e);
      }
    });

    function toggleTreasure(r, c) {
      const list = activeTreasures();
      const at = list.findIndex((t) => t.r === r && t.c === c);
      if (at >= 0) { list.splice(at, 1); }
      else if (list.length < NT) { list.push({ r, c, found: false }); }
      else { info.textContent = ctx.t(`Đã đủ ${NT} kho — bỏ bớt một kho nếu muốn đổi.`, `Already ${NT} treasures — remove one to change.`); return; }
      ctx.sound("select");
      renderMine();
      updatePlaceInfo();
    }

    function randomPlace() {
      const list = activeTreasures();
      list.length = 0;
      const taken = new Set();
      while (list.length < NT) {
        const i = Math.floor((ctx.isOnline ? Math.random() : Math.random()) * N * N);
        if (taken.has(i)) continue;
        taken.add(i);
        list.push({ r: Math.floor(i / N), c: i % N, found: false });
      }
      ctx.sound("place");
      renderMine();
      updatePlaceInfo();
    }
    randomBtn.addEventListener("click", () => { if (phase === "hide") randomPlace(); });

    function updatePlaceInfo() {
      const list = activeTreasures();
      placeInfo.textContent = ctx.t(`Giấu ${list.length}/${NT} kho 💎`, `Hide ${list.length}/${NT} treasures 💎`);
      confirmBtn.disabled = list.length !== NT;
    }

    confirmBtn.addEventListener("click", onReady);
    function onReady() {
      if (phase !== "hide" || activeTreasures().length !== NT) return;
      if (ctx.isOnline) {
        iReady = true;
        myTreasures.forEach((t) => (t.found = false));
        controls.classList.add("tr-hidden");
        ctx.sendMove({ kind: "ready" });
        if (oppReady) beginPlay();
        else info.textContent = ctx.t("Đã sẵn sàng. Đang chờ đối thủ giấu kho...", "Ready. Waiting for the opponent to hide treasures...");
      } else {
        if (placingSeat === 0) {
          placingSeat = 1;
          renderMine();
          updatePlaceInfo();
          info.textContent = ctx.t(`Người chơi 2: giấu ${NT} kho báu của bạn (Người chơi 1 đừng nhìn!).`, `Player 2: hide your ${NT} treasures (Player 1, no peeking!).`);
        } else {
          beginPlay();
        }
      }
    }

    function beginPlay() {
      phase = "play";
      controls.classList.add("tr-hidden");
      turn = 0;
      // đổi tiêu đề 2 bàn cho chế độ chơi chung máy: mỗi người 1 bàn đào riêng
      if (!ctx.isOnline) {
        myWrap.title.textContent = ctx.t("P1 đào (tìm kho P2)", "P1 digs (find P2's treasures)");
        oppWrap.title.textContent = ctx.t("P2 đào (tìm kho P1)", "P2 digs (find P1's treasures)");
      }
      ctx.setTurn(0);
      renderAll();
      updateStatus();
    }

    // ====================== Đào ======================
    // Online: chỉ bàn phải (oppWrap) là bàn đào của mình.
    // Hot-seat: bàn trái = P1 đào, bàn phải = P2 đào (mỗi người lịch sử riêng).
    function attackGridClick(diggerSeat, gridEl, e) {
      if (phase !== "play" || awaiting) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      if (!ctx.isOnline && turn !== diggerSeat) return; // hot-seat: đúng lượt mới đào bàn của mình
      const cell = e.target.closest(".tr-cell");
      if (!cell) return;
      const i = [...gridEl.children].indexOf(cell);
      if (i < 0) return;
      const r = Math.floor(i / N), c = i % N;
      if (attack[diggerSeat][r + "," + c] !== undefined) return;
      dig(r, c);
    }
    oppWrap.grid.addEventListener("click", (e) => {
      // online: người chơi đào trên oppWrap (= attack[mySeat])
      // hot-seat: oppWrap là bàn của P2
      const seat = ctx.isOnline ? ctx.mySeat : 1;
      attackGridClick(seat, oppWrap.grid, e);
    });

    function dig(r, c) {
      const seat = ctx.isOnline ? ctx.mySeat : turn;
      if (attack[seat][r + "," + c] !== undefined) return; // đã đào ô này rồi
      if (ctx.isOnline) {
        awaiting = true;
        ctx.sendMove({ kind: "dig", r, c });
        info.textContent = ctx.t("Đang đào, chờ kết quả...", "Digging, awaiting result...");
      } else {
        // hot-seat: chấm trên kho của đối thủ
        const oppList = localTreasures[1 - turn];
        const hitT = oppList.find((t) => !t.found && t.r === r && t.c === c);
        if (hitT) hitT.found = true;
        const remaining = oppList.filter((t) => !t.found).length;
        const d = hitT ? 0 : nearestUnfound(oppList, r, c);
        const found = oppList.filter((t) => t.found).length;
        applyDigResult(turn, r, c, d, !!hitT, found, NT, remaining === 0);
      }
    }

    function applyDigResult(diggerSeat, r, c, d, hit, found, total, gameOver) {
      attack[diggerSeat][r + "," + c] = { dist: d, hit };
      if (hit) foundByMe[diggerSeat] = found;
      ctx.sound(hit ? "capture" : (d <= 2 ? "shot" : "miss"));
      renderProgress();

      if (gameOver) { renderAll(); return endGame(diggerSeat, ctx.t(`tìm đủ ${total} kho báu`, `found all ${total} treasures`)); }

      if (hit) {
        // trúng -> được đào tiếp (giữ lượt)
        awaiting = false;
        renderAll();
        const left = total - found;
        ctx.setStatus(ctx.t(`💎 Trúng kho! Còn ${left} kho. Người chơi ${diggerSeat + 1} đào tiếp!`, `💎 Hit! ${left} treasures left. Player ${diggerSeat + 1} digs again!`));
        return;
      }
      // trượt -> chuyển lượt
      turn = 1 - diggerSeat;
      awaiting = false;
      ctx.setTurn(turn);
      renderAll();
      const h = hintFor(d);
      ctx.setStatus(ctx.t(`${h.t} (kho gần nhất cách ${d} ô). Lượt Người chơi ${turn + 1}.`, `${h.t} (nearest treasure ${d} cells away). Player ${turn + 1}'s turn.`));
    }

    // ====================== Online ======================
    function applyMove(move, fromRemote) {
      if (!fromRemote) return;
      if (move.kind === "ready") {
        oppReady = true;
        if (iReady) beginPlay();
        else info.textContent = ctx.t("Đối thủ đã sẵn sàng. Hãy giấu kho và bấm Sẵn sàng.", "Opponent is ready. Hide your treasures and press Ready.");
        return;
      }
      if (move.kind === "dig") {
        // đối thủ đào lưới của TÔI -> tôi chấm
        const opp = 1 - ctx.mySeat;
        const hitT = myTreasures.find((t) => !t.found && t.r === move.r && t.c === move.c);
        if (hitT) hitT.found = true;
        const found = myTreasures.filter((t) => t.found).length;
        const remaining = NT - found;
        const d = hitT ? 0 : nearestUnfound(myTreasures, move.r, move.c);
        oppDigsOnMe[move.r + "," + move.c] = { dist: d, hit: !!hitT };
        ctx.sendMove({ kind: "result", r: move.r, c: move.c, dist: d, hit: !!hitT, found, total: NT, gameOver: remaining === 0 });
        renderMine();
        renderProgress();
        if (remaining === 0) { endGame(opp, ctx.t("kho của bạn đã bị tìm hết", "all your treasures were found")); return; }
        if (hitT) {
          // đối thủ trúng -> họ đào tiếp, vẫn lượt của họ
          ctx.setStatus(ctx.t("💥 Đối thủ tìm thấy 1 kho của bạn và được đào tiếp...", "💥 The opponent found one of your treasures and digs again..."));
        } else {
          turn = ctx.mySeat;
          ctx.setTurn(turn);
          renderAll();
          updateStatus();
        }
        return;
      }
      if (move.kind === "result") {
        applyDigResult(ctx.mySeat, move.r, move.c, move.dist, move.hit, move.found, move.total, move.gameOver);
        return;
      }
    }

    function endGame(winnerSeat, reason) {
      phase = "over";
      ctx.setTurn(-1);
      // lộ kho còn lại của mình cho đẹp
      renderMine(true);
      if (ctx.isOnline) {
        if (winnerSeat === ctx.mySeat) { ctx.incScore(ctx.mySeat); ctx.setStatus(ctx.t(`🎉 Bạn thắng — ${reason}!`, `🎉 You win — ${reason}!`)); }
        else ctx.setStatus(ctx.t(`💀 Bạn thua — ${reason}.`, `💀 You lose — ${reason}.`));
      } else {
        ctx.incScore(winnerSeat);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winnerSeat + 1} thắng — ${reason}!`, `🎉 Player ${winnerSeat + 1} wins — ${reason}!`));
      }
    }

    // ====================== Render ======================
    function renderProgress() {
      const p0 = foundByMe[0], p1 = foundByMe[1];
      info.innerHTML =
        `<span class="tr-prog tr-p1">P1: ${"💎".repeat(p0)}${"·".repeat(Math.max(0, NT - p0))}</span>` +
        `<span class="tr-prog tr-p2">P2: ${"💎".repeat(p1)}${"·".repeat(Math.max(0, NT - p1))}</span>`;
    }

    // vẽ một lưới: showTreasures = danh sách kho để hiện (hoặc null);
    // digs = lịch sử đào trên lưới đó; revealAll = lộ hết kho khi kết thúc
    function paintGrid(boardEl, treasures, digs, revealAll) {
      boardEl.cells.forEach((cell, i) => {
        const r = Math.floor(i / N), c = i % N;
        cell.className = "tr-cell";
        cell.textContent = "";
        if (treasures) {
          const isT = treasures.some((t) => t.r === r && t.c === c);
          if (isT && revealAll) { cell.classList.add("treasure"); cell.textContent = "💎"; }
          else if (isT && phase === "hide") { cell.classList.add("treasure"); cell.textContent = "💎"; }
        }
        const dug = digs && digs[r + "," + c];
        if (dug) {
          if (dug.hit) { cell.classList.add("dug", "hit"); cell.textContent = "💎"; }
          else { cell.classList.add("dug", hintFor(dug.dist).cls); cell.textContent = dug.dist; }
        }
      });
    }

    function renderAll(revealAll) {
      if (ctx.isOnline) {
        // bàn trái = lưới của tôi (kho mình + dấu đào của đối thủ)
        paintGrid(myWrap, myTreasures, oppDigsOnMe, revealAll || phase === "over");
        // bàn phải = lưới đối thủ (dấu đào của tôi)
        paintGrid(oppWrap, null, attack[ctx.mySeat], false);
        const myMove = phase === "play" && turn === ctx.mySeat && !awaiting;
        oppWrap.wrap.classList.toggle("tr-active", myMove);
        myWrap.wrap.classList.remove("tr-active");
      } else if (phase === "hide") {
        // đang giấu: chỉ hiện lưới người đang đặt ở bàn trái
        paintGrid(myWrap, localTreasures[placingSeat], null, false);
        paintGrid(oppWrap, null, null, false);
      } else {
        // hot-seat khi chơi: bàn trái P1 đào (kho P2 ẩn), bàn phải P2 đào (kho P1 ẩn)
        paintGrid(myWrap, localTreasures[1], attack[0], revealAll || phase === "over");
        paintGrid(oppWrap, localTreasures[0], attack[1], revealAll || phase === "over");
        myWrap.wrap.classList.toggle("tr-active", phase === "play" && turn === 0);
        oppWrap.wrap.classList.toggle("tr-active", phase === "play" && turn === 1);
      }
    }

    // tương thích: vài chỗ cũ gọi renderMine()
    function renderMine(reveal) { renderAll(reveal); }

    function updateStatus() {
      if (phase !== "play") return;
      const mine = !ctx.isOnline || turn === ctx.mySeat;
      ctx.setStatus(mine ? ctx.t("🔍 Lượt bạn — đào tìm kho trên lưới đối thủ!", "🔍 Your turn — dig for treasures on the enemy grid!") : ctx.t("⏳ Đối thủ đang đào...", "⏳ Opponent is digging..."));
    }

    // ====================== Khởi tạo ======================
    updatePlaceInfo();
    if (ctx.isOnline) {
      info.textContent = ctx.t(`Giấu ${NT} kho 💎 trên LƯỚI CỦA BẠN (bấm để đặt/bỏ, hoặc 🎲 ngẫu nhiên), rồi Sẵn sàng.`, `Hide ${NT} treasures 💎 on YOUR GRID (click to place/remove, or 🎲 random), then Ready.`);
    } else {
      info.textContent = ctx.t(`Người chơi 1: giấu ${NT} kho 💎 trên lưới của bạn.`, `Player 1: hide ${NT} treasures 💎 on your grid.`);
    }
    ctx.setStatus(ctx.t("Giấu kho báu để bắt đầu.", "Hide your treasures to begin."));
    renderAll();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "treasure",
    name: "Trộm Kho Báu",
    emoji: "💎",
    description: "Giấu nhiều kho báu, đào tìm kho đối thủ theo gợi ý nóng/lạnh. Trúng được đào tiếp. Tìm hết kho địch thì thắng.",
    onlineReady: true,
    options: [
      {
        id: "size", label: "Kích thước lưới", default: 8,
        choices: [
          { value: 6, label: "6×6 (nhỏ)" },
          { value: 8, label: "8×8 (chuẩn)" },
          { value: 10, label: "10×10 (lớn)" },
        ],
      },
      {
        id: "treasures", label: "Số kho mỗi người", default: 3,
        choices: [
          { value: 1, label: "1 kho (nhanh)" },
          { value: 3, label: "3 kho (chuẩn)" },
          { value: 5, label: "5 kho (lâu)" },
        ],
      },
    ],
    howTo: [
      "Đầu ván: giấu các kho báu 💎 trên LƯỚI CỦA BẠN — bấm ô để đặt/bỏ, hoặc bấm '🎲 Giấu ngẫu nhiên'. Đủ số kho thì bấm 'Sẵn sàng'.",
      "Khi cả hai xong, thay nhau ĐÀO ô trên 'Lưới đối thủ'.",
      "Đào TRƯỢT: nhận gợi ý khoảng cách tới kho GẦN NHẤT chưa tìm — 🔥 cực nóng, ♨️ nóng, 🌤️ ấm, ❄️ lạnh (kèm số ô), rồi chuyển lượt.",
      "Đào TRÚNG kho: ghi được kho đó và ĐƯỢC ĐÀO TIẾP (giữ lượt) — nên trúng liên tiếp có thể lật ngược thế cờ.",
      "Con số trên ô đã đào là khoảng cách Manhattan tới kho gần nhất lúc đó — dùng để khoanh vùng.",
      "Ai tìm đủ HẾT số kho của đối thủ trước sẽ thắng.",
    ],
    create,
  });
})();
