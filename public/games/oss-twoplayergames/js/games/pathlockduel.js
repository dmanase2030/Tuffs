/* Me Cung Ghep Duong - puzzle doi khang dat tile, xoay tile, khoa o va pha tile */
(function () {
  const DIRS = [
    { r: -1, c: 0, bit: 1, opp: 4 },
    { r: 0, c: 1, bit: 2, opp: 8 },
    { r: 1, c: 0, bit: 4, opp: 1 },
    { r: 0, c: -1, bit: 8, opp: 2 },
  ];
  const SHAPES = {
    straight: { label: "Thẳng", base: 1 | 4 },
    corner: { label: "Góc", base: 1 | 2 },
    tee: { label: "Ngã ba", base: 1 | 2 | 4 },
    cross: { label: "Ngã tư", base: 1 | 2 | 4 | 8 },
  };
  const GLYPHS = { 3: "└", 5: "│", 6: "┌", 9: "┘", 10: "─", 12: "┐", 7: "├", 11: "┴", 13: "┤", 14: "┬", 15: "┼" };

  function create(ctx) {
    const o = ctx.options || {};
    const N = [5, 7, 9].includes(Number(o.size)) ? Number(o.size) : 7;
    // bản dịch nhãn hình tile (SHAPES là hằng module-level)
    const SHAPE_LABEL_EN = { straight: "Straight", corner: "Corner", tee: "Tee", cross: "Cross" };
    const shapeLabel = (shape) => ctx.t(SHAPES[shape].label, SHAPE_LABEL_EN[shape] || SHAPES[shape].label);
    const LOCKS = o.tools === "few" ? 2 : o.tools === "many" ? 5 : 3;
    const BOMBS = o.tools === "few" ? 1 : o.tools === "many" ? 3 : 2;

    const cells = Array(N * N).fill(null);
    const locks = [LOCKS, LOCKS];
    const bombs = [BOMBS, BOMBS];
    let selectedShape = "straight";
    let selectedRot = 0;
    let mode = "tile";
    let turn = 0;
    let over = false;
    let lastIdx = -1;

    const root = document.createElement("div");
    root.className = "pld-wrap";
    root.innerHTML = `
      <div class="pld-toolbar">
        <div class="pld-tools"></div>
        <button class="btn small pld-rotate" type="button">${ctx.t("↻ Xoay", "↻ Rotate")}</button>
        <button class="btn small pld-lock" type="button">${ctx.t("🔒 Khóa", "🔒 Lock")}</button>
        <button class="btn small pld-bomb" type="button">${ctx.t("💥 Phá", "💥 Bomb")}</button>
      </div>
      <div class="pld-info"></div>
      <div class="pld-board"></div>
    `;
    ctx.boardEl.appendChild(root);

    const toolsEl = root.querySelector(".pld-tools");
    const rotateBtn = root.querySelector(".pld-rotate");
    const lockBtn = root.querySelector(".pld-lock");
    const bombBtn = root.querySelector(".pld-bomb");
    const infoEl = root.querySelector(".pld-info");
    const board = root.querySelector(".pld-board");
    board.style.setProperty("--pld-n", N);
    const buttons = {};
    const cellEls = [];

    Object.keys(SHAPES).forEach((shape) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small pld-shape";
      btn.dataset.shape = shape;
      btn.addEventListener("click", () => { selectedShape = shape; mode = "tile"; render(); });
      toolsEl.appendChild(btn);
      buttons[shape] = btn;
    });

    rotateBtn.addEventListener("click", () => { selectedRot = (selectedRot + 1) % 4; mode = "tile"; render(); });
    lockBtn.addEventListener("click", () => { mode = mode === "lock" ? "tile" : "lock"; render(); });
    bombBtn.addEventListener("click", () => { mode = mode === "bomb" ? "tile" : "bomb"; render(); });

    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "pld-cell";
      cell.addEventListener("click", () => onCell(i));
      board.appendChild(cell);
      cellEls.push(cell);
    }

    function idx(r, c) { return r * N + c; }
    function row(i) { return Math.floor(i / N); }
    function col(i) { return i % N; }
    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function rotateBits(bits, rot) {
      let out = bits;
      for (let i = 0; i < rot; i++) {
        let next = 0;
        if (out & 1) next |= 2;
        if (out & 2) next |= 4;
        if (out & 4) next |= 8;
        if (out & 8) next |= 1;
        out = next;
      }
      return out;
    }
    function currentBits() { return rotateBits(SHAPES[selectedShape].base, selectedRot); }
    function glyph(bits) { return GLYPHS[bits] || "┼"; }

    function svgTile(bits, extra) {
      const segs = [];
      if (bits & 1) segs.push('<line x1="50" y1="50" x2="50" y2="3"/>');
      if (bits & 2) segs.push('<line x1="50" y1="50" x2="97" y2="50"/>');
      if (bits & 4) segs.push('<line x1="50" y1="50" x2="50" y2="97"/>');
      if (bits & 8) segs.push('<line x1="50" y1="50" x2="3" y2="50"/>');
      return `<svg viewBox="0 0 100 100" class="pld-svg ${extra || ""}">`
        + `<g stroke="currentColor" stroke-width="17" stroke-linecap="round" fill="none">${segs.join("")}</g>`
        + `<circle cx="50" cy="50" r="11" fill="currentColor"/></svg>`;
    }

    function onCell(i) {
      if (!canAct()) return;
      const current = cells[i];
      if (mode === "lock") {
        if (current || locks[turn] <= 0) return;
        applyMove({ t: "lock", i }, false);
        return;
      }
      if (mode === "bomb") {
        if (!current || current.type !== "tile" || bombs[turn] <= 0) return;
        applyMove({ t: "bomb", i }, false);
        return;
      }
      if (current && current.type === "tile") { applyMove({ t: "rotate", i }, false); return; }
      if (!current) applyMove({ t: "place", i, shape: selectedShape, rot: selectedRot }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const i = Number(move?.i);
      if (!Number.isInteger(i) || i < 0 || i >= cells.length) return;

      if (move.t === "place") {
        const shape = SHAPES[move.shape] ? move.shape : "straight";
        const rot = Number(move.rot);
        if (cells[i] || !Number.isInteger(rot) || rot < 0 || rot > 3) return;
        cells[i] = { type: "tile", shape, rot, owner: turn };
        ctx.sound("place");
      } else if (move.t === "rotate") {
        if (!cells[i] || cells[i].type !== "tile") return;
        cells[i].rot = (cells[i].rot + 1) % 4;
        ctx.sound("rotate");
      } else if (move.t === "lock") {
        if (cells[i] || locks[turn] <= 0) return;
        cells[i] = { type: "lock", owner: turn };
        locks[turn]--;
        ctx.sound("capture");
      } else if (move.t === "bomb") {
        if (!cells[i] || cells[i].type !== "tile" || bombs[turn] <= 0) return;
        cells[i] = null;
        bombs[turn]--;
        ctx.sound("miss");
      } else {
        return;
      }
      lastIdx = i;

      if (!fromRemote) ctx.sendMove(move);

      const p0 = hasRoute(0);
      const p1 = hasRoute(1);
      if (p0 || p1) {
        const winner = p0 && p1 ? turn : p0 ? 0 : 1;
        over = true;
        ctx.incScore(winner);
        ctx.setTurn(-1);
        render();
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} nối được đường hoàn chỉnh!`, `🎉 Player ${winner + 1} completed a full path!`));
        return;
      }

      turn = 1 - turn;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function tileBits(i) {
      const cell = cells[i];
      if (!cell || cell.type !== "tile") return 0;
      return rotateBits(SHAPES[cell.shape].base, cell.rot);
    }

    // BFS từ cạnh nhà; trả về { reached: bool, net: Set } để vừa kiểm thắng vừa phát sáng mạng đường
    function network(player) {
      const queue = [];
      const seen = new Set();
      for (let i = 0; i < cells.length; i++) {
        const r = row(i), c = col(i);
        const bits = tileBits(i);
        if (!bits) continue;
        if (player === 0 && c === 0 && (bits & 8)) { queue.push(i); seen.add(i); }
        if (player === 1 && r === 0 && (bits & 1)) { queue.push(i); seen.add(i); }
      }
      let reached = false;
      while (queue.length) {
        const cur = queue.shift();
        const r = row(cur), c = col(cur);
        const bits = tileBits(cur);
        if (player === 0 && c === N - 1 && (bits & 2)) reached = true;
        if (player === 1 && r === N - 1 && (bits & 4)) reached = true;
        DIRS.forEach((dir) => {
          if (!(bits & dir.bit)) return;
          const nr = r + dir.r, nc = c + dir.c;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) return;
          const ni = idx(nr, nc);
          if (seen.has(ni)) return;
          const nb = tileBits(ni);
          if (!(nb & dir.opp)) return;
          seen.add(ni);
          queue.push(ni);
        });
      }
      return { reached, net: seen };
    }
    function hasRoute(player) { return network(player).reached; }

    // ---------- AI (đấu máy) ----------
    const ORIENTATIONS = (function () {
      const seen = new Set(); const out = [];
      Object.keys(SHAPES).forEach((shape) => {
        for (let rot = 0; rot < 4; rot++) {
          const b = rotateBits(SHAPES[shape].base, rot);
          if (seen.has(shape + ":" + b)) continue;
          // gộp các hướng trùng bits cho cùng shape để bớt nước thừa
          if ([...seen].some((k) => k.endsWith(":" + b) && k.startsWith(shape + ":"))) continue;
          seen.add(shape + ":" + b);
          out.push({ shape, rot });
        }
      });
      return out;
    })();

    function cloneCells(cs) { return cs.map((x) => (x ? { ...x } : null)); }
    function bitsOf(cs, i) {
      const cell = cs[i];
      if (!cell || cell.type !== "tile") return 0;
      return rotateBits(SHAPES[cell.shape].base, cell.rot);
    }
    function reachedFor(cs, player) {
      const queue = []; const seen = new Set();
      for (let i = 0; i < cs.length; i++) {
        const r = row(i), c = col(i); const b = bitsOf(cs, i);
        if (!b) continue;
        if (player === 0 && c === 0 && (b & 8)) { queue.push(i); seen.add(i); }
        if (player === 1 && r === 0 && (b & 1)) { queue.push(i); seen.add(i); }
      }
      while (queue.length) {
        const cur = queue.shift(); const r = row(cur), c = col(cur); const b = bitsOf(cs, cur);
        if (player === 0 && c === N - 1 && (b & 2)) return true;
        if (player === 1 && r === N - 1 && (b & 4)) return true;
        for (const dir of DIRS) {
          if (!(b & dir.bit)) continue;
          const nr = r + dir.r, nc = c + dir.c;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const ni = idx(nr, nc); if (seen.has(ni)) continue;
          if (!(bitsOf(cs, ni) & dir.opp)) continue;
          seen.add(ni); queue.push(ni);
        }
      }
      return false;
    }
    // ước lượng số tile còn cần để nối tuyến (ô trống = 1, tile sẵn = 0, ô khóa = chặn)
    function distToWin(cs, player) {
      const INF = 1e9; const dist = new Array(N * N).fill(INF);
      for (let i = 0; i < N * N; i++) {
        const r = row(i), c = col(i);
        const home = player === 0 ? c === 0 : r === 0;
        if (!home) continue;
        const cell = cs[i]; if (cell && cell.type === "lock") continue;
        const cost = cell && cell.type === "tile" ? 0 : 1;
        if (cost < dist[i]) dist[i] = cost;
      }
      const done = new Array(N * N).fill(false);
      for (let it = 0; it < N * N; it++) {
        let u = -1, bd = INF;
        for (let i = 0; i < N * N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
        if (u < 0) break; done[u] = true;
        const r = row(u), c = col(u);
        for (const dir of DIRS) {
          const nr = r + dir.r, nc = c + dir.c;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const ni = idx(nr, nc); const cell = cs[ni];
          if (cell && cell.type === "lock") continue;
          const w = cell && cell.type === "tile" ? 0 : 1;
          if (dist[u] + w < dist[ni]) dist[ni] = dist[u] + w;
        }
      }
      let best = INF;
      for (let i = 0; i < N * N; i++) {
        const r = row(i), c = col(i);
        const goal = player === 0 ? c === N - 1 : r === N - 1;
        if (goal) best = Math.min(best, dist[i]);
      }
      return best;
    }
    function neighborHasCell(cs, i) {
      const r = row(i), c = col(i);
      return DIRS.some((dir) => {
        const nr = r + dir.r, nc = c + dir.c;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false;
        return !!cs[idx(nr, nc)];
      });
    }
    function genAiMovesPL(cs, locksArr, bombsArr, player) {
      const opp = 1 - player;
      const out = [];
      for (let i = 0; i < N * N; i++) {
        const cell = cs[i]; const r = row(i), c = col(i);
        const onEdge = c === 0 || c === N - 1 || r === 0 || r === N - 1;
        if (!cell) {
          const relevant = onEdge || neighborHasCell(cs, i);
          if (!relevant) continue;
          for (const ori of ORIENTATIONS) out.push({ t: "place", i, shape: ori.shape, rot: ori.rot });
          if (locksArr[player] > 0) out.push({ t: "lock", i });
        } else if (cell.type === "tile") {
          out.push({ t: "rotate", i });
          if (bombsArr[player] > 0 && cell.owner === opp) out.push({ t: "bomb", i });
        }
      }
      return out;
    }
    function applySimPL(cs, move, player) {
      const nb = cloneCells(cs);
      if (move.t === "place") nb[move.i] = { type: "tile", shape: move.shape, rot: move.rot, owner: player };
      else if (move.t === "rotate") { if (nb[move.i] && nb[move.i].type === "tile") nb[move.i] = { ...nb[move.i], rot: (nb[move.i].rot + 1) % 4 }; }
      else if (move.t === "lock") nb[move.i] = { type: "lock", owner: player };
      else if (move.t === "bomb") nb[move.i] = null;
      return nb;
    }
    function scoreAfter(cs, me) {
      if (reachedFor(cs, me)) return 1e6;       // mình nối xong (cả hai thì người đi vẫn thắng)
      if (reachedFor(cs, 1 - me)) return -1e6;  // chỉ đối thủ nối xong -> mình thua
      return distToWin(cs, 1 - me) - distToWin(cs, me);
    }
    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const moves = genAiMovesPL(cells, locks, bombs, me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.45) return moves[Math.floor(Math.random() * moves.length)];
      const scored = [];
      for (const mv of moves) {
        const b2 = applySimPL(cells, mv, me);
        scored.push({ mv, sc: scoreAfter(b2, me) + Math.random() * 0.01, b2 });
      }
      scored.sort((a, b) => b.sc - a.sc);
      if (level !== "hard") return scored[0].mv;
      // Khó: với vài ứng viên dẫn đầu, trừ đi nước phản công tốt nhất của đối thủ
      const top = scored.slice(0, Math.min(6, scored.length));
      let best = -Infinity, pick = top[0].mv;
      for (const cand of top) {
        if (cand.sc >= 1e6) return cand.mv; // thắng ngay
        const oppMoves = genAiMovesPL(cand.b2, locks, bombs, opp);
        let worst = cand.sc;
        for (const om of oppMoves) {
          const b3 = applySimPL(cand.b2, om, opp);
          let s;
          if (reachedFor(b3, opp) && !reachedFor(b3, me)) s = -1e6;
          else if (reachedFor(b3, me)) s = 1e6;
          else s = distToWin(b3, opp) - distToWin(b3, me);
          if (s < worst) worst = s;
          if (worst <= -1e6) break;
        }
        if (worst > best) { best = worst; pick = cand.mv; }
      }
      return pick;
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang ghép đường...", "Opponent is building a path...")); return; }
      const goal = turn === 0 ? ctx.t("nối TRÁI → PHẢI", "connect LEFT → RIGHT") : ctx.t("nối TRÊN → DƯỚI", "connect TOP → BOTTOM");
      const m = mode === "lock" ? ctx.t("🔒 đang chọn ô để KHÓA", "🔒 picking a cell to LOCK") : mode === "bomb" ? ctx.t("💥 đang chọn tile để PHÁ", "💥 picking a tile to BOMB") : ctx.t("đặt/xoay tile", "place/rotate a tile");
      ctx.setStatus(ctx.t(`Người chơi ${turn + 1} (${goal}) — ${m}.`, `Player ${turn + 1} (${goal}) — ${m}.`));
    }

    function render() {
      const sample = glyph(currentBits());
      Object.entries(buttons).forEach(([shape, btn]) => {
        btn.classList.toggle("active", mode === "tile" && shape === selectedShape);
        btn.innerHTML = `${shapeLabel(shape)} <b class="pld-gly">${shape === selectedShape ? sample : glyph(SHAPES[shape].base)}</b>`;
      });
      rotateBtn.innerHTML = `${ctx.t("↻ Xoay", "↻ Rotate")} <b class="pld-gly">${sample}</b>`;
      lockBtn.textContent = ctx.t(`🔒 Khóa (${locks[turn]})`, `🔒 Lock (${locks[turn]})`);
      lockBtn.classList.toggle("active", mode === "lock");
      lockBtn.disabled = !canAct() || locks[turn] <= 0;
      bombBtn.textContent = ctx.t(`💥 Phá (${bombs[turn]})`, `💥 Bomb (${bombs[turn]})`);
      bombBtn.classList.toggle("active", mode === "bomb");
      bombBtn.disabled = !canAct() || bombs[turn] <= 0;

      const net0 = network(0).net;
      const net1 = network(1).net;
      infoEl.innerHTML = `
        <span class="pld-side p1 ${turn === 0 && !over ? "active" : ""}">${ctx.t(`🟥 P1 ↔ ${net0.size} đoạn`, `🟥 P1 ↔ ${net0.size} segs`)} · 🔒${locks[0]} 💥${bombs[0]}</span>
        <span class="pld-side p2 ${turn === 1 && !over ? "active" : ""}">${ctx.t(`🟦 P2 ↕ ${net1.size} đoạn`, `🟦 P2 ↕ ${net1.size} segs`)} · 🔒${locks[1]} 💥${bombs[1]}</span>
      `;

      cellEls.forEach((el, i) => {
        const cell = cells[i];
        const r = row(i), c = col(i);
        let cls = "pld-cell";
        if (c === 0 || c === N - 1) cls += " edge-p1";
        if (r === 0 || r === N - 1) cls += " edge-p2";
        el.innerHTML = "";
        el.disabled = !canAct();
        if (!cell) {
          if (canAct()) cls += mode === "lock" ? " lockable" : mode === "bomb" ? "" : " placeable";
          el.className = cls;
          return;
        }
        if (cell.type === "lock") {
          cls += " locked p" + (cell.owner + 1);
          el.className = cls;
          el.innerHTML = "✕";
          el.disabled = true;
          return;
        }
        const bits = tileBits(i);
        cls += " tile p" + (cell.owner + 1);
        const inNet0 = net0.has(i), inNet1 = net1.has(i);
        if (inNet0) cls += " net1";
        if (inNet1) cls += " net2";
        if (i === lastIdx) cls += " lastmove";
        el.className = cls;
        el.innerHTML = svgTile(bits);
      });
    }

    ctx.setNames(ctx.t("Người chơi 1 (trái-phải)", "Player 1 (left-right)"), ctx.t("Người chơi 2 (trên-dưới)", "Player 2 (top-bottom)"));
    ctx.setTurn(0);
    updateStatus();
    render();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "pathlockduel",
    name: "Mê Cung Ghép Đường",
    emoji: "🧩",
    description: "Đặt & xoay tile đường, khóa ô, phá tile để nối tuyến của mình trước. Mạng đường phát sáng cho thấy tuyến đang lớn dần.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 7,
        choices: [
          { value: 5, label: "5×5 (nhanh)" },
          { value: 7, label: "7×7 (chuẩn)" },
          { value: 9, label: "9×9 (lớn)" },
        ],
      },
      {
        id: "tools", label: "Khóa & Phá", default: "normal",
        choices: [
          { value: "few", label: "Ít (🔒2 💥1)" },
          { value: "normal", label: "Vừa (🔒3 💥2)" },
          { value: "many", label: "Nhiều (🔒5 💥3)" },
        ],
      },
    ],
    howTo: [
      "Người chơi 1 (🟥) nối một đường từ cạnh TRÁI sang cạnh PHẢI; Người chơi 2 (🟦) nối từ cạnh TRÊN xuống cạnh DƯỚI. Các cạnh đích được tô màu nhẹ.",
      "Đến lượt: đặt một tile đường vào ô trống (Thẳng/Góc/Ngã ba/Ngã tư), bấm ↻ Xoay để chọn hướng; hoặc bấm vào tile đã có để xoay nó.",
      "🔒 Khóa: chặn một ô trống vĩnh viễn (không ai đặt được). 💥 Phá: gỡ bỏ một tile bất kỳ trên bàn (kể cả của đối thủ) — dùng để cắt tuyến địch.",
      "Đường chỉ nối khi hai tile kề nhau có ĐẦU MỞ chạm nhau. Tuyến của bạn nối được tới cạnh nhà sẽ PHÁT SÁNG — nhìn vào đó để biết mình còn thiếu đoạn nào.",
      "Lưu ý: tuyến có thể đi qua cả tile của đối thủ (đường là chung), nên hãy tính kỹ trước khi đặt. Ai hoàn thành tuyến của mình trước sẽ thắng.",
      "Chọn cỡ bàn và số Khóa/Phá ở phần tùy chọn để đổi nhịp độ và độ gắt của ván đấu.",
    ],
    create,
  });
})();
