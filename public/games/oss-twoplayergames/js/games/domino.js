/* Domino (Cờ Đô-mi-nô) — chơi chung máy & ONLINE
   Bộ đôi-sáu 28 quân. Mỗi người 7 quân, còn lại là "nọc" (boneyard).
   Nối quân sao cho số chấm ở đầu khớp. Hết quân trước (hoặc bí mà ít điểm hơn) thì thắng.
   Bộ quân chia tất định theo seed chung. Quân của mình ẩn với đối thủ.
   Nước đi: { kind:"play", tile:[a,b], end:"L"|"R" } | { kind:"draw" } | { kind:"pass" }. */
(function () {
  function create(ctx) {
    // ----- tạo & xáo bộ quân tất định theo seed -----
    const all = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b]);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const hands = [all.slice(0, 7), all.slice(7, 14)];
    const boneyard = all.slice(14); // 14 quân còn lại
    const line = [];   // chuỗi quân đã đánh, mỗi phần tử [a,b] đã xoay đúng hướng
    let leftEnd = null, rightEnd = null;
    let turn = 0;
    let over = false;
    let passes = 0;

    const root = document.createElement("div");
    root.className = "dom-root";
    root.innerHTML =
      `<div class="dom-info" id="domInfo"></div>` +
      `<div class="dom-line-wrap"><div class="dom-line" id="domLine"></div></div>` +
      `<div class="dom-hand-label">${ctx.t("Quân của bạn:", "Your tiles:")}</div>` +
      `<div class="dom-hand" id="domHand"></div>` +
      `<div class="dom-actions">` +
      `<button class="btn" id="domDraw">${ctx.t("🎴 Bốc nọc", "🎴 Draw")}</button>` +
      `<button class="btn" id="domPass">${ctx.t("⏭️ Bỏ lượt", "⏭️ Pass")}</button>` +
      `</div>`;
    ctx.boardEl.appendChild(root);

    const infoEl = root.querySelector("#domInfo");
    const lineEl = root.querySelector("#domLine");
    const handEl = root.querySelector("#domHand");
    const drawBtn = root.querySelector("#domDraw");
    const passBtn = root.querySelector("#domPass");

    // người chơi cục bộ là ai (chung máy: theo lượt; online: ghế của mình)
    function localSeat() { return ctx.isOnline ? ctx.mySeat : turn; }
    function myTurn() { return !ctx.isOnline || turn === ctx.mySeat; }

    function pips(n) { return ["0","1","2","3","4","5","6"][n]; }

    // bố cục chấm chuẩn trên lưới 3x3 (vị trí 0..8)
    const PIP_LAYOUT = {
      0: [],
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };

    // tạo một mặt quân (nửa domino) với các chấm tròn
    function makeFace(n) {
      const face = document.createElement("div");
      face.className = "dom-face";
      const set = new Set(PIP_LAYOUT[n] || []);
      for (let i = 0; i < 9; i++) {
        const slot = document.createElement("span");
        slot.className = "dom-pip-slot";
        if (set.has(i)) {
          const dot = document.createElement("span");
          dot.className = "dom-pip";
          slot.appendChild(dot);
        }
        face.appendChild(slot);
      }
      return face;
    }

    // tạo một quân hoàn chỉnh gồm 2 mặt. orient: "h" (ngang) | "v" (dọc)
    function makeTile(t, orient, flip) {
      const tile = document.createElement("div");
      tile.className = "dom-tile dom-" + orient;
      const a = flip ? t[1] : t[0];
      const b = flip ? t[0] : t[1];
      tile.appendChild(makeFace(a));
      const divider = document.createElement("span");
      divider.className = "dom-divider";
      tile.appendChild(divider);
      tile.appendChild(makeFace(b));
      return tile;
    }

    function canPlayTile(t) {
      if (line.length === 0) return true;
      return t[0] === leftEnd || t[1] === leftEnd || t[0] === rightEnd || t[1] === rightEnd;
    }
    function handCanPlay(seat) { return hands[seat].some(canPlayTile); }

    drawBtn.addEventListener("click", () => {
      if (!myTurn() || over) return;
      if (boneyard.length === 0) return;
      if (handCanPlay(turn)) { ctx.setStatus(ctx.t("Bạn còn quân đánh được — không cần bốc.", "You still have a playable tile — no need to draw.")); return; }
      applyMove({ kind: "draw" }, false);
    });
    passBtn.addEventListener("click", () => {
      if (!myTurn() || over) return;
      if (handCanPlay(turn)) { ctx.setStatus(ctx.t("Bạn còn quân đánh được — không được bỏ lượt.", "You still have a playable tile — you can't pass.")); return; }
      if (boneyard.length > 0) { ctx.setStatus(ctx.t("Còn nọc — phải bốc trước khi bỏ lượt.", "Boneyard not empty — you must draw before passing.")); return; }
      applyMove({ kind: "pass" }, false);
    });

    function onTileClick(t) {
      if (!myTurn() || over || !canPlayTile(t)) return;
      // chọn đầu nối: nếu khớp cả 2 đầu, ưu tiên hỏi; ở đây tự chọn đầu khớp
      let end = null;
      if (line.length === 0) end = "R";
      else if (t[0] === leftEnd || t[1] === leftEnd) end = "L";
      else end = "R";
      applyMove({ kind: "play", tile: t.slice(), end }, false);
    }

    function removeFromHand(seat, t) {
      const i = hands[seat].findIndex((x) => x[0] === t[0] && x[1] === t[1]);
      if (i >= 0) hands[seat].splice(i, 1);
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.kind === "play") {
        const t = move.tile;
        if (!fromRemote) ctx.sendMove(move);
        placeTile(t, move.end);
        removeFromHand(turn, t);
        passes = 0;
        ctx.sound("place");
        if (hands[turn].length === 0) return finish(turn, ctx.t("hết quân", "out of tiles"));
        nextTurn();
        return;
      }

      if (move.kind === "draw") {
        if (!fromRemote) ctx.sendMove(move);
        if (boneyard.length) {
          const t = boneyard.shift();
          hands[turn].push(t);
          ctx.sound("select");
        }
        // bốc xong vẫn lượt của mình; render lại
        render();
        ctx.setStatus(ctx.t(`Người chơi ${turn + 1} bốc một quân từ nọc.`, `Player ${turn + 1} drew a tile from the boneyard.`));
        ctx.setTurn(turn); // cùng lượt — để máy (nếu đấu máy) cân nhắc đánh/bốc tiếp
        return;
      }

      if (move.kind === "pass") {
        if (!fromRemote) ctx.sendMove(move);
        passes++;
        ctx.sound("error");
        if (passes >= 2) return finishBlocked();
        nextTurn(ctx.t(`⏭️ Người chơi ${turn + 1} bỏ lượt.`, `⏭️ Player ${turn + 1} passed.`));
      }
    }

    function placeTile(t, end) {
      if (line.length === 0) {
        line.push(t.slice());
        leftEnd = t[0]; rightEnd = t[1];
        return;
      }
      if (end === "L") {
        // nối vào đầu trái: cạnh khớp phải nằm sát leftEnd
        let tile = t.slice();
        if (tile[1] !== leftEnd) tile = [tile[1], tile[0]]; // xoay để [x, leftEnd]
        line.unshift(tile);
        leftEnd = tile[0];
      } else {
        let tile = t.slice();
        if (tile[0] !== rightEnd) tile = [tile[1], tile[0]]; // xoay để [rightEnd, x]
        line.push(tile);
        rightEnd = tile[1];
      }
    }

    function nextTurn(msg) {
      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      if (msg) ctx.setStatus(ctx.t(`${msg} Lượt Người chơi ${turn + 1}.`, `${msg} Player ${turn + 1}'s turn.`));
      else ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} — nối quân khớp số chấm ở hai đầu.`,
        `Player ${turn + 1}'s turn — play a tile matching an open end.`));
    }

    function pipsSum(seat) { return hands[seat].reduce((s, t) => s + t[0] + t[1], 0); }

    // ----- AI (đấu máy): ưu tiên xả quân nặng / quân đôi, hết nước thì bốc, hết nọc thì bỏ -----
    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const playable = hands[me].filter(canPlayTile);
      if (playable.length) {
        let best = playable[0], bestScore = -Infinity;
        for (const t of playable) {
          let s;
          if (level === "easy") s = Math.random();
          else {
            s = t[0] + t[1];                 // xả bớt điểm nặng (lợi khi bí cờ)
            if (t[0] === t[1]) s += 3;       // ưu tiên đánh quân đôi (khó đánh sau)
            if (level === "hard" && (t[0] === t[1])) s += 2;
          }
          if (s > bestScore) { bestScore = s; best = t; }
        }
        let end;
        if (line.length === 0) end = "R";
        else if (best[0] === leftEnd || best[1] === leftEnd) end = "L";
        else end = "R";
        return { kind: "play", tile: best.slice(), end };
      }
      if (boneyard.length > 0) return { kind: "draw" };
      return { kind: "pass" };
    }

    function finish(winner, reason) {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng (${reason})!`, `🎉 Player ${winner + 1} wins (${reason})!`));
      render();
    }

    function finishBlocked() {
      over = true;
      ctx.setTurn(-1);
      const a = pipsSum(0), b = pipsSum(1);
      if (a < b) { ctx.incScore(0); ctx.setStatus(ctx.t(`🔒 Bí cờ! Người chơi 1 ít điểm hơn (${a} so ${b}) — thắng!`, `🔒 Blocked! Player 1 has fewer pips (${a} vs ${b}) — wins!`)); }
      else if (b < a) { ctx.incScore(1); ctx.setStatus(ctx.t(`🔒 Bí cờ! Người chơi 2 ít điểm hơn (${b} so ${a}) — thắng!`, `🔒 Blocked! Player 2 has fewer pips (${b} vs ${a}) — wins!`)); }
      else ctx.setStatus(ctx.t(`🔒 Bí cờ — hòa (${a} điểm)!`, `🔒 Blocked — draw (${a} pips)!`));
      render();
    }

    function render() {
      // thông tin
      infoEl.textContent = ctx.t(
        `Nọc: ${boneyard.length} quân • P1: ${hands[0].length} quân • P2: ${hands[1].length} quân`,
        `Boneyard: ${boneyard.length} • P1: ${hands[0].length} tiles • P2: ${hands[1].length} tiles`)
        + (line.length ? ctx.t(` • Hai đầu: ${pips(leftEnd)} … ${pips(rightEnd)}`, ` • Ends: ${pips(leftEnd)} … ${pips(rightEnd)}`) : "");

      // chuỗi quân đã đánh — xếp kiểu rắn bò (serpentine): hàng xen kẽ chiều,
      // quân ở chỗ rẽ cuối hàng để dọc, các quân khác để ngang.
      lineEl.innerHTML = "";
      const perRow = 9; // số quân tối đa mỗi hàng trước khi rẽ xuống
      let i = 0, rowIndex = 0;
      while (i < line.length) {
        const reverse = rowIndex % 2 === 1;
        const row = document.createElement("div");
        row.className = "dom-row" + (reverse ? " reverse" : "");
        const count = Math.min(perRow, line.length - i);
        for (let k = 0; k < count; k++) {
          const t = line[i + k];
          // quân cuối hàng (trừ quân cuối cùng toàn chuỗi) là chỗ rẽ -> để dọc
          const isTurn = (k === count - 1) && (i + k < line.length - 1);
          // hàng đi ngược: đảo 2 mặt để số chấm ở chỗ nối khớp nhau
          row.appendChild(makeTile(t, isTurn ? "v" : "h", reverse));
        }
        lineEl.appendChild(row);
        i += count;
        rowIndex++;
      }
      lineEl.scrollTop = lineEl.scrollHeight;

      // quân trên tay của người chơi cục bộ
      handEl.innerHTML = "";
      const seat = localSeat();
      hands[seat].forEach((t) => {
        const d = makeTile(t, "v");
        const playable = myTurn() && !over && canPlayTile(t);
        if (playable) d.classList.add("playable");
        d.addEventListener("click", () => onTileClick(t));
        handEl.appendChild(d);
      });

      // nút bốc/bỏ lượt — sáng lên khi bí (không còn quân đánh được)
      const mine = myTurn() && !over;
      const stuck = mine && !handCanPlay(turn);
      drawBtn.disabled = !(stuck && boneyard.length > 0);
      passBtn.disabled = !(stuck && boneyard.length === 0);
      drawBtn.classList.toggle("dom-glow", stuck && boneyard.length > 0);
      passBtn.classList.toggle("dom-glow", stuck && boneyard.length === 0);
    }

    ctx.setTurn(0);
    render();
    ctx.setStatus(ctx.t("Nối quân khớp số chấm ở hai đầu chuỗi. Hết quân trước (hoặc bí mà ít điểm hơn) sẽ thắng!",
      "Play tiles matching the open ends. First to empty your hand (or fewest pips if blocked) wins!"));
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "domino",
    name: "Domino (Đô-mi-nô)",
    emoji: "🀫",
    description: "Nối các quân domino khớp số chấm ở hai đầu. Hết quân trước sẽ thắng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Bộ đôi-sáu gồm 28 quân, mỗi quân có 2 đầu mang số chấm (0–6). Mỗi người được chia 7 quân, phần còn lại là 'nọc'.",
      "Đến lượt, chọn một quân trên tay có số chấm KHỚP với một trong hai đầu của chuỗi để nối vào (quân sáng là quân đánh được).",
      "Ván đầu tiên: ai cũng có thể đặt quân bất kỳ để mở màn.",
      "Nếu không có quân nào đánh được: bấm 🎴 Bốc nọc để rút thêm. Hết nọc mà vẫn không đánh được thì ⏭️ Bỏ lượt.",
      "Thắng khi bạn đánh hết quân trên tay. Nếu cả hai cùng bí (bỏ lượt liên tiếp), ai còn ÍT tổng điểm chấm hơn sẽ thắng.",
      "Quân của bạn chỉ mình bạn thấy — đối thủ không biết bạn đang giữ gì.",
    ],
    create,
  });
})();
