export default {
  prompt: `Make a page where you click a field of the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles) and follow its year: the NDVI from Sentinel-2 as a curve and a picture per month, with rain and warmth from Open-Meteo. Add examples of contrasting crops.`,
  conversation: [
    {
      you: 'What other demos of our field boundaries would be interesting? Combining them with other GIS data often is.',
      claude: 'Proposed five ideas, from the season of a field in satellite images to old maps, floods, the weather and nature rules, and recommended the first.',
    },
    {
      you: 'Start with idea 1, the season from Sentinel-2, and combine it with idea 4, the weather.',
      claude: 'Checked two public Sentinel-2 archives in the browser and chose the one with the smaller tiles.',
    },
    {
      you: 'A year menu, with the edition year as the default?',
      claude: 'Agreed: the crop label of a field belongs to that year.',
    },
    { you: 'A separate page. We want several simple demos that show what you can do with this data.' },
    {
      you: 'Yes, add a few nice examples.',
      claude: 'Searched for fields with contrasting seasons and pre-rendered their curves.',
    },
    { you: 'I have looked at it, nice work. Commit and push.' },
  ],
  tips: [
    'Ask for ideas first. A list with a recommendation is a better start than your first thought.',
    'Combine ideas ("1 with 4"); the agent folds them into one design.',
    'Let the agent measure before it chooses a data source. Speed in the browser decides whether a demo feels good.',
  ],
};
