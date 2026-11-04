/* ============================================================
   StatsUtil: các hàm logic THUẦN (không DOM) cho thống kê —
   dùng chung cho trình duyệt (window.StatsUtil) và unit test (require).
   ============================================================ */
(function (factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.StatsUtil = api;
})(function () {
  // Khóa ngày dạng "YYYY-M-D" (theo getMonth 0-based) — gom nhóm lịch sử theo ngày.
  function dateKey(d) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  // Chuỗi ngày dạng "YYYY-MM-DD" (1-based, đệm 0) — dùng cho thử thách hằng ngày.
  function dailyDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  // Chỉ số game của thử thách theo ngày — tất định: cùng ngày + cùng số game -> cùng chỉ số.
  function dailyIndex(dateStr, n) {
    if (!n || n <= 0) return -1;
    return hashStr(dateStr) % n;
  }
  // Kết quả 1 ván theo góc nhìn người chơi cục bộ.
  function histOutcome(h) {
    if (!h) return "win";
    if (h.kind === "draw") return "draw";
    if (h.mode === "ai") return h.winner === 0 ? "win" : "lose";
    if (h.mode === "online" && typeof h.seat === "number") return h.winner === h.seat ? "win" : "lose";
    return "win";
  }
  // Sắp xếp bảng xếp hạng: thắng P1 -> chuỗi thắng -> số ván.
  function sortLeaderboard(stats) {
    return Object.keys(stats || {})
      .map((id) => Object.assign({ id }, stats[id]))
      .filter((r) => r.played > 0)
      .sort((a, b) => (b.p1 - a.p1) || ((b.bestStreak || 0) - (a.bestStreak || 0)) || (b.played - a.played));
  }
  // Cập nhật chuỗi thắng khi ghi một ván (P1 góc nhìn). Trả về {streak, bestStreak}.
  function nextStreak(prevStreak, prevBest, kind, winner) {
    let streak = prevStreak || 0;
    let best = prevBest || 0;
    if (kind === "draw") streak = 0;
    else if (winner === 0) { streak += 1; if (streak > best) best = streak; }
    else if (winner === 1) streak = 0;
    return { streak, bestStreak: best };
  }

  return { dateKey, dailyDateStr, hashStr, dailyIndex, histOutcome, sortLeaderboard, nextStreak };
});
