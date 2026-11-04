/* 💣 Gỡ Bom Song Phương (Defuse Duo) — co-op, chơi chung máy & ONLINE
   Cảm hứng từ "Keep Talking and Nobody Explodes". Hai người CÙNG PHE:
   - 🔧 KỸ THUẬT VIÊN (seat 0): nhìn thấy quả bom (số seri + các module dây màu),
     và là người CẮT dây.
   - 📖 CHUYÊN GIA (seat 1): KHÔNG thấy bom, chỉ có SỔ HƯỚNG DẪN (luật cắt dây).
   Hai người phải NÓI CHUYỆN: kỹ thuật viên mô tả dây, chuyên gia tra luật và bảo
   cắt dây nào. Gỡ hết 3 module trước khi hết giờ = THẮNG. Sai 3 lần hoặc hết giờ = NỔ.

   Đồng bộ online: quả bom sinh TẤT ĐỊNH từ ctx.rng (seed chung) nên hai máy có
   cùng quả bom; chỉ relay hành động cắt { k:"cut", m, idx }. Mỗi máy chỉ HIỂN THỊ
   phần của vai mình (online); chơi chung máy thì hiện cả hai bảng cạnh nhau.
   Chung máy hiện đáp án để vẫn giải được; online thì giấu để đúng tinh thần co-op. */
