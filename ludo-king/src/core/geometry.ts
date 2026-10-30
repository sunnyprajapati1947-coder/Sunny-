/**
 * Board geometry.
 *
 * The board is the classic 15x15 cross layout:
 *
 *   - four 6x6 yards in the corners (each holding one player's four tokens),
 *   - a cross-shaped shared track of 52 squares that every player loops
 *     through counter-clockwise,
 *   - four private "home lanes" of 5 squares leading to the centre,
 *   - the centre triangle where finished tokens rest.
 *
 * All coordinates here are expressed in board grid units (0..15) so the
 * renderer can scale them to any viewport size.
 *
 * Progress model (see types.ts):
 *   YARD (-1)  -> in the yard
 *   0 .. 50    -> shared track, seat-relative
 *   51 .. 55   -> private home lane
 *   56 (HOME)  -> finished, resting in the centre
 */

import type { PlayerColor } from './types';
import { SAFE_TRACK_INDICES, SEATS, TRACK_LENGTH } from './types';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export const BOARD_UNITS = 15;

/** The 52 shared-track squares, in traversal order (counter-clockwise). */
export const TRACK: readonly Cell[] = [
  // left arm, lower row (row 6) travelling right, around the inner elbow
  { x: 1, y: 6 },
  { x: 2, y: 6 },
  { x: 3, y: 6 },
  { x: 4, y: 6 },
  { x: 5, y: 6 },
  { x: 6, y: 5 },
  // up the left edge of the top arm
  { x: 6, y: 4 },
  { x: 6, y: 3 },
  { x: 6, y: 2 },
  { x: 6, y: 1 },
  { x: 6, y: 0 },
  // across the top of the board
  { x: 7, y: 0 },
  { x: 8, y: 0 },
  // down the right edge of the top arm
  { x: 8, y: 1 },
  { x: 8, y: 2 },
  { x: 8, y: 3 },
  { x: 8, y: 4 },
  { x: 8, y: 5 },
  // right arm, upper row travelling right, around the inner elbow
  { x: 9, y: 6 },
  { x: 10, y: 6 },
  { x: 11, y: 6 },
  { x: 12, y: 6 },
  { x: 13, y: 6 },
  { x: 14, y: 6 },
  // round the right-hand tip
  { x: 14, y: 7 },
  { x: 14, y: 8 },
  // right arm, lower row travelling left
  { x: 13, y: 8 },
  { x: 12, y: 8 },
  { x: 11, y: 8 },
  { x: 10, y: 8 },
  { x: 9, y: 8 },
  // down the right edge of the bottom arm
  { x: 8, y: 9 },
  { x: 8, y: 10 },
  { x: 8, y: 11 },
  { x: 8, y: 12 },
  { x: 8, y: 13 },
  { x: 8, y: 14 },
  // across the bottom of the board
  { x: 7, y: 14 },
  { x: 6, y: 14 },
  // up the left edge of the bottom arm
  { x: 6, y: 13 },
  { x: 6, y: 12 },
  { x: 6, y: 11 },
  { x: 6, y: 10 },
  { x: 6, y: 9 },
  // left arm, upper row travelling left, around the inner elbow
  { x: 5, y: 8 },
  { x: 4, y: 8 },
  { x: 3, y: 8 },
  { x: 2, y: 8 },
  { x: 1, y: 8 },
  // round the left-hand tip and back to the start
  { x: 0, y: 8 },
  { x: 0, y: 7 },
  { x: 0, y: 6 },
];

if (TRACK.length !== TRACK_LENGTH) {
  throw new Error(`track must have ${TRACK_LENGTH} squares, found ${TRACK.length}`);
}

/** Private lanes (5 squares each), ordered from the track entrance to the centre. */
export const LANES_FOR_TEST: Record<PlayerColor, Cell[]> = {
  // top-left player: middle row of the left arm, left to right
  red: [
    { x: 1, y: 7 },
    { x: 2, y: 7 },
    { x: 3, y: 7 },
    { x: 4, y: 7 },
    { x: 5, y: 7 },
  ],
  // top-right player: middle column of the top arm, top to bottom
  green: [
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 3 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
  ],
  // bottom-right player: middle row of the right arm, right to left
  yellow: [
    { x: 13, y: 7 },
    { x: 12, y: 7 },
    { x: 11, y: 7 },
    { x: 10, y: 7 },
    { x: 9, y: 7 },
  ],
  // bottom-left player: middle column of the bottom arm, bottom to top
  blue: [
    { x: 7, y: 13 },
    { x: 7, y: 12 },
    { x: 7, y: 11 },
    { x: 7, y: 10 },
    { x: 7, y: 9 },
  ],
};

export interface SeatGeometry {
  readonly color: PlayerColor;
  readonly index: number;
  /** Track index (0..51) of this seat's start square. */
  readonly startOffset: number;
  readonly startCell: Cell;
  /** Track index of the last shared square before the home lane. */
  readonly exitOffset: number;
  readonly exitCell: Cell;
  readonly lane: readonly Cell[];
  readonly yardRect: Rect;
  readonly yardSpots: readonly Vec[];
  readonly centerSide: 'left' | 'top' | 'right' | 'bottom';
}

