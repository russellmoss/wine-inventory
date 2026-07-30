---
id: GROUP-1
group: cellar-group
severity: high
enforcedBy: database
decision: "OD-3 (RFC-001 §4.2)"
status: guarded
verify: npm run verify:group-membership
appliesTo:
  - src/lib/cellar/
  - prisma/schema.prisma
tags:
  - invariant
---

# GROUP-1 — one operational group per vessel

> [!warning] Invariant (high, database) — IN FORCE
> A vessel belongs to **at most one** `OPERATIONAL` `VesselGroup` at a time. `AD_HOC` group
> membership is unbounded and may overlap freely. Without this, the same barrel can be scheduled
> into two competing topping rounds and double-topped.

**Guarded by:** `npm run verify:group-membership` — a cross-tenant sweep shaped like
`verify:one-lot-per-vessel`, which checks TWO things because the invariant has two halves: the DATA
(no vessel in two `OPERATIONAL` groups, on any tenant) and the STRUCTURE (the partial unique index
and both triggers still exist). Shown FAILING before it passed: dropping the index and inserting the
violation makes it report both, exit 1.

Enforced primarily by a **partial unique index**, `UNIQUE (tenantId, vesselId) WHERE groupType =
'OPERATIONAL'` (`20260730110200_vessel_group_od3_index`). It does not conflict with the existing
`@@unique([tenantId, groupId, vesselId])`: that one forbids the same vessel twice in the SAME group,
this one forbids it in two DIFFERENT operational groups.

**Why the predicate reads `groupType`, not `type`.** RFC-001 §6.1 sketches the index as
`WHERE type = 'OPERATIONAL'`, but `type` lives on `vessel_group` and **a partial index predicate
cannot reference another table**. The resolution is to denormalise the group's type onto the member
row and make TWO TRIGGERS — not application discipline — responsible for keeping it true: a
`BEFORE INSERT OR UPDATE` trigger on the member overwrites whatever the caller supplied with the
group's real type, and an `AFTER UPDATE` trigger on the group propagates a retype to its members. So
the index is enforced against a column no application code can write. **If either trigger is ever
dropped, this invariant is enforced against a lie** — which is why the guard checks for them.

**No `removedAt` clause.** The index is unconditional on membership dates because there are none —
the owner chose the work-order snapshot over effective-dated membership
([[0014-work-order-member-snapshot-over-effective-dating]], 2026-07-29). See
[[GROUP-3-work-order-member-snapshot-is-frozen]].

**Decision:** OD-3 — see [[INVARIANTS]] and RFC-001 §4.2/§4.13.
**Applies to:** `src/lib/cellar/`, `prisma/schema.prisma`

Enforceable from day one: 0 groups and 0 memberships exist on any of 11 tenants, so there are no
violations to resolve first. Rollback is `DROP INDEX` — no data change.
