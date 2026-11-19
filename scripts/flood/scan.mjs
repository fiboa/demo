/**
 * Find flooded fields around a known flood, to pick an example for the flood demo: the wettest Sentinel-1
 * scene over the area in a span of dates, and the fields in it ranked by how much more of them is open water
 * than in the driest scene of the same track (so ponds, rice paddies and lakes that are always wet drop out).
 *
 *   node scripts/flood/scan.mjs <lon> <lat> <radius km> <start> <end> [dry start] [dry end]
 *   node scripts/flood/scan.mjs -95.66 40.60 3 2019-03-10 2019-04-30 2019-08-01 2019-10-31
 *
 * The dry span defaults to the flood span. Prints the scenes with the share of the area under water, then the
 * best fields with a point inside each, to put in flood/src/examples.js.
 */
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { fieldGrid, scenes, thin, waterStats, WATER_DB } from '../../flood/src/s1.js';
import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';
import { readWindow, utm } from '../../shared/planetary.js';

const [lon, lat, radiusKm, start, end, dryStart = start, dryEnd = end] = process.argv.slice(2);
if (!end) {
  console.error('usage: scan.mjs <lon> <lat> <radius km> <start> <end> [dry start] [dry end]');
  process.exit(2);
}
const COLLECTION = 'sentinel-1-rtc';
const CELL = 10;
const STEP = 150; // metres between the points sampled for fields
const MIN_CELLS = 200; // 2 ha: smaller fields are too few radar cells to trust
const r = Number(radiusKm) * 1000;
const [cx, cy] = fromLonLat([Number(lon), Number(lat)]);
const area3857 = [cx - r, cy - r, cx + r, cy + r];
const bbox = transformExtent(area3857, 'EPSG:3857', 'EPSG:4326');

/** Share of the valid cells of the whole area below WATER_DB in one scene, and the share that is valid. */
async function areaWater(scene) {
  const [x0, y0, x1, y1] = transformExtent(area3857, 'EPSG:3857', utm(scene.epsg));
  const window = [x0, y0, x1, y1].map((v) => Math.round(v / CELL) * CELL);
  const [vv] = await readWindow(scene.vv, COLLECTION, window, CELL);
  let valid = 0;
  let wet = 0;
  for (const v of vv) {
    if (!(v > 0)) continue;
    valid++;
    if (10 * Math.log10(v) < WATER_DB) wet++;
  }
  return { water: valid ? wet / valid : 0, valid: valid / vv.length };
}

const span = async (a, b) => thin(await scenes(bbox, new Date(a), new Date(`${b}T23:59:59Z`)));
const flood = await span(start, end);
const dry = dryStart === start && dryEnd === end ? flood : await span(dryStart, dryEnd);
const measured = new Map();
for (const scene of new Set([...flood, ...dry])) {
  const m = await areaWater(scene);
  measured.set(scene, m);
  console.log(scene.date.toISOString().slice(0, 10), scene.orbit, `track ${scene.track}`, `water ${(m.water * 100).toFixed(1)}%`, `valid ${(m.valid * 100).toFixed(0)}%`);
}
const full = (s) => measured.get(s).valid > 0.9;
const wettest = flood.filter(full).reduce((a, b) => (measured.get(b).water > measured.get(a).water ? b : a));
const sameTrack = dry.filter((s) => full(s) && s.track === wettest.track && s !== wettest);
if (!sameTrack.length) throw new Error(`no other full scene of track ${wettest.track} to compare with`);
const driest = sameTrack.reduce((a, b) => (measured.get(b).water < measured.get(a).water ? b : a));
console.log(`\nwettest ${wettest.date.toISOString().slice(0, 10)}, driest of track ${wettest.track} ${driest.date.toISOString().slice(0, 10)}\n`);

// The fields of the area: one lookup per sample point, skipping points inside a field already found.
const pmtiles = new PMTiles(FIELDS_PMTILES);
const fields = new Map();
for (let x = area3857[0]; x <= area3857[2]; x += STEP) {
  for (let y = area3857[1]; y <= area3857[3]; y += STEP) {
    if ([...fields.values()].some((f) => f.field.extent[0] <= x && x <= f.field.extent[2] && f.field.extent[1] <= y && y <= f.field.extent[3])) continue;
    const field = await fieldAt(pmtiles, [x, y], inCatalog, undefined, preferred);
    if (field) fields.set(`${field.collection}/${field.id}`, { field, point: toLonLat([x, y]) });
  }
}

async function share(scene, field) {
  const grid = fieldGrid(field, scene.epsg);
  const [vv] = await readWindow(scene.vv, COLLECTION, grid.bbox, CELL);
  return waterStats(vv, grid.mask);
}

const ranked = [];
for (const [key, { field, point }] of fields) {
  const wet = await share(wettest, field);
  const was = await share(driest, field);
  if (!wet || !was || wet.count < MIN_CELLS) continue;
  ranked.push({ key, point, wet: wet.water, dry: was.water, ha: (wet.count * CELL * CELL) / 1e4, crop: field.properties['crop:name'] ?? field.properties['hcat:name_en'] ?? '' });
}
ranked.sort((a, b) => b.wet - b.dry - (a.wet - a.dry));
console.log(`${fields.size} fields, ${ranked.length} of at least ${(MIN_CELLS * CELL * CELL) / 1e4} ha`);
for (const f of ranked.slice(0, 12)) {
  console.log(`${f.key}  ${f.point[0].toFixed(5)}, ${f.point[1].toFixed(5)}  ${f.ha.toFixed(1)} ha  water ${(f.wet * 100).toFixed(0)}% (dry ${(f.dry * 100).toFixed(0)}%)  ${f.crop}`);
}
