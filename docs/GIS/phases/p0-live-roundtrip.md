# P0 — live estate-wide round-trip (MEASUREMENT, Unit 11)

**Date:** 2026-07-24 · **Run:** `npm run verify:gis-live` (by hand, from the main checkout)

One request for the WHOLE ESTATE, not one per block. The free tier allows 10,000 requests and
10,000 PU per month and this request cost the PU below, so REQUESTS bind ~26x sooner than PU.
Per-block fetching would burn 50 requests per look at a 50-block estate. It is also the better
test: N blocks clipped against one in-memory raster IS the no-worker hypothesis.

## Provenance

| field | value |
|---|---|
| scene id | `S2A_MSIL2A_20260603T160701_N0512_R097_T17SQC_20260604T001512` |
| acquired | 2026-06-03T16:07:01.024000Z |
| scene cloud cover | 0.34% |
| **processing baseline** | **05.12** (STAC `processing:version`) |
| baseline cross-check | `05.12` from the SAFE product id |
| output CRS | EPSG:32617 |
| grid | 342 x 342 px at 10 m |
| units | REFLECTANCE |
| harmonizeValues | false |
| upsampling / downsampling | NEAREST / NEAREST |
| attribution | Contains modified Copernicus Sentinel data 2026 |

The baseline is NOT available from the Process API. It comes from a second call to the CDSE STAC
catalogue, and the `_N####_` token in the SAFE product id corroborates it. Recording Sentinel
Hub's `serviceVersion` in its place would have been silently wrong.

## Measurements

| stage | time |
|---|---|
| STAC search | 135645 ms |
| Process API (fetch + transfer) | 2153 ms |
| NDVI + SCL mask over 116,964 px | 39 ms |
| clip + zonal stats, 20 blocks | 164 ms |
| vineyard p5-p95 domain | 673 ms |
| **total** | **138674 ms** |

| output | value |
|---|---|
| payload | 767,455 bytes (0.73 MB) |
| processing units | 0.892364501953125 |
| pixels | 116,964 |
| valid after SCL mask | 94,530 (80.8%) |
| masked | 22,434 |
| saturated (NDVI exactly 1.0) | 0 |
| cells clipped across 20 blocks | 8,000 |

## The math survives real data

The fixtures prove correctness; this proves the pipeline survives real no-data regions, real SCL
classes and a real UTM grid.

- vineyard p5-p95 NDVI domain: **[0.0780, 0.8762]**
- narrow: false · degenerate: false
- per-block NDVI means span **0.281 .. 0.709**

A spread of block means across a single scene is the product working: it is exactly the
within-vineyard variation a manager opens the map to find.

## A trap worth recording

The first live attempt returned HTTP 400:

> Your request of 3504.23 meters per pixel exceeds the limit 1500.00 meters per pixel

`output.resx/resy` are in the units of the REQUESTED CRS. Under CRS84 `resx: 10` asks for 10
DEGREES per pixel. Pinning Sentinel-2's native 10 m grid is only possible in a METRIC CRS, so the
client now projects the AOI into its UTM zone by default (`utmBboxFor`) and the resolution is
correct by construction rather than by remembering.

## Decoding

The GeoTIFF is decoded with Python `tifffile`, a dev-only tool, rather than adding an npm raster
dependency for a spike. The runtime dependency count stays at 23.
