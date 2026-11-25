import assert from 'node:assert/strict';
import { test } from 'node:test';

import { overlap, squareAround } from '../similar/src/compare.js';
import {
  CHUNK,
  chunkBounds,
  chunkSimilarity,
  chunksOf,
  cosine,
  dequantize,
  fieldPixels,
  GSD,
  meanEmbedding,
  NODATA,
  normalize,
  quantile,
  sameCrop,
  cropKey,
  scanPolygon,
  strength,
  toPixel,
  WEST,
  NORTH,
  yearIndex,
} from '../similar/src/embed.js';

test('int8 values dequantise with a signed square; -128 is no data', () => {
  assert.equal(dequantize(0), 0);
  assert.ok(Math.abs(dequantize(127) - (127 / 127.5) ** 2) < 1e-6);
  assert.ok(Math.abs(dequantize(-64) + (64 / 127.5) ** 2) < 1e-6);
  assert.ok(Number.isNaN(dequantize(NODATA)));
});

test('years clamp to the mosaic, 2017–2025', () => {
  assert.equal(yearIndex(2017), 0);
  assert.equal(yearIndex(2024), 7);
  assert.equal(yearIndex(2026), 8);
  assert.equal(yearIndex(2010), 0);
});

test('a lon/lat maps to the pixel and chunk that cover it', () => {
  const [col, row] = toPixel([WEST + 300.5 * GSD, NORTH - 700.25 * GSD]);
  assert.ok(Math.abs(col - 300.5) < 1e-6 && Math.abs(row - 700.25) < 1e-6);
  const [w, s, e, n] = chunkBounds(2, 3);
  assert.ok(Math.abs(w - (WEST + 3 * CHUNK * GSD)) < 1e-9);
  assert.ok(Math.abs(n - (NORTH - 2 * CHUNK * GSD)) < 1e-9);
  assert.ok(Math.abs(e - w - CHUNK * GSD) < 1e-12 && Math.abs(n - s - CHUNK * GSD) < 1e-12);
});

test('a polygon takes the pixels whose centre lies inside it, holes left out', () => {
  const visited = [];
  scanPolygon([[[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]]], (r, c) => visited.push([r, c]));
  assert.equal(visited.length, 12);
  const withHole = [];
  scanPolygon(
    [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
    ],
    (r, c) => withHole.push(`${r},${c}`),
  );
  assert.equal(withHole.length, 12);
  assert.ok(!withHole.includes('1,1') && !withHole.includes('2,2'));
});

test('overlapping pieces of a field count each pixel once, and the chunks they touch are found', () => {
  const lon = (c) => WEST + c * GSD;
  const lat = (r) => NORTH - r * GSD;
  const square = (c0, r0, c1, r1) => [[[lon(c0), lat(r0)], [lon(c1), lat(r0)], [lon(c1), lat(r1)], [lon(c0), lat(r1)], [lon(c0), lat(r0)]]];
  const pixels = fieldPixels([square(254, 10, 258, 12), square(256, 10, 260, 12)]);
  assert.equal(pixels.length, 12);
  assert.deepEqual([...chunksOf(pixels)].sort(), ['0/0', '0/1']);
});

test('the mean embedding skips pixels without data and has length 1', () => {
  const data = new Int8Array(64 * CHUNK * CHUNK);
  const plane = CHUNK * CHUNK;
  data[0 * plane + 0] = 127; // pixel 0: along band 0
  data[1 * plane + 1] = 127; // pixel 1: along band 1
  data[2] = NODATA; // pixel 2: no data
  const mean = meanEmbedding([0, 1, 2], () => data);
  assert.equal(mean.count, 2);
  assert.ok(Math.abs(mean.vector[0] - Math.SQRT1_2) < 1e-6 && Math.abs(mean.vector[1] - Math.SQRT1_2) < 1e-6);
  assert.equal(meanEmbedding([2], () => data), null);
  assert.equal(meanEmbedding([0], () => undefined), null);
});

test('cosine of unit vectors, per pixel too', () => {
  const a = normalize([1, 0, 0]);
  const b = normalize([1, 1, 0]);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(a, b) - Math.SQRT1_2) < 1e-6);
  const data = new Int8Array(64 * CHUNK * CHUNK);
  data[0] = 127;
  data[1] = NODATA;
  const query = new Float32Array(64);
  query[0] = 1;
  const sim = chunkSimilarity(data, query);
  assert.ok(Math.abs(sim[0] - (127 / 127.5) ** 2) < 1e-6);
  assert.ok(Number.isNaN(sim[1]));
  assert.equal(sim[2], 0);
});

test('the colour scale runs from the median to identical', () => {
  assert.equal(strength(0.5, 0.6), 0);
  assert.ok(Math.abs(strength(0.8, 0.6) - 0.5) < 1e-9);
  assert.equal(strength(1, 0.6), 1);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
});

test('same crop among the most alike, against all fields', () => {
  const fields = [
    { crop: 'maize', similarity: 0.9 },
    { crop: 'wheat', similarity: 0.8 },
    { crop: 'maize', similarity: 0.7 },
    { crop: 'wheat', similarity: 0.2 },
  ];
  assert.deepEqual(sameCrop({ crop: 'maize' }, fields, 2), { hits: 1, top: 2, base: 2, all: 4, byCode: false });
  assert.equal(sameCrop({ crop: null }, fields), null);
});

test('same crop by HCAT code where the clicked field has one; fields without a code do not count', () => {
  const olive = 3303050000;
  const fields = [
    { crop: 'OLIVE', code: olive, similarity: 0.99 },
    { crop: 'OLIVAR', code: null, similarity: 0.98 }, // Andalusia, no HCAT in the tiles
    { crop: 'OLIVES', code: olive, similarity: 0.97 }, // another name, the same code
    { crop: 'PASTURE', code: 3302000000, similarity: 0.5 },
  ];
  assert.deepEqual(sameCrop({ crop: 'OLIVE', code: olive }, fields, 2), { hits: 2, top: 2, base: 2, all: 3, byCode: true });
  assert.equal(cropKey({ crop: 'OLIVAR', code: null }), 'name:OLIVAR');
  assert.equal(cropKey({ crop: 'OLIVE', code: olive }), `hcat:${olive}`);
});

test('overlap and the square around a point', () => {
  assert.equal(overlap([1, 2, 3, 4], new Set([1, 2])), 0.5);
  const [x0, y0, x1, y1] = squareAround([0, 60], 1000);
  assert.ok(Math.abs(x1 - x0 - 2000) < 1e-6 && Math.abs(y1 - y0 - 2000) < 1e-6); // twice as long at 60°
});
