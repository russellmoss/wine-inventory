# RFC-001 · Barrel groups as a configurable operational working set

**Status:** proposed · **Owner decisions:** OD-3 recommended one-operational-group · OD-3 second half ✅ RESOLVED 2026-07-29 (**work-order snapshot**, ADR 0014) · **Blocks:** the topping runner, group settings, group-scoped work orders

> [!note] Changelog
> **2026-07-29 — RFC amendment pass, against `main` @ `91cd1dcd`.** Amended to be implementable
> against the code that exists. This RFC remains **`proposed`**; the amendment does not approve it.
> - **§1 rewritten.** The stated user problem ("a winery with 8,142 barrels") is **false for this
>   tenant** — Bhutan Wine Co. has 22 barrels, and `vessel_group`/`vessel_group_member` have never
>   held a row on any of 11 tenants. §1 now states the real numbers and §3 classifies each gap as
>   needed-now / needed-at-scale / needed-regardless. The scale machinery is kept, but labelled
>   honestly as built ahead of the customer.
> - **§4.3 membership demoted from a decision to an open owner question.** Effective-dating
>   conflicts with invariant `SPRAY-2`; a work-order member snapshot is the alternative. Both are
>   presented; **this RFC no longer picks.** It previously called effective-dating "the single most
>   important addition" — that framing is withdrawn pending the owner.
> - **§4.13's "do not enforce it in the migration" deleted** — it was prudence against unknown
>   data, and the data is now known to be empty. Carrying it forward buys nothing.
> - **§4.12 gains the missing migration step**: `VesselGroup` has no `@@unique([tenantId, id])`,
>   so the composite tenant FK it specifies has no target yet.
> - **AC-3 restated** so it does not presuppose the effective-dating answer.
>
> **2026-07-29 (later the same day) — OWNER DECISION RECORDED.** The owner answered the §4.3.1
> question: **"do the worksheet approach"** — a work order freezes its member list at **issue**;
> membership is **not** effective-dated. `addedAt`/`removedAt` drop out of the migration, the OD-3
> partial index loses its `removedAt` clause, and §4.8/§4.9 are restated in snapshot terms. The
> retroactive-repaint hazard §4.9 carried is now **structurally impossible** rather than guarded.
> Recorded as **ADR 0014** + invariant **GROUP-3**.

---

## 1. User problem

> [!warning] The 8,142-barrel framing was wrong, and it mattered.
> This section previously opened: *"A winery with 8,142 barrels cannot assign, schedule or report
> work barrel by barrel."* **No such winery is on this system.** Measured read-only against
> production on 2026-07-29 (`91cd1dcd`), across all 11 tenants:
>
> | Measurement | Value |
> |---|---|
> | Barrels, Bhutan Wine Co. (the real tenant) | **22** |
> | Barrels, all 11 tenants combined | **28** |
> | Vessels, all tenants | 76 |
> | `vessel_group` rows, ever, any tenant | **0** |
> | `vessel_group_member` rows, ever, any tenant | **0** |
> | `lot_operation` rows of type `TOPPING`, ever | **0** |
>
> The 8,142 figure and the "420-barrel topping round" are **design targets, not observations.**
> Writing them as the user problem made a greenfield domain design read as an urgent migration of
> live data, which is the opposite of the truth: there is no data to migrate and nothing in it to
> contradict a wrong design. That inversion is the single biggest reason to read this RFC slowly.

**The real user problem, stated at 22 barrels.** Work in a barrel hall is assigned to a **rack, a
hall row, or a named set** — "top rack 14", "SO₂ the new French oak" — not barrel by barrel. That
is true at 22 barrels and at 8,142; only the cost of getting it wrong scales. Today the app has no
first-class way to say it, so even a 22-barrel topping round becomes either 22 tasks or one task
with an opaque vessel list. `VesselGroup` exists but is too thin to carry a round (§2, §3).

**What scale changes, and what it does not.** At 22 barrels the grouping layer is a *convenience*
and a *correctness* device. At 8,142 it becomes the only way to browse the estate at all —
8,142 barrels become ~132 browsable objects. **Both framings are legitimate; only the second is
speculative.** Build the group layer because a 22-barrel round needs it and because the audit trail
needs it (§3), and accept the scale headroom as a by-product — not the other way round.

## 2. Current behaviour

`VesselGroup` and `VesselGroupMember` already exist:

