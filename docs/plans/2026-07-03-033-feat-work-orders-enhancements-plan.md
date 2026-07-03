---
title: Phase 9.1 — Work Orders enhancements (op families, vessel-activity lane, archive, print/PDF, starter materials)
type: feat
status: completed
date: 2026-07-03
branch: feat/work-orders-enhancements
depth: deep
units: 8
---

## Overview

Phase 9 shipped the work-order engine (issue → execute → auto-log → approve → finalize). It only knows
rack / addition / fining / top + brix/panel observations, ships 4 templates, has no archive, no print,
single-line notes, and an empty material catalog on a fresh tenant. This phase makes work orders cover
the winery's real day: more consumable additions (yeast, bentonite, acid, chitosan, nutrient), filtration
with a filter type, tank temperature setpoints, and vessel maintenance (cleaning, sanitizing, barrel
steaming) — all depleting inventory where a supply is used. Plus a filterable done-work archive, a
beautiful printable/PDF work order, bigger expandable note areas, and starter materials preloaded on
signup so the material picker resolves every time.

## Problem Frame

The operator can't yet issue work orders for most of what a cellar actually does. Additions beyond SO₂
have no materials to pick (empty catalog). There's no way to record "clean and sanitize Tank 3" or "set
Tank 5 to 4°C for cold settling" — those aren't wine operations (no lot, no volume) and the engine has no
lane for them. Cleaning/sanitizing chemicals (proxycarb, PAA) aren't tracked or depleted. Finished work
vanishes from view (dashboard only shows open WOs). And there's no printout to hand a cellar hand or file.
Do nothing and the WO feature stays a demo that covers ~20% of the work; the operator keeps using paper
for the rest, which is exactly what Phase 9 set out to replace.

Job to be done: **"let me issue a work order for anything my crew does — including cleaning and temp
holds — have it deplete my inventory, keep a searchable record, and print a clean sheet."**

## Requirements

- **MUST:** Consolidated ADDITION covers SO₂/yeast/bentonite/acid/chitosan/nutrient/tannin/enzyme via the
  material picker (no per-material op types); every addition depletes `SupplyLot` + costs the lot (existing
  path). Add `BENTONITE`/`CHITOSAN`/`CLEANING`/`SANITIZER` material kinds.
- **MUST:** FILTRATION as a WO op with a selectable filter TYPE (pad / lees / cross-flow / sterile /
  membrane) + micron; writes the real FILTRATION op (volume-loss) with the filter detail on the treatment.
- **MUST:** A VESSEL-ACTIVITY lane for temperature setpoints (cold settling / warm to start / cool to
  arrest) and maintenance (tank cleaning, sanitization, barrel steaming) — vessel-scoped, works on an
  EMPTY tank, writes NO ledger op, no approval gate.
- **MUST:** Cleaning/sanitizing supply depletion — a maintenance task that uses a supply (proxycarb, PAA)
  decrements `SupplyLot`. Cost is OVERHEAD (never a wine COGS line — sanitizer isn't a cost of a specific
  wine), kept out of the Phase-8 cost roll-up so it can't break cost conservation.
- **MUST:** Starter materials preloaded per tenant on signup (yeast, SO₂/KMBS, nutrient, acid, tannin,
  fining, bentonite, chitosan, cleaning, sanitizer) as stock-tracked + depletable, so the picker always
  resolves. Idempotent; wired into both the seed path and a real org-creation hook.
- **MUST:** Filterable archive of done work orders (APPROVED/CANCELLED) — filter by status / date range /
  assignee / template / vessel; click into the existing detail to see everything logged.
- **MUST:** Printable / PDF work order — issuer, assignee, issued + due dates, WO #/title/status, each
  task with instructions + planned values, and GENEROUS note areas (ruled blank space before execution;
  captured completion notes/deviations after). Follows DESIGN.md tokens.
- **MUST:** Bigger, multi-line, resizable note areas on-screen (new / execute / detail) + ample note space
  on the PDF.
- **SHOULD:** Consolidate system templates to a small flexible set (Addition, Fining, Rack, Top,
  Filtration, Ferment monitor, Temperature setpoint, Tank clean/sanitize, Barrel steam) with optional
  fields — not a template per material.
- **NICE (deferred):** Crush/press (destem/press) as WO tasks; filter-media as a tracked supply.

## Scope Boundaries

**In scope:** material-kind additions + new kinds, filtration op + filter-type, the vessel-activity table +
lane (temp + cleaning/sanitizing/steaming) with lotless overhead supply depletion, starter-material seed +
onboarding hook, archive read + UI, print/PDF view, textarea notes, consolidated system templates, e2e
verify + an invariant note.

