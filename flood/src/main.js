import 'ol/ol.css';
import '../../shared/base.css';
import '../../shared/map-page.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { containsExtent } from 'ol/extent.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import XYZ from 'ol/source/XYZ.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';
import { daily } from '../../shared/openmeteo.js';
import { FloodCharts } from './charts.js';
import { FIRST_EXAMPLE, renderExamples } from './gallery.js';
import { floodSpells, series, waterMap } from './s1.js';

const $ = (selector) => document.querySelector(selector);
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// The archive thins its low zoom levels; up to CLICK_MIN_ZOOM the fields are a sample, drawn as dots.
const CLICK_MIN_ZOOM = 12;
const clickResolution = 156543.03392804097 / 2 ** CLICK_MIN_ZOOM;
// Sentinel-1 radar on the Planetary Computer starts in 2015 (the archive holds a few late-2014 scenes).
const FIRST_YEAR = 2015;
// Metres of surroundings in the water map of an image.
const MAP_MARGIN = 2000;
const DAY = 86400000;

// ------------------------------------------------------------------ map

let selected = null; // "collection/id" of the field on show

const farStyle = new Style({ fill: new Fill({ color: 'rgba(35, 51, 43, 0.7)' }) });
const fieldStyle = new Style({ stroke: new Stroke({ color: 'rgba(35, 51, 43, 0.55)', width: 1 }) });
const selectedStyle = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 5 }) }),
  new Style({ stroke: new Stroke({ color: '#c2410c', width: 2.5 }) }),
];

const fieldsSource = new PMTilesVectorSource({
  url: FIELDS_PMTILES,
  attributions:
    'Fields: <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World harmonized field data</a>',
});
const fields = new VectorTileLayer({
  source: fieldsSource,
  style: (feature, resolution) => {
    const collection = feature.get('collection');
    if (!inCatalog(collection)) return undefined;
    if (resolution > clickResolution) return farStyle;
    return `${collection}/${feature.get('id')}` === selected ? selectedStyle : fieldStyle;
  },
});
const water = new ImageLayer();
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
    water,
    fields,
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat([8, 49]), zoom: 4, maxZoom: 18 }),
});

function fitPadding() {
  const panel = $('.map-panel');
  const floating = getComputedStyle(panel).position === 'absolute';
  return [40, floating ? panel.offsetWidth + 56 : 40, 40, 40];
}

function inView(extent) {
  const [top, right, bottom, left] = fitPadding();
  const [width, height] = map.getSize();
  const [x0, y1] = map.getCoordinateFromPixel([left, top]);
  const [x1, y0] = map.getCoordinateFromPixel([width - right, height - bottom]);
  return containsExtent([x0, y0, x1, y1], extent);
}

const zoomHint = $('#zoom-hint');
const updateHint = () => {
  zoomHint.hidden = map.getView().getZoom() >= CLICK_MIN_ZOOM;
};
map.getView().on('change:resolution', updateHint);
updateHint();

// ------------------------------------------------------------------ one field, one year

let field = null;
let request = null;
let model = null; // { start, days, points, selected, rain }
let coordinateShown = null;
const imageUrls = [];

const charts = new FloodCharts({
  water: $('#chart-water'),
  rain: $('#chart-rain'),
  tooltip: $('#chart-tooltip'),
  onPick: (point) => pick(point),
});

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

function fillYears() {
  const select = $('#year');
  if (select.options.length) return;
  for (let y = new Date().getUTCFullYear(); y >= FIRST_YEAR; y--) select.append(new Option(String(y), String(y)));
}

async function showField(coordinate, { fit = true, year = null } = {}) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  status('Finding the field…');
  try {
    const found = await fieldAt(fieldsSource.pmtiles_, coordinate, inCatalog, signal, preferred);
    if (signal.aborted) return;
    if (!found) {
      status('No field here. Click inside one of the outlined fields.');
      return;
    }
    field = found;
    maps.clear();
    selected = `${field.collection}/${field.id}`;
    fields.changed();
    if (fit || !inView(field.extent)) map.getView().fit(field.extent, { padding: fitPadding(), duration: 500, maxZoom: 15 });
    fillYears();
    // The year asked for, else the one on show, else the last full year.
    const chosen = year ?? (Number($('#year').value) || new Date().getUTCFullYear() - 1);
    $('#year').value = String(Math.max(FIRST_YEAR, Math.min(chosen, Number($('#year').options[0].value))));
    showPanel(field);
    loadYear(coordinate, Number($('#year').value), controller);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The field could not be read. Click it again to retry.', true);
  }
}

function showPanel(f) {
  const { collection, properties } = f;
  const crop = properties['crop:name'] || properties['hcat:name_en'];
  const area = properties['metrics:area'];
  $('#panel-start').hidden = true;
  $('#panel-result').hidden = false;
  $('#field-title').textContent = crop || 'Field';
  const facts = [];
  if (properties['hcat:name_en'] && properties['hcat:name_en'] !== crop) facts.push(properties['hcat:name_en']);
  if (area) facts.push(`${oneDecimal.format(area / 1e4)} ha`);
  const c = COLLECTIONS[collection];
  facts.push(`${c?.title ?? collection}${c?.year ? `, ${c.year}` : ''}`);
  $('#field-facts').textContent = facts.join(', ');
  $('#flood-summary').replaceChildren();
}

function writeHash(coordinate, year) {
  const [lon, lat] = toLonLat(coordinate);
  history.replaceState(null, '', `#${lon.toFixed(5)},${lat.toFixed(5)},${year}`);
}

