---
id: LEDGER-7
group: ledger-pure
severity: critical
enforcedBy: pure-code
verify: "scripts/verify-projection.ts"
decision: "D4"
status: guarded
appliesTo:
  - src/lib/ledger/
tags:
  - invariant
---

# LEDGER-7 — projection equals fold

> [!danger] Invariant (critical, pure-code)
> Projection == fold of the ledger — VesselLot always equals foldLines() over full history; any drift is a bug, not a tolerated state.

**Guarded by:** `scripts/verify-projection.ts`
**Decision:** D4 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
