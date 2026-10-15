import 'ol/ol.css';
import '../../shared/base.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { containsExtent, getCenter } from 'ol/extent.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import { fromLonLat, getTransform, toLonLat, transformExtent } from 'ol/proj.js';
import { getDistance } from 'ol/sphere.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import XYZ from 'ol/source/XYZ.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

import { COLLECTIONS, demsFor, heights } from './dems.js';
import { FIELDS_PMTILES, fieldAt, piecesRings } from './fields.js';
import { colorize, heightStats, hillshade, histogram, rampColor, requestGrid, snapBbox, unionMask } from './relief.js';

const $ = (selector) => document.querySelector(selector);
const twoDecimals = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Heights below sea level occur (the Netherlands); write them with a real minus sign.
const metres = { format: (v) => twoDecimals.format(v).replace('-', '−') };
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const cellSize = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const BINS = 40;
// Fields show from this zoom on; further out the global archive keeps only a few % of them, so the map
// shows the precomputed share of the land in fields instead. Up to CLICK_MIN_ZOOM the fields are a sample
// (the archive thins its tiles), drawn as dots.
const FIELDS_MIN_ZOOM = 9;
const CLICK_MIN_ZOOM = 12;
const clickResolution = 156543.03392804097 / 2 ** CLICK_MIN_ZOOM; // Web Mercator, at that zoom
// A height model is taken when it has heights for at least this share of the field.
const ENOUGH = 0.5;

// ------------------------------------------------------------------ map

let selected = null; // "collection/id" of the field on show

const farStyle = new Style({ fill: new Fill({ color: 'rgba(35, 51, 43, 0.7)' }) });
const fieldStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 255, 255, 0.25)' }),
  stroke: new Stroke({ color: 'rgba(35, 51, 43, 0.55)', width: 1 }),
});
const selectedStyle = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 4 }) }),
  new Style({ stroke: new Stroke({ color: '#23332b', width: 1.5 }) }),
];

const fieldsSource = new PMTilesVectorSource({
  url: FIELDS_PMTILES,
  attributions:
    'Fields: <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World harmonized field data</a>',
});
const fields = new VectorTileLayer({
  source: fieldsSource,
  minZoom: FIELDS_MIN_ZOOM,
  // Only the collections a height model covers; the selected field drawn on top of its relief.
  style: (feature, resolution) => {
    const collection = feature.get('collection');
    if (!COLLECTIONS[collection]) return undefined;
    if (resolution > clickResolution) return farStyle;
    return `${collection}/${feature.get('id')}` === selected ? selectedStyle : fieldStyle;
  },
});
// Share of each 611 m cell covered by fields of COLLECTIONS, 1-255 (scripts/relief/field_share.sh).
const SHARE_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/relief/field_share.tif';
const share = new WebGLTileLayer({
  source: new GeoTIFF({ sources: [{ url: SHARE_URL, nodata: 0 }], normalize: false }),
  maxZoom: FIELDS_MIN_ZOOM,
  style: {
    color: ['interpolate', ['linear'], ['band', 1], 1, [35, 51, 43, 0.08], 64, [35, 51, 43, 0.35], 255, [35, 51, 43, 0.7]],
  },
});
const relief = new ImageLayer();
const map = new OlMap({
  target: 'map',
  layers: [
    new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Background: Esri, HERE, Garmin, © OpenStreetMap contributors',
        maxZoom: 16,
      }),
    }),
    share,
    relief,
    fields,
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat([8, 49]), zoom: 4, maxZoom: 20 }),
});

/** Padding that keeps a fitted field clear of the panel when it floats over the map. */
function fitPadding() {
  const panel = $('.relief-panel');
  const floating = getComputedStyle(panel).position === 'absolute';
  return [40, floating ? panel.offsetWidth + 56 : 40, 40, 40];
}

/** Whether `extent` lies in the part of the map the panel does not cover. */
function inView(extent) {
  const [top, right, bottom, left] = fitPadding();
  const [width, height] = map.getSize();
  const [x0, y1] = map.getCoordinateFromPixel([left, top]);
  const [x1, y0] = map.getCoordinateFromPixel([width - right, height - bottom]);
  return containsExtent([x0, y0, x1, y1], extent);
}

const zoomHint = $('#zoom-hint');
const updateHint = () => {
  const zoom = map.getView().getZoom();
  zoomHint.hidden = zoom >= CLICK_MIN_ZOOM;
  zoomHint.textContent =
    zoom < FIELDS_MIN_ZOOM ? 'Darker where more of the land is fields; zoom in to see them' : 'Zoom in further to pick a field';
};
map.getView().on('change:resolution', updateHint);
updateHint();

// ------------------------------------------------------------------ one field

let current = null; // { field, dem, grid: { values, width, height, bbox, mask }, toDem }
let request = null;
let imageUrl = null;

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

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

