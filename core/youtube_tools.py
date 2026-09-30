"""YouTube automation tools for Nova on Android/Termux.

Inspired by GitHub projects such as TermuxTube and youtube-upload-sync, but kept
inside Nova's existing registry/security boundary.

The YouTube Data API upload path uses OAuth user credentials, not an API key.
Publishing/uploading is deliberately high-impact and must pass Nova approval.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any


DEFAULT_PRIVACY = "private"
ALLOWED_PRIVACY = {"private", "unlisted", "public"}
DEFAULT_CATEGORY_ID = "22"
DEFAULT_PROJECT_ROOT = Path.home() / "Nova" / "youtube"
DEFAULT_CLIENT_SECRET = DEFAULT_PROJECT_ROOT / "client_secret.json"
DEFAULT_TOKEN = DEFAULT_PROJECT_ROOT / "token.json"


def _paths() -> tuple[Path, Path, Path]:
    root = Path(os.getenv("NOVA_YOUTUBE_ROOT", str(DEFAULT_PROJECT_ROOT))).expanduser()
    client = Path(os.getenv("NOVA_YOUTUBE_CLIENT_SECRET", str(root / "client_secret.json"))).expanduser()
    token = Path(os.getenv("NOVA_YOUTUBE_TOKEN", str(root / "token.json"))).expanduser()
    return root, client, token


def youtube_status() -> dict[str, Any]:
    root, client, token = _paths()
    return {
        "success": True,
        "enabled": os.getenv("NOVA_YOUTUBE_ENABLED", "true").lower() == "true",
        "root": str(root),
        "client_secret_present": client.is_file(),
        "oauth_token_present": token.is_file(),
        "ffmpeg_present": shutil.which("ffmpeg") is not None,
        "upload_auth": "oauth2_user",
        "api_key_required_for_upload": False,
        "channel_creation": "not_supported_by_youtube_data_api",
        "default_privacy": DEFAULT_PRIVACY,
    }


def prepare_video(
    topic: str,
    title: str = "",
    description: str = "",
    tags: list | None = None,
    privacy: str = DEFAULT_PRIVACY,
    aspect: str = "16:9",
    duration_seconds: int = 8,
) -> dict[str, Any]:
    """Create a small local test video and metadata package with ffmpeg."""
    if not isinstance(topic, str) or not topic.strip():
        raise ValueError("topic must be a non-empty string.")
    if privacy not in ALLOWED_PRIVACY:
        raise ValueError("privacy must be private, unlisted, or public.")
    if aspect not in {"16:9", "9:16"}:
        raise ValueError("aspect must be 16:9 or 9:16.")
    duration = max(2, min(int(duration_seconds), 60))

    root, _, _ = _paths()
    project = root / "projects" / "nova_auto"
    project.mkdir(parents=True, exist_ok=True)
    video = project / "video.mp4"
    metadata = project / "metadata.json"

    width, height = (1280, 720) if aspect == "16:9" else (720, 1280)
    safe_title = (title.strip() or topic.strip())[:100]
    payload = {
        "title": safe_title,
        "description": description.strip()[:5000],
        "tags": [str(x)[:100] for x in (tags or [])][:30],
        "privacy": privacy,
        "aspect": aspect,
        "topic": topic.strip(),
        "generated_by": "Nova",
    }

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for local video creation.")

    # A lightweight render proves the end-to-end phone pipeline without
    # requiring a cloud media generator or API key.
    draw = (
        "drawtext=text='Nova':x=(w-text_w)/2:y=h*0.28:"
        "fontsize=64:fontcolor=white,"
        "drawtext=text='"
        + topic.strip().replace("\\", " ").replace("'", r"\'")
        + "':x=(w-text_w)/2:y=h*0.48:fontsize=36:fontcolor=white:"
        "enable='between(t,0,60)'"
    )
    subprocess.run(
        [
            ffmpeg, "-y",
            "-f", "lavfi",
            "-i", f"color=c=black:s={width}x{height}:d={duration}",
            "-vf", draw,
            "-r", "30",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            str(video),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    metadata.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return {
        "success": True,
        "video": str(video),
        "metadata": str(metadata),
        "metadata_payload": payload,
    }


def _youtube_service(client_secret: Path, token_path: Path):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError(
            "YouTube OAuth dependencies missing. Install google-api-python-client, "
            "google-auth-oauthlib, and google-auth-httplib2."
        ) from exc

    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    credentials = None
    if token_path.is_file():
        credentials = Credentials.from_authorized_user_file(str(token_path), scopes)

    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

    if not credentials or not credentials.valid:
        if not client_secret.is_file():
            raise RuntimeError(
                f"OAuth client JSON not found: {client_secret}. "
                "Create/download a Google OAuth desktop client first."
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(client_secret), scopes)
        credentials = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(credentials.to_json(), encoding="utf-8")

    return build("youtube", "v3", credentials=credentials)


def channel_status() -> dict[str, Any]:
    """Return the authenticated YouTube channel; does not create one."""
    root, client, token = _paths()
    service = _youtube_service(client, token)
    response = service.channels().list(part="snippet,statistics", mine=True).execute()
    items = response.get("items", [])
    if not items:
        return {
            "success": False,
            "channel_found": False,
            "message": "No YouTube channel is available on the authenticated Google account.",
        }
    item = items[0]
    return {
        "success": True,
        "channel_found": True,
        "channel_id": item.get("id"),
        "title": item.get("snippet", {}).get("title"),
        "statistics": item.get("statistics", {}),
        "root": str(root),
    }


def upload_video(
    video_path: str,
    title: str,
    description: str = "",
    tags: list | None = None,
    privacy: str = DEFAULT_PRIVACY,
    category_id: str = DEFAULT_CATEGORY_ID,
) -> dict[str, Any]:
    """Upload one local video using OAuth; Nova marks this operation high-impact."""
    if privacy not in ALLOWED_PRIVACY:
        raise ValueError("privacy must be private, unlisted, or public.")
    path = Path(video_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Video not found: {path}")
    if path.stat().st_size <= 0:
        raise ValueError("Video file is empty.")
    if not title.strip():
        raise ValueError("title must be non-empty.")

    root, client, token = _paths()
    service = _youtube_service(client, token)

    try:
        from googleapiclient.http import MediaFileUpload
    except ImportError as exc:
        raise RuntimeError("google-api-python-client is missing.") from exc

    body = {
        "snippet": {
            "title": title.strip()[:100],
            "description": description[:5000],
            "tags": [str(x)[:100] for x in (tags or [])][:30],
            "categoryId": str(category_id),
        },
        "status": {"privacyStatus": privacy},
    }

    media = MediaFileUpload(str(path), chunksize=8 * 1024 * 1024, resumable=True)
    request = service.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        _, response = request.next_chunk()

    return {
        "success": True,
        "video_id": response.get("id"),
        "privacy": privacy,
        "title": title.strip()[:100],
        "source": str(path),
        "root": str(root),
    }
