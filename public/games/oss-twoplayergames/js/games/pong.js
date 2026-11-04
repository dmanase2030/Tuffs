/* Pong 2 người — chơi chung máy (thời gian thực, dùng bàn phím)
   Người chơi 1: phím W (lên) / S (xuống). Người chơi 2: mũi tên ↑ / ↓.
   Có hiệu ứng particle khi chạm, bóng tăng tốc dần và vật phẩm (power-up). */
(function () {
  const W = 700, H = 420;
  const PADDLE_W = 12, BALL = 12;

  function create(ctx) {
    const o = ctx.options || {};
    const BALL_SPEED = o.speed || 5;
    const WIN_SCORE = o.winScore || 5;
    const BASE_PADDLE_H = o.paddle || 80;
    const POWERUPS = o.powerups !== "off";
    const PADDLE_SPEED = 6.5;

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.className = "pong-canvas";
    ctx.boardEl.appendChild(canvas);
    const g = canvas.getContext("2d");

    let p1y = H / 2 - BASE_PADDLE_H / 2;
    let p2y = H / 2 - BASE_PADDLE_H / 2;
    const paddleH = [BASE_PADDLE_H, BASE_PADDLE_H];
    const paddleBoost = [0, 0]; // thời gian còn lại của hiệu ứng to vợt (frame)
    let score = [0, 0];
    let over = false;
    let running = false;
    let raf = null;
    let rallyHits = 0; // số lần chạm vợt trong một loạt (để tăng tốc)

    const balls = [];
    const particles = [];
    const powerups = []; // { x, y, type, r }
    const keys = {};
    let spawnTimer = 0;

    const POWER_TYPES = ["multi", "grow", "speed"];
    const POWER_INFO = {
      multi: { color: "#ffd166", glyph: "✦", label: "Nhân bóng" },
      grow: { color: "#6ee7b7", glyph: "▮", label: "To vợt" },
      speed: { color: "#ff5d73", glyph: "»", label: "Tăng tốc" },
    };

    function newBall(dir) {
      const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
      const speed = BALL_SPEED;
      return {
        x: W / 2, y: H / 2,
        vx: dir * speed * Math.cos(angle),
        vy: speed * Math.sin(angle),
        trail: [],
      };
    }

    function resetBalls(dir) {
      balls.length = 0;
      balls.push(newBall(dir));
      rallyHits = 0;
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 3.5;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
      }
    }

    function onKey(e, down) {
      const k = e.key.toLowerCase();
      if (["w", "s", "arrowup", "arrowdown"].includes(k)) {
        keys[k] = down;
        e.preventDefault();
        if (down && !running && !over) startLoop();
      }
    }
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    function curPaddleH(side) { return paddleBoost[side] > 0 ? paddleH[side] * 1.6 : paddleH[side]; }

    function update() {
      if (keys["w"]) p1y -= PADDLE_SPEED;
      if (keys["s"]) p1y += PADDLE_SPEED;
      if (keys["arrowup"]) p2y -= PADDLE_SPEED;
      if (keys["arrowdown"]) p2y += PADDLE_SPEED;
      const h1 = curPaddleH(0), h2 = curPaddleH(1);
      p1y = Math.max(0, Math.min(H - h1, p1y));
      p2y = Math.max(0, Math.min(H - h2, p2y));
      if (paddleBoost[0] > 0) paddleBoost[0]--;
      if (paddleBoost[1] > 0) paddleBoost[1]--;

      // sinh vật phẩm
      if (POWERUPS) {
        spawnTimer--;
        if (spawnTimer <= 0 && powerups.length < 2) {
          spawnTimer = 180 + Math.floor(Math.random() * 180);
          const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
          powerups.push({ x: W / 2 + (Math.random() * 220 - 110), y: 50 + Math.random() * (H - 100), type, r: 13, pulse: 0 });
        }
      }
      powerups.forEach((pu) => (pu.pulse += 0.1));

      // cập nhật từng bóng
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi];
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 8) ball.trail.shift();
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.y <= 0) { ball.y = 0; ball.vy *= -1; burst(ball.x, 0, "#9fb4ff", 6); }
        if (ball.y >= H - BALL) { ball.y = H - BALL; ball.vy *= -1; burst(ball.x, H, "#9fb4ff", 6); }

        // va vợt trái (P1)
        if (ball.x <= PADDLE_W && ball.y + BALL >= p1y && ball.y <= p1y + h1 && ball.vx < 0) {
          ball.vx *= -1.04;
          const hit = (ball.y + BALL / 2 - (p1y + h1 / 2)) / (h1 / 2);
          ball.vy += hit * 2.2;
          ball.x = PADDLE_W;
          onHit(ball, PADDLE_W + 4, ball.y, "#ff5d73");
        }
        // va vợt phải (P2)
        if (ball.x + BALL >= W - PADDLE_W && ball.y + BALL >= p2y && ball.y <= p2y + h2 && ball.vx > 0) {
          ball.vx *= -1.04;
          const hit = (ball.y + BALL / 2 - (p2y + h2 / 2)) / (h2 / 2);
          ball.vy += hit * 2.2;
          ball.x = W - PADDLE_W - BALL;
          onHit(ball, W - PADDLE_W - 4, ball.y, "#4dd0e1");
        }

        // ăn vật phẩm
        for (let pi = powerups.length - 1; pi >= 0; pi--) {
          const pu = powerups[pi];
          const dx = ball.x + BALL / 2 - pu.x, dy = ball.y + BALL / 2 - pu.y;
          if (dx * dx + dy * dy <= (pu.r + BALL / 2) * (pu.r + BALL / 2)) {
            applyPower(pu, ball);
            burst(pu.x, pu.y, POWER_INFO[pu.type].color, 16);
            powerups.splice(pi, 1);
          }
        }

        // ghi điểm
        if (ball.x < -BALL) { balls.splice(bi, 1); if (balls.length === 0) { score[1]++; ctx.sound("miss"); afterScore(-1); } }
        else if (ball.x > W) { balls.splice(bi, 1); if (balls.length === 0) { score[0]++; ctx.sound("miss"); afterScore(1); } }
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    // bên vừa đỡ bóng (theo hướng bóng bay đi sau khi chạm)
    function onHit(ball, x, y, color) {
      ctx.sound("place");
      burst(x, y + BALL / 2, color, 10);
      rallyHits++;
      // tăng tốc dần theo loạt bóng (giới hạn)
      const boost = 1 + Math.min(rallyHits * 0.012, 0.4);
      const sp = Math.hypot(ball.vx, ball.vy);
      const maxSp = BALL_SPEED * 2.2;
      if (sp < maxSp) { ball.vx *= boost; ball.vy *= boost; }
    }

    function applyPower(pu, ball) {
      ctx.sound("powerup");
      if (pu.type === "multi") {
        // tách thêm 2 bóng từ bóng hiện tại
        const sp = Math.hypot(ball.vx, ball.vy) || BALL_SPEED;
        const base = Math.atan2(ball.vy, ball.vx);
        for (const da of [-0.4, 0.4]) {
          balls.push({ x: ball.x, y: ball.y, vx: Math.cos(base + da) * sp, vy: Math.sin(base + da) * sp, trail: [] });
        }
      } else if (pu.type === "grow") {
        // bên đang đỡ (hướng bóng đang bay về) được to vợt
        const side = ball.vx < 0 ? 0 : 1;
        paddleBoost[side] = 600; // ~10s
      } else if (pu.type === "speed") {
        ball.vx *= 1.25; ball.vy *= 1.25;
      }
      ctx.setStatus(ctx.t(`⚡ Vật phẩm: ${POWER_INFO[pu.type].label}!`, `⚡ Power-up: ${POWER_INFO[pu.type].label}!`));
    }

    function afterScore(dir) {
      if (score[0] >= WIN_SCORE || score[1] >= WIN_SCORE) {
        over = true; running = false;
        const winner = score[0] > score[1] ? 0 : 1;
        ctx.incScore(winner);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng ${score[0]}–${score[1]}!`,
          `🎉 Player ${winner + 1} wins ${score[0]}–${score[1]}!`));
        ctx.setTurn(-1);
        return;
      }
      running = false;
      powerups.length = 0;
      paddleBoost[0] = paddleBoost[1] = 0;
      resetBalls(dir);
      ctx.setStatus(ctx.t(`Tỉ số ${score[0]} – ${score[1]}. Nhấn phím để tiếp tục.`,
        `Score ${score[0]} – ${score[1]}. Press a key to continue.`));
    }

    function draw() {
      g.fillStyle = "#0f1226";
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.setLineDash([8, 12]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.setLineDash([]);

      // điểm
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.font = "bold 60px Segoe UI, sans-serif";
      g.textAlign = "center";
      g.fillText(score[0], W / 2 - 60, 70);
      g.fillText(score[1], W / 2 + 60, 70);

      // vật phẩm
      powerups.forEach((pu) => {
        const info = POWER_INFO[pu.type];
        const r = pu.r + Math.sin(pu.pulse) * 2;
        g.save();
        g.shadowColor = info.color; g.shadowBlur = 14;
        g.fillStyle = info.color;
        g.beginPath(); g.arc(pu.x, pu.y, r, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#0f1226";
        g.font = "bold 16px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(info.glyph, pu.x, pu.y + 1);
        g.restore();
      });
      g.textBaseline = "alphabetic";

      // particles
      particles.forEach((p) => {
        g.globalAlpha = Math.max(0, p.life);
        g.fillStyle = p.color;
        g.fillRect(p.x, p.y, 3, 3);
      });
      g.globalAlpha = 1;

      // vợt (sáng hơn khi đang boost)
      const h1 = curPaddleH(0), h2 = curPaddleH(1);
      g.fillStyle = "#ff5d73";
      if (paddleBoost[0] > 0) { g.shadowColor = "#ff5d73"; g.shadowBlur = 16; }
      g.fillRect(0, p1y, PADDLE_W, h1);
      g.shadowBlur = 0;
      g.fillStyle = "#4dd0e1";
      if (paddleBoost[1] > 0) { g.shadowColor = "#4dd0e1"; g.shadowBlur = 16; }
      g.fillRect(W - PADDLE_W, p2y, PADDLE_W, h2);
      g.shadowBlur = 0;

      // bóng + đuôi
      balls.forEach((ball) => {
        ball.trail.forEach((t, idx) => {
          g.globalAlpha = (idx / ball.trail.length) * 0.4;
          g.fillStyle = "#ffd166";
          g.fillRect(t.x, t.y, BALL, BALL);
        });
        g.globalAlpha = 1;
        g.fillStyle = "#ffd166";
        g.fillRect(ball.x, ball.y, BALL, BALL);
      });
    }

    function loop() {
      if (running) update();
      draw();
      if (!over) raf = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (over) return;
      running = true;
      ctx.setStatus(ctx.t("Đang chơi! P1: W/S — P2: ↑/↓", "Playing! P1: W/S — P2: ↑/↓"));
    }

    function applyMove() {} // Pong không dùng relay online

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    const observer = new MutationObserver(() => {
      if (!document.body.contains(canvas)) { cleanup(); observer.disconnect(); }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    resetBalls(Math.random() < 0.5 ? -1 : 1);
    spawnTimer = 150;
    ctx.setTurn(0);
    ctx.setStatus(ctx.t(`Nhấn W/S (P1) hoặc ↑/↓ (P2) để bắt đầu. Ai đạt ${WIN_SCORE} điểm trước thắng!`,
      `Press W/S (P1) or ↑/↓ (P2) to start. First to ${WIN_SCORE} points wins!`));
    draw();
    raf = requestAnimationFrame(loop);
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "pong",
    name: "Pong",
    emoji: "🏓",
    description: "Game phản xạ thời gian thực: đỡ bóng, nhặt vật phẩm, bóng tăng tốc dần. Ai đạt điểm mốc trước sẽ thắng.",
    onlineReady: false,
    options: [
      {
        id: "speed", label: "Tốc độ bóng", default: 5,
        choices: [
          { value: 3.5, label: "Chậm (dễ)" },
          { value: 5, label: "Vừa" },
          { value: 7, label: "Nhanh (khó)" },
          { value: 9, label: "Cực nhanh" },
        ],
      },
      {
        id: "paddle", label: "Độ dài vợt", default: 80,
        choices: [
          { value: 110, label: "Dài (dễ)" },
          { value: 80, label: "Vừa" },
          { value: 55, label: "Ngắn (khó)" },
        ],
      },
      {
        id: "winScore", label: "Điểm để thắng", default: 5,
        choices: [
          { value: 3, label: "3 điểm (nhanh)" },
          { value: 5, label: "5 điểm" },
          { value: 10, label: "10 điểm" },
        ],
      },
      {
        id: "powerups", label: "Vật phẩm", default: "on",
        choices: [
          { value: "on", label: "Bật (nhân bóng, to vợt, tăng tốc)" },
          { value: "off", label: "Tắt (cổ điển)" },
        ],
      },
    ],
    howTo: [
      "Game chơi chung trên một bàn phím (không hỗ trợ online).",
      "Người chơi 1 điều khiển vợt bên trái: phím W (lên) và S (xuống).",
      "Người chơi 2 điều khiển vợt bên phải: mũi tên ↑ (lên) và ↓ (xuống).",
      "Đỡ bóng bằng vợt; bóng đập vào mép vợt sẽ bay chếch theo hướng đó. Đỡ càng nhiều lần trong một loạt thì bóng càng tăng tốc.",
      "Vật phẩm xuất hiện giữa sân (có thể tắt ở phần tùy chọn): ✦ Nhân bóng (thêm 2 bóng), ▮ To vợt cho bên đang đỡ, » Tăng tốc bóng.",
      "Nếu để TẤT CẢ bóng lọt qua vợt mình, đối thủ được 1 điểm. Ai đạt mốc điểm trước sẽ thắng.",
    ],
    create,
  });
})();
