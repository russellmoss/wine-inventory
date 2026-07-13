---
title: Fan-out a single vessel reading to all co-resident lots (multi-lot "one must" tank)
type: feat
status: draft
date: 2026-07-12
branch: feat/multi-lot-vessel-reading-fanout
depth: standard
units: 6
---

## Overview

When a winemaker logs one Brix/pH/temp reading on a tank that holds more than one lot (a
co-ferment the crew treats as one must), the system fans the reading out: one `AnalysisPanel`
per co-resident lot, all tagged with a shared new nullable column `analysis_panel.vesselReadingGroupId`.
No forced lot pick, no lost per-lot tracking. Vessel-scoped views dedup by that group id so the
operator sees ONE row per physical reading, while each lot keeps a continuous per-lot curve.

This is the follow-up plan 058 explicitly escalated to a `/decision` and never built. The decision
is now recorded (context-ledger `vessel-reading-fanout-20260712-a1f3`); this plan builds it.

## Problem Frame

Reported TWICE on Demo Winery tank T4 (feedback `cmri7xdxf` → `cmricenxo`), holding two Pinot lots
(`2024-RRR-1-PN` ~5,800 L + `2024-PN` ~2,300 L) the crew ferments as one must. Three prior attempts
all bounced off the same wall:
1. PR #147 fixed Brix block-vs-lot routing but *explicitly deferred* the multi-lot single reading.
2. Plan 058 / PR #153 shipped a frictionless lot **picker** — but it still forces a per-lot pick,
   which is exactly what the user objected to, and (council's finding) fragments the ferment curve
   (Lot A Monday / Lot B Tuesday leaves neither lot a continuous curve; always-pick-A leaves the
   2,300 L lot with zero chemistry).
3. A running auto-fix concluded "not a code bug — user should blend" and was about to dismiss it.

Every attempt stayed inside the no-schema auto-fix fence. The user's actual need — "log one Brix on
the combined wine" — is structurally impossible under VISION D2 (one measurement = one homogeneous
lot) without a data-model change. **Cost of doing nothing:** the exact mid-ferment reading the
winemaker wants to capture cannot be recorded on ANY multi-lot tank. A real daily-use gap for every
co-fermented or sequentially-filled tank, not just T4.

## Requirements

- MUST: On a multi-lot vessel, a single reading records ONE `AnalysisPanel` **per co-resident lot**,
  all sharing one freshly-minted `vesselReadingGroupId`. The user is NOT forced to pick a lot.
- MUST: Preserve VISION D2 — every panel still attaches to exactly ONE lot. NO join table, NO
  multi-lot panel, NO change to `AnalysisReading`. The only schema change is one nullable column
  (+ index) on `analysis_panel`.
- MUST: Fan-out is atomic — all N panels write in ONE `runInTenantTx`, or none do.
- MUST: Idempotent. A double-submit (or offline re-sync) of the same fan-out writes each lot's panel
  at most once. `clientRequestId` (`@unique`) and `AnalysisReading.captureId` (`@unique`) must be
  expanded to N *distinct, deterministic* keys per submit so a retry is still a no-op.
- MUST: Vessel-scoped views (vessel History, `/bulk` fermentation trends) dedup by
  `vesselReadingGroupId` → ONE row per physical reading.
