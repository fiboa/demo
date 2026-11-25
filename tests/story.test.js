import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STEPS as OUTLINES } from '../outlines/src/steps.js';
import COLLECTIONS from '../shared/collections.json' with { type: 'json' };
import { bubbles, fieldCollections, fieldCount, totals } from '../shared/story-facts.js';
import { STEPS as TOUR, within } from '../tour/src/steps.js';

test('every collection of fields says how its outlines were made, how many fields and where its PMTiles are', () => {
  for (const [id, c] of fieldCollections()) {
    assert.ok(['declared', 'mapped', 'inferred'].includes(c.boundaries), `${id}: ${c.boundaries}`);
    assert.ok(c.fields > 0, `${id}: no fields`);
    assert.match(c.pmtiles, /^https:\/\/data\.source\.coop\/ftw\/harmonized-field-data\/.+\.pmtiles$/, id);
    assert.ok(c.first <= c.year, id);
  }
  assert.ok(!fieldCollections().some(([id]) => id.endsWith('_block')));
});

test('the totals per kind add up to the total', () => {
  const t = totals();
  const kinds = Object.values(t.kinds);
  assert.equal(kinds.reduce((a, k) => a + k.fields, 0), t.fields);
  assert.equal(kinds.reduce((a, k) => a + k.collections, 0), t.collections);
  assert.equal(bubbles().features.length, t.collections);
});

test('field counts read as words', () => {
  assert.equal(fieldCount(28103804), '28.1 million');
  assert.equal(fieldCount(439001), '439,001');
});

for (const [name, steps] of [['outlines', OUTLINES], ['tour', TOUR]]) {
  test(`${name}: every step has a unique id and a view, and shows only collections with PMTiles`, () => {
    const ids = steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const step of steps) {
      assert.equal(step.view.center.length, 2, step.id);
      assert.ok(step.view.zoom > 0, step.id);
      for (const id of [...(step.show ?? []), ...(step.outline ?? [])]) assert.ok(COLLECTIONS[id]?.pmtiles, `${step.id}: ${id}`);
      assert.doesNotMatch(step.html, /undefined|NaN/, step.id);
    }
  });
}

test('within() keeps the collections centred in a box', () => {
  const ids = within([3, 50, 8, 54]).map(([id]) => id);
  assert.ok(ids.includes('nl'));
  assert.ok(!ids.includes('jp'));
});
