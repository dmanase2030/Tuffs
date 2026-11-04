/* ============================================================
   Account: đăng nhập + đồng bộ hồ sơ (localStorage tpg_*) lên server.
   - Độc lập với main.js: tự đọc/ghi localStorage, tự gắn UI trong trang Hồ sơ.
   - Token phiên lưu ở tpg_auth_token; tên đăng nhập ở tpg_auth_user.
   - Đồng bộ theo kiểu "mới nhất thắng" dựa trên mốc thời gian cập nhật:
     khi đăng nhập, so mốc local vs server rồi kéo (pull) hoặc đẩy (push).
   ============================================================ */
window.Account = (function () {
  const TOKEN_KEY = "tpg_auth_token";
  const USER_KEY = "tpg_auth_user";
  const LOCAL_TS_KEY = "tpg_state_ts"; // mốc thời gian dữ liệu local đổi lần cuối

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emitChange() { listeners.forEach((fn) => { try { fn(state()); } catch (e) { /* ignore */ } }); }

  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

  function token() { return lsGet(TOKEN_KEY) || ""; }
  function username() { return lsGet(USER_KEY) || ""; }
  function isSignedIn() { return !!token(); }
  function state() { return { signedIn: isSignedIn(), username: username() }; }

  // Gom toàn bộ khóa tpg_* CỦA DỮ LIỆU GAME (bỏ khóa auth) để đồng bộ.
  function collectState() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf("tpg_") !== 0) continue;
        if (k === TOKEN_KEY || k === USER_KEY) continue; // không đồng bộ token
        out[k] = localStorage.getItem(k);
      }
    } catch { /* ignore */ }
    return out;
  }

  // Ghi đè localStorage bằng blob trạng thái từ server (chỉ khóa dữ liệu game).
  function applyState(blob) {
    if (!blob || typeof blob !== "object") return;
    applying = true; // không tự bump mốc thời gian khi đang áp dữ liệu server
    try {
      // Xóa các khóa game hiện có trước để tránh sót dữ liệu cũ.
      const toDel = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("tpg_") === 0 && k !== TOKEN_KEY && k !== USER_KEY && k !== LOCAL_TS_KEY) toDel.push(k);
      }
      toDel.forEach(lsDel);
      Object.keys(blob).forEach((k) => {
        if (k.indexOf("tpg_") === 0 && k !== TOKEN_KEY && k !== USER_KEY && typeof blob[k] === "string") {
          lsSet(k, blob[k]);
        }
      });
    } finally {
      applying = false;
    }
  }

  function localTs() { return Number(lsGet(LOCAL_TS_KEY)) || 0; }
  // Gọi mỗi khi dữ liệu game thay đổi để cập nhật mốc "mới nhất".
  function touch() { lsSet(LOCAL_TS_KEY, String(Date.now())); }

  // Tự động bump mốc thời gian mỗi khi có khóa dữ liệu game (tpg_*) được ghi,
  // để đối chiếu local vs server lúc đăng nhập luôn chính xác mà không cần
  // sửa main.js. Bỏ qua khóa auth và chính khóa mốc thời gian (tránh vòng lặp).
  let applying = false; // đang áp dữ liệu từ server -> không tự bump
  (function patchSetItem() {
    try {
      const proto = window.Storage && window.Storage.prototype;
      if (!proto || proto.__tpgPatched) return;
      const orig = proto.setItem;
      proto.setItem = function (k, v) {
        orig.call(this, k, v);
        if (!applying && typeof k === "string" && k.indexOf("tpg_") === 0
            && k !== TOKEN_KEY && k !== USER_KEY && k !== LOCAL_TS_KEY) {
          try { orig.call(this, LOCAL_TS_KEY, String(Date.now())); } catch { /* ignore */ }
        }
      };
      proto.__tpgPatched = true;
    } catch { /* ignore */ }
  })();

  async function api(path, opts) {
    const headers = { "Content-Type": "application/json" };
    const t = token();
    if (t) headers["Authorization"] = "Bearer " + t;
    const res = await fetch(path, Object.assign({ headers }, opts));
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, data };
  }

  async function register(user, pass) {
    const r = await api("/api/register", { method: "POST", body: JSON.stringify({ username: user, password: pass }) });
    if (!r.ok) return { error: r.data.error || "error" };
    lsSet(TOKEN_KEY, r.data.token);
    lsSet(USER_KEY, r.data.username);
    // Tài khoản mới: đẩy dữ liệu local hiện có lên server.
    await push();
    emitChange();
    return { ok: true };
  }

  async function login(user, pass) {
    const r = await api("/api/login", { method: "POST", body: JSON.stringify({ username: user, password: pass }) });
    if (!r.ok) return { error: r.data.error || "error" };
    lsSet(TOKEN_KEY, r.data.token);
    lsSet(USER_KEY, r.data.username);
    // Hòa giải: server có dữ liệu mới hơn -> kéo về; ngược lại -> đẩy lên.
    const serverTs = Number(r.data.stateUpdatedAt) || 0;
    const serverHasData = r.data.state && Object.keys(r.data.state).length > 0;
    if (serverHasData && serverTs >= localTs()) {
      applyState(r.data.state);
      lsSet(LOCAL_TS_KEY, String(serverTs));
      emitChange();
      return { ok: true, pulled: true };
    }
    await push();
    emitChange();
    return { ok: true, pushed: true };
  }

  async function logout() {
    try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
    lsDel(TOKEN_KEY);
    lsDel(USER_KEY);
    emitChange();
    return { ok: true };
  }

  // Đẩy dữ liệu local lên server.
  async function push() {
    if (!isSignedIn()) return { error: "unauthorized" };
    const r = await api("/api/state", { method: "POST", body: JSON.stringify({ state: collectState() }) });
    if (!r.ok) {
      if (r.status === 401) { lsDel(TOKEN_KEY); lsDel(USER_KEY); emitChange(); }
      return { error: r.data.error || "error" };
    }
    if (r.data.stateUpdatedAt) lsSet(LOCAL_TS_KEY, String(r.data.stateUpdatedAt));
    return { ok: true };
  }

  // Kéo dữ liệu từ server về (ghi đè local).
  async function pull() {
    if (!isSignedIn()) return { error: "unauthorized" };
    const r = await api("/api/state", { method: "GET" });
    if (!r.ok) {
      if (r.status === 401) { lsDel(TOKEN_KEY); lsDel(USER_KEY); emitChange(); }
      return { error: r.data.error || "error" };
    }
    applyState(r.data.state);
    if (r.data.stateUpdatedAt) lsSet(LOCAL_TS_KEY, String(r.data.stateUpdatedAt));
    return { ok: true };
  }

  // Lấy bảng xếp hạng online (không cần đăng nhập).
  async function fetchLeaderboard(gameId, limit) {
    const q = "?game=" + encodeURIComponent(gameId || "overall") + "&limit=" + (Number(limit) || 20);
    const r = await api("/api/leaderboard" + q, { method: "GET" });
    if (!r.ok) return { error: r.data.error || "error" };
    return { ok: true, rows: r.data.rows || [] };
  }

  // Lấy rating của chính mình (cần đăng nhập).
  async function fetchRating() {
    if (!isSignedIn()) return { error: "unauthorized" };
    const r = await api("/api/rating", { method: "GET" });
    if (!r.ok) return { error: r.data.error || "error" };
    return { ok: true, rating: r.data };
  }

  return {
    onChange, isSignedIn, username, state, touch,
    register, login, logout, push, pull,
    leaderboard: fetchLeaderboard, rating: fetchRating,
  };
})();

