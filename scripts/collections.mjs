/**
 * The title and newest edition year of every collection in the published catalog, for the season and history demos:
 * the global PMTiles hold the newest edition of each, and its crops belong to that year. For the stories also how
 * its fields were drawn (`boundaries`: declared, mapped or inferred), the fields in the newest edition, the first
 * year, the licence, the publisher, the bounding box and its own PMTiles.
 *
 *   node scripts/collections.mjs   # writes shared/collections.json
 */
import { writeFileSync } from 'node:fs';

const CATALOG = 'https://data.source.coop/ftw/harmonized-field-data/catalog.json';
const OUT = new URL('../shared/collections.json', import.meta.url);

const json = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
};

const catalog = await json(CATALOG);
const children = catalog.links.filter((l) => l.rel === 'child');
const out = {};
await Promise.all(
  children.map(async (link) => {
    const collection = await json(new URL(link.href, CATALOG));
    const years = collection.links
      .filter((l) => l.rel === 'item')
      .flatMap((l) => [...l.href.matchAll(/year=(\d{4})/g)].map((m) => Number(m[1])));
    const bbox = collection.extent?.spatial?.bbox?.[0];
    out[collection.id] = {
      title: collection.title,
      year: years.length ? Math.max(...years) : null,
      first: years.length ? Math.min(...years) : null,
      boundaries: collection.boundaries ?? null,
      fields: collection['table:row_count'] ?? null,
      license: collection.license ?? null,
      publisher: collection.providers?.find((p) => p.name !== 'Fields of the World' && !p.name.startsWith('Joint Research'))?.name ?? null,
      bbox: bbox ? bbox.map((v) => Math.round(v * 100) / 100) : null,
      // The collection's own PMTiles of its newest edition: layer named after the collection, from zoom 0.
      pmtiles: collection.assets?.visual ? new URL(collection.assets.visual.href, new URL(link.href, CATALOG)).href : null,
    };
  }),
);
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(Object.keys(sorted).length, 'collections');
