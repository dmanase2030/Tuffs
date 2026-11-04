/* Pig (Heo Cờ) — xúc xắc, chơi chung máy & ONLINE
   Đến lượt: GIEO xúc xắc nhiều lần để cộng dồn điểm tạm.
   - Ra 1: mất hết điểm tạm, chuyển lượt.
   - GIỮ: cộng điểm tạm vào điểm tổng, chuyển lượt.
   Ai đạt mốc điểm trước sẽ thắng.
   Nước đi: { kind:"roll", die } | { kind:"hold" }. Người gieo tự tung,
   gửi kết quả cho đối thủ (đồng bộ). */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const TARGET = o.target || 100;

    let totals = [0, 0];
    let temp = 0;        // điểm tạm của lượt hiện tại
    let turn = 0;
    let over = false;
    let rolling = false;
    let rollTimer = null;

    const root = document.createElement("div");
    root.className = "pig-root";
    root.innerHTML =
      `<div class="pig-scores">` +
      `<div class="pig-p p1"><span>${ctx.t("Người chơi 1", "Player 1")}</span><b id="pigT0">0</b></div>` +
      `<div class="pig-p p2"><span>${ctx.t("Người chơi 2", "Player 2")}</span><b id="pigT1">0</b></div>` +
      `</div>` +
      `<div class="pig-die-stage"><div class="pig-die" id="pigDie">` +
      `<div class="pig-die-face" id="pigDieFace"></div></div></div>` +
      `<div class="pig-temp">${ctx.t("Điểm tạm lượt này:", "Turn points:")} <b id="pigTemp">0</b></div>` +
      `<div class="pig-actions">` +
      `<button class="btn primary" id="pigRoll">${ctx.t("🎲 Gieo", "🎲 Roll")}</button>` +
      `<button class="btn" id="pigHold">${ctx.t("✋ Giữ điểm", "✋ Hold")}</button>` +
      `</div>`;
    ctx.boardEl.appendChild(root);

    const dieEl = root.querySelector("#pigDie");
    const dieFace = root.querySelector("#pigDieFace");
    const tempEl = root.querySelector("#pigTemp");
    const rollBtn = root.querySelector("#pigRoll");
    const holdBtn = root.querySelector("#pigHold");
    const tEls = [root.querySelector("#pigT0"), root.querySelector("#pigT1")];

    // bố cục chấm trên lưới 3x3 (giống Yahtzee)
    const PIP_LAYOUT = {
      1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
    };
    // dựng 9 ô chấm một lần, sau chỉ bật/tắt
    for (let k = 0; k < 9; k++) {
      const slot = document.createElement("span");
      slot.className = "pig-pip-slot";
      dieFace.appendChild(slot);
    }
    function paintDie(value) {
      const set = new Set(PIP_LAYOUT[value] || []);
      const slots = dieFace.children;
      for (let k = 0; k < 9; k++) {
        slots[k].className = "pig-pip-slot" + (set.has(k) ? " on" : "");
      }
    }
    paintDie(1);

    function myTurn() { return !ctx.isOnline || turn === ctx.mySeat; }

    function updateButtons() {
      const active = myTurn() && !over && !rolling;
      rollBtn.disabled = !active;
      holdBtn.disabled = !active || temp === 0;
    }

    rollBtn.addEventListener("click", () => {
      if (!myTurn() || over || rolling) return;
      const die = 1 + Math.floor(Math.random() * 6);
      applyMove({ kind: "roll", die }, false);
    });
    holdBtn.addEventListener("click", () => {
      if (!myTurn() || over || rolling || temp === 0) return;
      applyMove({ kind: "hold" }, false);
    });

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.kind === "roll") {
        if (!fromRemote) ctx.sendMove(move);
        // hoạt ảnh kiểu Yahtzee: rung lắc + đổi mặt ngẫu nhiên rồi dừng
        rolling = true;
        updateButtons();
        ctx.sound("shot");
        dieEl.classList.add("rolling");
        let ticks = 0;
        clearInterval(rollTimer);
        rollTimer = setInterval(() => {
          paintDie(1 + Math.floor(Math.random() * 6));
          if (++ticks >= 9) {
            clearInterval(rollTimer);
            dieEl.classList.remove("rolling");
            paintDie(move.die);
            dieEl.classList.add("landed");
            setTimeout(() => dieEl.classList.remove("landed"), 320);
            rolling = false;
            resolveRoll(move.die);
          }
        }, 55);
        return;
      }

      if (move.kind === "hold") {
        if (!fromRemote) ctx.sendMove(move);
        totals[turn] += temp;
        tEls[turn].textContent = totals[turn];
        ctx.sound("capture");
        if (totals[turn] >= TARGET) return finish(turn);
        nextTurn(ctx.t(`✋ Người chơi ${turn + 1} giữ ${temp} điểm.`, `✋ Player ${turn + 1} holds ${temp} points.`));
      }
    }

    function resolveRoll(die) {
      if (die === 1) {
        dieEl.classList.add("bust");
        setTimeout(() => dieEl.classList.remove("bust"), 700);
        const opp = 1 - turn;
        const moved = temp;
        if (moved > 0) {
          totals[opp] += moved;
          tEls[opp].textContent = totals[opp];
        }
        temp = 0;
        tempEl.textContent = 0;
        ctx.sound("error");
        // điểm chuyển sang có thể giúp đối thủ thắng luôn
        if (totals[opp] >= TARGET) return finish(opp);
        nextTurn(moved > 0
          ? ctx.t(`💥 Người chơi ${turn + 1} ra 1 — chuyển ${moved} điểm tạm cho đối thủ!`,
                  `💥 Player ${turn + 1} rolled a 1 — ${moved} turn points go to the opponent!`)
          : ctx.t(`💥 Người chơi ${turn + 1} ra 1!`, `💥 Player ${turn + 1} rolled a 1!`));
      } else {
        temp += die;
        tempEl.textContent = temp;
        ctx.sound("select");
        ctx.setStatus(ctx.t(`Người chơi ${turn + 1} gieo ra ${die}. Tổng tạm: ${temp}. Gieo tiếp hay giữ?`,
          `Player ${turn + 1} rolled ${die}. Turn total: ${temp}. Roll again or hold?`));
        ctx.setTurn(turn); // cùng lượt — để máy (nếu đấu máy) cân nhắc gieo tiếp/giữ
        updateButtons();
      }
    }

    function nextTurn(msg) {
      temp = 0;
      tempEl.textContent = 0;
      turn = 1 - turn;
      ctx.setTurn(turn);
      ctx.setStatus(ctx.t(`${msg} — Lượt Người chơi ${turn + 1}.`, `${msg} — Player ${turn + 1}'s turn.`));
      updateButtons();
    }

    function finish(winner) {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} đạt ${totals[winner]} điểm — chiến thắng!`,
        `🎉 Player ${winner + 1} reached ${totals[winner]} points — wins!`));
      updateButtons();
    }

    // ----- AI (đấu máy): chiến lược ngưỡng "giữ điểm" cổ điển -----
    function aiMove(level) {
      if (over || rolling) return null;
      const me = turn, opp = 1 - me;
      if (totals[me] + temp >= TARGET) return { kind: "hold" }; // đủ điểm thắng -> chốt ngay
      let threshold;
      if (level === "easy") {
        threshold = 12 + Math.floor(Math.random() * 9); // 12–20, thất thường cho dễ thở
      } else if (level === "hard") {
        threshold = 21;
        const behind = totals[opp] - totals[me];
        if (behind > 24) threshold += 13;       // tụt lại nhiều -> liều hơn
        else if (behind > 0) threshold += 5;
        // gần đích thì chỉ gom vừa đủ rồi giữ
        const remain = TARGET - totals[me];
        if (remain <= 30) threshold = Math.max(8, remain);
      } else {
        threshold = 20; // chuẩn
      }
      if (temp > 0 && temp >= threshold) return { kind: "hold" };
      return { kind: "roll", die: 1 + Math.floor(Math.random() * 6) };
    }

    ctx.setTurn(0);
    ctx.setStatus(ctx.t(`Gieo xúc xắc để cộng điểm. Đạt ${TARGET} điểm trước sẽ thắng. Ra 1 là CHUYỂN điểm tạm cho đối thủ!`,
      `Roll dice to score. First to ${TARGET} points wins. Rolling a 1 GIVES your turn points to the opponent!`));
    updateButtons();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "pig",
    name: "Pig (Heo Cờ Xúc Xắc)",
    emoji: "🎲",
    description: "Gieo xúc xắc cộng dồn điểm, nhưng ra 1 là CHUYỂN hết điểm tạm cho đối thủ. Biết dừng đúng lúc để thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "target", label: "Điểm để thắng", default: 150,
        choices: [
          { value: 100, label: "100 (nhanh)" },
          { value: 150, label: "150 (chuẩn)" },
          { value: 200, label: "200 (lâu)" },
          { value: 300, label: "300 (marathon)" },
        ],
      },
    ],
    howTo: [
      "Đến lượt mình, bấm 🎲 Gieo để tung xúc xắc. Mỗi lần gieo cộng số nút vào 'điểm tạm' của lượt.",
      "Bạn có thể gieo nhiều lần liên tiếp để cộng dồn — nhưng càng tham càng rủi ro.",
      "Nếu gieo ra số 1: toàn bộ điểm tạm của lượt bị CHUYỂN SANG cho đối thủ, rồi tới lượt họ. (Luật mới — gắt hơn!)",
      "Bấm ✋ Giữ điểm để cộng điểm tạm vào điểm tổng của mình và kết thúc lượt an toàn.",
      "Ai đạt mốc điểm (mặc định 150) trước sẽ thắng. Cẩn thận: điểm tạm bị 'cướp' có thể giúp đối thủ thắng luôn!",
    ],
    create,
  });
})();
