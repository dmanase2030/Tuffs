/* Territory War - chiếm ô, xây tường, tấn công vùng đối thủ theo lượt. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 11;
    const GOAL = o.goal || 55;
    const AP = o.actions === "blitz" ? 2 : 1; // số hành động mỗi lượt
    const MOUNTAINS = o.mountains === "many" ? Math.round(N * 1.15)
      : o.mountains === "few" ? Math.round(N * 0.45)
      : Math.round(N * 0.8);

    let grid = makeMap();
    let turn = 0;
    let mode = "claim";
    let over = false;
    let apLeft = AP;
    let lastCell = null;       // [r,c] ô vừa tác động
    let pendingFloat = [];     // chữ nổi chờ vẽ
    let last = ctx.t("Mở rộng lãnh thổ từ căn cứ, xây tường giữ biên, rồi đánh vào vùng đối thủ.", "Expand from your base, build walls to hold the border, then attack enemy territory.");

    const root = document.createElement("div");
    root.className = "tw-root";

    const hud = document.createElement("div");
    hud.className = "tw-hud";
    root.appendChild(hud);

    const actions = document.createElement("div");
    actions.className = "tw-actions";
    const claimBtn = actionButton(ctx.t("Chiếm ô", "Claim"), "claim", "CLAIM", ctx.t("ô trung lập kề biên", "neutral cell on border"));
    const wallBtn = actionButton(ctx.t("Xây tường", "Build wall"), "wall", "WALL", ctx.t("tăng thủ ô mình", "boost your cell's defense"));
    const attackBtn = actionButton(ctx.t("Tấn công", "Attack"), "attack", "ATK", ctx.t("đánh ô địch kề biên", "hit enemy cell on border"));
    const endBtn = document.createElement("button");
    endBtn.className = "btn small tw-action tw-end";
    endBtn.innerHTML = `<span>END</span><b>${ctx.t("Kết thúc lượt", "End turn")}</b><small>${ctx.t("nhường lượt", "pass turn")}</small>`;
    endBtn.addEventListener("click", () => applyMove({ t: "end" }, false));
    actions.appendChild(claimBtn);
    actions.appendChild(wallBtn);
    actions.appendChild(attackBtn);
    if (AP > 1) actions.appendChild(endBtn);
    root.appendChild(actions);

    const legend = document.createElement("div");
    legend.className = "tw-legend";
    legend.innerHTML = `
      <span><i class="tw-leg p1"></i> ${ctx.t("Vùng đỏ", "Red zone")}</span>
      <span><i class="tw-leg p2"></i> ${ctx.t("Vùng xanh", "Blue zone")}</span>
      <span><i class="tw-leg neutral"></i> ${ctx.t("Trung lập", "Neutral")}</span>
      <span><i class="tw-leg mountain"></i> ${ctx.t("Núi chắn", "Mountain")}</span>
      <span><i class="tw-leg supply"></i> ${ctx.t("Kho tiếp tế", "Supply depot")}</span>
      <span><i class="tw-leg wall"></i> ${ctx.t("Tường", "Wall")}</span>
    `;
    root.appendChild(legend);

    const board = document.createElement("div");
    board.className = "tw-board";
    board.style.setProperty("--tw-n", N);
    root.appendChild(board);
    ctx.boardEl.appendChild(root);

    const cells = Array.from({ length: N }, () => Array(N));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "tw-cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.dataset.coord = coord(r, c);
        cell.addEventListener("click", () => onCell(r, c));
        board.appendChild(cell);
        cells[r][c] = cell;
      }
    }

    function actionButton(label, id, icon, sub) {
      const btn = document.createElement("button");
      btn.className = "btn small tw-action";
      btn.innerHTML = `<span>${icon}</span><b>${label}</b><small>${sub}</small>`;
      btn.addEventListener("click", () => {
        mode = id;
        render();
        updateStatus();
      });
      return btn;
    }

    function makeMap() {
      const map = Array.from({ length: N }, () =>
        Array.from({ length: N }, () => ({ owner: -1, type: "plain", wall: 0, base: -1 }))
      );

      function safe(r, c) {
        const p1 = Math.abs(r - (N - 1)) + Math.abs(c);
        const p2 = Math.abs(r) + Math.abs(c - (N - 1));
        return p1 <= 3 || p2 <= 3;
      }

      let placed = 0;
      let guard = 0;
      while (placed < MOUNTAINS && guard++ < 1000) {
        const r = 1 + Math.floor(ctx.rng() * (N - 2));
        const c = 1 + Math.floor(ctx.rng() * (N - 2));
        const mr = N - 1 - r;
        const mc = N - 1 - c;
        if (safe(r, c) || safe(mr, mc)) continue;
        if (map[r][c].type !== "plain" || map[mr][mc].type !== "plain") continue;
        map[r][c].type = "mountain";
        map[mr][mc].type = "mountain";
        placed += r === mr && c === mc ? 1 : 2;
      }

      const mid = Math.floor(N / 2);
      const supplies = [
        [mid, mid],
        [mid - 2, mid - 1],
        [mid + 2, mid + 1],
        [mid - 1, mid + 2],
        [mid + 1, mid - 2],
      ];
      supplies.forEach(([r, c]) => {
        if (inside(r, c) && map[r][c].type !== "mountain") map[r][c].type = "supply";
      });

      const p1Start = [[N - 1, 0], [N - 2, 0], [N - 1, 1], [N - 3, 0], [N - 2, 1], [N - 1, 2]];
      const p2Start = p1Start.map(([r, c]) => [N - 1 - r, N - 1 - c]);
      p1Start.forEach(([r, c], i) => {
        map[r][c].owner = 0;
        map[r][c].type = "plain";
        map[r][c].wall = i === 0 ? 1 : 0;
      });
      p2Start.forEach(([r, c], i) => {
        map[r][c].owner = 1;
        map[r][c].type = "plain";
        map[r][c].wall = i === 0 ? 1 : 0;
      });
      map[N - 1][0].base = 0;
      map[0][N - 1].base = 1;
      return map;
    }

    function onCell(r, c) {
      if (!canAct()) return;
      if (mode === "claim" && legalClaim(r, c)) {
        applyMove({ t: "claim", r, c }, false);
      } else if (mode === "wall" && legalWall(r, c)) {
        applyMove({ t: "wall", r, c }, false);
      } else if (mode === "attack" && legalAttack(r, c)) {
        applyMove({ t: "attack", r, c, ar: rollDie(), dr: rollDie() }, false);
      }
    }

    function canAct(fromRemote) {
      return !over && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function applyMove(move, fromRemote) {
      if (!canAct(fromRemote)) return;
      lastCell = null;
      let ok = false;
      if (move.t === "claim") ok = doClaim(move);
      else if (move.t === "wall") ok = doWall(move);
      else if (move.t === "attack") ok = doAttack(move);
      else if (move.t === "end") ok = doEnd();
      if (!ok) return;
      if (!fromRemote) ctx.sendMove(move);
      render();
      flushFloats();
      updateStatus();
    }

    function spendAction() {
      apLeft--;
      if (apLeft <= 0) endTurn();
    }

    function doEnd() {
      last = ctx.t(`Người chơi ${turn + 1} kết thúc lượt.`, `Player ${turn + 1} ended the turn.`);
      endTurn();
      return true;
    }

    function floatText(r, c, text, cls) { pendingFloat.push({ r, c, text, cls }); }
    function flushFloats() {
      if (!pendingFloat.length) return;
      pendingFloat.forEach(({ r, c, text, cls }) => {
        const cell = cells[r] && cells[r][c];
        if (!cell) return;
        const s = document.createElement("span");
        s.className = "tw-float " + (cls || "");
        s.textContent = text;
        cell.appendChild(s);
        setTimeout(() => s.remove(), 950);
        cell.classList.add("tw-flash");
        setTimeout(() => cell.classList.remove("tw-flash"), 340);
      });
      pendingFloat = [];
    }

    function doClaim(move) {
      if (!legalClaim(move.r, move.c)) return false;
      const cell = grid[move.r][move.c];
      cell.owner = turn;
      cell.wall = 0;
      lastCell = [move.r, move.c];
      last = ctx.t(`Người chơi ${turn + 1} chiếm ${cell.type === "supply" ? "kho tiếp tế" : "ô"} ${coord(move.r, move.c)}.`, `Player ${turn + 1} claimed ${cell.type === "supply" ? "supply depot" : "cell"} ${coord(move.r, move.c)}.`);
      ctx.sound(cell.type === "supply" ? "capture" : "select");
      if (!checkEnd()) spendAction();
      return true;
    }

    function doWall(move) {
      if (!legalWall(move.r, move.c)) return false;
      const cell = grid[move.r][move.c];
      cell.wall = Math.min(2, cell.wall + 1);
      lastCell = [move.r, move.c];
      floatText(move.r, move.c, "🛡+1", "wall");
      last = ctx.t(`Người chơi ${turn + 1} xây tường cấp ${cell.wall} tại ${coord(move.r, move.c)}.`, `Player ${turn + 1} built a level ${cell.wall} wall at ${coord(move.r, move.c)}.`);
      ctx.sound("select");
      spendAction();
      return true;
    }

    function doAttack(move) {
      if (!legalAttack(move.r, move.c)) return false;
      const cell = grid[move.r][move.c];
      const defender = cell.owner;
      const ar = clampDie(move.ar);
      const dr = clampDie(move.dr);
      const atkSupport = supportFor(turn, move.r, move.c);
      const defSupport = supportFor(defender, move.r, move.c) + cell.wall * 2 + (cell.base === defender ? 2 : 0);
      const atk = ar + atkSupport;
      const def = dr + defSupport;
      lastCell = [move.r, move.c];

      if (atk >= def) {
        cell.owner = turn;
        cell.wall = Math.max(0, cell.wall - 1);
        floatText(move.r, move.c, `⚔${atk}>${def}`, "win");
        last = ctx.t(`Tấn công ${coord(move.r, move.c)}: ${ar}+${atkSupport} thắng ${dr}+${defSupport}. Vùng này đổi chủ.`, `Attack ${coord(move.r, move.c)}: ${ar}+${atkSupport} beats ${dr}+${defSupport}. This cell changed hands.`);
        ctx.sound(cell.base === defender ? "capture" : "shot");
        if (!checkEnd()) spendAction();
      } else {
        const hadWall = cell.wall > 0;
        if (hadWall) cell.wall--;
        floatText(move.r, move.c, `⚔${atk}<${def}`, "lose");
        last = ctx.t(`Tấn công ${coord(move.r, move.c)} thất bại: ${ar}+${atkSupport} thua ${dr}+${defSupport}.`, `Attack on ${coord(move.r, move.c)} failed: ${ar}+${atkSupport} lost to ${dr}+${defSupport}.`)
          + (hadWall ? ctx.t(" Tường phòng thủ bị mài mòn.", " The defensive wall was worn down.") : "");
        ctx.sound("miss");
        spendAction();
      }
      return true;
    }

    function legalClaim(r, c) {
      return inside(r, c)
        && grid[r][c].type !== "mountain"
        && grid[r][c].owner === -1
        && hasAdjacentOwner(turn, r, c);
    }

    function legalWall(r, c) {
      return inside(r, c)
        && grid[r][c].owner === turn
        && grid[r][c].type !== "mountain"
        && grid[r][c].wall < 2;
    }

    function legalAttack(r, c) {
      return inside(r, c)
        && grid[r][c].type !== "mountain"
        && grid[r][c].owner === 1 - turn
        && hasAdjacentOwner(turn, r, c);
    }

    function hasAdjacentOwner(owner, r, c) {
      return DIRS.some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        return inside(nr, nc) && grid[nr][nc].owner === owner;
      });
    }

    function supportFor(owner, r, c) {
      let support = 0;
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && grid[nr][nc].owner === owner) support++;
      });
      return support + Math.min(2, supplyCount(owner));
    }

    function supplyCount(owner) {
      let count = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (grid[r][c].owner === owner && grid[r][c].type === "supply") count++;
      return count;
    }

    function ownedCount(owner) {
      let count = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (grid[r][c].owner === owner) count++;
      return count;
    }

    function claimableCount() {
      let count = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (grid[r][c].type !== "mountain") count++;
      return count;
    }

    function checkEnd() {
      const enemyBase = turn === 0 ? grid[0][N - 1] : grid[N - 1][0];
      if (enemyBase.owner === turn) {
        finish(turn, ctx.t(`chiếm thủ phủ đối thủ tại ${turn === 0 ? coord(0, N - 1) : coord(N - 1, 0)}`, `captured the enemy capital at ${turn === 0 ? coord(0, N - 1) : coord(N - 1, 0)}`));
        return true;
      }
      const target = Math.ceil(claimableCount() * GOAL / 100);
      if (ownedCount(turn) >= target) {
        finish(turn, ctx.t(`kiểm soát ${GOAL}% bản đồ`, `controlled ${GOAL}% of the map`));
        return true;
      }
      return false;
    }

    function finish(winner, reason) {
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng - ${reason}!`, `🎉 Player ${winner + 1} wins — ${reason}!`));
    }

    function endTurn() {
      turn = 1 - turn;
      mode = "claim";
      apLeft = AP;
      ctx.setTurn(turn);
    }

    function rollDie() {
      return 1 + Math.floor(ctx.rng() * 6);
    }

    function clampDie(v) {
      return Math.max(1, Math.min(6, Number(v) || 1));
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function render() {
      const legal = new Set();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (mode === "claim" && legalClaim(r, c)) legal.add(r + "," + c);
          else if (mode === "wall" && legalWall(r, c)) legal.add(r + "," + c);
          else if (mode === "attack" && legalAttack(r, c)) legal.add(r + "," + c);
        }
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = grid[r][c];
          const el = cells[r][c];
          el.className = "tw-cell";
          el.innerHTML = "";
          el.dataset.coord = coord(r, c);
          if (cell.type === "mountain") {
            el.classList.add("mountain");
            el.innerHTML = `<span class="tw-mountain" aria-hidden="true"></span>`;
          } else {
            el.classList.add(cell.owner === -1 ? "neutral" : cell.owner === 0 ? "p1" : "p2");
            if (cell.type === "supply") {
              el.classList.add("supply");
              el.innerHTML += `<span class="tw-supply" aria-hidden="true">✦</span>`;
            }
            if (cell.base !== -1) {
              el.classList.add("base", cell.base === 0 ? "base-p1" : "base-p2");
              el.innerHTML += `<span class="tw-base" aria-hidden="true">HQ</span>`;
            }
            if (cell.wall > 0) {
              el.classList.add("walled", "wall-" + cell.wall);
              el.innerHTML += `<span class="tw-wallbar">${"▮".repeat(cell.wall)}</span>`;
            }
          }
          if (legal.has(r + "," + c)) el.classList.add("legal", "legal-" + mode);
          if (lastCell && lastCell[0] === r && lastCell[1] === c) el.classList.add("tw-last");
        }
      }

      hud.innerHTML = `
        ${playerPanel(0)}
        <div class="tw-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : ctx.t(`Lượt Người chơi ${turn + 1}`, `Player ${turn + 1}'s turn`)}</b>
          ${AP > 1 && !over ? `<span class="tw-ap">${ctx.t(`Hành động: ${apLeft}/${AP}`, `Actions: ${apLeft}/${AP}`)}</span>` : ""}
          <span>${modeLabel()}</span>
          <small>${last}</small>
        </div>
        ${playerPanel(1)}
      `;
      updateButtons();
    }

    function playerPanel(owner) {
      const owned = ownedCount(owner);
      const supplies = supplyCount(owner);
      const target = Math.ceil(claimableCount() * GOAL / 100);
      return `
        <div class="tw-player p${owner + 1} ${turn === owner && !over ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${owner + 1}`, `Player ${owner + 1}`)}</span>
          <b>${owned}/${target} ${ctx.t("ô", "cells")}</b>
          <em>${ctx.t(`Tiếp tế ${supplies} • hỗ trợ +${Math.min(2, supplies)}`, `Supply ${supplies} • support +${Math.min(2, supplies)}`)}</em>
          <i style="width:${Math.min(100, owned / target * 100)}%"></i>
        </div>
      `;
    }

    function modeLabel() {
      if (mode === "claim") return ctx.t("Chiếm ô trung lập kề lãnh thổ.", "Claim a neutral cell next to your territory.");
      if (mode === "wall") return ctx.t("Xây tường trên ô của mình để tăng phòng thủ.", "Build a wall on your cell to boost defense.");
      return ctx.t("Đánh ô địch kề biên giới bằng roll + hỗ trợ.", "Attack a bordering enemy cell with roll + support.");
    }

    function updateButtons() {
      claimBtn.classList.toggle("active", mode === "claim");
      wallBtn.classList.toggle("active", mode === "wall");
      attackBtn.classList.toggle("active", mode === "attack");
      const lock = !canAct();
      claimBtn.disabled = lock;
      wallBtn.disabled = lock;
      attackBtn.disabled = lock;
      endBtn.disabled = lock;
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t(`Đối thủ đang đi. ${last}`, `Opponent's turn. ${last}`));
      } else {
        ctx.setStatus(ctx.t(`${modeLabel()} Mục tiêu: chiếm thủ phủ đối thủ hoặc đạt ${GOAL}% bản đồ.`, `${modeLabel()} Goal: capture the enemy capital or reach ${GOAL}% of the map.`));
      }
    }

    function coord(r, c) {
      return String.fromCharCode(65 + c) + (r + 1);
    }

    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "territorywar",
    name: "Territory War",
    emoji: "🗺️",
    description: "Mở rộng lãnh thổ, xây tường phòng thủ và tấn công vùng đối thủ trên bản đồ chiến thuật.",
    onlineReady: true,
    options: [
      {
        id: "size",
        label: "Kích thước bản đồ",
        default: 11,
        choices: [
          { value: 9, label: "9×9 (nhanh)" },
          { value: 11, label: "11×11 (chuẩn)" },
          { value: 13, label: "13×13 (rộng)" },
        ],
      },
      {
        id: "mountains",
        label: "Núi chắn",
        default: "normal",
        choices: [
          { value: "few", label: "Ít" },
          { value: "normal", label: "Vừa" },
          { value: "many", label: "Nhiều" },
        ],
      },
      {
        id: "goal",
        label: "Tỷ lệ kiểm soát để thắng",
        default: 55,
        choices: [
          { value: 50, label: "50%" },
          { value: 55, label: "55%" },
          { value: 60, label: "60%" },
        ],
      },
      {
        id: "actions",
        label: "Hành động mỗi lượt",
        default: "classic",
        choices: [
          { value: "classic", label: "Cổ điển (1 hành động)" },
          { value: "blitz", label: "Càn quét (2 hành động)" },
        ],
      },
    ],
    howTo: [
      "Mỗi lượt chọn một hành động: Chiếm ô, Xây tường hoặc Tấn công.",
      "Chế độ Càn quét: mỗi lượt được làm 2 hành động liên tiếp, có thể bấm 'Kết thúc lượt' để nhường sớm.",
      "Chiếm ô: lấy một ô trung lập kề với lãnh thổ của bạn.",
      "Xây tường: tăng phòng thủ cho một ô của bạn, tối đa cấp 2.",
      "Tấn công: chọn ô địch kề biên giới. Hai bên roll d6, cộng hỗ trợ từ các ô lân cận. Kết quả roll hiện ngay trên ô tranh chấp.",
      "Kho tiếp tế ở giữa bản đồ khi thuộc về bạn sẽ tăng hỗ trợ tấn công/phòng thủ, tối đa +2.",
      "Chiếm thủ phủ đối thủ hoặc kiểm soát đủ tỷ lệ bản đồ đã chọn để thắng.",
    ],
    create,
  });
})();
