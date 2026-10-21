# Working in this repository

Static web demos on the Fields of the World (FTW) harmonized field data, built with Vite (multi-page) and
deployed to GitHub Pages at https://fiboa.org/demo/ (the `fiboa` org's custom domain, so `base` is `/demo/`).

## Layout

- `index.html`: landing page; lists every demo.
- `<demo>/index.html`, `<demo>/src/`: one directory per demo; register it in `vite.config.js`.
- `<demo>/data/`: small precomputed JSON/GeoJSON, committed and bundled. Small pre-rendered pictures (as
  `relief/examples/`, ~100 KB each, `season/examples/`, ~10 KB, or `history/examples/`, ~80 KB JPEGs) are fine; never commit data rasters or parquet;
  demos read those from `https://data.source.coop/ftw/harmonized-field-data/...` with range requests.
- `scripts/<demo>/`: Python, GDAL or node scripts that produce `<demo>/data/` or a `_demo/` file (pixi env in
  `pixi.toml`). Heavy runs happen on a machine near the data, not in CI. `scripts/png.mjs` writes the
  pre-rendered pictures.
- `shared/base.css`: tokens and page frame shared by all demos; `shared/rd.js`: RD New projection, PDOK tile grid,
  BRT basemap and `keepFitted` for the Dutch demos (nl_raster; `relief` reads only the EPSG:28992 definition).
- For the demos that are a map of the global PMTiles where you click a field (relief, season, history):
  `shared/fields.js` (gather a field from the z14 tiles, `isFields` drops the `_block` collections, `hasCrop`
  prefers a field that names its crop where collections overlap, as Spain and its regions), `shared/mask.js`
  (rasterise its pieces), `shared/map-page.css` (map, floating panel, example cards, about section),
  `shared/collections.json` (title and edition year per collection, `node scripts/collections.mjs`).
- `tests/`: `node --test` suites, run in CI before the build.

## nl_raster

- Reads `_demo/nl/nl_years.tif` (EPSG:28992, Byte, value = last BRP edition − 2000, 0 = never). OpenLayers
  renders it in RD New with the PDOK BRT background; MapLibre cannot, its COG protocol only reads EPSG:3857.
- "Disappeared" = last year ≤ 2025 (not in the 2026 concept edition). Keep `LOST_MAX_YEAR` in
  `scripts/nl_raster/stats.py` and `lost_max_year` in `years.json` the single source of that rule.
- All statistics are counted on the COG's 2 m grid, so they add up; `tests/data.test.js` checks that.
  Claims in the page copy (who loses most, which crop dominates) must match the JSON; recheck them after
  regenerating the data.
- GeoJSON for the page is RFC 7946 without a `crs` member: OpenLayers skips reprojection for crs names it
  does not know. Fit map views with `keepFitted` from `shared/rd.js`, not a one-off `fit`.
- Colours: `nl_raster/src/colors.js` is the only place a year colour is defined; the bar chart reuses it as
  the map legend. The ramp is validated as a one-hue ordinal ramp; re-validate if you change it.
- "What it is now" comes from LGN2025 (CC BY 4.0, Wageningen Environmental Research): `stats.py landuse` writes
  `landuse.json` and `nl_landuse_lgn2025.tif`, a COG on exactly the grid of `nl_years.tif` that the map reads as a
  second band. Upload it next to `nl_years.tif` in `_demo/nl/`. Group ids, names and colours live in
  `LANDUSE_GROUPS` (stats.py) and `LANDUSE_COLORS` (colors.js); change them together.
- A click on lost land (`patch.js`, `lgn.js`) reads the years COG at full resolution with geotiff.js, takes the
  4-connected cells with the same last year, and counts the LGN2025 classes in one PDOK WMS image requested on
  exactly that 2 m grid. That works because the WMS draws the exact colours of `LGN2025.sld`; `LGN_CLASSES` is
  copied from it. Four colours are shared by several classes and are reported as one.
- Regenerate the data on terra:
  `pixi run python scripts/nl_raster/stats.py all --cog nl_years.tif --source '<nl>/year={year}/nl-{year}.parquet' --lgn /opt/ca_reference/data/raster/LGN2025/LGN2025.tif --work <scratch> --out nl_raster/data`

## relief

