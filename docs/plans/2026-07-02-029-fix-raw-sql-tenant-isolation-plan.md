---
title: Fix raw-SQL reads that bypass tenant isolation (silent-empty in prod + latent cross-tenant leak)
type: fix
status: completed
date: 2026-07-02
branch: fix/raw-sql-tenant-isolation
depth: standard
units: 4
---

## Overview

Two `$queryRaw` reads run outside the tenant-scoping Prisma extension, so they execute with no `app.tenant_id` GUC set. Under the currently-activated Postgres RLS (the app connects as the `NOBYPASSRLS` `app_rls` role), the `tenant_isolation` policy matches zero rows — so **assistant conversation search and the vineyard "latest Brix per block" map silently return empty in production right now**. This fixes both sites by running them through `runInTenantTx` (which sets the GUC as its first statement, exactly as every model read is scoped) plus an explicit `tenantId` predicate for defense-in-depth, then adds regression coverage and a guard so a raw query can never silently re-open this hole.

## Problem Frame

- **Who has this problem:** every tenant. Any user of the assistant whose conversation history won't load; any grower opening the vineyard map and seeing no Brix readings. It presents as "the feature is broken / empty," not as an error, so it's the worst kind of silent.
- **Root cause (confirmed):** the tenant invariant is a Prisma client extension hooked on `query.$allModels.$allOperations` (`src/lib/prisma.ts:65-66`). It batches `SELECT set_config('app.tenant_id', …)` + the query into one transaction (`prisma.ts:85-89`). Raw client methods (`$queryRaw`/`$executeRaw`) are **not** model operations, so they never enter that interceptor and run on a connection with no GUC. Under RLS, `current_setting('app.tenant_id', true)` is `NULL` → `"tenantId" = NULL` is never true → zero rows (fail-closed). If RLS were ever relaxed, the same code leaks cross-tenant because neither query carries a `tenantId` predicate.
- **What happens if we do nothing:** the two features stay broken under activated RLS, and the pattern is a booby-trap — the next raw query someone writes against a tenant table inherits the same silent-empty/leak behavior with no test to catch it.
- **Scope reality:** an exhaustive sweep of `src/` for `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe`/`Prisma.sql`/`Prisma.raw` found **exactly 2 affected data queries** — no undiscovered third. The other three raw calls are the `set_config` GUC-setters themselves and are correct by construction.

## Requirements

- MUST: `getLatestBrixByBlock` (`src/lib/harvest/actions.ts:295`) returns the correct tenant's `brix_log` rows under activated RLS.
- MUST: `searchConversations` (`src/lib/assistant/conversations.ts:171`) returns the correct owner's conversations under activated RLS.
- MUST: both queries run with `app.tenant_id` set (via `runInTenantTx`), matching how every model read in the app is tenant-scoped.
- MUST: neither query can return another tenant's rows even if RLS is disabled (explicit `tenantId` predicate — defense-in-depth).
- MUST: regression coverage in both isolation harnesses (`test/tenant-isolation.test.ts`, `scripts/verify-tenant-isolation.ts`) that fails if a raw read leaks / silent-empties.
- SHOULD: a cheap guard that fails CI/verify if a new raw query on a tenant table is introduced outside a GUC-set transaction (boil-the-lake — stop the class of bug, not just the two instances).
- NICE: a one-line note in `AGENTS.md` under the multi-tenancy checklist that raw SQL must be wrapped in `runInTenantTx`.

## Scope Boundaries

**In scope:**
- The two affected raw reads and their regression tests + guard.

**Out of scope:**
- The 3 `set_config` raw calls (`prisma.ts:86`, `ledger/write.ts:65`, `tenant/tx.ts:23`) — correct as-is.
- `runAsSystem`'s plain client — deliberately BYPASSRLS, scripts-only (a separate ledger finding covers its cron HTTP path; not this plan).
- The broader "only 3 of 59 tenant tables have isolation assertions" test-coverage finding — related but its own unit of work.
- Any conversion of these raw queries to Prisma model queries (the raw shape — a JOIN with `ownerUserId`, a `DISTINCT ON` for latest-per-vineyard — is intentional; we scope it, not rewrite it).

## Research Summary

