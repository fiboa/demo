/** Raster masks of field outlines and a quantile, shared by the demos that read rasters under a field. */

/**
 * Cells whose centre lies inside the polygon (even-odd rule, so holes work). `rings` is every ring of the
 * (multi)polygon in map coordinates; the grid covers `bbox` with `width` × `height` cells.
 */
export function polygonMask(rings, bbox, width, height) {
  const mask = new Uint8Array(width * height);
  const cw = (bbox[2] - bbox[0]) / width;
  const ch = (bbox[3] - bbox[1]) / height;
  const xs = [];
  for (let row = 0; row < height; row++) {
    const y = bbox[3] - (row + 0.5) * ch;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - bbox[0]) / cw - 0.5));
      const to = Math.min(width - 1, Math.floor((xs[k + 1] - bbox[0]) / cw - 0.5));
      for (let col = from; col <= to; col++) mask[row * width + col] = 1;
    }
  }
  return mask;
}

/** Cells inside any of `polygons` (each a list of rings): the union of their masks. */
export function unionMask(polygons, bbox, width, height) {
  const mask = new Uint8Array(width * height);
  for (const rings of polygons) {
    const part = polygonMask(rings, bbox, width, height);
    for (let i = 0; i < mask.length; i++) mask[i] |= part[i];
  }
  return mask;
}

/** The value at fraction `p` (0–1) of an ascending array, interpolated. */
export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
