// scenes.js: the reusable backdrops. Every scene paints the WHOLE frame and must be a pure
// function of t (frames render in parallel and out of order — no state between frames).
// Signature: fn(t, lt, dur, line)   t = song time, lt = time since the scene started,
//                                   dur = how long this scene lasts, line = current lyric or null.
// Add your own: SCENES.myscene = (t, lt, dur, line) => { ... }  then use it in song.js.

const SCENES = {};
const CURTAIN = '#B8323F', CURTAIN_DK = '#7A1C2B';

// ---------- small shared helpers ----------
const cloud = (x, y, s, col = PAL.cream, op = 120) => {
  paint(ellPts(x, y, s * 1.6, s * .75, 20, s * .12), { fill: col, fillOp: op, bleed: .3, tex: .4, ink: null });
  paint(ellPts(x - s * .55, y + s * .12, s * .8, s * .5, 16, s * .1), { fill: col, fillOp: op * .9, bleed: .3, ink: null });
  paint(ellPts(x + s * .6, y + s * .1, s * .7, s * .45, 16, s * .1), { fill: col, fillOp: op * .9, bleed: .3, ink: null });
};
const glow = (x, y, r, col, op = 90) => paint(ellPts(x, y, r, r, 26, r * .12), { fill: col, fillOp: op, bleed: .35, tex: .5, ink: null });

// ============================================================ 1. SUNBURST
SCENES.sunburst = (t, lt, dur, line) => {
  bg(PAL.cream);
  const cx = W / 2, cy = 500, rot = t * .05, n = 16, R = 1600, p = pulse(t, 5);
  for (let i = 0; i < n; i++) {
    const a0 = rot + i / n * TAU, a1 = a0 + TAU / n * .55;
    paint([[cx, cy], [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], [cx + Math.cos((a0 + a1) / 2) * R, cy + Math.sin((a0 + a1) / 2) * R], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]],
      { fill: i % 2 ? PAL.ochre : PAL.clayLt, fillOp: 70 + p * 35, bleed: .2, tex: .45, ink: null });
  }
  glow(cx, cy, 330 + p * 26, PAL.ochre, 150);
  paint(bandPts(880, 26, 1.3, t * .25), { wash: PAL.sap, washOp: 235, fill: PAL.ink, fillOp: 22, bleed: .15, ink: PAL.ink, sw: 1 });
  for (let i = 0; i < 6; i++) { const x = 120 + i * 330 + Math.sin(t * .4 + i) * 20; paint(ellPts(x, 905 + hash(i) * 30, 28, 46, 12, 6), { wash: mixCol(PAL.sap, PAL.ochre, hash(i * 3)), washOp: 220, ink: null }); }
  singer(W / 2, 890, 42, t, { mouth: mouthAt(t), eyes: 'happy', blush: true, sway: 1, dy: -pulse(t, 7) * .22 });
};

// ============================================================ 2. NIGHT
SCENES.night = (t, lt, dur, line) => {
  bg(PAL.night);
  paint(ellPts(W / 2, 300, 1400, 600, 28, 40), { fill: PAL.indigo, fillOp: 120, bleed: .35, tex: .5, ink: null });
  for (let i = 0; i < 44; i++) {
    const x = hash(i * 3.1) * W, y = 40 + hash(i * 7.7) * 600, tw = .45 + .55 * Math.abs(Math.sin(t * 1.8 + i * 1.7));
    const r = (3 + hash(i * 11) * 7) * (.6 + tw * .7);
    paint(ellPts(x, y, r, r, 8), { wash: PAL.cream, washOp: 120 + 110 * tw, ink: null });
  }
  glow(1500, 240, 230, PAL.cream, 60);
  paint(ellPts(1500, 240, 140, 140, 26, 7), { fill: PAL.cream, fillOp: 210, bleed: .18, tex: .35, ink: mixCol(PAL.indigo, PAL.cream, .3), sw: 1.1 });
  paint(bandPts(740, 70, .8, 1.2), { wash: mixCol(PAL.indigo, PAL.violet, .35), washOp: 245, ink: null });
  paint(bandPts(880, 44, 1.4, 3.1), { wash: mixCol(PAL.indigo, PAL.ink, .45), washOp: 252, ink: null });
  singer(W / 2, 905, 40, t, { mouth: mouthAt(t), eyes: 'wide', col: PAL.violet, sway: .7, dy: -pulse(t, 8) * .14, lookY: -.3 });
};

