#!/usr/bin/env python3
"""Jarvis web dashboard — Iron Man style HUD, local-only.

Runs on 127.0.0.1 (never exposed to the network) with zero dependencies:
Python stdlib http.server only. Open http://127.0.0.1:8787 on the phone.

Pages/APIs:
    GET  /            -> HUD (chat + status + quick controls)
    GET  /api/status  -> lanes, memory, tools, battery
    POST /api/chat    -> {"text": "..."} -> Jarvis brain reply
    POST /api/tool    -> {"name": "...", "args": {...}} (allowlisted tools)
    POST /api/update  -> background self-update (jarvis_update.sh)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

HOST = "127.0.0.1"
PORT = int(os.getenv("NOVA_DASHBOARD_PORT", "8787"))
MAX_BODY = 20_000

# Tools the web UI may trigger directly. Local, safe, no money/no messaging.
WEB_TOOLS = {"phone_torch", "phone_brightness", "phone_set_volume", "phone_open"}


def _lane_ok(port: int) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{port}/v1/models", timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def _unwrap(result: dict) -> dict:
    content = result.get("result")
    if isinstance(content, dict) and isinstance(content.get("content"), dict):
        return content["content"]
    if isinstance(content, dict):
        return content
    return result


def api_status() -> dict:
    from core.conversation import summarize_load
    from core.tool_bridge import build_registry
    status = {
        "success": True,
        "fast_lane": _lane_ok(8081),
        "deep_lane": _lane_ok(8080),
        "memory": summarize_load(),
    }
    try:
        status["tools"] = len(build_registry().names())
    except Exception:
        status["tools"] = 0
    try:
        registry = build_registry()
        battery = _unwrap(registry.execute("phone_battery", {}))
        data = battery.get("data") if isinstance(battery.get("data"), dict) else {}
        status["battery"] = data.get("percentage")
    except Exception:
        status["battery"] = None
    return status


def api_chat(text: str) -> dict:
    from core.jarvis_brain import respond
    from core.conversation import add as history_add

    result = respond(text)
    if result.get("success"):
        reply = str(result.get("reply") or "").strip()
        history_add("user", text)
        history_add("assistant", reply)
        return {"success": True, "reply": reply, "via": result.get("via", "local")}
    return {"success": False, "error": result.get("error", "kuch gadbad ho gayi")}


def api_tool(name: str, args: dict) -> dict:
    if name not in WEB_TOOLS:
        return {"success": False, "error": f"Web se '{name}' allowed nahi hai."}
    from core.tool_bridge import build_registry
    try:
        return _unwrap(build_registry().execute(name, dict(args or {})))
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def api_update() -> dict:
    """Self-update in the background so the request returns immediately."""
    script = ROOT / "automation" / "jarvis_update.sh"
    if not script.is_file():
        return {"success": False, "error": "jarvis_update.sh nahi mila."}

    def _run():
        try:
            subprocess.run(
                ["bash", str(script)], cwd=str(ROOT), timeout=900,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()
    return {"success": True, "started": True, "note": "Background me chal raha hai - thodi der me naya version active."}


PAGE = """<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>J.A.R.V.I.S.</title>
<style>
:root{--cy:#22d3ee;--bg:#05070d;--card:#0b101c;--tx:#dbeafe;--dim:#64748b}
*{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(1200px 600px at 50% -10%,#0c2033 0%,var(--bg) 60%);color:var(--tx);font-family:system-ui,sans-serif;min-height:100vh}
header{display:flex;align-items:center;justify-content:center;gap:14px;padding:18px 12px 8px}
.reactor{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle,#e0faff 0%,var(--cy) 45%,#0e7490 70%,transparent 72%);box-shadow:0 0 18px var(--cy);animation:pulse 2.2s infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 12px var(--cy)}50%{box-shadow:0 0 30px var(--cy)}}
h1{font-size:22px;letter-spacing:6px;color:var(--cy);text-shadow:0 0 12px rgba(34,211,238,.5)}
.sub{text-align:center;color:var(--dim);font-size:12px;letter-spacing:2px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:0 14px;max-width:760px;margin:0 auto}
.card{background:var(--card);border:1px solid #16233a;border-radius:14px;padding:12px 14px}
.card .k{font-size:11px;color:var(--dim);letter-spacing:1px}
.card .v{font-size:20px;font-weight:700;color:var(--cy);margin-top:2px}
.on{color:#34d399}.off{color:#f87171}
.chat{max-width:760px;margin:14px auto;padding:0 14px;display:flex;flex-direction:column;gap:8px;height:44vh;min-height:260px;overflow-y:auto}
.msg{max-width:86%;padding:10px 14px;border-radius:14px;line-height:1.45;font-size:15px;white-space:pre-wrap;word-break:break-word}
.user{align-self:flex-end;background:#0e3a5a;border:1px solid #1d5f8a;border-bottom-right-radius:4px}
.bot{align-self:flex-start;background:var(--card);border:1px solid #16233a;border-bottom-left-radius:4px}
.bot b{color:var(--cy);font-size:11px;display:block;margin-bottom:3px;letter-spacing:1px}
.thinking{color:var(--dim);font-style:italic}
.controls{max-width:760px;margin:0 auto 8px;padding:0 14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
button{background:#0e2033;color:var(--cy);border:1px solid #1d5f8a;border-radius:999px;padding:9px 16px;font-size:13px;cursor:pointer}
button:active{background:#134a70}
button.mic{width:52px;height:52px;border-radius:50%;font-size:20px;padding:0}
button.mic.rec{background:#7f1d1d;border-color:#ef4444;color:#fff;animation:pulse 1s infinite}
form{max-width:760px;margin:0 auto;padding:0 14px 26px;display:flex;gap:8px}
input[type=text]{flex:1;background:var(--card);border:1px solid #16233a;border-radius:12px;padding:13px 16px;color:var(--tx);font-size:15px;outline:none}
input[type=text]:focus{border-color:var(--cy)}
.tog{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dim)}
</style>
</head>
<body>
<header><div class="reactor"></div><h1>J.A.R.V.I.S.</h1></header>
<div class="sub">JUST A RATHER VERY INTELLIGENT SYSTEM &mdash; BOSS KA APNA</div>

<div class="grid">
  <div class="card"><div class="k">THINKING LANE</div><div class="v" id="lane">...</div></div>
  <div class="card"><div class="k">BATTERY</div><div class="v" id="bat">...</div></div>
  <div class="card"><div class="k">TOOLS</div><div class="v" id="tools">...</div></div>
  <div class="card"><div class="k">MEMORY</div><div class="v" id="mem">...</div></div>
</div>

<div class="controls">
  <button onclick="quick('torch jala do')">&#128161; TORCH ON</button>
  <button onclick="quick('torch band karo')">&#128161; TORCH OFF</button>
  <button onclick="quick('aaj ki khabar batao')">&#128240; NEWS</button>
  <button onclick="quick('kitne baje hain')">&#9200; TIME</button>
  <button onclick="doUpdate()">&#128260; UPDATE</button>
  <label class="tog"><input type="checkbox" id="tts" checked> &#128266; Voice</label>
</div>

<div class="chat" id="chat"></div>

<form onsubmit="return sendMsg(event)">
  <button type="button" class="mic" id="mic" onclick="mic()">&#127908;</button>
  <input type="text" id="box" placeholder="Bolo Boss... (Hinglish chalega)" autocomplete="off" autofocus>
  <button type="submit">&#10148;</button>
</form>

<script>
const chat=document.getElementById('chat'),box=document.getElementById('box');
function add(cls,html){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html;chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d}
function speak(t){if(!document.getElementById('tts').checked)return;try{const u=new SpeechSynthesisUtterance(t.replace(/[*_`#]/g,''));u.lang='hi-IN';speechSynthesis.speak(u)}catch(e){}}
async function status(){try{const s=await(await fetch('/api/status')).json();
 document.getElementById('lane').innerHTML=s.fast_lane?'<span class="on">ONLINE</span>':'<span class="off">OFFLINE</span>';
 document.getElementById('bat').textContent=s.battery!=null?s.battery+'%':'--';
 document.getElementById('tools').textContent=s.tools;
 document.getElementById('mem').textContent=s.memory.turns_stored+' turns';}catch(e){}}
async function send(text){const t=add('user',esc(text));const w=add('bot thinking','<b>JARVIS</b>soch raha hu...');
 try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
 const j=await r.json();w.remove();
 if(j.success){add('bot','<b>JARVIS ['+esc(j.via)+']</b>'+esc(j.reply));speak(j.reply)}else{add('bot','<b>JARVIS</b>'+esc(j.error||'error'))}
 }catch(e){w.remove();add('bot','<b>JARVIS</b>server se connection toot gaya')}}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function sendMsg(e){e.preventDefault();const v=box.value.trim();if(!v)return;box.value='';send(v);return false}
function quick(t){send(t)}
async function doUpdate(){add('bot','<b>JARVIS</b>Update background me shuru kar raha hu...');
 try{await fetch('/api/update',{method:'POST'});}catch(e){}}
let rec=null,recOn=false;
function mic(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){add('bot','<b>JARVIS</b>Is browser me mic support nahi - type karo.');return}
 if(recOn){rec.stop();return}
 rec=new SR();rec.lang='hi-IN';rec.interimResults=false;
 rec.onstart=()=>{recOn=true;document.getElementById('mic').classList.add('rec')};
 rec.onend=()=>{recOn=false;document.getElementById('mic').classList.remove('rec')};
 rec.onresult=e=>{const t=e.results[0][0].transcript;if(t)send(t)};
 rec.start()}
status();setInterval(status,6000);
add('bot','<b>JARVIS</b>Boss, dashboard online. Bolo kya kaam karna hai?');
</script>
</body>
</html>"""


class JarvisHUD(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _json(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/index"):
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/status":
            self._json(api_status())
        else:
            self._json({"success": False, "error": "not found"}, 404)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                return self._json({"success": False, "error": "bad request size"}, 400)
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._json({"success": False, "error": "invalid json"}, 400)

        if self.path == "/api/chat":
            text = str(data.get("text") or "").strip()[:1000]
            if not text:
                return self._json({"success": False, "error": "khaali message"}, 400)
            return self._json(api_chat(text))
        if self.path == "/api/tool":
            return self._json(api_tool(str(data.get("name") or ""), data.get("args") or {}))
        if self.path == "/api/update":
            return self._json(api_update())
        return self._json({"success": False, "error": "not found"}, 404)


def create_server(port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((HOST, port), JarvisHUD)


def main() -> int:
    server = create_server(PORT)
    url = f"http://{HOST}:{server.server_address[1]}"
    print(f"JARVIS HUD online: {url}")
    print("Band karne ke liye Ctrl+C dabao.")
    # Phone pe browser khol do (best effort).
    try:
        opener = "/system/bin/am"
        if Path(opener).exists():
            subprocess.run(
                [opener, "start", "-a", "android.intent.action.VIEW", "-d", url],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            subprocess.run(["termux-open-url", url], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=False)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nHUD band.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
