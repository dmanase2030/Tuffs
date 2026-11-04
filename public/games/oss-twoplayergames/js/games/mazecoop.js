/* Mê Cung Hợp Sức (Co-op Maze) — chơi chung máy & ONLINE
   Hai người CÙNG PHE tìm đường tới cửa thoát của mình (🟥 cho P1, 🟦 cho P2).
   Phải phối hợp: NÚT SÀN giữ cửa mở khi đứng lên, CẦN GẠT bật/tắt cổng.
   Cả hai cùng tới cửa thoát = qua màn. Giải hết các màn = cả đội THẮNG.

   Ký hiệu: '#'=tường, ' '=sàn, '1'/'2'=người, 'x'=thoát P1, 'y'=thoát P2,
   a/b/c=nút sàn (giữ) -> cửa A/B/C; p/q/r=cần gạt -> cổng P/Q/R (bật/tắt). */
(function () {
  const LEVELS = [
    { name: "Mở lối cho nhau", nameEn: "Open the way", rows: ["########", "#1  P x#", "##### ##", "#2 p  y#", "########"] },
    { name: "Gạt cần tiếp sức", nameEn: "Lever relay", rows: ["#########", "#1  p  x#", "### # ###", "#2  P  y#", "#########"] },
    { name: "Giữ cửa & gạt cần", nameEn: "Hold & switch", rows: ["##########", "#1 A   px#", "#### #####", "#a 2 P  y#", "##########"] },
    { name: "Hai cần gạt", nameEn: "Two levers", rows: ["##########", "#1  P  q x#", "#### #####", "#p 2 Q  y#", "##########"] },
    { name: "Hai cửa giữ", nameEn: "Two held doors", rows: ["##########", "#1 A  B x#", "## # # ###", "#a 2  b y#", "##########"] },
    { name: "Phối hợp kép", nameEn: "Double coordination", rows: ["###########", "#1  A  p  x#", "##### #####", "#a   2   q#", "##### #####", "#Q  b   y#", "###########"] },
  ];
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const COLORS = ["#ff5d73", "#4dd0e1"];

  function create(ctx) {
    const online = ctx.isOnline;
    const mySeat = online ? ctx.mySeat : -1;
    let li = 0, W = 0, H = 0;
    let walls, plates, holdDoors, levers, gates, exits, players, gateOpen;
    let steps = 0, over = false, transitioning = false;
    let faceDir = [1, 1];

    const root = document.createElement("div");
    root.className = "mz-root";
    ctx.boardEl.appendChild(root);
    const hud = document.createElement("div");
    hud.className = "mz-hud";
    root.appendChild(hud);
    const stage = document.createElement("div");
    stage.className = "mz-stage";
    root.appendChild(stage);
    const pads = document.createElement("div");
    pads.className = "mz-pads";
    root.appendChild(pads);

    let tilesEl, entsEl, overlayEl;
    let playerEls = [null, null];

    const idx = (r, c) => r * W + c;
    const rc = (i) => [Math.floor(i / W), i % W];
    function bestKey() { return "tpg_mz_best_" + li; }
    function getBest() { try { return +localStorage.getItem(bestKey()) || 0; } catch (e) { return 0; } }
    function setBest(v) { try { localStorage.setItem(bestKey(), String(v)); } catch (e) { /* ignore */ } }

    function loadLevel(n) {
      const lv = LEVELS[n];
      W = Math.max(...lv.rows.map((s) => s.length));
      H = lv.rows.length;
      walls = new Set(); plates = new Map(); holdDoors = new Map(); levers = new Map(); gates = new Map(); exits = {}; gateOpen = {};
      players = [-1, -1];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const ch = lv.rows[r][c] || "#"; const i = idx(r, c);
        if (ch === "#") walls.add(i);
        else if (ch === "1") players[0] = i;
        else if (ch === "2") players[1] = i;
        else if (ch === "x") exits.p1 = i;
        else if (ch === "y") exits.p2 = i;
        else if (ch >= "a" && ch <= "c") plates.set(i, ch);
        else if (ch >= "A" && ch <= "C") holdDoors.set(i, ch.toLowerCase());
        else if (ch >= "p" && ch <= "r") levers.set(i, ch);
        else if (ch >= "P" && ch <= "R") { gates.set(i, ch.toLowerCase()); gateOpen[ch.toLowerCase()] = false; }
      }
      steps = 0; faceDir = [1, 1];
    }

    function occupied(cell) { return players[0] === cell || players[1] === cell; }
    function activeHold() {
      const need = {}, have = {};
      plates.forEach((g, cell) => { need[g] = (need[g] || 0) + 1; if (occupied(cell)) have[g] = (have[g] || 0) + 1; });
      const a = new Set(); Object.keys(need).forEach((g) => { if ((have[g] || 0) >= need[g]) a.add(g); }); return a;
    }
    function cellOpen(cell, active) {
      if (holdDoors.has(cell)) return active.has(holdDoors.get(cell));
      if (gates.has(cell)) return !!gateOpen[gates.get(cell)];
      return true;
    }

    function tryMove(seat, dir, fromRemote) {
      if (over || transitioning) return false;
      if (online && !fromRemote && seat !== mySeat) return false;
      const d = DIRS[dir]; if (!d) return false;
      const [r, c] = rc(players[seat]);
      const nr = r + d[0], nc = c + d[1];
      if (d[1] !== 0) faceDir[seat] = d[1] > 0 ? 1 : -1;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) { bump(seat); return false; }
      const ncell = idx(nr, nc);
      if (walls.has(ncell) || players[1 - seat] === ncell) { bump(seat); return false; }
      const active = activeHold();
      if ((holdDoors.has(ncell) || gates.has(ncell)) && !cellOpen(ncell, active)) { bump(seat); return false; }
      players[seat] = ncell;
      if (levers.has(ncell)) { const g = levers.get(ncell); gateOpen[g] = !gateOpen[g]; ctx.sound("place"); pulseLever(ncell); }
      else ctx.sound("select");
      steps++;
      if (!fromRemote && online) ctx.sendMove({ k: "move", seat: mySeat, dir });
      afterMove();
      return true;
    }

    function bump(seat) { const el = playerEls[seat]; if (!el) return; el.classList.remove("mz-bump"); void el.offsetWidth; el.classList.add("mz-bump"); }
    function pulseLever() { /* hiệu ứng cổng tự cập nhật ở renderTiles */ }

    function afterMove() {
      positionEnts(); renderTiles(); renderHud();
      if (isSolved()) {
        transitioning = true;
        ctx.sound("win");
        const best = getBest();
        if (!best || steps < best) setBest(steps);
        celebrate();
        const last = li >= LEVELS.length - 1;
        showOverlay(last ? ctx.t("🎉 Thoát hết mê cung!", "🎉 All mazes escaped!")
          : ctx.t(`✅ Qua mê cung ${li + 1}! (${steps} bước)`, `✅ Maze ${li + 1} done! (${steps} steps)`), last ? "win" : "clear");
        setTimeout(() => {
          transitioning = false;
          if (last) { finishAll(); return; }
          li++; loadLevel(li); buildStage(); renderAll(); introBanner();
        }, 1150);
      }
    }

    function isSolved() { return players[0] === exits.p1 && players[1] === exits.p2; }

    function finishAll() {
      over = true; ctx.setTurn(-1); ctx.incScore(0); ctx.sound("win");
      ctx.setStatus(ctx.t(`🎉 Cả đội thoát hết ${LEVELS.length} mê cung!`, `🎉 The team escaped all ${LEVELS.length} mazes!`));
    }

    function restart(fromRemote) {
      if (!fromRemote && online) ctx.sendMove({ k: "restart" });
      transitioning = false; over = false;
      loadLevel(li); buildStage(); renderAll(); updateStatus();
    }

    function applyMove(move, fromRemote) {
      if (!move) return;
      if (move.k === "move") { tryMove(Number(move.seat), move.dir, !!fromRemote); return; }
      if (move.k === "restart") { restart(true); return; }
    }

    // ---------- Sân khấu ----------
    function buildStage() {
      stage.innerHTML = `<div class="mz-board" style="aspect-ratio:${W}/${H}">
        <div class="mz-tiles"></div><div class="mz-ents"></div><div class="mz-overlay"></div></div>`;
      tilesEl = stage.querySelector(".mz-tiles");
      entsEl = stage.querySelector(".mz-ents");
      overlayEl = stage.querySelector(".mz-overlay");
      tilesEl.style.gridTemplateColumns = `repeat(${W},1fr)`;
      tilesEl.style.gridTemplateRows = `repeat(${H},1fr)`;
      entsEl.innerHTML = "";
      for (let s = 0; s < 2; s++) {
        const el = document.createElement("div");
        el.className = "mz-ent mz-p mz-p" + (s + 1);
        el.style.setProperty("--pc", COLORS[s]);
        el.innerHTML = `<span class="mz-p-face">${s === 0 ? "🧑" : "🧑"}</span>`;
        entsEl.appendChild(el);
        playerEls[s] = el;
      }
    }

    function renderTiles() {
      const active = activeHold();
      let html = "";
      for (let i = 0; i < W * H; i++) {
        if (walls.has(i)) { html += `<div class="mz-cell mz-wall"></div>`; continue; }
        let cls = "mz-cell mz-floor"; let inner = "";
        if (exits.p1 === i) { cls += " mz-exit mz-exit1"; inner = `<span class="mz-ex">🏁</span>`; }
        if (exits.p2 === i) { cls += " mz-exit mz-exit2"; inner = `<span class="mz-ex">🏁</span>`; }
        if (plates.has(i)) cls += " mz-plate mz-grp-" + plates.get(i) + (occupied(i) ? " mz-pressed" : "");
        if (holdDoors.has(i)) cls += " mz-door mz-grp-" + holdDoors.get(i) + (cellOpen(i, active) ? " mz-open" : " mz-closed");
        if (levers.has(i)) { cls += " mz-lever mz-grp-" + levers.get(i) + (gateOpen[levers.get(i)] ? " mz-lv-on" : ""); inner = `<span class="mz-lv">🎚️</span>`; }
        if (gates.has(i)) cls += " mz-gate mz-grp-" + gates.get(i) + (cellOpen(i, active) ? " mz-open" : " mz-closed");
        html += `<div class="${cls}">${inner}</div>`;
      }
      tilesEl.innerHTML = html;
    }

    function place(el, cell) {
      const [r, c] = rc(cell);
      el.style.left = (c * 100 / W) + "%"; el.style.top = (r * 100 / H) + "%";
      el.style.width = (100 / W) + "%"; el.style.height = (100 / H) + "%";
    }
    function positionEnts() {
      for (let s = 0; s < 2; s++) {
        const el = playerEls[s]; if (!el) continue;
        place(el, players[s]);
        el.classList.toggle("mz-at-exit", players[s] === (s === 0 ? exits.p1 : exits.p2));
        const f = el.querySelector(".mz-p-face"); if (f) f.style.transform = `scaleX(${faceDir[s]})`;
      }
    }

    function renderHud() {
      const lv = LEVELS[li];
      const atP1 = players[0] === exits.p1, atP2 = players[1] === exits.p2;
      const best = getBest();
      hud.innerHTML =
        `<div class="mz-info"><b>${ctx.t("Mê cung", "Maze")} ${li + 1}/${LEVELS.length}</b> · <span>${ctx.t(lv.name, lv.nameEn)}</span></div>` +
        `<div class="mz-info">🟥 ${atP1 ? "✓" : "…"} · 🟦 ${atP2 ? "✓" : "…"} · 👣 ${steps}${best ? " · 🏅 " + best : ""}` +
        (online ? ` · <span style="color:${COLORS[mySeat] || "#fff"}">P${mySeat + 1} ${ctx.t("(bạn)", "(you)")}</span>` : "") + `</div>` +
        `<button type="button" class="btn small mz-restart">↺ ${ctx.t("Làm lại", "Restart")}</button>`;
      hud.querySelector(".mz-restart").addEventListener("click", () => restart(false));
    }

    function showOverlay(text, cls) { if (!overlayEl) return; overlayEl.innerHTML = `<div class="mz-banner mz-banner-${cls}">${text}</div>`; overlayEl.classList.add("show"); }
    function hideOverlay() { if (overlayEl) { overlayEl.classList.remove("show"); overlayEl.innerHTML = ""; } }
    function introBanner() { const lv = LEVELS[li]; showOverlay(`<small>${ctx.t("Mê cung", "Maze")} ${li + 1}/${LEVELS.length}</small><b>${ctx.t(lv.name, lv.nameEn)}</b>`, "intro"); setTimeout(hideOverlay, 1100); }
    function celebrate() {
      if (!overlayEl) return;
      let conf = "";
      for (let i = 0; i < 18; i++) { const x = Math.round(Math.random() * 100), delay = (Math.random() * 0.3).toFixed(2), hue = Math.floor(Math.random() * 360); conf += `<span class="mz-conf" style="left:${x}%;animation-delay:${delay}s;background:hsl(${hue},85%,60%)"></span>`; }
      const layer = document.createElement("div"); layer.className = "mz-confetti"; layer.innerHTML = conf; overlayEl.appendChild(layer);
      setTimeout(() => layer.remove(), 1400);
    }

    function dpad(seat) {
      return `<div class="mz-dpad" style="--mz-pc:${COLORS[seat]}">` +
        `<div class="mz-dpad-lbl">${seat === 0 ? "🟥" : "🟦"} P${seat + 1}${online && seat === mySeat ? ctx.t(" (bạn)", " (you)") : ""}</div>` +
        `<div class="mz-dpad-grid">` +
          `<button type="button" class="mz-db" data-seat="${seat}" data-dir="up">▲</button>` +
          `<button type="button" class="mz-db" data-seat="${seat}" data-dir="left">◀</button>` +
          `<button type="button" class="mz-db" data-seat="${seat}" data-dir="down">▼</button>` +
          `<button type="button" class="mz-db" data-seat="${seat}" data-dir="right">▶</button>` +
        `</div></div>`;
    }
    function renderPads() {
      pads.innerHTML = online ? dpad(mySeat) : dpad(0) + dpad(1);
      pads.querySelectorAll(".mz-db").forEach((b) => b.addEventListener("click", () => tryMove(Number(b.dataset.seat), b.dataset.dir, false)));
    }
    function renderAll() { renderTiles(); positionEnts(); renderHud(); renderPads(); }

    function updateStatus() {
      if (over) return;
      ctx.setStatus(online
        ? ctx.t("Đưa cả hai nhân vật tới cửa thoát của mình. Dùng nút sàn & cần gạt để mở lối cho nhau.",
          "Get both characters to their exits. Use plates & levers to open the way for each other.")
        : ctx.t("P1: W/A/S/D · P2: mũi tên. Cả hai cùng tới cửa thoát. Đứng nút sàn / gạt cần để mở cổng.",
          "P1: W/A/S/D · P2: arrows. Both reach the exits. Stand on plates / flip levers to open gates."));
    }

    function onKey(e) {
      if (over || transitioning) return;
      const k = e.key.toLowerCase();
      const m0 = { w: "up", a: "left", s: "down", d: "right" };
      const ma = { arrowup: "up", arrowleft: "left", arrowdown: "down", arrowright: "right" };
      if (online) { const dir = m0[k] || ma[k]; if (dir) { e.preventDefault(); tryMove(mySeat, dir, false); } return; }
      if (m0[k]) { e.preventDefault(); tryMove(0, m0[k], false); }
      else if (ma[k]) { e.preventDefault(); tryMove(1, ma[k], false); }
    }
    window.addEventListener("keydown", onKey);
    const cleanup = () => window.removeEventListener("keydown", onKey);
    const observer = new MutationObserver(() => { if (!document.body.contains(root)) { cleanup(); observer.disconnect(); } });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    if (online) ctx.setNames("P1" + (mySeat === 0 ? ctx.t(" (bạn)", " (you)") : ""), "P2" + (mySeat === 1 ? ctx.t(" (bạn)", " (you)") : ""));
    else ctx.setNames(ctx.t("Người chơi 1", "Player 1"), ctx.t("Người chơi 2", "Player 2"));
    ctx.setTurn(-1);
    loadLevel(0); buildStage(); renderAll(); introBanner(); updateStatus();

    function destroy() { cleanup(); observer.disconnect(); }
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "mazecoop",
    name: "Mê Cung Hợp Sức",
    emoji: "🗝️",
    description: "Co-op mê cung: hai người mở lối cho nhau bằng nút sàn & cần gạt để cùng tới cửa thoát. Chơi chung máy hoặc online.",
    onlineReady: true,
    supportsAI: false,
    coop: true,
    howTo: [
      "Game CO-OP: hai người cùng phe. Mục tiêu là đưa CẢ HAI nhân vật tới đúng cửa thoát của mình (🟥 P1, 🟦 P2) để qua màn.",
      "Mỗi người điều khiển một nhân vật. Chung máy: P1 dùng W/A/S/D, P2 dùng phím mũi tên (hoặc D-pad). Online: bạn chỉ điều khiển nhân vật mình.",
      "NÚT SÀN (ô sáng màu): cửa cùng màu MỞ khi đang có người đứng lên — một người giữ nút để người kia đi qua.",
      "CẦN GẠT 🎚️: bước lên để BẬT/TẮT cổng cùng màu (giữ trạng thái sau đó). Thường một người gạt mở cổng cho người kia.",
      "Cổng đóng và cửa chưa mở thì không đi qua được. Phối hợp thứ tự đi để mở đúng lối.",
      "Cả hai cùng đứng trên cửa thoát của mình là qua màn. Giải hết các mê cung là cả đội thắng. Bí thì bấm '↺ Làm lại'.",
    ],
    create,
  });
})();
