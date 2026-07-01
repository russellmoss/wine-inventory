---
title: TTB F 5120.17 Compliance & Reporting Engine (Phase 14 v1)
type: feat
status: completed
date: 2026-07-01
branch: main
depth: deep
units: 13
---

## Overview

Auto-generate the federal **TTB F 5120.17 (Report of Wine Premises Operations)** from the
append-only lot ledger: fold every operation into Part I §A (bulk) / §B (bottled) line totals,
keyed by an auto-derived 6-value tax class, in US gallons, with per-lot audit backing, an AI
anomaly check, a human-review-before-file screen, and a downloadable filled PDF. This is **table
stakes** — both incumbents generate the 5120.17 and we cannot sell to a US winery without it. Our
edge: it falls out of an auditable event log automatically, the only new winemaker input is ABV.

## Problem Frame

A US bonded winery must file the 5120.17 by the 15th after each period (monthly by default). Today
the app captures every volumetric event in the ledger but has **no** tax classification, **no**
tax-determination (bond-removal) event, and **no** report engine. A winemaker's job-to-be-done:
"produce a correct, defensible monthly report in minutes, not a weekend of spreadsheet
reconciliation." Doing nothing means we are unsellable to the US market — the near-term lead phase.

**Product pressure test:** The right problem is *ease + auditability*, not form-filling. The
incumbents make you hand-classify wine and hand-key the report; we auto-derive both from the ledger
and only ask for ABV (which winemakers measure for the label anyway). The risk of over-building is
real — federal Part I + the schema classifications is the beachhead; excise (5000.24), CBMA credits,
and 50-state DTC are explicitly deferred follow-ons, not v1.

## Requirements

- **MUST** derive **tax class** automatically (6 values: a ≤16% · b >16–21% · c >21–24% ·
  d artificially carbonated · e sparkling [BF/BP split] · f hard cider) from ABV + still/sparkling
  flag + carbonation method + product type. Never hand-picked; manual override on the review screen.
- **MUST** require **ABV** on the BOTTLE operation and derive tax class from it; support ABV
  capture earlier on the bulk lot; backfill a default for existing lots.
- **MUST** model **tax determination** as a reversible ledger operation (`REMOVE_TAXPAID`,
  form lines A14/B8), slotted into the existing dispatcher + plan-024 reversal system.
- **MUST** compute on-hand **begin/end** as period-boundary folds of the ledger (by `observedAt`),
  reconciling A "on hand end" → next period's "on hand beginning" (form instruction 4).
- **MUST** encode the operation→line-item map + footnote rules: §A13 == §B2; BLEND on line 5/20
  only when it crosses tax classes (ftn 5); sparkling BF/BP split (ftn 2/3); shortages/losses
  require a Part X explanation (ftn 4).
- **MUST** produce a human-review-before-file **screen** (derived numbers + per-lot audit backing +
  per-lot override + Part X remarks) and a downloadable **filled TTB 5120.17 PDF**. Never auto-submit.
- **MUST** support report **versions** (Original / Amended / Final); corrections flow via the
  plan-024 undo/CORRECTION system → regenerate → mark Amended with a Part X explanation.
- **MUST** run an **AI anomaly check** ("this month's losses are 5× usual", "am I ready to file",
  A13≠B2, missing ABV, unexplained shortages) reusing the existing Anthropic client.
- **MUST** be tenant-scoped + RLS-isolated per the AGENTS.md Phase-12 checklist (every new table).
- **SHOULD** cross-check the folded period-end against the live `VesselLot`/`BottledLotState`
  projections when period-end == now.
- **NICE:** Parts III/IV/VI–IX as noted stubs on the review screen (labeled "not in v1").
- **DEFERRED (not v1):** Excise F 5000.24 + CBMA credits; Pay.gov e-file; state/DTC
  (ShipCompliant/Avalara). Captured in "Deferred follow-ons" with current figures for the next plan.

## Scope Boundaries

**In scope (v1):** Federal 5120.17 **Part I §A + §B**, all 6 tax classes, gallons + **Part X**
remarks; the schema classifications (taxClass derivation inputs + the tax-determination op +
removal-reason taxonomy); the fold/generation engine; the review-before-file screen; the filled
AcroForm PDF; the AI anomaly check; per-tenant compliance profile (EIN/registry/premises/cadence).

**Out of scope (deferred within Phase 14, documented not built):** Excise return F 5000.24 & CBMA
small-producer credits; Pay.gov e-file / auto-submit; state + DTC compliance (ShipCompliant/Avalara);
Parts III/IV/VI–IX computation (v1 renders labeled stubs only). Rationale: hold the beachhead line;
grape-first design partners don't need d/f capture UI or excise math on day one.

## Research Summary

### Codebase Patterns

**Ledger spine (the source of every number).**
- Chokepoint: `writeLotOperation(tx, WriteOpInput)` in `src/lib/ledger/write.ts:109-277`, wrapped by
  `runLedgerWrite(fn)` (`:42-69`, SERIALIZABLE + P2034 retry + tenant ALS). `metadata` is stamped by
  a follow-up `tx.lotOperation.update` (write.ts does not take metadata directly).
- `LotOperation` (`prisma/schema.prisma:1056-1087`): `id` (monotonic fold order), `tenantId`, `type`
  (OperationType), `observedAt` (backdatable event date — **the fold key**), `enteredAt`, `enteredBy`,
  `captureMethod`, `note`, `correctsOperationId` (@unique, reversal linkage), `batchId`, `commandId`,
  `metadata Json?`.
- `LotOperationLine` (`:1092-1118`): `operationId`, `lotId`, `vesselId?` (null = external counter-
  account), `deltaL Decimal(10,2)` (**liters, centiliter granularity**), `reason String?`
  (e.g. "loss", "crush_origination", "dosage"), `bucket LedgerBucket` (VESSEL / EXTERNAL /
  BOTTLE_STORAGE), `bottleDelta Int?`, `lotCode`, `vesselCode` (durable snapshots).
- **22 operation types** (`OperationType` enum `:860-891`, mirrored `src/lib/ledger/vocabulary.ts:9-35`):
  SEED, RACK, LOSS, ADJUST, DEPLETE, BOTTLE, CORRECTION, ADDITION, TOPPING, FINING, FILTRATION,
  CAP_MGMT, BLEND, CRUSH, PRESS, SAIGNEE, TIRAGE, RIDDLING, DISGORGEMENT, DOSAGE, FINISH.
