#!/usr/bin/env python3
"""
make_film.py — renders every shot, burns in Hindi subtitles, concatenates,
and muxes the soundtrack into the final YouTube-ready mp4.

usage:
  python3 movie/make_film.py --preview 1,7,30      # quick 3-shot check
  python3 movie/make_film.py                       # the full 10 minute film
  python3 movie/make_film.py --from 13 --to 20     # partial re-render
"""
from __future__ import annotations
import argparse, json, os, subprocess, sys, time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R
from lib import cgilib as G

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "movie", "build")
SEG = os.path.join(BUILD, "seg")
OUT = os.path.join(ROOT, "output")
os.makedirs(SEG, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
FONT = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Regular.ttf")
FFMPEG = None
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"


def subs_for(d, dur, subs):
    cap = d.get("caption")
    title = d.get("title")
    def by_frame(i):
        t = i / R.FPS
        if title:
            if dur > 9 and t > dur - 6.2:
                return subs.title(title)
            if t < 6.0:
                return subs.title(title, sub="मोहनपुर गाँव की कहानी")
        if cap and 0.45 < t < max(1.0, dur - 0.40):
            return subs.overlay(cap)
        return None
    return {"by_frame": by_frame}


def frame_schedule(timing):
    """Exact cumulative frame boundaries so the video clock never drifts from
    the audio clock: each shot gets round(end*FPS) - round(start*FPS) frames."""
    sched = {}
    for s in timing["scenes"]:
        a = round(s["start"] * R.FPS)
        b = round((s["start"] + s["dur"]) * R.FPS)
        sched[s["id"]] = max(2, b - a)
    return sched


def render_one(sid, dur, subs, out_path, frames=None):
    d, _ = R.build(sid)
    R.render(sid, dur, out_path, subs=subs_for(d, dur, subs), frames=frames)
    return out_path


def concat(paths, out_path):
    lst = os.path.join(BUILD, "concat.txt")
    with open(lst, "w") as f:
        for p in paths:
            f.write(f"file '{os.path.abspath(p)}'\n")
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
           "-i", lst, "-c", "copy", "-movflags", "+faststart", out_path]
    subprocess.run(cmd, check=True)
    return out_path


def mux(video, audio, out_path, fade_out=True):
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-i", video, "-i", audio,
           "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
           "-shortest", "-movflags", "+faststart", out_path]
    subprocess.run(cmd, check=True)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    ap.add_argument("--from", dest="frm", type=int, default=1)
    ap.add_argument("--to", dest="to", type=int, default=36)
    ap.add_argument("--name", default="Neelu_aur_Gyaan_ka_Chashma_1080p")
    ap.add_argument("--assemble-only", action="store_true",
                    help="just concat existing segments + mux the soundtrack")
    a = ap.parse_args()

    timing = json.load(open(os.path.join(BUILD, "timing.json")))
    scenes = {s["id"]: s for s in timing["scenes"]}
    sched = frame_schedule(timing)
    R.SHOT_PAL = R.load_palette_map()
    subs = R.Subs()

    if a.assemble_only:
        ids = list(range(1, 37))
        segs = []
        missing = []
        for sid in ids:
            f = os.path.join(SEG, f"seg_{sid:02d}.mp4")
            (segs if os.path.exists(f) and os.path.getsize(f) > 10_000 else missing).append(
                f if os.path.exists(f) else sid)
        if missing:
            print("[film] missing segments:", missing)
            sys.exit(1)
        vid = concat(segs, os.path.join(BUILD, "video_only.mp4"))
        final = mux(vid, os.path.join(BUILD, "soundtrack.wav"),
                    os.path.join(OUT, a.name + ".mp4"))
        print("[film] FINAL ->", final, flush=True)
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", "95", "-i", final,
                        "-frames:v", "1", "-q:v", "2",
                        os.path.join(OUT, a.name + "_thumbnail.jpg")], check=False)
        return

    if a.preview:
        ids = [int(x) for x in a.preview.split(",")]
    else:
        ids = [i for i in range(a.frm, a.to + 1)]

    t0 = time.time()
    segs = []
    for k, sid in enumerate(ids):
        dur = scenes[sid]["dur"]
        out = os.path.join(SEG, f"seg_{sid:02d}.mp4")
        if os.path.exists(out) and os.path.getsize(out) > 10_000:
            print(f"[film] scene {sid:02d} cached", flush=True)
            segs.append(out)
            continue
        st = time.time()
        render_one(sid, dur, subs, out, frames=sched.get(sid))
        print(f"[film] scene {sid:02d} done in {time.time()-st:.0f}s "
              f"({k+1}/{len(ids)}, elapsed {(time.time()-t0)/60:.1f} min)", flush=True)
        segs.append(out)

    if len(ids) == 36:
        vid = concat(segs, os.path.join(BUILD, "video_only.mp4"))
        print("[film] concatenated ->", vid, flush=True)
        final = mux(vid, os.path.join(BUILD, "soundtrack.wav"),
                    os.path.join(OUT, a.name + ".mp4"))
        print("[film] FINAL ->", final, flush=True)
        # poster frame
        poster = os.path.join(OUT, a.name + "_thumbnail.jpg")
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", "95", "-i", final,
                        "-frames:v", "1", "-q:v", "2", poster], check=False)
        print("[film] thumbnail ->", poster, flush=True)
    else:
        demo = os.path.join(OUT, "preview_" + "_".join(str(i) for i in ids) + ".mp4")
        concat(segs, demo)
        print("[film] preview ->", demo, flush=True)


if __name__ == "__main__":
    main()
