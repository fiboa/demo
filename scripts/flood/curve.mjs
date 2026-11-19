/**
 * The water share of the field at a point through a year, per image with its track, to check a candidate
 * example before adding it: node scripts/flood/curve.mjs <lon> <lat> <year>
 */
import { fromLonLat, transformExtent } from 'ol/proj.js';
import { PMTiles } from 'pmtiles';

import { series } from '../../flood/src/s1.js';
import { FIELDS_PMTILES, fieldAt, inCatalog, preferred } from '../../shared/fields.js';

const [lon, lat, year] = process.argv.slice(2).map(Number);
const field = await fieldAt(new PMTiles(FIELDS_PMTILES), fromLonLat([lon, lat]), inCatalog, undefined, preferred);
if (!field) throw new Error(`no field at ${lon}, ${lat}`);
const bbox = transformExtent(field.extent, 'EPSG:3857', 'EPSG:4326');
const { points } = await series(field, bbox, new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)));
console.log(`${field.collection}/${field.id}`);
console.log(points.filter((p) => p.water > 0.05).map((p) => `${p.scene.date.toISOString().slice(5, 10)} t${p.scene.track} ${Math.round(p.water * 100)}%`).join(', '));
