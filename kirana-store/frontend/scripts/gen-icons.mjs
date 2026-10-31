// Generates crisp PNG app icons (192/512/180) with zero dependencies.
// Draws: orange rounded-square + white receipt bars + white circle with orange tick.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ORANGE = [234, 88, 12], WHITE = [255, 255, 255];
const segDist = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

function draw(S) {
  const px = Buffer.alloc(S * S * 4);
  const r = S * 0.22;
  const cx = S * 0.68, cy = S * 0.68, cr = S * 0.17;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let col = ORANGE;
      // rounded-square mask (outside = transparent)
      const nx = Math.min(Math.max(x, r), S - 1 - r), ny = Math.min(Math.max(y, r), S - 1 - r);
      const masked = Math.hypot(x - nx, y - ny) <= r;
      if (!masked) { const i = (y * S + x) * 4; px[i + 3] = 0; continue; }
      // receipt bars
      const bars = [
        [0.24, 0.30, 0.24, 0.76], [0.40, 0.46, 0.24, 0.76], [0.56, 0.62, 0.24, 0.58],
      ];
      const u = x / S, v = y / S;
      if (bars.some(([t, b, l, rr]) => v >= t && v <= b && u >= l && u <= rr)) col = WHITE;
      // circle + tick
      const d = Math.hypot(x - cx, y - cy);
      if (d <= cr) {
        col = WHITE;
        const t = S * 0.035;
        if (segDist(x, y, S * 0.60, S * 0.69, S * 0.665, S * 0.755) <= t ||
            segDist(x, y, S * 0.665, S * 0.755, S * 0.78, S * 0.615) <= t) col = ORANGE;
      }
      const i = (y * S + x) * 4;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  }
  return px;
}

const out = path.join(process.cwd(), 'public');
for (const size of [192, 512, 180]) {
  const file = path.join(out, size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`);
  fs.writeFileSync(file, png(size, size, draw(size)));
  console.log('wrote', file);
}
