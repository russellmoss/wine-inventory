# ADR 0003 — Two-track migration: seed current balances, archive history read-only (never replay through the fold)

- **Date:** 2026-07-06
- **Status:** accepted

## Context

Migration is the product's lead GTM wedge ("the easiest system to migrate to"). The incumbent teardown
(`analysis/incumbent-teardown/SYNTHESIS.md` §D; `fix-council-feedback.md` §3.1 + §4 "the single most
important change"; `FIX_RUNBOOK.md` Decision 4 + Phase 3) surfaced a latent double-count in the earlier
migration framing: it proposed both seeding each lot's current balance via a `SEED` **and** ingesting the
incumbent's operational history as ledger events. Doing both counts the same volume/cost twice. The ledger
is an append-only fold ([[INVARIANTS]] LEDGER-7: projection == fold); anything folded moves the numbers.

## Decision

Ingest on **two strictly separate tracks**:
1. **Cutover balances → the fold.** Emit **exactly one migration `SEED`** per lot/vessel that hard-sets
   current volume, cost basis, tax class, and bond at the cutover date. This SEED is the **only**
   legacy-sourced data that participates in the volume/cost fold.
2. **Legacy operational history → a read-only archive, NEVER folded.** Ingest legacy per-action rows into a
   **structured** archive (typed columns keyed on the stable source action ID — **not** an opaque JSON
   blob), excluded from `foldLines()` / `VesselLot` / the cost DAG. The lot timeline stitches the two
   visually: "Pre-Cellarhand history → cutover → active ledger."

An import stays **DRAFT** until an operator signs off on a reconciliation pack; **publish is blocked while
any reconciliation delta is unresolved** (reconciled to zero, or accepted as a named exception).

Formalized as invariant **MIGRATE-1** ([[MIGRATE-1-seed-not-replay]]), planned in Phase 0, verify-guarded
(`verify:migration`) in Phase 3. Operationalizes **D11** (no fabricated ledger history).

## Why (and what we rejected)

- **Rejected: replay legacy operational history through the active fold** (ingest history as
  `captureMethod:IMPORT` ledger events). **This is the regression tripwire recorded here and nowhere else.**
  Failure mode: legacy rounding, order-of-operations, and cost bugs differ from ours, so replaying them makes
  Cellarhand's fold **disagree with the winemaker's Day-1 expected current state** — migrations fail numeric
  reconciliation and onboarding stalls, the exact opposite of the "easiest to migrate to" goal. It also
  double-counts against the seed. A future contributor tempted to "just import the history into the ledger
  for completeness" must read this and stop.
- **Rejected: an opaque JSON-blob archive.** Decision 4 requires the archive be structured + action-ID-keyed
  so Phase 27 (institutional memory) can make it queryable **without re-ingest**. A blob would force a
  re-ingest later.
- **Chosen: seed-into-fold + structured-read-only-archive**, because it makes the Day-1 numbers match the
  winemaker's reality (trust) while preserving history losslessly for later.

## Consequences / at scale

- Phase 3 builds the `LegacyOperation` archive (structured, action-ID-keyed, Phase-12 tenancy checklist) +
  the two-track ingest + reconciliation pack + publish-block; Phase 4 proves it on a synthetic InnoVint
  bundle.
- The `verify:migration` guard must assert: exactly one `SEED` per lot/vessel folds; `VesselLot` == fold of
  SEEDs only (no legacy row folded); archived rows excluded from `foldLines()`; publish blocked while deltas
  unresolved, succeeds after sign-off.
- The migration `SEED`'s "reversal" is discarding an unpublished draft import, **not** a ledger compensation —
  keep that path distinct from `reverseOperationCore` (a Phase-6 note).
- Full context: [[INVARIANTS]], `FIX_RUNBOOK.md` (Phase 3), `analysis/incumbent-teardown/SYNTHESIS.md` §D,
  `fix-council-feedback.md` §3.1/§4.
