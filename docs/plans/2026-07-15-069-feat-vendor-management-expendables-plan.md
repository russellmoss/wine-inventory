---
title: Vendor management — first-class vendors wired into expendables intake + assistant
type: feat
status: completed
date: 2026-07-15
branch: feat/vendor-management-expendables
depth: deep
units: 12
---

## Overview

Promote "vendor" from two free-text strings on a material into a real, managed entity the
winemaker picks from a fuzzy dropdown when adding an expendable — reusing the Vendor table
that already exists (built in Phase 15 for QuickBooks A/P). Add a proper `/setup/vendors`
CRUD with core contact info + multiple contacts per vendor, make vendor **mandatory** on the
Add/Edit expendable modal (with inline "+ create new vendor" and URL autofill), link vendor
to both the catalog material and each supply-lot purchase, and let the AI assistant create a
vendor too. Outcome: one clean vendor list across the whole app, no more typo'd "Scott Labs"
vs "Scott Laboratories" duplicates, and the vendor a user creates while stocking a shelf is
instantly usable on their accounting bills.

## Problem Frame

Today "vendor" is `CellarMaterial.vendor String?` + `vendorUrl String?` — free text, optional,
typo-prone, and disconnected from the `Vendor` entity accounting already relies on
(`prisma/schema.prisma:3013`). A user can't see their vendors in one place, can't store a
phone number / account number / who to call, and every expendable spells the same supplier a
little differently. Meanwhile accounting has a real `Vendor` table that the expendables flow
never touches, so the same company exists as both a free-text string and a QBO vendor row.

If we do nothing: vendor data stays unstructured and unusable for reporting/contact, and the
two "vendor" concepts keep drifting apart.

**Product pressure-test finding (acted on):** the naive read of the request is "build a new
Vendor table." That would create a *second* vendor list next to the accounting one. Research
confirmed a tenant-scoped, RLS-forced `Vendor` model already exists and is the designated PII
home (invariant D19). The right move — confirmed with the user — is to **extend and reuse it**,
not duplicate. This is a schema-column addition (RLS-neutral) plus one genuinely new child
table (`VendorContact`), not a new top-level entity.

## Requirements

- MUST: Reuse the existing `Vendor` model; extend it with the new fields (columns-only, RLS-neutral).
- MUST: Vendor core required fields = **name, phone, email**. Optional = primary contact name,
  account number (our account #), PO-required flag, payment terms (reuse existing `terms`;
  e.g. "Pay at purchase", "Net 30"), URL, notes.
- MUST: A vendor can have **0..N additional contacts** (new `VendorContact` table), each with
  name, phone/mobile, email, optional role, and a primary/secondary flag.
- MUST: On Add/Edit expendable, Vendor is **mandatory in the UI** (submit blocked without one),
  chosen from a **fuzzy type-to-filter** dropdown, with **"+ Create new vendor" pinned at the
  top** of the list opening an inline creation modal; on save the new vendor is selected.
- MUST: Selecting a vendor **autofills the vendor URL** (URL field becomes derived/read-only).
- MUST: Store `vendorId` on **both** `CellarMaterial` and `SupplyLot` (per-purchase vendor),
  via composite `(tenantId, vendorId) → vendor(tenantId, id)` FKs (K11).
- MUST: Migrate existing free-text `CellarMaterial.vendor` values into real Vendor rows
  (find-or-create by name per tenant); seed a per-tenant **"Unknown / Unspecified"** vendor as
  the fallback so nothing hard-errors and non-UI paths (assistant, receive-supply) stay green.
- MUST: New `create_vendor` assistant write tool (wraps the vendor core; confirmation/nonce
  path; **golden eval case** — hard CI gate). SHOULD: `query_vendors` read tool.
- MUST: New `VendorContact` table follows the full Phase-12 checklist (RLS pair migration,
  composite FK, isolation coverage). Extended `Vendor`/`CellarMaterial`/`SupplyLot` columns are
  RLS-neutral (existing policies cover new columns).
- SHOULD: `/setup/vendors` CRUD page mirroring the equipment setup stack.
- SHOULD: Fuzzy vendor search reuses the in-house engine (`src/lib/inventory/similarity.ts` +
  `material-search.ts`), no new fuzzy dependency.
