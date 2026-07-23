---
title: Custom-crush data foundation (ownership data model + intake spine)
type: feat
status: draft
date: 2026-07-23
branch: feat/custom-crush-foundation
branches: [feat/ccf-ownership (F1, ownership data model), feat/ccf-intake (F2, intake spine), feat/ccf-verify-assistant (F3, verify + assistant + docs)]
depth: deep
units: 13
roadmap: Phase 23 (foundation; enforcement is plan 092)
enables: docs/plans/2026-07-23-092-feat-granular-rbac-plan.md
reviews: [plan-eng-review, council (codex+gemini), plan-design-review]
honors: [D8, D10, D14, D19, LEDGER-10, LEDGER-11, D26]
---

## Overview

Before the Phase 23 RBAC enforcement (plan 092) can put a fence between one custom-crush client's
wine and another's, the app needs a real **ownership data model** and an **intake spine** to attach
that ownership to. Today ownership is a two-value enum (`LotOwnership { ESTATE, CUSTOM_CRUSH_CLIENT }`,
`schema.prisma:1607`) that can't even name *which* client, and fruit arrives with a weight and nothing
else, no weigh-tag, no grower, no owner.

This plan builds and **verifies** that foundation with **no owner-scope RLS** — a first-class `Owner`
entity, a denormalized `ownerId` maintained at the ledger chokepoint, a `CHANGE_OWNERSHIP` operation,
a cross-owner blend guard, AP-owner bond precedence, plus the intake spine (a `Grower` entity, weigh-tag
certificates, owner/grower/sold on the pick). Then plan 092 layers the capability matrix + RESTRICTIVE
RLS on top, on a model already proven correct.

The load-bearing reason for foundation-first: **scalar vs fractional ownership decides whether the RLS
predicate is a column compare or a join.** Getting that wrong after the 25-table RLS ships means
re-migrating the whole enforcement spine on the live Bhutan production tenant. So we settle and verify
the ownership model here, scalar but structured for additive fractional, before any enforcement exists.

## Problem Frame

**Who has the problem.** A custom-crush facility holds wine for several clients, and each client's fruit
arrives at the crush pad tagged to *them*. Phase 23 wants to fence client A's wine from client B. But
there is nothing to fence *by*: `Lot.ownership` is `ESTATE | CUSTOM_CRUSH_CLIENT` with no client
identity, `HarvestPick` carries only a weight, and there is no way to *change* ownership (a JV split,
a facility taking title) as a real, TTB-reportable event.

**What happens if we do nothing.** Plan 092's owner-scope RLS would be built on a model that can't name
an owner, and the intake path a custom-crush partner touches first (weigh-tags, grower attribution)
wouldn't exist. Either the partner can't onboard, or we ship RLS on sand and re-migrate.

**Pressure test.** Is this the right problem, or is RBAC being done backwards? The re-sequencing (Russell,
2026-07-23) says: don't build the fence before the thing it fences. This plan is that correction. The
one thing to keep honest: we are building the ownership model *scalar*, and the incumbents disagree
(Vintrace fractional, InnoVint scalar). That's a deliberate, reversible bet documented below and flagged
as the #1 partner-validation question — not a silent choice.

## Requirements

- **MUST** introduce a first-class tenant-scoped `Owner` entity that names a custom-crush client,
  replacing the two-value `LotOwnership` enum as the identity of who owns a lot.
- **MUST** preserve the existing billable/capitalized cost split exactly — client-owned cost is billed
  back, not capitalized to estate inventory (`INVARIANTS.md:134`, D19). The `isBillable` predicate
  (`cost/data.ts:108`) must keep answering.
