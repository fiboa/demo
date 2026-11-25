export default {
  prompt: `Make a scrolling story on a globe about how the field boundaries in the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/catalog.json) were made: declared by farmers, mapped by hand or inferred by a model, as each collection's "boundaries" property says. Fly to one telling place per kind and show that collection's fields from its own PMTiles.`,
  conversation: [
    {
      you: 'I love the OlmoEarth embeddings explainer: a globe that zooms in to a place as you scroll and tells a story. Can we tell a story like that about the source datasets of the harmonized field boundaries?',
      claude: 'Proposed three angles: how fields get drawn, a tour of the catalog, or what the fields reveal.',
    },
    {
      you: 'Can you make two stories, the first and the second? On the MapLibre globe.',
      claude: 'Found that the catalog records for every collection whether its outlines were declared, mapped or inferred, and built this story on that. The global PMTiles lacks the newest collections, so every stop reads the collection\'s own PMTiles; zoomed out, each collection is a bubble sized by its number of fields.',
    },
  ],
  tips: [
    'Point to a page you like ("like the OlmoEarth explainer"): the agent reads it and copies the form, not the content.',
    'Ask for the figures to come from the data, so the story stays right when the catalog grows.',
  ],
};