```
VesselGroup       tenantId, id, name (unique per tenant), note, isActive, createdAt, members[]
VesselGroupMember tenantId, id, groupId, vesselId  (unique per tenant+group+vessel)
```

And group actions already fan out correctly: `LotOperation.batchId` "groups the per-vessel ops of one group fan-out (D13)", with member-level exceptions surfaced per vessel — the `GroupRackTaskForm` and `GroupMaintenanceTaskForm` flows demonstrate the pattern end to end, including progressive completion and per-member undo.

**This is a good foundation and the RFC does not replace it.**

## 3. Why the existing model is insufficient

Each gap is now classified against the **real** estate (22 barrels), because "we need this" and
"we will need this" are different claims and this RFC previously merged them:

- **(a) needed at 22 barrels** — a 22-barrel round is worse without it, today.
- **(b) needed only at scale** — genuine headroom. Build it if it is nearly free; do not justify
  it with a customer we do not have.
- **(c) needed regardless** — it protects the **audit trail**, and that argument is independent of
  barrel count. A wrong record of what happened is wrong at 22 barrels and at 8,142.

| Need | Present today? | Class | Why that class |
|---|---|---|---|
| **Historical membership** — which barrels were in the group when a round was recorded | No. Membership is current-state only, so a past work order re-reads a changed set | **(c)** | **The load-bearing one.** Move a barrel between racks today and a work order from last month silently changes what it says it did. That is a falsified record, not a missing feature, and it is equally false at any barrel count. See §4.3.1 — resolved 2026-07-29 by a work-order snapshot (ADR 0014). |
| Whether a vessel may be in **two groups at once** | Undefined | **(c)** | An undefined answer means the same barrel can be scheduled into two competing topping rounds and double-topped. A correctness gap, not an ergonomics one. This is OD-3. |
| Group-level **configuration** (topping interval, source, keg preset, SO₂ target, sampling rule, default crew) | No. Only `name`, `note`, `isActive` | **(a)** | A 22-barrel round still needs a source keg and an interval to generate from. Without it every round is hand-configured. |
| A stable **order** for walking the members | No. Membership is an unordered set; the runner needs "barrel 10 of 22" | **(a)** | An unordered set means a crew that breaks off mid-round cannot resume deterministically. Bites at 22; is fatal at 420. |
| **Archival** distinct from deactivation | `isActive` exists but has no defined semantics for open work orders | **(a)** | Cheap, and `isActive` today has genuinely undefined behaviour against open work orders — an ambiguity, not a scale problem. |
| A group's **purpose/type** (aging set vs. an ad-hoc maintenance selection) | No | **(a)** | Required for OD-3 to be *expressible* at all: the constraint is "one `OPERATIONAL` group", which needs the column. Falls out of (c) above. |
| A group's **location** (hall, rack) | No | **(b)** | With 22 barrels in one room, location is not how anyone finds a barrel. Real at 8,142. |
| **Rollups** (volume, distinct lots, next due) | Derivable, but nothing computes them | **(b)** | At 22 barrels a person can read the list. Cheap to add, so take it — but it is headroom, not need. |

**Summary: two (c), four (a), two (b).** Nothing here is justified *only* by 8,142 barrels, which
is the useful result — the RFC survives its own corrected premise. The honest reading is that this
layer earns its place on **audit integrity and round mechanics**, and the scale story is a bonus.

**Do not delete the scale machinery** (ordering, rollups, the "+52 more" drill-down). It is
designed, it is cheap, and building it later means reopening the same tables. Label it as what it
is: **built ahead of the customer, deliberately.**

## 4. Proposed behaviour

### 4.1 What a group is — and is not

- A group **is** an operational working set of vessels with a name, a purpose, an order, a location and a set of defaults.
- A group **is not** a physical vessel. It has no capacity of its own and no ledger position.
- A group **is not** a wine lot. It commonly holds one lot, but it may hold two or three, and that is legal — the UI warns and work orders fan out per wine.
- A **batch action** remains one user intent fanned out to member vessels sharing `LotOperation.batchId`. Unchanged.
- **Lineage** is unaffected. Groups never appear in `LotLineage`.

### 4.2 Group type

| Type | Meaning | Membership |
|---|---|---|
| `OPERATIONAL` | The durable working set — a rack, a hall row, an aging set. This is what work is assigned to. | A vessel belongs to **at most one** at a time (recommended answer to OD-3) |
| `AD_HOC` | A transient selection for one job ("these 12 need topping early") | Unlimited overlap; auto-archives when its work order closes |

