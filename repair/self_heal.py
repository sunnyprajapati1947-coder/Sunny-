"""Bounded Nova self-healing supervisor for Termux/local-first runtime."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(os.getenv("NOVA_ROOT", str(Path.home() / "Nova"))).expanduser()
STATE = ROOT / "workspace" / "self_heal.json"
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


def restart_qwen() -> bool:
    server = _find_server()
    model = os.getenv("NOVA_QWEN_MODEL_PATH", str(Path.home() / "models" / "Qwen3.5-4B-Q4_0.gguf"))
    if not server or not Path(model).is_file():
        _write({"event": "restart_skipped", "reason": "llama-server or model missing"})
        return False

    # Stop only the configured local llama-server; never kill unrelated processes.
    subprocess.run(["pkill", "-f", "llama-server"], check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log_path = ROOT / "workspace" / "logs" / "qwen-self-heal.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("ab") as log:
        subprocess.Popen(
            [server, "-m", model, "--host", "127.0.0.1", "--port", "8080",
             "-c", os.getenv("NOVA_QWEN_CONTEXT", "2048"),
             "-t", os.getenv("NOVA_QWEN_THREADS", "6"),
             "--parallel", "1"],
            stdout=log, stderr=log, start_new_session=True,
        )
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
