import { describe, expect, it } from 'vitest';
import {
  computeMoves,
  createGame,
  deserialize,
  playMove,
  rollValue,
  serialize,
  seatProgressScore,
  STATE_VERSION,
} from '../src/core/engine';
import { DEFAULT_RULES, DEFAULT_CONFIG } from '../src/core/engine';
import type { GameConfig, GameState, PlayerColor } from '../src/core/types';
import { HOME_PROGRESS, YARD } from '../src/core/types';

/** Two-seat config (red vs yellow, the classic diagonal duel). */
function duelConfig(): GameConfig {
  return {
    seats: [
      { color: 'red', kind: 'human', name: 'Red', difficulty: 'medium' },
      { color: 'yellow', kind: 'cpu', name: 'Yellow', difficulty: 'medium' },
    ],
    rules: { ...DEFAULT_RULES },
    safeTrackIndices: DEFAULT_CONFIG.safeTrackIndices,
  };
}

function fourSeatConfig(): GameConfig {
  const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
  return {
    seats: colors.map((color) => ({
      color,
      kind: 'human' as const,
      name: color,
      difficulty: 'medium' as const,
    })),
    rules: { ...DEFAULT_RULES },
    safeTrackIndices: DEFAULT_CONFIG.safeTrackIndices,
  };
}

function game(config: GameConfig = duelConfig(), seed = 12345): GameState {
  return createGame(config, seed);
}

/** Red track offset is 0, yellow is 26 — helper to place a yellow token on an absolute square. */
function yellowProgressForAbs(abs: number): number {
  return (abs - 26 + 52) % 52;
}

describe('game creation', () => {
  it('starts with every token in the yard and the first seat to roll', () => {
    const state = game();
    expect(state.phase).toBe('awaiting-roll');
    expect(state.turn).toBe(0);
    expect(state.dice).toBeNull();
    expect(state.tokens).toEqual([
      [YARD, YARD, YARD, YARD],
      [YARD, YARD, YARD, YARD],
    ]);
    expect(state.winner).toBeNull();
    expect(state.version).toBe(STATE_VERSION);
  });

  it('rejects duplicate colours and single-player configs', () => {
    expect(() =>
      createGame(
        {
          seats: [
            { color: 'red', kind: 'human', name: 'a', difficulty: 'easy' },
            { color: 'red', kind: 'cpu', name: 'b', difficulty: 'easy' },
          ],
          rules: { ...DEFAULT_RULES },
          safeTrackIndices: [],
        },
        1,
      ),
    ).toThrow(/duplicate/i);

    expect(() =>
      createGame(
        { seats: [{ color: 'red', kind: 'human', name: 'a', difficulty: 'easy' }], rules: DEFAULT_RULES, safeTrackIndices: [] },
        1,
      ),
    ).toThrow(/at least two/i);
  });
});

describe('dice and turn flow', () => {
  it('only a six releases a token from the yard', () => {
    const state = game();
    expect(computeMoves(state, 0, 3)).toHaveLength(0);
    const six = computeMoves(state, 0, 6);
    expect(six).toHaveLength(4);
    expect(six.every((m) => m.kind === 'enter' && m.to === 0)).toBe(true);
  });

  it('auto-passes the turn when nothing can move', () => {
    const rolled = rollValue(game(), 3);
    expect(rolled.state.phase).toBe('awaiting-roll');
    expect(rolled.state.turn).toBe(1);
    expect(rolled.events.some((e) => e.type === 'no-moves')).toBe(true);
  });

  it('waits for a move and then hands the turn to the next seat', () => {
    const rolled = rollValue(game(), 6);
    expect(rolled.state.phase).toBe('awaiting-move');
    expect(rolled.state.legalMoves).toHaveLength(4);

    const played = playMove(rolled.state, 0);
    expect(played.state.tokens[0][0]).toBe(0);
    // A six grants another roll to the same seat.
    expect(played.state.turn).toBe(0);
    expect(played.state.phase).toBe('awaiting-roll');
    expect(played.state.sixStreak).toBe(1);
  });

  it('three consecutive sixes cancels the turn', () => {
    let state = game();
    for (let i = 0; i < 3; i += 1) {
      const res = rollValue(state, 6);
      if (res.state.phase === 'awaiting-move') {
        state = playMove(res.state, 0).state;
      } else {
        state = res.state;
      }
    }
    // After the third six the turn belongs to the opponent and the streak reset.
    expect(state.turn).toBe(1);
    expect(state.sixStreak).toBe(0);
  });

  it('rejects out-of-phase actions', () => {
    const state = game();
    expect(() => playMove(state, 0)).toThrow(/phase/i);
    const ready = rollValue(state, 6).state;
    expect(() => rollValue(ready, 4)).toThrow(/phase/i);
  });

  it('rejects illegal dice values', () => {
    expect(() => rollValue(game(), 0)).toThrow(/invalid dice/i);
    expect(() => rollValue(game(), 7)).toThrow(/invalid dice/i);
    expect(() => rollValue(game(), 2.5)).toThrow(/invalid dice/i);
  });
});