- Fields come from the catalog's global PMTiles (`harmonized-field-data.pmtiles`, layer `fields`, z3–14), drawn
  with ol-pmtiles, only the collections in `COLLECTIONS` (`relief/src/dems.js`). The archive thins its low
  zooms to keep tiles ≤ ~500 KB (z7 holds 2 % of the fields, z11 22 %, z4 almost none), so the map draws
  them from zoom 9 as dots, and as clickable outlines from zoom 12. Below zoom 9 the map shows
  `_demo/relief/field_share.tif` instead: per zoom 8 cell (611.5 m, EPSG:3857) the share covered by fields of
  `COLLECTIONS`, made on terra by `scripts/relief/field_share.sh` from the catalog's `_root_tiles/*.parquet`
  (~11 min). Rerun and upload it (with `scripts/relief/README.md`) when `COLLECTIONS` changes.
- A field is cut at every tile edge, and tiles carry a ~76 m buffer. `shared/fields.js` gathers all pieces with the
  same `collection` + `id` from the z14 tiles around the click; `unionMask` (`shared/mask.js`) rasterises each piece apart and ORs
  them (rasterising the rings together lets the even-odd rule punch out the overlaps). Some collections have
  no `metrics:area` in the tiles; the page then counts the cells inside the mask.
- Heights are read live from each publisher, in the model's own CRS; OpenLayers reprojects the image.
  `dems.js` has one entry per model (`url(bbox, w, h)` for services answering one GeoTIFF, `read()` for COGs)
  and per collection the models to try in order: the first with heights for ≥ 50 % of the field wins (LiDAR HD
  → RGE ALTI in France, Styria and both Tyrol zones in Austria). Several ArcGIS WCS servers wrap 2.0.1 answers
  in multipart, so use 1.0.0 there.
- swissALTI3D: the STAC search takes 3–8 s, so `readSwissAlti3d` sends a HEAD per year for each 1 km tile and
  keeps the newest file found.
- COGs (`mosaic`): read the full-resolution image and let geotiff.js shrink the window; letting it pick an
  overview fetches every overview header first, one request after the other (LINZ in Sydney: 17 s for a large
  field instead of 5 s). Only windows over `MAX_FULL_RES` pixels go through the overviews.
- New Zealand: one LINZ COG (LERC) per NZTopo50 sheet; `relief/data/nz_dem_1m.json` holds their EPSG:2193
  extents, made by `node scripts/relief/nz_sheets.mjs` (rerun when LINZ adds sheets).
