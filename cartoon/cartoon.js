/* ==========================================================================
   CHINKU AUR JAADUI GAAJAR  —  a procedural cartoon for kids
   Every frame drawn on Canvas2D. No images, no video assets.
   Works under Node (@napi-rs/canvas) for MP4 rendering.

   Design space: 1920x1080. Horizon ~ y=600. Ground y=600..1080.
   ========================================================================== */
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CARTOON = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

const W = 1920, H = 1080;
const TAU = Math.PI * 2;
const HORIZON = 600;

/* ------------------------------ tiny math -------------------------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const c01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const span = (a, b, v) => c01((v - a) / ((b - a) || 1e-6));
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIn = t => t * t * t;
const eInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.5 * Math.pow(t - 1, 2);
const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
// a bump peaking at `at` with half-width `w`
const pulse = (t, at, w) => 1 - c01(Math.abs(t - at) / w);
// deterministic hash random (pure function of seed -> stable across frames)
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* --------------------------------- fonts --------------------------------- */
const IS_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
let DEV = 'Dev';   // registered in node; browser falls back
function registerFonts() {
  if (!IS_NODE) return;
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, 'node_modules/@fontsource/noto-sans-devanagari/files');
  const base = path.join(dir, 'noto-sans-devanagari-devanagari-');
  for (const w of ['700', '800', '400', '500']) {
    const f = base + w + '-normal.woff';
    try { if (fs.existsSync(f)) { require('@napi-rs/canvas').GlobalFonts.registerFromPath(f, 'Dev'); } } catch (e) {}
  }
}
const F = (w, px) => `${w} ${px}px ${IS_NODE ? 'Dev' : "'Noto Sans Devanagari','Mangal',sans-serif"}`;
const FL = (w, px) => `${w} ${px}px ${IS_NODE ? 'DejaVu Sans' : "Arial,'Helvetica Neue',sans-serif"}`;

/* -------------------------------- palette -------------------------------- */
const INK = '#3a241c';
const SKY = {
  morning: ['#8fd6ff', '#cdefff', '#fff3c9'],
  golden:  ['#ffd98a', '#ffb85c', '#ffe9b0'],
  magic:   ['#b58cff', '#ff9ad5', '#ffd9f0'],
  sunset:  ['#ff9a5c', '#ffcf7a', '#ffe9c2'],
  night:   ['#3b2d6e', '#5b4a9e', '#8a7ad0'],
};
const GRASS = { morning: ['#7ec850', '#5aa83c'], golden: ['#a8c94e', '#7fa53a'], magic: ['#8fd05c', '#63ab41'], sunset: ['#8fb04a', '#6d8a38'] };

/* --------------------------- drawing primitives --------------------------- */
function ol(g, w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; }
function circle(g, x, y, r, fill, stroke = true) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); if (stroke) g.stroke(); }
function ell(g, x, y, rx, ry, fill, rot = 0, stroke = true) {
  g.save(); g.translate(x, y); if (rot) g.rotate(rot);
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fillStyle = fill; g.fill(); if (stroke) g.stroke(); g.restore();
}
function rr(g, x, y, w, h, r, fill, stroke = true) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  g.fillStyle = fill; g.fill(); if (stroke) g.stroke();
}
function eye(g, x, y, r, look, blink) {
  look = look || { x: 0, y: 0 }; blink = blink || 0;
  const open = 1 - blink;
  g.save();
  g.beginPath(); g.ellipse(x, y, r, Math.max(0.6, r * 1.18 * open), 0, 0, TAU);
  g.fillStyle = '#fff'; g.fill(); g.stroke();
  if (open > 0.28) {
    g.beginPath(); g.arc(x + look.x * r * .34, y + look.y * r * .34, r * .52, 0, TAU);
    g.fillStyle = '#2a1c16'; g.fill();
    g.beginPath(); g.arc(x + look.x * r * .34 - r * .16, y + look.y * r * .34 - r * .2, r * .17, 0, TAU);
    g.fillStyle = '#fff'; g.fill();
  }
  g.restore();
}
function cheek(g, x, y, r) { g.save(); g.globalAlpha *= .45; circle(g, x, y, r, '#ff9db0', false); g.restore(); }
function smile(g, x, y, r, open) {
  g.beginPath();
  if (open > .5) { g.ellipse(x, y, r, r * .8, 0, 0, TAU); g.fillStyle = '#7a3040'; g.fill(); g.stroke();
    g.beginPath(); g.ellipse(x, y + r * .3, r * .6, r * .4, 0, 0, TAU); g.fillStyle = '#ff7d90'; g.fill(); }
  else { g.arc(x, y - r * .3, r, .15 * Math.PI, .85 * Math.PI); g.stroke(); }
}
function star(g, x, y, r, fill, rot = 0, points = 4) {
  g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr2 = i % 2 ? r * .38 : r, a = i / (points * 2) * TAU;
    i ? g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : g.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
  }
  g.closePath(); g.fillStyle = fill; g.fill(); g.restore();
}

/* ================================ ENVIRONMENT ============================= */

function sky(g, mood, t) {
  const c = SKY[mood] || SKY.morning;
  const gr = g.createLinearGradient(0, 0, 0, HORIZON + 120);
  gr.addColorStop(0, c[0]); gr.addColorStop(.62, c[1]); gr.addColorStop(1, c[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}

function sun(g, x, y, r, t, mood) {
  g.save();
  // halo
  const hg = g.createRadialGradient(x, y, r * .4, x, y, r * 3.4);
  hg.addColorStop(0, 'rgba(255,236,150,.75)'); hg.addColorStop(1, 'rgba(255,236,150,0)');
  g.fillStyle = hg; g.beginPath(); g.arc(x, y, r * 3.4, 0, TAU); g.fill();
  // rays
  g.save(); g.translate(x, y); g.rotate(t * .12);
  g.fillStyle = '#ffdf6e';
  for (let i = 0; i < 12; i++) {
    g.rotate(TAU / 12);
    g.beginPath();
    g.moveTo(-r * .12, -r * 1.05); g.lineTo(0, -r * (1.34 + .1 * Math.sin(t * 2 + i))); g.lineTo(r * .12, -r * 1.05);
    g.closePath(); g.fill();
  }
  g.restore();
  // disc + face
  ol(g, 6);
  circle(g, x, y, r, '#ffd93b');
  g.save(); g.globalAlpha *= .35; g.beginPath(); g.arc(x, y, r, Math.PI * .15, Math.PI * .85); g.fillStyle = '#ffb63b'; g.fill(); g.restore();
  eye(g, x - r * .34, y - r * .12, r * .13, { x: 0, y: .4 }, 0);
  eye(g, x + r * .34, y - r * .12, r * .13, { x: 0, y: .4 }, 0);
  g.beginPath(); g.arc(x, y + r * .12, r * .42, .18 * Math.PI, .82 * Math.PI); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
  cheek(g, x - r * .58, y + r * .16, r * .16); cheek(g, x + r * .58, y + r * .16, r * .16);
  g.restore();
}

function cloud(g, x, y, s, t, seed) {
  const puff = Math.sin(t * .8 + seed) * 2;
  g.save(); g.translate(x, y + puff * .3); g.scale(s, s);
  g.beginPath();
  g.moveTo(-72, 16);
  g.quadraticCurveTo(-84, 2, -56, -4);
  g.quadraticCurveTo(-50, -32, -18, -28);
  g.quadraticCurveTo(-6, -50, 22, -36);
  g.quadraticCurveTo(50, -42, 54, -12);
  g.quadraticCurveTo(80, -8, 72, 14);
  g.quadraticCurveTo(58, 26, 38, 22);
  g.quadraticCurveTo(8, 30, -18, 24);
  g.quadraticCurveTo(-48, 30, -72, 16);
  g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.strokeStyle = 'rgba(150,186,224,.55)'; g.lineWidth = 3; g.stroke();
  g.save(); g.clip();
  g.globalAlpha = .16; g.fillStyle = '#8fb8e0';
  g.beginPath(); g.ellipse(-4, 24, 74, 15, 0, 0, TAU); g.fill();
  g.globalAlpha = .5; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(-14, -22, 34, 14, -.2, 0, TAU); g.fill();
  g.restore();
  g.restore();
}

function hills(g, mood, t, scroll = 0) {
  const gr = GRASS[mood] || GRASS.morning;
  // far hills
  g.fillStyle = '#bfe3a8';
  g.beginPath(); g.moveTo(0, HORIZON + 30);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, HORIZON + 10 - Math.sin((x + scroll * .2) * .004) * 46 - Math.sin(x * .0013) * 30);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  // mid hills
  g.fillStyle = gr[0];
  g.beginPath(); g.moveTo(0, HORIZON + 90);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, HORIZON + 70 - Math.sin((x + scroll * .5) * .006 + 2) * 40);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  // near ground
  g.fillStyle = gr[1];
  g.beginPath(); g.moveTo(0, HORIZON + 190);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, HORIZON + 170 - Math.sin((x + scroll) * .008 + 4) * 26);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  // soft highlight on near ground
  g.save(); g.globalAlpha = .12; g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(W * .35, HORIZON + 320, 620, 130, -.05, 0, TAU); g.fill(); g.restore();
}

