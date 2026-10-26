"""Configuration for J.A.R.V.I.S.

Reads (in order): existing environment, config/nova.env, config/jarvis.env,
then user overrides persisted in data/jarvis/settings.json.
No secret is ever written to the repository.
"""
from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

from jarvis import CODENAME, __version__

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("JARVIS_DATA_DIR") or (ROOT / "data" / "jarvis")).expanduser()
WEB_DIR = ROOT / "web"
LOG_DIR = ROOT / "logs"
SETTINGS_FILE = DATA_DIR / "settings.json"
VERSION = __version__

SUPPORTED_LANGUAGES = ("en-IN", "en-GB", "en-US", "hi-IN")


def load_env_file(path: Path) -> None:
    """Load a tiny KEY=VALUE env file without overriding the real environment."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


for _name in ("nova.env", "jarvis.env", "jarvis.env.example"):
    load_env_file(ROOT / "config" / _name)


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "y"}


def env_int(name: str, default: int) -> int:
    try:
        return int(str(os.getenv(name, default)).strip())
    except (TypeError, ValueError):
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, default)).strip())
    except (TypeError, ValueError):
        return default


@dataclass
class Settings:
    owner: str = "Sir"
    city: str = "Patna"
    country_code: str = "+91"
    language: str = "en-IN"
    wake_word: str = "jarvis"
    wake_word_enabled: bool = False
    speak: bool = True
    sound: bool = True
    voice_name: str = ""
    voice_rate: float = 0.98
    voice_pitch: float = 0.85
    music_dir: str = str(Path.home() / "Music")
    notes_dir: str = str(DATA_DIR / "files")

    # Brain / providers
    llm_enabled: bool = True
    llm_tools: bool = True
    gemini_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_fallback_models: tuple[str, ...] = ("gemini-2.0-flash",)
    qwen_url: str = "http://127.0.0.1:8080/v1/chat/completions"
    qwen_model: str = "Qwen3.5-4B-Q4_K_M"
    fast_qwen_url: str = "http://127.0.0.1:8081/v1/chat/completions"
    fast_qwen_model: str = "NovaLocal"

    # Networking
    speedtest_url: str = "https://speed.cloudflare.com/__down?bytes=5000000"
    news_feed: str = "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
    http_timeout: float = 9.0

    # Server
    host: str = "0.0.0.0"
    port: int = 7777
    version: str = VERSION
    codename: str = CODENAME

    extra: dict = field(default_factory=dict)

    def public(self) -> dict:
        data = asdict(self)
        data.pop("gemini_key", None)
        data.pop("extra", None)
        data["has_gemini"] = bool(self.gemini_key)
        if self.llm_enabled:
            data["brain_label"] = "GEMINI LINK" if self.gemini_key else "LOCAL UPLINK"
        else:
            data["brain_label"] = "OFFLINE CORE"
        return data


def _env_settings() -> Settings:
    return Settings(
        owner=os.getenv("JARVIS_OWNER") or os.getenv("NOVA_OWNER") or "Sir",
        city=os.getenv("JARVIS_CITY", "Patna"),
        country_code=os.getenv("JARVIS_COUNTRY_CODE", "+91"),
        language=os.getenv("JARVIS_LANGUAGE", "en-IN"),
        wake_word=os.getenv("JARVIS_WAKE_WORD", "jarvis"),
        wake_word_enabled=env_bool("JARVIS_WAKE_WORD_ENABLED", False),
        speak=env_bool("JARVIS_SPEAK", True),
        sound=env_bool("JARVIS_SOUND", True),
        voice_name=os.getenv("JARVIS_VOICE", ""),
        voice_rate=env_float("JARVIS_VOICE_RATE", 0.98),
        voice_pitch=env_float("JARVIS_VOICE_PITCH", 0.85),
        music_dir=os.getenv("JARVIS_MUSIC_DIR", str(Path.home() / "Music")),
        notes_dir=os.getenv("JARVIS_FILES_DIR", str(DATA_DIR / "files")),
        llm_enabled=env_bool("JARVIS_LLM_ENABLED", True),
        llm_tools=env_bool("JARVIS_LLM_TOOLS", True),
        gemini_key=(
            os.getenv("JARVIS_GEMINI_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or ""
        ).strip(),
        gemini_model=os.getenv("JARVIS_GEMINI_MODEL", "gemini-2.5-flash"),
        qwen_url=os.getenv("JARVIS_QWEN_URL")
        or os.getenv("NOVA_QWEN_URL", "http://127.0.0.1:8080/v1/chat/completions"),
        qwen_model=os.getenv("JARVIS_QWEN_MODEL")
        or os.getenv("NOVA_QWEN_MODEL", "Qwen3.5-4B-Q4_K_M"),
        fast_qwen_url=os.getenv("JARVIS_FAST_QWEN_URL")
        or os.getenv("NOVA_FAST_QWEN_URL", "http://127.0.0.1:8081/v1/chat/completions"),
        fast_qwen_model=os.getenv("JARVIS_FAST_QWEN_MODEL")
        or os.getenv("NOVA_FAST_QWEN_MODEL", "NovaLocal"),
        speedtest_url=os.getenv(
            "JARVIS_SPEEDTEST_URL", "https://speed.cloudflare.com/__down?bytes=5000000"
        ),
        news_feed=os.getenv(
            "JARVIS_NEWS_FEED",
            "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en",
        ),
        http_timeout=env_float("JARVIS_HTTP_TIMEOUT", 9.0),
        host=os.getenv("JARVIS_HOST", "0.0.0.0"),
        port=env_int("JARVIS_PORT", 7777),
    )


USER_TUNABLE = {
    "owner",
    "city",
    "country_code",
    "language",
    "wake_word",
    "wake_word_enabled",
    "speak",
    "sound",
    "voice_name",
    "voice_rate",
    "voice_pitch",
    "music_dir",
    "notes_dir",
    "llm_enabled",
    "llm_tools",
}


def _apply_overrides(settings: Settings, overrides: dict) -> Settings:
    for key in USER_TUNABLE:
        if key not in overrides:
            continue
        value = overrides[key]
        try:
            if key in {"wake_word_enabled", "speak", "sound", "llm_enabled", "llm_tools"}:
                value = bool(value)
            elif key in {"voice_rate", "voice_pitch"}:
                value = float(value)
            else:
                value = str(value)
            setattr(settings, key, value)
        except (TypeError, ValueError):
            continue
    return settings


def validate_patch(patch: dict) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    clean: dict = {}
    if not isinstance(patch, dict):
        return clean, ["Settings payload must be an object."]

    text_limits = {
        "owner": 40,
        "city": 60,
        "country_code": 6,
        "wake_word": 24,
        "voice_name": 80,
        "music_dir": 300,
        "notes_dir": 300,
    }
    for key, limit in text_limits.items():
        if key in patch:
            value = str(patch[key] or "").strip()[:limit]
            if key in {"owner", "city"} and not value:
                warnings.append(f"{key} cannot be empty")
                continue
            clean[key] = value

    if "language" in patch:
        language = str(patch["language"] or "en-IN")
        if language not in SUPPORTED_LANGUAGES:
            language = "en-IN"
            warnings.append("Unsupported recognition language; using en-IN")
        clean["language"] = language

    for key in ("voice_rate", "voice_pitch"):
        if key in patch:
            try:
                value = float(patch[key])
            except (TypeError, ValueError):
                continue
            low, high = (0.6, 1.4) if key == "voice_rate" else (0.5, 1.5)
            clean[key] = max(low, min(high, value))

    for key in ("wake_word_enabled", "speak", "sound", "llm_enabled", "llm_tools"):
        if key in patch:
            clean[key] = bool(patch[key])

    return clean, warnings


_settings_lock = threading.RLock()
_settings_cache: Settings | None = None


def get_settings() -> Settings:
    global _settings_cache
    with _settings_lock:
        if _settings_cache is not None:
            return _settings_cache
        settings = _env_settings()
        try:
            overrides = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(overrides, dict):
                settings = _apply_overrides(settings, overrides)
        except (OSError, json.JSONDecodeError):
            pass
        _settings_cache = settings
        return settings


def reset_settings_cache() -> None:
    global _settings_cache
    with _settings_lock:
        _settings_cache = None


def update_settings(patch: dict) -> tuple[Settings, list[str]]:
    clean, warnings = validate_patch(patch or {})
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        stored = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, json.JSONDecodeError):
        stored = {}
    stored.update(clean)
    tmp = SETTINGS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(stored, indent=2), encoding="utf-8")
    tmp.replace(SETTINGS_FILE)
    try:
        os.chmod(SETTINGS_FILE, 0o600)
    except OSError:
        pass
    reset_settings_cache()
    return get_settings(), warnings


def ensure_dirs() -> None:
    for path in (DATA_DIR, DATA_DIR / "files", DATA_DIR / "screenshots", LOG_DIR):
        try:
            path.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
