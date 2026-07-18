---
title: QBO → Cellarhand vendor pull + Cellarhand-side classification queue (QBO vendor sync, Slice 1)
type: feat
status: approved
date: 2026-07-18
branch: claude/qbo-vendor-pull
depth: deep
units: 8
---

## Overview

Bring the bookkeeper's QuickBooks vendors into Cellarhand without re-typing them. Slice 0 (Plan 074, merged
#229) stops near-duplicate vendors from being *created*; this pulls QBO vendors *in*. Because a winery's QBO is
full of vendors the cellar/vineyard never needs (payroll, insurance, the accountant, law firms), the pull does
NOT auto-insert. Every pulled QBO vendor is matched to an existing local `Vendor` (by `externalVendorId`, else
the hardened Plan 074 fuzzy matcher); unmatched ones land in a **Cellarhand-side review queue**
(`VendorImportCandidate`) where a human accepts / rejects / merges-into-existing them. Classification lives in
Cellarhand because QBO v3 `Vendor` has no native type field (Open Q1, resolved). This is Slice 1 of the
QBO↔Cellarhand vendor-sync design doc.

## Problem Frame

Onboarding a winery today means re-entering every supply vendor by hand even though they already exist in QBO,
and when the bookkeeper adds a new supplier in QBO it never shows up in Cellarhand. QBO won't help dedupe (exact
`DisplayName` only). If we do nothing: double data-entry at onboarding, and the two systems drift.

**Product pressure-test finding:** the design doc lists "poll cron + manual button." But a QBO vendor list
changes rarely (a new supplier now and then), and a daily cron that re-pulls the entire vendor list into a
review queue is mostly noise. The **manual "Pull vendors from QBO" button is the 80/20** — you pull on demand
at onboarding and occasionally after. So this plan makes the **manual pull the spine** and the **poll cron an
optional, deferrable last unit** (Unit 7). The queue + matching engine is identical either way; only the trigger
differs.

**The one correctness trap (research-confirmed):** under multi-currency (Plan 073), Cellarhand creates
currency-scoped QBO vendors with **suffixed DisplayNames** — `Acme`, `Acme (EUR)`, `Acme (NZD)` are ONE real
supplier as three QBO records. The pull MUST strip the ` (CUR)` suffix (reuse `stripVendorCurrencySuffix` from
Plan 074, already merged) and **collapse currency variants to a single candidate**, or it floods the queue with
phantom duplicates for one supplier.

## Requirements

- **MUST:** A paginated pull of QBO vendors — `SELECT * FROM Vendor` with `STARTPOSITION`/`MAXRESULTS 1000`
  looped until exhausted (the client caps at 1000 today with no STARTPOSITION, `qbo/client.ts:170`). Reads
  `Id`, `DisplayName`, `Active` (map → `externalVendorId`, `name`, `isActive`).
- **MUST:** Per-pulled-vendor match order: (1) exact `externalVendorId` on an existing local `Vendor` → already
  synced, skip; (2) strip ` (CUR)` suffix + match by the hardened Plan 074 matcher (`getVendorNearMatchesCore` /
  `nearDuplicateLevel` HIGH band) → surface as a suggested link; (3) no match → new `VendorImportCandidate`.
- **MUST:** Collapse QBO currency-variant records (`Acme` / `Acme (EUR)`) to ONE candidate keyed on the
  currency-stripped name; keep all their QBO ids so accept can link the base one.
- **MUST:** New tenant-scoped `VendorImportCandidate` table built to the full Phase-12 checklist (tenantId +
  `@@index` + `@@unique([tenantId, id])` + FK→`organization(id)` + composite FK `(tenantId, vendorId)` →
  `vendor(tenantId, id)` for a resolved link + RLS ENABLE/FORCE + `tenant_isolation` policy + `GRANT … app_rls`
  + the `DO $$ … RAISE EXCEPTION` guard), split `_schema` + `_rls` migrations.
