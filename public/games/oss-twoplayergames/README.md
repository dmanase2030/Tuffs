# 🎮 Game 2 Người

[![CI](https://github.com/tridpt/TwoPlayerGames/actions/workflows/ci.yml/badge.svg)](https://github.com/tridpt/TwoPlayerGames/actions/workflows/ci.yml)
[![Chơi ngay](https://img.shields.io/badge/▶_Ch%C6%A1i_ngay-Live_demo-22c55e)](https://two-player-games-rnu3.onrender.com/)

🎮 **Chơi thử ngay:** https://two-player-games-rnu3.onrender.com/ (chơi chung máy / đấu AI / online qua mã phòng)

> Lưu ý: bản online chạy trên gói miễn phí của Render nên có thể "ngủ" sau ~15 phút không ai truy cập — lần mở đầu chờ 30–60 giây để khởi động.


Bộ trò chơi đối kháng cho 2 người chơi, hỗ trợ **chơi chung một máy** (hot-seat) hoặc **chơi online qua mạng** bằng mã phòng. Viết bằng HTML/CSS/JavaScript thuần ở phía client, server Node.js nhỏ gọn lo phần phục vụ web và relay nước đi qua WebSocket.

## 📸 Ảnh chụp màn hình

| Menu chọn game | Đang chơi (Cờ Lật) |
|:---:|:---:|
| ![Menu chọn game](docs/screenshots/menu.png) | ![Đang chơi Cờ Lật](docs/screenshots/gameplay.png) |
| **Co-op: Đẩy Thùng Đôi** | |
| ![Đẩy Thùng Đôi co-op](docs/screenshots/boxpush.png) | |

## ✨ Tính năng

- **76 trò chơi** trong cùng một ứng dụng
- **3 chế độ chơi**: chung máy (hot-seat), **đấu với máy (AI)** hoặc online (2 máy khác nhau)
- **AI 3 mức độ** (Dễ / Vừa / Khó) cho nhiều game cờ và game khác; gợi ý nước đi cho Minesweeper, Hangman, Nối Từ
- **Hoàn tác (undo)** khi chơi chung máy ở nhiều game cờ
- **Phòng online bằng mã 4 chữ số** + **danh sách phòng công khai** để vào chơi một chạm
- **Tìm trận nhanh (matchmaking)**: chọn game rồi bấm tìm — server tự ghép hai người đang chờ cùng game vào một phòng ranked
- **Tự kết nối lại** khi rớt mạng (giữ phòng 45 giây + phát lại nước đi) và **xem lại ván (replay)** online
- **Khung chat** trong phòng online kèm các câu nhắn nhanh
- **Trang Hồ sơ**: đổi tên + 24 avatar, thống kê, **12+ thành tích**, **bảng xếp hạng** game, **lịch sử ván đấu** (có nút **▶ Xem lại** để phát lại trọn ván đã lưu) + biểu đồ hoạt động 14 ngày
- **Tài khoản & đồng bộ đám mây**: đăng ký/đăng nhập (mật khẩu băm `scrypt`) để lưu hồ sơ, thống kê, thành tích và đồng bộ giữa nhiều thiết bị (kiểu "mới nhất thắng")
- **Bảng xếp hạng online theo ELO**: mỗi ván online giữa hai người đã đăng nhập được chấm ELO (theo từng game + tổng); bảng xếp hạng toàn cục lọc theo game. Server chỉ tính khi **hai máy báo cáo kết quả khớp nhau** (chống gian lận cơ bản)
- **Thử thách hằng ngày** (daily challenge) với chuỗi ngày liên tiếp
- **Giao diện "cozy" tông gỗ ấm / giấy ngà** (warm wood & paper): mặc định nền gỗ espresso chữ kem sáng, nút 🌙 chuyển sang chế độ giấy sáng; khu vực chơi luôn giữ tông gỗ tối để bàn cờ dễ đọc. Font serif Fraunces + Nunito Sans.
- **6 tông màu** đổi nhanh qua nút 🎨 và **nhạc nền + chỉnh âm lượng** (tự tắt khi rời tab)
- **PWA**: cài như ứng dụng, chạy offline (service worker)
- **Song ngữ Việt / Anh** (nút 🌐) — dịch **toàn bộ**: khung giao diện, tên + mô tả + hướng dẫn của 76 game, và **trạng thái khi đang chơi** (thông báo lượt, nhãn HUD, nút trong game). Có test tự động chống sót chữ Việt.
- **Chia sẻ** kết quả / mã phòng qua Web Share API (fallback copy)
- **Xuất / Nhập / Xóa** dữ liệu cá nhân (JSON) trong trang Hồ sơ
- **Accessibility**: điều hướng bàn phím (mũi tên trong lưới game), bẫy focus trong modal, ARIA, tôn trọng `prefers-reduced-motion`
- **Hướng dẫn lần đầu (tour)** có thể xem lại bất cứ lúc nào
- **Tùy chỉnh ván chơi** cho nhiều game — đồng bộ giữa 2 máy khi chơi online
- Giao diện responsive kiểu sidebar thể loại, tìm kiếm, lọc & sắp xếp; chơi được trên điện thoại

## 🕹️ Danh sách game

| Game | Chế độ | Mô tả |
|------|--------|-------|
| Cờ Caro 3x3 | Chung máy, online | Xếp 3 ký hiệu thẳng hàng (ngang, dọc, chéo) để chiến thắng. |
| Xếp 4 (Connect Four) | Chung máy, online | Thả quân xuống cột, ai nối được 4 quân thẳng hàng trước sẽ thắng. |
| Cờ Lật (Reversi) | Chung máy, online | Kẹp quân đối thủ để lật thành quân mình. Ai nhiều quân hơn khi hết bàn sẽ thắng. |
| Lật Hình Tìm Cặp | Chung máy, online | Lật tìm các cặp hình giống nhau. Ai tìm được nhiều cặp hơn sẽ thắng. |
| Cờ Caro 15×15 | Chung máy, online | Cờ caro cỡ lớn: nối được 5 quân liên tiếp (ngang, dọc, chéo) là thắng. |
| Nối Ô (Dots & Boxes) | Chung máy, online | Nối các cạnh giữa chấm. Hoàn thành một ô vuông thì chiếm ô đó và được đi tiếp. |
| Bốc Sỏi (Nim) | Chung máy, online | Cờ trí tuệ kinh điển: bốc sỏi từ các hàng, ai bốc viên cuối cùng sẽ thắng. |
| Hex | Chung máy, online | Cờ kết nối trên lưới lục giác. Tạo một đường quân nối hai cạnh đối diện của mình. |
| Mancala (Ô Ăn Quan) | Chung máy, online | Gieo sỏi vòng quanh các hốc, bắt sỏi đối thủ. Ai gom nhiều sỏi về kho hơn sẽ thắng. |
| Order & Chaos | Chung máy, online | Biến thể caro độc đáo: cả hai cùng đặt X/O, nhưng hai người có mục tiêu trái ngược nhau. |
| Cờ Đam (Checkers) | Chung máy, online | Cờ ăn quân nhảy chéo kinh điển. Bắt hết quân đối thủ hoặc chặn không cho đi sẽ thắng. |
| Cờ Cô Lập | Chung máy, online | Di chuyển quân rồi khóa ô vừa rời. Ai làm đối thủ hết đường đi trước sẽ thắng. |
| Laser Chess | Chung máy, online | Xoay gương để phản xạ tia laser. Bắn trúng lõi đối thủ là thắng. |
| Mê Cung Ghép Đường | Chung máy, online | Đặt tile đường, xoay tile và khóa ô để nối tuyến của mình trước khi đối thủ phá. |
| Thợ Săn & Bầy Đàn | Chung máy, online | Cờ chiến thuật bất đối xứng: 2 thợ săn mạnh đối đầu 12 quân bầy yếu biết bảo vệ nhau và khóa đường. |
| Pong | Chỉ chung máy | Game phản xạ thời gian thực: điều khiển vợt đỡ bóng. Ai đạt 5 điểm trước sẽ thắng. |
| Pool Battle | Chung máy, online | Bi-a đối kháng mini: chọc bi theo lượt, ăn điểm qua hố và dùng bóng nổ, nam châm, đổi trọng lực. |
| Slingshot Battle | Chung máy, online | Kéo thả để bắn đá hoặc phép qua chướng ngại, tính gió, bật tường và nổ gây sát thương. |
| Time Loop Duel | Chung máy, online | Lập trình chuỗi hành động, replay đồng thời và dùng bóng ma các vòng trước để phá lõi đối thủ. |
| Thủ Thành Hợp Tác | Chung máy, online | Hai người cùng thủ đường: chọn nhiều map, mua nhiều loại súng, chặn nhiều loại quái và vẫn xây được khi wave đang chạy. |
| Base Defense Duel | Chung máy, online | Vừa thủ nhà bằng tháp, vừa gửi nhiều loại lính sang phá nhà đối thủ. Vàng và sức lính tăng dần theo thời gian. |
| Robot Factory War | Chung máy, online | Hai bên xây dây chuyền, ghép module đầu-thân-vũ khí-chân để robot tự động ra lane đánh nhau. |
| Dungeon Rival | Chung máy, online | Hai người đi dungeon riêng, nhặt đồ, lên cấp và dùng bóng tối gửi quái hoặc bẫy sang phá đối thủ. |
| Bắn Tàu (Battleship) | Chỉ online | Giấu hạm đội và bắn tọa độ vào bàn đối thủ. Ai bắn chìm hết tàu địch trước sẽ thắng. |
| Sea Battle Nâng Cấp | Chỉ online | Battleship online có radar 3x3, mìn ẩn, torpedo và các tàu đặc biệt như tàu ngầm, trinh sát, thiết giáp. |
| Submarine Hunt | Chỉ online | Một bên lái tàu ngầm ẩn, bên kia săn bằng sonar, drone dò âm và mìn sâu. |
| Hidden Assassin | Chỉ online | Suy luận sát thủ trong đám đông với theo dõi, hồ sơ, mồi nhử, cải trang, bẫy và tố cáo rủi ro. |
| Trap Mansion | Chỉ online | Hai người dò đường trong biệt thự ẩn phòng, tự thấy bẫy của mình nhưng không thấy bẫy đối thủ. |
| Pentago | Chung máy, online | Đặt bi rồi xoay một góc bàn 90°. Tạo 5 bi thẳng hàng để thắng — xoay khéo để vừa công vừa thủ. |
| Cờ Ba Quân (Morris) | Chung máy, online | Đặt 3 quân rồi di chuyển chúng để xếp thành hàng. Cờ caro phiên bản có di chuyển. |
| Bắn Tăng (Artillery) | Chung máy, online | Chỉnh góc và lực bắn, tính cả sức gió, để nã trúng xe tăng đối thủ. Theo lượt, chơi cả online. |
| Tank Arena Theo Lượt | Chung máy, online | Đấu xe tăng trên map lưới có tường, thùng vật phẩm, mìn, rocket và điểm hành động theo lượt. |
| Dice Battle | Chung máy, online | Điều khiển đội quân xúc xắc trên lưới. Di chuyển, chiếm ô năng lượng và đánh nhau bằng roll. |
| Territory War | Chung máy, online | Mở rộng lãnh thổ, xây tường phòng thủ và tấn công vùng đối thủ trên bản đồ chiến thuật. |
| Crystal Conquest | Chung máy, online | Điều khiển pháp sư chiếm tinh thể để tạo mana, rồi cast sét, khiên, dịch chuyển và đóng băng. |
| Dò Mìn Đối Kháng | Chung máy, online | Chung một bãi mìn, thay nhau lật ô. Trúng mìn được ghi điểm và đi tiếp. Ai nhiều mìn hơn thắng. |
| Đoán Số (Bulls & Cows) | Chung máy, online | Đặt dãy số bí mật, thay nhau đoán dãy của đối thủ. Ai đoán đúng trước sẽ thắng. |
| Cờ Quân Úp (Stratego) | Chung máy, online | Stratego gọn: bàn 10x10 rộng, mỗi bên 2 hàng quân úp, bắt Cờ đối thủ để thắng. |
| Quoridor (Đặt Tường) | Chung máy, online | Đua quân sang bờ đối diện, đặt tường chặn đường đối thủ. Cờ chiến thuật chiều sâu lớn. |
| Auction War | Chung máy, online | Đấu giá kín tài sản, bluff giá, quản lý tiền và ăn bonus bộ sưu tập. Trả quá tay là mua hớ. |
| Pig (Heo Cờ Xúc Xắc) | Chung máy, online | Gieo xúc xắc cộng dồn điểm, nhưng ra 1 là chuyển hết điểm tạm cho đối thủ. Biết dừng đúng lúc để thắng. |
| Yahtzee | Chung máy, online | Gieo 5 xúc xắc, ghi điểm theo 13 tổ hợp (cù lũ, sảnh, Yahtzee...). Ai tổng điểm cao hơn thắng. |
| Domino (Đô-mi-nô) | Chung máy, online | Nối các quân domino khớp số chấm ở hai đầu. Hết quân trước sẽ thắng. |
| Nối Từ | Chung máy, online | Nối từ ghép 2 tiếng theo tiếng cuối của từ trước. Hết giờ hoặc bí thì thua. |
| Đoán Chữ (Hangman) | Chung máy, online | Một người ra từ bí mật, người kia đoán từng chữ cái. Sai quá 6 lần là thua. |
| Trộm Kho Báu | Chung máy, online | Giấu kho báu trên lưới, đào tìm kho báu đối thủ theo gợi ý nóng/lạnh. Ai tìm thấy trước thì thắng. |

## 🚀 Cách chạy

Yêu cầu: [Node.js](https://nodejs.org/) 20 trở lên.

```bash
# 1. Cài thư viện
npm install

# 2. Chạy server
npm start

# 3. Mở trình duyệt
# http://localhost:8777
```

### Kiểm tra nhanh

```bash
npm test
```

Lệnh này kiểm tra cú pháp JS, đối chiếu `index.html` với các file trong `js/games/`,
load registry đủ game, kiểm tra nhóm game trong menu, chạy smoke test HTTP +
WebSocket tạo/vào phòng, **quét chữ Việt còn sót khi ở chế độ tiếng Anh** cho cả 76 game,
và chạy test tích hợp **kết nối lại (reconnect)** + **phòng công khai** + **chat**.

### Chơi online cùng mạng LAN

Người chơi thứ hai mở `http://<IP-máy-chủ>:8777` (ví dụ `http://192.168.1.10:8777`),
một người **Tạo phòng** rồi gửi mã 4 chữ số, người kia **Vào phòng** bằng mã đó.

> Muốn chơi qua Internet (khác mạng) thì cần expose server ra ngoài, ví dụ bằng [ngrok](https://ngrok.com/).

## 🌐 Đưa lên mạng (deploy)

Có **hai mức** tùy nhu cầu:

### 1. Tĩnh — GitHub Pages / Netlify / bất kỳ host tĩnh
Toàn bộ giao diện và logic game nằm ở phía client, nên có thể host tĩnh ngay từ gốc repo
(đã có sẵn `.nojekyll` để GitHub Pages phục vụ file nguyên trạng).

- GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**.
  Site chạy ở `https://<user>.github.io/<repo>/`.
- ✅ **Chơi chung máy (hot-seat)** và **đấu với máy (AI)** hoạt động đầy đủ.
- ❌ **Chơi online qua mã phòng KHÔNG hoạt động** trên host tĩnh, vì cần `server.js`
  (Node + WebSocket) để relay nước đi. Host tĩnh chỉ phục vụ file, không chạy được server.

### 2. Đầy đủ (có online) — host chạy Node
Để online qua Internet, deploy `server.js` lên nơi chạy được Node, ví dụ
[Render](https://render.com/), [Railway](https://railway.app/), [Fly.io](https://fly.io/) hoặc VPS:

- Lệnh start: `npm start` (server tự đọc `PORT` từ biến môi trường — `const PORT = process.env.PORT || 8777`).
- Mở HTTPS để WebSocket dùng `wss://` (client tự chọn `ws`/`wss` theo giao thức trang).
- Nhớ thêm lớp bảo vệ (rate-limit đã có sẵn; cân nhắc giới hạn truy cập) trước khi mở công khai lâu dài.

> Tóm lại: cần **online** thì dùng host Node (mục 2). Chỉ cần **chơi chung máy / đấu AI** thì GitHub Pages là đủ và miễn phí.

## 📁 Cấu trúc dự án

```
TwoPlayerGames/
├── index.html          # Trang chính + menu + sảnh online + khung chat
├── styles.css          # Toàn bộ giao diện
├── server.js           # Server Node: phục vụ web + WebSocket relay
├── sw.js               # Service worker (PWA, chạy offline)
├── manifest.webmanifest
├── package.json
├── scripts/
│   └── smoke-test.js   # Kiểm tra nhanh cú pháp, registry, HTTP và WebSocket
├── tests/              # Unit test (node:test): logic game + thống kê
└── js/
    ├── registry.js     # Registry game + RNG có hạt giống (nạp đầu tiên)
    ├── i18n.js         # Đổi ngôn ngữ Việt/Anh cho khung giao diện
    ├── stats-util.js   # Hàm logic thuần cho thống kê (dùng chung browser + test)
    ├── games-i18n.js   # Tên + mô tả tiếng Anh của 76 game
    ├── sound.js        # Âm thanh + nhạc nền
    ├── net.js          # Client WebSocket cho chế độ online
    ├── main.js         # Khung điều khiển: menu, chế độ, vòng chơi, chat, hồ sơ
    └── games/          # Mỗi file là một game tự đăng ký vào registry
        ├── tictactoe.js
        ├── connectfour.js
        ├── ...
        └── treasure.js
```

## 📚 Tài liệu kỹ thuật

Muốn hiểu sâu kiến trúc bên trong (luồng dữ liệu, giao thức online, cách game tự đăng ký,
đồng bộ tất định, kiểm thử)? Xem [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## ➕ Thêm game mới

Tạo một file trong `js/games/`, gọi `window.GameRegistry.register({...})` với một
hàm `create(ctx)` trả về `{ applyMove }`, rồi thêm một thẻ `<script>` vào `index.html`.
Không cần sửa code cũ. (Xem hướng dẫn đầy đủ + checklist tất định trong
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-công-thức-thêm-một-game-mới).)

## 📡 Giao thức online (tóm tắt)

Client ↔ server trao đổi message JSON qua WebSocket: `create`, `join`, `start`,
`move`, `restart`, `chat`, `react`, `leave`, `listRooms` (danh sách phòng công khai),
`rejoin` (kết nối lại sau khi rớt mạng). Khi tạo phòng có thể kèm `password` (tùy chọn) để
tạo **phòng riêng tư**; `join` phải gửi đúng mật khẩu mới vào được. Các game được thiết kế
tất định (dùng RNG có hạt giống chung) nên hai máy luôn đồng bộ trạng thái.

Khi tạo/vào phòng, client có thể kèm `auth` (token tài khoản). Nếu **cả hai** người chơi đều
đăng nhập thì phòng là **ván xếp hạng** (`ranked`): kết thúc ván, mỗi bên gửi `reportResult`;
server chỉ tính **ELO** khi hai báo cáo **khớp nhau** (chống gian lận cơ bản) rồi gửi lại
`rated` kèm điểm mới. Đồng bộ hồ sơ + bảng xếp hạng dùng HTTP API riêng (`/api/register`,
`/api/login`, `/api/logout`, `/api/state`, `/api/leaderboard`, `/api/rating`).

**Tìm trận nhanh (matchmaking):** client gửi `queue` (kèm `gameId` + `auth`) để vào hàng chờ;
server ghép hai người đang chờ **cùng game** vào một phòng ranked mới rồi gửi `matched` + `start`.
Gửi `unqueue` để hủy tìm. Hàng chờ tự dọn khi người chơi rời hoặc rớt mạng.

## ⚠️ Lưu ý

Mặc định phòng chỉ bảo vệ bằng mã 4 chữ số — ai có mã đều vào được. Khi tạo phòng, bạn có thể
**đặt mật khẩu** để chỉ người biết mật khẩu mới vào (phòng công khai có khóa sẽ hiện icon 🔒).
Dù vậy, đừng mở công khai ra Internet lâu dài mà chưa cân nhắc thêm lớp bảo vệ.

### 🔒 Lớp bảo vệ sẵn có & biến môi trường

Server đã có sẵn một số lớp chống lạm dụng cơ bản, điều chỉnh qua biến môi trường:

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `ALLOWED_ORIGINS` | *(rỗng)* | Danh sách origin được phép kết nối WebSocket, ngăn cách bằng dấu phẩy (vd `https://a.com,https://b.com`). Cùng host và localhost luôn được phép. Chống Cross-Site WebSocket Hijacking. |
| `MAX_CONNECTIONS` | `500` | Tổng số kết nối WebSocket đồng thời. |
| `MAX_CONNECTIONS_PER_IP` | `20` | Số kết nối tối đa từ một IP (chống lách rate-limit bằng nhiều socket). |
| `MAX_ROOMS` | `2000` | Tổng số phòng tồn tại cùng lúc (chống cạn bộ nhớ). |
| `DATA_DIR` | `./data` | Thư mục lưu `accounts.sqlite`. Khi deploy phải trỏ tới persistent disk/volume để không mất tài khoản sau restart hoặc redeploy. |
| `SESSION_TTL_DAYS` | `30` | Số ngày token đăng nhập còn hiệu lực (giới hạn 1–365 ngày). |

Dữ liệu tài khoản dùng SQLite (WAL + transaction). Nếu còn `data/accounts.json` từ bản cũ,
server tự import một lần rồi đổi tên file cũ thành `accounts.json.migrated.bak`.

Ngoài ra: token kết nối lại sinh bằng `crypto` (khó đoán), mã phòng dùng RNG bảo mật,
giới hạn kích thước frame WebSocket (`maxPayload`), và static server gửi kèm các header
`Content-Security-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

> Khi deploy public qua HTTPS, **nên** đặt `ALLOWED_ORIGINS` về đúng domain của bạn.

## 📄 Giấy phép

MIT
