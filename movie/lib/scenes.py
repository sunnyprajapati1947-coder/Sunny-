"""
scenes.py — environment + character builders for "Neelu aur Gyaan ka Chashma".

Every scene is composed into four depth layers so the compositor can move a
camera through them with real parallax:
    L0 sky / far hills      (far)
    L1 ground, houses, trees
    L2 characters + key props (subject)
    L3 foreground framing   (near)
"""
from __future__ import annotations
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from . import cgilib as G
from .cgilib import hx, mix, clamp01, smoothstep, gradient_rect

W, H = 2304, 1296
HZ = 0.56 * H          # horizon line

# ---------------------------------------------------------------- palettes
PAL = {
    "dawn": dict(top=hx("22355e"), mid=hx("c9764f"), hor=hx("ffc27a"),
                 sun=hx("fff0c4"), haze=hx("f0b07a"),
                 ground=hx("7b5a33"), grass=hx("8a9a44"), far=hx("5f6f8f"),
                 light=(-0.52, -0.62, 0.58), skylight=hx("9fc0ff")),
    "day": dict(top=hx("3f8fd8"), mid=hx("8fc6ec"), hor=hx("dff0fa"),
                sun=hx("ffffff"), haze=hx("cfe4f2"), ground=hx("a3805a"),
                grass=hx("8fa347"), far=hx("7d94ad"),
                light=(-0.45, -0.7, 0.56), skylight=hx("bfe0ff")),
    "dusk": dict(top=hx("1e1a40"), mid=hx("7a3f5e"), hor=hx("ff9a52"),
                 sun=hx("ffd9a0"), haze=hx("ffb27a"), ground=hx("5a4128"),
                 grass=hx("6d7a34"), far=hx("4a3f63"),
                 light=(-0.55, -0.5, 0.66), skylight=hx("ffb98a")),
    "night": dict(top=hx("0c1730"), mid=hx("19305a"), hor=hx("2f4c73"),
                  sun=hx("e8f0ff"), haze=hx("3d587f"), ground=hx("3a3a30"),
                  grass=hx("3f4c36"), far=hx("22304e"),
                  light=(-0.45, -0.66, 0.60), skylight=hx("7d9ad0")),
    "warm": dict(top=hx("3a2a1e"), mid=hx("7a5330"), hor=hx("d9a366"),
                 sun=hx("ffdca8"), haze=hx("e0b98a"), ground=hx("6b4a2e"),
                 grass=hx("7a7a3a"), far=hx("5a4326"),
                 light=(-0.5, -0.6, 0.6), skylight=hx("ffc98a")),
}

BOY = dict(skin=hx("b5744a"), skin2=hx("9a5f3c"), shirt=hx("e8b02f"),
           shorts=hx("3b5c96"), hair=hx("1b1410"), sandal=hx("6b4a2c"),
           eye=hx("2a1a12"), white=hx("f7f3ea"))
NEE = dict(body=hx("5fb6e8"), body_d=hx("3d8fc4"), belly=hx("f2f7fb"),
           scarf=hx("e0483f"), star=hx("ffd04a"), eye=hx("1b6d92"),
           glint=hx("ffffff"), foot=hx("eef4f8"))


# ---------------------------------------------------------------- helpers
def arc_mask(w, h, cx, cy, r, a0, a1, thick):
    im = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(im)
    d.arc([(cx - r) * 2, (cy - r) * 2, (cx + r) * 2, (cy + r) * 2],
          a0, a1, fill=255, width=int(thick * 2))
    return np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255.0


def star_mask(w, h, cx, cy, r, points=4, inner=0.38, soft=1.0):
    pts = []
    for i in range(points * 2):
        a = -math.pi / 2 + i * math.pi / points
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return G.m_poly(w, h, pts, soft)


def blur_canvas(cv: G.Canvas, r):
    if r <= 0:
        return
    im = cv.to_image().filter(ImageFilter.GaussianBlur(r))
    a = np.asarray(im, np.float32) / 255.0
    cv.px[..., :3] = a[..., :3]
    cv.px[..., 3] = a[..., 3]


# ---------------------------------------------------------------- sky / land
def sky(cv, pal, sun_xy=(0.72, 0.30), sun_r=0.055, moon=False, stars=False, clouds=0.5):
    top, midc, hor = pal["top"], pal["mid"], pal["hor"]
    cols = np.stack([top, midc, hor])
    ys = np.array([0.0, 0.55, 1.0])
    yy = np.linspace(0, 1, H)
    grad = np.stack([np.interp(yy, ys, cols[:, i]) for i in range(3)], 1)
    cv.px[..., :3] = grad[:, None, :]
    cv.px[..., 3] = 1.0
    if stars:
        rng = np.random.default_rng(7)
        n = 420
        for _ in range(n):
            x, y = rng.uniform(0, W), rng.uniform(0, HZ * 0.98)
            r = rng.uniform(0.7, 2.2)
            b = rng.uniform(0.25, 0.95)
            G.sphere(cv, x, y, r, np.array([1, 1, 1]) * b, amb=1.0, spec=0.0, rim=0.0)
    sx, sy = sun_xy[0] * W, sun_xy[1] * H
    sr = sun_r * H
    if moon:
        G.glow(cv, sx, sy, sr * 5.5, pal["sun"] * 0.55, strength=0.5, falloff=2.6)
        G.sphere(cv, sx, sy, sr, pal["sun"], amb=0.9, spec=0.0, rim=0.35,
                 rim_col=pal["sun"])
        # craters
        rng = np.random.default_rng(3)
        for _ in range(7):
            a, d = rng.uniform(0, 6.28), rng.uniform(0, sr * 0.6)
            G.sphere(cv, sx + d * math.cos(a), sy + d * math.sin(a), sr * rng.uniform(0.08, 0.2),
                     pal["sun"] * 0.86, amb=0.85, spec=0.0, rim=0.0)
    else:
        G.glow(cv, sx, sy, sr * 9.0, pal["sun"], strength=0.55, falloff=2.4)
        G.glow(cv, sx, sy, sr * 3.2, pal["sun"], strength=0.75, falloff=1.8)
        G.sphere(cv, sx, sy, sr, np.minimum(pal["sun"] * 1.15, 1.0), amb=1.0, spec=0.0,
                 rim=0.4, rim_col=pal["sun"])
    if clouds > 0:
        rng = np.random.default_rng(11)
        for i in range(int(5 + clouds * 7)):
            cw = rng.uniform(0.10, 0.30) * W
            cx = rng.uniform(-0.1, 1.1) * W
            cy = rng.uniform(0.05, 0.42) * H
            n = rng.integers(4, 8)
            base = mix(pal["hor"], pal["sun"], rng.uniform(0.15, 0.55))
            for k in range(n):
                rx = cw * rng.uniform(0.18, 0.42)
                rx2 = rx * rng.uniform(0.45, 0.8)
                ox = cx + (k - n / 2) * cw * 0.16 + rng.uniform(-0.1, 0.1) * cw
                oy = cy + rng.uniform(-0.02, 0.02) * H
                G.soft_blob(cv, ox, oy, rx, rx2, base, alpha=0.42,
                            sigma=max(2.0, rx * 0.16))


def hills(cv, pal, base_y, amp, col, seed=0, layers=3):
    rng = np.random.default_rng(seed)
    for li in range(layers):
        c = mix(col, pal["haze"], li * 0.22)
        y0 = base_y + li * amp * 0.12
        pts = [(0, H)]
        ph = rng.uniform(0, 6.28, 3)
        for i in range(0, 41):
            t = i / 40
            x = t * W
            y = y0 - amp * (0.55 + 0.45 * math.sin(t * 5 + ph[0]) * 0.5
                            + 0.3 * math.sin(t * 11 + ph[1]) * 0.35)
            pts.append((x, y))
        pts.append((W, H))
        m = G.m_poly(W, H, pts, soft=1.4)
        cv.over_mask(0, 0, m * 1.0, c)


