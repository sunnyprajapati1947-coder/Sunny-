#!/usr/bin/env python3
"""
contact_sheet.py — renders the middle frame of every shot into one grid image,
so the whole film's composition can be reviewed at a glance.

usage: python3 movie/contact_sheet.py --out movie/tests/sheet.jpg [--only 1,2,3]
"""
from __future__ import annotations
import argparse, os, sys, time
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from lib import cgilib as G

TW, TH = 640, 360


def frame_for(scene_id, t=0.5):
    d, layers = R.prepare(scene_id)
    cam = R.CAM.get(d["cam"], R.CAM["zoom_in"])
    e = R.ease(t)
    z = 1.0 + cam["z"] * d["amp"] * (e if cam["z"] >= 0 else (1 - e))
    z = max(1.0, min(1.185, z))
    dxc = cam["dx"] * d["amp"] * ((e if cam["dx"] >= 0 else (1 - e)) * 2 - 1)
    dyc = cam["dy"] * d["amp"] * ((e if cam["dy"] >= 0 else (1 - e)) * 2 - 1)
    frame = None
    W, H = R.W, R.H
    for im, par in layers:
        sl = (R.OW / W) * (1.0 + (z - 1.0) * par)
        cw, ch = R.OW / sl, R.OH / sl
        cx = min(max(W / 2 + dxc * W * par, cw / 2), W - cw / 2)
        cy = min(max(H / 2 + dyc * H * par, ch / 2), H - ch / 2)
        box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
        crop = im.resize((R.OW, R.OH), Image.BICUBIC if par >= 1 else Image.BILINEAR, box=box)
        if frame is None:
            frame = crop
        else:
            frame.alpha_composite(crop)
    frame.alpha_composite(R.vignette_img(d["vig"]))
    lut = R.grade_lut(d["grade"][0], d["grade"][1])
    a = np.asarray(frame, np.uint8)
    rgb = np.stack([np.take(lut[0], a[..., 0]), np.take(lut[1], a[..., 1]),
                    np.take(lut[2], a[..., 2])], axis=2)
    return Image.fromarray(rgb, "RGB").resize((TW, TH), Image.LANCZOS), d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--label", action="store_true")
    a = ap.parse_args()
    R.SHOT_PAL = R.load_palette_map()
    ids = [int(x) for x in a.only.split(",")] if a.only else list(range(1, 37))
    tiles = []
    t0 = time.time()
    for sid in ids:
        try:
            im, d = frame_for(sid)
        except Exception as e:
            print(f"scene {sid} FAILED: {type(e).__name__}: {e}")
            im = Image.new("RGB", (TW, TH), (40, 0, 0))
        if a.label:
            from PIL import ImageDraw
            dr = ImageDraw.Draw(im)
            dr.rectangle([0, 0, 46, 24], fill=(0, 0, 0))
            dr.text((6, 6), f"{sid:02d}", fill=(255, 255, 0))
            dr.text((52, 6), (d.get("caption") or "")[:42], fill=(255, 255, 255))
        tiles.append(im)
        print(f"sheet {sid:02d} ok ({time.time()-t0:.1f}s)", flush=True)
    cols = a.cols
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * TW, rows * TH), (0, 0, 0))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * TW, (i // cols) * TH))
    sheet.save(a.out, quality=92)
    print("wrote", a.out, sheet.size)


if __name__ == "__main__":
    main()
