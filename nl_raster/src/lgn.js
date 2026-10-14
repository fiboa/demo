/**
 * LGN2025 (Wageningen Environmental Research, CC BY 4.0) as served by the PDOK WMS: class colours, and
 * the classes inside a patch of the years COG, read back from a WMS image on exactly that patch's grid.
 * The page uses the official Dutch class names, as in PDOK's legend.
 */

export const LGN_WMS_URL = 'https://service.pdok.nl/wur/landelijk-grondgebruik-nederland/wms/v1_0';
export const LGN_LEGEND_URL = `${LGN_WMS_URL}/legend/lgn-actueel/default.png`;

/** [code, colour, name] from LGN2025.sld; the WMS draws exactly these colours. */
export const LGN_CLASSES = [
  [1, '#73df1f', 'agrarisch gras'],
  [2, '#e89919', 'maïs'],
  [3, '#b26600', 'aardappelen'],
  [4, '#e51f7f', 'bieten'],
  [5, '#ffff00', 'granen'],
  [6, '#ff00c5', 'overige landbouwgewassen'],
  [8, '#46ffcf', 'glastuinbouw'],
  [9, '#3cef45', 'boomgaarden'],
  [10, '#ac81a8', 'bloembollen'],
  [11, '#33c800', 'loofbos'],
  [12, '#009900', 'naaldbos'],
  [16, '#2473ff', 'zoet water'],
  [17, '#000099', 'zout water'],
  [18, '#ff0000', 'bebouwing in primair bebouwd gebied'],
  [19, '#730000', 'bebouwing in secundair bebouwd gebied'],
  [20, '#93d600', 'bos in primair bebouwd gebied'],
  [22, '#93aa00', 'bos in secundair bebouwd gebied'],
  [23, '#93ff00', 'gras in primair bebouwd gebied'],
  [26, '#761818', 'bebouwing in buitengebied'],
  [27, '#ff645a', 'overig grondgebruik in buitengebied'],
  [28, '#a8ef44', 'gras in secundair bebouwd gebied'],
  [29, '#000000', 'zonneparken'],
  [30, '#b03060', 'kwelders'],
  [31, '#e6fb00', 'open zand in kustgebied'],
  [32, '#89d42b', 'duinen met lage vegetatie'],
  [33, '#5aba40', 'duinen met hoge vegetatie'],
  [34, '#750075', 'duinheide'],
  [35, '#ffff00', 'open stuifzand en/of rivierzand'],
  [36, '#750075', 'heide'],
  [37, '#a42353', 'matig vergraste heide'],
  [38, '#ad8b06', 'sterk vergraste heide'],
  [39, '#249996', 'hoogveen'],
  [40, '#065a4c', 'bos in hoogveengebied'],
  [41, '#ffc0cb', 'overige moeras vegetatie'],
  [42, '#ffa500', 'rietvegetatie'],
  [43, '#006400', 'bos in moerasgebied'],
  [45, '#b6b639', 'natuurlijk beheerde agrarische graslanden'],
  [46, '#f5e10f', 'gras in het kustgebied'],
  [47, '#969639', 'overig gras'],
  [61, '#ffb3a8', 'boomkwekerijen'],
  [62, '#e3ff70', 'fruitkwekerijen'],
  [251, '#871b00', 'hoofdinfrastructuur en spoorbaanlichamen'],
  [252, '#b02300', 'halfverharde wegen, infrastructuur langzaam verkeer en overige infrastructuur'],
  [253, '#a80000', 'smalle wegen'],
  [321, '#89d42b', 'struikvegetatie in hoogveengebied (laag)'],
  [322, '#89d42b', 'struikvegetatie in moerasgebied (laag)'],
  [323, '#89d42b', 'overige struikvegetatie (laag)'],
  [331, '#5aba40', 'struikvegetatie in hoogveengebied (hoog)'],
  [332, '#5aba40', 'struikvegetatie in moerasgebied (hoog)'],
  [333, '#5aba40', 'overige struikvegetatie (hoog)'],
];

// Classes that share a colour cannot be told apart in the WMS image; they are reported together.
const SHARED_NAMES = {
  '#750075': 'heide of duinheide',
  '#89d42b': 'lage struik- of duinvegetatie',
  '#5aba40': 'hoge struik- of duinvegetatie',
  '#ffff00': 'granen, of open stuif- of rivierzand',
};

/** colour → { codes, label, color } */
export const LGN_BY_COLOR = new Map();
for (const [code, color, name] of LGN_CLASSES) {
  const entry = LGN_BY_COLOR.get(color) ?? { codes: [], name, color };
  entry.codes.push(code);
  LGN_BY_COLOR.set(color, entry);
}
for (const entry of LGN_BY_COLOR.values()) {
  if (entry.codes.length > 1) entry.name = SHARED_NAMES[entry.color];
  entry.label = `${entry.codes.join('/')} - ${entry.name}`;
}

const hex = (r, g, b) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/**
 * Count the LGN classes under the mask. `rgba` is the WMS image (same width × height as the mask).
 * Returns [{ label, color, pixels }], largest first; colours that are no LGN class (outside LGN) are
 * counted as one entry with color null, always last.
 */
export function countClasses(rgba, mask) {
  const counts = new Map();
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const j = i * 4;
    const color = rgba[j + 3] === 0 ? null : hex(rgba[j], rgba[j + 1], rgba[j + 2]);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const rows = new Map();
  for (const [color, pixels] of counts) {
    const entry = LGN_BY_COLOR.get(color);
    const key = entry ? entry.label : null;
    const row = rows.get(key) ?? { label: key ?? 'not in LGN2025', color: entry?.color ?? null, pixels: 0 };
    row.pixels += pixels;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (a.color === null) - (b.color === null) || b.pixels - a.pixels);
}

/** The WMS image for `bbox` (RD), one image pixel per patch cell, as RGBA. */
export async function lgnImage(bbox, width, height, signal) {
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: 'lgn-actueel',
    styles: '',
    crs: 'EPSG:28992',
    bbox: bbox.join(','),
    width,
    height,
    format: 'image/png',
    transparent: 'true',
  });
  const response = await fetch(`${LGN_WMS_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`LGN WMS answered ${response.status}`);
  // No colour management: the class lookup needs the exact colours of the PNG.
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}
