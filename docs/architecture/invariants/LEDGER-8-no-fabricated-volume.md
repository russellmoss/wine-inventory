---
id: LEDGER-8
group: ledger-pure
severity: high
enforcedBy: pure-code
verify: "npm run verify:reverse"
decision: "D14"
status: guarded
appliesTo:
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-8 — no fabricated volume

> [!danger] Invariant (high, pure-code)
> No fabricated volume — a residual at/below FUNCTIONAL_ZERO_L (0.01 L) is swept to zero; balances never accumulate dust.

**Guarded by:** `npm run verify:reverse`
**Decision:** D14 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
