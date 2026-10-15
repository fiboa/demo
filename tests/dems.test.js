import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COLLECTIONS, demsFor, gsiHeight } from '../relief/src/dems.js';

test('GSI colours decode to heights in centimetres, negative from 2^23, (128, 0, 0) is no data', () => {
  assert.equal(gsiHeight(0, 0, 0), 0);
  assert.equal(gsiHeight(0, 39, 16), 100); // 10000 cm
  assert.ok(Math.abs(gsiHeight(255, 255, 255) - -0.01) < 1e-9);
  assert.ok(Number.isNaN(gsiHeight(128, 0, 0)));
});

test('Austria tries Styria or a Tyrol zone by where the field lies; elsewhere none', () => {
  assert.deepEqual(demsFor('at', [15.6, 46.9]).map((d) => d.name), ['ALS DGM Steiermark']);
  assert.deepEqual(demsFor('at', [12.75, 46.83]).map((d) => d.name), ['Geländemodell Tirol', 'Geländemodell Tirol']);
  assert.deepEqual(demsFor('at', [16.4, 48.2]), []);
  assert.deepEqual(demsFor('dk', [9.5, 56]), []);
});

test('every height model names its source, licence and coordinate system', () => {
  for (const { dems } of Object.values(COLLECTIONS)) {
    for (const dem of dems) {
      assert.ok(dem.name && dem.by && dem.licence && dem.link && dem.crs && dem.res <= 1, dem.name);
      assert.ok(dem.url || dem.read, dem.name);
    }
  }
});
