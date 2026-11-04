/* Laser Chess - xoay/di chuyen guong, ban tia, pha loi doi thu */
(function () {
  const N = 8;
  const DIR = { up: [-1, 0], down: [1, 0] };
  const ADJ = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function create(ctx) {
    let turn = 0;
    let over = false;
    let lastBeam = [];
    let lastHit = null;
    let beamColor = 0;
    let selected = -1;
    const cells = [];
    const pieces = Array(N * N).fill(null);

    const root = document.createElement("div");
    root.className = "lc-root";
    ctx.boardEl.appendChild(root);

    const bar = document.createElement("div");
    bar.className = "lc-bar";
    bar.innerHTML = `<span class="lc-turn"></span><button class="btn small lc-rotate" type="button">${ctx.t("↻ Xoay gương đã chọn", "↻ Rotate selected mirror")}</button>`;
    root.appendChild(bar);
    const turnEl = bar.querySelector(".lc-turn");
    const rotateBtn = bar.querySelector(".lc-rotate");
    rotateBtn.addEventListener("click", () => {
      if (selected >= 0) applyMove({ t: "rotate", idx: selected }, false);
    });

    const board = document.createElement("div");
    board.className = "lc-board";
    root.appendChild(board);

    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "lc-cell";
      cell.addEventListener("click", () => onCell(i));
      board.appendChild(cell);
      cells.push(cell);
    }

    setup();

    function setup() {
      setPiece(7, 0, { type: "cannon", player: 0 });
      setPiece(7, 4, { type: "core", player: 0 });
      setPiece(6, 2, { type: "mirror", player: 0, mirror: "/" });
      setPiece(6, 5, { type: "mirror", player: 0, mirror: "\\" });
      setPiece(5, 1, { type: "mirror", player: 0, mirror: "\\" });
      setPiece(5, 6, { type: "mirror", player: 0, mirror: "/" });

      setPiece(0, 7, { type: "cannon", player: 1 });
      setPiece(0, 3, { type: "core", player: 1 });
      setPiece(1, 5, { type: "mirror", player: 1, mirror: "/" });
      setPiece(1, 2, { type: "mirror", player: 1, mirror: "\\" });
      setPiece(2, 6, { type: "mirror", player: 1, mirror: "\\" });
      setPiece(2, 1, { type: "mirror", player: 1, mirror: "/" });
    }

    function setPiece(r, c, piece) { pieces[idx(r, c)] = piece; }
    function idx(r, c) { return r * N + c; }
    function row(i) { return Math.floor(i / N); }
    function col(i) { return i % N; }
    function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
    function canAct() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function moveTargets(i) {
      const r = row(i), c = col(i);
      const out = [];
      ADJ.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inB(nr, nc) && !pieces[idx(nr, nc)]) out.push(idx(nr, nc));
      });
      return out;
    }

    function onCell(i) {
      if (!canAct()) return;
      const piece = pieces[i];
      if (piece && piece.type === "mirror" && piece.player === turn) {
        if (selected === i) { applyMove({ t: "rotate", idx: i }, false); return; }
        selected = i;
        render();
        return;
      }
      if (selected >= 0 && !piece && moveTargets(selected).includes(i)) {
        applyMove({ t: "move", from: selected, to: i }, false);
        return;
      }
      selected = -1;
      render();
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      if (move.t === "rotate") {
        const i = Number(move.idx);
        const piece = pieces[i];
        if (!piece || piece.type !== "mirror" || piece.player !== turn) return;
        piece.mirror = piece.mirror === "/" ? "\\" : "/";
        ctx.sound("rotate");
      } else if (move.t === "move") {
        const from = Number(move.from), to = Number(move.to);
        const piece = pieces[from];
        if (!piece || piece.type !== "mirror" || piece.player !== turn) return;
        if (pieces[to] || !moveTargets(from).includes(to)) return;
        pieces[to] = piece;
        pieces[from] = null;
        ctx.sound("place");
      } else {
        return;
      }
      selected = -1;

      if (!fromRemote) ctx.sendMove(move);

      const shot = fireLaser(turn);
      lastBeam = shot.path;
      lastHit = shot.hit;
      beamColor = turn;
      render();

      if (shot.winner !== null) {
        over = true;
        ctx.incScore(shot.winner);
        ctx.setTurn(-1);
        ctx.setStatus(shot.selfHit
          ? ctx.t(`🎉 Người chơi ${shot.winner + 1} thắng! Đối thủ tự bắn trúng lõi của mình.`, `🎉 Player ${shot.winner + 1} wins! The opponent shot their own core.`)
          : ctx.t(`🎉 Người chơi ${shot.winner + 1} thắng! Laser bắn trúng lõi đối thủ.`, `🎉 Player ${shot.winner + 1} wins! The laser hit the enemy core.`));
        return;
      }

      turn = 1 - turn;
      ctx.setTurn(turn);
      updateStatus(shot.looped);
      render();
    }

    // mô phỏng tia từ pháo của player; không đổi trạng thái
    function fireLaser(player) {
      const cannon = pieces.findIndex((p) => p && p.type === "cannon" && p.player === player);
      let r = row(cannon), c = col(cannon);
      let [dr, dc] = player === 0 ? DIR.up : DIR.down;
      const path = [];
      const visited = new Set();
      for (let step = 0; step < N * N * 8; step++) {
        r += dr; c += dc;
        if (!inB(r, c)) return { path, hit: null, winner: null, looped: false };
        const i = idx(r, c);
        path.push(i);
        const stateKey = `${i}:${dr}:${dc}`;
        if (visited.has(stateKey)) return { path, hit: i, winner: null, looped: true };
        visited.add(stateKey);
        const piece = pieces[i];
        if (!piece) continue;
        if (piece.type === "mirror") { [dr, dc] = reflect(piece.mirror, dr, dc); continue; }
        if (piece.type === "core") {
          const selfHit = piece.player === player;
          return { path, hit: i, winner: selfHit ? 1 - player : player, looped: false, selfHit };
        }
        return { path, hit: i, winner: null, looped: false };
      }
      return { path, hit: null, winner: null, looped: true };
    }

    function reflect(mirror, dr, dc) {
      return mirror === "/" ? [-dc, -dr] : [dc, dr];
    }

    // ---------- AI (đấu máy) ----------
    function cloneBoard(b) { return b.map((p) => (p ? { ...p } : null)); }

    // mô phỏng bắn tia trên một bàn bất kỳ (không đổi trạng thái thật)
    function fireOn(b, player) {
      const cannon = b.findIndex((p) => p && p.type === "cannon" && p.player === player);
      if (cannon < 0) return { winner: 1 - player, endCell: -1, selfHit: false };
      let r = row(cannon), c = col(cannon);
      let [dr, dc] = player === 0 ? DIR.up : DIR.down;
      let endCell = cannon;
      const visited = new Set();
      for (let step = 0; step < N * N * 8; step++) {
        r += dr; c += dc;
        if (!inB(r, c)) return { winner: null, endCell, selfHit: false };
        const i = idx(r, c);
        endCell = i;
        const key = `${i}:${dr}:${dc}`;
        if (visited.has(key)) return { winner: null, endCell, selfHit: false };
        visited.add(key);
        const piece = b[i];
        if (!piece) continue;
        if (piece.type === "mirror") { [dr, dc] = reflect(piece.mirror, dr, dc); continue; }
        if (piece.type === "core") {
          const self = piece.player === player;
          return { winner: self ? 1 - player : player, endCell: i, selfHit: self };
        }
        return { winner: null, endCell: i, selfHit: false }; // chạm pháo
      }
      return { winner: null, endCell, selfHit: false };
    }

    function genAiMoves(b, player) {
      const out = [];
      for (let i = 0; i < N * N; i++) {
        const p = b[i];
        if (p && p.type === "mirror" && p.player === player) {
          out.push({ t: "rotate", idx: i });
          const r = row(i), c = col(i);
          ADJ.forEach(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (inB(nr, nc) && !b[idx(nr, nc)]) out.push({ t: "move", from: i, to: idx(nr, nc) });
          });
        }
      }
      return out;
    }

    function applySimMove(b, move) {
      const nb = cloneBoard(b);
      if (move.t === "rotate") {
        const p = nb[Number(move.idx)];
        if (p && p.type === "mirror") p.mirror = p.mirror === "/" ? "\\" : "/";
      } else {
        nb[Number(move.to)] = nb[Number(move.from)];
        nb[Number(move.from)] = null;
      }
      return nb;
    }

    function corePos(b, player) { return b.findIndex((p) => p && p.type === "core" && p.player === player); }

    // mức độ "đe dọa" của tia do shooter bắn tới lõi đối tượng (gần hơn = lớn hơn)
    function threat(b, shooter, targetCore) {
      const shot = fireOn(b, shooter);
      if (shot.winner === shooter && !shot.selfHit) return 1000;
      if (shot.endCell < 0 || targetCore < 0) return 0;
      const d = Math.abs(row(shot.endCell) - row(targetCore)) + Math.abs(col(shot.endCell) - col(targetCore));
      return Math.max(0, 16 - d);
    }

    function evalBoard(b, me) {
      const opp = 1 - me;
      return threat(b, me, corePos(b, opp)) - threat(b, opp, corePos(b, me));
    }

    function aiMove(level) {
      if (over) return null;
      const me = turn, opp = 1 - me;
      const moves = genAiMoves(pieces, me);
      if (!moves.length) return null;
      if (level === "easy" && Math.random() < 0.5) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
      let best = -Infinity, pick = moves[0];
      for (const mv of moves) {
        const b2 = applySimMove(pieces, mv);
        const shot = fireOn(b2, me); // sau khi đi, pháo của mình tự bắn
        let score;
        if (shot.winner === me && !shot.selfHit) score = 1e9;        // thắng ngay
        else if (shot.winner === opp) score = -1e9;                  // tự bắn trúng lõi mình
        else if (level === "hard") {
          // đối thủ phản đòn: tìm nước khiến mình tệ nhất
          const oppMoves = genAiMoves(b2, opp);
          let worst = Infinity;
          for (const om of oppMoves) {
            const b3 = applySimMove(b2, om);
            const os = fireOn(b3, opp);
            let s;
            if (os.winner === opp && !os.selfHit) s = -1e8;          // đối thủ thắng
            else if (os.winner === me) s = 1e8;                      // đối thủ tự sát
            else s = evalBoard(b3, me);
            if (s < worst) worst = s;
            if (worst <= -1e8) break;
          }
          score = oppMoves.length ? worst : evalBoard(b2, me);
        } else {
          score = evalBoard(b2, me);
        }
        score += Math.random() * 0.01;
        if (score > best) { best = score; pick = mv; }
      }
      return pick;
    }

    function pieceHtml(piece) {
      if (piece.type === "cannon") return `<span class="lc-pc cannon ${piece.player === 0 ? "aim-up" : "aim-down"}"><i></i></span>`;
      if (piece.type === "core") return `<span class="lc-pc core"><i></i></span>`;
      return `<span class="lc-pc mirror ${piece.mirror === "/" ? "m-slash" : "m-back"}"></span>`;
    }

    function updateStatus(looped = false) {
      renderBar();
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang tính nước...", "Opponent is thinking...")); return; }
      const extra = looped ? ctx.t(" (Tia vừa bị vòng lặp và tan biến.)", " (The beam just looped and dissipated.)") : "";
      ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: bấm một gương của mình để CHỌN, bấm lần nữa để XOAY, hoặc bấm ô trống kề bên để DI CHUYỂN. Xong là pháo tự bắn.${extra}`, `Player ${turn + 1}: click one of your mirrors to SELECT, click again to ROTATE, or click an adjacent empty cell to MOVE. Then the cannon fires automatically.${extra}`));
    }

    function renderBar() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      turnEl.innerHTML = over
        ? `<b class="lc-tag">${ctx.t("Kết thúc", "Game over")}</b>`
        : `<b class="lc-tag p${turn + 1}">${turn === 0 ? ctx.t("🔴 Đỏ", "🔴 Red") : ctx.t("🔵 Xanh", "🔵 Blue")}${me === turn ? ctx.t(" (bạn)", " (you)") : ""}</b>${ctx.t(" đang đi", " to move")}`;
      rotateBtn.disabled = !canAct() || selected < 0;
    }

    function render() {
      const beam = new Set(lastBeam);
      // đường ngắm dự đoán của người đang tới lượt (tia sẽ bay nếu bắn ngay bây giờ)
      const preview = (!over && canAct()) ? new Set(fireLaser(turn).path) : new Set();
      const moves = (selected >= 0 && canAct()) ? new Set(moveTargets(selected)) : new Set();

      cells.forEach((cell, i) => {
        const piece = pieces[i];
        let cls = "lc-cell";
        if ((row(i) + col(i)) % 2 === 0) cls += " alt";
        if (row(i) >= 5) cls += " home1";
        else if (row(i) <= 2) cls += " home2";
        cell.innerHTML = "";
        cell.disabled = true;

        if (preview.has(i) && !beam.has(i)) cls += " preview";
        if (beam.has(i)) cls += " beam b" + (beamColor + 1);
        if (lastHit === i) cls += " hit";
        if (moves.has(i)) { cls += " movetarget"; cell.disabled = !canAct(); }

        if (piece) {
          cls += ` p${piece.player + 1} ${piece.type}`;
          cell.innerHTML = pieceHtml(piece);
          if (piece.type === "mirror" && piece.player === turn && canAct()) {
            cell.disabled = false;
            cls += " legal";
            if (selected === i) cls += " selected";
          }
        }
        cell.className = cls;
      });
      renderBar();
    }

    ctx.setNames(ctx.t("Người chơi 1 (Đỏ)", "Player 1 (Red)"), ctx.t("Người chơi 2 (Xanh)", "Player 2 (Blue)"));
    ctx.setTurn(0);
    updateStatus();
    render();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "laserchess",
    name: "Laser Chess",
    emoji: "🔦",
    description: "Xoay hoặc di chuyển gương để phản xạ tia laser. Bắn trúng lõi đối thủ là thắng. Có đường ngắm dự đoán và tia laser phát sáng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "Mỗi người có một 🔫 pháo laser, một 💠 lõi và 4 gương phản chiếu (/ hoặc \\).",
      "Đến lượt: bấm vào một gương của mình để CHỌN nó. Bấm lần nữa vào gương đó để XOAY (đổi / ↔ \\), hoặc bấm vào một ô trống kề bên để DI CHUYỂN gương sang đó.",
      "Sau khi xoay/di chuyển, pháo của bạn TỰ ĐỘNG bắn laser. Tia đi thẳng và phản xạ khi gặp gương.",
      "Đường ngắm mờ cho biết tia hiện sẽ bay tới đâu nếu bắn ngay — dùng để tính trước nước đi.",
      "Nếu laser trúng 💠 lõi đối thủ, bạn thắng. Cẩn thận: nếu tự dẫn tia vào lõi của mình, đối thủ thắng.",
    ],
    create,
  });
})();