- NICE: Vendor detail shows which expendables/lots reference it.

## Scope Boundaries

**In scope:**
- Extend `Vendor`; add `VendorContact`; add `vendorId` to `CellarMaterial` + `SupplyLot`.
- Vendor + contact CRUD core/actions, `/setup/vendors` page, reworked `MaterialForm` vendor picker.
- Backfill of legacy free-text vendor; seeded "Unknown" vendor.
- `create_vendor` (+ `query_vendors`) assistant tools with golden coverage.
- Tenant-isolation coverage for the new table + FKs.

**Out of scope:**
- Dropping the legacy `CellarMaterial.vendor`/`vendorUrl` columns. Keep them (dual-read) this
  cycle; a later cleanup plan removes them once everything reads the relation. (Avoids a
  destructive column drop mid-migration.)
- Changing the QBO/accounting posting logic. We only extract the find-or-create into a shared
  core and reuse it; A/P behavior is unchanged.
- Making vendor `NOT NULL` at the DB level (user chose UI-required + Unknown fallback).
- Re-costing or touching cost/ledger logic (vendor is metadata; D17/COST-* untouched).

## Research Summary

### Codebase Patterns
- **Existing Vendor entity (REUSE):** `prisma/schema.prisma:3013-3026` — `model Vendor`, tenant-scoped,
  RLS-forced, `@@unique([tenantId,name])` + `@@unique([tenantId,id])`, fields `name`, `terms`,
  `externalVendorId`. "PII stays here, never in events (D19)." Only consumer today:
  `src/lib/accounting/ap-emit.ts:46-51` (inline find-or-create by name).
- **Vendor lives as free text today:** `CellarMaterial.vendor`/`vendorUrl`
  (`prisma/schema.prisma:1991-1992`); `SupplyLot` has no vendor column (`:2629-2651`). Added by
  columns-only migration `prisma/migrations/20260704120000_material_intake_fields/migration.sql`.
