/* Dungeon Rival - hai dungeon rieng, nhat do, len cap, mua sam va pha doi thu. */
(function () {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const ALL_DIRS = [[0, 0], ...DIRS, [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const MAX_LOG = 6;

  // Pha hoai - tieu hao Bong toi (shadow)
  const SABOTAGE = {
    imp: { cost: 3, label: "Thả quái", icon: "👹", hint: "đặt quái cạnh địch" },
    trap: { cost: 2, label: "Gài bẫy", icon: "🪤", hint: "đặt bẫy quanh địch" },
    curse: { cost: 4, label: "Lời nguyền", icon: "💀", hint: "trừ thẳng máu địch" },
    fog: { cost: 2, label: "Sương mù", icon: "🌫️", hint: "che tầm nhìn địch" },
  };

  // Cua hang - tieu hao Vang (gold)
  const SHOP = {
    sharpen: { cost: 16, label: "Mài vũ khí", icon: "🗡️", hint: "+2 công" },
    plate: { cost: 18, label: "Rèn giáp", icon: "🛡️", hint: "+1 thủ" },
    brew: { cost: 12, label: "Mua bình máu", icon: "🧪", hint: "+1 bình" },
    ritual: { cost: 14, label: "Hiến tế", icon: "🌑", hint: "+3 bóng tối" },
  };

  const LOOT = {
    blade: { label: "Kiếm cổ", icon: "🗡️", text: "+2 công" },
    armor: { label: "Giáp da", icon: "🛡️", text: "+1 thủ" },
    potion: { label: "Bình máu", icon: "🧪", text: "+1 bình máu" },
    shadow: { label: "Ấn bóng tối", icon: "🌑", text: "+3 bóng tối" },
    gold: { label: "Túi vàng", icon: "💰", text: "+vàng" },
    heal: { label: "Suối hồi phục", icon: "❤️", text: "hồi máu" },
  };

  const TILE_ICON = {
    monster: "👹",
    elite: "👺",
    boss: "🐲",
    treasure: "🧰",
    trap: "🪤",
    shrine: "⛩️",
    portal: "🌀",
    start: "🚪",
  };

  const LEGEND = [
    ["👹", "Quái"],
    ["👺", "Tinh nhuệ"],
    ["🐲", "Chúa hầm"],
    ["🧰", "Kho báu"],
    ["🪤", "Bẫy"],
    ["⛩️", "Đền thờ"],
    ["🌀", "Cổng dịch chuyển"],
    ["🚪", "Lối vào"],
  ];

  function create(ctx) {
    const o = ctx.options || {};
    const N = o.size || 7;
    const BOSS_LEVEL = o.boss || 5;
    const DANGER = o.danger === "hard" ? 1.18 : o.danger === "easy" ? 0.88 : 1;

    // bản dịch nhãn/gợi ý hằng module-level
    const SAB_LABEL_EN = { imp: "Summon", trap: "Set trap", curse: "Curse", fog: "Fog" };
    const SAB_HINT_EN = { imp: "place a monster near foe", trap: "place a trap around foe", curse: "drain enemy HP directly", fog: "blind the enemy's view" };
    const SHOP_LABEL_EN = { sharpen: "Sharpen weapon", plate: "Forge armor", brew: "Buy potion", ritual: "Sacrifice" };
    const SHOP_HINT_EN = { sharpen: "+2 atk", plate: "+1 def", brew: "+1 potion", ritual: "+3 shadow" };
    const LOOT_LABEL_EN = { blade: "Ancient sword", armor: "Leather armor", potion: "Health potion", shadow: "Shadow sigil", gold: "Gold pouch", heal: "Healing spring" };
    const LOOT_TEXT_EN = { blade: "+2 atk", armor: "+1 def", potion: "+1 potion", shadow: "+3 shadow", gold: "+gold", heal: "heal HP" };
    const LEGEND_EN = { "Quái": "Monster", "Tinh nhuệ": "Elite", "Chúa hầm": "Dungeon Lord", "Kho báu": "Treasure", "Bẫy": "Trap", "Đền thờ": "Shrine", "Cổng dịch chuyển": "Portal", "Lối vào": "Entrance" };
    const sabLabel = (k) => ctx.t(SABOTAGE[k].label, SAB_LABEL_EN[k] || SABOTAGE[k].label);
    const sabHint = (k) => ctx.t(SABOTAGE[k].hint, SAB_HINT_EN[k] || SABOTAGE[k].hint);
    const shopLabel = (k) => ctx.t(SHOP[k].label, SHOP_LABEL_EN[k] || SHOP[k].label);
    const shopHint = (k) => ctx.t(SHOP[k].hint, SHOP_HINT_EN[k] || SHOP[k].hint);
    const lootLabel = (k) => ctx.t(LOOT[k].label, LOOT_LABEL_EN[k] || LOOT[k].label);
    const lootText = (k) => ctx.t(LOOT[k].text, LOOT_TEXT_EN[k] || LOOT[k].text);

    const heroes = [makeHero(0), makeHero(1)];
    const dungeons = [];
    const portals = [];
    const bossPos = [];
    [0, 1].forEach((side) => {
      const built = makeDungeon(side);
      dungeons[side] = built.map;
      portals[side] = built.portals;
      bossPos[side] = built.boss;
      heroes[side].r = built.start.r;
      heroes[side].c = built.start.c;
    });
    [0, 1].forEach((side) => reveal(side));

    let turn = 0;
    let over = false;
    const log = [ctx.t("Hai kẻ thám hiểm bước vào hai hầm ngục song song.", "Two adventurers enter two parallel dungeons.")];

    const root = document.createElement("div");
    root.className = "dr-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "dr-hud";
    root.appendChild(hud);

    const actions = document.createElement("div");
    actions.className = "dr-actions";
    root.appendChild(actions);

    const boards = document.createElement("div");
    boards.className = "dr-boards";
    root.appendChild(boards);

    const legend = document.createElement("div");
    legend.className = "dr-legend";
    legend.innerHTML = LEGEND.map(([ic, name]) => `<span><b>${ic}</b>${ctx.t(name, LEGEND_EN[name] || name)}</span>`).join("");
    root.appendChild(legend);

    const cells = [[], []];
    for (let side = 0; side < 2; side++) {
      const wrap = document.createElement("div");
      wrap.className = "dr-board-wrap";
      wrap.innerHTML = `<div class="dr-board-title"></div>`;
      const board = document.createElement("div");
      board.className = "dr-board";
      board.style.setProperty("--dr-n", N);
      wrap.appendChild(board);
      boards.appendChild(wrap);
      cells[side] = Array.from({ length: N }, () => Array(N));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dr-cell";
          btn.addEventListener("click", () => onCell(side, r, c));
          board.appendChild(btn);
          cells[side][r][c] = btn;
        }
      }
    }

    function makeHero(idx) {
      return {
        idx,
        r: 0,
        c: 0,
        hp: 54,
        maxHp: 54,
        atk: 9,
        def: 2,
        lvl: 1,
        xp: 0,
        shadow: 2,
        pots: 1,
        gold: 0,
      };
    }

    function makeDungeon(owner) {
      const start = owner === 0 ? { r: N - 1, c: 0 } : { r: N - 1, c: N - 1 };
      const boss = owner === 0 ? { r: 0, c: N - 1 } : { r: 0, c: 0 };
      const map = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => {
        const depth = Math.abs(start.r - r) + Math.abs(start.c - c);
        return { kind: "empty", seen: false, depth, lvl: Math.max(1, Math.ceil(depth / 3)) };
      }));

      const emptySpots = [];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if ((r === start.r && c === start.c) || (r === boss.r && c === boss.c)) continue;
          const cell = map[r][c];
          const roll = ctx.rng();
          if (roll < 0.32 * DANGER) cell.kind = "monster";
          else if (roll < 0.41 * DANGER) cell.kind = "elite";
          else if (roll < 0.55) cell.kind = "treasure";
          else if (roll < 0.67) cell.kind = "trap";
          else if (roll < 0.77) cell.kind = "shrine";
          else { cell.kind = "empty"; emptySpots.push({ r, c }); }

          if (cell.kind === "treasure") cell.loot = pickLoot();
          if (cell.kind === "monster" || cell.kind === "elite") fillMonster(cell, cell.kind);
          if (cell.kind === "trap") cell.power = 8 + cell.lvl * 3;
        }
      }
      map[start.r][start.c] = { kind: "start", seen: true, depth: 0, lvl: 1 };
      map[boss.r][boss.c] = { kind: "boss", seen: false, depth: N * 2, lvl: BOSS_LEVEL };
      fillMonster(map[boss.r][boss.c], "boss");

      // Dat 2 cong dich chuyen tren o trong (cach nhau du xa cho thu vi)
      const pls = [];
      for (let i = 0; i < 2 && emptySpots.length; i++) {
        const k = Math.floor(ctx.rng() * emptySpots.length);
        const spot = emptySpots.splice(k, 1)[0];
        map[spot.r][spot.c].kind = "portal";
        pls.push(spot);
      }
      if (pls.length < 2) pls.length = 0; // can du cap moi co tac dung

      return { map, portals: pls, boss, start };
    }

    function pickLoot() {
      const roll = ctx.rng();
      if (roll < 0.22) return "blade";
      if (roll < 0.4) return "armor";
      if (roll < 0.58) return "potion";
      if (roll < 0.74) return "gold";
      if (roll < 0.88) return "shadow";
      return "heal";
    }

    function fillMonster(cell, kind) {
      const lvl = cell.lvl || 1;
      const elite = kind === "elite";
      const boss = kind === "boss";
      cell.name = boss ? ctx.t("Chúa hầm", "Dungeon Lord") : elite ? ctx.t("Quái tinh nhuệ", "Elite monster") : monsterName(lvl);
      cell.mhp = Math.round((boss ? 58 : elite ? 30 : 18) + lvl * (boss ? 13 : elite ? 8 : 5));
      cell.matk = Math.round((boss ? 10 : elite ? 7 : 5) + lvl * (boss ? 2.2 : elite ? 1.5 : 1.1));
      cell.xp = Math.round((boss ? 18 : elite ? 10 : 6) + lvl * (boss ? 5 : elite ? 3 : 2));
      cell.shadow = boss ? 0 : elite ? 3 : 2;
      cell.gold = Math.round((boss ? 30 : elite ? 12 : 5) + lvl * (boss ? 6 : elite ? 2 : 1.2));
    }

    function monsterName(lvl) {
      if (lvl <= 2) return ctx.t("Nhện hang", "Cave spider");
      if (lvl <= 4) return ctx.t("Xương lang thang", "Wandering skeleton");
      return ctx.t("Hộ vệ địa lao", "Dungeon guardian");
    }

    function onCell(side, r, c) {
      if (!canAct() || side !== turn) return;
      if (!legalStep(side, r, c)) return;
      applyMove({ t: "move", r, c }, false);
    }

    function canAct(fromRemote) {
      return !over && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function applyMove(move, fromRemote) {
      if (!canAct(fromRemote)) return;
      let ok = false;
      let endsTurn = true;
      if (move.t === "move") ok = doMove(move.r, move.c);
      else if (move.t === "potion") ok = doPotion();
      else if (move.t === "sabotage") ok = doSabotage(move.kind);
      else if (move.t === "shop") { ok = doShop(move.item); endsTurn = false; }
      if (!ok) return;
      if (!fromRemote) ctx.sendMove(move);
      if (!over && endsTurn) endTurn();
      render();
      updateStatus();
    }

    function doMove(r, c) {
      if (!legalStep(turn, r, c)) return false;
      const hero = heroes[turn];
      hero.r = r;
      hero.c = c;
      const cell = dungeons[turn][r][c];
      cell.seen = true;
      resolveCell(turn, cell);
      reveal(turn);
      return true;
    }

    function doPotion() {
      const hero = heroes[turn];
      if (hero.pots <= 0 || hero.hp >= hero.maxHp) return false;
      hero.pots -= 1;
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + 26 + hero.lvl * 3);
      addLog(ctx.t(`P${turn + 1} uống bình máu: ${before} → ${hero.hp} HP.`, `P${turn + 1} drinks a potion: ${before} → ${hero.hp} HP.`));
      ctx.sound("select");
      return true;
    }

    function doShop(item) {
      const cfg = SHOP[item];
      if (!cfg) return false;
      const hero = heroes[turn];
      if (hero.gold < cfg.cost) return false;
      hero.gold -= cfg.cost;
      if (item === "sharpen") hero.atk += 2;
      else if (item === "plate") hero.def += 1;
      else if (item === "brew") hero.pots += 1;
      else if (item === "ritual") hero.shadow += 3;
      addLog(ctx.t(`P${turn + 1} ${cfg.label.toLowerCase()} (${cfg.hint}), tốn ${cfg.cost} vàng.`, `P${turn + 1} ${shopLabel(item).toLowerCase()} (${shopHint(item)}), spent ${cfg.cost} gold.`));
      ctx.sound("select");
      return true;
    }

    function doSabotage(kind) {
      const cfg = SABOTAGE[kind];
      if (!cfg) return false;
      const hero = heroes[turn];
      if (hero.shadow < cfg.cost) return false;
      hero.shadow -= cfg.cost;
      const target = 1 - turn;

      if (kind === "curse") {
        const dmg = 9 + hero.lvl * 3;
        heroes[target].hp = Math.max(0, heroes[target].hp - dmg);
        addLog(ctx.t(`P${turn + 1} gieo lời nguyền, P${target + 1} mất ${dmg} HP.`, `P${turn + 1} casts a curse; P${target + 1} loses ${dmg} HP.`));
        ctx.sound("shot");
        if (heroes[target].hp <= 0) finish(turn, ctx.t("hạ đối thủ bằng lời nguyền", "defeated the foe with a curse"));
        return true;
      }

      if (kind === "fog") {
        const tgt = heroes[target];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const dist = Math.abs(tgt.r - r) + Math.abs(tgt.c - c);
            if (dist > 1) dungeons[target][r][c].seen = false;
          }
        }
        reveal(target);
        addLog(ctx.t(`P${turn + 1} thả sương mù, P${target + 1} mất tầm nhìn bản đồ.`, `P${turn + 1} drops fog; P${target + 1} loses map vision.`));
        ctx.sound("miss");
        return true;
      }

      const spot = sabotageSpot(target);
      if (!spot) {
        addLog(ctx.t("Không còn chỗ trống để phá dungeon đối thủ.", "No empty spot left to sabotage the enemy dungeon."));
        return true;
      }
      const cell = dungeons[target][spot.r][spot.c];
      if (kind === "imp") {
        cell.kind = "monster";
        cell.lvl = Math.max(cell.lvl || 1, heroes[turn].lvl + 1);
        fillMonster(cell, "monster");
        cell.name = ctx.t("Quái gửi sang", "Sent monster");
      } else {
        cell.kind = "trap";
        cell.power = 12 + heroes[turn].lvl * 4;
      }
      cell.seen = true;
      addLog(ctx.t(`P${turn + 1} ${kind === "imp" ? "thả quái" : "gài bẫy"} vào dungeon P${target + 1}.`, `P${turn + 1} ${kind === "imp" ? "sent a monster" : "set a trap"} into P${target + 1}'s dungeon.`));
      ctx.sound("capture");
      return true;
    }

    function sabotageSpot(target) {
      const h = heroes[target];
      const preferred = ALL_DIRS
        .map(([dr, dc]) => ({ r: h.r + dr, c: h.c + dc }))
        .filter((p) => inside(p.r, p.c) && !(p.r === h.r && p.c === h.c));
      const all = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) all.push({ r, c });
      return [...preferred, ...all].find((p) => {
        const cell = dungeons[target][p.r][p.c];
        return passableKind(cell.kind) && !isHeroAt(target, p.r, p.c);
      });
    }

    function resolveCell(side, cell) {
      const hero = heroes[side];
      if (cell.kind === "monster" || cell.kind === "elite" || cell.kind === "boss") {
        fight(side, cell);
      } else if (cell.kind === "trap") {
        const dmg = Math.max(1, cell.power - hero.def);
        hero.hp = Math.max(0, hero.hp - dmg);
        hero.shadow += 1;
        addLog(ctx.t(`P${side + 1} dính bẫy, mất ${dmg} HP và thu 1 bóng tối.`, `P${side + 1} hit a trap, lost ${dmg} HP and gained 1 shadow.`));
        cell.kind = "empty";
        ctx.sound("miss");
        if (hero.hp <= 0) finish(1 - side, ctx.t("đối thủ gục vì bẫy", "the foe fell to a trap"));
      } else if (cell.kind === "treasure") {
        applyLoot(side, cell.loot);
        cell.kind = "empty";
        ctx.sound("capture");
      } else if (cell.kind === "shrine") {
        const before = hero.hp;
        hero.maxHp += 4;
        hero.hp = Math.min(hero.maxHp, hero.hp + 22);
        hero.shadow += 1;
        addLog(ctx.t(`P${side + 1} cầu nguyện ở đền: HP ${before} → ${hero.hp}, máu tối đa +4.`, `P${side + 1} prays at the shrine: HP ${before} → ${hero.hp}, max HP +4.`));
        cell.kind = "empty";
        ctx.sound("select");
      } else if (cell.kind === "portal") {
        const pair = portals[side].find((p) => !(p.r === hero.r && p.c === hero.c));
        if (pair) {
          hero.r = pair.r;
          hero.c = pair.c;
          dungeons[side][pair.r][pair.c].seen = true;
          addLog(ctx.t(`P${side + 1} bước vào cổng dịch chuyển và xuất hiện ở nơi khác.`, `P${side + 1} steps into a portal and reappears elsewhere.`));
          ctx.sound("place");
        }
      } else {
        addLog(ctx.t(`P${side + 1} tiến sâu hơn trong hầm ngục.`, `P${side + 1} pushes deeper into the dungeon.`));
        ctx.sound("place");
      }
    }

    function fight(side, cell) {
      const hero = heroes[side];
      const rounds = Math.max(1, Math.ceil(cell.mhp / hero.atk));
      const dmg = Math.max(1, cell.matk - hero.def) * rounds;
      hero.hp = Math.max(0, hero.hp - dmg);
      const boss = cell.kind === "boss";
      addLog(ctx.t(`P${side + 1} hạ ${cell.name}: nhận ${dmg} sát thương, +${cell.xp} XP, +${cell.gold} vàng.`, `P${side + 1} defeats ${cell.name}: took ${dmg} damage, +${cell.xp} XP, +${cell.gold} gold.`));
      if (hero.hp <= 0) {
        ctx.sound("miss");
        finish(1 - side, ctx.t(`P${side + 1} gục trước ${cell.name}`, `P${side + 1} fell to ${cell.name}`));
        return;
      }
      hero.xp += cell.xp;
      hero.shadow += cell.shadow || 0;
      hero.gold += cell.gold || 0;
      if (!boss && ctx.rng() < 0.22) {
        const loot = pickLoot();
        applyLoot(side, loot, true);
      }
      cell.kind = "empty";
      ctx.sound(boss ? "win" : "capture");
      levelUp(side);
      if (boss) finish(side, ctx.t("đánh bại Chúa hầm", "defeated the Dungeon Lord"));
    }

    function applyLoot(side, loot, quiet) {
      const hero = heroes[side];
      const def = LOOT[loot] || LOOT.potion;
      if (loot === "blade") hero.atk += 2;
      else if (loot === "armor") hero.def += 1;
      else if (loot === "potion") hero.pots += 1;
      else if (loot === "shadow") hero.shadow += 3;
      else if (loot === "gold") hero.gold += 12 + hero.lvl * 2;
      else if (loot === "heal") hero.hp = Math.min(hero.maxHp, hero.hp + 28);
      const lk = LOOT[loot] ? loot : "potion";
      if (!quiet) addLog(ctx.t(`P${side + 1} nhặt ${def.label}: ${def.text}.`, `P${side + 1} picks up ${lootLabel(lk)}: ${lootText(lk)}.`));
      else addLog(ctx.t(`P${side + 1} tìm thêm ${def.label} sau trận.`, `P${side + 1} finds an extra ${lootLabel(lk)} after the fight.`));
    }

    function levelUp(side) {
      const hero = heroes[side];
      let need = hero.lvl * 10;
      while (hero.xp >= need) {
        hero.xp -= need;
        hero.lvl += 1;
        hero.maxHp += 9;
        hero.hp = Math.min(hero.maxHp, hero.hp + 16);
        hero.atk += 2;
        if (hero.lvl % 2 === 0) hero.def += 1;
        hero.shadow += 1;
        addLog(ctx.t(`P${side + 1} lên cấp ${hero.lvl}: công, máu và bóng tối tăng.`, `P${side + 1} levels up to ${hero.lvl}: attack, HP and shadow increased.`));
        need = hero.lvl * 10;
      }
    }

    function endTurn() {
      turn = 1 - turn;
      heroes[turn].shadow += 1;
      reveal(turn);
      ctx.setTurn(turn);
    }

    function reveal(side) {
      const hero = heroes[side];
      ALL_DIRS.forEach(([dr, dc]) => {
        const r = hero.r + dr, c = hero.c + dc;
        if (inside(r, c)) dungeons[side][r][c].seen = true;
      });
    }

    function legalStep(side, r, c) {
      if (!inside(r, c)) return false;
      const hero = heroes[side];
      return Math.abs(hero.r - r) + Math.abs(hero.c - c) === 1;
    }

    function passableKind(kind) {
      return kind === "empty" || kind === "treasure" || kind === "trap" || kind === "shrine";
    }

    function inside(r, c) {
      return r >= 0 && r < N && c >= 0 && c < N;
    }

    function isHeroAt(side, r, c) {
      return heroes[side].r === r && heroes[side].c === c;
    }

    function bossDist(side) {
      const b = bossPos[side];
      const h = heroes[side];
      return Math.abs(b.r - h.r) + Math.abs(b.c - h.c);
    }

    function addLog(text) {
      log.unshift(text);
      if (log.length > MAX_LOG) log.pop();
    }

    function finish(winner, reason) {
      if (over) return;
      over = true;
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng - ${reason}!`, `🎉 Player ${winner + 1} wins — ${reason}!`));
    }

    function render() {
      const raceP1 = bossDist(0);
      const raceP2 = bossDist(1);
      hud.innerHTML = `${heroPanel(0)}
        <div class="dr-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : ctx.t(`Lượt Người chơi ${turn + 1}`, `Player ${turn + 1}'s turn`)}</b>
          <span>${ctx.t(`Chạy đua tới 🐲 Chúa hầm (cấp ${BOSS_LEVEL})`, `Race to the 🐲 Dungeon Lord (lvl ${BOSS_LEVEL})`)}</span>
          <div class="dr-race">
            <em class="p1">${ctx.t(`P1 còn ${raceP1} ô`, `P1: ${raceP1} cells`)}</em>
            <em class="p2">${ctx.t(`P2 còn ${raceP2} ô`, `P2: ${raceP2} cells`)}</em>
          </div>
          <small>${log[0] || ""}</small>
        </div>${heroPanel(1)}`;
      renderActions();
      for (let side = 0; side < 2; side++) renderDungeon(side);
    }

    function heroPanel(side) {
      const h = heroes[side];
      const hpPct = Math.max(0, h.hp / h.maxHp * 100);
      const xpPct = Math.max(0, h.xp / (h.lvl * 10) * 100);
      return `
        <div class="dr-hero-panel p${side + 1} ${turn === side && !over ? "active" : ""}">
          <span>${side === 0 ? "🔴" : "🔵"} ${ctx.t(`Người chơi ${side + 1}`, `Player ${side + 1}`)}</span>
          <b>${ctx.t(`Lv ${h.lvl}`, `Lv ${h.lvl}`)}</b>
          <em>❤️ ${h.hp}/${h.maxHp} · ⚔️ ${h.atk} · 🛡️ ${h.def}</em>
          <i class="dr-bar hp"><i style="width:${hpPct}%"></i></i>
          <i class="dr-bar xp"><i style="width:${xpPct}%"></i></i>
          <small>${ctx.t(`🧪 ${h.pots} bình · 🌑 ${h.shadow} bóng tối · 💰 ${h.gold} vàng`, `🧪 ${h.pots} potions · 🌑 ${h.shadow} shadow · 💰 ${h.gold} gold`)}</small>
        </div>
      `;
    }

    function renderActions() {
      const h = heroes[turn];
      const shopBtns = Object.entries(SHOP).map(([id, s]) => `
        <button class="btn small dr-action shop" data-shop="${id}">
          <span>${s.icon}</span><b>${shopLabel(id)}</b><small>💰 ${s.cost} · ${shopHint(id)}</small>
        </button>`).join("");
      const sabBtns = Object.entries(SABOTAGE).map(([id, s]) => `
        <button class="btn small dr-action sab" data-act="${id}">
          <span>${s.icon}</span><b>${sabLabel(id)}</b><small>🌑 ${s.cost} · ${sabHint(id)}</small>
        </button>`).join("");

      actions.innerHTML = `
        <div class="dr-act-group">
          <div class="dr-act-head">${ctx.t("🧪 Hồi phục", "🧪 Recover")}</div>
          <div class="dr-act-row">
            <button class="btn small dr-action heal" data-act="potion"><span>🧪</span><b>${ctx.t("Bình máu", "Potion")}</b><small>${ctx.t(`${h.pots} còn lại`, `${h.pots} left`)}</small></button>
          </div>
        </div>
        <div class="dr-act-group">
          <div class="dr-act-head">${ctx.t("🏪 Cửa hàng", "🏪 Shop")} <i>${ctx.t("(dùng vàng, không mất lượt)", "(gold, no turn cost)")}</i></div>
          <div class="dr-act-row">${shopBtns}</div>
        </div>
        <div class="dr-act-group">
          <div class="dr-act-head">${ctx.t("🌑 Phá hoại", "🌑 Sabotage")} <i>${ctx.t("(dùng bóng tối, kết thúc lượt)", "(shadow, ends turn)")}</i></div>
          <div class="dr-act-row">${sabBtns}</div>
        </div>
      `;

      const potBtn = actions.querySelector('[data-act="potion"]');
      potBtn.disabled = !canAct() || h.pots <= 0 || h.hp >= h.maxHp;
      potBtn.addEventListener("click", () => applyMove({ t: "potion" }, false));

      Object.keys(SABOTAGE).forEach((id) => {
        const btn = actions.querySelector(`[data-act="${id}"]`);
        btn.disabled = !canAct() || h.shadow < SABOTAGE[id].cost;
        btn.addEventListener("click", () => applyMove({ t: "sabotage", kind: id }, false));
      });

      Object.keys(SHOP).forEach((id) => {
        const btn = actions.querySelector(`[data-shop="${id}"]`);
        btn.disabled = !canAct() || h.gold < SHOP[id].cost;
        btn.addEventListener("click", () => applyMove({ t: "shop", item: id }, false));
      });
    }

    function renderDungeon(side) {
      const wrap = boards.children[side];
      wrap.classList.toggle("active", side === turn && !over);
      wrap.querySelector(".dr-board-title").textContent = ctx.t(`${side === 0 ? "🔴" : "🔵"} Dungeon Người chơi ${side + 1}`, `${side === 0 ? "🔴" : "🔵"} Player ${side + 1}'s Dungeon`);
      const h = heroes[side];
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cell = dungeons[side][r][c];
          const el = cells[side][r][c];
          const isHero = h.r === r && h.c === c;
          const legal = side === turn && legalStep(side, r, c) && !over;
          el.className = "dr-cell";
          el.disabled = !canAct() || side !== turn || !legal;
          if (!cell.seen && !isHero) {
            el.classList.add("fog");
            el.innerHTML = `<span class="dr-icon fog">❓</span>`;
          } else {
            el.classList.add("seen", cell.kind);
            if (legal) el.classList.add("legal");
            el.innerHTML = tileMarkup(cell, isHero, side);
          }
        }
      }
    }

    function tileMarkup(cell, isHero, side) {
      if (isHero) return `<span class="dr-adventurer p${side + 1}"><i></i><b>${side + 1}</b></span>`;
      const lvlBadge = (cell.kind === "monster" || cell.kind === "elite" || cell.kind === "boss")
        ? `<small>${cell.lvl}</small>` : "";
      if (cell.kind === "treasure") {
        const ic = LOOT[cell.loot]?.icon || "💰";
        return `<span class="dr-icon treasure">🧰</span><small class="loot">${ic}</small>`;
      }
      const icon = TILE_ICON[cell.kind];
      if (icon) return `<span class="dr-icon ${cell.kind}">${icon}</span>${lvlBadge}`;
      return `<span class="dr-icon empty">·</span>`;
    }

    ctx.setTurn(0);
    render();
    updateStatus();

    function updateStatus() {
      if (over) return;
      if (ctx.isOnline && turn !== ctx.mySeat) ctx.setStatus(ctx.t(`Đối thủ đang đi. ${log[0] || ""}`, `Opponent's turn. ${log[0] || ""}`));
      else ctx.setStatus(ctx.t(`Người chơi ${turn + 1}: click ô sáng cạnh nhân vật để khám phá. Mua đồ bằng vàng, phá đối thủ bằng bóng tối.`, `Player ${turn + 1}: click a glowing cell next to your hero to explore. Buy with gold, sabotage with shadow.`));
    }

    return { applyMove };
  }

  window.GameRegistry.register({
    id: "dungeonrival",
    name: "Dungeon Rival",
    emoji: "🗝️",
    description: "Hai người đua nhau xuyên hầm ngục riêng: đánh quái, nhặt đồ, lên cấp, mua sắm bằng vàng và dùng bóng tối phá đối thủ. Ai hạ Chúa hầm trước sẽ thắng.",
    onlineReady: true,
    options: [
      {
        id: "size",
        label: "Kích thước dungeon",
        default: 7,
        choices: [
          { value: 6, label: "6x6 (nhanh)" },
          { value: 7, label: "7x7" },
          { value: 8, label: "8x8 (lâu)" },
        ],
      },
      {
        id: "boss",
        label: "Cấp boss",
        default: 5,
        choices: [
          { value: 4, label: "Cấp 4" },
          { value: 5, label: "Cấp 5" },
          { value: 6, label: "Cấp 6" },
        ],
      },
      {
        id: "danger",
        label: "Độ nguy hiểm",
        default: "normal",
        choices: [
          { value: "easy", label: "Dễ" },
          { value: "normal", label: "Vừa" },
          { value: "hard", label: "Khó" },
        ],
      },
    ],
    howTo: [
      "Mỗi người có một dungeon riêng. Đến lượt mình, click ô sáng cạnh nhân vật để di chuyển và mở phòng.",
      "👹 Quái / 👺 Tinh nhuệ / 🐲 Chúa hầm tự đánh theo chỉ số ⚔️ Công và 🛡️ Thủ. Thắng được XP, 🌑 bóng tối, 💰 vàng và đôi khi rơi đồ.",
      "🧰 Kho báu cho kiếm, giáp, bình máu, vàng, bóng tối hoặc hồi máu. ⛩️ Đền thờ tăng máu tối đa và hồi máu. 🪤 Bẫy gây sát thương.",
      "🌀 Cổng dịch chuyển sẽ đưa bạn sang cổng còn lại trong dungeon - dùng để băng nhanh qua bản đồ.",
      "🏪 Cửa hàng: tiêu vàng để mài vũ khí, rèn giáp, mua bình hoặc bóng tối - mua đồ KHÔNG mất lượt.",
      "🌑 Phá hoại địch bằng bóng tối: thả quái, gài bẫy, gieo lời nguyền (trừ máu) hoặc thả sương mù che bản đồ địch.",
      "Đua tới và hạ 🐲 Chúa hầm trong dungeon của mình trước, hoặc khiến đối thủ gục để giành chiến thắng.",
    ],
    create,
  });
})();