(function () {
  const COLORS = ["red", "blue", "yellow", "white", "black"];
  const COLOR_VI = { red: "Đỏ", blue: "Xanh dương", yellow: "Vàng", white: "Trắng", black: "Đen" };
  const COLOR_EN = { red: "Red", blue: "Blue", yellow: "Yellow", white: "White", black: "Black" };
  const COLOR_HEX = { red: "#e6394a", blue: "#3a82f6", yellow: "#f5c542", white: "#e8ecf5", black: "#2a2f3e" };
  const MAX_STRIKES = 3;
  const NMODULES = 3;

  // ---- Luật cắt dây (tất định theo số dây + màu + seri lẻ/chẵn). Trả index 0-based. ----
  function count(wires, c) { return wires.filter((w) => w === c).length; }

  function solveModule(wires, serialOdd) {
    const n = wires.length;
    const last = n - 1;
    if (n === 4) {
      if (count(wires, "red") === 0) return 1;                 // không có đỏ -> dây 2
      if (wires[last] === "white") return last;                // dây cuối trắng -> dây cuối
      if (count(wires, "blue") === 1) return wires.indexOf("blue"); // đúng 1 xanh -> dây xanh
      if (count(wires, "yellow") > 1) return last;             // >1 vàng -> dây cuối
      return 0;                                                // còn lại -> dây 1
    }
    if (n === 5) {
      if (wires[last] === "black" && serialOdd) return 3;      // cuối đen & seri lẻ -> dây 4
      if (count(wires, "red") === 1 && count(wires, "yellow") > 1) return 0; // 1 đỏ & >1 vàng -> dây 1
      if (count(wires, "black") === 0) return 1;               // không đen -> dây 2
      return 0;                                                // còn lại -> dây 1
    }
    // n === 6
    if (count(wires, "yellow") === 0 && serialOdd) return 2;   // không vàng & seri lẻ -> dây 3
    if (count(wires, "yellow") === 1 && count(wires, "white") > 1) return 3; // 1 vàng & >1 trắng -> dây 4
    if (count(wires, "red") === 0) return last;                // không đỏ -> dây cuối
    return 3;                                                  // còn lại -> dây 4
  }

  // các dòng luật để hiển thị cho CHUYÊN GIA (đọc theo số dây)
  function ruleLines(n, ctx) {
    if (n === 4) return [
      ctx.t("Không có dây ĐỎ → cắt dây số 2.", "No RED wire → cut wire 2."),
      ctx.t("Ngược lại, nếu dây CUỐI màu TRẮNG → cắt dây cuối.", "Else, if the LAST wire is WHITE → cut the last wire."),
      ctx.t("Ngược lại, nếu có ĐÚNG 1 dây XANH DƯƠNG → cắt dây xanh đó.", "Else, if there is EXACTLY 1 BLUE wire → cut that blue wire."),
      ctx.t("Ngược lại, nếu có NHIỀU HƠN 1 dây VÀNG → cắt dây cuối.", "Else, if there is MORE THAN 1 YELLOW wire → cut the last wire."),
      ctx.t("Ngược lại → cắt dây số 1.", "Otherwise → cut wire 1."),
    ];
    if (n === 5) return [
      ctx.t("Dây CUỐI màu ĐEN và số seri LẺ → cắt dây số 4.", "LAST wire is BLACK and serial is ODD → cut wire 4."),
      ctx.t("Ngược lại, nếu có 1 dây ĐỎ và NHIỀU HƠN 1 dây VÀNG → cắt dây số 1.", "Else, if there is 1 RED and MORE THAN 1 YELLOW → cut wire 1."),
      ctx.t("Ngược lại, nếu KHÔNG có dây ĐEN → cắt dây số 2.", "Else, if there is NO BLACK wire → cut wire 2."),
      ctx.t("Ngược lại → cắt dây số 1.", "Otherwise → cut wire 1."),
    ];
    return [
      ctx.t("KHÔNG có dây VÀNG và số seri LẺ → cắt dây số 3.", "NO YELLOW wire and serial is ODD → cut wire 3."),
      ctx.t("Ngược lại, nếu có 1 dây VÀNG và NHIỀU HƠN 1 dây TRẮNG → cắt dây số 4.", "Else, if there is 1 YELLOW and MORE THAN 1 WHITE → cut wire 4."),
      ctx.t("Ngược lại, nếu KHÔNG có dây ĐỎ → cắt dây cuối.", "Else, if there is NO RED wire → cut the last wire."),
      ctx.t("Ngược lại → cắt dây số 4.", "Otherwise → cut wire 4."),
    ];
  }

  function create(ctx) {
    const o = ctx.options || {};
    const TIME = o.time ? Number(o.time) : 300;          // tổng giây
    const online = ctx.isOnline;
    const seat = online ? ctx.mySeat : -1;               // -1 = chung máy (thấy cả hai)
    const rng = ctx.rng;

    // ---- sinh quả bom tất định ----
    const serial = Math.floor(rng() * 10);               // 0..9
    const serialOdd = serial % 2 === 1;
    const modules = [];
    for (let m = 0; m < NMODULES; m++) {
      const n = 4 + Math.floor(rng() * 3);               // 4..6 dây
      const wires = [];
      for (let i = 0; i < n; i++) wires.push(COLORS[Math.floor(rng() * COLORS.length)]);
      modules.push({ wires, n, cut: -1, solved: false, answer: solveModule(wires, serialOdd) });
    }

    let curM = 0;            // module đang gỡ
    let strikes = 0;
    let over = false;
    let win = false;
    let timeLeft = TIME;
    let timer = null;

    const root = document.createElement("div");
    root.className = "df-root";
    ctx.boardEl.appendChild(root);

    function isTech() { return !online || seat === 0; }   // ai thấy bom & cắt
    function isExpert() { return !online || seat === 1; } // ai thấy sổ luật

    // ---- đồng hồ ----
    function startTimer() {
      stopTimer();
      timer = setInterval(() => {
        if (over) return stopTimer();
        timeLeft--;
        renderTimer();
        if (timeLeft <= 0) {
          // seat kỹ thuật viên (hoặc chung máy) làm trọng tài thời gian
          if (isTech()) doBoom(true);
        }
      }, 1000);
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    function applyMove(move, fromRemote) {
      if (!move || over) return;
      if (move.k === "cut") {
        const m = Number(move.m), idx = Number(move.idx);
        const mod = modules[m];
        if (!mod || mod.solved || m !== curM) return;
        if (mod.cut !== -1) return;
        // chỉ kỹ thuật viên (hoặc chung máy) được phát; remote luôn áp
        if (!fromRemote && online && seat !== 0) return;
        if (!fromRemote && online) ctx.sendMove({ k: "cut", m, idx });
        resolveCut(m, idx);
        return;
      }
      if (move.k === "boom") { if (!over) doBoom(true, true); return; }
    }

    function resolveCut(m, idx) {
      const mod = modules[m];
      mod.cut = idx;
      if (idx === mod.answer) {
        mod.solved = true;
        ctx.sound("capture");
        curM++;
        if (curM >= NMODULES) return doWin();
        flash(ctx.t(`✅ Module ${m + 1} đã gỡ! Sang module ${curM + 1}.`, `✅ Module ${m + 1} defused! On to module ${curM + 1}.`), "ok");
      } else {
        strikes++;
        mod.cut = -1; // cho cắt lại dây khác
        ctx.sound("error");
        if (strikes >= MAX_STRIKES) return doBoom(false);
        flash(ctx.t(`✂️ Sai rồi! Cắt nhầm dây. Lỗi ${strikes}/${MAX_STRIKES}.`, `✂️ Wrong wire! Strike ${strikes}/${MAX_STRIKES}.`), "bad");
      }
      render();
    }

    function doWin() {
      over = true; win = true;
      stopTimer();
      ctx.setTurn(-1);
      ctx.incScore(0);
      ctx.sound("win");
      render();
      ctx.setStatus(ctx.t(`🎉 GỠ BOM THÀNH CÔNG! Cả đội cứu được thành phố với ${fmt(timeLeft)} còn lại.`,
        `🎉 BOMB DEFUSED! The team saved the city with ${fmt(timeLeft)} left.`));
    }

    function doBoom(byTime, fromRemote) {
      if (over) return;
      over = true; win = false;
      stopTimer();
      if (!fromRemote && online && isTech()) ctx.sendMove({ k: "boom" });
      ctx.setTurn(-1);
      ctx.incScore(1); // "thua" về phe bom
      ctx.sound("lose");
      render();
      ctx.setStatus(byTime
        ? ctx.t("💥 BÙM! Hết giờ — quả bom phát nổ.", "💥 BOOM! Time's up — the bomb exploded.")
        : ctx.t(`💥 BÙM! Cắt sai ${MAX_STRIKES} lần — quả bom phát nổ.`, `💥 BOOM! ${MAX_STRIKES} wrong cuts — the bomb exploded.`));
    }

    // ---------- Giao diện ----------
    let els = null;
    function buildShell() {
      const roleLabel = !online
        ? ctx.t("Chơi chung máy: bạn thấy cả bom và sổ luật.", "Local play: you see both the bomb and the manual.")
        : (seat === 0
          ? ctx.t("Bạn là 🔧 KỸ THUẬT VIÊN — mô tả dây cho đồng đội và cắt theo lời họ.", "You are the 🔧 DEFUSER — describe the wires to your partner and cut as told.")
          : ctx.t("Bạn là 📖 CHUYÊN GIA — đọc sổ luật và chỉ cho đồng đội cắt dây nào.", "You are the 📖 EXPERT — read the manual and tell your partner which wire to cut."));
      root.innerHTML =
        `<div class="df-top">` +
          `<div class="df-timer" id="dfTimer"></div>` +
          `<div class="df-serial" id="dfSerial"></div>` +
          `<div class="df-strikes" id="dfStrikes"></div>` +
        `</div>` +
        `<div class="df-role">${roleLabel}</div>` +
        `<div class="df-flash" id="dfFlash"></div>` +
        `<div class="df-cols">` +
          (isTech() ? `<div class="df-bomb" id="dfBomb"></div>` : "") +
          (isExpert() ? `<div class="df-manual" id="dfManual"></div>` : "") +
        `</div>`;
      els = {
        timer: root.querySelector("#dfTimer"),
        serial: root.querySelector("#dfSerial"),
        strikes: root.querySelector("#dfStrikes"),
        flash: root.querySelector("#dfFlash"),
        bomb: root.querySelector("#dfBomb"),
        manual: root.querySelector("#dfManual"),
      };
    }

    function fmt(s) {
      s = Math.max(0, s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    function renderTimer() {
      if (!els || !els.timer) return;
      els.timer.textContent = "⏱ " + fmt(timeLeft);
      els.timer.classList.toggle("low", timeLeft <= 30);
    }

    function flash(msg, kind) {
      if (!els || !els.flash) return;
      els.flash.textContent = msg;
      els.flash.className = "df-flash show " + (kind || "");
      setTimeout(() => { if (els && els.flash) els.flash.classList.remove("show"); }, 2200);
    }

    function colorName(c) { return ctx.t(COLOR_VI[c], COLOR_EN[c]); }

    function renderBomb() {
      if (!els.bomb) return;
      let html = "";
      modules.forEach((mod, m) => {
        const state = mod.solved ? "solved" : (m === curM ? "active" : (m < curM ? "solved" : "locked"));
        html += `<div class="df-module df-${state}">` +
          `<div class="df-mod-head">${ctx.t("Module", "Module")} ${m + 1}${mod.solved ? " ✅" : m === curM ? " 🔧" : " 🔒"}</div>` +
          `<div class="df-wires">`;
        mod.wires.forEach((c, i) => {
          const canCut = !over && !mod.solved && m === curM && (!online || seat === 0);
          const cut = mod.solved && i === mod.answer;
          html += `<div class="df-wire-row">` +
            `<span class="df-wire-no">${i + 1}</span>` +
            `<button type="button" class="df-wire ${cut ? "df-cut" : ""}" data-m="${m}" data-i="${i}" ${canCut ? "" : "disabled"} style="--wc:${COLOR_HEX[c]}">` +
              `<span class="df-wire-line"></span><span class="df-wire-label">${colorName(c)}</span>` +
            `</button>` +
          `</div>`;
        });
        html += `</div></div>`;
      });
      els.bomb.innerHTML = html;
      els.bomb.querySelectorAll(".df-wire").forEach((b) => {
        b.addEventListener("click", () => applyMove({ k: "cut", m: Number(b.dataset.m), idx: Number(b.dataset.i) }, false));
      });
    }

    function renderManual() {
      if (!els.manual) return;
      // chuyên gia thấy luật theo TỪNG SỐ DÂY (không biết bom hiện có mấy dây)
      let html = `<div class="df-manual-title">📖 ${ctx.t("Sổ hướng dẫn gỡ bom", "Bomb defusal manual")}</div>` +
        `<div class="df-manual-note">${ctx.t("Hỏi đồng đội: module đang gỡ có mấy dây? Số seri lẻ hay chẵn? Rồi đọc đúng mục bên dưới.", "Ask your partner: how many wires does the current module have? Is the serial odd or even? Then read the matching section.")}</div>`;
      [4, 5, 6].forEach((n) => {
        html += `<div class="df-rule"><div class="df-rule-head">${ctx.t("Module có", "Module with")} ${n} ${ctx.t("dây", "wires")}</div><ol>`;
        ruleLines(n, ctx).forEach((line) => { html += `<li>${line}</li>`; });
        html += `</ol></div>`;
      });
      // chung máy: gợi ý seri lẻ/chẵn sẵn
      if (!online) {
        html += `<div class="df-manual-note">${ctx.t(`(Số seri = ${serial} → ${serialOdd ? "LẺ" : "CHẴN"})`, `(Serial = ${serial} → ${serialOdd ? "ODD" : "EVEN"})`)}</div>`;
      }
      els.manual.innerHTML = html;
    }

    function renderStrikes() {
      if (!els.strikes) return;
      let s = "";
      for (let i = 0; i < MAX_STRIKES; i++) s += `<span class="df-x ${i < strikes ? "on" : ""}">✕</span>`;
      els.strikes.innerHTML = s;
    }

    function render() {
      if (!els) buildShell();
      renderTimer();
      if (els.serial) els.serial.innerHTML = isTech()
        ? ctx.t(`Seri: <b>${serial}</b> <small>(${serialOdd ? "lẻ" : "chẵn"})</small>`, `Serial: <b>${serial}</b> <small>(${serialOdd ? "odd" : "even"})</small>`)
        : ctx.t("Seri: <b>?</b> <small>(hỏi đồng đội)</small>", "Serial: <b>?</b> <small>(ask partner)</small>");
      renderStrikes();
      if (els.bomb) renderBomb();
      if (els.manual) renderManual();
      if (over) {
        root.classList.toggle("df-boom", !win);
        root.classList.toggle("df-defused", win);
      }
    }

    function updateStatus() {
      if (over) return;
      if (online && seat === 1) {
        ctx.setStatus(ctx.t("📖 Bạn giữ sổ luật — chỉ cho đồng đội cắt dây nào. Nói nhanh, bom đang chạy!",
          "📖 You hold the manual — tell your partner which wire to cut. Hurry, the timer is running!"));
      } else if (online && seat === 0) {
        ctx.setStatus(ctx.t("🔧 Mô tả dây cho đồng đội (màu, thứ tự) rồi cắt theo chỉ dẫn của họ.",
          "🔧 Describe the wires (color, order) to your partner, then cut as instructed."));
      } else {
        ctx.setStatus(ctx.t("Gỡ 3 module trước khi hết giờ. Đọc sổ luật bên phải, cắt dây bên trái.",
          "Defuse 3 modules before time runs out. Read the manual (right) and cut wires (left)."));
      }
    }

    const observer = new MutationObserver(() => {
      if (!document.body.contains(root)) { stopTimer(); observer.disconnect(); }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    if (online) {
      ctx.setNames(
        ctx.t(`🔧 Kỹ thuật viên${seat === 0 ? " (bạn)" : ""}`, `🔧 Defuser${seat === 0 ? " (you)" : ""}`),
        ctx.t(`📖 Chuyên gia${seat === 1 ? " (bạn)" : ""}`, `📖 Expert${seat === 1 ? " (you)" : ""}`));
    } else {
      ctx.setNames(ctx.t("🔧 Kỹ thuật viên", "🔧 Defuser"), ctx.t("📖 Chuyên gia", "📖 Expert"));
    }
    ctx.setTurn(-1);
    buildShell();
    render();
    updateStatus();
    startTimer();

    function destroy() { stopTimer(); observer.disconnect(); }
    return { applyMove, destroy };
  }

  window.GameRegistry.register({
    id: "defusebomb",
    name: "Gỡ Bom Song Phương",
    emoji: "💣",
    description: "Co-op: một người thấy quả bom và cắt dây, người kia cầm sổ hướng dẫn. Phải nói chuyện để gỡ kịp giờ. Hay nhất khi chơi online.",
    onlineReady: true,
    supportsAI: false,
    coop: true,
    options: [
      {
        id: "time", label: "Thời gian", default: 300,
        choices: [
          { value: 180, label: "3 phút (gắt)" },
          { value: 300, label: "5 phút" },
          { value: 480, label: "8 phút (thong thả)" },
        ],
      },
    ],
    howTo: [
      "Đây là game CO-OP bất đối xứng, hay nhất khi chơi ONLINE (mỗi người một máy). Một người là 🔧 KỸ THUẬT VIÊN, người kia là 📖 CHUYÊN GIA.",
      "🔧 Kỹ thuật viên NHÌN THẤY quả bom: số seri và các module dây màu — nhưng KHÔNG có luật cắt. Họ là người bấm cắt dây.",
      "📖 Chuyên gia có SỔ HƯỚNG DẪN (luật cắt theo số dây) nhưng KHÔNG thấy bom. Hai người phải NÓI CHUYỆN với nhau.",
      "Quy trình: kỹ thuật viên đọc module hiện tại có mấy dây, màu gì theo thứ tự, và số seri lẻ hay chẵn. Chuyên gia tra đúng mục trong sổ rồi bảo cắt dây số mấy.",
      "Gỡ đúng cả 3 module trước khi hết giờ là THẮNG. Cắt nhầm 3 lần (3 ✕) hoặc hết giờ thì BOM NỔ — cả đội thua.",
      "Chơi chung máy cũng được: màn hình hiện cả bom lẫn sổ luật để hai người cùng giải (kém hồi hộp hơn online một chút).",
    ],
    create,
  });
})();
