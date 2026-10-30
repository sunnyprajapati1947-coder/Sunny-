"""
render_shots.py — renders one mp4 per camera shot, with caching.

Because every shot is independent, this lets the episode be assembled
incrementally: re-running only renders shots that are new or whose spec
changed.  Output: build/shots/shot_0000.mp4 ... (video only, 1920x1080@30).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
import render_engine as RE   # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')
SHOTS_DIR = os.path.join(BUILD, 'shots')
os.makedirs(SHOTS_DIR, exist_ok=True)


def load_audio(path):
    fs, x = wavfile.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = x.astype(np.float32) / 32768.0
    return x, fs


def spec_hash(shot, fps):
    h = hashlib.sha1()
    for k in ('plate', 'kind', 'who', 'framing', 'motion', 'start', 'end'):
        h.update(str(shot.get(k)).encode())
    h.update(str(fps).encode())
    return h.hexdigest()[:12]


def render_shot(idx, shot, timeline, audio, fps=RE.FPS, force=False, crf=17):
    h = spec_hash(shot, fps)
    out = os.path.join(SHOTS_DIR, f'shot_{idx:04d}.mp4')
    meta = os.path.join(SHOTS_DIR, f'shot_{idx:04d}.json')
    if not force and os.path.exists(out) and os.path.exists(meta):
        old = json.load(open(meta))
        if old.get('hash') == h and old.get('frames') == shot['frames']:
            return out, True
    nframes = shot['frames']
    cmd = [RE.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
           '-f', 'rawvideo', '-pix_fmt', 'bgr24',
           '-s', f'{RE.W}x{RE.H}', '-r', str(fps), '-i', '-',
           '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(crf),
           '-pix_fmt', 'yuv420p', '-g', str(fps * 2), '-threads', '2',
           out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)
    rd = RE.Renderer(timeline, [shot], audio, fps=fps)
    t0 = time.time()
    f0 = shot['start']
    for i in range(nframes):
        t = f0 + i / fps
        frame = rd.frame(t)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    err = proc.stderr.read().decode()[-800:]
    proc.wait()
    if proc.returncode != 0:
        raise SystemExit(f'ffmpeg failed on shot {idx}: {err}')
    json.dump(dict(hash=h, frames=nframes, seconds=nframes / fps,
                   render_s=round(time.time() - t0, 1), spec=shot),
              open(meta, 'w'), indent=1)
    return out, False


def main(force=False, only=None):
    tl = json.load(open(os.path.join(BUILD, 'timeline.json')))
    shots = json.load(open(os.path.join(BUILD, 'shots.json')))
    audio, fs = load_audio(os.path.join(BUILD, 'audio', 'master.wav'))
    print(f'{len(shots)} shots, {len(audio)/fs:.1f}s of audio')
    todo = []
    for i, s in enumerate(shots):
        if only is not None and i != only:
            continue
        out, cached = render_shot(i, s, tl, audio, force=force)
        todo.append(out)
        print(('cached  ' if cached else 'rendered') + f' shot {i:04d} '
              f'{s["plate"]:16s} {s["kind"]:9s} {s["frames"]:5d}f '
              f'({s["frames"]/RE.FPS:5.1f}s)')
    return todo


if __name__ == '__main__':
    force = '--force' in sys.argv
    only = None
    if '--only' in sys.argv:
        only = int(sys.argv[sys.argv.index('--only') + 1])
    main(force=force, only=only)
