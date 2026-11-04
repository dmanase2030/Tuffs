/* ============================================================
   Registry dùng chung — PHẢI nạp trước các file game.
   ============================================================ */
window.GameRegistry = {
  games: [],
  register(game) { this.games.push(game); },
  get(id) { return this.games.find((g) => g.id === id) || null; },
};

/* RNG có hạt giống (mulberry32) — để chế độ online đồng bộ ngẫu nhiên
   giữa hai máy (ví dụ xáo bài game Lật Hình). */
window.makeRng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
