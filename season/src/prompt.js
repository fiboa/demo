export default {
  prompt: `Add a demo season/ to this repository: click any field of the Fields of the World global PMTiles and follow its year, on a page of its own, like the relief demo.

- Vegetation: the NDVI of the field in every clear Sentinel-2 image of the year, as a curve (the median of the field, with a band for the spread), and a true-colour snapshot per month. Read the imagery in the browser from a public STAC catalog of Cloud-Optimized GeoTIFFs. Mask clouds with the scene classification layer and skip images in which the field is not clear.
- Weather: from Open-Meteo, the rain and the growing degree days since the start of the season, each against the 1991–2020 normal, on the same time axis as the NDVI.
- A year menu that starts on the edition year of the field's collection, the year its crop label belongs to. South of the equator the season runs from July to June.
- Plot the points as they come in; a field may take a few seconds.

Before you build, check the imagery sources from the browser's point of view (CORS, tile size, speed) and choose the fastest. Reuse the field selection code of the relief demo. Add pre-rendered examples of contrasting crops: wheat, maize, potatoes, grass, rice.`,
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
