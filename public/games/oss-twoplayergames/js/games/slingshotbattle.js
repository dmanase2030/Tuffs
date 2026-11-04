/* Slingshot Battle - keo tha ban da/phep qua chuong ngai, co thung no day chuyen va vat pham. */
(function () {
  const W = 820;
  const H = 470;
  const FLOOR = 398;
  const HERO_R = 18;
  const MAX_DRAG = 150;
  const POWER_SCALE = 0.115;
  const GRAVITY = 0.22;
  const SUBSTEPS = 2;
  const STOP_EXPLOSION = 34;

  const SPELLS = {
    stone: {
      label: "Đá", icon: "ROCK", cost: 0, dmg: 24, blast: 34, radius: 6, bounces: 1,
      color: "#d8dee9", hint: "miễn phí", gravity: 1,
    },
    fire: {
      label: "Cầu lửa", icon: "FIRE", cost: 2, dmg: 38, blast: 58, radius: 8, bounces: 0,
      color: "#ff9f5d", hint: "nổ lớn", gravity: 1,
    },
    ricochet: {
      label: "Bật tường", icon: "RICO", cost: 1, dmg: 25, blast: 32, radius: 6, bounces: 4,
      color: "#8be6f0", hint: "nảy nhiều", gravity: 1,
    },
    arcane: {
      label: "Bùa nhẹ", icon: "ARC", cost: 2, dmg: 28, blast: 43, radius: 7, bounces: 2,
      color: "#c792ea", hint: "bay xa", gravity: 0.68,
    },
    cluster: {
      label: "Đạn chùm", icon: "CLST", cost: 3, dmg: 30, blast: 50, radius: 7, bounces: 0,
      color: "#ffd166", hint: "nổ 3 điểm", gravity: 1, cluster: true,
    },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const MAX_HP = o.hp || 100;
    const MAX_MANA = o.mana || 6;
    const OBSTACLE_COUNT = o.obstacles == null ? 5 : o.obstacles;
    const windLevel = o.wind == null ? 1 : o.wind;

    const players = [
      makePlayer(0, 92, "#ff5d73", 1),
      makePlayer(1, W - 92, "#4dd0e1", -1),
    ];
    const obstacles = makeObstacles(OBSTACLE_COUNT);
    const barrels = makeBarrels();
    const crates = makeCrates();

    let turn = 0;
    let wind = nextWind();
    let selectedSpell = "stone";
    let busy = false;
    let over = false;
    let dragging = false;
    let projectile = null;
    let explosions = [];
    let particles = [];
    let floaters = [];
    let shake = 0;
    let pendingResolve = false;
    let raf = null;
    let last = ctx.t("Kéo để ngắm, thả để bắn. Bắn trúng 🛢️ thùng nổ để nổ dây chuyền!",
      "Drag to aim, release to fire. Hit a 🛢️ TNT barrel for chain explosions!");
    const SPELL_EN = { "Đá": "Stone", "Cầu lửa": "Fireball", "Bật tường": "Ricochet", "Bùa nhẹ": "Arcane", "Đạn chùm": "Cluster" };
    const HINT_EN = { "miễn phí": "free", "nổ lớn": "big blast", "nảy nhiều": "many bounces", "bay xa": "flies far", "nổ 3 điểm": "3-point blast" };
    const spellLabel = (l) => ctx.t(l, SPELL_EN[l] || l);
    const spellHint = (h) => ctx.t(h, HINT_EN[h] || h);

    const root = document.createElement("div");
    root.className = "sling-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "sling-hud";
    root.appendChild(hud);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "sling-stage-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "sling-canvas";
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);
    const g = canvas.getContext("2d");

    const controls = document.createElement("div");
    controls.className = "sling-controls";
    controls.innerHTML = `
      <div class="sling-info">
        <b class="sling-wind"></b>
        <span class="sling-power"></span>
      </div>
      <div class="sling-spells"></div>
      <button class="btn primary sling-fire" type="button">${ctx.t("Bắn", "Fire")}</button>
    `;
    root.appendChild(controls);

    const windEl = controls.querySelector(".sling-wind");
    const powerEl = controls.querySelector(".sling-power");
    const spellBox = controls.querySelector(".sling-spells");
    const fireBtn = controls.querySelector(".sling-fire");

    Object.keys(SPELLS).forEach((id) => {
      const def = SPELLS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small sling-spell";
      btn.dataset.spell = id;
      btn.innerHTML = `<span>${def.icon}</span><b>${spellLabel(def.label)}</b><small>${def.cost ? def.cost + " mana" : spellHint(def.hint)}</small>`;
      btn.addEventListener("click", () => {
        if (!canControl()) return;
        if (players[turn].mana < def.cost) return;
        selectedSpell = id;
        renderHud();
        syncControls();
        draw();
      });
      spellBox.appendChild(btn);
    });
    fireBtn.addEventListener("click", () => fireCurrentAim());

    canvas.addEventListener("pointerdown", (e) => {
      if (!canControl()) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      updateAimFromPointer(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !canControl()) return;
      updateAimFromPointer(e);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (!dragging || !canControl()) { dragging = false; return; }
      dragging = false;
      updateAimFromPointer(e);
      if (aimPower(players[turn]) >= 14) fireCurrentAim();
      else draw();
    });
    canvas.addEventListener("pointercancel", () => { dragging = false; draw(); });

    function makePlayer(idx, x, color, facing) {
      return { idx, x, y: FLOOR - 28, hp: MAX_HP, mana: 3, color, facing, aim: { dx: facing * 100, dy: -82 } };
    }

    function makeObstacles(count) {
      const out = [];
      function add(x, y, w, h, hp) { out.push({ x, y, w, h, hp, maxHp: hp, active: true }); }
      if (count <= 0) return out;
      const centerH = 120 + Math.round(ctx.rng() * 42);
      add(W / 2 - 24, FLOOR - centerH, 48, centerH, 70);
      let i = 1;
      while (i < count) {
        const w = 34 + Math.round(ctx.rng() * 22);
        const h = 62 + Math.round(ctx.rng() * 86);
        const x1 = 235 + Math.round(ctx.rng() * 70);
        const y = FLOOR - h;
        add(x1, y, w, h, 48 + Math.round(h * 0.24));
        i++;
        if (i >= count) break;
        add(W - x1 - w, y, w, h, 48 + Math.round(h * 0.24));
        i++;
      }
      if (count >= 7) {
        const fw = 82;
        add(W / 2 - fw / 2, 176 + Math.round(ctx.rng() * 35), fw, 22, 44);
      }
      return out.slice(0, count);
    }

    function makeBarrels() {
      const out = [];
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = Math.round(W * (0.34 + ctx.rng() * 0.32));
        const onTop = ctx.rng() < 0.4;
        let y = FLOOR - 14;
        if (onTop) {
          const ob = obstacles.find((r) => r.active && x > r.x - 6 && x < r.x + r.w + 6);
          if (ob) y = ob.y - 14;
        }
        out.push({ x, y, r: 13, active: true, blast: 74, dmg: 30 });
      }
      return out;
    }

    function makeCrates() {
      const out = [];
      const types = ["mana", "heal"];
      for (let i = 0; i < 2; i++) {
        const x = Math.round(W * (0.3 + ctx.rng() * 0.4));
        out.push({ x: x - 13, y: FLOOR - 26, w: 26, h: 26, hp: 30, active: true, type: types[i % 2] });
      }
      return out;
    }

    function nextWind() {
      if (windLevel === 0) return 0;
      const mag = windLevel === 2 ? 0.045 : 0.024;
      return (ctx.rng() * 2 - 1) * mag;
    }

    function canControl() {
      return !busy && !over && (!ctx.isOnline || turn === ctx.mySeat);
    }

    function updateAimFromPointer(e) {
      const p = pointerPos(e);
      const pl = players[turn];
      const anchor = slingAnchor(pl);
      let dx = anchor.x - p.x;
      let dy = anchor.y - p.y;
      const mag = Math.hypot(dx, dy);
      if (mag > MAX_DRAG) { dx = dx / mag * MAX_DRAG; dy = dy / mag * MAX_DRAG; }
      pl.aim = { dx, dy };
      syncControls();
      draw();
    }

    function pointerPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function fireCurrentAim() {
      if (!canControl()) return;
      const pl = players[turn];
      if (aimPower(pl) < 10) pl.aim = { dx: pl.facing * 95, dy: -78 };
      applyMove({
        dx: Math.round(pl.aim.dx * 10) / 10,
        dy: Math.round(pl.aim.dy * 10) / 10,
        spell: selectedSpell,
      }, false);
    }

    function applyMove(move, fromRemote) {
      if (busy || over) return;
      if (!fromRemote && !canControl()) return;
      const pl = players[turn];
      let spellId = SPELLS[move.spell] ? move.spell : "stone";
      if (pl.mana < SPELLS[spellId].cost) spellId = "stone";
      const dx = clamp(Number(move.dx || 0), -MAX_DRAG, MAX_DRAG);
      const dy = clamp(Number(move.dy || 0), -MAX_DRAG, MAX_DRAG);
      const mag = Math.hypot(dx, dy);
      if (mag < 8) return;

      pl.aim = { dx, dy };
      pl.mana -= SPELLS[spellId].cost;
      if (!fromRemote) ctx.sendMove({ dx, dy, spell: spellId });
      startProjectile(pl, spellId);
    }

    function startProjectile(pl, spellId) {
      const spell = SPELLS[spellId];
      const a = slingAnchor(pl);
      projectile = {
        owner: turn, spellId,
        x: a.x, y: a.y,
        vx: pl.aim.dx * POWER_SCALE, vy: pl.aim.dy * POWER_SCALE,
        r: spell.radius, bounces: spell.bounces, frames: 0, trail: [],
      };
      busy = true;
      dragging = false;
      selectedSpell = "stone";
      last = ctx.t(`Người chơi ${turn + 1} bắn ${spell.label}.`, `Player ${turn + 1} fired ${spellLabel(spell.label)}.`);
      ctx.sound("shot");
      renderHud();
      syncControls();
      updateStatus();
    }

    function stepProjectile() {
      if (!projectile) return;
      const spell = SPELLS[projectile.spellId];
      projectile.frames++;
      for (let i = 0; i < SUBSTEPS && projectile; i++) {
        const prev = { x: projectile.x, y: projectile.y };
        projectile.vx += wind;
        projectile.vy += GRAVITY * spell.gravity;
        projectile.x += projectile.vx / SUBSTEPS;
        projectile.y += projectile.vy / SUBSTEPS;
        if (i === 0) {
          projectile.trail.push({ x: projectile.x, y: projectile.y });
          if (projectile.trail.length > 24) projectile.trail.shift();
        }
        if (hitBounds(prev)) return;
        if (hitBarrel()) return;
        if (hitObstacle(prev)) return;
        if (hitPlayer()) return;
        if (projectile && projectile.frames > 900) explodeAt(projectile.x, projectile.y);
      }
    }

    function hitBounds(prev) {
      const p = projectile;
      if (!p) return true;
      if (p.y >= FLOOR - p.r) { explodeAt(p.x, FLOOR - p.r); return true; }
      if (p.x < 22 + p.r) { p.x = 22 + p.r; return bounceOrExplode("x"); }
      if (p.x > W - 22 - p.r) { p.x = W - 22 - p.r; return bounceOrExplode("x"); }
      if (p.y < 22 + p.r) { p.y = 22 + p.r; return bounceOrExplode("y"); }
      if (p.y > H + 60 || p.x < -80 || p.x > W + 80) {
        explodeAt(clamp(p.x, 22, W - 22), clamp(p.y, 22, FLOOR));
        return true;
      }
      return false;
    }

    function bounceOrExplode(axis) {
      const p = projectile;
      if (!p) return true;
      if (p.bounces <= 0) { explodeAt(p.x, p.y); return true; }
      p.bounces--;
      if (axis === "x") p.vx *= -0.82; else p.vy *= -0.82;
      ctx.sound("place");
      return false;
    }

    function hitBarrel() {
      const p = projectile;
      if (!p) return true;
      const b = barrels.find((b) => b.active && dist(p.x, p.y, b.x, b.y) <= b.r + p.r);
      if (!b) return false;
      explodeAt(p.x, p.y);
      return true;
    }

    function hitObstacle(prev) {
      const p = projectile;
      if (!p) return true;
      const ob = obstacles.find((r) => r.active && circleRect(p.x, p.y, p.r, r));
      if (!ob) return false;
      const spell = SPELLS[p.spellId];
      ob.hp -= p.spellId === "fire" ? 28 : 12;
      if (ob.hp <= 0) ob.active = false;
      if (p.spellId === "fire" || p.bounces <= 0) { explodeAt(p.x, p.y); return true; }
      const fromLeft = prev.x <= ob.x - p.r;
      const fromRight = prev.x >= ob.x + ob.w + p.r;
      if (fromLeft) { p.x = ob.x - p.r; p.vx = -Math.abs(p.vx) * 0.82; }
      else if (fromRight) { p.x = ob.x + ob.w + p.r; p.vx = Math.abs(p.vx) * 0.82; }
      else {
        if (prev.y < ob.y) { p.y = ob.y - p.r; p.vy = -Math.abs(p.vy) * 0.82; }
        else { p.y = ob.y + ob.h + p.r; p.vy = Math.abs(p.vy) * 0.82; }
      }
      p.bounces--;
      last = `${spell.label} bật khỏi chướng ngại.`;
      ctx.sound("place");
      return false;
    }

    function hitPlayer() {
      const p = projectile;
      if (!p) return true;
      for (const pl of players) {
        if (pl.hp <= 0) continue;
        if (pl.idx === p.owner && p.frames < 8) continue;
        if (dist(p.x, p.y, pl.x, pl.y) <= HERO_R + p.r) { explodeAt(p.x, p.y); return true; }
      }
      return false;
    }

    // ---- nổ + dây chuyền ----
    function detonate(x, y, blast, dmg, color, owner, depth) {
      explosions.push({ x, y, r: 8, max: blast, color });
      spawnParticles(x, y, color, blast);
      shake = Math.min(16, shake + blast * 0.14);
      ctx.sound("explode");

      players.forEach((pl) => {
        if (pl.hp <= 0) return;
        const d = dist(x, y, pl.x, pl.y);
        const reach = blast + HERO_R;
        if (d >= reach) return;
        const dd = Math.max(1, Math.round(dmg * (1 - d / reach)));
        pl.hp = Math.max(0, pl.hp - dd);
        floaters.push({ x: pl.x, y: pl.y - 30, text: "-" + dd, color: pl.idx === 0 ? "#ff91a2" : "#8be6f0", life: 42 });
      });

      obstacles.forEach((ob) => {
        if (!ob.active) return;
        const d = rectDistance(x, y, ob);
        if (d >= blast) return;
        ob.hp -= Math.round(dmg * 0.7 * (1 - d / blast) + 8);
        if (ob.hp <= 0) ob.active = false;
      });

      crates.forEach((cr) => {
        if (!cr.active) return;
        const d = rectDistance(x, y, cr);
        if (d >= blast) return;
        cr.hp -= Math.round(dmg * (1 - d / blast) + 10);
        if (cr.hp <= 0) { cr.active = false; grantCrate(cr, owner); }
      });

      if ((depth || 0) < 6) {
        barrels.forEach((b) => {
          if (!b.active) return;
          if (dist(x, y, b.x, b.y) <= blast + b.r) {
            b.active = false;
            floaters.push({ x: b.x, y: b.y - 22, text: "💥", color: "#ffae5d", life: 32 });
            last = ctx.t(`💥 Người chơi ${owner + 1} kích nổ dây chuyền!`, `💥 Player ${owner + 1} triggered a chain explosion!`);
            detonate(b.x, b.y, b.blast, b.dmg, "#ff8a3d", owner, (depth || 0) + 1);
          }
        });
      }
    }

    function grantCrate(cr, owner) {
      const pl = players[owner];
      if (cr.type === "mana") {
        pl.mana = Math.min(MAX_MANA, pl.mana + 3);
        floaters.push({ x: cr.x + cr.w / 2, y: cr.y, text: "+3 mana", color: "#8be6f0", life: 46 });
      } else {
        pl.hp = Math.min(MAX_HP, pl.hp + 25);
        floaters.push({ x: cr.x + cr.w / 2, y: cr.y, text: "+25 HP", color: "#6ee7b7", life: 46 });
      }
      ctx.sound("select");
    }

    function explodeAt(x, y) {
      if (!projectile) return;
      const spell = SPELLS[projectile.spellId];
      const owner = projectile.owner;
      projectile = null;
      if (spell.cluster) {
        detonate(x, y, spell.blast * 0.72, spell.dmg * 0.62, spell.color, owner, 0);
        detonate(x - 48, y - 8, spell.blast * 0.72, spell.dmg * 0.62, spell.color, owner, 0);
        detonate(x + 48, y - 8, spell.blast * 0.72, spell.dmg * 0.62, spell.color, owner, 0);
      } else {
        detonate(x, y, spell.blast, spell.dmg, spell.color, owner, 0);
      }
      pendingResolve = true;
      renderHud();
    }

    function spawnParticles(x, y, color, blast) {
      const n = Math.round(8 + blast * 0.2);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 4;
        particles.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.5,
          life: 18 + Math.random() * 16, color,
        });
      }
    }

    function resolveTurn() {
      busy = false;
      const dead0 = players[0].hp <= 0;
      const dead1 = players[1].hp <= 0;
      if (dead0 || dead1) {
        over = true;
        ctx.setTurn(-1);
        if (dead0 && dead1) ctx.setStatus(ctx.t("🤝 Hai bên cùng gục - hòa!", "🤝 Both knocked out — draw!"));
        else {
          const winner = dead0 ? 1 : 0;
          ctx.incScore(winner);
          ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng Slingshot Battle!`, `🎉 Player ${winner + 1} wins Slingshot Battle!`));
        }
        syncControls();
        renderHud();
        return;
      }
      turn = 1 - turn;
      wind = nextWind();
      players[turn].mana = Math.min(MAX_MANA, players[turn].mana + 1);
      selectedSpell = "stone";
      ctx.setTurn(turn);
      renderHud();
      syncControls();
      updateStatus();
    }

    function renderHud() {
      hud.innerHTML = `
        ${playerHud(0)}
        <div class="sling-mid">
          <b>${over ? ctx.t("Kết thúc", "Finished") : busy ? ctx.t("Đạn đang bay", "Shot in flight") : ctx.t("Lượt Người chơi ", "Player ") + (turn + 1) + ctx.t("", "'s turn")}</b>
          <span>${windText()} · 🛢️ ${barrels.filter((b) => b.active).length} · 📦 ${crates.filter((c) => c.active).length}</span>
          <small>${last}</small>
        </div>
        ${playerHud(1)}
      `;
    }

    function playerHud(idx) {
      const pl = players[idx];
      const hpPct = Math.max(0, pl.hp / MAX_HP * 100);
      const manaDots = Array.from({ length: MAX_MANA }, (_, i) =>
        `<i class="${i < pl.mana ? "on" : ""}"></i>`).join("");
      return `
        <div class="sling-player p${idx + 1} ${turn === idx && !over ? "active" : ""}">
          <span>${ctx.t("Người chơi", "Player")} ${idx + 1}</span>
          <b>${pl.hp}/${MAX_HP} HP</b>
          <em>Mana ${pl.mana}/${MAX_MANA}</em>
          <div class="sling-meter"><i style="width:${hpPct}%"></i></div>
          <div class="sling-mana">${manaDots}</div>
        </div>
      `;
    }

    function syncControls() {
      const pl = players[turn];
      normalizeSpell();
      const lock = !canControl();
      windEl.textContent = windText();
      powerEl.textContent = `Lực ${Math.round(aimPower(pl) / MAX_DRAG * 100)}`;
      fireBtn.disabled = lock || aimPower(pl) < 8;
      spellBox.querySelectorAll(".sling-spell").forEach((btn) => {
        const id = btn.dataset.spell;
        const disabled = lock || players[turn].mana < SPELLS[id].cost;
        btn.disabled = disabled;
        btn.classList.toggle("active", id === selectedSpell);
      });
    }

    function normalizeSpell() {
      if (!SPELLS[selectedSpell] || players[turn].mana < SPELLS[selectedSpell].cost) selectedSpell = "stone";
    }

    function updateStatus() {
      if (over) return;
      if (busy) ctx.setStatus(ctx.t("Đạn đang bay, chờ nổ xong rồi đổi lượt.", "Shot in flight — wait for it to land, then turns switch."));
      else if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t(`Đối thủ đang kéo ngắm. ${last}`, `Opponent is aiming. ${last}`));
      else ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: kéo từ nhân vật để ngắm, chọn phép rồi thả hoặc bấm Bắn.`,
        `Player ${turn + 1}: drag from your hero to aim, pick a spell, then release or press Fire.`));
    }

    function windText() {
      if (windLevel === 0 || Math.abs(wind) < 0.001) return ctx.t("Gió lặng", "Calm");
      return ctx.t(`Gió ${wind > 0 ? "→" : "←"} ${Math.abs(wind * 100).toFixed(1)}`, `Wind ${wind > 0 ? "→" : "←"} ${Math.abs(wind * 100).toFixed(1)}`);
    }

    function draw() {
      g.save();
      if (shake > 0.3) g.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      drawBackground();
      obstacles.forEach(drawObstacle);
      crates.forEach(drawCrate);
      barrels.forEach(drawBarrel);
      drawAim();
      drawProjectile();
      players.forEach(drawHero);
      drawParticles();
      drawExplosions();
      drawFloaters();
      g.restore();
    }

    function drawBackground() {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#171d38");
      sky.addColorStop(0.62, "#202a4d");
      sky.addColorStop(1, "#101426");
      g.fillStyle = sky;
      g.fillRect(-20, -20, W + 40, H + 40);

      g.fillStyle = "rgba(139,230,240,0.07)";
      for (let i = 0; i < 6; i++) {
        const x = 60 + i * 135;
        g.beginPath();
        g.ellipse(x, 78 + (i % 2) * 25, 58, 13, 0, 0, Math.PI * 2);
        g.fill();
      }

      g.fillStyle = "#18233b";
      g.beginPath();
      g.moveTo(0, FLOOR + 12);
      g.lineTo(120, FLOOR - 28);
      g.lineTo(260, FLOOR + 8);
      g.lineTo(430, FLOOR - 34);
      g.lineTo(610, FLOOR + 2);
      g.lineTo(W, FLOOR - 25);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.closePath();
      g.fill();

      const ground = g.createLinearGradient(0, FLOOR - 16, 0, H);
      ground.addColorStop(0, "#315f57");
      ground.addColorStop(1, "#203047");
      g.fillStyle = ground;
      g.fillRect(-20, FLOOR, W + 40, H - FLOOR + 20);
      g.strokeStyle = "rgba(255,255,255,0.16)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, FLOOR);
      g.lineTo(W, FLOOR);
      g.stroke();

      g.fillStyle = "rgba(255,255,255,0.72)";
      g.font = "800 12px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText("SLINGSHOT BATTLE", W / 2, 28);
      g.textAlign = "left";
    }

    function drawObstacle(ob) {
      if (!ob.active) return;
      const pct = Math.max(0, ob.hp / ob.maxHp);
      const grad = g.createLinearGradient(ob.x, ob.y, ob.x + ob.w, ob.y + ob.h);
      grad.addColorStop(0, "#7a5d4a");
      grad.addColorStop(0.55, "#49576b");
      grad.addColorStop(1, "#263047");
      g.fillStyle = grad;
      roundRect(g, ob.x, ob.y, ob.w, ob.h, 7);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.14)";
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.24)";
      g.lineWidth = 2;
      for (let y = ob.y + 20; y < ob.y + ob.h; y += 26) {
        g.beginPath();
        g.moveTo(ob.x + 6, y);
        g.lineTo(ob.x + ob.w - 6, y + (Math.round(y) % 2 ? 4 : -3));
        g.stroke();
      }
      if (pct < 0.7) {
        g.strokeStyle = "rgba(255,209,102,0.55)";
        g.beginPath();
        g.moveTo(ob.x + ob.w * 0.35, ob.y + 10);
        g.lineTo(ob.x + ob.w * 0.56, ob.y + ob.h * 0.45);
        g.lineTo(ob.x + ob.w * 0.42, ob.y + ob.h - 12);
        g.stroke();
      }
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(ob.x + 5, ob.y + ob.h - 8, ob.w - 10, 4);
      g.fillStyle = pct > 0.35 ? "#6ee7b7" : "#ff5d73";
      g.fillRect(ob.x + 5, ob.y + ob.h - 8, (ob.w - 10) * pct, 4);
    }

    function drawBarrel(b) {
      if (!b.active) return;
      g.save();
      g.translate(b.x, b.y);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath(); g.ellipse(0, b.r + 3, b.r, 4, 0, 0, Math.PI * 2); g.fill();
      const grad = g.createLinearGradient(-b.r, 0, b.r, 0);
      grad.addColorStop(0, "#b5402f");
      grad.addColorStop(0.5, "#ff6a52");
      grad.addColorStop(1, "#8c2c20");
      g.fillStyle = grad;
      roundRect(g, -b.r, -b.r, b.r * 2, b.r * 2 + 2, 5);
      g.fill();
      g.fillStyle = "#2a1410";
      g.fillRect(-b.r, -4, b.r * 2, 8);
      g.fillStyle = "#ffd166";
      g.font = "900 12px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("☢", 0, 0);
      g.restore();
      g.textBaseline = "alphabetic";
    }

    function drawCrate(cr) {
      if (!cr.active) return;
      const color = cr.type === "mana" ? "#4dd0e1" : "#6ee7b7";
      g.save();
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath(); g.ellipse(cr.x + cr.w / 2, cr.y + cr.h + 2, cr.w / 2, 4, 0, 0, Math.PI * 2); g.fill();
      const grad = g.createLinearGradient(cr.x, cr.y, cr.x, cr.y + cr.h);
      grad.addColorStop(0, "#caa86a");
      grad.addColorStop(1, "#8a6c3c");
      g.fillStyle = grad;
      roundRect(g, cr.x, cr.y, cr.w, cr.h, 5);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.3)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cr.x, cr.y); g.lineTo(cr.x + cr.w, cr.y + cr.h);
      g.moveTo(cr.x + cr.w, cr.y); g.lineTo(cr.x, cr.y + cr.h);
      g.stroke();
      g.fillStyle = color;
      g.font = "13px serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(cr.type === "mana" ? "✦" : "✚", cr.x + cr.w / 2, cr.y + cr.h / 2);
      g.restore();
      g.textBaseline = "alphabetic";
    }

    function drawHero(pl) {
      const active = pl.idx === turn && !busy && !over;
      g.save();
      g.translate(pl.x, pl.y);
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.beginPath();
      g.ellipse(0, HERO_R + 9, 25, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.color;
      roundRect(g, -13, -2, 26, 34, 8);
      g.fill();
      g.fillStyle = active ? "#ffd166" : "#f8fafc";
      g.beginPath();
      g.arc(0, -12, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#111827";
      g.font = "900 9px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("P" + (pl.idx + 1), 0, -12);
      g.strokeStyle = "#c9a98a";
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(pl.facing * 8, 8);
      g.lineTo(pl.facing * 20, -16);
      g.moveTo(pl.facing * 20, -16);
      g.lineTo(pl.facing * 28, -7);
      g.moveTo(pl.facing * 20, -16);
      g.lineTo(pl.facing * 13, -5);
      g.stroke();
      const hpPct = Math.max(0, pl.hp / MAX_HP);
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(-25, -42, 50, 6);
      g.fillStyle = hpPct > 0.34 ? "#6ee7b7" : "#ff5d73";
      g.fillRect(-25, -42, 50 * hpPct, 6);
      g.restore();
      g.textBaseline = "alphabetic";
    }

    function drawAim() {
      if (busy || over) return;
      const pl = players[turn];
      const a = slingAnchor(pl);
      const pull = { x: a.x - pl.aim.dx, y: a.y - pl.aim.dy };
      const spell = SPELLS[selectedSpell];

      g.save();
      g.strokeStyle = "rgba(255,255,255,0.76)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(pull.x, pull.y);
      g.stroke();
      g.strokeStyle = pl.color;
      g.setLineDash([9, 8]);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(a.x + pl.aim.dx * 1.45, a.y + pl.aim.dy * 1.45);
      g.stroke();
      g.setLineDash([]);

      const points = predict(pl, spell);
      g.fillStyle = spell.color;
      points.forEach((pt, i) => {
        g.globalAlpha = Math.max(0.18, 0.9 - i * 0.035);
        g.beginPath();
        g.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      g.fillStyle = spell.color;
      g.font = "800 13px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(`${spell.label} · ${Math.round(aimPower(pl) / MAX_DRAG * 100)} lực`, a.x, a.y - 44);
      g.restore();
    }

    function predict(pl, spell) {
      const a = slingAnchor(pl);
      let x = a.x, y = a.y, vx = pl.aim.dx * POWER_SCALE, vy = pl.aim.dy * POWER_SCALE;
      const pts = [];
      for (let i = 0; i < 34; i++) {
        vx += wind * 2;
        vy += GRAVITY * spell.gravity * 2;
        x += vx * 2;
        y += vy * 2;
        if (i % 2 === 0) pts.push({ x, y });
        if (y > FLOOR || x < 18 || x > W - 18 || y < 12) break;
      }
      return pts;
    }

    function drawProjectile() {
      if (!projectile) return;
      const spell = SPELLS[projectile.spellId];
      projectile.trail.forEach((pt, i) => {
        g.globalAlpha = i / projectile.trail.length * 0.35;
        g.fillStyle = spell.color;
        g.beginPath();
        g.arc(pt.x, pt.y, Math.max(2, projectile.r * 0.65), 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      const grad = g.createRadialGradient(projectile.x - 3, projectile.y - 4, 1, projectile.x, projectile.y, projectile.r + 5);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.28, spell.color);
      grad.addColorStop(1, "#202436");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(projectile.x, projectile.y, projectile.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.45)";
      g.stroke();
      if (projectile.bounces > 0) {
        g.fillStyle = "#101422";
        g.font = "800 8px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(projectile.bounces), projectile.x, projectile.y);
        g.textBaseline = "alphabetic";
      }
    }

    function drawParticles() {
      particles.forEach((p) => {
        g.globalAlpha = Math.max(0, p.life / 30);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
    }

    function drawExplosions() {
      explosions.forEach((ex) => {
        g.save();
        const alpha = Math.max(0, 1 - ex.r / (ex.max + STOP_EXPLOSION));
        g.globalAlpha = alpha;
        g.fillStyle = ex.color;
        g.beginPath();
        g.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.72)";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(ex.x, ex.y, Math.max(3, ex.r * 0.68), 0, Math.PI * 2);
        g.stroke();
        g.restore();
      });
    }

    function drawFloaters() {
      floaters.forEach((f) => {
        g.globalAlpha = Math.max(0, f.life / 42);
        g.fillStyle = f.color;
        g.font = "900 15px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;
    }

    function slingAnchor(pl) {
      return { x: pl.x + pl.facing * 20, y: pl.y - 15 };
    }

    function aimPower(pl) {
      return Math.min(MAX_DRAG, Math.hypot(pl.aim.dx, pl.aim.dy));
    }

    function circleRect(cx, cy, r, rect) {
      return rectDistance(cx, cy, rect) <= r;
    }

    function rectDistance(cx, cy, rect) {
      const x = clamp(cx, rect.x, rect.x + rect.w);
      const y = clamp(cy, rect.y, rect.y + rect.h);
      return dist(cx, cy, x, y);
    }

    function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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

    function loop() {
      if (projectile) stepProjectile();
      // hiệu ứng
      explosions.forEach((ex) => { ex.r += 4.5; });
      explosions = explosions.filter((ex) => ex.r < ex.max + STOP_EXPLOSION);
      particles.forEach((p) => { p.vx *= 0.96; p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.life--; });
      particles = particles.filter((p) => p.life > 0);
      floaters.forEach((f) => { f.y -= 0.6; f.life--; });
      floaters = floaters.filter((f) => f.life > 0);
      if (shake > 0) shake = Math.max(0, shake - 0.8);
      if (pendingResolve && explosions.length === 0 && particles.length === 0) {
        pendingResolve = false;
        resolveTurn();
      }
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

    ctx.setTurn(0);
    renderHud();
    syncControls();
    updateStatus();
    draw();
    raf = requestAnimationFrame(loop);
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "slingshotbattle",
    name: "Slingshot Battle",
    emoji: "🏹",
    description: "Kéo thả bắn đá hoặc phép qua chướng ngại. Có thùng nổ TNT nổ dây chuyền, thùng vật phẩm và đạn chùm — tính gió, bật tường, nổ gây sát thương.",
    onlineReady: true,
    options: [
      {
        id: "hp", label: "Máu mỗi người", default: 100,
        choices: [
          { value: 75, label: "75 (nhanh)" },
          { value: 100, label: "100" },
          { value: 130, label: "130 (lâu)" },
        ],
      },
      {
        id: "obstacles", label: "Chướng ngại", default: 5,
        choices: [
          { value: 3, label: "Ít" },
          { value: 5, label: "Vừa" },
          { value: 7, label: "Nhiều" },
        ],
      },
      {
        id: "wind", label: "Gió", default: 1,
        choices: [
          { value: 0, label: "Tắt" },
          { value: 1, label: "Vừa" },
          { value: 2, label: "Mạnh" },
        ],
      },
      {
        id: "mana", label: "Mana tối đa", default: 6,
        choices: [
          { value: 4, label: "4 mana" },
          { value: 6, label: "6 mana" },
          { value: 8, label: "8 mana" },
        ],
      },
    ],
    howTo: [
      "Hai nhân vật đứng hai bên sân. Đến lượt mình, kéo từ nhân vật ra phía sau để căng dây, thả ra để bắn (hoặc bấm Bắn). Đường chấm cho biết hướng bay dự kiến.",
      "🛢️ Thùng nổ TNT: bắn trúng (hoặc nổ gần) sẽ phát nổ rất mạnh và kích nổ DÂY CHUYỀN các thùng khác — dùng để dồn sát thương lớn vào đối thủ.",
      "📦 Thùng vật phẩm: bắn vỡ để NHẬN thưởng — ✦ +3 mana hoặc ✚ +25 máu (người bắn vỡ được nhận).",
      "Phép: Đá (miễn phí, nảy 1), Cầu lửa (2 mana, nổ lớn), Bật tường (1 mana, nảy nhiều), Bùa nhẹ (2 mana, bay xa), Đạn chùm (3 mana, nổ 3 điểm diện rộng).",
      "Gió đổi mỗi lượt. Chướng ngại có máu, va chạm hoặc nổ gần sẽ vỡ dần. Vụ nổ càng gần nhân vật càng đau.",
      "Hạ đối thủ trước để thắng. Chơi online: mỗi lượt chỉ gửi vector kéo và loại đạn, hai máy tự mô phỏng cùng kết quả.",
    ],
    create,
  });
})();
