/* Đua Bấm Nút (Reaction Duel) — chơi chung máy & ONLINE
   Chờ tín hiệu XANH rồi bấm thật nhanh. Bấm trước khi đèn xanh = phạm quy, thua vòng.
   Chung máy: P1 phím A (panel trái), P2 phím L (panel phải).
   Online: mỗi người chỉ điều khiển panel của mình (bấm panel / phím A,L / Space).

   Online công bằng: độ trễ đèn xanh sinh tất định từ seed chung nên cả hai chờ như
   nhau; THỜI GIAN PHẢN XẠ được đo cục bộ trên từng máy (kể từ lúc máy đó hiện đèn
   xanh) rồi mới relay con số — nên độ trễ mạng KHÔNG ảnh hưởng ai nhanh hơn. */
(function () {
  function create(ctx) {
    const o = ctx.options || {};
    const WIN_ROUNDS = o.rounds || 3;
    const MIN_WAIT = (o.wait === "fast" ? 700 : o.wait === "slow" ? 2000 : 1200);
    const MAX_WAIT = MIN_WAIT + (o.wait === "fast" ? 1500 : o.wait === "slow" ? 4000 : 2800);
    const online = ctx.isOnline;
    const mySeat = online ? ctx.mySeat : -1;

    const BEST_KEY = "tpg_rd2_best";
    function getBest() { try { const v = +localStorage.getItem(BEST_KEY); return v > 0 ? v : 0; } catch (e) { return 0; } }
    function setBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ } }

    let score = [0, 0];
    let over = false;
    let phase = "idle";      // idle | countdown | waiting | go | done
    let signalAt = 0;        // mốc thời gian đèn chuyển xanh (cục bộ)
    let goTimer = null;
    let cdTimer = null;
    let results = [null, null]; // mỗi vòng: {rt} hoặc {foul:true}
    let resolved = false;
    let bestRt = getBest();

    function pname(seat) {
      if (!online) return "P" + (seat + 1);
      return "P" + (seat + 1) + (seat === mySeat ? ctx.t(" (bạn)", " (you)") : ctx.t(" (đối thủ)", " (opp)"));
    }
    const keyHint = [online ? (mySeat === 0 ? "A" : "—") : "A", online ? (mySeat === 1 ? "L" : "—") : "L"];

    const root = document.createElement("div");
    root.className = "rd2-root";
    root.innerHTML =
      `<div class="rd2-arena">` +
        `<button type="button" class="rd2-pad rd2-p1" data-seat="0" aria-label="${ctx.t("Vùng bấm Người chơi 1", "Player 1 tap zone")}">` +
          `<span class="rd2-pad-name">${pname(0)}</span><span class="rd2-pad-key">${online && mySeat !== 0 ? "" : "A"}</span><span class="rd2-pad-rt" data-rt="0"></span>` +
        `</button>` +
        `<div class="rd2-light" id="rd2Light"><span class="rd2-light-text"></span></div>` +
        `<button type="button" class="rd2-pad rd2-p2" data-seat="1" aria-label="${ctx.t("Vùng bấm Người chơi 2", "Player 2 tap zone")}">` +
          `<span class="rd2-pad-name">${pname(1)}</span><span class="rd2-pad-key">${online && mySeat !== 1 ? "" : "L"}</span><span class="rd2-pad-rt" data-rt="1"></span>` +
        `</button>` +
      `</div>` +
      `<div class="rd2-score"><b class="rd2-s1">0</b><span class="rd2-vs">${ctx.t("vòng", "round")} 1/${WIN_ROUNDS}</span><b class="rd2-s2">0</b></div>` +
      `<div class="rd2-best" id="rd2Best"></div>` +
      `<button type="button" class="btn primary rd2-start">${ctx.t("Bắt đầu vòng", "Start round")}</button>`;
    ctx.boardEl.appendChild(root);

    const lightEl = root.querySelector("#rd2Light");
    const lightText = root.querySelector(".rd2-light-text");
    const startBtn = root.querySelector(".rd2-start");
    const s1El = root.querySelector(".rd2-s1");
    const s2El = root.querySelector(".rd2-s2");
    const vsEl = root.querySelector(".rd2-vs");
    const bestEl = root.querySelector("#rd2Best");
    const rtEls = [root.querySelector('[data-rt="0"]'), root.querySelector('[data-rt="1"]')];
    const pads = [root.querySelector(".rd2-p1"), root.querySelector(".rd2-p2")];

    if (online) pads[1 - mySeat].classList.add("rd2-disabled");

    function renderBest() {
      bestEl.innerHTML = bestRt > 0
        ? ctx.t(`🏅 Kỷ lục phản xạ: <b>${bestRt}ms</b>`, `🏅 Best reaction: <b>${bestRt}ms</b>`)
        : ctx.t("🏅 Chưa có kỷ lục — bấm nhanh để lập!", "🏅 No record yet — be fast to set one!");
    }
    function setLight(cls, text) { lightEl.className = "rd2-light " + cls; lightText.textContent = text; }

    function startRound(fromRemote) {
      if (over || phase === "countdown" || phase === "waiting" || phase === "go") return;
      results = [null, null]; resolved = false;
      rtEls.forEach((e) => (e.textContent = ""));
      pads.forEach((p) => p.classList.remove("foul", "win", "lose"));
      startBtn.disabled = true;
      phase = "countdown";
      let cd = 3;
      setLight("count", String(cd));
      ctx.sound("place");
      ctx.setStatus(ctx.t("Chuẩn bị...", "Get ready..."));
      if (online && !fromRemote) ctx.sendMove({ k: "start" });
      cdTimer = setInterval(() => {
        cd--;
        if (cd > 0) { setLight("count", String(cd)); ctx.sound("place"); }
        else { clearInterval(cdTimer); cdTimer = null; beginWait(); }
      }, 700);
    }

    function beginWait() {
      phase = "waiting";
      setLight("wait", ctx.t("Chờ đèn XANH...", "Wait for GREEN..."));
      ctx.setStatus(ctx.t("Đừng bấm sớm! Bấm trước khi xanh sẽ thua vòng.", "Don't jump the gun! Tapping before green loses the round."));
      // online: dùng rng chung (cả hai cùng giá trị) -> chờ như nhau
      const r = online ? ctx.rng() : Math.random();
      const delay = MIN_WAIT + r * (MAX_WAIT - MIN_WAIT);
      goTimer = setTimeout(() => {
        phase = "go";
        signalAt = Date.now();
        setLight("go", ctx.t("BẤM NGAY!", "TAP NOW!"));
        ctx.sound("notify");
      }, delay);
    }

    function press(seat) {
      if (over) return;
      if (online && seat !== mySeat) return;
      if (phase === "idle" || phase === "done" || phase === "countdown") return;
      if (phase === "waiting") {
        // bấm sớm -> phạm quy
        clearTimeout(goTimer);
        pads[seat].classList.add("foul");
        ctx.sound("miss");
        if (online) {
          results[mySeat] = { foul: true };
          ctx.sendMove({ k: "foul" });
          ctx.setStatus(ctx.t("Bạn bấm sớm — phạm quy!", "You jumped early — foul!"));
          resolveRound();
        } else {
          finishRound(1 - seat, true, seat);
        }
        return;
      }
      if (phase === "go") {
        if (online) {
          if (results[mySeat]) return;
          const ms = Date.now() - signalAt;
          results[mySeat] = { rt: ms };
          showRt(mySeat, ms);
          ctx.sound("place");
          ctx.sendMove({ k: "rt", ms });
          ctx.setStatus(ctx.t(`Bạn: ${ms}ms — chờ đối thủ...`, `You: ${ms}ms — waiting for opponent...`));
          resolveRound();
        } else {
          if (results[seat]) return;
          const ms = Date.now() - signalAt;
          results[seat] = { rt: ms };
          showRt(seat, ms);
          ctx.sound("place");
          finishRound(seat, false, -1); // local: ai bấm hợp lệ trước thắng vòng
        }
      }
    }

    function showRt(seat, ms) {
      rtEls[seat].textContent = ms + "ms";
      if (ms > 0 && (bestRt === 0 || ms < bestRt)) {
        bestRt = ms; setBest(bestRt);
        rtEls[seat].textContent = ms + "ms 🏅";
        renderBest();
      }
    }

    function resolveRound() {
      if (resolved || over) return;
      const r0 = results[0], r1 = results[1];
      if (r0 && r0.foul) { resolved = true; finishRound(1, "foul", 0); return; }
      if (r1 && r1.foul) { resolved = true; finishRound(0, "foul", 1); return; }
      if (r0 && r1) {
        const w = r0.rt <= r1.rt ? 0 : 1;
        resolved = true; finishRound(w, "rt", -1);
      }
    }

    function finishRound(winner, reason, foulSeat) {
      phase = "done";
      score[winner]++;
      s1El.textContent = score[0];
      s2El.textContent = score[1];
      pads[winner].classList.add("win");
      pads[1 - winner].classList.add("lose");
      setLight("done", "");
      // hiện rt đối thủ nếu có (online)
      if (online && results[1 - mySeat] && results[1 - mySeat].rt != null) showRt(1 - mySeat, results[1 - mySeat].rt);

      const youWin = online ? winner === mySeat : false;
      if (score[winner] >= WIN_ROUNDS) {
        over = true;
        ctx.incScore(winner);
        ctx.setTurn(-1);
        const who = online ? (youWin ? ctx.t("Bạn", "You") : ctx.t("Đối thủ", "Opponent")) : ("P" + (winner + 1));
        setLight("done", online ? (youWin ? ctx.t("🎉 Bạn vô địch!", "🎉 You win!") : ctx.t("Đối thủ vô địch", "Opponent wins")) : ctx.t(`🎉 P${winner + 1} vô địch!`, `🎉 P${winner + 1} wins!`));
        ctx.setStatus(ctx.t(`🎉 ${who} thắng chung cuộc ${score[0]}–${score[1]}!`, `🎉 ${who} wins the match ${score[0]}–${score[1]}!`));
        startBtn.disabled = true;
        startBtn.textContent = ctx.t("Đã kết thúc", "Match over");
        return;
      }
      let msg;
      if (reason === "foul") {
        const fName = online ? (foulSeat === mySeat ? ctx.t("Bạn", "You") : ctx.t("Đối thủ", "Opp")) : ("P" + (foulSeat + 1));
        const wName = online ? (winner === mySeat ? ctx.t("bạn", "you") : ctx.t("đối thủ", "opp")) : ("P" + (winner + 1));
        msg = ctx.t(`${fName} bấm sớm — ${wName} thắng vòng.`, `${fName} jumped early — ${wName} takes the round.`);
      } else {
        const wName = online ? (youWin ? ctx.t("Bạn", "You") : ctx.t("Đối thủ", "Opponent")) : ("P" + (winner + 1));
        msg = ctx.t(`${wName} nhanh hơn (${results[winner].rt}ms) — thắng vòng!`, `${wName} was faster (${results[winner].rt}ms) — round won!`);
      }
      vsEl.textContent = ctx.t("vòng", "round") + " " + (score[0] + score[1] + 1) + "/" + WIN_ROUNDS;
      ctx.setStatus(msg);
      startBtn.disabled = false;
      startBtn.textContent = ctx.t("Vòng tiếp theo", "Next round");
    }

    pads.forEach((pad) => {
      pad.addEventListener("click", () => {
        const seat = Number(pad.getAttribute("data-seat"));
        press(online ? mySeat : seat);
      });
    });
    startBtn.addEventListener("click", () => startRound(false));

    function onKey(e) {
      const k = e.key.toLowerCase();
      if (online) {
        if (k === "a" || k === "l" || k === " " || k === "enter") {
          if ((k === " " || k === "enter") && (phase === "idle" || phase === "done")) { e.preventDefault(); startRound(false); return; }
          e.preventDefault(); press(mySeat);
        }
        return;
      }
      if (k === "a") { e.preventDefault(); press(0); }
      else if (k === "l") { e.preventDefault(); press(1); }
      else if (k === " " || k === "enter") { if (phase === "idle" || phase === "done") { e.preventDefault(); startRound(false); } }
    }
    window.addEventListener("keydown", onKey);

    const cleanup = () => { clearTimeout(goTimer); clearInterval(cdTimer); window.removeEventListener("keydown", onKey); };
    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) { cleanup(); observer.disconnect(); }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setTurn(-1);
    setLight("idle", ctx.t("Sẵn sàng", "Ready"));
    renderBest();
    void keyHint;
    ctx.setStatus(online
      ? ctx.t(`Bấm "Bắt đầu vòng" (cả hai cùng vào). Chờ đèn XANH rồi bấm panel/phím/Space thật nhanh. Bấm sớm là thua vòng!`,
        `Press "Start round" (both begin). Wait for GREEN then tap your pad/key/Space fast. Tapping early loses the round!`)
      : ctx.t(`Bấm "Bắt đầu vòng". P1 dùng phím A, P2 dùng phím L. Chờ đèn XANH rồi bấm thật nhanh!`,
        `Press "Start round". P1 uses key A, P2 uses key L. Wait for GREEN then tap fast!`));

    function applyMove(move, fromRemote) {
      if (!move || !fromRemote) return;
      switch (move.k) {
        case "start": startRound(true); break;
        case "rt": results[1 - mySeat] = { rt: Number(move.ms) || 0 }; resolveRound(); break;
        case "foul": results[1 - mySeat] = { foul: true }; resolveRound(); break;
      }
    }
    function destroy() { cleanup(); observer.disconnect(); }
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "reactionduel",
    name: "Đua Bấm Nút",
    emoji: "⚡",
    description: "Chờ đèn xanh rồi bấm thật nhanh — bấm sớm là thua. Đấu phản xạ thuần túy, chơi chung máy hoặc online.",
    onlineReady: true,
    supportsAI: false,
    options: [
      {
        id: "rounds", label: "Số vòng để thắng", default: 3,
        choices: [
          { value: 2, label: "2 vòng (nhanh)" },
          { value: 3, label: "3 vòng" },
          { value: 5, label: "5 vòng" },
        ],
      },
      {
        id: "wait", label: "Độ trễ đèn xanh", default: "normal",
        choices: [
          { value: "fast", label: "Ngắn (gắt)" },
          { value: "normal", label: "Vừa" },
          { value: "slow", label: "Dài (hồi hộp)" },
        ],
      },
    ],
    howTo: [
      "Bấm \"Bắt đầu vòng\". Online: một người bấm là cả hai cùng vào vòng. Đèn sẽ ở trạng thái CHỜ trong một khoảng thời gian ngẫu nhiên (online: giống hệt nhau ở hai máy).",
      "Khi đèn chuyển XANH và hiện \"BẤM NGAY!\", hãy bấm thật nhanh. Chung máy: P1 phím A (vùng trái), P2 phím L (vùng phải). Online: bấm panel của bạn / phím A,L / Space.",
      "Online so THỜI GIAN PHẢN XẠ: mỗi máy tự đo từ lúc hiện đèn xanh nên độ trễ mạng không ảnh hưởng — ai phản xạ nhanh hơn (ms thấp hơn) thắng vòng.",
      "Chung máy: ai bấm hợp lệ trước thắng vòng đó; thời gian phản xạ (ms) hiển thị trên panel.",
      "CẢNH BÁO: nếu bấm TRƯỚC khi đèn xanh, bạn phạm quy và thua vòng ngay lập tức.",
      "Người đầu tiên thắng đủ số vòng đã chọn sẽ vô địch. Kỷ lục phản xạ tốt nhất được lưu trên máy.",
    ],
    create,
  });
})();
