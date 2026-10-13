import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LANDUSE_COLORS } from '../nl_raster/src/colors.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../nl_raster/data/${name}`, import.meta.url)));
const years = load('years.json');
const municipalities = load('municipalities.json');
const crops = load('crops.json');
const clusters = load('clusters.json');
const landuse = load('landuse.json');

const NL_EXTENT = [13652, 306850, 277838, 613650];
// Every value is rounded to 0.01 ha, so a sum of n values may drift by n × 0.005 ha.
const close = (actual, expected, n, message) =>
  assert.ok(Math.abs(actual - expected) <= n * 0.005 + 1e-6, `${message}: ${actual} vs ${expected}`);

test('municipalities and the area outside them add up to the national total per year', () => {
  for (const [year, national] of Object.entries(years.ha_by_last_year)) {
    const parts = [municipalities.outside_municipalities, ...municipalities.municipalities.map((m) => m.ha_by_last_year)];
    const total = parts.reduce((s, byYear) => s + (byYear[year] ?? 0), 0);
    close(total, national, parts.length, `year ${year}`);
  }
});

test('the last crops add up to the land that disappeared per year', () => {
  for (let year = years.first_year; year <= years.lost_max_year; year++) {
    const values = Object.values(crops.ha_by_last_year).map((byYear) => byYear[year] ?? 0);
    const total = values.reduce((a, b) => a + b, 0);
    close(total, years.ha_by_last_year[year], values.length, `year ${year}`);
  }
});

test('every crop code with land has a name, except code 0 (no HCAT code)', () => {
  for (const code of Object.keys(crops.ha_by_last_year)) {
    if (code !== '0') assert.ok(crops.crops[code]?.name, `crop ${code} has no name`);
  }
});

test('clusters lie in the Netherlands, largest first, and lose no more than their area', () => {
  assert.ok(clusters.clusters.length > 0);
  let previous = Infinity;
  for (const c of clusters.clusters) {
    const [xmin, ymin, xmax, ymax] = c.bbox;
    assert.ok(xmin >= NL_EXTENT[0] && ymin >= NL_EXTENT[1] && xmax <= NL_EXTENT[2] && ymax <= NL_EXTENT[3]);
    assert.ok(c.lost_ha <= c.area_ha, `${c.municipality}: ${c.lost_ha} > ${c.area_ha}`);
    assert.ok(c.lost_ha <= previous);
    previous = c.lost_ha;
  }
});

test('municipality boundaries are plain RFC 7946 GeoJSON, so OpenLayers reprojects them', () => {
  const shapes = load('municipalities.geojson');
  assert.equal(shapes.crs, undefined);
  const [lon, lat] = shapes.features[0].geometry.coordinates[0][0][0];
  assert.ok(lon > 3 && lon < 8 && lat > 50 && lat < 54);
});

test('the land-use groups add up to the national total per year', () => {
  for (const [year, expected] of Object.entries(years.ha_by_last_year)) {
    const groups = landuse.groups.map((g) => landuse.ha_by_group[g.id][year] ?? 0);
    close(groups.reduce((a, b) => a + b, 0), expected, groups.length + 1, `year ${year}`);
  }
});

test('land still farmed in 2026 is mostly farmland in LGN too, so both grids line up', () => {
  const farmed = years.ha_by_last_year[years.last_year];
  assert.ok(landuse.ha_by_group[7][years.last_year] / farmed > 0.85);
});

test('every land-use group has a colour', () => {
  for (const g of landuse.groups) assert.ok(LANDUSE_COLORS[g.id], `group ${g.id}`);
});
