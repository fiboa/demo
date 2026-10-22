"""
Facts for the example texts of the regions demo, from the overview cells: per example, within its box (cells
whose centre falls in it), the number of fields, their hectares, and the hectares and share of each of its
groups (of the field area and of the land). Writes regions/data/examples.json; tests/regions.test.js checks the
numbers in the card texts against it.

  uv run --with duckdb python scripts/regions/examples.py .local/cells_a5r9.parquet

The boxes are [west, south, east, north] in BOXES; the example ids those of regions/src/examples.js.
"""

import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
GROUPS = [g["id"] for g in json.loads((ROOT / "regions/data/groups.json").read_text())]

BOXES = {
    "cornbelt": ([-97.5, 38.5, -83.0, 45.5], ["maize", "soy"]),
    "napa": ([-122.55, 38.2, -122.2, 38.65], ["vines"]),
    "bordeaux": ([-1.2, 44.5, 0.3, 45.4], ["vines"]),
    "jaen": ([-4.5, 37.5, -2.8, 38.3], ["olives"]),
    "centralvalley": ([-121.6, 35.3, -118.9, 39.8], ["nuts"]),
    "bulbs": ([4.6, 52.7, 5.05, 53.0], ["flowers"]),
    "ireland": ([-10.7, 51.3, -5.9, 55.5], ["grassland"]),
    "texas": ([-102.5, 32.5, -101.0, 34.5], ["cotton"]),
    "palouse": ([-118.0, 46.3, -116.8, 47.3], ["wheat", "pulses"]),
    "sacramento": ([-122.3, 38.8, -121.4, 39.8], ["rice"]),
}


def main(path):
    con = duckdb.connect()
    con.sql("install spatial; load spatial")
    out = {}
    for id, ((w, s, e, n), groups) in BOXES.items():
        sums = ", ".join(f"sum(ha_{g}) as ha_{g}" for g in GROUPS)
        row = con.sql(f"""
            select count(*) as cells, sum(count) as fields, sum(area_ha) as area_ha,
                   sum(area_ha / pct_covered * 100) as land_ha, {sums}
            from (select *, ST_Centroid(geometry) as c from '{path}')
            where ST_X(c) between {w} and {e} and ST_Y(c) between {s} and {n} and pct_covered > 0
        """).fetchall()[0]
        names = ["cells", "fields", "area_ha", "land_ha", *[f"ha_{g}" for g in GROUPS]]
        r = dict(zip(names, row))
        ranked = sorted(GROUPS, key=lambda g: -(r[f"ha_{g}"] or 0))
        out[id] = {
            "box": [w, s, e, n],
            "fields": int(r["fields"]),
            "area_ha": int(r["area_ha"]),
            "groups": {g: {"ha": int(r[f"ha_{g}"]), "of_fields": round(r[f"ha_{g}"] / r["area_ha"], 3),
                           "rank": ranked.index(g) + 1} for g in groups},
            "top": [[g, int(r[f"ha_{g}"])] for g in ranked[:5]],
        }
        print(id, json.dumps(out[id]))
    (ROOT / "regions/data/examples.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
