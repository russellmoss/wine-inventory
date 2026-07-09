---
title: "PHASE 3 -- Generic migration kernel (spine + trust mechanisms)"
type: feat
status: planned
date: 2026-07-08
branch: feat/phase-3-generic-migration-kernel
depth: deep
units: 18
---

# PHASE 3 -- Generic Migration Kernel Plan

## Current Posture

This plan follows `FIX_RUNBOOK.md` v2.4 / Decision 7:

`Phase 3 generic kernel -> Phase 5 -> Phase 6`

Phase 3 builds the **incumbent-agnostic migration spine only**. It does not build the Phase 4 InnoVint
adapter or the Phase 7 Vintrace connector. It uses a small synthetic/frozen proof bundle only to verify
the kernel contracts.

## Problem Frame

Phases 1 and 2 shipped the two prerequisites for credible migration:

- **Identity:** `LotIdentifier`, `LotCodeEvent`, mutable human `code`, non-unique `displayName`, and
  cross-identifier search are in place.
- **Bond/tax model:** `Bond`, line-level bond posting, tax-class events, taxpaid terminal state, and
  amended-chain integrity are guarded.

What is still missing is the trust layer that makes a winery willing to cut over: a draft import that
stages current balances, archives pre-Cellarhand history without folding it, reconciles the draft against
source totals, and blocks publish until an admin accepts every discrepancy.

The key invariant is **MIGRATE-1**: cutover balances seed the live fold exactly once; legacy history is
read-only archive evidence and never enters `foldLines()`, `VesselLot`, or the cost DAG.

## Non-Goals

- No real InnoVint/Vintrace adapter.
- No live partner API or export handling.
- No scraping.
- No legacy-history replay through `LotOperation`.
- No finished-goods or bottle-storage publish in Phase 3. This generic kernel v1 seeds **bulk wine in
  vessels only**. Finished goods are reported as coverage/reconciliation gaps for later adapter phases.
- No attempt to pre-harden against real-file encodings, column drift, tier gates, or export UI behavior.
- No query/report surface over `LegacyOperation` beyond timeline stitching.
- No broad RBAC matrix; publish/discard/sign-off actions use existing `adminAction`.

## Requirements

- **MUST:** Add a generic import batch lifecycle: draft, reconcile, sign off, publish, discard.
- **MUST:** Stage current-state seed rows before writing live ledger data.
- **MUST:** Publish by writing one `SEED` operation per lot/vessel position, captureMethod `IMPORT`, with
  idempotency based on source identifiers and batch/position keys.
- **MUST:** Stamp line-level bond on migration seed lines, using Phase 2 bond authority.
- **MUST:** Preserve imported source codes verbatim unless a per-tenant `Lot.code` collision is explicitly
  resolved by an operator.
- **MUST:** Store source identifiers in `LotIdentifier` on publish.
- **MUST:** Archive legacy history into structured, typed `LegacyOperation` rows keyed by stable
  source-action id. Raw evidence may be retained, but not as the only schema.
- **MUST:** Keep archive rows out of the ledger fold, cost DAG, and compliance fold.
- **MUST:** Build reconciliation items for by-vessel volume, by-lot volume, cost-by-lot, chemistry count,
  TTB summary where present, unmapped entities, inferred/partial lineage, and finished-goods coverage gaps
  when source data mentions inventory outside bulk vessel positions.
- **MUST:** Block publish while any reconciliation item is open.
- **MUST:** Allow named-exception acceptance: status `ACCEPTED`, actor, timestamp, reason.
- **MUST:** Flip `MIGRATE-1` to guarded with `verify: "npm run verify:migration"`.
- **MUST:** Extend `verify:tenant-isolation` for every new tenant-scoped table.
- **MUST:** End green: `test`, `lint`, `build`, `verify:invariants`, `verify:tripwires`,
  `verify:tenant-isolation`, `verify:cost`, `verify:ttb`, and new `verify:migration`.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Current execution lane | Generic kernel only | Decision 7 parks partner-specific adapters. |
