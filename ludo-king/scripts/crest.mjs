/**
 * Generates the PWA icons at build time from pure geometry (no image assets,
 * no third-party graphics). Writes PNGs with a tiny built-in encoder so the
 * repository never carries binary art it cannot regenerate.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync, inflateSync } from 'node:zlib';

export const COLORS = {
  bg: [0x14, 0x0d, 0x07],
  bgLift: [0x2b, 0x1c, 0x0e],
  gold: [0xf2, 0xb7, 0x05],
  goldLight: [0xff, 0xe8, 0x9a],
  goldDeep: [0xa9, 0x7b, 0x00],
  red: [0xe6, 0x3a, 0x45],
  green: [0x22, 0xa0, 0x6b],
  yellow: [0xf2, 0xb7, 0x05],
  blue: [0x2f, 0x6f, 0xed],
  white: [0xff, 0xf6, 0xe0],
};

export function hex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Signed distance helpers. Coordinates are normalised 0..1. */
function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inRing(x, y, cx, cy, r, thickness) {
  const d = Math.hypot(x - cx, y - cy);
  return d <= r && d >= r - thickness;
}

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inRoundedSquare(x, y, inset, radius) {
  const min = inset;
  const max = 1 - inset;
  if (x < min || x > max || y < min || y > max) return false;
  const dx = Math.max(min + radius - x, 0, x - (max - radius));
  const dy = Math.max(min + radius - y, 0, y - (max - radius));
  return Math.hypot(dx, dy) <= radius;
}

/** The crest, drawn in normalised coordinates. */
export function crestPixel(x, y, opts) {
  const { padding = 0.08, backgroundOnly = false } = opts;
  const cx = 0.5;
  const cy = 0.5;
  const r = 0.5 - padding;
  const scale = 1 - 2 * padding;
  const nx = (x - padding) / scale;
  const ny = (y - padding) / scale;
  const inArt = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;

  // Outer gold ring and inner hairline.
  if (inRing(x, y, cx, cy, r, 0.038)) {
    const t = (y - (cy - r)) / (2 * r);
    return mix(COLORS.goldLight, COLORS.goldDeep, Math.min(1, Math.max(0, t)));
  }
  const dist = Math.hypot(x - cx, y - cy);
  if (dist > r) return backgroundOnly ? COLORS.bg : null;
  if (inRing(x, y, cx, cy, r - 0.045, 0.008)) return mix(COLORS.gold, COLORS.bgLift, 0.55);

  // Dark disc with a soft radial lift.
  let base = mix(COLORS.bgLift, COLORS.bg, Math.min(1, dist / r));
  if (!inArt || backgroundOnly) return base;

  // Gems: four player colours under the crown.
  const gems = [
    [0.30, 0.735, COLORS.red],
    [0.435, 0.735, COLORS.green],
    [0.565, 0.735, COLORS.yellow],
    [0.70, 0.735, COLORS.blue],
  ];
  for (const [gx, gy, color] of gems) {
    if (inCircle(nx, ny, gx, gy, 0.052)) {
      if (inCircle(nx, ny, gx - 0.016, gy - 0.018, 0.017)) return COLORS.white;
      return color;
    }
  }

  // Crown band.
  if (nx >= 0.22 && nx <= 0.78 && ny >= 0.50 && ny <= 0.60) {
    const t = (ny - 0.5) / 0.1;
    return mix(COLORS.goldLight, COLORS.goldDeep, 0.25 + t * 0.5);
  }

  // Crown body.
  const crown = [
    [0.22, 0.52],
    [0.29, 0.20],
    [0.41, 0.36],
    [0.5, 0.14],
    [0.59, 0.36],
    [0.71, 0.20],
    [0.78, 0.52],
  ];
  if (inPolygon(nx, ny, crown)) {
    const t = (ny - 0.14) / 0.38;
    return mix(COLORS.goldLight, COLORS.goldDeep, Math.min(1, Math.max(0, 0.12 + t * 0.75)));
  }

  // Crown jewels on the band top edge.
  for (const [jx, color] of [[0.34, COLORS.red], [0.5, COLORS.green], [0.66, COLORS.yellow]]) {
    if (inCircle(nx, ny, jx, 0.55, 0.026)) return color;
  }

  return base;
}

export function renderIcon(size, opts = {}) {
  const ss = 3; // supersampling factor
  const pixels = Buffer.alloc(size * size * 4);
  const padding = opts.padding ?? 0.09;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (opts.maskable) {
            const color = crestPixel(x, y, { padding: 0.2 });
            if (color) {
              r += color[0];
              g += color[1];
              b += color[2];
              a += 255;
            }
          } else if (!inRoundedSquare(x, y, 0.02, 0.16)) {
            // transparent outside the rounded square
          } else {
            const color = crestPixel(x, y, { padding });
            if (color) {
              r += color[0];
              g += color[1];
              b += color[2];
              a += 255;
            }
          }
        }
      }
      const samples = ss * ss;
      const idx = (py * size + px) * 4;
      pixels[idx] = Math.round(r / samples);
      pixels[idx + 1] = Math.round(g / samples);
      pixels[idx + 2] = Math.round(b / samples);
      pixels[idx + 3] = Math.round(a / samples);
    }
  }
  return encodePng(size, size, pixels);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter type none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  const chunks = [
    chunk('IHDR', ihdr(width, height)),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

function ihdr(width, height) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = 8; // bit depth
  buf[9] = 6; // RGBA
  return buf;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}


/**
 * Renders a splash screen: the crest centred on the brand background.
 * `width`/`height` are in pixels; the crest occupies `crestRatio` of the short edge.
 */
export function renderSplash(width, height, crestRatio = 0.32) {
  const crestSize = Math.round(Math.min(width, height) * crestRatio);
  const crest = renderIconPixels(crestSize, { maskable: true });
  const pixels = Buffer.alloc(width * height * 4);
  // Vertical gradient background matching the app shell.
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    const color = mix(COLORS.bgLift, COLORS.bg, 0.35 + t * 0.65);
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }
  // Composite the crest (alpha blend).
  const ox = Math.round((width - crestSize) / 2);
  const oy = Math.round((height - crestSize) / 2);
  for (let y = 0; y < crestSize; y += 1) {
    for (let x = 0; x < crestSize; x += 1) {
      const s = (y * crestSize + x) * 4;
      const a = crest[s + 3] / 255;
      if (a === 0) continue;
      const d = ((oy + y) * width + (ox + x)) * 4;
      pixels[d] = Math.round(crest[s] * a + pixels[d] * (1 - a));
      pixels[d + 1] = Math.round(crest[s + 1] * a + pixels[d + 1] * (1 - a));
      pixels[d + 2] = Math.round(crest[s + 2] * a + pixels[d + 2] * (1 - a));
      pixels[d + 3] = 255;
    }
  }
  return encodePng(width, height, pixels);
}

/** Raw RGBA pixels for the crest (used for compositing). */
export function renderIconPixels(size, opts = {}) {
  const png = renderIcon(size, opts);
  return decodePng(size, png);
}

/** Minimal PNG reader for the 8-bit RGBA images this module writes. */
function decodePng(size, png) {
  let offset = 8;
  const idat = [];
  let width = size;
  let height = size;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error('unexpected PNG filter in generated icon');
    raw.copy(out, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return out;
}
