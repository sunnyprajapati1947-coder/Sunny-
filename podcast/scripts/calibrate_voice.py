"""calibrate_voice.py — objective checks on the synthesised voice.

Renders isolated vowels and measures where the formant peaks actually land
versus the intended targets, plus the long-term average spectrum balance.
"""
import sys
import numpy as np
from scipy.signal import lfilter, find_peaks

sys.path.insert(0, '.')
import tts_engine as T
import hindi_g2p as G


def smooth_spectrum(x, fs, nfft=4096, lifter=28):
    """Cepstrally smoothed spectrum -> (freqs, dB)."""
    w = np.hanning(len(x))
    S = np.fft.rfft(x * w, nfft)
    mag = np.abs(S) + 1e-12
    logm = np.log(mag)
    ceps = np.fft.irfft(logm)
    ceps[lifter:len(ceps) - lifter + 1] = 0
    env = np.exp(np.fft.rfft(ceps).real)
    f = np.fft.rfftfreq(nfft, 1 / fs)
    return f, 20 * np.log10(env + 1e-12)


def find_formants(env_db, f, fmax=5000, n=4):
    peaks, props = find_peaks(env_db, distance=int(150 / (f[1] - f[0])), prominence=1.5)
    cand = [(f[p], env_db[p]) for p in peaks if f[p] < fmax]
    cand.sort(key=lambda t: t[0])
    out = []
    for fr, db in cand:
        out.append((fr, db))
    # merge peaks closer than 120 Hz
    merged = []
    for fr, db in out:
        if merged and fr - merged[-1][0] < 150:
            if db > merged[-1][1]:
                merged[-1] = (fr, db)
        else:
            merged.append((fr, db))
    return merged[:n]


def band_energy(x, fs, bands):
    f, env = smooth_spectrum(x, fs)
    out = {}
    for lo, hi in bands:
        m = (f >= lo) & (f < hi)
        out[f"{lo}-{hi}"] = float(np.mean(env[m]))
    return out


def render_vowel(v, profile, dur=0.45, f0_st=0.0):
    segs = [T.Segment('phone', phone=v, dur=dur, amp=1.0, f0s=f0_st)]
    r = T.Renderer(profile, seed=3)
    return r.render(segs)


def main():
    prof_name = sys.argv[1] if len(sys.argv) > 1 else 'AARAV'
    prof = getattr(T, prof_name)
    fs = T.FS
    print(f"=== vowel formant check ({prof.name}, f0={prof.f0}) ===")
    err = []
    for v in ['a', 'A', 'i', 'I', 'u', 'U', 'e', 'E', 'o', 'O']:
        x = render_vowel(v, prof)
        seg = x[int(0.12 * fs):int(0.35 * fs)]
        f, env = smooth_spectrum(seg, fs)
        got = find_formants(env, f, fmax=4200, n=4)
        tgt = [prof.scaled(T.VOWELS[v]['f'])[i] for i in range(3)]
        g = [round(p[0]) for p in got[:3]]
        d = [round((g[i] - tgt[i])) if i < len(g) else None for i in range(3)]
        err.append(d[0] if d[0] is not None else 0)
        print(f"  /{v}/  target {[round(t) for t in tgt]}  measured {g}  delta {d}")
    print(f"  mean |F1 err| = {np.mean(np.abs(err)):.0f} Hz")
    print("\n=== long-term spectral balance (dB) ===")
    for v in ['a', 'i', 'u']:
        x = render_vowel(v, prof, 0.5)
        seg = x[int(0.1 * fs):int(0.4 * fs)]
        be = band_energy(seg, fs, [(80, 400), (400, 800), (800, 1600), (1600, 3200), (3200, 6400)])
        print(' ', v, {k: round(val, 1) for k, val in be.items()})


if __name__ == '__main__':
    main()
