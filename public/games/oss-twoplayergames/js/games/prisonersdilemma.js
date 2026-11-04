/* Tù Nhân Song Đề (Prisoner's Dilemma) — chơi chung máy, ĐẤU MÁY và ONLINE
   Nhiều vòng. Mỗi vòng cả hai BÍ MẬT chọn HỢP TÁC 🤝 hoặc PHẢN BỘI 🔪, rồi lật.
   Tính điểm (số năm tù — CÀNG ÍT CÀNG TỐT, nên ta tính ĐIỂM THƯỞNG ngược lại):
     • Cả hai hợp tác:  mỗi người +3
     • Cả hai phản bội: mỗi người +1
     • Một phản một hợp: kẻ phản +5, người bị phản +0
   Sau số vòng định trước, ai NHIỀU ĐIỂM hơn thắng. (Đấu trí tâm lý + lòng tin.)

   Đồng bộ online: mỗi người gửi lựa chọn qua relay; chỉ lật khi đủ hai lựa chọn. */
(function () {
  const PAYOFF = {
    // [me, opp] theo lựa chọn: C = hợp tác, D = phản bội
    // Biến thể "Game Con Gà": cả hai phản bội thì CẢ HAI BỊ TRỪ điểm
    // -> phản bội không còn là nước an toàn, phải đọc vị đối thủ.
    CC: 3, CD: 0, DC: 5, DD: -3,
  };

  function create(ctx) {
    const o = ctx.options || {};
    const ROUNDS = o.rounds ? Number(o.rounds) : 8;

    let score = [0, 0];
    let over = false;
    let roundNo = 1;
    let picks = [null, null]; // 'C' | 'D'
    let revealing = false;
    let history = [];          // [{p0,p1,s0,s1}]
    let lastResult = null;

    const root = document.createElement("div");
    root.className = "pd2-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : -1; }
    function bothPicked() { return picks[0] != null && picks[1] != null; }
    function gain(mine, opp) { return PAYOFF[mine + opp]; }

    // Hành động: { k:"pick", c } với c ∈ 'C'|'D'
    function applyMove(move, fromRemote) {
      if (over || revealing || move.k !== "pick") return;
      const c = move.c === "D" ? "D" : "C";
      let seat;
      if (ctx.isOnline) seat = fromRemote ? (1 - ctx.mySeat) : ctx.mySeat;
      else if (ctx.vsAI) seat = fromRemote ? 1 : 0;
      else seat = picks[0] == null ? 0 : 1;
      if (picks[seat] != null) return;
      picks[seat] = c;
      if (!fromRemote) ctx.sendMove({ k: "pick", c });
      ctx.sound("place");
      if (bothPicked()) { reveal(); return; }
      render(); updateStatus();
      if (ctx.vsAI && !fromRemote && picks[1] == null) {
        setTimeout(() => { const mv = aiMove(); if (mv) applyMove(mv, true); }, 550);
      }
    }

    function reveal() {
      revealing = true;
      const p0 = picks[0], p1 = picks[1];
      const s0 = gain(p0, p1), s1 = gain(p1, p0);
      score[0] += s0; score[1] += s1;
      history.push({ p0, p1, s0, s1 });
      lastResult = { p0, p1, s0, s1 };
      ctx.sound(p0 === "C" && p1 === "C" ? "win" : (p0 === "D" && p1 === "D" ? "miss" : "notify"));
      render();

      setTimeout(() => {
        revealing = false;
        if (roundNo >= ROUNDS) {
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
      }, 1900);
    }

    // ----- AI: 3 chiến lược theo mức độ (payoff DD = −3 nên phản bội đối đầu là tự hại) -----
    //  • Dễ:  thiên về hợp tác (dễ bị lợi dụng — cho người mới thắng).
    //  • Vừa: Tit-for-Tat (hợp tác trước, rồi sao chép nước trước của đối thủ).
    //  • Khó: Tit-for-Tat có trừng phạt — sao chép đối thủ; ai cứ phản bội sẽ bị
    //         phản bội lại (cả hai −3) nên không thể vượt lên bằng phản bội mù quáng.
    function aiMove() {
      if (over || revealing) return null;
      const level = ctx.aiLevel || "normal";
      const last = history.length ? history[history.length - 1] : null;
      const oppLast = last ? last.p0 : null; // đối thủ là seat 0

      if (level === "easy") {
        // chủ yếu hợp tác, thỉnh thoảng phản bội
        return { k: "pick", c: ctx.rng() < 0.25 ? "D" : "C" };
      }
      if (level === "normal") {
        if (!oppLast) return { k: "pick", c: "C" };       // mở màn: hợp tác
        if (ctx.rng() < 0.1) return { k: "pick", c: "D" }; // chút nhiễu
        return { k: "pick", c: oppLast };                  // ăn miếng trả miếng
      }
      // hard: phòng thủ phủ đầu — KHÔNG tặng +5 miễn phí vòng đầu (mở màn PHẢN BỘI),
      // sau đó sao chép. Người "luôn phản bội" sẽ chỉ hòa (cùng âm), không thắng được;
      // muốn thắng phải chủ động hợp tác để tích điểm rồi phản bội đúng lúc.
      if (!oppLast) return { k: "pick", c: "D" };
      // đối thủ vừa phản bội -> trừng phạt bằng phản bội (cả hai −3)
      if (oppLast === "D") return { k: "pick", c: "D" };
      // đối thủ vừa hợp tác: chủ yếu hợp tác lại (+3/+3) để cùng tích điểm,
      // thi thoảng thò phản bội bất ngờ ăn +5 và không bị đọc vị
      return { k: "pick", c: ctx.rng() < 0.22 ? "D" : "C" };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="pd2-head" id="pd2Head"></div>` +
        `<div class="pd2-payoff">${ctx.t("🤝🤝 +3 mỗi bên · 🔪🤝 kẻ phản +5, bị phản +0 · 🔪🔪 −3 mỗi bên!", "🤝🤝 +3 each · 🔪🤝 betrayer +5, betrayed +0 · 🔪🔪 −3 each!")}</div>` +
        `<div class="pd2-reveal" id="pd2Reveal"></div>` +
        `<div class="pd2-pickwrap" id="pd2PickWrap"></div>` +
        `<div class="pd2-hist" id="pd2Hist"></div>`;
      els = {
        head: root.querySelector("#pd2Head"),
        reveal: root.querySelector("#pd2Reveal"),
        pickWrap: root.querySelector("#pd2PickWrap"),
        hist: root.querySelector("#pd2Hist"),
      };
    }

    function icon(c) { return c === "C" ? "🤝" : "🔪"; }

    function render() {
      if (!els) buildShell();
      const me = mySeatIdx();
      const p2label = ctx.vsAI ? ctx.t("🤖 Máy", "🤖 AI") : `🟦 P2${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}`;
      els.head.innerHTML =
        `<div class="pd2-pinfo p1"><span>🟥 P1${me === 0 || ctx.vsAI ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${score[0]}</b></div>` +
        `<div class="pd2-goal">${ctx.t("vòng", "round")} ${Math.min(roundNo, ROUNDS)}/${ROUNDS}</div>` +
        `<div class="pd2-pinfo p2"><span>${p2label}</span><b>${score[1]}</b></div>`;

      if (lastResult && (revealing || bothPicked())) {
        const { p0, p1, s0, s1 } = lastResult;
        els.reveal.innerHTML =
          `<div class="pd2-cards">` +
            `<span class="pd2-card p1">${icon(p0)}<small>+${s0}</small></span>` +
            `<span class="pd2-vs">vs</span>` +
            `<span class="pd2-card p2">${icon(p1)}<small>+${s1}</small></span>` +
          `</div><div class="pd2-verdict">${verdictText(p0, p1)}</div>`;
      } else {
        els.reveal.innerHTML = `<div class="pd2-hint">${ctx.t("Cả hai bí mật chọn: tin tưởng hợp tác, hay phản bội để ăn nhiều hơn?", "Both secretly choose: cooperate on trust, or betray for more?")}</div>`;
      }

      // lịch sử
      els.hist.innerHTML = history.length
        ? `<div class="pd2-histtitle">${ctx.t("Lịch sử", "History")}</div>` + history.map((h, i) =>
            `<span class="pd2-hcell" title="${ctx.t("vòng", "round")} ${i + 1}">${icon(h.p0)}${icon(h.p1)}</span>`).join("")
        : "";

      renderPicker();
    }

    function verdictText(p0, p1) {
      if (p0 === "C" && p1 === "C") return ctx.t("Cả hai HỢP TÁC — đôi bên cùng có lợi! (+3/+3)", "Both COOPERATE — mutual benefit! (+3/+3)");
      if (p0 === "D" && p1 === "D") return ctx.t("Cả hai PHẢN BỘI — cùng lãnh hậu quả! (−3/−3)", "Both BETRAY — both punished! (−3/−3)");
      const bSeat = p0 === "D" ? 0 : 1;
      const bname = ctx.vsAI ? (bSeat === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : "P" + (bSeat + 1);
      return ctx.t(`${bname} phản bội và ăn đậm! (+5/+0)`, `${bname} betrayed and cashed in! (+5/+0)`);
    }

    function renderPicker() {
      if (over) { els.pickWrap.innerHTML = `<div class="pd2-over">${ctx.t("Ván đã kết thúc.", "Game over.")}</div>`; return; }
      if (revealing) { els.pickWrap.innerHTML = ""; return; }

      let label;
      if (ctx.isOnline) {
        if (picks[ctx.mySeat] != null) { els.pickWrap.innerHTML = `<div class="pd2-waitpick">${ctx.t("Đã chọn — chờ đối thủ...", "Chosen — waiting for opponent...")}</div>`; return; }
        label = ctx.t("Lựa chọn của bạn:", "Your choice:");
      } else if (ctx.vsAI) {
        if (picks[0] != null) { els.pickWrap.innerHTML = `<div class="pd2-waitpick">${ctx.t("Đã chọn — máy đang nghĩ...", "Chosen — computer is thinking...")}</div>`; return; }
        label = ctx.t("Lựa chọn của bạn:", "Your choice:");
      } else {
        const cur = picks[0] == null ? 0 : 1;
        label = ctx.t(`Người chơi ${cur + 1} chọn (che màn!):`, `Player ${cur + 1} choose (hide screen!):`);
      }
      els.pickWrap.innerHTML =
        `<div class="pd2-picklabel">${label}</div>` +
        `<div class="pd2-btns">` +
          `<button type="button" class="btn pd2-coop" data-c="C">🤝 ${ctx.t("Hợp tác", "Cooperate")}</button>` +
          `<button type="button" class="btn pd2-betray" data-c="D">🔪 ${ctx.t("Phản bội", "Betray")}</button>` +
        `</div>`;
      els.pickWrap.querySelectorAll("button[data-c]").forEach((b) => {
        b.addEventListener("click", () => applyMove({ k: "pick", c: b.dataset.c }, false));
      });
    }

    function updateStatus() {
      if (over || revealing) return;
      if (ctx.isOnline) {
        ctx.setStatus(picks[ctx.mySeat] != null
          ? ctx.t("Đã chọn — chờ lật.", "Chosen — waiting to reveal.")
          : ctx.t("Bí mật chọn Hợp tác hay Phản bội.", "Secretly choose Cooperate or Betray."));
      } else if (ctx.vsAI) {
        ctx.setStatus(picks[0] != null
          ? ctx.t("Đã chọn — máy đang quyết định...", "Chosen — computer is deciding...")
          : ctx.t("Chọn: tin tưởng Hợp tác hay Phản bội để ăn nhiều hơn?", "Choose: cooperate on trust, or betray for more?"));
      } else {
        const cur = picks[0] == null ? 0 : 1;
        ctx.setStatus(ctx.t(`Người chơi ${cur + 1}: chọn (giữ bí mật với đối thủ).`, `Player ${cur + 1}: choose (keep it secret).`));
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
    id: "prisonersdilemma",
    name: "Tù Nhân Song Đề",
    emoji: "⚖️",
    description: "Mỗi vòng bí mật chọn hợp tác hay phản bội — lòng tin và đòn tâm lý quyết định ai nhiều điểm hơn.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "rounds", label: "Số vòng", default: 8,
        choices: [
          { value: 5, label: "5 vòng (nhanh)" },
          { value: 8, label: "8 vòng" },
          { value: 12, label: "12 vòng (dài)" },
        ],
      },
    ],
    howTo: [
      "Trò đấu trí tâm lý kinh điển. Qua nhiều vòng, mỗi vòng CẢ HAI cùng bí mật chọn: 🤝 Hợp tác hoặc 🔪 Phản bội.",
      "Khi cả hai đã chọn, lựa chọn được lật ra cùng lúc và tính điểm thưởng.",
      "Cả hai HỢP TÁC: mỗi người +3 (tin tưởng đôi bên cùng lợi).",
      "Một PHẢN BỘI, một HỢP TÁC: kẻ phản bội +5, người bị phản +0 (bị lừa).",
      "Cả hai PHẢN BỘI: mỗi người bị TRỪ 3 điểm (−3/−3) — đối đầu thì cùng thiệt nặng!",
      "Sau số vòng đã chọn, ai NHIỀU ĐIỂM hơn sẽ thắng. Mẹo: phản bội chỉ lời khi đối thủ hợp tác (+5); nếu cả hai cùng phản bội thì cùng mất điểm — nên phải đọc vị và xây lòng tin đúng lúc. Chơi chung máy, đấu máy, hoặc online.",
    ],
    create,
  });
})();
