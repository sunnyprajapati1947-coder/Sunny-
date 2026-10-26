"""Local Qwen brain: lane discovery, model catalog, health and chat.

The goal is local-first intelligence in the spirit of OpenJarvis: run the
assistant on your own machine, call the cloud only when it truly helps:

* **fast lane** — a small Qwen for routing, short replies and tool selection
* **deep lane** — a larger Qwen for planning and analysis
* **coder lane** — Qwen-Coder for code review and repo work

Any OpenAI-compatible server works (llama.cpp ``llama-server``, Ollama,
vLLM, LM Studio). Nothing here downloads weights or starts servers on its own;
it detects what is running, tells you exactly how to start what is missing, and
routes work to the healthiest lane. The rest of Jarvis keeps working offline
while a model is being prepared.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
from dataclasses import dataclass, field

from jarvis import net, sysinfo

CATALOG: dict[str, dict] = {
    "qwen3-1.7b": {
        "label": "Qwen3 1.7B",
        "params": "1.7B",
        "ram": "2 GB",
        "context": 32768,
        "roles": ["fast"],
        "quality": 2,
        "ollama": "qwen3:1.7b",
        "gguf": "Qwen3-1.7B-Instruct-Q4_K_M.gguf",
        "note": "Smallest useful lane — instant routing and short answers.",
    },
    "qwen3-4b": {
        "label": "Qwen3 4B",
        "params": "4B",
        "ram": "3.5 GB",
        "context": 32768,
        "roles": ["fast", "general"],
        "quality": 3,
        "ollama": "qwen3:4b",
        "gguf": "Qwen3-4B-Instruct-Q4_K_M.gguf",
        "note": "The default local workhorse when you have ~4 GB of RAM free.",
    },
    "qwen2.5-7b": {
        "label": "Qwen2.5 7B Instruct",
        "params": "7B",
        "ram": "6 GB",
        "context": 32768,
        "roles": ["general", "deep"],
        "quality": 4,
        "ollama": "qwen2.5:7b-instruct",
        "gguf": "qwen2.5-7b-instruct-q4_k_m.gguf",
        "note": "Strong general reasoning; the sweet spot on 8 GB machines.",
    },
    "qwen2.5-coder-7b": {
        "label": "Qwen2.5 Coder 7B",
        "params": "7B",
        "ram": "6 GB",
        "context": 32768,
        "roles": ["coder"],
        "quality": 4,
        "ollama": "qwen2.5-coder:7b",
        "gguf": "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        "note": "Repo maps, reviews and refactors — the coding lane.",
    },
    "qwen3-8b": {
        "label": "Qwen3 8B",
        "params": "8B",
        "ram": "7 GB",
        "context": 40960,
        "roles": ["general", "deep"],
        "quality": 5,
        "ollama": "qwen3:8b",
        "gguf": "Qwen3-8B-Instruct-Q4_K_M.gguf",
        "note": "Newer architecture, sharper reasoning than 2.5-7B.",
    },
    "qwen2.5-14b": {
        "label": "Qwen2.5 14B Instruct",
        "params": "14B",
        "ram": "11 GB",
        "context": 32768,
        "roles": ["deep"],
        "quality": 6,
        "ollama": "qwen2.5:14b-instruct",
        "gguf": "qwen2.5-14b-instruct-q4_k_m.gguf",
        "note": "Deep analysis lane for 16 GB machines.",
    },
    "qwen2.5-coder-14b": {
        "label": "Qwen2.5 Coder 14B",
        "params": "14B",
        "ram": "11 GB",
        "context": 32768,
        "roles": ["coder"],
        "quality": 6,
        "ollama": "qwen2.5-coder:14b",
        "gguf": "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
        "note": "Serious code lane when you can spare the RAM.",
    },
    "qwen3-30b-a3b": {
        "label": "Qwen3 30B-A3B (MoE)",
        "params": "30B total / 3B active",
        "ram": "19 GB",
        "context": 32768,
        "roles": ["deep"],
        "quality": 7,
        "ollama": "qwen3:30b-a3b",
        "gguf": "Qwen3-30B-A3B-Instruct-Q4_K_M.gguf",
        "note": "MoE speed with large-model depth, if you have the memory.",
    },
    "qwen2.5-32b": {
        "label": "Qwen2.5 32B Instruct",
        "params": "32B",
        "ram": "21 GB",
        "context": 32768,
        "roles": ["deep"],
        "quality": 8,
        "ollama": "qwen2.5:32b-instruct",
        "gguf": "qwen2.5-32b-instruct-q4_k_m.gguf",
        "note": "Near-frontier local quality for workstation-class machines.",
    },
    "qwen2.5-vl-7b": {
        "label": "Qwen2.5-VL 7B",
        "params": "7B",
        "ram": "8 GB",
        "context": 32768,
        "roles": ["vision"],
        "quality": 4,
        "ollama": "qwen2.5vl:7b",
        "gguf": "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
        "note": "Local vision lane — screen and image understanding without Gemini.",
    },
}

ROLE_LABELS = {
    "fast": "Fast lane · routing and short replies",
    "general": "General lane · conversation and tools",
    "deep": "Deep lane · planning and analysis",
    "coder": "Coder lane · repositories and code review",
    "vision": "Vision lane · images and screen",
}

DEFAULT_ENDPOINTS = {
    "fast": "http://127.0.0.1:8081",
    "deep": "http://127.0.0.1:8080",
    "coder": "http://127.0.0.1:8080",
}


def _base_url(url: str) -> str:
    value = str(url or "").strip().rstrip("/")
    for suffix in ("/v1/chat/completions", "/chat/completions", "/v1"):
        if value.endswith(suffix):
            value = value[: -len(suffix)]
    return value.rstrip("/")


def _mem_gb() -> float:
    try:
        return round(sysinfo.memory().get("total", 0) / (1024 ** 3), 1)
    except Exception:
        return 0.0


def recommended_models(ram_gb: float | None = None) -> dict:
    ram = _mem_gb() if ram_gb is None else float(ram_gb)
    if ram >= 28:
        picks = ("qwen2.5-32b", "qwen2.5-coder-14b", "qwen3-4b")
    elif ram >= 18:
        picks = ("qwen2.5-14b", "qwen2.5-coder-7b", "qwen3-4b")
    elif ram >= 11:
        picks = ("qwen3-8b", "qwen2.5-coder-7b", "qwen3-1.7b")
    elif ram >= 6:
        picks = ("qwen3-4b", "qwen3-1.7b")
    else:
        picks = ("qwen3-1.7b",)
    return {
        "ram_gb": ram,
        "deep": picks[0],
        "coder": picks[1] if len(picks) > 1 else picks[0],
        "fast": picks[-1],
        "catalog": {key: CATALOG[key] for key in picks},
    }


@dataclass
class LaneStatus:
    name: str
    role: str
    base_url: str
    model: str
    online: bool = False
    latency_ms: int | None = None
    models: list[str] = field(default_factory=list)
    error: str = ""

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "role": self.role,
            "base_url": self.base_url,
            "model": self.model,
            "online": self.online,
            "latency_ms": self.latency_ms,
            "models": self.models[:12],
            "error": self.error,
        }


class LocalBrain:
    """Health-checked router for local OpenAI-compatible Qwen lanes."""

    def __init__(self, settings=None) -> None:
        self._settings = settings
        self._cache: dict = {"ts": 0.0, "value": None}
        self._lock = threading.Lock()
        self.last_error = ""

    # ------------------------------------------------------------- settings
    @property
    def settings(self):
        if self._settings is not None:
            return self._settings
        from jarvis.config import get_settings

        return get_settings()

    def lane_specs(self) -> list[dict]:
        settings = self.settings
        fast_url = _base_url(getattr(settings, "fast_qwen_url", "") or DEFAULT_ENDPOINTS["fast"])
        deep_url = _base_url(getattr(settings, "qwen_url", "") or DEFAULT_ENDPOINTS["deep"])
        coder_url = _base_url(getattr(settings, "coder_qwen_url", "") or deep_url)
        return [
            {
                "name": "fast",
                "role": "fast",
                "base_url": fast_url,
                "model": getattr(settings, "fast_qwen_model", "") or "qwen3:4b",
            },
            {
                "name": "deep",
                "role": "deep",
                "base_url": deep_url,
                "model": getattr(settings, "qwen_model", "") or "qwen2.5:7b-instruct",
            },
            {
                "name": "coder",
                "role": "coder",
                "base_url": coder_url,
                "model": getattr(settings, "coder_qwen_model", "") or getattr(
                    settings, "qwen_model", ""
                ) or "qwen2.5-coder:7b",
            },
        ]

    # -------------------------------------------------------------- probing
    def _probe(self, lane: dict) -> LaneStatus:
        status = LaneStatus(
            name=lane["name"],
            role=lane["role"],
            base_url=lane["base_url"],
            model=lane["model"],
        )
        if not lane["base_url"]:
            status.error = "no endpoint configured"
            return status
        started = time.perf_counter()
        try:
            payload = net.get_json(lane["base_url"] + "/v1/models", timeout=1.1)
        except Exception as exc:
            status.error = f"{type(exc).__name__}: {exc}"[:120]
            return status
        models = []
        if isinstance(payload, dict):
            for item in payload.get("data") or []:
                if isinstance(item, dict) and item.get("id"):
                    models.append(str(item["id"]))
        status.online = True
        status.latency_ms = int((time.perf_counter() - started) * 1000)
        status.models = models
        if models and status.model not in models:
            # The endpoint is alive but serving a different model; trust the server.
            preferred = next((m for m in models if "qwen" in m.lower()), models[0])
            status.model = preferred
        return status

    def status(self, force: bool = False, ttl: float = 12.0) -> dict:
        with self._lock:
            if not force and self._cache["value"] and time.time() - self._cache["ts"] < ttl:
                return self._cache["value"]
            lanes = [self._probe(spec) for spec in self.lane_specs()]
            if not any(lane.online for lane in lanes):
                # Ollama's default port is the most common local runtime.
                for base in ("http://127.0.0.1:11434",):
                    fallback = self._probe(
                        {
                            "name": "ollama",
                            "role": "general",
                            "base_url": base,
                            "model": "qwen3:4b",
                        }
                    )
                    if fallback.online:
                        lanes.append(fallback)
                        break
            runtime = self.runtime()
            recommended = recommended_models()
            online = [lane for lane in lanes if lane.online]
            value = {
                "online": bool(online),
                "lanes": [lane.as_dict() for lane in lanes],
                "runtime": runtime,
                "recommended": recommended,
                "ram_gb": recommended["ram_gb"],
                "mode": "local" if online else "offline",
            }
            self._cache = {"ts": time.time(), "value": value}
            return value

    def runtime(self) -> dict:
        binaries = {}
        for name in ("ollama", "llama-server", "llama-cli", "vllm", "lms"):
            path = shutil.which(name)
            if path:
                binaries[name] = path
        return {
            "binaries": binaries,
            "has_ollama": "ollama" in binaries,
            "has_llama_cpp": "llama-server" in binaries or "llama-cli" in binaries,
            "ram_gb": _mem_gb(),
            "catalog": len(CATALOG),
        }

    def lanes(self) -> list[dict]:
        return self.status().get("lanes", [])

    def available(self) -> bool:
        return bool(self.status().get("online"))

    def pick(self, task: str = "general") -> dict | None:
        """Choose the best online lane for a task type."""
        lanes = [lane for lane in self.lanes() if lane.get("online")]
        if not lanes:
            return None
        prefer = {
            "code": ["coder", "deep", "fast"],
            "plan": ["deep", "coder", "fast"],
            "deep": ["deep", "coder", "fast"],
            "vision": ["vision", "deep", "fast"],
            "fast": ["fast", "general", "deep"],
            "general": ["fast", "general", "deep", "coder"],
            "chat": ["deep", "fast", "coder"],
        }.get(task, ["fast", "deep", "coder"])
        for role in prefer:
            for lane in lanes:
                if lane.get("role") == role:
                    return lane
        return lanes[0]

    # -------------------------------------------------------------- chatting
    def chat(
        self,
        messages: list[dict],
        *,
        task: str = "general",
        temperature: float = 0.45,
        max_tokens: int = 800,
        timeout: float = 60.0,
    ) -> tuple[str | None, str]:
        lane = self.pick(task)
        if lane is None:
            return None, ""
        payload = {
            "model": lane.get("model") or "qwen",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        try:
            data = net.post_json(
                lane["base_url"].rstrip("/") + "/v1/chat/completions",
                payload,
                timeout=timeout,
            )
        except Exception as exc:
            self._cache = {"ts": 0.0, "value": None}
            self.last_error = f"{type(exc).__name__}: {exc}"[:200]
            return None, ""
        choices = (data or {}).get("choices") or []
        if not choices:
            return None, ""
        content = str((choices[0].get("message") or {}).get("content") or "").strip()
        if not content:
            return None, ""
        return content, f"qwen-{lane.get('name') or 'local'}"

    def test(self, lane_name: str = "deep") -> dict:
        spec = next((s for s in self.lane_specs() if s["name"] == lane_name), None)
        if spec is None:
            return {"ok": False, "error": f"Unknown lane “{lane_name}”."}
        status = self._probe(spec)
        if not status.online:
            return {
                "ok": False,
                "lane": lane_name,
                "error": status.error or "lane is not responding",
            }
        started = time.perf_counter()
        text, provider = self.chat(
            [
                {"role": "system", "content": "Reply with exactly: ONLINE"},
                {"role": "user", "content": "ping"},
            ],
            task="general",
            max_tokens=12,
            timeout=45.0,
        )
        return {
            "ok": bool(text),
            "lane": lane_name,
            "model": status.model,
            "models": status.models[:8],
            "latency_ms": int((time.perf_counter() - started) * 1000) if text else None,
            "reply": (text or "")[:120],
            "provider": provider,
            "error": "" if text else "the lane answered the model list but not a chat request",
        }

    # ------------------------------------------------------------- guidance
    def install_guide(self, model_key: str | None = None) -> dict:
        recommended = recommended_models()
        key = model_key or recommended["deep"]
        model = CATALOG.get(key) or CATALOG[recommended["deep"]]
        runtime = self.runtime()
        ram = recommended["ram_gb"]
        steps: list[str] = []
        if runtime["has_ollama"]:
            steps = [
                f"ollama pull {model['ollama']}",
                f"ollama serve  # if it is not already running",
                f"# then point Jarvis at it: JARVIS_QWEN_MODEL={model['ollama']}",
            ]
        else:
            steps = [
                "curl -fsSL https://ollama.com/install.sh | sh",
                f"ollama pull {model['ollama']}",
                "ollama serve",
                f"# Jarvis auto-detects http://127.0.0.1:11434 — or set JARVIS_QWEN_URL",
            ]
        llama_cpp = [
            f"# llama.cpp alternative (no Ollama):",
            f"# 1. download {model['gguf']} from Hugging Face",
            f"# 2. llama-server -m {model['gguf']} -c {model['context']} --port 8080",
            f"# 3. Jarvis auto-detects http://127.0.0.1:8080",
        ]
        return {
            "ok": True,
            "model": key,
            "model_info": model,
            "ram_gb": ram,
            "recommended": recommended,
            "runtime": runtime,
            "steps": steps,
            "llama_cpp": llama_cpp,
            "note": (
                "Jarvis never downloads weights by itself. Install Ollama or llama.cpp, "
                "pull one Qwen model, and the local lanes light up automatically."
            ),
        }

    # ---------------------------------------------------------------- vision
    def vision(
        self,
        image: str,
        question: str = "Describe this image concisely.",
        *,
        timeout: float = 90.0,
    ) -> tuple[str | None, str]:
        """Ask a local Qwen-VL model about an image (Ollama or llama.cpp)."""
        status = self.status()
        if not status.get("online"):
            return None, ""
        settings = self.settings
        base = _base_url(getattr(settings, "qwen_url", "") or DEFAULT_ENDPOINTS["deep"])
        model = "qwen2.5vl:7b"
        for lane in status.get("lanes", []):
            if lane.get("role") in {"deep", "vision"} and lane.get("online"):
                base = lane["base_url"]
                break
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": question},
                        {"type": "image_url", "image_url": {"url": image}},
                    ],
                }
            ],
            "temperature": 0.2,
            "max_tokens": 500,
            "stream": False,
        }
        try:
            data = net.post_json(base.rstrip("/") + "/v1/chat/completions", payload, timeout=timeout)
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"[:200]
            return None, ""
        choices = (data or {}).get("choices") or []
        if not choices:
            return None, ""
        text = str((choices[0].get("message") or {}).get("content") or "").strip()
        if not text:
            return None, ""
        return text, "qwen-vision"

    def context_hint(self) -> str:
        status = self.status()
        if not status.get("online"):
            return (
                "No local Qwen lane is running. Use the deterministic tools; "
                "if you need deeper reasoning, ask the owner to start a local lane."
            )
        lanes = ", ".join(
            f"{lane['name']}={lane['model']}" for lane in status["lanes"] if lane["online"]
        )
        return f"Local Qwen lanes online: {lanes}."


_LOCAL: LocalBrain | None = None
_LOCK = threading.Lock()


def get_local_brain() -> LocalBrain:
    global _LOCAL
    with _LOCK:
        if _LOCAL is None:
            _LOCAL = LocalBrain()
        return _LOCAL
