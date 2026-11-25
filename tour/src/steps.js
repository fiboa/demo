/**
 * A tour of the catalog, continent by continent: one card per step, the globe flies to `view` and shows the
 * collections in `show`. Every figure comes from shared/collections.json.
 */
import COLLECTIONS from '../../shared/collections.json' with { type: 'json' };
import { facts, fieldCollections, fieldCount, fields, totals } from '../../shared/story-facts.js';

const t = totals();
const centre = (c) => [(c.bbox[0] + c.bbox[2]) / 2, (c.bbox[1] + c.bbox[3]) / 2];
/** Collections of fields whose extent is centred inside [west, south, east, north]. */
export const within = ([w, s, e, n]) =>
  fieldCollections().filter(([, c]) => {
    const [x, y] = centre(c);
    return x >= w && x <= e && y >= s && y <= n;
  });
const sum = (list) => list.reduce((a, [, c]) => a + (c.fields ?? 0), 0);

const europe = within([-25, 27, 45, 72]);
const spain = fieldCollections().filter(([id]) => id === 'es' || id.startsWith('es_'));
const africa = within([-20, -36, 52, 26]).filter(([id]) => !id.startsWith('es_'));
const open = fieldCollections().filter(([, c]) => c.license !== 'other').length;
const editions = (id) => COLLECTIONS[id].year - COLLECTIONS[id].first + 1;

