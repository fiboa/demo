export default {
  prompt: `Add a demo regions/ to this repository: farming regions drawn by their crops. The world map zooms to a region, such as the Corn Belt, Napa Valley, Bordeaux or the olive groves of Jaén, and colours the crops that make it (maize and soybeans for the Corn Belt), the rest faint. Under the map, example cards with a picture and a short text; a click on one flies there and changes the colours.

Large regions need an overview, because the global PMTiles thins its low zoom levels. Build one on the server near the data, the way the FTW global data catalog does (https://github.com/fieldsoftheworld/ftw-global-data-catalog): per A5 cell the number of fields, their area and the hectares per crop group, from a fixed list of crop groups defined by HCAT code prefixes. Publish it as a new PMTiles file next to the existing one, which stays as it is.

Check every number in the example texts against the data in a test. Tell me which regions you expected but could not find in the data, and why.`,
  conversation: [
    {
      you: 'Shall we work out a few more examples? Farming regions by crop: the Corn Belt, Napa Valley, a French wine region. Zoom the world map to the area, colour the relevant crops and leave the rest faint. Under the map a list of examples with a picture and a text; a click zooms there and changes the colours.',
      claude: 'Asked: a new demo, or a mode of the existing map on fiboa.org?',
    },
    {
      you: 'A new demo.',
      claude: 'Explained that the Corn Belt is too large for the field tiles, and asked whether to build an overview.',
    },
    {
      you: 'Yes, and combine it with another job: a global overview in A5 cells, as the FTW global data catalog does. Run it on the server, on the data partition.',
      claude: 'Asked how to group the crops in the overview.',
    },
    { you: 'A fixed list of crop groups.' },
    { you: 'The plan is right. Also add a switch on fiboa.org/map between the current overview and the new one.' },
    {
      you: 'Find out why the Champagne vineyards are missing. And can we do something with Poland? It gets little attention.',
      claude: 'Found that most Champagne plots are not declared for EU aid, so they are not in the register; added Polish orchards and maize.',
    },
    { you: 'Yes, commit and push.' },
  ],
  tips: [
    'Point the agent to prior work ("as the FTW catalog does"); it reads that repository and follows it.',
    'Ask why something is missing. The answer often says more about the data than the map does.',
  ],
};
