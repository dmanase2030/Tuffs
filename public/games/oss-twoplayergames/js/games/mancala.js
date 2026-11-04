/* Mancala (Kalah) — chơi chung máy & online
   Bàn 14 hốc: hốc 0-5 của P1, kho 6 của P1; hốc 7-12 của P2, kho 13 của P2.
   Gieo sỏi ngược chiều kim đồng hồ, bỏ qua kho đối thủ. Có hiệu ứng rải sỏi. */
(function () {
  const STORE0 = 6;
  const STORE1 = 13;

  function create(ctx) {
    let pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    let turn = 0;
    let over = false;
    let busy = false;
    let destroyed = false;
    const timers = [];
    const remoteQueue = [];

    function schedule(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }

    const wrap = document.createElement("div");
    wrap.className = "mnc-board";
    ctx.boardEl.appendChild(wrap);

    const store1El = makeStore("mnc-store store-p2");
    const mid = document.createElement("div");
    mid.className = "mnc-mid";
    const topRow = document.createElement("div");
    topRow.className = "mnc-row";
    const botRow = document.createElement("div");
    botRow.className = "mnc-row";
    mid.appendChild(topRow);
    mid.appendChild(botRow);
    const store0El = makeStore("mnc-store store-p1");

    wrap.appendChild(store1El.wrap);
    wrap.appendChild(mid);
    wrap.appendChild(store0El.wrap);

    const pitEls = {};
    for (let i = 12; i >= 7; i--) topRow.appendChild(makePit(i));
    for (let i = 0; i <= 5; i++) botRow.appendChild(makePit(i));

    function makeStore(cls) {
      const w = document.createElement("div");
      w.className = cls;
      const val = document.createElement("div");
      val.className = "mnc-stones mnc-store-stones";
      const badge = document.createElement("b");
      badge.className = "mnc-store-num";
      w.appendChild(val);
      w.appendChild(badge);
      return { wrap: w, val, badge };
    }

    function makePit(i) {
      const pit = document.createElement("div");
      pit.className = "mnc-pit";
      pit.dataset.idx = i;
      pit.addEventListener("click", () => onClick(i));
      const val = document.createElement("span");
      val.className = "mnc-stones mnc-pit-stones";
      const badge = document.createElement("b");
      badge.className = "mnc-pit-num";
      pit.appendChild(val);
      pit.appendChild(badge);
      pitEls[i] = { pit, val, badge };
      return pit;
    }

    function isStore(idx) { return idx === STORE0 || idx === STORE1; }
    function cellVal(idx) { return idx === STORE0 ? store0El.val : idx === STORE1 ? store1El.val : pitEls[idx].val; }
    function ownsPit(p, i) { return p === 0 ? (i >= 0 && i <= 5) : (i >= 7 && i <= 12); }
    function myStore(p) { return p === 0 ? STORE0 : STORE1; }
    function oppStore(p) { return p === 0 ? STORE1 : STORE0; }

    // vị trí viên sỏi thứ k trong hốc (kiểu phyllotaxis cho tự nhiên)
    function stonePos(k, store) {
      const a = k * 2.39996;
      let r = 3 + 5 * Math.sqrt(k);
      if (r > 38) r = 38;
      let x = 50 + r * Math.cos(a);
      let y = 50 + r * Math.sin(a) * (store ? 1.8 : 1);
      x = Math.max(8, Math.min(92, x));
      y = Math.max(6, Math.min(94, y));
      return { x, y };
    }

    function addStone(idx, drop) {
      const el = cellVal(idx);
      const k = el.childElementCount;
      const stone = document.createElement("i");
      stone.className = "mnc-stone s" + (k % 6) + (isStore(idx) ? " st" : "");
      const pos = stonePos(k, isStore(idx));
      stone.style.left = pos.x + "%";
      stone.style.top = pos.y + "%";
      stone.style.setProperty("--rot", ((k * 53) % 60 - 30) + "deg");
      if (drop) stone.classList.add("drop");
      el.appendChild(stone);
    }

    function paint(idx) {
      const el = cellVal(idx);
      el.innerHTML = "";
      el.classList.toggle("many", pits[idx] > (isStore(idx) ? 16 : 9));
      for (let k = 0; k < pits[idx]; k++) addStone(idx, false);
      if (isStore(idx)) {
        const b = idx === STORE0 ? store0El.badge : store1El.badge;
        b.textContent = pits[idx];
      } else {
        pitEls[idx].badge.textContent = pits[idx];
        pitEls[idx].pit.classList.toggle("empty", pits[idx] === 0);
      }
    }

    function onClick(i) {
      if (over || busy) return;
      if (ctx.isOnline && turn !== ctx.mySeat) return;
      if (!ownsPit(turn, i) || pits[i] === 0) return;
      applyMove(i, false);
    }

    function applyMove(i, fromRemote) {
      if (over) return;
      if (busy) { if (fromRemote) remoteQueue.push(i); return; }
      if (!ownsPit(turn, i) || pits[i] === 0) return;

      if (!fromRemote) ctx.sendMove(i);

      busy = true;
      const mover = turn;
      let stones = pits[i];
      pits[i] = 0;
      paint(i);
      ctx.sound("place");

      // chuỗi ô sẽ nhận sỏi
      const seq = [];
      let idx = i;
      while (stones > 0) {
        idx = (idx + 1) % 14;
        if (idx === oppStore(mover)) continue;
        seq.push(idx);
        stones--;
      }
      const lastIdx = seq[seq.length - 1];
      const per = Math.max(45, Math.min(120, Math.round(620 / seq.length)));

      let k = 0;
      function dropNext() {
        if (destroyed) return;
        if (k >= seq.length) { afterSow(mover, lastIdx); return; }
        const j = seq[k++];
        pits[j]++;
        const el = cellVal(j);
        el.classList.toggle("many", pits[j] > (isStore(j) ? 16 : 9));
        if (pits[j] > (isStore(j) ? 16 : 9)) paint(j); else addStone(j, true);
        if (!isStore(j)) { pitEls[j].badge.textContent = pits[j]; pitEls[j].pit.classList.remove("empty"); }
        else (j === STORE0 ? store0El : store1El).badge.textContent = pits[j];
        ctx.sound("select");
        schedule(dropNext, per);
      }
      dropNext();
    }

    function afterSow(mover, lastIdx) {
      // bắt sỏi: viên cuối rơi vào hốc trống của mình
      if (ownsPit(mover, lastIdx) && pits[lastIdx] === 1) {
        const opposite = 12 - lastIdx;
        if (pits[opposite] > 0) {
          schedule(() => {
            if (destroyed) return;
            const gained = pits[opposite] + 1;
            pits[myStore(mover)] += gained;
            pits[opposite] = 0;
            pits[lastIdx] = 0;
            paint(opposite); paint(lastIdx); paint(myStore(mover));
            (mover === 0 ? store0El : store1El).wrap.classList.add("grab");
            schedule(() => { if (!destroyed) (mover === 0 ? store0El : store1El).wrap.classList.remove("grab"); }, 420);
            ctx.sound("capture");
            schedule(() => endTurnFlow(mover, lastIdx), 320);
          }, 220);
          return;
        }
      }
      endTurnFlow(mover, lastIdx);
    }

    function endTurnFlow(mover, lastIdx) {
      if (destroyed) return;
      render();
      if (checkEnd()) { busy = false; return finish(); }
      let nextTurn;
      if (lastIdx === myStore(mover)) {
        nextTurn = mover;
        ctx.setStatus(ctx.t(`✨ Người chơi ${mover + 1} rơi vào kho — được đi tiếp!`,
          `✨ Player ${mover + 1} landed in the store — go again!`));
      } else {
        nextTurn = 1 - mover;
      }
      turn = nextTurn;
      busy = false;
      ctx.setTurn(turn);
      if (lastIdx !== myStore(mover)) updateStatus();
      render();
      // xử lý nước đi từ xa đã xếp hàng trong lúc đang chạy hiệu ứng
      if (remoteQueue.length) {
        const next = remoteQueue.shift();
        schedule(() => applyMove(next, true), 60);
      }
    }

    function sideEmpty(p) {
      const range = p === 0 ? [0, 5] : [7, 12];
      for (let i = range[0]; i <= range[1]; i++) if (pits[i] > 0) return false;
      return true;
    }
    function checkEnd() { return sideEmpty(0) || sideEmpty(1); }

    function finish() {
      over = true;
      for (let i = 0; i <= 5; i++) { pits[STORE0] += pits[i]; pits[i] = 0; }
      for (let i = 7; i <= 12; i++) { pits[STORE1] += pits[i]; pits[i] = 0; }
      render();
      ctx.setTurn(-1);
      const a = pits[STORE0], b = pits[STORE1];
      if (a > b) { ctx.incScore(0); ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng ${a}–${b}!`, `🎉 Player 1 wins ${a}–${b}!`)); }
      else if (b > a) { ctx.incScore(1); ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng ${b}–${a}!`, `🎉 Player 2 wins ${b}–${a}!`)); }
      else ctx.setStatus(ctx.t(`🤝 Hòa ${a}–${b}!`, `🤝 Draw ${a}–${b}!`));
    }

    function render() {
      for (let i = 0; i < 14; i++) paint(i);
      for (let i = 0; i < 14; i++) {
        if (isStore(i)) continue;
        const playable = !over && !busy && ownsPit(turn, i) && pits[i] > 0 && (!ctx.isOnline || turn === ctx.mySeat);
        pitEls[i].pit.classList.toggle("playable", playable);
      }
    }

    function updateStatus() {
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t(`Đối thủ đang gieo sỏi...`, `Opponent is sowing...`));
      else ctx.setStatus(ctx.t(`Lượt Người chơi ${turn + 1} — chọn một hốc bên phía mình để gieo sỏi.`,
        `Player ${turn + 1}'s turn — pick a pit on your side to sow.`));
    }

    // ----- AI: minimax mô phỏng gieo sỏi -----
    function sowSim(b, player, pit) {
      const p = b.slice();
      const oppS = player === 0 ? STORE1 : STORE0;
      const myS = player === 0 ? STORE0 : STORE1;
      let stones = p[pit]; p[pit] = 0; let idx = pit;
      while (stones > 0) { idx = (idx + 1) % 14; if (idx === oppS) continue; p[idx]++; stones--; }
      const last = idx;
      const mine = player === 0 ? (last >= 0 && last <= 5) : (last >= 7 && last <= 12);
      if (mine && p[last] === 1) {
        const opp = 12 - last;
        if (p[opp] > 0) { p[myS] += p[opp] + 1; p[opp] = 0; p[last] = 0; }
      }
      return { p, extra: last === myS };
    }
    function sideEmptySim(b, player) {
      const r = player === 0 ? [0, 5] : [7, 12];
      for (let i = r[0]; i <= r[1]; i++) if (b[i] > 0) return false;
      return true;
    }
    function finalizeDiff(b, me) {
      const p = b.slice();
      for (let i = 0; i <= 5; i++) { p[STORE0] += p[i]; p[i] = 0; }
      for (let i = 7; i <= 12; i++) { p[STORE1] += p[i]; p[i] = 0; }
      return (me === 0 ? p[STORE0] - p[STORE1] : p[STORE1] - p[STORE0]);
    }
    function genPits(b, player) {
      const r = player === 0 ? [0, 5] : [7, 12];
      const out = [];
      for (let i = r[0]; i <= r[1]; i++) if (b[i] > 0) out.push(i);
      return out;
    }
    function mcEval(b, me) {
      return (me === 0 ? b[STORE0] - b[STORE1] : b[STORE1] - b[STORE0]);
    }
    function mcSearch(b, player, me, depth, alpha, beta) {
      if (sideEmptySim(b, 0) || sideEmptySim(b, 1)) return finalizeDiff(b, me);
      if (depth <= 0) return mcEval(b, me);
      const moves = genPits(b, player);
      if (!moves.length) return finalizeDiff(b, me);
      if (player === me) {
        let v = -Infinity;
        for (const pit of moves) {
          const r = sowSim(b, player, pit);
          const sc = mcSearch(r.p, r.extra ? player : 1 - player, me, depth - 1, alpha, beta);
          v = Math.max(v, sc); alpha = Math.max(alpha, v); if (alpha >= beta) break;
        }
        return v;
      }
      let v = Infinity;
      for (const pit of moves) {
        const r = sowSim(b, player, pit);
        const sc = mcSearch(r.p, r.extra ? player : 1 - player, me, depth - 1, alpha, beta);
        v = Math.min(v, sc); beta = Math.min(beta, v); if (alpha >= beta) break;
      }
      return v;
    }
    function aiMove(level) {
      if (over || busy) return null;
      const me = turn;
      const moves = genPits(pits, me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.6) return moves[Math.floor(Math.random() * moves.length)];
      const depth = level === "easy" ? 2 : level === "hard" ? 8 : 5;
      let best = -Infinity, pick = moves[0];
      for (const pit of moves) {
        const r = sowSim(pits, me, pit);
        const sc = mcSearch(r.p, r.extra ? me : 1 - me, me, depth - 1, -Infinity, Infinity);
        if (sc > best) { best = sc; pick = pit; }
      }
      return pick;
    }

    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrap)) {
        destroyed = true;
        timers.forEach(clearTimeout);
        observer.disconnect();
      }
    });
    observer.observe(ctx.boardEl.parentNode || document.body, { childList: true, subtree: true });

    ctx.setNames(ctx.t("Người chơi 1 (dưới)", "Player 1 (bottom)"), ctx.t("Người chơi 2 (trên)", "Player 2 (top)"));
    ctx.setTurn(0);
    render();
    ctx.setStatus(ctx.t("Chọn một hốc bên mình, gieo sỏi ngược chiều kim đồng hồ. Nhiều sỏi trong kho hơn sẽ thắng.",
      "Pick a pit on your side and sow counter-clockwise. Most seeds in your store wins."));
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "mancala",
    name: "Mancala (Ô Ăn Quan)",
    emoji: "🫘",
    description: "Gieo sỏi vòng quanh các hốc, bắt sỏi đối thủ. Sỏi rải sống động từng viên. Ai gom nhiều sỏi về kho hơn sẽ thắng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Mỗi người có 6 hốc nhỏ ở phía mình và 1 kho lớn. Người chơi 1 ở hàng dưới (kho bên phải), Người chơi 2 ở hàng trên (kho bên trái).",
      "Đến lượt, chọn một hốc bên phía mình còn sỏi: nhặt hết sỏi rồi rải lần lượt mỗi hốc 1 viên theo ngược chiều kim đồng hồ (xem hiệu ứng sỏi rơi từng viên).",
      "Khi rải qua kho của mình thì bỏ 1 viên vào đó, nhưng bỏ qua (không bỏ vào) kho đối thủ.",
      "Nếu viên cuối rơi đúng vào KHO của mình, bạn được đi thêm một lượt nữa.",
      "Nếu viên cuối rơi vào một hốc TRỐNG bên phía mình, bạn bắt viên đó cùng toàn bộ sỏi ở hốc đối diện, đưa hết vào kho mình.",
      "Khi một bên hết sỏi ở các hốc, sỏi còn lại của bên kia được dồn về kho của họ. Ai nhiều sỏi trong kho hơn sẽ thắng.",
    ],
    create,
  });
})();
