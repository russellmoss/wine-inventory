---
id: WORKORDER-5
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:work-orders"
decision: "Plan 069"
status: guarded
appliesTo:
  - src/lib/work-orders/
tags:
  - invariant
---

# WORKORDER-5 — every work order has a Lead

> [!warning] Invariant (high, app-code)
> Every `WorkOrder` has a non-null Lead (`assigneeEmail`, plus `assigneeId` when a real user is known) —
> the one person accountable for the order. The Lead is resolved at the single create chokepoint
> (`createWorkOrderCore` via `resolveCreateLead`): an explicit Lead passes through, otherwise it defaults
> to the creating actor, so no path (builder, template, composer, recurring, assistant, generic) can
> produce a Lead-less order. Per-task assignees (`WorkOrderTask.assigneeId`) stay OPTIONAL — the Lead is
> the order-level owner, not a per-task assignment.

**Guarded by:** `npm run verify:work-orders`
**Decision:** Plan 069 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/work-orders/`

This note is the machine-readable face of the invariant. The narrative lives in [[INVARIANTS]]; the
guard status is asserted by `npm run verify:invariants`; the `applies-to` paths drive the auto-context
hook that surfaces this rule before any edit to the governed code.
