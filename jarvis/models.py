"""Local brain management: download a GGUF, run llama.cpp, switch JARVIS over.

Why this exists
    A 4B model makes JARVIS work with no API key and no internet. Qwen3.5-4B
    Q4_K_M (the latest Qwen generation) is ~2.74 GB on disk (default here) and
    needs ~4.5 GB of RAM while running, comfortably inside the 10 GB budget.

What it does
    list       known models with sizes, RAM needs and install state
    download   resumable HTTPS download from Hugging Face into <home>/models,
               hard-capped by config `models.max_gb` (default 10)
    start      launches llama-server (OpenAI-compatible) with phone-safe flags
    use        points JARVIS at that lane (config + provider mode "local")
    stop/status/logs

Nothing is downloaded automatically: the user runs one command (or taps the
button) once, because a 2.5 GB file on mobile data is the user's decision.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = "JARVIS/1.0 (+local model manager)"
CHUNK = 256 * 1024
DEFAULT_MAX_GB = 10.0


class ModelError(RuntimeError):
    pass


CATALOG = {
    "qwen3.5-4b-q4": {
        "label": "Qwen3.5 4B \u00b7 Q4_K_M",
        "repo": "unsloth/Qwen3.5-4B-GGUF",
        "file": "Qwen3.5-4B-Q4_K_M.gguf",
        "size": 2_740_937_888,
        "size_text": "2.74 GB",
        "ram_gb": 4.5,
        "quant": "Q4_K_M",
        "context": 32768,
        "license": "Apache-2.0",
        "recommended": True,
        "note": "Default brain. Latest Qwen family (Qwen3.5), good tool use.",
    },
    "qwen3.5-4b-light": {
        "label": "Qwen3.5 4B \u00b7 UD-IQ2_XXS (light)",
        "repo": "unsloth/Qwen3.5-4B-GGUF",
        "file": "Qwen3.5-4B-UD-IQ2_XXS.gguf",
        "size": 1_520_217_248,
        "size_text": "1.52 GB",
        "ram_gb": 2.5,
        "quant": "UD-IQ2_XXS",
        "context": 32768,
        "license": "Apache-2.0",
        "recommended": False,
        "note": "Lowest RAM. Weaker reasoning, best for small phones.",
    },
    "qwen3.5-4b-q8": {
        "label": "Qwen3.5 4B \u00b7 Q8_0 (max quality)",
        "repo": "unsloth/Qwen3.5-4B-GGUF",
        "file": "Qwen3.5-4B-Q8_0.gguf",
        "size": 4_482_403_488,
        "size_text": "4.48 GB",
        "ram_gb": 6.5,
        "quant": "Q8_0",
        "context": 32768,
        "license": "Apache-2.0",
        "recommended": False,
        "note": "Best answers, needs an 8 GB+ phone.",
    },
}

HF_TEMPLATE = "https://huggingface.co/{repo}/resolve/main/{file}?download=true"


def _gb(value: float) -> str:
    return f"{value / 2**30:.2f} GB"


def _human_size(value: float) -> str:
    """Decimal units, the way model cards and phone storage report sizes."""
    value = float(value or 0)
    if value < 1000:
        return f"{int(value)} B"
    for unit in ("KB", "MB", "GB", "TB"):
        value /= 1000.0
        if value < 1000 or unit == "TB":
            return f"{value:.1f} {unit}"
    return f"{value:.1f} TB"


def find_llama_server() -> str:
    """Locate llama-server without assuming a desktop install."""
    candidates = [
        os.environ.get("JARVIS_LLAMA_SERVER", ""),
        os.environ.get("NOVA_LLAMA_SERVER", ""),
        shutil.which("llama-server") or "",
        str(Path.home() / "llama.cpp" / "build-fast" / "bin" / "llama-server"),
        str(Path.home() / "llama.cpp" / "build" / "bin" / "llama-server"),
        "/usr/local/bin/llama-server",
        "/data/data/com.termux/files/usr/bin/llama-server",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    return ""


def port_free(host: str, port: int) -> bool:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
            return True
        except OSError:
            return False


def health(port: int, timeout: float = 1.5) -> dict:
    """GET /v1/models on a llama.cpp lane; returns {} when down."""
    url = f"http://127.0.0.1:{port}/v1/models"
    try:
        request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8", "replace") or "{}")
    except Exception:
        return {}


class Downloader:
    """Resumable, size-capped HTTPS download used by the CLI and the API."""

    def __init__(self, max_bytes: int):
        self.max_bytes = int(max_bytes)

    def fetch(self, url: str, target: Path, expected: int = 0, progress=None) -> dict:
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(target.suffix + ".part")
        already = part.stat().st_size if part.exists() else 0
        headers = {"user-agent": USER_AGENT, "accept": "*/*"}
        if already:
            headers["range"] = f"bytes={already}-"
        request = urllib.request.Request(url, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=60)
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and part.exists():     # already complete
                part.replace(target)
                return {"ok": True, "path": str(target), "bytes": part.stat().st_size, "resumed": True}
            raise ModelError(f"download failed: HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ModelError(f"download failed: {type(exc).__name__}: {exc}") from None

        with response:
            status = getattr(response, "status", 200)
            length = int(response.headers.get("content-length") or 0)
            total = expected or (already + length if length else 0)
            if total and total > self.max_bytes:
                raise ModelError(
                    f"model is {_human_size(total)} which is over the "
                    f"{_human_size(self.max_bytes)} limit (config models.max_gb)")
            mode = "ab" if already and status == 206 else "wb"
            if mode == "wb":
                already = 0
            written = already
            started = time.time()
            with part.open(mode) as handle:
                while True:
                    chunk = response.read(CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > self.max_bytes:
                        handle.close()
                        part.unlink(missing_ok=True)
                        raise ModelError("download exceeded the size limit and was discarded")
                    handle.write(chunk)
                    if progress:
                        elapsed = max(0.001, time.time() - started)
                        speed = (written - already) / elapsed
                        progress({"bytes": written, "total": total,
                                  "percent": int(100 * written / total) if total else 0,
                                  "speed": speed})
        if expected and part.stat().st_size < expected * 0.98:
            raise ModelError(
                f"incomplete download ({_human_size(part.stat().st_size)} of {_human_size(expected)}); "
                "run the same command again to resume")
        if target.exists():        # never silently destroy a previous file
            target.replace(target.with_suffix(target.suffix + ".bak"))
        part.replace(target)
        return {"ok": True, "path": str(target), "bytes": target.stat().st_size,
                "resumed": bool(already), "seconds": round(time.time() - started, 1)}


class ModelManager:
    def __init__(self, settings):
        self.settings = settings
        self.home = Path(settings.home)
        self.models_dir = self.home / "models"
        self.pid_path = self.home / "llama.pid"
        self._proc = None
        self.log_path = self.home / "logs" / "llama-server.log"

    # ------------------------------------------------------------- helpers

    def max_bytes(self) -> int:
        limit = float(getattr(self.settings, "models_max_gb", DEFAULT_MAX_GB) or DEFAULT_MAX_GB)
        return int(min(max(limit, 0.5), 64) * 2**30)

    def path_of(self, model_id: str) -> Path:
        entry = CATALOG.get(model_id)
        if not entry:
            raise ModelError(f"unknown model: {model_id}")
        return self.models_dir / entry["file"]

    def url_of(self, model_id: str) -> str:
        entry = CATALOG[model_id]
        return HF_TEMPLATE.format(repo=entry["repo"], file=entry["file"])

    def installed(self, model_id: str) -> dict:
        entry = CATALOG.get(model_id, {})
        path = self.models_dir / entry.get("file", "_")
        size = path.stat().st_size if path.exists() else 0
        return {
            "installed": bool(size), "path": str(path), "bytes": size,
            "partial": path.with_suffix(path.suffix + ".part").exists(),
            "percent": (100 if size else 0) if not entry.get("size") else int(100 * size / entry["size"]),
        }

    def catalog(self) -> list[dict]:
        rows = []
        for model_id, entry in CATALOG.items():
            state = self.installed(model_id)
            rows.append({
                "id": model_id, "label": entry["label"], "repo": entry["repo"],
                "file": entry["file"], "size": entry["size"],
                "size_text": entry.get("size_text") or _human_size(entry["size"]),
                "ram_gb": entry["ram_gb"], "quant": entry["quant"], "context": entry["context"],
                "license": entry["license"], "recommended": entry["recommended"],
                "note": entry["note"], "url": self.url_of(model_id), **state,
            })
        return rows

    def running(self) -> dict:
        pid = 0
        if self.pid_path.exists():
            try:
                pid = int(self.pid_path.read_text().strip() or 0)
            except ValueError:
                pid = 0
        alive = bool(pid)
        if pid:
            try:
                os.kill(pid, 0)
            except OSError:
                alive = False
        port = self.port()
        models = {} if port_free("127.0.0.1", port) else health(port)
        return {"pid": pid if alive else 0, "alive": alive, "port": port,
                "url": f"http://127.0.0.1:{port}/v1",
                "served": [row.get("id") for row in (models.get("data") or [])],
                "healthy": bool(models)}

    def port(self) -> int:
        match = re.search(r":(\d+)", str(self.settings.fast_url or ""))
        return int(match.group(1)) if match else 8081

    def binary(self) -> str:
        return find_llama_server()

    def status(self) -> dict:
        disk = shutil.disk_usage(str(self.home if self.home.exists() else Path.home()))
        return {
            "catalog": self.catalog(),
            "running": self.running(),
            "llama_server": self.binary(),
            "models_dir": str(self.models_dir),
            "max_bytes": self.max_bytes(),
            "max_gb": round(self.max_bytes() / 2**30, 1),
            "disk_free_gb": round(disk.free / 2**30, 2),
            "active_model": self.settings.fast_model,
            "fast_url": self.settings.fast_url,
            "provider_mode": self.settings.provider_mode,
        }

    # ------------------------------------------------------------ download

    def download(self, model_id: str, url: str = "", progress=None) -> dict:
        if model_id not in CATALOG and not url:
            raise ModelError(f"unknown model: {model_id} (use --url for a custom GGUF)")
        entry = CATALOG.get(model_id, {"file": Path(urllib.parse.urlparse(url).path).name or "custom.gguf",
                                       "size": 0, "label": model_id, "size_text": "custom"})
        target = self.models_dir / entry["file"]
        expected = int(entry.get("size") or 0)
        if target.exists():
            size = target.stat().st_size
            if not expected or size >= expected * 0.98:
                return {"ok": True, "already": True, "path": str(target), "bytes": size}
        self.models_dir.mkdir(parents=True, exist_ok=True)
        result = Downloader(self.max_bytes()).fetch(url or self.url_of(model_id), target,
                                                    expected=expected, progress=progress)
        result["model"] = model_id
        return result

    # --------------------------------------------------------------- run

    def start(self, model_id: str = "", port: int = 0, context: int = 0,
              threads: int = 0, jinja: bool = True) -> dict:
        binary = self.binary()
        if not binary:
            raise ModelError(
                "llama-server not found. Build it (pkg install clang cmake git && "
                "git clone https://github.com/ggml-org/llama.cpp && cmake -B build && "
                "cmake --build build -j4) or set JARVIS_LLAMA_SERVER=/path/to/llama-server")
        model_id = model_id or self._guess_model()
        path = self.path_of(model_id)
        if not path.exists():
            raise ModelError(f"{model_id} is not downloaded yet: run `model download {model_id}`")
        if self.running()["alive"]:
            return {"ok": True, "already": True, **self.running()}

        model_entry = CATALOG.get(model_id, {})
        port = int(port or self.port())
        if not port_free("127.0.0.1", port):
            raise ModelError(f"port {port} is busy; pass another --port")
        configured_context = int(getattr(self.settings, "models_context", 0) or 0)
        context = int(context or configured_context
                      or min(4096, int(model_entry.get("context") or 4096)))
        configured_threads = int(getattr(self.settings, "models_threads", 0) or 0)
        threads = int(threads or configured_threads or max(1, (os.cpu_count() or 4) - 1))
        args = [
            binary, "--model", str(path), "--host", "127.0.0.1", "--port", str(port),
            "--ctx-size", str(context), "--threads", str(threads),
            "--n-gpu-layers", "0", "--no-warmup",
            "--alias", model_id,
        ]
        if jinja:
            args.append("--jinja")
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        log = self.log_path.open("ab")
        log.write(f"\n=== {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(args)}\n".encode())
        log.flush()
        process = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        log.close()
        self._proc = process
        self.pid_path.write_text(str(process.pid))
        started = time.time()
        while time.time() - started < 120:
            if health(port):
                self._activate(model_id, port)
                return {"ok": True, "pid": process.pid, "port": port,
                        "url": f"http://127.0.0.1:{port}/v1", "seconds": round(time.time() - started, 1),
                        "model": model_id, "context": context, "threads": threads}
            if process.poll() is not None:
                tail = self.tail_log(20)
                raise ModelError(f"llama-server exited early (code {process.returncode}).\n{tail}")
            time.sleep(0.5)
        raise ModelError(f"llama-server did not answer on port {port} within 120s; see {self.log_path}")

    def _guess_model(self) -> str:
        for model_id in CATALOG:
            if self.installed(model_id)["installed"]:
                return model_id
        raise ModelError("no model downloaded yet: run `model download qwen3.5-4b-q4`")

    def _activate(self, model_id: str, port: int) -> None:
        from . import config as config_module
        try:
            config_module.save_settings(self.settings, {
                "local": {"fast_url": f"http://127.0.0.1:{port}/v1", "fast_model": model_id},
                "provider": {"mode": "local"},
            })
            reloaded = config_module.load(self.settings.home)
            self.settings.fast_url = reloaded.fast_url
            self.settings.fast_model = reloaded.fast_model
            self.settings.provider_mode = reloaded.provider_mode
        except Exception:
            pass

    def stop(self) -> dict:
        pid = 0
        if self.pid_path.exists():
            try:
                pid = int(self.pid_path.read_text().strip() or 0)
            except ValueError:
                pid = 0
        if not pid:
            return {"ok": True, "stopped": False, "reason": "no pidfile"}
        if not self._is_llama_pid(pid):
            self.pid_path.unlink(missing_ok=True)
            return {"ok": True, "stopped": False,
                    "reason": "stale pidfile removed (pid is not llama-server)"}
        try:
            os.kill(pid, 15)
            for _ in range(40):
                os.kill(pid, 0)
                time.sleep(0.1)
            os.kill(pid, 9)
        except OSError:
            pass
        if self._proc is not None and self._proc.pid == pid:
            try:
                self._proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                pass
            self._proc = None
        else:
            for _ in range(20):       # reap a child we started in an earlier run
                try:
                    if os.waitpid(pid, os.WNOHANG)[0]:
                        break
                except OSError:
                    break
                time.sleep(0.05)
        self.pid_path.unlink(missing_ok=True)
        return {"ok": True, "stopped": True, "pid": pid}

    def _is_llama_pid(self, pid: int) -> bool:
        """Only ever signal a process we can prove is llama-server."""
        cmdline = Path(f"/proc/{pid}/cmdline")
        if cmdline.exists():
            try:
                return "llama" in cmdline.read_bytes().decode("utf-8", "replace").lower()
            except OSError:
                return False
        try:                        # no /proc (macOS): fall back to ps
            output = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                                    capture_output=True, text=True, timeout=5).stdout
        except (OSError, subprocess.SubprocessError):
            return False
        return "llama" in output.lower()

    def tail_log(self, lines: int = 40) -> str:
        if not self.log_path.exists():
            return ""
        try:
            content = self.log_path.read_text(errors="replace").splitlines()
            return "\n".join(content[-lines:])
        except OSError:
            return ""


def cli(settings, args) -> int:
    """`python3 run_jarvis.py model …`"""
    manager = ModelManager(settings)
    action = args.action or "status"

    if action in ("list", "status"):
        status = manager.status()
        print(f"models dir : {status['models_dir']}")
        print(f"size cap   : {status['max_gb']} GB   (config models.max_gb)")
        print(f"disk free  : {status['disk_free_gb']} GB")
        print(f"llama-server: {status['llama_server'] or 'NOT FOUND'}")
        running = status["running"]
        print(f"server     : {'pid ' + str(running['pid']) if running['alive'] else 'stopped'}"
              f"{' · healthy' if running['healthy'] else ''} · {running['url']}")
        print()
        for row in status["catalog"]:
            mark = "installed" if row["installed"] else ("partial" if row["partial"] else "-")
            flag = " ← recommended" if row["recommended"] else ""
            print(f"{row['id']:<24} {row['size_text']:>9}  RAM≈{row['ram_gb']} GB  [{mark}]{flag}")
            print(f"  {row['label']} · {row['quant']} · {row['repo']}")
        print("\nrun: python3 run_jarvis.py model download qwen3.5-4b-q4")
        return 0

    if action == "download":
        model_id = args.model_id or "qwen3.5-4b-q4"
        last = {"percent": -10}

        def progress(state):
            if state["percent"] - last["percent"] >= 2 or state["percent"] >= 100:
                last["percent"] = state["percent"]
                sys.stderr.write(f"\r  {state['percent']:3d}%  {_human_size(state['bytes'])}"
                                 f" / {_human_size(state['total'])}"
                                 f"  ({_human_size(state['speed'])}/s)")
                sys.stderr.flush()

        print(f"downloading {model_id} into {manager.models_dir} …")
        try:
            result = manager.download(model_id, url=args.url or "", progress=progress)
        finally:
            sys.stderr.write("\n")
        print(json.dumps(result, indent=2))
        if result.get("ok"):
            print(f"\nnext: python3 run_jarvis.py model start")
        return 0 if result.get("ok") else 1

    if action == "start":
        result = manager.start(model_id=args.model_id or "", port=args.port or 0,
                               context=args.context or 0, threads=args.threads or 0)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("\nJARVIS is now pointed at this lane (provider mode: local).")
        return 0

    if action == "use":
        model_id = args.model_id or ""
        if model_id not in CATALOG:
            raise ModelError(f"unknown model: {model_id}")
        if not manager.installed(model_id)["installed"]:
            raise ModelError(f"{model_id} is not downloaded yet")
        manager._activate(model_id, manager.port())
        print(f"active model: {model_id} on {manager.settings.fast_url}")
        return 0

    if action == "stop":
        print(json.dumps(manager.stop(), indent=2))
        return 0

    if action == "logs":
        print(manager.tail_log(int(args.lines or 60)))
        return 0

    raise ModelError(f"unknown model action: {action}")
