---
title: Eager create-into-QBO from Cellarhand (QBO vendor sync, Slice 2 — final)
type: feat
status: completed
date: 2026-07-18
branch: claude/qbo-vendor-eager-push
depth: deep
units: 7
---

## Overview

Close the loop: when a small owner-operator creates a vendor in Cellarhand, push it to QuickBooks **immediately**
so they never open QuickBooks. Today a Cellarhand-created vendor only reaches QBO **lazily** at the first A/P
bill-post (`findOrCreateVendor` in `post-sweep.ts:174-177`). This makes it eager — but **fuzzy-matches against QBO
first** so it never creates a "Scott Labs" vs "Scott Laboratories" duplicate inside QBO, does the QBO write
**after** the local commit (never a DB tx across an HTTP call), and falls back to a `syncStatus=pending` +
background retry when QBO is offline. Opt-in per winery (large procurement-team wineries author in QBO — Slice 1's
pull covers them). This is the final slice of the QBO↔Cellarhand vendor-sync arc (Slice 0 #229, Slice 1 #231).

## Problem Frame

Small owner-operators don't want two systems open. They want "create the vendor once in Cellarhand" and have it
exist in QuickBooks. Today it does — eventually — the lazy bill-post path already creates the QBO vendor when the
first bill posts. So this slice is **immediacy + dup-safety, not a correctness gap**: the vendor reaches QBO
regardless; eager just makes it instant and, more importantly, adds a **fuzzy-match-before-create** step the lazy
exact-`DisplayName` path lacks.

**Product pressure-test finding:** the lazy path (`findOrCreateVendor`, exact `DisplayName`) can ALREADY create a
QBO duplicate today when the local vendor name differs from an existing QBO one. So the genuinely valuable half of
this slice is the **QBO-side fuzzy pre-check** (avoid "Scott Labs"/"Scott Laboratories" in QBO); the eager timing
is convenience. That reframes the priority: the pre-check + link-to-existing is the load-bearing piece, and it
improves the lazy path too. The eager push is opt-in and best-effort with a lazy backstop, so it's low-stakes.

**The multi-currency caveat (Plan 073, the crux):** QBO vendors are currency-scoped with suffixed DisplayNames
(`Acme` / `Acme (EUR)`), and ONE local `Vendor` sources N currencies (no local unique-swap; `Vendor.currency` is
informational). So the eager push creates only the **home-currency** QBO vendor (unsuffixed) and stamps that
`externalVendorId`; **foreign currency-scoped vendors stay lazy** at bill-post against the actual invoice currency
(you don't know at create time which foreign currencies a vendor will bill in). Do NOT pre-create suffixed vendors.

## Requirements

- **MUST:** On vendor create, when the tenant has opted in, push the **home-currency** QBO vendor and stamp
  `externalVendorId` — **after** `createVendorCore` commits, never inside its `runInTenantTx` (a multi-second HTTP
  call under Neon pooled = held locks + P2028). Idempotent: skip if the vendor already has an `externalVendorId`;
  `findOrCreateVendor` query-before-creates so a retry never double-creates.
- **MUST:** Fuzzy-match against QBO BEFORE creating a QBO vendor. Reuse Slice-1 `listVendors` (paginated QBO pull) +
  Plan-074 `findVendorNearMatches`. On a strong match, offer to **link** to that QBO `externalVendorId` (create the
  local vendor, no new QBO vendor); only a clean no-match creates a new QBO vendor. Never blind-create a QBO dup.
- **MUST:** `Vendor.syncStatus` (`synced` | `pending` | `conflict`, plain string — no enum, per the Windows
  `ALTER TYPE` rule; default `synced` so existing rows are unaffected). If QBO is disconnected/unreachable at
  create time → `pending`; a background sweep retries. A P2002 on the existing `@@unique([tenantId, externalVendorId])`
  (another local vendor already holds that QBO id) → `conflict`, surfaced, never a 500.
- **MUST:** Opt-in per tenant via `AppSettings.pushVendorsToQbo Boolean @default(false)` — off by default (large
  wineries author in QBO). Read/write like the existing `sparklingEnabled` toggle.
- **MUST:** Respect the invariants shipped in Slices 0/1 — the `@@unique([tenantId, externalVendorId])` (Slice 1)
  is the guard; this slice does NOT re-add it. Server actions RETURN `{ok,error}` (never throw — prod redaction).
  Sweep reads go through `runAsTenant`/`runAsSystem` (never bare `prismaBase` — RLS 0-rows).
- **SHOULD:** The lazy bill-post `findOrCreateVendor` path stays as the backstop (unchanged) — an un-pushed
  `pending` vendor still gets its QBO id at first bill-post.
- **SHOULD:** A one-time backfill (push existing local vendors that lack an `externalVendorId`, opt-in tenants) +
  a `verify:vendor-sync` exit proof on Demo.
- **NICE:** the assistant `create_vendor` tool gets the same QBO pre-check (can defer — the modal is the primary surface).

## Scope Boundaries

**In scope:** `syncStatus` + `AppSettings.pushVendorsToQbo` columns; the eager-push core (post-commit, home-currency,
idempotent, fault→pending / P2002→conflict); the QBO fuzzy pre-check action + the modal link-vs-create UX; the
offline retry sweep + cron; the settings toggle; the backfill + verify proof.

**Out of scope (and why):**
- **Pre-creating foreign currency-scoped QBO vendors** ("Acme (EUR)") — they stay lazy at bill-post (Plan 073;
  you don't know the foreign currencies at create time).
- **Two-way edit sync** (name/contact changes flowing to QBO) — a later concern; this slice only handles create.
- **Changing the lazy bill-post path** — it stays the backstop, unchanged.
- **A claim/lease outbox table for the sweep** — retries are idempotent (query-before-create), so the sweep just
  re-tries `syncStatus=pending` vendors; no `AccountingDelivery`-style claim machinery needed (noted as a decision).

## Research Summary

### Codebase Patterns
- **The outbox / post-sweep template:** `src/lib/accounting/post-sweep.ts` — the per-tenant `runAsTenant` loop
  (`listAllOrgIds()` enumerator, connection read, `getValidAccessToken` → `ctx` build ~:302-331), and the **lazy
  vendor cache-write at :174-177** (`findOrCreateVendor` → `tx.vendor.update({externalVendorId})`) — the exact
  block the eager push + retry mirror. Cron `src/app/api/cron/accounting-post/route.ts` (CRON_SECRET Bearer). The
  Slice-1 `src/lib/vendors/qbo-vendor-pull.ts` (`runQboVendorPullSweep` + `/api/cron/qbo-vendor-poll`) is the
  closer, newer clone to mirror for a `runVendorSyncSweep`.
- **createVendorCore** (`src/lib/vendors/vendors.ts:75`) commits in a tx and returns `{id}`; the eager push runs
  AFTER, invoked from `createVendorAction` (`actions.ts:28`) post-commit. `findOrCreateVendor(ctx, name, currency?)`
  (`qbo/client.ts:239`, Plan 073) already takes an optional currency — call it with NO currency (home vendor).
- **AppSettings** (`prisma/schema.prisma`, per-tenant `@@unique([tenantId])`) holds `sparklingEnabled`,
  `currency`, `apInventoryAccount`, etc. Read: `getAppSettings()`/`getTenantCurrency()` (`src/lib/settings/data.ts`).
  Write: `setSparklingEnabled` (`src/lib/settings/actions.ts` — `adminAction` → `upsert` → `writeAudit` →
  `revalidatePath("/settings")`) is the exact toggle clone. UI in `src/app/(app)/settings/SettingsClient.tsx`.
- **QBO fuzzy match:** reuse `listVendors(ctx)` (Slice 1 — returns `{externalId, name, active}[]`) +
  `findVendorNearMatches(name, qboVendors)` (Plan 074, pure) so QBO-side and local-side dedup behave identically.
- **Column-add on an RLS table:** Plan 069 pattern (`…_vendor_management_fields/migration.sql`) — a plain
  `ALTER TABLE "vendor" ADD COLUMN …`, RLS-neutral (the existing `tenant_isolation` policy covers new columns). No
  `_schema`/`_rls` split. Plain-string status column (no enum) per the Windows `ALTER TYPE` rule.
- **externalVendorId writers today:** `post-sweep.ts:177` (lazy), `mergeVendorsCore`, and the Slice-1
  `vendor-import-core.ts` accept/merge cores — all now guarded by `@@unique([tenantId, externalVendorId])`.

### Prior Learnings
- `plan073-multi-currency-fx-ingestion` — home-currency-only eager push; foreign `(CUR)` vendors stay lazy;
  `AccountingConnection.multiCurrencyEnabled` is null on pre-existing connections (backfill/reconnect); the
  base==QBO-home currency guard (`currency-guard.ts`).
- `phase15-qbo-plan-review-complete` / `intake-ap-uom-gotchas` — query-before-create idempotency; QBO enforces
  DisplayName uniqueness (400 on dup) → the pre-check must handle it; the outbox exists precisely so no DB tx is
  ever held across the QBO HTTP round-trip.
- `server-action-actionerror-redacted-in-prod` — RETURN `{ok,error}` via `safeAdminAction`, never throw.
- `prismabase-rls-zero-rows-gotcha` — the sweep uses `runAsTenant`/`runAsSystem`, never bare `prismaBase`.
- `plan069-vendor-management-shipped` / `build-in-main-checkout-not-worktrees` — reuse the `Vendor` table + the
  `findOrCreateVendorCore` choke point; build in the main checkout; expect a one-time backfill (Bhutan precedent).
- **Session note:** the research subagents ran in a STALE worktree (`5e67ce1`, pre-#229/#231) and wrongly reported
  Slices 0/1 absent. On `main` (`5938f22`) they ARE present — this plan assumes main.

### External Research
None new — QBO query `WHERE DisplayName LIKE '%…%'` is an option but the plan reuses Slice-1 `listVendors` +
`findVendorNearMatches` (proven) instead of a new QBO query shape.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Eager push timing | AFTER `createVendorCore` commits, best-effort inline + retry sweep | Inside the create tx | Never hold a DB tx across a multi-second QBO HTTP call (Neon P2028) |
| Offline fallback | `syncStatus=pending` + idempotent retry sweep | An `AccountingDelivery`-style claim/lease table | `findOrCreateVendor` query-before-creates → retries are safe without claim machinery |
| QBO fuzzy match | reuse Slice-1 `listVendors` + Plan-074 `findVendorNearMatches` | new QBO `LIKE` query per create | Same matcher as local dedup; one bounded pull (<100 vendors) |
| Currency | home-currency vendor only; foreign stay lazy | pre-create `(CUR)` variants | Plan 073: unknown foreign currencies at create time; one local Vendor sources N |
| Opt-in | `AppSettings.pushVendorsToQbo` (default false) | always-on | Large wineries author in QBO (Slice 1); small owner-ops opt in |
| status type | plain `String` (`synced\|pending\|conflict`) | Prisma enum | Windows `ALTER TYPE` rule; repo precedent for lightweight status |
| unique | reuse Slice-1 `@@unique([tenantId, externalVendorId])` | add here | Already shipped in #231; P2002 → `conflict` |

## Implementation Units

### Unit 1: Schema — `Vendor.syncStatus` + `AppSettings.pushVendorsToQbo`

**Goal:** The two columns the feature needs, RLS-neutral.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_vendor_sync_columns/migration.sql`
**Approach:** Add `Vendor.syncStatus String @default("synced")` (inline `// synced | pending | conflict`) and
`AppSettings.pushVendorsToQbo Boolean @default(false)`. One migration, two `ALTER TABLE … ADD COLUMN` statements
(mirror `…_vendor_management_fields`), no RLS migration (existing policies cover new columns). The
`@@unique([tenantId, externalVendorId])` already exists (#231) — do NOT re-add.
**Tests:** `verify:tenant-isolation` still green (no new table); the columns are exercised by Units 2/6/7.
**Depends on:** none
**Patterns to follow:** `…_vendor_management_fields/migration.sql`; schema plain-string status precedent.
**Verification:** `db:migrate` applies clean; `tsc` green after `db:generate`.

### Unit 2: The eager-push core (post-commit, home-currency, fault/conflict handling)

**Goal:** Push one vendor to QBO and stamp `externalVendorId` + `syncStatus`, safely, idempotently.
**Files:** `src/lib/vendors/vendor-qbo-sync.ts` (new), `test/vendor-qbo-sync.test.ts` (pure helper, if any)
**Approach:** `pushVendorToQboCore(vendorId, opts?: { tenantId?; linkExternalId? })`, run OUTSIDE any create tx
(its own `runAsTenant` when given a tenantId). If `linkExternalId` is provided (user chose "link to existing QBO
vendor"), just `tx.vendor.update({ externalVendorId, syncStatus: "synced" })`. Otherwise: read the CONNECTED QBO
connection (skip → set `syncStatus:"pending"`, return); build `ctx` like `post-sweep.ts:302-331`; if the vendor
already has an `externalVendorId` → return (idempotent); `findOrCreateVendor(ctx, vendor.name)` (home currency, no
suffix); `tx.vendor.update({ externalVendorId, syncStatus:"synced" })`. Catch `ProviderFault` (auth/transient/
network) → `syncStatus:"pending"` (retry later, not a throw); catch P2002 on the unique → `syncStatus:"conflict"`.
**Tests:** covered by `verify:vendor-sync` (Unit 7) on real DB; a pure unit test for any status-decision helper.
**Depends on:** Unit 1
**Patterns to follow:** `post-sweep.ts:167-178` (findOrCreateVendor + cache-write), `qbo/client.ts:239`,
`vendor-import-core.ts` (P2002→CONFLICT shape).
**Verification:** `verify:vendor-sync` accept/offline/conflict cases green.

### Unit 3: QBO fuzzy pre-check action

**Goal:** Before creating, find QBO vendors that look like the same supplier.
**Files:** `src/lib/vendors/vendor-qbo-sync.ts` (add), `src/lib/vendors/actions.ts`
**Approach:** `getQboVendorMatchesCore(name)` → build ctx, `listVendors(ctx)`, `findVendorNearMatches(name, qbo)`,
return `{ high: [{ externalId, name }] }` (empty on no-connection/offline — never blocks create). A read-only
`checkQboVendorMatchesAction(name)` (`action`, READY-USER) wraps it. Reuses the Slice-1 pull + Plan-074 matcher.
**Tests:** covered by `verify:vendor-sync` (a seeded QBO near-name → returns a high match).
**Depends on:** none (uses shipped Slice-1 code)
**Patterns to follow:** Slice-0 `checkVendorNearMatchesAction` (`actions.ts`), `listVendors` (Slice 1).
**Verification:** live against Demo QBO sandbox (a near-name of a real QBO vendor returns a match).

### Unit 4: Wire create — action + modal link-vs-create UX

**Goal:** Opt-in tenants push on create; the modal offers link-to-existing-QBO when a QBO match is found.
**Files:** `src/lib/vendors/actions.ts`, `src/components/vendors/CreateVendorModal.tsx`, `src/lib/settings/data.ts`
**Approach:** In `createVendorAction`, after `createVendorCore` commits, if `pushVendorsToQbo` is on, call
`pushVendorToQboCore(id)` best-effort (its own error handling → pending; never fails the create). The modal (when
push is enabled) runs `checkQboVendorMatchesAction` as a second pre-check AFTER the existing Plan-074 local
"did you mean?" — if QBO has a high match, show "QuickBooks already has '<name>' — same vendor?" with **Link to
it** (create local + `pushVendorToQboCore(id, { linkExternalId })`) vs **Create new anyway** (normal eager push).
Keep it layered and skippable; if push is off, the modal is unchanged.
**Tests:** no jsdom — browser-QA on Demo (opt-in on): create a name matching a QBO vendor → link offered; link
sets externalVendorId, no new QBO vendor; create-new pushes a new QBO vendor.
**Depends on:** Units 2, 3, 6 (the setting)
**Patterns to follow:** `CreateVendorModal.tsx` Plan-074 pre-check + `create-anyway` flow.
**Verification:** browser-QA on Demo `/setup/vendors`.

### Unit 5: Offline retry sweep + cron

**Goal:** Vendors stuck at `syncStatus=pending` (QBO was offline) get pushed later, unattended.
**Files:** `src/lib/vendors/vendor-qbo-sync.ts` (add `runVendorSyncSweep`), `src/app/api/cron/qbo-vendor-sync/route.ts`,
`vercel.json`
**Approach:** `runVendorSyncSweep()`: enumerate orgs (`listAllOrgIds`), per-tenant `runAsTenant` → skip tenants
where `pushVendorsToQbo` is off or no CONNECTED QBO connection → find `syncStatus:"pending"` vendors (bounded
batch) → `pushVendorToQboCore(v.id)` each (idempotent; per-vendor failure stays pending, isolated). Cron route
clones `qbo-vendor-poll/route.ts` (CRON_SECRET Bearer); `vercel.json` entry staggered off the existing slots.
**Tests:** the sweep reuses Unit 2's core; `verify:vendor-sync` seeds a pending vendor + asserts a sweep clears it.
**Depends on:** Units 1, 2, 6
**Patterns to follow:** `qbo-vendor-pull.ts` `runQboVendorPullSweep` + its cron route + `vercel.json`.
**Verification:** hit the route locally with the Bearer; a seeded pending vendor becomes synced.

### Unit 6: Settings toggle

**Goal:** The per-tenant opt-in.
**Files:** `prisma` (done in U1), `src/lib/settings/data.ts`, `src/lib/settings/actions.ts`, `src/app/(app)/settings/SettingsClient.tsx`, `src/app/(app)/settings/page.tsx`
**Approach:** `getPushVendorsToQbo()` (clone `getTenantCurrency`), `setPushVendorsToQboAction` (clone
`setSparklingEnabled` — `adminAction` → upsert → audit → revalidate), a toggle in `SettingsClient` near the QBO/
accounting block (disabled with a hint when QBO isn't connected). `page.tsx` passes the current value.
**Tests:** covered by `verify:vendor-sync` (read the flag) + browser-QA.
**Depends on:** Unit 1
**Patterns to follow:** `settings/actions.ts` `setSparklingEnabled`; `settings/data.ts` `getTenantCurrency`.
**Verification:** toggle on `/settings` persists; drives the create-time push.

### Unit 7: `verify:vendor-sync` proof + backfill + docs

**Goal:** A governed exit proof + a one-time backfill for existing vendors.
**Files:** `scripts/verify-vendor-sync.ts`, `scripts/backfill-vendor-qbo-sync.ts`, `package.json`, security-register note
**Approach:** `verify:vendor-sync` (Demo, real DB): a linked-create sets externalVendorId with no new QBO vendor;
an eager create pushes + stamps synced; a P2002 (two vendors → one QBO id) → conflict; a pending vendor is cleared
by `runVendorSyncSweep`; the QBO pre-check returns a high match for a near-name. `backfill-vendor-qbo-sync.ts`
pushes existing `externalVendorId IS NULL` vendors for opt-in tenants (idempotent; Bhutan-not-backfilled precedent
— run explicitly). Security-register note: opt-in, home-currency-only, no DB tx across HTTP, unique guard.
**Depends on:** Units 2, 5
**Patterns to follow:** `scripts/verify-vendor-import.ts` (Slice 1), `scripts/backfill-material-vendors.ts`.
**Verification:** `npm run verify:vendor-sync` green on Demo; `verify:naming`/`verify:tenant-isolation`/`verify:ai-native` green.

## Test Strategy

**Unit:** any pure status-decision helper (vitest). **Integration/exit proof:** `verify:vendor-sync` on Demo real
DB (link / eager-push / conflict / offline-sweep / pre-check) + a live QBO-sandbox check for the pre-check. **Manual:**
browser-QA of the settings toggle + the create modal's link-vs-create on Demo (opt-in on), cleaned up. **AI-native:**
a new `*-core.ts` may need an assistant tool or INTERNAL classification (Open Question).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A DB tx held across the QBO HTTP call → Neon P2028 | LOW (by design) | HIGH | Push runs AFTER commit, in its own tx only for the stamp; never wraps the fetch |
| Eager push creates a QBO dup ("Scott Labs"/"Laboratories") | MED (if pre-check skipped) | MED | The QBO fuzzy pre-check + link-to-existing; findOrCreateVendor query-before-create |
| Foreign-currency confusion — pushing a suffixed vendor | LOW | MED | Home-currency only; foreign stay lazy at bill-post (Plan 073); explicit test |
| Two vendors resolve to one QBO id | LOW | MED | @@unique (#231) → P2002 → syncStatus=conflict, surfaced (not 500) |
| Per-create QBO pull (pre-check) is slow / rate-limited | MED | LOW | Bounded (<100 vendors, one paginated call); only when push opted-in; pre-check is advisory |
| New core trips verify:ai-native | MED | LOW | Classify INTERNAL (admin/settings-driven sync) or add a tool — Open Question |

## Success Criteria

- [ ] `Vendor.syncStatus` + `AppSettings.pushVendorsToQbo` columns added (RLS-neutral); `verify:tenant-isolation` green.
- [ ] Opt-in tenant: creating a vendor pushes the home-currency QBO vendor + stamps `externalVendorId`/`synced`
      (live on Demo sandbox); a foreign vendor's `(CUR)` variant is NOT pre-created.
- [ ] The QBO pre-check offers "link to existing" for a near-name; link sets externalVendorId with NO new QBO vendor.
- [ ] QBO offline at create → `pending`; `runVendorSyncSweep` later clears it to `synced`.
- [ ] Two vendors → one QBO id → `conflict` (not 500).
- [ ] The `/settings` toggle persists and gates the behavior; off by default.
- [ ] `verify:vendor-sync` green; naming / tenant-isolation / ai-native green; browser-QA'd; the lazy bill-post
      backstop still works for un-pushed vendors.

## Open Questions

1. **verify:ai-native** — does the new `vendor-qbo-sync.ts` core need an assistant tool, or INTERNAL (it's a
   settings-gated sync mechanism, not a winemaker NL capability — likely INTERNAL, like the Slice-1
   `vendor-import-core.ts`)? Resolve before Unit 2 lands.
2. **Pre-check cost** — one QBO pull per opted-in create. Acceptable at winery scale (<100 vendors); if a tenant
   ever has 1000s, cache the pull per session or fall back to a `DisplayName LIKE` query. LOW risk; note it.
3. **Backfill rollout** — like Plan 069, existing vendors need a one-time push; run `backfill-vendor-qbo-sync.ts`
   per opt-in tenant deliberately (not automatic). Bhutan-not-backfilled precedent.

## Follow-on (not this plan)
- Two-way edit sync (name/contact changes → QBO). The vendor-sync arc's create/pull loop is complete after this.
