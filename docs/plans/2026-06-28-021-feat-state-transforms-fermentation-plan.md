---
title: State Transforms & Fermentation Logging (Phase 6)
type: feat
status: completed
date: 2026-06-28
branch: main
depth: deep
units: 12
---

## Overview

Phase 6 turns fruit into wine. It adds the **measured-yield transforms** — crush/destem
(grapes → must) and press (must/wine → juice/wine, splitting free-run from press) — and the
**daily life of an active fermentation**: a fast offline-capable **Fermentation Round** grid
for Brix/temp across every active vessel, an explicit **fermentation phase** on the lot
(cold-soak → primary → pressed → MLF → dry) with a **stuck-ferment** signal, and cold-soak/
maceration capture. It's the first phase that *consumes* the substrate built in 4 (chemistry/
analyte records + trends) and 5 (the split/originate lineage primitive) rather than adding a
new one.

Two user decisions shape it: **crush bridges to the existing harvest picks** (real
grape-to-lot traceability), and the Round grid is **offline-first** (cellars have no wifi).
Voice/assistant Brix-logging is deferred to Phase 10 — Phase 6 makes the records
assistant-ready and ships the fast numpad grid a 20-tank matrix actually needs.

## Problem Frame

Today a lot is born already as wine (`form: "WINE"`, seeded at a volume). There's no way to
record that 3.2 tonnes of Cabernet became 2,350 L of must, that the press split it into
free-run and press lots, or what the Brix/temp did each morning of a two-week ferment. The
winemaker's most data-dense, time-critical period — active fermentation — is invisible to the
system, and the kg→L birth of every lot is unmodeled.

Do nothing and: the vineyard→cellar link never closes (harvest picks dead-end in kg), press
fractions can't be tracked as separate lots, the analyte trends from Phase 4 have nothing
feeding them during ferment, and the cellar crew keeps Brix on a clipboard because the app
can't capture offline on the crush pad.

**Product frame — the Round is the adoption test.** A cellar hand at 6am with 20 tanks and no
signal will not fight the software. If capture isn't instant, offline, and numpad-fast, it
won't get used and the data rots (VISION's whole "keep the data clean" thesis). So the Round
grid's bar is: works with zero bars of signal, one row per tank, oversized auto-advancing
fields, operator+time entered once. Everything else in this phase is secondary to that.

## Requirements

- MUST: **crush/destem transform** — consume selected harvest picks (kg), originate the first
  must lot at **measured-actual liters** (D8, never arithmetic kg→L), record input kg + yield%
  + pick linkage; sets `form = MUST` (reds, on skins) or feeds a press (whites).
- MUST: **press transform** — split a must/wine lot into **separate child lots** (free-run +
  press cut(s)) at measured volumes, reusing the Phase 5 split/originate primitive; lees/skins
  loss derived; whites press *before* ferment (must→juice), reds *after* (wine off skins).
- MUST: **lot form becomes changeable** (D4) — MUST → JUICE → WINE transitions, recorded, not
  silent; driven by the fermentation phase machine.
- MUST: **explicit fermentation phase** on the lot (`NONE / COLD_SOAK / PRIMARY / PRESSED /
  MLF / DRY`) + a **stuck/sluggish-ferment signal** (Brix not dropping); MLF tracked as a
  phase + malic-acid readings (Phase 4 analytes).
- MUST: the **Fermentation Round** — a multi-row worksheet, one row per active vessel, oversized
  auto-advancing Brix/temp fields, operator/time captured once per round, one-tap flags
  (stuck/hot/foam/sample-sent), writing Phase 4 `LotMeasurement` records.
- MUST: **offline capture** for the Round (and crush-pad entry) — capture never blocked by no
  signal; queue locally; sync when back online; never lose or duplicate a reading.
- MUST: **cap management reused + extended** — Phase 3 `CAP_MGMT` (pump-over/punch-down) plus
  cold-soak/extended-maceration as phase states/captures.
- SHOULD: **staged ferment additions** (yeast, rehydration nutrients, DAP) surfaced in the
  ferment context, reusing Phase 3 `ADDITION` ops (supply draw-down is Phase 8).
- SHOULD: **sticky context** — don't re-pick the vessel for each Round entry; operator/time
  inherited once.
- NICE: the lot detail shows the ferment curve (Phase 4 trend) + phase timeline.

## Scope Boundaries

**In scope:** crush + press transforms (measured yield, form changes, press splits); the
fermentation phase state machine + stuck signal + MLF state; the offline Round grid (full
queue-and-sync); cold-soak/maceration; crush-pad + ferment capture UI; lot-detail ferment
view.

**Out of scope (and why):**
- **Voice/assistant Brix-logging** — Phase 10. Records are assistant-ready (`captureMethod`,
  clean shapes); the numpad grid is the human path now.
- **Supply inventory draw-down + cost** — Phase 8. Staged additions reuse Phase 3 ADDITION
  ops; they don't decrement stock yet.
- **Sparkling / tirage** — Phase 7. **Work orders** — Phase 9.
- **Bidirectional offline mirror** — out. Offline is *capture* (append-only outbox), not a
  full offline-first read mirror of the cellar (gold-plating per the offline research).
- **Background Sync API** — not built (absent on iOS Safari, the winery-tablet reality);
  foreground drain only.

## Research Summary

### Codebase Patterns

- **Harvest picks (the crush input)** (`prisma/schema.prisma:315–352`): `HarvestRecord
  {blockId, vineyardId, vintageYear, yieldEstimateKg, @@unique([blockId,vintageYear])}` →
  `HarvestPick {harvestRecordId, pickDate, weightKg Decimal(12,3), brixAtPick}`. Created via
  `recordPickAction` (`src/lib/harvest/actions.ts:180`) under `requireBlockAccess`
  (vineyard-scoped). **No pick→Lot link exists** — Phase 6's crush must create it.
- **LotForm** (`prisma/schema.prisma:693`, `src/lib/ledger/vocabulary.ts:27`):
  `FRUIT/MUST/JUICE/WINE/BOTTLED_IN_PROCESS/FINISHED`. **`Lot.form` is set at creation and
  never changed today** — but VISION D4 says form is *changeable*. Phase 6 implements that.
- **SEED = the crush template** (`src/lib/bulk/actions.ts:131`): inside `runLedgerWrite`,
  `nextLotCode(tx,…)` + `tx.lot.create` + lines `[{lot, vessel, +V}, {lot, vessel:null, −V,
  reason:"seed"}]` (balanced via a null counter-account). **Crush is exactly this**: kg is op
  metadata, the measured output liters is the balanced SEED line. `assertBalanced` requires
  `sum(deltaL)=0` (`src/lib/ledger/write.ts:70`); units in the ledger are liters only, so kg
  never enters a line.
- **Press = Phase 5 split, run 1→N** (plan 020): `blendLotsCore`/`planBlend` originate child
  lots + write `LotLineage` edges; press draws one parent down into free-run + press children
  with a lees loss line (kind `SPLIT`/`TRANSFORM`). Phase 5 explicitly built the split
  primitive "general enough that Phase 6 builds press fractions on it."
- **CAP_MGMT already exists** (`src/lib/cellar/treatments.ts:24`): zero-line op + one
  `LotTreatment` per resident lot, `kind: PUMPOVER|PUNCHDOWN`, `durationMin`. **Reuse + extend
  kinds** (`COLD_SOAK`, `MACERATION`) rather than rebuild. No maceration concept yet.
- **Bulk capture UI** (`src/app/(app)/bulk/CellarActions.tsx`, `GroupActions.tsx`): per-vessel
  Actions row + filterable multi-select; `fieldStyle` h44, `inputMode="decimal"`, `aria-live`,
  "Logged · Undo" toast. **No multi-row worksheet exists** — the Round grid is net-new UI.
