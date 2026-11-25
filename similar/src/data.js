/**
 * Reading the two sources, in the browser and in node alike: the AEF chunks with zarrita, and the fields of an
 * area from the global PMTiles (the z14 tiles, whose pieces of one field are joined by collection and id).
 */
import Feature from 'ol/Feature.js';
import { intersects } from 'ol/extent.js';
import MVT from 'ol/format/MVT.js';
import { toLonLat } from 'ol/proj.js';
import { createXYZ } from 'ol/tilegrid.js';
import * as zarr from 'zarrita';

import { inCatalog } from '../../shared/fields.js';
import { AEF_URL, yearIndex } from './embed.js';

// ------------------------------------------------------------------ embeddings

let array;
const chunks = new Map();

const TIMEOUT = 10000;
const TRIES = 3;

/**
 * fetch for zarrita that gives up on a request after TIMEOUT and tries again: now and then one range request
 * to Source Cooperative never answers, which would hold up the whole comparison.
 */
async function patientFetch(request) {
  for (let attempt = 1; ; attempt++) {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT)].filter(Boolean));
    try {
      const response = await fetch(new Request(request, { signal }));
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, headers: response.headers });
    } catch (error) {
      if (attempt >= TRIES || request.signal?.aborted) throw error;
    }
  }
}

/** The AEF embeddings array, opened once. */
function embeddings() {
  const store = new zarr.FetchStore(AEF_URL, { fetch: patientFetch, useSuffixRequest: true });
  array ??= zarr.open(zarr.root(store).resolve('embeddings'), { kind: 'array' });
  return array;
}

/**
 * The Int8Array of chunk "cy/cx" for a calendar year (64 × 256 × 256, band-major), cached. A chunk is about
 * 2 MB to download; a failed one is forgotten, so a later try fetches it again.
 */
export function readChunk(year, key) {
  const id = `${yearIndex(year)}/${key}`;
  if (!chunks.has(id)) {
    const [cy, cx] = key.split('/').map(Number);
    chunks.set(
      id,
      embeddings()
        .then((a) => a.getChunk([yearIndex(year), 0, cy, cx]))
        .then((c) => c.data)
        .catch((error) => {
          chunks.delete(id);
          throw error;
        }),
    );
    // Keep the memory bounded: a chunk is 4 MB unpacked.
    if (chunks.size > 48) chunks.delete(chunks.keys().next().value);
  }
  return chunks.get(id);
}

/**
 * Read the chunks `keys` of a year, a few at a time, calling `progress(done, total)` after each. Returns a
 * Map key → Int8Array; chunks that failed are left out.
 */
export async function readChunks(year, keys, progress = () => {}, parallel = 6) {
  const list = [...keys];
  const out = new Map();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const key = list[next++];
      try {
        out.set(key, await readChunk(year, key));
      } catch {
        // left out: its pixels count as without data
      }
      progress(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, worker));
  return out;
}

// ------------------------------------------------------------------ fields

const Z = 14;
const grid = createXYZ({ maxZoom: Z });
const format = new MVT({ featureClass: Feature });
export const MAX_TILES = 30;

/**
 * The fields of the published catalog that reach into `extent` (EPSG:3857), from the z14 tiles of the global
 * PMTiles.
 * Returns a Map "collection/id" → { key, collection, id, properties, polygons } with the polygons in lon/lat
 * (each a list of rings); the pieces of one field cut by the tiles overlap a little, which does no harm.
 * Throws when the extent needs more than MAX_TILES tiles.
 */
export async function fieldsIn(pmtiles, extent, signal) {
  const [, x0, y0] = grid.getTileCoordForCoordAndZ([extent[0], extent[3]], Z);
  const [, x1, y1] = grid.getTileCoordForCoordAndZ([extent[2], extent[1]], Z);
  const tiles = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
  if (tiles.length > MAX_TILES) throw new Error(`too large an area: ${tiles.length} tiles`);
  const fields = new Map();
  await Promise.all(
    tiles.map(async ([x, y]) => {
      const tile = await pmtiles.getZxy(Z, x, y, signal);
      if (!tile) return;
      const features = format.readFeatures(tile.data, {
        extent: grid.getTileCoordExtent([Z, x, y]),
        featureProjection: 'EPSG:3857',
      });
      for (const f of features) {
        const collection = f.get('collection');
        if (!inCatalog(collection)) continue;
        const geometry = f.getGeometry();
        if (!intersects(geometry.getExtent(), extent)) continue;
        const type = geometry.getType();
        if (type !== 'Polygon' && type !== 'MultiPolygon') continue;
        const key = `${collection}/${f.get('id')}`;
        if (!fields.has(key)) {
          const properties = { ...f.getProperties() };
          delete properties.geometry;
          fields.set(key, { key, collection, id: f.get('id'), properties, polygons: [] });
        }
        const polygons = type === 'Polygon' ? [geometry.getCoordinates()] : geometry.getCoordinates();
        for (const rings of polygons) fields.get(key).polygons.push(rings.map((ring) => ring.map((c) => toLonLat(c))));
      }
    }),
  );
  return fields;
}
