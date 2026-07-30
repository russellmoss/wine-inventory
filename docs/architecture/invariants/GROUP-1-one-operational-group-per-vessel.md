---
id: GROUP-1
group: cellar-group
severity: high
enforcedBy: db
decision: "OD-3 (RFC-001 §4.2)"
status: planned
appliesTo:
  - src/lib/cellar/
  - prisma/schema.prisma
tags:
  - invariant
---

# GROUP-1 — one operational group per vessel

> [!warning] Invariant (high, db) — PLANNED, not yet in force
> A vessel belongs to **at most one** `OPERATIONAL` `VesselGroup` at a time. `AD_HOC` group
> membership is unbounded and may overlap freely. Without this, the same barrel can be scheduled
> into two competing topping rounds and double-topped.

**Guarded by:** _planned_ — intended guard `npm run verify:group-membership`, a cross-tenant sweep
shaped like the existing `verify:one-lot-per-vessel`. Enforced primarily by a **partial unique
index**: `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'`. This does not conflict with the
existing `@@unique([tenantId, groupId, vesselId])` (`prisma/schema.prisma:3086`).

**Status:** `planned` because the `type` column does not exist yet (RFC-001 migration M2/M3).
Flip to `guarded` + add `verify:` **as part of the definition of done** for that phase.

**Decision:** OD-3 — see [[INVARIANTS]] and RFC-001 §4.2/§4.13.
**Applies to:** `src/lib/cellar/`, `prisma/schema.prisma`

Enforceable from day one: 0 groups and 0 memberships exist on any of 11 tenants, so there are no
violations to resolve first. Rollback is `DROP INDEX` — no data change.
