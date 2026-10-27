/* Headless smoke test: boots the real app in jsdom and plays through every mode.
 * Run with `npm test` (needs the dev dependency jsdom). */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

let failures = 0;
const errors = [];

function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => {
  errors.push(error.message);
  console.log("  JS ERROR:", error.message);
});

const dom = new JSDOM(readFileSync(join(root, "index.html"), "utf8"), {
  url: "http://localhost:8080/index.html",
  pretendToBeVisual: true,
  runScripts: "outside-only",
  virtualConsole,
});
const { window } = dom;

/* expose the browser globals the app modules expect */
const globals = {
  window: window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  location: window.location,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  performance: window.performance,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
};
for (const [key, value] of Object.entries(globals)) {
  if (value === undefined) continue;
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

/* the map geometry is a classic script in production */
window.eval(readFileSync(join(root, "src", "map-data.js"), "utf8"));

const { UNITS, unitName } = await import(pathToFileURL(join(root, "src", "data.js")).href);
await import(pathToFileURL(join(root, "src", "app.js")).href);

const $ = (id) => window.document.getElementById(id);
const screen = () => [...window.document.querySelectorAll(".screen")].find((s) => !s.hidden)?.dataset.screen;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const card = (index) => [...$("modeGrid").children][index];
const quizShapes = () => [...$("quizMap").querySelectorAll("path.state")];

console.log("home");
check("home screen visible", screen() === "home", screen());
check("5 mode cards", $("modeGrid").children.length === 5, $("modeGrid").children.length);
check("7 region chips", $("regionChips").children.length === 7, $("regionChips").children.length);
check("hero map has 36 shapes", $("heroMap").querySelectorAll("path.state").length === 36);
check("mastery counter starts at 0", $("masteredCount").textContent === "0");
check("36 in the denominator", $("masteredOf").textContent.includes("36"));

console.log("learn");
$("heroMapBtn").click();
check("learn screen visible", screen() === "learn");
check("learn map labels present", $("learnMap").querySelectorAll("text.state-label").length >= 25);
const goa = $("learnMap").querySelector('path[data-id="goa"]');
check("goa path exists", Boolean(goa));
click(goa);
check("sheet opened", !$("sheetBackdrop").hidden);
check("sheet names Goa", $("sheetName").textContent === "Goa", $("sheetName").textContent);
check("sheet shows Panaji", $("sheetCapital").textContent.includes("Panaji"), $("sheetCapital").textContent);
check("sheet shows a fact", $("sheetFact").textContent.length > 10);
$("sheetClose").click();
check("sheet closed", $("sheetBackdrop").hidden);
$("zoomIn").click();
check("zoom applied", $("learnMap").style.transform.includes("scale"), $("learnMap").style.transform);

/* ---------------- locate round, answered wrong on purpose ---------------- */
console.log("locate round (wrong answers)");
$("backBtn").click();
check("back to home", screen() === "home");
card(0).click();
check("quiz screen visible", screen() === "quiz");
check("prompt asks kahan hai", $("prompt").textContent.includes("kahan hai"), $("prompt").textContent);
check("locate map has 36 shapes", quizShapes().length === 36);

let hits = 0;
for (let i = 0; i < 10; i++) {
  const before = $("qCounter").textContent;
  click(quizShapes()[0]);
  if ($("feedbackTitle").textContent.startsWith("Sahi")) hits += 1;
  check(`q${i + 1} answered`, !$("feedback").hidden, before);
  check(`q${i + 1} feedback names the answer`, $("feedbackTitle").textContent.length > 6);
  check(`q${i + 1} target revealed`, Boolean($("quizMap").querySelector("path.state.is-correct")));
  $("nextBtn").click();
  await sleep(30);
}
check("reached result screen", screen() === "result", screen());
check("stars rendered", $("resultStars").textContent.length === 3, $("resultStars").textContent);
check("missed list populated", $("missedList").textContent.length > 0);
const afterWrong = JSON.parse(window.localStorage.getItem("bharat-map-quiz.v1"));
check("10 answers recorded", afterWrong.answers === 10, afterWrong.answers);
check("credit matches played answers", afterWrong.correct === hits, `${afterWrong.correct} vs ${hits}`);

/* ---------------- identify round, answered correctly ---------------- */
console.log("identify round (correct answers)");
$("homeBtn").click();
card(1).click();
check("identify has 4 options", $("options").children.length === 4, $("options").children.length);
check("others are dimmed", $("quizMap").querySelectorAll("path.is-dim").length === 35);
const targetPath = $("quizMap").querySelector("path.is-target");
const targetId = targetPath?.dataset.id;
check("one target highlighted", Boolean(targetId), targetId);
const targetName = unitName(UNITS[targetId], "hing");
const rightOption = [...$("options").children].find(
  (b) => b.querySelector(".label").textContent === targetName
);
check("correct option offered", Boolean(rightOption), targetName);
click(rightOption);
check("correct feedback", $("feedbackTitle").textContent.startsWith("Sahi"), $("feedbackTitle").textContent);
await sleep(1050);
check("auto-advanced to q2", $("qCounter").textContent.startsWith("2/"), $("qCounter").textContent);
let guard = 0;
while (screen() === "quiz" && guard++ < 20) {
  click($("options").children[0]);
  await sleep(1020);
  if (screen() === "quiz") $("nextBtn").click();
  await sleep(30);
}
check("identify round finished", screen() === "result", screen());

/* ---------------- capital round ---------------- */
console.log("capital round");
$("homeBtn").click();
card(2).click();
check("capital has 4 options", $("options").children.length === 4);
check("capital prompt mentions rajdhani", $("prompt").textContent.includes("rajdhani"), $("prompt").textContent);
click($("options").children[0]);
check("capital feedback shown", !$("feedback").hidden);
check("a capital option is marked correct", Boolean($("options").querySelector(".option.correct")));

/* ---------------- sprint ---------------- */
console.log("sprint");
$("backBtn").click(); /* leaves quiz mid-round, back home */
check("mid-round quit returns home", screen() === "home", screen());
card(3).click();
check("sprint timer visible", !$("hudTimer").hidden);
check("sprint starts at 1/36", $("qCounter").textContent.startsWith("1/36"), $("qCounter").textContent);
$("hintBtn").click();
check("hint shows a region clue", $("prompt").textContent.toLowerCase().includes("hint"), $("prompt").textContent);
check("hint is disabled after use", $("hintBtn").disabled);
$("skipBtn").click();
check("skip reveals the answer", !$("feedback").hidden);

/* ---------------- language ---------------- */
console.log("language");
$("backBtn").click();
$("langBtn").click();
check("hindi labels", $("regionChips").textContent.includes("पूरा भारत"), $("regionChips").textContent);
$("langBtn").click();
check("english labels", $("regionChips").textContent.includes("All India"), $("regionChips").textContent);
$("langBtn").click();

/* ---------------- persistence ---------------- */
console.log("persistence");
const saved = JSON.parse(window.localStorage.getItem("bharat-map-quiz.v1"));
check("profile saved", saved && typeof saved.xp === "number", saved?.xp);
check("per-state stats exist", Object.keys(saved.stats || {}).length > 10, Object.keys(saved.stats || {}).length);
check("answers counted", saved.answers > 10, saved.answers);
check("some state reached mastery", Object.values(saved.stats).some((s) => s.mastery > 0));

console.log("errors");
check("no runtime errors", errors.length === 0, errors.join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
