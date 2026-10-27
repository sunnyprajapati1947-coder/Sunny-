/* Question generation + scoring rules. Pure functions so they can be unit-tested in node. */

import { STATES, UNITS } from "./data.js";
import { unitStat } from "./store.js";

export const ROUND_SIZE = 10;

export function shuffle(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function poolFor(region, typeFilter = "all") {
  return STATES.filter((u) => {
    if (region && region !== "all" && u.region !== region) return false;
    if (typeFilter === "state" && u.type !== "state") return false;
    if (typeFilter === "ut" && u.type !== "ut") return false;
    return true;
  });
}

/** Weighted random pick: weak / unseen units turn up more often. */
export function pickWeighted(pool, profile, rng = Math.random, exclude = []) {
  const candidates = pool.filter((u) => !exclude.includes(u.id));
  const list = candidates.length ? candidates : pool;
  const weights = list.map((u) => {
    const stat = profile ? unitStat(profile, u.id) : { mastery: 0, seen: 0 };
    let w = 1 + (100 - stat.mastery) / 20;
    if (!stat.seen) w += 1.5;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

function capitalOptions(target, pool, rng, count = 4) {
  const seen = new Set([target.capital.en]);
  const options = [target.capital];
  const sameRegion = shuffle(
    pool.filter((u) => u.region === target.region && u.id !== target.id),
    rng
  );
  const others = shuffle(
    pool.filter((u) => u.region !== target.region && u.id !== target.id),
    rng
  );
  for (const unit of [...sameRegion, ...others]) {
    if (options.length >= count) break;
    if (seen.has(unit.capital.en)) continue;
    seen.add(unit.capital.en);
    options.push(unit.capital);
  }
  return shuffle(options, rng);
}

function nameOptions(target, pool, rng, count = 4) {
  const options = [target];
  const sameRegion = shuffle(
    pool.filter((u) => u.region === target.region && u.id !== target.id),
    rng
  );
  const others = shuffle(
    pool.filter((u) => u.region !== target.region && u.id !== target.id),
    rng
  );
  for (const unit of [...sameRegion, ...others]) {
    if (options.length >= count) break;
    if (options.some((o) => o.name.en === unit.name.en)) continue;
    options.push(unit);
  }
  return shuffle(options, rng);
}

/**
 * Build one question.
 * mode: locate | identify | capital
 * Returns { mode, targetId, options?: [{kind:'unit', id} | {kind:'capital', capital}] }
 */
export function makeQuestion(mode, pool, profile, rng = Math.random, recent = [], optionPool = null) {
  if (!pool.length) throw new Error("empty pool");
  const target = pickWeighted(pool, profile, rng, recent.slice(-6));
  // a small region (e.g. Central = 2 states) still needs 4 options -> widen the pool
  const distractors = optionPool && optionPool.length >= 4 ? optionPool : pool.length >= 4 ? pool : STATES;
  if (mode === "identify") {
    return {
      mode,
      targetId: target.id,
      options: nameOptions(target, distractors, rng).map((u) => ({ kind: "unit", id: u.id })),
    };
  }
  if (mode === "capital") {
    return {
      mode,
      targetId: target.id,
      options: capitalOptions(target, distractors, rng).map((c) => ({ kind: "capital", capital: c })),
    };
  }
  return { mode: "locate", targetId: target.id };
}

export function optionKey(option) {
  return option.kind === "capital" ? option.capital.en : option.id;
}

/** Is a tapped map shape the right answer? */
export function isCorrectTap(targetId, tappedId) {
  return Boolean(tappedId) && targetId === tappedId;
}

/** Is a chosen option the right answer? */
export function isCorrectOption(question, option) {
  if (!option) return false;
  if (option.kind === "capital") {
    return option.capital.en === UNITS[question.targetId].capital.en;
  }
  return option.id === question.targetId;
}

/** Sprint sequence: every unit in the pool exactly once, shuffled. */
export function sprintSequence(pool, rng = Math.random) {
  return shuffle(pool, rng).map((u) => u.id);
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
