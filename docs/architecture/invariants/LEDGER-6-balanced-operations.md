---
id: LEDGER-6
group: ledger-pure
severity: critical
enforcedBy: pure-code
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/transform/
tags:
  - invariant
---

# LEDGER-6 — balanced operations

> [!danger] Invariant (critical, pure-code)
> Balanced operations — for every operation sum(deltaL) == 0 across all lines (in-vessel + external). assertBalanced().

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
