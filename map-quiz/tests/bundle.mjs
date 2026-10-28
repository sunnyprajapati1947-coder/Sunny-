/* Verifies the downloadable single-file build actually boots and plays.
 * Run after `python3 tools/bundle.py` (npm run verify does this). */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const htmlPath = join(root, "download", "bharat-map-quiz.html");
const zipPath = join(root, "download", "bharat-map-quiz.zip");

let failures = 0;
const check = (label, condition, extra = "") => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
};

console.log("artifacts");
check("single-file build exists", existsSync(htmlPath));
check("zip package exists", existsSync(zipPath));
if (!existsSync(htmlPath)) process.exit(1);
const html = readFileSync(htmlPath, "utf8");
check("single file is self contained (no imports left)", !/^\s*import\s/m.test(html), "found import");
check("single file has no export keywords", !/^export\s/m.test(html), "found export");
check("no external stylesheet link", !/rel="stylesheet"/.test(html));
check("no external script src", !/<script[^>]+src=/.test(html));
check("map data inlined", html.includes("window.INDIA_MAP="));
check("downloads stay small enough for a phone", statSync(htmlPath).size < 900 * 1024, statSync(htmlPath).size);

const zipBytes = readFileSync(zipPath).toString("latin1");
check("zip contains a double-clickable index.html", zipBytes.includes("bharat-map-quiz/index.html"));
check("zip contains the laptop instructions", zipBytes.includes("bharat-map-quiz/README.txt"));
check("zip keeps the standalone service worker", zipBytes.includes("bharat-map-quiz/sw.js"));
check("zip stays small", statSync(zipPath).size < 900 * 1024, statSync(zipPath).size);

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => errors.push(error.message));
const dom = new JSDOM(html, {
  url: "http://localhost:8080/bharat-map-quiz.html",
  pretendToBeVisual: true,
  runScripts: "dangerously",
  virtualConsole,
});
const { window } = dom;
await new Promise((r) => setTimeout(r, 700));
const doc = window.document;
const click = (node) => node && node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

console.log("boot");
check("no runtime errors", errors.length === 0, errors.slice(0, 2).join(" | "));
check("mode cards rendered", doc.querySelectorAll(".mode-card").length === 9, doc.querySelectorAll(".mode-card").length);
check("difficulty chips rendered", doc.querySelectorAll("#difficultyChips .diff-chip").length === 3);
// the first-run tutorial opens itself — dismiss it before playing
if (doc.getElementById("howBackdrop").hidden === false) click(doc.getElementById("howStart"));
check("tutorial can be dismissed", doc.getElementById("howBackdrop").hidden === true);
check("hero map drawn", doc.querySelectorAll("#heroMap path.state").length === 36);
check("brand rendered", doc.getElementById("brandTitle").textContent === "Bharat Map Quiz");

console.log("play");
check(
  "easy is the default for a new player",
  doc.querySelector('#difficultyChips .diff-chip[data-diff="easy"]').classList.contains("active")
);
click(doc.querySelector('.mode-card[data-mode="capital"]'));
check("capital round starts", doc.getElementById("screen-quiz").hidden === false);
check("easy round offers three options", doc.querySelectorAll("#options .option").length === 3);
click(doc.getElementById("skipBtn"));
click(doc.getElementById("nextBtn"));
click(doc.getElementById("backBtn"));

click(doc.querySelector('#difficultyChips .diff-chip[data-diff="normal"]'));
click(doc.querySelector('.mode-card[data-mode="capital"]'));
check("four options", doc.querySelectorAll("#options .option").length === 4);
check("prompt is English", /What is the capital of|Which state has/.test(doc.getElementById("prompt").textContent));
click(doc.querySelector("#options .option"));
check("feedback appears", doc.getElementById("feedback").hidden === false);
check("answer marked", Boolean(doc.querySelector("#options .option.correct")));

click(doc.getElementById("settingsBtn"));
check("settings open", doc.getElementById("settingsBackdrop").hidden === false);
check("download buttons hidden in single-file mode", doc.getElementById("downloadHtml").hidden === true);
check("offline hint replaces download links", /already running the offline single-file build/.test(doc.getElementById("downloadSub").textContent));
click(doc.getElementById("settingsClose"));
check("settings close", doc.getElementById("settingsBackdrop").hidden === true);

console.log(failures ? `\n${failures} check(s) failed` : "\nbundle checks passed");
process.exit(failures ? 1 : 0);
