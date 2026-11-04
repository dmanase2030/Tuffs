# 🚀 Hướng dẫn deploy để chơi online với bạn bè

Game cần một server chạy **Node.js + WebSocket**, nên **không thể** dùng GitHub Pages
(chỉ phục vụ file tĩnh). Dưới đây là 2 cách: deploy lên web thật (Render), hoặc chia sẻ
nhanh từ máy bạn (ngrok).

---

## ✅ Cách 1: Render.com (khuyến nghị — miễn phí, có link cố định)

Repo đã có sẵn file `render.yaml` nên Render tự nhận cấu hình.

1. Vào https://render.com và đăng nhập bằng tài khoản **GitHub**.
2. Bấm **New +** → **Blueprint**.
3. Chọn repo **tridpt/TwoPlayerGames**. Render sẽ đọc `render.yaml` và hiện service
   `two-player-games`.
4. Bấm **Apply** / **Create**. Render tự chạy `npm install` rồi `npm start`.
5. Chờ vài phút, khi trạng thái chuyển sang **Live**, bạn sẽ có một link dạng:
   ```
   https://two-player-games-xxxx.onrender.com
   ```
6. Gửi link đó cho bạn bè. Một người **Tạo phòng** → gửi mã 4 số → người kia **Vào phòng**.

> **Lưu ý gói free của Render:** server sẽ "ngủ" sau một thời gian không có ai truy cập.
> Lần mở đầu tiên sau khi ngủ sẽ hơi lâu. Filesystem của gói free không phải nơi lưu dữ liệu
> bền vững, vì vậy tài khoản/ELO có thể mất sau restart hoặc redeploy.
>
> Muốn giữ tài khoản lâu dài, gắn **Persistent Disk** vào `/var/data` và đặt biến môi trường
> `DATA_DIR=/var/data` (tính năng này có thể yêu cầu gói trả phí). Server lưu dữ liệu trong
> `accounts.sqlite`; hãy sao lưu file này định kỳ.

### Nếu không muốn dùng Blueprint
Có thể tạo thủ công: **New +** → **Web Service** → chọn repo →
- Build Command: `npm install`
- Start Command: `npm start`
- Instance Type: **Free**

---

## ⚡ Cách 2: ngrok (chơi ngay, không cần deploy)

Phù hợp khi muốn chơi liền mà không đăng ký host. Server vẫn chạy trên máy bạn,
ngrok tạo một đường hầm công khai tới nó.

1. Cài ngrok: tải tại https://ngrok.com/download (hoặc `winget install ngrok.ngrok`).
2. Đăng ký tài khoản ngrok (free) và lấy authtoken, chạy 1 lần:
   ```
   ngrok config add-authtoken <TOKEN_CỦA_BẠN>
   ```
3. Chạy server game ở máy bạn:
   ```
   npm start
   ```
4. Mở một cửa sổ terminal khác, chạy:
   ```
   ngrok http 8777
   ```
5. ngrok in ra một link dạng `https://xxxx.ngrok-free.app`. Gửi link đó cho bạn bè.

> ngrok đã hỗ trợ WebSocket sẵn nên game chạy bình thường. Tắt terminal là link mất.

---

## 🌐 Cách 3: Chơi trong cùng mạng LAN (không cần Internet)

Nếu hai người chung một mạng Wi-Fi:
1. Máy chủ chạy `npm start`.
2. Tìm IP nội bộ của máy chủ (Windows: chạy `ipconfig`, tìm dòng *IPv4 Address*, ví dụ `192.168.1.10`).
3. Người kia mở trình duyệt vào `http://192.168.1.10:8777`.

---

## ⚠️ Về bảo mật

Server có tài khoản cho đồng bộ hồ sơ/ELO, nhưng phòng thường vẫn được truy cập bằng mã phòng.
Khi deploy public, hãy đặt `ALLOWED_ORIGINS` đúng domain, dùng mật khẩu cho phòng riêng và đặt
`DATA_DIR` trên persistent disk. Khi chơi qua ngrok xong, hãy tắt tunnel nếu không còn dùng.
