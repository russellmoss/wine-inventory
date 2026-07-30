---
id: GROUP-3
group: cellar-group
severity: high
enforcedBy: core
decision: "ADR 0014 / OD-3 second half"
status: guarded
verify: npm run verify:wo-member-snapshot
appliesTo:
  - src/lib/work-orders/
  - src/lib/cellar/
tags:
  - invariant
---

# GROUP-3 — an issued work order's member list is frozen

> [!warning] Invariant (high, core) — IN FORCE
> A work order issued against a `VesselGroup` **snapshots its member list at issue**, and that list
> is immutable thereafter. **No membership edit — add, remove, reorder, split, merge, archive, or
> retroactive admin correction — may change what an already-issued work order covers.** Historical
> reads read the snapshot; there is no as-of query on membership.

**Guarded by:** `npm run verify:wo-member-snapshot` — end to end in Demo Winery, against the REAL
`createWorkOrderCore` / `issueWorkOrderCore`, not the freeze helper in isolation. **The assertion is
stated as an OUTCOME, not a mechanism:** issue a work order against a barrel group, then ADD and
REMOVE a barrel and RENAME the group, and assert the reported member list and per-barrel count come
back byte-identical. A guard that merely checked "a `memberSnapshot` column is non-null" would pass
against a snapshot that silently re-resolved. 17 assertions; shown FAILING before it passed (with the
freeze disabled it reports `ASSERT FAILED: issuing the work order froze the member list`).

**What the phase had to build first (plan 106 F3).** ADR 0014's premise was false against the code:
`WorkOrderTask` had no group reference of any kind, and `resolveGroupMembers` discarded the group's
identity at authoring. A draft therefore read a list frozen when the DRAFT was written, so freezing
again at issue would have changed nothing and this invariant would have been a green check over a
no-op. `WorkOrderTask.vesselGroupId` is the prerequisite; `memberSnapshot` + `memberSnapshotAt` are
the freeze.

**The freeze is once-only at the DATABASE**, via `updateMany ... WHERE memberSnapshotAt IS NULL`, and
the `DRAFT -> ISSUED` flip is likewise a conditional `updateMany` asserting exactly one row. The
pre-existing TOCTOU window in `issueWorkOrderCore` had to be closed in the same change: two
concurrent issues could previously both pass the status guard, which merely doubled reservations
before but would now write two immutable snapshots.

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
