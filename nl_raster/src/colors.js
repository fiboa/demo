// Colours shared by the map and the charts: one per last year, so the bar chart doubles as the map legend.

export const FIRST_YEAR = 2009;
export const LAST_YEAR = 2026;

// 2009 … 2025, light (long ago) to dark (recent). One hue, validated as an ordinal ramp.
export const LOST_RAMP = [
  '#e5893f', '#dd823c', '#d67b38', '#ce7435', '#c66e32', '#bf672e', '#b7602b', '#b05a28', '#a85325',
  '#a14d21', '#99461e', '#92401b', '#8b3918', '#843315', '#7c2c12', '#75260f', '#6e1f0c',
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
 * value: the pixel value, 0 (no field ever) or year − 2000 (9 = 2009 … 26 = 2026).
 * maxYear: the slider year, 2009 … 2025.
 */
export function yearColor(value, maxYear) {
  const year = 2000 + value;
  if (year < FIRST_YEAR || year > LAST_YEAR) return [0, 0, 0, 0];
  return year <= maxYear ? hexToRgba(LOST_RAMP[year - FIRST_YEAR]) : hexToRgba(FARMED);
}

/** One colour per pixel value 0 … 26, for the map's palette expression. */
export function yearPalette(maxYear) {
  return Array.from({ length: LAST_YEAR - 2000 + 1 }, (_, value) => yearColor(value, maxYear));
}
