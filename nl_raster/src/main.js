import 'ol/ol.css';
import '../../shared/base.css';
import './style.css';

import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { Fill, Stroke, Style } from 'ol/style.js';

import clusters from '../data/clusters.json';
import crops from '../data/crops.json';
import municipalities from '../data/municipalities.json';
import shapesUrl from '../data/municipalities.geojson?url';
import years from '../data/years.json';
import { barChart, fmt, pct, tableInto } from './charts.js';
import { FIRST_YEAR, LAST_YEAR, LOST_RAMP, yearColor } from './colors.js';
import { COG_URL, RD, createMap, keepFitted, valueAt, yearStyle } from './map.js';

const LOST_YEARS = Array.from({ length: years.lost_max_year - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const lostOf = (byYear) => sum(LOST_YEARS.map((y) => byYear[y] ?? 0));
const everOf = (byYear) => sum(Object.values(byYear));
const $ = (selector) => document.querySelector(selector);

// ------------------------------------------------------------------ key figures

const lost = lostOf(years.ha_by_last_year);
const stillFarmed = years.ha_by_last_year[LAST_YEAR];
const ever = everOf(years.ha_by_last_year);

$('#lost-ha').textContent = fmt.format(lost);
$('#fig-lost').textContent = fmt.format(lost);
$('#fig-share').textContent = pct.format(lost / ever);
$('#fig-per-year').textContent = fmt.format(lost / LOST_YEARS.length);
$('#fig-farmed').textContent = fmt.format(stillFarmed);
$('#fig-2025').textContent = fmt.format(years.ha_by_last_year[years.lost_max_year]);
for (const el of document.querySelectorAll('[data-cog-url]')) el.href = COG_URL;

// ------------------------------------------------------------------ main map + slider

const { map, layer, stopFitting } = createMap('map', { maxYear: years.lost_max_year });
const slider = $('#year');
const sliderOutput = $('#year-out');
const tooltip = $('#map-tooltip');

function showYear(maxYear) {
  layer.setStyle(yearStyle(maxYear));
  sliderOutput.textContent = maxYear;
  slider.value = maxYear;
}
slider.min = FIRST_YEAR;
slider.max = years.lost_max_year;
slider.addEventListener('input', () => showYear(Number(slider.value)));
showYear(years.lost_max_year);

let playing = null;
$('#play').addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (playing) {
    clearInterval(playing);
    playing = null;
    button.textContent = 'Play';
    return;
  }
  let year = FIRST_YEAR;
  button.textContent = 'Pause';
  showYear(year);
  playing = setInterval(() => {
    year += 1;
    showYear(year);
    if (year >= years.lost_max_year) {
      clearInterval(playing);
      playing = null;
      button.textContent = 'Play';
    }
  }, 700);
});

map.on('pointermove', (event) => {
  const value = event.dragging ? null : valueAt(layer, event.pixel);
  if (!value) {
    tooltip.hidden = true;
    return;
  }
  const year = 2000 + value;
  tooltip.textContent = year === LAST_YEAR ? 'Still a field in 2026' : `Last a field in ${year}`;
  tooltip.style.transform = `translate(${event.pixel[0] + 14}px, ${event.pixel[1] + 14}px)`;
  tooltip.hidden = false;
});
map.getViewport().addEventListener('pointerleave', () => (tooltip.hidden = true));

$('#legend').style.setProperty('--ramp', `linear-gradient(to right, ${LOST_RAMP.join(', ')})`);

// ------------------------------------------------------------------ year by year

barChart($('#chart-years'), {
  labels: LOST_YEARS.map(String),
  values: LOST_YEARS.map((y) => years.ha_by_last_year[y]),
  colors: LOST_YEARS.map((y) => `rgb(${yearColor(y - 2000, years.lost_max_year).slice(0, 3)})`),
  details: $('#table-years'),
});

// ------------------------------------------------------------------ clusters

