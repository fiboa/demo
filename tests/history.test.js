import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXAMPLES, hashOf } from '../history/src/examples.js';
import { OLD_MAPS, REGION_NAMES, TODAY, mapById, mapsIn, nearestYear, regionAt, regionsAt } from '../history/src/maps.js';

test('places fall in their region, and outside all of them elsewhere', () => {
  assert.equal(regionAt([4.9, 52.37]), 'nl'); // Amsterdam
  assert.equal(regionAt([5.75, 52.71]), 'nl'); // Emmeloord, on land that was sea
  assert.equal(regionAt([3.72, 51.05]), 'be-vlg'); // Ghent
  assert.equal(regionAt([4.35, 50.85]), null); // Brussels, a hole in Flanders
  assert.equal(regionAt([5.57, 50.63]), null); // Liège, Wallonia
  assert.equal(regionAt([4.83, 45.76]), 'fr'); // Lyon
  assert.equal(regionAt([7.45, 46.95]), 'ch'); // Bern
  assert.equal(regionAt([6.96, 50.94]), 'de-nw'); // Cologne
  assert.equal(regionAt([13.4, 52.52]), null); // Berlin
});

test('every region has old maps, a name and an aerial photo of today', () => {
  for (const region of Object.keys(REGION_NAMES)) {
    assert.ok(mapsIn(region).length, region);
    assert.ok(TODAY[region], region);
  }
  for (const m of OLD_MAPS) assert.ok(REGION_NAMES[m.region], m.id);
});

test('maps with editions start on one they have, and snap to the nearest', () => {
  for (const m of OLD_MAPS.filter((x) => x.years)) assert.ok(m.years.includes(m.year), m.id);
  const topo = mapById('topotijdreis');
  assert.equal(nearestYear(topo, 1930), 1930);
  assert.equal(nearestYear(topo, 1943), 1944);
  assert.equal(nearestYear(topo, 2024), 2016);
  assert.equal(nearestYear(topo, null), topo.year);
  assert.equal(nearestYear(mapById('ferraris'), 1930), null);
});

test('every example shows a map of the region it lies in', () => {
  for (const e of EXAMPLES) {
    const m = mapById(e.map);
    assert.ok(m, e.id);
    assert.ok(regionsAt([e.lon, e.lat]).includes(m.region), e.id);
    if (m.years) assert.ok(m.years.includes(e.year), e.id);
    assert.ok(e.zoom >= (m.minZoom ?? 12), `${e.id}: zoomed in far enough for the map and the fields`);
  }
  assert.equal(hashOf(EXAMPLES[0]), '#5.66,52.68,12,topotijdreis,1930');
  assert.equal(hashOf({ lon: 1, lat: 2, zoom: 14, map: 'ferraris', year: null }), '#1,2,14,ferraris');
});
