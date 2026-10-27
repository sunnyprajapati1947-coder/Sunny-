/* Local progress store. Everything lives in localStorage — no account, no network. */

export const STORAGE_KEY = "bharat-map-quiz.v1";

export function defaultProfile() {
  return {
    version: 1,
    lang: "hing",
    sound: true,
    xp: 0,
    rounds: 0,
    answers: 0,
    correct: 0,
    bestStreak: 0,
    sprintBest: null, // seconds for all-India sprint
    stats: {}, // id -> { seen, correct, wrong, streak, mastery, last }
    createdAt: Date.now(),
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Merge a saved profile with defaults so old/partial saves never crash the app. */
export function normalize(raw) {
  const base = defaultProfile();
  if (!raw || typeof raw !== "object") return base;
  const p = { ...base, ...raw };
  p.stats = {};
  for (const [id, value] of Object.entries(raw.stats || {})) {
    if (!value || typeof value !== "object") continue;
    p.stats[id] = {
      seen: Number(value.seen) || 0,
      correct: Number(value.correct) || 0,
      wrong: Number(value.wrong) || 0,
      streak: Number(value.streak) || 0,
      mastery: clamp(Number(value.mastery) || 0, 0, 100),
      last: Number(value.last) || 0,
    };
  }
  p.xp = Number(p.xp) || 0;
  p.rounds = Number(p.rounds) || 0;
  p.answers = Number(p.answers) || 0;
  p.correct = Number(p.correct) || 0;
  p.bestStreak = Number(p.bestStreak) || 0;
  if (p.lang !== "hi" && p.lang !== "en") p.lang = "hing";
  p.sound = p.sound !== false;
  return p;
}

export function loadProfile(storage) {
  try {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return defaultProfile();
    return normalize(JSON.parse(store.getItem(STORAGE_KEY) || "null"));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile, storage) {
  try {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (store) store.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota — progress just won't persist */
  }
}

export function resetProfile(profile) {
  const fresh = defaultProfile();
  fresh.lang = profile.lang;
  fresh.sound = profile.sound;
  return fresh;
}

export function unitStat(profile, id) {
  return profile.stats[id] || { seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, last: 0 };
}

/**
 * Update the profile after one answer.
 * Returns { profile, xpGain, streak, mastery } — pure, the caller saves it.
 */
export function recordAnswer(profile, id, isCorrect, { mode = "locate", hinted = false, now = Date.now() } = {}) {
  const p = normalize(profile);
  const stat = { ...unitStat(p, id) };
  stat.seen += 1;
  if (isCorrect) {
    stat.correct += 1;
    stat.streak += 1;
    stat.mastery = clamp(stat.mastery + (stat.streak > 2 ? 12 : 15), 0, 100);
  } else {
    stat.wrong += 1;
    stat.streak = 0;
    stat.mastery = clamp(stat.mastery - 12, 0, 100);
  }
  stat.last = now;
  p.stats[id] = stat;

  p.answers += 1;
  if (isCorrect) p.correct += 1;

  let xpGain = 0;
  if (isCorrect) {
    const base = mode === "sprint" ? 6 : mode === "locate" ? 10 : 8;
    xpGain = Math.max(2, base - (hinted ? 4 : 0));
  }
  p.xp += xpGain;

  const runStreak = currentStreak(p.stats);
  p.bestStreak = Math.max(p.bestStreak, runStreak);
  return { profile: p, xpGain, mastery: stat.mastery, streak: runStreak };
}

/** Longest current mastering streak across units (used for the HUD flame). */
export function currentStreak(stats) {
  let best = 0;
  for (const s of Object.values(stats)) best = Math.max(best, s.streak || 0);
  return best;
}

export function memorisedCount(profile, units) {
  return units.filter((u) => unitStat(profile, u.id).mastery >= 80).length;
}

export function accuracy(profile) {
  if (!profile.answers) return 0;
  return Math.round((profile.correct / profile.answers) * 100);
}

/** Units sorted weakest-first; unseen units come before well-known ones. */
export function rankedWeakest(profile, units) {
  return [...units].sort((a, b) => {
    const sa = unitStat(profile, a.id);
    const sb = unitStat(profile, b.id);
    const weightA = sa.seen ? sa.mastery : -1;
    const weightB = sb.seen ? sb.mastery : -1;
    if (weightA !== weightB) return weightA - weightB;
    return (sa.last || 0) - (sb.last || 0);
  });
}

export function weakUnits(profile, units, count = 8) {
  return rankedWeakest(profile, units).slice(0, count);
}