### Codebase Patterns
- **The bug mechanism:** `src/lib/prisma.ts:62-93` — extension scope is model-only; raw bypasses it.
- **Canonical safe wrapper:** `runInTenantTx<T>(fn: (tx) => Promise<T>)` at `src/lib/tenant/tx.ts:16-27` — calls `requireTenantId()`, opens `$transaction`, and **sets the GUC as the first statement** (`tx.$executeRaw\`SELECT set_config('app.tenant_id', ${tenantId}, true)\`` at `tx.ts:23`), then runs `fn(tx)`. A raw `$queryRaw` executed on that `tx` is RLS-scoped. This is the exact shape to copy.
- **Same shape proven elsewhere:** `runLedgerWrite` (`ledger/write.ts:59-66`), and the extension's own batch (`prisma.ts:85-88`).
- **Tenant id accessor:** `requireTenantId(): string` (`src/lib/tenant/context.ts:50-54`) — fail-closed, throws if no context.
- **No existing correctly-scoped raw *data* query exists** — the two buggy ones are the only raw data reads, so there's no in-app precedent to copy beyond the wrappers above (the test harnesses' `asTenant` helper is the closest raw-query example).
- **RLS policy:** `prisma/migrations/20260701001000_rls_policies/migration.sql` — identical fail-closed `tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.tenant_id', true)`) on all three affected tables: `brix_log` (42-44), `assistant_conversation` (110-112), `assistant_message` (114-116). None are in `GLOBAL_MODELS` (`src/lib/tenant/models.ts:12-20`).
- **Test harnesses:** `test/tenant-isolation.test.ts` (vitest, `describe.skipIf(!ENABLED)`, enabled by `TENANT_ISOLATION_DB=1` + `DATABASE_URL_APP` + `DATABASE_URL_UNPOOLED`) and `scripts/verify-tenant-isolation.ts` (exit-code proof). Both use an `asTenant(t, fn)` helper (test lines 21-25; script 41-49) that opens a tx, sets the GUC, and runs the callback on `tx`. Fixtures use tenants A/B (`isov_a`/`isov_b`). Assertion pattern: no-context → count 0; A sees A's row, null for B's; cross-tenant write affects 0 rows.

### Prior Learnings
- Context-ledger query for raw-SQL/RLS returned **no prior precedent** — no constraints or superseded approaches. (Auto-memory `phase12-multitenancy-progress` records that RLS is activated in prod as `app_rls`, which is exactly what makes this a live bug rather than latent.)

