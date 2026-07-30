---
id: GROUP-2
group: cellar-group
severity: high
enforcedBy: schema
decision: "RFC-001 §4.1"
status: planned
appliesTo:
  - src/lib/cellar/
  - src/lib/ledger/
tags:
  - invariant
---

# GROUP-2 — a group is never a vessel and never a lot

> [!warning] Invariant (high, schema) — PLANNED, not yet in force
> A `VesselGroup` holds no volume, has no capacity of its own, appears in no `LotOperationLine`,
> and never appears in `LotLineage`. It is an operational working set, not a ledger position.
> A group action remains one user intent fanned out to member vessels sharing `LotOperation.batchId`.

**Guarded by:** _planned_ — intended guard `npm run verify:group-not-a-vessel`, a schema test
asserting no FK path from `vessel_group` to any ledger line, shaped like
`test/commerce7-schema.test.ts` (which fails if a PII column ever appears).

**Status:** `planned` until the RFC-001 group layer lands. Flip to `guarded` + add `verify:` then.

**Decision:** RFC-001 §4.1 — see [[INVARIANTS]] and [[GROUP-1-one-operational-group-per-vessel]].
**Applies to:** `src/lib/cellar/`, `src/lib/ledger/`

This is the invariant that keeps the group layer from quietly becoming a second, parallel ledger.
It pairs with [[LEDGER-12-one-lot-per-vessel]]: the atomic vessel stays 1:1 with its lot, while the
group above it may *associate* mixed lots without ever holding them.
