---
id: LEDGER-11
group: ledger-correction
severity: critical
enforcedBy: app-code
verify: "npm run verify:reverse-transform"
decision: "D15"
status: guarded
appliesTo:
  - src/lib/ledger/
  - src/lib/transform/
tags:
  - invariant
---

# LEDGER-11 — conservative correction guard

> [!danger] Invariant (critical, app-code)
> Conservative correction guard — a correction is blocked if any later non-correction op touched the affected (vessel, lot) positions, not merely when enough volume is present.

**Guarded by:** `npm run verify:reverse-transform`
**Decision:** D15 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/ledger/`, `src/lib/transform/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