function tree(g, x, y, s, t, seed) {
  const sway = Math.sin(t * 1.1 + seed) * .03;
  g.save(); g.translate(x, y); g.scale(s, s); ol(g, 6);
  // trunk
  g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-8, -70, -6, -110); g.lineTo(8, -110); g.quadraticCurveTo(10, -70, 16, 0); g.closePath();
  g.fillStyle = '#8a5a34'; g.fill(); g.stroke();
  // canopy
  g.save(); g.translate(0, -150); g.rotate(sway);
  const cols = ['#4f9e3a', '#63b447', '#7cc95a'];
  [[-46, 8, 44], [44, 6, 42], [0, -30, 52], [-8, 22, 46], [30, -18, 38]].forEach(([bx, by, br], i) => {
    circle(g, bx, by, br, cols[i % 3]);
  });
  // fruit
  for (let i = 0; i < 5; i++) { const a = hash(seed + i) * TAU, rr2 = 26 + hash(seed + i + 9) * 30; circle(g, Math.cos(a) * rr2, Math.sin(a) * rr2 * .7 - 6, 7, '#ff6b6b'); }
  g.restore(); g.restore();
}

function bush(g, x, y, s, seed) {
  g.save(); g.translate(x, y); g.scale(s, s); ol(g, 5);
  [[-34, 0, 26], [0, -14, 32], [34, 0, 26]].forEach(([bx, by, br]) => circle(g, bx, by, br, '#5aa83c'));
  g.restore();
}

function grassTuft(g, x, y, s, t, seed) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = '#3f8f2e'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    const sw = Math.sin(t * 2 + seed + i) * 5;
    g.beginPath(); g.moveTo(i * 8, 0); g.quadraticCurveTo(i * 10 + sw, -18, i * 12 + sw * 1.6, -30 - Math.abs(i) * -6);
    g.stroke();
  }
  g.restore();
}

function flower(g, x, y, s, t, seed, bloom = 1, color) {
  const cols = color || ['#ff6b9d', '#ffd93b', '#ff8c42', '#c084fc', '#60c5f8'];
  const c = cols[Math.floor(hash(seed) * cols.length)];
  const open = bloom;
  g.save(); g.translate(x, y); g.scale(s * (0.4 + .6 * open), s * (0.4 + .6 * open));
  g.rotate(Math.sin(t * 1.4 + seed) * .08);
  g.strokeStyle = '#3f8f2e'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(4, 22, 0, 44); g.stroke();
  g.beginPath(); g.ellipse(14, 26, 12, 6, -.5, 0, TAU); g.fillStyle = '#4f9e3a'; g.fill();
  ol(g, 4);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + t * .0;
    ell(g, Math.cos(a) * 15, Math.sin(a) * 15 - 0, 12, 9, c, a);
  }
  circle(g, 0, 0, 9, '#ffd93b');
  g.restore();
}

function butterfly(g, x, y, s, t, seed) {
  const flap = Math.sin(t * 14 + seed);
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(Math.sin(t * 3 + seed) * .2);
  ol(g, 3.5);
  const cols = ['#ff8c42', '#c084fc', '#60c5f8', '#ffd93b'];
  const c = cols[Math.floor(hash(seed) * cols.length)];
  // wings
  g.save(); g.scale(1, .35 + .65 * Math.abs(flap));
  ell(g, -16, -6, 16, 13, c, -.4); ell(g, 16, -6, 16, 13, c, .4);
  ell(g, -11, 12, 11, 9, c, .3); ell(g, 11, 12, 11, 9, c, -.3);
  circle(g, -16, -6, 4, '#fff', false); circle(g, 16, -6, 4, '#fff', false);
  g.restore();
  // body
  g.beginPath(); g.ellipse(0, 2, 4.5, 14, 0, 0, TAU); g.fillStyle = '#4a3428'; g.fill(); g.stroke();
  g.strokeStyle = '#4a3428'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-2, -10); g.quadraticCurveTo(-8, -18, -12, -16); g.moveTo(2, -10); g.quadraticCurveTo(8, -18, 12, -16); g.stroke();
  g.restore();
}

function bird(g, x, y, s, t, seed) {
  const flap = Math.sin(t * 9 + seed);
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = '#4a5a72'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-20, 0); g.quadraticCurveTo(-10, -12 * flap, 0, 0); g.quadraticCurveTo(10, -12 * flap, 20, 0);
  g.stroke(); g.restore();
}

function rainbow(g, k, cx, cy) {
  if (k <= 0) return;
  const cols = ['#ff5252', '#ff9838', '#ffe03b', '#6fd44f', '#42b0ff', '#5a6bff', '#b06bff'];
  g.save(); g.globalAlpha = .85 * c01(k);
  cols.forEach((c, i) => {
    g.strokeStyle = c; g.lineWidth = 26;
    g.beginPath(); g.arc(cx, cy, 640 - i * 27, Math.PI, TAU); g.stroke();
  });
  g.restore();
}

function sparkles(g, t, n, box, seed = 0) {
  for (let i = 0; i < n; i++) {
    const ph = (t * .7 + hash(i + seed) * 3) % 3;
    if (ph > 1.4) continue;
    const a = 1 - Math.abs(ph - .7) / .7;
    const x = box.x + hash(i * 3 + seed) * box.w;
    const y = box.y + hash(i * 7 + seed) * box.h - ph * 60;
    g.save(); g.globalAlpha = a;
    star(g, x, y, 10 + hash(i + 40) * 14, '#fff6c9', t * 2 + i);
    g.restore();
  }
}

/* ================================= CHARACTERS ============================= */
/* All characters drawn around a local origin at their FEET (y=0 = ground). */

