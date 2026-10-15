/**
 * Open height models of 1 m or finer that a browser can read directly (they send CORS headers), and the
 * fiboa collections whose fields they cover. Each model is read in its own coordinate system; OpenLayers
 * reprojects the result onto the map.
 */
import { fromArrayBuffer, fromUrl } from 'geotiff';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';

import '../../shared/rd.js'; // registers EPSG:28992
import NZ_SHEETS from '../data/nz_dem_1m.json' with { type: 'json' };

proj4.defs([
  ['EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:25833', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:3301', '+proj=lcc +lat_0=57.5175539305556 +lon_0=24 +lat_1=59.3333333333333 +lat_2=58 +x_0=500000 +y_0=6375000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:2056', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'],
  ['EPSG:2193', '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:2169', '+proj=tmerc +lat_0=49.8333333333333 +lon_0=6.16666666666667 +k=1 +x_0=80000 +y_0=100000 +ellps=intl +towgs84=-189.6806,18.3463,-42.7695,-0.33746,-3.09264,2.53861,0.4598 +units=m +no_defs'],
]);
register(proj4);

// ------------------------------------------------------------------ request templates

/** WCS 2.0.1 GetCoverage; `axes` name the subset axes, `scaleAxes` the SCALESIZE axes where they differ. */
const wcs20 = (url, coverage, { axes = ['x', 'y'], scaleAxes = axes } = {}) => (b, w, h) =>
  `${url}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${coverage}&format=image/tiff` +
  `&subset=${axes[0]}(${b[0]},${b[2]})&subset=${axes[1]}(${b[1]},${b[3]})` +
  `&scalesize=${scaleAxes[0]}(${w}),${scaleAxes[1]}(${h})`;

/** WCS 1.0.0 GetCoverage; several ArcGIS servers wrap 2.0.1 answers in multipart, but not 1.0.0 ones. */
const wcs10 = (url, coverage, crs) => (b, w, h) =>
  `${url}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=${coverage}&CRS=${crs}` +
  `&BBOX=${b.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=GeoTIFF`;

/** A WMS GetMap that answers in float GeoTIFF (IGN's WMS-R). */
const wmsGeotiff = (url, layer, crs) => (b, w, h) =>
  `${url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layer}&STYLES=&CRS=${crs}` +
  `&BBOX=${b.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/geotiff`;

/** ArcGIS ImageServer exportImage as float32 GeoTIFF. */
const imageServer = (url, sr) => (b, w, h) =>
  `${url}/exportImage?bbox=${b.join(',')}&bboxSR=${sr}&imageSR=${sr}&size=${w},${h}` +
  `&format=tiff&pixelType=F32&noData=-9999&interpolation=RSP_BilinearInterpolation&f=image`;

// ------------------------------------------------------------------ height models

/**
 * name, cell size in metres on the ground (`res`), years flown, licence, `crs` the model is read in, an
 * optional lon/lat `bounds` it is tried within, and either `url(bbox, width, height)` for a service that
 * answers with one GeoTIFF or `read(bbox, width, height, signal)` for cloud-optimised files.
 */
