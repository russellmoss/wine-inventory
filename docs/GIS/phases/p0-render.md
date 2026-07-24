# P0 — canvas paint proof (MEASUREMENT, Unit 13)

**Date:** 2026-07-24 · **Method:** real browser, real Leaflet 1.9, real canvas, bundling the REAL
`src/lib/gis/{render,color,ndvi,smooth}.ts` via esbuild — not a reimplementation.

## Why not jsdom

jsdom **cannot** answer this question. It has no canvas rasteriser (that needs the native
`node-canvas` module) and no compositor at all, so `putImageData` and paint timings there measure
nothing. A jsdom test would have produced a green number and zero information. This had to be a real
browser, and running it found a real bug — see below.

## The bug this found

The first measurement showed **910.9 ms of main-thread block** for a realistic 50 ha estate. A map
that freezes for nearly a second on every scene load is not shippable.

The cause was in our own code: `colorAtNormalized` allocates a fresh `[r, g, b]` array **per pixel**
and walks the palette stop list each time. At 342×342 that is ~117,000 allocations and ~117,000 stop
walks. Fixed with a 256-entry palette LUT (`buildPaletteLut`) plus an inlined normalise, both in
`render.ts`. 256 levels is not a compromise: the output channel is 8-bit, so quantising the ramp to
256 steps is invisible by construction.

| stage | before LUT | after LUT | change |
|---|---|---|---|
| `rasterToRgba` | 431.9 ms | **24.3 ms** | **17.8× faster** |
| `putImageData` | 286.7 ms | **0.4 ms** | — |
| **total main-thread block** | **910.9 ms** | **151.1 ms** | **6.0× less** |

## Measurements

Main-thread block time, blob handoff, after the fix:

| stage | 50 ha estate (342×342, 116,964 px) | 500 ha stress (1080×1080, 1,166,400 px, + coverage) |
|---|---|---|
| `computeNdvi` | 18.0 ms | 523.6 ms |
| `percentileDomain` | 104.8 ms | **1257.8 ms** |
| `rasterToRgba` | 24.3 ms | 309.7 ms |
| `putImageData` | 0.4 ms | 6.5 ms |
| `L.imageOverlay` add | 3.6 ms | 0.7 ms |
| **BLOCK (blob handoff)** | **151.1 ms** | **2098.3 ms** |
| BLOCK (naive `toDataURL`) | 217.4 ms | 2287.0 ms |
| PNG size | 122 KB | 1271 KB |

Verified visually as well as numerically: the raster paints onto the Leaflet map with the Copernicus
attribution present.

## Three findings

**1. Realistic scale is fine. 151 ms is a single perceptible hitch, not a freeze.** The display half
of the no-worker hypothesis holds at the scale that matters.

**2. `percentileDomain` is now the dominant cost, and it dominates badly at scale** — 1257.8 ms of
the 2098.3 ms stress-case block, about 60%. It takes `WeightedSample[]`, so it materialises one
object per sample and then sorts them. Even sampling every 4th pixel, the stress case allocates
~277,000 objects. **The obvious P1/P2 fix is a typed-array quantile path** that sorts a
`Float64Array` directly and skips the object wrapper entirely.

**3. Use `toBlob` + `createObjectURL`, not `toDataURL`.** `toDataURL` blocks the main thread for its
whole encode (66 ms realistic, 189 ms stress) because base64 encoding is synchronous. `toBlob` is
async and its encode does not block. It looks slower on wall clock (214 ms vs 66 ms realistic) and is
the right choice anyway, because wall clock is not what jank is made of.

## Tripwire

**A 500 ha estate blocks the main thread for ~2.1 seconds.** That is a visible freeze. Combined with
the scale-register's memory tripwire (451 MB of a 512 MB limit, also driven by the stress case), the
picture is consistent: **the architecture is comfortable at estate scale and uncomfortable at 10×
estate scale, in both memory and paint.**

The mitigation order when that day comes, cheapest first:
1. typed-array `percentileDomain` (removes ~60% of the stress-case block),
2. move the transform to a Web Worker with a transferable `ArrayBuffer` (the module is already pure,
   so it moves unchanged — which is why rule §2.4 exists),
3. only then consider tiling.

## Reproducing

The harness is not committed: it is a scratch page that bundles the real modules with esbuild and is
served statically. To rebuild it, bundle an entry that re-exports `rasterToRgba`, `percentileDomain`,
`computeNdvi` and `buildPaletteLut` onto `window.GIS`, serve it alongside Leaflet's dist files, and
open with the in-app browser. Sizes are driven by `?size=NNN&cov=1`.
