/* ============================================================
   Net: WebSocket cho chơi online + tự kết nối lại khi rớt mạng
   ============================================================ */
window.Net = (function () {
  let ws = null;
  const handlers = {};
  let reconnectAllowed = false;
  let attempts = 0;
  let reconnTimer = null;
  const MAX_ATTEMPTS = 6;

  function url() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  }

  function emit(type, payload) {
    (handlers[type] || []).forEach((fn) => fn(payload));
  }

  function bindSocket(socket, onOpen) {
    socket.onopen = () => { attempts = 0; emit("netup"); if (onOpen) onOpen(); };
    socket.onerror = () => {};
    socket.onclose = () => {
      emit("netdown");
      if (reconnectAllowed) scheduleReconnect();
    };
    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      emit(msg.type, msg);
    };
  }

  function scheduleReconnect() {
    if (reconnTimer) return;
    if (attempts >= MAX_ATTEMPTS) { emit("netfail"); return; }
    attempts++;
    emit("netretry", { attempt: attempts, max: MAX_ATTEMPTS });
    reconnTimer = setTimeout(() => {
      reconnTimer = null;
      ws = new WebSocket(url());
      bindSocket(ws);
    }, Math.min(5000, 500 * attempts));
  }

  function connect() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) return resolve();
      reconnectAllowed = true;
      attempts = 0;
      ws = new WebSocket(url());
      let settled = false;
      ws.onopen = () => { attempts = 0; settled = true; emit("netup"); resolve(); };
      ws.onerror = () => { if (!settled) reject(new Error("Không kết nối được tới server.")); };
      ws.onclose = () => { emit("netdown"); if (reconnectAllowed) scheduleReconnect(); };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        emit(msg.type, msg);
      };
    });
  }

  function disconnect() {
    reconnectAllowed = false;
    if (reconnTimer) { clearTimeout(reconnTimer); reconnTimer = null; }
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  }

  function isOpen() { return !!ws && ws.readyState === WebSocket.OPEN; }

  function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }
  function off(type) { delete handlers[type]; }
  function send(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
  }

  return { connect, disconnect, isOpen, on, off, send, emit };
})();
