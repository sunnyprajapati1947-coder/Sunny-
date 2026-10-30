"""analysis.py — spectrogram / formant inspection for the synthesised voice."""
import sys
import numpy as np
from PIL import Image, ImageDraw

def stft_mag(x, fs, win=512, hop=128):
    w = np.hanning(win)
    n = 1 + max(0, (len(x) - win) // hop)
    S = np.zeros((win // 2 + 1, n))
    for i in range(n):
        seg = x[i * hop:i * hop + win] * w
        S[:, i] = np.abs(np.fft.rfft(seg))
    return S

def spec_image(x, fs, path, fmax=8000, width=None):
    S = stft_mag(x, fs)
    Smax = fmax / (fs / 2) * S.shape[0]
    S = S[:int(Smax)]
    S = 20 * np.log10(S + 1e-6)
    S = np.clip((S + 90) / 90, 0, 1)
    img = (S[::-1] * 255).astype(np.uint8)
    im = Image.fromarray(img).convert("RGB").resize((max(600, S.shape[1] * 4), 420), Image.BILINEAR)
    d = ImageDraw.Draw(im)
    for f in (500, 1000, 2000, 3000, 4000, 6000, 8000):
        y = im.height - int(f / fmax * im.height)
        d.line([(0, y), (im.width, y)], fill=(70, 40, 40), width=1)
        d.text((4, max(0, y - 11)), f"{f//1000 if f>=1000 else f/1000:.1f}k", fill=(200, 160, 60))
    im.save(path)
    return path

def waveform_image(x, fs, path, w=1200, h=160):
    step = max(1, len(x) // w)
    y = x[:step * w].reshape(w, step)
    mx = y.max(axis=1); mn = y.min(axis=1)
    im = Image.new('RGB', (w, h), (18, 18, 20))
    d = ImageDraw.Draw(im)
    mid = h // 2
    for i in range(w):
        d.line([(i, mid - int(mx[i] * mid * 0.95)), (i, mid - int(mn[i] * mid * 0.95))],
               fill=(120, 200, 160))
    im.save(path)
    return path

def formant_check(x, fs, targets, path=None):
    """Print the strongest spectral peaks per short window."""
    from scipy.signal import lfilter
    win = int(0.04 * fs)
    hop = int(0.02 * fs)
    out = []
    for s in range(0, len(x) - win, hop):
        seg = x[s:s + win] * np.hanning(win)
        if np.sqrt(np.mean(seg ** 2)) < 0.01:
            continue
        S = np.abs(np.fft.rfft(seg, 2048))
        # cepstral-lite smoothing
        S = np.convolve(S, np.ones(5) / 5, mode='same')
        f = np.fft.rfftfreq(2048, 1 / fs)
        idx = [int(np.argmin(np.abs(f - t))) for t in targets]
        got = []
        for i0, t in zip(idx, targets):
            lo, hi = max(0, i0 - int(120 / (fs / 2048))), min(len(S), i0 + int(120 / (fs / 2048)))
            got.append(float(f[lo + int(np.argmax(S[lo:hi]))]))
        out.append(got)
    return np.array(out)

if __name__ == '__main__':
    from scipy.io import wavfile
    fs, x = wavfile.read(sys.argv[1])
    x = x.astype(np.float64) / 32768.0
    spec_image(x, fs, '/tmp/spec.png')
    waveform_image(x, fs, '/tmp/wave.png')
    print('dur %.2fs  rms %.4f  peak %.3f' % (len(x) / fs, np.sqrt(np.mean(x**2)), np.max(np.abs(x))))