// ============================================================ 3. CITY
SCENES.city = (t, lt, dur, line) => {
  bg(mixCol(PAL.indigo, PAL.violet, .4));
  paint(ellPts(W / 2, 900, 1300, 560, 28, 40), { fill: PAL.rose, fillOp: 95, bleed: .35, tex: .5, ink: null });
  glow(320, 230, 190, PAL.cream, 55);
  paint(ellPts(320, 230, 100, 100, 22, 6), { fill: PAL.cream, fillOp: 200, bleed: .2, ink: null });
  for (let i = 0; i < 7; i++) {
    const bw = 170 + hash(i * 5.5) * 110, x = -40 + i * 282, bh = 280 + hash(i * 2.2) * 400;
    paint(rectPts(x, 940 - bh, bw, bh + 80, 7), { wash: mixCol(PAL.ink, PAL.indigo, .2 + hash(i) * .35), washOp: 250, ink: PAL.ink, sw: .9 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const h1 = hash(i * 31 + r * 7.3 + c * 3.9);
      const on = h1 > .72 ? beatN(t) % 2 === 0 : h1 > .42;
      if (!on) continue;
      const wx = x + bw * (.22 + c * .42), wy = 940 - bh + 70 + r * 120;
      paint(rectPts(wx, wy, bw * .22, 54, 3), { wash: mixCol(PAL.ochre, PAL.cream, .3), washOp: 180 + 70 * pulse(t, 6), ink: null });
    }
  }
  paint(rectPts(-40, 930, W + 80, 200, 8), { wash: mixCol(PAL.ink, PAL.violet, .18), washOp: 253, ink: null });
  singer(W / 2, 950, 38, t, { mouth: mouthAt(t), eyes: 'dot', col: PAL.teal, sway: .9, dy: -pulse(t, 7) * .2 });
};

// ============================================================ 4. RAIN
SCENES.rain = (t, lt, dur, line) => {
  bg(mixCol(PAL.steel, PAL.indigo, .25));
  for (let i = 0; i < 4; i++) cloud(180 + i * 540 + Math.sin(t * .25 + i) * 26, 160 + hash(i) * 70, 150, PAL.cream, 95);
  for (let i = 0; i < 64; i++) {
    const sp = 520 + hash(i * 1.7) * 320, x = hash(i * 2.3) * (W + 200) - 100, y = frac(hash(i * 5.1) + t * sp / 1300) * 1300 - 140;
    inkLine([[x, y], [x - 16, y + 78]], .85, mixCol(PAL.sky, PAL.cream, .45), 'inkfine', 0);
  }
  paint(bandPts(930, 16, 2.1, t * .8), { wash: mixCol(PAL.steel, PAL.ink, .35), washOp: 250, ink: null });
  for (let i = 0; i < 4; i++) {
    const a = frac(t * 1.4 + i * .25), rx = 40 + a * 150;
    paint(ellPts(260 + i * 480, 985, rx, rx * .22, 18), { ink: mixCol(PAL.sky, PAL.cream, .5), sw: 1.1 * (1 - a), br: 'inkfine' });
  }
  // umbrella
  const ux = W / 2, uy = 520 + Math.sin(t * 1.3) * 10;
  const dome = []; for (let i = 0; i <= 14; i++) { const a = Math.PI + i / 14 * Math.PI; dome.push([ux + Math.cos(a) * 300, uy + Math.sin(a) * 190]); }
  for (let i = 14; i >= 0; i--) { const a = Math.PI + i / 14 * Math.PI; dome.push([ux + Math.cos(a) * 300 * .99, uy + Math.sin(a) * 190 * .12 + Math.sin(i * 2.2) * 16]); }
  paint(dome, { wash: PAL.clay, washOp: 250, fill: PAL.ink, fillOp: 25, bleed: .1, ink: PAL.ink, sw: 1.3 });
  inkLine([[ux, uy], [ux, 760]], 1.6, PAL.ink);
  singer(W / 2 + 60, 935, 36, t, { mouth: mouthAt(t), eyes: 'happy', col: PAL.ochre, aL: .9, sway: .5, note: false });
};

// ============================================================ 5. TYPO (kinetic typography)
SCENES.typo = (t, lt, dur, line) => {
  bg(PAL.cream);
  const cols = [PAL.rose, PAL.ochre, PAL.teal, PAL.violet, PAL.clayLt, PAL.sap];
  for (let i = 0; i < 6; i++) {
    const a = hash(i * 3.3) * TAU + t * .07, rr = 420 + hash(i * 9) * 320;
    paint(ellPts(W / 2 + Math.cos(a) * rr * 1.5, 520 + Math.sin(a) * rr * .8, 170 + hash(i) * 190, 140 + hash(i * 2) * 160, 24, 34),
      { fill: cols[i % cols.length], fillOp: 95 + pulse(t, 6) * 30, bleed: .35, tex: .6, ink: null });
  }
  const txt = line ? line[2] : SONG.title, t0 = line ? line[0] : 0;
  const words = txt.split(' ').filter(Boolean);
  const rows = words.length <= 2 ? 1 : words.length <= 5 ? 2 : 3;
  const per = Math.ceil(words.length / rows);
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const row = words.slice(r * per, (r + 1) * per); if (!row.length) continue;
    const chars = row.join(' ').length;
    const size = Math.min(180, Math.max(60, 1580 / Math.max(4, chars * .56)));
    const wsum = row.map(w => w.length * size * .56), total = wsum.reduce((a, b) => a + b, 0) + (row.length - 1) * size * .3;
    let x = W / 2 - total / 2;
    const y = 500 + (r - (rows - 1) / 2) * size * 1.3;
    row.forEach((w, i) => {
      const pop = clamp((t - t0 - idx * .11) * 4.5);
      letter(w, x + wsum[i] / 2, y + Math.sin(t * 3 + idx) * 8, size, cols[idx % cols.length], { pop, rot: (hash(idx * 5) - .5) * .18, stroke: PAL.cream });
      x += wsum[i] + size * .3; idx++;
    });
  }
  singer(230, 1000, 24, t, { mouth: mouthAt(t), eyes: 'star', col: PAL.clay, sway: 1.4, dy: -pulse(t, 6) * .4, note: false, mic: false });
};

