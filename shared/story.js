/**
 * A story told on a globe: the globe stays in place while cards scroll past it, and each card flies the globe
 * to its place and shows the collections it is about, from each collection's own PMTiles. Zoomed out, every
 * collection is a bubble at the centre of its extent, sized by its number of fields.
 *
 * Used by the outlines and tour demos; a step is
 *   { id, kicker, title, html, view: { center, zoom, bearing?, pitch? }, show?: [collection ids],
 *     outline?: [collection ids drawn as outlines only], bubbles?: boolean }
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import './story.css';

import * as maplibregl from 'maplibre-gl';
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';

import COLLECTIONS from './collections.json' with { type: 'json' };
import { bubbles, KINDS } from './story-facts.js';

export { KINDS };

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const kindColour = (kind) => KINDS[kind]?.colour ?? '#888888';

function addCollection(map, id) {
  const source = `c-${id}`;
  if (map.getSource(source)) return;
  const c = COLLECTIONS[id];
  map.addSource(source, { type: 'vector', url: `pmtiles://${c.pmtiles}`, attribution: c.publisher ?? undefined });
  const colour = kindColour(c.boundaries);
  map.addLayer(
    { id: `${source}-fill`, type: 'fill', source, 'source-layer': id, layout: { visibility: 'none' }, paint: { 'fill-color': colour, 'fill-opacity': 0.28 } },
    'bubbles',
  );
  map.addLayer(
    { id: `${source}-line`, type: 'line', source, 'source-layer': id, layout: { visibility: 'none' }, paint: { 'line-color': colour, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 1.6] } },
    'bubbles',
  );
}

function setVisible(map, step, all) {
  const show = new Set(step.show ?? []);
  const outline = new Set(step.outline ?? []);
  for (const id of all) {
    const fill = show.has(id) ? 'visible' : 'none';
    const line = show.has(id) || outline.has(id) ? 'visible' : 'none';
    map.setLayoutProperty(`c-${id}-fill`, 'visibility', fill);
    map.setLayoutProperty(`c-${id}-line`, 'visibility', line);
  }
  // Lines of a collection drawn as outline only take its kind's colour, or white next to a filled collection of
  // the same kind (Poland's declared fields over its reference parcels).
  const shownKinds = new Set([...show].map((id) => COLLECTIONS[id].boundaries));
  for (const id of outline) {
    const kind = COLLECTIONS[id].boundaries;
    map.setPaintProperty(`c-${id}-line`, 'line-color', shownKinds.has(kind) ? '#ffffff' : kindColour(kind));
  }
  // The bubbles of the collections a step is about stand out; zoomed in they fade (see the paint below).
  map.setLayoutProperty('bubbles', 'visibility', step.bubbles === false ? 'none' : 'visible');
  map.setPaintProperty('bubbles', 'circle-stroke-width', ['case', ['in', ['get', 'id'], ['literal', [...show]]], 2.5, 0.75]);
}

/** A legend of the three kinds, in the page's own ink; the swatch carries the colour. */
export function legend() {
  const list = document.createElement('ul');
  list.className = 'story-legend';
  for (const [kind, { label, colour, text }] of Object.entries(KINDS)) {
    const item = document.createElement('li');
    item.innerHTML = `<span class="swatch" style="background:${colour}"></span><strong>${label}</strong> <span>${text}</span>`;
    item.dataset.kind = kind;
    list.append(item);
  }
  return list;
}

/**
 * Build the story in `root`: a sticky globe and one card per step. `onStep(step, index)` is called when a card
 * becomes the current one.
 */
export function story(root, steps, { onStep = () => {} } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.createElement('div');
  stage.className = 'story-stage';
  const globe = document.createElement('div');
  globe.className = 'story-globe';
  globe.setAttribute('role', 'img');
  globe.setAttribute('aria-label', 'Globe that follows the story');
  stage.append(globe);
  const cards = document.createElement('ol');
  cards.className = 'story-steps';
  steps.forEach((step, i) => {
    const card = document.createElement('li');
    card.className = 'story-step';
    card.id = step.id;
    card.dataset.index = String(i);
    card.innerHTML = `<div class="story-card">
      <p class="story-kicker">${step.kicker ?? `${i + 1} of ${steps.length}`}</p>
      <h2>${step.title}</h2>
      ${step.html}
    </div>`;
    cards.append(card);
  });
  root.append(stage, cards);

  // MapLibre 6 starts its worker from a module next to its own, which Vite moves: point it at the bundled one.
  maplibregl.setWorkerUrl(maplibreWorker);
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  const first = steps[0].view;
  const map = new maplibregl.Map({
    container: globe,
    style: {
      version: 8,
      projection: { type: 'globe' },
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        imagery: { type: 'raster', tiles: [IMAGERY], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
        bubbles: { type: 'geojson', data: bubbles() },
      },
      layers: [
        { id: 'imagery', type: 'raster', source: 'imagery' },
        {
          id: 'bubbles',
          type: 'circle',
          source: 'bubbles',
          paint: {
            'circle-color': ['match', ['get', 'kind'], ...Object.entries(KINDS).flatMap(([k, v]) => [k, v.colour]), '#888888'],
            // A zoom expression must be the outer one; the area of a bubble follows the number of fields.
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['max', 3, ['/', ['sqrt', ['get', 'fields']], 300]], 6, ['max', 7.5, ['/', ['sqrt', ['get', 'fields']], 120]]],
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 7, 0],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 4, 1, 7, 0],
            'circle-stroke-width': 0.75,
          },
        },
      ],
    },
    center: first.center,
    zoom: first.zoom,
    bearing: first.bearing ?? 0,
    pitch: first.pitch ?? 0,
    interactive: false,
    attributionControl: { compact: true },
    validateStyle: true,
  });
  map.on('error', (event) => console.error('[story]', event.error?.message ?? event));

  const all = [...new Set(steps.flatMap((s) => [...(s.show ?? []), ...(s.outline ?? [])]))];
  let current = -1;
  let ready = false;
  const go = (i) => {
    if (i === current) return;
    current = i;
    const step = steps[i];
    for (const card of cards.children) card.classList.toggle('is-current', Number(card.dataset.index) === i);
    const view = { center: step.view.center, zoom: step.view.zoom, bearing: step.view.bearing ?? 0, pitch: step.view.pitch ?? 0 };
    if (reduced) map.jumpTo(view);
    else map.flyTo({ ...view, duration: 4000, essential: true });
    // isStyleLoaded() is false while tiles load, so keep our own flag for "the layers exist".
    if (ready) setVisible(map, step, all);
    onStep(step, i);
  };

  map.on('load', () => {
    for (const id of all) addCollection(map, id);
    ready = true;
    setVisible(map, steps[Math.max(current, 0)], all);
  });

  // The card whose middle crosses the middle of the screen is the current one.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) go(Number(entry.target.dataset.index));
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  for (const card of cards.children) observer.observe(card);
  go(0);
  return map;
}