async function showField(coordinate, { fit = true } = {}) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  status('Finding the field…');
  try {
    const field = await fieldAt(fieldsSource.pmtiles_, coordinate, (c) => !!COLLECTIONS[c], signal);
    if (signal.aborted) return;
    if (!field) {
      status('No field with a height model here. Click inside one of the outlined fields.');
      return;
    }
    selected = `${field.collection}/${field.id}`;
    fields.changed();
    relief.setSource(null);
    if (fit || !inView(field.extent)) map.getView().fit(field.extent, { padding: fitPadding(), duration: 500 });
    const [lon, lat] = toLonLat(coordinate);
    history.replaceState(null, '', `#${lon.toFixed(5)},${lat.toFixed(5)}`);
    current = { field };
    await loadHeights(field, signal);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The field or height service did not answer. Click the field again to retry.', true);
  }
}

/** Try the height models for this field in order; keep the first that measured most of it. */
async function loadHeights(field, signal) {
  const centre = getCenter(field.extent);
  const dems = demsFor(field.collection, toLonLat(centre));
  let best = null;
  for (const dem of dems) {
    status(`Loading the heights from ${dem.name}…`);
    let result;
    try {
      result = await readField(field, dem, centre, signal);
    } catch (error) {
      if (signal.aborted) return;
      console.warn(dem.name, error);
      continue;
    }
    if (signal.aborted) return;
    if (!best || result.share > best.share) best = result;
    if (result.share >= ENOUGH) break;
  }
  if (!best || best.share < ENOUGH) {
    showPanel(field, null);
    status(`No height model of 1 m or finer covers this field${COLLECTIONS[field.collection].partly ? `; in ${COLLECTIONS[field.collection].region} only ${COLLECTIONS[field.collection].partly} publish one` : ''}.`);
    return;
  }
  const { dem, grid, mask, stats, cell } = best;
  const shade = hillshade(grid.values, grid.width, grid.height, cell);
  const rgba = colorize(grid.values, mask, shade, stats.low, stats.high);
  await drawRelief(rgba, grid, dem);
  current = { field, dem, grid: { ...grid, mask }, toDem: getTransform('EPSG:3857', dem.crs) };
  showPanel(field, { dem, stats, cell, counts: histogram(grid.values, mask, stats.low, stats.high, BINS) });
  status(null);
}

async function readField(field, dem, centre, signal) {
  const native = cellIn(dem.crs, centre, dem.res);
  const bbox = snapBbox(transformExtent(field.extent, 'EPSG:3857', dem.crs), native, 2 * native);
  const size = requestGrid(bbox, native);
  const grid = await heights(dem, bbox, size.width, size.height, signal);
  const toDem = getTransform('EPSG:3857', dem.crs);
  const mask = unionMask(piecesRings(field.pieces, (c) => toDem(c)), grid.bbox, grid.width, grid.height);
  const stats = heightStats(grid.values, mask);
  const inside = stats.count + stats.missing;
  const cellCrs = (grid.bbox[2] - grid.bbox[0]) / grid.width;
  return { dem, grid, mask, stats, cell: (cellCrs * dem.res) / native, share: inside ? stats.count / inside : 0 };
}

