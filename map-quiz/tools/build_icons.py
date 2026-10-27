#!/usr/bin/env python3
"""Generate the app icons (India silhouette in tricolour on navy).

    python3 tools/build_icons.py

Needs Pillow:  pip install pillow
"""

from __future__ import annotations

import json
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAP_JS = os.path.join(ROOT, "src", "map-data.js")
OUT_DIR = os.path.join(ROOT, "assets", "icons")

NAVY_TOP = (20, 33, 58)
NAVY_BOTTOM = (8, 14, 26)
SAFFRON = (255, 153, 51)
WHITE = (247, 249, 252)
GREEN = (19, 136, 8)

SS = 3  # supersampling factor


def load_map():
    raw = open(MAP_JS, encoding="utf-8").read()
    return json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))


def parse_path(d):
    rings, cur, i = [], [], 0
    while i < len(d):
        c = d[i]
        if c in "ML":
            if c == "M" and cur:
                rings.append(cur)
                cur = []
            i += 1
            num = ""
            while i < len(d) and d[i] not in "MLZ":
                num += d[i]
                i += 1
            x, y = num.split(",")
            cur.append((float(x), float(y)))
        elif c == "Z":
            if cur:
                rings.append(cur)
                cur = []
            i += 1
        else:
            i += 1
    if cur:
        rings.append(cur)
    return rings


def vertical_gradient(size, stops):
    """stops: [(position 0..1, (r,g,b)), ...] sorted."""
    w, h = size
    img = Image.new("RGB", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                k = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                px[0, y] = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        else:
            px[0, y] = stops[-1][1]
    return img.resize(size, Image.BILINEAR)


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def build_icon(size_px, padding_ratio=0.14, rounded=True, radius_ratio=0.22, transparent_bg=False):
    data = load_map()
    size = size_px * SS
    pad = int(size * padding_ratio)
    inner = size - pad * 2

    scale = inner / max(data["width"], data["height"])
    off_x = (size - data["width"] * scale) / 2
    off_y = (size - data["height"] * scale) / 2

    silhouette = Image.new("L", (size, size), 0)
    sd = ImageDraw.Draw(silhouette)
    for shape in data["shapes"]:
        for ring in parse_path(shape["path"]):
            if len(ring) < 3:
                continue
            pts = [(off_x + x * scale, off_y + y * scale) for x, y in ring]
            sd.polygon(pts, fill=255)

    # tricolour fill, clipped to the silhouette
    tri = vertical_gradient(
        (size, size),
        [
            (0.00, (255, 170, 70)),
            (0.34, SAFFRON),
            (0.47, WHITE),
            (0.56, WHITE),
            (0.72, (34, 165, 60)),
            (1.00, GREEN),
        ],
    )

    if transparent_bg:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        bg = vertical_gradient((size, size), [(0.0, NAVY_TOP), (1.0, NAVY_BOTTOM)]).convert("RGBA")
        if rounded:
            bg.putalpha(rounded_mask((size, size), int(size * radius_ratio)))
        canvas = bg

    # soft halo behind the map so it separates from the navy
    halo = silhouette.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(size * 0.012))
    glow = Image.new("RGBA", (size, size), (255, 200, 140, 0))
    glow.putalpha(halo.point(lambda v: int(v * 0.34)))
    canvas.alpha_composite(glow)

    tri_rgba = tri.convert("RGBA")
    tri_rgba.putalpha(silhouette)
    canvas.alpha_composite(tri_rgba)

    return canvas.resize((size_px, size_px), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    outputs = {
        "icon-512.png": build_icon(512),
        "icon-192.png": build_icon(192),
        "icon-180.png": build_icon(180),
        "favicon-64.png": build_icon(64, padding_ratio=0.1, radius_ratio=0.24),
        # maskable: extra padding inside the safe zone, full-bleed background
        "maskable-512.png": build_icon(512, padding_ratio=0.24, radius_ratio=0.5),
    }
    for name, img in outputs.items():
        path = os.path.join(OUT_DIR, name)
        img.save(path, optimize=True)
        print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
