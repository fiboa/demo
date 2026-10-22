import 'ol/ol.css';
import '../../shared/base.css';
import '../../shared/map-page.css';
import './style.css';

import us from 'flag-icons/flags/4x3/us.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import es from 'flag-icons/flags/4x3/es.svg?url';
import nl from 'flag-icons/flags/4x3/nl.svg?url';
import ie from 'flag-icons/flags/4x3/ie.svg?url';
import pl from 'flag-icons/flags/4x3/pl.svg?url';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import { fromLonLat } from 'ol/proj.js';
import XYZ from 'ol/source/XYZ.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import { PMTilesVectorSource } from 'ol-pmtiles';

import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { FIELDS_PMTILES } from '../../shared/fields.js';
import { retryTiles } from '../../shared/pmtiles.js';
import { EXAMPLES, FIRST_EXAMPLE, exampleHash } from './examples.js';
import { GROUP, GROUPS, STEPS, cellShare, counted, describeCell, groupOf, stepOf } from './groups.js';
import { OVERVIEW_PMTILES, parseHash, writeHash } from './view.js';

const $ = (selector) => document.querySelector(selector);
const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
// Up to this zoom the overview cells, from it the fields: the global archive thins its fields in dense regions
// further out (the Netherlands at zoom 11: a third of them).
const FIELD_ZOOM = 11;

const FLAGS = { us, fr, es, nl, ie, pl };
const PICTURES = import.meta.glob('../examples/*.jpg', { eager: true, query: '?url', import: 'default' });
const countryName = new Intl.DisplayNames(['en'], { type: 'region' });

const state = { groups: [...FIRST_EXAMPLE.groups] };

// ------------------------------------------------------------------ map

const hex2rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const styles = new Map();
function cached(key, make) {
  if (!styles.has(key)) styles.set(key, make());
  return styles.get(key);
}
const faintCell = new Style({ fill: new Fill({ color: 'rgba(35, 51, 43, 0.07)' }) });
const faintField = new Style({
  fill: new Fill({ color: 'rgba(35, 51, 43, 0.06)' }),
  stroke: new Stroke({ color: 'rgba(35, 51, 43, 0.22)', width: 0.6 }),
});

