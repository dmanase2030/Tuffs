/* Cờ Tỷ Phú (Tycoon) — chơi chung máy, ĐẤU MÁY và ONLINE
   Bản rút gọn cho 2 người: bàn 20 ô vòng quanh. Gieo xúc xắc đi quân; dừng ở ô
   ĐẤT trống thì được MUA, dừng ở đất đối thủ thì TRẢ THUÊ. Qua ô XUẤT PHÁT nhận
   tiền. Vài ô THUẾ / MAY RỦI. Ai hết tiền (phá sản) thì THUA; nếu hết vòng thì
   ai nhiều tài sản hơn thắng.

   Đồng bộ online: giá trị xúc xắc + diễn biến sinh tất định, chỉ gửi hành động
   (gieo / mua-hay-bỏ) qua relay. */
(function () {
  const SIZE = 20;       // số ô
  const START_CASH = 1500;
  const PASS_GO = 200;   // tiền khi qua ô xuất phát

  // Bàn: mỗi ô { t: loại, name, price?, rent? }
  //   go = xuất phát, prop = đất, tax = thuế, chance = may rủi, jail = nghỉ 1 lượt
  function buildBoard() {
    const P = (name, price) => ({ t: "prop", name, price, rent: Math.round(price * 0.2) });
    return [
      { t: "go", name: "Xuất phát", nameEn: "GO" },
      P("Phố Huế", 120), P("Hàng Bài", 140),
      { t: "tax", name: "Thuế", nameEn: "Tax", amount: 100 },
      P("Bà Triệu", 160), P("Tràng Tiền", 200),
      { t: "chance", name: "May rủi", nameEn: "Chance" },
      P("Lý Thường Kiệt", 220), P("Trần Hưng Đạo", 240),
      { t: "jail", name: "Nghỉ 1 lượt", nameEn: "Rest" },
      P("Nguyễn Huệ", 260), P("Đồng Khởi", 300),
      { t: "tax", name: "Thuế", nameEn: "Tax", amount: 150 },
      P("Lê Lợi", 320), P("Hai Bà Trưng", 350),
      { t: "chance", name: "May rủi", nameEn: "Chance" },
      P("Điện Biên Phủ", 380), P("Nguyễn Du", 400),
      { t: "tax", name: "Thuế", nameEn: "Tax", amount: 120 },
      P("Hồ Gươm", 450),
    ];
  }

  function create(ctx) {
    const o = ctx.options || {};
    const MAX_ROUNDS = o.rounds ? Number(o.rounds) : 0; // 0 = chơi tới khi phá sản

    const board = buildBoard();
    let cash = [START_CASH, START_CASH];
    let posn = [0, 0];
    let ownerOf = new Array(SIZE).fill(-1); // -1 = chưa ai, 0/1 = chủ
    let turn = ctx.isOnline ? ctx.firstSeat : 0;
    let over = false;
    let phase = "roll";    // roll | decide
    let pendingBuy = -1;   // ô đang chờ quyết định mua
    let skips = [0, 0];    // số lượt phải nghỉ
    let roundCount = 0;
    let log = [];

    const root = document.createElement("div");
    root.className = "tc-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function name(cell) { return (window.I18n && I18n.getLang() === "en" && cell.nameEn) ? cell.nameEn : cell.name; }
    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function assets(seat) {
      let a = cash[seat];
      for (let i = 0; i < SIZE; i++) if (ownerOf[i] === seat) a += board[i].price;
      return a;
    }

    function addLog(vi, en) { log.push(ctx.t(vi, en)); if (log.length > 6) log.shift(); }

    // Hành động: { k:"roll", die } | { k:"buy", yes }
    function applyMove(move, fromRemote) {
      if (over) return;
      if (move.k === "roll") {
        if (phase !== "roll") return;
        const die = Number(move.die);
        if (!(die >= 1 && die <= 6)) return;
        if (!fromRemote) ctx.sendMove({ k: "roll", die });
        doRoll(die);
      } else if (move.k === "buy") {
        if (phase !== "decide") return;
        if (!fromRemote) ctx.sendMove({ k: "buy", yes: !!move.yes });
        doBuy(!!move.yes);
      }
    }

    function onRoll() {
      if (!canPlay() || phase !== "roll") return;
      const die = 1 + Math.floor(ctx.rng() * 6);
      applyMove({ k: "roll", die }, false);
    }

    function doRoll(die) {
      const me = turn;
      // nghỉ lượt?
      if (skips[me] > 0) {
        skips[me]--;
        addLog(`P${me + 1} đang nghỉ lượt.`, `P${me + 1} skips a turn.`);
        endTurn();
        return;
      }
      const before = posn[me];
      posn[me] = (before + die) % SIZE;
      // qua ô xuất phát
      if (posn[me] < before) { cash[me] += PASS_GO; addLog(`P${me + 1} qua Xuất phát +$${PASS_GO}.`, `P${me + 1} passed GO +$${PASS_GO}.`); }
      ctx.sound("place");
      resolveCell(me, die);
    }

    function resolveCell(me, die) {
      const cell = board[posn[me]];
      if (cell.t === "prop") {
        const owner = ownerOf[posn[me]];
        if (owner === -1) {
          // có thể mua
          if (cash[me] >= cell.price) {
            phase = "decide"; pendingBuy = posn[me];
            ctx.setTurn(turn);
            render(); updateStatus();
            maybeAIDecide();
            return;
          } else {
            addLog(`P${me + 1} không đủ tiền mua ${name(cell)}.`, `P${me + 1} can't afford ${name(cell)}.`);
          }
        } else if (owner !== me) {
          // trả thuê
          const rent = cell.rent;
          cash[me] -= rent; cash[owner] += rent;
          addLog(`P${me + 1} trả thuê $${rent} cho P${owner + 1} (${name(cell)}).`, `P${me + 1} paid $${rent} rent to P${owner + 1} (${name(cell)}).`);
          ctx.sound("miss");
        }
      } else if (cell.t === "tax") {
        cash[me] -= cell.amount;
        addLog(`P${me + 1} đóng thuế $${cell.amount}.`, `P${me + 1} paid $${cell.amount} tax.`);
        ctx.sound("miss");
      } else if (cell.t === "chance") {
        const delta = [-100, -50, 50, 100, 150, 200][Math.floor(ctx.rng() * 6)];
        cash[me] += delta;
        addLog(`P${me + 1} ô may rủi: ${delta >= 0 ? "+" : ""}$${delta}.`, `P${me + 1} chance: ${delta >= 0 ? "+" : ""}$${delta}.`);
        ctx.sound(delta >= 0 ? "powerup" : "miss");
      } else if (cell.t === "jail") {
        skips[me] = 1;
        addLog(`P${me + 1} phải nghỉ lượt sau.`, `P${me + 1} must rest next turn.`);
      }
      checkBankrupt();
      if (!over) endTurn();
    }

    function doBuy(yes) {
      const me = turn;
      const cell = board[pendingBuy];
      if (yes && cash[me] >= cell.price) {
        cash[me] -= cell.price; ownerOf[pendingBuy] = me;
        addLog(`P${me + 1} mua ${name(cell)} ($${cell.price}).`, `P${me + 1} bought ${name(cell)} ($${cell.price}).`);
        ctx.sound("powerup");
      } else {
        addLog(`P${me + 1} bỏ qua ${name(cell)}.`, `P${me + 1} passed on ${name(cell)}.`);
      }
      pendingBuy = -1; phase = "roll";
      checkBankrupt();
      if (!over) endTurn();
    }

    function checkBankrupt() {
      for (let s = 0; s < 2; s++) {
        if (cash[s] < 0) {
          over = true;
          const w = 1 - s;
          ctx.incScore(w);
          ctx.setTurn(-1);
          const wn = ctx.vsAI ? (w === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (w + 1), "Player " + (w + 1));
          ctx.setStatus(ctx.t(`🎉 ${wn} thắng — đối thủ phá sản!`, `🎉 ${wn} wins — opponent went bankrupt!`));
          render();
          return;
        }
      }
    }

    function endTurn() {
      turn = 1 - turn;
      if (turn === (ctx.isOnline ? ctx.firstSeat : 0)) roundCount++;
      if (MAX_ROUNDS > 0 && roundCount >= MAX_ROUNDS) {
        over = true;
        const w = assets(0) === assets(1) ? -1 : (assets(0) > assets(1) ? 0 : 1);
        if (w >= 0) ctx.incScore(w);
        ctx.setTurn(-1);
        const wn = (s) => ctx.vsAI ? (s === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (s + 1), "Player " + (s + 1));
        ctx.setStatus(w < 0
          ? ctx.t(`🤝 Hòa! Tài sản bằng nhau.`, `🤝 Draw! Equal assets.`)
          : ctx.t(`🎉 ${wn(w)} thắng — nhiều tài sản hơn ($${assets(w)})!`, `🎉 ${wn(w)} wins — more assets ($${assets(w)})!`));
        render();
        return;
      }
      phase = "roll";
      ctx.setTurn(turn);
      render(); updateStatus();
      maybeAIRoll();
    }

    // ----- AI: gieo khi tới lượt; mua đất nếu còn đủ "đệm" tiền -----
    function maybeAIRoll() {
      if (over || ctx.isOnline || !ctx.vsAI || turn !== 1) return;
      setTimeout(() => { if (!over && phase === "roll" && turn === 1) applyMove({ k: "roll", die: 1 + Math.floor(ctx.rng() * 6) }, true); }, 650);
    }
    function maybeAIDecide() {
      if (over || ctx.isOnline || !ctx.vsAI || turn !== 1) return;
      setTimeout(() => {
        if (over || phase !== "decide" || turn !== 1) return;
        const cell = board[pendingBuy];
        // mua nếu sau khi mua vẫn còn > 300 tiền mặt (đệm an toàn), mức khó mua bạo hơn
        const buffer = ctx.aiLevel === "hard" ? 150 : ctx.aiLevel === "easy" ? 500 : 300;
        const yes = cash[1] - cell.price >= buffer;
        applyMove({ k: "buy", yes }, true);
      }, 700);
    }

    // ----- Giao diện -----
    // Bàn 20 ô xếp vòng quanh trên lưới 6×6 (viền ngoài), đi theo chiều kim đồng hồ
    // bắt đầu từ góc trên-trái. Trả về {r,c} 1-based.
    function ringPos(i) {
      if (i <= 5) return { r: 1, c: i + 1 };            // top: (1,1)..(1,6)  [0..5]
      if (i <= 9) return { r: i - 4, c: 6 };            // right: (2,6)..(5,6) [6..9]
      if (i <= 15) return { r: 6, c: 6 - (i - 10) };    // bottom: (6,6)..(6,1) [10..15]
      return { r: 5 - (i - 16), c: 1 };                 // left: (5,1)..(2,1) [16..19]
    }

    function buildShell() {
      root.innerHTML =
        `<div class="tc-top" id="tcTop"></div>` +
        `<div class="tc-board" id="tcBoard"></div>` +
        `<div class="tc-log" id="tcLog"></div>` +
        `<div class="tc-controls" id="tcControls"></div>`;
      els = { top: root.querySelector("#tcTop"), board: root.querySelector("#tcBoard"), log: root.querySelector("#tcLog"), controls: root.querySelector("#tcControls") };
      const grid = els.board;
      // ô trung tâm (trang trí) chiếm vùng giữa r2..5 × c2..5
      const center = document.createElement("div");
      center.id = "tcCenter";
      center.style.gridRow = "2 / 6";
      center.style.gridColumn = "2 / 6";
      grid.appendChild(center);
      // 20 ô viền — đặt vị trí grid tường minh
      for (let i = 0; i < SIZE; i++) {
        const p = ringPos(i);
        const div = document.createElement("div");
        div.className = "tc-cell";
        div.dataset.i = i;
        div.style.gridRow = String(p.r);
        div.style.gridColumn = String(p.c);
        grid.appendChild(div);
      }
    }

    function cellInner(cell, i) {
      const owner = ownerOf[i];
      let cls = "tc-cell t-" + cell.t;
      if (owner === 0) cls += " own-p1";
      else if (owner === 1) cls += " own-p2";
      let label;
      if (cell.t === "prop") label = `<span class="tc-pname">${name(cell)}</span><span class="tc-pprice">$${cell.price}</span>`;
      else if (cell.t === "go") label = `<span class="tc-ic">🏁</span><span class="tc-pname">${name(cell)}</span>`;
      else if (cell.t === "tax") label = `<span class="tc-ic">💸</span><span class="tc-pprice">$${cell.amount}</span>`;
      else if (cell.t === "chance") label = `<span class="tc-ic">❓</span>`;
      else if (cell.t === "jail") label = `<span class="tc-ic">⏸️</span>`;
      const pawns = (posn[0] === i ? `<span class="tc-pawn p1">🔴</span>` : "") + (posn[1] === i ? `<span class="tc-pawn p2">🔵</span>` : "");
      return { cls, html: `${label}<span class="tc-pawns">${pawns}</span>` };
    }

    function render() {
      if (!els) buildShell();
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const p1name = (me === 0 || ctx.vsAI) ? ctx.t("Bạn", "You") : "P1";
      const p2name = ctx.vsAI ? ctx.t("Máy", "AI") : (me === 1 ? ctx.t("Bạn", "You") : "P2");
      els.top.innerHTML =
        `<div class="tc-pinfo p1 ${turn === 0 && !over ? "active" : ""}"><span>🔴 ${p1name}</span><b>$${cash[0]}</b><small>${ctx.t("tài sản", "assets")} $${assets(0)}</small></div>` +
        `<div class="tc-mid">${MAX_ROUNDS > 0 ? ctx.t("vòng", "round") + " " + Math.min(roundCount + 1, MAX_ROUNDS) + "/" + MAX_ROUNDS : ctx.t("tới khi phá sản", "until bankrupt")}</div>` +
        `<div class="tc-pinfo p2 ${turn === 1 && !over ? "active" : ""}"><span>🔵 ${p2name}</span><b>$${cash[1]}</b><small>${ctx.t("tài sản", "assets")} $${assets(1)}</small></div>`;

      els.board.querySelectorAll(".tc-cell").forEach((d) => {
        const i = Number(d.dataset.i);
        const ci = cellInner(board[i], i);
        d.className = ci.cls;
        d.innerHTML = ci.html;
      });
      const center = els.board.querySelector("#tcCenter");
      if (center) center.innerHTML = `<div class="tc-logo">🎲<br>${ctx.t("TỶ PHÚ", "TYCOON")}</div>`;

      els.log.innerHTML = log.map((l) => `<div class="tc-logline">${l}</div>`).join("");
      renderControls();
    }

    function renderControls() {
      if (over) { els.controls.innerHTML = ""; return; }
      if (!canPlay()) {
        els.controls.innerHTML = `<div class="tc-wait">${ctx.t("Chờ đối thủ...", "Waiting for opponent...")}</div>`;
        return;
      }
      if (ctx.vsAI && turn === 1) { els.controls.innerHTML = `<div class="tc-wait">${ctx.t("Máy đang chơi...", "Computer is playing...")}</div>`; return; }
      if (phase === "roll") {
        els.controls.innerHTML = `<button type="button" class="btn primary tc-roll">🎲 ${ctx.t("Gieo xúc xắc", "Roll dice")}</button>`;
        els.controls.querySelector(".tc-roll").addEventListener("click", onRoll);
      } else if (phase === "decide") {
        const cell = board[pendingBuy];
        els.controls.innerHTML =
          `<div class="tc-buy-q">${ctx.t(`Mua ${name(cell)} với $${cell.price}?`, `Buy ${name(cell)} for $${cell.price}?`)}</div>` +
          `<div class="tc-buy-btns">` +
            `<button type="button" class="btn primary tc-buy-yes">✓ ${ctx.t("Mua", "Buy")}</button>` +
            `<button type="button" class="btn tc-buy-no">✗ ${ctx.t("Bỏ qua", "Pass")}</button>` +
          `</div>`;
        els.controls.querySelector(".tc-buy-yes").addEventListener("click", () => applyMove({ k: "buy", yes: true }, false));
        els.controls.querySelector(".tc-buy-no").addEventListener("click", () => applyMove({ k: "buy", yes: false }, false));
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang chơi...", "Opponent is playing...")); return; }
      if (ctx.vsAI && turn === 1) { ctx.setStatus(ctx.t("Máy đang chơi...", "Computer is playing...")); return; }
      const who = ctx.vsAI ? ctx.t("Bạn", "You") : (ctx.isOnline ? ctx.t("Bạn", "You") : ctx.t("Người chơi " + (turn + 1), "Player " + (turn + 1)));
      ctx.setStatus(phase === "roll"
        ? ctx.t(`${who}: gieo xúc xắc để đi.`, `${who}: roll the dice to move.`)
        : ctx.t(`${who}: quyết định mua đất?`, `${who}: decide to buy?`));
    }

    buildShell();
    ctx.setTurn(turn);
    render();
    updateStatus();
    maybeAIRoll();

    function destroy() {}
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "tycoon",
    name: "Cờ Tỷ Phú",
    emoji: "🎩",
    description: "Gieo xúc xắc đi quanh bàn, mua đất và thu tiền thuê — làm đối thủ phá sản thì thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "rounds", label: "Kết thúc", default: 0,
        choices: [
          { value: 0, label: "Tới khi phá sản" },
          { value: 12, label: "12 vòng (so tài sản)" },
          { value: 20, label: "20 vòng (so tài sản)" },
        ],
      },
    ],
    howTo: [
      "Mỗi người bắt đầu với $1500. Lần lượt gieo xúc xắc và đi quân quanh bàn 20 ô.",
      "Dừng ở ô ĐẤT còn trống: bạn được chọn MUA (trừ tiền, ô thành của bạn). Dừng ở đất của ĐỐI THỦ: phải trả TIỀN THUÊ cho họ.",
      "Mỗi lần đi qua ô 🏁 Xuất phát, nhận thêm $200. Ô 💸 Thuế thì mất tiền; ô ❓ May rủi cộng/trừ ngẫu nhiên; ô ⏸️ phải nghỉ 1 lượt.",
      "Nếu tiền mặt xuống dưới 0 (phá sản) thì bạn THUA ngay. Nếu chọn chế độ giới hạn vòng thì khi hết vòng, ai nhiều TÀI SẢN (tiền + giá trị đất) hơn sẽ thắng.",
      "Chiến thuật: mua nhiều đất để thu thuê, nhưng giữ đủ tiền mặt phòng khi rơi vào đất đối thủ. Chơi chung máy, đấu với máy, hoặc online.",
    ],
    create,
  });
})();