- **MUST** carry a denormalized nullable `ownerId` on the owner-scope surface (the lot spine + its
  lot-referencing children + `WineSku`/`BottledInventory`), maintained at write time, inherited
  DIRECTIONALLY from the TARGET lot (reuse plan 088's rule).
- **MUST** add a `CHANGE_OWNERSHIP` ledger operation — append-only, reversible, posting the same
  symmetric transfer-in-bond TTB lines as `TRANSFER_IN_BOND` (because owner maps to bond).
- **MUST** refuse a blend of two distinct non-null owners until a `CHANGE_OWNERSHIP` brings the wine
  under one owner (co-mingling is explicit and audited, never silent).
- **MUST** derive bond with **AP-owner precedence** (a custom-crush owner's AP bond wins over the
  location/primary bond).
- **MUST** add a first-class `Grower` entity + grower FK on Vineyard/Block, and a weigh-tag/weighmaster
  certificate (per-tenant monotonic, void-not-delete) + tare/bin weigh-groups, and owner/grower/sold
  refs on `HarvestPick`.
- **MUST** ship `Owner`, `Grower`, and the weigh-tag tables with the EXISTING `tenant_isolation` RLS
  (the tenant fence, AGENTS.md 9-step). **MUST NOT** add any owner-SCOPE RLS (that is plan 092).
- **MUST** be scalar ownership, structured so fractional is an ADDITIVE extension, not a rewrite.
- **MUST** ship a `verify:owner-model` script proving the model against real custom-crush scenarios,
  with no RLS, plus an invariant note.
- **MUST** carry assistant coverage (`verify:ai-native`): a weigh-tag/owner intake write path and an
  Owner/Grower read path, EXTENDING existing tools where possible (~86 tools already, past the cliff).
- **MUST** stamp `ownerId` at EVERY `lot.create` site (all 8, incl. `migration/publish` and
  `bulk/actions`) — nothing lands silently NULL — and the owner-fold MUST read the consumed lots'
  current `ownerId` column, never lineage (eng review).
- **MUST** cut all 11 `Lot.ownership` readers over to `ownerId` and drop the enum (no mirror);
  `ownerId` is a maintained projection, not immutable ledger truth (eng review).
- **NICE** a per-tenant "unassigned client" placeholder so legacy `CUSTOM_CRUSH_CLIENT` lots resolve
  cleanly at backfill.

## Scope Boundaries

**In scope:** the `Owner` entity, `ownerId` columns + chokepoint maintenance, `CHANGE_OWNERSHIP`, the
cross-owner blend guard, AP-owner bond precedence, the `Grower` entity, weigh-tags + weigh-groups,
`HarvestPick` owner/grower/sold, the verify script + invariant, the assistant coverage, and **one
minimal weigh-tag entry screen** (Unit 10b — issue/view/void a tag; the wet-hands intake surface, design-reviewed 2026-07-23).

**Out of scope:**
- **All owner-SCOPE RLS** — the RESTRICTIVE policies, the `app_owner_scope` function, the capability
  matrix. That is plan 092 (the enforcement layer), built on this foundation.
- **Fractional ownership** — scalar now; fractional is an additive extension gated on partner validation.
- **`CostLine.visibility` split** — plan 092 (Council C2).
- **The client "Your wine" home + role builder UI, and owner/grower CRUD screens** — plan 092 Branch B.
  (This plan ships ONLY the weigh-tag entry screen, Unit 10b; owner/grower are picked from existing
  reference data or the assistant, not created via a new screen here.)
- **Bond entity** — already exists (`schema.prisma:2487`); we only add AP-owner precedence to
  `deriveBond`, we do NOT rebuild it.
- **Fruit-purchase contracts, per-acre/per-ton pricing** — Phase 20 follow-on.

**⚠️ Supersedes plan 092 Unit 6b.** Plan 092 (merged) described a cross-owner blend *refusal* (its old
Unit 6b). Council C2 reversed that here: cross-owner blends are ALLOWED (receiving owner dominates,
minority billed). When plan 092 is next touched, its Unit 6b is moot — blend behavior lives in this
foundation (Unit 6), and 092 only enforces read/write scope on the resulting `ownerId`.

## Research Summary

### Codebase Patterns

**The cost predicate is the one line that must survive.** `src/lib/cost/data.ts:108`:
`isBillable = (lotId) => ownershipByLot.get(lotId) === "CUSTOM_CRUSH_CLIENT"`, applied at `:113`/`:138`
(drop client-owned direct cost), returned at `:167`, viewed at `:219`, mirrored in `CostPanel.tsx:36`
and `combine.ts:42`. Replacing the enum with `ownerId → Owner` means this predicate becomes a property
of the resolved `Owner` (`owner.kind === "CUSTOM_CRUSH_CLIENT"`). `INVARIANTS.md:134` +
`scripts/verify-cost.ts:216-224` guard it and must stay green. 11 total `Lot.ownership` read sites.

**The ledger chokepoint stamps denormalized columns explicitly, NOT via auto-injection.** `runLedgerWrite`
(`write.ts:42-71`) runs under `skipWrap` so the tenant extension is bypassed and `tenantId` is set as a
raw GUC (`write.ts:58`); cores write `tenantId` by hand (`write.ts:213,236,277`). `ownerId` rides the
same rails: stamped explicitly at the line write (`write.ts:231-250`, where `sourceBondId`/`destBondId`
+ `lotCode`/`vesselCode` snapshots already stamp) and the `VesselLot` projection (`write.ts:276-278`).
There is NO `ownerId` auto-injection.

**Directional attribution already exists — reuse it.** `syncVesselComponents` (`write.ts:423-593`):
`identityChanging = BLEND|PRESS|SAIGNEE|CRUSH` (`write.ts:478`) → arriving wine inherits from the
*consumed* lots (`incomingLeaves`, `:483-488`); `CORRECTION` → the *receiver* (`returningLeaves`,
`:494-497`); per-line direction gate at `:548-550`. `ownerId` inheritance is a **parallel fold** keyed
on the same `netByLot`/consumed/gained sets, NOT a new rule.

**Explicit-stamping cores (ownerId NOT auto-stamped, manual sites):** bottling `materializeFinishedGoods`
(`src/lib/bottling/materialize.ts:47-107` — writes `WineSku`/`BottledInventory`/`StockMovement`/
`BottlingRun`/`BottlingSource` directly) and the stock movement cores (`src/lib/stock/movements.ts:45-79`).

**Transfer-in-bond is the CHANGE_OWNERSHIP template.** `transferInBondTx` (`transfer-in-bond-core.ts:86-179`):
two symmetric legs in one balanced op (`:130-134`), written through the chokepoint (`:142-154`), reversed
by swapping dest/source bond (`:240-245`). `CHANGE_OWNERSHIP` re-stamps `ownerId` AND posts these same
lines (owner→bond), reversing through the same bond-swap CORRECTION. Registered in `reverse.ts:90,377`.

**The isolated-enum migration rule.** `CHANGE_OWNERSHIP` is a comment at `schema.prisma:1317-1318` and
deferred in `vocabulary.ts:40`. Add it as its own enum-only migration (mirror
`prisma/migrations/20260629000000_add_blend_optype/migration.sql` — one `ALTER TYPE ... ADD VALUE`),
committed BEFORE any core writes it (the Windows enum rule).

**The blend guard seam.** `blend-core.ts:216-227` — the existing bond-straddle refusal over
`bondCheckLots` (`:220`). The owner guard is a parallel check inserted adjacent. Note `combine.ts:98-106`
already refuses an owner-mismatched absorb, so the owner-guard pattern exists.

**The bond derivation seam.** `deriveBond`/`resolveBondsForLots` (`bond.ts:83-157`): order is ledger
dest bond → lineage → primary. AP-owner precedence inserts as **step 0** (before the `bondLines` query
at `:94`), so a custom-crush/AP lot resolves to its owner's AP bond regardless of ledger history.

**Intake: one pick writer, no owner/grower/tag today.** `writeHarvestPickTx` (`pick-core.ts:31-72`) is
the ONE pick writer (three callers). `HarvestPick` (`schema.prisma:556-578`) carries `weightKg`, field
readings, no owner/grower/weigh-tag/tare. Picks feed crush via `LotHarvestSource` (`crush-core.ts:348`),
where fruit cost enters (`:363-382`). Crush originates a lot but sets NO ownership today.

**No Grower model.** `VineyardDetail.manager` is free-text (`schema.prisma:393`), ~7 read/display sites
(`vineyard/data.ts`, `assistant/entities.ts:458`, `VineyardModal.tsx`, `MapsClient.tsx`). AGENTS.md
9-step checklist for the new table at lines 53-70.

**Monotonic + void-not-delete.** The global monotonic is `LotOperation.id autoincrement` (fold order).
For a **per-tenant** weigh-tag number, mirror the `deltaSeq` + `postingKey` per-tenant-unique pattern
(`schema.prisma:3847-3855`) with query-before-post concurrency (the accounting DocNumber discipline),
plus `voidedAt`/`voidedByOperationId` (mirror `LotTreatment:2113`), FK `onDelete: Restrict`.

**Verify harness (Shape B).** Model on `scripts/verify-vessel-composition.ts`: `runAsTenant("org_demo_winery",…)`,
explicit `{ actorUserId: null, actorEmail: "system@verify-owner-model" }`, `QA-`-prefixed fixtures,
drives the REAL cores, asserts via a local counter, and `scrub()` child→parent BEFORE and on both
success/failure paths. Wire `verify:owner-model` in `package.json` (`tsx --conditions=react-server
--env-file=.env`); register the invariant note so `verify:invariants` discovers it.

**Assistant seam.** `ALL_TOOLS` is ~86 (`registry.ts:125-212`); the doc's "~40" is stale, so we are
past the selection cliff — EXTEND existing tools. `log-harvest-pick.ts` is the D10 write exemplar
(`kind:"write"`, `signProposal` → `commit.ts` COMMITTERS). `query_recent_harvests` / `entities.ts`
(surfaces `manager` at `:458`) is the read seam. `verify:ai-native` (`scripts/verify-ai-native.mjs`)
reds CI on a `*Core` no tool imports; golden evals in `test/evals/*.golden.ts`; coverage 23/26.

### Prior Learnings

- Context-ledger has **no ownership/custom-crush precedent** — this plan sets it (verified by the
  earlier plan-092 query).
- `prisma migrate diff` emits a phantom diff on this schema — **hand-write every migration**.
- `.env` IS prod; migrations reach the live Bhutan tenant — **backfill-then-enforce**, never a bare
  additive migration on a populated table.
- Enum add is its own migration, committed before any default references it (the Windows enum rule).
- `verify:*` scripts must scrub child→parent and by pattern, or a failed run leaves junk in prod.
- `runAsTenant` needs `async () => await` (a bare arrow silently no-ops).

### External Research

Not required. All internal (Prisma/Postgres, our own ledger + assistant infra). The incumbent parity
is already captured in `docs/plans/092-incumbent-parity-ap-custom-crush.md`.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Ownership identity | **First-class `Owner` entity** (tenant-scoped: name, `kind` ∈ {ESTATE-facility is NULL, CUSTOM_CRUSH_CLIENT, AP_PROPRIETOR}, isActive, optional bond link), replacing the `LotOwnership` enum as identity | Keep the two-value enum; a generic party table | The enum can't name a client, which is the whole point. A dedicated `Owner` now (not a unified Party — the incumbents split, parity doesn't force it) with `kind` preserving the billable predicate. |
| Cardinality | **Scalar `ownerId` (one owner or NULL=facility), structured for additive fractional** | Fractional `ownership[]={owner,%}` now | Scalar keeps the future RLS a column compare (plan 092). A future `LotOwnershipShare` table hangs off `Owner` additively if a partner needs JV/fractional. The facility's cut is a CostLine/billing concern, not a share. #1 partner-validation question. |
| Backfill of legacy `CUSTOM_CRUSH_CLIENT` lots | **Seed a per-tenant "Legacy custom-crush client" `Owner` (kind=CUSTOM_CRUSH_CLIENT) and point those lots' `ownerId` at it**; ESTATE lots → `ownerId` NULL | NULL for all; a flag | The enum can't say *which* client, so NULL would lose the billable signal. A placeholder Owner preserves `isBillable` exactly and is renamable/splittable later. |
| Keep the enum? | **NO mirror — cut all 11 readers over to `ownerId` and DROP the enum in F1** (eng-review decision, 2026-07-23) | A maintained compat mirror | A maintained mirror is two sources of truth on a live financial column; any missed maintenance site silently mis-bills a client. ~11 mechanical edits (cheap with CC) kill the drift risk. One source of truth. |
| `ownerId` maintenance surface | **Stamp at the chokepoint for the ledger spine (directional inheritance) + explicit stamping in bottling/materialize + stock/movements; for the non-ledger 1:1-with-lot tables (AnalysisPanel, Sample, LotTastingNote), stamp in their own create core from the lot's owner** | EXISTS-join everything; maintain everywhere | Denormalize (the audit's call) keeps plan 092's RLS a column compare. The 1:1 tables derive their owner from the lot at create; the ledger spine inherits directionally. |
| `CHANGE_OWNERSHIP` shape | **CONDITIONAL on the bond delta (council C1): same bond → pure title transfer + billing event, ZERO TTB; different bond (host↔AP) → title + symmetric transfer-in-bond lines** | Unconditionally post transfer-in-bond (the original) | A standard client is on the host's bond, so most ownership changes are pure title transfers with zero 5120.17 impact — posting a TIB there is a FALSE filing. TIB only crosses distinct BWN. Both models + TTB law. |
| Cross-owner blend | **ALLOW (council C2, reverses the earlier refuse): the receiving owner dominates the scalar result; the consumed minority fraction → a pending `BILLABLE_WINE_CONSUMED` event** | Refuse until `CHANGE_OWNERSHIP` unifies (the original) | Refusing deadlocks the daily topping op (facility wine into a client barrel). Allow-and-bill matches the floor and both incumbents, and stays scalar-compatible. Don't block physical work on title clearing. |
| Weigh-tag shape | **Per-TRUCK `WeighTag` (scale ticket) → per-bin `WeighTagLine` (grower/owner/block) → pick (council)** | Owner/grower on the pick 1:1 | A real mixed truckload carries bins from multiple growers for multiple owners on one ticket; owner/grower belong at the line level. |
| Bond precedence | **AP-owner bond as step 0 in `deriveBond`** | Leave location/lineage only | Both incumbents: an AP owner's bond takes precedence over the location bond. |
| Grower migration | **Add `growerId` FK (nullable) on Vineyard/Block; keep `VineyardDetail.manager` as legacy free-text (not auto-parsed); new intake uses `growerId`** | Migrate manager→grower by parsing the string | Free-text can't be reliably parsed into a Grower. Add the FK, deprecate `manager` in the UI, backfill by hand where obvious. |
| Weigh-tag | **A per-tenant monotonic, void-not-delete `WeighTag` certificate + `WeighGroup` (tare/bin), FK from `HarvestPick`** | Bolt fields onto `HarvestPick` | Both incumbents ship a distinct sequential weigh-tag artifact; a certificate is the auditable, void-not-delete unit that gates receipt. |

