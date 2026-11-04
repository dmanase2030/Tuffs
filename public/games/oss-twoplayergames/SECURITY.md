# Chính sách bảo mật / Security Policy

## Phạm vi / Scope

Đây là bộ trò chơi 2 người chạy phía client (HTML/CSS/JS) kèm một server Node
tùy chọn làm WebSocket relay cho chế độ online. Server **không có xác thực** —
ai có mã phòng đều vào được — nên chỉ nên chạy cục bộ hoặc trong mạng tin cậy.

This is a client-side (HTML/CSS/JS) two-player game suite with an optional Node
WebSocket relay server for online play. The server has **no authentication** —
anyone with a room code can join — so only run it locally or on a trusted network.

## Báo lỗi bảo mật / Reporting a vulnerability

Nếu phát hiện lỗ hổng, vui lòng mở một issue riêng tư (GitHub Security Advisory)
hoặc liên hệ chủ repo. Đừng công khai chi tiết khai thác trước khi có bản vá.

If you find a vulnerability, please open a private report (GitHub Security
Advisory) or contact the repository owner. Do not publicly disclose exploit
details before a fix is available.

## Phiên bản được hỗ trợ / Supported versions

Chỉ nhánh `main` mới nhất được hỗ trợ. Only the latest `main` branch is supported.
