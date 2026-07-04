---
title: Expendables intake modal — full purchase record, brand/generic display, editable families, imperial units + cost-per-measure
type: feat
status: completed
date: 2026-07-04
branch: feat/expendables-intake-modal
depth: deep
units: 10
---

## Overview

Turn the thin inline "Add a supply" form on `/setup/expendables` into an **"Add expendable" button → modal** that
captures a real purchase record (generic + brand + brand name, vendor + URL, total cost, package size as
number + unit, category, family) and derives an accurate per-measure cost. Adds a **stored main Category** +
an **editable family list** (so a winemaker can `+ add` a family) and **imperial units** (gallon / fl oz / oz /
lb) in both the intake and the dose/use flow. Keeps the existing Receive modal + costed-SupplyLot flow intact.

## Problem Frame

The current intake is a one-line form: Name, Category, Kind, Subcategory, Unit, Opening qty, "Cost/g". Two real
gaps for a winery:
1. **Cost is guesswork at intake.** You buy a "100-gallon drum for $X" but the form wants a per-gram cost in the
   app's metric stock unit — nobody computes that by hand, so cost-per-bottle drifts. The app already stores
   cost *per stock unit* on each lot (`SupplyLot.unitCost`) and costs a dose as `unitCost × drawn qty`; the
   missing piece is letting you enter the purchase the way it actually arrives (package amount + unit + total
   cost) and converting it. And there's no gallon/oz support anywhere — everything is metric g/mL.
2. **The catalog can't hold how the winery thinks about products.** No brand vs generic (a shop with one
   bentonite wants "Bentonite"; a shop with six yeasts wants the strain names), no vendor/URL, and the family
   list ("Yeast", "Fining"…) is a fixed code const they can't extend.

Do nothing → the operator keeps a spreadsheet for real costs and the ERP's cost-per-bottle stays approximate,
which defeats the point of the Phase-8 cost spine.

Job to be done: **"let me enter what I actually bought — brand, vendor, a 100-gallon drum for $X — pick or
invent its family, and have the app cost every 2-ounce use correctly and show it by the name I prefer."**

## Requirements

- MUST: An **"Add expendable" button** opens a modal; it replaces the inline add form. The **Receive modal + its
  flow stay unchanged**.
- MUST: Modal fields — generic name; brand; brand name; **"default to generic name"** toggle (per material);
  vendor + vendor URL; total cost paid; package size as **number + unit of measure**; Category (the 4 fixed
  ones); family ("kind") selectable from existing **+ "add" a new one**.
- MUST: **Cost-per-measure** — from package size + total cost, derive the per-canonical-unit cost so any later
  use (including a `2 oz` use) is costed correctly. Same-dimension conversion only (no mass↔volume).
- MUST: **Imperial units** (gallon, fl oz, oz, lb) available in **both** intake and dose/use, converted to the
  canonical metric stock unit; a cross-dimension unit degrades to UNKNOWN cost (D14), never a silent $0 or a throw.
- MUST: **Stored Category** (controlled) becomes the cost-safety authority (WORKORDER-3 / `isDoseable…`), so a
  custom family under Additive is doseable and under Cleaning/Packaging is not — even for user-invented families.
- MUST: **Display by preference** — the material shows as its generic name or brand name per the toggle,
  everywhere a material name renders (lists, pickers) AND in the durable dose snapshot (`LotTreatment.materialName`).
- MUST: Relabel the old per-gram cost field to a per-unit label; the intake shows **cost per package unit** + a
  live per-measure preview.
- SHOULD: Family filter chips in the additions picker come from the stored family list (supersedes the #33
  `builtinSubLabel(kind)` chips); built-in families seed the list.
- SHOULD: Expendables list groups by Category → family, and rows surface brand/vendor + per-unit cost.
- NICE: A "did you mean" near-duplicate hint when adding a family (reuse `closestMatch`).

## Scope Boundaries

