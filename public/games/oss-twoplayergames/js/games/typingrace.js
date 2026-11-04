/* Đua Gõ Phím (Typing Race) — chơi chung máy & ONLINE
   Cả hai cùng thấy MỘT chuỗi từ tiếng Việt giống nhau (sinh tất định từ seed chung).
   Mỗi người gõ vào ô của mình; gõ đúng từ hiện tại (kèm dấu) thì sang từ kế. Ai gõ
   xong đủ số từ trước sẽ THẮNG.

   Online: mỗi người chỉ điều khiển làn của mình; chỉ relay TIẾN ĐỘ (đã gõ tới từ
   thứ mấy) và lúc HOÀN THÀNH (kèm thời gian). Vì thời gian tính cục bộ từ lúc mỗi
   máy bắt đầu nên độ trễ mạng không làm sai lệch ai nhanh hơn. */
(function () {
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }

  function create(ctx) {
    const o = ctx.options || {};
    const COUNT = o.count ? Number(o.count) : 12;   // số từ phải gõ
    const dict = (typeof window !== "undefined" && window.VI_DICT) ? window.VI_DICT : new Set();
    const online = ctx.isOnline;
    const mySeat = online ? ctx.mySeat : -1;

    // rút COUNT từ tất định từ từ điển (cùng seed -> cùng danh sách trên cả hai máy)
    const all = [];
    for (const w of dict) { all.push(w); if (all.length >= 5000) break; }
    const words = [];
    for (let i = 0; i < COUNT; i++) {
      words.push(all.length ? all[Math.floor(ctx.rng() * all.length)] : "tu " + (i + 1));
    }

    let idx = [0, 0];          // tiến độ mỗi người
    let over = false;
    let started = false;
    let startAt = 0;
    let doneMs = [-1, -1];

    function lbl(seat) {
      if (!online) return "P" + (seat + 1);
      return "P" + (seat + 1) + (seat === mySeat ? ctx.t(" (bạn)", " (you)") : ctx.t(" (đối thủ)", " (opponent)"));
    }

    const root = document.createElement("div");
    root.className = "tr2-root";
    root.innerHTML =
      `<div class="tr2-prog"><div class="tr2-bar p1"><i id="tr2Bar0"></i></div>` +
        `<div class="tr2-bar p2"><i id="tr2Bar1"></i></div></div>` +
      `<div class="tr2-lane" data-seat="0">` +
        `<div class="tr2-head">🟥 ${lbl(0)} <span class="tr2-cnt" id="tr2Cnt0">0/${COUNT}</span></div>` +
        `<div class="tr2-word" id="tr2Word0"></div>` +
        `<input class="tr2-in" id="tr2In0" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ctx.t("Gõ từ rồi nhấn Space/Enter", "Type the word then Space/Enter")}" />` +
      `</div>` +
      `<div class="tr2-lane" data-seat="1">` +
        `<div class="tr2-head">🟦 ${lbl(1)} <span class="tr2-cnt" id="tr2Cnt1">0/${COUNT}</span></div>` +
        `<div class="tr2-word" id="tr2Word1"></div>` +
        `<input class="tr2-in" id="tr2In1" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ctx.t("Gõ từ rồi nhấn Space/Enter", "Type the word then Space/Enter")}" />` +
      `</div>` +
      `<button type="button" class="btn primary tr2-start">${ctx.t("Bắt đầu đua", "Start race")}</button>`;
    ctx.boardEl.appendChild(root);

    const ins = [root.querySelector("#tr2In0"), root.querySelector("#tr2In1")];
    const wordEls = [root.querySelector("#tr2Word0"), root.querySelector("#tr2Word1")];
    const cntEls = [root.querySelector("#tr2Cnt0"), root.querySelector("#tr2Cnt1")];
    const bars = [root.querySelector("#tr2Bar0"), root.querySelector("#tr2Bar1")];
    const lanes = [root.querySelector('.tr2-lane[data-seat="0"]'), root.querySelector('.tr2-lane[data-seat="1"]')];
    const startBtn = root.querySelector(".tr2-start");

    function iControl(seat) { return online ? seat === mySeat : true; }

    function renderWord(seat) {
      const i = idx[seat];
      if (i >= words.length) { wordEls[seat].innerHTML = `<span class="tr2-done">✓ ${ctx.t("Xong!", "Done!")}</span>`; cntEls[seat].textContent = words.length + "/" + words.length; bars[seat].style.width = "100%"; return; }
      const cur = words[i];
      const nextW = words.slice(i + 1, i + 3).join(" ");
      wordEls[seat].innerHTML = `<b class="tr2-cur">${cur}</b>` + (nextW ? ` <span class="tr2-next">${nextW}</span>` : "");
      cntEls[seat].textContent = i + "/" + words.length;
      bars[seat].style.width = Math.round(i / words.length * 100) + "%";
    }

    function checkInput(seat) {
      if (!iControl(seat)) { ins[seat].value = ""; return; }
      if (over || !started) { ins[seat].value = ""; return; }
      const typed = norm(ins[seat].value);
      const target = norm(words[idx[seat]] || "");
      if (!typed) return;
      if (typed === target) {
        idx[seat]++;
        ins[seat].value = "";
        ins[seat].classList.remove("wrong");
        ctx.sound("place");
        renderWord(seat);
        if (online) ctx.sendMove({ k: "prog", i: idx[seat] });
        if (idx[seat] >= words.length) localComplete(seat);
      } else if (!target.startsWith(typed)) {
        ins[seat].classList.add("wrong");
      } else {
        ins[seat].classList.remove("wrong");
      }
    }

    function submit(seat) {
      if (!iControl(seat)) return;
      const typed = norm(ins[seat].value);
      const target = norm(words[idx[seat]] || "");
      if (typed === target) { checkInput(seat); }
      else { ins[seat].classList.add("wrong"); ctx.sound("miss"); }
    }

    function localComplete(seat) {
      const ms = Date.now() - startAt;
      if (online) {
        doneMs[mySeat] = ms;
        ctx.sendMove({ k: "done", ms });
        resolve();
      } else {
        decide(seat, ms);
      }
    }

    function resolve() {
      if (over) return;
      const a = doneMs[0], b = doneMs[1];
      if (a >= 0 && b >= 0) { decide(a <= b ? 0 : 1, Math.min(a, b)); }
      else if (doneMs[mySeat] >= 0) { decide(mySeat, doneMs[mySeat]); }
      else if (doneMs[1 - mySeat] >= 0) { decide(1 - mySeat, doneMs[1 - mySeat]); }
    }

    function decide(winner, ms) {
      if (over) return;
      over = true;
      ctx.incScore(winner);
      ctx.setTurn(-1);
      ctx.sound(online ? (winner === mySeat ? "win" : "lose") : "win");
      const secs = (ms / 1000).toFixed(1);
      const who = online ? (winner === mySeat ? ctx.t("Bạn", "You") : ctx.t("Đối thủ", "Opponent")) : ctx.t("Người chơi " + (winner + 1), "Player " + (winner + 1));
      ctx.setStatus(ctx.t(`🎉 ${who} gõ xong trước trong ${secs}s — thắng!`, `🎉 ${who} finished first in ${secs}s — wins!`));
      ins.forEach((e) => (e.disabled = true));
      startBtn.disabled = true;
      startBtn.textContent = ctx.t("Đã kết thúc", "Race over");
    }

    function startRace(fromRemote) {
      if (started) return;
      started = true; over = false;
      idx = [0, 0]; doneMs = [-1, -1];
      startAt = Date.now();
      ins.forEach((e, s) => { e.value = ""; e.disabled = !iControl(s); renderWord(s); });
      if (iControl(0) && !online) ins[0].focus(); else if (online) ins[mySeat].focus();
      startBtn.disabled = true;
      startBtn.textContent = ctx.t("Đang đua...", "Racing...");
      ctx.sound("notify");
      if (online && !fromRemote) ctx.sendMove({ k: "go" });
      ctx.setStatus(ctx.t("Đua! Gõ đúng từng từ, nhấn Space/Enter để sang từ kế.", "Race! Type each word, press Space/Enter for the next."));
    }

    ins.forEach((inp, seat) => {
      inp.addEventListener("input", () => checkInput(seat));
      inp.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); submit(seat); }
      });
    });
    startBtn.addEventListener("click", () => startRace(false));

    // Online: vô hiệu hoá làn đối thủ ngay từ đầu cho rõ ràng
    if (online) {
      lanes[1 - mySeat].classList.add("tr2-opp");
      ins[1 - mySeat].disabled = true;
      ins[1 - mySeat].placeholder = ctx.t("(làn đối thủ)", "(opponent's lane)");
    }

    ins.forEach((e) => (e.disabled = true));
    renderWord(0); renderWord(1);
    ctx.setTurn(-1);
    const startHint = online
      ? ctx.t(`Bấm "Bắt đầu đua" để cả hai cùng vào. Bạn gõ làn của mình; ai gõ đúng đủ ${COUNT} từ trước sẽ thắng. Nhớ gõ cả dấu!`,
        `Press "Start race" to begin together. Type your own lane; first to correctly type all ${COUNT} words wins. Type the accents too!`)
      : ctx.t(`Bấm "Bắt đầu đua". Hai người gõ vào ô của mình; ai gõ đúng đủ ${COUNT} từ trước sẽ thắng. Nhớ gõ cả dấu!`,
        `Press "Start race". Each player types in their box; first to correctly type all ${COUNT} words wins. Type the accents too!`);
    ctx.setStatus(startHint);

    function applyMove(move, fromRemote) {
      if (!move || !fromRemote) return;
      switch (move.k) {
        case "go": startRace(true); break;
        case "prog": {
          const seat = 1 - mySeat;
          idx[seat] = Math.max(0, Math.min(words.length, Number(move.i) || 0));
          renderWord(seat);
          break;
        }
        case "done": {
          doneMs[1 - mySeat] = Number(move.ms) || 0;
          resolve();
          break;
        }
      }
    }
    function destroy() {}
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "typingrace",
    name: "Đua Gõ Phím",
    emoji: "⌨️",
    description: "Hai người đua gõ đúng các từ tiếng Việt — ai gõ xong đủ số từ trước thì thắng. Chơi chung máy hoặc online.",
    onlineReady: true,
    supportsAI: false,
    options: [
      {
        id: "count", label: "Số từ phải gõ", default: 12,
        choices: [
          { value: 8, label: "8 từ (nhanh)" },
          { value: 12, label: "12 từ" },
          { value: 20, label: "20 từ (dài)" },
        ],
      },
    ],
    howTo: [
      "Cả hai cùng nhận MỘT chuỗi từ tiếng Việt giống hệt nhau (sinh tất định nên hai máy luôn khớp).",
      "Bấm \"Bắt đầu đua\". Online: một người bấm là cả hai cùng vào; mỗi người chỉ gõ ở LÀN CỦA MÌNH. Chung máy: P1 ô trên, P2 ô dưới.",
      "Gõ ĐÚNG từ đang hiển thị (kèm dấu) rồi nhấn Space/Enter để sang từ kế. Gõ sai hướng thì ô chuyển đỏ — sửa lại cho khớp.",
      "Thanh tiến độ cho thấy mỗi người đã gõ tới đâu (online cập nhật theo thời gian thực qua mạng).",
      "Ai gõ đúng hết toàn bộ số từ trước sẽ thắng; thời gian hoàn thành được hiển thị.",
      "Online công bằng tuyệt đối: thời gian tính từ lúc MỖI máy bắt đầu nên độ trễ mạng không ảnh hưởng ai nhanh hơn.",
    ],
    create,
  });
})();