Existing rows migrate to `OPERATIONAL`.

### 4.3 Membership lifecycle

- **Manual** membership at minimum. **Rule-based** membership (e.g. "every barrel in Hall C rack 14") is desirable but should be a *materialised* set with a stated rule, not a live query — otherwise a past work order changes meaning when a barrel moves. Recommend: manual in v1, rules in v2.
- Membership carries a **position** (`Int`) giving the walk order. Positions are per group, contiguous, and reorderable.
- Removing a barrel from a group never touches its wine, its history or its ledger position.
- **Historical membership is preserved by a work-order snapshot taken at issue** — not by dating
  the membership rows. Owner decision, 2026-07-29; see §4.3.1 and ADR 0014.

#### 4.3.1 ✅ RESOLVED — the work order carries a member snapshot (Option B)

> [!success] OWNER DECISION, 2026-07-29: **"do the worksheet approach."**
> **A work order freezes its member list when it is issued.** Effective-dated membership
> (`addedAt`/`removedAt`) is **NOT** built. See **ADR 0014**.
>
> Consequences, now binding on the migration:
> - `addedAt` / `removedAt` **drop out of M2 entirely.** `VesselGroupMember` gains `position` and
>   the composite tenant FK, nothing else.
> - The OD-3 partial unique index simplifies to
>   `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'` — **no `removedAt IS NULL` clause**,
>   because there is no `removedAt`.
> - §4.8 (splits/merges) and §4.9 (retroactive correction) are restated below in snapshot terms.
> - "When did barrel 14 join rack 9?" is answered from the **audit log** (§4.11), which already
>   records every membership change with actor and before/after — not from the membership table.
>
> The original text read: *"Membership is **effective-dated**… This is the single most important
> addition."* That framing is **withdrawn**. Both options are preserved below because the reasoning
> matters if this is ever revisited.

**The requirement both options satisfy.** A work order recorded on 27 July must report the
membership *as it was on 27 July*, and must keep doing so after barrels move.

**Option A — effective-dated membership** (`addedAt`, `removedAt` on `VesselGroupMember`).
A historical read re-derives the member list by querying membership as-of the work order's date.

- ✅ One mechanism serves every historical question, not just work orders.
- ✅ Membership history is queryable in its own right ("when did barrel 14 join rack 9?").
- ⚠️ **Collides with `SPRAY-2` (severity `critical`).** §4.9 of this RFC also lets an admin
  *correct membership retroactively*. Those two together are exactly the failure mode SPRAY-2
  exists to forbid:
  > *"A correction COPIES the predecessor's snapshot VERBATIM… Re-resolving on correction would
  > repaint a July spray with November's registration data. A monthly reference refresh must never
  > silently change what a past decision meant."*
  > — [`SPRAY-2-facts-as-of-snapshot.md:18-24`](docs/architecture/invariants/SPRAY-2-facts-as-of-snapshot.md:18)

  Under Option A, an admin fixing a mis-dated membership row silently changes what a **closed**
  work order covered. Re-deriving repaints history; that is the precedent.
- ⚠️ Every historical read pays an as-of query, forever.

**Option B — member-list snapshot on the work order.** The work order freezes its member list when
it is **issued**; historical reads read the snapshot.

- ✅ Retroactive repainting is **structurally impossible**, not merely forbidden.
- ✅ Needs no `removedAt` semantics and no as-of query on any historical read.
- ✅ Matches the pattern this codebase already treats as `critical` (SPRAY-2), and pairs naturally
  with Phase 9's now-shipped separation of *create* from *issue* — issue is the freeze point.
- ⚠️ Answers **only** the work-order question. "When did barrel 14 join rack 9?" needs an audit-log
  read instead (§4.11 already writes one), which is a weaker query surface.
- ⚠️ Snapshot storage per work order, and a defined answer for what a **DRAFT** work order shows
  (proposal: a draft reads live membership; the freeze happens at issue).

**How it was decided.** The question put to the owner was: *do you ever need to ask "where was this
barrel back then?" as a question in its own right, or do you only ever care what a given job
covered?* The answer was the latter — **"do the worksheet approach."** Option A's standalone
membership-history query is capability nobody needs, bought at the price of a closed work order that
can be silently repainted. That is a bad trade, and the owner made it explicitly rather than
inheriting it.

