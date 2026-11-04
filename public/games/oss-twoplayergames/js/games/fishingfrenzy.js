/* Câu Cá Đối Đầu (Fishing Frenzy) — ONLINE song song, điều khiển bằng BÀN PHÍM.
   Lưỡi câu đung đưa trái–phải. Bấm PHÍM CÁCH để thả câu xuống (như game Đào Vàng).
   Khi lưỡi câu chạm cá/vật phẩm, hiện một PHÍM SỐ ngẫu nhiên (0–9) — bấm phím đó
   liên tục để kéo lên (cá càng nặng tụt càng nhanh). Có cá BOSS dưới đáy hồ.
   Chỉ relay điểm. Giao thức:
     { kind:"ready" } / { kind:"score", score, count } / { kind:"final", score, count } */
(function () {
  const FISH = [
    { emoji: "🐟", name: "Cá rô", weight: 1, pts: 1, rate: 30, speed: 60, r: 16 },
    { emoji: "🐠", name: "Cá nhiệt đới", weight: 1, pts: 2, rate: 22, speed: 90, r: 16 },
    { emoji: "🐡", name: "Cá nóc", weight: 2, pts: 3, rate: 14, speed: 52, r: 18 },
    { emoji: "🦑", name: "Mực", weight: 2, pts: 4, rate: 11, speed: 100, r: 18 },
    { emoji: "🐙", name: "Bạch tuộc", weight: 3, pts: 5, rate: 8, speed: 58, r: 20 },
    { emoji: "🐬", name: "Cá heo", weight: 3, pts: 6, rate: 5, speed: 130, r: 24 },
    { emoji: "🦈", name: "Cá mập", weight: 5, pts: 10, rate: 3, speed: 90, r: 30 },
  ];
  const BOSS = { emoji: "🐋", name: "Cá Voi Boss", weight: 6, pts: 25, speed: 38, r: 42, boss: true };
  const ITEMS = [
    { emoji: "🪱", name: "Mồi xịn", kind: "bait", rate: 7, r: 14, speed: 55 },
    { emoji: "⭐", name: "Sao x2", kind: "star", rate: 5, r: 15, speed: 60 },
    { emoji: "🧲", name: "Nam châm", kind: "magnet", rate: 4, r: 15, speed: 50 },
    { emoji: "💎", name: "Ngọc biển", kind: "gem", rate: 3, r: 15, speed: 45 },
    { emoji: "🥾", name: "Giày rách", kind: "junk", rate: 5, r: 15, speed: 70 },
  ];
  const ALPHA = "0123456789";

  function create(ctx) {
    const o = ctx.options || {};
    const DURATION = o.duration || 60;
    // bản dịch tên cá & vật phẩm (FISH/ITEMS/BOSS là hằng module-level)
    const NAME_EN = {
      "Cá rô": "Perch", "Cá nhiệt đới": "Tropical fish", "Cá nóc": "Pufferfish", "Mực": "Squid", "Bạch tuộc": "Octopus", "Cá heo": "Dolphin", "Cá mập": "Shark", "Cá Voi Boss": "Whale Boss",
      "Mồi xịn": "Premium bait", "Sao x2": "x2 Star", "Nam châm": "Magnet", "Ngọc biển": "Sea gem", "Giày rách": "Old boot",
    };
    const entName = (def) => ctx.t(def.name, NAME_EN[def.name] || def.name);
    const W = 580, H = 460;
    const WATER_TOP = 78;
    const ANCHOR = { x: W / 2, y: 12 };  // đỉnh cần câu (dây buông xuống từ đây)
    const MAXA = 1.2;           // biên độ đung đưa (rad)
    const LMIN = 62;
    const HOOK_R = 9;

    let phase = ctx.isOnline ? "connect" : "countdown";
    let iReady = false, oppReady = false;
    let countdown = 3;
    let timeLeft = DURATION;
    let myScore = 0, myCount = 0;
    let oppScore = 0, oppCount = 0;
    let myDone = false, oppDone = false, decided = false;

    const fishes = [];
    const items = [];
    let nextId = 1;
    let bossTimer = 0;

    // ----- trạng thái lưỡi câu -----
    let hookState = "swing";    // swing | extend | reel | retract
    let swingT = 0;
    let angle = 0;              // góc hiện tại (0 = thẳng xuống)
    let angleLock = 0;
    let L = LMIN;
    let attached = null;        // entity đang dính câu
    let reeled = null;          // entity đang được kéo lên (đã tính điểm)
    let reelLetter = "f";
    let progress = 0;
    let reelTimeLeft = 0;

    let baitNext = false, starNext = false, magnetNext = false;
    let castMsg = "", castMsgT = 0;
    let raf = null, lastT = 0, timerInt = null, cdInt = null, spawnAcc = 0, itemAcc = 0;
    const bubbles = [];

    // ----- UI -----
    const root = document.createElement("div");
    root.className = "fh-root";
    ctx.boardEl.appendChild(root);

    const top = document.createElement("div");
    top.className = "fh-top";
    root.appendChild(top);

    const wrap = document.createElement("div");
    wrap.className = "fh-canvas-wrap";
    const canvas = document.createElement("canvas");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.className = "fh-canvas";
    wrap.appendChild(canvas);
    const g = canvas.getContext("2d");
    g.scale(DPR, DPR);
    root.appendChild(wrap);

    const reel = document.createElement("div");
    reel.className = "fh-reel fh-hidden";
    root.appendChild(reel);

    const boosts = document.createElement("div");
    boosts.className = "fh-boosts";
    root.appendChild(boosts);

    const hint = document.createElement("div");
    hint.className = "fh-hint";
    hint.textContent = ctx.t("Lưỡi câu tự đung đưa — bấm PHÍM CÁCH để thả câu xuống. Hộp 🎁 phát sáng là vật phẩm bí ẩn, câu lên mới biết là gì!", "The hook swings on its own — press SPACE to drop it. A glowing 🎁 is a mystery item; you only learn what it is after reeling it up!");
    root.appendChild(hint);

    function rng() { return Math.random(); }
    function pickWeighted(list) {
      const total = list.reduce((s, x) => s + x.rate, 0);
      let r = rng() * total;
      for (const it of list) { if ((r -= it.rate) <= 0) return it; }
      return list[0];
    }
    for (let i = 0; i < 18; i++) bubbles.push({ x: rng() * W, y: WATER_TOP + rng() * (H - WATER_TOP), v: 8 + rng() * 22, r: 1 + rng() * 2.5 });

    // ====================== SPAWN & MOVE ======================
    function spawnFish() {
      if (fishes.filter((f) => !f.isBoss).length >= 8) return;
      const def = pickWeighted(FISH);
      const dir = rng() < 0.5 ? 1 : -1;
      const x = dir === 1 ? -24 : W + 24;
      const y = WATER_TOP + 24 + rng() * (H - WATER_TOP - 120);
      fishes.push({ id: nextId++, kind: "fish", def, x, y, dir, vy: (rng() - 0.5) * 12, t: rng() * 6 });
    }
    function spawnBoss() {
      if (fishes.some((f) => f.isBoss)) return;
      const dir = rng() < 0.5 ? 1 : -1;
      const x = dir === 1 ? -40 : W + 40;
      const y = H - 56;
      fishes.push({ id: nextId++, kind: "fish", def: BOSS, isBoss: true, x, y, dir, vy: 3, t: rng() * 6 });
    }
    function spawnItem() {
      if (items.length >= 3) return;
      const def = pickWeighted(ITEMS);
      const dir = rng() < 0.5 ? 1 : -1;
      const x = dir === 1 ? -24 : W + 24;
      const y = WATER_TOP + 28 + rng() * (H - WATER_TOP - 110);
      items.push({ id: nextId++, kind: "item", def, x, y, dir, vy: (rng() - 0.5) * 8, t: rng() * 6 });
    }

    function moveEntity(e, dt) {
      if (attached === e || reeled === e) return;
      e.x += e.dir * (e.def.speed || 60) * dt;
      e.t += dt;
      const wob = e.isBoss ? 6 : e.vy;
      e.y += Math.sin(e.t * 1.5) * wob * dt;
      const top = e.isBoss ? H - 90 : WATER_TOP + 12;
      const bot = H - 16;
      e.y = Math.max(top, Math.min(bot, e.y));
    }
    function offscreen(e) { return e.x < -50 || e.x > W + 50; }

    function tipPos(len, ang) {
      return { x: ANCHOR.x + Math.sin(ang) * len, y: ANCHOR.y + Math.cos(ang) * len };
    }

    // ====================== INPUT ======================
    function onKey(e) {
      if (!document.body.contains(root)) { teardown(); return; }
      const k = (e.key || "").toLowerCase();
      if (k === " " || e.code === "Space" || k === "spacebar") {
        if (phase === "play") e.preventDefault();
        if (e.repeat) return;
        if (phase === "play" && hookState === "swing") dropHook();
        return;
      }
      if (phase === "play" && hookState === "reel" && k === reelLetter) {
        if (e.repeat) return;
        const w = attached.kind === "item" ? 1 : attached.def.weight;
        const gain = (baitNext ? 16 : 10) - (w >= 5 ? 1 : 0);
        progress = Math.min(100, progress + gain);
        ctx.sound("place");
        renderReel();
        if (progress >= 100) reelSuccess();
      }
    }
    document.addEventListener("keydown", onKey);

    function dropHook() {
      hookState = "extend";
      angleLock = angle;
      L = LMIN;
      ctx.sound("select");
    }

    function grab(ent) {
      attached = ent;
      const tip = tipPos(L, angleLock);
      ent.x = tip.x; ent.y = tip.y;
      if (ent.kind === "fish" && magnetNext) {
        magnetNext = false;
        flash(ctx.t("🧲 Nam châm kéo dính!", "🧲 Magnet snaps it on!"));
        return reelSuccess();
      }
      hookState = "reel";
      reelLetter = ALPHA[Math.floor(rng() * ALPHA.length)];
      const w = ent.kind === "item" ? 1 : ent.def.weight;
      progress = 32 - w * 2;
      reelTimeLeft = 8 + w * 0.7;
      ctx.sound("select");
      renderReel();
    }

    function reelSuccess() {
      const ent = attached;
      attached = null;
      reel.classList.add("fh-hidden");
      hookState = "retract";
      if (ent && ent.kind === "fish") {
        let pts = ent.def.pts;
        if (starNext) { pts *= 2; starNext = false; flash(ctx.t(`⭐ x2 ${ent.def.name}! +${pts}`, `⭐ x2 ${entName(ent.def)}! +${pts}`)); }
        else flash(ctx.t(`${ent.isBoss ? "👑 HẠ BOSS! " : ""}Bắt được ${ent.def.emoji} ${ent.def.name}! +${pts}`, `${ent.isBoss ? "👑 BOSS DOWN! " : ""}Caught ${ent.def.emoji} ${entName(ent.def)}! +${pts}`));
        myScore += pts; myCount += 1;
        ctx.sound("capture");
        relayScore(); renderTop();
        removeEntity(ent);
        if (ent.isBoss) bossTimer = 6;
        baitNext = false; // mồi xịn chỉ giúp một con
        reeled = null;
      } else if (ent && ent.kind === "item") {
        applyItem(ent.def);
        removeEntity(ent);
        relayScore(); renderTop();
      }
      renderBoosts();
    }

    function reelFail() {
      const ent = attached;
      attached = null;
      reel.classList.add("fh-hidden");
      hookState = "retract";
      flash(ent && ent.kind === "item" ? ctx.t("Vuột mất vật phẩm!", "The item got away!") : ctx.t(`${ent ? ent.def.emoji : "Cá"} sổng mất rồi!`, `${ent ? ent.def.emoji : "The fish"} slipped away!`));
      ctx.sound("miss");
      if (ent) ent.dir = rng() < 0.5 ? 1 : -1;
      if (baitNext) baitNext = false;
      renderBoosts();
    }

    function applyItem(def) {
      if (def.kind === "bait") { baitNext = true; flash(ctx.t("🪱 Mồi xịn: con cá kế kéo dễ hơn!", "🪱 Premium bait: next fish reels easier!")); }
      else if (def.kind === "star") { starNext = true; flash(ctx.t("⭐ Sao x2: con cá kế gấp đôi điểm!", "⭐ x2 Star: next fish scores double!")); }
      else if (def.kind === "magnet") { magnetNext = true; flash(ctx.t("🧲 Nam châm: con cá kế tự dính!", "🧲 Magnet: next fish auto-hooks!")); }
      else if (def.kind === "gem") { myScore += 6; flash(ctx.t("💎 Ngọc biển! +6 điểm", "💎 Sea gem! +6 points")); }
      else { flash(ctx.t("🥾 Giày rách... chẳng được gì.", "🥾 Old boot... nothing gained.")); }
      ctx.sound(def.kind === "junk" ? "miss" : "capture");
    }

    function removeEntity(ent) {
      const arr = ent.kind === "fish" ? fishes : items;
      const i = arr.indexOf(ent);
      if (i >= 0) arr.splice(i, 1);
    }
    function flash(msg) { castMsg = msg; castMsgT = 1.7; }

    // ====================== VÒNG LẶP ======================
    function loop(now) {
      if (!document.body.contains(root)) { teardown(); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
      lastT = now;

      if (phase === "play" || phase === "over") {
        if (phase === "play") {
          spawnAcc += dt; itemAcc += dt;
          if (spawnAcc > 0.85) { spawnAcc = 0; if (rng() < 0.85) spawnFish(); }
          if (itemAcc > 2.8) { itemAcc = 0; if (rng() < 0.9) spawnItem(); }
          if (bossTimer > 0) { bossTimer -= dt; if (bossTimer <= 0) spawnBoss(); }
          else if (!fishes.some((f) => f.isBoss)) spawnBoss();
        } else {
          // hết giờ: vẫn thả thêm cá cho hồ sống động, không sinh vật phẩm/boss mới
          spawnAcc += dt;
          if (spawnAcc > 1.1) { spawnAcc = 0; if (rng() < 0.6 && fishes.length < 8) spawnFish(); }
        }

        fishes.forEach((f) => moveEntity(f, dt));
        items.forEach((f) => moveEntity(f, dt));
        for (let i = fishes.length - 1; i >= 0; i--) if (offscreen(fishes[i]) && fishes[i] !== attached) { if (fishes[i].isBoss) bossTimer = 4; fishes.splice(i, 1); }
        for (let i = items.length - 1; i >= 0; i--) if (offscreen(items[i]) && items[i] !== attached) items.splice(i, 1);

        updateHook(dt);
      }
      // bong bóng
      bubbles.forEach((b) => { b.y -= b.v * dt; if (b.y < WATER_TOP) { b.y = H; b.x = rng() * W; } });
      if (castMsgT > 0) castMsgT -= dt;
      draw();
      raf = requestAnimationFrame(loop);
    }

    function updateHook(dt) {
      if (hookState === "swing") {
        swingT += dt;
        angle = MAXA * Math.sin(swingT * 1.9);
        L = LMIN;
      } else if (hookState === "extend") {
        L += 360 * dt;
        const tip = tipPos(L, angleLock);
        if (tip.x < 6 || tip.x > W - 6 || tip.y > H - 6) { hookState = "retract"; return; }
        const all = [...fishes, ...items];
        let best = null, bd = Infinity;
        for (const e of all) {
          const d = Math.hypot(e.x - tip.x, e.y - tip.y);
          if (d < e.def.r + HOOK_R && d < bd) { best = e; bd = d; }
        }
        if (best) grab(best);
      } else if (hookState === "reel") {
        const w = attached.kind === "item" ? 1 : attached.def.weight;
        const decay = (baitNext ? 4 : 6) + w * 5;
        progress -= decay * dt;
        reelTimeLeft -= dt;
        const tip = tipPos(L, angleLock);
        attached.x = tip.x; attached.y = tip.y;
        if (progress <= 0 || reelTimeLeft <= 0) reelFail();
        else renderReel();
      } else if (hookState === "retract") {
        L -= 480 * dt;
        if (reeled) { const t = tipPos(L, angleLock); reeled.x = t.x; reeled.y = t.y; }
        if (L <= LMIN) { L = LMIN; reeled = null; hookState = "swing"; }
      }
    }

    // ====================== VẼ ======================
    function draw() {
      // nền nước
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0a3056");
      grad.addColorStop(0.16, "#0e466e");
      grad.addColorStop(0.6, "#0a3357");
      grad.addColorStop(1, "#05213a");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      // tia sáng
      g.save();
      g.globalAlpha = 0.06;
      g.fillStyle = "#bfe9ff";
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 150;
        g.beginPath();
        g.moveTo(x, WATER_TOP); g.lineTo(x + 40, WATER_TOP); g.lineTo(x + 130, H); g.lineTo(x + 40, H);
        g.closePath(); g.fill();
      }
      g.restore();

      // đáy hồ
      g.fillStyle = "#08263f";
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(0, H - 26);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, H - 26 + Math.sin(x * 0.05) * 6);
      g.lineTo(W, H);
      g.closePath(); g.fill();
      g.font = "16px 'Segoe UI Emoji', sans-serif";
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.globalAlpha = 0.8;
      g.fillText("🌿", 50, H - 8); g.fillText("🪸", W - 60, H - 6); g.fillText("🌿", W * 0.4, H - 7);
      g.globalAlpha = 1;

      // bong bóng
      g.fillStyle = "rgba(190,230,255,0.25)";
      bubbles.forEach((b) => { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); });

      // mặt nước
      g.fillStyle = "rgba(150,215,255,0.16)";
      g.fillRect(0, WATER_TOP - 8, W, 8);

      drawBoat();

      // dây + lưỡi câu
      const tip = tipPos(L, hookState === "swing" ? angle : angleLock);
      g.strokeStyle = "rgba(235,245,255,0.7)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ANCHOR.x, ANCHOR.y);
      g.lineTo(tip.x, tip.y);
      g.stroke();
      drawHook(tip, hookState === "swing" ? angle : angleLock);

      drawEntities(items);
      drawEntities(fishes);

      // overlay countdown / connect
      if (phase === "countdown") {
        g.fillStyle = "rgba(0,0,0,0.42)"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#ffd166"; g.font = "900 76px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(countdown > 0 ? String(countdown) : ctx.t("CÂU!", "FISH!"), W / 2, H / 2);
      } else if (phase === "connect") {
        g.fillStyle = "rgba(0,0,0,0.42)"; g.fillRect(0, 0, W, H);
        g.fillStyle = "#e9ecff"; g.font = "800 22px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(ctx.t("Đang chờ đối thủ...", "Waiting for the opponent..."), W / 2, H / 2);
      } else if (phase === "over") {
        // banner HẾT GIỜ — không che kín để cá vẫn bơi phía sau
        const bw = 280, bh = 64, cx = W / 2, cy = H / 2;
        g.save();
        g.fillStyle = "rgba(8,14,28,0.8)";
        roundRect(g, cx - bw / 2, cy - bh / 2, bw, bh, 16); g.fill();
        g.strokeStyle = "rgba(255,209,102,0.7)"; g.lineWidth = 2;
        roundRect(g, cx - bw / 2, cy - bh / 2, bw, bh, 16); g.stroke();
        g.fillStyle = "#ffd166"; g.font = "900 30px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(ctx.t("⏰ HẾT GIỜ!", "⏰ TIME UP!"), cx, cy - 9);
        g.fillStyle = "#e9ecff"; g.font = "700 15px Segoe UI, sans-serif";
        g.fillText(ctx.t(`Bạn câu được ${myScore} điểm (${myCount} con)`, `You caught ${myScore} points (${myCount} fish)`), cx, cy + 16);
        g.restore();
      }

      if (castMsgT > 0 && phase === "play") {
        g.font = "800 15px Segoe UI, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        const w2 = g.measureText(castMsg).width + 22;
        g.fillStyle = "rgba(8,14,28,0.82)";
        roundRect(g, W / 2 - w2 / 2, H - 34, w2, 24, 9); g.fill();
        g.fillStyle = "#ffe9a8";
        g.fillText(castMsg, W / 2, H - 22);
      }
    }

    function drawBoat() {
      const bx = ANCHOR.x, by = 60;
      // thân thuyền
      g.fillStyle = "#7a4a22";
      g.beginPath();
      g.moveTo(bx - 66, by);
      g.quadraticCurveTo(bx, by + 28, bx + 66, by);
      g.lineTo(bx + 54, by - 12);
      g.lineTo(bx - 54, by - 12);
      g.closePath(); g.fill();
      g.fillStyle = "#5e3717";
      g.fillRect(bx - 54, by - 14, 108, 5);
      // người câu (rõ ràng)
      const px = bx - 26, py = by - 14;
      g.fillStyle = "#e8804a"; // áo
      g.beginPath(); g.moveTo(px - 10, py); g.quadraticCurveTo(px, py - 22, px + 10, py); g.closePath(); g.fill();
      g.fillStyle = "#f1c27d"; // đầu
      g.beginPath(); g.arc(px, py - 24, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3a4a8b"; // mũ
      g.beginPath(); g.arc(px, py - 26, 8.5, Math.PI, Math.PI * 2); g.fill();
      g.fillRect(px - 12, py - 27, 24, 3);
      // cần câu: từ tay người cong LÊN tới đỉnh cần (ANCHOR), dây buông xuống từ đó
      g.strokeStyle = "#caa46a"; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath();
      g.moveTo(px + 8, py - 8);
      g.quadraticCurveTo(bx - 26, 6, ANCHOR.x, ANCHOR.y);
      g.stroke();
      g.fillStyle = "#e8c98a";
      g.beginPath(); g.arc(ANCHOR.x, ANCHOR.y, 2.6, 0, Math.PI * 2); g.fill();
    }

    function drawHook(tip, ang) {
      g.save();
      g.translate(tip.x, tip.y);
      g.rotate(ang); // ang = 0 -> hướng thẳng xuống
      g.strokeStyle = "#e8eef7";
      g.lineWidth = 2.2;
      g.lineCap = "round";
      g.lineJoin = "round";
      // cán lưỡi câu
      g.beginPath();
      g.moveTo(0, -3);
      g.lineTo(0, 5);
      g.stroke();
      // phần móc cong (chữ J liền mạch)
      g.beginPath();
      g.arc(0, 9, 4, -Math.PI / 2, Math.PI * 0.95, false);
      g.stroke();
      // mũi ngạnh
      g.fillStyle = "#e8eef7";
      const bx = Math.cos(Math.PI * 0.95) * 4;
      const by = 9 + Math.sin(Math.PI * 0.95) * 4;
      g.beginPath();
      g.arc(bx, by, 1.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawEntities(arr) {
      arr.forEach((e) => {
        // bóng
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.beginPath(); g.ellipse(e.x, e.y + e.def.r * 0.7, e.def.r * 0.8, e.def.r * 0.3, 0, 0, Math.PI * 2); g.fill();
        if (e.isBoss) {
          g.save(); g.globalAlpha = 0.5; g.fillStyle = "#ff6b8a";
          g.beginPath(); g.arc(e.x, e.y, e.def.r + 6, 0, Math.PI * 2); g.fill(); g.restore();
        }
        if (e.kind === "item") {
          // vầng sáng nhấp nháy cho vật phẩm để dễ nhận ra
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240 + e.id);
          g.save();
          g.globalAlpha = 0.25 + pulse * 0.3;
          const rg = g.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.def.r + 10);
          rg.addColorStop(0, "#ffe9a8");
          rg.addColorStop(1, "rgba(255,209,102,0)");
          g.fillStyle = rg;
          g.beginPath(); g.arc(e.x, e.y, e.def.r + 10, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 0.55 + pulse * 0.4;
          g.strokeStyle = "#ffd166"; g.lineWidth = 2;
          g.beginPath(); g.arc(e.x, e.y, e.def.r + 4 + pulse * 2, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
        const hookedNow = (attached === e || reeled === e);
        g.save();
        g.translate(e.x, e.y);
        if (e.dir === 1) g.scale(-1, 1);
        if (hookedNow) g.scale(1 + Math.sin(performance.now() / 55) * 0.09, 1 + Math.sin(performance.now() / 55) * 0.09);
        g.font = (e.def.r * 1.8) + "px 'Segoe UI Emoji', sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        // vật phẩm là hộp bí ẩn — câu lên mới biết là gì
        g.fillText(e.kind === "item" ? "🎁" : e.def.emoji, 0, 0);
        g.restore();
        if (e.kind === "item") {
          g.fillStyle = "#ffe9a8";
          g.font = "11px 'Segoe UI Emoji', sans-serif";
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText("❓", e.x, e.y - e.def.r - 6);
        }
      });
    }

    function roundRect(gc, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      gc.beginPath();
      gc.moveTo(x + rr, y);
      gc.arcTo(x + w, y, x + w, y + h, rr);
      gc.arcTo(x + w, y + h, x, y + h, rr);
      gc.arcTo(x, y + h, x, y, rr);
      gc.arcTo(x, y, x + w, y, rr);
      gc.closePath();
    }

    // ====================== RENDER UI ======================
    function renderTop() {
      top.innerHTML = `
        <div class="fh-score me">
          <span>${ctx.t("🎣 Bạn", "🎣 You")}</span>
          <b>${ctx.t(`${myScore} đ`, `${myScore} pt`)}</b>
          <small>${ctx.t(`🐟 ${myCount} con`, `🐟 ${myCount} fish`)}</small>
        </div>
        <div class="fh-timer ${timeLeft <= 10 ? "low" : ""}">
          <b>${Math.max(0, Math.ceil(timeLeft))}</b>
          <small>${ctx.t("giây", "sec")}</small>
        </div>
        <div class="fh-score opp">
          <span>${ctx.t("👤 Đối thủ", "👤 Opponent")}</span>
          <b>${ctx.t(`${oppScore} đ`, `${oppScore} pt`)}</b>
          <small>${ctx.t(`🐟 ${oppCount} con`, `🐟 ${oppCount} fish`)}</small>
        </div>
      `;
    }

    function renderReel() {
      if (hookState !== "reel" || !attached) { reel.classList.add("fh-hidden"); return; }
      reel.classList.remove("fh-hidden");
      const isItem = attached.kind === "item";
      const w = isItem ? 1 : attached.def.weight;
      const heavy = "🏋️".repeat(Math.min(w, 7)) || ctx.t("nhẹ", "light");
      const pct = Math.max(0, Math.min(100, progress));
      const col = pct > 66 ? "#6ee7b7" : pct > 33 ? "#ffd166" : "#ff5d73";
      const headTxt = isItem ? ctx.t("🎁 Vật phẩm bí ẩn", "🎁 Mystery item") : `${attached.def.emoji} ${entName(attached.def)} <span class="fh-reel-w">${heavy}</span>`;
      reel.innerHTML = `
        <div class="fh-reel-head">${headTxt}</div>
        <div class="fh-reel-key">${ctx.t("Bấm liên tục phím", "Hammer the key")} <kbd>${reelLetter.toUpperCase()}</kbd></div>
        <div class="fh-reel-bar"><i style="width:${pct}%;background:${col}"></i></div>
      `;
    }

    function renderBoosts() {
      const tags = [];
      if (baitNext) tags.push(ctx.t("🪱 mồi xịn", "🪱 bait"));
      if (starNext) tags.push(ctx.t("⭐ x2", "⭐ x2"));
      if (magnetNext) tags.push(ctx.t("🧲 nam châm", "🧲 magnet"));
      boosts.innerHTML = tags.length ? tags.map((t) => `<span>${t}</span>`).join("") : "";
    }

    // ====================== ĐỒNG HỒ / KẾT THÚC ======================
    function startCountdown() {
      if (phase !== "connect" && ctx.isOnline) return;
      phase = "countdown";
      countdown = 3;
      ctx.setStatus(ctx.t("Chuẩn bị...", "Get ready..."));
      renderTop();
      if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
      cdInt = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) { clearInterval(cdInt); cdInt = null; startPlay(); }
      }, 800);
    }

    function startPlay() {
      phase = "play";
      timeLeft = DURATION;
      spawnBoss();
      spawnItem();
      itemAcc = 1.6;
      ctx.setStatus(ctx.t("Câu nào! PHÍM CÁCH thả câu, bấm phím số hiện ra để kéo cá lên.", "Cast away! SPACE drops the hook, hammer the number key shown to reel fish in."));
      renderTop();
      timerInt = setInterval(() => {
        timeLeft -= 1;
        renderTop();
        if (timeLeft <= 0) endRace();
      }, 1000);
    }

    function endRace() {
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
      if (phase === "over") return;
      phase = "over";
      attached = null; reeled = null; hookState = "swing"; L = LMIN;
      reel.classList.add("fh-hidden");
      myDone = true;
      if (ctx.isOnline) ctx.sendMove({ kind: "final", score: myScore, count: myCount });
      ctx.setStatus(ctx.t("Hết giờ! Đang tổng kết...", "Time up! Tallying results..."));
      tryDecide();
      if (ctx.isOnline) setTimeout(() => { if (!decided) decide(); }, 3000);
    }

    function tryDecide() {
      if (decided) return;
      if (!ctx.isOnline) return decide();
      if (myDone && oppDone) decide();
    }

    function decide() {
      if (decided) return;
      decided = true;
      // KHÔNG dừng vòng lặp: cảnh hồ vẫn sống động, chỉ là không câu được nữa
      if (!ctx.isOnline) { ctx.setStatus(ctx.t(`🏁 Luyện tập xong — ${myScore} điểm (${myCount} con).`, `🏁 Practice done — ${myScore} points (${myCount} fish).`)); return; }
      let winner;
      if (myScore === oppScore) winner = -1;
      else if (myScore > oppScore) winner = ctx.mySeat;
      else winner = 1 - ctx.mySeat;
      if (winner === -1) { ctx.setStatus(ctx.t(`🤝 Hòa! Cả hai cùng ${myScore} điểm.`, `🤝 Draw! Both scored ${myScore} points.`)); return; }
      ctx.incScore(winner);
      ctx.setStatus(winner === ctx.mySeat
        ? ctx.t(`🎉 Bạn thắng! ${myScore} điểm so với ${oppScore}.`, `🎉 You win! ${myScore} points vs ${oppScore}.`)
        : ctx.t(`💀 Bạn thua. ${myScore} điểm, đối thủ ${oppScore}.`, `💀 You lose. ${myScore} points, opponent ${oppScore}.`));
    }

    function relayScore() {
      if (ctx.isOnline) ctx.sendMove({ kind: "score", score: myScore, count: myCount });
    }

    // ====================== ONLINE ======================
    function applyMove(move, fromRemote) {
      if (!fromRemote || !move) return;
      if (move.kind === "ready") {
        oppReady = true;
        if (iReady && phase === "connect") startCountdown();
        return;
      }
      if (move.kind === "score") {
        oppScore = Number(move.score) || 0; oppCount = Number(move.count) || 0;
        renderTop();
        return;
      }
      if (move.kind === "final") {
        oppDone = true; oppScore = Number(move.score) || 0; oppCount = Number(move.count) || 0;
        renderTop(); tryDecide();
        return;
      }
    }

    function teardown() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
      if (cdInt) { clearInterval(cdInt); cdInt = null; }
      document.removeEventListener("keydown", onKey);
    }

    // ----- khởi tạo -----
    renderTop(); renderBoosts(); draw();
    if (ctx.isOnline) {
      ctx.setNames(ctx.t("🎣 Bạn", "🎣 You"), ctx.t("👤 Đối thủ", "👤 Opponent"));
      ctx.setTurn(-1);
      iReady = true;
      ctx.sendMove({ kind: "ready" });
      if (oppReady) startCountdown();
      else ctx.setStatus(ctx.t("Đang chờ đối thủ vào hồ câu...", "Waiting for the opponent to join the pond..."));
    } else {
      ctx.setStatus(ctx.t("Chế độ luyện tập 1 người. PHÍM CÁCH thả câu, bấm phím số để kéo cá.", "Single-player practice. SPACE to cast, hammer the number key to reel fish."));
      startCountdown();
    }
    return { applyMove, destroy: teardown };
  }

  window.GameRegistry.register({
    id: "fishingfrenzy",
    name: "Câu Cá Đối Đầu",
    emoji: "🎣",
    description: "Đua câu cá bằng bàn phím: lưỡi câu đung đưa, bấm Cách thả câu, dính cá thì bấm phím số hiện ra liên tục để kéo lên. Có cá boss, vật phẩm hỗ trợ. Ai nhiều điểm hơn thắng.",
    onlineReady: true,
    localReady: true,
    options: [
      {
        id: "duration",
        label: "Thời gian",
        default: 60,
        choices: [
          { value: 45, label: "45 giây" },
          { value: 60, label: "1 phút" },
          { value: 90, label: "90 giây" },
        ],
      },
    ],
    howTo: [
      "Mỗi người câu trên hồ riêng; cùng đua trong thời gian định sẵn. Điều khiển hoàn toàn bằng BÀN PHÍM.",
      "Lưỡi câu treo trên thuyền tự đung đưa trái–phải. Bấm PHÍM CÁCH để thả lưỡi câu xuống theo hướng đang nhắm (giống game Đào Vàng).",
      "Khi lưỡi câu chạm trúng cá/vật phẩm, màn hình hiện một PHÍM SỐ ngẫu nhiên (0–9). Bấm phím đó thật nhanh, liên tục để kéo con cá lên.",
      "Cá càng nặng thì thanh kéo tụt càng nhanh — phải bấm nhanh hơn. Nếu thanh về 0 hoặc quá lâu thì cá sổng mất.",
      "Vật phẩm phải câu lên mới nhận: 🪱 mồi xịn (con kế dễ kéo), ⭐ sao (x2 điểm con kế), 🧲 nam châm (con kế tự dính), 💎 ngọc (+6 điểm), 🥾 giày rách (chẳng được gì).",
      "🐋 Cá BOSS bơi dưới đáy hồ: rất nặng và khó kéo nhưng được tới 25 điểm — phải thả câu xuống sâu mới tới.",
      "Cá lớn/hiếm cho nhiều điểm hơn. Hết giờ ai nhiều điểm hơn sẽ thắng.",
    ],
    create,
  });
})();
