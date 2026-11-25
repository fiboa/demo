/** Figures and fact lists for the story cards, all from shared/collections.json so they follow the catalog. */
import COLLECTIONS from './collections.json' with { type: 'json' };

/** How the fields of a collection were drawn, with the colour each kind gets (validated for colour blindness). */
export const KINDS = {
  declared: { label: 'Declared', colour: '#3987e5', text: 'drawn by farmers or their paying agency' },
  mapped: { label: 'Mapped', colour: '#d95926', text: 'drawn by hand from imagery' },
  inferred: { label: 'Inferred', colour: '#199e70', text: 'derived from satellite data by a model' },
};

/** Collections of the catalog that hold fields (not the field blocks that repeat a country's fields). */
export const fieldCollections = () =>
  Object.entries(COLLECTIONS).filter(([id, c]) => !id.endsWith('_block') && c.boundaries && c.bbox);

/** "28.1 million", "439,001", "1,349": the number of fields in the newest edition. */
export function fieldCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('en', { maximumFractionDigits: 1 })} million`;
  return n.toLocaleString('en');
}

/** The bubbles: one point per collection at the centre of its extent. */
export function bubbles() {
  return {
    type: 'FeatureCollection',
    features: fieldCollections().map(([id, c]) => ({
      type: 'Feature',
      properties: { id, kind: c.boundaries, fields: c.fields ?? 0, title: c.title },
      geometry: { type: 'Point', coordinates: [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2] },
    })),
  };
}

export const collection = (id) => {
  const c = COLLECTIONS[id];
  if (!c) throw new Error(`unknown collection ${id}`);
  return c;
};

/** The number of fields in the newest edition of `id`, as words. */
export const fields = (id) => fieldCount(collection(id).fields);

/** "2009–2026", or "2021" for a single edition. */
export const years = (id) => {
  const { first, year } = collection(id);
  return first === year ? String(year) : `${first}–${year}`;
};

/** Collections, fields and the sum per kind of boundary, over the collections of fields (no field blocks). */
export function totals() {
  const out = { collections: 0, fields: 0, kinds: {} };
  for (const [, c] of fieldCollections()) {
    out.collections += 1;
    out.fields += c.fields ?? 0;
    const k = (out.kinds[c.boundaries] ??= { collections: 0, fields: 0 });
    k.collections += 1;
    k.fields += c.fields ?? 0;
  }
  return out;
}

const licence = (l) => (l === 'other' ? 'own terms' : l?.replace(/-/g, ' ') ?? 'unknown');

/** The kind of boundary as a coloured label. */
export const kind = (id) => {
  const k = KINDS[collection(id).boundaries];
  return `<span class="story-kind"><span class="swatch" style="background:${k.colour}"></span>${k.label}</span>`;
};

/** A short list of facts for the card about `id`. */
export function facts(id) {
  const c = collection(id);
  const rows = [
    ['Fields', `${fields(id)}`],
    ['Years', years(id)],
    ['Licence', licence(c.license)],
    ['Outlines', kind(id)],
  ];
  return `<dl class="story-facts">${rows.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>`;
}
