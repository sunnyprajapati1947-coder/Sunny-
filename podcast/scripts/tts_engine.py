"""
tts_engine.py — an additive/formant ("Klatt-style") speech synthesiser tuned for Hindi.

Why hand-built: the sandbox has no GPU and no network access to a cloud TTS
service, so the voice has to be *synthesised*, not sampled.  A source-filter
formant synthesiser gives us full control over every acoustic cue that makes
speech sound human -- F0 contour, jitter, shimmer, formant transitions,
aspiration, voice quality -- which is exactly what a black-box TTS hides.

Signal chain
    glottal derivative (Rosenberg / LF-like)  +  aspiration noise
        -> cascade of 4-5 formant resonators (Klatt)
        -> nasal branch, fricative/stop noise branches (parallel)
        -> lip radiation, spectral tilt
"""
from __future__ import annotations

import math
import numpy as np

FS = 24000          # synthesis rate
FRAME = 120         # 5 ms frame -> filter coefficients updated every 5 ms
NFRAME_RATE = FS / FRAME

# --------------------------------------------------------------------------
#  Phoneme inventory
# --------------------------------------------------------------------------
# formants are (F1, F2, F3, F4) in Hz for an adult male vocal tract
VOWELS = {
    'a':  dict(f=(700, 1120, 2450, 3400), dur=1.30, lo=1.00),   # आ  (open back)
    'A':  dict(f=(620, 1200, 2500, 3400), dur=0.90, lo=1.00),   # अ  (schwa)
    'i':  dict(f=(390, 2100, 2650, 3500), dur=0.85, lo=1.00),   # इ
    'I':  dict(f=(320, 2250, 2900, 3600), dur=1.18, lo=1.05),   # ई
    'u':  dict(f=(430,  800, 2400, 3350), dur=0.85, lo=1.00),   # उ
    'U':  dict(f=(340,  820, 2500, 3400), dur=1.18, lo=1.05),   # ऊ
    'e':  dict(f=(470, 1880, 2560, 3450), dur=1.12, lo=1.00),   # ए
    'E':  dict(f=(580, 1780, 2500, 3400), dur=1.18, lo=1.00),   # ऐ
    'o':  dict(f=(470,  880, 2450, 3400), dur=1.12, lo=1.00),   # ओ
    'O':  dict(f=(580,  960, 2500, 3400), dur=1.18, lo=1.00),   # औ
    'rI': dict(f=(480, 1400, 1950, 3300), dur=1.00, lo=1.00),   # ऋ
}

# stop places -> (burst centre Hz, burst BW, locus F2 for transitions)
PLACES = {
    'labial':    dict(burst=900,  bw=900,  f2loc=800),
    'dental':    dict(burst=4200, bw=2200, f2loc=1700),
    'retroflex': dict(burst=2600, bw=1700, f2loc=1750),
    'palatal':   dict(burst=3000, bw=1900, f2loc=2200),
    'velar':     dict(burst=1900, bw=1100, f2loc=1500),
}

