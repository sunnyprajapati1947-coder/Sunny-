"""
film.py — 36 shot definitions for "Neelu aur Gyaan ka Chashma".

Staging rules (learned the hard way):
  * a character's `h` is its full drawn height in canvas pixels (H = 1296);
    standing heroes ~0.42*H, two-shots ~0.34*H, crowd ~0.38*H, wide ~0.16*H
  * a standing character's baseline sits at y ~ 0.93*H (0.88*H on rooftops,
    0.86*H indoors) so its head lands in the upper-middle third
  * the foreground layer may only intrude ~12% into the frame from the edges
"""
from __future__ import annotations
import math
import numpy as np
from PIL import Image, ImageFilter
from . import cgilib as G
from . import scenes as S
from .cgilib import hx, mix

W, H = S.W, S.H

HERO = 0.42 * H
TWO = 0.34 * H
CROWD = 0.38 * H
WIDE = 0.18 * H
GY = 0.93 * H          # ground baseline for standing figures
RY = 0.88 * H          # rooftop baseline


def _c():
    return G.Canvas(W, H)


def _box(layers, cam="zoom_in", amp=1.0, grade=None, vig=0.55, grain=0.06,
         caption=None, title=None, dof=(0, 2.0, 0, 9.0)):
    out = [(cv, [0.30, 0.62, 1.0, 1.55][i], dof[i]) for i, cv in enumerate(layers)]
    return {"layers": out, "cam": cam, "amp": amp,
            "grade": grade or (hx("ff9a4a"), 0.06), "vig": vig, "grain": grain,
            "caption": caption, "title": title}


def _fg_bushes(pal, dark=0.45, sides=("l", "r"), size=0.30):
    """foreground framing that only hugs the bottom corners."""
    fg = _c()
    if "l" in sides:
        S.bush(fg, pal, W * 0.03, H * 1.16, H * size, col=pal["grass"] * dark)
    if "r" in sides:
        S.bush(fg, pal, W * 0.97, H * 1.20, H * size * 1.1, col=pal["grass"] * dark * 0.9)
    return fg


def _village(pal, hz=0.60, hills=True, sun=(0.72, 0.30), clouds=0.55, moon=False,
             stars=False, sun_r=0.05):
    S.HZ = hz * H
    bg = _c()
    S.sky(bg, pal, sun_xy=sun, sun_r=sun_r, clouds=clouds, moon=moon, stars=stars)
    if hills:
        S.hills(bg, pal, S.HZ, H * 0.075, pal["far"], seed=int(hz * 100), layers=2)
    return bg


# ================================================================= ACT I
def s01(pal):
    """Mohanpur village at sunrise"""
    bg = _village(pal, hz=0.60, sun=(0.64, 0.50), clouds=0.7, sun_r=0.045)
    S.birds(bg, pal, H * 0.28, 8, 4, 0.32, 1.1)
    mid = _c()
    S.ground(mid, pal, seed=5)
    S.path(mid, pal, y0=S.HZ, x_top=0.58, w_top=0.015, x_bot=0.52, w_bot=0.20)
    S.field_rows(mid, pal, S.HZ + 30, -0.12, 0.30, n=7)
    S.field_rows(mid, pal, S.HZ + 30, 0.74, 1.12, n=5)
    S.tree(mid, pal, W * 0.11, S.HZ * 1.42, H * 0.46, seed=1)
    S.tree(mid, pal, W * 0.90, S.HZ * 1.34, H * 0.34, seed=5)
    S.house(mid, pal, W * 0.70, S.HZ * 1.10, W * 0.11, H * 0.10, lit=(1.0, 0.78, 0.42))
    S.house(mid, pal, W * 0.82, S.HZ * 1.05, W * 0.08, H * 0.08)
    S.house(mid, pal, W * 0.36, S.HZ * 1.06, W * 0.07, H * 0.07)
    for i, x in enumerate((0.46, 0.52, 0.58)):
        S.simple_person(mid, W * x, S.HZ * 1.42 + i * 8, H * 0.10 + i * 3,
                        mix(hx("c85a53"), pal["haze"], 0.35), pal)
    subj = _c()
    S.dust_motes(subj, 34, 3, region=(0, int(H * 0.42), W, H))
    return _box([bg, mid, subj, _fg_bushes(pal, 0.5)],
                "zoom_in", 1.0, vig=0.62, grain=0.055,
                title="नीलू और ज्ञान का चश्मा")


def s02(pal):
    """Bittu runs down the lane — hero intro"""
    bg = _village(pal, hz=0.57, sun=(0.80, 0.28), clouds=0.45)
    mid = _c()
    S.ground(mid, pal)
    S.path(mid, pal, x_top=0.26, w_top=0.015, x_bot=0.20, w_bot=0.26)
    S.house(mid, pal, W * 0.80, S.HZ * 1.20, W * 0.14, H * 0.13)
    S.house(mid, pal, W * 0.10, S.HZ * 1.16, W * 0.10, H * 0.10)
    S.tree(mid, pal, W * 0.93, S.HZ * 1.44, H * 0.38, seed=2)
    subj = _c()
    S.boy(subj, W * 0.46, GY, 0.42 * H, pose="run", pal=pal, facing=1, mouth="open")
    S.butterfly(subj, W * 0.66, H * 0.52, H * 0.045)
    S.book(subj, W * 0.40, H * 0.78, H * 0.048, open_=False)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.42, ("r",))],
                "pan_r", 1.0, vig=0.5,
                caption="बिट्टू — मोहनपुर का शरारती लड़का")


