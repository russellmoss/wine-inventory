---
id: COST-3
group: cost
severity: critical
enforcedBy: app-code
verify: "npm run verify:cost"
decision: "D12"
status: guarded
appliesTo:
  - src/lib/cost/
tags:
  - invariant
---

# COST-3 — immutable cogs snapshot

> [!danger] Invariant (critical, app-code)
> The COGS snapshot is immutable — a backdated correction after bottling leaves the frozen BottlingCostSnapshot untouched and emits a CostVarianceEvent (soldDelta + unsoldDelta == totalDelta), never a restate. Closed periods are period-safe by construction.

**Guarded by:** `npm run verify:cost`
**Decision:** D12 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/cost/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
