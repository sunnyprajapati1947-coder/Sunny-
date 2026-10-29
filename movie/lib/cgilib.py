"""
cgilib.py — a small procedural 3D-looking CGI renderer (numpy + PIL).

No GPU, no model weights, no stock images: every frame is built from 3D
primitives (spheres, capsules, extruded boxes, perspective ground planes)
with Lambert specular shading, contact shadows, depth haze, volumetric
light and depth-of-field. Output is an RGBA layer stack so the compositor
can do true 3D parallax camera moves.

Coordinates: layer-local pixels, origin top-left, y down.
Lighting convention: light direction L points *towards* the light.
"""
from __future__ import annotations
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import freetype as ft
import uharfbuzz as hb

# --------------------------------------------------------------------------
# colour + math helpers
# --------------------------------------------------------------------------

def hx(s: str) -> np.ndarray:
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def mix(a, b, t: float) -> np.ndarray:
    return (np.asarray(a, np.float32) * (1 - t) + np.asarray(b, np.float32) * t).astype(np.float32)


def clamp01(x):
    return np.clip(x, 0.0, 1.0)


def smoothstep(e0, e1, x):
    t = clamp01((x - e0) / max(1e-6, (e1 - e0)))
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------
# canvas
# --------------------------------------------------------------------------

class Canvas:
    __slots__ = ("w", "h", "px")

    def __init__(self, w, h, bg=None):
        self.w, self.h = w, h
        self.px = np.zeros((h, w, 4), np.float32)
        if bg is not None:
            self.px[..., :3] = bg
            self.px[..., 3] = 1.0

    # -- compositing -------------------------------------------------------
    def put(self, x0, y0, crop):
        """alpha-over a (h,w,4) float crop at integer offset (clipped)."""
        h, w = crop.shape[:2]
        x1, y1 = x0 + w, y0 + h
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        dx1, dy1 = min(self.w, x1), min(self.h, y1)
        if dx1 <= dx0 or dy1 <= dy0:
            return
        sub = crop[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
        dst = self.px[dy0:dy1, dx0:dx1]
        a = sub[..., 3:4]
        dst[..., :3] = sub[..., :3] * a + dst[..., :3] * (1 - a)
        dst[..., 3:4] = a + dst[..., 3:4] * (1 - a)

    def over_mask(self, x0, y0, mask, rgb):
        """composite a constant colour through a float mask."""
        h, w = mask.shape
        crop = np.empty((h, w, 4), np.float32)
        crop[..., :3] = rgb
        crop[..., 3] = mask
        self.put(x0, y0, crop)

    def to_image(self) -> Image.Image:
        a = self.px
        arr = np.dstack([clamp01(a[..., :3]), clamp01(a[..., 3:4])])
        return Image.fromarray((arr * 255.0 + 0.5).astype(np.uint8), "RGBA")


# --------------------------------------------------------------------------
# masks
# --------------------------------------------------------------------------

def m_disc(w, h, cx, cy, r, soft=1.2):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot(x - cx, y - cy) - r
    return 1.0 - smoothstep(-soft, soft, d)


def m_ellipse(w, h, cx, cy, rx, ry, soft=1.2):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = (np.hypot((x - cx) / max(rx, 1e-3), (y - cy) / max(ry, 1e-3)) - 1.0)
    return 1.0 - smoothstep(-soft / max(rx, ry) * 1.5, soft / max(rx, ry) * 1.5, d)


def m_rect(w, h, x0, y0, x1, y1, soft=1.0):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = np.minimum(x - x0, x1 - x)
    dy = np.minimum(y - y0, y1 - y)
    d = np.minimum(dx, dy)
    return smoothstep(-soft, soft, d)


def m_round_rect(w, h, x0, y0, x1, y1, r, soft=1.2):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = np.clip(x, x0 + r, x1 - r)
    cy = np.clip(y, y0 + r, y1 - r)
    d = np.hypot(x - cx, y - cy) - r
    return 1.0 - smoothstep(-soft, soft, d)


def m_capsule(w, h, x0, y0, x1, y1, r0, r1=None, soft=1.2):
    """tapered capsule mask (distance to segment minus interpolated radius)."""
    r1 = r0 if r1 is None else r1
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = x1 - x0, y1 - y0
    L2 = max(dx * dx + dy * dy, 1e-6)
    t = clamp01(((x - x0) * dx + (y - y0) * dy) / L2)
    px, py = x0 + t * dx, y0 + t * dy
    d = np.hypot(x - px, y - py) - (r0 + (r1 - r0) * t)
    return 1.0 - smoothstep(-soft, soft, d)


def m_poly(w, h, pts, soft=0.8):
    ss = 2
    im = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(im).polygon([(p[0] * ss, p[1] * ss) for p in pts], fill=255)
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def m_tri(w, h, p0, p1, p2, soft=1.0):
    return m_poly(w, h, [p0, p1, p2], soft)


def soft_blob(cv, cx, cy, rx, ry, col, alpha=1.0, sigma=None):
    """soft-edged ellipse with padded blur (no clipped-box artefacts)."""
    sigma = max(0.8, min(rx, ry) * 0.30) if sigma is None else sigma
    pad = int(3 * sigma) + 2
    w, h = int(rx * 2) + 2 * pad, int(ry * 2) + 2 * pad
    if w < 2 or h < 2:
        return
    m = m_ellipse(w, h, w / 2, h / 2, rx, ry, 1.0)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(sigma)), np.float32) / 255.0
    cv.over_mask(int(cx - w / 2), int(cy - h / 2), m * alpha, np.asarray(col, np.float32))