def s03(pal):
    """inside the house — mother calls, Bittu hides under the quilt"""
    bg = _c()
    S.room(bg, pal, sun=(0.82, 0.26))
    S.pot(bg, W * 0.05, H * 0.84, H * 0.13)
    S.pot(bg, W * 0.10, H * 0.81, H * 0.08)
    mid = _c()
    S.table(mid, pal, W * 0.18, H * 0.84, H * 0.26)
    S.bucket(mid, W * 0.07, H * 0.90, H * 0.09)
    subj = _c()
    # ---- charpai (woven cot) on the right ----
    bx, by = W * 0.70, H * 0.905
    cw, ch = H * 0.36, H * 0.115                 # cot half-width / height
    G.shadow(subj, bx, by + H * 0.012, cw * 0.95, H * 0.022, 0.38)
    for sx in (-0.92, -0.30, 0.30, 0.92):
        G.capsule(subj, bx + sx * cw, by, bx + sx * cw * 0.94, by - ch,
                  H * 0.010, H * 0.010, hx("6a4a2c"))
    G.gradient_rect(subj, bx - cw, by - ch, bx + cw, by - ch + H * 0.026,
                    hx("a87a44"), hx("6a4a26"), vertical=True)
    for i in range(16):                          # rope weave
        xx = bx - cw + 2 * cw * i / 15
        G.capsule(subj, xx, by - ch + H * 0.004, xx, by - ch + H * 0.022, 2.2, 2.2,
                  hx("d9c08a"))
    # ---- quilt with a lump where Bittu is hiding ----
    qy = by - ch - H * 0.012
    G.sphere(subj, bx + H * 0.045, qy + H * 0.008, H * 0.170, hx("c85a4a"),
             light=(-0.42, -0.72, 0.58), spec=0.14, rim=0.20, rim_col=pal["skylight"],
             amb=0.62, squash=(1.70, 0.40))
    G.capsule(subj, bx - H * 0.10, qy + H * 0.004, bx + H * 0.20, qy + H * 0.010,
              H * 0.012, H * 0.012, hx("a8433a"))      # quilt seam
    G.sphere(subj, bx - H * 0.10, qy - H * 0.020, H * 0.075, hx("d4653f"),
             light=(-0.42, -0.72, 0.58), spec=0.12, rim=0.2, amb=0.7, squash=(1.2, 0.85))
    # pillow + Bittu's head poking out, blanket over the mouth
    G.sphere(subj, bx - H * 0.155, qy - H * 0.020, H * 0.062, hx("efe6d2"),
             light=(-0.42, -0.72, 0.58), spec=0.1, rim=0.1, amb=0.8, squash=(1.25, 0.62))
    S.boy(subj, bx - H * 0.105, qy + H * 0.022, 0.140 * H, pose="sit", pal=pal, mouth="sad",
          shadow_on=False, facing=1)
    G.soft_blob(subj, bx - H * 0.105, qy + H * 0.020, H * 0.070, H * 0.024, hx("c85a4a"),
                0.95, 5)                          # blanket pulled to the chin
    # ---- mother, hands on hips, closer so she fills the left third ----
    S.adult(subj, W * 0.30, H * 0.99, 0.62 * H, pal, shirt=hx("4f7f5a"), saree=True,
            pose="hips", dupatta=hx("e8c04a"))
    fg = _c()
    S.lantern(fg, W * 0.96, H * 0.50, H * 0.055, 0.7)
    return _box([bg, mid, subj, fg], "zoom_in", 0.9, vig=0.56,
                caption="माँ: “बिट्टू! स्कूल का वक़्त हो गया!”", dof=(0, 1.5, 0, 7))


def s04(pal):
    """rooftop at night — the shooting star"""
    bg = _village(pal, hz=0.58, sun=(0.30, 0.20), sun_r=0.032, moon=True, stars=True,
                  clouds=0.12)
    for i in range(30):
        t = i / 29
        G.soft_blob(bg, W * (0.16 + 0.44 * t), H * (0.06 + 0.22 * t),
                    H * 0.009 * (1 - 0.6 * t), H * 0.004 * (1 - 0.5 * t),
                    hx("ffeecb"), 0.9 * (1 - t), 2)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.06, lit=True)
    subj = _c()
    # parapet + roof slab
    G.gradient_rect(subj, -10, H * 0.86, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.30) * 0.85,
                    mix(pal["ground"], pal["far"], 0.30) * 0.45, vertical=True)
    G.gradient_rect(subj, -10, RY - H * 0.055, W + 10, RY - H * 0.02,
                    mix(pal["ground"], pal["far"], 0.2) * 1.1,
                    mix(pal["ground"], pal["far"], 0.2) * 0.8, vertical=True)
    S.cot(subj, pal, W * 0.62, RY + H * 0.02, H * 0.34)
    S.boy(subj, W * 0.40, RY + H * 0.01, 0.32 * H, pose="sit_fold", pal=pal, facing=1)
    fg = _c()
    S.lantern(fg, W * 0.14, H * 0.93, H * 0.06, 1.0)
    return _box([bg, mid, subj, fg], "zoom_out", 1.0, vig=0.56, grain=0.08,
                caption="उस रात आसमान में एक चमकती लकीर दौड़ी…")


def s05(pal):
    """the crash site — crater glow, village lanterns on the hill"""
    bg = _village(pal, hz=0.60, sun=(0.50, 0.24), sun_r=0.026, moon=True, stars=True,
                  clouds=0.06)
    S.hills(bg, pal, S.HZ * 1.45, H * 0.05, pal["far"], seed=3, layers=1)
    mid = _c()
    S.jungle(mid, pal, y0=H * 0.66, seed=4, fog=0.7, n=6, dark=0.42)
    subj = _c()
    G.gradient_rect(subj, 0, H * 0.68, W, H, mix(hx("2c3226"), hx("0e140c"), 0.5),
                    mix(hx("1a2016"), hx("080a06"), 0.55), vertical=True)
    cx, cy = W * 0.54, H * 0.83
    G.glow(subj, cx, cy, W * 0.17, hx("7fc8ff"), 0.42, 2.0)
    G.soft_blob(subj, cx, cy, W * 0.11, H * 0.045, hx("232a30"), 0.95, 12)
    G.soft_blob(subj, cx, cy - H * 0.004, W * 0.088, H * 0.032, hx("3f7ba4"), 0.9, 10)
    G.soft_blob(subj, cx, cy - H * 0.008, W * 0.058, H * 0.020, hx("c8ecff"), 0.95, 8)
    for i in range(14):
        a = i * 0.66
        G.soft_blob(subj, cx + math.cos(a) * W * 0.09, cy - abs(math.sin(a)) * H * 0.05,
                    H * 0.009, H * 0.006, hx("e8f6ff"), 0.30, 4)
    for i, x in enumerate((0.86, 0.91, 0.955)):
        S.simple_person(subj, W * x, H * 0.80, H * 0.13, mix(hx("3a4a5a"), pal["haze"], 0.3), pal)
        S.lantern(subj, W * (x + 0.016), H * 0.775, H * 0.028, 1.3)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.28)],
                "zoom_in", 1.15, vig=0.58, grain=0.09,
                caption="पूरा गाँव डर कर जाग उठा…")


