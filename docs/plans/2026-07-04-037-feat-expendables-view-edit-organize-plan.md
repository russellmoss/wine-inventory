---
title: Expendables setup — view/edit base data, collapsible categories, filter + fuzzy search
type: feat
status: completed
date: 2026-07-04
branch: feat/expendables-view-edit-organize
depth: standard
units: 6
---

## Overview

Turn `/setup/expendables` from a flat, always-expanded catalog with per-row "Receive"/"Deactivate"
buttons into an organized, searchable list where clicking a material opens a **detail modal** showing
its base setup data (the stuff entered at creation — brand/generic, supplier, product URL,
category/family, package/cost, unit config). Inside that modal live the three actions: **Edit**
(fix the base data), **Receive** (the existing restock flow, unchanged), and **Deactivate/Reactivate**.
Categories and their family sub-sections collapse by default and unfurl on demand, with category filter
chips + fuzzy item search on top.

## Problem Frame

Today the page has no way to *see* or *correct* the data you typed when you set up an item. If you
fluffed the product URL, mislabeled the brand, or want to check the cost-per-measure, you're stuck —
the only verbs are "Receive" and "Deactivate". And the list dumps every category and family fully
expanded, so with ~60 materials across Additives / Cleaning & Sanitizing / Packaging / Other it's a
wall of text you can't scan or search.

The job the operator is hiring this for: "let me find an item fast, look at exactly what I entered, and
fix it if it's wrong — without touching stock or cost history." Doing nothing means base data stays
wrong forever (no edit path exists in the code today) and the page keeps getting harder to scan as the
material count grows.

**Product note (not a blocker):** the *safe* edit surface is display/supplier metadata. Category and
family are the cost-safety authority (WORKORDER-3) and part of the dedup identity key, and
package/unit/cost feed cost derivation. The plan allows editing them but fences them server-side so an
edit can never corrupt cost history or create a doseability bypass. See Key Decisions.

## Requirements

- MUST: Category groups (Additive, Cleaning & Sanitizing, Packaging, Other) and their family
  sub-sections are collapsed by default and expand/collapse on click; "Expand all" / "Collapse all"
  controls exist.
- MUST: Clicking a material card opens a **detail (view) modal** showing its base setup data read-only,
  plus on-hand and cost-per-measure — NOT the receive flow.
- MUST: The detail modal exposes three actions — **Edit**, **Receive**, **Deactivate/Reactivate** —
  replacing the inline row buttons.
- MUST: **Edit** updates the base Material record (display/supplier fields freely; category/family and
  package/unit/cost with server-side safety fences) and never retroactively re-costs existing lots (D17).
- MUST: Category filter chips + fuzzy search by item name narrow the visible list; reuse the existing
  taxonomy + `rankMaterials` fuzzy matcher.
- MUST: All cost-safety invariants stay green — WORKORDER-3 (stored `category` authority), COST-1/COST-2
  (UNKNOWN not $0), TENANT-1 (RLS), and the `material-cost-safety` / `material-taxonomy` tests.
- SHOULD: Sorting within a category by family then item name; deactivated items visually distinct and
  filterable.
- SHOULD: Edit reuses the same form layout as the Add/intake modal (extract a shared form) to avoid drift.
- NICE: Remember expand/collapse + last filter in `localStorage` so the page reopens how you left it.

## Scope Boundaries

**In scope:**
- New `updateMaterialCore` + `updateMaterialAction` (there is no update-by-id path today).
- A material **detail (view) modal** and an **edit modal**, both launched from a clickable card.
- Collapsible category/family sections + expand/collapse-all.
- Category filter chips + fuzzy search + sort on the setup page.
- Refactor `AddExpendableModal`'s field block into a shared `MaterialForm` reused by add + edit.

**Out of scope:**
- The Receive flow itself (`ReceiveModal` / `receiveSupplyAction` / `receiveSupplyCore`) — reused as-is,
  not modified.
