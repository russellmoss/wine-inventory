# ADR 0001 — Vineyard-block work-order target (the minimal Phase-20 seam)

- **Date:** 2026-07-05
- **Status:** accepted

## Context

The work-order engine (Phase 9) targets only cellar vessels/lots/materials — a `WorkOrderTask` had no
vineyard-block target, and plan 032 deferred "block activities" (the general vineyard-WO model:
block-activity ledger, cross-block fan-out, farming-cost roll-up) to **Phase 20**. Plan 039 needed the
fruit "weigh-in" stage to be issuable from a work order, which requires a task to point at a vineyard
block. See [[system-map]] §10 and `docs/plans/2026-07-04-039-feat-harvest-weigh-in-ph-ta-plan.md`.

## Decision

Pull the Phase-20 vineyard-block target seam forward, **minimally**: add exactly one task target
(`WorkOrderTask.blockId`, composite-FK'd `(tenantId, blockId) → vineyard_block(tenantId, id)`), one
`"block"` FieldType, and one block type — `HARVEST_WEIGH_IN` (a `kind: "OBSERVATION"` with a string
`observationType`, so NO enum migration). Completing it writes a `HarvestPick` (weight + optional
Brix/pH/TA) through the shared `harvest/pick-core.ts` — no cellar ledger op, straight to DONE. The block +
readings are run-time inputs (execute sub-form), never template defaults, mirroring the vessel/lot rule.

## Why (and what we rejected)

- **Rejected: defer entirely to Phase 20.** The user wants weigh-in from a work order now; the whole
  Phase-20 model is a much larger build.
- **Rejected: a new `WorkOrderTaskKind` enum value.** A weigh-in is observation-like (writes data, not a
  ledger op); reusing OBSERVATION + a free-string `observationType` keeps the only schema change to the
  `blockId` column.
- Kept to the smallest possible surface (one target + one field type + one block type) so Phase 20
  **extends** this seam rather than unwinding it.

## Consequences / at scale

- Phase 20 owns the general block-activity model and MUST reconcile with this seam (extend the `blockId`
  target + the `"block"` FieldType; add more block types) — do not fork a parallel model.
- The composite FK follows the Phase-12 tenant-isolation rule (a block reference can't cross tenants); a
  block with WO history can't be silently deleted (ON DELETE RESTRICT). No new entry needed in
  [[scale-register]] (one nullable FK column + index, same shape as the existing WO target columns).
