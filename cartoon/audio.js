/* ==========================================================================
   Procedural score + SFX for the cartoon. Pure Node, writes 16-bit WAVs.
   Cheerful preschool-cartoon feel: glockenspiel melody, plucky bass,
   shakers, and comedic stabs. Section-colour follows the 9 scenes.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./cartoon.js');

const TAU = Math.PI * 2;
const SR = 44100;
const DUR = C.TOTAL + 1.5;
const N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const SL = new Float32Array(N), SRr = new Float32Array(N);  // sfx bus

const hash = n => { const x = Math.sin(n * 91.7 + 47.3) * 24634.6345; return x - Math.floor(x); };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function add(buf, i, v) { if (i >= 0 && i < N) buf[i] += v; }

/* ------------------------------ instruments ------------------------------ */
function glock(t0, midi, dur, vel, pan = 0) {
  const f = mtof(midi), s = Math.floor(t0 * SR);
  const len = Math.floor(SR * dur);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 5.5) * (1 - Math.exp(-tt * 400));
    const v = (Math.sin(TAU * f * tt) + .35 * Math.sin(TAU * f * 2.76 * tt) * Math.exp(-tt * 9)) * env * vel;
    add(L, s + i, v * (1 - pan * .5)); add(R, s + i, v * (.5 + pan * .5));
  }
}
function pluck(t0, midi, dur, vel, pan = 0) {
  const f = mtof(midi), s = Math.floor(t0 * SR);
  const len = Math.floor(SR * dur);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 7);
    const v = (Math.sin(TAU * f * tt) + .3 * Math.sin(TAU * f * 2 * tt) + .12 * Math.sin(TAU * f * 3 * tt)) * env * vel;
    add(L, s + i, v * (1 - pan * .5)); add(R, s + i, v * (.5 + pan * .5));
  }
}
function bass(t0, midi, dur, vel) {
  const f = mtof(midi), s = Math.floor(t0 * SR);
  const len = Math.floor(SR * dur);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt * 60) * Math.exp(-tt * 2.2);
    const v = (Math.sin(TAU * f * tt) + .2 * Math.sin(TAU * f * 2 * tt)) * env * vel;
    add(L, s + i, v); add(R, s + i, v);
  }
}
function shaker(t0, vel) {
  const s = Math.floor(t0 * SR), len = Math.floor(SR * .12);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 40);
    const v = (hash(i + t0 * 997) * 2 - 1) * env * vel;
    add(L, s + i, v * .8); add(R, s + i, v * .8);
  }
}
function pad(t0, midi, dur, vel) {
  const f = mtof(midi), s = Math.floor(t0 * SR), len = Math.floor(SR * dur);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt * 3) * Math.min(1, (dur - tt) * 3);
    const v = (Math.sin(TAU * f * tt) + .5 * Math.sin(TAU * f * 1.005 * tt) + .3 * Math.sin(TAU * f * 2 * tt)) * env * vel * .5;
    add(L, s + i, v); add(R, s + i, v);
  }
}

/* ---------------------------------- SFX ---------------------------------- */
function sfxNoise(t0, dur, f0, f1, vel) {   // band-swept whoosh
  const s = Math.floor(t0 * SR), len = Math.floor(SR * dur);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR, u = tt / dur;
    const cutoff = (f0 + (f1 - f0) * u) / SR;
    lp += ((hash(i + t0 * 331) * 2 - 1) - lp) * cutoff * 6;
    const env = Math.sin(u * Math.PI);
    const v = lp * env * vel;
    add(SL, s + i, v); add(SRr, s + i, v);
  }
}
function sfxBoing(t0, vel = .5) {
  const s = Math.floor(t0 * SR), len = Math.floor(SR * .4);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const f = 180 + 500 * Math.exp(-tt * 8) * Math.abs(Math.sin(tt * 26));
    const v = Math.sin(TAU * f * tt) * Math.exp(-tt * 7) * vel;
    add(SL, s + i, v); add(SRr, s + i, v);
  }
}
function sfxPop(t0, vel = .9) {
  const s = Math.floor(t0 * SR), len = Math.floor(SR * .35);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const f = 90 * Math.exp(-tt * 14) + 40;
    const v = (Math.sin(TAU * f * tt) * Math.exp(-tt * 12) + (hash(i) * 2 - 1) * Math.exp(-tt * 60)) * vel;
    add(SL, s + i, v); add(SRr, s + i, v);
  }
}
function sfxGliss(t0, vel = .3) {   // magic sparkle run
  for (let i = 0; i < 12; i++) glockToSfx(t0 + i * .06, 84 + i * 2, .5, vel);
}
function glockToSfx(t0, midi, dur, vel) {
  const f = mtof(midi), s = Math.floor(t0 * SR), len = Math.floor(SR * dur);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const v = (Math.sin(TAU * f * tt) + .3 * Math.sin(TAU * f * 2.76 * tt)) * Math.exp(-tt * 6) * vel;
    add(SL, s + i, v); add(SRr, s + i, v);
  }
}
function sfxThud(t0, vel = .7) {
  const s = Math.floor(t0 * SR), len = Math.floor(SR * .3);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const v = Math.sin(TAU * 60 * tt) * Math.exp(-tt * 16) * vel;
    add(SL, s + i, v); add(SRr, s + i, v);
  }
}

