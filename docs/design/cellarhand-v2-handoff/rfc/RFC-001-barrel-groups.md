# RFC-001 · Barrel groups as a configurable operational working set

**Status:** proposed · **Owner decision required:** yes (OD-3) · **Blocks:** the topping runner, group settings, group-scoped work orders

---

## 1. User problem

A winery with 8,142 barrels cannot assign, schedule or report work barrel by barrel. Work is assigned to a **rack, a hall row, or a named set** — "top rack 14", "SO₂ the new French oak", "barrel-down 25-PN-04". Today the app has no first-class way to say that, so a 420-barrel topping round becomes either 420 tasks or one task with an opaque vessel list.

The approved design makes the group the **row you browse, the thing you assign, and the place configuration lives**. 8,142 barrels become ~132 browsable objects.

## 2. Current behaviour

`VesselGroup` and `VesselGroupMember` already exist:

```
VesselGroup       tenantId, id, name (unique per tenant), note, isActive, createdAt, members[]
VesselGroupMember tenantId, id, groupId, vesselId  (unique per tenant+group+vessel)
```

And group actions already fan out correctly: `LotOperation.batchId` "groups the per-vessel ops of one group fan-out (D13)", with member-level exceptions surfaced per vessel — the `GroupRackTaskForm` and `GroupMaintenanceTaskForm` flows demonstrate the pattern end to end, including progressive completion and per-member undo.

**This is a good foundation and the RFC does not replace it.**

## 3. Why the existing model is insufficient

| Need | Present today? |
|---|---|
| A stable **order** for walking the members | No. Membership is an unordered set; the runner needs "barrel 10 of 60" |
| Group-level **configuration** (topping interval, source, keg preset, SO₂ target, sampling rule, default crew) | No. Only `name`, `note`, `isActive` |
| A group's **location** (hall, rack) | No |
| A group's **purpose/type** (aging set vs. an ad-hoc maintenance selection) | No |
| **Historical membership** — which barrels were in the group when a round was recorded | No. Membership is current-state only, so a past work order re-reads a changed set |
| **Rollups** (volume, distinct lots, next due) | Derivable, but nothing computes them |
| Whether a vessel may be in **two groups at once** | Undefined |
| **Archival** distinct from deactivation | `isActive` exists but has no defined semantics for open work orders |

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
- Membership is **effective-dated**: `addedAt`, `removedAt` (nullable). A work order recorded on 27 July reads the membership as of 27 July, not as of today. This is the single most important addition — without it, historical rounds silently misreport.
- Removing a barrel from a group never touches its wine, its history or its ledger position.

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

- Moving a barrel between groups is a **membership** change, effective-dated. It is not a wine operation and writes no ledger entry.
- Splitting a group creates two groups and closes the original's memberships at the split date.
- Merging is the inverse. Neither touches lineage.
- If a barrel's *wine* changes (racked out, refilled from a different lot), the barrel stays in the group and the group's distinct-lot count changes. The UI surfaces this; the domain does not resist it.

### 4.9 Correction and undo

Membership changes are correctable by an admin and appear in the group's own history with actor and timestamp. Ledger operations produced by a group action are corrected through the existing `CORRECTION` mechanism, per-member.

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

### 4.13 Migration considerations

- Existing `VesselGroup` rows → `type = OPERATIONAL`, `status` derived from `isActive`.
- Existing `VesselGroupMember` rows → `position` assigned by vessel code natural sort, `addedAt = group.createdAt`, `removedAt = null`.
- No existing row is deleted. No existing behaviour changes until the UI opts in.
- The OD-3 "one operational group per vessel" constraint may find violations in real data. **Do not enforce it in the migration.** Report violations, let an admin resolve them, and enable the constraint afterwards.

## 5. Required UI states

Covered in `02-screen-inventory.md` SC-09: loading, empty (no groups), empty (no members), partial (two wines in one group), saving, validation (duplicate name, vessel already in another operational group), conflict, archive confirmation, and the member drill-down with "+52 more".

## 6. Unresolved decisions

1. **OD-3** — one operational group per vessel, or many? Recommend one, enforced after a reporting pass.
2. Rule-based membership in v1 or v2? Recommend v2, materialised.
3. Does a group's location come from a new field, or from the existing `Location` model? Recommend reusing `Location` if racks are modelled there; a free-text `rackLabel` otherwise.
4. Should `AD_HOC` groups be visible in the group index at all, or only from their work order?

## 7. Acceptance criteria

1. A group can be created with a name, type, location and an ordered member list; the name is unique per tenant.
2. Members have a stable position; reordering persists and drives the runner's "barrel *n* of *N*".
3. A work order recorded on a past date reads the membership **as it was on that date**, verified by a test that adds a barrel after the fact and asserts the historical count is unchanged.
4. Group settings appear as defaults on a generated work order and can be overridden per order without changing the group.
5. A group holding two lots is legal, warns in the UI, and fans out per lot.
6. Archiving a group with open work orders warns and, if confirmed, leaves those orders working.
7. A batch action across 60 members that fails on 3 records the other 57 and names the 3.
8. Every group mutation writes an audit entry with actor and before/after.
9. A vessel from another tenant can never be added — enforced at the database, not only in the app.
10. Rollups are computed and labelled as derived; none is stored.
