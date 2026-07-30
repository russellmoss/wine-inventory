---
id: GROUP-2
group: cellar-group
severity: high
enforcedBy: pure-code
decision: "RFC-001 §4.1"
status: guarded
verify: npm run verify:group-not-a-vessel
appliesTo:
  - src/lib/cellar/
  - src/lib/ledger/
tags:
  - invariant
---

# GROUP-2 — a group is never a vessel and never a lot

> [!warning] Invariant (high, pure-code) — IN FORCE
> A `VesselGroup` holds no volume, has no capacity of its own, appears in no `LotOperationLine`,
> and never appears in `LotLineage`. It is an operational working set, not a ledger position.
> A group action remains one user intent fanned out to member vessels sharing `LotOperation.batchId`.

**Guarded by:** `npm run verify:group-not-a-vessel`, **derived from `Prisma.dmmf` rather than from
a hand-written list**. A hand-list is a list someone has to remember to extend, and the whole failure
mode here is a well-meaning future migration adding `volumeL` to `vessel_group` or `vesselGroupId` to
`lot_operation_line`. Same posture as `test/commerce7-schema.test.ts`, which fails if a PII column
ever appears. It checks four things: the group carries no physical quantity; the membership row stays
a pure association (no volume, no lot, and **no `addedAt`/`removedAt`**); no ledger model references
a group by relation OR by a bare scalar id (this repo's cross-tenant FKs are raw SQL, so a reference
can exist with no Prisma relation); and the group's own relations stay confined to `members`.

Structural, so it needs no database connection — which also makes it the one guard here that cannot
report a false clean because of RLS. Shown FAILING before it passed: adding `VesselGroup.volumeL` and
`VesselGroupMember.addedAt` makes it report both, exit 1.

**Decision:** RFC-001 §4.1 — see [[INVARIANTS]] and [[GROUP-1-one-operational-group-per-vessel]].
**Applies to:** `src/lib/cellar/`, `src/lib/ledger/`

This is the invariant that keeps the group layer from quietly becoming a second, parallel ledger.
It pairs with [[LEDGER-12-one-lot-per-vessel]]: the atomic vessel stays 1:1 with its lot, while the
group above it may *associate* mixed lots without ever holding them.
