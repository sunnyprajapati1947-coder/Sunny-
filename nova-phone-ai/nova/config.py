"""Configuration loading.

Order of precedence (highest first): environment variables, $NOVA_HOME/nova.toml,
built-in defaults. API keys live only in $NOVA_HOME/secrets.env (chmod 600) and are
never written to logs, memory, or the repository.
"""

from __future__ import annotations

import os
import stat
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from nova.util import register_secret

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def default_home() -> Path:
    return Path(os.environ.get("NOVA_HOME", "~/.nova-phone")).expanduser()


@dataclass
class LLMConfig:
    base_url: str = "http://127.0.0.1:8081/v1"        # existing llama.cpp llama-server
    model: str = "Qwen3.5-0.8B-Q4_0"
    model_path: str = "~/NovaAI/models/Qwen3.5-0.8B-Q4_0.gguf"  # checked by doctor, never loaded here
    timeout: float = 180.0
    max_tokens: int = 384
    temperature: float = 0.3
    disable_thinking: bool = True
    context_chars: int = 5000


@dataclass
class OnlineConfig:
    enabled: bool = False                              # opt-in only; sends prompts to the provider
    base_url: str = "https://api.groq.com/openai/v1"  # any OpenAI-compatible endpoint
    model: str = "llama-3.1-8b-instant"               # check your provider's current model list
    api_key_name: str = "NOVA_ONLINE_API_KEY"
    timeout: float = 60.0


@dataclass
class AgentConfig:
    max_steps: int = 6
    max_plan_steps: int = 6
    max_step_retries: int = 2
    max_format_errors: int = 2
    allow_code_exec_in_daemon: bool = False


@dataclass
class WebConfig:
    searxng_url: str = ""          # optional self-hosted SearXNG, e.g. http://127.0.0.1:8888
    wikipedia_api: str = "https://en.wikipedia.org/w/api.php"  # keyless default search backend
    allow_private_hosts: bool = False  # keep False on phone; True only for local tests
    timeout: float = 15.0
    max_bytes: int = 1_000_000


@dataclass
class UpdateConfig:
    remote: str = "origin"
    trusted_remotes: list = field(default_factory=lambda: [
        "https://github.com/sunnyprajapati1947-coder/Sunny-.git",
    ])
    branch: str = "arena/c4b8873b-sunny"


@dataclass
class Config:
    home: Path
    workspace: Path
    project_root: Path = PROJECT_ROOT
    llm: LLMConfig = field(default_factory=LLMConfig)
    online: OnlineConfig = field(default_factory=OnlineConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    web: WebConfig = field(default_factory=WebConfig)
    update: UpdateConfig = field(default_factory=UpdateConfig)
    voice_tts: bool = False
    daemon_interval: float = 30.0
    secrets: dict = field(default_factory=dict)

    @property
    def db_path(self) -> Path:
        return self.home / "nova.db"

    @property
    def log_dir(self) -> Path:
        return self.home / "logs"

    @property
    def run_dir(self) -> Path:
        return self.home / "run"

    @property
    def backup_dir(self) -> Path:
        return self.home / "backups"

    @property
    def config_file(self) -> Path:
        return self.home / "nova.toml"

    @property
    def secrets_file(self) -> Path:
        return self.home / "secrets.env"

    def protected_paths(self) -> list[Path]:
        """Paths the assistant may never write to (its own code, config, secrets, DB)."""
        return [self.project_root, self.home / "nova.toml", self.secrets_file, self.db_path,
                self.backup_dir]

    def online_api_key(self) -> str:
        return self.secrets.get(self.online.api_key_name, "") or os.environ.get(self.online.api_key_name, "")

    def online_ready(self) -> bool:
        return bool(self.online.enabled and self.online_api_key())


def parse_env_file(path: Path) -> dict:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key.startswith("export "):
            key = key[len("export "):].strip()
        if key:
            values[key] = value
    return values


def load_config(home: Path | None = None) -> Config:
    home = (home or default_home()).expanduser()
    data: dict = {}
    cfg_file = Path(os.environ.get("NOVA_CONFIG", home / "nova.toml")).expanduser()
    if cfg_file.is_file():
        with cfg_file.open("rb") as fh:
            data = tomllib.load(fh)

    workspace = Path(os.path.expanduser(data.get("workspace", str(home / "workspace"))))
    cfg = Config(home=home, workspace=workspace)
    for section, target in (("llm", cfg.llm), ("online", cfg.online), ("agent", cfg.agent),
                            ("web", cfg.web), ("update", cfg.update)):
        for key, value in data.get(section, {}).items():
            if hasattr(target, key):
                setattr(target, key, value)
    cfg.voice_tts = bool(data.get("voice_tts", cfg.voice_tts))
    cfg.daemon_interval = float(data.get("daemon_interval", cfg.daemon_interval))

    # Environment overrides (useful for Termux one-off runs and tests).
    env = os.environ
    if "NOVA_LLM_URL" in env:
        cfg.llm.base_url = env["NOVA_LLM_URL"]
    if "NOVA_LLM_MODEL" in env:
        cfg.llm.model = env["NOVA_LLM_MODEL"]
    if "NOVA_ONLINE_BASE_URL" in env:
        cfg.online.base_url = env["NOVA_ONLINE_BASE_URL"]
        cfg.online.enabled = True
    if "NOVA_ONLINE_MODEL" in env:
        cfg.online.model = env["NOVA_ONLINE_MODEL"]
    if "NOVA_SEARXNG_URL" in env:
        cfg.web.searxng_url = env["NOVA_SEARXNG_URL"]

    cfg.secrets = parse_env_file(cfg.secrets_file)
    for value in cfg.secrets.values():
        register_secret(value)
    return cfg


def secrets_permissions_ok(path: Path) -> bool | None:
    """True if chmod 600-ish, False if group/other can read, None if missing."""
    if not path.exists():
        return None
    mode = stat.S_IMODE(path.stat().st_mode)
    return (mode & (stat.S_IRWXG | stat.S_IRWXO)) == 0
