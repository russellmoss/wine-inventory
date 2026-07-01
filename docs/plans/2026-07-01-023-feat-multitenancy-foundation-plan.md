---
title: Multi-tenancy foundation (pooled shared-schema + RLS)
type: feat
status: draft
date: 2026-07-01
branch: main
depth: deep
units: 12
phase: "ROADMAP Phase 12 (isolation-boundary slice); honors VISION D16"
revision: 4 (post-/council + /plan-eng-review + /plan-design-review)
status: completed
---

> **BUILT 2026-07-01 (on `main`, commits e61e14f…ba3314e).** All 12 units shipped + applied to
> prod (Neon `muddy-shape-80817041`, PG17). Isolation proven AS the `app_rls` role
> (`scripts/verify-tenant-isolation.ts` green: fail-closed, cross-tenant SELECT/UPDATE/DELETE=0,
> WITH CHECK + composite-FK cross-tenant rejected). 7 domain verify-* suites pass under
> `runAsTenant`; 601 vitest pass; full tsc 0. Deviations (noted in commits): plain (non-CONCURRENT)
> index builds + plain SET NOT NULL (single-tenant, controlled window); `tenantId @default('')` makes
> creates type-optional (auto-inject is the real source; '' is fail-safe). Read-path tenant context
> = lazy-resolve-in-extension (operator-approved). **PENDING ACTIVATION (with operator):** repoint
> runtime `DATABASE_URL` → `DATABASE_URL_APP` (app_rls) locally + in Vercel, AFTER which RLS enforces
> for the live app. Until then the app runs as owner (RLS inert, single-tenant Bhutan — safe).

## Overview

Turn the single-winery app (currently hardcoded "Bhutan Wine Company") into a **multi-tenant
SaaS** with hard, database-enforced data isolation, so we can onboard design-partner wineries
without one winery ever seeing another's data. Model: **pooled shared schema** — every domain
row carries a `tenantId` (the winery), **Postgres Row-Level Security** enforces isolation in
the database (not app code), uniqueness becomes **per-tenant**, and the tenant is resolved
from the authenticated session's **active organization** (Better Auth organization plugin).
This is the **isolation-boundary slice** of ROADMAP Phase 12; the SaaS operational layer
(signup/provisioning/billing/branding/org-switcher UI) is explicitly deferred.

Why now: the pre-raise milestone is "3-5 Northeast wineries live," which is multi-tenant by
definition. Multi-tenancy is the one thing that gets *more* expensive to retrofit with every
feature phase and every row, and a cross-tenant leak is the worst possible B2B failure. Do the
boundary before winery #2's data ever coexists with Bhutan's.

## Problem Frame

The app is single-tenant: `getCurrentUser()` (`src/lib/dal.ts`) authenticates a user, the
`action()`/`adminAction()` wrappers (`src/lib/actions.ts`) thread an `actor`, and every query
runs against one shared pooled Prisma client with no tenant scoping. Uniqueness is **global**
(`Lot.code`, `Vessel(type,code)`, `WineSku`, `CellarMaterial`, `Variety`/`Location`/`Vineyard`
names). The moment a second winery's data lands, those global uniques collide and — far worse —
nothing stops a query from reading another winery's rows.

If we do nothing: we can't onboard a second winery (so we can't get the design-partner traction
that gates the raise), and retrofitting tenancy after Phases 8-11 touches vastly more surface.

**Product pressure-test:** the simpler framings fail. "App-layer `WHERE tenantId` only" leaves
no safety net — one forgotten filter leaks data. "A separate deployment per winery" doesn't
scale, isn't the SaaS story, and still needs this retrofit later. DB-enforced RLS on a pooled
schema is the minimum that's both safe and fundable at this stage.

## Requirements

- **MUST:** Every domain/registry row carries a non-null `tenantId` (FK → Organization).
- **MUST:** Isolation is **enforced in Postgres via RLS** — `ENABLE` + **`FORCE ROW LEVEL
  SECURITY`** on every tenant table, policies with **both `USING` and `WITH CHECK`**, keyed on
  a transaction-scoped setting, **fail-closed** when the setting is absent (deny all rows).
- **MUST:** The app connects as a **dedicated non-owner, `NOBYPASSRLS`, non-superuser role**
  (Neon's default `neondb_owner` owns tables and carries `BYPASSRLS`, which silently disables
  RLS). Migrations continue to run as the owner (unpooled).
- **MUST:** Tenant context is set with **`set_config('app.tenant_id', id, true)`**
  (transaction-scoped), never a session-level `SET` (which leaks across Neon's PgBouncer
  transaction-pooled connections).
- **MUST:** The **ledger chokepoint** (`runLedgerWrite` interactive SERIALIZABLE tx) sets the
  tenant at the top of its transaction **and re-sets it on every P2034 (40001) retry**.
- **MUST:** All **global unique constraints become per-tenant composites** (e.g. `Lot.code`
  → `(tenantId, code)`; the two `WineSku` partial indexes gain `tenantId`).
- **MUST:** `tenantId` is derived from the **verified session's active organization**
  (Better Auth), never from a client header/param/subdomain.
- **MUST:** A **first-class cross-tenant isolation test suite** proves no read/update/delete/
  insert can cross tenants, run in CI on every change.
- **MUST:** A data migration **backfills existing Bhutan data as tenant #1** and flips uniques
  without a cross-tenant-duplicate failure, hand-authored for Windows/Neon.
