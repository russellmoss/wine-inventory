---
id: LEDGER-2
group: ledger-db
severity: high
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

# LEDGER-2 — no noop lines

> [!danger] Invariant (high, database)
> CHECK(deltaL <> 0) on LotOperationLine — no no-op lines.

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `prisma/schema.prisma`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