| Draft isolation | Stage normalized seed/current-state rows before live publish | Keeps incomplete imports out of live inventory and TTB views. |
| Publish unit | One `SEED` op per staged lot/vessel position | Directly verifies "exactly one migration SEED per lot/vessel" and keeps idempotency simple. |
| Seed account scope | Bulk vessel positions only | Keeps Phase 3 generic and app-useful without designing Vintrace/sparkling/finished-goods import prematurely. |
| Legacy history | Structured `LegacyOperation`, linked to import batch and live lot/vessel when resolvable | Queryable later without replaying history. |
| Mapping shape | Split field mapping from entity resolution | Header mappings and source-vessel/source-bond/analyte-to-app-id mappings have different lifecycles and uniqueness. |
| Mapping intelligence | Deterministic suggestions are allowed, but only confirmed mappings/resolutions apply | Satisfies "AI suggest-only" without introducing an LLM dependency in the kernel. |
| Tax class at cutover | Use existing tax-class derivation inputs plus `ChangeOfTaxClassEvent` only when the source declares an explicit class that must be preserved | Avoids adding a stored tax-class column and honors TAXCLASS-1. |
| Bond at cutover | Stage/resolve a `bondId` per seed position; stamp it on the positive seed line as `destBondId` | Keeps bond line-scoped and time-aware. |
| Cost basis | Add `CostComponent.OPENING_BALANCE` and write seed-tied `CostLine`s | Imported opening cost is not material, fruit, barrel, or variance; explicit component prevents reporting ambiguity. |
| Reference resolution | Store source keys first; resolve app ids before sign-off | Draft import can exist before vessels/bonds/reference rows are mapped, but publish cannot. |
| Cutover timing | Preflight blocks cutover at or before any filed 5120.17 period for affected bonds | A migration SEED is opening balance, not a reportable movement or backdated amendment mechanism. |
| UI route | `/migration`, admin-only | This is a cutover control room, not ordinary settings. |

## Review Decisions Folded In

- Discarded imports are marked `DISCARDED`; draft diagnostics/reconciliation remain for audit. No live
  ledger rows are written before publish.
- Opening cost basis uses a new `CostComponent.OPENING_BALANCE` value added in an isolated enum migration.
- Phase 3 is bulk-vessel-only. Finished goods and bottle-storage positions are surfaced as coverage gaps,
  not published.
- `/migration` is the default admin-only route.
- `cutoverAt` must be after the latest filed 5120.17 period for each affected bond. The first post-cutover
  report must treat migration seed as opening inventory, not a reportable movement.

## Schema Plan

All new tables are tenant-scoped and follow the Phase-12 checklist:

- `tenantId String @default("")`
- `@@index([tenantId])`
- `@@unique([tenantId, id])` when targeted by composite FKs
- FK to `organization(id) ON DELETE RESTRICT`
- raw-SQL composite FKs for cross-tenant-risk references
- RLS `ENABLE` + `FORCE ROW LEVEL SECURITY`
- `tenant_isolation` policy with `USING` and `WITH CHECK`
- app_rls DML grants
- `verify:tenant-isolation` coverage

Avoid Prisma composite relations; Phase 1 and Phase 2 both found TypeScript type-depth failures. All
migration models use scalar ids only for cross-table references. Do not add relation arrays to existing hot
models like `Lot`, `Vessel`, `Bond`, `LotOperation`, or `AnalysisPanel`. All tenant-risk FKs, including
batch-child edges, live in raw SQL composite constraints.

### Proposed Models

#### `MigrationImportBatch`

Draft/publish lifecycle root.

Fields:
- `tenantId`
- `id`
- `sourceSystem String` explicit value, e.g. `"generic-proof"` for the Phase-3 fixture
- `sourceName String?`
- `formatVersion String?`
- `status String` with raw CHECK: `DRAFT | PREFLIGHT_BLOCKED | READY_FOR_REVIEW | SIGNED_OFF | PUBLISHED | DISCARDED`
- `cutoverAt DateTime`
- `sourceManifest Json`
- `mappingSnapshot Json?`
- `reconciliationSnapshot Json?`
- `createdById`, `createdByEmail`
- `signedOffById`, `signedOffByEmail`, `signedOffAt`
- `publishedById`, `publishedByEmail`, `publishedAt`
- `discardedAt`
- timestamps

Indexes:
- `@@index([tenantId, status, createdAt])`
- `@@unique([tenantId, id])`

Display labels:
- `DRAFT` -> Draft
- `PREFLIGHT_BLOCKED` -> Needs preflight fixes
- `READY_FOR_REVIEW` -> Ready for sign-off
- `SIGNED_OFF` -> Signed off
- `PUBLISHED` -> Published
- `DISCARDED` -> Discarded

#### `MigrationSeedLot`

Normalized draft lot identity/provenance. Not live inventory.

Fields:
- `tenantId`
- `id`
- `importBatchId`
- `sourceLotKey`
- `sourceSystemId String?`
- `code`
- `displayName String?`
- `form String`
- `productType String?`
- `carbonation String?`
- `declaredTaxClass String?`
- `vintageYear Int?`
- `originVineyardName`, `originBlockName`, `originVarietyName`
- `legacySnapshot Json?`
- `status String` raw CHECK: `READY | BLOCKED | RESOLVED`
- timestamps

