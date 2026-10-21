/**
 * Pre-render the example fields of the season demo with the page's own code: a strip of the field once a
 * month in true colour (season/examples/<id>.png) and its NDVI curve and facts (season/data/examples.json).
 *
 *   node scripts/season/examples.mjs        # every example
 *   node scripts/season/examples.mjs rice   # just these
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromLonLat, transformExtent } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { EXAMPLES } from '../../season/src/examples.js';
import { closeUp, monthlyBest, pool, season, trueColour } from '../../season/src/s2.js';
import { FIELDS_PMTILES, fieldAt, hasCrop, isFields } from '../../shared/fields.js';
import { writePng } from '../png.mjs';

const ROOT = new URL('../../season/', import.meta.url);
const FACTS = new URL('data/examples.json', ROOT);
const DAY = 86400000;
// Cells of 10 m per month in the strip, and the gap between months.
const CELL = 40;
const GAP = 2;

/** Nearest-neighbour resample of the rectangle `r` of an RGBA picture to `side` × `side`. */
function resample(rgba, width, r, side) {
  const out = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = r.x + Math.floor((x * r.width) / side);
      const sy = r.y + Math.floor((y * r.height) / side);
      out.set(rgba.subarray((sy * width + sx) * 4, (sy * width + sx) * 4 + 4), (y * side + x) * 4);
    }
  }
  return out;
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
  const field = await fieldAt(pmtiles, fromLonLat([example.lon, example.lat]), isFields, undefined, (f) => hasCrop(f));
  if (!field) throw new Error(`${example.id}: no field at ${example.lon}, ${example.lat}`);
  const south = example.lat < 0;
  const start = new Date(Date.UTC(south ? example.year - 1 : example.year, south ? 6 : 0, 1));
  const end = new Date(start.getTime() + 365 * DAY - 1);
  const { scenes, points } = await season(field, transformExtent(field.extent, 'EPSG:3857', 'EPSG:4326'), start, end);

  // The strip: twelve squares, one per month of the season, empty where no month had a clear image.
  const monthOf = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth() - (start.getUTCFullYear() * 12 + start.getUTCMonth());
  const months = new Map(monthlyBest(points).map((p) => [monthOf(p.scene.date), p]));
  const width = 12 * CELL + 11 * GAP;
  const strip = new Uint8ClampedArray(width * CELL * 4);
  await pool([...months], 3, async ([m, p]) => {
    const pic = await trueColour(p.scene, field, 60);
    const square = resample(pic.outlined, pic.width, closeUp(pic), CELL);
    for (let y = 0; y < CELL; y++) strip.set(square.subarray(y * CELL * 4, (y + 1) * CELL * 4), (y * width + m * (CELL + GAP)) * 4);
  });
  writePng(fileURLToPath(new URL(`examples/${example.id}.png`, ROOT)), strip, width, CELL);

  const p = field.properties;
  facts[example.id] = {
    collection: field.collection,
    crop: p['crop:name'] ?? p['hcat:name_en'] ?? null,
    crop_en: p['hcat:name_en'] ?? null,
    scenes: scenes.length,
    clear: points.length,
    curve: points.filter((x) => !x.dip).map((x) => [+((x.scene.date - start) / DAY).toFixed(1), +x.ndvi.median.toFixed(3)]),
  };
  console.log(example.id, field.collection, facts[example.id].crop, `${points.length}/${scenes.length}`, `${months.size} months`);
}
writeFileSync(FACTS, `${JSON.stringify(facts)}\n`);
