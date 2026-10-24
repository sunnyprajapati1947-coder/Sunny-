// ─── Ludo engine (clean-room, public-domain Ludo rules) ─────────────────────
export const COLORS = ['red', 'green', 'yellow', 'blue'];

export const META = {
  red:    { label: 'Red',    emoji: '🔴', start: 0,  homeCol: [[7,1],[7,2],[7,3],[7,4],[7,5]], base: [[1,1],[1,4],[4,1],[4,4]], center: [7,6] },
  green:  { label: 'Green',  emoji: '🟢', start: 13, homeCol: [[1,7],[2,7],[3,7],[4,7],[5,7]], base: [[1,10],[1,13],[4,10],[4,13]], center: [6,7] },
  yellow: { label: 'Yellow', emoji: '🟡', start: 26, homeCol: [[7,13],[7,12],[7,11],[7,10],[7,9]], base: [[10,10],[10,13],[13,10],[13,13]], center: [7,8] },
  blue:   { label: 'Blue',   emoji: '🔵', start: 39, homeCol: [[13,7],[12,7],[11,7],[10,7],[9,7]], base: [[10,1],[10,4],[13,1],[13,4]], center: [8,7] },
};

// 52-square main track, clockwise (row, col) on a 15×15 board
export const PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0],
];

export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // starts + ★ squares

export function coordOf(color, progress, tokenIdx = 0) {
  if (progress === -1) return META[color].base[tokenIdx];
  if (progress >= 0 && progress <= 50) return PATH[(META[color].start + progress) % 52];
  if (progress >= 51 && progress <= 55) return META[color].homeCol[progress - 51];
  return META[color].center; // 56 = finished
}

export function globalIndex(color, progress) {
  if (progress < 0 || progress > 50) return -1;
  return (META[color].start + progress) % 52;
}

// returns indices of tokens that can move
export function movableIndices(tokens, dice) {
  const out = [];
  tokens.forEach((p, i) => {
    if (p === -1) { if (dice === 6) out.push(i); }
    else if (p < 56 && p + dice <= 56) out.push(i);
  });
  return out;
}

// Apply a move on a cloned state. state: { red:[p×4], ... }
// Returns { state, captured:[{color,idx}], finishedToken, landedSafe }
export function applyMove(state, color, tokenIdx, dice) {
  const next = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, [...v]]));
  const from = next[color][tokenIdx];
  const to = from === -1 ? 0 : from + dice;
  next[color][tokenIdx] = to;
  const captured = [];
  if (to >= 0 && to <= 50) {
    const g = globalIndex(color, to);
    if (!SAFE.has(g)) {
      for (const opp of COLORS) {
        if (opp === color) continue;
        next[opp].forEach((p, i) => {
          if (p >= 0 && p <= 50 && globalIndex(opp, p) === g) {
            next[opp][i] = -1;
            captured.push({ color: opp, idx: i });
          }
        });
      }
    }
  }
  return { state: next, captured, finishedToken: to === 56, to };
}

// Simple but decent AI: score every legal move, pick the best
export function chooseAiMove(state, color, dice) {
  const options = movableIndices(state[color], dice);
  if (!options.length) return -1;
  let best = options[0], bestScore = -Infinity;
  for (const idx of options) {
    const p = state[color][idx];
    const { state: after, captured, finishedToken } = applyMove(state, color, idx, dice);
    const to = after[color][idx];
    let score = Math.random() * 2 + to; // prefer advancing furthest token a bit
    if (p === -1) score += 60;                 // bring a token out
    if (captured.length) score += 80 * captured.length; // capture!
    if (finishedToken) score += 70;           // finish a token
    if (to >= 51) score += 40;                 // enter home column (safe)
    const g = globalIndex(color, to);
    if (g >= 0 && SAFE.has(g)) score += 30;    // land on ★ safe
    // avoid leaving a safe square
    const gFrom = globalIndex(color, p);
    if (gFrom >= 0 && SAFE.has(gFrom)) score -= 12;
    // danger: opponent behind within 6 on the main track
    if (g >= 0 && !SAFE.has(g)) {
      for (const opp of COLORS) {
        if (opp === color) continue;
        state[opp].forEach((op) => {
          const og = globalIndex(opp, op);
          if (og >= 0) { const dist = (g - og + 52) % 52; if (dist >= 1 && dist <= 6) score -= 25; }
        });
      }
    }
    if (score > bestScore) { bestScore = score; best = idx; }
  }
  return best;
}

export const DICE_PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
