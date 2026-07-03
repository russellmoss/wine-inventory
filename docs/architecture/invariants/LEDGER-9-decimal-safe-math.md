---
id: LEDGER-9
group: ledger-pure
severity: high
enforcedBy: pure-code
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/cost/
  - src/lib/transform/
tags:
  - invariant
---

# LEDGER-9 — decimal safe math

> [!danger] Invariant (high, pure-code)
> Decimal-safe math — all volume arithmetic uses centiliter-integer / Prisma.Decimal helpers, never raw parseFloat/IEEE-754 (which would randomly break LEDGER-6).

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/cost/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