def ground(cv, pal, col=None, y=HZ, tex=True, seed=4):
    c = pal["ground"] if col is None else col
    gradient_rect_full = np.zeros((H - int(y), W, 3), np.float32)
    yy = np.linspace(0, 1, max(1, H - int(y)))
    near = c * 0.82
    far = mix(c, pal["haze"], 0.35)
    gradient_rect_full[:] = (far[None, None, :] * (1 - yy[:, None, None]) +
                             near[None, None, :] * yy[:, None, None])
    cv.px[int(y):, :, :3] = gradient_rect_full
    cv.px[int(y):, :, 3] = 1.0
    cv.px[:int(y), :, 3] = 0.0
    if tex:
        n = G.fbm(W, H - int(y), octaves=4, seed=seed, scale=26)
        band = cv.px[int(y):, :, :3]
        cv.px[int(y):, :, :3] = band * (0.86 + 0.28 * n[..., None])


def path(cv, pal, y0=HZ, x_top=0.5, w_top=0.03, x_bot=0.42, w_bot=0.34, col=None,
         col2=None):
    c = mix(pal["ground"], hx("d9b98a"), 0.55) if col is None else col
    c2 = mix(c, pal["ground"], 0.5) if col2 is None else col2
    pts = [((x_top - w_top) * W, y0), ((x_top + w_top) * W, y0),
           ((x_bot + w_bot) * W, H), ((x_bot - w_bot) * W, H)]
    m = G.m_poly(W, H, pts, 1.2)
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32) / H
    t = clamp01((yy - y0 / H) / (1 - y0 / H))
    rgb = c[None, None, :] * (1 - t[..., None] * 0.35) + c2[None, None, :] * t[..., None] * 0.35
    cv.put(0, 0, np.dstack([rgb * (m > 0.02)[..., None], m]).astype(np.float32))


def field_rows(cv, pal, y0, x0, x1, n=9, col=None, ang=0.0):
    c = col if col is not None else mix(pal["grass"], hx("bfa02e"), 0.55)
    for i in range(n):
        t = i / max(1, n - 1)
        xa = x0 + (x1 - x0) * t
        pts = [(xa * W, y0), (xa * W + 0.012 * W, y0),
               ((xa + 0.05 + 0.30 * t) * W, H), ((xa - 0.02 + 0.30 * t) * W, H)]
        m = G.m_poly(W, H, pts, 1.0)
        cv.over_mask(0, 0, m * 0.55, mix(c, pal["haze"], 0.25 - 0.2 * t))


def house(cv, pal, x, yb, w, hgt, wall=None, roof=None, seed=0, lit=None):
    wall = wall if wall is not None else mix(hx("cbb08c"), pal["haze"], 0.12)
    roof = roof if roof is not None else hx("8a4a35")
    x0, x1 = x - w / 2, x + w / 2
    y0 = yb - hgt
    # shadow side gradient on wall
    gradient_rect(cv, x0, y0, x1, yb, wall * 1.06, wall * 0.7, vertical=False)
    # roof (trapezoid, extruded)
    rh = hgt * 0.42
    over = w * 0.12
    m = G.m_poly(W, H, [(x0 - over, y0 + 2), (x1 + over, y0 + 2),
                        (x1 + over * 0.5, y0 - rh), (x0 - over * 0.5, y0 - rh)], 1.2)
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    t = clamp01((yy - (y0 - rh)) / max(rh, 1))
    rgb = (roof * 1.15)[None, None, :] * (1 - t[..., None]) + (roof * 0.55)[None, None, :] * t[..., None]
    cv.put(0, 0, np.dstack([rgb * (m > 0.02)[..., None], m]))
    # tile lines
    for i in range(5):
        tt = i / 5
        yl = y0 - rh + rh * tt
        m2 = G.m_capsule(W, H, x0 - over * (0.5 + tt * 0.5), yl, x1 + over * (0.5 + tt * 0.5), yl,
                         2, 2, 1.0)
        cv.over_mask(0, 0, m2 * 0.25, roof * 0.45)
    # door
    dw, dh = w * 0.26, hgt * 0.52
    dm = G.m_round_rect(W, H, x - dw / 2, yb - dh, x + dw / 2, yb, dw * 0.16, 1.0)
    cv.over_mask(0, 0, dm, mix(hx("4a3320"), pal["haze"], 0.1))
    # door glow if lit
    if lit:
        gm = G.m_round_rect(W, H, x - dw / 2, yb - dh, x + dw / 2, yb, dw * 0.16, 1.0)
        cv.over_mask(0, 0, gm * 0.55, np.asarray(lit, np.float32))
        G.glow(cv, x, yb - dh * 0.45, dw * 1.4, np.asarray(lit, np.float32), 0.30, 2.2)
    # window
    wm = G.m_rect(W, H, x0 + w * 0.10, y0 + hgt * 0.18, x0 + w * 0.10 + w * 0.18,
                  y0 + hgt * 0.18 + hgt * 0.20, 1.0)
    cv.over_mask(0, 0, wm, mix(hx("26343f"), pal["haze"], 0.2))
    if lit:
        cv.over_mask(0, 0, wm * 0.8, np.asarray(lit, np.float32))
        G.glow(cv, x0 + w * 0.19, y0 + hgt * 0.28, w * 0.55, np.asarray(lit, np.float32), 0.28, 2.4)


def tree(cv, pal, x, yb, s, seed=0, dark=1.0, trunk=None, leaf=None):
    rng = np.random.default_rng(seed)
    trunk = trunk if trunk is not None else mix(hx("4a3524"), pal["haze"], 0.12)
    leaf = leaf if leaf is not None else mix(pal["grass"], hx("3f7a33"), 0.55) * dark
    # trunk
    G.capsule(cv, x, yb, x + s * 0.05, yb - s * 0.62, s * 0.055, s * 0.032, trunk,
              light=(-0.5, -0.6))
    blobs = 6
    for i in range(blobs):
        a = rng.uniform(0, 6.28)
        d = rng.uniform(0, s * 0.30)
        bx = x + s * 0.05 + math.cos(a) * d
        by = yb - s * 0.62 + math.sin(a) * d * 0.75 - s * 0.10
        r = s * rng.uniform(0.20, 0.33)
        G.sphere(cv, bx, by, r, leaf * rng.uniform(0.85, 1.12),
                 light=(-0.45, -0.65, 0.6), spec=0.10, shin=8, rim=0.18,
                 rim_col=mix(leaf, pal["sun"], 0.5), amb=0.40)


def bush(cv, pal, x, yb, s, col=None):
    col = col if col is not None else mix(pal["grass"], hx("3f7a33"), 0.6)
    for i, (dx, dy, r) in enumerate([(0, 0, 0.55), (-0.35, 0.1, 0.4), (0.38, 0.12, 0.42)]):
        G.sphere(cv, x + dx * s, yb - dy * s, s * r, col * (0.85 + 0.15 * i),
                 light=(-0.45, -0.65, 0.6), spec=0.08, rim=0.2, amb=0.42)


def crowd_row(cv, pal, yb, s, n=7, seed=3, col=None, spread=1.0):
    rng = np.random.default_rng(seed)
    for i in range(n):
        x = W * (0.5 + (i / max(1, n - 1) - 0.5) * 0.86 * spread) + rng.uniform(-30, 30)
        ss = s * rng.uniform(0.85, 1.1)
        c = col if col is not None else mix(rng.choice([hx("c85a53"), hx("4a7f9c"),
                                                        hx("d99a3a"), hx("7a5aa8")]),
                                            pal["haze"], 0.25)
        simple_person(cv, x, yb + rng.uniform(-10, 10), ss, c, pal)


