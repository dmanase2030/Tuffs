/* Xì Dách Đối Kháng (Blackjack Duel, 21 điểm) — chung máy, ĐẤU MÁY, ONLINE
   Hai người rút bài từ CÙNG một bộ (sinh + xáo tất định từ ctx.rng nên hai máy
   giống hệt). Lần lượt: RÚT (hit) thêm bài hoặc DỪNG (stand). Quá 21 = "quắc" (bust),
   thua ngay. Khi cả hai dừng (hoặc một người quắc), so điểm gần 21 nhất thắng.
   Chơi nhiều ván tới khi đạt số ván thắng mục tiêu.

   Đồng bộ online: bộ bài tất định + chỉ gửi hành động (hit/stand) qua relay. */
(function () {
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  function create(ctx) {
    const o = ctx.options || {};
    const TARGET_WINS = o.wins ? Number(o.wins) : 3;

    const seat0First = ctx.isOnline ? ctx.firstSeat : 0;

    let deck = [];
    let hands = [[], []];
    let stood = [false, false];
    let busted = [false, false];
    let turn = seat0First;
    let roundOver = false;
    let matchOver = false;
    let wins = [0, 0];
    let starter = seat0First;

    const root = document.createElement("div");
    root.className = "bj-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function buildDeck() {
      deck = [];
      for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ s, r });
      // xáo Fisher-Yates với rng tất định
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
    }

    function cardValue(r) { // r: 0=A ... 12=K
      if (r === 0) return 11;       // A = 11 (điều chỉnh sau nếu quá 21)
      if (r >= 9) return 10;        // 10/J/Q/K = 10
      return r + 1;                 // 2..9
    }

    function handTotal(hand) {
      let total = 0, aces = 0;
      for (const c of hand) { total += cardValue(c.r); if (c.r === 0) aces++; }
      while (total > 21 && aces > 0) { total -= 10; aces--; } // A từ 11 -> 1
      return total;
    }

    function startRound() {
      buildDeck();
      hands = [[], []];
      stood = [false, false];
      busted = [false, false];
      roundOver = false;
      turn = starter;
      // chia 2 lá mỗi người: xen kẽ bắt đầu từ starter
      const order = [starter, 1 - starter, starter, 1 - starter];
      for (const p of order) hands[p].push(deck.pop());
      // kiểm tra blackjack tức thì
      if (handTotal(hands[0]) === 21 || handTotal(hands[1]) === 21) {
        // vào pha kết thúc ngay
        stood = [true, true];
        ctx.setTurn(turn);
        render();
        setTimeout(resolveRound, 600);
        return;
      }
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function canPlay() {
      return !roundOver && !matchOver && !stood[turn] && !busted[turn] &&
        (!ctx.isOnline || turn === ctx.mySeat);
    }

    function advanceTurn() {
      // chuyển lượt sang người chưa dừng/chưa quắc; nếu cả hai xong -> kết thúc
      const other = 1 - turn;
      if (!stood[other] && !busted[other]) turn = other;
      if ((stood[0] || busted[0]) && (stood[1] || busted[1])) {
        resolveRound();
        return;
      }
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // nước đi: { k:"hit" } | { k:"stand" }
    function applyMove(move, fromRemote) {
      if (roundOver || matchOver) return;
      if (stood[turn] || busted[turn]) return;
      if (move.k === "hit") {
        if (!fromRemote) ctx.sendMove({ k: "hit" });
        hands[turn].push(deck.pop());
        ctx.sound("place");
        const total = handTotal(hands[turn]);
        if (total > 21) { busted[turn] = true; ctx.sound("lose"); }
        else if (total === 21) { stood[turn] = true; }
        render();
        if (busted[turn] || stood[turn]) advanceTurn();
        else updateStatus();
      } else if (move.k === "stand") {
        if (!fromRemote) ctx.sendMove({ k: "stand" });
        stood[turn] = true;
        ctx.sound("place");
        advanceTurn();
      }
    }

    function resolveRound() {
      roundOver = true;
      const t0 = busted[0] ? 0 : handTotal(hands[0]);
      const t1 = busted[1] ? 0 : handTotal(hands[1]);
      let roundWinner = -1; // -1 = hòa
      if (busted[0] && busted[1]) roundWinner = -1;
      else if (busted[0]) roundWinner = 1;
      else if (busted[1]) roundWinner = 0;
      else if (t0 > t1) roundWinner = 0;
      else if (t1 > t0) roundWinner = 1;
      else roundWinner = -1;

      if (roundWinner >= 0) wins[roundWinner]++;
      render(true);

      const sumTxt = ctx.t(`P1: ${busted[0] ? "QUẮC" : t0} · P2: ${busted[1] ? "QUẮC" : t1}`,
        `P1: ${busted[0] ? "BUST" : t0} · P2: ${busted[1] ? "BUST" : t1}`);
      if (wins[0] >= TARGET_WINS || wins[1] >= TARGET_WINS) {
        matchOver = true;
        const mw = wins[0] > wins[1] ? 0 : 1;
        ctx.incScore(mw);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${mw + 1} vô địch ${wins[0]}–${wins[1]}! (${sumTxt})`,
          `🎉 Player ${mw + 1} wins the match ${wins[0]}–${wins[1]}! (${sumTxt})`));
        return;
      }
      const rtxt = roundWinner < 0 ? ctx.t("🤝 Hòa ván.", "🤝 Round tied.")
        : ctx.t(`Người chơi ${roundWinner + 1} thắng ván.`, `Player ${roundWinner + 1} wins the round.`);
      ctx.setStatus(`${rtxt} ${sumTxt} — ${ctx.t("ván mới...", "next round...")}`);
      starter = 1 - starter; // đổi người chia
      setTimeout(() => { if (!matchOver) startRound(); }, 1700);
    }

    // ----- AI: rút tới ngưỡng theo mức + cân nhắc thế đối thủ -----
    function aiMove(level) {
      if (roundOver || matchOver) return null;
      const me = turn;
      const total = handTotal(hands[me]);
      const oppVisible = handTotal(hands[1 - me]); // máy "nhìn" được (đơn giản)
      let threshold = level === "hard" ? 17 : level === "normal" ? 16 : 15;
      // nếu đối thủ đã dừng với điểm cao, máy liều hơn
      if (stood[1 - me] && oppVisible >= total && total < 21) threshold = Math.max(threshold, Math.min(20, oppVisible + 1));
      if (total < threshold) return { k: "hit" };
      return { k: "stand" };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="bj-score" id="bjScore"></div>` +
        `<div class="bj-table">` +
          `<div class="bj-seat" data-seat="opp"><div class="bj-seat-head"></div><div class="bj-cards"></div><div class="bj-total"></div></div>` +
          `<div class="bj-seat" data-seat="me"><div class="bj-seat-head"></div><div class="bj-cards"></div><div class="bj-total"></div></div>` +
        `</div>` +
        `<div class="bj-acts" id="bjActs"></div>`;
      els = {
        score: root.querySelector("#bjScore"),
        oppHead: root.querySelector('[data-seat="opp"] .bj-seat-head'),
        oppCards: root.querySelector('[data-seat="opp"] .bj-cards'),
        oppTotal: root.querySelector('[data-seat="opp"] .bj-total'),
        meHead: root.querySelector('[data-seat="me"] .bj-seat-head'),
        meCards: root.querySelector('[data-seat="me"] .bj-cards'),
        meTotal: root.querySelector('[data-seat="me"] .bj-total'),
        acts: root.querySelector("#bjActs"),
      };
    }

    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : turn; }

    function cardHtml(c, hidden) {
      if (hidden) return `<span class="bj-card back"><span class="bj-back-deco">🂠</span></span>`;
      const red = c.s === 1 || c.s === 2;
      const r = RANKS[c.r], s = SUITS[c.s];
      return `<span class="bj-card${red ? " red" : ""}">` +
        `<span class="bj-corner tl"><b>${r}</b><i>${s}</i></span>` +
        `<span class="bj-pip">${s}</span>` +
        `<span class="bj-corner br"><b>${r}</b><i>${s}</i></span>` +
      `</span>`;
    }

    function render(revealAll) {
      if (!els) buildShell();
      const me = mySeatIdx();
      const opp = 1 - me;
      els.score.innerHTML =
        `<span class="bj-w p1">P1 <b>${wins[0]}</b></span>` +
        `<span class="bj-target">${ctx.t("đua tới", "race to")} ${TARGET_WINS}</span>` +
        `<span class="bj-w p2">P2 <b>${wins[1]}</b></span>`;

      // đối thủ: che lá khi còn đang chơi (trừ khi revealAll); hiện lá đầu
      const oppDone = revealAll || roundOver;
      els.oppHead.innerHTML = `🃏 P${opp + 1}${turn === opp && !roundOver && !matchOver ? ` · <span class="bj-turn">${ctx.t("đang đi", "to act")}</span>` : ""}${stood[opp] ? ` · ${ctx.t("dừng", "stand")}` : ""}${busted[opp] ? ` · ${ctx.t("QUẮC", "BUST")}` : ""}`;
      els.oppCards.innerHTML = hands[opp].map((c, i) => cardHtml(c, !oppDone && i > 0)).join("");
      els.oppTotal.textContent = oppDone ? (busted[opp] ? ctx.t("QUẮC", "BUST") : handTotal(hands[opp])) : (hands[opp].length ? ctx.t("? điểm", "? pts") : "");

      els.meHead.innerHTML = `🃏 P${me + 1} (${ctx.t("bạn", "you")})${turn === me && !roundOver && !matchOver ? ` · <span class="bj-turn">${ctx.t("lượt bạn", "your turn")}</span>` : ""}${stood[me] ? ` · ${ctx.t("dừng", "stand")}` : ""}${busted[me] ? ` · ${ctx.t("QUẮC", "BUST")}` : ""}`;
      els.meCards.innerHTML = hands[me].map((c) => cardHtml(c, false)).join("");
      const mt = handTotal(hands[me]);
      els.meTotal.innerHTML = `<b>${busted[me] ? ctx.t("QUẮC", "BUST") : mt}</b> ${ctx.t("điểm", "pts")}`;
      els.meTotal.classList.toggle("bust", busted[me]);
      els.meTotal.classList.toggle("bj21", !busted[me] && mt === 21);

      renderActs();
    }

    function renderActs() {
      if (matchOver) { els.acts.innerHTML = ""; return; }
      if (!canPlay()) {
        els.acts.innerHTML = `<div class="bj-wait">${roundOver ? ctx.t("Đang sang ván mới...", "Next round...") : ctx.t("Chờ đối thủ...", "Waiting for opponent...")}</div>`;
        return;
      }
      els.acts.innerHTML =
        `<button type="button" class="btn primary bj-hit">${ctx.t("Rút", "Hit")}</button>` +
        `<button type="button" class="btn bj-stand">${ctx.t("Dừng", "Stand")}</button>`;
      els.acts.querySelector(".bj-hit").addEventListener("click", () => applyMove({ k: "hit" }, false));
      els.acts.querySelector(".bj-stand").addEventListener("click", () => applyMove({ k: "stand" }, false));
    }

    function updateStatus() {
      if (roundOver || matchOver) return;
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t("Đối thủ đang quyết định...", "Opponent is deciding..."));
      else ctx.setStatus(ctx.t(`Lượt bạn: "Rút" thêm lá hay "Dừng" chốt điểm? Quá 21 là quắc!`,
        `Your turn: "Hit" for another card or "Stand" to lock in? Over 21 busts!`));
    }

    buildShell();
    startRound();

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "blackjackduel",
    name: "Xì Dách Đối Kháng",
    emoji: "🃏",
    description: "Rút bài đua tới 21 điểm, gần hơn thì thắng — quá tay là 'quắc'.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "wins", label: "Số ván để vô địch", default: 3,
        choices: [
          { value: 2, label: "2 ván (nhanh)" },
          { value: 3, label: "3 ván" },
          { value: 5, label: "5 ván" },
        ],
      },
    ],
    howTo: [
      "Mỗi ván, hai người được chia 2 lá từ cùng một bộ bài. Bạn nhìn rõ bài của mình; lá thứ hai của đối thủ bị úp cho tới khi lật.",
      "Điểm: A = 11 (tự hạ xuống 1 nếu sẽ quá 21), các lá 10/J/Q/K = 10, còn lại tính theo số.",
      "Đến lượt, bạn chọn 'RÚT' để lấy thêm một lá, hoặc 'DỪNG' để chốt điểm hiện tại.",
      "Nếu tổng điểm vượt quá 21 bạn bị 'QUẮC' (bust) và thua ván ngay lập tức.",
      "Khi cả hai đã dừng (hoặc một người quắc), so điểm: ai gần 21 hơn (không vượt) sẽ thắng ván; bằng điểm thì hòa.",
      "Người đầu tiên thắng đủ số ván đã chọn sẽ vô địch. Chơi chung máy, đấu với máy, hoặc online.",
    ],
    create,
  });
})();
