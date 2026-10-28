#!/usr/bin/env python3
"""Render the SunnyAI intro video fully offline.

Pipeline: Pillow renders 1920x1080 frames (Ken Burns + staggered text reveals +
crossfades) -> raw RGB piped into ffmpeg (libx264) with a synthesized BGM WAV.

Usage:
    python3 automation/make_video.py [--out videos/sunnyai-intro.mp4]

Runs with any Python that has Pillow + numpy (OpenMontage's venv qualifies).
"""

from __future__ import annotations

import argparse
import math
import struct
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1920, 1080
FPS = 30
SCENE_DUR = 5.5      # seconds per scene
FADE = 0.6           # crossfade between scenes
ACCENT = "#ff8c42"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


# ---------------------------------------------------------------- background

def gradient_base(c_top: tuple, c_bot: tuple, glow: tuple) -> Image.Image:
    """Diagonal gradient + soft accent glow + faint dot grid."""
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :]
    t = np.clip((x * 0.65 + y * 0.35), 0.0, 1.0)[..., None]
    arr = (np.array(c_top, dtype=np.float32) * (1 - t)
           + np.array(c_bot, dtype=np.float32) * t)
    img = Image.fromarray(arr.astype(np.uint8), "RGB")

    # soft glow blob
    blob = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(blob)
    d.ellipse([W * 0.62, -H * 0.35, W * 1.25, H * 0.45], fill=glow)
    d.ellipse([-W * 0.25, H * 0.6, W * 0.25, H * 1.3], fill=tuple(int(g * 0.7) for g in glow))
    blob = blob.filter(ImageFilter.GaussianBlur(140))
    img = Image.fromarray(
        np.clip(np.asarray(img, np.float32) + np.asarray(blob, np.float32) * 0.55, 0, 255).astype(np.uint8),
        "RGB",
    )

    d = ImageDraw.Draw(img)
    for gy in range(64, H, 64):
        for gx in range(64, W, 64):
            d.ellipse([gx - 1, gy - 1, gx + 1, gy + 1], fill=(255, 255, 255, 14))
    return img


def hex_rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- text helpers

def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def rounded_panel(w: int, h: int, radius: int = 22, fill=(16, 20, 38, 215), border=ACCENT) -> Image.Image:
    layer = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([4, 4, w + 4, h + 4], radius=radius, fill=fill,
                        outline=hex_rgb(border) + (235,), width=3)
    return layer