def simple_person(cv, x, yb, s, col, pal, skin=None):
    skin = skin if skin is not None else mix(hx("a9713f"), pal["haze"], 0.15)
    G.sphere(cv, x, yb - s * 0.80, s * 0.11, skin, light=(-0.45, -0.65, 0.6),
             spec=0.12, rim=0.2, amb=0.42)
    G.capsule(cv, x, yb - s * 0.24, x, yb - s * 0.70, s * 0.115, s * 0.10, col,
              light=(-0.45, -0.6))
    G.capsule(cv, x - s * 0.06, yb, x - s * 0.05, yb - s * 0.26, s * 0.035, s * 0.04,
              mix(skin, hx("000000"), 0.15))
    G.capsule(cv, x + s * 0.06, yb, x + s * 0.05, yb - s * 0.26, s * 0.035, s * 0.04,
              mix(skin, hx("000000"), 0.15))


# ---------------------------------------------------------------- characters
def boy(cv, x, yb, h, pose="stand", pal=PAL["day"], facing=1, shirt=None,
        shadow_on=True, mouth="smile", tilt=0.0):
    """Bittu — stylised 3D cartoon village boy (big head, chunky limbs)."""
    skin, shirt = BOY["skin"], (shirt if shirt is not None else BOY["shirt"])
    lt = pal["light"]
    if shadow_on:
        G.shadow(cv, x, yb + h * 0.004, h * 0.21, h * 0.050, 0.46)
    hr = 0.176 * h
    hy = yb - 0.775 * h
    sho = yb - 0.545 * h
    hip = yb - 0.355 * h
    x = x + tilt * h * 0.02

    # ---- legs -----------------------------------------------------------
    if pose == "run":
        legs = [((x - 0.02*h, hip), (x - 0.16*h*facing, yb - 0.20*h), (x - 0.26*h*facing, yb - 0.03*h)),
                ((x + 0.02*h, hip), (x + 0.11*h*facing, yb - 0.16*h), (x + 0.23*h*facing, yb - 0.12*h))]
    elif pose == "sit":
        legs = [((x - 0.05*h, hip), (x - 0.17*h, yb - 0.13*h), (x - 0.02*h, yb - 0.04*h)),
                ((x + 0.05*h, hip), (x + 0.06*h, yb - 0.13*h), (x + 0.22*h, yb - 0.04*h))]
    elif pose == "sit_fold":
        legs = [((x - 0.05*h, hip), (x - 0.20*h, yb - 0.07*h), (x - 0.05*h, yb - 0.015*h)),
                ((x + 0.05*h, hip), (x + 0.20*h, yb - 0.07*h), (x + 0.04*h, yb - 0.015*h))]
    else:
        legs = [((x - 0.062*h, hip), (x - 0.070*h, yb - 0.155*h), (x - 0.078*h, yb - 0.035*h)),
                ((x + 0.062*h, hip), (x + 0.070*h, yb - 0.155*h), (x + 0.078*h, yb - 0.035*h))]
    for (a, b, c) in legs:
        G.capsule(cv, a[0], a[1], b[0], b[1], 0.070*h, 0.060*h, skin, light=lt)
        G.capsule(cv, b[0], b[1], c[0], c[1], 0.060*h, 0.052*h, skin * 0.97, light=lt)
        G.sphere(cv, c[0] + 0.012*h*facing, c[1] + 0.008*h, 0.048*h, BOY["sandal"],
                 light=lt, spec=0.30, rim=0.12, amb=0.5, squash=(1.55, 0.72))
    # ---- shorts ---------------------------------------------------------
    G.capsule(cv, x, hip - 0.055*h, x, hip + 0.055*h, 0.135*h, 0.148*h, BOY["shorts"], light=lt)
    # ---- torso ----------------------------------------------------------
    G.capsule(cv, x, hip - 0.02*h, x, sho, 0.140*h, 0.118*h, shirt, light=lt, spec=0.18)
    # collar
    G.capsule(cv, x - 0.05*h, sho + 0.012*h, x + 0.05*h, sho + 0.012*h, 0.026*h, 0.026*h,
              shirt * 0.75, light=lt)
    # ---- arms -----------------------------------------------------------
    if pose in ("run",):
        arms = [((x + 0.10*h*facing, sho + 0.01*h), (x + 0.17*h*facing, sho + 0.13*h)),
                ((x - 0.10*h*facing, sho + 0.01*h), (x - 0.16*h*facing, sho - 0.09*h))]
    elif pose in ("point", "hold_up"):
        arms = [((x - 0.10*h, sho + 0.01*h), (x - 0.16*h, sho + 0.19*h)),
                ((x + 0.10*h, sho + 0.01*h), (x + 0.28*h*facing, sho - 0.12*h))]
    elif pose == "hands_up":
        arms = [((x - 0.10*h, sho + 0.01*h), (x - 0.22*h, sho - 0.26*h)),
                ((x + 0.10*h, sho + 0.01*h), (x + 0.22*h, sho - 0.26*h))]
    elif pose in ("hold", "hold_low", "sit", "sit_fold"):
        arms = [((x - 0.10*h, sho + 0.01*h), (x - 0.055*h, sho + 0.21*h)),
                ((x + 0.10*h, sho + 0.01*h), (x + 0.055*h, sho + 0.21*h))]
    elif pose == "chin":
        arms = [((x - 0.10*h, sho + 0.01*h), (x - 0.17*h, sho + 0.22*h)),
                ((x + 0.10*h, sho + 0.01*h), (x + 0.03*h, hy + 0.24*hr))]
    else:
        arms = [((x - 0.105*h, sho + 0.01*h), (x - 0.145*h, sho + 0.22*h)),
                ((x + 0.105*h, sho + 0.01*h), (x + 0.145*h, sho + 0.22*h))]
    for (a, b) in arms:
        G.capsule(cv, a[0], a[1], b[0], b[1], 0.052*h, 0.044*h, skin, light=lt)
        G.sphere(cv, b[0], b[1], 0.052*h, skin * 1.02, light=lt, spec=0.28, rim=0.2,
                 rim_col=pal["skylight"], amb=0.45)
    # ---- head -----------------------------------------------------------
    G.capsule(cv, x, sho + 0.02*h, x, hy + hr * 0.72, 0.048*h, 0.044*h, skin * 0.9, light=lt)
    G.sphere(cv, x, hy, hr, skin, light=lt, spec=0.24, shin=34, rim=0.30,
             rim_col=pal["skylight"], amb=0.42, squash=(0.98, 1.05))
    for sgn in (-1, 1):
        G.sphere(cv, x + sgn * hr * 0.97, hy + hr * 0.14, hr * 0.19, skin * 0.96,
                 light=lt, spec=0.2, rim=0.22, amb=0.44, squash=(0.62, 1.0))
    # ---- hair: rounded cap + fringe --------------------------------------
    for pass_i in range(2):
        cap = int(hr * 2.6)
        m = G.m_disc(cap, cap, cap / 2, cap / 2, hr * (1.045 + pass_i * 0.0), 1.6)
        yy = np.mgrid[0:cap, 0:cap][0].astype(np.float32)
        edge = cap / 2 + hr * (0.16 - pass_i * 0.02)
        m = m * clamp01((edge - yy) / (hr * 0.30))
        col = BOY["hair"] * (1.0 if pass_i == 0 else 1.25)
        cv.over_mask(int(x - cap / 2), int(hy - hr * 0.10 - cap / 2), m, col)
    # side hair patches
    for sgn in (-1, 1):
        sm = G.m_ellipse(int(hr * 0.5), int(hr * 1.1), hr * 0.25, hr * 0.55, hr * 0.24, hr * 0.52, 1.6)
        cv.over_mask(int(x + sgn * hr * 0.86 - hr * 0.25), int(hy - hr * 0.42), sm * 0.95, BOY["hair"])
    # fringe spikes
    for i in range(7):
        t = i / 6.0
        bx = x - hr * 0.90 + t * hr * 1.80
        by = hy - hr * 0.14
        ln = hr * (0.30 + 0.10 * math.sin(t * 7.0 + 1.0))
        wv = hr * 0.22
        m = G.m_tri(int(hr * 1.2), int(hr * 1.2), (hr * 0.2, hr * 0.1),
                    (hr * 0.2 + wv, hr * 0.1), (hr * 0.2 + wv * 0.45, hr * 0.1 + ln), 1.2)
        cv.over_mask(int(bx - hr * 0.2), int(by - hr * 0.1), m, BOY["hair"])
    # ---- face -----------------------------------------------------------
    eye_y = hy + hr * 0.10
    for sgn in (-1, 1):
        ex = x + sgn * hr * 0.355 * facing
        G.sphere(cv, ex, eye_y, hr * 0.205, BOY["white"] * 0.96, light=(-0.25, -0.85, 0.45),
                 spec=0.04, rim=0.0, amb=0.92, squash=(0.80, 1.00))
        G.sphere(cv, ex + hr * 0.028 * facing, eye_y + hr * 0.012, hr * 0.132, BOY["eye"],
                 light=(0.18, -0.55, 0.82), spec=0.85, shin=44, rim=0.0, amb=0.14)
        G.sphere(cv, ex - hr * 0.048 * facing, eye_y - hr * 0.050, hr * 0.044, BOY["white"],
                 light=(0, 0, 1), spec=0.0, rim=0.0, amb=1.30)
        G.sphere(cv, ex + hr * 0.052 * facing, eye_y + hr * 0.062, hr * 0.020, BOY["white"],
                 light=(0, 0, 1), spec=0.0, rim=0.0, amb=1.05)
        # upper lid shadow so eyes sit inside the face
        lm = G.m_ellipse(int(hr * 0.55), int(hr * 0.30), hr * 0.275, hr * 0.10, hr * 0.27, hr * 0.11, 1.4)
        cv.over_mask(int(ex - hr * 0.275), int(eye_y - hr * 0.215), lm * 0.45, skin * 0.55)
        # brow
        bm = G.m_capsule(int(hr * 1.1), int(hr * 0.5), hr * 0.10, hr * 0.30,
                         hr * 1.00, hr * 0.22, hr * 0.060, hr * 0.048, 1.2)
        cv.over_mask(int(ex - hr * 0.55), int(eye_y - hr * 0.44), bm, BOY["hair"])
    # nose
    G.sphere(cv, x + hr * 0.02 * facing, hy + hr * 0.36, hr * 0.085, skin * 0.92,
             light=lt, spec=0.25, rim=0.12, amb=0.48)
    # mouth
    if mouth == "smile":
        m = arc_mask(int(hr * 1.6), int(hr * 0.95), hr * 0.80, hr * 0.30, hr * 0.40, 18, 162, hr * 0.080)
        cv.over_mask(int(x + hr * 0.02 * facing - hr * 0.80), int(hy + hr * 0.40), m * 0.92,
                     mix(BOY["eye"], hx("5a2a20"), 0.35))
    elif mouth == "open":
        G.sphere(cv, x + hr * 0.02 * facing, hy + hr * 0.60, hr * 0.16,
                 mix(BOY["eye"], hx("7a2a26"), 0.5), light=lt, spec=0.1, rim=0.0,
                 amb=0.35, squash=(1.25, 0.85))
    elif mouth == "sad":
        m = arc_mask(int(hr * 1.6), int(hr * 0.95), hr * 0.80, hr * 0.80, hr * 0.40, 200, 340, hr * 0.075)
        cv.over_mask(int(x + hr * 0.02 * facing - hr * 0.80), int(hy + hr * 0.16), m * 0.85, BOY["eye"])


