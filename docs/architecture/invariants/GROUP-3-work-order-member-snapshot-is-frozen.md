---
id: GROUP-3
group: cellar-group
severity: high
enforcedBy: core
decision: "ADR 0014 / OD-3 second half"
status: planned
appliesTo:
  - src/lib/work-orders/
  - src/lib/cellar/
tags:
  - invariant
---

# GROUP-3 — an issued work order's member list is frozen

> [!warning] Invariant (high, core) — PLANNED, not yet in force
> A work order issued against a `VesselGroup` **snapshots its member list at issue**, and that list
> is immutable thereafter. **No membership edit — add, remove, reorder, split, merge, archive, or
> retroactive admin correction — may change what an already-issued work order covers.** Historical
> reads read the snapshot; there is no as-of query on membership.

**Guarded by:** _planned_ — intended guard `npm run verify:wo-member-snapshot`: issue a work order
against a group, then add AND remove a barrel, and assert the work order's reported member list and
per-barrel count are byte-identical.

**Status:** `planned` until the RFC-001 group layer and the snapshot land. Flip to `guarded` + add
`verify:` as part of that phase's definition of done.

**Decision:** [[0014-work-order-member-snapshot-over-effective-dating]] — owner, 2026-07-29.
**Applies to:** `src/lib/work-orders/`, `src/lib/cellar/`

**Why this exists.** RFC-001 originally proposed effective-dated membership (`addedAt`/`removedAt`)
with historical reads re-deriving as-of the work order's date. Combined with RFC-001 §4.9's
retroactive membership correction, that reproduces exactly the failure
[[SPRAY-2-facts-as-of-snapshot]] forbids: a correction silently repaints what a closed decision
meant. The snapshot makes it **structurally impossible** rather than merely forbidden — which is
strictly stronger than a copy-verbatim rule that correction code has to keep honouring.

**The freeze point is ISSUE, not create.** A `DRAFT` reads live membership (nothing has been
committed to yet). This is only meaningful because Phase 9 (`408f8aa5`) made *issue* a genuinely
separate, deliberate human act — see [[WORKORDER-1-status-machine]].

**Corollary:** `VesselGroupMember` carries **no** `addedAt`/`removedAt`. A membership table that
grows date columns later is the tripwire that this invariant has been quietly abandoned.
