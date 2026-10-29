#!/usr/bin/env python3
"""
audio.py — builds the complete Hindi soundtrack for the film.

  * narration  : eSpeak-NG (offline, hi) -> warm "studio" DSP (EQ, doubling,
                 compression, room) -> per-scene clips
  * music      : procedural orchestral-ish score (pads, bass, flute, bells)
                 with act-aware chord progressions + ducking under narration
  * ambience   : wind / birds / crickets per scene mood
  * sfx        : transition whooshes, magic sparkles, water splash

Everything is synthesised locally with numpy; no network, no samples.
Output: movie/build/audio/narr_XX.wav, movie/build/audio/soundtrack.wav,
        movie/build/timing.json
"""
from __future__ import annotations
import ctypes as C
import json
import math
import os
import sys
import wave

import numpy as np

ROOT = dirs = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "movie", "build")
NA = os.path.join(BUILD, "audio")
SR_N = 22050          # espeak native
SR = 44100            # mix rate
os.makedirs(NA, exist_ok=True)

TARGET_TOTAL = float(os.environ.get("FILM_SECONDS", "600"))

# ----------------------------------------------------------------- espeak
import espeakng_loader as _L

_lib = C.CDLL(_L.get_library_path())
_lib.espeak_Initialize.restype = C.c_int
_lib.espeak_Initialize.argtypes = [C.c_int, C.c_int, C.c_char_p, C.c_int]
_lib.espeak_Initialize(1, 0, _L.get_data_path().encode(), 0)
_lib.espeak_SetVoiceByName.argtypes = [C.c_char_p]
_lib.espeak_SetParameter.argtypes = [C.c_int, C.c_int, C.c_int]
_CB = C.CFUNCTYPE(C.c_int, C.POINTER(C.c_short), C.c_int, C.c_void_p)
_lib.espeak_SetSynthCallback.argtypes = [_CB]


def tts(text, voice="hi+m3", rate=133, pitch=48, range_=60):
    _lib.espeak_SetVoiceByName(voice.encode())
    _lib.espeak_SetParameter(1, rate, 0)     # speed wpm
    _lib.espeak_SetParameter(2, pitch, 0)    # 0-99
    _lib.espeak_SetParameter(3, range_, 0)   # pitch range
    chunks = []

    def cb(wav, n, ev):
        if n > 0:
            chunks.append(C.string_at(wav, n * 2))
        return 0

    _cbf = _CB(cb)
    _lib.espeak_SetSynthCallback(_cbf)
    data = text.encode("utf-8")
    _lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 0, None, None)
    _lib.espeak_Synchronize()
    pcm = b"".join(chunks)
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    return x


# ----------------------------------------------------------------- dsp
def resample(x, sr_in, sr_out):
    if sr_in == sr_out or len(x) == 0:
        return x
    n_out = int(round(len(x) * sr_out / sr_in))
    xin = np.linspace(0, 1, len(x), endpoint=False)
    xout = np.linspace(0, 1, n_out, endpoint=False)
    return np.interp(xout, xin, x).astype(np.float32)


def fft_filter(x, sr, kind="lp", f1=200.0, f2=8000.0, slope=2.0):
    """smooth frequency-domain shelf / band shaping."""
    n = len(x)
    if n < 64:
        return x
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    if kind == "lp":
        g = 1.0 / (1.0 + (f / max(f1, 1)) ** (2 * slope))
    elif kind == "hp":
        g = 1.0 / (1.0 + (max(f1, 1) / np.maximum(f, 1)) ** (2 * slope))
    elif kind == "band":      # boost between f1..f2
        g = np.exp(-((np.log(np.maximum(f, 1)) - np.log(math.sqrt(f1 * f2))) ** 2) /
                   (2 * (0.6 * math.log(max(f2 / f1, 1.01))) ** 2))
        g = 0.55 + 0.45 * g
    elif kind == "notch":
        g = 1.0 - 0.8 * np.exp(-((np.log(np.maximum(f, 1)) - np.log(f1)) ** 2) /
                               (2 * (0.35 * math.log(max(f2 / f1, 1.01))) ** 2))
    else:
        g = np.ones_like(f)
    return np.fft.irfft(X * g, n=n).astype(np.float32)


