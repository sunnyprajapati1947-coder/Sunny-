"""
voicelab.py — voice-character processing.

The two registered neural voices come from the same family and, measured over
the whole episode, sit only ~0.3 semitones apart in median pitch — too close
for two hosts that must be instantly distinguishable.  A small pitch *and*
formant shift (which is what actually changes a perceived speaker identity,
like moving a vocal tract forward or back) fixes that without touching timing,
so the lip-sync and the camera plan stay valid.

    R (younger, brighter)   +2.8 semitones
    A (older, darker)       -1.5 semitones

Implemented as resample -> phase-vocoder time-stretch, i.e. a classic
pitch/formant shifter.  The shift is deliberately small: bigger shifts start to
sound like a different person entirely.
"""
from __future__ import annotations

import numpy as np


def _stft(x, nfft=1024, hop=256):
    win = np.hanning(nfft).astype(np.float32)
    n = 1 + max(0, (len(x) - nfft) // hop)
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    frames = x[idx] * win
    return np.fft.rfft(frames, axis=1), win, n


def _istft(S, win, hop, length):
    nfft = (S.shape[1] - 1) * 2
    frames = np.fft.irfft(S, nfft, axis=1).astype(np.float32) * win
    out = np.zeros(length + nfft, dtype=np.float32)
    wsum = np.zeros(length + nfft, dtype=np.float32)
    for i in range(len(frames)):
        s = i * hop
        out[s:s + nfft] += frames[i]
        wsum[s:s + nfft] += win ** 2
    out /= np.maximum(wsum, 1e-6)
    return out[:length]


def time_stretch(x, rate, nfft=1024, hop=256):
    """Phase-vocoder time stretch.  rate > 1 -> longer."""
    if abs(rate - 1.0) < 1e-4:
        return x
    S, win, n = _stft(x, nfft, hop)
    nbins = S.shape[1]
    freqs = np.arange(nbins) * (2 * np.pi * hop / nfft)      # expected phase advance
    out_hop = max(1, int(round(hop * rate)))
    alpha = out_hop / hop
    target_len = int(len(x) * rate)
    out = np.zeros(target_len + nfft, dtype=np.float32)
    phase = np.angle(S[0])
    wsum = np.zeros(target_len + nfft, dtype=np.float32)
    win_ = win
    for i in range(n):
        mag = np.abs(S[i])
        if i > 0:
            dphi = np.angle(S[i]) - np.angle(S[i - 1]) - freqs
            dphi = np.mod(dphi + np.pi, 2 * np.pi) - np.pi
            # scale the phase increment by the stretch factor, otherwise the
            # vocoder silently resamples (and cancels the pitch shift)
            phase = phase + (freqs + dphi) * alpha
        spec = mag * np.exp(1j * phase)
        frame = np.fft.irfft(spec, nfft).astype(np.float32) * win_
        s = i * out_hop
        if s + nfft >= len(out):
            break
        out[s:s + nfft] += frame
        wsum[s:s + nfft] += win_ ** 2
    out /= np.maximum(wsum, 1e-6)
    return out[:target_len].real.astype(np.float32)


def pitch_shift(x, semitones):
    """Shift pitch *and* formants by `semitones`, keeping duration."""
    if abs(semitones) < 1e-3:
        return x
    k = 2.0 ** (semitones / 12.0)
    # 1) resample: duration / k, pitch * k, formants * k
    n_src = len(x)
    n_new = max(8, int(round(n_src / k)))
    y = np.interp(np.linspace(0, n_src - 1, n_new), np.arange(n_src), x).astype(np.float32)
    # 2) stretch back to the original length: duration restored, pitch/formants stay shifted
    y = time_stretch(y, rate=n_src / n_new)
    if len(y) < n_src:
        y = np.pad(y, (0, n_src - len(y)))
    return y[:n_src]


# Character targets, in semitones relative to the raw neural voice.
SHIFT = {'A': -1.5, 'R': +2.8}

if __name__ == '__main__':
    import sys
    from scipy.io import wavfile
    fs, x = wavfile.read(sys.argv[1])
    x = x.astype(np.float32) / 32768.0
    if x.ndim > 1:
        x = x.mean(axis=1)
    who = sys.argv[2] if len(sys.argv) > 2 else 'R'
    y = pitch_shift(x, SHIFT[who])
    wavfile.write(sys.argv[1].replace('.wav', f'_shift{who}.wav'), fs,
                  (np.clip(y, -1, 1) * 32767).astype(np.int16))
    print(f'{len(x)/fs:.2f}s -> {len(y)/fs:.2f}s  shift {SHIFT[who]:+.1f} st')
