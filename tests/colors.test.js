import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FARMED,
  FIRST_YEAR,
  LANDUSE_COLORS,
  LOST_RAMP,
  hexToRgba,
  landusePalette,
  yearColor,
  yearPalette,
} from '../nl_raster/src/colors.js';

const TRANSPARENT = [0, 0, 0, 0];
const ramp = (year) => hexToRgba(LOST_RAMP[year - FIRST_YEAR]);

test('with farmed land switched off, only the lost land keeps a colour', () => {
  assert.deepEqual(yearColor(26, 2025, false), TRANSPARENT);
  assert.deepEqual(yearColor(15, 2014, false), TRANSPARENT);
  assert.deepEqual(yearColor(14, 2014, false), ramp(2014));
});

test('nodata is transparent', () => {
  assert.deepEqual(yearColor(0, 2025), TRANSPARENT);
});

test('land gone up to the slider year takes its year colour', () => {
  assert.equal(LOST_RAMP.length, 2025 - FIRST_YEAR + 1);
  assert.deepEqual(yearColor(5, 2025), hexToRgba(LOST_RAMP[0]));
  assert.deepEqual(yearColor(14, 2014), ramp(2014));
  assert.deepEqual(yearColor(25, 2025), hexToRgba(LOST_RAMP.at(-1)));
});

test('land still farmed after the slider year is shown as farmed', () => {
  assert.deepEqual(yearColor(15, 2014), hexToRgba(FARMED));
  assert.deepEqual(yearColor(26, 2025), hexToRgba(FARMED));
  assert.deepEqual(yearColor(26, 2005), hexToRgba(FARMED));
});

test('values outside the file range are transparent', () => {
  assert.deepEqual(yearColor(4, 2025), TRANSPARENT);
  assert.deepEqual(yearColor(27, 2025), TRANSPARENT);
});

test('the palette has one colour per pixel value', () => {
  const palette = yearPalette(2020);
  assert.equal(palette.length, 27);
  assert.deepEqual(palette[20], ramp(2020));
  assert.deepEqual(palette[21], hexToRgba(FARMED));
});

test('the land-use palette is indexed by group id', () => {
  const palette = landusePalette();
  assert.equal(palette.length, Object.keys(LANDUSE_COLORS).length);
  for (const [id, hex] of Object.entries(LANDUSE_COLORS)) assert.deepEqual(palette[id], hexToRgba(hex));
});
