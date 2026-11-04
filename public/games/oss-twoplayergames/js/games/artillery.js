/* Bắn Tăng (Artillery) — chơi chung máy & ONLINE (theo lượt)
   Mỗi lượt: di chuyển, chọn loại đạn, chỉnh góc + lực, bắn một phát.
   Đạn bay theo trọng lực + gió. Địa hình phá hủy được (tạo hố lõm).
   Địa hình/gió/vật phẩm sinh từ hạt giống chung (ctx.rng) nên 2 máy giống hệt.
   Nước đi gửi qua mạng: { angle, power, x, weapon, items }. */
(function () {
  const W = 880, H = 500;
  const GRAV = 0.18;          // trọng lực mỗi khung
  const WIND_FACTOR = 0.018;  // ảnh hưởng của gió lên vận tốc ngang
  const STEP = 1;             // số bước mô phỏng mỗi khung (giữ tất định)

  const MAPS = {
    hills(rng) {
      const baseY = H * 0.62;
      const a1 = 28 + rng() * 34, a2 = 14 + rng() * 22, a3 = 6 + rng() * 14;
      const p1 = rng() * 6.283, p2 = rng() * 6.283, p3 = rng() * 6.283;
      return fill((x) => {
        const t = (x / W) * Math.PI * 2;
        return baseY - a1 * Math.sin(t + p1) - a2 * Math.sin(t * 2.3 + p2) - a3 * Math.sin(t * 4.7 + p3);
      });
    },
    mountains(rng) {
      const baseY = H * 0.68;
      const a1 = 50 + rng() * 30, a2 = 30 + rng() * 30, a3 = 18 + rng() * 20, a4 = 10 + rng() * 12;
      const p1 = rng() * 6.283, p2 = rng() * 6.283, p3 = rng() * 6.283, p4 = rng() * 6.283;
      return fill((x) => {
        const t = (x / W) * Math.PI * 2;
        return baseY - a1 * Math.sin(t * 1.3 + p1) - a2 * Math.sin(t * 2.9 + p2)
          - a3 * Math.sin(t * 5.1 + p3) - a4 * Math.sin(t * 8.3 + p4);
      });
    },
    valley(rng) {
      const edge = H * 0.42, mid = H * 0.78;
      const jitter = 8 + rng() * 10, jp = rng() * 6.283;
      return fill((x) => {
        const u = x / W;
        const bowl = Math.cos((u - 0.5) * Math.PI);
        return edge + (mid - edge) * bowl - jitter * Math.sin(u * Math.PI * 6 + jp);
      });
    },
    hill(rng) {
      const edge = H * 0.74, peak = H * 0.36;
      const jitter = 6 + rng() * 8, jp = rng() * 6.283;
      return fill((x) => {
        const u = x / W;
        const bump = Math.exp(-Math.pow((u - 0.5) / 0.22, 2));
        return edge - (edge - peak) * bump - jitter * Math.sin(u * Math.PI * 5 + jp);
      });
    },
    plain(rng) {
      const baseY = H * 0.66;
      const a1 = 8 + rng() * 8, a2 = 4 + rng() * 6;
      const p1 = rng() * 6.283, p2 = rng() * 6.283;
      return fill((x) => {
        const t = (x / W) * Math.PI * 2;
        return baseY - a1 * Math.sin(t * 1.5 + p1) - a2 * Math.sin(t * 3.7 + p2);
      });
    },
  };
  const MAP_KEYS = ["hills", "mountains", "valley", "hill", "plain"];

  function fill(fn) {
    const arr = new Array(W + 1);
    for (let x = 0; x <= W; x++) {
      let h = fn(x);
      h = Math.max(H * 0.30, Math.min(H - 30, h));
      arr[x] = h;
    }
    return arr;
  }

  const WEAPONS = {
    standard: { icon: "•", label: "Đạn thường", hint: "vô hạn" },
    cluster:  { icon: "✸", label: "Đạn chùm", hint: "nổ 3 điểm" },
    heavy:    { icon: "●", label: "Đạn nặng", hint: "nổ to, phá đất" },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const MAX_HP = o.hp || 100;
    const WIND_LEVEL = o.wind != null ? o.wind : 1;
    const BLAST = o.blast || 64;
    const MAX_DMG = o.dmg || 55;
    const MOVE_BUDGET = o.move != null ? o.move : 90;
    const MOVE_STEP = 5;
    const NUM_ITEMS = o.items != null ? o.items : 5;
    const PICK_R = 24;

    let mapKey = o.map || "hills";
    if (mapKey === "random") mapKey = MAP_KEYS[Math.floor(ctx.rng() * MAP_KEYS.length)];
    if (!MAPS[mapKey]) mapKey = "hills";
    const ground = MAPS[mapKey](ctx.rng);
    const terrainY = (x) => ground[Math.max(0, Math.min(W, Math.round(x)))];
    const STYLE = {
      hills:     { fill: "#3b7d4f", fill2: "#22502f", line: "#6ee7b7", sky0: "#1a1e3a", sky1: "#2a3060", far: "#2c3a55", name: "Đồi thoải" },
      mountains: { fill: "#6b5b4f", fill2: "#3f3228", line: "#c9a98a", sky0: "#221a2e", sky1: "#3a2c40", far: "#4a3a4f", name: "Núi lởm chởm" },
      valley:    { fill: "#3f6f7d", fill2: "#244249", line: "#8be6f0", sky0: "#152030", sky1: "#1f3a4a", far: "#28455a", name: "Thung lũng" },
      hill:      { fill: "#7d6b3b", fill2: "#4a3f22", line: "#ffd166", sky0: "#2e2a1a", sky1: "#403a20", far: "#50492c", name: "Đồi giữa" },
      plain:     { fill: "#5a7d3b", fill2: "#374f22", line: "#b7e76e", sky0: "#1e2a18", sky1: "#2c4020", far: "#3a4f2c", name: "Đồng bằng" },
    }[mapKey];

    function nextWind() {
      if (WIND_LEVEL === 0) return 0;
      const mag = WIND_LEVEL === 2 ? 2.2 : 1.2;
      return (ctx.rng() * 2 - 1) * mag;
    }
    let wind = nextWind();

    const ITEM_DEFS = {
      heal:    { icon: "❤️", color: "#6ee7b7", label: ctx.t("Hồi máu +35", "Heal +35") },
      bigshot: { icon: "💥", color: "#ffd166", label: ctx.t("Đạn nổ lớn", "Big shot") },
      shield:  { icon: "🛡️", color: "#8be6f0", label: ctx.t("Khiên đỡ đòn", "Damage shield") },
      fuel:    { icon: "⛽", color: "#c9a98a", label: ctx.t("Nạp nhiên liệu", "Refuel") },
      ammo:    { icon: "🎯", color: "#ff9f7a", label: ctx.t("Tiếp đạn đặc biệt", "Resupply ammo") },
    };
    const ITEM_KEYS = ["heal", "bigshot", "shield", "fuel", "ammo"];
    const items = [];
    for (let i = 0; i < NUM_ITEMS; i++) {
      const ix = Math.round(W * (0.22 + ctx.rng() * 0.56));
      const type = ITEM_KEYS[Math.floor(ctx.rng() * ITEM_KEYS.length)];
      items.push({ id: i, x: ix, y: 0, type, taken: false });
    }
    items.forEach((it) => { it.y = terrainY(it.x) - 14; });

    // mây trang trí (tất định)
    const clouds = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({ x: ctx.rng() * W, y: 30 + ctx.rng() * (H * 0.28), s: 0.7 + ctx.rng() * 0.8, v: 0.12 + ctx.rng() * 0.18 });
    }
    const sunX = W * (0.12 + ctx.rng() * 0.18);

    const players = [
      { x: W * 0.1, hp: MAX_HP, color: "#ff5d73", dark: "#a52e44", dir: 1, angle: 50, power: 60, shield: false, bigshot: false, weapon: "standard", ammo: { cluster: 2, heavy: 2 } },
      { x: W * 0.9, hp: MAX_HP, color: "#4dd0e1", dark: "#1d7b8a", dir: -1, angle: 50, power: 60, shield: false, bigshot: false, weapon: "standard", ammo: { cluster: 2, heavy: 2 } },
    ];
    let turn = 0;
    let busy = false;
    let over = false;
    let proj = null;
    const trail = [];
    const explosions = [];
    let raf = null;
    let fuel = MOVE_BUDGET;
    let pickedThisTurn = [];
    let flashItem = null;
    let tick = 0;
    let shake = 0;
    const sparks = [];

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.className = "art-canvas";
    ctx.boardEl.appendChild(canvas);
    const g = canvas.getContext("2d");

    const panel = document.createElement("div");
    panel.className = "art-controls";
    panel.innerHTML =
      `<div class="art-field art-weapons"><label>${ctx.t("Đạn", "Shell")}</label><div class="art-weapon-row" id="artWeapons"></div></div>` +
      `<div class="art-field art-move"><label>${ctx.t("Di chuyển", "Move")}</label>` +
      `<button class="btn small" id="artLeft">◄</button>` +
      `<button class="btn small" id="artRight">►</button>` +
      `<span class="art-val" id="artFuelVal"></span></div>` +
      `<div class="art-field"><label>${ctx.t("Góc", "Angle")}</label>` +
      `<input type="range" id="artAngle" min="5" max="85" value="50">` +
      `<span class="art-val" id="artAngleVal">50°</span></div>` +
      `<div class="art-field"><label>${ctx.t("Lực", "Power")}</label>` +
      `<input type="range" id="artPower" min="20" max="100" value="60">` +
      `<span class="art-val" id="artPowerVal">60</span></div>` +
      `<button class="btn primary" id="artFire">${ctx.t("💥 Bắn", "💥 Fire")}</button>`;
    ctx.boardEl.appendChild(panel);

    const angleInput = panel.querySelector("#artAngle");
    const powerInput = panel.querySelector("#artPower");
    const angleVal = panel.querySelector("#artAngleVal");
    const powerVal = panel.querySelector("#artPowerVal");
    const fireBtn = panel.querySelector("#artFire");
    const leftBtn = panel.querySelector("#artLeft");
    const rightBtn = panel.querySelector("#artRight");
    const fuelVal = panel.querySelector("#artFuelVal");
    const weaponsBox = panel.querySelector("#artWeapons");

    Object.entries(WEAPONS).forEach(([id, w]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small art-weapon-btn";
      b.dataset.weapon = id;
      const wLabel = ctx.t(w.label, { "Đạn thường": "Standard", "Đạn chùm": "Cluster", "Đạn nặng": "Heavy" }[w.label] || w.label);
      b.innerHTML = `<span>${w.icon}</span><b>${wLabel}</b><small class="art-ammo"></small>`;
      b.addEventListener("click", () => {
        if (busy || over || !myTurn()) return;
        const pl = players[turn];
        if (id !== "standard" && (pl.ammo[id] || 0) <= 0) return;
        pl.weapon = id;
        ctx.sound("select");
        syncControls();
        draw();
      });
      weaponsBox.appendChild(b);
    });

    angleInput.addEventListener("input", () => {
      players[turn].angle = +angleInput.value;
      angleVal.textContent = angleInput.value + "°";
      draw();
    });
    powerInput.addEventListener("input", () => {
      players[turn].power = +powerInput.value;
      powerVal.textContent = powerInput.value;
      draw();
    });
    fireBtn.addEventListener("click", fire);

    function collectItems(pl) {
      const picked = [];
      const py = terrainY(pl.x) - 10;
      items.forEach((it) => {
        if (it.taken) return;
        if (Math.hypot(it.x - pl.x, it.y - py) < PICK_R) {
          it.taken = true;
          picked.push(it.id);
          applyItemEffect(pl, it.type);
        }
      });
      if (picked.length) pickedThisTurn.push(...picked);
      return picked;
    }

    function applyItemsById(pl, ids) {
      ids.forEach((id) => {
        const it = items[id];
        if (it && !it.taken) { it.taken = true; applyItemEffect(pl, it.type, true); }
      });
    }

    function applyItemEffect(pl, type, silent) {
      switch (type) {
        case "heal": pl.hp = Math.min(MAX_HP, pl.hp + 35); break;
        case "bigshot": pl.bigshot = true; break;
        case "shield": pl.shield = true; break;
        case "fuel": fuel += 120; break;
        case "ammo": pl.ammo.cluster += 1; pl.ammo.heavy += 1; break;
      }
      if (!silent) {
        ctx.sound("select");
        flashItem = { type, t: 60 };
      }
    }

    function moveTank(delta) {
      if (busy || over || !myTurn() || fuel <= 0) return;
      const pl = players[turn];
      const minX = 24, maxX = W - 24;
      const want = Math.max(-fuel, Math.min(fuel, delta));
      let nx = pl.x + want;
      nx = Math.max(minX, Math.min(maxX, nx));
      const used = Math.abs(nx - pl.x);
      if (used <= 0) return;
      pl.x = nx;
      fuel -= used;
      collectItems(pl);
      ctx.sound("select");
      syncControls();
      draw();
    }
    leftBtn.addEventListener("click", () => moveTank(-MOVE_STEP));
    rightBtn.addEventListener("click", () => moveTank(MOVE_STEP));

    function onKey(e) {
      if (e.key === "ArrowLeft") { moveTank(-MOVE_STEP); e.preventDefault(); }
      else if (e.key === "ArrowRight") { moveTank(MOVE_STEP); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { if (!busy && !over && myTurn()) { fire(); e.preventDefault(); } }
    }
    window.addEventListener("keydown", onKey);

    function myTurn() { return !ctx.isOnline || turn === ctx.mySeat; }

    function syncControls() {
      const pl = players[turn];
      angleInput.value = pl.angle;
      powerInput.value = pl.power;
      angleVal.textContent = pl.angle + "°";
      powerVal.textContent = pl.power;
      const lock = busy || over || !myTurn();
      angleInput.disabled = lock;
      powerInput.disabled = lock;
      fireBtn.disabled = lock;
      leftBtn.disabled = lock || fuel <= 0;
      rightBtn.disabled = lock || fuel <= 0;
      fuelVal.textContent = MOVE_BUDGET > 0 ? `⛽ ${Math.round(fuel)}` : "";
      weaponsBox.querySelectorAll(".art-weapon-btn").forEach((b) => {
        const id = b.dataset.weapon;
        const ammoEl = b.querySelector(".art-ammo");
        if (id === "standard") ammoEl.textContent = "∞";
        else ammoEl.textContent = "x" + (pl.ammo[id] || 0);
        b.classList.toggle("active", pl.weapon === id);
        b.disabled = lock || (id !== "standard" && (pl.ammo[id] || 0) <= 0);
      });
    }

    function barrelTip(pl) {
      const cx = pl.x, cy = terrainY(pl.x) - 12;
      const rad = pl.angle * Math.PI / 180;
      return { x: cx + pl.dir * Math.cos(rad) * 30, y: cy - Math.sin(rad) * 30, cx, cy };
    }

    function fire() {
      if (busy || over || !myTurn()) return;
      const pl = players[turn];
      applyMove({ angle: pl.angle, power: pl.power, x: pl.x, weapon: pl.weapon }, false);
    }

    function applyMove(move, fromRemote) {
      if (busy || over) return;
      const pl = players[turn];
      pl.angle = Math.max(5, Math.min(85, move.angle));
      pl.power = Math.max(20, Math.min(100, move.power));
      if (typeof move.x === "number") pl.x = Math.max(24, Math.min(W - 24, move.x));
      if (fromRemote && Array.isArray(move.items)) applyItemsById(pl, move.items);

      // chốt loại đạn + trừ đạn đặc biệt (tất định trên cả 2 máy)
      let weapon = move.weapon && WEAPONS[move.weapon] ? move.weapon : "standard";
      if (weapon !== "standard") {
        if ((pl.ammo[weapon] || 0) > 0) pl.ammo[weapon] -= 1;
        else weapon = "standard";
      }
      pl.weapon = "standard";

      if (!fromRemote && ctx.isOnline) {
        ctx.sendMove({ angle: pl.angle, power: pl.power, x: pl.x, weapon, items: pickedThisTurn.slice() });
      }

      // sửa đổi sát thương/bán kính theo loại đạn + power-up bigshot
      let blastNow = BLAST, dmgNow = MAX_DMG;
      if (weapon === "heavy") { blastNow *= 1.5; dmgNow *= 1.35; }
      if (pl.bigshot) { blastNow *= 1.7; dmgNow *= 1.5; }
      pl.bigshot = false;

      const tip = barrelTip(pl);
      const rad = pl.angle * Math.PI / 180;
      const v = pl.power * 0.22;
      proj = {
        x: tip.x, y: tip.y,
        vx: pl.dir * v * Math.cos(rad),
        vy: -v * Math.sin(rad),
        blast: blastNow, dmg: dmgNow, weapon,
      };
      trail.length = 0;
      busy = true;
      ctx.sound("shot");
      syncControls();
    }

    function stepProjectile() {
      if (!proj) return;
      for (let s = 0; s < STEP; s++) {
        proj.vx += wind * WIND_FACTOR;
        proj.vy += GRAV;
        proj.x += proj.vx;
        proj.y += proj.vy;
        trail.push({ x: proj.x, y: proj.y });
        if (trail.length > 60) trail.shift();

        if (proj.x < -60 || proj.x > W + 60 || proj.y > H + 40) return resolve(null);
        if (proj.y >= terrainY(proj.x)) return resolve({ x: proj.x, y: terrainY(proj.x) });
        const foe = players[1 - turn];
        const fy = terrainY(foe.x) - 10;
        if (Math.hypot(proj.x - foe.x, proj.y - fy) < 16) return resolve({ x: proj.x, y: proj.y });
      }
    }

    function carveCrater(cx, cy, r) {
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(W, Math.ceil(cx + r));
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const inside = r * r - dx * dx;
        if (inside <= 0) continue;
        const bottom = cy + Math.sqrt(inside);
        if (bottom > ground[x]) ground[x] = Math.min(H - 4, bottom);
      }
    }

    function explodeOne(x, y, blast, maxDmg, carveScale) {
      explosions.push({ x, y, r: 4, max: blast });
      spawnSparks(x, y, blast);
      shake = Math.min(18, shake + blast * 0.12);
      carveCrater(x, y, blast * 0.7 * (carveScale || 1));
      players.forEach((pl) => {
        const py = terrainY(pl.x) - 10;
        const d = Math.hypot(x - pl.x, y - py);
        if (d < blast) {
          let dmg = Math.round(maxDmg * (1 - d / blast));
          if (pl.shield && dmg > 0) { dmg = Math.round(dmg * 0.4); pl.shield = false; }
          pl.hp = Math.max(0, pl.hp - dmg);
        }
      });
    }

    function detonate(weapon, cx, cy, blast, maxDmg) {
      if (weapon === "cluster") {
        [-52, 0, 52].forEach((dx) => explodeOne(cx + dx, cy, blast * 0.62, maxDmg * 0.62, 0.9));
      } else if (weapon === "heavy") {
        explodeOne(cx, cy, blast, maxDmg, 1.4);
      } else {
        explodeOne(cx, cy, blast, maxDmg, 1);
      }
    }

    function resolve(impact) {
      const weapon = proj ? proj.weapon : "standard";
      const blast = proj ? proj.blast : BLAST;
      const maxDmg = proj ? proj.dmg : MAX_DMG;
      proj = null;
      trail.length = 0;
      if (impact) {
        detonate(weapon, impact.x, impact.y, blast, maxDmg);
        ctx.sound("explode");
      } else {
        ctx.sound("miss");
      }

      const dead0 = players[0].hp <= 0, dead1 = players[1].hp <= 0;
      if (dead0 || dead1) {
        over = true;
        if (dead0 && dead1) ctx.setStatus(ctx.t("🤝 Cả hai cùng nổ tung — hòa!", "🤝 Both blown up — draw!"));
        else {
          const w = dead0 ? 1 : 0;
          ctx.incScore(w);
          ctx.setStatus(ctx.t(`🎉 Người chơi ${w + 1} chiến thắng!`, `🎉 Player ${w + 1} wins!`));
        }
        ctx.setTurn(-1);
        syncControls();
        return;
      }

      turn = 1 - turn;
      wind = nextWind();
      fuel = MOVE_BUDGET;
      pickedThisTurn = [];
      players[turn].weapon = "standard";
      busy = false;
      ctx.setTurn(turn);
      updateStatus();
      syncControls();
    }

    function updateStatus() {
      const dirTxt = wind === 0 ? ctx.t("lặng gió", "no wind") : (wind > 0 ? "→ " : "← ") + Math.abs(wind).toFixed(1);
      const moveTxt = MOVE_BUDGET > 0 ? ctx.t(" Di chuyển (◄ ►),", " Move (◄ ►),") : "";
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}. Gió: ${dirTxt}.${moveTxt} chọn đạn, chỉnh góc/lực rồi bắn (Space).`,
        `Player ${turn + 1}'s turn. Wind: ${dirTxt}.${moveTxt} pick a shell, set angle/power and fire (Space).`));
    }

    // ---- quỹ đạo dự đoán (chỉ hiển thị, không ảnh hưởng mô phỏng) ----
    function previewTrajectory(pl) {
      const pts = [];
      const rad = pl.angle * Math.PI / 180;
      const v = pl.power * 0.22;
      let x = barrelTip(pl).x, y = barrelTip(pl).y;
      let vx = pl.dir * v * Math.cos(rad), vy = -v * Math.sin(rad);
      for (let i = 0; i < 1200; i++) {
        vx += wind * WIND_FACTOR;
        vy += GRAV;
        x += vx; y += vy;
        if (x < -60 || x > W + 60 || y > H + 40) break;
        if (y >= terrainY(x)) break;
        if (i % 5 === 0) pts.push({ x, y });
      }
      return pts;
    }

    function draw() {
      g.save();
      if (shake > 0.3) g.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      // trời
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, STYLE.sky0);
      sky.addColorStop(1, STYLE.sky1);
      g.fillStyle = sky;
      g.fillRect(-24, -24, W + 48, H + 48);

      // mặt trời
      g.save();
      const sg = g.createRadialGradient(sunX, H * 0.2, 6, sunX, H * 0.2, 60);
      sg.addColorStop(0, "rgba(255,228,150,0.85)");
      sg.addColorStop(1, "rgba(255,228,150,0)");
      g.fillStyle = sg;
      g.beginPath(); g.arc(sunX, H * 0.2, 60, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,236,180,0.95)";
      g.beginPath(); g.arc(sunX, H * 0.2, 20, 0, Math.PI * 2); g.fill();
      g.restore();

      // mây
      g.fillStyle = "rgba(255,255,255,0.14)";
      clouds.forEach((c) => {
        const cx = (c.x + tick * c.v) % (W + 120) - 60;
        const s = c.s;
        g.beginPath();
        g.arc(cx, c.y, 16 * s, 0, Math.PI * 2);
        g.arc(cx + 18 * s, c.y + 4 * s, 20 * s, 0, Math.PI * 2);
        g.arc(cx + 40 * s, c.y, 15 * s, 0, Math.PI * 2);
        g.fill();
      });

      // đồi xa
      g.fillStyle = STYLE.far;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        g.lineTo(x, H * 0.5 + Math.sin(x * 0.012 + 1.5) * 26 + 40);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
      g.globalAlpha = 1;

      // địa hình (gradient + viền)
      const tg = g.createLinearGradient(0, H * 0.3, 0, H);
      tg.addColorStop(0, STYLE.fill);
      tg.addColorStop(1, STYLE.fill2);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x++) g.lineTo(x, ground[x]);
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = tg;
      g.fill();
      g.strokeStyle = STYLE.line;
      g.lineWidth = 2.5;
      g.beginPath();
      for (let x = 0; x <= W; x++) (x === 0 ? g.moveTo(x, ground[x]) : g.lineTo(x, ground[x]));
      g.stroke();

      // vật phẩm
      items.forEach((it) => {
        if (it.taken) return;
        const def = ITEM_DEFS[it.type];
        const bob = Math.sin(tick * 0.06 + it.id) * 3;
        g.fillStyle = def.color;
        g.globalAlpha = 0.22;
        g.beginPath(); g.arc(it.x, it.y + bob, 15, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        g.font = "20px serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(def.icon, it.x, it.y + bob);
        g.textBaseline = "alphabetic";
      });

      // đường ngắm dự đoán cho người đang tới lượt
      if (!busy && !over && myTurn()) {
        const pts = previewTrajectory(players[turn]);
        g.fillStyle = "rgba(255,255,255,0.5)";
        pts.forEach((p, i) => {
          g.globalAlpha = Math.max(0.12, 0.6 - i * 0.02);
          g.beginPath(); g.arc(p.x, p.y, 2.4, 0, Math.PI * 2); g.fill();
        });
        g.globalAlpha = 1;
      }

      // xe tăng
      players.forEach((pl, i) => {
        drawTank(pl, i);
      });

      // vệt đạn
      if (trail.length > 1) {
        g.strokeStyle = "rgba(255,209,102,0.5)";
        g.lineWidth = 2;
        g.beginPath();
        trail.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.stroke();
      }
      // đạn
      if (proj) {
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(proj.x, proj.y, 4.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#ffd166";
        g.beginPath(); g.arc(proj.x, proj.y, 2.5, 0, Math.PI * 2); g.fill();
      }
      // nổ
      explosions.forEach((ex) => {
        const a = 1 - ex.r / ex.max;
        g.fillStyle = `rgba(255,150,60,${a * 0.9})`;
        g.beginPath(); g.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(255,230,150,${a})`;
        g.beginPath(); g.arc(ex.x, ex.y, ex.r * 0.55, 0, Math.PI * 2); g.fill();
      });

      // chỉ báo gió + tên map
      drawWindGauge();
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.font = "13px Segoe UI, sans-serif";
      g.textAlign = "left";
      g.fillText("🗺️ " + ctx.t(STYLE.name, { "Đồi thoải": "Rolling Hills", "Núi lởm chởm": "Jagged Mountains", "Thung lũng": "Valley", "Đồi giữa": "Center Hill", "Đồng bằng": "Plains" }[STYLE.name] || STYLE.name), 12, 24);

      if (flashItem && flashItem.t > 0) {
        const def = ITEM_DEFS[flashItem.type];
        g.globalAlpha = Math.min(1, flashItem.t / 30);
        g.fillStyle = def.color;
        g.font = "bold 22px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.fillText(`${def.icon} ${def.label}!`, W / 2, H * 0.36);
        g.globalAlpha = 1;
      }

      // mảnh văng (debris)
      sparks.forEach((p) => {
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;

      g.restore();
    }

    function spawnSparks(x, y, blast) {
      const n = Math.round(10 + blast * 0.25);
      const colors = ["#ffd166", "#ff9f5d", "#ff6a3d", "#ffe6a0"];
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * (blast * 0.08);
        sparks.push({
          x, y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 1.5,
          r: 1.5 + Math.random() * 2.5,
          life: 26 + Math.random() * 20,
          max: 46,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    function drawTank(pl, i) {
      const y = terrainY(pl.x);
      // bóng
      g.fillStyle = "rgba(0,0,0,0.28)";
      g.beginPath(); g.ellipse(pl.x, y, 22, 5, 0, 0, Math.PI * 2); g.fill();
      // xích
      g.fillStyle = pl.dark;
      roundRect(g, pl.x - 20, y - 9, 40, 9, 4); g.fill();
      g.fillStyle = "rgba(255,255,255,0.18)";
      for (let t = -16; t <= 16; t += 8) g.fillRect(pl.x + t - 1.5, y - 8, 3, 7);
      // thân
      g.fillStyle = pl.color;
      roundRect(g, pl.x - 16, y - 18, 32, 11, 4); g.fill();
      // tháp pháo
      g.beginPath(); g.arc(pl.x, y - 18, 9, Math.PI, 0); g.fill();
      // nòng
      const tip = barrelTip(pl);
      g.strokeStyle = pl.dark;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.beginPath(); g.moveTo(tip.cx, tip.cy); g.lineTo(tip.x, tip.y); g.stroke();
      g.lineCap = "butt";
      // thanh máu
      const bw = 44, bx = pl.x - bw / 2, by = y - 40;
      g.fillStyle = "rgba(0,0,0,0.5)";
      roundRect(g, bx, by, bw, 6, 3); g.fill();
      g.fillStyle = pl.hp > MAX_HP * 0.3 ? "#6ee7b7" : "#ff5d73";
      roundRect(g, bx, by, bw * (pl.hp / MAX_HP), 6, 3); g.fill();
      g.fillStyle = "#fff";
      g.font = "11px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(`P${i + 1}: ${pl.hp}`, pl.x, by - 4);
      const badges = [];
      if (pl.shield) badges.push("🛡️");
      if (pl.bigshot) badges.push("💥");
      if (badges.length) { g.font = "14px serif"; g.fillText(badges.join(" "), pl.x, by - 17); }
    }

    function drawWindGauge() {
      const cx = W / 2, cy = 26;
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.font = "bold 13px Segoe UI, sans-serif";
      g.textAlign = "center";
      if (wind === 0) { g.fillText(ctx.t("Gió: lặng", "Wind: calm"), cx, cy); return; }
      const mag = Math.abs(wind);
      g.fillText(ctx.t("Gió " + mag.toFixed(1), "Wind " + mag.toFixed(1)), cx, cy - 8);
      const dir = wind > 0 ? 1 : -1;
      const len = 18 + mag * 12;
      g.strokeStyle = wind > 0 ? "#ffd166" : "#8be6f0";
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx - dir * len / 2, cy + 4);
      g.lineTo(cx + dir * len / 2, cy + 4);
      g.lineTo(cx + dir * len / 2 - dir * 6, cy);
      g.moveTo(cx + dir * len / 2, cy + 4);
      g.lineTo(cx + dir * len / 2 - dir * 6, cy + 8);
      g.stroke();
      g.lineCap = "butt";
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

    function loop() {
      tick++;
      if (busy && proj) stepProjectile();
      for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].r += 3;
        if (explosions[i].r >= explosions[i].max) explosions.splice(i, 1);
      }
      // mảnh văng: rơi theo trọng lực + mờ dần
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += 0.16;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) sparks.splice(i, 1);
      }
      if (shake > 0.3) shake *= 0.86; else shake = 0;
      if (flashItem && flashItem.t > 0) flashItem.t--;
      draw();
      raf = requestAnimationFrame(loop);
    }

    const observer = new MutationObserver(() => {
      if (!document.body.contains(canvas)) {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setTurn(0);
    updateStatus();
    syncControls();
    draw();
    raf = requestAnimationFrame(loop);
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "artillery",
    name: "Bắn Tăng (Artillery)",
    emoji: "💣",
    description: "Chỉnh góc và lực bắn, tính cả sức gió, để nã trúng xe tăng đối thủ. Địa hình phá hủy được, có nhiều loại đạn và vật phẩm. Theo lượt, chơi cả online.",
    onlineReady: true,
    options: [
      {
        id: "map", label: "Địa hình", default: "hills",
        choices: [
          { value: "hills", label: "Đồi thoải" },
          { value: "mountains", label: "Núi lởm chởm" },
          { value: "valley", label: "Thung lũng" },
          { value: "hill", label: "Đồi giữa" },
          { value: "plain", label: "Đồng bằng" },
          { value: "random", label: "🎲 Ngẫu nhiên" },
        ],
      },
      {
        id: "wind", label: "Sức gió", default: 1,
        choices: [
          { value: 0, label: "Lặng gió (dễ)" },
          { value: 1, label: "Gió vừa" },
          { value: 2, label: "Gió mạnh (khó)" },
        ],
      },
      {
        id: "hp", label: "Máu mỗi xe", default: 100,
        choices: [
          { value: 60, label: "60 (nhanh)" },
          { value: 100, label: "100 (chuẩn)" },
          { value: 150, label: "150 (lâu)" },
        ],
      },
      {
        id: "move", label: "Di chuyển mỗi lượt", default: 90,
        choices: [
          { value: 0, label: "Cố định (không di chuyển)" },
          { value: 90, label: "Ít (90px)" },
          { value: 160, label: "Vừa (160px)" },
          { value: 260, label: "Nhiều (260px)" },
        ],
      },
      {
        id: "items", label: "Vật phẩm", default: 5,
        choices: [
          { value: 0, label: "Tắt (không có)" },
          { value: 5, label: "Ít (5)" },
          { value: 8, label: "Nhiều (8)" },
        ],
      },
    ],
    howTo: [
      "Hai xe tăng ở hai đầu địa hình. Người chơi 1 (đỏ) bên trái, Người chơi 2 (xanh) bên phải. Chơi theo lượt.",
      "Đến lượt mình: DI CHUYỂN xe bằng nút ◄ ► (hoặc phím mũi tên) — mỗi lượt có nhiên liệu ⛽ giới hạn. Đường ngắm chấm trắng cho biết đạn sẽ bay tới đâu (đã tính cả gió).",
      "Chọn LOẠI ĐẠN: • Đạn thường (vô hạn), ✸ Đạn chùm (nổ 3 điểm, sát thương diện rộng), ● Đạn nặng (nổ to, phá đất mạnh). Đạn đặc biệt có giới hạn — nhặt 🎯 để tiếp thêm.",
      "Kéo thanh 'Góc' và 'Lực' để ngắm, rồi bấm 💥 Bắn (hoặc phím Space).",
      "Đạn bay theo trọng lực VÀ gió (xem mũi tên gió phía trên) — gió đổi mỗi lượt nên phải tính lại.",
      "ĐỊA HÌNH PHÁ HỦY ĐƯỢC: mỗi phát nổ khoét một hố lõm xuống đất, dần thay đổi thế trận và có thể làm xe tụt xuống hố.",
      "Vật phẩm chạy qua để nhặt: ❤️ hồi máu, 💥 đạn nổ lớn, 🛡️ khiên đỡ 60% đòn kế, ⛽ nạp nhiên liệu, 🎯 tiếp đạn đặc biệt.",
      "Xe nào hết máu trước sẽ thua. Chơi online: mọi lựa chọn, loại đạn và vật phẩm đều đồng bộ.",
    ],
    create,
  });
})();
