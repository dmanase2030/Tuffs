/* Cờ Quân Úp (Stratego) - bản gọn 10x8 (ít ô trống hơn), mỗi bên 2 hàng quân (20 quân). */
(function () {
  const COLS = 10;
  const ROWS = 8;
  const LAKES = new Set();
  const FORMATION = [
    9, 8,
    7, 7,
    6, 6, 6,
    5, 5, 5,
    4, 4,
    3, 3, 3,
    2, 2,
    1,
    11,
    0,
  ];
  const PIECES = {
    0: { name: "Cờ", short: "CỜ", icon: "🏳️", fixed: true },
    1: { name: "Điệp viên", short: "ĐV", icon: "🕵️" },
    2: { name: "Trinh sát", short: "TR", icon: "🔎", scout: true },
    3: { name: "Công binh", short: "CB", icon: "🛠️" },
    4: { name: "Trung sĩ", short: "TS", icon: "🛡️" },
    5: { name: "Trung úy", short: "TU", icon: "🎯" },
    6: { name: "Đại úy", short: "DU", icon: "⚔️" },
    7: { name: "Thiếu tá", short: "TT", icon: "🏅" },
    8: { name: "Đại tá", short: "DT", icon: "🎖️" },
    9: { name: "Tướng", short: "T9", icon: "👑" },
    11: { name: "Bom", short: "BOM", icon: "💣", fixed: true },
  };

  function create(ctx) {
    const total = COLS * ROWS;
    const board = new Array(total).fill(null);
    let turn = 0;
    let selected = null;
    let over = false;
    // bản dịch tên/mã quân (PIECES là hằng module-level)
    const PIECE_NAME_EN = { 0: "Flag", 1: "Spy", 2: "Scout", 3: "Miner", 4: "Sergeant", 5: "Lieutenant", 6: "Captain", 7: "Major", 8: "Colonel", 9: "General", 11: "Bomb" };
    const PIECE_SHORT_EN = { 0: "FL", 1: "SP", 2: "SC", 3: "MN", 4: "SG", 5: "LT", 6: "CP", 7: "MJ", 8: "CL", 9: "G9", 11: "BMB" };
    const rankName = (rank) => ctx.t(PIECES[rank].name, PIECE_NAME_EN[rank] || PIECES[rank].name);
    const rankShort = (rank) => ctx.t(PIECES[rank].short, PIECE_SHORT_EN[rank] || PIECES[rank].short);
    let lastMove = null;
    const log = [ctx.t("Mỗi bên chỉ có 2 hàng quân. Bàn rộng, khoảng trống nhiều để dò và bọc cờ.", "Each side has only 2 rows of pieces. The board is wide, with space to scout and flank.")];

    setupSide(0);
    setupSide(1);

    const root = document.createElement("div");
    root.className = "st-root";

    const info = document.createElement("div");
    info.className = "st-info";
    root.appendChild(info);

    const wrap = document.createElement("div");
    wrap.className = "st-wrap";
    const grid = document.createElement("div");
    grid.className = "st-grid";
    grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    wrap.appendChild(grid);
    root.appendChild(wrap);

    const legend = document.createElement("div");
    legend.className = "st-legend";
    root.appendChild(legend);

    ctx.boardEl.appendChild(root);

    const cellEls = [];
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("button");
      cell.className = "st-cell";
      cell.type = "button";
      cell.addEventListener("click", () => onClick(visualToBoard(i)));
      grid.appendChild(cell);
      cellEls.push(cell);
    }

    function setupSide(owner) {
      const ranks = shuffled(FORMATION);
      const rows = owner === 0 ? [ROWS - 2, ROWS - 1] : [0, 1];
      let k = 0;
      rows.forEach((r) => {
        for (let c = 0; c < COLS; c++) {
          const rank = ranks[k++];
          board[r * COLS + c] = { owner, rank, revealed: false, moved: false };
        }
      });
    }

    function shuffled(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function rc(i) {
      return [Math.floor(i / COLS), i % COLS];
    }

    function index(r, c) {
      return r * COLS + c;
    }

    function viewSeat() {
      if (ctx.isOnline) return ctx.mySeat;
      return turn === 1 ? 1 : 0;
    }

    function shouldFlipBoard() {
      return viewSeat() === 1;
    }

    function visualToBoard(i) {
      if (!shouldFlipBoard()) return i;
      const [r, c] = rc(i);
      return index(ROWS - 1 - r, COLS - 1 - c);
    }

    function inBounds(r, c) {
      return r >= 0 && r < ROWS && c >= 0 && c < COLS;
    }

    function isLake(i) {
      return LAKES.has(i);
    }

    function canPlay() {
      return !over && (!ctx.isOnline || turn === ctx.mySeat);
    }

    function movable(p) {
      return p && !PIECES[p.rank].fixed;
    }

    function legalTargets(i) {
      const p = board[i];
      if (!movable(p) || isLake(i)) return [];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [r, c] = rc(i);
      const res = [];

      dirs.forEach(([dr, dc]) => {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
          const ni = index(nr, nc);
          if (isLake(ni)) break;
          const target = board[ni];
          if (target) {
            if (target.owner !== p.owner) res.push(ni);
            break;
          }
          res.push(ni);
          if (!PIECES[p.rank].scout) break;
          nr += dr;
          nc += dc;
        }
      });
      return res;
    }

    function onClick(i) {
      if (!canPlay() || isLake(i)) return;
      const p = board[i];
      if (selected === null) {
        if (p && p.owner === turn && movable(p) && legalTargets(i).length) {
          selected = i;
          render();
        }
        return;
      }

      if (i === selected) {
        selected = null;
        render();
        return;
      }

      if (p && p.owner === turn && movable(p)) {
        selected = legalTargets(i).length ? i : null;
        render();
        return;
      }

      if (legalTargets(selected).includes(i)) {
        applyMove({ from: selected, to: i }, false);
      }
    }

    function combat(att, def) {
      if (def.rank === 0) return "flag";
      if (def.rank === 11) return att.rank === 3 ? "win" : "lose";
      if (att.rank === 1 && def.rank === 9) return "win";
      if (att.rank === def.rank) return "both";
      return att.rank > def.rank ? "win" : "lose";
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      const from = Number(move.from);
      const to = Number(move.to);
      const att = board[from];
      if (!att || att.owner !== turn || !legalTargets(from).includes(to)) return;

      if (!fromRemote) ctx.sendMove({ from, to });

      const def = board[to];
      lastMove = { from, to, landed: -1, battle: !!def };

      if (!def) {
        att.moved = true;
        board[to] = att;
        board[from] = null;
        lastMove.landed = to;
        addLog(ctx.t(`P${att.owner + 1} di chuyển ${pieceName(att)}.`, `P${att.owner + 1} moves ${pieceName(att)}.`));
        ctx.sound("select");
      } else {
        att.revealed = true;
        def.revealed = true;
        const result = combat(att, def);
        ctx.sound("capture");
        if (result === "flag") {
          att.moved = true;
          board[to] = att;
          board[from] = null;
          lastMove.landed = to;
          addLog(ctx.t(`${pieceName(att)} bắt được Cờ đối thủ.`, `${pieceName(att)} captured the enemy Flag.`));
          selected = null;
          render();
          return endGame(att.owner, ctx.t("Cờ đã bị bắt!", "The flag was captured!"));
        }
        if (result === "win") {
          att.moved = true;
          board[to] = att;
          board[from] = null;
          lastMove.landed = to;
          addLog(ctx.t(`${pieceName(att)} thắng ${pieceName(def)}.`, `${pieceName(att)} beats ${pieceName(def)}.`));
        } else if (result === "lose") {
          board[from] = null;
          addLog(ctx.t(`${pieceName(att)} thua ${pieceName(def)}.`, `${pieceName(att)} loses to ${pieceName(def)}.`));
        } else {
          board[from] = null;
          board[to] = null;
          addLog(ctx.t(`${pieceName(att)} và ${pieceName(def)} cùng cấp, cả hai bị loại.`, `${pieceName(att)} and ${pieceName(def)} are equal rank; both are removed.`));
        }
      }

      selected = null;

      const loser = noMoves();
      if (loser !== -1) return endGame(1 - loser, ctx.t("Đối thủ không còn quân có thể di chuyển.", "Opponent has no movable pieces left."));

      turn = 1 - turn;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function pieceName(p) {
      return ctx.t(`${PIECES[p.rank].name} P${p.owner + 1}`, `${rankName(p.rank)} P${p.owner + 1}`);
    }

    function addLog(text) {
      log.unshift(text);
      while (log.length > 5) log.pop();
    }

    function noMoves() {
      for (let pl = 0; pl < 2; pl++) {
        let has = false;
        for (let i = 0; i < total; i++) {
          const p = board[i];
          if (p && p.owner === pl && movable(p) && legalTargets(i).length) {
            has = true;
            break;
          }
        }
        if (!has) return pl;
      }
      return -1;
    }

    function endGame(winner, msg) {
      over = true;
      selected = null;
      board.forEach((p) => {
        if (p) p.revealed = true;
      });
      ctx.setTurn(-1);
      render();
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng! ${msg}`, `🎉 Player ${winner + 1} wins! ${msg}`));
    }

    function visibleToMe(p) {
      if (!p) return false;
      if (p.revealed || over) return true;
      if (ctx.isOnline) return p.owner === ctx.mySeat;
      return p.owner === turn;
    }

    function render() {
      renderInfo();
      renderLegend();
      root.classList.toggle("st-flipped", shouldFlipBoard());
      const targets = selected !== null ? new Set(legalTargets(selected)) : new Set();
      for (let vi = 0; vi < total; vi++) {
        const i = visualToBoard(vi);
        const cell = cellEls[vi];
        const p = board[i];
        cell.className = "st-cell";
        cell.innerHTML = "";
        cell.disabled = over || isLake(i) || !canPlay();

        if (isLake(i)) {
          cell.classList.add("st-lake");
          cell.textContent = "≈";
          continue;
        }

        if (p) {
          const data = PIECES[p.rank];
          const seeIt = visibleToMe(p);
          cell.classList.add(p.owner === 0 ? "st-p1" : "st-p2");
          if (seeIt) {
            const icon = document.createElement("span");
            icon.className = "st-icon";
            icon.textContent = data.icon;
            cell.appendChild(icon);

            const power = document.createElement("span");
            power.className = "st-power";
            power.textContent = powerText(p.rank);
            cell.appendChild(power);

            const tag = document.createElement("span");
            tag.className = "st-rank";
            tag.textContent = rankShort(p.rank);
            cell.appendChild(tag);

            if (p.revealed && !over) {
              const eye = document.createElement("span");
              eye.className = "st-revealed";
              eye.textContent = "👁️";
              cell.appendChild(eye);
            }
          } else {
            cell.classList.add("st-hidden");
            cell.textContent = p.moved ? "▣" : "▩";
          }
        }

        if (lastMove) {
          if (i === lastMove.from) cell.classList.add("st-lastfrom");
          if (i === lastMove.to && lastMove.battle) cell.classList.add("st-lastbattle");
          if (i === lastMove.landed) cell.classList.add("st-lastto");
        }
        if (selected === i) cell.classList.add("st-sel");
        if (targets.has(i)) cell.classList.add("st-target");
      }
    }

    function powerText(rank) {
      if (rank === 0) return ctx.t("Cờ", "Flag");
      if (rank === 11) return ctx.t("Bom", "Bomb");
      return ctx.t("Sức " + rank, "Rank " + rank);
    }

    function renderInfo() {
      const counts = [countArmy(0), countArmy(1)];
      info.innerHTML = `
        <div class="st-player ${turn === 0 && !over ? "active" : ""}">
          <b>${ctx.t("Người chơi 1", "Player 1")}</b>
          <span>${counts[0].alive} ${ctx.t("quân", "pieces")} · ${counts[0].mobile} ${ctx.t("cơ động", "mobile")}</span>
        </div>
        <div class="st-mid">
          <b>${over ? ctx.t("Kết thúc", "Finished") : ctx.t("Lượt", "Turn") + " " + (turn + 1)}</b>
          <span>${ctx.t("Bàn 10×8 · 20 quân mỗi bên · chỉ 2 hàng quân", "10×8 board · 20 pieces each · only 2 rows")}</span>
          <small>${log[0] || ""}</small>
        </div>
        <div class="st-player ${turn === 1 && !over ? "active" : ""}">
          <b>${ctx.t("Người chơi 2", "Player 2")}</b>
          <span>${counts[1].alive} ${ctx.t("quân", "pieces")} · ${counts[1].mobile} ${ctx.t("cơ động", "mobile")}</span>
        </div>
      `;
    }

    function countArmy(owner) {
      const mine = board.filter((p) => p && p.owner === owner);
      return {
        alive: mine.length,
        mobile: mine.filter((p) => movable(p)).length,
      };
    }

    function renderLegend() {
      const ranks = [9, 8, 7, 6, 5, 4, 3, 2, 1, 11, 0];
      legend.innerHTML = `
        <div class="st-piece-list">
          ${ranks.map((rank) => {
            const p = PIECES[rank];
            const note = rank === 2 ? ctx.t("đi xa", "moves far") : rank === 3 ? ctx.t("gỡ bom", "defuses bombs") : rank === 1 ? ctx.t("hạ Tướng khi tấn công", "beats the General on attack") : rank === 11 ? ctx.t("đứng yên", "immobile") : rank === 0 ? ctx.t("bị bắt là thua", "lose if captured") : ctx.t(`cấp ${rank}`, `rank ${rank}`);
            return `<span><b>${p.icon} ${rankShort(rank)}</b><small>${rankName(rank)} · ${note}</small></span>`;
          }).join("")}
        </div>
        <div class="st-log">${log.map((x) => `<span>${x}</span>`).join("")}</div>
      `;
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang đi. Nước đi gần nhất được đánh dấu xanh lá (ô đi tới sáng, ô xuất phát viền nét đứt).",
          "Opponent is moving. The last move is marked green (destination glows, origin is dashed)."));
        return;
      }
      ctx.setStatus(ctx.t("Chọn quân của bạn rồi chọn ô hợp lệ. Nước đi của lượt vừa rồi được đánh dấu xanh lá.",
        "Pick your piece then a legal cell. The previous turn's move is marked green."));
    }

    if (ctx.isOnline) {
      ctx.setNames(ctx.t(`Người chơi 1${ctx.mySeat === 0 ? " (bạn)" : ""}`, `Player 1${ctx.mySeat === 0 ? " (you)" : ""}`),
                   ctx.t(`Người chơi 2${ctx.mySeat === 1 ? " (bạn)" : ""}`, `Player 2${ctx.mySeat === 1 ? " (you)" : ""}`));
    }
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "stratego",
    name: "Cờ Quân Úp (Stratego)",
    emoji: "🎖️",
    description: "Stratego gọn: bàn 10×8, mỗi bên 2 hàng quân úp (20 quân), bắt Cờ đối thủ để thắng.",
    onlineReady: true,
    options: [],
    howTo: [
      "Bàn 10×8 nhưng mỗi người chỉ có 20 quân úp ở 2 hàng phía mình.",
      "Bạn chỉ thấy quân của mình; quân đối thủ úp cho tới khi giao tranh.",
      "Chọn một quân có thể đi rồi chọn ô hợp lệ. Phần lớn quân đi 1 ô ngang/dọc; 🔎 Trinh sát có thể đi thẳng nhiều ô nếu đường không bị chặn.",
      "Khi đâm vào quân địch, cả hai quân lộ mặt. Cấp cao hơn thắng; cùng cấp thì cả hai bị loại.",
      "Luật đặc biệt: 💣 Bom đứng yên và hạ quân tấn công, trừ 🛠️ Công binh gỡ được bom. 🕵️ Điệp viên hạ 👑 Tướng nếu chủ động tấn công.",
      "🏳️ Cờ và 💣 Bom không di chuyển được. Bắt được Cờ đối thủ là thắng ngay.",
      "Nước đi của lượt vừa rồi được đánh dấu xanh lá (ô quân đi tới sáng lên, ô xuất phát có viền nét đứt) để bạn theo dõi đối thủ vừa đi đâu.",
    ],
    create,
  });
})();
