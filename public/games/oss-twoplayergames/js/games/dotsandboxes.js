/* Dots and Boxes - Nối Ô — chơi chung máy & online
   Map tùy chỉnh (số ô ngang x dọc). Nối cạnh, hoàn thành ô thì chiếm và đi tiếp.
   Có ô thưởng ⭐ (chiếm được +1 điểm). Hết cạnh, ai nhiều điểm hơn thắng. */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const W = clampInt(o.cols, 3, 9, 5); // số ô ngang
    const H = clampInt(o.rows, 3, 9, 5); // số ô dọc
    const bonusMode = o.bonus || "few";

    // hEdges[r][c]: cạnh ngang, r in [0..H], c in [0..W-1]
    // vEdges[r][c]: cạnh dọc,   r in [0..H-1], c in [0..W]
    const hEdges = Array.from({ length: H + 1 }, () => Array(W).fill(false));
    const vEdges = Array.from({ length: H }, () => Array(W + 1).fill(false));
    const owner = Array.from({ length: H }, () => Array(W).fill(null));
    const points = [0, 0];
    let turn = 0;
    let filled = 0;
    let over = false;
    let lastEl = null;
    const moveStack = []; // ngăn xếp nước đi để hoàn tác

    // ô thưởng ⭐ (tất định theo seed)
    const stars = makeStars();

    const root = document.createElement("div");
    root.className = "dnb-root";
    ctx.boardEl.appendChild(root);

    const header = document.createElement("div");
    header.className = "dnb-header";
    root.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "dnb-board";
    const gCols = 2 * W + 1, gRows = 2 * H + 1;
    grid.style.gridTemplateColumns = `repeat(${gCols}, auto)`;
    const maxDim = Math.max(W, H);
    const u = maxDim <= 4 ? 46 : maxDim <= 5 ? 42 : maxDim <= 6 ? 36 : maxDim <= 7 ? 31 : 27;
    const t = Math.max(7, Math.round(u * 0.22));
    grid.style.setProperty("--dnb-u", u + "px");
    grid.style.setProperty("--dnb-t", t + "px");
    root.appendChild(grid);

    const hEls = Array.from({ length: H + 1 }, () => Array(W));
    const vEls = Array.from({ length: H }, () => Array(W + 1));
    const boxEls = Array.from({ length: H }, () => Array(W));

    for (let gr = 0; gr < gRows; gr++) {
      for (let gc = 0; gc < gCols; gc++) {
        const cell = document.createElement("div");
        const evenR = gr % 2 === 0, evenC = gc % 2 === 0;
        if (evenR && evenC) {
          cell.className = "dnb-dot";
        } else if (evenR && !evenC) {
          cell.className = "dnb-h";
          const r = gr / 2, c = (gc - 1) / 2;
          hEls[r][c] = cell;
          cell.addEventListener("click", () => onClick({ type: "h", r, c }));
        } else if (!evenR && evenC) {
          cell.className = "dnb-v";
          const r = (gr - 1) / 2, c = gc / 2;
          vEls[r][c] = cell;
          cell.addEventListener("click", () => onClick({ type: "v", r, c }));
        } else {
          cell.className = "dnb-box";
          const r = (gr - 1) / 2, c = (gc - 1) / 2;
          boxEls[r][c] = cell;
          if (stars.has(r + "," + c)) { cell.classList.add("star"); cell.textContent = "⭐"; }
        }
        grid.appendChild(cell);
      }
    }

    function makeStars() {
      const set = new Set();
      const total = W * H;
      const want = bonusMode === "off" ? 0 : bonusMode === "many" ? Math.max(2, Math.round(total * 0.2)) : Math.max(1, Math.round(total * 0.1));
      const all = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) all.push([r, c]);
      // xáo trộn tất định bằng ctx.rng
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        const tmp = all[i]; all[i] = all[j]; all[j] = tmp;
      }
      for (let i = 0; i < want && i < all.length; i++) set.add(all[i][0] + "," + all[i][1]);
      return set;
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function edgeTaken(m) { return m.type === "h" ? hEdges[m.r][m.c] : vEdges[m.r][m.c]; }

    function onClick(m) {
      if (!canPlay() || edgeTaken(m)) return;
      applyMove(m, false);
    }

    function applyMove(m, fromRemote) {
      if (over || edgeTaken(m)) return;
      let el;
      if (m.type === "h") { hEdges[m.r][m.c] = true; el = hEls[m.r][m.c]; }
      else { vEdges[m.r][m.c] = true; el = vEls[m.r][m.c]; }
      el.classList.add("on", turn === 0 ? "p1" : "p2");
      if (lastEl) lastEl.classList.remove("last");
      el.classList.add("last");
      lastEl = el;
      ctx.sound("place");

      if (!fromRemote) ctx.sendMove(m);

      const gained = claimBoxes(m, turn);
      moveStack.push({ m, turnBefore: turn, boxes: gained.boxes, el });
      if (gained.count > 0) {
        if (filled === W * H) return finish();
        const extra = gained.bonus > 0 ? ctx.t(` (+${gained.bonus} thưởng ⭐)`, ` (+${gained.bonus} bonus ⭐)`) : "";
        const combo = gained.count >= 2 ? `COMBO ×${gained.count}! ` : "";
        renderHeader();
        ctx.setTurn(turn); // giữ lượt
        ctx.setStatus(ctx.t(`✅ ${combo}Người chơi ${turn + 1} chiếm ${gained.count} ô${extra} — đi tiếp!`,
          `✅ ${combo}Player ${turn + 1} claimed ${gained.count} box(es)${extra} — go again!`));
      } else {
        turn = 1 - turn;
        renderHeader();
        ctx.setTurn(turn);
        updateStatus();
      }
    }

    function claimBoxes(m, p) {
      const candidates = [];
      if (m.type === "h") {
        if (m.r > 0) candidates.push([m.r - 1, m.c]);
        if (m.r < H) candidates.push([m.r, m.c]);
      } else {
        if (m.c > 0) candidates.push([m.r, m.c - 1]);
        if (m.c < W) candidates.push([m.r, m.c]);
      }
      let count = 0, bonus = 0;
      const boxes = [];
      for (const [br, bc] of candidates) {
        if (owner[br][bc] === null && boxComplete(br, bc)) {
          owner[br][bc] = p;
          filled++;
          count++;
          const isStar = stars.has(br + "," + bc);
          const val = isStar ? 2 : 1;
          if (isStar) bonus += 1;
          points[p] += val;
          for (let k = 0; k < val; k++) ctx.incScore(p);
          boxes.push({ br, bc, val, isStar });
          const box = boxEls[br][bc];
          box.classList.add(p === 0 ? "own-p1" : "own-p2", "claimed");
          box.textContent = (isStar ? "⭐" : "") + (p === 0 ? "1" : "2");
        }
      }
      return { count, bonus, boxes };
    }

    function boxComplete(br, bc) {
      return hEdges[br][bc] && hEdges[br + 1][bc] && vEdges[br][bc] && vEdges[br][bc + 1];
    }

    function renderHeader() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      header.innerHTML = `
        <div class="dnb-score p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🟥 ${ctx.t("Người chơi 1", "Player 1")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${points[0]}</b>
        </div>
        <div class="dnb-mid">
          <span>${W}×${H} ${ctx.t("ô · còn", "boxes · left")} ${W * H - filled}</span>
          ${stars.size ? `<small>${ctx.t("⭐ ô thưởng = 2 điểm", "⭐ bonus box = 2 pts")}</small>` : ""}
        </div>
        <div class="dnb-score p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🟦 ${ctx.t("Người chơi 2", "Player 2")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${points[1]}</b>
        </div>
      `;
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t(`Đối thủ đang nối cạnh... (P1 ${points[0]} – P2 ${points[1]})`, `Opponent is drawing... (P1 ${points[0]} – P2 ${points[1]})`));
      else ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}: bấm một cạnh trống để nối.`, `Player ${turn + 1}'s turn: click an empty edge to draw.`));
    }

    function finish() {
      over = true;
      renderHeader();
      ctx.setTurn(-1);
      const a = points[0], b = points[1];
      if (a > b) ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng ${a}–${b}!`, `🎉 Player 1 wins ${a}–${b}!`));
      else if (b > a) ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng ${b}–${a}!`, `🎉 Player 2 wins ${b}–${a}!`));
      else ctx.setStatus(ctx.t(`🤝 Hòa ${a}–${b}!`, `🤝 Draw ${a}–${b}!`));
    }

    function clampInt(v, min, max, def) {
      const n = Number(v);
      if (!Number.isFinite(n)) return def;
      return Math.max(min, Math.min(max, Math.round(n)));
    }

    function undo() {
      if (!moveStack.length) return false;
      const e = moveStack.pop();
      const m = e.m;
      // gỡ cạnh
      if (m.type === "h") hEdges[m.r][m.c] = false; else vEdges[m.r][m.c] = false;
      if (e.el) e.el.className = m.type === "h" ? "dnb-h" : "dnb-v";
      // hoàn các ô đã chiếm
      for (const bx of e.boxes) {
        owner[bx.br][bx.bc] = null;
        filled--;
        points[e.turnBefore] -= bx.val;
        for (let k = 0; k < bx.val; k++) ctx.decScore(e.turnBefore);
        const box = boxEls[bx.br][bx.bc];
        box.classList.remove("own-p1", "own-p2", "claimed");
        box.textContent = bx.isStar ? "⭐" : "";
      }
      over = false;
      turn = e.turnBefore;
      lastEl = null;
      renderHeader();
      ctx.setTurn(turn);
      updateStatus();
      return true;
    }

    // ----- AI: heuristic Dots & Boxes -----
    function sidesOf(br, bc) {
      let n = 0;
      if (hEdges[br][bc]) n++; if (hEdges[br + 1][bc]) n++;
      if (vEdges[br][bc]) n++; if (vEdges[br][bc + 1]) n++;
      return n;
    }
    function adjacentBoxes(m) {
      const out = [];
      if (m.type === "h") { if (m.r > 0) out.push([m.r - 1, m.c]); if (m.r < H) out.push([m.r, m.c]); }
      else { if (m.c > 0) out.push([m.r, m.c - 1]); if (m.c < W) out.push([m.r, m.c]); }
      return out;
    }
    function setEdgeSim(m, v) { if (m.type === "h") hEdges[m.r][m.c] = v; else vEdges[m.r][m.c] = v; }
    function moveCompletes(m) {
      setEdgeSim(m, true);
      let c = 0; for (const [br, bc] of adjacentBoxes(m)) if (sidesOf(br, bc) === 4) c++;
      setEdgeSim(m, false);
      return c;
    }
    function moveCreates3(m) {
      setEdgeSim(m, true);
      let bad = false; for (const [br, bc] of adjacentBoxes(m)) if (sidesOf(br, bc) === 3) bad = true;
      setEdgeSim(m, false);
      return bad;
    }
    function aiMove(level) {
      if (over) return null;
      const free = [];
      for (let r = 0; r <= H; r++) for (let c = 0; c < W; c++) if (!hEdges[r][c]) free.push({ type: "h", r, c });
      for (let r = 0; r < H; r++) for (let c = 0; c <= W; c++) if (!vEdges[r][c]) free.push({ type: "v", r, c });
      if (!free.length) return null;
      if (level === "easy" && Math.random() < 0.5) return free[Math.floor(Math.random() * free.length)];
      // 1) ăn ô nếu được (ưu tiên ăn nhiều nhất)
      const completing = free.filter((m) => moveCompletes(m) > 0);
      if (completing.length) { completing.sort((a, b) => moveCompletes(b) - moveCompletes(a)); return completing[0]; }
      // 2) nước an toàn: không tạo ô 3 cạnh cho đối thủ
      const safe = free.filter((m) => !moveCreates3(m));
      if (safe.length) return safe[Math.floor(Math.random() * safe.length)];
      // 3) buộc phải hi sinh: đi đại (Khó vẫn chấp nhận, có thể tối ưu chuỗi sau)
      return free[Math.floor(Math.random() * free.length)];
    }

    ctx.setTurn(0);
    renderHeader();
    updateStatus();
    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "dotsandboxes",
    name: "Nối Ô (Dots & Boxes)",
    emoji: "🔲",
    description: "Nối các cạnh giữa chấm, hoàn thành ô vuông để chiếm và đi tiếp. Tùy chỉnh kích thước map và có ô thưởng ⭐.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "cols", label: "Số ô ngang", default: 5,
        choices: [
          { value: 4, label: "4" }, { value: 5, label: "5" }, { value: 6, label: "6" },
          { value: 7, label: "7" }, { value: 8, label: "8" },
        ],
      },
      {
        id: "rows", label: "Số ô dọc", default: 5,
        choices: [
          { value: 4, label: "4" }, { value: 5, label: "5" }, { value: 6, label: "6" },
          { value: 7, label: "7" }, { value: 8, label: "8" },
        ],
      },
      {
        id: "bonus", label: "Ô thưởng ⭐", default: "few",
        choices: [
          { value: "off", label: "Tắt" },
          { value: "few", label: "Ít (~10%)" },
          { value: "many", label: "Nhiều (~20%)" },
        ],
      },
    ],
    howTo: [
      "Bàn gồm lưới các chấm. Đến lượt mình, bấm vào một cạnh trống (đoạn giữa 2 chấm cạnh nhau) để vẽ nó.",
      "Khi cạnh bạn vừa vẽ khép kín một ô vuông, bạn chiếm ô đó (ghi số của mình) và được đi THÊM một lượt nữa — vẽ liền nhiều ô là COMBO.",
      "Nếu cạnh vừa vẽ không khép ô nào thì chuyển lượt cho đối thủ.",
      "⭐ Ô thưởng đáng giá 2 điểm thay vì 1 — hãy tranh giành những ô này!",
      "Tùy chỉnh map ở phần tùy chọn: chọn số ô NGANG và DỌC (4–8 mỗi chiều, có thể làm bàn chữ nhật) và mật độ ô thưởng.",
      "Mẹo: cố ép đối thủ phải vẽ cạnh thứ 3 của một ô, để bạn vẽ cạnh thứ 4 và chiếm ô. Khi hết cạnh, ai nhiều điểm hơn sẽ thắng.",
    ],
    create,
  });
})();
