/**
 * Ludo Royale rules engine — a pure, deterministic state machine.
 *
 * Public API:
 *   createGame(config, seed)   -> GameState
 *   roll(state)                -> ActionResult   (rolls the dice)
 *   playMove(state, move)      -> ActionResult   (plays one of state.legalMoves)
 *   forfeitTurn(state)         -> ActionResult   (only used by UI for "stuck" guards)
 *   serialize / deserialize    -> JSON-safe save/restore
 *
 * Nothing here touches the DOM: the renderer is a pure projection of GameState.
 */

import type {
  Capture,
  GameConfig,
  GameEvent,
  GameLogEntry,
  GameState,
  Move,
  PlayerColor,
  RulesConfig,
  SeatConfig,
} from './types';
import {
  HOME_PROGRESS,
  SAFE_TRACK_INDICES,
  SEATS,
  TOKENS_PER_PLAYER,
  YARD,
} from './types';
import { seatGeometry, type SeatGeometry } from './geometry';
import { rollDie } from './rng';

export const STATE_VERSION = 2;

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export const DEFAULT_RULES: RulesConfig = {
  extraTurnOnCapture: true,
  threeSixesForfeit: true,
  blockCannotBeCaptured: true,
  exactHomeEntry: true,
};

export const DEFAULT_CONFIG: GameConfig = {
  seats: SEATS.map((color) => ({
    color,
    kind: 'human' as const,
    name: color.charAt(0).toUpperCase() + color.slice(1),
    difficulty: 'medium' as const,
  })),
  rules: { ...DEFAULT_RULES },
  safeTrackIndices: [...SAFE_TRACK_INDICES],
};

export function geometryOf(state: GameState, seat: number): SeatGeometry {
  const seatConfig = state.config.seats[seat];
  if (!seatConfig) throw new EngineError(`seat ${seat} does not exist`, 'bad-seat');
  return seatGeometry(SEATS.indexOf(seatConfig.color));
}

function absIndex(g: SeatGeometry, progress: number): number {
  return (g.startOffset + progress) % 52;
}

function isSafeAbs(state: GameState, abs: number): boolean {
  return state.config.safeTrackIndices.includes(abs);
}

function seatLabel(state: GameState, seat: number): string {
  return state.config.seats[seat]?.name ?? `Player ${seat + 1}`;
}

export function validateSeats(seats: SeatConfig[]): void {
  if (seats.length < 2) throw new EngineError('at least two players are required', 'seats');
  if (seats.length > 4) throw new EngineError('at most four players are supported', 'seats');
  const colors = new Set<PlayerColor>();
  for (const seat of seats) {
    if (colors.has(seat.color)) throw new EngineError(`duplicate colour ${seat.color}`, 'seats');
    colors.add(seat.color);
  }
}

let logSeqCounter = 0;

function log(
  _state: GameState,
  seat: number,
  text: string,
  tone: GameLogEntry['tone'] = 'neutral',
): GameLogEntry {
  logSeqCounter += 1;
  return { id: logSeqCounter, seat, text, tone };
}

