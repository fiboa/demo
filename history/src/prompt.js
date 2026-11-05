export default {
  prompt: `Add a demo history/ to this repository: today's fields of the Fields of the World global PMTiles over old maps, with a vertical line you can drag. Left of the line an old map, right of it a recent aerial photo, and the field outlines over both.

- A menu of the old maps that cover the place you are looking at: for example the Dutch Topotijdreis (1815–2016), Ferraris and Vandermaelen in Flanders, Cassini, the État-Major maps and the 1950s aerial photos of IGN in France, swisstopo's Journey through time, the Prussian surveys of North Rhine-Westphalia. Add a year slider where a map has many editions.
- Today: the national aerial photo where there is one, a global imagery layer elsewhere.
- Start in the Noordoostpolder on the map of 1930, when it was still sea.
- The line must work with a mouse, a finger and the keyboard.
- Add five or six pre-rendered examples as split pictures, old on the left and today on the right: polders, heath turned into farmland, strips merged into blocks.

Use only tile services that a browser can read without a key, and check each one before you use it.`,
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
