/* Tank Arena theo lượt - map lưới, vật cản, item, chơi chung máy hoặc online. */
(function () {
  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const ITEM_DEFS = {
    repair: { icon: "+", label: "Sửa chữa", desc: "hồi 30 máu", tone: "repair" },
    armor: { icon: "A", label: "Giáp", desc: "giảm sát thương đòn kế", tone: "armor" },
    rocket: { icon: "R", label: "Rocket", desc: "thêm 1 rocket", tone: "rocket" },
    mine: { icon: "M", label: "Mìn", desc: "thêm 1 mìn đặt bẫy", tone: "mine" },
  };
  const ITEM_KEYS = Object.keys(ITEM_DEFS);

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 11;
    const MAX_HP = o.hp || 100;
    const START_AP = o.ap || 4;
    const ROCKET_RANGE = o.range || 5;
    const density = {
      open: { wall: 0.06, crate: 0.11, water: 0.04, forest: 0.05 },
      balanced: { wall: 0.09, crate: 0.16, water: 0.06, forest: 0.07 },
      dense: { wall: 0.12, crate: 0.20, water: 0.08, forest: 0.09 },
    }[o.map || "balanced"] || { wall: 0.09, crate: 0.16, water: 0.06, forest: 0.07 };

    let terrain = makeTerrain();
    const items = Array.from({ length: N }, () => Array(N).fill(null));
    const mines = Array.from({ length: N }, () => Array(N).fill(null));
    const players = [
      { r: N - 1, c: 0, hp: MAX_HP, armor: false, rockets: 1, mines: 1 },
      { r: 0, c: N - 1, hp: MAX_HP, armor: false, rockets: 1, mines: 1 },
    ];

    let turn = 0;
    let ap = START_AP;
    let selected = "move";
    let over = false;
    let last = ctx.t("Chiếm vị trí, nhặt item, rồi tìm góc bắn.", "Take position, grab items, then find a firing angle.");
    // bản dịch nhãn/mô tả item (ITEM_DEFS là hằng module-level)
    const ITEM_LABEL_EN = { repair: "Repair", armor: "Armor", rocket: "Rocket", mine: "Mine" };
    const ITEM_DESC_EN = { repair: "heal 30 HP", armor: "reduce next hit's damage", rocket: "+1 rocket", mine: "+1 trap mine" };
    const itemLabel = (type) => ctx.t(ITEM_DEFS[type].label, ITEM_LABEL_EN[type] || ITEM_DEFS[type].label);
    const itemDesc = (type) => ctx.t(ITEM_DEFS[type].desc, ITEM_DESC_EN[type] || ITEM_DEFS[type].desc);
    let pendingFx = []; // hiệu ứng nổ chờ vẽ sau render
    let pendingBeam = []; // hiệu ứng tia đạn chờ vẽ sau render

    const root = document.createElement("div");
    root.className = "ta-root";

    const hud = document.createElement("div");
    hud.className = "ta-hud";
    root.appendChild(hud);

    const bar = document.createElement("div");
    bar.className = "ta-actions";
    const moveBtn = actionButton(ctx.t("Di chuyển", "Move"), "move", "MOVE", ctx.t("1 AP / ô", "1 AP / cell"));
    const shootBtn = actionButton(ctx.t("Bắn", "Shoot"), "shoot", "FIRE", "2 AP");
    const pierceBtn = actionButton(ctx.t("Bắn xuyên", "Pierce"), "pierce", "PRC", "3 AP");
    const rocketBtn = actionButton("Rocket", "rocket", "RKT", "3 AP");
    const mineBtn = actionButton(ctx.t("Đặt mìn", "Lay mine"), "mine", "MINE", "1 AP");
    const endBtn = document.createElement("button");
    endBtn.className = "btn small ta-action-card";
    endBtn.innerHTML = `<span class="ta-action-icon">END</span><span><b>${ctx.t("Kết thúc", "End")}</b><small>${ctx.t("nhường lượt", "pass turn")}</small></span>`;
    endBtn.addEventListener("click", () => applyMove({ t: "end" }, false));
    bar.appendChild(moveBtn);
    bar.appendChild(shootBtn);
    bar.appendChild(pierceBtn);
    bar.appendChild(rocketBtn);
    bar.appendChild(mineBtn);
    bar.appendChild(endBtn);
    root.appendChild(bar);

    const legend = document.createElement("div");
    legend.className = "ta-legend";
    legend.innerHTML = `
      <span><i class="ta-legend-tank p1"></i> ${ctx.t("Xe bạn", "Your tank")}</span>
      <span><i class="ta-legend-wall"></i> ${ctx.t("Tường chắn", "Wall")}</span>
      <span><i class="ta-legend-water"></i> ${ctx.t("Nước (đạn bay qua)", "Water (shots pass over)")}</span>
      <span><i class="ta-legend-forest"></i> ${ctx.t("Bụi cây (ẩn nấp, chắn đạn)", "Bushes (cover, block shots)")}</span>
      <span><i class="ta-legend-crate"></i> ${ctx.t("Thùng vật phẩm", "Item crate")}</span>
      <span><i class="ta-legend-item">+</i> ${ctx.t("Item", "Item")}</span>
      <span><i class="ta-legend-mine"></i> ${ctx.t("Mìn đã đặt", "Placed mine")}</span>
    `;
    root.appendChild(legend);

    const board = document.createElement("div");
    board.className = "ta-board";
    board.style.setProperty("--ta-n", N);
    root.appendChild(board);
    ctx.boardEl.appendChild(root);

    const cells = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ta-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.addEventListener("click", () => onCell(r, c));
        board.appendChild(cell);
        cells[r][c] = cell;
      }
    }

    function actionButton(label, action, icon, cost) {
      const btn = document.createElement("button");
      btn.className = "btn small ta-action-card";
      btn.innerHTML = `<span class="ta-action-icon">${icon}</span><span><b>${label}</b><small>${cost}</small></span>`;
      btn.addEventListener("click", () => {
        selected = action;
        render();
        updateStatus();
      });
      return btn;
    }

    function makeTerrain() {
      const grid = Array.from({ length: N }, () =>
        Array.from({ length: N }, () => ({ type: "empty", hp: 0, item: null }))
      );

      function safe(r, c) {
        const s1 = Math.abs(r - (N - 1)) + Math.abs(c);
        const s2 = Math.abs(r) + Math.abs(c - (N - 1));
        return s1 <= 2 || s2 <= 2 || r === 0 || c === 0 || r === N - 1 || c === N - 1;
      }

      function setPair(r, c, cell) {
        const mr = N - 1 - r;
        const mc = N - 1 - c;
        if (!safe(r, c)) grid[r][c] = cloneCell(cell);
        if (!safe(mr, mc)) grid[mr][mc] = cloneCell(cell);
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const mr = N - 1 - r;
          const mc = N - 1 - c;
          if (r > mr || (r === mr && c > mc) || safe(r, c)) continue;
          const roll = ctx.rng();
          const tWall = density.wall;
          const tCrate = tWall + density.crate;
          const tWater = tCrate + density.water;
          const tForest = tWater + density.forest;
          if (roll < tWall) {
            setPair(r, c, { type: "wall", hp: 0, item: null });
          } else if (roll < tCrate) {
            const item = ctx.rng() < 0.58 ? ITEM_KEYS[Math.floor(ctx.rng() * ITEM_KEYS.length)] : null;
            setPair(r, c, { type: "crate", hp: 1, item });
          } else if (roll < tWater) {
            setPair(r, c, { type: "water", hp: 0, item: null });
          } else if (roll < tForest) {
            setPair(r, c, { type: "forest", hp: 0, item: null });
          }
        }
      }

      return grid;
    }

    function cloneCell(cell) {
      return { type: cell.type, hp: cell.hp, item: cell.item };
    }

    function onCell(r, c) {
      if (!canAct()) return;
      if (selected === "move") applyMove({ t: "move", r, c }, false);
      else if (selected === "shoot") applyMove({ t: "shoot", r, c }, false);
      else if (selected === "pierce") applyMove({ t: "pierce", r, c }, false);
      else if (selected === "rocket") applyMove({ t: "rocket", r, c }, false);
      else if (selected === "mine") applyMove({ t: "mine", r, c }, false);
    }

    function fx(r, c, big) { pendingFx.push({ r, c, big: !!big }); }
    function fxBeam(list, cls) { pendingBeam.push({ list, cls }); }
    function flushFx() {
      // tia đạn vẽ trước, nổ vẽ sau (đè lên)
      pendingBeam.forEach(({ list, cls }) => {
        list.forEach(({ r, c }) => {
          const cell = cells[r] && cells[r][c];
          if (!cell) return;
          const b = document.createElement("span");
          b.className = "ta-beam " + cls;
          cell.appendChild(b);
          setTimeout(() => b.remove(), 380);
        });
      });
      pendingBeam = [];
      if (!pendingFx.length) return;
      let shook = false;
      pendingFx.forEach(({ r, c, big }) => {
        const cell = cells[r] && cells[r][c];
        if (!cell) return;
        const b = document.createElement("span");
        b.className = "ta-boom" + (big ? " big" : "");
        cell.appendChild(b);
        setTimeout(() => b.remove(), 620);
        shook = true;
      });
      pendingFx = [];
      if (shook) {
        board.classList.add("ta-shake");
        setTimeout(() => board.classList.remove("ta-shake"), 320);
      }
    }

    function canAct(fromRemote) {
      return !over && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function occupied(r, c) {
      return players.findIndex((p) => p.hp > 0 && p.r === r && p.c === c);
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function passable(r, c) {
      return inside(r, c) && (terrain[r][c].type === "empty" || terrain[r][c].type === "forest") && occupied(r, c) === -1;
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      let ok = false;
      if (move.t === "move") ok = doMove(move.r, move.c, fromRemote);
      else if (move.t === "shoot") ok = doShoot(move.r, move.c, fromRemote);
      else if (move.t === "pierce") ok = doPierce(move.r, move.c, fromRemote);
      else if (move.t === "rocket") ok = doRocket(move.r, move.c, fromRemote);
      else if (move.t === "mine") ok = doMine(move.r, move.c, fromRemote);
      else if (move.t === "end") ok = doEnd(fromRemote);

      if (!ok) return;
      if (!fromRemote) ctx.sendMove(move);
      render();
      flushFx();
      updateStatus();
    }

    function doMove(r, c, fromRemote) {
      if (!canAct(fromRemote) || (!fromRemote && selected !== "move")) return false;
      const path = shortestPath(players[turn], { r, c }, ap);
      if (!path || path.length < 2) return false;
      const cost = path.length - 1;
      const pl = players[turn];
      for (let i = 1; i < path.length; i++) {
        pl.r = path[i].r;
        pl.c = path[i].c;
        triggerMine(pl.r, pl.c);
        collectItem(pl.r, pl.c);
        if (over) return true;
      }
      ap -= cost;
      last = ctx.t(`Người chơi ${turn + 1} di chuyển ${cost} ô.`, `Player ${turn + 1} moves ${cost} cell(s).`);
      ctx.sound("select");
      if (ap <= 0) endTurn();
      return true;
    }

    function shortestPath(start, target, maxCost) {
      if (!passable(target.r, target.c)) return null;
      const q = [{ r: start.r, c: start.c }];
      const seen = new Set([start.r + "," + start.c]);
      const prev = new Map();
      while (q.length) {
        const cur = q.shift();
        const dist = distanceFromPrev(cur, prev);
        if (dist >= maxCost) continue;
        for (const [dr, dc] of DIRS) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          const key = nr + "," + nc;
          if (!passable(nr, nc) || seen.has(key)) continue;
          seen.add(key);
          prev.set(key, cur.r + "," + cur.c);
          if (nr === target.r && nc === target.c) return buildPath(key, prev);
          q.push({ r: nr, c: nc });
        }
      }
      return null;
    }

    function distanceFromPrev(cur, prev) {
      let key = cur.r + "," + cur.c;
      let d = 0;
      while (prev.has(key)) {
        key = prev.get(key);
        d++;
      }
      return d;
    }

    function buildPath(endKey, prev) {
      const out = [];
      let key = endKey;
      while (key) {
        const [r, c] = key.split(",").map(Number);
        out.push({ r, c });
        key = prev.get(key);
      }
      return out.reverse();
    }

    function collectItem(r, c) {
      const type = items[r][c];
      if (!type) return;
      const pl = players[turn];
      items[r][c] = null;
      if (type === "repair") pl.hp = Math.min(MAX_HP, pl.hp + 30);
      else if (type === "armor") pl.armor = true;
      else if (type === "rocket") pl.rockets++;
      else if (type === "mine") pl.mines++;
      last = ctx.t(`Người chơi ${turn + 1} nhặt ${ITEM_DEFS[type].label}: ${ITEM_DEFS[type].desc}.`, `Player ${turn + 1} picks up ${itemLabel(type)}: ${itemDesc(type)}.`);
      ctx.sound("capture");
    }

    function triggerMine(r, c) {
      const mine = mines[r][c];
      if (!mine || mine.owner === turn) return;
      mines[r][c] = null;
      last = ctx.t(`Người chơi ${turn + 1} cán mìn!`, `Player ${turn + 1} hit a mine!`);
      damageTank(turn, 28);
      ctx.sound("shot");
    }

    function doShoot(r, c, fromRemote) {
      if (!canAct(fromRemote) || (!fromRemote && selected !== "shoot") || ap < 2) return false;
      const pl = players[turn];
      const dir = lineDir(pl.r, pl.c, r, c);
      if (!dir) return false;
      ap -= 2;
      const hit = traceShot(pl.r, pl.c, r, c, dir);
      // tia đạn từ vị trí bắn tới điểm chạm
      const beam = [];
      let br = pl.r + dir[0], bc = pl.c + dir[1];
      while (inside(br, bc)) {
        beam.push({ r: br, c: bc });
        if (br === hit.r && bc === hit.c) break;
        br += dir[0]; bc += dir[1];
      }
      fxBeam(beam, turn === 0 ? "p1" : "p2");
      if (hit.type === "tank") {
        damageTank(hit.player, 32);
        fx(hit.r, hit.c, true);
        last = ctx.t(`Người chơi ${turn + 1} bắn trúng xe tăng đối thủ.`, `Player ${turn + 1} hit the enemy tank.`);
        ctx.sound("shot");
      } else if (hit.type === "crate") {
        breakCrate(hit.r, hit.c);
        fx(hit.r, hit.c, false);
        last = ctx.t(`Người chơi ${turn + 1} phá thùng vật phẩm.`, `Player ${turn + 1} destroyed an item crate.`);
        ctx.sound("capture");
      } else if (hit.type === "forest") {
        fx(hit.r, hit.c, false);
        last = ctx.t("Đạn bị bụi cây cản lại.", "The shot was stopped by bushes.");
        ctx.sound("miss");
      } else if (hit.type === "wall") {
        fx(hit.r, hit.c, false);
        last = ctx.t("Đạn ghim vào tường chắn.", "The shot lodged into a wall.");
        ctx.sound("miss");
      } else {
        last = ctx.t("Bắn trượt.", "Missed.");
        ctx.sound("miss");
      }
      if (!over && ap <= 0) endTurn();
      return true;
    }

    function lineDir(sr, sc, tr, tc) {
      if (sr === tr && sc !== tc) return [0, tc > sc ? 1 : -1];
      if (sc === tc && sr !== tr) return [tr > sr ? 1 : -1, 0];
      return null;
    }

    function traceShot(sr, sc, tr, tc, dir) {
      let r = sr + dir[0];
      let c = sc + dir[1];
      while (inside(r, c)) {
        const tank = occupied(r, c);
        if (tank !== -1) return { type: "tank", player: tank, r, c };
        const cell = terrain[r][c];
        if (cell.type === "wall") return { type: "wall", r, c };
        if (cell.type === "crate") return { type: "crate", r, c };
        if (r === tr && c === tc) return { type: "miss", r, c };
        r += dir[0];
        c += dir[1];
      }
      return { type: "miss", r: tr, c: tc };
    }

    // Bắn xuyên: đạn xuyên qua bụi cây và phá thùng dọc đường,
    // gây sát thương MỌI xe tăng trên đường thẳng, chỉ dừng ở tường. Tốn 3 AP.
    function doPierce(r, c, fromRemote) {
      if (!canAct(fromRemote) || (!fromRemote && selected !== "pierce") || ap < 3) return false;
      const pl = players[turn];
      const dir = lineDir(pl.r, pl.c, r, c);
      if (!dir) return false;
      ap -= 3;
      const beam = [];
      let rr = pl.r + dir[0], cc = pl.c + dir[1];
      let hitsTank = false, brokeCrate = false;
      while (inside(rr, cc)) {
        const cell = terrain[rr][cc];
        if (cell.type === "wall") { fx(rr, cc, false); break; }
        beam.push({ r: rr, c: cc });
        const tank = occupied(rr, cc);
        if (tank !== -1) { damageTank(tank, 30, true); fx(rr, cc, true); hitsTank = true; }
        if (cell.type === "crate") { breakCrate(rr, cc); brokeCrate = true; }
        rr += dir[0]; cc += dir[1];
      }
      checkEnd();
      fxBeam(beam, turn === 0 ? "p1" : "p2");
      last = hitsTank
        ? ctx.t(`Người chơi ${turn + 1} bắn xuyên trúng xe tăng đối thủ!`, `Player ${turn + 1} pierced the enemy tank!`)
        : (brokeCrate ? ctx.t(`Đạn xuyên phá thùng dọc đường.`, `The piercing shot broke crates along the way.`) : ctx.t(`Đạn xuyên của Người chơi ${turn + 1} quét một hàng.`, `Player ${turn + 1}'s piercing shot swept a line.`));
      ctx.sound("shot");
      if (!over && ap <= 0) endTurn();
      return true;
    }

    function pierceRay(pl) {
      const out = [];
      for (const [dr, dc] of DIRS) {
        let r = pl.r + dr, c = pl.c + dc;
        while (inside(r, c)) {
          const cell = terrain[r][c];
          if (cell.type === "wall") break;
          out.push({ r, c, hit: occupied(r, c) !== -1 });
          r += dr; c += dc;
        }
      }
      return out;
    }

    function doRocket(r, c, fromRemote) {
      if (!canAct(fromRemote) || (!fromRemote && selected !== "rocket") || ap < 3) return false;
      const pl = players[turn];
      if (pl.rockets <= 0) return false;
      if (Math.abs(pl.r - r) + Math.abs(pl.c - c) > ROCKET_RANGE) return false;
      pl.rockets--;
      ap -= 3;
      const damaged = [];
      for (let rr = r - 1; rr <= r + 1; rr++) {
        for (let cc = c - 1; cc <= c + 1; cc++) {
          if (!inside(rr, cc)) continue;
          if (terrain[rr][cc].type === "crate") breakCrate(rr, cc);
          const tank = occupied(rr, cc);
          if (tank !== -1) {
            const close = rr === r && cc === c;
            damageTank(tank, close ? 48 : 28, true);
            damaged.push(tank);
          }
        }
      }
      checkEnd();
      last = damaged.length
        ? ctx.t(`Rocket nổ tại vùng mục tiêu, gây sát thương xe tăng.`, `Rocket exploded on the target area, damaging tanks.`)
        : ctx.t(`Rocket phá khu vực ${coord(r, c)}.`, `Rocket blasted the ${coord(r, c)} area.`);
      ctx.sound("shot");
      if (!over && ap <= 0) endTurn();
      return true;
    }

    function doMine(r, c, fromRemote) {
      if (!canAct(fromRemote) || (!fromRemote && selected !== "mine") || ap < 1) return false;
      const pl = players[turn];
      if (pl.mines <= 0) return false;
      const near = Math.abs(pl.r - r) + Math.abs(pl.c - c) === 1;
      if (!near || !passable(r, c) || mines[r][c] || items[r][c]) return false;
      mines[r][c] = { owner: turn };
      pl.mines--;
      ap--;
      last = ctx.t(`Người chơi ${turn + 1} đặt một quả mìn chiến thuật.`, `Player ${turn + 1} laid a tactical mine.`);
      ctx.sound("select");
      if (ap <= 0) endTurn();
      return true;
    }

    function doEnd(fromRemote) {
      if (!canAct(fromRemote)) return false;
      last = ctx.t(`Người chơi ${turn + 1} kết thúc lượt.`, `Player ${turn + 1} ended the turn.`);
      endTurn();
      return true;
    }

    function breakCrate(r, c) {
      const cell = terrain[r][c];
      if (cell.type !== "crate") return;
      if (cell.item) items[r][c] = cell.item;
      terrain[r][c] = { type: "empty", hp: 0, item: null };
    }

    function damageTank(idx, raw, deferEndCheck) {
      const p = players[idx];
      let dmg = raw;
      if (p.armor) {
        dmg = Math.ceil(dmg * 0.45);
        p.armor = false;
      }
      p.hp = Math.max(0, p.hp - dmg);
      if (!deferEndCheck) checkEnd();
    }

    function checkEnd() {
      if (over) return;
      const dead0 = players[0].hp <= 0;
      const dead1 = players[1].hp <= 0;
      if (!dead0 && !dead1) return;
      over = true;
      ctx.setTurn(-1);
      if (dead0 && dead1) {
        ctx.setStatus(ctx.t("🤝 Cả hai xe tăng cùng bị hạ - hòa!", "🤝 Both tanks destroyed — draw!"));
      } else {
        const winner = dead0 ? 1 : 0;
        ctx.incScore(winner);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng Tank Arena!`, `🎉 Player ${winner + 1} wins Tank Arena!`));
      }
    }

    function endTurn() {
      if (over) return;
      turn = 1 - turn;
      ap = START_AP;
      selected = "move";
      ctx.setTurn(turn);
    }

    function highlights() {
      const map = new Map();
      if (!canAct()) return map;
      const pl = players[turn];
      if (selected === "move") {
        reachable(pl, ap).forEach((key) => map.set(key, "move"));
      } else if (selected === "shoot") {
        rayCells(pl).forEach(({ r, c, stop }) => map.set(r + "," + c, stop ? "danger" : "aim"));
      } else if (selected === "pierce") {
        if (ap >= 3) pierceRay(pl).forEach(({ r, c, hit }) => map.set(r + "," + c, hit ? "danger" : "aim"));
      } else if (selected === "rocket") {
        if (pl.rockets > 0 && ap >= 3) {
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              if (Math.abs(pl.r - r) + Math.abs(pl.c - c) <= ROCKET_RANGE) map.set(r + "," + c, "danger");
            }
          }
        }
      } else if (selected === "mine") {
        if (pl.mines > 0 && ap >= 1) {
          DIRS.forEach(([dr, dc]) => {
            const r = pl.r + dr;
            const c = pl.c + dc;
            if (passable(r, c) && !items[r][c] && !mines[r][c]) map.set(r + "," + c, "mine");
          });
        }
      }
      return map;
    }

    function reachable(start, maxCost) {
      const q = [{ r: start.r, c: start.c, d: 0 }];
      const seen = new Set([start.r + "," + start.c]);
      const out = new Set();
      while (q.length) {
        const cur = q.shift();
        if (cur.d >= maxCost) continue;
        for (const [dr, dc] of DIRS) {
          const r = cur.r + dr;
          const c = cur.c + dc;
          const key = r + "," + c;
          if (!passable(r, c) || seen.has(key)) continue;
          seen.add(key);
          out.add(key);
          q.push({ r, c, d: cur.d + 1 });
        }
      }
      return out;
    }

    function rayCells(pl) {
      const out = [];
      for (const [dr, dc] of DIRS) {
        let r = pl.r + dr;
        let c = pl.c + dc;
        while (inside(r, c)) {
          const tank = occupied(r, c);
          const cell = terrain[r][c];
          const stop = tank !== -1 || cell.type === "wall" || cell.type === "crate";
          out.push({ r, c, stop });
          if (stop) break;
          r += dr;
          c += dc;
        }
      }
      return out;
    }

    function updateButtons() {
      moveBtn.classList.toggle("active", selected === "move");
      shootBtn.classList.toggle("active", selected === "shoot");
      pierceBtn.classList.toggle("active", selected === "pierce");
      rocketBtn.classList.toggle("active", selected === "rocket");
      mineBtn.classList.toggle("active", selected === "mine");
      const lock = !canAct();
      moveBtn.disabled = lock || ap <= 0;
      shootBtn.disabled = lock || ap < 2;
      pierceBtn.disabled = lock || ap < 3;
      rocketBtn.disabled = lock || ap < 3 || players[turn].rockets <= 0;
      mineBtn.disabled = lock || ap < 1 || players[turn].mines <= 0;
      endBtn.disabled = lock;
      rocketBtn.querySelector("small").textContent = ctx.t(`3 AP • còn ${players[turn].rockets}`, `3 AP • ${players[turn].rockets} left`);
      mineBtn.querySelector("small").textContent = ctx.t(`1 AP • còn ${players[turn].mines}`, `1 AP • ${players[turn].mines} left`);
    }

    function render() {
      const hi = highlights();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cells[r][c];
          const h = hi.get(r + "," + c);
          const terrainCell = terrain[r][c];
          const tank = occupied(r, c);
          cell.className = "ta-cell";
          cell.innerHTML = "";
          cell.title = coord(r, c);
          cell.dataset.coord = coord(r, c);
          if (terrainCell.type === "wall") {
            cell.classList.add("wall");
            cell.innerHTML = `<span class="ta-obstacle ta-wall-asset" aria-hidden="true"></span>`;
          }
          if (terrainCell.type === "crate") {
            cell.classList.add("crate");
            cell.innerHTML = `<span class="ta-obstacle ta-crate-asset" aria-hidden="true"></span>`;
          }
          if (items[r][c]) {
            const item = ITEM_DEFS[items[r][c]];
            cell.classList.add("item", "item-" + item.tone);
            cell.innerHTML = `<span class="ta-item-badge" aria-hidden="true">${item.icon}</span>`;
            cell.title += ` - ${itemLabel(items[r][c])}`;
          }
          if (mines[r][c]) {
            cell.classList.add("mine");
            cell.innerHTML = `<span class="ta-mine-asset" aria-hidden="true"></span>`;
          }
          if (tank !== -1) {
            cell.classList.add("tank", tank === 0 ? "p1" : "p2", tankFacing(tank));
            if (tank === turn && !over) cell.classList.add("active-tank");
            cell.innerHTML = tankMarkup(tank);
            const flags = [];
            if (players[tank].armor) flags.push("A");
            if (players[tank].rockets > 0) flags.push("R" + players[tank].rockets);
            if (flags.length) cell.title += " - " + flags.join(" ");
          }
          if (h) cell.classList.add("hl-" + h);
        }
      }

      hud.innerHTML = `
        <div class="ta-player p1 ${turn === 0 && !over ? "active" : ""}">
          <span><i class="ta-mini-tank p1"></i>${ctx.t("Người chơi 1", "Player 1")}</span>
          <b>${players[0].hp}/${MAX_HP}</b>
          <em>${loadoutText(0)}</em>
          <i style="width:${Math.max(0, players[0].hp / MAX_HP * 100)}%"></i>
        </div>
        <div class="ta-mid">
          <b>AP ${ap}/${START_AP}</b>
          <div class="ta-ap-pips">${apPips()}</div>
          <span>${selectedLabel()}</span>
          <small>${last}</small>
        </div>
        <div class="ta-player p2 ${turn === 1 && !over ? "active" : ""}">
          <span><i class="ta-mini-tank p2"></i>${ctx.t("Người chơi 2", "Player 2")}</span>
          <b>${players[1].hp}/${MAX_HP}</b>
          <em>${loadoutText(1)}</em>
          <i style="width:${Math.max(0, players[1].hp / MAX_HP * 100)}%"></i>
        </div>
      `;
      updateButtons();
    }

    function tankMarkup(idx) {
      return `
        <span class="ta-tank-asset" aria-hidden="true">
          <span class="ta-track left"></span>
          <span class="ta-track right"></span>
          <span class="ta-hull"></span>
          <span class="ta-turret"></span>
          <span class="ta-gun"></span>
          <span class="ta-player-tag">${idx + 1}</span>
        </span>
      `;
    }

    function tankFacing(idx) {
      const me = players[idx];
      const foe = players[1 - idx];
      const dr = foe.r - me.r;
      const dc = foe.c - me.c;
      if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? "face-e" : "face-w";
      return dr > 0 ? "face-s" : "face-n";
    }

    function loadoutText(idx) {
      const p = players[idx];
      return ctx.t(`${p.armor ? "Giáp bật" : "Không giáp"} • R${p.rockets} • M${p.mines}`, `${p.armor ? "Armored" : "No armor"} • R${p.rockets} • M${p.mines}`);
    }

    function apPips() {
      let html = "";
      for (let i = 0; i < START_AP; i++) {
        html += `<i class="${i < ap ? "on" : ""}"></i>`;
      }
      return html;
    }

    function selectedLabel() {
      if (selected === "move") return ctx.t("Di chuyển tốn AP theo số ô.", "Moving costs AP per cell.");
      if (selected === "shoot") return ctx.t("Bắn thẳng hàng/cột, tốn 2 AP.", "Shoot straight along row/column, costs 2 AP.");
      if (selected === "pierce") return ctx.t("Bắn xuyên: xuyên bụi cây & phá thùng, trúng mọi xe trên đường, tốn 3 AP.", "Pierce: goes through bushes & breaks crates, hits every tank in line, costs 3 AP.");
      if (selected === "rocket") return ctx.t(`Rocket nổ 3x3, tầm ${ROCKET_RANGE}, tốn 3 AP.`, `Rocket explodes 3x3, range ${ROCKET_RANGE}, costs 3 AP.`);
      return ctx.t("Đặt mìn ở ô kề bên, tốn 1 AP.", "Lay a mine on an adjacent cell, costs 1 AP.");
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi. ${last}`, `Opponent's turn. ${last}`));
      } else {
        ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}. Còn ${ap} AP. ${selectedLabel()}`, `Player ${turn + 1}'s turn. ${ap} AP left. ${selectedLabel()}`));
      }
    }

    function coord(r, c) {
      return String.fromCharCode(65 + c) + (r + 1);
    }

    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "tankarena",
    name: "Tank Arena Theo Lượt",
    emoji: "🪖",
    description: "Đấu xe tăng trên map lưới có tường, thùng vật phẩm, mìn, rocket và điểm hành động theo lượt.",
    onlineReady: true,
    options: [
      {
        id: "size",
        label: "Kích thước map",
        default: 11,
        choices: [
          { value: 9, label: "9×9 (nhanh)" },
          { value: 11, label: "11×11 (chuẩn)" },
          { value: 13, label: "13×13 (rộng)" },
        ],
      },
      {
        id: "map",
        label: "Mật độ vật cản",
        default: "balanced",
        choices: [
          { value: "open", label: "Thoáng" },
          { value: "balanced", label: "Cân bằng" },
          { value: "dense", label: "Dày đặc" },
        ],
      },
      {
        id: "ap",
        label: "AP mỗi lượt",
        default: 4,
        choices: [
          { value: 3, label: "3 AP" },
          { value: 4, label: "4 AP" },
          { value: 5, label: "5 AP" },
        ],
      },
      {
        id: "hp",
        label: "Máu xe tăng",
        default: 100,
        choices: [
          { value: 80, label: "80 HP" },
          { value: 100, label: "100 HP" },
          { value: 120, label: "120 HP" },
        ],
      },
    ],
    howTo: [
      "Mỗi người điều khiển một xe tăng trên map lưới. Có thể chơi chung máy hoặc online.",
      "Mỗi lượt có một số AP. Di chuyển tốn AP theo số ô đi được, bắn thường tốn 2 AP, rocket tốn 3 AP, đặt mìn tốn 1 AP.",
      "Bắn thường chỉ bắn theo hàng ngang hoặc cột dọc, đạn dừng khi gặp xe tăng, thùng vật phẩm hoặc tường.",
      "Bắn xuyên (3 AP): đạn xuyên qua bụi cây và phá thùng dọc đường, gây sát thương mọi xe tăng trên đường thẳng, chỉ bị tường chặn lại.",
      "Rocket có tầm giới hạn, nổ vùng 3×3, phá thùng và gây sát thương mạnh.",
      "Thùng vật phẩm có thể rơi sửa chữa, giáp, rocket hoặc mìn. Di chuyển vào ô item để nhặt.",
      "Giáp giảm sát thương của đòn kế tiếp. Mìn đặt ở ô kề bên và nổ khi đối thủ đi vào.",
      "Có thể bấm Kết thúc lượt nếu muốn giữ vị trí. Hạ máu xe tăng đối thủ xuống 0 để thắng.",
    ],
    create,
  });
})();
