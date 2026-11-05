export default {
  prompt: `Add a demo flood/ to this repository: click a field of the Fields of the World global PMTiles and see, for a whole year, how much of it stood under water.

- Use Sentinel-1 radar, which sees through the clouds that come with a flood. Calm water reflects little, so a 10 m cell with a low VV backscatter counts as water: start at −18 dB and tune it on real floods. Read the terrain-corrected images (sentinel-1-rtc) from Microsoft Planetary Computer directly in the browser.
- Draw the share of the field under water in every image of the year, with the daily rain from Open-Meteo as bars on the same time axis.
- A click on a point of the curve shows the water around the field, about 2 km, on the map for that image.
- A year menu like the season demo; reuse its Planetary Computer and weather code.

Find a few known floods on fields in the catalog for pre-rendered examples, and say in the page what radar gets wrong: wet bare soil looks like water, flooded crops do not.`,
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
  ],
  tips: [
    'Point to an earlier demo ("like the season demo"): the agent reuses its code and its look.',
    'Ask the agent to say what the method gets wrong. Caveats make a demo trustworthy.',
  ],
};
