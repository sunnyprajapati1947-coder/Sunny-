/**
 * Local persistence: settings, saved match, and lifetime statistics.
 * Everything is stored under a single namespaced key and every access is
 * defensive, because storage may be unavailable (private mode, Node tests).
 */

import type { Difficulty, GameState } from './types';
import { deserialize, serialize } from './engine';

const KEY = 'ludo-royale:v1';

export type SpeedSetting = 'slow' | 'normal' | 'fast';

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  speed: SpeedSetting;
  playerName: string;
  difficulty: Difficulty;
  mode: '2p' | '4p';
  rulesPreset: 'classic' | 'quick' | 'chaos';
}

export interface LifetimeStats {
  matches: number;
  wins: number;
  captures: number;
  tokensHome: number;
}

export interface StoredSave {
  savedAt: number;
  state: GameState;
}

interface Persisted {
  settings: Settings;
  stats: LifetimeStats;
  save: StoredSave | null;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  haptics: true,
  speed: 'normal',
  playerName: 'Player 1',
  difficulty: 'medium',
  mode: '4p',
  rulesPreset: 'classic',
};

const DEFAULT_STATS: LifetimeStats = { matches: 0, wins: 0, captures: 0, tokensHome: 0 };

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Probe: Safari private mode throws on write.
    const probe = `${KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

function readAll(): Persisted {
  const store = storage();
  if (!store) return { settings: { ...DEFAULT_SETTINGS }, stats: { ...DEFAULT_STATS }, save: null };
  try {
    const raw = store.getItem(KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, stats: { ...DEFAULT_STATS }, save: null };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      stats: { ...DEFAULT_STATS, ...(parsed.stats ?? {}) },
      save: parsed.save ?? null,
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, stats: { ...DEFAULT_STATS }, save: null };
  }
}

function writeAll(data: Persisted): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode — settings simply do not persist */
  }
}

export function loadSettings(): Settings {
  return readAll().settings;
}

export function saveSettings(settings: Settings): void {
  const data = readAll();
  writeAll({ ...data, settings });
}

export function loadStats(): LifetimeStats {
  return readAll().stats;
}

export function recordMatch(result: {
  won: boolean;
  captures: number;
  tokensHome: number;
}): LifetimeStats {
  const data = readAll();
  const stats: LifetimeStats = {
    matches: data.stats.matches + 1,
    wins: data.stats.wins + (result.won ? 1 : 0),
    captures: data.stats.captures + result.captures,
    tokensHome: data.stats.tokensHome + result.tokensHome,
  };
  writeAll({ ...data, stats });
  return stats;
}

export function resetStats(): LifetimeStats {
  const data = readAll();
  writeAll({ ...data, stats: { ...DEFAULT_STATS } });
  return { ...DEFAULT_STATS };
}

export function saveMatch(state: GameState): void {
  const data = readAll();
  writeAll({ ...data, save: { savedAt: Date.now(), state } });
}

export function loadMatch(): StoredSave | null {
  const save = readAll().save;
  if (!save) return null;
  try {
    // Round-trip through the engine so an old schema is rejected cleanly.
    const state = deserialize(serialize(save.state));
    return { savedAt: save.savedAt, state };
  } catch {
    clearMatch();
    return null;
  }
}

export function clearMatch(): void {
  const data = readAll();
  writeAll({ ...data, save: null });
}

export function clearAll(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
