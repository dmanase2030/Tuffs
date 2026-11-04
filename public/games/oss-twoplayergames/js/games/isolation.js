/* Isolation Duel - Co Co Lap
   Hai quan o hai goc. Moi luot di theo hang/cot/cheo bat ky so o.
   Che do "vacate": o vua roi tu khoa. Che do "choose": di xong chon mot o trong bat ky de khoa.
   Ai lam doi thu het nuoc di se thang. */
(function () {
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  function create(ctx) {
    const o = ctx.options || {};
    const size = Number(o.size || 7);
    const N = [5, 7, 9].includes(size) ? size : 7;
    const MODE = o.mode === "choose" ? "choose" : "vacate";
    const total = N * N;
    const blocked = Array(total).fill(false);
    const pos = [0, total - 1];
    let turn = 0;
    let over = false;
    let phase = "move";   // move | block (chỉ dùng cho chế độ choose)
    let lastMove = -1;
    let lastBlock = -1;
    const history = []; // ngăn xếp trạng thái để hoàn tác

    const root = document.createElement("div");
    root.className = "iso-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "iso-hud";
    root.appendChild(hud);

    const board = document.createElement("div");
    board.className = "iso-board";
    board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    board.style.setProperty("--iso-size", String(N));
    root.appendChild(board);

    const cells = [];
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "iso-cell";
      cell.addEventListener("click", () => onCell(i));
      board.appendChild(cell);
      cells.push(cell);
    }

    function idx(r, c) { return r * N + c; }
    function row(i) { return Math.floor(i / N); }
    function col(i) { return i % N; }
    function occupied(i) { return pos[0] === i || pos[1] === i; }
    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function isEmpty(i) { return !blocked[i] && !occupied(i); }

    function legalMoves(player) {
      const out = [];
      const start = pos[player];
      const sr = row(start), sc = col(start);
      DIRS.forEach(([dr, dc]) => {
        let r = sr + dr, c = sc + dc;
        while (r >= 0 && r < N && c >= 0 && c < N) {
          const target = idx(r, c);
          if (blocked[target] || occupied(target)) break;
          out.push(target);
          r += dr; c += dc;
        }
      });
      return out;
    }

    function onCell(i) {
      if (!canAct()) return;
      if (MODE === "choose" && phase === "block") {
        if (!isEmpty(i)) return;
        applyMove({ block: i }, false);
        return;
      }
      if (!legalMoves(turn).includes(i)) return;
      applyMove({ to: i }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const snap = { blocked: blocked.slice(), pos: pos.slice(), turn, phase, lastMove, lastBlock };

      if (move && Number.isInteger(Number(move.block)) && MODE === "choose" && phase === "block") {
        const at = Number(move.block);
        if (!isEmpty(at)) return;
        history.push(snap);
        blocked[at] = true;
        lastBlock = at;
        ctx.sound("capture");
        if (!fromRemote) ctx.sendMove({ block: at });
        phase = "move";
        endTurn(turn);
        return;
      }

      const to = Number(move?.to);
      const legal = legalMoves(turn);
      if (!Number.isInteger(to) || !legal.includes(to)) return;
      history.push(snap);

      const player = turn;
      const old = pos[player];
      pos[player] = to;
      lastMove = to;
      ctx.sound("place");
      if (!fromRemote) ctx.sendMove({ to });

      if (MODE === "vacate") {
        blocked[old] = true;
        lastBlock = old;
        endTurn(player);
      } else {
        // choose: cùng người chơi phải chọn ô để khóa
        phase = "block";
        ctx.setTurn(turn); // báo lại lượt để engine AI kích hoạt bước khóa
        updateStatus();
        render();
      }
    }

    function endTurn(player) {
      const next = 1 - player;
      if (legalMoves(next).length === 0) {
        over = true;
        ctx.incScore(player);
        ctx.setTurn(-1);
        ctx.setStatus(ctx.t(`🎉 Người chơi ${player + 1} thắng! Đối thủ không còn nước đi.`,
          `🎉 Player ${player + 1} wins! Opponent has no moves left.`));
        render();
        return;
      }
      turn = next;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi... (P1 ${legalMoves(0).length} nước · P2 ${legalMoves(1).length} nước)`,
          `Opponent is moving... (P1 ${legalMoves(0).length} moves · P2 ${legalMoves(1).length} moves)`));
        return;
      }
      if (MODE === "choose" && phase === "block") {
        ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: chọn một ô TRỐNG bất kỳ để KHÓA (chặn đường đối thủ).`,
          `Player ${turn + 1}: pick any EMPTY cell to BLOCK (cut off your opponent).`));
        return;
      }
      ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: chọn ô để di chuyển (ngang/dọc/chéo). Còn ${legalMoves(turn).length} nước.`,
        `Player ${turn + 1}: pick a cell to move (orthogonal/diagonal). ${legalMoves(turn).length} moves left.`));
    }

    // ----- AI -----
    function undo() {
      if (!history.length) return false;
      const s = history.pop();
      for (let i = 0; i < total; i++) blocked[i] = s.blocked[i];
      pos[0] = s.pos[0]; pos[1] = s.pos[1];
      turn = s.turn; phase = s.phase; lastMove = s.lastMove; lastBlock = s.lastBlock;
      over = false;
      ctx.setTurn(turn);
      updateStatus();
      render();
      return true;
    }
    function aiMove(level) {
      if (!canAct()) return null;
      const me = turn;
      // Pha khóa ô (chế độ choose): khóa ô làm đối thủ ít nước nhất
      if (MODE === "choose" && phase === "block") {
        const empties = [];
        for (let i = 0; i < total; i++) if (isEmpty(i)) empties.push(i);
        if (!empties.length) return null;
        if (level === "easy" && Math.random() < 0.6) return { block: empties[Math.floor(Math.random() * empties.length)] };
        let best = Infinity, pick = empties[0];
        for (const i of empties) {
          blocked[i] = true;
          const oppM = legalMoves(1 - me).length;
          blocked[i] = false;
          if (oppM < best) { best = oppM; pick = i; }
        }
        return { block: pick };
      }
      // Pha di chuyển: chọn nước làm đối thủ ít nước nhất, ưu tiên giữ nước cho mình
      const moves = legalMoves(me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.55) return { to: moves[Math.floor(Math.random() * moves.length)] };
      let bestScore = -Infinity, pick = moves[0];
      const old = pos[me];
      for (const to of moves) {
        pos[me] = to;
        let restore = -1;
        if (MODE === "vacate") { blocked[old] = true; restore = old; }
        const oppM = legalMoves(1 - me).length;
        const myM = legalMoves(me).length;
        pos[me] = old;
        if (restore >= 0) blocked[restore] = false;
        // muốn đối thủ ít nước, mình nhiều nước
        const sc = myM - oppM * 2 + (oppM === 0 ? 1000 : 0);
        if (sc > bestScore) { bestScore = sc; pick = to; }
      }
      return { to: pick };
    }

    function render() {
      const m0 = legalMoves(0).length;
      const m1 = legalMoves(1).length;
      const maxM = Math.max(1, m0, m1);
      hud.innerHTML = `
        <div class="iso-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🔴 ${ctx.t("Người chơi 1", "Player 1")}</span><b>${m0} ${ctx.t("nước", "moves")}</b>
          <i class="iso-bar p1"><i style="width:${m0 / maxM * 100}%"></i></i>
        </div>
        <div class="iso-mid">${over ? "🏁" : (MODE === "choose" && phase === "block" ? ctx.t("🔒 chọn ô khóa", "🔒 pick a block") : "⚔️")}</div>
        <div class="iso-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🔵 ${ctx.t("Người chơi 2", "Player 2")}</span><b>${m1} ${ctx.t("nước", "moves")}</b>
          <i class="iso-bar p2"><i style="width:${m1 / maxM * 100}%"></i></i>
        </div>
      `;

      const moveSet = (canAct() && !(MODE === "choose" && phase === "block")) ? new Set(legalMoves(turn)) : new Set();
      const blockMode = MODE === "choose" && phase === "block" && canAct();
      cells.forEach((cell, i) => {
        let cls = "iso-cell";
        cell.innerHTML = "";
        let dis = over || blocked[i] || occupied(i);
        if ((row(i) + col(i)) % 2 === 0) cls += " alt";
        if (blocked[i]) cls += " blocked";
        if (i === lastBlock && blocked[i]) cls += " lastblock";
        if (pos[0] === i) { cls += " p1"; cell.innerHTML = `<span class="iso-pawn">♟</span>`; }
        if (pos[1] === i) { cls += " p2"; cell.innerHTML = `<span class="iso-pawn">♟</span>`; }
        if (i === lastMove && occupied(i)) cls += " lastmove";
        if (moveSet.has(i)) { cls += " legal"; dis = false; }
        if (blockMode && isEmpty(i)) { cls += " blocktarget"; dis = false; }
        cell.disabled = dis;
        cell.className = cls;
      });
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    updateStatus();
    render();
    return { applyMove, aiMove, undo };
  }

  window.GameRegistry.register({
    id: "isolation",
    name: "Cờ Cô Lập",
    emoji: "🔒",
    description: "Di chuyển quân rồi khóa ô để dồn đối thủ vào chỗ bí. Có bảng đo số nước đi và chế độ tự chọn ô khóa cổ điển.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "size", label: "Kích thước bàn", default: 7,
        choices: [
          { value: 5, label: "5x5 nhanh" },
          { value: 7, label: "7x7 chuẩn" },
          { value: 9, label: "9x9 dài" },
        ],
      },
      {
        id: "mode", label: "Kiểu khóa ô", default: "vacate",
        choices: [
          { value: "vacate", label: "Tự khóa ô vừa rời (đơn giản)" },
          { value: "choose", label: "Tự chọn ô để khóa (cổ điển, sâu hơn)" },
        ],
      },
    ],
    howTo: [
      "Mỗi người có một quân ở hai góc đối diện. Đến lượt, quân đi theo hàng ngang/dọc/chéo, xa bao nhiêu ô cũng được nếu đường không bị chặn (không nhảy qua ô khóa hay quân địch).",
      "Kiểu 'Tự khóa ô vừa rời': ô bạn vừa đứng sẽ tự bị khóa vĩnh viễn sau khi đi.",
      "Kiểu 'Tự chọn ô để khóa' (cổ điển): sau khi đi, bạn được CHỌN một ô trống BẤT KỲ trên bàn để khóa — dùng để bịt đường đối thủ một cách chiến thuật hơn.",
      "Bảng phía trên cho biết mỗi người còn bao nhiêu nước đi — hãy tìm cách bóp nghẹt số nước của đối thủ.",
      "Sau lượt của bạn, nếu đối thủ không còn nước đi hợp lệ nào thì bạn thắng.",
    ],
    create,
  });
})();
