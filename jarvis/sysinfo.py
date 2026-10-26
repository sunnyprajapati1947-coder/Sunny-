"""Cross-platform system metrics with no mandatory third-party dependency."""
from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

SYSTEM = platform.system().lower()  # linux | darwin | windows

try:  # optional, used when available
    import psutil  # type: ignore
except Exception:  # pragma: no cover - optional
    psutil = None

_METRICS_LOCK = threading.RLock()
_CACHE: dict = {"ts": 0.0, "value": None}
_CPU_CACHE: dict = {"ts": 0.0, "value": 0.0}
_NET_CACHE: dict = {"ts": 0.0, "value": None}


def _read_proc_stat() -> tuple[int, int] | None:
    try:
        with open("/proc/stat", "r", encoding="utf-8") as handle:
            parts = handle.readline().split()[1:]
        values = [int(part) for part in parts]
        if len(values) < 4:
            return None
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        return sum(values), idle
    except (OSError, ValueError):
        return None


def cpu_percent(interval: float = 0.15) -> float:
    with _CPU_CACHE_LOCK:
        if time.time() - _CPU_CACHE["ts"] < 1.2:
            return _CPU_CACHE["value"]

    value = None
    if psutil is not None:
        try:
            value = float(psutil.cpu_percent(interval=interval))
        except Exception:
            value = None

    if value is None and SYSTEM == "linux":
        first = _read_proc_stat()
        if first:
            time.sleep(max(0.05, interval))
            second = _read_proc_stat()
            if second:
                total = second[0] - first[0]
                idle = second[1] - first[1]
                if total > 0:
                    value = 100.0 * (1.0 - idle / total)

    if value is None:
        try:
            load = os.getloadavg()[0]
            cores = os.cpu_count() or 1
            value = min(100.0, 100.0 * load / cores)
        except (AttributeError, OSError):
            value = 0.0

    value = max(0.0, min(100.0, round(float(value), 1)))
    with _CPU_CACHE_LOCK:
        _CPU_CACHE.update({"ts": time.time(), "value": value})
    return value


_CPU_CACHE_LOCK = threading.RLock()


def memory() -> dict:
    if psutil is not None:
        try:
            vm = psutil.virtual_memory()
            return {
                "percent": round(float(vm.percent), 1),
                "used": int(vm.used),
                "total": int(vm.total),
                "available": int(vm.available),
            }
        except Exception:
            pass

    if SYSTEM == "linux":
        try:
            info = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as handle:
                for line in handle:
                    key, _, rest = line.partition(":")
                    info[key.strip()] = int(rest.strip().split()[0]) * 1024
            total = info.get("MemTotal", 0)
            available = info.get("MemAvailable", info.get("MemFree", 0))
            used = max(0, total - available)
            percent = round(100.0 * used / total, 1) if total else 0.0
            return {"percent": percent, "used": used, "total": total, "available": available}
        except (OSError, ValueError):
            pass

    if SYSTEM == "darwin":
        try:
            total = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).decode().strip())
            vm_stat = subprocess.check_output(["vm_stat"]).decode()
            page_size = 4096
            free = 0
            for line in vm_stat.splitlines():
                if "page size of" in line:
                    page_size = int(line.split("page size of")[1].split()[0])
                if line.startswith("Pages free:") or line.startswith("Pages inactive:"):
                    free += int(line.split(":")[1].strip().rstrip(".")) * page_size
            used = max(0, total - free)
            return {
                "percent": round(100.0 * used / total, 1) if total else 0.0,
                "used": used,
                "total": total,
                "available": free,
            }
        except Exception:
            pass

    return {"percent": 0.0, "used": 0, "total": 0, "available": 0}


def disk(path: str | Path | None = None) -> dict:
    target = Path(path or Path.home())
    try:
        usage = shutil.disk_usage(str(target))
        percent = round(100.0 * usage.used / usage.total, 1) if usage.total else 0.0
        return {
            "percent": percent,
            "used": int(usage.used),
            "total": int(usage.total),
            "free": int(usage.free),
        }
    except OSError:
        return {"percent": 0.0, "used": 0, "total": 0, "free": 0}


