/* Chọn Số Né Nhau (Number Duel) — chơi chung máy, ĐẤU MÁY và ONLINE
   Mỗi vòng, cả hai BÍ MẬT chọn một số trong 1..N rồi cùng lật:
     • Trùng số  -> KHÔNG ai được điểm (hòa vòng, "đụng nhau").
     • Lệch số   -> người chọn số LỚN HƠN được cộng số điểm bằng chính số đó.
   Mẹo: số lớn ăn nhiều nhưng dễ bị đối thủ "đoán trúng" để triệt tiêu.
   Ai đạt mốc điểm trước sẽ thắng.

   Đồng bộ online: mỗi người gửi lựa chọn qua relay; client chỉ LẬT khi đã có đủ
   hai lựa chọn (giấu số đối thủ cho tới lúc đó). */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const N = o.range ? Number(o.range) : 6;
    const WIN = o.target ? Number(o.target) : 30;

    let score = [0, 0];
    let over = false;
    let roundNo = 1;
    let picks = [null, null];   // lựa chọn vòng hiện tại
    let revealing = false;
    let lastResult = null;

    const root = document.createElement("div");
    root.className = "nd2-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : -1; }
    function bothPicked() { return picks[0] != null && picks[1] != null; }

    // Hành động: { k:"pick", n } — người chơi (seat) chọn số n
    function applyMove(move, fromRemote) {
      if (over || revealing || move.k !== "pick") return;
      const n = Number(move.n);
      if (!(n >= 1 && n <= N)) return;
      // xác định ai chọn:
      //  - online: theo mySeat của người gửi
      //  - đấu máy: người = seat 0, máy = seat 1
      //  - chung máy: P1 chọn trước (picks[0]), rồi P2 (picks[1])
      let seat;
      if (ctx.isOnline) seat = fromRemote ? (1 - ctx.mySeat) : ctx.mySeat;
      else if (ctx.vsAI) seat = fromRemote ? 1 : 0;
      else seat = picks[0] == null ? 0 : 1;
      if (picks[seat] != null) return; // đã chọn rồi
      picks[seat] = n;
      if (!fromRemote) ctx.sendMove({ k: "pick", n });
      ctx.sound("place");

      if (bothPicked()) { reveal(); return; }
      render(); updateStatus();
      // đấu máy: người vừa chọn -> máy chọn ngay sau đó
      if (ctx.vsAI && !fromRemote && picks[1] == null) {
        setTimeout(() => {
          const mv = aiMove();
          if (mv) applyMove(mv, true);
        }, 500);
      }
    }

    function reveal() {
      revealing = true;
      const a = picks[0], b = picks[1];
      oppHist.push(a);   // ghi lại số người chơi (seat 0) đã ra cho AI hard học
      let winner = -1;
      if (a !== b) winner = a > b ? 0 : 1;
      if (winner >= 0) score[winner] += picks[winner];
      lastResult = { a, b, winner };
      ctx.sound(winner >= 0 ? "win" : "miss");
      render();

      setTimeout(() => {
        revealing = false;
        if (score[0] >= WIN || score[1] >= WIN) {
          over = true;
          const w = score[0] === score[1] ? -1 : (score[0] > score[1] ? 0 : 1);
          if (w >= 0) ctx.incScore(w);
          ctx.setTurn(-1);
          const wname = (s) => ctx.vsAI ? (s === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (s + 1), "Player " + (s + 1));
          ctx.setStatus(w < 0
            ? ctx.t(`🤝 Hòa ${score[0]}–${score[1]}!`, `🤝 Draw ${score[0]}–${score[1]}!`)
            : ctx.t(`🎉 ${wname(w)} thắng ${score[0]}–${score[1]}!`, `🎉 ${wname(w)} wins ${score[0]}–${score[1]}!`));
          render();
          return;
        }
        roundNo++;
        picks = [null, null];
        render(); updateStatus();
      }, 1700);
    }

    // ----- AI: chọn số khó đoán; mức Khó dựa trên lịch sử để né/đè -----
    let oppHist = [];   // lịch sử số người chơi (seat 0) đã ra
    function aiMove() {
      if (over || revealing) return null;
      const level = ctx.aiLevel || "normal";
      if (level === "easy") return { k: "pick", n: 1 + Math.floor(ctx.rng() * N) };
      if (level === "normal") {
        // nghiêng về số trung-cao, có nhiễu
        if (ctx.rng() < 0.4) return { k: "pick", n: 1 + Math.floor(ctx.rng() * N) };
        const hi = Math.max(2, Math.round(N * 0.55));
        return { k: "pick", n: hi + Math.floor(ctx.rng() * (N - hi + 1)) };
      }
      // hard: đoán người chơi hay ra số nào để "đè" (ra cao hơn 1) hoặc né trùng
      if (oppHist.length >= 2 && ctx.rng() < 0.55) {
        const freq = {};
        oppHist.forEach((x) => (freq[x] = (freq[x] || 0) + 1));
        let likely = oppHist[oppHist.length - 1], best = -1;
        for (const k in freq) if (freq[k] > best) { best = freq[k]; likely = +k; }
        // ra cao hơn dự đoán 1 bậc (nếu được), không thì né bằng số trung
        const guess = Math.min(N, likely + 1);
        return { k: "pick", n: guess >= 1 ? guess : Math.ceil(N / 2) };
      }
      const hi = Math.max(2, Math.round(N * 0.6));
      return { k: "pick", n: hi + Math.floor(ctx.rng() * (N - hi + 1)) };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="nd2-head" id="nd2Head"></div>` +
        `<div class="nd2-reveal" id="nd2Reveal"></div>` +
        `<div class="nd2-pickwrap" id="nd2PickWrap"><div class="nd2-picklabel" id="nd2PickLabel"></div><div class="nd2-nums" id="nd2Nums"></div></div>`;
      els = {
        head: root.querySelector("#nd2Head"),
        reveal: root.querySelector("#nd2Reveal"),
        pickWrap: root.querySelector("#nd2PickWrap"),
        pickLabel: root.querySelector("#nd2PickLabel"),
        nums: root.querySelector("#nd2Nums"),
      };
    }

    function render() {
      if (!els) buildShell();
      const me = mySeatIdx();
      const p2label = ctx.vsAI ? ctx.t("🤖 Máy", "🤖 AI") : `🟦 P2${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}`;
      const pct = (s) => Math.min(100, Math.round(s / WIN * 100));
      els.head.innerHTML =
        `<div class="nd2-pinfo p1"><span>🟥 P1${me === 0 || ctx.vsAI ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${score[0]}</b><span class="nd2-pbar"><i style="width:${pct(score[0])}%"></i></span></div>` +
        `<div class="nd2-goal">${ctx.t("vòng", "round")} ${roundNo}<br><small>${ctx.t("đích", "goal")} ${WIN}</small></div>` +
        `<div class="nd2-pinfo p2"><span>${p2label}</span><b>${score[1]}</b><span class="nd2-pbar p2"><i style="width:${pct(score[1])}%"></i></span></div>`;

      // khu lật kết quả
      if (lastResult && (revealing || bothPicked())) {
        const { a, b, winner } = lastResult;
        const pname = (s) => ctx.vsAI ? (s === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : "P" + (s + 1);
        const verdict = a === b
          ? ctx.t(`Cùng chọn ${a} — đụng nhau, không ai ghi điểm!`, `Both picked ${a} — clash, no points!`)
          : ctx.t(`${pname(winner)} chọn ${winner === 0 ? a : b} (lớn hơn) → +${winner === 0 ? a : b} điểm!`,
                  `${pname(winner)} picked ${winner === 0 ? a : b} (higher) → +${winner === 0 ? a : b} points!`);
        els.reveal.innerHTML =
          `<div class="nd2-cards">` +
            `<span class="nd2-card p1${winner === 0 ? " win" : ""}${a === b ? " clash" : ""}">${a}</span>` +
            `<span class="nd2-vs">vs</span>` +
            `<span class="nd2-card p2${winner === 1 ? " win" : ""}${a === b ? " clash" : ""}">${b}</span>` +
          `</div><div class="nd2-verdict">${verdict}</div>`;
      } else {
        els.reveal.innerHTML = `<div class="nd2-hint">${ctx.t("Cả hai bí mật chọn một số. Số lớn hơn ăn điểm — nhưng trùng số thì cả hai trắng tay!", "Both secretly pick a number. The higher one scores — but matching numbers cancel out!")}</div>`;
      }

      renderPicker();
    }

    function renderPicker() {
      if (over) { els.pickWrap.innerHTML = `<div class="nd2-over">${ctx.t("Ván đã kết thúc.", "Game over.")}</div>`; return; }
      if (revealing) { els.pickLabel.textContent = ""; els.nums.innerHTML = ""; return; }

      // ai cần chọn?
      if (ctx.isOnline) {
        const meSeat = ctx.mySeat;
        if (picks[meSeat] != null) {
          els.pickLabel.textContent = ctx.t("Đã chọn — chờ đối thủ...", "Picked — waiting for opponent...");
          els.nums.innerHTML = "";
          return;
        }
        els.pickLabel.textContent = ctx.t("Chọn số của bạn (bí mật):", "Pick your number (secret):");
        els.nums.innerHTML = numButtons();
      } else if (ctx.vsAI) {
        // đấu máy: chỉ người (seat 0) chọn; máy tự chọn ngầm
        if (picks[0] != null) {
          els.pickLabel.textContent = ctx.t("Đã chọn — máy đang nghĩ...", "Picked — computer is thinking...");
          els.nums.innerHTML = "";
          return;
        }
        els.pickLabel.textContent = ctx.t("Chọn số của bạn:", "Pick your number:");
        els.nums.innerHTML = numButtons();
      } else {
        // chung máy: lần lượt P1 rồi P2, che số đã chọn
        const cur = picks[0] == null ? 0 : 1;
        els.pickLabel.textContent = ctx.t(`Người chơi ${cur + 1} chọn số (đừng cho đối thủ thấy!):`, `Player ${cur + 1} pick a number (hide it!):`);
        els.nums.innerHTML = numButtons();
      }
      wirePicker();
    }

    function numButtons() {
      let s = "";
      for (let n = 1; n <= N; n++) s += `<button type="button" class="nd2-num" data-n="${n}">${n}</button>`;
      return s;
    }

    function wirePicker() {
      els.nums.querySelectorAll(".nd2-num").forEach((b) => {
        b.addEventListener("click", () => applyMove({ k: "pick", n: Number(b.dataset.n) }, false));
      });
    }

    function updateStatus() {
      if (over || revealing) return;
      if (ctx.isOnline) {
        ctx.setStatus(picks[ctx.mySeat] != null
          ? ctx.t("Đã chọn — chờ đối thủ lật.", "Picked — waiting to reveal.")
          : ctx.t("Bí mật chọn một số. Số lớn ăn điểm, trùng thì hòa vòng.", "Secretly pick a number. Higher scores, a match cancels."));
      } else {
        const cur = picks[0] == null ? 0 : 1;
        ctx.setStatus(ctx.t(`Người chơi ${cur + 1}: chọn số (chuyền máy/che màn để giữ bí mật).`, `Player ${cur + 1}: pick a number (hide the screen).`));
      }
    }

    buildShell();
    ctx.setTurn(-1);
    render();
    updateStatus();

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "numberduel",
    name: "Chọn Số Né Nhau",
    emoji: "🔢",
    description: "Cả hai bí mật chọn một số — số lớn hơn ăn điểm, nhưng trùng số thì cả hai trắng tay.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "range", label: "Dải số", default: 6,
        choices: [
          { value: 5, label: "1–5 (gắt)" },
          { value: 6, label: "1–6" },
          { value: 9, label: "1–9 (rộng)" },
        ],
      },
      {
        id: "target", label: "Điểm để thắng", default: 30,
        choices: [
          { value: 20, label: "20 (nhanh)" },
          { value: 30, label: "30" },
          { value: 50, label: "50 (dài)" },
        ],
      },
    ],
    howTo: [
      "Mỗi vòng, CẢ HAI cùng bí mật chọn một số trong dải đã định (mặc định 1–6).",
      "Khi cả hai đã chọn, hai số được lật ra cùng lúc.",
      "Nếu hai số KHÁC nhau: người chọn số LỚN HƠN được cộng điểm bằng đúng số đó.",
      "Nếu hai số TRÙNG nhau: 'đụng nhau' — KHÔNG ai được điểm vòng đó.",
      "Mẹo đấu trí: số lớn ăn nhiều nhưng dễ bị đối thủ đoán trúng để triệt tiêu; số nhỏ an toàn nhưng ít điểm.",
      "Người đầu tiên đạt mốc điểm sẽ thắng. Chơi chung máy (chuyền máy để giữ bí mật), đấu với máy, hoặc online.",
    ],
    create,
  });
})();
