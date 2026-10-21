/**
 * Pure helpers for the relief of one field: the height range to stretch the
 * colours over, a hillshade and the final RGBA image. Grids are row-major, row 0 at the north edge.
 */

import { quantile } from '../../shared/mask.js';

// Viridis: low and wet is dark blue, high and dry is yellow. Perceptually even, readable with colour blindness.
export const RAMP = ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

const MAX_SIDE = 1200;

/**
 * The cell size to ask a height service for: its own `native` cell, or coarser so the longest side stays
 * within `maxSide` pixels. Returns { cell, width, height } for the bbox, in the service's coordinates.
 */
export function requestGrid(bbox, native = 0.5, maxSide = MAX_SIDE) {
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  const cell = Math.max(native, span / maxSide);
  return {
    cell,
    width: Math.max(1, Math.round((bbox[2] - bbox[0]) / cell)),
    height: Math.max(1, Math.round((bbox[3] - bbox[1]) / cell)),
  };
}

/** Grow `bbox` by `margin` metres and snap it outwards to multiples of `step`. */
export function snapBbox(bbox, step = 0.5, margin = 0) {
  return [
    Math.floor((bbox[0] - margin) / step) * step,
    Math.floor((bbox[1] - margin) / step) * step,
    Math.ceil((bbox[2] + margin) / step) * step,
    Math.ceil((bbox[3] + margin) / step) * step,
  ];
}

/**
 * Heights inside the field: the measured cells under the mask (NaN is no measurement). Returns
 * { count, missing, min, max, low, high, median }, with low/high the 2nd and 98th percentile: the range
 * the colours stretch over, so a single ditch or tree does not flatten the rest.
 */
export function heightStats(values, mask) {
  const inside = [];
  let missing = 0;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i]) continue;
    if (Number.isNaN(values[i])) missing += 1;
    else inside.push(values[i]);
  }
  const sorted = Float64Array.from(inside).sort();
  return {
    count: sorted.length,
    missing,
    min: sorted[0] ?? NaN,
    max: sorted.at(-1) ?? NaN,
    low: quantile(sorted, 0.02),
    high: quantile(sorted, 0.98),
    median: quantile(sorted, 0.5),
  };
}

/** Counts of the measured heights inside the field in `bins` equal steps from `low` to `high`; ends clamp. */
export function histogram(values, mask, low, high, bins = 40) {
  const counts = new Array(bins).fill(0);
  const span = high - low || 1;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i] || Number.isNaN(values[i])) continue;
    const b = Math.floor(((values[i] - low) / span) * bins);
    counts[Math.min(bins - 1, Math.max(0, b))] += 1;
  }
  return counts;
}

/**
 * Hillshade (0–1) with light from the north-west at 45°. Heights are exaggerated by `zExaggeration`:
 * field relief is a few decimetres over hundreds of metres. Missing neighbours count as the centre cell.
 */
export function hillshade(values, width, height, cell, zExaggeration = 5) {
  const out = new Float32Array(width * height);
  // Unit vector towards the light: x east, y north, z up.
  const lx = -0.5;
  const ly = 0.5;
  const lz = Math.SQRT1_2;
  const at = (c, r, fallback) => {
    const v = values[Math.min(height - 1, Math.max(0, r)) * width + Math.min(width - 1, Math.max(0, c))];
    return Number.isNaN(v) ? fallback : v;
  };
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const z = values[r * width + c];
      if (Number.isNaN(z)) {
        out[r * width + c] = 1;
        continue;
      }
      const dzdx = ((at(c + 1, r, z) - at(c - 1, r, z)) / (2 * cell)) * zExaggeration;
      const dzdy = ((at(c, r - 1, z) - at(c, r + 1, z)) / (2 * cell)) * zExaggeration; // north minus south
      // The surface normal is (-dzdx, -dzdy, 1), normalised; the shade is its cosine with the light.
      out[r * width + c] = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / Math.hypot(dzdx, dzdy, 1));
    }
  }
  return out;
}

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RAMP_RGB = RAMP.map(hexToRgb);

/** The ramp colour for t in 0–1, linearly between the stops. */
export function rampColor(t) {
  const x = Math.min(1, Math.max(0, t)) * (RAMP_RGB.length - 1);
  const i = Math.min(RAMP_RGB.length - 2, Math.floor(x));
  const f = x - i;
  return RAMP_RGB[i].map((v, k) => Math.round(v + (RAMP_RGB[i + 1][k] - v) * f));
}

/**
 * RGBA pixels: inside the field the height stretched from `low` to `high` on the ramp, darkened by the
 * hillshade (`shadeWeight` 0 = flat colour); outside the field and where nothing was measured, transparent.
 */
export function colorize(values, mask, shade, low, high, shadeWeight = 0.45) {
  const rgba = new Uint8ClampedArray(values.length * 4);
  const span = high - low || 1;
  for (let i = 0; i < values.length; i++) {
    if (!mask[i] || Number.isNaN(values[i])) continue;
    const [r, g, b] = rampColor((values[i] - low) / span);
    const k = 1 - shadeWeight + shadeWeight * shade[i];
    rgba[i * 4] = r * k;
    rgba[i * 4 + 1] = g * k;
    rgba[i * 4 + 2] = b * k;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