async function drawRelief(rgba, grid, dem) {
  const canvas = new OffscreenCanvas(grid.width, grid.height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, grid.width, grid.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(blob);
  relief.setSource(new ImageStatic({
    url: imageUrl,
    imageExtent: grid.bbox,
    projection: dem.crs,
    interpolate: false,
    attributions: `Heights: <a href="${dem.link}">${dem.name}</a>, ${dem.by} (${dem.licence})`,
  }));
}

function showPanel(field, result) {
  const { collection, properties } = field;
  const crop = properties['crop:name'] || properties['hcat:name_en'];
  // Not every collection carries its area in the tiles; then count the cells inside the field.
  const area = properties['metrics:area'] ?? (result && (result.stats.count + result.stats.missing) * result.cell ** 2);
  $('#panel-start').hidden = true;
  $('#panel-result').hidden = false;
  $('#field-title').textContent = crop || 'Field';
  const facts = [];
  if (properties['hcat:name_en'] && properties['hcat:name_en'] !== crop) facts.push(properties['hcat:name_en']);
  if (area) facts.push(`${oneDecimal.format(area / 1e4)} ha`);
  facts.push(`${COLLECTIONS[collection].region} (${collection})`);
  $('#field-facts').textContent = facts.join(', ');

  $('#field-heights').hidden = !result;
  if (!result) return;
  const { dem, stats, cell, counts } = result;
  const range = $('#field-range');
  const spread = stats.high - stats.low;
  // Centimetres are the point on flat land; on a hillside metres read better.
  const spreadText = spread < 10 ? `${Math.round(spread * 100)} cm` : `${oneDecimal.format(spread)} m`;
  range.replaceChildren(
    Object.assign(document.createElement('strong'), { textContent: spreadText }),
    ` between the lowest and highest parts, from ${metres.format(stats.low)} to ${metres.format(stats.high)} m above sea level.`,
  );
  $('#axis-low').textContent = `${metres.format(stats.low)} m`;
  $('#axis-high').textContent = `${metres.format(stats.high)} m`;
  drawHistogram(counts, stats, cell);

  const notes = [`Heights from ${dem.name} (${dem.by}), ${oneDecimal.format(dem.res)} m${dem.years ? `, flown ${dem.years}` : ''}${dem.note ? `: ${dem.note}` : ''}.`];
  const measured = stats.count + stats.missing;
  if (measured && stats.missing / measured >= 0.005) {
    notes.push(`No ground measurement on ${pct.format(stats.missing / measured)} of the field (buildings, water or dense trees); left blank.`);
  }
  notes.push(`Extremes ${metres.format(stats.min)} and ${metres.format(stats.max)} m.`);
  if (cell > dem.res * 1.05) notes.push(`Large field, read at ${cellSize.format(cell)} m cells.`);
  if (!field.complete) notes.push('A very large field: only the part near the click is shown.');
  $('#field-gaps').textContent = notes.join(' ');
}

/** Bars of equal width, each in the colour its heights have on the map; the area per bar in its tooltip. */
function drawHistogram(counts, stats, cell) {
  const svg = $('#histogram');
  const width = 300;
  const height = 88;
  const max = Math.max(...counts, 1);
  const step = (stats.high - stats.low) / counts.length;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const ns = 'http://www.w3.org/2000/svg';
  const bars = counts.map((count, i) => {
    const rect = document.createElementNS(ns, 'rect');
    const w = width / counts.length;
    const h = (count / max) * (height - 2);
    rect.setAttribute('x', String(i * w));
    rect.setAttribute('width', String(Math.max(0, w - 1)));
    rect.setAttribute('y', String(height - h));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', `rgb(${rampColor((i + 0.5) / counts.length)})`);
    const title = document.createElementNS(ns, 'title');
    const lo = metres.format(stats.low + i * step);
    const hi = metres.format(stats.low + (i + 1) * step);
    const heightsText = i === 0 ? `up to ${hi}` : i === counts.length - 1 ? `${lo} and above` : `${lo} to ${hi}`;
    title.textContent = `${heightsText} m: ${oneDecimal.format((count * cell * cell) / 1e4)} ha`;
    rect.append(title);
    return rect;
  });
  svg.replaceChildren(...bars);
  svg.setAttribute('aria-label', `Histogram of heights from ${metres.format(stats.low)} to ${metres.format(stats.high)} m`);
}

// ------------------------------------------------------------------ controls

/** The regions and their height models, for the About section. */
function listCoverage() {
  const items = Object.entries(COLLECTIONS).map(([collection, { region, dems, partly }]) => {
    const li = document.createElement('li');
    const models = [...new Map(dems.map((d) => [d.name, d])).values()];
    li.append(`${region[0].toUpperCase()}${region.slice(1)}${partly ? ` (${partly} only)` : ''} `);
    li.append(Object.assign(document.createElement('code'), { textContent: collection }), ': ');
    models.forEach((dem, i) => {
      if (i) li.append(', then ');
      li.append(Object.assign(document.createElement('a'), { href: dem.link, textContent: dem.name }));
      li.append(` (${dem.by}, ${oneDecimal.format(dem.res)} m${dem.years ? `, ${dem.years}` : ''}, ${dem.licence})`);
    });
    return li;
  });
  $('#coverage').replaceChildren(...items);
}
listCoverage();

map.on('singleclick', (event) => {
  if (map.getView().getZoom() < CLICK_MIN_ZOOM) return;
  showField(event.coordinate, { fit: false });
});

for (const button of document.querySelectorAll('.examples button')) {
  button.addEventListener('click', () => showField(fromLonLat([Number(button.dataset.lon), Number(button.dataset.lat)])));
}

const tooltip = $('#map-tooltip');
map.on('pointermove', (event) => {
  const grid = current?.grid;
  if (!grid || event.dragging) {
    tooltip.hidden = true;
    return;
  }
  const [x, y] = current.toDem(event.coordinate);
  const col = Math.floor(((x - grid.bbox[0]) / (grid.bbox[2] - grid.bbox[0])) * grid.width);
  const row = Math.floor(((grid.bbox[3] - y) / (grid.bbox[3] - grid.bbox[1])) * grid.height);
  const i = row * grid.width + col;
  const inside = col >= 0 && row >= 0 && col < grid.width && row < grid.height && grid.mask[i];
  if (!inside || Number.isNaN(grid.values[i])) {
    tooltip.hidden = true;
    return;
  }
  tooltip.textContent = `${metres.format(grid.values[i])} m`;
  tooltip.style.transform = `translate(${event.pixel[0] + 14}px, ${event.pixel[1] + 14}px)`;
  tooltip.hidden = false;
});
map.getViewport().addEventListener('pointerleave', () => (tooltip.hidden = true));

// A field in the address (#lon,lat, as written on every load) or the first example.
function pointFromHash() {
  const point = location.hash.slice(1).split(',').map(Number);
  return point.length === 2 && point.every(Number.isFinite) ? fromLonLat(point) : null;
}
window.addEventListener('hashchange', () => {
  const point = pointFromHash();
  if (point) showField(point);
});
const start = pointFromHash();
if (start) showField(start);
else $('.examples button').click();