Indexes/uniques:
- `@@unique([tenantId, importBatchId, sourceLotKey])`
- `@@index([tenantId, importBatchId])`

#### `MigrationSeedPosition`

Normalized current balance for one lot/vessel position.

Fields:
- `tenantId`
- `id`
- `importBatchId`
- `seedLotId`
- `sourcePositionKey`
- `sourceVesselKey`
- `vesselId String?`
- `vesselCode`
- `accountType String` raw CHECK: `VESSEL`; deliberately one-value in Phase 3 so later phases can widen
  the contract intentionally
- `volumeL Decimal(10,2)`
- `bondId String?`
- `costAmount Decimal(18,8)?`
- `costCurrency String?`
- `costCompleteness String` raw CHECK: `KNOWN | PARTIAL | UNKNOWN`
- `publishedOperationId Int?`
- timestamps

Indexes/uniques:
- `@@unique([tenantId, importBatchId, sourcePositionKey])`
- raw/Prisma unique equivalent for canonical seed uniqueness:
  `UNIQUE (tenantId, importBatchId, seedLotId, vesselId, accountType)` where `vesselId IS NOT NULL`
- `@@index([tenantId, importBatchId])`
- raw composite FK `(tenantId, seedLotId) -> migration_seed_lot(tenantId,id)`
- raw composite FK `(tenantId, vesselId) -> vessel(tenantId,id)` nullable; nullable while draft mapping is incomplete, required before sign-off
- raw composite FK `(tenantId, bondId) -> bond(tenantId,id)` nullable; nullable while draft mapping is incomplete, required before sign-off unless the tenant has exactly one primary-bond fallback
- raw composite FK `(tenantId, publishedOperationId) -> lot_operation(tenantId,id)` nullable

#### `LegacyOperation`

Structured pre-Cellarhand history archive. Never folded.

Fields:
- `tenantId`
- `id`
- `importBatchId`
- `sourceSystem`
- `sourceDataset String?`
- `sourceObjectType String?`
- `sourceActionId`
- `sourceActionType`
- `subjectType String?` // LOT | VESSEL | CHEMISTRY | FINISHED_GOOD | WORK_ORDER | OTHER
- `occurredAt DateTime?`
- `sourceLotKey String?`
- `lotId String?`
- `lotCode String?`
- `sourceVesselKey String?`
- `vesselId String?`
- `vesselCode String?`
- `volume Decimal(18,6)?`
- `volumeUnit String?`
- `canonicalVolumeL Decimal(10,2)?`
- `costAmount Decimal(18,8)?`
- `costCurrency String?`
- `actorName String?`
- `note String?`
- `evidenceRef String?`
- `normalizedPayload Json?` optional typed payload; schema documented per `sourceActionType`
- `rawEvidence Json?` optional evidence, not the primary query shape
- `publishedAt DateTime?`
- timestamps

Indexes/uniques:
- `@@unique([tenantId, importBatchId, sourceSystem, sourceActionId])`
- raw partial unique on published rows:
  `UNIQUE (tenantId, sourceSystem, sourceActionId) WHERE publishedAt IS NOT NULL`
- `@@index([tenantId, importBatchId])`
- `@@index([tenantId, lotId, occurredAt])`
- `@@index([tenantId, sourceLotKey, occurredAt])`

#### `MigrationAnalysisPanel` and `MigrationAnalysisReading`

Staged chemistry. Published to `AnalysisPanel`/`AnalysisReading` only after sign-off.

Panel fields:
- `tenantId`
- `id`
- `importBatchId`
- `sourcePanelKey`
- `seedLotId`
- `sourceVesselKey String?`
- `vesselId String?`
- `observedAt DateTime`
- `enteredByEmail String?`
- `note String?`
- `publishedPanelId String?`
- timestamps

Reading fields:
- `tenantId`
- `id`
- `importBatchId`
- `panelId`
- `sourceReadingKey String?`
- `analyte`
- `value Decimal(12,4)`
- `unit`
- timestamps

Indexes/uniques:
- `@@unique([tenantId, importBatchId, sourcePanelKey])`
- `@@unique([tenantId, panelId, analyte])`
- raw composite FKs to batch, seed lot, staged panel, vessel, and published `analysis_panel`.

Chemistry rule:
- Publishing imported chemistry is allowed, but `verify:migration` must prove its tax-class effect. If the
  source also declares a tax class, the cutover `ChangeOfTaxClassEvent` is the authority at the seed date.
  If the source does not declare a class, imported ABV readings may drive normal derivation.

#### `MigrationReconciliationItem`

Publish gate.

