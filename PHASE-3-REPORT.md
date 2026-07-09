# Phase 3 Report - Generic Migration Kernel

Date: 2026-07-08

## Scope Shipped

Phase 3 shipped the incumbent-agnostic migration spine only. The code stages a frozen generic proof bundle,
lets an admin confirm field mappings and entity resolutions, builds reconciliation items, freezes a signed
trust packet, and publishes bulk vessel balances as exactly one live `SEED` operation per staged position.

Generic-only means:
- Bulk wine in vessels can publish to the live ledger.
- Finished goods and bottle storage are surfaced as reconciliation coverage gaps and are not published.
- Legacy operations are structured archive evidence only; they never enter `LotOperationLine`, `VesselLot`,
  cost rollups, or compliance folds.
- No InnoVint adapter, Vintrace connector, scraping, upload parser hardening, or live partner API work is included.

## Reference Data Audit

- Vessels: resolved through `MigrationEntityMapping` before sign-off; unresolved vessels block preflight/sign-off.
- Bonds: resolved per seed position and stamped line-scoped on the seed operation (`destBondId`); unresolved bonds block.
- Tax class: source-declared classes are preserved through a transaction-composable tax-class event helper.
- Chemistry analytes: resolved through entity mappings; staged chemistry publishes to `AnalysisPanel` and
  `AnalysisReading` after sign-off.
- Lot identity: source ids publish to `LotIdentifier`; source codes stay verbatim unless an operator resolves
  a collision explicitly.
- Cost basis: opening balances use the new `CostComponent.OPENING_BALANCE` and appear through the existing cost authority.
- Users/actor attribution: lifecycle actions stamp admin actor id/email where the phase needs auditability.

## Stop Gates

- Suggestions alone do not apply; field mappings must be confirmed.
- Unresolved vessel, bond, analyte, and lot-code collisions block.
- `cutoverAt` at or before a filed TTB 5120.17 period blocks; the verifier proves this before moving the
  proof draft past the filed period.
- Any `OPEN` reconciliation item blocks sign-off. Named exceptions require reason, actor, and timestamp.
- After sign-off, preflight/mapping/reconciliation mutation rejects; publish/discard remain the only lifecycle moves.
- Repeat publish is idempotent and returns the same seed operation ids.

## Tables Added

- `migration_import_batch`
- `migration_seed_lot`
- `migration_seed_position`
- `legacy_operation`
- `migration_analysis_panel`
- `migration_analysis_reading`
- `migration_reconciliation_item`
- `migration_field_mapping`
- `migration_entity_mapping`

All are tenant scoped with RLS, fail-closed tenant policies, app_rls grants, and tenant-isolation verifier coverage.

## Parked For Later

- Phase 4 InnoVint adapter and real file/API normalization.
- Phase 7 Vintrace connector.
- Finished-goods and bottle-storage publish.
- Broader legacy archive query/report surfaces beyond lot timeline stitching.
- Rich reconciliation exports beyond the generic admin review surface.
- Opening-balance accounting export mapping; unmapped opening-balance costs remain withheld by the existing export rules.

## Gates

- `npx prisma validate` - passed.
- `npx prisma migrate deploy` - passed; applied Phase 3 enum and schema migrations.
- `npx prisma generate` - passed during implementation.
- `npx tsc --noEmit` - passed.
- `npx vitest run test/migration-units.test.ts` - passed, 2 tests.
- `npm run test` - passed, 165 files, 1551 tests.
- `npm run lint` - passed with 21 pre-existing warnings and 0 errors.
- `npm run verify:migration` - passed.
- `npm run verify:tenant-isolation` - passed.
- `npm run verify:invariants` - passed; MIGRATE-1 is now guarded.
- `npm run verify:invariant-frontmatter` - passed.
- `npm run verify:tripwires` - passed.
- `npm run verify:cost` - passed.
- `npm run verify:ttb` - passed.
- `npm run build` - passed; `/migration` is in the Next 16 route manifest.

Notes:
- `verify:cost` and `verify:ttb` printed expected P2034 retry logs while their assertions completed green.
- `npm run lint` still reports unrelated warning-only findings that predate Phase 3.