const clusterList = $('#cluster-list');
for (const [i, cluster] of clusters.clusters.entries()) {
  const peak = Object.entries(cluster.lost_ha_by_last_year).sort((a, b) => b[1] - a[1])[0][0];
  const figure = document.createElement('figure');
  figure.className = 'cluster';
  figure.innerHTML = `
    <div class="cluster-map" id="cluster-${i}"></div>
    <figcaption>
      <strong></strong>
      <span class="cluster-facts"></span>
      <button type="button" class="link-button">Show on the large map</button>
    </figcaption>`;
  figure.querySelector('strong').textContent = `${cluster.municipality}, ${cluster.province}`;
  figure.querySelector('.cluster-facts').textContent =
    `${fmt.format(cluster.lost_ha)} ha gone, most of it last farmed in ${peak}`;
  figure.querySelector('button').addEventListener('click', () => {
    stopFitting();
    map.getView().fit(cluster.bbox, { padding: [40, 40, 40, 40], duration: 600 });
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  clusterList.append(figure);
  createMap(`cluster-${i}`, { maxYear: years.lost_max_year, extent: cluster.bbox, interactive: false });
}

// ------------------------------------------------------------------ municipalities

const byCode = new Map(
  municipalities.municipalities.map((m) => {
    const lostHa = lostOf(m.ha_by_last_year);
    const everHa = everOf(m.ha_by_last_year);
    return [m.code, { ...m, lostHa, everHa, share: everHa ? lostHa / everHa : 0 }];
  }),
);
const BLUES = ['#b7d3f6', '#6da7ec', '#2a78d6', '#1c5cab', '#0d366b'];
let metric = 'lostHa';

function breaks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
}
let classBreaks = breaks([...byCode.values()].map((m) => m[metric]));
const classOf = (v) => classBreaks.filter((b) => v > b).length;
const styleCache = BLUES.map(
  (color) => new Style({ fill: new Fill({ color }), stroke: new Stroke({ color: '#ffffff', width: 0.6 }) }),
);
const highlight = new Style({ stroke: new Stroke({ color: '#23332b', width: 2.5 }) });
let highlighted = null;

const shapes = new VectorLayer({
  source: new VectorSource({ url: shapesUrl, format: new GeoJSON({ featureProjection: RD }) }),
  style: (feature) => {
    const m = byCode.get(feature.get('statcode'));
    const base = m ? styleCache[classOf(m[metric])] : null;
    return feature.get('statcode') === highlighted ? [base, highlight] : base;
  },
});
const choropleth = new OlMap({
  target: 'choropleth',
  layers: [shapes],
  interactions: defaultInteractions({ onFocusOnly: true }),
  view: new View({ projection: RD, center: [155000, 463000], resolution: 400 }),
});
shapes.getSource().once('featuresloadend', () =>
  keepFitted(choropleth, shapes.getSource().getExtent(), [8, 8, 8, 8]),
);

const choroTip = $('#choropleth-tooltip');
choropleth.on('pointermove', (event) => {
  const feature = choropleth.forEachFeatureAtPixel(event.pixel, (f) => f);
  const m = feature && byCode.get(feature.get('statcode'));
  setHighlight(m?.code ?? null);
  if (!m) {
    choroTip.hidden = true;
    return;
  }
  choroTip.textContent = `${m.name}: ${fmt.format(m.lostHa)} ha gone, ${pct.format(m.share)} of its farmland`;
  choroTip.style.transform = `translate(${event.pixel[0] + 14}px, ${event.pixel[1] + 14}px)`;
  choroTip.hidden = false;
});
choropleth.getViewport().addEventListener('pointerleave', () => {
  choroTip.hidden = true;
  setHighlight(null);
});

function setHighlight(code) {
  if (code === highlighted) return;
  highlighted = code;
  shapes.changed();
  for (const row of document.querySelectorAll('#top-municipalities tbody tr')) {
    row.classList.toggle('is-highlighted', row.dataset.code === code);
  }
}

function renderLegend() {
  const format = metric === 'share' ? (v) => pct.format(v) : (v) => `${fmt.format(v)} ha`;
  const edges = [0, ...classBreaks];
  $('#choropleth-legend').replaceChildren(
    ...BLUES.map((color, i) => {
      const item = document.createElement('li');
      item.style.setProperty('--swatch', color);
      item.textContent = i < classBreaks.length ? `${format(edges[i])} – ${format(edges[i + 1])}` : `over ${format(edges[i])}`;
      return item;
    }),
  );
}

// A share of a few hectares says little, so the share ranking skips municipalities with little farmland.
const MIN_FARMLAND_HA = 500;

function renderTop() {
  const tbody = $('#top-municipalities tbody');
  const ranked = metric === 'share' ? [...byCode.values()].filter((m) => m.everHa >= MIN_FARMLAND_HA) : [...byCode.values()];
  const top = ranked.sort((a, b) => b[metric] - a[metric]).slice(0, 20);
  $('#top-municipalities caption').textContent =
    metric === 'share' ? `Top 20 with at least ${fmt.format(MIN_FARMLAND_HA)} ha of farmland` : 'Top 20';
  tbody.replaceChildren(
    ...top.map((m, i) => {
      const tr = document.createElement('tr');
      tr.dataset.code = m.code;
      for (const text of [i + 1, m.name, m.province, fmt.format(m.lostHa), pct.format(m.share)]) {
        tr.appendChild(document.createElement('td')).textContent = text;
      }
      tr.addEventListener('pointerenter', () => setHighlight(m.code));
      tr.addEventListener('pointerleave', () => setHighlight(null));
      return tr;
    }),
  );
}

for (const button of document.querySelectorAll('[data-metric]')) {
  button.addEventListener('click', () => {
    metric = button.dataset.metric;
    for (const b of document.querySelectorAll('[data-metric]')) b.setAttribute('aria-pressed', String(b === button));
    classBreaks = breaks([...byCode.values()].map((m) => m[metric]));
    shapes.changed();
    renderLegend();
    renderTop();
  });
}
renderLegend();
renderTop();

const provinces = {};
for (const m of byCode.values()) provinces[m.province] = (provinces[m.province] ?? 0) + m.lostHa;
const provinceRows = Object.entries(provinces).sort((a, b) => b[1] - a[1]);
barChart($('#chart-provinces'), {
  labels: provinceRows.map(([name]) => name),
  values: provinceRows.map(([, ha]) => ha),
  colors: '#2a78d6',
  horizontal: true,
  details: $('#table-provinces'),
});
$('#outside-ha').textContent = fmt.format(lostOf(municipalities.outside_municipalities));

// ------------------------------------------------------------------ last crop

const humanize = (name) => name.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
const cropTotals = Object.entries(crops.ha_by_last_year)
  .map(([code, byYear]) => [code, lostOf(byYear)])
  .sort((a, b) => b[1] - a[1]);
const unmapped = cropTotals.find(([code]) => code === '0')?.[1] ?? 0;
const mapped = cropTotals.filter(([code]) => code !== '0');
const TOP_CROPS = 12;
const cropRows = [
  ...mapped.slice(0, TOP_CROPS).map(([code, ha]) => [humanize(crops.crops[code]?.name ?? code), ha]),
  ['All other crops', sum(mapped.slice(TOP_CROPS).map(([, ha]) => ha))],
  ['Crop not mapped to HCAT', unmapped],
];
barChart($('#chart-crops'), {
  labels: cropRows.map(([name]) => name),
  values: cropRows.map(([, ha]) => ha),
  colors: cropRows.map((_, i) => (i < TOP_CROPS ? '#56705f' : '#a3ada6')),
  horizontal: true,
  details: $('#table-crops'),
});
$('#crop-unmapped').textContent = pct.format(unmapped / sum(cropTotals.map(([, ha]) => ha)));

$('#generated').textContent = years.generated;
