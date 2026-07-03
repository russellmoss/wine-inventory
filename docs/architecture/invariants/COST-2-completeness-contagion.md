---
id: COST-2
group: cost
severity: high
enforcedBy: app-code
verify: "npm run verify:cost"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/cost/
tags:
  - invariant
---

# COST-2 — completeness contagion

> [!danger] Invariant (high, app-code)
> Completeness contagion — unknown unit cost is recorded as basisCompleteness = UNKNOWN, never a silent $0; any unknown parent taints the child (red 'estimated' badge).

**Guarded by:** `npm run verify:cost`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/cost/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
