/* Time Loop Duel - lap trinh hanh dong, replay dong thoi, bong ma qua khu lap lai. */
(function () {
  const W = 900;
  const H = 520;
  const BOUNDS = { left: 54, right: 846, top: 70, bottom: 458 };
  const CORE_R = 29;
  const ACTOR_R = 15;
  const TICKS_PER_BEAT = 32;
  const MAX_ENERGY = 10;

  const ACTIONS = {
    wait: { label: "Đợi", icon: "··", cost: 0, hint: "giữ vị trí" },
    up: { label: "Lên", icon: "↑", cost: 0, hint: "di chuyển" },
    down: { label: "Xuống", icon: "↓", cost: 0, hint: "di chuyển" },
    left: { label: "Trái", icon: "←", cost: 0, hint: "di chuyển" },
    right: { label: "Phải", icon: "→", cost: 0, hint: "di chuyển" },
    dash: { label: "Lướt", icon: "DASH", cost: 1, hint: "nhanh theo hướng nhìn" },
    shoot: { label: "Bắn", icon: "SHOT", cost: 1, hint: "đạn thẳng" },
    shield: { label: "Khiên", icon: "SHD", cost: 1, hint: "giảm sát thương" },
    mine: { label: "Mìn", icon: "MINE", cost: 2, hint: "nổ vùng" },
    charge: { label: "Nạp", icon: "+E", cost: -1, hint: "lấy thêm năng lượng" },
  };

  const MOVE = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  function create(ctx) {
    const o = ctx.options || {};
    const BEATS = o.beats || 6;
    const CORE_HP = o.core || 90;
    const MAX_GHOSTS = o.ghosts || 5;
    const obstacleMode = o.obstacles || "normal";

    let round = 1;
    let activePlanner = 0;
    let over = false;
    let sim = null;
    let raf = null;
    const coreHp = [CORE_HP, CORE_HP];
    const energy = [3, 3];
    const plans = [[], []];
    const locked = [false, false];
    const history = [[], []];
    const cores = [
      { x: 91, y: H / 2, owner: 0 },
      { x: W - 91, y: H / 2, owner: 1 },
    ];
    const spawns = [
      { x: 152, y: H / 2, fx: 1, fy: 0 },
      { x: W - 152, y: H / 2, fx: -1, fy: 0 },
    ];
    const obstacles = makeObstacles();
    let last = ctx.t("Chọn vài hành động (xem đường đi xem trước), khóa kế hoạch — nhịp trống sẽ tự thành Đợi.", "Pick a few actions (preview your path), lock the plan — empty beats become Wait.");
    // bản dịch nhãn/gợi ý hành động (ACTIONS là hằng module-level)
    const ACTION_LABEL_EN = { wait: "Wait", up: "Up", down: "Down", left: "Left", right: "Right", dash: "Dash", shoot: "Shoot", shield: "Shield", mine: "Mine", charge: "Charge" };
    const ACTION_HINT_EN = { wait: "hold position", up: "move", down: "move", left: "move", right: "move", dash: "fast in facing dir", shoot: "straight shot", shield: "reduce damage", mine: "area blast", charge: "gain more energy" };
    const aLabel = (id) => ctx.t(ACTIONS[id].label, ACTION_LABEL_EN[id] || ACTIONS[id].label);
    const aHint = (id) => ctx.t(ACTIONS[id].hint, ACTION_HINT_EN[id] || ACTIONS[id].hint);

    const root = document.createElement("div");
    root.className = "tl-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "tl-hud";
    root.appendChild(hud);

    const stageWrap = document.createElement("div");
    stageWrap.className = "tl-stage-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "tl-canvas";
    stageWrap.appendChild(canvas);
    root.appendChild(stageWrap);
    const g = canvas.getContext("2d");

    const planner = document.createElement("div");
    planner.className = "tl-planner";
    root.appendChild(planner);

    const palette = document.createElement("div");
    palette.className = "tl-palette";
    root.appendChild(palette);

    const controls = document.createElement("div");
    controls.className = "tl-controls";
    root.appendChild(controls);

    function makeObstacles() {
      const base = [
        { x: 405, y: 178, w: 90, h: 34 },
        { x: 405, y: 308, w: 90, h: 34 },
      ];
      if (obstacleMode === "few") return base;
      const extra = [
        { x: 268, y: 240, w: 58, h: 82 },
        { x: 574, y: 198, w: 58, h: 82 },
      ];
      if (obstacleMode === "normal") return base.concat(extra);
      return base.concat(extra, [
        { x: 170, y: 150, w: 48, h: 70 },
        { x: 682, y: 330, w: 48, h: 70 },
      ]);
    }

    function canEditSide(side) {
      if (over || sim || locked[side]) return false;
      if (ctx.isOnline) return side === ctx.mySeat;
      return side === activePlanner;
    }

    function editableSide() {
      if (ctx.isOnline) return ctx.mySeat;
      return activePlanner;
    }

    function addAction(action) {
      const side = editableSide();
      if (!canEditSide(side)) return;
      if (plans[side].length >= BEATS) return;
      const next = plans[side].concat(action);
      if (!isPlanAffordable(side, next)) return;
      plans[side] = next;
      ctx.sound("select");
      render();
      draw();
    }

    function removeSlot(side, idx) {
      if (!canEditSide(side)) return;
      plans[side].splice(idx, 1);
      ctx.sound("miss");
      render();
      draw();
    }

    function clearPlan(side) {
      if (!canEditSide(side)) return;
      plans[side] = [];
      render();
      draw();
    }

    function undoPlan(side) {
      if (!canEditSide(side)) return;
      plans[side].pop();
      render();
      draw();
    }

    function lockPlan(side) {
      if (!canEditSide(side) || plans[side].length < 1) return;
      const full = plans[side].slice();
      while (full.length < BEATS) full.push("wait"); // tự bù "Đợi" cho nhịp trống
      applyMove({ t: "plan", side, plan: full }, false);
    }

    function applyMove(move, fromRemote) {
      if (over || sim || !move || move.t !== "plan") return;
      const side = Number(move.side);
      if (side !== 0 && side !== 1) return;
      if (!Array.isArray(move.plan) || move.plan.length !== BEATS) return;
      const clean = move.plan.map((a) => ACTIONS[a] ? a : "wait");
      if (!isPlanAffordable(side, clean)) return;
      plans[side] = clean;
      locked[side] = true;
      energy[side] = planEnergyLeft(side, clean);

      if (!fromRemote) ctx.sendMove({ t: "plan", side, plan: clean });

      if (!ctx.isOnline && side === activePlanner && !locked[1 - side]) {
        activePlanner = 1 - side;
      }

      ctx.sound("place");
      if (locked[0] && locked[1]) startSimulation();
      else {
        render();
        updateStatus();
        draw();
      }
    }

    function isPlanAffordable(side, plan) {
      return planEnergyLeft(side, plan) >= 0;
    }

    function planEnergyLeft(side, plan) {
      let e = energy[side];
      for (const action of plan) {
        const cost = ACTIONS[action]?.cost || 0;
        if (cost < 0) e = Math.min(MAX_ENERGY, e - cost);
        else e -= cost;
        if (e < 0) return -1;
      }
      return e;
    }

    function actionAvailable(side, action) {
      if (!canEditSide(side)) return false;
      if (plans[side].length >= BEATS) return false;
      return isPlanAffordable(side, plans[side].concat(action));
    }

    function startSimulation() {
      sim = {
        tick: 0,
        total: BEATS * TICKS_PER_BEAT,
        actors: makeActors(),
        shots: [],
        mines: [],
        bursts: [],
        damageText: [],
      };
      activePlanner = -1;
      last = ctx.t("Replay bắt đầu: bản hiện tại và các bóng ma cũ chạy cùng lúc.", "Replay started: the current version and old ghosts run at the same time.");
      ctx.sound("shot");
      render();
      updateStatus();
      draw();
    }

    function makeActors() {
      const actors = [];
      [0, 1].forEach((owner) => {
        history[owner].forEach((item, idx) => {
          actors.push(makeActor(owner, item.plan, false, item.round, idx));
        });
        actors.push(makeActor(owner, plans[owner], true, round, history[owner].length));
      });
      return actors;
    }

    function makeActor(owner, plan, current, loopRound, idx) {
      const s = spawns[owner];
      return {
        owner,
        plan: plan.slice(),
        current,
        loopRound,
        idx,
        x: s.x,
        y: s.y,
        fx: s.fx,
        fy: s.fy,
        hp: current ? 34 : 24,
        shield: 0,
        alive: true,
        trail: [],
        flash: 0,
      };
    }

    function simulationStep() {
      if (!sim || over) return;
      const beat = Math.min(BEATS - 1, Math.floor(sim.tick / TICKS_PER_BEAT));
      const local = sim.tick % TICKS_PER_BEAT;

      if (local === 0) {
        sim.actors.forEach((actor) => {
          if (actor.alive) beginBeat(actor, actor.plan[beat] || "wait");
        });
      }

      sim.actors.forEach((actor) => {
        if (!actor.alive) return;
        const action = actor.plan[beat] || "wait";
        moveActorForAction(actor, action);
        actor.shield = Math.max(0, actor.shield - 1);
        actor.flash = Math.max(0, actor.flash - 1);
        if (sim.tick % 5 === 0) {
          actor.trail.push({ x: actor.x, y: actor.y });
          if (actor.trail.length > 15) actor.trail.shift();
        }
      });

      updateShots();
      updateMines();
      updateBursts();
      checkEndDuringReplay();
      if (!sim || over) return;

      sim.tick += 1;
      if (sim.tick >= sim.total && !over) finishSimulationRound();
    }

    function beginBeat(actor, action) {
      if (MOVE[action]) {
        actor.fx = MOVE[action][0];
        actor.fy = MOVE[action][1];
      } else if (action === "shoot") {
        fireShot(actor);
      } else if (action === "shield") {
        actor.shield = TICKS_PER_BEAT;
      } else if (action === "mine") {
        placeMine(actor);
      } else if (action === "charge") {
        sim.bursts.push({ x: actor.x, y: actor.y, r: 10, max: 30, life: 18, color: "#6ee7b7" });
      }
    }

    function moveActorForAction(actor, action) {
      let dx = 0, dy = 0, speed = actor.current ? 2.25 : 2.05;
      if (MOVE[action]) {
        dx = MOVE[action][0];
        dy = MOVE[action][1];
      } else if (action === "dash") {
        dx = actor.fx || (actor.owner === 0 ? 1 : -1);
        dy = actor.fy || 0;
        speed = actor.current ? 4.15 : 3.75;
      }
      if (!dx && !dy) return;
      const len = Math.hypot(dx, dy) || 1;
      actor.fx = dx / len;
      actor.fy = dy / len;
      moveCircle(actor, actor.fx * speed, actor.fy * speed);
    }

    function moveCircle(actor, dx, dy) {
      const oldX = actor.x, oldY = actor.y;
      actor.x = clamp(actor.x + dx, BOUNDS.left + ACTOR_R, BOUNDS.right - ACTOR_R);
      if (obstacles.some((r) => circleRect(actor.x, actor.y, ACTOR_R, r))) actor.x = oldX;
      actor.y = clamp(actor.y + dy, BOUNDS.top + ACTOR_R, BOUNDS.bottom - ACTOR_R);
      if (obstacles.some((r) => circleRect(actor.x, actor.y, ACTOR_R, r))) actor.y = oldY;
    }

    function fireShot(actor) {
      const fx = actor.fx || (actor.owner === 0 ? 1 : -1);
      const fy = actor.fy || 0;
      const len = Math.hypot(fx, fy) || 1;
      sim.shots.push({
        owner: actor.owner,
        x: actor.x + fx / len * 20,
        y: actor.y + fy / len * 20,
        vx: fx / len * 7.8,
        vy: fy / len * 7.8,
        life: 86,
        current: actor.current,
      });
    }

    function placeMine(actor) {
      sim.mines.push({
        owner: actor.owner,
        x: actor.x,
        y: actor.y,
        arm: 10,
        life: 160,
        current: actor.current,
      });
    }

    function updateShots() {
      for (let i = sim.shots.length - 1; i >= 0; i--) {
        const s = sim.shots[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 1;
        if (s.life <= 0 || s.x < BOUNDS.left || s.x > BOUNDS.right || s.y < BOUNDS.top || s.y > BOUNDS.bottom || obstacles.some((r) => circleRect(s.x, s.y, 4, r))) {
          sim.shots.splice(i, 1);
          continue;
        }

        const targetCore = cores[1 - s.owner];
        if (dist(s.x, s.y, targetCore.x, targetCore.y) <= CORE_R + 4) {
          damageCore(1 - s.owner, s.current ? 6 : 4, s.x, s.y);
          sim.shots.splice(i, 1);
          continue;
        }

        const target = sim.actors.find((a) => a.alive && a.owner !== s.owner && dist(s.x, s.y, a.x, a.y) <= ACTOR_R + 4);
        if (target) {
          damageActor(target, s.current ? 9 : 7, s.x, s.y);
          sim.shots.splice(i, 1);
        }
      }
    }

    function updateMines() {
      for (let i = sim.mines.length - 1; i >= 0; i--) {
        const m = sim.mines[i];
        m.arm -= 1;
        m.life -= 1;
        const core = cores[1 - m.owner];
        const actorHit = sim.actors.some((a) => a.alive && a.owner !== m.owner && dist(m.x, m.y, a.x, a.y) < 44);
        const coreHit = dist(m.x, m.y, core.x, core.y) < CORE_R + 36;
        if (m.life <= 0 || (m.arm <= 0 && (actorHit || coreHit))) {
          explodeMine(m);
          sim.mines.splice(i, 1);
        }
      }
    }

    function explodeMine(m) {
      sim.bursts.push({ x: m.x, y: m.y, r: 8, max: 62, life: 22, color: "#ff5d73" });
      sim.actors.forEach((a) => {
        if (a.alive && a.owner !== m.owner) {
          const d = dist(m.x, m.y, a.x, a.y);
          if (d < 58) damageActor(a, Math.round((m.current ? 15 : 11) * (1 - d / 80)), m.x, m.y);
        }
      });
      const core = cores[1 - m.owner];
      const d = dist(m.x, m.y, core.x, core.y);
      if (d < CORE_R + 58) damageCore(1 - m.owner, m.current ? 9 : 6, m.x, m.y);
      ctx.sound("capture");
    }

    function updateBursts() {
      sim.bursts.forEach((b) => {
        b.r += (b.max - b.r) * 0.22;
        b.life -= 1;
      });
      sim.bursts = sim.bursts.filter((b) => b.life > 0);
      sim.damageText.forEach((t) => {
        t.y -= 0.45;
        t.life -= 1;
      });
      sim.damageText = sim.damageText.filter((t) => t.life > 0);
    }

    function damageActor(actor, amount, x, y) {
      if (amount <= 0) return;
      const dmg = actor.shield > 0 ? Math.max(1, Math.round(amount * 0.3)) : amount;
      actor.hp = Math.max(0, actor.hp - dmg);
      actor.flash = 8;
      sim.damageText.push({ x, y, text: "-" + dmg, color: actor.owner === 0 ? "#ff91a2" : "#8be6f0", life: 26 });
      if (actor.hp <= 0) {
        actor.alive = false;
        sim.bursts.push({ x: actor.x, y: actor.y, r: 8, max: 42, life: 18, color: actor.owner === 0 ? "#ff5d73" : "#4dd0e1" });
      }
    }

    function damageCore(side, amount, x, y) {
      coreHp[side] = Math.max(0, coreHp[side] - amount);
      sim.damageText.push({ x, y: y - 12, text: "-" + amount, color: side === 0 ? "#ff91a2" : "#8be6f0", life: 30 });
      sim.bursts.push({ x, y, r: 8, max: 28, life: 14, color: "#ffd166" });
    }

    function checkEndDuringReplay() {
      if (coreHp[0] <= 0 && coreHp[1] <= 0) return drawGame();
      if (coreHp[0] <= 0) return finish(1, ctx.t("lõi P1 bị phá trong vòng lặp", "P1's core destroyed in the loop"));
      if (coreHp[1] <= 0) return finish(0, ctx.t("lõi P2 bị phá trong vòng lặp", "P2's core destroyed in the loop"));
    }

    function finishSimulationRound() {
      [0, 1].forEach((side) => {
        history[side].push({ round, plan: plans[side].slice() });
        while (history[side].length > MAX_GHOSTS) history[side].shift();
        plans[side] = [];
        locked[side] = false;
        energy[side] = Math.min(MAX_ENERGY, energy[side] + 1);
      });
      round += 1;
      activePlanner = ctx.isOnline ? ctx.mySeat : 0;
      sim = null;
      last = ctx.t("Vòng lặp mới đã mở. Bóng ma cũ sẽ tiếp tục chạy lại kế hoạch vừa khóa.", "A new loop has opened. Old ghosts will keep replaying the plans you just locked.");
      ctx.setTurn(activePlanner);
      render();
      updateStatus();
      draw();
    }

    function finish(winner, reason) {
      if (over) return;
      over = true;
      sim = null;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng - ${reason}!`, `🎉 Player ${winner + 1} wins — ${reason}!`));
      render();
      draw();
    }

    function drawGame() {
      if (over) return;
      over = true;
      sim = null;
      ctx.setTurn(-1);
      ctx.setStatus(ctx.t("🤝 Hòa - cả hai lõi bị phá trong cùng vòng lặp!", "🤝 Draw — both cores destroyed in the same loop!"));
      render();
      draw();
    }

    function render() {
      renderHud();
      renderPlanner();
      renderPalette();
      renderControls();
    }

    function renderHud() {
      hud.innerHTML = `
        ${playerPanel(0)}
        <div class="tl-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : sim ? ctx.t("Đang replay", "Replaying") : ctx.t(`Vòng ${round}`, `Round ${round}`)}</b>
          <span>${ctx.t(`${BEATS} nhịp kế hoạch · tối đa ${MAX_GHOSTS} bóng ma mỗi bên`, `${BEATS} plan beats · up to ${MAX_GHOSTS} ghosts per side`)}</span>
          <small>${last}</small>
        </div>
        ${playerPanel(1)}
      `;
    }

    function playerPanel(side) {
      const hpPct = Math.max(0, coreHp[side] / CORE_HP * 100);
      const active = !sim && !over && (ctx.isOnline ? side === ctx.mySeat && !locked[side] : side === activePlanner);
      return `
        <div class="tl-player p${side + 1} ${active ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${side + 1}`, `Player ${side + 1}`)}</span>
          <b>${ctx.t(`${coreHp[side]}/${CORE_HP} lõi`, `${coreHp[side]}/${CORE_HP} core`)}</b>
          <i class="tl-hp"><i style="width:${hpPct}%"></i></i>
          <small>${ctx.t(`${energy[side]} năng lượng · ${history[side].length} bóng ma · ${locked[side] ? "đã khóa" : "đang mở"}`, `${energy[side]} energy · ${history[side].length} ghosts · ${locked[side] ? "locked" : "open"}`)}</small>
        </div>
      `;
    }

    function renderPlanner() {
      planner.innerHTML = "";
      [0, 1].forEach((side) => {
        const box = document.createElement("div");
        box.className = `tl-plan p${side + 1} ${canEditSide(side) ? "active" : ""} ${locked[side] ? "locked" : ""}`;
        const left = planEnergyLeft(side, plans[side]);
        box.innerHTML = `
          <div class="tl-plan-head">
            <b>${ctx.t(`Kế hoạch P${side + 1}`, `Plan P${side + 1}`)}</b>
            <span>${ctx.t(`${plans[side].length}/${BEATS} nhịp · còn ${Math.max(0, left)} NL`, `${plans[side].length}/${BEATS} beats · ${Math.max(0, left)} EN left`)}</span>
          </div>
          <div class="tl-slots"></div>
        `;
        const slots = box.querySelector(".tl-slots");
        for (let i = 0; i < BEATS; i++) {
          const action = plans[side][i];
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `tl-slot ${action ? "filled" : ""}`;
          btn.innerHTML = action ? `<span>${ACTIONS[action].icon}</span><small>${aLabel(action)}</small>` : `<span>${i + 1}</span>`;
          btn.disabled = !canEditSide(side) || !action;
          btn.addEventListener("click", () => removeSlot(side, i));
          slots.appendChild(btn);
        }
        planner.appendChild(box);
      });
    }

    function renderPalette() {
      const side = editableSide();
      palette.innerHTML = Object.keys(ACTIONS).map((id) => {
        const a = ACTIONS[id];
        const disabled = !actionAvailable(side, id);
        const cost = a.cost < 0 ? ctx.t("+1 NL", "+1 EN") : a.cost ? ctx.t(`${a.cost} NL`, `${a.cost} EN`) : ctx.t("miễn phí", "free");
        return `
          <button class="btn small tl-action" type="button" data-action="${id}" ${disabled ? "disabled" : ""}>
            <span>${a.icon}</span><b>${aLabel(id)}</b><small>${cost} · ${aHint(id)}</small>
          </button>
        `;
      }).join("");
      palette.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => addAction(btn.dataset.action));
      });
    }

    function renderControls() {
      const side = editableSide();
      const validSide = side === 0 || side === 1;
      const can = validSide && canEditSide(side);
      const planLength = validSide ? plans[side].length : 0;
      controls.innerHTML = `
        <button class="btn small" type="button" data-cmd="undo" ${can && planLength ? "" : "disabled"}>${ctx.t("↶ Lùi 1", "↶ Undo")}</button>
        <button class="btn small" type="button" data-cmd="clear" ${can && planLength ? "" : "disabled"}>${ctx.t("Xóa plan", "Clear plan")}</button>
        <button class="btn primary" type="button" data-cmd="lock" ${can && planLength >= 1 ? "" : "disabled"}>${ctx.t("🔒 Khóa (bù Đợi)", "🔒 Lock (fill Wait)")}</button>
      `;
      controls.querySelector('[data-cmd="undo"]').addEventListener("click", () => undoPlan(side));
      controls.querySelector('[data-cmd="clear"]').addEventListener("click", () => clearPlan(side));
      controls.querySelector('[data-cmd="lock"]').addEventListener("click", () => lockPlan(side));
    }

    function updateStatus() {
      if (over) return;
      if (sim) {
        ctx.setStatus(ctx.t("Đang chạy replay: các bóng ma quá khứ và nhân vật hiện tại cùng hành động.", "Replay running: past ghosts and the current character act together."));
      } else if (ctx.isOnline) {
        if (!locked[ctx.mySeat]) ctx.setStatus(ctx.t("Chọn đủ kế hoạch cho lượt của bạn rồi khóa. Đối thủ sẽ gửi plan riêng.", "Set up your plan for this turn then lock. The opponent sends their own plan."));
        else ctx.setStatus(ctx.t("Bạn đã khóa kế hoạch. Đang chờ đối thủ...", "You locked your plan. Waiting for the opponent..."));
      } else {
        ctx.setStatus(ctx.t(`Người chơi ${activePlanner + 1}: xếp hành động (xem đường đi xem trước) rồi 🔒 Khóa — không cần đủ ${BEATS} nhịp.`, `Player ${activePlanner + 1}: arrange actions (preview your path) then 🔒 Lock — no need to fill all ${BEATS} beats.`));
      }
      if (!sim && !over) ctx.setTurn(ctx.isOnline ? ctx.mySeat : activePlanner);
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      drawArena();
      drawCores();
      if (sim) {
        sim.mines.forEach(drawMine);
        sim.actors.forEach(drawActorTrail);
        sim.actors.forEach(drawActor);
        sim.shots.forEach(drawShot);
        sim.bursts.forEach(drawBurst);
        sim.damageText.forEach(drawText);
        drawTimeline();
      } else {
        drawPreviewActors();
        drawPlanPreview();
      }
    }

    function drawArena() {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#161d3a");
      bg.addColorStop(1, "#090d1d");
      g.fillStyle = bg;
      roundRect(g, 0, 0, W, H, 18);
      g.fill();

      g.fillStyle = "rgba(255,93,115,0.06)";
      g.fillRect(BOUNDS.left, BOUNDS.top, 210, BOUNDS.bottom - BOUNDS.top);
      g.fillStyle = "rgba(77,208,225,0.06)";
      g.fillRect(BOUNDS.right - 210, BOUNDS.top, 210, BOUNDS.bottom - BOUNDS.top);

      g.strokeStyle = "rgba(255,255,255,0.06)";
      g.lineWidth = 1;
      for (let x = BOUNDS.left; x <= BOUNDS.right; x += 54) {
        g.beginPath(); g.moveTo(x, BOUNDS.top); g.lineTo(x, BOUNDS.bottom); g.stroke();
      }
      for (let y = BOUNDS.top; y <= BOUNDS.bottom; y += 54) {
        g.beginPath(); g.moveTo(BOUNDS.left, y); g.lineTo(BOUNDS.right, y); g.stroke();
      }

      g.strokeStyle = "rgba(255,209,102,0.32)";
      g.lineWidth = 2;
      roundRect(g, BOUNDS.left, BOUNDS.top, BOUNDS.right - BOUNDS.left, BOUNDS.bottom - BOUNDS.top, 10);
      g.stroke();

      obstacles.forEach((r) => {
        const grd = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        grd.addColorStop(0, "#586079");
        grd.addColorStop(1, "#252c42");
        g.fillStyle = grd;
        roundRect(g, r.x, r.y, r.w, r.h, 9);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.16)";
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(r.x + 8, r.y + 8, r.w - 16, 4);
      });
    }

    function drawCores() {
      cores.forEach((core) => {
        const side = core.owner;
        const color = side === 0 ? "#ff5d73" : "#4dd0e1";
        g.save();
        g.translate(core.x, core.y);
        g.shadowColor = color;
        g.shadowBlur = 18;
        g.fillStyle = side === 0 ? "#5d1d32" : "#164e62";
        g.beginPath();
        g.arc(0, 0, CORE_R, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = "#fff4bf";
        g.font = "900 12px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("CORE", 0, 0);
        g.restore();
      });
    }

    // mô phỏng đường đi của một kế hoạch (không tính chiến đấu) để xem trước
    function planPath(owner, plan) {
      const s = spawns[owner];
      const a = { owner, x: s.x, y: s.y, fx: s.fx, fy: s.fy, current: true };
      const pts = [{ x: a.x, y: a.y }];
      const markers = [];
      for (let beat = 0; beat < plan.length; beat++) {
        const action = plan[beat] || "wait";
        if (MOVE[action]) { a.fx = MOVE[action][0]; a.fy = MOVE[action][1]; }
        if (action === "shoot" || action === "mine") {
          markers.push({ x: a.x, y: a.y, type: action, fx: a.fx, fy: a.fy });
        }
        for (let t = 0; t < TICKS_PER_BEAT; t++) {
          moveActorForAction(a, action);
          if (t % 4 === 0) pts.push({ x: a.x, y: a.y });
        }
        pts.push({ x: a.x, y: a.y });
        markers.push({ x: a.x, y: a.y, type: "beatend" });
      }
      return { pts, markers, end: { x: a.x, y: a.y, fx: a.fx, fy: a.fy } };
    }

    function drawPlanPreview() {
      const side = editableSide();
      if (side !== 0 && side !== 1) return;
      if (!canEditSide(side) || !plans[side].length) return;
      const color = side === 0 ? "#ff5d73" : "#4dd0e1";
      const { pts, markers } = planPath(side, plans[side]);
      g.save();
      // tuyến đường chấm
      g.setLineDash([5, 6]);
      g.strokeStyle = color;
      g.globalAlpha = 0.7;
      g.lineWidth = 2;
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      // hướng bắn / mìn
      markers.forEach((m) => {
        if (m.type === "shoot") {
          const len = Math.hypot(m.fx, m.fy) || 1;
          g.strokeStyle = "rgba(255,255,255,0.55)";
          g.setLineDash([3, 5]);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(m.x, m.y);
          g.lineTo(m.x + m.fx / len * 140, m.y + m.fy / len * 140);
          g.stroke();
          g.setLineDash([]);
        } else if (m.type === "mine") {
          g.fillStyle = "#ffd166";
          g.font = "14px serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("◈", m.x, m.y);
        }
      });
      // số thứ tự nhịp tại điểm dừng mỗi nhịp
      let bn = 0;
      markers.forEach((m) => {
        if (m.type !== "beatend") return;
        bn++;
        g.fillStyle = color;
        g.beginPath();
        g.arc(m.x, m.y, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0b1020";
        g.font = "900 10px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(bn), m.x, m.y);
      });
      g.textBaseline = "alphabetic";
      g.restore();
    }

    function drawPreviewActors() {
      [0, 1].forEach((owner) => {
        history[owner].forEach((item, idx) => {
          const actor = makeActor(owner, item.plan, false, item.round, idx);
          actor.x += owner === 0 ? -idx * 4 : idx * 4;
          actor.y += (idx - 1) * 5;
          drawActor(actor);
        });
        drawActor(makeActor(owner, plans[owner], true, round, history[owner].length));
      });
    }

    function drawActorTrail(actor) {
      if (!actor.alive || actor.trail.length < 2) return;
      g.save();
      g.globalAlpha = actor.current ? 0.35 : 0.18;
      g.strokeStyle = actor.owner === 0 ? "#ff5d73" : "#4dd0e1";
      g.lineWidth = actor.current ? 3 : 2;
      g.beginPath();
      actor.trail.forEach((p, i) => {
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      });
      g.stroke();
      g.restore();
    }

    function drawActor(actor) {
      if (!actor.alive) return;
      const color = actor.owner === 0 ? "#ff5d73" : "#4dd0e1";
      g.save();
      g.globalAlpha = actor.current ? 1 : 0.42;
      g.translate(actor.x, actor.y);
      if (actor.shield > 0) {
        g.strokeStyle = "#ffd166";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, ACTOR_R + 8, 0, Math.PI * 2);
        g.stroke();
      }
      g.rotate(Math.atan2(actor.fy || 0, actor.fx || (actor.owner === 0 ? 1 : -1)));
      g.fillStyle = actor.flash ? "#fff4bf" : color;
      g.beginPath();
      g.moveTo(18, 0);
      g.lineTo(-10, -13);
      g.lineTo(-5, 0);
      g.lineTo(-10, 13);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.72)";
      g.lineWidth = 2;
      g.stroke();
      g.restore();

      g.save();
      g.globalAlpha = actor.current ? 1 : 0.5;
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(actor.x - 15, actor.y + 21, 30, 4);
      g.fillStyle = color;
      g.fillRect(actor.x - 15, actor.y + 21, 30 * Math.max(0, actor.hp) / (actor.current ? 34 : 24), 4);
      g.restore();
    }

    function drawShot(s) {
      g.save();
      g.shadowColor = s.owner === 0 ? "#ff5d73" : "#4dd0e1";
      g.shadowBlur = 12;
      g.fillStyle = s.owner === 0 ? "#ff9aaa" : "#a0f4ff";
      g.beginPath();
      g.arc(s.x, s.y, s.current ? 5 : 4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawMine(m) {
      g.save();
      g.globalAlpha = m.arm > 0 ? 0.55 : 1;
      g.fillStyle = m.owner === 0 ? "#7b2036" : "#16576a";
      g.strokeStyle = "#ffd166";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(m.x, m.y, 10, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffd166";
      g.fillRect(m.x - 2, m.y - 16, 4, 8);
      g.restore();
    }

    function drawBurst(b) {
      g.save();
      g.globalAlpha = Math.max(0, b.life / 22);
      g.strokeStyle = b.color;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    function drawText(t) {
      g.save();
      g.globalAlpha = Math.max(0, t.life / 30);
      g.fillStyle = t.color;
      g.font = "900 13px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(t.text, t.x, t.y);
      g.restore();
    }

    function drawTimeline() {
      const x = 140, y = 36, w = W - 280, h = 8;
      g.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(g, x, y, w, h, 999);
      g.fill();
      g.fillStyle = "#ffd166";
      roundRect(g, x, y, w * (sim.tick / sim.total), h, 999);
      g.fill();
      for (let i = 1; i < BEATS; i++) {
        const px = x + w * i / BEATS;
        g.fillStyle = "rgba(10,12,24,0.65)";
        g.fillRect(px - 1, y - 3, 2, h + 6);
      }
    }

    function loop() {
      if (sim && !over) {
        simulationStep();
        draw();
      }
      raf = requestAnimationFrame(loop);
    }

    function circleRect(cx, cy, cr, r) {
      const nx = clamp(cx, r.x, r.x + r.w);
      const ny = clamp(cy, r.y, r.y + r.h);
      return dist(cx, cy, nx, ny) <= cr;
    }

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function dist(x1, y1, x2, y2) {
      return Math.hypot(x1 - x2, y1 - y2);
    }

    function roundRect(gc, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      gc.beginPath();
      gc.moveTo(x + rr, y);
      gc.lineTo(x + w - rr, y);
      gc.quadraticCurveTo(x + w, y, x + w, y + rr);
      gc.lineTo(x + w, y + h - rr);
      gc.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      gc.lineTo(x + rr, y + h);
      gc.quadraticCurveTo(x, y + h, x, y + h - rr);
      gc.lineTo(x, y + rr);
      gc.quadraticCurveTo(x, y, x + rr, y);
      gc.closePath();
    }

    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    // phím tắt: mũi tên thêm bước đi, S bắn, D lướt, H khiên, M mìn, E nạp, Enter khóa, Backspace lùi
    function onKey(e) {
      const side = editableSide();
      if (!canEditSide(side)) return;
      const map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        s: "shoot", S: "shoot", d: "dash", D: "dash", h: "shield", H: "shield",
        m: "mine", M: "mine", e: "charge", E: "charge", w: "wait", W: "wait",
      };
      if (e.key === "Enter") { lockPlan(side); e.preventDefault(); return; }
      if (e.key === "Backspace") { undoPlan(side); e.preventDefault(); return; }
      const action = map[e.key];
      if (action) { addAction(action); e.preventDefault(); }
    }
    window.addEventListener("keydown", onKey);

    ctx.setTurn(0);
    render();
    updateStatus();
    draw();
    raf = requestAnimationFrame(loop);

    return { applyMove };
  }

  window.GameRegistry.register({
    id: "timeloopduel",
    name: "Time Loop Duel",
    emoji: "⏱️",
    description: "Lập trình chuỗi hành động, xem trước đường đi, khóa kế hoạch rồi replay đồng thời. Bóng ma các vòng trước lặp lại để cùng phá lõi đối thủ.",
    onlineReady: true,
    options: [
      {
        id: "beats",
        label: "Độ dài vòng lặp",
        default: 6,
        choices: [
          { value: 5, label: "5 nhịp (nhanh)" },
          { value: 6, label: "6 nhịp" },
          { value: 8, label: "8 nhịp (dài)" },
        ],
      },
      {
        id: "core",
        label: "Máu lõi",
        default: 90,
        choices: [
          { value: 70, label: "70 HP" },
          { value: 90, label: "90 HP" },
          { value: 120, label: "120 HP" },
        ],
      },
      {
        id: "ghosts",
        label: "Bóng ma giữ lại",
        default: 5,
        choices: [
          { value: 3, label: "3 vòng" },
          { value: 5, label: "5 vòng" },
          { value: 7, label: "7 vòng" },
        ],
      },
      {
        id: "obstacles",
        label: "Chướng ngại",
        default: "normal",
        choices: [
          { value: "few", label: "Ít" },
          { value: "normal", label: "Vừa" },
          { value: "many", label: "Nhiều" },
        ],
      },
    ],
    howTo: [
      "Mỗi vòng bạn xếp một chuỗi hành động cho nhân vật. KHÔNG cần điền đủ — bấm 🔒 Khóa là các nhịp trống tự thành 'Đợi'.",
      "Khi đang xếp, ĐƯỜNG ĐI XEM TRƯỚC (chấm + số nhịp) hiện ngay trên sân để bạn biết mình sẽ chạy tới đâu; nhịp 'Bắn' có vạch chỉ hướng đạn, 'Mìn' có dấu ◈.",
      "Phím tắt cho nhanh: mũi tên ←↑↓→ thêm bước đi, S = Bắn, D = Lướt, H = Khiên, M = Mìn, E = Nạp năng lượng, Enter = Khóa, Backspace = Lùi 1.",
      "Hướng nhìn theo bước đi gần nhất — muốn bắn trúng lõi đối thủ, hãy đi về hướng đó trước rồi mới Bắn.",
      "Khi cả hai khóa xong, game replay hai kế hoạch cùng lúc. Kế hoạch vừa chạy biến thành 'bóng ma' và sẽ lặp lại ở các vòng sau, nên đội hình ngày càng đông.",
      "Bắn và mìn gây sát thương lõi đối thủ. Khiên giảm sát thương, Lướt đổi vị trí nhanh, Nạp lấy thêm năng lượng cho kỹ năng.",
      "Phá lõi đối thủ trước để thắng. Nếu hai lõi cùng vỡ trong một replay thì hòa.",
    ],
    create,
  });
})();