const YARD_SIZE = 6;

function yardSpots(rectX: number, rectY: number): Vec[] {
  const cx = rectX + YARD_SIZE / 2;
  const cy = rectY + YARD_SIZE / 2;
  const d = 1.2;
  return [
    { x: cx - d, y: cy - d },
    { x: cx + d, y: cy - d },
    { x: cx - d, y: cy + d },
    { x: cx + d, y: cy + d },
  ];
}

const SEAT_START_OFFSETS: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

const SEAT_YARDS: Record<
  PlayerColor,
  { x: number; y: number; side: SeatGeometry['centerSide'] }
> = {
  red: { x: 0, y: 0, side: 'left' },
  green: { x: 9, y: 0, side: 'top' },
  yellow: { x: 9, y: 9, side: 'right' },
  blue: { x: 0, y: 9, side: 'bottom' },
};

export const SEAT_GEOMETRY: readonly SeatGeometry[] = SEATS.map((color, index) => {
  const startOffset = SEAT_START_OFFSETS[color];
  const exitOffset = (startOffset + 50) % TRACK_LENGTH;
  const yard = SEAT_YARDS[color];
  return {
    color,
    index,
    startOffset,
    startCell: TRACK[startOffset],
    exitOffset,
    exitCell: TRACK[exitOffset],
    lane: LANES_FOR_TEST[color],
    yardRect: { x: yard.x, y: yard.y, size: YARD_SIZE },
    yardSpots: yardSpots(yard.x, yard.y),
    centerSide: yard.side,
  };
});

export function seatGeometry(seat: number): SeatGeometry {
  const g = SEAT_GEOMETRY[seat];
  if (!g) throw new Error(`unknown seat ${seat}`);
  return g;
}

/** Absolute track index for a seat-relative progress value (0..50). */
export function trackIndexFor(seat: number, progress: number): number {
  const g = seatGeometry(seat);
  return (g.startOffset + progress) % TRACK_LENGTH;
}

/** True when a seat-relative progress value sits on a star (safe) square. */
export function isSafeProgress(
  seat: number,
  progress: number,
  safeIndices: readonly number[] = SAFE_TRACK_INDICES,
): boolean {
  if (progress < 0 || progress > 50) return false;
  return safeIndices.includes(trackIndexFor(seat, progress));
}

/** Centre of a grid cell in board units. */
export function cellCenter(cell: Cell): Vec {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

/** Board-unit centre of a token at the given progress. */
export function progressCenter(seat: number, progress: number): Vec {
  const g = seatGeometry(seat);
  if (progress < 0) return g.yardSpots[0];
  if (progress <= 50) return cellCenter(TRACK[trackIndexFor(seat, progress)]);
  if (progress < 56) return cellCenter(g.lane[progress - 51]);
  return centerHomeSpot(seat, 0, 1);
}

/** Where a finished token is drawn in the centre triangle. */
export function centerHomeSpot(seat: number, slot: number, total: number): Vec {
  const base = 7.5;
  const spread = 0.38;
  const offset = (slot - (Math.max(total, 1) - 1) / 2) * spread;
  switch (seatGeometry(seat).centerSide) {
    case 'left':
      return { x: base - 0.62 + Math.abs(offset) * 0.4, y: base + offset };
    case 'right':
      return { x: base + 0.62 - Math.abs(offset) * 0.4, y: base + offset };
    case 'top':
      return { x: base + offset, y: base - 0.62 + Math.abs(offset) * 0.4 };
    case 'bottom':
      return { x: base + offset, y: base + 0.62 - Math.abs(offset) * 0.4 };
  }
}

/**
 * The sequence of progress values a token passes through moving from `from`
 * to `to`, used by the renderer to animate hop-by-hop movement.
 */
export function movementPath(from: number, to: number): number[] {
  if (from === to) return [];
  if (from < 0) return [to];
  const path: number[] = [];
  for (let p = from + 1; p <= to; p += 1) path.push(p);
  return path;
}

/** SVG path for the cross-shaped playing field. */
export function crossShapePath(): string {
  return [
    'M 6 0',
    'H 9',
    'V 6',
    'H 15',
    'V 9',
    'H 9',
    'V 15',
    'H 6',
    'V 9',
    'H 0',
    'V 6',
    'H 6',
    'Z',
  ].join(' ');
}

/** Corner radius helper: SVG path for one yard panel with rounded corners. */
export function yardPanelPath(x: number, y: number, size: number, r: number): string {
  const s = size;
  return [
    `M ${x + r} ${y}`,
    `H ${x + s - r}`,
    `A ${r} ${r} 0 0 1 ${x + s} ${y + r}`,
    `V ${y + s - r}`,
    `A ${r} ${r} 0 0 1 ${x + s - r} ${y + s}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + s - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}
