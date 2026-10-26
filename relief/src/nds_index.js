// The Niedersachsen tile index (scripts/relief/nds_tiles.mjs) on its own, so dems.js can load it on demand. A
// dynamic import of the JSON itself fails in Vite's dev server, which answers JavaScript to `type: 'json'`.
export { default } from '../data/nds_dgm1.json' with { type: 'json' };
