/* Crystal Conquest - pháp sư chiếm tinh thể, tạo mana và cast kỹ năng. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const MAX_HP = 18;
  const MAX_MANA = 18;
  const SPELL = {
    lightning: { cost: 4, range: 4, dmg: 4 },
    shield: { cost: 3, value: 4 },
    teleport: { cost: 5 },
    freeze: { cost: 4, range: 4 },
    heal: { cost: 4, value: 5 },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 9;
    const GOAL = o.goal || 4;
    const YIELD = o.yield || 2;
    const ROCKS = o.rocks === "many" ? Math.round(N * 0.95)
      : o.rocks === "few" ? Math.round(N * 0.35)
      : Math.round(N * 0.62);

    const grid = makeMap();
    const wizards = [
      { r: N - 1, c: 0, hp: MAX_HP, mana: 5, shield: 0, frozen: false },
      { r: 0, c: N - 1, hp: MAX_HP, mana: 5, shield: 0, frozen: false },
    ];
    let turn = 0;
    let mode = "move";
    let over = false;
    let lastCell = null;
    let pendingFloat = [];
    let last = ctx.t("Chiếm tinh thể để tạo mana, rồi dùng phép kết liễu pháp sư đối thủ.", "Capture crystals to gain mana, then use spells to finish off the enemy wizard.");

    const root = document.createElement("div");
    root.className = "cc-root";

    const hud = document.createElement("div");
    hud.className = "cc-hud";
    root.appendChild(hud);

    const actions = document.createElement("div");
    actions.className = "cc-actions";
    const moveBtn = actionButton(ctx.t("Di chuyển", "Move"), "move", "MOVE", ctx.t("tối đa 2 ô", "up to 2 cells"), false);
    const lightningBtn = actionButton(ctx.t("Sét", "Lightning"), "lightning", "BOLT", ctx.t("4 mana", "4 mana"), false);
    const shieldBtn = actionButton(ctx.t("Khiên", "Shield"), "shield", "WARD", ctx.t("3 mana", "3 mana"), true);
    const teleportBtn = actionButton(ctx.t("Dịch chuyển", "Teleport"), "teleport", "BLINK", ctx.t("5 mana", "5 mana"), false);
    const freezeBtn = actionButton(ctx.t("Đóng băng", "Freeze"), "freeze", "FROST", ctx.t("4 mana", "4 mana"), false);
    const healBtn = actionButton(ctx.t("Hồi máu", "Heal"), "heal", "HEAL", ctx.t("4 mana • +5 HP", "4 mana • +5 HP"), true);
    const channelBtn = actionButton(ctx.t("Tụ mana", "Channel"), "channel", "FOCUS", ctx.t("+3 mana", "+3 mana"), true);
    [moveBtn, lightningBtn, shieldBtn, teleportBtn, freezeBtn, healBtn, channelBtn].forEach((b) => actions.appendChild(b));
    root.appendChild(actions);

    const legend = document.createElement("div");
    legend.className = "cc-legend";
    legend.innerHTML = `
      <span><i class="cc-leg mage p1"></i> ${ctx.t("Pháp sư đỏ", "Red wizard")}</span>
      <span><i class="cc-leg mage p2"></i> ${ctx.t("Pháp sư xanh", "Blue wizard")}</span>
      <span><i class="cc-leg crystal"></i> ${ctx.t("Tinh thể", "Crystal")}</span>
      <span><i class="cc-leg rock"></i> ${ctx.t("Đá ma thuật", "Magic rock")}</span>
      <span><i class="cc-leg move"></i> ${ctx.t("Có thể đi", "Can move")}</span>
      <span><i class="cc-leg target"></i> ${ctx.t("Mục tiêu phép", "Spell target")}</span>
    `;
    root.appendChild(legend);

    const board = document.createElement("div");
    board.className = "cc-board";
    board.style.setProperty("--cc-n", N);
    root.appendChild(board);
    ctx.boardEl.appendChild(root);

    const cells = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cc-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.dataset.coord = coord(r, c);
        cell.addEventListener("click", () => onCell(r, c));
        board.appendChild(cell);
        cells[r][c] = cell;
      }
    }

    function actionButton(label, id, icon, sub, instant) {
      const btn = document.createElement("button");
      btn.className = "btn small cc-action";
      btn.innerHTML = `<span>${icon}</span><b>${label}</b><small>${sub}</small>`;
      btn.addEventListener("click", () => {
        if (instant) applyMove({ t: id }, false);
        else {
          mode = id;
          render();
          updateStatus();
        }
      });
      return btn;
    }

    function makeMap() {
      const map = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ type: "empty", owner: -1 })));
      const mid = Math.floor(N / 2);
      const crystalSpots = [
        [mid, mid],
        [2, mid],
        [N - 3, mid],
        [mid, 2],
        [mid, N - 3],
      ];
      crystalSpots.forEach(([r, c]) => {
        if (inside(r, c)) map[r][c] = { type: "crystal", owner: -1 };
      });

      function safe(r, c) {
        if (!inside(r, c)) return true;
        if ((r === N - 1 && c === 0) || (r === 0 && c === N - 1)) return true;
        if (Math.abs(r - (N - 1)) + Math.abs(c) <= 2) return true;
        if (Math.abs(r) + Math.abs(c - (N - 1)) <= 2) return true;
        return map[r][c].type === "crystal";
      }

      let placed = 0;
      let guard = 0;
      while (placed < ROCKS && guard++ < 1000) {
        const r = 1 + Math.floor(ctx.rng() * (N - 2));
        const c = 1 + Math.floor(ctx.rng() * (N - 2));
        const mr = N - 1 - r;
        const mc = N - 1 - c;
        if (safe(r, c) || safe(mr, mc)) continue;
        if (map[r][c].type !== "empty" || map[mr][mc].type !== "empty") continue;
        map[r][c].type = "rock";
        map[mr][mc].type = "rock";
        placed += r === mr && c === mc ? 1 : 2;
      }
      return map;
    }

    function onCell(r, c) {
      if (!canAct()) return;
      const enemy = wizardAt(r, c);
      if (mode === "move" && legalMove(r, c)) {
        applyMove({ t: "move", r, c }, false);
      } else if (mode === "teleport" && legalTeleport(r, c)) {
        applyMove({ t: "teleport", r, c }, false);
      } else if (mode === "lightning" && enemy === 1 - turn && legalSpellTarget(r, c, SPELL.lightning.range)) {
        applyMove({ t: "lightning", r, c }, false);
      } else if (mode === "freeze" && enemy === 1 - turn && legalSpellTarget(r, c, SPELL.freeze.range)) {
        applyMove({ t: "freeze", r, c }, false);
      }
    }

    function canAct(fromRemote) {
      return !over && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function applyMove(move, fromRemote) {
      if (!canAct(fromRemote)) return;
      lastCell = null;
      let ok = false;
      if (move.t === "move") ok = doMove(move);
      else if (move.t === "teleport") ok = doTeleport(move);
      else if (move.t === "lightning") ok = doLightning(move);
      else if (move.t === "shield") ok = doShield();
      else if (move.t === "freeze") ok = doFreeze(move);
      else if (move.t === "heal") ok = doHeal();
      else if (move.t === "channel") ok = doChannel();
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
        s.className = "cc-float " + (cls || "");
        s.textContent = text;
        cell.appendChild(s);
        setTimeout(() => s.remove(), 950);
        cell.classList.add("cc-flash", "cc-flash-" + (cls || "x"));
        setTimeout(() => cell.classList.remove("cc-flash", "cc-flash-" + (cls || "x")), 360);
      });
      pendingFloat = [];
    }

    function doHeal() {
      const wiz = wizards[turn];
      if (wiz.mana < SPELL.heal.cost || wiz.hp >= MAX_HP) return false;
      wiz.mana -= SPELL.heal.cost;
      const before = wiz.hp;
      wiz.hp = Math.min(MAX_HP, wiz.hp + SPELL.heal.value);
      lastCell = [wiz.r, wiz.c];
      floatText(wiz.r, wiz.c, "+" + (wiz.hp - before) + "❤", "heal");
      last = ctx.t(`Pháp sư ${turn + 1} hồi máu: ${before} → ${wiz.hp} HP.`, `Wizard ${turn + 1} heals: ${before} → ${wiz.hp} HP.`);
      ctx.sound("capture");
      if (!checkEnd()) endTurn();
      return true;
    }

    function doMove(move) {
      const wiz = wizards[turn];
      if (wiz.frozen || !legalMove(move.r, move.c)) return false;
      const from = coord(wiz.r, wiz.c);
      wiz.r = move.r;
      wiz.c = move.c;
      const captured = captureCrystal(turn, wiz.r, wiz.c);
      lastCell = [wiz.r, wiz.c];
      last = captured
        ? ctx.t(`Pháp sư ${turn + 1} đi từ ${from} tới ${coord(wiz.r, wiz.c)} và chiếm tinh thể.`, `Wizard ${turn + 1} moves from ${from} to ${coord(wiz.r, wiz.c)} and captures a crystal.`)
        : ctx.t(`Pháp sư ${turn + 1} di chuyển từ ${from} tới ${coord(wiz.r, wiz.c)}.`, `Wizard ${turn + 1} moves from ${from} to ${coord(wiz.r, wiz.c)}.`);
      ctx.sound(captured ? "capture" : "select");
      if (!checkEnd()) endTurn();
      return true;
    }

    function doTeleport(move) {
      const wiz = wizards[turn];
      if (wiz.frozen || wiz.mana < SPELL.teleport.cost || !legalTeleport(move.r, move.c)) return false;
      const from = coord(wiz.r, wiz.c);
      wiz.mana -= SPELL.teleport.cost;
      wiz.r = move.r;
      wiz.c = move.c;
      const captured = captureCrystal(turn, wiz.r, wiz.c);
      lastCell = [wiz.r, wiz.c];
      floatText(wiz.r, wiz.c, "✦ blink", "mana");
      last = captured
        ? ctx.t(`Pháp sư ${turn + 1} dịch chuyển từ ${from} tới ${coord(wiz.r, wiz.c)} và đoạt tinh thể.`, `Wizard ${turn + 1} teleports from ${from} to ${coord(wiz.r, wiz.c)} and seizes a crystal.`)
        : ctx.t(`Pháp sư ${turn + 1} dịch chuyển từ ${from} tới ${coord(wiz.r, wiz.c)}.`, `Wizard ${turn + 1} teleports from ${from} to ${coord(wiz.r, wiz.c)}.`);
      ctx.sound("capture");
      if (!checkEnd()) endTurn();
      return true;
    }

    function doLightning(move) {
      const wiz = wizards[turn];
      const enemy = wizardAt(move.r, move.c);
      if (wiz.mana < SPELL.lightning.cost || enemy !== 1 - turn || !legalSpellTarget(move.r, move.c, SPELL.lightning.range)) return false;
      wiz.mana -= SPELL.lightning.cost;
      const res = damageWizard(enemy, SPELL.lightning.dmg);
      lastCell = [move.r, move.c];
      floatText(move.r, move.c, "⚡-" + res.dealt + (res.blocked ? " 🛡" + res.blocked : ""), "bolt");
      last = ctx.t(`Sét đánh trúng pháp sư ${enemy + 1}: chặn ${res.blocked}, nhận ${res.dealt} sát thương.`, `Lightning strikes wizard ${enemy + 1}: blocked ${res.blocked}, took ${res.dealt} damage.`);
      ctx.sound("shot");
      if (!checkEnd()) endTurn();
      return true;
    }

    function doShield() {
      const wiz = wizards[turn];
      if (wiz.mana < SPELL.shield.cost) return false;
      wiz.mana -= SPELL.shield.cost;
      wiz.shield = Math.min(8, wiz.shield + SPELL.shield.value);
      lastCell = [wiz.r, wiz.c];
      floatText(wiz.r, wiz.c, "🛡+" + SPELL.shield.value, "shield");
      last = ctx.t(`Pháp sư ${turn + 1} dựng khiên năng lượng, khiên hiện tại ${wiz.shield}.`, `Wizard ${turn + 1} raises an energy shield, current shield ${wiz.shield}.`);
      ctx.sound("select");
      if (!checkEnd()) endTurn();
      return true;
    }

    function doFreeze(move) {
      const wiz = wizards[turn];
      const enemy = wizardAt(move.r, move.c);
      if (wiz.mana < SPELL.freeze.cost || enemy !== 1 - turn || !legalSpellTarget(move.r, move.c, SPELL.freeze.range)) return false;
      wiz.mana -= SPELL.freeze.cost;
      const target = wizards[enemy];
      lastCell = [move.r, move.c];
      if (target.shield >= 2) {
        target.shield -= 2;
        floatText(move.r, move.c, "❄ bị chặn", "freeze");
        last = ctx.t(`Băng thuật bị khiên của pháp sư ${enemy + 1} chặn lại.`, `The freeze was blocked by wizard ${enemy + 1}'s shield.`);
        ctx.sound("miss");
      } else {
        target.frozen = true;
        floatText(move.r, move.c, "❄ ĐÓNG BĂNG", "freeze");
        last = ctx.t(`Pháp sư ${enemy + 1} bị đóng băng, lượt tới không thể di chuyển hoặc dịch chuyển.`, `Wizard ${enemy + 1} is frozen and cannot move or teleport next turn.`);
        ctx.sound("shot");
      }
      if (!checkEnd()) endTurn();
      return true;
    }

    function doChannel() {
      const wiz = wizards[turn];
      const before = wiz.mana;
      wiz.mana = Math.min(MAX_MANA, wiz.mana + 3);
      lastCell = [wiz.r, wiz.c];
      floatText(wiz.r, wiz.c, "+" + (wiz.mana - before) + "✦", "mana");
      last = ctx.t(`Pháp sư ${turn + 1} tụ mana: ${before} → ${wiz.mana}.`, `Wizard ${turn + 1} channels mana: ${before} → ${wiz.mana}.`);
      ctx.sound("select");
      if (!checkEnd()) endTurn();
      return true;
    }

    function damageWizard(idx, amount) {
      const target = wizards[idx];
      const blocked = Math.min(target.shield, amount);
      target.shield -= blocked;
      const dealt = amount - blocked;
      target.hp = Math.max(0, target.hp - dealt);
      return { blocked, dealt };
    }

    function captureCrystal(owner, r, c) {
      const cell = grid[r][c];
      if (cell.type !== "crystal" || cell.owner === owner) return false;
      cell.owner = owner;
      return true;
    }

    function endTurn() {
      wizards[turn].frozen = false;
      turn = 1 - turn;
      mode = "move";
      gainIncome(turn);
      ctx.setTurn(turn);
    }

    function gainIncome(owner) {
      const wiz = wizards[owner];
      const crystals = crystalCount(owner);
      wiz.mana = Math.min(MAX_MANA, wiz.mana + 1 + crystals * YIELD);
    }

    function checkEnd() {
      if (wizards[0].hp <= 0 || wizards[1].hp <= 0) {
        const winner = wizards[0].hp <= 0 ? 1 : 0;
        finish(winner, ctx.t("hạ gục pháp sư đối thủ", "defeated the enemy wizard"));
        return true;
      }
      if (crystalCount(turn) >= GOAL) {
        finish(turn, ctx.t(`kiểm soát ${GOAL} tinh thể`, `controlled ${GOAL} crystals`));
        return true;
      }
      return false;
    }

    function finish(winner, reason) {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng - ${reason}!`, `🎉 Player ${winner + 1} wins — ${reason}!`));
    }

    function legalMove(r, c) {
      const wiz = wizards[turn];
      if (wiz.frozen || !passable(r, c)) return false;
      return reachable(wiz.r, wiz.c, 2).has(r + "," + c);
    }

    function legalTeleport(r, c) {
      const wiz = wizards[turn];
      if (wiz.frozen || wiz.mana < SPELL.teleport.cost || !passable(r, c)) return false;
      return teleportCells(turn).has(r + "," + c);
    }

    function legalSpellTarget(r, c, range) {
      const wiz = wizards[turn];
      return Math.abs(wiz.r - r) + Math.abs(wiz.c - c) <= range;
    }

    function teleportCells(owner) {
      const set = new Set();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (grid[r][c].type !== "crystal" || grid[r][c].owner !== owner) continue;
          [[0, 0], ...DIRS].forEach(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (passable(nr, nc)) set.add(nr + "," + nc);
          });
        }
      }
      return set;
    }

    function reachable(sr, sc, range) {
      const q = [{ r: sr, c: sc, d: 0 }];
      const seen = new Set([sr + "," + sc]);
      const out = new Set();
      while (q.length) {
        const cur = q.shift();
        if (cur.d >= range) continue;
        for (const [dr, dc] of DIRS) {
          const r = cur.r + dr, c = cur.c + dc;
          const key = r + "," + c;
          if (!passable(r, c) || seen.has(key)) continue;
          seen.add(key);
          out.add(key);
          q.push({ r, c, d: cur.d + 1 });
        }
      }
      return out;
    }

    function passable(r, c) {
      return inside(r, c) && grid[r][c].type !== "rock" && wizardAt(r, c) === -1;
    }

    function wizardAt(r, c) {
      return wizards.findIndex((w) => w.hp > 0 && w.r === r && w.c === c);
    }

    function crystalCount(owner) {
      let count = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (grid[r][c].type === "crystal" && grid[r][c].owner === owner) count++;
      return count;
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function render() {
      const legal = new Set();
      const target = new Set();
      if (canAct()) {
        if (mode === "move") {
          if (!wizards[turn].frozen) reachable(wizards[turn].r, wizards[turn].c, 2).forEach((k) => legal.add(k));
        } else if (mode === "teleport") {
          teleportCells(turn).forEach((k) => legal.add(k));
        } else if (mode === "lightning" || mode === "freeze") {
          const enemy = wizards[1 - turn];
          if (legalSpellTarget(enemy.r, enemy.c, mode === "lightning" ? SPELL.lightning.range : SPELL.freeze.range)) {
            target.add(enemy.r + "," + enemy.c);
          }
        }
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = grid[r][c];
          const el = cells[r][c];
          const wiz = wizardAt(r, c);
          el.className = "cc-cell";
          el.innerHTML = "";
          el.dataset.coord = coord(r, c);
          if (r === N - 1 && c === 0) el.classList.add("base", "base-p1");
          if (r === 0 && c === N - 1) el.classList.add("base", "base-p2");
          if (cell.type === "rock") {
            el.classList.add("rock");
            el.innerHTML += `<span class="cc-rock" aria-hidden="true"></span>`;
          } else if (cell.type === "crystal") {
            el.classList.add("crystal", cell.owner === -1 ? "neutral" : cell.owner === 0 ? "p1" : "p2");
            el.innerHTML += `<span class="cc-crystal" aria-hidden="true">✦</span>`;
          }
          if (wiz !== -1) {
            el.classList.add("wizard", wiz === 0 ? "p1" : "p2");
            if (wiz === turn && !over) el.classList.add("active-wizard");
            el.innerHTML += wizardMarkup(wiz);
          }
          if (legal.has(r + "," + c)) el.classList.add(mode === "teleport" ? "legal-teleport" : "legal-move");
          if (target.has(r + "," + c)) el.classList.add(mode === "freeze" ? "legal-freeze" : "legal-lightning");
          if (lastCell && lastCell[0] === r && lastCell[1] === c) el.classList.add("cc-last");
        }
      }

      hud.innerHTML = `
        ${playerPanel(0)}
        <div class="cc-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : ctx.t(`Lượt Người chơi ${turn + 1}`, `Player ${turn + 1}'s turn`)}</b>
          <span>${modeLabel()}</span>
          <small>${last}</small>
        </div>
        ${playerPanel(1)}
      `;
      updateButtons();
    }

    function wizardMarkup(idx) {
      const w = wizards[idx];
      return `
        <span class="cc-mage" aria-hidden="true">
          <span class="cc-aura"></span>
          <span class="cc-robe"></span>
          <span class="cc-hood"></span>
          <span class="cc-staff"></span>
          <span class="cc-orb"></span>
          <span class="cc-tag">${idx + 1}</span>
        </span>
        <span class="cc-hp"><i style="width:${Math.max(0, w.hp / MAX_HP * 100)}%"></i></span>
      `;
    }

    function playerPanel(idx) {
      const w = wizards[idx];
      const manaPct = Math.max(0, w.mana / MAX_MANA * 100);
      const hpPct = Math.max(0, w.hp / MAX_HP * 100);
      const status = [
        crystalCount(idx) + ctx.t(" tinh thể", " crystals"),
        ctx.t("mana ", "mana ") + w.mana,
        w.shield ? ctx.t("khiên ", "shield ") + w.shield : ctx.t("không khiên", "no shield"),
        w.frozen ? ctx.t("đóng băng", "frozen") : ctx.t("tự do", "free"),
      ].join(" • ");
      return `
        <div class="cc-player p${idx + 1} ${turn === idx && !over ? "active" : ""}">
          <span>${ctx.t(`Pháp sư ${idx + 1}`, `Wizard ${idx + 1}`)}</span>
          <b>${w.hp}/${MAX_HP} HP</b>
          <em>${status}</em>
          <i class="hp" style="width:${hpPct}%"></i>
          <i class="mana" style="width:${manaPct}%"></i>
        </div>
      `;
    }

    function modeLabel() {
      if (mode === "move") return wizards[turn].frozen ? ctx.t("Đang đóng băng - không thể di chuyển.", "Frozen — cannot move.") : ctx.t("Di chuyển tối đa 2 ô để chiếm tinh thể.", "Move up to 2 cells to capture crystals.");
      if (mode === "lightning") return ctx.t("Sét: gây 4 sát thương trong tầm 4 ô.", "Lightning: deals 4 damage within 4 cells.");
      if (mode === "teleport") return wizards[turn].frozen ? ctx.t("Đang đóng băng - không thể dịch chuyển.", "Frozen — cannot teleport.") : ctx.t("Dịch chuyển tới vùng gần tinh thể bạn kiểm soát.", "Teleport near a crystal you control.");
      if (mode === "freeze") return ctx.t("Đóng băng: khóa di chuyển/dịch chuyển của đối thủ lượt tới.", "Freeze: lock the opponent's move/teleport next turn.");
      return ctx.t("Chọn phép hoặc di chuyển.", "Choose a spell or move.");
    }

    function updateButtons() {
      const w = wizards[turn];
      const lock = !canAct();
      moveBtn.classList.toggle("active", mode === "move");
      lightningBtn.classList.toggle("active", mode === "lightning");
      teleportBtn.classList.toggle("active", mode === "teleport");
      freezeBtn.classList.toggle("active", mode === "freeze");
      moveBtn.disabled = lock || w.frozen;
      lightningBtn.disabled = lock || w.mana < SPELL.lightning.cost;
      shieldBtn.disabled = lock || w.mana < SPELL.shield.cost;
      teleportBtn.disabled = lock || w.frozen || w.mana < SPELL.teleport.cost || teleportCells(turn).size === 0;
      freezeBtn.disabled = lock || w.mana < SPELL.freeze.cost;
      healBtn.disabled = lock || w.mana < SPELL.heal.cost || w.hp >= MAX_HP;
      channelBtn.disabled = lock || w.mana >= MAX_MANA;
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi. ${last}`, `Opponent's turn. ${last}`));
      } else {
        ctx.setStatus(ctx.t(`${modeLabel()} Thắng bằng cách hạ pháp sư địch hoặc kiểm soát ${GOAL} tinh thể.`, `${modeLabel()} Win by defeating the enemy wizard or controlling ${GOAL} crystals.`));
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
    id: "crystalconquest",
    name: "Crystal Conquest",
    emoji: "💎",
    description: "Điều khiển pháp sư chiếm tinh thể để tạo mana, rồi cast sét, khiên, dịch chuyển, đóng băng và hồi máu.",
    onlineReady: true,
    options: [
      {
        id: "size",
        label: "Kích thước bản đồ",
        default: 9,
        choices: [
          { value: 9, label: "9×9 (nhanh)" },
          { value: 11, label: "11×11 (rộng)" },
        ],
      },
      {
        id: "goal",
        label: "Tinh thể để thắng",
        default: 4,
        choices: [
          { value: 3, label: "3 tinh thể" },
          { value: 4, label: "4 tinh thể" },
          { value: 5, label: "5 tinh thể" },
        ],
      },
      {
        id: "yield",
        label: "Mana mỗi tinh thể",
        default: 2,
        choices: [
          { value: 1, label: "1 mana" },
          { value: 2, label: "2 mana" },
          { value: 3, label: "3 mana" },
        ],
      },
      {
        id: "rocks",
        label: "Đá ma thuật",
        default: "normal",
        choices: [
          { value: "few", label: "Ít" },
          { value: "normal", label: "Vừa" },
          { value: "many", label: "Nhiều" },
        ],
      },
    ],
    howTo: [
      "Mỗi người điều khiển một pháp sư. Mục tiêu là hạ pháp sư đối thủ hoặc kiểm soát đủ số tinh thể.",
      "Di chuyển tối đa 2 ô mỗi lượt. Đứng lên tinh thể sẽ chiếm tinh thể đó.",
      "Khi tới lượt, bạn nhận 1 mana cơ bản cộng thêm mana từ các tinh thể đang kiểm soát.",
      "Sét tốn 4 mana, gây sát thương trong tầm 4 ô. Khiên tốn 3 mana và chặn sát thương.",
      "Dịch chuyển tốn 5 mana, đưa pháp sư tới vùng gần tinh thể bạn kiểm soát.",
      "Đóng băng tốn 4 mana, khiến đối thủ không thể di chuyển hoặc dịch chuyển trong lượt kế.",
      "Hồi máu tốn 4 mana, phục hồi 5 HP (không quá máu tối đa) — dùng để trụ lâu trong giao tranh.",
      "Tụ mana dùng cả lượt để nhận thêm 3 mana khi cần hồi tài nguyên.",
    ],
    create,
  });
})();
