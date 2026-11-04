# 🏛️ Tài liệu kỹ thuật — Game 2 Người

Tài liệu này mô tả **kiến trúc bên trong** của dự án: các thành phần, luồng dữ liệu,
giao thức online, cách một game được nạp và chạy, cùng quy ước để mở rộng. Dành cho
người muốn hiểu code hoặc đóng góp. Phần hướng dẫn chơi/chạy nằm ở [`README.md`](../README.md).

> Tóm tắt một câu: **client thuần HTML/CSS/JS** chứa toàn bộ logic game; **server Node**
> chỉ làm 2 việc — phục vụ file tĩnh và **relay nước đi** giữa 2 trình duyệt qua WebSocket.
> Các game được thiết kế **tất định** nên hai máy tự đồng bộ trạng thái mà server không
> cần hiểu luật game.

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────┐         WebSocket (JSON)         ┌─────────────────────┐
│   Trình duyệt A      │ ───────── move/chat ───────────▶ │      server.js       │
│  (index.html + js)   │ ◀──────── move/chat ──────────── │  HTTP tĩnh + relay   │
│                      │                                  │  (game-agnostic)     │
│  GameRegistry        │                                  └──────────┬──────────┘
│  ├─ main.js (khung)  │                                             │ relay
│  ├─ net.js (WS)      │         WebSocket (JSON)                     ▼
│  └─ games/*.js       │ ◀───────────────────────────────  ┌─────────────────────┐
└─────────────────────┘                                    │   Trình duyệt B      │
                                                            └─────────────────────┘
```

**Nguyên tắc cốt lõi:**

1. **Server không biết luật game.** Nó chỉ chuyển tiếp (relay) đối tượng `move` từ máy này
   sang máy kia. Mọi logic (kiểm tra nước hợp lệ, tính thắng/thua, AI) chạy ở client.
2. **Tất định từ seed chung.** Khi tạo phòng, server phát một `seed` ngẫu nhiên cho cả hai
   máy. Mọi yếu tố ngẫu nhiên trong game (xáo bài, sinh bom, vị trí kho báu...) đều dùng
   `ctx.rng` khởi tạo từ seed này, nên hai máy sinh ra **cùng một trạng thái** mà không cần
   gửi toàn bộ state qua mạng — chỉ cần gửi nước đi.
3. **Một game = một file tự đăng ký.** Mỗi file trong `js/games/` gọi
   `window.GameRegistry.register({...})`. Không có file trung tâm liệt kê luật game.

---

## 2. Cây thư mục & vai trò từng phần

```
TwoPlayerGames/
├── index.html          # Khung DOM: menu, sảnh online, khung chat, modal; nạp mọi script
├── styles.css          # Toàn bộ CSS (một file lớn, chia mục theo prefix từng game)
├── server.js           # HTTP tĩnh + WebSocketServer (phòng, relay, reconnect, rate-limit)
├── sw.js               # Service worker PWA (network-first cho mã nguồn, cache-first cho ảnh)
├── manifest.webmanifest
├── package.json        # scripts: start / smoke / test:unit / test:online / test
├── scripts/
│   └── smoke-test.js   # Khởi động server thật, kiểm HTTP + WebSocket tạo/vào phòng
├── tests/              # node:test (unit) + *-it.js (integration online qua ws thật)
├── docs/
│   └── ARCHITECTURE.md # ← tài liệu này
└── js/
    ├── registry.js     # GameRegistry + makeRng (mulberry32). PHẢI nạp trước mọi game
    ├── i18n.js         # Từ điển VI/EN cho khung giao diện (DICT.vi / DICT.en)
    ├── games-i18n.js   # name/description/howTo tiếng Anh cho từng game (GAMES_EN)
    ├── stats-util.js   # Hàm thuần cho thống kê (dùng chung browser + test)
    ├── sound.js        # Hiệu ứng âm thanh + nhạc nền
    ├── net.js          # Client WebSocket: connect, reconnect, on/off/send
    ├── main.js         # "Bộ não" UI: menu, chế độ chơi, vòng đời ván, chat, hồ sơ, ctx
    └── games/          # Mỗi file một game, tự register vào GameRegistry
```

**Thứ tự nạp script** (trong `index.html`) rất quan trọng: `registry.js` → các module phụ
(`i18n`, `sound`, `net`, `games-i18n`, `stats-util`) → tất cả `games/*.js` → cuối cùng
`main.js`. Vì game tự đăng ký khi file được nạp, nên khi `main.js` chạy thì `GameRegistry.games`
đã đầy đủ.

---

## 3. GameRegistry & RNG (registry.js)

```js
window.GameRegistry = {
  games: [],
  register(game) { this.games.push(game); },
  get(id) { return this.games.find((g) => g.id === id) || null; },
};
```

- Mỗi game gọi `register()` với metadata + hàm `create`. `main.js` dựng menu từ
  `GameRegistry.games`.
- `window.makeRng(seed)` là **mulberry32** — PRNG có hạt giống, tất định. Cùng seed → cùng
  chuỗi số. Đây là nền tảng cho đồng bộ online: cả hai máy gọi `makeRng(seed)` với seed
  giống nhau nên mọi "ngẫu nhiên" trùng khớp.

---

## 4. Vòng đời một game & đối tượng `ctx`

`main.js` quản lý vòng đời. Khi người chơi chọn game và bắt đầu:

1. Dựng `ctx` (context) bằng `makeContext(seed)`.
2. Gọi `game.create(ctx)` → game tự render vào `ctx.boardEl` và trả về API
   `{ applyMove, aiMove?, undo?, destroy? }`.
3. `main.js` giữ instance đó để gọi `applyMove` (khi nhận nước từ mạng/AI) hoặc `destroy`
   (khi rời game).

### `ctx` — cầu nối giữa game và khung

| Thuộc tính / hàm | Ý nghĩa |
|---|---|
| `ctx.boardEl` | Phần tử DOM để game render vào |
| `ctx.isOnline` | Đang chơi online hay không |
| `ctx.mySeat` | Ghế của mình (0/1) khi online; `-1` khi chung máy |
| `ctx.firstSeat` | Ai đi trước (đồng bộ từ server) |
| `ctx.round` | Số ván đã chơi (tăng khi "chơi lại") |
| `ctx.rng()` | PRNG tất định từ seed chung — **dùng cái này cho mọi ngẫu nhiên** |
| `ctx.vsAI`, `ctx.aiLevel` | Chế độ đấu máy và mức độ (easy/normal/hard) |
| `ctx.options` | Tùy chỉnh ván (đồng bộ giữa 2 máy online) |
| `ctx.sendMove(move)` | Gửi nước đi sang đối thủ (chỉ online) |
| `ctx.setStatus(text)` | Đặt dòng trạng thái; nếu chứa 🎉/🤝/💀 sẽ tự ghi kết quả + màn mừng |
| `ctx.setTurn(idx)` | Cập nhật banner lượt; `-1` = kết thúc |
| `ctx.setNames(n1, n2)` | Đặt tên hai người chơi |
| `ctx.incScore(idx)` | Cộng điểm cho người thắng (kích hoạt ghi thống kê) |
| `ctx.sound(name)` | Phát âm thanh |
| `ctx.t(vi, en)` | Lấy chuỗi theo ngôn ngữ hiện tại |

### API mà `create(ctx)` trả về

| Hàm | Bắt buộc | Vai trò |
|---|---|---|
| `applyMove(move, fromRemote)` | ✅ | Áp một nước đi. `fromRemote=true` khi nước đến từ mạng/AI |
| `aiMove(level)` | tùy | Trả về nước cho máy đánh (game có `supportsAI`) |
| `undo()` | tùy | Hoàn tác (chung máy) |
| `destroy()` | tùy | Dọn timer/RAF/listener khi rời game |

### Quy ước `applyMove(move, fromRemote)` — quan trọng nhất

Đây là chỗ dễ sai khi viết game online. Mẫu chuẩn:

```js
function applyMove(move, fromRemote) {
  // 1. validate move (luôn luôn, kể cả nước từ remote)
  if (over || !isLegal(move)) return;

  // 2. ghi nước đi (để xem lại ván); ctx.sendMove tự lo việc relay khi online
  if (!fromRemote) ctx.sendMove(move);

  // 3. áp dụng vào trạng thái + render
  applyToState(move);
  render();
}
```

- Nước do người chơi cục bộ thao tác: gọi `applyMove(move, false)` → game tự gửi sang đối thủ.
- Nước nhận từ mạng: `main.js` gọi `applyMove(move, true)` → **không** gửi lại (tránh vòng lặp).
- Nước AI: gọi `applyMove(aiMove(level), false)` (chung máy nên không relay).

---

## 5. Đồng bộ online — chi tiết

### Tại sao chỉ cần gửi `move`?

Vì state được tái tạo tất định. Ví dụ game Lật Hình: thay vì gửi cả bộ bài đã xáo, server
chỉ gửi `seed`; cả hai máy gọi `shuffle(deck, ctx.rng)` với cùng seed → bộ bài giống hệt.
Sau đó mỗi lần lật chỉ cần gửi chỉ số ô.

### Thông tin ẩn (hidden information)

Các game như Battleship, Submarine Hunt, Gỡ Bom dùng `ctx.mySeat` để **chỉ render phần của
mình**. Bí mật (vị trí tàu, đáp án) **không bao giờ gửi qua mạng** cho tới khi cần lộ — chỉ
gửi hành động công khai (bắn tọa độ, cắt dây). Xem `submarinehunt.js`, `defusebomb.js`,
`hangman.js` làm mẫu.

### Luồng message WebSocket

| Message (client→server) | Ý nghĩa | Server phản hồi |
|---|---|---|
| `create {gameId, options, public, playerName}` | Tạo phòng | `created {code, seat:0, token, seed, firstSeat,...}` |
| `join {code, playerName}` | Vào phòng | `joined` cho người vào + `start` cho cả hai |
| `move {move}` | Gửi nước đi | relay `move {move}` cho đối thủ |
| `restart` | Bỏ phiếu chơi lại | `restart_pending`; khi đủ 2 phiếu → `restart {seed mới, round+1, đảo firstSeat}` |
| `chat {text}` | Nhắn (≤200 ký tự) | relay `chat` cho đối thủ |
| `react {emoji}` | Gửi emote | relay `react` cho đối thủ |
| `listRooms` | Xin danh sách phòng công khai | `roomList {rooms[]}` |
| `leave` | Rời phòng | đối thủ nhận `opponent_left` |
| `rejoin {code, seat, token}` | Kết nối lại sau rớt mạng | `rejoined {..., history[]}` hoặc `rejoin_failed` |

### Reconnect (kết nối lại)

- Server cấp `token` phiên cho mỗi ghế khi vào phòng.
- Khi một máy rớt (`close`), server **giữ phòng 45 giây** (`RECONNECT_GRACE_MS`) và báo
  đối thủ `opponent_disconnected`.
- Máy rớt gọi `rejoin {code, seat, token}` → nếu token khớp và còn trong thời gian ân hạn,
  server trả lại trạng thái + **toàn bộ lịch sử nước đi** (`history`) để client phát lại và
  dựng lại ván. Đối thủ nhận `opponent_reconnected`.
- `net.js` phía client tự thử kết nối lại tối đa 6 lần với backoff tăng dần.

### "Chơi lại" cần đồng thuận

`restart` là **bỏ phiếu**: chỉ khi cả hai cùng bấm, server mới tạo `seed` mới, tăng `round`,
**đảo người đi trước** rồi phát `restart` cho cả hai. Tránh việc một người tự ý reset ván.

---

## 6. Bảo mật & giới hạn (server.js)

Dù game-agnostic, server vẫn có các lớp phòng vệ:

- **Chống path traversal** khi phục vụ file tĩnh (chuẩn hóa path, chặn `..`).
- **Giới hạn kích thước**: message ≤ 12KB, options ≤ 2.5KB, move ≤ 4KB.
- **Rate-limit theo loại hành động** (tạo/vào phòng, move, chat, react, restart, listRooms)
  bằng cửa sổ trượt per-connection.
- **Làm sạch dữ liệu**: tên người chơi (bỏ ký tự điều khiển, ≤24 ký tự), mã phòng (đúng 4 chữ
  số), gameId (regex an toàn).
- **Heartbeat**: ping mỗi 15s, ngắt kết nối client không phản hồi (chống kết nối "treo").
- **Tài khoản**: mật khẩu băm bằng `scrypt` + salt; token phiên ngẫu nhiên chỉ lưu dạng hash.
  Đăng ký/đăng nhập có rate-limit riêng theo IP.
- **Persistence**: `accounts.js` lưu tài khoản, state và ELO trong SQLite với WAL + transaction.
  `DATA_DIR` phải nằm trên persistent disk khi deploy. File `accounts.json` cũ được migration
  tự động một lần và giữ lại dưới tên `accounts.json.migrated.bak`.

> ⚠️ Tài khoản không thay thế mật khẩu phòng: ai có mã phòng vẫn có thể thử tham gia.
> Khi mở public, nên đặt mật khẩu phòng và cấu hình `ALLOWED_ORIGINS` đúng domain.

---

## 7. i18n (song ngữ Việt/Anh)

Hai tầng dịch:

1. **Khung giao diện** — `js/i18n.js`: `I18n.DICT.vi` / `I18n.DICT.en` theo khóa; DOM dùng
   thuộc tính `data-i18n` / `data-i18n-ph` / `data-i18n-title`.
2. **Nội dung game**:
   - Tên/mô tả/hướng dẫn: `js/games-i18n.js` (`GAMES_EN[id] = {name, description, howTo}`).
     Tiếng Việt nằm ngay trong `register()` của mỗi game.
   - **Trạng thái khi chơi**: trong code game dùng `ctx.t(vi, en)` cho mọi chuỗi hiển thị.

**Lá chắn tự động** (chạy trong `npm test`):
- `tests/integrity.test.js`: mọi khóa `data-i18n` trong HTML phải có ở cả vi & en; mọi game
  phải có đủ `name/description/howTo` và khai báo `emoji`.
- `tests/i18n-runtime.test.js`: nạp từng game ở **chế độ EN**, render rồi quét output — báo
  lỗi nếu còn sót chữ Việt (tức là quên `ctx.t`).
- `tests/i18n-source-guard.test.js`: quét chuỗi tiếng Việt hardcode.

---

## 7b. Giao diện & theme (Cozy Warm)

Toàn bộ màu sắc đi qua **biến CSS** khai báo ở `:root` trong `styles.css`
(`--bg`, `--panel`, `--panel-2`, `--text`, `--muted`, `--p1`, `--p2`, `--accent`,
`--line`...). Component hầu như không hardcode màu mà đọc các biến này, nên đổi
cả theme chỉ cần đổi bộ biến gốc.

**Hai chế độ (nút 🌙):**

- **Mặc định — gỗ espresso tối, chữ kem sáng.** Đây là chế độ nền tảng: `:root`
  đặt `--text` sáng nên **mọi bàn cờ của 76 game** (vốn thiết kế cho nền tối) hiển
  thị đúng ngay.
- **Giấy sáng** — bật khi `<body>` có class `.theme-light` (lưu ở `localStorage`
  khóa `tpg_theme`). Block `body.theme-light { ... }` ghi đè bộ biến sang tông giấy
  ngà + chữ nâu đậm cho phần **khung** (header, thẻ game, sidebar, panel).

**Điểm mấu chốt — khu chơi game luôn tối:** `#gameView` ghi đè cục bộ `--text`,
`--muted`, `--panel`, `--panel-2`, `--line` về tông gỗ tối, **bất kể** đang ở chế độ
nào. Nhờ đó bàn cờ + HUD luôn là "chữ sáng trên gỗ tối" và không bao giờ rơi vào
cảnh "chữ sáng trên nền sáng" khi người dùng bật chế độ giấy. Khi thêm/sửa game,
cứ dùng các biến CSS (`var(--text)`, `var(--panel)`...) thay vì màu cứng để tự
hưởng cơ chế này.

**Bộ chọn tông (nút 🎨):** đặt `data-preset` lên `<body>`; mỗi
`body[data-preset="..."]` (ocean/sunset/forest/rose/mono) chỉ đổi lại vài biến nền +
`--accent`. Lựa chọn lưu ở `localStorage` khóa `tpg_accent`.

**Typography:** tiêu đề dùng serif **Fraunces** (`--font-head`), thân dùng
**Nunito Sans** (`--font-body`).

---

## 8. Kiểm thử

| Lệnh | Nội dung |
|---|---|
| `npm run smoke` | Khởi động server thật, kiểm HTTP phục vụ trang + WebSocket tạo/vào phòng |
| `npm run test:unit` | `node:test` headless: logic game, thống kê, i18n, replay, integrity, coverage |
| `npm run test:online` | Integration qua **WebSocket thật**: reconnect, phòng công khai, chat, đồng bộ nước đi |
| `npm test` | Chạy tất cả phần trên |

**Cơ chế test headless:** `tests/helpers.js` cung cấp mock DOM tối thiểu + `makeCtx()` để
gọi `create(ctx)` ngoài trình duyệt. Nhờ vậy mỗi game được kiểm "dựng được + API hợp lệ +
AI không ném lỗi" trong `games-coverage.test.js` mà không cần browser.

**`tests/online-sync-it.js`** mô phỏng 2 client cho từng game online, gửi một nước đặc trưng
và xác minh đối thủ nhận đúng payload — bảo chứng relay không làm biến dạng nước đi.

---

## 9. PWA & service worker (sw.js)

- **Network-first** cho mã nguồn app (`.js/.css/.html/.webmanifest`): luôn lấy bản mới khi có
  mạng, chỉ fallback cache khi offline → tránh kẹt bản cũ.
- **Cache-first** cho tài nguyên tĩnh khác (ảnh, icon) cho nhanh.
- Tên cache có version (`tpg-vNN`); **mỗi lần đổi file tĩnh cần bump số này** để client lấy bản
  mới và dọn cache cũ ở sự kiện `activate`.

---

## 10. Công thức thêm một game mới

1. Tạo `js/games/<id>.js`:
   ```js
   (function () {
     function create(ctx) {
       // render vào ctx.boardEl, đọc ctx.options, dùng ctx.rng cho ngẫu nhiên
       function applyMove(move, fromRemote) {
         if (!isLegal(move)) return;
         if (!fromRemote) ctx.sendMove(move); // ghi để xem lại + relay nếu online
         // ... áp dụng + render + ctx.setStatus / ctx.incScore
       }
       return { applyMove /*, aiMove, undo, destroy */ };
     }
     window.GameRegistry.register({
       id: "<id>", name: "Tên VI", emoji: "🎲",
       description: "Mô tả ngắn VI",
       onlineReady: true, supportsAI: false,
       options: [/* tùy chọn ván */],
       howTo: ["bước 1", "bước 2", "bước 3"],
       create,
     });
   })();
   ```
2. Thêm `<script defer src="js/games/<id>.js"></script>` vào `index.html` (trước `main.js`).
3. Thêm `id` vào đúng nhóm trong `GAME_GROUPS` (`main.js`).
4. Thêm bản dịch EN vào `js/games-i18n.js` (`name/description/howTo`).
5. Trong code game, bọc **mọi chuỗi hiển thị** bằng `ctx.t(vi, en)`.
6. Nếu online: thêm một case vào `tests/online-sync-it.js`. Cập nhật số game trong
   `tests/i18n.test.js` và `tests/i18n-runtime.test.js`.
7. Bump cache `sw.js` và chạy `npm test`.

### Checklist tất định cho game online
- Mọi ngẫu nhiên dùng `ctx.rng`, **không** dùng `Math.random()` cho thứ cần đồng bộ.
- `applyMove` validate trước, relay khi `!fromRemote && ctx.isOnline`.
- Thông tin bí mật chỉ render theo `ctx.mySeat`, không gửi qua `sendMove`.
- Chuyển màn/đổi lượt phải suy ra được từ chuỗi nước đi (deterministic), không phụ thuộc
  thời điểm cục bộ.

---

## 11. Sơ đồ luồng một nước đi online

```
Người chơi A bấm nước
        │
        ▼
applyMove(move, false)  ──(validate ok)──▶ ctx.sendMove(move)
        │                                          │
        ▼                                          ▼ Net.send("move")
  áp dụng + render                          server: relay
                                                   │
                                                   ▼ "move" {move}
                                   B: net.js emit("move") → main.js
                                                   │
                                                   ▼
                                   instance.applyMove(move, true)
                                                   │
                                                   ▼
                                          áp dụng + render (không relay lại)
```

---

*Tài liệu này mô tả trạng thái kiến trúc tại thời điểm viết. Khi thay đổi giao thức hoặc
quy ước `ctx`, hãy cập nhật cả file này.*
