/**
 * Example fields: a lon/lat point inside each (not a field id, which changes between editions), the year of the
 * embeddings, the country for its flag, a one-word label for the map panel (`panel`: shown there) and the
 * title and text of its card. The pictures and the counts under them are pre-rendered by
 * scripts/similar/examples.mjs into similar/examples/<id>.png and similar/data/examples.json; rerun it after
 * changing this list, and write the text from what it measured.
 */
export const EXAMPLES = [
  {
    id: 'iowa',
    lon: -93.58793,
    lat: 42.065,
    year: 2024,
    country: 'us',
    short: 'Soybeans',
    panel: true,
    title: 'Soybeans in Iowa',
    text: 'Central Iowa grows maize and soybeans, in big square fields. The five soybean fields around this one are also the five most alike; the maize fields come after them, far behind.',
  },
  {
    id: 'jaen',
    lon: -3.78,
    lat: 37.85,
    year: 2025,
    country: 'es',
    short: 'Olives',
    panel: true,
    title: 'Olives in Jaén',
    text: 'Three in four fields around Jaén are olive groves, yet the twenty fields most alike to this grove are all olives too: rows of trees on bare soil look the same all year.',
  },
  {
    id: 'champagne',
    lon: 4.2149,
    lat: 49.0038,
    year: 2024,
    country: 'fr',
    short: 'Beet',
    panel: true,
    title: 'Sugar beet in Champagne',
    text: 'Only one field in nine around this one grows beet, but half of the twenty most alike do, and the other half is maize: both stay green into the autumn, long after the wheat and barley are cut.',
  },
  {
    id: 'bulbs',
    lon: 4.55,
    lat: 52.29,
    year: 2025,
    country: 'nl',
    short: 'Tulips',
    panel: true,
    title: 'Tulips in the bulb region',
    text: 'Behind the dunes south of Haarlem, tulip fields flower in April and are bare by June. Half of the twenty fields most alike are tulips and three more are dahlias, also grown for their tubers, though the crops are of 2026 and the embeddings of 2025: bulbs move to new land every year.',
  },
  {
    id: 'krakow',
    lon: 19.95,
    lat: 50.15,
    year: 2025,
    country: 'pl',
    short: 'Maize',
    panel: true,
    title: 'Maize north of Kraków',
    text: 'In a patchwork of narrow strips, maize still stands out: thirteen of the twenty fields most alike grow maize, against one in five of all fields around it. Most of the others are wheat.',
  },
  {
    id: 'grass',
    lon: 21.45,
    lat: 50.35,
    year: 2025,
    country: 'pl',
    short: 'Grass',
    title: 'Where names differ: grass in Poland',
    text: 'A field of grass sown on arable land. Only six of the twenty most alike have the same HCAT crop, and half are permanent grassland. To a satellite, grass is grass: the difference is in the paperwork.',
  },
];