def neelu(cv, x, yb, h, pal=PAL["day"], arm="wave", eyes="open", scarf_wave=1.0,
          star_glow=1.0, shadow_on=True):
    """Neelu — chubby sky-blue robot cat (22nd century robocat)."""
    lt = pal["light"]
    body_r = 0.300 * h
    by = yb - body_r * 0.96
    head_r = 0.320 * h
    hy = by - body_r * 0.92    # overlapping body + head (chubby)
    if shadow_on:
        G.shadow(cv, x, yb + h * 0.004, h * 0.30, h * 0.058, 0.50)

    # tail
    G.capsule(cv, x + body_r * 0.80, by + body_r * 0.40, x + body_r * 1.45, by - body_r * 0.05,
              body_r * 0.15, body_r * 0.09, NEE["body_d"], light=lt)
    # feet
    for sgn in (-1, 1):
        G.sphere(cv, x + sgn * body_r * 0.50, yb - body_r * 0.11, body_r * 0.33, NEE["foot"],
                 light=lt, spec=0.55, shin=24, rim=0.22, rim_col=pal["skylight"],
                 squash=(1.18, 0.70), amb=0.60)
    # scarf tail (behind the body, so it reads as fabric)
    _sy = hy + head_r * 0.80
    _p1 = (x - head_r * 0.34, _sy)
    _p2 = (x - head_r * (0.62 + 0.34 * scarf_wave), _sy + head_r * 0.30)
    _p3 = (x - head_r * (0.66 + 0.62 * scarf_wave), _sy + head_r * 0.74)
    G.capsule(cv, _p1[0], _p1[1], _p2[0], _p2[1], head_r * 0.105, head_r * 0.078, NEE["scarf"], light=lt)
    G.capsule(cv, _p2[0], _p2[1], _p3[0], _p3[1], head_r * 0.078, head_r * 0.040, NEE["scarf"] * 0.90, light=lt)
    # body
    G.sphere(cv, x, by, body_r, NEE["body"], light=lt, spec=0.40, shin=26, rim=0.32,
             rim_col=pal["skylight"], amb=0.44)
    G.sphere(cv, x, by + body_r * 0.12, body_r * 0.70, NEE["belly"], light=lt, spec=0.35,
             shin=18, rim=0.12, amb=0.66, squash=(0.88, 0.90))
    # belly pocket (4-D pocket)
    pm = G.m_round_rect(int(body_r * 1.0), int(body_r * 0.8), body_r * 0.18, body_r * 0.10,
                        body_r * 0.82, body_r * 0.66, body_r * 0.16, 1.2)
    cv.over_mask(int(x - body_r * 0.50), int(by - body_r * 0.28), pm * 0.90,
                 mix(NEE["body_d"], hx("16334a"), 0.45))
    cv.over_mask(int(x - body_r * 0.50), int(by - body_r * 0.28), pm * 0.25,
                 NEE["belly"])
    # arms
    def _arm(px, py, qx, qy, paw=True):
        G.capsule(cv, px, py, qx, qy, body_r * 0.175, body_r * 0.140, NEE["body"], light=lt)
        if paw:
            G.sphere(cv, qx, qy, body_r * 0.165, NEE["belly"], light=lt, spec=0.42, rim=0.3,
                     rim_col=pal["skylight"], amb=0.62)
    if arm == "wave":
        _arm(x - body_r * 0.84, by - body_r * 0.08, x - body_r * 1.06, by + body_r * 0.56)
        _arm(x + body_r * 0.84, by - body_r * 0.08, x + body_r * 1.26, by - body_r * 0.80)
    elif arm == "up":
        _arm(x - body_r * 0.84, by - body_r * 0.08, x - body_r * 1.16, by - body_r * 0.76)
        _arm(x + body_r * 0.84, by - body_r * 0.08, x + body_r * 1.16, by - body_r * 0.76)
    elif arm == "think":
        _arm(x - body_r * 0.84, by - body_r * 0.08, x - body_r * 1.10, by + body_r * 0.55)
        _arm(x + body_r * 0.84, by - body_r * 0.08, x + body_r * 0.60, hy + head_r * 0.50)
    else:
        _arm(x - body_r * 0.84, by - body_r * 0.08, x - body_r * 1.08, by + body_r * 0.54)
        _arm(x + body_r * 0.84, by - body_r * 0.08, x + body_r * 1.08, by + body_r * 0.54)
    # ears (behind head): upright rounded triangles tucked into the skull
    for sgn in (-1, 1):
        bw, bh = int(head_r * 1.02), int(head_r * 0.72)
        bx0 = int(x + sgn * head_r * 0.62 - bw / 2)
        by0 = int(hy - head_r * 0.66)
        apexx = bw * (0.5 - 0.16 * sgn)
        m = G.m_poly(bw, bh, [(bw * 0.16, bh * 1.00), (bw * 0.84, bh * 1.00),
                              (apexx, bh * 0.02)], 1.6)
        cv.over_mask(bx0, by0, m, NEE["body"] * 0.95)
        inner = G.m_poly(int(bw * 0.52), int(bh * 0.52),
                         [(bw * 0.06, bh * 0.52), (bw * 0.46, bh * 0.52),
                          (apexx * 0.42 + bw * 0.14, bh * 0.02)], 1.2)
        cv.over_mask(int(bx0 + bw * 0.24), int(by0 + bh * 0.44), inner * 0.45, NEE["body_d"])
    # head
    G.sphere(cv, x, hy, head_r, NEE["body"], light=lt, spec=0.46, shin=32, rim=0.36,
             rim_col=pal["skylight"], amb=0.46, squash=(1.04, 0.98))
    # white face plate
    G.sphere(cv, x, hy + head_r * 0.14, head_r * 0.66, NEE["belly"], light=lt, spec=0.42,
             shin=20, rim=0.10, amb=0.74, squash=(1.02, 0.76))
    # scarf
    G.capsule(cv, x - head_r * 0.56, hy + head_r * 0.78, x + head_r * 0.56, hy + head_r * 0.78,
              head_r * 0.145, head_r * 0.145, NEE["scarf"], light=lt)
    # eyes
    ey = hy + head_r * 0.02
    for sgn in (-1, 1):
        ex = x + sgn * head_r * 0.335
        if eyes == "happy":
            m = arc_mask(int(head_r * 0.62), int(head_r * 0.46), head_r * 0.31, head_r * 0.32,
                         head_r * 0.24, 200, 340, head_r * 0.085)
            cv.over_mask(int(ex - head_r * 0.31), int(ey - head_r * 0.32), m, NEE["eye"])
        elif eyes == "closed":
            m = arc_mask(int(head_r * 0.62), int(head_r * 0.40), head_r * 0.31, head_r * 0.14,
                         head_r * 0.24, 20, 160, head_r * 0.085)
            cv.over_mask(int(ex - head_r * 0.31), int(ey - head_r * 0.14), m, NEE["eye"])
        else:
            G.sphere(cv, ex, ey, head_r * 0.225, NEE["eye"], light=(0.22, -0.5, 0.82),
                     spec=0.9, shin=44, rim=0.18, rim_col=pal["skylight"], amb=0.38,
                     squash=(0.92, 1.06))
            G.sphere(cv, ex - head_r * 0.065, ey - head_r * 0.085, head_r * 0.070,
                     NEE["glint"], light=(0, 0, 1), spec=0.0, rim=0.0, amb=1.35)
            G.sphere(cv, ex + head_r * 0.055, ey + head_r * 0.095, head_r * 0.032,
                     NEE["glint"], light=(0, 0, 1), spec=0.0, rim=0.0, amb=1.05)
    # nose + mouth
    G.sphere(cv, x, hy + head_r * 0.31, head_r * 0.078, NEE["scarf"], light=lt, spec=0.6,
             shin=30, rim=0.0, amb=0.62)
    mm = arc_mask(int(head_r * 0.85), int(head_r * 0.50), head_r * 0.42, head_r * 0.22,
                  head_r * 0.23, 20, 160, head_r * 0.070)
    cv.over_mask(int(x - head_r * 0.42), int(hy + head_r * 0.32), mm * 0.9, NEE["eye"])
    # whiskers
    for sgn in (-1, 1):
        for k, dy in enumerate((-0.03, 0.09)):
            G.capsule(cv, x + sgn * head_r * 0.50, hy + head_r * (0.28 + dy),
                      x + sgn * head_r * 1.06, hy + head_r * (0.22 + dy * 1.9),
                      head_r * 0.017, head_r * 0.010, mix(NEE["body_d"], hx("24414f"), 0.45))
    # antenna + star
    G.capsule(cv, x, hy - head_r * 0.94, x + head_r * 0.05, hy - head_r * 1.44,
              head_r * 0.030, head_r * 0.024, NEE["body_d"])
    sx, sy = x + head_r * 0.05, hy - head_r * 1.58
    if star_glow > 0:
        G.glow(cv, sx, sy, head_r * 0.85, NEE["star"], 0.55 * star_glow, 2.0)
    G.sphere(cv, sx, sy, head_r * 0.155, NEE["star"], light=(0.3, -0.4, 0.86), spec=0.9,
             shin=30, rim=0.3, amb=0.6)
    m = star_mask(int(head_r * 0.75), int(head_r * 0.75), head_r * 0.375, head_r * 0.375,
                  head_r * 0.32, 4, 0.34, 1.0)
    cv.over_mask(int(sx - head_r * 0.375), int(sy - head_r * 0.375), m * 0.95, NEE["star"] * 1.12)


