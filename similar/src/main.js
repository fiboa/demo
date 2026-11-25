import 'maplibre-gl/dist/maplibre-gl.css';
import '../../shared/base.css';
import '../../shared/map-page.css';
import './style.css';

import { BitmapLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { addProtocol, Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
// MapLibre looks for its worker next to its own module, which Vite moves; let Vite bundle the worker instead.
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { fromLonLat } from 'ol/proj.js';
import { PMTiles, Protocol } from 'pmtiles';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';
import { addPromptButton } from '../../shared/prompt.js';
import { compare, squareAround } from './compare.js';
import { chunkBounds, chunkSimilarity, cropKey, FIRST_YEAR, LAST_YEAR, sameCrop, strength } from './embed.js';
import { EXAMPLES } from './examples.js';
import { renderExamples } from './gallery.js';
import PROMPT from './prompt.js';

addPromptButton(PROMPT);

const $ = (selector) => document.querySelector(selector);
const hectares = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });

// The square around the clicked field in which fields are compared, in metres: 3 × 3 km is 6–16 chunks.
const AREA = 3000;
const FIELDS_MIN_ZOOM = 11;
const ALIKE = [255, 210, 63]; // --alike in style.css
const LISTED = 10;

setWorkerUrl(maplibreWorker);
const pmtiles = new PMTiles(FIELDS_PMTILES);
const protocol = new Protocol();
protocol.add(pmtiles);
addProtocol('pmtiles', protocol.tile);

const catalogIds = Object.keys(COLLECTIONS).filter(inCatalog);
const KEY = ['concat', ['get', 'collection'], '/', ['to-string', ['get', 'id']]];
const NONE = '\u0000'; // a key no field has

const map = new MapLibreMap({
  container: 'map',
  center: [EXAMPLES[0].lon, EXAMPLES[0].lat],
  zoom: 13.5,
  maxZoom: 18,
  attributionControl: { compact: true },
  style: {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery: Esri, Maxar, Earthstar Geographics',
      },
      fields: {
        type: 'vector',
        url: `pmtiles://${FIELDS_PMTILES}`,
        attribution: '<a href="https://source.coop/ftw/harmonized-field-data">Fields of the World</a>',
      },
      area: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-brightness-max': 0.8 } },
      {
        id: 'fields-fill',
        type: 'fill',
        source: 'fields',
        'source-layer': 'fields',
        minzoom: FIELDS_MIN_ZOOM,
        filter: ['in', ['get', 'collection'], ['literal', catalogIds]],
        paint: { 'fill-color': `rgb(${ALIKE})`, 'fill-opacity': 0 },
      },
      {
        id: 'fields-line',
        type: 'line',
        source: 'fields',
        'source-layer': 'fields',
        minzoom: FIELDS_MIN_ZOOM,
        filter: ['in', ['get', 'collection'], ['literal', catalogIds]],
        paint: { 'line-color': '#fff', 'line-opacity': 0.45, 'line-width': 0.7 },
      },
      {
        id: 'area',
        type: 'line',
        source: 'area',
        paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [3, 3] },
      },
      {
        id: 'hover',
        type: 'line',
        source: 'fields',
        'source-layer': 'fields',
        filter: ['==', KEY, NONE],
        paint: { 'line-color': '#23332b', 'line-width': 3 },
      },
      {
        id: 'chosen-halo',
        type: 'line',
        source: 'fields',
        'source-layer': 'fields',
        filter: ['==', KEY, NONE],
        paint: { 'line-color': '#23332b', 'line-width': 5 },
      },
      {
        id: 'chosen',
        type: 'line',
        source: 'fields',
        'source-layer': 'fields',
        filter: ['==', KEY, NONE],
        paint: { 'line-color': '#fff', 'line-width': 2.5 },
      },
    ],
  },
});
map.addControl(new NavigationControl({ showCompass: false }), 'top-left');

// deck.gl draws on a canvas of its own over the map: its interleaved mode fails with MapLibre 6.
const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
map.addControl(overlay);

// ------------------------------------------------------------------ panel

