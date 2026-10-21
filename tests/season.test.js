import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chooseTile,
  clearCells,
  clearShare,
  covered,
  dnOffset,
  flagDips,
  ndviStats,
  readingOrder,
} from '../season/src/s2.js';
import { cumulative, normalSeason } from '../season/src/weather.js';

const day = (iso) => new Date(`${iso}T10:00:00Z`);

test('the tile that holds the whole field wins over one that only overlaps it', () => {
  const field = [5.0, 52.0, 5.1, 52.1];
  const item = (tile, bbox) => ({ properties: { 's2:mgrs_tile': tile }, bbox });
  const items = [
    item('31UFU', [4.9, 51.9, 5.05, 52.2]),
    item('31UFU', [4.9, 51.9, 5.05, 52.2]),
    item('31UGU', [4.9, 51.9, 5.5, 52.5]),
  ];
  assert.equal(chooseTile(items, field), '31UGU');
});

test('digital numbers carry an offset from processing baseline 04.00 on', () => {
  assert.equal(dnOffset('03.01'), 0);
  assert.equal(dnOffset('04.00'), 1000);
  assert.equal(dnOffset('05.11'), 1000);
});

test('scenes are read clearest first, the cloudiest left out', () => {
  const order = readingOrder([{ cloud: 30 }, { cloud: 90 }, { cloud: 2 }]);
  assert.deepEqual(order.map((s) => s.cloud), [2, 30]);
});

test('a scene within the spacing of a measurement is covered', () => {
  assert.equal(covered(day('2026-05-10'), [day('2026-05-07')]), true);
  assert.equal(covered(day('2026-05-10'), [day('2026-05-01')]), false);
});

test('each 20 m classification cell clears its 2 × 2 cells of 10 m', () => {
  const grid = { width: 4, height: 2 };
  // SCL row of 2 cells: vegetation (4), cloud (9)
  const clear = clearCells(new Uint8Array([4, 9]), grid);
  assert.deepEqual([...clear], [1, 1, 0, 0, 1, 1, 0, 0]);
  assert.equal(clearShare(clear, new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0])), 0.5);
});

test('NDVI uses the clear cells inside the field and subtracts the offset', () => {
  const red = new Uint16Array([1000 + 500, 1000 + 500, 0, 9999]);
  const nir = new Uint16Array([1000 + 4500, 1000 + 2000, 0, 9999]);
  const clear = new Uint8Array([1, 1, 1, 0]);
  const mask = new Uint8Array([1, 1, 1, 1]);
  const stats = ndviStats(red, nir, clear, mask, 1000);
  assert.equal(stats.count, 2); // the nodata cell and the cloudy one are left out
  assert.ok(Math.abs(stats.p75 - 0.8) < 0.1);
  assert.ok(Math.abs(stats.median - (0.8 + 0.6) / 2) < 1e-9);
  assert.equal(ndviStats(red, nir, new Uint8Array(4), mask, 1000), null);
});

test('a lone low point between two high ones is a dip; a harvest is not', () => {
  const p = (iso, median) => ({ scene: { date: day(iso) }, ndvi: { median } });
  const points = flagDips([p('2026-05-01', 0.8), p('2026-05-05', 0.3), p('2026-05-10', 0.82), p('2026-07-01', 0.8), p('2026-07-05', 0.2), p('2026-07-15', 0.2)]);
  assert.deepEqual(points.map((x) => x.dip), [false, true, false, false, false, false]);
});

test('running sums stop at the first missing day', () => {
  const sums = cumulative([10, 3, 15, null], [1, 0, 2.5, 4]);
  assert.deepEqual(sums.rain, [1, 1, 3.5]);
  assert.deepEqual(sums.gdd, [5, 5, 15]); // base 5 °C: the cold day adds nothing
});

test('the normal averages whole seasons, starting in July in the south', () => {
  const time = [];
  const temp = [];
  const rain = [];
  for (let t = Date.UTC(2019, 6, 1); t < Date.UTC(2021, 6, 1); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    time.push(iso);
    temp.push(iso < '2020-07-01' ? 10 : 20);
    rain.push(1);
  }
  const normal = normalSeason(time, temp, rain, 7);
  assert.equal(normal.years, 2);
  assert.equal(normal.rain.length, 365);
  assert.equal(normal.rain[364], 365); // 29 February 2020 dropped
  assert.equal(normal.gdd[0], (5 + 15) / 2);
});
