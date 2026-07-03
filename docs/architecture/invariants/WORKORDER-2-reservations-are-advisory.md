---
id: WORKORDER-2
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:work-orders"
decision: "Phase 9"
status: guarded
appliesTo:
  - src/lib/work-orders/
tags:
  - invariant
---

# WORKORDER-2 — reservations are advisory; capacity + stock are enforced only at commit

> [!warning] Invariant (high, app-code)
> Work-order reservations are SOFT, expiring, advisory holds: available-to-promise = on-hand/capacity −
> Σ(active holds), and a shortfall WARNS, never blocks. The real guarantee is at commit — vessel
> capacity in `writeLotOperation` (LEDGER-4) and the `SupplyLot` decrement in `consumeMaterialCore`. A
> reservation never gates a write; it only surfaces a coordination conflict at issue time.

**Guarded by:** `npm run verify:work-orders`
**Decision:** Phase 9 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/work-orders/`

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