- **Adding a new op end-to-end** (template = Phase-6 transforms): (1) enum value in an **isolated
  enum-only migration** (Postgres `ALTER TYPE ADD VALUE` can't nest with other DDL); (2) mirror in
  `vocabulary.ts`; (3) core dispatcher `src/lib/<domain>/<op>-core.ts` (validate → `plan*()` lines →
  `writeLotOperation` → stamp metadata → detail rows → audit); (4) reversal core; (5) register family
  in `reversibilityOf()` + `reverseOperationCore()` switch (`src/lib/ledger/reverse.ts:76-153`);
  (6) planner in `src/lib/ledger/math.ts`; (7) `"use server"` action wrapper.
- **Reversal (plan 024):** `reverseOperationCore(actor, {operationId, note})` (`reverse.ts:106-153`),
  families cellar/rack/sparkling/bottle/transform/blend. A reversal is an appended `CORRECTION` op
  with `correctsOperationId` set and exact-negated inverse lines; `@unique(correctsOperationId)`
  blocks double-reversal; "reverted" state is derived from `op.correctedBy.length > 0`.

**Classification inputs (where the data is / isn't).**
- **ABV exists only as a chemistry reading** — `ALCOHOL` analyte (`src/lib/chemistry/analytes.ts`,
  `% ABV`) recorded as an immutable `AnalysisReading`. It is **NOT** stored on `Lot`, `BottlingRun`,
  or `BottledLotState`. → see Fork 1.
- **Sparkling BF/BP is derivable today:** `SparklingMethod` enum (`schema.prisma:922-926`)
  TRADITIONAL (bottle-fermented = **BF**) · TANK (bulk process = **BP**) · PETNAT (BF). Lives on
  `WineSku.method` (`:575`) and `BottledLotState.method` (`:1224`); set by TIRAGE
  (`src/lib/sparkling/tirage-core.ts`).
- **Product type + carbonation do NOT exist** — no grape/apple/pear, no artificial-carbonation flag.
  Tax classes **(d)** and **(f)** have no derivation source. → see Fork 2.
- **Bulk vs bottled:** `LotForm` (`:851-858`) FRUIT/MUST/JUICE/WINE/BOTTLED_IN_PROCESS/FINISHED.
  Bulk wine = `WINE` in a vessel (`VesselLot`); sparkling in-process = `BOTTLED_IN_PROCESS` +
  `BottledLotState`; still finished = `BottlingRun` → `WineSku`/finished goods. → §B on-hand must
  **union** BottledLotState (sparkling in-process) + finished-goods (still). Captured as a fold-unit
  concern (Risk R4).
- **Bottling:** `BottlingInput` (`src/lib/bottling/run.ts:11-22`), `applyBottling()`/`executeBottling()`,
  shared `materializeFinishedGoods()` (`src/lib/bottling/materialize.ts`), form
  `src/app/(app)/bottling/BottlingClient.tsx`.

**Projections & folds.** `VesselLot` (`:1123-1137`, live "now" snapshot, `updatedAt`, no history) and
`BottledLotState` — both are current-state projections, **not** point-in-time. There is **no** as-of
balance helper. The canonical balance is the ledger **folded in `operationId` (autoincrement) order**
(INVARIANT #7: "always equals the fold"), via `foldLines()` (`src/lib/ledger/math.ts:59-78`, sweeps
functional-zero ≤0.01L) — **not** ordered by `observedAt`. → a period-boundary balance = take lines
whose `operation.observedAt` is `< start` (begin) or `≤ end` (end), then fold them **in operationId
order** with `foldLines()` (correctly handles backdated ops: low `observedAt`, high `id`). Reuse
`foldLines`; the projections are a cross-check when period-end == now.

**Tenant context (plan 023).** `runAsTenant(tenantId, fn)` (`src/lib/tenant/context.ts:30`),
`runInTenantTx()` (`tx.ts:16`), `runAsSystem(db=>...)` (`system.ts:23`); the extended `prisma`
auto-injects `tenantId`. K12 caveat: never read the ALS tenant inside a cached fn — pass `tenantId`
as an explicit arg to report queries. `AppSettings` (`:962-973`, per-tenant `@@unique([tenantId])`,
`sparklingEnabled`) is the template for a per-tenant compliance-profile row.

**AI & PDF.** Assistant already uses `new Anthropic()` from `@anthropic-ai/sdk` (`^0.105.0`) at
`src/lib/assistant/run.ts:78` — the anomaly check reuses this client server-side. **No PDF library is
installed** → add `pdf-lib` (pure-JS, fills AcroForm). The TTB PDF **is** a fillable AcroForm (686
`/Tx` widgets) but field names are **non-semantic** (`Text30`, `Text89`…) and positions are
extractable via widget `/Rect` → a calibration step builds a stable line×column→field JSON map.

**Units.** Canonical storage = liters, `Decimal(10,2)`; convert L→US-gal ÷ **3.785411784** at the
report boundary (VISION D8). Round each cell to 2 dp to match the form's `0.00` totals.

### Prior Learnings
- **Windows migrations:** `migrate diff` → strip the phantom `search_vector` diff → `migrate deploy`
  → `db:generate`; **stop the dev server before generate**; enum values in **isolated** migrations.
  (Memory: prisma-neon-migrations-windows.)
- **Phase-12 checklist** (AGENTS.md) is mandatory for every new tenant table: `tenantId @default("")`
  + index + FK→organization(id) ON DELETE RESTRICT; backfill → NOT NULL; per-tenant uniques; RLS
  ENABLE + FORCE + `tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.tenant_id',
  true)`); not in GLOBAL_MODELS denylist; app_rls DML grant; verify-tenant-isolation case.
- **Universal undo (024a/b)** is the correction path — reuse `reverseOperationCore`, don't invent a
  new correction mechanism (Memory: universal-timeline-undo-024a).

### External Research (for the DEFERRED section only — do not build in v1)
- **Excise F 5000.24** (semimonthly default). Pre-credit rates/wine-gal (27 CFR §24.270, rev.
  2024-11-06): ≤16% **$1.07** · >16–21% **$1.57** · >21–24% **$3.15** · artificially carbonated
  **$3.30** · sparkling **$3.40** · hard cider **$0.226**.
- **CBMA credit** (permanent since 2021), first 750k gal/yr: **$1.00** (first 30k) · **$0.90** (next
  100k) · **$0.535** (next 620k); hard cider credits **6.2¢/5.6¢/3.3¢**. Import claims via myTTB
  since 2023 (domestic producer just takes the credit on its return).
- **Cadence tests are two separate things** (commonly conflated): *return* (§24.271, $ liability) —
  annual ≤$1,000, quarterly ≤$50,000, else semimonthly; *operations report* (§24.300(g)(2), gallons,
  gated on the matching return cadence) — annual if <20,000 gal in any month, quarterly if <60,000
  gal in any quarter, else monthly.
- **State/DTC:** Sovos ShipCompliant (AutoFile) + Avalara AvaTax for Beverage Alcohol handle 50-state
  sales/use + excise + gallonage + license tracking; a deferred sub-phase **integrates** rather than
  reimplements. Sources cited in the deferred-scope appendix.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Tax class | Auto-derived 6-value `WineTaxClass` enum; override on review screen | Hand-pick | Ease-of-use core; only new input is ABV |
| Sparkling BF/BP | **Derived** from `SparklingMethod` (TRADITIONAL/PETNAT=BF, TANK=BP), not a new enum value | 8th enum value | Data already exists; ftn 2/3 is a render-time split |
| Tax determination | New reversible op `REMOVE_TAXPAID` (A14/B8) with a `disposition` reason enum for the other removal/used-for lines | Op-per-disposition; passive flag | Wine is born in-bond; the taxable event is the removal; reuses `reason` + the 024 dispatcher |
| Removal reasons | One `RemovalDisposition` taxonomy on the op → maps to lines A14–A23 / B8–B14 | Many op types | The form's lines are dispositions of one "removed/used" event; a taxonomy is the clean mapping |
| On-hand begin/end | Fold ledger by `observedAt` (< start = begin; ≤ end = end); cross-check projections when end==now | Read projections | Projections have no history; ledger is the D2 source of truth |
| Corrections | plan-024 `reverseOperationCore` → regenerate → mark report **Amended** + Part X | New correction path | Honors D6/D15; one correction mechanism |
| Report storage | `ComplianceReport` table snapshots the computed lines + overrides + remarks + version chain | Recompute-only | Amended/Final chain, filing audit, immutable filed snapshot |
| PDF | `pdf-lib` fills the checked-in AcroForm via a calibrated line×col→field JSON map | Draw overlay; HTML→PDF | Real fillable form; deterministic, offline, no service |
| Schema now | Land taxClass inputs + op + reasons now with trivial backfill (no US data yet) | Retrofit later | Cheaper before ops accrue (decision #7) |

### Forks for the human (genuine, discovered in code) — RESOLVED

**RESOLVED 2026-07-01:** Fork 1 → **1A** (required ABV at bottling stamped to `BottlingRun.bottledAbv`;
bulk tax ABV = override ?? latest ALCOHOL reading ?? null). Fork 2 → **2A** (add
`ProductType`/`CarbonationMethod` enums with WINE/NONE defaults; a/b/c/e auto-derive, d/f override-only,
full cider/carbonation capture deferred). The units below already implement these choices.

**Fork 1 — ABV source of truth.** ABV already lives as an immutable `AnalysisReading` (ALCOHOL
analyte), not on any lot/bottling row.
- **1A (recommended):** BOTTLE op takes a **required** `abv` stamped durably onto `BottlingRun`
  (new `bottledAbv` column) + BOTTLE metadata; bulk-lot tax ABV reads the **latest ALCOHOL
  AnalysisReading**, with an optional per-lot stored override. Reuses the existing measurement store,
  one authoritative value at the tax-relevant moment. Completeness 9/10.
- **1B:** Add a dedicated mutable `taxAbv Decimal?` column on `Lot` (+ BottlingRun), independent of
  chemistry readings. Simpler queries, but a second ABV home that can drift from the readings. 7/10.

**Fork 2 — tax classes (d) artificially carbonated & (f) hard cider have no derivation source** (no
product-type/carbonation concept exists).
- **2A (recommended):** Add `ProductType` (WINE, HARD_CIDER) + `CarbonationMethod` (NONE, NATURAL,
  ARTIFICIAL) enums with defaults (WINE/NONE) now, so **a/b/c/e derive fully & automatically** and
  **d/f are reachable via the review-screen override** (no dedicated capture UI in v1). Honors
  decision #1's 6-class model, holds scope for grape-first partners. Completeness 9/10.
- **2B:** Full d/f capture UI + validation in v1 (cider fruit, CO₂ g/100mL, carbonation method on the
  bottling/lot forms). Complete but scope creep no design partner needs yet. 10/10 but wrong altitude.
- **2C:** v1 = grape classes a/b/c/e only; omit d/f columns. Contradicts decision #1; reopens schema
  later. 4/10.

## Council Revisions (2026-07-01) — folded CRITICAL + SHOULD-FIX

Gemini (TTB domain) + Claude (types/ledger) review. Full log: `council-feedback.md`. Folded:

- **C2 (CRITICAL) — CRUSH is not wine.** A2 "produced by fermentation" fires on the **MUST/JUICE →
  WINE transition** (existing `LotForm`/`afState` change), **not** on CRUSH. Crushed fruit/juice stay
  out of §A (they belong to Part VII/IV, stubbed in v1). Fixes Unit 5.
- **C5 (CRITICAL) — correction period semantics.** A CORRECTION op that amends a *filed* period is
  assigned to that period for folding (not "now"), so it drives an **Amended** report rather than
  double-counting in the current period. `removalCore`/reversal must set `observedAt` accordingly.
  Fixes Units 4/8, R3.
- **S1 (SHOULD) — rounding invariant.** Compute Begin/Add/Remove in **exact liters**, convert+round
  to 2dp, then **derive End = Begin + Add − Remove** in the rounded domain; post drift vs the
  physically-converted end to **A9 (gain) / A30 (loss)** so every column foots. Fixes Unit 6.
- **S2 (SHOULD) — null ABV keeps volume.** Missing ABV **defaults to class a (≤16%)** (never drops
  the volume) and raises an anomaly to amend later. Exact boundaries: a ≤16.000, b >16.000–≤21.000,
  c >21.000–≤24.000. Fixes Unit 3.
- **S3 (SHOULD) — carry-forward begin.** On-hand **begin = prior FILED report's on-hand-end**;
  full-history re-fold only for the first report or an explicit recompute. Add index
  `(tenantId, observedAt)` on `LotOperation`. Fixes Units 6/8.
- **S4 (SHOULD) — Final is business-closing.** Report **lifecycle** (DRAFT→FILED) is separate from the
  form **version** flag; "Final" = last report for the whole business, offered once, not per period.
  Fixes Units 7/8/12.
- **S5 (SHOULD) — section from bucket.** `mapLineToForm` chooses §A vs §B from the line's `bucket`
  (bulk vs bottled), not from the disposition. Fixes Units 4/5.
- **C4 (CRITICAL) — bottling ABV blast radius.** Making `abv` required breaks all bottling callers and
  mis-times sparkling ABV. Fixes Unit 2 (enumerate callers; still-wine required; sparkling ABV at
  FINISH; migration default).

**v1 scope decision on the cross-class model (Council Q1–Q3 — surfaced to the user as forks):** v1
targets the **still-wine reconciliation** correctly (single tax class per lot that does **not** cross
classes; A2 on ferment-complete; carry-forward; rounding; null→a). **Mid-period tax-class transitions**
(fortification/sweetening/amelioration crossing a boundary → A3/A4/A6 + A18/A19/A21) and **cross-class
BLEND** per-source-class deltas (A5/A20) are **detected and anomaly-flagged for manual Part X handling
in v1**, with auto-generated movement lines **deferred** to a Phase-14 follow-on (C1/C3, Q2). Bottling
runs are assigned to the period of their `observedAt` (Q3); month-boundary splitting is operator-driven.
In-bond transfer lines (A7/A15, B3/B9, B4) render zero in single-winery v1 (Q4). See revised Risks.

## Eng Review Revisions (2026-07-01) — folded

- **E1 (arch) — FILED reports are immutable.** Never mutate a FILED `ComplianceReport`; regeneration
  or amendment always **writes a new row** (version AMENDED, `amendsReportId` → the original). The
  filing snapshot is the legal audit record. Units 7/8.
- **E2 (arch) — audit backing is on-demand for DRAFT, snapshotted at FILE.** Don't bloat every DRAFT
  row with per-cell opId/lotId JSON; re-derive audit backing from the ledger for DRAFTs (it's cheap
  and always current) and freeze it into `computed Json` only when the report is marked FILED. Units
  7/8/12.
- **E3 (DRY) — one gallons helper, one rounding site.** `gallons.ts` (`LITERS_PER_US_GALLON`, round
  2dp) is the **single** L→gal + rounding authority; the PDF fill (Unit 10) renders the
  already-rounded snapshot values and never re-rounds (else the PDF can disagree with the screen).
- **E4 (DRY) — disposition→form-line mapping lives once.** The `RemovalDisposition → line` taxonomy
  lives only in `form-map.ts` (Unit 5, the single operation→line authority); `removal-reasons.ts`
  (Unit 4) defines just the enum + human labels. No second mapping table.
- **E5 (perf) — no N+1 in the fold.** Resolve tax-ABV for all lots in the period in **one** batched
  query (latest ALCOHOL reading per lot), and build per-cell audit backing from a **single**
  grouped ledger query in memory — never per-lot round-trips. Unit 6.

## Execution Sequencing (eng review — math-first, gated)

Adopted from the outside-voice challenge (OV#1/#2): **de-risk the fold math before the irreversible
build.** Reordered into two phases with a hard gate:

- **Phase 0 (validate the math):** the enum *types* + Units **3 (deriveTaxClass), 5 (mapLineToForm),
  6 (foldPeriod)** as **pure functions** — no DB migration, no new op, no PDF, no UI. Define the enums
  as TS types first; the Prisma migration (Unit 1 DB half) lands in Phase 1. **GATE (NOT gated on a
  US partner — we validate now on fake data):** reconcile the fold output against **(a)** rich
  synthetic fixtures (proves the *mechanics*: fold foots, invariants hold, every column balances, PDF
  fills) **and (b)** at least **one INDEPENDENT worked example I did not author** — a TTB-published
  5120.17 instruction example or a public filled return, entered as ops with the expected line totals
  transcribed from the source. (b) is the **anti-circularity oracle**: fixtures written by the same
  author as the logic only prove self-consistency; an external worked example proves *interpretation*.
  Numbers must foot (§A13==§B2, every column balances) **and** match the external example before
  Phase 1. The first US design partner is **final confirmation, not a build/validation blocker** (R2).
- **Phase 1 (build the rest):** Units **1 (schema migration), 2, 4, 7, 8, 9, 10, 11, 12, 13** in
  dependency order. **Decision (user, 2026-07-01):** keep Unit 4 `REMOVE_TAXPAID` (the taxable event
  is first-class, per decision #3) and keep the filled PDF (Units 9/10, sequenced last, after the
  screen). Only the *order* changed; scope is unchanged.

## Implementation Units

### Unit 1: `WineTaxClass` enum + derivation inputs (schema + isolated enum migration)
**Goal:** Add the tax-classification data model without changing behavior yet.
**Files:** `prisma/schema.prisma`, `prisma/migrations/*_wine_tax_class_enum/`, `src/lib/ledger/vocabulary.ts`
**Approach:** Add `enum WineTaxClass { A_LE16 B_16_21 C_21_24 D_CARBONATED E_SPARKLING F_HARD_CIDER }`,
`enum ProductType { WINE HARD_CIDER }`, `enum CarbonationMethod { NONE NATURAL ARTIFICIAL }` — each in
its **own isolated migration** (Windows enum rule). Add nullable columns per Fork 2A: `Lot.productType`
(default WINE), `Lot.carbonation` (default NONE). No RLS change (columns on an existing tenant table).
**Tests:** schema compiles; `db:generate` types include the enums; a lot defaults to WINE/NONE.
**Depends on:** none
**Patterns to follow:** existing enum blocks `schema.prisma:851-926`.
**Verification:** `npm run db:generate` clean; `npx tsc --noEmit`.

### Unit 2: ABV capture at BOTTLE + bulk lot (Fork 1A)
**Goal:** Make ABV a required bottling input and readable for bulk lots so tax class can be derived.
**Files:** `prisma/schema.prisma` (+ migration: `BottlingRun.bottledAbv Decimal?`, optional
`Lot.taxAbvOverride Decimal?`), `src/lib/bottling/run.ts` (BottlingInput +abv, `applyBottling`),
`src/lib/bottling/materialize.ts`, `src/app/(app)/bottling/BottlingClient.tsx`, `src/lib/bottling/actions.ts`.
**Approach:** Add required `abv` to `BottlingInput` for the **still-wine** bottling entry; validate
0<abv≤24 (warn >24); stamp onto `BottlingRun.bottledAbv` + BOTTLE op metadata. **C4 — enumerate &
update ALL callers of `executeBottling`/`applyBottling`** (actions, tests, any assistant bottling
tool, sparkling path) before flipping the field to required, or the build breaks. **Sparkling ABV is
NOT known at TIRAGE** (rises with tirage sugar) — resolve/stamp sparkling ABV at **FINISH/disgorgement**
(base ABV + tirage bump from `src/lib/sparkling/sugar.ts`), not at the still BOTTLE op. Migration gives
existing `BottlingRun` rows a **nullable** `bottledAbv` with a documented backfill default. Add a small
`src/lib/compliance/abv.ts` resolver: tax ABV = `taxAbvOverride` ?? the `ALCOHOL` AnalysisReading **as-of the taxable/bottling event**
(not merely "latest" — tax class is set at the event) ?? **class-a default to keep the volume on the
form**. **OV#6 — the class-a default is a BLOCKING anomaly, not a silent file:** it keeps the volume
visible but must **block "Mark Filed"** until resolved (class a is the lowest tier; silently
defaulting favorable is exactly what an auditor punishes). Add the ABV field to the bottling form
(after vintage), DESIGN.md tokens.
**Tests:** still bottling without abv rejected; abv persists on BottlingRun + metadata; sparkling ABV
resolved at FINISH; existing callers compile; resolver precedence (override > reading > class-a
default) — unit tests in `test/compliance-abv.test.ts`.
**Depends on:** Unit 1
**Patterns to follow:** `BottlingInput` `run.ts:11-22`; zod parse in `actions.ts`.
**Verification:** create a bottling with abv=13.5 → BottlingRun.bottledAbv=13.5; resolver returns it.

### Unit 3: Tax-class derivation function (pure, tested)
**Goal:** One pure function that maps a classified lot/volume to a `WineTaxClass` (+ BF/BP sub).
**Files:** `src/lib/compliance/tax-class.ts`, `test/compliance-tax-class.test.ts`
**Approach:** `deriveTaxClass({ abv, productType, carbonation, sparklingMethod })` →
`{ taxClass, sparklingSub: 'BF'|'BP'|null, reason, needsAbvReview: boolean }`. Rules, in order: hard
cider (productType HARD_CIDER + 0.5≤abv<8.5 + CO₂≤0.64 assumed for cider) → F; artificial carbonation
→ D; sparkling (method present) → E with sub = TANK?BP:BF; else by ABV band using **exact boundaries**
(a ≤16.000; b >16.000 and ≤21.000; c >21.000 and ≤24.000). **S2 — missing ABV defaults to class a**
and sets `needsAbvReview=true` (never drops the volume off the form; amend later if a reading
reclassifies). Point-in-time by design (takes the ABV as-of the evaluation moment, not a static lot
field). Return a machine reason string for the audit trail. Encodes the footnote-1 cider definition.
**Tests:** table-driven incl. **exact boundaries** (16.000→a, 16.001→b, 21.000→b, 21.001→c):
13.5%/WINE/NONE→A; 18%→B; 22.5%→C; ARTIFICIAL→D; TRADITIONAL→E/BF; TANK→E/BP; HARD_CIDER 6%→F;
missing abv → class a + needsAbvReview. ~18 cases.
**Depends on:** Unit 1
**Verification:** `npm test compliance-tax-class` green.

### Unit 4: `REMOVE_TAXPAID` operation + removal-disposition taxonomy (op + reversal)
**Goal:** Model tax determination and the other removal/used-for lines as a reversible ledger op.
**Files:** `prisma/schema.prisma` (+ isolated enum migration adding `REMOVE_TAXPAID` to
`OperationType`), `src/lib/ledger/vocabulary.ts`, `src/lib/compliance/removal-core.ts`,
`src/lib/compliance/removal-reasons.ts`, `src/lib/ledger/reverse.ts`, `src/lib/ledger/math.ts`,
`src/app/(app)/compliance/actions.ts` (or extend bulk actions), `test/compliance-removal.test.ts`.
**Approach:** Follow the 7-step add-an-op recipe. `RemovalDisposition` enum encodes the form lines:
TAXPAID (A14/B8), EXPORT (B12), FAMILY_USE (B13), TESTING (A23/B14), TASTING (B11),
DISTILLING_MATERIAL (A16), VINEGAR (A17), plus used-for SWEETENING/SPIRITS/AMELIORATION/EFFERVESCENT
(A18–A22). `removalCore` writes a `REMOVE_TAXPAID` op with an EXTERNAL out-line whose `reason` =
disposition + `metadata.disposition`; register a `"removal"` family in `reversibilityOf` + the
`reverseOperationCore` switch (reversible → appends CORRECTION per 024). `planRemoval()` in math.ts.
**S5 — the §A-vs-§B choice for every disposition comes from the line `bucket` (bulk vs bottled) at
removal time, not the disposition** (TAXPAID→A14 if bulk / B8 if bottled; TESTING→A23/B14; etc.).
**C5 — correction `observedAt`:** when a removal (or any op) in a *filed* period is reversed, the
CORRECTION carries an `observedAt` within that filed period so the fold assigns it there (→ Amended),
never double-counting in the current period; confirm/adjust the 024 reversal's `observedAt` for this.
**Tests:** removal reduces on-hand; disposition persists; §A vs §B chosen by bucket; `reverseOperationCore`
on it appends a CORRECTION and restores volume; **correction lands in the corrected op's period**;
double-reverse blocked; verify:reverse-style scenario.
**Depends on:** Unit 1
**Patterns to follow:** transforms as template — `crush-core.ts`, `reverse.ts:76-153`.
**Verification:** `npm test compliance-removal`; a removal then undo nets zero on-hand.

### Unit 5: Operation→line-item map (pure, footnote rules)
**Goal:** Deterministic mapping from a ledger line to (section, form line, column, BF/BP sub).
**Files:** `src/lib/compliance/form-map.ts`, `test/compliance-form-map.test.ts`
**Approach:** Pure `mapLineToForm({ opType, reason, bucket, deltaSign, taxClass, sparklingSub,
crossesTaxClass })` → `{ section:'A'|'B', line:number, sub:'BF'|'BP'|null } | null`. Encode the full
§A (1–31) / §B (1–20) taxonomy from `docs/ttb-5120-17`. **C2 — CRUSH does NOT map to A2** (crushed
fruit/juice are not wine → out of §A; Part VII/IV territory, stubbed in v1); **A2 "produced by
fermentation" fires on the MUST/JUICE→WINE transition** (a lot whose `LotForm` becomes `WINE` /
`afState` completes). BLEND→A5/A20 **only when `crossesTaxClass`** (ftn 5, else null). BOTTLE
bulk-out→A13 & bottle-in→B2 (assert equality). REMOVE_TAXPAID by disposition, **section chosen by
`bucket`** (S5) → A14–A23 / B8–B14. LOSS→A29(bulk)/B18 breakage. Inventory reconcile→A9 gain/A30
loss/B19 shortage. RACK/TOPPING/FILTRATION internal→no form line (net-neutral in-bond).
**Cross-class movement (C1/C3, v1):** a lot whose derived tax class **changes across the period**
(sweetening/spirits/amelioration crossing a boundary) is **flagged as an anomaly for manual Part X**
in v1 — the paired A3/A4/A6 + A18/A19/A21 movement-line auto-generation is a documented Phase-14
follow-on (not silently mis-posted). Return null for non-reportable lines. Emit a `partXReason` when a
shortage/loss/class-change is detected (ftn 4).
**Tests:** each op family → expected line; **CRUSH → null (not A2)**; **MUST→WINE transition → A2**;
BLEND same-class → null, cross-class → A5; REMOVE_TAXPAID section by bucket; A13 total == B2 total
invariant on a synthetic bottling; sparkling bottling → E/BF vs E/BP rows; a class-change lot → anomaly.
~24 cases.
**Depends on:** Units 3, 4
**Verification:** `npm test compliance-form-map`.

### Unit 6: Period-boundary fold engine
**Goal:** Fold the tenant ledger into §A/§B line totals (gallons) for a period, with begin/end.
**Files:** `src/lib/compliance/period-fold.ts`, `src/lib/compliance/gallons.ts`,
`test/compliance-period-fold.test.ts`
**Approach:** `foldPeriod(tenantId, { start, end })` (tenantId **explicit** — K12): (1) on-hand
**begin** — **S3: carry forward from the prior FILED `ComplianceReport`'s on-hand-end** when one
exists; otherwise (first report / explicit recompute) fold (via `foldLines()`, in `operationId` order)
all lines whose `operation.observedAt < start`, grouped per (lot,section,taxClass); (2) within-period
lines (`start ≤ observedAt ≤ end`, incl. CORRECTIONs assigned to this period per C5) → `mapLineToForm`
→ accumulate into line×column cells (a lot's class evaluated point-in-time; class changes → anomaly
per Unit 5); (3) §B on-hand unions `BottledLotState` (sparkling) + finished-goods (still) balances.
**S1 rounding:** compute Begin/Add/Remove in **exact liters**, convert each to gal ÷3.785411784 and
round 2dp (`gallons.ts`, `LITERS_PER_US_GALLON`), then **derive `End = Begin + Add − Remove` in the
rounded domain**; reconcile against the physically-converted end and post any drift to **A9 (gain) /
A30 (loss)** so every column foots exactly. Attach per-cell **audit backing** (contributing
opIds/lotIds/lotCodes). Run under `runAsTenant`/`runInTenantTx`.
**Tests:** synthetic US-shaped fixture (ferment→bottle→remove-taxpaid across 2 months): month-1 end ==
month-2 begin (carry-forward); every §A/§B column foots (Begin+Add−Remove==End); rounding drift → A9/A30;
A13==B2; gallons conversion exact; empty period → all zeros; CRUSH does not appear in §A.
**Depends on:** Units 3, 5, 7 (reads prior FILED report for carry-forward)
**Patterns to follow:** ledger read via extended prisma; `VesselLot` as end cross-check.
**Verification:** `npm test compliance-period-fold`; fixture reconciles begin/end across periods.

### Unit 7: `ComplianceReport` + `ComplianceProfile` tables (tenant-scoped, RLS)
**Goal:** Persist generated reports (version chain, snapshot, overrides, remarks) + per-tenant profile.
**Files:** `prisma/schema.prisma`, `prisma/migrations/*` (table + RLS), `src/lib/tenant/models.ts`
(NOT in GLOBAL_MODELS), `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`.
**Approach:** `ComplianceReport { id, tenantId, periodStart, periodEnd, cadence, status DRAFT|FILED,
version ORIGINAL|AMENDED, isFinalBusinessReport Boolean @default(false), amendsReportId?, onHandEnd
Json (per class/section — the carry-forward source for S3), computed Json (full line snapshot),
overrides Json, remarks String, generatedAt, filedAt? }`. **S4 — lifecycle (`status`) is separate
from the form version flag; "Final" is `isFinalBusinessReport` (last report for the whole business),
offered once, not a per-period state.** Also add index **`(tenantId, observedAt)` on `LotOperation`**
(S3, supports the period-boundary fold). `ComplianceProfile` (per-tenant like AppSettings: ein,
registryNumber, operatedByName/Address/Phone, defaultCadence, `@@unique([tenantId])`). Apply the
**full Phase-12 checklist** to both: tenantId + index + FK→
organization ON DELETE RESTRICT, per-tenant uniques, RLS ENABLE+FORCE+`tenant_isolation` (USING +
WITH CHECK on `current_setting('app.tenant_id', true)`), app_rls DML grant, isolation test case.
**Tests:** cross-tenant read returns 0 rows (RLS); profile is per-tenant singleton; report version
chain FK valid.
**Depends on:** none (can land parallel to 1–6)
**Patterns to follow:** `AppSettings:962-973`; an existing RLS migration.
**Verification:** `npx tsx scripts/verify-tenant-isolation.ts` passes new cases.

### Unit 8: Report generation service (glue)
**Goal:** One entry point that generates/persists a report for a period + version.
**Files:** `src/lib/compliance/generate.ts`, `src/app/(app)/compliance/actions.ts`,
`test/compliance-generate.test.ts`
**Approach:** `generateReport(tenantId, { periodStart, periodEnd, version, amendsReportId? })`:
foldPeriod (S3 carry-forward begin from prior FILED report) → apply saved per-lot tax-class overrides →
build the line snapshot + persist `onHandEnd` (carry-forward source) + Part X auto-remarks
(shortages/losses/class-change/cross-class-blend) → persist `ComplianceReport` (status DRAFT, version
ORIGINAL). **Amended** (version AMENDED, C5): re-fold the period including CORRECTIONs assigned to it,
diff vs the prior FILED report, append a Part X explanation of the delta. Marking a report FILED is an
explicit user action on the review screen; `isFinalBusinessReport` is a separate one-time flag (S4).
**OV#7 — carry-forward chain integrity:** the first-ever report bootstraps `begin` from a full ledger
fold (no prior FILED row); **amending period N invalidates period N+1's carried-forward begin** —
surface a "downstream reports need regeneration" flag, never silently let the chain drift.
Server actions wrap it with `action()` auth + RLS.
**Tests:** generate → DRAFT row with correct cells; amend after a `reverseOperationCore` correction →
new AMENDED row referencing the original, Part X notes the delta.
**Depends on:** Units 6, 7
**Verification:** `npm test compliance-generate`.

### Unit 9: AcroForm field calibration + JSON map (checked-in artifact)
**Goal:** A stable line×column→AcroForm-field-name map for the non-semantic TTB PDF.
**Files:** `scripts/calibrate-ttb-fields.ts`, `src/lib/compliance/ttb-5120-17-fieldmap.json`,
`test/compliance-fieldmap.test.ts`
**Approach:** Script reads `docs/ttb-5120-17/TTB-5120.17.pdf` widget `/Rect`s, clusters by page/row
(y) and column (x) against the known grid geometry, and emits the JSON map keyed
`A.13.e.BF` → `"Text###"`. Human-verify a handful of anchor cells (year/EIN/A13/B2/totals) against
`page-1.png`/`page-2.png`. The map is committed so runtime never re-derives it.
**Tests:** every (section,line,column,sub) v1 uses has a field-name entry; no dup field names;
anchor cells match expected widget names.
**Depends on:** none
**Patterns to follow:** the pypdf probe already validated widgets+positions are extractable.
**Verification:** run the script; open the map; spot-check 5 anchors.

### Unit 10: PDF fill + download route (`pdf-lib`)
**Goal:** Produce a filled TTB 5120.17 PDF from a persisted report.
**Files:** `package.json` (+`pdf-lib`), `src/lib/compliance/fill-pdf.ts`,
`src/app/api/compliance/[id]/pdf/route.ts`, `test/compliance-fill-pdf.test.ts`
**Approach:** Load the template, set text fields from the report snapshot via the fieldmap (gallons
2dp, tax-class columns, BF/BP rows, header from `ComplianceProfile`, Part X remarks, version
checkbox), flatten, stream as `application/pdf` from an auth-gated tenant-scoped route.
**Tests:** fill a synthetic report → non-empty PDF; re-read filled fields == snapshot values
(round-trip); route rejects other tenants / unauth.
**Depends on:** Units 8, 9
**Verification:** download a fixture report PDF; open it; numbers land in the right cells.

### Unit 11: AI anomaly + readiness check
**Goal:** Flag likely errors before filing and answer "am I ready to file?".
**Files:** `src/lib/compliance/anomaly.ts`, `test/compliance-anomaly.test.ts`
**Approach:** Deterministic checks first (cheap, testable): A13≠B2; on-hand-end negative; missing
ABV (needsAbv lots); shortage/loss without Part X; this-period loss/removal vs trailing-N-period mean
(flag ≥5×). Then an LLM pass (`new Anthropic()`, assistant model `claude-opus-4-8`) that takes the deterministic
findings + summary and writes a plain-English "ready / not ready + why" and suggested Part X wording.
LLM is advisory only and **never gates filing** (only the deterministic checks do); its output
carries an explicit **"AI note — not compliance advice, not reviewed by TTB"** disclaimer (OV#5).
Also register a read-only assistant tool
(`kind:"read"`) `report-anomalies` in `src/lib/assistant/registry.ts` so "am I ready to file?" works
in chat/voice, reusing the existing tool-use loop — no new LLM plumbing.
**Tests:** synthetic reports trigger each deterministic flag; 5× loss detected; LLM call mocked in test.
**Depends on:** Unit 8
**Patterns to follow:** assistant client `src/lib/assistant/run.ts:78`; `AssistantTool` + `ALL_TOOLS`
in `src/lib/assistant/registry.ts`; read-tool example `src/lib/assistant/tools/query-brix.ts`.
**Verification:** `npm test compliance-anomaly` (deterministic paths); manual LLM sanity on a fixture.

### Unit 12: Review-before-file screen (the only UI)
**Goal:** One screen to pick a period, review derived numbers with audit backing, override, add
Part X, see anomalies, and download the PDF.
**Files:** `src/app/(app)/compliance/page.tsx`, `.../ComplianceClient.tsx`,
`.../ReportGrid.tsx`, `.../CellAudit.tsx`, nav entry in `src/components/AppShell.tsx`.
**Approach:** Period + version picker → Generate. Render §A/§B as a lines×6-columns grid (BF/BP split
rows for e), gallons; each non-zero cell expands to per-lot audit backing (opIds/lotCodes). Per-lot
**tax-class override** control; **Part X** remarks editor (pre-filled with auto-remarks); anomaly
panel (deterministic flags + LLM readiness); **Mark Filed** action (DRAFT→FILED) + an Original/Amended
badge and a one-time "Final report for the business" checkbox (S4 — not a per-period state);
"Download filled PDF" button. Parts III/IV/VI–IX shown as labeled "not in v1" stubs. Strictly
DESIGN.md tokens (wine accent `--accent`, cream surfaces, `--space-*`, warm shadows), light-only.
**Tests:** component/RTL: grid renders a fixture; override re-derives a cell's class; download button
hits the route; anomaly flags visible; blocked-filing state when a lot needs ABV review.
**Depends on:** Units 8, 10, 11
**Patterns to follow:** existing `(app)` routes + `AppShell`; DESIGN.md tokens.

**Design spec (folded from /plan-design-review — app-UI, calibrated to DESIGN.md; visual reference =
`docs/ttb-5120-17/page-1.png`/`page-2.png`):**
- **Information hierarchy (lead with trust, then the grid):** top of screen = a **reconciliation
  status banner** — period + version badge + a single at-a-glance verdict: "Balances ✓ / Does not
  balance" (every §A/§B column foots) and "Ready to file / N blockers." A federal filing earns trust
  at the pixel level; the winemaker must see *is this right?* before scanning 50+ rows. Grid second,
  audit/Part X/anomalies below.
- **The grid:** faithful to the form — §A (lines 1–31) and §B (lines 1–20) as row groups, 6 tax-class
  columns (a/b/c/d/e/f) with the ABV band in the column header and the **BF/BP split rows** under (e).
  Right-align gallons (numeric, 2dp, tabular figures); zero cells muted (`--text-muted`), nonzero cells
  ink; TOTAL rows emphasized (medium weight + `--surface-sunken`). Sticky line-label column + sticky
  header on scroll.
- **Interaction states (spec what the user SEES):** generating (fold can take a beat) → inline
  progress on the Generate button + skeleton grid, never a dead screen; **empty period** → grid of
  zeros with a calm "No reportable operations this period — you can still file a zero report" line
  (empty state is a feature); **error** → the fold/DB error surfaces as a banner with retry, not a
  blank; **blocked filing** → "Mark Filed" disabled with a clear reason list (e.g. "3 lots need an
  ABV before filing," linking to them) — this is the null-ABV/anomaly gate (OV#6), never a silent file.
- **Anomaly + override affordances:** anomaly rows flagged with **icon + text + color** (never
  color-only — DESIGN.md status colors: warning `--warning`/golden, danger `--danger`/red), each with
  a one-line plain-English reason and a jump-to-cell. Per-lot tax-class override is an explicit select
  with the machine-derived class shown as the default and an "overridden" marker when changed.
- **Responsive:** the wide grid scrolls horizontally within `AppShell`'s `.app-main table` pattern on
  <768px, first column sticky; the status banner + anomaly panel stack full-width. Not "just stacked."
- **Accessibility:** real `<table>` semantics with `<th scope>` for line + column headers so the grid
  is navigable by screen reader; override control keyboard-operable; 44px min touch targets; all
  status meaning carried by text/icon in addition to color (contrast per DESIGN.md); focus-visible
  ring (`--shadow-focus`). Light-only per DESIGN.md.

**Verification:** load `/compliance`, generate a synthetic month, confirm the balance/ready banner,
expand a cell's audit, override a lot, see an anomaly flag + blocked-filing reason, download PDF;
check horizontal scroll + sticky column at 375px and keyboard/screen-reader table nav.

### Unit 13: Backfill + synthetic US fixture + docs
**Goal:** Backfill existing lots to defaults and provide the US-shaped test corpus (Bhutan can't validate TTB).
**Files:** `prisma/migrations/*` (backfill productType=WINE, carbonation=NONE, then NOT NULL where
required), `scripts/seed-ttb-synthetic.ts`, `docs/plans/.../` deferred-scope appendix, `ROADMAP.md`
(mark v1 slice), `AGENTS.md` (compliance tables added to the Phase-12 checklist note).
**Approach:** Idempotent backfill (trivial — no US data yet). A synthetic seed builds a full
US-winery month (multi-class: still a/b/c, a sparkling BF + BP, a removal-taxpaid, a loss, a
cross-class blend) under a **dedicated synthetic test tenant** (NOT prod Bhutan — keep fake TTB data
out of the real winery, RLS-isolated) so the engine + PDF are exercisable end-to-end with no real
filer. **Also seed the independent worked-example corpus** (Phase-0 gate b): the ops that reproduce a
TTB-published 5120.17 instruction example / public filled return, with its expected line totals as a
fixture the engine must match. Document the deferred follow-ons (excise/CBMA/state-DTC) with figures.
**Depends on:** Units 1–12
**Verification:** run backfill on a scratch branch DB; `seed-ttb-synthetic` → `/compliance` renders a
plausible filled form; deferred appendix complete.

## Test Strategy

**Unit tests (Vitest, `test/`):** tax-class derivation, form-map (footnote rules incl. A13==B2 &
BLEND cross-class), period-fold reconciliation (begin/end continuity, gallons conversion),
removal op + reversal, ABV resolver, anomaly deterministic paths, fieldmap coverage, PDF round-trip.
**Integration:** generate→persist→amend after a 024 correction; tenant-isolation cases for the two
new tables (`verify-tenant-isolation.ts`).
**Manual verification (synthetic, no real filer):** seed a US month → `/compliance` → review grid vs
`page-1.png`/`page-2.png` → override a lot → add Part X → download filled PDF → confirm cell placement.

## Test Coverage Map (eng review)

```
PURE LOGIC (unit — Vitest)
==========================
deriveTaxClass (U3)
  ├─ [★★★] ABV bands incl. exact boundaries 16.000/16.001/21.000/21.001/24.000
  ├─ [★★★] ARTIFICIAL→D, TRADITIONAL/PETNAT→E/BF, TANK→E/BP, HARD_CIDER→F
  └─ [★★★] null ABV → class a + needsAbvReview (NOT dropped)               [S2]
mapLineToForm (U5)
  ├─ [★★★] CRUSH → null (NOT A2); MUST/JUICE→WINE → A2                       [C2]
  ├─ [★★★] BLEND same-class → null; cross-class → A5                         [ftn5]
  ├─ [★★★] REMOVE_TAXPAID section chosen by bucket (A14 bulk / B8 bottled)   [S5]
  ├─ [★★★] LOSS→A29/B18; inventory→A9/A30/B19; RACK/TOP/FILT→null
  └─ [★★★] class-change lot → anomaly + partXReason (not silent)            [C1/R8]
gallons.ts (U6)   [★★★] L→gal exact; 2dp rounding single-source            [E3]
period-fold (U6)
  ├─ [★★★] begin = prior FILED end (carry-forward); first-report full fold  [S3]
  ├─ [★★★] every §A/§B column foots: End = Begin+Add−Remove; drift→A9/A30    [S1/R9]
  └─ [★★★] §B on-hand unions BottledLotState + finished-goods; A13==B2       [R4]
abv resolver (U2)  [★★★] override ?? latest reading ?? class-a; batched     [E5]

LEDGER OP (integration — tenant tx)
===================================
REMOVE_TAXPAID (U4)
  ├─ [★★★] removal reduces on-hand; disposition + section persist
  ├─ [★★★] reverseOperationCore → CORRECTION restores volume; double-reverse blocked
  └─ [★★★] correction lands in the CORRECTED op's period, not "now"          [C5]
generate/amend (U8)
  ├─ [★★★] generate → DRAFT (audit backing on-demand)                        [E2]
  ├─ [★★★] correction to a FILED period → new AMENDED row, original immutable [E1]
  └─ [★★  →E2E] /compliance generate→override→mark-filed→download PDF happy path (U12)
tenant isolation (U7)  [★★★] cross-tenant read = 0 rows; per-tenant profile singleton

PDF (U9/U10)
  ├─ [★★★] fieldmap: every (section,line,col,sub) v1 uses has a field; no dup names
  └─ [★★★] fill→re-read round-trip == snapshot; route rejects other-tenant/unauth

ANOMALY (U11)  [★★★ deterministic] A13≠B2, negative end, missing ABV, shortage-no-PartX,
               5× loss;  [★ →EVAL] advisory LLM readiness (mocked in unit test)
────────────────────────────────────────────────────────────
COVERAGE TARGET: 100% of new code paths. One E2E (generate→file→download),
one eval-style mock (LLM readiness). No GAP left unassigned.
```

**Failure modes (new codepaths):** (1) fold with a backdated/correction op → mis-period — test C5 +
carry-forward. (2) rounding drift → column won't foot → TTB reject — test forces drift to A9/A30. (3)
missing ABV → volume drops off form — resolver defaults to class a, tested. (4) PDF field mis-map →
wrong cell — calibration anchor tests + round-trip. (5) cross-class movement silently mis-posted →
anomaly flag (not silent), tested. No failure mode is both untested AND silent → **no critical gaps**.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R1 AcroForm field names non-semantic → mis-mapped cells | MED | HIGH | Calibration script + committed JSON map + anchor-cell tests + visual check vs page renders (Unit 9) |
| R2 Cannot validate against a real TTB filer (Bhutan) | HIGH | MED | Build/test **fully on synthetic data now** (no partner needed); break circularity with ≥1 **independent TTB-published worked example** as the oracle (Phase-0 gate b); seed a **dedicated synthetic tenant**, never prod Bhutan; first US partner = final confirmation only; human-review-before-file always |
| R3 Period fold wrong at boundaries (backdated `observedAt`, corrections) | MED | HIGH | Carry-forward begin from prior FILED report (S3); CORRECTIONs assigned to the corrected op's period (C5); fold in `operationId` order (INVARIANT #7) filtered by `observedAt`; reuse `foldLines()`; 2-month continuity + correction-into-filed-period tests |
| R4 §B still-wine on-hand split across BottlingRun/finished-goods vs BottledLotState | MED | MED | Fold unions both bottled sources; fixture covers still + sparkling; assert A13==B2 |
| R5 d/f tax classes unreachable without capture UI | MED | LOW | Fork 2A: enums + defaults now, override on review screen; full capture deferred |
| R6 Enum/migration ordering on Windows/Neon | MED | MED | Isolated enum migrations; migrate diff→strip search_vector→deploy→generate; stop dev server first |
| R7 New tenant tables leak without full RLS | LOW | HIGH | Phase-12 checklist end-to-end + isolation tests (Unit 7) |
| R8 Cross-class movements (fortify/sweeten/amelio/cross-class blend) mis-posted | MED | HIGH | v1 does NOT auto-post movement lines; detect class-change/cross-class-blend → anomaly + manual Part X (C1/C3); auto-generation deferred; fixture asserts a class-change raises the flag, not a silent number |
| R9 Rounding makes a column not foot → TTB rejects | MED | HIGH | S1: exact-liter math, then End=Begin+Add−Remove in rounded domain, drift→A9/A30; per-column footing test on every fixture |
| R10 Making bottling `abv` required breaks callers / mis-times sparkling | MED | MED | C4: enumerate+update all callers first; still-wine required, sparkling ABV at FINISH; nullable+backfilled historical rows |

## Success Criteria

- [x] A synthetic US winery month generates a 5120.17 Part I §A+§B, all 6 tax classes, in gallons,
      matching the real form's structure, from the ledger alone. *(`npm run verify:ttb`)*
- [x] on-hand end (period N) == on-hand beginning (period N+1); §A line 13 == §B line 2. *(period-fold tests + verify:ttb)*
- [x] Tax class is auto-derived from ABV + still/sparkling + carbonation + product type; overridable.
- [x] `REMOVE_TAXPAID` records tax determination and is reversible via `reverseOperationCore`;
      a correction → regenerate → Amended report with a Part X explanation. *(verify:ttb amend path)*
- [x] Downloadable filled TTB 5120.17 PDF with values in the correct cells + header from the profile. *(fill-pdf round-trip)*
- [x] AI anomaly check flags 5× losses / A13≠B2 / missing ABV / unexplained shortages and answers
      "am I ready to file"; never auto-submits. *(deterministic checks + advisory LLM + assistant tool)*
- [x] Both new tables pass tenant-isolation verification (RLS). *(migration checklist DO-block + isolation test case)*
- [x] All new tests pass; no regressions; `npx tsc --noEmit` clean; lint clean for new files.

## Completion note (2026-07-01)

Shipped end-to-end. Phase 0 GATE met (pure fold validated on synthetic fixtures + the TTB-published
"Explanation of Sample Report" as the independent oracle — which surfaced a documented 0.02 gal/1000-case
rounding-convention nuance vs TTB's per-case factor; we convert real liters, VISION D8). Migrations
applied to Neon (4: enums, REMOVE_TAXPAID, tables, RLS). `npm run verify:ttb` = 20 assertions green
against a dedicated synthetic tenant (`org_zz_ttb_synth`, RLS-isolated from Bhutan). Full suite 658
pass; verify:reverse (31) + verify:reverse-transform (37) + verify-bottling (17) no regressions.
Screen at `/compliance` (admin nav). One shared-core improvement landed: `correctOperationCore` now
carries the corrected op's `observedAt` + `reason` onto the CORRECTION (C5 + fold-netting) — this is a
general correctness gain for all reversals, regression-verified.

**v1 boundaries (documented, not built):** bottle-reversal via the SEED path does not net A13/B2 in the
fold (removal reversal does); still-wine §B sales fold from StockMovement (no dedicated sales UI); PDF
asset read from `docs/ttb-5120-17/TTB-5120.17-fillable.pdf` via `process.cwd()` (confirm output-file
tracing before prod deploy). Deferred follow-ons (excise 5000.24, CBMA, Pay.gov, state/DTC, Parts
III/IV/VI–IX, mid-period cross-class movement auto-posting) per Scope Boundaries.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (Gemini + Claude) | `/council` | Cross-LLM adversarial review of the plan | 1 | ✅ folded | 5 CRITICAL (C1–C5), 5 SHOULD-FIX (S1–S5), 4 design Qs (Q1–Q4). Codex CLI unavailable → Claude stood in for types/ledger. All CRITICAL + SHOULD-FIX folded; Q1–Q4 surfaced as forks. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR | 5 folded (E1 FILED-immutable, E2 audit-backing on-demand, E3 one gallons helper, E4 single mapping source, E5 no-N+1); Test Coverage Map added, **0 critical gaps**. Outside voice (Claude subagent; Codex flagged down): folded OV#5 (LLM disclaimer/never-gates), OV#6 (null-ABV blocks filing + as-of-event), OV#7 (carry-forward chain recompute). 3 strategic tensions **resolved by user**: math-first sequencing ADOPTED (Phase 0 gate), keep Unit 4 op, keep PDF. |
| Design Review | `/plan-design-review` | One reporting UI (light) | 1 | ✅ folded | Design completeness **6/10 → 9/10**. App-UI grid calibrated to DESIGN.md + the real form renders. Folded: reconciliation "balances/ready-to-file" trust banner (lead signal), interaction states (generating/empty/error/blocked-filing), anomaly styling not color-only, responsive (sticky first col + horizontal scroll), a11y (`<table>`/`<th scope>`, 44px, keyboard override, focus ring). No design forks. |

**Council fold summary (2026-07-01):** C2 (CRUSH≠A2; A2 on MUST→WINE), C5 (correction→corrected-op's
period), S1 (rounding invariant + drift→A9/A30), S2 (null ABV→class a), S3 (carry-forward begin +
`(tenantId,observedAt)` index), S4 (Final=business-closing, not per-period), S5 (section from bucket),
C4 (bottling-ABV blast radius). C1/C3 + Q1–Q3 (mid-period cross-class movement lines) held out of v1
as anomaly-flagged/manual with auto-posting deferred — see Council Revisions + R8. Full log:
`council-feedback.md`.

**UNRESOLVED:** none. All CRITICAL + SHOULD-FIX folded; all forks (2 plan-time + Q1–Q4 tensions)
resolved by the user.

**VERDICT:** ✅ **CEO n/a · ENG CLEARED · DESIGN 9/10** — full pipeline complete (Council →
Eng → Design), all findings folded. Sequencing set to math-first with a Phase-0 validation gate.
Ready to implement: `/work docs/plans/2026-07-01-025-feat-ttb-5120-17-compliance-reporting-plan.md`.
