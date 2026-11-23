export default {
  prompt: `Make a map that shows what grew on every field, year after year, from the Dutch, Flemish and Danish parcel registers in the Fields of the World harmonized field data: how varied each rotation is, and a field's whole series when you click it.`,
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
