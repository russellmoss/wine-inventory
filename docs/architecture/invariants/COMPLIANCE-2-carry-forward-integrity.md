---
id: COMPLIANCE-2
group: compliance
severity: high
enforcedBy: app-code
verify: "npm run verify:ttb"
decision: "Phase14"
status: guarded
appliesTo:
  - src/lib/compliance/
tags:
  - invariant
---

# COMPLIANCE-2 — carry forward integrity

> [!danger] Invariant (high, app-code)
> The 5120.17 carry-forward chain is period-linked and immutable once filed — a correction emits a new report, never a mutation of a filed period's totals.

**Guarded by:** `npm run verify:ttb`
**Decision:** Phase14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
