import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FARMED,
  LANDUSE_COLORS,
  LOST_RAMP,
  hexToRgba,
  landusePalette,
  yearColor,
  yearPalette,
} from '../nl_raster/src/colors.js';

const TRANSPARENT = [0, 0, 0, 0];

test('nodata is transparent', () => {
  assert.deepEqual(yearColor(0, 2025), TRANSPARENT);
});

test('land gone up to the slider year takes its year colour', () => {
  assert.deepEqual(yearColor(9, 2025), hexToRgba(LOST_RAMP[0]));
  assert.deepEqual(yearColor(14, 2014), hexToRgba(LOST_RAMP[5]));
  assert.deepEqual(yearColor(25, 2025), hexToRgba(LOST_RAMP[16]));
});

test('land still farmed after the slider year is shown as farmed', () => {
  assert.deepEqual(yearColor(15, 2014), hexToRgba(FARMED));
  assert.deepEqual(yearColor(26, 2025), hexToRgba(FARMED));
  assert.deepEqual(yearColor(26, 2009), hexToRgba(FARMED));
});

test('values outside the file range are transparent', () => {
  assert.deepEqual(yearColor(5, 2025), TRANSPARENT);
  assert.deepEqual(yearColor(27, 2025), TRANSPARENT);
});

test('the palette has one colour per pixel value', () => {
  const palette = yearPalette(2020);
  assert.equal(palette.length, 27);
  assert.deepEqual(palette[20], hexToRgba(LOST_RAMP[11]));
  assert.deepEqual(palette[21], hexToRgba(FARMED));
});

test('the land-use palette is indexed by group id', () => {
  const palette = landusePalette();
  assert.equal(palette.length, Object.keys(LANDUSE_COLORS).length);
  for (const [id, hex] of Object.entries(LANDUSE_COLORS)) assert.deepEqual(palette[id], hexToRgba(hex));
});
