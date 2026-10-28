/* Render a contact sheet: each scene sampled at a good moment, tiled 3x3. */
'use strict';
const path = require('path');
const fs = require('fs');
const C = require('./cartoon.js');
const { createCanvas } = require('@napi-rs/canvas');
C.registerFonts();

const SW = 640, SH = 360;          // per-tile size
const COLS = 3, ROWS = 3;
const sheet = createCanvas(SW * COLS, SH * ROWS);
const sg = sheet.getContext('2d');

// pick a representative local time per scene
const PICK = [3.2, 4.6, 4.0, 4.6, 6.0, 8.2, 2.4, 4.2, 5.4];

const big = createCanvas(C.W, C.H);
const bg = big.getContext('2d');

C.SCENES.forEach((sc, i) => {
  const t = C.STARTS[i] + PICK[i];
  bg.setTransform(1, 0, 0, 1, 0, 0);
  bg.clearRect(0, 0, C.W, C.H);
  C.drawFrame(bg, t);
  const cx = (i % COLS) * SW, cy = Math.floor(i / COLS) * SH;
  sg.drawImage(big, 0, 0, C.W, C.H, cx, cy, SW, SH);
  sg.save();
  sg.fillStyle = 'rgba(0,0,0,.65)'; sg.fillRect(cx, cy, 210, 30);
  sg.fillStyle = '#fff'; sg.font = 'bold 16px sans-serif'; sg.textBaseline = 'middle';
  sg.fillText(`${i + 1} ${sc.key} t=${PICK[i]}`, cx + 8, cy + 15);
  sg.restore();
});

fs.writeFileSync(path.join(__dirname, 'contact-sheet.png'), sheet.toBuffer('image/png'));
console.log('wrote contact-sheet.png', sheet.width, 'x', sheet.height);
