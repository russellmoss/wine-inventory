# Plan 106 — Cellarhand v2 Phase 7: barrel groups (RFC-001) + the M1 enum migration

- **Date:** 2026-07-30
- **Type:** feat
- **Depth:** Deep — 12 units across 4 PRs
- **Read against:** `main` @ `91cd1dcd` (verified by SHA before any citation below)
- **RFCs:** RFC-000 §1–§4, RFC-001 · **ADRs:** 0014 (binding), 0013 (context only)
- **Invariants introduced/flipped:** GROUP-1, GROUP-2, GROUP-3

> [!danger] Read this box before anything else.
> **The documents this plan is built on are not on `main`.** RFC-000, ADR 0013, ADR 0014 and the
> GROUP-1/2/3 invariant notes exist **only** on `claude/cellarhand-v2-rfc-amendment-d7ffd2`, open as
> **PR #567**. The `RFC-001-barrel-groups.md` currently on `main` is the *pre-amendment* text — it
> still specifies effective-dated membership (§4.3) and still says *"Do not enforce it in the
> migration"* (§4.13), i.e. the exact two things this phase reverses.
>
> **PR #567 must merge before Unit 2.** Until it does, an implementer reading `main` will build the
> superseded design, and `verify:invariants` has no GROUP notes to flip. Unit 1 (M1) does not depend
> on it and can proceed in parallel.

---

## 1. Problem frame

Work in a barrel hall is assigned to a rack or a named set, not barrel by barrel. `VesselGroup` and
`VesselGroupMember` have existed since the ledger spine but carry only `name`, `note`, `isActive` —
no order, no type, no location, no settings, no defined answer to whether a vessel can be in two
groups at once. This phase makes the group a real operational object, and makes an **issued work
order's barrel list permanent**.

**Honest sizing.** Production today: 11 tenants, **76 vessels, 28 barrels, 0 groups, 0 memberships**
(re-queried read-only 2026-07-30 — every RFC-000 §2 number holds). The 8,142-barrel framing in the
original handoff was a design target, not an observation. This layer earns its place on **audit
integrity** and **round mechanics**, not scale. Build the scale headroom because it is nearly free,
and label it as built ahead of the customer.

**What the pressure test surfaced.** The premise is right, but the *stated mechanism* is not
implementable as written — see §2 finding F3. That is the substance of this plan.

---

## 2. Findings — where the RFCs and the real code disagree

The brief predicted a sixth error. There are thirteen. F3 is the one that changes the shape of the
phase; F13 was found **while building M1** and is the one this plan itself got wrong. The rest are
corrections, traps, or cheap cleanups.

### F1 · The canonical docs are unmerged (blocking)
RFC-000, ADR 0013/0014, GROUP-1/2/3 exist only in open PR #567. See the box above. **Blocking for
Unit 2+.**

### F2 · `work_order` is NOT empty — RFC-000 §2's governing claim is too broad
RFC-000 §2 states *"Every table these RFCs touch is EMPTY."* False. Production holds **73 work
orders** (40 `CANCELLED`, 32 `APPROVED`, 1 `ISSUED`) and **106 work-order tasks**. RFC-000's
narrower per-row claim ("0 rows to snapshot") is true, but the blanket sentence is the kind that
leads someone to write `SET NOT NULL` on a live table. **Every column this phase adds to
`work_order_task` must be nullable. No `SET NOT NULL` anywhere in M2/M3.**

### F3 · The snapshot has nothing to snapshot from — ADR 0014's premise is false against the code
**This is the finding that resizes the phase.** ADR 0014 and GROUP-3 both rest on: *"A `DRAFT` work
order reads **live** membership; the snapshot is taken at issue."*

Against `91cd1dcd`, none of that is true:

- `WorkOrderTask` has **no group reference of any kind** — no `vesselGroupId`, no FK, no join table.
  Verified across the whole schema; the only group models are `VesselGroup`
  ([schema.prisma:3064](prisma/schema.prisma:3064)) and `VesselGroupMember` ([:3078](prisma/schema.prisma:3078)),
  and nothing in the work-order cluster references either.
- `resolveGroupMembers` ([nl-resolve.ts:156](src/lib/work-orders/nl-resolve.ts:156)) returns
  `ResolvedVesselState[]` and **never returns the group's id or name**. The group's identity is
  discarded at authoring.
- The member list is written into `plannedPayload.groupRack` / `plannedPayload.groupActivity` as bare
  id + code arrays. `group-activity.ts:6` states the tradeoff deliberately: *"The member set is
  stored ONLY in JSON (no columns, no join table…)"*.

So a draft does **not** read live membership — it reads a list frozen when the draft was authored.
Freezing again "at issue" would therefore change nothing, and GROUP-3 would be a green check over a
no-op.

**Consequence:** implementing GROUP-3 honestly requires *first* persisting group identity on the
task, *then* making a DRAFT re-resolve from it, *then* freezing at issue. That is Unit 5 + Unit 6,
not a column. RFC-000 M2's one-line `work_order += member snapshot` hides an entire unit.

