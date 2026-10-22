"""
An overview of all field data by crop, in A5 cells: for the regions demo, and next to the global PMTiles.

Every field of the inputs of the global PMTiles (the catalog's `_root_tiles`, one file per collection, CRS84) is
put in an A5 cell by its centroid, at r7 to r11 directly and at r4 to r6 by the centres of its r7 cell (A5 is not
nested: a point's r7 cell is its r10 cell's parent only 65 % of the time), as FTW's
`ftw-global-data-catalog/pipeline/web_cells.py` does, and on to r13 (~700 m cells at z9): the global PMTiles
thins its fields in dense regions up to z13, so the page shows cells up to zoom 11. Per cell:

  count, area_ha, pct_covered (field area / cell area), ha_<group> per crop group of regions/data/groups.json
  (HCAT prefixes, longest first; fields without an HCAT code are in none: area_ha minus the groups)

Each field counts once: field blocks, the EuroCrops copies of national collections, the Spanish regions (`es`
covers Spain with crops) and `ie` (`ie_lpis` covers Ireland) are left out (SKIP). Fields without
`metrics:area` get one from the geometry.

Writes to /data/cache/fiboa/overview: cells_a5r{R}.parquet (r4..r13, GeoParquet) and
harmonized-field-data-overview.pmtiles, one layer `cells`, resolution R at zoom R - 4. Runs on terra in the
catalog's pixi env (DuckDB with the a5 extension, tippecanoe):

  cd ~/fiboa/harmonized-field-data-catalog
  ~/.pixi/bin/pixi run python ~/demo/scripts/regions/cells.py   # with ~/demo/regions/data/groups.json [--only nl,dk] [--out DIR]

then upload with the local aws profile (terra has none):

  aws s3 cp harmonized-field-data-overview.pmtiles s3://ftw/harmonized-field-data/ \
    --profile source-coop --endpoint-url https://data.source.coop
"""

import argparse
import json
import subprocess
import time
from pathlib import Path

import duckdb

ROOT_TILES = Path("/data/cache/fiboa/catalog-staging/_root_tiles")
OUT = Path("/data/cache/fiboa/overview")
GROUPS = json.loads((Path(__file__).resolve().parents[2] / "regions/data/groups.json").read_text())
COARSEST, FINEST, DIRECT_FROM, ZOFF = 4, 13, 7, 4


def skipped(col):
    """Collections whose fields another collection already holds."""
    if col.endswith("_block") or col == "ie" or col.startswith("es_"):
        return True
    return col.startswith("ec_") and col != "ec_ro"


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def group_case():
    """SQL CASE from the HCAT code (`code`, varchar) to the group id, longest prefix first."""
    pairs = sorted(((p, g["id"]) for g in GROUPS for p in g["prefixes"]), key=lambda x: -len(x[0]))
    whens = " ".join(f"when starts_with(code, '{p}') then '{g}'" for p, g in pairs)
    return f"case {whens} end"


def load_fields(con, only):
    files = sorted(ROOT_TILES.glob("*.parquet"))
    cols = {f: con.sql(f"select distinct collection from '{f}'").fetchall() for f in files}
    use = []
    for f, rows in cols.items():
        names = {r[0] for r in rows}
        keep = {n for n in names if not skipped(n) and (not only or n in only)}
        if keep:
            use.append((f, keep))
    log("collections:", sorted({n for _, k in use for n in k}))
    parts = " union all ".join(
        f"""select collection, cast("hcat:code" as varchar) as code, "metrics:area" as area,
                   ST_GeomFromWKB(ST_AsWKB(geometry)) as geometry
            from '{f}' where collection in ({", ".join(f"'{n}'" for n in sorted(keep))})"""
        for f, keep in use
    )  # the files are lon/lat, some tagged EPSG:4326 and some OGC:CRS84: drop the tag to union them
    # Area from the geometry where the collection has none: square degrees scaled at the field's latitude.
    con.sql(f"""
        create or replace table pts as
        select ST_X(c) as lon, ST_Y(c) as lat, grp,
               coalesce(area, ST_Area(geometry) * 111319.49 * 111319.49 * cos(radians(ST_Y(c)))) as area
        from (
            select ST_Centroid(geometry) as c, area, geometry, {group_case()} as grp
            from ({parts})
        ) where c is not null
    """)
    n, a = con.sql("select count(*), sum(area) / 1e4 from pts").fetchone()
    log(f"{n:,} fields, {a:,.0f} ha")


