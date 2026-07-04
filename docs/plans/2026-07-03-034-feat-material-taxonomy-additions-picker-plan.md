---
title: Material taxonomy (main category + customizable subcategory) and a filtered/fuzzy additions picker
type: feat
status: completed
date: 2026-07-03
branch: feat/material-taxonomy-additions-picker
depth: standard
units: 9
---

## Overview

Give the expendables/inventory catalog a two-level taxonomy — a controlled **main category** (Additive,
Cleaning & Sanitizing, Packaging, Other) plus a **customizable subcategory** (yeast, bacteria, fining,
tannin, acid, sugar, "type-your-own") — and use it to turn the flat work-order additions material
`<select>` into a grouped picker with **filter buttons** (same UX as the vessel Tanks/Barrels filter)
and **fuzzy search**. A cellar hand issuing an additions work order can then narrow to "fining agents",
or fuzzy-type "kmbs", and land on the right product in seconds instead of scrolling one alphabetical list.

## Problem Frame

Today every material carries a single flat, code-controlled `kind` (`MATERIAL_KINDS`), and the additions
picker (`ExecuteClient.tsx`, `NewWorkOrderClient.tsx`) is a plain alphabetical `<select>` over *all*
active materials — including cleaning and (soon) packaging items that you never dose into wine. Finding
the right additive means scrolling noise. The winery also can't organize additives into their own
groups or invent groups that match how they actually think about the shelf.

Do nothing → the picker gets worse as the catalog grows, and there's no way to shape inventory into the
operator's mental model. This is a real daily-friction problem for the person standing at the tank.

**Product note:** the operator's mental model is "pick the main category, then the subcategory." The
existing `kind` field already encodes most additive subcategories (YEAST/FINING/TANNIN/ACID/…), so we
reuse it as the built-in subcategory layer and add a thin customizable layer on top, rather than
inventing a parallel taxonomy that duplicates it.

## Requirements

- MUST: Materials have a **main category** — controlled set {Additive, Cleaning & Sanitizing, Packaging, Other}.
- MUST: The main split (additive vs cleaning/sanitizing) stays authoritative for cost routing — cleaning/
  sanitizing is OVERHEAD, additives capitalize (invariant WORKORDER-3). No change to that behavior.
- MUST: Materials support a **subcategory** that the user can freely create by typing a new name; new
  names immediately become filter buttons wherever the taxonomy is shown.
- MUST: The additions work-order picker (both the plan flow and the execute flow) shows **filter buttons**
  by subcategory and a **fuzzy search** box, and defaults to additive-family materials only.
- MUST: Packaging becomes a real tracked inventory category (corks, capsules, bottles, labels, …) that can
  be created and organized in the expendables catalog.
- MUST: No regression to dosing math, ledger writes, cost roll-up, or tenant isolation.
- SHOULD: Suggest-as-you-type / fuzzy match on subcategory entry so custom names don't fragment into
  near-duplicate buttons ("Fining agent" vs "Fining agents").
- SHOULD: The expendables management list groups by main category → subcategory.
- NICE: The new picker component is reusable (category-scoped) so other flows can adopt it later.

## Scope Boundaries

**In scope:**
- One new nullable `subcategory` column on `CellarMaterial` (columns-only migration).
- Extend the `MATERIAL_KINDS` controlled vocabulary with `PACKAGING` and `SUGAR` (no migration — it's a
  validated String, per D4).
- A pure, client-safe taxonomy module (main-category-from-kind map, labels, effective-subcategory rule).
- A reusable filtered + fuzzy material picker component; wired into the two additions call-sites.
- Subcategory entry + category/subcategory grouping in the expendables management UI and the picker's
  "create new stock item" modal.

**Out of scope (and why):**
- **Wine as an inventory category.** Wine is a lot / finished good in a different model, not a
  `CellarMaterial`. Not part of the expendables taxonomy.
- **Packaging *consumption* accounting at bottling** (packaging → finished-goods COGS). This plan makes
  packaging *organizable/stockable* in the catalog; wiring packaging draw-down into the bottling cost path
  is a separate effort. Packaging materials are never dosed as additions, so they never enter the addition
  cost DAG here.
- **A full subcategory admin table** (create/rename/merge/reorder managed records). User chose the
  lighter "type-your-own free-text" model; a managed registry is a possible fast-follow.
- **Repurposing or removing `kind`.** It stays the load-bearing cost/dosing/identity field, untouched.

