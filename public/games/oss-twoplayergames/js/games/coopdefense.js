/* Thủ Thành Hợp Tác - co-op tower defense nhiều đường. */
(function () {
  const LANES = 3;
  const SLOTS = 6;
  const MAX_WAVE = 10;
  const BASE_HP = 20;          // máu căn cứ — quái lọt sẽ trừ máu thay vì thua ngay
  const STRIKE_COST = 90;      // chi phí Không kích
  const STRIKE_CD = 130;       // hồi chiêu (số tick ~13s)
  const STRIKE_DMG = 28;       // sát thương Không kích (xuyên giáp)

  const MAPS = [
    {
      id: "forest",
      name: "Rừng Uốn Lượn",
      theme: "forest",
      note: "ngã rừng giao nhau",
      routes: [
        [{ x: 4, y: 45 }, { x: 16, y: 53 }, { x: 28, y: 42 }, { x: 39, y: 47 }, { x: 50, y: 34 }, { x: 62, y: 31 }, { x: 75, y: 23 }, { x: 97, y: 18 }],
        [{ x: 4, y: 28 }, { x: 15, y: 33 }, { x: 27, y: 24 }, { x: 41, y: 35 }, { x: 53, y: 51 }, { x: 66, y: 58 }, { x: 81, y: 54 }, { x: 97, y: 63 }],
        [{ x: 4, y: 84 }, { x: 17, y: 76 }, { x: 28, y: 86 }, { x: 39, y: 72 }, { x: 52, y: 78 }, { x: 63, y: 62 }, { x: 78, y: 73 }, { x: 97, y: 82 }],
      ],
      slots: [
        [{ x: 13, y: 57 }, { x: 26, y: 35 }, { x: 37, y: 55 }, { x: 49, y: 24 }, { x: 60, y: 42 }, { x: 72, y: 15 }, { x: 84, y: 33 }, { x: 92, y: 10 }],
        [{ x: 13, y: 20 }, { x: 25, y: 41 }, { x: 36, y: 18 }, { x: 47, y: 45 }, { x: 57, y: 63 }, { x: 70, y: 48 }, { x: 83, y: 64 }, { x: 92, y: 52 }],
        [{ x: 13, y: 91 }, { x: 27, y: 68 }, { x: 37, y: 90 }, { x: 49, y: 66 }, { x: 59, y: 86 }, { x: 70, y: 61 }, { x: 83, y: 82 }, { x: 92, y: 72 }],
      ],
      scenery: [["rock", 10, 14], ["tree", 22, 12], ["tent", 24, 61], ["crate", 38, 88], ["flag", 49, 57], ["hut", 83, 13], ["well", 68, 46], ["stump", 91, 93], ["barrel", 12, 91], ["tree", 79, 88], ["water", 55, 20]],
    },
    {
      id: "coast",
      name: "Bờ Biển",
      theme: "coast",
      note: "đường ven cầu",
      routes: [
        [{ x: 4, y: 30 }, { x: 14, y: 22 }, { x: 26, y: 35 }, { x: 38, y: 28 }, { x: 50, y: 34 }, { x: 61, y: 23 }, { x: 75, y: 18 }, { x: 97, y: 16 }],
        [{ x: 4, y: 63 }, { x: 18, y: 67 }, { x: 31, y: 58 }, { x: 42, y: 62 }, { x: 54, y: 49 }, { x: 66, y: 50 }, { x: 80, y: 37 }, { x: 97, y: 48 }],
        [{ x: 4, y: 86 }, { x: 16, y: 78 }, { x: 27, y: 88 }, { x: 39, y: 77 }, { x: 52, y: 83 }, { x: 64, y: 70 }, { x: 80, y: 76 }, { x: 97, y: 90 }],
      ],
      slots: [
        [{ x: 13, y: 37 }, { x: 24, y: 17 }, { x: 36, y: 40 }, { x: 48, y: 23 }, { x: 58, y: 42 }, { x: 70, y: 13 }, { x: 84, y: 27 }, { x: 92, y: 10 }],
        [{ x: 12, y: 72 }, { x: 26, y: 51 }, { x: 37, y: 70 }, { x: 49, y: 47 }, { x: 61, y: 60 }, { x: 73, y: 40 }, { x: 85, y: 49 }, { x: 92, y: 60 }],
        [{ x: 12, y: 92 }, { x: 25, y: 73 }, { x: 37, y: 92 }, { x: 49, y: 72 }, { x: 61, y: 89 }, { x: 73, y: 65 }, { x: 84, y: 84 }, { x: 92, y: 78 }],
      ],
      scenery: [["water", 11, 92], ["water", 82, 10], ["bridge", 73, 32], ["rock", 20, 43], ["barrel", 34, 18], ["crate", 51, 72], ["flag", 61, 42], ["hut", 88, 26], ["well", 72, 66], ["stump", 42, 92], ["rock", 95, 65]],
    },
    {
      id: "canyon",
      name: "Hẻm Núi",
      theme: "canyon",
      note: "quái đi nhanh hơn",
      speed: 1.08,
      routes: [
        [{ x: 4, y: 65 }, { x: 14, y: 74 }, { x: 22, y: 57 }, { x: 31, y: 66 }, { x: 40, y: 45 }, { x: 50, y: 53 }, { x: 60, y: 31 }, { x: 72, y: 39 }, { x: 84, y: 21 }, { x: 97, y: 31 }],
        [{ x: 4, y: 29 }, { x: 14, y: 18 }, { x: 25, y: 34 }, { x: 36, y: 23 }, { x: 47, y: 39 }, { x: 58, y: 28 }, { x: 70, y: 52 }, { x: 83, y: 46 }, { x: 97, y: 60 }],
        [{ x: 4, y: 84 }, { x: 15, y: 90 }, { x: 26, y: 77 }, { x: 38, y: 87 }, { x: 49, y: 70 }, { x: 60, y: 82 }, { x: 72, y: 64 }, { x: 84, y: 78 }, { x: 97, y: 72 }],
      ],
      slots: [
        [{ x: 13, y: 82 }, { x: 23, y: 52 }, { x: 34, y: 72 }, { x: 45, y: 40 }, { x: 56, y: 59 }, { x: 68, y: 27 }, { x: 79, y: 43 }, { x: 91, y: 20 }],
        [{ x: 13, y: 13 }, { x: 26, y: 43 }, { x: 37, y: 17 }, { x: 49, y: 48 }, { x: 61, y: 20 }, { x: 72, y: 60 }, { x: 84, y: 37 }, { x: 92, y: 66 }],
        [{ x: 13, y: 94 }, { x: 25, y: 71 }, { x: 37, y: 94 }, { x: 49, y: 64 }, { x: 61, y: 90 }, { x: 72, y: 58 }, { x: 84, y: 86 }, { x: 92, y: 64 }],
      ],
      scenery: [["bones", 18, 15], ["rock", 31, 39], ["rock", 46, 15], ["barrel", 54, 68], ["flag", 65, 38], ["ruin", 82, 15], ["bones", 88, 92], ["crate", 22, 91], ["rock", 71, 88], ["fire", 10, 52], ["fire", 58, 74]],
    },
    {
      id: "ruins",
      name: "Tàn Tích Pha Lê",
      theme: "ruins",
      note: "đường vòng quanh lõi",
      routes: [
        [{ x: 4, y: 58 }, { x: 16, y: 48 }, { x: 28, y: 59 }, { x: 40, y: 47 }, { x: 52, y: 58 }, { x: 42, y: 70 }, { x: 55, y: 82 }, { x: 70, y: 64 }, { x: 84, y: 37 }, { x: 97, y: 25 }],
        [{ x: 4, y: 36 }, { x: 15, y: 28 }, { x: 28, y: 39 }, { x: 41, y: 30 }, { x: 55, y: 40 }, { x: 67, y: 55 }, { x: 58, y: 70 }, { x: 72, y: 78 }, { x: 86, y: 66 }, { x: 97, y: 55 }],
        [{ x: 4, y: 82 }, { x: 16, y: 88 }, { x: 29, y: 75 }, { x: 41, y: 84 }, { x: 54, y: 68 }, { x: 48, y: 52 }, { x: 61, y: 36 }, { x: 75, y: 45 }, { x: 86, y: 80 }, { x: 97, y: 86 }],
      ],
      slots: [
        [{ x: 13, y: 53 }, { x: 27, y: 65 }, { x: 38, y: 43 }, { x: 53, y: 51 }, { x: 41, y: 78 }, { x: 61, y: 85 }, { x: 76, y: 60 }, { x: 91, y: 32 }],
        [{ x: 13, y: 23 }, { x: 27, y: 46 }, { x: 40, y: 23 }, { x: 54, y: 47 }, { x: 68, y: 47 }, { x: 56, y: 78 }, { x: 76, y: 86 }, { x: 91, y: 62 }],
        [{ x: 13, y: 92 }, { x: 28, y: 69 }, { x: 41, y: 90 }, { x: 56, y: 63 }, { x: 45, y: 45 }, { x: 65, y: 30 }, { x: 77, y: 53 }, { x: 91, y: 90 }],
      ],
      scenery: [["crystal", 18, 14], ["ruin", 30, 43], ["crystal", 48, 18], ["flag", 56, 70], ["well", 53, 58], ["ruin", 84, 15], ["crystal", 89, 92], ["crate", 21, 91], ["rock", 72, 88], ["crystal", 10, 62], ["ruin", 64, 52]],
    },
  ];

  const TOWERS = {
    rifle: { name: "Súng máy", short: "SM", icon: "🔫", fx: "tracer", cost: 42, dmg: 8, rate: 6, range: 0.17, color: "#ffd166", note: "bắn nhanh" },
    cannon: { name: "Pháo nổ", short: "PH", icon: "💣", fx: "explode", cost: 74, dmg: 21, rate: 14, range: 0.16, splash: 0.075, color: "#ff8d7a", note: "nổ lan" },
    frost: { name: "Tháp băng", short: "BG", icon: "❄️", fx: "frost", cost: 64, dmg: 5, rate: 10, range: 0.19, slow: 32, color: "#7fe7ff", note: "làm chậm" },
    laser: { name: "Laser", short: "LS", icon: "🔆", fx: "laser", cost: 96, dmg: 14, rate: 5, range: 0.24, pierce: 2, color: "#c6a7ff", note: "xuyên tuyến" },
    sniper: { name: "Xạ thủ", short: "XT", icon: "🎯", fx: "snipe", cost: 88, dmg: 42, rate: 18, range: 0.34, ignoreArmor: true, color: "#f6f0a8", note: "bắn xa" },
    tesla: { name: "Tesla", short: "TS", icon: "⚡", fx: "bolt", cost: 106, dmg: 15, rate: 9, range: 0.2, chain: 3, color: "#8afff1", note: "giật chuyền" },
    flame: { name: "Hỏa tháp", short: "HT", icon: "🔥", fx: "flame", cost: 78, dmg: 9, rate: 7, range: 0.15, burn: 20, burnDmg: 3, color: "#ffb15c", note: "đốt cháy" },
    mortar: { name: "Cối đá", short: "CD", icon: "🧨", fx: "blast", cost: 118, dmg: 34, rate: 22, range: 0.26, splash: 0.12, color: "#b7c1a1", note: "nổ rộng" },
  };
  const BEAM_FX = { tracer: 1, frost: 1, laser: 1, snipe: 1, bolt: 1, flame: 1 };
  const SHOT_LIFE = { explode: 6, blast: 7, flame: 5 };
  const IMPACT_SIZE = { explode: 30, blast: 48, frost: 22, flame: 26, laser: 14, snipe: 12, bolt: 18, tracer: 11 };

  const MONSTERS = {
    grunt: { name: "Bộ binh", icon: "👹", hp: 26, speed: 0.0042, reward: 8 },
    runner: { name: "Chạy nhanh", icon: "👺", hp: 18, speed: 0.0066, reward: 9 },
    swarm: { name: "Đàn nhỏ", icon: "🐀", hp: 12, speed: 0.0061, reward: 5 },
    brute: { name: "Giáp nặng", icon: "🧌", hp: 58, speed: 0.0029, reward: 15, armor: 2 },
    shield: { name: "Khiên", icon: "🛡️", hp: 42, speed: 0.0035, reward: 13, armor: 4 },
    shaman: { name: "Pháp sư", icon: "🧙", hp: 36, speed: 0.0038, reward: 16, regen: 1 },
    bomber: { name: "Nổ giáp", icon: "💀", hp: 34, speed: 0.0042, reward: 17, armor: 1 },
    ghost: { name: "Bóng ma", icon: "👻", hp: 30, speed: 0.0053, reward: 16, slowResist: 0.72 },
    splitter: { name: "Tách đàn", icon: "🪲", hp: 46, speed: 0.0039, reward: 14, split: 2 },
    boss: { name: "Trùm cổng", icon: "🐲", hp: 180, speed: 0.0022, reward: 52, armor: 3 },
  };

  // Sinh bãi đặt súng NẰM CẠNH đường (trên cỏ), đẩy vuông góc xen kẽ hai bên, giãn đều.
  function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function genSlots(route, count) {
    const segLen = [];
    let total = 0;
    for (let i = 1; i < route.length; i++) { const d = _dist(route[i - 1], route[i]); segLen.push(d); total += d; }
    const OFF = 12;
    const out = [];
    for (let k = 0; k < count; k++) {
      const target = (k + 0.5) / count * total;
      let acc = 0, idx = 0, t = 0;
      for (let i = 0; i < segLen.length; i++) {
        if (acc + segLen[i] >= target) { idx = i; t = segLen[i] ? (target - acc) / segLen[i] : 0; break; }
        acc += segLen[i];
        idx = i;
      }
      const a = route[idx], b = route[idx + 1] || route[idx];
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      let dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const nx = -dy, ny = dx; // vuông góc
      const side = k % 2 === 0 ? 1 : -1;
      let sx = px + nx * side * OFF, sy = py + ny * side * OFF;
      if (sx < 6 || sx > 94 || sy < 8 || sy > 92) { sx = px - nx * side * OFF; sy = py - ny * side * OFF; }
      sx = Math.max(6, Math.min(94, sx));
      sy = Math.max(8, Math.min(92, sy));
      out.push({ x: +sx.toFixed(1), y: +sy.toFixed(1) });
    }
    return out;
  }
  // 3 đường KHÔNG cắt nhau, mỗi đường một dải ngang riêng -> bãi súng nằm gọn trong khoảng trống.
  function genRoute(centerY, amp, waves, phase) {
    const pts = 9;
    const r = [];
    for (let i = 0; i < pts; i++) {
      const x = 4 + 93 * i / (pts - 1);
      let y = centerY + amp * Math.sin(i / (pts - 1) * Math.PI * waves + phase);
      y = Math.max(8, Math.min(92, y));
      r.push({ x: Math.round(x), y: Math.round(y) });
    }
    return r;
  }
  const ROUTE_WAVES = { forest: 2.2, coast: 1.4, canyon: 2.8, ruins: 2.4 };
  MAPS.forEach((m) => {
    const waves = ROUTE_WAVES[m.id] || 2;
    m.routes = [16, 50, 84].map((cy, lane) => genRoute(cy, 6, waves, lane * 0.7 * Math.PI));
    m.slots = m.routes.map((r) => genSlots(r, SLOTS));
    relaxSlots(m);
  });

  function nearestOnRoute(p, route) {
    let best = route[0], bd = Infinity;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const vx = b.x - a.x, vy = b.y - a.y;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      const q = { x: a.x + vx * t, y: a.y + vy * t };
      const d = _dist(p, q);
      if (d < bd) { bd = d; best = q; }
    }
    return { q: best, d: bd };
  }

  // Đẩy các bãi tách nhau (không đè), giữ cách đường của lane (off-path) và trong tầm bắn.
  function relaxSlots(map) {
    const MINSEP = 11, PATH_CLEAR = 11, MAX_OFF = 14;
    const all = [];
    map.slots.forEach((arr, lane) => arr.forEach((p) => all.push({ p, lane })));
    for (let iter = 0; iter < 120; iter++) {
      for (const s of all) {
        let mx = 0, my = 0;
        for (const o of all) {
          if (o === s) continue;
          const dx = s.p.x - o.p.x, dy = s.p.y - o.p.y;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d < MINSEP) { const f = (MINSEP - d) / d * 0.5; mx += dx * f; my += dy * f; }
        }
        // đẩy khỏi MỌI đường (kể cả lane khác) nếu quá gần
        for (let ln = 0; ln < map.routes.length; ln++) {
          const nro = nearestOnRoute(s.p, map.routes[ln]);
          const rdo = nro.d || 0.01;
          if (rdo < PATH_CLEAR) {
            const f = (PATH_CLEAR - rdo) / rdo * 0.6;
            mx += (s.p.x - nro.q.x) * f;
            my += (s.p.y - nro.q.y) * f;
          }
        }
        s.p.x = Math.max(6, Math.min(94, s.p.x + mx));
        s.p.y = Math.max(8, Math.min(92, s.p.y + my));
        // ÉP CỨNG vòng quanh đường của lane mình để vẫn trong tầm bắn
        const nr = nearestOnRoute(s.p, map.routes[s.lane]);
        const rd = nr.d || 0.01;
        const dirx = (s.p.x - nr.q.x) / rd, diry = (s.p.y - nr.q.y) / rd;
        const want = rd < PATH_CLEAR ? PATH_CLEAR : (rd > MAX_OFF ? MAX_OFF : rd);
        if (want !== rd) {
          s.p.x = Math.max(6, Math.min(94, nr.q.x + dirx * want));
          s.p.y = Math.max(8, Math.min(92, nr.q.y + diry * want));
        }
      }
    }
    all.forEach((s) => { s.p.x = +s.p.x.toFixed(1); s.p.y = +s.p.y.toFixed(1); });
  }

  function create(ctx) {
    let leaks = 0;
    // bản dịch tên/ghi chú (MAPS/TOWERS/MONSTERS là hằng module-level)
    const MAP_NAME_EN = { forest: "Winding Forest", coast: "Coastline", canyon: "Canyon", ruins: "Crystal Ruins" };
    const MAP_NOTE_EN = { forest: "crossing forest paths", coast: "bridge-side road", canyon: "monsters move faster", ruins: "loops around the core" };
    const TOWER_NAME_EN = { rifle: "Machine gun", cannon: "Cannon", frost: "Frost tower", laser: "Laser", sniper: "Sniper", tesla: "Tesla", flame: "Flame tower", mortar: "Mortar" };
    const TOWER_NOTE_EN = { rifle: "fast fire", cannon: "splash", frost: "slows", laser: "pierces lane", sniper: "long range", tesla: "chains", flame: "burns", mortar: "wide blast" };
    const MON_NAME_EN = { grunt: "Infantry", runner: "Runner", swarm: "Swarmling", brute: "Heavy armor", shield: "Shield", shaman: "Shaman", bomber: "Armor bomber", ghost: "Ghost", splitter: "Splitter", boss: "Gate Boss" };
    const mapName = (m) => ctx.t(m.name, MAP_NAME_EN[m.id] || m.name);
    const mapNote = (m) => ctx.t(m.note, MAP_NOTE_EN[m.id] || m.note);
    const towerName = (id) => ctx.t(TOWERS[id].name, TOWER_NAME_EN[id] || TOWERS[id].name);
    const towerNote = (id) => ctx.t(TOWERS[id].note, TOWER_NOTE_EN[id] || TOWERS[id].note);
    const monName = (type) => ctx.t(MONSTERS[type].name, MON_NAME_EN[type] || MONSTERS[type].name);
    let baseHp = BASE_HP;
    let strikeCd = 0;
    let coins = 210;
    let wave = 0;
    let phase = "prep";
    let tick = 0;
    let timer = null;
    let selectedType = "rifle";
    let selectedSlot = null;
    let activeMap = 0;
    let over = false;
    let monsterSeq = 1;
    const towers = Array.from({ length: LANES }, () => Array(SLOTS).fill(null));
    const monsters = [];
    const shots = [];
    let spawns = [];
    const log = [ctx.t("Chọn map, đặt súng quanh đường. Không để quái lọt hết đường.", "Pick a map, place guns along the paths. Don't let monsters slip through.")];

    const root = document.createElement("div");
    root.className = "cd-root";
    root.innerHTML = `
      <div class="cd-hud" id="cdHud"></div>
      <div class="cd-layout">
        <div class="cd-map-scroll">
          <div class="cd-map" id="cdMap"></div>
        </div>
        <aside class="cd-panel" id="cdPanel"></aside>
      </div>
      <div class="cd-log" id="cdLog"></div>
    `;
    ctx.boardEl.appendChild(root);

    const hudEl = root.querySelector("#cdHud");
    const mapEl = root.querySelector("#cdMap");
    const panelEl = root.querySelector("#cdPanel");
    const logEl = root.querySelector("#cdLog");
    // lớp popup riêng, KHÔNG bị dựng lại mỗi tick -> nút bấm ổn định
    const popupEl = document.createElement("div");
    popupEl.className = "cd-popup-layer";
    (root.querySelector(".cd-map-scroll") || mapEl.parentNode).appendChild(popupEl);
    let lastPopSig = "";
    let lastPanelSig = "";

    function applyMove(move, fromRemote) {
      if (over || !move) return;

      if (move.t === "map") {
        const idx = MAPS.findIndex((map) => map.id === move.map);
        if (idx < 0 || !canChangeMap()) return;
        activeMap = idx;
        selectedSlot = null;
        addLog(ctx.t(`Đổi sang map ${currentMap().name}.`, `Switched to map ${mapName(currentMap())}.`));
        if (!fromRemote) ctx.sendMove({ t: "map", map: currentMap().id });
        render();
        return;
      }

      if (move.t === "build") {
        const lane = clampInt(move.lane, 0, LANES - 1);
        const slot = clampInt(move.slot, 0, SLOTS - 1);
        const type = TOWERS[move.type] ? move.type : "rifle";
        const def = TOWERS[type];
        if (phase === "done" || towers[lane][slot] || coins < def.cost) return;
        coins -= def.cost;
        towers[lane][slot] = { type, level: 1, cooldown: 0 };
        selectedSlot = { lane, slot };
        addLog(ctx.t(`Xây ${def.name} ở đường ${lane + 1}.`, `Built ${towerName(type)} on path ${lane + 1}.`));
        ctx.sound("place");
        if (!fromRemote) ctx.sendMove({ t: "build", lane, slot, type });
        render();
        return;
      }

      if (move.t === "upgrade") {
        const lane = clampInt(move.lane, 0, LANES - 1);
        const slot = clampInt(move.slot, 0, SLOTS - 1);
        const tower = towers[lane][slot];
        if (phase === "done" || !tower || tower.level >= 5) return;
        const cost = upgradeCost(tower);
        if (coins < cost) return;
        coins -= cost;
        tower.level++;
        selectedSlot = { lane, slot };
        addLog(ctx.t(`Nâng ${TOWERS[tower.type].name} đường ${lane + 1} lên cấp ${tower.level}.`, `Upgraded ${towerName(tower.type)} on path ${lane + 1} to level ${tower.level}.`));
        ctx.sound("capture");
        if (!fromRemote) ctx.sendMove({ t: "upgrade", lane, slot });
        render();
        return;
      }

      if (move.t === "sell") {
        const lane = clampInt(move.lane, 0, LANES - 1);
        const slot = clampInt(move.slot, 0, SLOTS - 1);
        const tower = towers[lane][slot];
        if (phase === "done" || !tower) return;
        const refund = Math.floor(towerValue(tower) * 0.5);
        coins += refund;
        towers[lane][slot] = null;
        selectedSlot = null;
        addLog(ctx.t(`Bán tháp lấy lại ${refund} vàng.`, `Sold tower for ${refund} gold back.`));
        if (!fromRemote) ctx.sendMove({ t: "sell", lane, slot });
        render();
        return;
      }

      if (move.t === "start") {
        if (phase !== "prep" || over) return;
        if (!fromRemote) ctx.sendMove({ t: "start" });
        startWave();
      }

      if (move.t === "airstrike") {
        if (phase !== "wave" || over || strikeCd > 0 || coins < STRIKE_COST) return;
        coins -= STRIKE_COST;
        strikeCd = STRIKE_CD;
        if (!fromRemote) ctx.sendMove({ t: "airstrike" });
        let hitCount = 0;
        monsters.forEach((m) => { m.hp -= STRIKE_DMG; m.slowUntil = Math.max(m.slowUntil, tick + 18); hitCount++; });
        addLog(ctx.t(`💥 Không kích! Giáng ${STRIKE_DMG} sát thương lên ${hitCount} quái.`, `💥 Airstrike! Dealt ${STRIKE_DMG} damage to ${hitCount} monsters.`));
        ctx.sound("capture");
        resolveDeaths();
        render();
      }
    }

    function currentMap() {
      return MAPS[activeMap];
    }

    function canChangeMap() {
      return phase === "prep" && wave === 0 && !hasAnyTower();
    }

    function hasAnyTower() {
      return towers.some((lane) => lane.some(Boolean));
    }

    function clampInt(value, min, max) {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    }

    function routePoint(lane, progress) {
      const route = currentMap().routes[lane];
      const p = Math.max(0, Math.min(1, progress));
      const lengths = [];
      let total = 0;
      for (let i = 1; i < route.length; i++) {
        const len = distance(route[i - 1], route[i]);
        lengths.push(len);
        total += len;
      }
      let target = p * total;
      for (let i = 0; i < lengths.length; i++) {
        if (target > lengths[i]) {
          target -= lengths[i];
          continue;
        }
        const a = route[i];
        const b = route[i + 1];
        const t = lengths[i] ? target / lengths[i] : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      return route[route.length - 1];
    }

    function slotPoint(lane, slot) {
      return currentMap().slots[lane][slot];
    }

    function distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function routePolyline(lane) {
      return currentMap().routes[lane].map((p) => `${p.x},${p.y}`).join(" ");
    }

    function towerValue(tower) {
      let total = TOWERS[tower.type].cost;
      for (let lv = 1; lv < tower.level; lv++) {
        total += Math.round(TOWERS[tower.type].cost * (0.55 + lv * 0.2));
      }
      return total;
    }

    function upgradeCost(tower) {
      return Math.round(TOWERS[tower.type].cost * (0.55 + tower.level * 0.2));
    }

    function startWave() {
      wave++;
      tick = 0;
      phase = "wave";
      spawns = makeWave(wave);
      shots.length = 0;
      ctx.setTurn(0);
      addLog(ctx.t(`Wave ${wave} bắt đầu trên map ${currentMap().name}. Vẫn có thể xây súng trong lúc quái chạy.`, `Wave ${wave} starts on map ${mapName(currentMap())}. You can still build while monsters run.`));
      ctx.setStatus(ctx.t(`Wave ${wave}/${MAX_WAVE}: chặn quái trước khi chúng lọt hết đường.`, `Wave ${wave}/${MAX_WAVE}: stop the monsters before they slip through.`));
      if (timer) clearInterval(timer);
      timer = setInterval(step, 100);
      render();
    }

    function makeWave(n) {
      const count = 12 + n * 5;
      const interval = Math.max(3, 8 - Math.floor(n / 3));
      const list = [];
      for (let i = 0; i < count; i++) {
        const type = waveMonsterType(n, i);
        const lane = (i * 2 + n) % LANES;
        list.push({ at: 5 + i * interval, lane, type });
        if (type === "swarm") {
          list.push({ at: 7 + i * interval, lane: (lane + 1) % LANES, type: "swarm" });
        }
      }
      if (n % 3 === 0) {
        list.push({ at: count * interval + 8, lane: 0, type: "bomber" });
        list.push({ at: count * interval + 12, lane: 2, type: "splitter" });
      }
      if (n === MAX_WAVE) {
        list.push({ at: count * interval + 20, lane: 1, type: "boss" });
        list.push({ at: count * interval + 26, lane: 0, type: "shaman" });
        list.push({ at: count * interval + 30, lane: 2, type: "ghost" });
      }
      return list.sort((a, b) => a.at - b.at);
    }

    function waveMonsterType(n, i) {
      if (n >= 8 && i % 17 === 8) return "ghost";
      if (n >= 7 && i % 14 === 5) return "splitter";
      if (n >= 6 && i % 13 === 4) return "bomber";
      if (n >= 5 && i % 11 === 3) return "shaman";
      if (n >= 4 && i % 9 === 6) return "shield";
      if (n >= 3 && i % 7 === 4) return "brute";
      if (n >= 2 && i % 5 === 2) return "runner";
      if (i % 6 === 1) return "swarm";
      return "grunt";
    }

    function step() {
      if (!root.isConnected) {
        clearInterval(timer);
        timer = null;
        return;
      }
      if (phase !== "wave" || over) return;
      tick++;
      if (strikeCd > 0) strikeCd--;

      while (spawns.length && spawns[0].at <= tick) {
        spawnMonster(spawns.shift());
      }

      moveMonsters();
      if (over) return;
      fireTowers();
      applyMonsterEffects();
      resolveDeaths();
      updateShots();

      if (!spawns.length && monsters.length === 0) {
        endWave();
        return;
      }

      render();
    }

    function spawnMonster(spawn) {
      const base = MONSTERS[spawn.type];
      const hpScale = 1 + (wave - 1) * 0.24;
      monsters.push({
        id: monsterSeq++,
        type: spawn.type,
        lane: spawn.lane,
        x: 1.045,
        hp: Math.round(base.hp * hpScale),
        maxHp: Math.round(base.hp * hpScale),
        speed: base.speed * (1 + (wave - 1) * 0.035) * (currentMap().speed || 1),
        armor: base.armor || 0,
        regen: base.regen || 0,
        slowUntil: 0,
        burnUntil: 0,
        burnDmg: 0,
      });
    }

    function spawnMini(type, lane, progress) {
      const base = MONSTERS[type];
      const hpScale = 1 + (wave - 1) * 0.2;
      monsters.push({
        id: monsterSeq++,
        type,
        lane,
        x: Math.min(0.98, Math.max(0.08, progress + 0.025)),
        hp: Math.round(base.hp * hpScale),
        maxHp: Math.round(base.hp * hpScale),
        speed: base.speed * (1 + (wave - 1) * 0.035) * (currentMap().speed || 1),
        armor: base.armor || 0,
        regen: base.regen || 0,
        slowUntil: 0,
        burnUntil: 0,
        burnDmg: 0,
      });
    }

    function moveMonsters() {
      for (let i = monsters.length - 1; i >= 0; i--) {
        const m = monsters[i];
        const resist = MONSTERS[m.type].slowResist || 0.48;
        const slow = m.slowUntil > tick ? resist : 1;
        m.x -= m.speed * slow;
        if (m.x <= 0.018) {
          leaks++;
          const dmg = m.type === "boss" ? 8 : (m.armor >= 2 ? 3 : 2);
          baseHp = Math.max(0, baseHp - dmg);
          addLog(ctx.t(`${MONSTERS[m.type].name} lọt qua phòng tuyến! Căn cứ -${dmg} máu (còn ${baseHp}).`, `${monName(m.type)} slipped through! Base -${dmg} HP (${baseHp} left).`));
          monsters.splice(i, 1);
          ctx.sound("error");
          if (baseHp <= 0) { finish(false); return; }
        }
      }
    }

    function fireTowers() {
      for (let lane = 0; lane < LANES; lane++) {
        for (let slot = 0; slot < SLOTS; slot++) {
          const tower = towers[lane][slot];
          if (!tower) continue;
          const from = slotPoint(lane, slot);
          const target = pickTarget(lane, from, TOWERS[tower.type].range * 100);
          if (target) {
            const tp = routePoint(lane, target.x);
            tower.tx = tp.x; tower.ty = tp.y; // hướng nòng ngắm theo quái
          }
          if (tower.cooldown > 0) {
            tower.cooldown--;
            continue;
          }
          if (!target) continue;
          shoot(tower, lane, slot, target);
        }
      }
    }

    function pickTarget(lane, from, range) {
      return monsters
        .filter((m) => m.lane === lane && distance(routePoint(lane, m.x), from) <= range)
        .sort((a, b) => a.x - b.x)[0] || null;
    }

    function shoot(tower, lane, slot, target) {
      const def = TOWERS[tower.type];
      const dmg = Math.round(def.dmg * (1 + (tower.level - 1) * 0.48));
      dealDamage(target, dmg, def);

      if (def.splash) {
        const targetPoint = routePoint(lane, target.x);
        monsters.forEach((m) => {
          if (m !== target && m.lane === lane && distance(routePoint(lane, m.x), targetPoint) <= def.splash * 100) {
            dealDamage(m, dmg * 0.55, def);
          }
        });
      }

      if (def.chain) {
        const targetPoint = routePoint(lane, target.x);
        monsters
          .filter((m) => m !== target && m.lane === lane && distance(routePoint(lane, m.x), targetPoint) <= 18)
          .sort((a, b) => distance(routePoint(lane, a.x), targetPoint) - distance(routePoint(lane, b.x), targetPoint))
          .slice(0, def.chain)
          .forEach((m) => {
            dealDamage(m, dmg * 0.55, def);
            pushShot(routePoint(lane, target.x), routePoint(lane, m.x), tower.type);
          });
      }

      if (def.pierce) {
        monsters
          .filter((m) => m !== target && m.lane === lane && Math.abs(m.x - target.x) <= 0.08)
          .sort((a, b) => a.x - b.x)
          .slice(0, def.pierce)
          .forEach((m) => dealDamage(m, dmg * 0.5, def));
      }

      if (def.slow) target.slowUntil = Math.max(target.slowUntil, tick + def.slow + tower.level * 5);
      if (def.burn) {
        target.burnUntil = Math.max(target.burnUntil, tick + def.burn + tower.level * 4);
        target.burnDmg = Math.max(target.burnDmg, def.burnDmg + tower.level);
      }

      tower.cooldown = Math.max(3, Math.round(def.rate - (tower.level - 1) * 1.05));
      pushShot(slotPoint(lane, slot), routePoint(lane, target.x), tower.type);
    }

    function pushShot(from, to, type) {
      const fx = TOWERS[type] ? TOWERS[type].fx : "tracer";
      const life = SHOT_LIFE[fx] || 4;
      shots.push({ from, to, type, life, max: life });
    }

    function dealDamage(monster, amount, def) {
      const armor = def.ignoreArmor ? 0 : monster.armor;
      monster.hp -= Math.max(1, Math.round(amount - armor));
    }

    function applyMonsterEffects() {
      monsters.forEach((m) => {
        if (m.burnUntil > tick && tick % 5 === 0) m.hp -= m.burnDmg;
        if (m.regen && tick % 10 === 0) m.hp = Math.min(m.maxHp, m.hp + m.regen);
      });
    }

    function resolveDeaths() {
      for (let i = monsters.length - 1; i >= 0; i--) {
        const m = monsters[i];
        if (m.hp > 0) continue;
        const def = MONSTERS[m.type];
        const reward = Math.round(def.reward * (1 + wave * 0.05));
        coins += reward;
        if (def.split) {
          for (let j = 0; j < def.split; j++) {
            spawnMini("swarm", (m.lane + j) % LANES, m.x);
          }
          addLog(ctx.t(`${def.name} tách thành đàn nhỏ.`, `${monName(m.type)} splits into a small swarm.`));
        }
        monsters.splice(i, 1);
      }
    }

    function updateShots() {
      for (let i = shots.length - 1; i >= 0; i--) {
        shots[i].life--;
        if (shots[i].life <= 0) shots.splice(i, 1);
      }
    }

    function endWave() {
      clearInterval(timer);
      timer = null;
      phase = "prep";
      const bonus = 42 + wave * 11 + Math.max(0, 12 - monsters.length);
      coins += bonus;
      if (wave >= MAX_WAVE) {
        finish(true);
        return;
      }
      ctx.setTurn(0);
      addLog(ctx.t(`Qua wave ${wave}. Thưởng ${bonus} vàng.`, `Cleared wave ${wave}. Reward ${bonus} gold.`));
      ctx.setStatus(ctx.t(`Qua wave ${wave}. Có ${coins} vàng để mở rộng hỏa lực trước wave ${wave + 1}.`, `Cleared wave ${wave}. ${coins} gold to expand firepower before wave ${wave + 1}.`));
      render();
    }

    function finish(win) {
      if (timer) clearInterval(timer);
      timer = null;
      over = true;
      phase = "done";
      ctx.setTurn(-1);
      render();
      if (win) {
        ctx.incScore(0);
        ctx.setStatus(ctx.t(`🎉 Đội phòng thủ thắng! Chặn sạch quái qua ${MAX_WAVE} wave.`, `🎉 The defenders win! Held off monsters through ${MAX_WAVE} waves.`));
      } else {
        ctx.incScore(1);
        ctx.setStatus(ctx.t("💀 Quái đã lọt hết đường. Cả đội thua ván này.", "💀 Monsters broke through. The team loses this round."));
      }
    }

    function addLog(text) {
      log.unshift(text);
      while (log.length > 7) log.pop();
    }

    function render() {
      renderHud();
      renderMap();
      renderPopup();
      renderPanel();
      renderLog();
    }

    function renderHud() {
      const hpPct = Math.max(0, baseHp) / BASE_HP * 100;
      hudEl.innerHTML = `
        <div class="cd-stat">
          <b>${ctx.t("🏰 Máu căn cứ", "🏰 Base HP")}</b>
          <span>${baseHp}/${BASE_HP} ❤️</span>
          <i><em style="width:${hpPct}%"></em></i>
        </div>
        <div class="cd-stat">
          <b>${ctx.t("💰 Kho chung", "💰 Shared bank")}</b>
          <span>${ctx.t(`${coins} vàng`, `${coins} gold`)}</span>
          <small>${phase === "wave" ? ctx.t("wave đang chạy", "wave running") : ctx.t("đang chuẩn bị", "preparing")}</small>
        </div>
        <div class="cd-stat">
          <b>🗺️ ${mapName(currentMap())}</b>
          <span>Wave ${Math.min(wave + (phase === "prep" ? 1 : 0), MAX_WAVE)}/${MAX_WAVE}</span>
          <small>${ctx.t(`${monsters.length} quái · ${leaks} đã lọt`, `${monsters.length} monsters · ${leaks} leaked`)}</small>
        </div>
      `;
    }

    function renderMap() {
      const map = currentMap();
      mapEl.className = `cd-map map-${map.theme}`;
      mapEl.innerHTML = `
        <div class="cd-forest cd-forest-top"></div>
        <div class="cd-forest cd-forest-bottom"></div>
        <div class="cd-scenery">${renderScenery()}</div>
        <svg class="cd-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${Array.from({ length: LANES }, (_, lane) => `
            <polyline class="cd-path-shadow" points="${routePolyline(lane)}"></polyline>
            <polyline class="cd-path-main path-${lane}" points="${routePolyline(lane)}"></polyline>
            <polyline class="cd-path-edge" points="${routePolyline(lane)}"></polyline>
          `).join("")}
        </svg>
        <div class="cd-lane-tags">
          ${map.routes.map((route, lane) => `<span style="left:${route[1].x}%;top:${Math.max(10, route[1].y - 8)}%">${ctx.t(`Đường ${lane + 1}`, `Path ${lane + 1}`)}</span>`).join("")}
        </div>
        ${Array.from({ length: LANES }, (_, lane) => Array.from({ length: SLOTS }, (_, slot) => renderSlot(lane, slot)).join("")).join("")}
        ${monsters.map(renderMonster).join("")}
        ${shots.map(renderShot).join("")}
      `;

      mapEl.querySelectorAll("[data-slot]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lane = Number(btn.dataset.lane);
          const slot = Number(btn.dataset.slot);
          if (over) return;
          if (towers[lane][slot]) {
            selectedSlot = { lane, slot };
            renderPopup();
          } else {
            applyMove({ t: "build", lane, slot, type: selectedType }, false);
          }
        });
      });
    }

    // Popup nâng cấp/bán: chỉ dựng lại khi đổi lựa chọn (không mỗi tick) -> bấm nút ổn định.
    function renderPopup() {
      let sig = "none";
      let tower = null, pt = null;
      if (!over && selectedSlot) {
        tower = towers[selectedSlot.lane][selectedSlot.slot];
        if (tower) { pt = slotPoint(selectedSlot.lane, selectedSlot.slot); sig = `${selectedSlot.lane},${selectedSlot.slot},${tower.type},${tower.level}`; }
      }
      if (sig !== lastPopSig) {
        lastPopSig = sig;
        popupEl.innerHTML = tower ? popupHtml(tower, pt) : "";
        if (tower) {
          const upBtn = popupEl.querySelector('[data-pop="up"]');
          upBtn && upBtn.addEventListener("click", (e) => { e.stopPropagation(); if (selectedSlot) applyMove({ t: "upgrade", lane: selectedSlot.lane, slot: selectedSlot.slot }, false); });
          const sellBtn = popupEl.querySelector('[data-pop="sell"]');
          sellBtn && sellBtn.addEventListener("click", (e) => { e.stopPropagation(); if (selectedSlot) applyMove({ t: "sell", lane: selectedSlot.lane, slot: selectedSlot.slot }, false); });
          const closeBtn = popupEl.querySelector('[data-pop="close"]');
          closeBtn && closeBtn.addEventListener("click", (e) => { e.stopPropagation(); selectedSlot = null; renderPopup(); });
        }
      }
      // cập nhật trạng thái nút Nâng theo vàng mà KHÔNG dựng lại (giữ click ổn định)
      if (tower) {
        const upBtn = popupEl.querySelector('[data-pop="up"]');
        if (upBtn) { const cost = upgradeCost(tower); upBtn.disabled = tower.level >= 5 || coins < cost; }
      }
    }

    function popupHtml(tower, pt) {
      const def = TOWERS[tower.type];
      const cost = upgradeCost(tower);
      const refund = Math.floor(towerValue(tower) * 0.5);
      const side = pt.x > 55 ? "left" : "right";
      const upLabel = tower.level >= 5 ? "MAX" : `⬆️ ${cost}`;
      const upOff = tower.level >= 5 || coins < cost;
      return `
        <div class="cd-tower-popup pop-${side}" style="left:${pt.x}%;top:${pt.y}%">
          <button class="cd-pop-close" data-pop="close" type="button">✕</button>
          <b style="color:${def.color}">${towerName(tower.type)}</b>
          <span>${ctx.t(`Cấp ${tower.level}/5 · ${def.note}`, `Lv ${tower.level}/5 · ${towerNote(tower.type)}`)}</span>
          <div class="cd-pop-row">
            <button class="cd-pop-btn up" data-pop="up" type="button" ${upOff ? "disabled" : ""}>${upLabel}</button>
            <button class="cd-pop-btn sell" data-pop="sell" type="button">🪙 ${refund}</button>
          </div>
        </div>
      `;
    }

    function renderScenery() {
      return currentMap().scenery
        .map(([kind, x, y]) => `<span class="cd-deco cd-deco-${kind}" style="left:${x}%;top:${y}%"></span>`)
        .join("");
    }

    function renderSlot(lane, slot) {
      const tower = towers[lane][slot];
      const selected = selectedSlot && selectedSlot.lane === lane && selectedSlot.slot === slot;
      const pt = slotPoint(lane, slot);
      if (!tower) {
        return `<button class="cd-slot ${over ? "disabled" : ""}" data-lane="${lane}" data-slot="${slot}" style="left:${pt.x}%;top:${pt.y}%" title="${ctx.t("Xây súng", "Build gun")}"></button>`;
      }
      const def = TOWERS[tower.type];
      // góc ngắm theo quái (chỉnh theo tỉ lệ pixel thật của map), mặc định hướng trái
      let aim = 180;
      if (typeof tower.tx === "number") {
        const mw = mapEl.clientWidth || 900;
        const mh = mapEl.clientHeight || 660;
        const dx = (tower.tx - pt.x) / 100 * mw;
        const dy = (tower.ty - pt.y) / 100 * mh;
        aim = Math.atan2(dy, dx) * 180 / Math.PI;
      }
      const firing = tower.cooldown > 0 && tower.cooldown >= TOWERS[tower.type].rate - 2;
      return `
        <button class="cd-slot has-tower tower-${tower.type} ${selected ? "selected" : ""}" data-lane="${lane}" data-slot="${slot}" style="left:${pt.x}%;top:${pt.y}%;color:${def.color}" title="${ctx.t(`${def.name} cấp ${tower.level}`, `${towerName(tower.type)} lv ${tower.level}`)}">
          <span class="cd-gun-base"></span>
          <span class="cd-gun-turret ${firing ? "firing" : ""}" style="transform:translate(-50%,-50%) rotate(${aim.toFixed(1)}deg)">
            <span class="cd-gun-barrel"></span>
            <span class="cd-gun-dome"></span>
          </span>
          <span class="cd-gun-lv">${tower.level}</span>
        </button>
      `;
    }

    function renderMonster(m) {
      const pct = Math.max(0, m.hp) / m.maxHp * 100;
      const pt = routePoint(m.lane, m.x);
      const def = MONSTERS[m.type];
      return `
        <div class="cd-monster mon-${m.type} ${m.slowUntil > tick ? "slowed" : ""} ${m.burnUntil > tick ? "burning" : ""}" style="left:${pt.x}%;top:${pt.y}%" title="${monName(m.type)}">
          <span class="cd-mon-ic">${def.icon}</span>
          <i><em style="width:${pct}%"></em></i>
        </div>
      `;
    }

    function renderShot(s) {
      const def = TOWERS[s.type] || TOWERS.rifle;
      const fx = def.fx || "tracer";
      const prog = s.max ? 1 - s.life / s.max : 0; // 0 mới bắn -> 1 sắp tan
      let html = "";
      // tia đạn (chỉ với loại có đường bay)
      if (BEAM_FX[fx]) {
        const dx = s.to.x - s.from.x;
        const dy = s.to.y - s.from.y;
        const width = Math.max(1.5, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const op = (1 - prog).toFixed(2);
        html += `<div class="cd-shot cd-fx-${fx}" style="left:${s.from.x}%;top:${s.from.y}%;width:${width}%;color:${def.color};opacity:${op};transform:translateY(-50%) rotate(${angle}deg)"></div>`;
      }
      // hiệu ứng va chạm tại mục tiêu
      const base = IMPACT_SIZE[fx] || 12;
      const size = (base * (0.45 + prog * 0.95)).toFixed(1);
      const iop = Math.max(0, 1 - prog * 0.85).toFixed(2);
      html += `<div class="cd-impact cd-imp-${fx}" style="left:${s.to.x}%;top:${s.to.y}%;width:${size}px;height:${size}px;color:${def.color};opacity:${iop}"></div>`;
      return html;
    }

    function renderPanel() {
      // Chỉ dựng lại panel khi cần (không mỗi tick) -> nút không nhấp nháy & bấm ổn định.
      const sig = [phase, over ? 1 : 0, activeMap, selectedType, canChangeMap() ? 1 : 0, selectedSlot ? 1 : 0].join("|");
      if (sig !== lastPanelSig) {
        lastPanelSig = sig;
        buildPanel();
      }
      updatePanelDynamic();
    }

    function buildPanel() {
      const sel = selectedSlot ? towers[selectedSlot.lane][selectedSlot.slot] : null;
      panelEl.innerHTML = `
        <div class="cd-panel-section">
          <h3>Map</h3>
          <div class="cd-map-list">
            ${MAPS.map((map) => `
              <button class="cd-map-card map-${map.theme} ${currentMap().id === map.id ? "active" : ""}" data-map="${map.id}" ${!canChangeMap() ? "disabled" : ""}>
                <b>${mapName(map)}</b>
                <small>${mapNote(map)}</small>
              </button>
            `).join("")}
          </div>
        </div>
        <div class="cd-panel-section">
          <h3>${ctx.t("Kho súng", "Gun arsenal")}</h3>
          <div class="cd-tower-list">
            ${Object.entries(TOWERS).map(([id, def]) => `
              <button class="cd-tower-card ${selectedType === id ? "active" : ""}" data-tower="${id}" style="--tower:${def.color}" ${over ? "disabled" : ""}>
                <span class="tower-chip tower-${id}"><i></i><em></em></span>
                <b>${towerName(id)}</b>
                <small>${ctx.t(`${def.cost} vàng · ${def.note}`, `${def.cost} gold · ${towerNote(id)}`)}</small>
              </button>
            `).join("")}
          </div>
        </div>
        <div class="cd-panel-section">
          <h3>${ctx.t("Điều khiển", "Controls")}</h3>
          ${renderSelectedActions(sel)}
          <button class="btn primary cd-start" id="cdStart"></button>
          <button class="btn cd-strike" id="cdStrike"></button>
        </div>
      `;

      panelEl.querySelectorAll("[data-map]").forEach((btn) => {
        btn.addEventListener("click", () => applyMove({ t: "map", map: btn.dataset.map }, false));
      });
      panelEl.querySelectorAll("[data-tower]").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedType = btn.dataset.tower;
          render();
        });
      });
      const startBtn = panelEl.querySelector("#cdStart");
      startBtn && startBtn.addEventListener("click", () => applyMove({ t: "start" }, false));
      const strikeBtn = panelEl.querySelector("#cdStrike");
      strikeBtn && strikeBtn.addEventListener("click", () => applyMove({ t: "airstrike" }, false));
    }

    // Cập nhật nhãn/trạng thái nút Gọi wave & Không kích MỖI TICK mà không dựng lại phần tử.
    function updatePanelDynamic() {
      const startBtn = panelEl.querySelector("#cdStart");
      if (startBtn) {
        startBtn.disabled = phase !== "prep" || over;
        startBtn.textContent = phase === "wave" ? ctx.t("Wave đang chạy", "Wave running") : wave === 0 ? ctx.t("Gọi wave 1", "Call wave 1") : ctx.t(`Gọi wave ${wave + 1}`, `Call wave ${wave + 1}`);
      }
      const strikeBtn = panelEl.querySelector("#cdStrike");
      if (strikeBtn) {
        strikeBtn.disabled = phase !== "wave" || over || strikeCd > 0 || coins < STRIKE_COST;
        strikeBtn.textContent = ctx.t(`💥 Không kích (${STRIKE_COST} vàng${strikeCd > 0 ? " · hồi " + Math.ceil(strikeCd / 10) + "s" : ""})`, `💥 Airstrike (${STRIKE_COST} gold${strikeCd > 0 ? " · cd " + Math.ceil(strikeCd / 10) + "s" : ""})`);
      }
    }


    function renderSelectedActions(tower) {
      if (selectedSlot && tower) {
        return `<div class="cd-empty-select">${ctx.t("Bảng nâng cấp/bán hiện ngay cạnh cây súng trên bản đồ. Chọn súng rồi bấm bãi trống để xây thêm.", "The upgrade/sell panel appears next to the gun on the map. Pick a gun then click an empty pad to build more.")}</div>`;
      }
      return `<div class="cd-empty-select">${ctx.t("Chọn loại súng rồi bấm bãi xây trống trên map. Bấm vào súng đã xây để nâng cấp/bán ngay cạnh nó.", "Pick a gun type then click an empty build pad on the map. Click a built gun to upgrade/sell right next to it.")}</div>`;
    }

    function renderLog() {
      logEl.innerHTML = log.map((line) => `<span>${line}</span>`).join("");
    }

    ctx.setNames(ctx.t("Đội phòng thủ", "Defenders"), ctx.t("Bầy quái", "Monster horde"));
    ctx.setTurn(0);
    ctx.setStatus(ctx.t("Chọn map, đặt súng quanh đường rồi gọi wave. Không để quái lọt hết đường.", "Pick a map, place guns along the paths then call a wave. Don't let monsters slip through."));
    render();
    return { applyMove };
  }

  window.GameRegistry.register({
    id: "coopdefense",
    name: "Thủ Thành Hợp Tác",
    emoji: "🏰",
    description: "Hai người cùng thủ đường: nhiều map, nhiều loại súng & quái (emoji rõ ràng), căn cứ có thanh máu, và chiêu Không kích 💥 dùng chung.",
    onlineReady: true,
    options: [],
    howTo: [
      "Đây là game hợp tác: cả hai người dùng chung vàng để giữ căn cứ. Quái lọt qua sẽ trừ máu căn cứ 🏰❤️ — hết máu là cả đội thua.",
      "Có nhiều map. Chọn map trước khi xây tháp hoặc gọi wave đầu tiên; sau khi đã xây thì map sẽ khóa cho ván đó.",
      "Quái xuất hiện từ ổ quái bên phải và chạy theo 3 đường về mép trái. Mỗi loại quái và súng có biểu tượng riêng để dễ nhận.",
      "Có 8 loại súng: 🔫 súng máy, 💣 pháo nổ, ❄️ băng, 🔆 laser, 🎯 xạ thủ, ⚡ Tesla, 🔥 hỏa tháp, 🧨 cối đá. Mỗi loại có tầm, nhịp bắn và hiệu ứng riêng.",
      "Trong lúc wave đang chạy vẫn có thể chọn súng, xây bãi trống, nâng cấp hoặc bán tháp.",
      "💥 Không kích: tốn vàng, giáng sát thương lớn (xuyên giáp) lên TẤT CẢ quái đang trên map và làm chậm chúng — dùng để cứu nguy khi quá đông. Có thời gian hồi chiêu.",
      "Qua wave sẽ nhận thêm vàng. Sống sót qua toàn bộ wave là cả đội thắng.",
    ],
    create,
  });
})();
