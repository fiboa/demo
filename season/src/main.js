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

import { FIELDS_PMTILES, fieldAt, hasCrop, isFields } from '../../shared/fields.js';
import COLLECTIONS from '../data/collections.json' with { type: 'json' };
import { SeasonCharts } from './charts.js';
import { FIRST_EXAMPLE, renderExamples } from './gallery.js';
import { closeUp, flagDips, monthlyBest, pool, season, trueColour } from './s2.js';
import { seasonWeather } from './weather.js';

const $ = (selector) => document.querySelector(selector);
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthText = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
// The archive thins its low zoom levels; up to CLICK_MIN_ZOOM the fields are a sample, drawn as dots.
const CLICK_MIN_ZOOM = 12;
const clickResolution = 156543.03392804097 / 2 ** CLICK_MIN_ZOOM;
// Sentinel-2 level 2A covers the world from 2017 on.
const FIRST_YEAR = 2017;
const DAY = 86400000;


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
  style: (feature, resolution) => {
    const collection = feature.get('collection');
    if (!isFields(collection)) return undefined;
    if (resolution > clickResolution) return farStyle;
    return `${collection}/${feature.get('id')}` === selected ? selectedStyle : fieldStyle;
  },
});
const image = new ImageLayer();
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
    image,
    fields,
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat([8, 49]), zoom: 4, maxZoom: 19 }),
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

// ------------------------------------------------------------------ one field, one season

let field = null;
let request = null;
let model = null; // { start, points, selected, weather, field, year }
const imageUrls = [];

const charts = new SeasonCharts({
  ndvi: $('#chart-ndvi'),
  rain: $('#chart-rain'),
  gdd: $('#chart-gdd'),
  tooltip: $('#chart-tooltip'),
  onPick: (point) => pick(point),
});

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

/** The season of `year` at latitude `lat`: the calendar year, or July to June south of the equator. */
function seasonOf(year, lat) {
  const south = lat < 0;
  const start = new Date(Date.UTC(south ? year - 1 : year, south ? 6 : 0, 1));
  return { start, end: new Date(start.getTime() + 365 * DAY - 1), south };
}

const yearLabel = (year, south) => (south ? `${year - 1}/${String(year % 100).padStart(2, '0')}` : String(year));

function fillYears(edition, south) {
  const select = $('#year');
  const now = new Date();
  // A season counts once it has started.
  const last = south ? now.getUTCFullYear() + (now.getUTCMonth() >= 6 ? 1 : 0) : now.getUTCFullYear();
  const options = [];
  for (let y = last; y >= FIRST_YEAR; y--) {
    const option = new Option(`${yearLabel(y, south)}${y === edition ? ' (crop year)' : ''}`, String(y));
    options.push(option);
  }
  select.replaceChildren(...options);
}

async function showField(coordinate, { fit = true, year = null } = {}) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  status('Finding the field…');
  try {
    const found = await fieldAt(fieldsSource.pmtiles_, coordinate, isFields, signal, hasCrop);
    if (signal.aborted) return;
    if (!found) {
      status('No field here. Click inside one of the outlined fields.');
      return;
    }
    field = found;
    selected = `${field.collection}/${field.id}`;
    fields.changed();
    if (fit || !inView(field.extent)) map.getView().fit(field.extent, { padding: fitPadding(), duration: 500, maxZoom: 17 });
    const lat = toLonLat(coordinate)[1];
    const edition = COLLECTIONS[field.collection]?.year ?? null;
    fillYears(edition, lat < 0);
    const chosen = year ?? edition ?? new Date().getUTCFullYear();
    $('#year').value = String(Math.max(FIRST_YEAR, Math.min(chosen, Number($('#year').options[0].value))));
    showPanel(field);
    loadSeason(coordinate, Number($('#year').value), controller);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The field could not be read. Click it again to retry.', true);
  }
}

function writeHash(coordinate, year) {
  const [lon, lat] = toLonLat(coordinate);
  history.replaceState(null, '', `#${lon.toFixed(5)},${lat.toFixed(5)},${year}`);
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
  facts.push(`${COLLECTIONS[collection]?.title ?? collection} (${collection})`);
  $('#field-facts').textContent = facts.join(', ');
  $('#weather-summary').replaceChildren();
}

