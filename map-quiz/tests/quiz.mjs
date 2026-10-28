/* Pure-logic tests for question building: no DOM, no storage.
 * Run with `node tests/quiz.mjs` (also part of `npm test`). */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// quiz.js asks geo.js for neighbours, which reads window.INDIA_MAP
const mapSrc = readFileSync(join(root, "src", "map-data.js"), "utf8");
globalThis.window = { INDIA_MAP: JSON.parse(mapSrc.slice(mapSrc.indexOf("=") + 1).replace(/;\s*$/, "")) };

const quiz = await import(pathToFileURL(join(root, "src", "quiz.js")).href);
const store = await import(pathToFileURL(join(root, "src", "store.js")).href);
const { STATES } = await import(pathToFileURL(join(root, "src", "data.js")).href);

let failures = 0;
const check = (label, condition, extra = "") => {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label} ${extra}`);
  }
};

const profile = store.defaultProfile();

console.log("rounds never repeat a state while fresh ones are left");
for (const difficulty of ["easy", "normal", "hard"]) {
  for (const mode of ["locate", "identify", "capital", "neighbours", "daily", "weak"]) {
    let repeated = 0;
    for (let i = 0; i < 60; i++) {
      const round = quiz.buildRound(mode, STATES, profile, { difficulty });
      const ids = round.questions.map((q) => q.targetId);
      if (new Set(ids).size !== ids.length) repeated += 1;
    }
    check(`${difficulty}/${mode} asks 10 different states`, repeated === 0, `${repeated}/60 rounds had a repeat`);
  }
}

console.log("answers are always unique");
for (const mode of ["identify", "capital", "neighbours"]) {
  for (const difficulty of ["easy", "normal", "hard"]) {
    let bad = 0;
    for (let i = 0; i < 60; i++) {
      for (const question of quiz.buildRound(mode, STATES, profile, { difficulty }).questions) {
        const keys = question.options.map((option) =>
          option.kind === "capital" ? option.capital.en : option.id
        );
        if (!question.options.length || new Set(keys).size !== keys.length) bad += 1;
      }
    }
    check(`${difficulty}/${mode} options are distinct`, bad === 0, `${bad} bad questions`);
  }
}

console.log("difficulty presets");
for (const [difficulty, preset] of Object.entries(quiz.DIFFICULTIES)) {
  const round = quiz.buildRound("identify", STATES, profile, { difficulty });
  check(
    `${difficulty} shows ${preset.options} options`,
    round.questions.every((q) => q.options.length === preset.options)
  );
  check(`${difficulty} round records its difficulty`, round.difficulty === difficulty);
}
const easyTimed = quiz.buildRound("timed", STATES, profile, { difficulty: "easy" });
const hardTimed = quiz.buildRound("timed", STATES, profile, { difficulty: "hard" });
check("easy gives more time than advanced", easyTimed.timer > hardTimed.timer, `${easyTimed.timer} vs ${hardTimed.timer}`);
check("easy defaults on a new profile", store.defaultProfile().difficulty === "easy");

console.log("the whole map gets asked");
const tour = quiz.buildRound("tour", STATES, profile, { difficulty: "easy" });
check("tour asks every state once", tour.questions.length === STATES.length, String(tour.questions.length));
check("tour targets are unique", new Set(tour.questions.map((q) => q.targetId)).size === STATES.length);
const seen = new Set();
for (let i = 0; i < 20; i++) {
  for (const question of quiz.buildRound("locate", STATES, profile, { difficulty: "normal" }).questions) {
    seen.add(question.targetId);
  }
}
check("20 rounds cover all 36 states", seen.size === STATES.length, `${seen.size}/${STATES.length}`);

console.log("weak mode stays playable for a new player");
const weakPool = store.weakUnits(profile, STATES, 12);
check("weak pool has units", weakPool.length > 0, String(weakPool.length));
const weakRound = quiz.buildRound("weak", weakPool, profile, { difficulty: "easy" });
check("weak round length fits the pool", weakRound.questions.length <= weakPool.length, String(weakRound.questions.length));

console.log("coverage helper");
const drilled = store.defaultProfile();
drilled.stats = { goa: { seen: 2, correct: 1, wrong: 1, streak: 0, mastery: 20, last: 1 } };
check("coverage counts seen states", store.coverage(drilled, STATES) === 1);

console.log(failures ? `\n${failures} problem(s)` : "\nall quiz logic checks passed");
process.exit(failures ? 1 : 0);
