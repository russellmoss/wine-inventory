# ADR 0004 — Multi-vessel work-order consolidation is "one task, N members," not "one op"

- **Date:** 2026-07-12
- **Status:** accepted

## Context

Two multi-vessel models exist in the work-order engine, and they were drifting apart:

- **Group-rack** (BARREL_DOWN / RACK_TO_TANK, plan 050/054) consolidates a barrel range into ONE reviewable
  task with the members in `plannedPayload.groupRack`, backed by ONE balanced `LotOperation` per batch.
- **Maintenance** (CLEAN/SANITIZE/…, plan 060) *fanned out* to one record-only task per barrel. Plan 060's
  stated reason: maintenance has no ledger op, so "a group-op wrapper would be dead weight."

A winemaker reported the fan-out as clutter (`cmrih6g1k0001kz047ap40uox`), and it is also a functional wall:
`NL_WORK_ORDER_MAX_TASKS = 25`, so "clean B1–B60" (60 tasks) is rejected outright.

## Decision

Consolidate multi-vessel maintenance the same way group-rack consolidates: **one reviewable task carrying
the member set in `plannedPayload.groupActivity`** (a `{ activityType, memberVesselIds, memberCodes }` JSON
block, no columns, no join table). Completion is **all-at-once**: one Serializable tx writes one record-only
`VesselActivityEvent` per member (each keyed `${commandId}:${vesselId}`), task straight to DONE. Undo reverses
every member event. `amount` is the per-vessel dose (N members deplete N × dose, matching the old fan-out total).

The load-bearing distinction: **"one reviewable task" ≠ "one ledger op."** Plan 060 correctly rejected a
group-*op* wrapper (there is no op to wrap), but wrongly concluded that meant N *tasks*. A task is a unit of
review and assignment; an op is a unit of the ledger. Maintenance needs the first, not the second.

## Why (and what we rejected)

- **Rejected: keep the fan-out, group only in the UI** (an outside review's suggestion). Still N DB tasks,
  still blows the 25-task cap, and keeps the two models inconsistent. The complaint is about the *task*, not
  the pixels.
- **Rejected: progressive/per-batch completion** (full group-rack parity). Over-built for a record-only,
  fast operation; the complaint is review clutter, which all-at-once fully resolves. Deferred, and the
  payload model doesn't have to change to add it later.
- **Rejected: a `work_order_task_member` join table / member columns.** Members live in JSON exactly like
  `groupRack` — no migration, no RLS surface. The per-barrel historical record is the `VesselActivityEvent`s,
  which DO have real rows + a `vesselId` FK.
- **Consequence accepted:** a null-vessel-column group task does not appear on a member's *pre-completion*
  vessel timeline (`timeline-data.ts` matches by column). Post-completion the events show per barrel. A
  group-aware timeline query is a future nicety.

WORKORDER-3 holds unchanged (per-event overhead, never wine COGS). Proof: `npm run verify:group-maintenance`.
Related: [[WORKORDER-3-maintenance-supply-is-overhead]], plan 061, plan 060 (superseded fan-out), plan 050/054.
