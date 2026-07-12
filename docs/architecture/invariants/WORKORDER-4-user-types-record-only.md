---
id: WORKORDER-4
group: work-orders
severity: high
enforcedBy: app-code
verify: "npm run verify:user-types-record-only"
decision: "Plan 053 Phase C"
status: guarded
appliesTo:
  - src/lib/work-orders/vocabulary-resolver.ts
  - src/lib/work-orders/custom-log.ts
  - src/lib/work-orders/custom-log-fields.ts
tags:
  - invariant
---

# WORKORDER-4 — tenant-authored task types are record-only

> [!warning] Invariant (high, app-code)
> A tenant-authored task type (a "Custom Log") is RECORD-ONLY. It is always a `NOTE`, and can NEVER declare
> a ledger `opType`, an `observationType`, or a maintenance `activityType`. It records data onto the task
> only, never touching the immutable ledger, the cost roll-up, or the governed measurement store. Only
> code-defined built-in types (in `TASK_VOCABULARY`) reach those. A user type can also never SHADOW a
> built-in key.

**Guarded by:** `npm run verify:user-types-record-only`
**Decision:** Plan 053 Phase C — see [[INVARIANTS]] and [[system-map]].
**Applies to:** the vocabulary resolver + Custom Log store/vocab.

Enforced three ways: structurally (`work_order_task_type` has NO kind/opType column — there is nothing to
set); by `assertUserTaskTypeSafe`, run before every persist AND on every resolve merge; and by the
`resolveTaskVocabulary` merge, which skips any user code that collides with a built-in. Field overlays
(`WorkOrderTaskTypeOverlay`) are display-only and `assertOverlaySafe` forbids hiding a field a governed core
needs. This note is the machine-readable face of the invariant; the guard status is asserted by
`npm run verify:invariants`.
