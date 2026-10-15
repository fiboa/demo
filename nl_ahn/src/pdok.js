/** The two PDOK services this demo reads: BRP parcels (OGC API Features) and AHN4 heights (WCS). */
import { fromArrayBuffer } from 'geotiff';

const BRP_ITEMS = 'https://api.pdok.nl/rvo/gewaspercelen/ogc/v1/collections/brpgewas/items';
export const BRP_WMS_URL = 'https://service.pdok.nl/rvo/brpgewaspercelen/wms/v1_0';
const AHN_WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0';
const RD_CRS = 'http://www.opengis.net/def/crs/EPSG/0/28992';

/** AHN marks cells without a measurement with the largest float32. */
const AHN_NODATA_ABOVE = 1e30;

/**
 * BRP parcels whose box touches a 1 m box around the RD point [x, y], as GeoJSON features in RD
 * (properties: category, gewas, gewascode, jaar, status). Usually one; neighbours can touch the box.
 */
export async function parcelsAt([x, y], signal) {
  const params = new URLSearchParams({
    f: 'json',
    bbox: [x - 0.5, y - 0.5, x + 0.5, y + 0.5].join(','),
    'bbox-crs': RD_CRS,
    crs: RD_CRS,
    limit: '10',
  });
  const response = await fetch(`${BRP_ITEMS}?${params}`, { signal });
  if (!response.ok) throw new Error(`BRP ${response.status}`);
  return (await response.json()).features;
}

/**
 * AHN4 heights (m NAP) over the RD bbox in a `width` × `height` grid, from coverage 'dtm_05m' (ground)
 * or 'dsm_05m' (surface, with crops, trees and buildings). Cells without a measurement are NaN.
 * Returns { values: Float32Array, width, height, bbox } with the grid as the server returned it.
 */
export async function heights(coverage, bbox, width, height, signal) {
  const params = new URLSearchParams({
    service: 'WCS',
    version: '2.0.1',
    request: 'GetCoverage',
    coverageId: coverage,
    format: 'image/tiff',
  });
  // `subset` appears once per axis; written out as the WCS 2.0 examples do.
  const query = `${params}&subset=x(${bbox[0]},${bbox[2]})&subset=y(${bbox[1]},${bbox[3]})` +
    `&scalesize=x(${width}),y(${height})`;
  const response = await fetch(`${AHN_WCS}?${query}`, { signal });
  if (!response.ok) throw new Error(`AHN ${response.status}`);
  const tiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  const [raster] = await image.readRasters({ samples: [0], signal });
  const values = Float32Array.from(raster, (v) => (v > AHN_NODATA_ABOVE ? NaN : v));
  return { values, width: image.getWidth(), height: image.getHeight(), bbox: image.getBoundingBox() };
}
