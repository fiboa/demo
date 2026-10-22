/**
 * Pre-render the examples of the rotation demo with the page's own colours: a few kilometres of fields around
 * each example in its view, the example's field outlined (rotation/examples/<id>.png), and the field's years
 * (rotation/data/examples.json).
 *
 *   node scripts/rotation/examples.mjs                   # every example, from Source Coop
 *   node scripts/rotation/examples.mjs flevoland         # just these
 *   PMTILES=rotation.pmtiles node scripts/rotation/examples.mjs    # from a local copy of the archive
 */
import { mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Feature from 'ol/Feature.js';
import MVT from 'ol/format/MVT.js';
import { fromLonLat } from 'ol/proj.js';
import { createXYZ } from 'ol/tilegrid.js';
import { PMTiles } from 'pmtiles';

import { GROUP, groupIn, series, share, shareStep, varied, variedStep } from '../../rotation/src/crops.js';
import { EXAMPLES } from '../../rotation/src/examples.js';
import { ROTATION_PMTILES } from '../../rotation/src/view.js';
import { fieldAt } from '../../shared/fields.js';
import { polygonMask } from '../../shared/mask.js';
import { writePng } from '../png.mjs';

const ROOT = new URL('../../rotation/', import.meta.url);
const FACTS = new URL('data/examples.json', ROOT);
const WIDTH = 640;
const HEIGHT = 400;
const Z = 14;
const BACKGROUND = [233, 236, 233];
const EDGE = [255, 255, 255];
const BLANK = [214, 220, 215];
const OUTLINE = [35, 51, 43];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** The page's colour of a series in an example's view, as in rotation/src/main.js. */
function colourOf(list, { view, group, year }) {
  if (view === 'varied') return varied(list) == null ? null : variedStep(varied(list));
  if (view === 'often') return share(list, group) == null ? null : shareStep(share(list, group));
  const g = groupIn(list, year);
  return g ? GROUP[g].colour : null;
}

/** A local archive file as a pmtiles Source. */
function fileSource(path) {
  const fd = openSync(path, 'r');
  return {
    getKey: () => path,
    async getBytes(offset, length) {
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, offset);
      return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length) };
    },
  };
}

const only = process.argv.slice(2);
const pmtiles = new PMTiles(process.env.PMTILES ? fileSource(process.env.PMTILES) : ROTATION_PMTILES);
const grid = createXYZ({ maxZoom: Z });
const format = new MVT({ featureClass: Feature });
let facts = {};
try {
  facts = JSON.parse(readFileSync(FACTS, 'utf8'));
} catch {
  // first run
}
mkdirSync(new URL('examples/', ROOT), { recursive: true });

for (const example of EXAMPLES.filter((e) => !only.length || only.includes(e.id))) {
  const centre = fromLonLat([example.lon, example.lat]);
  const field = await fieldAt(pmtiles, centre, () => true);
  if (!field) throw new Error(`${example.id}: no field at ${example.lon}, ${example.lat}`);
  const res = grid.getResolution(0) / 2 ** example.zoom;
  const extent = [centre[0] - (WIDTH / 2) * res, centre[1] - (HEIGHT / 2) * res, centre[0] + (WIDTH / 2) * res, centre[1] + (HEIGHT / 2) * res];

  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) rgba.set([...BACKGROUND, 255], i * 4);
  const outline = new Uint8Array(WIDTH * HEIGHT);

  // Every field piece of every tile, each rasterised in its own window, clipped to its tile.
  const tiles = [];
  grid.forEachTileCoord(extent, Z, (c) => tiles.push(c));
  for (const [z, x, y] of tiles) {
    const tile = await pmtiles.getZxy(z, x, y);
    if (!tile) continue;
    const tileExtent = grid.getTileCoordExtent([z, x, y]);
    for (const f of format.readFeatures(tile.data, { extent: tileExtent, featureProjection: 'EPSG:3857' })) {
      const e = f.getGeometry().getExtent();
      const c0 = Math.max(0, Math.floor((Math.max(e[0], tileExtent[0]) - extent[0]) / res));
      const c1 = Math.min(WIDTH, Math.ceil((Math.min(e[2], tileExtent[2]) - extent[0]) / res));
      const r0 = Math.max(0, Math.floor((extent[3] - Math.min(e[3], tileExtent[3])) / res));
      const r1 = Math.min(HEIGHT, Math.ceil((extent[3] - Math.max(e[1], tileExtent[1])) / res));
      if (c1 <= c0 || r1 <= r0) continue;
      const w = c1 - c0;
      const h = r1 - r0;
      const box = [extent[0] + c0 * res, extent[3] - r1 * res, extent[0] + c1 * res, extent[3] - r0 * res];
      const g = f.getGeometry();
      const polygons = g.getType() === 'MultiPolygon' ? g.getCoordinates() : [g.getCoordinates()];
      const mask = new Uint8Array(w * h);
      for (const rings of polygons) {
        const part = polygonMask(rings, box, w, h);
        for (let i = 0; i < mask.length; i++) mask[i] |= part[i];
      }
      // Cut to the tile, so the buffer's straight cut edges do not show.
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const mx = box[0] + (col + 0.5) * res;
          const my = box[3] - (row + 0.5) * res;
          if (mx < tileExtent[0] || mx >= tileExtent[2] || my < tileExtent[1] || my >= tileExtent[3]) mask[row * w + col] = 0;
        }
      }
      const colour = colourOf(series({ y0: f.get('y0'), crops: f.get('crops') }), example.view);
      const fill = colour ? hex(colour) : BLANK;
      const mine = f.get('collection') === field.collection && f.get('id') === field.id;
      const inside = (col, row) => col >= 0 && row >= 0 && col < w && row < h && mask[row * w + col];
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          if (!mask[row * w + col]) continue;
          const i = (r0 + row) * WIDTH + c0 + col;
          if (mine) outline[i] = 1;
          // A pixel on the field's edge in white, unless the edge is the tile's.
          const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dc, dr]) => {
            const mx = box[0] + (col + dc + 0.5) * res;
            const my = box[3] - (row + dr + 0.5) * res;
            const inTile = mx >= tileExtent[0] && mx < tileExtent[2] && my >= tileExtent[1] && my < tileExtent[3];
            return inTile && !inside(col + dc, row + dr);
          });
          rgba.set([...(edge ? EDGE : fill), 255], i * 4);
        }
      }
    }
  }
  // The example's field as on the page: a dark line along its edge, just outside, in a white halo.
  const isIn = (col, row) => col >= 0 && row >= 0 && col < WIDTH && row < HEIGHT && outline[row * WIDTH + col];
  const within = (col, row, d) => {
    for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) if (dc * dc + dr * dr <= d * d + 1 && isIn(col + dc, row + dr)) return true;
    return false;
  };
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (isIn(col, row)) continue;
      if (within(col, row, 2)) rgba.set([...OUTLINE, 255], (row * WIDTH + col) * 4);
      else if (within(col, row, 4)) rgba.set([...EDGE, 255], (row * WIDTH + col) * 4);
    }
  }
  writePng(fileURLToPath(new URL(`examples/${example.id}.png`, ROOT)), rgba, WIDTH, HEIGHT);

  const p = field.properties;
  facts[example.id] = { collection: field.collection, crop: p.crop, y0: p.y0, crops: p.crops, width: WIDTH, height: HEIGHT };
  console.log(example.id, field.collection, p.crop, p.y0, p.crops);
}
writeFileSync(FACTS, `${JSON.stringify(facts)}\n`);
