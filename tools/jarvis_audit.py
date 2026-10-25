#!/usr/bin/env python3
"""Jarvis/Nova read-only runtime auditor.

Runs on Termux (Android) or Debian and writes a report about the *existing*
installation so an outside engineer can plan changes without guessing.

Design rules:
  * read-only   - never writes inside the project, never restarts anything
  * no secrets  - values are never printed, only key names and "set / empty"
  * stdlib only - no pip install needed on the phone
  * safe        - every probe is wrapped; one failure never stops the report

Usage:
    python3 tools/jarvis_audit.py                      # audit auto-detected projects
    python3 tools/jarvis_audit.py --project /root/OpenJarvis --project ~/Nova
    python3 tools/jarvis_audit.py --no-net             # skip connectivity probes
    python3 tools/jarvis_audit.py --out ~/jarvis-audit

Output:
    <out>/jarvis-audit-<timestamp>.json   machine readable
    <out>/jarvis-audit-<timestamp>.md     shareable summary (secrets already stripped)
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.0.0"

# ---------------------------------------------------------------- constants

SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|secret|token|password|passwd|credential|authorization|"
    r"client[_-]?secret|private[_-]?key|session|cookie|bearer)",
    re.I,
)
SECRET_VALUE_RE = re.compile(
    r"(AIza[0-9A-Za-z_\-]{20,}"          # Google
    r"|sk-[A-Za-z0-9]{20,}"              # OpenAI style
    r"|ghp_[A-Za-z0-9]{20,}"             # GitHub
    r"|github_pat_[A-Za-z0-9_]{20,}"
    r"|xox[baprs]-[A-Za-z0-9-]{10,}"     # Slack
    r"|\b\d{8,10}:[A-Za-z0-9_-]{30,}\b"  # Telegram bot
    r")"
)
PLACEHOLDER_RE = re.compile(r"(your|replace|example|changeme|xxx+|placeholder|<.*>|todo|dummy)", re.I)

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env", "site-packages",
    "dist", "build", ".pytest_cache", ".mypy_cache", ".ruff_cache", "models",
    ".cache", "apps", "workspace/output", "workspace",
}

PY_PACKAGES = [
    "requests", "httpx", "aiohttp", "fastapi", "uvicorn", "flask", "pydantic",
    "rich", "prompt_toolkit", "tomli", "pyyaml", "numpy", "pandas", "pytest",
    "google-generativeai", "google-genai", "openai", "anthropic", "groq",
    "python-telegram-bot", "beautifulsoup4", "lxml", "pillow", "matplotlib",
    "google-api-python-client", "google-auth-oauthlib", "duckduckgo-search",
    "trafilatura", "sqlalchemy", "apscheduler", "psutil",
]

BINARIES = [
    "python3", "pip", "git", "curl", "wget", "ffmpeg", "ffprobe", "node", "npm",
    "sqlite3", "rg", "jq", "sudo", "proot", "proot-distro", "tmux", "screen",
    "llama-cli", "llama-server", "llama.cpp", "ollama", "termux-wake-lock",
    "termux-battery-status", "termux-notification", "termux-toast",
    "termux-tts-speak", "termux-speech-to-text", "termux-clipboard-get",
    "termux-clipboard-set", "termux-vibrate", "termux-volume", "termux-wifi-connectioninfo",
    "am", "getprop", "dumpsys",
]

NET_HOSTS = [
    ("generativelanguage.googleapis.com", 443, "Gemini API"),
    ("api.openai.com", 443, "OpenAI"),
    ("openrouter.ai", 443, "OpenRouter"),
    ("api.anthropic.com", 443, "Anthropic"),
    ("api.groq.com", 443, "Groq"),
    ("github.com", 443, "GitHub"),
    ("html.duckduckgo.com", 443, "DuckDuckGo HTML (web_search backend)"),
]

KNOWN_PORTS = {
    22: "ssh", 80: "http", 443: "https", 3000: "node/dev", 5000: "flask/dev",
    8000: "uvicorn/dev", 8080: "llama-server (deep lane)", 8081: "llama-server (fast lane)",
    8082: "http alt", 8888: "jupyter", 11434: "ollama", 8008: "gemini-cli/proxy",
    7000: "dev", 4000: "dev", 9000: "dev",
}

PROJECT_CANDIDATES = [
    "/root/OpenJarvis", "~/OpenJarvis", "~/Nova", "~/jarvis", "~/Jarvis",
    "~/openjarvis", "~/nova", "/data/data/com.termux/files/home/Nova",
    "/data/data/com.termux/files/home/OpenJarvis",
]

MAX_READ = 1_500_000


# ---------------------------------------------------------------- helpers

def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(cmd, timeout=8, cwd=None, env=None):
    """Run a command, return (ok, stdout, stderr). Never raises."""
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, cwd=cwd, env=env,
            errors="replace",
        )
        return proc.returncode == 0, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except FileNotFoundError:
        return False, "", "not found"
    except subprocess.TimeoutExpired:
        return False, "", "timeout"
    except Exception as exc:  # pragma: no cover - defensive
        return False, "", f"{type(exc).__name__}: {exc}"


def safe(fn, default, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"} if default is None else default


def read_text(path: Path, limit: int = MAX_READ) -> str:
    try:
        if path.stat().st_size > limit:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                return handle.read(limit)
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def kind_of_value(value: str) -> str:
    """Describe a config value without leaking it."""
    value = (value or "").strip().strip('"').strip("'")
    if not value:
        return "empty"
    if PLACEHOLDER_RE.search(value):
        return "placeholder"
    if SECRET_VALUE_RE.search(value):
        return f"SECRET-LIKE (len={len(value)})"
    if value.startswith(("/", "~", "./")):
        return "path"
    if value.lower() in {"true", "false"}:
        return "bool"
    if re.fullmatch(r"\d+", value):
        return "int"
    if value.startswith(("http://", "https://")):
        return "url"
    if len(value) > 24 and re.fullmatch(r"[A-Za-z0-9_\-./+=]+", value):
        return f"opaque-long (len={len(value)})"
    return "text"


def keyvalue_report(text: str) -> dict:
    """Parse KEY=VALUE / KEY = "VALUE" config text into {key: kind}, never values.

    A key whose *name* looks sensitive and whose value is neither empty nor an
    obvious placeholder is reported as SECRET-LIKE regardless of the value shape,
    because real tokens come in many lengths.
    """
    out = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)$", line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        kind = kind_of_value(value)
        if SECRET_KEY_RE.search(key) and kind not in ("empty", "placeholder", "bool", "int", "path", "url"):
            if not kind.startswith("SECRET-LIKE"):
                kind = f"SECRET-LIKE ({kind}, len={len(value.strip().strip(chr(34)).strip(chr(39)))})"
        out[key] = kind
    return out


def toml_report(text: str) -> dict:
    """Report top-level TOML structure + which sections hold secret-ish keys."""
    info = {"parses": False, "sections": [], "secret_keys": [], "keys": {}, "error": ""}
    try:
        try:
            import tomllib  # py3.11+
            data = tomllib.loads(text)
        except ModuleNotFoundError:
            data = None
        if data is None:
            # fallback: regex sections
            sections = re.findall(r"^\[([^\]]+)\]", text, re.M)
            info["sections"] = sections[:40]
            info["parses"] = bool(sections)
            for key in re.findall(r"^([A-Za-z_][\w-]*)\s*=", text, re.M):
                info["keys"].setdefault(key, "unknown")
            if SECRET_KEY_RE.search(text):
                info["secret_keys"] = sorted({k for k in info["keys"] if SECRET_KEY_RE.search(k)})
            return info
        info["parses"] = True
        info["sections"] = list(data.keys())[:40]

        def walk(node, prefix=""):
            if isinstance(node, dict):
                for key, value in node.items():
                    path = f"{prefix}{key}"
                    if SECRET_KEY_RE.search(str(key)):
                        info["secret_keys"].append(path)
                        info["keys"][path] = kind_of_value(str(value))
                    elif isinstance(value, (str, int, float, bool)):
                        info["keys"][path] = kind_of_value(str(value))
                    else:
                        walk(value, path + ".")

        walk(data)
        return info
    except Exception as exc:
        info["error"] = f"{type(exc).__name__}: {exc}"
        return info


# ---------------------------------------------------------------- probes

def probe_system() -> dict:
    info = {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "system": platform.system(),
        "python": sys.version.split()[0],
        "python_impl": platform.python_implementation(),
        "executable": sys.executable,
        "prefix": sys.prefix,
        "cwd": os.getcwd(),
        "user": os.environ.get("USER") or os.environ.get("LOGNAME") or "",
        "uid": os.getuid() if hasattr(os, "getuid") else None,
        "is_root": (os.geteuid() == 0) if hasattr(os, "geteuid") else None,
        "termux": bool(os.environ.get("TERMUX_VERSION") or "/com.termux/" in sys.prefix),
        "termux_version": os.environ.get("TERMUX_VERSION", ""),
        "prefix_env": os.environ.get("PREFIX", ""),
        "proot": bool(os.environ.get("PROOT_TMP_DIR") or os.environ.get("PROOT_L2S_DIR")),
        "distro": "",
        "cpu_count": os.cpu_count(),
        "in_venv": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    }
    ok, out, _ = run(["cat", "/etc/os-release"])
    if ok:
        for line in out.splitlines():
            if line.startswith("PRETTY_NAME="):
                info["distro"] = line.split("=", 1)[1].strip().strip('"')
    if info["termux"] or shutil.which("getprop"):
        for prop, key in (
            ("ro.build.version.release", "android_release"),
            ("ro.build.version.sdk", "android_sdk"),
            ("ro.product.model", "android_model"),
            ("ro.product.brand", "android_brand"),
            ("ro.product.cpu.abi", "android_abi"),
        ):
            ok, out, _ = run(["getprop", prop], timeout=4)
            if ok and out:
                info[key] = out
    return info


def probe_resources() -> dict:
    info = {}
    try:
        mem = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, _, rest = line.partition(":")
            parts = rest.strip().split()
            if parts and parts[0].isdigit():
                mem[key] = int(parts[0]) // 1024  # MB
        info["memory_mb"] = {
            "total": mem.get("MemTotal"),
            "available": mem.get("MemAvailable"),
            "swap_total": mem.get("SwapTotal"),
        }
    except Exception as exc:
        info["memory_mb"] = {"error": str(exc)}
    try:
        info["loadavg"] = list(os.getloadavg())
    except Exception:
        info["loadavg"] = []
    disks = {}
    for label, path in (("home", str(Path.home())), ("root", "/"), ("tmp", "/tmp")):
        try:
            usage = shutil.disk_usage(path)
            disks[label] = {
                "total_gb": round(usage.total / 2**30, 1),
                "free_gb": round(usage.free / 2**30, 1),
                "used_pct": round(100 * (usage.total - usage.free) / usage.total, 1),
            }
        except Exception:
            continue
    info["disk"] = disks
    ok, out, _ = run(["termux-battery-status"], timeout=5)
    if ok and out:
        try:
            data = json.loads(out)
            info["battery"] = {k: data.get(k) for k in ("percentage", "status", "temperature", "plugged")}
        except Exception:
            info["battery"] = {"raw": out[:100]}
    return info


def probe_packages() -> dict:
    found = {}
    try:
        from importlib import metadata
        installed = {d.metadata["Name"].lower() for d in metadata.distributions() if d.metadata.get("Name")}
    except Exception:
        installed = set()
    for name in PY_PACKAGES:
        try:
            from importlib import metadata
            version = metadata.version(name)
            found[name] = version
        except Exception:
            if name.lower() in installed:
                found[name] = "installed"
    ok, out, _ = run([sys.executable, "-m", "pip", "list", "--format=freeze"], timeout=25)
    return {
        "count": len(out.splitlines()) if ok else 0,
        "key_packages": found,
        "pip_ok": ok,
        "venv": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    }


def probe_binaries() -> dict:
    return {name: (shutil.which(name) or "") for name in BINARIES}


def probe_models() -> dict:
    roots = [Path.home(), Path("/models"), Path("/data/data/com.termux/files/home/models")]
    found = []
    seen = set()
    for root in roots:
        if not root.exists() or str(root) in seen:
            continue
        seen.add(str(root))
        count = 0
        for dirpath, dirnames, filenames in os.walk(root):
            depth = str(dirpath).count(os.sep) - str(root).count(os.sep)
            if depth > 3:
                dirnames[:] = []
                continue
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                if name.lower().endswith((".gguf", ".ggml", ".bin")) and "model" in str(dirpath).lower() + name.lower():
                    path = Path(dirpath) / name
                    try:
                        size_gb = round(path.stat().st_size / 2**30, 2)
                    except Exception:
                        size_gb = None
                    found.append({"path": str(path), "size_gb": size_gb})
                    count += 1
            if count > 40:
                break
    llama_dirs = [str(p) for p in (Path.home() / "llama.cpp", Path.home() / "llama-cpp", Path("/opt/llama.cpp")) if p.exists()]
    return {"gguf_files": found[:40], "llama_cpp_dirs": llama_dirs}


def probe_ports() -> list:
    """Parse /proc/net/tcp for LISTEN sockets without needing ss/netstat."""
    listening = []
    for table in ("/proc/net/tcp", "/proc/net/tcp6"):
        path = Path(table)
        if not path.exists():
            continue
        try:
            for line in path.read_text().splitlines()[1:]:
                parts = line.split()
                if len(parts) < 4:
                    continue
                if parts[3] != "0A":  # TCP_LISTEN
                    continue
                local = parts[1]
                port_hex = local.rsplit(":", 1)[-1]
                try:
                    port = int(port_hex, 16)
                except ValueError:
                    continue
                if port not in {p["port"] for p in listening}:
                    listening.append({
                        "port": port,
                        "addr": local.rsplit(":", 1)[0],
                        "hint": KNOWN_PORTS.get(port, ""),
                    })
        except Exception:
            continue
    return sorted(listening, key=lambda row: row["port"])


def probe_processes() -> list:
    ok, out, _ = run(["ps", "-eo", "pid,etime,pcpu,pmem,args"], timeout=8)
    if not ok:
        ok, out, _ = run(["ps", "-A"], timeout=8)
    rows = []
    for line in out.splitlines()[1:]:
        low = line.lower()
        if any(key in low for key in ("llama", "nova", "jarvis", "openjarvis", "uvicorn", "fastapi", "ollama", "watchdog")):
            rows.append(line.strip()[:220])
    return rows[:40]


def probe_network(no_net: bool) -> dict:
    if no_net:
        return {"skipped": True}
    out = {}
    for host, port, label in NET_HOSTS:
        start = time.time()
        try:
            socket.setdefaulttimeout(4.0)
            with socket.create_connection((host, port), timeout=4.0):
                out[label] = {"host": host, "ok": True, "ms": int((time.time() - start) * 1000)}
        except Exception as exc:
            out[label] = {"host": host, "ok": False, "error": type(exc).__name__}
    return out


def probe_env_keys() -> dict:
    wanted = [
        "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
        "ANTHROPIC_API_KEY", "GROQ_API_KEY", "DEEPSEEK_API_KEY", "XAI_API_KEY",
        "TAVILY_API_KEY", "SERPAPI_API_KEY", "BRAVE_API_KEY", "TELEGRAM_BOT_TOKEN",
        "NOVA_QWEN_URL", "NOVA_QWEN_MODEL", "NOVA_FAST_QWEN_URL", "NOVA_ROOT",
        "ANDROID_DATA", "TERMUX_VERSION", "PREFIX", "TMPDIR",
    ]
    out = {}
    for key in wanted:
        value = os.environ.get(key)
        if value is None:
            out[key] = "unset"
        elif SECRET_KEY_RE.search(key):
            out[key] = kind_of_value(value)
        else:
            out[key] = value if len(value) <= 90 else value[:87] + "..."
    return out


def probe_project(path: Path) -> dict:
    info = {"path": str(path), "exists": path.exists()}
    if not path.exists():
        return info
    info["is_git"] = (path / ".git").exists()
    if info["is_git"]:
        _, branch, _ = run(["git", "-C", str(path), "rev-parse", "--abbrev-ref", "HEAD"], timeout=8)
        _, head, _ = run(["git", "-C", str(path), "log", "-1", "--format=%h %ad %s", "--date=short"], timeout=8)
        _, remote, _ = run(["git", "-C", str(path), "remote", "-v"], timeout=8)
        _, status, _ = run(["git", "-C", str(path), "status", "--porcelain"], timeout=10)
        info["git"] = {
            "branch": branch,
            "head": head,
            "remote": (remote.splitlines()[0] if remote else "").split("\t")[0] if remote else "",
            "dirty_files": len(status.splitlines()) if status else 0,
            "dirty_sample": status.splitlines()[:12] if status else [],
        }
    counts = {"python": 0, "markdown": 0, "json": 0, "toml": 0, "shell": 0, "total": 0}
    py_files = []
    tracked_secret_files = []
    for dirpath, dirnames, filenames in os.walk(path):
        rel = os.path.relpath(dirpath, path)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > 4:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".git")]
        for name in filenames:
            suffix = Path(name).suffix.lower()
            counts["total"] += 1
            if suffix == ".py":
                counts["python"] += 1
                py_files.append(str(Path(dirpath) / name))
            elif suffix in (".md", ".mdx"):
                counts["markdown"] += 1
            elif suffix == ".json":
                counts["json"] += 1
            elif suffix == ".toml":
                counts["toml"] += 1
            elif suffix in (".sh", ".bash"):
                counts["shell"] += 1
    info["file_counts"] = counts
    info["python_files"] = len(py_files)
    info["pycache_dirs"] = sum(1 for _ in path.rglob("__pycache__")) if counts["total"] < 6000 else -1

    # syntax check without writing bytecode
    broken = []
    for file in py_files[:1200]:
        try:
            ast.parse(read_text(Path(file)))
        except SyntaxError as exc:
            broken.append({"file": str(Path(file).relative_to(path)), "line": exc.lineno, "error": exc.msg})
        except Exception:
            continue
    info["syntax_errors"] = broken[:20]
    info["syntax_error_count"] = len(broken)

    entrypoints = []
    for name in ("main.py", "app.py", "cli.py", "server.py", "bot.py", "run.py", "jarvis.py",
                 "nova_chat.py", "pyproject.toml", "setup.py", "requirements.txt",
                 "Makefile", "docker-compose.yml", "package.json", "config.toml",
                 "config/nova.env", ".env", "jarvis-start", "start.sh", "run.sh"):
        if (path / name).exists():
            entrypoints.append(name)
    info["entrypoints"] = entrypoints

    # config files: report keys only
    configs = []
    for pattern in ("config/*.env", "*.env", ".env", "config.toml", "config/*.toml",
                    "config/*.json", "config/*.yaml", "config/*.yml"):
        for file in sorted(path.glob(pattern))[:10]:
            if not file.is_file() or file.stat().st_size > 200_000:
                continue
            text = read_text(file)
            entry = {"file": str(file.relative_to(path)), "keys": {}}
            if file.suffix == ".toml":
                entry["keys"] = toml_report(text)
            else:
                entry["keys"] = keyvalue_report(text)
            keys_map = entry.get("keys") or {}
            if isinstance(keys_map, dict) and keys_map.get("secret_keys") and not keys_map.get("keys"):
                entry["suspicious_keys"] = keys_map.get("secret_keys", [])
            else:
                flat = keys_map.get("keys", keys_map) if isinstance(keys_map, dict) else {}
                suspicious = [k for k, v in (flat or {}).items()
                              if isinstance(v, str) and ("SECRET-LIKE" in v or v.startswith("opaque-long"))]
                if suspicious:
                    entry["suspicious_keys"] = suspicious
            configs.append(entry)
            if info["is_git"]:
                ok, out, _ = run(["git", "-C", str(path), "ls-files", "--error-unmatch", str(file.relative_to(path))], timeout=6)
                if ok:
                    entry["tracked_by_git"] = True
                    if suspicious:
                        tracked_secret_files.append(str(file.relative_to(path)))
    info["configs"] = configs
    info["tracked_configs_with_secrets"] = tracked_secret_files

    # runtime state snapshots (task queue, kill switch, audit)
    state_file = path / "tasks" / "state.json"
    if state_file.exists():
        try:
            data = json.loads(read_text(state_file) or "{}")
            statuses = {}
            for row in data.values():
                statuses[row.get("status", "?")] = statuses.get(row.get("status", "?"), 0) + 1
            info["task_state"] = {"tasks": len(data), "by_status": statuses,
                                  "descriptions": [str(r.get("description", ""))[:40] for r in list(data.values())[:5]]}
        except Exception as exc:
            info["task_state"] = {"error": str(exc)}
    audit = path / "logs" / "audit.jsonl"
    if audit.exists():
        events = {}
        for line in (read_text(audit, 2_000_000) or "").splitlines()[-500:]:
            try:
                events[json.loads(line).get("event", "?")] = events.get(json.loads(line).get("event", "?"), 0) + 1
            except Exception:
                continue
        info["audit_log"] = {"lines_sampled": min(500, len((read_text(audit) or "").splitlines())), "events": events}
    info["kill_switch_file"] = (path / "config" / "NOVA_KILL").exists()

    # import smoke test in a subprocess so we never pollute this process
    probe = (
        "import importlib,sys,json\n"
        "sys.path.insert(0,%r)\n"
        "mods=%r\n"
        "out={}\n"
        "for m in mods:\n"
        "    try:\n"
        "        importlib.import_module(m); out[m]='ok'\n"
        "    except Exception as e:\n"
        "        out[m]=type(e).__name__+': '+str(e)[:120]\n"
        "print(json.dumps(out))\n"
    ) % (str(path), ["core.fast_router", "core.tool_registry", "core.tool_bridge",
                     "security.policy", "security.approval", "tasks.task_state",
                     "tasks.task_queue", "verifier.verify", "repair.repair"])
    ok, out, err = run([sys.executable, "-c", probe], timeout=40, cwd=str(path))
    try:
        info["imports"] = json.loads(out) if ok else {"error": err[:200] or "failed"}
    except Exception:
        info["imports"] = {"error": "unparsable output"}
    tool_probe = (
        "import json,sys\nsys.path.insert(0,%r)\n"
        "try:\n"
        "    from core.tool_bridge import build_registry\n"
        "    reg=build_registry(); print(json.dumps({'ok':True,'names':reg.names()}))\n"
        "except Exception as e:\n"
        "    print(json.dumps({'ok':False,'error':type(e).__name__+': '+str(e)[:200]}))\n"
    ) % str(path)
    ok, out, _ = run([sys.executable, "-c", tool_probe], timeout=40, cwd=str(path))
    try:
        info["tools"] = json.loads(out) if ok and out else {"ok": False, "error": "probe failed"}
    except Exception:
        info["tools"] = {"ok": False, "error": "unparsable"}

    if info["is_git"]:
        _, tracked, _ = run(["git", "-C", str(path), "ls-files"], timeout=20)
        files = tracked.splitlines() if tracked else []
        info["tracked"] = {
            "count": len(files),
            "pyc": sum(1 for f in files if f.endswith(".pyc")),
            "env_or_secret_files": [f for f in files if re.search(
                r"(^|/)(\.env|.*\.env|client_secret.*|token\.json|credentials.*|id_rsa.*)$", f)][:10],
            "state_files": [f for f in files if re.search(r"(state\.json|.*\.sqlite|.*\.db)$", f)][:10],
            "logs": [f for f in files if re.search(r"\.log$", f)][:10],
            "gitignore": (path / ".gitignore").exists(),
        }
    readme = path / "README.md"
    if readme.exists():
        info["readme_head"] = read_text(readme, 1500).splitlines()[:18]
    return info


def probe_services() -> dict:
    info = {}
    info["systemd"] = shutil.which("systemctl") is not None
    ok, out, _ = run(["systemctl", "is-system-running"], timeout=5)
    info["systemd_state"] = out if ok else "unavailable"
    info["cron"] = shutil.which("crontab") is not None
    ok, out, _ = run(["crontab", "-l"], timeout=5)
    info["crontab_lines"] = len(out.splitlines()) if ok and out else 0
    info["termux_boot_dir"] = str(Path.home() / ".termux" / "boot")
    info["termux_boot_scripts"] = sorted(
        p.name for p in (Path.home() / ".termux" / "boot").glob("*") if p.is_file()
    ) if (Path.home() / ".termux" / "boot").is_dir() else []
    info["wake_lock_active"] = (Path("/data/data/com.termux/files/usr/var/run/wakelock") .exists()
                                if Path("/data/data/com.termux/files/usr/var/run").exists() else None)
    for name in ("jarvis-start", "nova-start", "jarvis", "nova"):
        info[f"path_{name}"] = shutil.which(name) or ""
    ok, out, _ = run(["bash", "-lc", "type -t jarvis-start 2>/dev/null || alias jarvis-start 2>/dev/null"], timeout=8)
    info["jarvis_start_shim"] = out[:200] if ok else ""
    for rc in (".bashrc", ".zshrc", ".profile"):
        file = Path.home() / rc
        if file.exists():
            text = read_text(file, 200_000)
            hits = [line.strip()[:160] for line in text.splitlines()
                    if "jarvis" in line.lower() or "nova" in line.lower()]
            if hits:
                info[f"{rc}_hits"] = hits[:10]
    return info


def probe_tests(project: Path) -> dict:
    tests_dir = project / "tests"
    if not tests_dir.is_dir():
        return {"present": False}
    files = sorted(tests_dir.glob("test_*.py"))
    result = {"present": True, "files": len(files)}
    ok, out, _ = run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
                      "--continue-on-collection-errors"], timeout=420, cwd=str(project))
    if ok or out:
        tail = [line for line in out.splitlines() if line.strip()][-6:]
        result["pytest_summary"] = tail
    else:
        result["pytest_summary"] = ["pytest unavailable (pip install pytest)"]
    result["conftest"] = (project / "conftest.py").exists() or (tests_dir / "conftest.py").exists()
    result["pyproject"] = (project / "pyproject.toml").exists()
    return result


def probe_dashboard(ports: list) -> dict:
    """Check whether anything HTTP-ish is answering on local listening ports."""
    out = {}
    for row in ports[:12]:
        port = row["port"]
        if port not in {80, 443, 3000, 4000, 5000, 7000, 8000, 8008, 8080, 8081, 8082, 8888, 9000, 11434}:
            continue
        start = time.time()
        try:
            data = http_get(f"http://127.0.0.1:{port}/", timeout=2.5)
            out[str(port)] = {"ok": True, "ms": int((time.time() - start) * 1000),
                              "looks": ("html" if "<html" in data.lower() else
                                        "json" if data.strip().startswith(("{", "[")) else "text"),
                              "snippet": re.sub(r"\s+", " ", data)[:90]}
        except Exception as exc:
            out[str(port)] = {"ok": False, "error": type(exc).__name__}
    return out


def http_get(url: str, timeout: float = 3.0) -> str:
    import urllib.request
    request = urllib.request.Request(url, headers={"User-Agent": f"jarvis-audit/{VERSION}"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(4000).decode("utf-8", "replace")


# ---------------------------------------------------------------- report

def discover_projects(explicit: list) -> list:
    found = []
    for raw in explicit:
        found.append(Path(os.path.expanduser(raw)))
    if explicit:
        return found
    for candidate in PROJECT_CANDIDATES:
        path = Path(os.path.expanduser(candidate))
        if path.exists():
            found.append(path)
    here = Path.cwd()
    if here not in found and (here / "core").is_dir():
        found.append(here)
    unique, seen = [], set()
    for path in found:
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            unique.append(path)
    return unique


def build_summary(report: dict) -> str:
    system = report.get("system", {})
    res = report.get("resources", {})
    lines = []
    lines.append(f"# Jarvis audit — {report['generated']}")
    lines.append("")
    lines.append(f"- host: {system.get('android_model') or system.get('machine')} · "
                 f"Android {system.get('android_release', 'n/a')} · {system.get('distro') or system.get('system')}")
    lines.append(f"- python: {system.get('python')} · termux={system.get('termux')} · "
                 f"proot={system.get('proot')} · root={system.get('is_root')} · venv={system.get('in_venv')}")
    mem = res.get("memory_mb", {})
    if isinstance(mem, dict) and mem.get("total"):
        lines.append(f"- memory: {mem.get('total')} MB total, {mem.get('available')} MB free")
    if res.get("disk"):
        disk = res["disk"].get("home") or {}
        if disk:
            lines.append(f"- storage(home): {disk.get('free_gb')} GB free of {disk.get('total_gb')} GB")
    if res.get("battery"):
        lines.append(f"- battery: {res['battery'].get('percentage')}% {res['battery'].get('status', '')}")
    lines.append("")

    projs = report.get("projects", [])
    lines.append("## Projects")
    if not projs:
        lines.append("- none found (pass --project PATH)")
    for proj in projs:
        head = f"### {proj['path']}"
        lines.append(head)
        if not proj.get("exists"):
            lines.append("- **missing**")
            continue
        counts = proj.get("file_counts", {})
        git = proj.get("git", {})
        lines.append(f"- files: {counts.get('total')} total · {counts.get('python')} py · "
                     f"{counts.get('markdown')} md · shell {counts.get('shell')}")
        if git:
            lines.append(f"- git: {git.get('branch')} @ {git.get('head', '')[:60]} · dirty={git.get('dirty_files')}")
        lines.append(f"- entrypoints: {', '.join(proj.get('entrypoints', [])) or 'none detected'}")
        if proj.get("syntax_error_count"):
            lines.append(f"- **syntax errors: {proj['syntax_error_count']}** "
                         f"(first: {proj['syntax_errors'][0]})")
        imports = proj.get("imports", {})
        if imports and "error" not in imports:
            bad = [k for k, v in imports.items() if v != "ok"]
            lines.append(f"- imports: {len(imports) - len(bad)}/{len(imports)} ok"
                         + (f" · failing: {', '.join(bad)}" if bad else ""))
        if imports.get("error"):
            lines.append(f"- imports: probe error ({imports['error'][:80]})")
        tools = proj.get("tools", {})
        if tools.get("ok"):
            lines.append(f"- registered tools: {len(tools.get('names', []))}")
        elif tools.get("error"):
            lines.append(f"- tool registry: **{tools['error'][:110]}**")
        if proj.get("tracked_configs_with_secrets"):
            lines.append(f"- **secrets in tracked config: {', '.join(proj['tracked_configs_with_secrets'])}**")
        tracked = proj.get("tracked")
        if tracked:
            bits = []
            if tracked.get("pyc"):
                bits.append(f"{tracked['pyc']} .pyc tracked")
            if tracked.get("env_or_secret_files"):
                bits.append(f"secret-ish files tracked: {tracked['env_or_secret_files']}")
            if tracked.get("state_files"):
                bits.append(f"state files tracked: {tracked['state_files']}")
            if tracked.get("logs"):
                bits.append(f"logs tracked: {tracked['logs']}")
            if bits:
                lines.append("- hygiene: " + " · ".join(bits))
        if proj.get("task_state"):
            state = proj["task_state"]
            if "by_status" in state:
                lines.append(f"- task queue: {state['tasks']} tasks {state['by_status']}")
        if proj.get("audit_log"):
            lines.append(f"- audit events (last 500 lines): {proj['audit_log']['events']}")
        for config in proj.get("configs", []):
            suspicious = config.get("suspicious_keys") or []
            if suspicious or config.get("tracked_by_git"):
                lines.append(f"- config `{config['file']}`: tracked={config.get('tracked_by_git')} "
                             f"suspicious={suspicious}")
        tests = proj.get("tests")
        if tests and tests.get("present"):
            lines.append(f"- tests: {tests.get('files')} files · {tests.get('pytest_summary')}")
        lines.append("")

    net = report.get("network", {})
    if not net.get("skipped"):
        lines.append("## Reachability")
        for label, row in net.items():
            mark = "ok" if row.get("ok") else f"FAIL ({row.get('error')})"
            lines.append(f"- {label}: {mark}" + (f" · {row['ms']} ms" if row.get("ok") else ""))
        lines.append("")

    ports = report.get("ports", [])
    lines.append("## Listening ports")
    lines.append("- " + (", ".join(f"{p['port']}{(' (' + p['hint'] + ')') if p['hint'] else ''}" for p in ports) or "none"))
    dash = report.get("dashboard", {})
    if dash:
        lines.append("- local HTTP: " + ", ".join(f"{k}:{'up' if v.get('ok') else 'closed'}" for k, v in dash.items()))
    lines.append("")

    services = report.get("services", {})
    lines.append("## Startup / background")
    lines.append(f"- jarvis-start in PATH: {services.get('path_jarvis-start') or services.get('jarvis_start_shim') or 'not found'}")
    lines.append(f"- termux boot scripts: {services.get('termux_boot_scripts') or 'none'}")
    lines.append(f"- cron lines: {services.get('crontab_lines')} · systemd: {services.get('systemd')}")
    rc_hits = {k: v for k, v in services.items() if k.endswith("_hits")}
    if rc_hits:
        lines.append(f"- shell rc references: {json.dumps(rc_hits)[:400]}")
    lines.append("")

    pkgs = report.get("packages", {})
    lines.append("## Python packages")
    key = pkgs.get("key_packages", {})
    lines.append(f"- installed packages: {pkgs.get('count')} · venv={pkgs.get('venv')}")
    missing = [name for name in PY_PACKAGES if name in ("requests", "pytest", "google-genai", "openai", "httpx") and name not in key]
    lines.append(f"- key: {json.dumps(key)[:600]}")
    if missing:
        lines.append(f"- notable missing: {', '.join(missing)}")
    lines.append("")

    models = report.get("models", {})
    lines.append("## Local models")
    gguf = models.get("gguf_files") or []
    lines.append(f"- gguf files: {len(gguf)}")
    for row in gguf[:8]:
        lines.append(f"  - {row['path']} ({row['size_gb']} GB)")
    lines.append(f"- llama.cpp dirs: {models.get('llama_cpp_dirs') or 'none'}")
    lines.append("")

    env = report.get("env", {})
    lines.append("## Environment keys (presence only)")
    lines.append("- " + ", ".join(f"{k}={v}" for k, v in env.items() if v != "unset")[:900])
    lines.append("")
    lines.append("---")
    lines.append("Generated by tools/jarvis_audit.py — read-only, secrets redacted.")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Jarvis/Nova audit")
    parser.add_argument("--project", action="append", default=[], help="project directory (repeatable)")
    parser.add_argument("--out", default="", help="output directory (default: ./jarvis-audit)")
    parser.add_argument("--no-net", action="store_true", help="skip connectivity probes")
    parser.add_argument("--no-tests", action="store_true", help="skip the pytest run")
    parser.add_argument("--json-only", action="store_true", help="skip the markdown summary")
    args = parser.parse_args()

    started = time.time()
    report = {
        "generated": now(),
        "auditor_version": VERSION,
        "argv": sys.argv,
        "system": safe(probe_system, {}),
        "resources": safe(probe_resources, {}),
        "packages": safe(probe_packages, {}),
        "binaries": safe(probe_binaries, {}),
        "models": safe(probe_models, {}),
        "network": safe(probe_network, {}, args.no_net),
        "env": safe(probe_env_keys, {}),
        "ports": safe(probe_ports, []),
        "processes": safe(probe_processes, []),
        "services": safe(probe_services, {}),
    }

    projects = discover_projects(args.project)
    report["projects"] = []
    for path in projects:
        entry = safe(probe_project, {"path": str(path), "exists": False}, path)
        if entry.get("exists") and not args.no_tests:
            entry["tests"] = safe(probe_tests, {"present": False}, path)
        report["projects"].append(entry)

    report["dashboard"] = safe(probe_dashboard, {}, report.get("ports", []))

    out_dir = Path(os.path.expanduser(args.out or "jarvis-audit"))
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        print(f"cannot create {out_dir}: {exc}", file=sys.stderr)
        out_dir = Path("/tmp")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = out_dir / f"jarvis-audit-{stamp}.json"
    md_path = out_dir / f"jarvis-audit-{stamp}.md"
    try:
        json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        print(f"cannot write json: {exc}", file=sys.stderr)

    summary = build_summary(report)
    if not args.json_only:
        try:
            md_path.write_text(summary, encoding="utf-8")
        except Exception as exc:
            print(f"cannot write markdown: {exc}", file=sys.stderr)

    print(summary)
    print()
    print(f"JSON : {json_path}")
    if not args.json_only:
        print(f"MD   : {md_path}")
    print(f"took : {time.time() - started:.1f}s")
    print()
    print("Share only the MARKDOWN file. It contains key names and yes/no flags, never secret values.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
