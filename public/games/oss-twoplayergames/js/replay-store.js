/* ============================================================
   ReplayStore: logic THUẦN (không DOM/localStorage) cho việc lưu & lấy
   replay ván đã chơi — dùng chung cho trình duyệt (window.ReplayStore)
   và unit test (require). main.js lo phần đọc/ghi localStorage.
   ============================================================ */
(function (factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ReplayStore = api;
})(function () {
  // Thêm một replay vào store rồi GIỮ tối đa `max` bản ghi mới nhất (theo ts).
  // Trả về store MỚI (không sửa store cũ). max <= 0 => không cắt bớt.
  function addReplay(store, rid, data, max) {
    const all = Object.assign({}, store || {});
    all[rid] = data;
    const entries = Object.entries(all).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
    const limit = max > 0 ? max : entries.length;
    const kept = {};
    entries.slice(0, limit).forEach(([k, v]) => { kept[k] = v; });
    return kept;
  }

  // Lấy dữ liệu replay HỢP LỆ (có mảng moves không rỗng) theo id, hoặc null.
  function getReplay(store, rid) {
    const d = store && store[rid];
    if (!d || !Array.isArray(d.moves) || !d.moves.length) return null;
    return d;
  }

  // Tạo id replay khó trùng. Tách riêng để test được khi bơm now/rand cố định.
  function makeReplayId(now, rand) {
    const r = String((rand == null ? Math.random() : rand).toString(36)).slice(2, 6);
    return "r" + Number(now).toString(36) + r;
  }

  return { addReplay, getReplay, makeReplayId };
});
