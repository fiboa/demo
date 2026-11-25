export default {
  prompt: `Make a page where you click a field of the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles) and see how much of it stood under water through the year, from Sentinel-1 radar on Microsoft Planetary Computer, with the daily rain from Open-Meteo. Add examples of known floods, and say what radar gets wrong.`,
  conversation: [
    {
      you: 'Let us do floods.',
      claude: 'Asked: real water seen by radar, or flood hazard maps?',
    },
    {
      you: 'Real water, from radar.',
      claude: 'Asked: one known flood at a time, or a whole year with a year menu?',
    },
    {
      you: 'A year at a time, like the season demo.',
      claude: 'Built it on the season demo\'s code. It dropped one example, the Valencia floods of 2024: the water was gone before the next satellite passed.',
    },
    { you: 'Yes, commit and push.' },
    {
      you: 'Add a few examples from the USA, from well-known storms and floods such as Katrina in New Orleans.',
      claude: 'Explained that Sentinel-1 starts in 2014, so Katrina (2005) is out of reach, and proposed later floods. Found clearly flooded fields at the Missouri levee breaches of 2019 and in Tulare Lake in 2023, but none for Hurricane Ida, and left out a field whose later "water" came from one radar track only.',
    },
  ],
  tips: [
    'Point to an earlier demo ("like the season demo"): the agent reuses its code and its look.',
    'Ask the agent to say what the method gets wrong. Caveats make a demo trustworthy.',
  ],
};
