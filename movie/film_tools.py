"""
film_tools.py — Nova-facing bridge for the cartoon-film pipeline.

The repo's `core/youtube_tools.prepare_video()` can only render a placeholder
(`drawtext` over a black frame) because it has no media generator behind it.
This module is that generator: it exposes the same "return a dict" style so a
tool router can call it, and it hand the finished file straight to
`core.youtube_tools.upload_video()` / `movie/drive_upload.py`.

    from movie.film_tools import film_status, build_film, youtube_metadata
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "movie" / "build"
OUT = ROOT / "output"
FILM = "Neelu_aur_Gyaan_ka_Chashma_1080p"


def film_status() -> dict[str, Any]:
    """What exists right now (cheap: only stats files, renders nothing)."""
    timing = BUILD / "timing.json"
    total = None
    scenes = 0
    if timing.is_file():
        data = json.loads(timing.read_text(encoding="utf-8"))
        total = round(data.get("total", 0) / 60.0, 2)
        scenes = len(data.get("scenes", []))
    segs = sorted((BUILD / "seg").glob("seg_*.mp4")) if (BUILD / "seg").is_dir() else []
    final = OUT / f"{FILM}.mp4"
    return {
        "success": True,
        "story": "नीलू और ज्ञान का चश्मा",
        "scenes_defined": 36,
        "scenes_rendered": len(segs),
        "soundtrack": (BUILD / "soundtrack.wav").is_file(),
        "timing_ready": timing.is_file(),
        "film_minutes": total,
        "scenes_in_timing": scenes,
        "final_video": str(final) if final.is_file() else None,
        "final_video_mb": round(final.stat().st_size / 1e6, 1) if final.is_file() else 0,
        "font_present": (ROOT / "assets" / "fonts" /
                          "NotoSansDevanagari-Bold.ttf").is_file(),
        "engines": {"frames": "movie/lib/cgilib.py (numpy 3D shading)",
                    "text": "Harfbuzz + FreeType (Devanagari shaping)",
                    "voice": "espeak-ng hi+m3 (offline)",
                    "encode": "ffmpeg/libx264 via imageio-ffmpeg"},
    }


def build_film(minutes: float = 10.0, workers: int = 2, assemble: bool = True) -> dict[str, Any]:
    """Full pipeline: narration/score -> shots -> concat -> mux."""
    env = dict(os.environ, FILM_SECONDS=str(int(minutes * 60)))
    steps = []
    steps.append(subprocess.run([sys.executable, "movie/audio.py"], cwd=ROOT, env=env,
                                capture_output=True, text=True))
    if steps[-1].returncode != 0:
        return {"success": False, "stage": "audio", "error": steps[-1].stderr[-1500:]}
    # two workers over disjoint shot ranges (2 cores here)
    split = 18
    procs = []
    for lo, hi in ((1, split), (split + 1, 36)):
        if workers <= 1:
            continue
        procs.append(subprocess.Popen(
            [sys.executable, "-u", "movie/make_film.py", "--from", str(lo), "--to", str(hi)],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True))
    if not procs:
        subprocess.run([sys.executable, "movie/make_film.py"], cwd=ROOT, check=False)
    for p in procs:
        p.wait()
    if assemble:
        r = subprocess.run([sys.executable, "movie/make_film.py", "--assemble-only"],
                           cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            return {"success": False, "stage": "assemble", "error": r.stdout[-1500:]}
    return film_status()


def youtube_metadata() -> dict[str, Any]:
    """Ready-to-fill payload for core.youtube_tools.upload_video()."""
    return {
        "title": "नीलू और ज्ञान का चश्मा | Neelu aur Gyaan ka Chashma | Hindi Cartoon Story",
        "description": (
            "मोहनपुर गाँव का बिट्टू पढ़ाई से बचने के लिए जादू ढूँढ़ता है, और आसमान से गिरा "
            "रोबो-बिल्ला नीलू उसे ज्ञान का चश्मा देता है। पर जब गाँव का हैंडपंप टूटता है, "
            "चश्मा काम नहीं आता — मेहनत आती है। 10 मिनट की 3D कार्टून कहानी।\n\n"
            "#hindikahani #cartoon #moralstories #kahaniya #3dcartoon #kidstories"
        ),
        "tags": ["hindi kahani", "cartoon story", "moral stories in hindi", "3d cartoon",
                 "kahaniya", "kids story hindi", "doraemon style", "village story"],
        "privacy": "private",
        "video": str(OUT / f"{FILM}.mp4"),
        "thumbnail": str(OUT / f"{FILM}_thumbnail.jpg"),
    }


if __name__ == "__main__":
    print(json.dumps(film_status(), indent=2, ensure_ascii=False))
