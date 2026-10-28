/* ==========================================================================
   Mix music + SFX + Hindi narration (scene-synced) and mux with the video.
   ========================================================================== */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const C = require('./cartoon.js');

const FFMPEG = require('child_process').execSync(
  `/home/user/.venv/bin/python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`
).toString().trim();

const build = path.join(__dirname, 'build');
const audio = path.join(__dirname, 'audio');
const VIDEO = path.join(build, 'video-silent.mp4');
const OUT = process.argv[2] || path.join(__dirname, 'chinku-aur-jaadui-gaajar.mp4');

// inputs: 0 video, 1 music, 2 sfx, 3.. narration
const inputs = ['-i', VIDEO, '-i', path.join(audio, 'music.wav'), '-i', path.join(audio, 'sfx.wav')];
C.SCENES.forEach(sc => inputs.push('-i', path.join(audio, sc.narr + '.mp3')));

const filters = [];
filters.push('[1:a]volume=0.50[m]');
filters.push('[2:a]volume=0.95[s]');
const mixLabels = ['[m]', '[s]'];
C.SCENES.forEach((sc, i) => {
  const d = Math.round((C.STARTS[i] + sc.lead) * 1000);
  filters.push(`[${i + 3}:a]adelay=${d}|${d},volume=2.0[n${i}]`);
  mixLabels.push(`[n${i}]`);
});
filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:duration=longest[am]`);
filters.push(`[am]afade=t=in:st=0:d=0.5,afade=t=out:st=${(C.TOTAL - 1.4).toFixed(2)}:d=1.4,aresample=48000,aformat=channel_layouts=stereo[aout]`);

const args = ['-y', '-hide_banner', '-loglevel', 'error', ...inputs,
  '-filter_complex', filters.join(';'),
  '-map', '0:v', '-map', '[aout]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart', OUT];

const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
if (r.status !== 0) { console.error('mux failed', r.status); process.exit(1); }

// probe
const p = spawnSync(FFMPEG, ['-hide_banner', '-i', OUT], { encoding: 'utf8' });
const info = (p.stderr || '').split('\n').filter(l => /Duration|Stream/.test(l)).join('\n');
console.log('\n=== FINAL ===');
console.log(OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + 'MB');
console.log(info);
