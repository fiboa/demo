/**
 * Example fields: a lon/lat point inside each, the map's zoom and view (`varied`, a crop group, or a year), the
 * country for its flag, a short label for the map panel and the title and text of its card. The pictures and
 * series are pre-rendered by scripts/rotation/examples.mjs into rotation/examples/<id>.png and
 * rotation/data/examples.json; rerun it after changing this list.
 */
import { hashOf } from './view.js';

export const EXAMPLES = [
  {
    id: 'flevoland',
    lon: 5.57518,
    lat: 52.53335,
    zoom: 14,
    view: { view: 'year', year: 2026 },
    country: 'nl',
    short: 'Flevoland',
    title: 'Potatoes every third year',
    text: 'On the young clay of the Noordoostpolder this field runs a strict three-year cycle since 2015: wheat, then onions or carrots, then potatoes. Many neighbours keep a similar beat, a year or two apart: slide through the years to see the potatoes move across the polder.',
  },
  {
    id: 'kempen',
    lon: 4.86287,
    lat: 51.28307,
    zoom: 14,
    view: { view: 'often', group: 'maize' },
    country: 'be',
    short: 'Kempen',
    title: 'Nineteen years of maize',
    text: 'On the sandy soils of the Antwerp Kempen, dairy and pig farms grow silage maize on the same fields year after year. This one had maize in every register since 2008.',
  },
  {
    id: 'westflanders',
    lon: 3.02083,
    lat: 50.98861,
    zoom: 14,
    view: { view: 'varied' },
    country: 'be',
    short: 'West Flanders',
    title: 'Something else every year',
    text: 'Near Roeselare, the heart of the Flemish frozen vegetable industry, potatoes come back every three or four years, with spinach, beans, cauliflower and carrots for the factories in between: eight crop groups in nineteen years.',
  },
  {
    id: 'friesland',
    lon: 5.54582,
    lat: 53.07776,
    zoom: 14,
    view: { view: 'often', group: 'grass' },
    country: 'nl',
    short: 'Friesland',
    title: 'Grass that is never ploughed',
    text: 'In the peat meadows of Friesland nearly every field is permanent grassland, grazed and mown for dairy cows. Eighteen registers, eighteen times grass.',
  },
  {
    id: 'funen',
    lon: 10.17158,
    lat: 55.38979,
    zoom: 14,
    view: { view: 'often', group: 'cereals' },
    country: 'dk',
    short: 'Funen',
    title: 'Cereals after cereals',
    text: 'On Funen whole farms grow little but grain. This field alternated winter wheat with spring barley and oats, but had a cereal in every one of seventeen years.',
  },
  {
    id: 'jutland',
    lon: 9.45196,
    lat: 56.22088,
    zoom: 14,
    view: { view: 'year', year: 2019 },
    country: 'dk',
    short: 'Jutland',
    title: 'A dairy rotation',
    text: 'Dairy farms in central Jutland rotate grass and clover for a few years with silage maize, barley and peas. On the map of one year the farms show as patchworks; this field was grass from 2018 to 2021.',
  },
];

export const FIRST_EXAMPLE = EXAMPLES[0];

/** The address of an example: its field at the centre of the map, in its view. */
export const exampleHash = (e) => hashOf([e.lon, e.lat], e.zoom, e.view, [e.lon, e.lat]);
