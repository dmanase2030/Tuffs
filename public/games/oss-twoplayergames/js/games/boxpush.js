/* Đẩy Thùng Đôi (Co-op Sokoban) — chơi chung máy & ONLINE
   Hai người CÙNG PHE giải đố: đẩy mọi thùng 📦 vào ô đích 🎯. Có nút sàn (plate)
   giữ cửa mở — một người đứng/đặt thùng lên nút để mở cửa cho người kia đi/đẩy qua.
   Giải xong tất cả màn = cả đội THẮNG.

   Di chuyển TỰ DO (không theo lượt): mỗi người điều khiển nhân vật của mình.
   Chung máy: P1 dùng W/A/S/D, P2 dùng phím mũi tên (hoặc bấm D-pad trên màn).
   Online: bạn chỉ điều khiển nhân vật của mình; mỗi nước đi relay sang đối thủ.

   Ký hiệu màn: '#'=tường, ' '=sàn, '1'/'2'=người chơi, '$'=thùng, 'g'=đích,
   '*'=thùng sẵn trên đích, chữ thường a/b/c=nút sàn (nhóm), chữ HOA A/B/C=cửa.
   Cửa nhóm X mở khi MỌI nút nhóm X đang bị đè (bởi người hoặc thùng). */
(function () {
  const LEVELS = [
    { name: "Khởi động", nameEn: "Warm-up", rows: ["#######", "#1 $ g#", "#######", "#g $ 2#", "#######"] },
    { name: "Hai phía", nameEn: "Both sides", rows: ["########", "#1 $  g#", "#      #", "#g  $ 2#", "########"] },
    { name: "Ba thùng", nameEn: "Three boxes", rows: ["########", "#1    2#", "# $$$  #", "# ggg  #", "#      #", "########"] },
    { name: "Vòng vèo", nameEn: "Detour", rows: ["#########", "#1 $   g#", "### ### #", "#g   $ 2#", "#########"] },
    { name: "Xếp hàng", nameEn: "Line them up", rows: ["#########", "#1     2#", "# $ $ $ #", "# g g g #", "#       #", "#########"] },
    { name: "Căn phòng", nameEn: "The room", rows: ["#########", "#1 $   g#", "#  ###  #", "#  $ g  #", "#2      #", "#########"] },
    { name: "Mở cửa giúp nhau", nameEn: "Open the door", rows: ["#########", "#1 $ A g#", "#########", "#a   2  #", "#########"] },
    { name: "Giữ cửa, đẩy đôi", nameEn: "Hold & double push", rows: ["############", "#1 $  $ A gg#", "#          #", "#a    2    #", "############"] },
    { name: "Hành lang dài", nameEn: "Long hall", rows: ["#############", "#1 $   $ A gg#", "#           #", "#a     2     #", "#############"] },
  ];
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const COLORS = ["#ff5d73", "#4dd0e1"];

  // Robot kho hàng vẽ bằng SVG (hợp bối cảnh đẩy thùng) — P1 đỏ, P2 xanh.
  function robotSVG(seat) {
    const c = seat === 0 ? "#ff5d73" : "#4dd0e1";
    const hi = seat === 0 ? "#ff8193" : "#86e6f1";
    const dk = seat === 0 ? "#c93651" : "#2b9aac";
    return `<svg class="bx-bot" viewBox="0 0 64 80" aria-hidden="true">
      <ellipse cx="32" cy="75" rx="18" ry="5" fill="rgba(0,0,0,0.3)"/>
      <rect x="13" y="58" width="38" height="15" rx="7" fill="#2b3242"/>
      <circle cx="22" cy="66" r="4.2" fill="#0e121b"/><circle cx="32" cy="66" r="4.2" fill="#0e121b"/><circle cx="42" cy="66" r="4.2" fill="#0e121b"/>
      <circle cx="22" cy="66" r="1.6" fill="#566"/><circle cx="32" cy="66" r="1.6" fill="#566"/><circle cx="42" cy="66" r="1.6" fill="#566"/>
      <rect x="7" y="40" width="8" height="17" rx="4" fill="${dk}"/>
      <rect x="49" y="40" width="8" height="17" rx="4" fill="${dk}"/>
      <rect x="13" y="24" width="38" height="36" rx="10" fill="${c}"/>
      <rect x="13" y="24" width="38" height="16" rx="10" fill="${hi}"/>
      <rect x="18" y="31" width="28" height="19" rx="6" fill="#0e141f"/>
      <circle cx="26" cy="40" r="3.4" fill="#aef4ff"><animate attributeName="opacity" values="1;0.5;1" dur="2.4s" repeatCount="indefinite"/></circle>
      <circle cx="38" cy="40" r="3.4" fill="#aef4ff"><animate attributeName="opacity" values="1;0.5;1" dur="2.4s" repeatCount="indefinite"/></circle>
      <path d="M28 45 Q32 48 36 45" stroke="#aef4ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <line x1="32" y1="24" x2="32" y2="15" stroke="${dk}" stroke-width="2"/>
      <circle class="bx-led" cx="32" cy="13" r="3" fill="#ffe066"/>
    </svg>`;
  }

  function create(ctx) {
    const online = ctx.isOnline;
    const mySeat = online ? ctx.mySeat : -1;
    let li = 0, W = 0, H = 0;
    let walls, goals, plates, doors, boxes, players;
    let moves = 0, over = false, transitioning = false;
    let nextBoxId = 1;
    let faceDir = [1, 1]; // hướng nhìn (1 phải, -1 trái)

    const root = document.createElement("div");
    root.className = "bx-root";
    ctx.boardEl.appendChild(root);
    const hud = document.createElement("div");
    hud.className = "bx-hud";
    root.appendChild(hud);
    const stage = document.createElement("div");
    stage.className = "bx-stage";
    root.appendChild(stage);
    const pads = document.createElement("div");
    pads.className = "bx-pads";
    root.appendChild(pads);

    let tilesEl, entsEl, overlayEl;
    let playerEls = [null, null];
    const boxEls = new Map(); // id -> el

    const idx = (r, c) => r * W + c;
    const rc = (i) => [Math.floor(i / W), i % W];
    function bestKey() { return "tpg_bx_best_" + li; }
    function getBest() { try { return +localStorage.getItem(bestKey()) || 0; } catch (e) { return 0; } }
    function setBest(v) { try { localStorage.setItem(bestKey(), String(v)); } catch (e) { /* ignore */ } }

    function loadLevel(n) {
      const lv = LEVELS[n];
      W = Math.max(...lv.rows.map((s) => s.length));
      H = lv.rows.length;
      walls = new Set(); goals = new Set(); plates = new Map(); doors = new Map(); boxes = []; players = [-1, -1];
      nextBoxId = 1;
      for (let r = 0; r < H; r++) {
        const row = lv.rows[r];
        for (let c = 0; c < W; c++) {
          const ch = row[c] || "#"; const i = idx(r, c);
          if (ch === "#") { walls.add(i); continue; }
          if (ch === "1") players[0] = i;
          else if (ch === "2") players[1] = i;
          else if (ch === "$") boxes.push({ id: nextBoxId++, cell: i });
          else if (ch === "g") goals.add(i);
          else if (ch === "*") { boxes.push({ id: nextBoxId++, cell: i }); goals.add(i); }
          else if (ch >= "a" && ch <= "c") plates.set(i, ch);
          else if (ch >= "A" && ch <= "C") doors.set(i, ch.toLowerCase());
        }
      }
      moves = 0; faceDir = [1, 1];
    }

    function boxAt(cell) { return boxes.find((b) => b.cell === cell) || null; }
    function occupied(cell) { return players[0] === cell || players[1] === cell; }

    function activeGroups() {
      const need = {}, have = {};
      plates.forEach((g, cell) => {
        need[g] = (need[g] || 0) + 1;
        if (boxAt(cell) || occupied(cell)) have[g] = (have[g] || 0) + 1;
      });
      const active = new Set();
      Object.keys(need).forEach((g) => { if ((have[g] || 0) >= need[g]) active.add(g); });
      return active;
    }
    function doorOpen(cell, active) { const g = doors.get(cell); return g ? active.has(g) : true; }

    function tryMove(seat, dir, fromRemote) {
      if (over || transitioning) return false;
      if (online && !fromRemote && seat !== mySeat) return false;
      const d = DIRS[dir]; if (!d) return false;
      const [r, c] = rc(players[seat]);
      const nr = r + d[0], nc = c + d[1];
      if (d[1] !== 0) faceDir[seat] = d[1] > 0 ? 1 : -1;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) { bump(seat); return false; }
      const ncell = idx(nr, nc);
      const active = activeGroups();
      if (walls.has(ncell) || (doors.has(ncell) && !doorOpen(ncell, active)) || players[1 - seat] === ncell) { bump(seat); return false; }
      const box = boxAt(ncell);
      if (box) {
        const br = nr + d[0], bc = nc + d[1];
        if (br < 0 || br >= H || bc < 0 || bc >= W) { bump(seat); return false; }
        const bcell = idx(br, bc);
        if (walls.has(bcell) || boxAt(bcell) || occupied(bcell) || (doors.has(bcell) && !doorOpen(bcell, active))) { bump(seat); return false; }
        box.cell = bcell;
        players[seat] = ncell;
        ctx.sound("place");
        if (boxEls.get(box.id)) boxEls.get(box.id).classList.add("bx-pushed");
      } else {
        players[seat] = ncell;
        ctx.sound("select");
      }
      moves++;
      if (!fromRemote && online) ctx.sendMove({ k: "move", seat: mySeat, dir });
      afterMove();
      return true;
    }

    function bump(seat) {
      const el = playerEls[seat];
      if (!el) return;
      el.classList.remove("bx-bump"); void el.offsetWidth; el.classList.add("bx-bump");
    }

    function afterMove() {
      positionEnts(); renderTiles(); renderHud();
      if (isSolved()) {
        transitioning = true;
        ctx.sound("win");
        const best = getBest();
        if (!best || moves < best) setBest(moves);
        celebrate();
        const last = li >= LEVELS.length - 1;
        showOverlay(last
          ? ctx.t("🎉 Hoàn thành tất cả!", "🎉 All levels cleared!")
          : ctx.t(`✅ Qua màn ${li + 1}! (${moves} bước)`, `✅ Level ${li + 1} done! (${moves} moves)`), last ? "win" : "clear");
        setTimeout(() => {
          transitioning = false;
          if (last) { finishAll(); return; }
          li++; loadLevel(li); buildStage(); renderAll(); introBanner();
        }, 1150);
      }
    }

    function isSolved() { for (const g of goals) if (!boxAt(g)) return false; return true; }

    function finishAll() {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(0);
      ctx.sound("win");
      ctx.setStatus(ctx.t(`🎉 Cả đội giải xong tất cả ${LEVELS.length} màn!`, `🎉 The team solved all ${LEVELS.length} levels!`));
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

    // ---------- Dựng sân khấu (1 lần mỗi màn) ----------
    function buildStage() {
      stage.innerHTML = `<div class="bx-board" style="--bx-w:${W};--bx-h:${H};aspect-ratio:${W}/${H}">
        <div class="bx-tiles"></div><div class="bx-ents"></div><div class="bx-overlay"></div></div>`;
      tilesEl = stage.querySelector(".bx-tiles");
      entsEl = stage.querySelector(".bx-ents");
      overlayEl = stage.querySelector(".bx-overlay");
      tilesEl.style.gridTemplateColumns = `repeat(${W},1fr)`;
      tilesEl.style.gridTemplateRows = `repeat(${H},1fr)`;
      // token thực thể
      entsEl.innerHTML = "";
      boxEls.clear();
      boxes.forEach((b) => {
        const el = document.createElement("div");
        el.className = "bx-ent bx-box";
        el.innerHTML = `<span class="bx-box-face">📦</span>`;
        entsEl.appendChild(el);
        boxEls.set(b.id, el);
      });
      for (let s = 0; s < 2; s++) {
        const el = document.createElement("div");
        el.className = "bx-ent bx-p bx-p" + (s + 1);
        el.style.setProperty("--pc", COLORS[s]);
        el.innerHTML = `<span class="bx-p-face">${robotSVG(s)}</span>`;
        entsEl.appendChild(el);
        playerEls[s] = el;
      }
    }

    function renderTiles() {
      const active = activeGroups();
      let html = "";
      for (let i = 0; i < W * H; i++) {
        if (walls.has(i)) { html += `<div class="bx-cell bx-wall"></div>`; continue; }
        let cls = "bx-cell bx-floor";
        if (goals.has(i)) cls += boxAt(i) ? " bx-goal bx-goal-on" : " bx-goal";
        if (plates.has(i)) cls += " bx-plate bx-grp-" + plates.get(i) + (boxAt(i) || occupied(i) ? " bx-pressed" : "");
        if (doors.has(i)) cls += " bx-door bx-grp-" + doors.get(i) + (doorOpen(i, active) ? " bx-open" : " bx-closed");
        html += `<div class="${cls}"></div>`;
      }
      tilesEl.innerHTML = html;
    }

    function place(el, cell) {
      const [r, c] = rc(cell);
      el.style.left = (c * 100 / W) + "%";
      el.style.top = (r * 100 / H) + "%";
      el.style.width = (100 / W) + "%";
      el.style.height = (100 / H) + "%";
    }
    function positionEnts() {
      boxes.forEach((b) => { const el = boxEls.get(b.id); if (el) { place(el, b.cell); el.classList.toggle("bx-on", goals.has(b.cell)); } });
      for (let s = 0; s < 2; s++) {
        const el = playerEls[s]; if (!el) continue;
        place(el, players[s]);
        const f = el.querySelector(".bx-p-face");
        if (f) f.style.transform = `scaleX(${faceDir[s]})`;
      }
    }

    function renderHud() {
      const lv = LEVELS[li];
      const done = [...goals].filter((g) => boxAt(g)).length;
      const best = getBest();
      hud.innerHTML =
        `<div class="bx-info"><b>${ctx.t("Màn", "Level")} ${li + 1}/${LEVELS.length}</b> · <span>${ctx.t(lv.name, lv.nameEn)}</span></div>` +
        `<div class="bx-info">🎯 ${done}/${goals.size} · 👣 ${moves}${best ? " · 🏅 " + best : ""}` +
        (online ? ` · <span style="color:${COLORS[mySeat] || "#fff"}">P${mySeat + 1} ${ctx.t("(bạn)", "(you)")}</span>` : "") + `</div>` +
        `<button type="button" class="btn small bx-restart">↺ ${ctx.t("Làm lại màn", "Restart level")}</button>`;
      hud.querySelector(".bx-restart").addEventListener("click", () => restart(false));
    }

    function showOverlay(text, cls) {
      if (!overlayEl) return;
      overlayEl.innerHTML = `<div class="bx-banner bx-banner-${cls}">${text}</div>`;
      overlayEl.classList.add("show");
    }
    function hideOverlay() { if (overlayEl) { overlayEl.classList.remove("show"); overlayEl.innerHTML = ""; } }
    function introBanner() {
      const lv = LEVELS[li];
      showOverlay(`<small>${ctx.t("Màn", "Level")} ${li + 1}/${LEVELS.length}</small><b>${ctx.t(lv.name, lv.nameEn)}</b>`, "intro");
      setTimeout(hideOverlay, 1100);
    }
    function celebrate() {
      if (!overlayEl) return;
      let conf = "";
      for (let i = 0; i < 18; i++) {
        const x = Math.round(Math.random() * 100), delay = (Math.random() * 0.3).toFixed(2), hue = Math.floor(Math.random() * 360);
        conf += `<span class="bx-conf" style="left:${x}%;animation-delay:${delay}s;background:hsl(${hue},85%,60%)"></span>`;
      }
      const layer = document.createElement("div");
      layer.className = "bx-confetti";
      layer.innerHTML = conf;
      overlayEl.appendChild(layer);
      setTimeout(() => layer.remove(), 1400);
    }

    function dpad(seat, enabled) {
      const dis = enabled ? "" : "disabled";
      return `<div class="bx-dpad" style="--bx-pc:${COLORS[seat]}">` +
        `<div class="bx-dpad-lbl">🧑 P${seat + 1}${online && seat === mySeat ? ctx.t(" (bạn)", " (you)") : ""}</div>` +
        `<div class="bx-dpad-grid">` +
          `<button type="button" class="bx-db" data-seat="${seat}" data-dir="up" ${dis}>▲</button>` +
          `<button type="button" class="bx-db" data-seat="${seat}" data-dir="left" ${dis}>◀</button>` +
          `<button type="button" class="bx-db" data-seat="${seat}" data-dir="down" ${dis}>▼</button>` +
          `<button type="button" class="bx-db" data-seat="${seat}" data-dir="right" ${dis}>▶</button>` +
        `</div></div>`;
    }
    function renderPads() {
      pads.innerHTML = online ? dpad(mySeat, true) : dpad(0, true) + dpad(1, true);
      pads.querySelectorAll(".bx-db").forEach((b) => b.addEventListener("click", () => tryMove(Number(b.dataset.seat), b.dataset.dir, false)));
    }

    function renderAll() { renderTiles(); positionEnts(); renderHud(); renderPads(); }

    function updateStatus() {
      if (over) return;
      ctx.setStatus(online
        ? ctx.t("Cùng phối hợp đẩy mọi thùng 📦 vào đích 🎯. Bạn điều khiển nhân vật của mình.",
          "Work together to push every box 📦 onto a target 🎯. You control your own character.")
        : ctx.t("P1: W/A/S/D · P2: phím mũi tên. Đẩy mọi thùng vào đích. Đứng lên nút sàn để mở cửa.",
          "P1: W/A/S/D · P2: arrow keys. Push every box onto a target. Stand on plates to open doors."));
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
    id: "boxpush",
    name: "Đẩy Thùng Đôi",
    emoji: "📦",
    description: "Co-op giải đố: hai người cùng đẩy mọi thùng vào đích. Có nút sàn giữ cửa — phải phối hợp mới qua. Chơi chung máy hoặc online.",
    onlineReady: true,
    supportsAI: false,
    coop: true,
    howTo: [
      "Đây là game CO-OP: hai người cùng một phe, mục tiêu là đẩy MỌI thùng 📦 vào ô đích 🎯 để qua màn.",
      "Mỗi người điều khiển một nhân vật. Chung máy: P1 dùng W/A/S/D, P2 dùng phím mũi tên (hoặc bấm D-pad trên màn). Online: bạn chỉ điều khiển nhân vật của mình.",
      "Đi vào thùng để đẩy nó (chỉ đẩy được nếu ô phía sau trống). Không đẩy được hai thùng liền nhau hay đẩy vào tường/cửa đóng.",
      "Nút sàn (ô sáng màu) mở cửa cùng màu khi ĐANG bị đè — bởi người đứng lên hoặc bởi một thùng. Một người có thể đứng giữ nút để người kia đẩy thùng qua cửa.",
      "Giải xong tất cả các màn là cả đội thắng. Bí quá thì bấm '↺ Làm lại màn' để xếp lại.",
    ],
    create,
  });
})();