- **Intake modal:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx` (`AddExpendableModal`
  `:405-441`, `EditMaterialModal` `:443-482`) → shared `src/components/cellar/MaterialForm.tsx`
  (`MaterialFormValue` `:32-44`; free-text vendor inputs `:184-185`; `materialFormToInput` `:75-90`;
  `materialFormHasIdentity` `:93`). Submit call sites: `createStockMaterialAction`
  (`ExpendablesClient.tsx:425`), `updateMaterialAction` (`:466`).
- **Intake cores:** `src/lib/cellar/materials.ts` — `createStockMaterialCore` (`:210`, persists
  vendor in `richData` `:237-243`), `updateMaterialCore` (`:281`), `receiveSupplyCore` (`:394`).
  Pure derivation `src/lib/cellar/material-fields.ts` (`MaterialIntakeInput` `:14`,
  `deriveMaterialFields` `:60-88`, `normalizeVendorUrl`). Actions `src/lib/cellar/actions.ts`
  (`createStockMaterialAction` `:83-92`, `updateMaterialAction` `:95-104`).
- **Exemplar tenant-scoped setup CRUD to mirror = Equipment (Plan 053):** model
  `schema.prisma:3457-3473`; migration pair `20260711132000_equipment_schema` +
  `20260711132100_equipment_rls`; core `src/lib/equipment/equipment.ts`; client vocab
  `src/lib/equipment/vocab.ts`; actions `src/lib/equipment/actions.ts`; page
  `src/app/(app)/setup/equipment/{page.tsx,EquipmentClient.tsx}`.
- **Fuzzy + picker primitives (REUSE, no new dep):** `src/lib/inventory/similarity.ts`
  (`similarity`, `closestMatch`), `src/lib/inventory/material-search.ts` (`rankMaterials<T>` with
  a `getText` selector). Combobox base: `src/components/work-orders/MaterialFilterPicker.tsx`;
  **select-with-create + free-text fallback** exemplar: `src/components/cellar/MaterialPicker.tsx`
  (`CreateStockMaterialModal` `:215`). `package.json` has no fuse.js/cmdk/downshift — hand-rolled.
- **Assistant write-tool pattern:** registry `src/lib/assistant/registry.ts` (`AssistantTool`
  `:25-33`, JSON-Schema input, `ALL_TOOLS` `:100-169`, `getToolsFor` role filter). Exemplar
  `src/lib/assistant/tools/create-material.ts` (schema+`run`→`signProposal` → committer
  `commitCreateMaterial` → `createStockMaterialAction`). Committer map `src/lib/assistant/commit.ts`
  (`COMMITTERS`). Confirmation/nonce `src/lib/assistant/confirm.ts` + burn in `commit.ts:120-138`.
  Disambiguation `src/lib/assistant/tools/resolve.ts` (`resolveOneOrChoice`, `signResume`).
  `ToolContext` carries only `{user, lastUserMessage}` — no conversationId.
- **Hard CI gates:** golden write coverage `test/evals/assistant-write-tools.golden.ts` +
  guard `test/evals/assistant-tools.eval.test.ts:96-103` (every write tool needs a golden case);
  tenant isolation `scripts/verify-tenant-isolation.ts` (coverage guard `:66-81`) +
  `test/tenant-isolation.test.ts`; `src/lib/tenant/models.ts` GLOBAL_MODELS denylist (do NOT add
  vendor/vendorcontact).

### Prior Learnings
- `rstack-learnings-search` binary is absent in this env; authoritative history is the plan docs
  + MEMORY.md. Prior expendables/material plans (034/036/037) recorded no learnings-store hits.
- **Windows Prisma/Neon migrations** (`prisma-neon-migrations-windows`): never `migrate dev`
  (interactive + phantom `search_vector` diff). Use `prisma migrate diff` → hand-verify → `migrate
  deploy`. Stop the dev server before `db:generate`. After schema change, `prisma generate` then
  `tsc --noEmit --incremental false` to clear stale `.tsbuildinfo` "column does not exist" ghosts.
- **Build in the MAIN checkout, not `.claude/worktrees/`** (`build-in-main-checkout-not-worktrees`,
  `main-repo-has-env-verify-runs`): worktrees lack `.env`/node_modules, so `verify:*`, DB scripts,
  `next build`, and council Codex can't reach Neon. Branch + PR to protected `main` from the main dir.
- **Columns-only additions to an already-RLS-forced table are RLS-neutral** (subcategory + intake-fields
  precedents) — no new-table checklist for extending `Vendor`/`CellarMaterial`/`SupplyLot`.
- **No enum migration needed:** `terms` is a free string; payment-terms suggestions are UI-only, not a
  Postgres enum, so the "isolated ALTER TYPE first" Windows enum rule is not triggered.
- **`verify:cost` is pre-broken** on orphaned Demo rows — prove cost-inertness via unit tests +
  `verify:work-orders` instead; vendor is metadata and touches no cost path.
- **Identity collision fence (D17):** `CellarMaterial` identity is `@@unique([tenantId,kind,normalizedKey])`.
  This work doesn't change identity — vendorId is additive — so no collision risk, but keep vendor OUT
  of `normalizedKey`.

### External Research
None required — no new libraries; all primitives exist in-repo.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Vendor entity | Reuse + extend existing `Vendor` (Phase 15 QBO) | New separate "Supplier" table | One vendor list app-wide; no duplication; created vendor usable for A/P. User-confirmed. |
| Mandatory strictness | UI-required + seeded per-tenant "Unknown" vendor; DB column stays nullable | DB `NOT NULL` everywhere | Backfill + non-UI paths (assistant, receive-supply) stay green; no hard errors. User-confirmed. |
| Link scope | `vendorId` on **both** `CellarMaterial` and `SupplyLot` | Material-only | Each purchase can record its own vendor over time. User-confirmed. |
| Contacts | Relational `VendorContact` child table (0..N) | Embedded JSON on Vendor | Matches repo conventions; queryable; new table gets full Phase-12 checklist. |
| Payment terms | Reuse existing `Vendor.terms` free string + UI suggestion list | New enum column | `terms` already drives QBO Bill DueDate; avoid enum-migration + QBO blast radius. |
| Legacy columns | Keep `vendor`/`vendorUrl`, dual-read this cycle | Drop immediately | Non-destructive; a later cleanup plan removes them once all reads use the relation. |
| Find-or-create | Extract `ap-emit.ts` inline logic into shared `findOrCreateVendorCore` | Duplicate the logic | Single source of truth; assistant + intake + A/P all reuse it. |
| Vendor URL field | Derived/read-only autofill from selected vendor | Keep editable free text | URL now belongs to the Vendor entity; editing happens in vendor CRUD, not per-material. |

## Implementation Units

### Unit 1: Extend the `Vendor` model with contact/purchasing fields (columns-only, RLS-neutral)

**Goal:** Give the existing Vendor entity the fields the feature needs, without a new table.
**Files:** `prisma/schema.prisma` (model `Vendor` ~`:3013`), new migration
`prisma/migrations/<ts>_vendor_management_fields/migration.sql`.
**Approach:** Add nullable/defaulted columns: `phone String?`, `email String?`, `contactName
String?`, `accountNumber String?`, `poRequired Boolean @default(false)`, `url String?`,
`notes String?`, `isActive Boolean @default(true)`. Keep `terms` as the payment-terms field.
Migration is plain `ALTER TABLE "vendor" ADD COLUMN ...` (RLS-neutral — existing `tenant_isolation`
policy covers new columns; mirror `20260704120000_material_intake_fields`). Follow the Windows
migration flow (diff → verify → deploy; regenerate client with dev server stopped).
**Tests:** Prisma types compile (`tsc --noEmit --incremental false`); no schema-diff drift.
**Depends on:** none
**Patterns to follow:** `prisma/migrations/20260704120000_material_intake_fields/migration.sql`.
**Verification:** `npx prisma migrate diff` shows only the new columns; `npm run db:generate` clean.

### Unit 2: New `VendorContact` child table (full Phase-12 checklist + RLS pair migration)

**Goal:** Store 0..N additional contacts per vendor, tenant-isolated.
**Files:** `prisma/schema.prisma` (new `model VendorContact`), migration pair
`prisma/migrations/<ts>_vendor_contact_schema/migration.sql` +
`prisma/migrations/<ts+1>_vendor_contact_rls/migration.sql`.
**Approach:** Model: `tenantId String @default("")` (first col), `id`, `vendorId String`,
`name String`, `role String?`, `phone String?`, `mobile String?`, `email String?`,
`isPrimary Boolean @default(false)`, timestamps. Relation to `Vendor`. `@@index([tenantId])`,
`@@index([tenantId, vendorId])`, `@@unique([tenantId, id])`. Schema migration: tenantId col+index,
promote `(tenantId,id)` unique-index to constraint, FK `tenantId→organization(id)` ON DELETE
RESTRICT, and **composite** FK `(tenantId, vendorId) → vendor(tenantId, id)` (K11, raw SQL). RLS
migration: `ENABLE` + `FORCE` + `tenant_isolation` USING+WITH CHECK on
`current_setting('app.tenant_id', true)`, app_rls DML grant, and the `DO $$ ... RAISE EXCEPTION`
guard block. Do **not** add to GLOBAL_MODELS.
**Tests:** covered by Unit 12 isolation additions.
**Depends on:** Unit 1
**Patterns to follow:** `prisma/migrations/20260711132000_equipment_schema` +
`20260711132100_equipment_rls`; AGENTS.md Phase-12 checklist steps 1–8.
**Verification:** `npm run verify:tenant-isolation` coverage guard passes (recognizes the new table).

### Unit 3: Add `vendorId` to `CellarMaterial` and `SupplyLot` (composite K11 FKs)

**Goal:** Link catalog materials and individual purchases to a real vendor.
**Files:** `prisma/schema.prisma` (models `CellarMaterial` ~`:1975`, `SupplyLot` ~`:2629`),
migration `prisma/migrations/<ts>_material_supplylot_vendor_fk/migration.sql`.
**Approach:** Add `vendorId String?` to both. In raw SQL add composite FKs
`(tenantId, vendorId) → vendor(tenantId, id)` ON DELETE RESTRICT (matches `ap_export_event.vendorId`
precedent) plus `@@index([tenantId, vendorId])`. Keep legacy `vendor`/`vendorUrl` on
`CellarMaterial`. Columns-only on RLS-forced tables → RLS-neutral.
**Tests:** compile; cross-tenant FK rejection added in Unit 12.
**Depends on:** Unit 1
**Patterns to follow:** `ApExportEvent` vendorId composite FK (`schema.prisma:3028`).
**Verification:** migrate diff shows only the columns + FKs + index.

### Unit 4: Backfill legacy free-text vendors + seed per-tenant "Unknown" vendor

**Goal:** No expendable is left vendorless; legacy strings become real vendors.
**Files:** `scripts/backfill-material-vendors.ts` (new), reuse in
`prisma/seed*`/`npm run seed:demo-*` as appropriate.
**Approach:** For each tenant (via `runAsSystem` iterating orgs, then `runAsTenant` per tenant):
seed an idempotent `"Unknown / Unspecified"` vendor (find-or-create by name). For each
`CellarMaterial` with a non-empty legacy `vendor` string, find-or-create a Vendor by trimmed name
(map `vendorUrl` → `Vendor.url` when the vendor has none yet) and set `CellarMaterial.vendorId`;
blanks → the Unknown vendor. Backfill `SupplyLot.vendorId` from its material's resolved vendor.
Idempotent + re-runnable. This is a data script, not a schema migration (keeps the FK migration clean).
**Tests:** run against Demo Winery; assert every material has a `vendorId` and vendor names deduped.
**Depends on:** Units 2, 3, 5 (uses `findOrCreateVendorCore`)
**Patterns to follow:** `runAsTenant`/`runAsSystem` script entrypoints (AGENTS.md); find-or-create
from `ap-emit.ts:46-51`.
**Verification:** post-run query in `runAsTenant("org_demo_winery", …)` shows 0 null `vendorId`.

### Unit 5: Vendor + VendorContact core CRUD module (+ refactor A/P find-or-create)

**Goal:** One place for vendor reads/writes; reuse across intake, setup, assistant, A/P.
**Files:** `src/lib/vendors/vendors.ts` (new cores), `src/lib/vendors/vendors-shared.ts` (client-safe
DTO/vocab, no server imports), `src/lib/vendors/actions.ts` (server actions), refactor
`src/lib/accounting/ap-emit.ts:46-51` to call the shared `findOrCreateVendorCore`.
**Approach:** Cores (each `actor`-first, `runInTenantTx`, `writeAudit`): `findOrCreateVendorCore`,
`createVendorCore`, `updateVendorCore`, `archiveVendorCore` (soft via `isActive`), `getVendor`,
`listVendors` (active-first), and contact cores `addVendorContactCore`/`updateVendorContactCore`/
`removeVendorContactCore` (enforce at most one `isPrimary`). Validate name/phone/email
(email/phone format; name required). Actions use ready-user `action(...)` for create/list (used from
the non-admin expendables flow) and `adminAction(...)` for destructive archive/delete on
`/setup/vendors`; revalidate `/setup/vendors`, `/setup/expendables`. Mirror the Equipment stack
split (core vs vocab vs actions). Extract find-or-create so A/P and intake share exact semantics.
**Tests:** unit tests for `findOrCreateVendorCore` (dedup by tenant+name), single-primary-contact
enforcement, and validation rejects.
**Depends on:** Units 1, 2
**Patterns to follow:** `src/lib/equipment/{equipment.ts,vocab.ts,actions.ts}`;
`src/lib/cellar/actions.ts:83-104` gating pattern.
**Verification:** `tsc` + new vendor unit tests green; `ap-emit` behavior unchanged
(`verify:commerce7`/accounting tests still pass).

### Unit 6: Thread `vendorId` through material + supply-lot intake cores

**Goal:** Persist the chosen vendor on the material and its opening/received lot.
**Files:** `src/lib/cellar/material-fields.ts` (`MaterialIntakeInput` `:14`, `deriveMaterialFields`
`:60-88`, `MaterialUpdateFields`), `src/lib/cellar/materials.ts` (`createStockMaterialCore` `:210`,
`updateMaterialCore`/`planMaterialUpdate` `:281`, `receiveSupplyCore` `:394` opening-lot seed).
**Approach:** Add `vendorId?: string | null` to `MaterialIntakeInput`, `MaterialUpdateFields`, and
`ReceiveSupplyInput`. Carry through `deriveMaterialFields`; persist in `createStockMaterialCore`
create block and `planMaterialUpdate` fields; stamp `SupplyLot.vendorId` when seeding the opening
lot and in `receiveSupplyCore`. Mirror vendor `name`/`url` into legacy `vendor`/`vendorUrl` columns
for read-compat this cycle (dual-write; relation is source of truth). Leave `receiveSupplyCore`'s
existing free-text `vendorName`→QBO path intact, but also resolve/set `vendorId` from it via
`findOrCreateVendorCore` so lots get a real link.
**Tests:** `deriveMaterialFields` carries `vendorId`; create/update persist it; opening lot stamps it.
**Depends on:** Units 3, 5
**Patterns to follow:** existing vendor free-text threading in the same functions.
**Verification:** unit tests + a `runAsTenant` script confirming a created material + lot carry `vendorId`.

### Unit 7: `VendorPicker` — fuzzy select-with-create combobox + `rankVendors`

**Goal:** The mandatory, fuzzy, "+ create new" dropdown the expendables modal needs.
**Files:** `src/components/vendors/VendorPicker.tsx` (new), `src/lib/inventory/vendor-search.ts`
(new `rankVendors`, thin wrapper over `rankMaterials` engine).
**Approach:** Fork `MaterialPicker`/`MaterialFilterPicker`. Search box → `rankVendors(query, vendors,
v => [v.name, v.contactName, v.email])`; scrollable option rows; selected-chip-with-Change. Pin a
**"+ Create new vendor"** row at the **top** of the results (always visible, even with a query — so
the typed name can prefill the create modal). Selecting a vendor calls `onSelect(vendor)` (parent
autofills URL). Clicking "+ create" opens the Unit-8 modal; on save, select the returned vendor.
Design-token styled, no new deps.
**Tests:** `rankVendors` unit tests (substring-wins, edit-distance, "+create" always first).
**Depends on:** Unit 5 (vendor DTO)
**Patterns to follow:** `src/components/cellar/MaterialPicker.tsx` (select-with-create),
`src/components/work-orders/MaterialFilterPicker.tsx` (combobox), `material-search.ts:rankMaterials`.
**Verification:** Storybook/manual render + rankVendors tests; picker shows "+ create" atop matches.

### Unit 8: `VendorForm` / `CreateVendorModal` (core fields + repeatable contacts)

**Goal:** One reusable vendor form for inline-create and the setup page.
**Files:** `src/components/vendors/VendorForm.tsx` (new), `src/components/vendors/CreateVendorModal.tsx`
(new thin wrapper).
**Approach:** Required: name, phone, email (client validation + submit gate). Optional: contactName,
accountNumber, poRequired (checkbox), terms (text with a suggestion `<datalist>`: "Pay at purchase",
"Net 15", "Net 30", "Net 60"), url, notes. A repeatable **contacts** section (add/remove rows; each
name/role/phone/mobile/email + "primary" radio; exactly one primary). On submit calls
`createVendorAction`/`updateVendorAction` (+ contact cores). `CreateVendorModal` accepts an optional
`initialName` (from the picker's typed query) and returns the created vendor to its opener.
**Tests:** validation gating (missing name/phone/email blocks); single-primary enforcement in UI.
**Depends on:** Unit 5
**Patterns to follow:** `src/components/cellar/MaterialForm.tsx` structure;
`CreateStockMaterialModal` in `MaterialPicker.tsx` for the inline-create-and-return handshake.
**Verification:** manual add-with-2-contacts round-trips; reject on blank required field.

### Unit 9: Rework `MaterialForm` — mandatory vendor picker + URL autofill

**Goal:** Replace the two free-text vendor inputs with the picker; enforce mandatory; autofill URL.
**Files:** `src/components/cellar/MaterialForm.tsx` (`:32-44`, `:75-93`, `:184-185`),
`src/app/(app)/setup/expendables/ExpendablesClient.tsx` (`AddExpendableModal` `:405`, `EditMaterialModal`
`:443`, submit sites `:425`/`:466`), `src/app/(app)/setup/expendables/page.tsx` (pass `listVendors()`).
**Approach:** In `MaterialFormValue` replace `vendor`/`vendorUrl` strings with `vendorId: string`
(+ keep a derived read-only `vendorUrl` for display). Render `VendorPicker` where the two inputs were;
URL becomes a read-only line populated from the selected vendor. Update `emptyMaterialForm`,
`materialToForm` (seed from `material.vendorId`), `materialFormToInput` (emit `vendorId`),
`materialFormHasIdentity` → also require `vendorId`. `page.tsx` fetches vendors and threads them +
an `onVendorCreated` refresh into both modals (`router.refresh()` after inline create). Thread
`vendorId` into `createStockMaterialAction`/`updateMaterialAction` payloads.
**Tests:** form helper unit tests (`materialFormToInput` emits `vendorId`; submit gated on it).
**Depends on:** Units 6, 7, 8
**Patterns to follow:** existing `MaterialForm` add/edit wiring; `router.refresh()`-after-write rule.
**Verification:** browser QA on `/setup/expendables` — add blocked until a vendor is picked; URL
autofills; inline "+ create new vendor" creates + selects; edit shows the current vendor.

### Unit 10: `/setup/vendors` CRUD page

**Goal:** A place to see and manage all vendors + their contacts.
**Files:** `src/app/(app)/setup/vendors/page.tsx` (new), `src/app/(app)/setup/vendors/VendorsClient.tsx`
(new), nav wiring (wherever `/setup/*` links live).
**Approach:** Server `page.tsx` (`requireReadyUser`, `listVendors()`) → `VendorsClient` with a searchable
list (reuse `rankVendors`), add/edit via the Unit-8 `VendorForm`, archive (soft), and per-vendor contact
management. Mirror the Equipment setup surface.
**Tests:** none beyond manual; logic already unit-tested in cores.
**Depends on:** Units 5, 7, 8
**Patterns to follow:** `src/app/(app)/setup/equipment/{page.tsx,EquipmentClient.tsx}`.
**Verification:** browser QA — create/edit/archive a vendor + add/remove contacts; list search works.

### Unit 11: Assistant `create_vendor` (+ `query_vendors`) tools with golden coverage

**Goal:** Create/list vendors by chatting with the assistant.
**Files:** `src/lib/assistant/tools/create-vendor.ts` (new: tool + committer),
`src/lib/assistant/tools/query-vendors.ts` (new read tool), `src/lib/assistant/registry.ts` (import +
`ALL_TOOLS`), `src/lib/assistant/commit.ts` (import + `COMMITTERS`),
`test/evals/assistant-write-tools.golden.ts` (+ read golden if adding `query_vendors`).
**Approach:** Mirror `create-material.ts`: JSON-Schema `inputSchema` (`required:["name"]`; optional
phone/email/contactName/accountNumber/poRequired/terms/url); `run()` builds a preview and
`signProposal("create_vendor", …)`; `commitCreateVendor` maps args → `createVendorAction`. Reuse
`resolveOneOrChoice` to offer "did you mean existing vendor X?" before creating a near-duplicate
(dedup via `rankVendors`/`similarity`). `query_vendors` is a thin `kind:"read"` wrapper over
`listVendors`. Add ≥1 `create_vendor` golden case (HARD CI gate) and a `query_vendors` read golden.
**Tests:** golden structural eval passes; coverage guard sees `create_vendor`.
**Depends on:** Unit 5
**Patterns to follow:** `src/lib/assistant/tools/{create-material.ts,receive-supply.ts,resolve.ts}`;
`commit.ts` COMMITTERS map; `test/evals/assistant-tools.eval.test.ts` gates.
**Verification:** `npm run eval:assistant` green; assistant creates a vendor end-to-end (confirm card → commit).

### Unit 12: Tenant-isolation coverage + cross-tenant FK rejection tests

**Goal:** Prove the new table + FKs are leak-proof.
**Files:** `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`.
**Approach:** Add explicit A/B fixtures + assertions for `VendorContact` (owner-seed a B-tenant
contact; assert A can't read it; assert foreign-tenant INSERT raises via WITH CHECK). Add
cross-tenant composite-FK rejection checks: a `CellarMaterial`/`SupplyLot`/`VendorContact` referencing
a vendor from another tenant must be rejected. (The coverage guard already auto-catches a missing RLS
policy — these are the explicit belt-and-braces cases.)
**Tests:** the added cases themselves.
**Depends on:** Units 2, 3
**Patterns to follow:** existing equipment/compliance cases in both files
(`verify-tenant-isolation.ts:226-229,540-555`; `test/tenant-isolation.test.ts:358,466`).
**Verification:** `npm run verify:tenant-isolation` (and `TENANT_ISOLATION_DB=1` test) green.

## Test Strategy

**Unit tests:** vendor cores (find-or-create dedup, single-primary contact, validation),
`rankVendors`, `materialFormToInput`/`deriveMaterialFields` vendorId threading. Vitest, mirroring
`test/` conventions.
**Integration / DB:** `runAsTenant("org_demo_winery", …)` scripts prove (a) backfill leaves 0 null
`vendorId`, (b) a created material + its opening lot carry `vendorId`, (c) A/P find-or-create still
dedups. Tenant isolation via `verify:tenant-isolation` + gated `tenant-isolation.test.ts`.
**Assistant:** `npm run eval:assistant` structural gate (golden case for `create_vendor`).
**Manual verification (browser, Demo Winery only, QA-* fixtures):** `/setup/expendables` add flow
(mandatory picker, fuzzy filter, "+ create new" atop list, URL autofill, edit shows current vendor);
`/setup/vendors` CRUD + contacts; assistant "add a new vendor Scott Labs, Net 30" → confirm → created.
**Regression:** full `tsc --noEmit --incremental false`, `next build`, existing vitest suite,
accounting/`verify:commerce7` unchanged.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reusing the QBO Vendor table changes A/P behavior | LOW | HIGH | Only extract find-or-create into a shared core (same semantics); no posting change; accounting tests must stay green. |
| Backfill mis-maps/duplicates legacy vendor strings | MED | MED | find-or-create by trimmed name per tenant; idempotent; seed "Unknown" for blanks; verify 0-null + dedup on Demo before prod. |
| Mandatory vendor breaks a non-UI create path | MED | MED | DB stays nullable; assistant/receive-supply resolve to a vendor (or Unknown); only the UI hard-gates. |
| Windows migration hazards (phantom diff, stale tsbuildinfo) | MED | MED | migrate diff → verify → deploy; `tsc --incremental false`; stop dev server before generate. Build in MAIN checkout. |
| New write tool ships without golden → CI red | LOW | MED | Unit 11 adds the golden case; coverage guard verified locally via `eval:assistant`. |
| VendorContact RLS/FK missed a step → leak or broken FK | LOW | HIGH | Follow equipment migration pair verbatim; Unit 12 explicit cross-tenant checks + guard. |
| Legacy `vendor`/`vendorUrl` dual-write drifts from relation | LOW | LOW | Relation is source of truth; dual-write is display-compat only; scheduled removal in a follow-up. |

## Success Criteria

- [x] Existing `Vendor` table extended (columns-only, RLS-neutral); `VendorContact` table added with
      full Phase-12 RLS + composite FK; `vendorId` on `CellarMaterial` + `SupplyLot`. (migrations applied to Neon)
- [x] Backfill run: every expendable has a real `vendorId`; blanks → seeded "Unknown" vendor; no dupes.
      (Demo Winery: 54 materials, 106 lots, 0 remaining NULLs)
- [x] Add/Edit expendable requires a vendor, offers fuzzy search, "+ create new vendor" pinned on top,
      inline create selects the new vendor, and URL autofills from the selection. (code complete; browser QA pending)
- [x] `/setup/vendors` CRUD works incl. multiple contacts per vendor. (code complete; browser QA pending)
- [x] Assistant `create_vendor` (confirm/nonce) creates a vendor; golden case present; `query_vendors` lists.
- [x] `npm run verify:tenant-isolation` green (incl. new table + cross-tenant FK checks). (110/110 tables)
- [x] `npm run eval:assistant` green; A/P find-or-create behavior unchanged.
- [x] `tsc --noEmit`, `next build`, and the full vitest suite pass (2034 tests); no regressions.

**Status:** all 12 units built + committed on `claude/expendables-vendor-management-f55df8`. Remaining:
interactive browser QA of the expendables picker + `/setup/vendors` (needs an authenticated pane), then `/review` + `/ship`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET -- run `/autoplan` for full review pipeline, or individual reviews above.
