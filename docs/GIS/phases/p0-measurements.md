# P0 — runtime, memory and storage measurements (Units 12 + 14)

**Date:** 2026-07-24 · **Run:** `npm run verify:gis-measure`

## Kill criteria — committed BEFORE measuring

Stated in code above the measurements so the verdict cannot be rationalised once the numbers
arrive. Judged at REALISTIC scale (~50 ha estate, 20 blocks, <=2000 vertices/block), never at the
deliberate stress case. Meeting one only under stress is a scale-register tripwire, not a kill.

| id | criterion | limit | measured | verdict |
|---|---|---|---|---|
| K1 | compute ms excl. provider @ realistic | 5000 | **390** | PASS |
| K2 | total ms incl. provider (2153 ms live) | 10000 | **2543** | PASS |
| K3 | peak RSS MB | 512 | **451** | PASS |
| K4 | 10x vertices cost factor | 20 | **5.3** | PASS |
| K5 | 10x blocks cost factor | 15 | **1.5** | PASS |
| K6 | stored raster MB | 50 | **0.73** | PASS |

## The sweep

Varies VERTEX COUNT, HOLE COUNT and PART COUNT alongside area, because Sutherland–Hodgman is
O(vertices x pixels) and hectares are only a weak proxy for cost. A 5 ha block with 2000 vertices
is a more meaningful stressor than a 500 ha rectangle.

| case | px | blocks | verts/block | holes | parts | NDVI | clip | stats | domain | 3x3 | render | **compute** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 ha estate, 5 blocks | 12,100 | 5 | 64 | 0 | 1 | 2 | 12 | 3 | 2 | 46 | 4 | **69 ms** |
| 50 ha estate, 20 blocks (REALISTIC) | 116,964 | 20 | 64 | 0 | 1 | 2 | 225 | 8 | 55 | 95 | 6 | **390 ms** |
| 500 ha estate, 50 blocks (STRESS) | 1,166,400 | 50 | 64 | 0 | 1 | 30 | 1591 | 132 | 413 | 723 | 104 | **2993 ms** |
| 5 ha, 200 vertices/block | 12,100 | 5 | 200 | 0 | 1 | 1 | 24 | 0 | 1 | 6 | 1 | **34 ms** |
| 5 ha, 2000 vertices/block | 12,100 | 5 | 2000 | 0 | 1 | 24 | 129 | 0 | 2 | 7 | 1 | **162 ms** |
| 50 ha, 5 blocks | 116,964 | 5 | 64 | 0 | 1 | 4 | 109 | 2 | 43 | 99 | 7 | **263 ms** |
| 50 ha, 50 blocks | 116,964 | 50 | 64 | 0 | 1 | 4 | 162 | 3 | 26 | 97 | 7 | **298 ms** |
| 50 ha, 4 holes/block | 116,964 | 20 | 64 | 4 | 1 | 2 | 359 | 4 | 28 | 61 | 8 | **462 ms** |
| 50 ha, 3 parts/block | 116,964 | 20 | 64 | 0 | 3 | 2 | 352 | 3 | 24 | 58 | 5 | **443 ms** |

### Scaling shape

- **vertices**: 200 -> 2000 per block (10x) cost **5.3x** clip time (limit 20x)
- **blocks**: 5 -> 50 against ONE raster (10x) cost **1.5x** clip time (limit 15x)
- peak RSS across the whole sweep: **451 MB**

Clipping is bbox-prefiltered per ring, which is what keeps the vertex axis sub-quadratic. Without
it a high-vertex block would be clipped against every pixel in the raster.

## Blob storage (Unit 12)

- stored **767,455 bytes** (private, random suffix) in **21006 ms**
- `head`: 767,455 bytes, application/octet-stream — 161 ms
- cold full read: 767,455 bytes in **342 ms**
- warm full read: 767,455 bytes in **151 ms**
- **RANGE on a PRIVATE blob: HTTP 206**, 1,024 bytes in 65 ms — the research's one UNVERIFIED item, CONFIRMED
- probe deleted; the store is left clean

The 512 MB per-blob CDN cache ceiling is the constraint that matters: above it every access is a
cache miss plus a billed operation. A real estate raster is ~0.73 MB, three orders below it, so
there is enormous headroom — but the limit is recorded here rather than left in someone's memory.

## Verdict input: **all kill criteria PASS**
