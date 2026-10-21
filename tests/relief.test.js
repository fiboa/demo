import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RAMP,
  colorize,
  heightStats,
  hexToRgb,
  hillshade,
  histogram,
  rampColor,
  requestGrid,
  snapBbox,
} from '../relief/src/relief.js';
import { polygonMask, quantile, unionMask } from '../shared/mask.js';

test('small fields are read at 0.5 m, large ones coarser', () => {
  assert.deepEqual(requestGrid([0, 0, 200, 100]), { cell: 0.5, width: 400, height: 200 });
  assert.deepEqual(requestGrid([0, 0, 1200, 600]), { cell: 1, width: 1200, height: 600 });
});

test('the request box snaps outwards to the 0.5 m grid', () => {
  assert.deepEqual(snapBbox([10.2, 20.7, 30.1, 40.6], 0.5, 1), [9, 19.5, 31.5, 42]);
});

test('the mask holds the cells whose centre is inside, holes excluded', () => {
  // 4 × 4 cells of 1 m; outer square covers all, the hole the middle 2 × 2.
  const outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
  const hole = [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]];
  const mask = polygonMask([outer, hole], [0, 0, 4, 4], 4, 4);
  assert.deepEqual(Array.from(mask), [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]);
  // The diagonal runs through the centres of the cells on it; a centre on the edge counts as inside.
  const triangle = polygonMask([[[0, 0], [4, 0], [0, 4], [0, 0]]], [0, 0, 4, 4], 4, 4);
  assert.deepEqual(Array.from(triangle), [1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1]);
});

test('overlapping pieces of one field add up instead of cancelling', () => {
  // Two pieces of a 10 x 4 field cut at x = 5, each reaching 2 cells into the other (a tile buffer).
  const left = [[[0, 0], [7, 0], [7, 4], [0, 4], [0, 0]]];
  const right = [[[3, 0], [10, 0], [10, 4], [3, 4], [3, 0]]];
  const sum = (m) => m.reduce((a, b) => a + b, 0);
  assert.equal(sum(unionMask([left, right], [0, 0, 10, 4], 10, 4)), 40);
  assert.equal(sum(polygonMask([...left, ...right], [0, 0, 10, 4], 10, 4)), 24);
});

test('quantiles interpolate between sorted values', () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(quantile([1, 2, 3, 4, 5], 1), 5);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test('height statistics only count measured cells inside the field', () => {
  const values = Float32Array.from([1, 2, NaN, 100, 3]);
  const mask = Uint8Array.from([1, 1, 1, 0, 1]);
  const s = heightStats(values, mask);
  assert.equal(s.count, 3);
  assert.equal(s.missing, 1);
  assert.equal(s.min, 1);
  assert.equal(s.max, 3);
  assert.equal(s.median, 2);
  assert.ok(s.low > 1 && s.low < 1.1);
});

test('the histogram clamps heights outside the range into the end bins', () => {
  const values = Float32Array.from([-5, 0, 0.5, 0.99, 7, NaN]);
  const mask = new Uint8Array(6).fill(1);
  assert.deepEqual(histogram(values, mask, 0, 1, 2), [2, 3]);
});

test('hillshade: slopes facing the north-west light are brighter than flat land, others darker', () => {
  const flat = hillshade(new Float32Array(9).fill(1), 3, 3, 1)[4];
  assert.ok(Math.abs(flat - Math.SQRT1_2) < 1e-6);
  // Rising to the east: the slope faces west, towards the light.
  const east = hillshade(Float32Array.from([0, 1, 2, 0, 1, 2, 0, 1, 2]), 3, 3, 1, 1)[4];
  assert.ok(east > flat);
  // Rising to the north (row 0): the slope faces south, away from the light.
  const north = hillshade(Float32Array.from([2, 2, 2, 1, 1, 1, 0, 0, 0]), 3, 3, 1, 1)[4];
  assert.ok(north < flat);
});

test('the ramp runs from its first to its last colour', () => {
  assert.deepEqual(rampColor(0), hexToRgb(RAMP[0]));
  assert.deepEqual(rampColor(1), hexToRgb(RAMP.at(-1)));
  assert.deepEqual(rampColor(-3), hexToRgb(RAMP[0]));
});

test('pixels outside the field or without a measurement are transparent', () => {
  const rgba = colorize(Float32Array.from([0, NaN, 1]), Uint8Array.from([1, 1, 0]), new Float32Array(3).fill(1), 0, 1);
  assert.deepEqual(Array.from(rgba.slice(0, 4)), [...hexToRgb(RAMP[0]), 255]);
  assert.equal(rgba[7], 0);
  assert.equal(rgba[11], 0);
});
