/* Auction War - đấu giá kín, quản lý tiền và định giá tài sản. */
(function () {
  const TYPE_INFO = {
    land: { name: "Đất", emoji: "🏝️" },
    resource: { name: "Tài nguyên", emoji: "⛏️" },
    relic: { name: "Đồ hiếm", emoji: "💎" },
    contract: { name: "Hợp đồng", emoji: "📜" },
    intel: { name: "Tin tức", emoji: "🕵️" },
  };

  const CATALOG = [
    { name: "Bến cảng cũ", emoji: "⚓", type: "land", base: 24, swing: 8, text: "Đất tốt để gom bộ, giá dễ bị đẩy cao." },
    { name: "Khu phố đêm", emoji: "🌃", type: "land", base: 28, swing: 15, text: "Biên độ lớn, lời nhiều hoặc mua hớ rất đau." },
    { name: "Đảo san hô", emoji: "🏝️", type: "land", base: 23, swing: 10, text: "Giá trị ổn nếu bạn đang thiếu Đất." },
    { name: "Trang trại năng lượng", emoji: "🌾", type: "land", base: 20, swing: 7, text: "Món an toàn, ít biến động." },
    { name: "Kho lạnh ven sông", emoji: "🏚️", type: "land", base: 18, swing: 9, text: "Rẻ nhưng có thể thành món ghép bộ tốt." },
    { name: "Mỏ bạc lộ thiên", emoji: "⛏️", type: "resource", base: 25, swing: 8, text: "Tài nguyên ghép tốt với Hợp đồng." },
    { name: "Kho gia vị", emoji: "🧂", type: "resource", base: 19, swing: 10, text: "Dễ bị đánh giá sai nếu chỉ nhìn khoảng giá." },
    { name: "Giếng dầu nhỏ", emoji: "🛢️", type: "resource", base: 30, swing: 13, text: "Món đắt, hợp để dụ đối thủ tiêu tiền." },
    { name: "Xưởng gỗ đỏ", emoji: "🪵", type: "resource", base: 17, swing: 6, text: "Không hào nhoáng nhưng khó mua hớ nặng." },
    { name: "Kho quặng lạ", emoji: "🪨", type: "resource", base: 22, swing: 14, text: "Rủi ro cao, giá thật có thể lệch mạnh." },
    { name: "Vương miện nứt", emoji: "👑", type: "relic", base: 31, swing: 14, text: "Đồ hiếm càng nhiều càng được cộng bonus." },
    { name: "Đồng hồ thiên văn", emoji: "🕰️", type: "relic", base: 27, swing: 11, text: "Món hiếm có giá sàn khá tốt." },
    { name: "Tranh mất dấu", emoji: "🖼️", type: "relic", base: 21, swing: 18, text: "Có thể là kiệt tác hoặc chỉ là bản sao." },
    { name: "Ngọc ấn hoàng gia", emoji: "💍", type: "relic", base: 34, swing: 12, text: "Giá cao, phù hợp khi còn nhiều tiền mặt." },
    { name: "Bản đồ kho báu", emoji: "🗺️", type: "relic", base: 18, swing: 16, text: "Món bluff mạnh vì khoảng giá rộng." },
    { name: "Hợp đồng vận tải", emoji: "🚚", type: "contract", base: 18, swing: 5, text: "Ghép với Tài nguyên để ăn bonus cuối ván." },
    { name: "Giấy phép khai thác", emoji: "📋", type: "contract", base: 24, swing: 8, text: "Đắt hơn nhưng dễ tạo combo." },
    { name: "Độc quyền chợ đêm", emoji: "🏪", type: "contract", base: 26, swing: 12, text: "Có thể kéo điểm cuối ván nếu trả đúng giá." },
    { name: "Đơn hàng quân nhu", emoji: "📦", type: "contract", base: 20, swing: 7, text: "Món ổn định để giữ nhịp điểm." },
    { name: "Bảo hiểm thương thuyền", emoji: "🛡️", type: "contract", base: 16, swing: 6, text: "Không lớn nhưng ít rủi ro." },
    { name: "Sổ nợ quý tộc", emoji: "📕", type: "intel", base: 17, swing: 15, text: "Tin tức giúp ăn bonus đa dạng cuối ván." },
    { name: "Tin đồn sáp nhập", emoji: "📰", type: "intel", base: 15, swing: 20, text: "Món cực khó định giá, hợp để bẫy giá." },
    { name: "Hồ sơ mật", emoji: "🗂️", type: "intel", base: 22, swing: 12, text: "Nếu gom đủ loại tài sản, Tin tức rất có giá." },
    { name: "Danh sách khách VIP", emoji: "📇", type: "intel", base: 19, swing: 9, text: "Vừa có điểm, vừa hỗ trợ bonus đa dạng." },
    { name: "Mật báo ngân hàng", emoji: "🔐", type: "intel", base: 25, swing: 17, text: "Món cuối ván dễ tạo cú lật điểm." },
  ];

  // Câu chuyện gợi ý giá thật: cao / thấp / trung bình so với ước tính.
  // Người chơi đọc kỹ sẽ định giá tốt hơn (nhưng vẫn chừa chút mơ hồ để bluff).
  const CLUES = {
    high: [
      "🔥 Một tay buôn lớn vừa lùng mua món y hệt với giá hời.",
      "✨ Tình trạng gần như hoàn hảo, giấy tờ gốc còn đủ.",
      "👑 Tương truyền món này từng thuộc về một gia tộc quyền quý.",
      "📈 Giá loại này đang lên từng ngày trên chợ đen.",
      "💯 Chuyên gia thẩm định gật gù: 'hàng thật, hàng tốt'.",
      "🏆 Vừa có người trả hụt món tương tự ở phiên trước.",
    ],
    low: [
      "🩹 Có vết hư hỏng kín đáo mà người bán cố giấu.",
      "🕳️ Món này đã ế nhiều phiên, chẳng ai mặn mà.",
      "🎭 Vài chuyên gia nghi đây chỉ là bản sao khéo léo.",
      "📉 Giá loại này vừa rớt mạnh sau một vụ bê bối.",
      "⚠️ Chủ cũ vội vã tống đi với giá rẻ — có gì đó không ổn.",
      "🐀 Nghe đồn món này 'có dớp', qua tay ai cũng lỗ.",
    ],
    mid: [
      "🤷 Thị trường còn lưỡng lự, kẻ khen người chê.",
      "📊 Tình trạng tạm ổn, không có gì quá nổi bật.",
      "🌫️ Thông tin về món này khá mập mờ.",
      "⚖️ Giá trị có thể nhỉnh hơn hoặc kém chút so với ước tính.",
      "🔍 Cần xem tận nơi mới rõ, nhìn xa thì khó nói.",
    ],
  };

  function create(ctx) {
    const options = ctx.options || {};
    const ROUNDS = options.rounds || 10;
    const START_CASH = options.cash || 140;

    // bản dịch dữ liệu/flavor (hằng module-level) — tra cứu VN→EN
    const TYPE_EN = { land: "Land", resource: "Resource", relic: "Relic", contract: "Contract", intel: "Intel" };
    const FLAVOR_EN = {
      "Bến cảng cũ": "Old harbor", "Khu phố đêm": "Night district", "Đảo san hô": "Coral island", "Trang trại năng lượng": "Energy farm", "Kho lạnh ven sông": "Riverside cold store",
      "Mỏ bạc lộ thiên": "Open silver mine", "Kho gia vị": "Spice warehouse", "Giếng dầu nhỏ": "Small oil well", "Xưởng gỗ đỏ": "Redwood mill", "Kho quặng lạ": "Strange ore stock",
      "Vương miện nứt": "Cracked crown", "Đồng hồ thiên văn": "Astronomical clock", "Tranh mất dấu": "Lost painting", "Ngọc ấn hoàng gia": "Royal jade seal", "Bản đồ kho báu": "Treasure map",
      "Hợp đồng vận tải": "Shipping contract", "Giấy phép khai thác": "Mining license", "Độc quyền chợ đêm": "Night market monopoly", "Đơn hàng quân nhu": "Military supply order", "Bảo hiểm thương thuyền": "Merchant fleet insurance",
      "Sổ nợ quý tộc": "Noble debt ledger", "Tin đồn sáp nhập": "Merger rumor", "Hồ sơ mật": "Secret dossier", "Danh sách khách VIP": "VIP guest list", "Mật báo ngân hàng": "Bank tip-off",
      "Đất tốt để gom bộ, giá dễ bị đẩy cao.": "Good land for sets; price easily bid up.",
      "Biên độ lớn, lời nhiều hoặc mua hớ rất đau.": "Wide swing; big profit or painful overpay.",
      "Giá trị ổn nếu bạn đang thiếu Đất.": "Solid value if you're short on Land.",
      "Món an toàn, ít biến động.": "A safe pick, low volatility.",
      "Rẻ nhưng có thể thành món ghép bộ tốt.": "Cheap but can become a good set piece.",
      "Tài nguyên ghép tốt với Hợp đồng.": "Resource that pairs well with Contracts.",
      "Dễ bị đánh giá sai nếu chỉ nhìn khoảng giá.": "Easy to misjudge from the range alone.",
      "Món đắt, hợp để dụ đối thủ tiêu tiền.": "Pricey, good to bait the opponent into spending.",
      "Không hào nhoáng nhưng khó mua hớ nặng.": "Not flashy but hard to badly overpay.",
      "Rủi ro cao, giá thật có thể lệch mạnh.": "High risk; true value can swing hard.",
      "Đồ hiếm càng nhiều càng được cộng bonus.": "The more relics, the bigger the bonus.",
      "Món hiếm có giá sàn khá tốt.": "A relic with a decent price floor.",
      "Có thể là kiệt tác hoặc chỉ là bản sao.": "Could be a masterpiece or just a copy.",
      "Giá cao, phù hợp khi còn nhiều tiền mặt.": "High price, good when you have plenty of cash.",
      "Món bluff mạnh vì khoảng giá rộng.": "A strong bluff piece due to its wide range.",
      "Ghép với Tài nguyên để ăn bonus cuối ván.": "Pair with Resources for an end-game bonus.",
      "Đắt hơn nhưng dễ tạo combo.": "Pricier but easy to combo.",
      "Có thể kéo điểm cuối ván nếu trả đúng giá.": "Can boost the end-game score if priced right.",
      "Món ổn định để giữ nhịp điểm.": "A stable pick to keep your score pace.",
      "Không lớn nhưng ít rủi ro.": "Not big but low risk.",
      "Tin tức giúp ăn bonus đa dạng cuối ván.": "Intel helps with diverse end-game bonuses.",
      "Món cực khó định giá, hợp để bẫy giá.": "Very hard to value; good for price traps.",
      "Nếu gom đủ loại tài sản, Tin tức rất có giá.": "With all asset types, Intel is very valuable.",
      "Vừa có điểm, vừa hỗ trợ bonus đa dạng.": "Scores points and supports diverse bonuses.",
      "Món cuối ván dễ tạo cú lật điểm.": "An end-game piece that can flip the score.",
      "🔥 Một tay buôn lớn vừa lùng mua món y hệt với giá hời.": "🔥 A big dealer just snapped up an identical item for a steal.",
      "✨ Tình trạng gần như hoàn hảo, giấy tờ gốc còn đủ.": "✨ Near-perfect condition, original papers intact.",
      "👑 Tương truyền món này từng thuộc về một gia tộc quyền quý.": "👑 Said to have belonged to a noble family.",
      "📈 Giá loại này đang lên từng ngày trên chợ đen.": "📈 This type is rising daily on the black market.",
      "💯 Chuyên gia thẩm định gật gù: 'hàng thật, hàng tốt'.": "💯 The appraiser nods: 'genuine and good'.",
      "🏆 Vừa có người trả hụt món tương tự ở phiên trước.": "🏆 Someone just missed out on a similar item last round.",
      "🩹 Có vết hư hỏng kín đáo mà người bán cố giấu.": "🩹 A hidden flaw the seller is trying to conceal.",
      "🕳️ Món này đã ế nhiều phiên, chẳng ai mặn mà.": "🕳️ Unsold for many rounds; nobody's keen.",
      "🎭 Vài chuyên gia nghi đây chỉ là bản sao khéo léo.": "🎭 Some experts suspect it's a clever copy.",
      "📉 Giá loại này vừa rớt mạnh sau một vụ bê bối.": "📉 This type just crashed after a scandal.",
      "⚠️ Chủ cũ vội vã tống đi với giá rẻ — có gì đó không ổn.": "⚠️ The owner is dumping it cheap — something's off.",
      "🐀 Nghe đồn món này 'có dớp', qua tay ai cũng lỗ.": "🐀 Rumor says it's 'cursed'; everyone who owns it loses.",
      "🤷 Thị trường còn lưỡng lự, kẻ khen người chê.": "🤷 The market is undecided, mixed opinions.",
      "📊 Tình trạng tạm ổn, không có gì quá nổi bật.": "📊 Condition is okay, nothing outstanding.",
      "🌫️ Thông tin về món này khá mập mờ.": "🌫️ Info on this item is rather vague.",
      "⚖️ Giá trị có thể nhỉnh hơn hoặc kém chút so với ước tính.": "⚖️ Value may be slightly above or below the estimate.",
      "🔍 Cần xem tận nơi mới rõ, nhìn xa thì khó nói.": "🔍 Need a close look; hard to tell from afar.",
    };
    const tr = (s) => ctx.t(s, FLAVOR_EN[s] || s);
    const typeName = (t) => ctx.t(TYPE_INFO[t].name, TYPE_EN[t] || TYPE_INFO[t].name);

    const deck = buildDeck(ctx.rng).slice(0, ROUNDS);
    let round = 0;
    let cash = [START_CASH, START_CASH];
    let holdings = [[], []];
    let bids = [null, null];
    let phase = "bidding";
    let localBidder = bidOrder()[0];
    let result = null;
    let over = false;
    const history = [];

    const root = document.createElement("div");
    root.className = "aw-root";
    root.innerHTML = `
      <div class="aw-top" id="awTop"></div>
      <div class="aw-stage">
        <div class="aw-item" id="awItem"></div>
        <div class="aw-bid-panel" id="awPanel"></div>
      </div>
      <div class="aw-portfolios" id="awPortfolios"></div>
      <div class="aw-history" id="awHistory"></div>
    `;
    ctx.boardEl.appendChild(root);

    const topEl = root.querySelector("#awTop");
    const itemEl = root.querySelector("#awItem");
    const panelEl = root.querySelector("#awPanel");
    const portfoliosEl = root.querySelector("#awPortfolios");
    const historyEl = root.querySelector("#awHistory");

    function buildDeck(rng) {
      const cards = CATALOG.map((base, idx) => {
        const raw = base.base - base.swing + Math.floor(rng() * (base.swing * 2 + 1));
        const trueValue = Math.max(4, raw);
        const low = Math.max(1, base.base - base.swing);
        const high = base.base + base.swing;
        // chọn câu chuyện gợi ý theo vị trí giá thật trong khoảng [low, high]
        const ratio = (trueValue - low) / Math.max(1, high - low);
        let bucket;
        if (ratio >= 0.62) bucket = "high";
        else if (ratio <= 0.38) bucket = "low";
        else bucket = "mid";
        const pool = CLUES[bucket];
        const clue = pool[Math.floor(rng() * pool.length)];
        return { ...base, id: idx, trueValue, low, high, clue };
      });
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      return cards;
    }

    function currentItem() {
      return deck[round] || null;
    }

    function bidOrder() {
      return round % 2 === 0 ? [0, 1] : [1, 0];
    }

    function activeBidder() {
      if (ctx.isOnline) return bids[ctx.mySeat] === null ? ctx.mySeat : 1 - ctx.mySeat;
      return localBidder;
    }

    function canBid() {
      if (over || phase !== "bidding") return false;
      if (ctx.isOnline) return bids[ctx.mySeat] === null;
      return localBidder !== null && bids[localBidder] === null;
    }

    function submitBid(amount) {
      if (!canBid()) return;
      const seat = ctx.isOnline ? ctx.mySeat : localBidder;
      applyMove({ kind: "bid", seat, amount }, false);
    }

    function applyMove(move, fromRemote) {
      if (over) return;

      if (move.kind === "bid") {
        if (phase !== "bidding") return;
        const seat = ctx.isOnline ? (fromRemote ? 1 - ctx.mySeat : ctx.mySeat) : Number(move.seat);
        if (seat !== 0 && seat !== 1) return;
        if (bids[seat] !== null) return;

        const amount = clampInt(move.amount, 0, cash[seat]);
        bids[seat] = amount;
        if (!fromRemote) ctx.sendMove({ kind: "bid", amount });

        if (!ctx.isOnline) {
          const order = bidOrder();
          const next = order.find((p) => bids[p] === null);
          localBidder = next === undefined ? null : next;
        }

        ctx.sound("select");
        if (bids[0] !== null && bids[1] !== null) resolveAuction();
        else updateTurnAndStatus();
        render();
        return;
      }

      if (move.kind === "next") {
        if (phase !== "result") return;
        if (!fromRemote) ctx.sendMove({ kind: "next" });
        nextRound();
      }
    }

    function clampInt(value, min, max) {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    }

    function resolveAuction() {
      const item = currentItem();
      phase = "result";
      localBidder = null;

      const [a, b] = bids;
      if (a === 0 && b === 0) {
        result = {
          kind: "nosale",
          text: ctx.t(`${item.name} bị bỏ qua. Không ai mất tiền.`, `${tr(item.name)} was passed. No one paid.`),
        };
      } else if (a === b) {
        const fee0 = Math.min(cash[0], Math.max(2, Math.ceil(a * 0.1)));
        const fee1 = Math.min(cash[1], Math.max(2, Math.ceil(b * 0.1)));
        cash[0] -= fee0;
        cash[1] -= fee1;
        result = {
          kind: "tie",
          text: ctx.t(`Hai bên cùng trả ${a}. Phiên đấu giá hỏng, P1 mất ${fee0} phí, P2 mất ${fee1} phí.`, `Both bid ${a}. Auction void; P1 loses ${fee0} fee, P2 loses ${fee1} fee.`),
        };
      } else {
        const winner = a > b ? 0 : 1;
        const price = bids[winner];
        const profit = item.trueValue - price;
        cash[winner] -= price;
        holdings[winner].push({ ...item, paid: price, round: round + 1 });
        result = {
          kind: "sold",
          winner,
          price,
          profit,
          text: ctx.t(`Người chơi ${winner + 1} mua ${item.name} với ${price}. Giá thật ${item.trueValue} (${profit >= 0 ? "lời" : "hớ"} ${Math.abs(profit)}).`, `Player ${winner + 1} bought ${tr(item.name)} for ${price}. True value ${item.trueValue} (${profit >= 0 ? "profit" : "overpaid"} ${Math.abs(profit)}).`),
        };
      }

      history.unshift({
        round: round + 1,
        item,
        bids: bids.slice(),
        text: result.text,
      });
      while (history.length > 6) history.pop();
      ctx.sound(result.kind === "sold" ? "capture" : "error");
      updateTurnAndStatus();
    }

    function nextRound() {
      round++;
      if (round >= deck.length) {
        finishGame();
        return;
      }
      bids = [null, null];
      result = null;
      phase = "bidding";
      localBidder = bidOrder()[0];
      updateTurnAndStatus();
      render();
    }

    function finishGame() {
      over = true;
      phase = "done";
      const score = [scoreBreakdown(0), scoreBreakdown(1)];
      ctx.setTurn(-1);
      render();
      if (score[0].total > score[1].total) {
        ctx.incScore(0);
        ctx.setStatus(ctx.t(`🎉 Người chơi 1 thắng Auction War: ${score[0].total} - ${score[1].total}!`, `🎉 Player 1 wins Auction War: ${score[0].total} - ${score[1].total}!`));
      } else if (score[1].total > score[0].total) {
        ctx.incScore(1);
        ctx.setStatus(ctx.t(`🎉 Người chơi 2 thắng Auction War: ${score[1].total} - ${score[0].total}!`, `🎉 Player 2 wins Auction War: ${score[1].total} - ${score[0].total}!`));
      } else {
        ctx.setStatus(ctx.t(`🤝 Auction War hòa ${score[0].total} - ${score[1].total}.`, `🤝 Auction War draw ${score[0].total} - ${score[1].total}.`));
      }
    }

    function scoreBreakdown(seat) {
      const items = holdings[seat];
      const asset = items.reduce((s, item) => s + item.trueValue, 0);
      const bonus = computeBonus(items);
      return { cash: cash[seat], asset, bonus, total: cash[seat] + asset + bonus };
    }

    function computeBonus(items) {
      const counts = countTypes(items);
      let bonus = 0;
      bonus += Math.floor((counts.land || 0) / 3) * 12;
      bonus += Math.min(counts.resource || 0, counts.contract || 0) * 8;
      bonus += Math.max(0, (counts.relic || 0) - 1) * 9;
      bonus += Math.floor((counts.intel || 0) / 2) * 10;
      const typeCount = Object.keys(TYPE_INFO).filter((t) => counts[t] > 0).length;
      if (typeCount >= 4) bonus += 14;
      if (typeCount >= 5) bonus += 10;
      return bonus;
    }

    function countTypes(items) {
      return items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});
    }

    function updateTurnAndStatus() {
      if (over) return;
      if (phase === "result") {
        ctx.setTurn(typeof result?.winner === "number" ? result.winner : bidOrder()[0]);
        ctx.setStatus(result.text);
        return;
      }

      const seat = activeBidder();
      ctx.setTurn(seat);
      if (ctx.isOnline) {
        if (bids[ctx.mySeat] === null) {
          const oppReady = bids[1 - ctx.mySeat] !== null;
          ctx.setStatus(oppReady ? ctx.t("Đối thủ đã khóa giá. Đến lượt bạn chọn giá thầu.", "Opponent locked their bid. Your turn to bid.") : ctx.t("Chọn giá thầu kín cho món hiện tại.", "Choose a secret bid for the current item."));
        } else {
          ctx.setStatus(ctx.t("Bạn đã khóa giá. Đang chờ đối thủ.", "You locked your bid. Waiting for the opponent."));
        }
      } else {
        ctx.setStatus(ctx.t(`Người chơi ${seat + 1} chọn giá thầu kín. Người chơi còn lại không nên nhìn màn hình.`, `Player ${seat + 1} picks a secret bid. The other player shouldn't look at the screen.`));
      }
    }

    function render() {
      renderTop();
      renderItem();
      renderPanel();
      renderPortfolios();
      renderHistory();
    }

    function renderTop() {
      const score = [scoreBreakdown(0), scoreBreakdown(1)];
      topEl.innerHTML = [0, 1].map((p) => `
        <div class="aw-player aw-p${p + 1} ${activeBidder() === p && phase === "bidding" ? "active" : ""}">
          <span>${ctx.t(`Người chơi ${p + 1}`, `Player ${p + 1}`)}</span>
          <b>${ctx.t(`${score[p].total} điểm`, `${score[p].total} pts`)}</b>
          <small>${ctx.t(`${cash[p]} vàng · ${score[p].asset} tài sản · ${score[p].bonus} bonus`, `${cash[p]} gold · ${score[p].asset} assets · ${score[p].bonus} bonus`)}</small>
        </div>
      `).join("");
    }

    function renderItem() {
      const item = currentItem();
      if (!item) {
        itemEl.innerHTML = `
          <div class="aw-round">${ctx.t("Đã đóng sàn", "Floor closed")}</div>
          <div class="aw-item-main">
            <div class="aw-item-emoji">🏛️</div>
            <div>
              <h3>${ctx.t("Kết thúc đấu giá", "Auction over")}</h3>
              <p>${ctx.t("Tất cả phiên đã chốt. So tiền, tài sản và bonus để tìm người thắng.", "All rounds done. Compare cash, assets and bonus to find the winner.")}</p>
            </div>
          </div>
          <div class="aw-note">${ctx.t("Ai giữ tiền tốt, mua đúng giá và gom combo hợp lý sẽ thắng.", "Whoever manages cash, buys at fair prices and builds smart combos wins.")}</div>
        `;
        return;
      }
      const type = TYPE_INFO[item.type];
      const revealed = phase === "result" || phase === "done";
      itemEl.innerHTML = `
        <div class="aw-lot-head">
          <span class="aw-round">${ctx.t(`🔨 Phiên ${round + 1}/${deck.length}`, `🔨 Round ${round + 1}/${deck.length}`)}</span>
          <span class="aw-type-tag aw-tag-${item.type}">${type.emoji} ${typeName(item.type)}</span>
        </div>
        <div class="aw-item-main">
          <div class="aw-item-emoji aw-emoji-${item.type}">${item.emoji}</div>
          <div>
            <h3>${tr(item.name)}</h3>
            <p class="aw-estimate">${ctx.t("Ước tính", "Estimate")} <b>${item.low}–${item.high}</b> ${ctx.t("vàng", "gold")}</p>
          </div>
        </div>
        <div class="aw-value ${revealed ? "revealed" : "hidden-val"}">
          ${revealed
            ? `<span class="aw-val-label">${ctx.t("Giá thật", "True value")}</span><span class="aw-val-num">${item.trueValue}</span>`
            : `<span class="aw-val-q">?</span><span class="aw-val-hint">${ctx.t("Giá thật đang ẩn", "True value hidden")}</span>`}
        </div>
        <div class="aw-note">💡 ${tr(item.text)}</div>
        <div class="aw-clue">${ctx.t("📣 Tin đồn:", "📣 Rumor:")} <i>${tr(item.clue)}</i></div>
        <div class="aw-bonus-note">
          ${ctx.t("🎁 3 Đất +12 · Tài nguyên + Hợp đồng +8 · Đồ hiếm thứ 2+ +9 · 2 Tin tức +10 · đủ 4/5 loại +14/+24", "🎁 3 Land +12 · Resource + Contract +8 · 2nd+ Relic +9 · 2 Intel +10 · 4/5 types +14/+24")}
        </div>
      `;
    }

    function renderPanel() {
      if (phase === "done") {
        const s0 = scoreBreakdown(0);
        const s1 = scoreBreakdown(1);
        panelEl.innerHTML = `
          <h3>${ctx.t("Kết toán", "Final tally")}</h3>
          <div class="aw-final">
            ${renderFinalLine(0, s0)}
            ${renderFinalLine(1, s1)}
          </div>
        `;
        return;
      }

      if (phase === "result") {
        panelEl.innerHTML = `
          <h3>${ctx.t("Kết quả phiên", "Round result")}</h3>
          <div class="aw-result">${result.text}</div>
          <div class="aw-bid-reveal">
            <span>${ctx.t("P1 trả", "P1 bid")} <b>${bids[0]}</b></span>
            <span>${ctx.t("P2 trả", "P2 bid")} <b>${bids[1]}</b></span>
          </div>
          <button class="btn primary" id="awNext">${round + 1 >= deck.length ? ctx.t("Kết toán", "Final tally") : ctx.t("Phiên tiếp", "Next round")}</button>
        `;
        panelEl.querySelector("#awNext").addEventListener("click", () => applyMove({ kind: "next" }, false));
        return;
      }

      const seat = ctx.isOnline ? ctx.mySeat : localBidder;
      const locked = bids[seat] !== null;
      const max = cash[seat];
      const item = currentItem();
      const start = Math.min(max, Math.max(0, Math.round((item.low + item.high) / 2)));
      panelEl.innerHTML = `
        <h3>${locked ? ctx.t("Đã khóa giá", "Bid locked") : ctx.t(`Người chơi ${seat + 1} đặt giá`, `Player ${seat + 1} bids`)}</h3>
        <div class="aw-locks">
          <span class="${bids[0] !== null ? "ready" : ""}">${ctx.t(`P1 ${bids[0] !== null ? "đã khóa" : "đang chờ"}`, `P1 ${bids[0] !== null ? "locked" : "waiting"}`)}</span>
          <span class="${bids[1] !== null ? "ready" : ""}">${ctx.t(`P2 ${bids[1] !== null ? "đã khóa" : "đang chờ"}`, `P2 ${bids[1] !== null ? "locked" : "waiting"}`)}</span>
        </div>
        ${locked ? `
          <div class="aw-wait">${ctx.t("Giá của bạn đã được giấu. Chờ người còn lại khóa giá.", "Your bid is hidden. Waiting for the other player to lock.")}</div>
        ` : `
          <label class="aw-bid-label" for="awBid">${ctx.t(`Giá thầu tối đa ${max} vàng`, `Max bid ${max} gold`)}</label>
          <input class="aw-range" id="awBidRange" type="range" min="0" max="${max}" value="${start}">
          <div class="aw-bid-row">
            <input class="aw-number" id="awBid" type="number" min="0" max="${max}" value="${start}">
            <button class="btn" id="awPass">${ctx.t("Bỏ giá", "Pass")}</button>
            <button class="btn primary" id="awSubmit">${ctx.t("Khóa giá", "Lock bid")}</button>
          </div>
          <div class="aw-quick">
            <button type="button" data-bid="0">0</button>
            <button type="button" data-bid="${Math.min(max, item.low)}">${Math.min(max, item.low)}</button>
            <button type="button" data-bid="${Math.min(max, Math.round((item.low + item.high) / 2))}">${Math.min(max, Math.round((item.low + item.high) / 2))}</button>
            <button type="button" data-bid="${Math.min(max, item.high)}">${Math.min(max, item.high)}</button>
            <button type="button" data-bid="${max}">All-in</button>
          </div>
        `}
      `;

      if (!locked) {
        const number = panelEl.querySelector("#awBid");
        const range = panelEl.querySelector("#awBidRange");
        const setBid = (value) => {
          const v = clampInt(value, 0, max);
          number.value = v;
          range.value = v;
        };
        number.addEventListener("input", () => setBid(number.value));
        range.addEventListener("input", () => setBid(range.value));
        panelEl.querySelector("#awPass").addEventListener("click", () => submitBid(0));
        panelEl.querySelector("#awSubmit").addEventListener("click", () => submitBid(number.value));
        panelEl.querySelectorAll("[data-bid]").forEach((btn) => {
          btn.addEventListener("click", () => setBid(btn.dataset.bid));
        });
      }
    }

    function renderFinalLine(seat, score) {
      return `
        <div class="aw-final-line aw-p${seat + 1}">
          <b>P${seat + 1}: ${score.total}</b>
          <span>${ctx.t(`Tiền ${score.cash} + tài sản ${score.asset} + bonus ${score.bonus}`, `Cash ${score.cash} + assets ${score.asset} + bonus ${score.bonus}`)}</span>
        </div>
      `;
    }

    function renderPortfolios() {
      portfoliosEl.innerHTML = [0, 1].map((seat) => {
        const items = holdings[seat];
        const counts = countTypes(items);
        return `
          <div class="aw-portfolio aw-p${seat + 1}">
            <div class="aw-portfolio-head">
              <b>${ctx.t(`Kho P${seat + 1}`, `P${seat + 1} stash`)}</b>
              <span>${ctx.t(`${items.length} món · bonus ${computeBonus(items)}`, `${items.length} items · bonus ${computeBonus(items)}`)}</span>
            </div>
            <div class="aw-type-row">
              ${Object.entries(TYPE_INFO).map(([id, t]) => `<span><i class="aw-mini-emoji">${t.emoji}</i>${counts[id] || 0}</span>`).join("")}
            </div>
            <div class="aw-items">
              ${items.length ? items.map(renderOwnedItem).join("") : `<em>${ctx.t("Chưa mua món nào", "No items yet")}</em>`}
            </div>
          </div>
        `;
      }).join("");
    }

    function renderOwnedItem(item) {
      const diff = item.trueValue - item.paid;
      return `
        <span class="aw-owned ${diff >= 0 ? "good" : "bad"}" title="${typeName(item.type)} · ${diff >= 0 ? ctx.t("lời", "profit") : ctx.t("hớ", "overpaid")} ${Math.abs(diff)}">
          <i class="aw-mini-emoji">${item.emoji}</i>${tr(item.name)}
          <small>${item.trueValue}/${item.paid}</small>
        </span>
      `;
    }

    function renderHistory() {
      historyEl.innerHTML = `
        <b>${ctx.t("Lịch sử phiên", "Round history")}</b>
        ${history.length ? history.map((h) => `
          <span>${ctx.t(`Phiên ${h.round}: ${h.item.name} · P1 ${h.bids[0]} / P2 ${h.bids[1]}`, `Round ${h.round}: ${tr(h.item.name)} · P1 ${h.bids[0]} / P2 ${h.bids[1]}`)}</span>
        `).join("") : `<span>${ctx.t("Chưa có phiên nào chốt.", "No rounds settled yet.")}</span>`}
      `;
    }

    // ----- AI (đấu máy): định giá theo khoảng ước tính + đọc tin đồn -----
    function aiMove(level) {
      if (over) return null;
      if (phase === "result") return { kind: "next" }; // tự sang phiên sau
      if (phase !== "bidding") return null;
      const seat = 1; // máy luôn cầm Người chơi 2 khi đấu máy
      if (bids[seat] !== null) return null;
      const item = currentItem();
      if (!item) return null;
      const max = cash[seat];
      const mid = (item.low + item.high) / 2;
      let est;
      if (level === "easy") {
        est = item.low + Math.random() * (item.high - item.low); // đoán bừa trong khoảng
      } else if (level === "hard") {
        est = item.trueValue * (0.9 + Math.random() * 0.08);     // tinh: bám sát giá thật
      } else {
        est = mid; // chuẩn: đọc tin đồn để lệch ước tính
        if (CLUES.high.includes(item.clue)) est = mid + (item.high - mid) * 0.6;
        else if (CLUES.low.includes(item.clue)) est = mid - (mid - item.low) * 0.6;
      }
      // trả thấp hơn ước tính một chút để có biên lời; món quá rẻ thì bỏ qua
      let bid = Math.floor(est * (level === "hard" ? 0.88 : 0.8));
      if (est < 8) bid = 0;
      bid = Math.max(0, Math.min(max, bid));
      return { kind: "bid", seat, amount: bid };
    }

    updateTurnAndStatus();
    render();
    return { applyMove, aiMove };
  }

  window.GameRegistry.register({
    id: "auctionwar",
    name: "Auction War",
    emoji: "🔨",
    description: "Đấu giá kín tài sản, bluff giá, quản lý tiền và ăn bonus bộ sưu tập. Trả quá tay là mua hớ.",
    onlineReady: true,
    supportsAI: true,
    options: [
      {
        id: "rounds", label: "Số phiên đấu giá", default: 10,
        choices: [
          { value: 8, label: "8 phiên (nhanh)" },
          { value: 10, label: "10 phiên (chuẩn)" },
          { value: 12, label: "12 phiên (dài)" },
        ],
      },
      {
        id: "cash", label: "Tiền khởi điểm", default: 140,
        choices: [
          { value: 110, label: "110 vàng (căng)" },
          { value: 140, label: "140 vàng (chuẩn)" },
          { value: 180, label: "180 vàng (giàu)" },
        ],
      },
    ],
    howTo: [
      "Mỗi phiên lật một tài sản có khoảng giá ước tính. Giá thật bị ẩn cho tới khi chốt phiên.",
      "📣 Đọc kỹ 'Tin đồn' của món hàng — nó GỢI Ý giá thật cao hay thấp so với ước tính. Ai định giá khéo sẽ trả đúng hơn (nhưng tin đồn cũng có thể gây nhiễu, đừng tin tuyệt đối).",
      "Cả hai người chọn giá thầu kín. Online thì mỗi người tự khóa giá; chơi chung máy thì lần lượt nhập giá và không nhìn giá của nhau.",
      "Giá cao hơn mua tài sản và trả đúng số vàng đã thầu. Nếu trả cao hơn giá thật và bonus sau này không bù được, bạn đã mua hớ.",
      "Nếu hai bên trả bằng nhau, phiên hỏng và cả hai mất một khoản phí nhỏ. Nếu cả hai trả 0 thì bỏ qua tài sản.",
      "Cuối ván tính điểm bằng tiền còn lại + giá thật tài sản + bonus bộ sưu tập.",
      "Bonus: 3 Đất +12, mỗi cặp Tài nguyên + Hợp đồng +8, Đồ hiếm thứ 2 trở đi +9, mỗi 2 Tin tức +10, đủ nhiều loại tài sản được cộng thêm.",
    ],
    create,
  });
})();