# ---------------------------------------------------------------- props
def lantern(cv, x, y, s, glow_amt=0.8):
    G.glow(cv, x, y, s * 3.4, hx("ffbf5e"), 0.55 * glow_amt, 2.2)
    G.capsule(cv, x, y - s * 0.9, x, y - s * 1.3, s * 0.05, s * 0.05, hx("8a6a3a"))
    G.sphere(cv, x, y, s * 0.55, hx("ffd98a"), light=(0, 0, 1), spec=0.0, rim=0.0, amb=1.15,
             squash=(0.9, 1.2))


def bucket(cv, x, y, s, col=None):
    col = col if col is not None else hx("b9c2c8")
    m = G.m_poly(W, H, [(x - s * 0.5, y - s), (x + s * 0.5, y - s),
                        (x + s * 0.38, y), (x - s * 0.38, y)], 1.0)
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    t = clamp01((yy - (y - s)) / max(s, 1))
    rgb = (col * 1.15)[None, None, :] * (1 - t[..., None] * 0.6) + col[None, None, :] * 0
    cv.over_mask(0, 0, m, col)
    cv.over_mask(0, 0, m * 0.25 * t, col * 0.45)
    G.capsule(cv, x - s * 0.5, y - s, x, y - s * 1.45, s * 0.05, s * 0.05, col * 0.8)
    G.capsule(cv, x + s * 0.5, y - s, x, y - s * 1.45, s * 0.05, s * 0.05, col * 0.8)


