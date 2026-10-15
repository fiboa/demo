import 'ol/ol.css';
import '../../shared/base.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { containsExtent } from 'ol/extent.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorSource from 'ol/source/Vector.js';
import { Stroke, Style } from 'ol/style.js';

import { NL_EXTENT, PDOK_GRID, RD, RD_EXTENT, basemap, keepFitted } from '../../shared/rd.js';
import { BRP_WMS_URL, heights, parcelsAt } from './pdok.js';
import { colorize, heightStats, hillshade, histogram, polygonMask, rampColor, requestGrid, snapBbox } from './relief.js';

const $ = (selector) => document.querySelector(selector);
const twoDecimals = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Heights below NAP are common; write them with a real minus sign.
const metres = { format: (v) => twoDecimals.format(v).replace('-', '\u2212') };
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const BINS = 40;

// ------------------------------------------------------------------ map

const fields = new TileLayer({
  source: new TileWMS({
    url: BRP_WMS_URL,
    params: { LAYERS: 'BrpGewas', FORMAT: 'image/png', TRANSPARENT: true },
    projection: RD,
    tileGrid: PDOK_GRID,
    attributions: 'Fields: BRP Gewaspercelen 2025, RVO via <a href="https://www.pdok.nl/">PDOK</a>',
  }),
  maxResolution: 14,
  opacity: 0.4,
});
const relief = new ImageLayer();
const outline = new VectorSource();
const map = new OlMap({
  target: 'map',
  layers: [
    basemap(),
    fields,
    relief,
    new VectorLayer({
      source: outline,
      style: [
        new Style({ stroke: new Stroke({ color: '#fff', width: 4 }) }),
        new Style({ stroke: new Stroke({ color: '#23332b', width: 1.5 }) }),
      ],
    }),
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ projection: RD, extent: RD_EXTENT, constrainOnlyCenter: true, maxResolution: 3440.64, minResolution: 0.1 }),
});
const stopFitting = keepFitted(map, NL_EXTENT, [16, 16, 16, 16]);

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

// ------------------------------------------------------------------ one field

const geojson = new GeoJSON();
let current = null; // { feature, point, coverage, grid: { values, width, height, bbox, mask } }
let request = null;
let imageUrl = null;
let coverage = 'dtm_05m';

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

/** Rings of a polygon or multipolygon geometry, as coordinate arrays. */
function ringsOf(geometry) {
  const coordinates = geometry.getCoordinates();
  return geometry.getType() === 'MultiPolygon' ? coordinates.flat() : coordinates;
}

async function showField(point, { fit = true } = {}) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  status('Finding the field…');
  try {
    const features = geojson.readFeatures({ type: 'FeatureCollection', features: await parcelsAt(point, signal) });
    const feature = features.find((f) => f.getGeometry().intersectsCoordinate(point));
    if (!feature) {
      status('No field is registered here. Click inside a field outline.');
      return;
    }
    outline.clear();
    outline.addFeature(feature);
    if (fit || !inView(feature.getGeometry().getExtent())) {
      stopFitting();
      map.getView().fit(feature.getGeometry().getExtent(), { padding: fitPadding(), duration: 500 });
    }
    history.replaceState(null, '', `#${Math.round(point[0])},${Math.round(point[1])}`);
    current = { feature, point };
    await loadHeights(signal);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The map service did not answer. Click the field again to retry.', true);
  }
}

async function loadHeights(signal) {
  const { feature } = current;
  const geometry = feature.getGeometry();
  status(coverage === 'dtm_05m' ? 'Loading the ground heights…' : 'Loading the surface heights…');
  const bbox = snapBbox(geometry.getExtent(), 0.5, 2);
  const size = requestGrid(bbox);
  const grid = await heights(coverage, bbox, size.width, size.height, signal);
  if (signal.aborted) return;
  const mask = polygonMask(ringsOf(geometry), grid.bbox, grid.width, grid.height);
  const stats = heightStats(grid.values, mask);
  const cell = (grid.bbox[2] - grid.bbox[0]) / grid.width;
  const shade = hillshade(grid.values, grid.width, grid.height, cell);
  const rgba = colorize(grid.values, mask, shade, stats.low, stats.high);
  await drawRelief(rgba, grid);
  current.grid = { ...grid, mask };
  showPanel(feature, stats, cell, histogram(grid.values, mask, stats.low, stats.high, BINS));
  status(null);
}