def s06(pal):
    """Bittu runs into the jungle with a torch"""
    bg = _village(pal, hz=0.58, sun=(0.42, 0.22), sun_r=0.024, moon=True, stars=True,
                  clouds=0.04)
    mid = _c()
    S.jungle(mid, pal, y0=H * 0.62, seed=11, fog=0.5, n=6, dark=0.36)
    subj = _c()
    G.gradient_rect(subj, 0, H * 0.70, W, H, mix(hx("2a2a22"), hx("101208"), 0.45),
                    mix(hx("1c1c16"), hx("080a06"), 0.5), vertical=True)
    S.boy(subj, W * 0.42, GY, 0.42 * H, pose="run", pal=pal, facing=1, mouth="open")
    tx, ty = W * 0.55, H * 0.60
    G.capsule(subj, W * 0.475, H * 0.74, tx, ty, H * 0.010, H * 0.008, hx("5a4030"))
    G.glow(subj, tx, ty, H * 0.13, hx("ffb45e"), 0.55, 1.9)
    G.soft_blob(subj, tx, ty - H * 0.008, H * 0.016, H * 0.030, hx("ffd98a"), 0.95, 4)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.22, ("l",))],
                "pan_r", 1.1, vig=0.60, grain=0.09,
                caption="वो दौड़ता हुआ जंगल की ओर गया…")


def s07(pal):
    """REVEAL — Neelu steps out of the pod"""
    bg = _village(pal, hz=0.60, sun=(0.34, 0.24), sun_r=0.022, moon=True, stars=True,
                  clouds=0.05)
    mid = _c()
    S.jungle(mid, pal, y0=H * 0.64, seed=13, fog=0.6, n=6, dark=0.40)
    subj = _c()
    G.gradient_rect(subj, 0, H * 0.72, W, H, mix(hx("30342a"), hx("10140e"), 0.45),
                    mix(hx("1e221a"), hx("080a08"), 0.5), vertical=True)
    # pod shell halves behind them
    for sgn in (-1, 1):
        G.soft_blob(subj, W * (0.52 + sgn * 0.155), H * 0.845, W * 0.075, H * 0.075,
                    hx("a8dcee"), 0.92, 12)
        G.soft_blob(subj, W * (0.52 + sgn * 0.155), H * 0.845, W * 0.052, H * 0.055,
                    hx("eafaff"), 0.80, 9)
    G.glow(subj, W * 0.52, H * 0.82, W * 0.19, hx("7fc8ff"), 0.40, 2.2)
    S.neelu(subj, W * 0.60, GY, 0.44 * H, pal=pal, arm="stand", eyes="open", scarf_wave=0.4)
    S.boy(subj, W * 0.30, GY, 0.36 * H, pose="stand", pal=pal, facing=1, mouth="open")
    return _box([bg, mid, subj, _fg_bushes(pal, 0.24, ("r",))],
                "zoom_in", 1.2, vig=0.56, grain=0.075,
                caption="नीलू — बाईसवीं सदी का रोबो-बिल्ला")


def s08(pal):
    """Neelu waves hello"""
    bg = _village(pal, hz=0.60, sun=(0.30, 0.22), sun_r=0.02, moon=True, stars=True,
                  clouds=0.05)
    mid = _c()
    S.jungle(mid, pal, y0=H * 0.62, seed=15, fog=0.4, n=6, dark=0.34)
    subj = _c()
    G.gradient_rect(subj, 0, H * 0.72, W, H, mix(hx("34382c"), hx("12160e"), 0.45),
                    mix(hx("22261c"), hx("0a0c08"), 0.5), vertical=True)
    G.glow(subj, W * 0.60, H * 0.74, W * 0.16, hx("8fd0ff"), 0.28, 2.4)
    S.boy(subj, W * 0.33, GY, 0.36 * H, pose="sit_fold", pal=pal, facing=1, mouth="open")
    S.neelu(subj, W * 0.62, GY, 0.44 * H, pal=pal, arm="wave", eyes="happy", scarf_wave=0.8)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.24)],
                "zoom_out", 1.0, vig=0.56, grain=0.07,
                caption="“नमस्ते! मैं नीलू हूँ…”")


def s09(pal):
    """the 4-D pocket spills gadgets — bedroom"""
    bg = _c()
    S.room(bg, pal, window=False)
    S.pot(bg, W * 0.92, H * 0.86, H * 0.12)
    mid = _c()
    S.bed(mid, pal, W * 0.20, H * 0.92, H * 0.42)
    S.table(mid, pal, W * 0.55, H * 0.90, H * 0.26)
    subj = _c()
    S.boy(subj, W * 0.26, H * 0.90, 0.34 * H, pose="sit", pal=pal, facing=1, mouth="open",
          shadow_on=False)
    S.neelu(subj, W * 0.62, H * 0.93, 0.42 * H, pal=pal, arm="stand", eyes="happy", scarf_wave=0.6)
    G.glow(subj, W * 0.62, H * 0.66, W * 0.13, hx("ffe08a"), 0.35, 2.2)
    S.glasses(subj, W * 0.44, H * 0.42, H * 0.042, 1.1)
    S.book(subj, W * 0.76, H * 0.38, H * 0.060, open_=True)
    S.lantern(subj, W * 0.88, H * 0.52, H * 0.040, 0.7)
    for i in range(16):
        a = i / 16 * 6.28
        G.soft_blob(subj, W * 0.62 + math.cos(a) * W * 0.14,
                    H * 0.60 + math.sin(a) * H * 0.12, H * 0.006, H * 0.006,
                    hx("ffe9b0"), 0.65, 3)
    fg = _c()
    S.lantern(fg, W * 0.07, H * 0.55, H * 0.06, 1.0)
    return _box([bg, mid, subj, fg], "zoom_in", 1.0, vig=0.6,
                caption="नीलू की जेब — चौथे आयाम का खज़ाना")


def s10(pal):
    """Neelu explains the one rule"""
    bg = _c()
    S.room(bg, pal, sun=(0.16, 0.24))
    mid = _c()
    S.table(mid, pal, W * 0.52, H * 0.92, H * 0.30)
    S.bed(mid, pal, W * 0.88, H * 0.94, H * 0.34)
    subj = _c()
    S.neelu(subj, W * 0.36, H * 0.94, 0.44 * H, pal=pal, arm="think", eyes="open", scarf_wave=0.5)
    S.boy(subj, W * 0.72, H * 0.94, 0.32 * H, pose="sit_fold", pal=pal, facing=-1,
          shadow_on=False)
    G.glow(subj, W * 0.55, H * 0.56, W * 0.09, hx("ffd98a"), 0.40, 2.0)
    for i in range(5):
        G.capsule(subj, W * 0.49, H * (0.50 + i * 0.020), W * 0.61, H * (0.50 + i * 0.020),
                  H * 0.0035, H * 0.0035, hx("fff2c8"))
    fg = _c()
    S.lantern(fg, W * 0.05, H * 0.60, H * 0.07, 1.0)
    return _box([bg, mid, subj, fg], "zoom_in", 0.9, vig=0.58,
                caption="“हर यंत्र का एक नियम है…”")


