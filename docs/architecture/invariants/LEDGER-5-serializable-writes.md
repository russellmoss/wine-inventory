---
id: LEDGER-5
group: ledger-db
severity: critical
enforcedBy: app-code
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-5 — serializable writes

> [!danger] Invariant (critical, app-code)
> Writes run at SERIALIZABLE isolation and lock involved VesselLot rows in canonical sorted order before folding; P2034/serialization failures are retried (withWriteRetry).

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
