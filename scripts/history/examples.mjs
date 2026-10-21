/**
 * Pre-render the examples of the history demo: one split picture per example, the old map on the left and
 * today's aerial photo on the right, with today's fields over both, in history/examples/<id>.jpg. Tiles come
 * from the same sources as the page (history/src/maps.js), warped where needed; ImageMagick (`magick`)
 * decodes the tiles and writes the JPEG.
 *
 *   node scripts/history/examples.mjs                         # every example
 *   node scripts/history/examples.mjs urk                     # just these
 *   node scripts/history/examples.mjs --at 4.68,52.31,12,topotijdreis,1850 out.jpg   # try a place
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Feature from 'ol/Feature.js';
import MVT from 'ol/format/MVT.js';
import { fromLonLat, get as getProjection, getTransform, toLonLat } from 'ol/proj.js';
import { createXYZ } from 'ol/tilegrid.js';
import { PMTiles } from 'pmtiles';

import { EXAMPLES } from '../../history/src/examples.js';
import { TODAY, WORLD_IMAGERY, mapById, nearestYear, regionAt } from '../../history/src/maps.js';
import { FIELDS_PMTILES, isFields } from '../../shared/fields.js';

const ROOT = new URL('../../history/', import.meta.url);
const WIDTH = 640;
const HEIGHT = 400;
const WEB = getProjection('EPSG:3857');
// The colour of the field outlines on the page.
const FIELD = [255, 61, 187];

/** Run `fn` over `items`, `size` at a time. */
async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function fetchRetry(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'fiboa-demo examples (https://github.com/fiboa/demo)' } });
      if (res.status === 404 || res.status === 204) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      if (i >= tries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

/** A tile image as 256 × 256 RGBA, or null when the service has none. */
function decode(buffer, size) {
  if (!buffer?.length) return null;
  try {
    return execFileSync('magick', ['-', '-alpha', 'on', '-resize', `${size}x${size}!`, '-depth', '8', 'rgba:-'], {
      input: buffer,
      maxBuffer: 1 << 24,
    });
  } catch {
    return null;
  }
}

/**
 * Draw `source` into the rectangle [x0, x1) of the picture whose pixels cover `extent` (EPSG:3857), each pixel
 * sampled bilinearly from the tiles of the nearest level, transformed into the source's projection. With
 * `inside(i)`, only the pixels with index i that pass.
 */
async function drawSource(rgba, source, extent, x0, x1, inside = () => true) {
  const projection = source.getProjection() ?? WEB;
  const grid = source.getTileGridForProjection(projection);
  const toSource = getTransform(WEB, projection);
  const res = (extent[2] - extent[0]) / WIDTH;
  // Metres on the ground per web mercator unit, for sources in a metric national grid.
  const lat = Math.atan(Math.sinh((extent[1] + extent[3]) / 2 / 6378137));
  const sourceRes = projection === WEB ? res : res * Math.cos(lat);
  const z = Math.min(grid.getMaxZoom(), grid.getZForResolution(sourceRes, 0));
  const tileRes = grid.getResolution(z);
  const size = grid.getTileSize(z);
  const sample = new Map(); // pixel -> [tile key, x, y]
  const needed = new Map();
  for (let py = 0; py < HEIGHT; py++) {
    for (let px = x0; px < x1; px++) {
      if (!inside(py * WIDTH + px)) continue;
      const c = toSource([extent[0] + (px + 0.5) * res, extent[3] - (py + 0.5) * res]);
      const [, tx, ty] = grid.getTileCoordForCoordAndZ(c, z);
      const tileExtent = grid.getTileCoordExtent([z, tx, ty]);
      const key = `${tx}/${ty}`;
      needed.set(key, [z, tx, ty]);
      sample.set(py * WIDTH + px, [key, (c[0] - tileExtent[0]) / tileRes - 0.5, (tileExtent[3] - c[1]) / tileRes - 0.5]);
    }
  }
  const tiles = new Map();
  const url = source.getTileUrlFunction();
  await pool([...needed], 6, async ([key, coord]) => {
    tiles.set(key, decode(await fetchRetry(url(coord, 1, projection)), size));
  });
  for (const [i, [key, fx, fy]] of sample) {
    const tile = tiles.get(key);
    if (!tile) continue;
    const xa = Math.max(0, Math.min(size - 1, Math.floor(fx)));
    const ya = Math.max(0, Math.min(size - 1, Math.floor(fy)));
    const xb = Math.min(size - 1, xa + 1);
    const yb = Math.min(size - 1, ya + 1);
    const wx = Math.max(0, Math.min(1, fx - xa));
    const wy = Math.max(0, Math.min(1, fy - ya));
    const alpha = tile[(ya * size + xa) * 4 + 3];
    if (alpha < 8) continue; // transparent: keep what lies under it
    for (let b = 0; b < 3; b++) {
      const v = (x, y) => tile[(y * size + x) * 4 + b];
      const top = v(xa, ya) * (1 - wx) + v(xb, ya) * wx;
      const bottom = v(xa, yb) * (1 - wx) + v(xb, yb) * wx;
      rgba[i * 4 + b] = top * (1 - wy) + bottom * wy;
    }
    rgba[i * 4 + 3] = 255;
  }
}

/**
 * Today's fields in `extent`, as rings of picture pixels, each with the pixel box of its tile: tiles cut the
 * fields at their edges (with a buffer), and only the part inside the tile is drawn, as OpenLayers does.
 */
async function fieldRings(pmtiles, extent) {
  const res = (extent[2] - extent[0]) / WIDTH;
  const grid = createXYZ({ maxZoom: 14 });
  const format = new MVT({ featureClass: Feature });
  const rings = [];
  const coords = [];
  grid.forEachTileCoord(extent, 14, (c) => coords.push(c));
  await pool(coords, 8, async ([z, x, y]) => {
    const tile = await pmtiles.getZxy(z, x, y);
    if (!tile) return;
    const features = format.readFeatures(tile.data, { extent: grid.getTileCoordExtent([z, x, y]), featureProjection: 'EPSG:3857' });
    for (const f of features) {
      if (!isFields(f.get('collection'))) continue;
      const g = f.getGeometry();
      const polygons = g.getType() === 'MultiPolygon' ? g.getCoordinates() : [g.getCoordinates()];
      const [tx0, ty0, tx1, ty1] = grid.getTileCoordExtent([z, x, y]);
      const box = [(tx0 - extent[0]) / res, (extent[3] - ty1) / res, (tx1 - extent[0]) / res, (extent[3] - ty0) / res];
      for (const polygon of polygons) {
        for (const ring of polygon) rings.push({ box, points: ring.map(([cx, cy]) => [(cx - extent[0]) / res, (extent[3] - cy) / res]) });
      }
    }
  });
  return rings;
}

/** Blend `colour` into the pixel at (x, y) with weight `a`. */
function blend(rgba, x, y, colour, a) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || a <= 0) return;
  const i = (y * WIDTH + x) * 4;
  for (let b = 0; b < 3; b++) rgba[i + b] = rgba[i + b] * (1 - a) + colour[b] * a;
}

