"""
assemble.py — builds the episode audio: dialogue placement, room tone,
music bed, mixing and mastering.

Inputs   assets/vo/*.mp3  (per-line voice takes)  +  script/dialogue_blocks.py
Outputs  build/audio/master.wav   (48 kHz, 24-bit stereo)
         build/timeline.json      (line start/end, sections, shot hints)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, lfilter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'script'))
import dialogue_blocks as DB   # noqa: E402

SR = 48000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
VO = os.path.join(ROOT, 'assets', 'vo')
BUILD = os.path.join(ROOT, 'build')
AUD = os.path.join(BUILD, 'audio')
os.makedirs(AUD, exist_ok=True)

FFMPEG = None
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = 'ffmpeg'


# --------------------------------------------------------------------------
#  io helpers
# --------------------------------------------------------------------------
def decode(path: str) -> np.ndarray:
    """mp3/wav -> 48k mono float32."""
    out = path + '.48k.wav'
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(path):
        subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', path, '-ac', '1', '-ar', str(SR),
                        '-c:a', 'pcm_s16le', out], check=True)
    fs, x = wavfile.read(out)
    x = x.astype(np.float32) / 32768.0
    return x


def save(path: str, x: np.ndarray):
    x = np.clip(x, -1.0, 1.0)
    wavfile.write(path, SR, (x * 32767).astype(np.int16))


def trim_silence(x, thresh_db=-42, pad=0.02):
    if len(x) == 0:
        return x
    win = int(0.01 * SR)
    n = len(x) // win
    env = np.array([np.sqrt(np.mean(x[i * win:(i + 1) * win] ** 2) + 1e-12) for i in range(n)])
    db = 20 * np.log10(env + 1e-12)
    idx = np.where(db > thresh_db)[0]
    if len(idx) == 0:
        return x
    a = max(0, int((idx[0] * win) - pad * SR))
    b = min(len(x), int((idx[-1] + 1) * win + pad * SR))
    return x[a:b]


# --------------------------------------------------------------------------
#  per-clip voice processing (the "studio chain")
# --------------------------------------------------------------------------
def hp(x, f=80, order=2):
    sos = butter(order, f / (SR / 2), btype='high', output='sos')
    return sosfilt(sos, x).astype(np.float32)


def lp(x, f=13000, order=2):
    sos = butter(order, min(0.99, f / (SR / 2)), btype='low', output='sos')
    return sosfilt(sos, x).astype(np.float32)


def peaking_eq(x, f, gain_db, q=1.0):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / SR
    alpha = np.sin(w0) / (2 * q)
    b0 = 1 + alpha * A
    b1 = -2 * np.cos(w0)
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * np.cos(w0)
    a2 = 1 - alpha / A
    return lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x).astype(np.float32)


def high_shelf(x, f=6000, gain_db=2.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / SR
    alpha = np.sin(w0) / 2 * np.sqrt(2)
    b0 = A * ((A + 1) + (A - 1) * np.cos(w0) + 2 * np.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * np.cos(w0))
    b2 = A * ((A + 1) + (A - 1) * np.cos(w0) - 2 * np.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * np.cos(w0) + 2 * np.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * np.cos(w0))
    a2 = (A + 1) - (A - 1) * np.cos(w0) - 2 * np.sqrt(A) * alpha
    return lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x).astype(np.float32)


def deess(x, strength=0.45):
    """Split at 5.5 kHz; compress the high band by a fast envelope."""
    sos = butter(4, 5500 / (SR / 2), btype='high', output='sos')
    hi = sosfilt(sos, x).astype(np.float32)
    lo = x - hi
    env = np.abs(hi)
    # 3 ms attack / 40 ms release follower
    ca = 1 - np.exp(-1 / (0.003 * SR))
    cr = 1 - np.exp(-1 / (0.040 * SR))
    e = np.empty_like(env)
    acc = 0.0
    for i in range(len(env)):
        a = ca if env[i] > acc else cr
        acc = acc + a * (env[i] - acc)
        e[i] = acc
    thr = np.percentile(e[e > 0], 92) if np.any(e > 0) else 1.0
    g = np.clip(thr / (e + 1e-6), 0, 1) ** strength
    return (lo + hi * g).astype(np.float32)


def compress(x, thresh_db=-20, ratio=3.0, attack=0.004, release=0.10, knee=6.0):
    env = np.abs(x)
    ca = 1 - np.exp(-1 / (attack * SR))
    cr = 1 - np.exp(-1 / (release * SR))
    e = np.empty_like(env)
    acc = 0.0
    for i in range(len(env)):
        a = ca if env[i] > acc else cr
        acc = acc + a * (env[i] - acc)
        e[i] = acc
    db = 20 * np.log10(e + 1e-8)
    over = db - thresh_db
    gr_db = np.where(over > knee / 2, (over - knee / 2) * (1 - 1 / ratio), 0.0)
    gr_db = np.where((over > -knee / 2) & (over <= knee / 2),
                     (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee), gr_db)
    g = 10 ** (-gr_db / 20)
    return (x * g).astype(np.float32)


def voice_chain(x: np.ndarray, who: str) -> np.ndarray:
    """Studio treatment shared by both hosts, with a per-host colour."""
    x = trim_silence(x)
    # --- speaker identity: small pitch+formant shift so the two hosts can
    # never be confused (see voicelab.SHIFT).  Duration is preserved, so the
    # timeline, camera plan and lip-sync stay valid.
    import voicelab
    x = voicelab.pitch_shift(x, voicelab.SHIFT.get(who, 0.0))
    x = hp(x, 75)
    x = deess(x, 0.5)
    if who == 'A':
        # darker, chestier
        x = peaking_eq(x, 190, 1.6, 0.9)
        x = peaking_eq(x, 900, -1.2, 1.2)
        x = peaking_eq(x, 3200, 1.8, 1.0)
        x = high_shelf(x, 7000, -1.0)
    else:
        # brighter, forward
        x = peaking_eq(x, 240, 1.2, 0.9)
        x = peaking_eq(x, 1200, -1.6, 1.2)
        x = peaking_eq(x, 3400, 2.4, 1.1)
        x = high_shelf(x, 6800, 1.4)
    x = lp(x, 14000)
    x = compress(x, -22, 3.0, 0.006, 0.12)
    # even out takes: normalise to a target RMS, then peak guard
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    x = x * (0.075 / rms)
    pk = np.max(np.abs(x)) + 1e-9
    if pk > 0.72:
        x = x * (0.72 / pk)
    return x.astype(np.float32)


# --------------------------------------------------------------------------
#  room tone + music bed (synthesised)
# --------------------------------------------------------------------------
def pink_noise(n, rng):
    """Voss-McCartney-ish pink noise via filtered white noise."""
    w = rng.normal(0, 1, n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return lfilter(b, a, w).astype(np.float32)


def room_tone(n, rng):
    p = pink_noise(n, rng) * 0.02
    # slow air movement
    lfo = 1 + 0.18 * np.sin(2 * np.pi * 0.11 * np.arange(n) / SR + 1.3)
    lfo2 = 1 + 0.10 * np.sin(2 * np.pi * 0.037 * np.arange(n) / SR)
    t = p * lfo * lfo2
    t = hp(t, 90)
    t = lp(t, 6000)
    return t.astype(np.float32)


def adsr(n, a=0.01, d=0.08, s=0.7, r=0.2):
    env = np.ones(n, dtype=np.float32) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    env[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, max(0, n - na))
    if nd:
        env[na:na + nd] = np.linspace(1, s, nd)
    nr = min(nr, n)
    if nr:
        env[n - nr:] *= np.linspace(1, 0, nr)
    return env


def rhodes(freq, dur, vel=1.0):
    """FM electric-piano voice."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 2 * t) * 1.7 * np.exp(-t * 4.5)
    y = np.sin(2 * np.pi * freq * t + mod)
    y += 0.18 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 6)
    y *= np.exp(-t * 1.1)
    y *= adsr(n, 0.004, 0.05, 0.85, 0.15)
    return (y * vel).astype(np.float32)