Fields:
- `tenantId`
- `id`
- `importBatchId`
- `kind String` raw CHECK: `VESSEL_VOLUME | LOT_VOLUME | LOT_COST | FINISHED_GOODS | TTB_TOTAL | CHEMISTRY_COUNT | UNMAPPED_ENTITY | PARTIAL_LINEAGE | PARSE_DIAGNOSTIC`
- `subjectType String`
- `subjectKey String`
- `label String`
- `expectedValue Decimal(18,6)?`
- `actualValue Decimal(18,6)?`
- `deltaValue Decimal(18,6)?`
- `unit String?`
- `severity String` raw CHECK: `INFO | WARNING | BLOCKER`
- `status String` raw CHECK: `OPEN | RESOLVED | ACCEPTED`
- `message String`
- `acceptedReason String?`
- `acceptedById`, `acceptedByEmail`, `acceptedAt`
- timestamps

Indexes:
- `@@index([tenantId, importBatchId, status, severity])`

#### `MigrationFieldMapping`

Confirmed source-field mapping memory. Suggestions are not committed here until confirmed.

Fields:
- `tenantId`
- `id`
- `sourceSystem`
- `sourceDataset`
- `formatVersion String?`
- `sourceObjectType`
- `sourceField`
- `targetField`
- `transform Json?`
- `confirmedById`, `confirmedByEmail`
- timestamps

Uniques:
- `@@unique([tenantId, sourceSystem, sourceDataset, formatVersion, sourceObjectType, sourceField])`

#### `MigrationEntityMapping`

Confirmed source-entity-to-app-entity resolution.

Fields:
- `tenantId`
- `id`
- `sourceSystem`
- `sourceDataset`
- `formatVersion String?`
- `sourceObjectType` // vessel | bond | analyte | material | sku | user
- `sourceKey`
- `targetType`
- `targetId String?`
- `targetCode String?`
- `resolution Json?`
- `confirmedById`, `confirmedByEmail`
- timestamps

Uniques:
- `@@unique([tenantId, sourceSystem, sourceDataset, formatVersion, sourceObjectType, sourceKey])`

## Implementation Units

### Unit 0 -- Reference-Data Readiness Audit

Goal: Start `/work` by recording what reference entities already exist and what the generic kernel needs.

Files:
- `PHASE-3-REPORT.md` later
- Optional `plans/PHASE-3-REFDATA-AUDIT.md` if useful during work

Audit:
- Vessels
- Bonds
- Tax classes / `ChangeOfTaxClassEvent`
- Materials/additives
- `WineSku`
- Account mappings
- Users/actor attribution
- Chemistry analytes
- Barrel groups/types only as a representability note, not a Phase 3 build target

Rule: build only missing migration-critical reference creation needed for the generic fixture. Prefer
inline create-during-mapping where an existing domain CRUD/action already exists.

### Unit S1 -- Prisma Schema

Goal: Add the migration tables above plus the opening-balance cost component.

Files:
- `prisma/schema.prisma`

Notes:
- Use String status/kind columns plus raw CHECK constraints instead of new enums unless a value must be a
  shared app enum. This avoids unnecessary Windows enum-rule migrations.
- Add `CostComponent.OPENING_BALANCE` in an isolated enum-only migration before any schema/code writes use
  it.
- Do not add new models to `GLOBAL_MODELS`.
- Do not add Prisma composite relations.
- Validate with `npx prisma validate` and `npm run db:generate` after migration deploy.

### Unit S2 -- SQL Migrations

Goal: Add enum value, tables, constraints, RLS, grants, and composite FKs.

Files:
- `prisma/migrations/*_migration_cost_component_enum/migration.sql`
- `prisma/migrations/*_generic_migration_kernel_schema/migration.sql`

Approach:
- Use `migrate diff -> deploy`, not interactive `migrate dev`.
- Apply the isolated `ALTER TYPE "CostComponent" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE'` migration
  before the table/code migration.
- Include rollback comments in the migration header.
- Add FK to `organization(id) ON DELETE RESTRICT` for every table.
- Add raw composite FKs:
  - batch children to `migration_import_batch`
  - staged positions to staged lots
  - nullable resolved references to `lot`, `vessel`, `bond`, `lot_operation`
  - `legacy_operation` nullable `lotId`/`vesselId`
- Add RLS and fail-closed policy.
- Add app_rls grants.
- Add migration-time assertions that RLS/policy exists on all new tables.

### Unit C1 -- Pure Kernel Types and Unit Normalization

Goal: Create the generic normalized import contract and unit conversion helpers.

Files:
- `src/lib/migration/types.ts`
- `src/lib/migration/units.ts`
- `test/migration-units.test.ts`