async function drawRelief(rgba, grid) {
  const canvas = new OffscreenCanvas(grid.width, grid.height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, grid.width, grid.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(blob);
  relief.setSource(new ImageStatic({
    url: imageUrl,
    imageExtent: grid.bbox,
    projection: RD,
    interpolate: false,
    attributions: 'Heights: AHN4 via <a href="https://www.pdok.nl/">PDOK</a> (CC0)',
  }));
}

function showPanel(feature, stats, cell, counts) {
  const { gewas, category, jaar } = feature.getProperties();
  const ha = feature.getGeometry().getArea() / 1e4;
  $('#panel-start').hidden = true;
  $('#panel-result').hidden = false;
  $('#field-title').textContent = gewas;
  $('#field-facts').textContent = `${category}, ${oneDecimal.format(ha)} ha, declared in ${jaar}`;

  const range = $('#field-range');
  if (!stats.count) {
    range.textContent = 'No heights were measured on this field.';
  } else {
    const cm = Math.round((stats.high - stats.low) * 100);
    range.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: `${cm} cm` }),
      ` between the lowest and highest parts, from ${metres.format(stats.low)} to ${metres.format(stats.high)} m NAP.`,
    );
  }
  $('#axis-low').textContent = `${metres.format(stats.low)} m`;
  $('#axis-high').textContent = `${metres.format(stats.high)} m`;
  drawHistogram(counts, stats, cell);

  const notes = [];
  const measured = stats.count + stats.missing;
  if (measured && stats.missing / measured >= 0.005) {
    const what = coverage === 'dtm_05m' ? 'ground measurement (buildings, water or dense trees)' : 'measurement (water)';
    notes.push(`No ${what} on ${pct.format(stats.missing / measured)} of the field; left blank.`);
  }
  notes.push(`Extremes ${metres.format(stats.min)} and ${metres.format(stats.max)} m.`);
  if (cell > 0.5) notes.push(`Large field, read at ${oneDecimal.format(cell)} m cells instead of 0.5 m.`);
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
  svg.setAttribute('aria-label', `Histogram of heights from ${metres.format(stats.low)} to ${metres.format(stats.high)} m NAP`);
}

// ------------------------------------------------------------------ controls

map.on('singleclick', (event) => showField(event.coordinate, { fit: false }));

for (const button of document.querySelectorAll('.examples button')) {
  button.addEventListener('click', () => showField([Number(button.dataset.x), Number(button.dataset.y)]));
}

const coverageButtons = document.querySelectorAll('[data-coverage]');
for (const button of coverageButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.coverage === coverage) return;
    coverage = button.dataset.coverage;
    for (const b of coverageButtons) b.setAttribute('aria-pressed', String(b === button));
    if (current) showField(current.point, { fit: false });
  });
}

const tooltip = $('#map-tooltip');
map.on('pointermove', (event) => {
  const grid = current?.grid;
  if (!grid || event.dragging) {
    tooltip.hidden = true;
    return;
  }
  const [x, y] = event.coordinate;
  const col = Math.floor(((x - grid.bbox[0]) / (grid.bbox[2] - grid.bbox[0])) * grid.width);
  const row = Math.floor(((grid.bbox[3] - y) / (grid.bbox[3] - grid.bbox[1])) * grid.height);
  const i = row * grid.width + col;
  const inside = col >= 0 && row >= 0 && col < grid.width && row < grid.height && grid.mask[i];
  if (!inside || Number.isNaN(grid.values[i])) {
    tooltip.hidden = true;
    return;
  }
  tooltip.textContent = `${metres.format(grid.values[i])} m NAP`;
  tooltip.style.transform = `translate(${event.pixel[0] + 14}px, ${event.pixel[1] + 14}px)`;
  tooltip.hidden = false;
});
map.getViewport().addEventListener('pointerleave', () => (tooltip.hidden = true));

// A field in the address (#x,y in RD, as written on every load) or the first example.
function pointFromHash() {
  const point = location.hash.slice(1).split(',').map(Number);
  return point.length === 2 && point.every(Number.isFinite) ? point : null;
}
window.addEventListener('hashchange', () => {
  const point = pointFromHash();
  if (point) showField(point);
});
const start = pointFromHash();
if (start) showField(start);
else $('.examples button').click();
