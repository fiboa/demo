/**
 * Index of LGLN Niedersachsen's DGM1: one cloud-optimised GeoTIFF per 1 km tile in EPSG:25832, filed per flight
 * campaign (`L1506/`, `L2301/`, …) as a full tile (`Vollkacheln/`), an edge tile of the campaign (`Randkacheln/`,
 * no data outside it) or a tile outside the state (`Nicht_NI/`). A tile is flown again by later campaigns, so the
 * bucket holds up to six files for it. Writes
 *
 *   {"prefixes": ["L1343/Nicht_NI", …], "tiles": {"551_5929": [[0, 2013]], …}}
 *
 * with per tile, keyed by the kilometre of its south-west corner, the files newest first as [prefix, year],
 * up to and including the newest full tile: the relief page fills each cell from the first file with a value.
 *
 *   node scripts/relief/nds_tiles.mjs > relief/data/nds_dgm1.json
 */
const BUCKET = 'https://dgm1.s3.eu-de.cloud-object-storage.appdomain.cloud/';
const NAME = /^(.+)\/dgm1_32_(\d+)_(\d+)_1_ni_(\d{4})\.tif$/;

const files = [];
for (let marker = ''; ;) {
  const xml = await (await fetch(`${BUCKET}?max-keys=1000&marker=${encodeURIComponent(marker)}`)).text();
  for (const [, key] of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
    const m = key.match(NAME);
    if (m) files.push({ prefix: m[1], tile: `${m[2]}_${m[3]}`, year: +m[4] });
  }
  if (!xml.includes('<IsTruncated>true</IsTruncated>')) break;
  marker = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/)[1];
}

const full = (f) => f.prefix.endsWith('/Vollkacheln');
const prefixes = [...new Set(files.map((f) => f.prefix))].sort();
const byTile = new Map();
for (const f of files) {
  if (!byTile.has(f.tile)) byTile.set(f.tile, []);
  byTile.get(f.tile).push(f);
}
const tiles = {};
for (const tile of [...byTile.keys()].sort()) {
  // Newest first; within a year a full tile before an edge tile.
  const list = byTile.get(tile).sort((a, b) => b.year - a.year || full(b) - full(a));
  const last = list.findIndex(full);
  tiles[tile] = list.slice(0, last < 0 ? undefined : last + 1).map((f) => [prefixes.indexOf(f.prefix), f.year]);
}
process.stderr.write(`${files.length} files, ${byTile.size} tiles\n`);
process.stdout.write(JSON.stringify({ prefixes, tiles }));
