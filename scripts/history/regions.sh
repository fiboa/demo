#!/usr/bin/env bash
# The outlines of the regions that have old maps in the history demo, from Natural Earth 10m, simplified to
# about 400 m: history/data/regions.json. Needs GDAL (ogr2ogr) and python3.
#
#   scripts/history/regions.sh
set -euo pipefail
out="$(cd "$(dirname "$0")/../.." && pwd)/history/data/regions.json"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
ne=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -sfL -o a0.geojson "$ne/ne_10m_admin_0_countries.geojson"
curl -sfL -o a1.geojson "$ne/ne_10m_admin_1_states_provinces.geojson"

# Countries cut to Europe (France without its overseas parts), the Flemish Region, North Rhine-Westphalia.
ogr2ogr -f GeoJSON c.geojson a0.geojson -dialect sqlite -sql "select lower(ISO_A2_EH) as region,
  ST_Intersection(geometry, BuildMbr(-6, 41, 16, 56)) as geometry from ne_10m_admin_0_countries
  where ISO_A2_EH in ('NL', 'FR', 'CH')"
ogr2ogr -f GeoJSON vlg.geojson a1.geojson -dialect sqlite -sql "select 'be-vlg' as region, ST_Union(geometry)
  as geometry from ne_10m_admin_1_states_provinces where region = 'Flemish'"
ogr2ogr -f GeoJSON nw.geojson a1.geojson -dialect sqlite -sql "select 'de-nw' as region, geometry
  from ne_10m_admin_1_states_provinces where iso_3166_2 = 'DE-NW'"
for f in c vlg nw; do
  ogr2ogr -f GeoJSON "s_$f.geojson" "$f.geojson" -simplify 0.004 -lco COORDINATE_PRECISION=3 -lco RFC7946=YES
done

python3 - "$out" <<'PY'
import json, sys
features = []
for name in ['s_c', 's_vlg', 's_nw']:
    for f in json.load(open(f'{name}.geojson'))['features']:
        g = f['geometry']
        if not g:
            continue
        # Islands of a few vertices only weigh down the file.
        polygons = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        polygons = [p for p in polygons if len(p[0]) >= 12]
        g = {'type': 'MultiPolygon', 'coordinates': polygons} if len(polygons) > 1 else {'type': 'Polygon', 'coordinates': polygons[0]}
        features.append({'type': 'Feature', 'properties': {'region': f['properties']['region']}, 'geometry': g})
with open(sys.argv[1], 'w') as out:
    json.dump({'type': 'FeatureCollection', 'features': features}, out, separators=(',', ':'))
    out.write('\n')
print(sys.argv[1], [f['properties']['region'] for f in features])
PY
