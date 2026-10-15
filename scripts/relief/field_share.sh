#!/usr/bin/env bash
# Overview raster for the relief demo: for every Web Mercator cell of zoom 8 (611.5 m), the share of it covered
# by fields of the collections the demo shows (keep COLLECTIONS in step with relief/src/dems.js).
# Byte 0-255 = 0-100 %, 0 is nodata (no field), written as a COG with averaged overviews.
#
# Input: the newest edition of each collection in CRS84, as the catalog's root_tiles.py prepares it
# (<catalog staging>/_root_tiles/<collection>.parquet; Switzerland comes as one file per canton, ch_*.parquet).
#
#   pixi run bash scripts/relief/field_share.sh /data/cache/fiboa/catalog-staging/_root_tiles <scratch> field_share.tif
#
# Fields are burnt at ~50 m into one grid per continent (one shared grid, so the empty cells of one collection
# never overwrite the fields of its neighbour), then averaged onto the zoom 8 grid.
set -euo pipefail

SRC=${1:?directory with <collection>.parquet}
WORK=${2:?scratch directory}
OUT=${3:-field_share.tif}

EUROPE="nl be_vlg fr lu de_nrw de_he de_bb de_mv ch at it_bz es_pv ee"
AMERICA="us_usda_cropland"
# Zoom 8 in Web Mercator: 2 * pi * 6378137 / 256 / 2^8.
CELL=611.4962262814100
CREATE=(-co TILED=YES -co COMPRESS=DEFLATE -co SPARSE_OK=TRUE -co BIGTIFF=YES)

mkdir -p "$WORK"

inputs() {
  for c in $1; do
    if [ "$c" = ch ]; then ls "$SRC"/ch_*.parquet; else ls "$SRC/$c.parquet"; fi
  done
}

# Burn every input into one Byte grid of `res` degrees over `extent`; 255 inside a field, 0 elsewhere.
burn() {
  local grid=$1 res=$2 extent=$3 collections=$4
  rm -f "$grid"
  local first=1
  for f in $(inputs "$collections"); do
    layer=$(basename "$f" .parquet)
    echo "burn $layer"
    if [ $first = 1 ]; then
      gdal_rasterize -q -l "$layer" -burn 255 -ot Byte -init 0 -a_srs EPSG:4326 -te $extent -tr "$res" "$res" \
        "${CREATE[@]}" "$f" "$grid"
      first=0
    else
      gdal_rasterize -q -l "$layer" -burn 255 "$f" "$grid"
    fi
  done
}

burn "$WORK/europe.tif" 0.0005 "-5.5 41 28.5 60" "$EUROPE"
burn "$WORK/america.tif" 0.001 "-128 23 -65 49.5" "$AMERICA"

echo "average onto the zoom 8 grid"
rm -f "$WORK/share.tif"
# gdal_rasterize marks 0 as nodata in a sparse grid, but the zeros must count in the average: -srcnodata None.
# No nodata on the output either (gdalwarp would bump real zeros to 1); the COG gets nodata 0 below.
gdalwarp -q -t_srs EPSG:3857 -tr $CELL $CELL -tap -r average -ot Byte -srcnodata None -dstnodata None \
  -wo INIT_DEST=0 -wo NUM_THREADS=ALL_CPUS -multi "${CREATE[@]}" "$WORK/europe.tif" "$WORK/america.tif" "$WORK/share.tif"

echo "write $OUT"
gdal_translate -q -of COG -a_nodata 0 -co COMPRESS=DEFLATE -co OVERVIEW_RESAMPLING=AVERAGE -co SPARSE_OK=TRUE \
  -co BLOCKSIZE=256 "$WORK/share.tif" "$OUT"
gdalinfo -stats "$OUT" | grep -E "Size is|STATISTICS_(MAXIMUM|MEAN)|Overviews"