def upright_bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.0)
    y += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 5.0)
    y += 0.12 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 7.0)
    y *= adsr(n, 0.008, 0.06, 0.6, 0.12)
    return y.astype(np.float32)


def brush(dur=0.18):
    n = int(dur * SR)
    rng = np.random.default_rng(int(dur * 1e6) % 9999)
    nz = rng.normal(0, 1, n)
    nz = np.convolve(nz, np.ones(3) / 3, 'same')
    env = np.exp(-np.arange(n) / (0.045 * SR))
    nz = nz * env
    nz = hp(nz.astype(np.float32), 900)
    nz = lp(nz, 9000)
    return (nz * 0.5).astype(np.float32)


def kick():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f = 62 * np.exp(-t * 18) + 44
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    return (y * 0.9).astype(np.float32)


def make_music(total_s: float, bpm=74.0, seed=7):
    """A warm lo-fi jazzy loop: Cmaj7 – Am7 – Dm7 – G7 (Rhodes + bass + brushes)."""
    rng = np.random.default_rng(seed)
    n = int(total_s * SR) + SR
    buf = np.zeros(n, dtype=np.float32)
    beat = 60.0 / bpm
    bar = beat * 4
    # chord voicings (Hz)
    def m(name):
        base = {'C': 261.63, 'A': 220.0, 'D': 293.66, 'G': 196.0}[name]
        return base
    charts = [
        [261.63, 329.63, 392.00, 493.88],   # Cmaj7
        [220.00, 261.63, 329.63, 415.30],   # Am7
        [293.66, 349.23, 440.00, 523.25],   # Dm7
        [196.00, 246.94, 293.66, 349.23],   # G7
    ]
    basses = [65.41, 55.00, 73.42, 49.00]
    tpos = 0.0
    bar_i = 0
    while tpos < total_s - bar:
        chord = charts[bar_i % 4]
        b = basses[bar_i % 4]
        # bass on 1 and 3
        for off in (0.0, 2 * beat):
            s = int((tpos + off) * SR)
            y = upright_bass(b, beat * 1.6)
            buf[s:s + len(y)] += y * 0.30
        # brushed chords: sparse comping
        for off in (0.0, 1.5 * beat, 2.5 * beat, 3.5 * beat):
            s = int((tpos + off) * SR)
            vel = 0.55 if off in (0.0, 2.5 * beat) else 0.38
            for k, f in enumerate(chord):
                y = rhodes(f, beat * 1.3, vel * (0.8 + 0.2 * rng.random()))
                if s + len(y) < n:
                    buf[s:s + len(y)] += y * 0.055
        # shaker / brush on eighths
        for e in range(8):
            s = int((tpos + e * beat / 2) * SR)
            y = brush(0.16)
            amp = 0.055 if e % 2 == 0 else 0.035
            if s + len(y) < n:
                buf[s:s + len(y)] += y * amp
        # soft kick on 1 and 3
        for off in (0.0, 2 * beat):
            s = int((tpos + off) * SR)
            y = kick()
            if s + len(y) < n:
                buf[s:s + len(y)] += y * 0.11
        tpos += bar
        bar_i += 1
    buf = hp(buf, 60)
    buf = lp(buf, 9000)
    # subtle tape wobble
    t = np.arange(len(buf)) / SR
    wow = 1 + 0.0015 * np.sin(2 * np.pi * 0.35 * t) + 0.0007 * np.sin(2 * np.pi * 1.1 * t + 2)
    idx = np.clip(np.cumsum(wow), 0, len(buf) - 2)
    buf = np.interp(idx, np.arange(len(buf)), buf).astype(np.float32)
    return buf


