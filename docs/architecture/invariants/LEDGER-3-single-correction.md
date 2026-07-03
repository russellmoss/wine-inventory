---
id: LEDGER-3
group: ledger-db
severity: critical
enforcedBy: database
verify: "npm run verify:reverse"
decision: "D6"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-3 — single correction

> [!danger] Invariant (critical, database)
> Unique correctsOperationId on LotOperation — an operation is corrected at most once (kills the double-correction race).

**Guarded by:** `npm run verify:reverse`
**Decision:** D6 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `prisma/schema.prisma`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
