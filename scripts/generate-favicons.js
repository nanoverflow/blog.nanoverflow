#!/usr/bin/env node
/*
 * Generate raster favicons from the Jy pixel logo (7x4 grid, same layout and
 * colors as .jy-logo in themes/pi-cli-theme/static/css/style.css):
 *
 *   static/favicon.ico          16x16 + 32x32 + 48x48 (uncompressed 32-bit DIB)
 *   static/apple-touch-icon.png 180x180, pi dark background
 *
 * Usage: node scripts/generate-favicons.js
 * (PNG encoding is handwritten — no dependencies. SVG favicon is static.)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Brand colors (fixed across themes), see :root in static/css/style.css
const COLORS = {
  C: [0xe4, 0x8a, 0x7a, 255], // --coral
  B: [0x4f, 0x8e, 0xb3, 255], // --pi-blue
  Y: [0xea, 0xb6, 0x5d, 255], // --pi-yellow
};

// 7x4 pixel grid, row-major, exactly matching .jy-logo i:nth-child() rules
const GRID = [
  'CCC.Y.Y',
  '..B.Y.Y',
  '..B.YYY',
  'BBB...Y',
];

const LOGO_W = 7;
const LOGO_H = 4;

/** Render the logo into a w*h RGBA buffer at the given cell scale + offset. */
function render(w, h, scale, offX, offY, bg) {
  const rgba = Buffer.alloc(w * h * 4);
  if (bg) {
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = bg[0]; rgba[i * 4 + 1] = bg[1]; rgba[i * 4 + 2] = bg[2]; rgba[i * 4 + 3] = 255;
    }
  }
  GRID.forEach((row, gy) => {
    for (let gx = 0; gx < LOGO_W; gx++) {
      const ch = row[gx];
      if (ch === '.') continue;
      const c = COLORS[ch];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = offX + gx * scale + dx;
          const y = offY + gy * scale + dy;
          const i = (y * w + x) * 4;
          rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = c[3];
        }
      }
    }
  });
  return rgba;
}

// ---------------------------------------------------------------- PNG encode

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- ICO encode

/** 32-bit uncompressed DIB (BITMAPINFOHEADER + XOR + AND mask), bottom-up. */
function icoDibEntry(w, h, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);        // biSize
  header.writeInt32LE(w, 4);          // biWidth
  header.writeInt32LE(h * 2, 8);      // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12);        // biPlanes
  header.writeUInt16LE(32, 14);       // biBitCount
  header.writeUInt32LE(w * h * 4, 20); // biSizeImage

  const xor = Buffer.alloc(w * h * 4); // BGRA, bottom-up
  for (let y = 0; y < h; y++) {
    const src = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (src * w + x) * 4;
      const di = (y * w + x) * 4;
      xor[di] = rgba[si + 2]; xor[di + 1] = rgba[si + 1]; xor[di + 2] = rgba[si]; xor[di + 3] = rgba[si + 3];
    }
  }

  const rowBytes = Math.ceil(w / 32) * 4; // 1bpp rows padded to 32 bits
  const and = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y++) {
    const src = h - 1 - y;
    for (let x = 0; x < w; x++) {
      if (rgba[(src * w + x) * 4 + 3] === 0) and[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, xor, and]);
}

function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    dir[i * 16] = e.size;           // width (0 would mean 256)
    dir[i * 16 + 1] = e.size;       // height
    dir.writeUInt16LE(1, i * 16 + 4);   // planes
    dir.writeUInt16LE(32, i * 16 + 6);  // bit count
    dir.writeUInt32LE(e.data.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += e.data.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

// --------------------------------------------------------------------- main

const root = path.join(__dirname, '..');
const staticDir = path.join(root, 'static');
fs.mkdirSync(staticDir, { recursive: true });

// favicon.ico: 16 / 32 / 48, transparent background, logo centered
const icoSizes = [16, 32, 48];
const entries = icoSizes.map((size) => {
  const scale = Math.floor(size / LOGO_W); // 2 / 4 / 6
  const offX = Math.floor((size - LOGO_W * scale) / 2);
  const offY = Math.floor((size - LOGO_H * scale) / 2);
  const rgba = render(size, size, scale, offX, offY, null);
  return { size, data: icoDibEntry(size, size, rgba) };
});
fs.writeFileSync(path.join(staticDir, 'favicon.ico'), encodeICO(entries));
console.log('wrote static/favicon.ico (16, 32, 48)');

// apple-touch-icon.png: 180x180 on pi dark background
const A = 180;
const aScale = 22; // 7*22=154 wide, 4*22=88 tall
const aRgba = render(A, A, aScale, Math.floor((A - LOGO_W * aScale) / 2), Math.floor((A - LOGO_H * aScale) / 2), [0x21, 0x25, 0x2c]);
fs.writeFileSync(path.join(staticDir, 'apple-touch-icon.png'), encodePNG(A, A, aRgba));
console.log('wrote static/apple-touch-icon.png (180x180)');
