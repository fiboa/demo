import 'ol/ol.css';
import '../../shared/base.css';
import '../../shared/map-page.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import XYZ from 'ol/source/XYZ.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { fieldAt } from '../../shared/fields.js';
import MATCH from '../data/match.json' with { type: 'json' };
import { GROUP, GROUPS, MIN_KNOWN, RAMP, counts, cropName, groupIn, series, share, shareStep, varied, variedStep } from './crops.js';
import { exampleHash } from './examples.js';
import { FIRST_EXAMPLE, renderExamples } from './gallery.js';
import { ROTATION_PMTILES, parseHash, writeHash } from './view.js';

const $ = (selector) => document.querySelector(selector);
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
// The archive starts at zoom 9 and thins the densest tiles below 12.
const MIN_ZOOM = 9;
const FULL_ZOOM = 12;
const FIRST_YEAR = Math.min(...Object.values(MATCH).map((m) => m.years[0]));
const LAST_YEAR = Math.max(...Object.values(MATCH).map((m) => m.years[1]));

// ------------------------------------------------------------------ what the map shows

const state = { view: 'varied', group: 'potatoes', year: LAST_YEAR };

/** The colour of a field's series in the current view, or null for none. */
function colourOf(list) {
  if (state.view === 'varied') {
    const n = varied(list);
    return n == null ? null : variedStep(n);
  }
  if (state.view === 'often') {
    const s = share(list, state.group);
    return s == null ? null : shareStep(s);
  }
  const g = groupIn(list, state.year);
  return g ? GROUP[g].colour : null;
}

/** One line on a field's series in the current view, for the tooltip. */
function describe(list) {
  const known = list.filter((x) => x.group).length;
  if (state.view === 'year') {
    const x = list.find((y) => y.year === state.year);
    return x?.group ? `${state.year}: ${cropName(x.code) ?? GROUP[x.group].name}` : `${state.year}: no crop registered`;
  }
  if (known < MIN_KNOWN) return `Only ${known} ${known === 1 ? 'year' : 'years'} with a crop`;
  if (state.view === 'varied') {
    const n = varied(list);
    return `${n} crop ${n === 1 ? 'group' : 'groups'} in ${known} years`;
  }
  const n = list.filter((x) => x.group === state.group).length;
  return `${GROUP[state.group].name}: ${n} of ${known} years`;
}

// Parsing a series is cheap but runs for every field on every redraw; keep the last ones by their text.
const parsed = new Map();
function seriesOf(feature) {
  const key = `${feature.get('y0')}:${feature.get('crops')}`;
  let list = parsed.get(key);
  if (!list) {
    if (parsed.size > 50000) parsed.clear();
    list = series({ y0: feature.get('y0'), crops: feature.get('crops') });
    parsed.set(key, list);
  }
  return list;
}

// ------------------------------------------------------------------ map

let selected = null; // "collection/id" of the field in the panel

const styles = new Map();
const edge = new Stroke({ color: 'rgba(255, 255, 255, 0.7)', width: 0.75 });
const blank = new Style({ stroke: new Stroke({ color: 'rgba(35, 51, 43, 0.35)', width: 0.75 }) });
const selectedStyle = [
  new Style({ stroke: new Stroke({ color: '#fff', width: 5 }) }),
  new Style({ stroke: new Stroke({ color: '#23332b', width: 2.5 }) }),
];
function fillStyle(colour, outlined) {
  const key = `${colour}${outlined}`;
  if (!styles.has(key)) styles.set(key, new Style({ fill: new Fill({ color: colour }), stroke: outlined ? edge : undefined }));
  return styles.get(key);
}

const source = new PMTilesVectorSource({
  url: ROTATION_PMTILES,
  attributions:
    'Fields: <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World harmonized field data</a>',
});
const fields = new VectorTileLayer({
  source,
  minZoom: MIN_ZOOM - 0.5,
  declutter: false,
  style: (feature, resolution) => {
    const colour = colourOf(seriesOf(feature));
    // Outlines from zoom ~13 on; further out they would grey the colours.
    const style = colour ? fillStyle(colour, resolution < 20) : blank;
    return `${feature.get('collection')}/${feature.get('id')}` === selected ? [style, ...selectedStyle] : style;
  },
});
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
    fields,
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat([6, 53]), zoom: 6, maxZoom: 18 }),
});

