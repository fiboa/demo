/** Writing pictures from the pre-render scripts. */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

/** A minimal RGBA PNG: one IDAT, no filtering. */
export function png(rgba, width, height) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Write `rgba` as a PNG to `file`, reduced to a 256-colour palette when ImageMagick (`magick`) is on the
 * path: a quarter of the size, no visible loss.
 */
export function writePng(file, rgba, width, height) {
  writeFileSync(file, png(rgba, width, height));
  try {
    execFileSync('magick', [file, '-dither', 'FloydSteinberg', '-colors', '256', `PNG8:${file}`]);
  } catch {
    console.warn('  no magick: left as a full-colour PNG');
  }
}