def s11(pal):
    """the knowledge glasses — hero close-up"""
    bg = _c()
    S.room(bg, pal, window=False)
    mid = _c()
    S.boy(mid, W * 0.70, H * 1.10, 0.80 * H, pose="hold", pal=pal, facing=-1, shadow_on=False)
    subj = _c()
    S.neelu(subj, W * 0.16, H * 1.06, 0.62 * H, pal=pal, arm="think", eyes="open",
            scarf_wave=0.3, shadow_on=False)
    sx, sy = W * 0.43, H * 0.50
    S.glasses(subj, sx, sy, H * 0.085, 1.0)
    G.glow(subj, sx, sy, W * 0.17, hx("ffe08a"), 0.5, 1.9)
    for i in range(24):
        a = i * 0.94
        r = H * (0.10 + 0.013 * (i % 5))
        G.soft_blob(subj, sx + math.cos(a) * r, sy + math.sin(a) * r * 0.72,
                    H * 0.005, H * 0.005, hx("fff4c0"), 0.8, 2)
    fg = _c()
    G.soft_blob(fg, W * 0.96, H * 0.26, W * 0.09, H * 0.09, hx("ffe0a0"), 0.14, 30)
    return _box([bg, mid, subj, fg], "zoom_in", 1.3, vig=0.66, grain=0.05,
                caption="ज्ञान-चश्मा — पढ़ा हुआ सब याद", dof=(0, 7, 0, 16))


def s12(pal):
    """the maths exam — the glasses go on"""
    S.HZ = 0.70 * H
    bg = _c()
    S.classroom(bg, pal, yb=S.HZ, n_desks=2)
    subj = _c()
    for i, x in enumerate((0.16, 0.66, 0.88)):
        S.adult(subj, W * x, H * (0.94 + 0.015 * i), CROWD * (0.86 + 0.05 * i), pal,
                shirt=mix(hx("7a9ac8"), pal["haze"], 0.25), pose="sit")
    S.adult(subj, W * 0.80, H * 0.90, 0.44 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="stand")
    S.boy(subj, W * 0.40, H * 0.95, 0.36 * H, pose="sit", pal=pal, facing=1)
    S.glasses(subj, W * 0.405, H * 0.715, H * 0.024, 1.0)
    fg = _c()
    G.gradient_rect(fg, 0, H * 0.965, W, H, hx("6a4a2c") * 0.55, hx("3a2410") * 0.7,
                    vertical=True)
    return _box([bg, _c(), subj, fg], "pan_l", 1.0, vig=0.55,
                caption="परीक्षा हॉल — चुपके से चश्मा")


# ================================================================= ACT II
def s13(pal):
    """answers pour out — close on the paper"""
    S.HZ = 0.70 * H
    bg = _c()
    S.classroom(bg, pal, yb=S.HZ, n_desks=1)
    subj = _c()
    S.boy(subj, W * 0.44, H * 1.02, 0.56 * H, pose="sit", pal=pal, facing=1, shadow_on=False)
    S.glasses(subj, W * 0.445, H * 0.60, H * 0.038, 1.0)
    G.gradient_rect(subj, W * 0.34, H * 0.90, W * 0.62, H * 1.02, hx("f4ecd8"),
                    hx("d8cdb2"), vertical=True)
    for i in range(7):
        G.capsule(subj, W * 0.36, H * (0.925 + i * 0.014), W * (0.50 + 0.05 * (i % 3)),
                  H * (0.925 + i * 0.014), H * 0.0028, H * 0.0028, hx("5a5a6a"))
    for i in range(18):
        a = i * 1.27
        G.soft_blob(subj, W * 0.44 + math.cos(a) * W * 0.09, H * 0.82 + math.sin(a) * H * 0.09,
                    H * 0.005, H * 0.005, hx("ffe9b0"), 0.75, 2)
    G.glow(subj, W * 0.44, H * 0.78, W * 0.09, hx("ffd98a"), 0.25, 2.4)
    fg = _c()
    G.gradient_rect(fg, 0, H * 0.975, W, H, hx("5a3a20") * 0.55, hx("30200e") * 0.7,
                    vertical=True)
    return _box([bg, _c(), subj, fg], "zoom_in", 1.05, vig=0.58,
                caption="हर सवाल का जवाब — बिजली की तरह")


def s14(pal):
    """first position! teacher hugs him"""
    bg = _c()
    S.classroom(bg, pal, yb=S.HZ, n_desks=2)
    subj = _c()
    for i, x in enumerate((0.12, 0.22, 0.84)):
        S.adult(subj, W * x, H * (0.96 + 0.01 * i), 0.40 * H, pal,
                shirt=[hx("c85a53"), hx("7a5aa8"), hx("4a7f9c")][i], pose="raise")
    S.adult(subj, W * 0.60, H * 0.96, 0.50 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="bless")
    S.boy(subj, W * 0.38, H * 0.94, 0.36 * H, pose="stand", pal=pal, facing=1, mouth="open")
    fg = _c()
    G.gradient_rect(fg, 0, H * 0.965, W, H, hx("6a4a2c") * 0.55, hx("3a2410") * 0.7,
                    vertical=True)
    return _box([bg, _c(), subj, fg], "zoom_out", 1.0, vig=0.5,
                caption="“तुमने गाँव का नाम रोशन कर दिया!”")


def s15(pal):
    """village celebration — sweets and dhol"""
    bg = _village(pal, hz=0.62, sun=(0.22, 0.32), clouds=0.6)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.14, S.HZ * 1.18, W * 0.13, H * 0.12)
    S.house(mid, pal, W * 0.88, S.HZ * 1.16, W * 0.14, H * 0.13)
    S.tree(mid, pal, W * 0.52, S.HZ * 1.40, H * 0.34, seed=4)
    for i in range(18):
        t = i / 17
        G.soft_blob(mid, W * (0.08 + 0.84 * t), H * 0.28 + math.sin(t * 9) * H * 0.02,
                    H * 0.007, H * 0.007, hx("ffae2a"), 0.85, 3)
    subj = _c()
    for i, (x, s) in enumerate(((0.17, 0.38), (0.30, 0.36), (0.72, 0.38), (0.86, 0.40))):
        S.adult(subj, W * x, H * (0.95 + 0.012 * (i % 2)), s * H, pal,
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("7a5aa8"), hx("3f8a6a")][i],
                saree=(i % 2 == 0), pose="raise")
    S.adult(subj, W * 0.50, H * 0.94, 0.44 * H, pal, shirt=hx("c8912e"), pose="raise")
    S.boy(subj, W * 0.50, H * 0.99, 0.28 * H, pose="hands_up", pal=pal, mouth="open")
    for i in range(3):
        S.pot(subj, W * (0.38 + i * 0.11), H * 1.0, H * 0.07)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.45)],
                "pan_r", 1.05, vig=0.5,
                caption="मिठाई बँटी, ढोल बजे…")