## Research Summary

### Codebase Patterns
- **Material model:** `prisma/schema.prisma:1558-1582` — `model CellarMaterial`, already tenant-scoped
  (`tenantId`, RLS FORCE + policy) with `@@unique([tenantId, kind, normalizedKey])`, `@@unique([tenantId, id])`.
  `kind String` (line 1563) is the only classifier. No enum, no subcategory. Adding a column is a
  columns-only migration (precedent: Phase 14 v1.1, AGENTS.md:80-86); no new-table checklist needed.
- **Controlled vocab:** `src/lib/cellar/additions-math.ts:24-39` — `MATERIAL_KINDS` const
  (YEAST, MLF, SO2, NUTRIENT, ACID, TANNIN, FINING, BENTONITE, CHITOSAN, ENZYME, CLEANING, SANITIZER, OTHER).
  Adding a value = extend the array, **no migration** (D4). `coerceMaterialKind` (`material-normalize.ts:20-23`)
  maps unknown → OTHER.
- **Client/server split:** client-safe DTOs + `STOCK_UNITS` in `src/lib/cellar/materials-shared.ts`;
  server data funcs in `materials.ts`. Taxonomy pure logic must live in a client-safe module (no prisma).
- **Data query for pickers:** `src/lib/work-orders/data.ts` `getWorkOrderPickers()` (434-451) selects only
  `{id,name,stockUnit}` for materials (line 438) and maps to `{id,label,unit}` (447). `PickerOption` (431)
  already has an optional `kind` slot; add `subcategory`.
- **Additions picker call-sites (flat `<select>`):** `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx`
  `renderField()` lines 36-48; `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx` lines 75-85. Both
  render `type==="material"` as a flat select over `pickers.materials`. Picker only needs to emit `materialId`.
- **Dose flow:** `template-vocabulary.ts:69-76` (ADDITION) / 82-84 (FINING) — the material field emits one
  `materialId`; `amount`+`doseUnit` are separate fields. `execute.ts:102-117` builds the input and calls
  `recordNeutralDoseTx`. Nothing about the picker's grouping touches dosing math.
- **Vessel filter-button pattern to copy:** `src/app/(app)/work-orders/new/VesselMultiSelect.tsx` — local
  `useState` for filter (`"ALL"|"TANK"|"BARREL"`) + search string, pill `<button>`s via `filterBtn(active)`
  (line 15) using design tokens (`--wine-primary`, `--border`, `--surface-raised`, `--text-secondary`),
  substring match (line 36). No shared Chip/SegmentedControl primitive exists — hand-rolled with tokens.
- **Fuzzy engine (reuse, no dep):** `src/lib/inventory/similarity.ts` — pure `normalize`, `levenshtein`,
  `similarity` (prefix/abbreviation floor 0.85), `closestMatch(value,candidates,{threshold})`. No fuse.js in
  the repo. VesselMultiSelect uses plain `.includes()` — we upgrade the material picker to real fuzzy.
- **Management UI:** `src/app/(app)/setup/expendables/{page.tsx,ExpendablesClient.tsx}` — `AddSupplyForm`
  (kind `<select>` over `MATERIAL_KINDS`), rows grouped by kind (`byKind`), `KIND_LABELS`. Actions:
  `createStockMaterialAction`/`upsertMaterialAction` (`src/lib/cellar/actions.ts:65-82`) → cores in
  `materials.ts` (`createStockMaterialCore` 148-195, `upsertMaterialCore` 82-128). On-the-fly create:
  `src/components/cellar/MaterialPicker.tsx`.
- **Shared UI primitives** (`src/components/ui/`): `Button`, `Input`, `Badge`, `Modal`, etc. No Chip /
  SegmentedControl / Combobox — build filter chips hand-rolled with tokens like VesselMultiSelect.

### Prior Learnings
- rstack learnings tool returned nothing for this topic. Context-ledger Phase-6 pending note explicitly
  anticipated this: "turn the free-text material catalog into a stock dropdown by kind" (Phase 8) → now the
  MaterialPicker; this plan extends that.
- Windows enum rule (AGENTS.md:83-84): a new Postgres enum value needs an isolated `ALTER TYPE` migration
  committed before use. **Not triggered here** — `kind`/`subcategory` are String, not Postgres enums.
- Prisma/Neon on Windows (MEMORY `prisma-neon-migrations-windows`): avoid `migrate dev` (interactive +
  phantom `search_vector` diff); use `migrate diff` → `deploy`; stop the dev server before `db:generate`.

