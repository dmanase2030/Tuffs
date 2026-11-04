/* Đăng ký service worker (PWA / chạy offline).
   Tách khỏi index.html để Content-Security-Policy có thể dùng script-src 'self'
   mà không cần 'unsafe-inline'. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline không khả dụng */ });
  });
}
