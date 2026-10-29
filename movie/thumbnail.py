#!/usr/bin/env python3
"""
thumbnail.py — composes a 1280x720 YouTube thumbnail from the same 3D
primitives as the film (not a crop of the video, so it stays crisp).

usage: python3 movie/thumbnail.py --out output/thumb.jpg
"""
from __future__ import annotations
import argparse, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cgilib as G
from lib import scenes as S
from lib.cgilib import hx, mix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Bold.ttf")
TW, TH = 1280, 720
SS = 2                                    # supersample
W, H = TW * SS, TH * SS


def build():
    S.W, S.H = W, H
    S.HZ = 0.58 * H
    pal = S.PAL["dusk"]
    bg = G.Canvas(W, H)
    S.sky(bg, pal, sun_xy=(0.74, 0.46), sun_r=0.055, clouds=0.75)
    S.hills(bg, pal, S.HZ, H * 0.09, pal["far"], seed=5, layers=2)
    mid = G.Canvas(W, H)
    S.ground(mid, pal, col=mix(pal["ground"], hx("a87a52"), 0.25))
    S.house(mid, pal, W * 0.12, S.HZ * 1.16, W * 0.13, H * 0.13, lit=(1.0, 0.78, 0.42))
    S.house(mid, pal, W * 0.88, S.HZ * 1.14, W * 0.12, H * 0.12, lit=(1.0, 0.74, 0.4))
    S.tree(mid, pal, W * 0.04, S.HZ * 1.32, H * 0.30, seed=9)
    subj = G.Canvas(W, H)
    # heroes, big and centred-right so text has room on the left
    S.boy(subj, W * 0.60, H * 0.945, 0.44 * H, pose="point", pal=pal, mouth="open")
    S.neelu(subj, W * 0.80, H * 0.945, 0.46 * H, pal=pal, arm="wave", eyes="happy",
            scarf_wave=1.1)
    G.glow(subj, W * 0.545, H * 0.30, W * 0.10, hx("ffe08a"), 0.55, 1.9)
    S.glasses(subj, W * 0.545, H * 0.30, H * 0.042, 1.0)
    for i in range(18):
        import math as _m
        a = i * 0.92
        rr = H * (0.055 + 0.008 * (i % 5))
        G.soft_blob(subj, W * 0.545 + _m.cos(a) * rr, H * 0.30 + _m.sin(a) * rr * 0.8,
                    H * 0.004, H * 0.004, hx("fff4c0"), 0.8, 2)
    fg = G.Canvas(W, H)
    S.bush(fg, pal, W * 0.02, H * 1.14, H * 0.28, col=pal["grass"] * 0.45)

    comp = bg
    for layer in (mid, subj, fg):
        a = layer.px
        comp.px[..., :3] = a[..., :3] * a[..., 3:4] + comp.px[..., :3] * (1 - a[..., 3:4])

    img = comp.to_image()
    # warm grade + vignette
    arr = np.asarray(img, np.float32)[..., :3] / 255.0
    arr = (arr - 0.5) * 1.10 + 0.5
    arr *= np.array([1.06, 1.00, 0.94], np.float32)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((x - W / 2) / (W * 0.62), (y - H / 2) / (H * 0.62))
    arr *= np.clip(1.0 - 0.42 * np.clip(r - 0.55, 0, 1.6) ** 1.7, 0, 1)[..., None]
    img = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    tr = G.TextRenderer(FONT)
    # left panel
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([W * 0.028, H * 0.105, W * 0.505, H * 0.685],
                        radius=int(H * 0.045), fill=(8, 10, 18, 196),
                        outline=(255, 196, 84, 235), width=int(H * 0.007))
    tr.draw(img, "नीलू और", (W * 0.075, H * 0.235), int(H * 0.115), (255, 206, 92),
            outline=5, outline_col=(44, 20, 4))
    tr.draw(img, "ज्ञान का चश्मा", (W * 0.075, H * 0.395), int(H * 0.115),
            (255, 244, 214), outline=5, outline_col=(44, 20, 4))
    tr.draw(img, "हिंदी कार्टून कहानी • 3D", (W * 0.072, H * 0.560), int(H * 0.050),
            (196, 232, 255), outline=3, outline_col=(12, 20, 34))
    # "10 MIN" badge
    d.rounded_rectangle([W * 0.62, H * 0.055, W * 0.955, H * 0.155],
                        radius=int(H * 0.05), fill=(214, 40, 40, 235))
    tr.draw(img, "10 मिनट", (W * 0.787, H * 0.142), int(H * 0.062), (255, 255, 255),
            anchor="center")
    out = img.convert("RGB").resize((TW, TH), Image.LANCZOS)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "output", "thumbnail.png"))
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    im = build()
    im.save(a.out)
    print("wrote", a.out, im.size)


if __name__ == "__main__":
    main()
