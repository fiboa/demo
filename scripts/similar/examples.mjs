/**
 * Pre-render the example fields of the similar demo with the page's own code: one PNG per example in
 * similar/examples/<id>.png and the counts in similar/data/examples.json.
 *
 *   node scripts/similar/examples.mjs          # every example
 *   node scripts/similar/examples.mjs jaen     # just these
 *
 * With ImageMagick (`magick`) on the path, each picture is reduced to a 64-colour palette.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromLonLat } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';
import { compare, squareAround } from '../../similar/src/compare.js';
import { sameCrop } from '../../similar/src/embed.js';
import { EXAMPLES } from '../../similar/src/examples.js';
import { picture } from '../../similar/src/picture.js';
import { writePng } from '../png.mjs';

const ROOT = new URL('../../similar/', import.meta.url);
const FACTS = new URL('data/examples.json', ROOT);
const AREA = 3000; // as on the page
const SIDE = 480;

const only = process.argv.slice(2);
const pmtiles = new PMTiles(FIELDS_PMTILES);
let facts = {};
try {
  facts = JSON.parse(readFileSync(FACTS, 'utf8'));
} catch {
  // first run
}
mkdirSync(new URL('examples/', ROOT), { recursive: true });
mkdirSync(new URL('data/', ROOT), { recursive: true });

for (const example of EXAMPLES.filter((e) => !only.length || only.includes(e.id))) {
  const point = [example.lon, example.lat];
  const field = await fieldAt(pmtiles, fromLonLat(point), inCatalog, undefined, preferred);
  if (!field) throw new Error(`${example.id}: no field at ${point}`);
  const extent = squareAround(point, AREA);
  const started = Date.now();
  const result = await compare(pmtiles, { pick: `${field.collection}/${field.id}`, extent, year: example.year });
  const chosen = result.fields.find((f) => f.key === result.field.key);
  const others = result.fields.filter((f) => f.key !== result.field.key);
  const same = sameCrop(chosen, others);
  const file = fileURLToPath(new URL(`examples/${example.id}.png`, ROOT));
  writePng(file, picture(result, extent, SIDE), SIDE, SIDE);
  try {
    execFileSync('magick', [file, '-colors', '64', `PNG8:${file}`]);
  } catch {
    // keep the full PNG
  }
  const ranked = [...others].sort((a, b) => b.similarity - a.similarity).slice(0, same?.top ?? 20);
  facts[example.id] = {
    collection: field.collection,
    crop: chosen.crop,
    year: example.year,
    fields: others.length,
    hits: same?.hits ?? null,
    top: same?.top ?? null,
    base: same?.base ?? null,
    median: +result.low.toFixed(3),
    top_crops: Object.entries(ranked.reduce((n, f) => ({ ...n, [f.crop]: (n[f.crop] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
  };
  console.log(example.id, field.collection, chosen.crop, `${same?.hits}/${same?.top} vs ${same?.base}/${others.length}`, `${Date.now() - started} ms`);
}
writeFileSync(FACTS, `${JSON.stringify(facts, null, 1)}\n`);