def handpump(cv, x, y, s, water=False):
    metal = hx("5a6670")
    G.shadow(cv, x, y, s * 0.7, s * 0.12, 0.4)
    G.capsule(cv, x, y, x, y - s * 1.15, s * 0.16, s * 0.13, metal)
    G.capsule(cv, x, y - s * 1.15, x, y - s * 1.30, s * 0.20, s * 0.16, metal * 1.1)
    G.capsule(cv, x + s * 0.02, y - s * 1.18, x + s * 0.62, y - s * 1.02, s * 0.075, s * 0.06, metal * 1.2)
    G.capsule(cv, x + s * 0.62, y - s * 1.02, x + s * 0.70, y - s * 0.62, s * 0.05, s * 0.045, metal * 0.9)
    G.capsule(cv, x - s * 0.30, y - s * 0.22, x - s * 0.03, y - s * 0.22, s * 0.075, s * 0.075, metal * 1.05)
    if water:
        for i in range(6):
            w = s * (0.05 + 0.02 * i)
            G.capsule(cv, x - s * 0.02, y - s * 0.20, x - s * 0.10 - i * s * 0.05,
                      y - s * 0.10 + i * s * 0.10, w, w * 0.7, hx("bfe6ff"), amb=0.9, spec=0.5)
        G.glow(cv, x - s * 0.2, y - s * 0.1, s * 1.2, hx("a8deff"), 0.35, 2.0)


def glasses(cv, x, y, s, glow_amt=1.0):
    G.glow(cv, x, y, s * 2.4, hx("ffe08a"), 0.55 * glow_amt, 2.0)
    for sgn in (-1, 1):
        G.capsule(cv, x, y, x + sgn * s * 0.62, y, s * 0.055, s * 0.055, hx("d8a83c"))
        m = G.m_disc(int(s * 2.4), int(s * 2.4), s * 1.2, s * 1.2, s * 0.9, 1.2)
        inner = G.m_disc(int(s * 2.4), int(s * 2.4), s * 1.2, s * 1.2, s * 0.72, 1.2)
        cv.over_mask(int(x + sgn * s * 0.78 - s * 1.2), int(y - s * 1.2), m, hx("c8952f"))
        cv.over_mask(int(x + sgn * s * 0.78 - s * 1.2), int(y - s * 1.2), inner * 0.75, hx("fff4c0"))
    cv.over_mask(int(x - s * 0.1), int(y - s * 0.1),
                 G.m_capsule(int(s * 0.3), int(s * 0.3), s * 0.13, s * 0.15, s * 0.17, s * 0.15, s * 0.05, 1.0),
                 hx("c8952f"))


def book(cv, x, y, s, open_=True, col=None):
    col = col if col is not None else hx("b8443c")
    if open_:
        G.sphere(cv, x - s * 0.30, y, s * 0.42, hx("f6efdd"), light=(0, -0.6, 0.8),
                 spec=0.0, rim=0.0, amb=0.95, squash=(1.3, 0.28))
        G.sphere(cv, x + s * 0.30, y, s * 0.42, hx("efe6cf"), light=(0, -0.6, 0.8),
                 spec=0.0, rim=0.0, amb=0.9, squash=(1.3, 0.28))
        G.capsule(cv, x, y - s * 0.10, x, y + s * 0.10, s * 0.05, s * 0.05, col)
    else:
        G.sphere(cv, x, y, s * 0.45, col, light=(0, -0.7, 0.7), spec=0.25, rim=0.1,
                 amb=0.6, squash=(1.25, 0.32))


def pot(cv, x, y, s, col=None):
    col = col if col is not None else hx("a35f3a")
    G.sphere(cv, x, y - s * 0.42, s * 0.46, col, light=(-0.4, -0.7, 0.6), spec=0.35,
             shin=16, rim=0.25, amb=0.5, squash=(0.95, 1.0))
    G.sphere(cv, x, y - s * 0.80, s * 0.26, col * 1.05, light=(-0.4, -0.7, 0.6),
             spec=0.35, rim=0.2, amb=0.5, squash=(1.0, 0.55))


def dust_motes(cv, n=90, seed=5, col=None, region=None):
    rng = np.random.default_rng(seed)
    col = col if col is not None else np.array([1.0, 0.95, 0.8], np.float32)
    x0, y0, x1, y1 = region if region else (0, 0, W, H)
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        r = rng.uniform(1.0, 3.2)
        G.sphere(cv, x, y, r, col, amb=1.0, spec=0.0, rim=0.0)


# ---------------------------------------------------------------- interiors
def room(cv, pal, wall=None, floor=None, window=True, sun=(0.72, 0.22), wallh=0.78):
    wall = wall if wall is not None else mix(hx("c9a97e"), pal["haze"], 0.18)
    floor = floor if floor is not None else mix(hx("7a5738"), pal["ground"], 0.35)
    yb = H * wallh
    gradient_rect(cv, 0, 0, W, yb, wall * 0.72, wall * 1.06, vertical=True)
    gradient_rect(cv, 0, yb, W, H, floor * 1.05, floor * 0.62, vertical=True)
    # floor planks
    for i in range(9):
        t = i / 8
        yy = yb + (H - yb) * (t ** 1.6)
        G.capsule(cv, 0, yy, W, yy, 2, 2, floor * 0.55)
    if window:
        wx, wy = sun[0] * W, sun[1] * H
        ww, wh = W * 0.19, H * 0.30
        G.gradient_rect(cv, wx - ww / 2, wy - wh / 2, wx + ww / 2, wy + wh / 2,
                        pal["mid"] * 1.1, pal["hor"], vertical=True)
        G.sphere(cv, wx + ww * 0.22, wy - wh * 0.20, wh * 0.16, pal["sun"],
                 amb=1.05, spec=0.0, rim=0.3, rim_col=pal["sun"])
        fr = mix(hx("5a3d28"), pal["haze"], 0.15)
        for (a, b, c, d) in [(-ww/2, -wh/2, ww/2, -wh/2 + 8), (-ww/2, wh/2 - 8, ww/2, wh/2),
                             (-ww/2, -wh/2, -ww/2 + 8, wh/2), (ww/2 - 8, -wh/2, ww/2, wh/2),
                             (-4, -wh/2, 4, wh/2), (-ww/2, -4, ww/2, 4)]:
            G.capsule(cv, wx + a, wy + b, wx + c, wy + d, 7, 7, fr)
        # light shaft
        G.glow(cv, wx, wy + wh * 0.75, wh * 1.8, pal["sun"], 0.30, 2.4)


def bed(cv, pal, x, y, s, col=None, blanket=None):
    col = col if col is not None else hx("8a6a48")
    blanket = blanket if blanket is not None else hx("c85a4a")
    G.shadow(cv, x, y, s * 0.75, s * 0.12, 0.4)
    G.capsule(cv, x - s * 0.68, y - s * 0.10, x - s * 0.68, y - s * 0.42, s * 0.05, s * 0.05, col * 0.8)
    G.capsule(cv, x + s * 0.68, y - s * 0.10, x + s * 0.68, y - s * 0.42, s * 0.05, s * 0.05, col * 0.8)
    G.capsule(cv, x, y - s * 0.40, x, y - s * 0.40, s * 0.08, s * 0.08, col)
    G.gradient_rect(cv, x - s * 0.80, y - s * 0.34, x + s * 0.80, y - s * 0.16,
                    col * 1.05, col * 0.65, vertical=False)
    # mattress + blanket
    G.sphere(cv, x, y - s * 0.34, s * 0.42, blanket, light=(-0.4, -0.7, 0.6), spec=0.12,
             rim=0.15, amb=0.55, squash=(1.85, 0.30))
    # pillow
    G.sphere(cv, x - s * 0.58, y - s * 0.40, s * 0.20, mix(hx("efe6d2"), far_col(pal), 0.15),
             light=(-0.4, -0.7, 0.6), spec=0.1, rim=0.1, amb=0.75, squash=(1.3, 0.55))


def far_col(pal):
    return pal["haze"]


def table(cv, pal, x, y, s, col=None):
    col = col if col is not None else hx("6d4a2e")
    G.shadow(cv, x, y, s * 0.6, s * 0.10, 0.42)
    for sx in (-0.42, 0.42):
        G.capsule(cv, x + sx * s, y, x + sx * s * 0.86, y - s * 0.42, s * 0.045, s * 0.045, col * 0.85)
    G.gradient_rect(cv, x - s * 0.55, y - s * 0.50, x + s * 0.55, y - s * 0.40, col * 1.15,
                    col * 0.8, vertical=False)


