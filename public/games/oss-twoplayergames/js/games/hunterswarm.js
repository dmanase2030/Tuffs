/* Hunter vs Swarm - co chien thuat bat doi xung */
(function () {
  const N = 7;
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];
  const HUNTERS = [[3, 2], [3, 4]];
  const SWARM = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [2, 0], [4, 6],
  ];
  const DIFF = {
    easy: { target: 6, survive: 24 },
    normal: { target: 8, survive: 20 },
    hard: { target: 10, survive: 16 },
  };

  function create(ctx) {
    const o = ctx.options || {};
    const conf = DIFF[o.mode] || DIFF.normal;
    const CAPTURE_TARGET = conf.target;
    const SURVIVE_TURNS = conf.survive;

    const cells = Array(N * N).fill(null);
    let turn = 0;
    let over = false;
    let selected = -1;
    let captured = 0;
    let swarmTurns = 0;
    let lastMove = null;

    const root = document.createElement("div");
    root.className = "hs-wrap";
    root.innerHTML = `
      <div class="hs-info">
        <div class="hs-stat hs-st-cap">
          <span>${ctx.t("🏹 Bắt", "🏹 Caught")} <b class="hs-captured">0/${CAPTURE_TARGET}</b></span>
          <i class="hs-bar cap"><i></i></i>
        </div>
        <div class="hs-stat hs-st-left">
          <span>${ctx.t("🐗 Bầy còn", "🐗 Swarm left")} <b class="hs-left">${SWARM.length}</b></span>
        </div>
        <div class="hs-stat hs-st-surv">
          <span>${ctx.t("⏳ Sống sót", "⏳ Survived")} <b class="hs-survive">0/${SURVIVE_TURNS}</b></span>
          <i class="hs-bar surv"><i></i></i>
        </div>
      </div>
      <div class="hs-board"></div>
    `;
    ctx.boardEl.appendChild(root);

    const board = root.querySelector(".hs-board");
    const capturedEl = root.querySelector(".hs-captured");
    const leftEl = root.querySelector(".hs-left");
    const surviveEl = root.querySelector(".hs-survive");
    const capBar = root.querySelector(".hs-bar.cap > i");
    const survBar = root.querySelector(".hs-bar.surv > i");
    const cellEls = [];

    HUNTERS.forEach(([r, c], id) => { cells[idx(r, c)] = { side: 0, kind: "hunter", id }; });
    SWARM.forEach(([r, c], id) => { cells[idx(r, c)] = { side: 1, kind: "swarm", id }; });

    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "hs-cell";
      cell.addEventListener("click", () => onCell(i));
      board.appendChild(cell);
      cellEls.push(cell);
    }

    function idx(r, c) { return r * N + c; }
    function row(i) { return Math.floor(i / N); }
    function col(i) { return i % N; }
    function inside(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }
    function swarmLeft() { return cells.filter((cell) => cell && cell.side === 1).length; }

    function alliedSwarmAround(i) {
      const r = row(i), c = col(i);
      let count = 0;
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (!inside(nr, nc)) return;
        const nb = cells[idx(nr, nc)];
        if (nb && nb.side === 1) count++;
      });
      return count;
    }
    function isGuardedSwarm(i) {
      const piece = cells[i];
      return !!piece && piece.side === 1 && alliedSwarmAround(i) >= 2;
    }

    // quân bầy đang bị đe doạ: chưa được bảo vệ và kề một thợ săn (có thể bị bắt ngay)
    function isThreatened(i) {
      const piece = cells[i];
      if (!piece || piece.side !== 1 || isGuardedSwarm(i)) return false;
      const r = row(i), c = col(i);
      return DIRS.some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (!inside(nr, nc)) return false;
        const nb = cells[idx(nr, nc)];
        return nb && nb.side === 0;
      });
    }

    function legalMovesFrom(from) {
      const piece = cells[from];
      if (!piece || piece.side !== turn) return [];
      return piece.side === 0 ? legalHunterMoves(from) : legalSwarmMoves(from);
    }
    function legalHunterMoves(from) {
      const moves = [];
      const sr = row(from), sc = col(from);
      DIRS.forEach(([dr, dc]) => {
        const r1 = sr + dr, c1 = sc + dc;
        if (!inside(r1, c1)) return;
        const first = idx(r1, c1);
        const firstPiece = cells[first];
        if (!firstPiece) {
          moves.push(first);
          const r2 = r1 + dr, c2 = c1 + dc;
          if (!inside(r2, c2)) return;
          const second = idx(r2, c2);
          if (!cells[second]) moves.push(second);
          return;
        }
        if (firstPiece.side === 1 && !isGuardedSwarm(first)) moves.push(first);
      });
      return moves;
    }
    function legalSwarmMoves(from) {
      const moves = [];
      const sr = row(from), sc = col(from);
      DIRS.forEach(([dr, dc]) => {
        const nr = sr + dr, nc = sc + dc;
        if (!inside(nr, nc)) return;
        const target = idx(nr, nc);
        if (!cells[target]) moves.push(target);
      });
      return moves;
    }
    function allLegalMoves(player) {
      const oldTurn = turn;
      turn = player;
      const moves = [];
      cells.forEach((piece, from) => {
        if (!piece || piece.side !== player) return;
        legalMovesFrom(from).forEach((to) => moves.push({ from, to }));
      });
      turn = oldTurn;
      return moves;
    }

    function onCell(i) {
      if (!canAct()) return;
      const piece = cells[i];
      if (piece && piece.side === turn) {
        selected = selected === i ? -1 : i;
        updateStatus();
        render();
        return;
      }
      if (selected < 0) return;
      if (!legalMovesFrom(selected).includes(i)) return;
      applyMove({ from: selected, to: i }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const from = Number(move?.from);
      const to = Number(move?.to);
      if (!Number.isInteger(from) || !Number.isInteger(to)) return;
      if (from < 0 || from >= cells.length || to < 0 || to >= cells.length) return;
      const piece = cells[from];
      if (!piece || piece.side !== turn) return;
      if (!legalMovesFrom(from).includes(to)) return;

      const target = cells[to];
      const didCapture = piece.side === 0 && target && target.side === 1;
      if (didCapture) captured++;
      cells[to] = piece;
      cells[from] = null;
      lastMove = { from, to };
      selected = -1;
      ctx.sound(didCapture ? "capture" : "place");

      if (piece.side === 1) swarmTurns++;
      if (!fromRemote) ctx.sendMove({ from, to });

      if (checkEnd(piece.side)) { render(); return; }

      turn = 1 - turn;
      ctx.setTurn(turn);
      updateStatus();
      render();
    }

    function checkEnd(lastMover) {
      if (captured >= CAPTURE_TARGET || swarmLeft() === 0) {
        finish(0, ctx.t(`🎉 Thợ săn thắng! Đã bắt đủ ${CAPTURE_TARGET} quân Bầy đàn.`, `🎉 Hunters win! Caught all ${CAPTURE_TARGET} Swarm pieces.`));
        return true;
      }
      if (allLegalMoves(0).length === 0) {
        finish(1, ctx.t("🎉 Bầy đàn thắng! Cả hai thợ săn đã bị khóa đường.", "🎉 Swarm wins! Both hunters are locked in."));
        return true;
      }
      if (allLegalMoves(1).length === 0) {
        finish(0, ctx.t("🎉 Thợ săn thắng! Bầy đàn không còn quân nào di chuyển được.", "🎉 Hunters win! The Swarm has no legal moves left."));
        return true;
      }
      if (lastMover === 1 && swarmTurns >= SURVIVE_TURNS) {
        finish(1, ctx.t(`🎉 Bầy đàn thắng! Đã sống sót qua ${SURVIVE_TURNS} lượt mà chưa bị quét sạch.`, `🎉 Swarm wins! Survived ${SURVIVE_TURNS} turns without being wiped out.`));
        return true;
      }
      return false;
    }

    function finish(winner, text) {
      over = true;
      ctx.incScore(winner);
      ctx.setTurn(-1);
      render();
      ctx.setStatus(text);
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi (${turn === 0 ? "Thợ săn" : "Bầy đàn"})...`, `Opponent is moving (${turn === 0 ? "Hunters" : "Swarm"})...`));
        return;
      }
      if (selected >= 0) {
        const moves = legalMovesFrom(selected).length;
        const action = turn === 0 ? ctx.t("đi (tối đa 2 ô) hoặc bắt quân lẻ", "move (up to 2 cells) or catch a lone piece") : ctx.t("áp sát để bao vây/bảo vệ nhau", "close in to surround/protect each other");
        ctx.setStatus(ctx.t(`${turn === 0 ? "🏹 Thợ săn" : "🐗 Bầy đàn"}: chọn ô đến để ${action}. Có ${moves} nước.`, `${turn === 0 ? "🏹 Hunters" : "🐗 Swarm"}: pick a destination to ${action}. ${moves} moves available.`));
        return;
      }
      if (turn === 0) ctx.setStatus(ctx.t(`🏹 Thợ săn: chọn 1 trong 2 quân để săn. Bắt ${captured}/${CAPTURE_TARGET}.`, `🏹 Hunters: pick one of your 2 pieces to hunt. Caught ${captured}/${CAPTURE_TARGET}.`));
      else ctx.setStatus(ctx.t(`🐗 Bầy đàn: chọn quân để áp sát, bảo vệ nhau (🛡️) và khóa đường. Sống sót ${swarmTurns}/${SURVIVE_TURNS}.`, `🐗 Swarm: pick a piece to close in, protect each other (🛡️) and block paths. Survived ${swarmTurns}/${SURVIVE_TURNS}.`));
    }

    function render() {
      const legalTargets = new Set();
      const activeSources = new Set();
      if (canAct()) {
        cells.forEach((piece, i) => {
          if (!piece || piece.side !== turn) return;
          if (legalMovesFrom(i).length) activeSources.add(i);
        });
        if (selected >= 0) legalMovesFrom(selected).forEach((to) => legalTargets.add(to));
      }

      capturedEl.textContent = `${captured}/${CAPTURE_TARGET}`;
      leftEl.textContent = String(swarmLeft());
      surviveEl.textContent = `${swarmTurns}/${SURVIVE_TURNS}`;
      if (capBar) capBar.style.width = Math.min(100, captured / CAPTURE_TARGET * 100) + "%";
      if (survBar) survBar.style.width = Math.min(100, swarmTurns / SURVIVE_TURNS * 100) + "%";

      cellEls.forEach((el, i) => {
        const piece = cells[i];
        el.className = "hs-cell";
        el.innerHTML = "";
        const interactive = canAct() && (activeSources.has(i) || legalTargets.has(i));
        el.disabled = !interactive;

        if ((row(i) + col(i)) % 2 === 0) el.classList.add("alt");
        if (piece) {
          el.classList.add(piece.kind, `p${piece.side + 1}`);
          if (piece.side === 0) {
            el.innerHTML = `<span class="hs-pc">🏹</span>`;
          } else {
            const guarded = isGuardedSwarm(i);
            const threat = !guarded && isThreatened(i);
            el.innerHTML = `<span class="hs-pc">🐗</span>` +
              (guarded ? `<i class="hs-badge shield">🛡️</i>` : "") +
              (threat ? `<i class="hs-badge danger">❗</i>` : "");
            if (guarded) el.classList.add("guarded");
            if (threat) el.classList.add("threat");
          }
        }
        if (lastMove && (lastMove.from === i || lastMove.to === i)) el.classList.add("lastmove");
        if (activeSources.has(i)) el.classList.add("source");
        if (selected === i) el.classList.add("selected");
        if (legalTargets.has(i)) {
          el.classList.add("legal");
          if (piece && piece.side !== turn) el.classList.add("capture");
        }
      });
    }

    ctx.setNames(ctx.t("Thợ săn 🏹", "Hunters 🏹"), ctx.t("Bầy đàn 🐗", "Swarm 🐗"));
    ctx.setTurn(0);
    updateStatus();
    render();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "hunterswarm",
    name: "Thợ Săn & Bầy Đàn",
    emoji: "🏹",
    description: "Cờ chiến thuật bất đối xứng: 2 thợ săn mạnh săn đuổi 12 quân bầy yếu biết bảo vệ nhau (🛡️) và khóa đường. Có cảnh báo quân bị đe doạ.",
    onlineReady: true,
    options: [
      {
        id: "mode", label: "Độ khó (cho Thợ săn)", default: "normal",
        choices: [
          { value: "easy", label: "Dễ (bắt 6, bầy phải sống 24)" },
          { value: "normal", label: "Chuẩn (bắt 8, sống 20)" },
          { value: "hard", label: "Khó (bắt 10, sống 16)" },
        ],
      },
    ],
    howTo: [
      "Người chơi 1 điều khiển 2 quân 🏹 Thợ săn. Người chơi 2 điều khiển 12 quân 🐗 Bầy đàn.",
      "Thợ săn đi tối đa 2 ô theo ngang/dọc/chéo nếu đường trống. Nếu ô KỀ có quân Bầy chưa được bảo vệ, Thợ săn đi vào đó để BẮT.",
      "Bầy đàn mỗi lượt di chuyển 1 quân sang ô trống kề bên (ngang/dọc/chéo).",
      "Quân Bầy đứng cạnh ít nhất 2 đồng minh sẽ được BẢO VỆ (hiện 🛡️) — Thợ săn không bắt trực tiếp được. Quân Bầy chưa được bảo vệ mà đang kề Thợ săn sẽ bị cảnh báo ❗ (sắp bị bắt).",
      "Thợ săn thắng khi bắt đủ số quân mục tiêu. Bầy đàn thắng nếu khóa cả hai Thợ săn hoặc sống sót đủ số lượt. Chọn Độ khó để cân bằng cho hai bên.",
    ],
    create,
  });
})();
