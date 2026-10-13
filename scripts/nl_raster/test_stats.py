import numpy as np

from stats import (
    CELL,
    FIRST_YEAR,
    LANDUSE_GROUPS,
    YEAR_VALUES,
    cell_counts,
    count_codes,
    count_pairs,
    find_clusters,
    group_lookup,
    landuse_block,
    merge_overlapping,
)

# Every class in the LGN2025 legend (LGN2025.sld).
LGN2025_CODES = [
    1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 22, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 61, 62, 251, 252, 253, 321, 322, 323, 331, 332, 333,
]


def test_count_pairs_counts_each_zone_and_value() -> None:
    zones = np.array([[0, 1], [1, 2]], np.uint16)
    years = np.array([[0, 9], [26, 9]], np.uint8)
    counts = count_pairs(zones, years, 3)
    assert counts[0, 0] == 1
    assert counts[1, 9] == 1 and counts[1, 26] == 1
    assert counts[2, 9] == 1
    assert counts.sum() == 4


def test_count_codes_only_where_year_matches() -> None:
    codes = np.array([3301010000, 3302000000, 3301010000, 0], np.uint32)
    years = np.array([12, 12, 13, 12], np.uint8)
    assert count_codes(codes, years, 12) == {3301010000: 1, 3302000000: 1, 0: 1}


def test_cell_counts_pads_partial_blocks() -> None:
    years = np.zeros((CELL + 1, CELL), np.uint8)
    years[:CELL, :] = 9
    years[CELL, 0] = 26
    cells = cell_counts(years)
    assert cells.shape == (len(YEAR_VALUES), 2, 1)
    assert cells[0, 0, 0] == CELL * CELL  # all 2009 in the first cell
    assert cells[-1, 1, 0] == 1  # the single 2026 pixel in the padded second cell


def test_find_clusters_ranks_by_lost_area_and_ignores_still_farmed() -> None:
    cells = np.zeros((len(YEAR_VALUES), 6, 6), np.int32)
    full = CELL * CELL
    cells[2010 - FIRST_YEAR, 0:2, 0:2] = full  # 4 lost cells, top-left
    cells[2015 - FIRST_YEAR, 4, 4] = full  # 1 lost cell, apart
    cells[2026 - FIRST_YEAR, 0:6, 3] = full  # still farmed: never a cluster
    cells[2020 - FIRST_YEAR, 2, 5] = full // 4  # below the threshold
    clusters = find_clusters(cells)
    assert [c["cells"] for c in clusters] == [4, 1]
    assert clusters[0]["rows"] == (0, 2) and clusters[0]["cols"] == (0, 2)
    assert clusters[0]["lost_px_by_year"][2010] == 4 * full
    assert clusters[1]["lost_px"] == full


def test_merge_overlapping_joins_boxes_that_overlap_also_after_growing() -> None:
    def box(rows, cols, px):
        return {"rows": rows, "cols": cols, "cells": 1, "lost_px": px, "lost_px_by_year": {2009: px}}

    # a and c only overlap once b has grown a; d stays apart
    a, b, c, d = box((0, 2), (0, 2), 1), box((1, 4), (1, 4), 2), box((3, 5), (3, 5), 4), box((10, 11), (10, 11), 8)
    merged = merge_overlapping([c, a, b, d])
    assert len(merged) == 2
    big = next(m for m in merged if m["lost_px"] == 7)
    assert big["rows"] == (0, 5) and big["cols"] == (0, 5) and big["lost_px_by_year"] == {2009: 7}


def test_every_lgn_class_belongs_to_exactly_one_group_and_nodata_to_none() -> None:
    lut = group_lookup()
    assert all(lut[code] > 0 for code in LGN2025_CODES)
    grouped = [code for _, codes in LANDUSE_GROUPS.values() for code in codes]
    assert sorted(grouped) == sorted(set(grouped)) == LGN2025_CODES
    assert lut[65535] == 0 and lut[0] == 0
    assert lut[29] == 3 and lut[27] == 1 and lut[16] == 6


def test_landuse_block_keeps_the_group_only_where_there_ever_was_a_field() -> None:
    years = np.array([[0, 9], [26, 25]], np.uint8)
    lgn = np.array([[18, 18], [1, 65535]], np.uint16)
    assert landuse_block(years, lgn, group_lookup()).tolist() == [[0, 1], [7, 0]]
