import { describe, expect, it } from 'vitest';
import {
  chooseMove,
  scoreMoves,
  thinkingDelay,
} from '../src/core/ai';
import { computeMoves, createGame, geometryOf, playMove, roll } from '../src/core/engine';
import { DEFAULT_RULES, DEFAULT_CONFIG } from '../src/core/engine';
import type { Difficulty, GameConfig, GameState } from '../src/core/types';
import { HOME_PROGRESS, SAFE_TRACK_INDICES, TOKENS_PER_PLAYER, YARD } from '../src/core/types';

function fourSeatConfig(difficulty: Difficulty = 'medium'): GameConfig {
  return {
    seats: (['red', 'green', 'yellow', 'blue'] as const).map((color) => ({
      color,
      kind: 'cpu' as const,
      name: color,
      difficulty,
    })),
    rules: { ...DEFAULT_RULES },
    safeTrackIndices: [...DEFAULT_CONFIG.safeTrackIndices],
  };
}

function rollUntilMove(state: GameState): GameState {
  let current = state;
  for (let guard = 0; guard < 200; guard += 1) {
    if (current.phase === 'game-over') return current;
    if (current.phase === 'awaiting-move') return current;
    current = roll(current).state;
  }
  return current;
}

describe('CPU opponent', () => {
  it('always returns a move that is in the legal list', () => {
    let state = rollUntilMove(createGame(fourSeatConfig(), 4242));
    expect(state.phase).toBe('awaiting-move');
    const move = chooseMove(state, state.turn, 'hard');
    expect(state.legalMoves.some((m) => m.token === move.token && m.to === move.to)).toBe(true);
  });

  it('prefers a capture over a quiet advance', () => {
    const state = createGame(fourSeatConfig(), 7);
    // Red to move: token A can capture, token B can only advance.
    state.tokens[0][0] = 2; // abs 2, would capture at abs 5 with a 3
    state.tokens[0][1] = 20; // abs 20
    state.tokens[1][0] = (5 - 13 + 52) % 52; // green token on abs 5
    const dice = 3;
    const legalMoves = computeMoves(state, 0, dice);
    const withDice: GameState = { ...state, phase: 'awaiting-move', dice, legalMoves, turn: 0 };
    const scored = scoreMoves(withDice, 0, 'hard');
    const best = chooseMove(withDice, 0, 'hard');
    expect(best.captures.length).toBeGreaterThan(0);
    expect(scored[0]!.notes).toContain('capture');
  });

  it('prefers finishing a token when possible', () => {
    const state = createGame(fourSeatConfig(), 11);
    state.tokens[0] = [HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS, 54];
    const legalMoves = computeMoves(state, 0, 2);
    const withDice: GameState = { ...state, phase: 'awaiting-move', dice: 2, legalMoves, turn: 0 };
    const move = chooseMove(withDice, 0, 'hard');
    expect(move.to).toBe(HOME_PROGRESS);
  });

  it('never cheats: every chosen move exists in legalMoves across a whole match', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
      let state = createGame(fourSeatConfig(difficulty), 2024);
      let steps = 0;
      while (state.phase !== 'game-over' && steps < 40000) {
        if (state.phase === 'awaiting-roll') {
          state = roll(state).state;
        } else {
          const move = chooseMove(state, state.turn, difficulty);
          expect(state.legalMoves.some((m) => m.token === move.token && m.to === move.to)).toBe(true);
          state = playMove(state, move).state;
        }
        steps += 1;
      }
      expect(state.phase).toBe('game-over');
      expect(state.winner).not.toBeNull();
    }
  });

  it('scales its thinking delay with difficulty', () => {
    expect(thinkingDelay('easy')).toBeLessThan(thinkingDelay('medium'));
    expect(thinkingDelay('medium')).toBeLessThan(thinkingDelay('hard'));
  });
});

describe('full-match invariants', () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

  it('never produces an invalid token position or turn index', () => {
    for (const seed of seeds) {
      let state = createGame(fourSeatConfig('medium'), seed);
      let steps = 0;
      while (state.phase !== 'game-over' && steps < 40000) {
        // Invariants checked every step.
        expect(state.turn).toBeGreaterThanOrEqual(0);
        expect(state.turn).toBeLessThan(state.config.seats.length);
        for (const row of state.tokens) {
          expect(row).toHaveLength(TOKENS_PER_PLAYER);
          for (const p of row) {
            expect(p === YARD || (p >= 0 && p <= HOME_PROGRESS)).toBe(true);
          }
        }
        if (state.phase === 'awaiting-roll') {
          state = roll(state).state;
        } else {
          const move = chooseMove(state, state.turn, 'medium');
          state = playMove(state, move).state;
        }
        steps += 1;
      }
      expect(state.phase).toBe('game-over');
      expect(state.tokens[state.winner!]!.every((p) => p === HOME_PROGRESS)).toBe(true);
    }
  });

  it('keeps safe squares free of captures throughout a match', () => {
    for (const seed of seeds.slice(0, 5)) {
      let state = createGame(fourSeatConfig('hard'), seed);
      let steps = 0;
      while (state.phase !== 'game-over' && steps < 40000) {
        if (state.phase === 'awaiting-roll') {
          state = roll(state).state;
        } else {
          const move = chooseMove(state, state.turn, 'hard');
          if (move.to <= 50 && move.to >= 0 && move.captures.length > 0) {
            const abs = (geometryOf(state, state.turn).startOffset + move.to) % 52;
            expect(SAFE_TRACK_INDICES).not.toContain(abs);
          }
          state = playMove(state, move).state;
        }
        steps += 1;
      }
      expect(state.phase).toBe('game-over');
    }
  });
});