- Japan: GSI `dem1a_png` tiles at z17, heights coded in RGB (`gsiHeight`); a 404 means no 1 m data there.
- Saxony-Anhalt's WCS sends CORS headers to https origins only, so that model fails on the http dev server.
- Checked as not usable from a browser (2026-10): Niedersachsen, Bayern, BEV Austria, Poland, Slovenia (no CORS);
  Denmark, Sweden, Portugal (token or login); Wallonia, Slovakia, Croatia, Ireland (rendered images only);
  Czechia, Finland (2 m). fiboa.org is static (GitHub Pages), so two ways are open (the demo first takes the
  sources that are open and browser-readable as they are):
  - Ask the publisher to send `Access-Control-Allow-Origin: *`; free, often one line of server or bucket
    config, but weeks and uncertain. Asked in October 2026: LGLN Niedersachsen (COGs in an IBM COS bucket,
    OPTIONS 403; `de_nds` is in the catalog) and BEV Austria (national COGs, no ACAO, OPTIONS 401).
  - A Cloudflare Worker as a narrow CORS proxy: forwards only to an allow-list of DEM hosts (never an open proxy),
    keeps tokens (Denmark's free Dataforsyningen token) as Worker secrets, free tier 100k requests/day. Opens
    Niedersachsen, Bayern's open tiles, Poland, Slovenia, BEV Austria and Denmark. Needs someone at fiboa to own
    the Cloudflare account; a `dem.fiboa.org` route only if fiboa.org's DNS moves to Cloudflare, else
    `*.workers.dev`. Sweden would mean sharing one personal Geotorget login through it: ask Lantmäteriet first.
  - Mirroring the models on Source Coop is not worth it: hundreds of GB per country, and it is the slowest link.
- `relief.js` holds the pure steps (request grid, masks, 2–98 % stretch, hillshade, colours), tested in
  `tests/relief.test.js`.
- Examples live in `relief/src/examples.js` (lon/lat point inside the field, not a field id; country; one word
  for the panel, `panel: true` for the six shown there; title and text of the card). `node
  scripts/relief/examples.mjs [id…]` pre-renders them with the page's own code (`read.js`) into
  `relief/examples/<id>.png` (256-colour PNG via ImageMagick, ~100 KB) and the measured facts into
  `relief/data/examples.json`; rerun it after adding or moving an example. Write the card text from what the
  picture shows; say "probably" for causes you cannot check. Flags come from `flag-icons`, imported one by one in
  `gallery.js`: add a country there with its first example. GSI (Japan) cannot render in node.
- The address keeps the shown field as `#lon,lat`; panel and card links set it, the page follows `hashchange`.

## season

- Same map of the global PMTiles as relief, every collection but the `_block` ones. A click reads the field's
  year from Sentinel-2 and the weather, all in the browser.
- Imagery: Microsoft Planetary Computer `sentinel-2-l2a` (STAC search, anonymous SAS token from
  `/api/sas/v1/token/sentinel-2-l2a`, shared and renewed in `s2.js`). Not Earth Search: its 10 m COGs have
  1024 px tiles of ~1.3 MB; PC's are 512 px, ~300–450 KB, and the SCL tiles ~10 KB. PC is not harmonised: from
  processing baseline 04.00 the numbers carry +1000 (`dnOffset`).
- One MGRS tile per field (`chooseTile`). Scenes over 60 % cloud are skipped; the rest are read clearest first,
  six at a time: the SCL window first (cheap), red and near infrared only when ≥ 80 % of the field is clear and
  no measurement lies within 4 days. That keeps a field-year at ~25–45 measurements and ~20–40 MB. A lone low
  point between two high ones within 12 days is flagged a dip (haze, missed cloud) and left out of the line.
- `trueColour` reads the `visual` (TCI) window with 400 m around the field for the map, and an outlined
  close-up for the month strip (`monthlyBest`, `closeUp`).
- Weather: Open-Meteo archive (ERA5), the season and 1991–2020 in two requests; rain and degree days above
  5 °C summed from the start of the season, 29 February dropped so days line up with the normal. South of the
  equator a season runs July to June and is named by its second year.
- The year menu starts at the edition year of the collection, from `shared/collections.json`
  (`node scripts/collections.mjs`, from the published catalog; rerun when a collection gets a new edition). The crop is that year's; other years get a note.
- Charts are hand-drawn SVG on one time axis (`charts.js`), one crosshair through all three; the snapshot strip
  uses the same margins (40 px left, 64 px right).
- Examples in `season/src/examples.js`, in the edition year of their collection; `node
  scripts/season/examples.mjs [id…]` pre-renders the month strip and the curve with the page's own code.
  Write the card text from the measured curve (the script's numbers), not from what the crop usually does.
- The address keeps the field and year as `#lon,lat,year`.

## history

- Today's fields (magenta outlines, from zoom 12; further out the archive is a sample) over an old map left of a
  swipe line and a recent aerial photo right of it. `history/src/swipe.js` clips layers with a canvas path in
  `prerender`/`postrender`: the old map to the left of the line, each national aerial photo to its region.
- Sources live in `history/src/maps.js`: `OLD_MAPS` (per region; `years` for series with a year slider,
  `minZoom` for WMS layers with a MaxScaleDenominator) and `TODAY` (national aerial photos over Esri World
  Imagery). Display only, so no CORS needed; IGN layers need their own style id (`BDORTHOHISTORIQUE` for the
  1980–1995 photos), Flemish WMTS use `GoogleMapsVL` (plain XYZ in EPSG:3857).
- Topotijdreis tiles are in RD New on Esri's own grid (origin −30515500, 31112400; 12 levels from 3251.2065 m),
  reprojected by OpenLayers. `TOPOTIJDREIS_YEARS` is the list of `Historische_tijdreis_<year>` services on
  tiles.arcgis.com; recheck it there when Esri adds editions.
- Regions: Natural Earth 10m outlines simplified to ~400 m in `history/data/regions.json`
  (`scripts/history/regions.sh`). The menu offers the maps of the region at the map centre; moving into another
  region switches maps, a jump (address, example) or a border overlap keeps the map on show.
- Address `#lon,lat,zoom,map[,year]`. Examples in `history/src/examples.js`; `node scripts/history/examples.mjs
  [id…]` renders their split pictures from the same sources (tiles decoded and the JPEG written with `magick`),
  `--at lon,lat,zoom,map[,year] file.jpg` renders any place, handy to scout new examples.