### F4 · The snapshot belongs on the TASK, not on `work_order`
RFC-000 M2 puts the snapshot on `work_order`. Group membership is **per task** — one work order can
carry several group tasks against different groups (`groupSeq` sequencing exists precisely to run
several task groups). A single `WorkOrder`-level column cannot represent that. Snapshot goes on
`WorkOrderTask`.

### F5 · `ON DELETE RESTRICT` on the composite FK contradicts the existing FK and the house rule
RFC-000 §2 specifies the new composite FK `(tenantId, groupId) → vessel_group(tenantId, id)` as
`ON DELETE RESTRICT`. But `vessel_group_member_groupId_fkey` has been **`ON DELETE CASCADE`** since
[the ledger-spine migration:193](prisma/migrations/20260627110318_lot_ledger_spine/migration.sql:193),
and the house convention is that a composite tenant FK **matches** its scalar sibling's delete rule
(`vessel_lot → vessel` CASCADE; `blend_trial_component → blend_trial` — the identical parent/child
shape — CASCADE). Postgres evaluates every FK, so a `RESTRICT` composite alongside a `CASCADE`
scalar makes deleting any non-empty group **fail**. **Use `ON DELETE CASCADE` on both composite FKs.**

### F6 · RFC-001 §4.10's admin gating does not exist today
§4.10 gates create/rename/archive/settings/membership to `admin`. All six existing actions —
`createGroupAction` … `mergeGroupMembershipAction`, [cellar/actions.ts:215-249](src/lib/cellar/actions.ts:215)
— are wrapped in plain `action(...)`, reachable by **any ready tenant user**, and
`src/app/(app)/bulk/GroupActions.tsx` has no `isAdmin` reference at all. Building to spec is a
**behaviour change on the shipped `/bulk` panel**, not a greenfield choice. Called out so it is a
decision, not a surprise.

### F7 · AC-8's "before/after" audit is not what the group cores write
RFC-001 AC-8 requires every group mutation to write an audit entry with actor **and before/after**.
The six existing group audit writes in `src/lib/vessels/groups.ts` are **summary-only** — none passes
`changes`. The `diff()` helper (`src/lib/audit.ts:39`) exists and is used elsewhere
(e.g. [lot/rename.ts:102-110](src/lib/lot/rename.ts:102)) but not here. Adding before/after is new
work, not parity.

### F8 · The `INTERNAL` instruction in the definition of done is a CI trap as literally stated
`verify:ai-native` discovers a "core" only if the **file path matches `*-core.ts`** *and* it exports a
symbol ending in `Core` ([verify-ai-native.mjs:129](scripts/verify-ai-native.mjs:129)). The existing
group CRUD lives in `src/lib/vessels/groups.ts` — **it does not match, so it is invisible to the gate
today.** And an `INTERNAL` entry whose key is not a discovered core is a **stale entry → hard CI
failure** ([verify-ai-native.mjs:192](scripts/verify-ai-native.mjs:192)).

So the DoD's "mark the cores `INTERNAL`" is correct **only if** the new group cores land in a
`*-core.ts` file. Two coherent options, and the plan must pick one deliberately:
- **(a) Keep extending `src/lib/vessels/groups.ts`** → nothing is discovered, no `INTERNAL` entry is
  needed, and adding one **breaks CI**.
- **(b) Introduce `src/lib/vessels/group-core.ts`** → it becomes discovered and **requires** an
  `INTERNAL` entry.

**This plan chooses (b)** — see §3 D5. Also note: any `INTERNAL` edit regenerates the table in
`docs/architecture/assistant-coverage.md`, and a stale file **fails the gate**
([verify-ai-native.mjs:242-244](scripts/verify-ai-native.mjs:242)). Regenerate and commit it.

### F9 · The handoff's own Phase 7 sequence is stale and is not in PR #567
[11-implementation-sequence.md:139-146](docs/design/cellarhand-v2-handoff/11-implementation-sequence.md:139)
still lists *"effective-dated membership"*, *"`addedAt = createdAt`"* and *"Report (do not enforce)
OD-3 violations"* — all three reversed by ADR 0014 and amended RFC-001 §4.13. That file is **not** in
PR #567's diff, so it stays wrong on `main` after #567 lands. Cheap fix; fold into Unit 11.

### F10 · GROUP-1/GROUP-2 use `enforcedBy` values the register does not use
The register's de-facto vocabulary is `app-code` (31), `database` (9), `pure-code` (7), `core` (2),
`db-constraint` (1), `app-code+db-constraint` (1). GROUP-1 declares `db` and GROUP-2 declares
`schema`. The frontmatter checker validates `status` against an enum but **does not validate
`enforcedBy`** ([verify-invariant-frontmatter.mjs:25-26](scripts/verify-invariant-frontmatter.mjs:25)),
so this passes green as silent vocabulary drift. Normalise to `database` and `pure-code` in Unit 9.

### F11 · Global search hardcodes `href: "/bulk"` for every group hit
[search/query.ts:205](src/lib/search/query.ts:205) emits `{kind:"group", subtitle:"barrel group",
href:"/bulk"}`. Once `/cellar/groups/[id]` exists that link is wrong. One-line fix, Unit 8.

