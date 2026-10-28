/* Headless smoke test: boots the real app in jsdom and plays every mode.
 * Run with `npm test` (needs the dev dependency jsdom). */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

let failures = 0;
const errors = [];
const check = (label, condition, extra = "") => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
};

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

const globals = {
  window,
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

window.eval(readFileSync(join(root, "src", "map-data.js"), "utf8"));

const { UNITS, unitName, capitalName } = await import(pathToFileURL(join(root, "src", "data.js")).href);
await import(pathToFileURL(join(root, "src", "app.js")).href);

const $ = (id) => window.document.getElementById(id);
const screen = () =>
  [...window.document.querySelectorAll(".screen")].find((s) => !s.hidden)?.dataset.screen;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (node) => node && node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const modeCard = (mode) => window.document.querySelector(`.mode-card[data-mode="${mode}"]`);
const quizShapes = () => [...$("quizMap").querySelectorAll("path.state")];
const saved = () => JSON.parse(window.localStorage.getItem("bharat-map-quiz.v2") || "{}");

async function finishRound(limit = 90) {
  for (let i = 0; i < limit && screen() === "quiz"; i++) {
    if (!$("feedback").hidden) click($("nextBtn"));
    else if (!$("skipBtn").disabled) click($("skipBtn"));
    await sleep(15);
  }
}

async function goHome() {
  click($("homeBtn"));
  await sleep(20);
}

// the classic checks below describe Normal difficulty (4 options, no retry)
window.__bharatQuiz.setDifficulty("normal");
await sleep(15);

/* ------------------------------------------------------------------ home */
console.log("home");
check("home screen visible", screen() === "home", screen());
check("brand is English", $("brandTitle").textContent === "Bharat Map Quiz", $("brandTitle").textContent);
check("starts at level 1", $("levelBtn").textContent === "Lv 1", $("levelBtn").textContent);
check("core mode cards", window.document.querySelectorAll("#modeGrid .mode-card").length === 5);
check("extra mode cards", window.document.querySelectorAll("#extraGrid .mode-card").length === 4);
check("7 region chips", $("regionChips").children.length === 7);
check("hero map has 36 shapes", $("heroMap").querySelectorAll("path.state").length === 36);
check("mastery counter at 0", $("masteredCount").textContent === "0");
check("daily card offers play", $("dailyCta").textContent === "Play", $("dailyCta").textContent);
check("every core mode has a label", [...window.document.querySelectorAll(".mode-card strong")].every((n) => n.textContent.trim().length > 2));

/* ----------------------------------------------------------------- learn */
console.log("learn");
click($("tabbar").querySelector('[data-tab="learn"]'));
check("learn screen visible", screen() === "learn");
check("map labels rendered", $("learnMap").querySelectorAll("text.state-label").length >= 25);
check("label toggle starts on States", $("labelToggle").textContent === "States");
click($("labelToggle"));
check("toggle shows capitals", $("labelToggle").textContent === "Capitals");
const keralaLabel = $("learnMap").querySelector('[data-label-for="kerala"]');
check("capital labels use capitals", /Thiruvananthapuram/.test(keralaLabel.textContent), keralaLabel.textContent);
click($("labelToggle"));
check("toggle can hide labels", $("labelToggle").textContent === "Off" && $("learnMap").querySelector(".labels").style.display === "none");
click($("labelToggle"));
const goa = $("learnMap").querySelector('path[data-id="goa"]');
click(goa);
check("state sheet opened", !$("sheetBackdrop").hidden);
check("sheet is English", $("sheetName").textContent === "Goa", $("sheetName").textContent);
check("sheet shows capital", $("sheetCapital").textContent.includes("Panaji"), $("sheetCapital").textContent);
check("sheet shows fact", $("sheetFact").textContent.length > 10);
check("sheet meta says State", /State ·/.test($("sheetMeta").textContent), $("sheetMeta").textContent);
click($("sheetClose"));
check("sheet closed", $("sheetBackdrop").hidden);
click($("listBtn"));
check("state list opened", !$("listBackdrop").hidden);
check("state list has 36 rows", $("listRows").children.length === 36, $("listRows").children.length);
$("listSearch").value = "kera";
$("listSearch").dispatchEvent(new window.Event("input", { bubbles: true }));
check("search filters", $("listRows").children.length === 1, $("listRows").children.length);
click($("listClose"));

/* ---------------------------------------------------------- locate round */
console.log("locate round");
click($("tabbar").querySelector('[data-tab="home"]'));
click(modeCard("locate"));
check("quiz screen visible", screen() === "quiz");
check("prompt asks where", /Where is /.test($("prompt").textContent), $("prompt").textContent);
check("locate map has 36 shapes", quizShapes().length === 36);
check("hint and skip offered", !$("hintBtn").disabled && !$("skipBtn").disabled);
click($("hintBtn"));
check("hint adds a clue", $("prompt").textContent.includes("Hint:"), $("prompt").textContent);
click(quizShapes()[0]);
check("answer shows feedback", !$("feedback").hidden);
check("feedback names the state", /it was /.test($("feedbackTitle").textContent) || $("feedbackTitle").textContent.startsWith("Correct"), $("feedbackTitle").textContent);
await finishRound();
check("result screen reached", screen() === "result", screen());
check("stars rendered", $("resultStars").textContent.length === 3);
check("review lists every question", window.document.querySelectorAll(".review-row").length === 10, window.document.querySelectorAll(".review-row").length);
check("review marks correct/incorrect", window.document.querySelectorAll(".review-row.no").length >= 1);

/* -------------------------------------------------------- identify round */
console.log("identify round");
await goHome();
click(modeCard("identify"));
check("4 name options", $("options").children.length === 4, $("options").children.length);
check("one shape highlighted", Boolean($("quizMap").querySelector("path.is-target")));
check("35 shapes dimmed", $("quizMap").querySelectorAll("path.is-dim").length === 35);
check("no map tapping in identify", quizShapes()[0].classList.contains("state"));
const targetId = $("quizMap").querySelector("path.is-target").dataset.id;
const rightLabel = unitName(UNITS[targetId], "en");
const rightOption = [...$("options").children].find((b) => b.querySelector(".label").textContent === rightLabel);
check("correct option present", Boolean(rightOption), rightLabel);
click(rightOption);
check("correct feedback", $("feedbackTitle").textContent.startsWith("Correct"), $("feedbackTitle").textContent);
check("all options locked after answering", [...$("options").children].every((b) => b.disabled));
await sleep(1300);
check("auto-advanced to question 2", $("qCounter").textContent.startsWith("2/"), $("qCounter").textContent);
await finishRound();
check("identify round finished", screen() === "result");

/* --------------------------------------------------------- capital round */
console.log("capital round");
await goHome();
click(modeCard("capital"));
check("capital question asked", /capital of/.test($("prompt").textContent) || /as its capital/.test($("prompt").textContent), $("prompt").textContent);
check("4 capital options", $("options").children.length === 4);
check("options are unique", new Set([...$("options").children].map((b) => b.dataset.key)).size === 4);
await finishRound();

/* ------------------------------------------------------ neighbours round */
console.log("neighbours round");
await goHome();
click(modeCard("neighbours"));
check("neighbour question asked", /border/.test($("prompt").textContent), $("prompt").textContent);
check("4 neighbour options", $("options").children.length === 4);
const neighbourTarget = $("quizMap").querySelector("path.is-target");
check("target shown but map not interactive", Boolean(neighbourTarget));
const mapModule = await import(pathToFileURL(join(root, "src", "quiz.js")).href);
const geo = await import(pathToFileURL(join(root, "src", "geo.js")).href);
const questionTarget = neighbourTarget.dataset.id;
const optionIds = [...$("options").children].map((b) => b.dataset.key);
const correctOptions = optionIds.filter((id) => geo.neighboursOf(questionTarget).includes(id));
check("exactly one neighbour offered", correctOptions.length === 1, `${correctOptions.length} of ${optionIds.join(",")}`);
await finishRound();

/* ------------------------------------------------------------ timed mode */
console.log("timed blitz");
await goHome();
click(modeCard("timed"));
check("per-question timer visible", !$("qTimer").hidden);
check("timer bar starts full", $("qTimerBar").style.width !== "0%");
check("12 questions in blitz", $("qCounter").textContent.startsWith("1/12"), $("qCounter").textContent);
await sleep(250);
check("timer bar drains", parseFloat($("qTimerBar").style.width) < 100, $("qTimerBar").style.width);
click($("skipBtn"));
check("timer stops after answering", $("feedback") && !$("feedback").hidden);
await finishRound();
await sleep(50);

/* --------------------------------------------------------- survival mode */
console.log("survival");
await goHome();
click(modeCard("challenge"));
check("lives shown", !$("hudLives").hidden);
check("starts with 3 hearts", ($("hudLives").textContent.match(/❤️/g) || []).length === 3, $("hudLives").textContent);
click($("skipBtn"));
check("wrong answer costs a life", ($("hudLives").textContent.match(/❤️/g) || []).length === 2, $("hudLives").textContent);
check("survival has no fixed length", $("qCounter").textContent.includes("∞"), $("qCounter").textContent);
click($("nextBtn"));
click($("skipBtn"));
click($("nextBtn"));
click($("skipBtn"));
check("lives hit zero", ($("hudLives").textContent.match(/❤️/g) || []).length === 0, $("hudLives").textContent);
check("last life offers finish", $("nextBtn").textContent === "Finish", $("nextBtn").textContent);
click($("nextBtn"));
check("out of lives ends the run", screen() === "result", screen());
check("survival result title", $("resultTitle").textContent === "Survival over", $("resultTitle").textContent);

/* ------------------------------------------------------------ daily quiz */
console.log("daily challenge");
await goHome();
click($("dailyCard"));
check("daily round started", screen() === "quiz");
check("daily has 10 questions", $("qCounter").textContent.startsWith("1/10"), $("qCounter").textContent);
check("daily mixes question types", (await (async () => {
  const kinds = new Set();
  for (let i = 0; i < 10 && screen() === "quiz"; i++) {
    kinds.add(/border/.test($("prompt").textContent) ? "neighbours" : $("options").hidden ? "locate" : "options");
    click($("skipBtn"));
    click($("nextBtn"));
    await sleep(10);
  }
  return kinds.size;
})()) >= 2);
check("daily finished", screen() === "result", screen());
const dailyState = saved().daily;
check("daily result stored", Boolean(dailyState?.date), JSON.stringify(dailyState));
await goHome();
check("daily card shows today's score", /\/10/.test($("dailyTitle").textContent), $("dailyTitle").textContent);
click($("dailyCard"));
check("second daily attempt blocked", screen() === "home");

/* --------------------------------------------------------- achievements */
console.log("achievements");
await sleep(30);
click($("tabbar").querySelector('[data-tab="stats"]'));
check("stats screen visible", screen() === "stats");
check("achievement grid rendered", $("badgeGrid").children.length >= 18, $("badgeGrid").children.length);
check("at least one achievement unlocked", $("badgeGrid").querySelectorAll(".badge.unlocked").length >= 1, $("badgeGrid").querySelectorAll(".badge.unlocked").length);
check("achievement counter filled", /\d+ of \d+ unlocked/.test($("achievementsCount").textContent), $("achievementsCount").textContent);
check("region mastery bars", $("regionBars").children.length === 6, $("regionBars").children.length);
check("state rows listed", $("stateRows").children.length === 36, $("stateRows").children.length);
check("level moved past 1", Number($("levelBtn").textContent.replace("Lv ", "")) >= 1);

/* ------------------------------------------------------------- settings */
console.log("settings");
click($("settingsBtn"));
check("settings open", !$("settingsBackdrop").hidden);
check("download links present", $("downloadHtml").getAttribute("href") === "download/bharat-map-quiz.html");
check("sound toggle starts on", $("soundToggle").getAttribute("aria-checked") === "true");
click($("soundToggle"));
check("sound can be muted", $("soundToggle").getAttribute("aria-checked") === "false");
click($("soundToggle"));
click($("namesSeg").querySelector('[data-names="hi"]'));
check("hindi names selected", $("namesSeg").querySelector('[data-names="hi"]').classList.contains("active"));
click($("namesSeg").querySelector('[data-names="en"]'));
click($("settingsClose"));
check("settings closed", $("settingsBackdrop").hidden);

/* ---------------------------------------------------------- persistence */
/* --------------------------------------------------------- easy / kid mode */
console.log("easy mode for young players");
await goHome();
window.__bharatQuiz.setDifficulty("easy");
await sleep(20);
check("3 difficulty chips", $("difficultyChips").children.length === 3, $("difficultyChips").children.length);
check(
  "easy is selected by default for new players",
  window.__bharatQuiz.getProfile().difficulty === "easy",
  window.__bharatQuiz.getProfile().difficulty
);

click(modeCard("identify"));
check("easy gives 3 options", $("options").children.length === 3, $("options").children.length);
const easyTarget = $("quizMap").querySelector("path.is-target").dataset.id;
const easyRight = unitName(UNITS[easyTarget], "en");
const wrongButtons = [...$("options").children].filter(
  (b) => b.querySelector(".label").textContent !== easyRight
);
click(wrongButtons[0]);
check("first wrong tap offers a retry", $("feedback").classList.contains("retry"), $("feedbackTitle").textContent);
check("question does not advance yet", $("qCounter").textContent.startsWith("1/"), $("qCounter").textContent);
const secondWrong = [...$("options").children].find((b) => !b.disabled && b.querySelector(".label").textContent !== easyRight);
click(secondWrong);
check("second miss reveals the answer", !$("feedback").classList.contains("retry") && $("feedback").classList.contains("bad"));
check("next button returns after retry", !$("nextBtn").hidden);
await finishRound();

await goHome();
click(modeCard("locate"));
check("easy prints names on the quiz map", $("quizMap").querySelectorAll("text.state-label").length >= 25, $("quizMap").querySelectorAll("text.state-label").length);
check("easy uses short kid wording", /^Find /.test($("prompt").textContent.trim()), $("prompt").textContent);
check("question kind chip filled", $("qKind").textContent.includes("Find"), $("qKind").textContent);
await finishRound();

await goHome();
click(modeCard("tour"));
check("map tour asks every state", $("qCounter").textContent.startsWith("1/36"), $("qCounter").textContent);
await finishRound(220);
check("map tour result title", /tour/i.test($("resultTitle").textContent), $("resultTitle").textContent);

console.log("how to play");
await goHome();
click($("howBtn"));
check("tutorial sheet opens", !$("howBackdrop").hidden);
check("tutorial has three steps", $("howSteps").children.length === 3, $("howSteps").children.length);
click($("howStart"));
check("tutorial closes", $("howBackdrop").hidden);
check("tutorial marked as seen", window.__bharatQuiz.getProfile().tutorialDone === true);

window.__bharatQuiz.setDifficulty("normal");
await sleep(15);

console.log("persistence");
click($("tabbar").querySelector('[data-tab="home"]'));
const finalSave = saved();
check("profile persisted", typeof finalSave.xp === "number" && finalSave.xp > 0, finalSave.xp);
check("answers counted", finalSave.answers > 20, finalSave.answers);
check("stats recorded", Object.keys(finalSave.stats || {}).length > 10, Object.keys(finalSave.stats || {}).length);
check("achievements persisted", Object.keys(finalSave.achievements || {}).length >= 1, Object.keys(finalSave.achievements || {}).length);
check("daily persisted", Boolean(finalSave.daily?.date));
check("level progressed from xp", (await import(pathToFileURL(join(root, "src", "store.js")).href)).levelInfo(finalSave.xp).level >= 1);

/* ------------------------------------------------------------ daily seed */
const quizModule = await import(pathToFileURL(join(root, "src", "quiz.js")).href);
const { STATES } = await import(pathToFileURL(join(root, "src", "data.js")).href);
const profileModule = await import(pathToFileURL(join(root, "src", "store.js")).href);
const seedA = quizModule.buildRound("daily", STATES, profileModule.defaultProfile(), { seed: "2026-10-27" });
const seedB = quizModule.buildRound("daily", STATES, profileModule.defaultProfile(), { seed: "2026-10-27" });
check("daily questions deterministic", JSON.stringify(seedA.questions.map((q) => q.targetId)) === JSON.stringify(seedB.questions.map((q) => q.targetId)));
const seedC = quizModule.buildRound("daily", STATES, profileModule.defaultProfile(), { seed: "2026-10-28" });
check("different day, different questions", JSON.stringify(seedA.questions.map((q) => q.targetId)) !== JSON.stringify(seedC.questions.map((q) => q.targetId)));

console.log("errors");
check("no runtime errors", errors.length === 0, errors.join(" | "));

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
