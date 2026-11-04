/* Kéo Co Bằng Phím (Tug of War) — chơi chung máy, thời gian thực
   Hai người thi nhau bấm phím để kéo dây về phía mình. P1: phím A. P2: phím L.
   Mỗi lần bấm kéo dây nhích về phía mình; sức kéo giảm dần nếu ngừng bấm (dây tự
   trôi về giữa nhẹ). Kéo nút thắt qua vạch biên của đối thủ là THẮNG.
   Đua nhiều hiệp tới số hiệp định trước. */
(function () {
  const W = 680, H = 240;
  const WIN_OFFSET = 0.42;   // tỉ lệ lệch để thắng (so với nửa chiều rộng)

  function create(ctx) {
    const o = ctx.options || {};
    const WIN_ROUNDS = o.rounds || 3;
    const PULL = o.power === "strong" ? 0.018 : o.power === "weak" ? 0.009 : 0.013; // lực mỗi lần bấm
    const DECAY = 0.004;       // dây tự trôi về giữa mỗi frame

    let pos = 0;               // -1..1, âm = nghiêng về P1 (trái), dương = P2 (phải)
    let score = [0, 0];
    let over = false;
    let running = false;
    let raf = null;
    let countdown = 0;
    let cdTimer = null;
    const pressVel = [0, 0];   // xung lực tích từ việc bấm (giảm dần)

    const root = document.createElement("div");
    root.className = "tw2-root";
    root.innerHTML =
      `<div class="tw2-score"><b class="tw2-s1">0</b><span class="tw2-vs">${ctx.t("hiệp", "round")} 1/${WIN_ROUNDS}</span><b class="tw2-s2">0</b></div>` +
      `<canvas class="tw2-canvas" width="${W}" height="${H}"></canvas>` +
      `<div class="tw2-keys"><span class="tw2-k p1">P1: ${ctx.t("bấm", "tap")} <b>A</b></span>` +
        `<span class="tw2-k p2">P2: ${ctx.t("bấm", "tap")} <b>L</b></span></div>` +
      `<button type="button" class="btn primary tw2-start">${ctx.t("Bắt đầu hiệp", "Start round")}</button>`;
    ctx.boardEl.appendChild(root);

    const canvas = root.querySelector(".tw2-canvas");
    const g = canvas.getContext("2d");
    const startBtn = root.querySelector(".tw2-start");
    const s1El = root.querySelector(".tw2-s1");
    const s2El = root.querySelector(".tw2-s2");
    const vsEl = root.querySelector(".tw2-vs");

    function pull(seat) {
      if (over || !running) return;
      pressVel[seat] += PULL;
    }

    function update() {
      // áp xung lực: P1 kéo về trái (âm), P2 kéo về phải (dương)
      pos -= pressVel[0];
      pos += pressVel[1];
      // xung lực giảm dần
      pressVel[0] *= 0.55;
      pressVel[1] *= 0.55;
      // dây tự trôi nhẹ về giữa
      if (pos > 0) pos = Math.max(0, pos - DECAY);
      else if (pos < 0) pos = Math.min(0, pos + DECAY);
      pos = Math.max(-1, Math.min(1, pos));

      if (pos <= -WIN_OFFSET) finishRound(0);
      else if (pos >= WIN_OFFSET) finishRound(1);
    }

    function finishRound(winner) {
      running = false;
      score[winner]++;
      s1El.textContent = score[0];
      s2El.textContent = score[1];
      ctx.sound("win");
      if (score[winner] >= WIN_ROUNDS) {
        over = true;
        ctx.incScore(winner);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} vô địch ${score[0]}–${score[1]}!`,
          `🎉 Player ${winner + 1} wins the match ${score[0]}–${score[1]}!`));
        startBtn.disabled = true;
        startBtn.textContent = ctx.t("Đã kết thúc", "Match over");
        draw();
        return;
      }
      vsEl.textContent = ctx.t("hiệp", "round") + " " + (score[0] + score[1] + 1) + "/" + WIN_ROUNDS;
      ctx.setStatus(ctx.t(`Người chơi ${winner + 1} thắng hiệp! Bấm để chơi hiệp tiếp.`,
        `Player ${winner + 1} wins the round! Press to play the next one.`));
      startBtn.disabled = false;
      startBtn.textContent = ctx.t("Hiệp tiếp theo", "Next round");
      draw();
    }

    function draw() {
      g.fillStyle = "#0f1226";
      g.fillRect(0, 0, W, H);
      const cx = W / 2;
      const knotX = cx + pos * (W / 2);

      // vùng thắng hai bên
      g.fillStyle = "rgba(255,93,115,0.10)";
      g.fillRect(0, 0, cx * (1 - WIN_OFFSET), H);
      g.fillStyle = "rgba(77,208,225,0.10)";
      g.fillRect(cx + cx * WIN_OFFSET, 0, W, H);

      // vạch biên thắng
      g.strokeStyle = "rgba(255,93,115,0.5)"; g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(cx * (1 - WIN_OFFSET), 0); g.lineTo(cx * (1 - WIN_OFFSET), H); g.stroke();
      g.strokeStyle = "rgba(77,208,225,0.5)";
      g.beginPath(); g.moveTo(cx + cx * WIN_OFFSET, 0); g.lineTo(cx + cx * WIN_OFFSET, H); g.stroke();
      g.setLineDash([]);
      // vạch giữa
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();

      // dây thừng
      g.strokeStyle = "#caa472"; g.lineWidth = 6;
      g.beginPath(); g.moveTo(40, H / 2); g.lineTo(W - 40, H / 2); g.stroke();
      g.lineWidth = 1;

      // hai người kéo (đại diện bằng khối tròn ở hai đầu, dịch theo knot)
      g.fillStyle = "#ff5d73";
      g.beginPath(); g.arc(knotX - 70, H / 2, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#4dd0e1";
      g.beginPath(); g.arc(knotX + 70, H / 2, 22, 0, Math.PI * 2); g.fill();

      // nút thắt giữa dây
      g.save();
      g.shadowColor = "#ffd166"; g.shadowBlur = 16;
      g.fillStyle = "#ffd166";
      g.beginPath(); g.arc(knotX, H / 2, 14, 0, Math.PI * 2); g.fill();
      g.restore();

      // đếm ngược
      if (countdown > 0) {
        g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#fff"; g.font = "bold 80px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(countdown, cx, H / 2);
        g.textBaseline = "alphabetic";
      }
    }

    function loop() {
      if (running) update();
      draw();
      if (!over) raf = requestAnimationFrame(loop);
    }

    function startRound() {
      if (over || running || countdown > 0) return;
      pos = 0; pressVel[0] = 0; pressVel[1] = 0;
      startBtn.disabled = true;
      countdown = 3;
      draw();
      ctx.sound("place");
      ctx.setStatus(ctx.t("Chuẩn bị...", "Get ready..."));
      cdTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) { ctx.sound("place"); draw(); }
        else {
          clearInterval(cdTimer); cdTimer = null;
          running = true;
          ctx.sound("notify");
          ctx.setStatus(ctx.t("KÉO! P1 bấm A · P2 bấm L liên tục!", "PULL! P1 tap A · P2 tap L as fast as you can!"));
          draw();
        }
      }, 700);
    }

    function onKey(e) {
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); pull(0); }
      else if (k === "l") { e.preventDefault(); pull(1); }
      else if ((k === " " || k === "enter") && !running && countdown === 0) { e.preventDefault(); startRound(); }
    }
    window.addEventListener("keydown", onKey);
    startBtn.addEventListener("click", startRound);

    const cleanup = () => { clearInterval(cdTimer); cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); };
    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) { cleanup(); observer.disconnect(); }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setTurn(-1);
    ctx.setStatus(ctx.t(`Bấm "Bắt đầu hiệp". P1 bấm A, P2 bấm L thật nhanh để kéo nút vàng qua vạch của mình!`,
      `Press "Start round". P1 taps A, P2 taps L fast to drag the knot past their line!`));
    draw();
    raf = requestAnimationFrame(loop);

    function applyMove() {}
    function destroy() { cleanup(); observer.disconnect(); }
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "tugofwar",
    name: "Kéo Co Bằng Phím",
    emoji: "🪢",
    description: "Bấm phím thật nhanh để kéo nút thắt qua vạch của mình — ai nhanh tay hơn thì thắng.",
    onlineReady: false,
    supportsAI: false,
    options: [
      {
        id: "rounds", label: "Số hiệp để thắng", default: 3,
        choices: [
          { value: 2, label: "2 hiệp (nhanh)" },
          { value: 3, label: "3 hiệp" },
          { value: 5, label: "5 hiệp" },
        ],
      },
      {
        id: "power", label: "Lực kéo mỗi lần bấm", default: "normal",
        choices: [
          { value: "weak", label: "Nhẹ (kéo lâu hơn)" },
          { value: "normal", label: "Vừa" },
          { value: "strong", label: "Mạnh (nhanh kết thúc)" },
        ],
      },
    ],
    howTo: [
      "Game chơi chung trên một bàn phím (không hỗ trợ online).",
      "Bấm \"Bắt đầu hiệp\" rồi chờ đếm ngược 3-2-1.",
      "Khi vào hiệp: Người chơi 1 bấm phím A liên tục, Người chơi 2 bấm phím L liên tục. Mỗi lần bấm kéo nút thắt vàng nhích về phía mình.",
      "Nếu ngừng bấm, dây sẽ tự trôi nhẹ về giữa — phải bấm đều và nhanh hơn đối thủ.",
      "Kéo được nút thắt qua vạch biên phía mình là thắng hiệp đó.",
      "Người đầu tiên thắng đủ số hiệp đã chọn sẽ vô địch.",
    ],
    create,
  });
})();
