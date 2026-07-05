---
id: WORKORDER-3
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:work-orders-enhancements"
decision: "Phase 9.1"
status: guarded
appliesTo:
  - src/lib/work-orders/vessel-activity.ts
  - src/lib/work-orders/maintenance.ts
tags:
  - invariant
---

# WORKORDER-3 — vessel-activity (maintenance) supply use is OVERHEAD, never wine COGS

> [!warning] Invariant (high, app-code)
> A vessel-activity/maintenance task (cleaning, sanitizing, steaming, gas, ozone, SO₂ treatment,
> wet-storage solution change, temperature setpoint) that
> consumes a supply decrements the `SupplyLot` and records an append-only `VesselActivitySupplyUse` per
> depleted lot — but it writes NO `SupplyConsumption`, NO `CostLine`, and NO `LotOperation`, and never
> enters the Phase-8 wine cost roll-up. A sanitizer/cleaner is overhead, not a cost of any specific wine;
> routing it through the wine cost DAG would corrupt cost conservation (COST-1/COST-2). Depletion draws
> stock to zero and reports a shortfall (E1) — it never drives `qtyRemaining` negative.

**Guarded by:** `npm run verify:work-orders-enhancements` (asserts the overhead depletion writes zero
`SupplyConsumption`/`CostLine` and leaves the wine roll-up unchanged, and that a reversal restores stock
by identity).
**Decision:** Phase 9.1 — see [[INVARIANTS]] and [[system-map]]. Related: [[WORKORDER-2-reservations-are-advisory]].
**Applies to:** `src/lib/work-orders/vessel-activity.ts`, `src/lib/work-orders/maintenance.ts`.

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
