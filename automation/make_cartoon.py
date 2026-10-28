#!/usr/bin/env python3
"""Render a kids cartoon short — "Golu aur Rangon ka Jadu" — fully offline.

Procedural 2D animation with Pillow: characters (Golu the elephant + Bunny),
parallax meadow, smiling sun, rain + rainbow, dance party, particles — piped
into ffmpeg (libx264) with a synthesized cheerful kids BGM.

Usage:
    python3 automation/make_cartoon.py            # full render
    python3 automation/make_cartoon.py --preview 4 14 24 38 50 60
"""

from __future__ import annotations

import argparse
import math
import random
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
W, H = 1920, 1080
FPS = 30
FADE = 0.7

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# scene durations (seconds)
DURS = [9, 12, 12, 14, 13, 9]

ELEPH = (157, 180, 214)
ELEPH_DK = (104, 126, 162)
ELEPH_BELLY = (205, 220, 240)
ELEPH_EAR = (140, 163, 201)
BLUSH = (246, 170, 180)
WHITE = (248, 248, 252)
BUNNY_OUT = (168, 172, 190)
PINK = (244, 168, 190)
NOSTRIL = (40, 44, 60)

RAINBOW_COLS = [(235, 70, 90), (250, 145, 50), (250, 220, 70), (80, 200, 110),
                (70, 145, 240), (110, 100, 225), (175, 95, 210)]

font_cache: dict = {}


def F(path: str, size: int) -> ImageFont.FreeTypeFont:
    k = (path, size)
    if k not in font_cache:
        font_cache[k] = ImageFont.truetype(path, size)
    return font_cache[k]


# ------------------------------------------------------------ background

BG_CACHE: dict = {}


def sky_gradient(c_top, c_bot) -> np.ndarray:
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None, None]
    x = np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :, None]
    t = np.clip(y * 0.88 + x * 0.12, 0, 1)
    return np.array(c_top, np.float32) * (1 - t) + np.array(c_bot, np.float32) * t


def hill_poly(base_y, amp, freq, phase, color, d: ImageDraw.ImageDraw):
    pts = [(x, base_y + amp * math.sin(x * freq + phase)
            + amp * 0.45 * math.sin(x * freq * 2.3 + phase * 1.7))
           for x in range(-40, W + 41, 40)]
    d.polygon(pts + [(W + 40, H + 40), (-40, H + 40)], fill=color)


def flower_sprite(petal, core) -> Image.Image:
    s = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    for a in range(0, 360, 72):
        r = math.radians(a)
        cx, cy = 32 + 15 * math.cos(r), 32 + 15 * math.sin(r)
        d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=petal + (255,))
    d.ellipse([23, 23, 41, 41], fill=core + (255,))
    return s


