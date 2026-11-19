// Colours shared by the map and the charts: one per last year, so the bar chart doubles as the map legend.

// The first edition in nl_years.tif. The statistics count from years.json's first_year (2009).
export const FIRST_YEAR = 2005;
export const LAST_YEAR = 2026;

// 2005 … 2025, light (long ago) to dark (recent): one hue, monotone lightness. With 21 steps the
// neighbours are closer than the ordinal validator's minimum step, so the year is named by the slider,
// the bar under the cursor and the map tooltip, never by colour alone.
export const LOST_RAMP = [
  '#e5893f', '#df843c', '#d97e3a', '#d37937', '#cd7435', '#c76e32', '#c16930', '#bb642d', '#b55f2b',
  '#af5928', '#aa5426', '#a44f23', '#9e4920', '#98441e', '#923f1b', '#8c3a19', '#863416', '#802f14',
  '#7a2a11', '#74240f', '#6e1f0c',
];
export const FARMED = '#9db893';

export function hexToRgba(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/**
 * RGBA colour of a pixel of nl_years.tif when the map shows the land that disappeared up to and
 * including `maxYear`.
 *
 * value: the pixel value, 0 (no field ever) or year − 2000 (5 = 2005 … 26 = 2026).
 * maxYear: the slider year, 2005 … 2025.
 */
export function yearColor(value, maxYear, showFarmed = true) {
  const year = 2000 + value;
  if (year < FIRST_YEAR || year > LAST_YEAR) return [0, 0, 0, 0];
  if (year <= maxYear) return hexToRgba(LOST_RAMP[year - FIRST_YEAR]);
  return showFarmed ? hexToRgba(FARMED) : [0, 0, 0, 0];
}

/** One colour per pixel value 0 … 26, for the map's palette expression. */
export function yearPalette(maxYear, showFarmed = true) {
  return Array.from({ length: LAST_YEAR - 2000 + 1 }, (_, value) => yearColor(value, maxYear, showFarmed));
}

// What the lost land is now, per LGN2025 group id (landuse.json). Six hues validated for a map (all pairs,
// CVD in the warning band, so the map tooltip and the chart legend name the group), plus greys.
export const LANDUSE_COLORS = {
  1: '#e34948', // buildings, greenhouses and building sites
  2: '#4a3aa7', // roads and rail
  3: '#eda100', // solar parks
  4: '#008300', // forest and nature
  5: '#1baf7a', // grass and green in and around towns
  6: '#2a78d6', // water
  7: '#8f9690', // still farmland according to LGN
  0: '#c4c9c3', // not in LGN
};
// Land still farmed, behind the land-use colours: quiet, so the lost land stands out.
export const FARMED_MUTED = '#dde2da';

/** One colour per group id 0 … 7, for the map's palette expression. */
export function landusePalette() {
  return Object.keys(LANDUSE_COLORS).map(Number).sort((a, b) => a - b).map((id) => hexToRgba(LANDUSE_COLORS[id]));
}
