# PHASE 5 - Lifecycle-Writer Debt Report

Date: 2026-07-09

## Summary

Implemented lifecycle writers for lot status metadata without changing ledger truth:

- `ACTIVE -> DEPLETED` now happens after a real ledger fold leaves a lot with no vessel or bottle-storage holdings.
- `DEPLETED -> ACTIVE` now happens when a valid ledger write or correction restores live holdings.
- `ARCHIVED` is explicit operator metadata, never automatic.
- Normal ledger writes against archived lots are rejected at the ledger chokepoint.
- Correction/reversal writes are allowed to restore append-only truth and can reopen archived lots to `ACTIVE`.
- `CORRECTED` lots are skipped by lifecycle sync and remain terminal.

## Implementation

- Added `src/lib/lot/lifecycle.ts` for live-holdings calculation, status sync, archived-lot guard, and archive/unarchive transaction helpers.
- Wired `syncLotLifecycleStatusTx` into `writeLotOperation` after vessel, barrel, bottle, component, and compliance projections are folded.
- Added admin-gated server actions in `src/lib/lot/lifecycle-actions.ts`.
- Added lot-detail lifecycle controls with explicit archive/unarchive affordances and disabled archive reason.
- Added live-holdings detail data from both `vessel_lot` and `bottled_lot_state`.
- De-emphasized archived lot rows in the list.

## Lineage Vocabulary

No truthful current `TRANSFORM` producer was found. Current parent-to-child lineage writers produce:

- `SPLIT`
- `BLEND`
- `TOPPING`

Added `LINEAGE_KIND(S)` in `src/lib/lot/lineage.ts`, updated current writers to use the named vocabulary, and removed `TRANSFORM` from the schema field comment. Crush provenance remains represented by `LotHarvestSource`, not fabricated lineage.

## Verification

Added package scripts:

- `verify:lifecycle`
- `verify:projection`

Added `scripts/verify-lifecycle.ts`, using `org_demo_winery` only. It verifies:

- bulk lot starts `ACTIVE`
- zero vessel holdings mark `DEPLETED`
- correction restores `ACTIVE`
- bottle-storage holdings keep vessel-zero lot `ACTIVE`
- draining bottle storage marks `DEPLETED`
- archive rejects live holdings
- archive succeeds at zero balance
- normal write to archived lot rejects
- unarchive zero-balance lot returns `DEPLETED`
- correction can reopen archived lot to `ACTIVE`
- `CORRECTED` is not overwritten
- lineage vocabulary excludes stale `TRANSFORM`

## Gate Results

- `npx tsc --noEmit --pretty false` - passed
- `npm run verify:lifecycle` - passed, 14 assertions
- `npm run verify:projection` - passed
- `npm run verify:reverse` - passed, 31 assertions
- `npm run verify:reverse-transform` - passed, 37 assertions
- `npm run verify:migration` - passed
- `npm run verify:tenant-isolation` - passed
- `npm run verify:invariants` - passed
- `npm run verify:tripwires` - passed
- `npm run test` - passed on clean rerun: 165 files, 1551 tests, 123 skipped
- `npm run lint` - passed with pre-existing warnings only
- `npm run build` - passed

Note: the first full `npm run test` was run concurrently with lint and timed out in the PDF round-trip test; the isolated rerun passed. Concurrent DB regression gates emitted retryable SERIALIZABLE conflict logs, and the write-retry wrapper handled them.

## Deferred / Parked

- Phase 4 remains parked.
- Phase 7 remains parked.
- Phase 3 migration trust hardening remains separate from this phase.
- No Phase 6 operation gaps were added here.
