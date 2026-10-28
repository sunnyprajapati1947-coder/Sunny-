// timeline.js: builds the shot list from SONG.lyrics, paints scene breaks (brush wipes),
// the title card and the karaoke bar.

let SHOTS = [], WIPES = [];
const WIPE_TR = .3;

function buildShots() {
  const rot = SONG.sceneOrder && SONG.sceneOrder.length ? SONG.sceneOrder : Object.keys(SCENES);
  const every = Math.max(1, SONG.sceneEvery || 2);
  SHOTS = []; WIPES = [];
  SONG.lyrics.forEach((L, i) => {
    const name = L[3] || rot[Math.floor(i / every) % rot.length];
    SHOTS.push({ t: L[0], name, line: L });
  });
  if (!SHOTS.length) SHOTS.push({ t: 0, name: rot[0], line: null });
  if (SHOTS[0].t > .05) SHOTS.unshift({ t: 0, name: SHOTS[0].name, line: null });
  // merge consecutive shots that use the same scene, so the scene's own local time keeps running
  const merged = [];
  for (const s of SHOTS) { if (merged.length && merged[merged.length - 1].name === s.name) continue; merged.push(s); }
  SCENE_SHOTS = merged;
  for (let i = 1; i < merged.length; i++) WIPES.push({ t: merged[i].t, idx: i - 1 });
}
let SCENE_SHOTS = [];

const activeLine = t => SONG.lyrics.find(l => t >= l[0] && t < l[1]) || null;
// mouth openness: only moves while a lyric is on screen
const mouthAt = t => activeLine(t) ? .22 + .55 * Math.abs(Math.sin(t * 8.5)) * (.6 + .4 * pulse(t, 4)) : 0;

function drawWorld(t) {
  let i = 0; while (i + 1 < SCENE_SHOTS.length && t >= SCENE_SHOTS[i + 1].t) i++;
  const s = SCENE_SHOTS[i], end = i + 1 < SCENE_SHOTS.length ? SCENE_SHOTS[i + 1].t : DUR;
  const fn = SCENES[s.name] || SCENES[Object.keys(SCENES)[0]];
  fn(t, t - s.t, end - s.t, activeLine(t));
  CAM = null;
  flushLetters();
  titleCard(t);
  flushLetters();
  for (const w of WIPES) if (Math.abs(t - w.t) < WIPE_TR) wipe((t - (w.t - WIPE_TR)) / (2 * WIPE_TR), w.idx);
  karaoke(t);
}

// ---------- title card ----------
function titleCard(t) {
  const first = SONG.lyrics.length ? SONG.lyrics[0][0] : 4;
  if (t > first - .1) return;
  const k = backOut(seg(t, .25, 1.1)) * (1 - ease(seg(t, first - .9, first - .15)));
  if (k < .02) return;
  letter(SONG.title, W / 2, H / 2 - 40, 150 * k, PAL.cream, { rot: -.025, stroke: PAL.ink, pop: null, alpha: 1 });
  if (SONG.subtitle) letter(SONG.subtitle, W / 2, H / 2 + 90, 54 * k, PAL.ochre, { rot: .01 });
}

// ---------- brush wipe between scenes ----------
const WIPE_COLS = [[PAL.clayDk, PAL.clay], [PAL.indigo, PAL.violet], [PAL.teal, PAL.sap], [PAL.violet, PAL.rose], [PAL.ochre, PAL.clay]];
function wipe(p, idx) {
  const [c1, c2] = WIPE_COLS[idx % WIPE_COLS.length], n = 5, bh = (H + 420) / n + 40;
  push(); translate(W / 2, H / 2); rotate(-.1); translate(-W / 2, -H / 2);
  for (let i = 0; i < n; i++) {
    const y0 = -230 + i * (H + 420) / n, d = [0, .14, .06, .18, .1][i];
    const q = p < .5 ? easeOut(clamp((p * 2 - d) / (1 - d))) : ease(clamp(((p - .5) * 2 - d) / (1 - d)));
    const x0 = p < .5 ? -300 : lerp(-300, W + 400, q), x1 = p < .5 ? lerp(-300, W + 400, q) : W + 400;
    if (x1 - x0 < 30) continue;
    const pts = [], rag = (k, side) => side * (40 + 50 * hash(i * 31 + k)) + jit(12);
    for (let k = 0; k <= 8; k++) pts.push([lerp(x0, x1, k / 8), y0 + Math.sin(k * .9 + i) * 14 + jit(5)]);
    for (let k = 1; k < 9; k++) pts.push([x1 + rag(k, 1) - 40, y0 + bh * k / 9]);
    for (let k = 8; k >= 0; k--) pts.push([lerp(x0, x1, k / 8), y0 + bh + Math.sin(k * .8 + i * 2) * 14 + jit(5)]);
    if (p >= .5) for (let k = 8; k > 0; k--) pts.push([x0 - rag(k + 20, 1) + 40, y0 + bh * k / 9]);
    paint(pts, { wash: i % 2 ? c1 : c2, washOp: 255, fill: i % 2 ? c2 : c1, fillOp: 70, bleed: .05, tex: .8, border: .6, ink: null });
  }
  pop();
}

// ---------- karaoke ----------
function karaoke(t) {
  const L = activeLine(t); if (!L) return;
  const [a, b, txt] = L;
  outX.font = FONT_KARAOKE;
  const raw = outX.measureText(txt).width, size = Math.round(50 * Math.min(1, 1560 / Math.max(1, raw)));
  const tw = raw * size / 50;
  const grow = easeOut((t - a) / .18) * (1 - ease((t - (b - .12)) / .12));
  if (grow < .02) return;
  const w = (tw + 110) * grow, x0 = W / 2 - w / 2, y0 = 978;
  const pts = [[x0 + jit(8), y0 + jit(4)], [x0 + w / 2, y0 - 4 + jit(4)], [x0 + w + jit(8), y0 + jit(4)], [x0 + w + 14 + jit(8), y0 + 44],
               [x0 + w + jit(8), y0 + 88 + jit(4)], [x0 + w / 2, y0 + 92 + jit(4)], [x0 + jit(8), y0 + 88 + jit(4)], [x0 - 14 + jit(8), y0 + 44]];
  paint(pts, { wash: PAL.ink, washOp: 225, fill: PAL.violet, fillOp: 60, tex: .7, border: .4, ink: null });
  KARAOKE = { a, b, txt, grow, size };
}
function drawKaraokeText(c) {
  if (!KARAOKE || KARAOKE.grow < .85) return;
  const { a, b, txt, size } = KARAOKE, t = T;
  c.save();
  c.font = FONT_KARAOKE.replace('50px', size + 'px'); c.textBaseline = 'middle'; c.textAlign = 'left';
  const words = txt.split(' '), sp = c.measureText(' ').width, ws = words.map(w => c.measureText(w).width);
  const total = ws.reduce((p, q) => p + q, 0) + sp * (words.length - 1);
  const singDur = Math.min(b - a - .1, .45 + txt.length * .075), sung = clamp((t - a) / singDur) * txt.replace(/ /g, '').length;
  let x = W / 2 - total / 2, done = 0; const y = 1022;
  words.forEach((w, i) => {
    const f = clamp((sung - done) / Math.max(1, w.length)); done += w.length;
    c.fillStyle = PAL.cream; c.fillText(w, x, y);
    if (f > 0) { c.save(); c.beginPath(); c.rect(x - 2, y - size, ws[i] * f + 2, size * 2); c.clip(); c.fillStyle = PAL.ochre; c.fillText(w, x, y); c.restore(); }
    x += ws[i] + sp;
  });
  c.restore();
}
