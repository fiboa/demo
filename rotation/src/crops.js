/**
 * Crop groups of the rotation demo, from HCAT codes (EuroCrops HCAT v3, ten digits, hierarchical): the one place
 * that decides which crop counts as which group and which colour it has. And the measures a field's series gives.
 */
import NAMES from '../data/hcat-names.json' with { type: 'json' };

/**
 * Seven groups with a colour and "other" in grey. The order is the legend's; it is validated as a categorical
 * palette (adjacent pairs pass the colour-vision checks; grass and cereals are close for protanopes, which the
 * legend, the tooltip and the panel's names make up for).
 */
export const GROUPS = [
  { id: 'grass', short: 'grass', name: 'Grass and clover', colour: '#008300' },
  { id: 'maize', short: 'maize', name: 'Maize', colour: '#eda100' },
  { id: 'cereals', short: 'cereals', name: 'Wheat, barley and other cereals', colour: '#a8641e' },
  { id: 'potatoes', short: 'potatoes', name: 'Potatoes', colour: '#4a3aa7' },
  { id: 'beets', short: 'beets', name: 'Sugar and fodder beet', colour: '#e87ba4' },
  { id: 'vegetables', short: 'vegetables', name: 'Vegetables, bulbs and flowers', colour: '#2a78d6' },
  { id: 'oilseeds', short: 'rapeseed or pulses', name: 'Rapeseed, flax and pulses', colour: '#1baf7a' },
  { id: 'other', short: 'other', name: 'Other: fallow, fruit, trees, unknown', colour: '#b9bdb8' },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/** The HCAT name of a code, readable ("winter_common_soft_wheat" -> "Winter common soft wheat"), or null. */
export function cropName(code) {
  const name = code && NAMES[String(code)];
  return name ? name[0].toUpperCase() + name.slice(1).replaceAll('_', ' ') : null;
}

// HCAT prefixes per group, longest first wins. 330109 is "plants harvested green": grass, clover, lucerne and
// silage maize (3301090400, which goes to maize).
const PREFIXES = [
  ['3301090400', 'maize'],
  ['3301010600', 'maize'],
  ['3302', 'grass'],
  ['330109', 'grass'],
  ['330101', 'cereals'],
  ['330103', 'potatoes'],
  ['3301290700', 'beets'],
  ['3301290400', 'beets'],
  ['330102', 'oilseeds'],
  ['330106', 'oilseeds'],
  ['330107', 'vegetables'],
  ['330108', 'vegetables'],
  ['330114', 'vegetables'],
  ['330120', 'vegetables'],
  ['330121', 'vegetables'],
  ['330122', 'vegetables'],
  ['330125', 'vegetables'],
  ['330129', 'vegetables'],
  ['330131', 'vegetables'],
].sort((a, b) => b[0].length - a[0].length);

/** The group of an HCAT code (number or string), or null for none (no field there that year). */
export function groupOf(code) {
  if (code == null || code === '') return null;
  const s = String(code);
  for (const [prefix, group] of PREFIXES) if (s.startsWith(prefix)) return group;
  return 'other';
}

/** A field's series from its tile properties: [{ year, code, group }] from y0 on; code and group null where none. */
export function series(properties) {
  const y0 = Number(properties.y0);
  return String(properties.crops ?? '')
    .split(',')
    .map((code, i) => ({ year: y0 + i, code: code || null, group: groupOf(code) }));
}

// A series needs this many years with a crop before the map colours it by a measure.
export const MIN_KNOWN = 5;

/** The number of different groups in the years with a crop ("other" counts as one), or null with too few years. */
export function varied(list) {
  const known = list.filter((x) => x.group);
  if (known.length < MIN_KNOWN) return null;
  return new Set(known.map((x) => x.group)).size;
}

/** The share of the years with a crop that had `group`, or null with too few years. */
export function share(list, group) {
  const known = list.filter((x) => x.group);
  if (known.length < MIN_KNOWN) return null;
  return known.filter((x) => x.group === group).length / known.length;
}

/** Years with a crop per group, most first: [{ group, years: [year, ...] }]. */
export function counts(list) {
  const by = new Map();
  for (const x of list) if (x.group) by.set(x.group, [...(by.get(x.group) ?? []), x.year]);
  return [...by].map(([group, years]) => ({ group, years })).sort((a, b) => b.years.length - a.years.length);
}

/** The crop group of `year`, or null. */
export const groupIn = (list, year) => list.find((x) => x.year === year)?.group ?? null;

/** One-hue blue ramp, light to dark: steps for the sequential views. */
export const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

/** Colour step of "how varied": 1 group the lightest, 7 or more the darkest. */
export const variedStep = (n) => RAMP[Math.min(n, RAMP.length) - 1];

/** Colour step of "how often": 0 the lightest, every year the darkest, in equal bins. */
export const shareStep = (s) => RAMP[Math.min(RAMP.length - 1, Math.floor(s * (RAMP.length - 1) + 1e-9))];
