#!/usr/bin/env python3
"""
Factomatrix video pipeline — 100% free, keyless.

  script.json  ->  per-scene TTS (edge-tts) + per-scene image (Pollinations / NASA / Wikimedia / gradient)
               ->  Ken Burns 1080p clips -> concat -> Hindi (Devanagari) subtitles burned -> MP4

Every scene is cached on disk, so an interrupted render resumes where it stopped.

Usage:
  python pipeline.py --test              # first 5 scenes  -> renders/test_1min.mp4
  python pipeline.py                     # full 50 scenes -> renders/final.mp4
  python pipeline.py --scenes 1-10       # arbitrary range
  python pipeline.py --stage audio       # only audio / only images / only video
"""

import argparse
import asyncio
import hashlib
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import wave
from pathlib import Path

SCRIPT_PATH = Path(__file__).with_name("script.json")
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
AUDIO_DIR = ASSETS / "audio"
IMAGE_DIR = ASSETS / "images"
CLIP_DIR = ASSETS / "video"
FONT_DIR = ASSETS / "fonts"
RENDER_DIR = ROOT / "renders"
for d in (AUDIO_DIR, IMAGE_DIR, CLIP_DIR, RENDER_DIR):
    d.mkdir(parents=True, exist_ok=True)

VOICE = "hi-IN-MadhurNeural"
FPS = 25
WIDTH, HEIGHT = 1920, 1080
TAIL_PAD = 0.35          # silence after each narration, keeps scenes breathing
INTRO_SECONDS = 4.5
LEAD_IN = 0.25           # silence before narration inside a scene

# ---------------------------------------------------------------- utilities

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def run(cmd, quiet=True):
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        err = res.stderr.decode("utf-8", "replace")[-3000:]
        raise RuntimeError(f"command failed ({cmd[0]}): {err}")
    return res


def ffmpeg_bin():
    try:
        import imageio_ffmpeg  # free, pip installable ffmpeg binary (fallback when apt is unavailable)
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which("ffmpeg")
        if not exe:
            sys.exit("ffmpeg not found: install ffmpeg (apt) or `pip install imageio-ffmpeg`")
        return exe


FFMPEG = None


def ffmpeg(*args):
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args]
    return run(cmd)


def wav_duration(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


# ---------------------------------------------------------------- script

def load_script():
    data = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    scenes = data["scenes"]
    assert scenes, "no scenes in script.json"
    for i, s in enumerate(scenes, 1):
        s.setdefault("scene", i)
        assert s.get("narration"), f"scene {i} missing narration"
        assert s.get("image_prompt"), f"scene {i} missing image_prompt"
    return data


def parse_scene_range(spec, total):
    if not spec:
        return list(range(1, total + 1))
    out = []
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return [n for n in dict.fromkeys(out) if 1 <= n <= total]


def scene_id(n):
    return f"scene_{n:03d}"


# ---------------------------------------------------------------- voiceover

async def _tts_one(text, out_path):
    import edge_tts
    com = edge_tts.Communicate(text, VOICE, rate="+0%", volume="+0%")
    await com.save(str(out_path))


def make_audio(scene, force=False):
    """mp3 narration -> padded, normalised 48k mono wav. Returns wav path."""
    sid = scene_id(scene["scene"])
    mp3 = AUDIO_DIR / f"{sid}.mp3"
    wav = AUDIO_DIR / f"{sid}.wav"

    if not wav.exists() or force:
        if not mp3.exists() or mp3.stat().st_size < 2000 or force:
            text = scene["narration"]
            last_err = None
            for attempt in range(6):
                try:
                    if mp3.exists():
                        mp3.unlink()
                    asyncio.run(_tts_one(text, mp3))
                    if mp3.exists() and mp3.stat().st_size > 2000:
                        break
                    raise RuntimeError("empty audio from edge-tts")
                except Exception as e:  # noqa: BLE001
                    last_err = e
                    log(f"  tts retry {attempt+1}/6 for {sid}: {e}")
                    time.sleep(3 + attempt * 4)
            else:
                raise RuntimeError(f"edge-tts failed for {sid}: {last_err}")

        # pad: LEAD_IN silence + narration + TAIL_PAD silence, all 48k mono 16-bit
        raw = AUDIO_DIR / f"{sid}.raw.wav"
        ffmpeg("-i", str(mp3), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(raw))
        ffmpeg(
            "-f", "lavfi", "-t", f"{LEAD_IN}", "-i", "anullsrc=r=48000:cl=mono",
            "-i", str(raw),
            "-f", "lavfi", "-t", f"{TAIL_PAD}", "-i", "anullsrc=r=48000:cl=mono",
            "-filter_complex",
            "[0:a][1:a]concat=n=2:v=0:a=1[a1];[a1][2:a]concat=n=2:v=0:a=1[a2];"
            "[a2]loudnorm=I=-16:TP=-1.5:LRA=11[aout]",
            "-map", "[aout]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav),
        )
        raw.unlink(missing_ok=True)
        log(f"  audio {sid}: {wav_duration(wav):.2f}s")

    return wav


# ---------------------------------------------------------------- images

def _fit_1080(img):
    from PIL import Image
    img = img.convert("RGB")
    ratio = max(WIDTH / img.width, HEIGHT / img.height)
    nw, nh = max(WIDTH, int(img.width * ratio + 0.5)), max(HEIGHT, int(img.height * ratio + 0.5))
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - WIDTH) // 2
    top = (nh - HEIGHT) // 2
    return img.crop((left, top, left + WIDTH, top + HEIGHT))


