/* Dice Battle - đội quân xúc xắc, di chuyển trên lưới và đánh nhau bằng roll. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const PIP_POS = {
    1: ["c"],
    2: ["tl", "br"],
    3: ["tl", "c", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "c", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"],
  };

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 8;
    const TEAM = o.team || 5;
    const MAX_HP = o.hp || 10;
    const BLOCKS = o.blocks === "many" ? 10 : o.blocks === "few" ? 4 : 7;

    const terrain = makeTerrain();
    let units = makeUnits();
    let turn = 0;
    let selectedId = null;
    let over = false;
    let last = ctx.t("Chọn một quân xúc xắc của bạn để di chuyển hoặc tấn công.", "Select one of your dice units to move or attack.");
    let justRolled = new Set(); // id quân vừa đổi mặt (để chạy hoạt ảnh lăn)
    let lastCells = [];          // ô của hành động cuối (highlight)
    let pendingFloat = [];       // chữ nổi (sát thương/hồi máu) chờ vẽ

    const root = document.createElement("div");
    root.className = "db-root";

    const hud = document.createElement("div");
    hud.className = "db-hud";
    root.appendChild(hud);

    const toolbar = document.createElement("div");
    toolbar.className = "db-toolbar";
    const focusBtn = document.createElement("button");
    focusBtn.className = "btn small db-focus";
    focusBtn.innerHTML = `<span>REROLL</span><b>${ctx.t("Tập trung", "Focus")}</b><small>${ctx.t("đổi mặt + hồi 1 HP", "reroll + heal 1 HP")}</small>`;
    focusBtn.addEventListener("click", () => focusSelected());
    toolbar.appendChild(focusBtn);
    root.appendChild(toolbar);

    const legend = document.createElement("div");
    legend.className = "db-legend";
    legend.innerHTML = `
      <span><i class="db-leg-die p1"></i> ${ctx.t("Đội đỏ", "Red team")}</span>
      <span><i class="db-leg-die p2"></i> ${ctx.t("Đội xanh", "Blue team")}</span>
      <span><i class="db-leg-rock"></i> ${ctx.t("Đá chắn", "Rock")}</span>
      <span><i class="db-leg-power"></i> ${ctx.t("Ô năng lượng", "Power tile")}</span>
      <span><i class="db-leg-move"></i> ${ctx.t("Có thể đi", "Can move")}</span>
      <span><i class="db-leg-attack"></i> ${ctx.t("Có thể đánh", "Can attack")}</span>
    `;
    root.appendChild(legend);

    const board = document.createElement("div");
    board.className = "db-board";
    board.style.setProperty("--db-n", N);
    root.appendChild(board);
    ctx.boardEl.appendChild(root);

    const cells = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "db-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.dataset.coord = coord(r, c);
        cell.addEventListener("click", () => onCell(r, c));
        board.appendChild(cell);
        cells[r][c] = cell;
      }
    }

    function makeTerrain() {
      const grid = Array.from({ length: N }, () => Array(N).fill("empty"));
      const safe = (r, c) => r === 0 || r === N - 1 || (r <= 1 && c >= N - 3) || (r >= N - 2 && c <= 2);

      let placed = 0;
      let guard = 0;
      while (placed < BLOCKS && guard++ < 500) {
        const r = 1 + Math.floor(ctx.rng() * (N - 2));
        const c = Math.floor(ctx.rng() * N);
        const mr = N - 1 - r;
        const mc = N - 1 - c;
        if (safe(r, c) || safe(mr, mc) || grid[r][c] !== "empty" || grid[mr][mc] !== "empty") continue;
        grid[r][c] = "block";
        grid[mr][mc] = "block";
        placed += r === mr && c === mc ? 1 : 2;
      }

      const powerTargets = [
        [Math.floor(N / 2) - 1, Math.floor(N / 2) - 1],
        [Math.floor(N / 2), Math.floor(N / 2)],
        [Math.floor(N / 2) - 1, Math.floor(N / 2)],
        [Math.floor(N / 2), Math.floor(N / 2) - 1],
      ];
      powerTargets.forEach(([r, c]) => {
        if (inside(r, c) && grid[r][c] === "empty") grid[r][c] = "power";
      });
      return grid;
    }

    function makeUnits() {
      const cols = spawnCols(TEAM);
      const list = [];
      cols.forEach((c, i) => {
        list.push({ id: "p1_" + i, owner: 0, r: N - 1, c, face: rollDie(), hp: MAX_HP });
        list.push({ id: "p2_" + i, owner: 1, r: 0, c: N - 1 - c, face: rollDie(), hp: MAX_HP });
      });
      return list;
    }

    function spawnCols(count) {
      const cols = [];
      if (count === 1) return [Math.floor(N / 2)];
      const step = (N - 1) / (count - 1);
      for (let i = 0; i < count; i++) {
        let c = Math.round(i * step);
        while (cols.includes(c) && c < N - 1) c++;
        while (cols.includes(c) && c > 0) c--;
        cols.push(c);
      }
      return cols;
    }

    function rollDie() {
      return 1 + Math.floor(ctx.rng() * 6);
    }

    function canAct(fromRemote) {
      return !over && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function unitAt(r, c) {
      return units.find((u) => u.hp > 0 && u.r === r && u.c === c) || null;
    }

    function getUnit(id) {
      return units.find((u) => u.id === id && u.hp > 0) || null;
    }

    function selectedUnit() {
      return selectedId ? getUnit(selectedId) : null;
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function passable(r, c) {
      return inside(r, c) && terrain[r][c] !== "block" && !unitAt(r, c);
    }

    function onCell(r, c) {
      if (!canAct()) return;
      const clicked = unitAt(r, c);
      if (clicked && clicked.owner === turn) {
        selectedId = clicked.id;
        render();
        updateStatus();
        return;
      }

      const unit = selectedUnit();
      if (!unit || unit.owner !== turn) return;
      if (clicked && clicked.owner !== turn && adjacent(unit, clicked)) {
        applyMove({ t: "attack", id: unit.id, target: clicked.id, ar: rollDie(), dr: rollDie() }, false);
        return;
      }
      if (!clicked && legalMove(unit, r, c)) {
        applyMove({ t: "move", id: unit.id, r, c }, false);
      }
    }

    function focusSelected() {
      if (!canAct()) return;
      const unit = selectedUnit();
      if (!unit || unit.owner !== turn) return;
      applyMove({ t: "focus", id: unit.id, roll: rollDie() }, false);
    }

    function applyMove(move, fromRemote) {
      if (!canAct(fromRemote)) return;
      justRolled = new Set();
      lastCells = [];
      let ok = false;
      if (move.t === "move") ok = doMove(move);
      else if (move.t === "attack") ok = doAttack(move);
      else if (move.t === "focus") ok = doFocus(move);
      if (!ok) return;
      if (!fromRemote) ctx.sendMove(move);
      render();
      flushFloats();
      updateStatus();
    }

    function floatText(r, c, text, cls) { pendingFloat.push({ r, c, text, cls }); }
    function flushFloats() {
      if (!pendingFloat.length) return;
      pendingFloat.forEach(({ r, c, text, cls }) => {
        const cell = cells[r] && cells[r][c];
        if (!cell) return;
        const s = document.createElement("span");
        s.className = "db-float " + (cls || "");
        s.textContent = text;
        cell.appendChild(s);
        setTimeout(() => s.remove(), 850);
        if (cls === "dmg") {
          cell.classList.add("db-hit");
          setTimeout(() => cell.classList.remove("db-hit"), 320);
        }
      });
      pendingFloat = [];
    }

    // số quân của 'attacker' phe đứng kề defender (trừ chính attacker) -> hợp vây +1 công
    function flankBonus(attacker, defender) {
      let n = 0;
      units.forEach((u) => {
        if (u.hp > 0 && u.owner === attacker.owner && u.id !== attacker.id && adjacent(u, defender)) n++;
      });
      return n > 0 ? 1 : 0;
    }

    function doMove(move) {
      const unit = getUnit(move.id);
      if (!unit || unit.owner !== turn || !legalMove(unit, move.r, move.c)) return false;
      const old = coord(unit.r, unit.c);
      unit.r = move.r;
      unit.c = move.c;
      if (terrain[unit.r][unit.c] === "power") {
        unit.hp = Math.min(MAX_HP, unit.hp + 2);
        unit.face = Math.min(6, unit.face + 1);
        justRolled.add(unit.id);
        floatText(unit.r, unit.c, "+2", "heal");
        last = ctx.t(`${nameOf(unit)} đi từ ${old} đến ô năng lượng ${coord(unit.r, unit.c)}: +2 HP, tăng mặt xúc xắc.`, `${nameOf(unit)} moves from ${old} to power tile ${coord(unit.r, unit.c)}: +2 HP, die face up.`);
        ctx.sound("capture");
      } else {
        last = ctx.t(`${nameOf(unit)} đi từ ${old} đến ${coord(unit.r, unit.c)}.`, `${nameOf(unit)} moves from ${old} to ${coord(unit.r, unit.c)}.`);
        ctx.sound("select");
      }
      lastCells = [[unit.r, unit.c]];
      endTurn();
      return true;
    }

    function doAttack(move) {
      const a = getUnit(move.id);
      const d = getUnit(move.target);
      if (!a || !d || a.owner !== turn || d.owner === turn || !adjacent(a, d)) return false;
      const ar = clampDie(move.ar);
      const dr = clampDie(move.dr);
      const flank = flankBonus(a, d);
      const crit = ar === 6; // tung mặt 6 = chí mạng
      const atk = a.face + ar + flank;
      const def = d.face + dr;
      a.face = ar;
      d.face = dr;
      justRolled.add(a.id);
      justRolled.add(d.id);
      lastCells = [[a.r, a.c], [d.r, d.c]];
      const flankTxt = flank ? ctx.t(` +${flank} hợp vây`, ` +${flank} flank`) : "";

      if (atk >= def) {
        let dmg = Math.max(2, atk - def + 2);
        if (crit) dmg += 3; // chí mạng cộng thêm sát thương
        d.hp = Math.max(0, d.hp - dmg);
        a.hp = Math.min(MAX_HP, a.hp + 1);
        floatText(d.r, d.c, (crit ? ctx.t("CHÍ MẠNG ", "CRIT ") : "") + "-" + dmg, crit ? "dmg crit" : "dmg");
        last = ctx.t(`${nameOf(a)} roll ${ar} (${atk}${flankTxt})${crit ? " ⚡CHÍ MẠNG" : ""} thắng ${nameOf(d)} roll ${dr} (${def}), gây ${dmg} sát thương.`, `${nameOf(a)} rolls ${ar} (${atk}${flankTxt})${crit ? " ⚡CRIT" : ""} beats ${nameOf(d)} roll ${dr} (${def}), deals ${dmg} damage.`);
        if (d.hp <= 0) last += ctx.t(` ${nameOf(d)} bị loại!`, ` ${nameOf(d)} eliminated!`);
        ctx.sound(d.hp <= 0 ? "capture" : "shot");
      } else {
        const dmg = Math.max(1, def - atk);
        a.hp = Math.max(0, a.hp - dmg);
        floatText(a.r, a.c, "-" + dmg, "dmg");
        last = ctx.t(`${nameOf(a)} roll ${ar} (${atk}${flankTxt}) thua phòng thủ ${dr} (${def}), bị phản đòn ${dmg}.`, `${nameOf(a)} rolls ${ar} (${atk}${flankTxt}) loses to defense ${dr} (${def}), takes ${dmg} counter damage.`);
        if (a.hp <= 0) last += ctx.t(` ${nameOf(a)} bị loại!`, ` ${nameOf(a)} eliminated!`);
        ctx.sound(a.hp <= 0 ? "capture" : "miss");
      }

      checkEnd();
      if (!over) endTurn();
      return true;
    }

    function doFocus(move) {
      const unit = getUnit(move.id);
      if (!unit || unit.owner !== turn) return false;
      const r = clampDie(move.roll);
      unit.face = r;
      unit.hp = Math.min(MAX_HP, unit.hp + 1);
      justRolled.add(unit.id);
      lastCells = [[unit.r, unit.c]];
      floatText(unit.r, unit.c, "+1", "heal");
      last = ctx.t(`${nameOf(unit)} tập trung: đổi sang mặt ${r} và hồi 1 HP.`, `${nameOf(unit)} focuses: rerolls to face ${r} and heals 1 HP.`);
      ctx.sound("select");
      endTurn();
      return true;
    }

    function clampDie(v) {
      return Math.max(1, Math.min(6, Number(v) || 1));
    }

    function legalMove(unit, r, c) {
      const range = moveRange(unit);
      if (!passable(r, c)) return false;
      return reachable(unit, range).has(r + "," + c);
    }

    function moveRange(unit) {
      return unit.face >= 5 ? 2 : 1;
    }

    function reachable(unit, range) {
      const q = [{ r: unit.r, c: unit.c, d: 0 }];
      const seen = new Set([unit.r + "," + unit.c]);
      const out = new Set();
      while (q.length) {
        const cur = q.shift();
        if (cur.d >= range) continue;
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

    function adjacent(a, b) {
      return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
    }

    function checkEnd() {
      const alive0 = units.some((u) => u.owner === 0 && u.hp > 0);
      const alive1 = units.some((u) => u.owner === 1 && u.hp > 0);
      if (alive0 && alive1) return;
      over = true;
      selectedId = null;
      ctx.setTurn(-1);
      if (!alive0 && !alive1) {
        ctx.setStatus(ctx.t("🤝 Hai đội xúc xắc cùng bị loại - hòa!", "🤝 Both dice teams eliminated — draw!"));
      } else {
        const winner = alive0 ? 0 : 1;
        ctx.incScore(winner);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng Dice Battle!`, `🎉 Player ${winner + 1} wins Dice Battle!`));
      }
    }

    function endTurn() {
      selectedId = null;
      turn = 1 - turn;
      ctx.setTurn(turn);
    }

    function render() {
      const sel = selectedUnit();
      const moves = sel && sel.owner === turn ? reachable(sel, moveRange(sel)) : new Set();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = cells[r][c];
          const unit = unitAt(r, c);
          cell.className = "db-cell";
          cell.innerHTML = "";
          cell.dataset.coord = coord(r, c);
          if (terrain[r][c] === "block") {
            cell.classList.add("block");
            cell.innerHTML = `<span class="db-rock" aria-hidden="true"></span>`;
          } else if (terrain[r][c] === "power") {
            cell.classList.add("power");
            cell.innerHTML = `<span class="db-power" aria-hidden="true">✦</span>`;
          }
          if (unit) {
            cell.classList.add("unit", unit.owner === 0 ? "p1" : "p2");
            if (unit.id === selectedId) cell.classList.add("selected");
            if (lastCells.some(([lr, lc]) => lr === r && lc === c)) cell.classList.add("last-acted");
            cell.innerHTML = diceMarkup(unit, justRolled.has(unit.id));
          } else if (moves.has(r + "," + c)) {
            cell.classList.add("can-move");
          }
          if (sel) {
            const target = unitAt(r, c);
            if (target && target.owner !== turn && adjacent(sel, target)) cell.classList.add("can-attack");
          }
        }
      }

      hud.innerHTML = `
        ${playerPanel(0)}
        <div class="db-turn">
          <b>${over ? ctx.t("Kết thúc", "Game over") : ctx.t(`Lượt Người chơi ${turn + 1}`, `Player ${turn + 1}'s turn`)}</b>
          <span>${sel ? ctx.t(`${nameOf(sel)} • mặt ${sel.face} • đi ${moveRange(sel)} ô`, `${nameOf(sel)} • face ${sel.face} • move ${moveRange(sel)} cells`) : ctx.t("Chọn quân để hành động", "Select a unit to act")}</span>
          <small>${last}</small>
        </div>
        ${playerPanel(1)}
      `;
      focusBtn.disabled = !canAct() || !sel || sel.owner !== turn;
    }

    function playerPanel(owner) {
      const alive = units.filter((u) => u.owner === owner && u.hp > 0);
      const totalHp = alive.reduce((s, u) => s + u.hp, 0);
      const maxTotal = TEAM * MAX_HP;
      const dice = alive.map((u) => `<span class="db-mini-face">${u.face}</span>`).join("");
      return `
        <div class="db-player p${owner + 1} ${turn === owner && !over ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${owner + 1}`, `Player ${owner + 1}`)}</span>
          <b>${alive.length}/${TEAM} ${ctx.t("quân", "units")}</b>
          <em>${dice || ctx.t("hết quân", "no units")}</em>
          <i style="width:${Math.max(0, totalHp / maxTotal * 100)}%"></i>
        </div>
      `;
    }

    function diceMarkup(unit, rolling) {
      const pips = PIP_POS[unit.face].map((p) => `<i class="db-pip ${p}"></i>`).join("");
      return `
        <span class="db-die face-${unit.face}${rolling ? " rolling" : ""}" aria-hidden="true">
          ${pips}
          <b>${unit.owner + 1}</b>
        </span>
        <span class="db-hp"><i style="width:${Math.max(0, unit.hp / MAX_HP * 100)}%"></i></span>
      `;
    }

    function nameOf(unit) {
      return ctx.t(`Xúc xắc ${unit.owner + 1}-${unit.id.split("_")[1]}`, `Die ${unit.owner + 1}-${unit.id.split("_")[1]}`);
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi. ${last}`, `Opponent's turn. ${last}`));
      } else {
        ctx.setStatus(ctx.t("Click quân của bạn, rồi chọn ô xanh để đi hoặc ô đỏ cạnh bên để đánh. Tập trung để reroll.", "Click your unit, then a green cell to move or an adjacent red cell to attack. Focus to reroll."));
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
    id: "dicebattle",
    name: "Dice Battle",
    emoji: "🎲",
    description: "Điều khiển đội quân xúc xắc trên lưới. Di chuyển, chiếm ô năng lượng và đánh nhau bằng roll — tung mặt 6 để gây chí mạng.",
    onlineReady: true,
    options: [
      {
        id: "size",
        label: "Kích thước bàn",
        default: 8,
        choices: [
          { value: 7, label: "7×7 (nhanh)" },
          { value: 8, label: "8×8 (chuẩn)" },
          { value: 9, label: "9×9 (rộng)" },
        ],
      },
      {
        id: "team",
        label: "Số xúc xắc mỗi đội",
        default: 5,
        choices: [
          { value: 4, label: "4 quân" },
          { value: 5, label: "5 quân" },
          { value: 6, label: "6 quân" },
        ],
      },
      {
        id: "hp",
        label: "Máu mỗi quân",
        default: 10,
        choices: [
          { value: 8, label: "8 HP" },
          { value: 10, label: "10 HP" },
          { value: 12, label: "12 HP" },
        ],
      },
      {
        id: "blocks",
        label: "Đá chắn",
        default: "normal",
        choices: [
          { value: "few", label: "Ít" },
          { value: "normal", label: "Vừa" },
          { value: "many", label: "Nhiều" },
        ],
      },
    ],
    howTo: [
      "Mỗi người có một đội quân xúc xắc. Mục tiêu là loại hết xúc xắc của đối thủ.",
      "Click một xúc xắc của bạn để chọn. Ô xanh là nơi có thể di chuyển, ô đỏ là quân địch có thể tấn công.",
      "Xúc xắc mặt 1-4 đi được 1 ô, mặt 5-6 đi được 2 ô.",
      "Khi tấn công, hai bên roll d6. Tổng tấn công = mặt hiện tại + roll. Tổng cao hơn sẽ gây sát thương.",
      "⚡ CHÍ MẠNG: nếu bên tấn công tung được mặt 6, đòn đánh cộng thêm 3 sát thương khi thắng.",
      "Sau giao tranh, mặt xúc xắc đổi thành kết quả roll vừa tung.",
      "Ô năng lượng ở giữa bàn giúp hồi 2 HP và tăng mặt xúc xắc thêm 1 khi đi vào.",
      "Nút Tập trung dùng cả lượt để reroll xúc xắc đã chọn và hồi 1 HP.",
    ],
    create,
  });
})();
