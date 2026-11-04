/* Kamisado — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn 8x8, mỗi ô có 1 trong 8 MÀU (bảng màu chuẩn). Mỗi bên có 8 quân,
   mỗi quân mang một màu, xếp ở hàng nhà.
   - Quân đi THẲNG hoặc CHÉO về phía sân đối thủ (không lùi, không ngang),
     bao xa tùy ý, không nhảy qua quân khác.
   - Sau mỗi nước, MÀU của ô vừa đáp ÉP đối thủ phải đi đúng quân MÀU ĐÓ.
   - THẮNG khi đưa một quân tới hàng cuối cùng của đối thủ (gọi là "chạm đích").
   - Nếu quân bị ép không có nước đi: bị "kẹt", lượt bật ngược lại đối thủ với
     màu của chính ô quân kẹt đang đứng (luật deadlock đơn giản hóa).
   P1 ở hàng dưới (đi LÊN, r giảm), P2 ở hàng trên (đi XUỐNG, r tăng). */
(function () {
  const N = 8;
  // 8 màu
  const COLORS = ["#e8514f", "#f08c34", "#f4d03f", "#3fae5a", "#3fb6c9", "#3f6fd6", "#8e5bd0", "#c94f8e"];
  const CNAME = [
    ["Đỏ", "Red"], ["Cam", "Orange"], ["Vàng", "Yellow"], ["Lục", "Green"],
    ["Xanh lơ", "Cyan"], ["Lam", "Blue"], ["Tím", "Purple"], ["Hồng", "Pink"],
  ];
  // Bảng màu Kamisado chuẩn (8x8), giá trị = chỉ số màu. Hàng 0 ở trên.
  const BOARD_COLORS = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [5, 0, 3, 6, 1, 4, 7, 2],
    [6, 3, 0, 5, 2, 7, 4, 1],
    [3, 2, 1, 0, 7, 6, 5, 4],
    [4, 5, 6, 7, 0, 1, 2, 3],
    [1, 4, 7, 2, 5, 0, 3, 6],
    [2, 7, 4, 1, 6, 3, 0, 5],
    [7, 6, 5, 4, 3, 2, 1, 0],
  ];

  function create(ctx) {
    // pieces[p] = mảng 8 quân {r,c,color}; color = chỉ số màu 0..7
    // board cell -> {p, idx} hoặc null
    let occ = Array.from({ length: N }, () => Array(N).fill(null));
    const pieces = [[], []];
    // P2 (trên, hàng 0): màu theo BOARD_COLORS hàng 0 (trái->phải 0..7)
    for (let c = 0; c < N; c++) {
      pieces[1].push({ r: 0, c, color: BOARD_COLORS[0][c] });
      occ[0][c] = { p: 1, idx: c };
    }
    // P1 (dưới, hàng 7): màu theo BOARD_COLORS hàng 7 để đối xứng (mỗi bên đủ 8 màu)
    for (let c = 0; c < N; c++) {
      pieces[0].push({ r: N - 1, c, color: BOARD_COLORS[N - 1][c] });
      occ[N - 1][c] = { p: 0, idx: c };
    }

    let turn = 0;
    let forcedColor = -1;   // màu bị ép (-1 = tự do, chỉ ở nước đầu)
    let selected = null;    // {p, idx}
    let over = false;
    let lastMove = null;    // {from:[r,c], to:[r,c]}
    let winPiece = null;    // [r,c] quân thắng (tô sáng)

    const root = document.createElement("div");
    root.className = "kam-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "kam-hud";
    root.appendChild(hud);

    const wrap = document.createElement("div");
    wrap.className = "kam-wrap";
    const grid = document.createElement("div");
    grid.className = "kam-board";
    wrap.appendChild(grid);
    root.appendChild(wrap);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "kam-cell";
        cell.style.background = COLORS[BOARD_COLORS[r][c]];
        const rr = r, cc = c;
        cell.addEventListener("click", () => onClick(rr, cc));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    // hướng tiến của p: P1 đi lên (dr=-1), P2 đi xuống (dr=+1)
    function fwd(p) { return p === 0 ? -1 : 1; }
    function goalRow(p) { return p === 0 ? 0 : N - 1; }

    // các nước đi của 1 quân (thẳng tiến + 2 chéo tiến), không nhảy
    function pieceMoves(p, idx) {
      const pc = pieces[p][idx];
      const dr = fwd(p);
      const dirs = [[dr, 0], [dr, -1], [dr, 1]];
      const out = [];
      for (const [ddr, ddc] of dirs) {
        let r = pc.r + ddr, c = pc.c + ddc;
        while (inB(r, c) && !occ[r][c]) {
          out.push([r, c]);
          r += ddr; c += ddc;
        }
      }
      return out;
    }

    // quân bị ép theo màu (hoặc quân được chọn ở nước đầu)
    function forcedPiece(p) {
      if (p < 0 || !pieces[p]) return -1;
      if (forcedColor < 0) return -1;
      return pieces[p].findIndex((pc) => pc.color === forcedColor);
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function selectablePieces(p) {
      if (p < 0 || !pieces[p]) return [];
      const fp = forcedPiece(p);
      if (fp >= 0) return [fp];
      // nước đầu: được chọn quân bất kỳ
      return pieces[p].map((_, i) => i);
    }

    function onClick(r, c) {
      if (!canPlay()) return;
      const cellPiece = occ[r][c];
      // chọn quân của mình (nằm trong danh sách được phép)
      if (cellPiece && cellPiece.p === turn) {
        const allowed = selectablePieces(turn);
        if (allowed.includes(cellPiece.idx)) {
          selected = { p: turn, idx: cellPiece.idx };
          render();
        } else if (forcedColor >= 0) {
          // bấm nhầm quân không bị ép -> nhắc rõ
          const cn = ctx.t(CNAME[forcedColor][0], CNAME[forcedColor][1]);
          ctx.setStatus(ctx.t(
            `⛔ Lượt này bạn BỊ ÉP đi quân màu ${cn} (quân sáng viền) — không chọn quân khác được.`,
            `⛔ This turn you're FORCED to move your ${cn} tower (the glowing one) — you can't pick another.`));
        }
        return;
      }
      // di chuyển tới ô trống nếu hợp lệ
      if (selected) {
        const ms = pieceMoves(selected.p, selected.idx);
        if (ms.some(([mr, mc]) => mr === r && mc === c)) {
          applyMove({ p: selected.p, idx: selected.idx, to: [r, c] }, false);
        }
      }
    }

    // tự động chọn sẵn quân bị ép (chỉ có 1 quân) để người chơi chỉ cần bấm ô đích
    function autoSelectForced() {
      if (over) { selected = null; return; }
      if (ctx.isOnline && turn !== ctx.mySeat) { selected = null; return; }
      const allowed = selectablePieces(turn);
      if (forcedColor >= 0 && allowed.length === 1) {
        selected = { p: turn, idx: allowed[0] };
      } else {
        selected = null;
      }
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const p = move.p, idx = move.idx, [tr, tc] = move.to;
      const pc = pieces[p][idx];
      occ[pc.r][pc.c] = null;
      pc.r = tr; pc.c = tc;
      occ[tr][tc] = { p, idx };
      lastMove = { from: move.from ? move.from.slice() : null, to: [tr, tc] };
      selected = null;
      if (!fromRemote) ctx.sendMove({ p, idx, to: [tr, tc] });
      ctx.sound("place");

      // thắng: tới hàng đích đối thủ
      if (tr === goalRow(p)) {
        over = true;
        winPiece = [tr, tc];
        render();
        ctx.incScore(p);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${p + 1} thắng — đã đưa quân chạm đích!`,
          `🎉 Player ${p + 1} wins — a tower reached the home row!`));
        return;
      }

      // màu ô vừa đáp ép đối thủ
      let next = 1 - p;
      forcedColor = BOARD_COLORS[tr][tc];

      // xử lý kẹt: nếu quân bị ép của 'next' không có nước đi
      let guard = 0;
      while (true) {
        const fp = forcedPiece(next);
        if (fp < 0) break; // không bị ép (không xảy ra giữa ván) -> dừng
        if (pieceMoves(next, fp).length > 0) break; // có nước -> ok
        // bị kẹt: lượt bật ngược lại, màu = màu ô quân kẹt đang đứng
        const stuck = pieces[next][fp];
        forcedColor = BOARD_COLORS[stuck.r][stuck.c];
        next = 1 - next;
        if (++guard > 4) {
          // cả hai cùng kẹt -> hòa
          over = true;
          render();
          ctx.setStatus(ctx.t("🤝 Hòa — cả hai bên đều bị kẹt!", "🤝 Draw — both sides are deadlocked!"));
          ctx.setTurn(-1);
          return;
        }
      }

      turn = next;
      autoSelectForced();
      render();
      ctx.setTurn(turn);
      updateStatus();
    }

    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const fc = forcedColor >= 0
        ? `<span class="kam-swatch" style="background:${COLORS[forcedColor]}"></span>${ctx.t(CNAME[forcedColor][0], CNAME[forcedColor][1])}`
        : ctx.t("tự do", "free");
      hud.innerHTML = `
        <div class="kam-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>⬜ ${ctx.t("Người 1", "P1")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
        </div>
        <div class="kam-mid">${over ? "🏁" : ctx.t("Màu ép: ", "Forced: ") + fc}</div>
        <div class="kam-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>⬛ ${ctx.t("Người 2", "P2")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
        </div>`;
    }

    function render() {
      renderHud();
      const moveSet = new Set();
      if (selected) pieceMoves(selected.p, selected.idx).forEach(([r, c]) => moveSet.add(r * N + c));
      const sel = selectablePieces(canPlay() ? turn : -1);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cellEls[r][c];
          cell.innerHTML = "";
          cell.classList.remove("hint", "lastfrom", "lastto", "pickable");
          if (lastMove) {
            if (lastMove.from && lastMove.from[0] === r && lastMove.from[1] === c) cell.classList.add("lastfrom");
            if (lastMove.to && lastMove.to[0] === r && lastMove.to[1] === c) cell.classList.add("lastto");
          }
          const o = occ[r][c];
          if (o) {
            const pc = pieces[o.p][o.idx];
            const tower = document.createElement("div");
            tower.className = "kam-tower " + (o.p === 0 ? "p1" : "p2");
            tower.style.setProperty("--cl", COLORS[pc.color]);
            if (selected && selected.p === o.p && selected.idx === o.idx) tower.classList.add("sel");
            if (winPiece && winPiece[0] === r && winPiece[1] === c) tower.classList.add("win");
            // quân được phép chọn (đang tới lượt)
            if (!over && o.p === turn && (!ctx.isOnline || turn === ctx.mySeat) && sel.includes(o.idx)) {
              tower.classList.add("pickable");
            }
            cell.appendChild(tower);
          }
          if (moveSet.has(r * N + c)) cell.classList.add("hint");
        }
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      if (forcedColor < 0) {
        ctx.setStatus(ctx.t(
          `Người chơi ${turn + 1}: nước đầu — chọn quân BẤT KỲ rồi đi tiến (thẳng/chéo) về phía đối thủ.`,
          `Player ${turn + 1}: first move — pick ANY tower then move it forward (straight/diagonal).`));
        return;
      }
      const cn = ctx.t(CNAME[forcedColor][0], CNAME[forcedColor][1]);
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1}: bị ép đi quân màu ${cn} (đã chọn sẵn) — bấm một ô SÁNG để đi.`,
        `Player ${turn + 1}: forced to move your ${cn} tower (already selected) — click a LIT cell to move.`));
    }

    // ---------- AI ----------
    // đánh giá đơn giản: tiến độ về đích + dọa thắng
    function evalMove(p, idx, to) {
      const [tr] = to;
      if (tr === goalRow(p)) return 1000;
      // càng gần hàng đích càng tốt
      const dist = p === 0 ? tr : (N - 1 - tr);
      let score = (N - 1 - dist) * 2;
      // tránh đẩy đối thủ vào nước thắng ngay: nếu ô đáp ép màu mà quân địch tương ứng tới đích được -> trừ nặng
      const fc = BOARD_COLORS[to[0]][to[1]];
      const oppIdx = pieces[1 - p].findIndex((pc) => pc.color === fc);
      if (oppIdx >= 0) {
        const opc = pieces[1 - p][oppIdx];
        // mô phỏng nhanh: nếu quân địch màu fc đang ở gần đích & đường thẳng trống
        const odr = fwd(1 - p);
        let r = opc.r + odr, c = opc.c, reach = false;
        // chỉ kiểm tra cột thẳng cho rẻ
        // (đánh giá heuristic, không cần chính xác tuyệt đối)
        while (inB(r, c)) {
          if (occ[r][c] && !(occ[r][c].p === p && occ[r][c].idx === idx)) break;
          if (r === goalRow(1 - p)) { reach = true; break; }
          r += odr;
        }
        if (reach) score -= 50;
      }
      return score;
    }
    function aiMove(level) {
      if (over) return null;
      const p = turn;
      const sel = selectablePieces(p);
      const cand = [];
      for (const idx of sel) {
        for (const to of pieceMoves(p, idx)) cand.push({ p, idx, to });
      }
      if (!cand.length) return null;
      if (level === "easy" && Math.random() < 0.5) return cand[Math.floor(Math.random() * cand.length)];
      // ưu tiên thắng ngay
      for (const m of cand) if (m.to[0] === goalRow(p)) return m;
      let best = -Infinity, pick = cand[0];
      for (const m of cand) {
        let sc = evalMove(m.p, m.idx, m.to) + Math.random() * 0.5;
        if (sc > best) { best = sc; pick = m; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1", "Player 1"), ctx.t("Người chơi 2", "Player 2"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "kamisado",
    name: "Kamisado",
    emoji: "🎨",
    description: "Cờ ép màu dây chuyền: quân đi như hậu tiến về phía địch, màu của ô bạn vừa dừng sẽ ÉP đối thủ phải đi đúng quân màu đó. Đưa một quân chạm hàng cuối của địch để thắng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Bàn 8×8, mỗi ô có 1 trong 8 màu. Mỗi bên có 8 quân, mỗi quân mang một màu riêng, xếp ở hàng nhà. Người chơi 1 ở dưới (đi LÊN), Người chơi 2 ở trên (đi XUỐNG).",
      "Quân đi THẲNG hoặc CHÉO về phía sân đối thủ, xa tùy ý, KHÔNG lùi, KHÔNG đi ngang, và không nhảy qua quân khác.",
      "LUẬT CỐT LÕI: sau mỗi nước, MÀU của ô bạn vừa dừng sẽ ÉP đối thủ — họ buộc phải đi đúng quân mang MÀU ĐÓ (quân được tô sáng viền).",
      "Nước đi ĐẦU TIÊN của ván được chọn quân bất kỳ. Từ đó trở đi luôn bị ràng buộc theo màu.",
      "THẮNG ngay khi đưa được một quân tới HÀNG CUỐI cùng phía đối thủ (chạm đích).",
      "Nếu quân bị ép không còn nước đi, nó bị 'kẹt': lượt bật ngược lại đối thủ theo màu ô mà quân kẹt đang đứng. Nếu cả hai cùng kẹt thì hòa.",
    ],
    create,
  });
})();
