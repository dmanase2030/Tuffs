/* Sea Battle Nâng Cấp - Battleship online: xếp tàu & bãi mìn thủ công, radar, torpedo,
   bom chùm, tàu đặc biệt (giáp, tàng hình, mất kỹ năng khi tàu nguồn bị chìm).
   Giao thức sendMove:
     { kind:"ready" }
     { kind:"attack", action, cells:[{r,c}] }
     { kind:"attackResult", action, cells:[...], trap, gameOver, extraTurn }
     { kind:"radar", r, c } / { kind:"radarResult", r, c, shipCount, mineCount, stealthPing, extraTurn }
   Hạm đội & mìn KHÔNG bao giờ gửi qua mạng. */
(function () {
  const N = 10;
  const FLEET = [
    { key: "carrier", name: "Soái hạm", size: 5, icon: "🛳️", note: "Bị chìm → mất hết torpedo còn lại." },
    { key: "battleship", name: "Thiết giáp hạm", size: 4, icon: "🚢", armor: 1, note: "Có 1 lớp giáp, phải bắn lại ô đó mới xuyên." },
    { key: "submarine", name: "Tàu ngầm", size: 3, icon: "🤿", stealth: true, note: "Radar không đếm, trừ khi quét ngay đúng tâm." },
    { key: "minelayer", name: "Tàu rải mìn", size: 3, icon: "⚓", note: "Biểu tượng cho bãi mìn ẩn của bạn." },
    { key: "scout", name: "Tàu trinh sát", size: 2, icon: "🛥️", note: "Bị chìm → mất hết radar còn lại." },
  ];

  function create(ctx) {
    const opts = ctx.options || {};
    const mineCount = opts.mines === undefined ? 5 : Number(opts.mines);
    const startRadar = opts.radar === undefined ? 3 : Number(opts.radar);
    const startTorpedo = opts.torpedo === undefined ? 2 : Number(opts.torpedo);
    const startBomb = opts.bomb === undefined ? 1 : Number(opts.bomb);

    // bản dịch tên & ghi chú hạm đội (FLEET là hằng module-level)
    const FLEET_NAME_EN = { carrier: "Flagship", battleship: "Battleship", submarine: "Submarine", minelayer: "Minelayer", scout: "Scout" };
    const FLEET_NOTE_EN = {
      carrier: "Sunk → lose all remaining torpedoes.",
      battleship: "Has 1 armor layer; you must hit that cell again to pierce.",
      submarine: "Radar won't count it unless you scan its exact center.",
      minelayer: "Represents your hidden minefield.",
      scout: "Sunk → lose all remaining radar.",
    };
    const fleetName = (id) => ctx.t(FLEET[id].name, FLEET_NAME_EN[FLEET[id].key] || FLEET[id].name);
    const fleetNote = (id) => ctx.t(FLEET[id].note, FLEET_NOTE_EN[FLEET[id].key] || FLEET[id].note);
    // dịch tên tàu nhận qua mạng (chuỗi VN) sang ngôn ngữ hiện tại
    const fleetNameByName = (vnName) => {
      const tpl = FLEET.find((f) => f.name === vnName);
      return tpl ? ctx.t(tpl.name, FLEET_NAME_EN[tpl.key] || tpl.name) : vnName;
    };

    let phase = "placing";
    let iReady = false, oppReady = false;
    let turn = 0;
    let awaiting = false;
    let selectedAction = "shot";
    let torpedoDir = "h";
    let radarCharges = startRadar;
    let torpedoCharges = startTorpedo;
    let bombCharges = startBomb;
    let mySkipNext = false;
    let lastInfo = "";

    // setup thủ công
    let placeMode = "ship";   // ship | mine
    let selShip = null;
    let orient = "h";
    let placeHover = null;
    let aimHover = null;

    let myBoard = matrix(null);
    let mineBoard = matrix(false);
    let mineTriggered = matrix(false);
    let ships = [];
    let oppShotsOnMe = matrix(0);
    let myShots = matrix(0);
    let radarHints = matrix(null);
    const oppRadarOnMe = [];

    function matrix(v) { return Array.from({ length: N }, () => Array(N).fill(v)); }
    function keyOf(r, c) { return r + "," + c; }
    function inside(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
    function canAttackStatus(s) { return s === 0 || s === "armor"; }
    function isMyTurn() { return phase === "playing" && turn === ctx.mySeat && !awaiting; }

    const root = document.createElement("div");
    root.className = "sbx-root";
    ctx.boardEl.appendChild(root);

    // ----- thanh thiết lập -----
    const setupBar = document.createElement("div");
    setupBar.className = "sbx-setup";
    setupBar.innerHTML = `
      <div class="sbx-modes">
        <button class="btn small sbx-mode active" data-mode="ship" type="button">${ctx.t("⚓ Đặt tàu", "⚓ Place ships")}</button>
        <button class="btn small sbx-mode" data-mode="mine" type="button">${ctx.t("💣 Đặt mìn", "💣 Place mines")}</button>
      </div>
      <div class="sbx-setup-btns">
        <button class="btn small" data-act="rotate" type="button">${ctx.t("↻ Xoay (R)", "↻ Rotate (R)")}</button>
        <button class="btn small" data-act="randomShips" type="button">${ctx.t("🔀 Tàu", "🔀 Ships")}</button>
        <button class="btn small" data-act="randomMines" type="button">${ctx.t("💣 Mìn", "💣 Mines")}</button>
        <button class="btn small" data-act="clear" type="button">${ctx.t("🗑️ Xóa", "🗑️ Clear")}</button>
        <button class="btn primary" data-act="ready" type="button">${ctx.t("✓ Sẵn sàng", "✓ Ready")}</button>
      </div>
    `;
    root.appendChild(setupBar);

    const fleetTray = document.createElement("div");
    fleetTray.className = "sbx-tray";
    root.appendChild(fleetTray);

    // ----- thanh hành động khi chơi -----
    const actionBar = document.createElement("div");
    actionBar.className = "sbx-actions sbx-hidden";
    root.appendChild(actionBar);

    const infoPanel = document.createElement("div");
    infoPanel.className = "sbx-info";
    root.appendChild(infoPanel);

    const boards = document.createElement("div");
    boards.className = "sbx-boards";
    root.appendChild(boards);

    const myWrap = makeBoard(ctx.t("🛡️ Biển của bạn", "🛡️ Your waters"), ctx.t("Tàu, mìn & phát bắn của đối thủ", "Ships, mines & enemy shots"));
    const oppWrap = makeBoard(ctx.t("🎯 Biển đối thủ", "🎯 Enemy waters"), ctx.t("Bắn / radar / torpedo / bom", "Shot / radar / torpedo / bomb"));
    boards.appendChild(myWrap.wrap);
    boards.appendChild(oppWrap.wrap);

    function makeBoard(title, sub) {
      const wrap = document.createElement("div");
      wrap.className = "sbx-board-wrap";
      const heading = document.createElement("div");
      heading.className = "sbx-board-title";
      heading.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
      const grid = document.createElement("div");
      grid.className = "sbx-grid";
      const cells = Array.from({ length: N }, () => Array(N));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = document.createElement("div");
          cell.className = "sbx-cell";
          cell.dataset.r = String(r);
          cell.dataset.c = String(c);
          grid.appendChild(cell);
          cells[r][c] = cell;
        }
      }
      wrap.appendChild(heading);
      wrap.appendChild(grid);
      return { wrap, grid, cells };
    }

    // ====================== XẾP TÀU & MÌN THỦ CÔNG ======================
    function shipCells(size, r, c, dir) {
      const out = [];
      for (let k = 0; k < size; k++) out.push(dir === "h" ? [r, c + k] : [r + k, c]);
      return out;
    }
    function canPlaceShip(size, r, c, dir) {
      return shipCells(size, r, c, dir).every(([rr, cc]) => inside(rr, cc) && myBoard[rr][cc] === null && !mineBoard[rr][cc]);
    }
    function placeShip(id, r, c, dir) {
      const tpl = FLEET[id];
      const cells = shipCells(tpl.size, r, c, dir);
      cells.forEach(([rr, cc]) => { myBoard[rr][cc] = id; });
      ships[id] = {
        id, key: tpl.key, name: tpl.name, size: tpl.size, icon: tpl.icon, note: tpl.note,
        armor: tpl.armor || 0, stealth: !!tpl.stealth, dir, cells, hits: new Set(), sunk: false,
      };
    }
    function pickUp(id) {
      const s = ships[id];
      if (!s) return;
      s.cells.forEach(([rr, cc]) => { myBoard[rr][cc] = null; });
      orient = s.dir || "h";
      ships[id] = null;
      selShip = id;
    }
    function clearShips() {
      myBoard = matrix(null);
      ships = [];
      selShip = null;
    }
    function randomShips() {
      clearShips();
      FLEET.forEach((tpl, id) => {
        let ok = false, guard = 0;
        while (!ok && guard++ < 800) {
          const dir = Math.random() < 0.5 ? "h" : "v";
          const r = Math.floor(Math.random() * N);
          const c = Math.floor(Math.random() * N);
          if (canPlaceShip(tpl.size, r, c, dir)) { placeShip(id, r, c, dir); ok = true; }
        }
      });
      selShip = null;
    }
    function minesPlaced() {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (mineBoard[r][c]) n++;
      return n;
    }
    function toggleMine(r, c) {
      if (myBoard[r][c] !== null) { ctx.sound("error"); return; }
      if (mineBoard[r][c]) { mineBoard[r][c] = false; ctx.sound("select"); return; }
      if (minesPlaced() >= mineCount) { lastInfo = ctx.t(`Chỉ được đặt tối đa ${mineCount} mìn.`, `You can place at most ${mineCount} mines.`); ctx.sound("error"); return; }
      mineBoard[r][c] = true;
      ctx.sound("select");
    }
    function randomMines() {
      mineBoard = matrix(false);
      let n = 0, guard = 0;
      while (n < mineCount && guard++ < 2000) {
        const r = Math.floor(Math.random() * N);
        const c = Math.floor(Math.random() * N);
        if (myBoard[r][c] !== null || mineBoard[r][c]) continue;
        mineBoard[r][c] = true;
        n++;
      }
    }
    function allShipsPlaced() { return FLEET.every((_, id) => ships[id]); }
    function nextUnplaced() { for (let i = 0; i < FLEET.length; i++) if (!ships[i]) return i; return null; }

    function setPlaceMode(m) {
      placeMode = m;
      selShip = m === "ship" ? (selShip ?? nextUnplaced()) : null;
      placeHover = null;
      render();
    }

    // ----- sự kiện thiết lập -----
    setupBar.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-mode]");
      if (modeBtn && phase === "placing" && !iReady) { setPlaceMode(modeBtn.dataset.mode); return; }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act || phase !== "placing" || iReady) return;
      if (act === "rotate") orient = orient === "h" ? "v" : "h";
      else if (act === "randomShips") { randomShips(); placeMode = "ship"; }
      else if (act === "randomMines") randomMines();
      else if (act === "clear") { clearShips(); mineBoard = matrix(false); }
      else if (act === "ready") return doReady();
      render();
    });

    fleetTray.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ship]");
      if (!btn || phase !== "placing" || iReady) return;
      const id = Number(btn.dataset.ship);
      placeMode = "ship";
      if (ships[id]) pickUp(id);
      else selShip = (selShip === id ? null : id);
      render();
    });

    document.addEventListener("keydown", onKey);
    function onKey(e) {
      if (!document.body.contains(root)) { document.removeEventListener("keydown", onKey); return; }
      if (phase === "placing" && !iReady && (e.key === "r" || e.key === "R")) { orient = orient === "h" ? "v" : "h"; render(); }
    }

    function doReady() {
      if (iReady) return;
      if (!allShipsPlaced()) { lastInfo = ctx.t("Bạn cần đặt đủ 5 tàu trước khi sẵn sàng.", "You must place all 5 ships before getting ready."); render(); return; }
      if (minesPlaced() !== mineCount) { lastInfo = ctx.t(`Hãy đặt đúng ${mineCount} mìn (hiện ${minesPlaced()}). Có thể bấm 💣 Mìn để rải ngẫu nhiên.`, `Place exactly ${mineCount} mines (now ${minesPlaced()}). Tap 💣 Mines to scatter randomly.`); render(); return; }
      iReady = true;
      mineTriggered = matrix(false);
      oppShotsOnMe = matrix(0);
      myShots = matrix(0);
      radarHints = matrix(null);
      oppRadarOnMe.length = 0;
      ctx.sendMove({ kind: "ready" });
      if (oppReady) beginPlay();
      else { ctx.setStatus(ctx.t("Đã sẵn sàng. Đang chờ đối thủ bố trí hạm đội & mìn...", "Ready. Waiting for the opponent to set up fleet & mines...")); render(); }
    }

    // ----- sự kiện trên bàn -----
    myWrap.grid.addEventListener("mousemove", (e) => {
      if (phase !== "placing" || placeMode !== "ship" || selShip === null) return;
      const rc = cellOf(e.target);
      if (!rc) return;
      if (!placeHover || placeHover[0] !== rc[0] || placeHover[1] !== rc[1]) { placeHover = rc; render(); }
    });
    myWrap.grid.addEventListener("mouseleave", () => { if (placeHover) { placeHover = null; render(); } });
    myWrap.grid.addEventListener("click", (e) => {
      if (phase !== "placing" || iReady) return;
      const rc = cellOf(e.target);
      if (!rc) return;
      const [r, c] = rc;
      if (placeMode === "mine") { toggleMine(r, c); render(); return; }
      if (selShip !== null) {
        if (canPlaceShip(FLEET[selShip].size, r, c, orient)) {
          placeShip(selShip, r, c, orient);
          selShip = nextUnplaced();
          placeHover = null;
        } else ctx.sound("error");
      } else if (myBoard[r][c] !== null) {
        pickUp(myBoard[r][c]);
      }
      render();
    });
    myWrap.grid.addEventListener("contextmenu", (e) => {
      if (phase === "placing" && !iReady) { e.preventDefault(); orient = orient === "h" ? "v" : "h"; render(); }
    });

    oppWrap.grid.addEventListener("mousemove", (e) => {
      if (!isMyTurn()) return;
      const rc = cellOf(e.target);
      if (!rc) return;
      if (!aimHover || aimHover[0] !== rc[0] || aimHover[1] !== rc[1]) { aimHover = rc; render(); }
    });
    oppWrap.grid.addEventListener("mouseleave", () => { if (aimHover) { aimHover = null; render(); } });
    oppWrap.grid.addEventListener("click", (e) => {
      if (!isMyTurn()) return;
      const rc = cellOf(e.target);
      if (!rc) return;
      takeLocalAction(rc[0], rc[1]);
    });

    function cellOf(target) {
      const cell = target.closest(".sbx-cell");
      if (!cell) return null;
      return [Number(cell.dataset.r), Number(cell.dataset.c)];
    }

    function beginPlay() {
      phase = "playing";
      turn = 0;
      setupBar.classList.add("sbx-hidden");
      fleetTray.classList.add("sbx-hidden");
      actionBar.classList.remove("sbx-hidden");
      selectedAction = "shot";
      ctx.setTurn(turn);
      lastInfo = ctx.t("Đã sẵn sàng. Dùng radar dò tìm rồi bắn, phóng torpedo hoặc thả bom chùm.", "Ready. Use radar to scan, then shoot, launch torpedoes or drop cluster bombs.");
      render();
      updateStatus();
    }

    // ====================== HÀNH ĐỘNG TẤN CÔNG ======================
    function torpedoTargets(r, c) {
      const raw = torpedoDir === "h"
        ? [[r, c - 1], [r, c], [r, c + 1]]
        : [[r - 1, c], [r, c], [r + 1, c]];
      return raw.filter(([rr, cc]) => inside(rr, cc));
    }
    function bombTargets(r, c) {
      const r0 = clamp(r, 0, N - 2), c0 = clamp(c, 0, N - 2);
      return [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]];
    }
    function radarTargets(r, c) {
      const out = [];
      for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) if (inside(rr, cc)) out.push([rr, cc]);
      return out;
    }
    function actionTargets(action, r, c) {
      if (action === "torpedo") return torpedoTargets(r, c);
      if (action === "bomb") return bombTargets(r, c);
      if (action === "radar") return radarTargets(r, c);
      return [[r, c]];
    }

    function takeLocalAction(r, c) {
      if (selectedAction === "radar") {
        if (radarCharges <= 0) { ctx.setStatus(ctx.t("Radar đã hết lượt.", "Radar is out of charges.")); return; }
        radarCharges--;
        awaiting = true;
        aimHover = null;
        radarHints[r][c] = { pending: true };
        ctx.sendMove({ kind: "radar", r, c });
        lastInfo = ctx.t(`Đang quét radar tại ${coord(r, c)}...`, `Scanning radar at ${coord(r, c)}...`);
        render();
        updateStatus();
        return;
      }

      const targets = actionTargets(selectedAction, r, c);
      const usable = targets.filter(([rr, cc]) => canAttackStatus(myShots[rr][cc]));
      if (!usable.length) { ctx.setStatus(ctx.t("Khu vực này đã bị bắn hết mục tiêu.", "This area has no targets left.")); return; }
      if (selectedAction === "torpedo") {
        if (torpedoCharges <= 0) { ctx.setStatus(ctx.t("Torpedo đã hết.", "No torpedoes left.")); return; }
        torpedoCharges--;
      } else if (selectedAction === "bomb") {
        if (bombCharges <= 0) { ctx.setStatus(ctx.t("Bom chùm đã hết.", "No cluster bombs left.")); return; }
        bombCharges--;
      }

      awaiting = true;
      aimHover = null;
      usable.forEach(([rr, cc]) => { myShots[rr][cc] = "pending"; });
      ctx.sendMove({ kind: "attack", action: selectedAction, cells: usable.map(([rr, cc]) => ({ r: rr, c: cc })) });
      const verb = selectedAction === "torpedo" ? ctx.t("phóng torpedo vào", "launched a torpedo at") : selectedAction === "bomb" ? ctx.t("thả bom chùm xuống", "dropped a cluster bomb on") : ctx.t("bắn vào", "fired at");
      lastInfo = ctx.t(`Đã ${verb} ${usable.map(([rr, cc]) => coord(rr, cc)).join(", ")}.`, `${verb} ${usable.map(([rr, cc]) => coord(rr, cc)).join(", ")}.`);
      render();
      updateStatus();
    }

    // ====================== NHẬN MESSAGE ======================
    function applyMove(move, fromRemote) {
      if (!fromRemote) return;
      if (move.kind === "ready") {
        oppReady = true;
        if (iReady) beginPlay();
        else ctx.setStatus(ctx.t("Đối thủ đã sẵn sàng. Bố trí hạm đội & mìn rồi bấm Sẵn sàng.", "Opponent is ready. Set up your fleet & mines then press Ready."));
        render();
        return;
      }

      if (move.kind === "attack") {
        const extraTurn = mySkipNext;
        mySkipNext = false;
        const result = resolveIncomingAttack(move);
        result.extraTurn = extraTurn && !result.gameOver;
        ctx.sendMove({ kind: "attackResult", ...result });
        if (result.gameOver) { render(); endGame(false); return; }
        turn = result.extraTurn ? 1 - ctx.mySeat : ctx.mySeat;
        ctx.setTurn(turn);
        lastInfo = result.extraTurn
          ? ctx.t("Bạn đang bị phạt bỏ lượt do dính mìn, đối thủ được đi tiếp.", "You're skipping a turn from a mine hit; the opponent goes again.")
          : describeEnemyAttack(result);
        render();
        updateStatus();
        return;
      }

      if (move.kind === "attackResult") {
        awaiting = false;
        applyAttackResult(move);
        if (move.trap) mySkipNext = true;
        if (move.gameOver) { render(); endGame(true); return; }
        turn = move.extraTurn ? ctx.mySeat : 1 - ctx.mySeat;
        ctx.setTurn(turn);
        lastInfo = describeMyAttack(move);
        render();
        updateStatus();
        return;
      }

      if (move.kind === "radar") {
        const extraTurn = mySkipNext;
        mySkipNext = false;
        const scan = resolveRadar(move.r, move.c);
        scan.extraTurn = extraTurn;
        oppRadarOnMe.push({ r: move.r, c: move.c });
        ctx.sendMove({ kind: "radarResult", ...scan });
        turn = scan.extraTurn ? 1 - ctx.mySeat : ctx.mySeat;
        ctx.setTurn(turn);
        lastInfo = scan.extraTurn
          ? ctx.t("Bạn đang bị phạt bỏ lượt do dính mìn, đối thủ được đi tiếp.", "You're skipping a turn from a mine hit; the opponent goes again.")
          : ctx.t(`Đối thủ vừa quét radar tại ${coord(move.r, move.c)}.`, `The opponent just scanned radar at ${coord(move.r, move.c)}.`);
        render();
        updateStatus();
        return;
      }

      if (move.kind === "radarResult") {
        awaiting = false;
        radarHints[move.r][move.c] = { shipCount: move.shipCount, mineCount: move.mineCount, stealthPing: move.stealthPing };
        turn = move.extraTurn ? ctx.mySeat : 1 - ctx.mySeat;
        ctx.setTurn(turn);
        lastInfo = ctx.t(`Radar ${coord(move.r, move.c)}: ${move.shipCount} ô tàu, ${move.mineCount} mìn`, `Radar ${coord(move.r, move.c)}: ${move.shipCount} ship cells, ${move.mineCount} mines`)
          + (move.stealthPing ? ctx.t(", có tín hiệu tàu ngầm ngay tâm.", ", submarine signal at the center.") : ".");
        render();
        updateStatus();
      }
    }

    function resolveIncomingAttack(move) {
      const cells = move.cells.map(({ r, c }) => resolveCellAttack(r, c));
      const trap = cells.some((cell) => cell.mine);
      const gameOver = FLEET.every((_, id) => ships[id] && ships[id].sunk);
      if (cells.some((cell) => cell.hit || cell.armor)) ctx.sound("shot");
      else ctx.sound("miss");
      return { action: move.action, cells, trap, gameOver };
    }

    function resolveCellAttack(r, c) {
      if (!inside(r, c)) return { r, c, repeat: true };
      const prior = oppShotsOnMe[r][c];
      if (prior && prior !== "armor") return { r, c, repeat: true };
      if (mineBoard[r][c] && !mineTriggered[r][c]) {
        mineTriggered[r][c] = true;
        oppShotsOnMe[r][c] = "mine";
        return { r, c, hit: false, mine: true };
      }
      const shipId = myBoard[r][c];
      if (shipId === null) { oppShotsOnMe[r][c] = "miss"; return { r, c, hit: false }; }
      const ship = ships[shipId];
      const cellKey = keyOf(r, c);
      if (ship.armor > 0 && !ship.hits.has(cellKey)) {
        ship.armor--;
        oppShotsOnMe[r][c] = "armor";
        return { r, c, hit: false, armor: true, shipName: ship.name };
      }
      ship.hits.add(cellKey);
      oppShotsOnMe[r][c] = "hit";
      const sunk = ship.hits.size >= ship.size;
      if (sunk && !ship.sunk) {
        ship.sunk = true;
        if (ship.key === "scout") { radarCharges = 0; if (selectedAction === "radar") selectedAction = "shot"; }
        if (ship.key === "carrier") { torpedoCharges = 0; if (selectedAction === "torpedo") selectedAction = "shot"; }
        return { r, c, hit: true, sunk: true, shipName: ship.name, shipKey: ship.key, sunkCells: ship.cells };
      }
      return { r, c, hit: true, shipName: ship.name, shipKey: ship.key };
    }

    function resolveRadar(r, c) {
      let shipCount = 0, mineCount = 0, stealthPing = false;
      for (let rr = r - 1; rr <= r + 1; rr++) {
        for (let cc = c - 1; cc <= c + 1; cc++) {
          if (!inside(rr, cc)) continue;
          if (mineBoard[rr][cc] && !mineTriggered[rr][cc]) mineCount++;
          const shipId = myBoard[rr][cc];
          if (shipId === null) continue;
          const ship = ships[shipId];
          if (ship.stealth) { if (rr === r && cc === c) stealthPing = true; }
          else shipCount++;
        }
      }
      return { r, c, shipCount, mineCount, stealthPing };
    }

    function applyAttackResult(result) {
      result.cells.forEach((cell) => {
        if (cell.repeat) return;
        if (cell.mine) myShots[cell.r][cell.c] = "mine";
        else if (cell.armor) myShots[cell.r][cell.c] = "armor";
        else if (cell.hit) myShots[cell.r][cell.c] = "hit";
        else myShots[cell.r][cell.c] = "miss";
        if (cell.sunk && cell.sunkCells) cell.sunkCells.forEach(([rr, cc]) => { myShots[rr][cc] = "sunk"; });
      });
      if (result.cells.some((cell) => cell.hit || cell.armor)) ctx.sound("shot");
      else ctx.sound("miss");
    }

    function describeEnemyAttack(result) {
      const hits = result.cells.filter((c) => c.hit).length;
      const armor = result.cells.some((c) => c.armor);
      const mines = result.cells.some((c) => c.mine);
      const sunk = result.cells.find((c) => c.sunk);
      if (sunk) return ctx.t(`Đối thủ đã đánh chìm ${sunk.shipName} của bạn.`, `The opponent sank your ${fleetNameByName(sunk.shipName)}.`);
      if (armor) return ctx.t("Đối thủ bắn trúng lớp giáp thiết giáp hạm.", "The opponent hit the battleship's armor.");
      if (hits) return ctx.t(`Đối thủ bắn trúng ${hits} ô tàu của bạn.`, `The opponent hit ${hits} of your ship cells.`);
      if (mines) return ctx.t("Đối thủ đã dính mìn của bạn và sẽ bị phạt bỏ lượt!", "The opponent hit your mine and will skip a turn!");
      return ctx.t("Đối thủ bắn trượt.", "The opponent missed.");
    }

    function describeMyAttack(result) {
      const sunk = result.cells.find((c) => c.sunk);
      const armor = result.cells.some((c) => c.armor);
      const hits = result.cells.filter((c) => c.hit).length;
      const mines = result.cells.some((c) => c.mine);
      let text;
      if (sunk) text = ctx.t(`💥 Đánh chìm ${sunk.shipName}!`, `💥 Sank the ${fleetNameByName(sunk.shipName)}!`);
      else if (armor) text = ctx.t("Trúng lớp giáp — cần bắn lại ô đó để xuyên.", "Hit the armor — fire that cell again to pierce.");
      else if (hits) text = ctx.t(`Trúng ${hits} ô tàu.`, `Hit ${hits} ship cell(s).`);
      else if (mines) text = ctx.t("Bạn dính mìn ẩn! Sau lượt đối thủ, bạn bị bỏ lượt.", "You hit a hidden mine! After the opponent's turn, you skip yours.");
      else text = ctx.t("Trượt.", "Miss.");
      if (result.extraTurn) text += ctx.t(" Đối thủ đang bị phạt, bạn được đi tiếp.", " The opponent is penalized; you go again.");
      return text;
    }

    function endGame(iWon) {
      phase = "over";
      awaiting = false;
      ctx.setTurn(-1);
      if (iWon) { ctx.incScore(ctx.mySeat); ctx.setStatus(ctx.t("🎉 Bạn thắng - đã đánh chìm toàn bộ hạm đội đặc biệt của đối thủ!", "🎉 You win — you sank the opponent's entire special fleet!")); }
      else { ctx.incScore(1 - ctx.mySeat); ctx.setStatus(ctx.t("💀 Bạn thua - hạm đội đặc biệt của bạn đã bị đánh chìm.", "💀 You lose — your special fleet has been sunk.")); }
      render();
    }

    function coord(r, c) { return String.fromCharCode(65 + c) + (r + 1); }

    // ====================== RENDER ======================
    function render() {
      renderTray();
      renderActions();
      renderMyBoard();
      renderEnemyBoard();
      renderInfo();
      const setupVisible = phase === "placing";
      setupBar.classList.toggle("sbx-hidden", !setupVisible);
      fleetTray.classList.toggle("sbx-hidden", !setupVisible);
      myWrap.wrap.classList.toggle("sbx-active", setupVisible && !iReady);
      oppWrap.wrap.classList.toggle("sbx-active", isMyTurn());
    }

    function renderTray() {
      if (phase !== "placing") return;
      setupBar.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === placeMode));
      const hintTxt = iReady
        ? ctx.t("Đã sẵn sàng — chờ đối thủ.", "Ready — waiting for the opponent.")
        : placeMode === "mine"
          ? ctx.t(`Chế độ MÌN: bấm ô trống để đặt/gỡ mìn (${minesPlaced()}/${mineCount}).`, `MINE mode: click empty cells to add/remove mines (${minesPlaced()}/${mineCount}).`)
          : ctx.t(`Chế độ TÀU — hướng <b>${orient === "h" ? "Ngang ↔" : "Dọc ↕"}</b>. Bấm tàu để chọn, bấm bàn để đặt, bấm tàu đã đặt để chỉnh.`, `SHIP mode — orientation <b>${orient === "h" ? "Horizontal ↔" : "Vertical ↕"}</b>. Click a ship to select, the board to place, a placed ship to adjust.`);
      fleetTray.innerHTML = `<div class="sbx-tray-hint">${hintTxt}</div>` + FLEET.map((s, id) => {
        const done = !!ships[id];
        const sel = selShip === id && placeMode === "ship";
        return `<button class="sbx-ship-btn ${done ? "done" : ""} ${sel ? "sel" : ""}" data-ship="${id}" type="button" title="${fleetNote(id)}">
          <span class="sbx-ship-ic">${s.icon}</span>
          <b>${fleetName(id)}</b>
          <small>${"▪".repeat(s.size)} ${done ? "✓" : "(" + s.size + ")"}</small>
        </button>`;
      }).join("");
      const readyBtn = setupBar.querySelector('[data-act="ready"]');
      if (readyBtn) readyBtn.disabled = iReady || !allShipsPlaced() || minesPlaced() !== mineCount;
    }

    function renderActions() {
      if (phase !== "playing") { actionBar.innerHTML = ""; return; }
      const myTurn = isMyTurn();
      const defs = [
        ["shot", "🎯", ctx.t("Bắn", "Shoot"), ctx.t("1 ô", "1 cell"), Infinity],
        ["radar", "📡", ctx.t("Radar", "Radar"), ctx.t("quét 3×3", "scan 3×3"), radarCharges],
        ["torpedo", "🚀", ctx.t("Torpedo", "Torpedo"), ctx.t("3 ô thẳng", "3 in a line"), torpedoCharges],
        ["bomb", "💥", ctx.t("Bom chùm", "Cluster bomb"), ctx.t("nổ 2×2", "blast 2×2"), bombCharges],
      ];
      let html = defs.map(([id, ic, label, hint, left]) => {
        const off = !myTurn || (id !== "shot" && left <= 0);
        const leftTxt = left === Infinity ? "∞" : left;
        return `<button class="sbx-ability ${selectedAction === id ? "active" : ""}" data-action="${id}" type="button" ${off ? "disabled" : ""}>
          <span class="sbx-ab-ic">${ic}</span><b>${label}</b><small>${hint}</small><i class="sbx-ab-left">${leftTxt}</i>
        </button>`;
      }).join("");
      html += `<button class="sbx-torp-axis ${selectedAction === "torpedo" ? "" : "dim"}" data-dir="1" type="button" ${selectedAction === "torpedo" && myTurn ? "" : "disabled"}>${ctx.t("Torpedo:", "Torpedo:")} <b>${torpedoDir === "h" ? ctx.t("Ngang ↔", "Horizontal ↔") : ctx.t("Dọc ↕", "Vertical ↕")}</b></button>`;
      actionBar.innerHTML = html;
      actionBar.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!isMyTurn()) return;
          const a = btn.dataset.action;
          if (a !== "shot" && ((a === "radar" && radarCharges <= 0) || (a === "torpedo" && torpedoCharges <= 0) || (a === "bomb" && bombCharges <= 0))) return;
          selectedAction = a;
          aimHover = null;
          render();
          updateStatus();
        });
      });
      const axisBtn = actionBar.querySelector("[data-dir]");
      if (axisBtn) axisBtn.addEventListener("click", () => {
        torpedoDir = torpedoDir === "h" ? "v" : "h";
        render();
        updateStatus();
      });
    }

    function previewSet() {
      const set = {};
      if (phase === "placing" && placeMode === "ship" && selShip !== null && placeHover) {
        const cells = shipCells(FLEET[selShip].size, placeHover[0], placeHover[1], orient);
        const ok = canPlaceShip(FLEET[selShip].size, placeHover[0], placeHover[1], orient);
        cells.forEach(([r, c]) => { if (inside(r, c)) set[keyOf(r, c)] = ok ? "ok" : "bad"; });
      }
      return set;
    }

    function renderMyBoard() {
      const prev = previewSet();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = myWrap.cells[r][c];
          cell.className = "sbx-cell";
          cell.textContent = "";
          const shipId = myBoard[r][c];
          if (shipId !== null && ships[shipId]) {
            const ship = ships[shipId];
            cell.classList.add("ship", ship.key);
            cell.textContent = ship.icon;
          }
          if (mineBoard[r][c]) {
            cell.classList.add("mine");
            if (shipId === null) cell.textContent = mineTriggered[r][c] ? "✸" : "💣";
          }
          if (phase !== "placing") {
            const scan = oppRadarOnMe.some((p) => Math.abs(p.r - r) <= 1 && Math.abs(p.c - c) <= 1);
            if (scan) cell.classList.add("scanned");
            const shot = oppShotsOnMe[r][c];
            if (shot === "hit") cell.classList.add("hit");
            else if (shot === "armor") cell.classList.add("armor");
            else if (shot === "miss") cell.classList.add("miss");
            else if (shot === "mine") cell.classList.add("mine-hit");
          }
          const pv = prev[keyOf(r, c)];
          if (pv) cell.classList.add("preview", pv);
        }
      }
    }

    function renderEnemyBoard() {
      const aim = {};
      if (isMyTurn() && aimHover) actionTargets(selectedAction, aimHover[0], aimHover[1]).forEach(([r, c]) => { if (inside(r, c)) aim[keyOf(r, c)] = true; });
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = oppWrap.cells[r][c];
          cell.className = "sbx-cell";
          cell.textContent = "";
          const shot = myShots[r][c];
          if (shot === "pending") cell.classList.add("pending");
          else if (shot === "hit") cell.classList.add("hit");
          else if (shot === "sunk") cell.classList.add("hit", "sunk");
          else if (shot === "armor") { cell.classList.add("armor"); cell.textContent = "G"; }
          else if (shot === "miss") cell.classList.add("miss");
          else if (shot === "mine") { cell.classList.add("mine-hit"); cell.textContent = "✸"; }
          const hint = radarHints[r][c];
          if (hint) {
            cell.classList.add("radar");
            if (hint.pending) cell.textContent = "…";
            else if (!cell.textContent) {
              cell.textContent = hint.stealthPing ? "S" : String(hint.shipCount);
              cell.title = ctx.t(`Tàu: ${hint.shipCount}, mìn: ${hint.mineCount}`, `Ships: ${hint.shipCount}, mines: ${hint.mineCount}`) + (hint.stealthPing ? ctx.t(", tàu ngầm ngay tâm", ", submarine at center") : "");
            }
          }
          if (aim[keyOf(r, c)]) cell.classList.add("aim");
        }
      }
    }

    function renderInfo() {
      const fleetHtml = FLEET.map((tpl, id) => {
        const ship = ships[id];
        const hits = ship ? ship.hits.size : 0;
        const armor = ship && ship.armor > 0 ? ctx.t(` +giáp${ship.armor}`, ` +armor${ship.armor}`) : "";
        const status = !ship ? "—" : ship.sunk ? ctx.t("chìm", "sunk") : `${hits}/${tpl.size}${armor}`;
        return `<li class="${ship && ship.sunk ? "sunk" : ""}">
          <span class="sbx-ship-code">${tpl.icon}</span><span>${fleetName(id)}</span><b>${status}</b>
        </li>`;
      }).join("");
      const defaultHint = phase === "placing"
        ? ctx.t("Bố trí tàu & bãi mìn của bạn rồi bấm Sẵn sàng.", "Set up your ships & minefield then press Ready.")
        : ctx.t("Dùng radar dò tìm, rồi bắn / torpedo / bom chùm.", "Use radar to scan, then shoot / torpedo / cluster bomb.");
      infoPanel.innerHTML = `
        <div class="sbx-resource">
          <span>📡 Radar <b>${radarCharges}</b></span>
          <span>🚀 Torpedo <b>${torpedoCharges}</b></span>
          <span>💥 ${ctx.t("Bom", "Bomb")} <b>${bombCharges}</b></span>
          <span>💣 ${ctx.t("Mìn còn ẩn", "Mines hidden")} <b>${countMinesLeft()}</b></span>
          <span>${mySkipNext ? ctx.t("⚠️ Bị phạt bỏ lượt", "⚠️ Turn skip penalty") : ctx.t("✅ Sẵn sàng", "✅ Ready")}</span>
        </div>
        <ul class="sbx-fleet">${fleetHtml}</ul>
        <div class="sbx-last">${lastInfo || defaultHint}</div>
      `;
    }

    function countMinesLeft() {
      let n = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (mineBoard[r][c] && !mineTriggered[r][c]) n++;
      return n;
    }

    function updateStatus() {
      if (phase !== "playing") return;
      if (awaiting) { ctx.setStatus(ctx.t("Đang chờ đối thủ trả kết quả...", "Waiting for the opponent's result...")); return; }
      if (turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang hành động. Chuẩn bị phòng thủ.", "The opponent is acting. Prepare your defense.")); return; }
      const tip = {
        radar: ctx.t("Lượt bạn — chọn ô để quét radar 3×3.", "Your turn — pick a cell for a 3×3 radar scan."),
        torpedo: ctx.t(`Lượt bạn — torpedo đánh 3 ô theo ${torpedoDir === "h" ? "ngang" : "dọc"}.`, `Your turn — torpedo hits 3 cells ${torpedoDir === "h" ? "horizontally" : "vertically"}.`),
        bomb: ctx.t("Lượt bạn — bom chùm nổ vùng 2×2.", "Your turn — cluster bomb blasts a 2×2 area."),
        shot: ctx.t("Lượt bạn — chọn ô trên biển đối thủ để bắn.", "Your turn — pick a cell on the enemy waters to fire."),
      };
      ctx.setStatus(tip[selectedAction] || tip.shot);
    }

    // ----- khởi tạo -----
    if (!ctx.isOnline) {
      ctx.setStatus(ctx.t("Sea Battle Nâng Cấp chỉ chơi online vì cần giữ bí mật hạm đội và mìn.", "Sea Battle Plus is online-only since fleets and mines must stay secret."));
      return { applyMove: () => {}, destroy: () => document.removeEventListener("keydown", onKey) };
    }
    randomShips();
    randomMines();
    render();
    ctx.setStatus(ctx.t("Bố trí hạm đội & bãi mìn: bấm tàu để chọn, R/chuột phải để xoay, hoặc 🔀/💣 để ngẫu nhiên. Xong thì Sẵn sàng.", "Set up fleet & minefield: click a ship to select, R/right-click to rotate, or 🔀/💣 for random. Press Ready when done."));
    return { applyMove, destroy: () => document.removeEventListener("keydown", onKey) };
  }

  window.GameRegistry.register({
    id: "seabattleplus",
    name: "Sea Battle Nâng Cấp",
    emoji: "🌊",
    description: "Battleship online: tự xếp tàu & THIẾT KẾ BÃI MÌN, có radar 3×3, torpedo, bom chùm, tàu giáp & tàu ngầm tàng hình.",
    onlineReady: true,
    localReady: false,
    options: [
      { id: "mines", label: "Số mìn ẩn", default: 5, choices: [{ value: 3, label: "3 mìn" }, { value: 5, label: "5 mìn" }, { value: 7, label: "7 mìn" }] },
      { id: "radar", label: "Lượt radar", default: 3, choices: [{ value: 2, label: "2 lượt" }, { value: 3, label: "3 lượt" }, { value: 4, label: "4 lượt" }] },
      { id: "torpedo", label: "Torpedo", default: 2, choices: [{ value: 1, label: "1 quả" }, { value: 2, label: "2 quả" }, { value: 3, label: "3 quả" }] },
      { id: "bomb", label: "Bom chùm", default: 1, choices: [{ value: 0, label: "Tắt" }, { value: 1, label: "1 quả" }, { value: 2, label: "2 quả" }] },
    ],
    howTo: [
      "Game chỉ chơi online vì mỗi người có hạm đội và bãi mìn riêng cần giữ bí mật.",
      "XẾP TÀU: bấm tàu trong danh sách để chọn, xoay bằng nút ↻ / phím R / chuột phải, rồi bấm lên biển của bạn để đặt. Bấm tàu đã đặt để nhấc chỉnh. Hoặc bấm 🔀 để xếp ngẫu nhiên.",
      "ĐẶT MÌN (tính năng riêng): chuyển sang chế độ 💣, bấm các ô trống để tự thiết kế bãi mìn ẩn. Ai bắn trúng mìn của bạn sẽ bị phạt bỏ lượt. Hoặc bấm 💣 để rải ngẫu nhiên. Phải đặt đủ số mìn mới Sẵn sàng được.",
      "Bắn thường đánh 1 ô. Torpedo đánh tối đa 3 ô theo hàng ngang/dọc. Bom chùm nổ vùng 2×2.",
      "Radar quét vùng 3×3, trả về số ô tàu thường và số mìn trong vùng. Tàu ngầm không bị radar đếm, trừ khi quét đúng tâm.",
      "Thiết giáp hạm có 1 lớp giáp: lần đầu bắn trúng chỉ phá giáp, phải bắn lại ô đó mới gây sát thương.",
      "Nếu tàu trinh sát bị chìm, bạn mất radar còn lại. Nếu soái hạm bị chìm, bạn mất torpedo còn lại.",
      "Ai đánh chìm toàn bộ hạm đội đặc biệt của đối thủ trước sẽ thắng.",
    ],
    create,
  });
})();
