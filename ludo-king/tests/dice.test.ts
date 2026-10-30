import { describe, expect, it } from 'vitest';
import { FACE_ROTATION, PIP_LAYOUT, rollQueue, shakeOffsets } from '../src/core/dice';
import { nextRandom, rollDie } from '../src/core/rng';

describe('dice engine', () => {
  it('defines a valid pip layout for every face', () => {
    for (let face = 1; face <= 6; face += 1) {
      const pips = PIP_LAYOUT[face]!;
      expect(pips).toHaveLength(face);
      expect(new Set(pips).size).toBe(face);
      for (const pip of pips) {
        expect(pip).toBeGreaterThanOrEqual(0);
        expect(pip).toBeLessThan(9);
      }
    }
  });

  it('defines a unique 3D rotation per face', () => {
    const faces = new Set(Object.values(FACE_ROTATION).map((r) => `${r.x},${r.y}`));
    expect(faces.size).toBe(6);
  });

  it('is deterministic for a given RNG state', () => {
    const a = rollQueue(12345);
    const b = rollQueue(12345);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(1);
    expect(a.value).toBeLessThanOrEqual(6);
    expect(a.rngState).not.toBe(12345);
    expect(a.durationMs).toBeGreaterThanOrEqual(600);
  });

  it('produces a uniform-ish distribution over many rolls', () => {
    const counts = new Map<number, number>();
    let state = 987654321;
    for (let i = 0; i < 60000; i += 1) {
      const roll = rollDie(state);
      state = roll.state;
      counts.set(roll.value, (counts.get(roll.value) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (let face = 1; face <= 6; face += 1) {
      const n = counts.get(face) ?? 0;
      // Each face should land within ~8% of the expected 10,000.
      expect(n).toBeGreaterThan(9200);
      expect(n).toBeLessThan(10800);
    }
  });

  it('advances the RNG state monotonically away from previously seen states', () => {
    const seen = new Set<number>();
    let state = 42;
    for (let i = 0; i < 500; i += 1) {
      expect(seen.has(state)).toBe(false);
      seen.add(state);
      state = nextRandom(state).state;
    }
  });

  it('decays shake offsets to zero', () => {
    const offsets = shakeOffsets(10);
    expect(offsets).toHaveLength(10);
    const first = Math.abs(offsets[0]!.dx);
    const last = Math.abs(offsets[9]!.dx);
    expect(first).toBeGreaterThan(last);
    expect(offsets.every((o) => Number.isFinite(o.dx) && Number.isFinite(o.rot))).toBe(true);
  });
});
