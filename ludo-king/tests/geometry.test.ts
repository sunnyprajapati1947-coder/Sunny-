import { describe, expect, it } from 'vitest';
import {
  LANES_FOR_TEST,
  SEAT_GEOMETRY,
  TRACK,
  movementPath,
  progressCenter,
  trackIndexFor,
} from '../src/core/geometry';
import { SAFE_TRACK_INDICES, SEATS, TRACK_LENGTH, YARD } from '../src/core/types';

describe('board geometry', () => {
  it('has exactly 52 distinct track squares inside the 15x15 board', () => {
    expect(TRACK).toHaveLength(TRACK_LENGTH);
    const keys = new Set(TRACK.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(52);
    for (const c of TRACK) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(15);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(15);
      // Track squares never sit inside the centre home square.
      const inCentre = c.x >= 6 && c.x <= 8 && c.y >= 6 && c.y <= 8;
      expect(inCentre).toBe(false);
      // ...nor inside a 6x6 yard.
      const inYard =
        (c.x <= 5 || c.x >= 9) && (c.y <= 5 || c.y >= 9);
      expect(inYard).toBe(false);
    }
  });

  it('forms a closed loop of adjacent squares with four inner elbows', () => {
    let elbows = 0;
    for (let i = 0; i < TRACK.length; i += 1) {
      const a = TRACK[i]!;
      const b = TRACK[(i + 1) % TRACK.length]!;
      const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      // The classic board turns diagonally across the four inner corners of
      // the centre square; every other step is orthogonal.
      if (distance === 2) {
        expect(Math.abs(a.x - b.x)).toBe(1);
        expect(Math.abs(a.y - b.y)).toBe(1);
        elbows += 1;
      } else {
        expect(distance).toBe(1);
      }
    }
    expect(elbows).toBe(4);
  });

  it('gives every seat a start square 13 steps apart, all of them safe', () => {
    expect(SEAT_GEOMETRY.map((g) => g.startOffset)).toEqual([0, 13, 26, 39]);
    for (const g of SEAT_GEOMETRY) {
      expect(SAFE_TRACK_INDICES).toContain(g.startOffset);
      expect(trackIndexFor(g.index, 0)).toBe(g.startOffset);
    }
    expect(new Set(SEAT_GEOMETRY.map((g) => `${g.startCell.x},${g.startCell.y}`)).size).toBe(4);
  });

  it('places each yard in the corner opposite its home lane', () => {
    expect(SEAT_GEOMETRY[0]!.yardRect).toMatchObject({ x: 0, y: 0 });
    expect(SEAT_GEOMETRY[1]!.yardRect).toMatchObject({ x: 9, y: 0 });
    expect(SEAT_GEOMETRY[2]!.yardRect).toMatchObject({ x: 9, y: 9 });
    expect(SEAT_GEOMETRY[3]!.yardRect).toMatchObject({ x: 0, y: 9 });
  });

  it('connects the last track square to the first home-lane square', () => {
    for (const g of SEAT_GEOMETRY) {
      const exit = g.exitCell;
      const laneEntry = g.lane[0]!;
      const distance = Math.abs(exit.x - laneEntry.x) + Math.abs(exit.y - laneEntry.y);
      expect(distance).toBe(1);
      expect(g.exitOffset).toBe((g.startOffset + 50) % TRACK_LENGTH);
    }
  });

  it('keeps home lanes private: five squares each, none shared with the track', () => {
    const trackKeys = new Set(TRACK.map((c) => `${c.x},${c.y}`));
    const laneKeys: string[] = [];
    for (const color of SEATS) {
      const lane = LANES_FOR_TEST[color];
      expect(lane).toHaveLength(5);
      for (const cell of lane) {
        expect(trackKeys.has(`${cell.x},${cell.y}`)).toBe(false);
        laneKeys.push(`${cell.x},${cell.y}`);
      }
    }
    expect(new Set(laneKeys).size).toBe(20);
  });

  it('produces monotonic movement paths', () => {
    expect(movementPath(3, 7)).toEqual([4, 5, 6, 7]);
    expect(movementPath(-1, 0)).toEqual([0]);
    expect(movementPath(56, 56)).toEqual([]);
  });

  it('maps progress values to board-unit centres', () => {
    for (const g of SEAT_GEOMETRY) {
      const start = progressCenter(g.index, 0);
      expect(start.x).toBeCloseTo(g.startCell.x + 0.5);
      expect(start.y).toBeCloseTo(g.startCell.y + 0.5);
      // Yard positions sit inside the 6x6 yard panel.
      const yard = progressCenter(g.index, YARD);
      expect(yard.x).toBeGreaterThan(g.yardRect.x);
      expect(yard.x).toBeLessThan(g.yardRect.x + 6);
      expect(yard.y).toBeGreaterThan(g.yardRect.y);
      expect(yard.y).toBeLessThan(g.yardRect.y + 6);
      // Finished tokens sit in the centre 3x3.
      const home = progressCenter(g.index, 56);
      expect(home.x).toBeGreaterThan(6);
      expect(home.x).toBeLessThan(9);
      expect(home.y).toBeGreaterThan(6);
      expect(home.y).toBeLessThan(9);
    }
  });
});
