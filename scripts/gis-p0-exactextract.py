"""
P0 Unit 5 — the independent oracle.

Reads a JSON payload of fixture geometries + grid definitions, runs `exactextract` over each, and
writes back the PER-CELL coverage fractions. The TypeScript side does the diff and writes the report.

Why per-cell and not aggregates: an aggregate mean can match while individual cells are wrong in
compensating directions, which is exactly the bug this gate exists to catch. `exactextract` is the
only tool in the family that exposes the raw `coverage` array (GDAL's zonal-stats and QGIS give
aggregates only, and QGIS native is centroid-based rather than fractional).

No GeoTIFF is written: `NumPyRasterSource` takes an in-memory array plus an extent, so there is no
GDAL/rasterio dependency and no geotransform ambiguity introduced by a file format.

Cells are identified by their CENTRE COORDINATES rather than by `cell_id`. exactextract indexes
row-major from the top-left (y descending) while our grid has row 0 at the bottom (y ascending);
deriving col/row from the centre removes that ordering question entirely instead of assuming it.

Run:  python3 scripts/gis-p0-exactextract.py <input.json> <output.json>
"""
import json
import sys

import numpy as np
from exactextract import exact_extract
from exactextract.raster import NumPyRasterSource


def close_ring(ring):
    """GeoJSON requires an explicit closing vertex; our fixtures store open rings."""
    if ring and (ring[0][0] != ring[-1][0] or ring[0][1] != ring[-1][1]):
        return ring + [ring[0]]
    return ring


def run_case(case):
    grid = case["grid"]
    w, h = int(grid["width"]), int(grid["height"])
    px = float(grid["pixelSize"])
    x0, y0 = float(grid["originX"]), float(grid["originY"])
    x1, y1 = x0 + w * px, y0 + h * px

    # For coverage-only cases a constant raster keeps it obvious that geometry is under test.
    # For the statistics cases we need VARYING values, or a weighted mean is trivially the constant
    # and proves nothing. The gradient is defined identically on both sides as
    # value(col,row) = col + 100*row, with OUR row 0 at the BOTTOM, so numpy row r is our row h-1-r.
    if case.get("gradient"):
        mat = np.zeros((h, w), dtype="float64")
        for r in range(h):
            our_row = h - 1 - r
            for c in range(w):
                mat[r][c] = c + 100.0 * our_row
    else:
        mat = np.ones((h, w), dtype="float64")
    rast = NumPyRasterSource(mat, xmin=x0, ymin=y0, xmax=x1, ymax=y1, name="ones")

    # `parts` is a list of polygons, each [shell, ...holes]. A single part serializes as Polygon;
    # several parts MUST serialize as MultiPolygon, or the extra shells would be read as holes of
    # the first and silently discarded by GEOS.
    parts = [[close_ring(r) for r in part] for part in case["parts"]]
    geometry = (
        {"type": "Polygon", "coordinates": parts[0]}
        if len(parts) == 1
        else {"type": "MultiPolygon", "coordinates": parts}
    )
    feature = {"type": "Feature", "properties": {"id": case["name"]}, "geometry": geometry}
    # exact_extract's prep_vec accepts a Feature dict or a LIST of them, not a FeatureCollection.
    # Aggregates are requested alongside the per-cell arrays so Unit 9 can validate the statistics
    # the oracle CAN arbitrate: coverage-weighted mean, count, min and max. Quantiles are absent on
    # purpose - they are definition-dependent and validated against analytic fixtures instead.
    res = exact_extract(
        rast,
        [feature],
        ["cell_id", "center_x", "center_y", "coverage", "mean", "count", "min", "max"],
        include_geom=False,
    )

    props = res[0]["properties"]

    def arr(key):
        # values come back as numpy arrays; `x or []` is ambiguous on those, so test for None
        v = props.get(key)
        return [] if v is None else list(v)

    centers_x = arr("center_x")
    centers_y = arr("center_y")
    cov = arr("coverage")
    cell_ids = arr("cell_id")

    cells = []
    for i in range(len(cov)):
        cx, cy = float(centers_x[i]), float(centers_y[i])
        # centre -> integer grid indices, in OUR convention (row 0 at the bottom)
        col = int(round((cx - x0) / px - 0.5))
        row = int(round((cy - y0) / px - 0.5))
        cells.append(
            {
                "col": col,
                "row": row,
                "centerX": cx,
                "centerY": cy,
                "coverage": float(cov[i]),
                "cellId": int(cell_ids[i]) if i < len(cell_ids) else -1,
            }
        )

    def scalar(key):
        v = props.get(key)
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "name": case["name"],
        "cells": cells,
        "aggregates": {
            "mean": scalar("mean"),
            "count": scalar("count"),
            "min": scalar("min"),
            "max": scalar("max"),
        },
    }


def main():
    if len(sys.argv) < 3:
        print("usage: gis-p0-exactextract.py <input.json> <output.json>", file=sys.stderr)
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        payload = json.load(fh)

    import exactextract

    out = {
        "tool": "exactextract",
        "version": exactextract.__version__,
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "cases": [run_case(c) for c in payload["cases"]],
    }

    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        json.dump(out, fh)

    total = sum(len(c["cells"]) for c in out["cases"])
    print(f"exactextract {out['version']} — {len(out['cases'])} cases, {total} cells")
    return 0


if __name__ == "__main__":
    sys.exit(main())
