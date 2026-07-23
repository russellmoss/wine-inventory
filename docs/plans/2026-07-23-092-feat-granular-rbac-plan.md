---
title: Granular RBAC, roles & user types (Phase 23)
type: feat
status: draft
date: 2026-07-23
branch: feat/granular-rbac
branches: [feat/granular-rbac-infra (A1, schema + RLS + capability engine + verify), feat/granular-rbac-migrate (A2, call-site migrations + action gates), feat/granular-rbac-surfaces (B, UI + assistant + rollout)]
depth: deep
units: 24
roadmap: Phase 23
reviews: [plan-eng-review (6 decisions + 2 criticals), council (codex+gemini, 4 decisions + 6 fold-ins), plan-design-review (5→9/10, 3 decisions), incumbent-parity (vintrace+innovint, 2 decisions) — all 2026-07-23]
incumbent-parity: docs/plans/092-incumbent-parity-ap-custom-crush.md
depends-on: "the custom-crush data foundation (ownership data model + intake spine) must be BUILT AND VERIFIED first — this plan is the RBAC ENFORCEMENT layer (capability matrix + RLS quad) on top. Re-sequenced 2026-07-23 (Russell): the old Branch A1 bundled the ownership data model with the RLS; split them — foundation first (no RLS), then enforcement. Scalar ownership, designed for additive fractional. See docs/architecture/data_model_coalescence.md P0."
honors: [D9, D10, D14, D16, D21, D26]
---

## Overview

Today authorization is one nullable string on `User` and one binary predicate,
`isTenantAdminLike` (`src/lib/access.ts:74-78`). That is enough for a winery run by the
people who own it. It falls apart the moment somebody else's wine is in your building.

This plan replaces the flag with two things: a **capability matrix** (what you can do) and
**owner/vineyard data scope** (which records you can do it to), with the scope enforced by
RESTRICTIVE row-level-security policies in Postgres rather than by TypeScript. It also puts
the whole surface behind the assistant, because the winemaker should be able to say "give
Marco execute rights on the cellar but not cost" and have it happen.

The load-bearing sentence: **an intra-tenant leak, one custom-crush client seeing another
client's wine, is as damaging as a cross-tenant leak.** It gets the same DB-enforced,
fail-closed discipline as tenant RLS. UI filtering is not a deliverable.

## Problem Frame

**Who has the problem.** A custom-crush facility holds wine belonging to several clients.
Phase 24 wants to give those clients a login. Today, any authenticated user in a tenant can
read every lot in that tenant, because the only data-scoping that exists (`vineyardIds`) is
app-layer, partial, and opt-in.

**What happens if we do nothing.** Phase 24 cannot ship. There is no safe way to give an
external party a login, so the client portal, client billing, and AP proprietorship all stay
blocked. That is a competitive parity gap, both incumbents bill clients and offer a client
view.

**The honest state of the existing analogue.** Research found vineyard membership is a
genuine app-layer *write* fence (a manager cannot mutate another vineyard's harvest, see
`src/lib/harvest/actions.ts:84,133,243,489`) and a genuine assistant *read* fence
(`src/lib/assistant/scope.ts:16-20`), but it is **not** a read fence over the cellar or lot
domain and has **zero** DB enforcement. `src/app/(app)/lots/page.tsx:22-35` says so out loud:
"the cellar stays tenant-wide; with the lens off the manager sees every lot (no scoping)."
So Phase 23 is not extending a working fence. It is building the first one.

**Pressure test.** Is this the right problem, or a proxy? It is a proxy for "we want to sell
to custom-crush facilities." A cheaper framing exists: give clients a read-only *export*
(a PDF or a scoped report) instead of a login, which needs no RBAC at all. That is worth
naming, but it fails the roadmap's own exit criteria and defers rather than removes the work,
because staff-role granularity ("cellar tech shouldn't see cost") is wanted independently of
custom crush. Recommend proceeding, with the export idea recorded as the fallback if a design
partner signs before this lands.

## Requirements

- **MUST** express permissions as capability x domain, not a single admin flag. Capabilities:
  view, draft, execute, approve, finalize, configure, bill. Domains: lots, ops, chemistry,
  cost, compliance, work orders, inventory, settings, billing.
- **MUST** support per-tenant cloneable role templates on a governed vocabulary, versioned for
  audit.
- **MUST** scope a role's data reach by Owner and/or vineyard, enforced in the database, not
  the UI. A scoped user cannot read outside scope even via a crafted query.
- **MUST** fail closed. An unset scope context yields zero rows, never everything.
- **MUST** audit every permission grant or scope change (D14), with a permission-specific
  audit action rather than a generic `UPDATE`.
- **MUST** support a client user type: sees only their Owner's records, cannot configure,
  cannot create work orders.
- **MUST** be drivable from the assistant by an admin, and always by a `developer`, through
  the D10 propose-then-confirm path with independent server-side re-authorization.
- **MUST** preserve the existing rule that only a developer may assign or manage the
  `developer` role, identically via UI and via assistant.
- **MUST** roll out without anyone losing access mid-harvest.
- **SHOULD** keep the assistant tool count from growing more than necessary (86 registered
  today, see Key Decisions).
- **NICE** a "why can't this user see X" explain path for support.

## Scope Boundaries

**In scope:**
- The capability model, role templates, assignments, and their versioning.
- A **minimal** `Owner` entity and `Lot.ownerId`, only as much as the fence needs to be real
  and testable.
- Owner-scope and vineyard-scope RLS policies over the owner-scoped tables.
- Migrating the existing role checks onto the capability predicate.
- The `/users` admin surface and the assistant tool pair.
- A `verify:owner-isolation` proof script and an `RBAC-1` invariant note.

**Out of scope:**
- The client **portal** itself (Phase 24). This plan makes the scope enforceable; it does not
  build the external UI beyond a login that lands somewhere safe.
- Client billing, contracted rates, invoices (Phase 24).
- Replacing Better Auth's org/member layer. It stays; it is just not the app authority.
- Field-level permissions (hiding a column). Domain-level only.
- Time-bounded or delegated grants ("Marco can approve until Friday").

## Research Summary

### Codebase Patterns

**The blast radius is bigger than it looks: ~52 files.** `isTenantAdminLike` fans into 21 page
guards, 63 `adminAction`/`safeAdminAction` call sites across 18 files, and 7 API routes that
hand-roll the check (`src/app/api/commerce7/install/route.ts:27` and siblings). Worse, there
are **~19 hand-rolled `role === "..."` comparisons** with no compile-time link to `access.ts`
(`src/components/AppShell.tsx:295`, `src/app/(app)/lots/page.tsx:29`,
`src/lib/work-orders/authority.ts:12`, `src/lib/winemaking-calc/log.ts:96`, others). The
`RoleBearingUser` structural type (`access.ts:68`) is what lets them drift. These must be found
by grep, not by the type checker.

**Two of those comparisons are already dead code.** `src/app/(app)/inventory/page.tsx:101` and
`src/app/(app)/work-orders/task-types/page.tsx:16` both test `role === "admin" || role ===
"owner"`, but `"owner"` is not in `ASSIGNABLE_ROLES` (`access.ts:85`). Decide whether that was
aspirational or a bug.

**There is already an intended seam.** `src/lib/work-orders/authority.ts:1-12` says in its
header that the capability matrix is Phase 23 and that it is a pure function "so Phase 23 can
swap the policy without touching the cores." Start there.

**The RLS pattern is well established.** `prisma/migrations/20260701001000_rls_policies/`
applies `ENABLE` + `FORCE ROW LEVEL SECURITY` + a permissive `tenant_isolation` policy with
USING and WITH CHECK on `current_setting('app.tenant_id', true)` to 49 tables, and ends with a
`DO $$` block that raises if any table is missed. Copy that self-check.

**The per-user precedent is exactly the right shape.**
`prisma/migrations/20260715120200_inbox_user_rls/` uses **RESTRICTIVE** policies keyed on
`current_setting('app.user_id', true)`, which Postgres ANDs with the permissive tenant policy.
It has direct-column ownership, membership-pair ownership, and one- and two-hop `EXISTS`
ownership through a parent, which is the shape an owner predicate on lot descendants needs.

**And it carries a hard-won lesson.** The follow-up migration
`20260715120300_inbox_dm_write_policies/` exists because the first pass gave a RESTRICTIVE
`FOR SELECT` policy but no UPDATE/DELETE twins, while `app_rls` holds blanket UPDATE/DELETE
grants. A RESTRICTIVE SELECT alone is not a fence.

**`app.user_id` is trusted blindly.** There is no `EXISTS(member WHERE userId = app.user_id
AND organizationId = app.tenant_id)` cross-check in SQL. Trust rests entirely on only
`src/lib/actions.ts:58,74` being able to populate it.

