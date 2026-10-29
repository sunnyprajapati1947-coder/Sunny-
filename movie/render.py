#!/usr/bin/env python3
"""
render.py — renders one shot to an mp4: 3D parallax camera + grading +
subtitles + grain, encoded with ffmpeg.

usage: python3 movie/render.py --scene 7 --dur 14.2 --out movie/build/seg_07.mp4
"""
from __future__ import annotations
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cgilib as G
from lib import scenes as S
from lib import film as F

OW, OH = 1920, 1080
FPS = 24
W, H = S.W, S.H
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Bold.ttf")
FONT_REG = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Regular.ttf")

CAM = {
    "zoom_in":  dict(z=0.115, dx=0.000, dy=-0.004),
    "zoom_out": dict(z=-0.115, dx=0.000, dy=0.004),
    "pan_l":    dict(z=0.030, dx=-0.052, dy=0.002),
    "pan_r":    dict(z=0.030, dx=0.052, dy=0.002),
    "drift":    dict(z=0.050, dx=0.030, dy=-0.006),
}


def build(scene_id):
    pal = SHOT_PAL.get(scene_id, S.PAL["day"])
    d = F.SCENES[scene_id](pal)
    return d, pal


def ease(t):
    return t * t * (3 - 2 * t)


def prepare(scene_id):
    d, pal = build(scene_id)
    layers = []
    for i, (cv, par, blur) in enumerate(d["layers"]):
        im = cv.to_image()
        if blur and blur > 0:
            im = im.filter(ImageFilter.GaussianBlur(blur))
        im = bake_grain(im, scene_id * 131 + i, 3.2)
        layers.append((im, par))
    return d, layers


def vig_mask(strength):
    y, x = np.mgrid[0:OH, 0:OW].astype(np.float32)
    cx, cy = OW / 2, OH / 2
    r = np.hypot((x - cx) / (OW * 0.62), (y - cy) / (OH * 0.62))
    m = 1.0 - strength * np.clip(r - 0.55, 0, 1.6) ** 1.7
    return np.clip(m, 0.0, 1.0)[..., None].astype(np.float32)


def grade_lut(tint, amt):
    x = np.arange(256, dtype=np.float32) / 255.0
    y = (x - 0.5) * 1.055 + 0.5
    out = []
    for c in range(3):
        t = np.clip(y * float(tint[c]) * 1.55, 0, 1.4)
        v = y * (1 - amt) + t * amt
        out.append(np.clip(v * 255.0 + 0.5, 0, 255).astype(np.uint8))
    return np.stack(out)


def vignette_img(strength):
    m = vig_mask(strength)[..., 0]
    a = np.clip((1.0 - m) * 255.0, 0, 255).astype(np.uint8)
    img = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    img.putalpha(Image.fromarray(a, "L"))
    return img


def bake_grain(im, seed, amount=5.0):
    """static film grain baked into the plate (free at render time)."""
    arr = np.asarray(im.convert("RGB"), np.int16)
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amount, arr.shape[:2]).astype(np.int16)[..., None]
    arr = np.clip(arr + n, 0, 255).astype(np.uint8)
    rgb = Image.fromarray(arr, "RGB").convert("RGBA")
    rgb.putalpha(im.getchannel("A"))
    return rgb


def grade_arr(arr, tint, amt):
    arr = (arr - 0.5) * 1.055 + 0.5
    t = np.clip(arr * tint * 1.55, 0, 1.4)
    arr = arr * (1 - amt) + t * amt
    lum = (arr[..., 0:1] * 0.299 + arr[..., 1:2] * 0.587 + arr[..., 2:3] * 0.114)
    arr = lum + (arr - lum) * 1.06
    return arr