describe('movement', () => {
  it('moves a token by exactly the dice value', () => {
    const state = game();
    state.tokens[0][0] = 10;
    const moves = computeMoves(state, 0, 4);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toBe(14);
    const played = playMove({ ...state, phase: 'awaiting-move', dice: 4, legalMoves: moves, turn: 0 }, 0);
    expect(played.state.tokens[0][0]).toBe(14);
    expect(played.state.turn).toBe(1);
  });

  it('requires an exact roll to finish when exactHomeEntry is on', () => {
    const state = game();
    state.tokens[0][0] = 54;
    // 54 + 3 = 57 -> overshoot, illegal.
    expect(computeMoves(state, 0, 3)).toHaveLength(0);
    const exact = computeMoves(state, 0, 2);
    expect(exact).toHaveLength(1);
    expect(exact[0]!.to).toBe(HOME_PROGRESS);
    expect(exact[0]!.kind).toBe('home');
  });

  it('clamps the last step when exactHomeEntry is off', () => {
    const config = duelConfig();
    config.rules.exactHomeEntry = false;
    const state = game(config);
    state.tokens[0][0] = 54;
    const moves = computeMoves(state, 0, 5);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toBe(HOME_PROGRESS);
  });

  it('walks from the last shared square into the home lane', () => {
    const state = game();
    state.tokens[0][0] = 50;
    const moves = computeMoves(state, 0, 1);
    expect(moves[0]!.to).toBe(51);
    expect(moves[0]!.kind).toBe('advance');
  });

  it('never allows a move for a finished token', () => {
    const state = game();
    state.tokens[0] = [HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS, 20];
    const moves = computeMoves(state, 0, 6);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.token).toBe(3);
  });
});

describe('captures and safe squares', () => {
  it('sends an opponent home when landing on the same square', () => {
    const state = game();
    state.tokens[0][0] = 2; // abs 2
    state.tokens[1][0] = yellowProgressForAbs(5); // abs 5
    const moves = computeMoves(state, 0, 3);
    const captureMove = moves.find((m) => m.to === 5)!;
    expect(captureMove.captures).toHaveLength(1);
    expect(captureMove.captures[0]!.seat).toBe(1);

    const played = playMove({ ...state, phase: 'awaiting-move', dice: 3, legalMoves: moves, turn: 0 }, captureMove);
    expect(played.state.tokens[1][0]).toBe(YARD);
    expect(played.state.tokens[0][0]).toBe(5);
    expect(played.state.stats.captures).toBe(1);
    // Capture awards a bonus roll to the same seat.
    expect(played.state.turn).toBe(0);
    expect(played.events.some((e) => e.type === 'capture')).toBe(true);
  });

  it('cannot capture on a star square', () => {
    const state = game();
    state.tokens[0][0] = 5;
    state.tokens[1][0] = yellowProgressForAbs(8); // abs 8 is a star
    const moves = computeMoves(state, 0, 3);
    const landing = moves.find((m) => m.to === 8)!;
    expect(landing.captures).toHaveLength(0);
    const played = playMove({ ...state, phase: 'awaiting-move', dice: 3, legalMoves: moves, turn: 0 }, landing);
    expect(played.state.tokens[1][0]).toBe(yellowProgressForAbs(8));
  });

  it('cannot capture a blockade of two tokens by default', () => {
    const state = game();
    state.tokens[0][0] = 2;
    state.tokens[1][0] = yellowProgressForAbs(5);
    state.tokens[1][1] = yellowProgressForAbs(5);
    const moves = computeMoves(state, 0, 3);
    expect(moves.find((m) => m.to === 5)).toBeUndefined();
  });

  it('allows capturing a blockade when the rule is disabled', () => {
    const config = duelConfig();
    config.rules.blockCannotBeCaptured = false;
    const state = game(config);
    state.tokens[0][0] = 2;
    state.tokens[1][0] = yellowProgressForAbs(5);
    state.tokens[1][1] = yellowProgressForAbs(5);
    const moves = computeMoves(state, 0, 3);
    const landing = moves.find((m) => m.to === 5)!;
    expect(landing.captures).toHaveLength(2);
  });

  it('can share a square with your own token', () => {
    const state = game();
    state.tokens[0][0] = 10;
    state.tokens[0][1] = 12;
    const moves = computeMoves(state, 0, 2);
    expect(moves.some((m) => m.token === 1 && m.to === 14)).toBe(true);
  });

  it('never allows a token to capture on its own start square', () => {
    const state = game();
    state.tokens[1][0] = yellowProgressForAbs(0); // sits on red's start
    state.tokens[0][0] = YARD;
    const moves = computeMoves(state, 0, 6);
    expect(moves[0]!.captures).toHaveLength(0);
  });
});

describe('winning', () => {
  it('ends the match when all four tokens are home', () => {
    const state = game();
    state.tokens[0] = [HOME_PROGRESS, HOME_PROGRESS, HOME_PROGRESS, 54];
    const moves = computeMoves(state, 0, 2);
    const res = playMove({ ...state, phase: 'awaiting-move', dice: 2, legalMoves: moves, turn: 0 }, 0);
    expect(res.state.phase).toBe('game-over');
    expect(res.state.winner).toBe(0);
    expect(res.events.some((e) => e.type === 'win')).toBe(true);
  });

  it('refuses actions after the game is over', () => {
    const state = game();
    state.phase = 'game-over';
    state.winner = 0;
    expect(() => rollValue(state, 6)).toThrow(/phase/i);
  });
});

describe('save and restore', () => {
  it('round-trips a state without losing information', () => {
    let state = game(fourSeatConfig(), 99);
    state = rollValue(state, 6).state;
    state = playMove(state, 0).state;
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
    expect(restored.phase).toBe('awaiting-roll');
  });

  it('rejects a save from an incompatible version', () => {
    const state = game();
    const broken = JSON.parse(serialize(state));
    broken.version = 1;
    expect(() => deserialize(JSON.stringify(broken))).toThrow(/version/i);
  });

  it('rejects corrupt saves', () => {
    expect(() => deserialize('{"version":2}')).toThrow(/corrupt/i);
    expect(() => deserialize('not json')).toThrow();
  });
});

describe('scores', () => {
  it('reports progress relative to the yard', () => {
    const state = game();
    state.tokens[0] = [0, 10, HOME_PROGRESS, YARD];
    expect(seatProgressScore(state, 0)).toBe(66);
  });
});
