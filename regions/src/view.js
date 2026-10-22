/**
 * The overview archive and the page's address: `#lon,lat,zoom,group+group`, the groups coloured on the map.
 */
import { toLonLat } from 'ol/proj.js';

import { GROUP } from './groups.js';

/** Fields per A5 cell and their hectares per crop group, r4 at z0 to r11 at z7: scripts/regions/cells.py. */
export const OVERVIEW_PMTILES = 'https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data-overview.pmtiles';

/** The address as { center: [lon, lat], zoom, groups }, or null when it is not one. */
export function parseHash(hash) {
  const [lon, lat, zoom, groups = ''] = hash.replace(/^#/, '').split(',');
  const numbers = [lon, lat, zoom].map(Number);
  const list = [...new Set(decodeURIComponent(groups).split('+'))].filter((g) => GROUP[g]);
  if (!lon || !numbers.every(Number.isFinite)) return null;
  return { center: numbers.slice(0, 2), zoom: numbers[2], groups: list };
}

/** The address of a place and the coloured groups. */
export const hashOf = (center, zoom, groups) =>
  `#${[...center.map((v) => v.toFixed(4)), String(+zoom.toFixed(2)), groups.join('+')].join(',')}`;

/** Put the map's place and the groups in the address, without a history entry. */
export function writeHash(map, groups) {
  const view = map.getView();
  if (!view.getCenter()) return;
  history.replaceState(null, '', hashOf(toLonLat(view.getCenter()), view.getZoom(), groups));
}
