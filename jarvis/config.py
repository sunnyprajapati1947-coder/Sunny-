"""Settings for JARVIS.

Resolution order (later wins):
    1. built-in defaults
    2. <home>/config.toml          (created on first run)
    3. <project>/config/nova.env   (existing Nova settings, NOVA_* keys only)
    4. environment variables

Secrets live in <home>/secrets.env (chmod 600) or the environment. They are
never written into the repository, never returned by the API and never logged.
"""

from __future__ import annotations

import os
import re
import secrets
import stat
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
HOME = Path(os.environ.get("JARVIS_HOME", Path.home() / ".openjarvis")).expanduser()

SECRET_ENV_KEYS = (
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
    "TAVILY_API_KEY",
)

DEFAULT_TOML = """\
# JARVIS settings. Safe to edit. No secrets here — put keys in secrets.env.

[assistant]
name = "JARVIS"
owner = "Boss"
language = "auto"          # auto | hinglish | hindi | english
persona = ""

[provider]
mode = "auto"              # auto | gemini | openrouter | openai | groq | deepseek | local | offline
model = "gemini-2.5-flash"
max_tokens = 1400
temperature = 0.6
timeout = 60
retries = 2

[local]
# llama.cpp OpenAI-compatible lanes started by automation/start_fast_lane.sh
fast_url = "http://127.0.0.1:8081/v1"
deep_url = "http://127.0.0.1:8080/v1"
fast_model = "NovaLocal"

[server]
host = "127.0.0.1"
port = 8787
allow_lan = false

[limits]
max_tool_steps = 5
tool_timeout = 30
python_timeout = 20
memory_budget_chars = 2400
max_attachments = 3
approval_ttl = 600         # seconds an approval stays valid

[privacy]
store_chats = true
redact_secrets = true
"""


@dataclass
class Settings:
    home: Path = HOME
    project_root: Path = PROJECT_ROOT
    assistant_name: str = "JARVIS"
    owner: str = "Boss"
    language: str = "auto"
    persona: str = ""
    provider_mode: str = "auto"
    model: str = "gemini-2.5-flash"
    max_tokens: int = 1400
    temperature: float = 0.6
    timeout: int = 60
    retries: int = 2
    fast_url: str = "http://127.0.0.1:8081/v1"
    deep_url: str = "http://127.0.0.1:8080/v1"
    fast_model: str = "NovaLocal"
    host: str = "127.0.0.1"
    port: int = 8787
    allow_lan: bool = False
    max_tool_steps: int = 5
    tool_timeout: int = 30
    python_timeout: int = 20
    memory_budget_chars: int = 2400
    approval_ttl: int = 600
    store_chats: bool = True
    redact: bool = True
    sources: list = field(default_factory=list)
    secret_presence: dict = field(default_factory=dict)

    # ------------------------------------------------------------ properties

    @property
    def db_path(self) -> Path:
        return self.home / "jarvis.db"

    @property
    def token_path(self) -> Path:
        return self.home / "dashboard.token"

    @property
    def secrets_path(self) -> Path:
        return self.home / "secrets.env"

    @property
    def config_path(self) -> Path:
        return self.home / "config.toml"

    @property
    def log_dir(self) -> Path:
        return self.home / "logs"

    def secret(self, name: str) -> str:
        return os.environ.get(name, "").strip()

    def has_secret(self, name: str) -> bool:
        return bool(self.secret(name))

    def key_for(self, provider: str) -> str:
        mapping = {
            "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
            "openai": ("OPENAI_API_KEY",),
            "openrouter": ("OPENROUTER_API_KEY",),
            "groq": ("GROQ_API_KEY",),
            "deepseek": ("DEEPSEEK_API_KEY",),
            "anthropic": ("ANTHROPIC_API_KEY",),
        }
        for name in mapping.get(provider, ()):
            value = self.secret(name)
            if value:
                return value
        return ""

    def public(self) -> dict:
        """Everything the UI is allowed to see — no secret values."""
        return {
            "assistant": {
                "name": self.assistant_name,
                "owner": self.owner,
                "language": self.language,
                "persona": self.persona,
            },
            "provider": {
                "mode": self.provider_mode,
                "model": self.model,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "timeout": self.timeout,
                "retries": self.retries,
            },
            "local": {"fast_url": self.fast_url, "deep_url": self.deep_url, "fast_model": self.fast_model},
            "server": {"host": self.host, "port": self.port, "allow_lan": self.allow_lan},
            "limits": {
                "max_tool_steps": self.max_tool_steps,
                "tool_timeout": self.tool_timeout,
                "python_timeout": self.python_timeout,
                "memory_budget_chars": self.memory_budget_chars,
                "approval_ttl": self.approval_ttl,
            },
            "privacy": {"store_chats": self.store_chats, "redact_secrets": self.redact},
            "keys_present": {name: self.has_secret(name) for name in SECRET_ENV_KEYS},
            "paths": {
                "home": str(self.home),
                "database": str(self.db_path),
                "secrets": str(self.secrets_path),
                "config": str(self.config_path),
                "project_root": str(self.project_root),
            },
            "sources": self.sources,
        }


