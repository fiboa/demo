export default {
  prompt: `Make a page that shows the fields of the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles) over old maps, with a line you can drag between the old map and a recent aerial photo. Offer the historical maps that cover the place you look at, and add examples such as polders and strips merged into blocks.`,
  conversation: [
    {
      you: 'Start with the historical maps with a swipe line.',
      claude: 'Asked three questions: a swipe line or a fading slider, an aerial photo or a light map for today, and where to start.',
    },
    { you: 'A swipe line, with an aerial photo for today.' },
    {
      you: 'Agreed, start in the Noordoostpolder on the map of 1930.',
      claude: 'Collected the old map services of five regions, checked each one in the browser, and picked six examples by eye.',
    },
    { you: 'OK, commit and push.' },
  ],
  tips: [
    'Let the agent ask its questions. Short answers to good questions are enough.',
    'Name a concrete starting view; it gives the page a story from the first second.',
  ],
};