def m_from_image(im: Image.Image):
    return np.asarray(im.convert("L"), np.float32) / 255.0


# --------------------------------------------------------------------------
# shading
# --------------------------------------------------------------------------

def shade_sphere(w, h, cx, cy, r, base, light=(0.45, 0.6, 0.66), spec=0.55,
                 shin=26.0, rim=0.22, rim_col=None, amb=0.34, squash=(1.0, 1.0)):
    """Full Lambert + Blinn specular + rim-lit sphere on a transparent crop.

    Returns (rgb float array hxwx3, alpha hxw)."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    rx = r * squash[0]
    ry = r * squash[1]
    ux = (x - cx) / max(rx, 1e-3)
    uy = (y - cy) / max(ry, 1e-3)
    d2 = ux * ux + uy * uy
    inside = d2 <= 1.0
    nz = np.sqrt(np.clip(1.0 - d2, 0, 1))
    alpha = 1.0 - smoothstep(0.965, 1.0, np.sqrt(d2))
    L = np.asarray(light, np.float32)
    L = L / np.linalg.norm(L)
    ndl = clamp01(ux * L[0] + uy * L[1] + nz * L[2])
    H = L + np.array([0, 0, 1.0], np.float32)
    H = H / np.linalg.norm(H)
    ndh = clamp01(ux * H[0] + uy * H[1] + nz * H[2])
    spec_m = (ndh ** shin) * spec
    rim_m = (1.0 - nz) ** 2.2 * rim
    rc = base if rim_col is None else np.asarray(rim_col, np.float32)
    lit = amb + (1.0 - amb) * ndl
    # subtle bounce light from below
    bounce = 0.10 * clamp01(-uy) * (1.0 - nz) * inside
    rgb = base[None, None, :] * lit[..., None]
    rgb = rgb + spec_m[..., None] * np.array([1.0, 0.97, 0.92], np.float32)[None, None, :]
    rgb = rgb + rim_m[..., None] * rc[None, None, :] * 0.9
    rgb = rgb + bounce[..., None] * base[None, None, :] * 0.9
    rgb = np.where(inside[..., None], rgb, 0.0)
    return rgb.astype(np.float32), (alpha * inside).astype(np.float32)


def sphere(cv: Canvas, cx, cy, r, base, **kw):
    sq = kw.get("squash", (1.0, 1.0))
    pad = 2
    w = int(r * sq[0] * 2 + 4 * pad)
    h = int(r * sq[1] * 2 + 4 * pad)
    if w < 2 or h < 2:
        return
    rgb, a = shade_sphere(w, h, w / 2, h / 2, r, np.asarray(base, np.float32), **kw)
    crop = np.dstack([rgb, a])
    cv.put(int(cx - w / 2), int(cy - h / 2), crop)


def capsule(cv, x0, y0, x1, y1, r0, r1=None, col=None, light=(-0.45, -0.55), **kw):
    """rounded 3D limb with a cross-axis shading gradient."""
    r1 = r0 if r1 is None else r1
    pad = int(max(r0, r1) + 4)
    x_lo = int(min(x0, x1) - pad); y_lo = int(min(y0, y1) - pad)
    w = int(abs(x1 - x0) + 2 * pad + 2); h = int(abs(y1 - y0) + 2 * pad + 2)
    if w < 2 or h < 2:
        return
    m = m_capsule(w, h, x0 - x_lo, y0 - y_lo, x1 - x_lo, y1 - y_lo, r0, r1, soft=1.1)
    # shading: distance from the capsule axis, biased to light side
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ax0, ay0, ax1, ay1 = x0 - x_lo, y0 - y_lo, x1 - x_lo, y1 - y_lo
    dx, dy = ax1 - ax0, ay1 - ay0
    L2 = max(dx * dx + dy * dy, 1e-6)
    t = clamp01(((xx - ax0) * dx + (yy - ay0) * dy) / L2)
    px, py = ax0 + t * dx, ay0 + t * dy
    nxv, nyv = xx - px, yy - py
    rad = r0 + (r1 - r0) * t
    nxv, nyv = nxv / np.maximum(rad, 1e-3), nyv / np.maximum(rad, 1e-3)
    nz = np.sqrt(np.clip(1 - nxv ** 2 - nyv ** 2, 0, 1))
    L = np.asarray([light[0], light[1], 0.72], np.float32)
    L /= np.linalg.norm(L)
    ndl = clamp01(nxv * L[0] + nyv * L[1] + nz * L[2])
    amb = kw.get("amb", 0.38)
    lit = amb + (1 - amb) * ndl
    spec_m = (clamp01(nzv := nz) ** 18) * kw.get("spec", 0.22)
    rgb = np.asarray(col, np.float32)[None, None, :] * lit[..., None]
    rgb = rgb + spec_m[..., None] * 0.9
    crop = np.dstack([rgb * m[..., None], m])
    cv.put(x_lo, y_lo, crop.astype(np.float32))


def gradient_rect(cv, x0, y0, x1, y1, c0, c1, vertical=True, soft=1.0):
    w, h = int(x1 - x0), int(y1 - y0)
    if w < 1 or h < 1:
        return
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (yy / max(h - 1, 1)) if vertical else (xx / max(w - 1, 1))
    rgb = np.asarray(c0, np.float32)[None, None, :] * (1 - t[..., None]) + \
          np.asarray(c1, np.float32)[None, None, :] * t[..., None]
    m = m_rect(w, h, 0, 0, w, h, soft=soft)
    cv.put(int(x0), int(y0), np.dstack([rgb, m]).astype(np.float32))


def glow(cv, cx, cy, r, col, strength=0.7, falloff=2.2):
    pad = int(r * 1.6)
    w = h = pad * 2
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.hypot(xx - w / 2, yy - h / 2) / max(r, 1e-3)
    a = np.clip(1 - d, 0, 1) ** falloff * strength
    crop = np.dstack([np.broadcast_to(np.asarray(col, np.float32), (h, w, 3)),
                      a.astype(np.float32)])
    cv.put(int(cx - w / 2), int(cy - h / 2), crop)


def shadow(cv, cx, cy, rx, ry, strength=0.45, col=(0.02, 0.02, 0.04), sigma=None):
    sigma = max(1.2, ry * 0.7) if sigma is None else sigma
    pad = int(3 * sigma) + 2
    w, h = int(rx * 2) + 2 * pad, int(ry * 2) + 2 * pad
    m = m_ellipse(w, h, w / 2, h / 2, rx, ry, 1.0)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(sigma)), np.float32) / 255.0
    cv.over_mask(int(cx - w / 2), int(cy - h / 2), m * strength, np.asarray(col, np.float32))


# --------------------------------------------------------------------------
# noise / texture
# --------------------------------------------------------------------------

def fbm(w, h, octaves=4, seed=0, scale=8.0, persistence=0.5):
    rng = np.random.default_rng(seed)
    total = np.zeros((h, w), np.float32)
    amp, norm, sc = 1.0, 0.0, scale
    for _ in range(octaves):
        gw, gh = max(2, int(sc)), max(2, int(sc * h / w))
        grid = rng.random((gh, gw)).astype(np.float32)
        im = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        total += amp * (np.asarray(im, np.float32) / 255.0)
        norm += amp
        amp *= persistence
        sc *= 2
    return total / max(norm, 1e-6)


def stipple(cv, x0, y0, x1, y1, n, col, rmin=0.6, rmax=1.8, seed=1, alpha=0.5):
    rng = np.random.default_rng(seed)
    xs = rng.uniform(x0, x1, n); ys = rng.uniform(y0, y1, n)
    rs = rng.uniform(rmin, rmax, n)
    for x, y, r in zip(xs, ys, rs):
        cv.over_mask(int(x - r - 1), int(y - r - 1),
                     m_disc(int(2 * r + 4), int(2 * r + 4), r + 1, r + 1, r, 0.6), col)


# --------------------------------------------------------------------------
# text (HarfBuzz shaping + FreeType raster) — Devanagari safe
# --------------------------------------------------------------------------

class TextRenderer:
    """Devanagari-correct text: Pillow has no Raqm here, so we shape with
    HarfBuzz and blit glyphs ourselves."""

    def __init__(self, font_path):
        self.path = font_path
        self.blob = hb.Blob.from_file_path(font_path)
        self.face = hb.Face(self.blob)
        self.font = hb.Font(self.face)
        self.upem = self.face.upem
        self.ft = ft.Face(font_path)
        self._cache = {}

    def _glyph(self, gid, px):
        key = (gid, px)
        if key in self._cache:
            return self._cache[key]
        self.ft.set_pixel_sizes(0, px)
        self.ft.load_glyph(gid, ft.FT_LOAD_RENDER)
        bmp = self.ft.glyph.bitmap
        if bmp.rows == 0 or bmp.width == 0:
            out = (np.zeros((1, 1), np.float32), 0, 0, 0)
        else:
            buf = np.array(bmp.buffer, dtype=np.uint8).reshape(bmp.rows, bmp.pitch)
            buf = buf[:, :bmp.width]
            out = (buf.astype(np.float32) / 255.0, self.ft.glyph.bitmap_left,
                   self.ft.glyph.bitmap_top, bmp.width)
        self._cache[key] = out
        return out

    def shape(self, text, px):
        self.font.scale = (px * 64, px * 64)
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.font, buf)
        return list(zip(buf.glyph_infos, buf.glyph_positions))

    def measure(self, text, px):
        gl = self.shape(text, px)
        return sum(g.x_advance for _, g in gl) / 64.0

    def draw(self, img: Image.Image, text, xy, px, col, anchor="left", outline=0,
             outline_col=(0, 0, 0), max_w=None):
        """draw shaped text on RGBA PIL image, returns advance width."""
        if max_w is not None and self.measure(text, px) > max_w:
            px = max(8, int(px * max_w / self.measure(text, px)))
        x0, y0 = xy
        tw = self.measure(text, px)
        if anchor == "center":
            x0 -= tw / 2
        elif anchor == "right":
            x0 -= tw
        layers = [(0, 0)] if outline <= 0 else [
            (dx, dy) for dx in range(-outline, outline + 1)
            for dy in range(-outline, outline + 1) if dx * dx + dy * dy <= outline * outline]
        for (odx, ody), c in [(o, outline_col) for o in layers] + [((0, 0), col)]:
            pen = x0 + odx
            for info, pos in self.shape(text, px):
                m, left, top, gw = self._glyph(info.codepoint, px)
                if m.size > 1:
                    g = Image.fromarray((m * 255).astype(np.uint8), "L")
                    solid = Image.new("RGBA", g.size, (int(c[0] * 255), int(c[1] * 255),
                                                       int(c[2] * 255), 255))
                    solid.putalpha(g)
                    img.alpha_composite(solid, (int(pen + left + (pos.x_offset / 64.0)),
                                                int(y0 - top - (pos.y_offset / 64.0))))
                pen += pos.x_advance / 64.0
        return tw


def wrap(text, tr: TextRenderer, px, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if tr.measure(trial, px) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines
