---
id: WORKORDER-6
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:work-orders"
decision: "Plan 071"
status: guarded
appliesTo:
  - src/lib/work-orders/
tags:
  - invariant
---

# WORKORDER-6 — editing a work order never mutates an executed task's ledger op

> [!warning] Invariant (high, app-code)
> In-place work-order editing (`updateWorkOrderCore`) only ever touches PENDING tasks. A task that has
> been executed (any non-PENDING status — it owns or wrote an immutable ledger op, WORKORDER-1) is LOCKED:
> the edit path may reposition it (seq/groupSeq) but must never change its type/fields/payload/assignee,
> delete it, or touch its attempts or op. The core refuses any edit slot that targets a non-PENDING task
> as editable. Reservations are re-synced per changed PENDING task only; a finalized (APPROVED) or
> CANCELLED work order can't be edited at all.

**Guarded by:** `npm run verify:work-orders`
**Decision:** Plan 071 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/work-orders/`

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
