export default {
  prompt: `Make a scrolling story on a globe that tours the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/catalog.json) continent by continent: who publishes field boundaries where, how many and why. Fly to a telling place per stop, show that collection's fields from its own PMTiles, and take every figure from the catalog.`,
  conversation: [
    {
      you: 'I love the OlmoEarth embeddings explainer: a globe that zooms in to a place as you scroll and tells a story. Can we tell a story like that about the source datasets of the harmonized field boundaries?',
      claude: 'Proposed three angles: how fields get drawn, a tour of the catalog, or what the fields reveal.',
    },
    {
      you: 'Can you make two stories, the first and the second? On the MapLibre globe.',
      claude: 'Built this tour next to the story about how outlines are made, on one shared story engine, and took every figure from the catalog\'s STAC collections so the cards stay right when collections are added.',
    },
  ],
  tips: [
    'A story needs few words per stop: ask for one place and one point per card.',
    'Ask for the figures to come from the data, so the story stays right when the catalog grows.',
  ],
};
