/**
 * The patch under a click: all connected 2 m cells of the years COG with the same last year as the
 * clicked cell, read at full resolution with geotiff.js. Two neighbouring fields that both disappeared in
 * the same year become one patch; the map cannot tell them apart either.
 */
import { fromUrl } from 'geotiff';

// First a 1 × 1 km window around the click; if the patch reaches its edge, once more at 4 × 4 km.
const HALF_WINDOWS = [256, 1024];

/**
 * Flood fill (4-connected) from (col, row) over cells equal to the start value.
 * Returns null when the start cell is 0, else the patch's bounding box in window cells, its mask
 * cropped to that box, and whether it touches the window edge.
 */
export function floodFill(values, width, height, col, row) {
  const value = values[row * width + col];
  if (!value) return null;
  const seen = new Uint8Array(width * height);
  const stack = [row * width + col];
  seen[stack[0]] = 1;
  let minC = col;
  let maxC = col;
  let minR = row;
  let maxR = row;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    const c = i % width;
    const r = (i - c) / width;
    count += 1;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    const visit = (n) => {
      if (!seen[n] && values[n] === value) {
        seen[n] = 1;
        stack.push(n);
      }
    };
    if (c > 0) visit(i - 1);
    if (c < width - 1) visit(i + 1);
    if (r > 0) visit(i - width);
    if (r < height - 1) visit(i + width);
  }
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) mask[r * w + c] = seen[(r + minR) * width + c + minC];
  }
  const touchesEdge = minC === 0 || minR === 0 || maxC === width - 1 || maxR === height - 1;
  return { value, count, mask, width: w, height: h, minC, minR, touchesEdge };
}

const images = new Map();
function cogImage(url) {
  if (!images.has(url)) images.set(url, fromUrl(url).then((tiff) => tiff.getImage()));
  return images.get(url);
}

/**
 * Read the patch around an RD coordinate from the years COG at `url`. Returns null outside any field,
 * else { value, count, mask, width, height, bbox (RD, on the 2 m grid), cell (m), truncated }.
 */
export async function readPatch(url, [x, y], signal) {
  const image = await cogImage(url);
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution(); // ry < 0: rows run south
  const W = image.getWidth();
  const H = image.getHeight();
  const col = Math.floor((x - ox) / rx);
  const row = Math.floor((y - oy) / ry);
  if (col < 0 || row < 0 || col >= W || row >= H) return null;
  for (const half of HALF_WINDOWS) {
    const win = [Math.max(0, col - half), Math.max(0, row - half), Math.min(W, col + half), Math.min(H, row + half)];
    const [values] = await image.readRasters({ window: win, samples: [0], signal });
    const fill = floodFill(values, win[2] - win[0], win[3] - win[1], col - win[0], row - win[1]);
    if (!fill) return null;
    if (fill.touchesEdge && half !== HALF_WINDOWS.at(-1)) continue;
    const c0 = win[0] + fill.minC;
    const r0 = win[1] + fill.minR;
    return {
      ...fill,
      cell: rx,
      bbox: [ox + c0 * rx, oy + (r0 + fill.height) * ry, ox + (c0 + fill.width) * rx, oy + r0 * ry],
      truncated: fill.touchesEdge,
    };
  }
  return null;
}

/** The patch outline as line segments along cell edges, in RD: [[x0, y0], [x1, y1]][]. */
export function outline(patch) {
  const { mask, width: w, height: h, bbox, cell } = patch;
  const inside = (c, r) => c >= 0 && r >= 0 && c < w && r < h && mask[r * w + c] === 1;
  const x = (c) => bbox[0] + c * cell;
  const y = (r) => bbox[3] - r * cell;
  const segments = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!inside(c, r)) continue;
      if (!inside(c, r - 1)) segments.push([[x(c), y(r)], [x(c + 1), y(r)]]);
      if (!inside(c, r + 1)) segments.push([[x(c), y(r + 1)], [x(c + 1), y(r + 1)]]);
      if (!inside(c - 1, r)) segments.push([[x(c), y(r)], [x(c), y(r + 1)]]);
      if (!inside(c + 1, r)) segments.push([[x(c + 1), y(r)], [x(c + 1), y(r + 1)]]);
    }
  }
  return segments;
}