def sums(source):
    by = ", ".join(f"sum(area) filter (where grp = '{g['id']}') as a_{g['id']}" for g in GROUPS)
    return f"count(*) as n, sum(area) as a, {by}" if source == "pts" else (
        "sum(n) as n, sum(a) as a, " + ", ".join(f"sum(a_{g['id']}) as a_{g['id']}" for g in GROUPS)
    )


def bucket(con, res):
    if res >= DIRECT_FROM:
        con.sql(f"""create or replace table agg{res} as
                    select a5_lonlat_to_cell(lon, lat, {res}) as a5_cell, {sums('pts')} from pts group by 1 having a5_cell is not null""")
    else:
        con.sql(f"""create or replace table agg{res} as
                    select a5_lonlat_to_cell(c[1], c[2], {res}) as a5_cell, {sums('agg')}
                    from (select a5_cell_to_lonlat(a5_cell) as c, * from agg{DIRECT_FROM}) group by 1""")
    log(f"r{res}: {con.sql(f'select count(*) from agg{res}').fetchone()[0]:,} cells")


def write(con, res, out):
    km2 = con.sql(f"select a5_cell_area({res}) / 1e6").fetchone()[0]
    groups = ", ".join(f"cast(round(coalesce(a_{g['id']}, 0) / 1e4) as integer) as ha_{g['id']}" for g in GROUPS)
    path = out / f"cells_a5r{res}.parquet"
    con.sql(f"""copy (
        select a5_u64_to_hex(a5_cell) as a5_cell, cast(n as integer) as count,
               cast(round(a / 1e4) as integer) as area_ha, round(100 * a / 1e6 / {km2}, 1) as pct_covered,
               {groups}, a5_cell_to_geometry(a5_cell) as geometry
        from agg{res} order by a5_cell
    ) to '{path}' (format parquet, compression zstd)""")
    return path


def tile(con, paths, out):
    """One tippecanoe run over all resolutions, each limited to its zoom by a per-feature tippecanoe object."""
    seq = out / "cells.geojsons"
    with seq.open("w") as f:
        for res, path in paths.items():
            z = res - ZOFF
            rows = con.sql(f"select * exclude (a5_cell, geometry), ST_AsGeoJSON(geometry) as g from '{path}'")
            names = [c for c in rows.columns if c != "g"]
            while batch := rows.fetchmany(100_000):
                for r in batch:
                    props = dict(zip(names, r[:-1]))
                    f.write(json.dumps({"type": "Feature", "tippecanoe": {"minzoom": z, "maxzoom": z},
                                        "properties": props, "geometry": json.loads(r[-1])},
                                       separators=(",", ":")) + "\n")
            log(f"r{res} -> z{z}")
    pm = out / "harmonized-field-data-overview.pmtiles"
    subprocess.run(["tippecanoe", "-o", str(pm), "--force", "-q", "-l", "cells", "-Z", "0",
                    "-z", str(FINEST - ZOFF), "-P", "--no-feature-limit", "--no-tile-size-limit",
                    "--no-tiny-polygon-reduction", "--detect-shared-borders", "-n", "Field data by crop",
                    "-N", "Fields of the harmonized field data per A5 cell (r4 at z0 to r13 at z9) and their "
                    "hectares per crop group", str(seq)], check=True)
    seq.unlink()
    log("wrote", pm, f"{pm.stat().st_size / 1e6:.0f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated collections (a smoke test)")
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(a.out / "work.duckdb"))
    con.sql("load spatial; install a5 from community; load a5")
    con.sql(f"set preserve_insertion_order = false; set temp_directory = '{a.out}/duck-tmp'")
    load_fields(con, set(a.only.split(",")) if a.only else None)
    for res in range(FINEST, COARSEST - 1, -1):
        bucket(con, res)
    paths = {res: write(con, res, a.out) for res in range(COARSEST, FINEST + 1)}
    tile(con, paths, a.out)
    (a.out / "groups.json").write_text(json.dumps(GROUPS, indent=1))


if __name__ == "__main__":
    main()