function rabbit(g, o) {
  o = o || {};
  const s = o.s || 1;
  g.save(); g.translate(o.x, o.y); if (o.rot) g.rotate(o.rot); g.scale(s * (o.sx || 1), s * (o.sy || 1));
  ol(g, 5);
  const look = o.look || { x: 0, y: 0 };
  const blink = o.blink || 0;
  // tail
  circle(g, -46, -34, 15, '#ffffff');
  // legs / feet
  ell(g, -20, -10, 26, 13, '#f6efe4', o.legL || 0);
  ell(g, 20, -10, 26, 13, '#f6efe4', o.legR || 0);
  // body
  g.beginPath();
  g.moveTo(-40, -46); g.quadraticCurveTo(-54, -12, -26, -4); g.lineTo(26, -4);
  g.quadraticCurveTo(54, -12, 40, -46); g.quadraticCurveTo(0, -62, -40, -46);
  g.fillStyle = '#fdfaf2'; g.fill(); g.stroke();
  g.save(); g.globalAlpha *= .5; g.beginPath(); g.ellipse(0, -22, 24, 20, 0, 0, TAU); g.fillStyle = '#ffe3c9'; g.fill(); g.restore();
  // arms
  const armA = o.arm || 0;
  g.save(); g.translate(-40, -40); g.rotate(-0.5 + armA); ell(g, 0, 16, 10, 20, '#fdfaf2'); g.restore();
  g.save(); g.translate(40, -40); g.rotate(0.5 - (o.armR !== undefined ? o.armR : armA)); ell(g, 0, 16, 10, 20, '#fdfaf2'); g.restore();
  // head
  circle(g, 0, -92, 40, '#fdfaf2');
  // ears
  const ear = (ex, ang, inner) => {
    g.save(); g.translate(ex, -122); g.rotate(ang);
    ell(g, 0, -34, 15, 40, '#fdfaf2');
    g.save(); g.globalAlpha *= .9; ell(g, 0, -32, 8, 30, inner ? '#ffb3c4' : '#ffd0da', 0, false); g.restore();
    g.restore();
  };
  ear(-16, o.earL !== undefined ? o.earL : -0.25);
  ear(16, o.earR !== undefined ? o.earR : 0.25);
  // face
  eye(g, -14, -96, 12, look, blink); eye(g, 14, -96, 12, look, blink);
  // nose + mouth
  g.beginPath(); g.moveTo(-6, -82); g.quadraticCurveTo(0, -76, 6, -82); g.quadraticCurveTo(0, -88, -6, -82); g.fillStyle = '#ff7d90'; g.fill(); g.stroke();
  g.lineWidth = 4;
  smile(g, 0, -72, 12, o.mouth || 0);
  // whiskers
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-24, -84); g.lineTo(-42, -88); g.moveTo(-24, -78); g.lineTo(-43, -78);
  g.moveTo(24, -84); g.lineTo(42, -88); g.moveTo(24, -78); g.lineTo(43, -78);
  g.stroke();
  cheek(g, -28, -78, 9); cheek(g, 28, -78, 9);
  g.restore();
}

function elephant(g, o) {
  o = o || {};
  const s = o.s || 1;
  g.save(); g.translate(o.x, o.y); if (o.rot) g.rotate(o.rot); g.scale(s * (o.sx || 1), s * (o.sy || 1));
  ol(g, 6);
  const look = o.look || { x: 0, y: 0 };
  // back legs
  rr(g, -66, -60, 34, 62, 14, '#9fb6d8');
  rr(g, 34, -60, 34, 62, 14, '#9fb6d8');
  // body
  ell(g, 0, -92, 88, 72, '#aebfe0');
  g.save(); g.globalAlpha *= .4; g.beginPath(); g.ellipse(0, -70, 70, 40, 0, 0, TAU); g.fillStyle = '#cdd9ef'; g.fill(); g.restore();
  // front legs
  rr(g, -52, -56, 34, 58, 14, '#b9c8e6');
  rr(g, 20, -56, 34, 58, 14, '#b9c8e6');
  // toenails
  g.fillStyle = '#f2f6ff';
  [-52, -34, 20, 38].forEach(tx => { g.beginPath(); g.arc(tx + 9, -2, 6, Math.PI, TAU); g.fill(); });
  // tail
  g.strokeStyle = INK; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-84, -100); g.quadraticCurveTo(-104, -86, -98, -60); g.stroke();
  circle(g, -97, -56, 8, '#aebfe0');
  // head
  circle(g, 62, -118, 52, '#b9c8e6');
  // ears
  g.save(); g.translate(30, -128); g.rotate(o.ear !== undefined ? o.ear : -.15 + Math.sin((o.t || 0) * 3) * .1);
  ell(g, -18, 6, 34, 44, '#93a9d4'); g.save(); g.globalAlpha *= .8; ell(g, -20, 8, 20, 28, '#e0b7c9', 0, false); g.restore();
  g.restore();
  // trunk (animated curl)
  const tc = o.trunk !== undefined ? o.trunk : 0;
  g.save(); g.translate(96, -112);
  g.beginPath();
  g.moveTo(-10, -8);
  g.quadraticCurveTo(26, 6, 30 + tc * 10, 44);
  g.quadraticCurveTo(32 + tc * 16, 78, 12 + tc * 26, 92 + tc * 6);
  g.quadraticCurveTo(2 + tc * 22, 96, -2 + tc * 18, 84 + tc * 4);
  g.quadraticCurveTo(10 + tc * 8, 62, 6, 40);
  g.quadraticCurveTo(2, 18, -14, 8);
  g.closePath(); g.fillStyle = '#b9c8e6'; g.fill(); g.stroke();
  g.restore();
  // tusks
  g.save(); g.translate(74, -92); g.rotate(.3); ell(g, 0, 0, 7, 18, '#fdfaf2'); g.restore();
  // eyes
  eye(g, 48, -128, 11, look, o.blink || 0); eye(g, 78, -126, 11, look, o.blink || 0);
  g.lineWidth = 4; smile(g, 62, -104, 12, o.mouth || 0);
  cheek(g, 34, -108, 9); cheek(g, 92, -104, 8);
  g.restore();
}

function parrot(g, o) {
  o = o || {};
  const s = o.s || 1;
  g.save(); g.translate(o.x, o.y); if (o.rot) g.rotate(o.rot); g.scale(s * (o.sx || 1), s * (o.sy || 1));
  ol(g, 4.5);
  const flap = o.wing !== undefined ? o.wing : 0;
  // tail
  g.save(); g.translate(-24, -30); g.rotate(.5);
  ell(g, -20, 0, 26, 9, '#e8543f'); ell(g, -18, -10, 22, 8, '#ffd93b');
  g.restore();
  // body
  ell(g, 0, -34, 30, 38, '#54c05e');
  g.save(); g.globalAlpha *= .5; ell(g, 4, -24, 20, 26, '#8fe08a', 0, false); g.restore();
  // wing
  g.save(); g.translate(-6, -44); g.rotate(-.2 - flap * 1.1);
  ell(g, -12, 10, 20, 26, '#3a9e46');
  ell(g, -14, 16, 10, 14, '#ffd93b', 0, false);
  g.restore();
  // head
  circle(g, 6, -78, 26, '#54c05e');
  // crest
  g.strokeStyle = INK; g.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.moveTo(2 + i * 6, -100); g.quadraticCurveTo(-4 + i * 8, -118 - i * 4, 2 + i * 10, -122 - i * 3); g.stroke();
    circle(g, 2 + i * 10, -122 - i * 3, 5, '#e8543f');
  }
  // eye ring + eye
  circle(g, 14, -82, 11, '#ffd93b');
  eye(g, 15, -82, 8, o.look || { x: 0, y: 0 }, o.blink || 0);
  // beak
  g.beginPath(); g.moveTo(28, -84); g.quadraticCurveTo(48, -80, 44, -66); g.quadraticCurveTo(38, -60, 28, -66); g.closePath();
  g.fillStyle = '#e8543f'; g.fill(); g.stroke();
  g.beginPath(); g.moveTo(30, -66); g.quadraticCurveTo(38, -58, 32, -54); g.strokeStyle = INK; g.lineWidth = 3.5; g.stroke();
  // feet
  g.strokeStyle = '#e8853f'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-6, 2); g.lineTo(-6, 10); g.moveTo(8, 2); g.lineTo(8, 10); g.stroke();
  cheek(g, 0, -70, 6);
  g.restore();
}

