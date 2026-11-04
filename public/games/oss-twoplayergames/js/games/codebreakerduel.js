/* Phá Mã Đối Kháng (Codebreaker Duel / Mastermind) — chung máy, ĐẤU MÁY, ONLINE
   Mỗi người có một MÃ BÍ MẬT (dãy màu). Thay nhau ĐOÁN mã của ĐỐI THỦ.
   Sau mỗi lần đoán nhận phản hồi: ● = đúng màu + đúng vị trí, ○ = đúng màu sai vị trí.
   Ai phá được mã của đối thủ (toàn ●) trước sẽ THẮNG.

   Đồng bộ online: hai mã bí mật sinh tất định từ ctx.rng (chung seed) nên hai máy
   giống hệt; chỉ gửi nước ĐOÁN công khai qua relay. UI giấu mã đối thủ theo mySeat. */
(function () {
  const COLORS = ["#ff5d73", "#ffd166", "#6ee7b7", "#4dd0e1", "#c792ea", "#ff9f7a", "#9bd86d", "#f7a8c8"];
  const GLYPH = ["🔴", "🟡", "🟢", "🔵", "🟣", "🟠", "🫒", "🌸"];

  function create(ctx) {
    const o = ctx.options || {};
    const LEN = o.len ? Number(o.len) : 4;
    const PALETTE = o.colors ? Number(o.colors) : 6;
    const DUP = o.dup !== "off"; // cho phép màu lặp

    const seat0First = ctx.isOnline ? ctx.firstSeat : 0;

    function makeCode() {
      const code = [];
      if (DUP) {
        for (let i = 0; i < LEN; i++) code.push(Math.floor(ctx.rng() * PALETTE));
      } else {
        const pool = [];
        for (let i = 0; i < PALETTE; i++) pool.push(i);
        for (let i = 0; i < LEN; i++) {
          const j = Math.floor(ctx.rng() * pool.length);
          code.push(pool.splice(j, 1)[0]);
        }
      }
      return code;
    }

    // secret[p] = mã của người p (đối thủ sẽ đoán)
    const secret = [makeCode(), makeCode()];
    const guesses = [[], []]; // lịch sử đoán của mỗi người (đoán mã đối thủ)
    let turn = seat0First;
    let over = false;

    const root = document.createElement("div");
    root.className = "cb2-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    // tính phản hồi: {exact: ●, color: ○}
    function feedback(code, guess) {
      let exact = 0, color = 0;
      const cRest = [], gRest = [];
      for (let i = 0; i < LEN; i++) {
        if (guess[i] === code[i]) exact++;
        else { cRest.push(code[i]); gRest.push(guess[i]); }
      }
      const pool = {};
      cRest.forEach((c) => (pool[c] = (pool[c] || 0) + 1));
      gRest.forEach((g) => { if (pool[g] > 0) { color++; pool[g]--; } });
      return { exact, color };
    }

    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function mySeatIdx() { return ctx.isOnline ? ctx.mySeat : turn; }

    // nước đoán: { k:"guess", code:[...] } — người 'turn' đoán mã của đối thủ
    function applyMove(move, fromRemote) {
      if (over || move.k !== "guess") return;
      const guess = move.code.map(Number);
      if (guess.length !== LEN || guess.some((c) => c < 0 || c >= PALETTE)) return;
      if (!fromRemote) ctx.sendMove({ k: "guess", code: guess });

      const guesser = turn;
      const target = secret[1 - guesser];
      const fb = feedback(target, guess);
      guesses[guesser].push({ code: guess, fb });
      ctx.sound(fb.exact === LEN ? "win" : "place");

      if (fb.exact === LEN) {
        over = true;
        ctx.incScore(guesser);
        ctx.setTurn(-1);
        render(true);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${guesser + 1} phá được mã trong ${guesses[guesser].length} lượt — thắng!`,
          `🎉 Player ${guesser + 1} cracked the code in ${guesses[guesser].length} guesses — wins!`));
        return;
      }
      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    // ----- AI: lọc tập ứng viên còn nhất quán với các phản hồi đã có -----
    let aiCandidates = null;
    function allCodes() {
      const out = [];
      const cur = new Array(LEN).fill(0);
      function rec(pos) {
        if (pos === LEN) {
          if (DUP || new Set(cur).size === LEN) out.push(cur.slice());
          return;
        }
        for (let c = 0; c < PALETTE; c++) { cur[pos] = c; rec(pos + 1); }
      }
      rec(0);
      return out;
    }
    function aiMove() {
      if (over) return null;
      const me = turn;
      const myGuesses = guesses[me];
      if (!aiCandidates) aiCandidates = allCodes();
      // lọc theo phản hồi gần nhất
      if (myGuesses.length) {
        const last = myGuesses[myGuesses.length - 1];
        aiCandidates = aiCandidates.filter((cand) => {
          const fb = feedback(cand, last.code);
          return fb.exact === last.fb.exact && fb.color === last.fb.color;
        });
      }
      if (!aiCandidates.length) { // an toàn: đoán ngẫu nhiên
        const g = []; for (let i = 0; i < LEN; i++) g.push(Math.floor(ctx.rng() * PALETTE));
        return { k: "guess", code: g };
      }
      const pick = aiCandidates[Math.floor(Math.random() * aiCandidates.length)];
      return { k: "guess", code: pick.slice() };
    }

    // ----- Giao diện -----
    function buildShell() {
      root.innerHTML =
        `<div class="cb2-head" id="cb2Head"></div>` +
        `<div class="cb2-board" id="cb2Board"></div>` +
        `<div class="cb2-input" id="cb2Input"></div>`;
      els = {
        head: root.querySelector("#cb2Head"),
        board: root.querySelector("#cb2Board"),
        input: root.querySelector("#cb2Input"),
      };
    }

    function pegHtml(c) { return `<span class="cb2-peg" style="--pc:${COLORS[c]}">${GLYPH[c]}</span>`; }
    function holeHtml() { return `<span class="cb2-peg empty"></span>`; }

    function fbHtml(fb) {
      let s = "";
      for (let i = 0; i < fb.exact; i++) s += `<i class="cb2-fb exact"></i>`;
      for (let i = 0; i < fb.color; i++) s += `<i class="cb2-fb color"></i>`;
      for (let i = 0; i < LEN - fb.exact - fb.color; i++) s += `<i class="cb2-fb none"></i>`;
      return `<span class="cb2-fbs">${s}</span>`;
    }

    function render(revealAll) {
      if (!els) buildShell();
      const me = mySeatIdx();
      const opp = 1 - me;
      // tiến độ: số ● cao nhất từng đạt khi đoán mã đối thủ
      const myBest = guesses[me].reduce((mx, r) => Math.max(mx, r.fb.exact), 0);
      const oppBest = guesses[opp].reduce((mx, r) => Math.max(mx, r.fb.exact), 0);
      function pips(n) { let s = ""; for (let i = 0; i < LEN; i++) s += `<i class="cb2-pip ${i < n ? "on" : ""}"></i>`; return s; }
      els.head.innerHTML =
        `<div class="cb2-hcol ${turn === me && !over ? "active" : ""}">` +
          `<b>🔓 ${ctx.t("Bạn phá mã", "You crack")} P${opp + 1}</b>` +
          `<div class="cb2-prog">${pips(myBest)}</div>` +
          `<small>${guesses[me].length} ${ctx.t("lượt", "guesses")} · ${myBest}/${LEN} ●</small>` +
        `</div>` +
        `<div class="cb2-hcol ${turn === opp && !over ? "active" : ""}">` +
          `<b>🔒 P${opp + 1} ${ctx.t("phá mã bạn", "cracks yours")}</b>` +
          `<div class="cb2-prog">${pips(oppBest)}</div>` +
          `<small>${guesses[opp].length} ${ctx.t("lượt", "guesses")} · ${oppBest}/${LEN} ●</small>` +
        `</div>`;

      // hai cột: trái = đoán của mình (mã đối thủ), phải = đoán của đối thủ (mã mình)
      function colHtml(seat, hideTargetSecret) {
        const rows = guesses[seat];
        const list = rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          const solved = row.fb.exact === LEN;
          return `<div class="cb2-guess${isLast ? " latest" : ""}${solved ? " solved" : ""}">` +
            `<span class="cb2-gn">${idx + 1}</span>` +
            row.code.map(pegHtml).join("") + fbHtml(row.fb) + `</div>`;
        }).reverse().join("");
        const target = 1 - seat;
        const showSecret = revealAll || target === me;
        const label = seat === me ? ctx.t("Mã của đối thủ", "Opponent's code") : ctx.t("Mã của bạn", "Your code");
        const secretRow = `<div class="cb2-secret"><span class="cb2-secret-lbl">${label}</span> ${showSecret ? secret[target].map(pegHtml).join("") : secret[target].map(holeHtml).join("")}</div>`;
        const title = `<div class="cb2-coltitle">${seat === me ? ctx.t("🎯 Bạn đoán", "🎯 Your guesses") : ctx.t("👤 Đối thủ đoán", "👤 Their guesses")}</div>`;
        return `<div class="cb2-col">${title}<div class="cb2-guesses">${list || `<div class="cb2-empty">${ctx.t("Chưa có lượt đoán", "No guesses yet")}</div>`}</div>${secretRow}</div>`;
      }
      els.board.innerHTML = colHtml(me, revealAll) + colHtml(opp, revealAll);
      renderInput();
    }

    let draft = new Array(LEN).fill(-1);
    let activeSlot = 0;

    function renderInput() {
      if (over) { els.input.innerHTML = `<div class="cb2-done">${ctx.t("Ván đã kết thúc.", "Game over.")}</div>`; return; }
      if (!canPlay()) {
        els.input.innerHTML = `<div class="cb2-wait">${ctx.t("Chờ đối thủ đoán...", "Waiting for opponent...")}</div>`;
        return;
      }
      const slots = draft.map((c, i) =>
        `<button type="button" class="cb2-slot${i === activeSlot ? " on" : ""}${c < 0 ? " empty" : ""}" data-slot="${i}">${c < 0 ? "" : GLYPH[c]}</button>`
      ).join("");
      let palette = "";
      for (let c = 0; c < PALETTE; c++) palette += `<button type="button" class="cb2-pal" data-col="${c}" style="--pc:${COLORS[c]}">${GLYPH[c]}</button>`;
      const ready = draft.every((c) => c >= 0);
      const legend = `<div class="cb2-legend">` +
        `<span><i class="cb2-fb exact"></i> ${ctx.t("đúng màu + đúng chỗ", "right color + spot")}</span>` +
        `<span><i class="cb2-fb color"></i> ${ctx.t("đúng màu, sai chỗ", "right color, wrong spot")}</span>` +
        `<span><i class="cb2-fb none"></i> ${ctx.t("không có", "not in code")}</span>` +
      `</div>`;
      els.input.innerHTML =
        `<div class="cb2-buildlabel">${ctx.t("Chọn màu cho từng ô rồi bấm Đoán", "Fill each slot then press Guess")}</div>` +
        `<div class="cb2-slots">${slots}</div>` +
        `<div class="cb2-palette">${palette}</div>` +
        `<div class="cb2-acts">` +
          `<button type="button" class="btn cb2-clear">${ctx.t("↺ Xóa", "↺ Clear")}</button>` +
          `<button type="button" class="btn primary cb2-go${ready ? "" : " disabled"}">${ctx.t("🔍 Đoán", "🔍 Guess")}</button>` +
        `</div>` +
        legend;
      wireInput();
    }

    function wireInput() {
      els.input.querySelectorAll(".cb2-slot").forEach((b) => {
        b.addEventListener("click", () => { activeSlot = Number(b.dataset.slot); renderInput(); });
      });
      els.input.querySelectorAll(".cb2-pal").forEach((b) => {
        b.addEventListener("click", () => {
          draft[activeSlot] = Number(b.dataset.col);
          activeSlot = Math.min(LEN - 1, activeSlot + (draft.includes(-1) ? 0 : 0));
          // tự nhảy sang ô trống kế tiếp
          const nextEmpty = draft.findIndex((c) => c < 0);
          if (nextEmpty >= 0) activeSlot = nextEmpty;
          renderInput();
        });
      });
      const clear = els.input.querySelector(".cb2-clear");
      if (clear) clear.addEventListener("click", () => { draft = new Array(LEN).fill(-1); activeSlot = 0; renderInput(); });
      const go = els.input.querySelector(".cb2-go");
      if (go) go.addEventListener("click", () => {
        if (draft.some((c) => c < 0)) return;
        const code = draft.slice();
        draft = new Array(LEN).fill(-1); activeSlot = 0;
        applyMove({ k: "guess", code }, false);
      });
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t("Đối thủ đang đoán...", "Opponent is guessing..."));
      else ctx.setStatus(ctx.t(`Lượt bạn: chọn ${LEN} màu rồi bấm "Đoán". ● đúng chỗ · ○ đúng màu sai chỗ.`,
        `Your turn: pick ${LEN} colors then "Guess". ● right spot · ○ right color wrong spot.`));
    }

    buildShell();
    ctx.setTurn(turn);
    render();
    updateStatus();

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "codebreakerduel",
    name: "Phá Mã Đối Kháng",
    emoji: "🧩",
    description: "Đoán mã màu bí mật của đối thủ qua các gợi ý ●/○ — ai phá mã trước thắng.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "len", label: "Độ dài mã", default: 4,
        choices: [
          { value: 3, label: "3 (dễ)" },
          { value: 4, label: "4 (chuẩn)" },
          { value: 5, label: "5 (khó)" },
        ],
      },
      {
        id: "colors", label: "Số màu", default: 6,
        choices: [
          { value: 4, label: "4 màu (dễ)" },
          { value: 6, label: "6 màu" },
          { value: 8, label: "8 màu (khó)" },
        ],
      },
      {
        id: "dup", label: "Cho phép màu lặp", default: "on",
        choices: [
          { value: "on", label: "Có (khó hơn)" },
          { value: "off", label: "Không (mỗi màu 1 lần)" },
        ],
      },
    ],
    howTo: [
      "Mỗi người có một MÃ BÍ MẬT gồm các màu (mặc định dài 4, từ 6 màu). Bạn chỉ thấy mã của chính mình.",
      "Đến lượt, bạn chọn một dãy màu để ĐOÁN mã của ĐỐI THỦ rồi bấm \"Đoán\".",
      "Sau mỗi lần đoán bạn nhận phản hồi: ● = một quân đúng MÀU và đúng VỊ TRÍ; ○ = đúng màu nhưng sai vị trí. Không có chấm nghĩa là màu đó không có trong mã.",
      "Dùng phản hồi để loại trừ dần và thu hẹp khả năng — đây là trò suy luận thuần túy.",
      "Người đầu tiên đoán đúng hoàn toàn mã của đối thủ (toàn ●) sẽ THẮNG.",
      "Tùy chọn: độ dài mã, số màu, và cho phép màu lặp hay không.",
    ],
    create,
  });
})();
