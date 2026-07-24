# P0 — per-cell coverage validation vs exactextract (DECISION GATE, Unit 5)

**Date:** 2026-07-24  
**Oracle:** `exactextract` 0.3.0 (Python 3.13.14, numpy 2.4.4)  
**Install path:** `python3 -m pip install --only-binary :all: exactextract numpy` — official
`win_amd64` wheels for CPython 3.9–3.13, so no conda, no OSGeo4W, no Docker, no WSL.  
**Script:** `scripts/gis-p0-validate-coverage.ts` + `scripts/gis-p0-exactextract.py`

## Why per-cell

An aggregate mean can match while individual cells are wrong in compensating directions.
`exactextract` is the only tool in this family that exposes the raw per-cell `coverage` array;
GDAL `zonal-stats` and QGIS give aggregates only, and QGIS native is centroid-based rather than
fractional. Cells are matched by CENTRE COORDINATES, not by `cell_id`: exactextract indexes
row-major from the top-left while our grid puts row 0 at the bottom, and deriving the indices
from the centre removes that ordering question rather than assuming an answer.

No GeoTIFF is involved. `NumPyRasterSource` takes an in-memory array plus an extent, which also
removes any geotransform ambiguity a file format might introduce.

## Results

| fixture | our cells | oracle cells | max per-cell abs diff | area conservation (rel) | verdict |
|---|---|---|---|---|---|
| known-coverage planting | 16 | 16 | 2.38e-8 | 0.00e+0 | ok |
| block west | 8 | 8 | 1.49e-9 | 0.00e+0 | ok |
| block east | 8 | 8 | 2.38e-8 | 1.80e-16 | ok |
| planting with hole | 96 | 96 | 0.00e+0 | 0.00e+0 | ok |
| tangent hole | 12 | 12 | 0.00e+0 | 0.00e+0 | ok |
| U-shape re-entrant | 1 | 1 | 5.36e-9 | 0.00e+0 | ok |
| narrow block | 30 | 30 | 2.98e-9 | 3.79e-16 | ok |
| disconnected plantings | 39 | 39 | 0.00e+0 | 0.00e+0 | ok |
| high-vertex block (2000) | 64 | 64 | 2.95e-8 | 1.99e-15 | ok |
| known-coverage @ half-pixel offset | 18 | 18 | 2.38e-8 | 0.00e+0 | ok |

## Observed disagreement

- cells compared: **292**
- exactly zero difference: **215**
- p50 / p95 / max: **0.00e+0 / 1.56e-8 / 2.95e-8**

## eps_agree, derived

Observed maximum per-cell disagreement is **2.95e-8**.

### The disagreement is the ORACLE's precision, not ours

This was worth chasing rather than absorbing into a tolerance. Every value `exactextract`
returns is **exactly float32-representable**, and it reports a coverage of 0.9 as
`0.8999999761581421` — which is `float32(0.9)` widened back to float64. Our clipper is float64
throughout and returns exactly `0.9`.

So exactextract computes coverage in float32 internally. The observed maxima (2.38e-8, 2.95e-8)
sit precisely at float32 ULP for those magnitudes (2.98e-8 at 0.25, 5.96e-8 at 0.5).

Of **77** non-zero differences, **77** are within the oracle's own
float32 spacing and **0** are not.

The practical consequence: **a per-cell difference below float32 ULP carries no information
about our correctness**, because the oracle cannot represent the answer more precisely than
that. eps_agree is therefore bounded below by ~1.2e-7 (float32 ULP at coverage 1.0), and the
1e-9 figure the external research proposed is unreachable in principle against this oracle.

| band | threshold | meaning |
|---|---|---|
| float noise | ≤ 1e-12 | ordering/accumulation differences between two correct implementations |
| algorithmic | 1e-12 … 1e-9 | boundary-traversal vs per-pixel clipping reaching the same answer differently |
| **investigate** | > 0.000001 | not explicable by float64; look for a real cause |
| **hard fail** | > 0.0001 | 1e-4 on a 10 m pixel is 1 cm² — no double-precision path produces that by accident |

## Area conservation

`Σ coverage × pixelArea ≈ polygon area` is asserted for every fixture. This is the ORACLE-FREE
check: sliver and dropped-ring bugs in this problem space are usually silent, so a thrown error
is the good outcome and this invariant is what catches the quiet ones.

## Half-pixel offset

The offset grid is included deliberately. A pixel-corner vs pixel-centre geotransform error shows
up as a large, systematic, EDGE-ONLY disagreement rather than as a tolerance question, and must
never be absorbed by widening a tolerance.

## Verdict: **PASS**

The hand-rolled Sutherland–Hodgman clipper agrees with exactextract cell by cell across every
fixture, including the re-entrant U-shape, holes, a tangent hole, a 2000-vertex ring and the
half-pixel-offset grid. The zero-dependency decision stands.
