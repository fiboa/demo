/**
 * The story of how fields get their outlines: one card per step, the globe flies to `view` and shows the
 * collections in `show` (filled) and `outline` (lines only). Every figure comes from shared/collections.json.
 */
import { facts, fieldCount, fields, totals } from '../../shared/story-facts.js';

const t = totals();
const share = (kind) => Math.round((100 * t.kinds[kind].fields) / t.fields);

export const STEPS = [
  {
    id: 'start',
    kicker: 'How a field gets its outline',
    title: `${fieldCount(t.fields)} fields, three ways of drawing them`,
    html: `<p>The Fields of the World harmonized field data gathers ${t.collections} collections of field boundaries
      into one format. Each dot is one collection, as large as its number of fields. They look alike on a map, but
      they were made in three different ways, and that decides what an outline means.</p>
      <div data-legend></div>`,
    view: { center: [12, 30], zoom: 1.9 },
  },
  {
    id: 'declared',
    kicker: 'Declared · the Netherlands',
    title: 'The farmer draws the field',
    html: `<p>In the European Union every farmer who asks for subsidies draws their fields on an aerial photo, each
      year, and names the crop. The paying agency checks the drawings and many countries publish them. In Flevoland,
      reclaimed from the sea in the 1950s, the fields are as straight as the polder.</p>
      <p>Declared outlines are precise and carry a crop, but only cover farmers who apply, and change every year.
      ${share('declared')} % of the fields in the catalog are declared.</p>
      ${facts('nl')}`,
    view: { center: [5.62, 52.55], zoom: 13.2, bearing: -20, pitch: 30 },
    show: ['nl'],
  },
  {
    id: 'blocks',
    kicker: 'Declared · Poland',
    title: 'A field is not a parcel',
    html: `<p>Underneath the declarations lies a reference: the land parcel identification system, made by the
      agency from aerial photos. In Poland the reference parcel is the cadastral parcel, and in the south-east
      inheritance has cut the land into long, narrow strips.</p>
      <p>The filled shapes are the fields farmers declared, the lines the eligible part of each reference parcel.
      Both are in the catalog: ${fields('pl')} declared fields and ${fields('pl_block')} reference parcels.</p>
      ${facts('pl')}`,
    view: { center: [20.3, 50.0], zoom: 14.2, bearing: 15 },
    show: ['pl'],
    outline: ['pl_block'],
  },
  {
    id: 'spain',
    kicker: 'Declared · Spain',
    title: 'Every olive grove, every year',
    html: `<p>Spain publishes each line of the farmers' single applications, mapped onto its land register:
      ${fields('es')} declared crops in the newest edition. In Jaén the olive groves cover the hills almost without
      a break; the declarations still split them into thousands of fields.</p>
      ${facts('es')}`,
    view: { center: [-3.48, 37.96], zoom: 14.5 },
    show: ['es'],
  },
  {
    id: 'mapped',
    kicker: 'Mapped · Japan',
    title: 'Drawn by hand from above',
    html: `<p>Japan's ministry of agriculture draws every farmland parcel by hand on aerial and satellite images,
      without asking the farmer: the Fude polygons. With ${fields('jp')} outlines it is the largest collection in
      the catalog. On the plain of Niigata nearly every one is a rice paddy.</p>
      <p>Mapped outlines cover all farmland, not only that of farmers who apply. They are only as current as the
      image, and the crop is usually missing.</p>
      ${facts('jp')}`,
    view: { center: [139.1, 37.85], zoom: 13.8, bearing: 30, pitch: 35 },
    show: ['jp'],
  },
  {
    id: 'california',
    kicker: 'Mapped · California',
    title: 'A map made for water',
    html: `<p>California's Department of Water Resources maps the crop of every field in the state, to estimate how
      much water agriculture uses. The firm Land IQ draws and classifies the fields from imagery under contract. In
      the San Joaquin Valley the fields fit together like tiles.</p>
      ${facts('us_ca_scm')}`,
    view: { center: [-119.8, 36.6], zoom: 14, pitch: 30 },
    show: ['us_ca_scm'],
  },
  {
    id: 'labels',
    kicker: 'Mapped · Africa',
    title: 'Small samples to teach a model',
    html: `<p>Where no agency draws fields, researchers do it for machine learning. Trained labellers of the
      Mapping Africa project drew every field in small squares of about half a kilometre, on monthly satellite
      mosaics, at sites in 39 countries: ${fields('lacuna')} outlines.</p>
      <p>Such labels are not a map of a country, but they are where the models that map the rest learn what a
      small farm looks like.</p>
      ${facts('lacuna')}`,
    view: { center: [33.588, -12.783], zoom: 15 },
    show: ['lacuna'],
  },
  {
    id: 'inferred',
    kicker: 'Inferred · the United States',
    title: 'Outlines read from the crops',
    html: `<p>The United States publishes no farmer declarations. Its Crop Sequence Boundaries are derived from the
      Cropland Data Layer, a crop map classified from satellite images each year: where the crop sequence changes,
      a boundary is drawn. In Iowa the result follows the square-mile grid of the land survey, mostly maize and
      soybeans.</p>
      <p>Inferred outlines cover a whole country at low cost, but are only as sharp as the pixels they come from.</p>
      ${facts('us_usda_cropland')}`,
    view: { center: [-93.6, 42.0], zoom: 12.4 },
    show: ['us_usda_cropland'],
  },
  {
    id: 'prairies',
    kicker: 'Inferred · the Canadian Prairies',
    title: 'Segmented by a model',
    html: `<p>For Alberta, Saskatchewan and Manitoba no one draws fields at all. The University of Saskatchewan let
      the Segment Anything Model cut seasonal Sentinel-2 images into shapes, without training data, and kept those
      of at least 2 ha that lie on cropland.</p>
      ${facts('ca_prairies')}`,
    view: { center: [-105.5, 51.5], zoom: 12, bearing: -10 },
    show: ['ca_prairies'],
  },
  {
    id: 'compare',
    kicker: 'Declared and inferred · Lower Saxony',
    title: 'Two drawings of the same land',
    html: `<p>In Germany both kinds exist side by side. The filled fields are what farmers in Lower Saxony declared;
      the lines are the fields the Thünen Institute inferred from Sentinel-1, Sentinel-2 and Landsat for all of
      Germany (${fields('de_thuenen')} outlines, 2017–2021).</p>
      <p>Where they agree, a model can stand in for a register. Where they differ, look for hedges, field margins,
      and fields split between two crops.</p>
      ${facts('de_thuenen')}`,
    view: { center: [9.5, 52.6], zoom: 14 },
    show: ['de_nds'],
    outline: ['de_thuenen'],
  },
  {
    id: 'end',
    kicker: 'All together',
    title: 'One format, three kinds of truth',
    html: `<p>${share('declared')} % of the fields in the catalog were declared, ${share('mapped')} % mapped by hand
      and ${share('inferred')} % inferred by a model. The <code>boundaries</code> property of each collection says
      which, so you can choose the outlines that fit your question.</p>
      <div data-legend></div>
      <p><a href="https://source.coop/ftw/harmonized-field-data">The data on Source Cooperative</a> ·
      <a href="../tour/">A tour of the catalog</a></p>
      <p class="story-credit">Story form inspired by
      <a href="https://narrative.allen.ai/olmoearth-embeddings">Ai2</a>.</p>`,
    view: { center: [12, 30], zoom: 1.9 },
  },
];
