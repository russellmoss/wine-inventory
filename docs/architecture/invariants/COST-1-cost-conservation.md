---
id: COST-1
group: cost
severity: critical
enforcedBy: pure-code
verify: "npm run verify:cost"
decision: "D10"
status: guarded
appliesTo:
  - src/lib/cost/
tags:
  - invariant
---

# COST-1 — cost conservation

> [!danger] Invariant (critical, pure-code)
> Cost conservation — across blend/split/loss/bottle/reversal, Σ(cost out) + stranded == cost removed from parents; nothing created or destroyed except explicit VARIANCE lines. Zero volume ⇒ zero cost.

**Guarded by:** `npm run verify:cost`
**Decision:** D10 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/cost/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
