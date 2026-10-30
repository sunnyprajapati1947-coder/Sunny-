/**
 * Deterministic pseudo-random number generation (mulberry32).
 *
 * A seeded generator lets games be replayed, unit-tested and saved/restored
 * mid-match without losing fairness, and makes every rule test reproducible.
 */

export function nextRandom(state: number): { state: number; value: number } {
  // mulberry32
  let t = (state + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { state: t >>> 0, value };
}

export function rollDie(state: number): { state: number; value: number } {
  const r = nextRandom(state);
  return { state: r.state, value: 1 + Math.floor(r.value * 6) };
}

export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}
