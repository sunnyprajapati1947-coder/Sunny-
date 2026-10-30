/**
 * Match setup: turns menu choices into a validated GameConfig.
 */

import type { Difficulty, GameConfig, PlayerColor, RuleSet, RulesConfig, SeatConfig } from './types';
import { SAFE_TRACK_INDICES, SEATS } from './types';
import { DEFAULT_RULES, validateSeats } from './engine';

export const RULE_PRESETS: RuleSet[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Standard Ludo: exact home entry, bonus roll on a six or a capture, blockades are safe.',
    rules: { ...DEFAULT_RULES },
  },
  {
    id: 'quick',
    label: 'Quick Match',
    description: 'No exact home entry — a token finishes as soon as it overshoots the centre.',
    rules: { ...DEFAULT_RULES, exactHomeEntry: false },
  },
  {
    id: 'chaos',
    label: 'Chaos',
    description: 'Blockades can be captured and three sixes is still a forfeit. Fast and brutal.',
    rules: { ...DEFAULT_RULES, blockCannotBeCaptured: false },
  },
];

export function rulesForPreset(id: string): RulesConfig {
  return { ...(RULE_PRESETS.find((p) => p.id === id)?.rules ?? DEFAULT_RULES) };
}

export type GameMode = '2p' | '4p';
export type HumanSeatCount = 0 | 1 | 2;

export interface SetupOptions {
  mode: GameMode;
  /** How many of the seats are controlled locally by people. */
  humans: HumanSeatCount;
  difficulty: Difficulty;
  playerName: string;
  rulesPreset: string;
}

/** Two-player duels are played diagonally, exactly like the classic board. */
export const TWO_PLAYER_COLORS: PlayerColor[] = ['red', 'yellow'];

export const COLOR_META: Record<
  PlayerColor,
  { label: string; hex: string; deep: string; light: string }
> = {
  red: { label: 'Red', hex: '#e63a45', deep: '#9c1620', light: '#ff8a90' },
  green: { label: 'Green', hex: '#22a06b', deep: '#0d6b45', light: '#6ee7b7' },
  yellow: { label: 'Yellow', hex: '#f2b705', deep: '#a97b00', light: '#ffd95e' },
  blue: { label: 'Blue', hex: '#2f6fed', deep: '#1a3f96', light: '#8fb5ff' },
};

export function seatColors(mode: GameMode): PlayerColor[] {
  return mode === '2p' ? [...TWO_PLAYER_COLORS] : [...SEATS];
}

export function buildConfig(options: SetupOptions, seedName = 'You'): GameConfig {
  const colors = seatColors(options.mode);
  const seats: SeatConfig[] = colors.map((color, index) => {
    const isHuman = index < options.humans;
    return {
      color,
      kind: isHuman ? 'human' : 'cpu',
      name: isHuman
        ? index === 0
          ? options.playerName.trim() || seedName
          : `Player ${index + 1}`
        : `CPU ${index + 1}`,
      difficulty: options.difficulty,
    };
  });
  validateSeats(seats);
  return {
    seats,
    rules: rulesForPreset(options.rulesPreset),
    safeTrackIndices: [...SAFE_TRACK_INDICES],
  };
}

export function describeSeats(config: GameConfig): string {
  return config.seats.map((s) => `${s.name} (${s.color})`).join(' vs ');
}
