export default {
  prompt: `Make a map of the Fields of the World harmonized field data (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles) where a click on a field shows its relief: the elevation under that one field, coloured from its lowest to its highest point. Use only open elevation models of 1 m or finer that a browser can read directly, and add examples such as old creek beds and terraces.`,
  conversation: [
    {
      you: 'What other demos would be interesting? One idea: find public elevation models like the Dutch AHN, and when you click a field, show a contrast-stretched height map inside it. Or an NDVI chart, or statistics per dataset. Think along.',
      claude: 'Weighed the three ideas, and recommended the height map: it is quick to build and immediately striking.',
    },
    {
      you: 'Do the elevation demo, for the Netherlands first.',
      claude: 'Built it with the Dutch AHN, 50 cm, read live from the national geo service.',
    },
    {
      you: 'Great. Can we extend it with more elevation models? Only 1 m or sharper is relevant. Make a list, match it with our collections, and use the global PMTiles with a filter on the collections that have a model.',
      claude: 'Tested about thirty sources from the command line with a browser origin header; twenty work from a browser.',
    },
    {
      you: 'Replace the Dutch-only page: these demos should show our own field data.',
      claude: 'Rebuilt it as one page on the global PMTiles, and removed the old one.',
    },
    {
      you: 'Why do the fields disappear when I zoom out?',
      claude: 'Explained that the archive thins its low zoom levels to keep tiles small, and proposed an overview raster of where fields are.',
    },
    {
      you: 'Yes, make the overview raster. The proxy options for the blocked sources are too complicated: we do not run a server for fiboa.org. What is sensible?',
      claude: 'Built the overview on a server near the data, and proposed asking the publishers to allow browser access instead.',
    },
    {
      you: 'Add a section under the map with the examples, each with a picture and its text, and pre-render the pictures. In the panel, show a short selection with the country flag, like "🇩🇪 Barley".',
    },
    {
      you: 'Draft the e-mails to the publishers whose servers block browsers; I will send them.',
      claude: 'Drafted them. When Lower Saxony enabled access weeks later, it tested their bucket and added the state.',
    },
    {
      you: 'The Austrian BEV has fixed its CORS headers. Can we add their height model?',
      claude: 'Tested the national 1 m files from the browser, found the 55 tiles that exist, and added them after Styria and Tyrol, with an example from the Marchfeld.',
    },
  ],
  tips: [
    'Ask the agent to "think along" before choosing: you get options with their trade-offs.',
    'Start with one country, and generalise once it works.',
    'State the constraint (no server of our own); it decides which sources qualify.',
  ],
};