CONSONANTS = {
    # ---- stops -----------------------------------------------------------
    'k':  dict(kind='stop', place='velar',    voiced=0, asp=0),
    'kh': dict(kind='stop', place='velar',    voiced=0, asp=1),
    'g':  dict(kind='stop', place='velar',    voiced=1, asp=0),
    'gh': dict(kind='stop', place='velar',    voiced=1, asp=1),
    'c':  dict(kind='affr', place='palatal',  voiced=0, asp=0),
    'ch': dict(kind='affr', place='palatal',  voiced=0, asp=1),
    'j':  dict(kind='affr', place='palatal',  voiced=1, asp=0),
    'jh': dict(kind='affr', place='palatal',  voiced=1, asp=1),
    'T':  dict(kind='stop', place='retroflex', voiced=0, asp=0),
    'Th': dict(kind='stop', place='retroflex', voiced=0, asp=1),
    'D':  dict(kind='stop', place='retroflex', voiced=1, asp=0),
    'Dh': dict(kind='stop', place='retroflex', voiced=1, asp=1),
    't':  dict(kind='stop', place='dental',   voiced=0, asp=0),
    'th': dict(kind='stop', place='dental',   voiced=0, asp=1),
    'd':  dict(kind='stop', place='dental',   voiced=1, asp=0),
    'dh': dict(kind='stop', place='dental',   voiced=1, asp=1),
    'p':  dict(kind='stop', place='labial',   voiced=0, asp=0),
    'ph': dict(kind='stop', place='labial',   voiced=0, asp=1),
    'b':  dict(kind='stop', place='labial',   voiced=1, asp=0),
    'bh': dict(kind='stop', place='labial',   voiced=1, asp=1),
    # ---- affricates as their own phone symbols ----------------------------
    'C':  dict(kind='affr', place='palatal',  voiced=0, asp=0),
    'Ch': dict(kind='affr', place='palatal',  voiced=0, asp=1),
    'J':  dict(kind='affr', place='palatal',  voiced=1, asp=0),
    'Jh': dict(kind='affr', place='palatal',  voiced=1, asp=1),
    # ---- nasals ----------------------------------------------------------
    'm':  dict(kind='nasal', f=(280, 1000, 2200, 3200), dur=1.0),
    'n':  dict(kind='nasal', f=(280, 1500, 2400, 3300), dur=1.0),
    'N':  dict(kind='nasal', f=(280, 1300, 2400, 3300), dur=1.0),
    'q':  dict(kind='nasalvowel'),        # anunasika murmur on the vowel
    # ---- liquids / glides ------------------------------------------------
    'l':  dict(kind='liquid', f=(360, 1050, 2900, 3400), dur=0.85),
    'r':  dict(kind='tap',   f=(400, 1300, 2400, 3300), dur=0.55),
    'R':  dict(kind='flap',  f=(420, 1400, 2100, 3300), dur=0.55),
    'Rh': dict(kind='flap',  f=(420, 1400, 2100, 3300), dur=0.6, breathy=1),
    'v':  dict(kind='glide', f=(320,  820, 2300, 3300), dur=0.75),
    'y':  dict(kind='glide', f=(300, 2100, 2800, 3500), dur=0.75),
    # ---- fricatives ------------------------------------------------------
    's':  dict(kind='fric', f=(500, 1800, 4200, 6500), nf=5200, nbw=2600, namp=0.55),
    'S':  dict(kind='fric', f=(500, 1700, 2600, 5000), nf=3000, nbw=2400, namp=0.50),
    'f':  dict(kind='fric', f=(400, 1200, 2400, 4200), nf=2600, nbw=2800, namp=0.22),
    'z':  dict(kind='fric', f=(400, 1500, 3600, 6000), nf=4800, nbw=2600, namp=0.38, voiced=1),
    'x':  dict(kind='fric', f=(500, 1400, 2400, 3600), nf=1800, nbw=1500, namp=0.30),
    'G':  dict(kind='fric', f=(480, 1200, 2300, 3400), nf=1900, nbw=1400, namp=0.20, voiced=1),
    'qf': dict(kind='stop', place='velar', voiced=0, asp=0),
    'h':  dict(kind='asp',  f=(500, 1500, 2500, 3400)),
}

VOWEL_SET = set(VOWELS)
LONG = {'a', 'I', 'U', 'e', 'E', 'o', 'O'}


# --------------------------------------------------------------------------
#  Voice profiles
# --------------------------------------------------------------------------
class VoiceProfile:
    """Everything that makes one speaker's voice *that* speaker's voice."""

    def __init__(self, name, f0=112.0, f0_range=1.0, formant_scale=1.0,
                 rate=1.0, breath=0.10, tilt=0.55, jitter=0.006, shimmer=0.05,
                 grain=0.35, contrast=1.0, pitch_offset_st=0.0, creak=0.15,
                 micro_amp=0.18, brightness=1.0):
        self.name = name
        self.f0 = f0                       # base pitch, Hz
        self.f0_range = f0_range           # melodic range multiplier
        self.formant_scale = formant_scale  # vocal tract length
        self.rate = rate
        self.breath = breath               # aspiration mixed into the source
        self.tilt = tilt                   # glottal spectral tilt (0 bright .. 1 dark)
        self.jitter = jitter
        self.shimmer = shimmer
        self.grain = grain                 # roughness / subharmonic content
        self.contrast = contrast           # consonant-vowel amplitude contrast
        self.pitch_offset_st = pitch_offset_st
        self.creak = creak
        self.micro_amp = micro_amp
        self.brightness = brightness

    def scaled(self, f):
        return tuple(x * self.formant_scale for x in f)


