/**
 * Sentinel-1 radar over one field, from Microsoft Planetary Computer (`sentinel-1-rtc`: backscatter gamma0,
 * terrain corrected, linear power, 10 m in UTM): the scenes of a year, the share of the field that looks like
 * open water in each, and a water map of the surroundings on demand. Calm open water mirrors the radar away
 * and looks dark; land scatters it back.
 */
import { getTransform, transformExtent } from 'ol/proj.js';

import { piecesRings } from '../../shared/fields.js';
import { quantile, unionMask } from '../../shared/mask.js';
import { pool, readWindow, search, utm } from '../../shared/planetary.js';

export { pool };

const COLLECTION = 'sentinel-1-rtc';
// VV backscatter (dB) below which a cell counts as open water.
export const WATER_DB = -18;
// At most one image per this many days: since 2025 two satellites give ~200 a year of ~1 MB each.
export const MIN_GAP_DAYS = 2;
const CELL = 10;
const DAY = 86400000;

const toDb = (v) => 10 * Math.log10(v);

// ------------------------------------------------------------------ scenes

/**
 * The scenes over `bbox` (lon/lat) between `start` and `end`, oldest first: { id, date, orbit ('ascending' or
 * 'descending'), track (relative orbit), epsg, vv } with an unsigned href. A pass is cut into slices that
 * overlap; of the slices of one pass the one that holds the whole field is kept.
 */
export async function scenes(bbox, start, end, signal) {
  const features = await search(
    {
      collections: [COLLECTION],
      bbox,
      datetime: `${start.toISOString()}/${end.toISOString()}`,
      limit: 1000,
      fields: {
        include: [
          'id', 'bbox', 'properties.datetime', 'properties.sat:orbit_state', 'properties.sat:relative_orbit',
          'properties.proj:epsg', 'assets.vv.href',
        ],
        exclude: ['links', 'geometry'],
      },
    },
    signal,
  );
  const holds = (b) => b[0] <= bbox[0] && b[1] <= bbox[1] && b[2] >= bbox[2] && b[3] >= bbox[3];
  const passes = new Map(); // track + minute -> scene
  for (const f of features) {
    // A few scenes are HH/HV only (polar and some sea passes); without VV they are left out.
    if (!f.assets.vv) continue;
    const p = f.properties;
    const scene = {
      id: f.id,
      date: new Date(p.datetime),
      orbit: p['sat:orbit_state'],
      track: p['sat:relative_orbit'],
      epsg: p['proj:epsg'],
      vv: f.assets.vv.href,
      holds: holds(f.bbox),
    };
    const key = `${scene.track}/${p.datetime.slice(0, 13)}`;
    const other = passes.get(key);
    if (!other || (scene.holds && !other.holds)) passes.set(key, scene);
  }
  return [...passes.values()].sort((a, b) => a.date - b.date);
}

/** Thin a date-sorted list to at most one scene per MIN_GAP_DAYS (a few hours' slack), keeping the earliest. */
export function thin(list) {
  const kept = [];
  for (const scene of list) {
    if (!kept.length || scene.date - kept.at(-1).date >= (MIN_GAP_DAYS - 0.25) * DAY) kept.push(scene);
  }
  return kept;
}

/**
 * The order to read a date-sorted list in: coarse to fine (bit-reversed index order), so the curve covers the
 * whole year early and fills in as more images come.
 */
export function readingOrder(list) {
  const bits = Math.ceil(Math.log2(Math.max(2, list.length)));
  const reversed = (i) => {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    return r;
  };
  return list.map((scene, i) => [reversed(i), scene]).sort((a, b) => a[0] - b[0]).map(([, scene]) => scene);
}

// ------------------------------------------------------------------ one scene, one field

/** The grid of the field in a UTM zone: its bbox snapped to 10 m, `margin` metres around it, and its mask. */
export function fieldGrid(field, epsg, margin = 0) {
  const crs = utm(epsg);
  const [x0, y0, x1, y1] = transformExtent(field.extent, 'EPSG:3857', crs);
  const bbox = [
    Math.floor((x0 - margin) / CELL) * CELL,
    Math.floor((y0 - margin) / CELL) * CELL,
    Math.ceil((x1 + margin) / CELL) * CELL,
    Math.ceil((y1 + margin) / CELL) * CELL,
  ];
  const width = Math.round((bbox[2] - bbox[0]) / CELL);
  const height = Math.round((bbox[3] - bbox[1]) / CELL);
  const toUtm = getTransform('EPSG:3857', crs);
  const mask = unionMask(piecesRings(field.pieces, (c) => toUtm(c)), bbox, width, height);
  return { crs, bbox, width, height, mask };
}