**A real bug blocks this work.** `src/lib/ledger/write.ts:51,58` runs
`runWithTenantContext({ tenantId, skipWrap: true })` and sets only `app.tenant_id`, dropping
`userId`. Any GUC-keyed intra-tenant predicate would **fail closed inside every ledger write**:
crush, press, rack, blend, bottle, additions. `src/lib/tenant/tx.ts:22-24` shows the correct
form. This must be fixed before any owner policy exists.

**`User` and `Member` are RLS-exempt** (`src/lib/tenant/models.ts:22-39`), so a role table
hung off `User` inherits that exemption unless it is a new tenant-scoped table.
`src/lib/users/scope.ts:19-30` is the only fence today and it is app-layer.

**One existing gap to close in passing.** `setUserVineyards`
(`src/lib/users/actions.ts:161-194`) has no actor-privilege guard, unlike its siblings at
`:127`, `:149`, `:227`. Any admin can rewrite a developer's vineyard scope.

**The assistant path.** `signProposal`/`verifyProposal` (`src/lib/assistant/confirm.ts:11-89`)
mint an HMAC-signed 5-minute bearer token over `(tool, args)`; `commitProposal`
(`commit.ts:166-206`) burns the nonce via a unique index before running the committer. The
token carries **no actor, no tenant, no role**. `resolveCommitTenantId` takes the tenant from
the session, never the token.

**Critical asymmetry.** `/api/assistant/resolve-choice/route.ts:34` re-filters through
`getToolsFor(user)`; **`/api/assistant/confirm/route.ts` does not.** The only privilege
enforcement at confirm time is whatever the committer's underlying action does.
`src/lib/assistant/tools/db-update.ts:65,100` is the template that gets this right: authorize
in the tool **and** re-authorize in the committer.

**No assistant tool touches `User` today.** `src/lib/assistant/entities.ts:16-21,750-752`
excludes auth tables from the generic CRUD registry by construction, and
`src/lib/assistant/prompt.ts:55` tells the model "you can never create, edit, or delete the
audit log or user accounts." That prompt line becomes false the moment this ships.

**The over-claim guard has no privilege vocabulary.** `overclaim-guard.ts:16-24` matches
"drafted", "filed", "created", "queued". It does not match "granted", "promoted", "made them
an admin", "gave them access", "revoked". A model that says "I've made Jane an admin" with no
tool call sails past it today.

### Prior Learnings

- Context-ledger query for RBAC/authorization/RLS returned **no active precedents**. Nothing
  constrains the model choice; this plan sets the precedent.
- `verify:*` scripts must scrub fixtures child-to-parent and by pattern, or a failed run leaves
  junk in the production DB and breaks the next run.
- Migrations reach production directly. `.env` and prod are the same Neon instance.
- Prisma `migrate diff` emits a large phantom diff against this schema (enum rebuilds, FK
  drops). Hand-write the RLS migration.
- SYSTEM_TEMPLATES-style seeds do not automatically reach live tenants; a seed is not a
  migration.

### External Research

