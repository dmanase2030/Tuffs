# 🤝 Đóng góp cho Game 2 Người

Cảm ơn bạn đã quan tâm! Tài liệu này tóm tắt cách đóng góp. Phần kiến trúc chi tiết
nằm ở [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Bắt đầu

```bash
git clone https://github.com/tridpt/TwoPlayerGames.git
cd TwoPlayerGames
npm install
npm start        # http://localhost:8777
npm test         # chạy toàn bộ test trước khi gửi PR
```

Yêu cầu: Node.js 18 trở lên.

## Quy trình gửi thay đổi

1. Fork repo và tạo nhánh mới: `git checkout -b feat/ten-tinh-nang`.
2. Thực hiện thay đổi, giữ phong cách code hiện có (xem các file lân cận).
3. Chạy `npm test` — **mọi test phải pass** (171 unit + 4 bộ integration online).
4. Commit với thông điệp rõ ràng (xem quy ước bên dưới).
5. Mở Pull Request vào nhánh `main`, mô tả thay đổi và cách đã kiểm thử.

## Quy ước commit

Dùng tiền tố ngắn gọn cho dễ đọc lịch sử:

- `feat:` thêm tính năng / game mới
- `fix:` sửa lỗi
- `polish:` cải thiện giao diện / trải nghiệm
- `docs:` tài liệu
- `test:` thêm/sửa test
- `chore:` / `ci:` việc lặt vặt, hạ tầng

Ví dụ: `feat: them game Co Vua Mini 5x5`.

## Thêm một game mới (tóm tắt)

Chi tiết đầy đủ + checklist ở [mục 10 của ARCHITECTURE.md](docs/ARCHITECTURE.md#10-công-thức-thêm-một-game-mới).

1. Tạo `js/games/<id>.js`, gọi `window.GameRegistry.register({...})` với hàm
   `create(ctx)` trả về `{ applyMove, aiMove?, undo?, destroy? }`.
2. Thêm `<script defer src="js/games/<id>.js"></script>` vào `index.html` (trước `main.js`).
3. Thêm `id` vào đúng nhóm trong `GAME_GROUPS` (`js/main.js`).
4. Thêm bản dịch EN vào `js/games-i18n.js` (`name` / `description` / `howTo`).
5. Bọc **mọi chuỗi hiển thị** bằng `ctx.t(vi, en)` để giữ song ngữ.
6. Nếu hỗ trợ online: thêm một case vào `tests/online-sync-it.js`, và cập nhật số game
   trong `tests/i18n.test.js` + `tests/i18n-runtime.test.js`.
7. Bump số cache trong `sw.js` và chạy `npm test`.

### Checklist tất định cho game online

- Dùng `ctx.rng` cho **mọi** yếu tố ngẫu nhiên cần đồng bộ (không dùng `Math.random()`).
- `applyMove` validate trước; chỉ relay khi `!fromRemote && ctx.isOnline`.
- Thông tin bí mật chỉ render theo `ctx.mySeat`, không gửi qua `sendMove`.
- Đổi lượt / chuyển màn phải suy ra được từ chuỗi nước đi (deterministic).

## Báo lỗi & đề xuất

Mở [issue](https://github.com/tridpt/TwoPlayerGames/issues) theo mẫu có sẵn. Nêu rõ
các bước tái hiện, trình duyệt/thiết bị, và ảnh chụp nếu có.

## Giấy phép

Khi đóng góp, bạn đồng ý rằng phần đóng góp được phát hành theo giấy phép **MIT** của dự án.
