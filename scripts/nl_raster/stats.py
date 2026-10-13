"""Precompute the statistics behind the nl_raster dashboard from nl_years.tif.

Every number is counted on the 2 m grid of the COG, so all totals add up. Run on a machine
close to the data (terra), e.g.:

    pixi run python scripts/nl_raster/stats.py all --cog nl_years.tif \
        --source '/data/.../nl/year={year}/nl-{year}.parquet' --lgn /opt/.../LGN2025.tif \
        --work /data/tmp --out nl_raster/data

The landuse step also writes nl_landuse_lgn2025.tif to --work, for upload next to nl_years.tif.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from contextlib import nullcontext
from datetime import date
from pathlib import Path
from typing import Any

import duckdb
import geopandas as gpd
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.windows import Window
from scipy import ndimage

COG_URL = "https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_years.tif"
FIRST_YEAR, LAST_YEAR = 2009, 2026
# A pixel has "disappeared" when its last edition is before the last one (2026, concept).
LOST_MAX_YEAR = LAST_YEAR - 1
N_VALUES = LAST_YEAR - 2000 + 1  # pixel values 0..26
YEAR_VALUES = range(FIRST_YEAR - 2000, LAST_YEAR - 2000 + 1)
PIXEL_HA = 4 / 10_000
CELL = 64  # cluster cell side in pixels: 128 m
RD = "http://www.opengis.net/def/crs/EPSG/0/28992"
PDOK = "https://api.pdok.nl/cbs/gebiedsindelingen/ogc/v1/collections"
BOUNDARY_YEAR = 2025  # latest year with non-generalised municipality boundaries at PDOK
WORKERS = os.cpu_count() or 4
BLOCK = 512

LANDUSE_COG_URL = "https://data.source.coop/ftw/harmonized-field-data/_demo/nl/nl_landuse_lgn2025.tif"
# LGN2025 classes grouped by what happened to the land; 0 = not in LGN. Class 27 ("other rural land use")
# is where LGN puts building sites; 45 is naturally managed grassland (ANLb).
LANDUSE_GROUPS: dict[int, tuple[str, tuple[int, ...]]] = {
    1: ("Buildings, greenhouses and building sites", (8, 18, 19, 26, 27)),
    2: ("Roads and rail", (251, 252, 253)),
    3: ("Solar parks", (29,)),
    4: ("Forest and nature", (11, 12, 20, 22, *range(30, 44), 45, 321, 322, 323, 331, 332, 333)),
    5: ("Grass and green in and around towns", (23, 28, 46, 47)),
    6: ("Water", (16, 17)),
    7: ("Still farmland according to LGN", (1, 2, 3, 4, 5, 6, 9, 10, 61, 62)),
}
N_GROUPS = len(LANDUSE_GROUPS) + 1


# ---------------------------------------------------------------- pure counting functions


def count_pairs(zones: np.ndarray, years: np.ndarray, n_zones: int) -> np.ndarray:
    """Pixel count per (zone, pixel value), shape (n_zones, N_VALUES)."""
    keys = zones.astype(np.int64).ravel() * N_VALUES + years.ravel()
    return np.bincount(keys, minlength=n_zones * N_VALUES).reshape(n_zones, N_VALUES)


def count_codes(codes: np.ndarray, years: np.ndarray, value: int) -> dict[int, int]:
    """Pixel count per code, only where the year raster equals `value`."""
    found, counts = np.unique(codes[years == value], return_counts=True)
    return dict(zip(found.tolist(), counts.tolist()))


def cell_counts(years: np.ndarray) -> np.ndarray:
    """Count every year value per CELL x CELL block; shape (len(YEAR_VALUES), rows, cols).

    The array is padded with nodata to whole cells, so edge blocks of the COG work too.
    """
    rows, cols = -(-years.shape[0] // CELL), -(-years.shape[1] // CELL)
    padded = np.zeros((rows * CELL, cols * CELL), years.dtype)
    padded[: years.shape[0], : years.shape[1]] = years
    blocks = padded.reshape(rows, CELL, cols, CELL)
    return np.stack([(blocks == v).sum(axis=(1, 3), dtype=np.int32) for v in YEAR_VALUES])


def find_clusters(cells: np.ndarray, threshold: float = 0.5, top: int = 6) -> list[dict[str, Any]]:
    """Largest connected areas of cells where at least `threshold` of the pixels disappeared.

    `cells` is the output of cell_counts; returns cell-index bounding boxes, largest first. Areas whose
    bounding boxes overlap are merged, so no two maps show the same place.
    """
    lost_layers = slice(0, LOST_MAX_YEAR - FIRST_YEAR + 1)
    lost = cells[lost_layers].sum(axis=0)
    labels, n = ndimage.label(lost >= threshold * CELL * CELL, structure=np.ones((3, 3)))
    if n == 0:
        return []
    ids = np.arange(1, n + 1)
    sizes = ndimage.sum_labels(lost, labels, ids)
    clusters = []
    for label in ids[np.argsort(sizes)[::-1][: top * 4]]:
        rows, cols = np.nonzero(labels == label)
        per_year = cells[lost_layers, rows, cols].sum(axis=1)
        clusters.append({
            "rows": (int(rows.min()), int(rows.max()) + 1),
            "cols": (int(cols.min()), int(cols.max()) + 1),
            "cells": len(rows),
            "lost_px": int(per_year.sum()),
            "lost_px_by_year": {FIRST_YEAR + i: int(c) for i, c in enumerate(per_year)},
        })
    return sorted(merge_overlapping(clusters), key=lambda c: c["lost_px"], reverse=True)[:top]


def merge_overlapping(clusters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge clusters whose row and column ranges both overlap, until none do."""
    def overlaps(a: dict, b: dict) -> bool:
        return all(a[k][0] < b[k][1] and b[k][0] < a[k][1] for k in ("rows", "cols"))

    merged = [dict(c) for c in clusters]
    i = 0
    while i < len(merged):
        j = next((j for j in range(i + 1, len(merged)) if overlaps(merged[i], merged[j])), None)
        if j is None:
            i += 1
            continue
        a, b = merged[i], merged.pop(j)
        merged[i] = {
            "rows": (min(a["rows"][0], b["rows"][0]), max(a["rows"][1], b["rows"][1])),
            "cols": (min(a["cols"][0], b["cols"][0]), max(a["cols"][1], b["cols"][1])),
            "cells": a["cells"] + b["cells"],
            "lost_px": a["lost_px"] + b["lost_px"],
            "lost_px_by_year": {y: a["lost_px_by_year"][y] + b["lost_px_by_year"][y] for y in a["lost_px_by_year"]},
        }
        i = 0  # the grown box may now overlap one already checked
    return merged