const AHN = {
  name: 'AHN4',
  res: 0.5,
  years: '2020–2022',
  licence: 'CC0',
  link: 'https://www.ahn.nl/',
  by: 'Rijkswaterstaat and the water boards, via PDOK',
  crs: 'EPSG:28992',
  url: wcs20('https://service.pdok.nl/rws/ahn/wcs/v1_0', 'dtm_05m'),
};
const DHMV = {
  name: 'DHMV II',
  res: 1,
  years: '2013–2015',
  licence: 'free reuse',
  link: 'https://www.vlaanderen.be/digitaal-vlaanderen/onze-oplossingen/earth-observation-data-science-eodas/het-digitaal-hoogtemodel',
  by: 'Digitaal Vlaanderen',
  crs: 'EPSG:3857',
  url: wcs10('https://geo.api.vlaanderen.be/DHMV/wcs', 'DHMVII_DTM_1m', 'EPSG:3857'),
};
const LIDAR_HD = {
  name: 'LiDAR HD',
  res: 0.5,
  years: '2020–2025',
  licence: 'Licence Ouverte 2.0',
  link: 'https://geoservices.ign.fr/lidarhd',
  by: 'IGN',
  crs: 'EPSG:2154',
  url: wmsGeotiff('https://data.geopf.fr/wms-r', 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', 'EPSG:2154'),
};
const RGE_ALTI = {
  name: 'RGE ALTI',
  res: 1,
  years: '2009–2021',
  licence: 'Licence Ouverte 2.0',
  link: 'https://geoservices.ign.fr/rgealti',
  by: 'IGN',
  crs: 'EPSG:2154',
  url: wmsGeotiff('https://data.geopf.fr/wms-r', 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES', 'EPSG:2154'),
};
const DGM1 = (state, years, by, licence, crs, url) => ({ name: `DGM1 ${state}`, res: 1, years, licence, by, crs, url });
const DGM1_NRW = { ...DGM1('NRW', '2019–2024', 'Geobasis NRW', 'dl-de/zero-2.0', 'EPSG:25832', wcs20('https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', 'nw_dgm')), link: 'https://www.bezreg-koeln.nrw.de/geobasis-nrw' };
const DGM1_BB = { ...DGM1('Brandenburg', '2019–2023', 'LGB Brandenburg', 'dl-de/by-2.0', 'EPSG:25833', wcs20('https://isk.geobasis-bb.de/ows/dgm_wcs', 'bb_dgm')), link: 'https://geobasis-bb.de/' };
const DGM1_MV = { ...DGM1('Mecklenburg-Vorpommern', '2017–2022', 'LAiV M-V', 'free reuse', 'EPSG:25833', wcs20('https://www.geodaten-mv.de/dienste/dgm_wcs', 'mv_dgm')), link: 'https://www.laiv-mv.de/' };
// The INSPIRE WCS wraps its 2.0.1 answers in multipart; 1.0.0 with coverage "1" answers a plain GeoTIFF.
// It sends CORS headers to https origins only: on the http dev server this model fails, live it works.
const DGM1_ST = { ...DGM1('Sachsen-Anhalt', '2019–2023', 'LVermGeo Sachsen-Anhalt', 'dl-de/by-2.0', 'EPSG:25832', wcs10('https://geodatenportal.sachsen-anhalt.de/ows_INSPIRE_LVermGeo_ATKIS_EL_DGM_WCS', '1', 'EPSG:25832')), link: 'https://www.lvermgeo.sachsen-anhalt.de/' };
const DGM1_HE = { ...DGM1('Hessen', '2019–2023', 'HVBG Hessen', 'dl-de/zero-2.0', 'EPSG:25832', wcs20('https://inspire-hessen.de/raster/dgm1/ows', 'he_dgm1', { axes: ['E', 'N'] })), link: 'https://gds.hessen.de/' };
const EE_DTM = {
  name: 'Estonian DTM',
  res: 1,
  years: '2017 onwards',
  licence: 'open data',
  link: 'https://geoportaal.maaamet.ee/',
  by: 'Maa- ja Ruumiamet',
  crs: 'EPSG:3301',
  url: wcs20('https://teenus.maaamet.ee/ows/wcs-dtm', 'dtm-1'),
};
const ALTI3D = {
  name: 'swissALTI3D',
  res: 0.5,
  years: '2019–2025',
  licence: 'free reuse',
  link: 'https://www.swisstopo.admin.ch/en/height-model-swissalti3d',
  by: 'swisstopo',
  crs: 'EPSG:2056',
  read: readSwissAlti3d,
};
const LU_LIDAR = {
  name: 'LiDAR 2024',
  res: 0.5,
  years: '2024',
  licence: 'CC0',
  link: 'https://data.public.lu/en/datasets/bd-l-lidar2024-releve-3d-du-territoire-luxembourgeois/',
  by: 'Administration du cadastre et de la topographie',
  crs: 'EPSG:2169',
  read: (bbox, w, h, signal) => mosaic([
    'https://download.data.public.lu/resources/bd-l-lidar2024-releve-3d-du-territoire-luxembourgeois/20241223-093912/MNT_Lidar2024.tif',
  ], bbox, w, h, signal),
};
const STMK = {
  name: 'ALS DGM Steiermark',
  res: 0.5,
  years: '2008 onwards',
  licence: 'CC BY 4.0',
  link: 'https://www.landesentwicklung.steiermark.at/',
  by: 'Land Steiermark',
  crs: 'EPSG:3857',
  bounds: [13.5, 46.6, 16.2, 47.9],
  url: imageServer('https://gis.stmk.gv.at/image/rest/services/OGD_Hoehen/ALS_Hoehen_aktuell_DGM_UTM33N_32633/ImageServer', 3857),
};
const TIROL = (coverage, bounds) => ({
  name: 'Geländemodell Tirol',
  res: 0.5,
  licence: 'CC BY 4.0',
  link: 'https://www.tirol.gv.at/sicherheit/geoinformation/geodaten-tiris/laserscandaten/',
  by: 'Land Tirol',
  crs: 'EPSG:3857',
  bounds,
  url: wcs10('https://gis.tirol.gv.at/arcgis/services/Service_Public/terrain/MapServer/WCSServer', coverage, 'EPSG:3857'),
});
const EUSKADI = {
  name: 'MDT LiDAR 1 m',
  res: 1,
  years: '2008–2024',
  licence: 'CC BY 4.0',
  link: 'https://www.geo.euskadi.eus/',
  by: 'geoEuskadi',
  crs: 'EPSG:25830',
  url: wcs10('https://www.geo.euskadi.eus/WCS_KARTOGRAFIA', 'MDT_LIDAR_1M_EGUNERATUENA_MAS_ACTUALIZADA', 'EPSG:25830'),
};
const SUEDTIROL = {
  name: 'DTM Südtirol',
  res: 0.5,
  years: '2013',
  licence: 'CC0',
  link: 'https://geoservices.civis.bz.it/',
  by: 'Autonome Provinz Bozen',
  crs: 'EPSG:25832',
  url: wcs20('https://geoservices9.civis.bz.it/geoserver/ows', 'p_bz-Elevation__DigitalTerrainModel-0.5m', {
    axes: ['E', 'N'],
    scaleAxes: ['i', 'j'],
  }),
};
const LINZ = {
  name: 'NZ LiDAR 1m DEM',
  res: 1,
  years: '2008–2026',
  licence: 'CC BY 4.0',
  link: 'https://data.linz.govt.nz/',
  by: 'Toitū Te Whenua LINZ',
  crs: 'EPSG:2193',
  read: readLinz,
};
const GSI = {
  name: 'GSI DEM 1A',
  res: 1,
  licence: 'GSI terms of use',
  link: 'https://maps.gsi.go.jp/development/ichiran.html',
  by: 'Geospatial Information Authority of Japan',
  crs: 'EPSG:3857',
  note: 'measured only in parts of the country; elsewhere no 1 m heights',
  read: readGsi,
};
const USGS_3DEP = {
  name: '3DEP',
  res: 1,
  years: '2010s–2020s',
  licence: 'public domain',
  link: 'https://www.usgs.gov/3d-elevation-program',
  by: 'USGS',
  crs: 'EPSG:3857',
  note: 'the best model available, 1 m in most farming areas, about 10 m elsewhere',
  url: imageServer('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer', 3857),
};

/** The fiboa collections shown on the map, the region they cover and the height models to try, in order. */
export const COLLECTIONS = {
  nl: { region: 'the Netherlands', dems: [AHN] },
  be_vlg: { region: 'Flanders', dems: [DHMV] },
  fr: { region: 'France', dems: [LIDAR_HD, RGE_ALTI] },
  lu: { region: 'Luxembourg', dems: [LU_LIDAR] },
  de_nrw: { region: 'North Rhine-Westphalia', dems: [DGM1_NRW] },
  de_he: { region: 'Hesse', dems: [DGM1_HE] },
  de_bb: { region: 'Brandenburg', dems: [DGM1_BB] },
  de_mv: { region: 'Mecklenburg-Western Pomerania', dems: [DGM1_MV] },
  de_st: { region: 'Saxony-Anhalt', dems: [DGM1_ST] },
  ch: { region: 'Switzerland', dems: [ALTI3D] },
  at: {
    region: 'Austria',
    // Tyrol publishes its west (M28) and east (M31) zones apart; a zone answers 404 outside itself.
    dems: [STMK, TIROL('Gelaendemodell_50cm_M28', [10.0, 46.75, 13.0, 47.8]), TIROL('Gelaendemodell_50cm_M31', [12.0, 46.6, 13.0, 47.2])],
    partly: 'Styria and Tyrol',
  },
  it_bz: { region: 'South Tyrol', dems: [SUEDTIROL] },
  es_pv: { region: 'the Basque Country', dems: [EUSKADI] },
  ee: { region: 'Estonia', dems: [EE_DTM] },
  us_usda_cropland: { region: 'the United States', dems: [USGS_3DEP] },
  nz: { region: 'New Zealand', dems: [LINZ] },
  jp: { region: 'Japan', dems: [GSI], partly: 'part of the country' },
};

/** The height models to try for a field of `collection` at [lon, lat]. */
export function demsFor(collection, [lon, lat]) {
  const dems = COLLECTIONS[collection]?.dems ?? [];
  return dems.filter(({ bounds: b }) => !b || (lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3]));
}

// ------------------------------------------------------------------ reading heights

const valid = (v, nodata) => Number.isFinite(v) && v !== nodata && v > -500 && v < 9000;

/**
 * Heights from `dem` over `bbox` (in `dem.crs`) in a `width` × `height` grid, row 0 north. Cells without a
 * measurement are NaN. Returns { values: Float32Array, width, height, bbox } as the source delivered it.
 */
export async function heights(dem, bbox, width, height, signal) {
  if (dem.read) return dem.read(bbox, width, height, signal);
  const response = await fetch(dem.url(bbox, width, height), { signal });
  if (!response.ok) throw new Error(`${dem.name}: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const image = await (await fromArrayBuffer(buffer)).getImage();
  const [raster] = await image.readRasters({ samples: [0], signal });
  const nodata = image.getGDALNoData();
  let box = bbox;
  try {
    box = image.getBoundingBox();
  } catch {
    // Not every server writes the georeference; it is then the box asked for.
  }
  return {
    values: Float32Array.from(raster, (v) => (valid(v, nodata) ? v : NaN)),
    width: image.getWidth(),
    height: image.getHeight(),
    bbox: box,
  };
}

// Longest side, in pixels, read at full resolution before the overviews are used instead.
const MAX_FULL_RES = 4000;

const tiffs = new Map();
const openTiff = (url) => {
  if (!tiffs.has(url)) tiffs.set(url, fromUrl(url).catch((error) => {
    tiffs.delete(url);
    throw error;
  }));
  return tiffs.get(url);
};

/**
 * Read a grid of `width` × `height` cells over `bbox` from one or more cloud-optimised GeoTIFFs in the same
 * coordinate system. Each cell takes the value of the file its centre falls in; geotiff.js picks the
 * overview that fits the cell size.
 */
async function mosaic(urls, bbox, width, height, signal) {
  const values = new Float32Array(width * height).fill(NaN);
  const cw = (bbox[2] - bbox[0]) / width;
  const ch = (bbox[3] - bbox[1]) / height;
  await Promise.all(urls.map(async (url) => {
    const tiff = await openTiff(url);
    const image = await tiff.getImage();
    const [ix0, iy0, ix1, iy1] = image.getBoundingBox();
    const c0 = Math.max(0, Math.ceil((ix0 - bbox[0]) / cw - 0.5));
    const c1 = Math.min(width, Math.floor((ix1 - bbox[0]) / cw - 0.5) + 1);
    const r0 = Math.max(0, Math.ceil((bbox[3] - iy1) / ch - 0.5));
    const r1 = Math.min(height, Math.floor((bbox[3] - iy0) / ch - 0.5) + 1);
    if (c1 <= c0 || r1 <= r0) return;
    const part = [
      Math.max(ix0, bbox[0] + c0 * cw),
      Math.max(iy0, bbox[3] - r1 * ch),
      Math.min(ix1, bbox[0] + c1 * cw),
      Math.min(iy1, bbox[3] - r0 * ch),
    ];
    const w = c1 - c0;
    const h = r1 - r0;
    const [rx, ry] = image.getResolution();
    const window = [
      Math.max(0, Math.round((part[0] - ix0) / rx)),
      Math.max(0, Math.round((iy1 - part[3]) / -ry)),
      Math.min(image.getWidth(), Math.round((part[2] - ix0) / rx)),
      Math.min(image.getHeight(), Math.round((iy1 - part[1]) / -ry)),
    ];
    // Read the full-resolution image and let geotiff.js shrink it: picking an overview would first fetch the
    // header of every overview, one request after the other (seconds each from a distant bucket). Only a
    // window too large to hold goes through the overviews.
    const huge = Math.max(window[2] - window[0], window[3] - window[1]) > MAX_FULL_RES;
    const options = { width: w, height: h, samples: [0], resampleMethod: 'nearest', signal };
    const [raster] = huge
      ? await tiff.readRasters({ bbox: part, ...options })
      : await image.readRasters({ window, ...options });
    const nodata = image.getGDALNoData();
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const v = raster[r * w + c];
        if (valid(v, nodata)) values[(r0 + r) * width + c0 + c] = v;
      }
    }
  }));
  return { values, width, height, bbox };
}

const SWISSALTI3D = 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d';
const SWISSALTI3D_YEARS = Array.from({ length: new Date().getFullYear() - 2018 }, (_, i) => 2019 + i);

/**
 * swissALTI3D comes in 1 km tiles, each flown again every few years. Its STAC search takes seconds, so
 * ask for every year of each tile the field touches at once and keep the newest file that exists.
 */
async function readSwissAlti3d(bbox, width, height, signal) {
  const tiles = [];
  for (let e = Math.floor(bbox[0] / 1000); e < Math.ceil(bbox[2] / 1000); e++) {
    for (let n = Math.floor(bbox[1] / 1000); n < Math.ceil(bbox[3] / 1000); n++) tiles.push(`${e}-${n}`);
  }
  const urls = await Promise.all(tiles.map(async (tile) => {
    const found = await Promise.all(SWISSALTI3D_YEARS.map(async (year) => {
      const url = `${SWISSALTI3D}/swissalti3d_${year}_${tile}/swissalti3d_${year}_${tile}_0.5_2056_5728.tif`;
      const response = await fetch(url, { method: 'HEAD', signal });
      return response.ok ? url : null;
    }));
    return found.filter(Boolean).at(-1);
  }));
  return mosaic(urls.filter(Boolean), bbox, width, height, signal);
}

const LINZ_BASE = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/new-zealand/new-zealand/dem_1m/2193';

/** One COG per NZTopo50 sheet; the sheets the box touches come from a prebuilt index of their extents. */
function readLinz(bbox, width, height, signal) {
  const urls = Object.entries(NZ_SHEETS)
    .filter(([, b]) => b[0] < bbox[2] && b[2] > bbox[0] && b[1] < bbox[3] && b[3] > bbox[1])
    .map(([sheet]) => `${LINZ_BASE}/${sheet}.tiff`);
  return mosaic(urls, bbox, width, height, signal);
}

const GSI_ZOOM = 17;
const GSI_TILE = 256;
const MERCATOR_HALF = Math.PI * 6378137;

/**
 * GSI's 1 m heights as Web Mercator PNG tiles at zoom 17, the height encoded in the colour:
 * (R * 65536 + G * 256 + B) * 0.01 m, values from 2^23 up negative, exactly 2^23 (128, 0, 0) no data.
 * A tile GSI has no 1 m data for answers 404.
 */
export function gsiHeight(r, g, b) {
  const x = r * 65536 + g * 256 + b;
  if (x === 2 ** 23) return NaN;
  return (x < 2 ** 23 ? x : x - 2 ** 24) * 0.01;
}

async function gsiTile(x, y, signal) {
  const response = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/${GSI_ZOOM}/${x}/${y}.png`, { signal });
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(GSI_TILE, GSI_TILE);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, GSI_TILE, GSI_TILE).data;
  const heights = new Float32Array(GSI_TILE * GSI_TILE);
  for (let i = 0; i < heights.length; i++) heights[i] = gsiHeight(rgba[4 * i], rgba[4 * i + 1], rgba[4 * i + 2]);
  return heights;
}