function mouse(g, o) {
  o = o || {};
  const s = o.s || 1;
  g.save(); g.translate(o.x, o.y); if (o.rot) g.rotate(o.rot); g.scale(s * (o.sx || 1), s * (o.sy || 1));
  ol(g, 4);
  // tail
  g.strokeStyle = '#c98a92'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-26, -14); g.quadraticCurveTo(-52, -6, -48, -30); g.quadraticCurveTo(-46, -44, -34, -40); g.stroke();
  g.strokeStyle = INK;
  // ears
  circle(g, -16, -46, 15, '#b9b3c4'); g.save(); g.globalAlpha *= .8; circle(g, -16, -45, 8, '#f3b9c4', false); g.restore();
  circle(g, 14, -46, 15, '#b9b3c4'); g.save(); g.globalAlpha *= .8; circle(g, 14, -45, 8, '#f3b9c4', false); g.restore();
  // body
  ell(g, 0, -18, 26, 20, '#c9c3d4');
  g.save(); g.globalAlpha *= .5; ell(g, 2, -12, 16, 12, '#efeaf6', 0, false); g.restore();
  // head merged: face on body front
  eye(g, -8, -24, 8, o.look || { x: 0, y: 0 }, o.blink || 0); eye(g, 10, -24, 8, o.look || { x: 0, y: 0 }, o.blink || 0);
  circle(g, 1, -14, 5, '#ff7d90');
  g.lineWidth = 3; smile(g, 1, -8, 8, o.mouth || 0);
  // whiskers
  g.strokeStyle = INK; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-14, -14); g.lineTo(-28, -16); g.moveTo(16, -14); g.lineTo(30, -16); g.stroke();
  // arms
  g.strokeStyle = INK; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-22, -18); g.lineTo(-30, -10); g.moveTo(22, -18); g.lineTo(30, -10); g.stroke();
  // feet
  ell(g, -12, -2, 11, 6, '#c9c3d4'); ell(g, 12, -2, 11, 6, '#c9c3d4');
  cheek(g, -18, -16, 6); cheek(g, 20, -16, 6);
  g.restore();
}