function updateYearNote(year) {
  const edition = COLLECTIONS[field.collection]?.year;
  const crop = field.properties['crop:name'] || field.properties['hcat:name_en'];
  $('#year-note').textContent =
    edition && year !== edition && crop
      ? `The crop is that of ${edition}; in this year the field may have grown something else.`
      : '';
}

let coordinateShown = null;

async function loadSeason(coordinate, year, controller = null) {
  if (!controller) {
    request?.abort();
    controller = new AbortController();
    request = controller;
  }
  const { signal } = controller;
  coordinateShown = coordinate;
  writeHash(coordinate, year);
  updateYearNote(year);
  const [lon, lat] = toLonLat(coordinate);
  const { start, end } = seasonOf(year, lat);
  model = { start, points: [], selected: null, weather: null };
  image.setSource(null);
  for (const url of imageUrls.splice(0)) URL.revokeObjectURL(url);
  $('#snapshots').replaceChildren();
  $('#season').hidden = false;
  charts.set(model);
  $('#weather-summary').replaceChildren();

  const current = model;
  const weather = seasonWeather(lon, lat, start, signal)
    .then((w) => {
      if (signal.aborted || model !== current) return;
      model.weather = w;
      charts.set(model);
      summariseWeather(w, year, lat < 0);
    })
    .catch((error) => {
      if (!signal.aborted) console.warn('weather', error);
    });

  status('Looking for Sentinel-2 images…');
  const lonLatBbox = transformExtent(field.extent, 'EPSG:3857', 'EPSG:4326');
  let total = 0;
  let done = 0;
  try {
    const result = await season(field, lonLatBbox, start, end, {
      signal,
      onScenes: (list) => {
        total = list.length;
        status(total ? `Reading the field in ${total} images, the clearest first…` : null);
      },
      onPoint: (scene, measured) => {
        done++;
        model.points = flagDips([...model.points, { scene, ...measured }].sort((a, b) => a.scene.date - b.scene.date));
        charts.set(model);
        status(`${done} clear images of the field so far, of ${total}…`);
      },
    });
    if (signal.aborted) return;
    model.points = result.points;
    charts.set(model);
    if (!result.scenes.length) {
      status(`No Sentinel-2 images of this field in ${yearLabel(year, lat < 0)} yet.`);
      return;
    }
    const clear = result.points.length;
    status(
      `${clear} clear images of the field, of ${result.scenes.length}; the others were cloudy or close to a clearer one. Hover over the chart for the values, click a point to see its image.`,
    );
    await snapshots(result.points, signal);
  } catch (error) {
    if (signal.aborted) return;
    console.error(error);
    status('The Sentinel-2 images could not be read. Pick the year again to retry.', true);
  }
  await weather;
}

function summariseWeather(w, year, south) {
  const d = w.days - 1;
  if (d < 0) return;
  const rain = w.season.rain[d];
  const rainNormal = w.normal.rain[d];
  const gdd = w.season.gdd[d];
  const gddNormal = w.normal.gdd[d];
  const temp = w.season.temp.slice(0, d + 1).reduce((a, b) => a + b, 0) / (d + 1);
  const tempNormal = w.normal.temp.slice(0, d + 1).reduce((a, b) => a + b, 0) / (d + 1);
  const span = d >= 364 ? yearLabel(year, south) : `${yearLabel(year, south)} up to ${dateText.format(new Date(model.start.getTime() + d * DAY))}`;
  const more = (a, b) => (a >= b ? `${pct.format(a / b - 1)} more than` : `${pct.format(1 - a / b)} less than`);
  const diff = temp - tempNormal;
  const el = $('#weather-summary');
  el.replaceChildren(
    `${span}: `,
    Object.assign(document.createElement('strong'), { textContent: `${whole.format(rain)} mm of rain` }),
    `, ${more(rain, rainNormal)} normal; `,
    Object.assign(document.createElement('strong'), { textContent: `${oneDecimal.format(Math.abs(diff))} °C ${diff >= 0 ? 'warmer' : 'colder'}` }),
    ` than normal on average (${whole.format(gdd)} degree days, ${more(gdd, gddNormal)} normal).`,
  );
}

