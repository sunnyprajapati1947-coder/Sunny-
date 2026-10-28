/* ==========================================================================
   Frame renderer -> H.264 MP4 (silent).
   Streams raw RGBA frames from @napi-rs/canvas straight into ffmpeg stdin.
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
const C = require('./cartoon.js');
C.registerFonts();

const FPS = 30;
const OUT = process.argv[2] || path.join(__dirname, 'build', 'video-silent.mp4');
const W = C.W, H = C.H;
const FRAMES = Math.round(C.TOTAL * FPS);

const FFMPEG = require('child_process').execSync(
  `/home/user/.venv/bin/python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`
).toString().trim();

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const ff = spawn(FFMPEG, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
  '-x264-params', 'keyint=60:scenecut=0',
  '-movflags', '+faststart',
  OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const cv = createCanvas(W, H);
const g = cv.getContext('2d');

let f = 0;
const t0 = Date.now();

function pump() {
  // keep ffmpeg's stdin drained enough; simple synchronous loop is fine
  while (f < FRAMES) {
    const t = f / FPS;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    C.drawFrame(g, t);
    const buf = Buffer.from(g.getImageData(0, 0, W, H).data.buffer);
    const ok = ff.stdin.write(buf);
    f++;
    if (f % 300 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  frame ${f}/${FRAMES}  t=${t.toFixed(1)}s  ${el.toFixed(0)}s elapsed  (${(f / el).toFixed(1)} fps)`);
    }
    if (!ok) { ff.stdin.once('drain', pump); return; }
  }
  ff.stdin.end();
}
pump();

ff.on('close', code => {
  const el = (Date.now() - t0) / 1000;
  console.log(`ffmpeg exit ${code}; rendered ${f} frames in ${el.toFixed(1)}s -> ${OUT}`);
  process.exit(code);
});
