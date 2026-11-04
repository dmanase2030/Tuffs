/* Cá Ngựa Nói Dối (Liar's Dice) — chơi chung máy, ĐẤU MÁY và ONLINE
   Mỗi người có 5 xúc xắc giấu kín. Lần lượt "tố" (bid): số lượng tối thiểu của
   một mặt xúc xắc trên TẤT CẢ xúc xắc của hai người. Bid sau phải cao hơn bid trước.
   Thay vì tố, có thể "nghi ngờ" (challenge): lật hết, nếu thực tế < bid thì người
   tố vừa rồi sai (mất 1 xúc xắc), ngược lại người nghi ngờ mất 1 xúc xắc.
   Mặt 1 (★) là mặt hoang (wild), tính cho mọi mặt. Ai hết xúc xắc trước sẽ THUA.

   Đồng bộ online: toàn bộ chuỗi xúc xắc các vòng được sinh sẵn từ ctx.rng (chung
   seed) nên hai máy giống hệt; chỉ gửi hành động công khai (bid/challenge) qua relay.
   UI chỉ hiện xúc xắc của CHÍNH mình (theo mySeat) cho tới khi lật. */
(function () {
  const PIPS = ["★", "⚁", "⚂", "⚃", "⚄", "⚅"]; // mặt 1 = wild

  function create(ctx) {
    const o = ctx.options || {};
    const START = o.dice ? Number(o.dice) : 5;
    const WILD = o.wild !== "off"; // mặt 1 là hoang

    const seat0First = ctx.isOnline ? ctx.firstSeat : 0;

    // Số xúc xắc còn lại của mỗi người
    let counts = [START, START];
    // Xúc xắc hiện tại mỗi người (mảng giá trị 1..6)
    let dice = [[], []];
    let turn = seat0First;
    let bid = null;        // { qty, face, by }
    let over = false;
    let revealing = false;

    const root = document.createElement("div");
    root.className = "ld-root";
    ctx.boardEl.appendChild(root);
    let elsCache = null;

    // RNG tất định: tạo xúc xắc cho một vòng (cả hai máy giống nhau)
    function rollAll() {
      dice = [[], []];
      for (let p = 0; p < 2; p++) {
        for (let i = 0; i < counts[p]; i++) {
          dice[p].push(1 + Math.floor(ctx.rng() * 6));
        }
      }
    }

    function totalDice() { return counts[0] + counts[1]; }

    // Đếm số xúc xắc khớp mặt face trên TẤT CẢ xúc xắc (wild = mặt 1 tính thêm)
    function countFace(face) {
      let n = 0;
      for (let p = 0; p < 2; p++) {
        for (const d of dice[p]) {
          if (d === face) n++;
          else if (WILD && d === 1 && face !== 1) n++;
        }
      }
      return n;
    }

    function canAct() { return !over && !revealing && (!ctx.isOnline || turn === ctx.mySeat); }

    // Bid hợp lệ: cao hơn bid hiện tại (tăng qty, hoặc cùng qty nhưng face cao hơn)
    function bidHigher(a, b) {
      if (!b) return a.qty >= 1 && a.face >= 1 && a.face <= 6;
      if (a.qty > b.qty) return true;
      if (a.qty === b.qty && a.face > b.face) return true;
      return false;
    }

    function nextSeat(s) { return 1 - s; }

    function startRound(first) {
      rollAll();
      bid = null;
      turn = first;
      revealing = false;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // Hành động: { k:"bid", qty, face } | { k:"challenge" }
    function applyMove(move, fromRemote) {
      if (over || revealing) return;
      if (move.k === "bid") {
        const nb = { qty: Number(move.qty), face: Number(move.face), by: turn };
        if (!bidHigher(nb, bid)) return;
        if (!fromRemote) ctx.sendMove({ k: "bid", qty: nb.qty, face: nb.face });
        bid = nb;
        ctx.sound("place");
        turn = nextSeat(turn);
        ctx.setTurn(turn);
        render();
        updateStatus();
      } else if (move.k === "challenge") {
        if (!bid) return; // không thể nghi ngờ khi chưa ai tố
        if (!fromRemote) ctx.sendMove({ k: "challenge" });
        doReveal();
      }
    }

    function doReveal() {
      revealing = true;
      const actual = countFace(bid.face);
      const bidder = bid.by;
      const challenger = nextSeat(bidder);
      // bid đúng nếu thực tế >= qty -> challenger thua 1 xúc xắc; ngược lại bidder thua
      const bidTrue = actual >= bid.qty;
      const loser = bidTrue ? challenger : bidder;
      counts[loser] = Math.max(0, counts[loser] - 1);
      ctx.sound(bidTrue ? "lose" : "win");
      render(true); // lật hết
      const faceTxt = PIPS[bid.face - 1];
      const verdict = ctx.t(
        `Tố: "ít nhất ${bid.qty} mặt ${faceTxt}". Thực tế: ${actual}. ` +
          (bidTrue ? `Tố ĐÚNG — P${challenger + 1} nghi sai, mất 1 xúc xắc.` : `Tố SAI — P${bidder + 1} mất 1 xúc xắc.`),
        `Bid: "at least ${bid.qty} of ${faceTxt}". Actual: ${actual}. ` +
          (bidTrue ? `Bid was TRUE — P${challenger + 1} challenged wrong, loses a die.` : `Bid was FALSE — P${bidder + 1} loses a die.`));
      ctx.setStatus(verdict);

      setTimeout(() => {
        if (counts[0] === 0 || counts[1] === 0) {
          over = true;
          const winner = counts[0] > 0 ? 0 : 1;
          ctx.incScore(winner);
          ctx.setTurn(-1);
          ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng — đối thủ hết xúc xắc!`,
            `🎉 Player ${winner + 1} wins — opponent ran out of dice!`));
          render(true);
          return;
        }
        // người thua vòng được tố trước vòng sau
        startRound(loser);
      }, 1700);
    }

    // ----- AI: ước lượng xác suất đơn giản -----
    function aiMove(level) {
      if (over || revealing) return null;
      const me = turn;
      const myDice = dice[me];
      const unknown = counts[1 - me]; // số xúc xắc đối thủ (chưa biết)
      // đếm mặt của chính mình
      const mine = {};
      for (let f = 1; f <= 6; f++) mine[f] = 0;
      for (const d of myDice) {
        mine[d]++;
        if (WILD && d === 1) for (let f = 2; f <= 6; f++) mine[f]++;
      }
      // kỳ vọng số xúc xắc đối thủ khớp 1 mặt: unknown * (WILD ? 2/6 : 1/6)
      const pFace = WILD ? 2 / 6 : 1 / 6;

      // nếu chưa có bid: tố mặt mình nhiều nhất
      if (!bid) {
        let bestFace = 2, bestN = -1;
        for (let f = 2; f <= 6; f++) { if (mine[f] > bestN) { bestN = mine[f]; bestFace = f; } }
        const qty = Math.max(1, Math.round(mine[bestFace] + unknown * pFace));
        return { k: "bid", qty: Math.max(1, qty), face: bestFace };
      }

      // ước lượng số thực tế của mặt đang bid
      const expected = mine[bid.face] + unknown * pFace;
      // nếu bid hiện tại đã vượt kỳ vọng nhiều -> nghi ngờ
      const slack = level === "hard" ? 0.6 : level === "normal" ? 1.1 : 1.8;
      if (bid.qty > expected + slack) return { k: "challenge" };

      // ngược lại nâng bid: tăng qty hoặc đổi sang mặt mình mạnh
      let face = bid.face, qty = bid.qty;
      // thử đổi mặt mình mạnh hơn ở cùng qty
      let altFace = -1, altN = -1;
      for (let f = bid.face + 1; f <= 6; f++) { if (mine[f] > altN) { altN = mine[f]; altFace = f; } }
      if (altFace > bid.face && Math.random() < 0.5) return { k: "bid", qty, face: altFace };
      return { k: "bid", qty: qty + 1, face };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="ld-help" id="ldHelp"></div>` +
        `<div class="ld-row ld-opp">` +
          `<div class="ld-side"><span class="ld-tag">🎲 P{OPP}</span><span class="ld-cnt" data-cnt="opp"></span></div>` +
          `<div class="ld-dice" data-dice="opp"></div>` +
          `<div class="ld-hint" data-hint="opp"></div>` +
        `</div>` +
        `<div class="ld-mid">` +
          `<div class="ld-bid" id="ldBid"></div>` +
        `</div>` +
        `<div class="ld-row ld-me">` +
          `<div class="ld-side"><span class="ld-tag">🎲 P{ME} (${ctx.t("bạn", "you")})</span><span class="ld-cnt" data-cnt="me"></span></div>` +
          `<div class="ld-dice" data-dice="me"></div>` +
        `</div>` +
        `<div class="ld-panel" id="ldPanel"></div>`;
      elsCache = {
        help: root.querySelector("#ldHelp"),
        oppDice: root.querySelector('[data-dice="opp"]'),
        meDice: root.querySelector('[data-dice="me"]'),
        oppCnt: root.querySelector('[data-cnt="opp"]'),
        meCnt: root.querySelector('[data-cnt="me"]'),
        oppHint: root.querySelector('[data-hint="opp"]'),
        bid: root.querySelector("#ldBid"),
        panel: root.querySelector("#ldPanel"),
        oppTag: root.querySelector(".ld-opp .ld-tag"),
        meTag: root.querySelector(".ld-me .ld-tag"),
      };
    }

    // Đếm số xúc xắc của CHÍNH mình khớp một mặt (kèm wild) — giúp người mới suy luận.
    function myMatches(face) {
      const me = mySeatIdx();
      let n = 0;
      for (const d of dice[me]) {
        if (d === face) n++;
        else if (WILD && d === 1 && face !== 1) n++;
      }
      return n;
    }

    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : turn; }

    function dieHtml(v, hidden) {
      if (hidden) return `<span class="ld-die hidden">?</span>`;
      const wild = v === 1 && WILD;
      return `<span class="ld-die${wild ? " wild" : ""}">${PIPS[v - 1]}</span>`;
    }

    function render(revealAll) {
      if (!elsCache) buildShell();
      const me = mySeatIdx();
      const opp = 1 - me;
      elsCache.oppTag.innerHTML = `🎲 P${opp + 1}`;
      elsCache.meTag.innerHTML = `🎲 P${me + 1} (${ctx.t("bạn", "you")})`;
      elsCache.oppCnt.textContent = "× " + counts[opp];
      elsCache.meCnt.textContent = "× " + counts[me];

      // thanh hướng dẫn ngắn (luôn hiển thị) — giúp người mới
      elsCache.help.innerHTML = ctx.t(
        `🎯 <b>Mục tiêu:</b> đoán xem trên <u>tất cả ${totalDice()} xúc xắc</u> có ÍT NHẤT bao nhiêu con mang một mặt. ${WILD ? "★ là mặt hoang (tính cho mọi mặt). " : ""}Nâng lời tố, hoặc bấm <b>Nghi ngờ</b> nếu nghĩ đối thủ tố quá tay.`,
        `🎯 <b>Goal:</b> guess how many of a face exist across <u>all ${totalDice()} dice</u> (at least). ${WILD ? "★ is wild (counts as any face). " : ""}Raise the bid, or hit <b>Challenge</b> if you think it's too high.`);

      // xúc xắc của mình: luôn hiện; của đối thủ: ẩn trừ khi revealAll
      elsCache.meDice.innerHTML = dice[me].map((v) => dieHtml(v, false)).join("");
      elsCache.oppDice.innerHTML = dice[opp].map((v) => dieHtml(v, !revealAll)).join("");
      elsCache.oppDice.classList.toggle("revealed", !!revealAll);
      if (elsCache.oppHint) {
        elsCache.oppHint.innerHTML = revealAll ? "" :
          `<span class="ld-secret-note">🙈 ${ctx.t("Bài đối thủ đang giấu", "Opponent's dice are hidden")}</span>`;
      }

      // bid hiện tại — diễn giải thành câu tự nhiên
      if (bid) {
        const f = PIPS[bid.face - 1];
        const mine = myMatches(bid.face);
        elsCache.bid.innerHTML =
          `<div class="ld-bid-main"><span class="ld-bid-label">${bid.by === me ? ctx.t("Bạn vừa tố", "You bid") : ctx.t("Đối thủ tố", "Opponent bids")}</span>` +
          `<span class="ld-bid-val"><b>≥ ${bid.qty}</b> × <span class="ld-bid-face">${f}</span></span></div>` +
          `<div class="ld-bid-sentence">${ctx.t(`"Có ít nhất <b>${bid.qty}</b> con mặt ${f} trên bàn"`, `"At least <b>${bid.qty}</b> dice show ${f} on the table"`)}` +
          ` · <span class="ld-bid-mine">${ctx.t(`bạn có ${mine} con ${f}`, `you hold ${mine}× ${f}`)}</span></div>`;
      } else {
        elsCache.bid.innerHTML = `<span class="ld-bid-label">${ctx.t("Chưa ai tố — hãy mở màn!", "No bid yet — open the round!")}</span>`;
      }
      renderPanel();
    }

    function renderPanel() {
      if (over) { elsCache.panel.innerHTML = ""; return; }
      if (revealing) { elsCache.panel.innerHTML = `<div class="ld-reveal-note">${ctx.t("Đang lật...", "Revealing...")}</div>`; return; }
      if (!canAct()) {
        elsCache.panel.innerHTML = `<div class="ld-wait">${ctx.t("Chờ đối thủ...", "Waiting for opponent...")}</div>`;
        return;
      }
      // bộ chọn qty/face + nút Tố + nút Nghi ngờ
      const minQty = bid ? bid.qty : 1;
      const maxQty = totalDice();
      const defQty = bid ? (bid.face >= 6 ? bid.qty + 1 : bid.qty) : 1;
      const defFace = bid ? (bid.face >= 6 ? 2 : bid.face + 1) : 2;
      let faceOpts = "";
      for (let f = 1; f <= 6; f++) faceOpts += `<button type="button" class="ld-face" data-face="${f}">${PIPS[f - 1]}</button>`;
      elsCache.panel.innerHTML =
        `<div class="ld-preview" id="ldPreview"></div>` +
        `<div class="ld-build">` +
          `<div class="ld-field"><span class="ld-flabel">${ctx.t("Số lượng", "How many")}</span>` +
            `<div class="ld-qty"><button type="button" class="ld-qd" data-qd="-1" aria-label="−">−</button>` +
              `<span class="ld-qtyval" id="ldQty">${Math.max(minQty, defQty)}</span>` +
              `<button type="button" class="ld-qd" data-qd="1" aria-label="+">+</button></div></div>` +
          `<div class="ld-field"><span class="ld-flabel">${ctx.t("Mặt xúc xắc", "Which face")}</span>` +
            `<div class="ld-faces">${faceOpts}</div></div>` +
        `</div>` +
        `<div class="ld-acts">` +
          `<button type="button" class="btn primary ld-do-bid">${ctx.t("📢 Tố", "📢 Bid")}</button>` +
          `<button type="button" class="btn ld-do-ch"${bid ? "" : " disabled"}>${ctx.t("🤨 Nghi ngờ!", "🤨 Challenge!")}</button>` +
        `</div>` +
        (bid ? `<div class="ld-tip">${ctx.t("Lời tố phải cao hơn: tăng số lượng, hoặc cùng số lượng nhưng mặt lớn hơn.", "Your bid must beat the current one: raise the quantity, or keep it but pick a higher face.")}</div>` : "");
      wirePanel(Math.max(minQty, defQty), defFace, minQty, maxQty);
    }

    function wirePanel(initQty, initFace, minQty, maxQty) {
      let selQty = initQty;
      let selFace = initFace;
      const qtyEl = elsCache.panel.querySelector("#ldQty");
      const previewEl = elsCache.panel.querySelector("#ldPreview");
      const faceBtns = [...elsCache.panel.querySelectorAll(".ld-face")];
      function refreshFaces() {
        faceBtns.forEach((b) => b.classList.toggle("on", Number(b.dataset.face) === selFace));
      }
      function valid() {
        return bidHigher({ qty: selQty, face: selFace }, bid);
      }
      function refreshPreview() {
        const f = PIPS[selFace - 1];
        const mine = myMatches(selFace);
        const ok = valid();
        previewEl.innerHTML =
          `<span class="ld-prev-lead">${ctx.t("Bạn sắp tố:", "You'll bid:")}</span> ` +
          `<span class="ld-prev-sentence">${ctx.t(`"Trên bàn có ít nhất <b>${selQty}</b> con mặt ${f}"`, `"At least <b>${selQty}</b> dice show ${f}"`)}</span>` +
          `<span class="ld-prev-mine">${ctx.t(`bạn đang giữ ${mine} con ${f}`, `you hold ${mine}× ${f}`)}</span>` +
          (ok ? "" : `<span class="ld-prev-bad">${ctx.t("⚠ phải cao hơn lời tố hiện tại", "⚠ must beat the current bid")}</span>`);
      }
      function refreshBidBtn() {
        const bidBtn = elsCache.panel.querySelector(".ld-do-bid");
        if (bidBtn) bidBtn.classList.toggle("disabled", !valid());
      }
      refreshFaces();
      refreshBidBtn();
      refreshPreview();
      elsCache.panel.querySelectorAll(".ld-qd").forEach((b) => {
        b.addEventListener("click", () => {
          selQty = Math.max(1, Math.min(maxQty, selQty + Number(b.dataset.qd)));
          qtyEl.textContent = selQty;
          refreshBidBtn();
          refreshPreview();
        });
      });
      faceBtns.forEach((b) => {
        b.addEventListener("click", () => { selFace = Number(b.dataset.face); refreshFaces(); refreshBidBtn(); refreshPreview(); });
      });
      const bidBtn = elsCache.panel.querySelector(".ld-do-bid");
      bidBtn.addEventListener("click", () => {
        if (!valid()) { ctx.setStatus(ctx.t("Lời tố phải cao hơn lời tố hiện tại.", "Your bid must beat the current bid.")); return; }
        applyMove({ k: "bid", qty: selQty, face: selFace }, false);
      });
      const chBtn = elsCache.panel.querySelector(".ld-do-ch");
      if (chBtn) chBtn.addEventListener("click", () => { if (bid) applyMove({ k: "challenge" }, false); });
    }

    function updateStatus() {
      if (over || revealing) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang suy nghĩ...", "Opponent is thinking..."));
      } else {
        ctx.setStatus(bid
          ? ctx.t(`Lượt bạn: nâng tố hoặc bấm "Nghi ngờ!".`, `Your turn: raise the bid or hit "Challenge!".`)
          : ctx.t(`Lượt bạn: mở màn bằng một lời tố.`, `Your turn: open with a bid.`));
      }
    }

    // khởi động vòng đầu
    buildShell();
    startRound(seat0First);

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "liarsdice",
    name: "Cá Ngựa Nói Dối",
    emoji: "🎲",
    description: "Giấu xúc xắc, tố phét rồi 'Nghi ngờ!' để bắt bài đối thủ — ai hết xúc xắc thì thua.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "dice", label: "Số xúc xắc mỗi người", default: 5,
        choices: [
          { value: 3, label: "3 (nhanh)" },
          { value: 5, label: "5 (chuẩn)" },
          { value: 6, label: "6 (dài)" },
        ],
      },
      {
        id: "wild", label: "Mặt ★ (1) là hoang", default: "on",
        choices: [
          { value: "on", label: "Có (★ tính cho mọi mặt)" },
          { value: "off", label: "Không (chơi thẳng)" },
        ],
      },
    ],
    howTo: [
      "Ví dụ cho dễ hiểu: bạn có 5 xúc xắc, đối thủ có 5 — tổng 10 con trên bàn, nhưng bạn chỉ thấy 5 con của mình.",
      "Đến lượt, bạn 'TỐ' một con số, kiểu: \"trên bàn có ÍT NHẤT 4 con mặt ⚄\". Con số này tính gộp xúc xắc của CẢ HAI người (kể cả những con đang giấu).",
      "Mẹo: nhìn xúc xắc của mình để đoán. Nếu bạn đã có sẵn 2 con ⚄, chỉ cần đối thủ có thêm 2 con nữa là lời tố \"ít nhất 4 con ⚄\" thành đúng.",
      "Đối thủ phải tố CAO HƠN bạn (nhiều con hơn, hoặc cùng số con nhưng mặt lớn hơn) — hoặc bấm 'NGHI NGỜ!' nếu nghĩ bạn nói dối.",
      "Khi 'NGHI NGỜ!', lật hết xúc xắc và đếm thật: nếu thực tế ĐỦ con số vừa tố thì người tố đúng (người nghi ngờ thua, mất 1 xúc xắc); nếu THIẾU thì người tố nói dối (mất 1 xúc xắc).",
      "Mặc định mặt ★ (số 1) là 'hoang', được tính như mọi mặt khi đếm (có thể tắt trong tùy chọn).",
      "Càng ít xúc xắc thì lời tố càng dễ bị bắt bài. Ai mất hết xúc xắc trước sẽ THUA cả ván.",
    ],
    create,
  });
})();
