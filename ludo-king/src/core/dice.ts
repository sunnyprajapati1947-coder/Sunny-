/**
 * Dice engine.
 *
 * The rules engine owns the *value* of a roll (seeded, deterministic). This
 * module owns everything an on-screen die needs: a fair roll queue, the number
 * of tumble steps, and the final 3D orientation for each face.
 */

import { rollDie } from './rng';

export interface DiceRoll {
  value: number;
  /** Number of tumble steps the renderer should play before settling. */
  tumbleSteps: number;
  /** Total animation duration in ms (caller may scale by speed setting). */
  durationMs: number;
  /** RNG state after the roll. */
  rngState: number;
}

/** Pip layout for each face, on a 3x3 dot grid. */
export const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Final CSS rotation for a die face, using the standard "+Z is 1" cube mapping.
 * Values are chosen so the requested face points at the viewer.
 */
export const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

export function rollQueue(rngState: number, tumble = 4): DiceRoll {
  const { state, value } = rollDie(rngState);
  const tumbleSteps = tumble + (value % 3);
  return {
    value,
    tumbleSteps,
    durationMs: 620 + tumbleSteps * 55,
    rngState: state,
  };
}

/**
 * A tiny physically-plausible shake curve for the die: quick, with a slight
 * overshoot, expressed as normalised 0..1 progress samples.
 */
export function shakeOffsets(steps: number): Array<{ dx: number; dy: number; rot: number }> {
  const out: Array<{ dx: number; dy: number; rot: number }> = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 1) / steps;
    const decay = 1 - t;
    out.push({
      dx: Math.sin(t * Math.PI * 5.5) * 16 * decay,
      dy: -Math.abs(Math.sin(t * Math.PI * 4.2)) * 20 * decay,
      rot: Math.sin(t * Math.PI * 6.3) * 26 * decay,
    });
  }
  return out;
}
