export default {
  prompt: `Add a demo rotation/ to this repository: what grew on every field, year after year.

The Dutch, Flemish and Danish registers in the catalog have an edition for almost every year since 2008, as GeoParquet, and field outlines change between years. For every field of the newest edition, take a point inside it, find the field that held that point in every earlier edition (skip catch crops), and keep its HCAT crop code per year. Do this offline with DuckDB on a machine near the data, and turn the result into a PMTiles file. Ask me before you upload it.

The map gets a menu with three views: how varied the rotation is (the number of different crops), how often one crop came back (maize, potatoes, wheat, …), and the crop in a chosen year, with a slider. Group the crops into at most eight colour-blind-safe groups. A click on a field shows its whole series as a row of coloured cells. Add pre-rendered examples of typical rotations.`,
  conversation: [
    {
      you: 'Get going with crop rotation.',
      claude: 'Asked three questions: precompute on a server or read the files in the browser, which countries first, and which views for the map.',
    },
    {
      you: 'Precompute it; start with the Netherlands, Flanders and Denmark; and the three views you proposed.',
      claude: 'Matched 2.4 million fields across all editions and showed how many matched per year.',
    },
    { you: 'Yes, upload it, I just logged in.' },
    { you: 'Great. Commit and push.' },
  ],
  tips: [
    'Heavy work belongs near the data; the browser only shows the result.',
    'Ask the agent to stop before anything leaves your machine, such as an upload.',
  ],
};
