import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../../apps/jarvis-pocket/", import.meta.url).pathname.replace(/\/$/, "");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error("escape");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("nope");
  }
});
await new Promise((r) => server.listen(8899, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:8899";

const errors = [];
const mode = { fail: 0, plan: JSON.stringify({ steps: ["Pehla step karo", "Dusra step karo"] }), chat: "" };
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const dom = new JSDOM(html, {
  url: ORIGIN + "/#/",
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
        if (mode.fail > 0) { mode.fail -= 1; return Promise.resolve(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })); }
        const body = JSON.parse(init && init.body ? init.body : "{}");
        const system = (body.systemInstruction && body.systemInstruction.parts[0].text) || "";
        let text = "Step ka result: done ✅";
        if (system.includes("You plan work") || system.includes("vertical-video")) text = mode.plan;
        else if (mode.chat) { text = mode.chat; mode.chat = ""; }
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      if (url.includes("googleapis.com/youtube")) {
        return Promise.resolve(new Response(JSON.stringify({ items: [{ id: { videoId: "abc" }, snippet: { title: "Test video", channelTitle: "Test" } }] }), { status: 200 }));
      }
      return globalThis.fetch(new URL(url, ORIGIN).toString(), init);
    };
    window.__JARVIS_TEST_COMPLETE = (opts) => {
      const system = String(opts.system || "");
      if (mode.fail > 0) { mode.fail -= 1; return Promise.reject(new Error("boom")); }
      let text = "Step result: done";
      if (system.includes("You plan work") || system.includes("vertical-video")) text = mode.plan;
      else if (mode.chat) { text = mode.chat; mode.chat = ""; }
      if (opts.onDelta) opts.onDelta(text);
      return text;
    };
    window.localStorage.setItem("jp.llm", JSON.stringify({ provider: "local", model: "qwen3.5-0.8b", stream: true }));
    window.scrollTo = () => {};
    const stubCtx = () => ({
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, fillText() {}, measureText: (t) => ({ width: String(t).length * 12 }),
      set font(v) {}, get font() { return ""; }, fillStyle: "", textAlign: "", textBaseline: ""
    });
    window.HTMLCanvasElement.prototype.getContext = function () { return stubCtx(); };
    window.HTMLCanvasElement.prototype.captureStream = function () { return { getTracks: () => [{ stop() {} }] }; };
    class FakeRecorder {
      constructor(stream, opts) { this.state = "inactive"; this.mimeType = opts.mimeType; this.ondataavailable = null; this.onstop = null; this.onerror = null; }
      static isTypeSupported(t) { return t === "video/webm;codecs=vp8"; }
      start() {
        this.state = "recording";
        setTimeout(() => {
          if (this.state !== "recording") return;
          this.state = "inactive";
          this.ondataavailable && this.ondataavailable({ data: new window.Blob(["fake-webm-bytes".repeat(64)]) });
          this.onstop && this.onstop();
        }, 60);
      }
      stop() { if (this.state === "inactive") return; this.state = "inactive"; this.ondataavailable && this.ondataavailable({ data: new window.Blob(["fake-webm-bytes".repeat(64)]) }); this.onstop && this.onstop(); }
    }
    window.MediaRecorder = FakeRecorder;
    window.URL.createObjectURL = () => "blob:fake-video";
    window.URL.revokeObjectURL = () => {};
    window.HTMLElement.prototype.scrollTo = () => {};
    window.onerror = (m) => errors.push(String(m));
    window.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + (e.reason?.message || e.reason)));
  },
});
const { window } = dom;
const { document } = window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function q(sel) { return document.querySelector(sel); }
function qa(sel) { return [...document.querySelectorAll(sel)]; }
function text(sel) { return q(sel)?.textContent?.trim() || ""; }
async function until(label, fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(80);
  }
  throw new Error("timeout: " + label + " | " + document.body.textContent.slice(0, 200));
}
const results = [];
function check(name, ok, extra = "") { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`); }

await until("boot", () => text("#brandSub").includes("items"));
// The scripted brain stands in for the model; mark it ready so planning runs.
window.JarvisLocalBrain.isReady = () => true;
check("five tabs including Tasks", qa(".tab").length === 5, qa(".tab").map((t) => t.textContent.trim()).join(","));
check("task engine loaded", !!window.JarvisTasks);
check("connections loaded", !!window.JarvisConnections);

window.location.hash = "#/tasks";
await until("tasks screen", () => q("#taskGoal"));
check("tasks screen renders", /New task/.test(text("#view")));

q("#taskGoal").value = "Test goal: do steps";
q("#taskAdd").click();
await until("task created", () => qa(".task-card").length === 1);
const id = q(".task-card").dataset.task;
await until("task done", () => window.JarvisTasks.list()[0].status === "DONE", 15000);
const task = window.JarvisTasks.list()[0];
check("task planned two steps", task.steps.length === 2, task.steps.map((s) => s.title).join(" | "));
check("task completed with results", task.steps.every((s) => s.status === "done" && s.result));
check("task UI shows done", /DONE/.test(text(".task-card")));
check("task id persisted", !!window.localStorage.getItem("jp.tasks") && !!id);

// failure path: two failures per step force retries, then redo succeeds
mode.fail = 4;
const failing = window.JarvisTasks.create("Fail once then succeed", { steps: ["only step"] });
await window.JarvisTasks.run(failing.id);
const afterFail = window.JarvisTasks.list().find((t) => t.id === failing.id);
check("failed task keeps error + retry count", afterFail.status === "FAILED" && afterFail.steps[0].tries >= 2,
  `${afterFail.status}/${afterFail.steps[0].tries}`);
mode.fail = 0;
window.JarvisTasks.redo(failing.id);
await until("retry done", () => window.JarvisTasks.list().find((t) => t.id === failing.id).status === "DONE", 15000);
check("retry after failure completes", window.JarvisTasks.list().find((t) => t.id === failing.id).status === "DONE");

window.location.hash = "#/connections";
await until("connections", () => q("#ytKey"));
check("connections screen renders", /Connections/.test(text("#view")) && !!q("#ytSave"));
document.getElementById("ytKey").value = "test-key";
q("#ytSave").click();
check("youtube key saved", !!window.localStorage.getItem("jp.conn.youtubeKey"));
document.getElementById("ytQuery").value = "ai";
q("#ytSearch").click();
await until("youtube results", () => /Test video/.test(document.querySelector("#sheet")?.textContent || ""));
check("youtube search works with key", /Test video/.test(document.querySelector("#sheet").textContent));

// chat tool: task_create must really queue a task
window.location.hash = "#/";
await until("chat screen", () => q("#chatInput"));
mode.chat = '<tool>{"name":"task_create","goal":"Chat se bana task","title":"Chat task"}</tool>';
q("#chatInput").value = "ek task banao";
q("#sendBtn").click();
await until("chat created task", () => window.JarvisTasks.list().some((t) => t.title === "Chat task"), 12000);
check("chat task_create tool works", window.JarvisTasks.list().some((t) => t.title === "Chat task"));
check("tool tag hidden from reply", !(q(".msg-body")?.textContent || "").includes("<tool>"));

window.location.hash = "#/tasks";
await until("tasks again", () => q("#taskGoal"));
check("tasks screen lists chat task", /Chat task/.test(text("#view")));

// video studio: plan + record + gallery auto-save
window.location.hash = "#/video";
await until("video screen", () => q("#videoStart"));
check("video screen renders", /Video studio/.test(text("#view")) && !!q("#videoPrompt"));
mode.plan = JSON.stringify({ title: "Test reel", scenes: [{ text: "Pehla scene", seconds: 1.5 }] });
const vplan = await window.JarvisVideo.plan("test topic");
check("video plan parses scenes", vplan.title === "Test reel" && vplan.scenes.length === 1, JSON.stringify(vplan).slice(0, 80));
const saved = [];
window.JarvisNative.available = true;
window.JarvisNative.saveToGallery = (payload) => { saved.push(payload); return Promise.resolve({ ok: true, uri: "content://media/1" }); };
const out = await window.JarvisVideo.create("test topic", { size: "vertical" });
check("video recorded and auto-saved to gallery", saved.length === 1 && saved[0].mime.startsWith("video/") && saved[0].base64.length > 100,
  JSON.stringify(saved.map((x) => ({ mime: x.mime, len: x.base64.length, head: x.base64.slice(0, 30) }))));
check("video result panel shown", !document.getElementById("videoResult").hidden && /Test reel/.test(document.getElementById("videoResult").textContent));

// first-run setup wizard
window.location.hash = "#/setup";
await until("setup screen", () => q("#setupFinish"));
check("setup wizard renders four steps", /1\. Notifications/.test(text("#view")) && /4\. YouTube/.test(text("#view")));
check("setup offers the on-device brain", /On-device brain/.test(text("#view")) && /#\/local/.test(q("#view").innerHTML));
window.localStorage.removeItem("jp.setup.done");
const readyStub = window.JarvisLocalBrain.isReady;
window.JarvisLocalBrain.isReady = () => false;
check("setup auto-opens without a brain", window.JarvisSetup.shouldAutoOpen() === true);
window.JarvisLocalBrain.isReady = readyStub;
await until("setup finish", () => q("#setupFinish"));
document.getElementById("setupFinish").click();
await until("chat opened", () => window.location.hash === "#/" || window.location.hash === "", 4000);
check("setup marks itself done", window.JarvisUI.storeGet("setup.done", false) === true);

// local brain (Qwen3.5 on device)
window.location.hash = "#/local";
await until("local brain screen", () => q("#brainDownload"));
check("model catalog is Qwen3.5", window.JarvisModel.catalog().some((m) => /Qwen3\.5/.test(m.label)));
check("model manager lists the exact files", window.JarvisModel.filesFor(window.JarvisModel.find("qwen3.5-0.8b"), "webgpu")
  .some((f) => f.path === "onnx/model_q4f16.onnx_data") &&
  window.JarvisModel.filesFor(window.JarvisModel.find("qwen3.5-0.8b"), "wasm")
  .some((f) => f.path === "onnx/model_q4.onnx"));
check("model cache keys match the engine", window.JarvisModel.canonical("a/b", "config.json")
  === "https://huggingface.co/a/b/resolve/main/config.json");
check("model manager screen renders", /Local brain/.test(text("#view")) && /Diagnose/.test(text("#view")));
const realGenerate = window.JarvisLocalBrain.generate;
const realReady = window.JarvisLocalBrain.isReady;
window.JarvisLocalBrain.generate = (opts) => { if (opts.onDelta) opts.onDelta("hello "); if (opts.onDelta) opts.onDelta("boss"); return Promise.resolve("hello boss"); };
window.JarvisLocalBrain.isReady = () => true;
window.JarvisLLM.save({ provider: "local", model: "qwen3.5-0.8b" });
check("local provider is ready without a key", window.JarvisLLM.isReady() === true);
let deltas = "";
const seam = window.__JARVIS_TEST_COMPLETE;
window.__JARVIS_TEST_COMPLETE = undefined;
const localReply = await window.JarvisLLM.complete({ system: "sys", messages: [{ role: "user", content: "hi" }], onDelta: (t) => { deltas += t; } });
window.__JARVIS_TEST_COMPLETE = seam;
check("local provider streams through JarvisLocalBrain", localReply === "hello boss" && deltas === "hello boss", `${localReply}/${deltas}`);
window.JarvisLocalBrain.generate = realGenerate;
window.JarvisLocalBrain.isReady = realReady;

window.location.hash = "#/settings";
await until("settings", () => q('[href="#/local"]'));
check("settings links connections", /Connections/.test(text("#view")));
check("settings links the local brain", /Local brain/.test(text("#view")) && !!q('[href="#/local"]'));
check("settings has no cloud key field", !q("#keyInput"));

// --- on-device engine wiring (static files, no network) --------------------
const vendor = join(ROOT, "vendor", "transformers");
const engineFiles = ["transformers.web.min.js.gz", "ort.bundle.min.mjs",
  "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
check("local engine files are vendored", engineFiles.every((f) => existsSync(join(vendor, f))),
  engineFiles.filter((f) => !existsSync(join(vendor, f))).join(", "));
const gzHead = readFileSync(join(vendor, "transformers.web.min.js.gz")).subarray(0, 2);
check("engine file is gzip", gzHead[0] === 0x1f && gzHead[1] === 0x8b, [...gzHead].join(","));
const brainSrc = readFileSync(join(ROOT, "assets", "js", "local-brain.js"), "utf8");
check("engine loader rewrites both onnxruntime specifiers",
  brainSrc.includes('from"onnxruntime-common"') && brainSrc.includes("onnxruntime-web\\/webgpu"));
check("engine loader decompresses and imports a blob", brainSrc.includes("DecompressionStream") &&
  brainSrc.includes("URL.createObjectURL"));
const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
check("no stale import map in index.html", !indexHtml.includes('type="importmap"'));

// --- local knowledge base (BM25 on the phone) ------------------------------
const kb = window.JarvisKB;
const added = kb.add({ title: "Voice notes", text: "Jarvis can record a voice note and store it locally. ".repeat(6) });
check("knowledge base indexes a document", added.ok && added.parts >= 1, JSON.stringify(added));
const kbHits = kb.search("voice note", 3);
check("knowledge base ranks the right passage", kbHits.length > 0 && /voice/i.test(kbHits[0].text), JSON.stringify(kbHits[0] || {}).slice(0, 80));
check("knowledge base ignores a stop word only query", kb.search("the and", 3).length === 0);

// --- verified tool layer ---------------------------------------------------
const T = window.JarvisTools;
check("tools validate required arguments", T.validate("open_app", {}).ok === false &&
  T.validate("open_app", { app: "YouTube" }).ok === true);
check("tools reject unknown names", T.validate("rm_rf", {}).ok === false);
check("router maps a battery question", (() => {
  const r = T.routeCommand("check my battery");
  return r && r.tool === "device_stats";
})());
check("router maps 'open <app>'", (() => {
  const r = T.routeCommand("open YouTube");
  return r && r.tool === "open_app" && r.args.app === "YouTube";
})());
check("router maps 'play <song>'", (() => {
  const r = T.routeCommand("play kesariya");
  return r && r.tool === "play_music" && r.args.query === "kesariya";
})());
check("router maps a Hinglish music command", (() => {
  const r = T.routeCommand("tum hi ho bajao");
  return r && r.tool === "play_music" && /tum hi ho/i.test(r.args.query);
})());
check("router maps an alarm time", (() => {
  const r = T.routeCommand("set alarm 7:30");
  return r && r.tool === "add_alarm" && r.args.hour === 7 && r.args.minute === 30;
})());
check("router maps a WhatsApp draft", (() => {
  const r = T.routeCommand("whatsapp 919876543210 hello boss");
  return r && r.tool === "send_message" && r.args.number === "919876543210" && /hello boss/.test(r.args.text);
})());
check("router maps a weather question", (() => {
  const r = T.routeCommand("mausam in Patna");
  return r && r.tool === "weather" && /patna/i.test(r.args.city);
})());
check("router does not hijack a normal sentence", T.routeCommand(
  "explain how gradient descent works in simple words with an example") === null);
check("new media/message tools are registered", ["play_music", "add_alarm", "send_message",
  "weather", "net_speed"].every((name) => !!T.get(name)));
const toolRun = await T.run("phone_capabilities", {});
check("tool run reports verification honestly", toolRun.tool === "phone_capabilities" &&
  typeof toolRun.verified === "boolean" && typeof toolRun.text === "string");

// --- memory guard ----------------------------------------------------------
const secretSave = window.JarvisMemory.add("api_key = sk-abcdefghijklmnop123456");
check("memory refuses secrets", secretSave.ok === false);
const plainSave = window.JarvisMemory.add("I build Android apps");
check("memory stores a normal fact", plainSave.ok === true);

// --- memory guard (10 GB budget, runtime measurement) ----------------------
const mem = window.JarvisMem;
check("memory budget caps at 10 GB", mem.CAP_MB === 10240);
mem.setBudget(1024);
const tight = mem.check(1400);
check("guard blocks a brain that does not fit the budget", tight.ok === false && tight.reason === "budget",
  JSON.stringify(tight).slice(0, 120));
mem.setBudget(4096);
const recovered = await mem.recover("smoke test");
check("memory recovery explains what happened", typeof recovered.released === "boolean" &&
  /unload/i.test(recovered.advice) && !!recovered.snapshot);

// --- coding studio (sandboxed, on-device files) ----------------------------
const Code = window.JarvisCode;
const projectId = Code.create("Smoke project");
check("code project is created with starter files", Code.filesOf(projectId).length === 3,
  String(Code.filesOf(projectId).length));
const preview = Code.buildDocument(projectId);
check("preview inlines css and js into one sandboxed document",
  /<style>/.test(preview) && /<script>/.test(preview) && !/src="app\.js"/.test(preview));
Code.remove(projectId);
check("project delete removes its files", Code.filesOf(projectId).length === 0);

// --- policy: no cloud AI anywhere, confirmation before risky actions -------
const cloudHosts = ["api.openai.com", "generativelanguage.googleapis.com", "openrouter.ai",
  "api.anthropic.com", "api.groq.com", "api.deepseek.com"];
const shipped = ["app.js", "chat.js", "library.js", "tasks.js", "connections.js", "video.js",
  "setup.js", "llm.js", "voice.js", "brain.js", "local-brain.js", "native.js", "core.js",
  "db.js", "kb.js", "model.js", "tools.js", "dash.js", "memory.js", "code.js", "mem.js"];
const cloudHits = shipped.filter((name) => {
  const src = readFileSync(join(ROOT, "assets", "js", name), "utf8");
  return cloudHosts.some((host) => src.includes(host));
});
check("no cloud AI endpoint in the shipped code", cloudHits.length === 0, cloudHits.join(", "));
const risky = ["open_app", "add_calendar_event", "set_reminder", "share_text", "open_url"];
check("high-impact tools ask before running", risky.every((name) => T.get(name) && T.get(name).confirm === true));
check("tool registry covers the phone actions", ["device_stats", "list_apps", "write_note", "read_note",
  "list_notes", "media_control", "notify", "search_documents", "remember"]
  .every((name) => !!T.get(name)));

// --- dashboard -------------------------------------------------------------
window.location.hash = "#/dash";
await until("dashboard", () => q("#dashDiag"));
check("dashboard renders every panel", /On-device brain/.test(text("#view")) && /Permissions/.test(text("#view")) &&
  /Local knowledge/.test(text("#view")) && /Privacy/.test(text("#view")));

// --- English-only UI guardrail -------------------------------------------
const hinglish = /\b(karo|karein|karna|karne|nahi|nahin|aap|apna|apne|apni|yeh|woh|kya|kaise|kuch|bahut|bohot|chahiye|milega|padega|kholo|bolo|poocho|dekho|samjho|theek|thik|galat|abhi|phir|sirf|sabse|dobara|taiyar|banao|banega|hoga|hogi|hota|raha|rahi|rahe|hai|hain|hoon|mujhe|tumhe|wala|wali|wale|jaise|warna|matlab|saath|bina|andar|upar|neeche)\b/i;
const uiFiles = ["app.js", "chat.js", "library.js", "tasks.js", "connections.js", "video.js",
  "setup.js", "llm.js", "voice.js", "brain.js", "local-brain.js", "native.js", "core.js",
  "db.js", "kb.js", "model.js", "tools.js", "dash.js", "memory.js", "code.js", "mem.js"];
const leftovers = [];
for (const name of uiFiles) {
  const src = readFileSync(join(ROOT, "assets", "js", name), "utf8");
  for (const line of src.split("\n")) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("/*")) continue;
    if (/ready hai boss/.test(line)) continue;  // the one phrase the owner asked to keep
    if (/i18n-ok/.test(line)) continue;  // command patterns accept Hindi input; the UI stays English
    const hit = line.match(hinglish);
    if (hit) leftovers.push(`${name}: ${hit[0]}`);
  }
}
check("UI strings are English", leftovers.length === 0, leftovers.slice(0, 4).join(", "));

check("no JS errors", errors.length === 0, errors.join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
dom.window.close();
server.close();
process.exit(failed.length ? 1 : 0);
