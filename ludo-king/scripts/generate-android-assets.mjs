/**
 * Generates every Android raster asset from the same procedural crest used by
 * the web build: launcher icons (legacy, round and adaptive foreground) plus
 * portrait/landscape splash screens.
 *
 *   node scripts/generate-android-assets.mjs
 *
 * Nothing here is copied from any other application; all pixels are computed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIcon, renderSplash } from './crest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const res = resolve(here, '../android/app/src/main/res');

const DENSITIES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
}

for (const [density, scale] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * scale);
  const dir = resolve(res, `mipmap-${density}`);
  write(resolve(dir, 'ic_launcher.png'), renderIcon(legacy));
  write(resolve(dir, 'ic_launcher_round.png'), renderIcon(legacy, { maskable: true }));
  // Adaptive foreground: 108dp canvas, art in the safe 66dp centre.
  const adaptive = Math.round(108 * scale);
  write(resolve(dir, 'ic_launcher_foreground.png'), renderIcon(adaptive, { maskable: true, padding: 0.22 }));
  write(resolve(dir, 'ic_launcher_background.png'), renderIcon(adaptive, { backgroundOnly: true }));

  // Splash screens (Capacitor draws @drawable/splash and density variants).
  const portrait = [Math.round(480 * scale), Math.round(800 * scale)];
  const landscape = [Math.round(800 * scale), Math.round(480 * scale)];
  write(resolve(res, `drawable-port-${density}`, 'splash.png'), renderSplash(portrait[0], portrait[1]));
  write(resolve(res, `drawable-land-${density}`, 'splash.png'), renderSplash(landscape[0], landscape[1]));
}

// Generic fallback splash used on unusual configurations.
write(resolve(res, 'drawable', 'splash.png'), renderSplash(480, 800));

console.log('android assets written to android/app/src/main/res');