**In scope:** a pure unit-of-measure + conversion engine; a stored `category` + editable `kind`/family + brand/
generic/vendor/package columns on `CellarMaterial` (columns-only migration); the intake modal + its create path
with package→per-unit cost math; imperial units in the dose/consume path; display-name threading incl. the dose
snapshot; expendables regrouping + relabel; demo-seed refresh; tests + verify + docs.

**Out of scope (with reason):**
- **Mass↔volume conversion** (needs per-material density/specific gravity) — same-dimension only; a cross-dimension
  unit degrades to UNKNOWN cost exactly like today's `stockConversionFactor` returning null.
- **A managed family registry table** (rename/merge/reorder families across materials) — chosen model is an
  editable per-material family string with built-in seeds; a registry table is a later option (fork 1 option B).
- **Retroactive re-costing** of already-received lots — closed cost history is immutable (D17); new math applies
  to new receipts only.
- **Changing `SupplyLot`'s per-stock-unit cost model** — intake converts INTO the canonical stock unit; the cost
  engine (`deplete.ts`/`consume.ts`) is unchanged in shape.

## Research Summary

### Codebase Patterns
- **Intake UI:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx` — `AddSupplyForm` (Name/Category/Kind/
  Subcategory/Unit/Opening/`Cost/${stockUnit}`) → `createStockMaterialAction`; `ReceiveModal` → `receiveSupplyAction`
  (KEEP); `SupplyRow` renders `mat.name`. `createStockMaterialAction` (`src/lib/cellar/actions.ts:74`) does NOT
  revalidate `/setup/expendables` (bug to fix). `<Modal>` API: `{open,onClose,title,subtitle?,children,maxWidth?}`.
- **Create/DTO:** `src/lib/cellar/materials.ts` `createStockMaterialCore`/`upsertMaterialCore`/`toDTO`; DTO +
  `STOCK_UNITS` + `coerceStockUnit` in `materials-shared.ts`. Opening stock seeds a `SupplyLot`
  (`qtyReceived=qtyRemaining=openingQty, stockUnit, unitCost, policyVersion`).
- **Cost engine:** `SupplyLot.unitCost Decimal(18,8)` is per stockUnit, NULL = unknown (D14). `deplete.ts`
  `planDepletion`/`weightedAvgUnitCost` (pure, oldest-first). `consume.ts` `consumeMaterialCore` converts a dose
  (`g`/`mL`) → stockUnit via **`stockConversionFactor(doseUnit,stockUnit)` — only metric g/mg/kg + mL/L; mass↔volume
  and `unit` return null → UNKNOWN**. `additions-math.ts` `DOSE_UNIT_LABELS`/`resolveDoseUnit`/`computeDoseTotal`.
  **No gallon/oz/lb anywhere** (grep hits only TTB wine-gallons, unrelated). `packagingSize` column exists but is
  **dormant — read/written by nothing**.
- **Taxonomy:** `src/lib/cellar/material-taxonomy.ts` — `MATERIAL_CATEGORIES`, `categoryOf(kind)` DERIVES category,
  `builtinSubLabel`, `isDoseableKind` (used by the WORKORDER-3 server guard in `execute.ts`), `materialScopeForTask`
  (already returns categories). #33 picker filters chips by `builtinSubLabel(kind)`.
- **Display-name render sites (a toggle must thread through all):** `ExpendablesClient` (`mat.name`),
  `MaterialPicker.tsx` (`stockLabel`, and it **emits `m.name`** as the dose value), `MaterialFilterPicker.tsx`
  (`o.label`), `getWorkOrderPickers` (`label: m.name`, `data.ts`), and the **durable snapshot
  `LotTreatment.materialName`** set by `resolveDoseMaterial` (`addition.ts:229`) → read by the lot timeline.
- **Identity:** `@@unique([tenantId, kind, normalizedKey])` (`normalizedKey` = normalize(name)) + `@@unique([tenantId,id])`.
  Adding nullable, non-identity columns is columns-only + RLS-neutral (subcategory precedent
  `prisma/migrations/20260703040000_material_subcategory/migration.sql`).
- **UI primitives:** `Modal`, `Input`, `Checkbox` (only toggle primitive), `Button`; selects are raw `<select>` with
  a shared inline `controlStyle`.

### Prior Learnings
- No rstack learnings on this topic. Windows migration flow: `migrate diff`→`deploy`, stop dev server before
  `db:generate`; tsc incremental cache goes stale after a schema change → `tsc --noEmit --incremental false`
  (the "Prisma client clobber" gotcha). Columns-only add on an RLS-forced table needs no RLS change.

### Constraining Invariants (verbatim-sourced)
- **COST-1/2 (D14):** unknown unit cost → `basisCompleteness = UNKNOWN`, never silent $0; contagion taints children.
  A cross-dimension/`unit` conversion must degrade to UNKNOWN, not fabricate a cost.
- **D5/Unit 9:** MATERIAL + DOSAGE_LIQUEUR always capitalize; FRUIT/BARREL/LABOR/OVERHEAD/**PACKAGING** capitalize
  only when the tenant toggle is on. `isComponentCapitalized` is the single authority — untouched here.
- **D17:** every derived cost row is stamped with the policy version; never re-value closed history.
- **WORKORDER-3:** cleaning/sanitizing (and packaging) never enter the wine cost DAG; the additions server guard
  must keep rejecting non-additive doses — now via the STORED category.
- **TENANT-1:** columns-only on the already-RLS-forced `cellar_material` is RLS-neutral.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Family model | **Stored `category` (controlled) + editable `kind`/family string (built-ins seeded, `+ add`)** (fork 1A) | Family registry table (1B); keep fixed kind + editable subcategory (1C) | Matches the operator's mental model (one editable family under a fixed category); cost-safety keys off the stored category so custom families are safe; least new machinery; columns-only. |
| Cost-safety authority | **Stored `category`** via a new `isDoseableCategory(category)` (replaces `isDoseableKind`) | Keep deriving from kind | A user-invented family isn't in the kind→category map; deriving would misclassify it as OTHER (doseable). Stored category is the honest source. |
| Fine-grained subcategory | **Retire from UI** (family is the one dimension); keep the `subcategory` column dormant (no destructive migration) | Drop the column | #33 already stopped filtering by it; retiring the UI level converges on the user's single-family model without a data-loss migration. |
| Imperial units | **Both intake + dose/use; same-dimension only** (fork 2A) | Intake-only | User explicitly wants a `2 oz` use costed; that needs the dose/consume path to understand oz. Cross-dimension stays UNKNOWN (no density). |
| Canonical storage | **Metric stays canonical** (`g`/`mL`/`unit`); imperial converts at the boundary | Store imperial | Keeps `SupplyLot.unitCost` per-stock-unit semantics + the whole cost engine unchanged; conversion lives in one pure lib. |
| Package → cost | Intake stores `packageAmount`+`packageUnit` + `totalCost`; derives `unitCost` per **canonical** stock unit and seeds the opening `SupplyLot` | Store per-package cost | The cost engine wants per-stock-unit cost; deriving it once at intake means every downstream dose is costed by the existing engine. |
| Brand/generic identity | `name` stays the canonical identity/snapshot label (= brand name if given, else generic); `genericName`/`brand`/`brandName`/`preferGeneric` are display metadata; a pure `materialDisplayName(m)` picks what the UI shows | Make generic the identity | Generic-as-identity collides all yeasts ("Yeast"); brand-specific `name` keeps dedup correct. Flag: same generic+same brand still dedups (fine). |
| Dose snapshot | `LotTreatment.materialName` snapshots the **display name at write time** | Snapshot raw `name` | The timeline should read what the operator saw. |

## Implementation Units

### Unit 1: Unit-of-measure + conversion engine (pure)
**Goal:** One pure module that knows units, their dimension, and same-dimension conversion to a canonical unit.
**Files:** new `src/lib/units/measure.ts`; `test/measure.test.ts`.
**Approach:** Define a unit table with dimension (`mass` | `volume` | `count`): mass = mg/g/kg/oz/lb; volume = mL/L/fl oz/gal; count = unit. `dimensionOf(unit)`, `canonicalUnitFor(dimension)` (`g`/`mL`/`unit`), `toCanonical(amount, unit)` and `convert(amount, from, to)` returning `null` across dimensions or for `unit`. Exact factors (1 gal = 3785.411784 mL, 1 fl oz = 29.5735295625 mL, 1 lb = 453.59237 g, 1 oz = 28.349523125 g), all through `round8`-style precision. Pure, no DB/React.
**Tests:** each conversion (gal→mL, fl oz→mL, lb→g, oz→g, kg→g, L→mL, identity); cross-dimension → null; `unit` → null; precision (2 oz of a gallon, etc.).
**Depends on:** none.
**Verification:** `npm test -- measure` green.

### Unit 2: Taxonomy — stored category + editable family + category-based cost-safety
**Goal:** Make category the stored cost-safety authority and the family list extensible.
**Files:** `src/lib/cellar/material-taxonomy.ts`; `src/lib/cellar/material-normalize.ts` (family coercion); `test/material-taxonomy.test.ts`, `test/material-cost-safety.test.ts`.
**Approach:** Add `isDoseableCategory(category: MaterialCategory)` (false for CLEANING_SANITIZING + PACKAGING) and keep `isDoseableKind` as a thin legacy wrapper. Add a `BUILTIN_FAMILIES` seed list (the current MATERIAL_KINDS labels) for the dropdown. Relax family coercion: normalize/trim, accept any non-empty value (fallback OTHER only when empty) — families are no longer a closed const. Keep `categoryOf(kind)` as the **backfill/fallback** only. `materialScopeForTask` stays category-based (unchanged).
**Tests:** `isDoseableCategory` truth table; custom family + explicit category resolves doseable-or-not by category, not by kind; built-in families present.
**Depends on:** none.
**Verification:** `npm test -- material-taxonomy material-cost-safety` green.

### Unit 3: Schema + migration (columns-only)
**Goal:** Persist the new purchase/display/taxonomy fields.
**Files:** `prisma/schema.prisma` (`CellarMaterial`); new migration `prisma/migrations/<ts>_material_intake_fields/migration.sql`.
**Approach:** Add nullable columns: `category String?`, `genericName String?`, `brand String?`, `brandName String?`,
`preferGeneric Boolean @default(false)`, `vendor String?`, `vendorUrl String?`, `packageAmount Decimal? @db.Decimal(18,6)`,
`packageUnit String?`. **Backfill `category`** from a kind→category SQL mapping (mirror `categoryOf`), then keep nullable
with a code fallback (no forced NOT NULL to avoid a 3-step migration). No enum, no index, no FK, identity unchanged
(`@@unique([tenantId, kind, normalizedKey])`), so RLS-neutral (subcategory precedent). Windows `migrate diff`→`deploy`;
`db:generate`.
**Tests:** none (schema); confirm `test/tenant-isolation.test.ts` CellarMaterial cases still pass.
**Depends on:** none (can land with Unit 1/2).
**Verification:** `db:generate` clean; a `runAsTenant` write/read of the new columns round-trips.

### Unit 4: Materials data layer — new fields + display-name helper + stored category
**Goal:** Thread all new fields through create/upsert/DTO and centralize the display name.
**Files:** `src/lib/cellar/materials-shared.ts` (DTO + `materialDisplayName(m)` pure helper), `src/lib/cellar/materials.ts`
(`create/upsert` inputs + persistence + `toDTO`), `src/lib/cellar/actions.ts` (thread fields; add `/setup/expendables`
revalidate). `listMaterials` filters by **stored** `category` (fallback `categoryOf(kind)`).
**Approach:** Extend `CreateStockMaterialInput`/`UpsertMaterialInput` with genericName/brand/brandName/preferGeneric/
vendor/vendorUrl/category/family(kind)/packageAmount/packageUnit. On create, set `name` = brandName?.trim() || genericName
(the identity/snapshot label), persist `category` (input or `categoryOf(kind)` fallback). `materialDisplayName(m)` =
`preferGeneric ? (genericName ?? name) : (brandName ?? genericName ?? name)`. DTO gains the new fields + `displayName`.
**Tests:** create with brand/generic/preferGeneric round-trips; `materialDisplayName` precedence + fallbacks; `listMaterials({category})` uses stored category.
**Depends on:** Unit 2, Unit 3.
**Verification:** targeted material tests green; `verify:work-orders` still green.

### Unit 5: Intake cost math (pure)
**Goal:** Turn "package amount + unit + total cost" into a canonical opening `SupplyLot` (qty + per-canonical unitCost) + a per-measure preview.
**Files:** new `src/lib/cost/intake-cost.ts`; `test/intake-cost.test.ts`.
**Approach:** `deriveOpeningLot({ packageAmount, packageUnit, totalCost, stockUnit })` → `{ qtyInStockUnit, unitCost }` using
Unit 1 (`convert(packageAmount, packageUnit, stockUnit)`; if null-dimension or missing cost → `unitCost=null` UNKNOWN, D14).
`costForUse(unitCost, useAmount, useUnit, stockUnit)` for the live "2 oz costs $Y" preview. All `round8`.
**Tests:** 100 gal @ $X → per-mL cost + qty; 1 gal, $X, use 2 fl oz → cost; unknown/cross-dimension → null cost; count units.
**Depends on:** Unit 1.
**Verification:** `npm test -- intake-cost` green.

### Unit 6: Imperial units in the dose/consume path
**Goal:** Let a dose/use be expressed in imperial and be costed.
**Files:** `src/lib/cost/consume.ts` (`stockConversionFactor`), `src/lib/cellar/additions-math.ts` (`DOSE_UNIT_LABELS`,
`resolveDoseUnit`), `test/additions-math.test.ts`, `test/consume`/cost tests.
**Approach:** Route `stockConversionFactor` through Unit 1 so oz/lb→g and fl oz/gal→mL work; keep mass↔volume + `unit` → null
(UNKNOWN, D14). Add imperial absolute units to `DOSE_UNIT_LABELS`/`resolveDoseUnit` (fl oz, oz; gal, lb) as `{kind:"abs"}`.
Do NOT change rate bases (g/hL etc.). Preserve the draw-to-zero + UNKNOWN degradation exactly.
**Tests:** oz→g and fl oz→mL dose totals; a below-cost/cross-dimension use still degrades to UNKNOWN not $0; `verify:cost`-style assertions.
**Depends on:** Unit 1.
**Verification:** `npm run verify:cost` (see risk — currently blocked by orphaned data) + `verify:work-orders` green.

### Unit 7: "Add expendable" modal component
**Goal:** The rich intake modal.
**Files:** new `src/app/(app)/setup/expendables/AddExpendableModal.tsx` (or a component in the client file).
**Approach:** `<Modal>` with: generic name; brand; brand name; a "Default to generic name" `Checkbox`; vendor + vendor URL;
Category `<select>` (4); family select over BUILTIN_FAMILIES + existing tenant families with a `+ add` inline input
(datalist + `closestMatch` dupe hint); package amount (number) + unit `<select>` (metric + imperial for the category's
dimension); total cost; a live read-only "≈ cost per {unit}" + "a {2 oz} use ≈ $Y" preview (Unit 5). Design tokens only,
≥44px targets. Emits one payload to the create action.
**Tests:** none (UI); logic covered by Units 1/4/5 + manual QA (Unit 10).
**Depends on:** Unit 1, Unit 2, Unit 5.
**Patterns to follow:** `ReceiveModal`/`CreateStockMaterialModal` (`MaterialPicker.tsx`) modal usage; `filterBtn` pill pattern.
**Verification:** renders; opens from the button; submits.

### Unit 8: Wire modal → action → create core (button replaces inline form)
**Goal:** Replace the inline `AddSupplyForm` with an "Add expendable" button + the modal; persist everything incl. the opening lot.
**Files:** `src/app/(app)/setup/expendables/ExpendablesClient.tsx`, `src/lib/cellar/actions.ts`, `src/lib/cellar/materials.ts`.
**Approach:** `createStockMaterialCore` accepts the package fields and uses Unit 5 to seed the opening `SupplyLot` (qty in
canonical stockUnit + per-canonical `unitCost`), stamped with the policy version + currency like `receiveSupplyCore`. Keep the
Receive modal + `receiveSupplyAction` untouched. Add `/setup/expendables` to the revalidate set.
**Tests:** create-with-package seeds a correctly-costed lot (extend material tests).
**Depends on:** Unit 4, Unit 5, Unit 7.
**Verification:** add a "100 gal @ $X" expendable in Demo Winery → on-hand + per-unit cost correct.

### Unit 9: Display-name threading (incl. dose snapshot) + picker family chips
**Goal:** Show the preferred name everywhere; family chips come from the stored family.
**Files:** `src/lib/work-orders/data.ts` (`label = materialDisplayName`), `src/components/cellar/MaterialPicker.tsx`
(`stockLabel` + keep emitting the identity name for resolution), `src/components/work-orders/MaterialFilterPicker.tsx`
(chips from the family field), `src/app/(app)/setup/expendables/ExpendablesClient.tsx` (rows show display name + brand/vendor),
`src/lib/cellar/addition.ts` (`resolveDoseMaterial` snapshots `materialDisplayName`).
**Approach:** Use `materialDisplayName(m)` at every render site. `LotTreatment.materialName` snapshot = the display name at
write time. Picker family chips = distinct family values in scope (supersede #33 `builtinSubLabel`); resolution/identity
still by material id/name so the dose path is unchanged.
**Tests:** covered by verify:work-orders (dose still records) + Unit 4; manual QA for display.
**Depends on:** Unit 4.
**Verification:** `verify:work-orders*` green; a brand-preferred material shows its brand name in the picker + timeline.

### Unit 10: Expendables regroup/relabel, demo seed, tests, verify, docs
**Goal:** Finish the surface + lock behavior + refresh the brain.
**Files:** `ExpendablesClient.tsx` (group by Category → family; relabel per-unit cost), `scripts/seed-demo-materials.ts`
(use the new fields: generic/brand/vendor/package/category/family), `docs/architecture/system-map.md`, the plan status.
**Approach:** Group by stored Category → family; relabel the old "Cost/g" wording. Refresh the demo seed to exercise brand/
generic + imperial packages (e.g. a 55-gal drum) so it's visible. Run full suite + build + `verify:invariants`/`tripwires`/
`work-orders*`/`cost`. Update system-map §4/§10.
**Tests:** whole suite; the new pure tests; verify scripts.
**Depends on:** Units 1-9.
**Verification:** all green; brain updated.

## Test Strategy

**Unit (vitest):** the conversion engine (Unit 1), intake cost math (Unit 5), imperial dose units (Unit 6),
taxonomy/cost-safety by stored category (Unit 2), material create/display round-trips (Unit 4). Mirror existing
`test/material-*.test.ts` + `test/additions-math.test.ts`.
**Integration/verify:** `verify:work-orders` + `verify:work-orders-enhancements` (dose + display unchanged),
`verify:cost` (per-measure costing — see risk), `verify:tenant-isolation` (new columns on the RLS table),
`verify:invariants` + `verify:tripwires`.
**Manual/QA (Demo Winery):** add a "100-gallon drum for $X" additive via the modal → on-hand + per-unit cost correct;
toggle generic vs brand → name flips in the picker; `+ add` a family → it appears as a chip; dose "2 oz" of a liquid →
costed; a cleaning material still can't be dosed (server guard by stored category).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Imperial dose units perturb cost conservation / D14 | MED | HIGH | Conversion is same-dimension only; cross-dimension + `unit` → null → UNKNOWN (never $0); Unit 6 tests + verify:cost assert. |
| `verify:cost` can't run (pre-existing orphaned `accounting_delivery → costExportEvent` data blocks its scrub) | HIGH | MED | Known, unrelated to this diff. Clear the orphaned rows before Unit 10, else prove costing via unit tests (Units 1/5/6) + verify:work-orders MATERIAL-cost assertions. |
| Relaxing `kind` from a closed const breaks a consumer that assumed the enum | MED | MED | Grep all `coerceMaterialKind`/MATERIAL_KINDS consumers; keep the built-in labels; cost-safety moves to stored category so no consumer relies on kind∈const for safety. |
| Display-name vs identity/snapshot confusion | MED | MED | `name` stays the canonical identity + resolution key; `materialDisplayName` is display-only; snapshot stores the display string at write time. Documented in Unit 4/9. |
| Picker chips change again (after #33) confuses | LOW | LOW | Chips now = the stored family list (built-ins seeded), which reads the same for existing data; documented. |
| Two brands of one generic still dedup under `@@unique(kind,normalizedKey)` | LOW | MED | `name` = brand-specific, so distinct brands → distinct normalizedKey; only same-generic+same-brand dedups (correct). Flagged, not redesigned. |
| tsc incremental cache stale after schema change (Prisma clobber) | MED | LOW | `prisma generate` + `tsc --noEmit --incremental false`; clear tsbuildinfo before build. |

## Success Criteria

- [ ] "Add expendable" button opens a modal capturing generic/brand/brand name, vendor+URL, total cost, package size (number+unit), category, family; the Receive modal is unchanged.
- [ ] Entering a "100-gallon drum for $X" seeds a correctly-costed lot (per-canonical unitCost); a later "2 oz" use is costed via the engine.
- [ ] Imperial units (gal/fl oz/oz/lb) work in both intake and dosing; cross-dimension/`unit` degrades to UNKNOWN, never $0.
- [ ] Category is stored and is the cost-safety authority; a custom family under Additive is doseable, under Cleaning/Packaging is not (server WORKORDER-3 guard holds).
- [ ] "Default to generic name" flips the displayed name everywhere (lists, pickers, dose timeline snapshot).
- [ ] Family list is editable (`+ add`), and additions-picker chips come from it.
- [ ] All tests pass; `npm run build` clean; `verify:invariants` + `verify:tripwires` + `verify:work-orders*` green; no regressions.

## Build Status: COMPLETE (2026-07-04)

All 10 units built on `feat/expendables-intake-modal`, one commit per unit (units 7+8 combined).
- **New pure libs:** `src/lib/units/measure.ts` (conversion engine) + `src/lib/cost/intake-cost.ts` (package→per-unit + use preview). Metric canonical; imperial converts at the boundary; cross-dimension → UNKNOWN (COST-2/D14).
- **Taxonomy:** category is now STORED + is the cost-safety authority (`isDoseableCategory`); family (`kind`) is user-extensible (`coerceFamily`/`familyLabel`/`BUILTIN_FAMILIES`); subcategory retired from UI (column dormant).
- **Schema:** one columns-only migration `20260704120000_material_intake_fields` (category + genericName/brand/brandName/preferGeneric/vendor/vendorUrl/packageAmount/packageUnit), category backfilled. Applied to dev DB.
- **UI:** Add-expendable modal replaces the inline form (Receive modal untouched); imperial dose units in the picker; display name (`materialDisplayName`) at every render site + the dose snapshot; catalog groups by stored Category → family.
- **Verify:** suite **1075 pass / 23 skip** (+ measure/intake-cost/material-display/cost-safety); `npm run build` clean; lint 0 errors; `verify:invariants` 18/18; `verify:tripwires` 14/14; `verify:work-orders` 20. Demo seed refreshed (`npm run seed:demo-materials`) with brand/generic + imperial packages, verified converting to canonical stock units.
- **KNOWN CONCERN (carried from #034):** `verify:cost` still can't run — pre-existing orphaned `accounting_delivery → costExportEvent` data in Demo Winery blocks its own scrub, unrelated to this diff. Cost math proven instead by `intake-cost`/`measure` unit tests + the `verify:work-orders` MATERIAL-cost assertions. Clear the orphaned rows and re-run `verify:cost` before relying on the DTC/cost tie-out.
- **Note:** re-running `seed:demo-materials` accumulates opening lots (createStockMaterialCore always seeds a lot when opening qty/package is present) — reset the tenant for a clean count.
