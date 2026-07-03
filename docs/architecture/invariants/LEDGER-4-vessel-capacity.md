---
id: LEDGER-4
group: ledger-db
severity: high
enforcedBy: app-code
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-4 — vessel capacity

> [!danger] Invariant (high, app-code)
> Vessel capacity — an operation may not drive a vessel's total holdings above capacityL (checked under the write lock, separate from the non-negative VesselLot guard).

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
