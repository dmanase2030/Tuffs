"""Tạo og-image.png (1200x630) cho preview chia sẻ mạng xã hội.
Chạy: python scripts/make-og.py
Cần Pillow. Dùng font hệ thống (Arial trên Windows, DejaVu nếu có)."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), "..", "og-image.png")


def load_font(size, bold=False):
    candidates = [
        ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
         else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def soft_glow(img, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 28
    for i in range(steps, 0, -1):
        rr = int(r * i / steps)
        a = int(alpha * (1 - i / steps))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    img.alpha_composite(layer)


def center_text(d, y, text, font, fill):
    bbox = d.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    d.text(((W - w) / 2, y), text, font=font, fill=fill)


def pill(d, cx, y, text, font, color):
    bbox = d.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    pad = 28
    w = tw + pad * 2
    x0 = cx - w / 2
    d.rounded_rectangle([x0, y, x0 + w, y + 58], radius=29,
                        fill=color + (40,), outline=color + (140,), width=2)
    d.text((x0 + pad, y + 14), text, font=font, fill=color)


def main():
    top, bot = (44, 35, 24), (33, 26, 18)
    base = Image.new("RGB", (W, H))
    px = base.load()
    for yy in range(H):
        c = lerp(top, bot, yy / H)
        for xx in range(W):
            px[xx, yy] = c
    img = base.convert("RGBA")

    soft_glow(img, 150, 40, 460, (224, 138, 92), 82)
    soft_glow(img, 1060, 70, 460, (110, 197, 188), 78)
    soft_glow(img, 600, 660, 520, (230, 180, 85), 62)

    d = ImageDraw.Draw(img)
    center_text(d, 150, "Game 2 Người", load_font(110, True), (230, 180, 85))
    center_text(d, 300, "76 trò chơi 2 người · Two-Player Games",
                load_font(40, True), (243, 234, 219))
    center_text(d, 372, "Chơi chung máy · Đấu AI · Online",
                load_font(30), (195, 177, 153))

    pill_font = load_font(26, True)
    pill(d, 410, 470, "Cờ", pill_font, (230, 180, 85))
    pill(d, 600, 470, "Hành động", pill_font, (110, 197, 188))
    pill(d, 800, 470, "Suy luận", pill_font, (224, 138, 92))

    img.convert("RGB").save(os.path.normpath(OUT), "PNG")
    print("Da tao", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
