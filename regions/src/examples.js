/**
 * Example regions: the map's centre and zoom, the crop groups that make the region, the country for its flag, a
 * short label for the map panel and the title and text of its card. Pictures in regions/examples/<id>.jpg are
 * screenshots of the page at the example's address; every share and area in a text is checked in
 * tests/regions.test.js against regions/data/examples.json (scripts/regions/examples.py, the same ids).
 */
import { hashOf } from './view.js';

export const EXAMPLES = [
  {
    id: 'cornbelt',
    center: [-91.5, 41.6],
    zoom: 5.4,
    groups: ['maize', 'soy'],
    country: 'us',
    short: 'Corn Belt',
    title: 'The Corn Belt',
    text: 'From Nebraska to Ohio maize and soybeans take turns on the same fields, often one year each. Between eastern Nebraska and Ohio they grow on 21.5 and 19.9 million hectares: together 89% of the field area in the USDA crop sequence boundaries.',
  },
  {
    id: 'napa',
    center: [-122.36, 38.42],
    zoom: 11.2,
    groups: ['vines'],
    country: 'us',
    short: 'Napa Valley',
    title: 'Napa Valley',
    text: 'In and around the Napa Valley, vineyards cover 74% of the field area, some 17,000 hectares. Zoom in and every block of vines shows, packed along the valley floor between the wooded hills.',
  },
  {
    id: 'bordeaux',
    center: [-0.4, 44.95],
    zoom: 8.6,
    groups: ['vines'],
    country: 'fr',
    short: 'Bordeaux',
    title: 'Bordeaux',
    text: 'Along the Gironde and the Dordogne vines are the largest crop: 88,000 hectares, 29% of the field area, ahead of grassland and maize. Zoom in on the Médoc or Saint-Émilion to see the vineyards field by field.',
  },
  {
    id: 'jaen',
    center: [-3.7, 37.85],
    zoom: 8,
    groups: ['olives'],
    country: 'es',
    short: 'Jaén',
    title: 'A sea of olive trees',
    text: 'Jaén is the largest olive oil producing province in the world. Around it olive groves cover 71% of the field area, 712,000 hectares, over the hills from the Sierra Morena to the Sierra Mágina.',
  },
  {
    id: 'centralvalley',
    center: [-120.4, 37.1],
    zoom: 7.2,
    groups: ['nuts'],
    country: 'us',
    short: 'Central Valley',
    title: 'Almonds of the Central Valley',
    text: 'California\'s Central Valley grows most of the world\'s almonds. Nut orchards, almonds with walnuts and pistachios, are its largest crop from Chico to Bakersfield: 919,000 hectares, 38% of the field area.',
  },
  {
    id: 'bulbs',
    center: [4.85, 52.82],
    zoom: 10.2,
    groups: ['flowers'],
    country: 'nl',
    short: 'Tulip fields',
    title: 'Tulips in the north of Holland',
    text: 'The largest bulb-growing area of the Netherlands is not around Lisse but in the Kop van Noord-Holland, on sandy polder soil. Flowers and bulbs cover 8,400 hectares there, 19% of the field area, almost as much as the grass and clover in rotation.',
  },
  {
    id: 'ireland',
    center: [-8.0, 53.4],
    zoom: 6.6,
    groups: ['grassland'],
    country: 'ie',
    short: 'Ireland',
    title: 'The green island',
    text: 'Ireland\'s fields are nearly all grass for cattle and sheep: permanent grassland makes up 86% of the field area, 4.5 million hectares. From a distance the Republic turns one colour; Northern Ireland is not in the data.',
  },
  {
    id: 'texas',
    center: [-101.8, 33.5],
    zoom: 7.4,
    groups: ['cotton'],
    country: 'us',
    short: 'Texas',
    title: 'Cotton on the High Plains',
    text: 'Around Lubbock the flat High Plains are the largest cotton patch of the United States: cotton covers 68% of the field area, 1.2 million hectares.',
  },
  {
    id: 'palouse',
    center: [-117.35, 46.85],
    zoom: 8.6,
    groups: ['wheat', 'pulses'],
    country: 'us',
    short: 'Palouse',
    title: 'Wheat and lentils of the Palouse',
    text: 'On the rolling loess hills of the Palouse, wheat takes turns with peas, lentils and chickpeas: 343,000 and 94,000 hectares, together 70% of the field area.',
  },
  {
    id: 'sacramento',
    center: [-121.8, 39.25],
    zoom: 9.3,
    groups: ['rice'],
    country: 'us',
    short: 'Sacramento Valley',
    title: 'Rice in California',
    text: 'On the heavy clay of the Sacramento Valley, flooded every spring, rice is the largest crop: 181,000 hectares, 37% of the field area, just ahead of the nut orchards.',
  },
  {
    id: 'grojec',
    center: [20.85, 51.8],
    zoom: 9.3,
    groups: ['fruit'],
    country: 'pl',
    short: 'Grójec',
    title: 'The orchard of Europe',
    text: 'Around Grójec, south of Warsaw, lies one of the largest fruit-growing areas of Europe: apples above all, with cherries, pears and blueberries. Fruit covers 81,000 hectares here, 57% of the field area, in fields of less than a hectare on average.',
  },
  {
    id: 'opole',
    center: [17.1, 50.85],
    zoom: 9.3,
    groups: ['maize'],
    country: 'pl',
    short: 'Silesia',
    title: 'Maize between Wrocław and Opole',
    text: 'On the fertile soils between Wrocław and Opole, in one of the warmest corners of Poland, maize is nearly as large a crop as wheat: 115,000 hectares, 29% of the field area.',
  },
];

export const FIRST_EXAMPLE = EXAMPLES[0];

/** The address of an example. */
export const exampleHash = (e) => hashOf(e.center, e.zoom, e.groups);
