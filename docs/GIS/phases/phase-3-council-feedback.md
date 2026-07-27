# Council Feedback — P3 NDVI display and comparison

**Date:** 2026-07-25
**Plan:** `docs/GIS/phases/phase-3-ndvi-display-plan.md`
**Reviewers:** Codex `gpt-5.4` (correctness + types + data layer + geospatial) · Gemini `gemini-3.1-pro-preview` (product logic + scientific honesty + UX)
**Note:** Codex's first `gpt-5.4-pro` run failed (CLI stuck in web-search); re-run on `gpt-5.4` succeeded.

---

## Convergence (both models, independently)

Both reviewers made **map georegistration** their #1 critical issue, from different angles: Codex on the projection math, Gemini on scientific honesty. This is the single thing to get right.

---

## Critical issues

### C1 — UTM raster painted over a WGS84 bbox on a 3857 basemap is misregistered (Codex, CRITICAL)
The raster is a **north-up metric UTM grid**. `L.imageOverlay(dataUrl, wgs84Bounds)` on Leaflet's default EPSG:3857 map only knows an axis-aligned lat/lng rectangle — it does **not** honor UTM grid rotation relative to geographic north. Mercator *curvature* at ~50 ha is negligible; the **grid-convergence / rotation term is not**. A ~700 m block with ~1–1.5° local UTM-vs-true-north rotation gives **~10 m (≈ 1 Sentinel-2 pixel) corner error** — enough to visibly walk the overlay off block boundaries. **My plan wrongly rated this a "sub-meter approximation" (Risks R4).**
**Fix:** pre-warp/reproject the raster to a **north-up Web-Mercator (3857) display grid** before painting (nearest-neighbor resample so no new values are invented), *or* use a 4-corner/projective overlay that works in the map CRS. **Do not** ship plain `L.imageOverlay` over a WGS84 bbox for a raw UTM image. Affects **Units 3 + 5**; add a **registration test** (Unit 11).

### C2 — `@@unique([tenantId, scope, vineyardId, metric, name])` does NOT enforce uniqueness when `vineyardId IS NULL` (Codex, CRITICAL)
Postgres allows multiple `NULL`s in a unique index, so two `SYSTEM`/`TENANT` styles named `"default"` (both with NULL `vineyardId`) slip through — uniqueness silently unenforced.
**Fix (Unit 1):** two **partial unique indexes** + a CHECK, raw-SQL in the migration:
- `UNIQUE (tenantId, scope, metric, name) WHERE vineyardId IS NULL`
- `UNIQUE (tenantId, scope, vineyardId, metric, name) WHERE vineyardId IS NOT NULL`
- `CHECK ((scope = 'VINEYARD') = (vineyardId IS NOT NULL))`
No fake sentinel `vineyardId`.

### C3 — A single derivative-pointer column on `SpatialDataset` is the wrong shape (Codex, CRITICAL)
One `derivedNdviBlobKey` cannot represent both the raw quantized **display** derivative (Unit 3) **and** the later **smoothed** derivative (Unit 9), nor recipe/version changes. This becomes a correctness problem, not just modeling taste.
**Fix (Unit 1):** make derivatives first-class — `SpatialDatasetDerivative(tenantId, datasetId, kind, version, format, blobKey, byteSize, …)` with `@@unique([tenantId, datasetId, kind, version])` (Phase-12 RLS checklist). Drop the additive pointer columns. This also answers **OQ1** (cache location).

### C4 — False-vigor on uniform blocks: p5–p95 with near-equal endpoints (Gemini, CRITICAL)
A relative ramp always produces low+high colors. A uniform-vigor vineyard (NDVI 0.82–0.84) renders 0.82 deep-red / 0.84 dark-green — a **hallucinated problem**, and `p95 ≈ p5` divides by near-zero → color banding. A dismissible "narrow-domain warning" is not enough (users close warnings and look at colors).
**Fix (Unit 2):** enforce a **minimum domain spread** in `resolveDomain`: if `(p95 − p5) < 0.15`, pad symmetrically around the median (`median ± 0.075`) so a uniform block renders as one honest homogeneous color. (Reuses `ColorDomain.narrow`/`degenerate` flags for the badge, but the *safeguard is the min-spread clamp*, not the warning.)