function pushLog(state: GameState, entry: GameLogEntry): void {
  state.log.push(entry);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

export function createGame(config: GameConfig, seed: number): GameState {
  validateSeats(config.seats);
  const state: GameState = {
    version: STATE_VERSION,
    config: {
      seats: config.seats.map((s) => ({ ...s })),
      rules: { ...config.rules },
      safeTrackIndices: [...config.safeTrackIndices],
    },
    rng: seed >>> 0,
    turn: 0,
    tokens: config.seats.map(() => Array.from({ length: TOKENS_PER_PLAYER }, () => YARD)),
    phase: 'awaiting-roll',
    dice: null,
    legalMoves: [],
    sixStreak: 0,
    winner: null,
    stats: { rolls: 0, moves: 0, captures: 0, sixes: 0, finishedTokens: 0, turns: 1 },
    log: [],
  };
  pushLog(state, log(state, 0, `${seatLabel(state, 0)} starts. Roll the dice!`, 'accent'));
  return state;
}

/** All tokens of every seat currently standing on one shared-track square. */
function occupantsOfAbs(state: GameState, abs: number): Array<{ seat: number; token: number }> {
  const found: Array<{ seat: number; token: number }> = [];
  state.config.seats.forEach((_, seat) => {
    const g = geometryOf(state, seat);
    state.tokens[seat].forEach((progress, token) => {
      if (progress < 0 || progress > 50) return;
      if (absIndex(g, progress) === abs) found.push({ seat, token });
    });
  });
  return found;
}

/**
 * Every legal move for `seat` with the given dice value.
 * Exported because the AI and the unit tests both need it directly.
 */
export function computeMoves(state: GameState, seat: number, dice: number): Move[] {
  const g = geometryOf(state, seat);
  const moves: Move[] = [];
  const rules = state.config.rules;

  for (let token = 0; token < TOKENS_PER_PLAYER; token += 1) {
    const from = state.tokens[seat][token];

    if (from === HOME_PROGRESS) continue;

    if (from === YARD) {
      if (dice !== 6) continue;
      const target = absIndex(g, 0);
      const captures = captureList(state, seat, target);
      if (isBlockade(state, seat, target, captures)) continue;
      moves.push({ seat, token, from: YARD, to: 0, kind: 'enter', steps: 1, captures });
      continue;
    }

    let to = from + dice;
    if (to > HOME_PROGRESS) {
      if (rules.exactHomeEntry) continue;
      to = HOME_PROGRESS;
    }

    if (to <= 50) {
      const target = absIndex(g, to);
      const captures = captureList(state, seat, target);
      if (isBlockade(state, seat, target, captures)) continue;
      moves.push({ seat, token, from, to, kind: 'advance', steps: dice, captures });
      continue;
    }

    // Home lane: private, never captures, always allowed.
    moves.push({
      seat,
      token,
      from,
      to,
      kind: to === HOME_PROGRESS ? 'home' : 'advance',
      steps: dice,
      captures: [],
    });
  }
  return moves;
}

/** Opponent tokens that would be sent home by landing on `abs`. */
function captureList(state: GameState, seat: number, abs: number): Capture[] {
  if (isSafeAbs(state, abs)) return [];
  return occupantsOfAbs(state, abs)
    .filter((o) => o.seat !== seat)
    .map((o) => ({
      seat: o.seat,
      token: o.token,
      fromProgress: state.tokens[o.seat][o.token]!,
    }));
}

/** Two or more tokens of one opponent on a non-safe square cannot be attacked. */
function isBlockade(state: GameState, seat: number, abs: number, captures: Capture[]): boolean {
  if (!state.config.rules.blockCannotBeCaptured) return false;
  if (isSafeAbs(state, abs)) return false;
  const byOwner = new Map<number, number>();
  for (const c of captures) {
    if (c.seat === seat) continue;
    byOwner.set(c.seat, (byOwner.get(c.seat) ?? 0) + 1);
  }
  return [...byOwner.values()].some((n) => n >= 2);
}

function nextSeat(state: GameState): number {
  return (state.turn + 1) % state.config.seats.length;
}

function allFinished(state: GameState, seat: number): boolean {
  return state.tokens[seat].every((p) => p === HOME_PROGRESS);
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    tokens: state.tokens.map((row) => [...row]),
    legalMoves: state.legalMoves.map((m) => ({ ...m, captures: m.captures.map((c) => ({ ...c })) })),
    stats: { ...state.stats },
    log: [...state.log],
  };
}

/**
 * Rolls the dice for the seat whose turn it is.
 * Passing is automatic: if nothing can move, the turn advances here.
 */
export function roll(state: GameState): ActionResult {
  const { state: rngState, value } = rollDie(state.rng);
  const result = rollValue({ ...cloneState(state), rng: rngState }, value);
  return result;
}

/** Rolls a specific value — used by tests, replays and AI look-ahead. */
export function rollValue(input: GameState, value: number): ActionResult {
  if (input.phase !== 'awaiting-roll') {
    throw new EngineError(`cannot roll during phase ${input.phase}`, 'bad-phase');
  }
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new EngineError(`invalid dice value ${value}`, 'bad-dice');
  }

  const state = cloneState(input);
  const events: GameEvent[] = [];
  const seat = state.turn;
  const rules = state.config.rules;

  state.dice = value;
  state.stats.rolls += 1;
  if (value === 6) state.stats.sixes += 1;
  state.sixStreak = value === 6 ? state.sixStreak + 1 : 0;

  events.push({ type: 'roll', seat, value, sixStreak: state.sixStreak });
  pushLog(state, log(state, seat, `${seatLabel(state, seat)} rolled ${value}.`, value === 6 ? 'accent' : 'neutral'));

  // Rule: three consecutive sixes cancels the turn.
  if (rules.threeSixesForfeit && state.sixStreak >= 3) {
    events.push({ type: 'three-sixes', seat });
    pushLog(state, log(state, seat, `Three sixes in a row — ${seatLabel(state, seat)} loses the turn!`, 'bad'));
    return endTurn(state, events);
  }

  const moves = computeMoves(state, seat, value);
  if (moves.length === 0) {
    events.push({ type: 'no-moves', seat, value });
    pushLog(state, log(state, seat, `No legal move with ${value}.`, 'neutral'));
    return endTurn(state, events);
  }

  state.legalMoves = moves;
  state.phase = 'awaiting-move';
  return { state, events };
}