Types:
- `NormalizedSeedLot`
- `NormalizedSeedPosition`
- `NormalizedLegacyOperation`
- `NormalizedAnalysisReading`
- `MappingSuggestion`
- `ParseDiagnostic`
- `ReconciliationKind`

Unit conversion:
- Volume: L, liter/litre, mL, gal/US gal.
- Mass and Brix are accepted only for fields that are not volume-folded.
- Unknown unit produces a parse diagnostic, not an implicit conversion.
- Do not convert mass to volume. If a source gives only weight for a wine position, create a blocker.

### Unit C2 -- Synthetic/Frozen Proof Bundle

Goal: Add a small generic fixture that exercises kernel contracts without pretending to be an incumbent
adapter.

Files:
- `fixtures/migration/generic/current-state.csv`
- `fixtures/migration/generic/legacy-operations.csv`
- `fixtures/migration/generic/chemistry.csv`
- `fixtures/migration/generic/manifest.json`
- `src/lib/migration/generic-fixture.ts`

Fixture must include:
- Two lots, one with duplicate `displayName` allowed.
- Two vessel positions.
- One code collision scenario used by a negative test.
- One explicit source identifier per lot.
- One bond-resolved position.
- One legacy operation row that must archive but not fold.
- One chemistry panel/reading.
- One finished-goods row or manifest count that is reported as a coverage gap, not published.
- One open reconciliation item, then accepted/resolved in the verify flow.

### Unit C3 -- Mapping and Preflight

Goal: Convert source fields into normalized rows using only confirmed mappings.

Files:
- `src/lib/migration/mapping.ts`
- `src/lib/migration/preflight.ts`

Behavior:
- Header-name suggestions can be generated deterministically.
- Suggestions are returned to the UI/review step but never used until confirmed.
- Confirmed source-field mappings save to `MigrationFieldMapping`.
- Confirmed source-entity resolutions save to `MigrationEntityMapping`.
- Preflight blocks:
  - missing required mapping
  - unknown/unsupported unit
  - unresolved vessel/bond
  - source code colliding with an existing live `Lot.code`
  - duplicate source action id in same source system
- Sign-off blocks while any staged position lacks a resolved `vesselId`, while bond is unresolved and no
  safe primary-bond fallback applies, or while a staged lot has no publishable code.
- Preflight blocks if `cutoverAt` is at or before the latest FILED 5120.17 period end for any affected
  bond. Migration seed is opening inventory for the first unfiled period, not a backdated amendment.
- Preflight aggregates duplicate source rows into one canonical staged position or blocks them. A batch may
  not contain two publishable seed positions for the same `(seedLotId, vesselId, accountType)`.
- Preflight produces `MigrationReconciliationItem` rows for blockers/diagnostics.

### Unit C4 -- Draft Batch Lifecycle

Goal: Create/re-run/discard draft imports without touching live ledger state.

Files:
- `src/lib/migration/batch.ts`
- `src/lib/migration/actions.ts`

Actions:
- `createMigrationBatchAction` admin-only
- `confirmMigrationFieldMappingAction` admin-only
- `confirmMigrationEntityMappingAction` admin-only
- `runMigrationPreflightAction` admin-only
- `acceptReconciliationItemAction` admin-only
- `signOffMigrationBatchAction` admin-only
- `discardMigrationBatchAction` admin-only

Rules:
- Discarding a draft marks the batch `DISCARDED`.
- Re-running preflight replaces staging rows for that batch only if no publish occurred.
- `signOffMigrationBatchAction` atomically verifies no `OPEN` reconciliation items, all required references
  are resolved, writes signer metadata, and freezes `mappingSnapshot` + `reconciliationSnapshot`.
- After sign-off, mapping/preflight/reconciliation mutation actions reject except publish or discard.
- After publish, every mutation rejects except read-only inspection.
- All writes run under `runInTenantTx` except publish, which uses `runLedgerWrite`.

State transition matrix:

| From | Allowed next | Notes |
| --- | --- | --- |
| `DRAFT` | `PREFLIGHT_BLOCKED`, `READY_FOR_REVIEW`, `DISCARDED` | preflight determines blocked vs reviewable |
| `PREFLIGHT_BLOCKED` | `PREFLIGHT_BLOCKED`, `READY_FOR_REVIEW`, `DISCARDED` | rerun after mapping/reference fixes |
| `READY_FOR_REVIEW` | `SIGNED_OFF`, `PREFLIGHT_BLOCKED`, `DISCARDED` | sign-off only with zero `OPEN` items |
| `SIGNED_OFF` | `PUBLISHED`, `DISCARDED` | frozen snapshot; no further edits |
| `PUBLISHED` | terminal | repeat publish returns existing result |
| `DISCARDED` | terminal | retained for audit; not publishable |