def s16(pal):
    """guilt — alone on the rooftop"""
    bg = _village(pal, hz=0.58, sun=(0.28, 0.18), sun_r=0.028, moon=True, stars=True,
                  clouds=0.08)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.08, lit=True)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.84, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.30) * 0.80,
                    mix(pal["ground"], pal["far"], 0.30) * 0.42, vertical=True)
    S.boy(subj, W * 0.44, RY, 0.30 * H, pose="sit_fold", pal=pal, facing=1, mouth="sad")
    fg = _c()
    S.lantern(fg, W * 0.16, H * 0.94, H * 0.055, 0.9)
    return _box([bg, mid, subj, fg], "zoom_in", 1.1, vig=0.56, grain=0.08,
                caption="“ये जीत मेरी नहीं थी…”")


def s17(pal):
    """Neelu sits beside him"""
    bg = _village(pal, hz=0.58, sun=(0.62, 0.16), sun_r=0.03, moon=True, stars=True,
                  clouds=0.06)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.06, lit=True)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.85, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.30) * 0.80,
                    mix(pal["ground"], pal["far"], 0.30) * 0.42, vertical=True)
    S.boy(subj, W * 0.36, RY, 0.30 * H, pose="sit_fold", pal=pal, facing=1, mouth="sad")
    S.neelu(subj, W * 0.58, RY, 0.34 * H, pal=pal, arm="think", eyes="closed", scarf_wave=0.4)
    fg = _c()
    S.lantern(fg, W * 0.92, H * 0.92, H * 0.06, 1.0)
    return _box([bg, mid, subj, fg], "zoom_out", 1.0, vig=0.56, grain=0.075,
                caption="“मुझे लगा था तुम नियम समझोगे…”")


def s18(pal):
    """the hand pump breaks — drought"""
    bg = _village(pal, hz=0.62, sun=(0.50, 0.14), sun_r=0.055, clouds=0.22)
    mid = _c()
    S.dry_ground(mid, pal)
    S.simple_person(mid, W * 0.09, H * 0.82, 0.20 * H, mix(hx("c85a53"), pal["haze"], 0.4), pal)
    S.simple_person(mid, W * 0.93, H * 0.84, 0.18 * H, mix(hx("4a7f9c"), pal["haze"], 0.4), pal)
    subj = _c()
    S.handpump(subj, W * 0.50, H * 0.97, 0.56 * H, water=False)
    S.bucket(subj, W * 0.33, H * 0.98, H * 0.09)
    S.bucket(subj, W * 0.66, H * 0.99, H * 0.10)
    S.heat_haze(subj, 0.12)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.6, ("r",))],
                "zoom_in", 1.1, vig=0.52, grain=0.05,
                caption="गाँव का हैंडपंप टूट गया…")


def s19(pal):
    """a queue of empty buckets"""
    bg = _village(pal, hz=0.60, sun=(0.30, 0.16), sun_r=0.05, clouds=0.28)
    mid = _c()
    S.dry_ground(mid, pal)
    S.house(mid, pal, W * 0.09, S.HZ * 1.16, W * 0.11, H * 0.10)
    subj = _c()
    S.handpump(subj, W * 0.92, H * 0.88, 0.36 * H, water=False)
    for i, x in enumerate((0.14, 0.28, 0.42, 0.55, 0.66)):
        s = (0.40 - i * 0.02) * H
        S.adult(subj, W * x, H * (0.95 + i * 0.010), s, pal, saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e"), hx("7a5aa8"),
                       hx("3f8a6a")][i])
        S.bucket(subj, W * (x + 0.048), H * (0.965 + i * 0.010), H * 0.062)
    S.heat_haze(subj, 0.10)
    fg = _c()
    S.bucket(fg, W * 0.03, H * 1.01, H * 0.15)
    return _box([bg, mid, subj, fg], "pan_r", 1.0, vig=0.5,
                caption="पानी के बिना पूरा गाँव तड़पने लगा")


def s20(pal):
    """Thakur kaka points at the hillside where the old pipe is buried"""
    bg = _village(pal, hz=0.56, sun=(0.74, 0.16), clouds=0.30)
    S.hills(bg, pal, S.HZ * 1.04, H * 0.13, pal["far"], seed=19, layers=2)
    mid = _c()
    S.dry_ground(mid, pal)
    # the rocky hillside with the buried pipe stub
    S.hills(mid, pal, S.HZ * 1.30, H * 0.13, mix(hx("9a7a52"), pal["haze"], 0.12),
            seed=21, layers=1)
    G.capsule(mid, W * 0.62, H * 0.615, W * 0.78, H * 0.575, H * 0.012, H * 0.012,
              hx("5a6670"))
    G.capsule(mid, W * 0.78, H * 0.575, W * 0.845, H * 0.590, H * 0.010, H * 0.010,
              hx("6a7680"))
    subj = _c()
    S.adult(subj, W * 0.28, H * 0.99, 0.58 * H, pal, shirt=hx("efe9dc"), beard=True,
            turban=True, pose="point", skin=mix(hx("8a5a34"), pal["haze"], 0.1))
    for i, x in enumerate((0.58, 0.70, 0.82)):
        S.adult(subj, W * x, H * (1.0 + 0.006 * i), (0.42 + 0.02 * i) * H, pal,
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e")][i], saree=(i == 1))
    S.heat_haze(subj, 0.08)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.55, ("l",))],
                "zoom_in", 1.0, vig=0.5,
                caption="“पहाड़ी के नीचे पुराना पाइप दबा है…”")


def s21(pal):
    """the glasses give him nothing"""
    bg = _village(pal, hz=0.60, sun=(0.50, 0.12), sun_r=0.06, clouds=0.18)
    mid = _c()
    S.dry_ground(mid, pal)
    subj = _c()
    for i, x in enumerate((0.11, 0.86)):
        S.adult(subj, W * x, H * 0.96, 0.42 * H, pal, shirt=hx("7a8a9c"), saree=(i == 0))
    S.boy(subj, W * 0.48, H * 0.96, 0.42 * H, pose="hands_up", pal=pal, facing=1, mouth="open")
    S.glasses(subj, W * 0.485, H * 0.66, H * 0.028, 0.22)
    S.heat_haze(subj, 0.12)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.55, ("r",))],
                "zoom_in", 1.0, vig=0.5, grain=0.05,
                caption="चश्मा याद दिलाता है — सोचता नहीं")


