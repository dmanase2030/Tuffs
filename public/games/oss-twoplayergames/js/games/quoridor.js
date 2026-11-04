/* Quoridor (Đặt Tường) — chơi chung máy & ONLINE (theo lượt, không RNG)
   Bàn 9×9. Mỗi lượt: di chuyển quân HOẶC đặt một bức tường chặn đường.
   P1 (dưới) cần lên hàng trên cùng; P2 (trên) cần xuống hàng dưới cùng.
   Tường không được bịt kín hoàn toàn đường về đích của bất kỳ ai.
   Nước đi: { t:"move", r, c } hoặc { t:"wall", o:"h"|"v", r, c }. */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const N = [5, 7, 9].includes(Number(o.size)) ? Number(o.size) : 9;
    const WALL_SLOTS = N - 1; // 0..N-2
    const CC = (N - 1) / 2;   // cột giữa
    const WALLS_EACH = o.walls || 10;

    // ----- trạng thái -----
    const pawns = [
      { r: N - 1, c: CC, goalRow: 0 },     // P1 đi lên
      { r: 0, c: CC, goalRow: N - 1 },     // P2 đi xuống
    ];
    let lastCell = null;   // [r,c] quân vừa đi
    let lastWall = null;   // {o,r,c} tường vừa đặt
    const wallsLeft = [WALLS_EACH, WALLS_EACH];
    const hWalls = new Set(); // "r,c": tường ngang tại giao điểm (r,c), phủ cột c & c+1
    const vWalls = new Set(); // "r,c": tường dọc tại giao điểm (r,c), phủ hàng r & r+1
    let turn = 0;
    let over = false;
    let mode = "move"; // move | wall

    // ----- giao diện -----
    const wrap = document.createElement("div");
    wrap.className = "qd-wrap";
    const unit = N <= 5 ? 54 : N <= 7 ? 46 : 40;
    wrap.style.setProperty("--qd-unit", unit + "px");
    wrap.style.setProperty("--qd-wall", Math.round(unit * 0.22) + "px");

    const info = document.createElement("div");
    info.className = "qd-info";
    wrap.appendChild(info);

    const bar = document.createElement("div");
    bar.className = "qd-bar";
    bar.innerHTML =
      `<button class="btn small qd-mode active" id="qdMove">${ctx.t("🏃 Di chuyển", "🏃 Move")}</button>` +
      `<button class="btn small qd-mode" id="qdWall">${ctx.t("🧱 Đặt tường", "🧱 Wall")}</button>` +
      `<span class="qd-walls" id="qdWalls"></span>`;
    wrap.appendChild(bar);

    const boardEl = document.createElement("div");
    boardEl.className = "qd-board";
    const SZ = 2 * N - 1;
    // mẫu xen kẽ: ô (--qd-unit) rồi khe tường (--qd-wall), lặp lại
    const tracks = [];
    for (let i = 0; i < SZ; i++) tracks.push(i % 2 === 0 ? "var(--qd-unit)" : "var(--qd-wall)");
    boardEl.style.gridTemplateColumns = tracks.join(" ");
    boardEl.style.gridTemplateRows = tracks.join(" ");
    wrap.appendChild(boardEl);
    ctx.boardEl.appendChild(wrap);

    const moveBtn = bar.querySelector("#qdMove");
    const wallBtn = bar.querySelector("#qdWall");
    const wallsLabel = bar.querySelector("#qdWalls");

    moveBtn.addEventListener("click", () => setMode("move"));
    wallBtn.addEventListener("click", () => setMode("wall"));
    function setMode(m) {
      mode = m;
      moveBtn.classList.toggle("active", m === "move");
      wallBtn.classList.toggle("active", m === "wall");
      render();
    }

    // dựng lưới (2N-1)×(2N-1): ô, khe tường, giao điểm
    const cellEls = {};   // "r,c" -> el
    const hSlotEls = {};  // "gr,gc" -> el (khe ngang)
    const vSlotEls = {};
    for (let gr = 0; gr < SZ; gr++) {
      for (let gc = 0; gc < SZ; gc++) {
        const el = document.createElement("div");
        const evenR = gr % 2 === 0, evenC = gc % 2 === 0;
        if (evenR && evenC) {
          el.className = "qd-cell";
          const r = gr / 2, c = gc / 2;
          cellEls[r + "," + c] = el;
          el.addEventListener("click", () => onCellClick(r, c));
        } else if (!evenR && evenC) {
          el.className = "qd-hslot";
          const r = (gr - 1) / 2, c = gc / 2; // giữa hàng r và r+1, cột c
          hSlotEls[r + "," + c] = el;
          el.addEventListener("click", () => onWallSlot("h", r, c));
          el.addEventListener("mouseenter", () => setPreview("h", r, c));
          el.addEventListener("mouseleave", clearPreview);
        } else if (evenR && !evenC) {
          el.className = "qd-vslot";
          const r = gr / 2, c = (gc - 1) / 2; // giữa cột c và c+1, hàng r
          vSlotEls[r + "," + c] = el;
          el.addEventListener("click", () => onWallSlot("v", r, c));
          el.addEventListener("mouseenter", () => setPreview("v", r, c));
          el.addEventListener("mouseleave", clearPreview);
        } else {
          el.className = "qd-inter";
        }
        boardEl.appendChild(el);
      }
    }

    let preview = null; // { o, r, c, ok } xem trước tường khi rê chuột
    function setPreview(orient, r, c) {
      if (!canPlay() || mode !== "wall" || wallsLeft[turn] <= 0) { preview = null; return; }
      let ir = r, ic = c;
      if (orient === "h") { if (ic > WALL_SLOTS - 1) ic = WALL_SLOTS - 1; }
      else { if (ir > WALL_SLOTS - 1) ir = WALL_SLOTS - 1; }
      preview = { o: orient, r: ir, c: ic, ok: wallLegal(orient, ir, ic) };
      render();
    }
    function clearPreview() { if (preview) { preview = null; render(); } }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    // ---------- luật di chuyển ----------
    function blockedBetween(r1, c1, r2, c2) {
      // hai ô kề nhau; trả về true nếu có tường chặn
      if (r2 === r1 - 1) { // đi lên
        return hWalls.has((r1 - 1) + "," + c1) || hWalls.has((r1 - 1) + "," + (c1 - 1));
      }
      if (r2 === r1 + 1) { // đi xuống
        return hWalls.has(r1 + "," + c1) || hWalls.has(r1 + "," + (c1 - 1));
      }
      if (c2 === c1 - 1) { // sang trái
        return vWalls.has(r1 + "," + (c1 - 1)) || vWalls.has((r1 - 1) + "," + (c1 - 1));
      }
      if (c2 === c1 + 1) { // sang phải
        return vWalls.has(r1 + "," + c1) || vWalls.has((r1 - 1) + "," + c1);
      }
      return true;
    }

    function onBoard(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

    // các nước đi hợp lệ của quân đang ở (pr,pc), đối thủ ở (or,oc)
    function legalPawnMoves(me, opp) {
      const res = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = me.r + dr, nc = me.c + dc;
        if (!onBoard(nr, nc) || blockedBetween(me.r, me.c, nr, nc)) continue;
        if (opp.r === nr && opp.c === nc) {
          // có quân đối thủ -> thử nhảy qua
          const jr = nr + dr, jc = nc + dc;
          if (onBoard(jr, jc) && !blockedBetween(nr, nc, jr, jc)) {
            res.push([jr, jc]); // nhảy thẳng
          } else {
            // nhảy chéo (rẽ hai bên của đối thủ)
            const side = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
            for (const [sr, sc] of side) {
              const dr2 = nr + sr, dc2 = nc + sc;
              if (onBoard(dr2, dc2) && !blockedBetween(nr, nc, dr2, dc2)) res.push([dr2, dc2]);
            }
          }
        } else {
          res.push([nr, nc]);
        }
      }
      return res;
    }

    // ---------- BFS kiểm tra còn đường về đích ----------
    function hasPath(pawn) {
      const seen = new Set([pawn.r + "," + pawn.c]);
      const queue = [[pawn.r, pawn.c]];
      while (queue.length) {
        const [r, c] = queue.shift();
        if (r === pawn.goalRow) return true;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (!onBoard(nr, nc) || blockedBetween(r, c, nr, nc)) continue;
          const key = nr + "," + nc;
          if (!seen.has(key)) { seen.add(key); queue.push([nr, nc]); }
        }
      }
      return false;
    }

    // khoảng cách ngắn nhất tới hàng đích (bỏ qua quân đối thủ) — cho HUD
    function distToGoal(pawn) {
      const seen = new Set([pawn.r + "," + pawn.c]);
      const queue = [[pawn.r, pawn.c, 0]];
      while (queue.length) {
        const [r, c, d] = queue.shift();
        if (r === pawn.goalRow) return d;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (!onBoard(nr, nc) || blockedBetween(r, c, nr, nc)) continue;
          const key = nr + "," + nc;
          if (!seen.has(key)) { seen.add(key); queue.push([nr, nc, d + 1]); }
        }
      }
      return Infinity;
    }

    function renderInfo() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const d0 = distToGoal(pawns[0]);
      const d1 = distToGoal(pawns[1]);
      const pips = (n) => "🧱".repeat(Math.min(n, 14));
      info.innerHTML = `
        <div class="qd-player p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🔴 ${ctx.t("Người chơi 1", "Player 1")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${ctx.t("còn", "")} ${Number.isFinite(d0) ? d0 : "?"} ${ctx.t("bước", "steps left")}</b>
          <small>${wallsLeft[0]} ${ctx.t("tường", "walls")} ${pips(wallsLeft[0])}</small>
        </div>
        <div class="qd-vs">${over ? ctx.t("Kết thúc", "Finished") : "VS"}</div>
        <div class="qd-player p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🔵 ${ctx.t("Người chơi 2", "Player 2")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${ctx.t("còn", "")} ${Number.isFinite(d1) ? d1 : "?"} ${ctx.t("bước", "steps left")}</b>
          <small>${wallsLeft[1]} ${ctx.t("tường", "walls")} ${pips(wallsLeft[1])}</small>
        </div>
      `;
    }
    function wallConflict(orient, r, c) {
      if (r < 0 || r > WALL_SLOTS - 1 || c < 0 || c > WALL_SLOTS - 1) return true;
      if (orient === "h") {
        if (hWalls.has(r + "," + c)) return true;
        if (hWalls.has(r + "," + (c - 1))) return true; // chồng lên đoạn bên trái
        if (hWalls.has(r + "," + (c + 1))) return true; // chồng đoạn bên phải
        if (vWalls.has(r + "," + c)) return true;        // cắt nhau tại giao điểm
      } else {
        if (vWalls.has(r + "," + c)) return true;
        if (vWalls.has((r - 1) + "," + c)) return true;
        if (vWalls.has((r + 1) + "," + c)) return true;
        if (hWalls.has(r + "," + c)) return true;
      }
      return false;
    }

    // đặt thử tường rồi kiểm tra cả hai quân còn đường — trả về true nếu hợp lệ
    function wallLegal(orient, r, c) {
      if (wallConflict(orient, r, c)) return false;
      const set = orient === "h" ? hWalls : vWalls;
      set.add(r + "," + c);
      const ok = hasPath(pawns[0]) && hasPath(pawns[1]);
      set.delete(r + "," + c);
      return ok;
    }

    // ---------- xử lý click ----------
    function onCellClick(r, c) {
      if (!canPlay() || mode !== "move") return;
      const moves = legalPawnMoves(pawns[turn], pawns[1 - turn]);
      if (moves.some(([mr, mc]) => mr === r && mc === c)) {
        applyMove({ t: "move", r, c }, false);
      }
    }

    function onWallSlot(orient, r, c) {
      if (!canPlay() || mode !== "wall" || wallsLeft[turn] <= 0) return;
      // khe nằm ở mép phải/dưới cùng thì dịch về giao điểm hợp lệ
      let ir = r, ic = c;
      if (orient === "h") { if (ic > WALL_SLOTS - 1) ic = WALL_SLOTS - 1; }
      else { if (ir > WALL_SLOTS - 1) ir = WALL_SLOTS - 1; }
      if (!wallLegal(orient, ir, ic)) {
        ctx.setStatus(ctx.t("⛔ Không đặt được tường ở đây (chồng tường hoặc bịt kín đường về đích).",
          "⛔ Can't place a wall here (overlap or it fully blocks a path to goal)."));
        return;
      }
      applyMove({ t: "wall", o: orient, r: ir, c: ic }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.t === "move") {
        const moves = legalPawnMoves(pawns[turn], pawns[1 - turn]);
        if (!moves.some(([mr, mc]) => mr === move.r && mc === move.c)) return;
        pawns[turn].r = move.r; pawns[turn].c = move.c;
        lastCell = [move.r, move.c]; lastWall = null;
        ctx.sound("place");
        if (!fromRemote) ctx.sendMove(move);
        if (pawns[turn].r === pawns[turn].goalRow) return endGame(turn);
      } else {
        if (!wallLegal(move.o, move.r, move.c) || wallsLeft[turn] <= 0) return;
        (move.o === "h" ? hWalls : vWalls).add(move.r + "," + move.c);
        wallsLeft[turn]--;
        lastWall = { o: move.o, r: move.r, c: move.c }; lastCell = null;
        ctx.sound("capture");
        if (!fromRemote) ctx.sendMove(move);
      }

      turn = 1 - turn;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function endGame(winner) {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} đã về đích — chiến thắng!`, `🎉 Player ${winner + 1} reached the goal — wins!`));
      render();
    }

    function updateStatus() {
      wallsLabel.textContent = `🧱 P1: ${wallsLeft[0]} · P2: ${wallsLeft[1]}`;
      const mineNote = ctx.isOnline ? (turn === ctx.mySeat ? ctx.t(" (lượt bạn)", " (your turn)") : ctx.t(" (đối thủ)", " (opponent)")) : "";
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}${mineNote}. Di chuyển quân hoặc đặt tường.`,
        `Player ${turn + 1}'s turn${mineNote}. Move your pawn or place a wall.`));
    }

    function render() {
      // ô + gợi ý nước đi
      const myMoves = (canPlay() && mode === "move")
        ? legalPawnMoves(pawns[turn], pawns[1 - turn]) : [];
      const moveSet = new Set(myMoves.map(([r, c]) => r + "," + c));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const el = cellEls[r + "," + c];
          el.className = "qd-cell";
          el.innerHTML = "";
          if (r === pawns[0].goalRow) el.classList.add("goal-p1");
          if (r === pawns[1].goalRow) el.classList.add("goal-p2");
          if (lastCell && lastCell[0] === r && lastCell[1] === c) el.classList.add("qd-lastcell");
          if (pawns[0].r === r && pawns[0].c === c) addPawn(el, 0);
          else if (pawns[1].r === r && pawns[1].c === c) addPawn(el, 1);
          else if (moveSet.has(r + "," + c)) el.classList.add("qd-hint");
        }
      }
      // tường
      for (const key in hSlotEls) hSlotEls[key].className = "qd-hslot";
      for (const key in vSlotEls) vSlotEls[key].className = "qd-vslot";
      hWalls.forEach((k) => {
        const [r, c] = k.split(",").map(Number);
        if (hSlotEls[r + "," + c]) hSlotEls[r + "," + c].classList.add("on");
        if (hSlotEls[r + "," + (c + 1)]) hSlotEls[r + "," + (c + 1)].classList.add("on");
      });
      vWalls.forEach((k) => {
        const [r, c] = k.split(",").map(Number);
        if (vSlotEls[r + "," + c]) vSlotEls[r + "," + c].classList.add("on");
        if (vSlotEls[(r + 1) + "," + c]) vSlotEls[(r + 1) + "," + c].classList.add("on");
      });
      // xem trước tường khi rê chuột
      if (preview) {
        const cls = preview.ok ? "preview-ok" : "preview-bad";
        if (preview.o === "h") {
          [hSlotEls[preview.r + "," + preview.c], hSlotEls[preview.r + "," + (preview.c + 1)]]
            .forEach((e) => e && e.classList.add(cls));
        } else {
          [vSlotEls[preview.r + "," + preview.c], vSlotEls[(preview.r + 1) + "," + preview.c]]
            .forEach((e) => e && e.classList.add(cls));
        }
      }
      // bật chế độ đặt tường gợi ý khe bấm được
      boardEl.classList.toggle("qd-wallmode", mode === "wall" && canPlay() && wallsLeft[turn] > 0);

      // tô tường vừa đặt
      if (lastWall) {
        const els = lastWall.o === "h"
          ? [hSlotEls[lastWall.r + "," + lastWall.c], hSlotEls[lastWall.r + "," + (lastWall.c + 1)]]
          : [vSlotEls[lastWall.r + "," + lastWall.c], vSlotEls[(lastWall.r + 1) + "," + lastWall.c]];
        els.forEach((e) => e && e.classList.add("wall-last"));
      }
      renderInfo();
    }

    function addPawn(el, p) {
      const pawn = document.createElement("div");
      pawn.className = "qd-pawn " + (p === 0 ? "p1" : "p2") + (p === turn && !over ? " active" : "");
      pawn.innerHTML = `<i>${p === 0 ? "▲" : "▼"}</i>`;
      el.appendChild(pawn);
    }

    // ---------- AI (đấu máy) — heuristic đường ngắn nhất + 2 tầng cho mức Khó ----------
    function doSim(mv, player) {
      if (mv.t === "move") {
        const old = [pawns[player].r, pawns[player].c];
        pawns[player].r = mv.r; pawns[player].c = mv.c;
        return { kind: "move", player, old };
      }
      (mv.o === "h" ? hWalls : vWalls).add(mv.r + "," + mv.c);
      wallsLeft[player]--;
      return { kind: "wall", player, o: mv.o, key: mv.r + "," + mv.c };
    }
    function undoSim(u) {
      if (u.kind === "move") {
        pawns[u.player].r = u.old[0]; pawns[u.player].c = u.old[1];
      } else {
        (u.o === "h" ? hWalls : vWalls).delete(u.key);
        wallsLeft[u.player]++;
      }
    }
    function evalFor(me) {
      const opp = 1 - me;
      const dMe = distToGoal(pawns[me]);
      const dOpp = distToGoal(pawns[opp]);
      if (dMe === 0) return 100000;
      if (dOpp === 0) return -100000;
      // muốn quãng đường của mình ngắn, của đối thủ dài; giữ chút tường dự phòng
      return (dOpp - dMe) * 10 + (wallsLeft[me] - wallsLeft[opp]);
    }
    function genAiMoves(player) {
      const opp = 1 - player;
      const list = [];
      legalPawnMoves(pawns[player], pawns[opp]).forEach(([r, c]) => list.push({ t: "move", r, c }));
      if (wallsLeft[player] > 0) {
        for (let r = 0; r < WALL_SLOTS; r++) {
          for (let c = 0; c < WALL_SLOTS; c++) {
            if (wallLegal("h", r, c)) list.push({ t: "wall", o: "h", r, c });
            if (wallLegal("v", r, c)) list.push({ t: "wall", o: "v", r, c });
          }
        }
      }
      return list;
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const moves = genAiMoves(me);
      if (!moves.length) return null;
      // Dễ: thỉnh thoảng đi ngẫu nhiên cho người mới dễ thở
      if (level === "easy" && Math.random() < 0.4) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
      const depth2 = level === "hard";
      let best = -Infinity, pick = moves[0];
      for (const mv of moves) {
        const u = doSim(mv, me);
        if (distToGoal(pawns[me]) === 0) { undoSim(u); return mv; } // về đích ngay
        let sc;
        if (!depth2) {
          sc = evalFor(me);
        } else {
          const oppMoves = genAiMoves(opp);
          let worst = Infinity;
          for (const om of oppMoves) {
            const u2 = doSim(om, opp);
            const s2 = evalFor(me);
            undoSim(u2);
            if (s2 < worst) worst = s2;
            if (worst <= -100000) break;
          }
          sc = oppMoves.length ? worst : evalFor(me);
        }
        sc += Math.random() * 0.01;
        undoSim(u);
        if (sc > best) { best = sc; pick = mv; }
      }
      return pick;
    }

    if (ctx.isOnline) {
      ctx.setNames(ctx.t(`Người chơi 1${ctx.mySeat === 0 ? " (bạn)" : ""}`, `Player 1${ctx.mySeat === 0 ? " (you)" : ""}`),
                   ctx.t(`Người chơi 2${ctx.mySeat === 1 ? " (bạn)" : ""}`, `Player 2${ctx.mySeat === 1 ? " (you)" : ""}`));
    }
    ctx.setTurn(0);
    updateStatus();
    render();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "quoridor",
    name: "Quoridor (Đặt Tường)",
    emoji: "🧱",
    description: "Đua quân sang bờ đối diện, đặt tường chặn đường đối thủ. Có bảng đo khoảng cách tới đích, chọn cỡ bàn 5/7/9. Cờ chiến thuật chiều sâu lớn.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 9,
        choices: [
          { value: 5, label: "5×5 (nhanh)" },
          { value: 7, label: "7×7" },
          { value: 9, label: "9×9 (chuẩn)" },
        ],
      },
      {
        id: "walls", label: "Số tường mỗi người", default: 10,
        choices: [
          { value: 6, label: "6 (nhanh)" },
          { value: 10, label: "10 (chuẩn)" },
          { value: 14, label: "14 (nhiều)" },
        ],
      },
    ],
    howTo: [
      "Người chơi 1 (🔴 đỏ) ở hàng dưới cần lên tới hàng TRÊN cùng; Người chơi 2 (🔵 xanh) ở hàng trên cần xuống hàng DƯỚI cùng. Hàng đích được tô màu nhẹ ở mép bàn.",
      "Mỗi lượt chọn một trong hai: DI CHUYỂN quân (sang ô kề) HOẶC ĐẶT TƯỜNG.",
      "Chế độ 🏃 Di chuyển: bấm vào ô sáng để đi. Nếu hai quân đứng kề nhau, bạn được nhảy qua đối thủ.",
      "Chế độ 🧱 Đặt tường: bấm vào khe giữa các ô để đặt tường dài 2 ô (chặn 2 lối liền nhau), tốn 1 tường. Rê chuột để xem trước (xanh = đặt được, đỏ = không).",
      "Bảng phía trên cho biết mỗi người CÒN BAO NHIÊU BƯỚC tới đích (đường ngắn nhất hiện tại) và số tường còn lại — dùng để tính xem ai đang dẫn.",
      "Luật: KHÔNG được đặt tường bịt kín hoàn toàn đường về đích của bất kỳ ai. Chọn cỡ bàn nhỏ (5×5/7×7) để chơi nhanh. Ai về đích trước sẽ thắng.",
    ],
    create,
  });
})();