/** A line about `width` px wide, anti-aliased by distance, inside the pixel box `box`: enough for outlines. */
function line(rgba, [ax, ay], [bx, by], colour, width, box = [0, 0, WIDTH, HEIGHT]) {
  const half = width / 2;
  const [minX, maxX] = [Math.floor(Math.min(ax, bx) - half - 1), Math.ceil(Math.max(ax, bx) + half + 1)];
  const [minY, maxY] = [Math.floor(Math.min(ay, by) - half - 1), Math.ceil(Math.max(ay, by) + half + 1)];
  if (maxX < 0 || maxY < 0 || minX >= WIDTH || minY >= HEIGHT) return;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = Math.max(0, minY, Math.ceil(box[1] - 0.5)); y <= Math.min(HEIGHT - 1, maxY, Math.floor(box[3] - 0.5)); y++) {
    for (let x = Math.max(0, minX, Math.ceil(box[0] - 0.5)); x <= Math.min(WIDTH - 1, maxX, Math.floor(box[2] - 0.5)); x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len2));
      const d = Math.hypot(x + 0.5 - (ax + t * dx), y + 0.5 - (ay + t * dy));
      blend(rgba, x, y, colour, Math.min(1, half + 0.5 - d));
    }
  }
}

/** The split picture of one place: { lon, lat, zoom, map, year }. */
async function render(place, pmtiles, file) {
  const old = mapById(place.map);
  const year = nearestYear(old, place.year);
  const res = 156543.03392804097 / 2 ** place.zoom;
  const [cx, cy] = fromLonLat([place.lon, place.lat]);
  const extent = [cx - (WIDTH / 2) * res, cy - (HEIGHT / 2) * res, cx + (WIDTH / 2) * res, cy + (HEIGHT / 2) * res];
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(233);
  const half = WIDTH / 2;
  // Today as on the page: Esri's photos, and each national one inside its region.
  await drawSource(rgba, WORLD_IMAGERY(), extent, half, WIDTH);
  const regions = new Array(WIDTH * HEIGHT);
  for (let py = 0; py < HEIGHT; py++) {
    for (let px = half; px < WIDTH; px++) {
      regions[py * WIDTH + px] = regionAt(toLonLat([extent[0] + (px + 0.5) * res, extent[3] - (py + 0.5) * res]));
    }
  }
  for (const region of new Set(regions)) {
    if (TODAY[region]) await drawSource(rgba, TODAY[region](), extent, half, WIDTH, (i) => regions[i] === region);
  }
  await drawSource(rgba, old.source(year), extent, 0, half);
  for (const { box, points } of await fieldRings(pmtiles, extent)) {
    for (let i = 1; i < points.length; i++) line(rgba, points[i - 1], points[i], FIELD, place.zoom < 13 ? 0.8 : 1.2, box);
  }
  for (let y = 0; y < HEIGHT; y++) for (let x = half - 1; x <= half + 1; x++) blend(rgba, x, y, [255, 255, 255], 1);
  execFileSync('magick', ['-size', `${WIDTH}x${HEIGHT}`, '-depth', '8', 'rgba:-', '-quality', '80', '-strip', file], {
    input: Buffer.from(rgba.buffer),
  });
  console.log(file, old.id, year ?? old.period);
}

const pmtiles = new PMTiles(FIELDS_PMTILES);
const args = process.argv.slice(2);
if (args[0] === '--at') {
  const [lon, lat, zoom, map, year] = args[1].split(',');
  await render({ lon: +lon, lat: +lat, zoom: +zoom, map, year: year ? +year : null }, pmtiles, args[2] ?? 'try.jpg');
} else {
  mkdirSync(new URL('examples/', ROOT), { recursive: true });
  for (const example of EXAMPLES.filter((e) => !args.length || args.includes(e.id))) {
    await render(example, pmtiles, fileURLToPath(new URL(`examples/${example.id}.jpg`, ROOT)));
  }
}