/* ============================================================
   UI controller: gắn nút đăng nhập/đăng ký/đồng bộ trong trang Hồ sơ.
   Tách khỏi window.Account (logic thuần) để dễ test phần logic.
   ============================================================ */
(function () {
  if (typeof document === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const T = (key) => (window.I18n ? window.I18n.t(key) : key);

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    const box = $("accountBox");
    if (!box || !window.Account) return;

    const signedOut = $("accountSignedOut");
    const signedIn = $("accountSignedIn");
    const userInput = $("accUser");
    const passInput = $("accPass");
    const loginBtn = $("accLoginBtn");
    const registerBtn = $("accRegisterBtn");
    const syncBtn = $("accSyncBtn");
    const logoutBtn = $("accLogoutBtn");
    const who = $("accWho");
    const msg = $("accMsg");
    const msg2 = $("accMsg2");

    let busy = false;

    // Diễn giải mã lỗi từ server sang thông điệp thân thiện (song ngữ qua i18n).
    function explain(code) {
      const map = {
        invalid_username: "accErrInvalidUser",
        invalid_password: "accErrInvalidPass",
        username_taken: "accErrTaken",
        invalid_credentials: "accErrCreds",
        rate_limited: "accErrRate",
        state_too_large: "accErrBig",
        error: "accErrGeneric",
      };
      return T(map[code] || "accErrGeneric");
    }

    function setMsg(target, text, kind) {
      if (!target) return;
      target.textContent = text || "";
      target.classList.remove("ok", "err");
      if (kind) target.classList.add(kind);
    }

    function render() {
      const signed = window.Account.isSignedIn();
      if (signedOut) signedOut.classList.toggle("hidden", signed);
      if (signedIn) signedIn.classList.toggle("hidden", !signed);
      if (signed && who) who.textContent = window.Account.username();
      setMsg(msg, "");
      setMsg(msg2, "");
    }

    function setBusy(b) {
      busy = b;
      [loginBtn, registerBtn, syncBtn, logoutBtn].forEach((el) => { if (el) el.disabled = b; });
    }

    async function doAuth(kind) {
      if (busy) return;
      const u = (userInput && userInput.value || "").trim();
      const p = (passInput && passInput.value) || "";
      if (!u || !p) { setMsg(msg, T("accErrEmpty"), "err"); return; }
      setBusy(true);
      setMsg(msg, T("accBusy"));
      try {
        const r = kind === "register"
          ? await window.Account.register(u, p)
          : await window.Account.login(u, p);
        if (r.error) { setMsg(msg, explain(r.error), "err"); return; }
        if (passInput) passInput.value = "";
        render();
        setMsg(msg2, r.pulled ? T("accPulled") : T("accSyncOk"), "ok");
        // Dữ liệu vừa kéo về có thể khác -> tải lại để giao diện phản ánh.
        if (r.pulled) setTimeout(() => location.reload(), 700);
      } catch (e) {
        setMsg(msg, T("accErrNet"), "err");
      } finally {
        setBusy(false);
      }
    }

    async function doSync() {
      if (busy) return;
      setBusy(true);
      setMsg(msg2, T("accBusy"));
      try {
        const r = await window.Account.push();
        setMsg(msg2, r.error ? explain(r.error) : T("accSyncOk"), r.error ? "err" : "ok");
      } catch (e) {
        setMsg(msg2, T("accErrNet"), "err");
      } finally {
        setBusy(false);
      }
    }

    async function doLogout() {
      if (busy) return;
      setBusy(true);
      try { await window.Account.logout(); } finally { setBusy(false); render(); }
    }

    if (loginBtn) loginBtn.addEventListener("click", () => doAuth("login"));
    if (registerBtn) registerBtn.addEventListener("click", () => doAuth("register"));
    if (syncBtn) syncBtn.addEventListener("click", doSync);
    if (logoutBtn) logoutBtn.addEventListener("click", doLogout);
    if (passInput) passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth("login"); });

    // ---------- Bảng xếp hạng online (ELO toàn cục) ----------
    const lbGameSelect = $("lbGameSelect");
    const lbRefreshBtn = $("lbRefreshBtn");
    const lbList = $("lbList");
    const eloRow = $("accEloRow");
    const eloVal = $("accElo");

    function esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
    }

    // Nạp danh sách game vào ô chọn (Tổng + từng game có tên).
    function fillGameSelect() {
      if (!lbGameSelect) return;
      const games = (window.GameRegistry && window.GameRegistry.games) || [];
      const opts = ["<option value=\"overall\">" + esc(T("lbAll")) + "</option>"];
      games.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((g) => {
        opts.push("<option value=\"" + esc(g.id) + "\">" + esc(g.name || g.id) + "</option>");
      });
      lbGameSelect.innerHTML = opts.join("");
    }

    async function loadLeaderboard() {
      if (!lbList) return;
      lbList.innerHTML = "<div class=\"lb-empty\">" + esc(T("lbLoading")) + "</div>";
      const game = lbGameSelect ? lbGameSelect.value : "overall";
      const r = await window.Account.leaderboard(game, 20);
      if (r.error || !r.rows) { lbList.innerHTML = "<div class=\"lb-empty\">" + esc(T("lbErr")) + "</div>"; return; }
      if (!r.rows.length) { lbList.innerHTML = "<div class=\"lb-empty\">" + esc(T("lbEmpty")) + "</div>"; return; }
      const me = window.Account.username().toLowerCase();
      const medals = ["🥇", "🥈", "🥉"];
      lbList.innerHTML = r.rows.map((row, i) => {
        const rank = medals[i] || (i + 1) + ".";
        const mine = String(row.username).toLowerCase() === me ? " lb-me" : "";
        return "<div class=\"lb-item" + mine + "\">" +
          "<span class=\"lb-rank\">" + rank + "</span>" +
          "<span class=\"lb-name\">" + esc(row.username) + "</span>" +
          "<span class=\"lb-elo\">" + row.rating + "</span>" +
          "<span class=\"lb-wdl\">" + row.wins + "/" + row.draws + "/" + row.losses + "</span>" +
          "</div>";
      }).join("");
    }

    // Cập nhật ELO của chính mình trong khối tài khoản.
    async function refreshMyElo() {
      if (!eloRow || !eloVal) return;
      if (!window.Account.isSignedIn()) { eloRow.classList.add("hidden"); return; }
      const r = await window.Account.rating();
      if (r.error) { eloRow.classList.add("hidden"); return; }
      eloVal.textContent = r.overall + " (" + (r.wins || 0) + "/" + (r.draws || 0) + "/" + (r.losses || 0) + ")";
      eloRow.classList.remove("hidden");
    }

    if (lbGameSelect) lbGameSelect.addEventListener("change", loadLeaderboard);
    if (lbRefreshBtn) lbRefreshBtn.addEventListener("click", () => { loadLeaderboard(); refreshMyElo(); });

    // Nạp lần đầu khi có registry sẵn sàng (main.js nạp game qua defer cùng lúc).
    function initLeaderboard() {
      fillGameSelect();
      loadLeaderboard();
      refreshMyElo();
    }
    if (window.GameRegistry && window.GameRegistry.games && window.GameRegistry.games.length) initLeaderboard();
    else window.addEventListener("load", initLeaderboard, { once: true });
    if (window.I18n && window.I18n.onChange) window.I18n.onChange(() => { fillGameSelect(); });

    // Khi trạng thái đăng nhập đổi (login/logout) -> cập nhật ELO của mình.
    window.Account.onChange(refreshMyElo);

    window.Account.onChange(render);
    render();

    // Đăng nhập sẵn thì kéo dữ liệu mới nhất về nền (không chặn UI).
    if (window.Account.isSignedIn()) {
      window.Account.pull().then((r) => {
        if (r && r.ok) setMsg(msg2, T("accSyncOk"), "ok");
      }).catch(() => {});
    }
  });
})();
