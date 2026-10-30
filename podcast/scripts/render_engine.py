"""
render_engine.py — the multi-camera podcast renderer.

For every frame it:
  1. picks the active camera shot (from shots.json)
  2. animates the camera (slow push-in, organic handheld drift, breathing)
  3. animates the face (lip-sync from the dialogue envelope, blinks, saccades,
     head sway) with a single displacement remap over the face ROI
  4. grades the frame (S-curve, teal/amber split tone, bloom, vignette, grain)
and pipes raw BGR frames into ffmpeg.
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
from plates import PLATES, TALK_TWIN   # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')
W, H = 1920, 1080
PLATE_UP = 2.0        # plates are upscaled before display
FPS = 30
FFMPEG = None
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = 'ffmpeg'


# ---------------------------------------------------------------- utility --
def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def value_noise(seed, n, octaves=3, freq=1.0):
    """1-D smooth noise in [-1,1]."""
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    amp = 1.0
    tot = 0.0
    for o in range(octaves):
        pts = max(2, int(n / (FPS * freq)) + 2)
        pts = min(pts, 8192)
        vals = rng.normal(0, 1, pts + 1)
        xs = np.linspace(0, pts, n)
        lo = np.floor(xs).astype(int).clip(0, pts - 1)
        fr = xs - lo
        fr = fr * fr * (3 - 2 * fr)
        out += amp * (vals[lo] * (1 - fr) + vals[lo + 1] * fr)
        tot += amp
        amp *= 0.5
        freq *= 2.2
    return out / max(tot, 1e-9)


def load_plate(name, upscale=2.0):
    p = PLATES[name]
    path = os.path.join(ROOT, 'assets', 'plates', p['file'])
    im = cv2.imread(path, cv2.IMREAD_COLOR)
    if upscale != 1.0:
        im = cv2.resize(im, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_CUBIC)
        # width-dependent light denoise: kills compression speckle, keeps pores
        small = cv2.resize(im, (im.shape[1] // 2, im.shape[0] // 2), interpolation=cv2.INTER_AREA)
        im = cv2.bilateralFilter(small, 5, 18, 18)
        im = cv2.resize(im, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB)
        lab[:, :, 1] = cv2.bilateralFilter(cv2.medianBlur(lab[:, :, 1], 7), 7, 30, 30)
        lab[:, :, 2] = cv2.bilateralFilter(cv2.medianBlur(lab[:, :, 2], 7), 7, 30, 30)
        im = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return im


# ------------------------------------------------------------------ shots --
class Shot:
    """One camera setup on the timeline."""

    def __init__(self, start, end, plate, kind, who=None, framing=1.0,
                 focus=None, motion=1.0, shot_id=0):
        self.start, self.end = start, end
        self.plate = plate
        self.kind = kind              # 'speaking' | 'listening' | 'wide' | 'broll'
        self.who = who
        self.framing = framing        # >1 = tighter
        self.focus = focus            # (x, y) plate coords to hold
        self.motion = motion
        self.id = shot_id

    def to_dict(self):
        return dict(start=self.start, end=self.end, plate=self.plate, kind=self.kind,
                    who=self.who, framing=self.framing, focus=self.focus,
                    motion=self.motion, id=self.id)


def plan_shots(timeline, seed=5):
    """Turn the dialogue timeline into a real podcast edit."""
    rng = np.random.default_rng(seed)
    lines = timeline['lines']
    shots = []
    sid = 0
    prev_speaker = None
    last_closeup_who = None
    since_wide = 0
    for i, ln in enumerate(lines):
        sp = ln['sp']
        dur = ln['end'] - ln['start']
        other = 'R' if sp == 'A' else 'A'
        # candidate coverage for this line, ordered by editorial preference
        cands = []
        # 1. the speaker in close-up (most common)
        cands.append(('cu', sp))
        # 2. the listener reacting (over-the-shoulder or reaction plate)
        if rng.random() < 0.55:
            cands.insert(0, ('ots', other))
        # 3. wide two-shot every so often
        if since_wide >= 3 or dur > 11:
            cands = [('wide', None)] + cands
        choice = cands[0]
        # never repeat the same close-up identity two shots in a row if avoidable
        if choice[0] == 'cu' and last_closeup_who == choice[1] and len(cands) > 1:
            choice = cands[1]

        def add_shot(kind, who, t0, t1):
            nonlocal sid, last_closeup_who, since_wide
            if t1 - t0 < 0.35:
                return
            if kind == 'cu':
                plate = 'aarav_ref' if who == 'A' else 'rohan_ref'
                f = 1.28 + rng.random() * 0.18
                if rng.random() < 0.22:
                    plate = 'reaction_aarav' if who == 'A' else 'reaction_rohan'
                last_closeup_who = who
                since_wide = 0
                shots.append(Shot(t0, t1, plate, 'speaking', who, framing=f).to_dict())
            elif kind == 'ots':
                plate = 'os_rohan' if who == 'R' else 'os_aarav'
                since_wide += 1
                shots.append(Shot(t0, t1, plate, 'listening', who, framing=1.12,
                                  motion=0.7).to_dict())
            elif kind == 'wide':
                since_wide = 0
                shots.append(Shot(t0, t1, 'wide_two_shot', 'wide', None, framing=1.06,
                                  motion=0.8).to_dict())
            elif kind == 'broll':
                plate = rng.choice(['detail_desk', 'detail_studio', 'studio_wide'])
                shots.append(Shot(t0, t1, str(plate), 'broll', None,
                                  framing=1.05 + rng.random() * 0.15, motion=1.4).to_dict())
            sid += 1

        # split long lines into two camera setups
        if dur > 9.5:
            mid = ln['start'] + dur * (0.45 + 0.1 * rng.random())
            add_shot(choice[0], choice[1], ln['start'], mid)
            second = ('wide', None) if rng.random() < 0.4 else ('cu', sp)
            add_shot(second[0], second[1], mid, ln['end'])
        else:
            add_shot(choice[0], choice[1], ln['start'], ln['end'])

        # reaction beat after a strong line
        if i + 1 < len(lines) and rng.random() < 0.26:
            t0 = ln['end']
            t1 = lines[i + 1]['start'] - 0.02
            if t1 - t0 > 0.25:
                add_shot('cu', other if sp != other else 'A', t0, t1)

        # occasional b-roll cutaway between sections
        if i + 1 < len(lines) and lines[i + 1]['section'] != ln['section']:
            t0 = ln['end']
            t1 = lines[i + 1]['start']
            if t1 - t0 > 0.5:
                add_shot('broll', None, t0, t1)

    # ensure full coverage
    shots.sort(key=lambda s: s['start'])
    fixed = []
    cur = 0.0
    total = timeline['total']
    for s in shots:
        if s['start'] > cur + 0.02:
            plate = 'studio_wide' if cur < 0.1 else 'wide_two_shot'
            fixed.append(Shot(cur, s['start'], plate, 'title' if cur < 0.1 else 'wide',
                              None, framing=1.04, motion=0.45).to_dict())
        fixed.append(s)
        cur = max(cur, s['end'])
    if cur < total:
        fixed.append(Shot(cur, total, 'wide_two_shot', 'wide', None,
                          framing=1.02, motion=0.5).to_dict())
    return fixed


# --------------------------------------------------------------- animation --
class FaceAnimator:
    """Builds the displacement remap for one face ROI."""

    def __init__(self, plate_name, fps=FPS, seed=0):
        p = PLATES[plate_name]
        self.p = p
        self.fps = fps
        rng = np.random.default_rng(seed)
        self.blinks = []
        t = 1.0 + rng.random() * 2.0
        while t < 3600:
            self.blinks.append(t)
            t += 2.6 + rng.random() * 3.4
        self.saccades = []
        t = 0.5 + rng.random()
        while t < 3600:
            self.saccades.append(t)
            t += 0.7 + rng.random() * 2.0
        self.mouth_cx = p['mouth']['cx']
        self.mouth_cy = p['mouth']['cy']
        self.mouth_hw = p['mouth']['half_w']
        self.open_max = p['mouth']['open_max']
        # an eye-only flag: reaction plates are mid-laugh, keep the mouth closed
        self.lock_mouth = p['file'].startswith('reaction_')

    def blink_state(self, t):
        for b in self.blinks:
            d = t - b
            if 0 <= d < 0.16:
                return math.sin(math.pi * d / 0.16)
        return 0.0

    def saccade_offset(self, t):
        idx = 0
        for i, s in enumerate(self.saccades):
            if s <= t:
                idx = i
            else:
                break
        rng = np.random.default_rng(int(t * 7) + idx * 31)
        # hold an offset, jump occasionally
        jump = self.saccades[idx] if idx < len(self.saccades) else 0
        if t - jump < 0.06:
            return 0.0, 0.0
        return float(rng.normal(0, 1.1)), float(rng.normal(0, 0.7))

    def build_roi(self, scale, ox, oy, size):
        """ROI in display coords (plate coords * scale + offset)."""
        cx = self.mouth_cx * scale + ox
        cy = (self.mouth_cy - 60) * scale + oy
        x0, y0 = int(cx - size / 2), int(cy - size / 2)
        return x0, y0, size, size


def make_face_maps(plate_name, scale, size=760):
    """Precompute static gaussian weights for one face at a given scale."""
    p = PLATES[plate_name]
    mx = p['mouth']['cx'] * scale
    my = p['mouth']['cy'] * scale
    hw = p['mouth']['half_w'] * scale
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # ROI origin is the centre of the mouth area
    cx0 = size / 2
    cy0 = size / 2
    dx = xx - cx0
    dy = yy - cy0
    mouth_w = np.exp(-((dx / (hw * 1.55)) ** 2 + (dy / (hw * 0.95)) ** 2))
    # jaw region: wider, below the mouth line
    jaw = np.exp(-((dx / (hw * 2.1)) ** 2 + ((dy + hw * 0.35) / (hw * 1.9)) ** 2))
    jaw *= smoothstep((dy + hw * 0.9) / (hw * 1.2))
    eyes = []
    for (ex, ey) in p['eyes']:
        exs = (ex - p['mouth']['cx']) * scale + cx0
        eys = (ey - p['mouth']['cy']) * scale + cy0
        r = p['eye_r'] * scale
        we = np.exp(-(((xx - exs) / (r * 2.4)) ** 2 + ((yy - eys) / (r * 3.0)) ** 2))
        # iris patch mask (hard-ish edge, tiny feather)
        d = np.sqrt((xx - exs) ** 2 + (yy - eys) ** 2)
        iris = smoothstep((r * 1.15 - d) / (r * 0.35))
        eyes.append((exs, eys, we, iris, r))
    # soft body sway mask
    hc = p.get('head_center', (p['mouth']['cx'], p['mouth']['cy'] - 40))
    hx = (hc[0] - p['mouth']['cx']) * scale + cx0
    hy = (hc[1] - p['mouth']['cy']) * scale + cy0
    hr = p.get('head_r', 160) * scale
    sway = np.exp(-(((xx - hx) / (hr * 1.25)) ** 2 + ((yy - hy) / (hr * 1.35)) ** 2))
    return dict(mouth_w=mouth_w, jaw=jaw, eyes=eyes, sway=sway,
                cx0=cx0, cy0=cy0, size=size)


# -------------------------------------------------------------- grading ----
def build_grade_tables():
    x = np.arange(256, dtype=np.float32) / 255.0
    # filmic S curve
    s = np.clip(x + 0.16 * np.sin(np.pi * (x - 0.5)) * -1.0 + 0.05, 0, 1)
    s = np.clip((x - 0.5) * 1.10 + 0.5, 0, 1) * 0.55 + s * 0.45
    # gentle lift of shadows in blue, warmth in highlights
    r = np.clip(s * 1.035 + 0.004, 0, 1)
    g = np.clip(s * 1.000 + 0.001, 0, 1)
    b = np.clip(s * 0.975 + 0.010, 0, 1)
    lut = np.stack([b, g, r], axis=0)      # (3, 256) BGR: one 1-D LUT per channel
    return np.ascontiguousarray(np.clip(lut * 255, 0, 255).astype(np.uint8))


def vignette_mask(w=W, h=H, strength=0.42):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (xx - w / 2) / (w / 2)
    dy = (yy - h / 2) / (h / 2)
    d = np.sqrt(dx ** 2 * 0.85 + dy ** 2)
    v = 1.0 - strength * smoothstep((d - 0.55) / 0.75)
    return v.astype(np.float32)


def grain_tiles(n=6, w=W, h=H, seed=3):
    rng = np.random.default_rng(seed)
    tiles = []
    for i in range(n):
        g = rng.normal(0, 1, (h // 2, w // 2)).astype(np.float32)
        g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
        tiles.append(g * 3.4)
    return tiles


# --------------------------------------------------------------- renderer --
class Renderer:
    def __init__(self, timeline, shots, audio, fps=FPS):
        self.tl = timeline
        self.shots = shots
        self.fps = fps
        self.audio = audio
        self.plates = {}
        self.maps = {}
        self.grade = build_grade_tables()
        self.vig = vignette_mask()
        self.grain = grain_tiles()
        self._blinks = {}
        self._sacc = {}
        self.frame_i = 0
        # dialogue envelope for lip-sync (50 Hz)
        self.env_rate = 50
        win = int(len(audio) / (timeline['total'] * self.env_rate)) + 1
        n = int(timeline['total'] * self.env_rate)
        env = np.empty(n, dtype=np.float32)
        for i in range(n):
            a = int(i * win)
            seg = audio[a:a + win]
            env[i] = np.sqrt(np.mean(seg ** 2)) if len(seg) else 0.0
        env = np.convolve(env, np.ones(3) / 3, 'same')
        p95 = np.percentile(env[env > 1e-4], 92) if np.any(env > 1e-4) else 1.0
        self.env = np.clip(env / (p95 + 1e-9), 0, 1.6).astype(np.float32)
        # separate envelopes per speaker, from the line list
        self.sp_env = {}
        for who in ('A', 'R'):
            e = np.zeros(n, dtype=np.float32)
            for ln in timeline['lines']:
                if ln['sp'] != who:
                    continue
                a = int(ln['start'] * self.env_rate)
                b = min(n, int(ln['end'] * self.env_rate))
                e[a:b] = np.maximum(e[a:b], self.env[a:b])
            self.sp_env[who] = e
        # organic motion fields (per plate, so each shot feels different)
        self.motion = {}
        for name in PLATES:
            self.motion[name] = dict(
                dx=value_noise(hash(name) % 9999, 3600 * fps, 3, 0.35),
                dy=value_noise((hash(name) + 7) % 9999, 3600 * fps, 3, 0.28),
                rot=value_noise((hash(name) + 13) % 9999, 3600 * fps, 2, 0.22),
            )

    # -- micro-motion ------------------------------------------------
    def blink_state(self, t, who):
        bl = self._blinks
        if who not in bl:
            rng = np.random.default_rng(77 + (0 if who == 'A' else 5))
            lst, tt = [], 1.2 + rng.random() * 2
            while tt < 3600:
                lst.append(tt)
                tt += 2.4 + rng.random() * 3.6
            bl[who] = lst
        for b in bl[who]:
            d = t - b
            if 0 <= d < 0.17:
                return math.sin(math.pi * d / 0.17) ** 1.3
            if b > t:
                break
        return 0.0

    def saccade_state(self, t, who):
        sc = self._sacc
        if who not in sc:
            rng = np.random.default_rng(31 + (0 if who == 'A' else 9))
            lst, tt = [], 0.4
            while tt < 3600:
                lst.append((tt, rng.normal(0, 1.1), rng.normal(0, 0.6)))
                tt += 0.7 + rng.random() * 2.1
            sc[who] = lst
        lst = sc[who]
        cur = lst[0]
        for item in lst:
            if item[0] > t:
                break
            cur = item
        if t - cur[0] < 0.06:
            return 0.0, 0.0
        return cur[1], cur[2]

    # -- helpers -----------------------------------------------------
    def plate(self, name):
        if name not in self.plates:
            self.plates[name] = load_plate(name, 2.0)
        return self.plates[name]

    def face_maps(self, name, scale):
        key = (name, round(scale, 3))
        if key not in self.maps:
            self.maps[key] = make_face_maps(name, scale)
        return self.maps[key]

    def env_at(self, who, t):
        e = self.sp_env.get(who)
        if e is None:
            return 0.0
        i = int(t * self.env_rate)
        if i < 0 or i >= len(e):
            return 0.0
        # 30 ms attack, 90 ms release smoothing
        a = max(0, i - 4)
        b = min(len(e), i + 3)
        v = float(np.max(e[a:b]))
        return v

    def shot_at(self, t):
        for s in self.shots:
            if s['start'] <= t < s['end']:
                return s
        return self.shots[-1]

    # -- camera ------------------------------------------------------
    def camera(self, shot, t):
        dur = max(0.2, shot['end'] - shot['start'])
        u = (t - shot['start']) / dur
        p = PLATES[shot['plate']]
        im = self.plate(shot['plate'])
        ph, pw = im.shape[:2]
        # base framing: crop width relative to plate width
        f = shot['framing']
        crop_w = pw / (1.12 * f)
        # slow push in
        push = 1.0 + 0.055 * shot['motion'] * (u - 0.5)
        crop_w = crop_w / push
        crop_h = crop_w * H / W
        # focus point with a slight drift toward the face
        if shot['focus']:
            fx, fy = shot['focus']
        elif p['who']:
            fx, fy = p['mouth']['cx'] * PLATE_UP, p['mouth']['cy'] * PLATE_UP
        else:
            fx, fy = pw / 2, ph * 0.48
        # organic drift
        mi = int(t * self.fps)
        mo = self.motion[shot['plate']]
        n = len(mo['dx'])
        mi = min(mi, n - 2)
        dx = mo['dx'][mi] * 0.010 * pw * shot['motion']
        dy = mo['dy'][mi] * 0.008 * ph * shot['motion']
        rot = mo['rot'][mi] * 0.22 * shot['motion']
        # keep the crop inside the plate
        cx = np.clip(fx + dx, crop_w / 2, pw - crop_w / 2)
        cy = np.clip(fy + dy, crop_h / 2, ph - crop_h / 2)
        # if the plate is not wide enough at this crop, scale the crop up
        if crop_h > ph:
            s = ph / crop_h
            crop_w *= s
            crop_h *= s
        sx = W / crop_w
        sy = H / crop_h
        M = np.array([[sx * math.cos(math.radians(rot)), -sy * math.sin(math.radians(rot)),
                       (W / 2) - cx * sx * math.cos(math.radians(rot)) + cy * sy * math.sin(math.radians(rot))],
                      [sx * math.sin(math.radians(rot)), sy * math.cos(math.radians(rot)),
                       (H / 2) - cx * sx * math.sin(math.radians(rot)) - cy * sy * math.cos(math.radians(rot))]],
                     dtype=np.float64)
        frame = cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REFLECT)
        return frame, M, p

    # -- mouth interior ----------------------------------------------
    def draw_mouth(self, roi, maps, ox, oy, open_px, scale, skin=None):
        """Paint a plausible mouth interior: dark cavity, upper teeth, tongue.

        The cavity is drawn *before* the lip warp, so the lips stretch over it.
        """
        if open_px < 1.5:
            return roi, None
        h, w = roi.shape[:2]
        cxm = maps['cx0'] - ox
        cym = maps['cy0'] - oy
        hw = maps['mouth_hw']
        a = hw * 0.58                       # narrower than the lips
        b = max(1.2, open_px * 0.62)        # jaw opening drives the height
        pad = 6
        x0 = int(max(0, cxm - a - pad)); x1 = int(min(w, cxm + a + pad))
        y0 = int(max(0, cym - b - pad)); y1 = int(min(h, cym + b + pad))
        if x1 - x0 < 3 or y1 - y0 < 3:
            return roi, None
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        # corners droop slightly -> natural opening shape
        bow = -0.22 * ((xx - cxm) / max(a, 1)) ** 2 * b
        d = ((xx - cxm) / a) ** 2 + ((yy - cym - bow) / b) ** 2
        mask = smoothstep((1.0 - d) * 2.6)
        if mask.max() < 0.02:
            return roi, None
        # cavity: deep at the top, warmer at the bottom
        t = np.clip((yy - (cym - b)) / max(2 * b, 1), 0, 1)
        cav = np.zeros((y1 - y0, x1 - x0, 3), dtype=np.float32)
        cav[:, :, 0] = 16 + 22 * t          # B
        cav[:, :, 1] = 14 + 24 * t          # G
        cav[:, :, 2] = 24 + 30 * t          # R  (dark red-brown)
        # upper teeth: a band hugging the top of the cavity
        tooth_top = cym - b * 0.95
        tooth_bot = cym - b * 0.28
        band = ((yy > tooth_top) & (yy < tooth_bot)).astype(np.float32)
        band *= smoothstep((0.80 - d) * 5.0)
        # scallop the biting edge
        edge = tooth_bot + 1.4 * np.cos((xx - cxm) / max(a, 1) * 5.0)
        band *= smoothstep((edge - yy) / 2.0)
        band = np.clip(band, 0, 1)[..., None]
        cav = cav * (1 - band * 0.80) + band * 0.80 * np.array([150, 160, 172], np.float32)
        # tongue at the bottom of the opening
        tg = smoothstep((((xx - cxm) / (a * 0.72)) ** 2 +
                         ((yy - (cym + b * 0.55)) / max(b * 0.55, 1)) ** 2)) * -1 + 1
        tg *= smoothstep((yy - (cym + b * 0.05)) / max(b * 0.5, 1))
        tg = np.clip(tg, 0, 1)[..., None] * 0.75
        cav = cav * (1 - tg) + tg * np.array([74, 82, 126], np.float32)
        m3 = mask[..., None]
        region = roi[y0:y1, x0:x1].astype(np.float32)
        region = region * (1 - m3 * 0.88) + cav * (m3 * 0.88)
        # contact shadow along the lip line sells the depth
        sh = (smoothstep((1.18 - d) * 4.0) - smoothstep((0.92 - d) * 6.0))
        sh = np.clip(sh, 0, 1)[..., None] * 0.45
        region *= (1 - sh)
        roi[y0:y1, x0:x1] = np.clip(region, 0, 255).astype(np.uint8)
        return roi, (x0, y0, x1, y1)

    # -- face ---------------------------------------------------------
    def animate_face(self, frame, shot, t, M):
        plate = shot['plate']
        p = PLATES[plate]
        if not p.get('who'):
            return frame
        who = p['who']
        # scale of the plate inside the display frame
        sx = math.hypot(M[0, 0], M[1, 0])
        sy = math.hypot(M[0, 1], M[1, 1])
        # display pixels per *original plate* pixel
        scale = (sx + sy) / 2 * PLATE_UP
        # plate -> display transform of the anchor
        px, py = p['mouth']['cx'] * PLATE_UP, p['mouth']['cy'] * PLATE_UP
        dx_disp = M[0, 0] * px + M[0, 1] * py + M[0, 2]
        dy_disp = M[1, 0] * px + M[1, 1] * py + M[1, 2]
        size = 760
        x0 = int(dx_disp - size / 2)
        y0 = int(dy_disp - size / 2)
        x0 = max(-100, min(W - 100, x0))
        y0 = max(-100, min(H - 100, y0))
        # clipped ROI
        rx0, ry0 = max(0, x0), max(0, y0)
        rx1, ry1 = min(W, x0 + size), min(H, y0 + size)
        if rx1 - rx0 < 40 or ry1 - ry0 < 40:
            return frame
        roi = frame[ry0:ry1, rx0:rx1]
        h, w = roi.shape[:2]
        maps = self.face_maps(plate, scale)
        maps['mouth_hw'] = p['mouth']['half_w'] * scale
        # ---- lip-sync plate blend ------------------------------------
        talk_open = 0.0
        if plate in TALK_TWIN and shot['kind'] == 'speaking':
            e0 = self.env_at(p['who'], t)
            talk_open = float(np.clip((e0 - 0.05) * 1.5, 0, 1) ** 0.75)
            if talk_open > 0.02:
                Mr = M.copy()
                Mr[0, 2] -= rx0
                Mr[1, 2] -= ry0
                tim = self.plate(TALK_TWIN[plate])
                troi = cv2.warpAffine(tim, Mr, (rx1 - rx0, ry1 - ry0),
                                      flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                yy0, xx0 = np.mgrid[0:ry1 - ry0, 0:rx1 - rx0].astype(np.float32)
                mx = maps['cx0'] - (x0 - rx0)
                my = maps['cy0'] - (y0 - ry0)
                hwp = maps['mouth_hw']
                mm = np.exp(-(((xx0 - mx) / (hwp * 1.62)) ** 2 +
                              ((yy0 - my) / (hwp * 1.05)) ** 2) ** 1.7)
                mm = np.clip(mm, 0, 1) * talk_open
                mm3 = mm[..., None]
                roi = (roi.astype(np.float32) * (1 - mm3) +
                       troi.astype(np.float32) * mm3).astype(np.uint8)
        off_x, off_y = rx0 - x0, ry0 - y0
        # gaussian slices
        sl = (slice(off_y, off_y + h), slice(off_x, off_x + w))
        mouth_w = maps['mouth_w'][sl]
        jaw = maps['jaw'][sl]
        sway = maps['sway'][sl]
        # --- lip sync -------------------------------------------------
        animator_lock = plate.startswith('reaction_')
        e = 0.0 if animator_lock else self.env_at(who, t)
        # syllable-ish shaping: keep a closed baseline and poke open on energy
        open_amt = float(np.clip((e - 0.06) * 1.65, 0, 1.0))
        open_amt = open_amt ** 0.85
        # add micro-flutter so it never looks frozen
        open_amt *= 0.92 + 0.08 * math.sin(t * 37.0 + px)
        mouth_px = open_amt * p['mouth']['open_max'] * scale
        # --- blink ----------------------------------------------------
        bl = 0.0 if plate.startswith('reaction_') else self.blink_state(t, who)
        # --- eye saccade ----------------------------------------------
        nox, noy = 0.0, 0.0
        if not plate.startswith('reaction_'):
            nox, noy = self.saccade_state(t, who)
        # --- head sway ------------------------------------------------
        sway_amp = (1.4 if shot['kind'] == 'speaking' else 0.8) * scale
        sdx = math.sin(t * 0.55 + px) * sway_amp + math.sin(t * 1.7 + 1.2) * sway_amp * 0.25
        sdy = math.cos(t * 0.42 + py) * sway_amp * 0.7 + math.sin(t * 1.31) * sway_amp * 0.18
        if shot['kind'] == 'speaking':
            # talk-driven head emphasis
            sdy += open_amt * 1.6 * scale * 0.6
            sdx += math.sin(t * 3.1) * open_amt * 0.8 * scale
        # build displacement
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        map_x = xx.copy()
        map_y = yy.copy()
        # --- mouth opening -------------------------------------------
        # u = signed distance from the lip line; the gap half height follows a
        # gaussian across the mouth so the opening is thin at the corners.
        if mouth_px > 0.25 and talk_open < 0.35:
            cx_m = maps['cx0'] - (x0 - rx0)
            cy_m = maps['cy0'] - (y0 - ry0)
            hw_px = maps['mouth_hw']
            u = (yy - cy_m)
            across = np.exp(-((xx - cx_m) / (hw_px * 1.15)) ** 2)
            gap = mouth_px * 0.62 * across          # half height of the opening
            inside = np.abs(u) < gap
            # pixels inside the gap sample from just next to the lip crease ->
            # the dark crease is stretched over the whole opening
            squeeze = np.where(inside,
                               cy_m + np.sign(u) * gap * 0.18,
                               cy_m + np.sign(u) * gap * 0.95 + (np.abs(u) - gap * 0.95))
            # outside the gap the lips slide away from the centre (jaw opens)
            lift = np.exp(-(np.abs(u) / (gap * 2.6 + 1e-6)) ** 2) * np.clip(np.abs(u) - gap, 0, None)
            map_y = np.where(inside, squeeze, map_y + np.sign(u) * np.minimum(lift, mouth_px * 0.55))
        # slight horizontal spread when open
        map_x -= (xx - (w / 2)) * 0.030 * mouth_w * open_amt
        # eyes
        for (exs, eys, we, iris, r) in maps['eyes']:
            ex = exs - x0
            ey = eys - y0
            we = we[sl]
            iris = iris[sl]
            if -200 < ex < w + 200 and -200 < ey < h + 200:
                if bl > 0.02:
                    sq = bl * 1.15
                    d_eye = (yy - ey)
                    map_y -= d_eye * sq * we * 1.25
                if abs(nox) > 1e-3 or abs(noy) > 1e-3:
                    map_x -= nox * scale * iris
                    map_y -= noy * scale * iris
        # sway / breathing
        map_x -= sdx * sway
        map_y -= sdy * sway
        out = cv2.remap(roi, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # darken the opening a touch (shadowed interior) + a hint of upper teeth
        if mouth_px > 1.0 and talk_open < 0.35 and not plate.startswith('reaction_'):
            cx_m = maps['cx0'] - (x0 - rx0)
            cy_m = maps['cy0'] - (y0 - ry0)
            hw_px = maps['mouth_hw']
            across = np.exp(-((xx - cx_m) / (hw_px * 1.05)) ** 2)
            gap = mouth_px * 0.62 * across
            ins = np.clip((1.0 - (np.abs(yy - cy_m) / (gap + 1e-6)) ** 2) * 3.0, 0, 1)
            ins = ins ** 0.8
            f = out.astype(np.float32)
            f *= (1 - ins[..., None] * 0.45)
            if mouth_px > 9.0:
                tb = np.clip(1.0 - np.abs((yy - (cy_m - gap * 0.45)) / (gap * 0.42)), 0, 1)
                tb = (tb ** 0.7) * across * ins
                f = f * (1 - tb[..., None] * 0.55) + np.array([150, 158, 168], np.float32) * (tb[..., None] * 0.55)
            out = np.clip(f, 0, 255).astype(np.uint8)
        frame[ry0:ry1, rx0:rx1] = out
        return frame

    # -- grade --------------------------------------------------------
    def grade_frame(self, frame, t, shot):
        # bloom from a downscaled bright pass
        small = cv2.resize(frame, (480, 270), interpolation=cv2.INTER_AREA)
        bright = np.clip(small.astype(np.float32) - 150, 0, 255) * 0.55
        b = cv2.GaussianBlur(bright.astype(np.uint8), (0, 0), 7)
        b = cv2.resize(b, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32) * 0.42
        f = frame.astype(np.float32) + b
        np.clip(f, 0, 255, out=f)
        # LUT grade
        u8 = f.astype(np.uint8)
        g3 = self.grade
        u8[:, :, 0] = cv2.LUT(u8[:, :, 0], g3[0])
        u8[:, :, 1] = cv2.LUT(u8[:, :, 1], g3[1])
        u8[:, :, 2] = cv2.LUT(u8[:, :, 2], g3[2])
        frame = u8
        # vignette + grain
        f = frame.astype(np.float32)
        f *= self.vig[..., None]
        g = self.grain[self.frame_i % len(self.grain)]
        f += g[..., None]
        np.clip(f, 0, 255, out=f)
        # subtle exposure breathing
        f *= 1.0 + 0.006 * math.sin(t * 0.7)
        return f.astype(np.uint8)

    # -- frame --------------------------------------------------------
    def frame(self, t):
        shot = self.shot_at(t)
        frame, M, p = self.camera(shot, t)
        frame = self.animate_face(frame, shot, t, M)
        frame = self.grade_frame(frame, t, shot)
        self.frame_i += 1
        return frame


def animator_saccade(rend, plate, t):
    a = rend.motion.get('_sac')
    if a is None:
        rng = np.random.default_rng(1234)
        sched = []
        tt = 0.4
        while tt < 3600:
            sched.append((tt, rng.normal(0, 1.0), rng.normal(0, 0.6)))
            tt += 0.65 + rng.random() * 2.2
        rend.motion['_sac'] = sched
        a = sched
    lo, hi = 0, len(a) - 1
    for i, (st, _, _) in enumerate(a):
        if st > t:
            hi = i
            break
    st, vx, vy = a[max(0, hi - 1)]
    if t - st < 0.05:
        return 0.0, 0.0
    return vx, vy