# ----------------------------------------------------------------- helpers

def _ensure_home(home: Path) -> None:
    home.mkdir(parents=True, exist_ok=True)
    try:
        home.chmod(0o700)
    except OSError:
        pass
    config = home / "config.toml"
    if not config.exists():
        config.write_text(DEFAULT_TOML, encoding="utf-8")
        try:
            config.chmod(0o600)
        except OSError:
            pass
    secrets_file = home / "secrets.env"
    if not secrets_file.exists():
        secrets_file.write_text(
            "# JARVIS secrets. chmod 600. Never commit this file.\n"
            "# GEMINI_API_KEY=...\n"
            "# OPENROUTER_API_KEY=...\n",
            encoding="utf-8",
        )
        try:
            secrets_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass


def _load_secrets(path: Path) -> list[str]:
    """Load KEY=VALUE pairs from secrets.env into os.environ once. Returns names loaded."""
    loaded = []
    if not path.exists():
        return loaded
    try:
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.replace("export ", "").strip()
            value = value.strip().strip('"').strip("'")
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or not value:
                continue
            os.environ.setdefault(name, value)
            loaded.append(name)
    except OSError:
        pass
    return loaded


def _toml_sections(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _nova_env(path: Path) -> dict:
    """Read the existing Nova env file. Values only for non-secret NOVA_* keys."""
    out = {}
    if not path.exists():
        return out
    try:
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip().strip('"').strip("'")
            if name.startswith("NOVA_") and value and not re.search(r"SECRET|TOKEN|PASSWORD", name, re.I):
                out[name] = value
    except OSError:
        pass
    return out


def _pick(value, default):
    return default if value is None else value


def _as_int(value, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _as_float(value, default: float) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _as_bool(value, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return default


def load(home: Path | str | None = None) -> Settings:
    home_path = Path(home).expanduser() if home else HOME
    _ensure_home(home_path)
    settings = Settings(home=home_path)
    sources = []

    data = _toml_sections(home_path / "config.toml")
    if data:
        sources.append(str(home_path / "config.toml"))
    assistant = data.get("assistant", {}) or {}
    provider = data.get("provider", {}) or {}
    local = data.get("local", {}) or {}
    server = data.get("server", {}) or {}
    limits = data.get("limits", {}) or {}
    privacy = data.get("privacy", {}) or {}

    settings.assistant_name = str(assistant.get("name", settings.assistant_name))[:24] or "JARVIS"
    settings.owner = str(assistant.get("owner", settings.owner))[:40]
    settings.language = str(assistant.get("language", settings.language))
    settings.persona = str(assistant.get("persona", ""))[:1200]

    settings.provider_mode = str(provider.get("mode", settings.provider_mode)).lower()
    settings.model = str(provider.get("model", settings.model))
    settings.max_tokens = _as_int(provider.get("max_tokens"), settings.max_tokens)
    settings.temperature = _as_float(provider.get("temperature"), settings.temperature)
    settings.timeout = _as_int(provider.get("timeout"), settings.timeout)
    settings.retries = _as_int(provider.get("retries"), settings.retries)

    settings.fast_url = str(local.get("fast_url", settings.fast_url)).rstrip("/")
    settings.deep_url = str(local.get("deep_url", settings.deep_url)).rstrip("/")
    settings.fast_model = str(local.get("fast_model", settings.fast_model))

    settings.host = str(server.get("host", settings.host))
    settings.port = _as_int(server.get("port"), settings.port)
    settings.allow_lan = _as_bool(server.get("allow_lan"), settings.allow_lan)

    settings.max_tool_steps = max(1, min(10, _as_int(limits.get("max_tool_steps"), settings.max_tool_steps)))
    settings.tool_timeout = max(3, _as_int(limits.get("tool_timeout"), settings.tool_timeout))
    settings.python_timeout = max(3, _as_int(limits.get("python_timeout"), settings.python_timeout))
    settings.memory_budget_chars = max(400, _as_int(limits.get("memory_budget_chars"), settings.memory_budget_chars))
    settings.approval_ttl = max(30, _as_int(limits.get("approval_ttl"), settings.approval_ttl))

    settings.store_chats = _as_bool(privacy.get("store_chats"), settings.store_chats)
    settings.redact = _as_bool(privacy.get("redact_secrets"), settings.redact)

    nova_path = settings.project_root / "config" / "nova.env"
    nova = _nova_env(nova_path)
    if nova:
        sources.append(str(nova_path))
        model = nova.get("NOVA_QWEN_MODEL")
        if model and settings.provider_mode in ("auto", "local"):
            pass  # local lane reports its own model name
        fast_url = nova.get("NOVA_FAST_QWEN_URL", "")
        if fast_url.endswith("/chat/completions"):
            settings.fast_url = fast_url.rsplit("/chat/completions", 1)[0]
        deep_url = nova.get("NOVA_QWEN_URL", "")
        if deep_url.endswith("/chat/completions"):
            settings.deep_url = deep_url.rsplit("/chat/completions", 1)[0]

    # secrets file, then environment override
    if _load_secrets(settings.secrets_path):
        sources.append(str(settings.secrets_path))

    env_map = {
        "JARVIS_NAME": ("assistant_name", str),
        "JARVIS_OWNER": ("owner", str),
        "JARVIS_LANGUAGE": ("language", str),
        "JARVIS_PROVIDER": ("provider_mode", lambda v: str(v).lower()),
        "JARVIS_MODEL": ("model", str),
        "JARVIS_HOST": ("host", str),
        "JARVIS_PORT": ("port", _as_int),
        "JARVIS_ALLOW_LAN": ("allow_lan", _as_bool),
        "JARVIS_MAX_TOOL_STEPS": ("max_tool_steps", _as_int),
        "JARVIS_APPROVAL_TTL": ("approval_ttl", _as_int),
        "JARVIS_FAST_URL": ("fast_url", str),
        "JARVIS_DEEP_URL": ("deep_url", str),
    }
    for env_name, (attr, caster) in env_map.items():
        raw = os.environ.get(env_name)
        if raw is None:
            continue
        try:
            setattr(settings, attr, caster(raw))
        except Exception:
            continue

    settings.sources = sources
    settings.secret_presence = {name: settings.has_secret(name) for name in SECRET_ENV_KEYS}
    return settings


# ------------------------------------------------------------- persistence

def save_settings(settings: Settings, patch: dict) -> Settings:
    """Merge a validated patch into config.toml and reload. Secrets are rejected."""
    data = _toml_sections(settings.config_path) or {}
    for section, values in (patch or {}).items():
        if not isinstance(values, dict) or section not in (
            "assistant", "provider", "local", "server", "limits", "privacy"
        ):
            continue
        target = data.setdefault(section, {})
        for key, value in values.items():
            if re.search(r"key|secret|token|password", str(key), re.I):
                continue  # never store secrets in config.toml
            if isinstance(value, (str, int, float, bool)):
                target[str(key)] = value
    settings.config_path.write_text(_dump_toml(data), encoding="utf-8")
    try:
        settings.config_path.chmod(0o600)
    except OSError:
        pass
    return load(settings.home)


SECRET_ALIASES = {
    "gemini": "GEMINI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "tavily": "TAVILY_API_KEY",
}


def save_secret(settings: Settings, name: str, value: str) -> None:
    """Store one secret in secrets.env with 0600. Empty value removes it.

    `name` may be a provider alias ("gemini") or the full env name
    ("GEMINI_API_KEY"); only an allow-list of keys is accepted so a typos
    cannot silently write a useless line.
    """
    name = SECRET_ALIASES.get(str(name).strip().lower(), str(name).strip().upper())
    if name not in SECRET_ENV_KEYS:
        raise ValueError(f"invalid secret name: {name!r} (allowed: {', '.join(SECRET_ENV_KEYS)})")
    lines = []
    if settings.secrets_path.exists():
        for raw in settings.secrets_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if raw.strip().startswith(name + "="):
                continue
            lines.append(raw)
    if value:
        lines.append(f"{name}={value}")
        os.environ[name] = value
    else:
        os.environ.pop(name, None)
    settings.secrets_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    try:
        settings.secrets_path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def token(settings: Settings) -> str:
    """Dashboard bearer token, created on first use (0600)."""
    path = settings.token_path
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{20,}", value):
            return value
    value = secrets.token_urlsafe(32)
    path.write_text(value + "\n", encoding="utf-8")
    try:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass
    return value


def _dump_toml(data: dict) -> str:
    out = ["# JARVIS settings. Safe to edit. No secrets here — put keys in secrets.env.", ""]
    for section in ("assistant", "provider", "local", "server", "limits", "privacy"):
        values = data.get(section)
        if not isinstance(values, dict):
            continue
        out.append(f"[{section}]")
        for key, value in values.items():
            if isinstance(value, bool):
                rendered = "true" if value else "false"
            elif isinstance(value, (int, float)):
                rendered = str(value)
            else:
                text = str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
                rendered = f'"{text}"'
            out.append(f"{key} = {rendered}")
        out.append("")
    return "\n".join(out)
