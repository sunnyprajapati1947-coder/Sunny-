"""Phone-browser interface for personal Jarvis.

Serves one page on 127.0.0.1 only. Every API call needs a random token that is
printed in the Termux terminal, plus a loopback Host header (blocks DNS rebinding).
Uses the same PersonalJarvis.handle() as the terminal, so approvals, kill switch
and "model text cannot run commands" rules are identical.
Terminal-only actions (/exit, /resume) are refused here on purpose.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
import hmac
import json
import secrets
from urllib import error

from security.policy import redact_secrets

MAX_BODY = 4000
MAX_LINE = 2000
TERMINAL_ONLY = {"/exit", "/resume"}
LOOPBACK_HOST = "127.0.0.1"

PAGE = """<!doctype html>
<html lang="hi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jarvis</title>
<style>
 :root { color-scheme: dark; }
 body { margin:0; font-family: system-ui, sans-serif; background:#0b0f19; color:#e6edf7; display:flex; flex-direction:column; height:100vh; }
 header { padding:12px 16px; border-bottom:1px solid #1f2a3d; font-weight:600; letter-spacing:.5px; }
 header span { color:#7aa2ff; }
 #log { flex:1; overflow-y:auto; padding:12px; }
 .msg { max-width:92%; padding:10px 12px; border-radius:12px; margin:6px 0; white-space:pre-wrap; word-wrap:break-word; }
 .you { margin-left:auto; background:#1e3a8a; }
 .jarvis { background:#141d2e; border:1px solid #1f2a3d; }
 .err { background:#4a1d1d; }
 form { display:flex; gap:8px; padding:10px; border-top:1px solid #1f2a3d; }
 input { flex:1; padding:12px; border-radius:10px; border:1px solid #2a3850; background:#0f1626; color:inherit; font-size:16px; }
 button { padding:12px 16px; border-radius:10px; border:0; background:#3b82f6; color:white; font-size:16px; }
 .quick { display:flex; gap:6px; padding:0 10px 10px; flex-wrap:wrap; }
 .quick button { background:#1f2a3d; font-size:13px; padding:8px 10px; }
</style></head>
<body>
<header>Jarvis <span>· Sunny ji</span></header>
<div id="log"></div>
<div class="quick">
 <button onclick="send('/plan')">/plan</button>
 <button onclick="send('/tasks')">/tasks</button>
 <button onclick="send('/prefs')">/prefs</button>
 <button onclick="send('/stop')">/stop</button>
</div>
<form id="f"><input id="q" autocomplete="off" placeholder="Jarvis se baat karein… (/help)"><button>Bhejo</button></form>
<script>
const params = new URLSearchParams(location.search);
if (params.get("token")) { sessionStorage.setItem("jarvisToken", params.get("token")); history.replaceState(null, "", "/"); }
const token = sessionStorage.getItem("jarvisToken") || "";
const log = document.getElementById("log");
function add(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
async function send(line) {
  add(line, "you");
  try {
    const r = await fetch("/api/command", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Jarvis-Token": token},
      body: JSON.stringify({line})
    });
    const data = await r.json();
    if (!r.ok) { add(data.error || ("HTTP " + r.status), "err"); return; }
    add(data.reply !== undefined ? data.reply : JSON.stringify(data.result, null, 2), "jarvis");
  } catch (e) { add("Connection problem: " + e, "err"); }
}
document.getElementById("f").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("q");
  const line = q.value.trim();
  if (line) { q.value = ""; send(line); }
});
add(token ? "Connected. /help for commands." : "Token missing: open the link printed in Termux.", token ? "jarvis" : "err");
</script></body></html>
"""


def make_handler(app, token: str, port: int):
    allowed_hosts = {f"{LOOPBACK_HOST}:{port}", f"localhost:{port}"}

    class JarvisWebHandler(BaseHTTPRequestHandler):
        server_version = "JarvisWeb"

        def log_message(self, format, *args):  # keep the terminal quiet; no request logging
            pass

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, payload: dict) -> None:
            self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def _host_ok(self) -> bool:
            return self.headers.get("Host", "") in allowed_hosts

        def do_GET(self):
            if not self._host_ok():
                return self._json(403, {"error": "Only the phone's local address is accepted."})
            if self.path.split("?", 1)[0] != "/":
                return self._json(404, {"error": "Not found."})
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")

        def do_POST(self):
            if not self._host_ok():
                return self._json(403, {"error": "Only the phone's local address is accepted."})
            if self.path != "/api/command":
                return self._json(404, {"error": "Not found."})
            if not hmac.compare_digest(self.headers.get("X-Jarvis-Token", ""), token):
                return self._json(401, {"error": "Missing or wrong token. Open the link printed in Termux."})
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                return self._json(415, {"error": "Send JSON."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._json(400, {"error": "Bad length."})
            if not 0 < length <= MAX_BODY:
                return self._json(413, {"error": "Message too large."})
            try:
                body = json.loads(self.rfile.read(length))
                line = body["line"]
            except (ValueError, KeyError, TypeError):
                return self._json(400, {"error": "Send {\"line\": \"...\"}."})
            if not isinstance(line, str) or not line.strip() or len(line) > MAX_LINE:
                return self._json(400, {"error": "Message must be 1–2000 characters."})
            line = line.strip()
            if line in TERMINAL_ONLY or line.split(" ", 1)[0] in TERMINAL_ONLY:
                return self._json(403, {"error": "Use the Termux terminal for this command."})
            try:
                result = app.handle(line)
            except (error.URLError, ValueError, OSError, json.JSONDecodeError) as exc:
                return self._json(400, {"error": redact_secrets(str(exc))})
            if isinstance(result, str):
                return self._json(200, {"reply": result})
            return self._json(200, {"result": result})

    return JarvisWebHandler


def serve(app, port: int = 8787, host: str = LOOPBACK_HOST) -> None:
    if host != LOOPBACK_HOST:
        raise ValueError("Web UI binds to 127.0.0.1 only; it is not for other devices.")
    if not 1024 <= port <= 65535:
        raise ValueError("Use a port from 1024 to 65535.")
    token = secrets.token_urlsafe(24)
    try:
        server = HTTPServer((host, port), make_handler(app, token, port))
    except OSError as exc:
        raise ValueError(f"Port {port} is busy or unavailable: {exc.strerror}") from None
    print(f"Jarvis web: http://{LOOPBACK_HOST}:{port}/?token={token}", flush=True)
    print("Open this link on this phone only. Press Ctrl+C here to stop the web UI.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nJarvis web stopped.")
    finally:
        server.server_close()
