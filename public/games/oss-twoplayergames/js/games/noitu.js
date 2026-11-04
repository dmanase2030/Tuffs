/* Nối Từ — chơi chung máy & ONLINE (theo lượt, có đồng hồ đếm ngược)
   Mỗi người nhập một từ ghép 2 tiếng, bắt đầu bằng TIẾNG CUỐI của từ trước.
   Không được lặp từ đã dùng. Hết giờ hoặc bí thì thua.

   Từ được CHẤM NGAY khi nhập bằng từ điển (window.VI_DICT): nếu từ không có trong
   từ điển thì báo lỗi và cho nhập lại (không phạt). Bí mật không có gì để giấu.
   Nước đi: { kind:"word", phrase } | { kind:"timeout" }. */
(function () {
  const STARTERS = [
    "học sinh", "bầu trời", "con đường", "mặt trời", "hoa hồng",
    "xinh đẹp", "vui vẻ", "bình minh", "quê hương", "tình bạn",
    "mùa xuân", "dòng sông", "núi rừng", "ánh sáng", "gia đình",
    "thành phố", "biển cả", "cánh đồng", "ngôi sao", "trái tim",
    "cơn mưa", "buổi sáng", "tuổi thơ", "âm nhạc", "hạnh phúc",
  ];
  const PENALTY = 5; // giây bị trừ mỗi lần sai

  function norm(s) { return s.trim().toLowerCase().replace(/\s+/g, " "); }
  function syllables(s) { return norm(s).split(" ").filter(Boolean); }

  // ----- Kiểm tra cấu trúc âm tiết tiếng Việt (chặn gõ bậy) -----
  const BASE_MAP = {
    "à":"a","á":"a","ả":"a","ã":"a","ạ":"a","ă":"a","ằ":"a","ắ":"a","ẳ":"a","ẵ":"a","ặ":"a",
    "â":"a","ầ":"a","ấ":"a","ẩ":"a","ẫ":"a","ậ":"a",
    "è":"e","é":"e","ẻ":"e","ẽ":"e","ẹ":"e","ê":"e","ề":"e","ế":"e","ể":"e","ễ":"e","ệ":"e",
    "ì":"i","í":"i","ỉ":"i","ĩ":"i","ị":"i",
    "ò":"o","ó":"o","ỏ":"o","õ":"o","ọ":"o","ô":"o","ồ":"o","ố":"o","ổ":"o","ỗ":"o","ộ":"o",
    "ơ":"o","ờ":"o","ớ":"o","ở":"o","ỡ":"o","ợ":"o",
    "ù":"u","ú":"u","ủ":"u","ũ":"u","ụ":"u","ư":"u","ừ":"u","ứ":"u","ử":"u","ữ":"u","ự":"u",
    "ỳ":"y","ý":"y","ỷ":"y","ỹ":"y","ỵ":"y","đ":"d",
  };
  function toBase(s) { let o = ""; for (const ch of s) o += BASE_MAP[ch] || ch; return o; }
  const ONSETS = ["ngh","ng","nh","ch","gh","gi","kh","ph","th","tr","qu",
    "b","c","d","g","h","k","l","m","n","p","r","s","t","v","x"];
  const VOWELS = "aeiouy";
  const FINALS = ["","c","ch","m","n","ng","nh","p","t","i","o","u","y"];
  function isVietnameseSyllable(raw) {
    const s = norm(raw);
    if (!s || /[^a-zàáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(s)) return false;
    const base = toBase(s);
    let onset = "";
    for (const oo of ONSETS) { if (base.startsWith(oo)) { onset = oo; break; } }
    const rhyme = base.slice(onset.length);
    if (!rhyme || !VOWELS.includes(rhyme[0])) return false;
    let i = 0;
    while (i < rhyme.length && VOWELS.includes(rhyme[i])) i++;
    const nucleus = rhyme.slice(0, i), final = rhyme.slice(i);
    if (nucleus.length === 0 || nucleus.length > 3) return false;
    if (!FINALS.includes(final)) return false;
    return true;
  }
  function validVietnamese(phrase) { return syllables(phrase).every(isVietnameseSyllable); }

  // trọng tài: từ có trong từ điển không
  function inDictionary(phrase) {
    return !!(window.VI_DICT && window.VI_DICT.has(norm(phrase)));
  }

  function create(ctx) {
    const o = ctx.options || {};
    const TIME = Number.isFinite(Number(o.time)) ? Number(o.time) : 20;
    let hintsLeft = o.hints === "off" ? 0 : o.hints === "many" ? 5 : 2;

    const used = new Set();
    let turn = 0;
    let over = false;
    let lastWord = null;
    let timerId = null;
    let timeLeft = TIME;
    const chain = [];                 // [{ phrase, by, prevLast, el }]

    const root = document.createElement("div");
    root.className = "nt-root";
    root.innerHTML =
      `<div class="nt-need" id="ntNeed"></div>` +
      `<div class="nt-timer" id="ntTimer"></div>` +
      `<div class="nt-inputrow">` +
      `<input class="nt-input" id="ntInput" placeholder="${ctx.t("nhập từ 2 tiếng...", "enter a 2-word phrase...")}" autocomplete="off">` +
      `<button class="btn primary" id="ntSend">${ctx.t("Nối", "Link")}</button>` +
      `<button class="btn nt-hint" id="ntHint">${ctx.t("💡 Gợi ý", "💡 Hint")}</button>` +
      `<button class="btn nt-give">${ctx.t("🏳️ Chịu thua", "🏳️ Give up")}</button>` +
      `</div>` +
      `<p class="nt-err" id="ntErr"></p>` +
      `<div class="nt-chain" id="ntChain"></div>`;
    ctx.boardEl.appendChild(root);

    const needEl = root.querySelector("#ntNeed");
    const timerEl = root.querySelector("#ntTimer");
    const input = root.querySelector("#ntInput");
    const sendBtn = root.querySelector("#ntSend");
    const hintBtn = root.querySelector("#ntHint");
    const giveBtn = root.querySelector(".nt-give");
    const errEl = root.querySelector("#ntErr");
    const chainEl = root.querySelector("#ntChain");

    const rand = ctx.isOnline ? ctx.rng : Math.random;
    const opener = STARTERS[Math.floor(rand() * STARTERS.length)];

    function myTurn() { return !ctx.isOnline || turn === ctx.mySeat; }
    function effTime() { return TIME > 0 ? TIME : 0; }

    function startTimer() {
      stopTimer();
      if (TIME <= 0) { timerEl.textContent = ctx.t("Không giới hạn giờ", "No time limit"); return; }
      timeLeft = effTime();
      renderTimer();
      timerId = setInterval(() => {
        timeLeft--;
        renderTimer();
        if (timeLeft <= 0) {
          stopTimer();
          if (myTurn()) applyMove({ kind: "timeout" }, false);
        }
      }, 1000);
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function renderTimer() {
      timerEl.textContent = TIME > 0 ? `⏱️ ${Math.max(0, timeLeft)}s` : ctx.t("Không giới hạn giờ", "No time limit");
      timerEl.classList.toggle("low", TIME > 0 && timeLeft <= 5);
    }

    function validate(phrase) {
      const sy = syllables(phrase);
      if (sy.length !== 2) return ctx.t("Phải là từ GỒM 2 TIẾNG (ví dụ: học sinh).", "Must be a TWO-WORD phrase (e.g. 'học sinh').");
      if (!validVietnamese(phrase)) return ctx.t("Không phải tiếng Việt — đừng gõ bậy nhé!", "Not valid Vietnamese — no gibberish, please!");
      if (lastWord && sy[0] !== lastWord) return ctx.t(`Phải bắt đầu bằng tiếng "${lastWord}".`, `Must start with the word "${lastWord}".`);
      if (used.has(sy.join(" "))) return ctx.t("Từ này đã được dùng rồi.", "This phrase has already been used.");
      if (window.VI_DICT && !inDictionary(phrase)) return ctx.t(`"${norm(phrase)}" không có trong từ điển — thử từ khác.`, `"${norm(phrase)}" is not in the dictionary — try another word.`);
      return null;
    }

    sendBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    hintBtn.addEventListener("click", onHint);
    giveBtn.addEventListener("click", () => {
      if (!myTurn() || over) return;
      applyMove({ kind: "timeout" }, false);
    });

    function submit() {
      if (!myTurn() || over) return;
      const phrase = norm(input.value);
      const err = validate(phrase);
      if (err) { errEl.textContent = err; return; }
      errEl.textContent = "";
      input.value = "";
      applyMove({ kind: "word", phrase }, false);
    }

    // 💡 Gợi ý: tra từ điển tìm một từ hợp lệ nối tiếp, điền sẵn vào ô nhập.
    // Chi phí: giảm số gợi ý còn lại và bị trừ thời gian ngay lượt này.
    function onHint() {
      if (!myTurn() || over || hintsLeft <= 0) return;
      const need = lastWord;
      if (!need || !window.VI_DICT) { errEl.textContent = ctx.t("Chưa thể gợi ý lúc này.", "No hint available right now."); return; }
      let found = null;
      for (const w of window.VI_DICT) {
        const sy = syllables(w);
        if (sy.length === 2 && sy[0] === need && !used.has(w)) { found = w; break; }
      }
      if (!found) { flashJudge(ctx.t(`💡 Không có từ nào trong từ điển bắt đầu bằng "${need}". Bạn tự nghĩ nhé!`, `💡 No dictionary word starts with "${need}". Think of one yourself!`), true); return; }
      hintsLeft--;
      if (TIME > 0) { timeLeft = Math.max(1, timeLeft - PENALTY); renderTimer(); }
      input.value = found;
      input.focus();
      ctx.sound("notify");
      flashJudge(ctx.t(`💡 Gợi ý: "${found}" — còn ${hintsLeft} lần${TIME > 0 ? `, bị trừ ${PENALTY}s` : ""}. Bấm Nối để dùng.`, `💡 Hint: "${found}" — ${hintsLeft} left${TIME > 0 ? `, −${PENALTY}s` : ""}. Press Link to use.`), true);
      updateUI();
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.kind === "timeout") {
        if (!fromRemote) ctx.sendMove(move);
        stopTimer();
        return endGame(1 - turn, ctx.t(`Người chơi ${turn + 1} hết giờ / chịu thua`, `Player ${turn + 1} ran out of time / gave up`));
      }

      if (move.kind === "word") {
        const sy = syllables(move.phrase);
        if (sy.length !== 2) return;
        if (lastWord && sy[0] !== lastWord) return;
        const key = sy.join(" ");
        if (used.has(key)) return;
        if (!validVietnamese(key)) return;

        if (!fromRemote) ctx.sendMove({ kind: "word", phrase: key });

        const entry = { phrase: key, by: turn, prevLast: lastWord };
        entry.el = addChainWord(key, turn);
        chain.push(entry);
        used.add(key);
        lastWord = sy[1];
        ctx.sound("place");
        errEl.textContent = "";
        turn = 1 - turn;
        ctx.setTurn(turn);
        startTimer();
        updateUI();
        return;
      }
    }

    function flashJudge(text, challengerWrong) {
      errEl.textContent = text;
      errEl.classList.toggle("nt-judge-bad", !challengerWrong);
      errEl.classList.toggle("nt-judge-warn", challengerWrong);
      setTimeout(() => errEl.classList.remove("nt-judge-bad", "nt-judge-warn"), 2500);
    }

    function addChainWord(phrase, who) {
      const item = document.createElement("span");
      item.className = "nt-word " + (who === 0 ? "p1" : who === 1 ? "p2" : "sys");
      item.textContent = phrase;
      chainEl.appendChild(item);
      chainEl.scrollTop = chainEl.scrollHeight;
      return item;
    }

    function endGame(winner, reason) {
      over = true;
      stopTimer();
      ctx.setTurn(-1);
      input.disabled = true; sendBtn.disabled = true; giveBtn.disabled = true;
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng — ${reason}!`, `🎉 Player ${winner + 1} wins — ${reason}!`));
    }

    function updateUI() {
      needEl.innerHTML = lastWord
        ? ctx.t(`Nối tiếp từ tiếng: <b>"${lastWord}"</b>`, `Continue from the word: <b>"${lastWord}"</b>`)
        : ctx.t(`Mở màn — gợi ý: <b>${opener}</b>`, `Opening — suggestion: <b>${opener}</b>`);
      const mine = myTurn() && !over;
      input.disabled = !mine;
      sendBtn.disabled = !mine;
      giveBtn.disabled = !mine;
      hintBtn.disabled = !mine || hintsLeft <= 0 || !lastWord;
      hintBtn.textContent = ctx.t(`💡 Gợi ý (${hintsLeft})`, `💡 Hint (${hintsLeft})`);
      hintBtn.classList.toggle("hidden", o.hints === "off");
      if (mine) input.focus();
      ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} nối từ.`, `Player ${turn + 1}'s turn to link a word.`));
    }

    // mở màn: thêm từ gợi ý vào chuỗi như "hệ thống" (by = null)
    chain.push({ phrase: opener, by: null, prevLast: null, el: addChainWord(opener, null) });
    used.add(opener);
    lastWord = syllables(opener)[1];

    ctx.setTurn(0);
    updateUI();
    startTimer();
    ctx.setStatus(ctx.t("Nối từ ghép 2 tiếng theo tiếng cuối. Từ phải có trong từ điển — gõ sai chỉ cần nhập lại.", "Link 2-word phrases by the last word. The word must be in the dictionary — if wrong, just try again."));
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "noitu",
    name: "Nối Từ",
    emoji: "🔤",
    description: "Nối từ ghép 2 tiếng theo tiếng cuối. Từ được chấm ngay bằng từ điển — gõ sai chỉ cần nhập lại, không phạt.",
    onlineReady: true,
    options: [
      {
        id: "time", label: "Thời gian mỗi lượt", default: 20,
        choices: [
          { value: 0, label: "Không giới hạn" },
          { value: 15, label: "15 giây (gắt)" },
          { value: 20, label: "20 giây" },
          { value: 30, label: "30 giây (thong thả)" },
        ],
      },
      {
        id: "hints", label: "Số lần gợi ý", default: "two",
        choices: [
          { value: "off", label: "Tắt (khó)" },
          { value: "two", label: "2 lần" },
          { value: "many", label: "5 lần (dễ)" },
        ],
      },
    ],
    howTo: [
      "Mở màn bằng một từ gợi ý. Người tiếp theo nối bằng từ 2 tiếng bắt đầu bằng TIẾNG CUỐI của từ trước (ví dụ 'học sinh' → 'sinh viên').",
      "Không dùng lại từ đã xuất hiện. Mỗi lượt có đồng hồ đếm ngược — hết giờ là thua.",
      "Từ bạn nhập được TRỌNG TÀI (từ điển tiếng Việt) chấm ngay: nếu từ KHÔNG có trong từ điển, hệ thống báo lỗi và bạn chỉ cần nhập lại từ khác — không bị phạt gì.",
      "Bí từ? Bấm '💡 Gợi ý' để được từ điển mách một từ nối tiếp hợp lệ — nhưng số lần có hạn và bị trừ thời gian, nên đừng lạm dụng.",
      "Ai hết giờ hoặc chịu thua (🏳️) sẽ thua. Người còn lại thắng.",
    ],
    create,
  });
})();
