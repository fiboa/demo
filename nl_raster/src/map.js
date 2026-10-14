import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection } from 'ol/proj.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import TileWMS from 'ol/source/TileWMS.js';
import XYZ from 'ol/source/XYZ.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import proj4 from 'proj4';

import { FARMED_MUTED, FIRST_YEAR, hexToRgba, landusePalette, yearPalette } from './colors.js';
import { LGN_WMS_URL } from './lgn.js';

export const COG_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif';
export const LANDUSE_COG_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_landuse_lgn2025.tif';

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
    // While new tiles load, OpenLayers draws the nearest coarser level it has. Without preloading
    // that is often the overview of the whole country; with it, one level coarser (a quarter of the tiles).
    preload: Infinity,
  });
}

export function yearStyle(maxYear, showFarmed = true) {
  return { color: ['palette', ['band', 1], yearPalette(maxYear, showFarmed)] };
}

/**
 * Both COGs as two bands of one source (same grid, same tiles): band 1 the last year, band 2 the LGN2025
 * group. Land gone by `maxYear` takes its group colour; land farmed after it is muted.
 */
export function landuseLayer(maxYear) {
  return new WebGLTileLayer({
    source: new GeoTIFF({
      sources: [{ url: COG_URL, nodata: 0 }, { url: LANDUSE_COG_URL }],
      normalize: false,
      interpolate: false,
      projection: RD,
      attributions: 'Land use: LGN2025, <a href="https://lgn.nl/">Wageningen Environmental Research</a> (CC BY 4.0)',
    }),
    style: landuseStyle(maxYear),
    preload: Infinity,
    visible: false,
  });
}

/** Style expression: band 1 (the last year) says the land was gone by `maxYear`. */
function lostBy(maxYear) {
  return ['all', ['>=', ['band', 1], FIRST_YEAR - 2000], ['<=', ['band', 1], maxYear - 2000]];
}

export function landuseStyle(maxYear, showFarmed = true) {
  const farmed = showFarmed ? hexToRgba(FARMED_MUTED) : [0, 0, 0, 0];
  return {
    color: ['case', lostBy(maxYear), ['palette', ['band', 2], landusePalette()], ['>', ['band', 1], 0], farmed, [0, 0, 0, 0]],
  };
}

function lostMaskStyle(maxYear) {
  return { color: ['case', lostBy(maxYear), [0, 0, 0, 1], [0, 0, 0, 0]] };
}

/**
 * LGN2025 in its own colours (PDOK WMS), cut out to the land gone by `maxYear`. The cut-out is a second
 * WebGL layer on the years COG, drawn to its own hidden canvas (own className); after each frame of the
 * WMS layer its canvas keeps only the pixels where that mask is opaque. Add both layers, mask first.
 */
export function lgnOnLostLand(maxYear) {
  const mask = new WebGLTileLayer({
    className: 'lgn-mask',
    source: new GeoTIFF({ sources: [{ url: COG_URL, nodata: 0 }], normalize: false, interpolate: false, projection: RD }),
    style: lostMaskStyle(maxYear),
    preload: Infinity,
    visible: false,
  });
  const lgn = new TileLayer({
    className: 'lgn-layer',
    source: new TileWMS({
      url: LGN_WMS_URL,
      params: { LAYERS: 'lgn-actueel', FORMAT: 'image/png', TRANSPARENT: true },
      projection: RD,
      tileGrid: PDOK_GRID,
      attributions: 'LGN2025 via <a href="https://www.pdok.nl/">PDOK</a>, Wageningen Environmental Research (CC BY 4.0)',
    }),
    visible: false,
  });
  lgn.on('postrender', (event) => {
    const maskCanvas = mask.getRenderer()?.helper?.getCanvas();
    const ctx = event.context;
    if (!maskCanvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });
  return {
    layers: [mask, lgn],
    setVisible(visible) {
      mask.setVisible(visible);
      lgn.setVisible(visible);
    },
    setMaxYear(year) {
      mask.setStyle(lostMaskStyle(year));
    },
  };
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
    // By default OpenLayers loads no tiles during a zoom or drag; land that comes into view then shows the
    // coarsest cached level until the gesture ends.
    loadTilesWhileAnimating: true,
    loadTilesWhileInteracting: true,
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