def _sysfs_battery() -> dict | None:
    base = Path("/sys/class/power_supply")
    if not base.exists():
        return None
    for entry in sorted(base.glob("BAT*")):
        try:
            capacity = int((entry / "capacity").read_text().strip())
        except (OSError, ValueError):
            continue
        status = ""
        try:
            status = (entry / "status").read_text().strip().lower()
        except OSError:
            pass
        return {
            "present": True,
            "percent": capacity,
            "plugged": status in {"charging", "full"},
            "status": status or "unknown",
        }
    return None


def _termux_battery() -> dict | None:
    if not shutil.which("termux-battery-status"):
        return None
    try:
        raw = subprocess.check_output(["termux-battery-status"], timeout=3).decode()
        data = json.loads(raw)
        percent = int(float(data.get("percentage", 0)))
        state = str(data.get("status", "")).upper()
        return {
            "present": True,
            "percent": percent,
            "plugged": state in {"CHARGING", "FULL"},
            "status": state.lower() or "unknown",
        }
    except Exception:
        return None


def battery() -> dict:
    if psutil is not None:
        try:
            bat = psutil.sensors_battery()
            if bat is not None:
                return {
                    "present": True,
                    "percent": int(round(bat.percent)),
                    "plugged": bool(bat.power_plugged),
                    "status": "charging" if bat.power_plugged else "discharging",
                }
        except Exception:
            pass

    termux = _termux_battery()
    if termux:
        return termux

    sysfs = _sysfs_battery()
    if sysfs:
        return sysfs

    return {"present": False, "percent": None, "plugged": None, "status": "unavailable"}


def uptime_seconds() -> int | None:
    try:
        if psutil is not None:
            return int(time.time() - psutil.boot_time())
    except Exception:
        pass
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as handle:
            return int(float(handle.read().split()[0]))
    except (OSError, ValueError):
        return None


def primary_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(0.25)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        sock.close()


def network_probe(timeout: float = 0.6) -> dict:
    start = time.perf_counter()
    try:
        sock = socket.create_connection(("1.1.1.1", 53), timeout=timeout)
        sock.close()
        latency = round((time.perf_counter() - start) * 1000, 1)
        return {"online": True, "latency_ms": latency}
    except OSError:
        return {"online": False, "latency_ms": None}


def network_cached(ttl: float = 10.0) -> dict:
    with _METRICS_LOCK:
        if _NET_CACHE["value"] and time.time() - _NET_CACHE["ts"] < ttl:
            return dict(_NET_CACHE["value"])
    value = network_probe()
    with _METRICS_LOCK:
        _NET_CACHE.update({"ts": time.time(), "value": value})
    return dict(value)


def _static() -> dict:
    return {
        "host": socket.gethostname(),
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "system": SYSTEM,
        "cores": os.cpu_count() or 1,
        "ip": primary_ip(),
        "boot": psutil.boot_time() if psutil is not None else None,
    }


def metrics(force: bool = False) -> dict:
    with _METRICS_LOCK:
        if not force and _CACHE["value"] and time.time() - _CACHE["ts"] < 2.0:
            return _CACHE["value"]

        mem = memory()
        ds = disk()
        bat = battery()
        up = uptime_seconds()
        net = network_cached()
        current = {
            "ts": datetime.now().isoformat(timespec="seconds"),
            "cpu": cpu_percent(),
            "memory": {
                "percent": mem["percent"],
                "used": mem["used"],
                "total": mem["total"],
            },
            "disk": {
                "percent": ds["percent"],
                "used": ds["used"],
                "total": ds["total"],
                "free": ds["free"],
            },
            "battery": bat,
            "uptime": up,
            "network": net,
            **_static(),
        }
        _CACHE.update({"ts": time.time(), "value": current})
        return current


def invalidate() -> None:
    with _METRICS_LOCK:
        _CACHE["ts"] = 0.0
        _CACHE["value"] = None
        _NET_CACHE["ts"] = 0.0
        _NET_CACHE["value"] = None
    with _CPU_CACHE_LOCK:
        _CPU_CACHE["ts"] = 0.0