def eq_voice(x, sr=SR):
    """warmer, less buzzy narration."""
    x = fft_filter(x, sr, "hp", f1=85, slope=2.0)
    x = fft_filter(x, sr, "band", f1=170, f2=420)        # chest body
    x = fft_filter(x, sr, "notch", f1=2900, f2=3400)     # eSpeak buzz
    x = fft_filter(x, sr, "lp", f1=7200)                 # tame fizz
    return x


def double_track(x, sr=SR):
    """pitch/phase-doubled copy -> thick 'double tracked' narrator."""
    d1 = int(0.017 * sr)
    d2 = int(0.029 * sr)
    v1 = resample(x, int(sr * 1.0), int(sr * 0.988))
    v2 = resample(x, int(sr * 1.0), int(sr * 1.011))
    out = x.copy()
    n1 = min(len(v1), len(out) - d1)
    out[d1:d1 + n1] += 0.26 * v1[:n1]
    n2 = min(len(v2), len(out) - d2)
    out[d2:d2 + n2] += 0.20 * v2[:n2]
    return out


def compress(x, sr=SR, thresh=0.16, ratio=3.2, attack=0.006, release=0.20):
    env = np.abs(x)
    a = math.exp(-1.0 / (attack * sr))
    r = math.exp(-1.0 / (release * sr))
    smooth = np.empty_like(env)
    prev = 0.0
    for i in range(len(env)):
        v = env[i]
        prev = a * prev + (1 - a) * v if v > prev else r * prev + (1 - r) * v
        smooth[i] = prev
    gain = np.where(smooth > thresh, (thresh + (smooth - thresh) / ratio) / np.maximum(smooth, 1e-6), 1.0)
    return (x * gain).astype(np.float32)


def reverb(x, sr=SR, rt=0.85, wet=0.16, seed=4):
    rng = np.random.default_rng(seed)
    n = int(rt * sr)
    ir = rng.normal(0, 1, n).astype(np.float32)
    ir *= np.exp(-np.linspace(0, 5.2, n)).astype(np.float32)
    ir = fft_filter(ir, sr, "lp", f1=3600)
    ir[:int(0.012 * sr)] *= np.linspace(0, 1, int(0.012 * sr))
    ir /= np.sqrt((ir ** 2).sum()) + 1e-9
    # fast convolution in blocks
    L = len(x) + n
    nfft = 1 << int(math.ceil(math.log2(L)))
    Y = np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft)
    y = np.fft.irfft(Y, nfft)[:len(x)].astype(np.float32)
    y /= (np.abs(y).max() + 1e-9)
    return (x * (1 - wet) + y * wet * (np.abs(x).max() + 1e-9)).astype(np.float32)


def norm(x, peak=0.92):
    m = np.abs(x).max()
    return (x * (peak / m) if m > 1e-6 else x).astype(np.float32)


def load_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        d = d.reshape(-1, ch).mean(axis=1)
    return d, sr


def save_wav(path, x, sr=SR, stereo=True):
    x = np.clip(x, -1, 1)
    if stereo:
        if x.ndim == 1:
            x = np.stack([x * 0.99, x], axis=1)
        d = (x * 32767).astype(np.int16)
    else:
        d = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(d.tobytes())


# ----------------------------------------------------------------- music
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7,
        "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(name, octave):
    """name like 'D', 'A#'; octave 3 = ~146 Hz for D."""
    return 440.0 * 2 ** ((NOTE[name] + 12 * (octave - 4) - 9) / 12.0)


CHORDS = {
    "Dm": (["D", "F", "A"], "D"), "Bb": (["A#", "D", "F"], "A#"),
    "F": (["F", "A", "C"], "F"), "C": (["C", "E", "G"], "C"),
    "Gm": (["G", "A#", "D"], "G"), "A": (["A", "C#", "E"], "A"),
    "D": (["D", "F#", "A"], "D"), "Bm": (["B", "D", "F#"], "B"),
    "G": (["G", "B", "D"], "G"), "Em": (["E", "G", "B"], "E"),
    "Am": (["A", "C", "E"], "A"),
}

ACT_PROG = {
    1: ["Dm", "Bb", "F", "C"],
    2: ["Bb", "F", "Gm", "A"],
    3: ["D", "A", "Bm", "G"],
}
SCENE_ACT = {i: 1 for i in range(1, 12)}
SCENE_ACT.update({i: 2 for i in range(12, 31)})
SCENE_ACT.update({i: 3 for i in range(31, 37)})