export const STEPS = [
  {
    id: 'start',
    kicker: 'A tour of the catalog',
    title: `${t.collections} collections, ${fieldCount(t.fields)} fields`,
    html: `<p>The Fields of the World harmonized field data brings field boundaries from governments, universities
      and companies into one format, on one open bucket. Each dot is a collection, as large as its number of fields
      in its newest edition. Scroll to travel around them.</p>
      <div data-legend></div>`,
    view: { center: [12, 25], zoom: 1.9 },
  },
  {
    id: 'europe',
    kicker: 'Europe',
    title: 'Where the subsidies are',
    html: `<p>${europe.length} collections, ${fieldCount(sum(europe))} fields. Almost all come from the paying
      agencies of the EU's Common Agricultural Policy: every farmer who asks for support declares their fields and
      crops each year, and the EU now counts agricultural parcels among the high-value datasets that must be open.</p>
      <p>Countries publish them per state or region, in their own languages and crop codes. The catalog translates
      every crop to one shared list, HCAT.</p>`,
    view: { center: [10, 49], zoom: 3.4 },
  },
  {
    id: 'netherlands',
    kicker: 'Europe · the Netherlands',
    title: 'Every year since 2005',
    html: `<p>The longest series in the catalog: ${editions('nl')} editions of the Dutch parcel register, one for
      every year from ${COLLECTIONS.nl.first} to ${COLLECTIONS.nl.year}. Denmark follows with every year since
      ${COLLECTIONS.dk.first}. With so many years you can follow each field's rotation, or the farmland that
      disappeared under houses and roads.</p>
      ${facts('nl')}`,
    view: { center: [5.15, 52.05], zoom: 11.5, pitch: 30 },
    show: ['nl'],
  },
  {
    id: 'spain',
    kicker: 'Europe · Spain',
    title: 'The largest in Europe',
    html: `<p>${fields('es')} declared crops for the whole country, and next to it ${spain.length - 1} regional
      collections that some regions publish themselves, ${fieldCount(sum(spain))} fields in all. Here the
      fields of La Mancha.</p>
      ${facts('es')}`,
    view: { center: [-3.0, 39.2], zoom: 12.5, pitch: 35 },
    show: ['es'],
  },
  {
    id: 'japan',
    kicker: 'Asia · Japan',
    title: 'The largest of all',
    html: `<p>${fields('jp')} farmland parcels, drawn by hand by Japan's ministry of agriculture: more than one and
      a half times all of Spain. On the island of Kyushu the paddies fill every valley floor.</p>
      ${facts('jp')}`,
    view: { center: [130.6, 33.2], zoom: 12.2, bearing: 20, pitch: 30 },
    show: ['jp'],
  },
  {
    id: 'smallholders',
    kicker: 'Asia · Vietnam and Cambodia',
    title: 'The smallest fields',
    html: `<p>Where farms are a fraction of a hectare, researchers draw the fields themselves, to train models that
      can find them everywhere else. The AI4SmallFarms set holds ${fields('ai4sf_ml')} fields in 62 squares of
      about 5 by 5 km; another set holds ${fields('in_10k_ml')} fields across India.</p>
      ${facts('ai4sf_ml')}`,
    view: { center: [108.523, 11.243], zoom: 14 },
    show: ['ai4sf_ml'],
  },
  {
    id: 'usa',
    kicker: 'North America · the United States',
    title: 'A whole country from satellites',
    html: `<p>The USDA's Crop Sequence Boundaries cover the contiguous United States with ${fields('us_usda_cropland')}
      fields, inferred from years of satellite crop maps. California adds its own crop map, and for the Canadian
      Prairies a university segmented ${fields('ca_prairies')} fields from Sentinel-2. In western Kansas the
      circles of the irrigation pivots stand out among them.</p>
      ${facts('us_usda_cropland')}`,
    view: { center: [-100.85, 37.95], zoom: 12.3 },
    show: ['us_usda_cropland'],
  },
  {
    id: 'brazil',
    kicker: 'South America · Brazil',
    title: 'Mapped by the harvest agency',
    html: `<p>Conab, Brazil's national supply company, maps crop fields to forecast the harvest: ${fields('br_conab')}
      outlines, open for non-commercial use. Further south, annotators of the World Resources Institute drew
      fields in 25 ecoregions where field models did poorly, from the Chaco to the Pampas.</p>
      ${facts('br_conab')}`,
    view: { center: [-41.858, -20.324], zoom: 11.5, pitch: 30 },
    show: ['br_conab'],
  },
  {
    id: 'africa',
    kicker: 'Africa',
    title: 'Samples, not maps',
    html: `<p>${africa.length} collections, ${fieldCount(sum(africa))} fields: no country publishes a register,
      so everything here was drawn for research. The farms here, in western Kenya, were walked with a GPS by
      enumerators, who then harvested and weighed a box of the crop: ${fields('ke_ecaas')} farms with their
      yield.</p>
      ${facts('ke_ecaas')}`,
    view: { center: [35.5, 0.69], zoom: 15.5 },
    show: ['ke_ecaas'],
  },
  {
    id: 'oceania',
    kicker: 'Oceania · New Zealand',
    title: 'Fields by their water',
    html: `<p>Not every collection is about crops. New Zealand's map of irrigated land outlines ${fields('nz')}
      areas under irrigation, for environmental reporting. On the Canterbury Plains the circles of the pivots show
      through.</p>
      ${facts('nz')}`,
    view: { center: [171.9, -43.8], zoom: 11.2, pitch: 30 },
    show: ['nz'],
  },
  {
    id: 'end',
    kicker: 'Use it',
    title: 'One format, one bucket',
    html: `<p>Every collection is GeoParquet in the fiboa format, with a STAC catalog that says where it comes from,
      how its outlines were made and under which licence: ${open} of the ${t.collections} under a standard open
      licence, the rest under their publisher's own terms. Query them with DuckDB straight from the bucket, or look
      at them in the browser.</p>
      <p><a href="https://source.coop/ftw/harmonized-field-data">The data on Source Cooperative</a> ·
      <a href="../outlines/">How a field gets its outline</a></p>
      <p class="story-credit">Story form inspired by
      <a href="https://narrative.allen.ai/olmoearth-embeddings">Ai2</a>.</p>`,
    view: { center: [12, 25], zoom: 1.9 },
  },
];