# Host 1 — Aarav: confident, relaxed, sarcastic. Darker, slower, slightly lower.
AARAV = VoiceProfile(
    name='Aarav', f0=104.0, f0_range=1.00, formant_scale=1.035, rate=0.94,
    breath=0.085, tilt=0.62, jitter=0.0055, shimmer=0.045, grain=0.30,
    contrast=1.00, pitch_offset_st=-0.5, creak=0.22, micro_amp=0.15,
    brightness=0.92,
)
# Host 2 — Rohan: energetic, argumentative, funny. Brighter, higher, faster.
ROHAN = VoiceProfile(
    name='Rohan', f0=137.0, f0_range=1.34, formant_scale=0.962, rate=1.10,
    breath=0.150, tilt=0.44, jitter=0.0085, shimmer=0.075, grain=0.45,
    contrast=1.10, pitch_offset_st=0.6, creak=0.06, micro_amp=0.26,
    brightness=1.10,
)


# --------------------------------------------------------------------------
#  Small DSP helpers
# --------------------------------------------------------------------------
def resonator(f, bw, fs=FS):
    r = math.exp(-math.pi * bw / fs)
    b1 = 2.0 * r * math.cos(2.0 * math.pi * f / fs)
    b2 = -r * r
    a0 = 1.0 - b1 - b2
    return a0, b1, b2


def run_resonator(x, state, f, bw, fs=FS):
    """2-pole resonator with persistent state -> returns (y, state)."""
    from scipy.signal import lfilter
    a0, b1, b2 = resonator(f, bw, fs)
    y, zf = lfilter([a0], [1.0, -b1, -b2], x, zi=state)
    return y, zf


def moving_average(x, w):
    if w <= 1:
        return x
    k = np.ones(w) / w
    return np.convolve(x, k, mode='same')


def hz_to_st(x):
    return 12.0 * np.log2(np.maximum(x, 1e-3) / 1.0)


# --------------------------------------------------------------------------
#  Planning: text -> timed phone plan with prosody targets
# --------------------------------------------------------------------------
class Segment:
    """One rendering unit.  type: phone | pause | breath | laugh | noise"""
    __slots__ = ('kind', 'phone', 'dur', 'amp', 'f0s', 'stressed', 'final',
                 'stress', 'pitch', 'vowel', 'onset', 'coda', 'word_idx')

    def __init__(self, kind, **kw):
        self.kind = kind
        self.phone = kw.get('phone', '')
        self.dur = kw.get('dur', 0.08)
        self.amp = kw.get('amp', 1.0)
        self.f0s = kw.get('f0s', 0.0)        # semitone offset from speaker base
        self.stress = kw.get('stress', 0.0)
        self.final = kw.get('final', False)
        self.pitch = kw.get('pitch', 0.0)
        self.vowel = kw.get('vowel', None)
        self.word_idx = kw.get('word_idx', 0)


def _is_vowel(p):
    return p in VOWEL_SET


def syllabify(phones):
    """Group a flat phone list into (onset, nucleus, coda) syllables."""
    syls = []
    i = 0
    n = len(phones)
    while i < n:
        # collect onset
        onset = []
        while i < n and not _is_vowel(phones[i]):
            onset.append(phones[i])
            i += 1
        nucleus = None
        if i < n and _is_vowel(phones[i]):
            nucleus = phones[i]
            i += 1
        coda = []
        # coda: consonants up to the next onset (all but last consonant before next vowel)
        while i < n and not _is_vowel(phones[i]):
            coda.append(phones[i])
            i += 1
        if nucleus is None and not onset:
            break
        if nucleus is None and coda:      # trailing consonants with no vowel
            syls.append((onset, None, coda))
            break
        if nucleus is None:               # consonants that belong to next syllable
            if syls:
                syls[-1] = (syls[-1][0], syls[-1][1], syls[-1][2] + onset)
            elif onset:
                syls.append((onset, None, []))
            continue
        # move one coda consonant to the next onset when it can be a valid onset
        syls.append((onset, nucleus, coda))
    # rebalance codas: a single consonant between two vowels is an onset
    out = []
    for idx, (o, nu, c) in enumerate(syls):
        if len(c) > 1 and idx + 1 < len(syls):
            moved = c[-1]
            c = c[:-1]
            nxt = syls[idx + 1]
            syls[idx + 1] = ([moved] + nxt[0], nxt[1], nxt[2])
        out.append((o, nu, c))
    return out


