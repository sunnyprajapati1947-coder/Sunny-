"""Security boundary: path sandboxing, command policy, and approval levels.

Risk levels used across tools:
  safe     - runs without asking (read-only or reversible, inside the workspace)
  confirm  - needs an explicit yes from the user (interactive) or is denied (daemon)
  blocked  - never runs
"""

from __future__ import annotations

import os
import re
import shlex
from dataclasses import dataclass
from pathlib import Path


class PolicyError(Exception):
    """Raised when a path or command violates the sandbox policy."""


# Filenames that must never be read or written by the assistant.
SENSITIVE_NAMES = {
    ".env", "secrets.env", ".netrc", ".git-credentials", "id_rsa", "id_ed25519",
    "token.json", "client_secret.json",
}
SENSITIVE_SUFFIXES = (".pem", ".key", ".p12", ".keystore")

BLOCKED_COMMAND_PATTERNS = [
    r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(/|~|\$HOME|\*|\.\.)",
    r"\bsudo\b", r"\bsu\s", r"\bmkfs\b", r"\bdd\s+if=", r"\bshutdown\b", r"\breboot\b",
    r":\(\)\s*\{", r"\bchmod\s+-R\s+777\b", r"\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b",
    r"\beval\b", r"\bpkill\b", r"\bkillall\b", r"\bkill\s+-9\s+-1\b",
    r"/etc/", r"\.ssh\b", r"\.netrc", r"\.git-credentials", r"\bgh\s+auth\b",
    r"\bprintenv\b", r"(^|\s)env\s*$", r"\bcat\b.*\b(secrets\.env|\.env)\b",
]

SAFE_COMMANDS = {
    "ls", "pwd", "date", "uptime", "df", "du", "whoami", "head", "tail", "wc",
    "sort", "uniq", "echo", "file", "stat", "grep",
}
SAFE_GIT_SUBCOMMANDS = {"status", "log", "diff", "branch", "show", "rev-parse", "ls-files"}
SAFE_GH_SUBCOMMANDS = {("repo", "view"), ("issue", "list"), ("pr", "list"), ("run", "list"),
                       ("release", "list"), ("status",)}
SAFE_PYTHON_MODULES = {"unittest", "py_compile"}

_BLOCKED_RE = [re.compile(p) for p in BLOCKED_COMMAND_PATTERNS]


@dataclass
class Verdict:
    risk: str  # safe | confirm | blocked
    reason: str


def is_sensitive_name(path: Path) -> bool:
    name = path.name.lower()
    return name in SENSITIVE_NAMES or name.startswith("id_rsa") or name.endswith(SENSITIVE_SUFFIXES) \
        or name.startswith("client_secret")


def resolve_in_roots(rel: str, roots: list[Path], base: Path) -> Path:
    """Resolve a user/AI supplied path and ensure it stays inside one of `roots`."""
    if not isinstance(rel, str) or not rel.strip():
        raise PolicyError("empty path")
    if "\x00" in rel:
        raise PolicyError("invalid path")
    candidate = Path(os.path.expanduser(rel.strip()))
    if not candidate.is_absolute():
        candidate = base / candidate
    resolved = candidate.resolve()
    for root in roots:
        root_resolved = root.resolve()
        if resolved == root_resolved or root_resolved in resolved.parents:
            if is_sensitive_name(resolved):
                raise PolicyError(f"sensitive file is not accessible: {resolved.name}")
            return resolved
    raise PolicyError(f"path is outside the allowed folders: {rel}")


def check_writable(path: Path, workspace: Path, protected: list[Path]) -> None:
    """Writes are only allowed inside the workspace and never into protected trees."""
    ws = workspace.resolve()
    if not (path == ws or ws in path.parents):
        raise PolicyError("writes are only allowed inside the Nova workspace")
    for prot in protected:
        p = prot.resolve()
        if path == p or p in path.parents:
            raise PolicyError("this path is protected (Nova core/config) and cannot be modified by the assistant")
    if is_sensitive_name(path):
        raise PolicyError("sensitive file names cannot be written by the assistant")


def classify_command(argv: list[str]) -> Verdict:
    """Classify a command argv (never run through a shell)."""
    if not argv:
        return Verdict("blocked", "empty command")
    joined = " ".join(argv)
    for pattern in _BLOCKED_RE:
        if pattern.search(joined):
            return Verdict("blocked", f"matches blocked pattern {pattern.pattern!r}")
    prog = os.path.basename(argv[0])
    args = argv[1:]
    external_path = any(a.startswith("/") or a.startswith("~") or ".." in a for a in args)
    if external_path:
        return Verdict("confirm", "argument refers to a path outside the workspace")

    if prog in SAFE_COMMANDS:
        return Verdict("safe", "read-only/harmless command")
    if prog == "git" and args and args[0] in SAFE_GIT_SUBCOMMANDS:
        return Verdict("safe", "read-only git command")
    if prog == "gh" and args and (tuple(args[:2]) in SAFE_GH_SUBCOMMANDS or tuple(args[:1]) in SAFE_GH_SUBCOMMANDS):
        return Verdict("safe", "read-only GitHub CLI command")
    if prog in {"python", "python3"} and len(args) >= 2 and args[0] == "-m" and args[1] in SAFE_PYTHON_MODULES:
        return Verdict("safe", "test/compile module")
    return Verdict("confirm", f"'{prog}' is not in the safe list")


def parse_command(command: str) -> list[str]:
    try:
        argv = shlex.split(command)
    except ValueError as exc:
        raise PolicyError(f"could not parse command: {exc}") from exc
    if not argv:
        raise PolicyError("empty command")
    return argv


# Only git/gh receive GitHub tokens (they need them to talk to GitHub); nothing else does.
GITHUB_TOKEN_VARS = ("GH_TOKEN", "GITHUB_TOKEN")


def sanitized_env(base: dict | None = None, allow: tuple[str, ...] = ()) -> dict:
    """Environment for child processes: keep essentials, drop anything secret-looking.
    `allow` lists extra variable names to pass through explicitly (e.g. GITHUB_TOKEN_VARS for gh/git)."""
    src = dict(os.environ if base is None else base)
    keep = {}
    for key in ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "PREFIX", "TERM", "SHELL", "USER", "LOGNAME",
                "XDG_CONFIG_HOME", *allow):
        if key in src:
            keep[key] = src[key]
    keep.setdefault("PATH", "/usr/bin:/bin")
    keep["PYTHONIOENCODING"] = "utf-8"
    keep["PYTHONDONTWRITEBYTECODE"] = "1"
    return keep
