/* Pool Battle - bi-a doi khang theo luot, co vat ly va power-up. */
(function () {
  const W = 820;
  const H = 500;
  const LEFT = 54;
  const RIGHT = W - 54;
  const TOP = 58;
  const BOTTOM = H - 46;
  const BALL_R = 10;
  const CUE_R = 11;
  const POCKET_R = 17;
  const CUSHION = 0.86;
  const STOP_SPEED = 0.045;
  const SUBSTEPS = 4;
  const MAX_FRAMES = 1500;
  const POWER_SCALE = 0.42;
  const TOKEN_KEYS = ["bomb", "power", "widen"];

  const MODE_DEFS = {
    normal: { label: "Chọc thường", icon: "CUE", hint: "không tốn" },
    bomb: { label: "Bóng nổ", icon: "BOOM", hint: "va chạm đầu" },
    power: { label: "Siêu lực", icon: "PWR", hint: "bắn cực mạnh" },
    widen: { label: "Lỗ to", icon: "HOLE", hint: "lỗ rộng cú này" },
  };

  const TOKEN_DEFS = {
    bomb: { label: "Bóng nổ", color: "#ff9f5d", letter: "B" },
    power: { label: "Siêu lực", color: "#ffd166", letter: "P" },
    widen: { label: "Lỗ to", color: "#8be6f0", letter: "O" },
  };

  const POCKETS = [
    { x: LEFT, y: TOP },
    { x: W / 2, y: TOP - 2 },
    { x: RIGHT, y: TOP },
    { x: LEFT, y: BOTTOM },
    { x: W / 2, y: BOTTOM + 2 },
    { x: RIGHT, y: BOTTOM },
  ];

  const OBJECT_COLORS = [
    "#ffd166", "#6ee7b7", "#f779a0", "#8be6f0", "#c792ea",
    "#ffb86b", "#9bd86d", "#ef476f", "#5dd8ff", "#f4d35e", "#b8f2e6",
  ];

  function create(ctx) {
    const o = ctx.options || {};
    const TARGET = o.target || 7;
    const OBJECTS = o.balls || 9;
    const TOKEN_COUNT = o.powerups == null ? 2 : o.powerups;
    const friction = o.cloth === "fast" ? 0.992 : o.cloth === "heavy" ? 0.983 : 0.988;

    const players = [
      { angle: 0, power: 64, color: "#ff5d73", name: "Đỏ" },
      { angle: 180, power: 64, color: "#4dd0e1", name: "Xanh" },
    ];
    const scores = [0, 0];
    const inventory = [
      { bomb: TOKEN_COUNT ? 1 : 0, power: TOKEN_COUNT ? 1 : 0, widen: TOKEN_COUNT ? 1 : 0 },
      { bomb: TOKEN_COUNT ? 1 : 0, power: TOKEN_COUNT ? 1 : 0, widen: TOKEN_COUNT ? 1 : 0 },
    ];

    const balls = makeBalls(OBJECTS);
    const tokens = [];
    spawnRoundTokens(); // vật phẩm xuất hiện ngẫu nhiên mỗi vòng

    let turn = 0;
    let selectedMode = "normal";
    let busy = false;
    let over = false;
    let raf = null;
    let shot = null;
    let settledFrames = 0;
    let tick = 0;
    const particles = [];
    const floaters = [];
    let shake = 0;
    let last = ctx.t("Ngắm hướng, chỉnh lực rồi chọc bi.", "Aim, set power, then strike the cue ball.");
    const MODE_EN = { "Chọc thường": "Normal", "Bóng nổ": "Bomb ball", "Siêu lực": "Power", "Lỗ to": "Wide pocket" };
    const MHINT_EN = { "không tốn": "free", "va chạm đầu": "first contact", "bắn cực mạnh": "extra strong", "lỗ rộng cú này": "wider pockets this shot" };
    const modeLabel = (l) => ctx.t(l, MODE_EN[l] || l);

    const root = document.createElement("div");
    root.className = "pool-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "pool-hud";
    root.appendChild(hud);

    const tableWrap = document.createElement("div");
    tableWrap.className = "pool-table-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "pool-canvas";
    tableWrap.appendChild(canvas);
    root.appendChild(tableWrap);
    const g = canvas.getContext("2d");

    const legend = document.createElement("div");
    legend.className = "pool-legend";
    legend.innerHTML =
      `<b>${ctx.t("Power-up (đổi mới mỗi vòng — nhặt khi bi chạm):", "Power-ups (refresh each round — grab by touching with a ball):")}</b>` +
      Object.keys(TOKEN_DEFS).map((id) => {
        const d = TOKEN_DEFS[id];
        return `<span class="pool-legend-item"><i class="pool-mini" style="background:${d.color}">${d.letter}</i>${ctx.t(d.label, MODE_EN[d.label] || d.label)}</span>`;
      }).join("");
    root.appendChild(legend);

    const controls = document.createElement("div");
    controls.className = "pool-controls";
    controls.innerHTML = `
      <div class="pool-field">
        <label>${ctx.t("Hướng", "Direction")}</label>
        <input class="pool-angle" type="range" min="0" max="359" value="0">
        <span class="pool-val pool-angle-val">0°</span>
      </div>
      <div class="pool-field">
        <label>${ctx.t("Lực", "Power")}</label>
        <input class="pool-power" type="range" min="20" max="100" value="64">
        <span class="pool-val pool-power-val">64</span>
      </div>
      <div class="pool-modes"></div>
      <button class="btn primary pool-shoot" type="button">${ctx.t("Chọc bi", "Strike")}</button>
    `;
    root.appendChild(controls);

    const angleInput = controls.querySelector(".pool-angle");
    const powerInput = controls.querySelector(".pool-power");
    const angleVal = controls.querySelector(".pool-angle-val");
    const powerVal = controls.querySelector(".pool-power-val");
    const modeBox = controls.querySelector(".pool-modes");
    const shootBtn = controls.querySelector(".pool-shoot");

    Object.keys(MODE_DEFS).forEach((id) => {
      const def = MODE_DEFS[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small pool-mode";
      btn.dataset.mode = id;
      btn.innerHTML = `<span>${def.icon}</span><b>${modeLabel(def.label)}</b><small>${ctx.t(def.hint, MHINT_EN[def.hint] || def.hint)}</small>`;
      btn.addEventListener("click", () => {
        if (!canControl()) return;
        if (id !== "normal" && inventory[turn][id] <= 0) return;
        selectedMode = id;
        renderHud();
        syncControls();
        draw();
      });
      modeBox.appendChild(btn);
    });

    angleInput.addEventListener("input", () => {
      players[turn].angle = Number(angleInput.value);
      syncControlLabels();
      draw();
    });
    powerInput.addEventListener("input", () => {
      players[turn].power = Number(powerInput.value);
      syncControlLabels();
      draw();
    });
    shootBtn.addEventListener("click", () => shoot());

    let aimingPointer = false;
    let pullPoint = null;
    let didPull = false;
    let ballInHand = false;   // được quyền đặt bi cái ở bất kỳ đâu
    let pendingBIH = false;   // lượt sau (đối thủ) sẽ được đặt bi
    let placePoint = null;    // vị trí con trỏ khi đang đặt bi
    canvas.addEventListener("pointerdown", (e) => {
      if (!canControl()) return;
      if (ballInHand) { placeCue(pointerPos(e)); return; }
      aimingPointer = true;
      didPull = false;
      canvas.setPointerCapture(e.pointerId);
      aimFromPointer(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!canControl()) return;
      if (ballInHand) { placePoint = pointerPos(e); draw(); return; }
      if (!aimingPointer) return;
      aimFromPointer(e);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      const wasAiming = aimingPointer;
      aimingPointer = false;
      pullPoint = null;
      if (wasAiming && canControl() && !ballInHand && didPull && players[turn].power >= 22) shoot();
      else draw();
    });
    canvas.addEventListener("pointercancel", () => { aimingPointer = false; pullPoint = null; draw(); });

    // đặt bi cái vào vị trí hợp lệ (ball-in-hand)
    function placeCue(p) {
      const cue = cueBall();
      if (!cue) return;
      const x = clamp(p.x, LEFT + cue.r, RIGHT - cue.r);
      const y = clamp(p.y, TOP + cue.r, BOTTOM - cue.r);
      const ok = !POCKETS.some((pk) => dist(x, y, pk.x, pk.y) < POCKET_R + cue.r) &&
        !balls.some((b) => b !== cue && b.active && dist(x, y, b.x, b.y) < b.r + cue.r + 1);
      if (!ok) { ctx.sound("miss"); return; }
      cue.x = x;
      cue.y = y;
      cue.active = true;
      ballInHand = false;
      placePoint = null;
      ctx.sound("place");
      updateStatus();
      syncControls();
      draw();
    }

    function makeBalls(count) {
      const out = [
        { id: "cue", kind: "cue", x: LEFT + 150, y: H / 2, vx: 0, vy: 0, r: CUE_R, color: "#f7f7ff", active: true },
      ];
      const spots = [
        [0, 0],
        [-22, -13], [-22, 13],
        [22, -13], [22, 13],
        [-44, 0], [44, 0],
        [0, -26], [0, 26],
        [-44, -26], [-44, 26],
      ];
      for (let i = 0; i < count; i++) {
        const s = spots[i % spots.length];
        out.push({
          id: "obj" + i,
          kind: "object",
          number: i + 1,
          x: W / 2 + s[0],
          y: H / 2 + s[1],
          vx: 0,
          vy: 0,
          r: BALL_R,
          color: OBJECT_COLORS[i % OBJECT_COLORS.length],
          active: true,
        });
      }
      return out;
    }

    function spawnRoundTokens() {
      tokens.length = 0;
      if (TOKEN_COUNT <= 0) return;
      // tỉ lệ xuất hiện thấp: mỗi suất chỉ ~35% có item, nhiều vòng sẽ trống
      let want = 0;
      for (let i = 0; i < TOKEN_COUNT; i++) if (ctx.rng() < 0.35) want++;
      let guard = 0;
      while (tokens.length < want && guard++ < 600) {
        const x = LEFT + 86 + ctx.rng() * (RIGHT - LEFT - 172);
        const y = TOP + 70 + ctx.rng() * (BOTTOM - TOP - 140);
        const type = TOKEN_KEYS[Math.floor(ctx.rng() * TOKEN_KEYS.length)];
        if (POCKETS.some((p) => dist(x, y, p.x, p.y) < 70)) continue;
        if (balls.some((b) => b.active && dist(x, y, b.x, b.y) < 54)) continue;
        if (tokens.some((t) => dist(x, y, t.x, t.y) < 70)) continue;
        tokens.push({ id: tokens.length, x, y, type, active: true, r: 14 });
      }
    }

    function canControl() {
      return !busy && !over && (!ctx.isOnline || turn === ctx.mySeat);
    }

    function aimFromPointer(e) {
      const p = pointerPos(e);
      const cue = cueBall();
      if (!cue || !cue.active) return;
      pullPoint = p;
      // kéo giàn thun: hướng bắn = từ con trỏ về phía bi cái, kéo càng xa lực càng mạnh
      const dx = cue.x - p.x;
      const dy = cue.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) return;
      didPull = true;
      players[turn].angle = normalizeDeg(Math.atan2(dy, dx) * 180 / Math.PI);
      players[turn].power = clamp(Math.round(d / 1.4), 20, 100);
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

    function shoot() {
      if (!canControl()) return;
      const pl = players[turn];
      applyMove({ angle: pl.angle, power: pl.power, mode: selectedMode }, false);
    }

    function applyMove(move, fromRemote) {
      if (busy || over) return;
      if (!fromRemote && !canControl()) return;
      const pl = players[turn];
      pl.angle = normalizeDeg(Number(move.angle || 0));
      pl.power = clamp(Number(move.power || 60), 20, 100);

      // đồng bộ vị trí bi cái (trường hợp đối thủ đặt bi sau khi mình phạm lỗi)
      const cue = cueBall();
      if (fromRemote && cue && typeof move.cx === "number" && typeof move.cy === "number") {
        cue.x = clamp(move.cx, LEFT + cue.r, RIGHT - cue.r);
        cue.y = clamp(move.cy, TOP + cue.r, BOTTOM - cue.r);
        cue.active = true;
        ballInHand = false;
      }

      let mode = MODE_DEFS[move.mode] ? move.mode : "normal";
      if (mode !== "normal") {
        if (!fromRemote && inventory[turn][mode] <= 0) mode = "normal";
        else inventory[turn][mode] = Math.max(0, inventory[turn][mode] - 1);
      }
      if (!fromRemote) ctx.sendMove({ angle: pl.angle, power: pl.power, mode, cx: cue ? cue.x : 0, cy: cue ? cue.y : 0 });
      startShot(mode);
    }

    function startShot(mode) {
      ballInHand = false;
      const cue = cueBall();
      if (!cue.active) respawnCue();
      const pl = players[turn];
      const rad = pl.angle * Math.PI / 180;
      const speed = pl.power * POWER_SCALE * (mode === "power" ? 1.7 : 1);
      cue.vx += Math.cos(rad) * speed;
      cue.vy += Math.sin(rad) * speed;
      shot = {
        owner: turn,
        mode,
        frames: 0,
        bombReady: mode === "bomb",
        pocketBonus: mode === "widen" ? 16 : 0,
        scored: 0,
        foul: false,
        pocketed: [],
        gained: [],
        blast: null,
      };
      busy = true;
      settledFrames = 0;
      selectedMode = "normal";
      last = mode === "normal"
        ? ctx.t(`Người chơi ${turn + 1} chọc bi.`, `Player ${turn + 1} strikes.`)
        : ctx.t(`Người chơi ${turn + 1} dùng ${MODE_DEFS[mode].label}.`, `Player ${turn + 1} uses ${modeLabel(MODE_DEFS[mode].label)}.`);
      ctx.sound(mode === "normal" ? "shot" : "capture");
      renderHud();
      syncControls();
      updateStatus();
    }

    function stepPhysics() {
      if (!shot) return;
      shot.frames++;
      for (let i = 0; i < SUBSTEPS; i++) {
        applyShotForces();
        balls.forEach(moveBall);
        balls.forEach(resolvePocketAndRails);
        resolveCollisions();
        collectTokens();
      }

      if (shot.blast) {
        shot.blast.r += 5;
        if (shot.blast.r >= shot.blast.max) shot.blast = null;
      }

      if (allStopped()) settledFrames++;
      else settledFrames = 0;
      if (settledFrames > 18 || shot.frames > MAX_FRAMES) endShot();
    }

    function applyShotForces() {
      // Không còn lực đặc biệt theo từng khung cho power-up hiện tại.
    }

    function moveBall(b) {
      if (!b.active) return;
      b.x += b.vx / SUBSTEPS;
      b.y += b.vy / SUBSTEPS;
      const f = Math.pow(friction, 1 / SUBSTEPS);
      b.vx *= f;
      b.vy *= f;
      if (Math.abs(b.vx) < STOP_SPEED && Math.abs(b.vy) < STOP_SPEED) {
        b.vx = 0;
        b.vy = 0;
      }
    }

    function resolvePocketAndRails(b) {
      if (!b.active) return;
      const pocket = POCKETS.find((p) => dist(b.x, b.y, p.x, p.y) < POCKET_R + (shot ? shot.pocketBonus || 0 : 0));
      if (pocket) {
        pocketBall(b);
        return;
      }
      if (b.x < LEFT + b.r) {
        b.x = LEFT + b.r;
        b.vx = Math.abs(b.vx) * CUSHION;
      } else if (b.x > RIGHT - b.r) {
        b.x = RIGHT - b.r;
        b.vx = -Math.abs(b.vx) * CUSHION;
      }
      if (b.y < TOP + b.r) {
        b.y = TOP + b.r;
        b.vy = Math.abs(b.vy) * CUSHION;
      } else if (b.y > BOTTOM - b.r) {
        b.y = BOTTOM - b.r;
        b.vy = -Math.abs(b.vy) * CUSHION;
      }
    }

    function pocketBall(b) {
      b.active = false;
      b.vx = 0;
      b.vy = 0;
      spawnSparks(b.x, b.y, b.color, 14);
      if (!shot) return;
      if (b.kind === "object") {
        scores[turn] += 1;
        shot.scored += 1;
        shot.pocketed.push(b.number);
        addFloater(b.x, b.y, "+1", turn === 0 ? "#ff91a2" : "#8be6f0");
        ctx.sound("score");
      } else if (b.kind === "cue") {
        shot.foul = true;
        addFloater(b.x, b.y, ctx.t("LỖI", "FOUL"), "#ff5d73");
        ctx.sound("miss");
      }
      renderHud();
    }

    function resolveCollisions() {
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (!a.active) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (!b.active) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (d >= min || d <= 0) continue;
          const nx = dx / d;
          const ny = dy / d;
          const overlap = (min - d) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel > 0) {
            const impulse = rel * 0.98;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            if (rel > 2.4) spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffffff", 4);
            ctx.sound("place");
          }

          const currentCue = cueBall(turn);
          if (shot && shot.bombReady && currentCue && (a === currentCue || b === currentCue)) {
            shot.bombReady = false;
            explode((a.x + b.x) / 2, (a.y + b.y) / 2);
          }
        }
      }
    }

    function explode(x, y) {
      if (!shot) return;
      shot.blast = { x, y, r: 8, max: 96 };
      shake = Math.min(16, shake + 11);
      spawnSparks(x, y, "#ff9f5d", 26);
      balls.forEach((b) => {
        if (!b.active) return;
        const dx = b.x - x;
        const dy = b.y - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 124) return;
        const force = 7.6 * (1 - d / 124);
        b.vx += dx / d * force;
        b.vy += dy / d * force;
      });
      ctx.sound("explode");
    }

    function spawnSparks(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 3.5;
        particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 12 + Math.random() * 14, color });
      }
    }

    function addFloater(x, y, text, color) {
      floaters.push({ x, y, text, color, life: 44 });
    }

    function collectTokens() {
      if (!shot) return;
      tokens.forEach((t) => {
        if (!t.active) return;
        const touched = balls.some((b) => b.active && dist(b.x, b.y, t.x, t.y) < b.r + t.r);
        if (!touched) return;
        t.active = false;
        inventory[turn][t.type] += 1;
        shot.gained.push(t.type);
        ctx.sound("select");
        renderHud();
      });
    }

    function endShot() {
      balls.forEach((b) => { b.vx = 0; b.vy = 0; });
      if (shot && shot.foul) { scores[1 - turn] += 1; pendingBIH = true; }
      respawnCue();

      if (shot) {
        const bits = [];
        if (shot.scored >= 2) {
          scores[turn] += 1; // thưởng combo
          const cue = cueBall();
          addFloater(cue ? cue.x : W / 2, cue ? cue.y - 30 : H / 2, `COMBO x${shot.scored} +1`, "#ffd166");
          bits.push(ctx.t(`COMBO x${shot.scored} (+1 thưởng)`, `COMBO x${shot.scored} (+1 bonus)`));
        }
        if (shot.pocketed.length) bits.push(ctx.t(`ăn ${shot.pocketed.length} bi`, `potted ${shot.pocketed.length}`));
        if (shot.foul) bits.push(ctx.t("lỗi bi cái, đối thủ +1", "cue foul, opponent +1"));
        if (shot.gained.length) bits.push(ctx.t(`nhặt ${shot.gained.length} power-up`, `grabbed ${shot.gained.length} power-up(s)`));
        last = bits.length ? ctx.t(`Người chơi ${turn + 1} ${bits.join(", ")}.`, `Player ${turn + 1} ${bits.join(", ")}.`) : ctx.t(`Người chơi ${turn + 1} chưa ăn được bi.`, `Player ${turn + 1} didn't pot anything.`);
      }

      busy = false;
      shot = null;
      renderHud();

      if (checkEnd()) {
        syncControls();
        draw();
        return;
      }

      turn = 1 - turn;
      ballInHand = pendingBIH; // đối thủ được đặt bi nếu vừa có lỗi bi cái
      pendingBIH = false;
      if (turn === 0 && TOKEN_COUNT > 0) {
        spawnRoundTokens(); // hết một vòng (cả 2 đã bắn) -> vật phẩm mới ở vị trí khác
        last += " ✨ Vật phẩm mới xuất hiện!";
      }
      normalizeSelectedMode();
      ctx.setTurn(turn);
      updateStatus();
      syncControls();
      draw();
    }

    function checkEnd() {
      const noObjects = balls.every((b) => b.kind !== "object" || !b.active);
      if (scores[0] < TARGET && scores[1] < TARGET && !noObjects) return false;
      over = true;
      ctx.setTurn(-1);
      if (scores[0] === scores[1]) {
        ctx.setStatus(ctx.t(`🤝 Hòa ${scores[0]}-${scores[1]}!`, `🤝 Draw ${scores[0]}-${scores[1]}!`));
        return true;
      }
      const winner = scores[0] > scores[1] ? 0 : 1;
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng Pool Battle ${scores[0]}-${scores[1]}!`,
        `🎉 Player ${winner + 1} wins Pool Battle ${scores[0]}-${scores[1]}!`));
      return true;
    }

    function respawnCue() {
      const cue = cueBall();
      if (!cue || cue.active) return;
      const home = { x: LEFT + 150, y: H / 2 };
      const offsets = [
        [0, 0], [0, -32], [0, 32], [32, 0], [-32, 0],
        [42, -30], [-42, 30], [42, 30], [-42, -30],
      ];
      let spot = home;
      for (const [ox, oy] of offsets) {
        const x = clamp(home.x + ox, LEFT + cue.r, RIGHT - cue.r);
        const y = clamp(home.y + oy, TOP + cue.r, BOTTOM - cue.r);
        const blocked = balls.some((b) => b !== cue && b.active && dist(x, y, b.x, b.y) < b.r + cue.r + 4);
        if (!blocked) { spot = { x, y }; break; }
      }
      cue.x = spot.x;
      cue.y = spot.y;
      cue.vx = 0;
      cue.vy = 0;
      cue.active = true;
    }

    function cueBall() {
      return balls.find((b) => b.kind === "cue");
    }

    function allStopped() {
      return balls.every((b) => !b.active || speedOf(b) <= STOP_SPEED);
    }

    function speedOf(b) {
      return Math.hypot(b.vx, b.vy);
    }

    function renderHud() {
      hud.innerHTML = `
        ${playerHud(0)}
        <div class="pool-mid">
          <b>${over ? ctx.t("Kết thúc", "Finished") : busy ? ctx.t("Bi đang lăn", "Balls rolling") : ctx.t("Lượt Người chơi ", "Player ") + (turn + 1) + ctx.t("", "'s turn")}</b>
          <span>${ctx.t(`Đích ${TARGET} điểm · Còn ${activeObjects()} bi`, `Target ${TARGET} pts · ${activeObjects()} balls left`)}</span>
          <small>${last}</small>
        </div>
        ${playerHud(1)}
      `;
    }

    function playerHud(idx) {
      const inv = inventory[idx];
      return `
        <div class="pool-player p${idx + 1} ${idx === turn && !over ? "active" : ""}">
          <span>${ctx.t("Người chơi", "Player")} ${idx + 1}</span>
          <b>${scores[idx]} ${ctx.t("điểm", "pts")}</b>
          <em>
            <i class="pool-mini bomb">B</i>${inv.bomb}
            <i class="pool-mini power">P</i>${inv.power}
            <i class="pool-mini widen">O</i>${inv.widen}
          </em>
        </div>
      `;
    }

    function syncControls() {
      normalizeSelectedMode();
      const pl = players[turn];
      angleInput.value = pl.angle;
      powerInput.value = pl.power;
      syncControlLabels();
      const lock = !canControl();
      angleInput.disabled = lock;
      powerInput.disabled = lock;
      shootBtn.disabled = lock;
      modeBox.querySelectorAll(".pool-mode").forEach((btn) => {
        const id = btn.dataset.mode;
        const disabled = lock || (id !== "normal" && inventory[turn][id] <= 0);
        btn.disabled = disabled;
        btn.classList.toggle("active", id === selectedMode);
      });
    }

    function syncControlLabels() {
      angleVal.textContent = Math.round(players[turn].angle) + "°";
      powerVal.textContent = Math.round(players[turn].power);
    }

    function normalizeSelectedMode() {
      if (selectedMode !== "normal" && inventory[turn][selectedMode] <= 0) selectedMode = "normal";
    }

    function updateStatus() {
      if (over) return;
      if (busy) {
        ctx.setStatus(ctx.t("Bi đang lăn, chờ bàn dừng lại.", "Balls rolling — wait for the table to settle."));
      } else if (ballInHand && (!ctx.isOnline || turn === ctx.mySeat)) {
        ctx.setStatus(ctx.t("🖐️ Bi trong tay: đối thủ đã làm rớt bi cái! Bấm lên bàn để đặt bi ở vị trí bất kỳ, rồi kéo để bắn.",
          "🖐️ Ball in hand: opponent scratched! Click the table to place the cue ball anywhere, then drag to shoot."));
      } else if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang ngắm. ${last}`, `Opponent is aiming. ${last}`));
      } else {
        ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: kéo trên bàn hoặc chỉnh hướng/lực, chọn power-up rồi chọc bi.`,
          `Player ${turn + 1}: drag on the table or set direction/power, pick a power-up, then strike.`));
      }
    }

    function activeObjects() {
      return balls.filter((b) => b.kind === "object" && b.active).length;
    }

    function draw() {
      g.clearRect(0, 0, W, H);
      g.save();
      if (shake > 0.3) g.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      drawTable();
      tokens.forEach(drawToken);
      balls.forEach(drawBall);
      drawAim();
      drawPlacement();
      drawShotEffects();
      drawParticles();
      drawFloaters();
      g.restore();
    }

    function drawPlacement() {
      if (!ballInHand || !canControl()) return;
      const cue = cueBall();
      g.fillStyle = "rgba(255,209,102,0.95)";
      g.font = "900 14px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(ctx.t("🖐️ Đặt bi cái: bấm vào bàn ở vị trí bất kỳ", "🖐️ Place cue ball: click anywhere on the table"), W / 2, TOP + 18);
      g.textAlign = "left";
      const p = placePoint;
      if (p && cue) {
        const x = clamp(p.x, LEFT + cue.r, RIGHT - cue.r);
        const y = clamp(p.y, TOP + cue.r, BOTTOM - cue.r);
        const ok = !POCKETS.some((pk) => dist(x, y, pk.x, pk.y) < POCKET_R + cue.r) &&
          !balls.some((b) => b !== cue && b.active && dist(x, y, b.x, b.y) < b.r + cue.r + 1);
        g.save();
        g.globalAlpha = 0.6;
        g.fillStyle = ok ? "#f7f7ff" : "#ff5d73";
        g.beginPath(); g.arc(x, y, cue.r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = ok ? "rgba(110,231,183,0.95)" : "rgba(255,93,115,0.95)";
        g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, cue.r + 4, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    }

    function drawParticles() {
      particles.forEach((p) => {
        g.globalAlpha = Math.max(0, p.life / 26);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
    }

    function drawFloaters() {
      floaters.forEach((f) => {
        g.globalAlpha = Math.max(0, f.life / 44);
        g.fillStyle = f.color;
        g.font = "900 16px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(f.text, f.x, f.y);
      });
      g.globalAlpha = 1;
      g.textAlign = "left";
    }

    function drawTable() {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#12182e");
      bg.addColorStop(1, "#0a1020");
      g.fillStyle = bg;
      g.fillRect(-24, -24, W + 48, H + 48);

      roundedRect(g, LEFT - 44, TOP - 44, RIGHT - LEFT + 88, BOTTOM - TOP + 88, 30);
      const wood = g.createLinearGradient(0, TOP - 44, 0, BOTTOM + 44);
      wood.addColorStop(0, "#7a4a2b");
      wood.addColorStop(0.5, "#4e2c18");
      wood.addColorStop(1, "#37200f");
      g.fillStyle = wood;
      g.fill();
      g.strokeStyle = "rgba(255,205,150,0.28)";
      g.lineWidth = 2;
      roundedRect(g, LEFT - 44, TOP - 44, RIGHT - LEFT + 88, BOTTOM - TOP + 88, 30);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.45)";
      g.lineWidth = 2;
      roundedRect(g, LEFT - 16, TOP - 16, RIGHT - LEFT + 32, BOTTOM - TOP + 32, 20);
      g.stroke();

      // đệm băng (cushion) xanh đậm quanh mặt nỉ
      roundedRect(g, LEFT - 14, TOP - 14, RIGHT - LEFT + 28, BOTTOM - TOP + 28, 18);
      const rail = g.createLinearGradient(LEFT, TOP - 14, RIGHT, BOTTOM + 14);
      rail.addColorStop(0, "#125c44");
      rail.addColorStop(0.5, "#0d4636");
      rail.addColorStop(1, "#0f3f44");
      g.fillStyle = rail;
      g.fill();

      roundedRect(g, LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP, 16);
      const felt = g.createLinearGradient(LEFT, TOP, RIGHT, BOTTOM);
      felt.addColorStop(0, "#12745d");
      felt.addColorStop(0.52, "#0f604f");
      felt.addColorStop(1, "#154c59");
      g.fillStyle = felt;
      g.fill();

      // ánh sáng đèn giữa bàn
      const spot = g.createRadialGradient(W / 2, (TOP + BOTTOM) / 2, 40, W / 2, (TOP + BOTTOM) / 2, (RIGHT - LEFT) / 1.5);
      spot.addColorStop(0, "rgba(255,255,255,0.12)");
      spot.addColorStop(1, "rgba(0,0,0,0.18)");
      g.fillStyle = spot;
      roundedRect(g, LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP, 16);
      g.fill();

      // nút định vị trên thành (diamonds) - nằm trên khung gỗ
      g.fillStyle = "rgba(245,238,210,0.9)";
      const dx4 = (RIGHT - LEFT) / 4;
      for (let i = 1; i < 4; i++) {
        if (i === 2) continue; // giữa là hố
        diamond(LEFT + dx4 * i, TOP - 30);
        diamond(LEFT + dx4 * i, BOTTOM + 30);
      }
      const dy2 = (BOTTOM - TOP) / 2;
      diamond(LEFT - 30, TOP + dy2);
      diamond(RIGHT + 30, TOP + dy2);

      POCKETS.forEach((p) => {
        // viền da quanh lỗ
        g.fillStyle = "#241a12";
        g.beginPath();
        g.arc(p.x, p.y, POCKET_R + 5, 0, Math.PI * 2);
        g.fill();
        const pocket = g.createRadialGradient(p.x - 3, p.y - 4, 1, p.x, p.y, POCKET_R + 2);
        pocket.addColorStop(0, "#000000");
        pocket.addColorStop(1, "#0b1018");
        g.fillStyle = pocket;
        g.beginPath();
        g.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.1)";
        g.lineWidth = 1;
        g.stroke();
      });

      g.fillStyle = "rgba(255,255,255,0.55)";
      g.font = "700 12px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText("POOL BATTLE", W / 2, TOP - 16);
      g.textAlign = "left";
    }

    function drawToken(t) {
      if (!t.active) return;
      const def = TOKEN_DEFS[t.type];
      g.save();
      g.translate(t.x, t.y);
      g.rotate(Math.PI / 4);
      g.fillStyle = "rgba(0,0,0,0.26)";
      roundedRect(g, -15, -15, 30, 30, 7);
      g.fill();
      g.fillStyle = def.color;
      roundedRect(g, -12, -12, 24, 24, 6);
      g.fill();
      g.restore();
      g.fillStyle = "#101422";
      g.font = "900 14px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(def.letter, t.x, t.y + 1);
      g.textBaseline = "alphabetic";
      // tên ngắn dưới ô để dễ hiểu
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.font = "700 9px Segoe UI, sans-serif";
      g.fillText(modeLabel(def.label), t.x, t.y + 26);
      g.textAlign = "left";
    }

    function drawBall(b) {
      if (!b.active) return;
      g.save();
      g.shadowColor = "rgba(0,0,0,0.35)";
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
      const grad = g.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, b.r + 3);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.22, b.kind === "cue" ? "#f7f7ff" : b.color);
      grad.addColorStop(1, shade(b.kind === "cue" ? b.color : b.color, -35));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;

      if (b.kind === "cue") {
        g.strokeStyle = "rgba(255,255,255,0.55)";
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = "rgba(255,93,115,0.9)";
        g.beginPath();
        g.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = "rgba(255,255,255,0.92)";
        g.beginPath();
        g.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#111827";
        g.font = "800 7px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(b.number), b.x, b.y + 0.3);
      }
      g.restore();
      g.textBaseline = "alphabetic";
    }

    function predictPath(cue, angleDeg) {
      const rad = angleDeg * Math.PI / 180;
      let x = cue.x, y = cue.y;
      let vx = Math.cos(rad), vy = Math.sin(rad);
      const r = cue.r;
      const pts = [{ x, y }];
      let bounces = 0;
      for (let step = 0; step < 320; step++) {
        x += vx * 5; y += vy * 5;
        const pk = POCKETS.find((p) => dist(x, y, p.x, p.y) < POCKET_R);
        if (pk) { pts.push({ x: pk.x, y: pk.y }); return { points: pts, pocket: true }; }
        let hit = null;
        for (const b of balls) {
          if (!b.active || b === cue) continue;
          if (dist(x, y, b.x, b.y) <= r + b.r + 1) { hit = b; break; }
        }
        if (hit) {
          const ang = Math.atan2(hit.y - y, hit.x - x);
          const gx = hit.x - Math.cos(ang) * (r + hit.r);
          const gy = hit.y - Math.sin(ang) * (r + hit.r);
          pts.push({ x: gx, y: gy });
          return { points: pts, ghost: { x: gx, y: gy }, target: hit, targetDir: { x: Math.cos(ang), y: Math.sin(ang) } };
        }
        let bounced = false;
        if (x < LEFT + r) { x = LEFT + r; vx = Math.abs(vx); bounced = true; }
        else if (x > RIGHT - r) { x = RIGHT - r; vx = -Math.abs(vx); bounced = true; }
        if (y < TOP + r) { y = TOP + r; vy = Math.abs(vy); bounced = true; }
        else if (y > BOTTOM - r) { y = BOTTOM - r; vy = -Math.abs(vy); bounced = true; }
        if (bounced) { pts.push({ x, y }); if (++bounces > 2) break; }
      }
      pts.push({ x, y });
      return { points: pts };
    }

    function drawAim() {
      if (busy || over || ballInHand) return;
      const cue = cueBall(turn);
      if (!cue || !cue.active) return;
      const pl = players[turn];
      const rad = pl.angle * Math.PI / 180;

      g.save();
      // dây kéo (giàn thun) khi đang canh bằng chuột
      if (aimingPointer && pullPoint) {
        g.strokeStyle = "rgba(255,255,255,0.4)";
        g.lineWidth = 2;
        g.setLineDash([4, 5]);
        g.beginPath();
        g.moveTo(cue.x, cue.y);
        g.lineTo(pullPoint.x, pullPoint.y);
        g.stroke();
        g.setLineDash([]);
        // chấm tay kéo
        g.fillStyle = pl.color;
        g.beginPath();
        g.arc(pullPoint.x, pullPoint.y, 6, 0, Math.PI * 2);
        g.fill();
        // thanh lực
        g.fillStyle = "rgba(0,0,0,0.5)";
        roundedRect(g, cue.x - 26, cue.y - 40, 52, 7, 3);
        g.fill();
        g.fillStyle = pl.power > 75 ? "#ff5d73" : pl.power > 45 ? "#ffd166" : "#6ee7b7";
        roundedRect(g, cue.x - 26, cue.y - 40, 52 * (pl.power / 100), 7, 3);
        g.fill();
      }
      // gậy chọc phía sau bi
      g.strokeStyle = "rgba(255,255,255,0.72)";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cue.x - Math.cos(rad) * 18, cue.y - Math.sin(rad) * 18);
      g.lineTo(cue.x - Math.cos(rad) * (60 + pl.power * 0.6), cue.y - Math.sin(rad) * (60 + pl.power * 0.6));
      g.stroke();

      // đường quỹ đạo dự đoán (nảy băng)
      const pred = predictPath(cue, pl.angle);
      g.strokeStyle = pl.color;
      g.lineWidth = 2.5;
      g.setLineDash([10, 8]);
      g.beginPath();
      pred.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();
      g.setLineDash([]);

      // bi bóng ma + hướng bi mục tiêu
      if (pred.ghost) {
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(pred.ghost.x, pred.ghost.y, cue.r, 0, Math.PI * 2);
        g.stroke();
        const t = pred.target;
        g.strokeStyle = "rgba(255,209,102,0.9)";
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(t.x, t.y);
        g.lineTo(t.x + pred.targetDir.x * 52, t.y + pred.targetDir.y * 52);
        g.stroke();
      } else if (pred.pocket) {
        const lastP = pred.points[pred.points.length - 1];
        g.fillStyle = "#6ee7b7";
        g.font = "900 13px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText("VÀO HỐ?", lastP.x, lastP.y - 14);
      }
      g.restore();

      if (selectedMode !== "normal") {
        g.fillStyle = TOKEN_DEFS[selectedMode].color;
        g.font = "800 13px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(modeLabel(MODE_DEFS[selectedMode].label), cue.x, cue.y - 28);
        g.textAlign = "left";
      }
    }

    function drawShotEffects() {
      if (!shot) return;
      if (shot.pocketBonus > 0) {
        g.strokeStyle = "rgba(139,230,240,0.55)";
        g.lineWidth = 2;
        g.setLineDash([5, 5]);
        POCKETS.forEach((p) => {
          g.beginPath();
          g.arc(p.x, p.y, POCKET_R + shot.pocketBonus, 0, Math.PI * 2);
          g.stroke();
        });
        g.setLineDash([]);
      }
      if (shot.mode === "power") {
        const cue = cueBall();
        if (cue && cue.active) {
          g.strokeStyle = "rgba(255,209,102,0.5)";
          g.lineWidth = 3;
          g.beginPath();
          g.arc(cue.x, cue.y, cue.r + 5 + (tick % 8), 0, Math.PI * 2);
          g.stroke();
        }
      }
      if (shot.blast) {
        g.strokeStyle = `rgba(255,159,93,${Math.max(0, 1 - shot.blast.r / shot.blast.max)})`;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(shot.blast.x, shot.blast.y, shot.blast.r, 0, Math.PI * 2);
        g.stroke();
      }
    }

    function loop() {
      tick++;
      if (busy) stepPhysics();
      particles.forEach((p) => { p.vx *= 0.94; p.vy *= 0.94; p.x += p.vx; p.y += p.vy; p.life--; });
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      floaters.forEach((f) => { f.y -= 0.55; f.life--; });
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
      if (shake > 0) shake = Math.max(0, shake - 0.8);
      draw();
      raf = requestAnimationFrame(loop);
    }

    function diamond(x, y) {
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillRect(-3, -3, 6, 6);
      g.restore();
    }

    function roundedRect(gc, x, y, w, h, r) {
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

    function shade(hex, amount) {
      const n = parseInt(hex.slice(1), 16);
      const r = clamp(((n >> 16) & 255) + amount, 0, 255);
      const g2 = clamp(((n >> 8) & 255) + amount, 0, 255);
      const b = clamp((n & 255) + amount, 0, 255);
      return `rgb(${r},${g2},${b})`;
    }

    function normalizeDeg(n) {
      return ((Math.round(n) % 360) + 360) % 360;
    }

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function dist(x1, y1, x2, y2) {
      return Math.hypot(x1 - x2, y1 - y2);
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
    id: "poolbattle",
    name: "Pool Battle",
    emoji: "🎱",
    description: "Bi-a đối kháng: hai người luân phiên chọc CHUNG một bi cái trắng. Kéo chuột để canh hướng và tụ lực rồi thả để bắn. Có đường ngắm dự đoán, thưởng combo và power-up (Bóng nổ, Siêu lực, Lỗ to).",
    onlineReady: true,
    options: [
      {
        id: "target",
        label: "Điểm để thắng",
        default: 7,
        choices: [
          { value: 5, label: "5 điểm (nhanh)" },
          { value: 7, label: "7 điểm" },
          { value: 9, label: "9 điểm" },
        ],
      },
      {
        id: "balls",
        label: "Số bi trên bàn",
        default: 9,
        choices: [
          { value: 7, label: "7 bi" },
          { value: 9, label: "9 bi" },
          { value: 11, label: "11 bi" },
        ],
      },
      {
        id: "powerups",
        label: "Power-up mỗi vòng",
        default: 2,
        choices: [
          { value: 0, label: "Tắt" },
          { value: 2, label: "2 (ít)" },
          { value: 3, label: "3 (nhiều)" },
        ],
      },
      {
        id: "cloth",
        label: "Mặt bàn",
        default: "normal",
        choices: [
          { value: "heavy", label: "Chậm" },
          { value: "normal", label: "Vừa" },
          { value: "fast", label: "Trơn" },
        ],
      },
    ],
    howTo: [
      "Hai người luân phiên chọc CHUNG một bi cái trắng. Đến lượt mình, bạn điều khiển cú đánh của bi cái đó.",
      "Canh & tụ lực bằng CHUỘT: nhấn giữ và kéo trên bàn như giàn thun — kéo càng xa lực càng mạnh, hướng bắn ngược với hướng kéo. Thả chuột ra là bắn. (Vẫn có thanh Hướng/Lực và nút Chọc bi để dùng thay thế.)",
      "Đường chấm dự đoán cho thấy bi cái sẽ đi đâu (kể cả nảy băng); bi bóng ma trắng là điểm chạm và vạch vàng là hướng bi mục tiêu sẽ lăn.",
      "Bi màu rơi vào hố cộng 1 điểm cho người vừa chọc. Lọt từ 2 bi trong một cú được thưởng COMBO +1. Đủ điểm mục tiêu thì thắng.",
      "Làm rơi bi cái xuống hố là LỖI: đối thủ được 1 điểm VÀ được 'bi trong tay' — bấm lên bàn để đặt lại bi cái ở vị trí bất kỳ trước khi bắn. Vụ nổ càng gần thì đẩy bi càng mạnh.",
      "Power-up: 🟠 Bóng nổ (B) tạo lực nổ ở va chạm đầu tiên của bi cái; 🟡 Siêu lực (P) cho cú bắn cực mạnh; 🔵 Lỗ to (O) nới rộng tất cả lỗ trong đúng cú đó để dễ vào bi. Các ô B/P/O xuất hiện NGẪU NHIÊN trên bàn và sau mỗi vòng (cả hai đã bắn) sẽ đổi sang vị trí & loại khác — nhặt khi bi chạm vào.",
      "Chơi online: mỗi lượt chỉ gửi hướng, lực và power-up, hai máy tự mô phỏng cùng kết quả.",
    ],
    create,
  });
})();