function magicCarrot(g, x, y, s, t, glow = 1, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  if (glow > 0) {
    const rg = g.createRadialGradient(0, -30, 4, 0, -30, 120 * glow);
    rg.addColorStop(0, `rgba(255,225,120,${.55 * glow})`); rg.addColorStop(1, 'rgba(255,225,120,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, -30, 120 * glow, 0, TAU); g.fill();
  }
  ol(g, 5);
  // leaves
  g.save(); g.translate(0, -74);
  for (let i = -2; i <= 2; i++) {
    g.save(); g.rotate(i * .38 + Math.sin(t * 2 + i) * .05);
    ell(g, 0, -26, 8, 26, '#54c05e');
    g.restore();
  }
  g.restore();
  // body
  g.beginPath();
  g.moveTo(-26, -70); g.quadraticCurveTo(-30, -20, -8, 34); g.quadraticCurveTo(0, 46, 8, 34); g.quadraticCurveTo(30, -20, 26, -70);
  g.quadraticCurveTo(0, -82, -26, -70);
  const bg = g.createLinearGradient(-26, 0, 26, 0);
  bg.addColorStop(0, '#ffb43b'); bg.addColorStop(.5, '#ffd93b'); bg.addColorStop(1, '#ff9a2e');
  g.fillStyle = bg; g.fill(); g.stroke();
  // ridges
  g.strokeStyle = 'rgba(214,120,20,.8)'; g.lineWidth = 4;
  [-48, -24, 0, 20].forEach((yy, i) => {
    g.beginPath(); g.moveTo(-22 + i * 2, yy); g.quadraticCurveTo(0, yy + 8, 22 - i * 2, yy); g.stroke();
  });
  // face (cute)
  g.strokeStyle = INK; g.lineWidth = 4;
  eye(g, -9, -52, 8, { x: 0, y: 0 }, 0); eye(g, 9, -52, 8, { x: 0, y: 0 }, 0);
  smile(g, 0, -38, 9, .8);
  cheek(g, -18, -44, 6); cheek(g, 18, -44, 6);
  g.restore();
}

/* ------------------------------- particles ------------------------------- */
function dustPuff(g, x, y, t, born, seed) {
  const age = t - born;
  if (age < 0 || age > 1.2) return;
  const k = age / 1.2;
  g.save(); g.globalAlpha = (1 - k) * .6;
  for (let i = 0; i < 4; i++) {
    const a = hash(seed + i) * TAU;
    circle(g, x + Math.cos(a) * k * 60, y + Math.sin(a) * k * 30 - k * 20, 14 + k * 22, '#e8dcc8', false);
  }
  g.restore();
}

/* ================================ SCENES ================================== */
/* Each scene: draw(g, t, p). t = seconds into scene, p = progress 0..1.      */

const CAP = [];   // Hindi captions, filled per scene below

function caption(g, str, t, from = .6) {
  const k = span(from, from + .5, t);
  if (k <= 0) return;
  g.save();
  g.globalAlpha = k;
  g.font = F(700, 40);
  const w = g.measureText(str).width + 90;
  const x = W / 2 - w / 2, y = H - 118;
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.strokeStyle = 'rgba(58,36,28,.25)'; g.lineWidth = 3;
  g.beginPath();
  const r = 22;
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + 76, r); g.arcTo(x + w, y + 76, x, y + 76, r);
  g.arcTo(x, y + 76, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#3a241c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(str, W / 2, y + 40);
  g.restore();
}

function meadow(g, mood, t, cam) {
  sky(g, mood, t);
  const sunY = mood === 'sunset' ? 470 : mood === 'magic' ? 150 : 150;
  sun(g, mood === 'sunset' ? 320 : 1600, sunY, 84, t, mood);
  // clouds
  for (let i = 0; i < 5; i++) {
    const cx = ((hash(i) * 2400 + t * (14 + i * 5)) % (W + 500)) - 250;
    cloud(g, cx, 110 + hash(i + 20) * 200, .8 + hash(i + 40) * .7, t, i);
  }
  for (let i = 0; i < 3; i++) bird(g, ((t * 90 + i * 600) % (W + 300)) - 150, 200 + i * 70 + Math.sin(t + i) * 20, 1, t, i);
  hills(g, mood, t, cam || 0);
}

function flowersRow(g, t, y, n, seed, bloom) {
  for (let i = 0; i < n; i++) {
    const x = 90 + i * (W - 180) / (n - 1) + hash(seed + i) * 60;
    flower(g, x, y + hash(seed + i + 5) * 60, .8 + hash(seed + i + 9) * .6, t, seed + i, bloom);
  }
}

/* ---- S1 title ---- */
function scTitle(g, t, p) {
  meadow(g, 'morning', t, 0);
  // trees framing
  tree(g, 180, 860, 1.5, t, 1); tree(g, 1760, 880, 1.3, t, 2);
  bush(g, 420, 900, 1.2, 3); bush(g, 1520, 910, 1.1, 4);
  flowersRow(g, t, 960, 8, 11, c01(t * .5));
  for (let i = 0; i < 4; i++) {
    const bx = 300 + i * 420 + Math.sin(t * .8 + i) * 60;
    butterfly(g, bx, 700 + Math.sin(t * 1.2 + i * 2) * 60, 1.1, t, i + 7);
  }
  // title
  const tk = c01(t / 1.2);
  const title = 'चिंकू और जादुई गाजर';
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const big = 128;
  g.font = F(800, big);
  const tw = g.measureText(title).width;
  // letters bounce in
  let cx = W / 2 - tw / 2;
  for (let i = 0; i < title.length; i++) {
    const ch = title[i];
    const w = g.measureText(ch).width;
    const lk = span(.15 + i * .07, .75 + i * .07, t);
    if (lk > 0) {
      const y = 330 - (1 - bounce(lk)) * 500;
      g.save();
      g.translate(cx + w / 2, y);
      g.rotate(Math.sin(t * 2 + i) * .03);
      g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.lineJoin = 'round';
      g.strokeText(ch, 0, 0);
      g.fillStyle = i % 2 ? '#ff6b3d' : '#e8452e';
      g.fillText(ch, 0, 0);
      g.restore();
    }
    cx += w;
  }
  g.restore();
  // subtitle plaque
  const sk = span(1.6, 2.2, t);
  if (sk > 0) {
    g.save(); g.globalAlpha = sk;
    g.translate(W / 2, 470); g.scale(eBack(sk), eBack(sk));
    g.fillStyle = '#ffd93b'; g.strokeStyle = INK; g.lineWidth = 6;
    g.beginPath();
    const w2 = 560, h2 = 84, r = 20;
    g.moveTo(-w2 / 2 + r, -h2 / 2); g.arcTo(w2 / 2, -h2 / 2, w2 / 2, h2 / 2, r); g.arcTo(w2 / 2, h2 / 2, -w2 / 2, h2 / 2, r);
    g.arcTo(-w2 / 2, h2 / 2, -w2 / 2, -h2 / 2, r); g.arcTo(-w2 / 2, -h2 / 2, w2 / 2, -h2 / 2, r); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#7a3b12'; g.font = F(700, 44); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('बच्चों की प्यारी कहानी', 0, 4);
    g.restore();
  }
  sparkles(g, t, 14, { x: 300, y: 200, w: 1300, h: 400 }, 3);
}

/* ---- S2 wake up ---- */
function scWake(g, t, p) {
  meadow(g, 'morning', t, 0);
  tree(g, 1700, 880, 1.4, t, 2);
  flowersRow(g, t, 950, 7, 21, 1);
  // burrow mound
  g.save(); ol(g, 6);
  g.beginPath(); g.ellipse(520, 900, 240, 130, 0, Math.PI, TAU); g.fillStyle = '#a9784e'; g.fill(); g.stroke();
  g.beginPath(); g.ellipse(520, 880, 120, 90, 0, Math.PI, TAU); g.fillStyle = '#5b3a24'; g.fill(); g.stroke();
  g.restore();
  // chinku pops out
  const pop = span(.8, 1.5, t);
  if (pop > 0) {
    const stretch = Math.sin(c01((t - .8) / .9) * Math.PI);
    const hop = t > 2.2 ? Math.abs(Math.sin((t - 2.2) * 5)) * (t < 4.4 ? 60 * (1 - (t - 2.2) / 2.2) : 0) : 0;
    const x = 520 + (t > 2.2 ? eOut(c01((t - 2.2) / 2.0)) * 460 : 0);
    const y = 880 - eBack(pop) * 40 - hop;
    rabbit(g, {
      x, y, s: 1.5,
      sy: 1 + stretch * .25 - (hop > 4 ? .1 : 0),
      sx: 1 - stretch * .15 + (hop > 4 ? .1 : 0),
      earL: -.3 + Math.sin(t * 6) * .15 - stretch * .3,
      earR: .3 - Math.sin(t * 6) * .15 + stretch * .3,
      arm: t > 1.6 && t < 2.3 ? -1.4 : (t > 4.6 ? -1.6 + Math.sin(t * 8) * .3 : .1),
      blink: (t % 3) > 2.85 ? 1 : 0,
      look: { x: .4, y: -.1 }, mouth: t > 1.4 ? .9 : .3,
      rot: hop > 30 ? .06 : 0,
    });
    if (hop < 6 && t > 2.3 && t < 4.4) dustPuff(g, x, 880, t, Math.floor((t - 2.2) * 5 / Math.PI) * Math.PI / 5 + 2.2, 5);
    // wave hand greeting sparkle
    if (t > 4.6) sparkles(g, t, 5, { x: x + 60, y: y - 160, w: 120, h: 80 }, 9);
  }
  // "!!" of waking
  if (t > 1.4 && t < 2.2) {
    g.save(); g.globalAlpha = span(1.4, 1.6, t) * (1 - span(2.0, 2.2, t));
    star(g, 640, 700, 26, '#ffd93b', t * 3); g.restore();
  }
  caption(g, 'चिंकू खरगोश सुबह उठकर खुश हो गया!', t, 1.2);
}

/* ---- S3 discovery ---- */
function scDiscover(g, t, p) {
  meadow(g, 'morning', t, 0);
  tree(g, 200, 880, 1.3, t, 1);
  flowersRow(g, t, 950, 6, 31, 1);
  // chinku hops in from left and stops
  const stopAt = 2.0;
  const hx = t < stopAt ? eOut(t / stopAt) * 700 + 220 : 920;
  const hop = t < stopAt ? Math.abs(Math.sin(t * 6)) * 50 : 0;
  const lookDown = t > stopAt + .4;
  // the glowing carrot top peeking from ground
  const gk = span(stopAt + .5, stopAt + 1.4, t);
  if (gk > 0) {
    const pulse = 1 + Math.sin(t * 4) * .12;
    // glow hole
    const rg = g.createRadialGradient(1300, 900, 4, 1300, 900, 220 * pulse * gk);
    rg.addColorStop(0, `rgba(255,230,120,${.8 * gk})`); rg.addColorStop(1, 'rgba(255,230,120,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(1300, 900, 220 * pulse * gk, 0, TAU); g.fill();
    // carrot leaves + tip sticking out
    g.save(); g.translate(1300, 905); g.scale(gk, gk);
    ol(g, 5);
    for (let i = -1; i <= 1; i++) { g.save(); g.rotate(i * .3); ell(g, 0, -30, 8, 30, '#54c05e'); g.restore(); }
    g.beginPath(); g.moveTo(-20, -6); g.quadraticCurveTo(0, -22, 20, -6); g.quadraticCurveTo(0, 6, -20, -6); g.fillStyle = '#ffb43b'; g.fill(); g.stroke();
    g.restore();
    sparkles(g, t, 10, { x: 1180, y: 760, w: 240, h: 160 }, 13);
  }
  rabbit(g, {
    x: hx, y: 900 - hop, s: 1.5,
    sy: hop > 30 ? 1.08 : .96, sx: hop > 30 ? .95 : 1.05,
    earL: lookDown ? -.05 : -.3, earR: lookDown ? .05 : .3,
    look: lookDown ? { x: .9, y: .8 } : { x: .6, y: 0 },
    blink: (t % 2.6) > 2.45 ? 1 : 0,
    mouth: lookDown ? .9 : .3,
    arm: lookDown ? -1.2 : .1,
  });
  // surprised "!" + eyes pop
  if (lookDown) {
    const ek = span(stopAt + .7, stopAt + 1.0, t);
    if (ek > 0) {
      g.save(); g.globalAlpha = ek;
      g.font = FL(900, 120); g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 12;
      g.textAlign = 'center';
      g.strokeText('!', hx + 90, 640 - ek * 40); g.fillText('!', hx + 90, 640 - ek * 40);
      g.restore();
    }
  }
  caption(g, 'अरे! ज़मीन में एक चमकती सुनहरी गाजर!', t, 1.4);
}

/* ---- S4 struggle ---- */
function scStruggle(g, t, p) {
  meadow(g, 'morning', t, 0);
  flowersRow(g, t, 960, 6, 41, 1);
  const cx = 1180;
  // planted carrot (only leaves + a bit of shoulder visible)
  g.save(); ol(g, 5);
  g.beginPath(); g.ellipse(cx, 906, 90, 26, 0, 0, TAU); g.fillStyle = '#8a5a34'; g.fill(); g.stroke();
  g.restore();
  magicCarrot(g, cx, 900, 1.0, t, .5, 0);
  // chinku pulling: leans back, feet slide, ears fly
  const heave = Math.sin(t * 4.2);
  const lean = -.32 - heave * .16;
  const slip = t > 3.5 && t < 5.0 ? (t - 3.5) * 30 : 0;
  const fell = t > 5.6;
  let x = cx - 190 - slip - (fell ? 90 : 0);
  let y = 900, rot = lean, sx = 1, sy = 1;
  if (fell) {
    const fk = eOut(c01((t - 5.6) / .5));
    rot = lerp(lean, -1.35, fk); y = lerp(900, 940, fk); x = lerp(x, x - 40, fk);
  }
  rabbit(g, {
    x, y, s: 1.5, rot, sx: 1 + heave * .06, sy: 1 - heave * .06,
    earL: -.6 - heave * .4, earR: .1 - heave * .4,
    arm: -1.5, armR: -1.4,
    look: { x: .8, y: -.3 },
    blink: 0,
    mouth: heave > .5 ? 1 : .3,
    legL: -.4 + heave * .2, legR: .3 - heave * .2,
  });
  // strain marks + sweat
  if (!fell && heave > .3) {
    g.save(); g.globalAlpha = heave;
    star(g, x - 90, y - 200, 20, '#ffd93b', t * 4);
    // sweat drop
    g.beginPath(); g.ellipse(x + 70, y - 190 + Math.sin(t * 6) * 6, 8, 12, .3, 0, TAU); g.fillStyle = '#7fd0ff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    g.restore();
    dustPuff(g, x - 40, 900, t, Math.floor(t * 4.2 / Math.PI) * Math.PI / 4.2, 21);
  }
  // "huff" puff text
  if (!fell && heave > .6) {
    g.save(); g.globalAlpha = (heave - .6) / .4;
    g.font = F(700, 46); g.fillStyle = '#e8452e'; g.textAlign = 'center';
    g.fillText('हईशा!', x - 40, y - 260);
    g.restore();
  }
  // falls: stars circle head
  if (fell) {
    const fk = t - 5.6;
    for (let i = 0; i < 3; i++) {
      const a = fk * 4 + i * TAU / 3;
      star(g, x - 20 + Math.cos(a) * 90, y - 150 + Math.sin(a) * 34, 18, '#ffd93b', a);
    }
    dustPuff(g, x, 940, t, 5.6, 31);
  }
  caption(g, 'चिंकू ने ज़ोर लगाया, पर गाजर नहीं हिली!', t, 1.0);
}

/* ---- S5 call friends ---- */
function scCall(g, t, p) {
  meadow(g, 'morning', t, 0);
  flowersRow(g, t, 960, 6, 51, 1);
  const cx = 520;
  // chinku shouting
  rabbit(g, {
    x: cx, y: 900, s: 1.5, rot: 0,
    earL: -.5, earR: .5,
    arm: -1.7, armR: -1.7,
    mouth: (Math.sin(t * 8) > 0) ? 1 : .6,
    look: { x: .3, y: -.2 },
  });
  // shout rings
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.2 - i * .4) % 1.2;
    if (ph < 0) continue;
    g.save(); g.globalAlpha = (1 - ph / 1.2) * .6;
    g.strokeStyle = '#ffd93b'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx + 40, 760, 60 + ph * 220, -.6, .6); g.stroke();
    g.restore();
  }
  // friends arrive
  const ek = eOut(span(1.6, 3.2, t));
  if (ek > 0) {
    const shake = Math.sin(t * 9) * (t > 1.8 && t < 4 ? 3 : 0);
    elephant(g, { x: 1900 - ek * 620, y: 940 + shake, s: 1.35, trunk: .3 + Math.sin(t * 3) * .2, mouth: .8, look: { x: -.6, y: 0 } });
  }
  const pk = eOut(span(2.2, 3.4, t));
  if (pk > 0) {
    const fly = 1 - pk;
    parrot(g, { x: 1900 - pk * 1010, y: 900 - fly * 380 - Math.sin(t * 10) * 20 * fly, s: 1.3, wing: Math.sin(t * 14) * (fly > .1 ? 1 : .2), mouth: .8 });
  }
  const mk = eOut(span(2.8, 4.0, t));
  if (mk > 0) {
    mouse(g, { x: -100 + mk * 420, y: 950, s: 1.6, mouth: .8, look: { x: .6, y: 0 } });
  }
  // everyone together cheer
  if (t > 5.4) {
    const ck = t - 5.4;
    for (let i = 0; i < 4; i++) star(g, 400 + i * 380, 620 - Math.sin(ck * 3 + i) * 30, 20, i % 2 ? '#ffd93b' : '#ff8c42', ck * 2 + i);
  }
  caption(g, 'चिंकू ने बुलाया — दोस्तों, आओ!', t, 1.0);
}

