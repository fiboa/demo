export default {
  prompt: `Add a demo relief/ to this repository. Show the fields of the Fields of the World global PMTiles (https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles, layer "fields") on a map. When I click a field, read the elevation model under that one field and show it as a relief map clipped to the field, with the colours stretched from its lowest to its highest point, and a histogram of its heights.

Only use open elevation models of 1 m or finer that a browser can read directly: the site runs on GitHub Pages, so there is no server of our own. First make a list of candidate models per country or region (https://opendem.info/ is a start), test each one as a browser would (CORS, format, speed) and match them to the collections in the catalog. Show only the collections that have a working model, and tell me which sources fail and why.

When zoomed out, show where the fields with relief are, so the map is never empty. Under the map, add an examples section with interesting fields (old creek beds, terraces, banks of former hedges), each with a pre-rendered picture and a short text.`,
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
  ],
  tips: [
    'Ask the agent to "think along" before choosing: you get options with their trade-offs.',
    'Start with one country, and generalise once it works.',
    'State the constraint (no server of our own); it decides which sources qualify.',
  ],
};
