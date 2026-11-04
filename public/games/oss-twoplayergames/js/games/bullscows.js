/* Đoán Số (Bulls & Cows) — chơi chung máy & ONLINE
   Mỗi người đặt dãy số bí mật. Hai người ĐOÁN SONG SONG (không chờ lượt nhau),
   nhưng số lượt chênh nhau tối đa 1 (ai dẫn 1 lượt phải chờ đối thủ đuổi kịp).
   Có quyền trợ giúp + chấm điểm theo số lượt & trợ giúp đã dùng.
   Bí mật KHÔNG gửi qua mạng. Giao thức:
     { kind:"ready" }
     { kind:"guess", digits }                  -> đối thủ chấm dãy của TÔI
     { kind:"result", digits, bulls, cows, win, round }
     { kind:"hint", htype }                     -> xin trợ giúp (đối thủ trả lời)
     { kind:"hintres", htype, payload, round }  -> kết quả trợ giúp
*/
(function () {
  const MAX_HINTS = 2;

  function create(ctx) {
    const o = ctx.options || {};
    const LEN = o.len || 4;
    const UNIQUE = o.unique !== false;

    let phase = "set";
    let mySecret = null;
    let iReady = false, oppReady = false;
    // số lượt mỗi người ĐÃ đoán (để giới hạn chênh lệch ≤ 1)
    const rounds = [0, 0];
    const hintsLeft = [MAX_HINTS, MAX_HINTS];
    const won = [false, false];       // ai đã đoán đúng (và ở lượt thứ mấy)
    const wonAt = [0, 0];
    const timeUsed = [0, 0];          // tổng giây "suy nghĩ" mỗi người
    let tickSeat = null;              // ghế đang được tính giờ
    let tickStart = 0;                // mốc bắt đầu tính giờ (ms)
    let clockTimer = null;
    let over = false;
    let awaiting = false;             // đang chờ kết quả (online) cho phát đoán của mình

    const root = document.createElement("div");
    root.className = "bc-root";
    ctx.boardEl.appendChild(root);

    // ----- khu đặt số bí mật -----
    const setBox = document.createElement("div");
    setBox.className = "bc-setbox";
    root.appendChild(setBox);

    // ----- khu chơi -----
    const playBox = document.createElement("div");
    playBox.className = "bc-playbox hidden";
    playBox.innerHTML =
      `<div class="bc-meters" id="bcMeters"></div>` +
      `<div class="bc-guessrow">` +
      `<input class="bc-input" id="bcGuess" maxlength="${LEN}" inputmode="numeric" placeholder="${"•".repeat(LEN)}">` +
      `<button class="btn primary" id="bcGuessBtn">${ctx.t("Đoán", "Guess")}</button></div>` +
      `<div class="bc-keypad" id="bcKeypad"></div>` +
      `<div class="bc-hints" id="bcHints"></div>` +
      `<p class="bc-err" id="bcGuessErr"></p>` +
      `<div class="bc-notepad" id="bcNotepad">` +
      `<div class="bc-np-title">${ctx.t("📝 Ghi chú của bạn <span>(bấm số: ✓ có trong đáp án · ✗ loại · trống = chưa rõ)</span>", "📝 Your notes <span>(tap a digit: ✓ in answer · ✗ ruled out · blank = unknown)</span>")}</div>` +
      `<div class="bc-np-grid" id="bcNpGrid"></div>` +
      `</div>` +
      `<div class="bc-cols">` +
      `<div class="bc-col"><h4>${ctx.t("Bạn đoán", "Your guesses")}</h4><div class="bc-log" id="bcMine"></div></div>` +
      `<div class="bc-col"><h4>${ctx.t("Đối thủ đoán", "Opponent's guesses")}</h4><div class="bc-log" id="bcOpp"></div></div>` +
      `</div>`;
    root.appendChild(playBox);

    const guessInput = playBox.querySelector("#bcGuess");
    const guessBtn = playBox.querySelector("#bcGuessBtn");
    const guessErr = playBox.querySelector("#bcGuessErr");
    const mineLog = playBox.querySelector("#bcMine");
    const oppLog = playBox.querySelector("#bcOpp");
    const metersEl = playBox.querySelector("#bcMeters");
    const hintsEl = playBox.querySelector("#bcHints");
    const keypadEl = playBox.querySelector("#bcKeypad");
    const npGridEl = playBox.querySelector("#bcNpGrid");

    guessInput.addEventListener("input", () => {
      guessInput.value = guessInput.value.replace(/\D/g, "").slice(0, LEN);
    });

    // ghi chú suy luận (chỉ là công cụ ghi nhớ cục bộ, mỗi người một bảng, không gửi qua mạng)
    // 0 = chưa rõ, 1 = có trong đáp án (✓), 2 = đã loại (✗)
    const noteState = [Array(10).fill(0), Array(10).fill(0)];
    function activeNoteSeat() { return ctx.isOnline ? ctx.mySeat : currentLocalSeat(); }

    function buildKeypad() {
      keypadEl.innerHTML = "";
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "⌫"];
      keys.forEach((k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn small bc-key" + (k === "⌫" ? " bc-key-back" : "");
        b.textContent = k;
        b.addEventListener("click", () => {
          if (guessInput.disabled) return;
          if (k === "⌫") guessInput.value = guessInput.value.slice(0, -1);
          else if (guessInput.value.length < LEN) guessInput.value += k;
          guessInput.focus();
        });
        keypadEl.appendChild(b);
      });
    }

    function renderNotepad() {
      const seat = activeNoteSeat();
      const state = noteState[seat] || noteState[0];
      npGridEl.innerHTML = "";
      for (let d = 0; d <= 9; d++) {
        const cell = document.createElement("button");
        cell.type = "button";
        const st = state[d];
        cell.className = "bc-np-cell" + (st === 1 ? " yes" : st === 2 ? " no" : "");
        cell.innerHTML = `<b>${d}</b><i>${st === 1 ? "✓" : st === 2 ? "✗" : ""}</i>`;
        cell.addEventListener("click", () => {
          state[d] = (state[d] + 1) % 3;
          renderNotepad();
        });
        npGridEl.appendChild(cell);
      }
    }

    function validCode(s) {
      if (s.length !== LEN) return ctx.t("Phải đủ " + LEN + " chữ số.", "Must be exactly " + LEN + " digits.");
      if (UNIQUE && new Set(s).size !== LEN) return ctx.t("Các chữ số phải khác nhau.", "Digits must all be different.");
      return null;
    }
    function evaluate(guess, secret) {
      let bulls = 0, cows = 0;
      for (let i = 0; i < LEN; i++) {
        if (guess[i] === secret[i]) bulls++;
        else if (secret.includes(guess[i])) cows++;
      }
      return { bulls, cows };
    }

    // ====================== Đồng hồ suy nghĩ ======================
    // Bắt đầu tính giờ cho ghế 'seat' (người đang được phép đoán).
    function startClock(seat) {
      stopClock();
      if (over || seat == null || won[seat]) return;
      tickSeat = seat;
      tickStart = Date.now();
      clockTimer = setInterval(renderMeters, 250);
      renderMeters();
    }
    // Dừng tính giờ, cộng phần đã trôi vào timeUsed.
    function stopClock() {
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
      if (tickSeat != null) {
        timeUsed[tickSeat] += (Date.now() - tickStart) / 1000;
        tickSeat = null;
      }
    }
    // thời gian hiển thị hiện tại của 1 ghế (gồm phần đang trôi)
    function liveTime(seat) {
      let t = timeUsed[seat];
      if (tickSeat === seat) t += (Date.now() - tickStart) / 1000;
      return t;
    }

    // ====================== Giai đoạn đặt số ======================
    const secrets = [null, null]; // dùng cho hot-seat
    function showSetUI(seat, online) {
      setBox.innerHTML =
        `<h3>${online ? ctx.t("Bạn", "You") : ctx.t("Người chơi ", "Player ") + (seat + 1)}${ctx.t(": đặt dãy số bí mật (", ": set your secret number (")}${LEN}${ctx.t(" chữ số", " digits")}${UNIQUE ? ctx.t(", không trùng", ", no repeats") : ""})</h3>` +
        `<input class="bc-input" id="bcSecret" maxlength="${LEN}" inputmode="numeric" placeholder="${"•".repeat(LEN)}">` +
        `<button class="btn primary" id="bcSetBtn">${ctx.t("✓ Khóa dãy số", "✓ Lock number")}</button>` +
        `<p class="bc-err" id="bcSetErr"></p>` +
        `<p class="bc-note">${ctx.t("💡 Đối thủ sẽ đoán dãy này. Hai người đoán song song nhưng không ai được dẫn quá 1 lượt.", "💡 Your opponent will guess this. Both guess in parallel but no one may lead by more than 1 turn.")}</p>`;
      const inp = setBox.querySelector("#bcSecret");
      const btn = setBox.querySelector("#bcSetBtn");
      const err = setBox.querySelector("#bcSetErr");
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, LEN); });
      inp.focus();
      btn.addEventListener("click", () => {
        const e = validCode(inp.value);
        if (e) { err.textContent = e; return; }
        onSecretSet(seat, inp.value, online);
      });
    }

    function onSecretSet(seat, value, online) {
      if (online) {
        mySecret = value;
        iReady = true;
        setBox.innerHTML = `<h3>${ctx.t("✓ Đã khóa dãy số bí mật", "✓ Secret number locked")}</h3><p class="bc-wait">${ctx.t("Đang chờ đối thủ...", "Waiting for opponent...")}</p>`;
        ctx.sendMove({ kind: "ready" });
        if (oppReady) beginPlay();
      } else {
        secrets[seat] = value;
        if (seat === 0) showSetUI(1, false);
        else beginPlay();
      }
    }

    function beginPlay() {
      phase = "play";
      setBox.classList.add("hidden");
      playBox.classList.remove("hidden");
      buildHintButtons();
      buildKeypad();
      renderMeters();
      ctx.setTurn(0);
      updateInput();
      ctx.setStatus(ctx.t("Cùng đoán! Đoán nhanh & ít trợ giúp để được điểm cao.", "Guess away! Guess fast with fewer hints for a higher score."));
      guessInput.focus();
      // bắt đầu tính giờ cho người được đoán đầu tiên
      startClock(ctx.isOnline ? (canGuess(ctx.mySeat) ? ctx.mySeat : null) : currentLocalSeat());
    }

    // ====================== Ai được phép đoán? ======================
    // local seat của người đang thao tác (hot-seat: cả hai trên 1 máy)
    function mySeat() { return ctx.isOnline ? ctx.mySeat : 0; }
    // người chơi p được đoán nếu: chưa thắng, chưa over, và không dẫn đối thủ quá 1 lượt
    function canGuess(p) {
      if (over || won[p]) return false;
      if (awaiting && ctx.isOnline) return false;
      const opp = 1 - p;
      // không được vượt: nếu mình đã đoán nhiều hơn đối thủ -> phải chờ
      if (rounds[p] > rounds[opp]) return false;
      return true;
    }

    // ====================== Đoán ======================
    guessBtn.addEventListener("click", doGuess);
    guessInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doGuess(); });

    function doGuess() {
      if (phase !== "play") return;
      const seat = ctx.isOnline ? ctx.mySeat : currentLocalSeat();
      if (!canGuess(seat)) return;
      const err = validCode(guessInput.value);
      if (err) { guessErr.textContent = err; return; }
      guessErr.textContent = "";
      const digits = guessInput.value;
      guessInput.value = "";
      stopClock(); // dừng tính giờ suy nghĩ của lượt này
      submitGuess(seat, digits);
    }

    // hot-seat: người được đoán là người đang "đến lượt đuổi" (rounds ít hơn, hoặc seat 0 nếu bằng)
    function currentLocalSeat() {
      if (rounds[0] <= rounds[1] && !won[0]) return 0;
      if (rounds[1] < rounds[0] && !won[1]) return 1;
      return won[0] ? 1 : 0;
    }

    function submitGuess(seat, digits) {
      if (ctx.isOnline) {
        awaiting = true;
        updateInput();
        ctx.sendMove({ kind: "guess", digits });
        ctx.setStatus(ctx.t("Đã gửi, chờ chấm...", "Sent, awaiting scoring..."));
      } else {
        const { bulls, cows } = evaluate(digits, secrets[1 - seat]);
        applyGuessResult(seat, digits, bulls, cows);
      }
    }

    function applyGuessResult(seat, digits, bulls, cows) {
      rounds[seat]++;
      lastGuess[seat] = digits;
      const log = (seat === mySeat()) ? mineLog : oppLog;
      logGuess(log, digits, bulls, cows, rounds[seat]);
      ctx.sound(bulls === LEN ? "capture" : bulls > 0 ? "shot" : "select");
      if (bulls === LEN && !won[seat]) {
        won[seat] = true;
        wonAt[seat] = rounds[seat];
      }
      checkFinishAndContinue();
    }

    // ====================== Trợ giúp ======================
    const HINTS = {
      reveal: { label: ctx.t("🔍 Lộ 1 vị trí", "🔍 Reveal 1 spot"), desc: ctx.t("tiết lộ chữ số đúng tại 1 vị trí", "reveal the correct digit at one position") },
      count: { label: ctx.t("🧮 Đếm số đúng", "🧮 Count matches"), desc: ctx.t("đếm bao nhiêu chữ số của dãy mình đoán gần nhất là 'có trong' đáp án", "count how many digits of your last guess appear in the answer") },
    };
    function buildHintButtons() {
      hintsEl.innerHTML = "";
      Object.entries(HINTS).forEach(([id, h]) => {
        const b = document.createElement("button");
        b.className = "btn small bc-hint-btn";
        b.dataset.h = id;
        b.title = h.desc;
        b.textContent = h.label;
        b.addEventListener("click", () => requestHint(id));
        hintsEl.appendChild(b);
      });
    }

    function requestHint(htype) {
      const seat = ctx.isOnline ? ctx.mySeat : currentLocalSeat();
      if (over || won[seat] || hintsLeft[seat] <= 0) return;
      if (ctx.isOnline) {
        ctx.sendMove({ kind: "hint", htype });
        hintsLeft[seat]--;
        renderMeters();
        ctx.setStatus(ctx.t("Đang xin trợ giúp...", "Requesting a hint..."));
      } else {
        const payload = computeHint(htype, seat, secrets[1 - seat]);
        hintsLeft[seat]--;
        showHintResult(seat, htype, payload);
      }
    }

    // tính nội dung trợ giúp dựa trên secret đối thủ (secret = dãy người 'seat' đang phải đoán)
    function computeHint(htype, seat, secret) {
      if (htype === "reveal") {
        // chọn 1 vị trí cố định (đầu tiên) — đơn giản & tất định
        const pos = pickRevealPos(seat);
        return { pos, digit: secret[pos] };
      }
      if (htype === "count") {
        // đếm số chữ số (của lần đoán gần nhất của seat) có trong đáp án
        const last = lastGuessOf(seat);
        if (!last) return { none: true };
        const inSecret = [...new Set(last.split(""))].filter((d) => secret.includes(d)).length;
        return { guess: last, inSecret };
      }
      return {};
    }

    const revealedPos = [[], []];
    function pickRevealPos(seat) {
      for (let i = 0; i < LEN; i++) if (!revealedPos[seat].includes(i)) { revealedPos[seat].push(i); return i; }
      return 0;
    }
    const lastGuess = [null, null];
    function lastGuessOf(seat) { return lastGuess[seat]; }

    function showHintResult(seat, htype, payload) {
      let msg;
      if (htype === "reveal") {
        msg = payload.none ? ctx.t("Không có gì để lộ.", "Nothing to reveal.") :
          ctx.t(`🔍 Vị trí ${payload.pos + 1} của đáp án là số <b>${payload.digit}</b>.`,
                `🔍 Position ${payload.pos + 1} of the answer is <b>${payload.digit}</b>.`);
      } else {
        msg = payload.none ? ctx.t("Bạn cần đoán ít nhất 1 lần trước đã.", "Make at least one guess first.") :
          ctx.t(`🧮 Trong dãy "${payload.guess}", có <b>${payload.inSecret}</b> chữ số xuất hiện trong đáp án.`,
                `🧮 In "${payload.guess}", <b>${payload.inSecret}</b> digit(s) appear in the answer.`);
      }
      const box = document.createElement("div");
      box.className = "bc-hint-res";
      box.innerHTML = msg;
      (seat === mySeat() ? mineLog : oppLog).appendChild(box);
      mineLog.scrollTop = mineLog.scrollHeight;
      renderMeters();
      ctx.sound("select");
    }

    // ====================== Theo dõi lần đoán gần nhất (cho hint count) ======================
    function logGuess(logEl, digits, bulls, cows, roundNo) {
      const row = document.createElement("div");
      row.className = "bc-guess" + (bulls === LEN ? " bc-solved" : "");
      const tiles = [...String(digits)].map((d) => `<span class="bc-dt">${d}</span>`).join("");
      let pegs = "";
      for (let i = 0; i < bulls; i++) pegs += `<i class="bc-peg bull" title="bull"></i>`;
      for (let i = 0; i < cows; i++) pegs += `<i class="bc-peg cow" title="cow"></i>`;
      const miss = Math.max(0, LEN - bulls - cows);
      for (let i = 0; i < miss; i++) pegs += `<i class="bc-peg none"></i>`;
      row.innerHTML =
        `<span class="bc-rd">#${roundNo}</span>` +
        `<span class="bc-digits">${tiles}</span>` +
        `<span class="bc-fb">${pegs}</span>`;
      logEl.appendChild(row);
      logEl.scrollTop = logEl.scrollHeight;
    }

    // ====================== Kết thúc khi cả hai đã xong lượt chênh ≤1 ======================
    function checkFinishAndContinue() {
      // ván kết thúc khi: cả hai đã thắng, HOẶC một người thắng và người kia đã đoán đủ tới lượt đó
      const bothActedEqual = rounds[0] === rounds[1];
      if (won[0] && won[1]) return finish();
      // nếu một người thắng, cho người kia "gỡ" trong cùng số lượt để công bằng
      if ((won[0] || won[1]) && bothActedEqual) return finish();
      ctx.setTurn(currentTurnForBanner());
      updateInput();
      renderMeters();
      updateStatusLine();
      // khởi động đồng hồ cho người đang được phép đoán (local)
      const seat = ctx.isOnline ? ctx.mySeat : currentLocalSeat();
      if (!ctx.isOnline) startClock(currentLocalSeat());
      else if (canGuess(seat)) startClock(seat);
    }

    function currentTurnForBanner() {
      if (won[0] && !won[1]) return 1;
      if (won[1] && !won[0]) return 0;
      return rounds[0] <= rounds[1] ? 0 : 1;
    }

    function finish() {
      over = true;
      stopClock();
      ctx.setTurn(-1);
      updateInput();
      const s0 = score(0), s1 = score(1);
      let winner = -1;
      if (won[0] && won[1]) {
        if (wonAt[0] !== wonAt[1]) winner = wonAt[0] < wonAt[1] ? 0 : 1;
        else winner = s0 === s1 ? -1 : (s0 > s1 ? 0 : 1);
      } else if (won[0]) winner = 0;
      else if (won[1]) winner = 1;
      renderMeters(true);
      if (winner === -1) ctx.setStatus(ctx.t(`🤝 Hòa! Cả hai cùng giỏi (P1 ${s0}đ – P2 ${s1}đ).`, `🤝 Draw! Both played well (P1 ${s0}pts – P2 ${s1}pts).`));
      else {
        ctx.incScore(winner);
        if (ctx.isOnline) {
          ctx.setStatus(winner === ctx.mySeat
            ? ctx.t(`🎉 Bạn thắng! (${winner === 0 ? s0 : s1} điểm)`, `🎉 You win! (${winner === 0 ? s0 : s1} points)`)
            : ctx.t(`💀 Bạn thua. Đối thủ đoán ra trước.`, `💀 You lose. Opponent guessed first.`));
        } else {
          ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng! (${winner === 0 ? s0 : s1} điểm)`,
            `🎉 Player ${winner + 1} wins! (${winner === 0 ? s0 : s1} points)`));
        }
      }
    }

    // điểm: thắng nhanh (ít lượt + ít thời gian) + ít trợ giúp -> điểm càng cao
    function score(seat) {
      if (!won[seat]) return 0;
      const base = 120;
      const roundPenalty = (wonAt[seat] - 1) * 8;       // mỗi lượt sau lượt 1: −8
      const hintPenalty = (MAX_HINTS - hintsLeft[seat]) * 10; // mỗi trợ giúp: −10
      const timePenalty = Math.floor(timeUsed[seat] / 5) * 2; // mỗi 5s suy nghĩ: −2
      return Math.max(10, base - roundPenalty - hintPenalty - timePenalty);
    }

    // ====================== UI ======================
    function updateInput() {
      const seat = ctx.isOnline ? ctx.mySeat : currentLocalSeat();
      const can = phase === "play" && canGuess(seat);
      guessInput.disabled = !can;
      guessBtn.disabled = !can;
      hintsEl.querySelectorAll(".bc-hint-btn").forEach((b) => {
        b.disabled = !(phase === "play" && !over && !won[seat] && hintsLeft[seat] > 0 && (!awaiting || !ctx.isOnline));
      });
      renderNotepad();
    }

    function updateStatusLine() {
      if (over) return;
      if (ctx.isOnline) {
        const me = ctx.mySeat;
        if (won[me]) ctx.setStatus(ctx.t("Bạn đã đoán ra! Chờ đối thủ hết lượt gỡ...", "You cracked it! Waiting for the opponent's final turn..."));
        else if (rounds[me] > rounds[1 - me]) ctx.setStatus(ctx.t("⏳ Bạn đang dẫn 1 lượt — chờ đối thủ đoán cho công bằng.", "⏳ You're 1 turn ahead — wait for the opponent to keep it fair."));
        else ctx.setStatus(ctx.t("Tới lượt bạn — đoán đi!", "Your turn — guess!"));
      } else {
        const seat = currentLocalSeat();
        ctx.setStatus(ctx.t(`Lượt đoán của Người chơi ${seat + 1} (đoán song song, không ai dẫn quá 1 lượt).`,
          `Player ${seat + 1}'s guess (parallel guessing, no one leads by more than 1 turn).`));
      }
    }

    function fmtTime(s) {
      const m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return (m > 0 ? m + ":" + String(sec).padStart(2, "0") : sec + "s");
    }

    function renderMeters(showScore) {
      const meSeat = ctx.isOnline ? ctx.mySeat : -1;
      metersEl.innerHTML = [0, 1].map((p) => {
        const ticking = tickSeat === p && !over;
        const main = showScore ? ctx.t(`${score(p)}đ`, `${score(p)}pts`) : `⏱️ ${fmtTime(liveTime(p))}`;
        const youTag = (meSeat === p) ? ctx.t(" (bạn)", " (you)") : "";
        const wonTag = won[p] ? " ✅" : "";
        return `<div class="bc-meter bc-p${p + 1}${ticking ? " ticking" : ""}">
          <span class="bc-meter-name">${ctx.t("Người chơi", "Player")} ${p + 1}${youTag}${wonTag}</span>
          <b class="bc-meter-main">${main}</b>
          <small>${ctx.t("Lượt", "Turn")} ${rounds[p]} · 💡 ${hintsLeft[p]}/${MAX_HINTS}</small>
        </div>`;
      }).join("");
    }

    // ====================== Online messages ======================
    function applyMove(move, fromRemote) {
      if (!fromRemote) return;
      const opp = ctx.isOnline ? 1 - ctx.mySeat : null;

      if (move.kind === "ready") { oppReady = true; if (iReady) beginPlay(); return; }

      if (move.kind === "guess") {
        // đối thủ đoán dãy của TÔI -> tôi chấm rồi gửi lại
        const { bulls, cows } = evaluate(move.digits, mySecret);
        const win = bulls === LEN;
        rounds[opp]++;
        if (win && !won[opp]) { won[opp] = true; wonAt[opp] = rounds[opp]; }
        ctx.sendMove({ kind: "result", digits: move.digits, bulls, cows, win, round: rounds[opp] });
        logGuess(oppLog, move.digits, bulls, cows, rounds[opp]);
        ctx.sound(bulls === LEN ? "capture" : "select");
        checkFinishAndContinue();
        return;
      }

      if (move.kind === "result") {
        // kết quả cho phát đoán của TÔI
        awaiting = false;
        const me = ctx.mySeat;
        rounds[me] = move.round || rounds[me] + 1;
        lastGuess[me] = move.digits;
        logGuess(mineLog, move.digits, move.bulls, move.cows, rounds[me]);
        ctx.sound(move.bulls === LEN ? "capture" : move.bulls > 0 ? "shot" : "select");
        if (move.win && !won[me]) { won[me] = true; wonAt[me] = rounds[me]; }
        checkFinishAndContinue();
        return;
      }

      if (move.kind === "hint") {
        // đối thủ xin trợ giúp về dãy của TÔI -> tôi tính và trả
        const payload = computeHintForSecret(move.htype, opp, mySecret);
        ctx.sendMove({ kind: "hintres", htype: move.htype, payload });
        return;
      }

      if (move.kind === "hintres") {
        showHintResult(ctx.mySeat, move.htype, move.payload);
        updateInput();
        return;
      }
    }

    // online: tính hint dựa trên secret của mình (đối thủ 'opp' đang đoán)
    function computeHintForSecret(htype, opp, secret) {
      if (htype === "reveal") {
        const pos = pickRevealPos(opp);
        return { pos, digit: secret[pos] };
      }
      if (htype === "count") {
        const last = lastGuess[opp];
        if (!last) return { none: true };
        const inSecret = [...new Set(last.split(""))].filter((d) => secret.includes(d)).length;
        return { guess: last, inSecret };
      }
      return {};
    }

    // hot-seat: cập nhật lastGuess khi đoán
    // (đã xử lý trong applyGuessResult)

    // ----- khởi tạo -----
    if (ctx.isOnline) {
      showSetUI(ctx.mySeat, true);
      ctx.setStatus(ctx.t("Đặt dãy số bí mật để bắt đầu.", "Set your secret number to begin."));
    } else {
      showSetUI(0, false);
      ctx.setStatus(ctx.t("Người chơi 1: đặt dãy số bí mật.", "Player 1: set your secret number."));
    }

    return { applyMove };
  }

  window.GameRegistry.register({
    id: "bullscows",
    name: "Đoán Số (Bulls & Cows)",
    emoji: "🔢",
    description: "Đặt dãy số bí mật, cùng đua nhau đoán dãy đối thủ. Có trợ giúp, đồng hồ và chấm điểm theo tốc độ.",
    onlineReady: true,
    options: [
      {
        id: "len", label: "Độ dài dãy", default: 4,
        choices: [
          { value: 3, label: "3 số (dễ)" },
          { value: 4, label: "4 số (chuẩn)" },
          { value: 5, label: "5 số (khó)" },
        ],
      },
      {
        id: "unique", label: "Chữ số", default: true,
        choices: [
          { value: true, label: "Không trùng nhau" },
          { value: false, label: "Cho phép trùng" },
        ],
      },
    ],
    howTo: [
      "Mỗi người đặt một dãy số bí mật. Sau đó CẢ HAI cùng đoán dãy của đối thủ — không phải chờ lượt nhau.",
      "Công bằng: không ai được dẫn quá 1 lượt. Nếu bạn đã đoán nhiều hơn đối thủ, phải chờ họ đoán cho bằng rồi mới đoán tiếp.",
      "🎯 = chữ số đúng và đúng vị trí. 🐮 = đúng số nhưng sai vị trí. Ví dụ đáp án 1234, đoán 1325 → 🎯 (số 1) + 🐮🐮 (3 và 2).",
      "Trợ giúp (mỗi người 2 lần): 🔍 Lộ 1 vị trí (cho biết chữ số đúng ở 1 ô), 🧮 Đếm số đúng (đếm chữ số của lần đoán gần nhất có trong đáp án).",
      "Chấm điểm: thắng càng NHANH điểm càng cao — mỗi lượt thừa −8đ, mỗi 5 giây suy nghĩ −2đ, mỗi trợ giúp −10đ (tối đa 120đ).",
      "Đồng hồ chỉ chạy khi tới lượt bạn nghĩ; đoán xong là dừng, lượt sau lại chạy tiếp và cộng dồn. Ai đoán đúng ở lượt sớm hơn sẽ thắng; cùng lượt thì so điểm.",
      "📝 Bảng ghi chú: bấm vào số 0-9 để tự đánh dấu ✓ (chắc có) hoặc ✗ (đã loại) giúp suy luận dễ hơn. Mỗi người có bảng riêng, chỉ bạn thấy. Có thể dùng bàn phím số bấm chuột để nhập cho nhanh.",
    ],
    create,
  });
})();
