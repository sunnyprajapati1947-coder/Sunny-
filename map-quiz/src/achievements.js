/* Achievement definitions and the (pure) evaluation that unlocks them. */

import { STATES, UNITS } from "./data.js";
import { unitStat, memorisedCount, dailyStatus, accuracy, coverage } from "./store.js";

export const ACHIEVEMENTS = [
  {
    id: "first-steps",
    icon: "🌱",
    title: "First steps",
    detail: "Answer your first question correctly",
    test: ({ profile }) => profile.correct >= 1,
  },
  {
    id: "ten-correct",
    icon: "🎯",
    title: "Getting the hang of it",
    detail: "Answer 10 questions correctly",
    test: ({ profile }) => profile.correct >= 10,
  },
  {
    id: "fifty-correct",
    icon: "🏹",
    title: "Sharp eye",
    detail: "Answer 50 questions correctly",
    test: ({ profile }) => profile.correct >= 50,
  },
  {
    id: "streak-5",
    icon: "🔥",
    title: "On fire",
    detail: "Get 5 correct in a row",
    test: ({ round }) => (round?.bestRunStreak || 0) >= 5,
  },
  {
    id: "streak-10",
    icon: "⚡",
    title: "Unstoppable",
    detail: "Get 10 correct in a row",
    test: ({ round }) => (round?.bestRunStreak || 0) >= 10,
  },
  {
    id: "perfect-round",
    icon: "💎",
    title: "Flawless",
    detail: "Finish a round without a single mistake",
    test: ({ round }) => Boolean(round) && round.score === round.total && round.total >= 10,
  },
  {
    id: "capitals-10",
    icon: "🏛️",
    title: "Mayor of India",
    detail: "Get 10 capitals right",
    test: ({ profile }) => capitalsCorrect(profile) >= 10,
  },
  {
    id: "capitals-25",
    icon: "🏆",
    title: "Capital scholar",
    detail: "Get 25 capitals right",
    test: ({ profile }) => capitalsCorrect(profile) >= 25,
  },
  {
    id: "neighbour-knowledge",
    icon: "🧩",
    title: "Border expert",
    detail: "Get 10 neighbour questions right",
    test: ({ profile }) => modeCorrect(profile, "neighbourCorrect") >= 10,
  },
  {
    id: "map-tour",
    icon: "🧭",
    title: "Tour guide",
    detail: "Finish a map tour with at least 30 correct",
    test: ({ round }) => round?.mode === "tour" && round.score >= 30,
  },
  {
    id: "map-explorer",
    icon: "🔎",
    title: "Every corner",
    detail: "Have every state and UT come up in a question",
    test: ({ profile }) => coverage(profile, STATES) >= STATES.length,
  },
  {
    id: "half-map",
    icon: "🗺️",
    title: "Halfway there",
    detail: "Memorise 18 states (80% mastery)",
    test: ({ profile }) => memorisedCount(profile, STATES) >= 18,
  },
  {
    id: "full-map",
    icon: "🇮🇳",
    title: "Full map",
    detail: "Memorise all 36 states and UTs",
    test: ({ profile }) => memorisedCount(profile, STATES) >= STATES.length,
  },
  {
    id: "daily-first",
    icon: "📅",
    title: "Daily habit",
    detail: "Complete a daily challenge",
    test: ({ profile }) => Boolean(dailyStatus(profile).done),
  },
  {
    id: "daily-streak-3",
    icon: "📆",
    title: "Three days strong",
    detail: "Play the daily challenge 3 days in a row",
    test: ({ profile }) => dailyStatus(profile).streak >= 3,
  },
  {
    id: "sprint-finish",
    icon: "🏃",
    title: "Around India",
    detail: "Finish a speed run over every state",
    test: ({ profile }) => profile.sprintBest != null,
  },
  {
    id: "sprint-under-3",
    icon: "🚀",
    title: "Quick as a monsoon",
    detail: "Finish the all-India speed run under 3 minutes",
    test: ({ profile }) => profile.sprintBest != null && profile.sprintBest <= 180,
  },
  {
    id: "sharp-shooter",
    icon: "🎖️",
    title: "Sharp shooter",
    detail: "Reach 85% accuracy over 50+ answers",
    test: ({ profile }) => profile.answers >= 50 && accuracy(profile) >= 85,
  },
  {
    id: "survivor",
    icon: "❤️",
    title: "Survivor",
    detail: "Score 15 in survival mode",
    test: ({ round }) => round?.mode === "challenge" && round.score >= 15,
  },
  {
    id: "all-regions",
    icon: "🧭",
    title: "All four corners",
    detail: "Answer a question from every region",
    test: ({ profile }) => regionsSeen(profile).size >= 6,
  },
];

function capitalsCorrect(profile) {
  return Object.entries(profile.stats).reduce((sum, [id, stat]) => {
    if (!UNITS[id]) return sum;
    return sum + (stat.capitalCorrect || 0);
  }, 0);
}

function modeCorrect(profile, counter) {
  return Object.values(profile.stats).reduce((sum, stat) => sum + (stat[counter] || 0), 0);
}

function regionsSeen(profile) {
  const set = new Set();
  for (const [id, stat] of Object.entries(profile.stats)) {
    if (stat.seen > 0 && UNITS[id]) set.add(UNITS[id].region);
  }
  return set;
}

/**
 * Returns the ids of achievements that are satisfied but not yet stored.
 * Pure — the caller decides when to persist.
 */
export function evaluate(profile, round) {
  const unlocked = new Set(Object.keys(profile.achievements || {}));
  const context = { profile, round };
  const fresh = [];
  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    let passed = false;
    try {
      passed = Boolean(achievement.test(context));
    } catch {
      passed = false;
    }
    if (passed) fresh.push(achievement.id);
  }
  return fresh;
}

export function withUnlocked(profile, ids, now = Date.now()) {
  if (!ids.length) return profile;
  const achievements = { ...profile.achievements };
  for (const id of ids) if (!achievements[id]) achievements[id] = now;
  return { ...profile, achievements };
}

export function achievementList(profile) {
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlockedAt: profile.achievements?.[achievement.id] || 0,
  }));
}

export function unlockedCount(profile) {
  return achievementList(profile).filter((achievement) => achievement.unlockedAt).length;
}

/** Kept for the ability to show "x of y" without importing the whole list twice. */
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

/** Utility for the learn card: how well a single unit is known. */
export function masteryOf(profile, id) {
  return Math.round(unitStat(profile, id).mastery);
}
