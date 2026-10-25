"""Permissioned tools.

Every tool declares a risk level:

    low     read-only, no side effects            -> runs immediately
    medium  changes local state                   -> needs an approval token
    high    destructive / irreversible / outbound -> needs approval + explicit confirm

Guards that actually exist here, not just in a prompt:
  * filesystem tools are pinned inside an allowlisted root (and refuse to escape it)
  * python execution is a subprocess with a timeout and a temp cwd
  * git never pushes, never force-anything, never deletes branches
  * web fetch refuses private/loopback hosts unless explicitly allowed
  * every call and every block is written to the audit table
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

LOW, MEDIUM, HIGH = "low", "medium", "high"
RISK_ORDER = {LOW: 0, MEDIUM: 1, HIGH: 2}

GIT_SAFE = {"status", "log", "diff", "show", "branch", "rev-parse", "ls-files", "describe", "tag"}
GIT_BLOCKED_FLAGS = ("--force", "-f", "--hard", "--no-verify", "--bare", "--mirror", "--delete", "-D")

WRITE_SUFFIX_OK = {
    ".md", ".txt", ".json", ".toml", ".yaml", ".yml", ".py", ".js", ".mjs", ".cjs",
    ".ts", ".tsx", ".jsx", ".css", ".html", ".sh", ".env.example", ".csv", ".sql",
    ".ini", ".cfg", ".gitignore", ".log", ".xml", ".svg",
}


class ToolError(RuntimeError):
    pass


class ToolBlocked(ToolError):
    """Raised when a sandbox boundary refuses an action (reported as blocked)."""


@dataclass
class Tool:
    name: str
    description: str
    risk: str
    parameters: dict
    run: Callable[..., dict]
    requires: str = ""          # human note, e.g. "termux-api"
    enabled: bool = True
    tags: list = field(default_factory=list)

    def schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "risk": self.risk,
            "parameters": self.parameters,
            "requires": self.requires,
        }


def redact(value):
    try:
        from security.policy import redact_secrets  # existing Nova helper
        return redact_secrets(value)
    except Exception:
        if isinstance(value, dict):
            return {k: ("<REDACTED>" if re.search(r"key|secret|token|password", str(k), re.I) else redact(v))
                    for k, v in value.items()}
        if isinstance(value, list):
            return [redact(v) for v in value]
        if isinstance(value, str):
            return re.sub(r"(sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_\-]{10,})", "<REDACTED>", value)
        return value


def _require(params: dict, name: str, kind=str) -> Any:
    if name not in params or params[name] in (None, ""):
        raise ToolError(f"missing parameter: {name}")
    value = params[name]
    if kind is str and not isinstance(value, str):
        raise ToolError(f"parameter {name} must be a string")
    if kind is int:
        try:
            return int(value)
        except (TypeError, ValueError):
            raise ToolError(f"parameter {name} must be an integer") from None
    return value


def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


class ToolBox:
    def __init__(self, settings, db, approvals, memory):
        self.settings = settings
        self.db = db
        self.approvals = approvals
        self.memory = memory
        self.root = Path(settings.project_root).resolve()
        self.tools: dict[str, Tool] = {}
        self.library = None
        self.skill_runner = None
        self._register_all()

    def attach_skills(self, library, runner) -> None:
        """Called by the server once the skill library is ready."""
        self.library = library
        self.skill_runner = runner

    # ------------------------------------------------------------ registry

    def register(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def list(self) -> list[dict]:
        return [tool.schema() for tool in self.tools.values() if tool.enabled]

    def get(self, name: str) -> Tool:
        tool = self.tools.get(name)
        if not tool:
            raise ToolError(f"unknown tool: {name}")
        if not tool.enabled:
            raise ToolError(f"tool disabled: {name}")
        return tool

    # online hands -------------------------------------------------------

    def _register_online(self) -> None:
        """The "hands" that act on the internet. Every call is approval-gated,
        public-host only, size-capped and returned as untrusted data."""

        def check_url(raw: str) -> str:
            text = str(raw or "").strip()
            parsed = urllib.parse.urlparse(text)
            if parsed.scheme not in ("http", "https"):
                raise ToolBlocked("only http/https urls are allowed")
            if not parsed.hostname:
                raise ToolError("url has no host")
            if not _public_host(parsed.hostname):
                raise ToolBlocked("refusing to contact a private or unresolvable host")
            return text

        def http_request(method: str = "GET", url: str = "", headers: dict | None = None,
                         body: str = "", timeout: int = 20) -> dict:
            target = check_url(url)
            verb = str(method or "GET").upper()
            if verb not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"):
                raise ToolError("unsupported method")
            payload = str(body or "").encode("utf-8")
            if len(payload) > 20_000:
                raise ToolBlocked("request body too large (20 KB limit)")
            clean_headers = {"user-agent": "JARVIS/1.0 (+local)"}
            for key, value in (headers or {}).items():
                name = str(key).strip().lower()
                if name in ("host", "authorization", "cookie", "proxy-authorization"):
                    raise ToolBlocked(f"refusing to send sensitive header: {name}")
                clean_headers[name] = str(value)[:300]
            request = urllib.request.Request(target, data=payload or None, method=verb,
                                             headers=clean_headers)
            try:
                with urllib.request.urlopen(request, timeout=min(60, max(5, int(timeout)))) as response:
                    final = response.geturl()
                    if not _public_host(urllib.parse.urlparse(final).hostname or ""):
                        raise ToolBlocked("redirected to a private host")
                    raw = response.read(300_000)
                    text = raw.decode("utf-8", "replace")
                    return {
                        "ok": True, "status": response.status, "final_url": final,
                        "content_type": response.headers.get("content-type", ""),
                        "bytes": len(raw), "truncated": len(raw) >= 300_000,
                        "text": text[:120_000], "untrusted": True,
                    }
            except urllib.error.HTTPError as exc:
                return {"ok": False, "status": exc.code,
                        "error": f"HTTP {exc.code}", "untrusted": True}
            except (urllib.error.URLError, TimeoutError) as exc:
                raise ToolError(f"request failed: {type(exc).__name__}") from None

        def download_file(url: str, path: str, max_mb: int = 20, overwrite: bool = False) -> dict:
            target_url = check_url(url)
            limit = int(min(max(int(max_mb), 1), 200))
            target = self.resolve_path(path)
            suffix = target.suffix.lower()
            if suffix in (".exe", ".apk", ".bin", ".so", ".dll", ".sh", ".elf"):
                raise ToolBlocked(f"refusing to download executable {suffix} into the project")
            if target.exists() and not overwrite:
                raise ToolBlocked("file exists; pass overwrite=true to replace it")
            target.parent.mkdir(parents=True, exist_ok=True)
            part = target.with_suffix(target.suffix + ".part")
            written = 0
            request = urllib.request.Request(target_url, headers={"user-agent": "JARVIS/1.0 (+local)"})
            try:
                with urllib.request.urlopen(request, timeout=min(60, self.settings.tool_timeout)) as response:
                    final = response.geturl()
                    if not _public_host(urllib.parse.urlparse(final).hostname or ""):
                        raise ToolBlocked("redirected to a private host")
                    length = int(response.headers.get("content-length") or 0)
                    if length and length > limit * 2**20:
                        raise ToolBlocked(f"file is {length / 2**20:.1f} MB, limit is {limit} MB")
                    with part.open("wb") as handle:
                        while True:
                            chunk = response.read(128 * 1024)
                            if not chunk:
                                break
                            written += len(chunk)
                            if written > limit * 2**20:
                                handle.close()
                                part.unlink(missing_ok=True)
                                raise ToolBlocked(f"download exceeded {limit} MB and was discarded")
                            handle.write(chunk)
            except urllib.error.HTTPError as exc:
                part.unlink(missing_ok=True)
                raise ToolError(f"download failed: HTTP {exc.code}") from None
            except (urllib.error.URLError, TimeoutError) as exc:
                part.unlink(missing_ok=True)
                raise ToolError(f"download failed: {type(exc).__name__}") from None
            if target.exists():
                target.replace(target.with_suffix(target.suffix + ".bak"))
            part.replace(target)
            return {"ok": True, "path": str(target), "bytes": written,
                    "mb": round(written / 2**20, 2), "untrusted": True}

        self.register(Tool(
            "http_request",
            "Call a public HTTP API (GET/POST/PUT/PATCH/DELETE/HEAD) and return status + body. "
            "Approval-gated, no auth headers, private hosts refused.",
            MEDIUM, {"method": "string", "url": "string", "headers": "object",
                     "body": "string", "timeout": "number"}, http_request))
        self.register(Tool(
            "download_file",
            "Download a public file into the project (text/data, no executables, 20 MB default). "
            "Approval-gated and size-capped.",
            MEDIUM, {"url": "string", "path": "string", "max_mb": "number",
                     "overwrite": "boolean"}, download_file))

    # skills -------------------------------------------------------------

    def _register_skills(self) -> None:
        box = self

        def require_library():
            if box.library is None:
                raise ToolError("skill library is not ready yet")
            return box.library

        def skill_search(query: str = "", pack: str = "", limit: int = 8) -> dict:
            library = require_library()
            rows = library.search(query, limit=int(limit), pack=pack)
            return {"ok": True, "count": len(rows), "skills": rows}

        def skill_show(skill_id: str) -> dict:
            library = require_library()
            skill = library.get(str(skill_id))
            if not skill:
                raise ToolError(f"skill not found: {skill_id}")
            return {"ok": True, "skill": skill}

        def skill_run(skill_id: str, inputs: dict | None = None) -> dict:
            if box.skill_runner is None:
                raise ToolError("skill runner is not ready yet")
            result = box.skill_runner.start(str(skill_id), inputs or {})
            return {"ok": True, "skill": result.get("skill"), "task": result.get("task"),
                    "approval": result.get("approval")}

        def tasks_list() -> dict:
            rows = box.db.query(
                "SELECT status, COUNT(*) AS n FROM tasks GROUP BY status")
            open_rows = box.db.query(
                "SELECT id, title, status FROM tasks WHERE status NOT IN ('DONE','FAILED','CANCELLED') "
                "ORDER BY created DESC LIMIT 20")
            return {"ok": True, "count": sum(int(row["n"]) for row in rows),
                    "by_status": {row["status"]: int(row["n"]) for row in rows},
                    "open": [{"id": row["id"], "title": row["title"], "status": row["status"]}
                             for row in open_rows]}

        def audit_recent(limit: int = 20) -> dict:
            rows = box.db.query(
                "SELECT ts, event, detail FROM audit ORDER BY id DESC LIMIT ?",
                (max(1, min(int(limit), 100)),))
            return {"ok": True, "count": len(rows),
                    "events": [{"ts": row["ts"], "event": row["event"],
                                "detail": str(row["detail"] or "")[:200]} for row in rows]}

        self.register(Tool("skill_search",
                           "Search the user's skill library (1,889 GitHub skills + native skills). "
                           "Use before saying you cannot do something.",
                           LOW, {"query": "string", "pack": "string", "limit": "number"}, skill_search))
        self.register(Tool("skill_show", "Read one skill's full instructions by id.",
                           LOW, {"skill_id": "string"}, skill_show))
        self.register(Tool("skill_run",
                           "Run a skill as a task on the phone. Native skills execute real tools; "
                           "imported skills load their instructions into the model. Risky steps "
                           "inside the skill still need their own approval.",
                           LOW, {"skill_id": "string", "inputs": "object"}, skill_run))
        self.register(Tool("tasks_list", "List task counts and open tasks.", LOW, {}, tasks_list))
        self.register(Tool("audit_recent", "Read the most recent local audit events.",
                           LOW, {"limit": "number"}, audit_recent))

    # ------------------------------------------------------------ execution

    def needs_approval(self, name: str) -> bool:
        return RISK_ORDER[self.get(name).risk] >= RISK_ORDER[MEDIUM]

    def call(self, name: str, arguments: dict | None = None,
             approval_id: str | None = None) -> dict:
        arguments = arguments or {}
        started = time.time()
        try:
            tool = self.get(name)
        except ToolError as exc:
            return {"ok": False, "error": str(exc), "blocked": True}

        if RISK_ORDER[tool.risk] >= RISK_ORDER[MEDIUM]:
            if not approval_id:
                request = self.approvals.request(
                    name, arguments, risk=tool.risk,
                    reason=f"{name} needs approval ({tool.risk} risk).",
                )
                self.db.audit("tool_approval_required", {"tool": name, "id": request.id})
                return {
                    "ok": False, "approval_required": True, "approval": request.to_dict(),
                    "error": f"{name} needs your approval before it runs.",
                }
            allowed, reason = self.approvals.consume(approval_id, name, arguments)
            if not allowed:
                self.db.audit("tool_blocked", {"tool": name, "reason": reason})
                return {"ok": False, "blocked": True, "error": reason}

        try:
            result = tool.run(**arguments)
            if not isinstance(result, dict):
                result = {"result": result}
            result.setdefault("ok", True)
            payload = {
                "ok": bool(result.get("ok")),
                "tool": name,
                "risk": tool.risk,
                "ms": int((time.time() - started) * 1000),
                "result": redact(result),
                "trust": "untrusted" if name in ("web_search", "web_fetch") else "local",
            }
            self.db.audit("tool_called", {"tool": name, "ok": payload["ok"], "ms": payload["ms"]})
            return payload
        except ToolBlocked as exc:
            self.db.audit("tool_blocked", {"tool": name, "error": str(exc)[:200]})
            return {"ok": False, "tool": name, "blocked": True, "error": str(exc),
                    "ms": int((time.time() - started) * 1000)}
        except ToolError as exc:
            self.db.audit("tool_failed", {"tool": name, "error": str(exc)[:200]})
            return {"ok": False, "tool": name, "error": str(exc), "ms": int((time.time() - started) * 1000)}
        except Exception as exc:
            self.db.audit("tool_failed", {"tool": name, "error": f"{type(exc).__name__}: {exc}"[:300]})
            return {"ok": False, "tool": name,
                    "error": f"{type(exc).__name__}: {exc}"[:400],
                    "ms": int((time.time() - started) * 1000)}

    # ----------------------------------------------------------- sandboxing

    def resolve_path(self, raw: str, *, must_exist: bool = False) -> Path:
        if not isinstance(raw, str) or not raw.strip():
            raise ToolError("path is required")
        if "\x00" in raw:
            raise ToolBlocked("invalid path")
        candidate = Path(raw).expanduser()
        if not candidate.is_absolute():
            candidate = self.root / candidate
        try:
            resolved = candidate.resolve()
        except OSError:
            raise ToolBlocked("path cannot be resolved") from None
        if resolved != self.root and self.root not in resolved.parents:
            raise ToolBlocked(f"path outside the allowed root ({self.root})")
        if must_exist and not resolved.exists():
            raise ToolError("file not found")
        return resolved

    # ------------------------------------------------------------- builtins

    def _register_all(self) -> None:
        self._register_memory()
        self._register_fs()
        self._register_system()
        self._register_web()
        self._register_git()
        self._register_python()
        self._register_skills()
        self._register_online()

    # memory ------------------------------------------------------------

    def _register_memory(self) -> None:
        memory = self.memory

        def remember(text: str, kind: str = "fact", subject: str = "") -> dict:
            entry = memory.add(text, kind=kind, subject=subject, source="jarvis", confidence=0.9)
            return {"ok": True, "saved": entry.to_dict()}

        def recall(query: str = "", limit: int = 5) -> dict:
            rows = memory.search(query, limit=int(limit)) if query else memory.list(limit=int(limit))
            return {"ok": True, "memories": [row.to_dict() for row in rows]}

        def forget(memory_id: int) -> dict:
            return {"ok": memory.delete(int(memory_id)), "deleted": int(memory_id)}

        self.register(Tool(
            "remember", "Save a durable fact or preference about the user.",
            LOW, {"text": "string", "kind": "string", "subject": "string"}, remember))
        self.register(Tool(
            "recall", "Search saved memories.", LOW, {"query": "string", "limit": "number"}, recall))
        self.register(Tool(
            "forget", "Delete one saved memory by id.", MEDIUM, {"memory_id": "number"}, forget))

    # filesystem --------------------------------------------------------

    def _register_fs(self) -> None:
        box = self

        def fs_list(path: str = ".") -> dict:
            target = box.resolve_path(path, must_exist=True)
            if not target.is_dir():
                raise ToolError("not a directory")
            rows = []
            for entry in sorted(target.iterdir())[:120]:
                if entry.name.startswith(".git"):
                    continue
                rows.append({
                    "name": entry.name,
                    "dir": entry.is_dir(),
                    "size": entry.stat().st_size if entry.is_file() else 0,
                })
            return {"ok": True, "path": str(target), "entries": rows}

        def fs_read(path: str, max_bytes: int = 120_000) -> dict:
            target = box.resolve_path(path, must_exist=True)
            if not target.is_file():
                raise ToolError("not a file")
            limit = max(1000, min(int(max_bytes), 400_000))
            data = target.read_bytes()[:limit]
            return {
                "ok": True, "path": str(target), "bytes": len(data),
                "truncated": target.stat().st_size > limit,
                "text": data.decode("utf-8", "replace"),
            }

        def fs_write(path: str, content: str) -> dict:
            target = self.resolve_path(path)
            if target.is_dir():
                raise ToolError("path is a directory")
            suffix = target.suffix.lower()
            if target.name not in WRITE_SUFFIX_OK and suffix not in WRITE_SUFFIX_OK:
                raise ToolBlocked(f"refusing to write {target.suffix or 'extensionless'} file")
            if target.exists() and target.stat().st_size > 2_000_000:
                raise ToolBlocked("refusing to overwrite a file larger than 2 MB")
            if target.exists():
                backup = target.with_suffix(target.suffix + ".bak")
                try:
                    backup.write_bytes(target.read_bytes())
                except OSError:
                    pass
            target.parent.mkdir(parents=True, exist_ok=True)
            text = str(content)
            if len(text.encode("utf-8")) > 400_000:
                raise ToolBlocked("content too large (400 KB limit)")
            target.write_text(text, encoding="utf-8")
            return {"ok": True, "path": str(target), "bytes": len(text.encode('utf-8'))}

        self.register(Tool("fs_list", "List a directory inside the project.",
                           LOW, {"path": "string"}, fs_list))
        self.register(Tool("fs_read", "Read a text file inside the project.",
                           LOW, {"path": "string", "max_bytes": "number"}, fs_read))
        self.register(Tool("fs_write", "Create or overwrite a text file inside the project (keeps a .bak).",
                           MEDIUM, {"path": "string", "content": "string"}, fs_write))

    # system ------------------------------------------------------------

    def _register_system(self) -> None:
        def system_info() -> dict:
            import platform

            memory = {}
            try:
                for line in Path("/proc/meminfo").read_text().splitlines()[:4]:
                    key, _, rest = line.partition(":")
                    parts = rest.split()
                    if parts and parts[0].isdigit():
                        memory[key] = int(parts[0]) // 1024
            except Exception:
                pass
            disk = {}
            try:
                usage = shutil.disk_usage(str(Path.home()))
                disk = {"total_gb": round(usage.total / 2**30, 1), "free_gb": round(usage.free / 2**30, 1)}
            except Exception:
                pass
            battery = {}
            if shutil.which("termux-battery-status"):
                try:
                    out = subprocess.run(["termux-battery-status"], capture_output=True,
                                         text=True, timeout=8)
                    battery = json.loads(out.stdout or "{}")
                except Exception:
                    battery = {}
            return {
                "ok": True,
                "platform": platform.platform(),
                "machine": platform.machine(),
                "python": platform.python_version(),
                "cpu_count": os.cpu_count(),
                "memory_mb": memory,
                "disk": disk,
                "battery": {k: battery.get(k) for k in ("percentage", "status", "temperature")} if battery else {},
                "termux": bool(os.environ.get("TERMUX_VERSION")),
                "root": (os.geteuid() == 0) if hasattr(os, "geteuid") else None,
            }

        def notify(title: str, message: str = "") -> dict:
            if not shutil.which("termux-notification"):
                raise ToolError("termux-notification missing (install Termux:API)")
            subprocess.run(["termux-notification", "--title", str(title)[:80],
                            "--content", str(message)[:300]], capture_output=True, timeout=10)
            return {"ok": True, "notified": str(title)[:80]}

        def speak(text: str) -> dict:
            if not shutil.which("termux-tts-speak"):
                raise ToolError("termux-tts-speak missing (install Termux:API)")
            subprocess.run(["termux-tts-speak", str(text)[:800]], capture_output=True, timeout=30)
            return {"ok": True, "spoken": str(text)[:80]}

        self.register(Tool("system_info", "Read device CPU, memory, disk, battery, platform.",
                           LOW, {}, system_info))
        self.register(Tool("notify", "Show an Android notification via Termux:API.",
                           MEDIUM, {"title": "string", "message": "string"}, notify,
                           requires="termux-api"))
        self.register(Tool("speak", "Speak text out loud via Termux:API TTS.",
                           MEDIUM, {"text": "string"}, speak, requires="termux-api"))

    # web ---------------------------------------------------------------

    def _register_web(self) -> None:
        def web_fetch(url: str, max_chars: int = 6000) -> dict:
            target = str(url or "").strip()
            parsed = urllib.parse.urlparse(target)
            if parsed.scheme not in ("http", "https"):
                raise ToolBlocked("only http/https urls are allowed")
            if not parsed.hostname:
                raise ToolError("url has no host")
            if not _public_host(parsed.hostname):
                raise ToolBlocked("refusing to fetch a private or unresolvable host")
            request = urllib.request.Request(target, headers={
                "user-agent": "Mozilla/5.0 (compatible; JARVIS/1.0)",
                "accept": "text/html,application/xhtml+xml,text/plain",
            })
            try:
                with urllib.request.urlopen(request, timeout=min(20, self.settings.tool_timeout)) as response:
                    raw = response.read(400_000)
                    content_type = response.headers.get("content-type", "")
            except urllib.error.HTTPError as exc:
                raise ToolError(f"page returned HTTP {exc.code}") from None
            except Exception as exc:
                raise ToolError(f"fetch failed: {type(exc).__name__}") from None
            text = raw.decode("utf-8", "replace")
            if "html" in content_type:
                text = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", text)
                text = re.sub(r"(?s)<!--.*?-->", " ", text)
                text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>", "\n", text)
                text = re.sub(r"<[^>]+>", " ", text)
                import html as html_module
                text = html_module.unescape(text)
            text = re.sub(r"[ \t]+", " ", text)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            limit = max(500, min(int(max_chars), 20_000))
            return {"ok": True, "url": target, "chars": len(text[:limit]), "text": text[:limit],
                    "untrusted": True}

        def web_search(query: str, max_results: int = 5) -> dict:
            term = str(query or "").strip()
            if not term:
                raise ToolError("query is required")
            limit = max(1, min(int(max_results), 10))
            data = urllib.parse.urlencode({"q": term}).encode()
            request = urllib.request.Request("https://html.duckduckgo.com/html/", data=data,
                                             headers={"user-agent": "Mozilla/5.0 (compatible; JARVIS/1.0)"})
            try:
                with urllib.request.urlopen(request, timeout=min(20, self.settings.tool_timeout)) as response:
                    body = response.read(400_000).decode("utf-8", "replace")
            except Exception as exc:
                raise ToolError(f"search failed: {type(exc).__name__}") from None
            results = []
            pattern = re.compile(
                r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S | re.I)
            for href, title in pattern.findall(body):
                url = href
                if "uddg=" in url:
                    query_part = urllib.parse.urlparse(url).query
                    url = urllib.parse.parse_qs(query_part).get("uddg", [url])[0]
                if not url.startswith("http"):
                    continue
                clean_title = re.sub(r"<[^>]+>", "", title).strip()
                results.append({"title": clean_title[:160], "url": url})
                if len(results) >= limit:
                    break
            return {"ok": True, "query": term, "results": results, "untrusted": True}

        self.register(Tool("web_search", "Search the public web (DuckDuckGo HTML).",
                           LOW, {"query": "string", "max_results": "number"}, web_search))
        self.register(Tool("web_fetch", "Fetch readable text from a public web page.",
                           LOW, {"url": "string", "max_chars": "number"}, web_fetch))

    # git ---------------------------------------------------------------

    def _register_git(self) -> None:
        box = self

        def git(cwd: str = ".") -> dict:
            return {"ok": True, "root": str(box.root), "cwd": cwd}

        def git_status() -> dict:
            return self._git(("status", "--short", "--branch"))

        def git_log(limit: int = 10) -> dict:
            return self._git(("log", f"-{max(1, min(int(limit), 40))}", "--oneline", "--decorate"))

        def git_diff(path: str = "") -> dict:
            args = ["diff", "--stat", "--", path] if path else ["diff", "--stat"]
            return self._git(tuple(args))

        self.register(Tool("git_status", "git status of the project.", LOW, {}, git_status))
        self.register(Tool("git_log", "Recent commits.", LOW, {"limit": "number"}, git_log))
        self.register(Tool("git_diff", "Working tree diff summary.", LOW, {"path": "string"}, git_diff))

    def _git(self, args: tuple) -> dict:
        if not args or args[0] not in GIT_SAFE:
            raise ToolBlocked("git subcommand not allowed")
        for arg in args:
            if any(flag in arg for flag in GIT_BLOCKED_FLAGS):
                raise ToolBlocked("destructive git flags are blocked")
        if not (self.root / ".git").exists():
            raise ToolError("not a git repository")
        try:
            proc = subprocess.run(["git", *args], cwd=str(self.root), capture_output=True,
                                  text=True, timeout=self.settings.tool_timeout)
        except subprocess.TimeoutExpired:
            raise ToolError("git timed out") from None
        except FileNotFoundError:
            raise ToolError("git is not installed") from None
        return {"ok": proc.returncode == 0, "args": list(args),
                "stdout": (proc.stdout or "")[:8000], "stderr": (proc.stderr or "")[:2000]}

    # python ------------------------------------------------------------

    def _register_python(self) -> None:
        def python_exec(code: str, stdin: str = "") -> dict:
            source = str(code or "")
            if not source.strip():
                raise ToolError("code is required")
            if len(source) > 40_000:
                raise ToolError("code too long")
            if re.search(r"\b(rm\s+-rf|shutil\.rmtree|os\.system|subprocess\.(Popen|call|run)|"
                         r"socket\.|urllib\.request\.urlopen|requests\.)", source):
                raise ToolBlocked("refusing code that shells out or opens the network")
            with tempfile.TemporaryDirectory(prefix="jarvis-py-") as workdir:
                script = Path(workdir) / "snippet.py"
                script.write_text(source, encoding="utf-8")
                env = {
                    "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                    "HOME": str(Path(workdir)),
                    "PYTHONIOENCODING": "utf-8",
                    "PYTHONDONTWRITEBYTECODE": "1",
                }
                try:
                    proc = subprocess.run(
                        [sys.executable, "-I", str(script)],
                        input=str(stdin or ""), capture_output=True, text=True,
                        timeout=self.settings.python_timeout, cwd=workdir, env=env,
                    )
                except subprocess.TimeoutExpired:
                    raise ToolError(f"python timed out after {self.settings.python_timeout}s") from None
            return {
                "ok": proc.returncode == 0,
                "returncode": proc.returncode,
                "stdout": (proc.stdout or "")[:8000],
                "stderr": (proc.stderr or "")[:4000],
            }

        self.register(Tool(
            "python_exec",
            "Run a short Python snippet in an isolated temp dir. No network, no shell, "
            "20s timeout. Use for maths, data munging and verification.",
            MEDIUM, {"code": "string", "stdin": "string"}, python_exec))