**Out of scope (with reason):**
- **Crush / press in work orders** — the transform cores (`crushLotCore`/`pressLotCore`) self-open their
  own `runLedgerWrite` inside a lot-code-race retry loop (can't nest in the WO tx), mint lots from a pick
  multi-select, and press needs a fresh `expectedRevision` at execute time. Folding them in needs
  extracted `crushLotTx`/`pressLotTx` + a dispatcher restructure — a separate later plan. Crew keeps using
  `/ferment` for destem/press meanwhile.
- **Filter media as tracked stock** — filtration records the filter type but doesn't deplete a filter-pad
  supply in v1 (media inventory = later).
- **Per-tenant PDF branding** — the print view uses the app's DESIGN.md tokens; tenant-configurable
  branding is a future capability (noted in DESIGN.md).
- **Overhead accounting posting** — cleaning-supply cost is recorded as a value snapshot on the activity
  event; posting it to an overhead GL account is a Phase-15 accounting follow-on.

## Research Summary

### Codebase Patterns
- **WO vocabulary + instantiation:** `src/lib/work-orders/template-vocabulary.ts` — `TASK_VOCABULARY` map,
  `FieldType = vessel|lot|material|number|text|rateBasis`, pure `validateTemplateSpec` +
  `instantiateTasksFromSpec` (derives A6 canonical columns). Needs a new `select` FieldType (options).
- **Execute seam (A2):** `src/lib/work-orders/execute.ts` `dispatchOperationTx` maps opType → a tx-form
  (`rackWineTx`/`recordNeutralDoseTx`/`topVesselTx`) inside ONE `runLedgerWrite`; material resolved
  pre-tx. Observation lane `src/lib/work-orders/observations.ts` (`completeObservationTaskCore` →
  `insertPanelTx`, straight to DONE, no approval). Task-completion CAS + commandId idempotency already in.
- **Additions/consume:** `recordNeutralDoseTx` (`src/lib/cellar/addition.ts`) → `consumeMaterialCore`
  (`src/lib/cost/consume.ts`, `(tx, {operationId, materialId, doseUnit, perLot})`) decrements `SupplyLot`
  + writes a MATERIAL `CostLine` per lot. `consumeMaterialCore` REQUIRES a `LotOperation` + per-lot rows —
  it cannot represent lotless (empty-vessel) consumption. `CostLine.lotId` is nullable but
  `CostLine.operationId` + `SupplyConsumption.operationId` are NOT.
- **Filtration:** `FILTRATION` is a volume-loss OperationType; `filterVesselCore`
  (`src/lib/cellar/treatments.ts`) writes the op + a `LotTreatment` per lot carrying filter detail —
  filter type is free-text `LotTreatment.medium` + `micron` (no controlled enum). Needs a `filterVesselTx`
  extraction to compose in the WO tx.
- **Materials:** `CellarMaterial.kind` is a **String** (not a Prisma enum); `MATERIAL_KINDS`
  (`src/lib/cellar/additions-math.ts`) is a const tuple; `coerceMaterialKind` falls unknowns back to
  `OTHER`. `createStockMaterialCore(actor, input)` (`src/lib/cellar/materials.ts`) creates a stock-tracked,
  depletable material (`isStockTracked`+`stockUnit`), idempotent on `(kind, normalizedKey)`, optional
  `openingQty`/`unitCost` → a costed `SupplyLot`. Must run inside `runAsTenant`.
- **Temperature/state:** no temp column on Vessel/Lot; `TEMP` analyte exists (observed reading);
  `LotStateEvent` is from→to enum transitions with a REQUIRED `lotId` (bad fit for a scalar setpoint on a
  possibly-empty tank). No vessel-scoped lotless event table exists anywhere.
- **Onboarding/seed:** no runtime org-creation flow (better-auth `organization()` plugin adopted but
  end-user flows deferred; `disableSignUp:true`; only `session.create` hooks wired). `seed-demo-tenant.ts`
  seeds zero materials. `seed-work-order-templates.ts` is the per-tenant idempotent seeder pattern to
  mirror (`runAsTenant` + check-then-create, nested creates set `tenantId` explicitly).
- **PDF/print:** `pdf-lib` (^1.17.1) + `html-to-image` (^1.11.13) installed; NO jsPDF/react-pdf/puppeteer;
  NO existing `window.print`/`@media print`. Only PDF precedent is server-side `pdf-lib` AcroForm FILLING
  (TTB forms — template-based, not free-form design). Map export shows the client-only
  `await import("html-to-image")` + `triggerDownload` pattern + a `bw-export-exclude` class for capture-only
  chrome. DESIGN.md tokens live in `src/styles/tokens/*.css` (Big Caslon display local; Inter body remote —
  print reliability note), light-only (good for paper), semantic color aliases only.
- **Tenancy:** Phase-12 9-step checklist (AGENTS.md) for any new table; `WorkOrderTaskKind` enum needs an
  isolated ADD VALUE migration (the Windows enum rule); nested creates set `tenantId` explicitly.

### Prior Learnings
- **A2 tx-form pattern** (Phase 9): a WO-composable op must be a `...Tx(tx, actor, input)` inside the
  caller's `runLedgerWrite`. Guards must live IN the Tx form (the WO seam calls it directly) — the
  Phase-9 review caught `recordNeutralDoseTx` dropping guards.
- **Nested-create RLS** (Phase 9): the tenant extension only auto-injects `tenantId` on top-level create
  data; nested creates set it explicitly or RLS rejects.
- **Windows enum rule:** new enum values land in an isolated `ALTER TYPE` migration committed before use.
- **Cost conservation (COST-1/COST-2):** the wine-cost DAG must stay clean — keep cleaning-supply
  (overhead) consumption OUT of `SupplyConsumption`/`CostLine`/the roll-up.

### External Research
None required — all mechanisms internal.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Consolidation | **Keep ADDITION/FINING generic (material picker covers all dosing materials); add ONE FILTRATION op + ONE vessel-activity lane. Few flexible templates.** | An op type per material (yeast/bentonite/acid…) | Additions already differ only by material; new op types would explode with zero benefit and break the cost mapping. Materials in the catalog + a select filter is the lever. |
| New material kinds | **Extend the `MATERIAL_KINDS` const with `BENTONITE`, `CHITOSAN`, `CLEANING`, `SANITIZER` — no migration** (`kind` is a String). | Prisma enum migration | `kind` is a validated String; a const edit is the whole change. |
| Temperature setpoint | **Model as a VESSEL-ACTIVITY (`TEMP_SETPOINT`), not an observation or LotStateEvent** | Observation w/ a `TEMP_SETPOINT` analyte; LotStateEvent | Observations require a lot (empty-tank cold-hold breaks); LotStateEvent is from→to + required lotId. A setpoint is a vessel-scoped intent — same lane as maintenance. |
| Vessel maintenance | **New tenant-scoped `VesselActivityEvent` table + a MAINTENANCE task kind; lotless, no ledger op, straight to DONE** | Overload OBSERVATION kind; reuse a lot-scoped table | No lotless vessel-event table exists; maintenance is genuinely lotless and gate-free. A clean kind beats overloading observations (which need a lot). |
| Cleaning-supply depletion | **Dedicated lotless `depleteSupplyOverheadTx` — decrement `SupplyLot`, record the use + value snapshot ON the activity event, `lotId` null, OUTSIDE the wine roll-up** | Make `SupplyConsumption.operationId` nullable + anchor to the event | `consumeMaterialCore` can't run without a `LotOperation`+per-lot; sanitizer is overhead, not wine COGS. A separate path keeps COST-1 conservation + reversal untouched. |
| Filter type | **A `select` vocab field (pad/lees/cross-flow/sterile/membrane) mapped onto the existing free-text `LotTreatment.medium` — no migration** | New enum column | The column already exists as validated text (D4); a const vocabulary + select field is enough. |
| PDF approach | **Print-CSS: a `/work-orders/[id]/print` route + `@media print` styled from DESIGN.md tokens + `window.print()` (browser Save-as-PDF)** | html-to-image→pdf-lib raster; @react-pdf/renderer | Zero new deps, reuses tokens directly for a beautiful token-driven doc, selectable text, native PDF, easy generous note areas. pdf-lib is template-fill only; react-pdf duplicates the design in a foreign layout DSL. |
| Starter materials | **Shared `seedStarterMaterials(tenantId)` via `createStockMaterialCore`; call from the seed path + wire the better-auth `organizationCreation.afterCreate` hook now** | Seed-script only | The operator wants it reliable "every time." The afterCreate hook future-proofs real onboarding; the seed-path call covers today. Idempotent, so double-firing is safe. |

## Implementation Units

### Unit 1: Material kinds + starter-material seed + onboarding hook
**Goal:** New material kinds and a per-tenant starter catalog so the picker always resolves + additions deplete.
**Files:** `src/lib/cellar/additions-math.ts` (MATERIAL_KINDS), `src/lib/cellar/materials-shared.ts` (if kind coercion lives there), `src/lib/onboarding/seed-starter-materials.ts` (new shared helper), `scripts/seed-starter-materials.ts` (new), `scripts/seed-demo-tenant.ts` (call the helper), `src/lib/auth.ts` (add `organizationCreation.afterCreate` → helper), `package.json` (script), `test/starter-materials.test.ts`.
**Approach:** Add `BENTONITE`, `CHITOSAN`, `CLEANING`, `SANITIZER` to `MATERIAL_KINDS` (const; no migration). `seedStarterMaterials(tenantId)` wraps `runAsTenant(tenantId, …)` and calls `createStockMaterialCore` (idempotent on (kind, normalizedKey)) for a curated starter list per kind (a common yeast, KMBS/SO₂, DAP nutrient, tartaric acid, a tannin, a fining agent, bentonite, chitosan, a proxycarb CLEANING, a PAA SANITIZER) with sensible `stockUnit` + `defaultBasis` and `openingQty: null` (catalog + depletable, no fake opening stock). Wire it into `seed-demo-tenant` and the org plugin `afterCreate` hook (fires on any future org creation). Mirror `seed-work-order-templates.ts` structure.
**Tests:** helper is idempotent (re-run = no dupes); seeded materials are `isStockTracked` with correct kinds; CLEANING/SANITIZER resolve (not coerced to OTHER after the const edit).
**Depends on:** none.
**Verification:** `npm run seed:starter-materials` on Demo Winery lists the catalog; re-run is a no-op.

### Unit 2: `select` vocab field + Filtration op (filterVesselTx) + filter type
**Goal:** Filtration as a WO op with a controlled filter-type picker, composed atomically like rack/addition.
**Files:** `src/lib/work-orders/template-vocabulary.ts` (add `select` FieldType + FILTRATION task type), `src/lib/cellar/treatments.ts` (extract `filterVesselTx` from `filterVesselCore`), `src/lib/work-orders/execute.ts` (dispatch FILTRATION), `src/lib/cellar/filtration-vocab.ts` (new: FILTER_MEDIA const), tests.
**Approach:** Add `FieldType "select"` carrying an options list to the vocabulary + validate against it (never free-form). Add a `FILTRATION` task type (opType FILTRATION) with fields `{ vesselId, lotId, filterType: select(FILTER_MEDIA), micron: number, note }`. Extract `filterVesselTx(tx, actor, input)` (the A2 tx-form; guards IN the Tx per the Phase-9 lesson) mapping `filterType → LotTreatment.medium` + `micron`. Add `case "FILTRATION"` to `dispatchOperationTx`. Filtration writes a real volume-loss op + treatment; no supply depletion in v1.
**Tests:** `validateTemplateSpec` rejects an out-of-vocabulary select value; `instantiateTasksFromSpec` carries filterType; filterVesselTx writes a FILTRATION op + treatment with the right medium/micron (covered in the e2e, Unit 8).
**Depends on:** none.
**Verification:** issue + complete a filtration task in Demo Winery → FILTRATION op + treatment.medium set.

### Unit 3: Vessel-activity lane (temp + cleaning/sanitizing/steaming) + lotless supply depletion
**Goal:** A vessel-scoped, lotless, gate-free task family for temperature setpoints + maintenance, depleting cleaning supplies as overhead.
**Files:** `prisma/schema.prisma` + `prisma/migrations/<ts>_vessel_activity_enums/` + `_vessel_activity_schema/` + `_vessel_activity_rls/`, `src/lib/work-orders/vessel-activity.ts` (new: `recordVesselActivityTx`, `depleteSupplyOverheadTx`), `src/lib/work-orders/execute.ts` (route MAINTENANCE kind), `src/lib/work-orders/template-vocabulary.ts` (task types), `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` (coverage), tests.
**Approach:** Isolated enum migration: `VesselActivityKind` (TEMP_SETPOINT, CLEAN, SANITIZE, STEAM, OTHER) + `ALTER TYPE WorkOrderTaskKind ADD VALUE 'MAINTENANCE'` (Windows enum rule — committed before use). New tenant-scoped `VesselActivityEvent` (tenantId+id, vesselId, kind, targetValue Decimal?, targetUnit?, materialId?, supplyLotId?, consumedQty Decimal?, consumedUnit?, valueCost Decimal?, observedAt, actor provenance, note, commandId @unique, voidedAt?) per the 9-step checklist (composite FKs to vessel/material/supplyLot, RLS, per-tenant uniques). `recordVesselActivityTx(tx, actor, input)`: create the event; if a supply is named, call `depleteSupplyOverheadTx` — FIFO-decrement the material's open `SupplyLot`(s) by the used qty (reuse the pure depletion planner), stamp the consumed qty + value snapshot on the event; NO `SupplyConsumption`/`CostLine`, NOT in the wine roll-up. Vocabulary: TEMP_SETPOINT {vesselId, targetValue, targetUnit(select °C/°F), note}; CLEAN/SANITIZE {vesselId, materialId, amount, unit, note}; STEAM {vesselId, note} — all kind MAINTENANCE. `execute.ts`: `task.kind === "MAINTENANCE"` → `completeMaintenanceTaskCore` → `recordVesselActivityTx`, straight to DONE (no approval), CAS-claim like observations, commandId-idempotent. Lifecycle/status rollup already treats DONE as terminal.
**Tests:** `recordVesselActivityTx` writes an event on an EMPTY vessel (no lot); a SANITIZE with a supply decrements the `SupplyLot` and records value, writes NO CostLine/SupplyConsumption; MAINTENANCE task → DONE, operationId null; tenant-isolation case for `vessel_activity_event`.
**Depends on:** Unit 1 (cleaning/sanitizer materials exist to deplete).
**Verification:** `npm run verify:tenant-isolation` green incl. the new table; e2e (Unit 8) covers depletion.

### Unit 4: Bigger, expandable note areas
**Goal:** Multi-line, resizable notes everywhere on-screen.
**Files:** `src/components/ui/Textarea.tsx` (new) + `src/components/ui/index.ts`, `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx`, `.../[id]/execute/ExecuteClient.tsx`, `.../[id]/WorkOrderDetailClient.tsx` (if it has a note input).
**Approach:** Add a tokenized `Textarea` ui component (multi-line, `resize: vertical`, min-height, DESIGN.md tokens, matches `Input`'s API). Replace the single-line note `<input>`s in the new-WO form + execute view with it. Auto-grow optional (min 3 rows).
**Tests:** light — component renders + is controlled (or covered by QA).
**Depends on:** none.
**Verification:** notes are multi-line + resizable in browser QA.

### Unit 5: Filterable archive of done work orders
**Goal:** See + filter completed work orders and click into their full record.
**Files:** `src/lib/work-orders/data.ts` (`getWorkOrderArchive(tenantId, filters)` + counts), `src/lib/work-orders/archive-filters.ts` (pure filter/param helpers), `src/app/(app)/work-orders/archive/page.tsx` + `ArchiveClient.tsx`, `src/app/(app)/work-orders/WorkOrdersClient.tsx` (link/tab to archive), tests.
**Approach:** `getWorkOrderArchive` reads APPROVED/CANCELLED WOs with filters {status?, from?, to?, assigneeEmail?, templateId?, vesselId?, q?} — K12-safe (explicit tenantId, `runAsTenant`), indexed on `(tenantId, status, dueAt)` (already exists) + `updatedAt`. Pure `archive-filters.ts` builds the Prisma where + parses querystring (testable). `/work-orders/archive` route (server → client) with a filter bar (date range, status, assignee, template, vessel) mirroring the Samples list pattern; rows link to the existing `/work-orders/[id]` detail (which already shows tasks/attempts/notes/deviations). Add an "Archive" affordance on the dashboard.
**Tests:** pure filter builder (each filter → correct where); bucket/sort helper on fixtures.
**Depends on:** none.
**Verification:** archive lists finalized WOs; each filter narrows correctly; row → detail.

### Unit 6: Printable / PDF work order (print view)
**Goal:** A beautiful, token-driven printable/PDF work order with generous note areas.
**Files:** `src/app/(app)/work-orders/[id]/print/page.tsx` + `PrintClient.tsx`, `src/styles/print.css` (or a scoped `@media print` block) imported in the root layout, `.../[id]/WorkOrderDetailClient.tsx` + `ArchiveClient.tsx` (a "Print / PDF" button).
**Approach:** A dedicated print route renders the WO header (WO #, title, status, issuer, assignee, issued + due dates), each task (instructions, planned values, and a NOTE AREA — ruled blank lines if the task isn't executed yet; the captured completion note/deviation if it is), styled from DESIGN.md tokens with an `@media print` sheet (hide app chrome via a `bw-export-exclude`-style class, white/cream paper, Big-Caslon title, Inter body, page-break-inside avoid per task). A "Print / PDF" button calls `window.print()` (native Save-as-PDF). Note the Inter-is-remote print caveat (fall back to a system sans in print). Ample note space is CSS min-heights + ruled lines.
**Tests:** none (visual) — browser QA in the final step.
**Depends on:** Unit 4 (shares the note-area treatment).
**Verification:** print preview shows a clean one/two-page sheet with all fields + roomy notes; Save-as-PDF looks right.

### Unit 7: Consolidated system templates + re-seed
**Goal:** A small, flexible set of system templates covering the new families.
**Files:** `scripts/seed-work-order-templates.ts` (expand SYSTEM_TEMPLATES), `test/work-order-templates.test.ts` (validate new specs).
**Approach:** Add consolidated system templates: Addition (material + rate, optional planned amount), Fining, Rack, Top, Filtration (filter-type), Ferment monitor (brix), Temperature setpoint, Tank cleaning / sanitation (material optional), Barrel steaming. Few templates, optional fields — not one per material. All validate against the extended vocabulary. Idempotent seed (existing check-then-create).
**Tests:** every new template spec passes `validateTemplateSpec`.
**Depends on:** Units 2, 3 (vocabulary must include filtration + maintenance task types).
**Verification:** `npm run seed:work-order-templates` seeds the new set; issue-from-template works for each.

### Unit 8: e2e verify + invariant note
**Goal:** Prove the new loops end-to-end and encode the overhead-supply invariant.
**Files:** `scripts/verify-work-orders.ts` (extend) or `scripts/verify-work-orders-enhancements.ts` (new) + `package.json`, `docs/architecture/invariants/WORKORDER-3-*.md` + `INVARIANTS.md`.
**Approach:** e2e in Demo Winery: seed starter materials → issue+execute an ADDITION of a seeded yeast/bentonite (SupplyLot depletes + MATERIAL cost line) → a FILTRATION (FILTRATION op + treatment.medium) → a TEMP_SETPOINT maintenance task (VesselActivityEvent, no op, DONE) → a SANITIZE on an EMPTY vessel consuming a PAA supply (SupplyLot decrements, value recorded on the event, NO CostLine/SupplyConsumption, wine roll-up unchanged) → archive read returns the finalized WOs. Invariant **WORKORDER-3**: "vessel-activity (maintenance) supply use is overhead — it decrements SupplyLot but never writes a wine CostLine/SupplyConsumption or enters the cost roll-up" (guard: the new verify). Run `verify:invariants`.
**Tests:** the script is the test.
**Depends on:** Units 1, 2, 3, 5.
**Verification:** `npm run verify:work-orders-enhancements` green; `npm run verify:invariants` green.

## Test Strategy

**Unit (vitest):** vocabulary select validation, filtration instantiation, archive filter builder, starter-material idempotency, vessel-activity core (lotless event + overhead depletion), textarea render. Mirror existing `test/work-order-*.test.ts`.
**Integration/e2e:** `verify:work-orders-enhancements` (Demo Winery full loop incl. lotless sanitize depletion + archive) + `verify:tenant-isolation` (new table) + `verify:invariants`.
**Manual/QA (browser):** issue an Addition of a seeded material; a Filtration with a filter type; a Temperature setpoint; a Tank sanitize consuming PAA on an empty tank (confirm stock drops); the archive filters; the print/PDF view; multi-line notes.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Lotless overhead depletion drifts into the wine cost roll-up | LOW | HIGH | Dedicated path writes NO SupplyConsumption/CostLine; WORKORDER-3 + verify guard; e2e asserts roll-up unchanged. |
| `WorkOrderTaskKind ADD VALUE` ordering breaks deploy (Windows enum rule) | MED | MED | Isolated enum migration committed + applied before any code/table uses MAINTENANCE. |
| Print fidelity varies by browser (margins, remote Inter font) | MED | LOW | `@media print` with page-break rules; system-font fallback in print; QA in Chrome/Edge. |
| `organizationCreation.afterCreate` hook misfires or isn't invoked (no real onboarding yet) | MED | LOW | Idempotent seed; the seed-path call covers today; hook is future-proofing, guarded by the same idempotency. |
| Vessel-activity table = another leak risk (RLS) | LOW | HIGH | 9-step checklist + behavioral isolation case + the schema-driven coverage guard. |
| Scope creep (crush/press, filter-media stock, GL posting) | MED | MED | Explicitly deferred in scope boundaries. |

## Success Criteria

- [x] Additions can use yeast/bentonite/acid/chitosan/nutrient (seeded) — each depletes SupplyLot + costs the lot.
- [x] Filtration issues with a selectable filter type; writes a real FILTRATION op + treatment medium.
- [x] Temperature setpoint + tank cleaning/sanitizing/steaming issue as vessel-activity tasks; work on an EMPTY tank; no ledger op; no approval gate.
- [x] A sanitize/clean task consuming PAA/proxycarb decrements SupplyLot; records overhead value; writes NO wine CostLine (roll-up unchanged).
- [x] New tenants get a starter material catalog automatically (seed path + afterCreateOrganization hook); idempotent.
- [x] Done work orders appear in a filterable archive (status/date/assignee/template/vessel); click → full record.
- [x] A work order prints/saves as a clean, DESIGN.md-styled PDF with issuer/assignee/dates/tasks + generous note areas.
- [x] Note areas are multi-line + resizable on-screen and roomy on the PDF.
- [x] `verify:work-orders-enhancements` (23 assertions), `verify:tenant-isolation` (82 tables), `verify:invariants` (19/19) green; WORKORDER-3 present.
- [x] All tests pass (1001); no regressions; `next build` clean.

## Build Status: COMPLETE (2026-07-03)
All 9 units built on `feat/work-orders-enhancements`, one commit per unit. 4 migrations applied to Neon
(enums → schema → RLS → FK-restrict fix). Full suite 1001 green, tsc clean, lint 0 errors, `next build`
exit 0, verify:work-orders-enhancements 23 assertions, verify:tenant-isolation 82 tables, verify:invariants
19/19. A latent schema bug (event→task FK ON DELETE SET NULL nulling the NOT-NULL tenantId) was caught by
the e2e teardown and fixed to ON DELETE RESTRICT.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Operator conversation is explicit + concrete. |
| Scope Boundaries | HIGH | Crush/press deferral is well-justified by the transform-core research. |
| Implementation Units | MEDIUM-HIGH | Additions/filtration/archive/notes/print/seed are well-mapped; the vessel-activity table + lotless overhead depletion is net-new terrain (one migration + a new consumption path) but understood. |
| Test Strategy | HIGH | Mirrors existing verify:* + vitest patterns. |
| Risk Assessment | MEDIUM-HIGH | The one real hazard (overhead depletion vs cost conservation) is contained by design + a guard. |

## Review Addendum (council: Codex/gpt-5.4 + Gemini/3.1-pro, 2026-07-03)

Full detail in `council-feedback.md`. Both models validated the spine (consolidation, MAINTENANCE as a new
kind, cleaning=overhead, crush/press deferral). **Apply these before `/work`.** Units grow to ~10.

### Required structural changes (P0 — fold into the units)
- **A1. Append-only per-lot depletion ledger.** A single `supplyLotId`/`consumedQty` on `VesselActivityEvent`
  loses provenance across a multi-lot FIFO draw and can't restore exactly. Add child table
  **`VesselActivitySupplyUse`** (tenantId+id, vesselActivityEventId, supplyLotId, materialId, qty, unit,
  unitCost, extendedCost, reversalOfSupplyUseId?) — one append-only row per depleted lot, full 9-step
  tenancy + composite FKs + explicit nested tenantId. Still OUTSIDE `SupplyConsumption`/`CostLine`/the wine
  roll-up (WORKORDER-3), but it IS the physical depletion record. **Restructures Unit 3.**
- **A2. Maintenance reversal now, not later.** Add `reverseVesselActivityTx` that restores each
  `VesselActivitySupplyUse` lot by identity (increments SupplyLot.qtyRemaining, writes a negating use row),
  and voids the event. A rejected/undone/cancelled maintenance task must restore stock. **Unit 3 + verify
  (Unit 8): consume across N lots → undo → on-hand restored, double-undo blocked.**
- **A3. Canonical `activityType` discriminator on `WorkOrderTask`.** Today the task has only `opType`
  (OPERATION) and `observationType` (OBSERVATION); the maintenance subtype can't live only in JSON or the
  archive/print/detail can't render/filter it. Add an `activityType` column (TEMP_SETPOINT | CLEAN |
  SANITIZE | STEAM | GAS), thread it through instantiation + archive filters + print + detail + execute +
  tests. (Column add on `work_order_task` — nullable, no enum needed; store as validated String like
  observationType.) **Unit 3.**
- **A4. Maintenance completion writes a `WorkOrderTaskAttempt`** (operationId=null), mirroring OBSERVATION,
  with the CAS-claim + commandId idempotency — so idempotency/history/duplicate-submit stay uniform.
  **Unit 3.**
- **A5. Filtration actual-output-volume is a completion input, NOT a hardcoded ~1% loss.** Cross-flow ~0.1%,
  pad ~3%, rotary/lees ~20%. The loss leg = pre-filtration volume − actual output (worker enters actual at
  completion; default = pre-filtration). **Unit 2.**
- **A6. Temp setpoints apply to EMPTY / PARTIAL / FULL vessels** (lot optional; the primary case is a full/
  fermenting tank — cold-settle, arrest). Fix the "empty tank" framing. **Unit 3.**

### Should-fix (accepted)
- **A7.** `select` FieldType carries option metadata; update the execute field-renderer + tests before
  FILTRATION/gas land. **A8.** Adding material kinds hits exhaustive `Record<MaterialKind,...>` label maps
  (`MaterialPicker.tsx`, `setup/expendables/ExpendablesClient.tsx`) — update every site or TS fails. **A9.**
  Extract a tested `seedStarterMaterials`/bootstrap fn; wire `organizationCreation.afterCreate` ONLY after
  confirming the installed better-auth exposes it (else the seed-path call + a manual bootstrap fn stand
  alone). **A10.** Archive/print/detail get a THIRD (maintenance) display path; paginate the archive from
  v1. **A11.** Enforce NOT NULL actual qty + unit at addition completion (planned ≠ actual). **A12.** Print:
  `page-break-inside: avoid` per task box; surface completed notes prominently in the archive rows. **A13.**
  Verify gates add: duplicate-submit replay, multi-lot FIFO overhead depletion, maintenance undo,
  org-bootstrap seeding, tenant-isolation for BOTH new tables (`vessel_activity_event` +
  `vessel_activity_supply_use`).

### Resolved product decisions (operator, 2026-07-03)
1. **Filter dictionary → real equipment list:** Pad/Sheet · Lenticular (Depth) · Cross-flow · Membrane · DE
   · Rotary Vacuum (Lees) · RO. (Unit 2 `FILTER_MEDIA`.)
2. **Inert gas / sparging → in v1:** a `GAS` vessel-activity subtype (Ar/N₂/CO₂/dry ice select), lotless,
   optional supply depletion (e.g. dry ice/CO₂ if stock-tracked). (Units 3 + 7.)
3. **Negative inventory → allow with a soft warning:** a completion that depletes a material with
   insufficient recorded stock proceeds, drives on-hand negative, surfaces a warning (never blocks the
   floor — matches WORKORDER-2 warn-not-block + D14 unknown-cost). Applies to BOTH the addition path
   (consumeMaterialCore may need a non-blocking variant/flag) and the overhead depletion path. **Verify a
   below-stock addition + a below-stock sanitize both complete + warn. (Units 1/2/3.)**
4. **Domain extras → include all three:** (a) Rack optional `rackType` select (off gross lees / off fine
   lees / clean-to-clean / délestage) mapped to the op note/reason (Unit 2/7); (b) optional "current actual
   temp" reading captured when completing a TEMP_SETPOINT (Unit 3); (c) starter catalog includes ML
   bacteria + potassium bitartrate (KHT) so MLF-inoculation + cold-stabilization ride the generic Addition
   + Temp-setpoint templates (Unit 1).
5. **Topping source (Gemini):** `topVesselTx` already requires `fromVesselId` (source decremented + costed) —
   no phantom volume; just ensure the Top system template exposes the source-vessel field (Unit 7).

### New/adjusted units
- **Unit 3** absorbs A1–A4, A6, decisions 2+4b: two new tables (`vessel_activity_event` +
  `vessel_activity_supply_use`), `activityType` column on `work_order_task`, `recordVesselActivityTx` +
  `depleteSupplyOverheadTx` (multi-lot) + `reverseVesselActivityTx`, GAS subtype, achieved-temp reading.
- **Unit 8** (verify) absorbs A2/A13 + decision 3 (multi-lot FIFO, maintenance undo, negative-stock warn,
  duplicate replay, org-bootstrap, isolation for both tables).
- New **Unit 9: negative-inventory (warn-not-block) across the addition + overhead paths** + the NOT-NULL
  actual-qty/unit completion guard (A11) — pulled out because it touches `consumeMaterialCore`/the addition
  Tx and the maintenance path together.

### Eng-review addendum (plan-eng-review, 2026-07-03)
- **E1. No negative on-hand — draw-to-zero + surface the shortfall (revises decision #3).** `consumeMaterialCore`
  already draws all available stock, decrements those lots, and returns a `shortfall` for what couldn't be
  sourced — it never blocks and never goes negative; it just currently swallows the shortfall. Unit 9
  SHRINKS to: (a) surface that `shortfall` as the soft completion warning ("used 5 kg, only 2 kg on record —
  3 kg over"), (b) apply the same draw-to-zero+shortfall pattern in `depleteSupplyOverheadTx`, (c) keep the
  NOT-NULL actual-qty/unit completion guard (A11). Do NOT introduce a negative `qtyRemaining` state.
- **E2. Archive query index.** `getWorkOrderArchive` sorts/filters finalized WOs by recency + status +
  assignee/vessel/template. Add `@@index([tenantId, status, updatedAt])` on `work_order` (the existing
  `(tenantId, status, dueAt)` index serves the dashboard, not the archive recency sort). **Unit 5.**
- **E3. Test additions (beyond A13):** `reverseVesselActivityTx` restores across N supply lots by identity;
  a below-stock completion returns + surfaces the shortfall (both addition + overhead paths); archive filter
  builder unit test per filter; `activityType` renders in archive/print/detail.
- Validated: two-table depletion ledger + `activityType` discriminator + `reverseVesselActivityTx` are
  correct and match existing patterns (SupplyConsumption/negateCostForReversedOp, opType/observationType);
  `filterVesselTx` extraction follows the proven A2 pattern; migration ordering (isolated enum → schema →
  RLS) matches the Windows enum rule. No architecture blockers.

### Design-review addendum (plan-design-review, 2026-07-03; text review — extends the QA'd Phase-9 token UI)
- **D1. Archive = "Open | Archive" segmented toggle on `/work-orders`** (NOT a separate route/nav item).
  Unit 5 simplifies: `getWorkOrderArchive` + a toggle on `WorkOrdersClient`; archive rows reuse the
  dashboard list-row (status badge, issued/completed dates, assignee, + a completed-note snippet). No
  generic card grid.
- **D2. Print note area = captured note/deviation THEN blank ruled lines beneath** (works pre- or
  post-execution). Print layout: header (WO # / title / status badge, issuer, assignee, issued + due
  dates), one task box per task (title, type, planned values, note area), `page-break-inside: avoid` per
  box, one WO per sheet (overflow to page 2), footer (printed date + signature line). Unit 6.
- **D3. Empty states:** archive empty → "No completed work orders yet — approved and cancelled orders
  land here." (Dashboard open-empty already exists from Phase 9 D1.)
- **D4. Surface the shortfall + notes (E1 + Gemini):** the low-stock shortfall shows inline on the execute
  task after completion (warning tone) + as a badge in the review queue/detail; completed notes/deviations
  surface on archive rows so the winemaker sees them without drilling in. Units 5/8/9.
- **D5. Floor/responsive + anti-slop:** new vessel-activity / filtration / gas / rack forms reuse the
  Phase-9 ≥44px floor targets + the new `Textarea`; the dashboard toggle + archive filter bar stack on
  mobile; all surfaces use DESIGN.md tokens (cream/maroon/serif), no card-grid/hero/gradient.

## Approved Mockups
None generated — the rstack designer binary was unavailable, and these surfaces extend the existing
DESIGN.md-tokened WO UI (built + browser-QA'd in Phase 9). DESIGN.md + `src/styles/tokens/*` are the
visual reference; run `/design-review` post-implementation for a live visual QA.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (Codex) | `/council` | Cross-LLM types/data/migrations | 1 | issues_found | 4 critical, 5 should-fix, 2 design-Q |
| Council (Gemini) | `/council` | Cross-LLM winemaking/UX | 1 | issues_found | 4 critical, 5 should-fix, 4 design-Q |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 findings (E1 scope-shrink, E2 index), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 7.5→9/10, 2 decisions (D1 archive toggle, D2 print notes) + 3 specs folded |

**CROSS-MODEL:** Codex + Gemini converged on the depletion-ledger + reversal structure; eng refined the
low-stock model (draw-to-zero + shortfall, not negative) + added the archive index; design set the archive
IA (toggle) + print note behavior + empty/shortfall surfacing.
**VERDICT:** Council + Eng + Design CLEARED (A1–A13 + E1–E3 + D1–D5 + 7 decisions applied). Ready for `/work`.
