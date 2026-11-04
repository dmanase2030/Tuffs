/* Robot Factory War - xay day chuyen, lap module robot va tu dong dua ra tran. */
(function () {
  const W = 1040;
  const H = 590;
  const LANES = [188, 292, 396];
  const BASE_X = [92, W - 92];
  const SPAWN_X = [178, W - 178];

  const GROUPS = [
    { id: "head", label: "Đầu", title: "Đầu robot" },
    { id: "body", label: "Thân", title: "Thân máy" },
    { id: "weapon", label: "Vũ khí", title: "Vũ khí" },
    { id: "legs", label: "Chân", title: "Chân / bánh" },
  ];

  const MODULES = {
    head: {
      core: { label: "Lõi cân bằng", short: "CORE", hint: "rẻ, ổn định", cost: 8, hp: 8, dmg: 2, build: 0.1 },
      sensor: { label: "Đầu radar", short: "RAD", hint: "tầm xa", cost: 20, range: 34, dmg: 1, build: 0.25 },
      medic: { label: "Đầu sửa chữa", short: "FIX", hint: "tự hồi máu", cost: 26, hp: 14, regen: 2.4, build: 0.35 },
      overclock: { label: "Đầu tăng áp", short: "OC", hint: "bắn nhanh", cost: 24, dmg: 4, cd: -0.18, build: 0.25 },
    },
    body: {
      light: { label: "Khung nhẹ", short: "LT", hint: "nhanh, rẻ", cost: 20, hp: 62, speed: 5, build: 0.2 },
      plated: { label: "Giáp thép", short: "PLT", hint: "cân bằng", cost: 36, hp: 108, armor: 2, build: 0.55 },
      fortress: { label: "Thân pháo đài", short: "HVY", hint: "rất trâu", cost: 58, hp: 172, armor: 5, speed: -6, build: 0.9 },
      battery: { label: "Thân pin", short: "BAT", hint: "sát thương", cost: 42, hp: 82, dmg: 8, build: 0.55 },
    },
    weapon: {
      claw: { label: "Càng kẹp", short: "CLW", hint: "cận chiến", cost: 18, dmg: 13, range: 20, cd: 0.62, build: 0.25 },
      laser: { label: "Súng laser", short: "LSR", hint: "bắn xa", cost: 38, dmg: 20, range: 122, cd: 0.82, build: 0.55 },
      rocket: { label: "Ống rocket", short: "RKT", hint: "nổ lan", cost: 52, dmg: 28, range: 96, cd: 1.05, splash: 42, build: 0.8 },
      saw: { label: "Lưỡi cưa", short: "SAW", hint: "cận chiến nhanh", cost: 44, dmg: 25, range: 26, cd: 0.44, build: 0.58 },
    },
    legs: {
      wheels: { label: "Bánh xe", short: "WHL", hint: "tốc độ", cost: 16, speed: 42, build: 0.1 },
      tracks: { label: "Xích sắt", short: "TRK", hint: "giáp thêm", cost: 26, speed: 30, armor: 1, hp: 18, build: 0.3 },
      booster: { label: "Chân phản lực", short: "BST", hint: "áp sát nhanh", cost: 32, speed: 56, hp: -8, build: 0.28 },
      crawler: { label: "Chân nhện", short: "CRW", hint: "vừa trâu", cost: 30, speed: 25, hp: 36, build: 0.38 },
    },
  };

  const DEFAULT_BLUEPRINT = {
    head: "core",
    body: "light",
    weapon: "claw",
    legs: "wheels",
  };

  function create(ctx) {
    const o = ctx.options || {};
    const pace = o.pace || "fast";
    // he so nhip do: cang lon cang nhanh
    const PACE = pace === "blitz" ? 1.7 : pace === "normal" ? 1.0 : 1.32;
    const SPD = pace === "blitz" ? 1.4 : pace === "normal" ? 1.0 : 1.2;
    const BASE_HP = Math.round(760 * (pace === "blitz" ? 0.6 : pace === "normal" ? 0.94 : 0.76));
    // overdrive
    const OD_DUR = 6;      // giay tang toc
    const OD_CD = 20;      // giay hoi chieu
    const OD_COST = 70;
    const odUntil = [0, 0];
    const odReady = [0, 0];

    const baseHp = [BASE_HP, BASE_HP];
    const scrap = [190, 190];
    const tech = [0, 0];
    const line = [0, 0];
    const progress = [0.15, 0.15];
    const paused = [false, false];
    const selectedLane = [1, 1];
    const blueprint = [
      { ...DEFAULT_BLUEPRINT },
      { ...DEFAULT_BLUEPRINT },
    ];
    const robots = [];
    const shots = [];
    const pops = [];

    let controlSide = ctx.isOnline ? ctx.mySeat : 0;
    let elapsed = 0;
    let over = false;
    let lastTime = 0;
    let raf = null;
    let last = ctx.t("Chọn module để lắp robot, dây chuyền sẽ tự động sản xuất khi đủ phế liệu.", "Pick modules to build your robot; the line auto-produces when there's enough scrap.");
    // bản dịch nhãn nhóm & module (GROUPS/MODULES là hằng module-level)
    const GROUP_LABEL_EN = { head: "Head", body: "Body", weapon: "Weapon", legs: "Legs" };
    const GROUP_TITLE_EN = { head: "Robot head", body: "Chassis", weapon: "Weapon", legs: "Legs / wheels" };
    const MOD_LABEL_EN = {
      core: "Balance core", sensor: "Radar head", medic: "Repair head", overclock: "Overclock head",
      light: "Light frame", plated: "Steel armor", fortress: "Fortress body", battery: "Battery body",
      claw: "Claw", laser: "Laser gun", rocket: "Rocket pod", saw: "Saw blade",
      wheels: "Wheels", tracks: "Tracks", booster: "Jet legs", crawler: "Spider legs",
    };
    const MOD_HINT_EN = {
      core: "cheap, stable", sensor: "long range", medic: "self-heal", overclock: "fast fire",
      light: "fast, cheap", plated: "balanced", fortress: "very tanky", battery: "high damage",
      claw: "melee", laser: "long range", rocket: "splash", saw: "fast melee",
      wheels: "speed", tracks: "extra armor", booster: "rush in", crawler: "tanky-ish",
    };
    const groupLabel = (id) => ctx.t(GROUPS.find((x) => x.id === id).label, GROUP_LABEL_EN[id]);
    const groupTitle = (id) => ctx.t(GROUPS.find((x) => x.id === id).title, GROUP_TITLE_EN[id]);
    const modLabel = (gid, mid) => ctx.t(MODULES[gid][mid].label, MOD_LABEL_EN[mid] || MODULES[gid][mid].label);
    const modHint = (gid, mid) => ctx.t(MODULES[gid][mid].hint, MOD_HINT_EN[mid] || MODULES[gid][mid].hint);

    const root = document.createElement("div");
    root.className = "rf-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "rf-hud";
    root.appendChild(hud);

    const arena = document.createElement("div");
    arena.className = "rf-arena";
    root.appendChild(arena);

    const modulePanel = document.createElement("div");
    modulePanel.className = "rf-panel rf-module-panel";
    modulePanel.innerHTML = `
      <div class="rf-panel-head">
        <b>${ctx.t("Thiết kế robot", "Robot design")}</b>
        <span>${ctx.t("Chọn đầu, thân, vũ khí và chân", "Pick head, body, weapon and legs")}</span>
      </div>
      <div class="rf-current"></div>
      <button class="btn small rf-pause-btn" type="button"></button>
      <div class="rf-module-list"></div>
    `;
    arena.appendChild(modulePanel);

    const center = document.createElement("div");
    center.className = "rf-center";
    arena.appendChild(center);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "rf-canvas-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "rf-canvas";
    canvasWrap.appendChild(canvas);
    center.appendChild(canvasWrap);
    const g = canvas.getContext("2d");

    const controls = document.createElement("div");
    controls.className = "rf-controls";
    controls.innerHTML = `<div class="rf-sidebox"></div>`;
    center.appendChild(controls);

    const factoryPanel = document.createElement("div");
    factoryPanel.className = "rf-panel rf-factory-panel";
    factoryPanel.innerHTML = `
      <div class="rf-panel-head">
        <b>${ctx.t("Dây chuyền", "Assembly line")}</b>
        <span>${ctx.t("Tự động xuất xưởng robot", "Auto-produces robots")}</span>
      </div>
      <div class="rf-preview"></div>
      <div class="rf-action-list"></div>
    `;
    arena.appendChild(factoryPanel);

    const currentBox = modulePanel.querySelector(".rf-current");
    const pauseBtn = modulePanel.querySelector(".rf-pause-btn");
    const moduleBox = modulePanel.querySelector(".rf-module-list");
    const sideBox = controls.querySelector(".rf-sidebox");
    const previewBox = factoryPanel.querySelector(".rf-preview");
    const actionBox = factoryPanel.querySelector(".rf-action-list");

    function renderStaticControls() {
      sideBox.innerHTML = "";
      if (ctx.isOnline) {
        const label = document.createElement("div");
        label.className = "rf-online-side";
        label.innerHTML = `<b>${ctx.t(`Bạn: P${ctx.mySeat + 1}`, `You: P${ctx.mySeat + 1}`)}</b><span>${ctx.mySeat === 0 ? ctx.t("nhà máy đỏ", "red factory") : ctx.t("nhà máy xanh", "blue factory")}</span>`;
        sideBox.appendChild(label);
      } else {
        [0, 1].forEach((side) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn small rf-side-btn";
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
      pauseBtn.addEventListener("click", () => submitAction("pause"));

      moduleBox.innerHTML = "";
      GROUPS.forEach((group) => {
        const title = document.createElement("div");
        title.className = "rf-group-title";
        title.textContent = groupTitle(group.id);
        moduleBox.appendChild(title);
        const grid = document.createElement("div");
        grid.className = "rf-module-grid";
        Object.entries(MODULES[group.id]).forEach(([id, mod]) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn small rf-module-btn";
          btn.dataset.group = group.id;
          btn.dataset.module = id;
          btn.innerHTML = `<span>${mod.short}</span><b>${modLabel(group.id, id)}</b><small>${modHint(group.id, id)}</small>`;
          btn.addEventListener("click", () => submitAction("module", { group: group.id, module: id }));
          grid.appendChild(btn);
        });
        moduleBox.appendChild(grid);
      });

      actionBox.innerHTML = "";
      [
        { id: "overdrive", icon: "⚡", label: ctx.t("Overdrive", "Overdrive"), hint: ctx.t("tăng tốc & sát thương robot", "robot speed & damage boost") },
        { id: "rush", icon: "FAST", label: ctx.t("Tăng ca", "Rush"), hint: ctx.t("+45% tiến độ", "+45% progress") },
        { id: "line", icon: "LINE", label: ctx.t("Nâng dây chuyền", "Upgrade line"), hint: ctx.t("sản xuất nhanh", "faster production") },
        { id: "tech", icon: "TECH", label: ctx.t("Nâng công nghệ", "Upgrade tech"), hint: ctx.t("robot mạnh hơn", "stronger robots") },
        { id: "repair", icon: "FIX", label: ctx.t("Sửa nhà máy", "Repair factory"), hint: ctx.t("+120 HP", "+120 HP") },
      ].forEach((a) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn small rf-action";
        btn.dataset.action = a.id;
        btn.innerHTML = `<span>${a.icon}</span><b>${a.label}</b><small>${a.hint}</small><em></em>`;
        btn.addEventListener("click", () => submitAction(a.id));
        actionBox.appendChild(btn);
      });
    }

    canvas.addEventListener("click", (e) => {
      if (over) return;
      const p = pointerPos(e);
      const lane = nearestLane(p.y);
      if (!ctx.isOnline) controlSide = p.x < W / 2 ? 0 : 1;
      if (lane !== -1) submitAction("lane", { lane });
      else {
        ctx.setTurn(ctx.isOnline ? ctx.mySeat : controlSide);
        syncControls();
        draw();
      }
    });

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function nearestLane(y) {
      let best = -1;
      let bestD = 999;
      LANES.forEach((ly, i) => {
        const d = Math.abs(y - ly);
        if (d < bestD) { best = i; bestD = d; }
      });
      return bestD <= 48 ? best : -1;
    }

    function submitAction(action, data = {}) {
      if (over) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (ctx.isOnline && side !== ctx.mySeat) return;
      const cmd = { kind: "rf", action, ...data };
      if (applyCommand(cmd, false) && ctx.isOnline) ctx.sendMove(cmd);
    }

    function applyMove(move, fromRemote) {
      if (!move || move.kind !== "rf") return;
      applyCommand(move, fromRemote);
    }

    function applyCommand(cmd, fromRemote) {
      if (over) return false;
      const side = ctx.isOnline
        ? (fromRemote ? 1 - ctx.mySeat : ctx.mySeat)
        : controlSide;
      let ok = false;

      if (cmd.action === "lane") {
        selectedLane[side] = clamp(Number(cmd.lane), 0, LANES.length - 1);
        ok = true;
        last = ctx.t(`P${side + 1} chuyển dây chuyền sang Lane ${selectedLane[side] + 1}.`, `P${side + 1} switched the line to Lane ${selectedLane[side] + 1}.`);
      } else if (cmd.action === "module") {
        const group = String(cmd.group || "");
        const id = String(cmd.module || "");
        if (MODULES[group] && MODULES[group][id]) {
          blueprint[side][group] = id;
          ok = true;
          last = ctx.t(`P${side + 1} lắp ${MODULES[group][id].label}.`, `P${side + 1} installed ${modLabel(group, id)}.`);
          ctx.sound("select");
        }
      } else if (cmd.action === "pause") {
        paused[side] = !paused[side];
        ok = true;
        last = paused[side]
          ? ctx.t(`P${side + 1} dừng sản xuất để giữ phế liệu.`, `P${side + 1} paused production to save scrap.`)
          : ctx.t(`P${side + 1} chạy lại dây chuyền sản xuất.`, `P${side + 1} resumed the production line.`);
        ctx.sound("select");
      } else if (cmd.action === "overdrive") {
        if (elapsed >= odReady[side] && pay(side, OD_COST)) {
          odUntil[side] = elapsed + OD_DUR;
          odReady[side] = elapsed + OD_CD;
          ok = true;
          last = ctx.t(`⚡ P${side + 1} kích hoạt Overdrive - robot tăng tốc & sát thương!`, `⚡ P${side + 1} activated Overdrive — robots gain speed & damage!`);
          pops.push({ x: BASE_X[side], y: LANES[1] - 110, text: "OVERDRIVE!", color: sideColor(side), t: 50 });
          ctx.sound("win");
        }
      } else if (cmd.action === "rush") {
        const cost = actionCost(side, "rush");
        if (pay(side, cost)) {
          progress[side] = Math.min(1.15, progress[side] + 0.45);
          ok = true;
          last = ctx.t(`P${side + 1} tăng ca dây chuyền.`, `P${side + 1} rushed the assembly line.`);
          ctx.sound("place");
        }
      } else if (cmd.action === "line") {
        const cost = actionCost(side, "line");
        if (pay(side, cost)) {
          line[side]++;
          ok = true;
          last = ctx.t(`P${side + 1} nâng cấp dây chuyền lên cấp ${line[side]}.`, `P${side + 1} upgraded the line to level ${line[side]}.`);
          ctx.sound("capture");
        }
      } else if (cmd.action === "tech") {
        const cost = actionCost(side, "tech");
        if (pay(side, cost)) {
          tech[side]++;
          ok = true;
          last = ctx.t(`P${side + 1} nâng công nghệ lên cấp ${tech[side]}.`, `P${side + 1} upgraded tech to level ${tech[side]}.`);
          ctx.sound("capture");
        }
      } else if (cmd.action === "repair") {
        const cost = actionCost(side, "repair");
        if (cost !== Infinity && pay(side, cost)) {
          baseHp[side] = Math.min(BASE_HP, baseHp[side] + 120);
          ok = true;
          last = ctx.t(`P${side + 1} sửa nhà máy.`, `P${side + 1} repaired the factory.`);
          ctx.sound("place");
        }
      }

      if (ok) {
        renderHud();
        syncControls();
        updateStatus();
        draw();
      }
      return ok;
    }

    function pay(side, cost) {
      if (cost === Infinity || scrap[side] < cost) return false;
      scrap[side] -= cost;
      return true;
    }

    function update(dt) {
      if (over) return;
      elapsed += dt;
      for (let side = 0; side < 2; side++) {
        scrap[side] += incomeRate(side) * dt;
        updateFactory(side, dt);
      }
      updateRobots(dt);
      updateEffects(dt);
      checkEnd();
      renderHud();
      syncControls();
    }

    function updateFactory(side, dt) {
      if (paused[side]) return;
      const stats = blueprintStats(side);
      progress[side] += dt / buildTime(side, stats);
      if (progress[side] < 1) return;
      if (scrap[side] >= stats.cost) {
        scrap[side] -= stats.cost;
        progress[side] -= 1;
        spawnRobot(side, stats);
      } else {
        progress[side] = 0.99;
      }
    }

    function spawnRobot(side, stats) {
      const lane = selectedLane[side];
      const dir = side === 0 ? 1 : -1;
      const y = LANES[lane] + ((robots.length % 3) - 1) * 4;
      robots.push({
        owner: side,
        lane,
        x: SPAWN_X[side],
        y,
        dir,
        hp: stats.hp,
        maxHp: stats.hp,
        dmg: stats.dmg,
        range: stats.range,
        speed: stats.speed,
        cdBase: stats.cd,
        cd: 0.25,
        armor: stats.armor,
        splash: stats.splash,
        regen: stats.regen,
        cost: stats.cost,
        modules: { ...blueprint[side] },
        step: 0,
        flash: 0,
      });
      last = ctx.t(`P${side + 1} xuất xưởng robot ${moduleShort(side)} ở Lane ${lane + 1}.`, `P${side + 1} rolled out robot ${moduleShort(side)} on Lane ${lane + 1}.`);
      pops.push({ x: SPAWN_X[side], y: LANES[lane] - 46, text: "ROBOT", color: sideColor(side), t: 42 });
      ctx.sound("place");
    }

    function updateRobots(dt) {
      for (let i = robots.length - 1; i >= 0; i--) {
        const r = robots[i];
        r.cd = Math.max(0, r.cd - dt);
        r.flash = Math.max(0, r.flash - dt * 30);
        r.step += dt * r.speed;
        if (r.regen && r.hp > 0) r.hp = Math.min(r.maxHp, r.hp + r.regen * dt);

        const enemy = closestEnemy(r);
        if (enemy && Math.abs(enemy.x - r.x) <= r.range + 18) {
          if (r.cd <= 0) attackRobot(r, enemy);
        } else if (canHitBase(r)) {
          if (r.cd <= 0) attackBase(r);
        } else {
          const blocker = friendlyBlocker(r);
          const spd = r.speed * (odActive(r.owner) ? 1.5 : 1);
          if (!blocker) r.x += r.dir * spd * dt;
        }

        if (r.hp <= 0) robots.splice(i, 1);
      }
    }

    function closestEnemy(r) {
      let best = null;
      let bestD = 9999;
      robots.forEach((other) => {
        if (other.owner === r.owner || other.hp <= 0 || other.lane !== r.lane) return;
        const ahead = (other.x - r.x) * r.dir;
        if (ahead < -8) return;
        const d = Math.abs(other.x - r.x);
        if (d < bestD) { best = other; bestD = d; }
      });
      return best;
    }

    function friendlyBlocker(r) {
      return robots.some((other) => (
        other !== r &&
        other.owner === r.owner &&
        other.lane === r.lane &&
        (other.x - r.x) * r.dir > 0 &&
        Math.abs(other.x - r.x) < 36
      ));
    }

    function canHitBase(r) {
      const targetX = BASE_X[1 - r.owner];
      return Math.abs(targetX - r.x) <= r.range + 22;
    }

    function attackRobot(attacker, target) {
      const od = odActive(attacker.owner);
      attacker.cd = attacker.cdBase * (od ? 0.62 : 1);
      const dmg = Math.round(attacker.dmg * (od ? 1.4 : 1));
      damageRobot(target, dmg, attacker.owner, attacker.x, attacker.y);
      shots.push({
        x1: attacker.x,
        y1: attacker.y - 20,
        x2: target.x,
        y2: target.y - 20,
        color: sideColor(attacker.owner),
        t: 16,
        boom: !!attacker.splash,
      });
      if (attacker.splash) {
        robots.forEach((other) => {
          if (other === target || other.owner === attacker.owner || other.hp <= 0 || other.lane !== attacker.lane) return;
          if (dist(target.x, target.y, other.x, other.y) <= attacker.splash) {
            damageRobot(other, Math.round(dmg * 0.45), attacker.owner, attacker.x, attacker.y);
          }
        });
      }
    }

    function damageRobot(robot, dmg, bySide, x, y) {
      const dealt = Math.max(1, Math.round(dmg - robot.armor));
      robot.hp -= dealt;
      robot.flash = 12;
      pops.push({ x: robot.x, y: robot.y - 42, text: "-" + dealt, color: "#ffd166", t: 30 });
      if (robot.hp <= 0) {
        const reward = Math.max(8, Math.round(robot.cost * 0.18));
        scrap[bySide] += reward;
        pops.push({ x, y: y - 48, text: "+" + reward, color: "#6ee7b7", t: 34 });
        ctx.sound("capture");
      }
    }

    function attackBase(r) {
      const od = odActive(r.owner);
      r.cd = r.cdBase * (od ? 0.62 : 1);
      const target = 1 - r.owner;
      const dmg = Math.max(6, Math.round(r.dmg * 0.9 * (od ? 1.4 : 1)));
      baseHp[target] -= dmg;
      shots.push({
        x1: r.x,
        y1: r.y - 20,
        x2: BASE_X[target],
        y2: LANES[1] - 40,
        color: sideColor(r.owner),
        t: 16,
        boom: true,
      });
      pops.push({ x: BASE_X[target], y: LANES[1] - 86, text: "-" + dmg, color: "#ff8a8a", t: 34 });
      ctx.sound("capture");
    }

    function updateEffects(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        shots[i].t -= dt * 60;
        if (shots[i].t <= 0) shots.splice(i, 1);
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].t -= dt * 60;
        pops[i].y -= dt * 18;
        if (pops[i].t <= 0) pops.splice(i, 1);
      }
    }

    function checkEnd() {
      if (baseHp[0] > 0 && baseHp[1] > 0) return;
      over = true;
      robots.forEach((r) => { r.hp = Math.max(0, r.hp); });
      ctx.setTurn(-1);
      if (baseHp[0] <= 0 && baseHp[1] <= 0) {
        ctx.setStatus(ctx.t("🤝 Hai nhà máy cùng sập - hòa!", "🤝 Both factories collapsed — draw!"));
        return;
      }
      const winner = baseHp[0] <= 0 ? 1 : 0;
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} phá nhà máy đối thủ và thắng!`, `🎉 Player ${winner + 1} destroyed the enemy factory and wins!`));
    }

    function blueprintStats(side) {
      const bp = blueprint[side];
      const mods = GROUPS.map((g) => MODULES[g.id][bp[g.id]]);
      const stats = {
        hp: 34,
        dmg: 5,
        range: 22,
        speed: 0,
        cd: 0.15,
        armor: 0,
        cost: 16,
        build: 3.6,
        splash: 0,
        regen: 0,
      };
      mods.forEach((m) => {
        stats.hp += m.hp || 0;
        stats.dmg += m.dmg || 0;
        stats.range += m.range || 0;
        stats.speed += m.speed || 0;
        stats.cd += m.cd || 0;
        stats.armor += m.armor || 0;
        stats.cost += m.cost || 0;
        stats.build += m.build || 0;
        stats.splash = Math.max(stats.splash, m.splash || 0);
        stats.regen += m.regen || 0;
      });
      const scale = factoryScale(side);
      stats.hp = Math.max(40, Math.round(stats.hp * scale));
      stats.dmg = Math.max(4, Math.round(stats.dmg * (1 + tech[side] * 0.1 + elapsed / 560 * 0.1)));
      stats.range = Math.max(24, Math.round(stats.range));
      stats.speed = Math.max(26, Math.round(stats.speed * 1.22 * SPD));
      stats.cd = Math.max(0.32, stats.cd);
      stats.cost = Math.round(stats.cost);
      stats.armor = Math.max(0, stats.armor);
      return stats;
    }

    function factoryScale(side) {
      return 1 + tech[side] * 0.12 + elapsed / 360 * 0.2;
    }

    function buildTime(side, stats = blueprintStats(side)) {
      const base = Math.max(1.6, stats.build - line[side] * 0.4 - elapsed / 500 * 0.26);
      return base / PACE;
    }

    function incomeRate(side) {
      return (10.5 + line[side] * 0.7 + tech[side] * 1.6 + elapsed / 190) * PACE;
    }

    function odActive(side) {
      return elapsed < odUntil[side];
    }

    function actionCost(side, id) {
      if (id === "overdrive") return OD_COST;
      if (id === "rush") return 36 + line[side] * 8;
      if (id === "line") return 92 + line[side] * 72;
      if (id === "tech") return 112 + tech[side] * 86;
      if (id === "repair") return baseHp[side] >= BASE_HP ? Infinity : 74 + Math.floor((BASE_HP - baseHp[side]) / 180) * 14;
      return Infinity;
    }

    function renderHud() {
      const activeSide = ctx.isOnline ? ctx.mySeat : controlSide;
      const odTag = [0, 1].filter((s) => odActive(s)).map((s) => `⚡P${s + 1}`).join(" ");
      hud.innerHTML = `
        ${playerHud(0)}
        <div class="rf-mid">
          <b>${over ? "Kết thúc" : "Robot Factory War"}</b>
          <span>${timeText()} · P${activeSide + 1} x${factoryScale(activeSide).toFixed(2)}${odTag ? " · " + odTag : ""}</span>
          <small>${last}</small>
        </div>
        ${playerHud(1)}
      `;
    }

    function playerHud(side) {
      const pct = Math.max(0, baseHp[side] / BASE_HP * 100);
      return `
        <div class="rf-player p${side + 1} ${controlSide === side && !over ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${side + 1}`, `Player ${side + 1}`)}</span>
          <b>${Math.ceil(baseHp[side])}/${BASE_HP} HP</b>
          <em>${ctx.t(`${Math.floor(scrap[side])} phế liệu · +${incomeRate(side).toFixed(1)}/s`, `${Math.floor(scrap[side])} scrap · +${incomeRate(side).toFixed(1)}/s`)}</em>
          <i class="rf-hp"><i style="width:${pct}%"></i></i>
          <small>${ctx.t(`Dây chuyền ${line[side]} · Công nghệ ${tech[side]}`, `Line ${line[side]} · Tech ${tech[side]}`)}</small>
        </div>
      `;
    }

    function syncControls() {
      if (!root.isConnected) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (!ctx.isOnline) {
        sideBox.querySelectorAll(".rf-side-btn").forEach((btn) => {
          btn.classList.toggle("active", Number(btn.dataset.side) === controlSide);
        });
      }
      moduleBox.querySelectorAll(".rf-module-btn").forEach((btn) => {
        const group = btn.dataset.group;
        const id = btn.dataset.module;
        btn.classList.toggle("active", blueprint[side][group] === id);
      });
      pauseBtn.textContent = paused[side] ? ctx.t("Tiếp tục sản xuất", "Resume production") : ctx.t("Dừng sản xuất", "Pause production");
      pauseBtn.classList.toggle("active", paused[side]);
      pauseBtn.disabled = over || (ctx.isOnline && side !== ctx.mySeat);
      actionBox.querySelectorAll(".rf-action").forEach((btn) => {
        const id = btn.dataset.action;
        const cost = actionCost(side, id);
        const em = btn.querySelector("em");
        if (id === "overdrive") {
          const cd = Math.max(0, odReady[side] - elapsed);
          if (odActive(side)) em.textContent = ctx.t(`⚡ còn ${Math.ceil(odUntil[side] - elapsed)}s`, `⚡ ${Math.ceil(odUntil[side] - elapsed)}s left`);
          else if (cd > 0) em.textContent = ctx.t(`hồi ${Math.ceil(cd)}s`, `cd ${Math.ceil(cd)}s`);
          else em.textContent = ctx.t(OD_COST + " phế liệu", OD_COST + " scrap");
          btn.classList.toggle("active", odActive(side));
          btn.disabled = over || cd > 0 || scrap[side] < OD_COST || (ctx.isOnline && side !== ctx.mySeat);
        } else {
          em.textContent = cost === Infinity ? ctx.t("không thể", "unavailable") : ctx.t(cost + " phế liệu", cost + " scrap");
          btn.disabled = over || cost === Infinity || scrap[side] < cost || (ctx.isOnline && side !== ctx.mySeat);
        }
      });
      renderCurrent(side);
      renderPreview(side);
    }

    function renderCurrent(side) {
      currentBox.innerHTML = GROUPS.map((group) => {
        const mod = MODULES[group.id][blueprint[side][group.id]];
        return `<span><b>${groupLabel(group.id)}</b><em>${mod.short}</em><small>${modLabel(group.id, blueprint[side][group.id])}</small></span>`;
      }).join("");
    }

    function renderPreview(side) {
      const stats = blueprintStats(side);
      const pct = Math.min(100, progress[side] * 100);
      previewBox.innerHTML = `
        <div class="rf-build-meter">
          <b>${ctx.t(`P${side + 1} · Lane ${selectedLane[side] + 1}`, `P${side + 1} · Lane ${selectedLane[side] + 1}`)}</b>
          <span>${paused[side] ? ctx.t("Đang dừng", "Paused") : Math.floor(pct) + "%"}</span>
          <i><i style="width:${pct}%"></i></i>
        </div>
        <div class="rf-stat-grid">
          <span><b>${stats.cost}</b><small>${ctx.t("giá", "cost")}</small></span>
          <span><b>${stats.hp}</b><small>HP</small></span>
          <span><b>${stats.dmg}</b><small>${ctx.t("sát thương", "damage")}</small></span>
          <span><b>${stats.range}</b><small>${ctx.t("tầm đánh", "range")}</small></span>
          <span><b>${stats.speed}</b><small>${ctx.t("tốc độ", "speed")}</small></span>
          <span><b>${buildTime(side, stats).toFixed(1)}s</b><small>${ctx.t("chu kỳ", "cycle")}</small></span>
        </div>
      `;
    }

    function updateStatus() {
      if (over) return;
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      if (ctx.isOnline) {
        ctx.setStatus(ctx.t(`Bạn là P${ctx.mySeat + 1}. Chọn module, chọn lane và nâng dây chuyền để robot tự động tấn công.`, `You are P${ctx.mySeat + 1}. Pick modules, choose a lane and upgrade the line so robots auto-attack.`));
      } else {
        ctx.setStatus(ctx.t(`Đang điều khiển P${side + 1}. Click nửa sân để đổi phe, chọn lane/module để đổi công thức robot.`, `Controlling P${side + 1}. Click a half of the field to switch side, pick lane/module to change the robot blueprint.`));
      }
      ctx.setTurn(side);
    }

    function draw() {
      drawBackground();
      drawFactories();
      drawRobots();
      drawEffects();
      drawSelection();
    }

    function drawBackground() {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#151936");
      bg.addColorStop(0.58, "#20294c");
      bg.addColorStop(1, "#111629");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      g.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 12; i++) {
        g.fillRect(80 + i * 82, 70, 34, H - 145);
      }

      LANES.forEach((y, lane) => {
        const grad = g.createLinearGradient(92, y, W - 92, y);
        grad.addColorStop(0, "rgba(255,93,115,0.22)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.07)");
        grad.addColorStop(1, "rgba(77,208,225,0.22)");
        g.fillStyle = grad;
        roundRect(g, 80, y - 28, W - 160, 56, 999);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.12)";
        g.lineWidth = 1;
        g.stroke();

        g.strokeStyle = "rgba(255,209,102,0.28)";
        g.lineWidth = 2;
        g.setLineDash([12, 10]);
        g.beginPath();
        g.moveTo(140, y);
        g.lineTo(W - 140, y);
        g.stroke();
        g.setLineDash([]);

        g.fillStyle = "rgba(255,255,255,0.45)";
        g.font = "900 12px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText("LANE " + (lane + 1), W / 2, y - 38);
      });

      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(0, H - 54, W, 54);
      g.fillStyle = "rgba(255,255,255,0.72)";
      g.font = "900 13px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText("ROBOT FACTORY WAR", W / 2, 28);
    }

    function drawFactories() {
      [0, 1].forEach((side) => {
        const x = BASE_X[side];
        const color = sideColor(side);
        const hpPct = Math.max(0, baseHp[side] / BASE_HP);
        g.save();
        g.translate(x, LANES[1]);
        g.fillStyle = "rgba(0,0,0,0.34)";
        g.beginPath();
        g.ellipse(0, 96, 62, 14, 0, 0, Math.PI * 2);
        g.fill();

        g.fillStyle = side === 0 ? "#512c3f" : "#1f4652";
        roundRect(g, -46, -76, 92, 140, 12);
        g.fill();
        g.fillStyle = color;
        roundRect(g, -35, -62, 70, 28, 8);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.12)";
        for (let i = -30; i <= 30; i += 30) g.fillRect(i - 5, -20, 10, 72);

        g.fillStyle = "#2f344e";
        roundRect(g, -52, 52, 104, 24, 8);
        g.fill();
        g.fillStyle = color;
        roundRect(g, -52, 52, 104 * Math.min(1, progress[side]), 24, 8);
        g.fill();

        g.fillStyle = "#101422";
        g.font = "900 13px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText("P" + (side + 1), 0, -43);

        g.fillStyle = "rgba(0,0,0,0.45)";
        roundRect(g, -54, -96, 108, 9, 999);
        g.fill();
        g.fillStyle = hpPct > 0.3 ? "#6ee7b7" : "#ff5d73";
        roundRect(g, -54, -96, 108 * hpPct, 9, 999);
        g.fill();
        g.restore();
      });
    }

    function drawRobots() {
      robots
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .forEach((r) => {
          const color = sideColor(r.owner);
          const body = r.flash > 0 ? "#fff2c2" : (r.owner === 0 ? "#69405c" : "#244f5d");
          const dir = r.owner === 0 ? 1 : -1;
          const bob = Math.sin(r.step * 0.16) * 2;
          g.save();
          g.translate(r.x, r.y + bob);
          g.fillStyle = "rgba(0,0,0,0.3)";
          g.beginPath();
          g.ellipse(0, 22, 28, 7, 0, 0, Math.PI * 2);
          g.fill();
          if (odActive(r.owner)) {
            g.save();
            g.globalAlpha = 0.32 + 0.16 * Math.sin(elapsed * 9 + r.x * 0.05);
            g.fillStyle = "#ffd166";
            g.beginPath();
            g.ellipse(0, -2, 30, 30, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
          }
          g.scale(dir, 1);
          drawRobotSprite(r, body, color);
          g.restore();

          const pct = Math.max(0, r.hp / r.maxHp);
          g.fillStyle = "rgba(0,0,0,0.45)";
          roundRect(g, r.x - 25, r.y - 50, 50, 6, 999);
          g.fill();
          g.fillStyle = pct > 0.35 ? "#6ee7b7" : "#ff5d73";
          roundRect(g, r.x - 25, r.y - 50, 50 * pct, 6, 999);
          g.fill();
        });
    }

    function drawRobotSprite(r, body, color) {
      const mods = r.modules;
      if (mods.legs === "tracks") {
        g.fillStyle = "#1b2035";
        roundRect(g, -24, 4, 48, 18, 999);
        g.fill();
        g.fillStyle = color;
        for (let x = -16; x <= 16; x += 16) {
          g.beginPath();
          g.arc(x, 13, 5, 0, Math.PI * 2);
          g.fill();
        }
      } else if (mods.legs === "crawler") {
        g.strokeStyle = color;
        g.lineWidth = 5;
        for (let x = -18; x <= 18; x += 12) {
          g.beginPath();
          g.moveTo(x, 4);
          g.lineTo(x - 8, 20);
          g.stroke();
        }
      } else {
        g.fillStyle = "#1b2035";
        g.beginPath();
        g.arc(-16, 15, 8, 0, Math.PI * 2);
        g.arc(16, 15, 8, 0, Math.PI * 2);
        g.fill();
        if (mods.legs === "booster") {
          g.fillStyle = "#ffb15c";
          g.beginPath();
          g.moveTo(-22, 13);
          g.lineTo(-36, 18);
          g.lineTo(-22, 22);
          g.moveTo(22, 13);
          g.lineTo(36, 18);
          g.lineTo(22, 22);
          g.fill();
        }
      }

      g.fillStyle = body;
      const wide = mods.body === "fortress";
      roundRect(g, wide ? -27 : -22, -20, wide ? 54 : 44, 35, 9);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = color;
      if (mods.body === "battery") {
        g.fillRect(-12, -10, 24, 10);
        g.fillStyle = "#101422";
        g.fillRect(-6, -8, 4, 6);
        g.fillRect(2, -8, 4, 6);
      } else {
        roundRect(g, -14, -12, 28, 14, 6);
        g.fill();
      }

      drawHead(mods.head, color);
      drawWeapon(mods.weapon, color);
    }

    function drawHead(head, color) {
      g.fillStyle = color;
      if (head === "sensor") {
        g.beginPath();
        g.arc(0, -31, 11, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#dff8ff";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(6, -35, 14, -0.9, 0.9);
        g.stroke();
      } else if (head === "medic") {
        roundRect(g, -12, -39, 24, 18, 6);
        g.fill();
        g.fillStyle = "#fff";
        g.fillRect(-7, -31, 14, 4);
        g.fillRect(-2, -36, 4, 14);
      } else if (head === "overclock") {
        g.beginPath();
        g.moveTo(-10, -23);
        g.lineTo(0, -43);
        g.lineTo(12, -30);
        g.lineTo(2, -29);
        g.lineTo(8, -18);
        g.closePath();
        g.fill();
      } else {
        roundRect(g, -13, -38, 26, 18, 7);
        g.fill();
      }
    }

    function drawWeapon(weapon, color) {
      g.strokeStyle = color;
      g.lineCap = "round";
      if (weapon === "laser") {
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(18, -11);
        g.lineTo(43, -16);
        g.stroke();
        g.fillStyle = "#dff8ff";
        g.beginPath();
        g.arc(45, -17, 4, 0, Math.PI * 2);
        g.fill();
      } else if (weapon === "rocket") {
        g.fillStyle = color;
        roundRect(g, 16, -20, 34, 12, 6);
        g.fill();
        g.fillStyle = "#ffcf8a";
        g.beginPath();
        g.moveTo(50, -20);
        g.lineTo(62, -14);
        g.lineTo(50, -8);
        g.fill();
      } else if (weapon === "saw") {
        g.strokeStyle = "#d9dde8";
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(16, -8);
        g.lineTo(31, -4);
        g.stroke();
        g.fillStyle = color;
        g.beginPath();
        g.arc(38, -3, 10, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#101422";
        g.lineWidth = 2;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          g.beginPath();
          g.moveTo(38, -3);
          g.lineTo(38 + Math.cos(a) * 12, -3 + Math.sin(a) * 12);
          g.stroke();
        }
      } else {
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(18, -7);
        g.lineTo(36, -12);
        g.stroke();
        g.beginPath();
        g.moveTo(34, -18);
        g.lineTo(45, -13);
        g.lineTo(35, -5);
        g.stroke();
      }
    }

    function drawEffects() {
      shots.forEach((s) => {
        g.strokeStyle = s.color;
        g.lineWidth = s.boom ? 4 : 3;
        g.globalAlpha = Math.max(0, s.t / 16);
        g.beginPath();
        g.moveTo(s.x1, s.y1);
        g.lineTo(s.x2, s.y2);
        g.stroke();
        if (s.boom) {
          g.fillStyle = "rgba(255,209,102,0.35)";
          g.beginPath();
          g.arc(s.x2, s.y2, 18 * (1 - s.t / 16) + 6, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      });
      pops.forEach((p) => {
        g.globalAlpha = Math.max(0, p.t / 34);
        g.fillStyle = p.color;
        g.font = "900 13px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(p.text, p.x, p.y);
        g.globalAlpha = 1;
      });
    }

    function drawSelection() {
      const side = ctx.isOnline ? ctx.mySeat : controlSide;
      const y = LANES[selectedLane[side]];
      g.strokeStyle = sideColor(side);
      g.lineWidth = 3;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(122, y);
      g.lineTo(W - 122, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255,209,102,0.92)";
      g.font = "900 13px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(ctx.t(`Đang sản xuất P${side + 1} · Lane ${selectedLane[side] + 1}`, `Producing P${side + 1} · Lane ${selectedLane[side] + 1}`), W / 2, y + 44);
    }

    function moduleShort(side) {
      const bp = blueprint[side];
      return `${MODULES.head[bp.head].short}-${MODULES.body[bp.body].short}-${MODULES.weapon[bp.weapon].short}-${MODULES.legs[bp.legs].short}`;
    }

    function sideColor(side) {
      return side === 0 ? "#ff5d73" : "#4dd0e1";
    }

    function timeText() {
      const m = Math.floor(elapsed / 60);
      const s = Math.floor(elapsed % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    }

    function dist(x1, y1, x2, y2) {
      return Math.hypot(x1 - x2, y1 - y2);
    }

    function clamp(n, min, max) {
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
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
    ctx.setNames?.(ctx.t("Người chơi 1 (nhà máy đỏ)", "Player 1 (red factory)"), ctx.t("Người chơi 2 (nhà máy xanh)", "Player 2 (blue factory)"));
    ctx.setTurn(controlSide);
    renderHud();
    syncControls();
    updateStatus();
    draw();
    raf = requestAnimationFrame(loop);
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "robotfactorywar",
    name: "Robot Factory War",
    emoji: "🏭",
    description: "Hai bên xây dây chuyền, ghép module đầu-thân-vũ khí-chân để robot tự động ra lane đánh nhau. Nhịp độ nhanh, có Overdrive tăng tốc cả đội hình.",
    onlineReady: true,
    options: [
      {
        id: "pace",
        label: "Nhịp độ",
        default: "fast",
        choices: [
          { value: "normal", label: "Chuẩn" },
          { value: "fast", label: "Nhanh" },
          { value: "blitz", label: "Chớp nhoáng" },
        ],
      },
    ],
    howTo: [
      "Mỗi bên có một nhà máy. Mục tiêu là phá nhà máy đối thủ trước.",
      "Chọn 4 module: Đầu, Thân, Vũ khí và Chân. Blueprint hiện tại sẽ quyết định robot được sản xuất tiếp theo.",
      "Dây chuyền tự động tích tiến độ. Khi đầy tiến độ và đủ phế liệu, robot sẽ được xuất xưởng tại lane đang chọn.",
      "Click lane trực tiếp trên map để đổi đường ra robot. Robot gặp địch sẽ tự động bắn/đánh, sau đó tấn công nhà máy.",
      "Nâng Dây chuyền để sản xuất nhanh hơn. Nâng Công nghệ để robot mạnh hơn. Factory cũng tự mạnh dần theo thời gian.",
      "⚡ Overdrive: tốn phế liệu, có hồi chiêu - kích hoạt để toàn bộ robot của bạn tăng tốc và sát thương trong vài giây (robot sẽ phát sáng vàng).",
      "Tăng ca dùng phế liệu để đẩy nhanh tiến độ sản xuất. Sửa nhà máy khi bị robot đối thủ ép sát. Đổi nhịp độ ở phần tùy chọn để trận nhanh hơn nữa.",
    ],
    create,
  });
})();