**Where the freeze happens.** At **issue**, not at create. This lands cleanly on top of Phase 9
(shipped as `408f8aa5`), which made *issue* a genuinely separate, deliberate human act — the
assistant now only ever produces a `DRAFT` and hands the user to the builder. So there is a real
moment, performed by a named person, at which the worksheet is printed. A `DRAFT` work order reads
**live** membership (it has not been committed to yet); the snapshot is taken when the human presses
*Issue*, and is immutable thereafter.

**What this forecloses, stated honestly.** Standalone membership history as a *queryable* structure.
Recovering "which barrels were in rack 14 on 3 March" means reading the audit log forward, which is
a weaker surface than a table query. If that ever becomes a real need — a dispute, an audit — it is
recoverable but awkward. **That is the accepted cost.** Note it does *not* affect work orders, which
carry their own answer.

### 4.4 Group-level vs. member-level properties

| Group-level | Member-level |
|---|---|
| name, type, note, location (hall/rack), status | vessel identity, cooperage, oak, year, toast |
| topping interval, topping source vessel, keg preset | last topped, individual notes and flags |
| SO₂ target, sampling rule, default crew | per-barrel exceptions on a batch action |
| default work-order template | position in the group |

Group settings are **defaults for generated work orders**, never a live constraint on what a person may do. A cellar hand can always top a barrel outside its interval.

### 4.5 Status and archival

`ACTIVE` → `ARCHIVED`. Archiving hides the group from pickers and indexes, keeps all history, and does not affect open work orders that already reference it. A group with open work orders warns before archiving. Existing `isActive: false` maps to `ARCHIVED`.

### 4.6 Rollups

Computed, never stored: member count, distinct lots, summed volume (from member `VesselLot`), oldest last-topped date, next due date (last topped + interval), open work-order count. Each must state its derivation in the UI — a group volume is a sum of *derived* barrel volumes, not a measurement.

### 4.7 Partial completion and member exceptions

Already solved by the existing fan-out: per-member records, progressive completion, member-level errors surfaced individually. Preserve it exactly. A group action that fails on 3 of 60 members reports those 3 by name and records the other 57.

### 4.8 Transfers in and out, splits and merges

- Moving a barrel between groups is a **membership** change. It is not a wine operation and writes no ledger entry. *(Amended 2026-07-29: "effective-dated" removed — §4.3.1 Option B. The move rewrites current membership and writes an audit entry; already-issued work orders are unaffected because they carry their own frozen list.)*
- Splitting a group creates two groups and **reassigns** the original's memberships between them. *(Amended: was "closes the original's memberships at the split date" — there are no dated memberships to close. Work orders already issued against the original keep their snapshot and stay valid.)*
- Merging is the inverse. Neither touches lineage.
- If a barrel's *wine* changes (racked out, refilled from a different lot), the barrel stays in the group and the group's distinct-lot count changes. The UI surfaces this; the domain does not resist it.

### 4.9 Correction and undo

Membership changes are correctable by an admin and appear in the group's own history with actor and timestamp. Ledger operations produced by a group action are corrected through the existing `CORRECTION` mechanism, per-member.

> [!success] Amended 2026-07-29 — the hazard here is now structurally gone.
> This clause was the dangerous half of the effective-dating proposal: an admin correcting a
> membership row retroactively would have silently changed what a **closed** work order covered
> (the `SPRAY-2` failure mode). **Under the snapshot decision (§4.3.1) that is impossible** — a
> membership correction touches only current membership and the audit trail. **No issued work order
> can be altered by any membership edit, ever.** Nothing needs guarding here; the shape prevents it.

### 4.10 Permissions

| Act | Role |
|---|---|
| View groups and members | any authenticated user in the tenant |
| Record work against a group | `user` |
| Create / rename / archive a group, edit settings, edit membership | `admin` |

### 4.11 Audit

Every group create/rename/archive, settings change and membership change writes an `AuditLog` entry with the actor, the group and the before/after. Membership changes are the ones most likely to be questioned later.

### 4.12 Tenant isolation

Everything is tenant-scoped exactly as the existing models are: `tenantId` on both tables, composite uniques, RLS policies matching the established pattern. A group may never contain a vessel from another tenant; enforce with a composite FK `(tenantId, vesselId) → vessel(tenantId, id)` in raw SQL, matching the Phase-12 checklist.

