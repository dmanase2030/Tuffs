/* Đoán Chữ (Hangman) — chơi chung máy & ONLINE
   Một người đặt từ/cụm bí mật, người kia đoán từng chữ cái.
   Đoán sai quá số lần cho phép thì người đoán THUA; đoán ra hết thì THẮNG.
   Online: người ra đề giữ đáp án, KHÔNG gửi đi; chỉ gửi:
     { kind:"setword", mask } (độ dài/khoảng trắng) ,
     { kind:"guess", ch } , { kind:"result", ch, hits:[vị trí], win, lose }. */
(function () {
  const PARTS = ["đầu", "thân", "tay trái", "tay phải", "chân trái", "chân phải"];

  function stripCombining(s) {
    // bỏ dấu để ghép chữ cái cơ bản (đoán theo chữ không dấu cho dễ)
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  }

  function create(ctx) {
    const o = ctx.options || {};
    const MAX_WRONG = [4, 6, 8].includes(Number(o.lives)) ? Number(o.lives) : 6;
    let hintsLeft = o.hints === "off" ? 0 : o.hints === "many" ? 3 : 1;
    let phase = "set";  // set | play | over
    let secret = "";    // đáp án (đã chuẩn hóa hiển thị)
    let secretKey = ""; // dạng không dấu, chữ thường để so khớp
    let setterSeat = 0; // ai ra đề
    let guesserSeat = 1;
    let wrong = 0;
    const guessed = new Set();
    let revealed = [];  // mảng boolean theo từng ký tự

    const root = document.createElement("div");
    root.className = "hm-root";
    ctx.boardEl.appendChild(root);

    // ---- giai đoạn đặt từ ----
    function showSetUI(seat) {
      setterSeat = seat; guesserSeat = 1 - seat;
      root.innerHTML =
        `<div class="hm-setbox">` +
        `<h3>${ctx.t(`Người chơi ${seat + 1}: nhập từ/cụm từ bí mật để đố`, `Player ${seat + 1}: enter a secret word/phrase`)}</h3>` +
        `<input class="hm-setinput" id="hmSet" placeholder="${ctx.t("ví dụ: con mèo", "e.g. the cat")}" autocomplete="off">` +
        `<button class="btn primary" id="hmSetBtn">${ctx.t("✓ Khóa đáp án", "✓ Lock answer")}</button>` +
        `<p class="hm-err" id="hmSetErr"></p>` +
        `<p class="hm-note">${ctx.t("Đối thủ sẽ đoán từng chữ cái. Dấu cách được hiện sẵn.", "Your opponent guesses letter by letter. Spaces are shown.")}</p>` +
        `</div>`;
      const inp = root.querySelector("#hmSet");
      const btn = root.querySelector("#hmSetBtn");
      const err = root.querySelector("#hmSetErr");
      btn.addEventListener("click", () => {
        const val = inp.value.trim();
        if (val.replace(/\s/g, "").length < 2) { err.textContent = ctx.t("Cần ít nhất 2 chữ cái.", "Need at least 2 letters."); return; }
        if (!/[a-zA-ZÀ-ỹ]/.test(val)) { err.textContent = ctx.t("Phải có chữ cái.", "Must contain a letter."); return; }
        lockSecret(val);
      });
    }

    function lockSecret(val) {
      secret = val;
      secretKey = stripCombining(val).toLowerCase();
      revealed = [...secret].map((ch) => !/[a-zA-ZÀ-ỹ]/.test(ch)); // ký tự không phải chữ thì hiện luôn
      if (ctx.isOnline) {
        // gửi "mặt nạ" (độ dài & vị trí dấu cách) — KHÔNG gửi nội dung
        const mask = [...secret].map((ch) => (/\s/.test(ch) ? " " : (/[a-zA-ZÀ-ỹ]/.test(ch) ? "_" : ch)));
        ctx.sendMove({ kind: "setword", mask });
        phase = "play";
        showPlayUI(false); // mình là người ra đề -> chờ đối thủ đoán
      } else {
        phase = "play";
        showPlayUI(true);
      }
    }

    // ---- giao diện chơi ----
    function showPlayUI(localGuesses, maskFromRemote) {
      root.innerHTML =
        `<div class="hm-gallows" id="hmGallows"></div>` +
        `<div class="hm-word" id="hmWord"></div>` +
        `<div class="hm-status" id="hmWrong"></div>` +
        `<div class="hm-keys" id="hmKeys"></div>` +
        `<div class="hm-hintbar" id="hmHintBar"></div>`;
      buildKeyboard();
      buildHintBar();
      if (maskFromRemote) {
        revealed = maskFromRemote.map((c) => c !== "_");
        secretMaskLen = maskFromRemote;
      }
      renderWord();
      renderWrong();
      updateStatus();
    }

    // Gợi ý: chỉ dùng được khi chơi chung máy (người ra đề ngồi cùng máy biết đáp án).
    function buildHintBar() {
      const bar = root.querySelector("#hmHintBar");
      if (!bar) return;
      if (ctx.isOnline) { bar.classList.add("hidden"); return; }
      bar.innerHTML = `<button class="btn small hm-hint" id="hmHint"></button>`;
      const btn = bar.querySelector("#hmHint");
      btn.addEventListener("click", onHint);
      updateHintBtn();
    }
    function updateHintBtn() {
      const btn = root.querySelector("#hmHint");
      if (!btn) return;
      btn.textContent = ctx.t(`💡 Gợi ý (còn ${hintsLeft}) — lộ 1 chữ, tốn 1 lượt sai`, `💡 Hint (${hintsLeft} left) — reveal 1 letter, costs 1 wrong guess`);
      btn.disabled = phase !== "play" || hintsLeft <= 0 || wrong >= MAX_WRONG - 1;
    }
    function onHint() {
      if (phase !== "play" || hintsLeft <= 0 || ctx.isOnline) return;
      if (wrong >= MAX_WRONG - 1) return; // tránh thua vì gợi ý
      // tìm các chữ cái chưa đoán còn ẩn trong đáp án
      const candidates = new Set();
      [...secretKey].forEach((c, i) => {
        if (!revealed[i] && /[a-z]/.test(c) && !guessed.has(c)) candidates.add(c);
      });
      if (!candidates.size) return;
      const pool = [...candidates];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      hintsLeft--;
      wrong++; // chi phí: 1 lượt sai
      guessed.add(pick);
      const hits = [];
      [...secretKey].forEach((c, i) => { if (c === pick) { revealed[i] = true; hits.push(i); } });
      if (keyEls[pick]) { keyEls[pick].disabled = true; keyEls[pick].classList.add("hint-reveal"); }
      ctx.sound("notify");
      renderWord();
      renderWrong();
      updateHintBtn();
      if (revealed.every(Boolean)) return endGame(guesserSeat, ctx.t("đoán ra đáp án (có dùng gợi ý)", "guessed the answer (with a hint)"));
      if (wrong >= MAX_WRONG) return endGame(setterSeat, ctx.t("người đoán đã hết lượt sai", "guesser ran out of wrong guesses"));
      ctx.setStatus(ctx.t(`💡 Đã lộ chữ "${pick.toUpperCase()}". Còn ${MAX_WRONG - wrong} lượt sai.`,
        `💡 Revealed "${pick.toUpperCase()}". ${MAX_WRONG - wrong} wrong guesses left.`));
    }

    let secretMaskLen = null; // dùng cho phía người đoán (online) khi chưa biết đáp án

    const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");
    let keyEls = {};
    function buildKeyboard() {
      const keys = root.querySelector("#hmKeys");
      keyEls = {};
      ALPHA.forEach((ch) => {
        const b = document.createElement("button");
        b.className = "hm-key";
        b.textContent = ch.toUpperCase();
        b.addEventListener("click", () => onGuess(ch));
        keys.appendChild(b);
        keyEls[ch] = b;
      });
    }

    function iAmGuesser() {
      if (!ctx.isOnline) return true; // chung máy: người đoán thao tác trực tiếp
      return ctx.mySeat === guesserSeat;
    }

    function onGuess(ch) {
      if (phase !== "play" || guessed.has(ch)) return;
      if (!iAmGuesser()) return;
      if (ctx.isOnline) {
        ctx.sendMove({ kind: "guess", ch });
        guessed.add(ch);
        if (keyEls[ch]) keyEls[ch].disabled = true;
        ctx.setStatus(ctx.t("Đã đoán, chờ kết quả...", "Guessed, awaiting result..."));
      } else {
        resolveGuess(ch);
      }
    }

    // chung máy: tự đối chiếu
    function resolveGuess(ch) {
      guessed.add(ch);
      const hits = [];
      [...secretKey].forEach((c, i) => { if (c === ch) hits.push(i); });
      applyGuessResult(ch, hits);
    }

    function applyGuessResult(ch, hits) {
      if (keyEls[ch]) { keyEls[ch].disabled = true; keyEls[ch].classList.add(hits.length ? "hit" : "miss"); }
      if (hits.length) {
        hits.forEach((i) => { revealed[i] = true; });
        ctx.sound("capture");
      } else {
        wrong++;
        ctx.sound("error");
      }
      renderWord();
      renderWrong();
      // thắng/thua
      if (revealed.every(Boolean)) return endGame(guesserSeat, ctx.t("đoán ra đáp án", "guessed the answer"));
      if (wrong >= MAX_WRONG) return endGame(setterSeat, ctx.t("người đoán đã hết lượt sai", "guesser ran out of wrong guesses"));
      updateHintBtn();
      updateStatus();
    }

    function renderWord() {
      const wordEl = root.querySelector("#hmWord");
      if (!wordEl) return;
      let chars;
      if (!ctx.isOnline || ctx.mySeat === setterSeat) {
        // biết đáp án: hiện chữ đã lộ
        chars = [...secret].map((ch, i) => {
          if (/\s/.test(ch)) return "&nbsp;&nbsp;";
          return revealed[i] ? ch : "_";
        });
      } else {
        // người đoán online: dùng mask, lộ dần theo revealed
        chars = secretMaskLen.map((m, i) => {
          if (m === " ") return "&nbsp;&nbsp;";
          return revealed[i] && revealedChar[i] ? revealedChar[i] : (revealed[i] ? "•" : "_");
        });
      }
      wordEl.innerHTML = chars.map((c) => `<span class="hm-ch">${c}</span>`).join("");
    }
    const revealedChar = {}; // online guesser: lưu chữ đã lộ để hiện

    function renderWrong() {
      const el = root.querySelector("#hmWrong");
      if (el) el.innerHTML = ctx.t(`❌ Sai: <b>${wrong}/${MAX_WRONG}</b> `, `❌ Wrong: <b>${wrong}/${MAX_WRONG}</b> `) +
        (wrong > 0 ? `(${PARTS.slice(0, wrong).join(", ")})` : "");
      drawGallows();
    }

    function gallowsSVG() {
      return `<svg class="hm-svg" viewBox="0 0 120 152" aria-hidden="true">
        <line class="hm-struct" x1="6" y1="146" x2="80" y2="146"/>
        <line class="hm-struct" x1="26" y1="146" x2="26" y2="8"/>
        <line class="hm-struct" x1="26" y1="8" x2="86" y2="8"/>
        <line class="hm-brace" x1="26" y1="30" x2="46" y2="8"/>
        <line class="hm-rope" x1="86" y1="8" x2="86" y2="24"/>
        <circle class="hm-part" data-i="0" cx="86" cy="38" r="13" pathLength="1"/>
        <line class="hm-part" data-i="1" x1="86" y1="51" x2="86" y2="95" pathLength="1"/>
        <line class="hm-part" data-i="2" x1="86" y1="62" x2="68" y2="80" pathLength="1"/>
        <line class="hm-part" data-i="3" x1="86" y1="62" x2="104" y2="80" pathLength="1"/>
        <line class="hm-part" data-i="4" x1="86" y1="95" x2="70" y2="120" pathLength="1"/>
        <line class="hm-part" data-i="5" x1="86" y1="95" x2="102" y2="120" pathLength="1"/>
        <g class="hm-eyes">
          <line x1="80" y1="34" x2="84" y2="38"/><line x1="84" y1="34" x2="80" y2="38"/>
          <line x1="88" y1="34" x2="92" y2="38"/><line x1="92" y1="34" x2="88" y2="38"/>
        </g>
      </svg>`;
    }

    function drawGallows() {
      const el = root.querySelector("#hmGallows");
      if (!el) return;
      if (!el.querySelector(".hm-svg")) el.innerHTML = gallowsSVG();
      const parts = el.querySelectorAll(".hm-part");
      const stage = wrong >= MAX_WRONG ? 6 : Math.min(6, Math.round((wrong / MAX_WRONG) * 6));
      parts.forEach((p, i) => p.classList.toggle("on", i < stage));
      el.classList.toggle("danger", wrong > 0 && wrong >= MAX_WRONG - 1 && wrong < MAX_WRONG);
      el.classList.toggle("dead", wrong >= MAX_WRONG);
    }

    function endGame(winner, reason) {
      phase = "over";
      ctx.setTurn(-1);
      Object.values(keyEls).forEach((b) => (b.disabled = true));
      // lộ đáp án
      revealed = revealed.map(() => true);
      if (!ctx.isOnline || ctx.mySeat === setterSeat) renderWord();
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng — ${reason}! Đáp án: "${secret || "(ẩn)"}"`,
        `🎉 Player ${winner + 1} wins — ${reason}! Answer: "${secret || "(hidden)"}"`));
    }

    function updateStatus() {
      if (phase !== "play") return;
      if (ctx.isOnline) {
        ctx.setStatus(iAmGuesser() ? ctx.t("Lượt bạn đoán — chọn một chữ cái.", "Your turn to guess — pick a letter.") : ctx.t("Đối thủ đang đoán...", "Opponent is guessing..."));
      } else {
        ctx.setStatus(ctx.t(`Người chơi ${guesserSeat + 1} đoán chữ cái. Sai tối đa ${MAX_WRONG} lần.`,
          `Player ${guesserSeat + 1} guesses letters. Max ${MAX_WRONG} wrong.`));
      }
    }

    // ---- online messages ----
    function applyMove(move, fromRemote) {
      if (!fromRemote) return;
      if (move.kind === "setword") {
        // tôi là người đoán: nhận mặt nạ, vào màn chơi
        secretMaskLen = move.mask;
        revealed = move.mask.map((c) => c !== "_");
        phase = "play";
        guesserSeat = ctx.mySeat; setterSeat = 1 - ctx.mySeat;
        showPlayUI(true, move.mask);
        ctx.setTurn(guesserSeat);
        return;
      }
      if (move.kind === "guess") {
        // tôi là người ra đề: chấm chữ đối thủ đoán
        const ch = move.ch;
        guessed.add(ch);
        const hits = [];
        [...secretKey].forEach((c, i) => { if (c === ch) hits.push(i); });
        // gửi kết quả kèm chữ thật ở các vị trí trúng (để người đoán hiện chữ)
        ctx.sendMove({ kind: "result", ch, hits, secretChars: hits.map((i) => secret[i]) });
        applyGuessResult(ch, hits);
        return;
      }
      if (move.kind === "result") {
        // tôi là người đoán: nhận kết quả
        if (move.hits && move.secretChars) {
          move.hits.forEach((idx, k) => { revealedChar[idx] = move.secretChars[k]; });
        }
        applyGuessResult(move.ch, move.hits || []);
        return;
      }
    }

    // ---- khởi tạo ----
    if (ctx.isOnline) {
      // người ghế 0 ra đề trước
      if (ctx.mySeat === 0) { showSetUI(0); ctx.setStatus(ctx.t("Bạn ra đề — nhập từ bí mật.", "You set the word — enter a secret word.")); }
      else {
        root.innerHTML = `<div class="hm-setbox"><h3>${ctx.t("⏳ Đang chờ đối thủ ra đề...", "⏳ Waiting for opponent to set a word...")}</h3></div>`;
        ctx.setStatus(ctx.t("Chờ đối thủ nhập từ bí mật...", "Waiting for opponent to enter a secret word..."));
      }
    } else {
      showSetUI(0);
      ctx.setStatus(ctx.t("Người chơi 1 ra đề — nhập từ bí mật để đố người chơi 2.", "Player 1 sets the word — enter a secret word for Player 2."));
    }
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "hangman",
    name: "Đoán Chữ (Hangman)",
    emoji: "🪢",
    description: "Một người ra từ bí mật, người kia đoán từng chữ cái. Sai quá số lần cho phép là thua. Có chọn độ khó và gợi ý.",
    onlineReady: true,
    options: [
      {
        id: "lives", label: "Số lần sai cho phép", default: 6,
        choices: [
          { value: 8, label: "8 (dễ)" },
          { value: 6, label: "6 (chuẩn)" },
          { value: 4, label: "4 (khó)" },
        ],
      },
      {
        id: "hints", label: "Gợi ý (chung máy)", default: "one",
        choices: [
          { value: "off", label: "Tắt" },
          { value: "one", label: "1 lần" },
          { value: "many", label: "3 lần" },
        ],
      },
    ],
    howTo: [
      "Một người ra đề: nhập một từ hoặc cụm từ bí mật (đối thủ chỉ thấy số ô trống và dấu cách).",
      "Người kia đoán từng CHỮ CÁI bằng bàn phím trên màn hình.",
      "Đoán đúng: tất cả vị trí của chữ đó được lộ ra. Đoán sai: hình người treo cổ thêm một bộ phận.",
      "Chọn ĐỘ KHÓ ở tùy chọn: số lần sai cho phép (4 khó · 6 chuẩn · 8 dễ).",
      "Khi chơi chung máy có thể bấm '💡 Gợi ý' để lộ sẵn một chữ — nhưng tốn 1 lượt sai, nên dùng khi thật bí.",
      "Đoán sai quá số lần cho phép thì người đoán THUA. Đoán ra hết các chữ trước đó thì người đoán THẮNG.",
      "Lưu ý: đoán theo chữ cái KHÔNG DẤU (ví dụ 'mèo' đoán bằng m, e, o). Dấu cách được hiện sẵn.",
    ],
    create,
  });
})();
