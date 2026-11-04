/* Rắn & Thang (Snakes & Ladders) — chơi chung máy, ĐẤU MÁY và ONLINE
   Lần lượt gieo xúc xắc, đi quân trên bàn 10x10 (1→100). Leo thang, tụt rắn.
   Quy ước online: giá trị xúc xắc nằm trong payload nước đi để hai máy đồng bộ.
   Phải gieo đúng số để về đích 100 (nếu vượt thì bị "dội" ngược lại). */
(function () {
  const SIZE = 10;
  const GOAL = SIZE * SIZE; // 100

  // Bàn chuẩn: thang (chân -> đỉnh) và rắn (đầu -> đuôi).
  const LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  const SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

  // Đổi số ô (1..100) sang toạ độ lưới boustrophedon (zíc-zắc), gốc dưới-trái.
  function cellToRC(n) {
    const idx = n - 1;
    const row = Math.floor(idx / SIZE);          // 0 = hàng dưới cùng
    let col = idx % SIZE;
    if (row % 2 === 1) col = SIZE - 1 - col;      // hàng lẻ đi ngược
    const top = SIZE - 1 - row;                   // toạ độ hàng từ trên xuống để render
    return { top, col };
  }

  function create(ctx) {
    const o = ctx.options || {};
    const EXACT = o.exact !== "off";              // cần đúng số để về 100
    const SNAKE_ON = o.snakes !== "off";

    let pos = [0, 0];        // 0 = chưa vào bàn (ngoài ô 1)
    let turn = ctx.isOnline ? ctx.firstSeat : 0;
    let over = false;
    let rolling = false;

    const root = document.createElement("div");
    root.className = "sl-root";
    root.innerHTML =
      `<div class="sl-header"></div>` +
      `<div class="sl-board" id="slBoard"></div>` +
      `<div class="sl-controls">` +
        `<div class="sl-die" id="slDie">🎲</div>` +
        `<button class="btn primary sl-roll" type="button">${ctx.t("Gieo xúc xắc", "Roll dice")}</button>` +
      `</div>`;
    ctx.boardEl.appendChild(root);

    const boardEl = root.querySelector("#slBoard");
    const header = root.querySelector(".sl-header");
    const dieEl = root.querySelector("#slDie");
    const rollBtn = root.querySelector(".sl-roll");

    // Dựng lưới 100 ô + nhãn thang/rắn
    const cellEls = {};
    for (let top = 0; top < SIZE; top++) {
      for (let col = 0; col < SIZE; col++) {
        const cell = document.createElement("div");
        cell.className = "sl-cell";
        // suy ra số ô tại (top,col)
        const rowFromBottom = SIZE - 1 - top;
        let n;
        if (rowFromBottom % 2 === 0) n = rowFromBottom * SIZE + col + 1;
        else n = rowFromBottom * SIZE + (SIZE - col);
        cell.dataset.n = n;
        let tag = "";
        if (LADDERS[n]) tag = `<span class="sl-tag sl-ladder">🪜${LADDERS[n]}</span>`;
        else if (SNAKE_ON && SNAKES[n]) tag = `<span class="sl-tag sl-snake">🐍${SNAKES[n]}</span>`;
        cell.innerHTML = `<span class="sl-num">${n}</span>${tag}<span class="sl-pawns" data-pawns="${n}"></span>`;
        boardEl.appendChild(cell);
        cellEls[n] = cell;
      }
    }

    // Lớp SVG vẽ đường thang (xanh) & rắn (cam) nối hai ô.
    function cellCenter(n) {
      const { top, col } = cellToRC(n);
      return { x: (col + 0.5) / SIZE * 100, y: (top + 0.5) / SIZE * 100 };
    }
    (function drawLinks() {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "sl-links");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      function line(a, b, cls, width) {
        const p1 = cellCenter(a), p2 = cellCenter(b);
        const ln = document.createElementNS(ns, "line");
        ln.setAttribute("x1", p1.x); ln.setAttribute("y1", p1.y);
        ln.setAttribute("x2", p2.x); ln.setAttribute("y2", p2.y);
        ln.setAttribute("class", cls);
        ln.setAttribute("stroke-width", width);
        svg.appendChild(ln);
        // nút tròn ở hai đầu
        [p1, p2].forEach((p, idx) => {
          const c = document.createElementNS(ns, "circle");
          c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
          c.setAttribute("r", idx === 0 ? 1.6 : 2.2);
          c.setAttribute("class", cls + "-dot");
          svg.appendChild(c);
        });
      }
      Object.keys(LADDERS).forEach((k) => line(+k, LADDERS[k], "sl-link-ladder", 1.4));
      if (SNAKE_ON) Object.keys(SNAKES).forEach((k) => line(+k, SNAKES[k], "sl-link-snake", 1.8));
      boardEl.appendChild(svg);
    })();

    function canPlay() { return !over && !rolling && (!ctx.isOnline || turn === ctx.mySeat); }

    function renderPawns(hopSeat) {
      boardEl.querySelectorAll(".sl-pawns").forEach((e) => (e.innerHTML = ""));
      [0, 1].forEach((p) => {
        if (pos[p] >= 1 && pos[p] <= GOAL) {
          const holder = cellEls[pos[p]].querySelector(".sl-pawns");
          const pawn = document.createElement("span");
          pawn.className = "sl-pawn sl-pawn-p" + (p + 1) + (hopSeat === p ? " hop" : "");
          pawn.textContent = p === 0 ? "🔴" : "🔵";
          holder.appendChild(pawn);
        }
      });
    }

    function renderHeader() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      header.innerHTML =
        `<div class="sl-pinfo p1 ${turn === 0 && !over ? "active" : ""}">` +
          `<span>🔴 ${ctx.t("Người chơi 1", "Player 1")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${pos[0]}/${GOAL}</b>` +
        `</div>` +
        `<div class="sl-pinfo p2 ${turn === 1 && !over ? "active" : ""}">` +
          `<span>🔵 ${ctx.t("Người chơi 2", "Player 2")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span><b>${pos[1]}/${GOAL}</b>` +
        `</div>`;
    }

    function updateStatus() {
      if (over) return;
      rollBtn.disabled = !canPlay();
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang gieo... 🎲`, `Opponent is rolling... 🎲`));
      } else {
        ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1}: bấm "Gieo xúc xắc".`, `Player ${turn + 1}'s turn: press "Roll dice".`));
      }
    }

    // Bấm gieo: chọn số ngẫu nhiên (dùng rng tất định online), bỏ vào payload.
    function onRoll() {
      if (!canPlay()) return;
      const die = 1 + Math.floor(ctx.rng() * 6);
      applyMove({ die }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const die = Number(move.die);
      if (!(die >= 1 && die <= 6)) return;
      if (!fromRemote) ctx.sendMove({ die });

      const mover = turn;
      dieEl.textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][die - 1];
      dieEl.classList.remove("rolling");
      void dieEl.offsetWidth; // reflow để chạy lại animation
      dieEl.classList.add("rolling");
      ctx.sound("place");

      let next = pos[mover] + die;
      let bounced = false;
      if (next > GOAL) {
        if (EXACT) { next = GOAL - (next - GOAL); bounced = true; } // dội ngược
        else next = GOAL;
      }
      pos[mover] = next;

      // leo thang / tụt rắn
      let special = "";
      if (LADDERS[next]) { pos[mover] = LADDERS[next]; special = "ladder"; ctx.sound("powerup"); }
      else if (SNAKE_ON && SNAKES[next]) { pos[mover] = SNAKES[next]; special = "snake"; ctx.sound("miss"); }

      renderPawns(mover);
      renderHeader();

      if (pos[mover] === GOAL) {
        over = true;
        ctx.incScore(mover);
        ctx.setTurn(-1);
        rollBtn.disabled = true;
        ctx.setStatus(ctx.t(`🎉 Người chơi ${mover + 1} về đích 100 — thắng!`, `🎉 Player ${mover + 1} reached 100 — wins!`));
        return;
      }

      // gieo 6 được đi thêm lượt (luật phổ biến)
      const extraTurn = die === 6;
      if (!extraTurn) turn = 1 - turn;
      ctx.setTurn(turn);
      renderHeader();

      const note = special === "ladder" ? ctx.t(" 🪜 Leo thang!", " 🪜 Climbed a ladder!")
        : special === "snake" ? ctx.t(" 🐍 Tụt rắn!", " 🐍 Slid down a snake!")
        : bounced ? ctx.t(" ↩️ Dội ngược (cần đúng số).", " ↩️ Bounced back (need exact roll).")
        : "";
      if (note) ctx.setStatus(ctx.t(`Người chơi ${mover + 1} gieo ${die}.${note}`, `Player ${mover + 1} rolled ${die}.${note}`));
      updateStatus();
    }

    // ----- AI: gieo xúc xắc (may rủi, không có chiến thuật) -----
    function aiMove() {
      if (over) return null;
      return { die: 1 + Math.floor(ctx.rng() * 6) };
    }

    rollBtn.addEventListener("click", onRoll);

    ctx.setTurn(turn);
    renderPawns();
    renderHeader();
    updateStatus();

    function destroy() {}
    return { applyMove, aiMove, destroy };
  }

  window.GameRegistry.register({
    id: "snakesladders",
    name: "Rắn & Thang",
    emoji: "🪜",
    description: "Gieo xúc xắc đua về ô 100: leo thang nhảy vọt, đụng rắn tụt lại.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "snakes", label: "Rắn", default: "on",
        choices: [
          { value: "on", label: "Có rắn (cổ điển)" },
          { value: "off", label: "Không rắn (chỉ thang)" },
        ],
      },
      {
        id: "exact", label: "Về đích", default: "exact",
        choices: [
          { value: "exact", label: "Cần đúng số (dội ngược nếu vượt)" },
          { value: "off", label: "Chỉ cần tới/quá 100" },
        ],
      },
    ],
    howTo: [
      "Hai người lần lượt gieo xúc xắc và đi quân của mình từ ô 1 tiến tới ô 100.",
      "Nếu dừng ở chân THANG 🪜 bạn leo lên đỉnh; nếu dừng ở đầu RẮN 🐍 bạn tụt xuống đuôi.",
      "Gieo được số 6 thì được gieo và đi thêm một lượt nữa.",
      "Về đích cần ĐÚNG số (mặc định): nếu gieo quá 100 thì quân bị 'dội' ngược lại — có thể tắt luật này trong tùy chọn.",
      "Người đầu tiên đưa quân tới đúng ô 100 sẽ thắng. Chơi chung máy, đấu với máy, hoặc online qua mã phòng.",
    ],
    create,
  });
})();
