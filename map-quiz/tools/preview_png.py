#!/usr/bin/env python3
"""Rasterise src/map-data.js to a PNG so the map can be eyeballed without a browser.

Only used as a dev sanity check:  python3 tools/preview_png.py
"""
import json
import os
import struct
import zlib

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src", "map-data.js")
OUT = os.path.join(HERE, "preview.png")

W = 760
BG = (17, 24, 39)
SEA = (11, 18, 32)
PALETTE = [
    (56, 189, 248), (52, 211, 153), (251, 191, 36), (244, 114, 182),
    (167, 139, 250), (248, 113, 113), (34, 211, 238), (163, 230, 53),
]


def load():
    raw = open(SRC, encoding="utf-8").read()
    return json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))


def parse_path(d):
    rings, cur, i = [], [], 0
    while i < len(d):
        c = d[i]
        if c == "M":
            if cur:
                rings.append(cur)
            cur = []
            i += 1
            num = ""
            while i < len(d) and d[i] not in "MLZ":
                num += d[i]
                i += 1
            x, y = num.split(",")
            cur.append((float(x), float(y)))
        elif c == "L":
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


def main():
    m = load()
    s = W / m["width"]
    H = int(m["height"] * s)
    img = [[SEA] * W for _ in range(H)]

    shapes = []
    for sh in m["shapes"]:
        rings = [[(x * s, y * s) for x, y in r] for r in parse_path(sh["path"])]
        shapes.append((sh, rings))

    # simple painter's algorithm with even-odd fill per shape
    for idx, (sh, rings) in enumerate(shapes):
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        y0, y1 = max(0, int(min(ys))), min(H - 1, int(max(ys)) + 1)
        x0, x1 = max(0, int(min(xs))), min(W - 1, int(max(xs)) + 1)
        edges = []
        for r in rings:
            for i in range(len(r) - 1):
                edges.append((r[i], r[i + 1]))
        for y in range(y0, y1 + 1):
            yc = y + 0.5
            hits = []
            for (ax, ay), (bx, by) in edges:
                if (ay <= yc < by) or (by <= yc < ay):
                    hits.append(ax + (yc - ay) * (bx - ax) / (by - ay))
            hits.sort()
            for k in range(0, len(hits) - 1, 2):
                for x in range(max(x0, int(hits[k])), min(x1, int(hits[k + 1])) + 1):
                    img[y][x] = PALETTE[idx % len(PALETTE)]

    # border lines: draw every shape's rings in dark navy
    for _, rings in shapes:
        for r in rings:
            for i in range(len(r) - 1):
                (ax, ay), (bx, by) = r[i], r[i + 1]
                steps = int(max(abs(bx - ax), abs(by - ay))) + 1
                for t in range(steps + 1):
                    x = int(ax + (bx - ax) * t / steps)
                    y = int(ay + (by - ay) * t / steps)
                    if 0 <= x < W and 0 <= y < H:
                        img[y][x] = BG

    # labels, sized like the CSS (22 user units on a 1000-unit wide viewBox)
    flat = bytearray()
    for row in img:
        for px in row:
            flat.extend(px)
    image = Image.frombytes("RGB", (W, H), bytes(flat))
    draw = ImageDraw.Draw(image)
    try:
        fonts = {fs: ImageFont.load_default(size=max(8, int(fs * s))) for fs in (20, 18, 16)}
    except TypeError:
        fonts = {20: ImageFont.load_default(), 18: ImageFont.load_default(), 16: ImageFont.load_default()}
    for sh in m["shapes"]:
        if not sh.get("fs"):
            continue
        font = fonts.get(sh["fs"], fonts[20])
        name = sh["name"].split("\n")[0]
        if sh.get("leader"):
            (x1, y1), (x2, y2) = sh["leader"]
            draw.line([(x1 * s, y1 * s), (x2 * s, y2 * s)], fill=(200, 220, 245), width=1)
        draw.text((sh["label"][0] * s, sh["label"][1] * s), name, font=font, fill=(20, 26, 38),
                  anchor="mm", stroke_width=2, stroke_fill=(235, 242, 255))
    image.save(OUT)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB) {W}x{H}")
    return

    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in img)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(OUT, "wb").write(png)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB) {W}x{H}")

    print("label check (id, label px->img):")
    for sh in m["shapes"][:0]:
        pass


if __name__ == "__main__":
    main()