## Implementation Units

### Branch F1 — Ownership data model (NO owner-scope RLS)

### Unit 1: The `Owner` entity
**Goal:** A first-class tenant-scoped `Owner` that names a client and carries the billability signal.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_owner_entity/migration.sql` (hand-written), `src/lib/owner/*` (new: owner-core.ts, data.ts)
**Approach:** `Owner { tenantId, id, name, kind (enum OwnerKind { CUSTOM_CRUSH_CLIENT, AP_PROPRIETOR }), isActive, bondId? }`. Facility wine = no Owner (ownerId NULL), so `kind` needs no ESTATE value. Follow the AGENTS.md 9-step checklist (lines 53-70): `tenantId @default("")` + index, FK → organization(id) ON DELETE RESTRICT, per-tenant unique on name, the standard `tenant_isolation` RLS (ENABLE+FORCE+USING+WITH CHECK on `app.tenant_id`), app_rls grants, a case in `verify-tenant-isolation.ts`. Wire `Bond.ownerId` (already exists, `schema.prisma:2493`) as the reverse relation. Design note in the model: a future `LotOwnershipShare(ownerId, lotId, pct)` is the additive fractional extension — do not build it, but leave `Owner` shaped for it.
**Approach (cont. — one shared display helper, design review):** ship `ownerLabel(owner: Owner | null): string → owner?.name ?? "Estate (facility)"` in `src/lib/owner/data.ts`. It is the SINGLE definition of how a NULL owner renders, consumed by the assistant confirm cards (Unit 12), the verify script (Unit 11), and every future GUI cell (plan 092). "Facility's own wine" must never surface as a blank column that reads as unknown/missing; defining it once means the confirm card and the future client-facing home can't drift on the label. (Distinct from an unresolved *intake line*, which carries `needsOwnerAssignment` — Unit 9 — and is NOT labeled "Estate.")
**Tests:** Schema-shape test (tenantId, unique, RLS present); `verify:tenant-isolation` picks up `Owner`; a unit test on `ownerLabel(null)` and `ownerLabel(client)`.
**Depends on:** none
**Verification:** `npm run verify:tenant-isolation` green with `Owner` in the coverage set.

### Unit 2: `ownerId` columns on the owner-scope surface
**Goal:** Every owner-scoped table carries a nullable `ownerId` FK, ready for plan 092 to scope.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_owner_id_columns/migration.sql` (hand-written)
**Approach:** Add nullable `ownerId` + a `(tenantId, ownerId)` index to the lot spine + lot-referencing children + `WineSku`/`BottledInventory` (the ~25-table appendix). **⚠️ Council CRITICAL (Codex): owner-specific UNIQUEs must include `ownerId`, not just an index** — two clients can legitimately have the same varietal/vintage `WineSku` (the coalescence audit flagged this too), so `WineSku`'s identity unique and `BottledInventory`'s at-location unique must add `ownerId` where the object is owner-specific. Audit every owner-scoped unique. **⚠️ Council CRITICAL (Codex): batched backfill, not one migration** — a single UPDATE across the lot spine + ~25 children locks hot tables and stalls `runLedgerWrite` under PgBouncer/SERIALIZABLE. Split: (a) add columns + indexes (fast, additive); (b) **batched backfill** by tenant, in dependency order (a child's `ownerId` comes from its lot AFTER the lot is stamped, never a stale ancestor walk); (c) a post-backfill **consistency query** asserting every child's `ownerId` == its lot's. Backfill from `Lot.ownership`: seed a per-tenant "Legacy custom-crush client" `Owner`, point `CUSTOM_CRUSH_CLIENT` lots + children at it; ESTATE → NULL. Leave nullable (facility wine is legitimately NULL). Hand-write; `migrate diff` phantoms.
**⚠️ Lossy-backfill flag (Codex design-Q):** the old enum can't name *which* client, and there's no data to recover it from — so a tenant that already ran multiple custom-crush clients collapses them into one placeholder `Owner`. The backfill is lossy by necessity; **a human re-assigns legacy client lots** to real Owners after the fact (a `/developer` task, out of this plan's automation).
**Tests:** Schema-shape drift test (every listed table has `ownerId` + index); a test asserting two clients can hold the same `(name, vintage)` `WineSku` under different owners; a backfill test on Demo (CUSTOM_CRUSH_CLIENT → legacy Owner, ESTATE → NULL); the consistency query passes post-backfill.
**Depends on:** Unit 1
**Verification:** Row-count check per tenant; the drift + consistency tests.

### Unit 3: Cut all 11 `Lot.ownership` readers over to `ownerId`, drop the enum (eng review)
**Goal:** One source of truth for ownership — cost still bills client-owned wine back, keyed on the Owner, with NO enum mirror to drift.
**Files:** `src/lib/cost/data.ts`, `src/lib/cost/cache.ts`, `src/components/cost/CostPanel.tsx`, `src/lib/ledger/combine.ts` + `combine-state.ts`, `src/lib/cellar/split-core.ts`, `scripts/verify-cost.ts`, `prisma/schema.prisma` (drop `Lot.ownership` + the `LotOwnership` enum), a migration
**Approach (eng-review decision — NO mirror; council refinement — EXPAND/MIGRATE/CONTRACT):** the plan originally kept `Lot.ownership` as a derived mirror; the eng review flagged it as two sources of truth on a live financial column. Instead migrate ALL 11 `Lot.ownership` read sites (research: `cost/data.ts:107-108,113,138,167,219`, `cache.ts:51`, `split-core.ts:266`, `combine-state.ts:81`, `combine.ts:98,199`, `CostPanel.tsx:36`) to resolve `owner.kind` from `ownerId` (client-owned = a non-null owner of a client kind); replace `isBillable` (`data.ts:108`). **⚠️ Council CRITICAL (Codex): the enum DROP is a separate LATER migration, not this branch.** On prod with direct migrations, an old worker can read a dropped column and a new worker can compile against a not-yet-deployed enum. Expand/migrate/contract: (1) F1 adds `Owner`/`ownerId` + backfill + the reader cutover (reads ONLY `ownerId`); the column stays present but unread; (2) after the new build is fully deployed and stable, a **later contract migration** drops `Lot.ownership` + the `LotOwnership` enum. This unit ships the cutover; the drop is its own follow-on migration gated on deploy.
**Tests:** `verify:cost` (41 assertions incl. `:216-224`, re-pointed at an Owner) stays green; a test asserting a client-Owner lot is billed-not-capitalized identically to the old enum; a grep test that no code READS `Lot.ownership` after the cutover (the column may still exist until the contract migration).
**Depends on:** Units 1, 2, 4 (ownerId maintained before any reader moves off the enum)
**Verification:** `npm run verify:cost` green; the no-reader grep test.

### Unit 4: Maintain `ownerId` at EVERY write site (eng review: the complete surface)
**Goal:** `ownerId` is correct on every new/derived row — inherited directionally, and stamped at every lot-create site so nothing lands silently NULL.
**Files:** `src/lib/ledger/write.ts`; **all 8 `lot.create` cores** — `src/lib/transform/crush-core.ts:270`, `press-core.ts:265`, `src/lib/blend/blend-core.ts:238`, `src/lib/cellar/split-core.ts:252`, `src/lib/sparkling/disgorgement-core.ts:98`, `src/lib/bulk/actions.ts:120`, `src/lib/bottling/run.ts:257`, `src/lib/migration/publish.ts:77`; `src/lib/bottling/materialize.ts`, `src/lib/stock/movements.ts`; the 1:1-with-lot create cores (ferment panels, Sample/TastingNote).
**⚠️ Eng-review finding (P1): the fold is NOT the whole surface.** The directional fold stamps descendant *composition/projection* rows; the originating **`Lot.ownerId` is set where the lot ROW is created**, and there are **8 `lot.create` sites**, none of which set ownership today. The landmines: `migration/publish.ts` (imports lots — a client lot would land NULL = facility = a mis-scope once plan 092 enforces) and `bulk/actions.ts` (manual seed). Every `lot.create` must stamp `ownerId` (from the consuming picks at crush, from the source lots at blend/press/split/disgorge, from the seed at import — see Unit 10 for intake, this Unit's decision below for import).
**Approach:**
- **Originating lot owner** — stamp `ownerId` at each of the 8 `lot.create` sites: crush/press/split/disgorge/blend take the **dominant/receiving owner** of the consumed/parent lots (the minority owner's fraction is billed, not refused — Unit 6); `bulk/actions` (manual) takes an explicit owner or NULL; `bottling/run` (sparkling continuable) inherits from the source lot; **`migration/publish` stamps from the seed (import→owner decision below).**
- **Descendant rows** — in `syncVesselComponents` (`write.ts:423-593`) add a **parallel owner fold**. **⚠️ Eng-review finding (P1): it MUST read the consumed lots' CURRENT `ownerId` column, NOT walk lineage** (the composition fold uses `composeLeaves` over ancestor leaves at `write.ts:480` — if the owner-fold copies that, a `CHANGE_OWNERSHIP` gets silently undone by the next blend re-deriving the OLD owner from unchanged ancestors). Key it on the same consumed/gained sets + the `identityChanging`/`CORRECTION` direction gate (`:478`,`:494-497`,`:548-550`), resolving the **dominant** owner from the set members' current column (Unit 6's dominance rule). Stamp on the explicit line/projection writes (`:231-250`,`:276-278`), in `materialize.ts` (finished goods from the source lot), and `movements.ts`. The 1:1 tables stamp from the lot in their own create core.
- **`ownerId` is a maintained PROJECTION, not immutable ledger truth** (eng review): like `vessel_component`, it is re-folded/re-stamped, so `CHANGE_OWNERSHIP` UPDATE-ing descendants is consistent with append-only — the immutable record is the `CHANGE_OWNERSHIP` *op*, the column is a cache. State this in `INVARIANTS.md`.
**import→owner (eng-review decision, 2026-07-23):** `migration/publish.ts` stamps `ownerId` from the migration seed — add `ownerId`/owner-name to the seed shape and resolve-or-create the `Owner`. The foundation's whole point is that a custom-crush partner's migrated wine lands correctly owned; leaving it NULL defeats it. (Full Vintrace/InnoVint import mapping is Phase 13, but the *column stamping* at publish is this plan.)
**Tests:** `ownerId` inherits directionally across crush→rack→blend→bottle AND across a reversal; a CORRECTION re-stamps to the receiver; a `CHANGE_OWNERSHIP` then a blend keeps the NEW owner (the re-derivation guard); every `lot.create` site stamps an owner (or explicit NULL); an imported client lot lands owned, not NULL; facility wine stays NULL.
**Depends on:** Units 1, 2, 6
**Verification:** Covered by `verify:owner-model` (Unit 11); a `runAsTenant` read-back across a full chain + a CHANGE_OWNERSHIP-then-blend chain.

### Unit 5: The `CHANGE_OWNERSHIP` operation
**Goal:** A real, reversible, TTB-reportable change of proprietor.
**Files:** `prisma/schema.prisma` (+ `prisma/migrations/<ts>_change_ownership_optype/migration.sql`, enum-only), `src/lib/ledger/vocabulary.ts`, `src/lib/owner/change-ownership-core.ts` (new), `src/lib/ledger/reverse.ts`
**⚠️ Council C1 (both models): owner change ≠ bond change.** A standard custom-crush client is on the HOST's bond, so a host↔client ownership change is a **pure TITLE transfer with ZERO 5120.17 impact** — posting transfer-in-bond lines there is a FALSE TTB filing that fails an audit. TIB applies ONLY when the wine crosses distinct bonded-winery numbers (host ↔ an AP proprietor). So the op is **CONDITIONAL on the bond delta**, not unconditionally a transfer-in-bond.
**Approach (conditional, council decision 2026-07-23):** add `CHANGE_OWNERSHIP` to `OperationType` in its OWN enum-only migration (mirror `20260629000000_add_blend_optype`), committed before the core writes it; add it to `vocabulary.ts` OPERATION_TYPES (`:40`). `changeOwnershipCore` computes the **old bond vs the new bond** (via `deriveBond`, with the Unit 7 AP-owner precedence) inside the op:
- **same bond** (host↔client on the primary bond, or two clients sharing a bond) → a **pure title transfer**: re-stamp `ownerId` (the lot + descendants, as a projection re-stamp) + emit a **billing/invoice event**, and post **NO TTB line** (zero 5120.17 impact);
- **different bond** (host ↔ AP proprietor, AP ↔ AP — distinct BWN) → re-stamp `ownerId` AND post the symmetric Received/Removed-in-Bond lines to both bonds via `transferInBondTx` (`transfer-in-bond-core.ts:86-179`), after **verifying the tax class matches on both sides** (Gemini — a TIB into an AP with a declared class must not straddle classes).
Reversible via the bond-swap CORRECTION path (`reverse.ts:377`) which mirrors the **exact bond delta** (a title-only change reverses with no TTB line; a TIB reverses symmetrically). Register `reversibilityOf("CHANGE_OWNERSHIP") → { family: "bond" }`.
**Tests:** a host→client change on the SAME bond posts ZERO TTB lines + re-stamps ownerId + emits the billing event; a host→AP change on a DIFFERENT bond posts the symmetric TIB lines + re-stamps; a cross-tax-class TIB is refused; both reverse cleanly (LEDGER-11 later-touch honored); `observedAt` drives an Amended report only when a TTB line was posted.
**Depends on:** Units 1, 2, 4, 7 (needs AP-bond precedence to compute the delta)
**Execution note:** the enum migration lands and commits FIRST, alone.
**Verification:** `npm run verify:bond` + `verify:ttb` stay green; a title-vs-TIB round-trip test.

### Unit 6: Cross-owner blends — allow, receiving owner dominates, bill the minority
**Goal:** A cross-owner blend (the daily topping case) proceeds physically; the commercial side is captured, not blocked.
**⚠️ Council C2 (REVERSES the earlier "refuse" decision, 2026-07-23):** refusing a cross-owner blend deadlocks the most common custom-crush op — topping a client's barrel with the facility's own (NULL-owner) wine. Forcing a `CHANGE_OWNERSHIP` before a cellar hand can top a barrel is backwards. Both incumbents allow it. So: **allow the physical blend; do not block cellar work on commercial title clearing.**
**Files:** `src/lib/blend/blend-core.ts`, `src/lib/ledger/write.ts` (the owner-fold), a new billing event core `src/lib/owner/billable-consumption-core.ts`, `prisma/schema.prisma` (a `BillableWineConsumed` event or a cost-side ledger entry), `test/blend-*.test.ts`
**Approach (scalar-compatible, keeps one owner per lot):** a cross-owner blend succeeds; the **receiving lot's owner dominates** the scalar `ownerId` of the result (GROW_EXISTING keeps the resident owner; NEW_LOT takes the majority-volume owner — define the tiebreak). Each **consumed minority owner's fraction generates a pending `BILLABLE_WINE_CONSUMED` event** (owner, volume, source lot → the facility bills the client for topping wine, or a JV reconciles commercially). This reuses the cost model's billable seam (`cost/data.ts` billable). Remove the bond-straddle-style owner *refusal*; keep it only for the genuinely-illegal case if any (cross-tax-class stays refused via the existing `TAXCLASS-1` guard). Note: the existing `combine.ts:98-106` owner-mismatch refusal on ABSORB must be reconciled — relax it to the same allow+bill model, or it re-introduces the deadlock on the absorb path.
**Tests:** topping a client lot with facility wine succeeds, the child keeps the client owner, a `BILLABLE_WINE_CONSUMED` event is emitted for the facility fraction; a two-client blend succeeds with the majority owner + a billable event for the minority; the billable event reverses if the blend is corrected; cross-tax-class still refuses.
**Depends on:** Units 1, 4
**Verification:** `npm run verify:reverse-transform` + blend suites green; `verify:cost` still green (the billable event doesn't double-count); a new billable-consumption test.

### Unit 7: AP-owner bond precedence
**Goal:** A custom-crush/AP owner's bond wins over the location/primary bond.
**Files:** `src/lib/compliance/bond.ts`
**Approach:** Insert a step 0 at the top of `resolveBondsForLots` (before the `bondLines` query at `bond.ts:94`): if the lot's `ownerId` resolves to an Owner with an AP bond, return it; else fall through to the existing ledger→lineage→primary order. `deriveBond` (`:152-157`) unchanged (delegates).
**Tests:** An AP-owned lot derives its owner's bond regardless of ledger/lineage; an estate lot's derivation is unchanged (existing `verify:bond` cases still pass).
**Depends on:** Units 1, 2
**Verification:** `npm run verify:bond` green with a new AP-precedence case.

### Branch F2 — Intake spine

### Unit 8: The `Grower` entity + vineyard/block FK
**Goal:** Fruit is attributable to a first-class grower for TTB.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_grower_entity/migration.sql`, `src/lib/grower/*` (new), `src/lib/vineyard/*` (add growerId)
**Approach:** `Grower { tenantId, id, name, company?, contact?, address?, isEstate, isActive }` — full AGENTS.md 9-step (tenant_isolation RLS, etc.). Add nullable `growerId` FK on `Vineyard` and `VineyardBlock`. Keep `VineyardDetail.manager` as legacy free-text (deprecate in UI; do NOT auto-parse it into a Grower). New intake sets `growerId`.
**Tests:** Schema-shape + `verify:tenant-isolation` picks up `Grower`; a vineyard can carry a grower.
**Depends on:** none
**Verification:** `npm run verify:tenant-isolation` green with `Grower`.

### Unit 9: Weigh-tag (per-TRUCK) → weigh-tag-line (per-bin) → pick
**Goal:** Fruit receipt is gated by a per-tenant monotonic, void-not-delete scale ticket that models a real mixed truckload.
**⚠️ Council SHOULD-FIX (Gemini): a weigh-tag is per-TRUCK, not per-pick.** One scale ticket (gross/tare/net) covers a flatbed of many bins from multiple growers for multiple owners. So owner/grower attach at the **line/bin** level, not the tag.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_weigh_tag/migration.sql`, `src/lib/harvest/weigh-tag-core.ts` (new), `src/lib/harvest/pick-core.ts`
**Approach:** `WeighTag { tenantId, id, tagNumber (per-tenant monotonic), issuedAt, weighmaster, truck, grossKg, tareKg, netKg, voidedAt?, voidedByReason? }` (the truck/scale-ticket header) → child **`WeighTagLine` { weighTagId, binOrGroup, growerId?, ownerId?, blockId?, netKg }** (per-bin, carries grower + owner + block). `HarvestPick.weighTagLineId` FK (`onDelete: Restrict`, mirror `LotHarvestSource:1916`) links a pick to a line.
**⚠️ Receive-now-assign-later (design review — the scale-house error state).** `growerId`/`ownerId`/`blockId` on `WeighTagLine` are nullable BY DESIGN, and issuing a tag MUST NOT hard-block on a missing owner or grower. A weighmaster outdoors under harvest time-pressure records the certified **weight** first; a bin whose owner/grower isn't known at the scale is recorded with the net weight, and the tag is issued. Keep this an explicit intent so a later validation guard never makes owner/grower required at issue — that would recreate the exact deadlock Council C2 killed at the blend, one step earlier at the scale.
- **A NULL owner on a line is AMBIGUOUS unless disambiguated** — it could mean "facility's own fruit (estate)" OR "not keyed yet." Everywhere else `ownerId NULL = estate` is load-bearing (the cost predicate, the verify), so do NOT overload NULL on the line. Add an explicit `needsOwnerAssignment Boolean @default(false)` (and treat it as the "surface for a later pass" flag). NULL owner + `needsOwnerAssignment=false` = deliberately estate fruit; NULL owner + `needsOwnerAssignment=true` = unresolved, must be assigned before the line's pick can carry ownership to a lot. Crush (Unit 10) refuses to originate a lot from a line still flagged `needsOwnerAssignment` (that IS a legitimate hard stop — you can't co-ferment fruit of unknown title — but it stops at CRUSH, not at the scale).
- The unresolved line is surfaced as "needs assignment" for a later pass (the surfacing GUI is deferred to plan 092; the data must permit it now). The verify script asserts: an intake with a deferred owner succeeds and issues a tag; the line is later resolvable without renumbering or voiding the tag; and a crush from a still-unresolved line refuses with a clear reason.
**⚠️ Council CRITICAL (Codex): the tag-number allocator.** A naked `MAX(tagNumber)+1` under SERIALIZABLE + `withWriteRetry` + PgBouncer either bounces on the unique or burns numbers, and a bare sequence gaps on rollback. Use a **per-tenant counter row incremented with `SELECT ... FOR UPDATE` inside the same tenant tx**, then insert the tag from that value (gap-free). If gap-free turns out not to be a compliance requirement, use a sequence and accept gaps — but DECIDE explicitly (default: gap-free counter row). Never delete a tag — void with `voidedAt` (mirror `LotTreatment:2113`). AGENTS.md 9-step for all new tables.
**Tests:** Tag numbers are gap-free and monotonic per tenant under CONCURRENT issue (a real concurrency test, not a single-threaded one) — no duplicates, no gaps, no deadlock; a voided tag stays visible and doesn't renumber; one tag carries multiple lines with different growers/owners; a pick links to a line.
**Depends on:** Units 1 (Owner), 8 (Grower)
**Verification:** A concurrency test on the counter-row allocator; schema-shape.

### Unit 10: Pick owner/grower/sold (via the weigh-tag line) + carry ownership to the lot
**Goal:** A pick's owner/grower/sold flows from its weigh-tag line; crush carries the owner onto the originated lot.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_pick_owner_grower/migration.sql`, `src/lib/harvest/pick-core.ts`, `src/lib/transform/crush-core.ts`
**Approach:** A pick's owner + grower come from its `WeighTagLine` (Unit 9), not stamped directly on the pick — the line is the source of truth for the bin. Add `sold Boolean` to `HarvestPick` (→ TTB Part IV fruit removal) and the `weighTagLineId` link. At crush (`crush-core.ts:348`), stamp the originated `Lot`'s `ownerId` from the consuming picks' lines: if the picks resolve to more than one owner, the **dominant** owner wins and the minority is billed (Unit 6's allow-and-bill model), NOT refused — a crush of mixed-owner fruit is legitimate (a co-fermented cuvée). Crush sets no ownership today, so this is the intake→ownership bridge. **One legitimate hard stop:** a pick whose line is still flagged `needsOwnerAssignment` (Unit 9) refuses at crush with a clear reason — you cannot originate a titled lot from fruit of unknown title. This stop is at CRUSH (a desk decision, resolvable), never at the scale (the wet-hands receipt).
**Tests:** A pick's owner/grower resolve from its weigh-tag line; crush originates a lot with the dominant owner; mixed-owner crush emits a billable event for the minority, not a refusal.
**Depends on:** Units 1 (Owner), 8 (Grower), 9 (WeighTagLine)
**Verification:** Covered by `verify:owner-model`; a crush read-back.

### Unit 10b: Minimal weigh-tag entry screen (branch F2) — DESIGN-REVIEWED
**Goal:** A wet-hands weighmaster can issue a weigh-tag from a screen, one truck at a time, fast, without narrating to the assistant. This is the make-or-break first surface a paying custom-crush partner touches. Russell's call (design review, 2026-07-23): ship it in the foundation, don't defer to 092.
**Scope:** ONE screen. Issue + view + void a weigh-tag. NOT the client "Your wine" home, NOT owner/grower CRUD screens (owner/grower are picked from existing reference data; creating them stays in reference-data admin / the assistant for now), NOT owner-scope RLS (plan 092).
**Files:** a route under `src/app/(app)/harvest/` (co-locate with existing harvest UI), a client form component, a thin server action calling `weighTagCore` (Unit 9). Reuse `/styleguide` components — no new deps.
**DESIGN.md compliance:** warm-editorial APP UI (calm surface hierarchy, not a card mosaic); tokens only (no hardcoded color/font/spacing; warm shadows `rgba(43,42,38,*)`); sentence-case buttons ("Issue tag", "Add bin", "Void tag"); Inter body / Inter Tight light headings; `tabular-nums` on every weight; light-only.
**Information hierarchy (top → bottom):**
1. **Tag header** — the scale ticket: truck, weighmaster, date, then gross / tare / net (net is the anchor figure, largest, tabular). Net auto-derives (gross − tare) but stays editable (some scales print net directly).
2. **Bin lines** — a vertical add-a-line repeater (NOT a wide grid): each line is `net · grower · owner · block`. grower/owner/block are typeahead selects over existing reference data, each **defaulting to "needs assignment"** (Unit 9 `needsOwnerAssignment`), so a worker can add a bin with only a weight and keep moving. "Add bin" appends; a line is removable before issue. Owner select renders NULL as "Estate (facility)" via `ownerLabel` — distinct from the "Needs assignment" default.
3. **Issue** — one primary action; on success the gap-free tag number is shown as the receipt (it's a certificate).
**Interaction states (all specified — empty states are features):**
- **Empty (no tags yet):** not "No weigh-tags found." A warm first-run: a one-line explainer ("Weigh-tags certify fruit as it arrives.") + the primary "New weigh-tag" action. Harvest-season framing, not a dead end.
- **Loading:** the reference-data typeaheads (grower/owner/block) load with the form; a slow load shows skeleton rows, never a blank select that looks empty/broken.
- **Error (issue fails):** the tag number allocator or a server error surfaces inline above the Issue button with the reason (never a silent no-op); the entered lines are preserved (a weighmaster does not re-key 8 bins).
- **Partial (the whole point):** a bin with only a weight and "needs assignment" for owner/grower issues successfully and shows a quiet "n lines need assignment" affordance on the tag — surfaced, not blocking. This is the designed happy path for the scale, not an error.
- **Void:** void (not delete) asks for a reason, keeps the tag visible and struck-through with its number intact, never renumbers.
**Empty owner/grower reference data:** if a tenant has zero Owners yet (brand-new custom-crush facility), the owner select still offers "Estate (facility)" + "Needs assignment" and points to where clients are added — it never presents an empty, unusable dropdown.
**Responsive / a11y:** the crush pad may be a tablet outdoors — 44px min touch targets, the bin repeater stacks cleanly at tablet width (not a horizontally-scrolling grid), every control keyboard-reachable, weights right-aligned tabular. Screen-reader labels on each bin line's role (grower/owner/block).
**Tests:** component renders the token classes (no hardcoded values — mirror existing UI tests); a manual-QA note (the repo has no jsdom/RTL, so interaction is manual-QA against the Demo Winery per CLAUDE.md); the server action is covered by `weighTagCore`'s Unit 9 tests. Flag in the plan: the DB write is proven by Unit 9/11, the screen is proven by manual QA + the browser-QA flow.
**Depends on:** Units 1 (Owner + `ownerLabel`), 8 (Grower), 9 (WeighTag/WeighTagLine + `needsOwnerAssignment`)
**Verification:** manual QA against Demo Winery (issue a mixed 8-bin tag, one bin deferred, then void); `npm run lint` + build green.

### Branch F3 — Verify + assistant + docs

### Unit 11: `verify:owner-model` + the invariant note
**Goal:** Prove the ownership model correct against real custom-crush scenarios, with NO RLS.
**Files:** `scripts/verify-owner-model.ts` (new), `package.json`, `docs/architecture/invariants/OWNER-1-ownership-model.md` (new)
**Approach:** Model on `scripts/verify-vessel-composition.ts` (Shape B): `runAsTenant("org_demo_winery",…)`, explicit system actor, `QA-`-prefixed fixtures, drive the REAL cores, assert via a counter, `scrub()` child→parent before + on both paths. Assertions: a cross-owner blend refuses with the right reason; a `CHANGE_OWNERSHIP` then unblocks it and re-stamps descendants + posts the transfer-in-bond TTB lines; `ownerId` inherits directionally across crush→rack→blend→bottle AND across a reversal; bond derives with AP-owner precedence; facility wine stays NULL; `isBillable` matches the pre-migration answer. Invariant note frontmatter: `severity: critical`, `enforcedBy: app-code`, `verify: npm run verify:owner-model`.
**Tests:** The script IS the test.
**Depends on:** Units 1-10
**Verification:** `npm run verify:owner-model` exits 0; `npm run verify:invariants` resolves the note.

### Unit 12: Assistant coverage (extend, don't proliferate)
**Goal:** Weigh-tag intake, ownership change, and Owner/Grower lookup are drivable by the assistant.
**Files:** `src/lib/assistant/tools/log-harvest-pick.ts` (extend), a new `src/lib/assistant/tools/change-ownership.ts`, `src/lib/assistant/registry.ts`, `src/lib/assistant/commit.ts`, `src/lib/assistant/entities.ts` (Grower read), `test/evals/assistant-write-tools.golden.ts`, `test/evals/assistant-read-tools.golden.ts`
**Approach:** EXTEND `log_harvest_pick` to accept weigh-tag/owner/grower on intake (D10 propose→confirm, mirror `log-harvest-pick.ts:105-127`) — the "took in 4 tons of Cab from Smith Ranch, bin weights…" path. A NEW discriminated `change_ownership` write tool (the highest-blast-radius write here → D10 confirm, readback of the exact owner change). Owner/Grower READ rides `query_recent_harvests` / `entities.ts` (already surfaces `manager`) — no new read tool. Wire committers in `commit.ts`; golden case per new/extended write tool; keep `verify:ai-native` green (the new `changeOwnershipCore` + `weighTagCore` must be imported by a tool or allow-listed).

**⚠️ Confirm-card content contract (design review, 2026-07-23).** The existing `preview` is a single flat sentence (`log-harvest-pick.ts:104`). That is fine for one weigh-in and WRONG for a truck. The confirm card is the only place a human catches a mis-keyed owner before it hits an append-only ledger, so its content is a correctness surface, not cosmetics:
- **Multi-bin intake readback is structured, per-line, not one sentence.** A weigh-tag with N bins renders one line PER `WeighTagLine`: `bin/group · net (as-interpreted, e.g. "1,814.37 kg / 2.00 short tons") · grower · owner · block`, under a tag header (tag #, truck, weighmaster, gross/tare/net). The propose payload carries the parsed lines as an array so the human confirms the *manifest*, not a summary that could hide a bin assigned to the wrong client. Reuse `describeWeight()` per line (the unit-slip guard already in the exemplar). A single-bin truck collapses to one line — no regression.
- **`change_ownership` readback states WHICH legal outcome (Unit 5's conditional) in words.** The card must say, distinctly, either **"Title transfer only — no TTB filing"** (same bond) or **"Transfer in bond — files a TTB 5120.17 movement to bond {X}"** (different bond), computed at propose time via the same `deriveBond` delta the commit will use. The two outcomes carry very different legal weight; the operator must see the difference before tapping confirm, not discover it after. Include old owner → new owner and the bond on both sides.
- **NULL owner never renders blank.** Resolve display through one shared `ownerLabel(owner)` helper (Unit 1) → `owner?.name ?? "Estate (facility)"`. Applies to every preview line and every future GUI cell so "facility's own wine" is never an empty column that reads as "unknown/missing." Same helper defines the confirm-card and the verify-script labels so they can't drift.
- **Billable top is disclosed, not silent, not blocking (Unit 6).** When an intake or blend confirm implies a `BILLABLE_WINE_CONSUMED` event (facility wine into a client barrel), the card carries ONE passive line: `"Tops a client barrel — a billable topping charge (owner {X}, {vol}) will be recorded."` It informs; it does not add a second confirm step or gate the physical top. (Where a bookkeeper later *reviews* accrued charges is a GUI surface deferred to plan 092 / a billing plan — this foundation only guarantees the event is disclosed at write time and is query-shaped: owner, volume, source lot, timestamp.)
**Tests:** Golden cases; `verify:ai-native` green + coverage doc regenerated; a MUST_PROPOSE case for the intake path (invented grower/owner = failure); a golden asserting an 8-bin/2-owner truck renders 8 distinct readback lines (not a collapsed summary); a golden asserting the `change_ownership` card copy differs for the title-only vs TIB branch; a golden asserting a NULL-owner line reads "Estate (facility)".
**Depends on:** Units 5, 9, 10
**Verification:** `npx vitest run test/evals/`; `npm run verify:ai-native`.

### Unit 13: Docs + registers
**Goal:** The brain stays true; the foundation↔enforcement seam is legible.
**Files:** `INVARIANTS.md`, `docs/architecture/system-map.md`, `docs/architecture/data_model_coalescence.md`, `docs/architecture/security-register.md`
**Approach:** Add OWNER-1 to `INVARIANTS.md`; update the system map with the `Owner`/`Grower`/`WeighTag` entities + the CHANGE_OWNERSHIP op; mark the coalescence doc's P0 data-model items as BUILT (this foundation) vs the enforcement half (plan 092); a security-register note on the ownership model as the pre-RLS foundation. Correct the stale teardown/crosswalk `[ABSENT]` tags for the items this ships (Owner, CHANGE_OWNERSHIP, Grower, weigh-tags).
**Tests:** `npm run verify:invariants`; `npm run verify:ai-native` check mode.
**Depends on:** all
**Verification:** both green.

## Owner-Scope Surface (the `ownerId` column list — appendix)

Sourced from the research grep of `lotId`-bearing models + finished goods. Every table gets a nullable
`ownerId` + `(tenantId, ownerId)` index (Unit 2); maintenance per Unit 4.

**Ledger-spine (stamped at the chokepoint / transform cores):** `Lot`, `LotOperationLine`, `VesselLot`,
`LotHarvestSource`, `LotStateEvent`, `BottledLotState`, `LotVineyard`, `LotTreatment`, `CostLine`,
`BarrelFill`.
**Explicit-stamp cores (finished goods / stock):** `WineSku`, `BottledInventory`, `BottlingSource`,
`StockMovement`, `BottlingRun`.
**1:1-with-lot standalone (stamp from the lot in their create core):** `AnalysisPanel`, `Sample`,
`LotTastingNote`, `LotIdentifier`, `LotCodeEvent`.
**Non-ledger / decide per plan review:** `BlendTrialComponent` (bench trial), `ChangeOfTaxClassEvent`,
`LotCostState` (lazy cache — derive), `WorkOrderTask.lotId?`, `Reservation.lotId?`.

## Test Strategy

Three layers, matching how this repo proves a model.

**Pure/unit** — the owner-fold direction rule, the billable predicate over Owner, the monotonic tag
assignment, the cross-owner guard. Fast, no DB.

**DB model proof** — `npm run verify:owner-model` (Shape B, Demo Winery, QA- fixtures): the full
scenario set above. This is the gate the foundation-first approach exists to produce — it proves the
ownership model correct BEFORE plan 092 enforces on it.

**Regression** — `verify:cost` (billable split), `verify:bond` (AP precedence + existing cases),
`verify:reverse-transform` (blend + reversal), `verify:tenant-isolation` (new tables), `verify:ai-native`
(assistant coverage) all stay green.

## Rollout

1. F1 lands the ownership data model behind no flag; existing behavior is unchanged (legacy lots
   backfilled to the placeholder Owner preserve `isBillable`; facility wine is NULL; the enum mirror
   keeps the 11 read sites working). No RLS, so nothing is fenced yet.
2. F2 lands the intake spine (additive tables + nullable pick columns).
3. F3 proves it: `verify:owner-model` must pass on Demo, then on the real tenant's backfill (dry-run
   read-back), before anyone relies on the model.
4. **Only after this foundation is verified does plan 092 build the owner-scope RLS on top.** The
   first genuinely scoped client is a plan-092 concern, not this one.

## Open Questions

1. **The exact non-ledger table set for `ownerId`** (the appendix's "decide per plan review" row) —
   `BlendTrialComponent`, `WorkOrderTask.lotId?`, `Reservation.lotId?`. Scope them if plan 092 will
   fence them; leave them tenant-only otherwise. Resolve at `/plan-eng-review`.
2. **Drop `Lot.ownership` now or later?** Kept as a mirror this plan; the cleanup PR that removes it
   (once all 11 readers move to `owner.kind`) is a follow-on.
3. **`OwnerKind` values** — CUSTOM_CRUSH_CLIENT vs AP_PROPRIETOR: do we need the distinction now, or is
   one client kind + the bond link enough? Council question.

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | The re-sequencing decision is explicit; the audit confirmed the gaps. |
| Scope Boundaries | HIGH | The foundation↔enforcement (092) line is clean: no owner-scope RLS here. |
| Implementation Units | HIGH | Every seam is grounded in a file:line from research; reuses existing machinery (transfer-in-bond, directional fold, verify harness). |
| Test Strategy | HIGH | The verify harness pattern exists (`verify-vessel-composition`); this is its whole point. |
| Risk Assessment | MEDIUM | The `ownerId` backfill + the 25-table maintenance surface is the risk; the enum-mirror compat + the verify script are the mitigations. The non-ledger table set (Q1) is the one open scope item. |

The `ownerId` maintenance across ~25 tables on a live ledger is the sharpest thing to put to
`/plan-eng-review` — specifically whether the directional owner-fold + explicit-stamp sites are
complete, and the exact non-ledger table set.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES RESOLVED | 3 correctness fixes + 2 decisions; all folded in |
| Council | `/council` | Cross-LLM (codex+gemini) | 1 | ISSUES RESOLVED | 2 CRITICAL (owner≠bond, topping deadlock) + 3 decisions + fold-ins |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES RESOLVED | 5/10 → 9/10; 4 fold-ins + 1 scope decision (ship the weigh-tag screen) |

**ENG REVIEW (2026-07-23):** Verified the plan against the live code. Three correctness gaps caught
and fixed, two decisions taken to the complete option:
- **[P1] Maintenance surface was incomplete** — the plan conflated the directional composition fold
  with lot creation. There are **8 `lot.create` sites** (crush/press/blend/split/disgorge/bulk/
  bottling-run/**migration-publish**), none setting ownership today; the fold only stamps descendant
  rows. `migration/publish` + `bulk/actions` were silent-NULL landmines (NULL = facility → a mis-scope
  once plan 092 enforces). Unit 4 now enumerates and stamps all 8.
- **[P1] The owner-fold must read the consumed lots' CURRENT `ownerId` column, not lineage** — the
  composition fold it mirrors uses `composeLeaves` over ancestor leaves (`write.ts:480`); copying that
  would let the next blend re-derive the OLD owner and silently undo a `CHANGE_OWNERSHIP`. Stated explicitly.
- **[P2] `ownerId` is a maintained PROJECTION, not immutable ledger truth** (like `vessel_component`),
  so `CHANGE_OWNERSHIP` UPDATE-ing descendants is consistent with append-only. Stated in INVARIANTS.
- **DECISION: no enum mirror** — cut all 11 `Lot.ownership` readers to `ownerId` and drop the enum in
  F1 (one source of truth, no drift on a live financial column).
- **DECISION: `migration/publish` stamps `ownerId` from the seed** — a custom-crush partner's migrated
  wine must land correctly owned (full Vintrace/InnoVint import mapping stays Phase 13).

**Scope:** no reduction — the ~25-table surface is inherent to the denormalize decision (plan 092). The
foundation-first split from 092 is sound (verify the model before the expensive RLS).

**UNRESOLVED:** none blocking. Open Q1 (the exact non-ledger table set) and Q3 (`OwnerKind` values) go
to `/council`.

**COUNCIL (2026-07-23; Codex gpt-5.4-mini + Gemini 3.1 Pro):** two CRITICALs a code-correctness pass
couldn't catch, both domain/legal, both folded in. **C1 — owner change ≠ bond change:** posting a TTB
transfer-in-bond on every ownership change is a FALSE filing for a standard client on the host's bond;
`CHANGE_OWNERSHIP` is now conditional (title-only when the bond doesn't change, title+TIB only host↔AP).
**C2 — the topping deadlock:** refusing cross-owner blends freezes the daily op (topping a client barrel
with facility wine); now allow-and-bill (receiving owner dominates the scalar, minority →
`BILLABLE_WINE_CONSUMED`), which reverses the earlier refuse decision and stays scalar-compatible.
Fold-ins: weigh-tag restructured per-truck → per-bin `WeighTagLine` (owner/grower at the line);
`WeighTag` number allocator = per-tenant counter row + `SELECT FOR UPDATE` (not `MAX+1`);
`WineSku`/`BottledInventory` owner-specific UNIQUEs include `ownerId`; batched backfill +
expand/migrate/contract enum drop (drop in a later migration, not F1); post-backfill consistency check;
lossy-backfill flagged (a human re-assigns legacy client lots). Full record:
`docs/plans/council-feedback-093-custom-crush-foundation.md`.

**CROSS-MODEL:** Codex and Gemini independently agreed on C1 (conditional bond posting) — strong signal.

**DESIGN REVIEW (2026-07-23; text review, design binary unavailable on this box):** initial design
completeness **5/10 → 9/10**. This is a data/ledger plan whose only in-scope user surface was the
assistant, so the review targeted the presentation contract (the place a mis-keyed owner is caught before
an append-only write) and the wet-hands intake surface. Four fold-ins + one scope decision:
- **Confirm-card content contract (Unit 12):** multi-bin intake reads back one structured line PER bin
  (net/grower/owner/block), not a flat sentence that could hide a bin on the wrong client; the
  `change_ownership` card states WHICH legal outcome in words ("Title transfer only — no TTB filing" vs
  "Transfer in bond — files a TTB 5120.17 movement"); a billable top is disclosed as one passive line
  (informs, never blocks/adds a confirm step). Golden cases added for each.
- **NULL owner never renders blank (Unit 1):** one shared `ownerLabel(owner) → name ?? "Estate
  (facility)"` consumed by the card, the verify, and every future GUI cell so they can't drift.
- **Receive-now-assign-later + a data-model fix (Unit 9):** the scale never hard-blocks on a missing
  owner/grower. Caught a NULL-overload bug the fold exposed — a NULL owner on a *line* is ambiguous
  (estate vs unkeyed) while NULL on a *lot* is load-bearingly "estate," so added an explicit
  `needsOwnerAssignment` flag instead of overloading NULL; the hard stop moves to CRUSH (Unit 10), not
  the scale.
- **DECISION (Russell): ship a minimal weigh-tag entry screen now (Unit 10b),** don't defer the wet-hands
  surface to plan 092. Fully spec'd against DESIGN.md: tag-header + add-a-bin repeater, all interaction
  states (the "n lines need assignment" partial state is the designed happy path), warm-editorial APP UI,
  tokens only, 44px targets for a tablet at the crush pad. Owner/grower CRUD + the client home stay in 092.

**VERDICT:** ENG + COUNCIL + DESIGN CLEARED (issues resolved). Ready to implement (F1 → F2 → F3). Two
non-blocking opens for `/plan-eng-review` if re-run: the exact non-ledger `ownerId` table set (Q1) and
`OwnerKind` values (Q3).
