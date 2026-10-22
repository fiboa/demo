import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GROUP, GROUPS, STEPS, cellShare, counted, describeCell, groupOf, stepOf } from '../regions/src/groups.js';
import FACTS from '../regions/data/examples.json' with { type: 'json' };
import { EXAMPLES, exampleHash } from '../regions/src/examples.js';
import { hashOf, parseHash } from '../regions/src/view.js';

test('HCAT codes fall into their groups, the longest prefix first', () => {
  assert.equal(groupOf('3301010600'), 'maize');
  assert.equal(groupOf('3301090400'), 'maize'); // silage maize, under "harvested green"
  assert.equal(groupOf('3301090301'), 'fodder'); // alfalfa
  assert.equal(groupOf(3302000000), 'grassland');
  assert.equal(groupOf('3301010101'), 'wheat');
  assert.equal(groupOf('3301010201'), 'wheat'); // durum
  assert.equal(groupOf('3301010402'), 'barley');
  assert.equal(groupOf('3301010700'), 'rice');
  assert.equal(groupOf('3301010501'), 'cereals'); // oats
  assert.equal(groupOf('3301084900'), 'flowers'); // tulips
  assert.equal(groupOf('3301061232'), 'flowers'); // crocus, filed under aromatic plants
  assert.equal(groupOf('3301083900'), 'other'); // safflower, an oil crop filed under flowers
  assert.equal(groupOf('3303060000'), 'vines');
  assert.equal(groupOf('3303050000'), 'olives');
  assert.equal(groupOf('3303030100'), 'nuts'); // almonds
  assert.equal(groupOf('3303040000'), 'fruit'); // citrus
  assert.equal(groupOf('3301290700'), 'beet');
  assert.equal(groupOf('3301290300'), 'vegetables'); // carrots
  assert.equal(groupOf('3306000000'), 'other');
  assert.equal(groupOf(''), null);
  assert.equal(groupOf(null), null);
  assert.equal(new Set(GROUPS.map((g) => g.id)).size, GROUPS.length);
  assert.ok(GROUPS.every((g) => /^#[0-9a-f]{6}$/.test(g.colour)), 'every group has a colour');
});

test('every field counts once: the same collections as scripts/regions/cells.py', () => {
  for (const c of ['nl', 'fr', 'es', 'us_usda_cropland', 'ie_lpis', 'ec_ro', 'jp', 'de_bw']) assert.ok(counted(c), c);
  for (const c of ['nl_block', 'ec_fr', 'ec_lv', 'es_an', 'es_cl', 'ie', '', undefined]) assert.ok(!counted(c), c);
  const python = readFileSync(new URL('../scripts/regions/cells.py', import.meta.url), 'utf8');
  assert.match(python, /col\.endswith\("_block"\) or col == "ie" or col\.startswith\("es_"\)/);
  assert.match(python, /col\.startswith\("ec_"\) and col != "ec_ro"/);
});

test('a cell shows the share of its land in the chosen crops, coloured by the largest', () => {
  // 20 % of the cell is fields; half of those maize, a quarter soy.
  const p = { count: 120, area_ha: 1000, pct_covered: 20, ha_maize: 500, ha_soy: 250 };
  const both = cellShare(p, ['maize', 'soy']);
  assert.ok(Math.abs(both.share - 0.15) < 1e-9);
  assert.equal(both.top, 'maize');
  assert.equal(cellShare(p, ['soy', 'maize']).top, 'maize');
  assert.equal(cellShare(p, ['vines']).top, null);
  assert.equal(cellShare({ area_ha: 0 }, ['maize']).share, 0);
  assert.equal(describeCell(p, ['maize', 'soy']), '10% maize, 5% soybeans · 120 fields');
  assert.equal(describeCell(p, ['vines']), '120 fields, none of this crop');
  assert.equal(stepOf(0.005), -1);
  assert.equal(stepOf(0.15), 2);
  assert.equal(stepOf(1), STEPS.length - 1);
});

test('the address holds the place and the groups', () => {
  const hash = hashOf([-91.5, 41.6], 5.4, ['maize', 'soy']);
  assert.equal(hash, '#-91.5000,41.6000,5.4,maize+soy');
  assert.deepEqual(parseHash(hash), { center: [-91.5, 41.6], zoom: 5.4, groups: ['maize', 'soy'] });
  assert.deepEqual(parseHash('#1,2,3,maize+nonsense+maize').groups, ['maize']);
  assert.deepEqual(parseHash('#1,2,3').groups, []);
  assert.equal(parseHash('#nonsense'), null);
  assert.equal(parseHash(''), null);
});

test('examples have known groups, a flag and a text', () => {
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, EXAMPLES.length);
  for (const e of EXAMPLES) {
    assert.ok(e.groups.length && e.groups.every((g) => GROUP[g]), e.id);
    assert.deepEqual(parseHash(exampleHash(e)).groups, e.groups);
    assert.ok(e.text.length > 40, `${e.id} has a text`);
  }
});

/** Hectares as a text says them: millions with one decimal, else three significant digits from 100,000, two below. */
function hectares(ha) {
  if (ha >= 1e6) return (ha / 1e6).toFixed(1);
  const digits = ha >= 1e5 ? 3 : 2;
  const step = 10 ** (Math.floor(Math.log10(ha)) - digits + 1);
  return new Intl.NumberFormat('en-GB').format(Math.round(ha / step) * step);
}

test('the shares and hectares in the card texts are those of the cells', () => {
  for (const e of EXAMPLES) {
    const facts = FACTS[e.id];
    assert.ok(facts, `${e.id} in regions/data/examples.json`);
    assert.deepEqual(Object.keys(facts.groups), e.groups, e.id);
    const share = Object.values(facts.groups).reduce((sum, g) => sum + g.of_fields, 0);
    assert.ok(e.text.includes(`${Math.round(share * 100)}%`), `${e.id}: ${Math.round(share * 100)}%`);
    for (const g of Object.values(facts.groups)) assert.ok(e.text.includes(hectares(g.ha)), `${e.id}: ${hectares(g.ha)}`);
    // "the largest crop" only where it is.
    if (/largest crop/.test(e.text)) assert.equal(facts.top[0][0], e.groups[0], e.id);
  }
});
