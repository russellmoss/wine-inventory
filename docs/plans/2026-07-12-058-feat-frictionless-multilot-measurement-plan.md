---
title: Frictionless measurement targeting on a multi-lot ("one must") tank
type: feat
status: draft
date: 2026-07-12
branch: feat/frictionless-multilot-measurement
depth: standard
units: 4
status: completed
---

## Overview

When a tank holds more than one must lot, the assistant currently dead-ends a bench/sugar
reading with a plain-text "which lot is this for?" — the winemaker can't easily record the
10.5 °Bx they just pulled off tank T4. This plan makes that moment a one-tap clickable lot
picker (reusing the battle-tested material-picker infra) across ALL six vessel-selection
assistant tools, so no vessel action dead-ends on a multi-lot tank. The picker defaults to the
lot the tank's most recent reading used, to keep a coherent per-lot curve. No schema change.

**[Council 2026-07-12] The "one must" data-model question — a tank reading that should apply to
ALL co-resident lots (fan-out) — is escalated to a separate `/decision`** (it needs a schema
column and contradicts the Phase-4 "don't analyze part of a blend" precedent). This plan ships
the frictionless picker now; the deeper fan-out model is decided separately. The blend nudge is
NOT part of this plan (council: nudging a compliance/cost/lineage-altering blend to log a routine
reading is product-wrong).

## Problem Frame

From Demo Winery bug `cmri7xdxf`: the winemaker approved WO #16 (crush/destem RRR Block 1 Pinot
→ T4), sampled T4 mid-ferment, and tried to log 10.5 °Bx. T4 held two MUST lots (2024-RRR-1-PN
5,800 L + 2024-PN 2,300 L). The crew considers them "all together as one must," but the system
tracks two lots, so `resolveLotTarget` **throws** ("holds a blend — which lot is this for?") and
the reading can't land without the user naming a lot code.

Two distinct pain points hide here:
1. **Friction:** even when the lots really are distinct, the disambiguation is a text dead-end,
   not a picker. This is the bug the user actually hit.