/* ---- S6 team pull ---- */
function scTeam(g, t, p) {
  meadow(g, 'morning', t, 0);
  flowersRow(g, t, 970, 5, 61, 1);
  const cx = 640;
  // carrot planted
  g.save(); ol(g, 5);
  g.beginPath(); g.ellipse(cx, 906, 96, 28, 0, 0, TAU); g.fillStyle = '#8a5a34'; g.fill(); g.stroke();
  g.restore();
  // heave rhythm: 3 big pulls at ~ "ek do teen"
  const pulls = [2.6, 5.2, 7.8];
  let heave = Math.sin(t * 3.0) * .5;
  pulls.forEach(pt => { heave += pulse(t, pt, .5) * .9; });
  heave = c01(heave);
  const shake = t > 8.6 ? (t - 8.6) * 6 : 0;
  g.save(); g.translate((hash(Math.floor(t * 30)) - .5) * shake, (hash(Math.floor(t * 30) + 7) - .5) * shake);

  // chain from carrot rightwards, all leaning back (rot negative)
  const lean = -.18 - heave * .3;
  magicCarrot(g, cx, 900, 1.0, t, .4, 0);
  // Bholu grabs with trunk
  elephant(g, { x: cx + 250, y: 940, s: 1.3, rot: lean * .6, trunk: -1.1 - heave * .5, mouth: heave > .5 ? 1 : .4, look: { x: -.8, y: .2 }, t });
  // chinku holds Bholu tail
  rabbit(g, { x: cx + 520, y: 930, s: 1.4, rot: lean, arm: -1.4, armR: -1.4, earL: -.5 - heave * .3, earR: .1 - heave * .3, mouth: heave > .5 ? 1 : .4, look: { x: -.7, y: 0 } });
  // mithu holds chinku ears
  parrot(g, { x: cx + 700, y: 900, s: 1.25, rot: lean * 1.2, wing: heave * .6, mouth: heave > .5 ? 1 : .4 });
  // cheeku holds mithu tail
  mouse(g, { x: cx + 830, y: 950, s: 1.5, rot: lean, mouth: heave > .5 ? 1 : .4, look: { x: -.8, y: 0 } });

  // strain fx
  if (heave > .55) {
    g.save(); g.globalAlpha = (heave - .55) / .45;
    dustPuff(g, cx + 200, 930, t, Math.floor(t * 3 / Math.PI) * Math.PI / 3, 41);
    dustPuff(g, cx + 500, 930, t, Math.floor(t * 3 / Math.PI) * Math.PI / 3 + .1, 43);
    star(g, cx + 380, 640, 22, '#ffd93b', t * 5);
    g.restore();
  }
  // count labels
  const counts = [['एक', 2.2], ['दो', 4.8], ['तीन', 7.4]];
  counts.forEach(([txt, at]) => {
    const k = 1 - Math.abs(t - at - .3) / .5;
    if (k <= 0) return;
    g.save(); g.globalAlpha = c01(k);
    g.font = F(800, 90); g.textAlign = 'center';
    g.lineWidth = 14; g.strokeStyle = '#fff'; g.lineJoin = 'round';
    g.strokeText(txt, 960, 300 - (1 - k) * 40);
    g.fillStyle = '#e8452e'; g.fillText(txt, 960, 300 - (1 - k) * 40);
    g.restore();
  });
  g.restore();
  // tension lines around carrot near end
  if (t > 8.6) {
    g.save(); g.globalAlpha = c01((t - 8.6) / 1.2);
    g.strokeStyle = '#ffd93b'; g.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + t;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 60, 880 + Math.sin(a) * 40); g.lineTo(cx + Math.cos(a) * (90 + shake * 6), 880 + Math.sin(a) * (60 + shake * 4)); g.stroke();
    }
    g.restore();
  }
  caption(g, 'सबने मिलकर ज़ोर लगाया — एक, दो, तीन!', t, 1.0);
}

