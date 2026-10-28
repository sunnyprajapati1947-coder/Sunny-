/* Question generation and round building. Pure functions — no DOM, no storage. */

import { STATES, UNITS, REGIONS } from "./data.js";
import { unitStat } from "./store.js";
import { neighboursOf, borderUnits } from "./geo.js";

export const ROUND_SIZE = 10;

/** Per-mode round rules. `timer` is seconds per question, `lives` 0 = unlimited. */
export const MODE_RULES = {
  locate: { questions: 10, timer: 0, lives: 0 },
  identify: { questions: 10, timer: 0, lives: 0 },
  capital: { questions: 10, timer: 0, lives: 0 },
  neighbours: { questions: 10, timer: 0, lives: 0 },
  timed: { questions: 12, timer: 10, lives: 0 },
  challenge: { questions: Infinity, timer: 12, lives: 3 },
  daily: { questions: 10, timer: 0, lives: 0 },
  sprint: { questions: Infinity, timer: 0, lives: 0 },
  tour: { questions: Infinity, timer: 0, lives: 0 }, // one question per state on the map
  weak: { questions: 10, timer: 0, lives: 0 },
};

/**
 * Difficulty presets. `easy` is the kid-friendly one: fewer options, names
 * printed on the map, a free retry and extra thinking time.
 *   options    — answer buttons for capital / identify / neighbour questions
 *   mapLabels  — draw state names on the quiz map
 *   retry      — a wrong first tap does not end the question
 *   distractors— "far" picks obviously different states, "near" picks neighbours
 *   timerScale — multiplies every per-question timer
 */
export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Easy",
    options: 3,
    mapLabels: true,
    retry: true,
    distractors: "far",
    timerScale: 1.6,
  },
  normal: {
    id: "normal",
    label: "Normal",
    options: 4,
    mapLabels: false,
    retry: false,
    distractors: "near",
    timerScale: 1,
  },
  hard: {
    id: "hard",
    label: "Advanced",
    options: 4,
    mapLabels: false,
    retry: false,
    distractors: "near",
    timerScale: 0.75,
  },
};

export function difficultyFor(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.easy;
}

