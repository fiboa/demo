/**
 * Reading Microsoft Planetary Computer from the browser: its STAC search, the anonymous SAS token of a
 * collection's blob container, and a window of a COG. Shared by the demos that read satellite images.
 */
import { fromUrl } from 'geotiff';
import { register } from 'ol/proj/proj4.js';
import proj4 from 'proj4';

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const TOKEN = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/';

const tokens = new Map(); // collection -> Promise of { token, expires (ms) }

async function fetchToken(collection) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${TOKEN}${collection}`);
    if (response.ok) {
      const json = await response.json();
      return { token: json.token, expires: Date.parse(json['msft:expiry']) };
    }
    if (attempt === 2) throw new Error(`Planetary Computer token: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}

/** The anonymous read token for a collection, shared and renewed a few minutes before it runs out. */
export async function sasToken(collection) {
  const pending = tokens.get(collection);
  const current = pending && (await pending.catch(() => null));
  if (!current || current.expires - Date.now() < 5 * 60000) {
    const next = fetchToken(collection);
    tokens.set(collection, next);
    return (await next).token;
  }
  return current.token;
}

/** POST a STAC search; resolves to its features. */
export async function search(body, signal) {
  const response = await fetch(STAC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Planetary Computer search: ${response.status}`);
  return (await response.json()).features;
}

/** Register the UTM zone of a scene (EPSG:326xx north, 327xx south) with OpenLayers. */
export function utm(epsg) {
  const code = `EPSG:${epsg}`;
  if (!proj4.defs(code)) {
    const zone = epsg % 100;
    proj4.defs(code, `+proj=utm +zone=${zone}${epsg >= 32700 ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`);
    register(proj4);
  }
  return code;
}

/**
 * The cells of `bbox` (in the COG's CRS, a multiple of `cell` metres from its origin) from the full-resolution
 * image of the COG at `href` in `collection`; one array per band, 0 outside the image.
 */
export async function readWindow(href, collection, bbox, cell, signal) {
  const tiff = await fromUrl(`${href}?${await sasToken(collection)}`, {}, signal);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin();
  const window = [
    Math.round((bbox[0] - ox) / cell),
    Math.round((oy - bbox[3]) / cell),
    Math.round((bbox[2] - ox) / cell),
    Math.round((oy - bbox[1]) / cell),
  ];
  return image.readRasters({ window, interleave: false, signal, fillValue: 0 });
}

/** Run `task` over `items` with at most `n` at a time; resolves when all are done. */
export async function pool(items, n, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
