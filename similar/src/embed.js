/**
 * The pure steps of the demo: where a place lies in the AlphaEarth Foundations (AEF) mosaic, which of its
 * pixels fall inside a field, and how alike two fields are.
 *
 * The mosaic (https://source.coop/tge-labs/aef-mosaic) is a Zarr array [year, band, y, x] of int8 in
 * EPSG:4326: 9 years (2017–2025), 64 bands, a pixel of 0.0000898° (10 m at the equator), read in chunks of
 * 64 × 256 × 256. Each pixel's 64 values are a vector of length 1, stored as int8 with a signed square:
 * value = (q / 127.5)² · sign(q), and -128 means no data.
 */

export const AEF_URL = 'https://data.source.coop/tge-labs/aef-mosaic';
export const GSD = 0.00008983111749910169;
export const WEST = -180;
export const NORTH = 83.68570533713473;
export const BANDS = 64;
export const CHUNK = 256;
export const FIRST_YEAR = 2017;
export const LAST_YEAR = 2025;
export const NODATA = -128;

/** The year index of the mosaic for a calendar year, clamped to the years it has. */
export const yearIndex = (year) => Math.min(LAST_YEAR, Math.max(FIRST_YEAR, year)) - FIRST_YEAR;

/** Column and row of the mosaic, as fractions: pixel (c, r) covers [c, c + 1) × [r, r + 1). */
export const toPixel = ([lon, lat]) => [(lon - WEST) / GSD, (NORTH - lat) / GSD];

/** The lon/lat box [west, south, east, north] of chunk (cy, cx). */
export function chunkBounds(cy, cx) {
  const west = WEST + cx * CHUNK * GSD;
  const north = NORTH - cy * CHUNK * GSD;
  return [west, north - CHUNK * GSD, west + CHUNK * GSD, north];
}

// int8 → float, as a table: the signed square is applied to every value of every pixel.
const DEQUANT = new Float32Array(256);
for (let q = -128; q < 128; q++) DEQUANT[q & 255] = q === NODATA ? NaN : Math.sign(q) * (q / 127.5) ** 2;

/** The float value of one stored int8. */
export const dequantize = (q) => DEQUANT[q & 255];

/**
 * The pixels whose centre lies inside a polygon given as rings of [col, row] (fractional pixel coordinates,
 * see toPixel), even-odd, so holes drop out. Calls `visit(row, col)` for each.
 */
export function scanPolygon(rings, visit) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const ring of rings) {
    for (const [, y] of ring) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const crossings = [];
  for (let row = Math.ceil(top - 0.5); row + 0.5 < bottom; row++) {
    const y = row + 0.5;
    crossings.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j];
        const [x1, y1] = ring[i];
        if (y0 <= y !== y1 <= y) crossings.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      for (let col = Math.ceil(crossings[k] - 0.5); col + 0.5 < crossings[k + 1]; col++) visit(row, col);
    }
  }
}

/**
 * The pixels of a field made of polygons in lon/lat (each a list of rings), as a sorted array of
 * row * 2^22 + col (unique: the mosaic is 4 million columns wide, under 2^22). The pieces may overlap.
 */
export function fieldPixels(polygons) {
  const seen = new Set();
  for (const rings of polygons) {
    scanPolygon(rings.map((ring) => ring.map(toPixel)), (row, col) => seen.add(row * 4194304 + col));
  }
  return Float64Array.from(seen).sort();
}

export const pixelRow = (p) => Math.floor(p / 4194304);
export const pixelCol = (p) => p % 4194304;

/** The chunks [cy, cx] that a set of pixels touches, as "cy/cx" keys. */
export function chunksOf(pixels) {
  const keys = new Set();
  for (const p of pixels) keys.add(`${Math.floor(pixelRow(p) / CHUNK)}/${Math.floor(pixelCol(p) / CHUNK)}`);
  return keys;
}

/**
 * The mean embedding of `pixels`, scaled to length 1, read from `chunk(key)`: the Int8Array of a chunk,
 * band-major (band * 65536 + y * 256 + x), or undefined when it failed. Pixels without data are skipped.
 * Returns { vector, count } or null when no pixel had data.
 */
export function meanEmbedding(pixels, chunk) {
  const sum = new Float64Array(BANDS);
  let count = 0;
  for (const p of pixels) {
    const row = pixelRow(p);
    const col = pixelCol(p);
    const data = chunk(`${Math.floor(row / CHUNK)}/${Math.floor(col / CHUNK)}`);
    if (!data) continue;
    const offset = (row % CHUNK) * CHUNK + (col % CHUNK);
    if (data[offset] === NODATA) continue;
    for (let b = 0; b < BANDS; b++) sum[b] += DEQUANT[data[b * CHUNK * CHUNK + offset] & 255];
    count++;
  }
  if (!count) return null;
  return { vector: normalize(sum), count };
}

/** A copy of `v` scaled to length 1 (as Float32Array). */
export function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

/** Cosine similarity of two vectors of length 1: their dot product. */
export function cosine(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

/**
 * The similarity of every pixel of a chunk to `query`, as a Float32Array of 256 × 256 (NaN without data).
 */
export function chunkSimilarity(data, query) {
  const out = new Float32Array(CHUNK * CHUNK);
  for (let i = 0; i < out.length; i++) {
    if (data[i] === NODATA) {
      out[i] = NaN;
      continue;
    }
    let d = 0;
    for (let b = 0; b < BANDS; b++) d += DEQUANT[data[b * CHUNK * CHUNK + i] & 255] * query[b];
    out[i] = d;
  }
  return out;
}

/** The value at fraction q (0–1) of the sorted numbers `sorted`. */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/**
 * The colour scale of the map: one hue whose opacity grows with the similarity, from `low` (the median of
 * the fields in view: transparent) to 1 (the clicked field itself). Returns 0–1.
 */
export const strength = (similarity, low) => Math.min(1, Math.max(0, (similarity - low) / (1 - low || 1)));

/**
 * What two fields are compared on: the HCAT code where the field has one, else its crop name. Names alone fail
 * across collections (Spain's OLIVE and Andalusia's OLIVAR) and between variants (grain and silage maize).
 */
export const cropKey = (f) => (f.code != null ? `hcat:${f.code}` : f.crop ? `name:${f.crop}` : null);

/** By default the top is 20, or half the fields where there are fewer than 40, so it never takes them all. */
export const topCount = (n) => Math.min(20, Math.max(1, Math.floor(n / 2)));

/**
 * How often the crop of the clicked field `chosen` comes back among the `top` most alike fields, against how
 * often it occurs among all fields compared. Fields are { crop, code, similarity }, the clicked one left out.
 * When the clicked field has an HCAT code only fields with a code count, else only fields that name a crop, so a
 * field whose crop cannot be compared is not counted as another crop. `all` is the number of fields that count.
 */
export function sameCrop(chosen, fields, top) {
  const key = chosen && cropKey(chosen);
  if (!key) return null;
  const pool = fields.filter((f) => (chosen.code != null ? f.code != null : !!f.crop));
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => b.similarity - a.similarity).slice(0, top ?? topCount(pool.length));
  const hits = ranked.filter((f) => cropKey(f) === key).length;
  const base = pool.filter((f) => cropKey(f) === key).length;
  return { hits, top: ranked.length, base, all: pool.length, byCode: chosen.code != null };
}