- MUST: Lot-scoped views (each lot's own chemistry/curve, `loadFermentSeries`) are UNCHANGED — they
  show that lot's panel. That is the whole point: each lot keeps its curve.
- MUST: Single-lot capture and sample-result attach paths behave EXACTLY as today (no regression in
  `verify:chemistry`). Fan-out is a distinct path; `recordMeasurementsCore` single-lot semantics and
  `resolveVesselLot` stay byte-for-byte for their existing callers.
- MUST: Fan-out is the DEFAULT on a multi-lot vessel; the plan-058 picker is RETAINED as the explicit
  "…or just one lot" alternative. **[Eng review] Fan-out applies to `record_measurement` ONLY in v1**
  (Brix/pH/temp/bench). The 5 sibling vessel tools keep the picker unchanged — a `Sample`/cost/state
  transition is one row with one lotId and does not map to fan-out.
- MUST: **[Eng review] Fan-out NEVER engages on the sample-RESULT path** (`sampleId` set) — a returned
  lab result inherits the sample's captured lot (`resolve-lot.ts:7`). Only capture-time bench readings
  on a multi-lot vessel fan out.
- MUST: **[Eng review] Void/edit is group-atomic.** Removing or editing a fanned reading voids EVERY
  lot's copy sharing the `vesselReadingGroupId` in one tx, so the tank view and both per-lot curves
  stay consistent. (`voidPanelCore` voids by group when the id is non-null.)
- MUST: **[Eng review] The confirm card names every target lot** ("record 10.5 °Bx on BOTH: 2024-PN +
  2024-RRR-1-PN") so a wrong default (two different wines parked in one tank, not a co-ferment) is
  caught before the write.
- MUST: **[Eng review] `verify:chemistry` gains a standing fan-out case** (not just a one-off read-back):
  one reading on a 2-lot vessel → 2 grouped single-lot panels, deduped in the vessel view, present on
  each lot's curve; a group void drops all copies.
- SHOULD: The offline Dexie outbox capture path (`FermentMonitor`) fans out correctly with derived
  `captureId`s and a validated `occupancyToken` covering all resident lots.

## Scope Boundaries

**In scope:**
- Schema: `analysis_panel.vesselReadingGroupId String?` + `@@index`. Nullable, no backfill (null =
  legacy single-reading). No RLS change (column on an already-tenant-scoped, already-RLS table).
- A new fan-out core (`recordVesselReadingCore` or a `mode: "fanout"` branch) in
  `src/lib/chemistry/measurements.ts` that lists residents, mints a group id, and writes N panels via
  the existing `insertPanelTx` (reused verbatim), with derived per-lot idempotency keys.
- Wire the assistant `record_measurement` (+ the 5 plan-058 sibling vessel tools) so a multi-lot
  vessel defaults to fan-out ("record on the whole tank (all lots)") with the picker as the secondary
  "just one lot" option.
- Wire the non-assistant vessel Brix UI (`FermentMonitor` / `/bulk`) so a multi-lot tank offers
  "whole tank" vs "one lot".
- Dedup in vessel-scoped views: vessel History (`src/lib/vessel/timeline-data.ts` via
  `src/lib/lot/timeline.ts`) and `/bulk` fermentation trends.
- Offline outbox: derive `captureId`/`clientRequestId` per (lot) deterministically; validate
  `occupancyToken` against all resident lots.
- Tests: pure fan-out planner unit tests; resume/idempotency round-trip; `verify:chemistry`
  before/after; a `runAsTenant` read-back script (Demo Winery, `QA-*`) proving T4 → 2 panels sharing
  a group id, one vessel-history row, both lot curves carry the reading.

**Out of scope (and why):**
- **Blending the lots** (Phase 5 `blend_lots`) — rejected in the decision: mints a child lot and
  rewrites cost basis / TTB tax class / grower-contract attribution. Product-wrong for a routine
  reading, and wrong if the co-ferment is not permanently one wine. Still the right tool when the
  user genuinely means "these ARE one wine now" — unchanged, not touched here.
- **A combined-must grouping TABLE** — net-new tenant table (full Phase-12 checklist + RLS +
  verify case) and contradicts D2. An ocean.
- **Upstream crush/destem "one must lot"** — the deeper fix (co-fermenting fruit creates ONE must
  lot so the tank is never multi-lot). Bigger reframe, doesn't help the T4 that already exists.
  Future `/office-hours` or `/plan`.
- **Removing the picker** — it stays for the deliberate single-lot attach.
- Any `AnalysisReading` schema change, any RLS policy change, any new table.

## Research Summary

### Codebase Patterns
- **Write path (the core to extend):** `recordMeasurementsCore` + `insertPanelTx`
  (`src/lib/chemistry/measurements.ts:73-161`). `insertPanelTx` already writes ONE panel + readings +
  audit inside a passed `tx` — reuse it N times inside one `runInTenantTx`. `recordMeasurementsCore`
  currently resolves ONE `lotId` via `resolveVesselLot` and returns `{panelId, readingIds, lotId}`.
  Fan-out returns N panel ids + the group id; keep the single-lot return shape for existing callers.
- **The invariant guard (leave intact):** `src/lib/chemistry/resolve-lot.ts` — `resolveVesselLot`
  throws `CONFLICT` on the "ambiguous" (>1 lot) outcome; `resolveResidentLot` is the pure decision fn;
  `listResidentLots(vesselId)` already returns `{lotId, code, varietyName}` per resident (ordered by
  volume desc) — the fan-out target list is essentially free.
- **Idempotency shape:** `AnalysisPanel.clientRequestId @unique` (global) + `AnalysisReading.captureId
  @unique` (global) (`prisma/schema.prisma:2059,2100`). Fan-out MUST derive distinct deterministic
  keys per lot, e.g. panel key `${base}#${lotId}` and reading key `${captureBase}#${lotId}#${analyte}`,
  so a retry re-hits the same rows. `AnalysisReading @@unique([tenantId, panelId, analyte])` already
  guards one-reading-per-analyte-per-panel.
- **Offline capture (the sharp edge):** the `FermentMonitor` Round commits via the Dexie outbox with
  a per-reading `captureId` + a vessel `occupancyToken` (`AnalysisPanel.deviceObservedAt/serverReceivedAt/
  occupancyToken`, schema comment `:2060-2068`). Fan-out must expand these deterministically and
  validate the token against the resident-lot set as of `observedAt`.
- **Assistant picker to reuse + extend:** plan 058's `resolveLotTargetOrChoice`
  (`src/lib/assistant/scope.ts`), `resolveVesselContents` (`scope.ts:177-196`, returns `{id,code}` per
  resident lot), the `resolveOneOrChoice`/`signResume`/`asChoice` infra
  (`src/lib/assistant/tools/resolve.ts`, `assistant-events.ts`). Add a "whole tank (all lots)" default
  option at the head of the choice.
- **Vessel-scoped dedup points:** vessel History `getVesselTimeline`
  (`src/lib/vessel/timeline-data.ts:45+`) unions measurement panels via `describeMeasurementPanel`
  (`src/lib/lot/timeline.ts`); panels carry a `vesselId` snapshot + `@@index([vesselId])` so grouping
  by `vesselReadingGroupId` is a read-time collapse. `/bulk` fermentation trends is the other view.
- **Lot-scoped view NOT to touch:** `loadFermentSeries(lotId)` (`src/lib/ferment/monitor-data.ts:39+`)
  reads panels by `lotId` — each lot's own curve. Correct as-is; each lot's fanned-out panel appears
  on that lot's curve.

### Prior Learnings / Decisions
- **Decision `vessel-reading-fanout-20260712-a1f3`** (this build's charter) — fan-out chosen over
  blend / picker-only / combined-must table. Read it before executing.
- **`measurements-attach-to-one-lot`** — chemistry attaches to exactly one lot; a multi-lot vessel is
  a blend. Fan-out RESPECTS this: N single-lot panels, never a multi-lot panel.
- **`prisma-neon-migrations-windows`** — do NOT `migrate dev` (interactive + phantom `search_vector`
  diff); use `migrate diff` → `deploy`; stop the dev server before `db:generate`.
- **`build-in-main-checkout-not-worktrees`** — build in `C:\Users\russe\Documents\Wine-inventory`
  (has `.env` → migrations + `verify:chemistry` hit Neon), branch + PR to protected `main`. NOT a
  `.claude/worktrees/*` checkout (no `.env`; `gh pr merge` fails there — merge on the remote).
- **`demo-winery-testing-convention`** — all fake data in Demo Winery (`org_demo_winery`), `QA-*`
  prefixed, cleaned up; never Bhutan; keep `verify:naming` green before AND after.
- Plan 058 (`docs/plans/2026-07-12-058-...-plan.md`) — its council section is the origin of the
  fan-out finding; read it for the resume-token hardening it already shipped.

### External Research
None. No new frameworks/APIs; reuses in-repo infra.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| How to record one reading on a multi-lot tank | **Fan-out: N single-lot panels sharing `vesselReadingGroupId`** | Blend the lots; combined-must table; picker-only | Only option that gives one-tap logging without forcing a per-lot pick AND without destroying two-lot cost/TTB tracking. Domain-honest (a tank sample applies to all liquid). Respects D2. |
| Schema shape | **One nullable `analysis_panel.vesselReadingGroupId` + index** | New table; `AnalysisReading` change | Minimal, no RLS/tenancy-checklist churn, no backfill. Null = legacy/single-reading. |
| New core vs mutate `recordMeasurementsCore` | **Add a fan-out path; leave single-lot core + `resolveVesselLot` untouched** | Change the existing core's return type | Single-lot + sample-result paths must not regress (`verify:chemistry`); a parallel path is minimal-diff and keeps the throwing guard for the deliberate single-lot pick. |
| Idempotency key derivation | **Deterministic `${base}#${lotId}` per panel, `${captureBase}#${lotId}#${analyte}` per reading** | Mint fresh random keys | A retry/offline re-sync must be a no-op per lot; deterministic derivation makes the `@unique` constraints do the dedup. |
| Multi-lot default | **Fan-out is default; picker is the explicit "just one lot" option** | Picker default (plan 058) | The reported need is "log on the combined wine"; picking a lot is the exception, not the rule. Curve continuity for free. |

## Implementation Units

### Unit 1: Schema — `vesselReadingGroupId` column + migration

**Goal:** Add the nullable grouping column so fanned-out panels can be tied together and deduped.
**Files:** `prisma/schema.prisma` (model `AnalysisPanel`), `prisma/migrations/<ts>_analysis_panel_vessel_reading_group/migration.sql`.
**Approach:** Add `vesselReadingGroupId String?` to `AnalysisPanel` with `@@index([vesselId,
vesselReadingGroupId])` (the vessel-view dedup query). **[Council] Add a partial DB uniqueness guard
`@@unique([tenantId, vesselReadingGroupId, lotId])`** — native, index-backed idempotency that also
blocks two divergent panels for the same (group, lot) (answers "app-level atomicity is a myth"). Column
on an already-tenant-scoped + RLS-forced table → NO new policy, NO tenancy checklist beyond the column +
indexes, NO backfill (existing rows stay null = single-reading; the partial unique only bites non-null
group ids). Generate the migration with `migrate diff` → `deploy` (NOT `migrate dev`); stop the dev
server before `db:generate` (Windows rule). Note: `clientRequestId`/`captureId` are `String` (not
`@db.Uuid`), so the `${base}#${lotId}` derivation cannot throw a UUID-parse error.
**Tests:** migration applies clean on a Neon branch; `db:generate` produces the field; `verify:chemistry`
still green (column is additive/nullable).
**Depends on:** none
**Execution note:** governed by the brain-context PreToolUse hook (`analysis_panel`) + out-of-fence —
this is a human-reviewed PR, not an auto-fix. Build in the MAIN checkout.
**Patterns to follow:** any additive-nullable-column migration in `prisma/migrations/` (e.g. the
Phase-14 v1.1 column-only migrations noted in AGENTS.md).
**Verification:** `npx prisma migrate diff` shows only the column + index; `verify:chemistry` green.

### Unit 2: Fan-out write core

**Goal:** A core that writes one panel per co-resident lot in one tx, sharing a `vesselReadingGroupId`,
idempotently.
**Files:** `src/lib/chemistry/measurements.ts` (add `recordVesselReadingCore`, or a `fanout` branch),
`src/lib/chemistry/resolve-lot.ts` (reuse `listResidentLots`).
**Approach:** New `recordVesselReadingCore(actor, input)` where `input` carries `vesselId`, `readings`,
`observedAt`, capture context, and a base `clientRequestId`/capture context. Steps: (1) list resident
lots via `listResidentLots(vesselId)` — if 0 → structured empty error; if 1 → delegate to the existing
single-lot `recordMeasurementsCore` (no group id); if >1 → fan out. (2) **[Council fix] Derive the `vesselReadingGroupId` DETERMINISTICALLY from the stable base request
id** (e.g. `group:${base}` or a stable hash) — NOT a fresh cuid — so a retry/race lands the SAME group.
(A fresh random group id makes the P2002 re-read-by-group find nothing.) (3) In ONE `runInTenantTx`,
loop residents calling `insertPanelTx` per lot with `clientRequestId = ${base}#${lotId}`, the shared
deterministic `vesselReadingGroupId`, and (offline path) derived `captureId`s. (4) Idempotency: pre-check
by `vesselReadingGroupId`; on `P2002` race, re-read by the deterministic group id (now guaranteed to
match) and return it. The `@@unique([tenantId, vesselReadingGroupId, lotId])` (Unit 1) is the DB backstop. Return `{ vesselReadingGroupId, panels:[{lotId,
panelId, readingIds}] }`. **Do NOT modify** `recordMeasurementsCore`/`resolveVesselLot` for their
existing callers. **[Eng review] Guard:** fan-out MUST refuse when `sampleId` is set (result path
inherits the sample's lot — never fans out). **[Eng review] Group-atomic void:** extend `voidPanelCore`
so voiding a panel with a non-null `vesselReadingGroupId` voids ALL panels in that group in one tx
(keeps the tank + per-lot curves consistent; FermentMonitor edit = void-group + re-log-group). Idempotency
only holds when the caller passes a stable base `clientRequestId` (form/offline both do); no base = the
same no-guarantee as today.
**Tests:** node-env vitest over a PURE fan-out planner (residents + base keys → the set of
`{lotId, clientRequestId, captureIds, groupId}` to write): 1 resident → single-lot delegate, no group;
2 residents → 2 plans sharing a group id, distinct deterministic keys; 0 → empty. Re-running the
planner with the same base yields identical keys (idempotency proof).
**Depends on:** Unit 1
**Execution note:** extract the derivation as a pure fn so it is DB-free testable (mirrors
`resolveResidentLot`).
**Patterns to follow:** `insertPanelTx` reuse (`measurements.ts:73-105`), `runInTenantTx`
(`measurements.ts:137`), the idempotency re-read (`measurements.ts:114-123,150-159`).
**Verification:** a `runAsTenant("org_demo_winery")` script records one reading on a QA 2-lot vessel →
2 panels, same `vesselReadingGroupId`, each with its lot's readings; a re-run writes nothing new.

### Unit 3: Assistant path — fan-out default + picker as "just one lot"

**Goal:** On a multi-lot vessel the assistant defaults to fan-out; the plan-058 picker becomes the
explicit "…or just one lot" alternative.
**Files:** `src/lib/assistant/tools/record-measurement.ts` (+ the 5 plan-058 siblings:
`record-tasting-note.ts`, `pull-sample.ts`, `transition-lot-state.ts`, `record-bulk-wine-cost.ts`,
`scope.ts` `resolveOpenSample`), `src/lib/assistant/scope.ts` (`resolveLotTargetOrChoice`),
`src/lib/assistant/prompt.ts`.
**Approach:** On a multi-lot vessel, `record_measurement` proposes fan-out ("record 10.5 °Bx on the
whole tank — both lots") as the default confirm-card, calling `recordVesselReadingCore`. The
`resolveLotTargetOrChoice` picker gains a FIRST option "Whole tank (all N lots)" (resumes to fan-out),
with each individual lot below it (resumes to the single-lot committer, unchanged). Prompt bullet:
routine vessel readings default to the whole tank; offer per-lot only when the user names a lot.
**[Eng review — decided] Fan-out is `record_measurement` ONLY in v1.** The 5 siblings
(`record_tasting_note`, `pull_sample`, `transition_lot_state`, `record_bulk_wine_cost`,
`resolveOpenSample`) keep the plan-058 picker UNCHANGED — a `Sample` is one row with one lotId, and a
cost / state transition across lots is undefined-or-wrong. Do NOT fan those out. Extending is a
follow-up, not this PR.
**Tests:** node-env: `record_measurement` on a 2-lot vessel → fan-out proposal (not a raw choice);
picker still offers per-lot; resume round-trip for both "whole tank" and "one lot".
`test/evals/*.golden.ts` structural: multi-lot measurement → fan-out arg shape.
**Depends on:** Unit 2
**Patterns to follow:** plan 058 Unit 2 resume round-trip; `material-picker.ts` / `add-addition.ts`.
**Verification:** "log 10.5 Brix on T4" → "record on the whole tank (both lots)?" → confirm → 2 panels
(read back via `runAsTenant`); "…just the RRR lot" → picker → 1 panel.

### Unit 4: Non-assistant vessel Brix UI — whole-tank vs one-lot

**Goal:** The `/bulk` `FermentMonitor` Brix logging on a multi-lot tank offers "whole tank (all lots)"
(fan-out) vs a specific lot, instead of dead-ending or silently binding to one lot.
**Files:** `src/components/ferment/FermentMonitor.tsx`, its capture server action (the
`capture({vesselId, lotId, occupancyToken, …})` path), `src/lib/ferment/monitor-data.ts` if the modal
needs the resident-lot list.
**Approach:** `FermentMonitor` is per-lot today. On a multi-lot vessel, surface a small selector at
capture time: default "Whole tank — records on all N lots" (→ fan-out core) or a specific resident lot
(→ current single-lot capture). Reuse `listResidentLots`. Keep the offline outbox path (Unit 5).
**Tests:** repo has no jsdom/RTL — UI is manual-QA-only; test pure logic (the resident-lot selector
model) only. Manual: open T4 monitor → "whole tank" → log Brix → both lots' curves update.
**Depends on:** Unit 2
**Patterns to follow:** the existing `capture` call in `FermentMonitor.tsx:172`; token-compliant
DESIGN.md controls.
**Verification:** manual browser (Demo Winery): T4 Brix via monitor → 2 panels, one vessel-history row.

### Unit 5: Offline outbox fan-out (Dexie) + occupancy validation

**Goal:** A reading captured OFFLINE on a multi-lot tank fans out correctly on sync, idempotently,
with the occupancy token validated against ALL resident lots.
**Files:** the offline queue/sync path (`src/lib/offline/queue.ts`, `src/lib/offline/db.ts`), the
capture action that consumes `captureId`/`occupancyToken`, `src/lib/chemistry/measurements.ts` (fan-out
core's offline branch).
**Approach:** **[Council — decided: expand EARLY, not late.]** The current offline queue is a
single-lot pipeline (one `lotId`/`panelId`/`commandId`; `submitPanelCore` inserts one panel, checks
CURRENT residency). Do NOT invent a special multi-lot outbox record or reconstruct occupancy "as of
observedAt" (that API does not exist, and failing a legit late sync is bad UX). Instead: when the user
picks "whole tank," resolve the resident lots **at capture time** and enqueue **N normal one-lot
captures**, each with the shared deterministic `vesselReadingGroupId` + its derived `captureId`. Online:
the fan-out core wraps N inserts in one tx. Offline: N ordinary queue items sync through the EXISTING
single-lot path; the derived keys make a re-sync a no-op. This snapshots residents at capture (correct
temporal attribution) and reuses the proven single-lot sync path with near-zero new queue surface.
**Tests:** node-env over the derivation + the "resident set changed" guard; a simulated double-sync
writes each lot's panel once. (`test/offline-queue.test.ts` is the existing harness.)
**Depends on:** Unit 2
**Patterns to follow:** existing offline idempotency (`captureId` UNIQUE + ON CONFLICT DO NOTHING,
schema comment `:2096-2100`), `test/offline-queue.test.ts`.
**Verification:** `npm run test` offline suite green; simulated offline T4 capture → 2 panels on sync,
re-sync writes nothing.

### Unit 6: Vessel-scoped dedup + regression proof

**Goal:** Vessel History and `/bulk` trends show ONE row per fanned-out reading; lot curves show each
lot's; nothing else regressed.
**Files:** `src/lib/vessel/timeline-data.ts` (`getVesselTimeline`), **`src/lib/chemistry/data.ts`
(`listVesselAnalyses` + its `panelCount` — [Council] I missed this; it double-counts immediately)**,
`src/lib/lot/timeline.ts` (`describeMeasurementPanel` union), the `/bulk` fermentation-trends loader;
**the group-aware result/undo contract in `src/lib/chemistry/actions.ts` + the AnalysisForm undo +
`src/lib/assistant/tools/record-measurement.ts` ([Council] these still assume one `panelId`)**;
verification script under `scripts/` (`QA-*`).
**Approach:** **[Council] Centralize the dedup key** as one helper `coalesce(vesselReadingGroupId, id)`
(a "physical reading id") and apply it at EVERY vessel-scoped panel read — `getVesselTimeline` (one item
per physical reading), `listVesselAnalyses` (`panelCount` counts physical readings, not rows), and
`/bulk` trends (one point per physical reading; never average duplicate lot copies). Lot-scoped loaders
(`loadFermentSeries`, lot detail, stuck detector) are UNTOUCHED — each lot's panel shows on its own
curve. Guard: dedup ONLY when `vesselReadingGroupId` is non-null (legacy null panels unaffected).
**Group-aware contract:** whole-tank capture returns `{vesselReadingGroupId, panels[]}`; the form/assistant
undo voids the GROUP (Unit 2 group-atomic void), not a single panel.
**Tests:** pure dedup fn (list of panels with/without group ids → deduped vessel view); `verify:chemistry`
green; a read-back script asserting T4 → one vessel-history row + both lot curves carry 10.5 Bx.
**Depends on:** Units 2-5
**Patterns to follow:** `getVesselTimeline` union (`timeline-data.ts`), `buildTimeline/mergeTimeline`.
**Verification:** `npm run verify:chemistry` green; manual `/bulk` T4 History shows one Brix row, each
lot's fermentation chart shows the point.

## Test Strategy

- **Unit (node-env vitest, no jsdom):** pure fan-out planner + key derivation (Unit 2), resume
  round-trip (Unit 3), offline derivation + occupancy guard (Unit 5), vessel dedup fn (Unit 6).
- **Domain proof:** `npm run verify:chemistry` green BEFORE and AFTER (the fence's chemistry gate) —
  proves single-lot + sample-result paths did not regress.
- **Eval:** `test/evals/*.golden.ts` structural (CI) for the assistant fan-out arg shape; opt-in gated
  LLM eval for routing.
- **End-to-end read-back (Demo Winery only, `QA-*`):** a `runAsTenant("org_demo_winery")` script that
  seeds a 2-lot QA vessel, records ONE reading, and asserts: 2 non-voided panels sharing one
  `vesselReadingGroupId`, each on its own lot; a re-run writes nothing; vessel view = 1 row; each lot
  curve carries the value. Clean up the QA fixtures; keep `verify:naming` green.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fan-out duplicate rows leak into a LOT-scoped view | LOW | MED | Dedup ONLY in vessel-scoped loaders; lot loaders untouched; test asserts both. |
| Offline re-sync double-writes a lot's panel | MED | HIGH | Deterministic per-lot `clientRequestId`/`captureId`; `@unique` + re-read on `P2002`; simulated double-sync test. |
| Tank residents change between offline capture and sync | LOW | HIGH | Validate `occupancyToken` against resident set as of `observedAt`; fail closed + re-prompt. |
| Fan-out applied where it's wrong (cost/state-transition siblings) | MED | MED | Scope fan-out to `record_measurement` (+ maybe `pull_sample`); siblings keep the picker; decide per-tool in Unit 3. |
| Regression in single-lot / sample-result path | LOW | HIGH | New parallel core; `recordMeasurementsCore`/`resolveVesselLot` untouched; `verify:chemistry` before/after. |
| Migration friction on Windows/Neon | MED | LOW | `migrate diff`→`deploy`, stop dev server before `db:generate` (learning). |
| Voiding one fanned panel leaves the group half-voided | MED | LOW | Unit 6 NICE: void-as-group; if deferred, document that a group void is per-panel for now. |

## Success Criteria

- [ ] On a multi-lot tank, one reading records ONE panel per resident lot sharing a `vesselReadingGroupId`; no forced lot pick.
- [ ] VISION D2 intact — every panel is single-lot; no join table; `AnalysisReading` unchanged; `verify:chemistry` green before/after.
- [ ] Fan-out is atomic + idempotent (double-submit and offline re-sync write each lot's panel at most once).
- [ ] Vessel History + `/bulk` trends show ONE row per fanned reading; each lot's curve carries the value.
- [ ] Single-lot + sample-result paths unchanged; picker retained as the "just one lot" option.
- [ ] Only schema change is the one nullable column + index; no RLS/table/tenancy-checklist change.
- [ ] Read-back script (Demo Winery) proves T4 → 2 grouped panels, one vessel row, both curves.

## What Already Exists (reuse, don't rebuild)

- `insertPanelTx` — the one-panel writer; call it N times in one tx.
- `listResidentLots(vesselId)` — the fan-out target list, volume-ordered, with variety.
- Plan 058 picker infra — `resolveLotTargetOrChoice`, `resolveOneOrChoice`/`signResume`/`asChoice`,
  the choice card. Add a "whole tank" head option; don't rebuild.
- Offline idempotency primitives — `clientRequestId`/`captureId` UNIQUE + re-read-on-conflict.
- Vessel timeline engine — `buildTimeline`/`mergeTimeline`; add a group-collapse at the union.

## NOT in Scope (considered, deferred)

- Blending the two lots (Phase 5) — the "permanently one wine" path; unchanged, not triggered here.
- Combined-must grouping table — contradicts D2; an ocean.
- Upstream crush/destem "one must lot" — the deeper fix; future plan.
- Removing the picker — kept for the deliberate single-lot attach.

## ENG REVIEW (2026-07-12)

Reviewed for: parallel-core blast radius, idempotency correctness, the offline unit, sibling scope,
test coverage. Six findings; two were genuine forks (decided with recommendations, user did not
override).

- **[P1] Group-void consistency (was under-scoped):** voiding one fanned panel left the group
  half-alive. **DECIDED — void is group-atomic** (`voidPanelCore` voids all panels sharing the
  `vesselReadingGroupId`; edit = void-group + re-log-group). Folded into Unit 2 + Requirements.
- **[P1] Sibling scope:** `pull_sample`/tasting/cost/state-transition do not map to fan-out (a `Sample`
  is one row / one lot). **DECIDED — `record_measurement` ONLY in v1**; siblings keep the plan-058
  picker. Shrinks the diff, matches the reported bug. Folded into Unit 3 + Requirements.
- **[P2] Sample-RESULT exclusion:** fan-out must refuse when `sampleId` is set (result inherits the
  sample's lot). Folded into Unit 2 guard.
- **[P2] Standing verify case:** a one-off read-back rots. **Add a fan-out case to
  `scripts/verify-chemistry.ts`** (one reading → 2 grouped single-lot panels, vessel-view dedup, both
  curves carry it, group void drops all). Folded into Requirements + Success Criteria.
- **[P3] Confirm card names every lot** so a wrong default (two different wines in one tank) is caught
  pre-write. Folded into Requirements (design-review will refine the copy).
- **Idempotency (confirmed sound):** `${clientRequestId}#${lotId}` is safe (cuids have no `#`);
  P2002 re-read-by-group is correct; dedup requires a caller-supplied stable base key (form/offline
  both supply one).

**Perf:** non-issue (N = 2-3 lots, one tx, no N+1). **Tests:** adequate once group-void +
verify:chemistry cases are added (both now in the plan).

**VERDICT:** ENG CLEARED after folding the two decisions. No schema beyond the one nullable column;
single-lot + sample-result paths untouched; blast radius contained by the parallel core. Outside voice
(Codex) next; then `/plan-design-review` for the whole-tank-vs-one-lot selector (assistant confirm card
+ FermentMonitor).

## COUNCIL REVIEW (2026-07-12) — Codex gpt-5.4 + Gemini 3.1-pro

Both found correctness holes the eng review missed. Consensus fixes FOLDED (bugs, not decisions):

1. **Deterministic group id** — a fresh random `vesselReadingGroupId` breaks P2002 recovery (re-read
   by group finds nothing if racers minted different ids). Derive it from the stable base request id.
   (Unit 2.)
2. **Offline: expand EARLY, not late** — the queue is a single-lot pipeline; resolve residents at
   capture and enqueue N normal one-lot captures with a shared group id, instead of a special multi-lot
   outbox + non-existent "occupancy as of observedAt" reconstruction + fail-closed-on-late-sync.
   Snapshots residents at capture; reuses the proven sync path. (Unit 5, rewritten.)
3. **Wider read-side blast radius** — `chemistry/data.ts` `listVesselAnalyses`/`panelCount` also
   double-counts; centralize a `coalesce(vesselReadingGroupId, id)` "physical-reading id" and apply at
   every vessel-scoped read. (Unit 6.)
4. **Group-aware action/undo/assistant contract** — `recordMeasurementsAction`, AnalysisForm undo, and
   the assistant commit assume one `panelId`; whole-tank capture returns a group + N panels, undo voids
   the group. (Unit 6.)
5. **DB-level idempotency** — `@@unique([tenantId, vesselReadingGroupId, lotId])` over string derivation;
   also blocks divergent same-group rows. (Unit 1.) `String` (not UUID) columns → no parse-crash risk.

**CROSS-MODEL TENSION (surfaced to user; user did not override → recommendation stands):** Gemini
proposed an alternative design — attach a tank reading to the TANK as ONE row (nullable `lotId` + check
constraint) and UNION it into lot views — instead of fan-out. **Decision: STAY with fan-out.** Gemini
lacked the D2 context: attach-to-vessel weakens the load-bearing one-lot invariant and forces a UNION
rewrite across the MANY lot-scoped readers (lot detail, per-lot curve, stuck detector), spreading
complexity wider; fan-out keeps every per-lot consumer unchanged. Its one win (clean raw-export rows) is
contained — Codex confirmed no TTB/compliance path reads `analysis_panel` (compliance reads the ledger).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (direction set by user decision) |
| Codex/Gemini Council | `/council` | Independent 2nd opinion | 1 | issues_found→folded | 5 correctness fixes folded; 1 architecture tension → stay fan-out |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEARED | 6 findings (2 P1 decided, folded); no schema beyond 1 col |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | PENDING | recommended — whole-tank-vs-one-lot selector |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | optional |

- **CROSS-MODEL:** Codex + Gemini agreed on all 5 correctness fixes; diverged on the core design
  (fan-out vs attach-to-vessel) — resolved to fan-out with the D2 context they lacked.
- **UNRESOLVED:** 0 (correctness fixes folded; architecture fork resolved per recommendation).
- **VERDICT:** ENG CLEARED + COUNCIL FOLDED. Recommended next: `/plan-design-review` (the
  whole-tank-vs-one-lot selector + confirm-card copy), then `/work` in the MAIN checkout.
