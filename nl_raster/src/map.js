import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection } from 'ol/proj.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import XYZ from 'ol/source/XYZ.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import proj4 from 'proj4';

import { yearPalette } from './colors.js';

export const COG_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif';

proj4.defs(
  'EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 ' +
    '+ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
);
register(proj4);

// The PDOK tiling scheme for RD New (NL:SR EPSG:28992).
const RD_EXTENT = [-285401.92, 22598.08, 595401.92, 903401.92];
export const RD = getProjection('EPSG:28992');
RD.setExtent(RD_EXTENT);
const PDOK_GRID = new TileGrid({
  extent: RD_EXTENT,
  origin: [RD_EXTENT[0], RD_EXTENT[3]],
  resolutions: Array.from({ length: 15 }, (_, z) => 3440.64 / 2 ** z),
  tileSize: 256,
});
const NL_EXTENT = [13652, 306850, 277838, 613650];

function basemap() {
  return new TileLayer({
    source: new XYZ({
      url: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:28992/{z}/{x}/{y}.png',
      projection: RD,
      tileGrid: PDOK_GRID,
      attributions: 'Background: <a href="https://www.pdok.nl/">PDOK</a> BRT-Achtergrondkaart (CC BY 4.0)',
    }),
  });
}

/** The COG itself, read with HTTP range requests; colours come from yearPalette. */
export function yearsLayer(maxYear) {
  return new WebGLTileLayer({
    source: new GeoTIFF({
      sources: [{ url: COG_URL, nodata: 0 }],
      normalize: false,
      interpolate: false,
      projection: RD,
      attributions: 'Fields: RVO BRP via <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World</a> (CC0)',
    }),
    style: yearStyle(maxYear),
  });
}

export function yearStyle(maxYear) {
  return { color: ['palette', ['band', 1], yearPalette(maxYear)] };
}

/**
 * A map on the RD grid with the basemap and the year layer.
 * Mouse-wheel zoom only works after the map has focus, so the page keeps scrolling.
 */
export function createMap(target, { maxYear, extent = NL_EXTENT, interactive = true } = {}) {
  const layer = yearsLayer(maxYear);
  const map = new OlMap({
    target,
    layers: [basemap(), layer],
    interactions: interactive ? defaultInteractions({ onFocusOnly: true }) : [],
    controls: interactive ? undefined : [],
    view: new View({ projection: RD, extent: RD_EXTENT, constrainOnlyCenter: true, maxResolution: 3440.64, minResolution: 0.25 }),
  });
  const stopFitting = keepFitted(map, extent, [16, 16, 16, 16]);
  return { map, layer, stopFitting };
}

/**
 * Fit the view to `extent`, and fit again whenever the map's box changes size (late CSS, fonts, a
 * scrollbar), until someone pans or zooms the map themselves.
 */
export function keepFitted(map, extent, padding) {
  const fit = () => {
    map.updateSize();
    map.getView().fit(extent, { padding });
  };
  fit();
  const target = map.getTargetElement();
  const observer = new ResizeObserver(fit);
  observer.observe(target);
  const stop = () => observer.disconnect();
  for (const type of ['pointerdown', 'wheel', 'keydown']) target.addEventListener(type, stop, { once: true });
  return stop;
}

/** Pixel value of the year layer under a screen pixel, or null outside the data. */
export function valueAt(layer, pixel) {
  const data = layer.getData(pixel);
  return data ? data[0] : null;
}