2. **Modeling mismatch:** if the liquid truly is one homogeneous must, the system shouldn't be
   tracking two lots at all. The established domain axiom (VISION D2: "chemistry attaches to the
   homogeneous liquid — the lot in the vessel") says the right way to make a tank one measurable
   unit is to **blend the lots into one lot** (Phase 5 `blendLotsCore`), not to invent a way to
   measure across two.

**Upstream flag (do nothing here, but name it):** the deeper cause is that the crush/destem flow
put two must lots into one tank that the crew treats as one must. A future improvement is to let
that intake create (or offer to combine into) a single must lot. Out of scope for this plan; noted
for a later `/office-hours` or `/plan`.

**Cost of doing nothing:** the exact reading the winemaker wants to capture mid-ferment can't be
recorded through the assistant on any multi-lot tank. That's a real daily-use gap for co-fermented
or sequentially-filled tanks.

## Requirements

- MUST: On a multi-lot vessel, ALL SIX loop-resident vessel-selection tools surface a **clickable
  lot picker** (each resident lot an option), not a text-only "which lot?" throw. Tapping one
  returns the tool's normal confirm-card with that lot pinned (no model round-trip; NOT an auto-write).
- MUST: Respect VISION D2 — every measurement row still attaches to exactly ONE homogeneous lot.
  No schema change, no join table, no `analysis_panel` multi-lot.
- MUST: Keep the single-lot and sample-results paths behaving exactly as today (no regression in
  `verify:chemistry`).
- MUST: The resume token is a signed write-grade credential — bind `tool + tenantId + user/session +
  vesselId + chosenLotId + hash(pending args)`, add a TTL, revalidate the chosen lot against CURRENT
  vessel contents on resume (stale → regenerate the picker), and preserve `clientRequestId` idempotency.
- SHOULD: The picker defaults to / highlights the lot the tank's most recent reading used, so a
  co-fermented tank's per-lot curve stays continuous instead of fragmenting.
- SHOULD: Picker sublabel disambiguates beyond code+volume (grower/block/vintage/intake date) — two
  resident lots can share a code.
- NICE: `empty` vessel returns a structured user-facing message, not a raw thrown exception.

## Scope Boundaries

**In scope:**
- A new `resolveLotTargetOrChoice` variant that returns a `resolveOneOrChoice`-style clickable picker
  on a multi-lot vessel (throwing `resolveLotTarget` untouched).
- Wire ALL SIX loop-resident callers to it: `record_measurement`, `record_tasting_note`, `pull_sample`,
  `transition_lot_state`, `record_bulk_wine_cost`, and `resolveOpenSample` (scope.ts).
- Resume-token hardening (signed binding + TTL + stale revalidation + idempotency).
- Picker defaults to the tank's last-reading lot (curve continuity); disambiguating sublabels.
- Assistant prompt guidance for the picker; goldens + `verify:chemistry` proof single-lot is unchanged.

**Out of scope (and why):**
- **Option (b) a first-class "combined-must" grouping table** — net-new tenant table (full
  Phase-12 checklist + RLS + `verify:tenant-isolation` case), resolver + ledger changes, AND it
  reintroduces "analyze the combination without homogenizing," which directly contradicts VISION
  D2 / the Phase-4 precedent. That's an ocean, not a lake, and needs its own `/decision` first.
- **Option (a) fan one reading out to all co-resident lots** — council (Gemini) argues this is the
  domain-honest answer for a homogeneous co-ferment (a tank sample applies to all liquid) and that the
  duplicate-row objection is a display-dedup problem (a shared `vesselReadingGroupId`), not a data one.
  It needs a nullable `analysis_panel.vesselReadingGroupId` COLUMN (schema change → human review, no
  longer fence-eligible) and contradicts the Phase-4 "don't analyze part of a blend" precedent.
  **ESCALATED to a separate `/decision`** (per user, 2026-07-12) — not folded into this plan.
- Changing the crush/destem intake to create one must lot (the upstream fix). Council reinforced it as
  the real fix; flagged for a future `/office-hours` or `/plan`.
- Any change to `prisma/schema.prisma` or migrations (none needed for the picker).

## Research Summary

### Codebase Patterns

- **Where the throw lives:** `src/lib/assistant/scope.ts:230-235` — `resolveLotTarget({lot, vessel})`
  delegates to `resolveVesselContents` and on `kind === "blend"` throws
  ``holds a blend (${codes}) — which lot is this for?``. `resolveVesselContents` (scope.ts:177-196)
  already returns the full `{ id, code }` list per resident lot from the `VesselLot` projection —
  the picker options are essentially free.
- **The picker infra to reuse:** `src/lib/assistant/tools/resolve.ts` — `resolveOneOrChoice<T>`
  (resolve.ts:29-52) returns `{kind:"one"} | {kind:"choice", choice: ChoiceRequest}` and builds
  clickable options with a signed `resume` token (`signResume`) that re-drives the *same tool*
  id-pinned. `asChoice` + the run-loop wiring already render it (`assistant-events.ts:90-115`,
  `run.ts:130-147`). Copy `pickMaterial` in `tools/material-picker.ts` (uses `resolveOneOrChoice`
  + `signResume`, pinned by `#<id>`); `add-addition.ts`/`additive-resolve.ts` are further examples.
- **The measurement write path (unchanged by option c):** `recordMeasurementsCore`
  (`src/lib/chemistry/measurements.ts:108-161`) resolves exactly one `lotId` then `insertPanelTx`
  writes one `AnalysisPanel`. The assistant committer `commitRecordMeasurement`
  (`tools/record-measurement.ts:104-114`) passes a single `lotId`. We change how the lot is
  *chosen*, not how it's written.
- **Blend capability for the nudge:** `blend_lots` assistant tool → `blendLotsCore`
  (`src/lib/blend/blend-core.ts`), which mints one child lot with `origin*` NULL and writes
  `LotLineage BLEND` edges — the existing "N lots → one measurable lot" primitive.

### Prior Learnings / Decisions

- **VISION D2** (`VISION.md:94-97`): chemistry/additions attach to the homogeneous lot in the
  vessel, never a phantom share of a parent. Enforced structurally (`AnalysisPanel.lotId` single
  required FK, no join table — `prisma/schema.prisma:2035`), by the `resolve-lot.ts` guard, and by
  `verify:chemistry`. There is **no** typed invariant-register note for it (register has 29 notes,
  none on measurements) — the rule is a schema + code-guard + VISION axiom.
- **Phase-4 precedent** (cited `docs/plans/2026-06-28-020-...-plan.md:37-38,178-180`): "a multi-lot
  vessel IS a blend; you can't analyze one part of a blend" → point multi-resident cases at "record
  a blend (Phase 5)." Option (c)+nudge aligns with this; option (b) fights it.
- **Fence facts:** `src/lib/chemistry/` is INSIDE the widened auto-fix fence (plan 052) with a
  `verify:chemistry` domain proof; `src/lib/assistant/` is in the original fence. **But**
  `prisma/schema.prisma` + migrations are hard-denied by the fence AND governed by the brain-context
  hook — so options (a)/(b) (which need schema) require human review, while option (c) (no schema)
  stays fence-eligible.

### External Research

None needed — no new frameworks/APIs; reuses in-repo infra.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| How to handle a multi-lot tank for a reading | **(c) Frictionless clickable lot picker** + a blend nudge | (a) fan-out to N panels; (b) new combined-must table | (c) is the least invasive (no schema, no tenancy checklist, no ADR), fully respects VISION D2, reuses proven picker infra, and directly fixes the friction the user hit. (b) is an ocean that contradicts D2. (a) creates duplicate vessel-scoped data + questionable semantics. |
| Making a tank truly "one must" | Nudge toward existing **blend** (Phase 5) | New grouping abstraction (b) | Blending is the domain-honest, already-built way to collapse co-resident lots into one measurable lot; no new model, no D2 tension. |
| `resolveLotTarget` shape | **Add a NEW `resolveLotTargetOrChoice` variant**; leave the throwing `resolveLotTarget` untouched | Change `resolveLotTarget`'s return type to a `one \| choice` union (REJECTED) | **[Eng review 2026-07-12]** `resolveLotTarget` has **11 call sites across 9 files**, each destructuring `const {lotId,lotCode} = await …`. A return-type change breaks all 11 — including 2 in `src/lib/work-orders/nl-resolve.ts:172,377` that run in the WO NL-authoring path, NOT the chat tool-use loop, so they physically cannot render an `asChoice` picker. A parallel variant is minimal-diff and blast-radius-safe: only loop-resident tools opt in; throwing callers stay as-is. |

## Implementation Units

### Unit 1: New `resolveLotTargetOrChoice` variant (do NOT change `resolveLotTarget`)

**Goal:** Add a choice-returning sibling of `resolveLotTarget` that, on a multi-lot vessel, returns a
clickable lot picker (each resident lot an option with a signed `resume` token pinning its `lotId`)
instead of throwing. The existing throwing `resolveLotTarget` stays byte-for-byte unchanged so its
11 callers are untouched.

**Blast-radius map (why a new variant, not a return-type change) — `resolveLotTarget` callers today:**

```
resolveLotTarget  → 11 call sites / 9 files, all destructure { lotId, lotCode }
├─ ASSISTANT TOOL-USE LOOP (can render a picker — candidates to opt in):
│   ├─ tools/record-measurement.ts:87      {lot,vessel}   ← THIS BUG (Unit 2, in scope)
│   ├─ tools/record-tasting-note.ts:64      {lot,vessel}   ← sibling (fast-follow, Unit 2 note)
│   ├─ tools/pull-sample.ts:35              {lot,vessel}   ← sibling (fast-follow)
│   ├─ tools/transition-lot-state.ts:41     {lot,vessel}   ← sibling (fast-follow)
│   ├─ tools/record-bulk-wine-cost.ts:34    {lot,vessel}   ← sibling (fast-follow)
│   └─ scope.ts:325 resolveOpenSample       {lot,vessel}   ← sibling (fast-follow)
├─ {lot}-ONLY callers (never hit the vessel-blend branch → leave throwing, no change):
│   ├─ tools/log-riddling.ts:36             {lot}
│   ├─ tools/sparkling-disgorge.ts:45       {lot}
│   └─ scope.ts:286 resolveRecentOperation  {lot}
└─ OUTSIDE the chat loop (CANNOT render a picker → MUST stay throwing):
    ├─ work-orders/nl-resolve.ts:172        {lot}          (WO NL authoring, server-side)
    └─ work-orders/nl-resolve.ts:377        {lot}          (WO NL authoring, server-side)
```

**Files:** `src/lib/assistant/scope.ts` (add `resolveLotTargetOrChoice`), reuse
`src/lib/assistant/tools/resolve.ts` (`ResolveResult`/`ChoiceRequest`/`signResume`).
**Approach:** New `resolveLotTargetOrChoice({lot?, vessel?}): Promise<ResolveResult<{lotId,lotCode}>>`.
Internally reuse `resolveVesselContents`/the lot-code path; on `single`/exact-lot → `{kind:"one", value}`;
on `blend` → `{kind:"choice", choice}` mapping `contents.lots` → `ChoiceOption[]` (`label = lot.code`,
`sublabel` = a real disambiguator: grower/block/vintage + volume — two resident lots can share a code
(council); order the last-used lot first for curve continuity — see Unit 3); `resume` token re-driving
the caller pinned to `lotId` with the write-grade binding (Unit 2). On `empty` → return a structured
user-facing message (not a raw throw).
Factor the shared resolution so `resolveLotTarget` and the new variant don't diverge (DRY: extract the
common "resolve to lot(s)" step; the two wrappers differ only in blend handling — throw vs choice).
**Tests:** node-env vitest over the pure mapping (blend `VesselContents` → `ChoiceOption[]`): single-lot
→ `one`; two-lot → `choice` with 2 options each carrying a `resume` token; empty → throws. Snapshot that
`resolveLotTarget` output is unchanged (characterization) so the shared-helper refactor is provably inert.
**Depends on:** none
**Execution note:** make-the-change-easy-then-change — extract the shared resolver first (inert refactor,
tests green), THEN add the choice wrapper.
**Patterns to follow:** `resolveOneOrChoice` (`tools/resolve.ts:29-52`), `pickMaterial`
(`tools/material-picker.ts`), `asChoice` (`assistant-events.ts:90-115`).
**Verification:** `npm run verify:chemistry` green; `resolveLotTarget` characterization test proves the
11 existing callers see identical behavior; a two-lot vessel through the new variant yields a 2-option choice.

