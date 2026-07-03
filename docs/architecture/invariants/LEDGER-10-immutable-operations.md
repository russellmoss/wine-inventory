---
id: LEDGER-10
group: ledger-correction
severity: critical
enforcedBy: app-code
verify: "npm run verify:reverse"
decision: "D6"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/transform/
tags:
  - invariant
---

# LEDGER-10 — immutable operations

> [!danger] Invariant (critical, app-code)
> Operations are immutable — undo is never a row reversion or delete; it is a new CORRECTION operation whose lines are the inverse of the target, linked via correctsOperationId.

**Guarded by:** `npm run verify:reverse`
**Decision:** D6 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