def room_ir(dur=0.55, seed=4):
    """Synthetic small-studio impulse response: early reflections + short tail."""
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    ir = np.zeros(n, dtype=np.float32)
    t = np.arange(n) / SR
    # diffuse tail
    tail = rng.normal(0, 1, n).astype(np.float32)
    tail *= np.exp(-t / 0.11)
    # early reflections (a treated room has few, and they are close)
    for ms, g in ((3.1, 0.55), (5.7, -0.38), (8.9, 0.30), (12.4, -0.22), (17.6, 0.16)):
        i = int(ms * 1e-3 * SR)
        if i < n:
            ir[i] += g
    ir += tail * 0.30
    # keep it dark (a padded room eats high frequencies)
    sos = butter(2, 4200 / (SR / 2), btype='low', output='sos')
    ir = sosfilt(sos, ir).astype(np.float32)
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir


def add_room(x, wet=0.10, dur=0.55):
    """Mix a short convolution reverb in, keeping the direct sound dominant."""
    ir = room_ir(dur)
    wetsig = np.convolve(x, ir, mode='full')[:len(x)].astype(np.float32)
    return ((1.0 - wet) * x + wet * wetsig).astype(np.float32)


def limiter(x, ceiling=0.95, lookahead_ms=6.0, release_ms=120.0):
    """Look-ahead peak limiter -> lets us raise loudness without clipping."""
    la = max(1, int(lookahead_ms * 1e-3 * SR))
    from scipy.ndimage import maximum_filter1d
    env = np.abs(x)
    # running max over the next `la` samples == look-ahead (O(n), no big temp arrays)
    peak = maximum_filter1d(env, size=la, origin=-(la // 2), mode='nearest')
    peak = np.maximum(peak, 1e-6)
    target = np.minimum(1.0, ceiling / peak)
    # instant attack (the look-ahead already opened the window), smooth release
    cr = 1 - np.exp(-1 / (release_ms * 1e-3 * SR))
    g = np.empty_like(target)
    acc = 1.0
    for i in range(len(target)):
        t = target[i]
        if t < acc:               # clamp down immediately
            acc = t
        else:                     # drift back up slowly
            acc += cr * (t - acc)
        g[i] = acc
    return (x * g).astype(np.float32)


def sting(dur=2.6):
    """Short podcast sonic-logo: bell arpeggio + soft sub drop."""
    n = int(dur * SR)
    out = np.zeros(n, dtype=np.float32)
    freqs = [523.25, 659.25, 783.99, 1046.5]
    for i, f in enumerate(freqs):
        s = int(i * 0.11 * SR)
        m = int(1.6 * SR)
        t = np.arange(m) / SR
        y = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 2.4)
        y *= adsr(m, 0.005, 0.05, 0.8, 0.4)
        out[s:s + m] += y[:max(0, min(m, n - s))] * 0.16
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * (70 * np.exp(-t * 2.2) + 38) * t) * np.exp(-t * 1.6) * 0.22
    out += sub.astype(np.float32)
    out = lp(out, 12000)
    return out