### Unit 2: Wire all six loop-resident tools to the picker

**Goal:** Every assistant vessel-selection tool returns the clickable picker instead of a text dead-end
on a multi-lot tank; tapping an option returns that tool's normal confirm-card with the lot pinned
(NOT an auto-write). Council: fixing only `record_measurement` and leaving siblings broken is a
disjointed UX, so all six move together (user decision 2026-07-12).
**Files:** `src/lib/assistant/tools/record-measurement.ts`, `record-tasting-note.ts`, `pull-sample.ts`,
`transition-lot-state.ts`, `record-bulk-wine-cost.ts`, and `scope.ts` (`resolveOpenSample`); plus the
shared choice card `src/app/(app)/assistant/AssistantChat.tsx:1070-1099` for the two a11y fixes
(min-height 44px option + `aria-pressed`) from the Picker UX & Accessibility Spec.
**Approach:** Each caller swaps `resolveLotTarget` → `resolveLotTargetOrChoice`; on `kind==="choice"`
return the `ChoiceRequest` (`needsChoice` shape `asChoice` understands); on `kind==="one"` proceed as
today. The `resume` token re-drives the SAME tool with the chosen lot pinned, producing the tool's
normal proposal/confirm-card — the actual write still goes through each tool's UNCHANGED committer
(single-lot). **Resume is write-grade:** verify the signed token's `tool/tenant/user/vessel/argsHash`
binding + TTL, and revalidate the pinned lot is still resident (stale → regenerate the picker, do not
write). Idempotency `clientRequestId` rides the resume payload so a double-tap can't duplicate.
**Tests:** node-env tests for the resume round-trip on `record_measurement` (representative): resume
resolves to exactly that `lotId` and yields a single-lot proposal (never a committed write, never a
second choice); plus expired token, wrong tenant/user/tool, stale/moved lot, emptied vessel, double-tap.
**Depends on:** Unit 1
**Patterns to follow:** the material-picker resume round-trip in `add-addition.ts` / `material-picker.ts`.
**Verification:** "log 10.5 Brix on T4" (2 lots) → 2-option picker → tap 2024-RRR-1-PN → confirm-card →
panel on that lot (`runAsTenant` read-back). Spot-check one sibling (e.g. `record_tasting_note`) shows
the same picker.

