/* Đua Né Chướng Ngại (Dash Dodge) — chơi chung máy, thời gian thực
   Hai làn dọc cạnh nhau. Mỗi người điều khiển một runner né các khối lao xuống.
   P1: W (lên) / S (xuống). P2: ↑ / ↓. Đụng chướng ngại = bị loại.
   Ai sống lâu hơn (hoặc về đích quãng đường mục tiêu trước) sẽ thắng. */
(function () {
  const LANE_W = 300, H = 460;
  const RUNNER = 26;

  function create(ctx) {
    const o = ctx.options || {};
    const SPEED = o.speed === "slow" ? 2.6 : o.speed === "fast" ? 4.6 : 3.5; // tốc độ chướng ngại
    const GOAL = o.goal ? Number(o.goal) : 1600;   // quãng đường mục tiêu (0 = vô tận, sống lâu thắng)
    const DENSITY = o.density === "high" ? 64 : o.density === "low" ? 120 : 90; // khoảng cách spawn (frame)

    const RUNNER_SPEED = 5.2;

    const root = document.createElement("div");
    root.className = "dd2-root";
    const canvas = document.createElement("canvas");
    canvas.width = LANE_W * 2 + 14;
    canvas.height = H;
    canvas.className = "dd2-canvas";
    root.appendChild(canvas);
    const info = document.createElement("div");
    info.className = "dd2-info";
    info.innerHTML = `<span>${ctx.t("P1: W/S", "P1: W/S")}</span><span class="dd2-dist"></span><span>${ctx.t("P2: ↑/↓", "P2: ↑/↓")}</span>`;
    root.appendChild(info);
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn primary dd2-start";
    startBtn.textContent = ctx.t("Bắt đầu (phím bất kỳ)", "Start (any key)");
    root.appendChild(startBtn);
    ctx.boardEl.appendChild(root);
    const distEl = info.querySelector(".dd2-dist");
    const g = canvas.getContext("2d");

    // mỗi làn: runner ở giữa theo chiều ngang của làn, di chuyển dọc
    const COLORS = ["#ff5d73", "#4dd0e1"];
    const lanes = [
      { x0: 0, alive: true, y: H - 70, obstacles: [], spawn: 30 },
      { x0: LANE_W + 14, alive: true, y: H - 70, obstacles: [], spawn: 60 },
    ];
    const keys = {};
    let dist = 0;
    let over = false;
    let running = false;
    let raf = null;
    const particles = [];
    function curSpeed() { return SPEED * (1 + Math.min(dist / 3000, 1.2)); } // tăng dần theo quãng đường

    function burst(cx, cy, color) {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 4;
        particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
      }
    }

    function runnerX(lane) { return lane.x0 + LANE_W / 2 - RUNNER / 2; }

    function reset() {
      lanes.forEach((l, i) => { l.alive = true; l.y = H - 70; l.obstacles = []; l.spawn = 30 + i * 30; });
      dist = 0;
      particles.length = 0;
    }

    function spawnObstacle(lane) {
      const w = 40 + Math.random() * 90;
      const x = lane.x0 + Math.random() * (LANE_W - w);
      lane.obstacles.push({ x, y: -30, w, h: 22 + Math.random() * 16 });
    }

    function update() {
      // điều khiển
      if (keys["w"]) lanes[0].y -= RUNNER_SPEED;
      if (keys["s"]) lanes[0].y += RUNNER_SPEED;
      if (keys["arrowup"]) lanes[1].y -= RUNNER_SPEED;
      if (keys["arrowdown"]) lanes[1].y += RUNNER_SPEED;

      const spd = curSpeed();
      dist += spd;

      lanes.forEach((lane, idx) => {
        if (!lane.alive) return;
        lane.y = Math.max(10, Math.min(H - RUNNER - 10, lane.y));
        lane.spawn--;
        if (lane.spawn <= 0) { lane.spawn = DENSITY + Math.floor(Math.random() * 40); spawnObstacle(lane); }
        const rx = runnerX(lane);
        for (let i = lane.obstacles.length - 1; i >= 0; i--) {
          const ob = lane.obstacles[i];
          ob.y += spd;
          if (ob.y > H + 30) { lane.obstacles.splice(i, 1); continue; }
          // va chạm AABB
          if (rx < ob.x + ob.w && rx + RUNNER > ob.x && lane.y < ob.y + ob.h && lane.y + RUNNER > ob.y) {
            lane.alive = false;
            burst(rx + RUNNER / 2, lane.y + RUNNER / 2, COLORS[idx]);
            ctx.sound("miss");
            checkEnd();
          }
        }
      });

      // cập nhật particle
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // điều kiện về đích
      if (GOAL > 0 && dist >= GOAL && !over) {
        // cả hai cùng sống tới đích -> hòa quãng đường, xét ai còn sống
        endByGoal();
      }
    }

    function checkEnd() {
      if (over) return;
      const a0 = lanes[0].alive, a1 = lanes[1].alive;
      if (!a0 && !a1) { finish(-1); }       // cả hai chết cùng frame -> hòa
      else if (!a0) { finish(1); }
      else if (!a1) { finish(0); }
    }

    function endByGoal() {
      const a0 = lanes[0].alive, a1 = lanes[1].alive;
      if (a0 && !a1) finish(0);
      else if (!a0 && a1) finish(1);
      else finish(-1); // cùng về đích -> hòa
    }

    function finish(winner) {
      if (over) return;
      over = true; running = false;
      if (winner < 0) {
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🤝 Hòa! Cả hai cùng kết thúc ở ${Math.round(dist)}m.`,
          `🤝 Draw! Both ended at ${Math.round(dist)}m.`));
      } else {
        ctx.incScore(winner);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng — trụ tới ${Math.round(dist)}m!`,
          `🎉 Player ${winner + 1} wins — survived to ${Math.round(dist)}m!`));
      }
      startBtn.disabled = false;
      startBtn.textContent = ctx.t("Chơi lại", "Play again");
      draw();
    }

    function draw() {
      g.fillStyle = "#0f1226";
      g.fillRect(0, 0, canvas.width, canvas.height);
      lanes.forEach((lane, idx) => {
        // nền làn
        g.fillStyle = idx === 0 ? "rgba(255,93,115,0.06)" : "rgba(77,208,225,0.06)";
        g.fillRect(lane.x0, 0, LANE_W, H);
        g.strokeStyle = "rgba(255,255,255,0.12)";
        g.strokeRect(lane.x0 + 0.5, 0.5, LANE_W - 1, H - 1);
        // chướng ngại
        g.fillStyle = "rgba(255,255,255,0.82)";
        lane.obstacles.forEach((ob) => {
          g.fillStyle = idx === 0 ? "#ff8f5a" : "#9bd86d";
          g.fillRect(ob.x, ob.y, ob.w, ob.h);
        });
        // runner
        const rx = runnerX(lane);
        g.save();
        if (!lane.alive) g.globalAlpha = 0.35;
        g.fillStyle = COLORS[idx];
        g.shadowColor = COLORS[idx]; g.shadowBlur = 12;
        g.beginPath();
        g.arc(rx + RUNNER / 2, lane.y + RUNNER / 2, RUNNER / 2, 0, Math.PI * 2);
        g.fill();
        g.restore();
        if (!lane.alive) {
          g.fillStyle = "#ff5d73";
          g.font = "bold 20px Segoe UI, sans-serif";
          g.textAlign = "center";
          g.fillText("💥", rx + RUNNER / 2, lane.y + RUNNER / 2 + 7);
        }
      });
      // vạch giữa
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.fillRect(LANE_W, 0, 14, H);

      // particle khi va chạm
      particles.forEach((p) => {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = p.color;
        g.fillRect(p.x, p.y, 4, 4);
      });
      g.globalAlpha = 1;
    }

    function loop() {
      if (running) update();
      draw();
      const distTxt = GOAL > 0 ? `${Math.round(dist)}/${GOAL}m` : `${Math.round(dist)}m`;
      const spdX = (curSpeed() / SPEED).toFixed(1);
      distEl.innerHTML = `${distTxt} <span class="dd2-spd">⚡${spdX}×</span>`;
      if (!over) raf = requestAnimationFrame(loop);
    }

    function startGame() {
      if (running) return;
      if (over) { over = false; }
      reset();
      running = true;
      startBtn.disabled = true;
      ctx.setStatus(ctx.t("Chạy! Né các khối lao xuống. P1: W/S — P2: ↑/↓", "Run! Dodge the falling blocks. P1: W/S — P2: ↑/↓"));
    }

    function onKey(e, down) {
      const k = e.key.toLowerCase();
      if (["w", "s", "arrowup", "arrowdown"].includes(k)) {
        keys[k] = down;
        e.preventDefault();
        if (down && !running && !over) startGame();
      }
    }
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    startBtn.addEventListener("click", startGame);

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) { cleanup(); observer.disconnect(); }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setTurn(-1);
    ctx.setStatus(ctx.t(`Nhấn phím bất kỳ để bắt đầu. P1: W/S, P2: ↑/↓. Né khối, ai trụ lâu hơn${GOAL > 0 ? ` (hoặc về đích ${GOAL}m)` : ""} sẽ thắng!`,
      `Press any key to start. P1: W/S, P2: ↑/↓. Dodge blocks; survive longer${GOAL > 0 ? ` (or reach ${GOAL}m)` : ""} to win!`));
    draw();
    raf = requestAnimationFrame(loop);

    function applyMove() {} // local-only
    function destroy() { cleanup(); observer.disconnect(); }
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "dashdodge",
    name: "Đua Né Chướng Ngại",
    emoji: "🏃",
    description: "Điều khiển nhân vật né khối lao xuống — ai trụ lâu hơn thì thắng.",
    onlineReady: false,
    supportsAI: false,
    options: [
      {
        id: "speed", label: "Tốc độ chướng ngại", default: "normal",
        choices: [
          { value: "slow", label: "Chậm (dễ)" },
          { value: "normal", label: "Vừa" },
          { value: "fast", label: "Nhanh (khó)" },
        ],
      },
      {
        id: "density", label: "Mật độ chướng ngại", default: "normal",
        choices: [
          { value: "low", label: "Thưa" },
          { value: "normal", label: "Vừa" },
          { value: "high", label: "Dày (gắt)" },
        ],
      },
      {
        id: "goal", label: "Quãng đường mục tiêu", default: 1600,
        choices: [
          { value: 0, label: "Vô tận (sống lâu thắng)" },
          { value: 1200, label: "1200m (ngắn)" },
          { value: 1600, label: "1600m" },
          { value: 2400, label: "2400m (dài)" },
        ],
      },
    ],
    howTo: [
      "Game chơi chung trên một bàn phím (không hỗ trợ online).",
      "Màn chia hai làn dọc. Người chơi 1 điều khiển runner đỏ bên trái bằng W (lên) / S (xuống).",
      "Người chơi 2 điều khiển runner xanh bên phải bằng mũi tên ↑ (lên) / ↓ (xuống).",
      "Các khối chướng ngại liên tục lao xuống làn của bạn — di chuyển để né, chạm vào là bị loại ngay.",
      "Nếu đặt quãng đường mục tiêu, ai về đích trong khi đối thủ đã bị loại sẽ thắng; nếu chọn 'Vô tận' thì ai trụ lâu hơn thắng.",
      "Nếu cả hai cùng bị loại đúng lúc hoặc cùng về đích, ván sẽ hòa.",
    ],
    create,
  });
})();
