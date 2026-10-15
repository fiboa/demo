/**
 * Pre-render the example fields of the relief demo with the page's own code: one transparent PNG per example
 * in relief/examples/<id>.png and the measured facts in relief/data/examples.json.
 *
 *   node scripts/relief/examples.mjs            # every example
 *   node scripts/relief/examples.mjs oderbruch  # just these
 *
 * Height models that decode images in the browser (GSI, Japan) cannot run here. With ImageMagick (`magick`)
 * on the path, each picture is reduced to a 256-colour palette: a quarter of the size, no visible loss.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { fromLonLat } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { COLLECTIONS } from '../../relief/src/dems.js';
import { EXAMPLES } from '../../relief/src/examples.js';
import { FIELDS_PMTILES, fieldAt } from '../../relief/src/fields.js';
import { fieldRelief } from '../../relief/src/read.js';
import { colorize, hillshade } from '../../relief/src/relief.js';

const ROOT = new URL('../../relief/', import.meta.url);
const FACTS = new URL('data/examples.json', ROOT);
// Longest side of a picture: sharp at twice the width of a card.
const SIDE = 640;

/** A minimal RGBA PNG: one IDAT, no filtering. */
function png(rgba, width, height) {
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

/** Cut the picture to the cells inside the field, so it fills its card. */
function crop(rgba, width, height) {
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1 + 1) * 4), y * w * 4);
  return { rgba: out, width: w, height: h };
}

const only = process.argv.slice(2);
const pmtiles = new PMTiles(FIELDS_PMTILES);
let facts = {};
try {
  facts = JSON.parse(readFileSync(FACTS, 'utf8'));
} catch {
  // first run
}
mkdirSync(new URL('examples/', ROOT), { recursive: true });

for (const example of EXAMPLES.filter((e) => !only.length || only.includes(e.id))) {
  const field = await fieldAt(pmtiles, fromLonLat([example.lon, example.lat]), (c) => !!COLLECTIONS[c]);
  if (!field) throw new Error(`${example.id}: no field at ${example.lon}, ${example.lat}`);
  const relief = await fieldRelief(field, { maxSide: SIDE });
  if (!relief) throw new Error(`${example.id}: no heights`);
  const { dem, grid, mask, stats, cell } = relief;
  const shade = hillshade(grid.values, grid.width, grid.height, cell);
  const picture = crop(colorize(grid.values, mask, shade, stats.low, stats.high), grid.width, grid.height);
  const file = fileURLToPath(new URL(`examples/${example.id}.png`, ROOT));
  writeFileSync(file, png(picture.rgba, picture.width, picture.height));
  try {
    execFileSync('magick', [file, '-dither', 'FloydSteinberg', '-colors', '256', `PNG8:${file}`]);
  } catch {
    console.warn('  no magick: left as a full-colour PNG');
  }
  const p = field.properties;
  facts[example.id] = {
    collection: field.collection,
    crop: p['crop:name'] ?? p['hcat:name_en'] ?? null,
    crop_en: p['hcat:name_en'] ?? null,
    area: Math.round(p['metrics:area'] ?? (stats.count + stats.missing) * cell * cell),
    low: +stats.low.toFixed(2),
    high: +stats.high.toFixed(2),
    spread: +(stats.high - stats.low).toFixed(3),
    dem: dem.name,
    width: picture.width,
    height: picture.height,
  };
  console.log(example.id, field.collection, dem.name, `${picture.width}x${picture.height}`, `${Math.round((stats.high - stats.low) * 100)} cm`);
}
writeFileSync(FACTS, `${JSON.stringify(facts, null, 1)}\n`);