def _save_1080(raw_bytes, dest):
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(raw_bytes))
    img.load()
    if img.width < 640 or img.height < 360:
        raise ValueError(f"image too small: {img.width}x{img.height}")
    _fit_1080(img).save(dest, "JPEG", quality=92)
    return True


def _http_get(url, headers=None, timeout=120, tries=3, backoff=5):
    import requests
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, headers=headers or {"User-Agent": "factomatrix-video-pipeline/1.0"},
                             timeout=timeout)
            if r.status_code == 200 and len(r.content) > 2048:
                return r.content
            last = f"HTTP {r.status_code} ({len(r.content)} bytes)"
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        time.sleep(backoff * (i + 1))
    raise RuntimeError(f"GET failed {url[:120]}: {last}")


# --- source 1: Pollinations (keyless)

def _pollinations(prompt, dest, seed):
    q = urllib.parse.quote(prompt, safe="")
    url = (f"https://image.pollinations.ai/prompt/{q}"
           f"?width={WIDTH}&height={HEIGHT}&nologo=true&model=flux&seed={seed}&enhance=false")
    raw = _http_get(url, timeout=180, tries=1, backoff=0)
    _save_1080(raw, dest)
    return url


def fetch_pollinations(prompt, dest, seed):
    waits = [0, 8, 20, 45]
    last = None
    for i, wait in enumerate(waits):
        if wait:
            time.sleep(wait)
        try:
            url = _pollinations(prompt, dest, seed + i)
            return {"source": "pollinations", "url": url}
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"  pollinations attempt {i+1}/{len(waits)} failed: {str(e)[:160]}")
    raise RuntimeError(f"pollinations failed: {last}")


# --- source 2a: NASA Image Library (public domain)

STOP = {
    "cinematic", "ultra", "detailed", "16:9", "space", "documentary", "style", "art", "concept",
    "visualization", "visualisation", "rendered", "realistic", "dramatic", "scientific", "no",
    "text", "high", "detail", "composition", "close", "shot", "view", "image", "photo", "still",
    "elegant", "surreal", "abstract", "symbolic", "scale", "contrast", "palette", "lighting",
    "solid", "bright", "glowing", "deep", "vast", "epic", "calm", "black", "background",
}


def keywords_for(scene):
    text = scene["image_prompt"].lower()
    words = re.findall(r"[a-z]+", text)
    kws = [w for w in words if len(w) > 3 and w not in STOP]
    seen, out = set(), []
    for w in kws:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out[:6]


def _nasa_queries(scene):
    kws = keywords_for(scene)
    qs = []
    if len(kws) >= 2:
        qs.append(" ".join(kws[:3]))
    if kws:
        qs.append(kws[0] + (" " + kws[1] if len(kws) > 1 else ""))
    qs += ["black hole", "event horizon", "accretion disk", "supermassive black hole"]
    out, seen = [], set()
    for q in qs:
        q = q.strip()
        if q and q not in seen:
            seen.add(q)
            out.append(q)
    return out[:4]


