import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import TileLayer from 'ol/layer/Tile.js';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import GeoTIFF from 'ol/source/GeoTIFF.js';
import TileWMS from 'ol/source/TileWMS.js';

import { NL_EXTENT, PDOK_GRID, RD, RD_EXTENT, basemap, keepFitted } from '../../shared/rd.js';
import { FARMED_MUTED, FIRST_YEAR, hexToRgba, landusePalette, yearPalette } from './colors.js';
import { LGN_WMS_URL } from './lgn.js';

export { RD, keepFitted };

export const COG_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif';
export const LANDUSE_COG_URL = 'https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_landuse_lgn2025.tif';

let sharedYears = null;

/**
 * The years COG as one source for every layer that shows it (main map, the LGN mask, the hotspot maps).
 * Source Coop answers slowly and caches nothing, so the file header is read once and the 64 kB blocks
 * geotiff.js fetches are shared: a second layer asking for the same tile waits for the same request.
 * The block cache is larger than the default 100 so those layers do not evict each other's blocks.
 */
function yearsSource() {
  sharedYears ??= new GeoTIFF({
    sources: [{ url: COG_URL, nodata: 0 }],
    sourceOptions: { cacheSize: 400 },
    normalize: false,
    interpolate: false,
    projection: RD,
    attributions: 'Fields: RVO BRP via <a href="https://source.coop/ftw/harmonized-field-data">Fields of the World</a> (CC0)',
  });
  return sharedYears;
}

/** The COG itself, read with HTTP range requests; colours come from yearPalette. */
export function yearsLayer(maxYear) {
  return new WebGLTileLayer({
    source: yearsSource(),
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
export function landuseLayer(maxYear, showFarmed = true) {
  return new WebGLTileLayer({
    source: new GeoTIFF({
      sources: [{ url: COG_URL, nodata: 0 }, { url: LANDUSE_COG_URL }],
      normalize: false,
      interpolate: false,
      projection: RD,
      attributions: 'Land use: LGN2025, <a href="https://lgn.nl/">Wageningen Environmental Research</a> (CC BY 4.0)',
    }),
    style: landuseStyle(maxYear, showFarmed),
    preload: Infinity,
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
 * WebGL layer, drawn to its own hidden canvas (own className); after each frame of the WMS layer its
 * canvas keeps only the pixels where that mask is opaque. Add both layers, mask first.
 * The mask reads band 1, the last year, from `source`: give it the source of the colour layer on show
 * (setSource), so its tiles are the ones that layer already fetched.
 */
export function lgnOnLostLand(maxYear, source) {
  const mask = new WebGLTileLayer({
    className: 'lgn-mask',
    source,
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
    setSource(source) {
      mask.setSource(source);
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
