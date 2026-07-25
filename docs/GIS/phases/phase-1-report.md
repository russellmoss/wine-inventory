# Phase 1 report — Planting geometry foundation (P1)

**Date:** 2026-07-24 · **Branch:** `feat/vi-p1-planting-geometry`
**Plan:** [phase-1-planting-geometry-plan.md](phase-1-planting-geometry-plan.md) · **Council:** [phase-1-council-feedback.md](phase-1-council-feedback.md)

## Verdict: SHIPPED (pending browser QA sign-off)

The `VineyardPlantingArea` parent, geometry versioning, topology review, and reviewable migration-by-union
are built, tested, and proven end-to-end against the real Demo Winery tenant. All 12 plan units landed.

## What shipped

12 units across 7 commits on `feat/vi-p1-planting-geometry`:

| unit | what |
|---|---|
| U1 | `VineyardPlantingArea` + `VineyardGeometryVersion` tables + block `plantingAreaId`/version cols; additive prod migration; RLS + K11 composite FK + partial-unique open-version; isolation cases |
| U2 | `boolean.ts` — **jsts** union/difference/**true-blade-split**/`groupByContinuity` (recentred UTM + snap-rounding) |
| U3 | `overlay.ts` — `MapOverlay` layer-stack contract + additive `SatelliteMap overlays` prop |
| U4 | `topology.ts` — warn-only, severity-tagged findings + area reconciliation |
| U5 | `geometry-meta.ts` — frame-stable SHA-256 fingerprint, geodesic+projected area, IoU |
| U6 | `geometry-version.ts` — IoU-gated NO_OP / CORRECT_IN_PLACE / NEW_VERSION transition + wired-but-empty stale hook |
| U7 | `planting-area-core.ts` — create/update/one-block/split/assign + describe (assistant-reachable) |
| U8 | `actions.ts` — `runInTenantTx` + `writeAudit` + subject row-lock + stale-write guard |
| U9 | `migration-core.ts` — pre-flight topology, strict <1 m grouping, all-or-nothing confirm, source polygons untouched |
| U10 | `/vineyards/planting-setup` — structure + topology warnings + migration flow + governed map overlay |
| U11 | `describe_planting_structure` read tool + goldens (migration-core marked INTERNAL) |
| U12 | isolation cases + `verify:planting-geometry` e2e + this report + ledger/NOW |

## Gate evidence

| gate item | evidence |
|---|---|
| topology fixtures pass (brief §19) | `test/gis-topology.test.ts` (5), `gis-boolean.test.ts` (11), `gis-geometry-meta.test.ts` (8), `gis-geometry-version.test.ts` (4), `gis-overlay.test.ts` (4) — 32 goldens |
| migration flow reviewed end-to-end on Demo Winery | `verify:planting-geometry` 13/13 (create→split→topology→IoU version→migration); UI at `/vineyards/planting-setup` |
| RLS/isolation for new tables | `verify:tenant-isolation` green incl. planting-area RLS, K11 block→planting reject, one-open-version partial unique |
| geometry-version invalidation wired (no consumers yet) | `markStaleFor` returns `[]`, exercised by `gis-geometry-version.test.ts`; NEW_VERSION path proven to append+retain in the e2e |
| assistant read tools + goldens | `describe_planting_structure` + 2 read goldens; `verify:ai-native` green |
| `verify:naming` green | unaffected — PlantingArea uses a plain per-tenant unique name, not the lot-code identity model |

## Measurements / proof

`verify:planting-geometry` on the real tenant path (runAsTenant → RLS), 13/13:
- blade-split reconciles to **zero lost area** (blocks 341,200 m² vs planting 341,200 m²);
- a **9 cm nudge → CORRECT_IN_PLACE** (no version bump, still one version row);
- a **reshape → NEW_VERSION** (v2, v1 retained with `effectiveTo` set — append-only proven);
- migration proposes **2 plantings** (A+B continuous, C separate — no road-bridging), confirms all-or-nothing,
  links all 3 legacy blocks, and leaves **source block polygons byte-identical**.

## Deviations from the plan

- **jsts packaging** (2.12.1, ESM-only, no `main`/`exports`): imported via deep ESM paths
  (`jsts/org/locationtech/jts/…`) with a side-effect `monkey.js` import for the binary ops, and a local
  `src/types/jsts-modules.d.ts` shim (no `@types/jsts` exists). Kernel isolated behind `boolean.ts`.
- **Difference/intersection drop sub-10 cm² slivers** before validation — coincident-edge numerical hairlines
  from independent projection round-trips are noise, not geometry; far below the 1 m² topology floor.
- **Core-level unit tests via a mocked tx were skipped** in favour of the `verify:planting-geometry` e2e on the
  real DB — stronger proof for thin orchestration over already-golden-tested pure functions.
- **`plantingAreaId` NOT NULL enforcement deferred** (backfill-then-enforce) — nullable this phase to protect
  the live Bhutan tenant; all-or-nothing per-vineyard migration + `plantingMigratedAt` gates the UI instead.

## Lessons that change later phases

- **`next dev` regenerated the Prisma client from a stale state**, silently dropping the new models (tsc went
  0 → 60 "model does not exist" errors while the dev server ran). Rule: **stop the dev server before
  `prisma generate`, and after adding models, regenerate before trusting tsc.** (Reinforces the existing
  Windows/Prisma memory.)
- **The in-app browser upgrades `localhost` to `https` and the HTTP dev server navigation is refused** on this
  box — browser QA needs the user to open/allow the origin and log in (Demo creds); it cannot be driven headless.
- **Warn-only topology is now a standing P2 obligation:** because broken mask geometry can persist, P2 MUST
  re-validate the analysis mask before computing NDVI stats rather than trust stored geometry. Recorded here
  and to carry into the P2 plan + registers.
- **P2 inherits the fingerprint + anchor contract** (`geometry-meta`): soil (P4) staleness keys off the same
  frame-stable fingerprint.

## Follow-ups

- Draw-a-new-planting-from-scratch and blade-split via on-map line drawing are wired at the core/action level
  but the setup UI currently drives creation via migration-by-union; the draw-first path is a fast follow.
- `plantingAreaId` NOT NULL enforcement once real tenants have migrated (tracked in `TODOS.md`).
