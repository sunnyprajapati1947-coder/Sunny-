// singer.js: the little watercolour singer. One bean-shaped body, a head, two eyes, two arms.
// singer(x, y, s, t, o): (x, y) is the ground point between the feet, s is the unit (whole figure ~ 9s tall).
// o: { col, dy, sq, rot, flip, mouth 0..1, eyes 'dot'|'happy'|'wide'|'closed'|'star', aL, aR, mic, sway,
//      blush, note, silhouette }

function singer(x, y, s, t, o = {}) {
  const col = o.col || PAL.clay, sw = clamp(s / 13, .45, 2.2), J = s * .05;
  const sq = o.sq || 0, sil = o.silhouette;
  const ink = sil ? null : PAL.ink;
  const skin = sil ? PAL.ink : col;

  if (!o.noShadow) paint(ellPts(x, y + s * .12, s * 2.9, s * .6, 18), { fill: PAL.ink, fillOp: 70, bleed: .2, tex: .3, border: .1, ink: null });

  push();
  translate(x, y + (o.dy || 0) * s);
  if (o.rot) rotate(o.rot);
  scale((o.flip ? -1 : 1) * (1 + sq * .4), 1 - sq);

  const sway = (o.sway || 0) * .06;
  rotate(Math.sin(t * TAU * .5) * sway);

  // feet
  for (const side of [-1, 1]) paint(ellPts(side * s * .95, -s * .25, s * .72, s * .38, 14, J), { wash: skin, washOp: 255, ink, sw });
  // body (bean)
  paint(ellPts(0, -s * 2.9, s * 2.15, s * 2.75, 26, J * 1.4), { wash: skin, washOp: 255, fill: sil ? null : PAL.ink, fillOp: 18, bleed: .12, tex: .35, ink, sw: sw * 1.1 });
  // head
  const hy = -s * 6.6;
  paint(ellPts(0, hy, s * 1.95, s * 1.85, 26, J * 1.2), { wash: skin, washOp: 255, ink, sw: sw * 1.1 });
  // hair curl
  inkLine([[s * .1, hy - s * 1.8], [s * .5, hy - s * 2.5], [-s * .25, hy - s * 2.7], [s * .15, hy - s * 2.2]], sw * 1.1, sil ? PAL.ink : PAL.ink, 'ink', .8);

  // arms
  const arm = (side, ang) => {
    const sx = side * s * 1.75, sy = -s * 3.6, L = s * 2.2;
    const ex = sx + side * Math.cos(ang) * L, ey = sy - Math.sin(ang) * L;
    inkLine([[sx, sy], [sx + side * L * .55, sy - Math.sin(ang) * L * .45 + s * .2], [ex, ey]], sw * 2.6, skin, 'ink', .6);
    return [ex, ey];
  };
  const beat = pulse(t, 7);
  const aL = o.aL != null ? o.aL : -.7 + beat * .5, aR = o.aR != null ? o.aR : -.4 + beat * .8;
  const [lx, ly] = arm(-1, aL), [rx, ry] = arm(1, aR);

  if (!sil) {
    // eyes
    const ex = s * .72, ey = hy + s * .1, r = s * .3;
    const style = o.eyes || 'dot';
    for (const side of [-1, 1]) {
      const X = side * ex;
      if (style === 'closed' || style === 'happy') inkLine([[X - r, ey + (style === 'happy' ? r * .5 : 0)], [X, ey - r * (style === 'happy' ? .7 : .1)], [X + r, ey + (style === 'happy' ? r * .5 : 0)]], sw * 1.4, PAL.ink, 'ink', .9);
      else if (style === 'star') paint(starPts(X, ey, r * 1.5, .4, 5), { wash: PAL.ochre, washOp: 255, ink: PAL.ink, sw: sw * .9 });
      else if (style === 'wide') { paint(ellPts(X, ey, r * 1.45, r * 1.6, 16), { wash: PAL.cream, washOp: 255, ink: PAL.ink, sw: sw * .9 }); paint(ellPts(X + (o.lookX || 0) * r, ey + (o.lookY || 0) * r, r * .62, r * .68, 12), { wash: PAL.ink, washOp: 255, ink: null }); }
      else paint(ellPts(X, ey, r, r * 1.1, 14), { wash: PAL.ink, washOp: 255, ink: null });
    }
    // blush
    if (o.blush) for (const side of [-1, 1]) paint(ellPts(side * s * 1.35, hy + s * .62, s * .44, s * .26, 12), { fill: PAL.rose, fillOp: 150, bleed: .3, tex: .2, ink: null });
    // mouth: opens with the singing
    const m = clamp(o.mouth ?? 0);
    const my = hy + s * .85;
    if (m > .05) paint(ellPts(0, my + m * s * .18, s * (.3 + m * .34), s * (.12 + m * .52), 16, J * .6), { wash: '#7E3346', washOp: 255, ink: PAL.ink, sw: sw * .9 });
    else inkLine([[-s * .4, my], [0, my + s * .22], [s * .4, my]], sw * 1.3, PAL.ink, 'ink', .9);
  }

  // mic in the right hand
  if (o.mic !== false) {
    push(); translate(rx, ry); rotate(-.5 + Math.sin(t * 3) * .05);
    paint(rrPts(-s * .16, 0, s * .32, s * 1.5, s * .12, J * .5), { wash: PAL.ink, washOp: 255, ink: null });
    paint(ellPts(0, -s * .18, s * .42, s * .42, 16, J * .6), { wash: PAL.steel, washOp: 255, fill: PAL.cream, fillOp: 60, ink: PAL.ink, sw });
    pop();
  }
  pop();

  // floating music notes on the beat
  if (o.note !== false) {
    for (let i = 0; i < 3; i++) {
      const age = frac(t * .6 + i * .33) ;
      const nx = x + s * (1.9 + i * .9) + Math.sin(age * TAU + i) * s * .6, ny = y - s * (8.2 + age * 5.5);
      if (ny > 60) letter(i % 2 ? '♪' : '♫', nx, ny, s * (1.5 + age * .4), i % 2 ? PAL.violet : PAL.teal, { rot: Math.sin(age * 6 + i) * .3, alpha: .85 * (1 - age) });
    }
  }
}