/* ---- S7 pop ---- */
function scPop(g, t, p) {
  meadow(g, 'morning', t, 0);
  flowersRow(g, t, 970, 5, 71, 1);
  const cx = 640;
  const POP = 1.6;
  if (t < POP) {
    // extreme anticipation: everyone squashed low, straining
    const k = t / POP;
    g.save(); ol(g, 5);
    g.beginPath(); g.ellipse(cx, 906, 96, 28, 0, 0, TAU); g.fillStyle = '#8a5a34'; g.fill(); g.stroke();
    g.restore();
    magicCarrot(g, cx, 900, 1.0, t, .6, 0);
    elephant(g, { x: cx + 250, y: 950, s: 1.3, rot: -.42 - k * .1, sy: .92, trunk: -1.4, mouth: 1 });
    rabbit(g, { x: cx + 520, y: 940, s: 1.4, rot: -.46 - k * .1, sy: .92, arm: -1.4, mouth: 1 });
    parrot(g, { x: cx + 700, y: 910, s: 1.25, rot: -.5, sy: .92, wing: .8, mouth: 1 });
    mouse(g, { x: cx + 830, y: 955, s: 1.5, rot: -.46, sy: .92, mouth: 1 });
    // shake
    g.save(); g.globalAlpha = .5;
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 8; g.beginPath(); g.moveTo(cx + Math.cos(a) * 70, 880 + Math.sin(a) * 46); g.lineTo(cx + Math.cos(a) * 110, 880 + Math.sin(a) * 70); g.stroke(); }
    g.restore();
    return;
  }
  const ft = t - POP;
  // white flash
  if (ft < .25) { g.fillStyle = `rgba(255,255,255,${1 - ft / .25})`; g.fillRect(0, 0, W, H); }
  // carrot rockets up spinning with golden trail
  const cy = 880 - eOut(c01(ft / 2.2)) * 900;
  const spin = ft * 6;
  g.save();
  g.globalAlpha = .5;
  for (let i = 1; i < 6; i++) {
    const ty = cy + i * 70;
    if (ty > 1000) continue;
    g.globalAlpha = .4 - i * .06;
    star(g, cx + Math.sin(spin - i) * 20, ty, 26 - i * 3, '#ffd93b', spin - i);
  }
  g.restore();
  magicCarrot(g, cx + Math.sin(ft * 3) * 30, cy, 1.1, t, 1, Math.sin(spin) * .5);
  // friends tumble backwards in arcs
  const tumble = eOut(c01(ft / 1.4));
  const land = c01((ft - 1.4) / .6);
  elephant(g, { x: cx + 250 + tumble * 260, y: 940 - Math.sin(tumble * Math.PI) * 220 + land * 60, s: 1.3, rot: tumble * 2.6, trunk: .8, mouth: 1 });
  rabbit(g, { x: cx + 520 + tumble * 300, y: 930 - Math.sin(tumble * Math.PI) * 300 + land * 80, s: 1.4, rot: tumble * 3.4, earL: -1, earR: 1, mouth: 1 });
  parrot(g, { x: cx + 700 + tumble * 240, y: 900 - Math.sin(tumble * Math.PI) * 380 + land * 120, s: 1.25, rot: tumble * 4.2, wing: 1, mouth: 1 });
  mouse(g, { x: cx + 830 + tumble * 200, y: 950 - Math.sin(tumble * Math.PI) * 260 + land * 90, s: 1.5, rot: tumble * 5, mouth: 1 });
  // dirt + petals burst
  if (ft < 1.6) {
    for (let i = 0; i < 14; i++) {
      const a = hash(i) * TAU, sp = 120 + hash(i + 3) * 260;
      const px = cx + Math.cos(a) * sp * ft, py = 890 + Math.sin(a) * sp * ft * .7 - 100 * ft + 300 * ft * ft;
      if (py > 1000) continue;
      g.save(); g.globalAlpha = 1 - ft / 1.6;
      if (i % 3) circle(g, px, py, 8 + hash(i + 9) * 10, i % 2 ? '#8a5a34' : '#a9784e', false);
      else star(g, px, py, 12, '#ffd93b', ft * 6 + i);
      g.restore();
    }
  }
  // dust on landing
  if (land > 0 && land < 1) { dustPuff(g, cx + 500, 960, t, POP + 1.4, 51); dustPuff(g, cx + 800, 960, t, POP + 1.4, 53); }
  // "POP!" burst text
  if (ft < 1.0) {
    g.save();
    const k = eBack(c01(ft / .4));
    g.translate(cx, 400); g.scale(k, k); g.rotate(-.1);
    g.font = FL(900, 150); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 20; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.strokeText('POP!', 0, 0);
    g.fillStyle = '#ff3b3b'; g.fillText('POP!', 0, 0);
    g.restore();
  }
  caption(g, 'धड़ाम! गाजर निकल गई, सब ढेर हो गए!', t, 2.2);
}

/* ---- S8 magic ---- */
function scMagic(g, t, p) {
  meadow(g, 'magic', t, 0);
  rainbow(g, span(.6, 2.4, t), W / 2, HORIZON + 260);
  tree(g, 150, 880, 1.3, t, 1); tree(g, 1780, 890, 1.2, t, 2);
  // blooming wave of flowers
  const wave = span(1.0, 4.0, t);
  for (let i = 0; i < 12; i++) {
    const x = 80 + i * (W - 160) / 11;
    const bloom = c01(wave * 1.4 - i * .06);
    if (bloom > 0) flower(g, x, 900 + hash(i) * 90, 1.0 + hash(i + 4) * .6, t, 80 + i, bloom);
  }
  // the carrot centre, floating & glowing
  const fy = 640 - Math.sin(t * 1.6) * 26;
  magicCarrot(g, W / 2, fy, 1.6, t, 1.4 + Math.sin(t * 3) * .3, Math.sin(t * .9) * .12);
  // rising sparkles + fireflies
  sparkles(g, t, 26, { x: 200, y: 300, w: 1500, h: 620 }, 17);
  for (let i = 0; i < 8; i++) {
    const bx = 200 + i * 200 + Math.sin(t * .9 + i * 1.7) * 90;
    const by = 760 + Math.cos(t * .7 + i) * 60;
    butterfly(g, bx, by, 1.15, t, i + 60);
  }
  // friends gazing with sparkly eyes, slowly approaching
  const appr = eOut(span(1.2, 3.4, t));
  elephant(g, { x: 300 + appr * 120, y: 950, s: 1.3, trunk: -.6 + Math.sin(t * 2) * .2, look: { x: .8, y: -.6 }, mouth: .8 });
  rabbit(g, { x: 620 + appr * 60, y: 940, s: 1.4, earL: -.4, earR: .4, look: { x: .4, y: -.7 }, mouth: .9 });
  parrot(g, { x: 1300 - appr * 60, y: 910, s: 1.25, wing: .2, look: { x: -.5, y: -.6 }, mouth: .8 });
  mouse(g, { x: 1600 - appr * 120, y: 955, s: 1.5, look: { x: -.6, y: -.6 }, mouth: .8 });
  // light rays from carrot
  g.save(); g.globalAlpha = .18 + Math.sin(t * 3) * .06;
  g.translate(W / 2, fy - 40);
  g.fillStyle = '#fff3b0';
  for (let i = 0; i < 10; i++) { g.rotate(TAU / 10); g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -700); g.lineTo(40, -700); g.closePath(); g.fill(); }
  g.restore();
  caption(g, 'यह जादुई गाजर थी! सब ओर खुशी फैल गई!', t, 1.2);
}