export function shuffle(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deterministic RNG (mulberry32) seeded from a string — used by the daily challenge. */
export function seededRng(seedString) {
  let h = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    h ^= seedString.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function poolFor(region, typeFilter = "all") {
  return STATES.filter((unit) => {
    if (region && region !== "all" && unit.region !== region) return false;
    if (typeFilter === "state" && unit.type !== "state") return false;
    if (typeFilter === "ut" && unit.type !== "ut") return false;
    return true;
  });
}

/**
 * Weighted random pick: unseen units first, then weak ones. States that have
 * already been drilled many times step back, so a few rounds sweep the whole
 * map instead of asking the same handful of states over and over.
 */
export function pickWeighted(pool, profile, rng = Math.random, exclude = []) {
  const candidates = pool.filter((unit) => !exclude.includes(unit.id));
  const list = candidates.length ? candidates : pool;
  const weights = list.map((unit) => {
    const stat = profile ? unitStat(profile, unit.id) : { mastery: 0, seen: 0 };
    let weight = 2 + (100 - stat.mastery) / 25;
    if (!stat.seen) weight *= 2.5;
    else weight /= 1 + Math.min(6, stat.seen) * 0.4;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** Fill `options` up to `targetLength` items, skipping duplicates in `seen`. */
function takeUnique(candidates, seen, targetLength, options) {
  for (const item of candidates) {
    if (options.length >= targetLength) break;
    if (seen.has(item)) continue;
    seen.add(item);
    options.push(item);
  }
}

/** Order the distractor candidates the way the current difficulty wants them. */
function distractorOrder(target, pool, rng, strategy) {
  const sameRegion = shuffle(pool.filter((u) => u.region === target.region && u.id !== target.id), rng);
  const others = shuffle(pool.filter((u) => u.region !== target.region && u.id !== target.id), rng);
  // easy: far-away states are easy to tell apart; normal/advanced: same region
  return strategy === "far" ? [...others, ...sameRegion] : [...sameRegion, ...others];
}

function capitalOptions(target, pool, rng, count = 4, strategy = "near") {
  const seen = new Set([target.capital.en]);
  const options = [target.capital];
  for (const unit of distractorOrder(target, pool, rng, strategy)) {
    if (options.length >= count) break;
    // several states can share a capital (Chandigarh) — never offer it twice
    if (seen.has(unit.capital.en)) continue;
    seen.add(unit.capital.en);
    options.push(unit.capital);
  }
  return shuffle(options, rng);
}

function nameOptions(target, pool, rng, count = 4, strategy = "near") {
  const seen = new Set([target.name.en]);
  const options = [target];
  takeUnique(distractorOrder(target, pool, rng, strategy), seen, count, options);
  return shuffle(options, rng);
}

/** A neighbour plus the rest of the options, none of which may also touch the target. */
function neighbourOptions(target, rng, count = 4) {
  const neighbourIds = neighboursOf(target.id);
  const neighbours = shuffle(neighbourIds.map((id) => UNITS[id]).filter(Boolean), rng);
  const nonNeighbours = shuffle(
    STATES.filter(
      (u) => u.id !== target.id && !neighbourIds.includes(u.id) && !isNear(u.id, neighbourIds)
    ),
    rng
  );
  const options = [neighbours[0]];
  takeUnique(
    nonNeighbours,
    new Set([target.name.en, options[0].name.en]),
    count,
    options
  );
  return shuffle(options, rng);
}

/** Avoid offering a "wrong" option that is actually also a neighbour. */
function isNear(id, neighbourIds) {
  return neighbourIds.includes(id);
}

const DISTRACTOR_POOL = STATES;

/** Capital names shared by more than one state (e.g. Chandigarh). */
const CAPITAL_USES = STATES.reduce((map, unit) => {
  map[unit.capital.en] = (map[unit.capital.en] || 0) + 1;
  return map;
}, {});

const uniqueCapital = (unit) => CAPITAL_USES[unit.capital.en] === 1;

/**
 * Build one question.
 *
 * mode:       locate | identify | capital | capitalReverse | neighbours
 * exclude:    target ids already used in this round — they are skipped so a
 *             round never asks about the same state twice
 * difficulty: easy | normal | hard (see DIFFICULTIES)
 */
export function makeQuestion(mode, pool, profile, rng = Math.random, exclude = [], difficulty = "normal") {
  if (!pool.length) throw new Error("empty pool");
  const diff = difficultyFor(difficulty);
  const wider = pool.length >= 4 ? pool : DISTRACTOR_POOL;

  let candidates = pool;
  if (mode === "neighbours") candidates = borderUnits(pool);
  if (mode === "capitalReverse") candidates = pool.filter(uniqueCapital);
  if (!candidates.length) {
    candidates =
      mode === "neighbours"
        ? borderUnits(STATES)
        : mode === "capitalReverse"
          ? STATES.filter(uniqueCapital)
          : pool;
  }

  // only skip used targets while there are still fresh ones left
  const fresh = candidates.filter((unit) => !exclude.includes(unit.id));
  const target = pickWeighted(fresh.length ? fresh : candidates, profile, rng);

  const count = diff.options;
  if (mode === "identify") {
    return {
      mode,
      targetId: target.id,
      options: nameOptions(target, wider, rng, count, diff.distractors).map((u) => ({
        kind: "unit",
        id: u.id,
      })),
    };
  }
  if (mode === "capital") {
    return {
      mode,
      targetId: target.id,
      options: capitalOptions(target, wider, rng, count, diff.distractors).map((capital) => ({
        kind: "capital",
        capital,
      })),
    };
  }
  if (mode === "capitalReverse") {
    const distractors = shuffle(
      STATES.filter((u) => u.id !== target.id && uniqueCapital(u)),
      rng
    ).slice(0, count - 1);
    return {
      mode,
      targetId: target.id,
      options: shuffle([target, ...distractors], rng).map((u) => ({ kind: "unit", id: u.id })),
    };
  }
  if (mode === "neighbours") {
    return {
      mode,
      targetId: target.id,
      options: neighbourOptions(target, rng, count).map((u) => ({ kind: "unit", id: u.id })),
    };
  }
  return { mode: "locate", targetId: target.id };
}

/**
 * Mixed sequence for the daily challenge. Easy removes the two hardest kinds
 * (state-from-capital and neighbours) so young players still get a fair set.
 */
function dailyQuestionModes(difficulty = "normal") {
  if (difficulty === "easy") {
    return [
      "locate",
      "identify",
      "capital",
      "locate",
      "identify",
      "capital",
      "locate",
      "identify",
      "capital",
      "locate",
    ];
  }
  return [
    "locate",
    "identify",
    "capital",
    "locate",
    "neighbours",
    "capitalReverse",
    "identify",
    "locate",
    "capital",
    "neighbours",
  ];
}

/** Every state on the map exactly once, grouped by region (north → south). */
export function tourSequence(pool, rng = Math.random) {
  const order = REGIONS.filter((region) => region.id !== "all").map((region) => region.id);
  const questions = [];
  for (const region of order) {
    const group = shuffle(pool.filter((unit) => unit.region === region), rng);
    for (const unit of group) questions.push({ mode: "locate", targetId: unit.id });
  }
  // anything with an unexpected region still gets a turn
  for (const unit of shuffle(pool, rng)) {
    if (!questions.some((question) => question.targetId === unit.id)) {
      questions.push({ mode: "locate", targetId: unit.id });
    }
  }
  return questions;
}

export function optionKey(option) {
  return option.kind === "capital" ? option.capital.en : option.id;
}

export function isCorrectTap(targetId, tappedId) {
  return Boolean(tappedId) && targetId === tappedId;
}

export function isCorrectOption(question, option) {
  if (!option) return false;
  if (option.kind === "capital") {
    return option.capital.en === UNITS[question.targetId].capital.en;
  }
  // neighbour questions ask for *any* state that shares a border
  if (question.mode === "neighbours") {
    return neighboursOf(question.targetId).includes(option.id);
  }
  return option.id === question.targetId;
}

export function sprintSequence(pool, rng = Math.random) {
  return shuffle(pool, rng).map((unit) => unit.id);
}

/**
 * Build a whole round: { mode, questions, timer, lives, total, seed }
 * - daily uses a deterministic seed so everyone gets the same questions today.
 * - challenge has no fixed length; questions are appended as the player goes.
 */
export function buildRound(mode, pool, profile, options = {}) {
  const rules = MODE_RULES[mode] || MODE_RULES.locate;
  const seed = options.seed || null;
  const rng = seed ? seededRng(seed) : Math.random;
  const difficulty = options.difficulty || profile?.difficulty || "normal";
  const diff = difficultyFor(difficulty);
  // easy gives young players more time on the clocked modes
  const timer = rules.timer ? Math.round(rules.timer * diff.timerScale) : 0;

  if (mode === "challenge") {
    return {
      mode,
      questions: [makeQuestion("locate", pool, profile, rng, [], difficulty)],
      timer,
      lives: rules.lives,
      total: Infinity,
      endless: true,
      seed,
      difficulty,
    };
  }

  if (mode === "sprint") {
    return {
      mode,
      questions: sprintSequence(pool, rng).map((id) => ({ mode: "locate", targetId: id })),
      timer: 0,
      lives: 0,
      total: pool.length,
      seed,
      difficulty,
    };
  }

  if (mode === "tour") {
    const questions = tourSequence(pool, rng);
    return {
      mode,
      questions,
      timer: 0,
      lives: 0,
      total: questions.length,
      seed,
      difficulty,
    };
  }

  if (mode === "daily") {
    const questions = [];
    for (const questionMode of dailyQuestionModes(difficulty)) {
      const used = questions.map((question) => question.targetId);
      questions.push(makeQuestion(questionMode, pool, profile, rng, used, difficulty));
    }
    return { mode, questions, timer, lives: 0, total: questions.length, seed, difficulty };
  }

  const total = mode === "weak" ? Math.min(rules.questions, pool.length) : rules.questions;
  const questions = [];
  const used = [];
  for (let i = 0; i < total; i++) {
    let question;
    if (i === 0 && options.focusId && UNITS[options.focusId]) {
      question = makeQuestion(mode, [UNITS[options.focusId]], profile, rng, [], difficulty);
    } else {
      question = makeQuestion(mode, pool, profile, rng, used, difficulty);
    }
    used.push(question.targetId);
    questions.push(question);
  }
  return { mode, questions, timer, lives: 0, total, seed, difficulty };
}

/** Next question for the endless survival round. */
export function nextChallengeQuestion(mode, pool, profile, rng = Math.random, exclude = [], difficulty = "normal") {
  const usable = ["locate", "locate", "identify", "capital", "neighbours"];
  const pick = usable[Math.floor(rng() * usable.length)];
  return makeQuestion(pick, pool, profile, rng, exclude, difficulty);
}

export function starsFor(score, total) {
  if (!total) return 0;
  const ratio = score / total;
  if (ratio >= 0.95) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.4) return 1;
  return 0;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/** Short label describing what a question asks, used in the review list. */
export function questionKindLabel(question) {
  return {
    locate: "Find on map",
    identify: "Identify shape",
    capital: "Capital city",
    capitalReverse: "State from capital",
    neighbours: "Neighbouring state",
  }[question.mode] || "Question";
}