- **Offline: nothing exists.** `localStorage` only for field-note drafts
  (`src/app/(app)/vineyards/field-notes/manager/useDraft.ts`); no IndexedDB, no service worker,
  no PWA config, no idempotency keys. Server actions (`src/lib/actions.ts:34`) aren't idempotent;
  `withWriteRetry` covers only P2034. Phase 6 builds the offline stack from scratch.
- **Phase 4 surfaces** (plan 019): `LotMeasurement` (standalone, keyed by lotId+vesselId,
  `panelId`, provenance block, `voidedAt`) + the analyte registry (Brix, temp, malic are in it)
  + `AnalyteTrendChart`. The Round writes Brix/temp `LotMeasurement` rows; the stuck signal
  reads the Brix trend.
- **Provenance + ordering** (D14): `observedAt`/`enteredAt`/`enteredById`/`enteredByEmail`/
  `captureMethod`; monotonic `LotOperation.id` is fold order.
- **Conventions:** enum values via isolated migration (Postgres `ALTER TYPE ADD VALUE`);
  Windows/Neon hand-authored migration flow (Bash tool, `grep -v search_vector`, deploy, stop
  dev server, generate); Vitest `test/*.test.ts`; Next 16 `params` Promises; Decimal(10,2),
  `round2`, `writeAudit` in-tx.

### External Research — offline queue-and-sync (the recommended stack)

Lean-but-correct, because these are **append-only observations** (no shared mutable state →
no conflict resolution, no CRDT/OT):
- **Storage:** **Dexie.js** (IndexedDB) — one `pendingReadings` outbox table with a `status`
  field. (`idb` is the fallback if bundle is tight; same architecture.)
- **No Background Sync API** — absent on iOS Safari ("unlikely soon"), and winery tablets are
  iPads. Sync happens **foreground**: drain on app load, on the `online` event, on an interval
  while open, and a manual **"Sync now"** button.
- **Service worker:** a **minimal Serwist** SW for app-shell caching only (so the capture page
  loads with no signal). NOT `next-pwa` (webpack-only, stale; Next 16 is Turbopack). The SW is
  *not* required for the queue itself — durability comes from the IndexedDB outbox.
- **Idempotency:** a client-generated `crypto.randomUUID()` **`captureId`** per reading, stored
  in the Dexie row; server enforces `UNIQUE(captureId)` + `INSERT … ON CONFLICT DO NOTHING`.
  **Treat the duplicate (23505 / empty RETURNING) as success**, not an error.
- **Optimistic UI:** React 19 `useOptimistic` + `useTransition`; per-reading status `pending →
  syncing → synced | failed`, with the Dexie row as source of truth (survives reload). Surface
  "Saved on device" calmly (never a warning color); a header "N readings waiting to sync".
- **Two timestamps:** `observedAt` from the device at capture; `enteredAt = now()` server-side
  on insert (they can be hours apart on a bad-wifi morning).
- **Gotchas to plan around:** iOS private-mode IndexedDB can reject writes (probe at startup +
  warn); 7-day iOS ITP storage eviction (flush aggressively; call
  `navigator.storage.persist()` knowing iOS may ignore it); generate the `captureId` once at
  capture (never per-retry).

### Winemaking domain

- **Crush/press yields are measured, not computed** — extraction varies (~600–750 L/tonne
  cited). Whites: press *before* ferment (juice off skins → settle/débourbage). Reds: ferment
  *on* skins, press *after*. Forms: fruit → must → (juice) → wine.
- **Press fractions** — free-run vs press cuts (light/medium/hard) commonly kept as **separate
  lots** (roughly ~85/15 free-run/press for reds) and blended back deliberately.
- **Fermentation phases:** cold soak / pre-ferment maceration → primary (alcoholic) ferment →
  pressing → MLF → dry/aging. Primary "dry" ≈ Brix to roughly −1.5 °Bx (sugar gone, density
  ~0.992–0.996). **MLF complete** ≈ malic < ~0.1–0.3 g/L. **Stuck/sluggish** = sugar stops
  dropping while sugar remains (Brix flat over consecutive days mid-ferment).
- **Daily Round log:** Brix (or density/SG), temperature, cap management done, additions,
  taste/smell flags. A numpad grid beats voice for a 20-tank matrix (voice is for messy-hand
  single ops — Phase 10).
- **Staged additions:** yeast inoculation, rehydration nutrients, DAP in stages — the same
  ADDITION operation, tied to ferment progress (draws down supplies in Phase 8).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Crush model (council C2, user) | **CRUSH consumes harvest picks → a must lot at measured liters**: kg + yield% are op **metadata**, measured liters is a balanced SEED-style line (`+V` vessel, `−V` to a null leg **typed as origination-from-harvest, not loss**). Supports **NEW lot** OR **sequential fill (ADD)** into an existing must lot, and **partial picks** (`LotHarvestSource.consumedKg`, guard `Σ ≤ weightKg`) | One crush → one new lot, whole picks only; mutate a "fruit lot"; a kg→L factor | D8: measured, never arithmetic. Real tanks are built over days from many picks; a big pick splits across fermenters. The null leg must be excluded from shrink/loss reports (council S8). |
