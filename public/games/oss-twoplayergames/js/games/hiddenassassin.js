/* Hidden Assassin - suy luan sat thu an trong dam dong, online-first de giu bi mat. */
(function () {
  const W = 900;
  const H = 560;
  const SUSPECT_NAMES = [
    "Ari", "Bryn", "Cato", "Dax", "Eris", "Finn", "Gale", "Hana",
    "Iris", "Juno", "Kade", "Lyra", "Miro", "Niko",
  ];
  const COVERS = ["phục vụ", "khách VIP", "nhạc công", "bảo vệ", "nhà báo", "ảo thuật gia", "đầu bếp"];
  const HOT_CLUES = [
    "liếc về lối thoát nhiều lần",
    "giấu vật kim loại dưới áo",
    "né camera an ninh",
    "đổi nhịp đi khi có người theo dõi",
    "đứng gần nạn nhân quá lâu",
  ];
  const COLD_CLUES = [
    "hành vi khớp vỏ bọc",
    "không có dấu hiệu vũ khí",
    "bị nhiều người nhận ra",
    "đường đi khá vô hại",
    "có chứng cứ ngoại phạm tạm ổn",
  ];
  const HABITS = ["hay đứng gần cửa", "thường tránh đám đông", "hay đổi phòng sau 2 lượt", "thích đứng ở nơi sáng", "hay đi theo người lạ"];
  const ALIBIS = ["có hóa đơn ở quầy bar", "được bảo vệ nhìn thấy", "vừa ký sổ khách", "có người phục vụ xác nhận", "camera ghi bóng dáng mờ"];
  const PROFILE_HOT = ["hồ sơ bị xé đúng trang quan trọng", "vỏ bọc có 2 chi tiết mâu thuẫn", "nhân chứng nhớ thấy vũ khí nhỏ", "lịch trình có khoảng trống nguy hiểm"];
  const PROFILE_COLD = ["hồ sơ khá nhất quán", "vỏ bọc khớp lời khai", "nhân chứng xác nhận có mặt", "lịch trình chưa có lỗ hổng lớn"];
  const SPOTS = [
    { id: 0, name: "Sảnh chính", icon: "🏛️", x: 450, y: 280, links: [1, 2, 3, 4, 5, 6, 7, 8] },
    { id: 1, name: "Quầy bar", icon: "🍸", x: 190, y: 170, links: [0, 3, 5] },
    { id: 2, name: "Ban công", icon: "🌃", x: 710, y: 170, links: [0, 4, 6] },
    { id: 3, name: "Phòng tranh", icon: "🖼️", x: 190, y: 365, links: [0, 1, 7] },
    { id: 4, name: "Vườn kính", icon: "🌿", x: 710, y: 365, links: [0, 2, 8] },
    { id: 5, name: "Sân khấu", icon: "🎭", x: 360, y: 125, links: [0, 1, 6] },
    { id: 6, name: "Bếp sau", icon: "🍳", x: 610, y: 125, links: [0, 2, 5] },
    { id: 7, name: "Tượng đá", icon: "🗿", x: 330, y: 445, links: [0, 3, 8] },
    { id: 8, name: "Cổng phụ", icon: "🚪", x: 610, y: 445, links: [0, 4, 7] },
  ];
  const PERSON = ["🕴️", "💃", "🤵", "👮", "👩‍🎤", "🧑‍🍳", "🕵️", "👨‍🎨", "👰", "🧑‍🚀", "👨‍⚕️", "👩‍🔬", "🧑‍🎤", "💂"];

  function create(ctx) {
    const o = ctx.options || {};
    const TEAM = o.team || 5;
    const MAX_TRAPS = o.traps || 2;
    const NOTES_TO_WARN = o.notes || 3;
    const MAX_FOCUS = o.focus || 6;
    const DOSSIER_GOAL = o.dossier || 3;

    let turn = 0;
    let mode = "move";
    let selected = null;
    let awaiting = false;
    let over = false;
    let moveNo = 1;
    const traps = [];
    const watchers = [];
    const focus = [Math.min(3, MAX_FOCUS), Math.min(3, MAX_FOCUS)];
    const dossiers = [0, 0];
    const profiles = [Object.create(null), Object.create(null)];
    const log = [ctx.t("Đêm dạ tiệc bắt đầu. Một sát thủ đang lẩn trong đám đông.", "The gala begins. An assassin hides in the crowd.")];
    const notes = [Object.create(null), Object.create(null)];
    const suspects = makeSuspects();
    const myAssassinId = pickMyAssassin();

    // bản dịch chuỗi mô tả (hằng module-level) — tra cứu VN→EN để dịch cả chuỗi nhận qua mạng
    const FLAVOR_EN = {
      "phục vụ": "waiter", "khách VIP": "VIP guest", "nhạc công": "musician", "bảo vệ": "guard", "nhà báo": "journalist", "ảo thuật gia": "magician", "đầu bếp": "chef",
      "liếc về lối thoát nhiều lần": "glances at the exits repeatedly", "giấu vật kim loại dưới áo": "hides a metal object under their coat", "né camera an ninh": "avoids the security cameras", "đổi nhịp đi khi có người theo dõi": "changes pace when followed", "đứng gần nạn nhân quá lâu": "lingers near the victim too long",
      "hành vi khớp vỏ bọc": "behavior matches their cover", "không có dấu hiệu vũ khí": "no sign of a weapon", "bị nhiều người nhận ra": "recognized by many people", "đường đi khá vô hại": "route looks harmless", "có chứng cứ ngoại phạm tạm ổn": "has a decent alibi",
      "hay đứng gần cửa": "often stands near doors", "thường tránh đám đông": "usually avoids crowds", "hay đổi phòng sau 2 lượt": "changes rooms every 2 turns", "thích đứng ở nơi sáng": "prefers well-lit spots", "hay đi theo người lạ": "tends to follow strangers",
      "có hóa đơn ở quầy bar": "has a bar receipt", "được bảo vệ nhìn thấy": "seen by a guard", "vừa ký sổ khách": "just signed the guestbook", "có người phục vụ xác nhận": "confirmed by a waiter", "camera ghi bóng dáng mờ": "caught faintly on camera",
      "hồ sơ bị xé đúng trang quan trọng": "the dossier is torn at the key page", "vỏ bọc có 2 chi tiết mâu thuẫn": "the cover has 2 contradictory details", "nhân chứng nhớ thấy vũ khí nhỏ": "a witness recalls a small weapon", "lịch trình có khoảng trống nguy hiểm": "the schedule has a suspicious gap",
      "hồ sơ khá nhất quán": "the dossier is fairly consistent", "vỏ bọc khớp lời khai": "the cover matches the testimony", "nhân chứng xác nhận có mặt": "a witness confirms their presence", "lịch trình chưa có lỗ hổng lớn": "the schedule has no major gaps",
      "mục tiêu đang dùng mồi nhử hoặc cải trang, manh mối bị nhiễu": "the target is using a decoy or disguise; clues are scrambled",
      "hồ sơ bị tráo, dấu vết thật bị che": "the dossier was swapped; real traces are hidden",
      "Sảnh chính": "Main hall", "Quầy bar": "Bar", "Ban công": "Balcony", "Phòng tranh": "Gallery", "Vườn kính": "Greenhouse", "Sân khấu": "Stage", "Bếp sau": "Back kitchen", "Tượng đá": "Stone statue", "Cổng phụ": "Side gate",
    };
    const tr = (s) => ctx.t(s, FLAVOR_EN[s] || s);
    const spotName = (id) => tr(spot(id).name);

    const root = document.createElement("div");
    root.className = "ha-root";
    ctx.boardEl.appendChild(root);

    const hud = document.createElement("div");
    hud.className = "ha-hud";
    root.appendChild(hud);

    const stageWrap = document.createElement("div");
    stageWrap.className = "ha-stage-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "ha-canvas";
    stageWrap.appendChild(canvas);
    root.appendChild(stageWrap);
    const g = canvas.getContext("2d");

    const toolbar = document.createElement("div");
    toolbar.className = "ha-toolbar";
    root.appendChild(toolbar);

    const details = document.createElement("div");
    details.className = "ha-details";
    root.appendChild(details);

    function makeSuspects() {
      const list = [];
      for (let owner = 0; owner < 2; owner++) {
        const baseSpots = owner === 0 ? [1, 3, 5, 7, 0, 6, 8] : [2, 4, 6, 8, 0, 5, 7];
        for (let i = 0; i < TEAM; i++) {
          const name = SUSPECT_NAMES[owner * 7 + i] || `N${owner + 1}${i + 1}`;
          list.push({
            id: `p${owner}_${i}`,
            owner,
            idx: i,
            name,
            emoji: PERSON[(owner * 7 + i) % PERSON.length],
            cover: COVERS[(owner * TEAM + i) % COVERS.length],
            habit: HABITS[(owner * TEAM + i) % HABITS.length],
            alibi: ALIBIS[(owner * 3 + i) % ALIBIS.length],
            spot: baseSpots[i % baseSpots.length],
            route: [baseSpots[i % baseSpots.length]],
            alive: true,
            stun: 0,
            decoy: 0,
            disguise: 0,
            revealed: false,
            x: 0,
            y: 0,
          });
        }
      }
      return list;
    }

    function pickMyAssassin() {
      if (!ctx.isOnline) return suspects.find((s) => s.owner === 0).id;
      const mine = suspects.filter((s) => s.owner === ctx.mySeat);
      return mine[Math.floor(Math.random() * mine.length)].id;
    }

    function canAct(fromRemote) {
      return !over && !awaiting && (fromRemote || !ctx.isOnline || turn === ctx.mySeat);
    }

    function isMine(s) {
      return ctx.isOnline ? s.owner === ctx.mySeat : s.owner === turn;
    }

    function isMyAssassin(id) {
      return id === myAssassinId;
    }

    function getSuspect(id) {
      return suspects.find((s) => s.id === id) || null;
    }

    function spot(id) {
      return SPOTS.find((s) => s.id === id) || SPOTS[0];
    }

    function addLog(text) {
      log.unshift(text);
      while (log.length > 6) log.pop();
    }

    function note(observer, targetId, amount, reason) {
      notes[observer][targetId] = Math.max(0, (notes[observer][targetId] || 0) + amount);
      const target = getSuspect(targetId);
      if (target && observer === ctx.mySeat && notes[observer][targetId] >= NOTES_TO_WARN) {
        addLog(ctx.t(`${target.name} đã có ${notes[observer][targetId]} dấu nghi vấn: nên cân nhắc tố cáo.`, `${target.name} now has ${notes[observer][targetId]} suspicion marks: consider accusing.`));
      }
      if (reason && observer === ctx.mySeat) addLog(reason);
    }

    function actionCost(id) {
      return { follow: 1, profile: 1, decoy: 1, disguise: 1 }[id] || 0;
    }

    function spendFocus(owner, amount) {
      if (amount <= 0) return true;
      if (focus[owner] < amount) return false;
      focus[owner] -= amount;
      return true;
    }

    function addDossier(owner) {
      dossiers[owner] = Math.min(DOSSIER_GOAL, dossiers[owner] + 1);
    }

    function targetMasked(target) {
      return target.decoy > 0 || target.disguise > 0;
    }

    function addWatcher(owner, targetId) {
      const old = watchers.find((w) => w.owner === owner && w.target === targetId);
      if (old) {
        old.turns = 3;
        return;
      }
      watchers.push({ owner, target: targetId, turns: 3 });
    }

    function triggerWatchers(s, fromSpot, toSpot) {
      watchers
        .filter((w) => w.target === s.id && w.owner !== s.owner && w.turns > 0)
        .forEach((w) => {
          w.turns -= 1;
          note(w.owner, s.id, 1, w.owner === ctx.mySeat
            ? ctx.t(`Theo dõi thấy ${s.name} rời ${spot(fromSpot).name} sang ${spot(toSpot).name}.`, `Surveillance saw ${s.name} leave ${spotName(fromSpot)} for ${spotName(toSpot)}.`)
            : "");
        });
      for (let i = watchers.length - 1; i >= 0; i--) {
        if (watchers[i].turns <= 0) watchers.splice(i, 1);
      }
    }

    function applyMove(move, fromRemote) {
      if (!move || over) return;
      if (!fromRemote && !canAct(false)) return;

      if (move.t === "move") return doMove(move, fromRemote);
      if (move.t === "trap") return doTrap(move, fromRemote);
      if (move.t === "follow") return doFollow(move, fromRemote);
      if (move.t === "observe") return doObserve(move, fromRemote);
      if (move.t === "observeResult") return doObserveResult(move);
      if (move.t === "profile") return doProfile(move, fromRemote);
      if (move.t === "profileResult") return doProfileResult(move);
      if (move.t === "decoy") return doDecoy(move, fromRemote);
      if (move.t === "disguise") return doDisguise(move, fromRemote);
      if (move.t === "accuse") return doAccuse(move, fromRemote);
      if (move.t === "accuseResult") return doAccuseResult(move);
      if (move.t === "kill") return doKill(move, fromRemote);
      if (move.t === "killResult") return doKillResult(move);
    }

    function doMove(move, fromRemote) {
      const s = getSuspect(move.id);
      const to = Number(move.spot);
      if (!s || s.owner !== turn || !legalMove(s, to)) return;
      if (!fromRemote) ctx.sendMove({ t: "move", id: s.id, spot: to });
      const from = s.spot;
      s.spot = to;
      s.route.push(to);
      while (s.route.length > 5) s.route.shift();
      s.revealed = false;
      triggerWatchers(s, from, to);
      const trappedId = triggerTrap(s);
      addLog(ctx.t(`P${s.owner + 1} đưa ${s.name} đến ${spot(to).name}.`, `P${s.owner + 1} moved ${s.name} to ${spotName(to)}.`));
      selected = null;
      ctx.sound(trappedId ? "capture" : "place");
      endTurn(trappedId || null);
    }

    function doTrap(move, fromRemote) {
      const where = Number(move.spot);
      if (!SPOTS.some((s) => s.id === where)) return;
      if (!fromRemote) ctx.sendMove({ t: "trap", spot: where });
      const mine = traps.filter((t) => t.owner === turn);
      if (mine.length >= MAX_TRAPS) {
        const oldest = mine[0];
        traps.splice(traps.indexOf(oldest), 1);
      }
      traps.push({ owner: turn, spot: where, id: `${turn}_${moveNo}_${where}` });
      addLog(ctx.t(`P${turn + 1} gài bẫy camera ở ${spot(where).name}.`, `P${turn + 1} set a camera trap in ${spotName(where)}.`));
      ctx.sound("select");
      endTurn();
    }

    function doFollow(move, fromRemote) {
      const target = getSuspect(move.target);
      if (!target || target.owner === turn || !target.alive) return;
      if (!spendFocus(turn, actionCost("follow"))) return;
      if (!fromRemote) ctx.sendMove({ t: "follow", target: target.id });
      addWatcher(turn, target.id);
      addLog(ctx.t(`P${turn + 1} cho người bám theo ${target.name} trong 3 nhịp di chuyển.`, `P${turn + 1} had someone tail ${target.name} for 3 moves.`));
      ctx.sound("select");
      endTurn();
    }

    function doObserve(move, fromRemote) {
      const target = getSuspect(move.target);
      if (!target || target.owner === turn || !target.alive) return;
      if (!canObserve(target)) return;

      if (!fromRemote) {
        awaiting = true;
        ctx.sendMove({ t: "observe", target: target.id });
        addLog(ctx.t(`Bạn đang quan sát ${target.name}, chờ tín hiệu từ đối thủ...`, `You're observing ${target.name}, waiting for the opponent's signal...`));
        render();
        updateStatus();
        return;
      }

      const masked = targetMasked(target);
      const hot = !masked && isMyAssassin(target.id);
      const clue = masked ? "mục tiêu đang dùng mồi nhử hoặc cải trang, manh mối bị nhiễu" : makeClue(hot);
      ctx.sendMove({ t: "observeResult", observer: 1 - ctx.mySeat, target: target.id, hot, masked, clue });
      addLog(ctx.t(`Đối thủ vừa quan sát ${target.name}.`, `The opponent just observed ${target.name}.`));
      endTurn();
    }

    function makeClue(hot) {
      const source = hot ? HOT_CLUES : COLD_CLUES;
      return source[Math.floor(Math.random() * source.length)];
    }

    function makeProfileClue(hot) {
      const source = hot ? PROFILE_HOT : PROFILE_COLD;
      return source[Math.floor(Math.random() * source.length)];
    }

    function doObserveResult(move) {
      awaiting = false;
      const target = getSuspect(move.target);
      if (!target) return;
      note(ctx.mySeat, target.id, move.hot ? 2 : 0, ctx.t(`${target.name}: ${move.clue}.`, `${target.name}: ${tr(move.clue)}.`));
      if (move.masked) addLog(ctx.t(`${target.name} làm nhiễu quan sát, cần hồ sơ hoặc theo dõi thêm.`, `${target.name} scrambled the observation; you need a dossier or more tailing.`));
      else if (!move.hot) addLog(ctx.t(`${target.name} chưa có dấu hiệu nguy hiểm rõ ràng.`, `${target.name} shows no clear sign of danger yet.`));
      ctx.sound(move.hot ? "capture" : "select");
      endTurn();
    }

    function doProfile(move, fromRemote) {
      const target = getSuspect(move.target);
      if (!target || target.owner === turn || !target.alive) return;
      if (!spendFocus(turn, actionCost("profile"))) return;

      if (!fromRemote) {
        awaiting = true;
        ctx.sendMove({ t: "profile", target: target.id });
        addLog(ctx.t(`Bạn lục hồ sơ của ${target.name}, chờ đối thủ đối chiếu bí mật...`, `You dig into ${target.name}'s dossier, waiting for the opponent to cross-check...`));
        render();
        updateStatus();
        return;
      }

      const masked = targetMasked(target);
      const hot = !masked && isMyAssassin(target.id);
      const clue = masked ? "hồ sơ bị tráo, dấu vết thật bị che" : makeProfileClue(hot);
      addDossier(1 - ctx.mySeat);
      ctx.sendMove({
        t: "profileResult",
        observer: 1 - ctx.mySeat,
        target: target.id,
        hot,
        masked,
        clue,
        cover: target.cover,
        habit: target.habit,
        alibi: target.alibi,
        route: target.route.slice(-4),
      });
      addLog(ctx.t(`Đối thủ vừa lục hồ sơ ${target.name}.`, `The opponent just searched ${target.name}'s dossier.`));
      endTurn();
    }

    function doProfileResult(move) {
      awaiting = false;
      const target = getSuspect(move.target);
      if (!target) return;
      addDossier(ctx.mySeat);
      profiles[ctx.mySeat][target.id] = {
        clue: move.clue,
        cover: move.cover || target.cover,
        habit: move.habit || target.habit,
        alibi: move.alibi || target.alibi,
        route: Array.isArray(move.route) ? move.route : target.route.slice(-4),
        masked: !!move.masked,
      };
      note(ctx.mySeat, target.id, move.hot ? 2 : move.masked ? 0 : 1, ctx.t(`${target.name}: ${move.clue}.`, `${target.name}: ${tr(move.clue)}.`));
      ctx.sound(move.hot ? "capture" : "select");
      endTurn();
    }

    function doDecoy(move, fromRemote) {
      const s = getSuspect(move.id);
      if (!s || s.owner !== turn || !s.alive) return;
      if (!spendFocus(turn, actionCost("decoy"))) return;
      if (!fromRemote) ctx.sendMove({ t: "decoy", id: s.id });
      s.decoy = Math.max(s.decoy, 2);
      addLog(ctx.t(`P${turn + 1} dựng mồi nhử quanh ${s.name}, quan sát lên người này sẽ bị nhiễu.`, `P${turn + 1} set decoys around ${s.name}; observing them will be scrambled.`));
      ctx.sound("select");
      endTurn();
    }

    function doDisguise(move, fromRemote) {
      const s = getSuspect(move.id);
      if (!s || s.owner !== turn || !s.alive) return;
      if (!spendFocus(turn, actionCost("disguise"))) return;
      if (!fromRemote) ctx.sendMove({ t: "disguise", id: s.id });
      s.disguise = Math.max(s.disguise, 2);
      s.revealed = false;
      addLog(ctx.t(`P${turn + 1} cho ${s.name} thay vỏ bọc, hồ sơ và quan sát tạm thời kém chính xác.`, `P${turn + 1} had ${s.name} change cover; dossier and observation are temporarily less accurate.`));
      ctx.sound("select");
      endTurn();
    }

    function doAccuse(move, fromRemote) {
      const target = getSuspect(move.target);
      if (!target || target.owner === turn || !target.alive) return;
      if (!fromRemote) {
        awaiting = true;
        ctx.sendMove({ t: "accuse", target: target.id });
        addLog(ctx.t(`Bạn tố cáo ${target.name}. Đang chờ đối thủ xác nhận danh tính.`, `You accuse ${target.name}. Waiting for the opponent to confirm identity.`));
        render();
        updateStatus();
        return;
      }

      const correct = isMyAssassin(target.id);
      const accuser = 1 - ctx.mySeat;
      const saved = !correct && dossiers[accuser] >= DOSSIER_GOAL;
      if (saved) dossiers[accuser] = 0;
      ctx.sendMove({ t: "accuseResult", accuser, target: target.id, correct, saved });
      if (saved) {
        addLog(ctx.t(`P${accuser + 1} tố cáo sai ${target.name}, nhưng hồ sơ dự phòng giúp thoát thua ngay.`, `P${accuser + 1} wrongly accused ${target.name}, but a backup dossier averted an instant loss.`));
        ctx.sound("select");
        endTurn();
        return;
      }
      finish(correct ? 1 - ctx.mySeat : ctx.mySeat, correct
        ? ctx.t(`${target.name} đúng là sát thủ.`, `${target.name} was indeed the assassin.`)
        : ctx.t(`Tố cáo sai ${target.name}, sát thủ thật thoát thân.`, `Wrong accusation of ${target.name}; the real assassin escaped.`));
    }

    function doAccuseResult(move) {
      awaiting = false;
      if (move.saved) {
        const accuser = typeof move.accuser === "number" ? move.accuser : ctx.mySeat;
        dossiers[accuser] = 0;
        const target = getSuspect(move.target);
        addLog(ctx.t(`Tố cáo sai ${target?.name || "mục tiêu"}, nhưng bộ hồ sơ đã chặn thua ngay.`, `Wrong accusation of ${target?.name || "the target"}, but the dossier blocked an instant loss.`));
        ctx.sound("select");
        endTurn();
        return;
      }
      const winner = move.correct ? ctx.mySeat : 1 - ctx.mySeat;
      const target = getSuspect(move.target);
      finish(winner, move.correct
        ? ctx.t(`${target?.name || "mục tiêu"} đúng là sát thủ.`, `${target?.name || "The target"} was indeed the assassin.`)
        : ctx.t(`Tố cáo sai ${target?.name || "mục tiêu"}, đối thủ thắng.`, `Wrong accusation of ${target?.name || "the target"}; the opponent wins.`));
    }

    function doKill(move, fromRemote) {
      const killer = getSuspect(move.killer);
      const target = getSuspect(move.target);
      if (!killer || !target || target.owner === turn || !target.alive) return;
      if (!sameSpot(killer, target)) return;

      if (!fromRemote) {
        if (!isMyAssassin(killer.id)) return;
        awaiting = true;
        ctx.sendMove({ t: "kill", killer: killer.id, target: target.id });
        addLog(ctx.t(`Bạn ra lệnh ám sát ${target.name}.`, `You order the assassination of ${target.name}.`));
        render();
        updateStatus();
        return;
      }

      const correct = isMyAssassin(target.id);
      ctx.sendMove({ t: "killResult", attacker: 1 - ctx.mySeat, killer: killer.id, target: target.id, correct });
      finish(correct ? 1 - ctx.mySeat : ctx.mySeat, correct
        ? ctx.t(`Sát thủ đã hạ đúng sát thủ đối phương.`, `The assassin took down the enemy assassin.`)
        : ctx.t(`Ám sát nhầm dân thường, kẻ ra tay bị lộ.`, `Killed a civilian by mistake; the culprit is exposed.`));
    }

    function doKillResult(move) {
      awaiting = false;
      const winner = move.correct ? ctx.mySeat : 1 - ctx.mySeat;
      finish(winner, move.correct
        ? ctx.t("Sát thủ của bạn đã hạ đúng mục tiêu.", "Your assassin hit the right target.")
        : ctx.t("Ám sát nhầm, sát thủ của bạn bị lộ.", "Wrong kill; your assassin is exposed."));
    }

    function triggerTrap(s) {
      const trap = traps.find((t) => t.owner !== s.owner && t.spot === s.spot);
      if (!trap) return null;
      traps.splice(traps.indexOf(trap), 1);
      s.stun = Math.max(s.stun, 1);
      note(trap.owner, s.id, 1, trap.owner === ctx.mySeat ? ctx.t(`Bẫy bắt được ${s.name} ở ${spot(s.spot).name}.`, `A trap caught ${s.name} in ${spotName(s.spot)}.`) : "");
      addLog(ctx.t(`${s.name} kích hoạt bẫy ở ${spot(s.spot).name} và bị kẹt 1 lượt.`, `${s.name} triggered a trap in ${spotName(s.spot)} and is stuck for 1 turn.`));
      return s.id;
    }

    function legalMove(s, to) {
      if (!s.alive || s.stun > 0 || s.spot === to) return false;
      return spot(s.spot).links.includes(to);
    }

    function canObserve(target) {
      return suspects.some((s) => s.owner === turn && s.alive && (s.spot === target.spot || spot(s.spot).links.includes(target.spot)));
    }

    function sameSpot(a, b) {
      return a.spot === b.spot;
    }

    function decayTimers(activeSide) {
      suspects.forEach((s) => {
        if (s.owner !== activeSide) return;
        if (s.decoy > 0) s.decoy -= 1;
        if (s.disguise > 0) s.disguise -= 1;
      });
      for (let i = watchers.length - 1; i >= 0; i--) {
        if (watchers[i].owner !== activeSide) continue;
        watchers[i].turns -= 1;
        if (watchers[i].turns <= 0) watchers.splice(i, 1);
      }
    }

    function endTurn(skipStunId) {
      if (over) return;
      suspects.forEach((s) => {
        if (s.owner === turn && s.stun > 0 && s.id !== skipStunId) s.stun -= 1;
      });
      selected = null;
      awaiting = false;
      turn = 1 - turn;
      moveNo += 1;
      focus[turn] = Math.min(MAX_FOCUS, focus[turn] + 1);
      decayTimers(turn);
      ctx.setTurn(turn);
      render();
      updateStatus();
    }

    function finish(winner, reason) {
      if (over) return;
      over = true;
      awaiting = false;
      suspects.forEach((s) => {
        if (s.id === myAssassinId) s.revealed = true;
      });
      ctx.setTurn(-1);
      ctx.incScore(winner);
      ctx.setStatus(ctx.t(`🎉 Người chơi ${winner + 1} thắng - ${reason}`, `🎉 Player ${winner + 1} wins — ${reason}`));
      render();
    }

    function setMode(next) {
      if (awaiting || over) return;
      mode = next;
      selected = null;
      render();
      updateStatus();
    }

    function canvasPoint(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * W / rect.width,
        y: (e.clientY - rect.top) * H / rect.height,
      };
    }

    function clickCanvas(e) {
      if (!canAct(false)) return;
      updatePositions();
      const p = canvasPoint(e);
      const targetSuspect = findSuspectAt(p.x, p.y);
      const targetSpot = findSpotAt(p.x, p.y);

      if (mode === "move") {
        if (targetSuspect && targetSuspect.owner === turn && isMine(targetSuspect)) {
          selected = targetSuspect.id;
          render();
          return;
        }
        if (selected && targetSpot) {
          applyMove({ t: "move", id: selected, spot: targetSpot.id }, false);
          return;
        }
      }

      if (mode === "trap" && targetSpot) {
        applyMove({ t: "trap", spot: targetSpot.id }, false);
        return;
      }

      if (targetSuspect && targetSuspect.owner === turn && isMine(targetSuspect)) {
        if (mode === "disguise") applyMove({ t: "disguise", id: targetSuspect.id }, false);
        return;
      }

      if (targetSuspect && targetSuspect.owner !== turn) {
        if (mode === "observe") applyMove({ t: "observe", target: targetSuspect.id }, false);
        else if (mode === "profile") applyMove({ t: "profile", target: targetSuspect.id }, false);
        else if (mode === "accuse") applyMove({ t: "accuse", target: targetSuspect.id }, false);
      }
    }

    function findSuspectAt(x, y) {
      return suspects
        .filter((s) => s.alive)
        .slice()
        .reverse()
        .find((s) => Math.hypot(s.x - x, s.y - y) <= 20) || null;
    }

    function findSpotAt(x, y) {
      return SPOTS.find((s) => Math.hypot(s.x - x, s.y - y) <= 42) || null;
    }

    function updatePositions() {
      SPOTS.forEach((sp) => {
        [0, 1].forEach((owner) => {
          const here = suspects.filter((s) => s.alive && s.owner === owner && s.spot === sp.id);
          here.forEach((s, i) => {
            const side = owner === 0 ? -1 : 1;
            const row = Math.floor(i / 3);
            const col = i % 3;
            s.x = sp.x + side * (30 + col * 28);
            s.y = sp.y - 18 + row * 32;
          });
        });
      });
    }

    function render() {
      renderHud();
      renderToolbar();
      renderDetails();
      draw();
    }

    function renderHud() {
      const own = getSuspect(myAssassinId);
      hud.innerHTML = `
        <div class="ha-panel p1 ${turn === 0 && !over ? "active" : ""}">
          <span>${ctx.t("🔴 Người chơi 1", "🔴 Player 1")}</span>
          <b>${ctx.t(`${aliveCount(0)} nhân vật`, `${aliveCount(0)} figures`)}</b>
          <small>${ctx.t(`⚡ ${focus[0]}/${MAX_FOCUS} · 📂 ${dossiers[0]}/${DOSSIER_GOAL} hồ sơ`, `⚡ ${focus[0]}/${MAX_FOCUS} · 📂 ${dossiers[0]}/${DOSSIER_GOAL} dossiers`)}</small>
          <small>${ctx.mySeat === 0 ? ctx.t(`👑 Sát thủ của bạn: ${own?.name || "?"}`, `👑 Your assassin: ${own?.name || "?"}`) : ctx.t("Danh tính sát thủ bị ẩn", "Assassin identity hidden")}</small>
        </div>
        <div class="ha-mid">
          <b>${over ? ctx.t("Kết thúc", "Game over") : awaiting ? ctx.t("Đang chờ xác nhận", "Awaiting confirmation") : ctx.t(`Lượt ${turn + 1}`, `Turn P${turn + 1}`)}</b>
          <span>${ctx.t("🎯 Tìm & TỐ CÁO đúng sát thủ ẩn của đối thủ để thắng. Tố cáo sai là thua!", "🎯 Find & ACCUSE the opponent's hidden assassin to win. A wrong accusation loses!")}</span>
          <small>${log[0] || ""}</small>
        </div>
        <div class="ha-panel p2 ${turn === 1 && !over ? "active" : ""}">
          <span>${ctx.t("🔵 Người chơi 2", "🔵 Player 2")}</span>
          <b>${ctx.t(`${aliveCount(1)} nhân vật`, `${aliveCount(1)} figures`)}</b>
          <small>${ctx.t(`⚡ ${focus[1]}/${MAX_FOCUS} · 📂 ${dossiers[1]}/${DOSSIER_GOAL} hồ sơ`, `⚡ ${focus[1]}/${MAX_FOCUS} · 📂 ${dossiers[1]}/${DOSSIER_GOAL} dossiers`)}</small>
          <small>${ctx.mySeat === 1 ? ctx.t(`👑 Sát thủ của bạn: ${own?.name || "?"}`, `👑 Your assassin: ${own?.name || "?"}`) : ctx.t("Danh tính sát thủ bị ẩn", "Assassin identity hidden")}</small>
        </div>
      `;
    }

    function aliveCount(owner) {
      return suspects.filter((s) => s.owner === owner && s.alive).length;
    }

    function renderToolbar() {
      const buttons = [
        ["move", "🚶", ctx.t("Di chuyển", "Move"), ctx.t("chọn người của bạn rồi tới địa điểm kề", "pick your figure then an adjacent spot")],
        ["observe", "🔍", ctx.t("Điều tra", "Observe"), ctx.t("đứng gần mục tiêu để lấy manh mối", "stand near a target for clues")],
        ["profile", "📂", ctx.t("Lục hồ sơ", "Dossier"), ctx.t("thêm thông tin + tích hồ sơ cứu", "more info + build a safety dossier")],
        ["trap", "📹", ctx.t("Gài bẫy", "Set trap"), ctx.t("camera ẩn ở một địa điểm", "hidden camera at a spot")],
        ["disguise", "🎭", ctx.t("Ngụy trang", "Disguise"), ctx.t("làm mờ manh mối người của bạn", "blur clues on your figure")],
        ["accuse", "⚖️", ctx.t("Tố cáo", "Accuse"), ctx.t("đúng thắng — sai thua", "right wins — wrong loses")],
      ];
      toolbar.innerHTML = buttons.map(([id, icon, label, hint]) => {
        const cost = actionCost(id);
        const disabled = !canAct(false) || focus[ctx.mySeat] < cost;
        const meta = cost > 0 ? `${hint} · ${cost}⚡` : hint;
        return `
        <button class="btn small ha-action ${mode === id ? "active" : ""}" type="button" data-mode="${id}" ${disabled ? "disabled" : ""}>
          <span>${icon}</span><b>${label}</b><small>${meta}</small>
        </button>
      `;
      }).join("");
      toolbar.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => setMode(btn.dataset.mode));
      });
    }

    function renderDetails() {
      const myNotes = notes[ctx.mySeat] || {};
      const rows = suspects
        .filter((s) => s.owner !== ctx.mySeat)
        .map((s) => {
          const prof = profiles[ctx.mySeat][s.id];
          const route = prof?.route?.map((id) => spotName(Number(id))).join(" > ");
          return `<span>
            <b>${s.name}</b>
            <small>${ctx.t(`${myNotes[s.id] || 0} nghi vấn · ${spot(s.spot).name}`, `${myNotes[s.id] || 0} marks · ${spotName(s.spot)}`)}</small>
            ${prof ? `<small>${tr(prof.cover)} · ${tr(prof.habit)}</small><small>${tr(prof.alibi)}</small><small>${tr(prof.clue)}${route ? ctx.t(` · tuyến ${route}`, ` · route ${route}`) : ""}</small>` : `<small>${ctx.t(`${tr(s.cover)} · chưa có hồ sơ`, `${tr(s.cover)} · no dossier yet`)}</small>`}
          </span>`;
        })
        .join("");
      details.innerHTML = `
        <div class="ha-notes"><b>${ctx.t("Sổ nghi vấn", "Suspicion notebook")}</b><div>${rows}</div></div>
        <div class="ha-log"><b>${ctx.t("Diễn biến", "Events")}</b><div>${log.map((x) => `<span>${x}</span>`).join("")}</div></div>
      `;
    }

    function updateStatus() {
      if (over) return;
      if (!ctx.isOnline) {
        ctx.setStatus(ctx.t("Hidden Assassin chỉ chơi online để giữ bí mật danh tính sát thủ.", "Hidden Assassin is online-only to keep the assassin's identity secret."));
        return;
      }
      if (awaiting) {
        ctx.setStatus(ctx.t("Đang chờ đối thủ xác nhận thông tin bí mật...", "Waiting for the opponent to confirm secret info..."));
        return;
      }
      if (turn !== ctx.mySeat) {
        ctx.setStatus(ctx.t("Đối thủ đang hành động. Hãy quan sát đường đi của họ.", "The opponent is acting. Watch their movements."));
        return;
      }
      const text = {
        move: ctx.t("🚶 Chọn nhân vật của bạn (viền vàng), rồi chọn địa điểm sáng xanh kề bên để di chuyển.", "🚶 Pick your figure (gold ring), then a glowing green adjacent spot to move."),
        observe: ctx.t("🔍 Chọn nghi phạm đối thủ đang ở GẦN người của bạn để lấy manh mối nóng/lạnh.", "🔍 Pick an enemy suspect NEAR your figure to get a hot/cold clue."),
        profile: ctx.t("📂 Chọn nghi phạm đối thủ để lục hồ sơ — thêm thông tin và tích hồ sơ cứu tố cáo sai.", "📂 Pick an enemy suspect to search the dossier — more info and a safety dossier against wrong accusations."),
        trap: ctx.t("📹 Chọn một địa điểm để gài camera ẩn. Người đối thủ đi vào sẽ bị kẹt và lộ nghi vấn.", "📹 Pick a spot to set a hidden camera. An enemy who enters gets stuck and gains suspicion."),
        disguise: ctx.t("🎭 Chọn nhân vật của bạn để ngụy trang — làm mờ manh mối, bảo vệ sát thủ thật.", "🎭 Pick your figure to disguise — blur clues and protect the real assassin."),
        accuse: ctx.t("⚖️ Chọn nghi phạm bạn nghi là sát thủ để tố cáo. Đúng thì THẮNG, sai thì THUA.", "⚖️ Pick the suspect you think is the assassin to accuse. Right WINS, wrong LOSES."),
      };
      ctx.setStatus(text[mode] || ctx.t("Đến lượt bạn.", "Your turn."));
    }

    function draw() {
      updatePositions();
      g.clearRect(0, 0, W, H);
      drawRoom();
      drawTraps();
      drawSuspects();
    }

    function drawRoom() {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#171d39");
      bg.addColorStop(1, "#090d1d");
      g.fillStyle = bg;
      roundRect(g, 0, 0, W, H, 18);
      g.fill();

      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 2;
      SPOTS.forEach((sp) => {
        sp.links.forEach((id) => {
          const other = spot(id);
          if (other.id < sp.id) return;
          g.beginPath();
          g.moveTo(sp.x, sp.y);
          g.lineTo(other.x, other.y);
          g.stroke();
        });
      });

      SPOTS.forEach((sp) => {
        const active = selected && legalMove(getSuspect(selected), sp.id);
        g.fillStyle = active ? "rgba(110,231,183,0.2)" : "rgba(255,255,255,0.06)";
        g.strokeStyle = active ? "#6ee7b7" : "rgba(255,209,102,0.28)";
        g.lineWidth = active ? 4 : 2;
        g.beginPath();
        g.arc(sp.x, sp.y, 38, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        if (active) {
          g.save();
          g.shadowColor = "rgba(110,231,183,0.7)"; g.shadowBlur = 16;
          g.strokeStyle = "#6ee7b7"; g.lineWidth = 2;
          g.beginPath(); g.arc(sp.x, sp.y, 38, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
        g.font = "26px 'Segoe UI Emoji', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.globalAlpha = 0.85;
        g.fillText(sp.icon, sp.x, sp.y - 2);
        g.globalAlpha = 1;
        g.fillStyle = active ? "#bff3dd" : "#e9ecff";
        g.font = "800 12px Segoe UI, sans-serif";
        g.textBaseline = "alphabetic";
        g.fillText(sp.name, sp.x, sp.y + 56);
      });
    }

    function drawTraps() {
      traps.forEach((t) => {
        if (ctx.isOnline && t.owner !== ctx.mySeat && !over) return;
        const sp = spot(t.spot);
        g.save();
        g.translate(sp.x, sp.y - 42);
        g.fillStyle = t.owner === 0 ? "rgba(255,93,115,0.75)" : "rgba(77,208,225,0.75)";
        roundRect(g, -16, -10, 32, 20, 5);
        g.fill();
        g.fillStyle = "#101424";
        g.font = "900 9px Segoe UI, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("CAM", 0, 0);
        g.restore();
      });
    }

    function drawSuspects() {
      suspects.forEach((s) => {
        if (!s.alive) return;
        const mine = isMine(s);
        const ownAssassin = mine && isMyAssassin(s.id);
        const color = s.owner === 0 ? "#ff5d73" : "#4dd0e1";
        const n = notes[ctx.mySeat]?.[s.id] || 0;
        const watched = watchers.some((w) => w.owner === ctx.mySeat && w.target === s.id);
        g.save();
        g.globalAlpha = s.stun > 0 ? 0.6 : 1;
        g.translate(s.x, s.y);

        // bệ tròn màu theo phe
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath(); g.ellipse(0, 16, 15, 5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = s.owner === 0 ? "rgba(255,93,115,0.22)" : "rgba(77,208,225,0.22)";
        g.beginPath(); g.arc(0, 2, 17, 0, Math.PI * 2); g.fill();
        g.strokeStyle = color; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 2, 17, 0, Math.PI * 2); g.stroke();

        if (watched) {
          g.strokeStyle = "#8be9ff"; g.lineWidth = 2; g.setLineDash([5, 4]);
          g.beginPath(); g.arc(0, 2, 23, 0, Math.PI * 2); g.stroke();
          g.setLineDash([]);
        }
        if (selected === s.id) {
          g.save();
          g.shadowColor = "rgba(255,209,102,0.8)"; g.shadowBlur = 14;
          g.strokeStyle = "#ffd166"; g.lineWidth = 3;
          g.beginPath(); g.arc(0, 2, 21, 0, Math.PI * 2); g.stroke();
          g.restore();
        }

        // nhân vật bằng emoji
        g.font = "24px 'Segoe UI Emoji', sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(s.emoji || "🕴️", 0, 2);

        // vương miện cho sát thủ của mình (hoặc lộ khi kết thúc)
        if (ownAssassin || (over && s.id === myAssassinId)) {
          g.font = "16px 'Segoe UI Emoji', sans-serif";
          g.fillText("👑", 0, -20);
        }

        // tên
        g.globalAlpha = s.stun > 0 ? 0.6 : 1;
        g.fillStyle = "#fff";
        g.font = "900 11px Segoe UI, sans-serif";
        g.fillText(s.name, 0, 38);

        // huy hiệu trạng thái / nghi vấn
        g.font = "13px 'Segoe UI Emoji', sans-serif";
        if (s.stun > 0) { g.fillText("🚨", 17, -10); }
        else if ((s.disguise > 0 || s.decoy > 0) && mine) { g.fillText("🎭", 17, -10); }
        if (!mine && watched) g.fillText("🔭", -17, -10);
        if (!mine && n > 0) {
          g.font = "11px 'Segoe UI Emoji', sans-serif";
          g.fillText("🔥".repeat(Math.min(n, 3)), 0, -16);
        }
        g.restore();
      });
    }

    function roundRect(gc, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      gc.beginPath();
      gc.moveTo(x + rr, y);
      gc.lineTo(x + w - rr, y);
      gc.quadraticCurveTo(x + w, y, x + w, y + rr);
      gc.lineTo(x + w, y + h - rr);
      gc.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      gc.lineTo(x + rr, y + h);
      gc.quadraticCurveTo(x, y + h, x, y + h - rr);
      gc.lineTo(x, y + rr);
      gc.quadraticCurveTo(x, y, x + rr, y);
      gc.closePath();
    }

    canvas.addEventListener("click", clickCanvas);

    if (!ctx.isOnline) {
      render();
      updateStatus();
      return { applyMove: () => {} };
    }
    ctx.setNames(`Người chơi 1${ctx.mySeat === 0 ? " (bạn)" : ""}`, `Người chơi 2${ctx.mySeat === 1 ? " (bạn)" : ""}`);
    ctx.setTurn(0);
    render();
    updateStatus();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "hiddenassassin",
    name: "Hidden Assassin",
    emoji: "🕵️",
    description: "Suy luận tìm sát thủ ẩn trong đám đông: điều tra manh mối, lục hồ sơ, gài bẫy, ngụy trang rồi tố cáo đúng để thắng.",
    onlineReady: true,
    localReady: false,
    options: [
      {
        id: "team",
        label: "Số nhân vật mỗi bên",
        default: 5,
        choices: [
          { value: 4, label: "4 (dễ)" },
          { value: 5, label: "5 nhân vật" },
          { value: 6, label: "6 nhân vật" },
          { value: 7, label: "7 (khó)" },
        ],
      },
      {
        id: "traps",
        label: "Bẫy camera mỗi bên",
        default: 2,
        choices: [
          { value: 1, label: "1 bẫy" },
          { value: 2, label: "2 bẫy" },
          { value: 3, label: "3 bẫy" },
        ],
      },
      {
        id: "notes",
        label: "Mốc cảnh báo nghi vấn",
        default: 3,
        choices: [
          { value: 2, label: "2 dấu" },
          { value: 3, label: "3 dấu" },
          { value: 4, label: "4 dấu" },
        ],
      },
      {
        id: "focus",
        label: "Tập trung tối đa",
        default: 6,
        choices: [
          { value: 5, label: "5 điểm" },
          { value: 6, label: "6 điểm" },
          { value: 8, label: "8 điểm (thoải mái)" },
        ],
      },
      {
        id: "dossier",
        label: "Hồ sơ cứu tố cáo sai",
        default: 3,
        choices: [
          { value: 2, label: "2 hồ sơ" },
          { value: 3, label: "3 hồ sơ" },
          { value: 4, label: "4 hồ sơ" },
        ],
      },
    ],
    howTo: [
      "Game chỉ chơi online để mỗi người giữ kín sát thủ thật của mình.",
      "Mỗi bên có vài nhân vật trong dạ tiệc. Bạn thấy 👑 sát thủ CỦA BẠN, nhưng KHÔNG biết sát thủ của đối thủ là ai. Mục tiêu: tìm & tố cáo đúng sát thủ ẩn của đối thủ.",
      "🚶 Di chuyển: bấm 1 nhân vật của bạn (viền vàng), rồi bấm địa điểm sáng xanh kề bên.",
      "🔍 Điều tra: khi có người của bạn đứng GẦN một nghi phạm đối thủ, điều tra để nhận manh mối. Trúng sát thủ sẽ cho dấu 🔥 nghi vấn cao.",
      "📂 Lục hồ sơ: xem vỏ bọc/thói quen/lời khai/tuyến đi của nghi phạm, đồng thời tích 'hồ sơ' — đủ hồ sơ thì một lần tố cáo sai sẽ được tha (không thua ngay).",
      "🎭 Ngụy trang: làm mờ manh mối của một nhân vật CỦA BẠN trong vài lượt — dùng để bảo vệ sát thủ thật.",
      "📹 Gài bẫy: đặt camera ẩn ở một địa điểm. Nhân vật đối thủ đi vào sẽ bị kẹt 1 lượt và bị thêm dấu nghi vấn.",
      "⚖️ Tố cáo: chọn nghi phạm bạn nghi là sát thủ. Đúng thì THẮNG ngay, sai thì THUA (trừ khi bạn đã đủ hồ sơ cứu).",
      "Mỗi lượt làm 1 hành động. Tập trung ⚡ hồi dần mỗi lượt; điều tra/lục hồ sơ/ngụy trang tốn tập trung.",
    ],
    create,
  });
})();