def base_phone_duration(p, profile, long_word=False):
    """Intrinsic phone duration in seconds before prosodic lengthening."""
    if p in VOWELS:
        d = 0.088 * VOWELS[p]['dur']
    elif p in CONSONANTS:
        c = CONSONANTS[p]
        k = c['kind']
        if k == 'stop':
            d = 0.058 + 0.028 * c['asp'] + (0.012 if c['voiced'] else 0.0)
        elif k == 'affr':
            d = 0.082 + 0.034 * c['asp']
        elif k == 'nasal':
            d = 0.062
        elif k == 'nasalvowel':
            d = 0.045
        elif k == 'liquid':
            d = 0.055
        elif k in ('tap', 'flap'):
            d = 0.034
        elif k == 'glide':
            d = 0.050
        elif k == 'fric':
            d = 0.080 if p in ('s', 'S', 'z') else 0.066
        elif k == 'asp':
            d = 0.070
        else:
            d = 0.06
    else:
        d = 0.06
    return d / profile.rate


def plan_utterance(text, profile, phones, words, style=None,
                   seed=0, base_f0_st=0.0):
    """Build the timed segment list for one line of dialogue."""
    style = style or {}
    rng = np.random.default_rng(seed)
    syls = syllabify(phones)
    if not syls:
        return []

    segs = []
    n_syl = len(syls)
    # ---- prosodic structure ------------------------------------------
    accent_rate = style.get('accent', 0.55)
    utterance_len = n_syl
    # word boundary set (phone index)
    word_ends = {w['end'] - 1 for w in words}
    word_start_punct = {w['start']: w.get('punct', '') for w in words}
    word_end_punct = {w['end'] - 1: w.get('punct', '') for w in words}

    idx = 0
    phone_pos = {}
    for o, nu, c in syls:
        for p in o + ([nu] if nu else []) + c:
            phone_pos.setdefault(p, []).append(idx)
            idx += 1

    f0_profile = style.get('f0', 'declining')
    final_rise = style.get('final_rise', False)
    energy = style.get('energy', 1.0)

    # decide which syllables are stressed: roughly one per content word,
    # prefer the first or penultimate syllable.
    stress_flags = [0.0] * n_syl
    syl_of_phone = {}
    k = 0
    for si, (o, nu, c) in enumerate(syls):
        for p in o + ([nu] if nu else []) + c:
            syl_of_phone[k] = si
            k += 1
    # walk words, pick the strongest syllable inside each
    cur_word = 0
    for wi, w in enumerate(words):
        if w['end'] <= w['start']:
            continue
        cand = [syl_of_phone.get(pi, 0) for pi in range(w['start'], min(w['end'], len(phones)))]
        if not cand:
            continue
        # prefer a long vowel syllable, else the first
        best = cand[0]
        for ci in cand:
            nu = syls[ci][1]
            if nu in LONG:
                best = ci
                break
        if rng.random() < accent_rate:
            stress_flags[best] = max(stress_flags[best], 1.0)
        # secondary stress on the following syllable sometimes
        if best + 1 < n_syl and rng.random() < 0.25:
            stress_flags[best + 1] = max(stress_flags[best + 1], 0.45)

    # ---- generate segments -------------------------------------------
    total_planned = 0.0
    for si, (o, nu, c) in enumerate(syls):
        frac = si / max(n_syl - 1, 1)
        is_final_syl = si == n_syl - 1
        # declination + phrase-final lowering
        if f0_profile == 'declining':
            decl = -2.1 * frac
        elif f0_profile == 'rising':
            decl = 1.2 * frac
        elif f0_profile == 'flat':
            decl = -0.4 * frac
        else:
            decl = -1.0 * frac
        stress = stress_flags[si]
        acc = 0.0
        if stress > 0:
            acc = (2.4 + 1.6 * rng.random()) * profile.f0_range * stress
        # accent shape: peak on the nucleus, dip after
        fin = -4.2 * profile.f0_range * (frac ** 3) if is_final_syl else 0.0
        if is_final_syl and final_rise:
            fin = 3.4 * profile.f0_range
        smile = 0.35 * math.sin(math.pi * frac)   # gentle mid-phrase lift
        base_st = (decl + acc + fin + smile) * energy + base_f0_st

        # consonant onset(s)
        for p in o:
            d = base_phone_duration(p, profile)
            segs.append(Segment('phone', phone=p, dur=d,
                                amp=1.0, f0s=base_st, stress=stress))
        # nucleus (with optional lengthening)
        if nu:
            d = base_phone_duration(nu, profile)
            if stress > 0:
                d *= 1.0 + 0.22 * stress
            if is_final_syl:
                d *= 1.16
            segs.append(Segment('phone', phone=nu, dur=d, amp=1.0,
                                f0s=base_st + 0.8 * stress, stress=stress,
                                vowel=nu))
        # coda
        for ci, p in enumerate(c):
            d = base_phone_duration(p, profile)
            if ci == len(c) - 1 and is_final_syl:
                d *= 1.1
            segs.append(Segment('phone', phone=p, dur=d, amp=0.96,
                                f0s=base_st * 0.7, stress=stress * 0.5))
        total_planned += 0.0

    # ---- insert pauses at word boundaries -----------------------------
    # rebuild the segment list walked in phone order with pauses interleaved
    out = []
    pidx = 0
    for si, sg in enumerate(segs):
        out.append(sg)
    # map phone index -> segment index
    seg_of_phone = []
    for i, sg in enumerate(out):
        seg_of_phone.append(i)

    timed = []
    for pi, sg in enumerate(out):
        punct = word_end_punct.get(pi, '')
        timed.append(sg)
        if punct or pi in word_ends:
            gap = 0.0
            if pi in word_ends:
                gap += 0.016 + 0.010 * rng.random()
            if any(ch in punct for ch in ',،'):
                gap += 0.13 + 0.05 * rng.random()
            if any(ch in punct for ch in '।!?'):
                gap += 0.17 + 0.06 * rng.random()
            if any(ch in punct for ch in '…'):
                gap += 0.28
            if gap > 0.005:
                timed.append(Segment('pause', dur=gap))
    return timed, syls


