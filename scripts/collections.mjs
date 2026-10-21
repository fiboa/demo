/**
 * The title and newest edition year of every collection in the published catalog, for the season and history demos:
 * the global PMTiles hold the newest edition of each, and its crops belong to that year.
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
    out[collection.id] = { title: collection.title, year: years.length ? Math.max(...years) : null };
  }),
);
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(Object.keys(sorted).length, 'collections');
