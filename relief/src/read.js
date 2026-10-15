/** The heights of one field, read from the first height model that covers it: shared by the page and by
 * scripts/relief/examples.mjs, which pre-renders the example pictures. */
import { getCenter } from 'ol/extent.js';
import { getTransform, toLonLat, transformExtent } from 'ol/proj.js';
import { getDistance } from 'ol/sphere.js';

import { demsFor, heights } from './dems.js';
import { piecesRings } from './fields.js';
import { heightStats, requestGrid, snapBbox, unionMask } from './relief.js';

// A height model is taken when it has heights for at least this share of the field.
const ENOUGH = 0.5;

/**
 * The cell size, in `crs` units, of `metres` on the ground at map coordinate `at`. Most height models are
 * read in a metric grid of their own, where this is close to `metres`; in Web Mercator it is larger.
 */
function cellIn(crs, at, metres) {
  const toCrs = getTransform('EPSG:3857', crs);
  const fromCrs = getTransform(crs, 'EPSG:4326');
  const [x, y] = toCrs(at);
  const ground = getDistance(fromCrs([x, y]), fromCrs([x + 100, y]));
  return (metres * 100) / ground;
}

/**
 * Heights of `field` from `dem` in a grid of at most `maxSide` cells a side. Returns { dem, grid, mask, stats,
 * cell (in ground metres), share (of the field with a measurement) }.
 */
async function readField(field, dem, { signal, maxSide } = {}) {
  const centre = getCenter(field.extent);
  const native = cellIn(dem.crs, centre, dem.res);
  const bbox = snapBbox(transformExtent(field.extent, 'EPSG:3857', dem.crs), native, 2 * native);
  const size = requestGrid(bbox, native, maxSide);
  const grid = await heights(dem, bbox, size.width, size.height, signal);
  const toDem = getTransform('EPSG:3857', dem.crs);
  const mask = unionMask(piecesRings(field.pieces, (c) => toDem(c)), grid.bbox, grid.width, grid.height);
  const stats = heightStats(grid.values, mask);
  const inside = stats.count + stats.missing;
  const cellCrs = (grid.bbox[2] - grid.bbox[0]) / grid.width;
  return { dem, grid, mask, stats, cell: (cellCrs * dem.res) / native, share: inside ? stats.count / inside : 0 };
}

/**
 * Try the height models for this field in order and keep the first that measured most of it; null when none
 * did. `onTry(dem)` is called before each attempt. A model that fails is skipped.
 */
export async function fieldRelief(field, { signal, maxSide, onTry = () => {} } = {}) {
  let best = null;
  for (const dem of demsFor(field.collection, toLonLat(getCenter(field.extent)))) {
    onTry(dem);
    let result;
    try {
      result = await readField(field, dem, { signal, maxSide });
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(dem.name, error);
      continue;
    }
    if (!best || result.share > best.share) best = result;
    if (result.share >= ENOUGH) break;
  }
  return best && best.share >= ENOUGH ? best : null;
}