/* ---- S9 share + goodbye ---- */
function scShare(g, t, p) {
  const sunsetK = span(0, 4, t);
  meadow(g, sunsetK > .5 ? 'sunset' : 'golden', t, 0);
  // picnic blanket
  g.save(); ol(g, 5);
  g.beginPath();
  g.moveTo(560, 1000); g.lineTo(1360, 1000); g.lineTo(1240, 860); g.lineTo(680, 860); g.closePath();
  g.fillStyle = '#ff6b6b'; g.fill(); g.stroke();
  g.save(); g.beginPath(); g.moveTo(560, 1000); g.lineTo(1360, 1000); g.lineTo(1240, 860); g.lineTo(680, 860); g.closePath(); g.clip();
  g.strokeStyle = '#fff'; g.lineWidth = 14;
  for (let i = -4; i < 10; i++) { g.beginPath(); g.moveTo(560 + i * 90, 1010); g.lineTo(680 + i * 90, 850); g.stroke(); }
  g.restore(); g.restore();
  // carrot slices on a plate
  const plateK = span(.6, 1.4, t);
  if (plateK > 0) {
    g.save(); g.globalAlpha = plateK; ol(g, 4);
    g.beginPath(); g.ellipse(960, 900, 130, 40, 0, 0, TAU); g.fillStyle = '#fdfaf2'; g.fill(); g.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI + i * (Math.PI / 4) - .2; circle(g, 960 + Math.cos(a) * 70, 892 + Math.sin(a) * 18, 22, '#ffb43b'); }
    g.restore();
  }
  // friends around blanket eating happily
  elephant(g, { x: 400, y: 950, s: 1.25, trunk: -.4 + Math.sin(t * 5) * .3, mouth: (Math.sin(t * 6) > 0) ? 1 : .6, look: { x: .5, y: .2 } });
  rabbit(g, { x: 700, y: 940, s: 1.35, earL: -.35, earR: .35, mouth: (Math.sin(t * 6 + 1) > 0) ? 1 : .6, look: { x: .2, y: .2 } });
  parrot(g, { x: 1220, y: 905, s: 1.2, wing: .15, mouth: (Math.sin(t * 6 + 2) > 0) ? 1 : .6 });
  mouse(g, { x: 1460, y: 955, s: 1.45, mouth: (Math.sin(t * 6 + 3) > 0) ? 1 : .6, look: { x: -.4, y: .2 } });
  // heart bubbles
  for (let i = 0; i < 4; i++) {
    const ph = (t * .5 + i * .8) % 2.4;
    if (ph > 1.6) continue;
    const x = [420, 720, 1240, 1480][i];
    g.save(); g.globalAlpha = (1 - ph / 1.6) * .9;
    g.fillStyle = '#ff6b9d';
    const hy = 700 - ph * 60;
    g.beginPath();
    g.moveTo(x, hy + 14); g.bezierCurveTo(x - 16, hy - 4, x - 8, hy - 16, x, hy - 6); g.bezierCurveTo(x + 8, hy - 16, x + 16, hy - 4, x, hy + 14);
    g.fill(); g.restore();
  }
  // goodbye wave + moral + end card
  if (t > 4.6) {
    const wk = span(4.6, 5.2, t);
    g.save(); g.globalAlpha = wk;
    g.font = F(800, 64); g.textAlign = 'center';
    g.lineWidth = 14; g.strokeStyle = '#fff'; g.lineJoin = 'round';
    g.strokeText('मिलकर काम करने में ही ताक़त है!', W / 2, 300);
    g.fillStyle = '#b3402a'; g.fillText('मिलकर काम करने में ही ताक़त है!', W / 2, 300);
    g.restore();
  }
  if (t > 6.6) {
    const ek = span(6.6, 7.6, t);
    g.save(); g.globalAlpha = ek * .92;
    g.fillStyle = '#3a241c';
    g.beginPath();
    const w2 = 620, h2 = 130, r = 26, x = W / 2 - w2 / 2, y = 380;
    g.moveTo(x + r, y); g.arcTo(x + w2, y, x + w2, y + h2, r); g.arcTo(x + w2, y + h2, x, y + h2, r); g.arcTo(x, y + h2, x, y, r); g.arcTo(x, y, x + w2, y, r); g.closePath();
    g.fill();
    g.globalAlpha = ek;
    g.fillStyle = '#ffd93b'; g.font = F(800, 62); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('समाप्त', W / 2, y + h2 / 2);
    g.restore();
    // waving
    for (let i = 0; i < 4; i++) star(g, 300 + i * 440, 200 + Math.sin(t * 2 + i) * 20, 18, '#ffd93b', t * 2 + i);
  }
  caption(g, 'चिंकू ने गाजर सबमें बाँट दी। फिर मिलेंगे!', t, 1.0);
}

/* ============================== SCENE TABLE ============================== */
/* dur derived from narration length + lead/tail padding.                    */
const SCENES = [
  { key: 'title',    style: 'Title / Morning',   dur: 9.0,  narr: 'n01', lead: 1.0, draw: scTitle },
  { key: 'wake',     style: 'Chinku wakes up',   dur: 7.4,  narr: 'n02', lead: 0.9, draw: scWake },
  { key: 'discover', style: 'Discovery',         dur: 7.4,  narr: 'n03', lead: 0.9, draw: scDiscover },
  { key: 'struggle', style: 'The struggle',      dur: 9.2,  narr: 'n04', lead: 0.9, draw: scStruggle },
  { key: 'call',     style: 'Calling friends',   dur: 8.4,  narr: 'n05', lead: 0.9, draw: scCall },
  { key: 'team',     style: 'Team pull',         dur: 11.8, narr: 'n06', lead: 0.9, draw: scTeam },
  { key: 'pop',      style: 'POP!',              dur: 8.4,  narr: 'n07', lead: 0.8, draw: scPop },
  { key: 'magic',    style: 'Magic bloom',       dur: 9.8,  narr: 'n08', lead: 1.0, draw: scMagic },
  { key: 'share',    style: 'Sharing + goodbye', dur: 9.6,  narr: 'n09', lead: 0.9, draw: scShare },
];
const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);
const STARTS = (() => { let a = 0; return SCENES.map(s => { const v = a; a += s.dur; return v; }); })();

function sceneAt(t) {
  const tt = ((t % TOTAL) + TOTAL) % TOTAL;
  for (let i = 0; i < SCENES.length; i++) if (tt < STARTS[i] + SCENES[i].dur) return { i, local: tt - STARTS[i], global: tt };
  return { i: SCENES.length - 1, local: SCENES[SCENES.length - 1].dur, global: tt };
}

function drawFrame(g, t) {
  const { i, local } = sceneAt(t);
  const sc = SCENES[i];
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  sc.draw(g, local, c01(local / sc.dur));
  g.restore();
  // gentle scene fade-in
  const fi = 1 - c01(local / .35);
  if (fi > 0) { g.save(); g.globalAlpha = fi; g.fillStyle = '#fff8e8'; g.fillRect(0, 0, W, H); g.restore(); }
  // gentle fade-out at very end of last scene
  if (i === SCENES.length - 1) {
    const fo = c01((local - (sc.dur - .8)) / .8);
    if (fo > 0) { g.save(); g.globalAlpha = fo; g.fillStyle = '#2a1a2e'; g.fillRect(0, 0, W, H); g.restore(); }
  }
}

return {
  W, H, TAU, SCENES, STARTS, TOTAL, sceneAt, drawFrame, registerFonts,
  art: { rabbit, elephant, parrot, mouse, magicCarrot, meadow, sun, cloud, hills, tree, flower, butterfly, rainbow, sparkles, caption },
};
});