def pad_voice(t, chord, gain=1.0, bright=0.4):
    """detuned sine stack with slow swell."""
    names, root = CHORDS[chord]
    out = np.zeros_like(t)
    for k, nm in enumerate(names):
        for det, amp in ((0.997, 0.5), (1.0, 0.8), (1.004, 0.5)):
            f = hz(nm, 3) * det
            ph = (k * 1.7) % (2 * math.pi)
            out += amp * np.sin(2 * math.pi * f * t + ph)
            out += bright * 0.22 * amp * np.sin(2 * math.pi * f * 2 * t + ph * 1.3)
    out /= (len(names) * 2.6)
    return out * gain


def bass_voice(t, chord, gain=1.0):
    names, root = CHORDS[chord]
    f = hz(root, 2)
    env = 0.55 + 0.45 * np.exp(-((t * 0.55) % 1.0) * 3.0)
    return (np.sin(2 * math.pi * f * t) + 0.25 * np.sin(2 * math.pi * f * 2 * t)) * env * gain


def flute(t, f, gain=1.0):
    vib = 1.0 + 0.006 * np.sin(2 * math.pi * 5.1 * t)
    ph = 2 * math.pi * f * np.cumsum(vib) / SR
    return (np.sin(ph) + 0.16 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)) * gain


def bell(t, f, gain=1.0):
    env = np.exp(-t * 2.6)
    return (np.sin(2 * math.pi * f * t) + 0.4 * np.sin(2 * math.pi * f * 2.02 * t)) * env * gain


def cricket(t, gain=1.0):
    pulse = (np.sin(2 * math.pi * 26 * t) > 0.55).astype(np.float32)
    return np.sin(2 * math.pi * 4200 * t) * pulse * gain


def chirp(t, gain=1.0, f0=2400, f1=3400, dur=0.09):
    env = np.exp(-((t % 1.2) - 0.05) ** 2 / (2 * 0.02 ** 2))
    f = f0 + (f1 - f0) * np.clip(t / dur, 0, 1)
    ph = 2 * math.pi * np.cumsum(f) / SR
    return np.sin(ph) * env * gain