- **MUST:** Queue actions, each audited: **accept** (create a local `Vendor`, store `externalVendorId`),
  **reject** (mark not-cellar-relevant; suppress on future pulls so it never re-surfaces),
  **merge-into-existing** (map the QBO id onto a chosen existing local `Vendor`). **Conflict guard:** if the
  chosen local vendor already has a *different* `externalVendorId`, do NOT auto-map — surface a conflict for
  human resolution (same posture as Plan 072's QBO-mapping conflict).
- **MUST:** `externalVendorId` is the single source of truth for "already synced." The lazy, un-audited
  post-sweep cache-write (`post-sweep.ts:177`) must not race a manual link — the accept/merge path writes it
  through an audited core.
- **MUST:** Idempotent — re-pulling updates existing candidates (never duplicates them), respects `rejected`
  suppression, and never touches already-linked vendors.
- **MUST:** Admin/developer-gated (same gate as merge/remove); tenant-scoped + RLS-safe; cron/background reads
  use `runAsTenant` per tenant (never a bare `prismaBase` read — RLS returns 0 rows without the GUC).
- **SHOULD:** A manual "Pull vendors from QBO" button under `/setup/vendors` + a review-queue surface (mirror
  the invoice-ingestion review UI).
- **SHOULD:** A `verify:vendor-import` exit proof on Demo (real DB) + the explicit isolation block.
- **NICE (deferrable):** the poll cron (Unit 7) and the QBO-Advanced custom-"List"-field accelerator (out of
  scope for v1 — noted under Follow-on).

## Scope Boundaries

**In scope:** paginated QBO vendor pull, currency-variant collapse, the `VendorImportCandidate` table + RLS, the
matching + queue cores, the accept/reject/merge actions, the manual pull button + review UI, the verify proof,
and (optional) the poll cron.

**Out of scope (and why):**
- **The QBO-Advanced custom-field accelerator** (auto-classify by a QBO "Cellar Relevant" List field). Open Q1
  confirmed it's Advanced-tier-only; the Cellarhand-side queue is the universal floor. The spike (Unit 1) just
  confirms the tenant's tier; wiring the accelerator is a follow-on.
- **Slice 2 (eager create-into-QBO from Cellarhand)** — its own plan.
- **Writing anything back to QBO.** This slice is read-only against QBO; the only writes are local (`Vendor` +
  `VendorImportCandidate`). No `DocNumber`/Bill/idempotency concerns.
- **Auto-accepting matches.** Even a HIGH `externalVendorId`-less match is a *suggestion* in the queue, never an
  auto-insert (advisory, human-confirmed — same posture as Slice 0).

## Research Summary

### Codebase Patterns
- **Poll cron template:** `src/lib/commerce/poll.ts` (`runCommerce7PollSweep` — `listAllOrgIds()` →
  per-tenant `runAsTenant` → connection read → cursor sweep) + entry `src/app/api/cron/commerce7-poll/route.ts`
  (`CRON_SECRET` Bearer `timingSafeEqual`, `runtime="nodejs"`, `maxDuration=300`) + `vercel.json` `crons[]`.
  Also `accounting-post`/`-reconcile`/`-token-refresh` crons follow the same shape.
- **QBO client:** `src/lib/accounting/qbo/client.ts` — `query<T>(ctx, sql)` (:140), `findOrCreateVendor` (:229),
  `listAccounts` (:169) is the MAXRESULTS-1000 template with the explicit ">1000 deferred" note (:170) — **no
  STARTPOSITION anywhere yet**, this plan adds it. ProviderCallContext built in `post-sweep.ts:302-331`
  (`accountingConnection.findFirst({status:"CONNECTED"})` inside `runAsTenant` → `getValidAccessToken(conn.id)`
  from `token.ts` → `{ accessToken, realmId, environment }` → `new QboAdapter()`).
- **Phase-12 table pair:** mirror `prisma/migrations/…_vendor_contact_schema` + `…_vendor_contact_rls`
  (tenantId + `@@unique([tenantId,id])` promoted to constraint, FK→organization, composite FK to parent, RLS
  ENABLE/FORCE + `tenant_isolation` USING+WITH CHECK + `GRANT … app_rls` + `DO $$ RAISE EXCEPTION` guard).
  `scripts/verify-tenant-isolation.ts` auto-covers new models (DMMF, :66-81); add an explicit block like the
  Plan 069 vendor one (:560-586).
- **Review-queue UI precedent:** the invoice-ingestion review — `src/app/(app)/setup/expendables/ingest/`
  (`page.tsx` server → pure DTO → `IngestReviewClient.tsx` → `ingest-review-model.ts`) with server actions in
  `src/lib/ingest/actions.ts` over cores. Mirror for the candidate queue. Merge action can reuse
  `src/components/vendors/MergeVendorModal.tsx` (already wired in `VendorsClient.tsx`).
- **Vendor cores (merged #229):** `findOrCreateVendorCore`, `createVendorCore`, `mergeVendorsCore`,
  `getVendorNearMatchesCore`, and the pure `nearDuplicateLevel`/`findVendorNearMatches`/`stripVendorCurrencySuffix`
  in `vendors-shared.ts`. `Vendor.externalVendorId` (schema.prisma:3021) is the QBO id cache, written lazily in
  `post-sweep.ts:177` and reconciled in `mergeVendorsCore`.

### Prior Learnings
- `plan073-multi-currency-fx-ingestion` — the ` (CUR)` DisplayName suffix; one supplier = N QBO records; strip
  before matching, collapse variants. `AccountingConnection.multiCurrencyEnabled` gates the suffix path.
- `prismabase-rls-zero-rows-gotcha` — a bare `prismaBase` read on an RLS table returns 0 rows without the tenant
  GUC. Cron reads go through `runAsTenant`; cross-tenant maintenance through `runAsSystem`.
- `raw-sql-tenant-scoping` — if the pull uses `$queryRaw`, wrap in `runInTenantRawTx` with an explicit
  `"tenantId" = ${tenantId}` predicate (gated by `verify:raw-sql`). Prefer model ops.
- `phase15-qbo-plan-review-complete` / `phase16-commerce7-built-sandbox-pending` — the exactly-once poll +
  withhold-and-resweep pattern; the enumerator least-privilege role for `listAllOrgIds()` (SEC-C3: it CANNOT read
  `accounting_connection`, so the per-tenant `runAsTenant` block reads the connection, not the enumerator).
- `build-in-main-checkout-not-worktrees` — build in the MAIN checkout on a fresh branch; PR → CI → squash.
- `server-action-actionerror-redacted-in-prod` — user-facing messages: `safeAdminAction` returns `{ok,error}`.
- `verify:ai-native` gate — a new `*-core.ts` may need an assistant tool or an exemption (Open Question 3).

### External Research
QBO Vendor query pagination (`STARTPOSITION n MAXRESULTS m`, 1000 cap) is standard QBO API v3; confirm the exact
loop against the Demo sandbox in Unit 1 (no prior in-repo learning — treat as unproven until the spike).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Trigger | Manual "Pull" button primary; poll cron optional (Unit 7) | Cron-first | QBO vendor lists change rarely; a daily re-pull is noise; onboarding is on-demand |
| Classification home | Cellarhand-side review queue | QBO custom field | QBO v3 Vendor has no native type; custom fields Advanced-only (Open Q1) |
| Currency variants | Collapse by `stripVendorCurrencySuffix` to ONE candidate | One candidate per QBO record | Plan 073: one supplier = N QBO records; else queue floods |
| Match key | `externalVendorId` first, then Plan 074 HIGH matcher | Name-only | externalVendorId is the authoritative synced-marker |
| Auto-insert | Never — suggestions only, human-confirmed | Auto-accept high matches | Advisory posture; vendors feed A/P (money) |
| New table | `VendorImportCandidate` (Phase-12) | Reuse an existing table | Distinct lifecycle (pending/rejected/linked); needs suppression state |
| Merge conflict | Block + surface when target already maps to a different QBO id | Overwrite | Mirrors Plan 072 QBO-conflict; never silently remap a posted-bill vendor |

## Implementation Units

### Unit 1: QBO vendor pagination + a read-only pull spike

**Goal:** Add `STARTPOSITION`/`MAXRESULTS` paging to the QBO client and prove a full paginated vendor pull works
against the Demo QBO sandbox, sizing the real vendor count + confirming the tenant's QBO tier.
**Files:** `src/lib/accounting/qbo/client.ts` (+ the adapter interface in the same file / `adapter.ts`),
`scripts/verify-qbo-vendor-pull-spike.ts` (throwaway-style read-only proof)
**Approach:** Add `listVendors(ctx): Promise<QboVendor[]>` mirroring `listAccounts` (:169) but looping
`SELECT * FROM Vendor STARTPOSITION n MAXRESULTS 1000` until a short page (fixes the deferred cap). Normalize
`{ id: String(v.Id), name: v.DisplayName, active: v.Active !== false }`. The spike script runs under
`runAsTenant("org_demo_winery")`, builds the ctx like `post-sweep.ts:302-331`, calls `listVendors`, prints the
count + a sample + how many carry a ` (CUR)` suffix, and reports `getCompanyInfo` currency/edition if reachable
(tier hint). Read-only, no writes.
**Tests:** covered by the spike run + a pure unit test for the pagination loop's page-assembly if extracted;
QBO calls aren't unit-tested (network) — the spike is the proof.
**Depends on:** none
**Patterns to follow:** `qbo/client.ts:169` (listAccounts), `post-sweep.ts:302-331` (ctx build), `token.ts:49`.
**Verification:** `npx tsx --conditions=react-server --env-file=.env scripts/verify-qbo-vendor-pull-spike.ts`
prints a real vendor count from Demo with no error.

### Unit 2: `VendorImportCandidate` table + RLS (Phase-12 checklist)

**Goal:** A tenant-scoped review-queue table for pulled-but-unresolved QBO vendors.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_vendor_import_candidate_schema/migration.sql`,
`prisma/migrations/<ts>_vendor_import_candidate_rls/migration.sql`, `scripts/verify-tenant-isolation.ts`
**Approach:** Model `VendorImportCandidate { tenantId; id; externalVendorId (QBO id); name; suggestedVendorId?
(the HIGH-match local vendor, nullable); status (PENDING|REJECTED — linked rows are deleted, not kept);
currencyVariantIds String[] (the collapsed QBO ids); firstSeenAt; updatedAt; @@unique([tenantId, id]);
@@unique([tenantId, externalVendorId]) (idempotent upsert key); @@index([tenantId]); @@map("vendor_import_candidate") }`.
Migrations mirror the `vendor_contact` `_schema`/`_rls` pair: tenantId + indexes, promote `(tenantId,id)` unique
to constraint, FK→organization ON DELETE RESTRICT, composite FK `(tenantId, suggestedVendorId)` →
`vendor(tenantId, id)` ON DELETE SET NULL (column-list form so only the ref nulls), RLS ENABLE/FORCE +
`tenant_isolation` USING+WITH CHECK + `GRANT SELECT,INSERT,UPDATE,DELETE … app_rls` + the `DO $$ RAISE EXCEPTION`
guard. Add the explicit isolation block to `verify-tenant-isolation.ts` (mirror the Plan 069 vendor block).
**Tests:** the isolation block (foreign-tenant SELECT excluded, WITH CHECK rejects foreign INSERT, composite-FK
cross-tenant ref rejected, cross-tenant UPDATE/DELETE affect 0 rows).
**Depends on:** none
**Execution note:** the Windows migration rule — `ALTER TYPE`/enum changes in isolated migrations; here status
can be a plain `String` (no enum) to sidestep that.
**Patterns to follow:** `…_vendor_contact_schema/_rls` migrations; `verify-tenant-isolation.ts:560-586`;
`CLAUDE.md` Phase-12 checklist.
**Verification:** `npm run db:migrate` applies clean; `npm run verify:tenant-isolation` green incl. the new block.

### Unit 3: The pull core (match, collapse, upsert into the queue)

**Goal:** Given a tenant, pull QBO vendors, collapse currency variants, match against local vendors, and
reconcile the `VendorImportCandidate` queue idempotently.
**Files:** `src/lib/vendors/qbo-vendor-pull.ts` (new), `test/qbo-vendor-pull.test.ts`
**Approach:** `pullQboVendorsForTenant(tenantId)`: read the CONNECTED QBO connection + token (like
`post-sweep.ts`), `listVendors(ctx)`, then a PURE reconcile step (unit-tested): group QBO records by
`stripVendorCurrencySuffix(name).base.toLowerCase()` (collapse variants → keep all ids in `currencyVariantIds`,
pick a canonical base name); for each group, (a) if any variant id is already an `externalVendorId` on a local
`Vendor` → skip (synced); (b) else run `getVendorNearMatchesCore(baseName)` → set `suggestedVendorId` to the top
HIGH match if any; (c) upsert a `VendorImportCandidate` on `(tenantId, externalVendorId)` UNLESS a `REJECTED`
row exists for it (suppression). Wrap writes in `runInTenantTx`. Split the pure grouping/matching decision into a
tested function; keep I/O thin.
**Tests:** pure reconcile tests — currency variants collapse to one candidate; an already-`externalVendorId`-mapped
vendor is skipped; a rejected candidate is not re-created; a HIGH name match sets `suggestedVendorId`; a
brand-new vendor becomes a PENDING candidate; re-running is idempotent (no dupes).
**Depends on:** Unit 1 (listVendors), Unit 2 (table)
**Execution note:** test-first on the pure reconcile function.
**Patterns to follow:** `commerce/poll.ts` (per-tenant structure), `getVendorNearMatchesCore` + `stripVendorCurrencySuffix`
(vendors-shared.ts), `post-sweep.ts:302-331` (connection/token).
**Verification:** exercised by `verify:vendor-import` (Unit 8) on Demo.

### Unit 4: Candidate resolution cores (accept / reject / merge-into-existing)

**Goal:** The audited state transitions off the queue.
**Files:** `src/lib/vendors/vendors.ts` (or a `vendor-import-core.ts`), reuse `vendors-shared.ts`
**Approach:** `acceptCandidateCore(actor, candidateId)` → `createVendorCore`-equivalent create with the base name,
set `externalVendorId` to the candidate's canonical id, delete the candidate, `writeAudit`. `rejectCandidateCore(actor,
candidateId)` → set `status=REJECTED` (kept as a suppression tombstone), `writeAudit`. `mergeCandidateIntoVendorCore(actor,
candidateId, targetVendorId)` → **conflict guard**: if the target `Vendor.externalVendorId` is set AND differs
from the candidate's id → throw `ActionError(CONFLICT)`; else set the target's `externalVendorId`, delete the
candidate, `writeAudit`. Shared `linkVendorExternalIdCore(actor, {vendorId, externalVendorId})` does the audited
update (the single-source-of-truth write). All in `runInTenantTx`.
**Tests:** accept creates a vendor with the externalVendorId + removes the candidate; reject tombstones + future
pull suppresses; merge links onto the target; merge into a target with a different externalVendorId is blocked;
the Unknown fallback can't be a merge target (guard).
**Depends on:** Unit 2
**Patterns to follow:** `createVendorCore`/`mergeVendorsCore` (vendors.ts), `resolveMergedExternalVendorId`
(vendors-shared.ts) for the conflict shape, `post-sweep.ts:177` (the write being superseded).
**Verification:** `verify:vendor-import` (Unit 8).

### Unit 5: Server actions

**Goal:** Request-layer wrappers for the manual pull + the queue actions.
**Files:** `src/lib/vendors/actions.ts`
**Approach:** `pullVendorsFromQboAction()` (admin/developer-gated `safeAdminAction`, returns
`{ok, pulled, candidates}` counts), and `acceptCandidateAction` / `rejectCandidateAction` /
`mergeCandidateIntoVendorAction` wrapping the Unit 4 cores. All `safeAdminAction` (return `{ok:false,error}` so
CONFLICT messages survive prod redaction). `revalidatePath("/setup/vendors")` after each.
**Tests:** covered by Unit 8 (actions are thin); the conflict message shape is asserted there.
**Depends on:** Units 3, 4
**Patterns to follow:** `vendors/actions.ts` (mergeVendorsAction / removeVendorAction use `safeAdminAction`).
**Verification:** `verify:vendor-import`.

### Unit 6: "Pull vendors from QBO" button + the review-queue UI

**Goal:** The human surface — pull on demand, then triage the candidates.
**Files:** `src/app/(app)/setup/vendors/page.tsx`, `src/app/(app)/setup/vendors/VendorsClient.tsx`, a new
`src/app/(app)/setup/vendors/VendorImportQueue.tsx` (+ a pure DTO/model file), reuse
`src/components/vendors/MergeVendorModal.tsx` / `VendorPicker`
**Approach:** Add a "Pull vendors from QBO" button (admin/developer only; disabled with a hint when there's no
CONNECTED QBO connection) that calls `pullVendorsFromQboAction` then `router.refresh()`. Render a candidate
queue section (mirror `IngestReviewClient`): each row shows the QBO name (+ "(N currency variants)" when
collapsed), the suggested local match if any, and **Accept / Reject / Merge into…** (Merge opens a
`VendorPicker`/`MergeVendorModal` to choose the target). Load candidates in `page.tsx` as a pure DTO.
**Tests:** no jsdom/RTL in this repo — browser-QA on Demo; extract any pure row-state helper for a unit test.
**Depends on:** Unit 5
**Patterns to follow:** `setup/expendables/ingest/` (page→DTO→client review), `VendorsClient.tsx` (button +
modal wiring).
**Verification:** browser-QA on Demo `/setup/vendors`: pull surfaces candidates; accept/reject/merge each work;
a merge-conflict shows the guard message. QA in Demo only, cleaned up.

### Unit 7: (Optional / deferrable) poll cron

**Goal:** A low-frequency scheduled pull so bookkeeper-added vendors appear without a manual click.
**Files:** `src/lib/vendors/qbo-vendor-pull.ts` (add `runQboVendorPullSweep()` — enumerate orgs, per-tenant
`runAsTenant` → `pullQboVendorsForTenant`), `src/app/api/cron/qbo-vendor-poll/route.ts`, `vercel.json`,
`docs/AUTOMATION.md` (or the route header doc-of-record)
**Approach:** Mirror `commerce7-poll/route.ts` exactly — `CRON_SECRET` Bearer `timingSafeEqual`,
`runtime="nodejs"`, `maxDuration=300`; the sweep uses `listAllOrgIds()` (enumerator) then per-tenant
`runAsTenant` (which reads the connection — the enumerator can't, SEC-C3). Add a `vercel.json` cron staggered
off the existing daily slots. Bound work per run (skip tenants with no CONNECTED QBO connection). **This unit
can ship in a follow-up PR** — the manual pull (Units 3-6) delivers the value; the cron is convenience.
**Tests:** the sweep reuses Unit 3's tested core; the route's auth gate mirrors the proven commerce7 one.
**Depends on:** Unit 3
**Patterns to follow:** `commerce7-poll/route.ts`, `commerce/poll.ts` per-tenant loop, `vercel.json` crons[].
**Verification:** hit the route locally with the Bearer secret; assert it pulls for Demo and 401s without.

### Unit 8: `verify:vendor-import` exit proof + docs

**Goal:** A governed exit proof on real DB + the isolation coverage.
**Files:** `scripts/verify-vendor-import.ts`, `package.json`, docs note (security-register / AUTOMATION.md)
**Approach:** Mirror `scripts/verify-vendor-merge.ts`: `runAsTenant("org_demo_winery")`, seed
`VendorImportCandidate` fixtures (a fresh QBO id, a currency-variant group, a name that HIGH-matches an existing
vendor, a rejected tombstone), then assert: the pure reconcile collapses variants to one candidate; an
already-`externalVendorId`-mapped vendor is skipped; a rejected candidate is suppressed on re-pull; accept
creates a `Vendor` with the externalVendorId + removes the candidate; merge links onto a target and is blocked
on a conflicting externalVendorId. Teardown in `finally`. Register `verify:vendor-import` in package.json.
**Depends on:** Units 2-5
**Patterns to follow:** `scripts/verify-vendor-merge.ts`.
**Verification:** `npm run verify:vendor-import` green on Demo; `verify:tenant-isolation` + `verify:naming` green.

## Test Strategy

**Unit:** the pure reconcile/grouping function (Unit 3) and the conflict/decision helpers — vitest, table-driven,
mirroring `test/vendors-shared.test.ts`. **Integration/exit proof:** `verify:vendor-import` (Unit 8) + the
`verify-qbo-vendor-pull-spike` (Unit 1) on Demo real DB. **Isolation:** the `verify-tenant-isolation.ts` block
(Unit 2). **Manual:** browser-QA of the pull button + queue on Demo (Unit 6), QA-* fixtures, cleaned up.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Currency-variant DisplayName floods the queue with phantom dupes | HIGH (if unhandled) | MED | Strip ` (CUR)` + collapse to one candidate (Unit 3); explicit test |
| Bare `prismaBase` read in the cron returns 0 rows (RLS) | MED | HIGH | All reads via `runAsTenant`; never prismaBase; enumerator only for org list |
| QBO pagination behaves differently than assumed (STARTPOSITION off-by-one, >1000) | MED | MED | Unit 1 spike proves it against Demo before building on it |
| A new `*-core.ts` trips `verify:ai-native` (needs an assistant tool) | MED | LOW | Open Q3 — check the gate; add an exemption or a thin `query`/tool if required |
| Merge remaps a vendor already tied to posted QBO bills | LOW | HIGH | Conflict guard blocks a differing externalVendorId; audited link core |
| Cron auth / secret misconfig exposes the endpoint | LOW | HIGH | Reuse the proven `CRON_SECRET` `timingSafeEqual` gate verbatim |

## Success Criteria

- [ ] Unit 1 spike pulls a real, paginated vendor count from Demo QBO with no error.
- [ ] `VendorImportCandidate` exists with full RLS; `verify:tenant-isolation` green incl. its block.
- [ ] Pull collapses `Acme`/`Acme (EUR)` to ONE candidate; skips already-`externalVendorId`-mapped vendors;
      suppresses rejected ones; sets `suggestedVendorId` on a HIGH name match.
- [ ] Accept creates a `Vendor` with `externalVendorId`; reject suppresses; merge links onto a chosen vendor and
      is blocked on a conflicting externalVendorId.
- [ ] Manual "Pull vendors from QBO" button + queue triage work on Demo (browser-QA'd).
- [ ] `verify:vendor-import` green; `verify:naming` green; no assistant/`verify:ai-native` regression.
- [ ] Cron (if included) 401s without the secret and pulls for Demo with it.

## Open Questions

1. **QBO tier + Advanced custom-field accelerator** — Unit 1's spike confirms the winery's QBO edition. If not
   Advanced, the accelerator is simply never built (queue-only). LOW risk to the plan (queue is the floor).
2. **Cron role** — the vendor-pull cron needs the QBO token, so it reads `accounting_connection` per-tenant
   inside `runAsTenant` (the enumerator role can't, SEC-C3). Confirmed the post-sweep does exactly this, so no
   new role is needed — but verify the enumerator is used ONLY for `listAllOrgIds()`.
3. **`verify:ai-native`** — does a new pull/queue `*-core.ts` require an assistant write tool, or is it exempt
   (it's an admin maintenance action, not a winemaker NL action)? Resolve before Unit 4 lands; add an exemption
   entry if the gate demands one. Confidence LOW here until checked.

## Follow-on (not this plan)
- Slice 2: eager create-into-QBO from Cellarhand (fuzzy-match-before-create + `syncStatus` offline fallback).
- The QBO-Advanced "Cellar Relevant" custom-List-field accelerator (auto-classify server-side).
- The agentic detective dedup sweep (semantic tail).