def cot(cv, pal, x, y, s, col=None):
    col = col if col is not None else hx("8a6a44")
    G.shadow(cv, x, y, s * 0.8, s * 0.10, 0.36)
    for sx in (-0.62, 0.62):
        G.capsule(cv, x + sx * s, y, x + sx * s * 0.95, y - s * 0.40, s * 0.045, s * 0.045, col * 0.8)
    G.gradient_rect(cv, x - s * 0.75, y - s * 0.46, x + s * 0.75, y - s * 0.36, col * 1.1, col * 0.8,
                    vertical=False)
    for i in range(14):
        xx = x - s * 0.74 + s * 1.48 * i / 13
        G.capsule(cv, xx, y - s * 0.425, xx, y - s * 0.385, 2.0, 2.0, col * 0.6)


def rooftop_village(cv, pal, yb=H * 0.62, seed=9, lit=True):
    """silhouette rooftops for night scenes."""
    rng = np.random.default_rng(seed)
    x = -40
    while x < W + 60:
        w = rng.uniform(0.10, 0.20) * W
        h = rng.uniform(0.06, 0.13) * H
        c = mix(pal["ground"], pal["far"], 0.55)
        G.gradient_rect(cv, x, yb - h, x + w, yb + 40, c * 0.8, c * 0.5, vertical=True)
        m = G.m_poly(W, H, [(x - 14, yb - h + 4), (x + w + 14, yb - h + 4),
                            (x + w - 6, yb - h - h * 0.22), (x + 6, yb - h - h * 0.22)], 1.2)
        cv.over_mask(0, 0, m, c * 0.62)
        if lit and rng.random() < 0.75:
            wx = x + w * rng.uniform(0.25, 0.7)
            wy = yb - h * rng.uniform(0.35, 0.8)
            G.soft_blob(cv, wx, wy, 14, 18, hx("ffc069"), 0.85, 3)
            G.glow(cv, wx, wy, 70, hx("ffb45e"), 0.35, 2.2)
        x += w + rng.uniform(6, 26)


def jungle(cv, pal, y0=H * 0.60, seed=3, fog=0.55, n=9, dark=0.55):
    """tree line: canopy blobs high up, thin trunks down to y0."""
    rng = np.random.default_rng(seed)
    for i in range(n):
        x = (i + rng.uniform(-0.28, 0.28)) * W / max(1, n - 1)
        trunk_h = H * rng.uniform(0.30, 0.46)
        canopy_r = H * rng.uniform(0.10, 0.17)
        cy = y0 - trunk_h
        d = dark * rng.uniform(0.75, 1.1)
        col = mix(pal["grass"], hx("1a2a20"), 0.72) * d
        haze = mix(col, pal["haze"], 0.30)
        G.capsule(cv, x, y0 + H * 0.30, x + rng.uniform(-14, 14), cy + canopy_r * 0.4,
                  H * 0.016, H * 0.010, mix(col, hx("241a12"), 0.55))
        for k in range(4):
            a = rng.uniform(0, 6.28)
            rr = rng.uniform(0, canopy_r * 0.9)
            G.sphere(cv, x + math.cos(a) * rr, cy + math.sin(a) * rr * 0.55,
                     canopy_r * rng.uniform(0.62, 0.95), haze * rng.uniform(0.85, 1.12),
                     light=(-0.4, -0.7, 0.5), spec=0.08, rim=0.26,
                     rim_col=pal["skylight"], amb=0.42)
    if fog > 0:
        for i in range(3):
            G.soft_blob(cv, W * rng.uniform(0.1, 0.9), y0 + i * H * 0.05, W * 0.7, H * 0.04,
                        mix(pal["haze"], pal["hor"], 0.5), 0.18 * fog, H * 0.025)


def classroom(cv, pal, yb=H * 0.66, n_desks=3):
    wall = mix(hx("d8c8a8"), pal["haze"], 0.2)
    gradient_rect(cv, 0, 0, W, yb, wall * 0.78, wall * 1.04, vertical=True)
    gradient_rect(cv, 0, yb, W, H, mix(hx("9a7a52"), pal["ground"], 0.3) * 1.1,
                  mix(hx("9a7a52"), pal["ground"], 0.3) * 0.6, vertical=True)
    # blackboard
    bx, by, bw, bh = W * 0.30, H * 0.09, W * 0.40, H * 0.30
    G.gradient_rect(cv, bx, by, bx + bw, by + bh, hx("2f3b34"), hx("222b26"), vertical=True)
    for (a, b, c, d) in [(0, 0, bw, 10), (0, bh - 10, bw, bh), (0, 0, 10, bh), (bw - 10, 0, bw, bh)]:
        G.gradient_rect(cv, bx + a, by + b, bx + c, by + d, hx("8a6a3a"), hx("6a4e28"),
                        vertical=False)
    G.stipple(cv, bx + 20, by + 20, bx + bw - 20, by + bh - 20, 120, hx("cfd8cf"), 0.8, 1.6, 4, 0.25)
    # windows
    for i in range(2):
        wx = W * (0.06 + i * 0.075)
        wy = H * 0.18
        G.gradient_rect(cv, wx, wy, wx + W * 0.055, wy + H * 0.20, pal["mid"], pal["hor"],
                        vertical=True)
        G.glow(cv, wx + W * 0.03, wy + H * 0.12, H * 0.16, pal["sun"], 0.25, 2.2)
    # desks
    for i in range(n_desks):
        t = i / max(1, n_desks - 1)
        y = yb + (H - yb) * (0.12 + 0.55 * t)
        s = H * (0.10 + 0.16 * t)
        for j in range(3):
            x = W * (0.16 + j * 0.30) + (t - 0.5) * 40
            G.shadow(cv, x, y + s * 0.10, s * 0.42, s * 0.06, 0.30)
            G.capsule(cv, x - s * 0.35, y, x - s * 0.32, y - s * 0.45, s * 0.035, s * 0.035, hx("6a4a2c"))
            G.capsule(cv, x + s * 0.35, y, x + s * 0.32, y - s * 0.45, s * 0.035, s * 0.035, hx("6a4a2c"))
            G.gradient_rect(cv, x - s * 0.45, y - s * 0.52, x + s * 0.45, y - s * 0.42,
                            hx("a8794a"), hx("7a5028"), vertical=False)


def birds(cv, pal, y, n=7, seed=2, spread=0.5, size=1.0):
    rng = np.random.default_rng(seed)
    for i in range(n):
        x = W * (0.5 + (rng.uniform(-1, 1)) * spread)
        yy = y + rng.uniform(-0.05, 0.05) * H
        s = H * 0.012 * size * rng.uniform(0.7, 1.3)
        c = mix(pal["far"], hx("20242c"), 0.5)
        G.capsule(cv, x - s, yy, x, yy - s * 0.55, s * 0.16, s * 0.10, c)
        G.capsule(cv, x, yy - s * 0.55, x + s, yy, s * 0.10, s * 0.16, c)


def butterfly(cv, x, y, s, col=None):
    col = col if col is not None else hx("ffb03a")
    for sgn in (-1, 1):
        G.sphere(cv, x + sgn * s * 0.35, y, s * 0.38, col, light=(0, -0.6, 0.8),
                 spec=0.5, rim=0.3, amb=0.7, squash=(1.0, 0.7))
    G.capsule(cv, x, y - s * 0.30, x, y + s * 0.30, s * 0.06, s * 0.06, hx("3a2a1a"))