class Score:
    """block-rendered procedural music; absolute-time based so it is seamless."""

    def __init__(self, total, scenes, narration_level):
        self.total = total
        self.scenes = scenes            # list of dicts: start, end, act, night, mood

    def blocks(self, block=10.0):
        n = int(self.total * SR)
        step = int(block * SR)
        t_all = np.arange(0, n, dtype=np.float64) / SR
        for s in range(0, n, step):
            e = min(n, s + step)
            t = t_all[s:e]
            yield s, e, t

    def render(self):
        n = int(self.total * SR)
        out = np.zeros(n, np.float32)
        rng = np.random.default_rng(11)
        melody_notes = ["D", "E", "F", "A", "C", "D", "F", "G", "A"]
        for s, e, t in self.blocks():
            seg = np.zeros_like(t)
            # which scene are we in (scene-local musical state)
            for sc in self.scenes:
                if sc["start"] <= t[0] < sc["end"] + 1e-6:
                    cur = sc
                    break
            else:
                cur = self.scenes[-1]
            act = cur["act"]
            prog = ACT_PROG[act]
            bar = 4.0                                        # 4s per chord
            idx = int(((t[0] - cur["start"]) // bar) % len(prog))
            chord = prog[idx]
            night = cur.get("night", False)
            # pad (always)
            g = 0.085 if night else 0.075
            seg += pad_voice(t, chord, g, bright=0.35 if night else 0.5)
            # bass
            if not night:
                seg += bass_voice(t, chord, 0.055)
            # gentle bell accents at chord changes
            phase = ((t - cur["start"]) % bar)
            if not night:
                tm = phase.copy()
                seg += bell(tm, hz(CHORDS[chord][0][0], 5), 0.030)
            # sparse flute melody phrases (every 8s, 2s phrase)
            cyc = ((t - cur["start"]) % 16.0)
            if not night and act >= 2:
                nm = melody_notes[int(((t[0] - cur["start"]) // 16) % len(melody_notes))]
                env = np.clip((cyc - 1.0) / 0.6, 0, 1) * np.clip((5.0 - cyc) / 1.2, 0, 1)
                if act == 3:
                    env = np.clip((cyc - 0.4) / 0.4, 0, 1) * np.clip((6.0 - cyc) / 1.4, 0, 1)
                seg += flute(cyc, hz(nm, 5), 0.050) * env
                seg += flute(cyc, hz(nm, 4), 0.020) * env
            out[s:e] += seg.astype(np.float32)
        out = fft_filter(out, SR, "lp", f1=5200, slope=1.4)
        out = norm(out, 0.55)
        return out

    def duck(self, narr_env):
        """sidechain-ish ducking: music dips while narration is present."""
        win = int(0.05 * SR)
        k = np.ones(win, np.float32) / win
        env = np.convolve(narr_env, k, "same")
        gain = 1.0 - 0.52 * np.clip(env / (env.max() + 1e-9) * 3.0, 0, 1)
        gain = np.convolve(gain, np.ones(int(0.35 * SR), np.float32) /
                           int(0.35 * SR), "same").astype(np.float32)
        return gain


def ambience(scenes, total):
    n = int(total * SR)
    out = np.zeros(n, np.float32)
    rng = np.random.default_rng(23)
    block = int(10.0 * SR)
    for s in range(0, n, block):
        e = min(n, s + block)
        t = np.arange(s, e, dtype=np.float64) / SR
        sc = next((x for x in scenes if x["start"] <= t[0] < x["end"] + 1e-6), scenes[-1])
        night = sc.get("night", False)
        wind = rng.normal(0, 1, len(t)).astype(np.float32)
        wind = fft_filter(wind, SR, "lp", f1=520 if night else 900, slope=1.6)
        lfo = 0.55 + 0.45 * np.sin(2 * math.pi * 0.045 * t + sc["start"])
        out[s:e] += wind * lfo * (0.035 if night else 0.028)
        if night:
            cr = cricket(t, 0.006) * (np.sin(2 * math.pi * 0.19 * t) > -0.2)
            out[s:e] += cr.astype(np.float32)
        elif not sc.get("indoor", False):
            if ((sc["start"] * 7) % 3) < 1.4:      # not every scene has birds
                for k in range(3):
                    out[s:e] += chirp(t + k * 0.37 + (sc["start"] % 1.0), 0.010,
                                      f0=2100 + 220 * k, f1=3300 + 260 * k).astype(np.float32)
    out = fft_filter(out, SR, "lp", f1=6500)
    return norm(out, 0.30)


def sfx_track(scenes, total):
    n = int(total * SR)
    out = np.zeros(n, np.float32)
    rng = np.random.default_rng(31)
    magic = {7, 9, 11, 30, 32}
    for i, sc in enumerate(scenes):
        st = int(sc["start"] * SR)
        dur = int(0.9 * SR)
        e = min(n, st + dur)
        if e <= st:
            continue
        t = np.arange(e - st, dtype=np.float64) / SR
        # transition whoosh
        noise = rng.normal(0, 1, e - st).astype(np.float32)
        noise = fft_filter(noise, SR, "lp", f1=1400)
        env = (np.clip(t / 0.45, 0, 1) * np.clip((0.9 - t) / 0.5, 0, 1)) ** 1.4
        out[st:e] += noise * env * 0.030
        if sc["id"] in magic:
            for k, nm in enumerate(("D", "F", "A", "D")):
                o = st + int(k * 0.10 * SR)
                o2 = min(n, o + int(1.4 * SR))
                if o2 <= o:
                    continue
                tt = np.arange(o2 - o, dtype=np.float64) / SR
                out[o:o2] += bell(tt, hz(nm, 6), 0.040).astype(np.float32)
        if sc["id"] == 30:                       # water burst
            o = st + int(0.4 * SR)
            o2 = min(n, o + int(1.6 * SR))
            tt = np.arange(o2 - o, dtype=np.float64) / SR
            wn = rng.normal(0, 1, o2 - o).astype(np.float32)
            wn = fft_filter(wn, SR, "band", f1=700, f2=4200)
            out[o:o2] += wn * np.exp(-tt * 1.6).astype(np.float32) * 0.09
    return out


def main():
    scenes_json = json.load(open(os.path.join(ROOT, "movie", "scenes.json"), encoding="utf-8"))
    shots = json.load(open(os.path.join(ROOT, "movie", "shots.json"), encoding="utf-8"))
    entries = scenes_json["scenes"]

    print(f"[audio] synthesising {len(entries)} Hindi narration clips (eSpeak-NG hi+m3)")
    clips = []
    for e in entries:
        x = tts(e["narration"])
        x = resample(x, SR_N, SR)
        x = eq_voice(x)
        x = double_track(x)
        x = compress(x)
        x = reverb(x, wet=0.13)
        # trim silence
        thr = 0.012
        idx = np.nonzero(np.abs(x) > thr)[0]
        if len(idx):
            x = x[max(0, idx[0] - int(0.12 * SR)): min(len(x), idx[-1] + int(0.25 * SR))]
        x = norm(x, 0.90)
        clips.append(x)
        print(f"[audio] scene {e['id']:02d}: {len(x)/SR:5.1f}s  “{e['narration'][:38]}…”")

    dur = np.array([len(c) / SR for c in clips])
    gap = 1.55
    base = dur + gap
    factor = TARGET_TOTAL / base.sum()
    factor = max(0.92, min(1.14, factor))
    scene_dur = base * factor
    # resample narration by the same factor (small tempo change, keeps timbre)
    clips2 = []
    for c, f in zip(clips, [factor] * len(clips)):
        if abs(f - 1.0) < 1e-3:
            clips2.append(c)
        else:
            clips2.append(resample(c, int(SR * 1.0), int(SR * f)))
    starts = np.concatenate([[0.0], np.cumsum(scene_dur)[:-1]])
    total = float(scene_dur.sum())
    print(f"[audio] tempo factor {factor:.3f} -> film {total/60:.2f} min")

    sds = []
    for e, sd, st, d in zip(entries, scene_dur, starts, dur):
        meta = shots.get(str(e["id"]), {})
        pal = meta.get("pal", "day")
        sds.append({"id": e["id"], "start": float(st), "end": float(st + sd),
                    "dur": float(sd), "act": SCENE_ACT[e["id"]],
                    "night": pal == "night", "indoor": pal == "warm" and e["id"] in (3, 9, 10, 26),
                    "narr_dur": float(d)})
    json.dump({"total": total, "factor": factor, "scenes": sds},
              open(os.path.join(BUILD, "timing.json"), "w"), indent=1)

    n = int(total * SR)
    print(f"[audio] rendering score + ambience + sfx ({total:.1f}s @ {SR} Hz)")
    sc = Score(total, sds, None)
    music = sc.render()
    amb = ambience(sds, total)
    sfx = sfx_track(sds, total)

    narr = np.zeros(n, np.float32)
    for i, (c, st) in enumerate(zip(clips2, starts)):
        o = int(st * SR)
        e = min(n, o + len(c))
        narr[o:e] += c[:e - o]
    name = "narr_%02d.wav"
    for e, c, st in zip(entries, clips2, starts):
        save_wav(os.path.join(NA, name % e["id"]), c, SR, stereo=False)

    # ---- explicit gain staging so the voice always sits on top ----------
    def rms(v):
        return float(np.sqrt((v.astype(np.float64) ** 2).mean()) + 1e-9)

    music *= (0.042 / rms(music))
    amb *= (0.018 / rms(amb))
    sfx *= (0.030 / rms(sfx))
    print(f"[audio] staged  narr rms={rms(narr):.3f} music rms={rms(music):.3f} "
          f"amb rms={rms(amb):.3f} sfx rms={rms(sfx):.3f}")
    duck = sc.duck(np.abs(narr))
    duck = 0.40 + 0.60 * duck
    mix = narr * 0.96 + music * duck + amb * (0.60 + 0.40 * duck) + sfx
    # soft clip + master
    mix = np.tanh(mix * 1.02) * 0.94
    mix = norm(mix, 0.95)
    # gentle stereo width for music/ambience feel: tiny haas on the whole bed
    d = int(0.011 * SR)
    right = mix.copy()
    right[d:] = right[d:] * 0.92 + mix[:n - d] * 0.18
    st = np.stack([mix, right * 0.98], axis=1)
    out = os.path.join(BUILD, "soundtrack.wav")
    save_wav(out, st, SR, stereo=True)
    print(f"[audio] soundtrack -> {out}  ({total/60:.2f} min)")
    return out


if __name__ == "__main__":
    main()