/**
 * The field in one image: { water (share of its cells below WATER_DB), vv (median dB), count }, or null when
 * the image holds none of it. Cells without data (0, or the −32768 nodata) are left out.
 */
export function waterStats(vv, mask) {
  const values = [];
  let wet = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !(vv[i] > 0)) continue;
    const db = toDb(vv[i]);
    values.push(db);
    if (db < WATER_DB) wet++;
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return { water: wet / values.length, vv: quantile(values, 0.5), count: values.length };
}

/**
 * The water share of `field` in the scenes of a year (or any span), thinned and read coarse to fine with
 * `parallel` at a time,
 * `onScenes(list)` once listed and `onPoint(point)` as each comes. Resolves to { scenes, points: [{ scene,
 * water, vv, count }] } sorted by date. Scenes that hold less than half the field are left out.
 */
export async function series(field, lonLatBbox, start, end, { signal, onScenes = () => {}, onPoint = () => {}, parallel = 6 } = {}) {
  const list = thin(await scenes(lonLatBbox, start, end, signal));
  onScenes(list);
  const grids = new Map(); // epsg -> grid: a field near a zone edge comes in two zones
  const gridFor = (epsg) => {
    if (!grids.has(epsg)) grids.set(epsg, fieldGrid(field, epsg));
    return grids.get(epsg);
  };
  const points = [];
  await pool(readingOrder(list), parallel, async (scene) => {
    if (signal?.aborted) return;
    const grid = gridFor(scene.epsg);
    let stats;
    try {
      const [vv] = await readWindow(scene.vv, COLLECTION, grid.bbox, CELL, signal);
      stats = waterStats(vv, grid.mask);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(scene.id, error);
      return;
    }
    const inside = grid.mask.reduce((a, b) => a + b, 0);
    if (!stats || stats.count < inside / 2) return;
    const point = { scene, ...stats };
    points.push(point);
    onPoint(point);
  });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  points.sort((a, b) => a.scene.date - b.scene.date);
  return { scenes: list, points };
}

/**
 * The water around the field in one scene, `margin` metres on each side: RGBA with water in `colour`, other
 * land clear and no data grey, plus the bbox and CRS to place it on the map. `radar` is the backscatter
 * itself in grey, for the picture strip.
 */
export async function waterMap(scene, field, margin, signal, colour = [31, 111, 209]) {
  const grid = fieldGrid(field, scene.epsg, margin);
  const [vv] = await readWindow(scene.vv, COLLECTION, grid.bbox, CELL, signal);
  const n = grid.width * grid.height;
  const rgba = new Uint8ClampedArray(n * 4);
  const radar = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (!(vv[i] > 0)) {
      rgba.set([128, 128, 128, 90], i * 4);
      radar.set([128, 128, 128, 255], i * 4);
      continue;
    }
    const db = toDb(vv[i]);
    if (db < WATER_DB) rgba.set([...colour, 220], i * 4);
    // −25 dB black to −5 dB white
    const grey = Math.max(0, Math.min(255, ((db + 25) / 20) * 255));
    radar.set([grey, grey, grey, 255], i * 4);
  }
  return { rgba, radar, width: grid.width, height: grid.height, bbox: grid.bbox, crs: grid.crs, mask: grid.mask };
}

/**
 * The spells of date-sorted `points` with at least `share` of the field under water: runs of such images not
 * broken by a drier one. [{ first, last, most }] with the points that start, end and peak each spell.
 */
export function floodSpells(points, share) {
  const spells = [];
  let open = null;
  for (const p of points) {
    if (p.water >= share) {
      if (!open) {
        open = { first: p, last: p, most: p };
        spells.push(open);
      }
      open.last = p;
      if (p.water > open.most.water) open.most = p;
    } else open = null;
  }
  return spells;
}
