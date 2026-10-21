import 'ol/ol.css';
import '../../shared/base.css';
import '../../shared/map-page.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { boundingExtent } from 'ol/extent.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { FIELDS_PMTILES, fieldAt, hasCrop, isFields } from '../../shared/fields.js';
import { FIRST_EXAMPLE, renderExamples } from './gallery.js';
import { REGION_NAMES, REGIONS, TODAY, WORLD_IMAGERY, mapById, mapLabel, mapsIn, nearestYear, regionsAt } from './maps.js';
import { Swipe, clipToOutline } from './swipe.js';

const $ = (selector) => document.querySelector(selector);
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
// The archive thins its low zoom levels; further out than this the fields are a sample and stay hidden.
const FIELDS_MIN_ZOOM = 12;
const fieldsResolution = 156543.03392804097 / 2 ** FIELDS_MIN_ZOOM;

// ------------------------------------------------------------------ layers

let selected = null; // "collection/id" of the clicked field
const FIELD_COLOUR = '#ff3dbb';
// Thinner where the fields are small on screen, so the map under them still shows.
const fieldStyle = new Style({ stroke: new Stroke({ color: FIELD_COLOUR, width: 1.25 }) });
const farFieldStyle = new Style({ stroke: new Stroke({ color: FIELD_COLOUR, width: 0.75 }) });
const selectedStyle = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 5 }) }),
  new Style({ stroke: new Stroke({ color: FIELD_COLOUR, width: 2.5 }) }),
];

const fieldsSource = new PMTilesVectorSource({
  url: FIELDS_PMTILES,
  attributions:
    'Fields: <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World harmonized field data</a>',
});
const fields = new VectorTileLayer({
  source: fieldsSource,
  minZoom: FIELDS_MIN_ZOOM - 0.5,
  style: (feature, resolution) => {
    if (!isFields(feature.get('collection')) || resolution > fieldsResolution * 1.5) return undefined;
    if (`${feature.get('collection')}/${feature.get('id')}` === selected) return selectedStyle;
    return resolution > fieldsResolution / 2 ? farFieldStyle : fieldStyle;
  },
});

// Today: Esri's photos everywhere, the national ones inside their region.
const todayLayers = REGIONS.features
  .filter((f) => TODAY[f.properties.region])
  .map((f) => {
    const g = f.geometry;
    const polygons = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    const rings = polygons.flat().map((ring) => ring.map((c) => fromLonLat(c)));
    const layer = new TileLayer({ source: TODAY[f.properties.region](), extent: boundingExtent(rings.flat()) });
    return { layer, rings };
  });

const old = new TileLayer();

const map = new OlMap({
  target: 'map',
  layers: [new TileLayer({ source: WORLD_IMAGERY() }), ...todayLayers.map((t) => t.layer), old, fields],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat([5.68, 52.68]), zoom: 12, maxZoom: 19 }),
});
for (const { layer, rings } of todayLayers) clipToOutline(map, layer, rings);

// The line starts in the middle of the part of the map the panel leaves free.
function freeMiddle() {
  const panel = $('.map-panel');
  const width = map.getTargetElement().offsetWidth;
  const floating = getComputedStyle(panel).position === 'absolute';
  return floating && width ? (width - panel.offsetWidth - 24) / 2 / width : 0.5;
}
const swipe = new Swipe(map, $('#swipe'), { split: freeMiddle() });
swipe.clip(old);
// Again whenever the map changes size (late CSS, a scrollbar), until someone moves the line.
const resize = new ResizeObserver(() => {
  if (swipe.touched) resize.disconnect();
  else swipe.set(freeMiddle());
});
resize.observe(map.getTargetElement());

let current = { map: null, year: null }; // the old map on show

const zoomHint = $('#zoom-hint');
/** Ask to zoom in where the old map or the fields do not show yet. */
const updateHint = () => {
  const zoom = map.getView().getZoom();
  const minOld = current.map?.minZoom ?? 0;
  const fieldsHidden = $('#show-fields').checked && zoom < FIELDS_MIN_ZOOM;
  zoomHint.hidden = zoom >= minOld && !fieldsHidden;
  zoomHint.textContent = zoom < minOld ? `Zoom in to see the ${current.map.title}` : 'Zoom in to see the fields';
};
map.getView().on('change:resolution', updateHint);

// ------------------------------------------------------------------ the old map and its menu

let region = null; // the region the menu was made for

function status(text, isError = false) {
  const el = $('#panel-status');
  el.hidden = !text;
  el.textContent = text ?? '';
  el.classList.toggle('is-error', isError);
}

/** Show the old map `id` in edition `year` (the nearest one it has). */
function showOld(id, year = null) {
  const m = mapById(id);
  if (!m) return;
  const edition = nearestYear(m, year);
  if (current.map === m && current.year === edition) return;
  const sameMap = current.map === m;
  current = { map: m, year: edition };
  old.setSource(m.source(edition));
  old.setMinZoom(m.minZoom ?? -Infinity);
  updateHint();
  $('#label-old').textContent = mapLabel(m, edition);
  if (!sameMap) fillMenu(m.region);
  $('#old-map').value = m.id;
  const row = $('#year-row');
  row.hidden = !m.years;
  if (m.years) {
    const input = $('#old-year');
    input.max = String(m.years.length - 1);
    input.value = String(m.years.indexOf(edition));
    input.setAttribute('aria-valuetext', String(edition));
    $('#old-year-text').textContent = String(edition);
  }
  writeHash();
}