| Press model (council C2, user) | **PRESS = the Phase 5 split run 1→N**: draw the parent down (lock rows + `expectedRevision`), originate fractions (FR/light/hard) at **measured OR estimated** volumes, lees as a typed loss line, `LotLineage kind=SPLIT`. Fractions route to **new OR shared destination lots** (`mergeIntoLotId`). `SAIGNEE` = the same split pre-ferment (MUST→JUICE) | Force 1:1 fraction→new-lot; require gauged volume; no merge | Press cuts often merge (FR+light → Tank A, hard → barrels) and pans aren't gauged until pumped; saignée bleeds juice before ferment. Reuse Phase 5; don't rebuild. |
| Lot form | **`Lot.form` changeable (D4) but only via domain functions** (crush→MUST, press/saignée→JUICE, AF-dry→WINE); direct writes banned; a legal `form × afState × mlfState` matrix is validated | Keep form immutable; let any code set form | D4: form is a changeable property of one lot (ferment doesn't change identity). Codex S8: making it mutable safely means gating writes + auditing consumers (current vs as-of form). |
| **Fermentation model (council C1, user)** | **Three orthogonal state vectors, NOT a linear enum:** `afState {NONE ACTIVE DRY}` + `mlfState {NONE ACTIVE COMPLETE}` + physical `form`. A white = `JUICE`+AF:ACTIVE; co-inoc red = `MUST`+AF:ACTIVE+MLF:ACTIVE; extended maceration = `MUST`+AF:DRY | One linear `FermentationPhase` enum (cold-soak→primary→pressed→MLF→dry) | **Both reviewers:** real ferment isn't linear — whites press before primary, MLF co-occurs with primary, reds sit dry-on-skins. A single line can't express these; orthogonal vectors can. |
| Stuck-ferment signal (council C3, S9) | **Derived, never stored** — recompute over all non-voided Brix (winery-tz day buckets) on every insert/void so late offline backfill self-corrects; **phase + threshold aware**: fire only when `afState=ACTIVE` AND Brix > ~3 °Bx AND Δ48h < ~1 | A stored `stuck` flag; a flat-Brix-only rule | A stored flag goes stale when a late reading rewrites history (Codex C3); a naive rule screams during cold soak + near-dryness (Gemini). |
| Offline correctness (council C3/S1–S7) | Idempotency on **readings AND commands** (`captureId` per reading + `commandId` per mutation, both UNIQUE, duplicate=success); a captured reading is **immutable** (edit = new capture); a row's Brix+temp commit as **one atomic panel** (`CaptureSet`); **as-of occupancy token** so a late sync can't attach to the wrong lot; `deviceObservedAt`+`serverReceivedAt` w/ winery-tz buckets; drain classifies **retryable vs terminal** | Per-reading captureId only; current-occupancy validation; one drain class | Codex's "biggest miss": the UI is row-oriented + mutable while readings are append-only facts — without these, you get silent WRONG data, not just sync errors. |
| Sugar unit (council S12) | **Winery-level setting** (Brix / SG / Baumé / potential-alcohol); auto-display SG below 0 °Bx; leverage the Phase 4 analyte unit system | Hardcode Brix | NA=Brix, AU=Baumé, EU=potential alcohol; many switch to SG past dryness. |
| Round capture | A **multi-row worksheet** (one row per active-fermenting vessel) writing Phase 4 `LotMeasurement` rows (Brix, temp), operator/time captured once (**sticky context**), oversized auto-advancing fields, one-tap flags | Per-vessel one-at-a-time forms (Phase 3 pattern) | A 20-tank morning round needs bulk speed; the Phase 3 single-vessel form is too slow. Reuses Phase 4's record model, not a new measurement table. |
| **Offline (user)** | **Build queue-and-sync now**: Dexie outbox + `crypto.randomUUID()` `captureId` + server `UNIQUE(captureId)` `ON CONFLICT DO NOTHING` + foreground drain loop + `useOptimistic`; minimal **Serwist** app-shell SW. **No Background Sync** (iOS) | Online-only v1; full offline-first mirror; next-pwa | Cellars have no wifi (cross-cutting req says decide offline at Phase 6). Append-only observations make this *lean* — an outbox + idempotency key is the whole trick; no conflict engine. |
| Cap mgmt / maceration | **Reuse Phase 3 `CAP_MGMT`**; add `COLD_SOAK`/`MACERATION` treatment kinds. Cold soak = `MUST` + `afState:NONE` (pre-ferment); extended maceration = `MUST` + `afState:DRY` (post-ferment, still on skins) — both expressible now that the vectors are orthogonal | A new maceration subsystem; a linear COLD_SOAK phase | CAP_MGMT already models non-volumetric work; the orthogonal vectors make "dry but on skins" representable (the linear enum couldn't). |
| Crush ↔ harvest auth | Crush respects **harvest block access** (`requireBlockAccess`/`canAccessVineyard`) since it consumes vineyard-scoped picks; the resulting lot follows Phase 5's tenant-wide cellar rules | Ignore vineyard scope on crush | A pick is vineyard-scoped (a manager's fruit); crushing it shouldn't bypass that. Once it's a cellar lot, Phase 5's "cellar is shared" applies. |

## Implementation Units

### Unit 1: Operation + phase enums (isolated migration)

**Goal:** Add `CRUSH`, `PRESS` (+ `SAIGNEE`) to `OperationType` and the **orthogonal
fermentation state enums** (council C1).
**Files:** `prisma/schema.prisma`, `src/lib/ledger/vocabulary.ts`,
`prisma/migrations/<ts>_crush_press_ferment_enums/migration.sql`.
**Approach:** Add `CRUSH`, `PRESS`, `SAIGNEE` after `BLEND` in `OperationType` + the TS mirror.
**Replace the single linear `FermentationPhase` with three orthogonal state enums (council C1 —
real ferment isn't linear):** `enum AlcoholicFermState { NONE ACTIVE DRY }` (STUCK is *derived*,
not stored — council C3), `enum MalolacticState { NONE ACTIVE COMPLETE }`. The **physical form**
is the existing `LotForm` (MUST/JUICE/WINE) — no new enum. A white = `JUICE` + `AF:ACTIVE`; a
co-inoculated red = `MUST` + `AF:ACTIVE` + `MLF:ACTIVE`; extended maceration = `MUST` + `AF:DRY`.
New enums are CREATE TYPE (one migration); the `OperationType` ADD VALUEs are isolated from any
migration that *uses* them. Hand-author per the Windows/Neon flow.
**Tests:** none (enum). Build + generate clean.
**Depends on:** none. **Execution note:** the `OperationType` ADD VALUEs land before Unit 3/4
use them. **Verification:** `migrate deploy` + `generate` clean; values typecheck.

### Unit 2: Schema — ferment state, form mutability, crush linkage, offline idempotency

**Goal:** Persist fermentation phase, the pick→lot crush link, and the offline `captureId`.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_ferment_crush_offline/migration.sql`.
**Approach:**
- `Lot`: add **`afState AlcoholicFermState @default(NONE)`** + **`mlfState MalolacticState
  @default(NONE)`** (the orthogonal vectors — council C1). `form` (existing `LotForm`) becomes
  **mutable but only via domain functions** (council S8 — ban direct writes; origin/provenance/
  code stay immutable). **No stored `stuck` flag** — derived (council C3, S3). A legal
  `form × afState × mlfState` matrix is validated in Unit 5 (Codex DESIGN-Q).
- `LotHarvestSource` (new join — partial picks, council C2): `{ id, lotId, harvestPickId,
  consumedKg Decimal(12,3), createdAt }`, FKs (`Lot` cascade, `HarvestPick` restrict). **NO
  unique on `harvestPickId`** (reversing the eng-review fix — a big pick CAN be split across
  fermenters). Instead the crush tx enforces `Σ consumedKg over all lots ≤ HarvestPick.weightKg`.
  **Single source of truth (council S8):** keep only this join; **derive** "pick remaining/
  consumed" — do NOT also store `crushedLotId` on the pick.
- `LotStateEvent` (new, non-volumetric — renamed from FermentationPhaseEvent): `{ id, lotId,
  vesselId?, kind (FORM|AF|MLF), fromValue, toValue, observedAt, enteredAt, provenance,
  note?, operationId?, commandId? }`, `@@index([lotId, observedAt])`. Records each state-vector
  transition. **Ordering (Codex C):** when a transition is caused by a transform it carries the
  triggering `operationId` (shares the ledger's monotonic order); standalone changes use a
  per-lot optimistic version check so two concurrent changes can't interleave incoherently.
- **Idempotency — readings AND commands (council S1, S2, S4):**
  - Phase 4 `LotMeasurement` gets `captureId String? @unique` (per analyte-reading dedupe) +
    `panelId` to group a row's Brix+temp. **A new `CaptureSet` (panel) model** `{ id (=panelId),
    vesselId, lotId, observedAt, deviceObservedAt, serverReceivedAt, occupancyToken, … }` so a
    row's readings are **one atomic unit** (children unique `(panelId, analyte)`) — Brix and
    temp can't desync.
  - **All mutating actions** (crush/press/saignée/phase) take a client **`commandId`** with a
    UNIQUE constraint (council S4) — duplicate-as-success, so a double-tap on a flaky crush-pad
    network can't duplicate a lot.
  - **Clocks (council S6):** every captured row stores `deviceObservedAt` (tablet) +
    `serverReceivedAt` (server `now()`); day-bucketing for the stuck detector normalizes to the
    **winery timezone**, and absurd skew is flagged.
  - **Occupancy (council C3/S5):** the capture row carries an **`occupancyToken`** (the
    vessel's resident-lot version at capture); the server validates the reading against
    vessel-lot history *as of `observedAt`*, not current occupancy, so a late sync can't attach
    a reading to the wrong lot.
- Migration backfills: existing lots → `afState/mlfState = NONE` (defaults). No measurement
  backfill (`captureId` nullable).
**Tests:** none (schema). **Depends on:** Unit 1. **Execution note:** hand-authored SQL,
`prisma validate` → deploy → stop dev → generate; `captureId` unique index on nullable column.
**Patterns to follow:** `LotTreatment`/`BrixLog` provenance blocks; Phase 4 `LotMeasurement`.
**Verification:** `migrate deploy` + `generate` clean; new models typecheck.

### Unit 3: Crush core — picks → must lot (measured yield)

**Goal:** Crush picks into a must lot at measured liters — supporting NEW lot or **sequential
fill** into an existing must lot, and **partial picks** (council C2).
**Files:** `src/lib/transform/crush-core.ts` (new), `src/lib/transform/actions.ts` (new,
`"use server"`), `test/crush.test.ts`.
**Approach:** `crushLotCore(actor, { commandId, picks: [{pickId, consumedKg}], destVesselId,
outputVolumeL, target: {mode:"NEW", varietyId?, vintage, wholeClusterPct?} | {mode:"ADD",
lotId}, destemmed, mustTempC?, note })`:
- **commandId** unique (council S4) — duplicate-as-success (no double-crush on a flaky network).
- Validate each pick: caller has **block access** (`requireBlockAccess`); `consumedKg ≤
  remaining` (= `weightKg − Σ already-consumed via LotHarvestSource`); picks compatible (same
  block for NEW; any for ADD per winemaker intent).
- **NEW mode:** `nextLotCode` + `tx.lot.create({ form:"MUST", afState:"NONE", … })`.
  **ADD mode (sequential fill):** the existing must lot **absorbs** the crush (grows volume,
  keeps identity — the rack-into-occupied "grow existing" pattern); record a TRANSFORM lineage
  edge from the picks' provenance.
- `writeLotOperation({ type:"CRUSH", lines:[{lot, vessel:destVesselId, +outputVolumeL}, {lot,
  vessel:null, −outputVolumeL, reason:"crush_origination"}] })` — the null leg is **typed as
  origination-from-harvest, excluded from shrink/loss analytics** (council S8), not generic loss.
- Write `LotHarvestSource {lotId, pickId, consumedKg}` per pick; yield% (`outputVolumeL /
  ΣconsumedKg`) as op metadata; `writeAudit`. Returns `{ operationId, lotId, lotCode, yieldPct }`.
**Tests:** balanced lines + origination-typed null leg; yield% from measured output (not from
kg); **partial pick** (consume 10 of 18 t, remainder available for another tank); **sequential
fill** ADD-mode grows an existing must lot; reject over-consume (`Σ consumedKg > weightKg`);
reject a block the caller can't access; **duplicate `commandId` is a no-op success**.
**Depends on:** Units 1, 2. **Patterns to follow:** SEED (`src/lib/bulk/actions.ts:131`),
`requireBlockAccess` (`src/lib/harvest/actions.ts:71`).
**Verification:** `npm test -- crush`; a crush originates a MUST lot linked to its picks.

### Unit 4: Press core — split into free-run + press lots

**Goal:** Press a must/wine lot into measured fractions that route to NEW **or shared** child
lots, reusing the Phase 5 split (council C2).
**Files:** `src/lib/transform/press-core.ts` (new), `src/lib/transform/actions.ts`,
`test/press.test.ts`.
**Approach:** `pressLotCore(actor, { commandId, parentLotId, sourceVesselId, expectedRevision,
fractions: [{ destVesselId, volumeL, estimated?:bool, label, mergeIntoLotId? }], lossL? })`:
- **commandId** unique + **lock the parent vessel-lot rows** and assert `expectedRevision`
  matches (council S7 — press can run mid-ferment while volume is changing); assert `out =
  Σfraction + lees` within tolerance in one tx.
- Each fraction routes to a **new child lot OR merges into an existing destination lot**
  (`mergeIntoLotId` — FR + light press into Tank A, hard press to barrels; council C2). Volume
  may be **estimated** (`estimated` flag; press pans aren't gauged until pumped). Lineage
  `kind:"SPLIT"` per fraction.
- Set child `form` (whites pre-ferment: `MUST→JUICE`; reds post-ferment: `WINE`); lees/skins as
  a typed loss line. Returns `{ operationId, fractions:[{lotId, code, label, volumeL, merged}] }`.
**Note — saignée:** the `SAIGNEE` op (Unit 1) is the same split run *before* ferment — bleed
juice off a red `MUST` lot into a new `JUICE` (rosé) lot, concentrating the parent; reuses this
core with `form` MUST→JUICE on the bled fraction.
**Tests:** parent drawn down + `expectedRevision` guard; multi-cut (FR/LP/HP) to distinct lots;
**two fractions merging into one destination**; estimated-volume fraction; loss balances; single
fraction = one child; saignée splits a must lot into juice + must.
**Depends on:** Units 1, 2, and the Phase 5 split primitive. **Patterns to follow:** Phase 5
`planBlend`/`blendLotsCore` (inverse), `planLedgerRack` draw math.
**Verification:** `npm test -- press`; a red wine lot presses into free-run + press lots with
lineage.

### Unit 5: Fermentation phase machine + form transitions + stuck detector (pure)

**Goal:** Validate the **orthogonal state vectors** (form × AF × MLF), the transitions each
allows, and phase-aware stuck detection — all pure, tested before UI.
**Files:** `src/lib/ferment/state.ts` (new), `src/lib/ferment/stuck.ts` (new),
`test/ferment-state.test.ts`, `test/ferment-stuck.test.ts`.
**Approach:** `state.ts`: the **legal `form × afState × mlfState` matrix** (Codex DESIGN-Q) +
per-vector transition rules — `AF: NONE→ACTIVE→DRY`; `MLF: NONE→ACTIVE→COMPLETE` (can run
concurrently with AF — co-inoculation); `form: MUST→JUICE` (white press / saignée), `MUST/JUICE
→WINE` (the AF=ACTIVE→DRY transition flips form to WINE). Expose `planStateTransition(lot,
{kind, to})` → the resulting state + a `LotStateEvent` shape, rejecting illegal combos (e.g.
`form=WINE` + `afState=NONE`). Helpers: `mlfComplete(malic)` (< ~0.1–0.3 g/L), `isDry(brix)`
(≤ ~−1.5 °Bx). `stuck.ts`: **`detectStuck(brixReadings, {afState})` — phase + threshold aware
(council S9):** flag only when `afState=ACTIVE` AND latest Brix > ~3 °Bx AND Δ over ~48h < ~1
°Bx; ignore cold soak (AF=NONE) and near-dryness. **Derived, never stored** (council C3): order
readings by `observedAt` (winery-tz day buckets), exclude voided, recompute on every
insert/void so a late offline backfill self-corrects.
**Tests:** legal vs illegal state combos (white = JUICE+AF:ACTIVE; co-inoc red = MUST+AF:ACTIVE
+MLF:ACTIVE; extended maceration = MUST+AF:DRY); form flips to WINE on AF→DRY; `mlfComplete`/
`isDry` thresholds; stuck fires on a flat ACTIVE run >3°Bx, **ignores cold soak and the
near-dryness crawl**; a late-synced (out-of-order) reading recomputes stuck correctly; voided
reading excluded.
**Depends on:** Unit 2 (types). **Execution note:** test-first.
**Patterns to follow:** `src/lib/ledger/vocabulary.ts` (controlled sets), Phase 4 analyte
helpers. **Verification:** `npm test -- ferment`.

### Unit 6: Offline foundation — Dexie outbox + idempotent server + sync engine

**Goal:** The durable capture queue, the idempotent write, and the foreground sync loop.
**Files:** `src/lib/offline/db.ts` (Dexie), `src/lib/offline/queue.ts` (capture + drain),
`src/lib/offline/useSync.ts` (React hook), `src/lib/ferment/round-actions.ts` (idempotent
server action), `test/offline-queue.test.ts`.
**Approach:** Per the offline research + the council C3/S-fixes. `db.ts`: Dexie `cellar` DB —
a **`pendingPanels`** table (the atomic unit, council S2) `{ panelId (PK, UUID), vesselId,
lotId, occupancyToken, deviceObservedAt, status, attempts, lastError, createdAt }` + a
`pendingReadings` table `{ captureId (PK, UUID), panelId, analyte, value, unit }`, children of
a panel. `queue.ts`: `capturePanel(row)` → mint `panelId` + per-analyte `captureId`s + local
write `status:"pending"` (never network-gated); **a captured reading is immutable once
enqueued — an edit creates a NEW capture, never reuses a `captureId` (council S1)**; `drain()`
submits **whole panels atomically**, `pending→syncing→synced/failed`, and **classifies errors
retryable vs terminal** (council S7) — a terminal row moves aside so it can't head-of-line block
the queue. `round-actions.ts`: `submitPanelAction({panelId, occupancyToken, deviceObservedAt,
readings[], commandId})` → in one tx, validate vessel occupancy **as of `observedAt`** (council
S5 — reject/soft-fail if the token is stale, never attach to the wrong lot), stamp
`serverReceivedAt = now()`, insert the `CaptureSet` + its `LotMeasurement` rows via `ON CONFLICT
(captureId) DO NOTHING`, **duplicate = success**. `useSync.ts`: drain on mount / `online` /
interval-while-open / manual "Sync now"; expose pending count + per-panel status. **A
terminal/rejected panel (stale occupancy, deleted vessel) is NOT discarded — it stays in a
"needs attention" tray (design-review decision)** with its reason, for the worker to re-point
to the correct lot or discard. Never silent, never force-attached to the wrong lot.
**Tests (pure):** capturePanel writes a pending panel + N readings with distinct UUIDs; drain
transitions states; a failed send returns to pending + increments attempts; **duplicate panel/
captureId is a no-op success**; **an edit mints a new captureId (old one untouched)**; a
terminal error doesn't block later panels; a panel syncs all-or-nothing (Brix+temp never
desync). (DB-layer verified in Unit 12.)
**Depends on:** Unit 2 (`captureId`), Phase 4 `LotMeasurement`. **Patterns to follow:** the
offline-research recommended stack; `src/lib/actions.ts` action wrapper.
**Verification:** `npm test -- offline-queue`; a capture survives a reload (manual).

### Unit 7: Serwist PWA — app-shell offline + storage probe

**Goal:** Make the capture page load with no signal, and detect hostile storage early.
**Files:** Serwist SW entry (`src/app/sw.ts` or per Serwist/Next 16 docs), manifest
(`public/manifest.json` or app metadata), `next.config` wiring, a startup
`src/lib/offline/storage-probe.ts`.
**Approach:** Add **Serwist** (`@serwist/next`) for **app-shell/static caching only** + an
offline route fallback so `/ferment/round` loads offline. NOT next-pwa. `storage-probe.ts`:
at startup, probe an IndexedDB write; if it fails (iOS private mode) warn loudly + fall back to
in-memory with a "don't close this tab" banner; call `navigator.storage.persist()` (best-effort).
Read `node_modules/next/dist/docs/` for the Next 16 PWA/SW wiring before touching config
(AGENTS.md). Dev SW testing may need the `--webpack` flag (note in the unit).
**Tests:** none new (integration/manual — load the route offline). **Depends on:** Unit 6.
**Patterns to follow:** Serwist `@serwist/next` getting-started; Next 16 PWA guide.
**Verification:** DevTools offline → the Round route still loads; private-mode probe warns.

### Unit 8: The Fermentation Round grid (offline-wired)

**Goal:** The fast multi-row worksheet — the adoption-critical surface.
**Files:** `src/app/(app)/ferment/round/page.tsx` + `RoundClient.tsx` (new), nav entry in
`src/components/AppShell.tsx`.
**Approach:** Server loads the **active-fermenting vessels** (resident lots with
`afState=ACTIVE` or `mlfState=ACTIVE`) in **route order** — **read from `vessel_lot` (the
authoritative ledger projection), NOT `vessel_component`** (the component projection skips
blend lots with null origin, so a fermenting blend would be invisible — known gotcha). Header captures **operator + time
once** (sticky context). One row per vessel: vessel code · **previous Brix in grey beside the
input** (council S10 — rate-of-change is the point) · **oversized Brix field**
(`inputMode="decimal"`, ≥60px, **auto-advance on Enter**) · temp field · one-tap flags
(stuck/hot/foam/**H2S-off-odor**/sample-sent) · optional cap-mgmt toggle (reuse `CAP_MGMT`).
**Append-per-round, never overwrite (council S10)** — the screen is "this round"; a tank read
2–3×/day just adds readings. A whole row commits as one **panel** (`capturePanel`, Unit 6) →
optimistic "Saved on device" → background drain. **Fat-finger guards (offline-local, council
S11):** hard bounds (Brix −5..45, temp 0–45 °C reject), soft modal if Brix **rose** since the
previous reading. Header **pending-count + "Sync now"**; per-row status with a green "synced"
check (council S14); calm colors. **Sugar unit follows the winery setting** (Brix/SG/Baumé;
auto-show SG below 0 °Bx — council S12). ≥44px, `aria-live`.
**Design specs (plan-design-review):** sticky top bar (operator/time/pending-count/Sync-now);
rows stack on tablet. **Interaction states:** warm **empty** ("No active ferments — start one
when a tank kicks off", not "no items"); loading; sync states calm-colored; a **"needs
attention" tray** for rejected captures (Unit 6 — re-point or discard, never silent). Three
**state chips** (AF / MLF / form) per row, not a mashed string.
**Tests:** none new (UI); capture/drain logic is Unit 6. Covered by Unit 12 + manual.
**Depends on:** Units 5, 6, 7. **Patterns to follow:** `GroupActions.tsx` (vessel list/filter),
`CellarActions.tsx` field patterns + toast; Phase 4 measurement write.
**Verification:** offline, punch Brix for 5 tanks → all show "saved on device" → reconnect →
all sync; reload mid-round → pending entries persist.

### Unit 9: Crush & press capture UI

**Goal:** Vessel-first surfaces to crush picks into a must lot and to press a lot into fractions.
**Files:** `src/app/(app)/ferment/crush/` (or a crush action on the harvest/bulk surface) +
`src/app/(app)/bulk/CellarActions.tsx` (add a "Press" action), wiring to Unit 3/4 actions.
**Approach:** **Crush:** pick block/vintage → multi-select picks with a **per-pick consumed-kg
field** (default = full remaining; partial allowed) → destination vessel → **NEW lot OR add to
an existing must lot in that vessel** (sequential fill) → **measured output liters** (yield
computes live, not entered) → **% whole-cluster, must temp, crush-notes** + optional crush
additions (SO₂/enzyme/acid as Phase 3 ADDITION ops; draw-down Phase 8) → create. **Press:** from
a vessel's Actions row, "Press" opens a fractions form — N rows of {destination (new OR existing
lot), volume, **estimated?** toggle, label FR/light/hard} with a running total + derived loss;
submit → Unit 4. Offline-capable (crush-pad) via the Unit 6 `commandId` path. Reuse `fieldStyle`
h44, `aria-live`, "Logged · Undo" toast. **Design (plan-design-review):** single page + sticky
summary (running total/mode/Execute) per the Phase 5 precedent; a **mode banner** (crush: "New
lot 2024-…" vs "Adding to <code>"; press fraction: "New lot" vs "Merge into <vessel>"); on
success **navigate to the new/destination lot's detail**, not back to an empty form.
**Tests:** none new (UI). **Depends on:** Units 3, 4. **Patterns to follow:** `RackForm`, the
Phase 5 blend builder (fractions = inverse of sources), `GroupActions` multi-select.
**Verification:** crush picks (incl. a partial) → a MUST lot at measured L; a second crush ADDs
into it; press it → fractions to new + shared lots.

### Unit 10: State (AF/MLF/form), stuck signal & ferment curve surfacing

**Goal:** Show + advance the three state vectors, derive the stuck signal, render the curve.
**Files:** `src/lib/ferment/actions.ts` (state-transition server actions, `commandId`-guarded),
`src/app/(app)/lots/[id]/LotDetailClient.tsx` (state badges + ferment curve), the Round grid
(stuck/state chips), `test/ferment-actions.test.ts` (pure parts).
**Approach:** `transitionStateAction({lotId, kind:FORM|AF|MLF, to, commandId})` validates against
the Unit 5 matrix, writes a `LotStateEvent`, updates the relevant `Lot.{afState|mlfState|form}`,
in a tx with `writeAudit` (and an optimistic per-lot version check so concurrent transitions
can't interleave incoherently — Codex). **Stuck is DERIVED** (no stored flag): a
`stuckForLot(lotId)` read recomputes via the Unit 5 detector over all non-voided Brix; the Round
+ lot surface it live. Lot detail: **three badges** (AF / MLF / form), the Phase 4 Brix/temp
trend as the **ferment curve**, MLF shown via malic readings + `mlfState`, a stuck warning when
the derived signal fires.
**Tests:** a transition updates the right vector + respects the matrix (rejects illegal combo);
derived stuck is correct after an out-of-order reading; concurrent-transition version guard.
**Depends on:** Units 5, 8, Phase 4 trend chart. **Patterns to follow:** Phase 4
`AnalyteTrendChart`; lot-detail rendering.
**Verification:** a lot shows AF/MLF/form + ferment curve; a flat ACTIVE ferment raises stuck.

### Unit 11: Cold soak / maceration capture

**Goal:** Capture cold-soak / extended-maceration as phase + non-volumetric work.
**Files:** `src/lib/cellar/treatments.ts` (extend `kind` set), `src/app/(app)/bulk/CellarActions.tsx`
(maceration toggle), `src/lib/ferment/phases.ts` (COLD_SOAK phase wiring).
**Approach:** Add `COLD_SOAK`/`MACERATION` to the `CAP_MGMT` treatment `kind`s (validated
string, no enum migration — Phase 3 precedent), one-tap with optional duration/temp via the
existing CAP_MGMT write path. **No linear phase** — cold soak is just `form=MUST` + `afState=
NONE`; extended maceration is `form=MUST` + `afState=DRY` (the orthogonal vectors make both
representable, which the old linear enum couldn't).
**Tests:** treatment kind validation; cold soak captured while afState=NONE; maceration while
afState=DRY. **Depends on:** Units 5, Phase 3 `CAP_MGMT`. **Patterns to follow:**
`src/lib/cellar/treatments.ts:24`.
**Verification:** log a cold soak on a must lot → on the timeline; works pre- and post-ferment.

### Unit 12: Verify script + exit-criteria proof

**Goal:** Prove the Phase 6 exit criteria end-to-end deterministically.
**Files:** `scripts/verify-ferment.ts` (new, `tsx --env-file=.env`).
**Approach:** Seed harvest picks → **crush** (incl. a **partial pick** + a **second crush ADDing
into the same must lot**) → assert a MUST lot at measured volume, `LotHarvestSource.consumedKg`
sums correct, over-consume rejected, yield% derived, origination-leg excluded from loss,
projection==fold. Set `afState=ACTIVE` → submit daily Brix **panels** via the idempotent
action; **re-submit the same `commandId`/`captureId` → assert NO duplicate**; submit an
**out-of-order (late) reading** → assert derived **stuck** recomputes correctly; a flat ACTIVE
run >3 °Bx flips stuck, a drop clears it; AF→DRY flips `form=WINE`. **Press** the wine →
fractions to a new lot AND a **merged** existing lot, estimated volume allowed, lineage SPLIT +
loss balances, `expectedRevision` guard. Assert a **saignée** (MUST→JUICE), a cold-soak treatment
at afState=NONE, `mlfState` ACTIVE→COMPLETE via malic threshold, and a **stale-occupancy reading
rejected**. Print PASS/FAIL per check.
**Tests:** the script IS the integration test. **Depends on:** Units 1–11.
**Patterns to follow:** `scripts/verify-cellar-ops.ts`, `verify-projection.ts`.
**Verification:** `npx tsx --env-file=.env scripts/verify-ferment.ts` → all PASS.

## Test Strategy

**Unit (Vitest, pure):** crush balance + yield-from-measured + **partial-pick consumed-kg guard
+ sequential-fill ADD**; press split + loss balance + lineage + merge-destination +
`expectedRevision`; state matrix (legal `form×afState×mlfState`) + transitions; stuck detector
(**phase+threshold aware: AF=ACTIVE, Brix>3, Δ48h<1; ignores cold soak + near-dryness**, self-
corrects on out-of-order readings);
offline capture/drain/dedupe + **atomic panel (Brix+temp all-or-nothing)** + **edit-mints-new-
captureId** + **commandId idempotency on transforms** + **as-of occupancy reject**.
**Integration:** `scripts/verify-ferment.ts` (crush→ferment→stuck→dry→press, offline idempotency,
projection parity).
**Manual:** the Round grid OFFLINE on a tablet profile (DevTools offline) — punch 5+ tanks,
reconnect, confirm sync, reload mid-round; crush from picks; press into fractions; lot-detail
ferment curve + phase + stuck.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Offline silent WRONG data (Codex's "biggest miss") | MED | HIGH | Readings are immutable (edit=new capture); a row commits as one atomic `CaptureSet` (Brix+temp never desync); `commandId` UNIQUE on transforms; **as-of occupancy token** so a late sync can't attach to the wrong lot. Append-only → no merge engine. |
| Offline sync loses or duplicates a reading | MED | HIGH | Dexie outbox (durable across reload) + `captureId`/`commandId` UNIQUE + `ON CONFLICT DO NOTHING`; duplicate=success; per-panel status + pending count. |
| iOS Safari realities (no Background Sync, private-mode IndexedDB, 7-day eviction) | MED | MED | Foreground drain only (+ "Sync now"); startup storage probe + loud warning; flush aggressively; `navigator.storage.persist()` best-effort. |
| Crush balance / kg↔L confusion | MED | HIGH | kg never enters a ledger line — op metadata; measured liters is the only balanced line; the null leg typed as origination (excluded from loss reports); yield% derived, tested. |
| `Lot.form` mutable weakens the "metadata immutable" invariant | MED | MED | Only `form`/`afState`/`mlfState` mutable, via domain functions + recorded `LotStateEvent`s + a legal `form×afState×mlfState` matrix; origin/provenance/code stay immutable; direct writes banned. |
| Stuck flag stale under offline backfill | MED | MED | Stuck is **derived** (recompute over all non-voided Brix in winery-tz buckets on every insert/void), never stored; phase+threshold aware. |
| Press double-counts / mis-splits mid-ferment | LOW | MED | Lock parent rows + `expectedRevision` guard + balance assert in-tx; reuse Phase 5 draw; loss = out − Σchildren; tests. |
| Round grid too slow for a 20-tank morning | MED | HIGH | Oversized auto-advancing fields, operator/time once (sticky), one-tap flags, optimistic local save; the adoption bar drives the UX (design review owns it). |
| New `OperationType` enum-add gotcha | MED | MED | CRUSH/PRESS added in the isolated Unit 1 migration before any use. |
| Depends on Phase 4 + Phase 5 both landed | HIGH | HIGH | Phase 6 reuses Phase 4 `LotMeasurement` + Phase 5 split primitive; confirm both are on main before Unit 3+. Gate at the top of /work. |

## Success Criteria (Phase 6 exit)

- [x] Crush harvest picks → a MUST lot at **measured** volume, linked to its picks (partial +
      sequential-fill ADD supported); over-consume rejected; yield% recorded.
- [x] Ferment it: daily Brix/temp via the Round grid feed a curve; `afState` ACTIVE→DRY flips
      `form=WINE`; a flat ACTIVE run (>3 °Bx) raises **stuck**, near-dryness/cold-soak don't.
- [x] Press splits free-run vs press into **distinct OR merged** child lots with lineage +
      derived loss; saignée bleeds MUST→JUICE.
- [x] The three state vectors (form / AF / MLF) express white (press-before-ferment) and
      co-inoculated red (MLF during primary); MLF tracked via malic; cold soak/maceration captured.
- [x] The **Round grid works fully offline** — capture with no signal, persist across reload,
      sync on reconnect, **no duplicates and no wrong-lot attachment** (idempotent + occupancy-checked).
      (Offline CAPTURE durability via the Dexie outbox; Serwist app-shell SW deferred — Turbopack, user-approved.)
- [x] All Vitest tests pass (545); `scripts/verify-ferment.ts` all PASS (31/31); `npm run build` clean; no
      regressions.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (crush balance, offline sync, form mutability) | 1 | ✅ done | 2 fixes folded: pick double-crush (`@@unique([harvestPickId])`), `captureId` per-analyte not per-grid-row; strong reuse (crush=SEED, press=Phase 5 split, CAP_MGMT extended); Phase 4+5 dependency gated |
| Council | `/council` | Cross-LLM adversarial (types/schema + domain/UX) | 1 | ✅ done | Codex: 6 CRITICAL offline/state traps (editable-reading idempotency, Brix/temp desync, stale stuck flag, non-idempotent transforms, stale occupancy, phase-event ordering) ; Gemini: 3 CRITICAL domain (linear phase enum, crush sequential-fill/saignée, press merge) — all folded |
| Design Review | `/plan-design-review` | The Round grid + crush/press + ferment UI | 1 | ✅ done | 7/10 → 9/10; folded: interaction-states table, **needs-attention tray for rejected captures**, empty/loading states, single-page+sticky crush/press + mode banner, 3 state chips, sticky tablet bar, post-crush navigation (text-only — design binary absent) |

**Design-review decision (user):** a rejected/stale-occupancy capture goes to a **"needs
attention" tray** (re-point or discard) — never silently dropped, never force-attached to the
wrong lot.

**Council decisions (user):** (1) **three orthogonal state vectors** (AF / MLF / form), not a
linear phase enum; (2) **flexible crush/press** — sequential fill into an existing must lot,
partial picks, press fractions to new-or-merged destinations, saignée; (3) **append-per-round**
Round grid with previous-Brix + fat-finger guards. Folded engineering fixes: immutable captures
(edit=new), atomic `CaptureSet` panel, derived (never stored) stuck, `commandId` on all
mutations, as-of occupancy token, device+server clocks/winery-tz, retryable-vs-terminal drain,
parent-lock + `expectedRevision` on press, single-source-of-truth crush consumption, banned
direct form writes, winery sugar-unit setting, %whole-cluster/must-temp/crush-notes/H2S flag.

**VERDICT:** ENG + COUNCIL + DESIGN CLEARED. All three reviews complete; every CRITICAL +
SHOULD-FIX folded; the model reshaped (orthogonal ferment vectors, flexible crush/press) and
the offline-correctness cluster + needs-attention recovery in place. Ready for `/work`.
**Phase 4 + Phase 5 must be on main first** (Phase 6 reuses Phase 4 `LotMeasurement` + Phase 5
split primitive) — gated at the top of /work.

---

## 🔌 RESUMPTION LOG — paused 2026-06-30 (Units 1–9 shipped on main)

**Where we are:** Units **1–9 are built, tested, and committed straight to main** (one
commit per unit). `npm run build` is clean, `npx tsc --noEmit` is 0 errors, lint clean on all
new files, and **all 535 Vitest tests pass**. Both DB migrations are deployed to Neon.
**Pick up at Unit 10.** Remaining: **Unit 10 (state/stuck/curve surfacing), Unit 11 (cold
soak/maceration), Unit 12 (verify-ferment.ts integration proof).**

### Commits landed (main)
1. Unit 1 — `CRUSH/PRESS/SAIGNEE` optypes + `AlcoholicFermState`/`MalolacticState` enums (migration `20260630000000_crush_press_ferment_enums`).
2. Unit 2 — `Lot.afState/mlfState`, `LotHarvestSource`, `LotStateEvent`, offline idempotency cols (migration `20260630000100_ferment_crush_offline`).
3. Unit 3 — crush core (`planCrush` pure + `crushLotCore` + `crushAction`); `test/crush.test.ts`.
4. Unit 4 — press core (`planPress` pure + `pressLotCore` + `pressAction`); `test/press.test.ts`.
5. Unit 5 — ferment state machine + stuck detector (pure); `test/ferment-state.test.ts`, `test/ferment-stuck.test.ts`.
6. Unit 6 — offline foundation: `src/lib/offline/{queue,db,useSync,storage-probe}.ts` + `src/lib/ferment/round-actions.ts`; `test/offline-queue.test.ts` (11).
7. Unit 8 — offline Round grid (`src/app/(app)/ferment/round/*`) + `src/lib/ferment/{round-data,sugar}.ts`; `test/ferment-sugar.test.ts`.
8. Unit 9 — crush & press UI (`src/app/(app)/ferment/{crush,press}/*` + `{crush,press}-data.ts`); nav entries added.
   (Unit 7 = the safe pieces only: `app/manifest.ts` + `storage-probe.ts`. Serwist SW deferred — see decisions.)

### Decisions made DURING the build — honor these, do NOT relitigate
- **"Phase 4 `LotMeasurement`" does not exist by that name.** Phase 4 shipped `AnalysisPanel`
  (panel: `clientRequestId @unique`, `lotId/vesselId/observedAt/voidedAt`) + `AnalysisReading`
  (per-analyte, already had `panelId`). **User-approved:** we REUSE `AnalysisPanel` as the offline
  "CaptureSet" (added `deviceObservedAt`/`serverReceivedAt`/`occupancyToken`) and added
  `captureId @unique` + `@@unique([panelId,analyte])` to `AnalysisReading`. REQUIRED so Round
  Brix/temp feed the SAME Phase 4 trend curve + stuck detector. Do NOT build a separate CaptureSet.
- **Serwist SW DEFERRED (user-approved).** Next 16 = Turbopack; Serwist "requires webpack" and
  would risk `npm run build`. Durability = the Dexie outbox (done + tested). `manifest.ts` +
  `storage-probe.ts` ship the app-shell pieces. Do NOT add `@serwist/next` unless the user revisits.
- **State matrix deviation (justified):** `isLegalState` keeps `WINE + af:NONE` **legal** because
  legacy/seeded wine lots default to `af:NONE` (real data — the Unit 2 backfill). The plan's
  parenthetical "illegal: form=WINE+af:NONE" is enforced on the **transition** instead (`FORM→WINE`
  requires `af:DRY`). See `src/lib/ferment/state.ts` + `test/ferment-state.test.ts`.
- **Idempotency mechanics:** `commandId` UNIQUE on `LotOperation` (crush/press/saignée) AND on
  `LotStateEvent` (phase). Cores pre-check by commandId → run → on P2002 re-query →
  duplicate-as-success. Offline panel uses `AnalysisPanel.clientRequestId = commandId` +
  `AnalysisReading.captureId`, both UNIQUE, `ON CONFLICT skip`, P2002 = success.
- **`crush_origination` LineReason** added — the crush −V counter-leg (kg→L birth, D8), EXCLUDED
  from loss reports (`lot/timeline.ts:178` sums `reason === "loss"` only).
- **Press is a dedicated `/ferment/press` page**, not threaded into the large `CellarActions.tsx`.
  `expectedRevision` = `VesselLot.updatedAt` ISO (optimistic concurrency, council S7).
- **All tests are PURE** (`test/*.test.ts`, no DB). DB cores (`crushLotCore`/`pressLotCore`/
  `submitPanelAction`/state transitions) are proven by **Unit 12's `scripts/verify-ferment.ts`**.

### What is LEFT — start here
**Unit 10 — state/stuck/curve surfacing.** Files: `src/lib/ferment/actions.ts` (new),
`src/app/(app)/lots/[id]/LotDetailClient.tsx` (edit), `test/ferment-actions.test.ts`.
- `transitionStateAction({lotId, kind:FORM|AF|MLF, to, commandId})`: validate via
  `planStateTransition` (Unit 5), write a `LotStateEvent`, update `Lot.{afState|mlfState|form}` in
  a tx with `writeAudit` + a per-lot optimistic version check; `commandId` UNIQUE on `LotStateEvent`
  = duplicate-as-success. AF→DRY auto-flips JUICE→WINE → persist the form too.
- `stuckForLot(lotId)`: read non-voided BRIX (`AnalysisReading` where analyte=BRIX, panel not
  voided) → `detectStuck` (Unit 5). DERIVED, recompute each call.
- Lot detail: 3 badges (AF/MLF/form), Phase 4 `AnalyteTrendChart` as the ferment curve, MLF via
  malic + `mlfState`, stuck warning when derived signal fires. Round already shows AF/MLF/form
  chips; surface stuck there too.
- Pure glue → `test/ferment-actions.test.ts` (matrix already covered in Unit 5).

**Unit 11 — cold soak / maceration.** Extend Phase 3 `CAP_MGMT` treatment `kind` set with
`COLD_SOAK` + `MACERATION` (validated string in `src/lib/cellar/treatments.ts` — NO migration,
Phase 3 precedent), a maceration toggle in `CellarActions.tsx`, `src/lib/ferment/phases.ts` wiring.
NO linear phase: cold soak = `MUST + af:NONE`; extended maceration = `MUST + af:DRY`. Test:
treatment-kind validation. Reuse `src/lib/cellar/treatments.ts:24`.

**Unit 12 — `scripts/verify-ferment.ts`** (`npx tsx --env-file=.env scripts/verify-ferment.ts`).
THE integration proof. Pattern off `scripts/verify-cellar-ops.ts` / `verify-projection.ts`. Cover
every exit criterion: seed picks → crush (incl. PARTIAL pick + a SECOND crush ADDing into the same
must lot) → assert MUST lot at measured L, `LotHarvestSource` sums, over-consume rejected, yield
derived, origination leg excluded from loss, projection==fold. Set `af:ACTIVE` → submit daily Brix
panels via `submitPanelAction`; re-submit same commandId/captureId → assert NO duplicate; submit an
out-of-order late reading → assert derived stuck recomputes; flat ACTIVE >3°Bx flips stuck, a drop
clears it; AF→DRY flips `form=WINE`. Press → fractions to a new AND a merged lot, estimated volume,
SPLIT lineage + loss balances, `expectedRevision` guard. Assert saignée (MUST→JUICE), a cold-soak
treatment at af:NONE, `mlfState` ACTIVE→COMPLETE via malic threshold, and a stale-occupancy reading
rejected. Print PASS/FAIL per check. Then flip this plan `status: draft → completed` + check the
Success Criteria boxes.

### Environment reminders (Windows/Neon) — see memory `prisma-neon-migrations-windows`
- Hand-authored migrations: get URL from `DATABASE_URL_UNPOOLED`, `prisma migrate diff
  --from-url ... --to-schema-datamodel ./prisma/schema.prisma --script | grep -v search_vector`,
  then `prisma validate` → `migrate deploy` → STOP the dev server → `prisma generate`.
- `tsx` scripts need `--env-file=.env`. Tests: `npx vitest run` (all pure, under `test/*.test.ts`).
- Supervision gates (Units 1, 2, 6/7) are CLEARED. Units 10–12 proceed straight through with tests
  + commits; stop only if a unit cannot pass.

---

## 🔧 POST-PLAN UX EVOLUTION (user feedback after the 12 units shipped)

The 12 units landed as planned, then the surfaces were reshaped by live user feedback. The
domain model + ledger (Units 1–5, the cores, idempotency, lineage, stuck detector) are
UNCHANGED — only the capture/monitoring UX moved. Current truth:

- **Fermentation monitoring is VESSEL-FIRST, not a standalone round grid.** The `/ferment/round`
  page + nav entry were **removed**. Every vessel card on `/bulk` has a **"Fermentation"** modal
  (`src/components/ferment/FermentMonitor.tsx`): log sugar (Brix/Baumé), pH, temp over time with a
  **multi-row backfill** editor (each row its own date/time — "enter the last 48h from the
  logbook"); a **dual-Y chart** (`FermentChart`: Brix left axis / Temp right axis, labeled, + pH
  companion strip); **edit/remove** a reading (immutable → void + re-log, council S1); **advance
  AF/MLF** state (Start ferment / Mark dry / Start MLF / MLF complete); and **log additions**.
  Captures still route through the offline outbox (`useSync`) with optimistic chart points.

- **Crush + Press are ONE module — `/ferment/process` ("De-stem & press").** A tab toggle picks
  De-stem | Press (they're the same primitive; the consumed-kg ledger enforces press-then-can't-
  destem vs destem-then-press). **"Crush" renamed → "De-stem"** everywhere (timeline reads
  "De-stemmed fruit → X L must"). De-stem captures a **crusher-rollers On/Off** toggle + **"% of
  lot crushed"** (default 100; for crush-part / whole-berry-rest) → `crusherOn`/`crushedPct` op
  metadata. The separate `/ferment/crush` + `/ferment/press` routes were deleted (the
  CrushClient/PressClient files remain, imported by `ProcessClient`).

- **Whole-cluster press: fruit → JUICE, skipping crush.** New press source "Whole-cluster fruit"
  presses harvest picks straight to a JUICE lot (op PRESS via `crushLotCore`
  `outputForm:JUICE`/`opType:PRESS`), splittable across **multiple destination vessels** (one juice
  lot, N tanks — `planCrushSplit`). Press now only lists **MUST** lots for the must-lot path (it was
  wrongly listing finished WINE).

- **Additions surfaced on de-stem, press, AND the monitor**, reusing the Phase 3 ADDITION/FINING op
  (`StagedAdditions` on the transforms chains onto the new lot; a live form in the monitor). Added
  material kinds **YEAST** + **MLF** (Oenococcus oeni). **Stock draw-down + cost remains Phase 8** —
  these records are Phase-8-ready.

All green at hand-off: `npm run build` clean, 547 Vitest tests, `scripts/verify-ferment.ts` 36/36,
tsc + lint clean. Pushed to origin/main.
