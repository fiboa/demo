import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countClasses, LGN_BY_COLOR, LGN_CLASSES } from '../nl_raster/src/lgn.js';
import { floodFill, outline } from '../nl_raster/src/patch.js';

// 5 × 4 window; the 18s form one patch (4-connected), the lone 18 at the bottom right touches it only
// diagonally, so it stays out.
const W = 5;
const H = 4;
const VALUES = Uint8Array.from([
  0, 18, 18, 0, 0,
  0, 18, 20, 0, 0,
  0, 18, 18, 0, 0,
  0, 0, 0, 18, 0,
]);

test('the patch is the 4-connected cells with the clicked value, cropped to its box', () => {
  const patch = floodFill(VALUES, W, H, 1, 0);
  assert.equal(patch.value, 18);
  assert.equal(patch.count, 5);
  assert.deepEqual([patch.minC, patch.minR, patch.width, patch.height], [1, 0, 2, 3]);
  assert.deepEqual([...patch.mask], [1, 1, 1, 0, 1, 1]);
  assert.equal(patch.touchesEdge, true);
});

test('a click outside any field gives no patch', () => {
  assert.equal(floodFill(VALUES, W, H, 0, 0), null);
});

test('the outline runs along the cell edges of the patch', () => {
  const patch = { mask: Uint8Array.from([1, 1]), width: 2, height: 1, bbox: [0, 0, 4, 2], cell: 2 };
  const segments = outline(patch);
  // A 2 × 1 block has six unit edges: two on top, two at the bottom, one at each end.
  assert.equal(segments.length, 6);
  assert.deepEqual(segments[0], [[0, 2], [2, 2]]);
});

test('every LGN2025 class has a colour, and shared colours are reported together', () => {
  assert.equal(LGN_CLASSES.length, 50);
  assert.equal(LGN_BY_COLOR.get('#ff0000').label, '18 - bebouwing in primair bebouwd gebied');
  assert.equal(LGN_BY_COLOR.get('#750075').label, '34/36 - heide of duinheide');
  for (const entry of LGN_BY_COLOR.values()) assert.ok(entry.name, entry.codes.join('/'));
});

test('classes are counted under the mask only, largest first, unknown colours last as not in LGN', () => {
  const px = (r, g, b, a = 255) => [r, g, b, a];
  const rgba = Uint8ClampedArray.from([
    ...px(255, 0, 0), ...px(255, 0, 0), ...px(36, 115, 255), ...px(1, 2, 3), ...px(0, 0, 0, 0), ...px(255, 0, 0),
  ]);
  const rows = countClasses(rgba, Uint8Array.from([1, 1, 1, 1, 1, 0]));
  assert.deepEqual(
    rows.map((r) => [r.label, r.pixels]),
    [
      ['18 - bebouwing in primair bebouwd gebied', 2],
      ['16 - zoet water', 1],
      ['not in LGN2025', 2],
    ],
  );
});