/* ------------------------------ composition ------------------------------ */
const BPM = 116, BEAT = 60 / BPM, EIGHTH = BEAT / 2;
// per-scene feel
const FEEL = [
  { chords: [60, 65, 67, 60], mel: 1, dens: .8, glock: 1, pad: 1 },   // title
  { chords: [60, 67, 65, 60], mel: 1, dens: .9, glock: 1, pad: 0 },   // wake
  { chords: [57, 60, 62, 57], mel: .6, dens: .5, glock: 1, pad: 1 },  // discover (curious)
  { chords: [48, 48, 53, 48], mel: .5, dens: .7, glock: 0, pad: 0 },  // struggle (comedy low)
  { chords: [60, 65, 67, 62], mel: 1, dens: .9, glock: 1, pad: 0 },   // call
  { chords: [60, 62, 65, 67], mel: 1, dens: 1, glock: 1, pad: 0 },    // team (driving)
  { chords: [67, 65, 60, 60], mel: 1, dens: 1, glock: 1, pad: 0 },    // pop
  { chords: [60, 69, 65, 62], mel: .7, dens: .6, glock: 1, pad: 1 },  // magic (dreamy)
  { chords: [60, 65, 57, 60], mel: .8, dens: .6, glock: 1, pad: 1 },  // share (warm)
];
const PENTA = [0, 2, 4, 7, 9];

C.SCENES.forEach((sc, si) => {
  const f = FEEL[si];
  const t0 = C.STARTS[si], t1 = t0 + sc.dur;
  const bars = Math.ceil(sc.dur / (BEAT * 4));
  for (let b = 0; b < bars; b++) {
    const bt = t0 + b * BEAT * 4;
    if (bt > t1) break;
    const root = f.chords[b % f.chords.length];
    // bass on 1 and 3
    bass(bt, root - 24, BEAT * 1.8, .34);
    bass(bt + BEAT * 2, root - 24, BEAT * 1.4, .26);
    if (f.pad) pad(bt, root, BEAT * 4, .10);
    // shakers on eighths (light)
    for (let e = 0; e < 8; e++) if (f.dens > .6) shaker(bt + e * EIGHTH, e % 2 ? .05 : .09);
    // melody: seeded pentatonic walk
    for (let e = 0; e < 8; e++) {
      const mt = bt + e * EIGHTH;
      if (mt > t1 - .1) break;
      const r = hash(si * 100 + b * 8 + e);
      if (r > f.dens) continue;
      const deg = PENTA[Math.floor(hash(si * 7 + b * 3 + e * 5) * 5)];
      const oct = hash(si * 13 + e) > .8 ? 12 : 0;
      const midi = root + 12 + deg + oct;
      if (f.glock) glock(mt, midi + 12, .5, .16, (hash(e) - .5));
      pluck(mt, midi, .4, .20, (hash(e + 3) - .5));
    }
  }
  // scene-specific accents
  if (si === 3) { sfxBoing(t0 + 2.0, .4); sfxBoing(t0 + 4.0, .45); sfxThud(t0 + 5.7, .8); }
  if (si === 5) { [2.6, 5.2, 7.8].forEach(x => sfxThud(t0 + x, .5)); }
  if (si === 6) { sfxPop(t0 + 1.6, 1.0); sfxBoing(t0 + 1.7, .6); }
  if (si === 7) { sfxGliss(t0 + .8, .35); sfxGliss(t0 + 3.2, .28); }
  if (si === 1) { sfxBoing(t0 + 2.4, .4); sfxBoing(t0 + 3.2, .35); }
  sfxNoise(t0, .45, 300, 2600, .35);   // whoosh on every cut
});
// final warm resolve
pad(C.TOTAL - 2.2, 60, 3.2, .16);
glock(C.TOTAL - 2.0, 84, 1.6, .2);
glock(C.TOTAL - 1.5, 88, 1.6, .18);
glock(C.TOTAL - 1.0, 96, 2.2, .2);

/* ------------------------------- WAV writer ------------------------------ */
function writeWav(file, l, r) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  // gentle soft-clip
  const clip = v => Math.tanh(v * 1.15) * .92;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clip(l[i]) * 32767), o); o += 2;
    buf.writeInt16LE(Math.round(clip(r[i]) * 32767), o); o += 2;
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

const a = path.join(__dirname, 'audio');
fs.mkdirSync(a, { recursive: true });
const b1 = writeWav(path.join(a, 'music.wav'), L, R);
const b2 = writeWav(path.join(a, 'sfx.wav'), SL, SRr);
console.log(`music.wav ${(b1 / 1e6).toFixed(1)}MB  sfx.wav ${(b2 / 1e6).toFixed(1)}MB  dur ${DUR.toFixed(1)}s`);
