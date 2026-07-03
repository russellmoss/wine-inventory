---
id: WORKORDER-1
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

# WORKORDER-1 — a completed task's op is an ordinary immutable ledger op; approval is task metadata

> [!warning] Invariant (high, app-code)
> Completing a work-order OPERATION task writes a REAL, immutable ledger op immediately (through the
> existing family cores). "Pending approval" is a state on the task/attempt, never on the op. Approval
> flips task state (no op mutation); rejection is a `reverseOperationCore` CORRECTION (honors LEDGER-10),
> never a row edit or delete.

**Guarded by:** `npm run verify:work-orders`
**Decision:** Phase 9 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/work-orders/`

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
