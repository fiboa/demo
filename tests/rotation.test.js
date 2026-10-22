import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GROUPS, MIN_KNOWN, RAMP, counts, cropName, groupIn, groupOf, series, share, shareStep, varied, variedStep } from '../rotation/src/crops.js';
import FACTS from '../rotation/data/examples.json' with { type: 'json' };
import { EXAMPLES, exampleHash } from '../rotation/src/examples.js';
import { hashOf, parseHash } from '../rotation/src/view.js';

test('HCAT codes fall into their groups, the longest prefix first', () => {
  assert.equal(groupOf('3301090400'), 'maize'); // silage maize, under "harvested green"
  assert.equal(groupOf('3301090000'), 'grass');
  assert.equal(groupOf(3302000000), 'grass');
  assert.equal(groupOf('3301010600'), 'maize');
  assert.equal(groupOf('3301010402'), 'cereals');
  assert.equal(groupOf('3301030000'), 'potatoes');
  assert.equal(groupOf('3301290700'), 'beets');
  assert.equal(groupOf('3301290300'), 'vegetables'); // carrots
  assert.equal(groupOf('3301020600'), 'oilseeds'); // peas
  assert.equal(groupOf('3308000000'), 'other');
  assert.equal(groupOf(''), null);
  assert.equal(groupOf(null), null);
});

test('a series runs from y0, blanks where no crop was found', () => {
  const list = series({ y0: 2020, crops: '3301030000,,3302000000' });
  assert.deepEqual(list.map((x) => [x.year, x.code, x.group]), [
    [2020, '3301030000', 'potatoes'],
    [2021, null, null],
    [2022, '3302000000', 'grass'],
  ]);
  assert.equal(groupIn(list, 2022), 'grass');
  assert.equal(groupIn(list, 2021), null);
  assert.equal(cropName('3301010101'), 'Winter common soft wheat');
});

test('measures need enough years and count groups, not codes', () => {
  const few = series({ y0: 2020, crops: Array(MIN_KNOWN - 1).fill('3302000000').join(',') });
  assert.equal(varied(few), null);
  assert.equal(share(few, 'grass'), null);
  // Winter and spring barley are one group.
  const list = series({ y0: 2010, crops: '3301010401,3301010402,3301030000,,3301010401,3301290700' });
  assert.equal(varied(list), 3);
  assert.equal(share(list, 'cereals'), 3 / 5);
  assert.deepEqual(counts(list)[0], { group: 'cereals', years: [2010, 2011, 2014] });
});

test('colour steps span the ramp', () => {
  assert.equal(variedStep(1), RAMP[0]);
  assert.equal(variedStep(12), RAMP.at(-1));
  assert.equal(shareStep(0), RAMP[0]);
  assert.equal(shareStep(1), RAMP.at(-1));
  assert.equal(new Set(GROUPS.map((g) => g.colour)).size, GROUPS.length);
});

test('the address round-trips every view and the chosen field', () => {
  for (const state of [{ view: 'varied' }, { view: 'often', group: 'potatoes' }, { view: 'year', year: 2019 }]) {
    const back = parseHash(hashOf([5.1, 52.2], 13.5, state, [5.2, 52.3]));
    assert.deepEqual(back.center, [5.1, 52.2]);
    assert.equal(back.zoom, 13.5);
    assert.deepEqual(back.select, [5.2, 52.3]);
    assert.equal(back.state.view, state.view);
  }
  assert.equal(parseHash('#5,52,12'), null);
  assert.equal(parseHash('#5,52,12,potatoes').select, null);
});

test('every example is pre-rendered, and its text matches its field', () => {
  for (const e of EXAMPLES) {
    assert.ok(FACTS[e.id], `${e.id}: run scripts/rotation/examples.mjs`);
    assert.ok(parseHash(exampleHash(e)), e.id);
  }
  const of = (id) => series(FACTS[id]);
  const all = (id, group) => of(id).every((x) => x.group === group);
  assert.ok(all('kempen', 'maize') && of('kempen').length === 19, 'kempen: nineteen years of maize');
  assert.ok(all('friesland', 'grass') && of('friesland').length === 18, 'friesland: eighteen times grass');
  assert.ok(all('funen', 'cereals') && of('funen').length === 17, 'funen: seventeen years of cereals');
  assert.equal(varied(of('westflanders')), 8, 'westflanders: eight crop groups');
  const flevo = of('flevoland').filter((x) => x.year >= 2015);
  assert.deepEqual(flevo.filter((x) => x.group === 'potatoes').map((x) => x.year), [2017, 2020, 2023, 2026]);
  assert.deepEqual(flevo.filter((x) => x.group === 'cereals').map((x) => x.year), [2015, 2018, 2021, 2024]);
  assert.deepEqual(of('jutland').filter((x) => x.group === 'grass').map((x) => x.year), [2014, 2018, 2019, 2020, 2021]);
});