async function loadYear(coordinate, year, controller = null) {
  if (!controller) {
    request?.abort();
    controller = new AbortController();
    request = controller;
  }
  const { signal } = controller;
  coordinateShown = coordinate;
  writeHash(coordinate, year);
  const [lon, lat] = toLonLat(coordinate);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Math.min(Date.UTC(year + 1, 0, 1) - 1, Date.now()));
  const days = Math.round((Date.UTC(year + 1, 0, 1) - start) / DAY);
  model = { start, days, points: [], selected: null, rain: null };
  water.setSource(null);
  for (const url of imageUrls.splice(0)) URL.revokeObjectURL(url);
  $('#flood').hidden = false;
  $('#flood-summary').replaceChildren();
  charts.set(model);

  const current = model;
  const rain = daily(lon, lat, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), signal)
    .then((d) => {
      if (signal.aborted || model !== current) return;
      model.rain = d.rain;
      charts.set(model);
    })
    .catch((error) => {
      if (!signal.aborted) console.warn('rain', error);
    });

  status('Looking for Sentinel-1 radar images…');
  let total = 0;
  let done = 0;
  try {
    const result = await series(field, transformExtent(field.extent, 'EPSG:3857', 'EPSG:4326'), start, end, {
      signal,
      onScenes: (list) => {
        total = list.length;
        status(total ? `Reading the field in ${total} radar images, spread over the year first…` : null);
      },
      onPoint: (point) => {
        done++;
        model.points = [...model.points, point].sort((a, b) => a.scene.date - b.scene.date);
        charts.set(model);
        status(`${done} of ${total} radar images read…`);
      },
    });
    if (signal.aborted) return;
    model.points = result.points;
    charts.set(model);
    if (!result.points.length) {
      status(`No Sentinel-1 images of this field in ${year} yet.`);
      return;
    }
    status(`${result.points.length} radar images of the field. Hover over the chart for the values, click a point to see its map.`);
    summarise(result.points);
    const wettest = result.points.reduce((a, b) => (b.water > a.water ? b : a));
    pick(wettest.water >= 0.05 ? wettest : result.points.at(-1));
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The radar images could not be read. Pick the year again to retry.', true);
  }
  await rain;
}

/** One sentence on the year: the spells with half the field or more under water, or none. */
function summarise(points) {
  const spells = floodSpells(points, 0.5);
  const el = $('#flood-summary');
  if (!spells.length) {
    const most = points.reduce((a, b) => (b.water > a.water ? b : a));
    el.replaceChildren(
      'Never half under water in these images',
      most.water >= 0.05 ? `; the most was ${pct.format(most.water)} on ${dateText.format(most.scene.date)}.` : '.',
    );
    return;
  }
  const span = (s) =>
    s.first === s.last ? shortDate.format(s.first.scene.date) : `${shortDate.format(s.first.scene.date)} to ${shortDate.format(s.last.scene.date)}`;
  const parts = spells.map((s) => `${span(s)} (up to ${pct.format(s.most.water)})`);
  el.replaceChildren(
    Object.assign(document.createElement('strong'), { textContent: `Half or more under water ${spells.length === 1 ? 'once' : `${spells.length} times`}` }),
    `: ${parts.join(', ')}.`,
  );
}

/** A PNG object URL of `rgba` (width × height). */
async function pngUrl(rgba, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  const url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
  imageUrls.push(url);
  return url;
}

const maps = new Map(); // scene id -> Promise of { url, bbox, crs }

/** Show the water around the field in the image of `point`, and mark it in the chart. */
async function pick(point) {
  model.selected = point;
  charts.set(model);
  const current = model;
  if (!maps.has(point.scene.id)) {
    const made = waterMap(point.scene, field, MAP_MARGIN, request?.signal).then(async (m) => ({
      url: await pngUrl(m.rgba, m.width, m.height),
      bbox: m.bbox,
      crs: m.crs,
    }));
    made.catch(() => maps.delete(point.scene.id));
    maps.set(point.scene.id, made);
  }
  try {
    const m = await maps.get(point.scene.id);
    if (model !== current || model.selected !== point) return;
    water.setSource(
      new ImageStatic({
        url: m.url,
        imageExtent: m.bbox,
        projection: m.crs,
        interpolate: false,
        attributions: `Radar: Copernicus Sentinel-1, ${dateText.format(point.scene.date)}, via Microsoft Planetary Computer`,
      }),
    );
    $('#map-date').textContent = `Water on ${dateText.format(point.scene.date)}`;
    $('#map-date').hidden = false;
  } catch (error) {
    if (!request?.signal.aborted) console.warn(error);
  }
}

// ------------------------------------------------------------------ controls

map.on('singleclick', (event) => {
  if (map.getView().getZoom() < CLICK_MIN_ZOOM) return;
  showField(event.coordinate, { fit: false });
});

$('#year').addEventListener('change', (event) => {
  maps.clear();
  if (field && coordinateShown) loadYear(coordinateShown, Number(event.target.value));
});

renderExamples($('#panel-examples'), $('#example-cards'), () =>
  $('#map-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
);

// A field in the address (#lon,lat or #lon,lat,year) or the first example.
function fromHash() {
  const parts = location.hash.slice(1).split(',').map(Number);
  if ((parts.length !== 2 && parts.length !== 3) || !parts.every(Number.isFinite)) return null;
  return { coordinate: fromLonLat(parts.slice(0, 2)), year: parts[2] ?? null };
}
window.addEventListener('hashchange', () => {
  const target = fromHash();
  if (target) showField(target.coordinate, { year: target.year });
});
const start = fromHash();
if (start) showField(start.coordinate, { year: start.year });
else if (FIRST_EXAMPLE) showField(fromLonLat([FIRST_EXAMPLE.lon, FIRST_EXAMPLE.lat]), { year: FIRST_EXAMPLE.year });
