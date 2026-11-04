/* Sim — Tam Giác Cấm (Game of Sim)
   6 điểm xếp thành lục giác, có 15 cạnh nối mọi cặp điểm. Hai người thay nhau
   TÔ MÀU một cạnh bằng màu của mình (P1 đỏ, P2 xanh). Ai TẠO RA một tam giác
   gồm 3 cạnh CÙNG MÀU của mình trước thì THUA. Theo định lý Ramsey R(3,3)=6,
   ván đấu không bao giờ hòa — luôn có người tạo tam giác trước.

   Đồng bộ online: chỉ gửi chỉ số cạnh {e}; trạng thái suy ra tất định. */
(function () {
  const N = 6;
  // 15 cạnh (i<j)
  const EDGES = [];
  const EI = {};
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { EI[i + "," + j] = EDGES.length; EDGES.push([i, j]); }
  function edgeIndex(a, b) { return a < b ? EI[a + "," + b] : EI[b + "," + a]; }
  // 20 tam giác, mỗi tam giác = 3 chỉ số cạnh
  const TRIS = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (let c = b + 1; c < N; c++)
    TRIS.push([edgeIndex(a, b), edgeIndex(a, c), edgeIndex(b, c)]);

  // toạ độ 6 điểm trên đường tròn (viewBox 0..100)
  const PTS = [];
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i) / N - Math.PI / 2;
    PTS.push([50 + 40 * Math.cos(ang), 50 + 40 * Math.sin(ang)]);
  }

  function create(ctx) {
    const owner = Array(EDGES.length).fill(-1);
    let turn = 0;
    let over = false;
    let lastEdge = -1;
    let losingTri = null; // [e,e,e] tam giác thua để tô sáng

    const root = document.createElement("div");
    root.className = "sim-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "sim-hud";
    root.appendChild(hud);

    const stage = document.createElement("div");
    stage.className = "sim-stage";
    root.appendChild(stage);

    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function emptyEdges() { const o = []; for (let e = 0; e < owner.length; e++) if (owner[e] === -1) o.push(e); return o; }

    // người p có tạo tam giác cùng màu chưa? trả về [tri] hoặc null
    function triangleOf(p) {
      for (const t of TRIS) if (owner[t[0]] === p && owner[t[1]] === p && owner[t[2]] === p) return t;
      return null;
    }
    // đặt thử cạnh e cho p có tạo tam giác của p không
    function makesTriangle(e, p) {
      owner[e] = p; const t = triangleOf(p); owner[e] = -1; return t;
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const e = Number(move && move.e);
      if (!Number.isInteger(e) || e < 0 || e >= owner.length || owner[e] !== -1) return;
      const p = turn;
      owner[e] = p;
      lastEdge = e;
      ctx.sound("place");
      if (!fromRemote) ctx.sendMove({ e });

      const tri = triangleOf(p);
      if (tri) {
        over = true; losingTri = tri;
        const winner = 1 - p;
        ctx.incScore(winner);
        ctx.setTurn(-1);
        const wname = ctx.vsAI ? (winner === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (winner + 1), "Player " + (winner + 1));
        const lname = ctx.vsAI ? (p === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (p + 1), "Player " + (p + 1));
        ctx.sound("lose");
        ctx.setStatus(ctx.t(`🎉 ${wname} thắng! ${lname} đã tạo tam giác cùng màu.`,
          `🎉 ${wname} wins! ${lname} formed a same-color triangle.`));
        render();
        return;
      }
      if (emptyEdges().length === 0) { // an toàn — gần như không xảy ra
        over = true; ctx.setTurn(-1);
        ctx.setStatus(ctx.t("🤝 Hết cạnh — hòa.", "🤝 No edges left — draw."));
        render();
        return;
      }
      turn = 1 - p;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang chọn cạnh...", "Opponent is choosing an edge..."));
        return;
      }
      const who = ctx.vsAI ? (turn === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1));
      ctx.setStatus(ctx.t(`${who}: tô một cạnh — ĐỪNG để 3 cạnh cùng màu tạo thành tam giác!`,
        `${who}: color an edge — DON'T let three of your edges form a triangle!`));
    }

    // ---------------- AI ----------------
    // Giải hoàn hảo khi còn ít cạnh; nếu nhiều thì dùng heuristic.
    const memo = new Map();
    function key() { return owner.join(""); }
    // trả về người THẮNG nếu tới lượt p đi với luật chuẩn (tạo tam giác = thua)
    function solve(p) {
      const k = key() + "|" + p;
      if (memo.has(k)) return memo.get(k);
      const empty = emptyEdges();
      const safe = empty.filter((e) => !makesTriangle(e, p));
      let res;
      if (safe.length === 0) {
        res = 1 - p; // p buộc phải tạo tam giác -> thua
      } else {
        res = 1 - p; // mặc định p thua trừ khi tìm được nước thắng
        for (const e of safe) {
          owner[e] = p; const w = solve(1 - p); owner[e] = -1;
          if (w === p) { res = p; break; }
        }
      }
      memo.set(k, res);
      return res;
    }

    function aiMove(level) {
      if (!canAct()) return null;
      const p = turn;
      const empty = emptyEdges();
      const safe = empty.filter((e) => !makesTriangle(e, p));
      if (safe.length === 0) return { e: empty[Math.floor(ctx.rng() * empty.length)] }; // buộc thua
      if (level === "easy") {
        // đôi khi đi liều (có thể tự thua)
        if (ctx.rng() < 0.35) return { e: empty[Math.floor(ctx.rng() * empty.length)] };
        return { e: safe[Math.floor(ctx.rng() * safe.length)] };
      }
      // Khó/Vừa: nếu đủ ít cạnh thì giải hoàn hảo
      if (empty.length <= 9) {
        memo.clear();
        const winning = [];
        for (const e of safe) { owner[e] = p; const w = solve(1 - p); owner[e] = -1; if (w === p) winning.push(e); }
        const pool = winning.length ? winning : safe;
        // trong nhóm, chọn nước khiến đối thủ ít nước an toàn nhất
        return { e: pickHardest(pool, p) };
      }
      if (level === "hard") return { e: pickHardest(safe, p) };
      return { e: safe[Math.floor(ctx.rng() * safe.length)] };
    }

    // chọn cạnh làm đối thủ còn ÍT nước an toàn nhất (ép đối thủ vào thế bí)
    function pickHardest(pool, p) {
      let best = pool[0], bestScore = Infinity;
      for (const e of pool) {
        owner[e] = p;
        const opp = 1 - p;
        let oppSafe = 0;
        for (let f = 0; f < owner.length; f++) if (owner[f] === -1 && !makesTriangle(f, opp)) oppSafe++;
        owner[e] = -1;
        if (oppSafe < bestScore) { bestScore = oppSafe; best = e; }
      }
      return best;
    }

    // ---------------- Giao diện ----------------
    const COL = ["#ff5d73", "#3da9fc"]; // p1 đỏ, p2 xanh

    function render() {
      const c0 = owner.filter((x) => x === 0).length;
      const c1 = owner.filter((x) => x === 1).length;
      const p2name = ctx.vsAI ? ctx.t("🤖 Máy", "🤖 AI") : ctx.t("🔵 Người 2", "🔵 P2");
      hud.innerHTML =
        `<div class="sim-side p1 ${turn === 0 && !over ? "active" : ""}"><span>🔴 ${ctx.t("Người 1", "P1")}</span><b>${c0}</b></div>` +
        `<div class="sim-mid">${over ? "🏁" : "🔺"}</div>` +
        `<div class="sim-side p2 ${turn === 1 && !over ? "active" : ""}"><span>${p2name}</span><b>${c1}</b></div>`;

      const lostSet = losingTri ? new Set(losingTri) : null;
      let svg = `<svg class="sim-svg" viewBox="0 0 100 100" aria-label="Sim board">`;
      // cạnh
      for (let e = 0; e < EDGES.length; e++) {
        const [a, b] = EDGES[e];
        const [x1, y1] = PTS[a], [x2, y2] = PTS[b];
        if (owner[e] === -1) {
          svg += `<line class="sim-edge empty" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-e="${e}"></line>`;
          // vùng chạm rộng (vô hình) để dễ bấm
          if (canAct()) svg += `<line class="sim-hit" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-e="${e}"></line>`;
        } else {
          const cls = "sim-edge owned p" + (owner[e] + 1) +
            (e === lastEdge ? " last" : "") + (lostSet && lostSet.has(e) ? " lose" : "");
          svg += `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COL[owner[e]]}"></line>`;
        }
      }
      // điểm
      for (let i = 0; i < N; i++) {
        const [x, y] = PTS[i];
        svg += `<circle class="sim-dot" cx="${x}" cy="${y}" r="3.4"></circle>`;
      }
      svg += `</svg>`;
      stage.innerHTML = svg;

      if (canAct()) {
        stage.querySelectorAll(".sim-hit").forEach((ln) => {
          ln.addEventListener("click", () => {
            const e = Number(ln.getAttribute("data-e"));
            // cảnh báo trực quan: nếu nước này tự tạo tam giác vẫn cho đi (người chơi tự chịu)
            applyMove({ e }, false);
          });
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
    id: "sim",
    name: "Tam Giác Cấm",
    emoji: "🔺",
    description: "6 điểm, 15 cạnh — thay nhau tô màu cạnh. Ai lỡ tạo tam giác CÙNG MÀU của mình trước thì thua. Không bao giờ hòa.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Có 6 điểm và 15 cạnh nối tất cả các cặp điểm. Người 1 tô màu ĐỎ, người 2 tô màu XANH.",
      "Mỗi lượt bạn tô màu một cạnh còn trống bằng màu của mình.",
      "BẪY: nếu 3 cạnh CÙNG MÀU của bạn tạo thành một tam giác (3 điểm nối kín) thì BẠN THUA ngay.",
      "Tam giác của đối thủ (khác màu) thì không sao — chỉ tam giác cùng màu của chính bạn mới giết bạn.",
      "Theo toán học, ván đấu không bao giờ hòa: sớm muộn cũng có người buộc phải tạo tam giác. Hãy ép đối thủ vào thế đó!",
      "Chơi chung máy, đấu máy hoặc online với bạn.",
    ],
    create,
  });
})();
