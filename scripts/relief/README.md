# Demo: share of the land in fields, for the relief demo

**This is a demo derived from the catalog, not a catalog collection.** It is not listed in `catalog.json`, has
no STAC metadata and may change or disappear.

`field_share.tif` is the overview that [No field is flat](https://fiboa.org/demo/relief/) shows when zoomed
out, where the catalog's PMTiles only hold a thinned sample of the fields. For every Web Mercator cell of
zoom level 8 (611.5 m) it tells which share of the cell is covered by fields of the collections the demo
covers with an open 1 m height model: `nl be_vlg fr lu de_nrw de_he de_bb de_mv ch at it_bz es_pv ee
us_usda_cropland`, newest edition of each.

| Pixel value | Meaning |
|---|---|
| 0 | nodata: no field of these collections in the cell |
| 1 … 255 | share of the cell covered by fields, 255 = 100 % |

- URL: `https://data.source.coop/ftw/harmonized-field-data/_demo/relief/field_share.tif`
- CRS EPSG:3857, pixel size 611.496 m (zoom 8), Byte, nodata 0
- COG: DEFLATE, 256 × 256 tiles, sparse (empty tiles are not stored), overviews by AVERAGE
- Made by [`scripts/relief/field_share.sh`](https://github.com/fiboa/demo/blob/main/scripts/relief/field_share.sh):
  fields burnt at 0.0005° (Europe) or 0.001° (United States), then averaged onto the zoom 8 grid.