// ============================================================ 6. WAVES
SCENES.waves = (t, lt, dur, line) => {
  bg(mixCol(PAL.sky, PAL.cream, .3));
  glow(1480, 250, 300, PAL.ochre, 70);
  paint(ellPts(1480, 250, 160, 160, 26, 8), { fill: PAL.ochre, fillOp: 200, bleed: .22, tex: .4, ink: null });
  for (let i = 0; i < 3; i++) cloud(260 + i * 460 + Math.sin(t * .18 + i * 2) * 40, 190 + hash(i * 4) * 60, 110, PAL.cream, 130);
  for (let i = 0; i < 5; i++) {
    const y = 600 + i * 108, ph = t * (.5 + i * .22) * 1.6;
    paint(bandPts(y, 20 + i * 6, 1.1 + i * .35, ph, y + 170), { wash: mixCol(PAL.teal, PAL.indigo, i / 7), washOp: 238, ink: null });
  }
  const rock = Math.sin(t * 1.1) * .07, bx = W / 2, by = 820 + Math.sin(t * 1.1 + .4) * 18;
  push(); translate(bx, by); rotate(rock);
  paint([[-240, 0], [240, 0], [180, 90], [-180, 90]], { wash: PAL.clayDk, washOp: 252, fill: PAL.ink, fillOp: 25, ink: PAL.ink, sw: 1.3 });
  inkLine([[0, 0], [0, -230]], 1.6, PAL.ink);
  paint([[10, -225], [160, -60], [10, -60]], { wash: PAL.cream, washOp: 245, fill: PAL.sky, fillOp: 70, bleed: .15, ink: PAL.ink, sw: 1.1 });
  pop();
  singer(bx - 70, by + 10, 30, t, { mouth: mouthAt(t), eyes: 'happy', col: PAL.rose, rot: rock, sway: .4 });
};

