import * as THREE from 'three';
import { PATH, META, COLORS, SAFE } from '../game/engine.js';

const COL = { red: '#e8261c', green: '#17b93a', yellow: '#ffc400', blue: '#1673e6' };
const SOFT = { red: '#ff9d97', green: '#8fe6a3', yellow: '#ffe082', blue: '#8fc3ff' };

// Draws the full futuristic-gloss Ludo board onto a canvas -> THREE texture (top face of the 3D board)
export function createBoardTexture() {
  const S = 1536, cell = S / 15;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  x.fillStyle = '#f7f8ff'; x.fillRect(0, 0, S, S);

  const cellRect = (r, c, fill) => { x.fillStyle = fill; x.fillRect(c * cell, r * cell, cell, cell); };

  // bases: coloured outer + white yard + coloured spots
  const base = (r0, c0, color) => {
    for (let r = r0; r < r0 + 6; r++) for (let c = c0; c < c0 + 6; c++) cellRect(r, c, COL[color]);
    x.fillStyle = '#ffffff';
    roundRect(x, (c0 + 0.7) * cell, (r0 + 0.7) * cell, 4.6 * cell, 4.6 * cell, 34); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 4; x.stroke();
    META[color].base.forEach(([r, c]) => {
      x.beginPath(); x.arc((c + .5) * cell, (r + .5) * cell, cell * .36, 0, Math.PI * 2);
      x.fillStyle = '#fff'; x.fill(); x.lineWidth = 9; x.strokeStyle = COL[color]; x.stroke();
      x.beginPath(); x.arc((c + .5) * cell, (r + .5) * cell, cell * .13, 0, Math.PI * 2);
      x.fillStyle = SOFT[color]; x.fill();
    });
  };
  base(0, 0, 'red'); base(0, 9, 'green'); base(9, 9, 'yellow'); base(9, 0, 'blue');

  // track cells
  PATH.forEach(([r, c], i) => {
    cellRect(r, c, '#ffffff');
    x.strokeStyle = '#aeb6dd'; x.lineWidth = 3; x.strokeRect(c * cell, r * cell, cell, cell);
  });
  // starts + home columns
  COLORS.forEach((col) => {
    const [sr, sc] = PATH[META[col].start];
    cellRect(sr, sc, COL[col]);
    x.strokeStyle = '#7e87b8'; x.lineWidth = 3; x.strokeRect(sc * cell, sr * cell, cell, cell);
    // entry arrow (white triangle pointing along travel)
    x.fillStyle = 'rgba(255,255,255,.9)';
    x.beginPath(); x.moveTo((sc + .28) * cell, (sr + .32) * cell); x.lineTo((sc + .72) * cell, (sr + .5) * cell); x.lineTo((sc + .28) * cell, (sr + .68) * cell); x.fill();
    META[col].homeCol.forEach(([r, c], i) => {
      if (i < 5) { cellRect(r, c, SOFT[col]); x.strokeStyle = '#aeb6dd'; x.lineWidth = 3; x.strokeRect(c * cell, r * cell, cell, cell); }
    });
  });
  // safe stars
  SAFE.forEach((i) => {
    const [r, c] = PATH[i];
    const isStart = COLORS.some((col) => META[col].start === i);
    drawStar(x, (c + .5) * cell, (r + .5) * cell, cell * .30, isStart ? '#ffffff' : '#3949ab');
  });
  // direction arrows on the track (subtle)
  x.fillStyle = 'rgba(57,73,171,.35)'; x.font = `900 ${cell * .42}px system-ui`;
  x.textAlign = 'center'; x.textBaseline = 'middle';

  // centre: 4 home triangles + jewel
  const cx = 7.5 * cell, cy = 7.5 * cell, h = 1.5 * cell;
  const tri = (pts, fill) => { x.fillStyle = fill; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => x.lineTo(p[0], p[1])); x.closePath(); x.fill(); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 3; x.stroke(); };
  tri([[cx - h, cy - h], [cx + h, cy - h], [cx, cy]], COL.green);
  tri([[cx + h, cy - h], [cx + h, cy + h], [cx, cy]], COL.yellow);
  tri([[cx + h, cy + h], [cx - h, cy + h], [cx, cy]], COL.blue);
  tri([[cx - h, cy + h], [cx - h, cy - h], [cx, cy]], COL.red);
  x.beginPath(); x.arc(cx, cy, cell * .30, 0, Math.PI * 2);
  const g = x.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, cell * .3);
  g.addColorStop(0, '#fffde7'); g.addColorStop(.55, '#ffd54f'); g.addColorStop(1, '#ff8f00');
  x.fillStyle = g; x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#5d3500'; x.font = `900 ${cell * .26}px system-ui`; x.fillText('HOME', cx, cy + 2);

  // glossy sheen
  const sheen = x.createLinearGradient(0, 0, S, S);
  sheen.addColorStop(0, 'rgba(255,255,255,.14)'); sheen.addColorStop(.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(20,30,120,.08)');
  x.fillStyle = sheen; x.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function drawStar(x, cx, cy, r, fill) {
  x.fillStyle = fill; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * .45 : r, a = (i * Math.PI) / 5 - Math.PI / 2;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath(); x.fill();
}

// Dice face texture (value 1..6)
export function createDiceFaceTexture(value, pipColor = '#141b3f') {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe4fb');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(20,27,63,.25)'; x.lineWidth = 10; x.strokeRect(0, 0, S, S);
  const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[value];
  x.fillStyle = pipColor;
  P.forEach(([c, r]) => {
    const px = (c + .5) * (S / 3), py = (r + .5) * (S / 3);
    x.beginPath(); x.arc(px, py, value === 1 ? 34 : 27, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(px - 7, py - 7, 8, 0, Math.PI * 2); x.fill(); x.fillStyle = pipColor;
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