### Unit C5 -- Publish Kernel

Goal: Atomically publish a signed-off batch into live tenant state.

Files:
- `src/lib/migration/publish.ts`
- `src/lib/ledger/write.ts`

Algorithm:
1. Load batch inside `runLedgerWrite`.
2. If status is `PUBLISHED`, return the existing published result after verifying no duplicate work is
   pending.
3. Otherwise refuse unless status is `SIGNED_OFF`.
4. Refuse if any reconciliation item is `OPEN`.
5. For each staged lot:
   - create or resolve live `Lot` by source identifier/idempotency key.
   - set `code` verbatim; if collision unresolved, throw.
   - set `displayName`, `isLegacy=true`, `legacySnapshot`.
   - record source id/current code via `recordIdentifierTx`.
   - create `ChangeOfTaxClassEvent` at cutover if declared source class must be preserved, using a
     tx-composable helper rather than `changeTaxClassCore` directly.
6. For each staged chemistry panel/reading:
   - publish to `AnalysisPanel`/`AnalysisReading` with captureMethod `IMPORT`.
   - use deterministic `clientRequestId`/`captureId` values namespaced by tenant + batch + source key.
   - link `publishedPanelId`.
7. For each staged position:
   - write one `SEED` op with commandId `migration:${tenantId}:${batchId}:seed:${positionId}`.
   - lines: positive vessel line with `destBondId`, negative external `reason:"seed"`.
   - captureMethod `IMPORT`, observedAt `cutoverAt`, batchId `importBatchId`.
   - metadata includes `{ migration: { importBatchId, seedPositionId } }`.
   - attach `publishedOperationId` to `MigrationSeedPosition`.
8. Insert/publish `LegacyOperation` rows by setting `publishedAt`.
9. Mark batch `PUBLISHED` with a compare-and-set style update from `SIGNED_OFF` to `PUBLISHED` in the same
   transaction.

Idempotency:
- Repeated publish of an already published batch returns the published result.
- `writeLotOperation` must be extended to persist `batchId` and `metadata`; do not patch those fields after
  the op write.
- `LotOperation.commandId` is currently globally unique. Keep it global for this phase by namespacing with
  tenant id (`migration:${tenantId}:...`) instead of changing the existing unique index.
- A duplicate `commandId` is treated as success only after loading the existing op and verifying same
  tenant, same metadata import batch/seed position, and same line shape.
- `verify:migration` includes a double-publish/race assertion: two publish attempts produce one set of seed
  ops and both callers observe the same published result.

### Unit C5b -- Ledger Writer Import Metadata

Goal: Make migration seed writes first-class at the ledger chokepoint.

Files:
- `src/lib/ledger/write.ts`
- `prisma/schema.prisma` only if the existing `LotOperation.batchId`/`metadata` columns need type/comment updates

Approach:
- Extend `WriteOpInput` with `batchId?: string | null` and `metadata?: Prisma.InputJsonValue`.
- Persist both during `lotOperation.create`.
- Preserve existing callers by leaving both optional.
- `verify:reverse`, `verify:ttb`, and `verify:cost` must remain green.

### Unit C6 -- Cost Basis Handling

Goal: Preserve imported cost basis without corrupting the cost model.

Files:
- `src/lib/migration/publish.ts`
- `src/lib/cost/*` only where needed to recognize `OPENING_BALANCE`
- `prisma/schema.prisma`
- isolated CostComponent enum migration

Plan:
- Stage cost data in `MigrationSeedPosition` in S1.
- Create seed-tied `CostLine` rows in the same publish transaction using component `OPENING_BALANCE`.
- Known basis: `amount` set and `basisCompleteness=KNOWN`.
- Partial basis: `amount` nullable or partial with `basisCompleteness=PARTIAL`.
- Unknown basis: no amount and `basisCompleteness=UNKNOWN`.
- Account/export behavior: no accounting export should post opening-balance cost unless a deliberate
  account mapping exists; otherwise it withholds like other unmapped cost components.
- `verify:migration` must prove imported cost appears through the existing cost authority and
  known/partial/unknown basis propagates to cost/export readiness correctly.

Implementation note:
- Existing cost cache is lazy and recompute-authoritative. Do not eagerly refresh `LotCostState` in the
  publish transaction; let `getLotCost(..., { forceRecompute })` / `verify:cost` prove the imported basis.

### Unit C6b -- Tx-Composable Tax-Class Event Insert

Goal: Let migration publish preserve source-declared tax class inside the same publish transaction.

