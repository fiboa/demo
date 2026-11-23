export default {
  prompt: `Make a dashboard about Dutch farmland that disappeared, from https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif: a 2 m raster in which every pixel holds the last year it was a field in the Dutch parcel register, minus 2000 (0: never). Show how much land was lost per year and where, with a map that reads the file directly.`,
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
    {
      you: 'The catalog now also holds the editions 2005-2008. Extend the demo so it uses 2005-2026.',
      claude: 'Rebuilt the raster from all 22 editions on the same grid, counting only arable land and grassland as before. Found that the 2005-2008 files are drawn wider, so 75,000 ha would show as lost in 2008, and asked how to handle it.',
    },
    {
      you: 'Show 2005-2026 on the map, but count from 2009.',
      claude: 'Kept the figures from 2009, let the map and slider start in 2005, explained why on the page, and rechecked every claim against the new statistics.',
    },
  ],
  tips: [
    'Give the exact address of the data and say what a pixel value means. The agent cannot guess that.',
    'Push back when a proposal does not fit ("I want to use the COG directly"). The agent explains the trade-off and changes course.',
    'Ask for numbers that add up and tests that check it, so the page can be regenerated without fear.',
  ],
};
