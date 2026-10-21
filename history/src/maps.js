/**
 * The old maps of the history demo and the aerial photos of today, per region. A region is one outline in
 * history/data/regions.json; the old maps of a region are offered wherever the map is centred in it, and
 * its aerial photo is drawn inside it, over a world-wide one.
 */
import TileGrid from 'ol/tilegrid/TileGrid.js';
import TileWMS from 'ol/source/TileWMS.js';
import XYZ from 'ol/source/XYZ.js';

import { RD } from '../../shared/rd.js';
import REGIONS from '../data/regions.json' with { type: 'json' };

export { REGIONS };

export const REGION_NAMES = {
  nl: 'the Netherlands',
  'be-vlg': 'Flanders',
  fr: 'France',
  ch: 'Switzerland',
  'de-nw': 'North Rhine-Westphalia',
};

// ------------------------------------------------------------------ regions

/** Even-odd test of [x, y] against the rings of one polygon. */
function inRings(point, rings) {
  const [x, y] = point;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** The regions the lon/lat point lies in: one, or two along a border where the simplified outlines overlap. */
export function regionsAt(lonLat) {
  return REGIONS.features
    .filter((feature) => {
      const g = feature.geometry;
      const polygons = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      return polygons.some((rings) => inRings(lonLat, rings));
    })
    .map((feature) => feature.properties.region);
}

/** The region the lon/lat point lies in, or null. */
export const regionAt = (lonLat) => regionsAt(lonLat)[0] ?? null;

// ------------------------------------------------------------------ sources

const wmts = (base, layer, format, matrixSet = 'PM', style = 'normal') =>
  `${base}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=${style}&TILEMATRIXSET=${matrixSet}` +
  `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;

const IGN = 'https://data.geopf.fr/wmts';
const VL = 'https://geo.api.vlaanderen.be';
const NRW = 'https://www.wms.nrw.de/geobasis';

const ignAttribution = '<a href="https://geoservices.ign.fr/">IGN</a> Géoplateforme (Licence Ouverte)';
const vlAttribution = '<a href="https://www.vlaanderen.be/digitaal-vlaanderen">Digitaal Vlaanderen</a> (free reuse licence)';
const nrwAttribution = '<a href="https://www.bezreg-koeln.nrw.de/geobasis-nrw">Geobasis NRW</a> (dl-de/zero-2-0)';
const swissAttribution = '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>';

const xyz = (url, attributions, maxZoom = 18) => new XYZ({ url, attributions, maxZoom });
const wms = (service, layer, attributions, format = 'image/png') =>
  new TileWMS({ url: `${NRW}/${service}`, params: { LAYERS: layer, FORMAT: format, TRANSPARENT: format === 'image/png' }, attributions });

// Topotijdreis: the Kadaster's topographic maps of every edition, tiled by Esri Nederland in RD New.
const TOPOTIJDREIS_GRID = new TileGrid({
  extent: [-285, 269000, 295000, 671000],
  origin: [-30515500, 31112400],
  resolutions: Array.from({ length: 12 }, (_, z) => 3251.206502413005 / 2 ** z),
  tileSize: 256,
});
// The years with a service on tiles.arcgis.com (Historische_tijdreis_<year>), from its services list.
export const TOPOTIJDREIS_YEARS = [
  1815, 1820, 1850, 1851, 1854, 1855, 1856, 1858, 1860, 1861, 1862, 1863, 1864, 1865, 1866, 1868, 1869, 1870, 1871, 1872,
  1875, 1878, 1880, 1882, 1885, 1888, 1890, 1894, 1900, 1901, 1904, 1905, 1906, 1907, 1908, 1909, 1910, 1911, 1913, 1914,
  1915, 1916, 1917, 1918, 1919, 1920, 1922, 1923, 1924, 1925, 1926, 1927, 1929, 1930, 1931, 1932, 1933, 1935, 1936, 1937,
  1938, 1939, 1940, 1941, 1944, 1945, 1948, 1950, 1951, 1952, 1955, 1956, 1957, 1960, 1965, 1970, 1975, 1978, 1980, 1981,
  1988, 1990, 1998, 2000, 2005, 2010, 2011, 2014, 2016,
];
// swisstopo's time series: the state of the national maps at the end of every year.
export const SWISS_YEARS = Array.from({ length: 2021 - 1844 + 1 }, (_, i) => 1844 + i);

/**
 * The old maps. `years`: the editions to choose from, with `year` the default; `source(year)` makes the
 * OpenLayers source. `period` is what the menu shows next to the title when there is no year to choose.
 * `minZoom`: the service draws nothing further out (a WMS with a MaxScaleDenominator).
 */
export const OLD_MAPS = [
  {
    id: 'topotijdreis',
    region: 'nl',
    title: 'Topographic maps',
    years: TOPOTIJDREIS_YEARS,
    year: 1930,
    source: (year) =>
      new XYZ({
        url: `https://tiles.arcgis.com/tiles/nSZVuSZjHpEZZbRo/arcgis/rest/services/Historische_tijdreis_${year}/MapServer/tile/{z}/{y}/{x}`,
        projection: RD,
        tileGrid: TOPOTIJDREIS_GRID,
        attributions: `Old map: <a href="https://www.topotijdreis.nl/">Topotijdreis</a> ${year}, Esri Nederland and Kadaster (CC BY 4.0)`,
      }),
  },
  {
    id: 'frickx',
    region: 'be-vlg',
    title: 'Fricx map',
    period: '1712',
    source: () => xyz(wmts(`${VL}/HISTCART/wmts`, 'frickx', 'image/png', 'GoogleMapsVL', ''), `Old map: Fricx (1712), ${vlAttribution}`),
  },
  {
    id: 'ferraris',
    region: 'be-vlg',
    title: 'Ferraris map',
    period: '1777',
    source: () => xyz(wmts(`${VL}/HISTCART/wmts`, 'ferraris', 'image/png', 'GoogleMapsVL', ''), `Old map: Ferraris (1777), ${vlAttribution}`),
  },
  {
    id: 'abw',
    region: 'be-vlg',
    title: 'Atlas der Buurtwegen',
    period: 'about 1841',
    source: () => xyz(wmts(`${VL}/HISTCART/wmts`, 'abw', 'image/png', 'GoogleMapsVL', ''), `Old map: Atlas der Buurtwegen (about 1841), ${vlAttribution}`),
  },
  {
    id: 'vandermaelen',
    region: 'be-vlg',
    title: 'Vandermaelen map',
    period: '1846–1854',
    source: () => xyz(wmts(`${VL}/HISTCART/wmts`, 'vandermaelen', 'image/png', 'GoogleMapsVL', ''), `Old map: Vandermaelen (1846–1854), ${vlAttribution}`),
  },
  {
    id: 'popp',
    region: 'be-vlg',
    title: 'Popp cadastral map',
    period: '1842–1879',
    source: () => xyz(wmts(`${VL}/HISTCART/wmts`, 'popp', 'image/png', 'GoogleMapsVL', ''), `Old map: Popp (1842–1879), ${vlAttribution}`),
  },
  {
    id: 'vl-2000',
    region: 'be-vlg',
    title: 'Aerial photos',
    period: '2000–2003',
    source: () => xyz(wmts(`${VL}/OMW/wmts`, 'omwrgb00_03vl', 'image/png', 'GoogleMapsVL', ''), `Old photo: winter orthophotos 2000–2003, ${vlAttribution}`, 19),
  },
  {
    id: 'cassini',
    region: 'fr',
    title: 'Cassini map',
    period: '1756–1789',
    source: () => xyz(wmts(IGN, 'BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI', 'image/png'), `Old map: Cassini, BnF and ${ignAttribution}`, 14),
  },
  {
    id: 'etatmajor',
    region: 'fr',
    title: 'État-major map',
    period: '1820–1866',
    source: () => xyz(wmts(IGN, 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', 'image/jpeg'), `Old map: carte de l'état-major, ${ignAttribution}`, 15),
  },
  {
    id: 'fr-1950',
    region: 'fr',
    title: 'Aerial photos',
    period: '1950–1965',
    source: () => xyz(wmts(IGN, 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', 'image/png'), `Old photo: aerial photos 1950–1965, ${ignAttribution}`),
  },
  {
    id: 'fr-1980',
    region: 'fr',
    title: 'Aerial photos',
    period: '1980–1995',
    source: () => xyz(wmts(IGN, 'ORTHOIMAGERY.ORTHOPHOTOS.1980-1995', 'image/png', 'PM', 'BDORTHOHISTORIQUE'), `Old photo: aerial photos 1980–1995, ${ignAttribution}`),
  },
  {
    id: 'zeitreihen',
    region: 'ch',
    title: 'National maps',
    years: SWISS_YEARS,
    year: 1880,
    source: (year) =>
      xyz(
        `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.zeitreihen/default/${year}1231/3857/{z}/{x}/{y}.png`,
        `Old map: Journey through time ${year}, ${swissAttribution}`,
      ),
  },
  {
    id: 'uraufnahme',
    region: 'de-nw',
    title: 'Uraufnahme',
    period: '1836–1850',
    minZoom: 13.5,
    source: () => wms('wms_nw_uraufnahme', 'nw_uraufnahme_rw', `Old map: Uraufnahme 1836–1850, ${nrwAttribution}`),
  },
  {
    id: 'neuaufnahme',
    region: 'de-nw',
    title: 'Neuaufnahme',
    period: '1891–1912',
    source: () => wms('wms_nw_neuaufnahme', 'nw_neuaufnahme', `Old map: Neuaufnahme 1891–1912, ${nrwAttribution}`),
  },
  {
    id: 'tk25',
    region: 'de-nw',
    title: 'Topographic map 1:25,000',
    period: '1936–1945',
    minZoom: 14.4,
    source: () => wms('wms_nw_tk25_1936-1945', 'nw_tk25_1936-1945', `Old map: TK25 1936–1945, ${nrwAttribution}`),
  },
];

export const mapById = (id) => OLD_MAPS.find((m) => m.id === id) ?? null;
export const mapsIn = (region) => OLD_MAPS.filter((m) => m.region === region);

/** The edition of `map` nearest to `year` (the default edition without one). */
export function nearestYear(map, year) {
  if (!map.years) return null;
  if (!Number.isFinite(year)) return map.year;
  return map.years.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best));
}

/** The label of a map with its edition: "Topographic maps, 1930" or "Ferraris map, 1777". */
export const mapLabel = (map, year) => `${map.title}, ${map.years ? year : map.period}`;

// ------------------------------------------------------------------ today

export const WORLD_IMAGERY = () =>
  xyz(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'Aerial photo: Esri, Maxar, Earthstar Geographics and the GIS User Community',
    19,
  );

/** The newest aerial photo of each region, drawn only inside its outline. */
export const TODAY = {
  nl: () =>
    xyz(
      'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
      'Aerial photo: <a href="https://www.pdok.nl/">PDOK</a> Luchtfoto, Beeldmateriaal Nederland (CC BY 4.0)',
      19,
    ),
  'be-vlg': () =>
    xyz(wmts(`${VL}/OMWRGBMRVL/wmts`, 'omwrgbmrvl', 'image/png', 'GoogleMapsVL', ''), `Aerial photo: newest winter orthophotos, ${vlAttribution}`, 19),
  fr: () => xyz(wmts(IGN, 'ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'), `Aerial photo: ${ignAttribution}`, 19),
  ch: () => xyz('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg', `Aerial photo: SWISSIMAGE, ${swissAttribution}`, 19),
  'de-nw': () => wms('wms_nw_dop', 'nw_dop_rgb', `Aerial photo: DOP, ${nrwAttribution}`, 'image/jpeg'),
};
