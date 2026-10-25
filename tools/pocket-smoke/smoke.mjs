import { readFileSync } from "node:fs";
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
    window.localStorage.setItem("jp.llm", JSON.stringify({ provider: "gemini", key: "test-key", model: "gemini-2.5-flash", stream: true }));
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
check("five tabs including Tasks", qa(".tab").length === 5, qa(".tab").map((t) => t.textContent.trim()).join(","));
check("task engine loaded", !!window.JarvisTasks);
check("connections loaded", !!window.JarvisConnections);

window.location.hash = "#/tasks";
await until("tasks screen", () => q("#taskGoal"));
check("tasks screen renders", /Naya kaam/.test(text("#view")));

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
await until("setup screen", () => q("#setupSaveKey"));
check("setup wizard renders four steps", /1\. Notifications/.test(text("#view")) && /4\. YouTube/.test(text("#view")));
window.localStorage.removeItem("jp.setup.done");
window.localStorage.setItem("jp.llm", JSON.stringify({ provider: "gemini", key: "", model: "gemini-2.5-flash", stream: true }));
check("setup auto-opens when no key", window.JarvisSetup.shouldAutoOpen() === true);
document.getElementById("setupKey").value = "test-key-2";
q("#setupSaveKey").click();
await until("setup key saved", () => window.JarvisLLM.isReady(), 8000);
check("setup saves and tests the key", window.JarvisLLM.isReady());
await until("setup finish", () => q("#setupFinish"));
document.getElementById("setupFinish").click();
await until("chat opened", () => window.location.hash === "#/" || window.location.hash === "", 4000);
check("setup marks itself done", window.JarvisUI.storeGet("setup.done", false) === true);

window.location.hash = "#/settings";
await until("settings", () => q("#keyInput"));
check("settings links connections", /Connections/.test(text("#view")));
check("no JS errors", errors.length === 0, errors.join(" | "));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
dom.window.close();
server.close();
process.exit(failed.length ? 1 : 0);
