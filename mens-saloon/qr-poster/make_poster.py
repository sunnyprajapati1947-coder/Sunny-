"""Generate QR code + printable shop-board poster for Men's Saloon.

Run:  pip install qrcode pillow  &&  python3 mens-saloon/qr-poster/make_poster.py
Outputs (next to this file + site image):
  shop-board-qr.png      plain high-res QR for any print shop / flex board
  shop-board-poster.png  ready-to-print A4 poster (maroon + gold)
  ../public/images/qr-website.png  QR shown on the website itself
"""
import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

SITE = "https://menssaloon-nawada.vercel.app"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_QR = os.path.join(HERE, "shop-board-qr.png")
OUT_POSTER = os.path.join(HERE, "shop-board-poster.png")
OUT_SITE = os.path.join(HERE, "..", "public", "images", "qr-website.png")

MAROON = (26, 5, 5)
MAROON2 = (61, 10, 10)
GOLD = (201, 162, 75)
GOLD_L = (232, 200, 119)
CREAM = (245, 237, 225)
MUTED = (201, 184, 166)
RED = (224, 35, 28)
WHITE = (255, 255, 255)

def make_qr(size_px: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2,
                       box_size=20)
    qr.add_data(SITE)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    return img.resize((size_px, size_px), Image.NEAREST)

def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    paths = [f"/usr/share/fonts/truetype/dejavu/{name}",
             os.path.expanduser(f"~/.fonts/{name}")]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def centered(d, y, text, f, fill, W):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)
    return f.size


def fit_font(d, text, name, size, max_w):
    """Shrink font until text fits max_w pixels."""
    while size > 20:
        f = font(name, size)
        if d.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(name, size)

def centered_fit(d, y, text, name, size, fill, W, margin=140):
    f = fit_font(d, text, name, size, W - margin)
    return centered(d, y, text, f, fill, W)

def main():
    qr_big = make_qr(1400)
    qr_big.save(OUT_QR)
    make_qr(700).save(OUT_SITE)

    W, H = 1748, 2480  # A4 @ ~150dpi
    poster = Image.new("RGB", (W, H), MAROON)
    d = ImageDraw.Draw(poster)
    # gold frame + header band
    d.rectangle([36, 36, W - 36, H - 36], outline=GOLD, width=6)
    d.rectangle([0, 0, W, 520], fill=MAROON2)
    d.line([0, 520, W, 520], fill=GOLD, width=8)

    centered(d, 90, "MEN'S  SALOON", font("DejaVuSerif-Bold.ttf", 150), GOLD_L, W)
    centered(d, 275, "Premium Haircut  |  Beard  |  Styling  |  Grooming",
             font("DejaVuSans.ttf", 54), CREAM, W)
    centered(d, 360, "Sudama Nagar, Nawada     +91 90313 68918",
             font("DejaVuSans-Bold.ttf", 58), MUTED, W)
    centered(d, 445, "Open Daily  7:00 AM – 8:30 PM", font("DejaVuSans.ttf", 46), GOLD_L, W)

    # QR card
    card = 980
    cx, cy = (W - card) // 2, 620
    d.rounded_rectangle([cx - 28, cy - 28, cx + card + 28, cy + card + 28],
                        radius=36, fill=WHITE)
    poster.paste(make_qr(card), (cx, cy))

    y = cy + card + 110
    centered(d, y, "SCAN  KARKE  BOOKING  KARO", font("DejaVuSans-Bold.ttf", 84), GOLD_L, W); y += 120
    centered_fit(d, y, "Scan to open our website — price dekho, WhatsApp par chair book karo",
             "DejaVuSans.ttf", 47, MUTED, W); y += 150

    # price strip
    d.rounded_rectangle([120, y, W - 120, y + 210], radius=28, outline=GOLD, width=5)
    centered_fit(d, y + 28, "HAIRCUT  Rs. 50    |    HAIRCUT + SHAVING  Rs. 100",
             "DejaVuSans-Bold.ttf", 62, CREAM, W, margin=320)
    centered_fit(d, y + 118, "Facial Rs. 499 se shuru  ·  Beard Setting Rs. 50  ·  Skin Fade Rs. 100",
             "DejaVuSans.ttf", 48, MUTED, W, margin=320)
    y += 300
    centered(d, y, "Barber: Nitish Jatav  (10 saal ka experience)", font("DejaVuSans-Bold.ttf", 56), GOLD_L, W); y += 100
    centered(d, y, "menssaloon-nawada.vercel.app", font("DejaVuSansMono-Bold.ttf", 52), RED, W)

    poster.save(OUT_POSTER)
    print("saved:", OUT_QR, OUT_POSTER, os.path.normpath(OUT_SITE), sep="\n  ")

if __name__ == "__main__":
    main()
