"""Fast regression tests for the cartoon-film pipeline (movie/).

These are deliberately cheap: they never render a video. They lock in the three
things that were actually broken during development:

  1. Pillow has no Raqm here -> Devanagari MUST be shaped with HarfBuzz,
  2. character heights are canvas pixels and must land inside the safe area,
  3. the 36 shots must return a 4-layer stack (sky / ground / subject / fg).
"""
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "movie"))

from lib import cgilib as G          # noqa: E402
from lib import film as F            # noqa: E402
from lib import scenes as S          # noqa: E402

FONT_BOLD = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Bold.ttf")
FONT_REG = os.path.join(ROOT, "assets", "fonts", "NotoSansDevanagari-Regular.ttf")


def test_fonts_present():
    assert os.path.getsize(FONT_REG) > 100_000
    assert os.path.getsize(FONT_BOLD) > 100_000


def test_devanagari_is_shaped_not_codepoint_rendered():
    """किताब has 6 code points; a correct shaper emits fewer glyphs because the
    i-matra and conjuncts are reordered/composed. If someone swaps the text
    renderer for plain Pillow text, this test fails."""
    tr = G.TextRenderer(FONT_REG)
    # ज्ञान is a conjunct cluster: ज + ् + ञ + ा + न (5 code points) collapses
    # into 3 glyphs. Code-point-by-code-point rendering cannot do this.
    shaped = tr.shape("ज्ञान", 48)
    assert len(shaped) == 3
    assert len("ज्ञान") == 5
    # "कि" must be reordered: the i-matra glyph is placed before the consonant,
    # so the first glyph must NOT be the glyph of "क".
    ka = tr.shape("क", 48)[0][0].codepoint
    ki = tr.shape("कि", 48)
    assert len(ki) == 2 and ki[0][0].codepoint != ka
    # advances must be positive and the total must be sane
    adv = sum(p.x_advance for _, p in shaped) / 64.0
    assert 20 < adv < 300


def test_masks_are_antialiased_and_bounded():
    m = G.m_disc(64, 64, 32, 32, 20, soft=1.2)
    assert m.shape == (64, 64)
    assert m.max() > 0.95 and m.min() < 0.05
    assert ((m > 0.05) & (m < 0.95)).sum() > 20        # a real AA edge exists
    e = G.m_ellipse(80, 40, 40, 20, 30, 12)
    assert abs(e.sum() - np.pi * 30 * 12) / (np.pi * 30 * 12) < 0.15


def test_sphere_shading_has_specular_and_terminal():
    base = np.array([0.4, 0.6, 0.9], np.float32)
    rgb, a = G.shade_sphere(120, 120, 60, 60, 50, base, light=(-0.5, -0.6, 0.62))
    assert rgb.shape == (120, 120, 3)
    assert rgb.max() > base.max() * 1.1        # specular highlight exists
    # light comes from upper-left, so the right limb is the dark terminator
    assert rgb[60, 100].mean() < rgb[60, 60].mean() * 0.9
    assert rgb[60, 20].mean() > rgb[60, 60].mean()          # lit side is brighter
    assert a.max() > 0.95 and a.min() < 0.01


def test_every_shot_returns_four_layers_with_parallax():
    # only a sample: building all 36 takes minutes
    for sid in (1, 7, 30):
        d = F.SCENES[sid](S.PAL["day"])
        assert len(d["layers"]) == 4
        parallax = [p for _, p, _ in d["layers"]]
        assert parallax == sorted(parallax), "layers must run far -> near"
        assert parallax[0] < parallax[-1]
        for cv, _, _ in d["layers"]:
            assert cv.px.shape == (S.H, S.W, 4)
        assert d["cam"] in ("zoom_in", "zoom_out", "pan_l", "pan_r", "drift")


def test_characters_stay_inside_the_frame():
    """Staging bug that shipped once: heroes taller than the visible crop."""
    for height_frac in (0.42, 0.34, 0.18):
        h = height_frac * S.H
        cv = G.Canvas(S.W, S.H)
        S.boy(cv, S.W * 0.5, 0.93 * S.H, h, pose="stand")
        alpha = cv.px[..., 3]
        rows = np.nonzero(alpha.max(axis=1) > 0.05)[0]
        cols = np.nonzero(alpha.max(axis=0) > 0.05)[0]
        assert rows.min() > 0 and rows.max() < S.H - 1
        assert cols.min() > 0 and cols.max() < S.W - 1
        # drawn height should be close to the requested height
        drawn = rows.max() - rows.min()
        assert 0.8 * h < drawn < 1.25 * h


def test_frame_schedule_is_frame_exact():
    import json
    path = os.path.join(ROOT, "movie", "build", "timing.json")
    if not os.path.exists(path):
        return                                    # nothing rendered yet
    import importlib
    mk = importlib.import_module("make_film")
    timing = json.load(open(path))
    sched = mk.frame_schedule(timing)
    assert len(sched) == 36
    assert all(v >= 2 for v in sched.values())
    total_frames = sum(sched.values())
    assert abs(total_frames / 24.0 - timing["total"]) < 0.05


def test_audio_dsp_primitives():
    import audio
    tone = np.sin(2 * np.pi * 440 * np.arange(44100) / 44100).astype(np.float32)
    lp = audio.fft_filter(tone, 44100, "lp", f1=8000)
    hp = audio.fft_filter(tone, 44100, "hp", f1=200)
    assert np.abs(hp).max() >= np.abs(lp).max() * 0.5
    assert audio.norm(np.full(100, 0.1, np.float32), 0.9).max() > 0.85
    up = audio.resample(tone, 44100, 22050)
    assert abs(len(up) - 22050) <= 2
    comp = audio.compress(np.tanh(tone * 3).astype(np.float32))
    assert np.abs(comp).max() <= np.abs(tone * 3).max() + 1e-3


def test_film_status_reports_without_rendering():
    from movie import film_tools
    st = film_tools.film_status()
    assert st["success"] is True
    assert st["scenes_defined"] == 36
    assert st["engines"]["text"].startswith("Harfbuzz")
