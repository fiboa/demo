/**
 * Sentinel-2 over one field, from Microsoft Planetary Computer: the scenes of a season, the NDVI of the field
 * in each clear one, and a true-colour picture on demand. Everything is read straight from the COGs, a small
 * window around the field.
 */
import { fromUrl } from 'geotiff';
import { getTransform, transformExtent } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';

import { piecesRings } from '../../shared/fields.js';
import { quantile, unionMask } from '../../shared/mask.js';

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const TOKEN = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a';
// Scenes this cloudy are left unread: the field is almost never clear in them.
export const MAX_SCENE_CLOUD = 60;
// A field counts as clear in a scene when this share of it has a clear scene classification.
export const MIN_CLEAR = 0.8;
// One measurement per this many days is enough for the curve; nearby scenes are not read.
export const SPACING_DAYS = 4;
// Scene classification (SCL) classes that see the ground: vegetation, bare soil, water, unclassified.
const CLEAR = new Set([4, 5, 6, 7]);
const DAY = 86400000;

// ------------------------------------------------------------------ access

let token = null; // Promise of { token, expires (ms) }

async function fetchToken() {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(TOKEN);
    if (response.ok) {
      const json = await response.json();
      return { token: json.token, expires: Date.parse(json['msft:expiry']) };
    }
    if (attempt === 2) throw new Error(`Planetary Computer token: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}

/** The anonymous read token for the Sentinel-2 container, shared and renewed a few minutes before it runs out. */
async function sasToken() {
  const current = token && (await token.catch(() => null));
  if (!current || current.expires - Date.now() < 5 * 60000) {
    token = fetchToken();
    return (await token).token;
  }
  return current.token;
}

/** Register the UTM zone of a scene (EPSG:326xx north, 327xx south) with OpenLayers. */
export function utm(epsg) {
  const code = `EPSG:${epsg}`;
  if (!proj4.defs(code)) {
    const zone = epsg % 100;
    proj4.defs(code, `+proj=utm +zone=${zone}${epsg >= 32700 ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`);
    register(proj4);
  }
  return code;
}

// ------------------------------------------------------------------ scenes

/**
 * The MGRS tile to read the field from: the one whose scenes most often hold the field's whole lon/lat bbox.
 * Neighbouring tiles overlap by 10 km, so a field near an edge is in two; one tile keeps the series even.
 */
export function chooseTile(items, bbox) {
  const score = new Map();
  for (const item of items) {
    const tile = item.properties['s2:mgrs_tile'];
    const [x0, y0, x1, y1] = item.bbox;
    const holds = x0 <= bbox[0] && y0 <= bbox[1] && x1 >= bbox[2] && y1 >= bbox[3];
    const [h, n] = score.get(tile) ?? [0, 0];
    score.set(tile, [h + holds, n + 1]);
  }
  let best = null;
  for (const [tile, s] of score) {
    const b = best && score.get(best);
    if (!b || s[0] > b[0] || (s[0] === b[0] && s[1] > b[1])) best = tile;
  }
  return best;
}

/** From processing baseline 04.00 (January 2022) on, the digital numbers carry an offset of 1000. */
export function dnOffset(baseline) {
  return Number.parseFloat(baseline) >= 4 ? 1000 : 0;
}

/**
 * The scenes over `bbox` (lon/lat) between `start` and `end` (Date), from one tile, oldest first: { id, date,
 * cloud, epsg, offset, assets: { red, nir, scl, visual } } with unsigned hrefs.
 */
export async function scenes(bbox, start, end, signal) {
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox,
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: 1000,
    fields: {
      include: [
        'id', 'bbox', 'properties.datetime', 'properties.eo:cloud_cover', 'properties.s2:mgrs_tile',
        'properties.proj:epsg', 'properties.s2:processing_baseline',
        'assets.B04.href', 'assets.B08.href', 'assets.SCL.href', 'assets.visual.href',
      ],
      exclude: ['links', 'geometry'],
    },
  };
  const response = await fetch(STAC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Planetary Computer search: ${response.status}`);
  const { features } = await response.json();
  const tile = chooseTile(features, bbox);
  const byDate = new Map(); // reprocessed scenes repeat a date: keep one
  for (const f of features) {
    if (f.properties['s2:mgrs_tile'] !== tile) continue;
    const p = f.properties;
    byDate.set(p.datetime.slice(0, 10), {
      id: f.id,
      date: new Date(p.datetime),
      cloud: p['eo:cloud_cover'],
      epsg: p['proj:epsg'],
      offset: dnOffset(p['s2:processing_baseline']),
      assets: { red: f.assets.B04.href, nir: f.assets.B08.href, scl: f.assets.SCL.href, visual: f.assets.visual.href },
    });
  }
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}

/**
 * The order to read scenes in: clearest first, so the curve fills with good points early. Scenes over
 * MAX_SCENE_CLOUD are left out.
 */
export function readingOrder(list) {
  return list.filter((s) => s.cloud <= MAX_SCENE_CLOUD).sort((a, b) => a.cloud - b.cloud);
}

/** Whether a measurement already lies within SPACING_DAYS of `date`. */
export function covered(date, measured) {
  return measured.some((d) => Math.abs(d - date) < SPACING_DAYS * DAY);
}

// ------------------------------------------------------------------ one scene, one field

/**
 * The grid of the field in the scene's UTM zone: a bbox snapped to the 20 m cells of the scene
 * classification (so each of its cells is exactly 2 × 2 cells of 10 m), and the field's mask at 10 m.
 */
export function fieldGrid(field, epsg) {
  const crs = utm(epsg);
  const [x0, y0, x1, y1] = transformExtent(field.extent, 'EPSG:3857', crs);
  const bbox = [Math.floor(x0 / 20) * 20, Math.floor(y0 / 20) * 20, Math.ceil(x1 / 20) * 20, Math.ceil(y1 / 20) * 20];
  const width = (bbox[2] - bbox[0]) / 10;
  const height = (bbox[3] - bbox[1]) / 10;
  const toUtm = getTransform('EPSG:3857', crs);
  const mask = unionMask(piecesRings(field.pieces, (c) => toUtm(c)), bbox, width, height);
  return { crs, bbox, width, height, mask };
}

async function readWindow(href, bbox, cell, signal) {
  const tiff = await fromUrl(`${href}?${await sasToken()}`, {}, signal);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin();
  const window = [
    Math.round((bbox[0] - ox) / cell),
    Math.round((oy - bbox[3]) / cell),
    Math.round((bbox[2] - ox) / cell),
    Math.round((oy - bbox[1]) / cell),
  ];
  return image.readRasters({ window, interleave: false, signal, fillValue: 0 });
}

/** Per 10 m cell: whether the scene classification sees the ground there. */
export function clearCells(scl, grid) {
  const clear = new Uint8Array(grid.width * grid.height);
  const sw = grid.width / 2;
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      clear[row * grid.width + col] = CLEAR.has(scl[(row >> 1) * sw + (col >> 1)]) ? 1 : 0;
    }
  }
  return clear;
}

