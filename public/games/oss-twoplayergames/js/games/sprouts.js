/* Mầm Cây (Sprouts) — bản đường thẳng
   Bắt đầu với vài chấm. Mỗi lượt: nối HAI chấm bằng một đoạn thẳng, một chấm mới
   mọc ra ở giữa đoạn vừa vẽ. Luật:
     • Mỗi chấm nối tối đa 3 đoạn (chấm "đầy" sẽ chết).
     • Đoạn mới KHÔNG được cắt ngang đoạn đã có, không đi xuyên qua chấm khác.
   Ai đến lượt mà không còn nước đi hợp lệ nào thì THUA.

   (Bản gốc Sprouts dùng đường cong; bản này dùng đoạn thẳng để vẽ gọn và đồng bộ
    online dễ — chỉ gửi {a,b}. Không hỗ trợ nối một chấm với chính nó.) */
(function () {
  const EPS_SPOT = 3.2;   // khoảng cách tối thiểu từ chấm tới đoạn (đơn vị viewBox 0..100)
  const SHRINK = 0.06;    // co đoạn để bỏ qua điểm chạm tại đầu mút chung

  function orient(ax, ay, bx, by, cx, cy) {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(v) < 1e-9) return 0;
    return v > 0 ? 1 : -1;
  }
  function onSeg(ax, ay, bx, by, px, py) {
    return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9 &&
      Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
  }
  // hai đoạn (p1p2) và (p3p4) có giao nhau "thật" không (đã co đầu mút)
  function segCross(p1, p2, p3, p4) {
    const o1 = orient(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    const o2 = orient(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
    const o3 = orient(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
    const o4 = orient(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
    if (o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4) return true;
    if (o1 === 0 && onSeg(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)) return true;
    if (o2 === 0 && onSeg(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y)) return true;
    if (o3 === 0 && onSeg(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y)) return true;
    if (o4 === 0 && onSeg(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y)) return true;
    return false;
  }
  function shrink(a, b) {
    return [
      { x: a.x + (b.x - a.x) * SHRINK, y: a.y + (b.y - a.y) * SHRINK },
      { x: b.x + (a.x - b.x) * SHRINK, y: b.y + (a.y - b.y) * SHRINK },
    ];
  }
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return Math.hypot(px - x, py - y);
  }

  // ---------- logic thuần trên trạng thái {spots, segs} ----------
  function legal(st, a, b) {
    if (a === b) return false;
    const sa = st.spots[a], sb = st.spots[b];
    if (sa.deg >= 3 || sb.deg >= 3) return false;
    const A = { x: sa.x, y: sa.y }, B = { x: sb.x, y: sb.y };
    // không đi xuyên qua chấm khác
    for (let i = 0; i < st.spots.length; i++) {
      if (i === a || i === b) continue;
      const s = st.spots[i];
      if (distToSeg(s.x, s.y, A.x, A.y, B.x, B.y) < EPS_SPOT) return false;
    }
    // không cắt đoạn đã có
    const [A2, B2] = shrink(A, B);
    for (const sg of st.segs) {
      const C = st.spots[sg.a], D = st.spots[sg.b];
      const [C2, D2] = shrink({ x: C.x, y: C.y }, { x: D.x, y: D.y });
      if (segCross(A2, B2, C2, D2)) return false;
    }
    return true;
  }
  function listMoves(st) {
    const out = [];
    for (let i = 0; i < st.spots.length; i++) for (let j = i + 1; j < st.spots.length; j++) if (legal(st, i, j)) out.push({ a: i, b: j });
    return out;
  }
  function applyConnect(st, a, b, owner) {
    const sa = st.spots[a], sb = st.spots[b];
    const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
    const m = st.spots.length;
    st.spots.push({ x: mx, y: my, deg: 2 });
    sa.deg++; sb.deg++;
    st.segs.push({ a, b: m, owner }, { a: m, b, owner });
  }
  function cloneState(st) {
    return { spots: st.spots.map((s) => ({ x: s.x, y: s.y, deg: s.deg })), segs: st.segs.map((g) => ({ a: g.a, b: g.b, owner: g.owner })) };
  }

  function create(ctx) {
    const o = ctx.options || {};
    const n0 = [2, 3, 4].includes(Number(o.spots)) ? Number(o.spots) : 3;

    const S = { spots: [], segs: [] };
    // chấm ban đầu trên đường tròn
    for (let i = 0; i < n0; i++) {
      const ang = (Math.PI * 2 * i) / n0 - Math.PI / 2;
      S.spots.push({ x: 50 + 30 * Math.cos(ang), y: 50 + 30 * Math.sin(ang), deg: 0 });
    }

    let turn = 0;
    let over = false;
    let sel = -1;

    const root = document.createElement("div");
    root.className = "spr-root";
    ctx.boardEl.appendChild(root);
    const hud = document.createElement("div");
    hud.className = "spr-hud";
    root.appendChild(hud);
    const stage = document.createElement("div");
    stage.className = "spr-stage";
    root.appendChild(stage);

    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function applyMove(move, fromRemote) {
      if (over) return;
      const a = Number(move && move.a), b = Number(move && move.b);
      if (!Number.isInteger(a) || !Number.isInteger(b) || !legal(S, a, b)) return;
      applyConnect(S, a, b, turn);
      sel = -1;
      ctx.sound("place");
      if (!fromRemote) ctx.sendMove({ a, b });

      // sau nước đi này, đối thủ còn nước không?
      const next = 1 - turn;
      if (listMoves(S).length === 0) {
        over = true;
        ctx.incScore(turn); // người vừa đi thắng vì đối thủ hết nước
        ctx.setTurn(-1);
        ctx.sound("win");
        const wname = ctx.vsAI ? (turn === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1));
        const lname = ctx.vsAI ? (next === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (next + 1), "Player " + (next + 1));
        ctx.setStatus(ctx.t(`🎉 ${wname} thắng! ${lname} không còn nước đi nào.`,
          `🎉 ${wname} wins! ${lname} has no legal move left.`));
        render();
        return;
      }
      turn = next;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function onSpot(i) {
      if (!canAct()) return;
      const s = S.spots[i];
      if (sel === -1) {
        if (s.deg < 3) { sel = i; render(); }
        return;
      }
      if (i === sel) { sel = -1; render(); return; }
      if (legal(S, sel, i)) { applyMove({ a: sel, b: i }, false); return; }
      // chọn lại nếu chấm khác còn sống
      if (s.deg < 3) { sel = i; render(); } else { sel = -1; render(); }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang nối...", "Opponent is connecting...")); return; }
      const who = ctx.vsAI ? (turn === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1));
      const tip = sel === -1 ? ctx.t("chọn chấm đầu tiên.", "pick the first dot.") : ctx.t("chọn chấm thứ hai để nối.", "pick the second dot to connect.");
      ctx.setStatus(`${who}: ${tip}`);
    }

    // ---------------- AI ----------------
    function countMoves(st) { return listMoves(st).length; }
    function aiMove(level) {
      if (!canAct()) return null;
      const moves = listMoves(S);
      if (!moves.length) return null;
      if (level === "easy") return moves[Math.floor(ctx.rng() * moves.length)];
      if (level === "hard") {
        const win = solveWin(S, 0, 1400);
        if (win && win.move) return win.move;
      }
      // Vừa / fallback Khó: chọn nước khiến đối thủ còn ít nước nhất
      let best = moves[0], bestC = Infinity;
      for (const m of moves) {
        const st = cloneState(S); applyConnect(st, m.a, m.b, turn);
        const c = countMoves(st);
        if (c < bestC) { bestC = c; best = m; }
      }
      return best;
    }
    // minimax có giới hạn nút: trả {win:bool, move} cho NGƯỜI ĐANG ĐI (chuẩn: hết nước thì thua)
    let budget;
    function solveWin(st, depthFlag, startBudget) {
      budget = startBudget;
      const moves = listMoves(st);
      for (const m of moves) {
        const ns = cloneState(st); applyConnect(ns, m.a, m.b, 0);
        const r = winnerToMove(ns);
        if (r === false) return { win: true, move: m }; // đối thủ (tới lượt) thua -> ta thắng
        if (budget < 0) break;
      }
      return null;
    }
    // người TỚI LƯỢT ở trạng thái st có thắng không (true/false)
    function winnerToMove(st) {
      if (budget-- < 0) return null;
      const moves = listMoves(st);
      if (moves.length === 0) return false; // không đi được -> thua
      for (const m of moves) {
        const ns = cloneState(st); applyConnect(ns, m.a, m.b, 0);
        const r = winnerToMove(ns);
        if (r === false) return true; // đẩy đối thủ vào thế thua
        if (budget < 0) return null;
      }
      return false;
    }

    // ---------------- Giao diện ----------------
    const COL = ["#ff5d73", "#3da9fc"];
    function render() {
      const moveCount = canAct() ? listMoves(S).length : 0;
      const p2name = ctx.vsAI ? ctx.t("🤖 Máy", "🤖 AI") : ctx.t("🔵 Người 2", "🔵 P2");
      hud.innerHTML =
        `<div class="spr-side p1 ${turn === 0 && !over ? "active" : ""}"><span>🔴 ${ctx.t("Người 1", "P1")}</span></div>` +
        `<div class="spr-mid">${over ? "🏁" : "🌱"}</div>` +
        `<div class="spr-side p2 ${turn === 1 && !over ? "active" : ""}"><span>${p2name}</span></div>`;

      let svg = `<svg class="spr-svg" viewBox="0 0 100 100" aria-label="Sprouts board">`;
      for (const g of S.segs) {
        const A = S.spots[g.a], B = S.spots[g.b];
        svg += `<line class="spr-seg" x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" stroke="${COL[g.owner] || "#888"}"></line>`;
      }
      for (let i = 0; i < S.spots.length; i++) {
        const s = S.spots[i];
        const dead = s.deg >= 3;
        const cls = "spr-dot" + (dead ? " dead" : "") + (i === sel ? " sel" : "");
        svg += `<circle class="${cls}" cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="${i === sel ? 3.4 : 2.8}" data-s="${i}"></circle>`;
        if (!dead && canAct()) svg += `<circle class="spr-hit" cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="5.5" data-s="${i}"></circle>`;
      }
      svg += `</svg>`;
      stage.innerHTML = svg;
      void moveCount;

      if (canAct()) {
        stage.querySelectorAll(".spr-hit").forEach((c) => {
          c.addEventListener("click", () => onSpot(Number(c.getAttribute("data-s"))));
        });
        stage.querySelectorAll(".spr-dot").forEach((c) => {
          c.addEventListener("click", () => onSpot(Number(c.getAttribute("data-s"))));
        });
      }
    }

    ctx.setNames(ctx.t("Người 1 (Đỏ)", "Player 1 (Red)"), ctx.vsAI ? ctx.t("Máy (Xanh)", "AI (Blue)") : ctx.t("Người 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    updateStatus();
    render();

    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "sprouts",
    name: "Mầm Cây",
    emoji: "🌱",
    description: "Nối hai chấm bằng một đoạn, một chấm mới mọc ở giữa. Mỗi chấm tối đa 3 nối, đoạn không được cắt nhau. Ai bí nước thì thua.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "spots", label: "Số chấm khởi đầu", default: 3,
        choices: [
          { value: 2, label: "2 (rất ngắn)" },
          { value: 3, label: "3 (chuẩn)" },
          { value: 4, label: "4 (dài hơn)" },
        ],
      },
    ],
    howTo: [
      "Bắt đầu với vài chấm. Mỗi lượt, bạn chọn hai chấm rồi nối chúng bằng một đoạn thẳng.",
      "Ngay khi nối xong, một CHẤM MỚI tự mọc ở giữa đoạn vừa vẽ (chấm này đã có sẵn 2 nối).",
      "Mỗi chấm chỉ được nối tối đa 3 đoạn. Chấm đủ 3 nối sẽ 'chết' (mờ đi), không nối được nữa.",
      "Đoạn mới KHÔNG được cắt ngang đoạn đã vẽ và không được đi xuyên qua chấm khác.",
      "Ai tới lượt mà không còn cặp chấm nào nối hợp lệ thì THUA. Hãy tính trước để dồn đối thủ vào thế bí.",
      "Bản này dùng đoạn thẳng (không nối chấm với chính nó). Chơi chung máy, đấu máy hoặc online.",
    ],
    create,
  });
})();
