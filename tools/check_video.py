#!/usr/bin/env python3
"""Sanity-check a rendered MP4: streams, duration, audio level, and a contact sheet.

Usage: python tools/check_video.py renders/test_1min.mp4 --min-seconds 50 --sheet renders/contact_sheet.jpg
Exit code 1 if a check fails, so CI can stop before the expensive full render.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def ffprobe_json(path):
    cmd = ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if out.returncode != 0:
        raise SystemExit(f"ffprobe failed: {out.stderr.decode()[-500:]}")
    return json.loads(out.stdout)


def mean_volume(path):
    cmd = ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"]
    out = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    txt = out.stderr.decode("utf-8", "replace")
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", txt)
    mx = re.search(r"max_volume:\s*(-?[\d.]+) dB", txt)
    return (float(m.group(1)) if m else None, float(mx.group(1)) if mx else None)


def contact_sheet(path, dest, cols=4, rows=3):
    from PIL import Image
    tmp = Path(dest).parent / "_frames"
    tmp.mkdir(parents=True, exist_ok=True)
    dur = float(ffprobe_json(path)["format"]["duration"])
    n = cols * rows
    thumbs = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        out = tmp / f"t{i:02d}.jpg"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.2f}",
             "-i", str(path), "-frames:v", "1", "-vf", "scale=480:-1", str(out)],
            check=True,
        )
        if out.exists():
            thumbs.append(Image.open(out).convert("RGB"))
    if not thumbs:
        return None
    w, h = thumbs[0].size
    sheet = Image.new("RGB", (w * cols, h * rows), (0, 0, 0))
    for i, im in enumerate(thumbs):
        sheet.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
    sheet.save(dest, "JPEG", quality=85)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--min-seconds", type=float, default=45)
    ap.add_argument("--max-bytes", type=float, default=95_000_000)
    ap.add_argument("--sheet", default="")
    args = ap.parse_args()

    v = Path(args.video)
    problems = []
    if not v.exists() or v.stat().st_size < 500_000:
        problems.append("file missing or tiny")
        print("\n".join(problems))
        return 1

    info = ffprobe_json(v)
    dur = float(info["format"]["duration"])
    streams = info.get("streams", [])
    has_v = any(s["codec_type"] == "video" for s in streams)
    has_a = any(s["codec_type"] == "audio" for s in streams)
    vs = next((s for s in streams if s["codec_type"] == "video"), {})
    size = v.stat().st_size

    print(f"file      : {v}")
    print(f"duration  : {dur:.1f}s ({dur/60:.2f} min)")
    print(f"size      : {size/1e6:.1f} MB")
    print(f"video     : {vs.get('codec_name')} {vs.get('width')}x{vs.get('height')} {vs.get('r_frame_rate')}")
    print(f"audio     : {'yes' if has_a else 'NO'}")

    if not has_v:
        problems.append("no video stream")
    if not has_a:
        problems.append("no audio stream")
    if vs.get("width") != 1920 or vs.get("height") != 1080:
        problems.append("video is not 1920x1080")
    if dur < args.min_seconds:
        problems.append(f"too short ({dur:.1f}s < {args.min_seconds}s)")
    if size > args.max_bytes:
        problems.append(f"file too big for transport ({size/1e6:.1f}MB)")

    mean_db, max_db = mean_volume(v)
    print(f"mean vol  : {mean_db} dB / max {max_db} dB")
    if mean_db is None or mean_db < -45:
        problems.append(f"audio looks silent (mean {mean_db} dB) -> voiceover failed")

    if args.sheet:
        sheet = contact_sheet(v, args.sheet)
        print(f"sheet     : {sheet}")

    if problems:
        print("\nFAILED CHECKS:")
        for p in problems:
            print(f" - {p}")
        return 1
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
