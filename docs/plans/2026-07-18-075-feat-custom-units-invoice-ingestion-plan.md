---
title: Custom measurement units for material intake (+ "ton" built-in, qty/pack-size tooltips)
type: feat
status: draft
date: 2026-07-18
branch: claude/custom-units-invoice-a49844
depth: deep
units: 8
---

## Overview

Let a winery define its own measurement units at material intake — "+ Create unit" — instead of
being stuck with the built-in g/ml/L/gal set. A unit declares its dimension (weight / volume /
count) and how it relates to a base unit, so "drum = 200 kg", "tote = 1000 L", or "roll" all flow
through the cost engine correctly and get consumed in fractions. Also adds `ton` as a built-in weight
unit and adds hover tooltips clarifying what **qty** vs **pack size** mean on the ingestion screen.

The win is intake ergonomics for the winemaker: think in the units the invoice actually uses ("5
rolls of labels", "2 drums of DAP") without hand-converting to grams, while the ledger keeps storing
canonical, money-safe values under the hood.

## Problem Frame

Today three separate hard-coded unit vocabularies gate the flow — `UNITS`/`MEASURE_UNITS`
([src/lib/units/measure.ts:15](src/lib/units/measure.ts)), `STOCK_UNITS`
([src/lib/cellar/materials-shared.ts:60](src/lib/cellar/materials-shared.ts)), and `PACK_UNITS`
([src/app/(app)/setup/expendables/ingest/ingest-review-model.ts:67](src/app/(app)/setup/expendables/ingest/ingest-review-model.ts)).
A winery buying rolls of labels, drums of additive, or fruit by the ton has to mentally convert to a
built-in unit or accept a clumsy "unit + big pack size" workaround. Worse, when they enter qty and
pack size they routinely mix up which number goes where (is 500 the qty or the pack size?), which
silently corrupts inventory and cost.

Do nothing → users keep fighting the unit dropdown, mis-enter pack size, and lose trust in the cost
numbers. The job to be done: **ingest an invoice in the vendor's own units, once, correctly.**

**Product note (pressure test):** the deepest value here is *not* an arbitrary unit editor — it is
removing the qty/pack-size confusion. The tooltips (Unit 6) may deliver more real value than the unit
creator. We build both, but the tooltips are the cheap high-leverage win and should not be cut.

## Requirements

- MUST: A "+ Create unit" affordance in the intake unit dropdown(s) opening a creator modal.
- MUST: The creator captures a **dimension** (weight | volume | count) and a **conversion factor to a
  base unit** (grams for weight, mL for volume, base-count for count). Weight/volume units MUST carry
  a real factor because portions get consumed.
- MUST: Custom units persist **per-tenant** (RLS-isolated) and are reusable across future intakes.
- MUST: Custom units feed the existing cost engine correctly — a portion of a custom-unit lot depletes
  and costs exactly like a built-in unit. No fabricated $0; unknown → UNKNOWN cost (D14), never wrong.
- MUST: Add `ton` as a built-in **weight** unit (US short ton, 907184.74 g — consistent with the
  existing US-customary imperial factors), selectable everywhere the other built-ins are.
- MUST: Hover/mouseover tooltips on **Qty** and **Pack size** at intake explaining the meaning with a
  concrete example.
- MUST: Stored stock stays canonical (g / mL / unit); custom units never become a stored `stockUnit`.
- MUST: All money/tenancy gates stay green — `verify:cost`, `verify:ingest`, `verify:tenant-isolation`,
  `verify:ai-native`, `verify:parity`, `verify:naming`.
- SHOULD: Custom units also selectable in the manual "Add expendable" form (`MaterialForm`).
- SHOULD: An assistant tool so a user can say "add a unit called drum = 200 liters" (also satisfies the
  `verify:ai-native` core→tool gate for the new core).
- NICE: Display inventory back in the user's custom unit ("5 rolls") — deferred to a follow-up; v1
  converts custom→canonical at intake and displays canonical.

## Scope Boundaries

**In scope:**
- New per-tenant `CustomUnit` registry table (+ schema/RLS migrations, isolation-verifier wiring).
- Making the pure unit engine registry-aware via an **optional** `extraUnits` parameter (backward
  compatible; no signature breaks).
- `ton` built-in.
- Creator modal + "+ Create unit" in the invoice-review Pack-unit select and `MaterialForm` select.
- Qty / Pack-size tooltips (a small reusable design-token hint component).
- `createCustomUnitCore` / `listCustomUnitsCore` + server actions + one assistant tool pair.

**Out of scope (and why):**
- Storing stock in a custom unit / changing `coerceStockUnit`'s 6-unit whitelist — stock stays
  canonical, which keeps the cost core and `coerceStockUnit` untouched and the blast radius small.
- Displaying inventory/holdings back in custom units (v2; needs a display-conversion pass across many
  read surfaces — an ocean, not a lake for v1).
- Editing/deleting custom units already referenced by lots (creator + list only in v1; add
  archive/rename later, mirroring the append-only `LotCodeEvent` discipline).
- Cross-dimension conversion (mass↔volume) — the engine intentionally returns `null`; unchanged.
- Grape harvest weigh-in tonnage (a different subsystem); `ton` here is for material intake.

## Research Summary

### Codebase Patterns

- **Unit engine** — [src/lib/units/measure.ts](src/lib/units/measure.ts) (95 lines, pure, no
  prisma/React). `UNITS: Record<string, { dimension, perCanonical }>` (lines 15–29) is a plain object
  keyed by string, NOT an enum/literal union. `MeasureDimension = "mass"|"volume"|"count"` (line 10) is
  the only closed type. `resolveUnit` (49–57), `dimensionOf` (60–63), `canonicalUnitFor` (66–68),
  `convert(amount,from,to)` (75–85, returns `null` on unknown unit / cross-dimension / bad amount),
  `toCanonical` (88–94). Because every consumer signature takes `string`, a runtime registry merged
  into `UNITS` needs **no type changes** — the blockers are that the three vocab arrays are computed
  once at module load and `measure.ts` has no tenant context.
- **Three vocabularies must stay in sync:** `MEASURE_UNITS`/`UNITS` (measure.ts, engine + manual
  form), `STOCK_UNITS` (materials-shared.ts:60, the 6 canonical stored units; `coerceStockUnit`:62
  folds anything else to `"g"`), `PACK_UNITS` (ingest-review-model.ts:67, invoice-review dropdown +
  `packFieldsValid` gate). Adding a unit to only one breaks the others.
- **Cost paths all funnel through `convert()`:** `stockConversionFactor`
  ([src/lib/cost/consume.ts:19](src/lib/cost/consume.ts)) → `consumeMaterialCore` (:106, reads material
  from the injected `tx` at :110, `factor==null` → UNKNOWN, no depletion :121); `deriveOpeningLot`
  ([src/lib/cost/intake-cost.ts:22](src/lib/cost/intake-cost.ts), `convert(packageAmount,packageUnit,
  stockUnit)` :29), `costForUse` (:65). A custom-unit factor must be resolvable *at these seams*.
  Because a missed thread degrades to UNKNOWN (fail-safe), custom units can never corrupt money.
- **Per-tenant registry template** — copy `Vendor`/`VendorContact`
  ([prisma/schema.prisma:3046–3093](prisma/schema.prisma)): `tenantId String @default("")`,
  `@@unique([tenantId, name])`, `@@unique([tenantId, id])`, `@@index([tenantId])`, `@@map`. Migrations
  `prisma/migrations/20260715100100_vendor_contact_schema` (FK to `organization` + composite K11 FK in
  raw SQL) + `20260715100200_vendor_contact_rls` (ENABLE + FORCE + `tenant_isolation` USING/WITH CHECK
  + `GRANT ... TO app_rls` + self-verifying `DO $$` block). Do **NOT** add the new model to
  `GLOBAL_MODELS` ([src/lib/tenant/models.ts:17](src/lib/tenant/models.ts)); `injectTenantId` (:38)
  auto-fills tenantId. Add fixture + assertion block to
  [scripts/verify-tenant-isolation.ts](scripts/verify-tenant-isolation.ts) (mirror the vendor block at
  lines 233–234 and 561–580); its coverage guard (67–82) auto-fails a tenant table with no RLS.
- **Intake flow (Plan 072/073):** OCR extract → `IngestedInvoiceLine` staging (`unitRaw` free string,
  no conversion) → human review (`IngestReviewClient`) → `applyIngestedInvoiceCore`
  ([src/lib/ingest/ingest-invoice-core.ts:209](src/lib/ingest/ingest-invoice-core.ts)).
  `normalizeLineToStock` ([src/lib/ingest/normalize-line.ts:44](src/lib/ingest/normalize-line.ts)):
  `packageAmount = qty × parsed.amount` → `deriveOpeningLot`. `stockUnitForNewLine` (:196) derives a
  NEW material's canonical stock unit from the pack unit's dimension.
- **Intake UI** — [IngestReviewClient.tsx](src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx):
  `LineRow` (468–591), Qty input (:538), Pack size = Amount input (:549) + Unit `<select>` over
  `PACK_UNITS` (:552–557), header labels (:293), field labels (:568–569). There is a "＋ Create new
  material" option precedent (:500). Manual form —
  [MaterialForm.tsx:185](src/components/cellar/MaterialForm.tsx) maps the unit select over
  `MEASURE_UNITS`. **No tooltip component exists today** — labels are plain spans.
- **Category is the cost-safety authority, orthogonal to units.** `isDoseableCategory` is an allowlist
  on the **stored** `CellarMaterial.category`
  ([src/lib/cellar/material-taxonomy.ts:145](src/lib/cellar/material-taxonomy.ts)). Units must never
  change doseability; a PACKAGING material in a custom unit stays non-doseable.

### Prior Learnings

- `intake-ap-uom-gotchas` — **Invoice units ≠ stock units.** `receiveSupplyCore` takes qty already in
  the canonical stock unit; package→stock conversion lives ONLY in `deriveOpeningLot`/`convert`. Custom
  units MUST run through that normalization seam, never around it. `createStockMaterialCore` emits no
  A/P (create @ zero, then `receiveSupplyCore` per line). Cost cores take an injected `tx` and never
  open their own.
- `plan036-expendables-intake-modal` / `plan034` — STORED category is the authority; never re-derive
  doseability from `kind`. `coerceMaterialCategory` unknown → `UNCLASSIFIED` (non-doseable sink).
- `plan069-vendor-management-shipped` / Plan 072 `vendor_material_code` — the exact per-tenant registry
  template, built to the Phase-12 checklist (the closest precedent to `CustomUnit`).
- No rstack learning or context-ledger decision covers custom units — this ground is unbroken (log a
  new learning + a `/decision` for the engine-registry seam).
- Operational: after schema change run `tsc --noEmit --incremental false`; build/verify in the MAIN
  checkout (has `.env`), not `.claude/worktrees`; `verify:cost` may need a Demo `accounting_delivery`
  orphan scrub before it runs.

### External Research
Not needed — no new framework/API; Prisma + Next 16 patterns already established in-repo.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Custom-unit shape | `{ name, dimension, perCanonical }` — identical to a built-in `UNITS` row | Bespoke package/unit schema | A custom unit and `ton` become the *same thing*; the engine already handles this shape. |
| Where custom units live in math | At the **intake/display boundary only**; stored stock + cost core stay 100% canonical (g/mL/unit) | Allow custom `stockUnit` (relax `coerceStockUnit`) | Keeps `coerceStockUnit` + cost math untouched → tiny blast radius, no money-core edits. |
| Engine registry seam | Optional `extraUnits?: Record<string,UnitDef>` param on `resolveUnit`/`convert`/`dimensionOf`/`canonicalUnitFor`/`toCanonical`; loaded from the injected `tx` at cost seams | Make `measure.ts` read the DB | Preserves purity/testability; backward compatible; a missed thread fails **safe** (UNKNOWN, D14). |
| Persistence | New per-tenant `CustomUnit` table (RLS), copy `Vendor` | Tenant-settings JSON blob | Uniqueness, RLS, queryability, assistant tool, and lineage all want a real table. |
| `ton` definition | US short ton = 907184.74 g | Metric tonne (1,000,000 g) | Matches existing US-customary imperial factors and US wine-industry tonnage; alias `tonne`/`mt`. |
| Count-unit factor | Count custom unit carries `perCanonical` = "base counts per unit" (default 1); e.g. roll=500 labels | Force count 1:1 only | Supports both "think in rolls" (perCanonical>1, stock in labels) and a pure display alias (=1). |
| Reserved names | Creator rejects names that collide with a built-in or alias (case-insensitive) | Allow shadowing | A tenant unit shadowing `kg` would silently corrupt conversions. |

## Implementation Units

### Unit 1: Add `ton` as a built-in weight unit

**Goal:** `ton` selectable and convertible everywhere the built-ins are.
**Files:** [src/lib/units/measure.ts](src/lib/units/measure.ts),
[src/app/(app)/setup/expendables/ingest/ingest-review-model.ts](src/app/(app)/setup/expendables/ingest/ingest-review-model.ts),
[test/measure.test.ts](test/measure.test.ts).
**Approach:** Add `ton: { dimension: "mass", perCanonical: 907184.74 }` to `UNITS` (measure.ts:15–29);
add aliases `tons`/`tonne`/`mt`/`t` to `ALIASES` (35–46). Add `"ton"` to `PACK_UNITS`
(ingest-review-model.ts:67). `MEASURE_UNITS` picks it up automatically (manual form). `STOCK_UNITS`
stays unchanged — a ton-stocked material correctly folds to canonical `g`.
**Tests:** `convert(1,"ton","kg") === 907.18474`; `convert(2,"ton","g")`; alias `resolveUnit("tonne")`;
`packFieldsValid` accepts a `ton` pack unit.
**Depends on:** none
**Execution note:** test-first (pure math).
**Verification:** `npm test test/measure.test.ts`; ton appears in both dropdowns.

### Unit 2: `CustomUnit` per-tenant table + RLS + isolation verifier

**Goal:** A tenant-scoped, RLS-isolated registry for user-defined units.
**Files:** [prisma/schema.prisma](prisma/schema.prisma), two new migration dirs under
`prisma/migrations/` (`..._custom_unit_schema`, `..._custom_unit_rls`),
[scripts/verify-tenant-isolation.ts](scripts/verify-tenant-isolation.ts),
[test/tenant-isolation.test.ts](test/tenant-isolation.test.ts).
**Approach:** Model `CustomUnit { tenantId String @default(""); id String @id @default(cuid()); name
String; normalizedName String; dimension String; perCanonical Decimal; label String?; createdBy String?;
createdAt; updatedAt; @@unique([tenantId, normalizedName]); @@unique([tenantId, id]); @@index([tenantId]);
@@map("custom_unit") }`. Copy the `Vendor` migration pair verbatim: schema migration adds column/indexes
+ FK to `organization(id)` ON DELETE RESTRICT; RLS migration does ENABLE + FORCE + `tenant_isolation`
(USING **and** WITH CHECK on `current_setting('app.tenant_id', true)`) + `GRANT SELECT,INSERT,UPDATE,
DELETE TO app_rls` + the self-verifying `DO $$` block. Do NOT touch `GLOBAL_MODELS`. Add a seed fixture
+ positive/negative assertion block to the verifier (mirror vendor lines 233–234 / 561–580).
**Tests:** `verify:tenant-isolation` coverage guard passes; cross-tenant read returns 0 rows; foreign
`tenantId` INSERT rejected by WITH CHECK.
**Depends on:** none
**Verification:** `npm run db:migrate` then `npm run verify:tenant-isolation`.

### Unit 3: Make the unit engine registry-aware (optional `extraUnits`)

**Goal:** `convert`/`resolveUnit`/etc. can see tenant custom units without losing purity.
**Files:** [src/lib/units/measure.ts](src/lib/units/measure.ts), new
`src/lib/units/custom-units.ts` (loader), [test/measure.test.ts](test/measure.test.ts).
**Approach:** Add an optional last param `extraUnits?: Record<string, { dimension: MeasureDimension;
perCanonical: number }>` to `resolveUnit`, `dimensionOf`, `canonicalUnitFor`, `convert`, `toCanonical`.
Resolution order: exact built-in → lowercased → alias → `extraUnits[name]` / `extraUnits` lowercased.
`measure.ts` stays pure/DB-less. New `custom-units.ts`: `loadCustomUnits(tx, tenantId)` returns the
`Record` from `tx.customUnit.findMany`, and a pure `toExtraUnits(rows)` mapper. All existing calls keep
working (param optional).
**Tests:** `convert(2,"drum","g",{drum:{dimension:"mass",perCanonical:200000}}) === 400000`; unknown
custom → `null`; built-ins still resolve with no `extraUnits`.
**Depends on:** Unit 2 (Prisma client has `customUnit`).
**Execution note:** test-first.
**Verification:** `npm test test/measure.test.ts`; `tsc --noEmit --incremental false` clean.

### Unit 4: Thread custom units into the cost/intake seams

**Goal:** Portions of a custom-unit lot deplete and cost correctly.
**Files:** [src/lib/cost/intake-cost.ts](src/lib/cost/intake-cost.ts),
[src/lib/cost/consume.ts](src/lib/cost/consume.ts),
[src/lib/ingest/normalize-line.ts](src/lib/ingest/normalize-line.ts),
[src/lib/ingest/ingest-invoice-core.ts](src/lib/ingest/ingest-invoice-core.ts),
[src/lib/cellar/material-fields.ts](src/lib/cellar/material-fields.ts).
**Approach:** Pass an `extraUnits` map through the `convert` calls at the money seams:
`deriveOpeningLot`/`costForUse` (intake-cost.ts:29,74), `stockConversionFactor`/`consumeMaterialCore`
(consume.ts:19,117 — load via `loadCustomUnits(tx, tenantId)` from the same injected `tx`),
`normalizeLineToStock` (normalize-line.ts:55) and `stockUnitForNewLine`/apply (ingest-invoice-core.ts:196,
377). `deriveOpeningLot` gains an optional `extraUnits` param (default `{}` → today's behavior). Keep
canonical storage: `stockUnitForNewLine` still returns canonical g/mL/unit for a custom pack unit via its
dimension. **Guard:** if a custom unit fails to resolve at a seam, behavior must be UNKNOWN cost (D14),
never a coerced/fabricated value — assert this.
**Tests:** cost-preview for a `drum` (200 kg) invoice line → correct stockQty (g) + unitCost/g; a
partial consume of that lot draws down + costs like kg; unresolved custom → UNKNOWN, no depletion.
**Depends on:** Units 2, 3
**Verification:** `npm test test/intake-cost.test.ts`; `npm run verify:cost`.

### Unit 5: `createCustomUnitCore` / `listCustomUnitsCore` + actions

**Goal:** Server-side create/list of custom units with validation.
**Files:** new `src/lib/units/custom-unit-core.ts`, new `src/lib/units/actions.ts` (or extend an existing
setup actions module), [test/custom-unit-core.test.ts](test/custom-unit-core.test.ts).
**Approach:** `createCustomUnitCore(input, injectedTx?)` mirroring the material-core tx pattern
(materials.ts:361 "reuse injected tx or open own"). Validate: `name` non-empty ≤ 32 chars; `normalizedName`
lowercased/trimmed; `dimension ∈ {mass,volume,count}`; `perCanonical` finite `> 0` (default 1 for count);
**reject reserved names** that `resolveUnit` already resolves (built-in or alias) — no shadowing;
per-tenant unique (rely on `@@unique([tenantId, normalizedName])`, catch P2002 → friendly error). Return
`{ ok:false, error }` on failure (never throw ActionError — prod redaction gotcha). `listCustomUnitsCore`
= `tx.customUnit.findMany` ordered by name.
**Tests:** create drum(mass,200000) ok; duplicate name rejected; reserved `kg` rejected; `perCanonical<=0`
rejected; count defaults to 1.
**Depends on:** Unit 2
**Verification:** `npm test test/custom-unit-core.test.ts`.

### Unit 6: Qty vs Pack-size tooltips (reusable hint)

**Goal:** Users stop mixing up qty and pack size.
**Files:** new `src/components/ui/InfoHint.tsx` (design-token tooltip), consult
[DESIGN.md](DESIGN.md),
[src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx](src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx),
[src/components/cellar/MaterialForm.tsx](src/components/cellar/MaterialForm.tsx).
**Approach:** Small accessible `InfoHint` (an "ⓘ" affordance, hover + focus, tokens only, no hardcoded
colors; reduced-motion aware) rendering copy: **Qty** = "How many packages you received. Example: 5 rolls
of labels → Qty = 5." **Pack size** = "How many base items are in one package. Example: 500 labels per
roll → Pack size = 500. Unit is the package (e.g. 'roll' or 'unit')." Place next to the header labels
(IngestReviewClient.tsx:293) and the field labels (:568–569), and by the manual form's amount/unit
(MaterialForm.tsx:184–190). Read DESIGN.md before styling.
**Tests:** component render test if a DOM test harness exists (repo has no jsdom/RTL for some UI — if
absent, keep logic trivial and manual-QA per the repo convention); otherwise snapshot the copy strings
from a pure `hints.ts` constant so wording is testable.
**Depends on:** none
**Verification:** browser QA on Demo Winery — hover Qty/Pack size on the ingest review screen, tooltip
shows the example; matches DESIGN.md.

### Unit 7: "+ Create unit" affordance + registry-merged dropdowns

**Goal:** Users can create a unit inline and pick custom units at intake and in the manual form.
**Files:** new `src/components/units/CreateUnitModal.tsx`,
[src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx](src/app/(app)/setup/expendables/ingest/IngestReviewClient.tsx),
[src/app/(app)/setup/expendables/ingest/ingest-review-model.ts](src/app/(app)/setup/expendables/ingest/ingest-review-model.ts),
[src/components/cellar/MaterialForm.tsx](src/components/cellar/MaterialForm.tsx), the ingest route
`page.tsx` loader (to supply the tenant's custom units to the client).
**Approach:** Modal fields: Name, Type (weight/volume/count radio), and a factor input whose label
adapts — weight: "1 <name> = ___ (pick reference unit: kg/g/lb/oz/ton)"; volume: "1 <name> = ___
(L/mL/gal/fl oz)"; count: "1 <name> = ___ base items (default 1)". Convert the entered reference amount to
`perCanonical` via the engine before calling `createCustomUnitCore`. Merge built-in `PACK_UNITS`/
`MEASURE_UNITS` with the tenant's custom-unit names for the `<select>` options (append a "+ Create unit…"
item like the existing "＋ Create new material" at :500). On successful create, add to the option list and
select it. Keep controlled-input rules: use the native `<select>` (works with the flow); the modal's text
inputs follow the controlled-input QA note (click ref + type, native setter). Validation surfaced from the
core's `{ok:false,error}`.
**Tests:** pure model test that merged options include custom names + de-dupe against built-ins; manual
browser QA for the modal round-trip.
**Depends on:** Units 3, 5
**Verification:** browser QA on Demo — create "drum", it appears in the Pack-unit select, ingest a line in
drums, Confirm passes, lot stored in canonical g.

### Unit 8: Assistant tool + verify gates green

**Goal:** Assistant can create/list custom units; all gates pass.
**Files:** new `src/lib/assistant/tools/create-custom-unit.ts` + `query-custom-units.ts` (+ registry
wiring), the assistant tool eval/golden fixtures, a new parity note under `docs/architecture/parity/`,
[scripts/ai-native-allowlist.mjs](scripts/ai-native-allowlist.mjs) if needed.
**Approach:** `create_custom_unit` wraps `createCustomUnitCore` (satisfies the `verify:ai-native`
core→tool graph); `query_custom_units` wraps `listCustomUnitsCore`. Follow the existing tool pattern
(query_materials/create_vendor). Add golden eval case(s) per the D26/H8 rule (a write tool needs a
golden). Add a parity note pointing at the real files. Re-run the full gate set.
**Tests:** assistant golden eval for "add a unit called drum equal to 200 kg" proposes the write;
`query_custom_units` returns the list.
**Depends on:** Unit 5
**Verification:** `npm run verify:ai-native`, `verify:parity`, `verify:cost`, `verify:ingest`,
`verify:tenant-isolation`, `verify:naming` all green; `tsc --noEmit --incremental false` + `npm run lint`.

## Test Strategy

**Unit tests:** pure engine (`test/measure.test.ts`) for `ton` + `extraUnits`; `test/intake-cost.test.ts`
for custom-unit cost math; `test/custom-unit-core.test.ts` for validation; pure model tests for merged
dropdown options and tooltip copy constants.
**Integration / DB:** `verify:cost` (custom weight unit end-to-end), `verify:ingest`,
`verify:tenant-isolation` (new RLS table), run against Neon from the MAIN checkout.
**Manual verification (Demo Winery, QA-* fixtures):** ingest an invoice, "+ Create unit" → "drum = 200
kg", pick it on a line, set Qty/Pack size, hover both tooltips, Confirm; then a `runAsTenant` script reads
the `SupplyLot` back to prove it stored canonical grams at the right unit cost. Clean up QA-* after;
`verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A `convert()` call site not threaded with `extraUnits` → custom unit invisible | MED | LOW | Fails **safe** to UNKNOWN cost (D14), never wrong $. Grep all `convert(`/`resolveUnit(` callers; assert UNKNOWN in a test. |
| Custom unit name shadows a built-in (`kg`) → silent mis-conversion | LOW | HIGH | Creator rejects any name `resolveUnit` already resolves (built-in or alias), case-insensitive. |
| Three vocab arrays drift (unit added to one, not others) | MED | MED | Unit 1 touches all three for `ton`; dropdowns merge from the registry so customs stay in sync automatically. |
| Count-unit semantics confuse users (roll = 1 vs 500) | MED | MED | Creator asks "1 roll = ___ base items"; tooltips + example copy; canonical storage means the number is unambiguous downstream. |
| RLS table missing a checklist step → leak or broken table | LOW | HIGH | Copy `Vendor` pair verbatim; `verify:tenant-isolation` coverage guard fails closed if RLS absent. |
| Cost core edits ripple into money math | LOW | HIGH | Stock stays canonical; core signatures unchanged except an optional `extraUnits` default `{}`; `verify:cost` gate. |

## Success Criteria

- [ ] `ton` converts correctly and is selectable in the manual form + invoice-review dropdowns.
- [ ] A user can "+ Create unit" (weight/volume/count) at intake and immediately use it on a line.
- [ ] Custom units persist per-tenant, RLS-isolated; `verify:tenant-isolation` green.
- [ ] A partial consume of a custom-unit lot depletes + costs identically to a built-in unit; unresolved
      custom → UNKNOWN cost, never fabricated; `verify:cost` green.
- [ ] Qty and Pack-size tooltips show the concrete examples and match DESIGN.md.
- [ ] Reserved-name and duplicate-name creates are rejected with a friendly error.
- [ ] Assistant `create_custom_unit`/`query_custom_units` work; `verify:ai-native` + `verify:parity` green.
- [ ] All tests pass; no regressions; `tsc --noEmit --incremental false` + `lint` clean.