def group_lookup() -> np.ndarray:
    """Lookup table from every UInt16 LGN value to its LANDUSE_GROUPS id; unknown values and nodata give 0."""
    lut = np.zeros(2**16, np.uint8)
    for group, (_, codes) in LANDUSE_GROUPS.items():
        lut[list(codes)] = group
    return lut


def landuse_block(years: np.ndarray, lgn: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """The LGN group on every pixel that was ever a field, 0 elsewhere."""
    return np.where(years >= FIRST_YEAR - 2000, lut[lgn], 0).astype(np.uint8)


# ---------------------------------------------------------------- raster plumbing


def _windows(path: Path) -> list[Window]:
    with rasterio.open(path) as ds:
        return [w for _, w in ds.block_windows(1)]


def _chunks(items: list, n: int) -> list[list]:
    return [items[i::n] for i in range(n) if items[i::n]]


def _pairs_chunk(cog: Path, zones: Path | None, n_zones: int, windows: list[Window]) -> np.ndarray:
    total = np.zeros((n_zones, N_VALUES), np.int64)
    with rasterio.open(cog) as y, (rasterio.open(zones) if zones else nullcontext()) as z:
        for w in windows:
            years = y.read(1, window=w)
            zone = z.read(1, window=w) if zones else np.zeros_like(years)
            total += count_pairs(zone, years, n_zones)
    return total


def _codes_chunk(cog: Path, codes: Path, value: int, windows: list[Window]) -> dict[int, int]:
    total: dict[int, int] = {}
    with rasterio.open(cog) as y, rasterio.open(codes) as c:
        for w in windows:
            years = y.read(1, window=w)
            if not (years == value).any():
                continue
            for code, n in count_codes(c.read(1, window=w), years, value).items():
                total[code] = total.get(code, 0) + n
    return total


def _cells_chunk(cog: Path, windows: list[Window]) -> list[tuple[int, int, np.ndarray]]:
    with rasterio.open(cog) as y:
        return [(w.row_off // CELL, w.col_off // CELL, cell_counts(y.read(1, window=w))) for w in windows]


def _landuse_stripe(cog: Path, lgn: Path, out: Path, rows: tuple[int, int]) -> np.ndarray:
    """Write the LGN groups for rows [start, stop) of the COG grid to `out`; return counts per (group, year)."""
    lut = group_lookup()
    total = np.zeros((N_GROUPS, N_VALUES), np.int64)
    start, stop = rows
    with rasterio.open(cog) as y, rasterio.open(lgn) as src, WarpedVRT(
        src, crs=y.crs, transform=y.transform, width=y.width, height=y.height, resampling=Resampling.nearest
    ) as vrt:
        stripe = Window(0, start, y.width, stop - start)
        profile = {
            "driver": "GTiff", "dtype": "uint8", "count": 1, "nodata": 0, "crs": y.crs,
            "width": y.width, "height": stop - start, "transform": y.window_transform(stripe),
            "tiled": True, "blockxsize": BLOCK, "blockysize": BLOCK, "compress": "deflate",
        }
        with rasterio.open(out, "w", **profile) as dst:
            for row in range(start, stop, BLOCK):
                for col in range(0, y.width, BLOCK):
                    w = Window(col, row, min(BLOCK, y.width - col), min(BLOCK, stop - row))
                    years = y.read(1, window=w)
                    if not years.any():
                        continue
                    groups = landuse_block(years, vrt.read(1, window=w), lut)
                    dst.write(groups, 1, window=Window(col, row - start, w.width, w.height))
                    total += count_pairs(groups, years, N_GROUPS)
    return total


def _parallel(fn: Callable, cog: Path, *args: Any) -> Iterable:
    chunks = _chunks(_windows(cog), WORKERS * 4)
    with ProcessPoolExecutor(WORKERS) as pool:
        yield from pool.map(fn, *[[a] * len(chunks) for a in (cog, *args)], chunks)


def rasterize(vector: str, attribute: str, out: Path, cog: Path, dtype: str) -> None:
    """Burn `attribute` onto exactly the grid of the COG (pixel-centre rule)."""
    with rasterio.open(cog) as ds:
        b = ds.bounds
        res = ds.res[0]
    subprocess.run(
        ["gdal_rasterize", "-q", "-a", attribute, "-ot", dtype, "-init", "0",
         "-te", str(b.left), str(b.bottom), str(b.right), str(b.top), "-tr", str(res), str(res),
         "-co", "TILED=YES", "-co", "BLOCKXSIZE=512", "-co", "BLOCKYSIZE=512",
         "-co", "COMPRESS=DEFLATE", "-co", "BIGTIFF=YES", vector, str(out)],
        check=True,
        env={**os.environ, "GDAL_CACHEMAX": "4000"},
    )


def ha(px: float) -> float:
    return round(px * PIXEL_HA, 2)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


def fetch_pdok(collection: str, crs: str | None = None) -> gpd.GeoDataFrame:
    params = {"f": "json", "limit": 1000, "jaarcode": BOUNDARY_YEAR}
    if crs:
        params["crs"] = crs
    url: str | None = f"{PDOK}/{collection}/items?{urllib.parse.urlencode(params)}"
    features = []
    while url:
        with urllib.request.urlopen(url) as r:
            page = json.load(r)
        features += page["features"]
        url = next((link["href"] for link in page["links"] if link["rel"] == "next"), None)
    return gpd.GeoDataFrame.from_features(features, crs="EPSG:28992" if crs else "OGC:CRS84")


# ---------------------------------------------------------------- steps


def step_years(cog: Path, work: Path, out: Path) -> None:
    counts = sum(_parallel(_pairs_chunk, cog, None, 1))[0]
    write_json(out / "years.json", {
        "cog": COG_URL,
        "generated": date.today().isoformat(),
        "first_year": FIRST_YEAR,
        "last_year": LAST_YEAR,
        "lost_max_year": LOST_MAX_YEAR,
        "pixel_ha": PIXEL_HA,
        "ha_by_last_year": {2000 + v: ha(counts[v]) for v in YEAR_VALUES},
    })


def step_regions(cog: Path, work: Path, out: Path) -> None:
    gem = fetch_pdok("gemeente_niet_gegeneraliseerd", RD).sort_values("statcode").reset_index(drop=True)
    gem["idx"] = gem.index + 1
    prov = fetch_pdok("provincie_gegeneraliseerd", RD)[["statnaam", "geometry"]].rename(columns={"statnaam": "province"})
    points = gem.set_geometry(gem.representative_point())
    gem["province"] = gpd.sjoin(points, prov, predicate="within")["province"].groupby(level=0).first()
    gem[["idx", "statcode", "statnaam", "province", "geometry"]].to_file(work / "gemeenten.gpkg")

    zones = work / "gemeenten.tif"
    rasterize(str(work / "gemeenten.gpkg"), "idx", zones, cog, "UInt16")
    counts = sum(_parallel(_pairs_chunk, cog, zones, len(gem) + 1))

    def by_year(row: np.ndarray) -> dict[int, float]:
        return {2000 + v: ha(row[v]) for v in YEAR_VALUES}

    municipalities = [
        {"code": g.statcode, "name": g.statnaam, "province": g.province, "ha_by_last_year": by_year(counts[g.idx])}
        for g in gem.itertuples()
    ]
    write_json(out / "municipalities.json", {
        "boundary_year": BOUNDARY_YEAR,
        "outside_municipalities": by_year(counts[0]),
        "municipalities": municipalities,
    })

    shapes = fetch_pdok("gemeente_gegeneraliseerd")[["statcode", "statnaam", "geometry"]]
    shapes.geometry = shapes.geometry.set_precision(1e-5)
    # RFC 7946 GeoJSON is always lon/lat and has no "crs" member; OpenLayers skips reprojection when it
    # meets a crs name it does not know, such as the one geopandas writes.
    geojson = json.loads(shapes.to_json(drop_id=True))
    geojson.pop("crs", None)
    (out / "municipalities.geojson").write_text(json.dumps(geojson))
    print(f"wrote {out / 'municipalities.geojson'}")


def step_crops(cog: Path, work: Path, out: Path, source: str) -> None:
    names = duckdb.sql(f"""
        SELECT "hcat:code" AS code, any_value("hcat:name") AS name, any_value("hcat:name_en") AS name_en
        FROM read_parquet({[source.format(year=y) for y in range(FIRST_YEAR, LOST_MAX_YEAR + 1)]})
        WHERE "hcat:code" IS NOT NULL GROUP BY 1
    """).fetchall()

    def burn(year: int) -> Path:
        path = work / f"hcat-{year}.tif"
        if not path.exists():
            rasterize(source.format(year=year), "hcat:code", path, cog, "UInt32")
        return path

    years = list(range(FIRST_YEAR, LOST_MAX_YEAR + 1))
    with ThreadPoolExecutor(6) as pool:
        rasters = dict(zip(years, pool.map(burn, years)))

    ha_by_code: dict[int, dict[int, float]] = {}
    for year, raster in rasters.items():
        total: dict[int, int] = {}
        for part in _parallel(_codes_chunk, cog, raster, year - 2000):
            for code, n in part.items():
                total[code] = total.get(code, 0) + n
        for code, n in total.items():
            ha_by_code.setdefault(code, {})[year] = ha(n)
        print(f"crops {year}: {len(total)} codes")

    write_json(out / "crops.json", {
        "note": "code 0: the field had no HCAT code (the crop is not mapped in the converter's table)",
        "crops": {code: {"name": name, "name_en": name_en} for code, name, name_en in names},
        "ha_by_last_year": ha_by_code,
    })


def step_clusters(cog: Path, work: Path, out: Path) -> None:
    with rasterio.open(cog) as ds:
        rows, cols = -(-ds.height // CELL), -(-ds.width // CELL)
        left, top = ds.bounds.left, ds.bounds.top
        res = ds.res[0]
    cells = np.zeros((len(YEAR_VALUES), rows, cols), np.int32)
    for part in _parallel(_cells_chunk, cog):
        for r, c, block in part:
            cells[:, r : r + block.shape[1], c : c + block.shape[2]] = block

    gem = gpd.read_file(work / "gemeenten.gpkg")
    size = CELL * res
    clusters = []
    for cl in find_clusters(cells):
        bbox = [left + cl["cols"][0] * size, top - cl["rows"][1] * size,
                left + cl["cols"][1] * size, top - cl["rows"][0] * size]
        centre = gpd.points_from_xy([(bbox[0] + bbox[2]) / 2], [(bbox[1] + bbox[3]) / 2], crs="EPSG:28992")
        hit = gem[gem.contains(centre[0])]
        nearest = hit if len(hit) else gem.iloc[[gem.distance(centre[0]).argmin()]]
        clusters.append({
            "bbox": bbox,
            "municipality": nearest.statnaam.iloc[0],
            "province": nearest.province.iloc[0],
            "area_ha": round(cl["cells"] * size * size / 10_000, 1),
            "lost_ha": ha(cl["lost_px"]),
            "lost_ha_by_last_year": {y: ha(n) for y, n in cl["lost_px_by_year"].items() if n},
        })
    write_json(out / "clusters.json", {"cell_m": size, "threshold": 0.5, "clusters": clusters})


def step_landuse(cog: Path, work: Path, out: Path, lgn: Path) -> None:
    with rasterio.open(cog) as ds:
        height = ds.height
        overviews = ds.overviews(1)
    step = -(-height // BLOCK // (WORKERS * 2)) * BLOCK
    stripes = [(start, min(start + step, height)) for start in range(0, height, step)]
    parts = [work / f"landuse-{i:03}.tif" for i in range(len(stripes))]
    with ProcessPoolExecutor(WORKERS) as pool:
        counts = sum(pool.map(_landuse_stripe, [cog] * len(parts), [lgn] * len(parts), parts, stripes))

    vrt, result = work / "landuse.vrt", work / "nl_landuse_lgn2025.tif"
    subprocess.run(["gdalbuildvrt", "-q", str(vrt), *map(str, parts)], check=True)
    subprocess.run(
        ["gdal_translate", "-q", "-of", "COG", "-co", "COMPRESS=DEFLATE", "-co", f"BLOCKSIZE={BLOCK}",
         "-co", "OVERVIEW_RESAMPLING=MODE", "-co", "NUM_THREADS=ALL_CPUS", "-co", "BIGTIFF=IF_SAFER",
         str(vrt), str(result)],
        check=True,
    )
    with rasterio.open(result) as ds:
        # The page reads both COGs as two bands of one source, which needs the same tiles at every level.
        assert ds.overviews(1) == overviews, (ds.overviews(1), overviews)
    print(f"wrote {result} ({result.stat().st_size // 2**20} MB)")

    groups = {**{g: name for g, (name, _) in LANDUSE_GROUPS.items()}, 0: "Not in LGN"}
    write_json(out / "landuse.json", {
        "source": "LGN2025, Wageningen Environmental Research (CC BY 4.0)",
        "cog": LANDUSE_COG_URL,
        "groups": [
            {"id": g, "name": name, "lgn_codes": list(LANDUSE_GROUPS[g][1]) if g else []}
            for g, name in groups.items()
        ],
        "ha_by_group": {g: {2000 + v: ha(counts[g, v]) for v in YEAR_VALUES} for g in groups},
    })


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("step", choices=["years", "regions", "crops", "clusters", "landuse", "all"])
    parser.add_argument("--cog", type=Path, required=True, help="local copy of nl_years.tif")
    parser.add_argument("--source", help="parquet path per edition, with {year}; needed for crops")
    parser.add_argument("--lgn", type=Path, help="LGN2025.tif (5 m, EPSG:28992); needed for landuse")
    parser.add_argument("--work", type=Path, required=True, help="scratch directory for rasters")
    parser.add_argument("--out", type=Path, required=True, help="output directory for the JSON")
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)

    steps: dict[str, Callable[[], None]] = {
        "years": lambda: step_years(args.cog, args.work, args.out),
        "regions": lambda: step_regions(args.cog, args.work, args.out),
        "crops": lambda: step_crops(args.cog, args.work, args.out, args.source),
        "clusters": lambda: step_clusters(args.cog, args.work, args.out),
        "landuse": lambda: step_landuse(args.cog, args.work, args.out, args.lgn),
    }
    for name in steps if args.step == "all" else [args.step]:
        print(f"== {name}")
        steps[name]()


if __name__ == "__main__":
    main()
