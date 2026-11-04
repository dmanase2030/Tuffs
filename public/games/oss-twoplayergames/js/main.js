/* ============================================================
   Khung điều khiển chung: menu, chọn chế độ, sảnh online, vòng chơi
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  const el = {
    menu: $("menu"),
    gameGrid: $("gameGrid"),
    catSidebar: $("catSidebar"),
    catHead: $("catHead"),
    dailyBanner: $("dailyBanner"),
    gameSearch: $("gameSearch"),
    sortSelect: $("sortSelect"),
    chipOnline: $("chipOnline"),
    chipAI: $("chipAI"),
    loadMoreBtn: $("loadMoreBtn"),
    detailView: $("detailView"),
    detailBackBtn: $("detailBackBtn"),
    detailPoster: $("detailPoster"),
    detailTitle: $("detailTitle"),
    detailBadges: $("detailBadges"),
    detailDesc: $("detailDesc"),
    detailStats: $("detailStats"),
    detailHowto: $("detailHowto"),
    detailPlayBtn: $("detailPlayBtn"),
    openOnlineHubBtn: $("openOnlineHubBtn"),
    modeView: $("modeView"),
    modeTitle: $("modeTitle"),
    modeLocal: $("modeLocal"),
    modeAI: $("modeAI"),
    aiLevel: $("aiLevel"),
    bestOfSelect: $("bestOfSelect"),
    modeOnline: $("modeOnline"),
    modeBackBtn: $("modeBackBtn"),
    optionsPanel: $("optionsPanel"),
    optionsList: $("optionsList"),
    lobbyView: $("lobbyView"),
    lobbyTitle: $("lobbyTitle"),
    lobbyBackBtn: $("lobbyBackBtn"),
    lobbyGameSelect: $("lobbyGameSelect"),
    lobbyOptionsPanel: $("lobbyOptionsPanel"),
    lobbyOptionsList: $("lobbyOptionsList"),
    mmGameSelect: $("mmGameSelect"),
    mmFindBtn: $("mmFindBtn"),
    mmCancelBtn: $("mmCancelBtn"),
    mmStatus: $("mmStatus"),
    createNameInput: $("createNameInput"),
    joinNameInput: $("joinNameInput"),
    lobbyState: $("lobbyState"),
    createRoomBtn: $("createRoomBtn"),
    roomCodeBox: $("roomCodeBox"),
    roomCodeVal: $("roomCodeVal"),
    copyCodeBtn: $("copyCodeBtn"),
    waitingMsg: $("waitingMsg"),
    joinCodeInput: $("joinCodeInput"),
    joinRoomBtn: $("joinRoomBtn"),
    lobbyError: $("lobbyError"),
    publicToggle: $("publicToggle"),
    createPwInput: $("createPwInput"),
    joinPwInput: $("joinPwInput"),
    refreshRoomsBtn: $("refreshRoomsBtn"),
    publicRoomsList: $("publicRoomsList"),
    publicRoomsTitle: $("publicRoomsTitle"),
    gameView: $("gameView"),
    gameTitle: $("gameTitle"),
    boardWrap: $("boardWrap"),
    status: $("status"),
    turnBanner: $("turnBanner"),
    onlineBadge: $("onlineBadge"),
    matchBadge: $("matchBadge"),
    gameRoomState: $("gameRoomState"),
    p1Name: $("p1Name"),
    p2Name: $("p2Name"),
    p1Score: $("p1Score"),
    p2Score: $("p2Score"),
    scoreP1: $("scoreP1"),
    scoreP2: $("scoreP2"),
    backBtn: $("backBtn"),
    restartBtn: $("restartBtn"),
    undoBtn: $("undoBtn"),
    homeBtn: $("homeBtn"),
    soundToggle: $("soundToggle"),
    installBtn: $("installBtn"),
    themeToggle: $("themeToggle"),
    langToggle: $("langToggle"),
    profileChip: $("profileChip"),
    chipAvatar: $("chipAvatar"),
    chipName: $("chipName"),
    profileView: $("profileView"),
    profileBackBtn: $("profileBackBtn"),
    profileAvatar: $("profileAvatar"),
    profileName: $("profileName"),
    avatarPicker: $("avatarPicker"),
    profileStats: $("profileStats"),
    leadList: $("leadList"),
    activityChart: $("activityChart"),
    histGameFilter: $("histGameFilter"),
    histModeFilter: $("histModeFilter"),
    achGrid: $("achGrid"),
    histList: $("histList"),
    replayTourBtn: $("replayTourBtn"),
    exportDataBtn: $("exportDataBtn"),
    importDataBtn: $("importDataBtn"),
    importDataFile: $("importDataFile"),
    clearDataBtn: $("clearDataBtn"),
    volRange: $("volRange"),
    sfxToggle: $("sfxToggle"),
    musicToggle: $("musicToggle"),
    helpBtn: $("helpBtn"),
    helpOverlay: $("helpOverlay"),
    helpTitle: $("helpTitle"),
    helpBody: $("helpBody"),
    helpClose: $("helpClose"),
    helpOk: $("helpOk"),
    chatPanel: $("chatPanel"),
    chatToggle: $("chatToggle"),
    chatBody: $("chatBody"),
    chatMessages: $("chatMessages"),
    chatForm: $("chatForm"),
    chatInput: $("chatInput"),
    chatQuick: $("chatQuick"),
    winOverlay: $("winOverlay"),
    winConfetti: $("winConfetti"),
    winEmoji: $("winEmoji"),
    winTitle: $("winTitle"),
    winSub: $("winSub"),
    winAgain: $("winAgain"),
    winMenu: $("winMenu"),
    winReplay: $("winReplay"),
    winShare: $("winShare"),
    shareCodeBtn: $("shareCodeBtn"),
    replayOverlay: $("replayOverlay"),
    replayBoard: $("replayBoard"),
    replayStatus: $("replayStatus"),
    replayTitle: $("replayTitle"),
    replayClose: $("replayClose"),
    replayStart: $("replayStart"),
    replayPrev: $("replayPrev"),
    replayPlay: $("replayPlay"),
    replayNext: $("replayNext"),
    replayProgress: $("replayProgress"),
    tourOverlay: $("tourOverlay"),
    tourRing: $("tourRing"),
    tourCard: $("tourCard"),
    tourTitle: $("tourTitle"),
    tourText: $("tourText"),
    tourStep: $("tourStep"),
    tourSkip: $("tourSkip"),
    tourNext: $("tourNext"),
  };

  // ---- Trạng thái phiên ----
  let selectedGame = null;
  let lobbySelectedGame = null;
  let lobbyReturnView = "menu";
  let pendingRoomCode = null;
  let roomPollTimer = null;
  let instance = null;
  let scores = [0, 0];
  let restartReadySeats = [];
  let sessionLocked = false;
  let roomExitTimer = null;
  let online = null; // null = chơi chung máy; {roomSeat, seat, seed} = online
  let sessionToken = null; // token phiên để kết nối lại phòng
  let reconnecting = false;
  let matchmaking = false; // đang trong hàng chờ tìm trận nhanh
  let resuming = false;    // đang thử khôi phục ván online sau khi tải lại trang
  const SESSION_KEY = "tpg_online_session"; // lưu phiên để rejoin khi lỡ refresh
  let vsAI = false;  // true = đang đấu với máy (local)
  let aiLevel = "normal"; // easy | normal | hard
  const AI_SEAT = 1; // máy luôn cầm người chơi 2
  // Best-of-N (chỉ chung máy / đấu máy): chơi nhiều ván, tính tổng số ván thắng.
  let bestOf = 1;            // 1 = tắt; 3/5/7 = số ván tối đa của trận
  let matchWins = [0, 0];    // số ván mỗi bên đã thắng trong trận
  let matchGameNo = 0;       // ván thứ mấy trong trận (1-based)
  let matchOver = false;     // trận đã kết thúc chưa
  let matchInProgress = false; // đang giữa loạt đấu (còn ván tiếp theo)
  let currentOptions = {}; // giá trị tùy chỉnh ván chơi đang dùng
  let currentCategory = "all"; // thể loại đang xem ở menu
  let menuCategories = [];     // danh sách thể loại đã dựng
  let sortMode = "popular";    // popular | az | new
  let filterOnline = false;
  let filterAI = false;
  let baseList = [];           // danh sách game gốc của view hiện tại
  let currentEmptyKind = "";   // loại thông báo rỗng cho view hiện tại
  let shownCount = 24;         // số game đang hiển thị (phân trang)
  const PAGE_SIZE = 24;
  let resultRecorded = false;  // đã ghi thống kê cho ván hiện tại chưa
  let lastWinner = -1;         // người thắng gần nhất (theo incScore)
  let lastWinSummary = "";     // tóm tắt kết quả gần nhất để chia sẻ

  // Token tài khoản (nếu đã đăng nhập) để server nhận diện người chơi cho ELO.
  function authToken() {
    try { return localStorage.getItem("tpg_auth_token") || ""; } catch (e) { return ""; }
  }

  // ----- Replay (xem lại ván online) -----
  let replayMoves = [];        // chuỗi nước đi của ván online hiện tại
  let replaySeed = 0;          // seed của ván để dựng lại
  let replayMeta = null;       // {gameId, firstSeat, round, options}
  let replayInstance = null;   // instance đang phát lại
  let replayIdx = 0;           // số nước đã phát
  let replayTimer = null;      // bộ đếm tự phát

  const PLAYER_NAME_KEY = "tpg_player_name";

  const GAME_GROUPS = [
    {
      title: "Cờ & chiến thuật bàn",
      titleKey: "grpBoard",
      icon: "♟️",
      hint: "Caro, cờ lật, kết nối, đặt tường và các game bàn cờ kinh điển.",
      hintKey: "grpBoardHint",
      games: ["tictactoe", "ultimatettt", "gomoku", "connectfour", "reversi", "pentago", "morris", "checkers", "minichess", "konane", "breakthrough", "coganh", "hive", "tak", "kamisado", "amazons", "isolation", "sim", "sprouts", "laserchess", "pathlockduel", "hunterswarm", "hex", "quoridor", "mancala", "dotsandboxes", "orderchaos", "nim", "stratego"],
    },
    {
      title: "Chiến thuật trên bản đồ",
      titleKey: "grpMap",
      icon: "🗺️",
      hint: "Đi quân trên lưới, chiếm vùng, dùng tài nguyên và kỹ năng theo lượt.",
      hintKey: "grpMapHint",
      games: ["tankarena", "dicebattle", "territorywar", "crystalconquest", "colorwar"],
    },
    {
      title: "Đối kháng hành động & vật lý",
      titleKey: "grpAction",
      icon: "⚡",
      hint: "Canh lực, bắn, kéo thả, va chạm và phản xạ.",
      hintKey: "grpActionHint",
      games: ["pong", "poolbattle", "slingshotbattle", "timeloopduel", "artillery", "fishingfrenzy", "reactionduel", "dashdodge", "tugofwar", "typingrace"],
    },
    {
      title: "Ván dài & xây dựng",
      titleKey: "grpLong",
      icon: "🏰",
      hint: "Có tiến triển lâu hơn: thủ nhà, gửi quái, đi dungeon và lên cấp.",
      hintKey: "grpLongHint",
      games: ["coopdefense", "basedefenseduel", "robotfactorywar", "dungeonrival", "tycoon", "boxpush", "mazecoop", "defusebomb"],
    },
    {
      title: "Ẩn thông tin & suy luận",
      titleKey: "grpHidden",
      icon: "🕵️",
      hint: "Giấu vị trí, đoán tọa độ, tìm mìn, giải từ và đọc dấu hiệu.",
      hintKey: "grpHiddenHint",
      games: ["battleship", "seabattleplus", "submarinehunt", "hiddenassassin", "trapmansion", "minesweeper", "treasure", "bullscows", "hangman", "noitu", "codebreakerduel", "twentyquestions", "wordduel", "numberduel", "prisonersdilemma", "rpsplus"],
    },
    {
      title: "Xúc xắc, bài & may rủi",
      titleKey: "grpDice",
      icon: "🎲",
      hint: "Roll, ghi điểm, domino, đấu giá kín và lật cặp nhanh gọn.",
      hintKey: "grpDiceHint",
      games: ["auctionwar", "memory", "pig", "yahtzee", "domino", "snakesladders", "liarsdice", "blackjackduel"],
    },
  ];

  // ====================== Context cho game ======================
  function makeContext(seed) {
    return {
      boardEl: el.boardWrap,
      isOnline: !!online,
      mySeat: online ? online.seat : -1,
      roomSeat: online ? online.roomSeat : -1,
      firstSeat: online ? online.firstSeat : 0,
      round: online ? online.round : 1,
      rng: window.makeRng(seed || 1),
      options: currentOptions,
      vsAI: !online && vsAI,
      aiLevel: aiLevel,
      setStatus(text) {
        el.status.textContent = text || "";
        // Tự động phát âm thanh + màn chúc mừng khi kết thúc ván
        if (window.Sound && text) {
          if (text.includes("💀")) Sound.play("lose");
          else if (text.includes("🎉")) Sound.play("win");
          else if (text.includes("🤝")) Sound.play("draw");
        }
        if (text && (text.includes("🎉") || text.includes("🤝") || text.includes("💀"))) {
          const kind = text.includes("🎉") ? "win" : text.includes("💀") ? "lose" : "draw";
          if (!resultRecorded && selectedGame && selectedGame.id) {
            resultRecorded = true;
            recordStat(selectedGame.id, kind === "draw" ? "draw" : "win", lastWinner);
            recordHistory(selectedGame.id, kind === "draw" ? "draw" : "win", lastWinner);
            recordOutcomeFlags(kind);
            if (selectedGame.id === dailyGameId()) markDailyDone();
            reportRankedResult(kind);
          }
          // Best-of-N (chỉ chung máy / đấu máy): cộng điểm trận, quyết định còn đấu tiếp không
          let matchInfo = null;
          if (bestOf > 1 && !online) matchInfo = recordMatchResult(kind);
          if (el.winOverlay.classList.contains("hidden")) {
            showWinScreen(kind, text, matchInfo);
          }
        }
      },
      setTurn(idx) {
        if (idx === -1) {
          el.turnBanner.textContent = tt("ended");
          el.turnBanner.style.color = "var(--text)";
          el.scoreP1.classList.remove("active");
          el.scoreP2.classList.remove("active");
          return;
        }
        const name = idx === 0 ? el.p1Name.textContent : el.p2Name.textContent;
        let label = tt("turnPrefix") + name;
        if (online) label += idx === online.seat ? tt("youSuffix") : tt("oppSuffix");
        el.turnBanner.textContent = label;
        el.turnBanner.style.color = idx === 0 ? "var(--p1)" : "var(--p2)";
        // sáng đèn thẻ điểm của người đang tới lượt
        el.scoreP1.classList.toggle("active", idx === 0);
        el.scoreP2.classList.toggle("active", idx === 1);
        if (vsAI && !online && idx === AI_SEAT) scheduleAI();
      },
      setNames(n1, n2) {
        el.p1Name.textContent = labelWithPlayerName(0, n1);
        el.p2Name.textContent = labelWithPlayerName(1, n2);
      },
      incScore(idx) { scores[idx]++; lastWinner = idx; renderScores(); },
      decScore(idx) { scores[idx] = Math.max(0, scores[idx] - 1); renderScores(); },
      getScore(idx) { return scores[idx]; },
      sendMove(move) {
        // Luôn ghi nước vào replay (kể cả chung máy / đấu máy) để xem lại ván;
        // chỉ relay qua mạng khi đang chơi online.
        replayMoves.push(move);
        if (online && !sessionLocked) Net.send("move", { move });
      },
      sound(name) { window.Sound && Sound.play(name); },
      t(vi, en) { return (window.I18n && I18n.getLang() === "en" && en != null) ? en : vi; },
    };
  }

  function renderScores() {
    el.p1Score.textContent = scores[0];
    el.p2Score.textContent = scores[1];
  }

  // ---- Best-of-N (chung máy / đấu máy) ----
  function matchTarget() { return Math.floor(bestOf / 2) + 1; } // 3->2, 5->3, 7->4
  function playerLabel(idx) {
    if (vsAI && !online) return idx === 0 ? tt("youName") : tt("aiName");
    return idx === 0 ? el.p1Name.textContent : el.p2Name.textContent;
  }
  // Ghi kết quả một ván vào loạt đấu; trả về thông tin để hiển thị ở màn kết thúc.
  function recordMatchResult(kind) {
    if (kind !== "draw" && lastWinner >= 0) matchWins[lastWinner]++;
    const need = matchTarget();
    matchOver = matchWins[0] >= need || matchWins[1] >= need;
    const champ = matchWins[0] >= need ? 0 : matchWins[1] >= need ? 1 : -1;
    renderMatchBadge();
    return { over: matchOver, champ, kind };
  }
  function renderMatchBadge() {
    if (!el.matchBadge) return;
    if (bestOf <= 1 || online) { el.matchBadge.classList.add("hidden"); return; }
    el.matchBadge.classList.remove("hidden");
    el.matchBadge.innerHTML = tt("matchProgress")
      .replace("{game}", matchGameNo)
      .replace("{p1}", matchWins[0])
      .replace("{p2}", matchWins[1])
      .replace("{need}", matchTarget());
  }
  function startNextMatchGame() {
    matchGameNo++;
    startGame(null);
  }

  // Máy suy nghĩ rồi đi (chặn thao tác người trong lúc chờ)
  function scheduleAI() {
    el.boardWrap.classList.add("ai-thinking");
    setTimeout(() => {
      el.boardWrap.classList.remove("ai-thinking");
      if (!vsAI || online) return;
      if (instance && typeof instance.aiMove === "function") {
        try {
          const mv = instance.aiMove(aiLevel);
          if (mv !== null && mv !== undefined) instance.applyMove(mv, false);
        } catch (e) { /* ignore AI error */ }
      }
    }, 480);
  }

  function cleanName(value, fallback = "Người chơi") {
    const name = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24);
    return name || fallback;
  }

  function loadSavedPlayerName() {
    try { return cleanName(localStorage.getItem(PLAYER_NAME_KEY) || "", ""); }
    catch { return ""; }
  }

  function savePlayerName(name) {
    try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch { /* ignore */ }
  }

  function syncNameInputs(value) {
    if (el.createNameInput && document.activeElement !== el.createNameInput) el.createNameInput.value = value;
    if (el.joinNameInput && document.activeElement !== el.joinNameInput) el.joinNameInput.value = value;
  }

  function readPlayerName(input, fallback = "Người chơi") {
    const name = cleanName(input?.value, fallback);
    if (input) input.value = name;
    savePlayerName(name);
    syncNameInputs(name);
    return name;
  }

  function setLobbyState(text, kind = "info") {
    if (!el.lobbyState) return;
    el.lobbyState.textContent = text || "";
    el.lobbyState.dataset.state = kind;
    el.lobbyState.classList.toggle("hidden", !text);
  }

  function setGameRoomState(text, kind = "info") {
    if (!el.gameRoomState) return;
    el.gameRoomState.textContent = text || "";
    el.gameRoomState.dataset.state = kind;
    el.gameRoomState.classList.toggle("hidden", !text);
  }

  function defaultSeatName(seat) {
    return tt(seat === 0 ? "player1" : "player2");
  }

  function seatName(seat) {
    return online?.playerNames?.[seat] || defaultSeatName(seat);
  }

  function opponentName() {
    return online ? seatName(1 - online.seat) : tt("opponentWord");
  }

  function labelWithPlayerName(seat, label) {
    const text = String(label || defaultSeatName(seat));
    if (!online) return text;
    const name = seatName(seat);
    const playerNo = seat + 1;
    const patterns = [
      new RegExp(`Người chơi\\s*${playerNo}`, "i"),
      new RegExp(`\\bP${playerNo}\\b`, "i"),
    ];
    if (patterns.some((pattern) => pattern.test(text))) {
      return patterns.reduce((result, pattern) => result.replace(pattern, name), text);
    }
    return `${name} - ${text}`;
  }

  function applyScoreboardNames() {
    const av = getAvatar() + " ";
    if (online) {
      el.p1Name.textContent = (online.seat === 0 ? av : "") + seatName(0);
      el.p2Name.textContent = (online.seat === 1 ? av : "") + seatName(1);
    } else {
      el.p1Name.textContent = av + tt("player1");
      el.p2Name.textContent = tt("player2");
    }
  }

  function describeOnlineGameState(kind = "live") {
    if (!online) {
      setGameRoomState("", "info");
      return;
    }
    const text = kind === "waiting"
      ? tt("roomWaiting").replace("{code}", online.code || "")
      : tt("roomPlaying").replace("{code}", online.code || "").replace("{opp}", opponentName());
    setGameRoomState(text, kind);
  }

  const savedPlayerName = loadSavedPlayerName();
  if (savedPlayerName) syncNameInputs(savedPlayerName);
  [el.createNameInput, el.joinNameInput].forEach((input) => {
    input?.addEventListener("input", () => {
      const compact = String(input.value || "").replace(/\s+/g, " ").slice(0, 24);
      if (input.value !== compact) input.value = compact;
      const name = cleanName(input.value, "");
      if (name) {
        savePlayerName(name);
        syncNameInputs(name);
      }
    });
  });

  function showToast(text) {
    const old = document.querySelector(".app-toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.className = "app-toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function clearRoomExitNotice() {
    if (roomExitTimer) {
      clearTimeout(roomExitTimer);
      roomExitTimer = null;
    }
    const notice = document.querySelector(".room-exit-notice");
    if (notice) notice.remove();
  }

  function showRoomExitNotice(message) {
    const old = document.querySelector(".room-exit-notice");
    if (old) old.remove();

    const notice = document.createElement("div");
    notice.className = "room-exit-notice";
    notice.innerHTML = `
      <div class="room-exit-card" role="alert" aria-live="assertive">
        <h2>${tt("noticeTitle")}</h2>
        <p>${escapeHtml(message)}</p>
        <span>${tt("returningMenu")}</span>
      </div>
    `;
    document.body.appendChild(notice);
    setTimeout(() => notice.classList.add("show"), 10);
  }

  function clearSessionLock() {
    sessionLocked = false;
    el.boardWrap.classList.remove("session-locked");
    const lock = el.boardWrap.querySelector(".session-lock");
    if (lock) lock.remove();
  }

  function lockOnlineSession(message) {
    if (!online) return;
    if (sessionLocked) return;
    sessionLocked = true;
    restartReadySeats = [];
    updateRestartButtons();
    el.restartBtn.disabled = true;
    el.winAgain.disabled = true;
    el.status.textContent = message;
    el.turnBanner.textContent = tt("stopped");
    el.scoreP1.classList.remove("active");
    el.scoreP2.classList.remove("active");
    if (instance && typeof instance.destroy === "function") instance.destroy();
    instance = null;
    el.boardWrap.innerHTML = "";
    el.boardWrap.classList.add("session-locked");

    const lock = document.createElement("div");
    lock.className = "session-lock";
    el.boardWrap.appendChild(lock);
    lock.textContent = message;
    showToast(message);
    window.Sound && Sound.play("notify");
  }

  function stopOnlineSessionAndReturn(message) {
    if (!online) return;
    reconnecting = false;
    Net.disconnect();
    lockOnlineSession(message);
    showRoomExitNotice(message);
    if (roomExitTimer) clearTimeout(roomExitTimer);
    roomExitTimer = setTimeout(() => {
      roomExitTimer = null;
      clearRoomExitNotice();
      goHome();
    }, 1700);
  }

  function getGameById(id) {
    return GameRegistry.games.find((g) => g.id === id) || null;
  }

  // Tên/mô tả game theo ngôn ngữ (en nếu có bản dịch, không thì tiếng Việt gốc)
  function gameName(g) {
    if (!g) return "";
    if (window.I18n && I18n.getLang() === "en" && window.GAMES_EN && GAMES_EN[g.id]) return GAMES_EN[g.id].name;
    return g.name;
  }
  function gameDesc(g) {
    if (!g) return "";
    if (window.I18n && I18n.getLang() === "en" && window.GAMES_EN && GAMES_EN[g.id]) return GAMES_EN[g.id].description;
    return g.description || "";
  }
  function gameHowTo(g) {
    if (!g) return [];
    if (window.I18n && I18n.getLang() === "en" && window.GAMES_EN && GAMES_EN[g.id] && GAMES_EN[g.id].howTo) return GAMES_EN[g.id].howTo;
    return g.howTo || [];
  }

  const GAME_MARKS = {
    auctionwar: "AW",
    artillery: "AR",
    basedefenseduel: "BD",
    battleship: "BS",
    bullscows: "BC",
    checkers: "CK",
    connectfour: "C4",
    coopdefense: "CD",
    crystalconquest: "CC",
    dicebattle: "DB",
    domino: "DM",
    dotsandboxes: "DX",
    dungeonrival: "DR",
    fishingfrenzy: "🎣",
    gomoku: "5",
    hangman: "HM",
    hex: "HX",
    hiddenassassin: "HA",
    hunterswarm: "HS",
    isolation: "IS",
    laserchess: "LC",
    mancala: "MC",
    memory: "MM",
    minesweeper: "MS",
    morris: "MR",
    nim: "NM",
    noitu: "NT",
    orderchaos: "OC",
    pathlockduel: "PD",
    pentago: "PG",
    pig: "P",
    pong: "PN",
    poolbattle: "PB",
    quoridor: "QD",
    reversi: "RV",
    robotfactorywar: "RF",
    seabattleplus: "SB",
    slingshotbattle: "SL",
    stratego: "ST",
    submarinehunt: "SH",
    tankarena: "TA",
    territorywar: "TW",
    tictactoe: "XO",
    timeloopduel: "TL",
    trapmansion: "TM",
    treasure: "TR",
    yahtzee: "YZ",
  };

  function gameMark(game) {
    if (GAME_MARKS[game.id]) return GAME_MARKS[game.id];
    return game.name
      .replace(/\([^)]*\)/g, "")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function gameIconHtml(game, extraClass = "") {
    const mark = gameMark(game);
    return `<span class="game-icon game-icon-${game.id} ${extraClass}" data-mark="${mark}" aria-hidden="true"></span>`;
  }

  // ====================== Yêu thích / Gần đây / Lượt chơi ======================
  const FAV_KEY = "tpg_favorites";
  const RECENT_KEY = "tpg_recent";
  const PLAYS_KEY = "tpg_plays";
  const NEW_IDS = new Set(["tictactoe", "memory", "pong", "tankarena", "dicebattle", "territorywar", "crystalconquest", "yahtzee"]);
  const DEFAULT_HOT = ["gomoku", "connectfour", "checkers", "battleship", "reversi", "pentago"];

  function loadList(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function saveList(key, arr) { try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* ignore */ } }
  function getFavorites() { return loadList(FAV_KEY); }
  function isFav(id) { return getFavorites().includes(id); }
  function toggleFav(id) {
    const f = getFavorites();
    const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.unshift(id);
    saveList(FAV_KEY, f);
  }
  function getRecent() { return loadList(RECENT_KEY); }
  function pushRecent(id) {
    let r = getRecent().filter((x) => x !== id);
    r.unshift(id);
    saveList(RECENT_KEY, r.slice(0, 12));
  }
  function getPlays() { try { return JSON.parse(localStorage.getItem(PLAYS_KEY)) || {}; } catch (e) { return {}; } }
  function incPlay(id) {
    const p = getPlays();
    p[id] = (p[id] || 0) + 1;
    try { localStorage.setItem(PLAYS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  const STATS_KEY = "tpg_stats";
  const AVATAR_KEY = "tpg_avatar";
  const FLAGS_KEY = "tpg_flags";
  const AVATARS = ["🎮", "😀", "😎", "🐱", "🐶", "🦊", "🐼", "🦁", "🐯", "🐸", "🦄", "🤖", "👾", "🐲", "🦖", "🐙", "🦋", "🌟", "🔥", "⚡", "🍀", "♟️", "🎲", "🏆"];
  function getAvatar() { try { return localStorage.getItem(AVATAR_KEY) || "🎮"; } catch (e) { return "🎮"; } }
  function setAvatar(a) { try { localStorage.setItem(AVATAR_KEY, a); } catch (e) { /* ignore */ } }
  function getFlags() { try { return JSON.parse(localStorage.getItem(FLAGS_KEY)) || {}; } catch (e) { return {}; } }
  function saveFlags(f) { try { localStorage.setItem(FLAGS_KEY, JSON.stringify(f)); } catch (e) { /* ignore */ } }
  function recordOutcomeFlags(kind) {
    if (kind === "draw") return;
    const f = getFlags();
    if (vsAI && lastWinner === 0) { const k = "ai_" + aiLevel; f[k] = (f[k] || 0) + 1; }
    if (online && lastWinner === online.seat) { f.onlineWins = (f.onlineWins || 0) + 1; }
    saveFlags(f);
  }

  const ACHIEVEMENTS = [
    { id: "first", icon: "🎯", titleKey: "achFirstT", descKey: "achFirstD", done: (a) => a.totalPlayed >= 1 },
    { id: "play10", icon: "🎮", titleKey: "achPlay10T", descKey: "achPlay10D", done: (a) => a.totalPlayed >= 10 },
    { id: "play50", icon: "🔥", titleKey: "achPlay50T", descKey: "achPlay50D", done: (a) => a.totalPlayed >= 50 },
    { id: "try10", icon: "🧭", titleKey: "achTry10T", descKey: "achTry10D", done: (a) => a.tried >= 10 },
    { id: "try25", icon: "🗺️", titleKey: "achTry25T", descKey: "achTry25D", done: (a) => a.tried >= 25 },
    { id: "tryAll", icon: "🏅", titleKey: "achTryAllT", descKey: "achTryAllD", done: (a) => a.tried >= a.totalGames },
    { id: "win10", icon: "🏆", titleKey: "achWin10T", descKey: "achWin10D", done: (a) => a.p1 >= 10 },
    { id: "win25", icon: "👑", titleKey: "achWin25T", descKey: "achWin25D", done: (a) => a.p1 >= 25 },
    { id: "aiHard", icon: "🤖", titleKey: "achAiHardT", descKey: "achAiHardD", done: (a) => (a.flags.ai_hard || 0) >= 1 },
    { id: "aiHard5", icon: "💀", titleKey: "achAiHard5T", descKey: "achAiHard5D", done: (a) => (a.flags.ai_hard || 0) >= 5 },
    { id: "online1", icon: "🌐", titleKey: "achOnline1T", descKey: "achOnline1D", done: (a) => (a.flags.onlineWins || 0) >= 1 },
    { id: "fav3", icon: "❤️", titleKey: "achFav3T", descKey: "achFav3D", done: (a) => a.favCount >= 3 },
    { id: "daily3", icon: "📅", titleKey: "achDaily3T", descKey: "achDaily3D", done: (a) => (a.flags.dailyBest || 0) >= 3 },
    { id: "daily7", icon: "🗓️", titleKey: "achDaily7T", descKey: "achDaily7D", done: (a) => (a.flags.dailyBest || 0) >= 7 },
  ];

  function computeAgg() {
    const stats = getStats();
    let totalPlayed = 0, tried = 0, p1 = 0, p2 = 0, draw = 0, topId = null, topN = 0;
    Object.keys(stats).forEach((id) => {
      const s = stats[id];
      if (s.played > 0) { tried++; totalPlayed += s.played; p1 += s.p1; p2 += s.p2; draw += s.draw; }
      if (s.played > topN) { topN = s.played; topId = id; }
    });
    return { totalPlayed, tried, p1, p2, draw, topId, topN, totalGames: GameRegistry.games.length, flags: getFlags(), favCount: getFavorites().length };
  }

  function updateProfileChip() {
    if (el.chipAvatar) el.chipAvatar.textContent = getAvatar();
    if (el.chipName) el.chipName.textContent = loadSavedPlayerName() || tt("youName");
  }

  function openProfile() {
   try {
    const a = computeAgg();
    el.profileAvatar.textContent = getAvatar();
    el.profileName.value = loadSavedPlayerName() || "";
    // avatar picker
    el.avatarPicker.innerHTML = "";
    AVATARS.forEach((av) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-opt" + (av === getAvatar() ? " on" : "");
      b.textContent = av;
      b.addEventListener("click", () => {
        setAvatar(av);
        el.profileAvatar.textContent = av;
        updateProfileChip();
        [...el.avatarPicker.children].forEach((c) => c.classList.toggle("on", c.textContent === av));
      });
      el.avatarPicker.appendChild(b);
    });
    // stats
    const decided = a.p1 + a.p2;
    const rate = decided ? Math.round(a.p1 / decided * 100) : 0;
    const topName = a.topId ? (getGameById(a.topId) ? getGameById(a.topId).name : a.topId) : "—";
    el.profileStats.innerHTML = [
      ["🎮", a.totalPlayed, tt("pstatTotal")],
      ["🕹️", `${a.tried}/${a.totalGames}`, tt("pstatTried")],
      ["🏆", a.p1, tt("pstatWinP1")],
      ["⚔️", a.p2, tt("pstatWinP2")],
      ["📈", decided ? rate + "%" : "—", tt("pstatRate")],
      ["⭐", topName, tt("pstatTop")],
    ].map(([ic, v, lb]) => `<div class="pstat"><span class="pstat-ic">${ic}</span><b>${v}</b><small>${lb}</small></div>`).join("");
    // các widget phụ — lỗi 1 cái không được chặn việc mở trang hồ sơ
    try { renderLeaderboard(); } catch (e) { /* ignore */ }
    try { renderActivityChart(); } catch (e) { /* ignore */ }
    // achievements
    el.achGrid.innerHTML = ACHIEVEMENTS.map((ac) => {
      const done = ac.done(a);
      return `<div class="ach ${done ? "done" : "locked"}"><span class="ach-ic">${done ? ac.icon : "🔒"}</span><div class="ach-txt"><b>${tt(ac.titleKey)}</b><small>${tt(ac.descKey)}</small></div></div>`;
    }).join("");
    try { renderHistory(); } catch (e) { /* ignore */ }
    // cài đặt âm thanh
    if (el.volRange) el.volRange.value = String(Math.round(Sound.getVolume() * 100));
    if (el.sfxToggle) el.sfxToggle.checked = Sound.isEnabled();
    if (el.musicToggle) el.musicToggle.checked = Sound.isMusicOn();
   } catch (e) {
    /* dù có lỗi khi dựng nội dung, vẫn mở trang hồ sơ */
   }
    show("profileView");
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return tt("timeNow");
    const m = Math.floor(s / 60);
    if (m < 60) return tt("timeMin").replace("{n}", m);
    const h = Math.floor(m / 60);
    if (h < 24) return tt("timeHour").replace("{n}", h);
    const d = Math.floor(h / 24);
    if (d < 7) return tt("timeDay").replace("{n}", d);
    return new Date(ts).toLocaleDateString(window.I18n && I18n.getLang() === "en" ? "en-US" : "vi-VN");
  }
  function renderLeaderboard() {
    if (!el.leadList) return;
    const stats = getStats();
    const rows = (window.StatsUtil ? StatsUtil.sortLeaderboard(stats) : []).slice(0, 10);
    if (!rows.length) {
      el.leadList.innerHTML = `<div class="lead-empty">${tt("leadEmpty")}</div>`;
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    el.leadList.innerHTML = rows.map((r, i) => {
      const g = getGameById(r.id);
      const name = gameName(g) || r.id;
      const decided = r.p1 + r.p2;
      const rate = decided ? Math.round(r.p1 / decided * 100) : 0;
      const rank = medals[i] || `<b class="lead-num">${i + 1}</b>`;
      return `<div class="lead-item">
        <span class="lead-rank">${rank}</span>
        <span class="lead-name">${escapeHtml(name)}</span>
        <span class="lead-stat" title="${tt("leadWinP1")}">🏆 ${r.p1}</span>
        <span class="lead-stat" title="${tt("leadBestStreak")}">🔥 ${r.bestStreak || 0}</span>
        <span class="lead-stat lead-rate" title="${tt("leadRate")}">${rate}%</span>
      </div>`;
    }).join("");
  }

  function modeLabel(mode) {
    return mode === "local" ? tt("modeLabelLocal") : mode === "ai" ? tt("modeLabelAI") : mode === "online" ? tt("modeLabelOnline") : "";
  }
  function histOutcome(h) {
    return window.StatsUtil ? StatsUtil.histOutcome(h) : (h && h.kind === "draw" ? "draw" : "win");
  }
  function renderActivityChart() {
    if (!el.activityChart) return;
    const days = 14;
    const now = new Date();
    const buckets = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      buckets.push({ label: d.getDate() + "/" + (d.getMonth() + 1), ymd: window.StatsUtil ? StatsUtil.dateKey(d) : (d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate()), win: 0, lose: 0, draw: 0 });
    }
    const byYmd = {};
    buckets.forEach((b) => { byYmd[b.ymd] = b; });
    getHistory().forEach((h) => {
      const d = new Date(h.ts);
      const key = window.StatsUtil ? StatsUtil.dateKey(d) : (d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate());
      const b = byYmd[key];
      if (b) b[histOutcome(h)]++;
    });
    const maxTotal = Math.max(1, ...buckets.map((b) => b.win + b.lose + b.draw));
    el.activityChart.innerHTML = buckets.map((b) => {
      const total = b.win + b.lose + b.draw;
      const h = Math.round(total / maxTotal * 100);
      const seg = (n, cls) => n ? `<i class="ac-seg ${cls}" style="height:${Math.round(n / total * 100)}%"></i>` : "";
      return `<div class="ac-col" title="${b.label}: ${total} ${tt("acMatches")} (W${b.win}/L${b.lose}/D${b.draw})">
        <div class="ac-bar" style="height:${h}%">${total ? seg(b.win, "win") + seg(b.draw, "draw") + seg(b.lose, "lose") : ""}</div>
        <small>${b.label.split("/")[0]}</small>
      </div>`;
    }).join("");
  }
  function buildHistGameFilter(list) {
    if (!el.histGameFilter) return;
    const prev = el.histGameFilter.value;
    const ids = [...new Set(list.map((h) => h.id))];
    const opts = [`<option value="">${tt("filterAllGames")}</option>`].concat(
      ids.map((id) => {
        const g = getGameById(id);
        return `<option value="${escapeHtml(id)}">${escapeHtml(gameName(g) || id)}</option>`;
      }));
    el.histGameFilter.innerHTML = opts.join("");
    if (ids.includes(prev) || prev === "") el.histGameFilter.value = prev;
  }
  function renderHistory() {
    if (!el.histList) return;
    const all = getHistory();
    const replays = getReplays();
    buildHistGameFilter(all);
    const gf = el.histGameFilter ? el.histGameFilter.value : "";
    const mf = el.histModeFilter ? el.histModeFilter.value : "";
    const list = all.filter((h) => (!gf || h.id === gf) && (!mf || h.mode === mf));
    if (!all.length) {
      el.histList.innerHTML = `<div class="hist-empty">${tt("histEmpty")}</div>`;
      return;
    }
    if (!list.length) {
      el.histList.innerHTML = `<div class="hist-empty">${tt("histNoMatch")}</div>`;
      return;
    }
    el.histList.innerHTML = list.map((h) => {
      const g = getGameById(h.id);
      const name = gameName(g) || h.id;
      // Kết quả theo góc nhìn người chơi
      let res, cls;
      if (h.kind === "draw") { res = tt("resDraw"); cls = "draw"; }
      else if (h.mode === "ai") {
        const win = h.winner === 0;
        res = win ? tt("resYouWin") : tt("resAILose");
        cls = win ? "win" : "lose";
      } else if (h.mode === "online" && typeof h.seat === "number") {
        const win = h.winner === h.seat;
        res = win ? tt("resYouWin") : tt("resYouLose");
        cls = win ? "win" : "lose";
      } else {
        res = tt("resPlayerWin").replace("{n}", (h.winner ?? 0) + 1);
        cls = "win";
      }
      const modeTxt = modeLabel(h.mode);
      const lvl = h.level ? ` · ${h.level === "easy" ? tt("lvlEasy") : h.level === "hard" ? tt("lvlHard") : tt("lvlNormal")}` : "";
      const canReplay = h.replayId && ReplayStore.getReplay(replays, h.replayId);
      const replayBtn = canReplay
        ? `<button type="button" class="btn small hist-replay" data-rid="${escapeHtml(h.replayId)}">${tt("histReplay")}</button>`
        : "";
      return `<div class="hist-item ${cls}">
        <span class="hist-game">${escapeHtml(name)}</span>
        <span class="hist-res">${res}</span>
        <span class="hist-meta">${modeTxt}${lvl} · ${timeAgo(h.ts)}</span>
        ${replayBtn}
      </div>`;
    }).join("");
  }
  function getStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) { return {}; } }
  function statOf(id) { return getStats()[id] || { played: 0, p1: 0, p2: 0, draw: 0 }; }
  function recordStat(id, kind, winner) {
    const all = getStats();
    const s = all[id] || { played: 0, p1: 0, p2: 0, draw: 0, streak: 0, bestStreak: 0 };
    s.played++;
    if (kind === "draw") { s.draw++; s.streak = 0; }
    else if (winner === 0) { s.p1++; s.streak = (s.streak || 0) + 1; if (s.streak > (s.bestStreak || 0)) s.bestStreak = s.streak; }
    else if (winner === 1) { s.p2++; s.streak = 0; }
    all[id] = s;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }

  const HISTORY_KEY = "tpg_history";
  function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; } }
  function recordHistory(id, kind, winner) {
    const mode = online ? "online" : vsAI ? "ai" : "local";
    const entry = { id, kind, winner, mode, ts: Date.now() };
    if (online) entry.seat = online.seat;
    if (vsAI) entry.level = aiLevel;
    // Lưu replay (để xem lại sau) nếu ván có chuỗi nước đi.
    if (replayMeta && replayMoves.length) {
      const rid = ReplayStore.makeReplayId(Date.now(), Math.random());
      saveReplayData(rid, {
        id: replayMeta.gameId, seed: replaySeed,
        firstSeat: replayMeta.firstSeat, round: replayMeta.round,
        options: replayMeta.options, moves: replayMoves.slice(),
        mode, kind, winner, seat: online ? online.seat : undefined, ts: entry.ts,
      });
      entry.replayId = rid;
    }
    const list = getHistory();
    list.unshift(entry);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* ignore */ }
  }

  // ----- Replay đã lưu (xem lại ván sau này) -----
  const REPLAYS_KEY = "tpg_replays";
  const MAX_REPLAYS = 20;
  function getReplays() { try { return JSON.parse(localStorage.getItem(REPLAYS_KEY)) || {}; } catch (e) { return {}; } }
  function saveReplayData(rid, data) {
    // logic giữ MAX_REPLAYS bản mới nhất nằm trong ReplayStore (đã có unit test)
    const kept = ReplayStore.addReplay(getReplays(), rid, data, MAX_REPLAYS);
    try { localStorage.setItem(REPLAYS_KEY, JSON.stringify(kept)); } catch (e) { /* ignore */ }
  }
  // Mở lại một replay đã lưu bằng đúng bộ máy replay sẵn có.
  function openSavedReplay(rid) {
    const data = ReplayStore.getReplay(getReplays(), rid);
    if (!data) return;
    replayMoves = data.moves.slice();
    replaySeed = data.seed || 1;
    replayMeta = { gameId: data.id, firstSeat: data.firstSeat || 0, round: data.round || 1, options: data.options || {} };
    openReplay();
  }

  // ====================== Thử thách hằng ngày ======================
  const DAILY_KEY = "tpg_daily";
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function yesterdayStr() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dailyGameId() {
    const games = GameRegistry.games;
    if (!games.length) return null;
    const idx = window.StatsUtil ? StatsUtil.dailyIndex(todayStr(), games.length) : 0;
    return games[idx < 0 ? 0 : idx].id;
  }
  function getDaily() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) { return {}; } }
  function saveDaily(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  function dailyDoneToday() { return getDaily().lastDone === todayStr(); }
  function markDailyDone() {
    if (dailyDoneToday()) return;
    const d = getDaily();
    d.streak = d.lastDone === yesterdayStr() ? (d.streak || 0) + 1 : 1;
    d.lastDone = todayStr();
    if (!d.best || d.streak > d.best) d.best = d.streak;
    saveDaily(d);
    // cờ cho thành tích
    const f = getFlags();
    f.dailyBest = d.best;
    f.dailyTotal = (f.dailyTotal || 0) + 1;
    saveFlags(f);
    showToast(tt("dailyDoneToast").replace("{n}", d.streak));
    window.Sound && Sound.play("win");
  }
  function renderDailyBanner() {
    if (!el.dailyBanner) return;
    const id = dailyGameId();
    const game = id ? getGameById(id) : null;
    if (!game) { el.dailyBanner.classList.add("hidden"); return; }
    const d = getDaily();
    const done = dailyDoneToday();
    const streak = d.streak && d.lastDone && (d.lastDone === todayStr() || d.lastDone === yesterdayStr()) ? d.streak : 0;
    el.dailyBanner.classList.remove("hidden");
    el.dailyBanner.innerHTML =
      `<div class="daily-left">` +
        `<div class="daily-poster">${gameAvatarHtml(game)}</div>` +
        `<div class="daily-text">` +
          `<span class="daily-tag">${tt("dailyTag")}${streak ? ` · ${tt("dailyStreak").replace("{n}", streak)}` : ""}</span>` +
          `<b>${escapeHtml(gameName(game))}</b>` +
          `<small>${done ? tt("dailyDone") : tt("dailyTodo")}</small>` +
        `</div>` +
      `</div>` +
      `<button class="btn primary daily-play" type="button">${done ? tt("playAgain") : tt("playNow")}</button>`;
    const btn = el.dailyBanner.querySelector(".daily-play");
    if (btn) btn.addEventListener("click", () => openDetail(game));
  }
  function isHot(id) {
    const plays = getPlays();
    const top = Object.entries(plays).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
    if (top.length >= 3) return top.includes(id);
    return DEFAULT_HOT.includes(id);
  }
  function isNew(id) { return NEW_IDS.has(id) && !getPlays()[id]; }
  function hashHue(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }

  function gameAvatarHtml(game) {
    const hue = hashHue(game.id);
    return `<div class="game-poster" style="--ph:${hue}" aria-hidden="true">` +
      `<span class="poster-emoji">${game.emoji || "🎮"}</span>` +
      `<span class="poster-mark">${escapeHtml(gameMark(game))}</span>` +
      `</div>`;
  }

  // Bộ render avatar dạng SVG riêng cho từng game — giữ lại làm renderer thay thế
  // (hiện UI dùng gameAvatarHtml/.game-poster). Đừng xóa: còn dùng cho biến thể giao diện.
  // eslint-disable-next-line no-unused-vars
  function gameAvatarHtmlSvg(game) {
    return `<div class="game-avatar game-avatar-${game.id}" aria-hidden="true">${renderGameAvatar(game.id, gameMark(game))}</div>`;
  }

  function renderGameAvatar(id, rawMark) {
    const mark = escapeHtml(rawMark);
    const p = avatarPalette(id);
    const gid = "ga-" + id.replace(/[^a-z0-9_-]/gi, "");
    return `
      <svg class="game-avatar-svg" viewBox="0 0 240 132" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="${gid}-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${p.bg1}"/>
            <stop offset="1" stop-color="${p.bg2}"/>
          </linearGradient>
          <radialGradient id="${gid}-glow" cx="76%" cy="18%" r="70%">
            <stop offset="0" stop-color="${p.b}" stop-opacity=".45"/>
            <stop offset="1" stop-color="${p.b}" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="240" height="132" rx="12" fill="url(#${gid}-bg)"/>
        <rect width="240" height="132" rx="12" fill="url(#${gid}-glow)"/>
        <circle cx="206" cy="20" r="46" fill="${p.c}" opacity=".12"/>
        <path d="M0 105 C46 82 71 126 124 100 S198 75 240 93 V132 H0 Z" fill="#ffffff" opacity=".06"/>
        ${avatarScene(id, p)}
        <rect x="13" y="13" width="50" height="32" rx="8" fill="#0b1026" opacity=".78" stroke="#ffffff" stroke-opacity=".18"/>
        <text x="38" y="34" text-anchor="middle" font-size="16" font-weight="900" fill="${p.a}" font-family="Segoe UI, Arial, sans-serif">${mark}</text>
      </svg>
    `;
  }

  function avatarPalette(id) {
    const board = ["tictactoe", "gomoku", "connectfour", "reversi", "pentago", "morris", "checkers", "isolation", "laserchess", "pathlockduel", "hunterswarm", "hex", "quoridor", "mancala", "dotsandboxes", "orderchaos", "nim", "stratego"];
    const map = ["tankarena", "dicebattle", "territorywar", "crystalconquest"];
    const action = ["pong", "poolbattle", "slingshotbattle", "timeloopduel", "artillery", "fishingfrenzy"];
    const long = ["basedefenseduel", "robotfactorywar", "dungeonrival"];
    const hidden = ["battleship", "seabattleplus", "submarinehunt", "hiddenassassin", "trapmansion", "minesweeper", "treasure", "bullscows", "hangman", "noitu"];
    if (id === "auctionwar") return { a: "#ffd166", b: "#6ee7b7", c: "#ff5d73", bg1: "#202747", bg2: "#12162f" };
    if (map.includes(id)) return { a: "#6ee7b7", b: "#4dd0e1", c: "#ffd166", bg1: "#17304b", bg2: "#11182f" };
    if (action.includes(id)) return { a: "#ffd166", b: "#ff5d73", c: "#6ee7b7", bg1: "#2c254c", bg2: "#11142d" };
    if (long.includes(id) || id === "coopdefense") return { a: "#ff9f7a", b: "#6ee7b7", c: "#ffd166", bg1: "#2d2946", bg2: "#14172e" };
    if (hidden.includes(id)) return { a: "#c6a7ff", b: "#4dd0e1", c: "#ffd166", bg1: "#17243f", bg2: "#11142b" };
    if (board.includes(id)) return { a: "#ffd166", b: "#4dd0e1", c: "#ff5d73", bg1: "#242c5b", bg2: "#12152e" };
    return { a: "#ffd166", b: "#4dd0e1", c: "#ff5d73", bg1: "#202747", bg2: "#12162f" };
  }

  function avatarScene(id, p) {
    const line = `stroke="#ffffff" stroke-opacity=".18" stroke-width="2"`;
    switch (id) {
      case "tictactoe":
        return `<g transform="translate(88 24)"><rect width="108" height="84" rx="10" fill="#0d1430" opacity=".72"/><path d="M36 10v64M72 10v64M10 28h88M10 56h88" ${line}/><text x="20" y="24" fill="${p.a}" font-size="24" font-weight="900">X</text><circle cx="55" cy="20" r="10" fill="none" stroke="${p.b}" stroke-width="5"/><text x="80" y="50" fill="${p.c}" font-size="25" font-weight="900">X</text><circle cx="22" cy="66" r="10" fill="none" stroke="${p.b}" stroke-width="5"/></g>`;
      case "gomoku":
        return `<g transform="translate(78 23)"><rect width="124" height="86" rx="10" fill="#1c2445"/><path d="M16 16h92M16 34h92M16 52h92M16 70h92M16 16v54M39 16v54M62 16v54M85 16v54M108 16v54" ${line}/><circle cx="39" cy="34" r="9" fill="${p.a}"/><circle cx="62" cy="34" r="9" fill="${p.a}"/><circle cx="85" cy="34" r="9" fill="${p.a}"/><circle cx="108" cy="34" r="9" fill="${p.a}"/><circle cx="62" cy="52" r="9" fill="${p.b}"/></g>`;
      case "connectfour":
        return `<g transform="translate(78 22)"><rect width="126" height="88" rx="12" fill="#1d3d74"/><g fill="#0b1026">${[0,1,2,3,4,5,6].map((c)=>[0,1,2,3].map((r)=>`<circle cx="${15+c*16}" cy="${18+r*16}" r="6"/>`).join("")).join("")}</g><circle cx="31" cy="66" r="6" fill="${p.a}"/><circle cx="47" cy="66" r="6" fill="${p.a}"/><circle cx="63" cy="66" r="6" fill="${p.a}"/><circle cx="79" cy="66" r="6" fill="${p.a}"/><circle cx="47" cy="50" r="6" fill="${p.c}"/><circle cx="63" cy="50" r="6" fill="${p.c}"/></g>`;
      case "reversi":
        return `<g transform="translate(82 24)"><rect width="116" height="84" rx="10" fill="#14533d"/><path d="M29 8v68M58 8v68M87 8v68M8 28h100M8 56h100" ${line}/><circle cx="30" cy="28" r="13" fill="#f4f1dd"/><circle cx="58" cy="28" r="13" fill="#0b1026"/><circle cx="58" cy="56" r="13" fill="#f4f1dd"/><circle cx="86" cy="56" r="13" fill="#0b1026"/><path d="M31 19c16 9 16 22 0 32" fill="none" stroke="${p.a}" stroke-width="4"/></g>`;
      case "pentago":
        return `<g transform="translate(81 23)"><rect width="116" height="86" rx="10" fill="#172143"/><path d="M58 8v70M8 43h100" ${line}/><circle cx="29" cy="23" r="8" fill="${p.a}"/><circle cx="45" cy="23" r="8" fill="${p.b}"/><circle cx="29" cy="61" r="8" fill="${p.c}"/><circle cx="82" cy="61" r="8" fill="${p.a}"/><path d="M77 20a18 18 0 1 1-12 31" fill="none" stroke="${p.a}" stroke-width="5"/><path d="M66 51l-10 0l5 9" fill="${p.a}"/></g>`;
      case "morris":
        return `<g transform="translate(80 20)"><rect width="120" height="92" rx="10" fill="#151d3d"/><path d="M18 14h84v64H18zM38 30h44v32H38zM60 14v64M18 46h84" fill="none" stroke="${p.b}" stroke-width="3" opacity=".8"/><circle cx="18" cy="14" r="6" fill="${p.a}"/><circle cx="60" cy="14" r="6" fill="${p.a}"/><circle cx="102" cy="14" r="6" fill="${p.a}"/><circle cx="38" cy="62" r="6" fill="${p.c}"/><circle cx="82" cy="30" r="6" fill="${p.c}"/></g>`;
      case "checkers":
        return `<g transform="translate(82 24)"><rect width="112" height="84" rx="10" fill="#0b1026"/><g>${[0,1,2,3].map((r)=>[0,1,2,3,4].map((c)=>`<rect x="${8+c*20+(r%2)*10}" y="${8+r*17}" width="10" height="17" fill="${(r+c)%2?p.b:p.a}" opacity=".42"/>`).join("")).join("")}</g><circle cx="38" cy="32" r="12" fill="${p.c}"/><circle cx="72" cy="54" r="12" fill="${p.a}"/></g>`;
      case "isolation":
        return `<g transform="translate(80 22)"><rect width="120" height="88" rx="10" fill="#121a36"/><path d="M20 12v64M40 12v64M60 12v64M80 12v64M100 12v64M10 24h100M10 44h100M10 64h100" ${line}/><rect x="42" y="24" width="18" height="18" rx="4" fill="#ffffff" opacity=".1"/><rect x="62" y="44" width="18" height="18" rx="4" fill="#ffffff" opacity=".1"/><rect x="82" y="24" width="18" height="18" rx="4" fill="#ffffff" opacity=".1"/><circle cx="20" cy="24" r="11" fill="${p.c}"/><circle cx="100" cy="64" r="11" fill="${p.b}"/><path d="M20 24L40 44L60 64" fill="none" stroke="${p.a}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 44l-9 0l5 8" fill="${p.a}"/></g>`;
      case "laserchess":
        return `<g transform="translate(76 22)"><rect width="128" height="88" rx="10" fill="#111936"/><path d="M18 14v60M42 14v60M66 14v60M90 14v60M114 14v60M8 26h112M8 50h112M8 74h112" ${line}/><path d="M18 74H66L90 50H114" fill="none" stroke="${p.a}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="54" y="37" width="26" height="8" rx="4" fill="${p.b}" transform="rotate(-45 67 41)"/><rect x="82" y="18" width="26" height="8" rx="4" fill="${p.c}" transform="rotate(45 95 22)"/><circle cx="18" cy="74" r="11" fill="${p.c}"/><path d="M14 66h8l-4-12z" fill="#12152e"/><path d="M107 43l14 14l-14 14l-14-14z" fill="${p.b}"/></g>`;
      case "pathlockduel":
        return `<g transform="translate(76 22)"><rect width="128" height="88" rx="10" fill="#101a34"/><path d="M18 14v60M42 14v60M66 14v60M90 14v60M114 14v60M8 26h112M8 50h112M8 74h112" ${line}/><path d="M18 50H42V26H66V50H90V74H114" fill="none" stroke="${p.a}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 74V50H66H90V26H114" fill="none" stroke="${p.b}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><rect x="52" y="36" width="28" height="28" rx="5" fill="${p.c}" opacity=".9"/><path d="M58 50h16M66 42v16" stroke="#11142b" stroke-width="5" stroke-linecap="round"/><circle cx="18" cy="50" r="8" fill="${p.c}"/><circle cx="114" cy="74" r="8" fill="${p.a}"/></g>`;
      case "hunterswarm":
        return `<g transform="translate(76 22)"><rect width="128" height="88" rx="10" fill="#111936"/><path d="M18 14v60M42 14v60M66 14v60M90 14v60M114 14v60M8 26h112M8 50h112M8 74h112" ${line}/><circle cx="54" cy="50" r="15" fill="${p.a}"/><circle cx="88" cy="50" r="15" fill="${p.a}"/><text x="54" y="57" text-anchor="middle" font-size="18" font-weight="900" fill="#10142b">H</text><text x="88" y="57" text-anchor="middle" font-size="18" font-weight="900" fill="#10142b">H</text><g fill="${p.b}" opacity=".92">${[0,1,2,3,4].map((i)=>`<circle cx="${24+i*20}" cy="20" r="6"/><circle cx="${24+i*20}" cy="80" r="6"/>`).join("")}<circle cx="18" cy="50" r="6"/><circle cx="116" cy="50" r="6"/></g><path d="M18 50C38 36 50 35 66 50S94 65 116 50" fill="none" stroke="${p.c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="7 6"/></g>`;
      case "hex":
        return `<g transform="translate(84 22)" fill="none" stroke-width="3">${[0,1,2].map((r)=>[0,1,2,3].map((c)=>`<path d="M${18+c*25+r*12} ${20+r*21}l10 6v12l-10 6l-10-6v-12z" fill="${(r+c)%2?p.a:p.b}" opacity=".85"/>`).join("")).join("")}<path d="M16 85h90" stroke="${p.a}"/><path d="M118 15v78" stroke="${p.b}"/></g>`;
      case "quoridor":
        return `<g transform="translate(82 21)"><rect width="116" height="90" rx="10" fill="#172143"/><path d="M18 14h80M18 34h80M18 54h80M18 74h80M18 14v60M38 14v60M58 14v60M78 14v60M98 14v60" ${line}/><rect x="36" y="30" width="44" height="6" rx="3" fill="${p.a}"/><rect x="76" y="50" width="6" height="28" rx="3" fill="${p.c}"/><circle cx="38" cy="54" r="9" fill="${p.b}"/><circle cx="78" cy="34" r="9" fill="${p.a}"/></g>`;
      case "mancala":
        return `<g transform="translate(74 31)"><rect width="136" height="70" rx="28" fill="#7b5a36"/><ellipse cx="18" cy="35" rx="12" ry="24" fill="#3b291c"/><ellipse cx="118" cy="35" rx="12" ry="24" fill="#3b291c"/><g fill="#261812">${[0,1,2,3,4,5].map((i)=>`<ellipse cx="${36+i*13}" cy="27" rx="6" ry="9"/><ellipse cx="${36+i*13}" cy="45" rx="6" ry="9"/>`).join("")}</g><circle cx="50" cy="26" r="3" fill="${p.a}"/><circle cx="63" cy="45" r="3" fill="${p.b}"/><circle cx="89" cy="27" r="3" fill="${p.c}"/></g>`;
      case "dotsandboxes":
        return `<g transform="translate(83 25)"><rect width="112" height="82" rx="10" fill="#111936"/><g fill="${p.a}">${[0,1,2,3].map((r)=>[0,1,2,3].map((c)=>`<circle cx="${18+c*25}" cy="${14+r*18}" r="3"/>`).join("")).join("")}</g><path d="M18 14h25v18H18zM43 32h25v18H43zM68 14h25v18H68z" fill="${p.b}" opacity=".32" stroke="${p.b}" stroke-width="3"/></g>`;
      case "stratego":
        return `<g transform="translate(76 24)"><rect width="128" height="84" rx="10" fill="#172143"/><g>${[0,1,2,3].map((c)=>`<rect x="${13+c*28}" y="12" width="22" height="28" rx="5" fill="${p.c}" opacity=".85"/><rect x="${13+c*28}" y="46" width="22" height="28" rx="5" fill="${p.b}" opacity=".85"/>`).join("")}</g><path d="M65 25v32" stroke="${p.a}" stroke-width="4"/><path d="M67 27h22l-8 10l8 10H67z" fill="${p.a}"/></g>`;
      case "tankarena":
        return `<g transform="translate(74 27)"><path d="M10 20h116M10 50h116M10 80h116" stroke="#fff" stroke-opacity=".16" stroke-width="9"/><g transform="translate(35 42)"><rect width="54" height="28" rx="8" fill="${p.b}"/><rect x="12" y="-5" width="28" height="18" rx="6" fill="${p.a}"/><rect x="38" y="3" width="38" height="6" rx="3" fill="${p.a}"/></g><rect x="95" y="19" width="18" height="18" rx="4" fill="${p.c}"/></g>`;
      case "dicebattle":
        return `<g transform="translate(77 24)"><rect width="118" height="84" rx="10" fill="#121b36"/><path d="M10 28h98M10 56h98M39 8v68M69 8v68" ${line}/><rect x="19" y="17" width="32" height="32" rx="8" fill="${p.a}"/><circle cx="28" cy="26" r="3" fill="#12142b"/><circle cx="42" cy="40" r="3" fill="#12142b"/><rect x="70" y="39" width="32" height="32" rx="8" fill="${p.b}"/><circle cx="79" cy="48" r="3" fill="#12142b"/><circle cx="86" cy="55" r="3" fill="#12142b"/><circle cx="93" cy="62" r="3" fill="#12142b"/></g>`;
      case "territorywar":
        return `<g transform="translate(75 23)"><path d="M16 18h50l18 22l-28 23H18z" fill="${p.b}" opacity=".8"/><path d="M80 14h42l-4 42l-37 10l-24-26z" fill="${p.a}" opacity=".82"/><path d="M35 66h52l28-18l12 36H48z" fill="${p.c}" opacity=".75"/><path d="M64 22v70M23 58h104" stroke="#fff" stroke-opacity=".18" stroke-width="3"/></g>`;
      case "crystalconquest":
        return `<g transform="translate(78 22)"><rect width="120" height="88" rx="10" fill="#151d3a"/><path d="M61 12l24 38l-24 28l-24-28z" fill="${p.b}"/><path d="M61 12v66M37 50h48" stroke="#fff" stroke-opacity=".35" stroke-width="3"/><circle cx="25" cy="28" r="12" fill="${p.a}" opacity=".9"/><circle cx="96" cy="65" r="12" fill="${p.c}" opacity=".9"/></g>`;
      case "poolbattle":
        return `<g transform="translate(72 24)"><rect width="136" height="84" rx="28" fill="#116249"/><rect x="13" y="11" width="110" height="62" rx="20" fill="#0b3d31"/><circle cx="56" cy="43" r="11" fill="${p.a}"/><circle cx="78" cy="32" r="9" fill="${p.c}"/><circle cx="93" cy="52" r="9" fill="${p.b}"/><path d="M24 66l61-36" stroke="#f2d7a2" stroke-width="5" stroke-linecap="round"/></g>`;
      case "pong":
        return `<g transform="translate(77 25)"><rect width="122" height="82" rx="10" fill="#101832"/><path d="M61 9v64" stroke="#fff" stroke-opacity=".18" stroke-width="3" stroke-dasharray="6 6"/><rect x="14" y="24" width="8" height="34" rx="4" fill="${p.a}"/><rect x="100" y="14" width="8" height="34" rx="4" fill="${p.b}"/><circle cx="68" cy="46" r="9" fill="${p.c}"/><path d="M31 58c30-50 50-8 78-34" fill="none" stroke="${p.c}" stroke-width="3" opacity=".7"/></g>`;
      case "slingshotbattle":
        return `<g transform="translate(75 22)"><rect width="126" height="88" rx="10" fill="#151d3a"/><path d="M25 70V42M25 42l-14-18M25 42l16-18" stroke="${p.a}" stroke-width="6" stroke-linecap="round"/><path d="M38 40c33-42 72-20 83 13" fill="none" stroke="${p.c}" stroke-width="4" stroke-dasharray="7 6"/><circle cx="117" cy="56" r="11" fill="${p.b}"/><rect x="66" y="59" width="22" height="22" rx="5" fill="${p.a}" opacity=".65"/></g>`;
      case "timeloopduel":
        return `<g transform="translate(79 22)" fill="none"><circle cx="58" cy="44" r="33" stroke="${p.a}" stroke-width="7"/><circle cx="58" cy="44" r="18" stroke="${p.b}" stroke-width="5" opacity=".9"/><path d="M87 38l16 2l-10 13" fill="${p.a}" stroke="none"/><path d="M28 50l-16-2l10-13" fill="${p.b}" stroke="none"/><circle cx="58" cy="44" r="6" fill="${p.c}" stroke="none"/></g>`;
      case "artillery":
        return `<g transform="translate(72 28)"><path d="M8 70c28-35 43-15 68-32s44-8 60 32z" fill="#233f4c"/><g transform="translate(32 49)"><rect width="36" height="16" rx="6" fill="${p.a}"/><rect x="24" y="-6" width="42" height="7" rx="4" fill="${p.a}" transform="rotate(-18 24 -6)"/></g><path d="M86 31c18-24 37-27 55-10" fill="none" stroke="${p.c}" stroke-width="4" stroke-dasharray="7 6"/><circle cx="147" cy="22" r="7" fill="${p.c}"/></g>`;
      case "basedefenseduel":
        return `<g transform="translate(72 25)"><path d="M12 28h126M12 58h126" stroke="#fff" stroke-opacity=".14" stroke-width="14"/><path d="M15 74V32l22-18l22 18v42z" fill="${p.c}"/><path d="M98 74V32l22-18l22 18v42z" fill="${p.b}"/><rect x="62" y="37" width="18" height="27" rx="4" fill="${p.a}"/><circle cx="83" cy="50" r="7" fill="${p.a}"/></g>`;
      case "robotfactorywar":
        return `<g transform="translate(68 24)"><path d="M12 28h142M12 58h142" stroke="#fff" stroke-opacity=".14" stroke-width="14"/><rect x="8" y="25" width="34" height="56" rx="8" fill="${p.c}"/><rect x="122" y="25" width="34" height="56" rx="8" fill="${p.b}"/><g transform="translate(64 50)"><rect x="-18" y="-14" width="36" height="26" rx="7" fill="${p.a}"/><rect x="-10" y="-30" width="20" height="14" rx="5" fill="${p.b}"/><circle cx="-12" cy="15" r="7" fill="#10142b"/><circle cx="12" cy="15" r="7" fill="#10142b"/><path d="M16 -6h32" stroke="${p.c}" stroke-width="6" stroke-linecap="round"/></g><g transform="translate(102 50)"><rect x="-18" y="-14" width="36" height="26" rx="7" fill="${p.b}"/><rect x="-10" y="-30" width="20" height="14" rx="5" fill="${p.a}"/><circle cx="-12" cy="15" r="7" fill="#10142b"/><circle cx="12" cy="15" r="7" fill="#10142b"/><path d="M-16 -6h-32" stroke="${p.c}" stroke-width="6" stroke-linecap="round"/></g></g>`;
      case "coopdefense":
        return `<g transform="translate(68 22)"><path d="M10 26c28 12 40-15 66 0s45-9 72-2M10 52c31-10 45 15 72 0s42 11 76 0M10 78c33 10 48-15 76 0s42-10 68 2" fill="none" stroke="#593f1f" stroke-opacity=".32" stroke-width="14" stroke-linecap="round"/><path d="M10 26c28 12 40-15 66 0s45-9 72-2M10 52c31-10 45 15 72 0s42 11 76 0M10 78c33 10 48-15 76 0s42-10 68 2" fill="none" stroke="#e6c97c" stroke-width="11" stroke-linecap="round"/><rect x="4" y="33" width="16" height="48" rx="5" fill="${p.c}"/><text x="12" y="61" text-anchor="middle" font-size="9" font-weight="900" fill="#151936" font-family="Segoe UI,Arial">EX</text><g fill="${p.a}"><rect x="46" y="18" width="20" height="18" rx="5"/><rect x="85" y="55" width="20" height="18" rx="5"/><rect x="113" y="21" width="20" height="18" rx="5"/></g><g stroke="${p.a}" stroke-width="5" stroke-linecap="round"><path d="M62 23l28-7"/><path d="M101 60l31-6"/><path d="M129 26l28 8"/></g><circle cx="143" cy="25" r="7" fill="${p.b}"/><circle cx="151" cy="53" r="6" fill="${p.b}"/><circle cx="136" cy="82" r="7" fill="${p.b}"/></g>`;
      case "dungeonrival":
        return `<g transform="translate(76 22)"><rect x="10" y="12" width="40" height="30" rx="6" fill="#25304f"/><rect x="58" y="12" width="40" height="30" rx="6" fill="#25304f"/><rect x="34" y="50" width="40" height="30" rx="6" fill="#25304f"/><rect x="82" y="50" width="40" height="30" rx="6" fill="#25304f"/><path d="M50 27h8M78 42v8M74 65h8" ${line}/><circle cx="30" cy="27" r="8" fill="${p.a}"/><path d="M101 57l13 20H88z" fill="${p.c}"/><rect x="45" y="61" width="18" height="12" rx="3" fill="${p.b}"/></g>`;
      case "submarinehunt":
        return `<g transform="translate(72 23)"><rect width="136" height="86" rx="12" fill="#09243f"/><circle cx="72" cy="42" r="34" fill="none" stroke="${p.b}" stroke-width="3" opacity=".32"/><circle cx="72" cy="42" r="20" fill="none" stroke="${p.b}" stroke-width="3" opacity=".5"/><path d="M39 57h58c11 0 19-7 23-16c-17-5-31-7-47-7H39c-9 0-15 5-18 12c4 7 10 11 18 11z" fill="${p.a}"/><rect x="56" y="25" width="20" height="11" rx="4" fill="${p.a}"/><path d="M102 45l22-12v24z" fill="${p.c}"/></g>`;
      case "battleship":
      case "seabattleplus":
        return `<g transform="translate(74 22)"><rect width="130" height="88" rx="10" fill="#0b2945"/><path d="M12 22h106M12 44h106M12 66h106M34 10v68M58 10v68M82 10v68M106 10v68" ${line}/><path d="M35 52h70l-9 13H44z" fill="${p.b}"/><rect x="55" y="40" width="30" height="13" rx="4" fill="${p.b}"/><circle cx="102" cy="27" r="11" fill="none" stroke="${p.c}" stroke-width="4"/></g>`;
      case "hiddenassassin":
        return `<g transform="translate(74 22)"><rect width="132" height="88" rx="10" fill="#171936"/><g fill="${p.b}" opacity=".72">${[18,43,68,93,118].map((x,i)=>`<circle cx="${x}" cy="${32+(i%2)*22}" r="10"/>`).join("")}</g><circle cx="68" cy="54" r="13" fill="${p.c}"/><path d="M68 15v78M36 54h64" stroke="${p.a}" stroke-width="3" stroke-dasharray="6 6"/><circle cx="68" cy="54" r="30" fill="none" stroke="${p.a}" stroke-width="4" opacity=".55"/></g>`;
      case "trapmansion":
        return `<g transform="translate(76 22)"><rect width="126" height="88" rx="10" fill="#171936"/><path d="M18 16h88v56H18zM18 42h88M50 16v56M78 42v30" fill="none" stroke="${p.b}" stroke-width="5"/><path d="M33 54l8 14h-16zM92 24l8 14H84z" fill="${p.c}"/><circle cx="61" cy="28" r="7" fill="${p.a}"/></g>`;
      case "minesweeper":
        return `<g transform="translate(82 24)"><rect width="112" height="84" rx="10" fill="#121a36"/><g>${[0,1,2].map((r)=>[0,1,2,3].map((c)=>`<rect x="${12+c*23}" y="${12+r*20}" width="18" height="16" rx="4" fill="${(r+c)%2?p.b:'#263158'}" opacity=".85"/>`).join("")).join("")}</g><circle cx="73" cy="40" r="10" fill="${p.c}"/><path d="M73 25v30M58 40h30M62 29l22 22M84 29L62 51" stroke="${p.a}" stroke-width="3"/></g>`;
      case "treasure":
        return `<g transform="translate(75 23)"><path d="M18 22c36-20 69 14 104-4v68c-35 18-68-15-104 4z" fill="#d6bd7a"/><path d="M35 66c25-33 51 16 76-20" fill="none" stroke="#6b5630" stroke-width="4" stroke-dasharray="6 6"/><rect x="91" y="55" width="25" height="18" rx="4" fill="${p.a}"/><path d="M91 58h25M103 55v18" stroke="#6b5630" stroke-width="3"/><circle cx="43" cy="38" r="8" fill="${p.c}"/></g>`;
      case "bullscows":
        return `<g transform="translate(78 27)"><rect width="122" height="78" rx="10" fill="#131b36"/><rect x="22" y="22" width="78" height="38" rx="8" fill="#0b1026" stroke="${p.b}" stroke-width="4"/><text x="61" y="48" text-anchor="middle" font-size="22" font-weight="900" fill="${p.a}" font-family="Segoe UI,Arial">247</text><circle cx="24" cy="20" r="8" fill="${p.c}"/><circle cx="98" cy="62" r="8" fill="${p.c}"/></g>`;
      case "hangman":
      case "noitu":
        return `<g transform="translate(74 28)"><rect width="132" height="76" rx="10" fill="#141c38"/><rect x="16" y="20" width="26" height="22" rx="6" fill="${p.a}"/><rect x="50" y="20" width="26" height="22" rx="6" fill="${p.b}"/><rect x="84" y="20" width="26" height="22" rx="6" fill="${p.c}"/><path d="M29 56h74" stroke="#fff" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/><circle cx="111" cy="56" r="8" fill="${p.b}"/></g>`;
      case "auctionwar":
        return `<g transform="translate(72 22)"><rect x="28" y="18" width="76" height="50" rx="8" fill="#f0d79c"/><path d="M28 18h76v15H28z" fill="${p.a}"/><circle cx="86" cy="44" r="14" fill="${p.b}"/><path d="M45 76l70-40" stroke="${p.c}" stroke-width="9" stroke-linecap="round"/><rect x="104" y="29" width="26" height="12" rx="4" fill="${p.c}" transform="rotate(-29 104 29)"/><circle cx="47" cy="78" r="17" fill="${p.a}"/></g>`;
      case "domino":
        return `<g transform="translate(74 30)"><rect x="24" y="12" width="42" height="68" rx="8" fill="#f4f1dd" transform="rotate(-12 24 12)"/><rect x="76" y="12" width="42" height="68" rx="8" fill="#f4f1dd" transform="rotate(12 76 12)"/><path d="M29 45h35M82 45h35" stroke="#151936" stroke-width="3"/><circle cx="43" cy="28" r="4" fill="#151936"/><circle cx="52" cy="62" r="4" fill="#151936"/><circle cx="94" cy="29" r="4" fill="#151936"/><circle cx="103" cy="62" r="4" fill="#151936"/></g>`;
      case "yahtzee":
      case "pig":
      case "memory":
        return `<g transform="translate(75 24)"><rect x="25" y="14" width="42" height="42" rx="10" fill="${p.a}"/><rect x="72" y="34" width="42" height="42" rx="10" fill="${p.b}"/><circle cx="38" cy="27" r="4" fill="#10142b"/><circle cx="54" cy="43" r="4" fill="#10142b"/><circle cx="85" cy="47" r="4" fill="#10142b"/><circle cx="93" cy="55" r="4" fill="#10142b"/><circle cx="101" cy="63" r="4" fill="#10142b"/><rect x="120" y="20" width="34" height="52" rx="8" fill="#f4e1ae" transform="rotate(10 120 20)"/></g>`;
      default:
        return `<g transform="translate(78 24)"><rect width="118" height="84" rx="10" fill="#111936"/><circle cx="37" cy="43" r="20" fill="${p.a}"/><rect x="65" y="22" width="38" height="42" rx="8" fill="${p.b}"/><path d="M33 74c26-18 52-18 78 0" fill="none" stroke="${p.c}" stroke-width="5"/></g>`;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function setGameHeading(target, game) {
    target.innerHTML = `${gameIconHtml(game, "small")}<span>${escapeHtml(gameName(game))}</span>`;
  }

  // ---- Lưu phiên online để khôi phục ván khi lỡ tải lại trang ----
  // Chỉ lưu thông tin tối thiểu cần để rejoin (mã phòng, ghế, token). Trạng thái
  // ván được server phát lại qua history khi rejoin thành công.
  function saveSession() {
    if (!online || !online.code || !sessionToken) return;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        code: online.code,
        seat: online.roomSeat,
        token: sessionToken,
        gameId: online.gameId || (selectedGame && selectedGame.id) || "",
        ts: Date.now(),
      }));
    } catch (e) { /* ignore */ }
  }
  function clearSavedSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }
  // Tải lại trang giữa ván online: thử rejoin lại phòng bằng token đã lưu.
  // Trả về true nếu đang thử khôi phục (để bỏ qua định tuyến URL mặc định).
  function attemptResume() {
    const s = readSavedSession();
    if (!s) return false;
    const game = getGameById(s.gameId);
    if (!game) { clearSavedSession(); return false; }
    resuming = true;
    sessionToken = s.token;
    selectedGame = game;
    Net.connect().then(() => {
      Net.send("rejoin", { code: s.code, seat: s.seat, token: s.token });
    }).catch(() => { resuming = false; clearSavedSession(); });
    return true;
  }
  function readSavedSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.code || typeof s.seat !== "number" || !s.token) return null;
      // phiên chỉ còn ý nghĩa trong thời gian ân hạn của server (45s); nới rộng
      // một chút để bù thời gian tải lại trang.
      if (Date.now() - (s.ts || 0) > 60_000) { clearSavedSession(); return null; }
      return s;
    } catch (e) { return null; }
  }

  function normalizeOnlineSession(m) {
    const roomSeat = typeof m.seat === "number" ? m.seat : 0;
    const firstSeat = typeof m.firstSeat === "number" ? m.firstSeat : 0;
    const roomNames = Array.isArray(m.playerNames) ? m.playerNames : [];
    const normalizedRoomNames = [
      cleanName(roomNames[0], "Người chơi 1"),
      cleanName(roomNames[1], "Người chơi 2"),
    ];
    const playerNames = [
      normalizedRoomNames[firstSeat] || "Người chơi 1",
      normalizedRoomNames[1 - firstSeat] || "Người chơi 2",
    ];
    return {
      roomSeat,
      seat: roomSeat === firstSeat ? 0 : 1,
      firstSeat,
      seed: m.seed,
      gameId: m.gameId || selectedGame?.id,
      code: m.code || online?.code,
      round: m.round || online?.round || 1,
      playerNames,
      roomNames: normalizedRoomNames,
      token: sessionToken,
      ranked: !!m.ranked || (online ? online.ranked : false),
    };
  }

  // Báo kết quả ván online cho server để tính ELO (chỉ khi phòng "ranked").
  // outcome theo góc nhìn người chơi cục bộ: "win" | "lose" | "draw".
  function reportRankedResult(kind) {
    if (!online || !online.ranked) return;
    const outcome = kind === "win" ? "win" : kind === "lose" ? "lose" : "draw";
    Net.send("reportResult", { outcome, round: online.round || 1 });
  }

  function updateRestartButtons() {
    const onlineMode = !!online;
    const roomSeat = online?.roomSeat;
    const mineReady = onlineMode && restartReadySeats.includes(roomSeat);
    const otherReady = onlineMode && restartReadySeats.includes(1 - roomSeat);
    const oppName = onlineMode ? opponentName() : "đối thủ";

    if (sessionLocked) {
      el.restartBtn.disabled = true;
      el.winAgain.disabled = true;
      el.restartBtn.textContent = tt("stopped");
      el.winAgain.textContent = tt("stopped");
      return;
    }

    el.restartBtn.disabled = !!mineReady;
    el.winAgain.disabled = !!mineReady;

    if (!onlineMode) {
      el.restartBtn.textContent = tt("againLocal");
      el.winAgain.textContent = tt("againLocal");
    } else if (mineReady && otherReady) {
      el.restartBtn.textContent = tt("againCreating");
      el.winAgain.textContent = tt("againCreating");
    } else if (mineReady) {
      el.restartBtn.textContent = tt("againWaitOpp").replace("{opp}", oppName);
      el.winAgain.textContent = tt("againReady");
    } else if (otherReady) {
      el.restartBtn.textContent = tt("againAgreeOpp").replace("{opp}", oppName);
      el.winAgain.textContent = tt("againAgreeOpp").replace("{opp}", oppName);
    } else {
      el.restartBtn.textContent = tt("againWithOpp").replace("{opp}", oppName);
      el.winAgain.textContent = tt("againWithOpp").replace("{opp}", oppName);
    }
  }

  function applyRestartPending(m) {
    if (!online || (m.code && m.code !== online.code)) return;
    restartReadySeats = Array.isArray(m.ready) ? m.ready.filter((seat) => seat === 0 || seat === 1) : [];
    updateRestartButtons();

    const mineReady = restartReadySeats.includes(online.roomSeat);
    const otherReady = restartReadySeats.includes(1 - online.roomSeat);
    const mineName = seatName(online.seat);
    const oppName = opponentName();
    if (mineReady && !otherReady) {
      const text = tt("rsMineReady").replace("{opp}", oppName);
      el.status.textContent = text;
      setGameRoomState(tt("rsMineReadyShort").replace("{opp}", oppName), "waiting");
      if (!el.winOverlay.classList.contains("hidden")) el.winSub.textContent = text;
    } else if (!mineReady && otherReady) {
      const text = tt("rsOppWants").replace("{opp}", oppName);
      el.status.textContent = text;
      setGameRoomState(tt("rsOppWantsShort").replace("{opp}", oppName).replace("{me}", mineName), "waiting");
      if (!el.winOverlay.classList.contains("hidden")) el.winSub.textContent = text;
    } else if (mineReady && otherReady) {
      el.status.textContent = tt("rsBothAgree");
      setGameRoomState(tt("rsBothAgreeShort").replace("{me}", mineName).replace("{opp}", oppName), "waiting");
    }
  }

  // ====================== Menu chọn game ======================
  function renderMenu() {
    const byId = new Map(GameRegistry.games.map((g) => [g.id, g]));
    const rendered = new Set();
    menuCategories = [];

    // Chơi gần đây + Yêu thích (đặc biệt, luôn ở đầu)
    const recentGames = getRecent().map((id) => byId.get(id)).filter(Boolean);
    menuCategories.push({
      id: "recent", title: tt("catRecent"), icon: "🕘", special: true,
      hint: tt("catRecentHint"),
      games: recentGames,
    });
    const favGames = getFavorites().map((id) => byId.get(id)).filter(Boolean);
    menuCategories.push({
      id: "fav", title: tt("catFav"), icon: "❤️", special: true,
      hint: tt("catFavHint"),
      games: favGames,
    });

    // thể loại "Tất cả"
    menuCategories.push({
      id: "all",
      title: tt("catAll"),
      icon: "🎮",
      hint: tt("catAllHint").replace("{n}", GameRegistry.games.length),
      games: GameRegistry.games.slice(),
    });

    GAME_GROUPS.forEach((group, i) => {
      const games = group.games.map((id) => byId.get(id)).filter(Boolean);
      if (!games.length) return;
      games.forEach((g) => rendered.add(g.id));
      menuCategories.push({ id: "g" + i, title: group.titleKey ? tt(group.titleKey) : group.title, icon: group.icon || "🎯", hint: group.hintKey ? tt(group.hintKey) : group.hint, games });
    });

    const otherGames = GameRegistry.games.filter((g) => !rendered.has(g.id));
    if (otherGames.length) {
      menuCategories.push({ id: "other", title: tt("catOther"), icon: "✨", hint: tt("catOtherHint"), games: otherGames });
    }

    if (!menuCategories.some((c) => c.id === currentCategory)) currentCategory = "all";
    buildCatSidebar();
    renderCategory(currentCategory);
    buildLobbyGameSelect();
    renderDailyBanner();
  }

  // Cập nhật lại danh sách "Chơi gần đây" + "Yêu thích" từ localStorage
  // (gọi khi thả tim hoặc khi quay về menu sau khi chơi) để khỏi phải reload trang.
  function refreshDynamicCategories() {
    if (!menuCategories.length) return;
    const byId = new Map(GameRegistry.games.map((g) => [g.id, g]));
    const rec = menuCategories.find((c) => c.id === "recent");
    if (rec) rec.games = getRecent().map((id) => byId.get(id)).filter(Boolean);
    const fav = menuCategories.find((c) => c.id === "fav");
    if (fav) fav.games = getFavorites().map((id) => byId.get(id)).filter(Boolean);
  }

  function buildCatSidebar() {
    el.catSidebar.innerHTML = "";
    menuCategories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-item" + (cat.id === currentCategory ? " active" : "") + (cat.special ? " cat-special" : "");
      btn.innerHTML =
        `<span class="cat-ic">${cat.icon}</span>` +
        `<span class="cat-label"><b>${cat.title}</b><small>${cat.games.length} ${tt("gamesWordShort")}</small></span>`;
      btn.addEventListener("click", () => {
        currentCategory = cat.id;
        if (el.gameSearch) el.gameSearch.value = "";
        buildCatSidebar();
        renderCategory(cat.id);
      });
      el.catSidebar.appendChild(btn);
    });
  }

  function renderCategory(catId) {
    const cat = menuCategories.find((c) => c.id === catId) || menuCategories.find((c) => c.id === "all");
    if (!cat) return;
    el.catHead.innerHTML =
      `<h2><span class="cat-head-ic">${cat.icon}</span>${cat.title}</h2>` +
      `<p>${cat.hint}</p>` +
      `<span class="cat-head-count" id="catHeadCount"></span>`;
    baseList = cat.games.slice();
    shownCount = PAGE_SIZE;
    currentEmptyKind = cat.id === "fav" ? "fav" : (cat.id === "recent" ? "recent" : "");
    applyListView();
  }

  // Lọc + sắp xếp + phân trang danh sách game đang xem
  function applyListView() {
    const emptyKind = currentEmptyKind;
    const plays = getPlays();
    let list = baseList.filter((g) =>
      (!filterOnline || g.onlineReady !== false) && (!filterAI || g.supportsAI));
    if (sortMode === "az") list = list.slice().sort((a, b) => a.name.localeCompare(b.name, "vi"));
    else if (sortMode === "popular") list = list.slice().sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0) || a.name.localeCompare(b.name, "vi"));
    else if (sortMode === "new") list = list.slice().sort((a, b) => (NEW_IDS.has(b.id) ? 1 : 0) - (NEW_IDS.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name, "vi"));

    const countEl = document.querySelector("#catHeadCount");
    if (countEl) countEl.textContent = `${list.length} ${tt("gamesWord")}`;

    el.gameGrid.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "cat-empty";
      empty.textContent = emptyKind === "fav"
        ? tt("emptyFav")
        : (emptyKind === "recent" ? tt("emptyRecent")
          : (filterOnline || filterAI ? tt("emptyFilter") : tt("emptyCat")));
      el.gameGrid.appendChild(empty);
      el.loadMoreBtn.classList.add("hidden");
      return;
    }
    const shown = list.slice(0, shownCount);
    shown.forEach((game) => el.gameGrid.appendChild(createGameCard(game)));
    el.loadMoreBtn.classList.toggle("hidden", list.length <= shownCount);
    el.loadMoreBtn.textContent = `${tt("loadMore")} (${list.length - shownCount})`;
  }

  // Tìm kiếm game theo tên / mô tả
  function normalizeText(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // bỏ dấu (ō->o, ờ->o, ...)
      .replace(/\u0111/g, "d"); // đ -> d
  }
  function runSearch(query) {
    const q = normalizeText(query).trim();
    if (!q) { renderCategory(currentCategory); return; }
    baseList = GameRegistry.games.filter((g) => {
      const hay = normalizeText(`${g.id} ${g.name} ${g.description || ""} ${gameName(g)} ${gameDesc(g)}`);
      return hay.includes(q);
    });
    shownCount = PAGE_SIZE;
    currentEmptyKind = "search";
    el.catHead.innerHTML =
      `<h2><span class="cat-head-ic">🔎</span>${tt("searchResults")}</h2>` +
      `<p>${tt("searchHintPrefix")} "<b>${escapeHtml(query.trim())}</b>" ${tt("searchHintSuffix")}</p>` +
      `<span class="cat-head-count" id="catHeadCount"></span>`;
    applyListView();
  }

  function buildLobbyGameSelect(preselectId = "") {
    el.lobbyGameSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = tt("lobbyGamePlaceholder");
    el.lobbyGameSelect.appendChild(placeholder);

    GameRegistry.games
      .filter((g) => g.onlineReady !== false)
      .forEach((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        option.textContent = gameName(game);
        el.lobbyGameSelect.appendChild(option);
      });

    el.lobbyGameSelect.value = preselectId || "";
    setLobbyGame(el.lobbyGameSelect.value);
  }

  function setLobbyGame(gameId) {
    lobbySelectedGame = gameId ? getGameById(gameId) : null;
    el.createRoomBtn.disabled = !lobbySelectedGame;
    if (!lobbySelectedGame) {
      el.lobbyOptionsPanel.classList.add("hidden");
      el.lobbyOptionsList.innerHTML = "";
      return;
    }
    buildOptionsUI(lobbySelectedGame, el.lobbyOptionsPanel, el.lobbyOptionsList, "lobby_opt_");
  }

  function statLineHtml(id) {
    const s = statOf(id);
    if (!s.played) return "";
    return `<div class="card-stats">🎮 ${s.played} ${tt("cardPlays")} · 🏆 ${s.p1}–${s.p2}` +
      (s.draw ? ` · 🤝 ${s.draw}` : "") + `</div>`;
  }

  function createGameCard(g) {
    const card = document.createElement("div");
    card.className = "game-card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${gameName(g)}. ${gameDesc(g)}`);
    const tags = [];
    if (g.onlineReady === false) tags.push(tt("tagLocalOnly"));
    if (g.localReady === false) tags.push(tt("tagOnlineOnly"));

    const badges = [];
    if (isHot(g.id)) badges.push(`<span class="badge badge-hot">${tt("badgeHot")}</span>`);
    else if (isNew(g.id)) badges.push(`<span class="badge badge-new">${tt("badgeNew")}</span>`);
    if (g.onlineReady !== false) badges.push(`<span class="badge badge-online">${tt("badgeOnline")}</span>`);

    card.innerHTML =
      `<div class="card-media">` +
        gameAvatarHtml(g) +
        `<div class="card-badges">${badges.join("")}</div>` +
        `<button type="button" class="fav-btn${isFav(g.id) ? " on" : ""}" title="${tt("favTitle")}" aria-label="${tt("favTitle")}">♥</button>` +
      `</div>` +
      `<h3>${escapeHtml(gameName(g))}</h3>` +
      `<p>${escapeHtml(gameDesc(g))}</p>` +
      statLineHtml(g.id) +
      tags.map((tag) => `<span class="tag-local">${tag}</span>`).join("");

    const fav = card.querySelector(".fav-btn");
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(g.id);
      fav.classList.toggle("on");
      refreshDynamicCategories();
      buildCatSidebar();
      if (currentCategory === "fav" || currentCategory === "recent") renderCategory(currentCategory);
    });
    card.addEventListener("click", () => openDetail(g));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(g); }
    });
    return card;
  }

  // ====================== Trang chi tiết game ======================
  function openDetail(game) {
    selectedGame = game;
    el.detailPoster.innerHTML = gameAvatarHtml(game);
    el.detailTitle.textContent = (game.emoji ? game.emoji + " " : "") + gameName(game);
    const badges = [];
    if (isHot(game.id)) badges.push(`<span class="badge badge-hot">${tt("badgeHot")}</span>`);
    if (isNew(game.id)) badges.push(`<span class="badge badge-new">${tt("badgeNew")}</span>`);
    if (game.onlineReady !== false) badges.push(`<span class="badge badge-online">${tt("badgeOnline")}</span>`);
    if (game.supportsAI) badges.push(`<span class="badge badge-ai">${tt("badgeAI")}</span>`);
    el.detailBadges.innerHTML = badges.join("");
    el.detailDesc.textContent = gameDesc(game);
    const s = statOf(game.id);
    el.detailStats.innerHTML = s.played
      ? `<span>${tt("detailPlayed").replace("{n}", s.played)}</span><span>${tt("detailWins").replace("{a}", s.p1).replace("{b}", s.p2)}</span>${s.draw ? `<span>${tt("detailDraws").replace("{n}", s.draw)}</span>` : ""}`
      : `<span class="detail-nostat">${tt("detailNoStat")}</span>`;
    const steps = gameHowTo(game).length ? gameHowTo(game) : [tt("howToEmpty")];
    el.detailHowto.innerHTML = steps.map((t) => `<li>${t}</li>`).join("");
    show("detailView");
  }

  // ====================== Chọn chế độ ======================
  function openMode(game) {
    selectedGame = game;
    setGameHeading(el.modeTitle, game);
    // game không hỗ trợ online thì ẩn lựa chọn online
    el.modeOnline.classList.toggle("disabled", game.onlineReady === false);
    // game chỉ chơi online (giấu thông tin) thì ẩn lựa chọn chung máy
    el.modeLocal.classList.toggle("disabled", game.localReady === false);
    // chỉ hiện "Đấu với máy" nếu game hỗ trợ AI
    el.modeAI.classList.toggle("hidden", !game.supportsAI);
    buildOptionsUI(game, el.optionsPanel, el.optionsList, "opt_");
    show("modeView");
  }

  // Dựng panel tùy chỉnh dựa trên schema options của game
  function buildOptionsUI(game, panelEl = el.optionsPanel, listEl = el.optionsList, prefix = "opt_") {
    listEl.innerHTML = "";
    const opts = game.options;
    if (!opts || !opts.length) {
      panelEl.classList.add("hidden");
      return;
    }
    panelEl.classList.remove("hidden");
    opts.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "option-row";
      const label = document.createElement("label");
      label.className = "option-label";
      label.textContent = opt.label;
      label.htmlFor = prefix + opt.id;
      const select = document.createElement("select");
      select.className = "option-select";
      select.id = prefix + opt.id;
      select.dataset.optId = opt.id;
      opt.choices.forEach((ch) => {
        const o = document.createElement("option");
        o.value = String(ch.value);
        o.textContent = ch.label;
        if (ch.value === opt.default) o.selected = true;
        select.appendChild(o);
      });
      row.appendChild(label);
      row.appendChild(select);
      listEl.appendChild(row);
    });
  }

  // Đọc giá trị người dùng đã chọn từ panel
  function readOptions(game, prefix = "opt_") {
    const result = {};
    if (!game.options) return result;
    game.options.forEach((opt) => {
      const sel = document.getElementById(prefix + opt.id);
      let val = sel ? sel.value : opt.default;
      // ép kiểu theo kiểu của default
      if (typeof opt.default === "number") val = Number(val);
      else if (typeof opt.default === "boolean") val = (val === true || val === "true");
      result[opt.id] = val;
    });
    return result;
  }

  function readBestOf() {
    const v = el.bestOfSelect ? parseInt(el.bestOfSelect.value, 10) : 1;
    return [3, 5, 7].includes(v) ? v : 1;
  }
  function resetMatch() {
    matchWins = [0, 0];
    matchGameNo = 0;
    matchOver = false;
    matchInProgress = false;
  }

  el.modeLocal.addEventListener("click", () => {
    if (selectedGame.localReady === false) return;
    vsAI = false;
    bestOf = readBestOf();
    resetMatch();
    startLocalGame(selectedGame, readOptions(selectedGame));
  });

  el.modeAI.addEventListener("click", () => {
    if (!selectedGame.supportsAI) return;
    vsAI = true;
    aiLevel = (el.aiLevel && el.aiLevel.value) || "normal";
    bestOf = readBestOf();
    resetMatch();
    online = null;
    currentOptions = readOptions(selectedGame);
    startGame(null, { autoHelp: true });
    navTo("play/" + selectedGame.id);
  });
  // chọn mức khó không kích hoạt vào game
  if (el.aiLevel) el.aiLevel.addEventListener("click", (e) => e.stopPropagation());

  el.modeOnline.addEventListener("click", () => {
    if (selectedGame.onlineReady === false) return;
    openLobby(selectedGame, "modeView");
  });

  el.openOnlineHubBtn.addEventListener("click", () => openLobby(null, "menu"));

  // ====================== Sảnh online ======================
  function openLobby(game = null, returnView = "menu") {
    leavePendingRoom();
    lobbyReturnView = returnView;
    const preselect = game?.onlineReady === false ? null : game;
    el.lobbyTitle.textContent = preselect
      ? tt("lobbyTitleCreate").replace("{game}", preselect.name)
      : tt("lobbyTitleHub");
    buildLobbyGameSelect(preselect?.id || "");
    el.roomCodeBox.classList.add("hidden");
    el.lobbyError.textContent = "";
    el.joinCodeInput.value = "";
    setLobbyState(tt("lobbyReady"), "info");
    buildMatchGameSelect(preselect?.id || "");
    setMatchmakingSearching(false);
    setMatchStatus("");
    show("lobbyView");
    startRoomPolling();
  }

  async function ensureConnected() {
    try {
      await Net.connect();
      return true;
    } catch (e) {
      el.lobbyError.textContent = tt("connectErr");
      return false;
    }
  }

  function leavePendingRoom() {
    if (!pendingRoomCode) return;
    Net.send("leave");
    pendingRoomCode = null;
  }

  el.lobbyGameSelect.addEventListener("change", () => {
    setLobbyGame(el.lobbyGameSelect.value);
    if (lobbySelectedGame) {
      el.lobbyTitle.textContent = tt("lobbyTitleCreate").replace("{game}", lobbySelectedGame.name);
    } else {
      el.lobbyTitle.textContent = tt("lobbyTitleHub");
    }
  });

  el.createRoomBtn.addEventListener("click", async () => {
    el.lobbyError.textContent = "";
    if (!lobbySelectedGame) {
      el.lobbyError.textContent = tt("lobbyPickGame");
      return;
    }
    leavePendingRoom();
    if (!(await ensureConnected())) return;
    selectedGame = lobbySelectedGame;
    currentOptions = readOptions(lobbySelectedGame, "lobby_opt_");
    const playerName = readPlayerName(el.createNameInput, tt("player1"));
    setLobbyState(tt("creatingRoom"), "waiting");
    Net.send("create", { gameId: lobbySelectedGame.id, options: currentOptions, playerName, public: el.publicToggle ? el.publicToggle.checked : true, password: el.createPwInput ? el.createPwInput.value : "", auth: authToken() });
  });

  el.joinRoomBtn.addEventListener("click", async () => {
    el.lobbyError.textContent = "";
    const code = el.joinCodeInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
      el.lobbyError.textContent = tt("codeMustBe4");
      return;
    }
    if (!(await ensureConnected())) return;
    const playerName = readPlayerName(el.joinNameInput, tt("player2"));
    setLobbyState(tt("joiningRoom"), "waiting");
    Net.send("join", { code, playerName, password: el.joinPwInput ? el.joinPwInput.value : "", auth: authToken() });
  });

  el.copyCodeBtn.addEventListener("click", () => {
    navigator.clipboard?.writeText(el.roomCodeVal.textContent).then(() => {
      el.copyCodeBtn.textContent = tt("copied");
      setTimeout(() => (el.copyCodeBtn.textContent = tt("copyCode")), 1500);
    });
  });

  el.joinCodeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
  });

  // ---- Phòng công khai ----
  async function refreshPublicRooms(showLoading) {
    if (!el.publicRoomsList) return;
    if (showLoading) el.publicRoomsList.innerHTML = `<div class="public-empty">${tt("roomsLoading")}</div>`;
    if (!(await ensureConnected())) {
      el.publicRoomsList.innerHTML = `<div class="public-empty">${tt("roomsConnErr")}</div>`;
      return;
    }
    Net.send("listRooms");
  }

  function renderPublicRooms(list) {
    if (!el.publicRoomsList) return;
    const n = list ? list.length : 0;
    if (el.publicRoomsTitle) el.publicRoomsTitle.textContent = n
      ? tt("publicRoomsN").replace("{n}", n)
      : tt("publicRooms");
    if (!list || !list.length) {
      el.publicRoomsList.innerHTML = `<div class="public-empty">${tt("publicEmpty")}</div>`;
      return;
    }
    el.publicRoomsList.innerHTML = "";
    list.forEach((r) => {
      const g = getGameById(r.gameId);
      const row = document.createElement("div");
      row.className = "public-room";
      const lock = r.locked ? " 🔒" : "";
      row.innerHTML = `<div class="pr-poster">${g ? gameAvatarHtml(g) : ""}</div>` +
        `<div class="pr-info"><b>${escapeHtml(gameName(g) || r.gameId)}${lock}</b>` +
        `<small>👤 ${escapeHtml(r.hostName)} · ${tt("prCode")} ${escapeHtml(r.code)} <span class="pr-wait">${tt("prWaiting")}</span></small></div>`;
      const btn = document.createElement("button");
      btn.className = "btn small primary pr-join";
      btn.type = "button";
      btn.textContent = tt("joinRoomBtn");
      btn.addEventListener("click", () => quickJoinRoom(r.code, r.locked));
      row.appendChild(btn);
      el.publicRoomsList.appendChild(row);
    });
  }

  async function quickJoinRoom(code, locked) {
    el.lobbyError.textContent = "";
    if (!(await ensureConnected())) return;
    const playerName = readPlayerName(el.joinNameInput, tt("player2"));
    // Phòng có khóa: dùng mật khẩu đã nhập ở ô, nếu trống thì hỏi nhanh.
    let password = el.joinPwInput ? el.joinPwInput.value : "";
    if (locked && !password) {
      password = window.prompt(tt("roomPwPrompt")) || "";
      if (!password) { setLobbyState("", ""); return; }
    }
    setLobbyState(tt("joiningRoom"), "waiting");
    Net.send("join", { code, playerName, password, auth: authToken() });
  }

  function startRoomPolling() {
    stopRoomPolling();
    refreshPublicRooms(true);
    roomPollTimer = setInterval(() => {
      if (!pendingRoomCode && !online && Net.isOpen()) Net.send("listRooms");
    }, 4500);
  }
  function stopRoomPolling() {
    if (roomPollTimer) { clearInterval(roomPollTimer); roomPollTimer = null; }
  }

  if (el.refreshRoomsBtn) el.refreshRoomsBtn.addEventListener("click", () => refreshPublicRooms(true));
  Net.on("roomList", (m) => renderPublicRooms(m.rooms));

  // ---- Sự kiện từ server ----
  Net.on("created", (m) => {
    pendingRoomCode = m.code;
    sessionToken = m.token || sessionToken;
    el.roomCodeVal.textContent = m.code;
    el.roomCodeBox.classList.remove("hidden");
    const game = getGameById(m.gameId);
    if (game) selectedGame = game;
    el.waitingMsg.textContent = tt("waitingSecond").replace("{game}", game?.name || tt("waitingSecondRoom"));
    setLobbyState(tt("roomCreated").replace("{code}", m.code), "waiting");
  });

  Net.on("joined", (m) => { sessionToken = m.token || sessionToken; });

  // ---- Matchmaking (tìm trận nhanh) ----
  Net.on("queued", (m) => {
    setMatchmakingSearching(true);
    const game = getGameById(m.gameId);
    setMatchStatus(tt("mmSearching").replace("{game}", game ? gameName(game) : m.gameId), "info");
  });

  Net.on("unqueued", () => {
    setMatchmakingSearching(false);
    setMatchStatus("", "info");
  });

  // Ghép trận thành công: nhận token phiên rồi để handler "start" (chạy ngay sau) khởi động ván.
  Net.on("matched", (m) => {
    setMatchmakingSearching(false);
    sessionToken = m.token || sessionToken;
    setMatchStatus(tt("mmFound"), "info");
    showToast(tt("mmFound"));
    if (window.Sound) Sound.play("notify");
  });

  Net.on("error", (m) => {
    const text = "⚠️ " + (m.message || tt("genericConnErr"));
    if (online) {
      showToast(text);
      el.status.textContent = text;
      return;
    }
    el.lobbyError.textContent = text;
    setLobbyState(tt("cantContinue"), "left");
  });

  Net.on("start", (m) => {
    const game = getGameById(m.gameId);
    if (!game) {
      el.lobbyError.textContent = tt("roomGameMissing");
      return;
    }
    selectedGame = game;
    pendingRoomCode = null;
    reconnecting = false;
    online = normalizeOnlineSession(m);
    if (m.options) currentOptions = m.options; // dùng tùy chỉnh của chủ phòng
    setLobbyState(tt("oppJoinedStart").replace("{opp}", opponentName()), "live");
    startGame(m.seed, { autoHelp: true });
    saveSession();
    const joinedText = online.roomSeat === 0
      ? tt("oppJoinedHost").replace("{opp}", opponentName())
      : tt("youJoinedStart");
    addChatMessage(joinedText, "sys");
    showToast(joinedText);
    if (online.roomSeat === 0 && window.Sound) Sound.play("notify");
  });

  Net.on("move", (m) => {
    if (sessionLocked) return;
    replayMoves.push(m.move);
    if (instance && instance.applyMove) instance.applyMove(m.move, true);
  });

  Net.on("restart", (m) => {
    if (m.gameId) {
      const game = getGameById(m.gameId);
      if (game) selectedGame = game;
    }
    online = normalizeOnlineSession(m);
    if (m.options) currentOptions = m.options;
    clearSessionLock();
    describeOnlineGameState("live");
    startGame(m.seed);
    saveSession();
  });

  Net.on("restart_pending", applyRestartPending);

  Net.on("opponent_left", () => {
    if (!online) return;
    const name = opponentName();
    addChatMessage(tt("oppLeftChat").replace("{name}", name), "sys");
    setGameRoomState(tt("oppLeftReturn").replace("{name}", name), "left");
    stopOnlineSessionAndReturn(tt("oppLeftStopped").replace("{name}", name));
  });

  Net.on("disconnected", () => { /* xử lý qua netdown để hỗ trợ kết nối lại */ });

  // ----- Kết nối lại khi rớt mạng -----
  Net.on("netdown", () => {
    if (online && !reconnecting) {
      reconnecting = true;
      setGameRoomState(tt("netDown"), "waiting");
      addChatMessage(tt("netDownChat"), "sys");
    }
  });

  Net.on("netretry", (m) => {
    if (online) setGameRoomState(tt("netRetry").replace("{attempt}", m.attempt).replace("{max}", m.max), "waiting");
  });

  Net.on("netup", () => {
    if (online && reconnecting && online.code && sessionToken) {
      Net.send("rejoin", { code: online.code, seat: online.roomSeat, token: sessionToken });
    }
  });

  Net.on("netfail", () => {
    if (online) {
      reconnecting = false;
      clearSavedSession();
      stopOnlineSessionAndReturn(tt("netFail"));
    }
  });

  Net.on("rejoin_failed", (m) => {
    clearSavedSession();
    if (resuming) {
      // đang khôi phục ván sau khi tải lại trang mà phiên đã hết hạn -> về menu lặng lẽ
      resuming = false;
      Net.disconnect();
      online = null;
      return;
    }
    if (online) {
      reconnecting = false;
      stopOnlineSessionAndReturn(m.message || tt("sessionExpired"));
    }
  });

  Net.on("rejoined", (m) => {
    reconnecting = false;
    resuming = false;
    const game = getGameById(m.gameId);
    if (game) selectedGame = game;
    online = normalizeOnlineSession(m);
    if (m.options) currentOptions = m.options;
    clearSessionLock();
    // phát lại lịch sử nước đi để dựng lại ván — chạy SAU khi instance đã tạo
    // (startGame có thể nạp từ điển trễ cho game dùng từ tiếng Việt).
    const hist = Array.isArray(m.history) ? m.history : [];
    startGame(m.seed, {
      onReady: () => {
        hist.forEach((mv) => { if (instance && instance.applyMove) { try { instance.applyMove(mv, true); } catch (e) { /* ignore */ } } });
      },
    });
    replayMoves = hist.slice();
    describeOnlineGameState("live");
    setGameRoomState(tt("reconnected"), "live");
    addChatMessage(tt("reconnectedChat"), "sys");
    saveSession();
  });

  Net.on("opponent_disconnected", () => {
    if (online) setGameRoomState(tt("oppDisconnected"), "waiting");
  });

  Net.on("opponent_reconnected", () => {
    if (online) { describeOnlineGameState("live"); setGameRoomState(tt("oppReconnected"), "live"); }
  });

  Net.on("chat", (m) => {
    addChatMessage(m.text, "them");
    window.Sound && Sound.play("notify");
    // nếu chat đang thu gọn, hiện dấu báo có tin mới
    if (el.chatPanel.classList.contains("collapsed")) {
      el.chatPanel.classList.add("has-unread");
    }
  });

  Net.on("react", (m) => {
    if (m && m.emoji) floatReaction(m.emoji);
  });

  // Server đã tính ELO cho ván online (cả hai đã đăng nhập + báo cáo khớp).
  Net.on("rated", (m) => {
    if (!m || typeof m.game !== "number") return;
    const delta = typeof m.delta === "number" ? m.delta : null;
    const sign = delta === null ? "" : (delta >= 0 ? "+" + delta : String(delta));
    const txt = tt("eloRated")
      .replace("{elo}", m.game)
      .replace("{delta}", sign ? " (" + sign + ")" : "");
    addChatMessage(txt, "sys");
    showToast(txt);
  });

  // ====================== Chat (chỉ online) ======================
  const QUICK_MSG_KEYS = ["quickMsg1", "quickMsg2", "quickMsg3", "quickMsg4", "quickMsg5", "quickMsg6", "quickMsg7", "quickMsg8"];
  const EMOTES = ["😀", "😎", "😭", "😮", "😡", "👏", "🔥", "🎉", "🤝", "🤔", "😂", "💪", "🫡", "🧠", "🥳", "❤️"];

  function buildQuickButtons() {
    el.chatQuick.innerHTML = "";
    const emoteRow = document.createElement("div");
    emoteRow.className = "chat-emotes";
    EMOTES.forEach((e) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chat-emote-btn";
      b.textContent = e;
      b.setAttribute("aria-label", tt("reactSendLabel").replace("{emoji}", e));
      b.addEventListener("click", () => sendReaction(e));
      emoteRow.appendChild(b);
    });
    el.chatQuick.appendChild(emoteRow);
    QUICK_MSG_KEYS.forEach((key) => {
      const text = tt(key);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chat-quick-btn";
      b.textContent = text;
      b.addEventListener("click", () => sendChat(text));
      el.chatQuick.appendChild(b);
    });
  }

  function addChatMessage(text, who) {
    const msg = document.createElement("div");
    msg.className = "chat-msg " + (who === "me" ? "me" : who === "them" ? "them" : "sys");
    if (who === "sys") {
      msg.textContent = text;
    } else {
      const label = document.createElement("span");
      label.className = "chat-msg-who";
      label.textContent = who === "me"
        ? `${seatName(online?.seat ?? 0)} ${tt("chatYou")}`
        : opponentName();
      const body = document.createElement("span");
      body.className = "chat-msg-text";
      body.textContent = text;
      msg.appendChild(label);
      msg.appendChild(body);
    }
    el.chatMessages.appendChild(msg);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }

  function sendChat(text) {
    text = String(text || "").trim().slice(0, 200);
    if (!text || !online) return;
    Net.send("chat", { text });
    addChatMessage(text, "me");
  }

  // ---- Reaction nổi (emoji bay thoáng qua trên màn, chỉ online) ----
  function sendReaction(emoji) {
    if (!online || !emoji) return;
    Net.send("react", { emoji });
    floatReaction(emoji);            // người gửi cũng thấy
  }

  function floatReaction(emoji) {
    const span = document.createElement("span");
    span.className = "reaction-float";
    span.textContent = String(emoji).slice(0, 8);
    span.setAttribute("aria-hidden", "true");
    // lệch ngang ngẫu nhiên cho sinh động khi gửi liên tiếp
    span.style.left = (50 + (Math.random() * 24 - 12)) + "%";
    document.body.appendChild(span);
    window.Sound && Sound.play("react");
    setTimeout(() => span.remove(), 1700);
  }

  el.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendChat(el.chatInput.value);
    el.chatInput.value = "";
  });

  el.chatToggle.addEventListener("click", () => {
    el.chatPanel.classList.toggle("collapsed");
    const collapsed = el.chatPanel.classList.contains("collapsed");
    el.chatToggle.textContent = collapsed ? "▸" : "▾";
    el.chatToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    // mở lại thì xóa dấu báo tin mới
    if (!el.chatPanel.classList.contains("collapsed")) {
      el.chatPanel.classList.remove("has-unread");
    }
  });

  // ====================== Từ điển tiếng Việt (nạp trễ) ======================
  // vi-dict.js (~650KB) chỉ cần cho 3 game dùng từ tiếng Việt. Nạp trễ để
  // trang chính và các game khác không phải tải khối dữ liệu lớn này.
  const DICT_GAMES = new Set(["noitu", "wordduel", "typingrace"]);
  let dictPromise = null;
  function dictReady() {
    return typeof window !== "undefined" && window.VI_DICT instanceof Set;
  }
  function ensureDict() {
    if (dictReady()) return Promise.resolve();
    if (dictPromise) return dictPromise;
    dictPromise = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "js/vi-dict.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { dictPromise = null; resolve(); }; // lỗi tải: game tự fallback Set rỗng
      document.head.appendChild(s);
    });
    return dictPromise;
  }

  // ====================== Vòng chơi ======================
  function startGame(seed, opts = {}) {
    // Game cần từ điển mà chưa nạp xong: nạp trễ rồi chạy lại đúng lượt này.
    if (selectedGame && DICT_GAMES.has(selectedGame.id) && !dictReady()) {
      el.status.textContent = tt("loadingDict");
      ensureDict().then(() => startGame(seed, opts));
      return;
    }
    clearRoomExitNotice();
    clearSessionLock();
    el.boardWrap.innerHTML = "";
    el.status.textContent = "";
    restartReadySeats = [];
    el.restartBtn.disabled = false;
    el.winAgain.disabled = false;
    el.scoreP1.classList.remove("active");
    el.scoreP2.classList.remove("active");
    if (el.winOverlay) { el.winOverlay.classList.add("hidden"); stopConfetti(); }
    scores = [0, 0];
    resultRecorded = false;
    lastWinner = -1;
    replayMoves = [];
    replaySeed = seed || 1;
    replayMeta = { gameId: selectedGame.id, firstSeat: online ? online.firstSeat : 0, round: online ? online.round : 1, options: currentOptions };
    renderScores();
    setGameHeading(el.gameTitle, selectedGame);

    // Best-of-N (chung máy / đấu máy): ván đầu của trận thì đánh số 1.
    if (bestOf > 1 && !online) {
      if (matchGameNo === 0) matchGameNo = 1;
      renderMatchBadge();
    } else if (el.matchBadge) {
      el.matchBadge.classList.add("hidden");
    }

    if (online) {
      el.onlineBadge.classList.remove("hidden");
      const orderText = online.seat === 0 ? tt("goFirst") : tt("goSecond");
      el.onlineBadge.textContent = tt("onlineBadge").replace("{name}", seatName(online.seat)).replace("{order}", orderText);
      describeOnlineGameState("live");
      el.chatPanel.classList.remove("hidden", "collapsed");
      el.chatToggle.textContent = "▾";
      el.chatToggle.setAttribute("aria-expanded", "true");
      if (el.chatMessages.childElementCount === 0) buildQuickButtons();
    } else {
      el.onlineBadge.classList.add("hidden");
      setGameRoomState("", "info");
      el.restartBtn.textContent = tt("againLocal");
      el.chatPanel.classList.add("hidden");
    }

    updateRestartButtons();

    const ctx = makeContext(seed);
    applyScoreboardNames();
    instance = selectedGame.create(ctx);
    if (selectedGame && selectedGame.id) { pushRecent(selectedGame.id); incPlay(selectedGame.id); }
    // Nút hoàn tác chỉ hiện khi chơi chung máy và game có hỗ trợ undo
    el.undoBtn.classList.toggle("hidden", !!online || vsAI || !instance || typeof instance.undo !== "function");
    el.undoBtn.disabled = false;
    show("gameView");
    if (typeof opts.onReady === "function") opts.onReady();
    if (opts.autoHelp) {
      setTimeout(openHelp, 0);
    }
  }

  function restartGame() {
    if (!selectedGame) return;
    if (sessionLocked) return;
    if (online) {
      // Online rematch: gửi phiếu đồng ý, server chỉ reset khi đủ hai người.
      if (restartReadySeats.includes(online.roomSeat)) return;
      Net.send("restart");
      restartReadySeats = Array.from(new Set([...restartReadySeats, online.roomSeat]));
      updateRestartButtons();
      const text = tt("rsMineReady").replace("{opp}", opponentName());
      el.status.textContent = text;
      setGameRoomState(tt("rsMineReadyShort").replace("{opp}", opponentName()), "waiting");
      if (!el.winOverlay.classList.contains("hidden")) {
        el.winSub.textContent = text;
      }
      return;
    }
    startGame();
  }

  function teardownInstance() {
    if (typeof closeReplay === "function") closeReplay();
    if (instance && typeof instance.destroy === "function") {
      try { instance.destroy(); } catch (e) { /* ignore */ }
    }
    instance = null;
    // Gỡ canvas/DOM của game khỏi màn -> dừng vòng lặp requestAnimationFrame
    // và mọi âm thanh lặp lại mà game đang phát.
    el.boardWrap.innerHTML = "";
  }

  // ====================== Định tuyến URL (mỗi game một link) ======================
  let suppressHash = false;

  function navTo(target) {
    target = String(target || "");
    const cur = location.hash.replace(/^#/, "");
    if (cur === target) return;
    if (target) {
      suppressHash = true;
      location.hash = target;
    } else if (location.hash) {
      // về trang chủ: xóa hash cho gọn, replaceState không bắn hashchange
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function defaultOptions(game) {
    const result = {};
    (game.options || []).forEach((o) => { result[o.id] = o.default; });
    return result;
  }

  function startLocalGame(game, options) {
    if (!game || game.localReady === false) return;
    online = null;
    vsAI = false;
    selectedGame = game;
    currentOptions = options || defaultOptions(game);
    startGame(null, { autoHelp: true });
    navTo("play/" + game.id);
  }

  function handleRoute() {
    const h = location.hash.replace(/^#/, "");
    const m = h.match(/^play\/([a-z0-9_-]+)$/i);
    if (m) {
      const game = getGameById(m[1]);
      if (game && game.localReady !== false) {
        bestOf = 1; resetMatch(); // vào trực tiếp qua URL: thể thức một ván
        startLocalGame(game, defaultOptions(game));
        return;
      }
    }
    resetToMenu();
  }

  window.addEventListener("hashchange", () => {
    if (suppressHash) { suppressHash = false; return; }
    handleRoute();
  });

  function resetToMenu() {
    clearRoomExitNotice();
    hideWinScreen();
    leavePendingRoom();
    if (online) { Net.send("leave"); Net.disconnect(); online = null; }
    reconnecting = false;
    resuming = false;
    sessionToken = null;
    clearSavedSession();
    clearSessionLock();
    setGameRoomState("", "info");
    setLobbyState("", "info");
    restartReadySeats = [];
    el.chatMessages.innerHTML = "";
    el.chatPanel.classList.add("hidden");
    selectedGame = null;
    lobbySelectedGame = null;
    teardownInstance();
    show("menu");
  }

  function goHome() {
    resetToMenu();
    navTo("");
  }

  function closeLobby() {
    cancelMatchmaking();
    leavePendingRoom();
    show(lobbyReturnView);
  }

  // ====================== Tìm trận nhanh (matchmaking) ======================
  // Nạp danh sách game (chỉ game hỗ trợ online) vào ô chọn tìm trận.
  function buildMatchGameSelect(preselectId = "") {
    if (!el.mmGameSelect) return;
    el.mmGameSelect.innerHTML = "";
    GameRegistry.games
      .filter((g) => g.onlineReady !== false)
      .slice()
      .sort((a, b) => gameName(a).localeCompare(gameName(b)))
      .forEach((game) => {
        const option = document.createElement("option");
        option.value = game.id;
        option.textContent = gameName(game);
        el.mmGameSelect.appendChild(option);
      });
    if (preselectId) el.mmGameSelect.value = preselectId;
  }

  function setMatchStatus(text, kind = "info") {
    if (!el.mmStatus) return;
    el.mmStatus.textContent = text || "";
    el.mmStatus.className = "mm-status" + (text ? " " + kind : " hidden");
  }

  // Bật/tắt trạng thái "đang tìm": đổi nút, khóa ô chọn.
  function setMatchmakingSearching(on) {
    matchmaking = on;
    if (el.mmFindBtn) el.mmFindBtn.classList.toggle("hidden", on);
    if (el.mmCancelBtn) el.mmCancelBtn.classList.toggle("hidden", !on);
    if (el.mmGameSelect) el.mmGameSelect.disabled = on;
  }

  async function findMatch() {
    if (matchmaking) return;
    const gameId = el.mmGameSelect ? el.mmGameSelect.value : "";
    if (!gameId) { setMatchStatus(tt("mmPickGame"), "err"); return; }
    if (!(await ensureConnected())) { setMatchStatus(tt("connectErr"), "err"); return; }
    const playerName = readPlayerName(el.createNameInput, tt("player1"));
    const game = getGameById(gameId);
    setMatchmakingSearching(true);
    setMatchStatus(tt("mmSearching").replace("{game}", game ? gameName(game) : gameId), "info");
    Net.send("queue", { gameId, playerName, auth: authToken() });
  }

  function cancelMatchmaking() {
    if (!matchmaking) return;
    Net.send("unqueue");
    setMatchmakingSearching(false);
    setMatchStatus("", "info");
  }

  if (el.mmFindBtn) el.mmFindBtn.addEventListener("click", findMatch);
  if (el.mmCancelBtn) el.mmCancelBtn.addEventListener("click", cancelMatchmaking);

  // ---- Điều hướng màn hình ----
  function show(viewId) {
    if (viewId !== "lobbyView") stopRoomPolling();
    if (viewId === "menu" && menuCategories.length) {
      refreshDynamicCategories();
      buildCatSidebar();
      renderCategory(currentCategory);
      renderDailyBanner();
    }
    ["menu", "profileView", "detailView", "modeView", "lobbyView", "gameView"].forEach((id) => {
      el[id].classList.toggle("hidden", id !== viewId);
    });
    // Cuộn lên đầu khi đổi màn để không bị kẹt ở vị trí cuộn của màn trước.
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (e) { window.scrollTo(0, 0); }
  }

  el.backBtn.addEventListener("click", goHome);
  el.homeBtn.addEventListener("click", goHome);
  el.modeBackBtn.addEventListener("click", () => show("menu"));
  if (el.detailBackBtn) el.detailBackBtn.addEventListener("click", () => show("menu"));
  if (el.detailPlayBtn) el.detailPlayBtn.addEventListener("click", () => { if (selectedGame) openMode(selectedGame); });
  if (el.profileChip) el.profileChip.addEventListener("click", openProfile);
  if (el.profileBackBtn) el.profileBackBtn.addEventListener("click", () => show("menu"));
  if (el.profileName) el.profileName.addEventListener("input", () => {
    savePlayerName(cleanName(el.profileName.value, ""));
    updateProfileChip();
  });
  if (el.volRange) el.volRange.addEventListener("input", () => Sound.setVolume(el.volRange.value / 100));
  if (el.sfxToggle) el.sfxToggle.addEventListener("change", () => { Sound.setEnabled(el.sfxToggle.checked); updateSoundIcon(); });
  if (el.musicToggle) el.musicToggle.addEventListener("change", () => Sound.setMusic(el.musicToggle.checked));
  el.lobbyBackBtn.addEventListener("click", closeLobby);
  el.restartBtn.addEventListener("click", restartGame);

  // ---- Nút bật/tắt âm thanh ----
  function updateSoundIcon() {
    el.soundToggle.textContent = Sound.isEnabled() ? "🔊" : "🔇";
    el.soundToggle.classList.toggle("muted", !Sound.isEnabled());
  }
  el.soundToggle.addEventListener("click", () => {
    Sound.setEnabled(!Sound.isEnabled());
    updateSoundIcon();
  });
  updateSoundIcon();

  // ---- PWA: nút "Cài app" (thêm vào màn hình chính) ----
  // Chrome/Edge/Android: bắt sự kiện beforeinstallprompt, hiện nút của ta.
  // Nếu đã cài (standalone) hoặc trình duyệt không hỗ trợ thì ẩn nút.
  let deferredInstallPrompt = null;
  function isStandalone() {
    return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }
  if (el.installBtn) {
    if (isStandalone()) el.installBtn.classList.add("hidden");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (!isStandalone()) el.installBtn.classList.remove("hidden");
    });
    el.installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch (e) { /* ignore */ }
      deferredInstallPrompt = null;
      el.installBtn.classList.add("hidden");
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      el.installBtn.classList.add("hidden");
      showToast(tt("installDone"));
    });
  }

  const THEME_KEY = "tpg_theme";
  function applyTheme(theme) {
    const light = theme === "light";
    document.body.classList.toggle("theme-light", light);
    if (el.themeToggle) {
      el.themeToggle.textContent = light ? "☀️" : "🌙";
      el.themeToggle.title = light ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng";
    }
  }
  let currentTheme = "dark";
  try { currentTheme = localStorage.getItem(THEME_KEY) || "dark"; } catch (e) { /* ignore */ }
  applyTheme(currentTheme);
  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", () => {
      currentTheme = currentTheme === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, currentTheme); } catch (e) { /* ignore */ }
      applyTheme(currentTheme);
    });
  }

  // ---- Bộ chọn theme (preset đổi cả nền + màu nhấn) ----
  const ACCENT_KEY = "tpg_accent"; // giữ key cũ để tương thích lựa chọn đã lưu
  // mỗi preset có swatch (gradient hiển thị trên nút) gồm màu nền + màu nhấn
  const PRESETS = [
    { id: "default", vi: "Gỗ ấm (mặc định)", en: "Warm Wood (default)", sw: "linear-gradient(135deg, #2e2417 45%, #e6b455 45%)" },
    { id: "ocean", vi: "Đại dương", en: "Ocean", sw: "linear-gradient(135deg, #123047 45%, #38e0d0 45%)" },
    { id: "sunset", vi: "Hoàng hôn", en: "Sunset", sw: "linear-gradient(135deg, #3a1d3d 45%, #ff8a5c 45%)" },
    { id: "forest", vi: "Rừng xanh", en: "Forest", sw: "linear-gradient(135deg, #15301f 45%, #7ee08a 45%)" },
    { id: "rose", vi: "Hồng đào", en: "Rose", sw: "linear-gradient(135deg, #3a1c2c 45%, #ff7aa8 45%)" },
    { id: "mono", vi: "Xám đêm", en: "Charcoal", sw: "linear-gradient(135deg, #23262e 45%, #c8cdd8 45%)" },
  ];
  let currentPreset = "default";
  try { currentPreset = localStorage.getItem(ACCENT_KEY) || "default"; } catch (e) { /* ignore */ }
  if (!PRESETS.some((p) => p.id === currentPreset)) currentPreset = "default"; // bỏ giá trị accent cũ không còn dùng
  function applyPreset(id) {
    if (id && id !== "default") document.body.dataset.preset = id;
    else delete document.body.dataset.preset;
  }
  applyPreset(currentPreset);
  const accentBtn = $("accentToggle");
  let accentPop = null;
  function onDocClickAccent(e) { if (accentPop && !accentPop.contains(e.target) && e.target !== accentBtn) closeAccentPop(); }
  function closeAccentPop() {
    if (!accentPop) return;
    accentPop.remove(); accentPop = null;
    document.removeEventListener("click", onDocClickAccent, true);
  }
  function openAccentPop() {
    if (accentPop) { closeAccentPop(); return; }
    accentPop = document.createElement("div");
    accentPop.className = "accent-pop";
    const lang = (window.I18n && I18n.getLang) ? I18n.getLang() : "vi";
    PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "accent-sw" + (p.id === currentPreset ? " active" : "");
      b.style.background = p.sw;
      const label = lang === "en" ? p.en : p.vi;
      b.title = label; b.setAttribute("aria-label", label);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        currentPreset = p.id;
        try { localStorage.setItem(ACCENT_KEY, p.id); } catch (e) { /* ignore */ }
        applyPreset(p.id);
        closeAccentPop();
        if (window.Sound) Sound.play("select");
      });
      accentPop.appendChild(b);
    });
    document.body.appendChild(accentPop);
    setTimeout(() => document.addEventListener("click", onDocClickAccent, true), 0);
  }
  if (accentBtn) accentBtn.addEventListener("click", (e) => { e.stopPropagation(); openAccentPop(); });

  // ---- Modal hướng dẫn ----
  function openHelp() {
    if (!selectedGame) return;
    setGameHeading(el.helpTitle, selectedGame);
    const steps = gameHowTo(selectedGame).length ? gameHowTo(selectedGame) : ["Chưa có hướng dẫn cho trò này."];
    el.helpBody.innerHTML = "<ol class='help-list'>" +
      steps.map((s) => `<li>${s}</li>`).join("") +
      "</ol>";
    el.helpOverlay.classList.remove("hidden");
    focusOverlay(el.helpOverlay);
  }
  function closeHelp() { el.helpOverlay.classList.add("hidden"); restoreFocus(); }

  el.helpBtn.addEventListener("click", openHelp);
  el.helpClose.addEventListener("click", closeHelp);
  el.helpOk.addEventListener("click", closeHelp);
  el.helpOverlay.addEventListener("click", (e) => {
    if (e.target === el.helpOverlay) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.helpOverlay.classList.contains("hidden")) closeHelp();
  });

  // ====================== Màn hình chúc mừng ======================
  let confettiRaf = null;
  function showWinScreen(kind, rawText, matchInfo) {
    // bỏ emoji đầu để lấy nội dung gọn
    const msg = rawText.replace(/^[🎉🤝💀]\s*/u, "").trim();
    el.winEmoji.textContent = "";
    el.winEmoji.className = "win-emoji win-" + kind;
    if (kind === "draw") {
      el.winTitle.textContent = tt("drawTitle");
    } else if (kind === "lose") {
      el.winTitle.textContent = tt("loseTitle");
    } else {
      el.winTitle.textContent = tt("winTitle");
    }
    el.winSub.textContent = msg;

    // Best-of-N: giữa loạt đấu thì đổi nút "Chơi lại" thành "Ván tiếp theo";
    // khi cả trận xong thì hiện nhà vô địch.
    matchInProgress = !!(matchInfo && !matchInfo.over);
    if (matchInfo) {
      if (matchInfo.over) {
        const champ = matchInfo.champ;
        el.winTitle.textContent = tt("matchWon")
          .replace("{name}", champ >= 0 ? playerLabel(champ) : "")
          .replace("{p1}", matchWins[0]).replace("{p2}", matchWins[1]);
        el.winAgain.textContent = tt("restart");
      } else {
        el.winSub.textContent = tt("matchGameWin")
          .replace("{game}", matchGameNo)
          .replace("{name}", kind === "draw" ? tt("drawTitle").replace(/[!.]$/, "") : (lastWinner >= 0 ? playerLabel(lastWinner) : ""))
          .replace("{p1}", matchWins[0]).replace("{p2}", matchWins[1]);
        el.winAgain.textContent = tt("matchNext");
      }
    } else {
      el.winAgain.textContent = online ? tt("againLocal") : tt("restart");
    }

    lastWinSummary = (el.winTitle.textContent || "").replace(/!$/, "");
    if (el.winReplay) el.winReplay.classList.toggle("hidden", !(replayMeta && replayMoves.length));
    el.winOverlay.classList.remove("hidden");
    if (kind !== "lose") startConfetti();
  }

  function hideWinScreen() {
    el.winOverlay.classList.add("hidden");
    stopConfetti();
  }

  // ====================== Xem lại ván (replay) ======================
  function makeReplayContext(seed) {
    const rscores = [0, 0];
    return {
      boardEl: el.replayBoard,
      isOnline: true,
      mySeat: -1,            // -1 => không tương tác được (chế độ xem)
      roomSeat: -1,
      firstSeat: replayMeta ? replayMeta.firstSeat : 0,
      round: replayMeta ? replayMeta.round : 1,
      rng: window.makeRng(seed || 1),
      options: replayMeta ? replayMeta.options : {},
      setStatus(text) { if (el.replayStatus) el.replayStatus.textContent = text || ""; },
      setTurn() {},
      setNames() {},
      incScore(idx) { rscores[idx]++; },
      decScore(idx) { rscores[idx] = Math.max(0, rscores[idx] - 1); },
      getScore(idx) { return rscores[idx]; },
      sendMove() {},
      sound() {},
      t(vi, en) { return (window.I18n && I18n.getLang() === "en" && en != null) ? en : vi; },
    };
  }

  function rebuildReplay(n) {
    if (replayInstance && typeof replayInstance.destroy === "function") {
      try { replayInstance.destroy(); } catch (e) { /* ignore */ }
    }
    replayInstance = null;
    el.replayBoard.innerHTML = "";
    const game = getGameById(replayMeta.gameId);
    if (!game) return;
    const ctx = makeReplayContext(replaySeed);
    replayInstance = game.create(ctx);
    const count = Math.max(0, Math.min(n, replayMoves.length));
    for (let i = 0; i < count; i++) {
      try { replayInstance.applyMove(replayMoves[i], true); } catch (e) { /* ignore */ }
    }
    replayIdx = count;
    updateReplayUi();
  }

  function updateReplayUi() {
    if (el.replayProgress) el.replayProgress.textContent = `${replayIdx}/${replayMoves.length}`;
    if (el.replayPrev) el.replayPrev.disabled = replayIdx <= 0;
    if (el.replayNext) el.replayNext.disabled = replayIdx >= replayMoves.length;
  }

  function replayStepForward() {
    if (replayIdx >= replayMoves.length) { stopReplayPlay(); return; }
    try { replayInstance.applyMove(replayMoves[replayIdx], true); } catch (e) { /* ignore */ }
    replayIdx++;
    updateReplayUi();
    if (replayIdx >= replayMoves.length) stopReplayPlay();
  }

  function stopReplayPlay() {
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    if (el.replayPlay) el.replayPlay.textContent = tt("replayPlay");
  }
  function toggleReplayPlay() {
    if (replayTimer) { stopReplayPlay(); return; }
    if (replayIdx >= replayMoves.length) rebuildReplay(0);
    el.replayPlay.textContent = tt("replayPause");
    replayTimer = setInterval(replayStepForward, 950);
  }

  function openReplay() {
    if (!replayMeta || !replayMoves.length) return;
    const game = getGameById(replayMeta.gameId);
    if (el.replayTitle) el.replayTitle.textContent = tt("replayTitle").replace("{game}", game ? game.name : "");
    el.replayOverlay.classList.remove("hidden");
    rebuildReplay(0);
    focusOverlay(el.replayOverlay);
  }
  function closeReplay() {
    stopReplayPlay();
    if (replayInstance && typeof replayInstance.destroy === "function") {
      try { replayInstance.destroy(); } catch (e) { /* ignore */ }
    }
    replayInstance = null;
    el.replayBoard.innerHTML = "";
    el.replayOverlay.classList.add("hidden");
    restoreFocus();
  }

  if (el.winReplay) el.winReplay.addEventListener("click", openReplay);
  if (el.replayClose) el.replayClose.addEventListener("click", closeReplay);
  if (el.replayStart) el.replayStart.addEventListener("click", () => { stopReplayPlay(); rebuildReplay(0); });
  if (el.replayPrev) el.replayPrev.addEventListener("click", () => { stopReplayPlay(); rebuildReplay(replayIdx - 1); });
  if (el.replayNext) el.replayNext.addEventListener("click", () => { stopReplayPlay(); replayStepForward(); });
  if (el.replayPlay) el.replayPlay.addEventListener("click", toggleReplayPlay);

  function startConfetti() {
    const cv = el.winConfetti;
    const g = cv.getContext("2d");
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const colors = ["#ff5d73", "#4dd0e1", "#ffd166", "#6ee7b7", "#c9a98a", "#e9ecff"];
    const pieces = [];
    for (let i = 0; i < 140; i++) {
      pieces.push({
        x: Math.random() * cv.width,
        y: Math.random() * -cv.height,
        w: 6 + Math.random() * 7,
        h: 8 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: 2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: -0.15 + Math.random() * 0.3,
      });
    }
    function tick() {
      g.clearRect(0, 0, cv.width, cv.height);
      pieces.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y > cv.height + 20) { p.y = -20; p.x = Math.random() * cv.width; }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      });
      // sau ~4.5s ngừng sinh, để pháo giấy rơi hết thì tự dừng nhẹ
      confettiRaf = requestAnimationFrame(tick);
    }
    stopConfetti();
    tick();
  }
  function stopConfetti() {
    if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null; }
    const g = el.winConfetti.getContext("2d");
    g && g.clearRect(0, 0, el.winConfetti.width, el.winConfetti.height);
  }

  el.winAgain.addEventListener("click", () => {
    if (online) {
      restartGame();
      return;
    }
    hideWinScreen();
    // Giữa loạt đấu best-of: sang ván tiếp theo (giữ tỉ số trận, đổi người đi trước).
    if (matchInProgress) {
      matchInProgress = false;
      startNextMatchGame();
      return;
    }
    // Trận đã xong (hoặc chơi đơn): chơi lại từ đầu trận.
    if (bestOf > 1) resetMatch();
    restartGame();
  });
  el.winMenu.addEventListener("click", () => { hideWinScreen(); goHome(); });

  if (el.undoBtn) {
    el.undoBtn.addEventListener("click", () => {
      if (online) return;
      if (instance && typeof instance.undo === "function") {
        const undone = instance.undo();
        if (undone) { resultRecorded = false; Sound.play("select"); }
      }
    });
  }

  if (el.gameSearch) {
    el.gameSearch.addEventListener("input", () => runSearch(el.gameSearch.value));
  }
  if (el.sortSelect) {
    el.sortSelect.addEventListener("change", () => { sortMode = el.sortSelect.value; shownCount = PAGE_SIZE; applyListView(); });
  }
  if (el.chipOnline) {
    el.chipOnline.addEventListener("click", () => { filterOnline = !filterOnline; el.chipOnline.classList.toggle("on", filterOnline); shownCount = PAGE_SIZE; applyListView(); });
  }
  if (el.chipAI) {
    el.chipAI.addEventListener("click", () => { filterAI = !filterAI; el.chipAI.classList.toggle("on", filterAI); shownCount = PAGE_SIZE; applyListView(); });
  }
  if (el.loadMoreBtn) {
    el.loadMoreBtn.addEventListener("click", () => { shownCount += PAGE_SIZE; applyListView(); });
  }

  // ====================== Tour hướng dẫn lần đầu ======================
  const TOUR_KEY = "tpg_onboarded";
  const TOUR_STEPS = [
    { sel: "#catSidebar", titleKey: "tour1T", textKey: "tour1X" },
    { sel: "#gameSearch", titleKey: "tour2T", textKey: "tour2X" },
    { sel: "#dailyBanner", titleKey: "tour3T", textKey: "tour3X" },
    { sel: "#profileChip", titleKey: "tour4T", textKey: "tour4X" },
    { sel: "#openOnlineHubBtn", titleKey: "tour5T", textKey: "tour5X" },
  ];
  let tourIdx = 0;
  let tourList = [];

  function positionTourStep() {
    const step = tourList[tourIdx];
    const target = document.querySelector(step.sel);
    if (!target) { nextTourStep(); return; }
    const r = target.getBoundingClientRect();
    const pad = 8;
    const ring = el.tourRing;
    ring.style.top = (r.top - pad) + "px";
    ring.style.left = (r.left - pad) + "px";
    ring.style.width = (r.width + pad * 2) + "px";
    ring.style.height = (r.height + pad * 2) + "px";
    el.tourTitle.textContent = tt(step.titleKey);
    el.tourText.textContent = tt(step.textKey);
    el.tourStep.textContent = `${tourIdx + 1}/${tourList.length}`;
    el.tourNext.textContent = tourIdx >= tourList.length - 1
      ? tt("tourDone")
      : (window.I18n ? I18n.t("tourNext") : "Tiếp");
    // đặt thẻ tour: dưới nếu còn chỗ, không thì trên
    const card = el.tourCard;
    card.style.visibility = "hidden";
    card.style.display = "block";
    requestAnimationFrame(() => {
      const ch = card.offsetHeight;
      const cw = card.offsetWidth;
      let top = r.bottom + 14;
      if (top + ch > window.innerHeight - 10) top = Math.max(10, r.top - ch - 14);
      let left = r.left + r.width / 2 - cw / 2;
      left = Math.max(10, Math.min(window.innerWidth - cw - 10, left));
      card.style.top = top + "px";
      card.style.left = left + "px";
      card.style.visibility = "visible";
    });
  }

  function nextTourStep() {
    tourIdx++;
    if (tourIdx >= tourList.length) { endTour(); return; }
    positionTourStep();
  }

  function endTour() {
    el.tourOverlay.classList.add("hidden");
    try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) { /* ignore */ }
    window.removeEventListener("resize", positionTourStep);
    restoreFocus();
  }

  function startTour() {
    tourList = TOUR_STEPS.filter((s) => {
      const t = document.querySelector(s.sel);
      return t && t.offsetParent !== null;
    });
    if (!tourList.length) return;
    tourIdx = 0;
    el.tourOverlay.classList.remove("hidden");
    positionTourStep();
    window.addEventListener("resize", positionTourStep);
    focusOverlay(el.tourCard);
  }

  if (el.tourNext) el.tourNext.addEventListener("click", nextTourStep);
  if (el.tourSkip) el.tourSkip.addEventListener("click", endTour);
  if (el.replayTourBtn) el.replayTourBtn.addEventListener("click", () => {
    show("menu");
    setTimeout(startTour, 200);
  });

  // ---- Chia sẻ (Web Share API + fallback clipboard) ----
  function tt(key) { return window.I18n ? I18n.t(key) : key; }
  async function shareOrCopy(text, url) {
    try {
      if (navigator.share) {
        await navigator.share({ title: tt("shareTitle"), text, url: url || location.href });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try {
      await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
      showToast(tt("shareCopied"));
    } catch (e) { showToast(url ? `${text} ${url}` : text); }
  }
  function shareResult() {
    const gameName = selectedGame ? selectedGame.name : "Game 2 Người";
    const result = lastWinSummary || "🎮";
    const text = tt("shareResultText").replace("{game}", gameName).replace("{result}", result);
    shareOrCopy(text, location.origin + location.pathname);
  }
  function shareRoom() {
    const code = el.roomCodeVal ? el.roomCodeVal.textContent : "";
    const url = location.origin + location.pathname;
    const text = tt("shareRoomText").replace("{code}", code).replace("{url}", "").trim();
    shareOrCopy(text, url);
  }
  if (el.winShare) el.winShare.addEventListener("click", shareResult);
  if (el.shareCodeBtn) el.shareCodeBtn.addEventListener("click", shareRoom);
  if (el.histGameFilter) el.histGameFilter.addEventListener("change", renderHistory);
  if (el.histModeFilter) el.histModeFilter.addEventListener("change", renderHistory);
  if (el.histList) el.histList.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest(".hist-replay") : null;
    if (btn && btn.dataset && btn.dataset.rid) openSavedReplay(btn.dataset.rid);
  });

  // ---- Quản lý dữ liệu cá nhân (xuất / nhập / xóa) ----
  function collectData() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("tpg_") === 0) out[k] = localStorage.getItem(k);
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  function exportData() {
    const payload = { app: "TwoPlayerGames", version: 1, exportedAt: new Date().toISOString(), data: collectData() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `game2nguoi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(tt("exportOk"));
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = parsed && parsed.data ? parsed.data : parsed;
        if (!data || typeof data !== "object") throw new Error("bad");
        Object.keys(data).forEach((k) => {
          if (k.indexOf("tpg_") === 0 && typeof data[k] === "string") localStorage.setItem(k, data[k]);
        });
        showToast(tt("importOk"));
        setTimeout(() => location.reload(), 900);
      } catch (e) { showToast(tt("importBad")); }
    };
    reader.readAsText(file);
  }
  function clearData() {
    if (!window.confirm(tt("clearConfirm"))) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("tpg_") === 0) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
    location.reload();
  }
  if (el.exportDataBtn) el.exportDataBtn.addEventListener("click", exportData);
  if (el.importDataBtn) el.importDataBtn.addEventListener("click", () => el.importDataFile && el.importDataFile.click());
  if (el.importDataFile) el.importDataFile.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importData(f); e.target.value = ""; });
  if (el.clearDataBtn) el.clearDataBtn.addEventListener("click", clearData);

  // ---- Điều hướng lưới game bằng phím mũi tên ----
  if (el.gameGrid) {
    el.gameGrid.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const cards = [...el.gameGrid.querySelectorAll(".game-card")];
      if (!cards.length) return;
      const cur = document.activeElement;
      const idx = cards.indexOf(cur);
      if (idx < 0) { cards[0].focus(); e.preventDefault(); return; }
      let next = idx;
      if (e.key === "ArrowLeft") next = idx - 1;
      else if (e.key === "ArrowRight") next = idx + 1;
      else {
        // lên/xuống: nhảy theo hàng dựa vào vị trí thực tế
        const r = cur.getBoundingClientRect();
        const sameCol = (c) => Math.abs(c.getBoundingClientRect().left - r.left) < 8;
        const below = e.key === "ArrowDown";
        const candidates = cards
          .map((c, i) => ({ c, i, top: c.getBoundingClientRect().top }))
          .filter((o) => (below ? o.top > r.top + 4 : o.top < r.top - 4) && sameCol(o.c));
        if (candidates.length) {
          candidates.sort((a, b) => below ? a.top - b.top : b.top - a.top);
          next = candidates[0].i;
        }
      }
      if (next >= 0 && next < cards.length && next !== idx) {
        cards[next].focus();
        e.preventDefault();
      }
    });
  }

  // ---- Bẫy focus trong overlay (Tab vòng trong) ----
  let lastFocusBeforeOverlay = null;
  function focusableIn(container) {
    return [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.disabled && node.offsetParent !== null);
  }
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const container = (el.tourOverlay && !el.tourOverlay.classList.contains("hidden")) ? el.tourCard
      : (el.replayOverlay && !el.replayOverlay.classList.contains("hidden")) ? el.replayOverlay
      : (el.helpOverlay && !el.helpOverlay.classList.contains("hidden")) ? el.helpOverlay
      : null;
    if (!container) return;
    const items = focusableIn(container);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  document.addEventListener("keydown", trapFocus);
  function focusOverlay(container) {
    lastFocusBeforeOverlay = document.activeElement;
    const items = focusableIn(container);
    if (items.length) setTimeout(() => items[0].focus(), 30);
  }
  function restoreFocus() {
    if (lastFocusBeforeOverlay && typeof lastFocusBeforeOverlay.focus === "function") {
      try { lastFocusBeforeOverlay.focus(); } catch (e) { /* ignore */ }
    }
    lastFocusBeforeOverlay = null;
  }

  // Phím Escape đóng overlay đang mở (ưu tiên từ trên xuống)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (el.tourOverlay && !el.tourOverlay.classList.contains("hidden")) { endTour(); return; }
    if (el.replayOverlay && !el.replayOverlay.classList.contains("hidden")) { closeReplay(); return; }
    if (el.helpOverlay && !el.helpOverlay.classList.contains("hidden")) { closeHelp(); return; }
    if (el.winOverlay && !el.winOverlay.classList.contains("hidden")) { hideWinScreen(); return; }
  });

  // Phím mũi tên/space điều khiển trình xem lại ván khi overlay replay đang mở.
  document.addEventListener("keydown", (e) => {
    if (!el.replayOverlay || el.replayOverlay.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); stopReplayPlay(); rebuildReplay(replayIdx - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stopReplayPlay(); replayStepForward(); }
    else if (e.key === " ") { e.preventDefault(); toggleReplayPlay(); }
    else if (e.key === "Home") { e.preventDefault(); stopReplayPlay(); rebuildReplay(0); }
    else if (e.key === "End") { e.preventDefault(); stopReplayPlay(); rebuildReplay(replayMoves.length); }
  });

  function maybeStartTour() {
    let done = "1";
    try { done = localStorage.getItem(TOUR_KEY); } catch (e) { /* ignore */ }
    if (done) return;
    // chỉ chạy khi đang ở menu
    if (el.menu && !el.menu.classList.contains("hidden")) {
      setTimeout(startTour, 700);
    }
  }

  // ---- Ngôn ngữ (i18n) ----
  function updateLangBtn() {
    if (el.langToggle && window.I18n) el.langToggle.textContent = I18n.getLang() === "en" ? "EN" : "VI";
  }
  if (window.I18n) {
    I18n.apply();
    updateLangBtn();
    I18n.onChange(() => {
      updateLangBtn();
      renderMenu();
      updateProfileChip();
      if (el.profileView && !el.profileView.classList.contains("hidden")) openProfile();
    });
    if (el.langToggle) el.langToggle.addEventListener("click", () => I18n.toggle());
  }

  // ---- Tiết kiệm tài nguyên khi tab ẩn ----
  // (Vòng lặp requestAnimationFrame được trình duyệt tự tạm dừng ở tab nền;
  //  ở đây ta tạm dừng thêm nhạc nền để đỡ tốn pin/CPU, rồi resume khi quay lại.)
  let musicPausedByHidden = false;
  document.addEventListener("visibilitychange", () => {
    if (!window.Sound) return;
    if (document.hidden) {
      if (Sound.isMusicOn()) { Sound.stopMusic(); musicPausedByHidden = true; }
    } else if (musicPausedByHidden) {
      musicPausedByHidden = false;
      if (Sound.isMusicOn()) Sound.startMusic();
    }
  });

  renderMenu();
  if (!attemptResume()) handleRoute();
  updateProfileChip();
  maybeStartTour();
  if (window.Sound && Sound.isMusicOn()) Sound.startMusic();
})();