const years = $('#year');
for (let y = LAST_YEAR; y >= FIRST_YEAR; y--) years.append(new Option(String(y), String(y)));

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

const hover = (key) => map.setFilter('hover', ['==', KEY, key ?? NONE]);

function showResult(result) {
  const { field, fields, year } = result;
  const chosen = fields.find((f) => f.key === field.key);
  const others = fields.filter((f) => f.key !== field.key);
  const crop = chosen?.crop;
  const collection = COLLECTIONS[field.collection];
  const area = field.properties['metrics:area'];
  $('#panel-start').hidden = true;
  $('#panel-result').hidden = false;
  $('#field-title').textContent = crop ?? 'A field without a crop';
  $('#field-facts').textContent =
    `${collection?.title ?? field.collection}${area ? `, ${hectares.format(area / 1e4)} ha` : ''}` +
    `${collection?.year ? `, crops of ${collection.year}` : ''}; embeddings of ${year}. ` +
    `${others.length} fields compared within ${AREA / 2000} km.`;
  const verdict = $('#field-verdict');
  const same = sameCrop(chosen, others);
  const key = chosen && cropKey(chosen);
  if (!chosen) {
    verdict.textContent = 'The embeddings have no data for this field.';
  } else if (!same) {
    verdict.textContent = crop ? 'No other fields to compare with here.' : 'This collection names no crops, so only the colours tell.';
  } else {
    verdict.replaceChildren(
      el('strong', {}, `${same.hits} of the ${same.top}`),
      ` fields most alike grow ${crop.toLowerCase()} too, against ${same.base} of all ${same.all} fields around it (${pct.format(same.base / same.all)}).`,
      same.all < others.length
        ? ` ${others.length - same.all} fields that name no crop${same.byCode ? ' in HCAT' : ''} are left out of these counts.`
        : '',
    );
  }
  const ranked = [...others].sort((a, b) => b.similarity - a.similarity).slice(0, LISTED);
  $('#field-list').replaceChildren(
    ...ranked.map((f, i) => {
      const li = el(
        'li',
        {},
        el('span', { className: 'rank' }, String(i + 1)),
        el('span', { className: key && cropKey(f) === key ? 'same' : '' }, f.crop ?? 'no crop named'),
        el('span', { className: 'score' }, twoDecimals.format(f.similarity)),
      );
      li.addEventListener('mouseenter', () => hover(f.key));
      li.addEventListener('mouseleave', () => hover(null));
      return li;
    }),
  );
  $('#legend-low').textContent = `${twoDecimals.format(result.low)}, the median`;
}

// ------------------------------------------------------------------ map colours

let result = null;

function paint() {
  if (!result) return; // nothing compared yet
  const pairs = result.fields.flatMap((f) => [f.key, f.key === result.field.key ? 0 : 0.85 * strength(f.similarity, result.low)]);
  const pixels = $('#pixels').checked;
  // With the pixels on, they colour the fields too; the outlines stay.
  map.setPaintProperty('fields-fill', 'fill-opacity', pairs.length && !pixels ? ['match', KEY, ...pairs, 0] : 0);
  map.setFilter('chosen', ['==', KEY, result.field.key]);
  map.setFilter('chosen-halo', ['==', KEY, result.field.key]);
  overlay.setProps({ layers: pixels ? pixelLayers(result) : [] });
}

/** One bitmap per chunk: every pixel in the colour of its similarity to the clicked field. */
const bitmaps = new WeakMap();
function pixelLayers(r) {
  if (!r.query) return [];
  if (!bitmaps.has(r)) {
    bitmaps.set(
      r,
      [...r.chunks].map(([key, data]) => {
        const sim = chunkSimilarity(data, r.query);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const context = canvas.getContext('2d');
        const image = context.createImageData(256, 256);
        for (let i = 0; i < sim.length; i++) {
          const t = Number.isNaN(sim[i]) ? 0 : strength(sim[i], r.low);
          image.data.set([...ALIKE, Math.round(255 * 0.8 * t)], i * 4);
        }
        context.putImageData(image, 0, 0);
        const [cy, cx] = key.split('/').map(Number);
        return { key, canvas, bounds: chunkBounds(cy, cx) };
      }),
    );
  }
  return bitmaps.get(r).map(
    ({ key, canvas, bounds }) =>
      new BitmapLayer({ id: `pixels-${key}`, image: canvas, bounds, textureParameters: { minFilter: 'nearest', magFilter: 'nearest' } }),
  );
}
$('#pixels').addEventListener('change', paint);