// ============================================================ 7. CONFETTI
SCENES.confetti = (t, lt, dur, line) => {
  bg(mixCol(PAL.rose, PAL.cream, .4));
  for (let i = 0; i < 10; i++) {
    const x = -100 + i * 230 + Math.sin(t * .3 + i) * 18;
    paint([[x, -60], [x + 90, -60], [x + 150, H + 60], [x + 60, H + 60]], { fill: i % 2 ? PAL.ochre : PAL.clayLt, fillOp: 55, bleed: .2, ink: null });
  }
  const cols = [PAL.ochre, PAL.teal, PAL.violet, PAL.clay, PAL.sap, PAL.cream];
  const b0 = beatN(t);
  for (let b = b0 - 3; b <= b0; b++) {
    const age = t - (OFF + b * BEAT); if (age < 0 || age > 2.4) continue;
    for (let i = 0; i < 9; i++) {
      const side = i % 2, h1 = hash(b * 17.3 + i * 3.7), h2 = hash(b * 5.1 + i * 9.4);
      const x0 = side ? W - 130 : 130, dir = side ? -1 : 1;
      const a = lerp(.45, 1.35, h1), v = 780 + h2 * 520;
      const x = x0 + dir * Math.cos(a) * v * age, y = 1010 - Math.sin(a) * v * age + 820 * age * age;
      if (y > H + 80) continue;
      push(); translate(x, y); rotate(age * (4 + h1 * 6) * (side ? -1 : 1));
      paint(rectPts(-16, -9, 32, 18, 3), { wash: cols[(b + i) % cols.length], washOp: 245, ink: null });
      pop();
    }
  }
  paint(bandPts(950, 14, 1.8, 0), { wash: PAL.clayDk, washOp: 248, ink: null });
  singer(W / 2, 960, 40, t, { mouth: mouthAt(t), eyes: 'star', blush: true, sway: 1.2, dy: -pulse(t, 4) * .75, aL: .9, aR: 1.1 });
};

// ============================================================ 8. SPOTLIGHT
SCENES.spotlight = (t, lt, dur, line) => {
  bg(mixCol(PAL.ink, PAL.violet, .22));
  const sx = Math.sin(t * .35) * 120;
  paint([[W / 2 - 110 + sx * .3, -60], [W / 2 + 110 + sx * .3, -60], [W / 2 + 540 + sx, 1000], [W / 2 - 540 + sx, 1000]],
    { fill: PAL.cream, fillOp: 60 + pulse(t, 7) * 25, bleed: .3, tex: .3, ink: null });
  paint(ellPts(W / 2 + sx, 950, 430, 95, 26, 16), { fill: PAL.ochre, fillOp: 110, bleed: .35, ink: null });
  // curtains
  for (const side of [0, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = side ? W - 60 - i * 95 : 60 + i * 95, w2 = 110;
      const pts = [];
      for (let k = 0; k <= 8; k++) pts.push([x - w2 / 2 + Math.sin(k * .9 + i) * 14, -40 + k * 140]);
      for (let k = 8; k >= 0; k--) pts.push([x + w2 / 2 + Math.sin(k * .7 + i * 2) * 14, -40 + k * 140]);
      paint(pts, { wash: i % 2 ? CURTAIN : CURTAIN_DK, washOp: 250, fill: PAL.ink, fillOp: 30, bleed: .1, ink: null });
    }
  }
  paint(bandPts(-20, 36, 5, 0, 150), { wash: CURTAIN_DK, washOp: 252, ink: null });
  paint(rectPts(-40, 980, W + 80, 160, 8), { wash: PAL.clayDk, washOp: 250, ink: null });
  // mic stand
  inkLine([[W / 2 + 150, 980], [W / 2 + 150, 640]], 2, PAL.ink);
  paint(ellPts(W / 2 + 150, 620, 34, 40, 14, 5), { wash: PAL.steel, washOp: 250, ink: PAL.ink, sw: 1.1 });
  singer(W / 2 + sx * .2, 975, 42, t, { mouth: mouthAt(t), eyes: 'closed', col: PAL.clay, sway: .8, dy: -pulse(t, 8) * .12 });
};

