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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#070a14">
<title>Jarvis</title>
<style>
 :root { color-scheme: dark; --cyan:#22d3ee; --violet:#a78bfa; --ink:#e8eefc; --muted:#8a96b3; --glass:rgba(20,28,48,.72); --line:rgba(120,140,200,.18); }
 * { box-sizing:border-box; }
 html,body { height:100%; margin:0; }
 body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color:var(--ink);
   background: radial-gradient(1200px 600px at 10% -10%, #1b1450 0%, transparent 60%),
               radial-gradient(900px 500px at 110% 10%, #053a4a 0%, transparent 55%), #070a14;
   display:flex; flex-direction:column; overflow:hidden; }
 header { display:flex; align-items:center; gap:12px; padding:14px 16px 10px; }
 .orb { width:40px; height:40px; border-radius:50%; flex:0 0 40px;
   background: conic-gradient(from 0deg, var(--cyan), var(--violet), var(--cyan));
   box-shadow: 0 0 22px rgba(34,211,238,.55); animation: spin 6s linear infinite; position:relative; }
 .orb::after { content:""; position:absolute; inset:6px; border-radius:50%; background:#070a14; }
 .orb.busy { animation-duration: 1.2s; box-shadow: 0 0 34px rgba(167,139,250,.9); }
 @keyframes spin { to { transform: rotate(360deg); } }
 .title { font-weight:700; letter-spacing:.8px; font-size:17px; }
 .title small { display:block; font-weight:500; letter-spacing:.2px; color:var(--muted); font-size:12px; margin-top:2px; }
 .status { margin-left:auto; font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px; }
 .dot { width:8px; height:8px; border-radius:50%; background:#34d399; box-shadow:0 0 10px #34d399; }
 .dot.off { background:#f87171; box-shadow:0 0 10px #f87171; }
 #banner { display:none; margin:0 12px 6px; padding:10px 12px; border-radius:14px; border:1px solid rgba(251,191,36,.35);
   background: linear-gradient(90deg, rgba(251,191,36,.14), rgba(251,191,36,.04)); color:#fde68a; font-size:14px; }
 #log { flex:1; overflow-y:auto; padding:8px 12px 12px; scroll-behavior:smooth; }
 .row { display:flex; margin:8px 0; animation: rise .3s ease-out; }
 .row.you { justify-content:flex-end; }
 @keyframes rise { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
 .bubble { max-width:88%; padding:11px 14px; border-radius:18px; line-height:1.5; font-size:15.5px; white-space:pre-wrap; word-wrap:break-word; }
 .you .bubble { background: linear-gradient(135deg, #3b5bdb, #6d28d9); border-bottom-right-radius:6px; }
 .jarvis .bubble { background: var(--glass); border:1px solid var(--line); border-bottom-left-radius:6px; backdrop-filter: blur(8px); }
 .err .bubble { background:rgba(127,29,29,.55); border:1px solid rgba(248,113,113,.4); }
 .label { font-size:11px; letter-spacing:.6px; color:var(--muted); margin:0 4px 3px; text-transform:uppercase; }
 .card { background: var(--glass); border:1px solid var(--line); border-radius:16px; padding:12px; width:100%; max-width:560px; }
 .card h4 { margin:0 0 8px; font-size:13px; letter-spacing:.6px; text-transform:uppercase; color:var(--cyan); font-weight:600; }
 .task { display:flex; align-items:center; gap:10px; padding:9px 0; border-top:1px solid var(--line); }
 .task:first-of-type { border-top:0; }
 .task .t { flex:1; font-size:15px; }
 .task .d { font-size:12px; color:var(--muted); }
 .task.late .d { color:#fbbf24; }
 .chip { border:1px solid var(--line); background:rgba(34,211,238,.08); color:var(--cyan); border-radius:999px; padding:6px 10px; font-size:12px; }
 .empty { color:var(--muted); font-size:14px; }
 .typing span { display:inline-block; width:7px; height:7px; margin:0 2px; border-radius:50%; background:var(--violet); animation: blink 1s infinite; }
 .typing span:nth-child(2) { animation-delay:.15s; } .typing span:nth-child(3) { animation-delay:.3s; }
 @keyframes blink { 0%,80%,100% { opacity:.2; } 40% { opacity:1; } }
 pre { margin:0; white-space:pre-wrap; font-size:12.5px; color:#c7d2fe; }
 .quick { display:flex; gap:8px; overflow-x:auto; padding:4px 12px 10px; }
 .quick button { flex:0 0 auto; border:1px solid var(--line); background:rgba(167,139,250,.1); color:var(--violet);
   border-radius:999px; padding:7px 13px; font-size:13px; }
 form { display:flex; gap:8px; padding:10px 12px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:rgba(7,10,20,.85); }
 input { flex:1; min-width:0; padding:13px 14px; border-radius:14px; border:1px solid var(--line); background:#0c1222; color:var(--ink); font-size:16px; outline:none; }
 input:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(34,211,238,.15); }
 form button { padding:0 18px; border-radius:14px; border:0; background: linear-gradient(135deg, var(--cyan), var(--violet)); color:#06101f; font-weight:700; font-size:15px; }
 form button:disabled { opacity:.5; }
</style></head>
<body>
<header>
 <div class="orb" id="orb"></div>
 <div class="title">Jarvis<small>Sunny ji ke liye · sirf aapki permission se</small></div>
 <div class="status"><span class="dot" id="dot"></span><span id="state">connecting</span></div>
</header>
<div id="banner"></div>
<div id="log"></div>
<div class="quick">
 <button onclick="send('/plan')">/plan</button>
 <button onclick="send('/tasks')">Tasks</button>
 <button onclick="send('/prefs')">Settings</button>
 <button onclick="send('/help')">Help</button>
 <button onclick="send('/stop')">Stop tools</button>
</div>
<form id="f"><input id="q" autocomplete="off" placeholder="Jarvis se baat karein…"><button id="go">Bhejo</button></form>
<script>
const params = new URLSearchParams(location.search);
if (params.get("token")) { sessionStorage.setItem("jarvisToken", params.get("token")); history.replaceState(null, "", "/"); }
const token = sessionStorage.getItem("jarvisToken") || "";
const log = document.getElementById("log"), orb = document.getElementById("orb"), go = document.getElementById("go");
const dot = document.getElementById("dot"), state = document.getElementById("state"), banner = document.getElementById("banner");

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function scroll() { log.scrollTop = log.scrollHeight; }
function row(kind, node) {
  const r = el("div", "row " + kind);
  const wrap = el("div", kind === "you" ? "" : "");
  if (kind !== "you") wrap.appendChild(el("div", "label", kind === "err" ? "system" : "Jarvis"));
  wrap.appendChild(node);
  r.appendChild(wrap); log.appendChild(r); scroll(); return r;
}
function bubble(text, kind) { return row(kind, el("div", "bubble", text)); }
function typing() { const b = el("div", "bubble"); const t = el("div", "typing"); t.append(el("span"), el("span"), el("span")); b.appendChild(t); return row("jarvis", b); }

function taskCard(title, rows) {
  const c = el("div", "card"); c.appendChild(el("h4", null, title));
  if (!rows.length) { c.appendChild(el("div", "empty", "Abhi kuch nahi. Sab clear hai ✨")); return c; }
  for (const t of rows) {
    const line = el("div", "task" + (t.late ? " late" : ""));
    const body = el("div", "t", t.title);
    if (t.due) body.appendChild(el("div", "d", "⏰ " + t.due));
    line.appendChild(body);
    if (t.id !== undefined) { const b = el("button", "chip", "Done"); b.onclick = () => send("/task done " + t.id); line.appendChild(b); }
    c.appendChild(line);
  }
  return c;
}
function render(data) {
  if (data.error) return bubble(data.error, "err");
  if (data.reply !== undefined) return bubble(data.reply, "jarvis");
  const r = data.result || {};
  if (r.approval_required) {
    const c = el("div", "card"); c.appendChild(el("h4", null, "Confirm karein?"));
    const q = (r.requested_action && r.requested_action.arguments && r.requested_action.arguments.question) || "";
    c.appendChild(el("div", "task", q));
    if (r.notice) c.appendChild(el("div", "d", r.notice));
    const ok = el("button", "chip", "Confirm"); ok.onclick = () => send("/confirm " + r.approval_token);
    c.appendChild(ok);
    return row("jarvis", c);
  }
  if (r.reply !== undefined) return bubble("☁ " + (r.source || "Cloud") + "\\n" + r.reply, "jarvis");
  if (r.success === false && r.error) return bubble(r.error + (r.hint ? "\\n\\n" + r.hint : ""), "err");
  if (Array.isArray(r.tasks)) {
    return row("jarvis", taskCard("Open tasks", r.tasks.map(t => ({id: t.id, title: t.title, due: t.due}))));
  }
  if (Array.isArray(r.overdue)) {
    const c = el("div", "card"); c.appendChild(el("h4", null, "Plan · " + r.date));
    const sections = [["Overdue", r.overdue, true], ["Aaj", r.today, false], ["Kabhi bhi", r.undated, false]];
    for (const [name, list, late] of sections) {
      if (!list.length) continue;
      c.appendChild(el("div", "label", name));
      for (const t of list) {
        const line = el("div", "task" + (late ? " late" : ""));
        const body = el("div", "t", t.title); if (t.due) body.appendChild(el("div", "d", "⏰ " + t.due));
        const b = el("button", "chip", "Done"); b.onclick = () => send("/task done " + t.id);
        line.appendChild(body); line.appendChild(b); c.appendChild(line);
      }
    }
    if (!r.overdue.length && !r.today.length && !r.undated.length) c.appendChild(el("div", "empty", "Aaj ke liye sab clear hai ✨"));
    return row("jarvis", c);
  }
  if (r.preferences) {
    const p = r.preferences, c = el("div", "card"); c.appendChild(el("h4", null, "Settings"));
    c.appendChild(el("div", "task", "Naam: " + p.address));
    c.appendChild(el("div", "task", "Voice: " + (p.voice.enabled ? "on" : "off") + " · pitch " + p.voice.pitch + " · rate " + p.voice.rate));
    return row("jarvis", c);
  }
  if (r.task_id !== undefined) return bubble("Task save ho gaya: " + r.title + (r.due ? " (⏰ " + r.due + ")" : ""), "jarvis");
  if (r.done_task_id !== undefined) return bubble("Task #" + r.done_task_id + " complete ✔", "jarvis");
  if (r.changed) return bubble("Setting update: " + r.changed, "jarvis");
  const c = el("div", "card"); c.appendChild(el("h4", null, "Result")); const pre = el("pre", null, JSON.stringify(r, null, 2)); c.appendChild(pre);
  return row("jarvis", c);
}
function setBusy(b) { orb.classList.toggle("busy", b); go.disabled = b; }
async function call(line) {
  const r = await fetch("/api/command", { method: "POST",
    headers: {"Content-Type": "application/json", "X-Jarvis-Token": token}, body: JSON.stringify({line}) });
  const data = await r.json().catch(() => ({error: "Bad response from Jarvis."}));
  if (!r.ok && data.error === undefined) data.error = "HTTP " + r.status;
  return data;
}
async function send(line) {
  bubble(line, "you");
  const wait = typing(); setBusy(true);
  try { const data = await call(line); wait.remove(); render(data); }
  catch (e) { wait.remove(); bubble("Connection nahi ho paaya. Termux mein web server check karein.", "err"); }
  finally { setBusy(false); refreshBanner(); }
}
async function refreshBanner() {
  try {
    const data = await call("/plan"); const r = data.result || {};
    const due = [...(r.overdue || []), ...(r.today || [])];
    if (due.length) { banner.style.display = "block"; banner.textContent = "⏰ Yaad dilaun: " + due.map(t => t.title).join(" · "); }
    else banner.style.display = "none";
  } catch (e) {}
}
document.getElementById("f").addEventListener("submit", (e) => {
  e.preventDefault(); const q = document.getElementById("q"); const line = q.value.trim();
  if (line && !go.disabled) { q.value = ""; send(line); }
});
if (!token) { dot.classList.add("off"); state.textContent = "no token"; bubble("Token missing. Termux mein print hua link is phone ke browser mein kholiye.", "err"); }
else { state.textContent = "online"; bubble("Namaste Sunny ji 👋 Main Jarvis hoon. Aaj kya plan karein? /help se commands dekh sakte hain.", "jarvis"); refreshBanner(); setInterval(refreshBanner, 5 * 60 * 1000); }
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
