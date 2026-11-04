/* Hive (Tổ Ong) — chơi chung máy, ĐẤU MÁY và ONLINE
   ---------------------------------------------------------------
   KHÔNG có bàn cố định: quân là các mảnh lục giác đặt cạnh nhau, "tổ" mọc dần.
   Mỗi bên có bộ quân: 1 Ong Chúa 🐝, 2 Bọ cánh cứng 🪲, 3 Châu chấu 🦗,
   2 Nhện 🕷️, 3 Kiến 🐜.
   - Đặt quân mới: phải chạm quân CÙNG MÀU và KHÔNG chạm quân địch (trừ 2 nước đầu).
   - Ong Chúa phải xuống bàn chậm nhất ở nước thứ 4 của bạn.
   - Chỉ được DI CHUYỂN quân sau khi Ong Chúa của mình đã xuống bàn.
   - Luật MỘT TỔ: không nước nào được làm tổ tách rời.
   - Thắng khi VÂY KÍN Ong Chúa đối thủ (cả 6 ô quanh nó đều có quân).
   Hệ tọa độ trục (axial) q,r. 6 hướng kề. */
(function () {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const HAND = { Q: 1, B: 2, G: 3, S: 2, A: 3 };
  const TYPE_ORDER = ["Q", "B", "G", "S", "A"];
  const EMOJI = { Q: "🐝", B: "🪲", G: "🦗", S: "🕷️", A: "🐜" };
  // tên + cách đi ngắn gọn cho mỗi loài (giúp người mới dễ hiểu)
  const PNAME = {
    Q: ["Ong Chúa", "Queen"],
    B: ["Bọ cánh cứng", "Beetle"],
    G: ["Châu chấu", "Grasshopper"],
    S: ["Nhện", "Spider"],
    A: ["Kiến", "Ant"],
  };
  const PHINT = {
    Q: ["trượt 1 ô — phải bảo vệ, thua nếu bị vây kín", "slides 1 cell — protect it, you lose if it's surrounded"],
    B: ["đi 1 ô, leo ĐÈ lên quân khác", "moves 1 cell, can climb on top of pieces"],
    G: ["nhảy thẳng qua hàng quân liền kề", "jumps straight over a line of pieces"],
    S: ["đi đúng 3 ô quanh viền tổ", "moves exactly 3 steps around the hive"],
    A: ["trượt xa tùy ý quanh viền tổ", "slides any distance around the hive"],
  };

  const key = (q, r) => q + "," + r;
  function neighbors(q, r) { return DIRS.map(([dq, dr]) => [q + dq, r + dr]); }

  function create(ctx) {
    // cells: { "q,r": [ {p,t}, ... ] }  — phần tử cuối = quân trên cùng (cho Bọ cánh cứng leo)
    let cells = {};
    let turn = 0;
    let over = false;
    let lastMove = null;        // {from?, to}
    let winHexes = null;        // Set các key ô tô sáng khi thắng (Ong Chúa bị vây + quanh)
    let movesSincePlace = 0;    // số nước DI CHUYỂN liên tiếp (không đặt quân mới) -> chống lặp vô hạn
    let selected = null;        // {kind:"hand", t} | {kind:"board", q, r}
    const hands = [Object.assign({}, HAND), Object.assign({}, HAND)];

    const root = document.createElement("div");
    root.className = "hive-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "hive-hud";
    root.appendChild(hud);

    const tray1 = document.createElement("div");
    tray1.className = "hive-tray p1";
    root.appendChild(tray1);

    const wrap = document.createElement("div");
    wrap.className = "hive-wrap";
    const stage = document.createElement("div");
    stage.className = "hive-stage";
    wrap.appendChild(stage);
    root.appendChild(wrap);

    const tray2 = document.createElement("div");
    tray2.className = "hive-tray p2";
    root.appendChild(tray2);

    // ---------- truy vấn trạng thái ----------
    function occKeys(C) { return Object.keys(C).filter((k) => C[k] && C[k].length); }
    function topAt(C, q, r) { const a = C[key(q, r)]; return a && a.length ? a[a.length - 1] : null; }
    function heightAt(C, q, r) { const a = C[key(q, r)]; return a ? a.length : 0; }
    function placedCount(C, p) {
      let n = 0;
      for (const k of occKeys(C)) for (const pc of C[k]) if (pc.p === p) n++;
      return n;
    }
    function queenPlaced(C, p) {
      for (const k of occKeys(C)) for (const pc of C[k]) if (pc.p === p && pc.t === "Q") return true;
      return false;
    }
    function queenCell(C, p) {
      for (const k of occKeys(C)) {
        const a = C[k];
        for (const pc of a) if (pc.p === p && pc.t === "Q") { const [q, r] = k.split(",").map(Number); return [q, r]; }
      }
      return null;
    }
    function queenSurrounded(C, p) {
      const qc = queenCell(C, p);
      if (!qc) return false;
      return neighbors(qc[0], qc[1]).every(([nq, nr]) => heightAt(C, nq, nr) > 0);
    }

    // ---------- một tổ / trượt ----------
    function connectedWithout(C, sq, sr) {
      // mô phỏng nhấc quân trên cùng ở (sq,sr) rồi kiểm tra tổ còn liền không
      const occ = new Set(occKeys(C));
      if (heightAt(C, sq, sr) <= 1) occ.delete(key(sq, sr));
      if (occ.size <= 1) return true;
      const start = occ.values().next().value;
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop();
        const [cq, cr] = cur.split(",").map(Number);
        for (const [nq, nr] of neighbors(cq, cr)) {
          const nk = key(nq, nr);
          if (occ.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      return seen.size === occ.size;
    }
    function commonNeighbors(q1, r1, q2, r2) {
      const s1 = neighbors(q1, r1).map(([a, b]) => key(a, b));
      return neighbors(q2, r2).map(([a, b]) => key(a, b)).filter((k) => s1.includes(k));
    }
    // trượt mặt đất từ (q,r) sang ô kề (tq,tr): đúng 1 ô chung bị chặn (giữ liền & lách khe)
    function canSlide(C, q, r, tq, tr, ignoreKey) {
      const occ = (k) => {
        if (k === ignoreKey) return false;
        const a = C[k]; return !!(a && a.length);
      };
      const com = commonNeighbors(q, r, tq, tr);
      let n = 0;
      for (const k of com) if (occ(k)) n++;
      return n === 1;
    }

    // ---------- sinh nước đi cho 1 quân ----------
    function pieceMoves(C, q, r) {
      const top = topAt(C, q, r);
      if (!top) return [];
      if (!connectedWithout(C, q, r)) return [];
      const ik = key(q, r);
      const stacked = heightAt(C, q, r) > 1; // bọ cánh cứng đang ở trên: nhấc không tách tổ
      const t = top.t;
      if (t === "Q") return slideSteps(C, q, r, ik, 1);
      if (t === "S") return spiderMoves(C, q, r, ik);
      if (t === "A") return antMoves(C, q, r, ik);
      if (t === "G") return grasshopperMoves(C, q, r);
      if (t === "B") return beetleMoves(C, q, r, ik, stacked);
      return [];
    }
    function slideSteps(C, q, r, ik, maxStep) {
      const out = [];
      for (const [nq, nr] of neighbors(q, r)) {
        if (heightAt(C, nq, nr) > 0) continue;
        if (!canSlide(C, q, r, nq, nr, ik)) continue;
        out.push([nq, nr]);
      }
      return out;
    }
    function spiderMoves(C, q, r, ik) {
      const results = new Set();
      const startKey = ik;
      function dfs(cq, cr, depth, visited) {
        if (depth === 3) { results.add(key(cq, cr)); return; }
        for (const [nq, nr] of neighbors(cq, cr)) {
          const nk = key(nq, nr);
          if (nk === startKey || visited.has(nk)) continue;
          if (heightAt(C, nq, nr) > 0) continue;
          if (!canSlide(C, cq, cr, nq, nr, startKey)) continue;
          // phải vẫn chạm tổ
          const touch = neighbors(nq, nr).some(([aq, ar]) => key(aq, ar) !== startKey && heightAt(C, aq, ar) > 0);
          if (!touch) continue;
          visited.add(nk);
          dfs(nq, nr, depth + 1, visited);
          visited.delete(nk);
        }
      }
      dfs(q, r, 0, new Set([startKey]));
      return [...results].map((k) => k.split(",").map(Number));
    }
    function antMoves(C, q, r, ik) {
      const results = new Set();
      const stack = [[q, r]];
      const seen = new Set([ik]);
      while (stack.length) {
        const [cq, cr] = stack.pop();
        for (const [nq, nr] of neighbors(cq, cr)) {
          const nk = key(nq, nr);
          if (seen.has(nk)) continue;
          if (heightAt(C, nq, nr) > 0) continue;
          if (!canSlide(C, cq, cr, nq, nr, ik)) continue;
          const touch = neighbors(nq, nr).some(([aq, ar]) => key(aq, ar) !== ik && heightAt(C, aq, ar) > 0);
          if (!touch) continue;
          seen.add(nk);
          results.add(nk);
          stack.push([nq, nr]);
        }
      }
      return [...results].map((k) => k.split(",").map(Number));
    }
    function grasshopperMoves(C, q, r) {
      const out = [];
      for (const [dq, dr] of DIRS) {
        let cq = q + dq, cr = r + dr;
        if (heightAt(C, cq, cr) === 0) continue; // phải nhảy qua ít nhất 1 quân
        while (heightAt(C, cq, cr) > 0) { cq += dq; cr += dr; }
        out.push([cq, cr]);
      }
      return out;
    }
    function beetleMoves(C, q, r, ik, stacked) {
      const out = [];
      for (const [nq, nr] of neighbors(q, r)) {
        // leo lên quân khác, hoặc xuống ô trống còn chạm tổ
        const h = heightAt(C, nq, nr);
        if (h > 0) { out.push([nq, nr]); continue; }
        const touch = neighbors(nq, nr).some(([aq, ar]) => {
          if (key(aq, ar) === ik && !stacked) return false;
          return heightAt(C, aq, ar) > 0;
        });
        if (touch || stacked) out.push([nq, nr]);
      }
      return out;
    }

    // ---------- sinh nước đặt quân ----------
    function placementCells(C, p) {
      const total = placedCount(C, 0) + placedCount(C, 1);
      if (total === 0) return [[0, 0]];
      if (total === 1) {
        // nước thứ 2: kề quân duy nhất
        const only = occKeys(C)[0].split(",").map(Number);
        return neighbors(only[0], only[1]);
      }
      const out = [];
      const seen = new Set();
      for (const k of occKeys(C)) {
        const [q, r] = k.split(",").map(Number);
        for (const [nq, nr] of neighbors(q, r)) {
          const nk = key(nq, nr);
          if (seen.has(nk) || heightAt(C, nq, nr) > 0) continue;
          seen.add(nk);
          let touchOwn = false, touchEnemy = false;
          for (const [aq, ar] of neighbors(nq, nr)) {
            const tp = topAt(C, aq, ar);
            if (!tp) continue;
            // chạm bất kỳ quân nào trong CỘT (đáy/đỉnh) — dùng đỉnh là đủ cho base set
            if (tp.p === p) touchOwn = true; else touchEnemy = true;
          }
          if (touchOwn && !touchEnemy) out.push([nq, nr]);
        }
      }
      return out;
    }
    function allowedTypes(C, p) {
      const placed = placedCount(C, p);
      const must = placed === 3 && !queenPlaced(C, p); // nước thứ 4 buộc xuống Hậu
      return TYPE_ORDER.filter((t) => hands[p][t] > 0 && (!must || t === "Q"));
    }

    // ---------- thao tác ----------
    function canPlay() { return !over && (!ctx.isOnline || turn === ctx.mySeat); }

    function legalActions(C, p) {
      const acts = [];
      const types = allowedTypes(C, p);
      if (types.length) {
        const cells2 = placementCells(C, p);
        for (const t of types) for (const [q, r] of cells2) acts.push({ place: t, q, r });
      }
      if (queenPlaced(C, p)) {
        for (const k of occKeys(C)) {
          const [q, r] = k.split(",").map(Number);
          const tp = topAt(C, q, r);
          if (!tp || tp.p !== p) continue;
          for (const [tq, tr] of pieceMoves(C, q, r)) acts.push({ from: [q, r], to: [tq, tr] });
        }
      }
      return acts;
    }

    function onHandClick(p, t) {
      if (!canPlay() || p !== turn) return;
      if (!allowedTypes(cells, turn).includes(t)) return;
      selected = { kind: "hand", t };
      render();
      updateStatus();
    }
    function onCellClick(q, r) {
      if (!canPlay()) return;
      // chọn quân của mình để di chuyển
      const top = topAt(cells, q, r);
      if (selected) {
        if (selected.kind === "hand") {
          const ok = placementCells(cells, turn).some(([a, b]) => a === q && b === r);
          if (ok) { applyMove({ place: selected.t, q, r }, false); return; }
        } else if (selected.kind === "board") {
          const ms = pieceMoves(cells, selected.q, selected.r);
          if (ms.some(([a, b]) => a === q && b === r)) {
            applyMove({ from: [selected.q, selected.r], to: [q, r] }, false);
            return;
          }
        }
      }
      if (top && top.p === turn && queenPlaced(cells, turn) && pieceMoves(cells, q, r).length) {
        selected = { kind: "board", q, r };
        render();
        updateStatus();
        return;
      }
      selected = null;
      render();
      updateStatus();
    }

    function applyMove(move, fromRemote) {
      if (over) return;
      if (move.place) {
        const t = move.place, q = Number(move.q), r = Number(move.r);
        if (hands[turn][t] <= 0) return;
        (cells[key(q, r)] = cells[key(q, r)] || []).push({ p: turn, t });
        hands[turn][t]--;
        lastMove = { to: [q, r] };
        movesSincePlace = 0;
      } else if (move.from && move.to) {
        const [fq, fr] = move.from.map(Number);
        const [tq, tr] = move.to.map(Number);
        const a = cells[key(fq, fr)];
        if (!a || !a.length) return;
        const pc = a.pop();
        if (!a.length) delete cells[key(fq, fr)];
        (cells[key(tq, tr)] = cells[key(tq, tr)] || []).push(pc);
        lastMove = { from: [fq, fr], to: [tq, tr] };
        movesSincePlace++;
      } else return;

      selected = null;
      if (!fromRemote) ctx.sendMove(move);
      ctx.sound("place");

      // kiểm tra thắng/thua
      const s0 = queenSurrounded(cells, 0);
      const s1 = queenSurrounded(cells, 1);
      if (s0 || s1) {
        over = true;
        // tô sáng Ong Chúa bị vây + 6 ô quanh
        winHexes = new Set();
        for (const lp of [0, 1]) {
          if ((lp === 0 && s0) || (lp === 1 && s1)) {
            const qc = queenCell(cells, lp);
            if (qc) {
              winHexes.add(key(qc[0], qc[1]));
              neighbors(qc[0], qc[1]).forEach(([nq, nr]) => winHexes.add(key(nq, nr)));
            }
          }
        }
        render();
        if (s0 && s1) {
          ctx.setStatus(ctx.t("🤝 Hòa — cả hai Ong Chúa cùng bị vây!", "🤝 Draw — both Queens surrounded!"));
          ctx.setTurn(-1);
          return;
        }
        const winner = s1 ? 0 : 1; // Ong Chúa bị vây thì bên đó THUA
        ctx.incScore(winner);
        ctx.setStatus(ctx.t(
          `🎉 Người chơi ${winner + 1} thắng — đã vây kín Ong Chúa đối thủ!`,
          `🎉 Player ${winner + 1} wins — the enemy Queen is surrounded!`));
        ctx.setTurn(-1);
        return;
      }

      // chống lặp vô hạn: quá nhiều nước DI CHUYỂN liên tiếp mà không ai đặt quân mới -> hòa
      if (movesSincePlace >= 60) {
        over = true;
        render();
        ctx.setStatus(ctx.t(
          "🤝 Hòa — quá nhiều nước đi qua lại không tiến triển!",
          "🤝 Draw — too many shuffling moves with no progress!"));
        ctx.setTurn(-1);
        return;
      }

      // chuyển lượt; nếu đối thủ không có nước nào -> bỏ lượt (hiếm)
      let next = 1 - turn;
      if (!legalActions(cells, next).length) {
        if (!legalActions(cells, turn).length) {
          over = true;
          render();
          ctx.setStatus(ctx.t("🤝 Hòa — không bên nào còn nước đi.", "🤝 Draw — no legal moves for either side."));
          ctx.setTurn(-1);
          return;
        }
        // đối thủ bị kẹt: giữ lượt người vừa đi
        render();
        ctx.setTurn(turn);
        ctx.setStatus(ctx.t(
          `Người chơi ${next + 1} không có nước hợp lệ — bị bỏ lượt!`,
          `Player ${next + 1} has no legal move — turn skipped!`));
        return;
      }
      turn = next;
      render();
      ctx.setTurn(turn);
      updateStatus();
    }

    // ---------- render ----------
    function renderHud() {
      const me = ctx.isOnline ? ctx.mySeat : -1;
      const warn = (p) => {
        const placed = placedCount(cells, p);
        if (!queenPlaced(cells, p) && placed >= 3) return ctx.t(" ⚠️ phải xuống Hậu!", " ⚠️ must place Queen!");
        return "";
      };
      hud.innerHTML = `
        <div class="hive-side p1 ${turn === 0 && !over ? "active" : ""}">
          <span>🟠 ${ctx.t("Cam", "Orange")}${me === 0 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${queenSurrounded(cells, 0) ? "👑✖" : ""}${warn(0)}</b>
        </div>
        <div class="hive-mid">${over ? "🏁" : "VS"}</div>
        <div class="hive-side p2 ${turn === 1 && !over ? "active" : ""}">
          <span>🟣 ${ctx.t("Tím", "Purple")}${me === 1 ? ctx.t(" (bạn)", " (you)") : ""}</span>
          <b>${queenSurrounded(cells, 1) ? "👑✖" : ""}${warn(1)}</b>
        </div>`;
    }

    function renderTray(trayEl, p) {
      const types = allowedTypes(cells, p);
      const canAct = !over && (!ctx.isOnline || turn === ctx.mySeat) && turn === p;
      trayEl.innerHTML = "";
      for (const t of TYPE_ORDER) {
        const n = hands[p][t];
        const chip = document.createElement("button");
        chip.className = "hive-chip pc-p" + (p + 1);
        chip.disabled = !(canAct && n > 0 && types.includes(t));
        if (selected && selected.kind === "hand" && turn === p && selected.t === t) chip.classList.add("sel");
        const nm = ctx.t(PNAME[t][0], PNAME[t][1]);
        chip.title = nm + " — " + ctx.t(PHINT[t][0], PHINT[t][1]);
        chip.innerHTML =
          `<span class="hive-emoji">${EMOJI[t]}</span>` +
          `<span class="hive-label"><b>${nm}</b><i>${ctx.t(PHINT[t][0], PHINT[t][1])}</i></span>` +
          `<span class="hive-cnt">×${n}</span>`;
        chip.addEventListener("click", () => onHandClick(p, t));
        trayEl.appendChild(chip);
      }
    }

    // chuyển trục q,r -> pixel (lục giác "pointy-top")
    const HEXW = 52, HEXH = 46;
    function axialToPix(q, r) {
      const x = HEXW * (q + r / 2);
      const y = HEXH * 0.75 * r;
      return [x, y];
    }

    function render() {
      renderHud();
      renderTray(tray1, 0);
      renderTray(tray2, 1);
      stage.innerHTML = "";

      const occ = occKeys(cells);
      // các ô đích hợp lệ cho lựa chọn hiện tại
      const targets = new Set();
      if (selected && (!ctx.isOnline || turn === ctx.mySeat)) {
        if (selected.kind === "hand") {
          placementCells(cells, turn).forEach(([q, r]) => targets.add(key(q, r)));
        } else if (selected.kind === "board") {
          pieceMoves(cells, selected.q, selected.r).forEach(([q, r]) => targets.add(key(q, r)));
        }
      }

      // gom mọi ô cần vẽ (đang có quân + ô đích) để canh giữa
      const drawKeys = new Set(occ);
      targets.forEach((k) => drawKeys.add(k));
      if (!drawKeys.size) drawKeys.add("0,0");

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pix = {};
      for (const k of drawKeys) {
        const [q, r] = k.split(",").map(Number);
        const [x, y] = axialToPix(q, r);
        pix[k] = [x, y];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      const padX = -minX + 8, padY = -minY + 8;
      stage.style.width = (maxX - minX + HEXW + 16) + "px";
      stage.style.height = (maxY - minY + HEXH + 16) + "px";

      // vẽ ô đích trước (nằm dưới)
      for (const k of targets) {
        if (occ.includes(k)) continue;
        const [x, y] = pix[k];
        const t = document.createElement("div");
        t.className = "hive-hex target";
        t.style.left = (x + padX) + "px";
        t.style.top = (y + padY) + "px";
        const [q, r] = k.split(",").map(Number);
        t.addEventListener("click", () => onCellClick(q, r));
        stage.appendChild(t);
      }

      // vẽ quân
      for (const k of occ) {
        const a = cells[k];
        const top = a[a.length - 1];
        const [x, y] = pix[k];
        const hex = document.createElement("div");
        hex.className = "hive-hex pc-p" + (top.p + 1);
        if (a.length > 1) hex.classList.add("stacked");
        if (lastMove && lastMove.to && key(lastMove.to[0], lastMove.to[1]) === k) hex.classList.add("last");
        if (winHexes && winHexes.has(k)) hex.classList.add("win");
        if (selected && selected.kind === "board" && key(selected.q, selected.r) === k) hex.classList.add("sel");
        hex.style.left = (x + padX) + "px";
        hex.style.top = (y + padY) + "px";
        hex.innerHTML = `<span class="hive-emoji">${EMOJI[top.t]}</span>` + (a.length > 1 ? `<i class="hive-stack">${a.length}</i>` : "");
        const [q, r] = k.split(",").map(Number);
        hex.addEventListener("click", () => onCellClick(q, r));
        stage.appendChild(hex);
      }
    }

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) { ctx.setStatus(ctx.t("Đối thủ đang đi...", "Opponent is moving...")); return; }
      // đang chọn quân trong khay -> nhắc tên + cách đi
      if (selected && selected.kind === "hand") {
        const t = selected.t;
        ctx.setStatus(ctx.t(
          `Đặt ${PNAME[t][0]} ${EMOJI[t]} (${PHINT[t][0]}) — bấm ô SÁNG để đặt.`,
          `Place the ${PNAME[t][1]} ${EMOJI[t]} (${PHINT[t][1]}) — click a LIT cell to place it.`));
        return;
      }
      if (selected && selected.kind === "board") {
        const tp = topAt(cells, selected.q, selected.r);
        if (tp) {
          ctx.setStatus(ctx.t(
            `Di chuyển ${PNAME[tp.t][0]} ${EMOJI[tp.t]} (${PHINT[tp.t][0]}) — bấm ô SÁNG để đi.`,
            `Move the ${PNAME[tp.t][1]} ${EMOJI[tp.t]} (${PHINT[tp.t][1]}) — click a LIT cell to move.`));
          return;
        }
      }
      const placed = placedCount(cells, turn);
      if (!queenPlaced(cells, turn) && placed >= 3) {
        ctx.setStatus(ctx.t(
          `Người chơi ${turn + 1}: BẮT BUỘC đặt Ong Chúa 🐝 ngay lượt này.`,
          `Player ${turn + 1}: you MUST place your Queen 🐝 this turn.`));
        return;
      }
      const tip = !queenPlaced(cells, turn)
        ? ctx.t(" (nên đặt Ong Chúa 🐝 sớm!)", " (place your Queen 🐝 early!)")
        : "";
      ctx.setStatus(ctx.t(
        `Người chơi ${turn + 1}: chọn 1 con trong khay để ĐẶT, hoặc bấm quân của mình để DI CHUYỂN.${tip}`,
        `Player ${turn + 1}: pick a bug from your tray to PLACE, or click your piece to MOVE.${tip}`));
    }

    // ---------- AI ----------
    function cloneCells(C) {
      const o = {};
      for (const k of Object.keys(C)) if (C[k] && C[k].length) o[k] = C[k].map((pc) => ({ p: pc.p, t: pc.t }));
      return o;
    }
    function applyToCopy(C, H, p, act) {
      const C2 = cloneCells(C);
      const H2 = [Object.assign({}, H[0]), Object.assign({}, H[1])];
      if (act.place) {
        (C2[key(act.q, act.r)] = C2[key(act.q, act.r)] || []).push({ p, t: act.place });
        H2[p][act.place]--;
      } else {
        const a = C2[key(act.from[0], act.from[1])];
        const pc = a.pop();
        if (!a.length) delete C2[key(act.from[0], act.from[1])];
        (C2[key(act.to[0], act.to[1])] = C2[key(act.to[0], act.to[1])] || []).push(pc);
      }
      return [C2, H2];
    }
    function surroundCount(C, p) {
      const qc = queenCell(C, p);
      if (!qc) return 0;
      return neighbors(qc[0], qc[1]).filter(([q, r]) => heightAt(C, q, r) > 0).length;
    }
    function evalFor(C, me) {
      // càng vây Hậu địch càng tốt; Hậu mình bị vây càng nhiều càng tệ
      let s = (surroundCount(C, 1 - me) * 12) - (surroundCount(C, me) * 14);
      if (queenSurrounded(C, 1 - me)) s += 1000;
      if (queenSurrounded(C, me)) s -= 1000;
      // khuyến khích xuống Hậu sớm
      if (queenPlaced(C, me)) s += 4;
      return s;
    }
    // legalActions phiên bản thuần (không phụ thuộc state ngoài) cho AI lookahead 1 lớp đối thủ
    function legalActionsPure(C, H, p) {
      const acts = [];
      const placed = placedCount(C, p);
      const must = placed === 3 && !queenPlaced(C, p);
      const types = TYPE_ORDER.filter((t) => H[p][t] > 0 && (!must || t === "Q"));
      if (types.length) {
        const cells2 = placementCellsPure(C, p);
        for (const t of types) for (const [q, r] of cells2) acts.push({ place: t, q, r });
      }
      if (queenPlaced(C, p)) {
        for (const k of occKeys(C)) {
          const [q, r] = k.split(",").map(Number);
          const tp = topAt(C, q, r);
          if (!tp || tp.p !== p) continue;
          for (const [tq, tr] of pieceMovesPure(C, q, r)) acts.push({ from: [q, r], to: [tq, tr] });
        }
      }
      return acts;
    }
    function placementCellsPure(C, p) {
      const total = placedCount(C, 0) + placedCount(C, 1);
      if (total === 0) return [[0, 0]];
      if (total === 1) { const only = occKeys(C)[0].split(",").map(Number); return neighbors(only[0], only[1]); }
      const out = [], seen = new Set();
      for (const k of occKeys(C)) {
        const [q, r] = k.split(",").map(Number);
        for (const [nq, nr] of neighbors(q, r)) {
          const nk = key(nq, nr);
          if (seen.has(nk) || heightAt(C, nq, nr) > 0) continue;
          seen.add(nk);
          let own = false, en = false;
          for (const [aq, ar] of neighbors(nq, nr)) { const tp = topAt(C, aq, ar); if (!tp) continue; if (tp.p === p) own = true; else en = true; }
          if (own && !en) out.push([nq, nr]);
        }
      }
      return out;
    }
    function pieceMovesPure(C, q, r) { return pieceMoves(C, q, r); }

    function aiMove(level) {
      if (over) return null;
      const me = turn;
      const acts = legalActions(cells, me);
      if (!acts.length) return null;
      if (level === "easy" && Math.random() < 0.45) return acts[Math.floor(Math.random() * acts.length)];

      // giai đoạn 1: chấm điểm nông cho mọi nước (rẻ), bắt thắng ngay
      const scored = [];
      for (const act of acts) {
        const [C2] = applyToCopy(cells, hands, me, act);
        if (queenSurrounded(C2, 1 - me)) return act; // thắng ngay
        scored.push({ act, sc: evalFor(C2, me) });
      }
      if (level !== "hard") {
        // normal: chọn theo eval nông + chút ngẫu nhiên
        let best = -Infinity, pick = scored[0].act;
        for (const s of scored) { const v = s.sc + Math.random() * 0.5; if (v > best) { best = v; pick = s.act; } }
        return pick;
      }

      // hard: chỉ lookahead phản công cho TOP-K nước tốt nhất (giảm tải lớn)
      scored.sort((a, b) => b.sc - a.sc);
      const topK = Math.min(10, scored.length);
      let best = -Infinity, pick = scored[0].act;
      for (let i = 0; i < topK; i++) {
        const act = scored[i].act;
        const [C2, H2] = applyToCopy(cells, hands, me, act);
        const opp = legalActionsPure(C2, H2, 1 - me);
        let worst = Infinity;
        for (const oa of opp.slice(0, 30)) {
          const [C3] = applyToCopy(C2, H2, 1 - me, oa);
          if (queenSurrounded(C3, me)) { worst = -2000; break; }
          const v = evalFor(C3, me);
          if (v < worst) worst = v;
        }
        let sc = opp.length ? scored[i].sc * 0.4 + worst * 0.6 : scored[i].sc;
        sc += Math.random() * 0.5;
        if (sc > best) { best = sc; pick = act; }
      }
      return pick;
    }

    ctx.setNames(ctx.t("Người chơi 1 (Cam)", "Player 1 (Orange)"), ctx.t("Người chơi 2 (Tím)", "Player 2 (Purple)"));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "hive",
    name: "Tổ Ong (Hive)",
    emoji: "🐝",
    description: "Cờ chiến thuật không cần bàn: quân là mảnh lục giác ghép sát nhau, 'tổ' mọc dần. Mỗi loài côn trùng đi một kiểu riêng. Vây kín Ong Chúa đối thủ để thắng.",
    onlineReady: true,
    supportsAI: true,
    howTo: [
      "MỤC TIÊU đơn giản: vây kín Ong Chúa 🐝 của đối thủ — khi cả 6 ô quanh nó đều có quân (màu nào cũng được) thì bạn THẮNG. Hãy bảo vệ Ong Chúa của mình!",
      "Không có bàn cờ vẽ sẵn — các quân là mảnh lục giác ghép sát nhau, 'tổ' lớn dần. Mỗi bên có: 1 Ong Chúa 🐝, 2 Bọ cánh cứng 🪲, 3 Châu chấu 🦗, 2 Nhện 🕷️, 3 Kiến 🐜 (xem tên & cách đi ngay trên mỗi nút trong khay). Cam đi trước.",
      "ĐẶT quân: bấm 1 con trong khay (khay của bạn nằm phía bạn), rồi bấm ô SÁNG. Quân mới phải chạm quân CÙNG MÀU và KHÔNG chạm quân địch (riêng 2 nước đầu được nới lỏng).",
      "Ong Chúa 🐝 phải được đặt chậm nhất ở nước thứ 4. Bạn chỉ được DI CHUYỂN quân SAU KHI Ong Chúa đã ở trên bàn — bấm quân của mình rồi bấm ô sáng để đi.",
      "Cách đi từng loài: 🐝 Ong Chúa trượt 1 ô; 🪲 Bọ cánh cứng đi 1 ô và LEO ĐÈ lên quân khác; 🦗 Châu chấu nhảy thẳng qua hàng quân liền kề; 🕷️ Nhện đi đúng 3 ô quanh viền tổ; 🐜 Kiến trượt xa tùy ý quanh viền tổ.",
      "Luật MỘT TỔ: tổ luôn phải LIỀN MỘT KHỐI — không nước nào được tách rời tổ, và quân phải 'lách' được qua khe (không chui qua chỗ bị kẹp kín hai bên).",
      "Mẹo cho người mới: đặt Ong Chúa sớm để được di chuyển, dùng Kiến 🐜 (cơ động nhất) để bao vây, và đừng để quân mình vô tình bịt nốt ô cuối quanh Ong Chúa của chính mình.",
    ],
    create,
  });
})();
