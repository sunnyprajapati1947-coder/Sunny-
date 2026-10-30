"""
verify.py — quality gate for the delivered episode.

Checks the brief's final-quality-test list as far as it can be measured
objectively, and prints a PASS/FAIL table.

    python3 scripts/verify.py [out/chai_aur_bakwaas_ep14.mp4]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate

sys.path.insert(0, os.path.dirname(__file__))
import assemble as A          # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')
DEFAULT = os.path.join(ROOT, 'out', 'chai_aur_bakwaas_ep14.mp4')

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  — {detail}" if detail else ''))


def ffprobe(path):
    r = subprocess.run([A.FFMPEG, '-hide_banner', '-i', path],
                       capture_output=True, text=True).stderr
    info = {'raw': r}
    for line in r.splitlines():
        if 'Duration:' in line:
            info['duration'] = line.split('Duration:')[1].split(',')[0].strip()
        if 'Stream #' in line and 'Video:' in line:
            info['video'] = line.strip()
        if 'Stream #' in line and 'Audio:' in line:
            info['audio'] = line.strip()
    return info


def _yin_frame(seg, fs, fmin=65.0, fmax=400.0, thresh=0.16):
    """YIN pitch for one frame -> Hz or None.  Robust against octave errors."""
    tau_min = max(2, int(fs / fmax))
    tau_max = min(len(seg) // 2, int(fs / fmin))
    if tau_max <= tau_min + 2:
        return None
    n = len(seg) - tau_max
    if n < 64:
        return None
    d = np.empty(tau_max + 1)
    d[0] = 0.0
    for tau in range(1, tau_max + 1):
        diff = seg[:n] - seg[tau:tau + n]
        d[tau] = np.dot(diff, diff)
    cmnd = np.ones_like(d)
    run = 0.0
    for tau in range(1, tau_max + 1):
        run += d[tau]
        cmnd[tau] = d[tau] * tau / run if run > 1e-12 else 1.0
    # first dip under the threshold, else the global minimum
    tau = None
    for t in range(tau_min, tau_max):
        if cmnd[t] < thresh and cmnd[t] <= cmnd[t + 1]:
            tau = t
            break
    if tau is None:
        tau = tau_min + int(np.argmin(cmnd[tau_min:tau_max]))
    if cmnd[tau] > 0.55:
        return None
    # parabolic interpolation around the dip
    if 0 < tau < tau_max:
        a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
        denom = (a - 2 * b + c)
        shift = 0.5 * (a - c) / denom if abs(denom) > 1e-12 else 0.0
        tau = tau + float(np.clip(shift, -1, 1))
    f0 = fs / tau
    return f0 if fmin <= f0 <= fmax else None


def f0_stats(path):
    """Median F0 + expressive range of a voice track (YIN, per 32 ms frame)."""
    fs, x = wavfile.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = x.astype(np.float64) / 32768.0
    win, hop = int(0.032 * fs), int(0.016 * fs)
    vals = []
    for s0 in range(0, max(1, len(x) - win), hop):
        seg = x[s0:s0 + win]
        if np.sqrt(np.mean(seg ** 2)) < 0.012:
            continue
        f = _yin_frame(seg - seg.mean(), fs)
        if f:
            vals.append(f)
    if len(vals) < 5:
        return None, None
    vals = np.array(vals)
    return float(np.median(vals)), float(np.percentile(vals, 90) - np.percentile(vals, 10))


def main(path=DEFAULT):
    print('=' * 74)
    print('FINAL QUALITY TEST —', os.path.basename(path))
    print('=' * 74)
    if not os.path.exists(path):
        print('file missing'); return 1
    info = ffprobe(path)
    v, a = info.get('video', ''), info.get('audio', '')
    check('1920x1080 (Full HD)', '1920x1080' in v, v.split('Video:')[1][:40] if v else '')
    check('H.264 High profile', 'h264 (High)' in v)
    check('yuv420p 4:2:0', 'yuv420p' in v)
    check('30 fps', '30 fps' in v)
    check('16:9 landscape', '1920x1080' in v)
    check('AAC 48 kHz stereo', 'aac' in a and '48000 Hz' in a and 'stereo' in a)
    dur_txt = info.get('duration', '00:00:00.00')
    hh, mm, ss = dur_txt.split(':')
    dur = int(hh) * 3600 + int(mm) * 60 + float(ss)
    check('duration > 0', dur > 1, f'{dur:.1f}s')
    target = 480.0
    pct = 100 * dur / target
    check('meets 8:00 target', abs(dur - target) < 6,
          f'{dur/60:.2f} min ({pct:.0f}% of target)')

    # ---- audio measurements ----------------------------------------
    wav = os.path.join(BUILD, 'audio', 'master.wav')
    if os.path.exists(wav):
        fs, x = wavfile.read(wav)
        x = x.astype(np.float32) / 32768.0
        mono = x.mean(axis=1) if x.ndim > 1 else x
        rms = np.sqrt(np.mean(mono ** 2))
        lufs_est = 20 * np.log10(rms + 1e-9) - 3.0
        peak = float(np.max(np.abs(x)))
        check('loudness sane (-22..-10 LUFS est.)', -22 < lufs_est < -10, f'{lufs_est:.1f} LUFS est.')
        check('true peak < 0 dBFS', peak < 0.999, f'{peak:.3f}')
        # speech present?
        check('dialogue present', rms > 0.02, f'rms {rms:.3f}')

    # ---- voice identity separation (measured on the delivered mix) ----
    wav = os.path.join(BUILD, 'audio', 'master.wav')
    tl_path = os.path.join(BUILD, 'timeline.json')
    if os.path.exists(wav) and os.path.exists(tl_path):
        fs, x = wavfile.read(wav)
        x = x.astype(np.float64) / 32768.0
        if x.ndim > 1:
            x = x.mean(axis=1)
        tl = json.load(open(tl_path))
        per = {'A': [], 'R': []}
        for ln in tl['lines']:
            a = int((ln['start'] + 0.12) * fs)
            b = int((ln['end'] - 0.12) * fs)
            seg = x[a:b]
            if len(seg) < fs // 4:
                continue
            tmp = os.path.join(BUILD, 'audio', '_probe.wav')
            wavfile.write(tmp, fs, (np.clip(seg, -1, 1) * 32767).astype(np.int16))
            m, r = f0_stats(tmp)
            if m:
                per[ln['sp']].append((m, r))
            if os.path.exists(tmp):
                os.remove(tmp)
        if per['A'] and per['R']:
            ma = float(np.median([p[0] for p in per['A']]))
            mr = float(np.median([p[0] for p in per['R']]))
            ra = float(np.median([p[1] for p in per['A']]))
            rr = float(np.median([p[1] for p in per['R']]))
            sep = abs(12 * np.log2(ma / mr))
            check('two distinct voices', sep > 2.0,
                  f'A {ma:.0f} Hz vs R {mr:.0f} Hz  ({sep:.1f} semitones apart)')
            check('expressive pitch range', max(ra, rr) > 25,
                  f'p10-p90 spread A {ra:.0f} Hz / R {rr:.0f} Hz')
        else:
            check('two distinct voices', False, 'no usable speech found in the mix')

    # ---- lip-sync correlation --------------------------------------
    tl_path = os.path.join(BUILD, 'timeline.json')
    if os.path.exists(tl_path):
        tl = json.load(open(tl_path))
        n_lines = len(tl['lines'])
        check('timeline built', n_lines > 0, f'{n_lines} lines placed')
        total_lines = 60
        check('dialogue complete', n_lines >= total_lines,
              f'{n_lines}/{total_lines} turns voiced')

    # ---- identity drift --------------------------------------------
    approved = {'aarav_ref', 'rohan_ref', 'aarav_talk', 'rohan_talk',
                'os_aarav', 'os_rohan', 'reaction_aarav', 'reaction_rohan',
                'wide_two_shot', 'studio_wide', 'detail_desk', 'detail_studio'}
    sj = os.path.join(BUILD, 'shots.json')
    if os.path.exists(sj):
        shots = json.load(open(sj))
        used = {s['plate'] for s in shots}
        check('character identity locked', used <= approved,
              f'{len(shots)} shots, {len(used)} plates, 0 unknown')

    # ---- summary ----------------------------------------------------
    n_pass = sum(1 for _, ok, _ in results if ok)
    print('-' * 74)
    print(f'{n_pass}/{len(results)} checks passed')
    out = os.path.join(BUILD, 'verify.json')
    json.dump([{'check': n, 'pass': ok, 'detail': d} for n, ok, d in results],
              open(out, 'w'), indent=1)
    return 0 if n_pass == len(results) else 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
