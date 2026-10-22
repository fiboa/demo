/**
 * Crop groups of the regions demo: the HCAT prefixes in regions/data/groups.json (shared with
 * scripts/regions/cells.py, which sums the hectares per group in the overview cells), and a colour each.
 */
import LIST from '../data/groups.json' with { type: 'json' };

const pct = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('en-GB');

// Colours after the crop itself; only the groups of one example show at a time, so only those need to differ.
const COLOURS = {
  maize: '#e3a600',
  wheat: '#b8862b',
  barley: '#cdb25a',
  rice: '#2f9a9a',
  cereals: '#9a7444',
  soy: '#4f7a1f',
  rapeseed: '#d9c400',
  sunflower: '#f08a00',
  cotton: '#7b6bb0',
  pulses: '#8a5aa8',
  potatoes: '#5b3f99',
  beet: '#c8417a',
  vegetables: '#d9572e',
  flowers: '#e0409a',
  fodder: '#6fae3f',
  grassland: '#2f7d32',
  fallow: '#a89a7a',
  vines: '#8a1f4f',
  olives: '#5f6e1c',
  fruit: '#d63a2f',
  nuts: '#8a5a2b',
  other: '#7d8580',
};

export const GROUPS = LIST.map((g) => ({ ...g, colour: COLOURS[g.id] }));
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

const PREFIXES = GROUPS.flatMap((g) => g.prefixes.map((p) => [p, g.id])).sort((a, b) => b[0].length - a[0].length);

/** The group of an HCAT code (number or string), or null without a code. */
export function groupOf(code) {
  if (code == null || code === '') return null;
  const s = String(code);
  return PREFIXES.find(([p]) => s.startsWith(p))?.[1] ?? null;
}

/**
 * Whether the overview counts a collection: every field once, so not the field blocks, the EuroCrops copies of
 * national collections, the Spanish regions (`es` covers Spain) and `ie` (`ie_lpis` covers Ireland). The same
 * rule as `skipped` in scripts/regions/cells.py.
 */
export function counted(collection) {
  if (!collection || collection.endsWith('_block') || collection === 'ie' || collection.startsWith('es_')) return false;
  return !collection.startsWith('ec_') || collection === 'ec_ro';
}

/**
 * The share of a cell's land covered by fields of `groups`, from its properties (`pct_covered` is the share of
 * all fields, `area_ha` their hectares, `ha_<group>` those of a group), and the group with the most of them.
 */
export function cellShare(properties, groups) {
  const area = Number(properties.area_ha);
  if (!area) return { share: 0, top: null };
  let sum = 0;
  let top = null;
  for (const g of groups) {
    const ha = Number(properties[`ha_${g}`] ?? 0);
    sum += ha;
    if (ha > 0 && (!top || ha > Number(properties[`ha_${top}`]))) top = g;
  }
  return { share: (Number(properties.pct_covered) / 100) * (sum / area), top };
}

/** Share of a cell's land in the chosen crops: the lower bound of each step, and its opacity. */
export const STEPS = [
  [0.01, 0.2],
  [0.05, 0.38],
  [0.1, 0.56],
  [0.2, 0.74],
  [0.4, 0.92],
];

/** The step of a share, or -1 below the first. */
export const stepOf = (share) => STEPS.findLastIndex(([from]) => share >= from);

/** One line on a cell: the share of its land in each chosen crop, and its fields. */
export function describeCell(p, groups) {
  const parts = groups
    .map((g) => [g, cellShare(p, [g]).share])
    .filter(([, s]) => s >= 0.005)
    .map(([g, s]) => `${pct.format(Math.min(s, 1))} ${GROUP[g].name.toLowerCase()}`);
  const fields = `${int.format(p.count)} ${p.count === 1 ? 'field' : 'fields'}`;
  return parts.length ? `${parts.join(', ')} · ${fields}` : `${fields}, none of ${groups.length === 1 ? 'this crop' : 'these crops'}`;
}
