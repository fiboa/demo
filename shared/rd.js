/** Maps in RD New (EPSG:28992) on the PDOK tiling scheme, shared by the Dutch demos. */
import TileLayer from 'ol/layer/Tile.js';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection } from 'ol/proj.js';
import XYZ from 'ol/source/XYZ.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import proj4 from 'proj4';

proj4.defs(
  'EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 ' +
    '+ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
);
register(proj4);

// The PDOK tiling scheme for RD New (NL:SR EPSG:28992).
export const RD_EXTENT = [-285401.92, 22598.08, 595401.92, 903401.92];
export const RD = getProjection('EPSG:28992');
RD.setExtent(RD_EXTENT);
export const PDOK_GRID = new TileGrid({
  extent: RD_EXTENT,
  origin: [RD_EXTENT[0], RD_EXTENT[3]],
  resolutions: Array.from({ length: 15 }, (_, z) => 3440.64 / 2 ** z),
  tileSize: 256,
});
export const NL_EXTENT = [13652, 306850, 277838, 613650];

/** PDOK BRT-Achtergrondkaart; `variant` is 'grijs', 'standaard', 'pastel' or 'water'. */
export function basemap(variant = 'grijs') {
  return new TileLayer({
    source: new XYZ({
      url: `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${variant}/EPSG:28992/{z}/{x}/{y}.png`,
      projection: RD,
      tileGrid: PDOK_GRID,
      attributions: 'Background: <a href="https://www.pdok.nl/">PDOK</a> BRT-Achtergrondkaart (CC BY 4.0)',
    }),
  });
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