def s22(pal):
    """the village looks at him — silence"""
    bg = _village(pal, hz=0.66, sun=(0.60, 0.16), sun_r=0.055, clouds=0.22)
    mid = _c()
    S.dry_ground(mid, pal)
    subj = _c()
    S.boy(subj, W * 0.50, H * 0.98, 0.28 * H, pose="stand", pal=pal, facing=1, mouth="sad")
    for i, x in enumerate((0.13, 0.28, 0.72, 0.87)):
        S.adult(subj, W * x, H * (0.99 + 0.006 * i), (0.44 + 0.02 * (i % 2)) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e"), hx("7a5aa8")][i])
        S.bucket(subj, W * (x + 0.05), H * 1.0, H * 0.075)
    S.heat_haze(subj, 0.10)
    fg = _c()
    S.bucket(fg, W * 0.03, H * 1.02, H * 0.12)
    return _box([bg, mid, subj, fg], "zoom_out", 1.05, vig=0.55,
                caption="सामने खड़ा पूरा गाँव उसकी ओर देख रहा था")


def s23(pal):
    """Neelu's wisdom at dusk"""
    bg = _village(pal, hz=0.60, sun=(0.30, 0.50), sun_r=0.045, clouds=0.7)
    mid = _c()
    S.ground(mid, pal, col=mix(pal["ground"], hx("a8865a"), 0.3))
    S.house(mid, pal, W * 0.87, S.HZ * 1.20, W * 0.12, H * 0.11, lit=(1.0, 0.72, 0.35))
    S.tree(mid, pal, W * 0.09, S.HZ * 1.42, H * 0.38, seed=6, dark=0.8)
    subj = _c()
    S.boy(subj, W * 0.38, GY, 0.40 * H, pose="stand", pal=pal, facing=1, mouth="sad")
    S.neelu(subj, W * 0.63, GY, 0.42 * H, pal=pal, arm="think", eyes="open", scarf_wave=0.7)
    G.glow(subj, W * 0.65, H * 0.48, W * 0.08, hx("ffd98a"), 0.22, 2.4)
    return _box([bg, mid, subj, _fg_bushes(pal, 0.45)],
                "zoom_in", 1.0, vig=0.6,
                caption="“असली जवाब दिमाग़ में होता है…”")


def s24(pal):
    """the confession"""
    bg = _village(pal, hz=0.62, sun=(0.40, 0.20), clouds=0.36)
    mid = _c()
    S.dry_ground(mid, pal)
    S.house(mid, pal, W * 0.12, S.HZ * 1.18, W * 0.12, H * 0.11)
    subj = _c()
    for i, x in enumerate((0.09, 0.21, 0.30, 0.74, 0.85, 0.94)):
        S.adult(subj, W * x, H * (0.99 + 0.006 * (i % 3)), (0.38 + 0.02 * (i % 3)) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e"), hx("7a5aa8"),
                       hx("3f8a6a"), hx("a85a2a")][i])
    S.adult(subj, W * 0.70, H * 0.97, 0.46 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="stand")
    S.boy(subj, W * 0.50, H * 0.99, 0.32 * H, pose="stand", pal=pal, facing=1, mouth="smile")
    fg = _c()
    S.bucket(fg, W * 0.02, H * 1.02, H * 0.11)
    return _box([bg, mid, subj, fg], "zoom_in", 1.05, vig=0.55,
                caption="“मैंने परीक्षा में चश्मा पहना था…”")


def s25(pal):
    """forgiveness"""
    bg = _village(pal, hz=0.65, sun=(0.24, 0.24), clouds=0.5)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.89, S.HZ * 1.20, W * 0.13, H * 0.12, lit=(1.0, 0.74, 0.4))
    subj = _c()
    for i, x in enumerate((0.09, 0.19, 0.88)):
        S.adult(subj, W * x, H * 1.0, (0.40 + 0.02 * i) * H, pal, saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("7a5aa8"), hx("4a7f9c")][i])
    S.adult(subj, W * 0.62, H * 0.98, 0.48 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="bless")
    S.boy(subj, W * 0.36, H * 0.97, 0.36 * H, pose="stand", pal=pal, facing=1, mouth="smile")
    return _box([bg, mid, subj, _fg_bushes(pal, 0.5, ("r",))],
                "zoom_in", 1.0, vig=0.55,
                caption="“सच बोलने की हिम्मत…”")


def s26(pal):
    """study all night"""
    bg = _c()
    S.room(bg, pal, sun=(0.86, 0.20))
    mid = _c()
    S.table(mid, pal, W * 0.48, H * 0.92, H * 0.30)
    S.bed(mid, pal, W * 0.92, H * 0.94, H * 0.30)
    for i, (x, y, s) in enumerate(((0.34, 0.88, 0.075), (0.46, 0.90, 0.085), (0.60, 0.89, 0.07))):
        S.book(mid, W * x, H * y, H * s, open_=(i == 1))
    subj = _c()
    S.boy(subj, W * 0.36, H * 0.97, 0.40 * H, pose="sit_fold", pal=pal, facing=1,
          shadow_on=False)
    S.neelu(subj, W * 0.64, H * 0.97, 0.34 * H, pal=pal, arm="think", eyes="closed",
            scarf_wave=0.3)
    for i in range(4):
        G.capsule(subj, W * 0.26, H * (0.94 + i * 0.018), W * (0.44 + 0.06 * (i % 2)),
                  H * (0.94 + i * 0.018), H * 0.0035, H * 0.0035, hx("5a7a8c"))
    fg = _c()
    S.lantern(fg, W * 0.88, H * 0.60, H * 0.085, 1.2)
    return _box([bg, mid, subj, fg], "zoom_in", 1.0, vig=0.7,
                caption="पूरी रात पढ़ते हुए सुबह हो गई")


def s27(pal):
    """dawn — the plan is ready"""
    bg = _c()
    S.room(bg, pal, sun=(0.16, 0.26))
    mid = _c()
    S.table(mid, pal, W * 0.44, H * 0.94, H * 0.28)
    for i, (x, y, s) in enumerate(((0.30, 0.90, 0.08), (0.54, 0.91, 0.07))):
        S.book(mid, W * x, H * y, H * s, open_=True)
    subj = _c()
    S.boy(subj, W * 0.36, H * 0.97, 0.40 * H, pose="point", pal=pal, facing=1, mouth="smile",
          shadow_on=False)
    S.neelu(subj, W * 0.70, H * 0.97, 0.30 * H, pal=pal, arm="stand", eyes="closed",
            scarf_wave=0.2)
    for i in range(5):
        G.capsule(subj, W * 0.22, H * (0.92 + i * 0.014), W * (0.44 + 0.05 * (i % 2)),
                  H * (0.92 + i * 0.014), H * 0.0028, H * 0.0028, hx("8a6a3a"))
    fg = _c()
    G.soft_blob(fg, W * 0.08, H * 0.30, W * 0.14, H * 0.20, pal["sun"], 0.18, 40)
    return _box([bg, mid, subj, fg], "zoom_out", 1.0, vig=0.58,
                caption="“इसे साइफ़न कहते हैं!”")


