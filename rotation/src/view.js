/**
 * The rotation archive and the page's address: `#lon,lat,zoom,view[,fieldLon,fieldLat]`, where view is
 * `varied`, a crop group id ("how often" that group) or a year ("the crop of" that year).
 */
import { toLonLat } from 'ol/proj.js';

import { GROUP } from './crops.js';

/** Every field of the newest editions with its crops of every year: built by scripts/rotation/build.py. */
export const ROTATION_PMTILES = 'https://data.source.coop/ftw/harmonized-field-data/_demo/rotation/rotation.pmtiles';

const viewText = ({ view, group, year }) => (view === 'varied' ? 'varied' : view === 'often' ? group : String(year));

function viewOf(text) {
  if (text === 'varied') return { view: 'varied' };
  if (GROUP[text]) return { view: 'often', group: text };
  if (/^\d{4}$/.test(text)) return { view: 'year', year: Number(text) };
  return null;
}

/** The address as { center: [lon, lat], zoom, state, select: [lon, lat] | null }, or null when it is not one. */
export function parseHash(hash) {
  const [lon, lat, zoom, view, flon, flat] = hash.replace(/^#/, '').split(',');
  const numbers = [lon, lat, zoom].map(Number);
  const state = viewOf(view);
  if (!state || !numbers.every(Number.isFinite)) return null;
  const select = [flon, flat].map(Number);
  return { center: numbers.slice(0, 2), zoom: numbers[2], state, select: flon && select.every(Number.isFinite) ? select : null };
}

/** The address of a place, view and field. */
export function hashOf(center, zoom, state, select = null) {
  const parts = [...center.map((v) => v.toFixed(5)), String(+zoom.toFixed(2)), viewText(state)];
  if (select) parts.push(...select.map((v) => v.toFixed(5)));
  return `#${parts.join(',')}`;
}

/** Put the map's place, the view and the chosen field in the address, without a history entry. */
export function writeHash(map, state, select) {
  const view = map.getView();
  if (!view.getCenter()) return;
  history.replaceState(null, '', hashOf(toLonLat(view.getCenter()), view.getZoom(), state, select));
}
