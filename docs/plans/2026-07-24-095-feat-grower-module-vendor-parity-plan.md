---
title: Grower module — Vendor parity (contacts, assistant tool, QBO-linked vendor)
type: feat
status: built-verification-pending
date: 2026-07-24
branch: claude/grower-module-assistant-27c689
depth: deep
units: 8
---

## Overview

Close the gap between the existing Grower entity and the Vendor module so a grower is a
first-class, assistant-creatable, QBO-payable record. Growers gain structured contact
fields + multiple additional contacts (mirroring Vendor), a `create_grower` assistant
write tool, and — for third-party (non-estate) growers — an auto-created **linked Vendor**
that syncs to QBO. Estate growers stay link-free (you don't pay yourself). Built for
extensibility toward the roadmap (fruit contracts, AVA, vineyard maps) without building
those now.

## Problem Frame

The Grower entity already exists (Plan 093 F2: model, RLS migration, read/write cores,
`/setup/growers` admin, audit) but it's intentionally lean: a single free-text `contact`
string, no phone/email split, no additional contacts, no assistant tool, no payment path.
The winemaker wants growers managed with the same rigor as vendors and — critically —
**paid like vendors** (the ticket: "creating a grower should also set them up as a vendor
in QBO"). Today there's no way to create a grower from the assistant and no A/P/QBO path.

Doing nothing keeps grower onboarding a desk-only, QBO-disconnected task and blocks the
custom-crush intake story where a partner needs a payable fruit source fast.

## Requirements

- MUST: Grower carries structured **business name, primary contact name, phone, email,
  address** (same required set as Vendor).
- MUST: Grower supports **0..N additional contacts** (name/role/phone/mobile/email,
  at-most-one primary) — a `GrowerContact` child table mirroring `VendorContact`.
- MUST: A `create_grower` assistant **write tool** mirroring `create_vendor`
  (dedup + near-dup guard → propose → confirm → commit), registered + committer-wired +
  golden eval, and `grower-core.ts` reclassified out of the `INTERNAL` allowlist so
  `verify:ai-native` covers it.
- MUST: Creating a **third-party** grower auto-creates a **linked Vendor** row and pushes
  it to QBO as a vendor (reusing `pushVendorToQboCore`, gated on
  `appSettings.pushVendorsToQbo`). **Estate growers (`isEstate`) skip the link + push.**
- MUST: Full AGENTS.md 9-step for the new `GrowerContact` table; **backfill-then-enforce**
  posture on the live tenant; `verify:naming` / tenant-isolation stay green.
- SHOULD: `/setup/growers` UI reaches multi-contact parity with `/setup/vendors` via a
  shared `GrowerForm` (mirror `VendorForm`).
- SHOULD: Migrate the legacy free-text `contact` into the new structured fields (keep the
  column for backfill provenance, don't hard-drop).
- NICE: Surface the linked-vendor + QBO sync status on the grower row in setup.
- OUT: Grape supply agreement upload/parsing, vineyard maps, AVA/appellation, fruit
  contracts — design for them, don't build them.

## Scope Boundaries

**In scope:**
- Grower schema columns (`phone`, `email`, `contactName`, `vendorId` FK) + `GrowerContact`
  table + migrations (backfill-then-enforce).
- Grower core/read/shared extensions + grower-contact sanitizer (mirror
  `sanitizeVendorContacts`).
- `create_grower` assistant tool + committer + registry/commit wiring + `createGrowerAction`
  + golden eval + allowlist reclassification.
- Grower↔Vendor link creation + QBO push for non-estate growers.
- `/setup/growers` multi-contact UI parity.
- `scripts/verify-tenant-isolation.ts` / `test/tenant-isolation.test.ts` cases for
  `grower_contact`.

**Out of scope (design-for, don't-build):**
- Supply-agreement upload/OCR parsing, vineyard-map creation, AVA/appellation, fruit-purchase
  contracts, bonus/penalty price rules. The `vendorId` link + standalone Grower entity are the
  extension seams; leave them clean.
- Merging Grower into Vendor or a unified Party table (explicitly rejected — see Key Decisions).
- Grower-side QBO columns — the linked **vendor's** `externalVendorId`/`syncStatus` carry sync
  state; no grower-side accounting columns.

## Research Summary

### Codebase Patterns

**Vendor is the template throughout.**
- Data model: `Vendor` [prisma/schema.prisma:3583](prisma/schema.prisma), `VendorContact`
  [prisma/schema.prisma:3615](prisma/schema.prisma) — plain `vendorId` ref pinned by a
  composite `(tenantId, vendorId)` FK in raw SQL (NO Prisma relation), `isPrimary` with
  at-most-one enforced in the core.
- Grower today: `Grower` [prisma/schema.prisma:360](prisma/schema.prisma) — `name`,
  `company`, single free-text `contact`, `address`, `isEstate`, `isActive`. Composite-FK
  target `@@unique([tenantId, id])` already present (Vineyard/Block reference it).
- Write core: `createGrowerCore`/`updateGrowerCore` [src/lib/grower/grower-core.ts:32](src/lib/grower/grower-core.ts)
  (note: `address` is accepted + persisted at create but absent from `GrowerRow`; `update`
  omits `address`). Read: `GrowerRow`/`GROWER_SELECT`/`toRow`/`listGrowersCore`
  [src/lib/grower/data.ts:7](src/lib/grower/data.ts).
- Assistant tool: `createVendorTool` + `commitCreateVendor`
  [src/lib/assistant/tools/create-vendor.ts:31](src/lib/assistant/tools/create-vendor.ts) —
  input schema `{name*, phone, email, contactName, accountNumber, poRequired, terms, url}`,
  exact-dup guard via `findVendorsByName`, near-dup via `getVendorNearMatchesCore` →
  `signResume(...createAnyway)` ChoiceRequest, then `signProposal` → `needsConfirmation`.
  The committer calls `createVendorAction` and is **scalar-only (no contacts)**.
- Registry: import + `ALL_TOOLS` entry [src/lib/assistant/registry.ts:120](src/lib/assistant/registry.ts),
  [registry.ts:193](src/lib/assistant/registry.ts). Committer map:
  [src/lib/assistant/commit.ts:69](src/lib/assistant/commit.ts),
  [commit.ts:139](src/lib/assistant/commit.ts) (`committerToolNames()` asserts every write
  tool has a committer).
- Server action: `createVendorAction(input, opts?: { qboLinkExternalId })`
  [src/lib/vendors/actions.ts:34](src/lib/vendors/actions.ts) — calls `createVendorCore`,
  then post-commit best-effort QBO push (`pushVendorToQboCore` if
  `getPushVendorsToQbo()`), then `revalidateVendors()`, returns the created row.
- QBO: `pushVendorToQboCore(vendorId, { tenantId?, linkExternalId? })`
  [src/lib/vendors/vendor-qbo-sync.ts:72](src/lib/vendors/vendor-qbo-sync.ts) — idempotent
  (already-linked → "synced"), offline → `markPending`, calls
  `conn.adapter.findOrCreateVendor`, stamps `externalVendorId`/`syncStatus`. Gate
  (`appSettings.pushVendorsToQbo`) is checked by the **caller**, not the core.
- UI multi-contact machinery lives in `VendorForm.tsx` (contacts array, add/remove,
  `setPrimary` radio-exclusive, `React.useId()` group), not `VendorsClient.tsx`. Grower's
  current single-contact inline form: `GrowersAdmin.tsx` (flat `contact` string; edit only
  renames + toggles active).
- Sanitizer precedent: `sanitizeVendorContacts` (first-flagged-primary-wins) in
  `src/lib/vendors/vendors-shared.ts`.
- Migration precedent: [prisma/migrations/20260723160000_grower_entity/migration.sql](prisma/migrations/20260723160000_grower_entity/migration.sql)
  — the full 9-step (tenantId-first, per-tenant unique, composite-FK-target unique promoted
  via `USING INDEX`, tenantId FK→organization ON DELETE RESTRICT, composite child FKs, RLS
  ENABLE+FORCE, `tenant_isolation` USING+WITH CHECK, `GRANT ... TO app_rls`, and a `DO $$`
  fail-closed guard).
- AI-native gate: `scripts/verify-ai-native.mjs` + `scripts/ai-native-allowlist.mjs`
  (`grower-core.ts` currently in `INTERNAL`; `MAX_ALLOWED = 2`). Golden eval:
  `test/evals/assistant-write-tools.golden.ts:734` (create_vendor cases).

### Prior Learnings
- Every domain core needs an assistant tool or it's an `INTERNAL`/gap exemption; a new
  `*-core.ts` **fails `verify:ai-native` until wired** (`parity-ai-native-registers`).
- New tenant-scoped table = the full AGENTS.md 9-step or you get a leak/broken table; on the
  live tenant it's **backfill-then-enforce, never a bare additive migration** (CLAUDE.md).
- Windows/Prisma: enum changes ship isolated + committed before any default; stop the dev
  server before `db:generate`; `migrate diff → deploy` (`prisma-neon-migrations-windows`).
  No new enum here, but the generate/migrate ordering applies.
- `runAsTenant` script bodies need `async () => await ...` (worktree gotcha).
- Assistant tool count is near the ~40-tool selection cliff — `create_grower` is justified
  (wet-hands-adjacent onboarding + distinct entity), but keep the schema tight and the
  description sharply disambiguated from `create_vendor` / owner.

### External Research
None needed — all patterns are in-repo. QBO push reuses the existing adapter.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Grower↔Vendor relationship | **Link** — standalone Grower + optional `vendorId` to an auto-created, QBO-synced Vendor | Merge into Vendor (Vintrace single-Party); keep fully separate (InnoVint) | Growers are paid like vendors (A/P) → reuse vendor+QBO rails; keep the Grower entity for the roadmap. Recorded in context-ledger (`grower` domain, precedent). |
| Estate growers | **No vendor link, no QBO push** when `isEstate` | Link every grower | You don't pay your own estate vineyard; auto-creating a QBO vendor for it is wrong. |
| Legacy `contact` field | **Keep column, backfill into structured fields**, stop writing new data to it | Drop the column | Backfill provenance + avoid a destructive migration on the live tenant. |
| Assistant tool contact handling | **Scalar-only** (`create_grower` sets name/company/contactName/phone/email/address); additional contacts are UI-only | Tool also accepts a contacts array | Mirrors `create_vendor` (scalar-only committer); keeps the tool schema tight below the selection cliff. |
| Sync state storage | On the **linked Vendor** (`externalVendorId`/`syncStatus`) | Grower-side QBO columns | Growers aren't accounting entities; the vendor row is the QBO subject. |

## Implementation Units

### Unit 1: Grower schema — structured fields + vendor link + GrowerContact model
**Goal:** Add `phone`, `email`, `contactName`, `vendorId` to `Grower` and introduce a
`GrowerContact` model, all at the Prisma layer.
**Files:** `prisma/schema.prisma`
**Approach:** On `Grower` (L360) add `phone String?`, `email String?`, `contactName String?`,
and `vendorId String?` (plain ref; composite `(tenantId, vendorId)` FK lives in raw SQL like
`Vineyard.growerId`). Add `GrowerContact` modeled verbatim on `VendorContact` (L3615): plain
`growerId` ref, `name/role/phone/mobile/email/isPrimary`, `@@unique([tenantId, id])`,
`@@index([tenantId])`, `@@index([tenantId, growerId])`, `@@map("grower_contact")`. Do NOT add a
Prisma relation for either FK (raw-SQL composite, K11). Keep legacy `contact` column.
**Tests:** none (schema only; validated by migration + downstream units).
**Depends on:** none
**Patterns to follow:** [prisma/schema.prisma:3615](prisma/schema.prisma) (VendorContact),
[prisma/schema.prisma:382](prisma/schema.prisma) (Vineyard.growerId plain ref).
**Verification:** `npx prisma validate` succeeds; `npm run db:generate` produces the new types.

### Unit 2: Migrations — column-adds + GrowerContact table (backfill-then-enforce)
**Goal:** Two migrations: (a) additive `grower` columns + `vendorId` composite FK; (b) the
`grower_contact` table with the full 9-step, plus a backfill of legacy `contact` → structured
fields.
**Files:** `prisma/migrations/<ts>_grower_vendor_parity/migration.sql`,
`prisma/migrations/<ts>_grower_contact/migration.sql`
**Approach:** Migration (a): `ALTER TABLE "grower" ADD COLUMN` for `phone/email/contactName`
(nullable), and `vendorId TEXT` + `("tenantId","vendorId")` index + composite FK
`("tenantId","vendorId") → vendor("tenantId","id") ON DELETE RESTRICT ON UPDATE CASCADE`. A
best-effort backfill: copy `contact` into `phone`/`email`/`contactName` only where structured
fields are null (leave `contact` intact). Columns stay nullable (backfill-then-enforce; the
setup UI enforces required-ness, matching Vendor's "REQUIRED in UI, nullable at DB" note at
[schema.prisma:3592](prisma/schema.prisma)). Migration (b): create `grower_contact` following
[the grower_entity migration](prisma/migrations/20260723160000_grower_entity/migration.sql)
steps 1–4 + 6–9 verbatim, including the `DO $$` fail-closed guard listing `'grower_contact'`.
**Tests:** covered by Unit 8 (tenant-isolation) + `verify:ttb`-style RLS proof.
**Depends on:** Unit 1
**Patterns to follow:** the 9-step migration cited above; AGENTS.md "adding a tenant-scoped
table" checklist.
**Verification:** `npm run db:migrate` applies clean; the migration's own `DO $$` guard passes;
`npx tsx scripts/verify-tenant-isolation.ts` (after Unit 8) green.

### Unit 3: Grower read/shared layer + contact sanitizer
**Goal:** Extend the read layer and add a client-safe sanitizer for grower + contacts.
**Files:** `src/lib/grower/data.ts`, `src/lib/grower/grower-shared.ts` (new)
**Approach:** Extend `GrowerRow` + `GROWER_SELECT` + `toRow` [data.ts:7](src/lib/grower/data.ts)
to include `phone/email/contactName/address/vendorId` and a `contacts: GrowerContactRow[]`
(read via a follow-up `grower_contact` query in `getGrowerCore`/`listGrowersCore`). Create
`grower-shared.ts` mirroring `vendors-shared.ts`: `GrowerInput`, `GrowerContactInput`,
`GrowerRow`, `sanitizeGrower`, `sanitizeGrowerContacts` (first-flagged-primary-wins). Keep it
import-safe for client components.
**Tests:** `test/grower-shared.test.ts` — sanitizeGrowerContacts: (a) two `isPrimary:true` →
only first kept primary; (b) nameless rows dropped; (c) invalid email rejected.
**Depends on:** Unit 1
**Patterns to follow:** `src/lib/vendors/vendors-shared.ts` (`sanitizeVendorContacts`).
**Verification:** `npm test -- grower-shared` green.

### Unit 4: Grower write core — structured fields, contacts, vendor link
**Goal:** Extend `createGrowerCore`/`updateGrowerCore` to persist the new fields + contacts and
to create+link a Vendor for non-estate growers.
**Files:** `src/lib/grower/grower-core.ts`
**Approach:** Widen `CreateGrowerInput`/`UpdateGrowerInput` with
`phone/email/contactName/contacts?`. In the create tx: persist scalars; upsert `grower_contact`
rows from sanitized `contacts`; **if `!isEstate`**, call `createVendorCore(actor, {name, phone,
email, contactName})` in the same tenant tx and set `grower.vendorId`. Keep the QBO push OUT of
the core (best-effort, post-commit — Unit 5), matching how `createVendorAction` layers QBO on
top of `createVendorCore`. Reconcile contacts on update (add/update/remove) like
`updateVendorCore`. Preserve audit writes.
**Tests:** `test/grower-core.test.ts` — (a) non-estate create → grower has `vendorId`, a vendor
row exists; (b) estate create → `vendorId` null, no vendor; (c) contacts persisted with one
primary; (d) update reconciles contacts.
**Depends on:** Units 1, 3
**Patterns to follow:** `updateVendorCore` contact reconciliation in
`src/lib/vendors/vendors.ts`; `createGrowerCore` [grower-core.ts:32](src/lib/grower/grower-core.ts).
**Execution note:** test-first for the estate/non-estate branch (the core carve-out).
**Verification:** `npm test -- grower-core` green.

### Unit 5: Grower server action + QBO push for the linked vendor
**Goal:** A `createGrowerAction` (+ `updateGrowerAction`) that wraps the core and, for
non-estate growers, pushes the linked vendor to QBO best-effort.
**Files:** `src/lib/grower/actions.ts` (new), `src/app/(app)/setup/growers/actions.ts`
**Approach:** Mirror `createVendorAction` [actions.ts:34](src/lib/vendors/actions.ts): call
`createGrowerCore`, then if the result has a `vendorId` and `getPushVendorsToQbo()` is on,
`pushVendorToQboCore(vendorId)` inside try/catch (grower still created on failure — pending
sweep retries). `revalidate('/setup/growers')`. Rewire the page-local setup actions to the new
action module (keep `safeAdminAction` gating).
**Tests:** covered by Unit 4 core tests + Unit 8 manual QA; add an action-level test asserting
the QBO push is skipped for estate and attempted (mocked) for non-estate.
**Depends on:** Unit 4
**Patterns to follow:** `src/lib/vendors/actions.ts`, `vendor-qbo-sync.ts` gate usage in
`runVendorSyncSweep` [vendor-qbo-sync.ts:137](src/lib/vendors/vendor-qbo-sync.ts).
**Verification:** `npm run build` (types); the linked vendor appears with `syncStatus`
pending/synced depending on connection.

### Unit 6: create_grower assistant tool + committer + wiring + golden eval
**Goal:** A `create_grower` write tool mirroring `create_vendor`, fully registered and
committer-wired, with golden cases; reclassify `grower-core.ts` out of `INTERNAL`.
**Files:** `src/lib/assistant/tools/create-grower.ts` (new),
`src/lib/assistant/registry.ts`, `src/lib/assistant/commit.ts`,
`test/evals/assistant-write-tools.golden.ts`, `scripts/ai-native-allowlist.mjs`
**Approach:** New tool `create_grower`, `kind: "write"`, schema
`{ name*, company, contactName, phone, email, address, isEstate? }` (scalar-only, no contacts —
matches `create_vendor` committer). Reuse the exact-dup (`findGrowersByName`, add to data.ts if
missing) + near-dup guard shape; `signProposal`/`signResume`. Description sharply disambiguates
grower (farms/sells the fruit) from vendor (supplier you buy goods from) and owner (owns the
wine). `commitCreateGrower` calls `createGrowerAction`, navigates to `/setup/growers`. Wire the
import + `ALL_TOOLS` entry (registry.ts) and the `COMMITTERS` entry (commit.ts). Remove
`grower-core.ts` from `INTERNAL` in `ai-native-allowlist.mjs`. Add two golden cases mirroring
[golden.ts:734](test/evals/assistant-write-tools.golden.ts).
**Tests:** `test/assistant-create-grower-dedup.test.ts` (exact + near-dup); the golden harness;
`npm run verify:ai-native`.
**Depends on:** Unit 5
**Patterns to follow:** `src/lib/assistant/tools/create-vendor.ts` end-to-end.
**Verification:** `npm run verify:ai-native` green (grower-core now tool-covered); golden eval
selects `create_grower` for the new utterances; `npm test -- create-grower-dedup` green.

### Unit 7: /setup/growers multi-contact UI parity
**Goal:** Bring the setup UI to Vendor-level parity — structured fields + add/remove additional
contacts with a primary selector.
**Files:** `src/app/(app)/setup/growers/GrowerForm.tsx` (new),
`src/app/(app)/setup/growers/GrowersAdmin.tsx`, `src/app/(app)/setup/growers/page.tsx`
**Approach:** Create `GrowerForm` mirroring `VendorForm.tsx`: a `GrowerFormValue` with
`name/company/contactName/phone/email/address/isEstate` + `contacts: GrowerContactFormValue[]`,
`addContact`/`removeContact`/`setPrimary` (radio-exclusive via `React.useId()`),
`growerToForm`/`growerFormToInput`/`growerFormValid` (create requires name+phone+email). Replace
the flat inline inputs in `GrowersAdmin`; the edit row gains contact editing. Show the linked-
vendor / QBO sync badge (NICE) when `vendorId` is set. Follow DESIGN.md tokens.
**Tests:** manual QA in the Demo Winery sandbox (repo has no jsdom/RTL — assistant/UI is
manual-QA-only per project convention). Create `QA-*`-prefixed growers, verify contacts persist
and a non-estate grower spawns a vendor.
**Depends on:** Units 4, 5
**Patterns to follow:** `src/app/(app)/setup/vendors/VendorForm.tsx`.
**Verification:** In-app browser against `localhost:3000`: add a QA grower with 2 contacts →
`get_page_text` confirms rows; a short `runAsTenant("org_demo_winery", …)` script reads back the
`grower` + `grower_contact` + linked `vendor` rows.

### Unit 8: Tenant-isolation coverage + verification sweep
**Goal:** Prove `grower_contact` is RLS-isolated and the whole feature passes the repo gates.
**Files:** `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`
**Approach:** Add a `grower_contact` case to both (cross-tenant read returns 0 rows; write under
the wrong tenant fails). Run the full gate set. Confirm `verify:naming` green before AND after.
**Tests:** the added isolation cases.
**Depends on:** Units 2, 4
**Patterns to follow:** existing `grower` / `vendor_contact` isolation cases in those files.
**Verification:** `npx tsx scripts/verify-tenant-isolation.ts` green; `npm run verify:naming`
green; `npm test` green; `npm run verify:ai-native` green.

## Test Strategy

**Unit tests:** `grower-shared` (sanitizer), `grower-core` (estate/non-estate branch, contact
reconciliation, vendor link), `assistant-create-grower-dedup`. Node-environment, matching the
existing voice/vendor test pattern.
**Golden eval:** two `create_grower` cases in `assistant-write-tools.golden.ts` — the hard CI
gate proving the model selects `create_grower` (not `create_vendor`) for grower utterances.
**Integration/RLS:** `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts`
`grower_contact` cases; the migration's own `DO $$` fail-closed guard.
**Manual verification (Demo Winery only):** in-app browser add a `QA-` grower with additional
contacts; assert (a) contacts persist, (b) a non-estate grower creates a linked vendor with a
QBO `syncStatus`, (c) an estate grower does not — proven by a `runAsTenant("org_demo_winery")`
read-back script. Clean up `QA-*` fixtures after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Live-tenant migration on `grower` breaks existing rows | LOW | HIGH | Backfill-then-enforce; columns stay nullable; `contact` retained; test on Demo Winery first. |
| `create_grower` collides with `create_vendor` in tool selection (≈40-tool cliff) | MED | MED | Sharp disambiguating description + golden cases that assert the split both directions. |
| Auto-creating a vendor per grower pollutes the vendor list / QBO | MED | MED | Only non-estate; reuse `findVendorsByName` dedup so an existing same-name vendor links instead of duplicating (decide link-vs-create in Unit 4). |
| QBO push failure blocks grower creation | LOW | MED | Push is post-commit best-effort (try/catch) + pending sweep, exactly like vendors. |
| Missing an AGENTS.md 9-step item on `grower_contact` → RLS leak | LOW | HIGH | Copy the grower_entity migration verbatim incl. the `DO $$` guard; Unit 8 isolation test. |
| Contact reconciliation edge cases (primary toggling, removals) | MED | LOW | Mirror `updateVendorCore` + `sanitizeVendorContacts`; unit-test the toggles. |

## Success Criteria

- [ ] Grower has structured phone/email/contactName + address; legacy `contact` backfilled, not dropped.
- [ ] `GrowerContact` table passes the AGENTS.md 9-step; tenant-isolation cases green.
- [ ] `/setup/growers` supports add/remove additional contacts with a primary selector (Vendor parity).
- [ ] `create_grower` assistant tool creates a grower end-to-end (propose→confirm→commit); golden eval green.
- [ ] `grower-core.ts` removed from `INTERNAL`; `npm run verify:ai-native` green.
- [ ] A non-estate grower auto-creates a linked, QBO-pushed vendor; an estate grower does not.
- [ ] `verify:naming` green before and after; `npm test` green; no regressions.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Ticket + repo state are unambiguous; decision recorded. |
| Scope Boundaries | HIGH | Roadmap items explicitly deferred; extension seams identified. |
| Implementation Units | HIGH | Vendor is a line-level template for every unit. |
| Test Strategy | MEDIUM | UI is manual-QA-only (no jsdom/RTL); core/RLS/golden are automated. |
| Risk Assessment | MEDIUM | Live-tenant migration + tool-selection cliff are the real risks, both mitigated. |

**Open question for /work:** in Unit 4, when a non-estate grower's name matches an existing
vendor, **link to that vendor** (via `findVendorsByName`) rather than create a duplicate — confirm
this is the desired behavior vs always-create.

---

## Build status — all 8 units committed (2026-07-24)

Built on `claude/grower-module-assistant-27c689`. The Unit-4 open question was resolved to
**link-if-name-exists** (a non-estate grower links to an existing same-name vendor rather than
duplicating). `verify:ai-native` passes locally (grower-core reachable via `create_grower`).

- [x] U1 schema · [x] U2 migrations · [x] U3 read/shared · [x] U4 write core · [x] U5 actions+QBO
- [x] U6 assistant tool+golden+allowlist · [x] U7 UI · [x] U8 tenant-isolation

## Verification runbook — RUN IN THE MAIN CHECKOUT (has node_modules + .env)

This worktree is code-only (no node_modules, no .env) and the local `.env` points at **prod**, so the
build did not compile, test, or migrate. Run these in the main checkout on this branch, in order.
The prod migration is backfill-then-enforce and touches the live DB — do it deliberately.

```bash
# 1. Get on the branch + regenerate the Prisma client for the new schema
git checkout claude/grower-module-assistant-27c689
npm run db:generate

# 2. Typecheck + lint + full test suite (hermetic grower tests + golden eval + all existing)
npx tsc --noEmit
npm run lint
npm test

# 3. AI-native + naming gates (coverage doc already regenerated + committed)
npm run verify:ai-native
npm run verify:naming

# 4. Apply the two migrations to the DB (OWNER via DATABASE_URL_UNPOOLED). Backfill-then-enforce:
#    columns are nullable, GrowerContact ships full RLS. Review the SQL first; the DO-block guard
#    fails the migration if RLS isn't fully on.
npm run db:migrate

# 5. Prove tenant isolation for the new table (real DB)
npx tsx --env-file=.env scripts/verify-tenant-isolation.ts
```

### Manual QA (Demo Winery sandbox ONLY — never Bhutan)

1. `npm run dev`, log in as Demo Winery, open `/setup/growers`.
2. Add a `QA-` third-party grower with 2 additional contacts → confirm it saves, contacts persist,
   an **Estate/Vendor** badge shows, and a matching **vendor** appears under `/setup/vendors`
   (with a QBO `syncStatus` if `pushVendorsToQbo` is on).
3. Add a `QA-` **estate** grower (isEstate) → confirm NO linked vendor is created.
4. In the assistant: "add a grower called QA-Test Ranch, contact Sam, 805-555-0000" → confirm the
   propose→confirm card, then that both the grower and its vendor landed (read back with a short
   `runAsTenant("org_demo_winery", …)` script).
5. Clean up all `QA-*` fixtures; keep `verify:naming` green before and after.

### Known follow-ups (out of scope, by design)
- Roadmap extensibility seams left clean: `grower.vendorId` link + standalone entity for future
  fruit contracts / AVA / vineyard maps / supply-agreement parsing.
- The linked vendor is not auto-renamed when a grower is renamed (vendor lifecycle stays an admin
  concern) — revisit if partners need name-sync.
