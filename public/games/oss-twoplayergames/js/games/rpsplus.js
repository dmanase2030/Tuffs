/* Oẳn Tù Tì Nâng Cao (RPS Plus) — chơi chung máy, ĐẤU MÁY và ONLINE
   Kéo ✌️ / Búa ✊ / Bao ✋ như thường (búa thắng kéo, kéo thắng bao, bao thắng búa).
   Thêm CHIÊU ĐẶC BIỆT 💥 "Đại bác": thắng MỌI nước thường, nhưng chỉ dùng được khi
   đã sạc đủ (mỗi vòng +1 sạc, cần 3). Hai Đại bác gặp nhau -> hòa & cả hai mất sạc.
   Đại bác bị... "né": nếu đối thủ ra BAO ✋ đúng lúc bạn ra Đại bác thì Bao nuốt
   đại bác (Bao thắng) — nên đừng lạm dụng. Ai đủ số vòng thắng trước sẽ vô địch.

   Đồng bộ online: mỗi người gửi lựa chọn qua relay; chỉ lật khi đủ hai lựa chọn. */
(function () {
  const MOVES = ["R", "S", "P"]; // Rock(búa) Scissors(kéo) Paper(bao)
  const ICON = { R: "✊", S: "✌️", P: "✋", X: "💥" };
  const NAME_VI = { R: "Búa", S: "Kéo", P: "Bao", X: "Đại bác" };
  const NAME_EN = { R: "Rock", S: "Scissors", P: "Paper", X: "Cannon" };
  const CHARGE_NEED = 3;

  function create(ctx) {
    const o = ctx.options || {};
    const WIN_ROUNDS = o.rounds ? Number(o.rounds) : 5;

    let score = [0, 0];
    let charge = [0, 0];
    let over = false;
    let picks = [null, null];
    let revealing = false;
    let lastResult = null;

    const root = document.createElement("div");
    root.className = "rps2-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : -1; }
    function bothPicked() { return picks[0] != null && picks[1] != null; }

    // Trả về: 0 = a thắng, 1 = b thắng, -1 = hòa. a,b ∈ R/S/P/X
    function beats(a, b) {
      if (a === b) return -1;
      if (a === "X" && b === "X") return -1;            // hai đại bác -> hòa
      if (a === "X") return b === "P" ? 1 : 0;          // bao nuốt đại bác
      if (b === "X") return a === "P" ? 0 : 1;
      // luật thường
      const win = { R: "S", S: "P", P: "R" };           // a thắng nếu a 'win' b
      return win[a] === b ? 0 : 1;
    }

    function canCannon(seat) { return charge[seat] >= CHARGE_NEED; }

    // Hành động: { k:"pick", c } với c ∈ R/S/P/X
    function applyMove(move, fromRemote) {
      if (over || revealing || move.k !== "pick") return;
      const c = ["R", "S", "P", "X"].includes(move.c) ? move.c : "R";
      let seat;
      if (ctx.isOnline) seat = fromRemote ? (1 - ctx.mySeat) : ctx.mySeat;
      else if (ctx.vsAI) seat = fromRemote ? 1 : 0;
      else seat = picks[0] == null ? 0 : 1;
      if (picks[seat] != null) return;
      if (c === "X" && !canCannon(seat)) return;        // chưa đủ sạc, không cho
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
      const a = picks[0], b = picks[1];
      // trừ sạc nếu dùng đại bác; thắng vòng +1 sạc
      if (a === "X") charge[0] = 0;
      if (b === "X") charge[1] = 0;
      const r = beats(a, b);
      let winner = r;
      if (winner >= 0) score[winner]++;
      // mỗi vòng +1 sạc cho người KHÔNG dùng đại bác (tối đa CHARGE_NEED)
      if (a !== "X") charge[0] = Math.min(CHARGE_NEED, charge[0] + 1);
      if (b !== "X") charge[1] = Math.min(CHARGE_NEED, charge[1] + 1);
      lastResult = { a, b, winner };
      ctx.sound(winner >= 0 ? "win" : "miss");
      render();

      setTimeout(() => {
        revealing = false;
        if (score[0] >= WIN_ROUNDS || score[1] >= WIN_ROUNDS) {
          over = true;
          const w = score[0] > score[1] ? 0 : 1;
          ctx.incScore(w);
          ctx.setTurn(-1);
          const wname = ctx.vsAI ? (w === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : ctx.t("Người chơi " + (w + 1), "Player " + (w + 1));
          ctx.setStatus(ctx.t(`🎉 ${wname} vô địch ${score[0]}–${score[1]}!`, `🎉 ${wname} wins ${score[0]}–${score[1]}!`));
          render();
          return;
        }
        picks = [null, null];
        render(); updateStatus();
      }, 1700);
    }

    // ----- AI: ngẫu nhiên có chiến thuật, dùng đại bác khi đủ sạc và xác suất hợp lý -----
    function aiMove() {
      if (over || revealing) return null;
      const me = ctx.isOnline ? -1 : 1; // local: AI seat 1
      const seat = me === 1 ? 1 : 0;
      // nếu đủ sạc, đôi khi tung đại bác (nhưng không phải lúc nào — tránh bị Bao nuốt)
      if (canCannon(seat) && ctx.rng() < 0.45) return { k: "pick", c: "X" };
      const base = MOVES[Math.floor(ctx.rng() * MOVES.length)];
      return { k: "pick", c: base };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="rps2-head" id="rps2Head"></div>` +
        `<div class="rps2-reveal" id="rps2Reveal"></div>` +
        `<div class="rps2-pickwrap" id="rps2PickWrap"></div>`;
      els = {
        head: root.querySelector("#rps2Head"),
        reveal: root.querySelector("#rps2Reveal"),
        pickWrap: root.querySelector("#rps2PickWrap"),
      };
    }

    function chargeBar(seat) {
      let s = "";
      for (let i = 0; i < CHARGE_NEED; i++) s += `<i class="rps2-cpip${i < charge[seat] ? " on" : ""}"></i>`;
      return `<span class="rps2-charge" title="${ctx.t("Sạc đại bác", "Cannon charge")}">${s}</span>`;
    }

    function render() {
      if (!els) buildShell();
      const me = mySeatIdx();
      const p2label = ctx.vsAI ? ctx.t("🤖 Máy", "🤖 AI") : `🟦 P2${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}`;
      els.head.innerHTML =
        `<div class="rps2-pinfo p1"><span>🟥 P1${me === 0 || ctx.vsAI ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${score[0]}</b>${chargeBar(0)}</div>` +
        `<div class="rps2-goal">${ctx.t("đua tới", "to")} ${WIN_ROUNDS}</div>` +
        `<div class="rps2-pinfo p2"><span>${p2label}</span><b>${score[1]}</b>${chargeBar(1)}</div>`;

      if (lastResult && (revealing || bothPicked())) {
        const { a, b, winner } = lastResult;
        const nm = (window.I18n && I18n.getLang() === "en") ? NAME_EN : NAME_VI;
        const pname = (s) => ctx.vsAI ? (s === 0 ? ctx.t("Bạn", "You") : ctx.t("Máy", "AI")) : "P" + (s + 1);
        const verdict = winner < 0
          ? ctx.t(`Cả hai ra ${nm[a]} — hòa vòng!`, `Both played ${nm[a]} — tie!`)
          : ctx.t(`${pname(winner)} thắng vòng với ${nm[winner === 0 ? a : b]}!`, `${pname(winner)} wins with ${nm[winner === 0 ? a : b]}!`);
        els.reveal.innerHTML =
          `<div class="rps2-cards">` +
            `<span class="rps2-card p1${winner === 0 ? " win" : ""}">${ICON[a]}</span>` +
            `<span class="rps2-vs">vs</span>` +
            `<span class="rps2-card p2${winner === 1 ? " win" : ""}">${ICON[b]}</span>` +
          `</div><div class="rps2-verdict">${verdict}</div>`;
      } else {
        els.reveal.innerHTML = `<div class="rps2-hint">${ctx.t("Búa>Kéo, Kéo>Bao, Bao>Búa. 💥 Đại bác (sạc đủ 3) thắng mọi nước thường — nhưng Bao ✋ nuốt được Đại bác!", "Rock>Scissors>Paper>Rock. 💥 Cannon (needs 3 charge) beats normal moves — but Paper ✋ eats the Cannon!")}</div>`;
      }
      renderPicker();
    }

    function renderPicker() {
      if (over) { els.pickWrap.innerHTML = `<div class="rps2-over">${ctx.t("Ván đã kết thúc.", "Game over.")}</div>`; return; }
      if (revealing) { els.pickWrap.innerHTML = ""; return; }

      let label, seat;
      if (ctx.isOnline) {
        seat = ctx.mySeat;
        if (picks[seat] != null) { els.pickWrap.innerHTML = `<div class="rps2-waitpick">${ctx.t("Đã chọn — chờ đối thủ...", "Chosen — waiting...")}</div>`; return; }
        label = ctx.t("Lựa chọn của bạn:", "Your choice:");
      } else if (ctx.vsAI) {
        seat = 0;
        if (picks[0] != null) { els.pickWrap.innerHTML = `<div class="rps2-waitpick">${ctx.t("Đã chọn — máy đang nghĩ...", "Chosen — computer is thinking...")}</div>`; return; }
        label = ctx.t("Lựa chọn của bạn:", "Your choice:");
      } else {
        seat = picks[0] == null ? 0 : 1;
        label = ctx.t(`Người chơi ${seat + 1} chọn (che màn!):`, `Player ${seat + 1} choose (hide screen!):`);
      }
      const cannonOk = canCannon(seat);
      els.pickWrap.innerHTML =
        `<div class="rps2-picklabel">${label}</div>` +
        `<div class="rps2-btns">` +
          `<button type="button" class="btn rps2-mv" data-c="R">✊</button>` +
          `<button type="button" class="btn rps2-mv" data-c="S">✌️</button>` +
          `<button type="button" class="btn rps2-mv" data-c="P">✋</button>` +
          `<button type="button" class="btn rps2-mv rps2-cannon${cannonOk ? "" : " disabled"}" data-c="X">💥</button>` +
        `</div>` +
        `<div class="rps2-cannote">${cannonOk ? ctx.t("💥 Đại bác sẵn sàng!", "💥 Cannon ready!") : ctx.t(`💥 cần sạc đủ ${CHARGE_NEED} (đang ${charge[seat]})`, `💥 needs ${CHARGE_NEED} charge (have ${charge[seat]})`)}</div>`;
      els.pickWrap.querySelectorAll(".rps2-mv").forEach((b) => {
        b.addEventListener("click", () => {
          if (b.dataset.c === "X" && !cannonOk) return;
          applyMove({ k: "pick", c: b.dataset.c }, false);
        });
      });
    }

    function updateStatus() {
      if (over || revealing) return;
      if (ctx.isOnline) {
        ctx.setStatus(picks[ctx.mySeat] != null
          ? ctx.t("Đã chọn — chờ lật.", "Chosen — waiting to reveal.")
          : ctx.t("Bí mật chọn nước đi của bạn.", "Secretly choose your move."));
      } else if (ctx.vsAI) {
        ctx.setStatus(picks[0] != null
          ? ctx.t("Đã chọn — máy đang nghĩ...", "Chosen — computer is thinking...")
          : ctx.t("Chọn nước đi của bạn.", "Choose your move."));
      } else {
        const cur = picks[0] == null ? 0 : 1;
        ctx.setStatus(ctx.t(`Người chơi ${cur + 1}: chọn (giữ bí mật).`, `Player ${cur + 1}: choose (keep it secret).`));
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
    id: "rpsplus",
    name: "Oẳn Tù Tì Nâng Cao",
    emoji: "✊",
    description: "Kéo-búa-bao có thêm chiêu 💥 Đại bác sạc đủ mới dùng — nhưng Bao nuốt được Đại bác.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "rounds", label: "Số vòng để thắng", default: 5,
        choices: [
          { value: 3, label: "3 (nhanh)" },
          { value: 5, label: "5" },
          { value: 7, label: "7 (dài)" },
        ],
      },
    ],
    howTo: [
      "Mỗi vòng cả hai bí mật chọn rồi lật cùng lúc. Luật thường: ✊ Búa thắng ✌️ Kéo, Kéo thắng ✋ Bao, Bao thắng Búa.",
      "Mỗi vòng bạn được +1 SẠC cho chiêu đặc biệt (tối đa 3). Khi đủ 3 sạc, có thể tung 💥 ĐẠI BÁC.",
      "Đại bác THẮNG mọi nước thường (Búa/Kéo/Bao) — đòn kết liễu mạnh. Dùng xong mất hết sạc.",
      "NHƯNG: nếu đối thủ ra ✋ Bao đúng lúc bạn tung Đại bác thì Bao 'nuốt' Đại bác (Bao thắng). Hai Đại bác gặp nhau thì hòa.",
      "Đoán ý đối thủ: họ sắp tung Đại bác? Ra Bao để phản đòn. Họ sợ Bao? Cứ ra nước thường.",
      "Người đầu tiên thắng đủ số vòng đã chọn sẽ vô địch. Chơi chung máy, đấu máy, hoặc online.",
    ],
    create,
  });
})();