/** The best image of every month, in true colour, along the time axis; the greenest one on the map. */
async function snapshots(points, signal) {
  const chosen = monthlyBest(points);
  const greenest = points.filter((p) => !p.dip).reduce((a, b) => (!a || b.ndvi.median > a.ndvi.median ? b : a), null);
  if (greenest) pick(greenest);
  const strip = $('#snapshots');
  await pool(chosen, 3, async (p) => {
    const url = await thumbUrl(p, signal);
    if (signal.aborted || !url) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'snapshot';
    // In the middle of its month, so neighbours never overlap.
    const month = new Date(Date.UTC(p.scene.date.getUTCFullYear(), p.scene.date.getUTCMonth(), 15));
    button.style.left = `${((month - model.start) / DAY / 365) * 100}%`;
    button.title = `${dateText.format(p.scene.date)}, NDVI ${p.ndvi.median.toFixed(2)}`;
    button.append(Object.assign(document.createElement('img'), { src: url, alt: `The field on ${dateText.format(p.scene.date)}` }));
    button.append(Object.assign(document.createElement('span'), { textContent: monthText.format(p.scene.date) }));
    button.addEventListener('click', () => pick(p));
    p.button = button;
    strip.append(button);
    markPicked();
  });
}

const pictures = new Map(); // scene id -> Promise of { url (map), thumb (close-up), picture }

// Metres of surroundings read around a field for the map, and kept around it in a close-up.
const MAP_MARGIN = 400;

/** A PNG object URL of `rgba` (width × height), or of the rectangle `crop` of it. */
async function pngUrl(rgba, width, height, crop = null) {
  const full = new OffscreenCanvas(width, height);
  full.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  let canvas = full;
  if (crop) {
    canvas = new OffscreenCanvas(crop.width, crop.height);
    canvas.getContext('2d').drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  }
  const url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
  imageUrls.push(url);
  return url;
}

function picture(point, signal) {
  if (!pictures.has(point.scene.id)) {
    pictures.set(
      point.scene.id,
      trueColour(point.scene, field, MAP_MARGIN, signal).then(async (pic) => ({
        url: await pngUrl(pic.rgba, pic.width, pic.height),
        thumb: await pngUrl(pic.outlined, pic.width, pic.height, closeUp(pic)),
        picture: pic,
      })),
    );
    pictures.get(point.scene.id).catch(() => pictures.delete(point.scene.id));
  }
  return pictures.get(point.scene.id);
}

async function thumbUrl(point, signal) {
  try {
    return (await picture(point, signal)).thumb;
  } catch (error) {
    if (!signal?.aborted) console.warn(point.scene.id, error);
    return null;
  }
}

/** Show the image of `point` on the map and mark it in the chart and the strip. */
async function pick(point) {
  model.selected = point;
  charts.set(model);
  markPicked();
  const current = model;
  try {
    const { url, picture: pic } = await picture(point, request?.signal);
    if (model !== current || model.selected !== point) return;
    image.setSource(
      new ImageStatic({
        url,
        imageExtent: pic.bbox,
        projection: pic.crs,
        interpolate: false,
        attributions: `Image: Copernicus Sentinel-2, ${dateText.format(point.scene.date)}, via Microsoft Planetary Computer`,
      }),
    );
  } catch (error) {
    if (!request?.signal.aborted) console.warn(error);
  }
}

function markPicked() {
  for (const p of model?.points ?? []) p.button?.setAttribute('aria-pressed', String(p === model.selected));
}

// ------------------------------------------------------------------ controls

map.on('singleclick', (event) => {
  if (map.getView().getZoom() < CLICK_MIN_ZOOM) return;
  showField(event.coordinate, { fit: false });
});

$('#year').addEventListener('change', (event) => {
  if (field && coordinateShown) loadSeason(coordinateShown, Number(event.target.value));
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