Files:
- `src/lib/compliance/tax-class-event-core.ts`
- `src/lib/migration/publish.ts`

Approach:
- Extract a lower-level `recordTaxClassEventTx(tx, actor, input)` that assumes the caller already resolved
  `fromClass`, `toClass`, `volumeAtEvent`, and idempotency key.
- Keep `changeTaxClassCore` behavior unchanged by having it call the tx helper from `runInTenantTx`.
- `publishMigrationBatchTx` calls the tx helper inside `runLedgerWrite` after the seed op establishes the
  opening on-hand volume, or explicitly stamps `volumeAtEvent` from the staged seed position if the event
  is logically simultaneous with cutover.
- Do not nest `runInTenantTx` inside `runLedgerWrite`.

### Unit C7 -- Legacy Timeline Stitching

Goal: Let a lot timeline show pre-Cellarhand archive rows before the Day-Zero seed without folding them.

Files:
- `src/lib/lot/data.ts`
- `src/lib/lot/timeline.ts`
- Possibly `src/app/(app)/lots/[id]/TimelineEntryDetail.tsx`

Behavior:
- Loader fetches published `LegacyOperation` rows by `lotId` or source identifier.
- Timeline renders them as `kind:"LEGACY_OPERATION"` before the migration cutover.
- Use a distinct `LegacyArchiveRow`/legacy item renderer, not the normal operation row path.
- Insert a visible cutover marker: "Cellarhand starts here"; the following `SEED` reads as "Opening
  balance imported from source."
- Copy must say "Pre-Cellarhand" or "Imported history" and must not look like an editable ledger op.
- No undo/reverse controls.
- Archive rows never call `foldLines()`.

### Unit U1 -- Admin Import Review Surface

Goal: Usable admin surface for the generic kernel.

Files:
- `src/app/(app)/migration/page.tsx`
- `src/app/(app)/migration/MigrationClient.tsx`
- `src/lib/migration/actions.ts`

Views:
- Batch list: status, source, cutover date, counts, last update.
- Preflight/mapping: source fields, target fields, suggestions, confirmation.
- Reconciliation: grouped items with severity, expected/actual/delta, accept-with-reason action.
- Sign-off: disabled until no `OPEN` items; admin-only.
- Publish: separate confirmation after sign-off; admin-only.

Batch detail workflow:
- Use tabs: Overview, Mapping, Reconciliation, Sign-off, Activity.
- Overview shows source, cutover date, counts, reference readiness, cost-basis readiness, bond coverage,
  current status, and current allowed action.
- Mapping separates field mappings from entity resolutions.
- Reconciliation is deviation-first: blockers and warnings first; exact matches collapsed/summarized.
- No bulk accept for `BLOCKER` items.
- Accepted exceptions require per-item reason, actor stamp, and timestamp.
- Filters: severity, kind, status.
- Provide CSV export for the reconciliation pack.
- `INFO` items should be metadata or auto-resolved; any persisted `OPEN` item blocks sign-off.
- Sign-off shows an immutable trust packet: source system/name, cutover timestamp, row counts, seed
  lots/positions, unresolved count = 0, accepted-exception count with reasons, cost-basis posture, bond
  coverage, coverage gaps, and publish impact.
- Sign-off requires explicit admin confirmation that accepted exceptions were reviewed.
- Publish is a separate destructive-style confirmation after sign-off.

Design constraints:
- Quiet operational UI, not a marketing page.
- Dense tables/lists; no hero.
- Batch list is a table.
- Reconciliation uses grouped tables once there is more than a small number of items.
- Use tabular numerics for expected/actual/delta and row expansion for evidence/raw details.
- Batch detail may use a sticky summary/action rail if the page is long.
- Status badges and tabs for scanability.
- Use existing app tokens/components.
- Do not over-explain in page copy; labels and states should carry the workflow.
- Empty states/source labels must say "Generic proof import" or equivalent. Do not show InnoVint/Vintrace
  branding, live upload promises, or adapter-specific copy in Phase 3.

### Unit V1 -- `verify:migration`

Goal: Guard MIGRATE-1 end to end.

Files:
- `scripts/verify-migration.ts`
- `package.json`

Assertions:
- Runs inside `runAsTenant("org_demo_winery", ...)`.
- Loads the generic fixture and creates a draft batch.
- Preflight produces expected blockers.
- Confirming mappings is required; suggestions alone do not publish.
- Entity resolutions are required for vessels/bonds/analytes; field mappings alone are not enough.
- Code collision blocks until explicit operator resolution.
- Duplicate `displayName` is accepted.
- Duplicate source rows for the same canonical lot/vessel position aggregate or block; they never publish
  two seed ops.
