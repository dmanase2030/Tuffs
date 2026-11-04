/* Lật Hình Tìm Cặp (Memory) — hỗ trợ chơi chung máy & online
   Online dùng RNG có hạt giống (ctx.rng) để hai máy xáo bài giống nhau.
   Thẻ lật 3D, nhiều bộ chủ đề emoji, combo và đồng hồ. */
(function () {
  const THEMES = {
    animals: ["🐶", "🐱", "🦊", "🐼", "🐯", "🦁", "🐸", "🐵", "🐨", "🐰", "🐷", "🐧", "🐔", "🦄", "🐢", "🐙", "🦋", "🐝"],
    food: ["🍎", "🍕", "🍔", "🍩", "🍦", "🍓", "🍒", "🍇", "🍉", "🍌", "🍑", "🥑", "🌮", "🍪", "🧁", "🍫", "🍿", "🥨"],
    faces: ["😀", "😎", "🤩", "😍", "🥳", "😜", "🤓", "😱", "😡", "🥶", "🤠", "👻", "🤖", "💀", "😴", "🤯", "🥰", "😈"],
    sport: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🏸", "🥏", "🎱", "🥊", "⛳", "🏒", "🥅", "🏹", "🎯", "🛹", "🎳"],
    nature: ["🌸", "🌻", "🌺", "🌹", "🌴", "🌵", "🍀", "🌊", "⭐", "🌙", "☀️", "🌈", "❄️", "🔥", "🍄", "🌿", "🌷", "🪐"],
    space: ["🚀", "🛸", "🚗", "🚕", "🚌", "🚓", "🚑", "🚒", "🏎️", "🚲", "🛵", "🚂", "✈️", "🚁", "⛵", "🚤", "🛶", "🚜"],
  };

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function bestCols(total) {
    let bestC = Math.round(Math.sqrt(total));
    let bestScore = Infinity;
    for (let c = 2; c <= total; c++) {
      const rows = Math.ceil(total / c);
      const empty = c * rows - total;
      const aspect = Math.abs(c - rows);
      const score = aspect + empty * 3 + (c < rows ? 0.5 : 0);
      if (score < bestScore) { bestScore = score; bestC = c; }
    }
    return bestC;
  }

  function create(ctx) {
    const PAIRS = (ctx.options && ctx.options.pairs) || 8;
    const themeKey = (ctx.options && ctx.options.theme) || "animals";
    const POOL = THEMES[themeKey] || THEMES.animals;
    const EMOJIS = POOL.slice(0, PAIRS);
    const deck = shuffle([...EMOJIS, ...EMOJIS], ctx.rng);
    const cols = bestCols(deck.length);
    let turn = 0;
    let firstIdx = null;
    let lock = false;
    let matchedCount = 0;
    const matchedBy = [0, 0];
    const combo = [0, 0];
    const bestCombo = [0, 0];
    let startTime = Date.now();
    let timerId = null;

    const root = document.createElement("div");
    root.className = "mem-root";
    ctx.boardEl.appendChild(root);

    // HUD
    const hud = document.createElement("div");
    hud.className = "mem-hud";
    const sp1 = document.createElement("div");
    sp1.className = "mem-score p1";
    const mid = document.createElement("div");
    mid.className = "mem-mid";
    const sp2 = document.createElement("div");
    sp2.className = "mem-score p2";
    hud.appendChild(sp1); hud.appendChild(mid); hud.appendChild(sp2);
    root.appendChild(hud);

    const boardEl = document.createElement("div");
    boardEl.className = "mem-board";
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    root.appendChild(boardEl);

    const cards = deck.map((emoji, i) => {
      const card = document.createElement("div");
      card.className = "mem-card hidden-face";
      const inner = document.createElement("div");
      inner.className = "mem-inner";
      const back = document.createElement("div");
      back.className = "mem-back";
      back.textContent = "❓";
      const front = document.createElement("div");
      front.className = "mem-front mem-face";
      front.textContent = emoji;
      inner.appendChild(back);
      inner.appendChild(front);
      card.appendChild(inner);
      card.addEventListener("click", () => onClick(i));
      boardEl.appendChild(card);
      return { el: card, emoji, matched: false };
    });

    function showFace(i, show) {
      cards[i].el.classList.toggle("flipped", show);
      cards[i].el.classList.toggle("hidden-face", !show);
    }

    function fmtTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, "0")}`;
    }

    function updateHud() {
      sp1.classList.toggle("turn", turn === 0);
      sp2.classList.toggle("turn", turn === 1);
      const c1 = combo[0] >= 2 ? ` <span class="mem-combo">🔥x${combo[0]}</span>` : "";
      const c2 = combo[1] >= 2 ? ` <span class="mem-combo">🔥x${combo[1]}</span>` : "";
      sp1.innerHTML = `<b>P1</b> <span class="mem-pairs">${matchedBy[0]}</span>${c1}`;
      sp2.innerHTML = `<span class="mem-pairs">${matchedBy[1]}</span> <b>P2</b>${c2}`;
      mid.innerHTML = `<span class="mem-time">⏱ ${fmtTime(Date.now() - startTime)}</span><span class="mem-left">${EMOJIS.length - matchedCount} ${ctx.t("cặp còn lại", "pairs left")}</span>`;
    }

    function onClick(i) {
      if (lock) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      const card = cards[i];
      if (card.matched || i === firstIdx) return;
      applyMove(i, false);
    }

    function applyMove(i, fromRemote) {
      if (lock) return;
      const card = cards[i];
      if (card.matched || i === firstIdx) return;

      if (!fromRemote) ctx.sendMove(i);

      showFace(i, true);
      ctx.sound("flip");

      if (firstIdx === null) {
        firstIdx = i;
        return;
      }

      if (cards[firstIdx].emoji === card.emoji) {
        cards[firstIdx].matched = true;
        card.matched = true;
        cards[firstIdx].el.classList.add("matched");
        card.el.classList.add("matched");
        matchedBy[turn]++;
        matchedCount++;
        combo[turn]++;
        if (combo[turn] > bestCombo[turn]) bestCombo[turn] = combo[turn];
        firstIdx = null;
        ctx.incScore(turn);
        ctx.sound("score");
        updateHud();
        if (matchedCount === EMOJIS.length) return finish();
        const cb = combo[turn] >= 2 ? ` 🔥 Combo x${combo[turn]}!` : "";
        ctx.setStatus(ctx.t(`✅ Người chơi ${turn + 1} tìm được một cặp — được đi tiếp!${cb}`,
          `✅ Player ${turn + 1} found a pair — go again!${cb}`));
      } else {
        lock = true;
        const a = firstIdx, b = i;
        firstIdx = null;
        combo[turn] = 0;
        ctx.sound("error");
        updateHud();
        setTimeout(() => {
          showFace(a, false);
          showFace(b, false);
          lock = false;
          turn = 1 - turn;
          ctx.setTurn(turn);
          updateHud();
          ctx.setStatus(ctx.t(`❌ Không khớp. Đến lượt Người chơi ${turn + 1}.`,
            `❌ No match. Player ${turn + 1}'s turn.`));
        }, 800);
      }
    }

    function finish() {
      if (timerId) { clearInterval(timerId); timerId = null; }
      ctx.setTurn(-1);
      const [a, b] = matchedBy;
      const bc = ctx.t(`(combo cao nhất: P1 x${bestCombo[0]}, P2 x${bestCombo[1]})`,
        `(best combo: P1 x${bestCombo[0]}, P2 x${bestCombo[1]})`);
      if (a > b) ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng với ${a} cặp! ${bc}`, `🎉 Player 1 wins with ${a} pairs! ${bc}`));
      else if (b > a) ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng với ${b} cặp! ${bc}`, `🎉 Player 2 wins with ${b} pairs! ${bc}`));
      else ctx.setStatus(ctx.t(`🤝 Hòa! Mỗi người ${a} cặp. ${bc}`, `🤝 Draw! ${a} pairs each. ${bc}`));
      updateHud();
    }

    // đồng hồ + tự dọn khi rời game
    timerId = setInterval(() => { if (matchedCount < EMOJIS.length) updateHud(); }, 1000);
    const observer = new MutationObserver(() => {
      if (!document.body.contains(boardEl)) {
        if (timerId) { clearInterval(timerId); timerId = null; }
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setTurn(0);
    updateHud();
    ctx.setStatus(ctx.t("Lật 2 thẻ giống nhau để ghi điểm. Tìm đúng được đi tiếp — ghép liên tiếp để lên combo!",
      "Flip two matching cards to score. A match lets you go again — chain matches for combos!"));
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "memory",
    name: "Lật Hình Tìm Cặp",
    emoji: "🧠",
    description: "Lật tìm các cặp hình giống nhau. Ghép liên tiếp để lên combo. Ai tìm được nhiều cặp hơn sẽ thắng.",
    onlineReady: true,
    options: [
      {
        id: "pairs", label: "Số cặp", default: 8,
        choices: [
          { value: 6, label: "6 cặp (dễ)" },
          { value: 8, label: "8 cặp (vừa)" },
          { value: 12, label: "12 cặp (khó)" },
          { value: 18, label: "18 cặp (siêu khó)" },
        ],
      },
      {
        id: "theme", label: "Bộ hình", default: "animals",
        choices: [
          { value: "animals", label: "🐶 Động vật" },
          { value: "food", label: "🍕 Đồ ăn" },
          { value: "faces", label: "😎 Mặt cười" },
          { value: "sport", label: "⚽ Thể thao" },
          { value: "nature", label: "🌸 Thiên nhiên" },
          { value: "space", label: "🚀 Xe & du hành" },
        ],
      },
    ],
    howTo: [
      "Các thẻ úp xuống theo từng cặp hình giống nhau (chọn bộ hình và số cặp ở màn chế độ).",
      "Đến lượt mình, lật 2 thẻ bất kỳ để xem hình.",
      "Nếu 2 thẻ giống nhau: bạn ghi 1 điểm, được đi tiếp và tăng COMBO 🔥 — ghép càng nhiều liên tiếp combo càng cao.",
      "Nếu 2 thẻ khác nhau: chúng úp lại, combo về 0 và chuyển lượt cho đối thủ.",
      "Đồng hồ ở giữa đếm thời gian ván đấu. Khi tìm hết các cặp, ai nhiều cặp hơn sẽ thắng.",
    ],
    create,
  });
})();