def dry_ground(cv, pal, y=HZ):
    c = mix(hx("c49a63"), pal["haze"], 0.10)
    ground(cv, pal, col=c, y=y, seed=8)
    n = G.fbm(W, H - int(y), octaves=3, seed=12, scale=18)
    # cracks
    rng = np.random.default_rng(21)
    for i in range(16):
        x0 = rng.uniform(0, W)
        yy = rng.uniform(y + 40, H)
        pts = [(x0, yy)]
        for k in range(4):
            pts.append((pts[-1][0] + rng.uniform(-90, 90), pts[-1][1] + rng.uniform(10, 60)))
        for a, b in zip(pts[:-1], pts[1:]):
            w = 1.0 + (b[1] - y) / H * 3.0
            G.capsule(cv, a[0], a[1], b[0], b[1], w, w * 0.7, c * 0.55)


def heat_haze(cv, strength=0.10, y0=HZ):
    strip = cv.px[int(y0):, :, :3].copy()
    im = Image.fromarray((np.clip(strip, 0, 1) * 255).astype(np.uint8))
    im = im.filter(ImageFilter.GaussianBlur(4))
    a = np.asarray(im, np.float32) / 255.0
    cv.px[int(y0):, :, :3] = strip * (1 - strength) + a * strength


def adult(cv, x, yb, h, pal=PAL["day"], shirt=None, skin=None, saree=False,
          grey=False, beard=False, turban=False, pose="stand", dupatta=None):
    """generic stylised adult villager (mother / teacher / elder / crowd)."""
    lt = pal["light"]
    skin = skin if skin is not None else mix(hx("a9713f"), pal["haze"], 0.10)
    shirt = shirt if shirt is not None else hx("c85a53")
    hair = hx("cfc7ba") if grey else hx("2a2018")
    hr = 0.118 * h
    hy = yb - 0.845 * h
    sho = yb - 0.66 * h
    hip = yb - 0.44 * h
    G.shadow(cv, x, yb + h * 0.004, h * 0.19, h * 0.035, 0.42)
    # legs
    if pose == "sit":
        G.capsule(cv, x - 0.04*h, hip, x - 0.20*h, yb - 0.10*h, 0.042*h, 0.038*h, skin if not saree else shirt*0.8)
        G.capsule(cv, x + 0.04*h, hip, x + 0.20*h, yb - 0.10*h, 0.042*h, 0.038*h, skin if not saree else shirt*0.8)
    else:
        G.capsule(cv, x - 0.045*h, hip, x - 0.05*h, yb - 0.02*h, 0.044*h, 0.038*h, skin if not saree else shirt*0.85, light=lt)
        G.capsule(cv, x + 0.045*h, hip, x + 0.05*h, yb - 0.02*h, 0.044*h, 0.038*h, skin if not saree else shirt*0.85, light=lt)
    # torso with shoulders
    G.capsule(cv, x, hip - 0.02*h, x, sho + 0.01*h, 0.105*h, 0.098*h, shirt, light=lt)
    G.capsule(cv, x - 0.10*h, sho + 0.03*h, x + 0.10*h, sho + 0.03*h, 0.040*h, 0.040*h,
              shirt * 1.04, light=lt)
    # saree pallu / dupatta draped across the chest
    pallu = dupatta if dupatta is not None else shirt * 0.78
    if saree or dupatta is not None:
        G.capsule(cv, x - 0.085*h, sho + 0.015*h, x + 0.075*h, hip + 0.03*h,
                  0.038*h, 0.032*h, pallu, light=lt)
        G.capsule(cv, x + 0.06*h, hip + 0.02*h, x + 0.02*h, yb - 0.06*h,
                  0.055*h, 0.075*h, shirt * 0.9, light=lt)
    # arms
    if pose == "point":
        G.capsule(cv, x - 0.08*h, sho + 0.01*h, x - 0.13*h, sho + 0.19*h, 0.032*h, 0.026*h, skin, light=lt)
        G.capsule(cv, x + 0.08*h, sho + 0.01*h, x + 0.28*h, sho - 0.05*h, 0.032*h, 0.024*h, skin, light=lt)
    elif pose == "hips":
        G.capsule(cv, x - 0.08*h, sho + 0.01*h, x - 0.14*h, hip + 0.02*h, 0.032*h, 0.026*h, skin, light=lt)
        G.capsule(cv, x + 0.08*h, sho + 0.01*h, x + 0.14*h, hip + 0.02*h, 0.032*h, 0.026*h, skin, light=lt)
    elif pose == "raise":
        G.capsule(cv, x - 0.08*h, sho + 0.01*h, x - 0.20*h, sho - 0.22*h, 0.032*h, 0.024*h, skin, light=lt)
        G.capsule(cv, x + 0.08*h, sho + 0.01*h, x + 0.20*h, sho - 0.22*h, 0.032*h, 0.024*h, skin, light=lt)
    elif pose == "bless":
        G.capsule(cv, x - 0.08*h, sho + 0.01*h, x - 0.05*h, sho + 0.20*h, 0.032*h, 0.026*h, skin, light=lt)
        G.capsule(cv, x + 0.08*h, sho + 0.01*h, x + 0.10*h, hy + hr * 1.4, 0.032*h, 0.026*h, skin, light=lt)
    else:
        G.capsule(cv, x - 0.085*h, sho + 0.01*h, x - 0.10*h, sho + 0.20*h, 0.032*h, 0.026*h, skin, light=lt)
        G.capsule(cv, x + 0.085*h, sho + 0.01*h, x + 0.10*h, sho + 0.20*h, 0.032*h, 0.026*h, skin, light=lt)
    # neck + head
    G.capsule(cv, x, sho + 0.02*h, x, hy + hr * 0.8, 0.030*h, 0.028*h, skin * 0.92, light=lt)
    G.sphere(cv, x, hy, hr, skin, light=lt, spec=0.22, shin=30, rim=0.24,
             rim_col=pal["skylight"], amb=0.44, squash=(0.94, 1.06))
    if turban:
        G.sphere(cv, x, hy - hr * 0.62, hr * 0.94, hx("e8dcc0"), light=lt, spec=0.2,
                 rim=0.2, amb=0.62, squash=(1.08, 0.50))
    else:
        # cap of hair hugging the top of the skull only (never over the eyes)
        G.sphere(cv, x, hy - hr * 0.58, hr * 0.95, hair, light=lt, spec=0.18, rim=0.18,
                 amb=0.55, squash=(1.04, 0.52))
    if beard:
        G.sphere(cv, x, hy + hr * 0.62, hr * 0.62, hair, light=lt, spec=0.12, rim=0.1,
                 amb=0.6, squash=(1.05, 0.85))
    # eyes + smile
    for sgn in (-1, 1):
        G.sphere(cv, x + sgn * hr * 0.33, hy + hr * 0.10, hr * 0.155, BOY["white"] * 0.94,
                 light=(-0.25, -0.85, 0.45), spec=0.05, rim=0.0, amb=0.9,
                 squash=(0.85, 1.0))
        G.sphere(cv, x + sgn * hr * 0.33, hy + hr * 0.11, hr * 0.10, BOY["eye"],
                 light=(0.2, -0.6, 0.8), spec=0.75, rim=0.0, amb=0.2)
        G.sphere(cv, x + sgn * hr * 0.33 - hr * 0.035, hy + hr * 0.07, hr * 0.032,
                 BOY["white"], amb=1.25, spec=0.0, rim=0.0)
    # nose
    G.sphere(cv, x, hy + hr * 0.34, hr * 0.085, skin * 0.90, light=lt, spec=0.25,
             rim=0.1, amb=0.5)
    m = arc_mask(int(hr * 1.5), int(hr * 0.8), hr * 0.75, hr * 0.24, hr * 0.36, 20, 160, hr * 0.07)
    cv.over_mask(int(x - hr * 0.75), int(hy + hr * 0.36), m * 0.85, mix(BOY["eye"], hx("5a2a20"), 0.4))
