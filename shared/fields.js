/**
 * Fields from the global PMTiles of the harmonized field data catalog. The tiles cut every field at their
 * edges, so one field is gathered from the most detailed tiles (z14) around it, piece by piece.
 */
import Feature from 'ol/Feature.js';
import { createEmpty, extend, getIntersection } from 'ol/extent.js';
import MVT from 'ol/format/MVT.js';
import { createXYZ } from 'ol/tilegrid.js';

import COLLECTIONS from './collections.json' with { type: 'json' };

export const FIELDS_PMTILES = 'https://data.source.coop/ftw/harmonized-field-data/harmonized-field-data.pmtiles';
const Z = 14;

/** Collections of field blocks repeat the fields of a country, without crops. */
export const isFields = (collection) => !!collection && !collection.endsWith('_block');
/** Field collections of the published catalog, not the copies the archive also holds (as EuroCrops `ec_fr`). */
export const inCatalog = (collection) => isFields(collection) && !!COLLECTIONS[collection];
/** For `fieldAt`'s `prefer`: where collections overlap (Spain and its regions), the field that names its crop. */
export const hasCrop = (feature) => (feature.get('crop:name') || feature.get('hcat:name_en') ? 1 : 0);
/**
 * For `fieldAt`'s `prefer`: a collection of the published catalog over a copy the archive also holds (as the
 * EuroCrops `ec_fr` over France), then the field that names its crop.
 */
export const preferred = (feature) => (COLLECTIONS[feature.get('collection')] ? 2 : 0) + hasCrop(feature);

const MAX_TILES = 25;
const grid = createXYZ({ maxZoom: Z });
const format = new MVT({ featureClass: Feature });

async function readTile(pmtiles, x, y, signal) {
  const tile = await pmtiles.getZxy(Z, x, y, signal);
  if (!tile) return [];
  return format.readFeatures(tile.data, { extent: grid.getTileCoordExtent([Z, x, y]), featureProjection: 'EPSG:3857' });
}

/** The tiles next to tile [x, y] that the piece with extent `piece` (clipped to the tile) runs into. */
function neighbours(x, y, piece, tileExtent) {
  const eps = 0.01;
  const dx = [piece[0] - tileExtent[0] < eps ? -1 : null, tileExtent[2] - piece[2] < eps ? 1 : null, 0];
  const dy = [tileExtent[3] - piece[3] < eps ? -1 : null, piece[1] - tileExtent[1] < eps ? 1 : null, 0];
  const out = [];
  for (const i of dx) for (const j of dy) if (i !== null && j !== null && (i || j)) out.push([x + i, y + j]);
  return out;
}

/**
 * The field at `coordinate` (EPSG:3857) whose collection passes `accept`, or null; where fields of several
 * collections overlap, the one `prefer(feature)` scores highest (the first by default). Returns
 * { collection, id, properties, pieces: [Polygon|MultiPolygon], extent }: the pieces overlap where the
 * tiles carry a buffer, which does no harm when they are rasterised one by one.
 */
export async function fieldAt(pmtiles, coordinate, accept, signal, prefer = () => 0) {
  const [, x0, y0] = grid.getTileCoordForCoordAndZ(coordinate, Z);
  const candidates = (await readTile(pmtiles, x0, y0, signal)).filter(
    (f) => accept(f.get('collection')) && f.getGeometry().intersectsCoordinate(coordinate),
  );
  if (!candidates.length) return null;
  const first = candidates.reduce((best, f) => (prefer(f) > prefer(best) ? f : best));
  const collection = first.get('collection');
  const id = first.get('id');

  const pieces = [];
  const extent = createEmpty();
  const seen = new Set([`${x0}/${y0}`]);
  let todo = [[x0, y0, [first]]];
  while (todo.length) {
    const next = [];
    for (const [x, y, features] of todo) {
      const tileExtent = grid.getTileCoordExtent([Z, x, y]);
      for (const f of features) {
        if (f.get('collection') !== collection || f.get('id') !== id) continue;
        const piece = getIntersection(f.getGeometry().getExtent(), tileExtent);
        pieces.push(f.getGeometry());
        extend(extent, piece);
        for (const [nx, ny] of neighbours(x, y, piece, tileExtent)) {
          const key = `${nx}/${ny}`;
          if (!seen.has(key) && seen.size < MAX_TILES) {
            seen.add(key);
            next.push([nx, ny]);
          }
        }
      }
    }
    todo = await Promise.all(next.map(async ([x, y]) => [x, y, await readTile(pmtiles, x, y, signal)]));
  }
  const properties = { ...first.getProperties() };
  delete properties.geometry;
  return { collection, id, properties, pieces, extent, complete: seen.size < MAX_TILES };
}

/**
 * The rings of each piece apart, as coordinate arrays mapped through `project`. Pieces overlap, so they must
 * be rasterised one by one: together, the even-odd rule would punch the overlaps out.
 */
export function piecesRings(pieces, project = (c) => c) {
  return pieces.flatMap((geometry) => {
    const polygons = geometry.getType() === 'MultiPolygon' ? geometry.getCoordinates() : [geometry.getCoordinates()];
    return polygons.map((rings) => rings.map((ring) => ring.map(project)));
  });
}
