import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXAMPLES } from '../flood/src/examples.js';
import { MIN_GAP_DAYS, WATER_DB, floodSpells, readingOrder, thin, waterStats } from '../flood/src/s1.js';

const DAY = 86400000;
const at = (iso) => ({ date: new Date(iso) });

test('scenes are thinned to one per two days, keeping the earliest', () => {
  const list = ['2024-01-01T06:00Z', '2024-01-01T18:00Z', '2024-01-02T06:00Z', '2024-01-03T05:00Z', '2024-01-04T18:00Z'].map(at);
  const kept = thin(list).map((s) => s.date.toISOString().slice(0, 13));
  assert.deepEqual(kept, ['2024-01-01T06', '2024-01-03T05']);
  assert.equal(MIN_GAP_DAYS, 2);
});

test('scenes are read coarse to fine: every one once, the first few spread over the list', () => {
  const list = Array.from({ length: 10 }, (_, i) => ({ i }));
  const order = readingOrder(list).map((s) => s.i);
  assert.deepEqual([...order].sort((a, b) => a - b), list.map((s) => s.i));
  assert.deepEqual(order.slice(0, 4), [0, 8, 4, 2]);
});

test('water is the share of the field cells below the threshold, no-data cells left out', () => {
  const lin = (db) => 10 ** (db / 10);
  const vv = Float32Array.from([lin(-25), lin(-20), lin(-10), lin(-8), 0, -32768, lin(-30)]);
  const mask = Uint8Array.from([1, 1, 1, 1, 1, 1, 0]);
  const s = waterStats(vv, mask);
  assert.equal(s.count, 4);
  assert.equal(s.water, 0.5);
  assert.ok(Math.abs(s.vv - -15) < 1e-6);
  assert.ok(WATER_DB < -10 && WATER_DB > -25);
  assert.equal(waterStats(Float32Array.from([0]), Uint8Array.from([1])), null);
});

test('flood spells are runs of wet images, broken by a drier one', () => {
  const p = (day, water) => ({ scene: { date: new Date(Date.UTC(2024, 0, 1) + day * DAY) }, water });
  const points = [p(0, 0.1), p(2, 0.6), p(4, 0.9), p(6, 0.55), p(8, 0.2), p(10, 0.7)];
  const spells = floodSpells(points, 0.5);
  assert.equal(spells.length, 2);
  assert.equal(spells[0].first, points[1]);
  assert.equal(spells[0].last, points[3]);
  assert.equal(spells[0].most, points[2]);
  assert.equal(spells[1].first, spells[1].last);
  assert.deepEqual(floodSpells([p(0, 0.1)], 0.5), []);
});

test('examples lie in a year Sentinel-1 covers and say where the picture is from', () => {
  for (const e of EXAMPLES) {
    assert.ok(e.year >= 2015 && e.year <= new Date().getUTCFullYear(), e.id);
    if (e.picture) assert.equal(new Date(e.picture).getUTCFullYear(), e.year, e.id);
  }
});
