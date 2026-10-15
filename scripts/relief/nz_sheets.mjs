/**
 * Index of the LINZ New Zealand 1 m DEM: one cloud-optimised GeoTIFF per NZTopo50 sheet, in EPSG:2193.
 * Writes {"AS21": [minE, minN, maxE, maxN], ...} from each file's own header, so the relief page picks the
 * sheets a field touches without walking the STAC catalog. Uses geotiff.js, as the page does (local GDAL
 * builds often lack the LERC codec these files use).
 *
 *   node scripts/relief/nz_sheets.mjs > relief/data/nz_dem_1m.json
 */
import { fromUrl } from 'geotiff';

const BASE = 'https://nz-elevation.s3.ap-southeast-2.amazonaws.com/new-zealand/new-zealand/dem_1m/2193';

const collection = await (await fetch(`${BASE}/collection.json`)).json();
const sheets = collection.links.filter((l) => l.rel === 'item').map((l) => l.href.slice(2, -5)).sort();
const index = {};
for (let i = 0; i < sheets.length; i += 16) {
  await Promise.all(sheets.slice(i, i + 16).map(async (sheet) => {
    const image = await (await fromUrl(`${BASE}/${sheet}.tiff`)).getImage();
    index[sheet] = image.getBoundingBox().map(Math.round);
  }));
}
process.stdout.write(JSON.stringify(Object.fromEntries(sheets.map((s) => [s, index[s]]))));