### C5 — Date comparison without mask intersection (Gemini, CRITICAL)
Comparing Date A (clear) with Date B (30 % cloud/shadow-masked) under `COMPARISON_LOCKED` skews both the visual and the locked domain (Date B's unmasked pixels may all sit in one vigor zone).
**Fix (Unit 8):** logical-AND the valid masks for side-by-side comparison — a pixel masked in *either* date is greyed/hidden in *both*; compute the locked domain over the **intersected** valid pixels only. Compare apples to apples.

---

## Should fix

### S1 — Cache immutability vs derivative versioning (Codex)
Deterministic-key last-write-wins is safe **only if** the key includes the derivative recipe/version; otherwise `Cache-Control: immutable` serves stale bytes when the recipe changes.
**Fix (Units 3/4):** put a recipe/version hash in the derivative key; use `ETag` + versioned metadata; drop bare `immutable` unless the response is truly content-addressed.

### S2 — Int16 ×10000 needs an explicit no-data sentinel (Codex)
NDVI `[-1,1]` fits `[-10000,10000]` (fine for display + scene p5/p95), but `NaN` does **not** fit Int16.
**Fix (Unit 3):** reserve `-32768` as the no-data sentinel, carry it in the format contract; keep the **source float raster authoritative** for any analytics — never reuse the quantized derivative as "authoritative."

### S3 — `Projector.inverse` is recentred — an API footgun (Codex)
The projector API is recentred; `inverse` expects coordinates **relative to the anchor origin**, not absolute UTM easting/northing. Feeding raw UTM bbox corners → catastrophically wrong.
**Fix (Unit 3):** either use a direct EPSG transform for absolute UTM, or build the anchor at the raster origin and pass recentred offsets (`[0,0]`, `[w·px,0]`, `[w·px,h·px]`, `[0,h·px]`). Bounds must use **pixel outer corners**, not centers (a half-pixel shift otherwise).

### S4 — Verify gate misses the registration bug (Codex)
Histogram/palette/Y-orientation/round-trip tests all pass while the raster is spatially misplaced.
**Fix (Unit 11):** add a **registration test** — known raster corner/pixel coords vs known map control points / block geometry, fail on > sub-pixel residual in the display CRS.

### S5 — Bilinear default is scientifically dishonest (Gemini) — ⚠ CONFLICTS WITH THE BRIEF
10 m Sentinel-2 under bilinear looks like ~2 m data; smooth gradients hide mixed-pixel edges (tractor path bleeding into vines). **But brief §7.1 + §7.4 explicitly choose "bilinear recommended default display" + "nearest-neighbor toggle."** Genuine product-vs-honesty tension → **Russell's call (Q1).** Regardless: NaN/masked pixels must map explicitly to alpha 0 (both agree).

### S6 — Six scale modes = cognitive overload (Gemini) — ⚠ partial conflict with brief §6.2
`BLOCK_SCENE` turns every block into a high-contrast rainbow (destroys cross-block context); `VINEYARD_BASELINE` is meaningless until there's a real multi-scene baseline. Brief §6.2 *requires* all six.
**Fix:** progressive disclosure — default + prominent: `VINEYARD_SCENE`, `ABSOLUTE`, `COMPARISON_LOCKED`; tuck `BLOCK_SCENE` / `VINEYARD_BASELINE` / `CUSTOM` under "Advanced." Keeps the brief contract, kills the overload. → **Russell's call (Q2).**

### S7 — Over-engineered saved styles (Gemini) — ⚠ conflict with runbook P3 gate
The 4-level fallback (one-off → vineyard → tenant → system) is RLS + state-management heavy for v1; a tenant admin changing a preset silently repaints everyone's map. Runbook gate lists "SpatialStyle scopes" + "saved-style round-trip."
**Fix options:** trim to `SYSTEM default` + URL-encoded one-off (+ optionally `VINEYARD`); defer `TENANT`. → **Russell's call (Q3, = OQ4).**

### S8 — Time-series NULL gaps look like missing satellite flights (Gemini)
A `< 0.5` valid block renders as a gap → users think "the satellite didn't fly" → support tickets.
**Fix (Unit 8):** render cloud-obscured acquisitions as a **distinct mark** (hollow/×) on the axis with a tooltip "image acquired, but block obscured by clouds" — not an absent point.

### S9 — Steep-terrain boolean flag is a cop-out (Gemini)
Terrain shadow depends on **solar azimuth/elevation at acquisition**, which varies by season/time-of-day, not a static per-vineyard boolean.
**Fix (Units 1/6):** the advisory badge should carry the **acquisition timestamp** (we have `acquiredAt`) and, if capturable, solar zenith/azimuth. ⚠ **Data gap:** P2's `SpatialScene` did **not** store solar angles — so v1 can show date/season honestly; solar angles need a P2 additive capture (defer or small additive follow-on). → note in Q4.

### S10 — Cut the 3×3 analytical smoothing layer for v1 (Gemini) — ⚠ conflict with brief §7.4
Unit 9 adds a third "version of truth" (raw / smooth-display / smoothed-analytical) with edge-effect artifacts near block boundaries. Brief §7.4 wants it but calls it "optional."
**Fix:** defer Unit 9 (analytical median) to reduce v1 surface; keep display resampling (nearest/bilinear) which is appearance-only. → **Russell's call (Q4).**

---

## Design questions

- **DQ1 — Diff map vs side-by-side (Gemini, strong).** Spotting a 15 % vigor drop between two green maps is neurologically hard. A **diff map** (Date B − Date A on a red–white–green ±0.3 scale) is far more actionable; at minimum add a **swipe slider** and **strictly lock pan/zoom** between the two side-by-side instances. → **Russell's call (Q4, = OQ5).**
- **DQ2 — Date picker cloud indicator (Gemini).** With temporal composites deferred, users pick dates manually. Surface each READY dataset's `sceneCloudCover` (a sparkline / badge) so they don't click five masked dates before finding a clear one. Cheap win — fold into Unit 6.
- **DQ3 — `<0.5` valid block representation (Gemini + Codex).** CSV must export `NaN` (not `0.0`); the map should overlay a **diagonal hash** on an invalidated block's geometry so the visible 40 % of pixels isn't judged out of context. Fold into Units 6 + 11.
- **DQ4 — Estimator-split labeling (Codex).** The scene display domain (fresh p5/p95) next to the block panel (stored p10/p25/median) is *defensible, not a bug* — but label them: legend = "scene display domain," panel = "block summary stats." Fold into Unit 6.
- **DQ5 — Binary body + geotransform-in-headers (Codex).** Fine for the internal hook this phase; if other consumers read it later, move to a small explicit container or JSON sidecar.

---

## Disposition (what was applied to the plan vs deferred to Russell)

**Applied directly (clear technical fixes, no product tradeoff):** C1 (reprojection to a 3857 display grid + registration test), C2 (partial unique + CHECK), C3 (`SpatialDatasetDerivative` table), C4 (min-domain-spread clamp), C5 (mask intersection), S1 (versioned key/ETag), S2 (−32768 sentinel), S3 (`Projector.inverse` fix + outer-corner bounds), S4 (registration test), S8 (null-gap marks), DQ2/DQ3/DQ4 (picker cloud badge, hash + `NaN` export, labels).

**Deferred to Russell (brief-vs-council tensions → the 4 questions):** Q1 = default resampling nearest vs bilinear (S5); Q2 = six modes vs progressive-disclosure/trim (S6); Q3 = saved-style scopes in v1 (S7/OQ4); Q4 = comparison UI (side-by-side vs diff vs swipe) + Unit 9 keep/cut + steep-terrain badge depth (S10/S9/DQ1).

---

## Raw response — Codex (gpt-5.4)

> **CRITICAL** — C1 UTM/`imageOverlay` misregistration (~10 m rotation term, pre-warp to 3857 or projective overlay); C2 NULL-in-unique not enforced (partial indexes + CHECK); C3 single derivative pointer wrong shape (`SpatialDatasetDerivative` table). **SHOULD FIX** — S1 immutable-cache vs versioned key; S2 Int16 needs −32768 sentinel, source float stays authoritative; Y-orientation calls (a)+(b) correct, (c) use outer corners; S3 `Projector.inverse` recentred footgun; S4 add a registration test. **DESIGN** — estimator split defensible if labeled; binary+headers ok for an internal hook. "The biggest problem in the plan is the map reprojection assumption. The Y-flip reasoning is mostly sound; the spatial placement model is not."

## Raw response — Gemini (gemini-3.1-pro-preview)

> **CRITICAL** — false-vigor on uniform blocks (enforce min ΔNDVI ≥ 0.15 → pad median ±0.075); bilinear default dishonest (nearest should default; NaN→alpha 0); comparison without mask intersection (logical-AND masks). **SHOULD FIX** — six modes = overload (cut/hide `BLOCK_SCENE` + `VINEYARD_BASELINE`); over-engineered saved styles (System + URL only); null time-series gaps look like missing flights (distinct mark + tooltip); steep-terrain boolean is a cop-out (badge needs acquisition time + solar angles); cut Unit 9 focal median for v1. **DESIGN** — prefer a diff map / swipe over side-by-side (lock pan/zoom); date picker needs a cloud indicator; `<0.5` block → CSV `NaN` + diagonal hash on the map.