def s28(pal):
    """the diagram on a slate"""
    bg = _village(pal, hz=0.58, sun=(0.76, 0.20), clouds=0.38)
    S.hills(bg, pal, S.HZ * 1.04, H * 0.11, pal["far"], seed=29, layers=2)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.11, S.HZ * 1.18, W * 0.12, H * 0.11)
    subj = _c()
    for i, x in enumerate((0.10, 0.18, 0.84, 0.93)):
        S.adult(subj, W * x, H * (1.0 + 0.005 * i), (0.40 + 0.02 * (i % 2)) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("7a5aa8"), hx("c8912e")][i])
    S.boy(subj, W * 0.36, H * 0.97, 0.38 * H, pose="point", pal=pal, facing=1, mouth="open")
    sx, sy = W * 0.62, H * 0.52
    G.gradient_rect(subj, sx - W * 0.085, sy - H * 0.115, sx + W * 0.085, sy + H * 0.115,
                    hx("3a4a44"), hx("28332e"), vertical=True)
    for i in range(3):
        G.capsule(subj, sx - W * 0.06, sy + H * (0.04 - i * 0.035), sx + W * 0.06,
                  sy + H * (0.025 - i * 0.035), H * 0.0035, H * 0.0035, hx("e8f0e8"))
    G.capsule(subj, sx - W * 0.05, sy - H * 0.085, sx + W * 0.02, sy - H * 0.085,
              H * 0.005, H * 0.005, hx("e8f0e8"))
    return _box([bg, mid, subj, _fg_bushes(pal, 0.5, ("l",))],
                "pan_l", 1.0, vig=0.52,
                caption="“पानी ऊपर खुद आएगा!”")


def s29(pal):
    """teamwork — digging, pipes, lifting"""
    bg = _village(pal, hz=0.60, sun=(0.24, 0.24), clouds=0.42)
    S.hills(bg, pal, S.HZ * 1.06, H * 0.09, pal["far"], seed=31, layers=2)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.91, S.HZ * 1.20, W * 0.12, H * 0.11)
    subj = _c()
    G.soft_blob(subj, W * 0.46, H * 0.95, W * 0.30, H * 0.035, hx("4a3520"), 0.8, 14)
    for i, x in enumerate((0.14, 0.26, 0.76, 0.88)):
        S.adult(subj, W * x, H * (0.98 + 0.008 * (i % 2)), (0.40 + 0.02 * i) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e"), hx("3f8a6a")][i],
                pose="raise" if i % 2 else "stand")
    G.capsule(subj, W * 0.24, H * 0.62, W * 0.60, H * 0.66, H * 0.016, H * 0.016, hx("5a6670"))
    S.neelu(subj, W * 0.62, H * 0.97, 0.34 * H, pal=pal, arm="up", eyes="happy", scarf_wave=0.9)
    S.boy(subj, W * 0.42, H * 0.99, 0.28 * H, pose="point", pal=pal, facing=1, mouth="open")
    return _box([bg, mid, subj, _fg_bushes(pal, 0.5)],
                "pan_r", 1.0, vig=0.52,
                caption="पूरा गाँव जुट गया")


def s30(pal):
    """WATER!"""
    bg = _village(pal, hz=0.62, sun=(0.36, 0.18), clouds=0.55)
    for i, c in enumerate((hx("ff6b6b"), hx("ffd166"), hx("7bd389"), hx("6bc6ff"))):
        m = S.arc_mask(W, H, W * 0.36, H * 0.74, H * (0.36 + i * 0.012), 195, 345, H * 0.007)
        bg.over_mask(0, 0, m * 0.26, c)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.90, S.HZ * 1.20, W * 0.13, H * 0.12)
    subj = _c()
    S.handpump(subj, W * 0.40, H * 0.96, 0.50 * H, water=True)
    S.boy(subj, W * 0.28, H * 1.0, 0.32 * H, pose="hands_up", pal=pal, mouth="open")
    S.neelu(subj, W * 0.57, H * 1.0, 0.32 * H, pal=pal, arm="up", eyes="happy", scarf_wave=1.2)
    for i, x in enumerate((0.72, 0.84, 0.94, 0.13)):
        S.adult(subj, W * x, H * (1.01 + 0.006 * (i % 2)), (0.40 + 0.02 * (i % 2)) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("4a7f9c"), hx("c8912e"), hx("7a5aa8")][i],
                pose="raise")
    for i in range(10):
        G.soft_blob(subj, W * (0.28 + 0.028 * i), H * (0.72 + 0.02 * (i % 3)),
                    H * 0.008, H * 0.012, hx("cdeeff"), 0.85, 3)
    fg = _c()
    S.bucket(fg, W * 0.02, H * 1.02, H * 0.13)
    return _box([bg, mid, subj, fg], "zoom_out", 1.15, vig=0.48,
                caption="पानी की धार फूट पड़ी!")


# ================================================================= ACT III
def s31(pal):
    """the real hero"""
    bg = _village(pal, hz=0.63, sun=(0.22, 0.28), clouds=0.55)
    mid = _c()
    S.ground(mid, pal)
    S.house(mid, pal, W * 0.12, S.HZ * 1.20, W * 0.13, H * 0.12, lit=(1.0, 0.76, 0.42))
    subj = _c()
    for i, x in enumerate((0.09, 0.19, 0.84, 0.94)):
        S.adult(subj, W * x, H * (1.0 + 0.006 * (i % 2)), (0.40 + 0.02 * (i % 2)) * H, pal,
                saree=(i % 2 == 0),
                shirt=[hx("c85a53"), hx("7a5aa8"), hx("4a7f9c"), hx("3f8a6a")][i],
                pose="raise")
    S.adult(subj, W * 0.62, H * 0.98, 0.48 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="raise")
    S.boy(subj, W * 0.38, H * 0.97, 0.36 * H, pose="stand", pal=pal, facing=1, mouth="smile")
    fg = _c()
    for i in range(14):
        t = i / 13
        G.soft_blob(fg, W * (0.05 + 0.90 * t), H * 0.14 + math.sin(t * 8) * H * 0.02,
                    H * 0.006, H * 0.006, hx("ffae2a"), 0.7, 3)
    return _box([bg, mid, subj, fg], "zoom_in", 1.0, vig=0.5,
                caption="“आज गाँव का असली हीरो ये है!”")


