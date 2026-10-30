"""
build_video.py — assembly, subtitles, mux and delivery encode.

    python3 build_video.py [--from-audio] [--render] [--force]

Steps
  1. assemble the audio bed (voices, room tone, music, mastering)   -> build/audio/master.wav
  2. plan the camera shots                                         -> build/shots.json
  3. render every shot (cached)                                    -> build/shots/*.mp4
  4. concat + burn subtitles + mux audio                           -> out/*.mp4
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import assemble as A          # noqa: E402
import subs as S              # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)


def concat_shots(n, list_path):
    """A shot is only finished when its .json marker exists (written after ffmpeg)."""
    for i in range(n):
        mp4 = os.path.join(BUILD, 'shots', f'shot_{i:04d}.mp4')
        meta = os.path.join(BUILD, 'shots', f'shot_{i:04d}.json')
        if not (os.path.exists(mp4) and os.path.exists(meta)):
            raise SystemExit(f'shot {i} is still rendering (or missing) — try again in a moment')
    with open(list_path, 'w') as f:
        for i in range(n):
            f.write(f"file '{os.path.join(BUILD, 'shots', f'shot_{i:04d}.mp4')}'\n")
    return list_path


def final_mux(n_shots, name='chai_aur_bakwaas_ep14', crf=25, preset='slow'):
    shots = json.load(open(os.path.join(BUILD, 'shots.json')))
    lst = concat_shots(n_shots, os.path.join(BUILD, 'concat.txt'))
    ass = os.path.join(BUILD, 'subs.ass')
    audio = os.path.join(BUILD, 'audio', 'master.wav')
    silent = os.path.join(BUILD, 'video_silent.mp4')
    # 1) concat the rendered shots (stream copy: all encoded identically)
    subprocess.run([A.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'concat', '-safe', '0', '-i', lst,
                    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16',
                    '-pix_fmt', 'yuv420p', silent], check=True)
    # 2) burn subtitles + attach audio
    out = os.path.join(OUT, f'{name}.mp4')
    vf = (f"ass={ass}:fontsdir={os.path.join(ROOT, 'assets', 'fonts')}")
    subprocess.run([A.FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', silent, '-i', audio,
                    '-vf', vf,
                    '-c:v', 'libx264', '-preset', preset, '-crf', str(crf),
                    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
                    '-color_primaries', 'bt709', '-color_trc', 'bt709',
                    '-colorspace', 'bt709',
                    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-shortest', '-movflags', '+faststart',
                    '-metadata', 'title=चाय और बकवास — EP14: करियर, और उसूल',
                    '-metadata', 'artist=Aarav & Rohan',
                    '-metadata', 'comment=Hindi comedy podcast',
                    out], check=True)
    print('delivered:', out)
    return out


def main():
    args = sys.argv[1:]
    if '--render' in args:
        import render_shots
        render_shots.main(force='--force' in args)
    elif '--from-audio' in args:
        A.assemble()
    S.build()
    n = len(json.load(open(os.path.join(BUILD, 'shots.json'))))
    return final_mux(n)


if __name__ == '__main__':
    main()
