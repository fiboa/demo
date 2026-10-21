/**
 * Pre-render the example fields of the flood demo with the page's own code: the radar image of the wettest
 * day around the field, open water in blue and the field outlined (flood/examples/<id>.png), and the water
 * share through the year with the facts of the card (flood/data/examples.json).
 *
 *   node scripts/flood/examples.mjs         # every example
 *   node scripts/flood/examples.mjs rice    # just these
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromLonLat, transformExtent } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { EXAMPLES } from '../../flood/src/examples.js';
import { series, waterMap } from '../../flood/src/s1.js';
import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';
import { writePng } from '../png.mjs';

const ROOT = new URL('../../flood/', import.meta.url);
const FACTS = new URL('data/examples.json', ROOT);
const DAY = 86400000;
// Metres around the field in the picture: a few times its size, within these bounds.
const MARGIN = [500, 1500];
const WATER = [31, 111, 209];
const OUTLINE = [194, 65, 12];

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
  const field = await fieldAt(pmtiles, fromLonLat([example.lon, example.lat]), inCatalog, undefined, preferred);
  if (!field) throw new Error(`${example.id}: no field at ${example.lon}, ${example.lat}`);
  const start = new Date(Date.UTC(example.year, 0, 1));
  const end = new Date(Date.UTC(example.year + 1, 0, 1) - 1);
  const days = Math.round((end - start + 1) / DAY);
  const { points } = await series(field, transformExtent(field.extent, 'EPSG:3857', 'EPSG:4326'), start, end);
  // The picture: the image nearest to the example's `picture` date, else the wettest one.
  const wettest = example.picture
    ? points.reduce((a, b) => (Math.abs(b.scene.date - new Date(example.picture)) < Math.abs(a.scene.date - new Date(example.picture)) ? b : a))
    : points.reduce((a, b) => (b.water > a.water ? b : a));

  // The radar in grey with the water in blue, and the outline of the field.
  const [x0, y0, x1, y1] = field.extent;
  const size = Math.max(x1 - x0, y1 - y0) * Math.cos((example.lat * Math.PI) / 180);
  const m = await waterMap(wettest.scene, field, Math.max(MARGIN[0], Math.min(MARGIN[1], 2 * size)));
  const { width, height, mask } = m;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const water = m.rgba[i * 4 + 3] > 200 && m.rgba[i * 4 + 2] > 150;
    rgba.set(water ? [...WATER, 255] : m.radar.subarray(i * 4, i * 4 + 4), i * 4);
  }
  // Two cells wide: the field's edge cells and the cells just outside them.
  const inside = (col, row) => col >= 0 && row >= 0 && col < width && row < height && mask[row * width + col];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const near = [inside(col - 1, row), inside(col + 1, row), inside(col, row - 1), inside(col, row + 1)];
      if (inside(col, row) ? near.some((v) => !v) : near.some(Boolean)) rgba.set([...OUTLINE, 255], (row * width + col) * 4);
    }
  }
  writePng(fileURLToPath(new URL(`examples/${example.id}.png`, ROOT)), rgba, width, height);

  const p = field.properties;
  facts[example.id] = {
    collection: field.collection,
    crop: p['crop:name'] ?? p['hcat:name_en'] ?? null,
    images: points.length,
    date: wettest.scene.date.toISOString().slice(0, 10),
    water: +wettest.water.toFixed(3),
    width,
    height,
    days,
    curve: points.map((x) => [+((x.scene.date - start) / DAY).toFixed(2), +x.water.toFixed(3)]),
  };
  const wet = points.filter((x) => x.water >= 0.2).map((x) => `${x.scene.date.toISOString().slice(5, 10)} ${Math.round(x.water * 100)}%`);
  console.log(example.id, field.collection, facts[example.id].crop, `${points.length} images`, `wettest ${facts[example.id].date}`, wet.join(', '));
}
writeFileSync(FACTS, `${JSON.stringify(facts)}\n`);
