"""
What grew on each field of the newest edition, every year back: for the rotation demo.

For every field of the newest edition of a collection, a point on its surface is looked up in every older
edition (transformed into that edition's CRS); the field it falls in gives that year's crop (HCAT code). Where
it falls in several, catch crops (Dutch "vanggewas", "groenbemesting") give way to the main crop, then the
smallest field wins. The result is written as FlatGeobuf in EPSG:4326 with the newest geometry and:

  collection, id, crop (newest crop name), y0 (first year), crops (HCAT codes y0..newest, comma-separated,
  empty where no field or no code)

plus `<col>-match.json` with per-year match rates and `hcat-names.json` (code -> HCAT name) for the page.
Runs on terra next to the catalog staging copy:

  pixi run python scripts/rotation/build.py [collection ...]     # default: nl be_vlg dk

then, in /data/cache/fiboa/rotation (~10 min, ~720 MB), and upload with the local aws profile (terra has none):

  tippecanoe -o rotation.pmtiles --force -Z9 -z14 -L fields:be_vlg.fgb -L fields:nl.fgb -L fields:dk.fgb \
    --drop-densest-as-needed --extend-zooms-if-still-dropping --read-parallel \
    -y collection -y id -y crop -y y0 -y crops
  aws s3 cp rotation.pmtiles s3://ftw/harmonized-field-data/_demo/rotation/rotation.pmtiles \
    --profile source-coop --endpoint-url https://data.source.coop
"""

import glob
import json
import re
import sys
import time
from pathlib import Path

import duckdb

STAGING = Path("/data/cache/fiboa/catalog-staging")
OUT = Path("/data/cache/fiboa/rotation")
CATCH = "vanggewas|groenbemest"


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def crs_of(con, path):
    """The EPSG code of a GeoParquet's geometry column, from its type: GEOMETRY('EPSG:28992')."""
    for name, kind, *_ in con.sql(f"describe select geometry from '{path}'").fetchall():
        m = re.search(r"EPSG:(\d+)", kind)
        if m:
            return f"EPSG:{m.group(1)}"
    raise ValueError(f"no CRS in {path}")


def has_crops(con, path):
    return "hcat:code" in [r[0] for r in con.sql(f"describe select * from '{path}'").fetchall()]


def build(con, col):
    files = {int(re.search(r"year=(\d{4})", f).group(1)): f for f in glob.glob(f"{STAGING}/{col}/year=*/{col}-*.parquet")}
    years = sorted(y for y, f in files.items() if has_crops(con, f))
    newest = years[-1]
    crs_new = crs_of(con, files[newest])
    log(col, "years", years[0], "-", newest, crs_new)

    con.sql(f"""
        create or replace table cur as
        select id, "crop:name" as crop, geometry, ST_PointOnSurface(geometry) as pt
        from '{files[newest]}'
        where not regexp_matches(coalesce("crop:name", ''), '{CATCH}', 'i')
    """)
    total = con.sql("select count(*) from cur").fetchone()[0]
    log(col, total, "fields in", newest)

    con.sql("create or replace table hits (id varchar, year int, code uinteger)")
    rates = {}
    for y in years:
        crs = crs_of(con, files[y])
        pt = "pt" if crs == crs_new else f"ST_Transform(pt, '{crs_new}', '{crs}', always_xy := true)"
        con.sql(f"""
            insert into hits
            select id, {y}, code from (
                select c.id, f."hcat:code" as code,
                       row_number() over (
                           partition by c.id
                           order by regexp_matches(coalesce(f."crop:name", ''), '{CATCH}', 'i'), f."metrics:area"
                       ) as rank
                from (select id, {pt} as p from cur) c
                join (select geometry, "hcat:code", "crop:name", "metrics:area" from '{files[y]}') f
                  on ST_Contains(f.geometry, c.p)
            ) where rank = 1
        """)
        n, coded = con.sql(f"select count(*), count(code) from hits where year = {y}").fetchone()
        rates[y] = {"field": round(n / total, 4), "crop": round(coded / total, 4)}
        log(col, y, rates[y])

    span = list(range(years[0], newest + 1))
    con.sql(f"""
        create or replace table out as
        select '{col}' as collection, c.id, c.crop, {years[0]} as y0,
               array_to_string(list_transform({span}, y -> coalesce(cast(m[y] as varchar), '')), ',') as crops,
               ST_Transform(c.geometry, '{crs_new}', 'EPSG:4326', always_xy := true) as geometry
        from cur c
        left join (select id, map(list(year), list(code)) as m from hits group by id) h using (id)
    """)
    path = OUT / f"{col}.fgb"
    path.unlink(missing_ok=True)
    con.sql(f"copy out to '{path}' (format gdal, driver 'FlatGeobuf', srs 'EPSG:4326')")
    (OUT / f"{col}-match.json").write_text(json.dumps({"years": [years[0], newest], "fields": total, "rates": rates}, indent=1))
    log(col, "wrote", path)


def main():
    cols = sys.argv[1:] or ["nl", "be_vlg", "dk"]
    OUT.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(OUT / "work.duckdb"))
    con.sql("install spatial; load spatial")
    con.sql("set preserve_insertion_order = false")
    for col in cols:
        build(con, col)
    # HCAT names of every code in the inputs, for the page's panel.
    names = {}
    for col in cols:
        for f in glob.glob(f"{STAGING}/{col}/year=*/{col}-*.parquet"):
            if has_crops(con, f):
                for code, name in con.sql(f'select distinct "hcat:code", "hcat:name" from \'{f}\' where "hcat:code" is not null').fetchall():
                    names[str(code)] = name
    (OUT / "hcat-names.json").write_text(json.dumps(dict(sorted(names.items())), indent=0))
    log("done", len(names), "HCAT codes")


if __name__ == "__main__":
    main()