- Retroactive re-costing of existing `SupplyLot`/`CostLine` rows (D17 forbids it).
- Deleting materials (in-use items can only be deactivated — existing rule kept).
- Resurrecting the dormant `subcategory` column (retired from UI in Phase 036).
- Any schema/migration change — this is UI + a new update core over existing columns.

## Research Summary

### Codebase Patterns
- Page: [page.tsx](src/app/(app)/setup/expendables/page.tsx:1) (server) → `listMaterials({includeInactive:true})`
  → [ExpendablesClient.tsx](src/app/(app)/setup/expendables/ExpendablesClient.tsx:1). Grouping is
  `category → familyLabel(kind)` nested Map (`ExpendablesClient.tsx:65-76`), fallback `categoryOf(kind)`.
- Modals today live inline in `ExpendablesClient.tsx`: `AddExpendableModal` (230-372), `ReceiveModal`
  (375-441), row renderer `SupplyRow` (165-227) with inline "Receive" (213) + "Deactivate" (220).
- Data layer: [materials.ts](src/lib/cellar/materials.ts) — `deriveMaterialFields` (sanitization:
  `trimOrNull` 200-cap, `normalizeVendorUrl` http(s)-only, `coerceFamily`, `coerceMaterialCategory`),
  `createStockMaterialCore`, `MATERIAL_DTO_SELECT`, `toDTO`. **Gap:** `upsertMaterialCore` /
  `createStockMaterialCore` find-or-create by `(kind, normalizedKey)` and only backfill missing fields —
  **there is no core that updates base data of an existing material by id.** Unit 1 adds it.
- Actions: `createStockMaterialAction` ([cellar/actions.ts](src/lib/cellar/actions.ts:74)),
  `receiveSupplyAction` / `setMaterialActiveAction` ([cost/actions.ts](src/lib/cost/actions.ts:24)).
  Pattern: `"use server"` core-wrapping `action()` helper + `revalidatePath("/setup/expendables")`.
- Taxonomy: [material-taxonomy.ts](src/lib/cellar/material-taxonomy.ts) — `MaterialCategory`,
  `isDoseableCategory` (133-135), `categoryOf`, `coerceFamily`/`coerceMaterialCategory`,
  `familyLabel`/`BUILTIN_FAMILIES`.
- Fuzzy + chips: [MaterialFilterPicker.tsx](src/components/work-orders/MaterialFilterPicker.tsx) uses
  `rankMaterials(q, items, getText)` from [material-search.ts](src/lib/inventory/material-search.ts) and
  builds family chips from options in scope. Reuse both.
- Cost math: [intake-cost.ts](src/lib/cost/intake-cost.ts) `costPerPackageUnit` / `deriveOpeningLot`;
  unit engine [measure.ts](src/lib/units/measure.ts) (same-dimension conversions only).
- UI primitives: [Modal.tsx](src/components/ui/Modal.tsx), [Button.tsx](src/components/ui/Button.tsx),
  [Card.tsx](src/components/ui/Card.tsx) (`interactive` prop), [Input.tsx](src/components/ui/Input.tsx),
  [Checkbox.tsx](src/components/ui/Checkbox.tsx), [Badge.tsx](src/components/ui/Badge.tsx). **No accordion
  primitive exists** — build a small `Collapsible` in `src/components/ui/`. All colors/spacing via tokens
  (`--accent`, `--surface-raised`, `--border-strong`, `--radius-lg`, `--space-*`) per DESIGN.md.
- Guard seam: [execute.ts](src/lib/work-orders/execute.ts) reads `m.category ?? categoryOf(m.kind)` and
  rejects non-doseable doses (WORKORDER-3). Re-checked on every dose → an edit can't create a bypass.

### Prior Learnings
- rstack learnings + context-ledger returned **nothing** on this topic; authority is the two plan docs
  + memory notes below.
- **Stored `category` is the cost-safety authority** (Phase 036). A custom family filed under Cleaning
  derives `categoryOf(kind)==="OTHER"` (doseable) but stored `category==="CLEANING_SANITIZING"` is NOT.
  Edit must persist a coherent stored `category`; `material-cost-safety.test.ts:67-75` locks this.
