"""Zero-dependency HTTP server for the J.A.R.V.I.S. HUD."""
from __future__ import annotations

import json
import logging
import mimetypes
import threading
import time
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from jarvis import sysinfo, tools
from jarvis.config import DATA_DIR, WEB_DIR, ensure_dirs, get_settings, update_settings
from jarvis.core import JarvisCore
from jarvis.security import is_within
from jarvis.util import human_uptime, iso, now, parse_iso

LOG = logging.getLogger("jarvis.server")

MAX_BODY = 12 * 1024 * 1024
STATIC_EXTENSIONS = {".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".json", ".woff2"}
DATA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md", ".json", ".pdf"}
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".pdf": "application/pdf",
    ".gif": "image/gif",
}


class JarvisHandler(BaseHTTPRequestHandler):
    server_version = "JARVIS/1.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------- plumbing
    @property
    def core(self) -> JarvisCore:
        return self.server.core  # type: ignore[attr-defined]

    def log_message(self, fmt, *args):  # noqa: A003 - stdlib signature
        LOG.debug("%s - %s", self.address_string(), fmt % args)

    def _headers(self, status: int, content_type: str, length: int, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()

    def _json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(body))
        self._write(body)

    def _text(self, text: str, status: int = 200) -> None:
        body = str(text).encode("utf-8")
        self._headers(status, "text/plain; charset=utf-8", len(body))
        self._write(body)

    def _bytes(self, body: bytes, content_type: str, cache: str = "no-store", status: int = 200) -> None:
        self._headers(status, content_type, len(body), cache)
        self._write(body)

    def _write(self, body: bytes) -> None:
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        if length > MAX_BODY:
            self._json({"ok": False, "error": "Payload too large."}, 413)
            return None
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json({"ok": False, "error": "Malformed JSON."}, 400)
            return None
        return data if isinstance(data, dict) else {}

    # ---------------------------------------------------------------- verbs
    def do_GET(self):  # noqa: N802
        try:
            self._route_get()
        except Exception as exc:  # pragma: no cover - defensive
            LOG.exception("GET failed")
            self._json({"ok": False, "error": f"Server error: {type(exc).__name__}"}, 500)

    def do_POST(self):  # noqa: N802
        try:
            self._route_post()
        except Exception as exc:  # pragma: no cover - defensive
            LOG.exception("POST failed")
            self._json({"ok": False, "error": f"Server error: {type(exc).__name__}"}, 500)

    def do_HEAD(self):  # noqa: N802
        self._headers(200, "text/html; charset=utf-8", 0)

    # ------------------------------------------------------------------ GET
    def _route_get(self) -> None:
        parts = urlsplit(self.path)
        route = parts.path
        query = parse_qs(parts.query)

        if route in {"", "/", "/index.html"}:
            self._serve_static("index.html")
            return
        if route == "/api/health":
            self._json(
                {
                    "ok": True,
                    "uptime": int(time.time() - self.server.started_at),  # type: ignore[attr-defined]
                    "time": iso(now()),
                }
            )
            return
        if route == "/api/status":
            status = self.core.status()
            status["events_last"] = self.core.scheduler.events(0)["last_id"]
            self._json({"ok": True, **status})
            return
        if route == "/api/history":
            try:
                limit = int((query.get("limit") or ["20"])[0])
            except ValueError:
                limit = 20
            entries = self.core.store.history(max(1, min(120, limit)))
            self._json({"ok": True, "history": entries})
            return
        if route == "/api/events":
            try:
                since = int((query.get("since") or ["0"])[0])
            except ValueError:
                since = 0
            payload = self.core.scheduler.events(since)
            self._json({"ok": True, **payload, "server_time": iso(now())})
            return
        if route == "/api/agenda":
            store = self.core.store
            current = time.time()

            def remaining(item: dict) -> int | None:
                try:
                    return max(0, int(parse_iso(item.get("due", "")).timestamp() - current))
                except Exception:
                    return None

            self._json(
                {
                    "ok": True,
                    "reminders": [dict(item, remaining=remaining(item)) for item in store.reminders()],
                    "timers": [dict(item, remaining=remaining(item)) for item in store.timers()],
                    "alarms": store.alarms(),
                    "server_time": iso(now()),
                }
            )
            return
        if route == "/api/suggestions":
            self._json({"ok": True, "suggestions": self.core.suggestions()})
            return
        if route == "/api/settings":
            settings = get_settings()
            self._json({"ok": True, "settings": settings.public()})
            return
        if route == "/api/tools":
            grouped = {
                key: [
                    {"name": item.name, "description": item.description, "high_impact": item.high_impact}
                    for item in items
                ]
                for key, items in tools.by_category().items()
            }
            self._json({"ok": True, "tools": grouped, "count": len(tools.TOOLS)})
            return
        if route == "/api/file":
            self._serve_data_file((query.get("path") or [""])[0])
            return
        if route == "/favicon.ico":
            self._serve_static("assets/favicon.svg")
            return
        if route.startswith("/assets/"):
            self._serve_static(route.lstrip("/"))
            return
        if route == "/manifest.webmanifest":
            self._json(
                {
                    "name": "J.A.R.V.I.S.",
                    "short_name": "JARVIS",
                    "start_url": "/",
                    "display": "standalone",
                    "background_color": "#04070d",
                    "theme_color": "#5eeaff",
                    "icons": [{"src": "/assets/favicon.svg", "sizes": "any", "type": "image/svg+xml"}],
                }
            )
            return

        if route.startswith("/api/"):
            self._json({"ok": False, "error": "Unknown endpoint."}, 404)
        else:
            self._serve_static(route.lstrip("/"))

    # ----------------------------------------------------------------- POST
    def _route_post(self) -> None:
        parts = urlsplit(self.path)
        route = parts.path
        payload = self._read_json()
        if payload is None:
            return

        if route == "/api/command":
            text = str(payload.get("text") or "").strip()
            if not text:
                self._json({"ok": False, "error": "Empty command."}, 400)
                return
            source = str(payload.get("source") or "text")
            started = time.perf_counter()
            result = self.core.handle(text[:1500], source=source)
            result.setdefault("meta", {})["server_ms"] = int((time.perf_counter() - started) * 1000)
            self._json(result)
            return

        if route == "/api/approve":
            token = str(payload.get("token") or "")
            if not token:
                self._json({"ok": False, "error": "Missing token."}, 400)
                return
            self._json(self.core.approve(token))
            return

        if route == "/api/deny":
            token = str(payload.get("token") or "")
            if not token:
                self._json({"ok": False, "error": "Missing token."}, 400)
                return
            self._json(self.core.deny(token))
            return

        if route == "/api/vision":
            image = payload.get("image") or ""
            if not isinstance(image, str) or len(image) > 11_000_000:
                self._json({"ok": False, "error": "Image missing or too large."}, 400)
                return
            question = str(payload.get("question") or "")[:500]
            self._json(self.core.vision(image, question))
            return

        if route == "/api/settings":
            settings, warnings = update_settings(payload)
            self._json({"ok": True, "settings": settings.public(), "warnings": warnings})
            return

        if route == "/api/clear":
            self.core.store.clear_history()
            self._json({"ok": True})
            return

        if route.startswith("/api/"):
            self._json({"ok": False, "error": "Unknown endpoint."}, 404)
        else:
            self._json({"ok": False, "error": "Not found."}, 404)

    # ---------------------------------------------------------------- static
    def _serve_static(self, relative: str) -> None:
        if not relative:
            relative = "index.html"
        # index fallback for client-side routes
        candidate = (WEB_DIR / relative).resolve()
        if not is_within(candidate, WEB_DIR):
            self._json({"ok": False, "error": "Forbidden path."}, 403)
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            if "." not in Path(relative).name:
                candidate = WEB_DIR / "index.html"
            if not candidate.is_file():
                self._text("Not found", 404)
                return
        if candidate.suffix.lower() not in STATIC_EXTENSIONS:
            self._text("Unsupported file type", 415)
            return
        try:
            body = candidate.read_bytes()
        except OSError:
            self._text("Cannot read file", 500)
            return
        content_type = MIME.get(candidate.suffix.lower()) or mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        cache = "no-cache" if candidate.suffix.lower() == ".html" else "public, max-age=300"
        self._bytes(body, content_type, cache=cache)

    def _serve_data_file(self, relative: str) -> None:
        base = DATA_DIR.resolve()
        target = (base / relative).resolve()
        if not relative or not is_within(target, base) or not target.is_file():
            self._json({"ok": False, "error": "File not found."}, 404)
            return
        if target.suffix.lower() not in DATA_EXTENSIONS:
            self._text("Unsupported file type", 415)
            return
        try:
            body = target.read_bytes()
        except OSError:
            self._text("Cannot read file", 500)
            return
        content_type = MIME.get(target.suffix.lower()) or "application/octet-stream"
        self._bytes(body, content_type, cache="private, max-age=60")


class JarvisHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address, core: JarvisCore):
        self.core = core
        self.started_at = time.time()
        super().__init__(server_address, JarvisHandler)


def create_server(host: str, port: int, core: JarvisCore, attempts: int = 12) -> JarvisHTTPServer:
    ensure_dirs()
    last_error: Exception | None = None
    for offset in range(attempts):
        candidate = port + offset
        try:
            return JarvisHTTPServer((host, candidate), core)
        except OSError as exc:
            last_error = exc
            continue
    raise OSError(f"Could not bind a port starting at {port}: {last_error}")


def banner(host: str, port: int) -> str:
    ip = sysinfo.primary_ip()
    shown = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    now_text = datetime.now().strftime("%d %b %Y · %H:%M")
    return (
        "\n"
        "  ╔══════════════════════════════════════════════════════════╗\n"
        "  ║   J . A . R . V . I . S .   ·   MARK VII                  ║\n"
        "  ║   Just A Rather Very Intelligent System                  ║\n"
        "  ╠══════════════════════════════════════════════════════════╣\n"
        f"  ║   LOCAL    http://{shown}:{port}".ljust(60)
        + "║\n"
        f"  ║   NETWORK  http://{ip}:{port}".ljust(60)
        + "║\n"
        f"  ║   BOOTED   {now_text}".ljust(60)
        + "║\n"
        "  ╚══════════════════════════════════════════════════════════╝\n"
    )


def run(
    host: str | None = None,
    port: int | None = None,
    *,
    open_browser: bool = True,
    core: JarvisCore | None = None,
) -> None:
    settings = get_settings()
    host = host or settings.host
    port = int(port or settings.port)
    core = core or JarvisCore()
    core.start()
    server = create_server(host, port, core)
    actual_port = server.server_address[1]

    print(banner(host, actual_port), flush=True)
    print("  HUD ready. Press Ctrl+C to shut J.A.R.V.I.S. down.\n", flush=True)

    if open_browser:
        def _open():
            time.sleep(0.8)
            try:
                webbrowser.open(f"http://127.0.0.1:{actual_port}/")
            except Exception:
                pass

        threading.Thread(target=_open, daemon=True).start()

    try:
        server.serve_forever(poll_interval=0.4)
    except KeyboardInterrupt:
        print("\n  Powering down, Sir.")
    finally:
        core.stop()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":  # pragma: no cover
    run()
