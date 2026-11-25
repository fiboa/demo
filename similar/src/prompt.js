export default {
  prompt: `Make a map of the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles) where a click on a field lights up the fields around it that look alike to a satellite model: average the AlphaEarth Foundations embeddings (https://data.source.coop/tge-labs/aef-mosaic, Zarr) over each field and compare them. Show whether the fields most alike grow the same crop, and add examples where it works and where it does not.`,
  conversation: [
    {
      you: 'I like the deck.gl demo of Development Seed with embeddings. Can we make one on our fields?',
      claude: 'Asked: what should it do with the fields, find fields like the one you click or predict crops? And which stack?',
    },
    {
      you: 'Fields like this one, with deck.gl.',
      claude:
        'Read the AEF mosaic with zarrita (chunks of 64 × 256 × 256), averaged the pixels inside each field and coloured the fields by cosine similarity. Left out the duplicate fields where two collections overlap, as in Spain.',
    },
  ],
  tips: [
    'Point to a demo you like and say what should differ: the agent reads its code and keeps what fits.',
    'Ask for a count that can fail ("do the most alike fields grow the same crop?"); it keeps the demo honest.',
  ],
};
