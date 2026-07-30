# ADR 0014 — A work order freezes its barrel list at issue; membership is not effective-dated

- **Date:** 2026-07-29
- **Status:** accepted
- **Decided by:** the owner, 2026-07-29 — *"do the worksheet approach."*
- **Invariant:** [[GROUP-3-work-order-member-snapshot-is-frozen]] · relates to [[SPRAY-2-facts-as-of-snapshot]]
- **RFC:** `docs/design/cellarhand-v2-handoff/rfc/RFC-001-barrel-groups.md` §4.3.1
- **Supersedes:** RFC-001 §4.3's effective-dated membership proposal

## Context

Work in a barrel hall is assigned to a rack, not to individual barrels. Barrels move between racks
over a season. So: when you open a topping round recorded last month, and a barrel has since moved,
what should last month's record say?

RFC-001 answered with **effective-dated membership** — `addedAt`/`removedAt` on
`VesselGroupMember`, with historical reads re-deriving the member list as-of the work order's date.
It called this *"the single most important addition — without it, historical rounds silently
misreport."* The requirement is right. The mechanism was the problem.

**The collision.** RFC-001 §4.9 *also* allows an admin to correct membership retroactively. Combine
that with as-of re-derivation and an admin fixing a mis-dated membership row **silently changes what
a closed work order covered**. That is precisely the failure mode `SPRAY-2` (severity `critical`)
exists to forbid:

> *"A correction COPIES the predecessor's snapshot VERBATIM… Re-resolving on correction would
> repaint a July spray with November's registration data. A monthly reference refresh must never
> silently change what a past decision meant."*
> — [`SPRAY-2-facts-as-of-snapshot.md:18-24`](docs/architecture/invariants/SPRAY-2-facts-as-of-snapshot.md:18)

**Why this needed the owner rather than a ruling from the schema.** Effective-dating is not banned
here as a matter of house style — bond affiliation is deliberately derived point-in-time from ledger
lines rather than snapshotted ([`schema.prisma:2706-2712`](prisma/schema.prisma:2706)). So the
question was genuinely open, and the RFC author's "most important addition" framing suggested a use
case the schema did not reveal.

The deciding question turned out to be answerable in one sentence: **do you ever need to ask "where
was this barrel back then?" as a question in its own right, or do you only ever care what a given
job covered?** The owner: only the job.

## Decision

**A work order freezes its member list when it is ISSUED. Membership carries no dates.**

- `VesselGroupMember` gains `position` and a composite tenant FK. It does **not** gain
  `addedAt`/`removedAt`.
- The snapshot is taken at **issue**, not at create. A `DRAFT` work order reads **live** membership,
  because nothing has been committed to yet. The frozen list is immutable thereafter.
- Historical reads read the snapshot. There is no as-of query anywhere.
- "When did barrel 14 join rack 9?" is answered from the **audit log**, which RFC-001 §4.11 already
  requires for every membership change with actor and before/after.
- The OD-3 partial unique index simplifies to `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'`
  — no `removedAt IS NULL` clause, because there is no `removedAt`.

**Issue is the right freeze point because it is now a real act.** Phase 9 (shipped as `408f8aa5`)
made *issue* a deliberate, separate, human step — the assistant only ever produces a `DRAFT` and
hands the user to the builder, enforced structurally by `test/assistant-never-issues.test.ts`. So
there is a named person and a specific moment at which the worksheet is printed. Had this decision
been taken before Phase 9, "issue" would have been a fiction and the freeze point arbitrary.

## Consequences

**Good:**

- **Retroactive repainting is structurally impossible, not merely forbidden.** No membership edit
  can alter any issued work order, so RFC-001 §4.9 needs no guard at all — the shape prevents it.
  This is strictly stronger than SPRAY-2's copy-verbatim rule, which relies on correction code
  doing the right thing.
- **Simpler migration.** Two fewer columns, and no `removedAt IS NULL` in the partial unique index.
- **No as-of query on any historical read**, forever.
- **RFC-001 AC-3 passes more strongly.** The restated criterion — a closed work order reports the
  same list after a barrel is added *and* removed — is satisfied by construction.

**Costs, accepted knowingly:**

- **Membership history stops being a queryable structure.** Recovering "which barrels were in rack
  14 on 3 March" means reading the audit log forward. Recoverable, but awkward — and if a dispute or
  an audit ever needs it routinely, this decision is the thing to revisit.
- **Snapshot storage per work order.** Small, and it is a list of vessel ids.
- **A defined answer is needed for edge cases the dated model handled implicitly:** a work order
  issued, then the group is split (§4.8) — the snapshot stands and stays valid; a work order issued
  against an archived group — the snapshot stands. Both are improvements, but they must be stated
  rather than inherited.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Effective-dated membership (RFC-001 §4.3 as written) | Collides with §4.9's retroactive correction to produce the `SPRAY-2` failure. Buys standalone membership-history queries that nobody needs here. |
| Effective-dating **plus** a guard forbidding correction of any membership row referenced by a closed work order | Workable, but it defends by rule what the snapshot defends by shape — and the rule lives in correction code that must keep remembering. More moving parts for a capability that was not wanted. |
| Snapshot at **create** rather than at issue | A draft is a proposal; freezing it before a human commits means editing a draft's group can't refresh its list, which is surprising. Issue is the commitment point. |

## Confidence

**High** on the decision matching the stated need — the owner answered the crux question directly,
and the requirement (a closed job must not change) is satisfied more strongly than under the
alternative.

**Medium** on the edge cases. Split/merge and archive interactions with an outstanding snapshot are
stated above but not exhaustively specified, and a `DRAFT` that sits for weeks while its group
changes underneath it is a real scenario whose UX has not been designed. **That is plan-review work
for Phase 7, not a reason to reopen this decision.**