const zoomHint = $('#zoom-hint');
const updateHint = () => {
  const zoom = map.getView().getZoom();
  zoomHint.hidden = zoom >= FULL_ZOOM;
  zoomHint.textContent = zoom < MIN_ZOOM - 0.5 ? 'Zoom in to the Netherlands, Flanders or Denmark' : 'Zoom in for every field: this far out the map shows a sample';
};
map.getView().on('change:resolution', updateHint);
updateHint();
map.on('moveend', () => writeHash(map, state, selectedAt));

// ------------------------------------------------------------------ controls and legend

const viewSelect = $('#view');
const groupSelect = $('#often-group');
const yearInput = $('#year');
for (const g of GROUPS.filter((g) => g.id !== 'other')) groupSelect.append(new Option(g.name, g.id));
Object.assign(yearInput, { min: FIRST_YEAR, max: LAST_YEAR, value: LAST_YEAR });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};
const swatch = (colour, label) =>
  el('li', {}, el('span', { className: 'swatch', style: `background:${colour}` }), label);

function renderLegend() {
  const legend = $('#legend');
  const none = el('li', {}, el('span', { className: 'swatch swatch-none' }), state.view === 'year' ? 'No crop registered' : `Fewer than ${MIN_KNOWN} years known`);
  if (state.view === 'year') {
    legend.replaceChildren(el('ul', { className: 'legend-groups' }, ...GROUPS.map((g) => swatch(g.colour, g.name)), none));
    return;
  }
  const ramp = el('div', { className: 'legend-ramp' }, ...RAMP.map((c) => el('span', { style: `background:${c}` })));
  const ends =
    state.view === 'varied'
      ? el('div', { className: 'legend-ends' }, el('span', {}, '1 crop group'), el('span', {}, `${RAMP.length} or more`))
      : el('div', { className: 'legend-ends' }, el('span', {}, 'Never'), el('span', {}, 'Every year'));
  legend.replaceChildren(ramp, ends, el('ul', { className: 'legend-groups' }, none));
}

function apply({ redraw = true } = {}) {
  viewSelect.value = state.view;
  groupSelect.value = state.group;
  yearInput.value = state.year;
  $('#year-out').textContent = String(state.year);
  $('#often-control').hidden = state.view !== 'often';
  $('#year-control').hidden = state.view !== 'year';
  renderLegend();
  if (redraw) fields.changed();
  if (shown) renderStrip(shown);
  writeHash(map, state, selectedAt);
}

viewSelect.addEventListener('change', () => {
  state.view = viewSelect.value;
  apply();
});
groupSelect.addEventListener('change', () => {
  state.group = groupSelect.value;
  apply();
});
yearInput.addEventListener('input', () => {
  state.year = Number(yearInput.value);
  apply();
});

// ------------------------------------------------------------------ hover

const tooltip = $('#map-tooltip');
map.on('pointermove', (event) => {
  if (event.dragging || event.originalEvent.pointerType === 'touch') return;
  const feature = map.getView().getZoom() >= MIN_ZOOM - 0.5 && map.getFeaturesAtPixel(event.pixel, { layerFilter: (l) => l === fields })[0];
  if (!feature) {
    tooltip.hidden = true;
    map.getTargetElement().style.cursor = '';
    return;
  }
  map.getTargetElement().style.cursor = 'pointer';
  tooltip.textContent = describe(seriesOf(feature));
  tooltip.hidden = false;
  const [x, y] = event.pixel;
  const { width } = map.getTargetElement().getBoundingClientRect();
  tooltip.style.transform = `translate(${Math.min(x + 14, width - tooltip.offsetWidth - 8)}px, ${y + 16}px)`;
});
map.getViewport().addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});

// ------------------------------------------------------------------ one field

let shown = null; // { collection, id, properties, list } in the panel
let selectedAt = null; // [lon, lat] of the click that chose it
let request = null;

function status(text, isError = false) {
  const s = $('#panel-status');
  s.hidden = !text;
  s.textContent = text ?? '';
  s.classList.toggle('is-error', isError);
}