# --------------------------------------------------------------------------
#  Renderer
# --------------------------------------------------------------------------
class Renderer:
    def __init__(self, profile: VoiceProfile, seed=0):
        self.p = profile
        self.rng = np.random.default_rng(seed)

    # -- parameter tracks ------------------------------------------------
    def _tracks(self, segs, f0_extra=0.0, gain=1.0):
        n = int(sum(s.dur for s in segs) * FS) + 1
        nf = int(math.ceil(n / FRAME)) + 2
        F1 = np.zeros(nf); F2 = np.zeros(nf); F3 = np.zeros(nf); F4 = np.zeros(nf)
        B1 = np.full(nf, 70.0); B2 = np.full(nf, 100.0)
        B3 = np.full(nf, 160.0); B4 = np.full(nf, 250.0)
        amp = np.zeros(nf)
        f0 = np.full(nf, self.p.f0)
        asp = np.zeros(nf)          # aspiration noise amount (source)
        fric = np.zeros(nf)         # fricative noise amount (parallel)
        fric_f = np.full(nf, 4000.0)
        fric_bw = np.full(nf, 2000.0)
        nasal = np.zeros(nf)
        burst = np.zeros(nf)
        burst_f = np.full(nf, 2000.0)

        default_f = VOWELS['A']['f']
        cur = list(self.p.scaled(default_f)) + [self.p.f0]
        i = 0
        for s in segs:
            nfr = max(1, int(round(s.dur * NFRAME_RATE)))
            if s.kind != 'phone':
                for k in range(nfr):
                    if i + k < nf:
                        amp[i + k] = 0.0
                        F1[i + k], F2[i + k], F3[i + k], F4[i + k] = cur[:4]
                i += nfr
                continue
            ph = s.phone
            if ph in VOWELS:
                f = self.p.scaled(VOWELS[ph]['f'])
                tgt = list(f) + [self.p.f0 * (2 ** (s.f0s / 12.0))]
                for k in range(nfr):
                    if i + k >= nf:
                        break
                    w = min(1.0, (k + 1) / max(2, int(nfr * 0.45)))
                    F1[i + k] = cur[0] + (tgt[0] - cur[0]) * w
                    F2[i + k] = cur[1] + (tgt[1] - cur[1]) * w
                    F3[i + k] = cur[2] + (tgt[2] - cur[2]) * w
                    F4[i + k] = cur[3] + (tgt[3] - cur[3]) * w
                    amp[i + k] = 1.0 * s.amp * gain
                    b = self.p.scaled(VOWELS[ph]['f'])
                    B1[i + k] = 65 + 22 * self.p.breath * 10
                    B2[i + k] = 95
                    B3[i + k] = 165
                    f0[i + k] = tgt[4]
                cur = tgt
            elif ph in CONSONANTS:
                c = CONSONANTS[ph]
                kd = c['kind']
                if kd in ('nasal', 'liquid', 'glide', 'tap', 'flap'):
                    f = self.p.scaled(c['f'])
                    tgt = list(f) + [cur[4] * 0.98]
                    for k in range(nfr):
                        if i + k >= nf:
                            break
                        w = min(1.0, (k + 1) / max(2, int(nfr * 0.5)))
                        F1[i + k] = cur[0] + (tgt[0] - cur[0]) * w
                        F2[i + k] = cur[1] + (tgt[1] - cur[1]) * w
                        F3[i + k] = cur[2] + (tgt[2] - cur[2]) * w
                        F4[i + k] = cur[3] + (tgt[3] - cur[3]) * w
                        a = 0.62 if kd == 'nasal' else 0.86
                        if kd in ('tap', 'flap'):
                            # brief closure in the middle of the segment
                            mid = nfr * 0.45
                            a *= 0.10 if abs(k - mid) < max(1, nfr * 0.18) else 0.95
                        amp[i + k] = a * s.amp * gain
                        B1[i + k] = 120 if kd == 'nasal' else 80
                        nasal[i + k] = 0.75 if kd == 'nasal' else 0.0
                        f0[i + k] = cur[4]
                    cur = tgt
                elif kd == 'stop':
                    pl = PLACES[c['place']]
                    f = self.p.scaled((280, pl['f2loc'], 2300, 3300))
                    ncls = max(1, int(nfr * (0.55 if not c['voiced'] else 0.45)))
                    for k in range(nfr):
                        if i + k >= nf:
                            break
                        if k < ncls:                     # closure
                            amp[i + k] = 0.0
                            if c['voiced']:
                                amp[i + k] = 0.05        # voice bar
                            F1[i + k], F2[i + k] = 250, pl['f2loc']
                            F3[i + k], F4[i + k] = 2300, 3300
                        else:
                            rel = k - ncls
                            amp[i + k] = 0.55 * s.amp * gain if rel < nfr * 0.35 else 0.9 * s.amp * gain
                            F1[i + k], F2[i + k] = f[0], f[1]
                            F3[i + k], F4[i + k] = f[2], f[3]
                        burst[i + k] = 1.0 if k == ncls else (0.45 if ncls < k < ncls + 2 else 0.0)
                        burst_f[i + k] = pl['burst']
                        asp[i + k] = (0.55 if c['asp'] else 0.10) * (1.0 if k >= ncls else 0.0)
                        if c['voiced']:
                            asp[i + k] *= 0.5
                        f0[i + k] = cur[4]
                    cur = list(f) + [cur[4]]
                elif kd == 'affr':
                    pl = PLACES[c['place']]
                    f = self.p.scaled((300, pl['f2loc'], 2500, 3400))
                    ncls = max(1, int(nfr * 0.35))
                    for k in range(nfr):
                        if i + k >= nf:
                            break
                        if k < ncls:
                            amp[i + k] = 0.0
                            if c['voiced']:
                                amp[i + k] = 0.05
                        else:
                            amp[i + k] = 0.55 * s.amp * gain
                        F1[i + k], F2[i + k] = f[0], f[1]
                        F3[i + k], F4[i + k] = f[2], f[3]
                        if k >= ncls:
                            fric[i + k] = 0.62 if not c['voiced'] else 0.34
                            fric_f[i + k] = pl['burst'] * 1.35
                            fric_bw[i + k] = pl['bw'] * 0.95
                        burst[i + k] = 0.7 if k == ncls else 0.0
                        burst_f[i + k] = pl['burst']
                        f0[i + k] = cur[4]
                    cur = list(f) + [cur[4]]
                elif kd == 'fric':
                    f = self.p.scaled(c['f'])
                    for k in range(nfr):
                        if i + k >= nf:
                            break
                        amp[i + k] = (0.30 if c.get('voiced') else 0.08) * s.amp * gain
                        F1[i + k], F2[i + k] = f[0], f[1]
                        F3[i + k], F4[i + k] = f[2], f[3]
                        fric[i + k] = c['namp'] * s.amp
                        fric_f[i + k] = c['nf']
                        fric_bw[i + k] = c['nbw']
                        f0[i + k] = cur[4]
                    cur = list(f) + [cur[4]]
                elif kd == 'asp':
                    f = self.p.scaled(c['f'])
                    for k in range(nfr):
                        if i + k >= nf:
                            break
                        amp[i + k] = 0.05 * s.amp
                        F1[i + k], F2[i + k] = cur[0], cur[1]
                        F3[i + k], F4[i + k] = cur[2], cur[3]
                        asp[i + k] = 0.9 * s.amp
                        f0[i + k] = cur[4]
                    cur = list(cur)
                else:
                    for k in range(nfr):
                        if i + k < nf:
                            amp[i + k] = 0.0
            else:
                for k in range(nfr):
                    if i + k < nf:
                        amp[i + k] = 0.0
            i += nfr

        # nasalised vowels: 'q' handled by caller via nasal flag on vowel
        sm = max(2, int(0.012 * NFRAME_RATE))
        for arr in (F1, F2, F3, F4):
            arr[:] = np.convolve(arr, np.ones(sm) / sm, mode='same')
        F1[:] = np.clip(F1, 180, 1100)
        F2[:] = np.clip(F2, 550, 2900)
        F3[:] = np.clip(F3, 1500, 3600)
        F4[:] = np.clip(F4, 2800, 4400)
        return dict(n=n, nf=nf, F1=F1, F2=F2, F3=F3, F4=F4, B1=B1, B2=B2, B3=B3,
                    B4=B4, amp=amp, f0=f0, asp=asp, fric=fric, fric_f=fric_f,
                    fric_bw=fric_bw, burst=burst, burst_f=burst_f, nasal=nasal)

    # -- synthesis --------------------------------------------------------
    def render(self, segs, gain=1.0, f0_extra_st=0.0,
               tilt_override=None, breath_override=None):
        T = self._tracks(segs, gain=gain)
        n, nf = T['n'], T['nf']
        p = self.p
        out = np.zeros(n, dtype=np.float64)

        # ---- glottal source ------------------------------------------
        src = np.zeros(n, dtype=np.float64)
        # smooth the f0 track to frame grid and expand
        f0f = T['f0'] * (2.0 ** (f0_extra_st / 12.0))
        # micro-prosody: random-walk pitch jitter (0.3-2 Hz)
        walk = np.cumsum(self.rng.normal(0, 1, nf))
        walk = walk - moving_average(walk, 60)
        walk = walk / (np.std(walk) + 1e-9)
        f0f = f0f * (2.0 ** (walk * 0.055 * p.f0_range / 12.0))
        f0f = np.clip(f0f, 55, 420)
        ph = 0.0
        Tp, Tn = 0.42, 0.17
        for fr in range(nf - 1):
            s0 = fr * FRAME
            s1 = min(n, s0 + FRAME)
            if s1 <= s0:
                continue
            ns = s1 - s0
            f = f0f[fr]
            # jitter: period perturbation per cycle
            jit = 1.0 + self.rng.normal(0, p.jitter)
            inc = (f * jit) / FS
            phase = (ph + np.arange(ns) * inc) % 1.0
            ph = (ph + ns * inc) % 1.0
            x = np.zeros(ns)
            m1 = phase < Tp
            x[m1] = 0.5 * (math.pi / Tp) * np.sin(math.pi * phase[m1] / Tp)
            m2 = (phase >= Tp) & (phase < Tp + Tn)
            x[m2] = -(math.pi / (2 * Tn)) * np.sin(math.pi * (phase[m2] - Tp) / (2 * Tn))
            # amplitude jitter (shimmer) + optional grain/subharmonic
            x *= 1.0 + self.rng.normal(0, p.shimmer) * 0.35
            if p.grain > 0:
                gr = 0.5 + 0.5 * np.sin(2 * np.pi * phase * 0.5 + self.rng.uniform(0, 6.28))
                x *= (1 - p.grain * 0.10 * gr)
            src[s0:s1] = x * T['amp'][fr]

        # ---- aspiration / breath noise --------------------------------
        breath = p.breath if breath_override is None else breath_override
        noise = self.rng.normal(0, 1, n)
        aspenv = np.repeat(T['asp'] + T['amp'] * breath * 0.55, FRAME)[:n]
        aspenv = np.convolve(aspenv, np.ones(int(0.006 * FS)) / max(1, int(0.006 * FS)), mode='same')
        aspn = noise * aspenv * 0.55

        exc = src + aspn

        # ---- cascade vocal tract -------------------------------------
        # NOTE: every resonator owns its state.  Sharing one state vector
        # across the cascade turns the chain into a delay-line feedback loop
        # that slowly goes unstable.
        from scipy.signal import lfilter
        y = exc
        zi1, zi2, zi3, zi4 = (np.zeros(2) for _ in range(4))
        tilt_lp = math.exp(-2 * math.pi * (2600 * (1 - p.tilt * 0.35)) / FS)
        prev = 0.0
        for fr in range(nf - 1):
            s0 = fr * FRAME
            s1 = min(n, s0 + FRAME)
            if s1 <= s0:
                continue
            blk = y[s0:s1]
            for stage, (F, B) in enumerate(((T['F1'][fr], T['B1'][fr]),
                                            (T['F2'][fr], T['B2'][fr]),
                                            (T['F3'][fr], T['B3'][fr]),
                                            (T['F4'][fr], T['B4'][fr]))):
                if F <= 0 or F >= FS / 2:
                    continue
                if stage == 0:
                    blk, zi1 = run_resonator(blk, zi1, F, B)
                elif stage == 1:
                    blk, zi2 = run_resonator(blk, zi2, F, B)
                elif stage == 2:
                    blk, zi3 = run_resonator(blk, zi3, F, B)
                else:
                    blk, zi4 = run_resonator(blk, zi4, F, B)
            # spectral tilt: one-pole low-pass mixed with the raw signal
            out_lp = np.empty_like(blk)
            acc = prev
            a = 1 - tilt_lp
            for k in range(len(blk)):
                acc = acc * tilt_lp + blk[k] * a
                out_lp[k] = acc
            prev = acc
            blk = blk * (1 - p.tilt) + out_lp * p.tilt * 1.9
            out[s0:s1] = blk

        # ---- nasal branch (parallel resonance for murmur / nasal vowels)
        nasal_env = np.repeat(T['nasal'], FRAME)[:n]
        if np.max(nasal_env) > 0.01:
            y2 = np.zeros(n)
            zi2 = np.zeros(2)
            for fr in range(nf - 1):
                s0 = fr * FRAME
                s1 = min(n, s0 + FRAME)
                if s1 <= s0:
                    continue
                blk = out[s0:s1]
                b2, zi2 = run_resonator(blk, zi2, 270 * p.formant_scale, 90)
                y2[s0:s1] = b2
            out = out + y2 * nasal_env * 0.55

        # ---- fricative noise (parallel) -------------------------------
        fric_env = np.repeat(T['fric'], FRAME)[:n]
        if np.max(fric_env) > 0.01:
            nz = self.rng.normal(0, 1, n)
            nz = np.convolve(nz, np.ones(3) / 3, mode='same')
            fz = np.zeros(n)
            zif = np.zeros(2)
            for fr in range(nf - 1):
                s0 = fr * FRAME
                s1 = min(n, s0 + FRAME)
                if s1 <= s0:
                    continue
                blk = nz[s0:s1]
                fb, zif = run_resonator(blk, zif, T['fric_f'][fr], T['fric_bw'][fr])
                fz[s0:s1] = fb
            # high-pass the fricative band so it does not muddy the low end
            fz = fz - np.convolve(fz, np.ones(9) / 9, mode='same')
            out = out + fz * fric_env * 1.35

        # ---- stop bursts ----------------------------------------------
        burst = np.repeat(T['burst'], FRAME)[:n]
        if np.max(burst) > 0.01:
            nz = self.rng.normal(0, 1, n)
            bz = np.zeros(n)
            zib = np.zeros(2)
            for fr in range(nf - 1):
                s0 = fr * FRAME
                s1 = min(n, s0 + FRAME)
                if s1 <= s0:
                    continue
                blk = nz[s0:s1]
                bb, zib = run_resonator(blk, zib, T['burst_f'][fr], 1400)
                bz[s0:s1] = bb
            bz = bz - np.convolve(bz, np.ones(7) / 7, mode='same')
            out = out + bz * burst * 0.9

        # ---- output shaping -------------------------------------------
        out = np.convolve(out, np.ones(2) / 2, mode='same')
        # remove DC / rumble
        out = out - np.convolve(out, np.ones(241) / 241, mode='same')
        peak = np.max(np.abs(out)) + 1e-9
        out = np.clip(out / peak, -1.2, 1.2)
        return out