COSMIC_TERMS = {
    "black", "hole", "holes", "horizon", "accretion", "disk", "disc", "singularity", "gravity",
    "gravitational", "star", "stars", "galaxy", "galaxies", "space", "universe", "cosmic", "light",
    "spacecraft", "astronaut", "telescope", "nasa", "quasar", "nebula", "supernova", "photon",
    "radiation", "spacetime", "matter", "energy", "horizon", "ring", "jet", "core", "orbit",
}


def relevance(text, keywords):
    """How many of the scene's own keywords appear in an asset description."""
    t = " ".join(re.findall(r"[a-z]+", (text or "").lower()))
    score = sum(1 for k in keywords if k in t)
    cosmic = any(c in t for c in COSMIC_TERMS)
    return score, cosmic


def fetch_nasa(scene, dest):
    import requests
    for q in _nasa_queries(scene):
        try:
            api = "https://images-api.nasa.gov/search"
            r = requests.get(api, params={"q": q, "media_type": "image", "page_size": 12},
                             timeout=40, headers={"User-Agent": "factomatrix/1.0"})
            if r.status_code != 200:
                continue
            items = r.json().get("collection", {}).get("items", [])
            kws = keywords_for(scene)
            scored = []
            for it in items:
                data = (it.get("data") or [{}])[0]
                text = f"{data.get('title','')} {data.get('description','')}"
                score, cosmic = relevance(text, kws)
                # keep only assets that actually talk about this scene (or at least about space)
                if score >= 1:
                    scored.append((score, it))
            scored.sort(key=lambda x: -x[0])
            random.shuffle(scored[:6])
            for score, it in scored[:8]:
                links = [l["href"] for l in it.get("links", []) if l.get("href")]
                if not links:
                    continue
                href = links[0]
                if href.lower().endswith(".gif"):
                    continue
                try:
                    raw = _http_get(href, timeout=90, tries=1, backoff=0)
                    _save_1080(raw, dest)
                    title = (it.get("data") or [{}])[0].get("title", "")
                    return {"source": "nasa", "url": href, "title": title, "query": q, "relevance": score}
                except Exception:  # noqa: BLE001
                    continue
        except Exception as e:  # noqa: BLE001
            log(f"  nasa query '{q}' failed: {str(e)[:120]}")
    raise RuntimeError("nasa: no usable image")


# --- source 2b: Wikimedia Commons (public domain / free licences)

def _commons_queries(scene):
    kws = keywords_for(scene)
    qs = []
    if kws:
        qs.append(" ".join(kws[:3]))
    qs += ["black hole", "event horizon", "accretion disc", "supermassive black hole", "outer space"]
    out, seen = [], set()
    for q in qs:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out[:4]


def fetch_wikimedia(scene, dest):
    import requests
    for q in _commons_queries(scene):
        try:
            r = requests.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query", "format": "json", "generator": "search",
                    "gsrsearch": f"{q} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 10,
                    "prop": "imageinfo", "iiprop": "url|extmetadata|size",
                    "iiurlwidth": str(WIDTH),
                },
                timeout=40, headers={"User-Agent": "factomatrix-video-pipeline/1.0 (education)"},
            )
            if r.status_code != 200:
                continue
            pages = list(r.json().get("query", {}).get("pages", {}).values())
            random.shuffle(pages)
            for p in pages:
                info = (p.get("imageinfo") or [{}])[0]
                if not info.get("url"):
                    continue
                if info.get("width", 0) < 1000:
                    continue
                meta = info.get("extmetadata", {})
                lic = meta.get("LicenseShortName", {}).get("value", "unknown")
                title = p.get("title", "")
                desc = re.sub(r"<[^>]+>", " ", meta.get("ImageDescription", {}).get("value", ""))
                score, cosmic = relevance(f"{title} {desc}", keywords_for(scene))
                if score < 1:
                    continue
                url = info.get("thumburl") or info["url"]
                try:
                    raw = _http_get(url, timeout=90, tries=1, backoff=0)
                    _save_1080(raw, dest)
                    return {"source": "wikimedia", "url": url, "title": title,
                            "license": lic, "query": q, "relevance": score}
                except Exception:  # noqa: BLE001
                    continue
        except Exception as e:  # noqa: BLE001
            log(f"  wikimedia query '{q}' failed: {str(e)[:120]}")
    raise RuntimeError("wikimedia: no usable image")


# --- source 3: dark gradient background (always works, offline)

