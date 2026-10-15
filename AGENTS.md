# Working in this repository

Static web demos on the Fields of the World (FTW) harmonized field data, built with Vite (multi-page) and
deployed to GitHub Pages at https://fiboa.org/demo/ (the `fiboa` org's custom domain, so `base` is `/demo/`).

## Layout

- `index.html`: landing page; lists every demo.
- `<demo>/index.html`, `<demo>/src/`: one directory per demo; register it in `vite.config.js`.
- `<demo>/data/`: small precomputed JSON/GeoJSON, committed and bundled. Never commit rasters or parquet;
  demos read those from `https://data.source.coop/ftw/harmonized-field-data/...` with range requests.
- `scripts/<demo>/`: Python that produces `<demo>/data/` (pixi env in `pixi.toml`). Heavy runs happen on
  a machine near the data, not in CI.
- `shared/base.css`: tokens and page frame shared by all demos; `shared/rd.js`: RD New projection, PDOK tile grid,
  BRT basemap and `keepFitted` for the Dutch demos (nl_raster; `relief` reads only the EPSG:28992 definition).
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
  them from zoom 8 as dots that show where fields are, and as clickable outlines from zoom 12.
- A field is cut at every tile edge, and tiles carry a ~76 m buffer. `fields.js` gathers all pieces with the
  same `collection` + `id` from the z14 tiles around the click; `unionMask` rasterises each piece apart and ORs
  them (rasterising the rings together lets the even-odd rule punch out the overlaps). Some collections have
  no `metrics:area` in the tiles; the page then counts the cells inside the mask.
- Heights are read live from each publisher, in the model's own CRS; OpenLayers reprojects the image.
  `dems.js` has one entry per model (`url(bbox, w, h)` for services answering one GeoTIFF, `read()` for COGs)
  and per collection the models to try in order: the first with heights for ≥ 50 % of the field wins (LiDAR HD
  → RGE ALTI in France, Styria and both Tyrol zones in Austria). Several ArcGIS WCS servers wrap 2.0.1 answers
  in multipart, so use 1.0.0 there.
- swissALTI3D: the STAC search takes 3–8 s, so `readSwissAlti3d` sends a HEAD per year for each 1 km tile and
  keeps the newest file found.
- Checked as not usable from a browser (2026-10): Niedersachsen, Bayern, BEV Austria, Poland, Slovenia (no CORS);
  Denmark, Sweden, Portugal (token or login); Wallonia, Slovakia, Croatia, Ireland (rendered images only);
  Czechia, Finland (2 m). A small CORS proxy would open the first two groups.
- `relief.js` holds the pure steps (request grid, masks, 2–98 % stretch, hillshade, colours), tested in
  `tests/relief.test.js`.
- The example buttons are lon/lat points, not field ids; the address keeps the shown field as `#lon,lat`.
