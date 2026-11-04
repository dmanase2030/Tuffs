/* Service worker: cache app shell + runtime cache để chơi offline.
   Chiến lược:
   - HTML/CSS/JS (mã nguồn app): NETWORK-FIRST → luôn lấy bản mới nhất khi có mạng,
     chỉ fallback sang cache khi offline. Tránh tình trạng "kẹt bản cũ".
   - Tài nguyên tĩnh khác (ảnh, icon, font): CACHE-FIRST cho nhanh.
*/
const CACHE = "tpg-v121";
// vi-dict.js (~650KB) KHÔNG nằm trong CORE: nạp trễ khi cần (3 game dùng từ
// tiếng Việt) và được cache runtime, để lần cài app đầu không tải khối lớn này.
const CORE = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./icon.svg",
  "./manifest.webmanifest",
  "./js/registry.js",
  "./js/sound.js",
  "./js/i18n.js",
  "./js/stats-util.js",
  "./js/replay-store.js",
  "./js/games-i18n.js",
  "./js/net.js",
  "./js/account.js",
  "./js/main.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// File mã nguồn app cần luôn cập nhật khi có mạng
function isAppCode(url) {
  return url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".webmanifest");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // bỏ qua tài nguyên ngoài (font Google...)

  // điều hướng (mở app) + mã nguồn app: NETWORK-FIRST
  if (req.mode === "navigate" || isAppCode(url)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html").then((idx) => idx || caches.match("./offline.html"))))
    );
    return;
  }

  // tài nguyên tĩnh khác: CACHE-FIRST + lưu runtime
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