### External Research
- None needed — the fix uses only in-repo primitives and Prisma tagged-template raw SQL already in use.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| How to set the GUC for raw reads | Wrap each query in `runInTenantTx` | Manually inline `set_config` per site; convert to model queries | `runInTenantTx` is the proven, single canonical primitive; inlining duplicates the GUC logic; converting loses the intentional raw JOIN/DISTINCT-ON shape. |
| Rely on RLS alone, or also add a `tenantId` predicate | **Both** — GUC (fixes live bug, matches app model) **and** explicit `"tenantId" = ${requireTenantId()}` predicate (closes the leak independent of RLS) | GUC-only (consistent with model reads, but leaks if RLS ever disabled); predicate-only (doesn't fix the silent-empty — RLS still returns 0 without the GUC) | Near-free defense-in-depth; the finding's dual risk (silent-empty **and** latent leak) is only fully closed by doing both. Caveat noted below. |
| Prevent recurrence | Add a guard (unit 4) that greps for raw calls on tenant tables outside the GUC-set infra files and fails verify | Rely on code review; do nothing | Boil the lake: kill the class of bug. The guard is ~30 lines and runs in the existing verify path. |

**Consistency caveat on the predicate:** the extended client scopes model *reads* via RLS/GUC only (it injects `tenantId` on writes, not reads). Adding an explicit read predicate here is slightly more defensive than the rest of the app. That's intentional for raw SQL (which has no extension backstop at all), but note it so a reviewer doesn't read it as inconsistency.

## Implementation Units

### Unit 1: Scope `getLatestBrixByBlock` raw read

**Goal:** The vineyard latest-Brix-per-block map returns the active tenant's rows under RLS.
**Files:** `src/lib/harvest/actions.ts` (~line 295)
**Approach:** Wrap the existing `prisma.$queryRaw\`… FROM "brix_log" WHERE "vineyardId" = ${vineyardId}\`` in `runInTenantTx(async (tx) => tx.$queryRaw\`…\`)` so the GUC is set first, and change the call from `prisma` to the `tx` client. Add `AND "tenantId" = ${requireTenantId()}` to the WHERE (bound param, alongside the existing `vineyardId` filter). Keep the `DISTINCT ON`/ordering exactly as-is. Import `runInTenantTx` from `@/lib/tenant/tx` and `requireTenantId` from `@/lib/tenant/context`.
**Tests:** Covered in Unit 3 (needs the DB harness).
**Depends on:** none
**Execution note:** Verify the caller already runs inside tenant context (the harvest/vineyard server actions resolve tenant from the session, same as their model queries in the same module) so `requireTenantId()` won't throw. If any caller is outside context, that's a caller bug to surface, not to paper over.
**Patterns to follow:** `src/lib/tenant/tx.ts:16-27` (wrapper), `scripts/verify-tenant-isolation.ts:41-49` (raw-on-tx shape).
**Verification:** `npx tsc --noEmit` green; manual/DB check via Unit 3's script.

### Unit 2: Scope `searchConversations` raw read

**Goal:** Assistant conversation search returns the active tenant's conversations under RLS.
**Files:** `src/lib/assistant/conversations.ts` (~line 171)
**Approach:** Same pattern as Unit 1 — wrap the `$queryRaw` (the `assistant_conversation c` JOIN `assistant_message m` on `ownerUserId`) in `runInTenantTx(async (tx) => tx.$queryRaw\`…\`)`, running on `tx`. Add `AND c."tenantId" = ${requireTenantId()}` to the WHERE (the conversation table carries `tenantId`; the join to `assistant_message` is already keyed by conversation, and `assistant_message` is independently RLS-scoped by the GUC). Preserve the `ownerUserId` filter, join, ordering, and any `LIMIT`.
**Tests:** Covered in Unit 3.
**Depends on:** none (independent file; can run parallel to Unit 1)
**Patterns to follow:** Unit 1; `src/lib/tenant/tx.ts:16-27`.
**Verification:** `npx tsc --noEmit` green; DB check via Unit 3.

### Unit 3: Regression coverage in both isolation harnesses

**Goal:** A test that would have caught this bug and fails if either raw read leaks or silent-empties.
**Files:** `test/tenant-isolation.test.ts`, `scripts/verify-tenant-isolation.ts`
**Approach:** Extend the existing A/B fixtures. Seed (via the `owner`/BYPASSRLS client) a `brix_log` row for a vineyard owned by tenant B, and an `assistant_conversation` (+ `assistant_message`) owned by a user in tenant B. Then, using the fixed functions' code path under tenant A's context, assert:
  1. **Isolation:** querying as tenant A returns **0** of tenant B's rows (both sites).
  2. **Positive:** querying as the owning tenant returns its own row (proves the fix didn't over-scope to empty — the very symptom we're fixing).
  3. **No-context fail-closed:** calling with no tenant context throws (from `requireTenantId()`) rather than silently returning rows.
Mirror the assertion style at `test/tenant-isolation.test.ts:53-88`. Add the same two cases to the script harness (`asTenant` at `verify-tenant-isolation.ts:41-49`) so `npm run` proof exists.
**Tests:** This unit *is* the tests.
**Depends on:** Units 1, 2 (asserts their behavior).
**Verification:** `TENANT_ISOLATION_DB=1 DATABASE_URL_APP=… DATABASE_URL_UNPOOLED=… npx vitest run test/tenant-isolation.test.ts` passes with the new cases; `npx tsx --env-file=.env scripts/verify-tenant-isolation.ts` exits 0. Sanity: temporarily revert Unit 1/2 and confirm the new cases go red (teeth check).

### Unit 4: Guard against future unscoped raw queries

**Goal:** The class of bug can't silently return — a new raw query on a tenant table outside a GUC-set tx fails the check.
**Files:** `scripts/verify-tenant-isolation.ts` (add a static pre-check) or a small dedicated `scripts/check-raw-sql-tenant-safety.ts`; optional one-line note in `AGENTS.md`.
**Approach:** A static scan of `src/` for `$queryRaw`/`$queryRawUnsafe`/`$executeRaw`/`$executeRawUnsafe`. Allowlist the 3 known `set_config` GUC-setters (`prisma.ts`, `ledger/write.ts`, `tenant/tx.ts`) by file. Any other hit must occur inside a `runInTenantTx`/`runLedgerWrite` closure (heuristic: the enclosing function references one of those, or the raw call is on a `tx` parameter, not the top-level `prisma`). Fail with the offending file:line and a pointer to this plan. Keep it a heuristic guard, not a full AST parse — cheap, and false-positives are a deliberate "prove it's scoped" prompt.
**Tests:** The guard runs clean after Units 1-2; add a fixture-free self-test if trivial.
**Depends on:** Units 1, 2 (so the guard starts green).
**Verification:** guard exits 0 on the fixed tree; manually add a throwaway unscoped `prisma.$queryRaw` on a tenant table and confirm it fails, then remove it.

## Test Strategy

**Unit tests:** none pure — this is DB-behavior; the DB-gated `test/tenant-isolation.test.ts` is the home.
**Integration tests:** the two new isolation cases (Unit 3) in both harnesses; `describe.skipIf` keeps DB-free `vitest run` green.
**Static guard:** Unit 4 scan in the verify path.
**Manual verification:** with RLS-activated env (`DATABASE_URL` = `app_rls`), log in as a Demo Winery user, open the vineyard map (expect Brix per block to render) and the assistant conversation search (expect prior conversations to list). Before the fix these are empty; after, populated. Confirm a second tenant sees only its own.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A caller invokes these outside tenant context → `requireTenantId()` throws where it used to silently return `[]` | LOW | MED | Unit 1 execution note: confirm callers run in session/`runAsTenant` context (their sibling model queries already require it). A throw is the correct fail-closed behavior and surfaces a real caller bug. |
| Wrapping a read in a transaction adds latency | LOW | LOW | It's the same `$transaction`+`set_config` shape the extension already does for every model read — no new pattern, negligible overhead. |
| Guard (Unit 4) false-positives on a legitimately-scoped raw call | MED | LOW | Heuristic + allowlist; a false positive is a cheap "wrap this or annotate it" prompt, not a broken build. |
| Predicate/JOIN edit changes result shape | LOW | MED | Unit 3 positive-case assertion proves the owning tenant still gets its rows; preserve ORDER BY/DISTINCT ON/LIMIT verbatim. |

## Success Criteria

- [x] `getLatestBrixByBlock` and `searchConversations` run through a GUC-setting tx (new `runInTenantRawTx`) + an explicit `tenantId` predicate. (Implementation deviation: `runInTenantTx` is ALS-only and would throw in the RSC/route callers; `runInTenantRawTx` resolves tenant like the extension — ALS **or** session — and the session-resolver was extracted to `src/lib/tenant/resolve.ts` so the extension and wrapper share one resolver.)
- [~] Under activated RLS, both return the active tenant's rows and never another tenant's. **Blocked on live DB** (Neon unreachable at run time); DB-gated cases written, not yet executed.
- [x] New isolation cases exist in `test/tenant-isolation.test.ts` **and** `scripts/verify-tenant-isolation.ts` (raw-`$queryRaw` on `lot` + real `brix_log` DISTINCT-ON). Not teeth-checked live (DB down).
- [x] Unit 4 guard (`scripts/check-raw-sql-tenant-safety.ts`, `npm run verify:raw-sql`) passes clean; flags unscoped raw on a top-level client.
- [x] `npx tsc --noEmit`, `npm run lint` (changed files), `npm test` (770 pass / 9 skipped) all green.
- [x] No regressions in existing tests.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Mechanism confirmed at exact lines; RLS is activated in prod (memory + migration). |
| Scope Boundaries | HIGH | Exhaustive raw-SQL sweep found exactly 2 sites; no hidden third. |
| Implementation Units | HIGH | Canonical `runInTenantTx` pattern proven 3× in-repo; edits are localized. |
| Test Strategy | HIGH | Both harnesses already issue raw SQL via `asTenant`; new cases slot in. |
| Risk Assessment | MEDIUM | Main unknown is whether every caller is already in tenant context (Unit 1 note verifies it during /work). |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET -- run `/autoplan` for full review pipeline, or individual reviews above.
