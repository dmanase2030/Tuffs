/* Yahtzee — xúc xắc, chơi chung máy & ONLINE
   Mỗi lượt: gieo 5 xúc xắc tối đa 3 lần (giữ lại viên ưng ý), rồi chọn 1 ô điểm.
   13 ô điểm + thưởng phần trên (tổng ô số ≥ 63 thì +35). Ai tổng cao hơn thắng.
   Nước đi: { kind:"roll", dice } | { kind:"score", cat }.
   Người gieo tự random rồi gửi kết quả cho đối thủ (đồng bộ). */
(function () {
  const UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"];
  const UPPER_BONUS = 35, UPPER_TARGET = 63;

  const CATS = [
    { id: "ones",   name: "Số 1",        icon: "1️⃣", fn: (d) => sumOf(d, 1) },
    { id: "twos",   name: "Số 2",        icon: "2️⃣", fn: (d) => sumOf(d, 2) },
    { id: "threes", name: "Số 3",        icon: "3️⃣", fn: (d) => sumOf(d, 3) },
    { id: "fours",  name: "Số 4",        icon: "4️⃣", fn: (d) => sumOf(d, 4) },
    { id: "fives",  name: "Số 5",        icon: "5️⃣", fn: (d) => sumOf(d, 5) },
    { id: "sixes",  name: "Số 6",        icon: "6️⃣", fn: (d) => sumOf(d, 6) },
    { id: "three",  name: "3 giống nhau", icon: "🎯", fn: (d) => ofAKind(d, 3) ? sum(d) : 0 },
    { id: "four",   name: "4 giống nhau", icon: "🎯", fn: (d) => ofAKind(d, 4) ? sum(d) : 0 },
    { id: "full",   name: "Cù lũ",        icon: "🏠", fn: (d) => fullHouse(d) ? 25 : 0 },
    { id: "small",  name: "Sảnh nhỏ",     icon: "📏", fn: (d) => straight(d, 4) ? 30 : 0 },
    { id: "large",  name: "Sảnh lớn",     icon: "📐", fn: (d) => straight(d, 5) ? 40 : 0 },
    { id: "yahtzee",name: "YAHTZEE!",     icon: "⭐", fn: (d) => ofAKind(d, 5) ? 50 : 0 },
    { id: "chance", name: "May rủi",      icon: "🎲", fn: (d) => sum(d) },
  ];

  function counts(d) { const c = [0,0,0,0,0,0,0]; d.forEach((v) => c[v]++); return c; }
  function sum(d) { return d.reduce((a, b) => a + b, 0); }
  function sumOf(d, n) { return d.filter((v) => v === n).length * n; }
  function ofAKind(d, n) { return counts(d).some((c) => c >= n); }
  function fullHouse(d) { const c = counts(d).filter((x) => x > 0).sort(); return (c.length === 2 && c[0] === 2 && c[1] === 3); }
  function straight(d, len) {
    const s = [...new Set(d)].sort((a, b) => a - b);
    let best = 1, run = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1] + 1) { run++; best = Math.max(best, run); } else run = 1;
    }
    return best >= len;
  }

  // bố cục chấm xúc xắc trên lưới 3x3
  const PIP_LAYOUT = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };

  function create(ctx) {
    let turn = 0;
    let over = false;
    let dice = [1, 1, 1, 1, 1];
    let held = [false, false, false, false, false];
    let rollsLeft = 3;
    let rolledThisTurn = false;
    let animating = false;
    const scores = [{}, {}];
    const yahtzeeBonus = [0, 0]; // thưởng +100 mỗi Yahtzee thêm (sau khi ô ⭐ đã có 50)

    const root = document.createElement("div");
    root.className = "yz-root";
    root.innerHTML =
      `<div class="yz-dice" id="yzDice"></div>` +
      `<div class="yz-actions">` +
      `<button class="btn primary yz-rollbtn" id="yzRoll"><span class="yz-rollicon">🎲</span> ${ctx.t("Gieo", "Roll")} <b id="yzRollN">3</b></button>` +
      `</div>` +
      `<div class="yz-hint" id="yzHint">${ctx.t("Bấm Gieo để bắt đầu lượt.", "Press Roll to start your turn.")}</div>` +
      `<div class="yz-table" id="yzTable"></div>`;
    ctx.boardEl.appendChild(root);

    const diceEl = root.querySelector("#yzDice");
    const rollBtn = root.querySelector("#yzRoll");
    const rollN = root.querySelector("#yzRollN");
    const hintEl = root.querySelector("#yzHint");
    const tableEl = root.querySelector("#yzTable");

    // ----- xúc xắc dạng chấm -----
    const dieEls = [];
    for (let i = 0; i < 5; i++) {
      const d = document.createElement("div");
      d.className = "yz-die";
      const inner = document.createElement("div");
      inner.className = "yz-die-face";
      for (let k = 0; k < 9; k++) {
        const slot = document.createElement("span");
        slot.className = "yz-pip-slot";
        inner.appendChild(slot);
      }
      const lock = document.createElement("span");
      lock.className = "yz-die-lock";
      lock.textContent = "🔒";
      d.appendChild(inner);
      d.appendChild(lock);
      const idx = i;
      d.addEventListener("click", () => toggleHold(idx));
      diceEl.appendChild(d);
      dieEls.push({ wrap: d, face: inner });
    }

    function paintDie(slot, value) {
      const set = new Set(PIP_LAYOUT[value] || []);
      const slots = slot.children;
      for (let k = 0; k < 9; k++) {
        slots[k].className = "yz-pip-slot" + (set.has(k) ? " on" : "");
      }
    }

    // ----- bảng điểm: 2 cột header + các hàng -----
    tableEl.innerHTML = "";
    const header = document.createElement("div");
    header.className = "yz-row yz-head";
    header.innerHTML = `<span class="yz-cat">Tổ hợp</span>` +
      `<span class="yz-v yz-h1" id="yzH0">P1</span>` +
      `<span class="yz-v yz-h2" id="yzH1">P2</span>`;
    tableEl.appendChild(header);

    const rowEls = {};
    CATS.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "yz-row";
      if (UPPER.includes(cat.id)) row.classList.add("yz-upper");
      row.innerHTML = `<span class="yz-cat"><i class="yz-ic">${cat.icon}</i>${cat.name}</span>` +
        `<span class="yz-v p1" data-p="0"></span>` +
        `<span class="yz-v p2" data-p="1"></span>`;
      const c0 = row.querySelector('[data-p="0"]');
      const c1 = row.querySelector('[data-p="1"]');
      c0.addEventListener("click", () => chooseCat(cat.id, 0));
      c1.addEventListener("click", () => chooseCat(cat.id, 1));
      tableEl.appendChild(row);
      rowEls[cat.id] = { c0, c1, row };
    });

    // hàng thưởng phần trên
    const bonusRow = document.createElement("div");
    bonusRow.className = "yz-row yz-bonus";
    bonusRow.innerHTML = `<span class="yz-cat">🎁 Thưởng (ô số ≥ ${UPPER_TARGET})</span>` +
      `<span class="yz-v p1" id="yzB0"></span>` +
      `<span class="yz-v p2" id="yzB1"></span>`;
    tableEl.appendChild(bonusRow);

    // hàng thưởng Yahtzee thêm (+100 mỗi lần)
    const yzbRow = document.createElement("div");
    yzbRow.className = "yz-row yz-bonus";
    yzbRow.innerHTML = `<span class="yz-cat">⭐ Yahtzee Bonus (+100)</span>` +
      `<span class="yz-v p1" id="yzYB0"></span>` +
      `<span class="yz-v p2" id="yzYB1"></span>`;
    tableEl.appendChild(yzbRow);

    // hàng tổng
    const totalRow = document.createElement("div");
    totalRow.className = "yz-row yz-total";
    totalRow.innerHTML = `<span class="yz-cat">${ctx.t("TỔNG ĐIỂM", "TOTAL")}</span>` +
      `<span class="yz-v p1" id="yzTot0">0</span>` +
      `<span class="yz-v p2" id="yzTot1">0</span>`;
    tableEl.appendChild(totalRow);

    function myTurn() { return !ctx.isOnline || turn === ctx.mySeat; }

    function toggleHold(i) {
      if (!myTurn() || over || !rolledThisTurn || animating) return;
      held[i] = !held[i];
      ctx.sound("select");
      renderDice();
    }

    rollBtn.addEventListener("click", () => {
      if (!myTurn() || over || rollsLeft <= 0 || animating) return;
      const nd = dice.map((v, i) => (rolledThisTurn && held[i]) ? v : 1 + Math.floor(Math.random() * 6));
      applyMove({ kind: "roll", dice: nd }, false);
    });

    function chooseCat(catId, player) {
      if (!myTurn() || over || player !== turn || !rolledThisTurn || animating) return;
      if (scores[player][catId] !== undefined) return;
      applyMove({ kind: "score", cat: catId }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.kind === "roll") {
        if (rollsLeft <= 0) return;
        if (!fromRemote) ctx.sendMove(move);
        rollsLeft--;
        rolledThisTurn = true;
        ctx.sound("shot");
        animateRoll(move.dice.slice());
        return;
      }

      if (move.kind === "score") {
        const cat = CATS.find((c) => c.id === move.cat);
        if (!cat || scores[turn][move.cat] !== undefined) return;
        if (!fromRemote) ctx.sendMove(move);
        // Luật Yahtzee Bonus: nếu đang có 5 viên giống nhau VÀ ô ⭐ đã ghi 50 điểm,
        // mỗi Yahtzee thêm được +100 điểm thưởng.
        const isYahtzee = ofAKind(dice, 5);
        if (isYahtzee && scores[turn].yahtzee === 50) {
          yahtzeeBonus[turn] += 100;
          hintEl.innerHTML = "⭐ <b>YAHTZEE BONUS +100!</b> 🎉";
          hintEl.classList.add("yz-celebrate");
          ctx.sound("win");
        }
        const val = cat.fn(dice);
        scores[turn][move.cat] = val;
        ctx.sound(val > 0 ? "capture" : "error");
        flashCell(turn, move.cat, val);
        renderTable();
        const done0 = Object.keys(scores[0]).length === CATS.length;
        const done1 = Object.keys(scores[1]).length === CATS.length;
        if (done0 && done1) return finish();
        nextTurn();
      }
    }

    // hoạt ảnh lăn xúc xắc: nhấp nháy mặt ngẫu nhiên rồi dừng ở kết quả
    function animateRoll(finalDice) {
      animating = true;
      rollBtn.disabled = true;
      let ticks = 0;
      const anim = setInterval(() => {
        dice.forEach((_, i) => {
          if (held[i]) return;
          paintDie(dieEls[i].face, 1 + Math.floor(Math.random() * 6));
          dieEls[i].wrap.classList.add("rolling");
        });
        if (++ticks >= 8) {
          clearInterval(anim);
          dice = finalDice;
          dieEls.forEach((d) => d.wrap.classList.remove("rolling"));
          animating = false;
          renderDice();
          renderTable();
          afterRoll();
        }
      }, 55);
    }

    function afterRoll() {
      rollN.textContent = rollsLeft;
      rollBtn.disabled = rollsLeft <= 0 || !myTurn();
      rollBtn.classList.toggle("yz-spent", rollsLeft <= 0);
      // phát hiện Yahtzee để khoe
      if (ofAKind(dice, 5)) {
        hintEl.innerHTML = ctx.t("⭐ <b>YAHTZEE!</b> 5 viên giống nhau — ghi vào ô ⭐ để ăn 50 điểm!",
          "⭐ <b>YAHTZEE!</b> Five of a kind — score the ⭐ row for 50 points!");
        hintEl.classList.add("yz-celebrate");
        ctx.sound("win");
      } else {
        hintEl.classList.remove("yz-celebrate");
        hintEl.textContent = rollsLeft > 0
          ? ctx.t("Bấm xúc xắc để GIỮ, rồi gieo tiếp — hoặc chọn ô điểm.", "Click dice to HOLD, then roll again — or pick a score box.")
          : ctx.t("Hết lượt gieo — chọn một ô điểm để ghi.", "No rolls left — pick a score box.");
      }
    }

    function flashCell(p, catId, val) {
      const cell = p === 0 ? rowEls[catId].c0 : rowEls[catId].c1;
      cell.classList.add(val > 0 ? "yz-pop-good" : "yz-pop-zero");
      setTimeout(() => cell.classList.remove("yz-pop-good", "yz-pop-zero"), 600);
    }

    function nextTurn() {
      turn = 1 - turn;
      dice = [1, 1, 1, 1, 1];
      held = [false, false, false, false, false];
      rollsLeft = 3;
      rolledThisTurn = false;
      rollN.textContent = "3";
      rollBtn.disabled = !myTurn();
      rollBtn.classList.remove("yz-spent");
      hintEl.classList.remove("yz-celebrate");
      ctx.setTurn(turn);
      renderDice();
      renderTable();
      hintEl.textContent = ctx.t("Bấm Gieo để bắt đầu lượt.", "Press Roll to start your turn.");
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}.`, `Player ${turn + 1}'s turn.`));
    }

    function upperSum(p) { return UPPER.reduce((s, id) => s + (scores[p][id] || 0), 0); }
    function bonus(p) { return upperSum(p) >= UPPER_TARGET ? UPPER_BONUS : 0; }
    function total(p) {
      return CATS.reduce((s, c) => s + (scores[p][c.id] || 0), 0) + bonus(p) + yahtzeeBonus[p];
    }

    function finish() {
      over = true;
      ctx.setTurn(-1);
      const a = total(0), b = total(1);
      if (a > b) { ctx.incScore(0); ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng ${a}–${b}!`, `🎉 Player 1 wins ${a}–${b}!`)); }
      else if (b > a) { ctx.incScore(1); ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng ${b}–${a}!`, `🎉 Player 2 wins ${b}–${a}!`)); }
      else ctx.setStatus(ctx.t(`🤝 Hòa ${a}–${b}!`, `🤝 Draw ${a}–${b}!`));
      renderTable();
    }

    function renderDice() {
      dice.forEach((v, i) => {
        paintDie(dieEls[i].face, v);
        const h = rolledThisTurn && held[i];
        dieEls[i].wrap.classList.toggle("held", h);
        dieEls[i].wrap.classList.toggle("rollable", rolledThisTurn && myTurn() && !over && !animating);
        dieEls[i].wrap.classList.toggle("yz-blank", !rolledThisTurn);
      });
    }

    function renderTable() {
      // tô sáng cột người đang chơi
      root.querySelector("#yzH0").classList.toggle("active", turn === 0 && !over);
      root.querySelector("#yzH1").classList.toggle("active", turn === 1 && !over);
      CATS.forEach((cat) => {
        [0, 1].forEach((p) => {
          const cell = p === 0 ? rowEls[cat.id].c0 : rowEls[cat.id].c1;
          const val = scores[p][cat.id];
          cell.classList.remove("filled", "preview", "pickable", "zero");
          if (val !== undefined) {
            cell.textContent = val;
            cell.classList.add("filled");
            if (val === 0) cell.classList.add("zero");
          } else if (p === turn && myTurn() && rolledThisTurn && !over && !animating) {
            cell.textContent = cat.fn(dice);
            cell.classList.add("preview", "pickable");
          } else {
            cell.textContent = "·";
          }
        });
      });
      // thưởng
      [0, 1].forEach((p) => {
        const el = root.querySelector("#yzB" + p);
        const us = upperSum(p), bn = bonus(p);
        el.textContent = bn ? "+" + bn : us + "/" + UPPER_TARGET;
        el.classList.toggle("filled", bn > 0);
      });
      // thưởng Yahtzee thêm
      [0, 1].forEach((p) => {
        const el = root.querySelector("#yzYB" + p);
        el.textContent = yahtzeeBonus[p] ? "+" + yahtzeeBonus[p] : "·";
        el.classList.toggle("filled", yahtzeeBonus[p] > 0);
      });
      root.querySelector("#yzTot0").textContent = total(0);
      root.querySelector("#yzTot1").textContent = total(1);
    }

    ctx.setTurn(0);
    renderDice();
    renderTable();
    rollBtn.disabled = !myTurn();
    ctx.setStatus(ctx.t("Lượt Người chơi 1 — bấm Gieo để bắt đầu (mỗi lượt gieo tối đa 3 lần).",
      "Player 1's turn — press Roll to start (up to 3 rolls per turn)."));
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "yahtzee",
    name: "Yahtzee",
    emoji: "🎰",
    description: "Gieo 5 xúc xắc, ghi điểm theo 13 tổ hợp (cù lũ, sảnh, Yahtzee...). Ai tổng điểm cao hơn thắng.",
    onlineReady: true,
    howTo: [
      "Mỗi lượt bạn được gieo 5 xúc xắc tối đa 3 lần. Sau mỗi lần gieo, bấm vào viên xúc xắc muốn GIỮ lại (hiện ổ khóa 🔒) rồi gieo tiếp các viên còn lại.",
      "Sau khi gieo, chọn MỘT ô điểm trong bảng để ghi — ô bạn chọn sẽ tính điểm theo xúc xắc hiện tại (số mờ là điểm dự kiến).",
      "Các ô số (1–6): tính tổng các viên có số đó. 3/4 giống nhau: tổng tất cả viên. Cù lũ: 25đ. Sảnh nhỏ (4 liên tiếp): 30đ. Sảnh lớn (5 liên tiếp): 40đ.",
      "Yahtzee (cả 5 viên giống nhau): 50đ. May rủi: tổng tất cả viên.",
      "THƯỞNG: nếu tổng 6 ô số (1–6) đạt từ 63 điểm trở lên, bạn được cộng thêm 35 điểm.",
      "⭐ YAHTZEE BONUS: nếu ô ⭐ đã được ghi 50 điểm, mỗi lần bạn tung thêm một Yahtzee (5 viên giống nhau) sẽ được cộng ngay +100 điểm thưởng.",
      "Mỗi ô chỉ điền một lần. Khi cả hai điền hết 13 ô, ai tổng điểm cao hơn sẽ thắng.",
    ],
    create,
  });
})();