def tuft_sprite(color) -> Image.Image:
    s = Image.new("RGBA", (46, 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    for i, (dx, hgt) in enumerate([(4, 34), (14, 40), (24, 36), (34, 30)]):
        d.polygon([(dx, 40), (dx + 7, 40), (dx + 4 + (i - 1.5) * 3, 40 - hgt)],
                  fill=color + (255,))
    return s


def make_bg(kind: str) -> Image.Image:
    if kind in BG_CACHE:
        return BG_CACHE[kind]
    palettes = {
        "morning": dict(sky=((120, 195, 255), (255, 236, 190)),
                        far=(126, 168, 148), mid=(86, 156, 110), near=(64, 158, 84),
                        grass=(74, 176, 92), tuft=(52, 140, 70)),
        "bright": dict(sky=((70, 165, 255), (185, 232, 255)),
                       far=(120, 175, 150), mid=(74, 165, 105), near=(54, 165, 82),
                       grass=(66, 182, 90), tuft=(46, 148, 72)),
        "rain": dict(sky=((96, 112, 148), (168, 182, 205)),
                     far=(104, 132, 128), mid=(72, 124, 96), near=(56, 128, 84),
                     grass=(64, 140, 88), tuft=(48, 116, 72)),
    }[kind]

    arr = sky_gradient(*palettes["sky"])
    img = Image.fromarray(arr.astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    # sun glow baked
    gx, gy = (1560, 300) if kind != "morning" else (1560, 620)
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gcol = (255, 236, 170) if kind != "rain" else (220, 225, 235)
    gd.ellipse([gx - 300, gy - 300, gx + 300, gy + 300], fill=gcol)
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    img = Image.fromarray(np.clip(np.asarray(img, np.float32)
                                  + np.asarray(glow, np.float32) * (0.55 if kind != "rain" else 0.25),
                                  0, 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    # hills with atmospheric depth
    hill_poly(700, 46, 0.0035, 1.2, palettes["far"] + (255,), d)
    hill_poly(760, 40, 0.0042, 4.0, palettes["mid"] + (255,), d)
    hill_poly(820, 34, 0.005, 0.6, palettes["near"] + (255,), d)
    # ground
    d.rectangle([0, 880, W, H], fill=palettes["grass"] + (255,))
    hill_poly(880, 10, 0.006, 2.2, palettes["grass"] + (255,), d)
    # texture
    rng = random.Random(11)
    for _ in range(1400):
        x, y = rng.randrange(0, W), rng.randrange(880, H)
        d.ellipse([x, y, x + 3, y + 3], fill=(0, 0, 0, 26))
    # depth shading band
    d.rectangle([0, 880, W, 940], fill=(0, 40, 10, 30))
    # tufts + flowers
    ts = tuft_sprite(palettes["tuft"])
    for _ in range(26):
        x = rng.randrange(-10, W)
        y = rng.randrange(885, H - 50)
        sc = 0.8 + 0.6 * (y - 880) / 200
        t2 = ts.resize((int(46 * sc), int(40 * sc)), Image.BILINEAR)
        img.paste(t2, (x, y), t2)
    petals = [(255, 120, 160), (255, 210, 90), (200, 130, 255), (255, 255, 255), (120, 210, 255)]
    for i in range(18):
        x = rng.randrange(40, W - 40)
        y = rng.randrange(905, H - 30)
        f = flower_sprite(petals[i % len(petals)], (255, 240, 140))
        sc = 0.7 + 0.7 * (y - 880) / 200
        f = f.resize((int(64 * sc), int(64 * sc)), Image.BILINEAR)
        img.paste(f, (x, y), f)
    # vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    vig = np.clip(1.0 - 0.30 * np.clip(r - 0.7, 0, None) ** 1.5, 0.75, 1.0)[..., None]
    img = Image.fromarray((np.asarray(img, np.float32) * vig).astype(np.uint8), "RGB")
    BG_CACHE[kind] = img
    return img


# ------------------------------------------------------------ sprites

def cloud_sprite(shade=0) -> Image.Image:
    s = Image.new("RGBA", (420, 210), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    col = (255, 255, 255, 235) if shade == 0 else (150, 160, 185, 235)
    for cx, cy, r in [(120, 130, 70), (210, 110, 85), (300, 135, 65), (170, 145, 60), (260, 150, 62)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    d.ellipse([60, 145, 360, 195], fill=col)
    return s


def sun_face() -> tuple[Image.Image, Image.Image]:
    """(disc with face, rays layer) — rays drawn per frame rotated."""
    disc = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(disc)
    for rr, a in [(150, 60), (132, 140), (118, 255)]:
        col = (255, 214, 90, a) if rr == 118 else (255, 226, 130, a)
        d.ellipse([150 - rr, 150 - rr, 150 + rr, 150 + rr],
                  fill=(255, 216, 80, 255) if rr == 118 else col)
    # face
    d.ellipse([104, 112, 130, 148], fill=(70, 50, 30, 255))   # eyes
    d.ellipse([170, 112, 196, 148], fill=(70, 50, 30, 255))
    d.ellipse([110, 118, 120, 130], fill=(255, 255, 255, 255))
    d.ellipse([176, 118, 186, 130], fill=(255, 255, 255, 255))
    d.arc([116, 140, 184, 205], 15, 165, fill=(70, 50, 30, 255), width=8)
    d.ellipse([84, 158, 112, 184], fill=(255, 150, 140, 150))  # blush
    d.ellipse([188, 158, 216, 184], fill=(255, 150, 140, 150))

    rays = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    for a in range(0, 360, 30):
        r = math.radians(a)
        x0, y0 = 280 + 150 * math.cos(r), 280 + 150 * math.sin(r)
        x1, y1 = 280 + 265 * math.cos(r), 280 + 265 * math.sin(r)
        rd.line([(x0, y0), (x1, y1)], fill=(255, 224, 120, 210), width=22)
        rd.ellipse([x1 - 11, y1 - 11, x1 + 11, y1 + 11], fill=(255, 224, 120, 210))
    return disc, rays


def shadow_sprite(w, h) -> Image.Image:
    s = Image.new("RGBA", (w + 40, h + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.ellipse([20, 10, 20 + w, 10 + h], fill=(20, 50, 25, 110))
    return s.filter(ImageFilter.GaussianBlur(12))


def sparkle_sprite() -> Image.Image:
    s = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.polygon([(40, 4), (48, 32), (76, 40), (48, 48), (40, 76), (32, 48), (4, 40), (32, 32)],
              fill=(255, 250, 210, 255))
    d.polygon([(40, 16), (45, 35), (64, 40), (45, 45), (40, 64), (35, 45), (16, 40), (35, 35)],
              fill=(255, 255, 255, 255))
    return s


def note_sprite() -> Image.Image:
    s = Image.new("RGBA", (70, 90), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.ellipse([8, 55, 36, 82], fill=(60, 60, 90, 255))
    d.line([(34, 60), (34, 10)], fill=(60, 60, 90, 255), width=7)
    d.line([(34, 12), (58, 22), (58, 40)], fill=(60, 60, 90, 255), width=7)
    return s


def cloud_pos(kind, i, t, rain=False):
    speed = 26 if not rain else 40
    x = (i * 620 + t * speed) % (W + 520) - 260
    y = [110, 240, 70, 330][i % 4] + 14 * math.sin(t * 0.5 + i * 2)
    return int(x), int(y)


# ------------------------------------------------------------ characters

def draw_elephant(t: float, *, walk=0.0, trunk=0.0, flap=None, blink=0.0,
                  squash=1.0, wave=0.0, flip=False) -> Image.Image:
    """Golu, right-facing, feet at bottom-center of canvas. Returns RGBA."""
    cw, ch = 660, 640
    s = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    ox, feet = cw // 2, ch - 40
    out = ELEPH_DK + (255,)

    # walk cycle
    ph = walk * 2 * math.pi
    legs = [(-118, math.sin(ph)), (-70, math.sin(ph + math.pi)),
            (44, math.sin(ph + math.pi)), (92, math.sin(ph))]
    # far legs
    for lx, sw in legs[:2]:
        lift = max(0.0, -sw) * 26
        d.rounded_rectangle([ox + lx - 26, feet - 130 - lift, ox + lx + 26, feet - lift],
                            radius=26, fill=(134, 155, 192, 255), outline=out, width=4)
    # tail
    d.line([(ox - 152, feet - 300), (ox - 190, feet - 250 + 10 * math.sin(t * 6)),
            (ox - 186, feet - 205)], fill=out, width=9)
    d.ellipse([ox - 198, feet - 218, ox - 172, feet - 192], fill=(104, 126, 162, 255))

    # body
    d.ellipse([ox - 158, feet - 385, ox + 158, feet - 108],
              fill=ELEPH + (255,), outline=out, width=5)
    # belly
    d.ellipse([ox - 108, feet - 240, ox + 118, feet - 122],
              fill=ELEPH_BELLY + (255,))
    # near legs
    for lx, sw in legs[2:]:
        lift = max(0.0, -sw) * 26
        d.rounded_rectangle([ox + lx - 28, feet - 134 - lift, ox + lx + 28, feet + 4 - lift],
                            radius=26, fill=ELEPH + (255,), outline=out, width=4)
        # toenails
        for tx in (-14, 0, 14):
            d.ellipse([ox + lx + tx - 6, feet - 26 - lift, ox + lx + tx + 6, feet - 12 - lift],
                      fill=(240, 244, 250, 255))

    # head
    hx, hy, hr = ox + 178, feet - 452, 118
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=ELEPH + (255,),
              outline=out, width=5)
    # ear (rotates)
    ear = Image.new("RGBA", (170, 190), (0, 0, 0, 0))
    ed = ImageDraw.Draw(ear)
    ang = 14 * math.sin(t * (2.2 if flap is None else 2.2) + (flap or 0)) if flap is None else flap
    ed.ellipse([10, 10, 160, 180], fill=ELEPH_EAR + (255,), outline=out, width=5)
    ed.ellipse([38, 40, 132, 152], fill=PINK + (200,))
    ear = ear.rotate(ang, resample=Image.BICUBIC, expand=True)
    s.alpha_composite(ear, (hx - 168, hy - 110))

    # trunk — hangs down from the face, curls into a J (wave lifts it up)
    px, py = hx + 54, hy + 84
    base = 0.10 * math.sin(t * 2.4)
    curl_total = 2.0 + 1.1 * wave
    pts = []
    for i in range(15):
        u = i / 14
        ang = base * (0.3 + u) + curl_total * (u ** 2.1)
        step = 17 - 6 * u
        px += math.sin(ang) * step
        py += math.cos(ang) * step
        pts.append((px, py, 27 - 13 * u))
    for i, (px, py, r) in enumerate(pts):
        col = ELEPH if i % 2 == 0 else (150, 173, 208)
        d.ellipse([px - r, py - r, px + r, py + r], fill=col + (255,),
                  outline=out, width=3)
    # mouth (cheek smile, left of the trunk root)
    d.arc([hx - 6, hy + 30, hx + 50, hy + 84], 25, 150, fill=(110, 90, 110, 255), width=5)
    # tusk
    d.polygon([(hx + 40, hy + 100), (hx + 78, hy + 110), (hx + 48, hy + 140)],
              fill=(255, 252, 240, 255), outline=(210, 205, 190, 255))

    # eye
    if blink > 0.5:
        d.arc([hx + 8, hy - 46, hx + 58, hy - 6], 200, 340, fill=NOSTRIL + (255,), width=7)
    else:
        d.ellipse([hx + 12, hy - 46, hx + 56, hy - 2], fill=(255, 255, 255, 255),
                  outline=NOSTRIL + (255,), width=3)
        d.ellipse([hx + 30, hy - 36, hx + 50, hy - 12], fill=NOSTRIL + (255,))
        d.ellipse([hx + 36, hy - 32, hx + 44, hy - 22], fill=(255, 255, 255, 255))
    # brow
    d.arc([hx + 6, hy - 66, hx + 60, hy - 26], 200, 330, fill=ELEPH_DK + (255,), width=5)
    # blush (on the cheek, right of the ear)
    d.ellipse([hx + 4, hy + 16, hx + 36, hy + 44], fill=BLUSH + (170,))
    # hair tuft
    d.arc([hx - 30, hy - hr - 14, hx + 30, hy - hr + 30], 200, 340, fill=ELEPH_DK + (255,), width=8)

    if flip:
        s = ImageOps.mirror(s)
    if squash != 1.0:
        nw, nh = cw, max(8, int(ch * squash))
        s = s.resize((nw, nh), Image.BILINEAR)
    return s


def draw_bunny(t: float, *, hop=0.0, ear=0.0, blink=0.0, flip=True) -> Image.Image:
    """Bunny, default facing left (flip=True), feet at bottom-center."""
    cw, ch = 360, 460
    s = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    ox, feet = cw // 2, ch - 16
    out = BUNNY_OUT + (255,)
    body = (250, 250, 253, 255)

    # far ear
    for i, ex in enumerate([(-16, ear * 1.4 + 12), (22, -ear + 6)]):
        e = Image.new("RGBA", (90, 220), (0, 0, 0, 0))
        ed = ImageDraw.Draw(e)
        ed.ellipse([18, 10, 72, 210], fill=body if i == 0 else (238, 238, 246, 255),
                   outline=out, width=4)
        ed.ellipse([33, 40, 57, 180], fill=PINK + (200,))
        e = e.rotate(ex[1], resample=Image.BICUBIC, expand=True)
        s.alpha_composite(e, (ox + ex[0] - 40, feet - 430))

    # feet
    d.ellipse([ox - 88, feet - 46, ox - 18, feet + 6], fill=body, outline=out, width=4)
    d.ellipse([ox + 16, feet - 42, ox + 84, feet + 6], fill=body, outline=out, width=4)
    # tail
    d.ellipse([ox + 74, feet - 210, ox + 126, feet - 158], fill=body, outline=out, width=4)
    # body
    d.ellipse([ox - 96, feet - 270, ox + 104, feet - 40], fill=body, outline=out, width=5)
    # head
    hx, hy, hr = ox - 66, feet - 330, 78
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=body, outline=out, width=5)
    # eye (facing left)
    if blink > 0.5:
        d.arc([hx - 52, hy - 34, hx - 12, hy + 4], 200, 340, fill=NOSTRIL + (255,), width=6)
    else:
        d.ellipse([hx - 48, hy - 34, hx - 14, hy - 0], fill=(45, 48, 66, 255))
        d.ellipse([hx - 42, hy - 28, hx - 30, hy - 16], fill=(255, 255, 255, 255))
    # nose + mouth
    d.polygon([(hx - 74, hy + 12), (hx - 52, hy + 12), (hx - 62, hy + 30)],
              fill=(250, 140, 160, 255))
    d.line([(hx - 62, hy + 30), (hx - 62, hy + 42)], fill=out, width=4)
    d.arc([hx - 76, hy + 30, hx - 44, hy + 58], 20, 160, fill=out, width=4)
    # whiskers
    for dy in (-4, 8, 20):
        d.line([(hx - 78, hy + 16 + dy), (hx - 118, hy + 8 + dy * 1.6)],
               fill=(120, 124, 140, 255), width=3)
    # blush
    d.ellipse([hx - 34, hy + 20, hx - 6, hy + 44], fill=(255, 190, 200, 170))
    # paw
    d.ellipse([ox - 54, feet - 150, ox - 4, feet - 96], fill=(240, 240, 248, 255),
              outline=out, width=4)

    if not flip:
        s = ImageOps.mirror(s)
    return s


def butterfly(t: float, x: float, y: float, hue: tuple, phase: float = 0.0) -> Image.Image:
    s = Image.new("RGBA", (90, 70), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    flap = abs(math.sin(t * 10 + phase))
    w = 12 + 24 * flap
    d.ellipse([45 - w, 8, 45 - 4, 46], fill=hue + (255,), outline=(40, 40, 60, 255), width=3)
    d.ellipse([45 + 4, 8, 45 + w, 46], fill=hue + (255,), outline=(40, 40, 60, 255), width=3)
    d.ellipse([41, 14, 49, 54], fill=(50, 50, 70, 255))
    d.line([(45, 14), (36, 2)], fill=(50, 50, 70, 255), width=3)
    d.line([(45, 14), (54, 2)], fill=(50, 50, 70, 255), width=3)
    return s


# ------------------------------------------------------------ helpers

def paste_scaled(frame: Image.Image, spr: Image.Image, x: int, y: int,
                 scale: float = 1.0, alpha: float = 1.0, anchor: str = "topleft"):
    if scale != 1.0:
        spr = spr.resize((max(1, int(spr.width * scale)), max(1, int(spr.height * scale))),
                         Image.BILINEAR)
    if alpha < 1.0:
        spr = spr.copy()
        spr.putalpha(spr.getchannel("A").point(lambda p: int(p * alpha)))
    if anchor == "center":
        x -= spr.width // 2
        y -= spr.height // 2
    elif anchor == "bottom":
        x -= spr.width // 2   # horizontally centered, bottom-aligned (feet anchor)
        y -= spr.height
    frame.paste(spr, (int(x), int(y)), spr)


def text_stroke(img: Image.Image, xy, text, fnt, fill, stroke_fill, anchor="mm", width=7):
    d = ImageDraw.Draw(img)
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor,
           stroke_width=width, stroke_fill=stroke_fill)


def caption(img: Image.Image, t: float, appear: float, text: str, fnt,
            y: int, color=(255, 255, 255), out=(40, 30, 60)) -> None:
    """Fade-in caption with pop."""
    p = min(max((t - appear) / 0.5, 0.0), 1.0)
    if p <= 0:
        return
    ease = 1 - (1 - p) ** 3
    tmp = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
    text_stroke(tmp, (W // 2, 100), text, fnt, color + (int(255 * ease),),
                out + (int(255 * ease),), width=8)
    img.paste(tmp, (0, y - 100), tmp)


def speech_bubble(img: Image.Image, x: int, y: int, text: str, fnt, flip_tail=False):
    tmp = Image.new("RGBA", (760, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    f = F(FONT_B, 44)
    tw = d.textbbox((0, 0), text, font=f)[2]
    bw = tw + 70
    bx = 380 - bw // 2
    d.rounded_rectangle([bx, 40, bx + bw, 150], radius=55, fill=(255, 255, 255, 245),
                        outline=(70, 70, 100, 255), width=5)
    if flip_tail:
        d.polygon([(bx + bw - 130, 146), (bx + bw - 70, 146), (bx + bw - 96, 205)],
                  fill=(255, 255, 255, 245))
    else:
        d.polygon([(bx + 70, 146), (bx + 130, 146), (bx + 98, 205)],
                  fill=(255, 255, 255, 245))
    d.rounded_rectangle([bx, 40, bx + bw, 150], radius=55, outline=(70, 70, 100, 255), width=5)
    d.text((380, 96), text, font=f, fill=(50, 50, 80, 255), anchor="mm")
    img.paste(tmp, (x - 380, y - 120), tmp)


def rainbow(img: Image.Image, cx: int, cy: int, reveal: float, glow=True) -> None:
    """Arc rainbow; reveal 0..1 controls how many bands + arc extent."""
    if reveal <= 0:
        return
    d = ImageDraw.Draw(img, "RGBA")
    band = 30
    r_out = 470
    n = len(RAINBOW_COLS)
    shown = reveal * (n + 1.4)
    for i, col in enumerate(RAINBOW_COLS):
        if i >= shown:
            break
        frac = min(1.0, shown - i)
        r = r_out - i * band
        bbox = [cx - r, cy - r, cx + r, cy + r]
        a0, a1 = 180, 180 + 180 * frac
        if glow:
            d.arc(bbox, a0 - 1, a1 + 1, fill=col + (70,), width=band + 16)
            d.arc(bbox, a0, a1, fill=col + (150,), width=band + 6)
        d.arc(bbox, a0, a1, fill=col + (255,), width=band - 4)


def star(img: Image.Image, x, y, r, color, alpha=255):
    d = ImageDraw.Draw(img, "RGBA")
    pts = []
    for k in range(10):
        rr = r if k % 2 == 0 else r * 0.45
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d.polygon(pts, fill=color + (alpha,))


def bloom_flowers(img: Image.Image, t: float, rng: random.Random, petals, appear=0.0):
    for i in range(14):
        st = appear + i * 0.12
        p = min(max((t - st) / 0.5, 0), 1)
        if p <= 0:
            continue
        x = rng.randrange(120, W - 120)
        y = rng.randrange(930, H - 50)
        sc = (0.6 + 0.6 * (y - 880) / 200) * (0.4 + 0.6 * (1 - (1 - p) ** 3))
        f = flower_sprite(petals[i % len(petals)], (255, 240, 140))
        paste_scaled(img, f, x, y, sc, alpha=min(1, p * 1.5))


# ------------------------------------------------------------ scenes

SHADOW_E = shadow_sprite(360, 60)
SHADOW_B = shadow_sprite(200, 44)
SUN_DISC, SUN_RAYS = sun_face()
SPARK = sparkle_sprite()
NOTE = note_sprite()
CLOUD_W = cloud_sprite(0)
CLOUD_G = cloud_sprite(1)
PETALS = [(255, 120, 160), (255, 210, 90), (200, 130, 255), (255, 255, 255), (120, 210, 255)]

TITLE_F = F(FONT_B, 118)
TITLE2_F = F(FONT_B, 64)
CAP_F = F(FONT_B, 62)
BUB_F = F(FONT_B, 44)
BIG_F = F(FONT_B, 170)
SM_F = F(FONT_R, 52)


def paste_sun(img, t, x, y, rays=True, scale=1.0):
    if rays:
        rot = SUN_RAYS.rotate(-t * 8, resample=Image.BICUBIC, expand=True)
        paste_scaled(img, rot, x, y, scale, 0.9, "center")
    paste_scaled(img, SUN_DISC, x, y, scale, 1.0, "center")


def s1_title(t: float) -> Image.Image:
    img = make_bg("morning").copy()
    paste_sun(img, t, 1560, 250, rays=True, scale=0.95)
    for i in range(3):
        x, y = cloud_pos("morning", i, t)
        paste_scaled(img, CLOUD_W, x, y, [0.9, 0.7, 1.0][i], 0.92)
    rainbow(img, W // 2, 690, min(1.0, t / 3.5))
    # title plate
    pop = min(max((t - 0.4) / 0.7, 0), 1)
    ease = 1 - (1 - pop) ** 3
    tmp = Image.new("RGBA", (W, 460), (0, 0, 0, 0))
    text_stroke(tmp, (W // 2, 150), "Golu aur Rangon", TITLE_F,
                (255, 255, 255, int(255 * ease)), (90, 60, 40, int(255 * ease)), width=10)
    text_stroke(tmp, (W // 2, 300), "ka Jadu", TITLE_F,
                (255, 235, 120, int(255 * ease)), (90, 60, 40, int(255 * ease)), width=10)
    if t > 1.4:
        a = int(255 * min(1, (t - 1.4) / 0.5))
        text_stroke(tmp, (W // 2, 415), "Doston ke liye ek kahani",
                    TITLE2_F, (255, 255, 255, a), (60, 50, 80, a), width=7)
    img.paste(tmp, (0, 240), tmp)
    # characters pop up at the corners (feet on the ground, clear of the title)
    rise_g = max(0.0, min(1.0, (t - 2.0) / 1.0))
    ge = draw_elephant(t, trunk=0.4 * math.sin(t * 1.2), blink=(t % 4 > 3.8))
    feet_g = 1150 - (1150 - 1000) * (1 - (1 - rise_g) ** 3)
    paste_scaled(img, SHADOW_E, 180, feet_g + 6, 0.9, 0.8 * rise_g, "center")
    paste_scaled(img, ge, 180, feet_g, 0.8, anchor="bottom")
    rise_b = max(0.0, min(1.0, (t - 3.0) / 1.0))
    bn = draw_bunny(t, ear=8 * math.sin(t * 3), blink=(t % 3.2 > 3.05), flip=True)
    feet_b = 1140 - (1140 - 1000) * (1 - (1 - rise_b) ** 3)
    paste_scaled(img, SHADOW_B, 1660, feet_b + 8, 1.0, 0.75 * rise_b, "center")
    paste_scaled(img, bn, 1660, feet_b, 0.9, anchor="bottom")
    for i in range(6):
        ph = i * 1.13
        sx = 200 + i * 300 + 60 * math.sin(t * 0.8 + ph)
        sy = 300 + 120 * math.sin(t * 1.1 + ph * 2)
        a = 0.5 + 0.5 * math.sin(t * 3 + ph * 3)
        paste_scaled(img, SPARK, sx, sy, 0.6 + 0.3 * math.sin(ph), a, "center")
    caption(img, t, 5.2, "Presents...", CAP_F, H - 90, (255, 255, 255), (90, 60, 40))
    return img


def s2_morning(t: float) -> Image.Image:
    img = make_bg("morning").copy()
    sun_x, sun_y = 1560, 700 - min(1, t / 4.0) * 400
    paste_sun(img, t, sun_x, sun_y)
    for i in range(3):
        x, y = cloud_pos("morning", i, t)
        paste_scaled(img, CLOUD_W, x, y, [0.9, 0.7, 1.0][i], 0.92)
    # birds
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(4):
        bx = (W + 400 - (t * 90 + i * 430)) % (W + 500) - 50
        by = 170 + i * 55 + 30 * math.sin(t + i)
        f = abs(math.sin(t * 7 + i))
        d.arc([bx - 34, by - 20 + 10 * f, bx, by + 16], 200, 330, fill=(60, 70, 100, 255), width=6)
        d.arc([bx, by - 20 + 10 * f, bx + 34, by + 16], 210, 340, fill=(60, 70, 100, 255), width=6)

    # Golu walks in from left
    p = min(max((t - 1.2) / 9.0, 0), 1)
    ease = 1 - (1 - p) ** 2.2
    x = -300 + ease * 740
    bounce = abs(math.sin(t * math.pi * 1.6))
    squash = 1.0 - 0.05 * math.cos(t * math.pi * 3.2)
    feet_y = 968
    blink = 1.0 if (t % 3.7) > 3.55 else 0.0
    ge = draw_elephant(t, walk=(t * 1.6) % 1.0, trunk=0.5 * math.sin(t * 1.4),
                       blink=blink, squash=squash)
    alpha_sh = min(1, p * 3)
    paste_scaled(img, SHADOW_E, x, feet_y + 6, 1.0 - 0.1 * bounce, 0.95 * alpha_sh, "center")
    paste_scaled(img, ge, x, feet_y - 18 * bounce, 0.8, anchor="bottom")
    caption(img, t, 1.5, "Subah ho gayi — Good morning!", CAP_F, 120)
    caption(img, t, 6.0, "Golu haathi chala khet ki ore...", CAP_F, H - 100)
    return img


def s3_friends(t: float) -> Image.Image:
    img = make_bg("bright").copy()
    paste_sun(img, t, 1560, 300, scale=0.95)
    for i in range(3):
        x, y = cloud_pos("bright", i, t)
        paste_scaled(img, CLOUD_W, x, y, [0.8, 1.0, 0.65][i], 0.92)
    feet_y = 968
    # Golu stops at left-center
    x_g = 640
    bounce = abs(math.sin(t * math.pi * 1.2)) * (1.0 if t < 5.5 else 0.4)
    blink = 1.0 if (t % 4.1) > 3.95 else 0.0
    ge = draw_elephant(t, walk=(min(t, 5.5) * 1.4) % 1.0 if t < 5.5 else 0.0,
                       trunk=0.7 * math.sin(t * 1.6), blink=blink,
                       squash=1.0 - 0.04 * math.cos(t * 4))
    paste_scaled(img, SHADOW_E, x_g, feet_y + 6, 0.95, 0.9, "center")
    paste_scaled(img, ge, x_g, feet_y - 14 * bounce, 0.85, anchor="bottom")
    # Bunny hops in from right
    pb = min(max((t - 1.5) / 6.0, 0), 1)
    x_b = W + 200 - pb * (W + 200 - 1260)
    hop = abs(math.sin(t * math.pi * 1.8)) if pb < 1 else abs(math.sin(t * math.pi * 0.9)) * 0.5
    bn = draw_bunny(t, ear=10 * math.sin(t * 2.6), blink=(t % 3.4 > 3.28), flip=True)
    paste_scaled(img, SHADOW_B, x_b, feet_y + 8, 1.0 - 0.25 * hop, 0.85, "center")
    paste_scaled(img, bn, x_b, feet_y - 46 * hop, 0.95, anchor="bottom")
    # bubbles
    if t > 6.2:
        speech_bubble(img, x_g + 110, 470, "Namaste! Main Golu", BUB_F, flip_tail=True)
    if t > 8.4:
        speech_bubble(img, x_b + 100, 520, "Main Bunny!", BUB_F, flip_tail=False)
    caption(img, t, 1.0, "Khet ke paas do dost mile...", CAP_F, 110)
    return img


def s4_rainbow(t: float) -> Image.Image:
    # rain phase 0..6, clearing 6..7, rainbow 7..11, wonder stays
    rain_amt = 1.0 if t < 5.2 else max(0.0, 1.0 - (t - 5.2) / 1.6)
    kind = "rain" if t < 6.4 else "bright"
    img = make_bg(kind).copy()
    if kind == "rain":
        paste_sun(img, t, 1560, 260, rays=False, scale=0.8)
    else:
        paste_sun(img, t, 1560, 300, scale=0.95)
    # clouds: grey while raining
    for i in range(4):
        x, y = cloud_pos(kind, i, t, rain=True)
        cloud = CLOUD_G if (t < 6.6 and i < 3) else CLOUD_W
        paste_scaled(img, cloud, x, y - (80 if t < 6.6 else 0), [0.9, 0.75, 1.0, 0.8][i], 0.95)

    # rain drops
    if rain_amt > 0:
        d = ImageDraw.Draw(img, "RGBA")
        rng = random.Random(5)
        n = int(170 * rain_amt)
        for i in range(n):
            dx = rng.randint(0, W)
            speed = rng.randint(1600, 2300)
            off = rng.randint(0, H)
            y = (t * speed + off) % (H + 60) - 30
            x = (dx + y * 0.14) % W
            a = int(150 * rain_amt)
            d.line([(x, y), (x - 14, y + 42)], fill=(200, 225, 255, a), width=3)
            if y > 900:
                d.ellipse([x - 12, 946, x + 12, 956], fill=(210, 235, 255, a))

    feet_y = 968
    # rainbow reveal
    reveal = min(1.0, max(0.0, (t - 6.6) / 3.0))
    if reveal > 0:
        rainbow(img, W // 2, 905, reveal)
        if reveal >= 1.0:
            for i in range(7):
                ph = i * 0.9
                sx = 380 + i * 195
                sy = 340 + 60 * math.sin(t * 1.4 + ph)
                a = 0.4 + 0.6 * abs(math.sin(t * 2 + ph))
                paste_scaled(img, SPARK, sx, sy, 0.8, a, "center")
    # characters watching (facing center/up-ish)
    ge = draw_elephant(t, trunk=0.4 * math.sin(t), wave=0.9 if t > 7 else 0.0,
                       blink=(t % 4 > 3.85), flap=t)
    paste_scaled(img, SHADOW_E, 430, feet_y + 6, 0.9, 0.85, "center")
    paste_scaled(img, ge, 430, feet_y, 0.8, anchor="bottom")
    bn = draw_bunny(t, ear=14 * math.sin(t * 3), blink=(t % 3 > 2.9), flip=True)
    paste_scaled(img, SHADOW_B, 1470, feet_y + 8, 0.9, 0.8, "center")
    paste_scaled(img, bn, 1470, feet_y - abs(math.sin(t * 2.2)) * 26, 0.9, anchor="bottom")

    if t < 5.0:
        caption(img, t, 0.8, "Arey! Baarish aa gayi...", CAP_F, 110)
    elif t < 7.5:
        caption(img, t, 5.4, "Thodi der me dhoop nikli", CAP_F, 110)
    else:
        caption(img, t, 7.8, "Wow! Rangon ka Jadu!", CAP_F, 110,
                (255, 244, 160), (70, 40, 90))
    return img


def s5_dance(t: float) -> Image.Image:
    img = make_bg("bright").copy()
    paste_sun(img, t, 1560, 300, scale=0.95)
    rainbow(img, W // 2, 905, 1.0)
    for i in range(3):
        x, y = cloud_pos("bright", i, t)
        paste_scaled(img, CLOUD_W, x, y, [0.7, 0.9, 1.0][i], 0.9)
    feet_y = 968
    beat = t * 1.8  # ~108 bpm

    # dance bounce with squash-stretch
    b = abs(math.sin(beat * math.pi))
    ge = draw_elephant(t, walk=(t * 2.0) % 1.0, trunk=0.9 * math.sin(t * 3.4),
                       blink=(t % 3.6 > 3.45), squash=1.0 + 0.07 * math.sin(beat * 2 * math.pi),
                       wave=0.3 * math.sin(t * 4))
    xg = 620 + 30 * math.sin(t * 0.9)
    paste_scaled(img, SHADOW_E, xg, feet_y + 6, 1.0 - 0.12 * b, 0.85, "center")
    paste_scaled(img, ge, xg, feet_y - 26 * b, 0.85, anchor="bottom")

    bn = draw_bunny(t, ear=16 * math.sin(t * 4), blink=(t % 3.1 > 3.0), flip=True)
    xb = 1310 + 40 * math.sin(t * 1.15 + 2)
    hb = abs(math.sin(beat * math.pi + 1.2))
    paste_scaled(img, SHADOW_B, xb, feet_y + 8, 1.0 - 0.3 * hb, 0.8, "center")
    paste_scaled(img, bn, xb, feet_y - 60 * hb, 0.95, anchor="bottom")

    # flowers bloom in
    bloom_flowers(img, t, random.Random(3), PETALS, appear=1.0)

    # butterflies
    for i, (hue, ph) in enumerate([((255, 170, 90), 0), ((255, 130, 190), 2.1),
                                   ((140, 210, 255), 4.0)]):
        bx = W / 2 + 520 * math.sin(t * (0.5 + i * 0.13) + ph)
        by = 430 + 210 * math.sin(t * (0.8 + i * 0.1) + ph * 1.7)
        bf = butterfly(t, bx, by, hue, ph)
        img.paste(bf, (int(bx - 45), int(by - 35)), bf)

    # floating music notes
    for i in range(5):
        nx = 320 + i * 320 + 50 * math.sin(t * 1.3 + i * 2)
        ny = 700 - ((t * 90 + i * 170) % 420)
        a = max(0.0, 1.0 - (ny - 280) / 420)
        paste_scaled(img, NOTE, nx, ny, 1.1, a, "center")

    # sparkles
    for i in range(8):
        ph = i * 0.77
        sx = 160 + i * 230 + 40 * math.sin(t + ph)
        sy = 250 + 150 * math.sin(t * 1.2 + ph * 2.4)
        a = 0.35 + 0.65 * abs(math.sin(t * 2.6 + ph * 3))
        paste_scaled(img, SPARK, sx, sy, 0.7 + 0.25 * math.sin(ph), a, "center")

    caption(img, t, 1.2, "Sab milke naache!", CAP_F, 105, (255, 244, 160), (70, 40, 90))
    return img


def s6_end(t: float) -> Image.Image:
    img = make_bg("morning").copy()
    paste_sun(img, t, 1560, 560, scale=1.0)
    for i in range(3):
        x, y = cloud_pos("morning", i, t)
        paste_scaled(img, CLOUD_W, x, y, [0.8, 1.0, 0.7][i], 0.9)
    rainbow(img, W // 2, 905, 1.0)
    feet_y = 968
    # waving
    ge = draw_elephant(t, trunk=0.2, blink=(t % 3.8 > 3.65), wave=0.8 * math.sin(t * 5), flap=t)
    paste_scaled(img, SHADOW_E, 420, feet_y + 6, 0.85, 0.85, "center")
    paste_scaled(img, ge, 420, feet_y, 0.72, anchor="bottom")
    bn = draw_bunny(t, ear=18 * math.sin(t * 4.5), blink=(t % 3 > 2.9), flip=True)
    paste_scaled(img, SHADOW_B, 1500, feet_y + 8, 0.9, 0.8, "center")
    paste_scaled(img, bn, 1500, feet_y - abs(math.sin(t * 2)) * 18, 0.85, anchor="bottom")

    pop = min(max((t - 0.5) / 0.7, 0), 1)
    ease = 1 - (1 - pop) ** 3
    sc = 0.6 + 0.4 * ease
    tmp = Image.new("RGBA", (W, 400), (0, 0, 0, 0))
    text_stroke(tmp, (W // 2, 130), "The End", BIG_F,
                (255, 255, 255, int(255 * ease)), (90, 50, 110, int(255 * ease)), width=12)
    if t > 1.6:
        a = int(255 * min(1, (t - 1.6) / 0.5))
        text_stroke(tmp, (W // 2, 300), "Doosto se khelo, khush raho!", CAP_F,
                    (255, 240, 150, a), (80, 50, 90, a), width=8)
    tmp = tmp.resize((int(W * sc), int(400 * sc)), Image.BILINEAR)
    img.paste(tmp, ((W - tmp.width) // 2, 200), tmp)

    # twinkling stars
    for i in range(10):
        ph = i * 1.7
        sx = 120 + i * 190
        sy = 150 + 90 * math.sin(i * 2.1)
        a = int(150 + 105 * math.sin(t * 3 + ph))
        star(img, sx, sy, 16 + 6 * math.sin(t * 2 + ph), (255, 250, 200), max(0, a))
    return img


SCENES = [(DURS[0], s1_title), (DURS[1], s2_morning), (DURS[2], s3_friends),
          (DURS[3], s4_rainbow), (DURS[4], s5_dance), (DURS[5], s6_end)]

STARTS = []
_acc = 0.0
for i, (dur, _) in enumerate(SCENES):
    if i > 0:
        _acc += SCENES[i - 1][0] - FADE
    STARTS.append(_acc)
TOTAL = STARTS[-1] + SCENES[-1][0]


def scene_frame_at(t_global: float) -> Image.Image:
    idx = 0
    for i, st in enumerate(STARTS):
        if t_global >= st:
            idx = i
    dur, fn = SCENES[idx]
    lt = t_global - STARTS[idx]
    # crossfade with next?
    if idx < len(SCENES) - 1 and lt > dur - FADE:
        a = (lt - (dur - FADE)) / FADE
        fa = fn(lt)
        ndur, nfn = SCENES[idx + 1]
        fb = nfn(t_global - STARTS[idx + 1])
        return Image.blend(fa, fb, a)
    return fn(lt)


# ------------------------------------------------------------ music

def synth_kids_music(seconds: float, path: Path) -> None:
    sr = 44100
    n = int(seconds * sr)
    t = np.arange(n) / sr
    bpm = 108
    beat = 60.0 / bpm
    bar = beat * 4

    def midi(m):
        return 440.0 * 2 ** ((m - 69) / 12)

    def env(start, dur, a, r):
        e = np.zeros(n)
        i0, i1 = int(start * sr), min(int((start + dur) * sr), n)
        if i1 <= i0:
            return e
        seg = np.ones(i1 - i0)
        na, nr = min(int(a * sr), len(seg)), min(int(r * sr), len(seg))
        if na:
            seg[:na] = np.linspace(0, 1, na)
        if nr:
            seg[-nr:] = np.linspace(1, 0, nr) ** 1.6
        e[i0:i1] = seg
        return e

    # chord roots (MIDI): C G Am F
    roots = [36, 43, 45, 41]
    triads = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]]  # close voicings
    melody = [  # (bar_offset_in_4, beat, midi) — cute 4-bar motif
        (0, 0, 76), (0, 1, 79), (0, 2, 84), (0, 3, 79),
        (1, 0, 74), (1, 1, 79), (1, 2, 83), (1, 3, 79),
        (2, 0, 72), (2, 1, 76), (2, 2, 81), (2, 3, 76),
        (3, 0, 77), (3, 1, 81), (3, 2, 84), (3, 3, 81),
    ]

    mix = np.zeros(n)

    # marimba melody
    mel = np.zeros(n)
    total_bars = int(seconds / bar) + 2
    for b in range(total_bars):
        for (mb, bt, m) in melody:
            if mb != b % 4:
                continue
            st = b * bar + bt * beat
            if st >= seconds:
                continue
            f = midi(m + (12 if b >= total_bars // 2 and b % 8 >= 4 else 0))
            e = env(st, beat * 0.9, 0.004, beat * 0.75)
            mel += e * (np.sin(2 * np.pi * f * t)
                        + 0.5 * np.sin(2 * np.pi * f * 4 * t)
                        + 0.18 * np.sin(2 * np.pi * f * 9 * t))
    mix += mel * 0.16

    # glockenspiel sparkle on off-beats (every other bar)
    gl = np.zeros(n)
    for b in range(0, total_bars, 2):
        for bt, m in [(2.5, 88), (3.5, 91)]:
            st = b * bar + bt * beat
            if st >= seconds:
                continue
            e = env(st, beat * 0.6, 0.003, beat * 0.55)
            gl += e * (np.sin(2 * np.pi * midi(m) * t)
                       + 0.4 * np.sin(2 * np.pi * midi(m) * 2.76 * t))
    mix += gl * 0.07

    # bass
    bs = np.zeros(n)
    for b in range(total_bars):
        root = roots[b % 4]
        for bt in (0, 2):
            st = b * bar + bt * beat
            if st >= seconds:
                continue
            e = env(st, beat * 1.6, 0.01, beat * 1.1)
            bs += e * (np.sin(2 * np.pi * midi(root) * t)
                       + 0.3 * np.sin(2 * np.pi * midi(root) * 2 * t))
    mix += bs * 0.22

    # chord pads (soft)
    pad = np.zeros(n)
    for b in range(total_bars):
        st = b * bar
        if st >= seconds:
            continue
        e = env(st, bar, 0.25, 0.4)
        for m in triads[b % 4]:
            pad += e * np.sin(2 * np.pi * midi(m) * t)
    mix += pad * 0.035

    # kick beats 1,3
    kick = np.zeros(n)
    b = 0.0
    while b < seconds - 0.2:
        e = env(b, 0.14, 0.003, 0.1)
        idx = np.maximum(t - b, 0)
        kick += e * np.where((t >= b) & (t < b + 0.14),
                             np.sin(2 * np.pi * (90 - 320 * idx) * idx), 0)
        b += beat * 2
    mix += kick * 0.30

    # clap on 2,4
    rng = np.random.default_rng(21)
    noise = rng.standard_normal(n)
    hp = np.diff(np.concatenate([[0.0], noise]))
    hp = np.diff(np.concatenate([[0.0], hp]))  # rougher
    clap = np.zeros(n)
    b = beat
    while b < seconds - 0.1:
        clap += env(b, 0.09, 0.003, 0.07) * hp
        b += beat * 2
    mix += clap * 0.10

    # shaker 8ths
    sh = np.zeros(n)
    b = 0.0
    k = 0
    while b < seconds - 0.05:
        if k % 2 == 1:
            sh += env(b, 0.04, 0.002, 0.03) * hp
        b += beat / 2
        k += 1
    mix += sh * 0.045

    # ending flourish: rising arpeggio in last 1.5s
    end0 = seconds - 1.6
    for i, m in enumerate([72, 76, 79, 84, 88, 91]):
        st = end0 + i * 0.14
        if st < seconds:
            e = env(st, 1.4 if i == 5 else 0.5, 0.004, 0.9)
            mix += e * np.sin(2 * np.pi * midi(m) * t) * 0.14

    fin, fout = int(0.8 * sr), int(1.8 * sr)
    mix[:fin] *= np.linspace(0, 1, fin)
    mix[-fout:] *= np.linspace(1, 0, fout)
    peak = float(np.max(np.abs(mix))) or 1.0
    mix = mix / peak * 0.75

    # stereo: melody slight right, bass center, clap slight left
    left = mix * 0.98
    right = np.concatenate([np.zeros(int(0.008 * sr)), mix[:-int(0.008 * sr)]]) * 0.95 + mix * 0.05
    stereo = np.stack([left, right], axis=1)
    pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


# ------------------------------------------------------------ main

def render(out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bgm = out_path.with_suffix(".wav")
    n_frames = int(round(TOTAL * FPS))
    print(f"total {TOTAL:.1f}s, {n_frames} frames", flush=True)
    print("synthesizing music...", flush=True)
    synth_kids_music(TOTAL, bgm)

    ff = ["ffmpeg", "-y", "-loglevel", "error",
          "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
          "-i", str(bgm),
          "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
          str(out_path)]
    proc = subprocess.Popen(ff, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    print("encoding...", flush=True)
    try:
        for fi in range(n_frames):
            frame = scene_frame_at(fi / FPS)
            proc.stdin.write(frame.tobytes())
            if fi % 300 == 0:
                print(f"  frame {fi}/{n_frames}", flush=True)
        proc.stdin.close()
    except BrokenPipeError:
        pass
    err = proc.stderr.read().decode(errors="replace")
    rc = proc.wait()
    if rc != 0:
        raise SystemExit(f"ffmpeg failed ({rc}):\n{err[-2000:]}")
    bgm.unlink(missing_ok=True)
    print(f"DONE: {out_path} ({out_path.stat().st_size} bytes, {TOTAL:.1f}s)")


def preview(times: list[float]) -> None:
    outd = Path("/tmp/cartoon_preview")
    outd.mkdir(exist_ok=True)
    for tt in times:
        frame = scene_frame_at(tt)
        p = outd / f"t{tt:04.1f}.png"
        frame.save(p)
        print("saved", p)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "videos" / "golu-cartoon-kids.mp4"))
    ap.add_argument("--preview", nargs="*", type=float, default=None)
    args = ap.parse_args()
    if args.preview is not None:
        preview(args.preview or [4, 14, 24, 38, 50, 60])
    else:
        render(Path(args.out))