/** Share of the field's cells that are clear. */
export function clearShare(clear, mask) {
  let inside = 0;
  let ok = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    inside++;
    ok += clear[i];
  }
  return inside ? ok / inside : 0;
}

/** NDVI of the clear cells inside the field: { median, p25, p75, count }, or null without any. */
export function ndviStats(red, nir, clear, mask, offset) {
  const values = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !clear[i] || !red[i] || !nir[i]) continue;
    const r = red[i] - offset;
    const n = nir[i] - offset;
    if (r + n <= 0) continue;
    values.push((n - r) / (n + r));
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return { median: quantile(values, 0.5), p25: quantile(values, 0.25), p75: quantile(values, 0.75), count: values.length };
}

/**
 * The field in one scene: { clear (share), ndvi: {median, p25, p75, count} | null }. Red and near infrared
 * are only read when at least MIN_CLEAR of the field is clear and `wanted()`, asked after the cheap scene
 * classification, still says yes.
 */
export async function measure(scene, grid, signal, wanted = () => true) {
  const [scl] = await readWindow(scene.assets.scl, grid.bbox, 20, signal);
  const clear = clearCells(scl, grid);
  const share = clearShare(clear, grid.mask);
  if (share < MIN_CLEAR || !wanted()) return { clear: share, ndvi: null };
  const [[red], [nir]] = await Promise.all([
    readWindow(scene.assets.red, grid.bbox, 10, signal),
    readWindow(scene.assets.nir, grid.bbox, 10, signal),
  ]);
  return { clear: share, ndvi: ndviStats(red, nir, clear, grid.mask, scene.offset) };
}

/**
 * The NDVI of `field` through a season: the scenes between `start` and `end`, read clearest first, at most one
 * per SPACING_DAYS. `onScenes(list)` gets every scene once listed, `onPoint(scene, ndvi)` each measurement as
 * it comes. Resolves to { scenes, points: [{ scene, clear, ndvi }] } sorted by date.
 */