def s32(pal):
    """rooftop laughter at sunset"""
    bg = _village(pal, hz=0.58, sun=(0.74, 0.48), sun_r=0.05, clouds=0.8)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.08, lit=True)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.84, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.25) * 0.9,
                    mix(pal["ground"], pal["far"], 0.25) * 0.5, vertical=True)
    S.boy(subj, W * 0.36, RY + H * 0.01, 0.36 * H, pose="hands_up", pal=pal, mouth="open")
    S.neelu(subj, W * 0.60, RY + H * 0.01, 0.40 * H, pal=pal, arm="up", eyes="happy",
            scarf_wave=1.3)
    fg = _c()
    G.soft_blob(fg, W * 0.50, H * 0.08, W * 0.50, H * 0.12, pal["sun"], 0.14, 50)
    return _box([bg, mid, subj, fg], "zoom_out", 1.0, vig=0.55,
                caption="दोनों ज़ोर-ज़ोर से हँसने लगे")


def s33(pal):
    """returning the glasses"""
    bg = _village(pal, hz=0.58, sun=(0.24, 0.20), sun_r=0.028, moon=True, stars=True,
                  clouds=0.08)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.06, lit=True)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.84, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.30) * 0.80,
                    mix(pal["ground"], pal["far"], 0.30) * 0.42, vertical=True)
    S.boy(subj, W * 0.37, RY, 0.34 * H, pose="hold", pal=pal, facing=1, mouth="smile")
    S.glasses(subj, W * 0.50, H * 0.74, H * 0.026, 1.0)
    S.neelu(subj, W * 0.64, RY, 0.36 * H, pal=pal, arm="think", eyes="happy", scarf_wave=0.5)
    fg = _c()
    S.lantern(fg, W * 0.09, H * 0.93, H * 0.055, 1.0)
    return _box([bg, mid, subj, fg], "zoom_in", 1.05, vig=0.56,
                caption="“मुझे अब इसकी ज़रूरत नहीं…”")


def s34(pal):
    """the honest exam"""
    bg = _c()
    S.classroom(bg, pal, yb=S.HZ, n_desks=2)
    subj = _c()
    for i, x in enumerate((0.13, 0.63, 0.88)):
        S.adult(subj, W * x, H * (0.95 + 0.01 * i), (0.34 + 0.02 * i) * H, pal,
                shirt=mix(hx("7a9ac8"), pal["haze"], 0.25), pose="sit")
    S.boy(subj, W * 0.38, H * 0.96, 0.42 * H, pose="sit", pal=pal, facing=1, mouth="smile")
    G.gradient_rect(subj, W * 0.24, H * 0.90, W * 0.52, H * 1.0, hx("f4ecd8"),
                    hx("d8cdb2"), vertical=True)
    S.adult(subj, W * 0.80, H * 0.92, 0.46 * H, pal, shirt=hx("efe9dc"), grey=True,
            beard=True, pose="stand")
    fg = _c()
    G.gradient_rect(fg, 0, H * 0.965, W, H, hx("6a4a2c") * 0.55, hx("3a2410") * 0.7,
                    vertical=True)
    return _box([bg, _c(), subj, fg], "pan_l", 1.0, vig=0.55,
                caption="“बहुत अच्छा लिखा — अपने दम पर”")


def s35(pal):
    """farewell under the stars"""
    bg = _village(pal, hz=0.58, sun=(0.28, 0.16), sun_r=0.024, moon=True, stars=True,
                  clouds=0.08)
    for i in range(28):
        t = i / 27
        G.soft_blob(bg, W * (0.58 + 0.32 * t), H * (0.05 + 0.16 * t),
                    H * 0.008 * (1 - 0.5 * t), H * 0.004 * (1 - 0.4 * t),
                    hx("e8f2ff"), 0.85 * (1 - t), 2)
    mid = _c()
    S.rooftop_village(mid, pal, yb=S.HZ * 1.06, lit=True)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.86, W + 10, H + 10,
                    mix(pal["ground"], pal["far"], 0.28) * 0.75,
                    mix(pal["ground"], pal["far"], 0.28) * 0.4, vertical=True)
    S.boy(subj, W * 0.40, RY + H * 0.01, 0.28 * H, pose="sit_fold", pal=pal, facing=1)
    S.neelu(subj, W * 0.60, RY + H * 0.01, 0.30 * H, pal=pal, arm="stand", eyes="open",
            scarf_wave=0.4)
    fg = _c()
    S.lantern(fg, W * 0.13, H * 0.94, H * 0.055, 0.9)
    return _box([bg, mid, subj, fg], "zoom_out", 1.1, vig=0.72, grain=0.07,
                caption="“वादा करो, हर साल गाँव आना…”")


def s36(pal):
    """final wide — the moral"""
    bg = _village(pal, hz=0.62, sun=(0.80, 0.20), sun_r=0.028, moon=True, stars=True,
                  clouds=0.22)
    mid = _c()
    S.ground(mid, pal, col=mix(pal["ground"], hx("2a3a4a"), 0.35))
    S.house(mid, pal, W * 0.18, S.HZ * 1.14, W * 0.11, H * 0.10, lit=(1.0, 0.82, 0.5))
    S.house(mid, pal, W * 0.80, S.HZ * 1.16, W * 0.12, H * 0.11, lit=(1.0, 0.78, 0.45))
    S.house(mid, pal, W * 0.50, S.HZ * 1.08, W * 0.08, H * 0.07, lit=(1.0, 0.72, 0.4))
    S.tree(mid, pal, W * 0.93, S.HZ * 1.36, H * 0.32, seed=43, dark=0.65)
    subj = _c()
    G.gradient_rect(subj, -10, H * 0.90, W + 10, H + 10,
                    mix(pal["ground"], hx("1a2430"), 0.5),
                    mix(pal["ground"], hx("0e141c"), 0.6), vertical=True)
    S.boy(subj, W * 0.46, H * 0.915, 0.13 * H, pose="sit_fold", pal=pal, facing=1)
    S.neelu(subj, W * 0.52, H * 0.915, 0.14 * H, pal=pal, arm="stand", eyes="open",
            scarf_wave=0.6)
    fg = _c()
    S.tree(fg, pal, W * 0.02, H * 1.06, H * 0.40, seed=45, dark=0.32)
    return _box([bg, mid, subj, fg], "zoom_out", 1.25, vig=0.58, grain=0.06,
                title="मेहनत से कमाया ज्ञान — सबसे बड़ा खज़ाना")


SCENES = {i: globals()[f"s{i:02d}"] for i in range(1, 37)}