/** Sample the zoom 17 tiles under `bbox` (EPSG:3857) onto the requested grid, nearest pixel. */
async function readGsi(bbox, width, height, signal) {
  const span = (2 * MERCATOR_HALF) / 2 ** GSI_ZOOM; // one tile, in metres
  const col = (x) => Math.floor((x + MERCATOR_HALF) / span);
  const row = (y) => Math.floor((MERCATOR_HALF - y) / span);
  const tiles = new Map();
  const jobs = [];
  for (let x = col(bbox[0]); x <= col(bbox[2]); x++) {
    for (let y = row(bbox[3]); y <= row(bbox[1]); y++) {
      jobs.push(gsiTile(x, y, signal).then((t) => tiles.set(`${x}/${y}`, t)));
    }
  }
  await Promise.all(jobs);
  const values = new Float32Array(width * height).fill(NaN);
  const cw = (bbox[2] - bbox[0]) / width;
  const ch = (bbox[3] - bbox[1]) / height;
  for (let r = 0; r < height; r++) {
    const y = bbox[3] - (r + 0.5) * ch;
    const ty = row(y);
    const py = Math.floor(((MERCATOR_HALF - y) / span - ty) * GSI_TILE);
    for (let c = 0; c < width; c++) {
      const x = bbox[0] + (c + 0.5) * cw;
      const tx = col(x);
      const tile = tiles.get(`${tx}/${ty}`);
      if (!tile) continue;
      const px = Math.floor(((x + MERCATOR_HALF) / span - tx) * GSI_TILE);
      values[r * width + c] = tile[py * GSI_TILE + px];
    }
  }
  return { values, width, height, bbox };
}
