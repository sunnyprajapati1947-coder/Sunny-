"""Music and media control."""
from __future__ import annotations

import shutil
from pathlib import Path
from urllib.parse import quote_plus

from jarvis.config import get_settings
from jarvis.security import run_command
from jarvis.skills import files
from jarvis.util import reply, truncate

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".wma"}

DEFAULT_QUERY = "lofi hip hop radio"


def _local_matches(query: str, limit: int = 5) -> list[Path]:
    settings = get_settings()
    root = Path(settings.music_dir).expanduser()
    if not root.exists() or not root.is_dir():
        return []
    needle = query.lower().strip()
    matches: list[Path] = []
    try:
        for path in root.rglob("*"):
            if len(matches) >= limit:
                break
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            if not needle or needle in path.stem.lower():
                matches.append(path)
    except OSError:
        return matches
    return matches


def play_music(query: str = "") -> dict:
    settings = get_settings()
    requested = str(query or "").strip()
    if not requested or requested.lower() in {"music", "some music", "songs", "gaana", "gana"}:
        requested = DEFAULT_QUERY

    matches = _local_matches(requested) or _local_matches("")
    if matches:
        track = matches[0]
        opened = files.open_path(str(track))
        return reply(
            f"Playing “{track.stem}” from your library, Sir.",
            speech=f"Playing {truncate(track.stem, 60)}, Sir.",
            cards=[
                {
                    "type": "media",
                    "title": track.stem,
                    "subtitle": "LOCAL LIBRARY",
                    "detail": str(track.parent),
                }
            ],
            action=opened.get("action"),
            data={"path": str(track)},
        )

    url = "https://www.youtube.com/results?search_query=" + quote_plus(requested)
    return reply(
        f"I did not find “{requested}” in your music folder, Sir, so I have prepared YouTube.",
        speech=f"Playing {truncate(requested, 50)} from YouTube, Sir.",
        action={"type": "open_url", "url": url, "label": "YouTube"},
        cards=[
            {
                "type": "link",
                "title": f"YouTube: {truncate(requested, 70)}",
                "subtitle": "youtube.com",
                "url": url,
            }
        ],
        data={"query": requested, "url": url, "music_dir": settings.music_dir},
    )


def _playerctl_available() -> bool:
    return bool(shutil.which("playerctl"))


def media_control(action: str = "playpause") -> dict:
    action = str(action or "playpause").lower()
    mapping = {
        "playpause": "play-pause",
        "pause": "pause",
        "resume": "play",
        "play": "play",
        "next": "next",
        "previous": "previous",
        "stop": "stop",
    }
    command = mapping.get(action, "play-pause")

    if not _playerctl_available():
        return reply(
            "No media player bridge is available, Sir. Install playerctl to control local playback.",
            speech="I cannot reach a media player, Sir.",
        )
    result = run_command(["playerctl", command], timeout=5)
    if result.get("ok"):
        labels = {
            "playpause": "Toggling playback, Sir.",
            "pause": "Paused, Sir.",
            "resume": "Resuming, Sir.",
            "next": "Next track, Sir.",
            "previous": "Previous track, Sir.",
            "stop": "Stopped, Sir.",
        }
        return reply(labels.get(action, "Done, Sir."), speech=labels.get(action, "Done, Sir."))
    return reply("No active media player responded, Sir.", speech="No active media player, Sir.")


def now_playing() -> dict:
    if not _playerctl_available():
        return reply("No media player bridge is available, Sir.")
    info = run_command(["playerctl", "metadata", "--format", "{{artist}} — {{title}}"], timeout=5)
    if info.get("ok") and info.get("stdout"):
        title = info["stdout"].strip()
        return reply(
            f"Now playing: {title}.",
            speech=f"Now playing {title}, Sir.",
            cards=[{"type": "media", "title": title, "subtitle": "NOW PLAYING"}],
        )
    return reply("Nothing appears to be playing, Sir.", speech="Nothing is playing, Sir.")
