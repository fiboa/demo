export default {
  prompt: `Create a GitHub repository fiboa/demo for small web demos on the Fields of the World harmonized field data, clone it locally and publish it with GitHub Pages at https://fiboa.org/demo/: a Vite multi-page site, one directory per demo, and a GitHub Action that tests, builds and deploys every push to main.

The first demo, nl_raster, is a dashboard in English about Dutch farmland that disappeared. Its data is a Cloud-Optimized GeoTIFF: https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif. It is a 2 m Byte raster in EPSG:28992; a pixel holds the last year it was a field in the Dutch parcel register (BRP) minus 2000, and 0 means it never was.

The dashboard needs:
- a short explanation of the data;
- key figures: how much land disappeared per year, and in total since 2009;
- a map that reads the COG directly, coloured by last year, with a year slider, that you can zoom into;
- a few small maps of the clearest clusters of lost farmland;
- whatever else belongs on such a dashboard: propose it first.

Precompute the statistics in Python on the raster's own 2 m grid, so every breakdown adds up to the national total, and commit them as small JSON files with tests that check the sums. Before you build, ask me about the choices that matter, one at a time.`,
  conversation: [
    {
      you: 'Our catalog holds many years of Dutch crop fields. Build a raster that shows, per pixel, the last year a field was there: one byte (0 = no data, 9 = 2009, 26 = 2026), 2 × 2 m, as a Cloud-Optimized GeoTIFF.',
      claude: 'Rasterised every edition of the register onto one grid and uploaded the file next to the catalog, with a README that explains the values.',
    },
    {
      you: 'Create a repository fiboa/demo for several web demos on our field data, with nl_raster as the first: a dashboard with an explanation, statistics on how much land disappeared, a map you can zoom into and a few maps of clusters of lost farmland. Publish it with GitHub Pages.',
      claude: 'Proposed MapLibre for the map and asked which extra sections to add.',
    },
    {
      you: 'I want to use the COG directly. Can MapLibre do that?',
      claude: 'Explained that MapLibre only reads COGs in Web Mercator, while this one is in the Dutch grid, and proposed OpenLayers, which reprojects on the fly.',
    },
    {
      you: 'Then OpenLayers. Of the extras: loss per municipality, the last crop on the lost land, and a year slider.',
      claude: 'Computed the statistics on a server next to the data, built the page and checked it in a browser.',
    },
    {
      you: 'When I zoom, the map first shows very coarse tiles. Can that be smoother? And I would like to see what the lost land became: houses, roads, nature. Can we overlay the national land-use map LGN2025?',
      claude: 'Kept the coarser zoom level loaded as a fallback, and turned LGN2025 into a second raster on the same grid, with a new section "What the land became".',
    },
    {
      you: 'Show the LGN land use only where farming stopped: use our raster as a mask.',
    },
    {
      you: 'When I click a lost field, show which land-use classes lie on it now. And add a toggle to hide the land that is still farmed, so you see exactly what disappeared.',
    },
    { you: 'Looks good. Commit and push.' },
  ],
  tips: [
    'Give the exact address of the data and say what a pixel value means. The agent cannot guess that.',
    'Push back when a proposal does not fit ("I want to use the COG directly"). The agent explains the trade-off and changes course.',
    'Ask for numbers that add up and tests that check it, so the page can be regenerated without fear.',
  ],
};
