/* Battleship - Bắn Tàu (CHỈ chơi online) — giấu thông tin + xếp tàu thủ công + vật phẩm
   Giao thức qua sendMove:
     { kind:"ready" }
     { kind:"fire", ability, cells:[[r,c]...], center:[r,c]? }
     { kind:"result", ability, results:[{r,c,state}], sunkCells, radarCount?, scanCells?, center?, gameOver }
   Quân tàu KHÔNG bao giờ gửi qua mạng — chỉ gửi phát bắn & kết quả. */
(function () {
  const N = 10;
  const FLEET = [
    { size: 5, name: "Tàu sân bay", icon: "🛳️" },
    { size: 4, name: "Thiết giáp", icon: "🚢" },
    { size: 3, name: "Tuần dương", icon: "⛴️" },
    { size: 3, name: "Tàu ngầm", icon: "🛥️" },
    { size: 2, name: "Khu trục", icon: "🚤" },
  ];
  const ABILITIES = {
    normal:  { icon: "🎯", name: "Bắn thường", hint: "1 ô", charges: Infinity },
    radar:   { icon: "📡", name: "Radar", hint: "quét 2×2", charges: 3 },
    bomb:    { icon: "💥", name: "Bom chùm", hint: "nổ 2×2", charges: 2 },
    torpedo: { icon: "🚀", name: "Ngư lôi", hint: "tia 4 ô", charges: 2 },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const usePowerups = o.powerups === undefined ? true : !!Number(o.powerups);

    // bản dịch tên hạm đội & vật phẩm (FLEET/ABILITIES là hằng module-level)
    const FLEET_NAME_EN = ["Carrier", "Battleship", "Cruiser", "Submarine", "Destroyer"];
    const ABILITY_NAME_EN = { normal: "Normal shot", radar: "Radar", bomb: "Cluster bomb", torpedo: "Torpedo" };
    const ABILITY_HINT_EN = { normal: "1 cell", radar: "scan 2×2", bomb: "blast 2×2", torpedo: "4-cell line" };
    const fleetName = (id) => ctx.t(FLEET[id].name, FLEET_NAME_EN[id] || FLEET[id].name);
    const abilityName = (k) => ctx.t(ABILITIES[k].name, ABILITY_NAME_EN[k] || ABILITIES[k].name);
    const abilityHint = (k) => ctx.t(ABILITIES[k].hint, ABILITY_HINT_EN[k] || ABILITIES[k].hint);

    // ----- trạng thái -----
    let phase = "placing";       // placing | playing | over
    let iReady = false, oppReady = false;
    let turn = 0;
    let awaiting = false;

    let myBoard = empty(null);   // shipId | null
    let ships = Array(FLEET.length).fill(null); // index theo id
    let oppShotsOnMe = empty(0); // 0 | "hit" | "miss"
    let myShots = empty(0);      // 0 | "hit" | "miss" | "sunk" | "pending"
    let scanned = empty(false);  // radar đã quét (ô trống)
    const radarBadges = {};      // "r,c" -> số ô tàu trong vùng quét

    // xếp tàu
    let selShip = null;          // id tàu đang cầm tay
    let orient = "h";            // h | v
    let placeHover = null;       // [r,c]

    // chơi
    let ability = "normal";
    let torpedoAxis = "row";     // row | col
    let aimHover = null;         // [r,c]
    const charges = {};
    Object.keys(ABILITIES).forEach((k) => { charges[k] = ABILITIES[k].charges; });

    function empty(v) { return Array.from({ length: N }, () => Array(N).fill(v)); }
    function inBoard(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function keyrc(r, c) { return r + "," + c; }
    function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }

    // ----- giao diện -----
    const root = document.createElement("div");
    root.className = "bs-root";
    ctx.boardEl.appendChild(root);

    const place = document.createElement("div");
    place.className = "bs-place";
    root.appendChild(place);

    const placeHint = document.createElement("div");
    placeHint.className = "bs-place-hint";
    place.appendChild(placeHint);

    const fleet = document.createElement("div");
    fleet.className = "bs-fleet";
    place.appendChild(fleet);

    const placeActions = document.createElement("div");
    placeActions.className = "bs-controls";
    placeActions.innerHTML = `
      <button class="btn" data-act="rotate" type="button">${ctx.t("↻ Xoay (R)", "↻ Rotate (R)")}</button>
      <button class="btn" data-act="random" type="button">${ctx.t("🔀 Ngẫu nhiên", "🔀 Random")}</button>
      <button class="btn" data-act="clear" type="button">${ctx.t("🗑️ Xóa hết", "🗑️ Clear all")}</button>
      <button class="btn primary" data-act="ready" type="button">${ctx.t("✓ Sẵn sàng", "✓ Ready")}</button>
    `;
    place.appendChild(placeActions);

    const boards = document.createElement("div");
    boards.className = "bs-boards";
    root.appendChild(boards);

    const myWrap = makeBoard(ctx.t("🛡️ Hạm đội của bạn", "🛡️ Your fleet"));
    const oppWrap = makeBoard(ctx.t("🎯 Vùng biển đối thủ", "🎯 Enemy waters"));
    boards.appendChild(myWrap.wrap);
    boards.appendChild(oppWrap.wrap);

    const abilityBar = document.createElement("div");
    abilityBar.className = "bs-abilities bs-hidden";
    root.appendChild(abilityBar);

    function makeBoard(title) {
      const wrap = document.createElement("div");
      wrap.className = "bs-board-wrap";
      const h = document.createElement("div");
      h.className = "bs-board-title";
      h.textContent = title;
      const grid = document.createElement("div");
      grid.className = "bs-grid";
      const cells = Array.from({ length: N }, () => Array(N));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = document.createElement("div");
          cell.className = "bs-cell";
          grid.appendChild(cell);
          cells[r][c] = cell;
        }
      }
      wrap.appendChild(h);
      wrap.appendChild(grid);
      return { wrap, grid, cells };
    }

    // ====================== XẾP TÀU ======================
    function shipCells(size, r, c, dir) {
      const out = [];
      for (let k = 0; k < size; k++) out.push(dir === "h" ? [r, c + k] : [r + k, c]);
      return out;
    }

    function canPlace(size, r, c, dir) {
      const cells = shipCells(size, r, c, dir);
      return cells.every(([rr, cc]) => inBoard(rr, cc) && myBoard[rr][cc] === null);
    }

    function placeShip(id, r, c, dir) {
      const cells = shipCells(FLEET[id].size, r, c, dir);
      cells.forEach(([rr, cc]) => { myBoard[rr][cc] = id; });
      ships[id] = { id, cells, size: FLEET[id].size, hits: 0, dir };
    }

    function pickUp(id) {
      const s = ships[id];
      if (!s) return;
      s.cells.forEach(([rr, cc]) => { myBoard[rr][cc] = null; });
      orient = s.dir || "h";
      ships[id] = null;
      selShip = id;
    }

    function clearAll() {
      myBoard = empty(null);
      ships = Array(FLEET.length).fill(null);
      selShip = null;
    }

    function placeRandom() {
      clearAll();
      FLEET.forEach((ship, id) => {
        let ok = false, guard = 0;
        while (!ok && guard < 500) {
          guard++;
          const dir = Math.random() < 0.5 ? "h" : "v";
          const r = Math.floor(Math.random() * N);
          const c = Math.floor(Math.random() * N);
          if (canPlace(ship.size, r, c, dir)) { placeShip(id, r, c, dir); ok = true; }
        }
      });
      selShip = null;
    }

    function allPlaced() { return ships.every((s) => s !== null); }

    function nextUnplaced() {
      for (let i = 0; i < FLEET.length; i++) if (!ships[i]) return i;
      return null;
    }

    fleet.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ship]");
      if (!btn || phase !== "placing") return;
      const id = Number(btn.dataset.ship);
      if (ships[id]) pickUp(id);          // đang trên bàn -> nhấc lên sửa
      else selShip = (selShip === id ? null : id);
      render();
    });

    placeActions.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act || phase !== "placing") return;
      if (act === "rotate") { orient = orient === "h" ? "v" : "h"; }
      else if (act === "random") { placeRandom(); }
      else if (act === "clear") { clearAll(); }
      else if (act === "ready") {
        if (!allPlaced() || iReady) return;
        iReady = true;
        ctx.sendMove({ kind: "ready" });
        if (oppReady) beginPlay();
        else { ctx.setStatus(ctx.t("Đã sẵn sàng. Đang chờ đối thủ xếp tàu...", "Ready. Waiting for the opponent to place ships...")); render(); }
        return;
      }
      render();
    });

    document.addEventListener("keydown", onKey);
    function onKey(e) {
      if (!document.body.contains(root)) { document.removeEventListener("keydown", onKey); return; }
      if (phase === "placing" && (e.key === "r" || e.key === "R")) { orient = orient === "h" ? "v" : "h"; render(); }
    }

    // di chuột trên bàn của mình -> preview xếp tàu
    myWrap.grid.addEventListener("mousemove", (e) => {
      if (phase !== "placing" || selShip === null) return;
      const rc = cellOf(myWrap.grid, e.target);
      if (!rc) return;
      if (!placeHover || placeHover[0] !== rc[0] || placeHover[1] !== rc[1]) { placeHover = rc; render(); }
    });
    myWrap.grid.addEventListener("mouseleave", () => { if (placeHover) { placeHover = null; render(); } });

    myWrap.grid.addEventListener("click", (e) => {
      if (phase !== "placing") return;
      const rc = cellOf(myWrap.grid, e.target);
      if (!rc) return;
      const [r, c] = rc;
      if (selShip !== null) {
        if (canPlace(FLEET[selShip].size, r, c, orient)) {
          placeShip(selShip, r, c, orient);
          selShip = nextUnplaced();
          placeHover = null;
        } else { ctx.sound("error"); }
      } else if (myBoard[r][c] !== null) {
        pickUp(myBoard[r][c]);
      }
      render();
    });
    myWrap.grid.addEventListener("contextmenu", (e) => {
      if (phase === "placing") { e.preventDefault(); orient = orient === "h" ? "v" : "h"; render(); }
    });

    function cellOf(grid, target) {
      const cell = target.closest(".bs-cell");
      if (!cell) return null;
      const idx = [...grid.children].indexOf(cell);
      if (idx < 0) return null;
      return [Math.floor(idx / N), idx % N];
    }

    function beginPlay() {
      phase = "playing";
      turn = 0;
      place.classList.add("bs-hidden");
      if (usePowerups) abilityBar.classList.remove("bs-hidden");
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // ====================== VẬT PHẨM / NGẮM BẮN ======================
    const TORP_LEN = 4;
    function targetCells(ab, r, c) {
      if (ab === "bomb") {
        const r0 = clamp(r, 0, N - 2), c0 = clamp(c, 0, N - 2);
        return [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]];
      }
      if (ab === "radar") {
        const [r0, c0] = radarCenter(r, c);
        return [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]];
      }
      if (ab === "torpedo") {
        const out = [];
        if (torpedoAxis === "row") {
          const c0 = clamp(c, 0, N - TORP_LEN);
          for (let k = 0; k < TORP_LEN; k++) out.push([r, c0 + k]);
        } else {
          const r0 = clamp(r, 0, N - TORP_LEN);
          for (let k = 0; k < TORP_LEN; k++) out.push([r0 + k, c]);
        }
        return out;
      }
      return [[r, c]];
    }
    // mỏ neo (góc trên-trái) của vùng radar 2×2 — cũng là nơi gắn badge số
    function radarCenter(r, c) { return [clamp(r, 0, N - 2), clamp(c, 0, N - 2)]; }

    oppWrap.grid.addEventListener("mousemove", (e) => {
      if (phase !== "playing" || turn !== ctx.mySeat || awaiting) return;
      const rc = cellOf(oppWrap.grid, e.target);
      if (!rc) return;
      if (!aimHover || aimHover[0] !== rc[0] || aimHover[1] !== rc[1]) { aimHover = rc; render(); }
    });
    oppWrap.grid.addEventListener("mouseleave", () => { if (aimHover) { aimHover = null; render(); } });

    oppWrap.grid.addEventListener("click", (e) => {
      if (phase !== "playing" || awaiting || turn !== ctx.mySeat) return;
      const rc = cellOf(oppWrap.grid, e.target);
      if (!rc) return;
      fireAt(rc[0], rc[1]);
    });

    function fireAt(r, c) {
      if (ability !== "normal" && charges[ability] <= 0) return;
      const cells = targetCells(ability, r, c);
      if (ability === "normal" && myShots[r][c] !== 0) return;
      if ((ability === "bomb" || ability === "torpedo") && !cells.some(([rr, cc]) => inBoard(rr, cc) && myShots[rr][cc] === 0)) return;

      awaiting = true;
      aimHover = null;
      if (ability !== "radar") {
        cells.forEach(([rr, cc]) => { if (inBoard(rr, cc) && myShots[rr][cc] === 0) myShots[rr][cc] = "pending"; });
      }
      if (ability !== "normal") charges[ability]--;
      const payload = { kind: "fire", ability, cells };
      if (ability === "radar") payload.center = radarCenter(r, c);
      ctx.sendMove(payload);
      const used = ability;
      ability = "normal";
      ctx.sound("select");
      render();
      ctx.setStatus(waitText(used));
    }

    function waitText(ab) {
      if (ab === "radar") return ctx.t("📡 Đang quét radar, chờ dữ liệu...", "📡 Scanning radar, awaiting data...");
      if (ab === "bomb") return ctx.t("💥 Đã thả bom chùm, chờ kết quả...", "💥 Cluster bomb dropped, awaiting result...");
      if (ab === "torpedo") return ctx.t("🚀 Ngư lôi đang lao đi...", "🚀 Torpedo incoming...");
      return ctx.t("🎯 Đã bắn, chờ kết quả...", "🎯 Fired, awaiting result...");
    }

    function selectAbility(ab) {
      if (phase !== "playing" || turn !== ctx.mySeat || awaiting) return;
      if (ab !== "normal" && charges[ab] <= 0) return;
      ability = ab;
      render();
      const tip = {
        normal: ctx.t("Bấm 1 ô để bắn.", "Click a cell to fire."),
        radar: ctx.t("Bấm để quét vùng 2×2 — chỉ đếm số ô tàu, không gây sát thương.", "Click to scan a 2×2 area — only counts ship cells, no damage."),
        bomb: ctx.t("Bấm để thả bom chùm phủ 2×2 (4 phát cùng lúc).", "Click to drop a cluster bomb over 2×2 (4 shots at once)."),
        torpedo: ctx.t(`Ngư lôi tia 4 ô theo ${torpedoAxis === "row" ? "HÀNG" : "CỘT"} — bấm để phóng.`, `Torpedo line of 4 along ${torpedoAxis === "row" ? "ROW" : "COLUMN"} — click to launch.`),
      };
      ctx.setStatus(tip[ab] || "");
    }

    // ====================== NHẬN MESSAGE ======================
    function applyMove(move, fromRemote) {
      if (!fromRemote) return;
      if (move.kind === "ready") {
        oppReady = true;
        if (iReady) beginPlay();
        else { ctx.setStatus(ctx.t("Đối thủ đã sẵn sàng. Hãy xếp tàu và bấm \"Sẵn sàng\".", "Opponent is ready. Place your ships and press \"Ready\".")); }
        return;
      }
      if (move.kind === "fire") {
        const res = receiveFire(move);
        ctx.sendMove({ kind: "result", ...res });
        const hitAny = res.results.some((x) => x.state === "hit");
        ctx.sound(move.ability === "radar" ? "notify" : hitAny ? "shot" : "miss");
        if (res.gameOver) { render(); return endGame(false); }
        turn = ctx.mySeat;
        ctx.setTurn(turn);
        render();
        updateStatus();
        if (move.ability === "radar") ctx.setStatus(ctx.t("📡 Đối thủ vừa quét radar. Tới lượt bạn!", "📡 The opponent just used radar. Your turn!"));
        return;
      }
      if (move.kind === "result") { handleResult(move); return; }
    }

    function receiveFire(move) {
      const ab = move.ability;
      const cells = move.cells || [];
      if (ab === "radar") {
        let count = 0;
        cells.forEach(([r, c]) => { if (inBoard(r, c) && myBoard[r][c] !== null) count++; });
        return { ability: "radar", results: [], sunkCells: null, radarCount: count, scanCells: cells, center: move.center, gameOver: false };
      }
      const order = cells;
      const results = [];
      const sunkCells = [];
      order.forEach(([r, c]) => {
        if (!inBoard(r, c)) return;
        if (oppShotsOnMe[r][c] === "hit" || oppShotsOnMe[r][c] === "miss") {
          results.push({ r, c, state: oppShotsOnMe[r][c] });
          return;
        }
        const id = myBoard[r][c];
        if (id === null) { oppShotsOnMe[r][c] = "miss"; results.push({ r, c, state: "miss" }); }
        else {
          oppShotsOnMe[r][c] = "hit";
          const ship = ships[id];
          ship.hits++;
          results.push({ r, c, state: "hit" });
          if (ship.hits >= ship.size) sunkCells.push(...ship.cells);
        }
      });
      const gameOver = ships.every((s) => s && s.hits >= s.size);
      return { ability: ab, results, sunkCells: sunkCells.length ? sunkCells : null, gameOver };
    }

    function handleResult(move) {
      awaiting = false;
      if (move.ability === "radar") {
        (move.scanCells || []).forEach(([r, c]) => { if (inBoard(r, c) && myShots[r][c] === 0) scanned[r][c] = true; });
        if (move.center) radarBadges[keyrc(move.center[0], move.center[1])] = move.radarCount;
        turn = 1 - ctx.mySeat;
        ctx.setTurn(turn);
        render();
        ctx.sound("notify");
        ctx.setStatus(ctx.t(`📡 Radar phát hiện ${move.radarCount} ô tàu trong vùng quét. Tới lượt đối thủ.`, `📡 Radar found ${move.radarCount} ship cell(s) in the scan area. Opponent's turn.`));
        return;
      }
      // dọn pending
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (myShots[r][c] === "pending") myShots[r][c] = 0;
      let hitAny = false, sunkAny = false;
      (move.results || []).forEach(({ r, c, state }) => {
        if (myShots[r][c] === "sunk") return;
        myShots[r][c] = state;
        if (state === "hit") hitAny = true;
      });
      if (move.sunkCells) { move.sunkCells.forEach(([r, c]) => { myShots[r][c] = "sunk"; }); sunkAny = true; }
      if (move.gameOver) { render(); return endGame(true); }
      turn = 1 - ctx.mySeat;
      ctx.setTurn(turn);
      render();
      ctx.sound(hitAny ? "shot" : "miss");
      const label = move.ability === "bomb" ? ctx.t("💥 Bom chùm: ", "💥 Cluster bomb: ") : move.ability === "torpedo" ? ctx.t("🚀 Ngư lôi: ", "🚀 Torpedo: ") : "";
      if (sunkAny) ctx.setStatus(ctx.t(`${label}💥 Trúng và ĐÁNH CHÌM tàu địch! Tới lượt đối thủ.`, `${label}💥 Hit and SANK an enemy ship! Opponent's turn.`));
      else if (hitAny) ctx.setStatus(ctx.t(`${label}Bắn trúng! Tới lượt đối thủ.`, `${label}Hit! Opponent's turn.`));
      else ctx.setStatus(ctx.t(`${label}🌊 Trượt cả. Tới lượt đối thủ.`, `${label}🌊 All missed. Opponent's turn.`));
    }

    function endGame(iWon) {
      phase = "over";
      ctx.setTurn(-1);
      abilityBar.classList.add("bs-hidden");
      if (iWon) { ctx.incScore(ctx.mySeat); ctx.setStatus(ctx.t("🎉 Bạn thắng — đã đánh chìm toàn bộ hạm đội đối thủ!", "🎉 You win — you sank the entire enemy fleet!")); }
      else { ctx.incScore(1 - ctx.mySeat); ctx.setStatus(ctx.t("💀 Bạn thua — hạm đội của bạn đã bị đánh chìm.", "💀 You lose — your fleet has been sunk.")); }
      render();
    }

    // ====================== RENDER ======================
    function render() {
      renderPlace();
      renderBoards();
      renderAbilities();
    }

    function renderPlace() {
      if (phase !== "placing") return;
      placeHint.innerHTML = iReady
        ? ctx.t("✓ Đã sẵn sàng — đang chờ đối thủ...", "✓ Ready — waiting for the opponent...")
        : ctx.t(`Hướng đặt: <b>${orient === "h" ? "Ngang ↔" : "Dọc ↕"}</b> · Bấm tàu để chọn, bấm bàn để đặt, bấm tàu đã đặt để chỉnh lại.`, `Orientation: <b>${orient === "h" ? "Horizontal ↔" : "Vertical ↕"}</b> · Click a ship to select, click the board to place, click a placed ship to adjust.`);
      fleet.innerHTML = FLEET.map((s, id) => {
        const done = !!ships[id];
        const sel = selShip === id;
        const blocks = "▪".repeat(s.size);
        return `<button class="bs-ship-btn ${done ? "done" : ""} ${sel ? "sel" : ""}" data-ship="${id}" type="button">
          <span class="bs-ship-ic">${s.icon}</span>
          <b>${fleetName(id)}</b>
          <small>${blocks} ${done ? "✓" : "(" + s.size + ")"}</small>
        </button>`;
      }).join("");
      const readyBtn = placeActions.querySelector('[data-act="ready"]');
      if (readyBtn) readyBtn.disabled = !allPlaced() || iReady;
    }

    function previewSet() {
      const set = {};
      if (phase === "placing" && selShip !== null && placeHover) {
        const cells = shipCells(FLEET[selShip].size, placeHover[0], placeHover[1], orient);
        const ok = canPlace(FLEET[selShip].size, placeHover[0], placeHover[1], orient);
        cells.forEach(([r, c]) => { if (inBoard(r, c)) set[keyrc(r, c)] = ok ? "ok" : "bad"; });
      }
      return set;
    }

    function aimSet() {
      const set = {};
      if (phase === "playing" && turn === ctx.mySeat && !awaiting && aimHover) {
        targetCells(ability, aimHover[0], aimHover[1]).forEach(([r, c]) => {
          if (inBoard(r, c)) set[keyrc(r, c)] = true;
        });
      }
      return set;
    }

    function renderBoards() {
      const prev = previewSet();
      // bàn của tôi: tàu + dấu bắn của đối thủ + preview xếp tàu
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = myWrap.cells[r][c];
          cell.className = "bs-cell";
          cell.textContent = "";
          if (myBoard[r][c] !== null) cell.classList.add("ship");
          if (oppShotsOnMe[r][c] === "hit") cell.classList.add("hit");
          else if (oppShotsOnMe[r][c] === "miss") cell.classList.add("miss");
          const pv = prev[keyrc(r, c)];
          if (pv) cell.classList.add("preview", pv);
        }
      }
      // bàn đối thủ: dấu bắn của tôi + radar + ngắm
      const aim = aimSet();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = oppWrap.cells[r][c];
          cell.className = "bs-cell";
          cell.textContent = "";
          const s = myShots[r][c];
          if (s === "hit") cell.classList.add("hit");
          else if (s === "sunk") cell.classList.add("hit", "sunk");
          else if (s === "miss") cell.classList.add("miss");
          else if (s === "pending") cell.classList.add("pending");
          else if (scanned[r][c]) cell.classList.add("scan");
          const b = radarBadges[keyrc(r, c)];
          if (b !== undefined && s === 0) { cell.classList.add("badge"); cell.textContent = b; }
          if (aim[keyrc(r, c)]) cell.classList.add("aim");
        }
      }
      const myTurn = phase === "playing" && turn === ctx.mySeat && !awaiting;
      oppWrap.wrap.classList.toggle("bs-active", myTurn);
      myWrap.wrap.classList.toggle("bs-active", phase === "placing" && !iReady);
    }

    function renderAbilities() {
      if (!usePowerups || phase !== "playing") { abilityBar.innerHTML = ""; return; }
      const myTurn = turn === ctx.mySeat && !awaiting;
      const keys = ["normal", "radar", "bomb", "torpedo"];
      let html = keys.map((k) => {
        const a = ABILITIES[k];
        const left = a.charges === Infinity ? "∞" : charges[k];
        const off = !myTurn || (k !== "normal" && charges[k] <= 0);
        return `<button class="bs-ability ${ability === k ? "active" : ""}" data-ab="${k}" type="button" ${off ? "disabled" : ""}>
          <span class="bs-ab-ic">${a.icon}</span>
          <b>${abilityName(k)}</b>
          <small>${abilityHint(k)}</small>
          <i class="bs-ab-left">${left}</i>
        </button>`;
      }).join("");
      html += `<button class="bs-torp-axis ${ability === "torpedo" ? "" : "dim"}" data-axis="1" type="button" ${ability === "torpedo" && myTurn ? "" : "disabled"}>
        ${ctx.t("Ngư lôi:", "Torpedo:")} <b>${torpedoAxis === "row" ? ctx.t("Hàng ↔", "Row ↔") : ctx.t("Cột ↕", "Column ↕")}</b></button>`;
      abilityBar.innerHTML = html;
      abilityBar.querySelectorAll("[data-ab]").forEach((btn) => {
        btn.addEventListener("click", () => selectAbility(btn.dataset.ab));
      });
      const axisBtn = abilityBar.querySelector("[data-axis]");
      if (axisBtn) axisBtn.addEventListener("click", () => {
        torpedoAxis = torpedoAxis === "row" ? "col" : "row";
        render();
        ctx.setStatus(ctx.t(`Ngư lôi xuyên cả ${torpedoAxis === "row" ? "HÀNG" : "CỘT"} — bấm để phóng.`, `Torpedo runs the whole ${torpedoAxis === "row" ? "ROW" : "COLUMN"} — click to launch.`));
      });
    }

    function updateStatus() {
      if (phase !== "playing") return;
      ctx.setStatus(turn === ctx.mySeat
        ? ctx.t("🎯 Lượt bạn — chọn vật phẩm rồi bấm bàn đối thủ để bắn!", "🎯 Your turn — pick an ability then click the enemy board to fire!")
        : ctx.t("⏳ Đối thủ đang ngắm bắn...", "⏳ Opponent is aiming..."));
    }

    // ----- khởi tạo -----
    if (!ctx.isOnline) {
      place.classList.add("bs-hidden");
      ctx.setStatus(ctx.t("⚠️ Bắn Tàu chỉ chơi được ở chế độ online.", "⚠️ Battleship can only be played online."));
      return { applyMove: () => {}, destroy: () => document.removeEventListener("keydown", onKey) };
    }
    placeRandom();
    render();
    ctx.setStatus(ctx.t("Xếp hạm đội: chọn tàu, xoay (R / chuột phải) rồi đặt. Hoặc bấm 🔀 Ngẫu nhiên. Xong thì Sẵn sàng.", "Place your fleet: pick a ship, rotate (R / right-click), then place. Or press 🔀 Random. When done, press Ready."));
    return { applyMove, destroy: () => document.removeEventListener("keydown", onKey) };
  }

  window.GameRegistry.register({
    id: "battleship",
    name: "Bắn Tàu (Battleship)",
    emoji: "🚢",
    description: "Tự xếp hạm đội, dùng radar/bom chùm/ngư lôi và bắn tọa độ vào bàn đối thủ. Ai bắn chìm hết tàu địch trước sẽ thắng. (Chỉ online)",
    onlineReady: true,
    localReady: false,
    options: [
      {
        id: "powerups",
        label: "Vật phẩm đặc biệt",
        default: 1,
        choices: [
          { value: 1, label: "Bật (radar, bom, ngư lôi)" },
          { value: 0, label: "Tắt (cổ điển)" },
        ],
      },
    ],
    howTo: [
      "Đây là game CHỈ chơi online — vì mỗi người có hạm đội giấu kín với đối thủ.",
      "XẾP TÀU: bấm một tàu trong danh sách để chọn, bấm 'Xoay' (hoặc phím R / chuột phải) để đổi ngang–dọc, rồi bấm lên bàn của bạn để đặt. Bấm lại tàu đã đặt để nhấc lên chỉnh. Hoặc bấm '🔀 Ngẫu nhiên'. Đủ 5 tàu thì bấm 'Sẵn sàng'.",
      "Khi cả hai sẵn sàng, hai bên luân phiên bắn vào 'Vùng biển đối thủ'. Ô đỏ = trúng, ô trắng = trượt, bắn hết các ô của một tàu là đánh chìm.",
      "📡 Radar: quét vùng 2×2, chỉ cho biết SỐ ô tàu trong vùng (không gây sát thương) — dùng để khoanh vùng. Có 3 lần.",
      "💥 Bom chùm: nổ phủ khối 2×2, bắn 4 ô cùng lúc. Có 2 lần.",
      "🚀 Ngư lôi: bắn một tia thẳng 4 ô theo hàng hoặc cột (đổi hướng bằng nút bên cạnh), trúng mọi tàu nằm trên tia đó. Có 2 lần.",
      "Mỗi lượt chỉ được một hành động (bắn thường hoặc một vật phẩm). Ai đánh chìm toàn bộ hạm đội đối thủ trước sẽ thắng.",
    ],
    create,
  });
})();
