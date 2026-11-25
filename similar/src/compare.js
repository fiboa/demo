/**
 * One comparison, shared by the page and the example script: the fields of an area, the mean AEF embedding of
 * each in a year, and their similarity to the field clicked.
 */
import { fromLonLat } from 'ol/proj.js';

import { chunksOf, cosine, fieldPixels, meanEmbedding, quantile } from './embed.js';
import { fieldsIn, readChunks } from './data.js';

// Fields with fewer pixels than this (0.05 ha at the equator) are too small to say anything about.
export const MIN_PIXELS = 5;

export const cropOf = (properties) => properties['hcat:name_en'] || properties['crop:name'] || null;

/**
 * Compare the field `pick` ("collection/id") with every field in `extent` (EPSG:3857) in `year`. Fields cut by
 * the edge of the extent are compared by the part inside it. Returns null when `pick` is not in the extent, else
 * { field, year, fields: [{ key, collection, id, properties, crop, code, pixels, similarity }], low, chunks }
 * where `chunks` maps "cy/cx" → Int8Array (for the pixel layer) and `low` is the median similarity.
 */
export async function compare(pmtiles, { pick, extent, year, signal, progress = () => {} }) {
  progress('Reading the fields…');
  const all = await fieldsIn(pmtiles, extent, signal);
  const field = all.get(pick);
  if (!field) return null;
  // Collections overlap (Spain and its regions): one field per place, the clicked one first, then those
  // that name their crop in HCAT, then by name.
  const rank = (f) => (f === field ? 3 : f.properties['hcat:name_en'] ? 2 : f.properties['crop:name'] ? 1 : 0);
  const fields = [];
  const keys = new Set();
  const taken = new Set();
  for (const f of [...all.values()].sort((a, b) => rank(b) - rank(a))) {
    const pixels = fieldPixels(f.polygons);
    if (pixels.length < MIN_PIXELS && f !== field) continue;
    if (f !== field && overlap(pixels, taken) > 0.5) continue;
    for (const p of pixels) taken.add(p);
    f.pixels = pixels;
    for (const k of chunksOf(pixels)) keys.add(k);
    fields.push(f);
  }
  const chunks = await readChunks(year, keys, (done, total) => progress(`Reading the embeddings of ${year}: ${done} of ${total} chunks…`));
  const get = (k) => chunks.get(k);
  const mean = meanEmbedding(field.pixels, get);
  if (!mean) return { field, year, fields: [], low: NaN, chunks, query: null };
  const out = [];
  for (const f of fields) {
    const m = f === field ? mean : meanEmbedding(f.pixels, get);
    if (!m) continue;
    out.push({
      key: f.key,
      collection: f.collection,
      id: f.id,
      properties: f.properties,
      crop: cropOf(f.properties),
      code: f.properties['hcat:code'] ?? null,
      pixels: m.count,
      cells: f.pixels,
      similarity: f === field ? 1 : cosine(mean.vector, m.vector),
    });
  }
  const others = out.filter((f) => f.key !== field.key).map((f) => f.similarity).sort((a, b) => a - b);
  return { field, year, fields: out, low: quantile(others, 0.5), chunks, query: mean.vector };
}

/** The share of `pixels` already in `taken`. */
export function overlap(pixels, taken) {
  if (!pixels.length) return 0;
  let n = 0;
  for (const p of pixels) if (taken.has(p)) n++;
  return n / pixels.length;
}

/** A square extent (EPSG:3857) of `size` metres on the ground around lon/lat. */
export function squareAround([lon, lat], size) {
  const [x, y] = fromLonLat([lon, lat]);
  // Web Mercator stretches by 1 / cos(latitude): half a ground size there is this many map units.
  const half = size / 2 / Math.cos((lat * Math.PI) / 180);
  return [x - half, y - half, x + half, y + half];
}
