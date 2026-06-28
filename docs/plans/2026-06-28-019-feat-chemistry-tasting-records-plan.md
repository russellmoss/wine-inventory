---
title: Chemistry & Tasting Records (Phase 4)
type: feat
status: draft
date: 2026-06-28
branch: claude/zen-chebyshev-b2195e
depth: deep
units: 10
---

## Overview

Let the winemaker log lab/bench chemistry (pH, TA, free/total SO₂, temp, RS, malic,
VA, alcohol, ferment Brix, …) and structured tasting notes against a **lot in its
vessel**, see per-analyte trends across the lot's life, and run a sample/lab lifecycle
(`pulled → sent → pending → result returned → attached`). This is the substrate the
whole "monitor the wine" story rests on, and it's the last record-type gap before
blends (Phase 5) and the fast ferment-logging grid (Phase 6) can be built on top.

These are **non-volumetric records** — they describe the liquid, they don't move
liters — so they are NOT ledger operations and do NOT go through `writeLotOperation`.
They are standalone records keyed by `lotId` (+ `vesselId`), surfaced on the existing
Phase 2 lot timeline by adding new UNION sources to the timeline loader.

## Problem Frame

A winemaker's core daily question is "how is this wine doing, and is it safe?" Today
the app can move and treat wine (Phases 1–3) but cannot record a single pH or SO₂
reading against a lot, cannot show an analyte trend, and cannot represent the
real-world fact that a sample pulled today gets its lab result back Thursday. Without
this, the timeline is blind to the most frequent thing that happens to a tank: someone
measures it. Do nothing and the winemaker keeps chemistry in a spreadsheet, the lot
timeline stays a partial record, and Phase 6's ferment grid has no analyte records to
write into.

**Product frame:** the job-to-be-done is *trust the number on the screen*. A pH of 3.72
attached to the wrong lot, or a molecular-SO₂ figure computed from a stale pH, is worse
than no number. So: measurements attach to exactly one homogeneous lot (D2), molecular
SO₂ is derived from the *same sample's* free SO₂ + pH (never stored stale), and every
record carries provenance (who/when-observed/when-entered/how — D14).

## Requirements

- MUST: record an analyte measurement (analyte, value, unit, observedAt) against a lot
  in a vessel, with full provenance (`observedAt`, `enteredAt`, `enteredBy`/`enteredById`,
  `captureMethod`), as a standalone record — NOT via `writeLotOperation` (honors the
  Phase 4 architecture constraint + D2).
- MUST: an **extensible analyte set** — adding a new analyte is config (one TS file),
  not a schema migration. Each analyte carries canonical unit(s), optional valid range,
  decimal precision, and category.
- MUST: record a structured **tasting note** on a lot (appearance/aroma/flavor +
  structure sub-fields + optional score with scale + readiness flag + free text),
  searchable over time.
- MUST: a **Sample** entity with a lifecycle (`PULLED → SENT → PENDING →
  RESULT_RETURNED → ATTACHED`, plus `CANCELLED`); a pending sample appears on the
  timeline and later attaches one or more analyte results to the lot. Bench samples may
  skip `SENT`/`PENDING`.
