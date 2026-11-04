/* 20 Câu Hỏi (Twenty Questions) — chơi chung máy & ONLINE
   Một người GIỮ BÍ MẬT nghĩ ra một "vật" và chọn chủ đề. Người kia ĐOÁN bằng cách
   đặt tối đa 20 câu hỏi Có/Không; người giữ bí mật bấm trả lời. Đoán đúng trong
   20 câu → người đoán thắng; hết câu mà chưa ra → người giữ bí mật thắng.

   Đồng bộ online: chỉ gửi hành động công khai (sẵn sàng + chủ đề, câu hỏi, câu trả
   lời, lời đoán, phán quyết) qua relay. "Vật" bí mật chỉ nằm ở máy người giữ cho
   tới khi lật ở phán quyết — nên đối thủ không thể thấy trước. */
(function () {
  const ANS = { yes: "✅", no: "❌", maybe: "🤔", na: "🚫" };
  const MAX_Q = 20;

  const CATS_VI = ["Động vật", "Đồ vật", "Người/Nhân vật", "Địa điểm", "Thức ăn", "Tự do"];
  const CATS_EN = ["Animal", "Object", "Person/Character", "Place", "Food", "Anything"];

  function create(ctx) {
    const o = ctx.options || {};
    const LIMIT = o.limit ? Number(o.limit) : MAX_Q;

    // keeper = người giữ bí mật; guesser = người đoán. Vai do người chơi TỰ CHỌN
    // ở đầu mỗi ván (phase "role") nên có thể trao quyền tự do, không cố định.
    let keeper = ctx.isOnline ? ctx.firstSeat : 0;
    let guesser = 1 - keeper;

    let phase = "role";    // role | setup | ask | answer | verdict | over
    let myWord = "";       // chỉ lưu ở máy keeper
    let category = -1;
    let asked = 0;
    let pending = null;     // câu hỏi đang chờ trả lời {text}
    let log = [];           // [{q, a}] lịch sử
    let over = false;
    let revealWord = "";

    const root = document.createElement("div");
    root.className = "tq-root";
    ctx.boardEl.appendChild(root);
    let els = null;

    function iAmKeeper() { return ctx.isOnline ? ctx.mySeat === keeper : true; }
    // Trong chế độ chung máy, cả hai vai do người trước màn hình đảm nhận luân phiên.
    function localSeatActing() {
      // ai đang cần thao tác (để chung máy hiển thị đúng panel)
      if (phase === "role") return -1;
      if (phase === "setup") return keeper;
      if (phase === "ask") return guesser;
      if (phase === "answer") return keeper;
      return -1;
    }

    function catName(i) {
      if (i < 0) return "";
      return ctx.t(CATS_VI[i], CATS_EN[i]);
    }

    // ---- Hành động đồng bộ ----
    // setup: { k:"setup", cat }       (từ bí mật KHÔNG gửi đi)
    // ask:   { k:"ask", text }
    // answer:{ k:"answer", a }        a ∈ yes/no/maybe/na
    // guess: { k:"guess", text }      lời đoán cuối (người đoán nghĩ đã ra)
    // verdict:{ k:"verdict", correct, word }  keeper phán quyết + lật từ
    function applyMove(move, fromRemote) {
      if (over && move.k !== "verdict") return;
      switch (move.k) {
        case "role": {
          if (phase !== "role") return;
          keeper = Number(move.keeper) === 1 ? 1 : 0;
          guesser = 1 - keeper;
          phase = "setup";
          if (!fromRemote) ctx.sendMove({ k: "role", keeper });
          ctx.sound("place");
          render(); updateStatus();
          break;
        }
        case "setup": {
          category = Number(move.cat);
          phase = "ask";
          if (!fromRemote) ctx.sendMove({ k: "setup", cat: category });
          ctx.sound("place");
          render(); updateStatus();
          break;
        }
        case "ask": {
          if (phase !== "ask") return;
          pending = { text: String(move.text || "").slice(0, 120) };
          phase = "answer";
          if (!fromRemote) ctx.sendMove({ k: "ask", text: pending.text });
          ctx.sound("place");
          render(); updateStatus();
          break;
        }
        case "answer": {
          if (phase !== "answer" || !pending) return;
          const a = ["yes", "no", "maybe", "na"].includes(move.a) ? move.a : "maybe";
          if (a !== "na") asked++;
          log.push({ q: pending.text, a });
          pending = null;
          phase = "ask";
          if (!fromRemote) ctx.sendMove({ k: "answer", a });
          ctx.sound("place");
          if (asked >= LIMIT) {
            // hết lượt hỏi -> người giữ bí mật thắng (người đoán phải đoán ngay nếu muốn)
            phase = "ask"; // vẫn cho 1 lời đoán cuối
          }
          render(); updateStatus();
          break;
        }
        case "fix": {
          // Người giữ bí mật sửa lại câu trả lời GẦN NHẤT nếu lỡ bấm sai.
          if (!log.length) return;
          const a = ["yes", "no", "maybe", "na"].includes(move.a) ? move.a : "maybe";
          const last = log[log.length - 1];
          const old = last.a;
          if (old === a) return;
          if (old !== "na" && a === "na") asked = Math.max(0, asked - 1);
          else if (old === "na" && a !== "na") asked++;
          last.a = a;
          if (!fromRemote) ctx.sendMove({ k: "fix", a });
          ctx.sound("place");
          render(); updateStatus();
          break;
        }
        case "guess": {
          if (over) return;
          pending = { guess: String(move.text || "").slice(0, 120) };
          phase = "verdict";
          if (!fromRemote) ctx.sendMove({ k: "guess", text: pending.guess });
          ctx.sound("notify");
          render(); updateStatus();
          break;
        }
        case "verdict": {
          const correct = !!move.correct;
          revealWord = String(move.word || "").slice(0, 80);
          if (!fromRemote) ctx.sendMove({ k: "verdict", correct, word: revealWord });
          finish(correct ? guesser : keeper, correct);
          break;
        }
      }
    }

    function finish(win, correct) {
      over = true;
      phase = "over";
      ctx.incScore(win);
      ctx.setTurn(-1);
      ctx.sound(win === guesser ? "win" : "lose");
      render(true);
      const wordTxt = revealWord ? ` (${revealWord})` : "";
      if (correct) {
        ctx.setStatus(ctx.t(`🎉 Người đoán (P${guesser + 1}) đoán ĐÚNG sau ${asked} câu hỏi${wordTxt} — thắng!`,
          `🎉 The guesser (P${guesser + 1}) got it in ${asked} questions${wordTxt} — wins!`));
      } else {
        ctx.setStatus(ctx.t(`🛡️ Người giữ bí mật (P${keeper + 1}) thắng — đối thủ đoán sai${wordTxt}!`,
          `🛡️ The keeper (P${keeper + 1}) wins — wrong guess${wordTxt}!`));
      }
    }

    // ---- Giao diện ----
    function buildShell() {
      root.innerHTML =
        `<div class="tq-top"><div class="tq-counter" id="tqCount"></div><div class="tq-roles" id="tqRoles"></div></div>` +
        `<div class="tq-log" id="tqLog"></div>` +
        `<div class="tq-panel" id="tqPanel"></div>`;
      els = { count: root.querySelector("#tqCount"), roles: root.querySelector("#tqRoles"), log: root.querySelector("#tqLog"), panel: root.querySelector("#tqPanel") };
    }

    function render(revealAll) {
      if (!els) buildShell();
      const left = Math.max(0, LIMIT - asked);
      els.count.innerHTML = `<span class="tq-num">${left}</span><span class="tq-num-lbl">${ctx.t("câu hỏi còn lại", "questions left")}</span>`;
      els.count.classList.toggle("low", left <= 5);

      const meRole = ctx.isOnline ? (ctx.mySeat === keeper ? ctx.t("Bạn GIỮ bí mật", "You KEEP the secret") : ctx.t("Bạn ĐOÁN", "You GUESS")) : "";
      if (phase === "role") {
        els.roles.innerHTML = `<span class="tq-role">${ctx.t("Đang chọn vai...", "Choosing roles...")}</span>`;
      } else {
        els.roles.innerHTML = ctx.isOnline
          ? `<span class="tq-role">${meRole}</span>`
          : `<span class="tq-role">🔒 P${keeper + 1} ${ctx.t("giữ bí mật", "keeps secret")} · 🔍 P${guesser + 1} ${ctx.t("đoán", "guesses")}</span>`;
        if (category >= 0) els.roles.innerHTML += `<span class="tq-cat">${ctx.t("Chủ đề", "Category")}: <b>${catName(category)}</b></span>`;
      }

      // nhật ký hỏi đáp
      els.log.innerHTML = log.length
        ? log.map((e, i) => `<div class="tq-qa tq-row-${e.a}"><span class="tq-qn">${i + 1}</span><span class="tq-q">${escapeHtml(e.q)}</span><span class="tq-a tq-a-${e.a}">${ANS[e.a]}</span></div>`).join("")
        : `<div class="tq-empty">${ctx.t("Chưa có câu hỏi nào. Người đoán bắt đầu hỏi!", "No questions yet. The guesser starts asking!")}</div>`;
      els.log.scrollTop = els.log.scrollHeight;

      renderPanel(revealAll);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderPanel(revealAll) {
      const p = els.panel;
      if (over) {
        p.innerHTML = `<div class="tq-over">${revealWord ? ctx.t(`Đáp án: <b>${escapeHtml(revealWord)}</b>`, `Answer: <b>${escapeHtml(revealWord)}</b>`) : ctx.t("Ván đã kết thúc.", "Game over.")}</div>`;
        return;
      }

      // ROLE: chọn ai giữ bí mật / ai đoán (trao quyền tự do)
      if (phase === "role") {
        if (ctx.isOnline) {
          p.innerHTML =
            `<div class="tq-role-pick">` +
              `<div class="tq-hint">${ctx.t("Chọn vai của bạn cho ván này:", "Pick your role for this round:")}</div>` +
              `<div class="tq-rolebtns">` +
                `<button type="button" class="btn primary tq-rb" data-keep="me">🔒 ${ctx.t("Tôi giữ bí mật", "I'll keep the secret")}</button>` +
                `<button type="button" class="btn tq-rb" data-keep="opp">🔍 ${ctx.t("Tôi đoán", "I'll guess")}</button>` +
              `</div>` +
              `<div class="tq-note">${ctx.t("Ai bấm trước sẽ quyết định. Mỗi ván có thể đổi vai thoải mái.", "Whoever taps first decides. You can freely swap roles each round.")}</div>` +
            `</div>`;
          p.querySelectorAll(".tq-rb").forEach((b) => {
            b.addEventListener("click", () => {
              const k = b.dataset.keep === "me" ? ctx.mySeat : (1 - ctx.mySeat);
              applyMove({ k: "role", keeper: k }, false);
            });
          });
        } else {
          p.innerHTML =
            `<div class="tq-role-pick">` +
              `<div class="tq-hint">${ctx.t("Ai sẽ GIỮ BÍ MẬT ván này? (người kia sẽ đoán)", "Who KEEPS the secret this round? (the other guesses)")}</div>` +
              `<div class="tq-rolebtns">` +
                `<button type="button" class="btn primary tq-rb" data-keep="0">🔒 ${ctx.t("Người 1 giữ", "Player 1 keeps")}</button>` +
                `<button type="button" class="btn primary tq-rb" data-keep="1">🔒 ${ctx.t("Người 2 giữ", "Player 2 keeps")}</button>` +
              `</div>` +
            `</div>`;
          p.querySelectorAll(".tq-rb").forEach((b) => {
            b.addEventListener("click", () => applyMove({ k: "role", keeper: Number(b.dataset.keep) }, false));
          });
        }
        return;
      }

      // SETUP: keeper nhập từ bí mật + chọn chủ đề
      if (phase === "setup") {
        if (iAmKeeper()) {
          let cats = "";
          CATS_VI.forEach((_, i) => { cats += `<button type="button" class="tq-catbtn${i === category ? " on" : ""}" data-cat="${i}">${catName(i)}</button>`; });
          p.innerHTML =
            `<div class="tq-setup">` +
              `<div class="tq-hint">${ctx.t("Bạn là người GIỮ BÍ MẬT. Nghĩ ra một thứ, gõ vào (đối thủ KHÔNG thấy), chọn chủ đề rồi bắt đầu.", "You KEEP the secret. Think of something, type it (hidden from the opponent), pick a category, then start.")}</div>` +
              `<input class="tq-word" id="tqWord" maxlength="60" placeholder="${ctx.t("Ví dụ: con mèo, tháp Eiffel...", "e.g. a cat, Eiffel Tower...")}" autocomplete="off" />` +
              `<div class="tq-cats">${cats}</div>` +
              `<button type="button" class="btn primary tq-start disabled">${ctx.t("🔒 Giấu & bắt đầu", "🔒 Hide & start")}</button>` +
            `</div>`;
          wireSetup();
        } else {
          p.innerHTML = `<div class="tq-wait">${ctx.t("Đối thủ đang nghĩ ra một thứ bí mật...", "Opponent is thinking of a secret...")}</div>`;
        }
        return;
      }

      // ASK: guesser gõ câu hỏi Có/Không, hoặc bấm "Tôi đoán ra rồi"
      if (phase === "ask") {
        // ONLINE — người GIỮ bí mật đang chờ: cho phép sửa lại câu trả lời vừa rồi
        if (ctx.isOnline && ctx.mySeat === keeper) {
          p.innerHTML = `<div class="tq-wait">${ctx.t("Đối thủ đang nghĩ câu hỏi...", "Opponent is thinking of a question...")}</div>` + fixMarkup();
          wireFix();
          return;
        }
        // NGƯỜI ĐOÁN (online) hoặc CHUNG MÁY: ô đặt câu hỏi
        const canFinalGuess = log.length > 0;
        let html =
          `<div class="tq-ask">` +
            `<div class="tq-hint">${ctx.t("Đặt câu hỏi CÓ/KHÔNG để thu hẹp dần. Khi tự tin, bấm \"Tôi đoán ra rồi!\".", "Ask YES/NO questions to narrow it down. When confident, hit \"I know it!\".")}</div>` +
            `<div class="tq-askrow"><input class="tq-qin" id="tqQ" maxlength="120" placeholder="${ctx.t("Nó có sống được không? ...", "Is it alive? ...")}" autocomplete="off" />` +
            `<button type="button" class="btn primary tq-send">${ctx.t("Hỏi", "Ask")}</button></div>` +
            `<button type="button" class="btn tq-final${canFinalGuess ? "" : " disabled"}">${ctx.t("💡 Tôi đoán ra rồi!", "💡 I know it!")}</button>` +
          `</div>`;
        // Chung máy: người giữ bí mật cũng sửa được câu trả lời vừa rồi
        if (!ctx.isOnline) html += fixMarkup();
        p.innerHTML = html;
        wireAsk();
        if (!ctx.isOnline) wireFix();
        return;
      }

      // ANSWER: keeper trả lời câu hỏi đang chờ
      if (phase === "answer") {
        if (iAmKeeper()) {
          p.innerHTML =
            `<div class="tq-answer">` +
              `<div class="tq-pending">"${escapeHtml(pending ? pending.text : "")}"</div>` +
              `<div class="tq-ansbtns">` +
                `<button type="button" class="btn tq-ans" data-a="yes">✅ ${ctx.t("Có", "Yes")}</button>` +
                `<button type="button" class="btn tq-ans" data-a="no">❌ ${ctx.t("Không", "No")}</button>` +
                `<button type="button" class="btn tq-ans" data-a="maybe">🤔 ${ctx.t("Tùy/Không rõ", "Sort of")}</button>` +
                `<button type="button" class="btn tq-ans" data-a="na">🚫 ${ctx.t("Không tính", "Skip")}</button>` +
              `</div>` +
              `<div class="tq-note">${ctx.t("🚫 Không tính: câu hỏi không hợp lệ, không trừ lượt.", "🚫 Skip: invalid question, doesn't use a turn.")}</div>` +
            `</div>`;
          wireAnswer();
        } else {
          p.innerHTML = `<div class="tq-wait">${ctx.t("Đối thủ đang trả lời...", "Opponent is answering...")}</div>` +
            (pending ? `<div class="tq-pending small">"${escapeHtml(pending.text)}"</div>` : "");
        }
        return;
      }

      // VERDICT: keeper xác nhận lời đoán cuối đúng/sai
      if (phase === "verdict") {
        const guessText = pending && pending.guess ? pending.guess : "";
        if (iAmKeeper()) {
          p.innerHTML =
            `<div class="tq-verdict">` +
              `<div class="tq-hint">${ctx.t("Đối thủ đoán:", "Opponent guesses:")}</div>` +
              `<div class="tq-guesstext">“${escapeHtml(guessText)}”</div>` +
              `<div class="tq-ansbtns">` +
                `<button type="button" class="btn primary tq-vd" data-c="1">✅ ${ctx.t("Đúng!", "Correct!")}</button>` +
                `<button type="button" class="btn tq-vd" data-c="0">❌ ${ctx.t("Sai", "Wrong")}</button>` +
              `</div>` +
            `</div>`;
          wireVerdict(guessText);
        } else {
          p.innerHTML = `<div class="tq-wait">${ctx.t("Bạn đã đoán:", "You guessed:")} <b>“${escapeHtml(guessText)}”</b><br>${ctx.t("Chờ đối thủ xác nhận...", "Waiting for confirmation...")}</div>`;
        }
        return;
      }
      p.innerHTML = "";
    }

    function wireSetup() {
      const wordEl = els.panel.querySelector("#tqWord");
      const startBtn = els.panel.querySelector(".tq-start");
      function refresh() {
        const ok = wordEl.value.trim().length > 0 && category >= 0;
        startBtn.classList.toggle("disabled", !ok);
      }
      wordEl.addEventListener("input", refresh);
      els.panel.querySelectorAll(".tq-catbtn").forEach((b) => {
        b.addEventListener("click", () => {
          category = Number(b.dataset.cat);
          els.panel.querySelectorAll(".tq-catbtn").forEach((x) => x.classList.toggle("on", x === b));
          refresh();
        });
      });
      startBtn.addEventListener("click", () => {
        const w = wordEl.value.trim();
        if (!w || category < 0) return;
        myWord = w; // lưu cục bộ ở máy keeper
        applyMove({ k: "setup", cat: category }, false);
      });
    }

    function fixMarkup() {
      if (!log.length || over) return "";
      const last = log[log.length - 1];
      return `<div class="tq-fix" id="tqFix">` +
        `<button type="button" class="tq-fixtoggle">✏️ ${ctx.t("Sửa câu trả lời vừa rồi", "Fix last answer")} <span class="tq-fixcur">${ANS[last.a]}</span></button>` +
        `<div class="tq-fixbtns" hidden>` +
          `<button type="button" class="btn tq-fixans" data-a="yes">✅ ${ctx.t("Có", "Yes")}</button>` +
          `<button type="button" class="btn tq-fixans" data-a="no">❌ ${ctx.t("Không", "No")}</button>` +
          `<button type="button" class="btn tq-fixans" data-a="maybe">🤔 ${ctx.t("Tùy", "Sort of")}</button>` +
          `<button type="button" class="btn tq-fixans" data-a="na">🚫 ${ctx.t("Không tính", "Skip")}</button>` +
        `</div></div>`;
    }

    function wireFix() {
      const box = els.panel.querySelector("#tqFix");
      if (!box) return;
      const toggle = box.querySelector(".tq-fixtoggle");
      const btns = box.querySelector(".tq-fixbtns");
      toggle.addEventListener("click", () => { btns.hidden = !btns.hidden; });
      box.querySelectorAll(".tq-fixans").forEach((b) => {
        b.addEventListener("click", () => applyMove({ k: "fix", a: b.dataset.a }, false));
      });
    }

    function wireAsk() {
      const qEl = els.panel.querySelector("#tqQ");
      const send = els.panel.querySelector(".tq-send");
      const fin = els.panel.querySelector(".tq-final");
      function doAsk() {
        const t = qEl.value.trim();
        if (!t) return;
        applyMove({ k: "ask", text: t }, false);
      }
      send.addEventListener("click", doAsk);
      qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doAsk(); } });
      if (fin) fin.addEventListener("click", () => {
        if (!log.length) return;
        const g = prompt(ctx.t("Bạn đoán đó là gì?", "What's your guess?"));
        if (g && g.trim()) applyMove({ k: "guess", text: g.trim() }, false);
      });
    }

    function wireAnswer() {
      els.panel.querySelectorAll(".tq-ans").forEach((b) => {
        b.addEventListener("click", () => applyMove({ k: "answer", a: b.dataset.a }, false));
      });
    }

    function wireVerdict(guessText) {
      els.panel.querySelectorAll(".tq-vd").forEach((b) => {
        b.addEventListener("click", () => {
          const correct = b.dataset.c === "1";
          // keeper lật từ bí mật của mình
          applyMove({ k: "verdict", correct, word: myWord || guessText }, false);
        });
      });
    }

    function updateStatus() {
      if (over) return;
      const acting = ctx.isOnline ? null : localSeatActing();
      let msg;
      if (phase === "role") msg = ctx.t("Chọn vai: ai giữ bí mật, ai đoán.", "Pick roles: who keeps the secret and who guesses.");
      else if (phase === "setup") msg = ctx.t("Người giữ bí mật: nghĩ ra một thứ và chọn chủ đề.", "Keeper: think of something and pick a category.");
      else if (phase === "ask") msg = ctx.t("Người đoán: đặt câu hỏi Có/Không, hoặc bấm 'Tôi đoán ra rồi!'.", "Guesser: ask a Yes/No question, or hit 'I know it!'.");
      else if (phase === "answer") msg = ctx.t("Người giữ bí mật: trả lời câu hỏi.", "Keeper: answer the question.");
      else if (phase === "verdict") msg = ctx.t("Người giữ bí mật: xác nhận lời đoán đúng hay sai.", "Keeper: confirm if the guess is right.");
      if (!ctx.isOnline && acting >= 0) msg = ctx.t(`(Chuyền máy cho P${acting + 1}) `, `(Pass device to P${acting + 1}) `) + msg;
      ctx.setStatus(msg);
    }

    buildShell();
    ctx.setTurn(-1);
    render();
    updateStatus();

    function destroy() {}
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "twentyquestions",
    name: "20 Câu Hỏi",
    emoji: "❓",
    description: "Một người giữ bí mật, người kia hỏi tối đa 20 câu Có/Không để đoán ra.",
    onlineReady: true,
    supportsAI: false,
    options: [
      {
        id: "limit", label: "Số câu hỏi tối đa", default: 20,
        choices: [
          { value: 10, label: "10 (nhanh)" },
          { value: 20, label: "20 (chuẩn)" },
          { value: 30, label: "30 (dễ cho người đoán)" },
        ],
      },
    ],
    howTo: [
      "Đầu mỗi ván, hai bên TỰ CHỌN vai: ai giữ bí mật, ai đoán — trao quyền thoải mái, không cố định người nào. Ván sau có thể đổi vai.",
      "Một người là NGƯỜI GIỮ BÍ MẬT: nghĩ ra một thứ (con vật, đồ vật, người, địa điểm...), gõ vào máy (đối thủ không thấy) và chọn chủ đề gợi ý.",
      "Người còn lại là NGƯỜI ĐOÁN: lần lượt đặt các câu hỏi mà chỉ trả lời được bằng CÓ / KHÔNG để thu hẹp dần.",
      "Người giữ bí mật bấm trả lời: ✅ Có, ❌ Không, 🤔 Tùy/Không rõ, hoặc 🚫 Không tính (câu hỏi không hợp lệ — không trừ lượt).",
      "Lỡ bấm sai? Sau khi trả lời, người giữ bí mật có nút '✏️ Sửa câu trả lời vừa rồi' để đổi lại câu trả lời gần nhất (đồng bộ cả khi chơi online).",
      "Khi tự tin, người đoán bấm '💡 Tôi đoán ra rồi!' và nhập đáp án; người giữ bí mật xác nhận đúng/sai.",
      "Đoán đúng trong số câu cho phép → NGƯỜI ĐOÁN thắng. Dùng hết câu hỏi mà chưa đoán ra (hoặc đoán sai) → NGƯỜI GIỮ BÍ MẬT thắng.",
      "Chơi online là tuyệt nhất: mỗi người ngồi một máy, từ bí mật được giấu cho tới khi lật. Chơi chung máy thì chuyền máy qua lại theo gợi ý trên màn.",
    ],
    create,
  });
})();
