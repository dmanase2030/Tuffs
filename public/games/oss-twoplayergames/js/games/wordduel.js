/* Ghép Từ Đối Kháng (Word Duel) — chơi chung máy, ĐẤU MÁY và ONLINE
   Kho âm tiết chung. Thay nhau ghép 2+ âm tiết thành TỪ tiếng Việt hợp lệ
   (window.VI_DICT) để ăn điểm. Chiều sâu chiến thuật:
     • Điểm theo ĐỘ HIẾM âm tiết (hay gặp 1đ · vừa 2đ · hiếm 3đ).
     • Ô NHÂN ĐIỂM ×2 / ×3 nằm rải trong kho.
     • Thưởng TỪ DÀI (≥3 âm tiết +3đ).
     • COMBO: ghép liên tiếp không bỏ lượt được cộng dồn thưởng.
     • ĐỔI KHO: bí thì làm mới toàn bộ kho (giới hạn lượt).

   Đồng bộ online: kho + hệ số + thứ tự rút sinh TẤT ĐỊNH từ ctx.rng (chung seed);
   chỉ gửi hành động (chỉ số ô / bỏ lượt / đổi kho) qua relay. */
(function () {
  const POOL = 9;            // số ô trong lưới
  const REFRESH_MAX = 2;     // số lần đổi kho mỗi người

  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }

  function create(ctx) {
    const o = ctx.options || {};
    const WIN = o.target ? Number(o.target) : 20;
    const CLOCK = o.clock ? Number(o.clock) : 0;      // giây mỗi lượt (0 = tắt)
    const MOVES_LIMIT = o.moves ? Number(o.moves) : 0; // số lượt tối đa (0 = tắt)
    const dict = (typeof window !== "undefined" && window.VI_DICT) ? window.VI_DICT : new Set();

    // Danh sách từ 2 âm tiết để dựng kho chắc chắn ghép được + tính độ hiếm.
    const twoSylWords = [];
    const freq = new Map();
    for (const w of dict) {
      const parts = w.split(" ");
      if (parts.length === 2) {
        twoSylWords.push(parts);
        for (const s of parts) freq.set(s, (freq.get(s) || 0) + 1);
      }
      if (twoSylWords.length >= 4000) break;
    }
    function sylScore(s) { const c = freq.get(s) || 0; return c >= 12 ? 1 : c >= 4 ? 2 : 3; }

    let score = [0, 0];
    let turn = ctx.isOnline ? ctx.firstSeat : 0;
    let over = false;
    let passes = 0;
    let streak = [0, 0];
    let refreshes = [REFRESH_MAX, REFRESH_MAX];
    let hints = [3, 3];        // số lần gợi ý mỗi người
    let hintPair = null;       // [i, j] cặp đang được gợi ý (highlight)
    let bag = [];
    let pool = [];
    let lastWord = null;
    let selected = [];
    let movesLeft = MOVES_LIMIT;   // tổng số lượt còn lại (chế độ giới hạn lượt)
    let clockLeft = CLOCK;         // giây còn lại của lượt hiện tại
    let clockTimer = null;

    const root = document.createElement("div");
    root.className = "wd-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    // Mỗi ô trong pool: { s: âm tiết, mult: hệ số (1/2/3) }
    function makeTile(syl) {
      // ~15% ô ×2, ~7% ô ×3 (tất định theo rng)
      const r = ctx.rng();
      const mult = r < 0.07 ? 3 : r < 0.22 ? 2 : 1;
      return { s: syl, mult };
    }

    function buildBag() {
      const sylSet = [];
      const pick = Math.min(60, twoSylWords.length);
      for (let i = 0; i < pick; i++) {
        const w = twoSylWords[Math.floor(ctx.rng() * twoSylWords.length)] || [];
        for (const s of w) sylSet.push(s);
      }
      for (let i = sylSet.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        const t = sylSet[i]; sylSet[i] = sylSet[j]; sylSet[j] = t;
      }
      bag = sylSet;
    }

    function refillPool() {
      while (pool.length < POOL && bag.length) pool.push(makeTile(bag.shift()));
    }

    // Đảm bảo kho LUÔN có ít nhất một cặp ghép được: nếu không, chèn thẳng 2 âm tiết
    // của một từ thật vào 2 ô (tất định theo rng để online đồng bộ).
    function ensurePlayable() {
      if (anyWordPossible() || !twoSylWords.length || pool.length < 2) return;
      const w = twoSylWords[Math.floor(ctx.rng() * twoSylWords.length)];
      // chọn 2 vị trí KHÔNG đang được chọn để thay (tránh phá lựa chọn dở của người chơi)
      const slots = [];
      for (let i = 0; i < pool.length && slots.length < 2; i++) {
        if (!selected.includes(i)) slots.push(i);
      }
      if (slots.length < 2) { slots.length = 0; slots.push(0, 1); }
      pool[slots[0]] = makeTile(w[0]);
      pool[slots[1]] = makeTile(w[1]);
    }

    function isWord(syls) {
      if (syls.length < 2) return false;
      return dict.has(norm(syls.join(" ")));
    }

    function anyWordPossible() {
      for (let i = 0; i < pool.length; i++)
        for (let j = 0; j < pool.length; j++) {
          if (i !== j && isWord([pool[i].s, pool[j].s])) return true;
        }
      return false;
    }

    // Tính điểm cho một nước ghép: tổng điểm-hiếm × hệ-số-ô, + thưởng dài + combo.
    function scoreFor(idx, seat) {
      let base = 0, mult = 1;
      for (const i of idx) { base += sylScore(pool[i].s); mult *= pool[i].mult; }
      let pts = base * mult;
      if (idx.length >= 3) pts += 3;            // thưởng từ dài
      const combo = streak[seat];               // combo hiện tại (trước nước này)
      if (combo >= 1) pts += combo;             // +1 mỗi mắt combo liên tiếp
      return { pts, base, mult, longBonus: idx.length >= 3 ? 3 : 0, comboBonus: combo >= 1 ? combo : 0 };
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    // ----- Đồng hồ mỗi lượt -----
    function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
    function startClock() {
      stopClock();
      if (CLOCK <= 0 || over) return;
      clockLeft = CLOCK;
      updateClockUi();
      // chỉ máy đang tới lượt mới đếm (để phát "bỏ lượt" tự động một lần)
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      clockTimer = setInterval(() => {
        clockLeft--;
        updateClockUi();
        if (clockLeft <= 0) {
          stopClock();
          if (canPlay()) { ctx.sound("miss"); applyMove({ k: "pass", timeout: true }, false); }
        }
      }, 1000);
    }
    function updateClockUi() {
      const el = els && root.querySelector("#wdClock");
      if (!el) return;
      if (CLOCK <= 0) { el.textContent = ""; return; }
      el.textContent = "⏱ " + Math.max(0, clockLeft) + "s";
      el.classList.toggle("low", clockLeft <= 5);
    }

    // Tìm một cặp ô ghép được (ưu tiên điểm cao) để gợi ý cho người chơi.
    function findHint() {
      let best = null, bestPts = -1;
      for (let i = 0; i < pool.length; i++)
        for (let j = 0; j < pool.length; j++) {
          if (i !== j && isWord([pool[i].s, pool[j].s])) {
            const pts = scoreFor([i, j], turn).pts;
            if (pts > bestPts) { bestPts = pts; best = [i, j]; }
          }
        }
      return best;
    }

    // Hành động: { k:"word", idx:[...] } | { k:"pass" } | { k:"refresh" }
    function applyMove(move, fromRemote) {
      if (over) return;
      hintPair = null;
      if (move.k === "word") {
        const idx = move.idx.map(Number);
        if (idx.length < 2) return;
        if (idx.some((i) => i < 0 || i >= pool.length) || new Set(idx).size !== idx.length) return;
        const syls = idx.map((i) => pool[i].s);
        if (!isWord(syls)) return;
        if (!fromRemote) ctx.sendMove({ k: "word", idx });

        const sc = scoreFor(idx, turn);
        score[turn] += sc.pts;
        streak[turn]++;
        passes = 0;
        ctx.sound("win");
        const sortedDesc = [...idx].sort((a, b) => b - a);
        for (const i of sortedDesc) pool.splice(i, 1);
        refillPool();
        ensurePlayable();
        lastWord = { by: turn, text: syls.join(" "), pts: sc.pts, mult: sc.mult, longBonus: sc.longBonus, comboBonus: sc.comboBonus };
        selected = [];

        if (WIN > 0 && score[turn] >= WIN) { finish(turn); return; }
        if (!bag.length && !anyWordPossible()) { finishByScore(); return; }
        endTurn();
      } else if (move.k === "refresh") {
        if (refreshes[turn] <= 0) return;
        if (!fromRemote) ctx.sendMove({ k: "refresh" });
        refreshes[turn]--;
        streak[turn] = 0;       // đổi kho làm mất combo
        pool = [];
        // trả âm tiết cũ về cuối túi rồi rút mới
        refillPool();
        let guard = 0;
        while (!anyWordPossible() && bag.length && guard++ < 30) pool.push(makeTile(bag.shift()));
        ensurePlayable();
        selected = [];
        ctx.sound("place");
        lastWord = { by: turn, refresh: true };
        startClock();           // đổi kho không mất lượt, chỉ làm mới đồng hồ
        render(); updateStatus();
      } else if (move.k === "pass") {
        if (!fromRemote) ctx.sendMove({ k: "pass" });
        passes++;
        streak[turn] = 0;
        selected = [];
        ctx.sound("place");
        if (passes >= 2 && MOVES_LIMIT <= 0) { finishByScore(); return; }
        endTurn();
      }
    }

    // Kết thúc một lượt: trừ số lượt (nếu có giới hạn), đổi người, khởi động đồng hồ.
    function endTurn() {
      if (MOVES_LIMIT > 0) {
        movesLeft--;
        if (movesLeft <= 0) { finishByScore(); return; }
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
      startClock();
      render(); updateStatus();
    }

    function finish(winner) {
      over = true;
      stopClock();
      if (winner >= 0) ctx.incScore(winner);
      ctx.setTurn(-1);
      ctx.sound("win");
      render();
      ctx.setStatus(winner < 0
        ? ctx.t(`🤝 Hòa ${score[0]}–${score[1]}!`, `🤝 Draw ${score[0]}–${score[1]}!`)
        : ctx.t(`🎉 Người chơi ${winner + 1} thắng ${score[0]}–${score[1]}!`, `🎉 Player ${winner + 1} wins ${score[0]}–${score[1]}!`));
    }
    function finishByScore() {
      const w = score[0] === score[1] ? -1 : (score[0] > score[1] ? 0 : 1);
      finish(w);
    }

    // ----- AI: chọn nước điểm cao nhất (hard) / ngẫu nhiên (easy) -----
    function aiMove(level) {
      if (over) return null;
      const pairs = [];
      for (let i = 0; i < pool.length; i++)
        for (let j = 0; j < pool.length; j++) {
          if (i !== j && isWord([pool[i].s, pool[j].s])) pairs.push([i, j]);
        }
      if (!pairs.length) {
        if (refreshes[turn] > 0) return { k: "refresh" };
        return { k: "pass" };
      }
      if (level === "easy" && Math.random() < 0.4) return { k: "word", idx: pairs[Math.floor(ctx.rng() * pairs.length)] };
      if (level === "normal") return { k: "word", idx: pairs[Math.floor(ctx.rng() * pairs.length)] };
      // hard: chọn cặp điểm cao nhất
      let best = pairs[0], bestPts = -1;
      for (const p of pairs) { const s = scoreFor(p, turn).pts; if (s > bestPts) { bestPts = s; best = p; } }
      return { k: "word", idx: best };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="wd-head" id="wdHead"></div>` +
        `<div class="wd-last" id="wdLast"></div>` +
        `<div class="wd-pool" id="wdPool"></div>` +
        `<div class="wd-sel" id="wdSel"></div>` +
        `<div class="wd-acts" id="wdActs"></div>`;
      els = {
        head: root.querySelector("#wdHead"),
        last: root.querySelector("#wdLast"),
        pool: root.querySelector("#wdPool"),
        sel: root.querySelector("#wdSel"),
        acts: root.querySelector("#wdActs"),
      };
    }

    function tileHtml(t, i) {
      const sel = selected.includes(i);
      const hinted = hintPair && hintPair.includes(i);
      const multTag = t.mult > 1 ? `<span class="wd-mult x${t.mult}">×${t.mult}</span>` : "";
      const sc = sylScore(t.s);
      return `<button type="button" class="wd-tile${sel ? " on" : ""}${hinted ? " hint" : ""} r${sc}" data-i="${i}">` +
        `${sel ? `<span class="wd-order">${selected.indexOf(i) + 1}</span>` : ""}` +
        `${multTag}<span class="wd-syl">${t.s}</span><span class="wd-pt">${sc}</span>` +
      `</button>`;
    }

    function render() {
      if (!els) buildShell();
      const me = ctx.isOnline ? ctx.mySeat : turn;
      function combo(seat) { return streak[seat] >= 1 ? `<span class="wd-combo">🔥${streak[seat] + 1}x</span>` : ""; }
      els.head.innerHTML =
        `<div class="wd-pinfo p1 ${turn === 0 && !over ? "active" : ""}">` +
          `<span>🟥 P1${me === 0 ? ctx.t(" (bạn)", " (you)") : ""} ${combo(0)}</span><b>${score[0]}</b>` +
        `</div>` +
        `<div class="wd-goal">` +
          `<span class="wd-clock" id="wdClock"></span>` +
          `<span>${WIN > 0 ? ctx.t(`về đích ${WIN}`, `to ${WIN}`) : ctx.t("hết kho", "until empty")}</span>` +
          `${MOVES_LIMIT > 0 ? `<span class="wd-moves">${ctx.t("còn", "left")} ${Math.ceil(movesLeft / 2)} ${ctx.t("lượt", "turns")}</span>` : ""}` +
        `</div>` +
        `<div class="wd-pinfo p2 ${turn === 1 && !over ? "active" : ""}">` +
          `<span>🟦 P2${me === 1 ? ctx.t(" (bạn)", " (you)") : ""} ${combo(1)}</span><b>${score[1]}</b>` +
        `</div>`;

      if (lastWord && lastWord.refresh) {
        els.last.innerHTML = ctx.t(`🔄 P${lastWord.by + 1} đã đổi kho.`, `🔄 P${lastWord.by + 1} refreshed the pool.`);
      } else if (lastWord) {
        const extra = (lastWord.mult > 1 ? ` ×${lastWord.mult}` : "") +
          (lastWord.longBonus ? ` +${lastWord.longBonus}${ctx.t(" dài", " long")}` : "") +
          (lastWord.comboBonus ? ` +${lastWord.comboBonus}${ctx.t(" combo", " combo")}` : "");
        els.last.innerHTML = ctx.t(`Vừa ghép: <b>${lastWord.text}</b> → <b>+${lastWord.pts}</b>${extra} (P${lastWord.by + 1})`,
                                   `Last: <b>${lastWord.text}</b> → <b>+${lastWord.pts}</b>${extra} (P${lastWord.by + 1})`);
      } else {
        els.last.innerHTML = ctx.t("Ghép âm tiết thành từ. Ô ×2/×3 và từ dài cho nhiều điểm hơn!", "Form words from syllables. ×2/×3 tiles and long words score more!");
      }

      els.pool.innerHTML = pool.map((t, i) => tileHtml(t, i)).join("");

      const syls = selected.map((i) => pool[i].s);
      const valid = isWord(syls);
      if (selected.length) {
        const preview = syls.join(" ");
        if (valid) {
          const sc = scoreFor(selected, turn);
          const extra = (sc.mult > 1 ? ` ×${sc.mult}` : "") + (sc.longBonus ? ` +${sc.longBonus}` : "") + (sc.comboBonus ? ` +${sc.comboBonus}🔥` : "");
          els.sel.innerHTML = `<span class="wd-prev ok">${preview}</span><span class="wd-ok">✓ +${sc.pts}${extra}</span>`;
        } else {
          els.sel.innerHTML = `<span class="wd-prev">${preview}</span><span class="wd-no">${ctx.t("chưa thành từ", "not a word yet")}</span>`;
        }
      } else {
        els.sel.innerHTML = `<span class="wd-prev empty">${ctx.t("(chọn ô bên trên)", "(pick tiles above)")}</span>`;
      }

      renderActs(valid);
      updateClockUi();
    }

    function renderActs(valid) {
      if (over) { els.acts.innerHTML = ""; return; }
      if (!canPlay()) { els.acts.innerHTML = `<div class="wd-wait">${ctx.t("Chờ đối thủ...", "Waiting for opponent...")}</div>`; return; }
      const rLeft = refreshes[turn];
      const hLeft = hints[turn];
      els.acts.innerHTML =
        `<button type="button" class="btn wd-clear">${ctx.t("↺ Bỏ chọn", "↺ Clear")}</button>` +
        `<button type="button" class="btn primary wd-go${valid ? "" : " disabled"}">${ctx.t("✓ Ghép từ", "✓ Make word")}</button>` +
        `<button type="button" class="btn wd-hint${hLeft > 0 ? "" : " disabled"}">${ctx.t("💡 Gợi ý", "💡 Hint")} (${hLeft})</button>` +
        `<button type="button" class="btn wd-refresh${rLeft > 0 ? "" : " disabled"}">${ctx.t("🔄 Đổi kho", "🔄 Refresh")} (${rLeft})</button>` +
        `<button type="button" class="btn wd-pass">${ctx.t("⤳ Bỏ lượt", "⤳ Pass")}</button>`;
      wireActs();
    }

    function wireActs() {
      els.pool.querySelectorAll(".wd-tile").forEach((b) => {
        b.addEventListener("click", () => {
          if (!canPlay()) return;
          const i = Number(b.dataset.i);
          const at = selected.indexOf(i);
          if (at >= 0) selected.splice(at, 1);
          else selected.push(i);
          render();
        });
      });
      const clr = els.acts.querySelector(".wd-clear");
      if (clr) clr.addEventListener("click", () => { selected = []; render(); });
      const go = els.acts.querySelector(".wd-go");
      if (go) go.addEventListener("click", () => {
        if (!isWord(selected.map((i) => pool[i].s))) return;
        applyMove({ k: "word", idx: selected.slice() }, false);
      });
      const ref = els.acts.querySelector(".wd-refresh");
      if (ref) ref.addEventListener("click", () => { if (refreshes[turn] > 0) applyMove({ k: "refresh" }, false); });
      const hint = els.acts.querySelector(".wd-hint");
      if (hint) hint.addEventListener("click", useHint);
      const pass = els.acts.querySelector(".wd-pass");
      if (pass) pass.addEventListener("click", () => applyMove({ k: "pass" }, false));
    }

    function useHint() {
      if (!canPlay() || hints[turn] <= 0) return;
      const pair = findHint();
      if (!pair) {
        ctx.setStatus(ctx.t("Không có cặp nào ghép được — hãy đổi kho hoặc bỏ lượt.", "No valid pair — refresh the pool or pass."));
        return;
      }
      hints[turn]--;
      hintPair = pair;
      // gợi ý sẵn cho người chơi bằng cách chọn luôn cặp đó
      selected = pair.slice();
      ctx.sound("notify");
      render();
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t("Đối thủ đang ghép từ...", "Opponent is forming a word..."));
      else ctx.setStatus(ctx.t(`Lượt bạn: ghép từ để ăn điểm. Nhắm ô ×2/×3 và từ dài, giữ combo 🔥 để cộng dồn!`,
        `Your turn: form words to score. Aim for ×2/×3 tiles and long words, keep your 🔥 combo going!`));
    }

    // khởi tạo
    buildBag();
    refillPool();
    let guard = 0;
    while (!anyWordPossible() && bag.length && guard++ < 20) { pool.push(makeTile(bag.shift())); }
    ensurePlayable();
    ctx.setTurn(turn);
    render();
    updateStatus();
    startClock();

    function destroy() { stopClock(); }
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "wordduel",
    name: "Ghép Từ Đối Kháng",
    emoji: "🔤",
    description: "Ghép âm tiết thành từ tiếng Việt để ăn điểm — đua vốn từ, ô ×2/×3 và combo.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "target", label: "Điểm để thắng", default: 20,
        choices: [
          { value: 15, label: "15 (nhanh)" },
          { value: 20, label: "20 (chuẩn)" },
          { value: 30, label: "30 (dài)" },
          { value: 0, label: "Chơi tới khi hết kho" },
        ],
      },
      {
        id: "clock", label: "Đồng hồ mỗi lượt", default: 0,
        choices: [
          { value: 0, label: "Tắt (thong thả)" },
          { value: 30, label: "30 giây/lượt" },
          { value: 20, label: "20 giây/lượt" },
          { value: 12, label: "12 giây/lượt (căng)" },
        ],
      },
      {
        id: "moves", label: "Giới hạn số lượt", default: 0,
        choices: [
          { value: 0, label: "Không (chơi tới mốc điểm)" },
          { value: 12, label: "6 lượt mỗi người" },
          { value: 20, label: "10 lượt mỗi người" },
        ],
      },
    ],
    howTo: [
      "Trên màn có một KHO ÂM TIẾT chung. Đến lượt, bấm chọn 2+ ô theo thứ tự để ghép thành một TỪ tiếng Việt CÓ NGHĨA (vd 'bình' + 'yên').",
      "Mỗi âm tiết có ĐIỂM theo độ hiếm (số nhỏ ở góc ô): hay gặp = 1, vừa = 2, hiếm = 3. Ghép từ chứa âm tiết hiếm sẽ được nhiều điểm hơn.",
      "Một số ô có HỆ SỐ ×2 hoặc ×3 — nếu dùng ô đó, điểm cả từ được nhân lên. Cố nhắm vào các ô nhân điểm!",
      "Thưởng TỪ DÀI: ghép từ 3 âm tiết trở lên được +3 điểm. COMBO 🔥: ghép liên tiếp không bỏ lượt sẽ cộng thêm điểm tăng dần; bỏ lượt hoặc đổi kho sẽ mất combo.",
      "Bí nước? Bấm '🔄 Đổi kho' để thay toàn bộ âm tiết (mỗi người có giới hạn lượt). Hoặc bấm '💡 Gợi ý' để hệ thống tô sáng & chọn sẵn một cặp ô ghép được (cũng giới hạn lượt). Hoặc 'Bỏ lượt' — cả hai bỏ lượt liên tiếp thì ván kết thúc.",
      "Người đạt điểm mốc trước sẽ thắng; nếu chơi tới khi hết kho thì ai nhiều điểm hơn thắng. Chơi chung máy, đấu với máy, hoặc online.",
      "Cơ chế đấu thêm (tùy chọn): bật ĐỒNG HỒ mỗi lượt — hết giờ tự động bỏ lượt (mất combo!); hoặc bật GIỚI HẠN SỐ LƯỢT — đánh đủ số lượt thì so điểm, ai cao hơn thắng.",
    ],
    create,
  });
})();
