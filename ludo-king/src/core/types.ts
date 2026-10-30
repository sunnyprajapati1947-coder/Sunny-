/**
 * Core domain types for the Ludo Royale rules engine.
 *
 * The engine is deliberately free of any DOM/browser dependency so that it can
 * be unit-tested in Node and reused by any renderer.
 */

export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';
export type PlayerKind = 'human' | 'cpu';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Turn order is fixed: red -> green -> yellow -> blue. */
export const SEATS: readonly PlayerColor[] = ['red', 'green', 'yellow', 'blue'] as const;

export const TOKENS_PER_PLAYER = 4;
/** Number of shared track squares (0..51). */
export const TRACK_LENGTH = 52;
/** Last shared-track progress value a token can occupy. */
export const LAST_TRACK_PROGRESS = TRACK_LENGTH - 2; // 50
/** Progress value meaning "finished" for a token. */
export const HOME_PROGRESS = 56;
/** Progress value for "still in the yard". */
export const YARD = -1;

/** Shared track squares that cannot be attacked in this ruleset. */
export const SAFE_TRACK_INDICES: readonly number[] = [0, 8, 13, 21, 26, 34, 39, 47];

export type Phase = 'awaiting-roll' | 'awaiting-move' | 'game-over';

export interface RulesConfig {
  /** Award another roll after capturing an opponent token. */
  extraTurnOnCapture: boolean;
  /** Three consecutive sixes forfeits the turn. */
  threeSixesForfeit: boolean;
  /** Two or more tokens on one square form a blockade that cannot be passed... see docs. */
  blockCannotBeCaptured: boolean;
  /** A token must land exactly on the centre to finish. */
  exactHomeEntry: boolean;
}

export interface SeatConfig {
  color: PlayerColor;
  kind: PlayerKind;
  name: string;
  difficulty: Difficulty;
}

export interface GameConfig {
  seats: SeatConfig[];
  rules: RulesConfig;
  /** Which star (safe) squares are enabled; defaults to all eight. */
  safeTrackIndices: number[];
}

export interface Capture {
  seat: number;
  token: number;
  /** Progress the victim had before it was sent back to the yard. */
  fromProgress: number;
}

export interface Move {
  seat: number;
  token: number;
  from: number;
  to: number;
  kind: 'enter' | 'advance' | 'home';
  steps: number;
  captures: Capture[];
}

export type GameEvent =
  | { type: 'roll'; seat: number; value: number; sixStreak: number }
  | { type: 'move'; seat: number; token: number; from: number; to: number; kind: Move['kind'] }
  | { type: 'capture'; seat: number; victimSeat: number; victimToken: number; trackIndex: number }
  | { type: 'home'; seat: number; token: number }
  | { type: 'no-moves'; seat: number; value: number }
  | { type: 'three-sixes'; seat: number }
  | { type: 'extra-turn'; seat: number; reason: 'six' | 'capture' }
  | { type: 'turn'; seat: number }
  | { type: 'win'; seat: number }
  | { type: 'restart' };

export interface GameStats {
  rolls: number;
  moves: number;
  captures: number;
  sixes: number;
  finishedTokens: number;
  turns: number;
}

export interface GameState {
  /** Persisted schema version. */
  version: number;
  config: GameConfig;
  /** Deterministic RNG state (mulberry32 seed). */
  rng: number;
  /** Index into config.seats. */
  turn: number;
  /** tokens[seat][token] = progress (-1 yard .. 56 home). */
  tokens: number[][];
  phase: Phase;
  dice: number | null;
  legalMoves: Move[];
  sixStreak: number;
  winner: number | null;
  stats: GameStats;
  /** Rolling log used for the in-game activity feed (newest last). */
  log: GameLogEntry[];
}

export interface GameLogEntry {
  id: number;
  seat: number;
  text: string;
  tone: 'neutral' | 'good' | 'bad' | 'accent';
}

export interface RuleSet {
  id: string;
  label: string;
  description: string;
  rules: RulesConfig;
}
