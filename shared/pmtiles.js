/**
 * A tile loader for ol-pmtiles' PMTilesVectorSource that retries: Source Coop answers a range request now and
 * then with an error (a bare 520), and ol-pmtiles marks such a tile failed for good, leaving a hole in the map.
 */
import TileState from 'ol/TileState.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Give `source` (a PMTilesVectorSource, right after construction) a loader that tries a tile `tries` times. */
export function retryTiles(source, tries = 4) {
  // ol-pmtiles installs `source.tileLoadFunction` once it has read the archive's header; replace it before that.
  source.tileLoadFunction = (tile, url) => {
    const [, z, x, y] = url.match(/pmtiles:\/\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    tile.setLoader(async (extent, resolution, projection) => {
      for (let attempt = 1; ; attempt++) {
        try {
          const result = await source.pmtiles_.getZxy(z, x, y);
          if (!result) {
            tile.setFeatures([]);
            tile.setState(TileState.EMPTY);
            return;
          }
          tile.setFeatures(tile.getFormat().readFeatures(result.data, { extent, featureProjection: projection }));
          tile.setState(TileState.LOADED);
          return;
        } catch (error) {
          if (attempt >= tries) {
            console.warn(`Tile ${z}/${x}/${y} failed ${tries} times`, error);
            tile.setFeatures([]);
            tile.setState(TileState.ERROR);
            return;
          }
          await sleep(500 * attempt);
        }
      }
    });
  };
  return source;
}
