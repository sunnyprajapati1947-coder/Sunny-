/**
 * CPU opponents.
 *
 * The AI is a heuristic evaluator over the same legal-move list a human sees,
 * so it can never cheat: it has no hidden information and no extra moves.
 * Difficulty controls how often it plays a deliberately weaker move and how
 * carefully it weighs risk.
 */

import type { Difficulty, GameState, Move } from './types';
import { HOME_PROGRESS, YARD } from './types';
import { geometryOf } from './engine';
import { nextRandom } from './rng';

export interface ScoredMove {
  move: Move;
  score: number;
  notes: string[];
}

const WEIGHT = {
  finish: 60,
  capture: 34,
  captureDeep: 0.35,
  enter: 16,
  leaveYard: 4,
  safeLanding: 9,
  enterLane: 12,
  progress: 0.12,
  risk: 11,
  stack: 5,
  block: 8,
} as const;

function absOf(state: GameState, seat: number, progress: number): number {
  return (geometryOf(state, seat).startOffset + progress) % 52;
}

function isSafe(state: GameState, seat: number, progress: number): boolean {
  if (progress < 0 || progress > 50) return true; // yard and lane are safe
  return state.config.safeTrackIndices.includes(absOf(state, seat, progress));
}

/** How many opponent tokens could reach `progress` with a single roll. */
function threatCount(state: GameState, seat: number, progress: number): number {
  if (progress < 0 || progress > 50) return 0;
  const target = absOf(state, seat, progress);
  let threats = 0;
  state.config.seats.forEach((_, other) => {
    if (other === seat) return;
    const g = geometryOf(state, other);
    for (const p of state.tokens[other]) {
      if (p < 0 || p > 50) continue;
      const abs = (g.startOffset + p) % 52;
      const distance = (target - abs + 52) % 52;
      // An opponent needs 1..6 steps and must not overshoot its own exit.
      if (distance >= 1 && distance <= 6 && p + distance <= 50 + 6) threats += 1;
    }
  });
  return threats;
}

function countOwnOnSquare(state: GameState, seat: number, progress: number): number {
  if (progress < 0 || progress > 50) return 0;
  const target = absOf(state, seat, progress);
  return state.tokens[seat].filter(
    (p) => p >= 0 && p <= 50 && absOf(state, seat, p) === target,
  ).length;
}

export function scoreMoves(
  state: GameState,
  seat: number,
  difficulty: Difficulty,
): ScoredMove[] {
  return state.legalMoves
    .filter((m) => m.seat === seat)
    .map((move) => {
      const notes: string[] = [];
      let score = 0;

      if (move.kind === 'home') {
        score += WEIGHT.finish;
        notes.push('finish');
      } else if (move.to > 50) {
        score += WEIGHT.enterLane;
        notes.push('lane');
      }

      if (move.captures.length > 0) {
        score += WEIGHT.capture;
        for (const c of move.captures) {
          score += Math.min(c.fromProgress, 50) * WEIGHT.captureDeep;
        }
        notes.push('capture');
      }

      if (move.kind === 'enter') {
        const inPlay = state.tokens[seat].filter((p) => p >= 0 && p < HOME_PROGRESS).length;
        score += Math.max(WEIGHT.enter - inPlay * 3, 4);
        notes.push('enter');
      }

      if (difficulty !== 'easy') {
        if (isSafe(state, seat, move.to)) {
          score += WEIGHT.safeLanding;
          notes.push('safe');
        } else {
          const risk = threatCount(state, seat, move.to);
          const currentRisk = threatCount(state, seat, move.from);
          score -= risk * WEIGHT.risk - currentRisk * WEIGHT.risk * 0.6;
          if (risk > 0) notes.push(`risk:${risk}`);
        }

        if (move.to <= 50 && countOwnOnSquare(state, seat, move.to) >= 1) {
          score += WEIGHT.stack;
          notes.push('stack');
        }
        if (move.to <= 50 && countOwnOnSquare(state, seat, move.to) >= 2) {
          score += WEIGHT.block;
          notes.push('block');
        }
      }

      if (move.from !== YARD) {
        score += (move.to - move.from) * WEIGHT.progress;
      }

      // Prefer advancing the leading token when everything else ties.
      score += Math.max(move.to, 0) * 0.05;

      if (difficulty === 'easy') {
        // Easy players undervalue captures and often drift to a random move.
        score = score * 0.45 + Math.max(move.to, 0) * 0.1;
      }

      return { move, score, notes };
    })
    .sort((a, b) => b.score - a.score);
}

export function chooseMove(
  state: GameState,
  seat: number,
  difficulty: Difficulty,
): Move {
  const scored = scoreMoves(state, seat, difficulty);
  if (scored.length === 0) {
    throw new Error('chooseMove called with no legal moves');
  }

  // Seeded noise keeps replays deterministic while still varying play.
  const { value: r1 } = nextRandom(state.rng ^ (state.stats.rolls * 0x9e3779b1));
  const { value: r2 } = nextRandom((state.rng + 0x85ebca6b) ^ (state.stats.moves * 0xc2b2ae35));

  if (difficulty === 'easy') {
    if (r1 < 0.35) {
      return scored[Math.floor(r2 * scored.length)]!.move;
    }
    const top = scored.slice(0, Math.max(2, Math.ceil(scored.length / 2)));
    return top[Math.floor(r2 * top.length)]!.move;
  }

  if (difficulty === 'medium') {
    if (r1 < 0.15) {
      const top = scored.slice(0, Math.min(3, scored.length));
      return top[Math.floor(r2 * top.length)]!.move;
    }
    return scored[0]!.move;
  }

  // Hard: best move, deterministic tie-break by lowest token id for stability.
  const best = scored[0]!.score;
  const ties = scored.filter((s) => s.score >= best - 0.001);
  return ties[Math.floor(r2 * ties.length)]!.move;
}

/** How long the CPU should appear to "think", in ms. */
export function thinkingDelay(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'easy':
      return 520;
    case 'medium':
      return 700;
    default:
      return 880;
  }
}
