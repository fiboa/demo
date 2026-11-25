/**
 * A picture of one comparison for the example cards: the square around the clicked field on a ground grid,
 * the clicked field white, the other fields from dark to the full hue by how alike they are, the land
 * between them dark, and a darker line where one field ends and the next begins.
 */
import { toLonLat } from 'ol/proj.js';

import { strength, toPixel } from './embed.js';

const GROUND = [45, 58, 51];
const ALIKE = [255, 210, 63];
const EDGE = [25, 33, 29];

/**
 * RGBA pixels of `size` × `size` over `extent` (EPSG:3857) for a result of compare(). Returns Uint8ClampedArray.
 */
export function picture(result, extent, size) {
  const owner = new Map();
  result.fields.forEach((f, i) => {
    for (const p of f.cells) owner.set(p, i);
  });
  const ids = new Int32Array(size * size).fill(-1);
  const [x0, y0, x1, y1] = extent;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const lonLat = toLonLat([x0 + ((c + 0.5) / size) * (x1 - x0), y1 - ((r + 0.5) / size) * (y1 - y0)]);
      const [col, row] = toPixel(lonLat).map(Math.floor);
      ids[r * size + c] = owner.get(row * 4194304 + col) ?? -1;
    }
  }
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < ids.length; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    const id = ids[i];
    let color = GROUND;
    if (id >= 0) {
      const f = result.fields[id];
      if (f.key === result.field.key) color = [255, 255, 255];
      else {
        const t = 0.15 + 0.85 * strength(f.similarity, result.low);
        color = GROUND.map((g, k) => Math.round(g + (ALIKE[k] - g) * t));
      }
      const right = c + 1 < size ? ids[i + 1] : id;
      const below = r + 1 < size ? ids[i + size] : id;
      if (right !== id || below !== id) color = EDGE;
    }
    rgba.set([...color, 255], i * 4);
  }
  return rgba;
}
