#!/usr/bin/env bash
# Build nl_years.tif: per 2 m pixel, the last BRP edition (minus 2000) in which a field covered its
# centre; 0 = never. Run on terra, next to the catalog's staging:
#
#   scripts/nl_raster/years_cog.sh /data/cache/fiboa/catalog-staging/nl /data/cache/fiboa/nl-lastyear-2005
#
# Only arable land and grassland count as a field (FIELD_WHERE in stats.py): the catalog also keeps
# fallow (Braakland) and parcels without a category. The grid is fixed, so the LGN2025 COG that the
# page reads as a second band (stats.py landuse) stays on the same grid; it covers every edition.
set -euo pipefail

SRC=${1:?staging directory of nl, with year=<Y>/nl-<Y>.parquet}
OUT=${2:?output directory}
FIRST_YEAR=2005
LAST_YEAR=2026
WHERE="coverage IN ('Bouwland', 'Grasland')"
PIXI="$HOME/.pixi/bin/pixi run --manifest-path $HOME/fiboa/harmonized-field-data-catalog/pyproject.toml"
export GDAL_CACHEMAX=48000
export GDAL_NUM_THREADS=ALL_CPUS

mkdir -p "$OUT"
cd "$OUT"
rm -f work.tif

# Extent of all editions, snapped outward to the 2 m grid.
$PIXI gdal_create -of GTiff -ot Byte -bands 1 -burn 0 -a_nodata 0 -a_srs EPSG:28992 \
  -a_ullr 13652 613650 277838 306850 -outsize 132093 153400 \
  -co TILED=YES -co BLOCKXSIZE=512 -co BLOCKYSIZE=512 -co BIGTIFF=YES -co SPARSE_OK=TRUE \
  work.tif

# Ascending years: a later edition overwrites an earlier one, so each pixel keeps its last year.
for year in $(seq $FIRST_YEAR $LAST_YEAR); do
  echo "$(date -Is) burning $year"
  $PIXI gdal_rasterize -burn $((year - 2000)) -where "$WHERE" "$SRC/year=$year/nl-$year.parquet" work.tif
done

echo "$(date -Is) colour table"
FIRST_YEAR=$FIRST_YEAR LAST_YEAR=$LAST_YEAR $PIXI python - <<'EOF'
import os
import rasterio

first, last = int(os.environ["FIRST_YEAR"]) - 2000, int(os.environ["LAST_YEAR"]) - 2000
# viridis anchors, spread over the first and the last edition; for QGIS and other COG viewers
viridis = [(68, 1, 84), (59, 82, 139), (33, 145, 140), (94, 201, 98), (253, 231, 37)]
anchors = [(first + (last - first) * i / 4, c) for i, c in enumerate(viridis)]
cmap = {0: (0, 0, 0, 0)}
for v in range(1, 256):
    c = min(max(v, first), last)
    for (a, ca), (b, cb) in zip(anchors, anchors[1:]):
        if a <= c <= b:
            t = (c - a) / (b - a)
            cmap[v] = tuple(round(x + (y - x) * t) for x, y in zip(ca, cb)) + (255,)
            break

with rasterio.open("work.tif", "r+") as ds:
    ds.write_colormap(1, cmap)
    ds.set_band_description(1, "last_year")
    ds.update_tags(
        DESCRIPTION=f"Last BRP edition (value + 2000) in which an arable or grassland field covered the pixel; "
        f"0 = never ({first + 2000}-{last + 2000})",
        SOURCE="s3://ftw/harmonized-field-data/nl/year=*/*.parquet",
    )
EOF

echo "$(date -Is) COG"
$PIXI gdal_translate -of COG -co COMPRESS=DEFLATE -co LEVEL=9 -co PREDICTOR=NO \
  -co BLOCKSIZE=512 -co OVERVIEW_RESAMPLING=MODE -co BIGTIFF=IF_SAFER -co NUM_THREADS=ALL_CPUS \
  work.tif nl_years.tif
echo "$(date -Is) finished"
ls -lh nl_years.tif
