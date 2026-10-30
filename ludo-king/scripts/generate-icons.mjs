/**
 * Generates the PWA icons from pure geometry (no image assets, no third-party
 * graphics), so the repository never carries art it cannot regenerate.
 *
 *   node scripts/generate-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLORS, renderIcon, hex } from './crest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, 'icon-192.png'), renderIcon(192));
writeFileSync(resolve(outDir, 'icon-512.png'), renderIcon(512));
writeFileSync(resolve(outDir, 'icon-maskable-512.png'), renderIcon(512, { maskable: true }));
writeFileSync(resolve(outDir, 'icon-1024.png'), renderIcon(1024));

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(COLORS.goldLight)}"/>
      <stop offset="0.55" stop-color="${hex(COLORS.gold)}"/>
      <stop offset="1" stop-color="${hex(COLORS.goldDeep)}"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="47" fill="${hex(COLORS.bg)}" stroke="url(#g)" stroke-width="4"/>
  <path d="M28 63 L32 34 L43 47 L50 27 L57 47 L68 34 L72 63 Z" fill="url(#g)" stroke="${hex(COLORS.goldDeep)}" stroke-width="1.4" stroke-linejoin="round"/>
  <rect x="29" y="64" width="42" height="7" rx="3.5" fill="url(#g)"/>
  <circle cx="38.5" cy="58" r="4" fill="${hex(COLORS.red)}"/>
  <circle cx="50" cy="55" r="4" fill="${hex(COLORS.green)}"/>
  <circle cx="61.5" cy="58" r="4" fill="${hex(COLORS.yellow)}"/>
  <circle cx="50" cy="68.5" r="4" fill="${hex(COLORS.blue)}"/>
</svg>
`;
writeFileSync(resolve(outDir, 'favicon.svg'), favicon);

console.log('icons written to public/icons');
