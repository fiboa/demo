/**
 * Example fields: a lon/lat point inside each, the year to show, the country for its flag, a short label for
 * the map panel and the title and text of its card; `picture`, the date of the image on the card when it is
 * not the wettest one. The water maps and curves are pre-rendered by
 * scripts/flood/examples.mjs into flood/examples/<id>.png and flood/data/examples.json; rerun it after
 * changing this list.
 */
export const EXAMPLES = [
  {
    id: 'saintomer',
    lon: 2.22809,
    lat: 50.80247,
    year: 2023,
    country: 'fr',
    short: 'Saint-Omer',
    title: 'The marshes of Saint-Omer',
    text: 'Weeks of rain in November 2023 flooded the Aa valley in the Pas-de-Calais. In the marshes around Saint-Omer whole fields stood under water in mid November.',
  },
  {
    id: 'aller',
    lon: 9.17865,
    lat: 52.91066,
    year: 2024,
    country: 'de',
    short: 'Verden',
    title: 'Winter flood on the Weser',
    text: 'Rain from Christmas 2023 on flooded the valleys of the Weser and the Aller around Verden. Into January the radar still finds this field almost entirely under water.',
  },
  {
    id: 'nysa',
    lon: 17.65006,
    lat: 50.73584,
    year: 2024,
    country: 'pl',
    short: 'Lewin Brzeski',
    title: 'Storm Boris on the Nysa',
    text: 'In mid September 2024 storm Boris brought days of rain to Central Europe. The Nysa Kłodzka broke through at Lewin Brzeski; two days later most of this maize field was under water, and in the next images it was dry again.',
  },
  {
    id: 'rice',
    lon: -0.33922,
    lat: 39.28344,
    year: 2025,
    country: 'es',
    short: 'Rice',
    picture: '2025-05-29',
    title: 'Rice, flooded on purpose',
    text: 'The paddies around the Albufera of Valencia are flooded for sowing in May; the radar sees open water until the rice grows over it in June, though wind on the water hides some of it. In October 2025, after some 115 mm of rain in five days, the harvested field stood under water again.',
  },
];

export const FIRST_EXAMPLE = EXAMPLES[0];
