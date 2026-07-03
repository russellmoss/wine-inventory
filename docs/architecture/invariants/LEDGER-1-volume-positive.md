---
id: LEDGER-1
group: ledger-db
severity: critical
enforcedBy: database
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-1 — volume positive

> [!danger] Invariant (critical, database)
> CHECK(volumeL > 0) on VesselLot — a balance is never zero or negative; a row at functional zero is deleted, not stored at 0.

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `prisma/schema.prisma`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