def make_gradient(dest, seed):
    from PIL import Image, ImageDraw, ImageFilter
    rnd = random.Random(seed)
    w, h = WIDTH // 4, HEIGHT // 4
    palettes = [
        ((6, 8, 22), (34, 12, 60), (90, 30, 40)),
        ((4, 10, 26), (16, 40, 70), (120, 60, 20)),
        ((10, 6, 24), (48, 10, 54), (10, 60, 90)),
    ]
    base, mid, glow = rnd.choice(palettes)
    img = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        c = tuple(int(base[i] * (1 - t) + mid[i] * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    gx, gy = rnd.randint(w // 5, w - w // 5), rnd.randint(h // 3, h - h // 4)
    radius = rnd.randint(w // 6, w // 3)
    for step in range(28, 0, -1):
        rr = int(radius * step / 28)
        a = 1 - step / 28
        col = tuple(int(glow[i] * a * 0.55 + img.getpixel((gx, gy))[i] * (1 - a)) for i in range(3))
        d.ellipse([gx - rr, gy - rr, gx + rr, gy + rr], fill=col)
    # stars
    for _ in range(420):
        x, y = rnd.randint(0, w - 1), rnd.randint(0, h - 1)
        v = rnd.randint(90, 255)
        d.point((x, y), fill=(v, v, v))
    img = img.filter(ImageFilter.GaussianBlur(0.6)).resize((WIDTH, HEIGHT), Image.LANCZOS)
    img.save(dest, "JPEG", quality=92)
    return {"source": "gradient", "url": ""}


def make_image(scene, force=False):
    sid = scene_id(scene["scene"])
    dest = IMAGE_DIR / f"{sid}.jpg"
    manifest_path = IMAGE_DIR / "sources.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    if dest.exists() and dest.stat().st_size > 20000 and not force:
        return manifest.get(sid, {"source": "cached", "url": ""})

    seed = int(hashlib.sha256(sid.encode()).hexdigest()[:8], 16) % 100000
    info = None
    for name, fn in (
        ("pollinations", lambda: fetch_pollinations(scene["image_prompt"], dest, seed)),
        ("nasa", lambda: fetch_nasa(scene, dest)),
        ("wikimedia", lambda: fetch_wikimedia(scene, dest)),
    ):
        try:
            info = fn()
            log(f"  image {sid}: {name} ok")
            break
        except Exception as e:  # noqa: BLE001
            log(f"  image {sid}: {name} unavailable -> {str(e)[:140]}")
    if info is None:
        info = make_gradient(dest, seed)
        log(f"  image {sid}: dark gradient fallback")
    info["image_prompt"] = scene["image_prompt"]
    for suffix in (".mp4", ".json"):          # the cached clip no longer matches the still
        (CLIP_DIR / f"{sid}{suffix}").unlink(missing_ok=True)
    manifest[sid] = info
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return info


# ---------------------------------------------------------------- video clips

def make_clip(scene, duration, idx, force=False):
    sid = scene_id(scene["scene"])
    image = IMAGE_DIR / f"{sid}.jpg"
    clip = CLIP_DIR / f"{sid}.mp4"
    frames = max(2, int(round(duration * FPS)))

    if clip.exists() and not force:
        try:
            stamp = json.loads((CLIP_DIR / f"{sid}.json").read_text())
            if abs(stamp["duration"] - duration) < 0.05:
                return clip, duration
        except Exception:  # noqa: BLE001
            pass

    if idx % 2 == 0:  # even -> zoom in, odd -> zoom out
        zexpr = f"1+0.00085*on"
    else:
        zexpr = f"max(1.0001,1.26-0.00085*on)"

    vf = (
        f"scale={WIDTH*2}:{HEIGHT*2}:force_original_aspect_ratio=increase,"
        f"crop={WIDTH*2}:{HEIGHT*2},"
        f"zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS},"
        f"format=yuv420p"
    )
    ffmpeg("-i", str(image), "-vf", vf, "-frames:v", str(frames), "-r", str(FPS),
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
           str(clip))
    (CLIP_DIR / f"{sid}.json").write_text(json.dumps({"duration": duration, "frames": frames}))
    return clip, duration


def retry_fallbacks(scenes, cooldown=45):
    """Second chance for scenes that fell back to NASA/Wikimedia/gradient: try Pollinations again.

    Keyless services throttle bursts, so a short cool-down usually recovers the missing stills.
    """
    manifest_path = IMAGE_DIR / "sources.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    weak = []
    for s in scenes:
        info = manifest.get(scene_id(s["scene"]), {})
        src = info.get("source")
        if src == "pollinations":
            continue
        # a real NASA/Wikimedia photo is fine as long as it is actually about this scene
        if src in ("nasa", "wikimedia") and info.get("title"):
            if relevance(info["title"], keywords_for(s))[0] >= 1:
                continue
        weak.append(s)
    if not weak:
        log("all scenes have a Pollinations still — nothing to retry")
        return manifest
    log(f"{len(weak)} scene(s) on fallback art; retrying Pollinations after {cooldown}s: "
        f"{[s['scene'] for s in weak]}")
    time.sleep(cooldown)
    for scene in weak:
        sid = scene_id(scene["scene"])
        dest = IMAGE_DIR / f"{sid}.jpg"
        seed = int(hashlib.sha256(sid.encode()).hexdigest()[:8], 16) % 100000
        try:
            info = fetch_pollinations(scene["image_prompt"], dest, seed + 999)
            info["image_prompt"] = scene["image_prompt"]
            for suffix in (".mp4", ".json"):
                (CLIP_DIR / f"{sid}{suffix}").unlink(missing_ok=True)
            manifest[sid] = info
            manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
            log(f"  recovered {sid} with Pollinations")
            time.sleep(3)
        except Exception as e:  # noqa: BLE001
            log(f"  {sid} still on fallback: {str(e)[:120]}")
            old = manifest.get(sid, {})
            if old.get("title") and relevance(old["title"], keywords_for(scene))[0] == 0:
                # current fallback art is off-topic: rebuild through the chain with strict filtering
                log(f"  {sid}: off-topic fallback art, regenerating")
                dest.unlink(missing_ok=True)
                manifest[sid] = make_image(scene, force=True)
    (CLIP_DIR / "scene_000.mp4").unlink(missing_ok=True)
    return manifest


def make_intro_card(out_path, title_hi, title_en):
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (WIDTH, HEIGHT), (5, 6, 16))
    d = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        t = y / HEIGHT
        c = (int(6 + 26 * t), int(7 + 10 * t), int(20 + 34 * t))
        d.line([(0, y), (WIDTH, y)], fill=c)
    for i in range(90):
        x, y = random.randint(0, WIDTH), random.randint(0, HEIGHT)
        v = random.randint(60, 190)
        d.ellipse([x, y, x + 2, y + 2], fill=(v, v, v))
    d.rectangle([0, HEIGHT - 10, WIDTH, HEIGHT], fill=(240, 150, 40))
    font_hi = ImageFont.truetype(str(FONT_DIR / "NotoSansDevanagari.ttf"), 96)
    font_en = ImageFont.truetype(str(FONT_DIR / "NotoSansDevanagari.ttf"), 46)

    def center(text, font, y, fill):
        box = d.textbbox((0, 0), text, font=font)
        d.text(((WIDTH - (box[2] - box[0])) / 2 - box[0], y), text, font=font, fill=fill)

    center(title_hi, font_hi, 380, (255, 255, 255))
    center(title_en, font_en, 520, (240, 170, 80))
    center("FACTOMATRIX", font_en, 700, (150, 160, 190))
    img.save(out_path, "JPEG", quality=94)


# ---------------------------------------------------------------- subtitles

def _dev_len(text):
    return len(text)


def split_narration(text, max_chars=78):
    """Break a narration block into subtitle chunks that fit 2 lines at 1080p."""
    text = re.sub(r"\s+", " ", text).strip()
    clauses = re.split(r"(?<=[।!?])\s+|(?<=[,;—–])\s+", text)
    chunks, cur = [], ""
    for cl in clauses:
        cl = cl.strip()
        if not cl:
            continue
        cand = (cur + " " + cl).strip()
        if _dev_len(cand) <= max_chars:
            cur = cand
        else:
            if cur:
                chunks.append(cur)
            if _dev_len(cl) <= max_chars:
                cur = cl
            else:
                words = cl.split()
                tmp = ""
                for w in words:
                    if _dev_len((tmp + " " + w).strip()) <= max_chars:
                        tmp = (tmp + " " + w).strip()
                    else:
                        if tmp:
                            chunks.append(tmp)
                        tmp = w
                cur = tmp
    if cur:
        chunks.append(cur)
    # merge tiny leftovers into the previous chunk
    out = []
    for c in chunks:
        if out and _dev_len(c) < 22 and _dev_len(out[-1]) + _dev_len(c) + 1 <= max_chars + 12:
            out[-1] = out[-1] + " " + c
        else:
            out.append(c)
    return out or [text]


def ass_time(t):
    if t < 0:
        t = 0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hindi,Noto Sans Devanagari,74,&H00FFFFFF,&H000000FF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,5,3,2,120,120,64,1
Style: Title,Noto Sans Devanagari,96,&H00FFFFFF,&H000000FF,&H00101010,&H90000000,1,0,0,0,100,100,0,0,1,5,3,5,120,120,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ass_escape(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


def build_ass(timings, out_path, title=None):
    """timings: list of (start, end, text)"""
    lines = [ASS_HEADER.format(w=WIDTH, h=HEIGHT)]
    if title:
        lines.append(f"Dialogue: 1,{ass_time(0)},{ass_time(title[1])},Title,,0,0,0,,{ass_escape(title[0])}")
    for start, end, text in timings:
        if end - start < 0.25:
            end = start + 0.25
        lines.append(
            f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Hindi,,0,0,0,,{ass_escape(text)}"
        )
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path


# ---------------------------------------------------------------- assembly

def build(scenes, out_path, title_data, force_images=False, force_audio=False):
    durations, timings = [], []
    cursor = 0.0

    # ---- intro card
    intro_jpg = RENDER_DIR / "intro_card.jpg"
    if not intro_jpg.exists():
        make_intro_card(intro_jpg, title_data.get("title_hi", ""), title_data.get("title_en", ""))
    intro_clip = CLIP_DIR / "scene_000.mp4"
    if not intro_clip.exists():
        vf = (f"scale={WIDTH*2}:{HEIGHT*2}:force_original_aspect_ratio=increase,"
              f"crop={WIDTH*2}:{HEIGHT*2},"
              f"zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              f":d={int(INTRO_SECONDS*FPS)}:s={WIDTH}x{HEIGHT}:fps={FPS},format=yuv420p")
        ffmpeg("-i", str(intro_jpg), "-vf", vf, "-frames:v", str(int(INTRO_SECONDS * FPS)),
               "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
               "-pix_fmt", "yuv420p", str(intro_clip))
    cursor += INTRO_SECONDS

    # ---- scenes: audio + image + clip
    for idx, scene in enumerate(scenes):
        n = scene["scene"]
        log(f"scene {n}/{scenes[-1]['scene']} ({idx+1}/{len(scenes)})")
        wav = make_audio(scene, force=force_audio)
        dur = wav_duration(wav)
        make_image(scene, force=force_images)
        make_clip(scene, dur, idx)
        durations.append(dur)
        chunks = split_narration(scene["narration"])
        total_chars = sum(_dev_len(c) for c in chunks) or 1
        t = cursor + LEAD_IN
        span = max(0.8, dur - LEAD_IN - TAIL_PAD * 0.6)
        for c in chunks:
            share = _dev_len(c) / total_chars * span
            timings.append((t, t + share, c))
            t += share
        cursor += dur

    # ---- concat video
    concat_v = RENDER_DIR / "concat_video.txt"
    with concat_v.open("w") as f:
        f.write(f"file '{intro_clip.resolve()}'\n")
        for s in scenes:
            f.write(f"file '{(CLIP_DIR / (scene_id(s['scene']) + '.mp4')).resolve()}'\n")
    video_all = RENDER_DIR / "_video_all.mp4"
    ffmpeg("-f", "concat", "-safe", "0", "-i", str(concat_v), "-c", "copy", str(video_all))

    # ---- concat audio
    concat_a = RENDER_DIR / "concat_audio.txt"
    with concat_a.open("w") as f:
        for s in scenes:
            f.write(f"file '{(AUDIO_DIR / (scene_id(s['scene']) + '.wav')).resolve()}'\n")
    audio_all = RENDER_DIR / "_audio_all.wav"
    ffmpeg("-f", "concat", "-safe", "0", "-i", str(concat_a), "-c", "copy", str(audio_all))

    # intro silence so audio lines up with the intro card
    lead = RENDER_DIR / "_lead.wav"
    ffmpeg("-f", "lavfi", "-t", f"{INTRO_SECONDS}", "-i", "anullsrc=r=48000:cl=mono",
           "-c:a", "pcm_s16le", str(lead))
    audio_padded = RENDER_DIR / "_audio_padded.wav"
    ffmpeg("-i", str(lead), "-i", str(audio_all), "-filter_complex",
           "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "-c:a", "pcm_s16le", str(audio_padded))

    # ---- subtitles
    ass_path = RENDER_DIR / "subtitles.ass"
    build_ass(timings, ass_path, title=None)

    # ---- final mux + burn
    log("burning subtitles and muxing final video...")
    ffmpeg(
        "-i", str(video_all), "-i", str(audio_padded),
        "-vf", f"ass={ass_path}:fontsdir={FONT_DIR}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-maxrate", "1000k", "-bufsize", "2000k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-movflags", "+faststart", "-shortest", str(out_path),
    )
    total = sum(durations) + INTRO_SECONDS
    log(f"done: {out_path}  (~{total/60:.2f} min)")
    return total


def write_report(out_path, total_seconds, scenes, title_data):
    manifest = {}
    mpath = IMAGE_DIR / "sources.json"
    if mpath.exists():
        manifest = json.loads(mpath.read_text())
    counts = {}
    rows = []
    for s in scenes:
        sid = scene_id(s["scene"])
        info = manifest.get(sid, {"source": "?"})
        counts[info.get("source", "?")] = counts.get(info.get("source", "?"), 0) + 1
        rows.append(f"| {s['scene']} | {info.get('source','?')} | {info.get('license','')} | "
                    f"{(info.get('title') or info.get('url','')[:70]).replace('|','/')} |")
    report = [
        f"# {title_data.get('title','')}",
        "",
        f"- Video: `{out_path.name}`",
        f"- Duration: {int(total_seconds//60)}m {int(total_seconds%60)}s",
        f"- Scenes: {len(scenes)}",
        f"- Voice: edge-tts `{VOICE}` (free, no key)",
        f"- Image sources: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())),
        "",
        "| Scene | Source | Licence | Asset |",
        "|---|---|---|---|",
        *rows,
        "",
    ]
    (RENDER_DIR / "report.md").write_text("\n".join(report), encoding="utf-8")
    (RENDER_DIR / "image_sources.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return counts


def main():
    global FFMPEG
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help="render only the first 5 scenes (~1 min)")
    ap.add_argument("--scenes", default="", help="e.g. 1-10 or 1,4,9")
    ap.add_argument("--out", default="")
    ap.add_argument("--stage", default="all", choices=["all", "audio", "images", "clips"])
    ap.add_argument("--force-images", action="store_true")
    ap.add_argument("--force-audio", action="store_true")
    ap.add_argument("--no-retry", action="store_true", help="skip the second Pollinations pass")
    args = ap.parse_args()

    FFMPEG = ffmpeg_bin()
    log(f"ffmpeg: {FFMPEG}")

    data = load_script()
    all_scenes = data["scenes"]
    if args.test:
        wanted = list(range(1, 6))
        out = Path(args.out) if args.out else RENDER_DIR / "test_1min.mp4"
    else:
        wanted = parse_scene_range(args.scenes, len(all_scenes))
        out = Path(args.out) if args.out else RENDER_DIR / "final.mp4"

    scenes = [s for s in all_scenes if s["scene"] in wanted]
    log(f"rendering {len(scenes)} scenes -> {out}")

    if args.stage == "audio":
        for s in scenes:
            make_audio(s, force=args.force_audio)
        return
    if args.stage == "images":
        for s in scenes:
            make_image(s, force=args.force_images)
        if not args.no_retry:
            retry_fallbacks(scenes)
        return
    if args.stage == "clips":
        for i, s in enumerate(scenes):
            wav = make_audio(s)
            make_clip(s, wav_duration(wav), i)
        return

    title_hi = data.get("title_hi") or "ब्लैक होल के अंदर क्या होता है"
    title_en = data.get("title_en") or "WHAT HAPPENS INSIDE A BLACK HOLE"
    if not args.no_retry:
        retry_fallbacks(scenes)

    total = build(scenes, out, {"title_hi": title_hi, "title_en": title_en},
                  force_images=args.force_images, force_audio=args.force_audio)
    counts = write_report(out, total, scenes, data)
    log(f"image sources: {counts}")

    # machine readable summary for the workflow
    summary = {
        "out": str(out),
        "duration_seconds": total,
        "scenes": len(scenes),
        "image_sources": counts,
    }
    (RENDER_DIR / "summary.json").write_text(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