- Publish is blocked with `OPEN` reconciliation items.
- Accepting/resolving items allows sign-off; sign-off freezes snapshots and blocks later mapping/preflight
  mutation.
- Publish creates exactly one `SEED` per staged lot/vessel position.
- Repeated/double publish returns the same published result and does not create duplicate seed ops.
- `VesselLot` equals the fold of published migration SEEDs only.
- `LegacyOperation` rows exist and are not present in `LotOperationLine`.
- Discarded draft archive rows do not block a later clean import with the same source action ids.
- Re-import/publish is idempotent by source identifiers and command ids.
- Units reconcile to liters.
- Chemistry stages and publishes to `AnalysisPanel`/`AnalysisReading`, attaches to the intended lot/vessel
  without becoming a ledger op, and its tax-class effect is explicit.
- Bond on seed positions is line-scoped.
- Cost basis uses `OPENING_BALANCE` and is either known or explicitly partial/unknown.
- Finished goods in the source fixture are reported as a coverage gap and are not published in Phase 3.
- Cutover at/before a filed 5120.17 period is blocked.

### Unit V2 -- Tenant Isolation

Goal: Add migration tables to isolation proof.

Files:
- `scripts/verify-tenant-isolation.ts`
- `test/tenant-isolation.test.ts`

Assertions:
- Tenant A cannot see tenant B migration batches, field mappings, entity mappings, seed lots/positions,
  staged analysis, legacy ops, or reconciliation items.
- Foreign-tenant inserts raise under WITH CHECK.
- Composite FK rejects cross-tenant staged-position -> batch/lot/vessel/bond references and staged-analysis
  -> batch/lot/vessel references.

### Unit V3 -- Invariant and Tripwire Follow-Through

Goal: Flip MIGRATE-1 and keep governance green.

Files:
- `docs/architecture/invariants/MIGRATE-1-seed-not-replay.md`
- `INVARIANTS.md`
- `docs/architecture/invariants/README.md` if counts need update
- `package.json`

Changes:
- Add `verify: "npm run verify:migration"`.
- Change `status: guarded`.
- Repoint `appliesTo` away from old placeholder to `src/lib/migration/` and `scripts/verify-migration.ts`.

### Unit V4 -- Regression Gates

Goal: Prove the generic kernel did not regress existing app guarantees.

Commands:
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run verify:migration`
- `npm run verify:tenant-isolation`
- `npm run verify:invariants`
- `npm run verify:tripwires`
- `npm run verify:cost`
- `npm run verify:ttb`
- Recommended spot checks: `npm run verify:naming`, `npm run verify:bond`, `npm run verify:taxclass`

Known note:
- Ignore only the pre-existing `invariant-drift.test.ts` load error if it still appears, per runbook.

### Unit R1 -- Phase Report

Goal: Close the phase honestly.

File:
- `PHASE-3-REPORT.md`

Must record:
- Reference-data audit results.
- Stop-gate decisions.
- Tables added.
- What "generic only" means in the shipped code.
- What is explicitly parked for Phase 4/7.
- Any reconciliation UX or cost-basis deferrals.
- Full gate results.

## Review Gates Completed

### Engineering Review

Findings folded in:
- `writeLotOperation` must persist `batchId` and migration metadata directly.
- Migration command ids remain globally unique by including `tenantId` in the key.
- Publish is idempotent for already-published batches and race-safe.
- Cost basis uses explicit `CostComponent.OPENING_BALANCE`.
- Tax-class event insertion gets a tx-composable helper.
- Chemistry gets staged schema and publish behavior.
- Legacy archive uniqueness is batch-scoped in draft and published-unique only after publish.
- Sign-off is a real action and freezes snapshots.
- All migration models avoid Prisma relation arrays/composite relations.

### Council / Adversarial Review

Findings folded in:
- Phase 3 is explicitly bulk-vessel-only; finished goods are coverage gaps, not published.
- Canonical uniqueness prevents two source rows from publishing two SEEDs for the same lot/vessel.
- Field mappings and entity resolutions are separate tables.
- `LegacyOperation` gets broader source/subject fields so not every historical row pretends to be a
  vessel movement.
- `cutoverAt` cannot land inside already-filed 5120.17 periods.

### Design Review

Findings folded in:
- `/migration` is the default admin-only route.
- Batch detail workflow is explicit and tabbed.
- Sign-off includes a trust packet and explicit admin confirmation.
- Reconciliation is deviation-first, no bulk accept for blockers, reason required for every accepted
  exception, with CSV export.
- Timeline uses a distinct legacy renderer and a visible cutover marker.
- UI copy stays generic-proof, with no InnoVint/Vintrace branding or promises.
