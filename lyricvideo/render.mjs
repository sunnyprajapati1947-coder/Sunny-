// render.mjs — paint every frame in headless Chrome, then mux with the song via ffmpeg.
//
//   node render.mjs --sheet=2,6,10 [--cols=3] [--w=640]      quick contact sheet  -> out/sheet.jpg
//   node render.mjs --stills=1.2,9.4 [--out=out/stills]      full-res PNG stills
//   node render.mjs --clip=0:8 [--fps=24]                    short MP4 with audio -> out/clip.mp4
//   node render.mjs --frames=0:60 [--workers=4]              all frames -> out/frames (resumable)
//   node render.mjs --encode [--out=out/video.mp4]           frames + song -> MP4
//
// Chrome: --chrome=<path>, or set CHROME_PATH. ffmpeg must be on PATH.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, renameSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const fps = +(args.fps || 24);
const FRAMES_DIR = args.framesDir || 'out/frames';

function findChrome() {
  if (args.chrome) return args.chrome;
  for (const p of [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']) {
    if (p && existsSync(p)) return p;
  }
  console.error('Chrome nahi mila. --chrome=<path> do ya CHROME_PATH set karo.');
  process.exit(1);
}
const run = (cmd, a) => new Promise((ok, bad) => { const p = spawn(cmd, a, { stdio: 'inherit' }); p.on('close', c => c ? bad(new Error(cmd + ' exited ' + c)) : ok()); });

if (args.encode) {
  const out = args.out || 'out/video.mp4';
  const audio = args.audio || 'assets/song.mp3';
  const n = readdirSync(FRAMES_DIR).filter(f => f.endsWith('.jpg')).length;
  mkdirSync(dirname(out), { recursive: true });
  console.log(`encoding ${n} frames -> ${out}`);
  const a = ['-y', '-loglevel', 'error', '-stats', '-framerate', String(fps), '-i', `${FRAMES_DIR}/f%05d.jpg`];
  if (existsSync(audio)) a.push('-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  a.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  await run('ffmpeg', a);
  console.log('wrote ' + out);
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: true, protocolTimeout: 0,
  args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--window-size=1920,1080',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--no-sandbox']
});
async function openPage(tag = '') {
  const page = await browser.newPage();
  page.on('console', m => { if (['error', 'warn'].includes(m.type())) console.log(`[page${tag}]`, m.text()); });
  page.on('pageerror', e => console.log(`[page error${tag}]`, e.message));
  await page.goto(pathToFileURL(resolve('studio.html')).href + '?render', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.ready === true', { timeout: 60000 });
  return page;
}
const frameOf = async (page, t, type, q) => {
  const url = await page.evaluate((t, type, q) => window.renderAt(t, type, q), t, type, q);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};
const times = s => String(s).split(',').map(Number);

const probe = await openPage();
const DUR = await probe.evaluate(() => DUR);
const AUDIO = await probe.evaluate(() => SONG.audio);
console.log(`song: ${await probe.evaluate(() => SONG.title)} · ${DUR}s · ${fps} fps · ${Math.ceil(DUR * fps)} frames`);

if (args.sheet) {
  const out = args.out || 'out/sheet.jpg'; mkdirSync(dirname(out), { recursive: true });
  const { url, ms } = await probe.evaluate((ts, c, w) => window.renderSheet(ts, c, w), times(args.sheet), +(args.cols || 3), +(args.w || 640));
  writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log(`${out}  ms/frame: ${ms.join(' ')}`);
} else if (args.stills) {
  const out = args.out || 'out/stills'; mkdirSync(out, { recursive: true });
  for (const s of times(args.stills)) {
    const t0 = Date.now(), buf = await frameOf(probe, s, 'image/png');
    const f = `${out}/t${s.toFixed(2).replace('.', '_')}.png`; writeFileSync(f, buf);
    console.log(`${f}  ${Date.now() - t0} ms`);
  }
} else if (args.frames) {
  const [a, b] = String(args.frames).split(':').map(Number), workers = +(args.workers || 4);
  mkdirSync(FRAMES_DIR, { recursive: true });
  const first = Math.round(a * fps), last = Math.min(Math.ceil(DUR * fps) - 1, Math.round((isNaN(b) ? DUR : b) * fps) - 1);
  const todo = []; for (let i = first; i <= last; i++) { const f = `${FRAMES_DIR}/f${String(i).padStart(5, '0')}.jpg`; if (!existsSync(f) || statSync(f).size < 1000) todo.push(i); }
  console.log(`${todo.length} frames to render (${last - first + 1 - todo.length} already done), ${workers} workers`);
  let next = 0, done = 0; const start = Date.now();
  const work = async w => {
    const page = await openPage('#' + w);
    while (next < todo.length) {
      const i = todo[next++], f = `${FRAMES_DIR}/f${String(i).padStart(5, '0')}.jpg`;
      const buf = await frameOf(page, i / fps, 'image/jpeg', .94);
      writeFileSync(f + '.tmp', buf); renameSync(f + '.tmp', f);
      if (++done % 12 === 0 || done === todo.length) {
        const el = (Date.now() - start) / 1000;
        console.log(`frame ${done}/${todo.length}  ${(el / done * 1000).toFixed(0)} ms/frame  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
      }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => work(w)));
  console.log(`done. ab: node render.mjs --encode`);
} else {
  const [a, b] = args.clip ? String(args.clip).split(':').map(Number) : [0, DUR];
  const out = args.out || 'out/clip.mp4'; mkdirSync(dirname(out), { recursive: true });
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
  if (existsSync(AUDIO)) ffArgs.push('-ss', String(a), '-t', String(b - a), '-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  ffArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', out);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((b - a) * fps), start = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await frameOf(probe, a + i / fps, 'image/jpeg', .92);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 12 === 0 || i === n - 1) console.log(`frame ${i + 1}/${n}  ${((Date.now() - start) / (i + 1)).toFixed(0)} ms/frame`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(`wrote ${out}`);
}
await browser.close();
