/* ==========================================================================
   J.A.R.V.I.S. · MARK XI — HUD controller
   Zero dependencies. Talks only to the local /api surface.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const body = document.body;
  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 46;
  const MAX_MESSAGES = 140;
  const STATE_TEXT = {
    idle: "READY",
    listening: "LISTENING",
    thinking: "PROCESSING",
    speaking: "SPEAKING",
    alert: "ATTENTION",
  };

  const state = {
    installPrompt: null,
    booted: false,
    busy: false,
    listening: false,
    speaking: false,
    settings: null,
    status: null,
    lastEventId: 0,
    pendingApproval: null,
    approvalTimer: null,
    wakeLoop: false,
    wakeHeardAt: 0,
    micGranted: false,
    restartDelay: 700,
    speechStartedAt: 0,
    bargeRec: null,
    interim: "",
    uptimeBase: 0,
    uptimeStamp: 0,
    messageCount: 0,
    audio: null,
    recognition: null,
    voices: [],
  };

  /* ------------------------------------------------------------------ utils */
  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));

  function fmtText(text) {
    let out = esc(text);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/(^|\n)\s*[-•]\s+/g, "$1• ");
    return out;
  }

  function fmtSeconds(total) {
    const value = Math.max(0, Math.floor(Number(total) || 0));
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    if (h) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function relTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    if (value < 60) return `${value}s`;
    if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
    if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
    return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
  }

  function clockTime(date = new Date()) {
    return date.toLocaleTimeString("en-GB", { hour12: false });
  }

  function stampTime(iso) {
    if (!iso) return "";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function currentStamp() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      ...options,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("The core returned malformed data.");
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  /* --------------------------------------------------------------- notices */
  function toast(title, text = "", kind = "info", ttl = 6200) {
    const host = $("toasts");
    if (!host) return;
    const node = document.createElement("div");
    node.className = `toast ${kind}`;
    node.innerHTML = `<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}`;
    host.appendChild(node);
    const close = () => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 260);
    };
    node.addEventListener("click", close);
    setTimeout(close, ttl);
    while (host.children.length > 4) host.firstElementChild.remove();
  }

  function logLine(text, kind = "") {
    const list = $("miniLog");
    if (!list) return;
    const empty = list.querySelector(".empty");
    if (empty) empty.remove();
    const item = document.createElement("li");
    if (kind) item.className = kind;
    item.innerHTML = `<span>${clockTime().slice(0, 5)}</span><b>${esc(text)}</b>`;
    list.prepend(item);
    while (list.children.length > 24) list.lastElementChild.remove();
  }

  /* ----------------------------------------------------------------- state */
  function setState(next) {
    if (!STATE_TEXT[next]) return;
    body.dataset.state = next;
    const label = $("stateLabel");
    if (label) label.textContent = STATE_TEXT[next];
    const reactorState = $("reactorState");
    if (reactorState) {
      reactorState.textContent = next === "idle" ? "STANDBY" : STATE_TEXT[next];
    }
    const reactorSub = $("reactorSub");
    if (reactorSub) {
      reactorSub.textContent = {
        idle: "awaiting input",
        listening: "voice channel open",
        thinking: "computing response",
        speaking: "audio transmission",
        alert: "authorization required",
      }[next];
    }
    const footer = $("footerState");
    if (footer) footer.textContent = STATE_TEXT[next];
  }

  /* --------------------------------------------------------------- messages */
  function scrolledToBottom(host) {
    return host.scrollHeight - host.scrollTop - host.clientHeight < 90;
  }

  function addMessage(role, text, meta = {}, cards = []) {
    const host = $("messages");
    if (!host) return null;
    const stick = scrolledToBottom(host) || role === "user";
    const node = document.createElement("article");
    node.className = `msg ${role}`;
    const avatar = role === "user" ? "YOU" : role === "system" ? "SYS" : "JV";
    const tags = [];
    if (meta.intent) tags.push(`<span class="tag">${esc(meta.intent)}</span>`);
    if (meta.provider) tags.push(`<span class="tag hot">${esc(meta.provider)}</span>`);
    if (meta.tool) tags.push(`<span class="tag">${esc(meta.tool)}</span>`);
    if (meta.ms != null) tags.push(`<span class="tag">${esc(meta.ms)}ms</span>`);
    const cardHtml = cards.length ? `<div class="cards">${cards.map(renderCard).join("")}</div>` : "";
    node.innerHTML = `
      <div class="avatar">${avatar}</div>
      <div class="bubble">
        <div class="meta">
          <span class="who">${role === "user" ? "SIR" : role === "system" ? "SYSTEM" : "J.A.R.V.I.S."}</span>
          ${tags.join("")}
          <span>${esc(meta.time || currentStamp())}</span>
        </div>
        ${text ? `<div class="text">${fmtText(text)}</div>` : ""}
        ${cardHtml}
      </div>`;
    host.appendChild(node);
    state.messageCount += 1;
    while (host.children.length > MAX_MESSAGES) host.firstElementChild.remove();
    if (stick) host.scrollTop = host.scrollHeight;
    return node;
  }

  function addSystem(text) {
    return addMessage("system", text, { intent: "system", provider: "core" });
  }

  /* ----------------------------------------------------------------- cards */
  const WEATHER_GLYPH = { clear: "☀", cloud: "☁", rain: "☂", snow: "❄", storm: "⚡", fog: "≋" };

  function cardShell(title, inner, footer = "") {
    return `<div class="card">
      ${title ? `<div class="card-title"><span>${esc(title)}</span></div>` : ""}
      ${inner}
      ${footer ? `<div class="card-foot">${esc(footer)}</div>` : ""}
    </div>`;
  }

  function renderCard(card) {
    if (!card || !card.type) return "";
    switch (card.type) {
      case "link": {
        const raw = String(card.url || "");
        const external = /^https?:/i.test(raw);
        const local = raw.startsWith("/") && !raw.startsWith("//");
        const url = external || local ? raw : "";
        const label = esc(card.title || "Open link");
        const attrs = external
          ? 'target="_blank" rel="noopener noreferrer"'
          : `download="${esc(raw.split("/").pop() || "file")}"`;
        return cardShell("LINK", url
          ? `<a class="card-link" href="${esc(url)}" ${attrs}><span>${label}</span>
             <svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
             ${card.subtitle ? `<p class="sub">${esc(card.subtitle)}</p>` : ""}`
          : `<p class="body">${label}</p>`);
      }
      case "article":
        return cardShell(card.title || "REFERENCE", `
          ${card.image ? `<img src="${esc(card.image)}" alt="" loading="lazy" />` : ""}
          <p class="body">${fmtText(card.body || "")}</p>
          ${card.url ? `<p class="sub"><a href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">Read on Wikipedia ↗</a></p>` : ""}
        `, card.subtitle || "");
      case "news":
        return cardShell(card.title || "HEADLINES", `<div class="news-rows">${(card.items || []).map((item) => `
          <div class="news-row">
            <a href="${esc(item.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(item.title || "")}</a>
            <span class="src">${esc(item.source || "news")}${item.published ? " · " + esc(String(item.published).slice(0, 22)) : ""}</span>
          </div>`).join("")}</div>`);
      case "weather": {
        const stats = [];
        if (card.high != null) stats.push(`H <b>${esc(card.high)}°</b>`);
        if (card.low != null) stats.push(`L <b>${esc(card.low)}°</b>`);
        if (card.humidity != null) stats.push(`HUM <b>${esc(card.humidity)}%</b>`);
        if (card.wind != null) stats.push(`WIND <b>${esc(card.wind)}</b>`);
        if (card.rain != null) stats.push(`RAIN <b>${esc(card.rain)}%</b>`);
        if (card.sunset) stats.push(`SUNSET <b>${esc(card.sunset)}</b>`);
        return cardShell("WEATHER", `
          <div class="weather">
            <div>
              <div class="city">${esc(card.city || "LOCAL")}</div>
              <div class="temp">${esc(Math.round(card.temp))}<em>°C</em></div>
              <div class="cond">${esc(card.condition || "")}${card.feels != null ? ` · feels ${esc(card.feels)}°` : ""}</div>
            </div>
            <div class="icon">${WEATHER_GLYPH[card.icon] || "◌"}</div>
          </div>
          ${stats.length ? `<div class="stats">${stats.join("")}</div>` : ""}`);
      }
      case "files":
        return cardShell(card.title || "FILES", `<div class="list-rows">${(card.items || []).map((item, index) => `
          <div class="list-row">
            <span class="idx">${item.kind === "dir" ? "▸" : String(index + 1).padStart(2, "0")}</span>
            <span>${esc(item.name)}</span>
            <span class="kind">${esc(item.size || "")}</span>
          </div>`).join("") || '<div class="list-row">Empty.</div>'}</div>`, card.footer);
      case "list": {
        const rows = card.items || card.rows || [];
        return cardShell(card.title || "LIST", `<div class="list-rows">${rows.map((item, index) => `
          <div class="list-row">
            <span class="idx">${String(index + 1).padStart(2, "0")}</span>
            <span>${esc(typeof item === "string" ? item : (item.label || item.text || item.name || ""))}${typeof item === "object" && item.value ? ` <b>${esc(item.value)}</b>` : ""}</span>
          </div>`).join("") || '<div class="list-row">Nothing pending.</div>'}</div>`, card.footer);
      }
      case "metrics":
      case "telemetry":
        if (!card.items && Array.isArray(card.rows)) {
          return renderCard({ ...card, type: "list", items: card.rows });
        }
        return cardShell(card.title || "TELEMETRY", `<div class="metric-grid">${(card.items || []).map((item) => `
          <div class="metric">
            <label>${esc(item.label)}</label>
            <b>${esc(item.value)}</b>
            ${item.hint ? `<small>${esc(item.hint)}</small>` : ""}
            ${item.pct != null ? `<div class="mini-bar"><i style="width:${Math.max(0, Math.min(100, Number(item.pct) || 0))}%"></i></div>` : ""}
          </div>`).join("")}</div>`, card.footer);
      case "reminder":
        return cardShell("REMINDER", `
          <p class="body"><strong>${esc(card.title || "")}</strong></p>
          <p class="sub">${esc(card.due || "")}${card.relative ? " · " + esc(card.relative) : ""}</p>`);
      case "timer":
        return cardShell("COUNTDOWN", `<div class="timer"><span class="duration">${esc(card.duration || "")}</span><span class="label">${esc(card.label || "timer")}</span></div>`);
      case "media":
        return cardShell("MEDIA", `<p class="body"><strong>${esc(card.title || "")}</strong></p><p class="sub">${esc(card.subtitle || "")}${card.detail ? " · " + esc(card.detail) : ""}</p>`);
      case "math":
        return cardShell("CALCULATION", `<div class="formula">${esc(card.expression || "")}</div><div class="result">${esc(card.result || "")}</div>`);
      case "coin":
        return cardShell("COIN TOSS", `<div class="result">${esc(card.result || "")}</div>`);
      case "dice":
        return cardShell("DICE", `<div class="result">${esc(card.result)}</div><p class="sub">d${esc(card.sides || 6)}</p>`);
      case "quote":
        return `<div class="card quote-card">
            <div class="card-title"><span>QUOTE</span></div>
            <p class="body">“${esc(card.text || "")}”</p>
            <p class="quote-author">— ${esc(card.author || "unknown")}</p>
          </div>`;
      case "clock":
        return cardShell("CHRONOMETER", `<div class="result">${esc(card.time12 || card.time || "")}</div><p class="sub">${esc(card.day || "")} · ${esc(card.date || "")}</p>`);
      case "contact": {
        const phone = card.phone ? `+${String(card.phone).replace(/^\+/, "")}` : "";
        return cardShell("CONTACT", `
          <p class="body"><strong>${esc(card.name || "")}</strong></p>
          ${phone ? `<p class="sub"><a href="tel:${esc(phone)}">${esc(phone)}</a></p>` : ""}
          ${card.email ? `<p class="sub"><a href="mailto:${esc(card.email)}">${esc(card.email)}</a></p>` : ""}
          ${card.url ? `<p class="sub"><a href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">${esc(card.action_label || "Open")} ↗</a></p>` : ""}`);
      }
      case "memory":
        return cardShell("MEMORY", `<p class="body"><strong>${esc(card.key || "")}</strong></p><p class="sub">${esc(card.value || "")}</p>`);
      case "message":
        return cardShell(card.title || "DRAFT", `
          <div class="message-card"><p class="body">${esc(card.body || "")}</p></div>
          ${card.subtitle ? `<p class="sub">${esc(card.subtitle)}</p>` : ""}
          ${card.url ? `<p class="sub"><a href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></p>` : ""}`);
      case "file":
        return cardShell("FILE", `<p class="body"><strong>${esc(card.name || "")}</strong></p><p class="sub">${esc(card.path || "")}${card.size ? " · " + esc(card.size) : ""}</p>`);
      case "text":
        return cardShell(card.title || "NOTE", `<p class="body">${fmtText(card.body || "")}</p>`);
      case "next":
        return `<div class="card next-card">
            <div class="card-title"><span>NEXT ACTION</span></div>
            <p class="next-line">${esc(card.text || "")}</p>
          </div>`;
      case "terminal": {
        const rows = (card.rows || []).map((line) => {
          const text = String(line || "");
          const dim = !text.trim() || text.trim().startsWith("#") || text.includes("alternative");
          return `<code class="cmd-line${dim ? " dim" : ""}">${esc(text)}</code>`;
        }).join("");
        return `<div class="card terminal-card">
            <div class="card-title"><span>${esc(card.title || "TERMINAL")}</span></div>
            ${rows}
          </div>`;
      }
      default:
        return "";
    }
  }

  /* ----------------------------------------------------------------- speech */
  function loadVoices() {
    const synth = window.speechSynthesis;
    const select = $("setVoice");
    if (!synth) return [];
    state.voices = synth.getVoices() || [];
    if (!select) return state.voices;
    const current = select.value || (state.settings && state.settings.voice_name) || "";
    select.innerHTML = '<option value="">Auto · British male</option>';
    [...state.voices]
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
      .forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.name;
        option.textContent = `${voice.name} · ${voice.lang}`;
        select.appendChild(option);
      });
    select.value = current;
    if (select.value !== current) select.value = "";
    const note = $("voiceNote");
    if (note) {
      const female = state.voices.filter((v) => /female|zira|samantha|karen|veena|heera|google uk english female/i.test(v.name)).length;
      note.textContent = state.voices.length
        ? `${state.voices.length} browser voices · ${female} female — pick one and press PREVIEW.`
        : "Voices come from your browser — pick a female or regional voice here.";
    }
    return state.voices;
  }

  function pickVoice() {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    if (!state.voices.length) state.voices = synth.getVoices();
    const voices = state.voices;
    if (!voices.length) return null;
    if (state.settings && state.settings.voice_name) {
      const exact = voices.find((v) => v.name === state.settings.voice_name);
      if (exact) return exact;
    }
    const preferred = ["Google UK English Male", "Daniel", "Microsoft George", "Arthur", "Google UK English Female"];
    for (const name of preferred) {
      const hit = voices.find((v) => v.name.includes(name));
      if (hit) return hit;
    }
    return voices.find((v) => /^en-GB/i.test(v.lang) && /male/i.test(v.name))
      || voices.find((v) => /^en-GB/i.test(v.lang))
      || voices.find((v) => /^en-IN/i.test(v.lang))
      || voices.find((v) => /^en/i.test(v.lang))
      || voices[0];
  }

  function stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopBargeWatch();
    state.speaking = false;
    if (body.dataset.state === "speaking") setState(state.listening ? "listening" : "idle");
  }

  function speak(text, { interrupt = true } = {}) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    if (state.settings && state.settings.speak === false) return;
    if (interrupt) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 800));
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = (state.settings && state.settings.language) || "en-GB";
    utterance.rate = (state.settings && Number(state.settings.voice_rate)) || 0.98;
    utterance.pitch = (state.settings && Number(state.settings.voice_pitch)) || 0.85;
    utterance.onstart = () => {
      state.speaking = true;
      state.speechStartedAt = Date.now();
      if (!state.listening) setState("speaking");
      startBargeWatch();
    };
    utterance.onend = () => {
      state.speaking = false;
      stopBargeWatch();
      if (!state.listening && body.dataset.state === "speaking") setState("idle");
    };
    utterance.onerror = () => {
      state.speaking = false;
      stopBargeWatch();
      if (!state.listening && body.dataset.state === "speaking") setState("idle");
    };
    synth.speak(utterance);
  }

  function beep(freq = 620, duration = 0.07, gainValue = 0.03) {
    if (!state.settings || state.settings.sound === false) return;
    try {
      if (!state.audio) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        state.audio = new Ctx();
      }
      const ctx = state.audio;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      /* sound is optional */
    }
  }

  /* ------------------------------------------------------------ recognition */
  const WAKE_ALIASES = {
    jarvis: ["jarvis", "jarvice", "jarvis.", "jaarvis", "jervis", "javis", "j.a.r.v.i.s", "जार्विस"],
  };

  function wakeWords() {
    const base = String((state.settings && state.settings.wake_word) || "jarvis").toLowerCase().trim();
    const extra = WAKE_ALIASES[base] || [];
    return Array.from(new Set([base, ...extra])).filter(Boolean);
  }

  function findWake(text) {
    const lower = String(text || "").toLowerCase();
    for (const word of wakeWords()) {
      const index = lower.indexOf(word);
      if (index !== -1) return { index, word };
    }
    return null;
  }

  function bargeInEnabled() {
    return !(state.settings && state.settings.barge_in === false);
  }

  function startBargeWatch() {
    if (!bargeInEnabled() || !state.micGranted || state.listening || document.hidden) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopBargeWatch();
    const rec = new SR();
    rec.lang = (state.settings && state.settings.language) || "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) heard += event.results[i][0].transcript;
      if (!heard.trim()) return;
      if (Date.now() - state.speechStartedAt < 450) return;  // ignore the reply's own onset
      stopBargeWatch();
      stopSpeech();
      logLine("barge-in · you took the floor");
      beep(660, 0.05, 0.02);
      handleTranscript(heard.trim());
    };
    rec.onerror = () => { if (state.bargeRec === rec) state.bargeRec = null; };
    rec.onend = () => { if (state.bargeRec === rec) state.bargeRec = null; };
    state.bargeRec = rec;
    try { rec.start(); } catch { state.bargeRec = null; }
  }

  function stopBargeWatch() {
    const rec = state.bargeRec;
    state.bargeRec = null;
    if (rec) { try { rec.abort(); } catch { /* already closed */ } }
  }

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const mic = $("micBtn");
      if (mic) {
        mic.disabled = true;
        mic.title = "This browser has no SpeechRecognition. Use text input.";
      }
      $("voiceHint").textContent = "Voice input unsupported in this browser";
      return;
    }
    const recognition = new SR();
    recognition.lang = (state.settings && state.settings.language) || "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.listening = true;
      state.micGranted = true;
      state.restartDelay = 700;
      $("micBtn").setAttribute("aria-pressed", "true");
      $("voiceHint").textContent = state.settings && state.settings.wake_word_enabled
        ? `Listening for “${state.settings.wake_word || "jarvis"}”…`
        : "Listening…";
      setState("listening");
      beep(880, 0.06, 0.025);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      state.interim = interim;
      const spoken = `${interim}${final}`.trim();
      if (spoken && state.speaking && bargeInEnabled()) {
        stopSpeech();
        logLine("barge-in · reply interrupted");
        setState("listening");
      }
      if (interim) {
        const heard = findWake(interim);
        if (state.wakeLoop && heard && Date.now() - state.wakeHeardAt > 1200) {
          state.wakeHeardAt = Date.now();
          beep(980, 0.05, 0.02);
          $("voiceHint").textContent = "Wake word heard · go ahead";
        } else {
          $("voiceHint").textContent = `“${interim.trim()}”`;
        }
      }
      if (final) handleTranscript(final.trim());
    };

    recognition.onerror = (event) => {
      const code = event.error || "error";
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast("Microphone blocked", "Allow microphone access in the browser, or keep using text.", "alert");
        state.wakeLoop = false;
        state.micGranted = false;
      } else if (code === "no-speech") {
        $("voiceHint").textContent = "No speech detected";
      } else if (code !== "aborted") {
        logLine(`voice error: ${code}`, "alert");
        state.restartDelay = Math.min(8000, Math.max(700, state.restartDelay) * 1.6);
      }
    };

    recognition.onend = () => {
      state.listening = false;
      $("micBtn").setAttribute("aria-pressed", "false");
      if (state.wakeLoop) {
        if (document.hidden) {
          $("voiceHint").textContent = "Wake word paused (tab hidden)";
          return;
        }
        const delay = Math.max(700, state.restartDelay);
        state.restartDelay = Math.min(8000, delay * 1.6);
        setTimeout(() => {
          if (!state.wakeLoop || document.hidden || state.listening) return;
          try { recognition.start(); } catch { /* restart race */ }
        }, delay);
        return;
      }
      $("voiceHint").textContent = "Voice channel · standby";
      if (body.dataset.state === "listening") setState("idle");
    };

    state.recognition = recognition;
  }

  function handleTranscript(transcript) {
    if (!transcript) return;
    const settings = state.settings || {};
    let text = transcript.trim();
    if (settings.wake_word_enabled) {
      const heard = findWake(text);
      if (!heard) {
        $("voiceHint").textContent = `Wake word “${settings.wake_word || "jarvis"}” not heard`;
        return;
      }
      text = text.slice(heard.index + heard.word.length).replace(/^[\s,:.!?-]+/, "").trim();
      if (!text) {
        beep(980, 0.05, 0.02);
        $("voiceHint").textContent = "Listening…";
        return;
      }
    }
    if (!text) return;
    state.wakeLoop = false;
    if (state.recognition) {
      try { state.recognition.stop(); } catch { /* already stopped */ }
    }
    const input = $("input");
    input.value = "";
    send(text, "voice");
  }

  function toggleMic() {
    if (!state.recognition) {
      toast("Voice input unavailable", "This browser does not expose speech recognition. Try Chrome or Edge.", "gold");
      return;
    }
    if (state.listening || state.wakeLoop) {
      state.wakeLoop = false;
      try { state.recognition.stop(); } catch { /* noop */ }
      state.listening = false;
      $("micBtn").setAttribute("aria-pressed", "false");
      setState("idle");
      $("voiceHint").textContent = "Voice channel · standby";
      return;
    }
    stopSpeech();
    state.recognition.lang = (state.settings && state.settings.language) || "en-IN";
    state.recognition.continuous = Boolean(state.settings && state.settings.wake_word_enabled);
    state.wakeLoop = Boolean(state.settings && state.settings.wake_word_enabled);
    state.restartDelay = 700;
    try {
      state.recognition.start();
    } catch {
      toast("Microphone busy", "Give the previous session a moment to close.", "gold");
    }
  }

  /* ------------------------------------------------------------------ cards */
  function appendReply(payload, source = "text") {
    const meta = { ...(payload.meta || {}), time: currentStamp() };
    meta.ms = payload.meta ? payload.meta.ms : undefined;
    if (payload.reply) addMessage("assistant", payload.reply, meta, payload.cards || []);
    if (payload.speech) speak(payload.speech);
    if (payload.meta && payload.meta.provider) {
      const raw = String(payload.meta.provider);
      const label = raw.startsWith("route:")
        ? `${raw.slice(6)} free route`
        : `${raw} core`;
      $("providerTag").textContent = label;
      $("footerBrain").textContent = raw.startsWith("route:") ? "FREE ROUTE" : raw.toUpperCase();
      if (payload.meta.routed_via) {
        $("providerTag").title = `served by ${payload.meta.routed_via}`;
      }
    }
    if (payload.action) runAction(payload.action);
    if (payload.approval) openApproval(payload.approval);
    if (payload.data && payload.data.needs_message) {
      addSystem("Awaiting your message — type it now and I will pass it on.");
    }
    if (payload.data && payload.data.needs_time) {
      addSystem("Awaiting a time — for example “in 20 minutes” or “at 6:30 pm”.");
    }
    refreshStatus();
    refreshAgenda();
  }

  function runAction(action) {
    if (!action || !action.type) return;
    if (action.type === "open_url" && action.url) {
      const win = window.open(action.url, "_blank", "noopener,noreferrer");
      if (!win) toast("Popup blocked", `Open manually: ${action.url}`, "gold", 9000);
    } else if (action.type === "stop_speech") {
      stopSpeech();
    } else if (action.type === "clear_chat") {
      clearConversation(false);
    } else if (action.type === "standby") {
      state.wakeLoop = false;
      if (state.recognition) { try { state.recognition.stop(); } catch { /* noop */ } }
      setState("idle");
    }
  }

  /* ------------------------------------------------------------------- send */
  async function send(rawText, source = "text") {
    const text = String(rawText || "").trim();
    if (!text || state.busy) return;
    stopSpeech();
    state.busy = true;
    $("sendBtn").disabled = true;
    $("typing").hidden = false;
    setState("thinking");
    $("footerSource").textContent = source.toUpperCase();
    addMessage("user", text, { time: currentStamp(), provider: source });
    beep(720, 0.05, 0.022);

    try {
      const payload = await api("/api/command", {
        method: "POST",
        body: JSON.stringify({ text, source }),
      });
      appendReply(payload, source);
      logLine(`${payload.meta && payload.meta.intent ? payload.meta.intent : "command"}`, "sys");
    } catch (error) {
      addSystem(`Uplink failure — ${error.message}. The core may be restarting.`);
      toast("Core unreachable", error.message, "alert");
      logLine("uplink failure", "alert");
      setState("alert");
      setTimeout(() => { if (body.dataset.state === "alert") setState("idle"); }, 3200);
    } finally {
      state.busy = false;
      $("sendBtn").disabled = false;
      $("typing").hidden = true;
      if (body.dataset.state === "thinking") setState(state.listening ? "listening" : "idle");
    }
  }

  function clearConversation(notify = true) {
    $("messages").innerHTML = "";
    state.messageCount = 0;
    if (notify) {
      api("/api/clear", { method: "POST", body: "{}" }).catch(() => {});
      toast("Conversation cleared", "The local history buffer is empty.");
      logLine("conversation cleared");
    }
    setState("idle");
  }

  /* --------------------------------------------------------------- approval */
  function openApproval(approval) {
    state.pendingApproval = approval;
    $("approvalSummary").textContent = approval.summary || "High-impact action";
    $("approvalTool").textContent = String(approval.tool || "tool").toUpperCase();
    $("approvalToken").textContent = approval.token ? `${approval.token.slice(0, 10)}…` : "—";
    $("approvalModal").hidden = false;
    $("approvalPill").hidden = false;
    setState("alert");
    beep(420, 0.16, 0.05);
    setTimeout(() => beep(340, 0.14, 0.04), 130);
    clearInterval(state.approvalTimer);
    let left = Number(approval.expires_in) || 180;
    const tick = () => {
      $("approvalTimer").textContent = `${Math.max(0, left)}s`;
      if (left <= 0) {
        clearInterval(state.approvalTimer);
        closeApproval();
        addSystem("Authorization window expired. Ask me again and I will re-request approval.");
        toast("Approval expired", "The action was not executed.", "gold");
        return;
      }
      left -= 1;
    };
    tick();
    state.approvalTimer = setInterval(tick, 1000);
    speak(`Authorization required. ${approval.summary || ""}`);
    $("approveBtn").focus({ preventScroll: true });
  }

  function closeApproval() {
    clearInterval(state.approvalTimer);
    state.approvalTimer = null;
    state.pendingApproval = null;
    $("approvalModal").hidden = true;
    $("approvalPill").hidden = true;
    if (body.dataset.state === "alert") setState("idle");
  }

  async function decide(approve) {
    const approval = state.pendingApproval;
    if (!approval) return;
    const token = approval.token;
    const summary = approval.summary;
    closeApproval();
    setState("thinking");
    try {
      const payload = await api(approve ? "/api/approve" : "/api/deny", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      appendReply(payload);
      toast(approve ? "Authorized" : "Denied", summary, approve ? "info" : "gold");
      logLine(approve ? "approval granted" : "approval denied");
    } catch (error) {
      addSystem(`Authorization failed — ${error.message}.`);
      toast("Authorization failed", error.message, "alert");
    } finally {
      if (body.dataset.state === "thinking") setState("idle");
    }
  }

  /* ----------------------------------------------------------------- vision */
  async function analyseImage(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("Image too large", "Keep images under 8 MB.", "alert");
      return;
    }
    setState("thinking");
    addMessage("user", `Analyse this image · ${file.name || "capture"}`, { time: currentStamp(), provider: "vision" });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    }).catch((error) => {
      toast("Image error", error.message, "alert");
      return "";
    });
    if (!dataUrl) {
      setState("idle");
      return;
    }
    try {
      const payload = await api("/api/vision", {
        method: "POST",
        body: JSON.stringify({ image: dataUrl, question: "Describe this image concisely for me." }),
      });
      appendReply(payload);
    } catch (error) {
      addSystem(`Vision channel unavailable — ${error.message}. Set JARVIS_GEMINI_KEY in config/jarvis.env to give me eyes.`);
      toast("Vision offline", "A Gemini key is required for image analysis.", "gold");
    } finally {
      $("visionInput").value = "";
      if (body.dataset.state === "thinking") setState("idle");
    }
  }

  /* --------------------------------------------------------------- telemetry */
  function setGauge(id, valueId, percent) {
    const circle = $(id);
    const label = $(valueId);
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (circle) circle.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - pct / 100));
    if (label) label.textContent = `${Math.round(pct)}%`;
  }

  function applyStatus(status) {
    state.status = status;
    const metrics = status.metrics || {};
    const memory = metrics.memory || {};
    const disk = metrics.disk || {};
    const battery = metrics.battery || {};
    const network = metrics.network || {};

    setGauge("gCpu", "cpuValue", metrics.cpu);
    setGauge("gMem", "memValue", memory.percent);
    setGauge("gDisk", "diskValue", disk.percent);

    $("hostName").textContent = metrics.host || "—";
    $("ipAddr").textContent = metrics.ip || "—";
    $("latency").textContent = network.online
      ? (network.latency_ms != null ? `${network.latency_ms} ms` : "online")
      : "offline";
    $("powerState").textContent = battery.present
      ? `${battery.percent}%${battery.plugged ? " ⚡" : ""}`
      : "mains";
    $("toolCount").textContent = `${status.tools || 0} modules`;
    $("moduleCount").textContent = `${status.tools || 0}`;
    $("footerTools").textContent = String(status.tools || 0);
    $("footerVersion").textContent = `v${status.version || "1.0.0"}`;
    $("uptimeLabel").textContent = `up ${fmtSeconds(status.uptime || 0)}`;
    $("sessionLabel").textContent = fmtSeconds(status.uptime || 0);
    state.uptimeBase = Number(status.uptime) || 0;
    state.uptimeStamp = Date.now();

    const brain = status.brain || {};
    const brainMode = brain.mode || "offline";
    $("brainValue").textContent = brainMode.toUpperCase();
    $("footerBrain").textContent = brainMode.toUpperCase();
    $("brainPill").classList.toggle("warn", brainMode === "offline");
    $("providerTag").textContent = `${brainMode} core`;

    const netPill = $("netPill");
    netPill.classList.toggle("bad", !network.online);
    netPill.innerHTML = `<i></i>${network.online ? "LINK" : "NO LINK"}`;

    if (status.owner) $("ownerTag").textContent = String(status.owner).toUpperCase();
    if (status.city) $("cityTag").textContent = String(status.city).toUpperCase();
    if (status.settings) applySettings(status.settings);

    renderModules(status.tool_categories || {});
    renderBrain(status);
  }

  /* ------------------------------------------------------------- neural core */
  function laneModel(lane) {
    const model = String(lane.model || "qwen");
    const short = model.replace(/[-_](?=q|instruct|gguf)/gi, " ").replace(/\.gguf$/i, "");
    return short.length > 22 ? short.slice(0, 21) + "…" : short;
  }

  function renderBrain(status) {
    const host = $("brainLanes");
    if (!host) return;
    const brain = status.brain || {};
    const local = brain.local || {};
    const lanes = brain.lanes || local.lanes || [];
    const preferred = brain.preferred || "auto";
    const mode = brain.mode || "offline";
    $("brainModeTag").textContent = String(mode).toUpperCase();
    $("brainModeTag").classList.toggle("live", mode !== "offline");

    if (!lanes.length) {
      host.innerHTML = '<div class="lane"><span>none</span><b>no lanes</b></div>';
    } else {
      host.innerHTML = lanes.map((lane) => `
        <div class="lane${lane.online ? " on" : ""}">
          <span><i class="dot-lane"></i>${esc(lane.name || "lane")}</span>
          <b>${lane.online ? esc(laneModel(lane)) : "offline"}</b>
          <b>${lane.online && lane.latency_ms != null ? `${esc(lane.latency_ms)}ms` : ""}</b>
        </div>`).join("");
    }

    const recommended = (local.recommended || {}).deep || "";
    const catalog = (local.recommended || {}).catalog || {};
    const recommendedLabel = (catalog[recommended] || {}).label || recommended || "not scanned";
    const agent = status.agent || {};
    const memory = status.memory || {};
    const plans = status.plans || {};
    $("brainMeta").textContent =
      `${preferred} · ${local.online ? "local ready" : "local offline"} · ` +
      `${local.ram_gb || (local.runtime || {}).ram_gb || "?"} GB RAM · ` +
      `suggest ${recommendedLabel} · ` +
      `${memory.count || 0} memories · ${plans.active || 0} plans · ` +
      `${agent.ready ? "agent armed" : "agent waiting"}` +
      ((routeLane.ready) ? ` · ${routeLane.models} free models` : "") +
      ((status.desktop && status.desktop.armed) ? " · desktop ARMED" : "");
    const routeLane = (status.brain && status.brain.routes) || {};
    const routeChip = $("footerRoute");
    if (routeChip) {
      routeChip.textContent = routeLane.ready
        ? `${routeLane.online}/${routeLane.count}`
        : (routeLane.count ? "OFF" : "—");
      routeChip.title = routeLane.ready
        ? `${routeLane.models} free models via ${(routeLane.routes || []).filter((r) => r.online).map((r) => r.label).join(", ")}`
        : "No free route answering — say “free route setup”";
    }
    const phone = status.phone || {};
    const phoneChip = $("footerPhone");
    if (phoneChip) {
      phoneChip.textContent = phone.ready
        ? `${phone.count}/${phone.total}`
        : (phone.android ? "SETUP" : "PC");
      phoneChip.title = phone.ready
        ? `Phone hand online: ${(phone.available || []).join(", ")}`
        : (phone.android
          ? "Termux:API is not answering — say “phone check”"
          : "No Android hand here; run Jarvis in Termux on the phone");
    }
    const focusBtn = $("brainFocusBtn");
    if (focusBtn) {
      const on = Boolean((status.focus || {}).adhd_mode);
      focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
      focusBtn.textContent = on ? "FOCUS ON" : "FOCUS";
    }
    $("footerBrain").textContent = String(mode).toUpperCase();
  }

  function applySettings(settings) {
    state.settings = settings;
    $("hintWake").textContent = settings.wake_word_enabled
      ? `wake word “${settings.wake_word || "jarvis"}”`
      : "wake word off";
    const voiceBtn = $("speakBtn");
    if (voiceBtn) voiceBtn.setAttribute("aria-pressed", settings.speak ? "true" : "false");
    $("ownerTag").textContent = String(settings.owner || "Sir").toUpperCase();
    $("cityTag").textContent = String(settings.city || "").toUpperCase();
    if (state.recognition && settings.language) state.recognition.lang = settings.language;
  }

  function renderModules(categories) {
    const host = $("toolCats");
    if (!host) return;
    const entries = Object.entries(categories);
    if (!entries.length) {
      host.innerHTML = '<div class="tool-cat"><span>registry</span><i></i><b>—</b></div>';
      return;
    }
    host.innerHTML = entries.map(([name, count]) => `
      <div class="tool-cat"><span>${esc(name)}</span><i></i><b>${esc(count)}</b></div>`).join("");
  }

  async function refreshStatus() {
    try {
      const status = await api("/api/status");
      applyStatus(status);
      $("netPill").classList.remove("bad");
    } catch {
      $("netPill").classList.add("bad");
      $("netPill").innerHTML = "<i></i>NO LINK";
    }
  }

  /* ----------------------------------------------------------------- agenda */
  async function refreshAgenda() {
    try {
      const payload = await api("/api/agenda");
      renderAgenda(payload);
    } catch {
      /* silent; the next poll retries */
    }
  }

  function renderAgenda(payload) {
    const list = $("agenda");
    const rows = [];
    (payload.reminders || []).forEach((item) => rows.push({
      glyph: "⏰", kind: "", what: item.text || "reminder",
      when: item.remaining != null ? `in ${relTime(item.remaining)}` : stampTime(item.due),
      sort: item.remaining != null ? item.remaining : 1e9,
    }));
    (payload.timers || []).forEach((item) => rows.push({
      glyph: "⏳", kind: "", what: item.label || "timer",
      when: item.remaining != null ? relTime(item.remaining) : "running",
      sort: item.remaining != null ? item.remaining : 1e9,
    }));
    (payload.alarms || []).forEach((item) => rows.push({
      glyph: "⚡", kind: "alarm", what: item.label || "alarm", when: item.time || "", sort: 1e9,
    }));
    const count = rows.length;
    $("agendaCount").textContent = `${count} active`;
    if (!count) {
      list.innerHTML = '<li class="empty">No active reminders or timers.</li>';
      return;
    }
    rows.sort((a, b) => a.sort - b.sort);
    list.innerHTML = rows.slice(0, 10).map((row) => `
      <li class="${row.kind}">
        <span class="glyph">${row.glyph}</span>
        <span class="what" title="${esc(row.what)}">${esc(row.what)}</span>
        <span class="when">${esc(row.when)}</span>
      </li>`).join("");
  }

  /* ----------------------------------------------------------------- events */
  async function pollEvents() {
    try {
      const payload = await api(`/api/events?since=${state.lastEventId}`);
      const events = payload.events || [];
      if (typeof payload.last_id === "number") state.lastEventId = payload.last_id;
      events.forEach((event) => {
        const kind = event.type === "system" ? "alert" : event.type === "alarm" ? "gold" : "info";
        toast(event.title || "Event", event.body || "", kind, 9000);
        logLine(`${event.title}: ${event.body}`, event.type === "system" ? "alert" : "sys");
        if (event.speech) speak(event.speech, { interrupt: false });
        if (event.type === "alarm" || event.type === "timer") {
          beep(880, 0.2, 0.06);
          setTimeout(() => beep(660, 0.24, 0.05), 260);
          setTimeout(() => beep(880, 0.3, 0.06), 560);
        }
      });
    } catch {
      /* the server may be restarting */
    }
  }

  /* ------------------------------------------------------------------ chips */
  async function loadSuggestions() {
    try {
      const payload = await api("/api/suggestions");
      renderChips(payload.suggestions || []);
    } catch {
      renderChips([
        { label: "Brief me" }, { label: "Status report" }, { label: "Weather" },
        { label: "Set a 5 minute timer" }, { label: "Tell me a joke" },
      ]);
    }
  }

  function renderChips(items) {
    const host = $("chips");
    if (!host) return;
    host.innerHTML = "";
    items.slice(0, 10).forEach((item) => {
      const label = typeof item === "string" ? item : item.label || item.text;
      if (!label) return;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => {
        beep(700, 0.04, 0.02);
        send(label, "chip");
      });
      host.appendChild(button);
    });
  }

  /* ------------------------------------------------------------------ clock */
  function tickClock() {
    const now = new Date();
    $("clock").textContent = clockTime(now);
    $("date").textContent = now
      .toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
      .toUpperCase();
    if (state.uptimeStamp) {
      const seconds = state.uptimeBase + Math.floor((Date.now() - state.uptimeStamp) / 1000);
      $("footerUptime").textContent = fmtSeconds(seconds);
      $("sessionLabel").textContent = fmtSeconds(seconds);
      $("uptimeLabel").textContent = `up ${fmtSeconds(seconds)}`;
    }
  }

  /* ---------------------------------------------------------------- canvas */
  const reactor = (() => {
    const canvas = $("reactor");
    const ctx = canvas ? canvas.getContext("2d") : null;
    let width = 0;
    let height = 0;
    let last = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const PALETTE = {
      idle: ["#5eeaff", "rgba(94,234,255,]", "#0a2635"],
      listening: ["#ffc766", "rgba(255,199,102,]", "#332512"],
      thinking: ["#ff8fb1", "rgba(255,143,177,]", "#331a25"],
      speaking: ["#9df3ff", "rgba(157,243,255,]", "#0a2b38"],
      alert: ["#ff5470", "rgba(255,84,112,]", "#3a1018"],
    };

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now) {
      if (!ctx || !width) return;
      const mode = body.dataset.state || "idle";
      const [main, glow, deep] = PALETTE[mode] || PALETTE.idle;
      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.36;
      const time = reduceMotion ? 0 : now * 0.001;
      const speed = mode === "thinking" ? 2.3 : mode === "alert" ? 1.9 : mode === "listening" ? 1.3 : mode === "speaking" ? 1.1 : 0.55;
      const pulse = 1 + Math.sin(time * (mode === "idle" ? 1.1 : 2.4)) * (mode === "idle" ? 0.018 : 0.045);

      ctx.clearRect(0, 0, width, height);

      // ambient glow
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5);
      halo.addColorStop(0, `${glow}0.22)`);
      halo.addColorStop(0.55, `${glow}0.06)`);
      halo.addColorStop(1, `${glow}0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // outer tick ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `${glow}0.35)`;
      for (let i = 0; i < 72; i += 1) {
        const angle = (i / 72) * Math.PI * 2 + time * 0.05;
        const major = i % 6 === 0;
        const inner = R * 1.36;
        const outer = inner + (major ? R * 0.09 : R * 0.045);
        ctx.lineWidth = major ? 1.3 : 0.7;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();

      // rotating segmented rings
      const segments = 4;
      for (let s = 0; s < segments; s += 1) {
        const base = time * speed * 0.9 + (s * Math.PI * 2) / segments;
        ctx.strokeStyle = `${glow}0.75)`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.12, base, base + 0.62);
        ctx.stroke();
        ctx.strokeStyle = `${glow}0.28)`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.12, base + Math.PI * 0.55, base + Math.PI * 0.98);
        ctx.stroke();
      }

      // dashed rings
      ctx.save();
      ctx.strokeStyle = `${glow}0.42)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 9]);
      ctx.lineDashOffset = -time * 22;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([1, 6]);
      ctx.lineDashOffset = time * 14;
      ctx.strokeStyle = `${glow}0.22)`;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // rotating coil arcs
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-time * speed * 0.35);
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2;
        ctx.save();
        ctx.rotate(angle);
        const gradient = ctx.createLinearGradient(0, -R * 0.95, 0, -R * 0.66);
        gradient.addColorStop(0, `${glow}0.0)`);
        gradient.addColorStop(0.5, `${glow}0.85)`);
        gradient.addColorStop(1, `${glow}0.05)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(-R * 0.03, -R * 0.95, R * 0.06, R * 0.3);
        ctx.restore();
      }
      ctx.restore();

      // inner ring
      ctx.strokeStyle = `${glow}0.5)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.74 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.18, main);
      core.addColorStop(0.52, `${glow}0.55)`);
      core.addColorStop(1, `${glow}0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.62 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // triangle
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.12);
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const radius = R * 0.3;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // satellites
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 3; i += 1) {
        const angle = time * (0.6 + i * 0.18) + (i * Math.PI * 2) / 3;
        const radius = R * (1.02 + i * 0.08);
        ctx.globalAlpha = 0.55 - i * 0.12;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // thought arcs
      if (mode === "thinking") {
        for (let i = 0; i < 3; i += 1) {
          const radius = R * (0.82 + i * 0.1);
          const start = -time * (1.4 + i * 0.5) + i;
          ctx.strokeStyle = `${glow}0.6)`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, start, start + 1.2 + i * 0.35);
          ctx.stroke();
        }
      }
      if (mode === "listening" || mode === "speaking") {
        for (let i = 0; i < 3; i += 1) {
          const phase = (time * 0.4 + i / 3) % 1;
          ctx.strokeStyle = `${glow}${(0.45 * (1 - phase)).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (1.12 + phase * 0.55), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // subtle inner ring shadow
      ctx.strokeStyle = deep;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (now - last > 32) {
        last = now;
        draw(now);
      }
      requestAnimationFrame(frame);
    }

    function start() {
      if (!ctx) return;
      resize();
      window.addEventListener("resize", resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
      requestAnimationFrame(frame);
    }

    return { start, resize };
  })();

  /* ------------------------------------------------------------------- wave */
  const wave = (() => {
    const host = $("wave");
    if (!host) return { start() {} };
    const bars = [];
    for (let i = 0; i < 44; i += 1) {
      const bar = document.createElement("span");
      host.appendChild(bar);
      bars.push(bar);
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const AMP = { idle: 6, listening: 26, thinking: 14, speaking: 34, alert: 12 };
    const SPEED = { idle: 0.0012, listening: 0.004, thinking: 0.0026, speaking: 0.0055, alert: 0.003 };

    function frame(now) {
      const mode = body.dataset.state || "idle";
      const amp = AMP[mode] || 6;
      const speed = SPEED[mode] || 0.0012;
      bars.forEach((bar, index) => {
        const phase = index * 0.42;
        const wobble = Math.sin(now * speed + phase) * 0.5 + 0.5;
        const detail = Math.sin(now * speed * 2.3 + index * 0.17) * 0.28 + 0.72;
        const height = reduceMotion ? 3 : 2 + amp * wobble * detail;
        bar.style.height = `${height.toFixed(1)}px`;
      });
      requestAnimationFrame(frame);
    }
    return {
      start() { requestAnimationFrame(frame); },
    };
  })();

  /* ----------------------------------------------------------------- routes */
  function routeLane() {
    return ((state.status && state.status.brain && state.status.brain.routes) || {});
  }

  function renderRoutes() {
    const box = $("routeList");
    if (!box) return;
    const lane = routeLane();
    const items = lane.routes || [];
    if (!items.length) {
      box.innerHTML = '<p class="sub">No routes configured. Say “free route setup”.</p>';
      return;
    }
    box.innerHTML = items.map((route) => {
      const meta = route.online
        ? `${route.models} models · ${Math.round(route.latency_ms || 0)} ms · ${esc(route.model || "auto")}`
        : esc(route.error || "offline");
      return `<div class="route-row ${route.online ? "online" : ""}">
        <i class="dot"></i><b>${esc(route.label || route.id)}</b>
        <span class="meta">${meta}</span>
      </div>`;
    }).join("");
    const note = $("routeNote");
    if (note) {
      note.innerHTML = lane.ready
        ? `${lane.online}/${lane.count} route online · <b>${lane.models}</b> free models reachable. Brain mode: <code>${esc((state.settings && state.settings.brain_mode) || "auto")}</code>.`
        : 'No free route answering. Say <code>free route setup</code> for the FreeLLMAPI and OmniRoute install commands.';
    }
  }

  async function testRoute() {
    const lane = routeLane();
    const online = (lane.routes || []).filter((route) => route.online);
    if (!online.length) {
      toast("No route online", "Say “free route setup” for the install commands.", "gold", 7000);
      return;
    }
    $("settingsModal").hidden = true;
    $("input").value = `route test ${online[0].id}`;
    $("composer").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  function useFreeModels() {
    $("settingsModal").hidden = true;
    $("input").value = "use free models";
    $("composer").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  }

  /* --------------------------------------------------------------- settings */
  function openSettings() {
    loadVoices();
    const settings = state.settings || {};
    $("setOwner").value = settings.owner || "Sir";
    $("setCity").value = settings.city || "";
    $("setLanguage").value = settings.language || "en-IN";
    $("setWakeWord").value = settings.wake_word || "jarvis";
    $("setVoice").value = settings.voice_name || "";
    if ($("setVoice").value !== (settings.voice_name || "")) $("setVoice").value = "";
    $("setMusicDir").value = settings.music_dir || "";
    $("setRate").value = settings.voice_rate || 0.98;
    $("rateOut").textContent = Number(settings.voice_rate || 0.98).toFixed(2);
    $("setBrainMode").value = settings.brain_mode || "auto";
    $("setAgentSteps").value = Number(settings.agent_steps || 5);
    $("stepsOut").textContent = String(Number(settings.agent_steps || 5));
    $("setAgent").checked = settings.agent_enabled !== false;
    $("setAdhd").checked = Boolean((state.status && state.status.focus && state.status.focus.adhd_mode) || settings.adhd_mode);
    const desktop = (state.status && state.status.desktop) || {};
    $("setDesktop").checked = Boolean(desktop.armed);
    $("setDesktop").disabled = desktop.display === false;
    renderRoutes();
    const phone = (state.status && state.status.phone) || {};
    const phoneNote = $("phoneNote");
    if (phoneNote) {
      phoneNote.textContent = phone.ready
        ? `Phone hand ready (${phone.count}/${phone.total}): call, SMS, notify, torch, volume, clipboard, speak, camera, contacts, location.`
        : (phone.android
          ? "Termux:API is not answering on this phone — install the Termux:API app, then say “phone check”."
          : "This session is a PC. Run Jarvis in Termux on Android for a real phone hand; say “phone check” for the setup list.");
    }
    $("desktopNote").textContent = desktop.display === false
      ? "This session has no desktop surface (headless), so keyboard and mouse control is unavailable."
      : "Desktop control lets Jarvis type, press keys and click. Arm it only when you want hands-on automation; “desktop panic” disarms instantly.";
    $("setSpeak").checked = settings.speak !== false;
    $("setSound").checked = settings.sound !== false;
    $("setWake").checked = Boolean(settings.wake_word_enabled);
    $("setBarge").checked = settings.barge_in !== false;
    $("setLlm").checked = settings.llm_enabled !== false;
    const local = (state.status && state.status.brain && state.status.brain.local) || {};
    const lanes = (state.status && state.status.brain && state.status.brain.lanes) || [];
    const online = lanes.filter((lane) => lane.online).length;
    const cloud = settings.has_gemini
      ? "Gemini key detected · model <code>" + esc(settings.gemini_model || "gemini") + "</code>."
      : "No cloud key · set <code>JARVIS_GEMINI_KEY</code> for cloud reasoning and vision.";
    $("brainNote").innerHTML = cloud + " " + (online
      ? `${online} local Qwen lane${online === 1 ? "" : "s"} answering · ${esc(local.runtime && local.runtime.ram_gb ? local.runtime.ram_gb + " GB RAM" : "")}.`
      : `No local lane answering · RAM ${esc((local.runtime && local.runtime.ram_gb) || local.ram_gb || "?")} GB · run <code>ollama serve</code> or the SETUP commands.`);
    $("settingsModal").hidden = false;
    setTimeout(() => $("setOwner").focus({ preventScroll: true }), 60);
  }

  async function saveSettings() {
    const patch = {
      owner: $("setOwner").value.trim() || "Sir",
      city: $("setCity").value.trim(),
      language: $("setLanguage").value,
      wake_word: $("setWakeWord").value.trim() || "jarvis",
      voice_name: $("setVoice").value,
      music_dir: $("setMusicDir").value.trim(),
      voice_rate: Number($("setRate").value),
      speak: $("setSpeak").checked,
      sound: $("setSound").checked,
      wake_word_enabled: $("setWake").checked,
      barge_in: $("setBarge").checked,
      llm_enabled: $("setLlm").checked,
      brain_mode: $("setBrainMode").value,
      agent_enabled: $("setAgent").checked,
      agent_steps: Number($("setAgentSteps").value),
      adhd_mode: $("setAdhd").checked,
    };
    try {
      const payload = await api("/api/settings", { method: "POST", body: JSON.stringify(patch) });
      try {
        await api("/api/desktop", {
          method: "POST",
          body: JSON.stringify({ armed: $("setDesktop").checked }),
        });
      } catch { /* desktop endpoint is optional */ }
      applySettings(payload.settings || patch);
      $("settingsModal").hidden = true;
      (payload.warnings || []).forEach((warning) => toast("Configuration note", warning, "gold"));
      toast("Configuration saved", "Preferences applied to this session.");
      logLine("settings updated");
      beep(880, 0.06, 0.025);
      if (state.status) refreshStatus();
    } catch (error) {
      toast("Could not save", error.message, "alert");
    }
  }

  function closeModals() {
    if (!$("settingsModal").hidden) $("settingsModal").hidden = true;
    if (!$("approvalModal").hidden) closeApproval();
  }

  /* ------------------------------------------------------------------- boot */
  const BOOT_LINES = [
    ["Reactor core", "STABLE"],
    ["Neural lattice", "LINKED"],
    ["Tool registry", "LOADING"],
    ["Memory bank", "SYNCED"],
    ["Security envelope", "ARMED"],
    ["Audio channel", "READY"],
  ];

  function bootLog(line, value, warn = false) {
    const list = $("bootLog");
    const item = document.createElement("li");
    item.innerHTML = `<span>${esc(line)}</span><b class="${warn ? "warn" : ""}">${esc(value)}</b>`;
    list.appendChild(item);
    requestAnimationFrame(() => item.classList.add("on"));
  }

  let booting = false;

  async function boot() {
    if (booting || state.booted) return;
    booting = true;
    reactor.start();
    wave.start();
    tickClock();
    setInterval(tickClock, 1000);

    let status = null;
    let settings = null;
    try {
      [status, settings] = await Promise.all([api("/api/status"), api("/api/settings")]);
    } catch {
      /* offline boot: still allow entering, the HUD will retry */
    }

    if (settings && settings.settings) {
      applySettings(settings.settings);
    }
    if (status) {
      applyStatus(status);
      state.lastEventId = Number(status.events_last) || 0;
    }
    setupRecognition();

    const lines = [
      ["Reactor core", "STABLE", false],
      ["Neural lattice", status ? String(status.brain && status.brain.mode || "offline").toUpperCase() : "OFFLINE", !status],
      ["Tool registry", status ? `${status.tools} modules` : "UNREACHABLE", !status],
      ["Memory bank", "SYNCED", false],
      ["Security envelope", "ARMED", false],
      ["Audio channel", (window.speechSynthesis ? "READY" : "TEXT ONLY"), !window.speechSynthesis],
    ];

    for (let i = 0; i < lines.length; i += 1) {
      const [label, value, warn] = lines[i];
      await new Promise((resolve) => setTimeout(resolve, 230));
      bootLog(label, value, warn);
      $("bootBar").style.width = `${Math.round(((i + 1) / lines.length) * 100)}%`;
    }

    await new Promise((resolve) => setTimeout(resolve, 260));
    const enter = $("bootEnter");
    enter.disabled = false;
    enter.focus({ preventScroll: true });

    // Hands-free entry shortly after the diagnostic completes.
    setTimeout(() => {
      if (!state.booted && document.visibilityState !== "hidden") enterSystem();
    }, 1400);
  }

  async function enterSystem() {
    if (state.booted) return;
    state.booted = true;
    $("boot").classList.add("done");
    setTimeout(() => $("boot").remove(), 700);
    $("app").hidden = false;
    body.classList.add("online");
    setState("idle");

    addMessage("assistant", "All systems online, Sir. Reactor stable, tool layer armed. How may I assist?", {
      intent: "boot",
      provider: (state.status && state.status.brain && state.status.brain.mode) || "offline",
      time: currentStamp(),
    });
    logLine("J.A.R.V.I.S. online", "sys");
    logLine("security envelope armed");
    speak("All systems online, Sir. Reactor stable. How may I assist?");

    await Promise.all([refreshStatus(), loadSuggestions(), refreshAgenda()]);
    setTimeout(refreshAgenda, 2500);

    setInterval(refreshStatus, 6000);
    setInterval(refreshAgenda, 6000);
    setInterval(pollEvents, 3800);
    pollEvents();

    const input = $("input");
    setTimeout(() => input.focus({ preventScroll: true }), 400);

    // PWA shortcuts / share links: /?cmd=status%20report
    const params = new URLSearchParams(window.location.search);
    const shortcut = params.get("cmd");
    if (shortcut) {
      setTimeout(() => send(shortcut, "app"), 700);
      params.delete("cmd");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }
  }

  /* ----------------------------------------------------------------- events */
  function bind() {
    $("composer").addEventListener("submit", (event) => {
      event.preventDefault();
      const value = $("input").value;
      $("input").value = "";
      $("input").style.height = "auto";
      send(value, state.listening ? "voice" : "text");
    });

    const input = $("input");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        $("composer").requestSubmit();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(132, input.scrollHeight)}px`;
    });

    $("micBtn").addEventListener("click", toggleMic);
    $("visionBtn").addEventListener("click", () => $("visionInput").click());
    $("visionInput").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) analyseImage(file);
    });
    $("clearBtn").addEventListener("click", () => clearConversation(true));

    $("speakBtn").addEventListener("click", async () => {
      const next = !(state.settings && state.settings.speak);
      if (!state.settings) state.settings = {};
      state.settings.speak = next;
      $("speakBtn").setAttribute("aria-pressed", next ? "true" : "false");
      if (!next) stopSpeech();
      toast("Speech output", next ? "Spoken replies enabled." : "Spoken replies muted.", next ? "info" : "gold");
      try {
        await api("/api/settings", { method: "POST", body: JSON.stringify({ speak: next }) });
      } catch { /* local toggle is enough */ }
    });

    const installBtn = $("installBtn");
    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        if (!state.installPrompt) return;
        state.installPrompt.prompt();
        try {
          const choice = await state.installPrompt.userChoice;
          logLine(`install ${choice.outcome}`, "sys");
        } catch { /* ignore */ }
        state.installPrompt = null;
        installBtn.hidden = true;
      });
    }
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.installPrompt = event;
      if (installBtn && !window.matchMedia("(display-mode: standalone)").matches) installBtn.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      if (installBtn) installBtn.hidden = true;
      toast("Jarvis installed", "Open it from your home screen — fullscreen, no browser chrome.", "info");
    });
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    document.addEventListener("visibilitychange", () => {
      if (!state.recognition) return;
      if (document.hidden) {
        try { state.recognition.stop(); } catch { /* already idle */ }
      } else if (state.wakeLoop && !state.listening) {
        try { state.recognition.start(); } catch { /* restart race */ }
      }
    });

    $("bootEnter").addEventListener("click", enterSystem);
    $("settingsBtn").addEventListener("click", openSettings);
    const routeTestBtn = $("routeTestBtn");
    if (routeTestBtn) routeTestBtn.addEventListener("click", testRoute);
    const routeUseBtn = $("routeUseBtn");
    if (routeUseBtn) routeUseBtn.addEventListener("click", useFreeModels);
    $("saveSettings").addEventListener("click", saveSettings);
    $("approveBtn").addEventListener("click", () => decide(true));
    $("denyBtn").addEventListener("click", () => decide(false));
    $("testVoice").addEventListener("click", () => {
      if (!state.settings) state.settings = {};
      const previous = state.settings.voice_name;
      state.settings.voice_name = $("setVoice").value;
      stopSpeech();
      speak("All systems nominal, Sir. Voice channel calibrated.", { interrupt: true });
      state.settings.voice_name = previous;
    });
    $("setRate").addEventListener("input", (event) => {
      $("rateOut").textContent = Number(event.target.value).toFixed(2);
      if (state.settings) state.settings.voice_rate = Number(event.target.value);
    });
    $("setAgentSteps").addEventListener("input", (event) => {
      $("stepsOut").textContent = String(event.target.value);
    });
    $("brainSetupBtn").addEventListener("click", () => send("brain setup"));
    $("brainTestBtn").addEventListener("click", () => send("test local brain"));
    $("brainFocusBtn").addEventListener("click", () => {
      const on = Boolean(state.status && state.status.focus && state.status.focus.adhd_mode);
      send(on ? "normal mode" : "adhd mode on");
    });

    $$("[data-close]").forEach((node) => node.addEventListener("click", closeModals));

    document.addEventListener("keydown", (event) => {
      const typing = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("input").focus();
        return;
      }
      if (event.key === "Escape") {
        closeModals();
        stopSpeech();
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        $("input").focus();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.speaking) stopSpeech();
    });

    if (window.speechSynthesis) {
      if (typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      }
      loadVoices();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bind();
      boot();
    });
  } else {
    bind();
    boot();
  }
})();