Not required. This is Postgres RLS and an internal permission model; no new framework.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| Permission model | **Capability matrix (RBAC)** | ABAC / policy engine | The matrix is finite, enumerable, renderable as a grid, and testable as pure functions, which matches `access.ts`'s existing pure-and-unit-tested style. A policy engine is a new evaluation surface that cannot be exhaustively tested and makes "why can't Jane see this?" undebuggable. Revisit only if per-record conditional rules appear. |
| Owner-scope enforcement | **RESTRICTIVE RLS policies whose owner set is derived by the DB from `app.user_id`**, mirroring the inbox precedent | App-layer `where` injection; the app asserting its own scope via a GUC | Restrictive policies are ANDed by Postgres with the existing permissive tenant policy, so tenant isolation is untouched. Deriving the set **inside the policy** from a `role_assignment` join keyed on `app.user_id` means an app-layer bug cannot widen scope, the DB is the authority. Eng review, P1-3b. This is the exact failure class the phase exists to prevent, so the app is not trusted to state its own reach. |
| Owner match | **Denormalize `ownerId` onto every owner-scoped table**, maintained at the `runLedgerWrite` chokepoint, compared directly in the policy | 25 EXISTS-joins from each child to the lot; a hybrid | This repo already made this exact call for `tenantId`: denormalize, don't join. A column compare is sargable and indexable; 25 EXISTS predicates on hot reads are not, and `LotOperation` has no `lotId` at all (it reaches lots only through `lines`/`treatments`, and a neutral op with neither is unreachable by any join). One chokepoint maintains it, one failure mode (a stale column) the verify script catches. Eng review, P0-1 / P1-3. |
| Scope surface | **Bulk AND bottled.** Add `ownerId` to the lot spine, its lot-referencing children, AND the finished-goods side (`WineSku`/`BottledInventory`) | Bulk only, bottled deferred to Phase 24 | A custom-crush client's first question is "where are my 400 cases", and bottling severs the lot link (`BottledInventory -> WineSku`, no lot). Deferring it ships Phase 24's core promise with a hole. Eng review, P0-1. |
| Owner entity | **Introduce a minimal `Owner` now** (id, tenantId, name, isActive) plus nullable `ownerId` on scoped tables | Forward-declare and scope against Phase 24's model | A predicate with nothing to test proves nothing. Minimal now, extended by Phase 24 with rates and billing. `ownerId IS NULL` means the facility's own wine, visible to unscoped staff, invisible to every scoped client. |
| Scope derivation | **Unscoped requires an explicit `scope:all` capability (from the user's assigned role), OR transitionally a legacy staff `role` with no client assignment**; a Client assignment carries an explicit owner set; anything else is the empty set | Bare "no assignment => all" (fail-open on absence) | Council/Codex sharpened this: keying see-all on the *absence* of a scope row means an unfinished backfill silently grants full visibility. So the SECURITY DEFINER function (which can read the RLS-exempt `User.role` column) returns unscoped when the assigned role carries `scope:all`, or, during the transition before every user is backfilled, when `User.role IN (admin,user,developer)` and there is no client owner-assignment. Post-backfill the legacy arm is removed and `scope:all` is the sole authority. Fail-closed everywhere else. |
| Role versioning | **Assignments reference the role (live); edits bump a version and write an audit row; the UI states the blast radius before saving** | Assignments pin a version | Admins expect editing a role to affect its holders, that is the point of a role. Pinning creates 12 users stranded across 5 versions of one role. The danger is the *silent* part, so versioning serves audit ("what could Jane do on July 3rd?") and the confirm step serves safety. |
| Better Auth reconciliation | **`member.role` governs org membership only and is never read for an app permission decision**; a test asserts this | Map capabilities onto owner/admin/member; replace Better Auth's layer | Two authorities drift. One direction of truth plus a guard test is cheaper than either merging or replacing. |
| Assistant surface | **One discriminated write tool `manage_user_access` (adminOnly) plus one read tool `query_user_access`** | Four separate write tools (set role, set vineyards, set owner scope, assign role) | 86 tools are registered today; `docs/architecture/assistant-coverage.md:33-61` warns that selection accuracy degrades non-linearly past ~30-40 and the doc's own count is stale by 2x. `manage_work_order` is the in-repo precedent for a discriminated tool "to keep the tool count down". |
| Assistant authorization | **Delegate to the existing `adminAction`-wrapped cores; re-authorize in the tool AND in the committer; sign nothing resembling an authority claim into args** | Re-implement the rules in the tool | `setUserRole` (`src/lib/users/actions.ts:144-158`) already carries admin re-auth, developer self-replication, self-downgrade lockout, cross-tenant isolation, and audit. Reimplementing any of it forks the rules. And because the confirm route does not re-check `adminOnly`, the committer's own check is load-bearing, not belt-and-braces. |
| Assistant token binding | **Bind `manage_user_access` tokens to the actor (add `actorUserId` to the signed payload; `verifyProposal` asserts it matches the committing session) and cut TTL to ~60s for this tool class** | Rely on committer re-auth only; actor-bind every token | The committer re-auth stops a *non-admin* replaying a token, but not a *different admin* replaying another admin's pending "make Bob a developer" within the 5-minute window. Binding closes that. Scoped to this tool class to keep the blast radius of the `confirm.ts` change small; a full actor-bind of all 57 write tools is a separate hardening pass. Eng review, P1-6. |
| RESTRICTIVE policy set | **A full quad: SELECT, UPDATE (USING and WITH CHECK), DELETE, and INSERT (WITH CHECK)** | The SELECT/UPDATE/DELETE triad only | Without a restrictive INSERT a scoped user can insert a row attributed to another owner; without a WITH CHECK on UPDATE they can re-point a row they legitimately see at another owner. The inbox precedent omits restrictive INSERT because its emit path needs cross-user inserts, that reasoning does not transfer. Clients are read-only today, but a future writable scoped role would silently inherit the hole, so the fence is complete now. Eng review, P1-2. |
| Rollout safety | **Ship the owner policies from day one, made safe by the derivation semantics, and create no scoped assignment in prod until `verify:owner-isolation` passes against it** | A manual checkpoint between GUC and policy units; split into two soaked branches | Because no-assignment resolves to 'all', every existing user satisfies the new policies the instant they land, so there is no outage window and no fragile operator checkpoint. The only genuinely dangerous act is creating the *first* scoped client, which is gated behind the verify. Eng review, P1-5. |
| Legacy roles | **Keep `user`/`admin`/`developer` as seeded roles that map onto capability sets**; do not drop the column in this phase | Hard cutover to capabilities | Nobody loses access mid-harvest. The column becomes a compatibility shim with a single reader, removable in a later phase. |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| The fence silently does nothing on reads because `app.user_id` is `''` on the bare RSC path | **Critical** | Unit 5b sets it in `resolveTenantFromSession`, the same seam tenant uses; Unit 8's verify exercises a scoped client through a real page loader, not only a `runAsTenant` block. This was CRITICAL #1 from independent review and would have shipped a decorative fence. |
| A cross-owner blend silently attributes one client's wine to another (GROW_EXISTING) or to the facility (NEW_LOT NULL) | **Critical** | Unit 6b refuses any owner mismatch at the chokepoint, mirroring the bond-straddle guard; co-mingling becomes explicit and audited. This was CRITICAL #2 from independent review. |
| A client sees the facility's confidential labor rate / margin through a CostLine on their own lot | **Critical** | Unit 3b's `visibility` enum; the client policy ANDs `visibility='client_billable'`, so `internal_overhead` never reaches a client. Council C2. |
| A scalar `ownerId` on a work order can't represent a multi-owner group op, so it either excludes a client's lots or hides their history | High | Unit 7b scopes WOs by the lots they touch (EXISTS), not a column; the facility keeps grouping across owners, each client sees only their lot rows. Council C1. |
| An AP client can't file their legally-required own 5120.17 because compliance is facility-only | High | Unit 3c carries `ownerId` on the compliance + tax-class chain now, so Phase 24 switches on AP filing rather than re-migrating the sensitive filing chain. Council C3. |
| SECURITY DEFINER `app_owner_scope` is exploitable via search-path shadowing | High | Unit 7 pins `SET search_path`, schema-qualifies every reference, no LEAKPROOF. Council/Codex C4. |
| An unbackfilled staff user is silently granted full visibility (fail-open on absence) | High | Unscoped now requires an explicit `scope:all` capability or the transitional legacy-role arm; a user with neither resolves to the empty set. Council/Codex. |
| A facility tops a client barrel with facility wine and the addition vanishes from the client's composition (doesn't sum to 100%) | High | Unit 6's `ownerId` inheritance is directional to the TARGET lot, so the addition is attributed to the client lot. Council/Gemini. |
| A RESTRICTIVE policy ships incomplete, leaving a hole because `app_rls` holds blanket grants | **Critical** | Unit 7 writes the full quad (SELECT/UPDATE-USING-and-CHECK/DELETE/INSERT) per table; the migration's `DO $$` self-check asserts all four exist. The triad-not-quad and SELECT-only variants of this defect have both already happened once in this repo. |
| `runLedgerWrite` not propagating `userId` makes every cellar write fail closed once policies exist | **Critical** | Unit 1 fixes it first, with a test, before any policy exists. |
| A stale `ownerId` (the denormalization cost): a row's owner column drifts from its lot's true owner | High | `ownerId` is written once at the chokepoint and lots do not change owner in normal operation; the verify script (Unit 8) recomputes owner from lineage and diffs, the same self-healing check pattern as `rebuild:vessel-composition`. A correction that re-parents a lot must re-stamp descendants, covered by a Unit 6 test. |
| The DB-derivation join (`app_owner_scope`) runs per statement on every owner-scoped query | Medium | It is an indexed lookup on `role_assignment` by `(tenantId, userId)`, keyed on the already-set `app.user_id`; STABLE so it folds once per query, not per row. Measure on the lot list; if hot, memoize into a session GUC as a fast path with the join as the periodic assertion (the P1-3b "both" fallback), but start with the authority-in-the-DB shape. |
| A hand-rolled `role === "admin"` check is missed and silently keeps or drops access | High | Unit 9 is a grep-driven sweep with an explicit inventory; a lint rule or a test that greps for the pattern outside `access.ts` keeps it from coming back. |
| An owner-scoped user sees nothing because `app.user_id` is unset on some path | High | Fail-closed is the correct failure direction and loud. `app.user_id` is set on 3 of 4 paths today and Unit 1 fixes the 4th (`runLedgerWrite`); the derivation returns unscoped for staff, so only an actual scoped client is exposed to this, and only until their session sets the GUC. The verify script asserts each entry path. |
| An admin locks themselves out | Medium | Preserve `canChangeOwnRole`'s self-downgrade block and extend it to capability removal: an actor cannot remove their own `configure:settings`. |
| Assistant grants access to the wrong person because the model resolved the wrong user | High | Target resolution goes through a picker, never a free-text name; the MUST_PROPOSE golden treats an invented email as an outright failure. |
| Tool-count cliff worsens | Medium | One discriminated write tool plus one read tool; record the selection-accuracy scorecard before and after. |
| Seeded stock roles never reach live tenants | Medium | Unit 4 ships a migration-time backfill, not only a seed script; Unit 17 verifies every tenant has them. |

## Owner-Scope Surface (the authoritative table list)

Every table here gets a nullable `ownerId` FK, a `(tenantId, ownerId)` index, and the full
RESTRICTIVE quad. This list IS the fence; a scoped client sees exactly these rows filtered by
owner and nothing else. The verify script (Unit 8) enumerates it and fails if a listed table
lacks the column or a policy. Derived from the 25 lot-referencing models plus the finished-goods
side found in research.

**The lot spine and its children (scalar `ownerId`, inherited DIRECTIONALLY from the TARGET lot
at write time, per council fold-in below):**
`Lot`, `LotOperation`, `LotOperationLine`, `LotTreatment`, `LotStateEvent`, `LotCostState`,
`LotCodeEvent`, `LotIdentifier`, `LotHarvestSource`, `LotTastingNote`, `LotVineyard`,
`Sample`, `AnalysisPanel`, `Reservation`, `VesselLot`, `BarrelFill`, `MaterialMovement`,
`BottlingSource`, `BottlingCostSnapshot`, `BottledLotState`.

**The finished-goods side (inherit `ownerId` from the source lot at bottling; uniqueness now
per-owner, council fold-in):** `WineSku`, `BottledInventory`.

**`CostLine` — scalar `ownerId` PLUS a `visibility` enum (council C2, decided 2026-07-23):**
`CostLine` is owner-scoped, but a client policy also requires `visibility = 'client_billable'`.
`visibility` is `client_billable | internal_overhead`; facility labor rate, barrel amortization,
and margin are `internal_overhead` and never reach a client even on their own lot's cost. The
facility sees both. See Unit 3b.

**Compliance chain — first-class `Bond`, keyed per-bond, owner upstream (council C3 + incumbent
parity, decided 2026-07-23):** both InnoVint and Vintrace file per-BOND with owner upstream of
bond, so Unit 3c adds a first-class `Bond` (derives from location; AP owner-bond takes precedence)
plus `ownerId` on `ComplianceReport`/`ChangeOfTaxClassEvent` for RLS scope. The compliance KEY is
`bondId`, not `ownerId` directly. Phase 23 adds the entity + derivation + scope; the per-owner
5120.17 generator is Phase 24. See Unit 3c. The facility-wide filing (no AP owner → location bond)
is unchanged.

**Work orders — NOT scalar-owner-scoped; authorized by the LOTS they touch (council C1,
decided 2026-07-23):** a facility groups one task across several clients' tanks, so a scalar
`ownerId` on `WorkOrderTask` cannot represent it. A client sees a task via `EXISTS(a task-lot
link they own)` and sees only their own lot rows within it. `WorkOrderTask` is the ONE table on
the scoped surface reached by an EXISTS predicate rather than a column compare. See Unit 7b.

**Deliberately NOT owner-scoped, and why:**
- `LotOperation` carries `ownerId` denormalized rather than being reached by join, because it has
  no `lotId` and neutral ops have no lines (research). This is the single most important reason
  the denormalize decision was taken.