### Unit 3: Picker prompt guidance + curve-continuity default + goldens

**[Council 2026-07-12] The blend nudge is REMOVED** (both models: nudging a compliance/cost/lineage-
altering blend to log a routine reading is product-wrong). No `blend_lots` prompt bullet, no blend golden.

**Goal:** Make the picker land well: the assistant presents it cleanly on a multi-lot vessel, and the
picker defaults to / highlights the lot the tank's most recent reading used, so a co-fermented tank's
per-lot curve does not fragment across taps.
**Files:** `src/lib/assistant/prompt.ts` (a concise picker bullet), `src/lib/assistant/scope.ts` /
`resolve.ts` (order options so the last-used lot is first / flagged), `test/evals/assistant-fleet.golden.ts`
and/or `test/evals/assistant-write-tools.golden.ts`.
**Approach:** Prompt bullet: on a multi-lot vessel, present the lot picker and ask which lot was
SAMPLED (provenance framing, per Codex — the reading is a real per-lot fact, not a vessel abstraction).
Compute the "last-used lot" for the vessel (most recent `AnalysisPanel` for a resident lot) and surface
it first / marked in the options. Goldens: multi-lot measurement → choice path; keep the block-vs-lot
Brix goldens (PR #147) intact. NO golden that asserts an auto-blend.
**Tests:** `test/evals/*.golden.ts` structural eval (CI) validates arg schemas; optional gated LLM eval
(`ASSISTANT_EVAL=1 npm run eval:assistant`) confirms the picker routing.
**Depends on:** Unit 2
**Patterns to follow:** the Brix routing bullet + goldens added in PR #147.
**Verification:** `npm run eval:assistant` structural pass; gated LLM run shows the picker routing; the
last-used lot appears first in a two-reading sequence on the same tank.

### Unit 4: Regression + display sanity pass

**Goal:** Prove no vessel-scoped surface regressed and the picker path reads back correctly.
**Files:** none (verification only); small `runAsTenant` read-back script under `scripts/` if useful (QA-prefixed).
**Approach:** Confirm the single-lot capture, sample-results attach, vessel History feed, and `/bulk`
trends modal are unchanged (option c writes exactly one panel per reading, so no duplication — this is
the key advantage over option a). Exercise on Demo Winery only.
**Tests:** `npm run verify:chemistry`; manual browser check of `/bulk` trends + vessel History for T4.
**Depends on:** Unit 3
**Verification:** `verify:chemistry` green; History/trends show one row per recorded reading.

## Picker UX & Accessibility Spec (design review 2026-07-12)

The lot picker reuses the existing choice card in `AssistantChat.tsx:1070-1099` (token-compliant:
`var(--text-body)` label + `var(--text-body-sm)`/`--text-muted` sublabel, `--positive` chosen state,
locked/disabled at 0.5 opacity). Reuse it; specify the content and close two a11y/state gaps.

- **Prompt copy (provenance framing, per Codex):** "Which lot did you sample?" — NOT "which lot is
  this for?". The reading is a real per-lot fact; the copy must make the winemaker assert what they
  physically sampled, not pick arbitrarily.
- **Option hierarchy — label + sublabel:** `label = lot.code` (e.g. `2024-RRR-1-PN`); `sublabel =
  "{variety} · {block/vineyard} · {volume} L"` (e.g. `Pinot Noir · RRR Block 1 · 5,800 L`). **Volume is
  the load-bearing differentiator** (5,800 L vs 2,300 L) — always include it; it's how the winemaker
  tells co-resident lots apart at a glance. Two lots CAN share a code, so never rely on code alone.
- **Ordering:** the lot used by the tank's most recent reading is FIRST and tagged (append `· last
  reading` to its sublabel), so a co-ferment's curve stays on one lot across days (Unit 3).
- **Empty vessel:** structured message, not a raw throw — "Tank T4 is empty — there's no wine to
  record a reading against." (returned from the `empty` branch).
- **Stale tap (council):** if the chosen lot left the tank between render and tap, `resolve-choice`
  revalidates and the user sees a brief line + a fresh picker: "That lot just left T4 — here's what's
  in it now." Never a silent write to a lot no longer resident.
- **Touch target (cellar-floor a11y):** the choice `<button>` must be **min-height 44px** (currently
  `padding: var(--space-2) var(--space-3)` alone can fall short on a label-only option). This is a fix
  in the SHARED choice component, so it improves every assistant picker — small, low-risk, in scope.
- **Screen reader:** add `aria-pressed={isChosen}` to the option button (the `✓` + color are otherwise
  the only chosen-state signal). Keyboard focus already works (`<button>`); rely on the token focus ring.

## Test Strategy

**Unit tests:** node-env vitest over the pure resolve/choice logic (repo has no jsdom/RTL — assistant
UI is manual-QA-only; test pure logic only).
**Integration/eval:** `test/evals/*.golden.ts` structural eval (CI) + opt-in gated LLM eval for routing.
**Domain proof:** `npm run verify:chemistry` before and after (the fence's chemistry domain gate).
**Manual verification (Demo Winery only):** log a Brix reading on a 2-lot tank → picker appears →
tap a lot → panel lands on that lot (read back via `runAsTenant`); then "these are one must, combine
them" → blend proposal. Confirm vessel History + `/bulk` trends show no duplicate rows.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Return-type change ripples to 11 callers (2 unable to render a picker) | ~~MED~~→LOW | HIGH | **Resolved by eng review:** add a NEW `resolveLotTargetOrChoice` variant; leave the throwing `resolveLotTarget` untouched. Characterization test proves existing callers unchanged (Unit 1). |
| Shared-resolver refactor accidentally changes `resolveLotTarget` behavior | LOW | MED | Extract-first (make-change-easy), snapshot/characterization test on `resolveLotTarget` before adding the choice wrapper; refactor must be provably inert. |
| Blend nudge auto-invokes a heavy ledger op mid-ferment | LOW | HIGH | Nudge is informational only; `blend_lots` stays confirm-before-write; no golden asserts auto-blend (Unit 3). |
| Scope creep into option (b)/schema | LOW | HIGH | Explicitly out of scope; option (c) needs no schema and stays fence-eligible. Any schema idea → new `/decision` first. |
| Blend nudge misfires (suggests blending when lots are legitimately separate) | MED | LOW | Nudge only when the user frames them as one must; default remains the per-lot picker. Flagged for design review. |
| Gated LLM eval flakiness | LOW | LOW | Structural eval is the CI gate; LLM eval is advisory (as in PR #147). |

## Success Criteria

- [x] On a multi-lot tank, a measurement request shows a clickable lot picker (no text dead-end) — `resolveLotTargetOrChoice`, wired to all six vessel-selection tools.
- [x] Tapping a lot records exactly ONE `AnalysisPanel` on that lot (VISION D2 intact) — write path unchanged; verify:chemistry green.
- [x] Blend nudge REMOVED (council). Curve-continuity instead: picker floats the tank's last-read lot to the top, tagged "last reading".
- [x] Single-lot capture, sample-results, vessel History, and `/bulk` trends unchanged — `npm run verify:chemistry` 17/17 green (no duplicate rows; option (c) writes one panel per reading).
- [x] `npm run verify:chemistry` green; goldens structural eval green (146 passed).
- [x] No `prisma/schema.prisma` / migration changes.
- [x] `resolveLotTarget` behavior preserved (same throw messages via the shared `resolveLotCandidates`); all six callers now on the picker (`resolveOpenSample` bubbles the choice through `manage_sample` + `record_sample_results`).

## What Already Exists (reuse, don't rebuild)

- **The entire picker mechanism** — `resolveOneOrChoice` + `signResume`/`resume` tokens
  (`tools/resolve.ts:29-52`), the `ChoiceRequest`/`ChoiceOption`/`asChoice` event shapes
  (`assistant-events.ts:51-115`), and the run-loop rendering (`run.ts:130-147`). Battle-tested by the
  material picker (`tools/material-picker.ts`, `add-addition.ts`). Unit 1 reuses this wholesale.
- **Vessel→lot resolution** — `resolveVesselContents` (`scope.ts:177-196`) already returns the full
  `{id, code}` list per resident lot on a blend. The picker options are essentially free.
- **The write path** — `recordMeasurementsCore` + `insertPanelTx` (`chemistry/measurements.ts:73-161`)
  is unchanged; option (c) only changes how the lot is *chosen*.
- **Blend primitive** — `blend_lots`/`blendLotsCore` already exists for the "one must" path; the nudge
  points at it, it is not rebuilt.

## NOT in Scope (considered, deferred)

- **Option (b) combined-must grouping table** — net-new tenant table, full Phase-12 tenancy checklist +
  RLS + verify case, resolver + ledger changes, and it contradicts VISION D2. Needs its own `/decision`.
- **Option (a) fan-out to N per-lot panels** — duplicate vessel-scoped rows, N idempotency keys, and
  "measure part of a blend" semantics. Parked unless product explicitly wants that.
- **Fan-out to all co-resident lots (option a)** — escalated to its own `/decision` (schema column +
  Phase-4-precedent tension); NOT in this plan.
- **Upstream fix** — making the crush/destem intake create one must lot so co-fermented tanks aren't
  multi-lot in the first place. Bigger reframe; a future `/office-hours` or `/plan`. (The 5 sibling
  tools that were briefly deferred are now IN scope — Unit 2 — per the sibling-scope decision.)
- **Changing the WO NL-authoring path** (`work-orders/nl-resolve.ts`) — it isn't in the chat loop and
  can't render a picker; it keeps throwing. Correct as-is.
- **`prisma/schema.prisma` / migrations** — none needed for option (c).

## ENG REVIEW REPORT (2026-07-12)

Reviewed for: `resolveLotTarget` return-type blast radius, whether option (c) needs schema, test/verify
coverage, under-scoping.

- **Architecture (1 load-bearing finding):** the planned return-type change to `resolveLotTarget` breaks
  all **11 callers across 9 files**, 2 of which (`work-orders/nl-resolve.ts`) run outside the chat loop
  and cannot render a picker. **Resolved:** add a parallel `resolveLotTargetOrChoice` variant; leave the
  throwing function untouched (Unit 1 rewritten, Key Decisions flipped, blast-radius map added).
- **Schema:** confirmed option (c) needs **no** schema change — picker infra + write path already exist.
  Stays inside the widened auto-fix fence (`src/lib/assistant` + `src/lib/chemistry`), no migration,
  no brain-context-hook governance.
- **Code quality:** flagged DRY risk in Unit 1 (two resolvers must share one resolution helper; extract-
  first, characterization-test the inert refactor).
- **Tests:** added a resume round-trip test (Unit 2) and a `resolveLotTarget` characterization test
  (Unit 1); domain proof `verify:chemistry` before/after; goldens structural (CI) + opt-in LLM eval.
- **Under-scoping:** the "handful of callers" claim was wrong (11); siblings explicitly deferred as a
  fast-follow with the variant built to serve them.
- **Design hand-off:** the blend nudge is a heavy ledger op — hardened to informational/confirm-only;
  whether to nudge at all is flagged for the design review.

**VERDICT:** ENG CLEARED after hardening. No schema, no migration, minimal diff, D2 intact. One open
UX question (blend-nudge presence) deferred to `/plan-design-review`. Next: `/council` (outside voice),
then `/plan-design-review`.

## COUNCIL REVIEW (2026-07-12) — Codex gpt-5.4 + Gemini 3.1-pro

Both reviewers converged hard and surfaced a domain issue the eng review missed. Full synthesis in
`council-feedback.md`.

**Cross-model CONSENSUS (applied to this plan):**
1. **Drop the blend nudge.** Unanimous. Codex: "ship the picker, drop the nudge." Gemini: "product
   malpractice — blend alters cost basis / TTB / grower contracts; nuke it." → Unit 3 blend-nudge is
   REMOVED; replaced with curve-continuity (default/highlight the lot from the tank's most recent reading).
2. **Harden the resume path to full-write standard** (Codex). The tap must return the normal
   confirm-card (NOT auto-write). The signed `resume` token must bind `tool + tenantId + user/session +
   vesselId + chosenLotId + hash(pending args)`, carry a TTL, revalidate the chosen lot against CURRENT
   vessel contents (stale → regenerate the picker), and preserve idempotency via the original
   `clientRequestId`. → Folded into Unit 2 + tests (expired token, wrong tenant/user/tool, stale/moved
   lot, emptied vessel, double-tap/replay, duplicate labels, "resume returns confirm-card not a write").
3. **Disambiguation sublabel** must be more than `code + volume` (two lots can share a code) — add
   grower/block/vintage/intake date. `empty` vessel → structured user-facing message, not a raw throw.
   → Folded into Unit 1.

**Cross-model TENSION — the load-bearing OPEN decision (author + eng review missed it):**
- **Forcing a per-reading lot pick SHREDS the fermentation curve.** On a co-fermented tank the crew
  treats as one must, picking Lot A Monday / Lot B Tuesday leaves neither lot with a continuous Brix
  curve, and always-pick-A leaves Lot B (2,300 L) with zero chemistry. Gemini: a tank sample physically
  applies to ALL liquid → **fan-out (option a)** is the domain-honest answer, and the duplicate-row
  objection is a display-dedup problem (a shared `vesselReadingGroupId`), not a data problem. Codex:
  the picker is only disambiguation UI for someone who already knows the lot — it is NOT a solution to
  "one must."
  → This **reopens the (a) vs (c) core decision** for the actual reported scenario. Resolving fan-out
  cleanly (grouped so vessel views show one row, every lot keeps its curve) likely needs a nullable
  `analysis_panel.vesselReadingGroupId` COLUMN — a schema change (light checklist, no RLS), which
  flips the plan's "no schema" advantage and requires human review. STATUS: **awaiting user decision.**
- **Upstream is the real fix** (both): establish "one must" at the first commingling event
  (crush/destem/transfer), not at measurement time. Already flagged out-of-scope; council reinforces it.
- **Sibling scope** (Gemini): shipping the picker on `record_measurement` only, while 5 sibling tools
  keep the text dead-end, is a disjointed UX. STATUS: **user decision** (minimal-diff vs consistency).

**VERDICT:** Consensus hardening applied. Two decisions escalated to the user: (1) the (a)-vs-(c) core
fork given the fermentation-curve finding; (2) sibling-tool scope. Design review next.

**User decisions (2026-07-12):** (1) ship (c) picker now + open a separate `/decision` for fan-out;
(2) all six vessel-selection tools this PR. Plan updated throughout.

## DESIGN REVIEW (2026-07-12)

UI scope: one clickable lot-picker card in the assistant chat, reusing the existing token-compliant
choice component (`AssistantChat.tsx:1070-1099`). No mockups needed (no net-new visual). DESIGN.md present.

- **Info architecture 6→9:** specified the option hierarchy (label = lot code; sublabel = variety ·
  block · **volume** — volume is the differentiator) and last-used-first ordering. See Picker UX Spec.
- **States 5→9:** empty-vessel message and stale-tap UX ("that lot just left T4 — here's what's in it
  now" + fresh picker) now specified, not left to the implementer.
- **Journey:** provenance copy hardened to "Which lot did you sample?" (honest per-lot attribution,
  not arbitrary pick). Two-tap flow (log → pick → confirm), last-used lot pre-positioned.
- **AI slop:** N/A — reuses existing component, tokens throughout, not centered, no card-grid.
- **Design system 8/10:** token-compliant already; watch sublabel wrap at 375px (keep it concise).
- **Responsive/a11y 5→9 (the real gap):** option `<button>` needs **min-height 44px** (cellar-floor
  touch target) + `aria-pressed={isChosen}` — fixed in the shared choice card, improving every picker.

**VERDICT:** DESIGN CLEARED. Picker UX + a11y spec added to the plan; all clear fixes applied (no open
UX decisions). Plan 058 is now eng + council + design hardened.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (not a product-direction change) |
| Codex Review | `/council` | Independent 2nd opinion | 1 | issues_found→folded | drop blend nudge; harden resume path; curve-fragmentation |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEARED | 1 load-bearing (11-caller blast radius) → fixed |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEARED | 6→9 arch, 5→9 states, 5→9 a11y (44px target) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **CROSS-MODEL:** Codex + Gemini agreed unanimously: kill the blend nudge; Gemini added the
  fermentation-curve blind spot (→ fan-out escalated to a `/decision`).
- **UNRESOLVED:** 0 (both user decisions made; all design fixes applied).
- **VERDICT:** ENG + DESIGN CLEARED, council folded. Ready to `/work` — plus a follow-up `/decision`
  for the fan-out data model.