export async function season(field, lonLatBbox, start, end, { signal, onScenes = () => {}, onPoint = () => {}, parallel = 6 } = {}) {
  const list = await scenes(lonLatBbox, start, end, signal);
  onScenes(list);
  if (!list.length) return { scenes: list, points: [] };
  const grid = fieldGrid(field, list[0].epsg);
  const measured = [];
  const points = [];
  await pool(readingOrder(list), parallel, async (scene) => {
    if (signal?.aborted || covered(scene.date, measured)) return;
    let result;
    try {
      result = await measure(scene, grid, signal, () => !covered(scene.date, measured));
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(scene.id, error);
      return;
    }
    if (!result.ndvi) return;
    measured.push(scene.date);
    points.push({ scene, ...result });
    onPoint(scene, result);
  });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  points.sort((a, b) => a.scene.date - b.scene.date);
  return { scenes: list, points: flagDips(points) };
}

/**
 * True colour of the field and its surroundings in one scene: the bbox widened by `margin` metres, as plain
 * RGBA for the map, and `field` (the pixel rectangle of the field) for a close-up. `outlined` is the same
 * picture with the field's outline in white, for the close-ups.
 */
export async function trueColour(scene, field, margin, signal) {
  const crs = utm(scene.epsg);
  const [x0, y0, x1, y1] = transformExtent(field.extent, 'EPSG:3857', crs);
  const bbox = [
    Math.floor((x0 - margin) / 10) * 10,
    Math.floor((y0 - margin) / 10) * 10,
    Math.ceil((x1 + margin) / 10) * 10,
    Math.ceil((y1 + margin) / 10) * 10,
  ];
  const width = (bbox[2] - bbox[0]) / 10;
  const height = (bbox[3] - bbox[1]) / 10;
  const [r, g, b] = await readWindow(scene.assets.visual, bbox, 10, signal);
  const toUtm = getTransform('EPSG:3857', crs);
  const mask = unionMask(piecesRings(field.pieces, (c) => toUtm(c)), bbox, width, height);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const outlined = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const edge =
        mask[i] &&
        (col === 0 || row === 0 || col === width - 1 || row === height - 1 ||
          !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]);
      rgba.set([r[i], g[i], b[i], 255], i * 4);
      outlined.set(edge ? [255, 255, 255, 255] : [r[i], g[i], b[i], 255], i * 4);
    }
  }
  const px = (x) => Math.round((x - bbox[0]) / 10);
  const py = (y) => Math.round((bbox[3] - y) / 10);
  const rect = { x: px(x0), y: py(y1), width: px(x1) - px(x0), height: py(y0) - py(y1) };
  return { rgba, outlined, width, height, bbox, crs, field: rect };
}

/**
 * Mark the measurements that are probably haze or a cloud the scene classification missed: lower than the
 * nearest measurement on either side, both within DIP_DAYS, by more than DIP_DROP. A harvest or a mowing
 * stays low afterwards, so it is not a dip. Sets `dip` on each point of the date-sorted `points`.
 */
export const DIP_DAYS = 12;
export const DIP_DROP = 0.2;
export function flagDips(points) {
  points.forEach((p, i) => {
    const before = points[i - 1];
    const after = points[i + 1];
    p.dip =
      !!before && !!after &&
      p.scene.date - before.scene.date <= DIP_DAYS * DAY &&
      after.scene.date - p.scene.date <= DIP_DAYS * DAY &&
      before.ndvi.median - p.ndvi.median > DIP_DROP &&
      after.ndvi.median - p.ndvi.median > DIP_DROP;
  });
  return points;
}

/** The clearest image of every month (not a dip), in date order. */
export function monthlyBest(points) {
  const byMonth = new Map();
  for (const p of points) {
    if (p.dip) continue;
    const key = p.scene.date.toISOString().slice(0, 7);
    const best = byMonth.get(key);
    if (!best || p.clear > best.clear || (p.clear === best.clear && p.scene.cloud < best.scene.cloud)) byMonth.set(key, p);
  }
  return [...byMonth.values()].sort((a, b) => a.scene.date - b.scene.date);
}

/** A square around the field in a `trueColour` picture, `margin` cells to spare, kept inside the picture. */
export function closeUp(pic, margin = 4) {
  const f = pic.field;
  const side = Math.min(Math.max(f.width, f.height) + 2 * margin, pic.width, pic.height);
  const clamp = (v, max) => Math.max(0, Math.min(v, max - side));
  return {
    x: clamp(Math.round(f.x + f.width / 2 - side / 2), pic.width),
    y: clamp(Math.round(f.y + f.height / 2 - side / 2), pic.height),
    width: side,
    height: side,
  };
}

/** Run `task` over `items` with at most `n` at a time; resolves when all are done. */
export async function pool(items, n, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