- `StockMovement`, registry tables (`Variety`, `Location`, `Vessel`), and settings stay
  tenant-only. A client does not need the movement ledger, and the registries are shared facility
  reference data.
- `Vineyard` scoping stays the existing app-layer `vineyardIds` mechanism, untouched by owner
  scope. The two axes compose, a user can be both vineyard-scoped and owner-scoped.

**Vessel-capacity leak is closed by LEDGER-12, not an opaque-bucket view.** Gemini raised that a
client sharing a tank could see it as half-empty (RLS hides the co-resident owner) and overflow it.
`one-lot-per-vessel` (plan 088, `LEDGER-12`, `UNIQUE(tenantId, vesselId)` on `vessel_lot`) means a
vessel holds exactly one lot = one owner, so a client's tank is theirs alone. Residual risk is only
legacy multi-lot vessels in transition; a Unit 8 assertion checks no scoped vessel is co-resident.

## Implementation Units

### Branch A1: infra (Units 1-8, 3b, 3c, 6b, 7b)

Schema + RLS + the capability engine + the verify script. Security-critical and reviewable as one
unit. Nothing user-visible, and legacy roles/unscoped-staff mean no behavior change. This is where
the security eyes go (council: Branch A was too big; split infra from call-site migrations).

### Branch A2: call-site migration (Units 9-10)

The ~19 hand-rolled role checks + the capability-aware action gates. Depends on A1's capability
engine landing. Mechanical, greppable, independently reviewable.

### Unit 1: Propagate the acting user into ledger writes

**Goal:** `runLedgerWrite` sets `app.user_id`, so a GUC-keyed predicate cannot fail closed inside every cellar operation.
**Files:** `src/lib/ledger/write.ts`, `src/lib/tenant/context.ts`, `test/tenant-context.test.ts`
**Approach:** Mirror `src/lib/tenant/tx.ts:22-24`, which preserves `getContextUserId()` across a `skipWrap` context. Add the `set_config('app.user_id', ...)` statement alongside the existing tenant one at `write.ts:58`, bound parameter, `is_local = true`.
**Tests:** A ledger write inside `runAsTenant(t, fn, { userId })` observes both GUCs set; a write with no userId observes `''` rather than throwing.
**Depends on:** none
**Execution note:** characterization-first. Capture current GUC state in a test before changing it.
**Verification:** `npm run verify:cellar-ops` still green; new unit test passes.

### Unit 2: The capability vocabulary as pure code

**Goal:** A governed capability x domain vocabulary and a pure `can()` predicate, with no wiring.
**Files:** `src/lib/rbac/capabilities.ts` (new), `test/rbac-capabilities.test.ts` (new)
**Approach:** Enumerate the 7 capabilities and 9 domains from the roadmap as const tuples. Model a capability set as a compact serializable structure. Export `can(capabilitySet, capability, domain)`, plus helpers to expand a legacy role name into a capability set. Pure, no `server-only`, no imports from Prisma, so it unit-tests without a DB, exactly like `access.ts`.
**Tests:** Every legacy role expands to the expected set; `can()` is total (no undefined behavior for unknown domain); an empty set denies everything; admin-equivalent grants everything except developer-only.
**Depends on:** none
**Verification:** `npx vitest run test/rbac-capabilities.test.ts`

### Unit 3: Schema and migration for roles, assignments, owners