> [!warning] Missing migration step this RFC did not name.
> The FK target for the *vessel* side exists — `Vessel` carries `@@unique([tenantId, id])`
> ([`schema.prisma:1413`](prisma/schema.prisma:1413)). But **`VesselGroup` does not**: its only
> composite unique is `@@unique([tenantId, name])`
> ([`schema.prisma:3073`](prisma/schema.prisma:3073)). So the Phase-12 checklist **step 5** FK from
> `vessel_group_member` back to its group — `(tenantId, groupId) → vessel_group(tenantId, id)` —
> **has no unique target and cannot be created** until `@@unique([tenantId, id])` is added to
> `VesselGroup`. Cheap, but it must be in the structural migration or the FK fails while being
> written. Verified on `91cd1dcd`.

### 4.13 Migration considerations

- Existing `VesselGroup` rows → `type = OPERATIONAL`, `status` derived from `isActive`.
- Existing `VesselGroupMember` rows → `position` assigned by vessel code natural sort.
  **No `addedAt`/`removedAt`** — the owner chose the work-order snapshot (§4.3.1, ADR 0014).
- No existing row is deleted. No existing behaviour changes until the UI opts in.
- **The OD-3 constraint is enforced immediately, in the migration.**

> [!note] Amended 2026-07-29 — dead caution deleted.
> This bullet previously read: *"The OD-3 'one operational group per vessel' constraint may find
> violations in real data. **Do not enforce it in the migration.** Report violations, let an admin
> resolve them, and enable the constraint afterwards."* That was prudence against **unknown** data.
> The data is now known: **0 groups, 0 memberships, 0 vessels in 2+ groups, on all 11 tenants**
> (§1, re-verified read-only on `91cd1dcd`). There is nothing to report and nobody to ask.
>
> A "report, don't enforce" phase here buys **nothing** and costs a second migration plus a window
> in which the constraint is documented but not true. Enforce from day one. The rollback is
> `DROP INDEX` — the cheapest rollback in the whole set, which is precisely why enforcing now is
> the safe choice rather than the bold one.

## 5. Required UI states

Covered in `02-screen-inventory.md` SC-09: loading, empty (no groups), empty (no members), partial (two wines in one group), saving, validation (duplicate name, vessel already in another operational group), conflict, archive confirmation, and the member drill-down with "+52 more".

## 6. Unresolved decisions

1. **OD-3** — one operational group per vessel, or many? Recommend one, **enforced immediately**
   (0 violations exist — §4.13). Expressible as a partial unique index
   `UNIQUE (tenantId, vesselId) WHERE type = 'OPERATIONAL'`, which does not conflict with the
   existing `@@unique([tenantId, groupId, vesselId])`
   ([`schema.prisma:3086`](prisma/schema.prisma:3086)).
1b. ~~**OD-3, second half** — effective-dated membership, or a work-order member snapshot?~~
   ✅ **RESOLVED 2026-07-29 by the owner: the work-order snapshot.** See §4.3.1 and **ADR 0014**.
   `addedAt`/`removedAt` are not built. **No longer blocking.**
2. Rule-based membership in v1 or v2? Recommend v2, materialised.
3. Does a group's location come from a new field, or from the existing `Location` model? Recommend reusing `Location` if racks are modelled there; a free-text `rackLabel` otherwise.
4. Should `AD_HOC` groups be visible in the group index at all, or only from their work order?

## 7. Acceptance criteria

1. A group can be created with a name, type, location and an ordered member list; the name is unique per tenant.
2. Members have a stable position; reordering persists and drives the runner's "barrel *n* of *N*".
3. **A closed work order reports the same member list before and after a barrel is moved into or
   out of its group** — verified by a test that records a round, then adds *and* removes a barrel,
   then asserts the work order's reported membership and per-barrel count are byte-identical.
   *(Restated 2026-07-29: the criterion is now stated as an outcome, so it passes under either
   §4.3.1 option rather than presupposing effective-dating. It is strictly stronger than the
   original — the original only tested addition.)*
4. Group settings appear as defaults on a generated work order and can be overridden per order without changing the group.
5. A group holding two lots is legal, warns in the UI, and fans out per lot.
6. Archiving a group with open work orders warns and, if confirmed, leaves those orders working.
7. A batch action across 60 members that fails on 3 records the other 57 and names the 3.
8. Every group mutation writes an audit entry with actor and before/after.
9. A vessel from another tenant can never be added — enforced at the database, not only in the app.
10. Rollups are computed and labelled as derived; none is stored.