- MUST: chemistry, tasting, and sample records render on the **existing lot timeline**
  (extend the loader's UNION; extend the describe/render rail) and on the lot detail.
- MUST: **per-analyte trend charts** reusing `src/lib/harvest/chart.ts` math — no new
  charting dependency.
- MUST: **derived molecular SO₂** computed read-only from free SO₂ + pH of the same
  sample/panel (`molecular = free / (1 + 10^(pH − 1.81))`); molecular SO₂ is NOT stored
  as its own measured analyte.
- MUST: **vessel-first capture** (D12) — add "Log analysis" / "Tasting note" / "Pull
  sample" to the Phase 3 per-vessel Actions row, reusing the Modal/form patterns
  (≥44px targets, `inputMode`, `aria-live`, provenance, "Logged · Undo" toast).
- MUST: an **Undo / void** path for these records (they are not ledger ops, so undo is
  a soft-delete `voidedAt`, not a CORRECTION op).
- SHOULD: capture a **panel** (pH + TA + free SO₂ together) in one submit, grouped so
  the SO₂ derivation pairs the right pH with the right free SO₂.
- SHOULD: a small **pending-samples surface** so returned results can be attached.
- NICE: tasting-note text search surfaced on the lots list.
- NICE: temperature/TA unit conventions stored explicitly (°C/°F; tartaric/H₂SO₄).

## Scope Boundaries

**In scope:**
- New standalone records: `LotMeasurement`, `LotTastingNote`, `Sample` (+ result link).
- The analyte registry (TS config) + SO₂ derivation (pure).
- Timeline loader UNION extension + render rail extension.
- Generalized analyte trend chart + lot-detail trend section.
- Vessel-first capture forms (analysis / tasting / sample) + undo.
- Pending-sample attach surface.

**Out of scope (and why):**
- Cost / inventory of reagents — Phase 8.
- Work orders / "pull an analysis" task auto-creating a record — Phase 9.
- The bulk **Fermentation Round** grid (fast multi-vessel Brix/temp entry) — Phase 6
  builds that fast capture UX *on top of* these records. Phase 4 is the record model +
  single-entry capture + trends + samples + tasting.
- Blends originating new lots / per-blend readings — Phase 5.
- Voice/assistant capture of measurements — Phase 10 (forms are MANUAL captureMethod
  now; the `captureMethod` field is ready for VOICE/SENSOR later).
- **Do NOT touch the vineyard `BrixLog`** (block-scoped ripening readings). Cellar
  chemistry is lot/vessel-scoped and brand new; they stay separate domains.
- MLF as a lot *state/flag* — Phase 6 owns the MLF gating; Phase 4 only records malic
  & lactic as ordinary analytes.

## Research Summary

### Codebase Patterns

- **Non-volumetric record precedent — `LotTreatment`** (`prisma/schema.prisma:852–882`):
  Phase 3's detail-row pattern. NOTE: `LotTreatment` rides a zero-line `LotOperation`
  (`operationId` FK). Phase 4 records deliberately **differ** — they are standalone
  (no `operationId`), more like the vineyard `BrixLog` (`prisma/schema.prisma`,
  `@@map("brix_log")`: insert-only side table with inline provenance
  `createdById`/`createdByEmail`/`recordedAt`/`note`). We take BrixLog's *standalone +
  inline provenance* shape and LotTreatment's *appears-on-the-lot-timeline* behavior.
- **Timeline loader UNION** (`src/lib/lot/data.ts:139–266`): currently
  `Promise.all([lotOperationLine.findMany({where:{lotId}}), lotTreatment.findMany({where:{lotId}})])`,
  grouped into a `byOp` map keyed by `operationId`, **sorted by `LotOperation.id` desc**
  (autoincrement id IS the fold order; `observedAt` is display-only — confirmed in the
  Phase 2 plan's "ordering correction"). Phase 4 adds three more standalone sources that
  have **no `operationId`**, so the feed must merge op-derived events with standalone
  records — see Key Decisions for the sort strategy.
- **`describeOperation`** (`src/lib/lot/timeline.ts:164–273`): a `switch (op.type)` that
  builds a `TimelineEvent { summary, legs, treatments, … }`. New record kinds get a
  parallel describe path that emits the same `TimelineEvent`-compatible shape.
- **Per-vessel Actions row + forms** (`src/app/(app)/bulk/CellarActions.tsx`): action
  buttons toggle inline forms; `fieldStyle` height 44; `inputMode="decimal"`;
  `aria-live="polite"` live-compute region; `role="status"` "Logged · {label}" toast
  with an Undo button wired to `correctOperationAction(operationId)`. For Phase 4, Undo
  calls a new `voidMeasurementAction`/`voidTastingNoteAction`/`cancelSampleAction`.
- **Chart machinery** (`src/lib/harvest/chart.ts`): pure `scaleLinear`, `computeDomain`,
  `brixAxisBounds`; consumed by `src/components/ui/BrixChart.tsx` (hand-rolled SVG,
  `viewBox 800×h`, `sx`/`sy` scales, per-series polyline+dots, `<title>` tooltips,
  design tokens). Reuse `scaleLinear`/`computeDomain`; add a generic axis-bounds helper.
- **Server-action conventions**: `action()` wrapper in `src/lib/actions.ts` injects
  `{ user, actor:{ actorUserId, actorEmail } }`; `"use server"` thin wrappers in
  `src/lib/cellar/actions.ts` call a `*Core(actor, input)` lib fn then `revalidatePath`.
  `writeAudit(tx, …)` in the same transaction. Prisma singleton `src/lib/prisma.ts`.
- **Next 16 App Router**: `params`/`searchParams` are Promises and must be awaited
  (`src/app/(app)/lots/[id]/page.tsx:9–15`). Read `node_modules/next/dist/docs/` before
  any new route/server-component code (AGENTS.md).
- **Enums vs string-with-code-validation**: codebase does both. `OperationType`,
  `CaptureMethod`, `LotForm` are controlled Prisma enums; `LotTreatment.rateBasis` is a
  **validated string** ("validated in code, not a DB enum"). Analyte keys + units follow
  the validated-string precedent (so a new analyte is a TS edit, no enum migration);
  `SampleStatus`/`ReadinessFlag`/`ScoreScale` are small/stable → real Prisma enums.
- **Tests**: Vitest, `test/*.test.ts`, pure functions only (no DB) — e.g.
  `test/additions-math.test.ts`, `test/lot-timeline.test.ts`.

### Prior Learnings

- **Context-ledger is empty** (confirmed via `query_decisions`) — `VISION.md §11`
  (D1–D15) + `ROADMAP.md` are authoritative.
- **Phase 3 deferred SO₂ molecular to Phase 4 (verbatim):** *"SO₂ additions here are
  rate-only; molecular SO₂ (pH-dependent) is Phase 4."* Phase 3 records SO₂ *additions*
  (a dose); Phase 4 owns *measured* free/total SO₂ + pH and the derived molecular value.
- **Phase 3 open question carried in:** measuring a vessel that holds >1 lot — Phase 3
  leaned "one record per resident lot." See Key Decisions for Phase 4's call.
- **Windows/Neon migrations** (`memory/prisma-neon-migrations-windows.md`): `prisma
  migrate dev` is interactive + injects a phantom `search_vector DROP DEFAULT` diff that
  errors. Author SQL by hand:
  `URL=$(grep '^DATABASE_URL_UNPOOLED=' .env | sed 's/^[^=]*=//' | tr -d '"')` then
  `npx prisma migrate diff --from-url "$URL" --to-schema-datamodel ./prisma/schema.prisma --script | grep -v 'search_vector' > prisma/migrations/<ts>_<name>/migration.sql`,
  then `npx prisma migrate deploy` + `npx prisma generate`. **Stop the dev server before
  `generate`** (EPERM on the query-engine DLL). `@unique` on a nullable column = partial
  unique (Postgres allows multiple NULLs). New Prisma-enum *values* need their own
  isolated migration step (Postgres `ALTER TYPE … ADD VALUE`).

### External Research (winemaking domain)

- **Analyte units/ranges** (UC Davis, AWRI, WineMaker): pH (2 dp, 3.0–3.9); TA g/L
  tartaric US / H₂SO₄ EU (1 dp, 5–16); free/total SO₂ mg/L = ppm (0 dp); RS g/L; Brix
  °Bx (+ °Bé, SG alternates); temp °C/°F; malic & lactic g/L (2 dp, MLF tracking); VA
  g/L acetic (2 dp); alcohol % ABV (1 dp); plus acetaldehyde, reducing sugars, YAN.
  **Store the unit convention explicitly** (TA tartaric vs H₂SO₄; temp °C vs °F).
- **Molecular SO₂ — decision:** `molecular = free / (1 + 10^(pH − pKa))`, pKa ≈ 1.81 at
  20 °C (mildly temp-dependent; constant 1.81 is industry standard). Targets ≈ 0.5 (red)
  / 0.8 (white) mg/L. It is ALWAYS computable from same-sample free SO₂ + pH; no
  instrument measures it directly. **Recommendation: record free + total + pH; derive
  molecular read-only; do not store it.** Surface the assumed pKa alongside the result.
- **Sample lifecycle is real:** pull → (optionally send to outside lab) → results return
  hours-to-days later → attach to the lot. Bench (in-house): pH, TA, free SO₂, Brix,
  temp. Sent-out: malic/lactic (enzymatic/chromatography), VA, alcohol, full panels,
  micro. So `SENT`/`PENDING` are optional states; `resultedAt` lags `pulledAt`.
- **Tasting note fields:** appearance, aroma, flavor, structure (tannin/acidity/body/
  finish), score + scale (100-pt US / 20-pt academic), readiness flag
  (`NEEDS_MORE_TIME`/`READY_TO_BLEND`/`READY_TO_BOTTLE`/`HOLD`/`DECLINING`), free text,
  taster + date.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Record storage model | **Standalone tables** (`LotMeasurement`, `LotTastingNote`, `Sample`) keyed by `lotId`/`vesselId` with inline provenance — NOT attached to a `LotOperation` | Ride a zero-line `LotOperation` like `LotTreatment` | The Phase 4 constraint + D2: measurements aren't operations and must NOT go through `writeLotOperation`. BrixLog precedent proves the standalone+inline-provenance shape works. |
| Analyte set | **TS registry** (`src/lib/chemistry/analytes.ts`): key→{label, units, range, precision, category}. `LotMeasurement.analyte` is a **validated string** | Prisma enum per analyte; a DB `Analyte` table | "New analyte = config, not schema churn" (the explicit requirement). Validated-string precedent already exists (`rateBasis`). A DB table adds joins/seeding for zero current benefit. |
| Measurement granularity | **`AnalysisPanel` header + `AnalysisReading` children** (REVISED in eng review — see addenda). A panel owns `observedAt` + provenance + optional `sampleId` + `voidedAt`; each reading is `{analyte, value, unit}`. A single bench reading is just a 1-child panel. | Flat one-row-per-reading + shared `panelId` string (the original draft) | The header model makes panel undo atomic (void the header), SO₂ pairing unambiguous (within one panel), a returned lab result a first-class object (a panel linked to the sample → gives `RESULT_RETURNED` a home), and timeline grouping an FK not a string match. Trends stay a flat indexed query on `AnalysisReading(analyte, observedAt)`. Cost: one extra table + a join. (Codex outside-voice; accepted.) |
| Molecular SO₂ | **Derived read-only** from **same-panel** free SO₂ + pH; pKa=1.81 surfaced | Store molecular as its own measured analyte; pair by sampleId | Pure function of free+pH; storing it duplicates data and risks stale-pH drift. Pair strictly within ONE `AnalysisPanel` (never across panels/dates) so a stale pH can't cross-pair. |
| Timeline merge / sort | **Hybrid** (REVISED): operations keep their `op.id` order among themselves (preserves D14 + Phase 2 tests exactly); standalone records (panels/tasting/samples) are **slotted in by `observedAt`** relative to the ops. NOT a global observedAt re-sort. | Global observedAt-desc re-sort of the whole feed (original draft — contradicts D14); separate non-interleaved section | D14 locks op display order to `op.id` (observedAt collides/backdates). The hybrid keeps that contract for ops while still placing records by when they were observed. See addenda for the exact insert algorithm + required regression test. |
| Multi-resident vessel | If the vessel holds **exactly one** lot, auto-attach; if **>1**, the form **requires picking the lot**. Resolution is at the record's **effective (observed) time**, and **sample results inherit the sample's `lotId`** (captured at pull) — never re-resolved from the current vessel. | Resolve vessel→lot at submit-"now" (wrong for backdated entries / post-transfer sample results); write one record per resident lot | D2: a measurement belongs to one homogeneous liquid (see [[measurements-attach-to-one-lot]]). Resolving at "now" misattributes backdated/late-resulted readings. (Codex outside-voice; accepted.) |
| Undo | **Soft-delete** (`voidedAt` + `voidedById`) + audit row; the Undo toast AND the lot-timeline **Edit mode** (added this session) both set it. A panel voids **atomically** (void the header → all readings drop). | Hard delete; CORRECTION op; row-level void of individual readings | Not ledger ops → no CORRECTION semantics. Void the panel header so a panel never half-voids (which would break SO₂ derivation). Edit mode = the same affordance you use to delete an erroneous neutral op. |
| Sample → results | `Sample` 1→many **`AnalysisPanel`** via nullable `sampleId`; a returned result is a panel with the sample link, `status` flips `RESULT_RETURNED` → `ATTACHED` | `Sample` → many flat `LotMeasurement`; separate `SampleResult` table | A returned lab result is naturally a panel (batch of readings). Sample lifecycle transitions go through **guarded core fns** that set status + the matching timestamp together (no drift); invalid states (ATTACHED w/ no panel, SENT w/o sentAt) are rejected. |
| Status/flag enums | `SampleStatus`, `TastingReadiness`, `TastingScoreScale` as **Prisma enums** | Validated strings | Small, stable, closed sets → real enums (matches `CaptureMethod`). |
| Audit actions | **Add deliberate `AuditAction` values** for the sample lifecycle (isolated enum-add migration); reuse `CREATE`/`DELETE` for plain panel/tasting create+void | Reuse a generic action everywhere (original eng-review suggestion) | Codex cross-model: controlled-enum ethos (D4) + cheap isolated migration (done in Phase 3) beats losing audit semantics. Eng reviewer reversed position. |

## Eng Review Decisions & Addenda (2026-06-28)

This section is authoritative and **supersedes** any conflicting wording in the unit bodies
below (the draft predates the eng + Codex review). Folded in:

**1. Panel model = header + children.** Replace flat `LotMeasurement`+`panelId` with:
- `AnalysisPanel` (`id`, `lotId`, `vesselId?`, `sampleId?`, `observedAt`, `enteredAt`,
  `enteredById?`/`enteredByEmail`, `captureMethod`, `note?`, `voidedAt?`/`voidedById?`,
  `clientRequestId?` unique — idempotency).
- `AnalysisReading` (`id`, `panelId` FK→cascade, `analyte` String code-validated,
  `value Decimal(12,4)`, `unit` String). Index `@@index([panelId])` and, for trends,
  `@@index([analyte])` (+ the parent's `observedAt` is the time axis — trend query is
  `analysisReading.findMany({ where:{ analyte, panel:{ lotId, voidedAt:null }}, include:{panel} })`).
- `Sample` 1→many `AnalysisPanel` (nullable `sampleId`). A returned lab result is a panel
  with `sampleId` set; `RESULT_RETURNED` = panel exists but not yet acknowledged, `ATTACHED`
  = acknowledged on the lot. Tasting notes stay their own table.

**2. Hybrid timeline ordering (exact algorithm).** Ops form the backbone in `op.id` desc
order (unchanged from Phase 2). Then insert each standalone item (panel / tasting / sample)
into the backbone by `observedAt`: place it immediately before the first op whose
`observedAt` is older (≤) than the record's `observedAt`; ties and record-vs-record order
break by `createdAt` desc then `id`. Ops never reorder relative to each other.
**Required tests** (extend `test/lot-timeline.test.ts`):
- ops-only lot renders **identical** order to today (D14 regression guard);
- a backdated panel slots between the correct ops;
- ops keep id-order even when an op's `observedAt` is non-monotonic with its id;
- a voided panel/tasting/sample is excluded.

**3. Edit mode handles records.** The lot-timeline **Edit mode** (`LotDetailClient.tsx`
`TimelineEditModal` / `isActionable` / "Edit timeline" toggle — added this session) is
extended: a `kind:'MEASUREMENT'|'TASTING'|'SAMPLE'` item is actionable → its modal voids
(soft-delete) via `voidPanelAction`/`voidTastingNoteAction`/`cancelSampleAction`. Panels
void atomically (header). Use a **discriminated-union `TimelineItem { kind }`** rather than
overloading the op-shaped `TimelineEvent`.

**4. observedAt semantics.** `observedAt` = when the wine was sampled/measured (for a
sample-linked panel, the sample's pull time; for a bench panel, the reading time).
`enteredAt` = entry time. `Sample.resultedAt` = when the lab ran it (metadata, not the
reading's observed time). Trends plot by `observedAt`.

**5. Analyte registry back-compat.** Keys are **stable + append-only** — never rename/remove
a key; mark `deprecated:true` instead. The renderer falls back gracefully for an unknown
stored key (show the raw key + value). Test: a stored unknown key still renders.

**6. Unit normalization in charts.** A trend chart plots ONE canonical unit per analyte
(the registry `defaultUnit`); readings entered in an alternate unit are converted via a
registry-provided converter where defined (°C↔°F; tartaric↔H₂SO₄ TA) or split into a second
series when no conversion exists (e.g. Brix/SG/Baumé). Every value + axis shows its unit.

**7. Decimal across the boundary.** All loaders convert Prisma `Decimal` → `number`
(`Number(x)`) before returning to client components — same as `src/lib/lot/data.ts` does
today. Never pass a `Decimal` into a Client Component or chart prop.

**8. Idempotency.** Capture forms disable the submit button while pending (as `CellarActions`
does); panel/sample create additionally carries a `clientRequestId` (cuid generated in the
form) with a unique constraint, so a double-submit/retry is a no-op upsert.

**9. Shared form extraction (sequencing).** Extract a shared reading-rows / panel sub-form
into `src/components/chemistry/` in **Unit 7**, consumed by both `CellarActions` and the
**Unit 8** `/samples` attach surface. Unit 8 depends on that extraction.

**10. Audit.** Reuse `CREATE`/`DELETE` for panel + tasting create/void; add deliberate
`SAMPLE_PULLED`/`SAMPLE_SENT`/`SAMPLE_ATTACHED`/`SAMPLE_CANCELLED` (or one `SAMPLE_EVENT`)
to the `AuditAction` enum in an **isolated `ALTER TYPE … ADD VALUE` migration step**.

**11. verify-chemistry.ts isolation.** Mirror `scripts/verify-cellar-ops.ts` exactly:
create `ZZ-TEST-*` fixtures, run all asserts, **scrub in a `finally`**, assert `BrixLog`
row count unchanged, and confirm no test rows remain.

**12. Scope-criteria fix.** Tasting-note search (Unit 9) is **NICE**; the success criterion
"tasting notes record + are searchable" is split — *record* is required (Unit 3/7),
*searchable* is the NICE follow-up (Unit 9), so the phase definition is self-consistent.

**13. Dependency graph (tightened).** Unit 4 depends on **Unit 2** (types/shapes) — its
pure describe/merge can be built against fixtures before Unit 3 writes exist. Unit 7
extracts the shared form; Unit 8 depends on Unit 7's extraction. Unit 6 depends on the
Edit-mode extension (item 3).

## Design Specification (design review 2026-06-28)

Token-driven per `DESIGN.md` (warm editorial, light-only, sentence-case, no hardcoded
colors/spacing, no AI-slop). Reuses the Phase 3 capture vocabulary (`fieldStyle` h44,
`Button` minHeight 44, `inputMode="decimal"`, `aria-live="polite"`, the "Logged · Undo"
toast, op-type-as-text-Badge). Authoritative for Units 5–8.

**Samples surface (IA resolved):** a **dedicated `/samples` page** under the WINERY nav
group **+ a "N pending" count badge** on that nav item AND on the lot detail header, so a
returned lab result is never forgotten. The page is a table (lot · source · status · age
"pulled 3d ago") of non-terminal samples; each row opens an attach-results modal.

**Interaction states (fill for every new surface):**
| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Analysis/Tasting/Sample form | submit disabled + "Saving…" | n/a | inline red msg, inputs preserved | "Logged · Undo" toast | n/a |
| Lot trend section | skeleton line | warm "No readings yet — log a pH or SO₂ to start the trend" + a Log-analysis affordance | inline msg | chart renders | per-analyte: analytes with ≥1 reading render, others hidden behind "show all" |
| `/samples` table | skeleton rows | warm "No open samples — pull one from a vessel" + link to /bulk | inline msg | rows render | mixed statuses each show their own Badge |
| Molecular SO₂ panel | — | hidden when no free+pH in a panel | — | quiet `tabular-nums` line | — |

**Specific controls / treatments:**
- **Molecular SO₂:** a **quiet one-line `tabular-nums` read** (e.g. "Molecular SO₂ ≈ 0.78
  mg/L · derived from free 40 + pH 3.50 · pKa 1.81"), muted color, NOT a decorated callout
  (Phase 3 anti-slop). Shown only when a panel has both free SO₂ + pH.
- **Trend chart:** default-show pH · TA · free SO₂ · Brix (those with ≥1 reading); the rest
  behind a "show all analytes" toggle. Degenerate states: 0 points → the empty message
  above (no axes); 1 point → a single dot + value label, no polyline. Optional target band
  = a shaded rect in `--accent-soft` with a muted edge label (for molecular-SO₂ / SO₂
  targets). Axis + every value carries its unit. `niceAxisBounds` must NOT floor pH to 0.
- **Tasting structure fields** (tannin/acidity/body/finish): labeled **1–5 segmented
  controls** (5 ≥44px buttons), not a dropdown — faster on the floor; `readiness` as a text
  **Badge** (tone mapped: READY_TO_BOTTLE=green, HOLD=neutral, DECLINING=red — never
  color-only, label always shown); score + scale as a number + small scale select.
- **Sample status:** a text **Badge** per status (PULLED/SENT/PENDING neutral, ATTACHED
  green, CANCELLED muted), never color-only; age as relative text.
- **Multi-resident lot picker:** when the vessel holds >1 lot, the capture form shows a
  required lot **select** at the top (lot code + variety) before the reading rows; a 1-lot
  vessel auto-selects and shows the lot code as static text.
- **Analyte picker:** grouped by `category` (acidity / SO₂ / sugar / …) in the select.
- **Edit-mode integration** (from eng review): measurement/tasting/sample timeline items are
  actionable in the lot-detail "Edit timeline" mode → modal voids them (soft-delete); panels
  void atomically.
- **a11y:** `inputMode="decimal"` on every value field; ≥44px targets; `:focus-visible` →
  `--shadow-focus`; the live molecular-SO₂ line + form errors in `aria-live="polite"`;
  status/readiness never color-only; `/samples` table is a semantic `<table>`.

## Implementation Units

### Unit 1: Analyte registry + SO₂ derivation (pure, tested, no DB)

**Goal:** The controlled analyte set as config + the molecular-SO₂ derivation, both pure
and unit-tested before any schema exists.
**Files:** `src/lib/chemistry/analytes.ts` (new), `src/lib/chemistry/so2.ts` (new),
`test/chemistry-analytes.test.ts` (new), `test/chemistry-so2.test.ts` (new).
**Approach:** In `analytes.ts` export an `ANALYTES` record keyed by analyte key
(`PH`, `TA`, `FREE_SO2`, `TOTAL_SO2`, `RS`, `BRIX`, `SG`, `BAUME`, `TEMP`, `MALIC`,
`LACTIC`, `VA`, `ALCOHOL`, plus `ACETALDEHYDE`, `YAN` as NICE) → `{ label, category,
units: AnalyteUnit[], defaultUnit, min?, max?, precision }`, plus an `ANALYTE_KEYS`
`as const` tuple + `AnalyteKey` type + `isAnalyteKey(x)`/`validateMeasurement(key,value,
unit)` guards (range + unit membership). Mirror `src/lib/ledger/vocabulary.ts` style.
In `so2.ts` export `molecularSO2({ freeSO2, pH, pKa = 1.81 })` →
`free / (1 + 10^(pH − pKa))`, returning value + the pKa used; guard NaN/missing inputs
to `null`. Use plain numbers (display math, not ledger Decimal).
**Tests:** valid/invalid analyte keys; range validation accepts in-range, rejects
out-of-range; unit membership; `molecularSO2` matches known reference points (e.g. free
40 @ pH 3.5 ≈ 0.78; free 30 @ pH 3.0 ≈ 1.79); null on missing pH/free.
**Depends on:** none
**Execution note:** test-first.
**Patterns to follow:** `src/lib/ledger/vocabulary.ts`, `src/lib/cellar/additions-math.ts`.
**Verification:** `npm test -- chemistry` passes.

### Unit 2: Prisma schema + migration (standalone records + enums)

**Goal:** Add `LotMeasurement`, `LotTastingNote`, `Sample` models + `SampleStatus`,
`TastingReadiness`, `TastingScoreScale` enums; relations on `Lot`/`Vessel`/`User`.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_chemistry_tasting_records/migration.sql` (new, hand-authored).
**Approach:** Follow conventions — `@id @default(cuid())`, `@@map` snake_case, camelCase
fields, `Decimal @db.Decimal(p,s)`, inline provenance `*ById` (nullable FK) + `*ByEmail`
(durable snapshot) pairs, `observedAt`/`enteredAt`/`captureMethod` on each.
- **`AnalysisPanel`** (REVISED — header; see addenda item 1): `id`, `lotId`, `vesselId?`,
  `sampleId?`, `observedAt`, `enteredAt @default(now())`, `enteredById?`, `enteredByEmail`,
  `captureMethod` (CaptureMethod enum), `note?`, `clientRequestId? @unique` (idempotency),
  `voidedAt?`, `voidedById?`. Indexes `@@index([lotId, observedAt])`, `@@index([vesselId])`,
  `@@index([sampleId])`.
- **`AnalysisReading`** (child): `id`, `panelId` (FK → `AnalysisPanel`, `onDelete: Cascade`),
  `analyte` (String, code-validated), `value Decimal(12,4)`, `unit` (String). Indexes
  `@@index([panelId])`, `@@index([analyte])`. (Trends: query readings by `analyte` joined to
  the non-voided parent panel; the panel's `observedAt` is the time axis.)
- `LotTastingNote`: `id`, `lotId`, `vesselId?`, `observedAt`, `enteredAt`, provenance,
  `appearance?`, `aroma?`, `flavor?`, `tannin?`/`acidity?`/`body?`/`finish?` (small Int
  1–5 or String — choose Int 1–5), `score Int?`, `scoreScale TastingScoreScale?`,
  `readiness TastingReadiness?`, `notes? String`, `voidedAt?`/`voidedById?`. Index
  `@@index([lotId, observedAt])`. (Free-text search: rely on `notes`/`aroma`/`flavor`
  `contains` for the NICE search — no tsvector this phase, to avoid the search_vector
  migration gotcha.)
- `Sample`: `id`, `lotId`, `vesselId?`, `status SampleStatus @default(PULLED)`,
  `source? String` (free text e.g. "Barrel A3"), `lab? String`, `pulledAt`, `sentAt?`,
  `expectedAt?`, `resultedAt?`, provenance, `note?`, `cancelledAt?`. Relations: `Sample`
  1→many **`AnalysisPanel`** (via nullable `sampleId`; a returned result is a panel linked
  to the sample). Index `@@index([lotId, status])`, `@@index([status])`.
- Enums: `SampleStatus { PULLED SENT PENDING RESULT_RETURNED ATTACHED CANCELLED }`,
  `TastingReadiness { NEEDS_MORE_TIME READY_TO_BLEND READY_TO_BOTTLE HOLD DECLINING }`,
  `TastingScoreScale { HUNDRED_POINT TWENTY_POINT }`.
- Add back-relations to `Lot`, `Vessel`, `User` (e.g. `measurements`, `tastingNotes`,
  `samples`). Do NOT modify `BrixLog`.
- Migration authored via the Windows/Neon flow (Unit-level note below). New enums are
  CREATE TYPE (fresh types — no `ALTER TYPE ADD VALUE` gotcha since these are new).
**Tests:** none (schema). Parity is covered by build + `prisma generate`.
**Depends on:** none (can run parallel to Unit 1).
**Execution note:** Author SQL by hand:
`URL=$(grep '^DATABASE_URL_UNPOOLED=' .env | sed 's/^[^=]*=//' | tr -d '"')`,
`npx prisma migrate diff --from-url "$URL" --to-schema-datamodel ./prisma/schema.prisma --script | grep -v 'search_vector' > prisma/migrations/<ts>_chemistry_tasting_records/migration.sql`,
`npx prisma migrate deploy`, stop dev server, `npx prisma generate`.
**Patterns to follow:** `LotTreatment` + `BrixLog` blocks in `prisma/schema.prisma`;
`CaptureMethod` enum.
**Verification:** `npx prisma migrate deploy` clean; `npx prisma generate` clean; `npm
run build` typechecks the new client models.

### Unit 3: Server core + actions (create/void; sample lifecycle) — NOT via ledger

**Goal:** Create measurements (single + panel), tasting notes, and run the sample
lifecycle (pull → send → attach results), plus soft-delete/void — all writing standalone
records with `writeAudit`, never `writeLotOperation`.
**Files:** `src/lib/chemistry/measurements.ts` (new), `src/lib/chemistry/tasting.ts`
(new), `src/lib/chemistry/samples.ts` (new), `src/lib/chemistry/actions.ts` (new,
`"use server"`), `src/lib/chemistry/resolve-lot.ts` (new — vessel→resident-lot
resolution), `test/chemistry-resolve-lot.test.ts` (new, pure parts).
**Approach:** Mirror `src/lib/cellar/treatments.ts` + `actions.ts` structure but WITHOUT
the ledger: `*Core(actor, input)` functions use `prisma.$transaction` (default isolation
is fine — no fold math, no overfill risk) to insert rows + `writeAudit(tx, …)` with a
new `AuditAction` (reuse an existing generic action or add `MEASUREMENT_LOG`; prefer
reusing an existing value to avoid an enum migration — confirm `AuditAction` values in
schema and pick the closest, else add in an isolated step). Functions:
`recordMeasurementsCore(actor, { lotId, vesselId?, sampleId?, readings: [{analyte,value,
unit,observedAt}], captureMethod, note? })` — validates each via `validateMeasurement`,
assigns a shared `panelId` when >1 reading, returns created ids; `recordTastingNoteCore`;
`pullSampleCore`, `markSampleSentCore`, `attachSampleResultsCore` (creates measurements
with `sampleId`, flips status), `cancelSampleCore`; `voidMeasurementCore`/
`voidTastingNoteCore` (set `voidedAt`/`voidedById`). `resolve-lot.ts`: given `vesselId`,
read `vesselLot.findMany` → if 1 resident return its `lotId`; if >1 require an explicit
`lotId` (throw a typed error the UI maps to a picker). `"use server"` wrappers via
`action()` + `revalidatePath('/lots/[id]', 'page')` and the capture surface route.
**Tests:** `resolve-lot` selection logic (1 vs N residents) as a pure helper; validation
rejection paths. (DB writes verified by the Unit 10 script.)
**Depends on:** Unit 1, Unit 2.
**Patterns to follow:** `src/lib/cellar/treatments.ts`, `src/lib/cellar/actions.ts`,
`src/lib/actions.ts` (`action()`), `src/lib/audit.ts`.
**Verification:** `npm run build`; a scratch call records a pH + voids it.

### Unit 4: Timeline loader UNION + describe rail extension

**Goal:** Surface measurements, tasting notes, and samples on the existing lot timeline
by adding three UNION sources and merging them into the feed by `observedAt`.
**Files:** `src/lib/lot/data.ts`, `src/lib/lot/timeline.ts`, `test/lot-timeline.test.ts`.
**Approach:** In `data.ts`, add to the `Promise.all` three `findMany({ where:{ lotId,
voidedAt: null (where applicable) }})` for measurements, tasting notes, samples. In
`timeline.ts`, extend `TimelineEvent` (or add a sibling `TimelineItem` discriminated
union with a `kind: 'OP' | 'MEASUREMENT' | 'TASTING' | 'SAMPLE'`) and a `describeRecord`
that emits a `summary` (e.g. "pH 3.72, TA 6.4 g/L" for a panel — group measurements by
`panelId`; "Tasting · 92/100 · ready to blend"; "Sample pulled → sent to ETS
(pending)"). Build the final feed by concatenating op-events + record-items and sorting
by `observedAt` desc with a stable tiebreak (ops keep `op.id`, records keep `createdAt`).
Keep the existing op grouping intact. Panels: collapse measurements sharing a `panelId`
into one timeline item.
**Tests:** extend `lot-timeline.test.ts` — a measurement panel renders one item with all
analytes; a pending sample renders with its status; interleave order is by `observedAt`;
a voided record is excluded.
**Depends on:** Unit 2 (types), Unit 3 (shapes). Pure-describe parts can be built against
fixtures before DB rows exist.
**Patterns to follow:** `describeOperation` switch (`src/lib/lot/timeline.ts:164–273`),
the `byOp` grouping (`src/lib/lot/data.ts:166–220`).
**Verification:** `npm test -- lot-timeline` passes; build clean.

### Unit 5: Generalized analyte trend chart

**Goal:** A reusable per-analyte trend chart component built on the harvest chart math,
with an optional target band (for molecular SO₂ / SO₂ targets).
**Files:** `src/lib/harvest/chart.ts` (add a generic `niceAxisBounds(values, step?)`
beside `brixAxisBounds`), `src/components/ui/AnalyteTrendChart.tsx` (new),
`test/chemistry-chart.test.ts` (new — for the new bounds helper).
**Approach:** Copy `BrixChart.tsx`'s SVG scaffold (viewBox 800×h, `scaleLinear`/
`computeDomain`, polyline+dots, `<title>` tooltips, design tokens) into
`AnalyteTrendChart` parameterized by `{ analyteKey, points:[{date,value}], unit,
targetBand?:{min?,max?} }`; use `niceAxisBounds` (generalized `brixAxisBounds` that
takes a step and doesn't hardcode 5/clamp-to-0 for analytes like pH) for the Y domain;
draw an optional shaded target band. Keep `BrixChart` untouched (vineyard).
**Tests:** `niceAxisBounds` for pH (3.0–3.9 → sane bounds, not floored to 0), SO₂
(0–60), single-value/empty/degenerate domains.
**Depends on:** Unit 1 (analyte metadata for unit labels).
**Patterns to follow:** `src/components/ui/BrixChart.tsx`, `src/lib/harvest/chart.ts`.
**Verification:** `npm test -- chemistry-chart`; renders in Unit 6.

### Unit 6: Lot detail — render records, trends, derived molecular SO₂

**Goal:** On the lot detail, render the new timeline items, an analyte-trend section
(chart per tracked analyte), and a derived molecular-SO₂ panel.
**Files:** `src/app/(app)/lots/[id]/LotDetailClient.tsx`, `src/app/(app)/lots/[id]/page.tsx`
(if loader output needs extending), possibly a new `AnalyteTrends.tsx` subcomponent.
**Approach:** Render the extended timeline items (measurements/tasting/sample) using the
Unit 4 describe output, matching existing timeline item styling. Add an "Analyte trends"
section that, from the lot's measurements, renders an `AnalyteTrendChart` per analyte
that has ≥1 reading (default to a few key ones, e.g. pH/TA/free SO₂/Brix, others behind
a toggle). Add a "Current chemistry" header card that, when a panel has free SO₂ + pH,
shows the derived molecular SO₂ via `molecularSO2()` with the pKa noted. Tasting notes
render with structure sub-scores + readiness badge.
**Tests:** none new (UI); covered by build + Unit 10 manual verify.
**Depends on:** Unit 4, Unit 5, Unit 1.
**Patterns to follow:** existing `LotDetailClient.tsx` timeline rendering; DESIGN.md
tokens (no hardcoded colors/spacing).
**Verification:** open a lot with seeded readings → timeline shows them; trend chart
renders; molecular SO₂ shows when free+pH present.

### Unit 7: Vessel-first capture — Log analysis / Tasting note / Pull sample

**Goal:** Add the three capture actions to the Phase 3 per-vessel Actions row with
inline forms, provenance, live validation, and the "Logged · Undo" toast.
**Files:** `src/app/(app)/bulk/CellarActions.tsx` (extend the `ACTIONS` array + add
`AnalysisForm`, `TastingForm`, `SampleForm`), possibly `src/app/(app)/bulk/BulkClient.tsx`
if it passes lot/material props.
**Approach:** Add three actions. `AnalysisForm`: analyte picker (from `ANALYTES`, grouped
by category) + value (`inputMode="decimal"`) + unit select (analyte's units) + observedAt
(default now) + "add another analyte" rows for a panel + note; `aria-live` shows derived
molecular SO₂ live when free SO₂ + pH are both entered. `TastingForm`: aroma/flavor text,
structure 1–5 selects, score + scale, readiness select, notes. `SampleForm`: source,
optional lab, "send now?" toggle (sets SENT) + note. Each resolves the vessel's lot via
the Unit 3 helper; if >1 resident, show a lot picker. On submit call the Unit 3 action;
on success show the toast whose Undo calls the matching `void*`/`cancelSample` action.
Reuse `fieldStyle` (h44), `Button` (minHeight 44), `role="status"` toast.
**Tests:** none new (UI). Form validity logic mirrors `DoseForm`.
**Depends on:** Unit 3, Unit 1.
**Patterns to follow:** `src/app/(app)/bulk/CellarActions.tsx` (`DoseForm`, `runOp`,
`undo`, toast); `inputMode`/`aria-live`/≥44px from the same file.
**Verification:** in `/bulk`, log a pH on a vessel → toast → Undo removes it; pull a
sample → it shows pending on the lot timeline.

### Unit 8: Pending-sample attach surface

**Goal:** See pending/sent samples and attach returned lab results to the lot.
**Files:** new `src/app/(app)/samples/page.tsx` + client (RESOLVED in design review:
**dedicated page + a "N pending" count badge** on the WINERY nav item and the lot-detail
header), reusing Unit 3 `attachSampleResultsCore` and the shared reading-rows form (Unit 7).
**Approach:** A lightweight list of `Sample`s in non-terminal states
(`PULLED`/`SENT`/`PENDING`) with lot + source + age; each row opens an "attach results"
form (reuse the `AnalysisForm` reading rows) that calls `attachSampleResultsAction` and
flips status to `RESULT_RETURNED`/`ATTACHED`. Add a nav entry under the WINERY group in
`AppShell.tsx`. Keep scope tight — a table + an attach modal, no analytics.
**Tests:** none new (covered by Unit 3 + Unit 10).
**Depends on:** Unit 3, Unit 7 (reuses reading-row UI).
**Patterns to follow:** `src/app/(app)/lots/page.tsx` + `LotsClient.tsx` list pattern;
nav add in `src/components/AppShell.tsx`.
**Verification:** pull a sample, mark sent, attach a malic result → measurement appears
on the lot timeline + trend; sample status reaches ATTACHED.

### Unit 9: Tasting-note search (NICE)

**Goal:** Make tasting history searchable over time.
**Files:** `src/lib/lot/data.ts` (add a `searchTastingNotes(q)` loader using
`contains` over `notes`/`aroma`/`flavor`), `src/app/(app)/lots/LotsClient.tsx` (a search
box that filters/links to lots with matching notes), or a small `/tasting` view.
**Approach:** Simple case-insensitive `contains` query (no tsvector — avoids the
search_vector migration gotcha) returning lot + snippet + date; render as links into the
lot timeline. Keep minimal.
**Tests:** none new (thin query).
**Depends on:** Unit 2, Unit 3.
**Patterns to follow:** existing list/search in `LotsClient.tsx`.
**Verification:** type a flavor descriptor → matching lots surface.

### Unit 10: Verify script + exit-criteria proof

**Goal:** A deterministic script proving the Phase 4 exit criteria end-to-end.
**Files:** `scripts/verify-chemistry.ts` (new, run via `tsx --env-file=.env`).
**Approach:** Against a test lot: record a pH + TA + free SO₂ panel (assert one panel,
molecular SO₂ derives); assert they appear on the timeline interleaved by observedAt;
pull a sample, mark sent, attach a malic result later, assert status ATTACHED + the
measurement on the timeline + trend; void a measurement and assert it drops off the
feed; assert `BrixLog` is untouched (row count unchanged). Print PASS/FAIL per check.
**Tests:** the script IS the integration test.
**Depends on:** Units 2–8.
**Patterns to follow:** `scripts/verify-cellar-ops.ts`, `scripts/verify-projection.ts`.
**Verification:** `npx tsx --env-file=.env scripts/verify-chemistry.ts` → all PASS.

## Test Strategy

**Unit tests (Vitest, `test/*.test.ts`, pure — no DB):** analyte registry validation;
SO₂ derivation vs reference points; `niceAxisBounds`; vessel→lot resolution; timeline
describe/merge/sort over fixtures (panel collapse, sample status, observedAt interleave,
voided exclusion).
**Integration:** `scripts/verify-chemistry.ts` exercises the real DB write/read paths
(panel, sample lifecycle, void, BrixLog untouched).
**Manual verification:** `/bulk` → log analysis / tasting / pull sample on a vessel;
`/lots/[id]` → timeline items + trend charts + molecular SO₂ panel; `/samples` → attach a
returned result; confirm undo and the ≥44px/`aria-live`/`inputMode` patterns.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Timeline sort regression — interleaving non-op records by `observedAt` reorders existing op feed | MED | MED | Keep op-vs-op order by `op.id` within equal `observedAt`; cover with `lot-timeline.test.ts` fixtures incl. backdated records; visual check on a legacy lot. |
| Windows/Neon migration phantom `search_vector` diff / interactive `migrate dev` | HIGH | MED | Use the hand-authored `migrate diff --from-url … | grep -v search_vector` → `migrate deploy` flow; stop dev server before `generate`. |
| Multi-resident-vessel ambiguity (which lot gets the reading) | LOW | MED | Auto-attach only when 1 resident; require explicit lot pick when >1 (typed error → UI picker). Honors D2. |
| Molecular SO₂ shown from mismatched pH/free (stale pairing) | MED | HIGH | Derive only within a single `panelId`/`sampleId`; never cross-pair across dates; surface the source readings + pKa. |
| Analyte unit confusion (TA tartaric vs H₂SO₄; °C vs °F) | MED | MED | Store `unit` explicitly per reading; registry lists allowed units; show unit on every value + chart axis. |
| Scope creep toward the Phase 6 ferment grid | MED | MED | Single-entry + panel only; the bulk Round grid is explicitly out (Phase 6 builds on these records). |
| New `AuditAction` enum value forces an extra migration | LOW | LOW | Prefer reusing an existing `AuditAction`; if a new value is truly needed, add it in its own isolated migration step. |

## Success Criteria (Phase 4 exit)

- [ ] Log pH/TA (+ free/total SO₂) on a lot from the vessel-first Actions row, with full
      provenance, as standalone records (not ledger ops).
- [ ] See per-analyte trends over the lot's timeline (reusing the harvest chart math).
- [ ] A pulled sample can sit pending and later attach its result(s) to the lot
      (`PULLED → SENT → PENDING → RESULT_RETURNED → ATTACHED`).
- [ ] Molecular SO₂ is shown as a derived read from same-panel free SO₂ + pH (not stored).
- [ ] Tasting notes record + are searchable over time.
- [ ] Chemistry/tasting/sample records appear on the existing lot timeline, interleaved
      by observedAt; voided records drop off.
- [ ] `BrixLog` (vineyard) is untouched.
- [ ] All Vitest tests pass; `scripts/verify-chemistry.ts` all PASS; `npm run build`
      clean; no regressions in existing tests.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 17 challenges; 2 became decisions (panel model, audit), rest folded as refinements |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 architecture decisions resolved (timeline ordering = hybrid; Edit-mode handles records); 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 6/10 → 9/10; 1 IA decision (samples = page + count badge); state/empty/control specs folded into a Design Specification section |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**ENG REVIEW (2026-06-28):** 2 genuine architecture decisions, both resolved:
(1) timeline ordering → **hybrid** (ops keep `op.id` order per D14, standalone records slot
in by `observedAt`); (2) the lot-timeline **Edit mode** (added this session) is extended to
edit/void chemistry records. Code-quality: timeline uses a discriminated-union
`TimelineItem { kind }`. Tests: + hybrid-ordering regression/edge fixtures, voided-exclusion,
edit-mode actionability. Performance: no issues.

**CODEX (outside voice):** headline win — **`AnalysisPanel` header + `AnalysisReading`
children** replaces flat-rows+`panelId` (atomic panel undo, unambiguous SO₂ pairing,
returned-result-as-panel home, FK grouping). Folded refinements: explicit `observedAt`
semantics, effective-time lot resolution (+ sample results inherit `lotId`), guarded sample
state-machine, idempotency (`clientRequestId`), append-only analyte keys + unknown-key
fallback, chart unit normalization, Decimal→number at the boundary, shared form extraction
before Units 7/8, isolated `verify-chemistry.ts` fixtures+scrub, scope-criteria fix,
tightened dependency graph.

**CROSS-MODEL:** 2 tensions, both resolved in Codex's favor (panel model; deliberate audit
enum values). Eng reviewer reversed the audit recommendation accordingly.

**UNRESOLVED:** 0.

**DESIGN REVIEW (2026-06-28):** 6/10 → 9/10. One IA decision resolved (samples = dedicated
`/samples` page + "N pending" count badge). All state/empty/error specs, the molecular-SO₂
quiet-line treatment, trend degenerate states + target band, 1–5 segmented structure fields,
status/readiness text-Badges, the multi-lot picker, and the Edit-mode record integration are
captured in the new **"Design Specification (design review 2026-06-28)"** section
(authoritative for Units 5–8).

**VERDICT:** ENG + DESIGN CLEARED — ready to implement on a fresh worktree branch off main.
All decisions captured in "Eng Review Decisions & Addenda" + "Design Specification"
(both 2026-06-28, both authoritative).
