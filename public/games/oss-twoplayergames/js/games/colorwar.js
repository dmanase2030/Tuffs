/* Lan Màu (Color War / Filler) — chơi chung máy, ĐẤU MÁY và ONLINE
   Bàn ô màu ngẫu nhiên. P1 sở hữu góc dưới-trái, P2 góc trên-phải. Đến lượt, chọn
   một MÀU (khác màu hiện tại của cả hai) — toàn vùng của bạn đổi sang màu đó và
   "nuốt" mọi ô cùng màu liền kề, mở rộng lãnh thổ. Ai chiếm > nửa số ô thì thắng;
   hết ô trống thì ai nhiều ô hơn thắng.

   Đồng bộ online: bàn sinh tất định từ ctx.rng (chung seed); chỉ gửi màu đã chọn. */
(function () {
  const COLORS = ["#ff5d73", "#ffd166", "#6ee7b7", "#4dd0e1", "#c792ea", "#ff9f7a"];

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size ? Number(o.size) : 8;          // bàn N×N
    const NC = o.colors ? Number(o.colors) : 6;     // số màu dùng

    // grid[r][c] = chỉ số màu; owner[r][c] = -1 trung lập / 0 / 1
    let grid = [];
    let owner = [];
    let turn = ctx.isOnline ? ctx.firstSeat : 0;
    let over = false;

    // góc xuất phát: P1 = (N-1,0) dưới-trái, P2 = (0,N-1) trên-phải
    const HOME = [{ r: N - 1, c: 0 }, { r: 0, c: N - 1 }];

    const root = document.createElement("div");
    root.className = "cw-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function buildGrid() {
      grid = [];
      for (let r = 0; r < N; r++) {
        const row = [];
        for (let c = 0; c < N; c++) row.push(Math.floor(ctx.rng() * NC));
        grid.push(row);
      }
      // đảm bảo 2 góc nhà khác màu nhau
      if (grid[HOME[0].r][HOME[0].c] === grid[HOME[1].r][HOME[1].c]) {
        grid[HOME[1].r][HOME[1].c] = (grid[HOME[1].r][HOME[1].c] + 1) % NC;
      }
      owner = [];
      for (let r = 0; r < N; r++) owner.push(new Array(N).fill(-1));
      owner[HOME[0].r][HOME[0].c] = 0;
      owner[HOME[1].r][HOME[1].c] = 1;
      // lan màu ban đầu từ 2 góc (gom ô cùng màu liền kề)
      flood(0); flood(1);
    }

    function colorOf(seat) { return grid[HOME[seat].r][HOME[seat].c]; }

    // lan: gom mọi ô cùng MÀU liền kề vùng của seat vào vùng đó
    function flood(seat) {
      const target = colorOf(seat);
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (owner[r][c] !== -1 || grid[r][c] !== target) continue;
          // có ô liền kề thuộc seat?
          const nb = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
          if (nb.some(([nr, nc]) => nr >= 0 && nr < N && nc >= 0 && nc < N && owner[nr][nc] === seat)) {
            owner[r][c] = seat; changed = true;
          }
        }
      }
    }

    function countOwned(seat) {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (owner[r][c] === seat) n++;
      return n;
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    // màu hợp lệ để chọn: khác màu hiện tại của mình VÀ của đối thủ
    function legalColor(ci) {
      return ci !== colorOf(turn) && ci !== colorOf(1 - turn);
    }

    // Hành động: { k:"color", ci }
    function applyMove(move, fromRemote) {
      if (over || move.k !== "color") return;
      const ci = Number(move.ci);
      if (ci < 0 || ci >= NC || !legalColor(ci)) return;
      if (!fromRemote) ctx.sendMove({ k: "color", ci });

      const me = turn;
      // đổi toàn vùng của mình sang màu mới
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (owner[r][c] === me) grid[r][c] = ci;
      flood(me);
      ctx.sound("place");

      const c0 = countOwned(0), c1 = countOwned(1), total = N * N;
      if (c0 > total / 2 || c1 > total / 2 || c0 + c1 === total) {
        finish(c0 === c1 ? -1 : (c0 > c1 ? 0 : 1), c0, c1);
        return;
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
      render(); updateStatus();
      maybeAI();
    }

    function finish(winner, c0, c1) {
      over = true;
      if (winner >= 0) ctx.incScore(winner);
      ctx.setTurn(-1);
      const wn = (s) => ctx.vsAI ? (s === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (s + 1), "Player " + (s + 1));
      ctx.setStatus(winner < 0
        ? ctx.t(`🤝 Hòa ${c0}–${c1} ô!`, `🤝 Draw ${c0}–${c1} cells!`)
        : ctx.t(`🎉 ${wn(winner)} thắng — chiếm ${winner === 0 ? c0 : c1} ô!`, `🎉 ${wn(winner)} wins — ${winner === 0 ? c0 : c1} cells!`));
      render();
    }

    // ----- AI: chọn màu chiếm thêm nhiều ô nhất (greedy); hard nhìn xa hơn chút -----
    function gainIfPick(seat, ci) {
      // mô phỏng: đếm số ô sẽ thuộc seat nếu đổi sang màu ci
      const tmpOwner = owner.map((row) => row.slice());
      const tmpGrid = grid.map((row) => row.slice());
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (tmpOwner[r][c] === seat) tmpGrid[r][c] = ci;
      const target = ci;
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          if (tmpOwner[r][c] !== -1 || tmpGrid[r][c] !== target) continue;
          const nb = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
          if (nb.some(([nr, nc]) => nr >= 0 && nr < N && nc >= 0 && nc < N && tmpOwner[nr][nc] === seat)) {
            tmpOwner[r][c] = seat; changed = true;
          }
        }
      }
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (tmpOwner[r][c] === seat) n++;
      return n;
    }

    function aiMove() {
      if (over) return null;
      const me = turn;
      let best = -1, bestCi = -1;
      for (let ci = 0; ci < NC; ci++) {
        if (!legalColor(ci)) continue;
        const g = gainIfPick(me, ci);
        if (g > best) { best = g; bestCi = ci; }
      }
      if (bestCi < 0) {
        // không còn màu hợp lệ (hiếm) -> chọn bất kỳ khác màu mình
        for (let ci = 0; ci < NC; ci++) if (ci !== colorOf(me)) { bestCi = ci; break; }
      }
      // easy: đôi khi chọn ngẫu nhiên
      if (ctx.aiLevel === "easy" && ctx.rng() < 0.4) {
        const opts = [];
        for (let ci = 0; ci < NC; ci++) if (legalColor(ci)) opts.push(ci);
        if (opts.length) bestCi = opts[Math.floor(ctx.rng() * opts.length)];
      }
      return { k: "color", ci: bestCi };
    }

    function maybeAI() {
      if (over || ctx.isOnline || !ctx.vsAI || turn !== 1) return;
      setTimeout(() => { if (!over && turn === 1) { const mv = aiMove(); if (mv) applyMove(mv, true); } }, 600);
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="cw-head" id="cwHead"></div>` +
        `<div class="cw-board" id="cwBoard" style="grid-template-columns:repeat(${N},1fr)"></div>` +
        `<div class="cw-palette" id="cwPalette"></div>`;
      els = { head: root.querySelector("#cwHead"), board: root.querySelector("#cwBoard"), palette: root.querySelector("#cwPalette") };
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const d = document.createElement("div");
        d.className = "cw-cell"; d.dataset.r = r; d.dataset.c = c;
        els.board.appendChild(d);
      }
    }

    function render() {
      if (!els) buildShell();
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const c0 = countOwned(0), c1 = countOwned(1), total = N * N;
      const p1name = (me === 0 || ctx.vsAI) ? ctx.t("Bạn", "You") : "P1";
      const p2name = ctx.vsAI ? ctx.t("Máy", "AI") : (me === 1 ? ctx.t("Bạn", "You") : "P2");
      els.head.innerHTML =
        `<div class="cw-pinfo p1 ${turn === 0 && !over ? "active" : ""}"><span style="color:${COLORS[colorOf(0)]}">⬣ ${p1name}</span><b>${c0}</b></div>` +
        `<div class="cw-mid">${total} ${ctx.t("ô", "cells")}</div>` +
        `<div class="cw-pinfo p2 ${turn === 1 && !over ? "active" : ""}"><span style="color:${COLORS[colorOf(1)]}">⬣ ${p2name}</span><b>${c1}</b></div>`;

      const cells = els.board.children;
      let k = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const d = cells[k++];
        d.style.background = COLORS[grid[r][c]];
        d.className = "cw-cell" + (owner[r][c] === 0 ? " own-p1" : owner[r][c] === 1 ? " own-p2" : "");
      }
      renderPalette();
    }

    function renderPalette() {
      if (over) { els.palette.innerHTML = `<div class="cw-over">${ctx.t("Ván đã kết thúc.", "Game over.")}</div>`; return; }
      if (!canPlay() || (ctx.vsAI && turn === 1)) {
        els.palette.innerHTML = `<div class="cw-wait">${ctx.vsAI && turn === 1 ? ctx.t("Máy đang chọn...", "Computer is picking...") : ctx.t("Chờ đối thủ...", "Waiting for opponent...")}</div>`;
        return;
      }
      let html = `<div class="cw-plabel">${ctx.t("Chọn màu để lan vùng của bạn:", "Pick a color to spread your area:")}</div><div class="cw-swatches">`;
      for (let ci = 0; ci < NC; ci++) {
        const ok = legalColor(ci);
        html += `<button type="button" class="cw-sw${ok ? "" : " disabled"}" data-ci="${ci}" style="background:${COLORS[ci]}"${ok ? "" : " disabled"}></button>`;
      }
      html += `</div>`;
      els.palette.innerHTML = html;
      els.palette.querySelectorAll(".cw-sw").forEach((b) => {
        b.addEventListener("click", () => { const ci = Number(b.dataset.ci); if (legalColor(ci)) applyMove({ k: "color", ci }, false); });
      });
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang chọn màu...", "Opponent is picking...")); return; }
      if (ctx.vsAI && turn === 1) { ctx.setStatus(ctx.t("Máy đang chọn màu...", "Computer is picking...")); return; }
      ctx.setStatus(ctx.t("Chọn một màu (khác màu của bạn và đối thủ) để mở rộng lãnh thổ.", "Pick a color (not yours or the opponent's) to expand your territory."));
    }

    buildGrid();
    buildShell();
    ctx.setTurn(turn);
    render();
    updateStatus();
    maybeAI();

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "colorwar",
    name: "Lan Màu",
    emoji: "🎨",
    description: "Chọn màu để lan vùng của mình, nuốt ô liền kề — chiếm hơn nửa bàn thì thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 8,
        choices: [
          { value: 6, label: "6×6 (nhanh)" },
          { value: 8, label: "8×8" },
          { value: 10, label: "10×10 (lớn)" },
        ],
      },
      {
        id: "colors", label: "Số màu", default: 6,
        choices: [
          { value: 4, label: "4 màu (dễ)" },
          { value: 6, label: "6 màu" },
        ],
      },
    ],
    howTo: [
      "Bàn gồm các ô màu ngẫu nhiên. Bạn sở hữu góc dưới-trái, đối thủ góc trên-phải.",
      "Đến lượt, chọn một MÀU ở bảng màu — toàn bộ vùng của bạn đổi sang màu đó và 'nuốt' mọi ô cùng màu nằm liền kề, giúp lãnh thổ lan rộng.",
      "Bạn KHÔNG được chọn màu hiện tại của mình, cũng không được chọn màu hiện tại của đối thủ (các ô này bị làm mờ).",
      "Số ô mỗi người đang chiếm hiện ở thanh trên. Ai chiếm được HƠN NỬA số ô của bàn sẽ thắng ngay; nếu lấp kín bàn thì ai nhiều ô hơn thắng.",
      "Chiến thuật: chọn màu giúp nuốt được cụm ô lớn liền kề, đồng thời chặn hướng lan của đối thủ. Chơi chung máy, đấu với máy, hoặc online.",
    ],
    create,
  });
})();