# --------------------------------------------------------------------------
#  timeline
# --------------------------------------------------------------------------
def build_timeline():
    """Decide gaps, section boundaries and absolute times for every line."""
    entries = []
    # hook clips (quick-fire cold open) — text comes from the script module
    try:
        import dialogue as D
        hook_text = {i: t for i, _, t, _, _ in D.LINES}
    except Exception:
        hook_text = {}
    for i, (lid, sp) in enumerate(DB.HOOK):
        entries.append(dict(id=lid, sp=sp, section='hook', text=hook_text.get(lid, ''),
                            path=f'{VO}/{sp}_{lid}.mp3'))
    for bid, sp, text, sec, direction in DB.BLOCKS:
        entries.append(dict(id=bid, sp=sp, section=sec, text=text,
                            path=f'{VO}/{sp}_{bid}.mp3', direction=direction))
    return entries


def assemble(gap_scale=1.0, with_music=True, out_name='master'):
    entries_all = build_timeline()
    missing = [e['path'] for e in entries_all if not os.path.exists(e['path'])]
    entries = [e for e in entries_all if os.path.exists(e['path'])]
    if missing:
        print(f"[warn] {len(missing)} of {len(entries_all)} voice files are not rendered yet "
              f"— assembling the {len(entries)} available line(s).")

    clips = {}
    for e in entries:
        x = decode(e['path'])
        x = voice_chain(x, e['sp'])
        clips[e['id']] = x

    # place clips with conversational gaps
    rng = np.random.default_rng(11)
    t = 3.4                      # title-card pad before the first word
    lines = []
    prev_sec = None
    for i, e in enumerate(entries):
        sec = e['section']
        if prev_sec is not None and sec != prev_sec:
            t += 0.85 * gap_scale          # section breath
        elif i > 0:
            same_speaker = entries[i - 1]['sp'] == e['sp']
            if same_speaker:
                t += 0.22 * gap_scale
            else:
                t += (0.30 + rng.random() * 0.14) * gap_scale
        dur = len(clips[e['id']]) / SR
        lines.append(dict(id=e['id'], sp=e['sp'], section=sec,
                          text=e.get('text', ''), start=round(t, 3),
                          end=round(t + dur, 3), dur=round(dur, 3)))
        t += dur
        prev_sec = sec
    total = t + 2.6

    # ---- mix ---------------------------------------------------------
    n = int(total * SR) + SR
    voice = np.zeros(n, dtype=np.float32)
    for ln in lines:
        x = clips[ln['id']]
        s = int(ln['start'] * SR)
        voice[s:s + len(x)] += x

    # dry voice bus (drives lip-sync; mastering must never change animation)
    save(os.path.join(AUD, 'voice_dry.wav'), np.stack([voice, voice], axis=1))

    # room, click/pop guard and gentle bus compression
    voice = add_room(voice, wet=0.085)
    voice = hp(voice, 60)
    voice = compress(voice, -26, 2.2, 0.012, 0.22)

    music = np.zeros(n, dtype=np.float32)
    if with_music:
        m = make_music(total + 2, bpm=74.0)
        music[:len(m)] = m[:n] if len(m) >= n else np.pad(m, (0, n - len(m)))

    # duck music under speech
    sp_env = np.abs(voice)
    win = int(0.02 * SR)
    nb = len(sp_env) // win
    env = np.array([np.max(sp_env[i * win:(i + 1) * win]) for i in range(nb)])
    env = np.concatenate([env, np.repeat(env[-1], max(0, len(sp_env) - len(env) * win))])
    env = np.repeat(env, win)[:len(sp_env)]
    ca = 1 - np.exp(-1 / (0.10 * SR))
    cr = 1 - np.exp(-1 / (0.60 * SR))
    e = np.empty_like(env)
    acc = 0.0
    for i in range(0, len(env), 8):      # subsample for speed
        v = env[i]
        a = ca * 8 if v > acc else cr * 8
        acc = acc + min(1.0, a) * (v - acc)
        e[i:i + 8] = acc
    duck = np.clip(e / (0.02 + e), 0, 1)
    music_gain = 0.115
    music *= (1 - 0.80 * duck) * music_gain

    # intro sting + outro sting
    st = sting()
    intro_s = int(0.12 * SR)
    music[intro_s:intro_s + len(st)] += st * 0.55
    outro_s = int((total - 2.4) * SR)
    if outro_s + len(st) < n:
        music[outro_s:outro_s + len(st)] += st[::-1][:len(st)] * 0.35

    # room tone everywhere, fading at the very start/end
    rt = room_tone(n, rng) * 0.020
    fade = np.ones(n, dtype=np.float32)
    fi = int(1.0 * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fade[-fi:] = np.linspace(1, 0, fi)
    amb = (rt) * fade

    mix = voice + music + amb
    # ---- master chain ------------------------------------------------
    mix = hp(mix, 45)
    mix = peaking_eq(mix, 2500, 1.0, 0.8)
    mix = lp(mix, 16500)
    mix = compress(mix, -18, 2.0, 0.010, 0.18)
    # loudness: podcast target ~ -16 LUFS (RMS proxy for speech is about 5 dB hotter)
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix = mix * (0.215 / rms)
    # look-ahead limiting replaces the old tanh clip: transparent and true-peak safe
    mix = limiter(mix, ceiling=0.95)
    stereo = np.stack([mix, mix], axis=1)

    save(os.path.join(AUD, f'{out_name}.wav'), stereo)

    tl = dict(total=round(total, 3), sr=SR, lines=lines,
              sections={s: [round(min(l['start'] for l in lines if l['section'] == s), 2),
                            round(max(l['end'] for l in lines if l['section'] == s), 2)]
                        for s in {l['section'] for l in lines}})
    with open(os.path.join(BUILD, 'timeline.json'), 'w') as f:
        json.dump(tl, f, indent=1, ensure_ascii=False)
    # ---- camera plan --------------------------------------------------
    try:
        import render_engine as RE
        shots = RE.plan_shots(tl)
        fps = RE.FPS
        for sh in shots:
            sh['frames'] = max(1, round(sh['end'] * fps) - round(sh['start'] * fps))
        # quantise to frame boundaries so the cut is frame accurate
        acc = 0
        for sh in shots:
            sh['start_f'] = acc
            acc += sh['frames']
            sh['end_f'] = acc
        with open(os.path.join(BUILD, 'shots.json'), 'w') as f:
            json.dump(shots, f, indent=1)
        print(f"camera plan: {len(shots)} shots, {acc} frames ({acc/fps:.1f}s)")
    except Exception as e:
        print('[warn] shot planning failed:', e)

    print(f"master: {total:.1f}s  lines: {len(lines)}  -> {AUD}/{out_name}.wav")
    print("sections:", {k: v for k, v in tl['sections'].items()})
    return tl


if __name__ == '__main__':
    assemble()
