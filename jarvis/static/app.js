/* JARVIS dashboard — vanilla JS, no build step, works offline after first load. */
(() => {
  "use strict";

  const LS = { token: "jarvis.token", voice: "jarvis.voice", chat: "jarvis.chat", tab: "jarvis.tab" };
  const state = {
    token: localStorage.getItem(LS.token) || "",
    voice: localStorage.getItem(LS.voice) === "1",
    chatId: localStorage.getItem(LS.chat) || "",
    tab: localStorage.getItem(LS.tab) || "chat",
    status: null,
    settings: null,
    streaming: false,
    abort: null,
    pendingApproval: null,   // {id, tool, args, message, chatId}
    lastReply: "",
    speaking: false,
    recognition: null,
    listening: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $("#view");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls = "icon") => `<svg class="${cls}"><use href="#i-${name}"></use></svg>`;

  /* ------------------------------------------------------------------ utils */

  function toast(message, kind = "", ms = 3200) {
    const node = document.createElement("div");
    node.className = "toast " + kind;
    node.innerHTML = `${icon(kind === "bad" ? "x" : "check")}<span>${esc(message)}</span>`;
    $("#toasts").appendChild(node);
    requestAnimationFrame(() => node.classList.add("in"));
    setTimeout(() => { node.classList.remove("in"); setTimeout(() => node.remove(), 220); }, ms);
  }

  function ago(ts) {
    if (!ts) return "";
    const secs = Math.max(0, Date.now() / 1000 - ts);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  function hhmm(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /* markdown: escape first, then a tiny whitelist of tags */
  function md(text) {
    const blocks = [];
    let src = esc(text || "").replace(/```([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre><code>${code.replace(/^\w*\n/, "")}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
    src = src
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/^(#{1,4})\s+(.+)$/gm, (_, h, t) => `<h${Math.min(h.length + 2, 4)}>${t}</h${Math.min(h.length + 2, 4)}>`);

    src = src.split(/\n{2,}/).map((chunk) => {
      if (/^\u0000\d+\u0000$/.test(chunk.trim())) return chunk;
      if (/^\s*[-*]\s+/m.test(chunk)) {
        const items = chunk.split("\n").filter((l) => l.trim()).map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`);
        return `<ul>${items.join("")}</ul>`;
      }
      if (/^\s*\d+[.)]\s+/m.test(chunk)) {
        const items = chunk.split("\n").filter((l) => l.trim()).map((l) => `<li>${l.replace(/^\s*\d+[.)]\s+/, "")}</li>`);
        return `<ol>${items.join("")}</ol>`;
      }
      return `<p>${chunk.replace(/\n/g, "<br>")}</p>`;
    }).join("");

    return src.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
  }

  /* -------------------------------------------------------------------- api */

  class AuthError extends Error {}

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (state.token) headers["x-jarvis-token"] = state.token;
    if (options.body && typeof options.body !== "string") {
      headers["content-type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    let response;
    try {
      response = await fetch(path, Object.assign({}, options, { headers }));
    } catch (err) {
      throw new Error("network: backend se connection nahi bana");
    }
    if (response.status === 401) throw new AuthError("token required");
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json().catch(() => ({})) : {};
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }

  /* ------------------------------------------------------------------- gate */

  function saveToken(value) {
    state.token = value.trim();
    if (state.token) localStorage.setItem(LS.token, state.token);
    else localStorage.removeItem(LS.token);
  }

  function renderGate(message) {
    view.innerHTML = `
      <div class="gate">
        <span class="core"></span>
        <h1>JARVIS</h1>
        <p>${esc(message || "Dashboard kholne ke liye access token chahiye. Token startup line mein print hota hai, ya <code>~/.openjarvis/dashboard.token</code> file mein hai.")}</p>
        <form id="gateForm">
          <label class="field"><span>Access token</span>
            <input id="gateToken" type="password" autocomplete="current-password" spellcheck="false" placeholder="paste token" value="">
          </label>
          <button class="btn primary btn-block" type="submit">${icon("shield")} Unlock</button>
        </form>
        <p class="small" style="margin-top:14px">Phone par: <code>cat ~/.openjarvis/dashboard.token</code></p>
      </div>`;
    $("#gateForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      saveToken($("#gateToken").value);
      try {
        await api("/api/status");
        await boot();
        toast("Unlocked", "ok");
      } catch (err) {
        renderGate(err instanceof AuthError ? "Token galat hai — dobara try karo." : err.message);
      }
    });
  }

  /* ------------------------------------------------------------------- boot */

  async function boot() {
    try {
      state.status = await api("/api/status");
    } catch (err) {
      if (err instanceof AuthError) { renderGate(); return; }
      throw err;
    }
    $("#assistantName").textContent = state.status.assistant || "JARVIS";
    paintBrand();
    document.body.classList.add("ready");
    render();
    refreshApprovals();
    setInterval(() => { if (document.visibilityState === "visible") refreshApprovals(true); }, 20000);
  }

  function paintBrand() {
    const st = state.status;
    if (!st) return;
    const p = st.provider || {};
    const label = p.active ? `${p.active}${p.model ? " · " + p.model : ""}` : "offline brain";
    $("#brandSub").textContent = `${label} · ${st.tools} tools`;
  }

  /* ---------------------------------------------------------------- routing */

  function switchTab(tab) {
    state.tab = tab;
    localStorage.setItem(LS.tab, tab);
    $$("#tabs .tab").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.tab === tab));
    render();
  }

  function render() {
    if (state.streaming && state.tab === "chat") return;
    if (state.tab === "chat") renderChat();
    else if (state.tab === "tasks") renderTasks();
    else if (state.tab === "memory") renderMemory();
    else if (state.tab === "tools") renderTools();
    else renderSettings();
    $$("#tabs .tab").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.tab === state.tab));
  }

  /* ------------------------------------------------------------------- chat */

  const SUGGESTIONS = [
    "Namaste, tum kaun ho?",
    "Aaj ka plan banao aur yaad rakho",
    "Mera naam yaad rakho: <your name>",
    "Phone ka battery kitna hai?",
    "Is project ka git status batao",
    "Python se 12 ka factorial nikaalo",
  ];

  function renderChat() {
    view.innerHTML = `
      <div class="chat">
        <div class="chat-status">
          <span class="dot ${state.status && state.status.provider && state.status.provider.active ? "" : "off"}"></span>
          <span id="chatProv">${state.status && state.status.provider && state.status.provider.active
            ? esc(state.status.provider.active + (state.status.provider.model ? " · " + state.status.provider.model : ""))
            : "offline mode"}</span>
          <span class="spacer"></span>
          <button class="chip" id="btnChats">Chats</button>
          <button class="chip" id="btnNewChat">${icon("plus")} New</button>
        </div>
        <div class="chat-log" id="chatLog"></div>
        <form class="composer" id="composer">
          <div class="inner">
            <button type="button" class="mic ${state.listening ? "is-live" : ""}" id="btnMic" aria-label="Voice input">${icon(state.listening ? "stop" : "mic")}</button>
            <textarea id="input" rows="1" placeholder="Kuch bhi poocho…" autocomplete="off"></textarea>
            <button type="submit" class="send" id="btnSend" aria-label="Send">${icon("send")}</button>
          </div>
          <div class="hint"><span id="charHint">Enter = send · Shift+Enter = new line</span><span id="tokenHint"></span></div>
        </form>
      </div>`;

    const log = $("#chatLog");

    if (state.chatId) {
      log.innerHTML = `<div class="msg bot"><div class="avatar"></div><div class="body"><span class="typing"><i></i><i></i><i></i></span></div></div>`;
      api(`/api/chats/${encodeURIComponent(state.chatId)}`).then((payload) => {
        log.innerHTML = "";
        if (!payload.messages || !payload.messages.length) return paintWelcome(log);
        payload.messages.forEach((msg) => appendMessage(log, msg.role, msg.content, msg.meta));
        scrollLog(true);
      }).catch(() => { log.innerHTML = ""; paintWelcome(log); });
    } else {
      paintWelcome(log);
    }

    $("#btnNewChat").addEventListener("click", () => {
      state.chatId = "";
      localStorage.removeItem(LS.chat);
      paintWelcome(log);
    });
    $("#btnChats").addEventListener("click", openChatsSheet);

    const input = $("#input");
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 130) + "px";
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("#composer").requestSubmit(); }
    });
    $("#composer").addEventListener("submit", (event) => {
      event.preventDefault();
      send(input.value);
    });
    $("#btnMic").addEventListener("click", toggleMic);
  }

  function paintWelcome(log) {
    log.classList.add("is-empty");
    log.innerHTML = `
      <div class="welcome">
        <span class="core"></span>
        <h1>${esc((state.status && state.status.assistant) || "JARVIS")}</h1>
        <p>${esc((state.status && state.status.owner) ? `${state.status.owner} ke liye` : "Aapka local assistant")} — Hindi, Hinglish ya English mein baat karo. Yaad rakhta hoon, tools chalata hoon.</p>
        <div class="suggestions">
          ${SUGGESTIONS.map((text) => `<button class="suggestion">${esc(text)}</button>`).join("")}
        </div>
      </div>`;
    $$(".suggestion", log).forEach((btn) => btn.addEventListener("click", () => send(btn.textContent)));
  }

  function appendMessage(log, role, text, meta) {
    log.classList.remove("is-empty");
    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "bot");
    if (role === "user") {
      wrap.innerHTML = `<div class="bubble">${esc(text)}</div>`;
    } else {
      const events = (meta && meta.tools) || [];
      wrap.innerHTML = `<div class="avatar"></div><div class="body">
        <div class="bubble">${md(text)}</div>
        ${events.length ? events.map((ev) => `<div class="tool-event">${icon("shield")} <code>${esc(ev.tool || ev.name || "tool")}</code> ${esc(ev.summary || ev.status || "")}</div>`).join("") : ""}
        ${meta && meta.error ? `<div class="tool-event" style="border-color:rgba(255,182,72,.4);color:var(--warn)">${esc(meta.error)}</div>` : ""}
        <div class="msg-meta">
          <span>${esc((meta && meta.provider) || "brain")}${meta && meta.latency_ms ? " · " + Math.round(meta.latency_ms / 100) / 10 + "s" : ""}</span>
          <span class="msg-actions"><button data-act="speak">${icon("volume")} speak</button><button data-act="copy">copy</button></span>
        </div>
      </div>`;
      $('[data-act="speak"]', wrap).addEventListener("click", () => speak(text));
      $('[data-act="copy"]', wrap).addEventListener("click", () => copy(text));
    }
    log.appendChild(wrap);
    scrollLog();
    return wrap;
  }

  function scrollLog(instant) {
    const log = $("#chatLog");
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: instant ? "auto" : "smooth" });
  }

  function typingNode() {
    const node = document.createElement("div");
    node.className = "msg bot";
    node.innerHTML = `<div class="avatar"></div><div class="body"><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`;
    return node;
  }

  async function send(text, options = {}) {
    text = (text || "").trim();
    if (!text || state.streaming) return;
    const log = $("#chatLog");
    const input = $("#input");
    if (input) { input.value = ""; input.style.height = "auto"; }
    log.classList.remove("is-empty");
    appendMessage(log, "user", text);

    const bubbleWrap = typingNode();
    log.appendChild(bubbleWrap);
    scrollLog();
    const bubble = $(".bubble", bubbleWrap);
    bubble.innerHTML = "";

    state.streaming = true;
    const controller = new AbortController();
    state.abort = controller;
    let assistant = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-jarvis-token": state.token },
        body: JSON.stringify({ message: text, chat_id: state.chatId || undefined, approval_id: options.approvalId }),
        signal: controller.signal,
      });
      if (response.status === 401) { renderGate("Session token reject ho gaya."); return; }
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = null;
      while (true) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === "start" && event.chat_id) {
            state.chatId = event.chat_id;
            localStorage.setItem(LS.chat, state.chatId);
          } else if (event.type === "delta") {
            assistant += event.text || "";
            bubble.innerHTML = md(assistant);
            scrollLog();
          } else if (event.type === "done") {
            done = event;
          } else if (event.type === "error") {
            throw new Error(event.error || "stream error");
          }
        }
      }
      if (!done) throw new Error("connection band ho gaya");

      bubbleWrap.remove();
      const meta = {
        provider: done.provider, latency_ms: done.latency_ms,
        tools: done.tool_events, error: done.error,
      };
      const finalText = done.text || assistant;
      if (finalText) {
        appendMessage(log, "assistant", finalText, meta);
        state.lastReply = finalText;
      } else if (done.error) {
        const node = document.createElement("div");
        node.className = "msg bot";
        node.innerHTML = `<div class="avatar"></div><div class="body"><div class="bubble error">${esc(done.error)}</div></div>`;
        log.appendChild(node);
      } else {
        toast("Koi reply nahi mila", "bad");
      }

      if (done.approvals && done.approvals.length) {
        showApprovalBanner(done.approvals[0], text);
      } else {
        state.pendingApproval = null;
      }
      if (state.voice && finalText) speak(finalText);
      if (state.tab === "chat") refreshStatusQuietly();
    } catch (err) {
      bubbleWrap.remove();
      if (err.name !== "AbortError") {
        const node = document.createElement("div");
        node.className = "msg bot";
        node.innerHTML = `<div class="avatar"></div><div class="body"><div class="bubble error">${esc(err.message)}</div></div>`;
        log.appendChild(node);
        scrollLog();
      }
    } finally {
      state.streaming = false;
      state.abort = null;
    }
  }

  async function refreshStatusQuietly() {
    try {
      state.status = await api("/api/status");
      paintBrand();
      const prov = $("#chatProv");
      if (prov) prov.textContent = state.status.provider.active
        ? state.status.provider.active + (state.status.provider.model ? " · " + state.status.provider.model : "")
        : "offline mode";
    } catch { /* ignore */ }
  }

  function showApprovalBanner(approval, message) {
    let banner = $("#approvalBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "approvalBanner";
      banner.className = "approval";
      banner.style.margin = "10px 12px 0";
      $("#chatLog").parentElement.insertBefore(banner, $("#chatLog").nextSibling);
    }
    state.pendingApproval = { id: approval.id, tool: approval.tool, args: approval.arguments, message, chatId: state.chatId };
    banner.innerHTML = `
      <strong>${icon("shield")} Approval chahiye: ${esc(approval.tool)}</strong>
      <pre>${esc(JSON.stringify(approval.arguments || {}, null, 2))}</pre>
      <div class="item-actions">
        <button class="btn tiny primary" id="apYes">${icon("check")} Approve & run</button>
        <button class="btn tiny ghost" id="apNo">${icon("x")} Deny</button>
      </div>`;
    $("#apYes").onclick = async () => {
      const pending = state.pendingApproval;
      try {
        await api(`/api/approvals/${pending.id}/approve`, { method: "POST", body: {} });
        banner.remove();
        state.pendingApproval = null;
        toast("Approved — dobara chal raha hoon", "ok");
        send(pending.message, { approvalId: pending.id });
      } catch (err) { toast(err.message, "bad"); }
    };
    $("#apNo").onclick = async () => {
      const pending = state.pendingApproval;
      try { await api(`/api/approvals/${pending.id}/deny`, { method: "POST", body: {} }); } catch { /* ignore */ }
      banner.remove();
      state.pendingApproval = null;
      toast("Denied");
    };
  }

  async function refreshApprovals(quiet) {
    try {
      const payload = await api("/api/approvals");
      const list = payload.approvals || [];
      const badge = $("#approvalBadge");
      if (badge) badge.textContent = list.length ? String(list.length) : "";
      if (list.length && state.tab === "chat" && !quiet) {
        /* first approval surfaces as a banner after the turn; nothing to do here */
      }
    } catch { /* offline */ }
  }

  function openChatsSheet() {
    api("/api/chats").then((payload) => {
      const chats = payload.chats || [];
      const body = chats.length ? chats.map((chat) => `
        <div class="item">
          <div class="item-head">
            <div style="min-width:0">
              <div class="item-title">${esc(chat.title || "Chat")}</div>
              <div class="item-sub">${chat.messages} messages · ${ago(chat.updated)}</div>
            </div>
            <button class="btn tiny ghost" data-del="${esc(chat.id)}" aria-label="Delete">${icon("trash")}</button>
          </div>
          <div class="item-actions"><button class="btn tiny" data-open="${esc(chat.id)}">${icon("chevron")} Open</button></div>
        </div>`).join("") : `<div class="empty">${icon("chat")}Abhi koi saved chat nahi.</div>`;
      openSheet("Chats", body);
      $$("[data-open]").forEach((btn) => btn.addEventListener("click", () => {
        state.chatId = btn.dataset.open;
        localStorage.setItem(LS.chat, state.chatId);
        closeSheet();
        renderChat();
      }));
      $$("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
        try {
          await api(`/api/chats/${btn.dataset.del}`, { method: "DELETE" });
          if (state.chatId === btn.dataset.del) { state.chatId = ""; localStorage.removeItem(LS.chat); }
          toast("Chat deleted", "ok");
          closeSheet();
          renderChat();
        } catch (err) { toast(err.message, "bad"); }
      }));
    }).catch((err) => toast(err.message, "bad"));
  }

  /* ---------------------------------------------------------------- memory */

  async function renderMemory() {
    view.innerHTML = `<div class="screen">
      <h1>Memory</h1>
      <p class="lead">Jo cheezein JARVIS ko yaad rakhni chahiye — naam, project, decisions. Secrets yahan store nahi hote.</p>
      <div class="card">
        <h2>${icon("plus")} Naya yaad</h2>
        <label class="field"><span>Baat</span><input id="memText" placeholder="Mera naam Sunny hai / project X ka DB Postgres hai"></label>
        <div class="chips" id="memKindChips">
          ${["fact", "preference", "project", "decision", "note"].map((k, i) =>
            `<button class="chip ${i === 0 ? "is-on" : ""}" data-kind="${k}">${k}</button>`).join("")}
        </div>
        <label class="field"><span>Subject (optional)</span><input id="memSubject" placeholder="user / project / task"></label>
        <button class="btn primary btn-block" id="memSave">${icon("check")} Save</button>
      </div>
      <div class="card">
        <h2>${icon("memory")} Saved</h2>
        <input id="memSearch" placeholder="Search memory…" autocomplete="off">
        <div id="memStats" class="muted small" style="margin-top:6px"></div>
      </div>
      <div id="memList"></div>
    </div>`;

    let kind = "fact";
    $$("#memKindChips .chip").forEach((chip) => chip.addEventListener("click", () => {
      kind = chip.dataset.kind;
      $$("#memKindChips .chip").forEach((c) => c.classList.toggle("is-on", c === chip));
    }));
    $("#memSave").addEventListener("click", async () => {
      const text = $("#memText").value.trim();
      if (!text) return toast("Kuch likho pehle", "bad");
      try {
        await api("/api/memory", { method: "POST", body: { text, kind, subject: $("#memSubject").value.trim() } });
        $("#memText").value = ""; $("#memSubject").value = "";
        toast("Yaad rakh liya", "ok");
        loadMemories();
      } catch (err) { toast(err.message, "bad"); }
    });

    let debounce;
    $("#memSearch").addEventListener("input", (event) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadMemories(event.target.value.trim()), 220);
    });

    async function loadMemories(query = "") {
      try {
        const payload = await api("/api/memory" + (query ? `?q=${encodeURIComponent(query)}` : ""));
        const rows = payload.memories || [];
        $("#memStats").textContent = `${payload.stats.total} total · fts ${payload.stats.fts ? "on" : "off"}`;
        const container = $("#memList");
        if (!rows.length) {
          container.innerHTML = `<div class="empty">${icon("memory")}${query ? "Is search se kuch nahi mila." : "Abhi memory khaali hai."}</div>`;
          return;
        }
        container.innerHTML = rows.map((row) => `
          <div class="item">
            <div class="item-head">
              <div style="min-width:0">
                <div class="item-title">${esc(row.text)}</div>
                <div class="item-sub">
                  <span class="pill">${esc(row.kind)}</span>
                  ${row.subject ? `<span class="pill">${esc(row.subject)}</span>` : ""}
                  <span class="pill ${row.confidence >= 0.8 ? "ok" : "warn"}">conf ${row.confidence}</span>
                  <span class="pill">${esc(row.source)}</span>
                  · ${ago(row.updated)}
                </div>
              </div>
              <button class="btn tiny ghost" data-del="${row.id}" aria-label="Forget">${icon("trash")}</button>
            </div>
            <div class="item-actions"><button class="btn tiny ghost" data-edit="${row.id}">Edit</button></div>
          </div>`).join("");
        $$("[data-del]", container).forEach((btn) => btn.addEventListener("click", async () => {
          try {
            await api(`/api/memory/${btn.dataset.del}`, { method: "DELETE" });
            toast("Bhool gaya", "ok");
            loadMemories(query);
          } catch (err) { toast(err.message, "bad"); }
        }));
        $$("[data-edit]", container).forEach((btn) => btn.addEventListener("click", async () => {
          const row = rows.find((r) => String(r.id) === btn.dataset.edit);
          const text = prompt("Naya text:", row.text);
          if (text == null) return;
          try {
            await api(`/api/memory/${row.id}/update`, { method: "POST", body: { text } });
            toast("Updated", "ok");
            loadMemories(query);
          } catch (err) { toast(err.message, "bad"); }
        }));
      } catch (err) { toast(err.message, "bad"); }
    }
    loadMemories();
  }

  /* ----------------------------------------------------------------- tasks */

  const TASK_FILTERS = ["ALL", "PENDING", "RUNNING", "PAUSED", "BLOCKED", "DONE", "FAILED", "CANCELLED"];

  async function renderTasks() {
    view.innerHTML = `<div class="screen">
      <h1>Tasks</h1>
      <p class="lead">Lambey kaam steps mein chalte hain. Pause, resume, cancel — crash ke baad queue khud recover hoti hai.</p>
      <div id="approvalsBox"></div>
      <div class="card">
        <h2>${icon("plus")} Naya task</h2>
        <label class="field"><span>Title</span><input id="taskTitle" placeholder="Website deploy karo"></label>
        <label class="field"><span>Goal</span><textarea id="taskGoal" rows="2" placeholder="Kya achieve karna hai, detail mein"></textarea></label>
        <label class="field"><span>Steps (ek line = ek step, optional)</span><textarea id="taskSteps" rows="2" placeholder="Repo check karo&#10;Build chalao&#10;Deploy karo"></textarea></label>
        <button class="btn primary btn-block" id="taskSave">${icon("check")} Queue mein daalo</button>
      </div>
      <div class="chips" id="taskFilters">
        ${TASK_FILTERS.map((f, i) => `<button class="chip ${i === 0 ? "is-on" : ""}" data-filter="${f}">${f.toLowerCase()}</button>`).join("")}
      </div>
      <div id="taskList"></div>
    </div>`;

    let filter = "ALL";
    $$("#taskFilters .chip").forEach((chip) => chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      $$("#taskFilters .chip").forEach((c) => c.classList.toggle("is-on", c === chip));
      loadTasks();
    }));

    $("#taskSave").addEventListener("click", async () => {
      const title = $("#taskTitle").value.trim();
      if (!title) return toast("Title chahiye", "bad");
      const steps = $("#taskSteps").value.split("\n").map((s) => s.trim()).filter(Boolean);
      try {
        await api("/api/tasks", {
          method: "POST",
          body: { title, goal: $("#taskGoal").value.trim(), steps },
        });
        $("#taskTitle").value = ""; $("#taskGoal").value = ""; $("#taskSteps").value = "";
        toast("Task queue mein hai", "ok");
        loadTasks();
      } catch (err) { toast(err.message, "bad"); }
    });

    async function loadApprovals() {
      try {
        const payload = await api("/api/approvals");
        const list = payload.approvals || [];
        const box = $("#approvalsBox");
        if (!box) return;
        box.innerHTML = list.length ? `<div class="card">
          <h2>${icon("shield")} Approvals pending (${list.length})</h2>
          ${list.map((row) => `<div class="approval" data-approval="${esc(row.id)}">
            <strong>${esc(row.tool)}</strong> <span class="pill warn">${esc(row.risk || "high")}</span>
            <pre>${esc(JSON.stringify(row.arguments || {}, null, 2))}</pre>
            <div class="item-actions">
              <button class="btn tiny primary" data-approve="${esc(row.id)}">${icon("check")} Approve</button>
              <button class="btn tiny ghost" data-deny="${esc(row.id)}">${icon("x")} Deny</button>
            </div>
          </div>`).join("")}
        </div>` : "";
        $$("[data-approve]", box).forEach((btn) => btn.addEventListener("click", () => decideApproval(btn.dataset.approve, "approve")));
        $$("[data-deny]", box).forEach((btn) => btn.addEventListener("click", () => decideApproval(btn.dataset.deny, "deny")));
      } catch { /* offline */ }
    }

    async function decideApproval(id, action) {
      try {
        await api(`/api/approvals/${id}/${action}`, { method: "POST", body: {} });
        toast(action === "approve" ? "Approved" : "Denied", "ok");
        loadApprovals();
        loadTasks();
      } catch (err) { toast(err.message, "bad"); }
    }

    async function loadTasks() {
      const box = $("#taskList");
      if (!box) return;
      try {
        const payload = await api("/api/tasks" + (filter === "ALL" ? "" : `?status=${filter}`));
        const tasks = payload.tasks || [];
        if (!tasks.length) {
          box.innerHTML = `<div class="empty">${icon("tasks")}${filter === "ALL" ? "Koi task nahi. Upar se naya banao, ya chat mein bolo." : "Is filter mein kuch nahi."}</div>`;
          return;
        }
        box.innerHTML = tasks.map((task) => {
          const statusClass = { DONE: "ok", FAILED: "bad", CANCELLED: "bad", BLOCKED: "warn", PAUSED: "warn", RUNNING: "ok" }[task.status] || "";
          return `<div class="item">
            <div class="item-head">
              <div style="min-width:0">
                <div class="item-title">${esc(task.title)}</div>
                <div class="item-sub"><span class="pill ${statusClass}">${esc(task.status)}</span>
                  <span class="pill">${(task.progress && task.progress.done) || 0}/${task.steps.length} steps</span>
                  ${task.attempts ? `<span class="pill">retry ${task.attempts}</span>` : ""}
                  · ${ago(task.updated)}</div>
              </div>
            </div>
            ${task.goal ? `<div class="item-sub" style="margin-top:6px">${esc(task.goal)}</div>` : ""}
            ${task.steps.length ? `<ul class="steps">${task.steps.map((step) => `<li class="${esc(String(step.status || "").toLowerCase())}">
              <span class="tick">${step.status === "done" ? "✓" : step.status === "failed" ? "!" : ""}</span>
              <span>${esc(step.title)}${step.detail ? `<br><span class="muted small">${esc(String(step.detail).slice(0, 180))}</span>` : ""}</span>
            </li>`).join("")}</ul>` : ""}
            ${task.error ? `<div class="item-sub" style="color:var(--danger)">${esc(task.error)}</div>` : ""}
            <div class="progress"><i style="width:${(task.progress && task.progress.percent) || 0}%"></i></div>
            <div class="item-actions">
              ${["PENDING", "PAUSED", "BLOCKED"].includes(task.status) ? `<button class="btn tiny primary" data-act="run" data-id="${esc(task.id)}">${icon("play")} Run</button>` : ""}
              ${task.status === "RUNNING" ? `<button class="btn tiny" data-act="pause" data-id="${esc(task.id)}">${icon("pause")} Pause</button>` : ""}
              ${task.status === "PAUSED" ? `<button class="btn tiny" data-act="resume" data-id="${esc(task.id)}">${icon("play")} Resume</button>` : ""}
              ${["FAILED", "CANCELLED", "DONE"].includes(task.status) ? `<button class="btn tiny" data-act="requeue" data-id="${esc(task.id)}">${icon("refresh")} Requeue</button>` : ""}
              ${["PENDING", "RUNNING", "PAUSED", "BLOCKED"].includes(task.status) ? `<button class="btn tiny danger" data-act="cancel" data-id="${esc(task.id)}">${icon("x")} Cancel</button>` : ""}
            </div>
          </div>`;
        }).join("");
        $$("[data-act]", box).forEach((btn) => btn.addEventListener("click", async () => {
          const action = btn.dataset.act;
          const id = btn.dataset.id;
          btn.disabled = true;
          try {
            await api(`/api/tasks/${id}/${action}`, { method: "POST", body: {} });
            toast(`${action} ok`, "ok");
            loadTasks();
          } catch (err) {
            toast(err.message, "bad");
            btn.disabled = false;
          }
        }));
      } catch (err) { toast(err.message, "bad"); }
    }

    loadApprovals();
    loadTasks();
  }

  /* ----------------------------------------------------------------- tools */

  async function renderTools() {
    view.innerHTML = `<div class="screen">
      <h1>Tools</h1>
      <p class="lead">Jo kaam JARVIS kar sakta hai. LOW risk khud chalta hai, MEDIUM/HIGH tumhari approval ke baad — approval exact arguments se bandha hota hai.</p>
      <div id="toolsList"><div class="empty">${icon("tools")}loading…</div></div>
    </div>`;
    try {
      const payload = await api("/api/tools");
      const tools = payload.tools || [];
      const order = { low: 0, medium: 1, high: 2 };
      tools.sort((a, b) => (order[a.risk] ?? 3) - (order[b.risk] ?? 3));
      $("#toolsList").innerHTML = tools.map((tool) => `
        <div class="item">
          <div class="item-head">
            <div style="min-width:0">
              <div class="item-title">${esc(tool.name)}</div>
              <div class="item-sub">${esc(tool.description)}</div>
            </div>
            <span class="pill ${tool.risk === "low" ? "ok" : tool.risk === "medium" ? "warn" : "bad"}">${esc(tool.risk)}</span>
          </div>
          <div class="item-actions">
            <button class="btn tiny" data-tool="${esc(tool.name)}">Run manually</button>
            ${Object.keys(tool.parameters || {}).length ? `<span class="pill">${esc(Object.keys(tool.parameters).join(", "))}</span>` : ""}
          </div>
        </div>`).join("") || `<div class="empty">No tools</div>`;

      $$("[data-tool]").forEach((btn) => btn.addEventListener("click", () => {
        const tool = tools.find((item) => item.name === btn.dataset.tool);
        const body = `
          <p class="muted small">${esc(tool.description)}</p>
          <label class="field"><span>Arguments (JSON)</span>
            <textarea id="toolArgs" rows="5" spellcheck="false">${esc(JSON.stringify(sampleArgs(tool.parameters), null, 2))}</textarea>
          </label>
          <button class="btn primary btn-block" id="toolRun">${icon("play")} Run ${esc(tool.name)}</button>
          <pre id="toolOut" class="small" style="white-space:pre-wrap;word-break:break-word"></pre>`;
        openSheet(tool.name, body);
        $("#toolRun").addEventListener("click", async () => {
          let args;
          try { args = JSON.parse($("#toolArgs").value || "{}"); } catch { return toast("JSON galat hai", "bad"); }
          const out = $("#toolOut");
          out.textContent = "running…";
          try {
            const result = await api(`/api/tools/${tool.name}`, { method: "POST", body: { arguments: args } });
            out.textContent = JSON.stringify(result, null, 2);
            if (result.approval_required) toast("Approval chahiye — Tasks tab dekho", "bad", 4200);
            else toast(result.ok ? "Done" : "Blocked", result.ok ? "ok" : "bad");
          } catch (err) {
            out.textContent = err.message;
            toast(err.message, "bad");
          }
        });
      }));
    } catch (err) {
      $("#toolsList").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }

  function sampleArgs(parameters) {
    const out = {};
    Object.entries(parameters || {}).forEach(([key, spec]) => {
      const type = (spec && (spec.type || spec.kind)) || "string";
      out[key] = type === "integer" || type === "number" ? 0 : type === "boolean" ? false : "";
    });
    return out;
  }

  /* -------------------------------------------------------------- settings */

  async function renderSettings() {
    view.innerHTML = `<div class="screen"><div class="empty">${icon("settings")}loading…</div></div>`;
    try {
      const [statusPayload, settingsPayload, logsPayload] = await Promise.all([
        api("/api/status"), api("/api/settings"), api("/api/logs").catch(() => ({ events: [] })),
      ]);
      state.status = statusPayload;
      state.settings = settingsPayload.settings;
      paintBrand();
      const st = statusPayload;
      const settings = state.settings;
      const provider = st.provider || {};
      const keys = st.keys_present || {};

      view.innerHTML = `<div class="screen">
        <h1>Setup</h1>
        <p class="lead">Sab kuch phone par local. Keys sirf <code>~/.openjarvis/secrets.env</code> (0600) mein, kabhi chat/log mein nahi.</p>

        <div class="card">
          <h2>${icon("shield")} Brain status</h2>
          <div class="row"><span class="k">Active provider</span><span class="v">${esc(provider.active || "offline")}</span></div>
          <div class="row"><span class="k">Model</span><span class="v">${esc(provider.model || settings.provider.model)}</span></div>
          <div class="row"><span class="k">Chain</span><span class="v">${esc((provider.chain || []).join(" → ") || "none")}</span></div>
          <div class="row"><span class="k">Mode</span><span class="v">${esc(settings.provider.mode)}</span></div>
          <div class="row"><span class="k">Keys present</span><span class="v">${esc(Object.keys(keys).join(", ") || "none")}</span></div>
          <div class="row"><span class="k">Version / uptime</span><span class="v">${esc(st.version)} · ${Math.floor((st.uptime || 0) / 60)}m</span></div>
        </div>

        <div class="card">
          <h2>${icon("settings")} Provider</h2>
          <label class="field"><span>Mode</span>
            <select id="setMode">
              ${["auto", "gemini", "openrouter", "openai", "groq", "deepseek", "local", "offline"].map((m) =>
                `<option value="${m}" ${settings.provider.mode === m ? "selected" : ""}>${m}</option>`).join("")}
            </select>
          </label>
          <label class="field"><span>Model</span><input id="setModel" value="${esc(settings.provider.model)}"></label>
          <label class="field"><span>Local fast lane</span><input id="setFast" value="${esc(settings.local.fast_url)}"></label>
          <button class="btn primary btn-block" id="setSave">${icon("check")} Save settings</button>
        </div>

        <div class="card">
          <h2>${icon("shield")} API key</h2>
          <p class="small muted">Free Gemini key: aistudio.google.com/apikey · key save hote hi provider turant switch ho jata hai.</p>
          <label class="field"><span>Key type</span>
            <select id="secretName">
              <option value="gemini">Gemini (free tier)</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="groq">Groq</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </label>
          <label class="field"><span>Key value</span><input id="secretValue" type="password" autocomplete="off" placeholder="paste key"></label>
          <div class="item-actions">
            <button class="btn primary" id="secretSave">${icon("check")} Save key</button>
            <button class="btn ghost" id="secretClear">Remove</button>
          </div>
        </div>

        <div class="card">
          <h2>${icon("memory")} Privacy & limits</h2>
          <div class="row"><span class="k">Store chats</span><span class="v">${settings.privacy.store_chats ? "on" : "off"}</span></div>
          <div class="row"><span class="k">Max tool steps</span><span class="v">${settings.limits.max_tool_steps}</span></div>
          <div class="row"><span class="k">Approval TTL</span><span class="v">${settings.limits.approval_ttl}s</span></div>
          <div class="row"><span class="k">Dashboard</span><span class="v">${esc(settings.server.host)}:${settings.server.port}${settings.server.allow_lan ? " (LAN)" : ""}</span></div>
          <div class="row"><span class="k">Database</span><span class="v">${esc(st.paths.database)}</span></div>
          <button class="btn ghost btn-block" id="setChats">${settings.privacy.store_chats ? "Chats band karo" : "Chats on karo"}</button>
        </div>

        <div class="card">
          <h2>${icon("shield")} Recent audit</h2>
          ${(logsPayload.events || []).slice(0, 12).map((ev) => `<div class="row">
            <span class="k">${esc(ev.event)}</span>
            <span class="v">${esc(String(ev.detail || "").slice(0, 60))}</span>
          </div>`).join("") || `<p class="muted small">Koi event nahi.</p>`}
        </div>

        <div class="card">
          <h2>${icon("x")} Session</h2>
          <button class="btn danger btn-block" id="setLogout">Lock dashboard (forget token)</button>
        </div>
      </div>`;

      $("#setSave").addEventListener("click", async () => {
        try {
          const payload = await api("/api/settings", {
            method: "POST",
            body: { patch: { provider: { mode: $("#setMode").value, model: $("#setModel").value.trim() }, local: { fast_url: $("#setFast").value.trim() } } },
          });
          state.settings = payload.settings;
          toast("Settings saved", "ok");
          boot().catch(() => {});
        } catch (err) { toast(err.message, "bad"); }
      });

      $("#secretSave").addEventListener("click", async () => {
        const value = $("#secretValue").value.trim();
        if (!value) return toast("Key paste karo", "bad");
        try {
          await api("/api/secrets", { method: "POST", body: { name: $("#secretName").value, value } });
          $("#secretValue").value = "";
          toast("Key saved locally", "ok");
          renderSettings();
        } catch (err) { toast(err.message, "bad"); }
      });

      $("#secretClear").addEventListener("click", async () => {
        try {
          await api("/api/secrets", { method: "POST", body: { name: $("#secretName").value, value: "" } });
          toast("Key removed", "ok");
          renderSettings();
        } catch (err) { toast(err.message, "bad"); }
      });

      $("#setChats").addEventListener("click", async () => {
        try {
          const payload = await api("/api/settings", { method: "POST", body: { patch: { privacy: { store_chats: !settings.privacy.store_chats } } } });
          state.settings = payload.settings;
          renderSettings();
        } catch (err) { toast(err.message, "bad"); }
      });

      $("#setLogout").addEventListener("click", () => {
        saveToken("");
        state.chatId = "";
        localStorage.removeItem(LS.chat);
        renderGate("Dashboard locked. Token dobara daalo.");
      });
    } catch (err) {
      if (err instanceof AuthError) { renderGate(); return; }
      view.innerHTML = `<div class="screen"><div class="empty">${esc(err.message)}</div></div>`;
    }
  }

  /* -------------------------------------------------------------- overlays */

  function openSheet(title, html) {
    const sheet = $("#sheet");
    sheet.hidden = false;
    sheet.innerHTML = `<div class="backdrop"></div>
      <div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="head"><h2>${esc(title)}</h2>
          <button class="icon-btn" id="sheetClose" aria-label="Close">${icon("x")}</button></div>
        <div class="body">${html}</div>
      </div>`;
    requestAnimationFrame(() => sheet.classList.add("open"));
    $("#sheetClose").addEventListener("click", closeSheet);
    $(".backdrop", sheet).addEventListener("click", closeSheet);
  }

  function closeSheet() {
    const sheet = $("#sheet");
    sheet.classList.remove("open");
    setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ""; }, 190);
  }

  /* ------------------------------------------------------------------ voice */

  function speechVoices() { return window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }

  function speak(text) {
    if (!window.speechSynthesis) return toast("Is browser mein TTS nahi hai", "bad");
    const clean = String(text)
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[*_`#>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .slice(0, 900);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    const lang = (state.settings && state.settings.assistant && state.settings.assistant.language) || "hi-IN";
    utterance.lang = /hindi|hinglish|hi/i.test(lang) ? "hi-IN" : "en-IN";
    const voices = speechVoices();
    const voice = voices.find((v) => v.lang === utterance.lang) || voices.find((v) => v.lang.startsWith("hi")) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    utterance.onstart = () => { state.speaking = true; };
    utterance.onend = () => { state.speaking = false; };
    utterance.onerror = () => { state.speaking = false; };
    window.speechSynthesis.speak(utterance);
  }

  function toggleMic() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return toast("Voice input ke liye Chrome/Android browser chahiye", "bad");
    if (state.listening) { state.recognition && state.recognition.stop(); return; }
    const recognition = new Recognition();
    recognition.lang = "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    const input = $("#input");
    const mic = $("#btnMic");
    state.recognition = recognition;
    recognition.onstart = () => {
      state.listening = true;
      if (mic) { mic.classList.add("is-live"); mic.innerHTML = icon("stop"); }
      toast("Sun raha hoon…");
    };
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) text += event.results[i][0].transcript;
      if (input) input.value = text;
    };
    recognition.onerror = (event) => { toast("Voice error: " + event.error, "bad"); };
    recognition.onend = () => {
      state.listening = false;
      if (mic) { mic.classList.remove("is-live"); mic.innerHTML = icon("mic"); }
      if (input && input.value.trim()) send(input.value);
    };
    try { recognition.start(); } catch { /* already started */ }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("Copied", "ok"), () => toast("Copy fail", "bad"));
    } else {
      const area = document.createElement("textarea");
      area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); toast("Copied", "ok"); } catch { toast("Copy fail", "bad"); }
      area.remove();
    }
  }

  /* ------------------------------------------------------------------ wiring */

  $("#tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) switchTab(tab.dataset.tab);
  });

  $("#btnRefresh").addEventListener("click", async () => {
    try {
      state.status = await api("/api/status");
      paintBrand();
      render();
      toast("Refreshed", "ok");
    } catch (err) {
      if (err instanceof AuthError) { renderGate(); return; }
      toast(err.message, "bad");
    }
  });

  $("#btnVoice").addEventListener("click", () => {
    state.voice = !state.voice;
    localStorage.setItem(LS.voice, state.voice ? "1" : "0");
    $("#btnVoice").classList.toggle("is-on", state.voice);
    if (state.voice && state.lastReply) speak(state.lastReply);
    if (!state.voice && window.speechSynthesis) window.speechSynthesis.cancel();
    toast(state.voice ? "Voice replies on" : "Voice replies off");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && window.speechSynthesis) window.speechSynthesis.cancel();
  });

  window.addEventListener("online", () => toast("Network wapas", "ok"));
  window.addEventListener("offline", () => toast("Network gaya — local tools chalenge", "bad"));

  /* token can arrive as ?token=… from the startup line */
  (function takeTokenFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (token) {
      saveToken(token);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.pathname + url.hash);
    }
  })();

  $("#btnVoice").classList.toggle("is-on", state.voice);
  if (!state.token) renderGate();
  else boot().catch((err) => {
    if (err instanceof AuthError) renderGate();
    else { renderGate("Backend se connect nahi hua: " + err.message); }
  });

})();
