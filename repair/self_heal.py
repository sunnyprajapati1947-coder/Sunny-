"""Bounded Nova self-healing supervisor for Termux/local-first runtime."""
from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(os.getenv("NOVA_ROOT", str(Path.home() / "Nova"))).expanduser()
STATE = ROOT / "workspace" / "self_heal.json"
PID_FILE = ROOT / "workspace" / "qwen-self-heal.pid"
LOG = ROOT / "workspace" / "logs" / "self_heal.log"
QWEN_URL = os.getenv("NOVA_QWEN_URL", "http://127.0.0.1:8080/v1/chat/completions")
MAX_RESTARTS = max(0, int(os.getenv("NOVA_SELF_HEAL_MAX_RESTARTS", "3")))


def _write(event: dict) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"ts": int(time.time()), **event}, ensure_ascii=False) + "\n")


def _state() -> dict:
    if not STATE.is_file():
        return {"restart_count": 0, "last_restart": 0}
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {"restart_count": 0, "last_restart": 0}


def _save(data: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def qwen_healthy(timeout: float = 2.0) -> bool:
    try:
        with urlopen(QWEN_URL.rsplit("/chat/completions", 1)[0] + "/models", timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def _find_server() -> str | None:
    configured = os.getenv("NOVA_LLAMA_SERVER")
    if configured and Path(configured).is_file():
        return configured
    for candidate in (
        Path.home() / "llama.cpp" / "build-fast" / "bin" / "llama-server",
        Path.home() / "llama.cpp" / "build" / "bin" / "llama-server",
    ):
        if candidate.is_file():
            return str(candidate)
    return shutil.which("llama-server")


def _read_managed_pid() -> int | None:
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    if pid <= 0:
        return None
    return pid


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _stop_managed_server() -> None:
    pid = _read_managed_pid()
    if pid is None:
        return
    if not _pid_alive(pid):
        PID_FILE.unlink(missing_ok=True)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        PID_FILE.unlink(missing_ok=True)
        return
    for _ in range(20):
        if not _pid_alive(pid):
            PID_FILE.unlink(missing_ok=True)
            return
        time.sleep(0.1)
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass
    PID_FILE.unlink(missing_ok=True)


def restart_qwen() -> bool:
    server = _find_server()
    configured_model = os.getenv("NOVA_QWEN_MODEL_PATH", str(Path.home() / "models" / "Qwen3.5-4B-Q4_0.gguf"))
    model_candidates = [
        Path(configured_model).expanduser(),
        Path.home() / "models" / "qwen3.5-4b-instruct-Q4_K_M.gguf",
        Path.home() / "models" / "Qwen3.5-4B-Q4_0.gguf",
    ]
    model = next((str(p) for p in model_candidates if p.is_file()), None)
    if not server or not model:
        _write({"event": "restart_skipped", "reason": "llama-server or model missing"})
        return False

    # Only stop the llama-server instance previously started and owned by Nova.
    # If no managed PID exists, leave unrelated llama-server processes untouched.
    _stop_managed_server()

    log_path = ROOT / "workspace" / "logs" / "qwen-self-heal.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("ab") as log:
        process = subprocess.Popen(
            [server, "-m", model, "--host", "127.0.0.1", "--port", "8080",
             "-c", os.getenv("NOVA_QWEN_CONTEXT", "2048"),
             "-t", os.getenv("NOVA_QWEN_THREADS", "6"),
             "--parallel", "1"],
            stdout=log, stderr=log, start_new_session=True,
        )
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(process.pid), encoding="utf-8")
    _write({"event": "server_started", "pid": process.pid})
    for _ in range(20):
        time.sleep(1)
        if qwen_healthy():
            return True
    return False


def self_heal_once() -> dict:
    state = _state()
    now = int(time.time())
    # Reset the bounded restart budget after one hour of stability.
    if now - int(state.get("last_restart", 0)) > 3600:
        state["restart_count"] = 0

    if qwen_healthy():
        state["restart_count"] = 0
        _save(state)
        _write({"event": "healthy"})
        return {"success": True, "status": "healthy", "restarted": False}

    if int(state.get("restart_count", 0)) >= MAX_RESTARTS:
        _save(state)
        _write({"event": "restart_budget_exhausted"})
        return {"success": False, "status": "degraded", "restarted": False,
                "reason": "restart budget exhausted"}

    state["restart_count"] = int(state.get("restart_count", 0)) + 1
    state["last_restart"] = now
    _save(state)
    ok = restart_qwen()
    _write({"event": "restart", "ok": ok, "count": state["restart_count"]})
    return {"success": ok, "status": "recovered" if ok else "degraded", "restarted": True}


if __name__ == "__main__":
    print(json.dumps(self_heal_once(), ensure_ascii=False))