function cellStyle(feature) {
  const { share, top } = cellShare(feature.getProperties(), state.groups);
  const step = stepOf(Math.min(share, 1));
  if (step < 0 || !top) return faintCell;
  return cached(`c${top}${step}`, () => {
    const [r, g, b] = hex2rgb(GROUP[top].colour);
    return new Style({ fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, ${STEPS[step][1]})` }) });
  });
}

function fieldStyle(feature, resolution) {
  if (!counted(feature.get('collection'))) return null;
  const group = groupOf(feature.get('hcat:code'));
  if (!group || !state.groups.includes(group)) return faintField;
  // Outlines from zoom ~13 on; further out they would grey the colours.
  const outlined = resolution < 20;
  return cached(`f${group}${outlined}`, () => new Style({
    fill: new Fill({ color: GROUP[group].colour }),
    stroke: outlined ? new Stroke({ color: 'rgba(255, 255, 255, 0.7)', width: 0.75 }) : undefined,
  }));
}

const overviewUrl = new URLSearchParams(location.search).get('overview') ?? OVERVIEW_PMTILES;
const cells = new VectorTileLayer({
  source: retryTiles(new PMTilesVectorSource({ url: overviewUrl })),
  maxZoom: FIELD_ZOOM,
  declutter: false,
  style: cellStyle,
});
const fields = new VectorTileLayer({
  source: retryTiles(
    new PMTilesVectorSource({
      url: FIELDS_PMTILES,
      attributions:
        'Fields: <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World harmonized field data</a>',
    }),
  ),
  minZoom: FIELD_ZOOM,
  declutter: false,
  style: fieldStyle,
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
    cells,
    fields,
  ],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ center: fromLonLat(FIRST_EXAMPLE.center), zoom: FIRST_EXAMPLE.zoom, minZoom: 2, maxZoom: 17 }),
});
map.on('moveend', () => writeHash(map, state.groups));
// For scripts/regions/pictures.mjs: the map has drawn every tile of the current view.
map.on('rendercomplete', () => {
  document.documentElement.dataset.rendered = String(Date.now());
});

const zoomHint = $('#zoom-hint');
const updateHint = () => {
  const zoom = map.getView().getZoom();
  zoomHint.hidden = zoom >= FIELD_ZOOM - 1.5;
  zoomHint.textContent = 'Zoom in for every field: this far out the map sums them per cell';
};
map.getView().on('change:resolution', updateHint);
updateHint();

// ------------------------------------------------------------------ chosen crops and legend

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};
const swatch = (colour, extra = '') => el('span', { className: `swatch ${extra}`, style: colour ? `background:${colour}` : '' });

function renderChosen() {
  $('#chosen').replaceChildren(
    ...state.groups.map((id) => {
      const remove = el('button', { type: 'button', className: 'remove', title: `Stop colouring ${GROUP[id].name.toLowerCase()}` }, '×');
      remove.setAttribute('aria-label', `Remove ${GROUP[id].name}`);
      remove.addEventListener('click', () => {
        state.groups = state.groups.filter((g) => g !== id);
        apply();
      });
      return el('li', {}, swatch(GROUP[id].colour), el('span', {}, GROUP[id].name), remove);
    }),
  );
  const add = $('#add-group');
  add.replaceChildren(
    new Option(state.groups.length ? 'Add a crop…' : 'Choose a crop…', ''),
    ...GROUPS.filter((g) => !state.groups.includes(g.id)).map((g) => new Option(g.name, g.id)),
  );
  add.value = '';
}

function renderLegend() {
  const zoomedOut = map.getView().getZoom() < FIELD_ZOOM;
  // A ramp per chosen crop: a cell takes the colour of the one with the most land in it.
  const ramp = (id) => {
    const [r, g, b] = hex2rgb(GROUP[id].colour);
    return el('div', { className: 'legend-ramp', title: GROUP[id].name }, ...STEPS.map(([, a]) => el('span', { style: `background:rgba(${r}, ${g}, ${b}, ${a})` })));
  };
  $('#legend').replaceChildren(
    zoomedOut && state.groups.length
      ? el(
          'div',
          {},
          el('p', { className: 'legend-title' }, state.groups.length === 1 ? 'Share of the land in this crop' : 'Share of the land in these crops, coloured by the largest'),
          ...state.groups.map(ramp),
          el('div', { className: 'legend-ends' }, ...STEPS.map(([from]) => el('span', {}, pct.format(from)))),
          el('p', { className: 'legend-note' }, swatch(null, 'swatch-faint'), 'Fields, but less than 1%'),
        )
      : el('p', { className: 'legend-note' }, swatch(null, 'swatch-faint swatch-outline'), 'Other fields'),
  );
}

function apply() {
  renderChosen();
  renderLegend();
  cells.changed();
  fields.changed();
  writeHash(map, state.groups);
}

$('#add-group').addEventListener('change', (event) => {
  if (!event.target.value) return;
  state.groups = [...state.groups, event.target.value];
  apply();
});
let zoomedOut = null;
map.getView().on('change:resolution', () => {
  const now = map.getView().getZoom() < FIELD_ZOOM;
  if (now !== zoomedOut) renderLegend();
  zoomedOut = now;
});

// ------------------------------------------------------------------ hover

function describeField(feature) {
  const name = feature.get('hcat:name_en') || feature.get('crop:name');
  const group = groupOf(feature.get('hcat:code'));
  const title = COLLECTIONS[feature.get('collection')]?.title ?? feature.get('collection');
  const crop = name ? name[0].toUpperCase() + name.slice(1).toLowerCase().replaceAll('_', ' ') : 'No crop given';
  return `${crop}${group ? ` (${GROUP[group].name.toLowerCase()})` : ''} · ${title}`;
}

const tooltip = $('#map-tooltip');
map.on('pointermove', (event) => {
  if (event.dragging || event.originalEvent.pointerType === 'touch') return;
  const zoomedOut = map.getView().getZoom() < FIELD_ZOOM;
  const layer = zoomedOut ? cells : fields;
  const feature = map.getFeaturesAtPixel(event.pixel, { layerFilter: (l) => l === layer })
    .find((f) => zoomedOut || counted(f.get('collection')));
  if (!feature) {
    tooltip.hidden = true;
    return;
  }
  tooltip.textContent = zoomedOut ? describeCell(feature.getProperties(), state.groups) : describeField(feature);
  tooltip.hidden = false;
  const [x, y] = event.pixel;
  const { width } = map.getTargetElement().getBoundingClientRect();
  tooltip.style.transform = `translate(${Math.min(x + 14, width - tooltip.offsetWidth - 8)}px, ${y + 16}px)`;
});
map.getViewport().addEventListener('pointerleave', () => {
  tooltip.hidden = true;
});

// ------------------------------------------------------------------ examples and address

const flag = (country) =>
  el('img', { className: 'flag', src: FLAGS[country], alt: countryName.of(country.toUpperCase()), width: 20, height: 15 });

function renderExamples() {
  const toMap = () =>
    $('#map-section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#panel-examples').replaceChildren(
    ...EXAMPLES.map((e) => el('a', { href: exampleHash(e), title: e.title }, flag(e.country), ' ', e.short)),
  );
  $('#example-cards').replaceChildren(
    ...EXAMPLES.map((e) => {
      const picture = PICTURES[`../examples/${e.id}.jpg`];
      const card = el(
        'a',
        { className: 'example-card', href: exampleHash(e) },
        el(
          'span',
          { className: 'region-picture' },
          picture && el('img', { src: picture, alt: '', loading: 'lazy', width: 640, height: 400 }),
        ),
        el('h3', {}, flag(e.country), ' ', e.title),
        el('p', {}, e.text),
        el('p', { className: 'card-groups' }, ...e.groups.map((g) => el('span', {}, swatch(GROUP[g].colour), GROUP[g].name))),
      );
      // After the browser has followed the link: its fragment navigation would cancel a smooth scroll.
      card.addEventListener('click', () => setTimeout(toMap));
      return card;
    }),
  );
}

/** Go to a place and its crops: from the address, an example or a card. */
function go(target) {
  if (!target) return;
  const view = map.getView();
  const far = Math.abs(view.getZoom() - target.zoom) > 3;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.groups = target.groups;
  if (reduced || !view.getCenter()) {
    view.setCenter(fromLonLat(target.center));
    view.setZoom(target.zoom);
  } else {
    view.animate({ center: fromLonLat(target.center), zoom: target.zoom, duration: far ? 1600 : 900 });
  }
  apply();
}

$('#group-count').textContent = String(GROUPS.length);
renderExamples();
window.addEventListener('hashchange', () => go(parseHash(location.hash)));
// Read the address before `apply` writes the default one over it.
const first = parseHash(location.hash) ?? parseHash(exampleHash(FIRST_EXAMPLE));
state.groups = first.groups;
map.getView().setCenter(fromLonLat(first.center));
map.getView().setZoom(first.zoom);
apply();