class Subs:
    """cached subtitle + title overlays (Devanagari shaped by HarfBuzz).

    Subtitles sit on a soft rounded plate — the way Hindi story channels do it —
    because a thin outline is unreadable over busy night plates.
    """

    def __init__(self, font_size=52, max_w=0.86):
        self.tr = G.TextRenderer(FONT)
        self.px = font_size
        self.max_w = OW * max_w
        self.cache = {}
        self.tcache = {}

    def overlay(self, text):
        if text in self.cache:
            return self.cache[text]
        size = self.px
        lines = G.wrap(text, self.tr, size, self.max_w)
        while len(lines) > 2 and size > 34:
            size -= 4
            lines = G.wrap(text, self.tr, size, self.max_w)
        lines = lines[:2]
        lh = int(size * 1.56)
        plate = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        widths = [self.tr.measure(ln, size) for ln in lines]
        bw = max(widths) + size * 1.5
        bh = (len(lines) - 1) * lh + size * 1.42
        y_bottom = OH - 50
        y_top = y_bottom - bh
        d = ImageDraw.Draw(plate)
        d.rounded_rectangle([OW / 2 - bw / 2, y_top, OW / 2 + bw / 2, y_bottom],
                            radius=int(size * 0.42), fill=(8, 9, 14, 172))
        plate = plate.filter(ImageFilter.GaussianBlur(0.4))
        y0 = y_top + size * 1.03
        for i, ln in enumerate(lines):
            self.tr.draw(plate, ln, (OW / 2, y0 + i * lh), size, (255, 252, 240),
                         anchor="center", outline=0)
        self.cache[text] = plate
        return plate

    def title(self, text, sub=None, size=104):
        key = (text, sub, size)
        if key in self.tcache:
            return self.tcache[key]
        img = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        tr = self.tr
        tw = tr.measure(text, size)
        sw = tr.measure(sub, int(size * 0.40)) if sub else 0
        bw = max(tw, sw) + size * 2.2
        bh = size * (2.35 if sub else 1.5)
        cy = OH * 0.42
        band = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        ImageDraw.Draw(band).rounded_rectangle(
            [OW / 2 - bw / 2, cy - bh / 2, OW / 2 + bw / 2, cy + bh / 2],
            radius=int(size * 0.35), fill=(10, 10, 16, 148))
        band = band.filter(ImageFilter.GaussianBlur(2.0))
        img.alpha_composite(band)
        tr.draw(img, text, (OW / 2, cy + size * 0.10), size, (255, 214, 120),
                anchor="center", outline=3, outline_col=(46, 24, 4))
        if sub:
            tr.draw(img, sub, (OW / 2, cy + size * 0.92), int(size * 0.40),
                    (240, 246, 255), anchor="center", outline=2, outline_col=(20, 16, 10))
        self.tcache[key] = img
        return img


SHOT_PAL = {}


def load_palette_map():
    path = os.path.join(ROOT, "movie", "shots.json")
    if not os.path.exists(path):
        return {}
    cfg = json.load(open(path))
    out = {}
    for sc, meta in cfg.items():
        out[int(sc)] = S.PAL[meta["pal"]]
    return out


def render(scene_id, dur, out_path, subs=None, title=None, scale_title=None, log=True,
           frames=None):
    d, layers = prepare(scene_id)
    cam = CAM.get(d["cam"], CAM["zoom_in"])
    n = max(2, int(frames) if frames else int(round(dur * FPS)))
    vig = vig_mask(d["vig"])
    rng = np.random.default_rng(scene_id * 977 + 13)
    grain = d["grain"]
    tint = d["grade"][0]
    amt = d["grade"][1]
    amp = d["amp"]

    exe = None
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = "ffmpeg"
    cmd = [exe, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-", "-an",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)

    lut = grade_lut(tint, amt)
    vig = vignette_img(d["vig"])
    r1, r2, r3 = lut[0], lut[1], lut[2]
    for i in range(n):
        t = i / max(1, n - 1)
        e = ease(t)
        z = 1.0 + cam["z"] * amp * (e if cam["z"] >= 0 else (1 - e))
        z = max(1.0, min(1.185, z))
        dxc = cam["dx"] * amp * ((e if cam["dx"] >= 0 else (1 - e)) * 2 - 1)
        dyc = cam["dy"] * amp * ((e if cam["dy"] >= 0 else (1 - e)) * 2 - 1)
        frame = None
        for li, (im, par) in enumerate(layers):
            # base scale maps the full 2304x1296 canvas onto 1920x1080
            sl = (OW / W) * (1.0 + (z - 1.0) * par)
            cw, ch = OW / sl, OH / sl
            cx = W / 2 + dxc * W * par
            cy = H / 2 + dyc * H * par
            cx = min(max(cx, cw / 2), W - cw / 2)
            cy = min(max(cy, ch / 2), H - ch / 2)
            box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
            resample = Image.BICUBIC if par >= 1.0 else Image.BILINEAR
            crop = im.resize((OW, OH), resample, box=box)
            if frame is None:
                frame = crop
            else:
                frame.alpha_composite(crop)
        frame.alpha_composite(vig)
        if subs is not None:
            node = subs["by_frame"](i)
            if node:
                frame.alpha_composite(node)
        a = np.asarray(frame, np.uint8)
        r = np.take(r1, a[..., 0])
        g = np.take(r2, a[..., 1])[..., None]
        b = np.take(r3, a[..., 2])[..., None]
        frame_bytes = np.concatenate([r[..., None], g, b], axis=2).tobytes()
        proc.stdin.write(frame_bytes)
        if log and i % 96 == 0:
            print(f"  scene {scene_id:02d} frame {i}/{n}", flush=True)
    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "ignore")
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed on scene {scene_id}: {err[:800]}")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", type=int, required=True)
    ap.add_argument("--dur", type=float, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-subs", action="store_true")
    a = ap.parse_args()
    global SHOT_PAL
    SHOT_PAL = load_palette_map()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    render(a.scene, a.dur, a.out)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