### Constraining Invariants
- **WORKORDER-3** — cleaning/sanitizing supply use is OVERHEAD, never wine COGS; this is *why*
  CLEANING/SANITIZER are distinct kinds. Main-category = derived from kind must keep them separate from
  additives. Do not let PACKAGING accidentally read as either wine COGS or overhead via a dose (it's never dosed).
- **WORKORDER-1/2** — completion writes the immutable op via `…Tx` cores in one `runLedgerWrite`;
  reservations advisory. The picker only chooses `materialId`; none of this changes.
- **Cost roll-up (Phase 8, `cost/data.ts` `isComponentCapitalized`)** — MATERIAL/DOSAGE always capitalize;
  unknown unit cost → UNKNOWN, never silent $0. Adding new kinds must not perturb this for dosed materials.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Main category storage | **Derived in code from `kind`** (map), not a stored column | Add a stored controlled `category` column + backfill | Existing kinds already imply category; deriving avoids a second controlled field, a backfill, and drift between two fields. Packaging fits by adding a `PACKAGING` kind. |
| Subcategory storage | **New nullable free-text `subcategory` column** on `CellarMaterial` | Managed subcategory table; overload `kind` | User chose "type-your-own." A free column is columns-only (no new-table/RLS work), delivers real customization; filter buttons come from distinct values. |
| Built-in subcategories | **Reuse `kind`** as the built-in subcategory layer; `subcategory` refines/overrides for display | Parallel curated subcategory list | Avoids duplicating YEAST/FINING/… that already exist as `kind`. |
| Effective grouping key | `subcategory ?? builtinSubLabel(kind)` | subcategory only (leaves additives ungrouped until tagged) | Gives built-in groups for free; custom groups when set. No backfill needed. |
| New kinds | Add `PACKAGING`, `SUGAR` to `MATERIAL_KINDS` const | Postgres enum | String vocab (D4) → no migration, no Windows-enum-rule. |
| Fuzzy search | Reuse `src/lib/inventory/similarity.ts` | Add fuse.js | Pure, in-repo, no new dep; already has prefix/abbreviation floor good for "kmbs". |
| Picker component | New reusable **category-scoped** client component, modeled on `VesselMultiSelect` | Extend existing `MaterialPicker.tsx` in place | Additions picker needs single-select + two-tier filter; a scoped component is reusable and keeps `MaterialPicker` (datalist create-new) focused. |
| Additions picker scope | Default to **Additive** family (hide cleaning/packaging) | Show all materials | You don't dose cleaning/packaging; also fixes today's noise in the dose dropdown. |
| `kind` field | **Untouched** (still cost/dosing/identity driver) | Repurpose kind as subcategory | It's load-bearing and part of `@@unique`; changing it is high-risk for zero benefit. |

## Implementation Units

### Unit 1: Taxonomy vocabulary + pure logic
**Goal:** Establish the two-level taxonomy in pure, client-safe code.
**Files:** `src/lib/cellar/additions-math.ts` (extend `MATERIAL_KINDS` with `PACKAGING`, `SUGAR`);
new `src/lib/cellar/material-taxonomy.ts`; `test/material-taxonomy.test.ts`.
**Approach:** In the new module (no prisma / no React imports) define `MATERIAL_CATEGORIES`
(`ADDITIVE | CLEANING_SANITIZING | PACKAGING | OTHER`) with `CATEGORY_LABELS`; `categoryOf(kind)` mapping
(additive kinds incl. SUGAR → ADDITIVE; CLEANING/SANITIZER → CLEANING_SANITIZING; PACKAGING → PACKAGING;
OTHER → OTHER); `builtinSubLabel(kind)` (e.g. MLF → "Bacteria (MLF)", YEAST → "Yeast"); and
`effectiveSubcategory({kind,subcategory})` = `subcategory?.trim() || builtinSubLabel(kind)`. Keep
`coerceMaterialKind` mapping unknown → OTHER.
**Tests:** category mapping for every kind incl. new ones; effective-subcategory precedence (custom over
built-in); label coverage (no kind falls through).
**Depends on:** none
**Patterns to follow:** `additions-math.ts` const-array style; `material-normalize.ts` coercions.
**Verification:** `npm test -- material-taxonomy` green; `npx tsc --noEmit` clean.

### Unit 2: Add `subcategory` column (columns-only migration)
**Goal:** Persist a free-text subcategory on materials.
**Files:** `prisma/schema.prisma` (`CellarMaterial.subcategory String?`); new migration under
`prisma/migrations/` (single `ALTER TABLE "cellar_material" ADD COLUMN "subcategory" TEXT`).
**Approach:** Follow the columns-only precedent (AGENTS.md:80-86). No new index/FK/unique — subcategory is
not part of identity. `CellarMaterial` is already RLS FORCE + `app_rls` has table-level DML, which covers
new columns. Generate with the Windows flow: `prisma migrate diff` → hand-write/verify SQL → `migrate deploy`;
stop the dev server before `db:generate`. Confirm no phantom `search_vector` diff sneaks in.
**Tests:** none new here (schema); confirm existing `test/tenant-isolation.test.ts` CellarMaterial cases
(158, 296) still pass — no change expected since the column rides the existing table policy.
**Depends on:** none (can land alongside Unit 1)
**Verification:** `npm run db:generate` clean; `npm run build` type-checks the new field; a quick
`runAsTenant` write/read of `subcategory` in a scratch script (or existing verify) round-trips.

### Unit 3: Materials data layer accepts/exposes subcategory + category
**Goal:** Read, write, and expose the taxonomy through the material data functions and DTO.
**Files:** `src/lib/cellar/materials-shared.ts` (add `subcategory: string | null` and derived
`category`/`effectiveSubcategory` helpers to the DTO surface); `src/lib/cellar/materials.ts`
(`toDTO`, `listMaterials` optional `category` filter, `createStockMaterialCore`, `upsertMaterialCore` +
their `*Input` types accept `subcategory?`); `src/lib/cellar/actions.ts` (thread `subcategory`).
**Approach:** Persist `subcategory` on create/upsert (trim; empty → null). `toDTO` includes `subcategory`;
DTO consumers derive category/effective-sub via Unit 1 (keep DTO client-safe — import only from
`material-taxonomy.ts`). `listMaterials({category})` filters by mapping category → the set of kinds
(server-side `where: { kind: { in: kindsForCategory } }`) so it composes with the existing `kind` filter.
**Tests:** extend `test/` material tests: create with a custom subcategory round-trips; `listMaterials({category:'ADDITIVE'})`
excludes cleaning/packaging.
**Depends on:** Unit 1, Unit 2
**Verification:** targeted material tests green; `npm run verify:cost` still green (DTO/consume unaffected).

### Unit 4: Fuzzy ranking helper for material search
**Goal:** A small pure helper to rank/filter materials by a query, reusing the similarity engine.
**Files:** `src/lib/inventory/similarity.ts` (confirm/extend API if needed); new
`src/lib/inventory/material-search.ts` (`rankMaterials(query, items, {threshold})` → filtered+sorted);
`test/material-search.test.ts`.
**Approach:** Normalize query + candidate name; combine substring hit (rank first) with `similarity` score
and the abbreviation/prefix floor so "kmbs" → "Potassium Metabisulfite (KMBS)". Return items above threshold
sorted by score; empty query → identity order (name asc). Pure, no React/DB.
**Tests:** exact, prefix, abbreviation, typo, and no-match cases; stable ordering.
**Depends on:** none
**Verification:** `npm test -- material-search` green.

### Unit 5: Reusable filtered + fuzzy material picker component
**Goal:** The grouped, filter-button + fuzzy-search single-select picker.
**Files:** new `src/components/work-orders/MaterialFilterPicker.tsx` (client).
**Approach:** Model on `VesselMultiSelect.tsx` (local `useState`, pill `filterBtn(active)` using design
tokens — no hardcoded colors). Props: `options` (materials with `kind`+`subcategory`+on-hand+unit),
`categoryScope` (default `ADDITIVE`), `value`, `onChange`. Compute effective subcategory per option (Unit 1),
render subcategory filter chips (built-in + custom, "All" first) derived from the options in scope, plus a
search `<input>` driving `rankMaterials` (Unit 4). Show on-hand + subcategory beside each option; selecting a
zero-stock item stays allowed (D14 unknown-cost flag preserved). Single-select emits `materialId`.
**Tests:** component/logic test if a harness exists, else cover the pure filter/rank via Unit 4 and verify
render manually in Unit 9.
**Depends on:** Unit 1, Unit 4
**Patterns to follow:** `VesselMultiSelect.tsx:14-67` (chip/filterBtn/search), design tokens only (DESIGN.md).
**Verification:** renders in the app (Unit 9); lint/tsc clean.

### Unit 6: Wire the picker into both additions flows + picker data
**Goal:** Replace the flat `<select>` with `MaterialFilterPicker` in the plan and execute flows.
**Files:** `src/lib/work-orders/data.ts` (`getWorkOrderPickers` materials select add `kind, subcategory`;
map into `PickerOption`; extend `PickerOption` type with `subcategory?`); `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx`
(36-48); `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx` (75-85).
**Approach:** For `type==="material"`, render `MaterialFilterPicker` (scope ADDITIVE) instead of the raw
select; keep emitting `materialId` into the same field so `execute.ts`/dosing is untouched. Non-material
fields keep the existing renderer.
**Tests:** none new (behavior covered by verify:work-orders); ensure the field still writes `materialId`.
**Depends on:** Unit 3, Unit 5
**Verification:** `npm run verify:work-orders` + `verify:work-orders-enhancements` green; manual: an ADDITION
task shows filter chips + fuzzy search and completing it writes the same ledger op as before.

### Unit 7: Expendables management UI — category → subcategory
**Goal:** Let users classify on create/edit and browse by the taxonomy.
**Files:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx`; `src/components/cellar/MaterialPicker.tsx`
(create-new modal).
**Approach:** In `AddSupplyForm`, present top-down: a **Category** selector (Additive / Cleaning & Sanitizing /
Packaging / Other) that scopes the **Kind** options (kind stays required — it's the cost driver), plus an
optional free-text **Subcategory** input backed by a `<datalist>` of existing subcategories for the chosen
category and a suggest-as-you-type dupe warning via `closestMatch` (Unit 4/similarity). Group the material
rows by category → effective subcategory (replace the flat `byKind`). Thread `subcategory` through the
create-new modal in `MaterialPicker.tsx`. Packaging/Sugar now selectable via the new kinds.
**Tests:** none new (UI); logic covered by Units 1/3/4.
**Depends on:** Unit 3, Unit 4
**Verification:** manual (Unit 9): create a packaging item + a custom-subcategory additive; both appear
grouped and show up as filter chips.

### Unit 8: Cost / invariant safety check for the new kinds
**Goal:** Prove PACKAGING/SUGAR don't perturb cost routing or WORKORDER-3.
**Files:** `src/lib/cost/data.ts` (read `isComponentCapitalized`); tests under `test/` (cost/work-orders).
**Approach:** Confirm SUGAR (chaptalization) capitalizes like other additives when dosed; confirm PACKAGING
is never reached by the addition/fining path (not offered by the ADDITIVE-scoped picker) and, if it can be
consumed anywhere, does not silently mis-route. Add an assertion/test that CLEANING/SANITIZER remain the
only OVERHEAD kinds. Document packaging-at-bottling as out of scope.
**Tests:** cost classification test for SUGAR (capitalized) and a guard that overhead kinds set is unchanged.
**Depends on:** Unit 1
**Verification:** `npm run verify:cost` green; `npm run verify:invariants` + `verify:tripwires` green.

### Unit 9: Tests, full verify, docs
**Goal:** Lock behavior and refresh the brain.
**Files:** any test files above; `docs/architecture/system-map.md` (§10 additions/dosing — note the taxonomy
+ picker); optionally a short note in a register if a meaningful decision was made.
**Approach:** Run the full suite + relevant verify scripts; manual e2e of an additions WO end to end
(pick via filter+fuzzy → complete → ledger op identical). Update system-map. If the "derived category /
free subcategory" model is a notable architecture choice, add a one-line register/ADR entry.
**Tests:** whole suite (`npm test`), `npm run build`, `verify:work-orders*`, `verify:cost`, `verify:invariants`, `verify:tripwires`.
**Depends on:** Units 1-8
**Verification:** all green; brain marker refreshed if `/ship` boundary criteria met.

## Test Strategy

**Unit tests:** pure taxonomy (`material-taxonomy.test.ts`), fuzzy ranking (`material-search.test.ts`),
material data round-trip (subcategory persist + category filter), cost classification for SUGAR + overhead-set guard.
**Integration/verify:** `verify:work-orders` + `verify:work-orders-enhancements` (dose flow unchanged),
`verify:cost` (roll-up unchanged), `verify:invariants` + `verify:tripwires` (guards intact),
`test/tenant-isolation.test.ts` (RLS on `cellar_material` incl. new column).
**Manual verification:** (1) create a packaging item and a custom-subcategory additive in
`/setup/expendables`; (2) issue an ADDITION work order, confirm filter chips (Yeast/Bacteria/Fining/… +
custom) + fuzzy search ("kmbs" → KMBS), that cleaning/packaging are hidden by the ADDITIVE scope; (3)
complete the task and confirm the ledger op + cost line are identical to pre-change.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Adding `PACKAGING`/`SUGAR` kinds perturbs cost classification (`isComponentCapitalized`) or WORKORDER-3 | MED | HIGH | Unit 8 dedicated check + tests; packaging never dosed (ADDITIVE-scoped picker); overhead-set assertion. |
| Two overlapping classifiers (`kind` vs `subcategory`) confuse users | MED | MED | UI presents Category→Kind→Subcategory top-down; effective-subcategory falls back to kind label so nothing is unlabeled; `kind` framed as system/cost field. |
| Custom subcategories fragment into near-duplicate buttons | MED | LOW | Datalist of existing values + `closestMatch` dupe warning on entry (Unit 7). |
| `app_rls` can't write the new column | LOW | MED | Postgres table-level INSERT/UPDATE grants cover new columns; verify with a `runAsTenant` write in Unit 2. |
| Migration injects phantom `search_vector` diff (known Windows quirk) | MED | LOW | Hand-verify SQL is only the ADD COLUMN; use `migrate diff`→`deploy`, not `migrate dev`. |
| Packaging category implies bottling-consumption accounting users expect | LOW | MED | Explicitly documented out of scope in the plan + release notes; this is catalog organization only. |

## Success Criteria

- [ ] `CellarMaterial` has a `subcategory` column; migration applied via the Windows diff→deploy flow.
- [ ] `MATERIAL_KINDS` includes `PACKAGING` and `SUGAR`; `material-taxonomy.ts` derives main category for every kind.
- [ ] Additions picker (plan + execute flows) shows subcategory filter buttons + fuzzy search, defaults to additives, hides cleaning/packaging.
- [ ] A user can type a brand-new subcategory on a material and it appears as a filter button.
- [ ] Packaging items can be created and browsed grouped by category → subcategory in `/setup/expendables`.
- [ ] Dosing math, ledger writes, and cost roll-up are unchanged (verify:work-orders*, verify:cost green).
- [ ] Tenant isolation intact (tenant-isolation test + verify:invariants + verify:tripwires green).
- [ ] All tests pass; `npm run build` clean; no regressions.

## Build Status: COMPLETE (2026-07-04)

All 9 units built on `feat/material-taxonomy-additions-picker`, one commit per unit.
- **Schema:** one columns-only migration (`20260703040000_material_subcategory`, `cellar_material.subcategory TEXT`) applied to the dev DB via `migrate deploy` (renamed off a colliding timestamp). `MATERIAL_KINDS` gained `SUGAR` + `PACKAGING` (no migration).
- **Design:** main category DERIVED from `kind` (no stored column); `kind` untouched (still cost/dosing/identity). `subcategory` is the only new column (customizable, organizational). `materialScopeForTask` is the single source for picker scope (used by both flows).
- **Verify:** full suite **1038 passed / 23 skipped** (+47 new: taxonomy 12, search 8, cost-safety 9, +others); `npm run build` clean; lint 0 errors; `verify:invariants` 18/18; `verify:tripwires` 14/14; `verify:work-orders` 20 + `verify:work-orders-enhancements` 31 (dose flow + MATERIAL-cost-nets-to-zero unchanged).
- **KNOWN CONCERN:** `verify:cost` could not run — it dies in its OWN initial test-data scrub on a pre-existing `accounting_delivery → costExportEvent` FK (orphaned Demo Winery data from a prior run), before any assertion. Orthogonal to this change (touches neither table); cost-inertness is proven instead by the MATERIAL-cost-nets-to-zero assertion in verify:work-orders, the `material-cost-safety` unit test, and `consumeMaterialCore` always writing a MATERIAL component regardless of kind.
- **Env gotcha:** the `@prisma/client` wrapper reverts + tsc's incremental `.tsbuildinfo` caches stale Prisma types after a schema change → phantom "subcategory does not exist" errors. Fix: `prisma generate` then `tsc --noEmit --incremental false` / delete the tsbuildinfo. (Matches the project's known "Prisma client clobber" gotcha.)