function fillMenu(r) {
  region = r;
  const options = mapsIn(r).map((m) => new Option(`${m.title}${m.years ? '' : `, ${m.period}`}`, m.id));
  $('#old-map').replaceChildren(...options);
  if (current.map) $('#old-map').value = current.map.id;
}

let lastHere = ''; // the regions at the centre after the previous move

/**
 * After a move: offer the maps of the region in the middle. Moving into a region without the map on show
 * switches to the first map there; along a border, or after a jump (`jumped`, an example or an address), the
 * map on show stays.
 */
function followRegion(jumped = false) {
  const here = regionsAt(toLonLat(map.getView().getCenter()));
  const moved = here.join() !== lastHere;
  lastHere = here.join();
  const note = $('#region-note');
  if (!here.length) {
    const names = Object.values(REGION_NAMES);
    note.textContent = `No old maps here. This page has them for ${names.slice(0, -1).join(', ')} and ${names.at(-1)}.`;
    return;
  }
  const keep = here.includes(current.map?.region) || jumped || !moved;
  const r = keep ? current.map.region : here[0];
  note.textContent = here.includes(r) ? `Old maps of ${REGION_NAMES[r]}.` : `Old maps of ${REGION_NAMES[r]}; move into it for more of this map.`;
  if (r !== current.map?.region) showOld(mapsIn(r)[0].id, current.year);
  else if (r !== region) fillMenu(r);
}

$('#old-map').addEventListener('change', (event) => showOld(event.target.value, current.year));

let yearTimer = 0;
$('#old-year').addEventListener('input', (event) => {
  const year = current.map.years[Number(event.target.value)];
  $('#old-year-text').textContent = String(year);
  event.target.setAttribute('aria-valuetext', String(year));
  // Load the edition once the slider rests a moment, not every one it passes.
  clearTimeout(yearTimer);
  yearTimer = setTimeout(() => showOld(current.map.id, year), 250);
});

$('#show-fields').addEventListener('change', (event) => {
  fields.setVisible(event.target.checked);
  updateHint();
});

// ------------------------------------------------------------------ fields

let request = null;

async function showField(coordinate) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  status('Finding the field…');
  try {
    const found = await fieldAt(fieldsSource.pmtiles_, coordinate, isFields, controller.signal, hasCrop);
    if (controller.signal.aborted) return;
    status(null);
    selected = found ? `${found.collection}/${found.id}` : null;
    fields.changed();
    $('#panel-field').hidden = !found;
    if (!found) return;
    const p = found.properties;
    const crop = p['crop:name'] || p['hcat:name_en'];
    $('#field-title').textContent = crop || 'Field';
    const facts = [];
    if (p['hcat:name_en'] && p['hcat:name_en'] !== crop) facts.push(p['hcat:name_en']);
    if (p['metrics:area']) facts.push(`${oneDecimal.format(p['metrics:area'] / 1e4)} ha`);
    const c = COLLECTIONS[found.collection];
    facts.push(`${c?.title ?? found.collection}${c?.year ? `, ${c.year}` : ''}`);
    $('#field-facts').textContent = facts.join(', ');
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error(error);
    status('The field could not be read. Click it again to retry.', true);
  }
}

map.on('singleclick', (event) => {
  if (!fields.getVisible() || map.getView().getZoom() < FIELDS_MIN_ZOOM) return;
  showField(event.coordinate);
});

// ------------------------------------------------------------------ address

// #lon,lat,zoom,map[,year]
function writeHash() {
  if (!current.map) return;
  const view = map.getView();
  const [lon, lat] = toLonLat(view.getCenter());
  const parts = [lon.toFixed(5), lat.toFixed(5), (+view.getZoom().toFixed(2)).toString(), current.map.id];
  if (current.year) parts.push(current.year);
  history.replaceState(null, '', `#${parts.join(',')}`);
}

function fromHash() {
  const [lon, lat, zoom, id, year] = location.hash.slice(1).split(',');
  if (![lon, lat, zoom].map(Number).every(Number.isFinite) || !mapById(id)) return null;
  return { lon: Number(lon), lat: Number(lat), zoom: Number(zoom), map: id, year: year ? Number(year) : null };
}

function go(target) {
  map.getView().setCenter(fromLonLat([target.lon, target.lat]));
  map.getView().setZoom(target.zoom);
  current = { map: null, year: null };
  showOld(target.map, target.year);
  followRegion(true);
  selected = null;
  $('#panel-field').hidden = true;
  fields.changed();
}

map.on('moveend', () => {
  followRegion();
  writeHash();
});
window.addEventListener('hashchange', () => {
  const target = fromHash();
  if (target) go(target);
});

renderExamples($('#panel-examples'), $('#example-cards'), () =>
  $('#map-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
);

go(fromHash() ?? FIRST_EXAMPLE);
updateHint();
