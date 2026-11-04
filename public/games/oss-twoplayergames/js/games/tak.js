/* Tak — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   Bàn NxN. Mỗi ô là một CHỒNG quân. Ba kiểu quân:
   - Phẳng (flat): nằm ngang, TÍNH vào "đường" (road) và đếm điểm cuối ván.
   - Tường (wall/standing): dựng đứng, KHÔNG tính đường, dùng để CHẶN.
   - Đá trùm (capstone): tính đường, và có thể ĐÈ BẸP một Tường (đi một mình).
   Mỗi lượt: ĐẶT 1 quân mới lên ô trống, HOẶC KÉO một chồng mình kiểm soát
   theo đường thẳng, rải bớt quân xuống từng ô (luật "carry limit" = cỡ bàn).
   Nước đầu mỗi bên đặt 1 quân PHẲNG của ĐỐI THỦ (luật swap).
   THẮNG: nối "đường" quân phẳng/đá trùm của mình giữa hai mép đối diện.
   Hết quân hoặc bàn đầy -> đếm số quân phẳng trên đỉnh, nhiều hơn thắng. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // số quân theo cỡ bàn: [flats, caps]
  const SUPPLY = { 3: [10, 0], 4: [15, 0], 5: [21, 1], 6: [30, 1] };

  function create(ctx) {
    const o = ctx.options || {};
    const N = [4, 5].includes(Number(o.size)) ? Number(o.size) : 5;
    const CARRY = N;
    const [FLATS0, CAPS0] = SUPPLY[N];

    // board[r][c] = mảng quân từ ĐÁY -> ĐỈNH; mỗi quân = {p, s:"flat"|"wall"|"cap"}
    let board = Array.from({ length: N }, () => Array.from({ length: N }, () => []));
    let turn = 0;
    let plies = 0;            // số lượt đã hoàn tất (để xử lý 2 nước swap đầu)
    let over = false;
    let lastCells = [];       // các ô vừa tác động (highlight)
    let winCells = [];        // các ô tạo đường thắng (để tô sáng khi kết thúc)
    const supply = [
      { flat: FLATS0, cap: CAPS0 },
      { flat: FLATS0, cap: CAPS0 },
    ];
    // trạng thái kéo chồng đang dựng (UI): null hoặc {origin:[r,c], hand:[pieces], dir, cur:[r,c], moved:false}
    let drag = null;
    let placeKind = "flat";   // kiểu quân định đặt (UI)

    const root = document.createElement("div");
    root.className = "tak-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "tak-hud";
    root.appendChild(hud);

    const toolbar = document.createElement("div");
    toolbar.className = "tak-tools";
    root.appendChild(toolbar);

    const wrap = document.createElement("div");
    wrap.className = "tak-wrap";
    const grid = document.createElement("div");
    grid.className = "tak-board";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    wrap.appendChild(grid);
    root.appendChild(wrap);

    const cellEls = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "tak-cell";
        const rr = r, cc = c;
        cell.addEventListener("click", () => onCellClick(rr, cc));
        grid.appendChild(cell);
        cellEls[r][c] = cell;
      }
    }

    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function topAt(B, r, c) { const a = B[r][c]; return a.length ? a[a.length - 1] : null; }
    function isRoadTop(t) { return t && (t.s === "flat" || t.s === "cap"); }

    // ---------- phát hiện "đường" (road) ----------
    function hasRoad(B, p) {
      const seen = Array.from({ length: N }, () => Array(N).fill(false));
      const stack = [];
      // bắt đầu từ mép trên (hàng 0) cho đường DỌC, và mép trái (cột 0) cho đường NGANG
      // gom chung: kiểm tra dọc rồi ngang
      function flood(seeds, isGoal) {
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) seen[i][j] = false;
        stack.length = 0;
        for (const [sr, sc] of seeds) {
          const t = topAt(B, sr, sc);
          if (isRoadTop(t) && t.p === p && !seen[sr][sc]) { seen[sr][sc] = true; stack.push([sr, sc]); }
        }
        while (stack.length) {
          const [r, c] = stack.pop();
          if (isGoal(r, c)) return true;
          for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (!inB(nr, nc) || seen[nr][nc]) continue;
            const t = topAt(B, nr, nc);
            if (isRoadTop(t) && t.p === p) { seen[nr][nc] = true; stack.push([nr, nc]); }
          }
        }
        return false;
      }
      const topSeeds = Array.from({ length: N }, (_, c) => [0, c]);
      if (flood(topSeeds, (r) => r === N - 1)) return true;
      const leftSeeds = Array.from({ length: N }, (_, r) => [r, 0]);
      if (flood(leftSeeds, (_, c) => c === N - 1)) return true;
      return false;
    }

    // trả về danh sách ô tạo nên ĐƯỜNG thắng (để tô sáng), hoặc [] nếu không có
    function roadCells(B, p) {
      function bfsPath(seeds, isGoal) {
        const prev = {};
        const seen = Array.from({ length: N }, () => Array(N).fill(false));
        const queue = [];
        for (const [sr, sc] of seeds) {
          const t = topAt(B, sr, sc);
          if (isRoadTop(t) && t.p === p && !seen[sr][sc]) { seen[sr][sc] = true; queue.push([sr, sc]); prev[sr + "," + sc] = null; }
        }
        let head = 0;
        while (head < queue.length) {
          const [r, c] = queue[head++];
          if (isGoal(r, c)) {
            const path = []; let cur = [r, c];
            while (cur) { path.push(cur); cur = prev[cur[0] + "," + cur[1]]; }
            return path;
          }
          for (const [dr, dc] of DIRS) {
            const nr = r + dr, nc = c + dc;
            if (!inB(nr, nc) || seen[nr][nc]) continue;
            const t = topAt(B, nr, nc);
            if (isRoadTop(t) && t.p === p) { seen[nr][nc] = true; prev[nr + "," + nc] = [r, c]; queue.push([nr, nc]); }
          }
        }
        return null;
      }
      const topSeeds = Array.from({ length: N }, (_, c) => [0, c]);
      const v = bfsPath(topSeeds, (r) => r === N - 1);
      if (v) return v;
      const leftSeeds = Array.from({ length: N }, (_, r) => [r, 0]);
      const h = bfsPath(leftSeeds, (_, c) => c === N - 1);
      return h || [];
    }

    function boardFull(B) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!B[r][c].length) return false;
      return true;
    }
    function flatCount(B, p) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = topAt(B, r, c);
        if (t && t.p === p && t.s === "flat") n++;
      }
      return n;
    }
    function supplyEmpty(p) { return supply[p].flat <= 0 && supply[p].cap <= 0; }

    // ---------- sinh nước hợp lệ ----------
    function placementMoves(B, p) {
      const out = [];
      const first = plies < 2;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (B[r][c].length) continue;
        if (first) { out.push({ place: "flat", r, c }); continue; }
        if (supply[p].flat > 0) { out.push({ place: "flat", r, c }); out.push({ place: "wall", r, c }); }
        if (supply[p].cap > 0) out.push({ place: "cap", r, c });
      }
      return out;
    }
    // mọi cách rải `pick` quân thành các phần dương theo path dài tối đa L ô
    function compositions(pick, maxLen) {
      const res = [];
      function rec(rem, len, cur) {
        if (rem === 0) { res.push(cur.slice()); return; }
        if (len === maxLen) return;
        for (let d = 1; d <= rem; d++) { cur.push(d); rec(rem - d, len + 1, cur); cur.pop(); }
      }
      rec(pick, 0, []);
      return res;
    }
    function lineLen(B, r, c, dr, dc) {
      let n = 0, cr = r + dr, cc = c + dc;
      while (inB(cr, cc)) { n++; cr += dr; cc += dc; }
      return n;
    }
    // kiểm tra 1 nước kéo chồng có hợp lệ không (drops: rải vào các ô liên tiếp theo dir)
    function validateStackMove(B, r, c, dir, drops, p) {
      const [dr, dc] = dir;
      const pick = drops.reduce((a, b) => a + b, 0);
      if (pick < 1 || pick > CARRY) return false;
      const a = B[r][c];
      if (!a.length || a[a.length - 1].p !== p) return false;
      if (pick > a.length) return false;
      const carried = a.slice(a.length - pick); // đáy->đỉnh của phần nhấc lên
      let cr = r, cc = c;
      for (let i = 0; i < drops.length; i++) {
        cr += dr; cc += dc;
        if (!inB(cr, cc)) return false;
        const dest = topAt(B, cr, cc);
        const isLast = i === drops.length - 1;
        if (dest && dest.s === "cap") return false; // không bao giờ đè được đá trùm
        if (dest && dest.s === "wall") {
          // chỉ đè bẹp được nếu: ô cuối, chỉ thả 1 quân, và quân đó là đá trùm
          const dropPiece = carried[carried.length - 1]; // quân trên cùng được thả cuối
          if (!(isLast && drops[i] === 1 && dropPiece.s === "cap")) return false;
        }
      }
      return true;
    }
    function stackMoves(B, p) {
      const out = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const a = B[r][c];
        if (!a.length || a[a.length - 1].p !== p) continue;
        const maxPick = Math.min(a.length, CARRY);
        for (const [dr, dc] of DIRS) {
          const L = lineLen(B, r, c, dr, dc);
          if (!L) continue;
          for (let pick = 1; pick <= maxPick; pick++) {
            for (const drops of compositions(pick, L)) {
              if (validateStackMove(B, r, c, [dr, dc], drops, p)) {
                out.push({ from: [r, c], dir: [dr, dc], drops });
              }
            }
          }
        }
      }
      return out;
    }
    function legalMoves(B, p) {
      if (plies < 2) return placementMoves(B, p);
      return placementMoves(B, p).concat(stackMoves(B, p));
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    // ---------- áp dụng nước (dùng cho cả local, remote, AI) ----------
    function doMove(B, sup, p, move) {
      // biến đổi trực tiếp B/sup; trả về true nếu hợp lệ
      const first = (move._firstColor != null);
      if (move.place) {
        const owner = move._firstColor != null ? move._firstColor : p;
        B[move.r][move.c].push({ p: owner, s: move.place });
        if (!first) {
          if (move.place === "cap") sup[p].cap--; else sup[p].flat--;
        } else {
          // nước swap: lấy từ kho của CHỦ quân (đối thủ)
          sup[owner].flat--;
        }
        return true;
      }
      const [r, c] = move.from, [dr, dc] = move.dir;
      const a = B[r][c];
      const pick = move.drops.reduce((x, y) => x + y, 0);
      const carried = a.splice(a.length - pick, pick); // đáy->đỉnh
      let idx = 0, cr = r, cc = c;
      for (const d of move.drops) {
        cr += dr; cc += dc;
        for (let k = 0; k < d; k++) {
          const piece = carried[idx++];
          const dest = B[cr][cc];
          const below = dest.length ? dest[dest.length - 1] : null;
          if (below && below.s === "wall") below.s = "flat"; // đá trùm đè bẹp tường
          dest.push(piece);
        }
      }
      return true;
    }

    function affectedCells(move) {
      if (move.place) return [[move.r, move.c]];
      const cells = [move.from.slice()];
      let [cr, cc] = move.from; const [dr, dc] = move.dir;
      for (let i = 0; i < move.drops.length; i++) { cr += dr; cc += dc; cells.push([cr, cc]); }
      return cells;
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const p = turn;
      // 2 nước đầu: đặt quân PHẲNG của đối thủ (swap rule)
      const isSwap = plies < 2;
      const m = Object.assign({}, move);
      if (isSwap && m.place) m._firstColor = 1 - p;

      if (!doMove(board, supply, p, m)) return;
      lastCells = affectedCells(m);
      if (!fromRemote) ctx.sendMove(move);
      ctx.sound(move.place ? "place" : "capture");
      plies++;
      drag = null;

      // kiểm tra thắng bằng đường — ưu tiên người vừa đi; nếu nước tạo đường cho cả hai, người đi thắng
      const meRoad = hasRoad(board, p);
      const oppRoad = hasRoad(board, 1 - p);
      if (meRoad || oppRoad) {
        over = true;
        const winner = meRoad ? p : (1 - p);
        winCells = roadCells(board, winner);
        render();
        ctx.incScore(winner);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${winner + 1} thắng — đã nối ĐƯỜNG xuyên bàn!`,
          `🎉 Player ${winner + 1} wins — completed a ROAD across the board!`));
        return;
      }

      // hết quân hoặc bàn đầy -> đếm cờ phẳng (flat count)
      if (boardFull(board) || supplyEmpty(0) || supplyEmpty(1)) {
        over = true;
        render();
        const f0 = flatCount(board, 0), f1 = flatCount(board, 1);
        if (f0 === f1) {
          ctx.setStatus(ctx.t(`🤝 Hòa — bằng cờ phẳng (${f0}-${f1}).`, `🤝 Draw — equal flats (${f0}-${f1}).`));
        } else {
          const winner = f0 > f1 ? 0 : 1;
          ctx.incScore(winner);
          ctx.setStatus(ctx.t(
            `🎉 Người chơi ${winner + 1} thắng đếm cờ phẳng ${Math.max(f0, f1)}-${Math.min(f0, f1)}!`,
            `🎉 Player ${winner + 1} wins the flat count ${Math.max(f0, f1)}-${Math.min(f0, f1)}!`));
        }
        ctx.setTurn(-1);
        return;
      }

      turn = 1 - turn;
      render();
      ctx.setTurn(turn);
      updateStatus();
    }

    // ---------- tương tác UI ----------
    function onCellClick(r, c) {
      if (!canPlay()) return;
      // đang kéo một chồng: bấm ô kế tiếp theo hướng để rải 1 quân; bấm lại ô hiện tại để kết thúc
      if (drag) {
        // kết thúc nếu bấm vào ô cuối đã rải (và đã di chuyển ít nhất 1 bước)
        if (drag.moved && r === drag.cur[0] && c === drag.cur[1]) {
          finishDrag();
          return;
        }
        const [dr, dc] = [r - drag.cur[0], c - drag.cur[1]];
        const isStep = (Math.abs(dr) + Math.abs(dc) === 1);
        if (!isStep) { // bấm linh tinh -> hủy kéo
          drag = null; render(); updateStatus(); return;
        }
        const dir = [dr, dc];
        if (drag.dir && (dir[0] !== drag.dir[0] || dir[1] !== drag.dir[1])) {
          // đã cố định hướng, bấm khác hướng -> bỏ qua
          return;
        }
        // kiểm tra ô đích có hợp lệ để thả không
        const dest = topAt(board, r, c);
        if (dest && dest.s === "cap") { return; }
        if (dest && dest.s === "wall") {
          const top = drag.hand[drag.hand.length - 1];
          const lastOne = drag.hand.length === 1;
          if (!(lastOne && top.s === "cap")) return; // chỉ đá trùm đơn lẻ đè được tường
        }
        drag.dir = dir;
        drag.drops.push(1);
        drag.cur = [r, c];
        drag.moved = true;
        drag.hand.pop();
        if (!drag.hand.length) { finishDrag(); return; }
        renderDrag();
        updateStatus();
        return;
      }

      const a = board[r][c];
      const t = topAt(board, r, c);
      // ĐẶT quân khi ô trống
      if (!a.length) {
        if (plies < 2) { applyMove({ place: "flat", r, c }, false); return; }
        applyMove({ place: placeKind, r, c }, false);
        return;
      }
      // bắt đầu KÉO chồng nếu mình kiểm soát đỉnh (sau giai đoạn swap)
      if (plies >= 2 && t && t.p === turn) {
        const maxPick = Math.min(a.length, CARRY);
        const pickN = Math.min(maxPick, pickCount);
        drag = {
          origin: [r, c],
          start: [r, c],
          cur: [r, c],
          dir: null,
          drops: [],
          moved: false,
          hand: a.slice(a.length - pickN), // đáy->đỉnh phần nhấc lên
          total: pickN,
        };
        renderDrag();
        updateStatus();
        return;
      }
    }

    let pickCount = 1; // số quân muốn nhấc khi bắt đầu kéo (chỉnh ở thanh công cụ)

    function finishDrag() {
      if (!drag || !drag.moved) { drag = null; render(); updateStatus(); return; }
      applyMove({ from: drag.start.slice(), dir: drag.dir.slice(), drops: drag.drops.slice() }, false);
    }

    // ---------- thanh công cụ ----------
    function renderTools() {
      const myTurn = !over && (!ctx.isOnline || turn === ctx.mySeat);
      toolbar.innerHTML = "";
      if (drag) {
        const info = document.createElement("span");
        info.className = "tak-hint";
        info.textContent = ctx.t(
          `Đang kéo ${drag.total} quân — bấm ô kế tiếp theo 1 hướng để rải, bấm lại ô cuối để kết thúc.`,
          `Carrying ${drag.total} — click the next cell along one line to drop, click the last cell again to finish.`);
        toolbar.appendChild(info);
        const cancel = document.createElement("button");
        cancel.className = "tak-btn";
        cancel.textContent = ctx.t("Hủy kéo", "Cancel");
        cancel.addEventListener("click", () => { drag = null; render(); updateStatus(); });
        toolbar.appendChild(cancel);
        return;
      }
      if (!myTurn || plies < 2) return;
      // nhãn nhóm "Đặt"
      const placeLbl = document.createElement("span");
      placeLbl.className = "tak-grp";
      placeLbl.textContent = ctx.t("Đặt:", "Place:");
      toolbar.appendChild(placeLbl);
      // chọn kiểu quân đặt
      const TIPS = {
        flat: ["Phẳng — nằm ngang, TÍNH vào đường thắng & đếm điểm", "Flat — lies flat, counts for the road & scoring"],
        wall: ["Tường — dựng đứng, CHẶN đường địch (không tính đường)", "Wall — stands up, BLOCKS roads (doesn't count)"],
        cap: ["Đá trùm — tính đường, và ĐÈ BẸP được Tường", "Capstone — counts for roads, and can flatten a Wall"],
      };
      const mk = (kind, label, dis) => {
        const b = document.createElement("button");
        b.className = "tak-btn" + (placeKind === kind ? " on" : "");
        b.disabled = !!dis;
        b.textContent = label;
        b.title = ctx.t(TIPS[kind][0], TIPS[kind][1]);
        b.addEventListener("click", () => { placeKind = kind; renderTools(); updateStatus(); });
        toolbar.appendChild(b);
      };
      mk("flat", ctx.t("Phẳng ▭", "Flat ▭"), supply[turn].flat <= 0);
      mk("wall", ctx.t("Tường ◧", "Wall ◧"), supply[turn].flat <= 0);
      if (SUPPLY[N][1] > 0) mk("cap", ctx.t("Đá trùm ⬢", "Capstone ⬢"), supply[turn].cap <= 0);
      // chú thích kiểu quân đang chọn
      const tip = document.createElement("span");
      tip.className = "tak-hint tak-tip";
      tip.textContent = ctx.t(TIPS[placeKind][0], TIPS[placeKind][1]);
      toolbar.appendChild(tip);
      // chọn số quân nhấc khi kéo
      const pc = document.createElement("span");
      pc.className = "tak-grp";
      pc.textContent = ctx.t(`Kéo (nhấc ${pickCount}):`, `Move (pick ${pickCount}):`);
      pc.title = ctx.t("Số quân nhấc lên khi kéo một chồng", "How many stones to pick up when moving a stack");
      toolbar.appendChild(pc);
      for (let i = 1; i <= CARRY; i++) {
        const b = document.createElement("button");
        b.className = "tak-btn mini" + (pickCount === i ? " on" : "");
        b.textContent = i;
        b.addEventListener("click", () => { pickCount = i; renderTools(); });
        toolbar.appendChild(b);
      }
    }

    // ---------- render ----------
    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const sup = (p) => `${supply[p].flat}▭${SUPPLY[N][1] > 0 ? " · " + supply[p].cap + "⬢" : ""}`;
      hud.innerHTML = `
        <div class="tak-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🟦 ${ctx.t("Xanh", "Blue")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${sup(0)}</b>
        </div>
        <div class="tak-mid">${over ? "🏁" : "VS"}</div>
        <div class="tak-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🟧 ${ctx.t("Cam", "Orange")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${sup(1)}</b>
        </div>`;
    }

    function pieceHtml(piece, idxFromTop) {
      const cls = "tak-pc p" + (piece.p + 1) + " " + piece.s;
      return `<i class="${cls}" style="--o:${idxFromTop}"></i>`;
    }
    function renderCell(r, c, dragHighlight) {
      const cell = cellEls[r][c];
      cell.innerHTML = "";
      cell.classList.remove("last", "dragsrc", "dragtgt", "win");
      const a = board[r][c];
      // hiển thị tối đa vài quân trên cùng cho gọn
      const stack = document.createElement("div");
      stack.className = "tak-stack";
      const show = a.slice(-6);
      show.forEach((piece, i) => {
        const idxFromTop = show.length - 1 - i;
        stack.insertAdjacentHTML("afterbegin", pieceHtml(piece, idxFromTop));
      });
      if (a.length > 6) {
        const more = document.createElement("i");
        more.className = "tak-more";
        more.textContent = a.length;
        stack.appendChild(more);
      }
      cell.appendChild(stack);
      if (lastCells.some(([lr, lc]) => lr === r && lc === c)) cell.classList.add("last");
      if (winCells.some(([lr, lc]) => lr === r && lc === c)) cell.classList.add("win");
      if (dragHighlight && dragHighlight.has(r * N + c)) cell.classList.add("dragtgt");
      if (drag && drag.start[0] === r && drag.start[1] === c) cell.classList.add("dragsrc");
    }
    function render() {
      renderHud();
      renderTools();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c, null);
    }
    function renderDrag() {
      renderHud();
      renderTools();
      // gợi ý các ô có thể rải tiếp
      const tgt = new Set();
      if (drag) {
        const dirs = drag.dir ? [drag.dir] : DIRS;
        for (const [dr, dc] of dirs) {
          const nr = drag.cur[0] + dr, nc = drag.cur[1] + dc;
          if (!inB(nr, nc)) continue;
          const dest = topAt(board, nr, nc);
          if (dest && dest.s === "cap") continue;
          if (dest && dest.s === "wall") {
            const top = drag.hand[drag.hand.length - 1];
            if (!(drag.hand.length === 1 && top.s === "cap")) continue;
          }
          tgt.add(nr * N + nc);
        }
        if (drag.moved) tgt.add(drag.cur[0] * N + drag.cur[1]); // bấm lại để kết thúc
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) renderCell(r, c, tgt);
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      // đang kéo một chồng
      if (drag) {
        ctx.setStatus(ctx.t(
          `Đang kéo ${drag.total} quân — bấm ô SÁNG kế tiếp (theo 1 đường thẳng) để rải từng quân; bấm lại ô cuối để KẾT THÚC. Bấm ra ngoài để huỷ.`,
          `Carrying ${drag.total} — click the next LIT cell along one straight line to drop a stone; click the last cell again to FINISH. Click elsewhere to cancel.`));
        return;
      }
      // khai cuộc: đặt quân của đối thủ (luật swap)
      if (plies < 2) {
        ctx.setStatus(ctx.t(
          `Khai cuộc (luật đổi quân): Người chơi ${turn + 1} bấm 1 ô trống để đặt 1 quân Phẳng của ĐỐI THỦ. Lạ nhưng đúng luật — chỉ 2 nước đầu thôi!`,
          `Opening (swap rule): Player ${turn + 1}, click any empty cell to place one of the OPPONENT's flat stones. Odd but correct — just the first 2 moves!`));
        return;
      }
      const kindName = placeKind === "flat" ? ctx.t("Phẳng ▭", "Flat ▭") : placeKind === "wall" ? ctx.t("Tường ◧", "Wall ◧") : ctx.t("Đá trùm ⬢", "Capstone ⬢");
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1}: ĐẶT quân (đang chọn ${kindName} — đổi ở thanh trên) vào ô trống, HOẶC bấm chồng của mình rồi kéo. Mục tiêu: nối đường từ mép này sang mép kia.`,
        `Player ${turn + 1}: PLACE a stone (currently ${kindName} — change it on the bar) on an empty cell, OR click your stack to move it. Goal: connect a road edge to edge.`));
    }

    // ---------- AI ----------
    function cloneB(B) { return B.map((row) => row.map((st) => st.map((pc) => ({ p: pc.p, s: pc.s })))); }
    function cloneSup(S) { return [{ flat: S[0].flat, cap: S[0].cap }, { flat: S[1].flat, cap: S[1].cap }]; }
    // điểm road tiềm năng: đếm thành phần liên thông lớn nhất + chạm mép
    function roadScore(B, p) {
      const seen = Array.from({ length: N }, () => Array(N).fill(false));
      let best = 0, edgeBonus = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const t = topAt(B, r, c);
        if (!isRoadTop(t) || t.p !== p || seen[r][c]) continue;
        let size = 0, rows = new Set(), cols = new Set();
        const st = [[r, c]]; seen[r][c] = true;
        while (st.length) {
          const [cr, cc] = st.pop(); size++; rows.add(cr); cols.add(cc);
          for (const [dr, dc] of DIRS) {
            const nr = cr + dr, nc = cc + dc;
            if (!inB(nr, nc) || seen[nr][nc]) continue;
            const tt = topAt(B, nr, nc);
            if (isRoadTop(tt) && tt.p === p) { seen[nr][nc] = true; st.push([nr, nc]); }
          }
        }
        best = Math.max(best, size);
        edgeBonus = Math.max(edgeBonus, Math.max(rows.size, cols.size));
      }
      return best + edgeBonus * 1.5;
    }
    function evalB(B, me) {
      let s = (roadScore(B, me) - roadScore(B, 1 - me)) * 3;
      s += (flatCount(B, me) - flatCount(B, 1 - me)) * 1.2;
      return s;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const moves = legalMoves(board, me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.5) return moves[Math.floor(Math.random() * moves.length)];

      let best = -Infinity, pick = moves[0];
      const lookahead = level === "hard";
      for (const mv of moves) {
        const B2 = cloneB(board), S2 = cloneSup(supply);
        const m = Object.assign({}, mv);
        if (plies < 2 && m.place) m._firstColor = 1 - me;
        doMove(B2, S2, me, m);
        if (hasRoad(B2, me)) return mv; // thắng ngay
        let sc = evalB(B2, me);
        if (lookahead) {
          const opp = stackMoves(B2, 1 - me).concat(placementMoves(B2, 1 - me));
          let worst = Infinity;
          for (const oa of opp.slice(0, 60)) {
            const B3 = cloneB(B2), S3 = cloneSup(S2);
            const om = Object.assign({}, oa);
            doMove(B3, S3, 1 - me, om);
            if (hasRoad(B3, 1 - me)) { worst = -2000; break; }
            worst = Math.min(worst, evalB(B3, me));
          }
          if (opp.length) sc = sc * 0.4 + worst * 0.6;
        }
        sc += Math.random() * 0.4;
        if (sc > best) { best = sc; pick = mv; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Xanh)", "Player 1 (Blue)"), ctx.t("Người chơi 2 (Cam)", "Player 2 (Orange)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "tak",
    name: "Tak (Đường Đá)",
    emoji: "🗿",
    description: "Cờ xây đường thanh lịch: đặt đá phẳng, dựng tường chặn, kéo cả chồng quân đi rải. Nối một 'đường' quân của mình giữa hai mép bàn đối diện để thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Cỡ bàn", default: "5",
        choices: [
          { value: "4", label: "4×4 (nhanh)" },
          { value: "5", label: "5×5 (chuẩn, có đá trùm)" },
        ],
      },
    ],
    howTo: [
      "Mục tiêu: tạo một ĐƯỜNG (road) gồm các quân Phẳng/Đá trùm của bạn nối liền hai mép ĐỐI DIỆN của bàn (trên–dưới hoặc trái–phải).",
      "Khai cuộc (2 nước đầu): mỗi người đặt 1 quân Phẳng của ĐỐI THỦ lên ô trống bất kỳ. Người chơi 1 là Xanh, Người chơi 2 là Cam.",
      "Mỗi lượt chọn 1 trong 2: ĐẶT một quân mới từ kho lên ô trống, HOẶC KÉO một chồng mà bạn kiểm soát (quân trên cùng là của bạn).",
      "Ba kiểu quân: ▭ Phẳng (tính đường & đếm điểm), ◧ Tường (dựng đứng, CHẶN đường, không tính), ⬢ Đá trùm (tính đường, và là quân DUY NHẤT đè bẹp được Tường).",
      "Kéo chồng: chọn số quân NHẤC (tối đa = cỡ bàn) ở thanh công cụ, bấm chồng của mình, rồi bấm lần lượt các ô theo MỘT hướng thẳng để rải xuống từng quân; bấm lại ô cuối để kết thúc.",
      "Thắng ngay khi nối được đường. Nếu bàn đầy hoặc một bên hết quân: đếm số quân Phẳng nằm trên đỉnh — nhiều hơn thì thắng.",
    ],
    create,
  });
})();
