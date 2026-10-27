/* Local progress store (localStorage only — no account, no network). */

export const STORAGE_KEY = "bharat-map-quiz.v2";
const LEGACY_KEY = "bharat-map-quiz.v1";

export function defaultProfile() {
  return {
    version: 2,
    stateNames: "en", // "en" | "hi" — only state names/facts switch, the UI stays English
    sound: true,
    xp: 0,
    rounds: 0,
    answers: 0,
    correct: 0,
    bestStreak: 0,
    sprintBest: null, // seconds for a full India speed run
    daily: { date: "", score: 0, total: 0, streak: 0, best: 0 },
    stats: {}, // id -> { seen, correct, wrong, streak, mastery, last }
    achievements: {}, // id -> unlock timestamp
  };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

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
  p.achievements = {};
  for (const [id, when] of Object.entries(raw.achievements || {})) {
    if (typeof when === "number") p.achievements[id] = when;
  }
  const daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
  p.daily = {
    date: typeof daily.date === "string" ? daily.date : "",
    score: Number(daily.score) || 0,
    total: Number(daily.total) || 0,
    streak: Number(daily.streak) || 0,
    best: Number(daily.best) || 0,
  };
  p.xp = Number(p.xp) || 0;
  p.rounds = Number(p.rounds) || 0;
  p.answers = Number(p.answers) || 0;
  p.correct = Number(p.correct) || 0;
  p.bestStreak = Number(p.bestStreak) || 0;
  p.stateNames = p.stateNames === "hi" ? "hi" : "en";
  p.sound = p.sound !== false;
  p.sprintBest = Number.isFinite(p.sprintBest) ? Number(p.sprintBest) : null;
  return p;
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadProfile(storage) {
  const store = safeStorage(storage);
  if (!store) return defaultProfile();
  try {
    const current = store.getItem(STORAGE_KEY);
    if (current) return normalize(JSON.parse(current));
    const legacy = store.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalize({ ...JSON.parse(legacy), stateNames: "en" });
      store.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* corrupt save — start fresh */
  }
  return defaultProfile();
}

export function saveProfile(profile, storage) {
  const store = safeStorage(storage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota — progress just will not persist */
  }
}

export function resetProfile(profile) {
  const fresh = defaultProfile();
  fresh.sound = profile.sound;
  fresh.stateNames = profile.stateNames;
  return fresh;
}

export function unitStat(profile, id) {
  return profile.stats[id] || { seen: 0, correct: 0, wrong: 0, streak: 0, mastery: 0, last: 0 };
}

/**
 * Update the profile after one answer.
 * Returns { profile, xpGain, streak, mastery } — pure, the caller saves it.
 */
export function recordAnswer(profile, id, isCorrect, options = {}) {
  const {
    mode = "locate",
    answerType = mode,
    hinted = false,
    timedOut = false,
    now = Date.now(),
  } = options;
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
  if (isCorrect) {
    if (answerType === "capital") stat.capitalCorrect = (stat.capitalCorrect || 0) + 1;
    if (answerType === "neighbours") stat.neighbourCorrect = (stat.neighbourCorrect || 0) + 1;
  }
  stat.last = now;
  p.stats[id] = stat;

  p.answers += 1;
  if (isCorrect) p.correct += 1;

  let xpGain = 0;
  if (isCorrect) {
    const base = { sprint: 6, timed: 12, challenge: 12, daily: 12 }[mode] ?? 10;
    xpGain = Math.max(2, base - (hinted ? 4 : 0) - (timedOut ? 2 : 0));
  }
  p.xp += xpGain;

  const runStreak = currentStreak(p.stats);
  p.bestStreak = Math.max(p.bestStreak, runStreak);
  return { profile: p, xpGain, mastery: stat.mastery, streak: runStreak };
}

/** Longest current per-state streak (the flame in the quiz HUD). */
export function currentStreak(stats) {
  let best = 0;
  for (const stat of Object.values(stats)) best = Math.max(best, stat.streak || 0);
  return best;
}

export function memorisedCount(profile, units) {
  return units.filter((unit) => unitStat(profile, unit.id).mastery >= 80).length;
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

/* ---------------------------------------------------------------- levels */

const LEVELS = [
  { at: 0, title: "New Explorer" },
  { at: 120, title: "Map Reader" },
  { at: 320, title: "State Spotter" },
  { at: 620, title: "Border Expert" },
  { at: 1000, title: "Capital Scholar" },
  { at: 1500, title: "Cartographer" },
  { at: 2200, title: "Bharat Master" },
];

/** Level number, title and progress towards the next level. */
export function levelInfo(xp) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].at) index = i;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const span = next ? next.at - current.at : 1;
  const into = xp - current.at;
  return {
    level: index + 1,
    title: current.title,
    into: next ? into : 1,
    span: next ? span : 1,
    next: next ? next.title : null,
    progress: next ? clamp(into / span, 0, 1) : 1,
  };
}

export const levelTable = LEVELS;

/* ---------------------------------------------------------------- daily */

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dailyStatus(profile, date = new Date()) {
  const key = todayKey(date);
  const done = profile.daily.date === key;
  return {
    key,
    done,
    score: done ? profile.daily.score : 0,
    total: done ? profile.daily.total : 0,
    streak: profile.daily.streak,
    best: profile.daily.best,
  };
}

export function recordDaily(profile, score, total, date = new Date()) {
  const p = normalize(profile);
  const key = todayKey(date);
  if (p.daily.date === key) return p; // one attempt per day
  const yesterday = new Date(date.getTime() - 86400000);
  const continued = p.daily.date === todayKey(yesterday);
  p.daily = {
    date: key,
    score,
    total,
    streak: continued ? p.daily.streak + 1 : 1,
    best: Math.max(p.daily.best, score),
  };
  return p;
}