**Goal:** Persist roles, assignments, owners, and denormalized ownership across the scoped surface.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_rbac_schema/migration.sql` (hand-written)
**Approach:** New tenant-scoped models: `Role` (name, description, capability set, version, isSystem), `RoleAssignment` (userId, roleId, plus an owner-scope set), `Owner` (name, isActive). Add a nullable `ownerId` FK to `Owner` on **every owner-scoped table**, not just `Lot`, because the enforcement is a denormalized column compare, not a join (Key Decisions). The surface is the lot spine plus its lot-referencing children plus the finished-goods side (`WineSku`, `BottledInventory`), see the Owner-Scope Surface section below for the authoritative list. Index each as `(tenantId, ownerId)`. Follow the AGENTS.md 9-step checklist for every new table. Do not add any new model to `GLOBAL_MODELS`. Hand-write the migration; `migrate diff` emits a phantom diff on this schema.
**Council fold-ins in this unit:** (1) `WineSku`'s existing per-tenant unique `(name, vintage, bottleSizeMl)` becomes per-**owner** — two clients bottling an identical varietal/vintage need separate SKUs because COLA, COGS, and tax class bind to the client entity (Gemini 5). (2) `lot_code` uniqueness becomes per-owner, or the app must return a generic "code unavailable" on the P2002 rather than confirming a competitor's fermenting wine exists (Gemini 4, same class as ticket #309); prefer the per-owner unique. Auto-increment WO numbers leaking job volume is noted as a lower-severity side channel, UUIDs are a bigger change deferred.
**Tests:** Schema-shape test asserting each new model carries `tenantId` and the composite uniques; a test asserting every table in the Owner-Scope Surface list has an `ownerId` column and its `(tenantId, ownerId)` index (this is the drift guard, a new scoped table without the column fails here); two clients can create the same `(name, vintage, bottleSize)` WineSku under different owners.
**Depends on:** Unit 2
**Verification:** `npm run verify:tenant-isolation` picks up the new tables via its coverage guard and passes.

### Unit 3b: CostLine visibility split (council C2)

**Goal:** A client sees their own material cost but never the facility's labor rate or margin.
**Files:** `prisma/schema.prisma`, the migration from Unit 3, the cost cores in `src/lib/cost/*`
**Approach:** Add a `visibility` enum column to `CostLine` (`client_billable | internal_overhead`), defaulting existing rows by `reasonCode`: material/dosage/additions → `client_billable`; labor, barrel amortization, overhead → `internal_overhead`. The Unit 7 client policy ANDs `visibility = 'client_billable'` onto the owner match; the facility (unscoped) sees both. This keeps the facility's confidential COGS off a client's cost view even on their own lot.
**Tests:** A scoped client reads only `client_billable` lines of their own lots; an overhead line on their lot is invisible; the facility reads both.
**Depends on:** Unit 3
**Verification:** Covered by `verify:owner-isolation` (Unit 8), which asserts an `internal_overhead` line is invisible to the owning client.

### Unit 3c: AP-owner bond precedence + owner scope on the compliance chain (council C3 + incumbent parity)

**Goal:** Model compliance the way both incumbents do, per-BOND with owner upstream, so an Alternating Proprietorship client can file their own 5120.17.
**⚠️ RE-SCOPED after the incumbent audit (2026-07-23): the first-class `Bond` entity ALREADY EXISTS** (`schema.prisma:2487` — `registryNumber`, `penalSum`, `premises`, `ownerId?`, `isPrimary`; self-serve CRUD in `bond.ts`; ledger-derived `deriveBond`). The teardown docs that said "no bond entity" are stale. So this unit is SMALLER than first written — it does NOT build Bond; it wires the two derivation inputs the incumbents key on and adds the owner-scope column.
**Files:** `prisma/schema.prisma`, `src/lib/compliance/bond.ts`, the migration from Unit 3
**Approach:** Both incumbents file **per-bond** with **owner upstream** (Vintrace `compliance.md:53-54`, InnoVint `setting-up-your-custom-crush-permissions.md:32-34`). `Bond` and per-`(formType, bondId)` scoping are built; what is missing is that `deriveBond` (`bond.ts:83`) never consults `Bond.ownerId` and there is no location→bond default. So: (1) wire **AP-owner precedence** into `deriveBond` — when the lot's owner has an AP bond, it takes precedence over the location/primary bond; (2) [optional, may defer to CE-6] a location→bond default; (3) add nullable `ownerId` to `ComplianceReport`/`ChangeOfTaxClassEvent` for RLS scope. The compliance **key stays `bondId`** (an owner can hold wine under multiple bonds; non-AP filing keys on location-bond). Owner/bond NULL = facility-wide filing (unchanged). The per-owner 5120.17 generator UI + AP client filing surface are Phase 24. See `docs/architecture/data_model_coalescence.md` (CE-6) and `docs/plans/092-incumbent-parity-ap-custom-crush.md`.
**Tests:** A lot whose owner has an AP bond derives that bond (precedence) over the location/primary bond; the facility's existing filing chain is unaffected (no AP owner → primary/location bond → same result as today); the `ownerId` scope columns + indexes exist.
**Depends on:** Unit 3, the Owner entity (Unit 3/CE-6)
**Verification:** `npm run verify:excise` and `verify:ttb` stay green (facility filings unchanged); a new test proves AP-bond-takes-precedence derivation.

### Unit 4: Seed the stock roles, as a backfill not just a seed

**Goal:** Every tenant, including live ones, has the stock roles: Admin, Winemaker, Cellar tech, Bookkeeper, Client (read-only).
**Files:** `prisma/migrations/<ts>_rbac_seed_roles/migration.sql`, `scripts/seed-rbac-roles.ts` (new)
**Approach:** The capability sets come from Unit 2. Ship them as a migration-time backfill over existing organizations, because a seed script does not reach live tenants. The script is for new tenants and for re-running idempotently.
**Tests:** Re-running the script is a no-op; a tenant created after the migration gets the roles.
**Depends on:** Unit 3
**Verification:** Row counts per tenant match the stock role list.

### Unit 5: Resolve capabilities and scope onto AppUser

**Goal:** A request knows its capability set and its data scope.
**Files:** `src/lib/dal.ts`, `src/lib/access.ts`, `test/access.test.ts`
**Approach:** Extend `userSelect` (`dal.ts:18-27`) to load role assignments; extend `toAppUser` (`dal.ts:49-70`) to compute `capabilities` and `ownerScope` (either "all" or an explicit id set). A user with no assignment falls back to the legacy `role` expansion from Unit 2, so nobody loses access. Keep the shape pure and unit-testable.
**Tests:** Legacy-role user resolves to the equivalent capability set; assigned user resolves to the role's set; a scoped user resolves to an explicit owner id set; a user with an assignment to a deleted role fails closed to the legacy path, not to everything.
**Depends on:** Units 2, 4
**Verification:** `npx vitest run test/access.test.ts`

### Unit 5b: Set `app.user_id` on the READ path, not just writes

**Goal:** The owner fence actually engages on ordinary page reads. Without this the whole phase is decorative: a scoped client browsing `/lots` (bare `prisma` via `src/lib/lot/data.ts`, no ALS context) has `app.user_id = ''`, resolves to unscoped, and sees every owner's wine.
**Files:** `src/lib/tenant/resolve.ts`, `src/lib/prisma.ts`, `test/tenant-context.test.ts`
**Approach:** `resolveTenantFromSession()` (`resolve.ts:15-23`) already derives the tenant from the verified session for the bare-read path that has no `runAsTenant` wrapper. Make it derive the **userId** the same way, and have the extension set `app.user_id` from it on that path exactly as it sets `app.tenant_id`. Then every Prisma call in an authenticated request carries the userId, reads included, with no per-callsite change. This is the seam tenant already uses, so it inherits tenant's correctness argument. Independent adversarial review, CRITICAL #1.
**Tests:** A bare `prisma.lot.findMany()` inside a request (no `runAsTenant`) observes `app.user_id` set to the session user; an unauthenticated context observes `''` (fail-closed); ALS-wrapped writes still set it as before.
**Depends on:** Unit 1
**Verification:** A read-back assertion on the bare RSC path; `npm run verify:owner-isolation` (Unit 8) exercises a scoped client through an actual page loader, not only a `runAsTenant` block.

### Unit 6: Maintain `ownerId` at the ledger chokepoint

**Goal:** Every owner-scoped row is stamped with the correct `ownerId` at write time, so the denormalized column the policy reads is never stale.
**Files:** `src/lib/ledger/write.ts`, the cores that create finished goods (`src/lib/bottling/*`), `src/lib/tenant/models.ts` (inject helper)
**Approach:** The owner of a lot is set when the lot is created (from the harvest source or, for the facility's own wine, NULL). Descendant rows inherit `ownerId` **directionally, from the TARGET lot they belong to, not the source** (council fold-in, resolves Gemini's facility-topping-wine leak: a facility ADDITION into a client lot is attributed to the client lot's owner, so the client's composition still sums to 100% even though the topping wine was facility-owned). This reuses plan 088's directional-attribution rule (arriving wine takes the receiver for a CORRECTION, the consumed lots for BLEND/CRUSH/PRESS). Inheritance happens at the `runLedgerWrite` chokepoint, the same way `tenantId` is auto-injected today (`models.ts:51-82`). **Inventory EVERY owner-scoped write path, not just `runLedgerWrite`** (council/Codex fold-in): the bottling cores, seeds, backfills, `StockMovement` writes, and any `prismaBase`/`runInTenantRawTx` path that creates an owner-scoped row must stamp `ownerId` or be explicitly asserted not to create one. No `app.owner_ids` GUC exists, the policy derives the set itself (Unit 7), so this unit keeps the stored column true. `app.user_id` is already carried after Unit 1.
**Consider a DB-side ownership invariant (council/Codex, flagged for `/plan-eng-review` follow-up):** a composite FK `(tenantId, ownerId, lotId) -> lot(tenantId, ownerId, id)` on the ownership edges (the K11 pattern already used for tenant) would make the parent-child owner tie DB-enforced, not just app-maintained. Heavier; the verify script's lineage recompute (Unit 8) is the lighter backstop shipped first.
**Tests:** A lot created from a harvest source carries that source's owner; a single-owner rack/blend/addition child inherits it; a bottling run stamps the finished goods; the facility's own wine is NULL throughout; **a CORRECTION and a LIFO reversal re-stamp descendant rows correctly** (the reverser routes through `correctBlendCore`/`reverseTransformCore`, which write new op+line rows through this same chokepoint, so they must carry the right owner); a correction that re-parents a lot re-stamps its descendants. Independent review, finding 5.
**Depends on:** Units 1, 3, 5, 6b
**Verification:** A `runAsTenant` read-back asserting `ownerId` propagation across a crush -> rack -> bottle chain AND across a reverse of that chain.

### Unit 6b: Guard cross-owner blends AND add a CHANGE_OWNERSHIP event (incumbent parity)

**Goal:** Keep the one-owner-per-row model honest AND give a custom-crush facility the legal, TTB-reportable way to combine two clients' wine that both incumbents provide, a transfer of ownership. A blend of two owners is refused UNTIL the wine is brought under one owner via an explicit Change Ownership event, then blends normally.
**Files:** `src/lib/blend/blend-core.ts`, `src/lib/ledger/write.ts`, a new `src/lib/ledger/change-ownership-core.ts`, `prisma/schema.prisma` (a `CHANGE_OWNERSHIP` op type), `test/blend-*.test.ts`, `test/change-ownership*.test.ts`
**Approach:** Two parts.
(1) **The guard** (independent review CRITICAL #2): before a blend/absorb commits, if the consumed lots resolve to more than one distinct non-null owner, throw a clear `ActionError` ("These lots belong to different owners. Record a Change of Ownership first, then blend."). Mirror the existing bond-straddle refusal (`blend-core.ts:220-227`).
(2) **The escape hatch, from incumbent parity (decided 2026-07-23):** a first-class `CHANGE_OWNERSHIP` ledger operation, modeled on Vintrace's `CHANGE_OWNER` op and InnoVint's transfer-in-bond. It re-stamps a lot's `ownerId` as an append-only, audited event (never an in-place edit), and, because owner maps to bond (Unit 3c), it is a **transfer-in-bond** that posts symmetric Received/Removed-in-Bond lines on both bonds' TTB, exactly what both incumbents record. This fills a gap the incumbent teardown flags as absent in Cellarhand. Scalar `ownerId` is preserved (RLS stays a column compare); co-mingling is handled by the event, not by fractional ownership (which only Vintrace does, and which would break the RLS model). See `docs/plans/092-incumbent-parity-ap-custom-crush.md`.
**Tests:** A same-owner blend succeeds and the child inherits that owner; a cross-owner blend is refused with the "record a Change of Ownership first" reason; after a `CHANGE_OWNERSHIP` brings both lots under one owner, the blend succeeds; the change-ownership event is append-only (correction-as-event, LEDGER-10), audited, and posts the transfer-in-bond lines; a blend of two facility (NULL) lots succeeds as facility.
**Depends on:** Units 3, 3c, 6
**Verification:** `npm run verify:reverse-transform` and the blend suites stay green; a negative test asserts the refusal reason; a new test proves the change-ownership → blend path and the TTB transfer-in-bond posting.

### Unit 7: Owner-scope RESTRICTIVE policies (DB-derived, full quad)

**Goal:** The database refuses out-of-scope rows, and derives the allowed owner set itself.
**Files:** `prisma/migrations/<ts>_owner_scope_rls/migration.sql` (hand-written), a small SQL helper function
**Approach:** A **`SECURITY DEFINER`** SQL function `app_owner_scope()` (owned by the migration role, so it is not blocked by RLS on `role_assignment`, which is the point, and `role_assignment` therefore must NOT carry a per-user RESTRICTIVE policy or the function would recurse, independent review finding 3). `SECURITY DEFINER` and `STABLE` are orthogonal, it is both: DEFINER for the privilege, STABLE for the fold-once volatility. **Harden the definer function against search-path injection (council/Codex C4):** `SET search_path = pg_catalog` (plus the app schema), schema-qualify every relation, operator, and helper it references, and do NOT reach for `LEAKPROOF`. On a BYPASSRLS-owned function an unqualified reference is a privilege-escalation path. Because it bypasses RLS, the body **must** hard-filter `WHERE "tenantId" = current_setting('app.tenant_id', true)` or it would read assignments across tenants, and it **must** assert `EXISTS(member WHERE "userId" = current_setting('app.user_id', true) AND "organizationId" = current_setting('app.tenant_id', true))` before trusting `app.user_id` at all (finding 4, promoted from Q3 to a requirement, `app.user_id` is now the intra-tenant authority and cannot be trusted blindly). It returns "unscoped" ONLY when the user's resolved role carries an explicit **`scope:all` capability bit** (council/Codex fold-in, hardening the fail-closed direction: staff see-all is a *granted* capability, not the mere absence of an assignment, so a user an unfinished backfill left unseeded resolves to the empty set, not everything). It returns the explicit `ownerId` set for a scoped client, and the empty set for an unset/absent/non-member `app.user_id` or a user with neither `scope:all` nor a scope set (fail-closed). For each owner-scoped table, add RESTRICTIVE policies for the **full quad, SELECT, UPDATE (both USING and WITH CHECK), DELETE, and INSERT (WITH CHECK)**. Predicate: pass when unscoped, else `"ownerId" = ANY(app_owner_scope())` (NULL `ownerId`, facility wine, is invisible to a scoped client via three-valued logic, which is correct). Because `ownerId` is a real column (Unit 3), the predicate is a sargable indexed compare. End with a `DO $$` block that raises unless every listed table has all four RESTRICTIVE policies **and** `FORCE ROW LEVEL SECURITY` set (finding 5 addendum), extending the existing self-check from triad to quad-plus-force.
**Tests:** Covered by Unit 8's verify script.
**Depends on:** Units 3, 6
**Verification:** Migration self-check passes; `npm run verify:tenant-isolation` still green.

### Unit 7b: Work-order owner policy via the lots it touches (council C1)

**Goal:** A client sees a work order that touches their wine, and only their lot rows within it, even when the WO is a multi-owner group operation.
**Files:** the Unit 7 migration, `prisma/schema.prisma`
**Approach:** `WorkOrderTask` is NOT scalar-owner-scoped. Its RESTRICTIVE policy is the one EXISTS predicate on the surface: pass when unscoped, else `EXISTS(SELECT 1 FROM the task-lot link WHERE it references this task AND its ownerId = ANY(app_owner_scope()) AND tenantId matches)`. The client sees the task header plus their own lot rows; the facility's grouping across owners is preserved. If no task-lot junction exists yet, this unit adds a minimal one carrying `(tenantId, ownerId, taskId, lotId)`.
**Tests:** A group WO across owner A and owner B is visible to both, each seeing only their lot rows; a WO touching only A is invisible to B.
**Depends on:** Units 3, 7
**Verification:** Covered by `verify:owner-isolation` (Unit 8) with a multi-owner group WO fixture.

### Unit 8: Prove it, and register the invariant

**Goal:** A script that fails if the fence has a hole, plus the invariant note the repo's tooling expects.
**Files:** `scripts/verify-owner-isolation.ts` (new), `package.json`, `docs/architecture/invariants/RBAC-1-owner-scope-isolation.md` (new)
**Approach:** Model on `scripts/verify-inbox-isolation.ts`, the closest template. Two clients: owner (BYPASSRLS, fixtures) and `app_rls` (under test). Assert the teeth first, that the app role really is NOBYPASSRLS, so the proof cannot be vacuous. Then: a scoped user reads only their owner's lots; cannot read another owner's lot; cannot UPDATE or DELETE one; unset scope GUC yields zero rows; an unscoped user reads all; a crafted raw query cannot escape scope; and a coverage guard enumerating owner-scoped models that asserts each has the RESTRICTIVE triad, so a new table without its policy fails automatically. Fixtures `QA-` prefixed in Demo Winery, torn down child-to-parent in a `finally`. Invariant note frontmatter: `severity: critical`, `enforcedBy: database`, `verify: npm run verify:owner-isolation`.
**Tests:** The script is the test. Add a mirrored gated case to `test/tenant-isolation.test.ts`.
**Depends on:** Unit 7
**Verification:** `npm run verify:owner-isolation` exits 0; `npm run verify:invariants` resolves the new note's verify script.

### Unit 9: Migrate the hand-rolled role checks

**Goal:** One authority for authorization decisions.
**Files:** ~19 files listed in research, notably `src/lib/work-orders/authority.ts`, `src/components/AppShell.tsx`, `src/app/(app)/lots/page.tsx`, `src/app/(app)/vineyards/field-notes/page.tsx`, `src/app/(app)/work-orders/templates/page.tsx`, `src/lib/winemaking-calc/log.ts`, `src/app/(app)/inventory/page.tsx`, `src/app/(app)/work-orders/task-types/page.tsx`
**Approach:** Replace each `role === "..."` with the Unit 2 predicate. `authority.ts` is the designed seam and should be first. Resolve the dead `"owner"` arms explicitly, either delete them or map them, do not leave them. Add a test that greps `src/` for the role-comparison pattern outside `access.ts` and `rbac/` and fails, so this cannot regress.
**Tests:** The anti-regression grep test; existing suites must stay green.
**Depends on:** Unit 5
**Verification:** Full `vitest run`; the grep test passes.

### Unit 10: Capability-aware action gates

**Goal:** `adminAction` and friends check capabilities, not a flag.
**Files:** `src/lib/actions.ts`, `src/lib/dal.ts`, the 7 API routes that hand-roll `accessDecision`
**Approach:** Add a capability-taking gate alongside the existing admin gate and migrate call sites domain by domain. Keep `adminAction` as a thin alias meaning "configure:settings" so the 63 existing call sites need no edit in this unit. Close the `setUserVineyards` actor-guard gap found in research.
**Tests:** A user with execute-but-not-configure can run a cellar op and cannot change settings; the developer-only rule still holds.
**Depends on:** Units 5, 9
**Verification:** Full suite; `npm run verify:tenant-isolation`.

### Branch B: surfaces (Units 11-18)

### Unit 11: The role builder and assignment UI

**Goal:** An admin can define a role and assign it, with scope.
**Files:** `src/app/(app)/users/page.tsx`, `src/app/(app)/users/UsersClient.tsx`, `src/lib/users/actions.ts`, plus a new roles surface
**Approach:** A capability grid per role, but **preset-first, not a raw 7x9 matrix** (design review): the admin clones a stock role (Cellar tech, Bookkeeper, ...) that is already ~90% right and the grid **highlights only the cells changed from the preset**, so a role reads as "Cellar tech +2 tweaks". Plain-language row/column labels, and a **live readback sentence** ("This role can: view lots, run cellar ops; cannot see cost or change settings") computed from the Unit 2 `can()` predicate so the admin never has to read code to know what a capability set does. The grid **batches** into one save (the existing per-toggle round-trip is a known wart, do not copy it).

**Per-user assignment is progressive, two scope axes never both show unless both apply (design review):** owner-scope fields appear ONLY when the assigned role is Client; vineyard-scope appears only for vineyard-relevant roles; most assignments show neither. A live "This person can see: [plain English]" readback confirms the combined effect of role + owner-scope + vineyard-scope.

**Blast-radius confirm (design review):** editing a role shows, before save, exactly who it changes ("This changes access for 4 people: Ana, Ben, ...") with the specific capability deltas, so an admin cannot fat-finger a lockout. Removing a capability that any current holder relies on is called out.

**Self-lockout guard is a visible, explained disable, not a silent one (design review):** the actor's own `configure:settings` checkbox is disabled with an inline "You can't remove your own admin access" note, not greyed with no reason. Same for lowering one's own role.

**DESIGN.md compliance:** reuse `src/components/ui/` (Checkbox, Button, Badge, Card, Modal); no hardcoded colors/spacing, tokens only; sentence-case labels; capabilities can render as `Badge` tones from the existing set. Warm editorial, light-only, per DESIGN.md.
**Tests:** Server-action tests for create, clone, edit, assign; the self-lockout guard; the blast-radius computation (given a role edit, the returned affected-user list is correct).
**Depends on:** Unit 10
**Verification:** Browser QA on Demo Winery with `QA-` prefixed roles, cleaned up after.

### Unit 12: Permission-specific audit actions

**Goal:** A grant is legible in the audit log.
**Files:** `src/lib/audit.ts`, `prisma/schema.prisma` (AuditAction), `src/lib/users/actions.ts`
**Approach:** Add actions for role granted/revoked and scope changed, following the `USER_VINEYARD_ASSIGNED` naming precedent. Add them to **both** `NON_OPERATIONAL_AUDIT_ENTITY_TYPES` and `NON_OPERATIONAL_AUDIT_ACTIONS`, which are a mirror pair, or the leadership activity feed fills with permission noise.
**Tests:** A role change writes the new action with a before/after diff; the operational feed excludes it.
**Depends on:** Unit 11
**Verification:** `npx vitest run test/audit*.test.ts`

### Unit 13: `query_user_access` read tool

**Goal:** "What can Marco do?" and "who can approve work orders?" are answerable.
**Files:** `src/lib/assistant/tools/query-user-access.ts` (new), `src/lib/assistant/registry.ts`, `test/evals/assistant-read-tools.golden.ts`
**Approach:** `kind: "read"`, `adminOnly: true`. Reads a user's role, capability set, and scope, or lists holders of a capability. Reuse the Unit 5 resolution rather than recomputing.
**Tests:** Golden cases for both phrasings; a non-admin cannot see the tool.
**Depends on:** Unit 10
**Verification:** `npx vitest run test/evals/assistant-tools.eval.test.ts`

### Unit 14: `manage_user_access` write tool and committer

**Goal:** An admin changes access by talking.
**Files:** `src/lib/assistant/tools/manage-user-access.ts` (new), `src/lib/assistant/commit.ts`, `src/lib/assistant/confirm.ts`, `test/assistant-confirm.test.ts`, `test/evals/assistant-write-tools.golden.ts`, `test/evals/assistant-must-propose.golden.ts`
**Approach:** One discriminated tool, `kind: "write"`, `adminOnly: true`, with an action discriminator for role, vineyards, and owner scope. Target resolution through the existing picker, never a free-text name. Follow `db-update.ts:65,100`: authorize in the tool **and** re-authorize in the committer against `ctx.user` / the committer's `user`, never against args, because `/api/assistant/confirm` does not re-check `adminOnly`. The committer delegates to `setUserRole` / `setUserVineyards` and the new scope action, inheriting admin re-auth, the developer rule, self-downgrade lockout, cross-tenant isolation, and audit. **Actor-bind the token** (P1-6): extend `ProposalPayload` in `confirm.ts` with `actorUserId`, set it when minting **both** the commit token and the picker/resume token for this tool (the resume token from `signResume`/`confirm.ts:49-53` is otherwise unbound, independent review finding 6), and have `commitProposal` and the resolve-choice path reject the token unless `actorUserId` equals the committing `user.id`. Reject-if-**absent** for `manage_user_access` tools specifically (a minting bug that omits the field must fail closed, not silently downgrade to unbound), while non-privilege tokens without the field still round-trip. Mint this tool's tokens with a ~60s TTL via `signProposal`'s existing `ttlMs` argument. Never sign anything resembling an authority claim (a role, an `isAdmin`) into args. Note the actor-bind buys only protection against a same-window different-admin replay; the committer's delegation to `setUserRole` (an `adminAction`) stays the real backstop.
**Tests:** Golden case per action; a MUST_PROPOSE case whose forbidden-fields list treats an invented target email as an outright failure; a committer test proving a non-admin POSTing a valid token is refused; a test proving an admin cannot mint a developer; a token-binding test proving admin B cannot commit a `manage_user_access` token minted for admin A (and that non-privilege tokens without `actorUserId` still round-trip unchanged).
**Depends on:** Units 11, 13
**Verification:** `npx vitest run test/evals/`; `npm run verify:ai-native` green and the coverage doc regenerated.

### Unit 15: Prompt and over-claim guard

**Goal:** The model knows the tool exists and cannot claim a grant it did not make.
**Files:** `src/lib/assistant/prompt.ts`, `src/lib/assistant/overclaim-guard.ts`, `test/assistant-overclaim-guard.test.ts`
**Approach:** `prompt.ts:55` currently says user accounts can never be edited; narrow it to keep the audit-log prohibition and the never-via-`db_*` rule while carving out the sanctioned tool. Add a "what you can do" bullet and a routing rule, because "give Jane access to the north block" is ambiguous against `db_update` on a Vineyard. Extend the guard's `CLAIMS` with privilege vocabulary: granted, promoted, demoted, revoked, made an admin, gave access, changed their role.
**Tests:** Each new claim phrase trips the guard; a disclaiming sentence still suppresses.
**Depends on:** Unit 14
**Verification:** `npx vitest run test/assistant-overclaim-guard.test.ts`

### Unit 16: The client user type

**Goal:** An external client logs in and lands on a view built for them, not a locked-down staff tool.
**Files:** `src/lib/access.ts`, `src/lib/dal.ts`, `src/components/AppShell.tsx`, a new client-home route, login routing
**Approach:** A client is a user whose assigned role is the stock Client (read-only) role with a non-empty owner scope. **Purpose-built client home (design review):** a client lands on a focused "Your wine" view, their lots, their cases, their operation history, NOT the facility dashboard with everything greyed out. Nav shows only their domains; configure and work-order authoring are absent, not merely hidden. **Warm empty state (design review, DESIGN.md principle "empty states are features"):** a client with no wine yet sees "Your winemaker hasn't logged anything here yet", with warmth and context, not "No items found." The DB fence from Unit 7 is what makes this safe; the UI is presentation. **Scope note:** this overlaps Phase 24's client portal; Phase 23 ships a genuine client home (their wine, read-only), and Phase 24 extends it with billing, invoices, and the AP filing surface. The client home reuses `src/components/ui/` and honors DESIGN.md.
**Tests:** A client user's resolved capability set denies configure and draft; nav renders the reduced set; the client home shows only owner-scoped rows (belt to the Unit 7 DB fence); the empty state renders for a client with no lots.
**Depends on:** Units 10, 11
**Verification:** Browser QA on Demo with a `QA-` client user (both with wine and empty), plus `npm run verify:owner-isolation`.

### Unit 17: Rollout and backfill

**Goal:** Nobody loses access.
**Files:** `scripts/backfill-rbac-assignments.ts` (new)
**Approach:** Dry-run by default, reporting every user and the role they would receive from their legacy `role`. Apply only with an explicit flag. Assert afterwards that every active user resolves to a non-empty capability set and that the count of users who can configure settings is unchanged.
**Tests:** Dry-run output matches expectation on Demo; re-running is idempotent.
**Depends on:** Units 5, 16
**Verification:** Dry run on Demo, then on the real tenant, reviewed before applying.

### Unit 18: Documentation and registers

**Goal:** The brain stays true.
**Files:** `INVARIANTS.md`, `docs/architecture/system-map.md`, `docs/architecture/security-register.md`, `docs/architecture/assistant-coverage.md`, `ROADMAP.md`
**Approach:** Root `INVARIANTS.md` has no tenancy or authorization section at all; add one covering RBAC-1 and cross-referencing TENANT-1 and INBOX-1. Append a security-register entry (what, why, what breaks at scale, tripwire). Regenerate the assistant coverage table. Mark Phase 23 shipped in the roadmap, and correct its stale Phase 9 and Phase 10 status lines while there.
**Tests:** `npm run verify:invariants`; `npm run verify:ai-native` in check mode.
**Depends on:** all
**Verification:** Both verifies green.

## Test Strategy

Three layers, matching how this repo already proves isolation.

**Pure unit tests** for the capability vocabulary and resolution: `can()` totality, legacy-role
expansion, scope resolution, self-lockout guards. No DB, fast, run in every `vitest run`.

**DB isolation proof**: `npm run verify:owner-isolation`, modelled on `verify-inbox-isolation`.
Asserts the teeth first (the app role really is NOBYPASSRLS), then positive and negative reads,
writes, deletes, raw-query escape attempts, unset-GUC fail-closed, and a coverage guard over
owner-scoped models. Mirrored as a gated case in `test/tenant-isolation.test.ts`.

**Assistant evals**: golden cases for both tools, a MUST_PROPOSE case with an invented-email
trap, and a committer test proving a non-admin with a valid token is refused, which is the
specific hole the confirm route leaves open.

**Anti-regression**: a grep test that fails if a raw role comparison reappears outside the
RBAC module.

## Rollout

1. Branch A1 lands behind no flag and changes no visible behavior: `app_owner_scope` resolves to
   **unscoped** for every existing user via the transitional legacy arm (`User.role IN
   (admin,user,developer)` and no client assignment), so the new RESTRICTIVE policies are satisfied
   by everyone the instant they land. There is no outage window, and no dependency on the backfill
   having run yet, which is why the policies can ship in A1 rather than behind a soak (P1-5). The
   legacy arm is the bridge that keeps the fail-closed `scope:all` design from blacking out
   unbackfilled staff; it is removed in a later phase once the backfill has granted `scope:all`.
2. Run Unit 17's backfill in dry-run on Demo, then on the real tenant, and review the diff
   before applying.
3. Branch B lands the surfaces. The first genuinely scoped user is a `QA-` client on Demo.
4. **The one dangerous act is creating the first scoped client.** Do not create an owner-scope
   assignment in the real tenant until `verify:owner-isolation` has passed against it. Everything
   before that point is unscoped and safe.

## Open Questions

All the pre-council open questions are now resolved. Remaining, for `/plan-design-review` and the
build:

1. **DB-side ownership FK (council/Codex).** Whether to add the composite `(tenantId, ownerId,
   lotId)` FK on the ownership edges now (DB-enforced parent-child owner tie) or ship the verify
   script's lineage recompute as the backstop first. Leaning: verify-first, add the FK if drift
   ever appears. Confirm at build time.
2. **AP filing UI is Phase 24.** Unit 3c ships the `ownerId` column and scope on the compliance
   chain; the per-owner 5120.17 generator and the client filing surface are explicitly Phase 24.
3. **Resolved by council:** WorkOrderTask (EXISTS-by-lots, Unit 7b), CostLine visibility
   (Unit 3b), compliance owner (Unit 3c), `app.user_id` membership cross-check (now a requirement
   inside `app_owner_scope`, Unit 7), branch split (A1/A2/B).

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Roadmap is explicit and research confirmed the existing fence is not one. |
| Scope Boundaries | HIGH | Phase 24 boundary is clean; the minimal-Owner call is the only judgement. |
| Implementation Units | HIGH | Q1 resolved in eng review, the owner-scope surface is enumerated. The two residual cost/WO calls go to `/council` but do not block the spine. |
| Test Strategy | HIGH | Two working templates exist in-repo. |
| Risk Assessment | MEDIUM | The ~19 scattered role checks are inventoried but a miss is silent (Unit 9 ships a grep guard); the denormalized-`ownerId` staleness risk is new and rests on the chokepoint discipline holding. |

Eng review (2026-07-23) resolved the scope surface, chose denormalized `ownerId` over
EXISTS-joins, DB-derived owner set over an app-supplied GUC, the full RESTRICTIVE quad, an
actor-bound short-TTL token for the privilege tool, and a no-outage rollout. The `CostLine` /
`WorkOrderTask` scoping nuance is the sharpest thing to put to `/council` next.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES RESOLVED | 6 decisions + 2 criticals; all folded into the plan |
| Outside Voice | independent adversarial subagent | Blind-spot challenge | 1 | 2 CRITICAL found | both resolved (Units 5b, 6b) |
| Council | `/council` | Cross-LLM (codex+gemini) | 1 | ISSUES RESOLVED | 4 decisions + 6 fold-ins; all folded in |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES RESOLVED | 5/10 → 9/10; 3 decisions folded into Units 11, 16 |

**ENG REVIEW (2026-07-23):** Six architecture decisions, all taken to the complete option:
(1) scope surface = bulk AND bottled; (2) denormalized `ownerId`, not 25 EXISTS-joins;
(3) owner set derived by the DB from `app.user_id`, not an app-supplied GUC; (4) full RESTRICTIVE
quad incl. INSERT; (5) no-outage rollout via unscoped-on-no-assignment semantics; (6) actor-bound
60s token for the privilege tool.

**OUTSIDE VOICE (independent Claude subagent; codex unavailable — 45KB plan exceeds the Windows
argv limit and codex's read-only sandbox can't spawn a reader):** found two CRITICALs the eng
review missed. #1 — the fence never engages on ordinary page reads because `app.user_id` is `''`
on the bare RSC path (would have shipped a decorative fence); resolved by Unit 5b. #2 — a
cross-owner blend has no coherent single `ownerId` and silently mis-attributes; resolved by
Unit 6b (refuse at the chokepoint). Four lesser findings folded in: SECURITY DEFINER specifics +
no per-user policy on `role_assignment`; `EXISTS(member...)` cross-check on `app.user_id` promoted
to a requirement; reversal/correction re-stamp tests added; token bind covers the resume token and
rejects-if-absent; `DO $$` asserts FORCE.

**COUNCIL (2026-07-23; Codex fell back to gpt-5.4-mini, Gemini 3.1 Pro):** Gemini's domain fire
found four real problems two engineering passes missed, all now folded in: (C1) a scalar `ownerId`
on `WorkOrderTask` breaks multi-owner group ops → scope by lots via EXISTS (Unit 7b); (C2) a
`CostLine` leaks the facility's labor rate → `visibility` enum (Unit 3b); (C3) facility-only
compliance blocks AP clients from filing their legally-required 5120.17 → `ownerId` on the
compliance chain now (Unit 3c); (C4) SECURITY DEFINER search-path hardening. Six fold-ins:
`scope:all` as an explicit capability (not absence-of-assignment); directional TARGET-lot `ownerId`
inheritance (fixes the facility-topping-wine composition leak); per-owner `WineSku`/`lot_code`
uniqueness; inventory every owner-scoped write path not just `runLedgerWrite`; a possible DB-side
composite ownership FK; and the vessel-capacity leak is closed by LEDGER-12 (one-lot-per-vessel),
not the opaque-bucket view Gemini proposed. Branch A split into A1 (infra) + A2 (call-sites) for
reviewability. Full synthesis in `council-feedback-092-granular-rbac.md`.

**CROSS-MODEL:** Codex and Gemini independently agreed Branch A was too big → split. No direct
contradictions between the two.

**DESIGN REVIEW (2026-07-23; text-only, design binary unavailable on this box; calibrated against
DESIGN.md — warm editorial, APP UI, token-driven, light-only):** rated 5/10 → 9/10. Three decisions
folded in. (1) The role builder is **preset-first, not a raw 7x9 matrix** — clone a stock role, show
only changed cells, with a live plain-English readback of what the set permits (Unit 11). (2) A
custom-crush client gets a **purpose-built "Your wine" home** with a warm empty state, not a greyed-out
facility shell; overlaps Phase 24's portal, so Phase 23 ships the read-only home and 24 extends it
(Unit 16). (3) The two scope axes are **progressive** — owner-scope shows only for a Client role,
vineyard-scope only for vineyard roles, with a combined "this person can see: [plain English]"
readback (Unit 11). Blast-radius confirm, the visible-and-explained self-lockout disable, grid
batching, and DESIGN.md token compliance were also specified into Unit 11. No AI-slop risk (internal
admin UI, not marketing).

**INCUMBENT PARITY (2026-07-23; Vintrace + InnoVint docs, incl. API specs):** confirmed the core
architecture matches both battle-tested incumbents — owner-scope WITHIN one tenant, NOT a
per-client database. Two decisions realigned to the incumbents: (1) cross-owner blends are no longer
refused outright; a first-class `CHANGE_OWNERSHIP` event (Vintrace's `CHANGE_OWNER`, InnoVint's
transfer-in-bond) brings wine under one owner first, then blends — scalar `ownerId` preserved, no
fractional (Unit 6b). (2) compliance keys off a first-class `Bond` (derives from location, AP
owner-bond takes precedence), not `ownerId` directly (Unit 3c). Three of the plan's choices EXCEED
both incumbents and are kept as differentiators: the CostLine visibility split, the purpose-built
client home, and DB-enforced RLS. Full analysis in `docs/plans/092-incumbent-parity-ap-custom-crush.md`.

**UNRESOLVED:** none blocking. Two build-time confirmations: whether to add the DB-side composite
ownership FK now or ship the verify-recompute first; AP filing UI is explicitly Phase 24.

**FULL 8-DOMAIN AUDIT (2026-07-23):** a follow-on audit of the WHOLE data model vs both incumbents
(`docs/architecture/data_model_coalescence.md`) confirmed plan 092's ownership decisions and corrected
one over-scope: **the first-class `Bond` entity already exists** (`schema.prisma:2487`), so Unit 3c is
re-scoped to wire AP-owner bond precedence + the owner-scope column, not build Bond. `CHANGE_OWNERSHIP`
(Unit 6b) and `CostLine.visibility` (Council C2) are confirmed genuinely unbuilt and correct to build.
The audit also validated the moat (append-only ledger, lineage DAG, one-lot-per-vessel, 5000.24/CBMA)
as `keep`, not align-away.

**VERDICT:** ENG + COUNCIL + DESIGN + INCUMBENT-PARITY (+ full audit) CLEARED. The plan is
review-complete and aligned with both incumbents' data models. Ready to `/work` — build Branch A1
first (the security spine).