/** The field at `coordinate` (EPSG:3857): from the drawn tiles when they hold it, else from the archive's z14. */
async function selectAt(coordinate) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  selectedAt = toLonLat(coordinate).map((v) => +v.toFixed(5));
  const pixel = map.getPixelFromCoordinate(coordinate);
  const drawn = pixel && map.getView().getZoom() >= 12 && map.getFeaturesAtPixel(pixel, { layerFilter: (l) => l === fields })[0];
  let found = drawn && { collection: drawn.get('collection'), id: drawn.get('id'), properties: drawn.getProperties() };
  if (!found) {
    status('Finding the field…');
    try {
      found = await fieldAt(source.pmtiles_, coordinate, () => true, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      status('The field could not be read. Click it again to retry.', true);
      return;
    }
    if (controller.signal.aborted) return;
  }
  if (!found) {
    status('No field here in the Netherlands, Flanders or Denmark.');
    return;
  }
  status(null);
  const p = found.properties;
  shown = { collection: found.collection, id: found.id, properties: p, list: series({ y0: p.y0, crops: p.crops }) };
  selected = `${found.collection}/${found.id}`;
  fields.changed();
  renderStrip(shown);
  writeHash(map, state, selectedAt);
}

function renderStrip({ collection, properties, list }) {
  const newest = list.at(-1);
  $('#panel-start').hidden = true;
  $('#panel-result').hidden = false;
  $('#field-title').textContent = cropName(newest?.code) ?? properties.crop ?? 'Field';
  const c = COLLECTIONS[collection];
  $('#field-facts').textContent = [properties.crop && properties.crop !== $('#field-title').textContent ? `“${properties.crop}”` : null, c?.title ?? collection]
    .filter(Boolean)
    .join(', ');

  // A cell per year in the colour of its group; the chosen year or group stands out.
  $('#strip').style.setProperty('--years', list.length);
  $('#strip').replaceChildren(
    ...list.map((x) => {
      const name = x.group ? (cropName(x.code) ?? GROUP[x.group].name) : 'no crop registered';
      const mark = (state.view === 'year' && x.year === state.year) || (state.view === 'often' && x.group === state.group);
      return el(
        'li',
        { className: `strip-cell${x.group ? '' : ' is-none'}${mark ? ' is-marked' : ''}`, title: `${x.year}: ${name}` },
        el('span', { className: 'strip-colour', style: x.group ? `background:${GROUP[x.group].colour}` : '' }),
        el('span', { className: 'strip-year' }, `’${String(x.year).slice(2)}`),
        el('span', { className: 'strip-name' }, name),
      );
    }),
  );

  const known = list.filter((x) => x.group);
  const groups = counts(list);
  const summary = $('#field-summary');
  if (!known.length) {
    summary.replaceChildren('No crops registered on this spot before.');
    return;
  }
  const years = (ys) => (ys.length <= 4 ? ys.join(', ') : `${ys.length} times`);
  summary.replaceChildren(
    el('strong', {}, `${groups.length} crop ${groups.length === 1 ? 'group' : 'groups'} in ${known.length} years`),
    `: ${groups
      .slice(0, 4)
      .map((g) => `${GROUP[g.group].short} ${years(g.years)}`)
      .join('; ')}${groups.length > 4 ? '; …' : ''}.`,
  );
}

map.on('singleclick', (event) => {
  if (map.getView().getZoom() < MIN_ZOOM - 0.5) return;
  selectAt(event.coordinate);
});

// ------------------------------------------------------------------ about, examples, address

for (const span of document.querySelectorAll('[data-years]')) span.textContent = MATCH[span.dataset.years].years.join('–');
$('#coverage').textContent = Object.entries(MATCH)
  .map(([col, m]) => {
    const rates = Object.values(m.crop);
    return `${COLLECTIONS[col]?.title.replace(/^Field boundaries for /, '') ?? col}: ${new Intl.NumberFormat('en-GB').format(m.fields)} fields; a crop found for ${pct.format(Math.min(...rates))}–${pct.format(Math.max(...rates.slice(0, -1)))} of them in the older years`;
  })
  .join('. ')
  .concat('. Early registers hold fewer fields, so the first years are the emptiest.');

/** Go to a place and view: from the address, an example or a card. */
function go(target) {
  if (!target) return;
  // The place first: `apply` writes the address from the map.
  map.getView().setCenter(fromLonLat(target.center));
  map.getView().setZoom(target.zoom);
  selectedAt = target.select;
  Object.assign(state, target.state);
  apply();
  if (target.select) selectAt(fromLonLat(target.select));
}

renderExamples($('#panel-examples'), $('#example-cards'), () =>
  $('#map-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
);
window.addEventListener('hashchange', () => {
  const target = parseHash(location.hash);
  // Our own replaceState does not fire this; a link or an edited address does.
  if (target) go(target);
});
// Read the address before `apply` writes the default one over it.
const first = parseHash(location.hash) ?? parseHash(exampleHash(FIRST_EXAMPLE));
apply({ redraw: false });
go(first);
