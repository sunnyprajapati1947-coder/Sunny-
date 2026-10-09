"""Background loop: resumes unfinished tasks after restart and keeps a heartbeat file.

Runs non-interactively, so any action that needs approval is denied (unless the user enabled it
for code execution in config). Stop with SIGTERM/Ctrl-C; state is checkpointed per step."""

from __future__ import annotations

import json
import os
import signal
import time
from pathlib import Path

from nova.context import Context
from nova.util import append_log, now_iso

_stop = False


def _handle_stop(signum, frame):  # pragma: no cover - signal path
    global _stop
    _stop = True


def write_pid(run_dir: Path) -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    pid_file = run_dir / "daemon.pid"
    pid_file.write_text(str(os.getpid()))
    return pid_file


def heartbeat(run_dir: Path, status: dict) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "heartbeat.json").write_text(json.dumps({"time": now_iso(), "pid": os.getpid(), **status}, indent=2))


def run_daemon(ctx: Context, runner, interval: float, once: bool = False, max_loops: int | None = None) -> int:
    global _stop
    _stop = False
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    pid_file = write_pid(ctx.config.run_dir)
    loops = 0
    try:
        while not _stop:
            try:
                resumed = runner.resume_all()
                states = {t["id"]: t["status"] for t in resumed}
            except Exception as exc:  # keep the daemon alive; record the problem
                states = {"error": f"{type(exc).__name__}: {exc}"}
                append_log(ctx.config.log_dir / "daemon.log", f"loop error: {states['error']}")
            heartbeat(ctx.config.run_dir, {"loop": loops, "tasks": states})
            loops += 1
            if once or (max_loops is not None and loops >= max_loops):
                break
            deadline = time.time() + max(1.0, interval)
            while time.time() < deadline and not _stop:
                time.sleep(0.5)
    finally:
        try:
            pid_file.unlink()
        except OSError:
            pass
        heartbeat(ctx.config.run_dir, {"stopped": True})
    return 0