/** Applies one of the legal moves and resolves captures, extras and turn order. */
export function playMove(input: GameState, move: Move | number): ActionResult {
  if (input.phase !== 'awaiting-move') {
    throw new EngineError(`cannot move during phase ${input.phase}`, 'bad-phase');
  }
  const index = typeof move === 'number' ? move : input.legalMoves.findIndex((m) => matchMove(m, move));
  const chosen = input.legalMoves[index];
  if (!chosen) throw new EngineError('move is not legal', 'illegal-move');
  if (chosen.seat !== input.turn) throw new EngineError('move belongs to another seat', 'illegal-move');

  const state = cloneState(input);
  const events: GameEvent[] = [];
  const seat = state.turn;
  const dice = state.dice ?? 0;

  state.tokens[seat][chosen.token] = chosen.to;
  state.stats.moves += 1;
  events.push({
    type: 'move',
    seat,
    token: chosen.token,
    from: chosen.from,
    to: chosen.to,
    kind: chosen.kind,
  });
  if (chosen.kind === 'enter') {
    pushLog(state, log(state, seat, `${seatLabel(state, seat)} enters the board.`, 'neutral'));
  }

  // Resolve captures.
  let captured = false;
  for (const victim of chosen.captures) {
    state.tokens[victim.seat][victim.token] = YARD;
    state.stats.captures += 1;
    captured = true;
    const abs = absIndex(geometryOf(state, seat), chosen.to);
    events.push({
      type: 'capture',
      seat,
      victimSeat: victim.seat,
      victimToken: victim.token,
      trackIndex: abs,
    });
    pushLog(
      state,
      log(
        state,
        seat,
        `${seatLabel(state, seat)} captured ${seatLabel(state, victim.seat)}'s token!`,
        'good',
      ),
    );
  }

  if (chosen.to === HOME_PROGRESS) {
    state.stats.finishedTokens += 1;
    events.push({ type: 'home', seat, token: chosen.token });
    pushLog(state, log(state, seat, `${seatLabel(state, seat)} brought a token home!`, 'good'));
  }

  state.dice = null;
  state.legalMoves = [];
  state.phase = 'awaiting-roll';

  if (allFinished(state, seat)) {
    state.winner = seat;
    state.phase = 'game-over';
    events.push({ type: 'win', seat });
    pushLog(state, log(state, seat, `${seatLabel(state, seat)} wins the match! 🏆`, 'accent'));
    return { state, events };
  }

  const earnedExtra = dice === 6 || (captured && state.config.rules.extraTurnOnCapture);
  if (earnedExtra) {
    events.push({ type: 'extra-turn', seat, reason: dice === 6 ? 'six' : 'capture' });
    if (dice !== 6) state.sixStreak = 0;
    pushLog(state, log(state, seat, `Bonus roll for ${seatLabel(state, seat)}.`, 'accent'));
    // Same player rolls again.
    return { state, events };
  }

  return endTurn(state, events);
}

function matchMove(a: Move, b: Move): boolean {
  return a.seat === b.seat && a.token === b.token && a.to === b.to && a.from === b.from;
}

function endTurn(state: GameState, events: GameEvent[]): ActionResult {
  state.sixStreak = 0;
  state.dice = null;
  state.legalMoves = [];
  state.phase = 'awaiting-roll';
  state.turn = nextSeat(state);
  state.stats.turns += 1;
  events.push({ type: 'turn', seat: state.turn });
  pushLog(state, log(state, state.turn, `${seatLabel(state, state.turn)}'s turn.`, 'neutral'));
  return { state, events };
}

/** Rebuilds `legalMoves` after loading a save (defensive, cheap). */
export function refreshLegalMoves(state: GameState): GameState {
  const next = cloneState(state);
  if (next.phase === 'awaiting-move' && next.dice != null) {
    next.legalMoves = computeMoves(next, next.turn, next.dice);
    if (next.legalMoves.length === 0) {
      next.phase = 'awaiting-roll';
      next.dice = null;
    }
  }
  return next;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string): GameState {
  const parsed = JSON.parse(raw) as GameState;
  if (!parsed || parsed.version !== STATE_VERSION) {
    throw new EngineError('incompatible save version', 'bad-save');
  }
  if (!Array.isArray(parsed.config?.seats) || parsed.config.seats.length < 2) {
    throw new EngineError('corrupt save', 'bad-save');
  }
  validateSeats(parsed.config.seats);
  return refreshLegalMoves(parsed);
}

/** Scores used by the CPU evaluation: how far along each seat is. */
export function seatProgressScore(state: GameState, seat: number): number {
  return state.tokens[seat].reduce((sum, p) => sum + Math.max(p, 0), 0);
}

export function tokensOnTrack(state: GameState, seat: number): number {
  return state.tokens[seat].filter((p) => p >= 0 && p < HOME_PROGRESS).length;
}

export function finishedCount(state: GameState, seat: number): number {
  return state.tokens[seat].filter((p) => p === HOME_PROGRESS).length;
}
