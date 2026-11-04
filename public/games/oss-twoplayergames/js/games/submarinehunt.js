/* Submarine Hunt - online hidden information duel. */
(function () {
  const N = 9;
  const MAX_HP = 3;
  const REEFS = new Set([31, 32, 40, 48, 49]);
  const START_ROWS = [N - 2, N - 1];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function create(ctx) {
    const o = ctx.options || {};
    const dronesMax = o.drones || 3;
    const chargesMax = o.charges || 6;
    const divesMax = o.dives === undefined ? 2 : Number(o.dives);

    let phase = "setup"; // setup | play | over
    let turn = 0; // 0 submarine, 1 hunter
    let round = 1;
    let awaiting = false;
    let mode = ctx.mySeat === 1 ? "sonar" : "move";
    let pendingStart = null;
    let sub = null; // only real on submarine client
    let subHp = MAX_HP;
    let drones = dronesMax;
    let charges = chargesMax;
    let dives = divesMax;
    let shield = false;
    let lastNoise = null;
    let finalSub = null;
    const marks = Object.create(null);
    const log = [ctx.t("Tàu ngầm phải lẩn qua vùng săn và thoát lên tuyến phía Bắc.", "The submarine must slip through the hunt zone and escape to the northern line.")];
    const bearingLabel = (b) => ctx.t(b, { "Bắc": "North", "Nam": "South", "Tây": "West", "Đông": "East" }[b] || b);

    const root = document.createElement("div");
    root.className = "sh-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "sh-hud";
    root.appendChild(hud);

    const boardWrap = document.createElement("div");
    boardWrap.className = "sh-board-wrap";
    const grid = document.createElement("div");
    grid.className = "sh-grid";
    grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${N}, 1fr)`;
    boardWrap.appendChild(grid);
    root.appendChild(boardWrap);

    const controls = document.createElement("div");
    controls.className = "sh-controls";
    root.appendChild(controls);

    const intel = document.createElement("div");
    intel.className = "sh-intel";
    root.appendChild(intel);

    const cells = [];
    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement("button");
      cell.className = "sh-cell";
      cell.type = "button";
      cell.addEventListener("click", () => onCell(i));
      grid.appendChild(cell);
      cells.push(cell);
    }

    function rc(i) {
      return [Math.floor(i / N), i % N];
    }

    function idx(r, c) {
      return r * N + c;
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function key(r, c) {
      return `${r},${c}`;
    }

    function isWater(i) {
      return i >= 0 && i < N * N && !REEFS.has(i);
    }

    function manhattan(a, b) {
      return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
    }

    function chebyshev(a, b) {
      return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
    }

    function addLog(text) {
      log.unshift(text);
      while (log.length > 6) log.pop();
    }

    function subSVG(variant) {
      const hull = variant === "final" ? "#b91c3c" : "#f5c542";
      const dark = variant === "final" ? "#7f1020" : "#c9990f";
      const glow = variant === "final" ? "#ffcaca" : "#bff4ff";
      return `<svg class="sh-sub-svg" viewBox="0 0 64 40" aria-hidden="true">
        <g opacity="0.85">
          <circle cx="6" cy="14" r="1.4" fill="${glow}" opacity="0">
            <animate attributeName="cy" values="20;6" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0.8;0" dur="1.8s" repeatCount="indefinite"/>
          </circle>
          <circle cx="9" cy="14" r="1" fill="${glow}" opacity="0">
            <animate attributeName="cy" values="22;8" dur="2.3s" begin="0.6s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0;0.7;0" dur="2.3s" begin="0.6s" repeatCount="indefinite"/>
          </circle>
        </g>
        <g>
          <g transform="translate(6 22)">
            <g>
              <ellipse cx="0" cy="0" rx="2" ry="7" fill="${dark}"/>
              <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.5s" repeatCount="indefinite"/>
            </g>
          </g>
          <path d="M2 22 q6 -11 24 -11 h18 q14 0 18 11 q-4 11 -18 11 h-18 q-18 0 -24 -11 z" fill="${hull}" stroke="${dark}" stroke-width="2"/>
          <path d="M6 17 q8 -5 22 -5 h16 q11 0 15 6 q-30 -3 -53 -1 z" fill="#ffffff" opacity="0.18"/>
          <rect x="28" y="4" width="11" height="10" rx="2.5" fill="${hull}" stroke="${dark}" stroke-width="2"/>
          <line x1="33" y1="4" x2="33" y2="-2" stroke="${dark}" stroke-width="2.5"/>
          <circle cx="33" cy="-2" r="2.2" fill="${glow}">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite"/>
          </circle>
          <circle cx="16" cy="22" r="3.2" fill="#0c1a2e"/>
          <circle cx="28" cy="22" r="3.2" fill="#0c1a2e"/>
          <circle cx="40" cy="22" r="3.2" fill="#0c1a2e"/>
          <circle cx="16" cy="22" r="1.6" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/></circle>
          <circle cx="28" cy="22" r="1.6" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.4s" repeatCount="indefinite"/></circle>
          <circle cx="40" cy="22" r="1.6" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.8s" repeatCount="indefinite"/></circle>
          <path d="M60 14 l4 8 l-4 8 q-3 -8 0 -16 z" fill="${dark}"/>
        </g>
      </svg>`;
    }

    function bearingIcon(b) {
      return b === "Bắc" ? "⬆️" : b === "Nam" ? "⬇️" : b === "Tây" ? "⬅️" : "➡️";
    }

    function canAct() {
      return !over() && !awaiting && ctx.isOnline && turn === ctx.mySeat;
    }

    function over() {
      return phase === "over";
    }

    function validStart(i) {
      const [r] = rc(i);
      return START_ROWS.includes(r) && isWater(i);
    }

    function subTargets() {
      if (!sub) return [];
      const list = [];
      DIRS.forEach(([dr, dc]) => {
        const nr = sub.r + dr;
        const nc = sub.c + dc;
        const ni = idx(nr, nc);
        if (inside(nr, nc) && isWater(ni)) list.push(ni);
      });
      return list;
    }

    function decoyTargets() {
      if (!sub) return [];
      const list = [idx(sub.r, sub.c)];
      DIRS.forEach(([dr, dc]) => {
        const nr = sub.r + dr;
        const nc = sub.c + dc;
        const ni = idx(nr, nc);
        if (inside(nr, nc) && isWater(ni)) list.push(ni);
      });
      return list;
    }

    function onCell(i) {
      if (!ctx.isOnline || over()) return;
      const [r, c] = rc(i);
      if (!isWater(i)) return;

      if (phase === "setup") {
        if (ctx.mySeat !== 0 || !validStart(i)) return;
        pendingStart = { r, c };
        render();
        return;
      }

      if (!canAct()) return;

      if (ctx.mySeat === 0) {
        if (mode === "decoy") {
          if (!decoyTargets().includes(i)) return;
          doSubAction({ t: "subAction", kind: "decoy", r, c }, false);
          return;
        }
        if (!subTargets().includes(i)) return;
        doSubAction({ t: "subAction", kind: mode === "silent" ? "silent" : "move", r, c }, false);
        return;
      }

      if (ctx.mySeat === 1) {
        doHunt({ t: "hunt", kind: mode, r, c }, false);
      }
    }

    function confirmStart() {
      if (!pendingStart || ctx.mySeat !== 0 || phase !== "setup") return;
      sub = { r: pendingStart.r, c: pendingStart.c };
      phase = "play";
      turn = 0;
      ctx.sendMove({ t: "ready" });
      ctx.setTurn(0);
      addLog(ctx.t("Tàu ngầm đã lặn. Hãy chọn hướng di chuyển đầu tiên.", "The submarine has dived. Choose your first move."));
      render();
      updateStatus();
    }

    function beginHunterSide() {
      phase = "play";
      turn = 0;
      ctx.setTurn(0);
      addLog(ctx.t("Tàu ngầm đã lặn. Chờ tín hiệu âm thanh đầu tiên.", "The submarine has dived. Wait for the first sound signal."));
      render();
      updateStatus();
    }

    function noiseFor(point, silent, decoy) {
      if (silent) {
        return { silent: true, text: ctx.t("Tàu ngầm chạy im lặng, không có tín hiệu rõ.", "The submarine runs silent — no clear signal."), zoneR: -1, zoneC: -1 };
      }
      const zoneR = point.r <= 2 ? 0 : point.r <= 5 ? 1 : 2;
      const zoneC = point.c <= 2 ? 0 : point.c <= 5 ? 1 : 2;
      const rows = [ctx.t("Bắc", "North"), ctx.t("Trung tâm", "Center"), ctx.t("Nam", "South")];
      const cols = [ctx.t("Tây", "West"), ctx.t("giữa", "middle"), ctx.t("Đông", "East")];
      return {
        silent: false,
        decoy: !!decoy,
        zoneR,
        zoneC,
        text: ctx.t(`${decoy ? "Tín hiệu giả" : "Âm chân vịt"} vọng từ vùng ${rows[zoneR]}-${cols[zoneC]}.`, `${decoy ? "A decoy signal" : "Propeller noise"} echoes from the ${rows[zoneR]}-${cols[zoneC]} zone.`),
      };
    }

    function doSubAction(move, fromRemote) {
      if (fromRemote) {
        applySubEvent(move);
        return;
      }
      if (ctx.mySeat !== 0 || phase !== "play" || turn !== 0 || awaiting || !sub) return;

      let point = { r: Number(move.r), c: Number(move.c) };
      let silent = move.kind === "silent";
      let decoy = move.kind === "decoy";
      if (decoy) {
        if (!decoyTargets().includes(idx(point.r, point.c))) return;
      } else {
        if (!subTargets().includes(idx(point.r, point.c))) return;
        sub = point;
      }

      const noise = noiseFor(point, silent, decoy);
      const escaped = !decoy && sub.r === 0;
      ctx.sendMove({ t: "subEvent", noise, escaped, round });
      lastNoise = noise;
      addLog(noise.text);
      if (escaped) {
        render();
        finish(0, ctx.t("tàu ngầm đã vượt tuyến phía Bắc", "the submarine crossed the northern line"));
        return;
      }
      turn = 1;
      ctx.sound(silent ? "select" : "place");
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function doDive() {
      if (ctx.mySeat !== 0 || phase !== "play" || turn !== 0 || awaiting || !sub || dives <= 0) return;
      dives -= 1;
      shield = true;
      const noise = { silent: true, text: ctx.t("Tàu ngầm lặn sâu — biến mất khỏi sonar.", "The submarine dives deep — vanishing from sonar."), zoneR: -1, zoneC: -1 };
      ctx.sendMove({ t: "subEvent", noise, escaped: false, round, dived: true });
      lastNoise = noise;
      addLog(ctx.t("Bạn lặn sâu: chặn sát thương quả mìn kế tiếp. Lượt này không di chuyển.", "You dive deep: blocking the next mine's damage. No move this turn."));
      turn = 1;
      ctx.sound("select");
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function applySubEvent(move) {
      if (phase !== "play") return;
      lastNoise = move.noise || null;
      addLog(lastNoise?.text || ctx.t("Tàu ngầm đổi vị trí.", "The submarine changed position."));
      if (move.escaped) {
        render();
        finish(0, ctx.t("tàu ngầm đã vượt tuyến phía Bắc", "the submarine crossed the northern line"));
        return;
      }
      turn = 1;
      ctx.sound(lastNoise?.silent ? "select" : "place");
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function spendTool(kind) {
      if (kind === "drone") {
        if (drones <= 0) return false;
        drones -= 1;
      }
      if (kind === "charge") {
        if (charges <= 0) return false;
        charges -= 1;
      }
      return true;
    }

    function doHunt(move, fromRemote) {
      if (phase !== "play" || turn !== 1 || awaiting) return;
      const r = Number(move.r);
      const c = Number(move.c);
      const i = idx(r, c);
      if (!inside(r, c) || !isWater(i)) return;
      if (!spendTool(move.kind)) return;

      if (!fromRemote) {
        awaiting = true;
        marks[key(r, c)] = { kind: move.kind, cls: "pending", icon: "⏳", text: labelForTool(move.kind) };
        ctx.sendMove({ t: "hunt", kind: move.kind, r, c });
        addLog(ctx.t(`${labelForTool(move.kind)} đang quét tọa độ ${r + 1}-${c + 1}...`, `${labelForTool(move.kind)} scanning ${r + 1}-${c + 1}...`));
        ctx.sound("select");
        render();
        updateStatus();
        return;
      }

      const result = evaluateHunt(move.kind, { r, c });
      marks[key(r, c)] = result.mark;
      addLog(result.log);
      ctx.sendMove({ t: "huntResult", kind: move.kind, r, c, result });
      if (result.killed) {
        render();
        finish(1, ctx.t("mìn sâu đã phá hủy tàu ngầm", "a depth charge destroyed the submarine"));
        return;
      }
      turn = 0;
      round += 1;
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function applyHuntResult(move) {
      awaiting = false;
      const result = move.result;
      if (!result) return;
      if (typeof result.hp === "number") subHp = result.hp;
      marks[key(move.r, move.c)] = result.mark || { kind: move.kind, cls: "miss", icon: "❔", text: "?" };
      addLog(result.log || ctx.t("Có kết quả dò âm.", "Sonar result received."));
      if (result.killed) {
        finalSub = result.final || null;
        render();
        finish(1, ctx.t("mìn sâu đã phá hủy tàu ngầm", "a depth charge destroyed the submarine"));
        return;
      }
      turn = 0;
      round += 1;
      ctx.sound(result.sound || "select");
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function evaluateHunt(kind, target) {
      const d = manhattan(target, sub);
      const near = chebyshev(target, sub);
      if (kind === "sonar") {
        if (d === 0) {
          return {
            hp: subHp,
            sound: "capture",
            mark: { kind, cls: "hit", icon: "🎯", text: ctx.t("KHÓA", "LOCK") },
            log: ctx.t("Sonar khóa đúng vị trí tàu ngầm, cần thả mìn sâu để kết liễu.", "Sonar locked on the submarine's exact position — drop a depth charge to finish it."),
          };
        }
        if (d <= 2) {
          return {
            hp: subHp,
            sound: "shot",
            mark: { kind, cls: "hot", icon: "🔴", text: ctx.t("GẦN", "NEAR") },
            log: ctx.t("Sonar bắt tín hiệu rất gần mục tiêu.", "Sonar picks up a very close signal."),
          };
        }
        if (d <= 4) {
          return {
            hp: subHp,
            sound: "select",
            mark: { kind, cls: "mid", icon: "🟡", text: ctx.t("VỪA", "MID") },
            log: ctx.t("Sonar có tín hiệu trung bình, tàu ngầm chưa xa.", "Sonar shows a medium signal — the submarine isn't far."),
          };
        }
        return {
          hp: subHp,
          sound: "miss",
          mark: { kind, cls: "miss", icon: "🔵", text: ctx.t("XA", "FAR") },
          log: ctx.t("Sonar chỉ nghe tiếng nền xa.", "Sonar only hears distant background noise."),
        };
      }

      if (kind === "drone") {
        if (near <= 1) {
          return {
            hp: subHp,
            sound: "capture",
            mark: { kind, cls: "hit", icon: "🛰️", text: ctx.t("THẤY", "SPOT") },
            log: ctx.t("Drone dò âm phát hiện tàu ngầm trong vùng 3x3.", "The sonar drone detected the submarine within a 3x3 area."),
          };
        }
        const bearing = bearingFrom(target, sub);
        return {
          hp: subHp,
          sound: "select",
          mark: { kind, cls: "mid", icon: bearingIcon(bearing), text: bearingLabel(bearing) },
          log: ctx.t(`Drone không thấy mục tiêu, nhưng âm lệch về phía ${bearing}.`, `Drone didn't see the target, but the sound leans toward the ${bearingLabel(bearing)}.`),
        };
      }

      let damage = 0;
      if (d === 0) damage = 2;
      else if (d === 1) damage = 1;
      if (damage > 0 && shield) {
        shield = false;
        return {
          hp: subHp,
          sound: "miss",
          mark: { kind, cls: "miss", icon: "🛡️", text: ctx.t("CHẶN", "BLOCK") },
          log: ctx.t("Tàu ngầm đã lặn sâu, quả mìn không gây sát thương!", "The submarine dived deep — the mine dealt no damage!"),
        };
      }
      subHp = Math.max(0, subHp - damage);
      if (subHp <= 0) {
        return {
          hp: subHp,
          killed: true,
          final: { r: sub.r, c: sub.c },
          sound: "capture",
          mark: { kind, cls: "hit", icon: "💥", text: ctx.t("HẠ", "KILL") },
          log: ctx.t("Mìn sâu nổ trúng và phá hủy tàu ngầm.", "The depth charge struck and destroyed the submarine."),
        };
      }
      if (damage > 0) {
        return {
          hp: subHp,
          sound: "shot",
          mark: { kind, cls: "hot", icon: "💥", text: `-${damage}` },
          log: ctx.t(`Mìn sâu nổ sát thân tàu, tàu ngầm còn ${subHp}/${MAX_HP} HP.`, `The depth charge hit near the hull — submarine at ${subHp}/${MAX_HP} HP.`),
        };
      }
      return {
        hp: subHp,
        sound: "miss",
        mark: { kind, cls: "miss", icon: "🌊", text: ctx.t("TRƯỢT", "MISS") },
        log: ctx.t("Mìn sâu nổ hụt, chỉ khuấy động đáy biển.", "The depth charge missed, only stirring the seabed."),
      };
    }

    function bearingFrom(target, actual) {
      const dr = actual.r - target.r;
      const dc = actual.c - target.c;
      if (Math.abs(dr) >= Math.abs(dc)) return dr < 0 ? "Bắc" : "Nam";
      return dc < 0 ? "Tây" : "Đông";
    }

    function labelForTool(kind) {
      if (kind === "drone") return ctx.t("DRONE", "DRONE");
      if (kind === "charge") return ctx.t("MÌN", "MINE");
      return ctx.t("SONAR", "SONAR");
    }

    function applyMove(move, fromRemote) {
      if (!fromRemote || !move || over()) return;
      if (move.t === "ready") return beginHunterSide();
      if (move.t === "subEvent") return applySubEvent(move);
      if (move.t === "hunt") return doHunt(move, true);
      if (move.t === "huntResult") return applyHuntResult(move);
    }

    function finish(winner, reason) {
      if (phase === "over") return;
      phase = "over";
      awaiting = false;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      if (ctx.mySeat === winner) ctx.setStatus(ctx.t(`🎉 Bạn thắng - ${reason}.`, `🎉 You win — ${reason}.`));
      else ctx.setStatus(ctx.t(`💀 Bạn thua - ${reason}.`, `💀 You lose — ${reason}.`));
      render();
    }

    function render() {
      renderHud();
      renderControls();
      renderBoard();
      renderIntel();
    }

    function renderHud() {
      const subActive = phase === "play" && turn === 0 && !over();
      const hunterActive = phase === "play" && turn === 1 && !over();
      let subSmall;
      if (ctx.mySeat === 0) {
        const dist = sub ? sub.r : null;
        const escTxt = dist === null ? "" : (dist === 0 ? ctx.t("🟢 Đã tới tuyến thoát!", "🟢 Reached the escape line!") : ctx.t(`🧭 Còn ${dist} hàng tới tuyến thoát`, `🧭 ${dist} row(s) to the escape line`));
        const shieldTxt = shield ? ctx.t(" · 🛡️ đang lặn sâu", " · 🛡️ diving deep") : "";
        subSmall = ctx.t(`${escTxt}${shieldTxt} · 🌀 lặn ${dives}/${divesMax}`, `${escTxt}${shieldTxt} · 🌀 dives ${dives}/${divesMax}`);
      } else {
        subSmall = ctx.t("Mục tiêu đang ẩn dưới biển", "The target is hidden underwater");
      }
      hud.innerHTML = `
        <div class="sh-panel ${subActive ? "active" : ""}">
          <span>${ctx.t("🟡 P1 Tàu ngầm", "🟡 P1 Submarine")}</span>
          <b>${subHp}/${MAX_HP} HP</b>
          <small>${subSmall}</small>
        </div>
        <div class="sh-mid">
          <b>${phase === "setup" ? ctx.t("Chuẩn bị", "Setup") : over() ? ctx.t("Kết thúc", "Game over") : ctx.t(`Pha ${round}`, `Phase ${round}`)}</b>
          <span>${phase === "play" ? (turn === 0 ? ctx.t("Tàu ngầm di chuyển", "Submarine moves") : ctx.t("Thợ săn dò tìm", "Hunter searches")) : ctx.t("P1 chọn điểm lặn bí mật", "P1 picks a secret dive point")}</span>
          <small>${lastNoise?.text || log[0] || ""}</small>
        </div>
        <div class="sh-panel ${hunterActive ? "active" : ""}">
          <span>${ctx.t("🎯 P2 Thợ săn", "🎯 P2 Hunter")}</span>
          <b>${ctx.t(`${drones}/${dronesMax} drone · ${charges}/${chargesMax} mìn`, `${drones}/${dronesMax} drones · ${charges}/${chargesMax} mines`)}</b>
          <small>${ctx.mySeat === 1 ? ctx.t("Bạn dùng sonar, drone và mìn sâu", "You use sonar, drones and depth charges") : ctx.t("Đối thủ đang khoanh vùng bạn", "The opponent is narrowing you down")}</small>
        </div>
      `;
    }

    function renderControls() {
      if (!ctx.isOnline) {
        controls.innerHTML = `<div class="sh-help">${ctx.t("Submarine Hunt chỉ chơi online để giữ bí mật vị trí tàu ngầm.", "Submarine Hunt is online-only to keep the submarine's position secret.")}</div>`;
        return;
      }
      if (phase === "setup") {
        if (ctx.mySeat === 0) {
          controls.innerHTML = `
            <div class="sh-help">${ctx.t("Chọn một ô ở 2 hàng dưới để lặn. Vị trí này không gửi cho đối thủ.", "Pick a cell in the bottom 2 rows to dive. This position isn't sent to the opponent.")}</div>
            <button class="btn primary" data-confirm ${pendingStart ? "" : "disabled"}>${ctx.t("Xác nhận điểm lặn", "Confirm dive point")}</button>
          `;
          const btn = controls.querySelector("[data-confirm]");
          btn?.addEventListener("click", confirmStart);
        } else {
          controls.innerHTML = `<div class="sh-help">${ctx.t("Đang chờ P1 chọn vị trí tàu ngầm bí mật...", "Waiting for P1 to choose a secret submarine position...")}</div>`;
        }
        return;
      }

      if (ctx.mySeat === 0) {
        const disabled = turn !== 0 || over();
        controls.innerHTML = `
          <button class="btn small sh-mode ${mode === "move" ? "active" : ""}" data-mode="move" ${disabled ? "disabled" : ""}><b>${ctx.t("Di chuyển", "Move")}</b><small>${ctx.t("đi 1 ô, tạo tiếng ồn vùng", "move 1 cell, makes zone noise")}</small></button>
          <button class="btn small sh-mode ${mode === "silent" ? "active" : ""}" data-mode="silent" ${disabled ? "disabled" : ""}><b>${ctx.t("Chạy im", "Silent run")}</b><small>${ctx.t("đi 1 ô, không phát vùng", "move 1 cell, no zone signal")}</small></button>
          <button class="btn small sh-mode ${mode === "decoy" ? "active" : ""}" data-mode="decoy" ${disabled ? "disabled" : ""}><b>${ctx.t("Mồi âm", "Decoy")}</b><small>${ctx.t("đứng yên, tạo tín hiệu giả", "stay put, emit a fake signal")}</small></button>
          <button class="btn small sh-mode sh-dive" data-dive="1" ${disabled || dives <= 0 ? "disabled" : ""}><b>${ctx.t("🌀 Lặn sâu", "🌀 Deep dive")}</b><small>${ctx.t(`chặn 1 quả mìn · còn ${dives}`, `block 1 mine · ${dives} left`)}</small></button>
        `;
        const diveBtn = controls.querySelector("[data-dive]");
        diveBtn?.addEventListener("click", doDive);
      } else {
        const disabled = turn !== 1 || awaiting || over();
        controls.innerHTML = `
          <button class="btn small sh-mode ${mode === "sonar" ? "active" : ""}" data-mode="sonar" ${disabled ? "disabled" : ""}><b>${ctx.t("Sonar", "Sonar")}</b><small>${ctx.t("ping khoảng cách", "ping distance")}</small></button>
          <button class="btn small sh-mode ${mode === "drone" ? "active" : ""}" data-mode="drone" ${disabled || drones <= 0 ? "disabled" : ""}><b>${ctx.t("Drone", "Drone")}</b><small>${ctx.t(`dò vùng 3x3 · còn ${drones}`, `scan 3x3 · ${drones} left`)}</small></button>
          <button class="btn small sh-mode ${mode === "charge" ? "active" : ""}" data-mode="charge" ${disabled || charges <= 0 ? "disabled" : ""}><b>${ctx.t("Mìn sâu", "Depth charge")}</b><small>${ctx.t(`gây sát thương · còn ${charges}`, `deals damage · ${charges} left`)}</small></button>
        `;
      }
      controls.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          mode = btn.dataset.mode;
          render();
          updateStatus();
        });
      });
    }

    function renderBoard() {
      const targets = new Set();
      if (phase === "setup" && ctx.mySeat === 0) {
        for (let i = 0; i < N * N; i++) if (validStart(i)) targets.add(i);
      } else if (phase === "play" && canAct()) {
        if (ctx.mySeat === 0) {
          (mode === "decoy" ? decoyTargets() : subTargets()).forEach((i) => targets.add(i));
        } else {
          for (let i = 0; i < N * N; i++) if (isWater(i)) targets.add(i);
        }
      }

      for (let i = 0; i < N * N; i++) {
        const [r, c] = rc(i);
        const cell = cells[i];
        cell.className = "sh-cell";
        cell.innerHTML = "";
        cell.disabled = over() || !ctx.isOnline || !isWater(i);
        if (r === 0 && !REEFS.has(i)) cell.classList.add("sh-exit");
        if (REEFS.has(i)) {
          cell.classList.add("sh-reef");
          cell.innerHTML = `<span class="sh-reef-ic">🪨</span>`;
          continue;
        }

        if (lastNoise && !lastNoise.silent && ctx.mySeat === 1 && phase !== "setup") {
          const zr = r <= 2 ? 0 : r <= 5 ? 1 : 2;
          const zc = c <= 2 ? 0 : c <= 5 ? 1 : 2;
          if (zr === lastNoise.zoneR && zc === lastNoise.zoneC) cell.classList.add(lastNoise.decoy ? "sh-decoy-zone" : "sh-noise-zone");
        }

        const mark = marks[key(r, c)];
        if (mark) cell.classList.add("sh-mark", `sh-${mark.cls || "mid"}`);

        const isPendingStart = phase === "setup" && pendingStart && pendingStart.r === r && pendingStart.c === c;
        const isLiveSub = phase !== "setup" && ctx.mySeat === 0 && sub && sub.r === r && sub.c === c;
        const isFinalSub = finalSub && finalSub.r === r && finalSub.c === c;

        if (isFinalSub) {
          cell.classList.add("sh-sub", "sh-final");
          cell.innerHTML = subSVG("final");
        } else if (isPendingStart || isLiveSub) {
          cell.classList.add("sh-sub");
          if (isPendingStart) cell.classList.add("sh-selected");
          cell.innerHTML = subSVG();
        } else if (mark) {
          cell.innerHTML = `<span class="sh-mark-ic">${mark.icon || ""}</span><span class="sh-mark-txt">${mark.text || labelForTool(mark.kind)}</span>`;
        }

        if (targets.has(i)) cell.classList.add("sh-target");
      }
    }

    function renderIntel() {
      intel.innerHTML = `
        <div class="sh-log"><b>${ctx.t("Nhật ký sonar", "Sonar log")}</b>${log.map((x) => `<span>${x}</span>`).join("")}</div>
        <div class="sh-legend">
          <span><b>${ctx.t("SONAR", "SONAR")}</b><small>${ctx.t("GẦN/VỪA/XA theo khoảng cách.", "NEAR/MID/FAR by distance.")}</small></span>
          <span><b>${ctx.t("DRONE", "DRONE")}</b><small>${ctx.t("Quét vùng 3x3 hoặc trả hướng âm.", "Scan a 3x3 area or return a bearing.")}</small></span>
          <span><b>${ctx.t("MÌN", "MINE")}</b><small>${ctx.t("Trúng gây 2 sát thương, sát cạnh gây 1.", "Direct hit deals 2 damage, adjacent deals 1.")}</small></span>
          <span><b>${ctx.t("SUB xanh", "Blue SUB")}</b><small>${ctx.t("Tàu ngầm thoát nếu lên hàng trên cùng.", "The submarine escapes if it reaches the top row.")}</small></span>
        </div>
      `;
    }

    function updateStatus() {
      if (!ctx.isOnline) {
        ctx.setStatus(ctx.t("Submarine Hunt chỉ chơi online để giữ bí mật vị trí tàu ngầm.", "Submarine Hunt is online-only to keep the submarine's position secret."));
        return;
      }
      if (phase === "setup") {
        ctx.setStatus(ctx.mySeat === 0 ? ctx.t("Chọn điểm lặn ở 2 hàng dưới rồi xác nhận.", "Pick a dive point in the bottom 2 rows and confirm.") : ctx.t("Đang chờ tàu ngầm chọn điểm lặn.", "Waiting for the submarine to choose a dive point."));
        return;
      }
      if (over()) return;
      if (awaiting) {
        ctx.setStatus(ctx.t("Đang chờ tàu ngầm trả kết quả dò tìm...", "Waiting for the submarine to return scan results..."));
        return;
      }
      if (turn !== ctx.mySeat) {
        ctx.setStatus(turn === 0 ? ctx.t("Tàu ngầm đang đổi vị trí.", "The submarine is repositioning.") : ctx.t("Thợ săn đang dò tìm.", "The hunter is searching."));
        return;
      }
      if (ctx.mySeat === 0) {
        ctx.setStatus(mode === "decoy" ? ctx.t("Chọn ô quanh tàu để phát tín hiệu giả.", "Pick a cell around the sub to emit a decoy signal.") : ctx.t("Chọn ô kề để di chuyển. Hàng trên cùng là tuyến thoát.", "Pick an adjacent cell to move. The top row is the escape line."));
      } else {
        ctx.setStatus(ctx.t("Chọn một ô biển để dùng " + labelForTool(mode).toLowerCase() + ".", "Pick a sea cell to use " + labelForTool(mode).toLowerCase() + "."));
      }
    }

    if (!ctx.isOnline) {
      render();
      updateStatus();
      return { applyMove: () => {} };
    }

    ctx.setNames(ctx.t(`P1 Tàu ngầm${ctx.mySeat === 0 ? " (bạn)" : ""}`, `P1 Submarine${ctx.mySeat === 0 ? " (you)" : ""}`), ctx.t(`P2 Thợ săn${ctx.mySeat === 1 ? " (bạn)" : ""}`, `P2 Hunter${ctx.mySeat === 1 ? " (you)" : ""}`));
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "submarinehunt",
    name: "Submarine Hunt",
    emoji: "🛟",
    description: "Một bên lái tàu ngầm ẩn, bên kia săn bằng sonar, drone dò âm và mìn sâu.",
    onlineReady: true,
    localReady: false,
    options: [
      {
        id: "drones",
        label: "Drone dò âm",
        default: 3,
        choices: [
          { value: 2, label: "2 drone" },
          { value: 3, label: "3 drone" },
          { value: 4, label: "4 drone" },
        ],
      },
      {
        id: "charges",
        label: "Mìn sâu",
        default: 6,
        choices: [
          { value: 5, label: "5 mìn" },
          { value: 6, label: "6 mìn" },
          { value: 7, label: "7 mìn" },
        ],
      },
      {
        id: "dives",
        label: "Lặn sâu (chặn mìn)",
        default: 2,
        choices: [
          { value: 0, label: "Tắt" },
          { value: 2, label: "2 lần" },
          { value: 3, label: "3 lần" },
        ],
      },
    ],
    howTo: [
      "Game chỉ chơi online. Người chơi 1 là tàu ngầm, Người chơi 2 là thợ săn.",
      "P1 chọn điểm lặn bí mật ở 2 hàng dưới. Vị trí thật không gửi cho P2.",
      "Tàu ngầm mỗi lượt đi 1 ô, chạy im lặng hoặc tạo tín hiệu giả. Nếu lên hàng trên cùng thì tàu ngầm thắng.",
      "🌀 Lặn sâu: tàu ngầm bỏ lượt di chuyển để chặn hoàn toàn sát thương của quả mìn kế tiếp (số lần giới hạn).",
      "P2 dùng sonar để biết gần/vừa/xa, drone để quét vùng 3x3 hoặc lấy hướng âm, và mìn sâu để gây sát thương.",
      "Mìn sâu trúng chính xác gây 2 sát thương, nổ sát cạnh gây 1. Tàu ngầm có 3 HP.",
      "Đá ngầm 🪨 chặn đường di chuyển và không thể chọn làm mục tiêu.",
      "Đọc vùng tiếng ồn, kết quả sonar và hướng drone để khoanh vùng trước khi thả mìn.",
    ],
    create,
  });
})();
