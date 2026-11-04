/* Dò Mìn Đối Kháng (Minesweeper Flags) — chơi chung máy & ONLINE
   Chung một bãi mìn (sinh tất định theo seed). Thay nhau lật ô.
   Lật trúng mìn: ghi điểm + được đi tiếp. Lật ô thường: hiện số, chuyển lượt.
   Ai cắm cờ trúng nhiều hơn nửa số mìn sẽ thắng. Nước đi: { idx }. */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 16;          // bàn N×N
    const MINES = o.mines || 40;     // tổng số mìn
    const NEED = Math.floor(MINES / 2) + 1; // số mìn cần để thắng
    let hintsLeft = o.hints === "off" ? 0 : o.hints === "many" ? 6 : 3;

    // ----- sinh bãi mìn tất định theo seed -----
    const total = N * N;
    const isMine = new Array(total).fill(false);
    let placed = 0;
    while (placed < MINES && placed < total) {
      const idx = Math.floor(ctx.rng() * total);
      if (!isMine[idx]) { isMine[idx] = true; placed++; }
    }
    // đếm mìn lân cận
    const counts = new Array(total).fill(0);
    for (let i = 0; i < total; i++) {
      if (isMine[i]) continue;
      counts[i] = neighbors(i).filter((j) => isMine[j]).length;
    }

    const revealed = new Array(total).fill(false);
    const owner = new Array(total).fill(-1); // -1 chưa, 0/1 = ai cắm cờ trúng mìn
    let turn = 0;
    let scores = [0, 0];
    let over = false;

    function neighbors(i) {
      const r = Math.floor(i / N), c = i % N, res = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) res.push(nr * N + nc);
        }
      return res;
    }

    // ----- giao diện -----
    const wrap = document.createElement("div");
    wrap.className = "ms-wrap";
    const scoreRow = document.createElement("div");
    scoreRow.className = "ms-scores";
    wrap.appendChild(scoreRow);
    const grid = document.createElement("div");
    grid.className = "ms-grid";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    wrap.appendChild(grid);
    const hintRow = document.createElement("div");
    hintRow.className = "ms-hintrow";
    const hintBtn = document.createElement("button");
    hintBtn.className = "btn small ms-hint-btn";
    hintRow.appendChild(hintBtn);
    if (hintsLeft === 0) hintRow.classList.add("hidden");
    wrap.appendChild(hintRow);
    ctx.boardEl.appendChild(wrap);

    hintBtn.addEventListener("click", onHint);
    function updateHintBtn() {
      hintBtn.textContent = ctx.t(`💡 Gợi ý ô khả nghi (còn ${hintsLeft})`, `💡 Hint a suspicious cell (${hintsLeft} left)`);
      hintBtn.disabled = over || hintsLeft <= 0 || (ctx.isOnline && turn !== ctx.mySeat);
    }

    // ước lượng xác suất một ô là mìn dựa trên các số đã lộ xung quanh
    function onHint() {
      if (over || hintsLeft <= 0) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      let bestI = -1, bestP = -1;
      for (let i = 0; i < total; i++) {
        if (revealed[i]) continue;
        let p = 0, known = false;
        for (const j of neighbors(i)) {
          if (!revealed[j] || isMine[j]) continue; // chỉ xét ô số đã lộ
          if (counts[j] <= 0) continue;
          const nb = neighbors(j);
          const flagged = nb.filter((k) => revealed[k] && isMine[k]).length;
          const hidden = nb.filter((k) => !revealed[k]).length;
          const remain = counts[j] - flagged;
          if (hidden > 0 && remain > 0) { p = Math.max(p, remain / hidden); known = true; }
        }
        if (!known) p = 0.001; // không có manh mối -> xác suất nền rất thấp
        if (p > bestP) { bestP = p; bestI = i; }
      }
      if (bestI < 0) return;
      hintsLeft--;
      cellEls[bestI].classList.add("ms-hint");
      ctx.sound("notify");
      setTimeout(() => cellEls[bestI] && cellEls[bestI].classList.remove("ms-hint"), 1600);
      ctx.setStatus(bestP > 0.5
        ? ctx.t("💡 Ô đang nháy nhiều khả năng có mìn — thử lật để ghi điểm!", "💡 The flashing cell likely has a mine — try it to score!")
        : ctx.t("💡 Chưa đủ manh mối chắc chắn; ô gợi ý chỉ là phỏng đoán.", "💡 Not enough clues yet; the hint is just a guess."));
      updateHintBtn();
    }

    const cellEls = [];
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("div");
      cell.className = "ms-cell";
      const idx = i;
      cell.addEventListener("click", () => onClick(idx));
      grid.appendChild(cell);
      cellEls.push(cell);
    }

    const NUM_COLORS = ["", "#4dd0e1", "#6ee7b7", "#ffd166", "#ff8c9c",
                        "#c9a98a", "#8be6f0", "#e9ecff", "#9aa0d0"];

    function onClick(idx) {
      if (over || revealed[idx]) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      applyMove({ idx }, false);
    }

    function applyMove(move, fromRemote) {
      const idx = move.idx;
      if (over || revealed[idx]) return;

      if (!fromRemote) ctx.sendMove({ idx });

      if (isMine[idx]) {
        // cắm cờ trúng mìn: ghi điểm, giữ lượt
        revealed[idx] = true;
        owner[idx] = turn;
        scores[turn]++;
        ctx.incScore(turn);
        ctx.sound("capture");
        if (scores[turn] >= NEED || scores[0] + scores[1] >= MINES) return finish();
        renderCell(idx);
        updateScores();
        ctx.setStatus(ctx.t(`💣 Người chơi ${turn + 1} tìm thấy mìn — được đi tiếp!`, `💣 Player ${turn + 1} found a mine — go again!`));
        return;
      }

      // ô thường: hiện số (flood nếu là 0), rồi chuyển lượt
      floodReveal(idx);
      ctx.sound("select");
      turn = 1 - turn;
      ctx.setTurn(turn);
      updateScores();
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} — tìm mìn để ghi điểm.`, `Player ${turn + 1}'s turn — find mines to score.`));
    }

    function floodReveal(start) {
      const stack = [start];
      while (stack.length) {
        const i = stack.pop();
        if (revealed[i] || isMine[i]) continue;
        revealed[i] = true;
        renderCell(i);
        if (counts[i] === 0) neighbors(i).forEach((j) => { if (!revealed[j] && !isMine[j]) stack.push(j); });
      }
    }

    function finish() {
      over = true;
      // lật hết mìn còn lại cho đẹp
      for (let i = 0; i < total; i++) if (isMine[i] && !revealed[i]) { revealed[i] = true; renderCell(i); }
      renderAll();
      ctx.setTurn(-1);
      const [a, b] = scores;
      if (a > b) ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng — ${a} mìn so với ${b}!`, `🎉 Player 1 wins — ${a} mines vs ${b}!`));
      else if (b > a) ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng — ${b} mìn so với ${a}!`, `🎉 Player 2 wins — ${b} mines vs ${a}!`));
      else ctx.setStatus(ctx.t(`🤝 Hòa — mỗi người ${a} mìn!`, `🤝 Draw — ${a} mines each!`));
      updateScores();
    }

    function renderCell(i) {
      const cell = cellEls[i];
      if (!revealed[i]) { cell.className = "ms-cell"; cell.textContent = ""; return; }
      if (isMine[i]) {
        cell.className = "ms-cell mine" + (owner[i] === 0 ? " p1" : owner[i] === 1 ? " p2" : "");
        cell.textContent = "🚩";
      } else {
        cell.className = "ms-cell open";
        cell.textContent = counts[i] > 0 ? counts[i] : "";
        cell.style.color = NUM_COLORS[counts[i]] || "";
      }
    }

    function renderAll() { for (let i = 0; i < total; i++) renderCell(i); }

    function updateScores() {
      scoreRow.innerHTML =
        `<span class="ms-s p1">🚩 P1: ${scores[0]}</span>` +
        `<span class="ms-need">${ctx.t(`Cần ${NEED} để thắng • Tổng ${MINES} mìn`, `Need ${NEED} to win • ${MINES} mines total`)}</span>` +
        `<span class="ms-s p2">P2: ${scores[1]} 🚩</span>`;
      updateHintBtn();
    }

    ctx.setTurn(0);
    updateScores();
    ctx.setStatus(ctx.t("Lật ô để dò mìn. Trúng mìn thì ghi điểm và được đi tiếp!", "Reveal cells to find mines. Hit a mine to score and go again!"));
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "minesweeper",
    name: "Dò Mìn Đối Kháng",
    emoji: "🚩",
    description: "Chung một bãi mìn, thay nhau lật ô. Trúng mìn được ghi điểm và đi tiếp. Ai nhiều mìn hơn thắng.",
    onlineReady: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 16,
        choices: [
          { value: 12, label: "12×12 (nhỏ)" },
          { value: 16, label: "16×16 (chuẩn)" },
          { value: 20, label: "20×20 (lớn)" },
        ],
      },
      {
        id: "mines", label: "Số mìn", default: 40,
        choices: [
          { value: 25, label: "25 (ít)" },
          { value: 40, label: "40 (vừa)" },
          { value: 60, label: "60 (nhiều)" },
        ],
      },
      {
        id: "hints", label: "Gợi ý ô khả nghi", default: "some",
        choices: [
          { value: "off", label: "Tắt (khó)" },
          { value: "some", label: "3 lần" },
          { value: "many", label: "6 lần (dễ)" },
        ],
      },
    ],
    howTo: [
      "Cả hai cùng chơi trên MỘT bãi mìn chung. Thay nhau lật ô.",
      "Lật trúng MÌN: bạn cắm cờ (ghi 1 điểm) và được lật tiếp.",
      "Lật trúng ô THƯỜNG: ô hiện số mìn xung quanh (ô số 0 sẽ tự mở rộng vùng trống), rồi chuyển lượt cho đối thủ.",
      "Dùng các con số làm manh mối để suy ra ô nào có mìn. Bí quá thì bấm '💡 Gợi ý ô khả nghi' (có giới hạn) để máy nháy ô nhiều khả năng có mìn nhất.",
      "Ai cắm cờ trúng nhiều hơn một nửa số mìn trước sẽ thắng.",
    ],
    create,
  });
})();