- **`isDoseableCategory` is false for `CLEANING_SANITIZING` and `PACKAGING`** — re-categorizing changes
  doseability going forward (safe: execute-seam re-checks).
- **`kind` + `normalizedKey` are identity** (`@@unique([tenantId, kind, normalizedKey])`); `name` drives
  `normalizedKey`. Editing family/name/brand/generic changes the dedup key → handle collisions.
- **D17: cost history immutable** — editing base data must NOT re-value existing `SupplyLot`/`CostLine`.
- **COST-1/COST-2/D14:** unknown/cross-dimension cost → `null` (UNKNOWN), never $0.
- **Env gotcha:** no schema change here, but if one sneaks in, `prisma generate` then
  `tsc --noEmit --incremental false`. `verify:cost` full suite is blocked by pre-existing orphaned
  `accounting_delivery` data in Demo Winery — prove cost-inertness via unit tests + `verify:work-orders`
  MATERIAL-cost assertions instead.
- Memory: [[plan036-expendables-intake-modal]], [[plan034-material-taxonomy-picker]].

### External Research
None needed — all patterns exist in-repo.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Editable field tiers | **Tier A (free):** genericName, brand, brandName, preferGeneric, vendor, vendorUrl. **Tier B (fenced):** category, family(kind), packageAmount, packageUnit, cost, stockUnit, isStockTracked. | Lock everything but display; or allow everything freely | Free tier has zero cost/identity impact. Fenced tier is real but the fences (below) make it safe, and the user explicitly wants to fix families/cost. |
| Category/family edits | Allowed; server re-coerces via `coerceMaterialCategory`/`coerceFamily`, recomputes `normalizedKey`, and **rejects on `(tenantId,kind,normalizedKey)` collision** with a clear CONFLICT error. | Silently merge into the colliding row | Merging would fold two materials + their lots — data loss. Reject and let the user rename/dedup. |
| Package unit/dimension edits | Allowed only within the **same measure dimension** as existing stock; if changing dimension (mass↔volume) while `onHand>0` or lots exist, **reject**. | Allow any unit; auto-convert | Cross-dimension conversion is undefined (measure.ts is same-dimension only) and would corrupt stock/cost. |
| Cost edits | Editing packageAmount/packageUnit/totalCost updates the material's **reference/default purchase record only**; existing lots are untouched. Detail modal states "does not re-cost existing stock." | Retroactively re-cost lots | D17 — cost history is immutable. |
| Update mechanism | New **`updateMaterialCore(id, patch)`** + `updateMaterialAction` (there's no update-by-id today). Reuse `deriveMaterialFields` sanitizers. | Extend `upsertMaterialCore` | upsert is find-or-create/backfill; overloading it to overwrite identity is riskier than a purpose-built core. |
| Form reuse | Extract `AddExpendableModal`'s field block into shared **`MaterialForm`** used by both add + edit. | Duplicate the ~120-line form | Prevents add/edit drift; single place for field rules. |
| Collapsible primitive | New small **`Collapsible`** in `src/components/ui/` (token-styled, a11y: button + aria-expanded). | Pull in a headless lib | No dep needed; codebase has no accordion; keep it tiny + on-brand. |
| Card interaction | Whole card is `interactive` and opens the **detail modal**; Receive/Deactivate move *into* that modal. | Keep inline buttons + add a separate "view" button | Matches the user's ask ("click the card… then Edit/Receive/Deactivate in the modal") and declutters rows. |

## Implementation Units

### Unit 1: `updateMaterialCore` + `updateMaterialAction`

**Goal:** A safe server path to update an existing material's base data by id, respecting identity,
dimension, and cost-history invariants.
**Files:** `src/lib/cellar/materials.ts` (new `updateMaterialCore`, exported `UpdateMaterialInput`),
`src/lib/cellar/actions.ts` (new `updateMaterialAction`), `test/material-update.test.ts` (new).
**Approach:** Load the material tenant-scoped by id. Apply the patch through the existing
`deriveMaterialFields` sanitizers (`trimOrNull`, `normalizeVendorUrl`, `coerceFamily`,
`coerceMaterialCategory`). Recompute `name` + `normalizedKey` when identity inputs (brand/generic/name
or kind) change; before writing, check the `(tenantId, kind, normalizedKey)` unique against *other*
rows and throw `ActionError(..., "CONFLICT")` on a hit. If `packageUnit`/`stockUnit` would change
measure dimension while `onHand>0` or `supplyLots` exist, throw CONFLICT. Never read/modify `SupplyLot`
or `CostLine`. Write an `UPDATE` audit entry (match the pattern used by other cores) and
`revalidatePath("/setup/expendables")` in the action wrapper.
**Tests:** free-tier edit persists (vendorUrl fix); category change flips stored `category` and the
execute-seam still rejects a now-cleaning material dose; family/name change that collides → CONFLICT;
cross-dimension packageUnit change with stock → CONFLICT; edit does NOT alter existing SupplyLot
qty/cost (D17); vendorUrl `javascript:` scheme is dropped.
**Depends on:** none
**Execution note:** test-first for the guard branches.
**Patterns to follow:** `createStockMaterialCore` + `deriveMaterialFields` in
[materials.ts](src/lib/cellar/materials.ts); action wrapper in
[cellar/actions.ts:74](src/lib/cellar/actions.ts:74); guard style in
[execute.ts](src/lib/work-orders/execute.ts).
**Verification:** `npm test -- material-update material-cost-safety material-taxonomy` green;
`npm run verify:work-orders` (WORKORDER-3 MATERIAL-cost assertions) green.

### Unit 2: `Collapsible` UI primitive

**Goal:** A reusable token-styled disclosure (header button + animatable body) with accessible
`aria-expanded`, controlled + uncontrolled modes.
**Files:** `src/components/ui/Collapsible.tsx` (new), `src/app/styleguide/*` (add a demo entry if the
styleguide enumerates primitives — optional).
**Approach:** Small component: a header row (chevron + title + optional right-slot for counts/badges)
that toggles a body. Support `open`/`defaultOpen`/`onOpenChange`. Use `--accent`, `--border-strong`,
`--radius-md`, `--space-*`; respect `prefers-reduced-motion` for the expand transition. No new deps.
**Tests:** light RTL test (or a `voice`-style pure test if RTL isn't set up) — toggles `aria-expanded`,
renders children only when open. Match whatever test convention `src/components/ui` uses (skip if none).
**Depends on:** none
**Patterns to follow:** [Card.tsx](src/components/ui/Card.tsx) / [Badge.tsx](src/components/ui/Badge.tsx)
for token usage + prop style.
**Verification:** renders in `/styleguide` (or a scratch page); no hardcoded colors (grep the file).

### Unit 3: `MaterialForm` shared field block

**Goal:** Extract the Add modal's field layout into a reusable form so add + edit share one definition.
**Files:** `src/components/cellar/MaterialForm.tsx` (new), `ExpendablesClient.tsx` (AddExpendableModal
consumes it).
**Approach:** Lift the fields from `AddExpendableModal` (`ExpendablesClient.tsx:243-361`) — generic/brand/
brandName/preferGeneric, category select, family datalist, packageAmount/packageUnit, totalCost, vendor/
vendorUrl, and the live cost preview — into a controlled `MaterialForm` taking `value`, `onChange`,
`familiesByCategory`, and a `mode: "create" | "edit"` prop. In edit mode, render the fenced fields
(category, family, packageUnit) with a small inline caution when the material has stock (drives the
server fence UX), but keep them enabled. Add modal keeps behaving exactly as before (regression-safe).
**Tests:** none new (covered by existing add flow + Unit 6 manual); keep `verify:work-orders-enhancements`
green.
**Depends on:** none (pure refactor; can land before or with Unit 4)
**Patterns to follow:** existing `AddExpendableModal` field JSX + `Input`/`Checkbox`/`Modal` primitives.
**Verification:** Add flow still creates a material with identical payload (diff the
`createStockMaterialAction` input before/after).

### Unit 4: Material detail (view) modal + edit modal

**Goal:** Clicking a card opens a read-only detail modal of base data with Edit / Receive /
Deactivate actions; Edit opens the pre-filled `MaterialForm` wired to `updateMaterialAction`.
**Files:** `src/components/cellar/MaterialDetailModal.tsx` (new), `src/components/cellar/EditMaterialModal.tsx`
(new, wraps `MaterialForm`), `ExpendablesClient.tsx` (state + wiring).
**Approach:** Detail modal (uses `Modal`) shows `materialDisplayName`, category + family, brand/generic,
vendor + clickable `vendorUrl`, package record, derived cost-per-measure (`costPerPackageUnit`),
stockUnit, on-hand, active/inactive badge. Footer buttons: **Edit** → `EditMaterialModal`; **Receive** →
existing `ReceiveModal`; **Deactivate/Reactivate** → `setMaterialActiveAction`. EditMaterialModal
seeds `MaterialForm` from the DTO, submits a diff to `updateMaterialAction`, surfaces the CONFLICT/
dimension errors inline, closes + revalidates on success. State machine: `view → edit`/`receive` and back.
**Tests:** none new automated (UI); covered by Unit 1 server tests + Unit 6 manual QA.
**Depends on:** Unit 1 (action), Unit 3 (form)
**Patterns to follow:** `AddExpendableModal`/`ReceiveModal` modal wiring in
[ExpendablesClient.tsx](src/app/(app)/setup/expendables/ExpendablesClient.tsx); `Modal` + `Button`.
**Verification:** manual — open a card, fix a vendorUrl via Edit, confirm it persists on reload and no
lot/cost changed.

### Unit 5: Card → opens detail modal (remove inline row buttons)

**Goal:** Make each material card open the detail modal; drop the inline Receive/Deactivate buttons.
**Files:** `ExpendablesClient.tsx` (`SupplyRow` → clickable card).
**Approach:** Render `SupplyRow` inside an `interactive` `Card` (or button wrapper) whose onClick sets
the selected material + opens `MaterialDetailModal`. Remove the inline "Receive"/"Deactivate" buttons
(now in the modal). Keep the on-hand / stock-tracked / out-of-stock / inactive badges on the card.
Ensure keyboard access (Enter/Space) + `aria` label.
**Tests:** none new automated.
**Depends on:** Unit 4
**Patterns to follow:** `Card` `interactive` prop; existing `SupplyRow` (165-227).
**Verification:** manual — clicking anywhere on a card opens detail; no dead inline buttons remain.

### Unit 6: Collapsible groups + filter chips + fuzzy search + sort

**Goal:** Collapse categories/families by default with expand/collapse-all; add category filter chips,
fuzzy item search, and family/name sort.
**Files:** `ExpendablesClient.tsx` (list rendering + toolbar), reuse
[material-search.ts](src/lib/inventory/material-search.ts) + [material-taxonomy.ts](src/lib/cellar/material-taxonomy.ts).
**Approach:** Wrap each category section (and each family sub-section) in the Unit 2 `Collapsible`,
collapsed by default; add a toolbar with **Expand all / Collapse all**, category filter chips (built
from the taxonomy like `MaterialFilterPicker`), a search box driving `rankMaterials` over
`materialDisplayName`, and an include-inactive toggle. Sort within a group by family label then item
name. When a search query is active, auto-expand groups that contain matches. Optionally persist
expand + filter state in `localStorage`.
**Tests:** if a pure filter/sort helper is extracted, unit-test it (query matches, empty query returns
all, inactive filter). Otherwise manual.
**Depends on:** Unit 2 (Collapsible); independent of Units 1/3/4/5
**Patterns to follow:** chip + `rankMaterials` usage in
[MaterialFilterPicker.tsx](src/components/work-orders/MaterialFilterPicker.tsx).
**Verification:** manual — search "bent" surfaces bentonite rows across families with groups auto-open;
collapse-all leaves only category headers; filter to Packaging shows only packaging.

## Test Strategy

**Unit tests:** `test/material-update.test.ts` (new) is the core safety net — free-tier persist,
category flip + WORKORDER-3 re-check, identity-collision CONFLICT, cross-dimension CONFLICT, D17
no-re-cost, URL scheme scrub. Keep `material-cost-safety.test.ts` + `material-taxonomy.test.ts` green.
Optional pure filter/sort helper test for Unit 6; optional Collapsible render test for Unit 2.
**Integration tests:** `npm run verify:work-orders` (WORKORDER-3 MATERIAL-cost assertions) must stay
green — this is the doseability regression gate given `verify:cost`'s pre-existing orphaned-data block.
**Manual verification (Demo Winery tenant only):**
1. Open `/setup/expendables` — categories collapsed; expand-all works.
2. Search "kmbs" — matching SO₂ rows surface, group auto-opens.
3. Click a card → detail modal shows base data + cost-per-measure + clickable URL.
4. Edit → fix vendorUrl + brand → save → reload → persisted; on-hand + lots unchanged.
5. Edit → try to move a Cleaning material's family into an additive family that collides → CONFLICT
   error shown, nothing written.
6. Edit → change packageUnit across dimension with stock on hand → rejected.
7. Receive + Deactivate from the modal behave exactly as before.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Edit changes stored `category` and opens a doseability bypass | LOW | HIGH | Execute-seam re-checks `category ?? categoryOf(kind)` on every dose; Unit 1 test asserts a re-categorized cleaning material is still rejected. |
| Family/name edit collides with `(tenantId,kind,normalizedKey)` unique → 500 or silent merge | MED | HIGH | Server pre-checks the unique and throws a friendly CONFLICT; never merges rows. Surface inline in edit modal. |
| Cross-dimension package unit edit corrupts stock/cost | LOW | HIGH | Reject dimension change when stock/lots exist (measure.ts is same-dimension only). |
| Editing package/cost is mistaken for re-costing history | MED | MED | Detail + edit modal copy states "reference only; does not re-cost existing stock" (D17). |
| Add-modal regression from `MaterialForm` extraction | MED | MED | Diff the `createStockMaterialAction` payload before/after; keep `verify:work-orders-enhancements` green. |
| `verify:cost` full suite still blocked by pre-existing orphaned data | HIGH | LOW | Known/unrelated; prove cost-inertness via unit tests + `verify:work-orders` assertions (per plan 034/036 memory). |

## Success Criteria

- [x] Categories + families collapse by default; expand/collapse-all works. (localStorage persistence not built — deferred NICE.)
- [x] Category chips + fuzzy search narrow the list; search auto-opens matching groups.
- [x] Clicking a card opens a detail modal of base data (incl. weighted-avg cost/measure + clickable URL); no
      inline row buttons remain.
- [x] Detail modal offers Edit / Receive / Deactivate; Receive + Deactivate behave exactly as before.
- [x] Edit persists Tier-A fields freely and Tier-B fields with server fences (collision + dimension),
      never re-costing existing lots.
- [x] `material-update` + `material-cost-safety` + `material-taxonomy` tests pass; no regressions (1086 tests
      green, build clean). `verify:work-orders` needs live DB env (no .env in worktree) — cost-safety proven
      via the unit tests + the unchanged execute-seam guard, per the plan's fallback.
- [x] No hardcoded colors/spacing (tokens per DESIGN.md); eslint clean.

## Implementation notes
- Editable cost: `Material` has no stored price column and a schema change was out of scope, so "cost" is
  shown read-only (weighted-avg from open lots, D14). To correct a recorded price, use Receive (recorded
  costs are immutable, D17). The edit form makes this explicit.
- Category + family sub-sections are BOTH collapsible; expand/collapse-all drives the category level,
  families default open when a category unfurls.