// ------------------------------------------------------------------ choosing a field

let run = 0;
let current = null; // { point, key, year }

/** Compare the field at lon/lat with those around it, in `year` or the year of the field's collection. */
async function choose(point, year) {
  const mine = ++run;
  // The result of the previous field goes at once; the status line above it says what is loading.
  $('#panel-result').hidden = true;
  status('Finding the field…');
  try {
    const found = await fieldAt(pmtiles, fromLonLat(point), inCatalog, undefined, preferred);
    if (mine !== run) return;
    if (!found) {
      status('No field of the catalog here.');
      return;
    }
    const key = `${found.collection}/${found.id}`;
    const y = year ?? Math.min(LAST_YEAR, Math.max(FIRST_YEAR, COLLECTIONS[found.collection]?.year ?? LAST_YEAR));
    years.value = String(y);
    current = { point, key, year: y };
    const extent = squareAround(point, AREA);
    map.getSource('area').setData(square(extent));
    // Clear the colours of the previous comparison while this one loads.
    result = null;
    map.setPaintProperty('fields-fill', 'fill-opacity', 0);
    overlay.setProps({ layers: [] });
    map.setFilter('chosen', ['==', KEY, key]);
    map.setFilter('chosen-halo', ['==', KEY, key]);
    const started = performance.now();
    const r = await compare(pmtiles, {
      pick: key,
      extent,
      year: y,
      progress: (text) => mine === run && status(text),
    });
    if (mine !== run) return;
    if (!r) {
      status('The field could not be read from the tiles.', true);
      return;
    }
    result = r;
    showResult(r);
    paint();
    status(`Compared in ${hectares.format((performance.now() - started) / 1000)} s.`);
  } catch (error) {
    if (mine === run) status(`Could not compare: ${error.message}`, true);
  }
}

/** The extent as a GeoJSON polygon in lon/lat. */
function square([x0, y0, x1, y1]) {
  const ll = (x, y) => [(x / 6378137) * (180 / Math.PI), (Math.atan(Math.exp(y / 6378137)) * 2 - Math.PI / 2) * (180 / Math.PI)];
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)]] }, properties: {} };
}

years.addEventListener('change', () => {
  if (current) writeHash(current.point, Number(years.value));
});

map.on('click', 'fields-fill', (event) => {
  writeHash([event.lngLat.lng, event.lngLat.lat]);
});
map.on('mousemove', 'fields-fill', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'fields-fill', () => (map.getCanvas().style.cursor = ''));
const hint = $('#zoom-hint');
const updateHint = () => (hint.hidden = map.getZoom() >= FIELDS_MIN_ZOOM);
map.on('zoom', updateHint);
updateHint();

// ------------------------------------------------------------------ address: #lon,lat[,year]

function writeHash([lon, lat], year) {
  location.hash = `${lon.toFixed(5)},${lat.toFixed(5)}${year ? `,${year}` : ''}`;
}

function readHash() {
  const parts = location.hash.slice(1).split(',').map(Number);
  if (parts.length < 2 || !parts.slice(0, 2).every(Number.isFinite)) return null;
  return { point: parts.slice(0, 2), year: Number.isInteger(parts[2]) ? parts[2] : undefined };
}

function follow() {
  const target = readHash();
  if (!target) return;
  const bounds = map.getBounds();
  const [lon, lat] = target.point;
  if (!bounds.contains([lon, lat]) || map.getZoom() < 13) map.jumpTo({ center: target.point, zoom: 14 });
  choose(target.point, target.year);
}
window.addEventListener('hashchange', follow);

const scrollToMap = () => $('#map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
renderExamples($('#panel-examples'), $('#example-cards'), scrollToMap);
map.on('load', follow);