def check_icon(size: int, color: str) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([0, 0, size - 1, size - 1], fill=hex_rgb(color) + (255,))
    s = size
    d.line([(s * 0.26, s * 0.52), (s * 0.44, s * 0.70), (s * 0.76, s * 0.32)],
           fill=(10, 12, 24, 255), width=max(3, s // 9), joint="curve")
    return layer


def bullet_layer(text: str, fnt, color: str, marker: str = "dot") -> tuple[Image.Image, int, int]:
    """Render one bullet line (marker + text) on transparent canvas."""
    tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    lines = wrap(tmp, text, fnt, 1360)
    line_h = fnt.getbbox("Ay")[3] - fnt.getbbox("Ay")[1]
    pad = 14
    layer = Image.new("RGBA", (1500, len(lines) * (line_h + pad) + pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    my = pad + line_h // 2
    if marker == "check":
        icon = check_icon(line_h + 6, color)
        layer.alpha_composite(icon, (0, my - (line_h + 6) // 2))
    else:
        d.rounded_rectangle([0, my - 9, 18, my + 9], radius=5, fill=hex_rgb(color))
    tx = (line_h + 24) if marker == "check" else 40
    for i, ln in enumerate(lines):
        y = pad + i * (line_h + pad)
        d.text((tx, y), ln, font=fnt, fill=(235, 240, 250, 255))
    box = layer.getbbox()
    layer = layer.crop((box[0], 0, box[2] + 6, box[3]))
    return layer, 40, pad


# ---------------------------------------------------------------- scenes

def build_scenes() -> list[dict]:
    t80 = font(FONT_BOLD, 96)
    t54 = font(FONT_BOLD, 54)
    t44 = font(FONT_REG, 44)
    t64 = font(FONT_BOLD, 64)
    t110 = font(FONT_BOLD, 118)
    t40 = font(FONT_REG, 40)
    t48 = font(FONT_BOLD, 48)

    S = []

    def hero(kicker, title, subtitle, bg_colors, glow):
        base = gradient_base(bg_colors[0], bg_colors[1], glow)
        return dict(base=base, kicker=kicker, title=title, subtitle=subtitle,
                    title_font=t110, sub_font=t44, kicker_font=t48, bullets=[])

    def bullets_scene(kicker, title, subtitle, items, bg_colors, glow, check=False):
        base = gradient_base(bg_colors[0], bg_colors[1], glow)
        return dict(base=base, kicker=kicker, title=title, subtitle=subtitle,
                    title_font=t80, sub_font=t44, kicker_font=t44,
                    bullets=[(txt, "check" if check else "dot") for txt in items])

    NAVY = ((11, 29, 58), (8, 14, 30), (255, 140, 66))
    PURPLE = ((26, 20, 48), (12, 10, 24), (167, 139, 250))
    TEAL = ((10, 42, 50), (8, 16, 28), (22, 199, 154))
    PINK = ((46, 18, 40), (16, 10, 26), (233, 69, 96))
    BLUE = ((15, 52, 96), (8, 14, 30), (78, 168, 222))

    S.append(hero("OPEN SOURCE • OFFLINE • SANDBOX READY",
                  "SunnyAI",
                  "Chalo video banate hain — sab kuch local machine pe!",
                  NAVY, (255, 140, 66)))

    S.append(bullets_scene("AAJ KA STACK", "4 AI Video Tools",
                           "Ye rahi aaj ki toolkit — sab install ho chuki hai:",
                           ["OmniVoice — 600+ bhashaon ka TTS",
                            "Duix-Avatar — digital human videos",
                            "OpenMontage — agentic video production",
                            "FreeVideo — local AI video generation"],
                           PURPLE, (167, 139, 250)))

    S.append(bullets_scene("TOOL 1 — k2-fsa", "OmniVoice",
                           "Zero-shot text-to-speech, 600+ languages:",
                           ["Voice cloning aur voice design",
                            "CPU pe bhi chalta hai (test ho chuka hai)",
                            "CLI: omnivoice-infer, omnivoice-demo"],
                           TEAL, (22, 199, 154), check=True))

    S.append(bullets_scene("TOOL 2 — duixcom", "Duix-Avatar",
                           "Offline digital-human / avatar video toolkit:",
                           ["Text aur voice se avatar ko drive karo",
                            "npm deps + better-sqlite3 ready",
                            "Docker models baad me (sandbox limits)"],
                           PINK, (233, 69, 96), check=True))

    S.append(bullets_scene("TOOL 3 — calesthio", "OpenMontage",
                           "Pehla open-source agentic video production system:",
                           ["Research, script, assets, edit — sab pipeline me",
                            "Remotion composer + ffmpeg ready",
                            "make setup + preflight pass ✓"],
                           BLUE, (78, 168, 222), check=True))

    S.append(bullets_scene("TOOL 4 — FlashML", "FreeVideo",
                           "MiniMax H3 video generation, local engine:",
                           ["VDN inference engine install ho chuka hai",
                            "Runtime pins match (numpy 2.4.6 exception)",
                            "GPU + models — agla step (abhi nahi)"],
                           NAVY, (255, 209, 102), check=True))

    S.append(bullets_scene("INSTALL STATUS", "Setup Complete ✓",
                           "Ek nazar me — sab green:",
                           ["10 GitHub sources registered + submodules",
                            "Python venvs: OmniVoice, OpenMontage, FreeVideo",
                            "Node deps: Duix-Avatar + Remotion",
                            "FFmpeg 7.0.2 static — video encode ready"],
                           PURPLE, (22, 199, 154), check=True))

    S.append(bullets_scene("HOW THIS VIDEO WAS MADE", "100% Offline Pipeline",
                           "Koi cloud API nahi — bas local tools:",
                           ["Pillow se frames + titles render hue",
                            "Ken Burns zoom + crossfade transitions",
                            "Background music code se synthesize hui",
                            "FFmpeg ne MP4 encode kiya"],
                           TEAL, (78, 168, 222)))

    S.append(bullets_scene("AB TUMHARI BARI", "Bolo — kya banayein?",
                           "Agli video tumhari request se banegi:",
                           ["Topic batao (tutorial, promo, kuch bhi)",
                            "Language: Hindi / Hinglish / English",
                            "Length: 15 second se 2 minute tak"],
                           PINK, (255, 140, 66)))

    S.append(hero("GITHUB.COM/SUNNYPRAJAPATI1947-CODER/SUNNY-",
                  "SunnyAI",
                  "Open-source tools • sandboxed build • ab ready hai",
                  NAVY, (255, 140, 66)))

    return S


# ---------------------------------------------------------------- composition

def compose_static(scene: dict, index: int, total: int) -> None:
    """Pre-render overlay elements (RGBA layers) with their reveal timings."""
    base: Image.Image = scene["base"]
    d = ImageDraw.Draw(base)

    kicker_f, title_f, sub_f = scene["kicker_font"], scene["title_font"], scene["sub_font"]
    y = 210

    if scene.get("kicker"):
        kl = Image.new("RGBA", (1700, 90), (0, 0, 0, 0))
        kd = ImageDraw.Draw(kl)
        kw = kd.textbbox((0, 0), scene["kicker"], font=kicker_f)[2]
        kd.rounded_rectangle([0, 0, kw + 56, 74], radius=37, fill=(255, 255, 255, 26),
                             outline=hex_rgb(ACCENT) + (200,), width=2)
        kd.text((28, 14), scene["kicker"], font=kicker_f, fill=(255, 220, 180, 255))
        scene["el_kicker"] = (kl.crop((0, 0, kw + 56, 74)), W // 2 - (kw + 56) // 2, y, 0.15)

    y += 120
    if scene.get("title"):
        tl = Image.new("RGBA", (1800, 200), (0, 0, 0, 0))
        td = ImageDraw.Draw(tl)
        tw = td.textbbox((0, 0), scene["title"], font=title_f)[2]
        td.text((0, 0), scene["title"], font=title_f, fill=(255, 255, 255, 255),
                stroke_width=2, stroke_fill=(0, 0, 0, 90))
        th = title_f.getbbox("Ayg")[3]
        scene["el_title"] = (tl.crop((0, 0, tw + 8, th + 12)), W // 2 - (tw + 8) // 2, y, 0.35)

    y += (title_f.size + 60)
    if scene.get("subtitle"):
        sl = Image.new("RGBA", (1800, 80), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sl)
        sw = sd.textbbox((0, 0), scene["subtitle"], font=sub_f)[2]
        sd.text((0, 0), scene["subtitle"], font=sub_f, fill=(200, 210, 225, 255))
        sh = sub_f.getbbox("Ayg")[3]
        scene["el_sub"] = (sl.crop((0, 0, sw + 4, sh + 8)), W // 2 - (sw + 4) // 2, y, 0.55)

    y += 84
    bullets = scene.get("bullets") or []
    scene["el_bullets"] = []
    for i, (txt, marker) in enumerate(bullets):
        layer, ox, oy = bullet_layer(txt, sub_f, ACCENT, marker)
        # staggered panel behind each bullet
        panel = rounded_panel(layer.width + 32, layer.height + 24)
        scene["el_bullets"].append((panel, layer, 200, y, 0.9 + i * 0.55))
        y += layer.height + 40

    # progress dots (static)
    dots = Image.new("RGBA", (total * 34, 24), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    for i in range(total):
        r = 9 if i != index else 11
        cx = i * 34 + 17
        col = hex_rgb(ACCENT) if i == index else (255, 255, 255)
        a = 255 if i == index else 70
        dd.ellipse([cx - r, 12 - r, cx + r, 12 + r], fill=col + (a,))
    scene["el_dots"] = (dots, W // 2 - dots.width // 2, H - 60)

    num = Image.new("RGBA", (200, 60), (0, 0, 0, 0))
    ImageDraw.Draw(num).text((0, 8), f"{index + 1} / {total}", font=font(FONT_REG, 34),
                             fill=(180, 190, 210, 210))
    scene["el_num"] = (num, W - 230, H - 74)


def paste_faded(target: Image.Image, layer: Image.Image, x: int, y: int, alpha: float) -> None:
    if alpha <= 0:
        return
    if alpha >= 1:
        target.paste(layer, (x, y), layer)
        return
    a = layer.getchannel("A").point(lambda p: int(p * alpha))
    tmp = layer.copy()
    tmp.putalpha(a)
    target.paste(tmp, (x, y), tmp)


def scene_frame(scene: dict, t: float, kb_dir: int) -> Image.Image:
    """Frame at local time t with Ken Burns on the background."""
    z = 1.0 + 0.065 * (t / SCENE_DUR)          # slow zoom
    z = z if kb_dir > 0 else 1.065 - 0.065 * (t / SCENE_DUR)
    cw, ch = int(W / z), int(H / z)
    cx = (W - cw) // 2 + int(math.sin(t * 0.4) * 14 * kb_dir)
    cy = (H - ch) // 2 + int(t * 2.0)
    cx = max(0, min(cx, W - cw))
    cy = max(0, min(cy, H - ch))
    frame = scene["base"].crop((cx, cy, cx + cw, cy + ch)).resize((W, H), Image.BILINEAR)

    # element reveals (fade + slide)
    def reveal(el, start):
        layer, x, y = el[0], el[1], el[2]
        p = min(max((t - start) / 0.45, 0.0), 1.0)
        ease = 1 - (1 - p) ** 3
        paste_faded(frame, layer, x, y + int((1 - ease) * 18), ease)

    for key in ("el_kicker", "el_title", "el_sub"):
        if key in scene:
            reveal(scene[key], scene[key][3])
    for panel, layer, x, y, start in scene.get("el_bullets", []):
        p = min(max((t - start) / 0.45, 0.0), 1.0)
        ease = 1 - (1 - p) ** 3
        off = int((1 - ease) * 22)
        paste_faded(frame, panel, x, y - 12 + off, ease)
        paste_faded(frame, layer, x + 16, y + off, ease)

    dots, dx, dy = scene["el_dots"]
    frame.paste(dots, (dx, dy), dots)
    num, nx, ny = scene["el_num"]
    frame.paste(num, (nx, ny), num)
    return frame


# ---------------------------------------------------------------- background music

def synth_bgm(seconds: float, path: Path, bpm: int = 80) -> None:
    sr = 44100
    n = int(seconds * sr)
    t = np.arange(n) / sr
    mix = np.zeros(n, dtype=np.float64)

    beat = 60.0 / bpm
    bar = beat * 4
    # Am - F - C - G progression
    chords = [(220.00, 261.63, 329.63), (174.61, 220.00, 261.63),
              (261.63, 329.63, 392.00), (196.00, 246.94, 293.66)]

    def env(start: float, dur: float, a: float, r: float) -> np.ndarray:
        e = np.zeros(n)
        i0, i1 = int(start * sr), min(int((start + dur) * sr), n)
        if i1 <= i0:
            return e
        seg = np.ones(i1 - i0)
        na, nr = int(a * sr), int(r * sr)
        na, nr = min(na, len(seg)), min(nr, len(seg))
        if na:
            seg[:na] = np.linspace(0, 1, na)
        if nr:
            seg[-nr:] = np.linspace(1, 0, nr)
        e[i0:i1] = seg
        return e

    # pads
    pad = np.zeros(n)
    bar_t = 0.0
    bi = 0
    while bar_t < seconds:
        ch = chords[bi % 4]
        e = env(bar_t, bar, 0.35, 0.45)
        for k, f in enumerate(ch):
            det = 1.0 + 0.0015 * (k - 1)
            pad += e * (np.sin(2 * np.pi * f * det * t) * 0.55
                        + np.sin(2 * np.pi * f * 2 * t) * 0.12)
        bar_t += bar
        bi += 1
    mix += pad * 0.10

    # arpeggio (8th notes)
    arp = np.zeros(n)
    step = beat / 2
    k = 0
    arp_t = beat  # start after first beat
    while arp_t < seconds - step:
        ch = chords[(int(arp_t // bar)) % 4]
        f = ch[k % 3] * 2
        e = env(arp_t, step * 0.9, 0.01, step * 0.55)
        arp += e * (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3 * t))
        arp_t += step
        k += 1
    mix += arp * 0.055

    # kick on beats 1 & 3
    kick = np.zeros(n)
    b = 0.0
    while b < seconds - 0.2:
        e = env(b, 0.16, 0.004, 0.12)
        idx = np.arange(n) / sr - b
        sweep = np.where((idx >= 0) & (idx < 0.16),
                         np.sin(2 * np.pi * (82 - 380 * np.maximum(idx, 0)) * np.maximum(idx, 0)), 0)
        kick += e * sweep
        b += beat * 2
    mix += kick * 0.42

    # soft hats on off-beats
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n)
    hp = np.diff(np.concatenate([[0.0], noise]))          # crude high-pass
    hat = np.zeros(n)
    b = beat / 2
    while b < seconds - 0.1:
        hat += env(b, 0.05, 0.002, 0.04) * hp
        b += beat
    mix += hat * 0.05

    # fades
    fin, fout = int(1.5 * sr), int(2.5 * sr)
    mix[:fin] *= np.linspace(0, 1, fin)
    mix[-fout:] *= np.linspace(1, 0, fout)

    peak = np.max(np.abs(mix)) or 1.0
    mix = mix / peak * 0.72
    # gentle stereo width: delayed/inverted detune on right
    right = np.concatenate([np.zeros(int(0.012 * sr)), mix[:-int(0.012 * sr)]]) * 0.97
    stereo = np.stack([mix, 0.85 * mix + 0.15 * right], axis=1)
    pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)

    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- main render

def render(out_path: Path) -> None:
    scenes = build_scenes()
    total = len(scenes)
    for i, s in enumerate(scenes):
        compose_static(s, i, total)
        print(f"  scene {i + 1}/{total} composed", flush=True)

    total_dur = total * SCENE_DUR - (total - 1) * FADE
    n_frames = int(round(total_dur * FPS))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bgm = out_path.with_suffix(".wav")
    print(f"  synthesizing {total_dur:.1f}s BGM ...", flush=True)
    synth_bgm(total_dur, bgm)

    ff = ["ffmpeg", "-y", "-loglevel", "error",
          "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
          "-i", str(bgm),
          "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
          str(out_path)]

    step = SCENE_DUR - FADE
    print(f"  encoding {n_frames} frames -> {out_path}", flush=True)
    proc = subprocess.Popen(ff, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for fi in range(n_frames):
            t_global = fi / FPS
            i = min(int(t_global // step), total - 1)
            local = t_global - i * step
            if local <= SCENE_DUR and i < total - 1 and local > SCENE_DUR - FADE:
                # crossfade zone between scene i and i+1
                a_scene, b_scene = scenes[i], scenes[i + 1]
                t_a = local
                t_b = local - SCENE_DUR + FADE
                fa = scene_frame(a_scene, t_a, 1 if i % 2 == 0 else -1)
                fb = scene_frame(b_scene, t_b, 1 if (i + 1) % 2 == 0 else -1)
                alpha = (local - (SCENE_DUR - FADE)) / FADE
                frame = Image.blend(fa, fb, alpha)
            else:
                frame = scene_frame(scenes[i], local, 1 if i % 2 == 0 else -1)
            proc.stdin.write(frame.tobytes())
            if fi % 150 == 0:
                print(f"  frame {fi}/{n_frames}", flush=True)
        proc.stdin.close()
    except BrokenPipeError:
        pass
    err = proc.stderr.read().decode(errors="replace")
    rc = proc.wait()
    if rc != 0:
        raise SystemExit(f"ffmpeg failed ({rc}):\n{err[-2000:]}")
    bgm.unlink(missing_ok=True)
    print(f"DONE: {out_path} ({out_path.stat().st_size} bytes, {total_dur:.1f}s)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "videos" / "sunnyai-intro.mp4"))
    args = ap.parse_args()
    render(Path(args.out))
