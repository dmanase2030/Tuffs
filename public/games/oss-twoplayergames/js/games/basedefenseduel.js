/* Base Defense Duel - tower defense doi khang realtime nhe. */
(function () {
  const W = 1040;
  const H = 600;
  const LANES = [210, 300, 390];
  const BASE_X = [112, W - 112];
  const BASE_Y = 302;
  const SPAWN_X = [172, W - 172];
  const TOWER_X = [318, W - 318];
  const MAX_TOWER_LVL = 4;
  const UNIT_ORDER = ["grunt", "runner", "lancer", "shield", "archer", "siege", "brute", "bomber", "warlock", "medic", "golem"];

  const UNIT_DEFS = {
    grunt: {
      label: "Tân binh",
      icon: "🪖",
      cost: 22,
      hp: 62,
      dmg: 10,
      speed: 40,
      cd: 0.72,
      range: 20,
      reward: 7,
      color: "#ffd166",
      hint: "rẻ, đẩy lane",
    },
    runner: {
      label: "Trinh sát",
      icon: "🏃",
      cost: 36,
      hp: 48,
      dmg: 12,
      speed: 66,
      cd: 0.58,
      range: 18,
      reward: 9,
      color: "#8be6f0",
      hint: "nhanh",
    },
    shield: {
      label: "Vệ binh",
      icon: "🛡️",
      cost: 46,
      hp: 116,
      dmg: 8,
      speed: 32,
      cd: 0.92,
      range: 22,
      reward: 12,
      armor: 3,
      color: "#a7f3d0",
      hint: "đỡ đòn",
    },
    archer: {
      label: "Cung thủ",
      icon: "🏹",
      cost: 52,
      hp: 56,
      dmg: 18,
      speed: 40,
      cd: 1.04,
      range: 96,
      reward: 12,
      color: "#f6f0a8",
      hint: "bắn xa",
    },
    brute: {
      label: "Chiến binh",
      icon: "🪓",
      cost: 64,
      hp: 142,
      dmg: 23,
      speed: 28,
      cd: 1.05,
      range: 24,
      reward: 14,
      color: "#ff9f5d",
      hint: "nhiều máu",
    },
    bomber: {
      label: "Công binh",
      icon: "💣",
      cost: 74,
      hp: 72,
      dmg: 31,
      speed: 30,
      cd: 1.28,
      range: 28,
      reward: 16,
      splash: 38,
      color: "#ff7a59",
      hint: "đánh lan",
    },
    warlock: {
      label: "Pháp sư",
      icon: "🧙",
      cost: 88,
      hp: 82,
      dmg: 19,
      speed: 37,
      cd: 0.9,
      range: 74,
      reward: 18,
      color: "#c792ea",
      hint: "đánh xa",
    },
    golem: {
      label: "Golem đá",
      icon: "🗿",
      cost: 112,
      hp: 235,
      dmg: 32,
      speed: 22,
      cd: 1.34,
      range: 28,
      reward: 25,
      armor: 5,
      color: "#b7c1a1",
      hint: "siêu trâu",
    },
    lancer: {
      label: "Kỵ binh",
      icon: "🐎",
      cost: 58,
      hp: 78,
      dmg: 27,
      speed: 80,
      cd: 0.82,
      range: 22,
      reward: 13,
      color: "#f3a8c8",
      hint: "lao cực nhanh",
    },
    siege: {
      label: "Pháo binh",
      icon: "🚀",
      cost: 98,
      hp: 92,
      dmg: 38,
      speed: 18,
      cd: 1.6,
      range: 128,
      reward: 20,
      vsBase: 2.3,
      color: "#cdb38b",
      hint: "bắn xa, phá nhà",
    },
    medic: {
      label: "Y tá",
      icon: "💉",
      cost: 54,
      hp: 70,
      dmg: 0,
      speed: 32,
      cd: 1.0,
      range: 66,
      reward: 12,
      heal: 16,
      color: "#a8f0c8",
      hint: "hồi máu đồng đội",
    },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const BASE_HP = o.hp || 560;
    // bản dịch nhãn/gợi ý lính (UNIT_DEFS là hằng module-level)
    const UNIT_LABEL_EN = { grunt: "Recruit", runner: "Scout", shield: "Guard", archer: "Archer", brute: "Warrior", bomber: "Sapper", warlock: "Warlock", golem: "Stone golem", lancer: "Lancer", siege: "Artillery", medic: "Medic" };
    const UNIT_HINT_EN = { grunt: "cheap, pushes lane", runner: "fast", shield: "tanks hits", archer: "long range", brute: "high HP", bomber: "splash", warlock: "ranged", golem: "super tanky", lancer: "very fast charge", siege: "long range, anti-base", medic: "heals allies" };
    const unitLabel = (id) => ctx.t(UNIT_DEFS[id].label, UNIT_LABEL_EN[id] || UNIT_DEFS[id].label);
    const unitHint = (id) => ctx.t(UNIT_DEFS[id].hint, UNIT_HINT_EN[id] || UNIT_DEFS[id].hint);
    const START_GOLD = o.gold || 155;
    const pace = o.pace || "normal";
    const INCOME_BASE = pace === "fast" ? 16 : pace === "slow" ? 10 : 13;
    const SCALING = o.scaling === "hard" ? 0.4 : o.scaling === "soft" ? 0.22 : 0.3;

    const baseHp = [BASE_HP, BASE_HP];
    const gold = [START_GOLD, START_GOLD];
    const incomeLvl = [0, 0];
    const armoryLvl = [0, 0];
    const fortifyLvl = [0, 0];
    const marchLvl = [0, 0];
    const arsenalLvl = [0, 0];
    const towers = [
      [null, null, null],
      [null, null, null],
    ];
    const units = [];
    const bullets = [];
    const pops = [];

    let controlSide = ctx.isOnline ? ctx.mySeat : 0;
    let selectedLane = [1, 1];
    let elapsed = 0;
    let lastTime = 0;
    let over = false;
    let raf = null;
    let last = ctx.t("Gửi lính để ép lane, xây tháp để thủ nhà.", "Send units to push lanes, build towers to defend your base.");

    const root = document.createElement("div");
    root.className = "bd-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "bd-hud";
    root.appendChild(hud);

    const arena = document.createElement("div");
    arena.className = "bd-arena";
    root.appendChild(arena);

    const attackPanel = document.createElement("div");
    attackPanel.className = "bd-command-panel bd-attack-panel";
    attackPanel.innerHTML = `
      <div class="bd-panel-head">
        <b>${ctx.t("Tấn công", "Attack")}</b>
        <span>${ctx.t("Gửi lính sang lane đối thủ", "Send units to the enemy lane")}</span>
      </div>
      <div class="bd-action-group bd-attack-actions"></div>
    `;
    arena.appendChild(attackPanel);

    const centerCol = document.createElement("div");
    centerCol.className = "bd-center-col";
    arena.appendChild(centerCol);

    const stageWrap = document.createElement("div");
    stageWrap.className = "bd-stage-wrap";
    const canvas = document.createElement("canvas");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.className = "bd-canvas";
    stageWrap.appendChild(canvas);
    centerCol.appendChild(stageWrap);
    const g = canvas.getContext("2d");
    g.scale(DPR, DPR);

    const controls = document.createElement("div");
    controls.className = "bd-controls bd-center-controls";
    controls.innerHTML = `
      <div class="bd-sidebox"></div>
    `;
    centerCol.appendChild(controls);

    const defensePanel = document.createElement("div");
    defensePanel.className = "bd-command-panel bd-defense-panel";
    defensePanel.innerHTML = `
      <div class="bd-panel-head">
        <b>${ctx.t("Phòng thủ", "Defense")}</b>
        <span>${ctx.t("Tháp, sửa nhà và nâng cấp", "Towers, repair and upgrades")}</span>
      </div>
      <div class="bd-group-title">${ctx.t("Tháp & nhà chính", "Towers & main base")}</div>
      <div class="bd-action-group bd-defense-actions"></div>
      <div class="bd-group-title">${ctx.t("Kinh tế & sức mạnh", "Economy & power")}</div>
      <div class="bd-action-group bd-upgrade-actions"></div>
    `;
    arena.appendChild(defensePanel);

    const sideBox = controls.querySelector(".bd-sidebox");
    const attackBox = attackPanel.querySelector(".bd-attack-actions");
    const defenseBox = defensePanel.querySelector(".bd-defense-actions");
    const upgradeBox = defensePanel.querySelector(".bd-upgrade-actions");

    const attackActions = [
      ...UNIT_ORDER.map((id) => ({ id, kind: "unit", def: UNIT_DEFS[id] })),
    ];
    const defenseActions = [
      { id: "tower", label: ctx.t("Xây tháp", "Build tower"), icon: "🗼", hint: ctx.t("lane đã chọn", "selected lane") },
      { id: "upTower", label: ctx.t("Nâng tháp", "Upgrade tower"), icon: "⬆️", hint: ctx.t("tối đa 4", "max 4") },
      { id: "repair", label: ctx.t("Sửa nhà", "Repair base"), icon: "🔧", hint: ctx.t("+90 HP", "+90 HP") },
    ];
    const upgradeActions = [
      { id: "econ", label: ctx.t("Kinh tế", "Economy"), icon: "💰", hint: ctx.t("+vàng/giây", "+gold/sec") },
      { id: "armory", label: ctx.t("Lò rèn", "Armory"), icon: "⚒️", hint: ctx.t("+sát thương", "+damage") },
      { id: "fortify", label: ctx.t("Giáp trận", "Fortify"), icon: "🛡️", hint: ctx.t("+máu lính", "+unit HP") },
      { id: "march", label: ctx.t("Hành quân", "March"), icon: "👟", hint: ctx.t("+tốc độ lính", "+unit speed") },
      { id: "arsenal", label: ctx.t("Khí tài", "Arsenal"), icon: "📡", hint: ctx.t("+tầm & dmg tháp", "+tower range & dmg") },
    ];

    function renderStaticControls() {
      sideBox.innerHTML = "";
      if (ctx.isOnline) {
        const label = document.createElement("div");
        label.className = "bd-online-side";
        label.innerHTML = `<b>${ctx.t(`Bạn: Người chơi ${ctx.mySeat + 1}`, `You: Player ${ctx.mySeat + 1}`)}</b><span>${ctx.t(`Điều khiển phe ${ctx.mySeat === 0 ? "đỏ" : "xanh"}`, `Controlling the ${ctx.mySeat === 0 ? "red" : "blue"} side`)}</span>`;
        sideBox.appendChild(label);
      } else {
        [0, 1].forEach((side) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn small bd-side-btn";
          btn.dataset.side = String(side);
          btn.textContent = "P" + (side + 1);
          btn.addEventListener("click", () => {
            controlSide = side;
            ctx.setTurn(controlSide);
            syncControls();
            draw();
          });
          sideBox.appendChild(btn);
        });
      }

      attackBox.innerHTML = "";
      defenseBox.innerHTML = "";
      upgradeBox.innerHTML = "";
      [
        [attackActions, attackBox],
        [defenseActions, defenseBox],
        [upgradeActions, upgradeBox],
      ].forEach(([list, box]) => {
        list.forEach((a) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn small bd-action";
          btn.dataset.action = a.id;
          const label = a.def ? unitLabel(a.id) : a.label;
          const icon = a.def ? a.def.icon : a.icon;
          const hint = a.def ? unitHint(a.id) : a.hint;
          if (a.def && a.def.color) btn.style.setProperty("--ac", a.def.color);
          btn.innerHTML = `<span>${icon}</span><b>${label}</b><small>${hint}</small><em></em>`;
          btn.addEventListener("click", () => submitAction(a.id));
          box.appendChild(btn);
        });
      });
    }

    canvas.addEventListener("click", (e) => {
      if (over) return;
      const p = pointerPos(e);
      const lane = nearestLane(p.y);
      if (lane !== -1) selectedLane[controlSide] = lane;
      if (!ctx.isOnline) {
        controlSide = p.x < W / 2 ? 0 : 1;
        ctx.setTurn(controlSide);
      }
      syncControls();
      draw();
    });

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    }

    function nearestLane(y) {
      let best = -1, bestD = 999;
      LANES.forEach((ly, i) => {
        const d = Math.abs(y - ly);
        if (d < bestD) { best = i; bestD = d; }
      });
      return bestD <= 48 ? best : -1;
    }

    function submitAction(action) {
      if (over) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (ctx.isOnline && side !== ctx.mySeat) return;
      const lane = selectedLane[side];
      const cmd = { kind: "bd", action, lane };
      if (applyCommand(cmd, false) && ctx.isOnline) ctx.sendMove(cmd);
    }

    function applyMove(move, fromRemote) {
      if (!move || move.kind !== "bd") return;
      applyCommand(move, fromRemote);
    }

    function applyCommand(cmd, fromRemote) {
      if (over) return false;
      const side = ctx.isOnline
        ? (fromRemote ? 1 - ctx.mySeat : ctx.mySeat)
        : controlSide;
      const lane = clamp(Number(cmd.lane), 0, 2);
      const force = fromRemote && ctx.isOnline;
      let ok = false;

      if (UNIT_DEFS[cmd.action]) ok = buyUnit(side, lane, cmd.action, force);
      else if (cmd.action === "tower") ok = buildTower(side, lane, force);
      else if (cmd.action === "upTower") ok = upgradeTower(side, lane, force);
      else if (cmd.action === "econ") ok = upgradeEconomy(side, force);
      else if (cmd.action === "armory") ok = upgradeArmory(side, force);
      else if (cmd.action === "fortify") ok = upgradeTrack(side, force, fortifyLvl, fortifyCost, ctx.t("Giáp trận", "Fortify"));
      else if (cmd.action === "march") ok = upgradeTrack(side, force, marchLvl, marchCost, ctx.t("Hành quân", "March"));
      else if (cmd.action === "arsenal") ok = upgradeTrack(side, force, arsenalLvl, arsenalCost, ctx.t("Khí tài", "Arsenal"));
      else if (cmd.action === "repair") ok = repairBase(side, force);

      if (ok) {
        selectedLane[side] = lane;
        renderHud();
        syncControls();
        updateStatus();
      }
      return ok;
    }

    function buyUnit(side, lane, type, force) {
      const def = UNIT_DEFS[type];
      if (!spend(side, def.cost, force)) return false;
      spawnUnit(side, lane, type);
      last = ctx.t(`Người chơi ${side + 1} gửi ${def.label} vào lane ${lane + 1}.`, `Player ${side + 1} sent ${unitLabel(type)} to lane ${lane + 1}.`);
      ctx.sound("select");
      return true;
    }

    function buildTower(side, lane, force) {
      if (towers[side][lane]) return false;
      const cost = towerBuildCost(side);
      if (!spend(side, cost, force)) return false;
      towers[side][lane] = { lvl: 1, cd: 0, pulse: 20 };
      last = ctx.t(`Người chơi ${side + 1} xây tháp lane ${lane + 1}.`, `Player ${side + 1} built a tower on lane ${lane + 1}.`);
      ctx.sound("capture");
      return true;
    }

    function upgradeTower(side, lane, force) {
      const tw = towers[side][lane];
      if (!tw || tw.lvl >= MAX_TOWER_LVL) return false;
      const cost = towerUpgradeCost(tw);
      if (!spend(side, cost, force)) return false;
      tw.lvl += 1;
      tw.pulse = 28;
      last = ctx.t(`Người chơi ${side + 1} nâng tháp lane ${lane + 1} lên cấp ${tw.lvl}.`, `Player ${side + 1} upgraded the lane ${lane + 1} tower to level ${tw.lvl}.`);
      ctx.sound("capture");
      return true;
    }

    function upgradeEconomy(side, force) {
      const cost = econCost(side);
      if (!spend(side, cost, force)) return false;
      incomeLvl[side] += 1;
      last = ctx.t(`Người chơi ${side + 1} nâng kinh tế lên cấp ${incomeLvl[side]}.`, `Player ${side + 1} upgraded economy to level ${incomeLvl[side]}.`);
      ctx.sound("select");
      return true;
    }

    function upgradeArmory(side, force) {
      const cost = armoryCost(side);
      if (!spend(side, cost, force)) return false;
      armoryLvl[side] += 1;
      last = ctx.t(`Người chơi ${side + 1} nâng lò rèn lên cấp ${armoryLvl[side]}.`, `Player ${side + 1} upgraded armory to level ${armoryLvl[side]}.`);
      ctx.sound("select");
      return true;
    }

    function upgradeTrack(side, force, lvlArr, costFn, name) {
      const cost = costFn(side);
      if (!spend(side, cost, force)) return false;
      lvlArr[side] += 1;
      last = ctx.t(`Người chơi ${side + 1} nâng ${name} lên cấp ${lvlArr[side]}.`, `Player ${side + 1} upgraded ${name} to level ${lvlArr[side]}.`);
      ctx.sound("select");
      return true;
    }

    function repairBase(side, force) {
      const cost = repairCost(side);
      if (baseHp[side] >= BASE_HP) return false;
      if (!spend(side, cost, force)) return false;
      baseHp[side] = Math.min(BASE_HP, baseHp[side] + 90);
      last = ctx.t(`Người chơi ${side + 1} sửa nhà chính.`, `Player ${side + 1} repaired the main base.`);
      ctx.sound("select");
      return true;
    }

    function spend(side, cost, force) {
      if (!force && gold[side] < cost) return false;
      gold[side] = Math.max(0, gold[side] - cost);
      return true;
    }

    function spawnUnit(owner, lane, type) {
      const def = UNIT_DEFS[type];
      const scale = unitScale(owner);
      const hp0 = Math.round(def.hp * scale * (1 + fortifyLvl[owner] * 0.14));
      const y = LANES[lane] + (ctx.rng() * 12 - 6);
      units.push({
        id: Math.random().toString(36).slice(2),
        owner,
        lane,
        type,
        x: SPAWN_X[owner],
        y,
        hp: hp0,
        maxHp: hp0,
        dmg: Math.round(def.dmg * (1 + armoryLvl[owner] * 0.13 + elapsed / 360 * SCALING)),
        speed: def.speed * (1 + elapsed / 520 * 0.08) * (1 + marchLvl[owner] * 0.1),
        cd: 0.18 + ctx.rng() * 0.24,
        flash: 16,
        phase: ctx.rng() * Math.PI * 2,
      });
      pops.push({ x: SPAWN_X[owner], y, text: "+" + def.label, color: def.color, t: 46 });
    }

    function update(dt) {
      if (over) return;
      elapsed += dt;
      for (let side = 0; side < 2; side++) gold[side] += incomeRate(side) * dt;
      updateUnits(dt);
      updateTowers(dt);
      updateEffects(dt);
      checkEnd();
      renderHud();
      syncControls();
      updateStatus();
    }

    function updateUnits(dt) {
      units.forEach((u) => {
        if (u.hp <= 0) return;
        u.flash = Math.max(0, u.flash - dt * 35);
        u.cd = Math.max(0, u.cd - dt);
        u.phase += dt * (u.speed * 0.18 + 4);
        const dir = u.owner === 0 ? 1 : -1;
        const enemyBaseX = BASE_X[1 - u.owner];
        const def = UNIT_DEFS[u.type];
        const atBase = u.owner === 0 ? u.x >= enemyBaseX - 46 : u.x <= enemyBaseX + 46;

        if (def.heal) {
          const ally = woundedAllyInLane(u, def.range + 14);
          if (ally && u.cd <= 0) {
            const amt = def.heal + armoryLvl[u.owner] * 3;
            ally.hp = Math.min(ally.maxHp, ally.hp + amt);
            ally.flash = 8;
            pops.push({ x: ally.x, y: ally.y - 22, text: "+" + amt, color: "#6ee7b7", t: 34 });
            u.cd = def.cd;
            ctx.sound("place");
          } else if (!atBase) {
            u.x += dir * u.speed * dt;
            u.y += (LANES[u.lane] - u.y) * Math.min(1, dt * 4);
          }
          return;
        }

        const enemy = closestEnemyInLane(u);
        if (enemy && Math.abs(enemy.x - u.x) <= def.range + 14) {
          if (u.cd <= 0) {
            attackUnit(u, enemy);
            u.cd = def.cd;
          }
        } else if (atBase) {
          if (u.cd <= 0) {
            const dmg = Math.round(u.dmg * (def.vsBase || 1));
            baseHp[1 - u.owner] = Math.max(0, baseHp[1 - u.owner] - dmg);
            pops.push({ x: enemyBaseX, y: LANES[u.lane] - 34, text: "-" + dmg, color: "#ff5d73", t: 44 });
            u.cd = def.cd;
            ctx.sound("shot");
          }
        } else {
          u.x += dir * u.speed * dt;
          const targetY = LANES[u.lane];
          u.y += (targetY - u.y) * Math.min(1, dt * 4);
        }
      });
      for (let i = units.length - 1; i >= 0; i--) {
        if (units[i].hp <= 0) units.splice(i, 1);
      }
    }

    function woundedAllyInLane(medic, range) {
      let best = null, bestPct = 1;
      units.forEach((o) => {
        if (o.owner !== medic.owner || o.lane !== medic.lane || o.hp <= 0) return;
        if (o.hp >= o.maxHp) return;
        if (Math.abs(o.x - medic.x) > range) return;
        const pct = o.hp / o.maxHp;
        if (pct < bestPct) { bestPct = pct; best = o; }
      });
      return best;
    }

    function attackUnit(attacker, target) {
      const def = UNIT_DEFS[attacker.type];
      damageUnit(target, attacker.dmg, attacker.owner, attacker.x, attacker.y);
      if (!def.splash) return;
      units.forEach((other) => {
        if (other === target || other.owner === attacker.owner || other.hp <= 0 || other.lane !== attacker.lane) return;
        if (dist(target.x, target.y, other.x, other.y) > def.splash) return;
        damageUnit(other, Math.round(attacker.dmg * 0.42), attacker.owner, attacker.x, attacker.y);
      });
    }

    function closestEnemyInLane(unit) {
      const dir = unit.owner === 0 ? 1 : -1;
      let best = null, bestD = 9999;
      units.forEach((other) => {
        if (other.owner === unit.owner || other.lane !== unit.lane || other.hp <= 0) return;
        const ahead = (other.x - unit.x) * dir;
        if (ahead < -8) return;
        if (ahead < bestD) { bestD = ahead; best = other; }
      });
      return best;
    }

    function damageUnit(unit, dmg, bySide, x, y) {
      const armor = UNIT_DEFS[unit.type].armor || 0;
      const dealt = Math.max(1, Math.round(dmg - armor));
      unit.hp -= dealt;
      unit.flash = 16;
      pops.push({ x: unit.x, y: unit.y - 20, text: "-" + dealt, color: "#ffd166", t: 32 });
      if (unit.hp <= 0) {
        const reward = UNIT_DEFS[unit.type].reward;
        gold[bySide] += reward;
        pops.push({ x, y: y - 28, text: "+" + reward + "g", color: "#6ee7b7", t: 38 });
        ctx.sound("capture");
      } else {
        ctx.sound("place");
      }
    }

    function updateTowers(dt) {
      for (let side = 0; side < 2; side++) {
        for (let lane = 0; lane < 3; lane++) {
          const tw = towers[side][lane];
          if (!tw) continue;
          tw.cd = Math.max(0, tw.cd - dt);
          tw.pulse = Math.max(0, tw.pulse - dt * 35);
          if (tw.cd > 0) continue;
          const target = towerTarget(side, lane, tw);
          if (!target) continue;
          const dmg = Math.round((9 + tw.lvl * 5) * (1 + armoryLvl[side] * 0.06 + arsenalLvl[side] * 0.1));
          tw.cd = Math.max(0.62, 1.24 - tw.lvl * 0.05);
          damageUnit(target, dmg, side, towerX(side), LANES[lane]);
          bullets.push({
            x1: towerX(side),
            y1: LANES[lane] - 54,
            x2: target.x,
            y2: target.y,
            color: side === 0 ? "#ff5d73" : "#4dd0e1",
            t: 18,
          });
        }
      }
    }

    function towerTarget(side, lane, tw) {
      const x = towerX(side);
      const y = LANES[lane] - 50;
      const range = 104 + tw.lvl * 14 + arsenalLvl[side] * 18;
      let best = null, bestD = 9999;
      units.forEach((u) => {
        if (u.owner === side || u.hp <= 0) return;
        const d = dist(x, y, u.x, u.y);
        if (d <= range && d < bestD) { best = u; bestD = d; }
      });
      return best;
    }

    function updateEffects(dt) {
      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].t -= dt * 60;
        if (bullets[i].t <= 0) bullets.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].t -= dt * 60;
        pops[i].y -= dt * 16;
        if (pops[i].t <= 0) pops.splice(i, 1);
      }
    }

    function checkEnd() {
      if (baseHp[0] > 0 && baseHp[1] > 0) return;
      over = true;
      ctx.setTurn(-1);
      if (baseHp[0] <= 0 && baseHp[1] <= 0) {
        ctx.setStatus(ctx.t("🤝 Hai nhà chính cùng sập - hòa!", "🤝 Both main bases collapsed — draw!"));
      } else {
        const winner = baseHp[0] <= 0 ? 1 : 0;
        ctx.incScore(winner);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} phá nhà chính và thắng!`, `🎉 Player ${winner + 1} destroyed the main base and wins!`));
      }
    }

    function renderHud() {
      hud.innerHTML = `
        ${playerHud(0)}
        <div class="bd-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : "Base Defense Duel"}</b>
          <span>${timeText()} · ${ctx.t(`Sức lính x${unitScale(0).toFixed(2)}`, `Unit power x${unitScale(0).toFixed(2)}`)}</span>
          <small>${last}</small>
        </div>
        ${playerHud(1)}
      `;
    }

    function playerHud(side) {
      const hpPct = Math.max(0, baseHp[side] / BASE_HP * 100);
      const towersBuilt = towers[side].filter(Boolean).length;
      return `
        <div class="bd-player p${side + 1} ${controlSide === side && !over ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${side + 1}`, `Player ${side + 1}`)}</span>
          <b>${Math.ceil(baseHp[side])}/${BASE_HP} HP</b>
          <em>${ctx.t(`${Math.floor(gold[side])} vàng · +${incomeRate(side).toFixed(1)}/s · ${towersBuilt}/3 tháp`, `${Math.floor(gold[side])} gold · +${incomeRate(side).toFixed(1)}/s · ${towersBuilt}/3 towers`)}</em>
          <i class="bd-hp"><i style="width:${hpPct}%"></i></i>
          <small>💰${incomeLvl[side]} ⚒️${armoryLvl[side]} 🛡️${fortifyLvl[side]} 👟${marchLvl[side]} 📡${arsenalLvl[side]}</small>
        </div>
      `;
    }

    function syncControls() {
      if (!root.isConnected) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (!ctx.isOnline) {
        sideBox.querySelectorAll(".bd-side-btn").forEach((btn) => {
          btn.classList.toggle("active", Number(btn.dataset.side) === controlSide);
        });
      }
      root.querySelectorAll(".bd-action").forEach((btn) => {
        const id = btn.dataset.action;
        const cost = actionCost(side, id, selectedLane[side]);
        const label = cost === Infinity ? ctx.t("không thể", "unavailable") : ctx.t(cost + " vàng", cost + " gold");
        btn.querySelector("em").textContent = label;
        btn.disabled = over || (ctx.isOnline && side !== ctx.mySeat) || cost === Infinity || gold[side] < cost;
      });
    }

    function updateStatus() {
      if (over) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (ctx.isOnline) {
        ctx.setStatus(ctx.t(`Bạn là Người chơi ${ctx.mySeat + 1}. Click lane trên map để chọn đường, rồi gửi lính, xây tháp và nâng cấp.`, `You are Player ${ctx.mySeat + 1}. Click a lane on the map to select it, then send units, build towers and upgrade.`));
      } else {
        ctx.setStatus(ctx.t(`Đang điều khiển Người chơi ${side + 1}. Click lane trên map để chọn đường, click nửa sân để đổi phe.`, `Controlling Player ${side + 1}. Click a lane to select it, click a half of the field to switch side.`));
      }
      ctx.setTurn(side);
    }

    function actionCost(side, id, lane) {
      if (UNIT_DEFS[id]) return UNIT_DEFS[id].cost;
      if (id === "tower") return towers[side][lane] ? Infinity : towerBuildCost(side);
      if (id === "upTower") {
        const tw = towers[side][lane];
        return !tw || tw.lvl >= MAX_TOWER_LVL ? Infinity : towerUpgradeCost(tw);
      }
      if (id === "econ") return econCost(side);
      if (id === "armory") return armoryCost(side);
      if (id === "fortify") return fortifyCost(side);
      if (id === "march") return marchCost(side);
      if (id === "arsenal") return arsenalCost(side);
      if (id === "repair") return baseHp[side] >= BASE_HP ? Infinity : repairCost(side);
      return Infinity;
    }

    function towerBuildCost(side) {
      return 82 + towers[side].filter(Boolean).length * 26;
    }

    function towerUpgradeCost(tw) {
      return 68 + tw.lvl * 48;
    }

    function econCost(side) {
      return 84 + incomeLvl[side] * 58;
    }

    function armoryCost(side) {
      return 112 + armoryLvl[side] * 78;
    }

    function fortifyCost(side) {
      return 96 + fortifyLvl[side] * 70;
    }

    function marchCost(side) {
      return 90 + marchLvl[side] * 66;
    }

    function arsenalCost(side) {
      return 104 + arsenalLvl[side] * 74;
    }

    function repairCost(side) {
      return 74 + Math.floor((BASE_HP - baseHp[side]) / 180) * 12;
    }

    function incomeRate(side) {
      return INCOME_BASE + incomeLvl[side] * 3.4 + elapsed / 120;
    }

    function unitScale(side) {
      return 1 + armoryLvl[side] * 0.12 + elapsed / 200 * SCALING;
    }

    function towerX(side) {
      return TOWER_X[side];
    }

    function timeText() {
      const m = Math.floor(elapsed / 60);
      const s = Math.floor(elapsed % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    }

    function draw() {
      drawBackground();
      drawBases();
      drawTowers();
      drawUnits();
      drawEffects();
      drawSelection();
    }

    function drawBackground() {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#10213c");
      sky.addColorStop(0.52, "#173251");
      sky.addColorStop(1, "#0b1726");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // sương mờ
      g.fillStyle = "rgba(255,255,255,0.045)";
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.ellipse(90 + i * 118, 70 + (i % 3) * 22, 46, 11, 0, 0, Math.PI * 2);
        g.fill();
      }

      // nền chiến trường giữa hai nhà
      g.fillStyle = "rgba(255,255,255,0.022)";
      roundRect(g, 58, LANES[0] - 44, W - 116, LANES[2] - LANES[0] + 88, 26);
      g.fill();

      LANES.forEach((y, lane) => {
        const sel = lane === selectedLane[controlSide];
        const road = g.createLinearGradient(0, y - 26, 0, y + 26);
        road.addColorStop(0, "rgba(255,255,255,0.11)");
        road.addColorStop(0.5, "rgba(255,255,255,0.17)");
        road.addColorStop(1, "rgba(0,0,0,0.12)");
        g.fillStyle = road;
        roundRect(g, 68, y - 26, W - 136, 52, 26);
        g.fill();
        g.strokeStyle = sel ? "rgba(255,209,102,0.6)" : "rgba(255,255,255,0.1)";
        g.lineWidth = sel ? 3 : 1.5;
        roundRect(g, 68, y - 26, W - 136, 52, 26);
        g.stroke();
        drawLaneFlow(y);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.font = "800 11px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText("LANE " + (lane + 1), W / 2, y + 4);
      });

      g.fillStyle = "rgba(0,0,0,0.2)";
      g.fillRect(0, H - 48, W, 48);
      g.fillStyle = "rgba(255,255,255,0.72)";
      g.font = "900 12px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText("BASE DEFENSE DUEL", W / 2, 28);
      g.textAlign = "left";
    }

    function drawLaneFlow(y) {
      const off = (elapsed * 26) % 40;
      g.lineCap = "round";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,93,115,0.22)";
      for (let x = 150 - off; x < W / 2 - 26; x += 40) {
        g.beginPath();
        g.moveTo(x - 7, y - 7); g.lineTo(x, y); g.lineTo(x - 7, y + 7);
        g.stroke();
      }
      g.strokeStyle = "rgba(77,208,225,0.22)";
      for (let x = W - 150 + off; x > W / 2 + 26; x -= 40) {
        g.beginPath();
        g.moveTo(x + 7, y - 7); g.lineTo(x, y); g.lineTo(x + 7, y + 7);
        g.stroke();
      }
    }

    function drawBases() {
      [0, 1].forEach((side) => {
        const x = BASE_X[side];
        const color = side === 0 ? "#ff5d73" : "#4dd0e1";
        const hpPct = Math.max(0, baseHp[side] / BASE_HP);
        g.save();
        g.translate(x, BASE_Y);
        g.fillStyle = "rgba(0,0,0,0.32)";
        g.beginPath();
        g.ellipse(0, 112, 54, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = side === 0 ? "#502b45" : "#224451";
        roundRect(g, -38, -64, 76, 142, 10);
        g.fill();
        g.fillStyle = color;
        roundRect(g, -30, -52, 60, 32, 8);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.12)";
        for (let i = -32; i <= 32; i += 32) g.fillRect(i - 5, -8, 10, 62);
        g.fillStyle = "#101422";
        g.font = "900 13px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText("P" + (side + 1), 0, -30);
        g.fillStyle = "rgba(0,0,0,0.42)";
        roundRect(g, -46, -86, 92, 9, 999);
        g.fill();
        g.fillStyle = hpPct > 0.32 ? "#6ee7b7" : "#ff5d73";
        roundRect(g, -46, -86, 92 * hpPct, 9, 999);
        g.fill();
        g.restore();
      });
    }

    function drawTowers() {
      [0, 1].forEach((side) => {
        LANES.forEach((y, lane) => {
          const x = towerX(side);
          const tw = towers[side][lane];
          const selected = controlSide === side && selectedLane[side] === lane;
          g.save();
          g.translate(x, y - 50);
          g.strokeStyle = selected ? "rgba(255,209,102,0.72)" : "rgba(255,255,255,0.18)";
          g.lineWidth = selected ? 3 : 1;
          g.setLineDash(tw ? [] : [6, 6]);
          roundRect(g, -24, -20, 48, 44, 8);
          g.stroke();
          g.setLineDash([]);
          if (tw) {
            const color = side === 0 ? "#ff5d73" : "#4dd0e1";
            g.fillStyle = "#2a3060";
            roundRect(g, -20, -18, 40, 40, 7);
            g.fill();
            g.fillStyle = color;
            g.beginPath();
            g.arc(0, -3, 13 + tw.lvl, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = "#101422";
            g.font = "900 10px Segoe UI, sans-serif";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText(String(tw.lvl), 0, -3);
            if (tw.pulse > 0) {
              g.strokeStyle = "rgba(255,209,102,0.45)";
              g.beginPath();
              g.arc(0, -3, 22 + tw.pulse * 0.6, 0, Math.PI * 2);
              g.stroke();
            }
          } else {
            g.fillStyle = "rgba(255,255,255,0.32)";
            g.font = "800 10px Segoe UI, sans-serif";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText("+", 0, 1);
          }
          g.restore();
          g.textBaseline = "alphabetic";
        });
      });
    }

    function drawUnits() {
      units.forEach((u) => {
        if (u.hp <= 0) return;
        const def = UNIT_DEFS[u.type];
        const sideColor = u.owner === 0 ? "#ff5d73" : "#4dd0e1";
        const dir = u.owner === 0 ? 1 : -1;
        const body = u.flash > 0 ? "#ffffff" : def.color;
        const walk = Math.sin(u.phase);
        const stride = Math.cos(u.phase);
        g.save();
        g.translate(u.x, u.y);
        g.fillStyle = "rgba(0,0,0,0.28)";
        const big = u.type === "brute" || u.type === "golem";
        g.beginPath();
        g.ellipse(0, 18, big ? 25 : 18, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.scale(dir, 1);
        drawUnitLegs(walk, stride, sideColor, big ? 1.18 : 1);
        if (u.type === "brute") drawBruteUnit(body, sideColor, walk);
        else if (u.type === "runner") drawRunnerUnit(body, sideColor, walk);
        else if (u.type === "shield") drawShieldUnit(body, sideColor, walk);
        else if (u.type === "archer") drawArcherUnit(body, sideColor, walk);
        else if (u.type === "bomber") drawBomberUnit(body, sideColor, walk);
        else if (u.type === "warlock") drawWarlockUnit(body, sideColor, walk);
        else if (u.type === "golem") drawGolemUnit(body, sideColor, walk);
        else if (u.type === "lancer") drawLancerUnit(body, sideColor, walk);
        else if (u.type === "siege") drawSiegeUnit(body, sideColor, walk);
        else if (u.type === "medic") drawMedicUnit(body, sideColor, walk);
        else drawGruntUnit(body, sideColor, walk);
        g.restore();

        const pct = Math.max(0, u.hp / u.maxHp);
        g.save();
        g.translate(u.x, u.y);
        g.fillStyle = "rgba(0,0,0,0.48)";
        roundRect(g, -18, -34, 36, 5, 999);
        g.fill();
        g.fillStyle = pct > 0.35 ? "#6ee7b7" : "#ff5d73";
        roundRect(g, -18, -34, 36 * pct, 5, 999);
        g.fill();
        g.restore();
      });
    }

    function drawUnitLegs(walk, stride, color, scale) {
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-7, 6);
      g.lineTo(-11 + walk * 5, 18 * scale);
      g.lineTo(-18 + walk * 6, 20 * scale);
      g.moveTo(7, 6);
      g.lineTo(12 - walk * 5, 18 * scale);
      g.lineTo(18 - walk * 6, 20 * scale);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-5, 7);
      g.lineTo(-5 + stride * 4, 16 * scale);
      g.moveTo(5, 7);
      g.lineTo(5 - stride * 4, 16 * scale);
      g.stroke();
    }

    function drawGruntUnit(body, sideColor, walk) {
      g.fillStyle = body;
      roundRect(g, -12, -18, 24, 25, 8);
      g.fill();
      g.fillStyle = sideColor;
      roundRect(g, -9, -26, 18, 12, 6);
      g.fill();
      g.fillStyle = "#101422";
      g.fillRect(-6, -22, 12, 3);
      g.strokeStyle = "#d8dee9";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(12, -5);
      g.lineTo(23, -13 + walk * 2);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.2)";
      roundRect(g, -18, -9, 9, 17, 4);
      g.fill();
    }

    function drawRunnerUnit(body, sideColor, walk) {
      g.save();
      g.rotate(-0.18);
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(-14, 9);
      g.quadraticCurveTo(-8, -18, 14, -12);
      g.quadraticCurveTo(20, -2, 8, 9);
      g.closePath();
      g.fill();
      g.strokeStyle = sideColor;
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(13, -17, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#f8fafc";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-13, -6);
      g.lineTo(-23, -10 - walk * 4);
      g.moveTo(8, -3);
      g.lineTo(21, 4 + walk * 2);
      g.stroke();
      g.restore();
    }

    function drawBruteUnit(body, sideColor, walk) {
      g.fillStyle = "#2a3060";
      roundRect(g, -19, -25, 38, 36, 10);
      g.fill();
      g.fillStyle = body;
      roundRect(g, -15, -20, 30, 29, 8);
      g.fill();
      g.fillStyle = sideColor;
      roundRect(g, -13, -33, 26, 16, 8);
      g.fill();
      g.fillStyle = "#101422";
      g.fillRect(-8, -27, 16, 4);
      g.strokeStyle = "rgba(255,255,255,0.5)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-18, -28);
      g.lineTo(-27, -36);
      g.moveTo(18, -28);
      g.lineTo(27, -36);
      g.stroke();
      g.strokeStyle = sideColor;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-19, -8);
      g.lineTo(-29, 3 + walk * 2);
      g.moveTo(19, -8);
      g.lineTo(29, 3 - walk * 2);
      g.stroke();
    }

    function drawShieldUnit(body, sideColor, walk) {
      g.fillStyle = body;
      roundRect(g, -12, -20, 24, 26, 8);
      g.fill();
      g.fillStyle = sideColor;
      roundRect(g, -9, -29, 18, 12, 6);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.3)";
      roundRect(g, -24, -18, 16, 30, 7);
      g.fill();
      g.strokeStyle = sideColor;
      g.lineWidth = 3;
      g.stroke();
      g.strokeStyle = "#d8dee9";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(11, -4);
      g.lineTo(23, -10 + walk * 2);
      g.stroke();
    }

    function drawArcherUnit(body, sideColor, walk) {
      g.fillStyle = body;
      roundRect(g, -12, -18, 24, 24, 8);
      g.fill();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(0, -24, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#f2d7a2";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(18, -7, 12, -1.1, 1.1);
      g.stroke();
      g.strokeStyle = sideColor;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(11, -7);
      g.lineTo(31, -10 + walk * 2);
      g.stroke();
    }

    function drawBomberUnit(body, sideColor, walk) {
      g.fillStyle = body;
      roundRect(g, -13, -19, 26, 25, 8);
      g.fill();
      g.fillStyle = sideColor;
      roundRect(g, -10, -29, 20, 12, 6);
      g.fill();
      g.fillStyle = "#2a1f1d";
      g.beginPath();
      g.arc(19, -6, 11, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#ffcf8a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(24, -15);
      g.quadraticCurveTo(31, -24 + walk * 2, 35, -15);
      g.stroke();
      g.fillStyle = "#ffb15c";
      g.beginPath();
      g.arc(35, -15, 4, 0, Math.PI * 2);
      g.fill();
    }

    function drawWarlockUnit(body, sideColor, walk) {
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(0, -31);
      g.lineTo(19, 12);
      g.lineTo(-19, 12);
      g.closePath();
      g.fill();
      g.strokeStyle = sideColor;
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = "#101422";
      g.beginPath();
      g.arc(0, -17, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#c9a98a";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(17, -21);
      g.lineTo(28, 13);
      g.stroke();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(17, -21, 5 + Math.max(0, walk) * 1.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.beginPath();
      g.arc(-7, -2, 4, 0, Math.PI * 2);
      g.arc(6, 5, 3, 0, Math.PI * 2);
      g.fill();
    }

    function drawGolemUnit(body, sideColor, walk) {
      g.fillStyle = "#505b50";
      roundRect(g, -22, -25, 44, 36, 10);
      g.fill();
      g.fillStyle = body;
      roundRect(g, -17, -20, 34, 28, 8);
      g.fill();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(0, -26, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#101422";
      g.fillRect(-8, -29, 16, 4);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(-17, -10);
      g.lineTo(-31, 5 + walk * 2);
      g.moveTo(17, -10);
      g.lineTo(31, 5 - walk * 2);
      g.stroke();
    }

    function drawLancerUnit(body, sideColor, walk) {
      // ngựa
      g.fillStyle = "#6b4a3a";
      roundRect(g, -18, -6, 32, 16, 8);
      g.fill();
      g.fillStyle = "#5a3d30";
      g.beginPath();
      g.moveTo(12, -4);
      g.quadraticCurveTo(22, -10, 20, 2);
      g.lineTo(12, 4);
      g.closePath();
      g.fill();
      // kỵ sĩ
      g.fillStyle = body;
      roundRect(g, -8, -22, 16, 18, 6);
      g.fill();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(0, -26, 6, 0, Math.PI * 2);
      g.fill();
      // giáo
      g.strokeStyle = "#e6e0cf";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(2, -18);
      g.lineTo(34, -22 + walk * 2);
      g.stroke();
      g.fillStyle = sideColor;
      g.beginPath();
      g.moveTo(34, -22 + walk * 2);
      g.lineTo(28, -27 + walk * 2);
      g.lineTo(29, -18 + walk * 2);
      g.closePath();
      g.fill();
    }

    function drawSiegeUnit(body, sideColor, walk) {
      // bệ + bánh xe
      g.fillStyle = "#3a3320";
      roundRect(g, -16, -6, 30, 14, 5);
      g.fill();
      g.fillStyle = "#1c1a12";
      g.beginPath();
      g.arc(-9, 9, 7, 0, Math.PI * 2);
      g.arc(9, 9, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(-9, 9, 3, 0, Math.PI * 2);
      g.arc(9, 9, 3, 0, Math.PI * 2);
      g.fill();
      // nòng pháo
      g.save();
      g.rotate(-0.28);
      g.fillStyle = body;
      roundRect(g, -8, -20, 38, 13, 6);
      g.fill();
      g.fillStyle = "#11141d";
      g.beginPath();
      g.arc(30, -13, 6, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillStyle = sideColor;
      g.beginPath();
      g.arc(-6, -14, 7, 0, Math.PI * 2);
      g.fill();
    }

    function drawMedicUnit(body, sideColor, walk) {
      g.fillStyle = body;
      roundRect(g, -12, -18, 24, 24, 8);
      g.fill();
      g.fillStyle = sideColor;
      roundRect(g, -9, -28, 18, 12, 6);
      g.fill();
      // chữ thập đỏ trắng
      g.fillStyle = "#ffffff";
      roundRect(g, -7, -12, 14, 14, 3);
      g.fill();
      g.fillStyle = "#e23a3a";
      g.fillRect(-2, -11, 4, 12);
      g.fillRect(-6, -7, 12, 4);
      // túi cứu thương
      g.fillStyle = "#d8dee9";
      roundRect(g, 11, -6, 10, 12, 3);
      g.fill();
      g.fillStyle = "#e23a3a";
      g.fillRect(14, -2 + walk, 4, 1.6);
    }

    function drawEffects() {
      bullets.forEach((b) => {
        g.strokeStyle = b.color;
        g.globalAlpha = Math.max(0, b.t / 18);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(b.x1, b.y1);
        g.lineTo(b.x2, b.y2);
        g.stroke();
        g.globalAlpha = 1;
      });
      pops.forEach((p) => {
        g.globalAlpha = Math.max(0, p.t / 46);
        g.fillStyle = p.color;
        g.font = "800 12px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, p.x, p.y);
        g.globalAlpha = 1;
      });
    }

    function drawSelection() {
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      const lane = selectedLane[side];
      const y = LANES[lane];
      g.strokeStyle = "rgba(255,209,102,0.55)";
      g.lineWidth = 2;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(122, y);
      g.lineTo(W - 122, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255,209,102,0.9)";
      g.font = "900 12px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(ctx.t(`Đang chọn P${side + 1} · Lane ${lane + 1}`, `Selecting P${side + 1} · Lane ${lane + 1}`), W / 2, y - 36);
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

    function dist(x1, y1, x2, y2) {
      return Math.hypot(x1 - x2, y1 - y2);
    }

    function clamp(n, min, max) {
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    }

    function loop(ts) {
      if (!lastTime) lastTime = ts;
      const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0);
      lastTime = ts;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        cancelAnimationFrame(raf);
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    renderStaticControls();
    ctx.setTurn(controlSide);
    renderHud();
    syncControls();
    updateStatus();
    draw();
    raf = requestAnimationFrame(loop);
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "basedefenseduel",
    name: "Base Defense Duel",
    emoji: "🏰",
    description: "Thủ nhà bằng tháp, gửi 11 loại lính (kỵ binh, pháo binh, y tá hồi máu...) phá nhà đối thủ. Nâng cấp kinh tế, giáp, tốc độ, tháp và sức mạnh.",
    onlineReady: true,
    options: [
      {
        id: "hp",
        label: "Máu nhà chính",
        default: 560,
        choices: [
          { value: 460, label: "460 (nhanh)" },
          { value: 560, label: "560" },
          { value: 760, label: "760 (lâu)" },
        ],
      },
      {
        id: "gold",
        label: "Vàng ban đầu",
        default: 155,
        choices: [
          { value: 120, label: "120 (chậm)" },
          { value: 155, label: "155" },
          { value: 210, label: "210 (nhanh)" },
        ],
      },
      {
        id: "pace",
        label: "Nhịp vàng",
        default: "normal",
        choices: [
          { value: "slow", label: "Chậm" },
          { value: "normal", label: "Vừa" },
          { value: "fast", label: "Nhanh" },
        ],
      },
      {
        id: "scaling",
        label: "Sức lính late game",
        default: "normal",
        choices: [
          { value: "soft", label: "Nhẹ" },
          { value: "normal", label: "Vừa" },
          { value: "hard", label: "Mạnh" },
        ],
      },
    ],
    howTo: [
      "Hai bên có nhà chính ở hai đầu bản đồ. Mục tiêu là phá nhà chính đối thủ trước.",
      "Chọn lane 1, 2 hoặc 3 rồi gửi lính sang nhà đối thủ. Có 11 loại: 🪖 tân binh, 🏃 trinh sát, 🐎 kỵ binh (lao cực nhanh), 🛡️ vệ binh, 🏹 cung thủ, 🚀 pháo binh (bắn xa, phá nhà mạnh), 🪓 chiến binh, 💣 công binh (nổ lan), 🧙 pháp sư, 💉 y tá (hồi máu đồng đội), 🗿 golem.",
      "Y tá không đánh mà đi theo hồi máu cho lính cùng lane đang bị thương — kết hợp với lính trâu để giữ mũi tấn công.",
      "Xây tháp 🗼 trên lane để bắn lính địch. Tháp hỗ trợ phòng thủ.",
      "Nâng cấp: 💰 Kinh tế (+vàng/giây), ⚒️ Lò rèn (+sát thương), 🛡️ Giáp trận (+máu lính), 👟 Hành quân (+tốc độ lính), 📡 Khí tài (+tầm & sát thương tháp).",
      "Sửa nhà 🔧 dùng vàng để hồi máu nhà chính khi bị ép.",
      "Càng về sau lính càng mạnh. Nhịp đấu nhanh nên hãy ra quân và nâng cấp liên tục.",
      "Chơi chung máy: click nửa sân hoặc nút P1/P2 để đổi phe. Chơi online: mỗi người điều khiển phe của mình.",
    ],
    create,
  });
})();