### F12 · `verify:barrel-groups` already exists, is green, and proves none of GROUP-1 or GROUP-3
It is a real 20-assertion script (`scripts/verify-barrel-groups.ts`), but it covers fan-out, merge,
preview and batch correction. It brushes GROUP-2 only at line 107 (*"membership create/merge wrote
audit only, no ledger operation"*). Because `verify:invariants` **only checks that the named npm
script exists and never runs it**
([verify-invariant-guards.mjs:57-65](scripts/verify-invariant-guards.mjs:57)), pointing GROUP-1 or
GROUP-3 at this script would go green while proving nothing. **That is the specific failure the
definition of done forbids. Three new scripts, per Unit 9.**

### F13 · M1 is NOT purely additive — widening `VesselType` breaks the build (found while building)
**This plan predicted `tsc` would pass untouched. It did not.** Three surfaces declare their row DTO
with the literal union `type: "BARREL" | "TANK"` and take a bare `vessel.findMany()`, so the widened
Prisma enum no longer assigns:

- `VesselOpt` — [bottling/BottlingClient.tsx:20](src/app/(app)/bottling/BottlingClient.tsx:20), failing at `bottling/page.tsx:44`
- `VesselWithContents` — [bulk/BulkClient.tsx:32](src/app/(app)/bulk/BulkClient.tsx:32), failing at `bulk/page.tsx:108`
- `VesselRow` — [vessels/VesselsClient.tsx:15](src/app/(app)/vessels/VesselsClient.tsx:15), failing at `vessels/page.tsx:26`

The original assessment came from grepping for `Record<VesselType, …>` and exhaustive switches, which
found nothing — **the wrong search.** These are literal unions declared in component files, invisible
to that grep.

`tsc --noEmit` is a hard CI gate (`ci.yml:24`), so **M1 cannot merge without addressing it**, which
makes this the plan's only genuinely mandatory scope growth. The fix is not a widening of the three
DTOs — those components carry barrel/tank-specific logic and would render a keg as a tank the moment
Phase 8 creates one. It is the step RFC-000 §2 already names as the *enforce* action for
`VesselType += KEG`: **"Picker + capacity call sites must filter on `type`."** Landed as
`src/lib/vessels/cellar-types.ts` (a `where` filter for the real exclusion + a type predicate so
TypeScript can see it — a cast would have silenced the error and left the hole open).

**The lesson worth keeping: an additive enum value is only additive at the database.** In TypeScript
it is a widening, and every narrow hand-written union over that enum is a call site.

### Also true, lower stakes
- **`issueWorkOrderCore` is guarded, not idempotent, and has a TOCTOU window.** The status read is
  *outside* the transaction ([lifecycle.ts:261](src/lib/work-orders/lifecycle.ts:261)) and the update
  is unconditional ([:269](src/lib/work-orders/lifecycle.ts:269)) under `runInTenantTx` (READ
  COMMITTED). Two concurrent issues can both pass. A snapshot written there inherits the window —
  and GROUP-3 says the snapshot is immutable. Unit 6 closes it with a conditional update.
- **Naming collision.** In the work-order builder, "group" means `groupSeq` — parallel *task* groups
  ([schema.prisma:5089](prisma/schema.prisma:5089)). Unrelated to vessel groups. Copy must never say
  "group" unqualified on a work-order surface.
- **`docs/architecture/invariants/README.md:33`** claims "30 notes: 29 guarded, 0 planned, 1
  deferred"; actual is 51/50/0/1. Unenforced. Fix while nearby.

---

## 3. Decisions

**Not re-litigated** (owner-decided, carried as given): OD-3 one operational group per vessel,
enforced immediately in the migration; historical membership by work-order snapshot, **no `addedAt`,
no `removedAt`**; provenance is a trinary, which is why M1 carries two `CaptureMethod` values.

New decisions this plan makes, each with its evidence:

- **D1 · The snapshot is a nullable Json column on `WorkOrderTask`, not a join table, not on
  `work_order`.** Per F4 it must be per-task. Against a join table: it would be a **new
  tenant-scoped table** requiring all nine Phase-12 steps (RLS, grants, composite uniques, isolation
  test) to store data ADR 0014 **explicitly decided does not need to be queryable**; the repo has
  chosen JSON for member sets twice with a written rationale (`group-activity.ts:6`); and a member
  table drifts toward exactly what GROUP-2 forbids. Accepted cost: not queryable — already accepted
  by ADR 0014.
- **D2 · Add `WorkOrderTask.vesselGroupId` (nullable) + composite tenant FK.** The prerequisite F3
  exposed. This is the second consumer of `vessel_group.@@unique([tenantId, id])`, reinforcing why
  M2 must add it.
- **D3 · "A draft whose group changed underneath it" — answered.** ADR 0014 flags this as
  unspecified plan-review work; this is the answer.
  - `vesselGroupId` **set** + status `DRAFT` → membership **re-resolves live on every read**. The
    builder states it plainly: *"Reads the group's current barrels. The list is fixed when you issue."*
  - At **issue** → resolve once, write `memberSnapshot` + `memberSnapshotAt` in the same transaction
    as the `ISSUED` flip. Immutable thereafter.
  - `vesselGroupId` **null** (range `B101-B110` or comma list) → membership was always a literal
    list. The payload list *is* the snapshot, frozen at authoring. Correct, and unchanged.
  - Group **archived** before issue → issue is **refused** with a message naming the group and the
    way out. RFC-001 §4.5 protects work orders *already issued*; a draft has not committed.
  - Group **emptied** before issue → refused. A group task with zero members is meaningless.
- **D4 · Group location = `locationId` (composite FK to `Location`) + free-text `rackLabel`.**
  RFC-001 §6 decision 3 says reuse `Location` *if racks are modelled there*. They are not — `kind` is
  cellar/warehouse/crush_pad/lab/bottling/external/other ([schema.prisma:296](prisma/schema.prisma:296)).
  `Location` already carries `@@unique([tenantId, id])` ([:309](prisma/schema.prisma:309)), so the hall
  FK is free; the rack is text.
- **D5 · New group logic lands in `src/lib/vessels/group-core.ts`, and gets `INTERNAL` entries.**
  Resolving F8 option (b). Reason: group configuration is desk-with-coffee work, and making it a
  *discovered* core states that exemption on the record rather than hiding behind a filename that
  the gate happens not to match. Silence is not an exemption.
- **D6 · Composite FKs are `ON DELETE CASCADE`, overriding RFC-000 §2.** Per F5.
- **D7 · Admin gating is added, and the `/bulk` behaviour change is accepted.** Per F6. `View` and
  `record work` stay open per §4.10; only create/rename/archive/settings/membership move to
  `safeAdminAction`.

### Still open — one question for the owner, not blocking

**`AD_HOC` groups.** RFC-001 §6 decision 4 asks whether they appear in the group index at all, and
§4.2 says they *"auto-archive when their work order closes"* — a lifecycle nothing in this phase
builds. **This plan ships the `type` column with both values (GROUP-1's partial index needs it) but
builds no `AD_HOC` creation path and no auto-archive.** Every group created in Phase 7 is
`OPERATIONAL`. Flagged rather than silently invented.

---

## 4. Scope

**In:** M1 enum migration; M2 structure; M3 OD-3 enforcement; group identity + snapshot on work-order
tasks; group domain cores incl. admin gating, positions, archive, before/after audit; rollups;
`/cellar/groups` + `/cellar/groups/[id]` (SC-09); GROUP-1/2/3 flipped to `guarded` with three real
guards; assistant **read** coverage; Demo-Winery QA; doc corrections F9/F10/F12.

**Out:** RFC-002 topping/keg behaviour, `keg_fill`, `topping_tick`, the LEDGER-4 capacity exemption
(Phase 8). RFC-004 tags (Phase 10). Rule-based membership (RFC-001 §6.2 → v2). `AD_HOC` creation and
auto-archive. `/vessels/[id]` barrel detail (SC-08) — adjacent, separately navigable, not required by
SC-09. The 96-tool consolidation pass (RFC-000 §3 raises it as its own decision; it stays that way).

**M1 carries KEG/BIN/DERIVED/NOMINAL only because enum values must land far ahead of the code that
writes them. Nothing in this phase may write any of the four.**

---

## 5. Implementation units

### PR 1 — M1, alone, merged **and deployed** before Unit 2

#### Unit 1 · The enum-only migration
**Goal:** Land four enum values so Phases 7–8 can reference them later.
**Files:** one new `prisma/migrations/<ts>_cellarhand_v2_enum_values/migration.sql`; `prisma/schema.prisma` (enum bodies only).
**Approach:** Four `ALTER TYPE … ADD VALUE IF NOT EXISTS` statements and **nothing else in the file** —
copy the house shape exactly from `prisma/migrations/20260726190000_inbox_kind_weather_alert/migration.sql`,
including the comment explaining why the file is alone. `IF NOT EXISTS` is the Windows idempotency
rule. Mirror the four values into `enum VesselType` ([schema.prisma:155-158](prisma/schema.prisma:155))
and `enum CaptureMethod` ([:2148-2153](prisma/schema.prisma:2148)). Hand-author the SQL —
`prisma migrate diff` drops tenant FKs on this repo.
**Do not touch** `TYPES` at [vessels/actions.ts:10](src/lib/vessels/actions.ts:10). That local
`["BARREL","TANK"]` union deliberately shadows the Prisma enum and is what prevents anyone creating a
KEG or BIN vessel before Phase 8 exists. Widening it here would be the bug.
**Tests:** none for the enum itself — there is no behaviour. The gate is the type-check.
**Depends on:** none.
**Verification:** `npx tsc --noEmit` green. Then **confirm the Vercel production deploy succeeded
and the values exist in the live enum** before starting Unit 2. Merged is not deployed; this is the
step that has bitten this repo ~7 times for `OperationType` alone.

> [!warning] BUILT 2026-07-30 — the "M1 is purely additive" expectation was WRONG. See F13.
> This unit originally predicted `tsc` would pass untouched. It did not: widening `VesselType` broke
> the build in three files. The unit therefore also carries the RFC-000 §2 *enforce* step —
> `src/lib/vessels/cellar-types.ts` plus a `type` filter at three call sites. Scope grew by one small
> module and three two-line changes; **the enum migration itself is still alone in its own file.**

---

### PR 2 — M2 structure + M3 enforcement + group domain

#### Unit 2 · M2 — `vessel_group` / `vessel_group_member` structure
**Goal:** Give the group a type, status, location and settings, and the member a position — with the
tenant FKs that RFC-001 §4.12 specifies and the unique target it needs.
**Files:** one new migration; `prisma/schema.prisma` (`VesselGroup`, `VesselGroupMember`).
**Approach:** Hand-authored SQL following
`prisma/migrations/20260728100100_latent_infection_event/migration.sql` — including the two-step
`CREATE UNIQUE INDEX` → `ADD CONSTRAINT … UNIQUE USING INDEX` idiom for the `(tenantId, id)` target,
and the trailing `DO $$ … RAISE EXCEPTION` self-verify block. Add to `vessel_group`:
`@@unique([tenantId, id])` (**missing today — its only composite unique is `(tenantId, name)` at
[schema.prisma:3073](prisma/schema.prisma:3073)**; both of this phase's composite FKs target it),
`type`, `status`, `locationId`, `rackLabel`, `settings` Json. Add to `vessel_group_member`:
`position Int`, plus composite tenant FKs `(tenantId, groupId) → vessel_group(tenantId, id)` and
`(tenantId, vesselId) → vessel(tenantId, id)`, both **`ON DELETE CASCADE`** (D6/F5).
Tables hold 0 rows, so `NOT NULL` on `type`/`status`/`position` is safe **in the same migration** —
but still write the backfill statements (`type='OPERATIONAL'`, `status` from `isActive`, position by
vessel-code natural sort) so the migration is correct if it ever runs somewhere non-empty.
**No `addedAt`. No `removedAt`.** If you find yourself adding them you are reversing ADR 0014 — stop
and say so. `vessel_group` already has RLS ([rls_policies:182-188](prisma/migrations/20260701001000_rls_policies/migration.sql:182)),
and default privileges already grant `app_rls` DML, so **no new grant statements** (a `GRANT` here
would be a no-op; only a `REVOKE` would change anything, and nothing here is append-only).
**Tests:** extend `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts` for the two
new composite FKs.
**Depends on:** Unit 1 deployed; PR #567 merged.
**Verification:** `npm run verify:tenant-isolation`; `npm run verify:barrel-groups` still green.

#### Unit 3 · M3 — the OD-3 partial unique index
**Goal:** Make "a vessel is in at most one `OPERATIONAL` group" true at the database.
**Files:** one new migration (separate file from Unit 2 so rollback is independent).
**Approach:** `CREATE UNIQUE INDEX … ON vessel_group_member (tenantId, vesselId)` restricted to
members whose group is `OPERATIONAL`. **No `removedAt` clause — there is no `removedAt`.** Note the
predicate references the *group's* type, not the member's, so it needs either a denormalised type on
the member row or a different formulation; **resolve this while writing the SQL and state which was
chosen** — a partial index cannot reference another table. Recommended: denormalise `type` onto
`vessel_group_member` and keep it consistent in the core, or enforce via a unique index over a
generated column. This is the one place where RFC-001 §6.1's one-line index sketch is under-specified.
Enforce immediately — 0 violations exist, verified 2026-07-30, and rollback is `DROP INDEX`.
Does not conflict with the existing `@@unique([tenantId, groupId, vesselId])` ([:3086](prisma/schema.prisma:3086)).
**Tests:** a case asserting the second `OPERATIONAL` membership is rejected.
**Depends on:** Unit 2 (the `type` column must exist first).
**Verification:** the new `verify:group-membership` from Unit 9 fails before the index and passes after.

#### Unit 4 · Group domain cores
**Goal:** Make the group configurable, ordered, archivable and admin-gated, with honest audit.
**Files:** new `src/lib/vessels/group-core.ts`; `src/lib/vessels/groups.ts`; `src/lib/cellar/actions.ts`.
**Approach:** New cores in a `*-core.ts` file per D5 (this is what makes them visible to
`verify:ai-native`, so the `INTERNAL` exemption is stated rather than accidental). Cover: set
type/status/location/settings; reorder members (positions per group, contiguous); archive with the
open-work-order warning (§4.5); membership add/remove that catches the OD-3 unique violation and
returns a friendly `{ok:false, error}` **naming the other group** — SC-09's validation state requires
the name, so a bare constraint error is not enough. Add before/after `changes` via the existing
`diff()` helper (F7), matching [lot/rename.ts:102-110](src/lib/lot/rename.ts:102). Switch the six
group actions to `safeAdminAction` (D7/F6) and update `/bulk`'s `GroupActions.tsx` call sites for the
`ActionResult` shape.
**Tests:** first unit tests for group CRUD — there are **none** today for `groups.ts` or
`group-apply.ts`. Cover: OD-3 rejection names the other group; reorder is contiguous; archive warns
with open work orders; a non-admin is refused; audit carries before/after.
**Depends on:** Units 2, 3.
**Verification:** `npm run verify:barrel-groups`; new tests; `npx vitest run`.

---

### PR 3 — group identity and the frozen member list

#### Unit 5 · Persist group identity on the task
**Goal:** Give a work-order task a way to know which group it came from — the prerequisite F3 exposed.
**Files:** one new migration; `prisma/schema.prisma` (`WorkOrderTask`); `src/lib/work-orders/nl-resolve.ts`.
**Approach:** Add `WorkOrderTask.vesselGroupId String?` (**nullable — `work_order_task` holds 106 live
rows**, F2) + composite tenant FK `(tenantId, vesselGroupId) → vessel_group(tenantId, id)`,
`ON DELETE SET NULL` (a deleted group must not delete work-order history; this differs from Unit 2's
CASCADE deliberately, and matches
[lot_operation_line_tenantId_vesselId_fkey](prisma/migrations/20260701000800_composite_tenant_fks/migration.sql:22)).
Change `resolveGroupMembers` ([nl-resolve.ts:156](src/lib/work-orders/nl-resolve.ts:156)) to also
return the resolved group's id when the expression matched a **saved group** (null for a range or a
comma list), and thread it to the three authoring sites (`:455`, `:481`, `:629`).
**Tests:** authoring from a saved group name persists `vesselGroupId`; authoring from `B101-B110`
leaves it null.
**Depends on:** Unit 2.
**Verification:** `npm run verify:work-order-nl`; `npm run verify:group-maintenance`.

#### Unit 6 · The snapshot, frozen at issue
**Goal:** Satisfy GROUP-3 — an issued work order's member list can never change.
**Files:** the Unit 5 migration (same file); `src/lib/work-orders/lifecycle.ts`; the task read path;
`src/app/(app)/work-orders/[id]/edit/` (the draft-reads-live note).
**Approach:** Add `memberSnapshot Json?` + `memberSnapshotAt DateTime?` to `WorkOrderTask` (D1/F4).
Implement D3's four-case rule. Write the snapshot **inside the existing `runInTenantTx`** in
`issueWorkOrderCore`, between the status update ([lifecycle.ts:269](src/lib/work-orders/lifecycle.ts:269))
and `reserveForWorkOrderTx` ([:274](src/lib/work-orders/lifecycle.ts:274)), so freeze and `ISSUED`
commit atomically. **Close the TOCTOU window in the same change** — make the status update
conditional on `DRAFT` and assert exactly one row changed, so a concurrent double-issue cannot write
two snapshots or double the reservations. Make the write once-only. The read path returns the
snapshot for any non-`DRAFT` status and live membership for `DRAFT`.
**Tests:** the AC-3 test, stated as an outcome — issue a work order against a group, then **add and
remove** a barrel, and assert the reported member list and per-barrel count are byte-identical.
Plus: issue refused on an archived group; issue refused on an emptied group; a `vesselGroupId: null`
task is unaffected; concurrent issue writes one snapshot.
**Depends on:** Unit 5.
**Verification:** the new `verify:wo-member-snapshot` from Unit 9; `npm run verify:work-orders`;
`test/assistant-never-issues.test.ts` still green (the assistant can never reach this path — it only
ever creates drafts).

#### Unit 7 · Rollups
**Goal:** Member count, distinct lots, summed volume, oldest last-topped, open work-order count.
**Files:** `src/lib/vessels/group-core.ts` (or a sibling read module).
**Approach:** **Computed, never stored** (RFC-001 §4.6, AC-10). Each figure states its derivation in
the UI — a group's volume is a sum of *derived* barrel volumes, not a measurement, and per DESIGN.md
the words are always *measured* / *≈ estimated*.
**Tests:** a two-lot group reports 2 distinct lots and sums volume across both.
**Depends on:** Unit 2.
**Verification:** covered by Unit 8's UI checks.

---

### PR 4 — UI, gates, docs, QA

#### Unit 8 · SC-09 — the group index and detail
**Goal:** `/cellar/groups` and `/cellar/groups/[id]`, to spec, reachable, accessible.
**Files:** new `src/app/(app)/cellar/groups/{page,loading,not-found}.tsx` + client components; new
`src/app/(app)/cellar/groups/[id]/page.tsx`; `src/lib/nav/sections.ts`; `test/e2e/routes.ts`;
`src/lib/search/query.ts`.
**Approach:** Follow SC-09 verbatim
([02-screen-inventory.md:205-225](docs/design/cellarhand-v2-handoff/02-screen-inventory.md:205)) — all
nine states including the two-wines warning row (legal, not an error) and the archive confirmation
copy. Pattern-match the v2 exemplar `/bulk` (server component → cores → DTOs; `loading.tsx` uses
`Skeleton` sized to the resolved layout, never a spinner; `not-found.tsx` uses `EmptyState` and offers
a way back — both are enforced by `test/layout-primitives.test.ts:95-133`). Forms follow the Growers
two-layer error contract: the action **returns** `{ok:false,error}`, never throws for a user-facing
failure. Mixed-permission surface per D7 — the page must **not** 404 for a plain user (§4.10 gives
everyone view); only the admin controls hide, following `setup/vendors`' `isAdmin`-prop pattern.

The orphan guard is strict, so all of this is required, not optional:
- register `/cellar/groups` as a `SECTIONS` item under the **`"/bulk"`** hub
  ([sections.ts:139-142](src/lib/nav/sections.ts:139)) — exactly one source claims it, and this also
  gives Ctrl-K coverage for free;
- the section page must render `<HubSectionNav hub="/bulk" current="/cellar/groups"` **verbatim** —
  it is string-matched in source;
- `/cellar/groups/[id]` must **not** contain `SectionNav`, and no `layout.tsx` under the segment;
- add `/cellar/groups` to `AUDITED_ROUTES` in `test/e2e/routes.ts`;
- do **not** add a fourth `aria-current` to `AppShell.tsx` (`test/appshell-a11y.test.ts` pins three).

Fix F11 — point the search hit at the group detail instead of `/bulk`.
Read DESIGN.md first: tokens only; `StatusChip` for the six-value status ramp and `Badge` for
categories (never `<Badge>{status}</Badge>`); never set text in `--golden-yellow`/`--orange`/
`--lavender`/`--bright-mauve`; `--touch-min` 44px at every width; light-only.
Never write "group" unqualified near a work-order surface — it collides with `groupSeq`.
**Tests:** `test/route-reachability.test.ts`, `test/nav-sections.test.ts`,
`test/nav-section-guards.test.ts`, `test/search-sections.test.ts`, the design static guards, and the
axe run at both viewports.
**Depends on:** Units 4, 7.
**Verification:** `npx vitest run`; the Playwright a11y spec on the new route; browser QA in Unit 12.

#### Unit 9 · Flip GROUP-1/2/3 to `guarded` with three real guards
**Goal:** Three invariants that are actually checked. **An honest unguarded note beats a green check
that lies.**
**Files:** `docs/architecture/invariants/GROUP-{1,2,3}-*.md`; three new `scripts/verify-*.ts`;
`package.json`; `INVARIANTS.md`.
**Approach:** The frontmatter checker enforces a **biconditional** — `guarded` **must** have
`verify:`, `planned` **must not**
([verify-invariant-frontmatter.mjs:100-107](scripts/verify-invariant-frontmatter.mjs:100)) — so each
note flips to `guarded` **in the same commit as its script**. Notes must be **LF** (CRLF is a hard
failure; `.gitattributes` pins the directory, but confirm on this Windows checkout) and the filename
must start with `<id>-`. Normalise `enforcedBy` per F10. Add the GROUP entries to `INVARIANTS.md`,
which PR #567 does not touch even though the notes mirror it.

Three genuinely distinct guards, shaped like `scripts/verify-one-lot-per-vessel.ts` — cross-tenant,
read via `runAsSystem` (a pooled `app_rls` client without a tenant GUC returns **zero rows** and would
report a false clean), `process.exitCode` not `process.exit`, `disconnectSystem()` in `finally`:
- **`verify:group-membership` (GROUP-1)** — sweep every tenant for any vessel in two `OPERATIONAL`
  groups. Where possible share the predicate with the runtime path so guard and runtime cannot drift.
- **`verify:group-not-a-vessel` (GROUP-2)** — schema-shaped: assert no FK path from `vessel_group` to
  any ledger line and that no `LotOperationLine`/`LotLineage` row references a group, derived from
  `Prisma.dmmf` rather than a hand-list (the `verify-tenant-isolation.ts` coverage-guard pattern).
- **`verify:wo-member-snapshot` (GROUP-3)** — the Unit 6 behavioural proof, end to end in Demo Winery.

**Do not point any of these at `verify:barrel-groups`** (F12).
**Tests:** the scripts are the tests.
**Depends on:** Units 3, 6, 8.
**Verification:** `npm run verify:invariants` **and** `npm run verify:invariant-frontmatter` green —
both are hard CI gates (`.github/workflows/ci.yml:37-38`). Each new script must **fail** against the
pre-fix state; a guard that has never gone red has not been shown to work.

#### Unit 10 · Assistant coverage
**Goal:** Group state is readable conversationally; group configuration stays GUI-only, on the record.
**Files:** `src/lib/assistant/tools/query-cellar-contents.ts`,
`src/lib/assistant/tools/query-operations.ts`; `scripts/ai-native-allowlist.mjs`;
`docs/architecture/assistant-coverage.md`.
**Approach:** Extend the two existing read tools so *"what's due on rack 14"* and *"which barrels
haven't been topped"* work. **Emit no new tools.** Specifically **do not** add `create_barrel_group`
or `query_groups` — the registry already holds **96 tools** ([registry.ts:143](src/lib/assistant/registry.ts:143))
against a ~40-tool selection cliff, and RFC-000 §3 names that naive decomposition as the thing to
reject at review. Add `INTERNAL` entries for the Unit 4 cores per D5/F8, keyed by repo-relative path,
with `owner` + `reason` (both required) and the desk-with-coffee rationale. Then **regenerate
`docs/architecture/assistant-coverage.md` and commit it** — a stale generated table fails the gate.
**Tests:** `test/verify-ai-native.test.ts` asserts zero violations against the real tree.
**Depends on:** Units 4, 7.
**Verification:** `npm run verify:ai-native` green (hard CI gate, `ci.yml:44`).

#### Unit 11 · Documentation corrections
**Goal:** Leave the brain true.
**Files:** `docs/design/cellarhand-v2-handoff/11-implementation-sequence.md`;
`docs/architecture/invariants/README.md`; `docs/architecture/{scale,security}-register.md`; `NOW.md`.
**Approach:** Rewrite the stale Phase 7 table (F9) to match ADR 0014 and amended §4.13. Correct the
README's note count (51/50/0/1). Append a register entry for the OD-3 enforce-on-empty decision and
the snapshot shape (what / why / what-breaks-at-scale / tripwire). Keep `NOW.md` current at each PR
boundary and stamp `_Last updated_`.
**Depends on:** none.
**Verification:** `npm run verify:invariants`; frontmatter checker.

#### Unit 12 · QA in Demo Winery
**Goal:** Prove it on a real surface, in the sandbox only.
**Approach:** **Demo Winery (`org_demo_winery`) only — never Bhutan.** `QA-`-prefixed fixtures,
mutate only those, clean up after. `npm run verify:naming` green before **and** after. Walk SC-09's
nine states; then the load-bearing one by hand: create a group, author a work order against it,
confirm the draft reflects a membership change, **issue**, change membership again, and confirm the
issued order is unmoved. Use the in-app Claude browser against the local dev server (the user logs in
once; never type a password). Reads via `get_page_text`/`read_page` — screenshots hang in the pane.
For controlled text inputs use click-then-type, not `form_input`. Confirm persistence with a short
`runAsTenant("org_demo_winery", …)` script — the browser proves the UI, the script proves the DB.
**Depends on:** all.
**Verification:** the walkthrough plus the DB read-back.

---

## 6. Test strategy

| Layer | What it proves |
|---|---|
| `npx tsc --noEmit` | M1's enum widening breaks no exhaustive type |
| Unit tests (new) | Group CRUD — none exist today for `groups.ts` or `group-apply.ts` |
| `verify:group-membership` | GROUP-1, cross-tenant, from the DB |
| `verify:group-not-a-vessel` | GROUP-2, derived from the datamodel |
| `verify:wo-member-snapshot` | GROUP-3 / AC-3 — add **and** remove, byte-identical |
| `verify:tenant-isolation` | the two new composite FKs |
| `verify:ai-native` | no tool proliferation; exemptions on the record |
| Playwright + axe | SC-09 at 390px and 1440px |
| Demo Winery QA | the whole loop on a real surface |

**Each new guard must be observed failing before it passes.** A guard that has only ever been green
has not been tested.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| M1 merged but not **deployed** before M2 | **High** — fails on deploy, after CI passes | Unit 1's verification step is a live enum check, not a merge |
| PR #567 never lands | **High** — the design of record stays superseded on `main` | Blocking gate before Unit 2 |
| F3 under-estimated: group identity is a whole unit | Medium | Units 5 + 6 are explicitly sized for it |
| M3's partial index cannot reference the group's `type` from the member table | Medium | Called out in Unit 3; resolve while writing the SQL and state the choice |
| `RESTRICT` copied from RFC-000 breaks group deletion | Medium | D6; the exact FK clauses are specified |
| An `INTERNAL` entry for a non-discovered core reds CI | Medium | D5 makes the file `*-core.ts` deliberately |
| A `verify:` that proves nothing | **Medium-high** — the gate cannot detect it | F12; three new scripts, each shown failing first |
| `/bulk` admin-gating behaviour change surprises a user | Low-medium | D7 is explicit; call it out in the PR |
| `SET NOT NULL` on a 106-row live table | Medium | F2; every new task column is nullable |

---

## 8. Confidence

| Section | Confidence | Note |
|---|---|---|
| Problem frame | **High** | Production re-queried 2026-07-30; every RFC-000 number reproduced |
| ~~Unit 1 is type-safe~~ | **WRONG** | Corrected by F13 while building. The grep that produced this claim searched for `Record<VesselType>`/switches and missed three literal unions in component files. Recorded rather than quietly amended, because the plan asserted it in writing. |
| F3 (identity is missing) | **High** | Read `resolveGroupMembers` and both payload shapes directly; `group-activity.ts:6` states the tradeoff in words |
| F5 (`RESTRICT` vs `CASCADE`) | **High** | Existing FK and four house precedents read directly |
| F8 (`INTERNAL` trap) | **High** | Discovery regex and the stale-entry violation read directly |
| Scope boundaries | **High** | RFC-000 §1 sequencing is unambiguous |
| Unit 3 (partial index formulation) | **Medium** | The cross-table predicate is genuinely under-specified in RFC-001 §6.1; the plan says so rather than papering over it |
| Unit 6 (TOCTOU close) | **Medium-high** | The window is real and read directly; the exact fix wants care against the reservation path |
| D3 (draft-whose-group-changed) | **Medium-high** | Answers what ADR 0014 left open; the archived/emptied refusals are judgement calls worth a second look |
| UI effort (SC-09) | **Medium** | Nine states plus a strict orphan guard; the guard's requirements are known exactly, the design work is not yet done |