- **SHOULD:** Defense in depth — a Prisma client extension **auto-injects `tenantId` on
  creates** (so app bugs can't omit it) on top of RLS.
- **SHOULD:** `AppSettings` (today an `id="singleton"` row, home of Phase 7 `sparklingEnabled`)
  becomes per-org.
- **NICE:** A lightweight `middleware.ts` or DAL helper centralizes tenant resolution.

## Scope Boundaries

**In scope (the isolation-boundary slice):**
- Better Auth organization plugin (Organization + Member + active-org-in-session).
- `tenantId` on every domain/registry table + backfill + per-tenant uniqueness.
- Non-owner app role + RLS policies (ENABLE/FORCE/USING/WITH CHECK, fail-closed).
- Tenant-context plumbing (AsyncLocalStorage + Prisma extension + ledger/audit threading).
- Access predicates updated so the org boundary sits above D9 vineyard RBAC.
- Cross-tenant isolation test suite + a `verify-tenant-isolation.ts` proof.
- `AppSettings` per-org.

**Out of scope (deferred — Phase 12 second slice, its own plan + design review):**
- Org **signup/self-provisioning**, user **invitations UX**, **billing**, **per-tenant
  branding/theming**, the **org-switcher UI**, tenant-admin surfaces. (Better Auth models the
  data for invites/roles; we adopt the tables now but not the end-user flows.)
- **Multi-org switching UX** — the membership join table is multi-org-capable from day one
  (a user can belong to >1 winery), but the in-app switcher is deferred; one active org per
  session for now.
- Graduating a large/regulated tenant to schema- or DB-per-tenant (bridge model) — later, if
  ever needed.

## Research Summary

### Codebase Patterns (grounded, `main`)
- **Auth:** Better Auth (`src/lib/auth.ts`), prismaAdapter, admin-only signup. `getCurrentUser()`
  (`src/lib/dal.ts`) reads the session then **reloads security-critical fields from the DB**
  (role, banned, vineyard memberships) — a strong posture to extend with active-org.
- **Actor threading:** `action()`/`adminAction()` (`src/lib/actions.ts`) build
  `ActionCtx { user, actor: { actorUserId, actorEmail } }`; the single choke to inject tenant.
- **Prisma:** plain global singleton (`src/lib/prisma.ts`), **no `$extends`/`$use` yet**;
  pooled `DATABASE_URL` at runtime, `DATABASE_URL_UNPOOLED` for migrations.
- **Ledger:** `runLedgerWrite` = `prisma.$transaction(fn, { isolationLevel: Serializable,
  timeout, maxWait })` + `withWriteRetry` (P2034 ×5). `writeLotOperation(tx, WriteOpInput)` —
  add `tenantId`. No tenant context set on the connection today.
- **No `middleware.ts`.** Tenant is resolvable from `getCurrentUser().activeOrganizationId`.
- **44 models.** Global (stay): `User`, `Session`, `Account`, `Verification`, + Better Auth org
  tables. Everything else (registries, vineyard ops, bulk-wine ledger, bottling, chemistry,
  blends/RBAC, audit) → tenant-scoped. `AppSettings` singleton → per-org.
- **Global uniques to flip (verbatim, per-tenant composites):** `Lot.code`→`(tenantId,code)`;
  `Vessel @@unique([type,code])`→`+tenantId`; `WineSku` partial indexes `UNIQUE(name,vintage,
  bottleSizeMl) WHERE vintage IS NOT NULL` + `UNIQUE(name,bottleSizeMl) WHERE isNonVintage`
  →`+tenantId`; `CellarMaterial(kind,normalizedKey)`; `Variety(name)`,`Variety(abbreviation)`;
  `Location(name)`; `Vineyard(name)`,`Vineyard(abbreviation)`; `FieldInput(type,normalizedKey)`;
  `FinishedGoodCategory(name)`; `VesselGroup(name)`; `FieldNote(vineyardId,weekOf)`;
  `HarvestRecord(blockId,vintageYear)`; `VineyardSubblock(blockId,code)`;
  `VesselComponent(...)`; `VesselLot(vesselId,lotId)`; `BottledInventory(wineSkuId,locationId)`;
  `FinishedGoodInventory(finishedGoodId,locationId)`; `LotVineyard(lotId,vineyardId)`;
  `UserVineyard(userId,vineyardId)`; `BlendTrialComponent(trialId,lotId)`;
  `VesselGroupMember(groupId,vesselId)`; `AnalysisReading(panelId,analyte)`. Internal/opaque
  uniques that can stay global: `clientRequestId`/`commandId`/`nonce`/`token`/`correctsOperationId`
  (globally-unique CUIDs/tokens — but they'll still be tenant-filtered by RLS on read).
  `LotLineage(parentLotId,childLotId)` stays as-is (both FKs are already same-tenant).
- **D9 RBAC** (`src/lib/access.ts`): `canAccessVineyard`/`canAccessLot` over a vineyard
  membership set. Tenancy sits **above** this: org boundary first, then vineyard membership
  within the org.

### Prior Learnings
- Windows/Neon: `prisma migrate dev` is broken (interactive + phantom `search_vector`); use
  `migrate diff`/`--create-only` → hand-edit SQL → `migrate deploy`; RLS, CHECK, and
  `CREATE INDEX CONCURRENTLY` are **not expressible in the Prisma schema** — raw SQL only.
- Phase 7 already set the WineSku two-partial-index pattern (nullable vintage) — this plan
  extends both with `tenantId`.
- Worktree is behind `main` by Phase 6/7; `/work` runs on `main`.

### External Research (cited, verified against primary sources)
- **Model:** pooled shared-schema + `tenant_id` + RLS is the standard for dozens-to-hundreds of
  SMB tenants (AWS SaaS Lens pool model; Supabase/Crunchy/Nile). Schema-per-tenant and DB/
  project-per-tenant carry migration/ops/analytics costs that don't fit a solo, hand-migrating
  shop; keep them as a future "bridge" graduation for a large/regulated tenant.
- **Neon RLS traps (load-bearing):** table owners bypass RLS; `neondb_owner`/`neon_superuser`
  carry `BYPASSRLS` → RLS silently does nothing unless we (a) connect as a **non-owner,
  NOBYPASSRLS** role and (b) `FORCE ROW LEVEL SECURITY`. Policies need **`WITH CHECK`** (not
  just `USING`) or a tenant can write a foreign `tenantId` on UPDATE/INSERT.
- **Pooling:** `set_config(name, val, true)` / `SET LOCAL` are transaction-scoped and safe under
  PgBouncer transaction mode; plain session `SET` **leaks across pooled connections** (pgbouncer
  lists `SET` as never-safe in transaction mode). This resolves the codebase agent's "pooled+RLS
  incompatible" concern — the canonical pattern co-locates the set with the query in one tx.
- **Canonical Prisma pattern:** a client **extension** (`Prisma.defineExtension` →
  `query.$allModels.$allOperations`) wrapping each op as `$transaction([ $executeRaw
  set_config('app.tenant_id', ${id}, true), query(args) ])`; tenant read from
  **`AsyncLocalStorage`** (one shared client, not a client-per-request — that exhausts the pool).
  `set_config` (not `SET LOCAL app.x = $1`) because it accepts a **bound parameter** (never
  string-interpolate the tenant id). Footguns: the extension's batch tx conflicts with
  interactive `$transaction` (so the ledger path sets tenant manually — see K5); ALS breaks on
  Edge runtime (use Node runtime); pin Prisma version if enabling `queryCompiler`.
- **Migration safety:** add `tenantId` **nullable → backfill → NOT NULL** (PG18 native
  `ADD CONSTRAINT ... NOT NULL ... NOT VALID`→`VALIDATE`; pre-18 `CHECK (col IS NOT NULL) NOT
  VALID`→`VALIDATE`→`SET NOT NULL`→drop check — check the Neon PG major first). Flip uniques with
  `CREATE UNIQUE INDEX CONCURRENTLY` (its **own migration file, not in a txn**) then
  `... UNIQUE USING INDEX` + drop the old.
- **Auth→tenant:** model Organization + Member (user↔org join) day one; active org in session;
  resolve tenant from the verified session; defer the switcher UI. Better Auth's organization
  plugin provides exactly this.
- **Isolation testing:** run tests as the **non-owner role**; assert cross-tenant SELECT/UPDATE/
  DELETE return **0 rows** (RLS makes them invisible) and a foreign-`tenantId` INSERT **raises**
  (WITH CHECK). Tools: `pgrls`, Atlas RLS testing patterns.

## Key Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|----------|--------|-----------------------|-----------|
| **K1** | Tenancy model | **Pooled shared schema + `tenantId` + Postgres RLS.** | Schema-per-tenant; DB/project-per-tenant | User-selected. Cheapest hand-authored migrations, easiest cross-winery benchmark analytics (the data moat), standard for SMB scale. Bridge-model graduation stays available later. |
| **K2** | Org / tenant model | **Better Auth organization plugin.** `organization.id` **is** the `tenantId`; `member` is the user↔org join (multi-org capable); the session carries the **active organization**. | Roll our own org/membership; 1:1 `user.tenantId` | User-selected. Batteries-included (members, invites, roles, active-org) on the auth we already run; membership join day one keeps multi-org open; defer switcher UI. |
| **K3** | RLS enforcement mechanism | **Prisma client extension** wrapping each op in `$transaction([ set_config('app.tenant_id', ${id}, true), query ])`, tenant from **`AsyncLocalStorage`**; plus **auto-inject `tenantId` on create**. **The extension applies a MODEL DENYLIST** — the global auth/org models (`User`/`Session`/`Account`/`Verification`/`organization`/`member`/`invitation`) are **excluded** from the tenant wrap (eng-review), since Better Auth queries them *during login, before a tenant is known*; forcing them through tenant context would break auth. | Session `SET`; per-request PrismaClient; app-only `WHERE`; wrapping ALL models (breaks login) | Transaction-scoped set is pooling-safe; one shared client preserves the pool; auto-inject is the WITH-CHECK backstop; the denylist keeps pre-tenant auth queries working. Canonical, Prisma-maintained pattern. |
| **K4** | Neon safety rails | Dedicated **non-owner, `NOBYPASSRLS`, non-superuser app role** for runtime; **`ENABLE`+`FORCE ROW LEVEL SECURITY`**; policies with **`USING` + `WITH CHECK`**; **fail-closed** (`current_setting('app.tenant_id', true)` NULL → deny). Migrations run as owner (unpooled). | Running app as `neondb_owner` (RLS silently bypassed) | Owners + `BYPASSRLS` bypass RLS on Neon; without a non-owner role + FORCE, the whole boundary is a no-op. Non-negotiable. |
| **K5** | Ledger × RLS interaction | The **`runLedgerWrite` wrapper** issues `set_config('app.tenant_id', id, true)` as the **first `tx.$executeRaw` before it calls `fn(tx)`** (so it precedes the vessel_lot fold reads, which under RLS would otherwise return 0 rows), and because it lives in the wrapper it is **re-applied automatically on every P2034 retry** (each retry re-enters `$transaction`). The global Prisma extension is bypassed for this path. `tenantId` is added to `WriteOpInput`/the `runLedgerWrite` signature. | Relying on the extension inside `runLedgerWrite` (deadlock/blocking per Prisma #23583); setting tenant in the caller (not re-applied on retry) | Verified sound (postgresql.org: is-local `set_config` persists across the whole interactive tx; Prisma runs one connection for it). Placement in the wrapper before `fn` is the precision fix from eng review. |
| **K6** | Uniqueness | Every global unique → **per-tenant composite**; `Lot.code`→`(tenantId,code)`; both `WineSku` partial indexes gain `tenantId`; opaque CUID/token uniques (`clientRequestId`, `commandId`, `nonce`, `token`) stay global. | Encoding tenant into the code string | Cleanest per-tenant code space, no change to code-generation logic; opaque tokens are already globally unique + RLS-filtered on read. |
| **K7** | Migration safety | `tenantId` **nullable → backfill Bhutan as tenant #1 → NOT NULL** (PG-version-aware pattern); unique flips via **`CREATE UNIQUE INDEX CONCURRENTLY`** in isolated migration files. | Add NOT NULL directly (full-table `ACCESS EXCLUSIVE` scan); CIC inside a txn (errors) | Documented low-lock path; avoids the CIC-in-transaction failure; backfill first so NOT NULL + composite uniques don't violate. |
| **K8** | Defense in depth | **RLS (DB) + Prisma auto-inject `tenantId` (app) + isolation test suite (CI).** Never rely on app-layer `WHERE` alone. | RLS-only; app-only | PlanetScale's caution: RLS is only as safe as the app setting the GUC every request; the extension + tests are the belt to RLS's suspenders. |
| **K9** | Tenant resolution | From the **verified session's active organization** (`getCurrentUser().activeOrganizationId`), injected in `action()`/`adminAction()` and run inside `tenantStore.run()`. Scripts set it explicitly. Never from a client header/param/subdomain. | Client-supplied tenant; subdomain-as-auth | Trust boundary rule: a client-controlled tenant id is a cross-tenant exploit. |
| **K10** | What stays global | Better Auth core (`User`/`Session`/`Account`/`Verification`) + the org plugin tables. Everything domain/registry gets `tenantId`. `AppSettings` singleton → **per-org**. | tenantId on auth tables | The org *is* the tenant; a user is global identity with org memberships. |
| **K11** | Cross-tenant FK integrity (council CRITICAL #1) | **FK checks bypass RLS** — Postgres validates FKs as the system, ignoring RLS. So a tenant-A write referencing tenant-B's opaque id (`LotOperationLine.lotId/vesselId`, `LotLineage.parent/child`, `VesselLot`, `BottlingSource`, `LotVineyard`, `LotHarvestSource`, blend inputs) would succeed and be stamped tenant-A → a permanent cross-tenant edge. **Fix (hybrid, defense-in-depth):** add composite `(tenantId, id)` uniques on referenced tenant tables and make the cross-tenant-risk FKs **composite `(tenantId, refId)`**; AND in `writeLotOperation`/blend/lineage cores **assert every referenced row is visible + same-tenant** (count(visible)==expected) and fail otherwise. | App-layer assertion only (not DB-enforced, violates D14 spirit); composite FKs on all 35 tables (over-broad) | Composite FKs on the *lineage/ledger* relations make cross-tenant references structurally impossible; the app assertion also prevents "silently compute on 0 rows" when RLS hides a foreign lot. **Exact FK scope is the key `/plan-eng-review` decision.** |
| **K12** | Cache/ALS discipline (council CRITICAL #2) | `tenantId` is an **explicit required argument to every memoized/cached data function** (React `cache()`, `unstable_cache`, any fetch-cached path). Never read tenant from `AsyncLocalStorage` *inside* a memoized fn. | Relying on ALS inside cached fns | A cache keyed only on args serves the first tenant's rows to the next tenant. ALS is for setting the DB session per op, not for keying caches. Add a lint/convention gate. |
| **K13** | Active-org revalidation (council CRITICAL #3) | `getCurrentUser()` **re-validates the session's active organization against the `member` table server-side on each request** (short-TTL cached), before any `set_config`. A revoked/stale active-org is rejected immediately, not at token expiry. | Trusting the session's active-org claim | Extends the existing "reload security-critical fields from DB" posture in `dal.ts`; closes the revoked-membership escalation window. |

## Implementation Units

> Ordering is migration-critical. Enums/new tables and nullable columns land before backfill;
> backfill before NOT NULL and per-tenant uniques; RLS + app plumbing before flipping the app
> to the non-owner role; isolation tests last. Cores stay split from `"use server"`. No
> implementation code here — approach + DSL only. All migrations hand-authored (Windows/Neon).

### Unit 1: Better Auth organization plugin + Organization tables + seed tenant #1
**Goal:** Introduce the Organization (tenant) + Member join, with Bhutan as tenant #1 and every
existing user a member with an active org.
**Files:** `src/lib/auth.ts` (enable `organization()` plugin), `src/lib/dal.ts` (load
`activeOrganizationId` + memberships), new migration `.../_org_plugin/migration.sql`, a
one-time seed step.
**Approach:** Enable the Better Auth **organization plugin**; generate its `organization`/
`member`/`invitation` tables (hand-author the SQL from the plugin's schema). Seed one
Organization ("Bhutan Wine Company"), add all existing users as members (role from their
current role), and set each session's active organization to it. `getCurrentUser()` gains
`activeOrganizationId` and **re-validates it against the `member` table server-side each
request** (short-TTL cache) — a revoked/stale active-org is rejected immediately, not at token
expiry (K13), extending the existing "reload security-critical fields from DB" posture.
**Tests:** unit — `getCurrentUser()` returns an `activeOrganizationId` for a seeded user; a
user with no membership resolves to none (and is denied downstream); a user whose membership was
revoked is denied on the very next request (K13).
**Depends on:** none. **Verification:** log in as the Bhutan admin → session has the org id.

### Unit 2: Add nullable `tenantId` to every domain/registry table
**Goal:** Add the column everywhere it belongs, nullable, no rewrite.
**Files:** `prisma/schema.prisma` (tenantId FK → Organization on ~35 models), migration
`.../_tenantid_nullable/migration.sql`.
**Approach:** Add `tenantId String?` + FK + index on every tenant-scoped model (the full list
from Research; NOT on the global auth/org tables). Nullable so the add is instant. Index every
`tenantId` (RLS policies + queries filter on it).
**Tests:** none (schema); covered by Units 3-4-11. **Depends on:** Unit 1.
**Verification:** `prisma validate`; `migrate deploy`; generated client shows nullable tenantId.

### Unit 3: Backfill Bhutan as tenant #1
**Goal:** Every existing row gets `tenantId` = the Bhutan org.
**Files:** `scripts/backfill-tenant.ts` (or SQL in a migration), run with `tsx --env-file=.env`.
**Approach:** Set `tenantId` = Bhutan org id on all rows of every tenant-scoped table, in FK-safe
order, batched. Idempotent (WHERE tenantId IS NULL). Verify row counts before/after.
**Tests:** a verification query asserting zero NULL `tenantId` remain per table.
**Depends on:** Unit 2. **Verification:** `SELECT count(*) WHERE tenantId IS NULL` = 0 everywhere.

### Unit 4: Flip global uniques to per-tenant composites (CONCURRENTLY)
**Goal:** No cross-winery collisions; each winery gets its own code/name space.
**Files:** one migration file **per** `CREATE UNIQUE INDEX CONCURRENTLY` (CIC can't run in a txn),
plus the `WineSku` partial-index recreation.
**Approach:** For each global unique (K6 list): `CREATE UNIQUE INDEX CONCURRENTLY <t>_tenant_<cols>
ON <t>(tenantId, <cols>)` (own file) → in a follow-up txn (guarded by `SET lock_timeout`), drop
the old constraint/index and `ADD CONSTRAINT ... UNIQUE USING INDEX` where a named constraint is
needed; **keep the old index until the composite is built + verified**. `WineSku`: recreate the
two partial indexes with `tenantId` prepended. `Lot.code` → `(tenantId, code)`.
**Also (K11 — cross-tenant FK integrity; fork resolved = hybrid):** add a composite `(tenantId, id)`
unique to the tenant tables referenced by the **cross-tenant-risk lineage/ledger relations** —
`LotOperationLine`→`Lot`/`Vessel`, `LotLineage`→`Lot`×2, `VesselLot`→`Vessel`/`Lot`,
`BottlingSource`→`Lot`, `LotVineyard`→`Lot`/`Vineyard`, `LotHarvestSource`→`Lot`/`HarvestPick`,
blend-trial components — and recreate **those** FKs as composite `(tenantId, refId) → (tenantId,
id)`. Other tenant relations keep single-column FKs + the app-layer assertion. **Sequencing
(eng-review):** the composite `(tenantId,id)` uniques can build here (post-backfill), but the
**composite FK creation must run AFTER Unit 5 sets `tenantId NOT NULL`** — a composite FK with a
nullable `tenantId` uses MATCH SIMPLE and **skips the check whenever `tenantId` is null**, leaving
the exact hole we're closing. So: Unit 4 = per-tenant uniques + composite `(tenantId,id)` uniques;
Unit 5 = NOT NULL; **Unit 5b = composite FK creation**.
**Tests:** after flip, two orgs can both have `Lot.code = '2025-PN-1'`; a dup within one org still
rejected; a composite FK rejects an insert whose `(tenantId, refId)` crosses tenants.
**Depends on:** Unit 3 (backfill first, so composites don't fail on NULLs).
**Verification:** insert same code under two orgs succeeds; same code twice in one org fails; a
cross-tenant FK insert is rejected at the DB.

### Unit 5: Enforce `tenantId NOT NULL`
**Goal:** Make the tenant boundary structural.
**Files:** migration `.../_tenantid_notnull/migration.sql` (+ `prisma/schema.prisma` tenantId →
non-null).
**Approach:** Version-aware, low-lock: **PG18+** `ALTER TABLE t ADD CONSTRAINT t_tenant_nn NOT NULL
tenantId NOT VALID` → `VALIDATE CONSTRAINT`; **pre-18** `ADD CONSTRAINT t_tenant_nn CHECK (tenantId
IS NOT NULL) NOT VALID` → `VALIDATE` → `ALTER COLUMN tenantId SET NOT NULL` → drop the CHECK.
Confirm the Neon compute's PG major first.
**Then (Unit 5b — composite FKs, after NOT NULL):** recreate the cross-tenant-risk lineage/ledger
FKs as composite `(tenantId, refId) → (tenantId, id)` against the `(tenantId,id)` uniques built in
Unit 4 (K11 hybrid). Must follow NOT NULL so MATCH SIMPLE doesn't skip null-tenant rows. Update the
Prisma relations accordingly.
**Tests:** insert with null tenantId is rejected at the DB; a composite FK rejects a cross-tenant
reference. **Depends on:** Units 3, 4.
**Verification:** `prisma validate`; a null-tenant insert errors.

### Unit 6: Dedicated non-owner app role + connection wiring
**Goal:** Make RLS actually apply (Neon owner/BYPASSRLS bypasses it otherwise).
**Files:** a role-setup SQL migration (run as owner), `.env`/deploy config (a new
`DATABASE_URL` that connects as the app role, pooled), docs in `AGENTS.md`.
**Approach:** `CREATE ROLE app_rls NOLOGIN NOBYPASSRLS` (+ a login role / password), `GRANT`
SELECT/INSERT/UPDATE/DELETE on all tenant tables + USAGE on sequences/schema; **do not** grant
ownership or superuser. Point the runtime `DATABASE_URL` (pooled) at `app_rls`; keep the owner
connection (unpooled) for migrations only. Confirm `app_rls` is `NOBYPASSRLS` and not a table
owner.
**Tests:** connected as `app_rls`, `SELECT current_user` ≠ owner; `BYPASSRLS` is false.
**Depends on:** Unit 1 (org tables exist). **Verification:** role attributes query; app boots on
the new role.

### Unit 7: RLS policies (ENABLE + FORCE + USING + WITH CHECK, fail-closed)
**Goal:** DB-enforced isolation on every tenant table.
**Files:** an RLS migration (raw SQL; not expressible in Prisma schema).
**Approach:** For every tenant-scoped table: `ALTER TABLE t ENABLE ROW LEVEL SECURITY; ALTER
TABLE t FORCE ROW LEVEL SECURITY; CREATE POLICY tenant_isolation ON t USING (tenantId =
current_setting('app.tenant_id', true)::text) WITH CHECK (tenantId = current_setting('app.tenant_id',
true)::text);`. Fail-closed: when the setting is unset, `current_setting(...,true)` is NULL and
the predicate is false → **deny all** (never leak on a missing context). Type-match `tenantId`
(text CUID from Better Auth). Grant the policy to `app_rls` only. **Explicitly include the
projection + legacy tables** — `vessel_lot`, `bottled_lot_state`, and legacy `vessel_component`
are tenant data and MUST get policies (a projection with no policy is a silent leak). A checklist
step confirms every tenant-scoped table has RLS enabled + forced (fail the migration if any is
missed).
**Tests:** covered by Unit 11 (this is the thing under test). **Depends on:** Units 5, 6.
**Verification:** with no `app.tenant_id` set, `SELECT * FROM lot` as `app_rls` returns 0 rows.

### Unit 8: Tenant-context plumbing — ALS + Prisma extension + auto-inject
**Goal:** Set the tenant on the connection for every normal query, safely, on the shared client.
**Files:** `src/lib/tenant/context.ts` (AsyncLocalStorage store + helpers), `src/lib/prisma.ts`
(the base client + the `$extends` extension), a `runAsTenant(tenantId, fn)` helper.
**Approach:** One `AsyncLocalStorage<{ tenantId }>` store. Extend the singleton so tenant-scoped
models get `$transaction([ $executeRaw set_config('app.tenant_id', ${tenantId}, true), query(args) ])`,
reading tenant from the store (throw/deny if absent). **Apply a MODEL DENYLIST (eng-review):** the
global auth/org models (`User`/`Session`/`Account`/`Verification`/`organization`/`member`/
`invitation`) are **excluded** from the wrap — Better Auth queries them during login before a
tenant exists, so forcing them through tenant context (or throwing) would break auth. `app_rls`
gets plain DML grants on those global tables (no RLS policy). Add a `create`/`createMany` extension
that **injects `tenantId`** from the store on tenant-scoped models (WITH CHECK backstop).
Node.js runtime only (ALS breaks on Edge). `set_config(..., true)` with a **bound param** (never
string-interpolated). Use the **batch `$transaction([...])` array form** (not interactive) for the
per-op wrap. **Cache discipline (K12):** `tenantId` is an explicit required arg to every memoized/
cached data fn (`cache()`, `unstable_cache`) — never read ALS *inside* a memoized fn, or the first
tenant's rows get served to the next; add a lint/convention gate. **Strip `tenantId` from all
client input / Zod schemas** so it can never be client-supplied; the create-injection sets it from
the store and `WITH CHECK` rejects any mismatch. **Perf note:** per-op transaction wrapping has a
real cost — index every `tenantId`, monitor pool utilization; Neon HTTP driver / route-level tx is
a future option if it gets hot (see Risks).
**Tests:** unit — an op run inside `runAsTenant(A)` emits `set_config` with A; a create without an
explicit tenantId gets A injected; an op with no tenant context throws; a memoized DAL fn keyed on
args does not serve tenant A's rows to tenant B (K12).
**Depends on:** Unit 7. **Verification:** query logs show the `set_config` + query pair per op.

### Unit 9: Resolve + thread tenant through session, actions, ledger, audit
**Goal:** Wire the real tenant from the session into every write path.
**Files:** `src/lib/actions.ts` (`ActionCtx.actor` gains `tenantId`; wrap handlers in
`runAsTenant`), `src/lib/dal.ts`, `src/lib/access.ts` (org-boundary predicate above D9),
`src/lib/ledger/write.ts` (`WriteOpInput.tenantId` + K5: `set_config` first in the tx + on
retry), `src/lib/audit.ts` (+ `tenantId` on every `writeAudit`), `AuditLog` gains `tenantId`,
optional `src/middleware.ts`.
**Approach:** `action()`/`adminAction()` resolve `tenantId` from `getCurrentUser()
.activeOrganizationId`, put it in `actor`, and run the handler inside `runAsTenant(tenantId, …)`.
`canAccessVineyard`/`canAccessLot` first assert the target's org = the user's active org, then
apply D9 membership. the **`runLedgerWrite` wrapper** issues `set_config` as the first `tx.$executeRaw`
**before calling `fn(tx)`** (so it precedes the vessel_lot fold reads) — living in the wrapper
means it's re-applied automatically on each P2034 retry (K5). `writeAudit` writes `tenantId`.
**Ledger integrity under RLS (council DQ8 + K11):** `writeLotOperation`/blend/lineage must
**assert every referenced lot/vessel is visible and same-tenant** — count(loaded)==count(expected)
— and **fail the whole op** if any is missing. Otherwise RLS silently hides a foreign/spoofed lot,
and the fold would compute on 0 rows and mis-write. Also assert tenant-equality across all lines of
one operation (no op spans two tenants).
**Tests:** unit — access predicate denies cross-org vineyard/lot; ledger write sets tenant then
folds; audit row carries tenantId; a ledger op referencing a foreign/hidden lot **fails loudly**
(not silently on 0 rows); an op mixing two tenants' lots is rejected. **Depends on:** Unit 8.
**Verification:** a seeded action on Bhutan writes rows with the Bhutan tenantId and audits it.

### Unit 10: Scripts, seed, and `AppSettings` per-org
**Goal:** Make the non-HTTP paths tenant-aware and de-singleton the settings.
**Files:** `scripts/*.ts` (verify/seed/migrate — set tenant via `runAsTenant` or an explicit
tenant arg), `prisma/schema.prisma` (`AppSettings` → per-org: `organizationId` PK/FK instead of
`id="singleton"`), a small settings migration + `getAppSettings(tenantId)`.
**Approach:** Every script that drives cores supplies a tenant (default: Bhutan) via
`runAsTenant`. For **global maintenance** (backfills, cross-tenant reindex, ops tooling) add a
guarded **`runAsSystem`** utility backed by a **separate BYPASSRLS maintenance role** — used only
by audited scripts, never the web app. For **tenant-specific background work** (webhooks, async
recalcs) synthesize an ALS context (`runAsTenant(targetTenant, …)`) before invoking handlers, so
they don't fail closed. Note: **Better Auth's own tables (User/Session/member/…) are global (no
RLS)**, so its internal queries are unaffected by the fail-closed policy. Convert `AppSettings`
from a singleton row to one row per org (carry Phase 7 `sparklingEnabled` per winery); update
`getAppSettings()` to take/resolve the tenant.
**Tests:** a script run without a tenant context fails closed; `runAsSystem` reaches all tenants
(and is the only path that can); `getAppSettings` returns the calling org's row. **Depends on:** Units 8, 9.
**Verification:** `verify-*` scripts run under an explicit tenant; sparkling toggle is per-org.

### Unit 11: Cross-tenant isolation test suite (first-class)
**Goal:** Prove — and keep proving in CI — that nothing crosses tenants.
**Files:** `test/tenant-isolation.test.ts` (RLS layer, connects as `app_rls`), app-layer tests,
and `scripts/verify-tenant-isolation.ts`.
**Approach:** Seed two orgs (A=Bhutan, B=test). Connected as the **non-owner `app_rls`** role: as
tenant A, assert SELECT/UPDATE/DELETE of a tenant-B row return **0 rows** (RLS invisibility); an
INSERT/UPDATE writing a **foreign tenantId raises** (WITH CHECK); a query with **no** tenant
context returns 0 rows (fail-closed). App-layer: every data-access path carries the tenant (assert
via the extension). Include a ledger-write isolation case (a tenant-A ledger op can't touch a
tenant-B lot) and a P2034-retry case (tenant re-set on retry). **Add (council DQ9):** a
**concurrent-request ALS-bleed test** (fire parallel ops under different tenant contexts; assert
neither sees the other's rows — proves the ALS context doesn't bleed across async boundaries); an
explicit **`WITH CHECK` test** (INSERT/UPDATE writing a foreign `tenantId` while in tenant-A context
**raises**, not silently drops); a **cross-tenant FK test** (a composite FK rejects referencing
another tenant's row — K11); and a **stale-active-org test** (revoked membership denied next
request — K13). Run in CI on every change.
**Tests:** the suite *is* the test; also the `verify-tenant-isolation.ts` integration proof.
**Depends on:** Units 7-10. **Verification:** suite green; deliberately removing `FORCE` or the
`set_config` makes it fail (proving it has teeth).

### Unit 12: Regression sweep + docs
**Goal:** Nothing single-tenant broke; the boundary is documented.
**Files:** all existing `verify-*.ts` (ledger, blends, ferment, bottling, sparkling) run under a
tenant; `AGENTS.md` (the non-owner role, `runAsTenant`, migration role split); `docs/` note.
**Approach:** Re-run every existing verify script + vitest suite **as the `app_rls` role under
`runAsTenant(Bhutan)`** (eng-review: running them as the owner would bypass RLS and give a false
green); fix any query that assumed no tenant. Document how to add a new tenant table (checklist:
tenantId + index + backfill + per-tenant unique + composite `(tenantId,id)` unique if referenced +
RLS policy + FORCE + isolation test + extension not on the denylist) so future phases don't
regress the boundary.
**Tests:** full existing suite green under tenancy. **Depends on:** all prior.
**Verification:** all `verify-*` + vitest pass; a new-table checklist exists.

## Test Strategy

**Unit (vitest):** access predicates (org boundary + D9), tenant-context extension (set_config
emitted; create injects tenant; missing context denies), ledger tenant threading, settings-per-org.
**Isolation suite (Unit 11, CI-gating):** RLS-layer cross-tenant SELECT/UPDATE/DELETE = 0 rows,
foreign-tenant INSERT raises, fail-closed on missing context, ledger cross-tenant denial, retry
re-set — connected as the non-owner role. A "teeth check": removing FORCE/`set_config` must break it.
**Regression:** every existing `verify-*.ts` + vitest suite passes under a tenant context.
**Migration smoke:** on a clean DB, run all migrations in order + backfill + a two-org insert test.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| App connects as the Neon owner → RLS silently bypassed (whole boundary is a no-op) | MED | CRITICAL | K4: dedicated non-owner `NOBYPASSRLS` role + `FORCE RLS`; Unit 6 asserts role attributes; Unit 11 "teeth check" fails if bypass is possible. |
| Missing tenant context leaks or over-denies | MED | HIGH | Fail-closed policies (NULL setting → deny); the extension throws without context; `runLedgerWrite` sets + re-sets on retry (K5); isolation tests cover the no-context path. |
| `runLedgerWrite` interactive tx × batch extension conflict (Prisma #23583 blocking) | MED | HIGH | K5: ledger path sets tenant manually, does **not** route through the batch extension; eng-review this seam; retry re-set tested. |
| `CREATE INDEX CONCURRENTLY` wrapped in a txn by the migration runner → error | MED | MED | Each CIC in its **own** migration file / `db execute`; documented. |
| Backfill/NOT-NULL ordering wrong → migration fails on existing rows | MED | HIGH | Strict order: nullable → backfill → NOT NULL → uniques; batched idempotent backfill; migration smoke on a clone. |
| Per-tenant unique flip fails on pre-existing cross-row dupes | LOW | MED | Single tenant today (Bhutan), so `(tenantId, code)` can't collide; verify before `VALIDATE`. |
| PG major < 18 → NOT-NULL-as-NOT-VALID syntax error | MED | LOW | Version-aware pattern (CHECK workaround pre-18); confirm Neon PG major first. |
| Hundreds of query sites miss a tenant filter | MED | MED | RLS is the safety net (app filter optional); auto-inject on create; isolation suite covers every access pattern; new-table checklist (Unit 12). |
| ALS breaks on Edge runtime | LOW | MED | Pin server actions/routes to the Node runtime; documented. |
| Better Auth org plugin migration/rows differ from expectation | LOW | MED | Hand-author the plugin SQL from its schema; verify tables before wiring. |
| **FK checks bypass RLS** → cross-tenant lineage/ledger edge via a foreign opaque id (council CRITICAL #1) | MED | CRITICAL | K11: composite `(tenantId, id)` FKs on lineage/ledger relations + app-layer assert-referenced-rows-visible in `writeLotOperation`/blend; isolation test covers it. |
| **Next.js `cache()`/`unstable_cache` serves one tenant's rows to another** (council CRITICAL #2) | MED | CRITICAL | K12: `tenantId` an explicit arg to every memoized fn; never ALS inside a cache; lint gate + a concurrent-request bleed test. |
| **Stale active-org after membership revocation** (council CRITICAL #3) | MED | HIGH | K13: `getCurrentUser()` re-validates active org vs `member` table per request (short TTL). |
| Per-op transaction wrapping degrades pool concurrency at scale | MED | MED | Batch (not interactive) form; index every `tenantId`; monitor; Neon HTTP driver / route-level tx as a later option. |
| Scripts/webhooks/cron fail closed under NOBYPASSRLS | MED | MED | `runAsTenant`/`runAsSystem` utilities + a guarded BYPASSRLS maintenance role; Better Auth global tables have no RLS. |
| Constraint-swap / SET NOT NULL stalls behind long ledger txns (ACCESS EXCLUSIVE) | LOW | MED | `lock_timeout` + CHECK-NOT-VALID→VALIDATE→SET NOT NULL; do swaps in a low-traffic window (single-tenant Bhutan during the migration). |

## Success Criteria

- [ ] Better Auth org plugin live; Bhutan is tenant #1; every user is a member; the session
      carries an active organization.
- [ ] Every domain/registry table has a non-null `tenantId`; auth/org tables stay global.
- [ ] RLS is `ENABLE`+`FORCE` on every tenant table with `USING`+`WITH CHECK`, fail-closed; the
      app runs as a **non-owner `NOBYPASSRLS`** role; migrations run as owner.
- [ ] Tenant context is `set_config('app.tenant_id', id, true)` per transaction (never session
      `SET`); `runLedgerWrite` sets it first and re-sets on every P2034 retry.
- [ ] All global uniques are per-tenant composites; two orgs can share a `Lot.code`.
- [ ] `tenantId` is derived only from the verified session's active org; scripts set it explicitly.
- [ ] The cross-tenant isolation suite passes and has teeth (removing FORCE/`set_config` breaks it),
      running in CI.
- [ ] `AppSettings` (incl. Phase 7 `sparklingEnabled`) is per-org.
- [ ] All existing `verify-*` + vitest suites pass under a tenant context (no single-tenant
      regressions); a new-tenant-table checklist is documented.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (cross-LLM) | `/council` | Adversarial plan review (Gemini + Codex) | 1 | ✅ done | Gemini: 3 CRITICAL + 3 SHOULD-FIX + 3 DQ, all folded (rev 2). **Codex at capacity** (no response); its K5 question verified from primary sources instead. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR | K5 re-verified + placement fixed (wrapper before fn reads); new CRITICAL folded (extension model-denylist for auth/org so login isn't tenant-gated); migration reorder (composite FKs after NOT NULL — MATCH SIMPLE hole); RLS explicit on projections + legacy vessel_component; tests run as app_rls under runAsTenant (owner bypasses RLS = false green). 1 fork resolved (hybrid composite-FK scope). |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ✅ N/A (no UI scope) | UI-scope detection: this slice ships no new/changed screens or interactions (backend foundation). No design findings. Constraints for the deferred ops-layer slice captured below. |

**Council fold summary (rev 2):** K11 cross-tenant FK integrity (FK checks bypass RLS →
composite `(tenantId,id)` FKs on lineage/ledger + app-layer assert-visible in `writeLotOperation`);
K12 cache/ALS discipline (explicit `tenantId` arg to memoized fns); K13 active-org revalidation
(re-check `member` per request); + strip client `tenantId`, ledger assert-visible-or-fail,
`runAsSystem`/maintenance role, `lock_timeout` on swaps, and an expanded isolation test matrix
(concurrent ALS-bleed, WITH CHECK insert, cross-tenant FK, stale-org). K5 verified sound from
postgresql.org/pgbouncer.org (set_config is-local persists across the interactive tx; re-set on
retry required).

**Eng-review fold summary (rev 3):** K5 placement precision (set_config in the `runLedgerWrite`
wrapper before `fn` reads → auto re-applied on retry); **extension model-denylist** so Better
Auth's pre-tenant login queries aren't tenant-gated (new CRITICAL); **migration resequence** —
composite FKs move to Unit 5b *after* NOT NULL (MATCH SIMPLE skips null-tenant rows); RLS explicit
on `vessel_lot`/`bottled_lot_state`/`vessel_component`; existing `verify-*` + isolation tests run
**as `app_rls` under `runAsTenant`** (owner bypasses RLS). Fork resolved: **hybrid** composite-FK
scope (lineage/ledger relations + app assertion elsewhere).

**Eng-review required outputs:**
- *What already exists (reused, not rebuilt):* Better Auth + its prismaAdapter (org plugin extends
  it); `getCurrentUser()`/`dal.ts` (extended with active-org + revalidation); `action()`/
  `adminAction()` wrappers (inject tenant); `runLedgerWrite`/`writeLotOperation` (add tenantId +
  set_config); `access.ts` predicates (org boundary above D9); the documented Neon/Windows
  migration flow; the existing `verify-*.ts` harness (re-run under tenant).
- *NOT in scope:* the SaaS ops layer (signup/provisioning/billing/branding/org-switcher UI),
  multi-org switching UX, schema-/DB-per-tenant graduation — all deferred (Phase 12 second slice).
- *Parallelization:* mostly **sequential** (migrations are a strict chain: U1→U2→U3→U4→U5→U5b→U6→U7).
  After the DB boundary is in (U7), two lanes: **Lane A** app plumbing (U8→U9, `src/lib/tenant`,
  `prisma.ts`, `actions.ts`, `dal.ts`, `ledger/write.ts`) and **Lane B** scripts/settings (U10).
  U11 (isolation tests) + U12 (regression) after both. Conflict flag: U8 and U9 both touch
  `prisma.ts`/`actions.ts` — keep them one lane.

**Design-review outcome (rev 4):** UI-scope detection = **no UI scope** (backend foundation; no
new/changed screens or interactions), so a design review isn't applicable to this slice per the
skill's own criteria. Only user-visible effect is intentionally invisible: a single-org user sees
no change; the app stays single-brand "Bhutan Wine Company" until the deferred branding work.

**Deferred design constraints (for the Phase 12 ops-layer slice, which gets the real design
review):** per-tenant **branding/theming builds on the existing DESIGN.md token system** — the
tokens stay, their *values* become tenant-configurable (no hardcoded colors/fonts); an **org
switcher** (only if a user belongs to >1 winery; Better Auth `OrganizationSwitcher`); **tenant
admin** (members, invitations, roles); **org signup/provisioning**; and empty/loading/error states
for all of the above. Honor D12 (vessel-first capture) + the warm-editorial aesthetic; no new
component vocabulary without a design pass.

**VERDICT:** **All three reviews complete — Council + Eng Review CLEARED; Design Review N/A (no UI
scope).** The plan is fully reviewed and ready. Build the isolation-boundary slice on `main`
**before onboarding design-partner winery #2**; the deferred ops-layer slice gets its own
`/plan` + full review (incl. a real design review) when it's built.
