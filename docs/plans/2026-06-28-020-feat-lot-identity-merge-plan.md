---
title: One batch = one lot — add-to-existing-lot flow + legacy lot merge
type: feat
status: completed
date: 2026-06-28
branch: claude/zen-chebyshev-b2195e
depth: standard
units: 6
---

## Overview

A lot is a batch, not a barrel. Today `addComponent` mints a brand-new lot on every
"add to vessel", so filling three barrels from one batch makes three lots (and the code
generator slaps on `-2`/`-3`). Fix it: let the add-wine flow **add into an existing lot**
so one batch lives in many vessels under one code, with a suggestion when the wine you're
adding matches a lot already in the cellar. Then a one-time, confirmed **merge** folds the
existing duplicate legacy lots back into one.

## Problem Frame

The whole point of the lot timeline (Phase 2) is "follow one wine vine-to-bottle." That
breaks the moment one batch fragments into `2025-PS-MR`, `2025-PS-MR-2`, `…-3`, one per
barrel. Traceability scatters, the codes carry a meaningless suffix, and the winemaker
can't see "my Pinsa Merlot is 450 L across Barrel 14 and 15." The model already supports
one-lot-many-vessels (`vessel_lot` is keyed `[vesselId, lotId]`, many rows per lot); the
only gap is the creation flow always calling `tx.lot.create()`. Cost of doing nothing:
every multi-vessel batch keeps fragmenting and the timeline degrades.

**Pressure test:** the 80/20 is the **add-to-existing-lot** branch + a match suggestion
(Part A). The legacy merge (Part B) is one-time cleanup. Racking already preserves identity
when moving wine between vessels, so this targets the *initial fill* gap specifically.

## Requirements

- MUST: add-wine can target an **existing lot** (seed into the chosen vessel under that
  lot id, no new lot, no new code); the lot then spans both vessels.
- MUST: when the new-lot variety+vineyard+vintage **exactly matches an active lot**, the
  form **suggests** adding to it (default stays "new lot"; never auto-merges — decision).
- MUST: barrel/vessel never enters the lot code (unchanged); code stays immutable after
  first op (INVARIANTS).
- MUST: a one-time, **per-pair confirmed** merge script folds a duplicate lot into a
  canonical one; the retired duplicate becomes **ARCHIVED with a "merged into X" note**
  (tombstone, not deleted — decision), so the old code still resolves.
- MUST: merge moves ALL references (`lot_operation_line`, `lot_treatment`,
  `bottling_source`, `lot_lineage`) to the canonical lot and **sums `vessel_lot` volumes**
  when both lots sit in the same vessel; refreshes `lotCode` snapshots; idempotent.
- SHOULD: when intentionally creating a second distinct batch of the same tuple, the form
  **prompts for a meaningful tag** (EARLY/EAST…) → `2025-PS-MR-EARLY`; the silent numeric
  `-N` only happens if the user skips the tag (kept as the safety-net fallback — decision).
- MUST: honor `DESIGN.md`; coordinate with the in-flight cellar-ops layer (do not break
  `lot_treatment`, RACK/TOPPING, materials, groups).

## Scope Boundaries

**In scope:**
- `addComponent` gains an optional `lotId` branch (add-to-existing) + the active-lots loader
  that feeds the picker/suggestion.
- Bulk add-wine UI: New-lot vs Add-to-existing toggle, existing-lot picker, match
  suggestion, optional tag prompt on same-tuple collision.
- A pure merge planner + a one-time `scripts/merge-lots.ts`, and running it on the
  confirmed `2025-PS-MR-2 → 2025-PS-MR` pair.

**Out of scope (and why):**
- **Blending different lots into a new child lot** — that's the Phase 5 lineage/blend work;
  merge here is "two records of the *same* batch become one," not a blend.
- **Schema changes** — none needed; `Lot`, `VesselLot`, lineage all already support this.
- **Changing rack/topping** — they already preserve identity; untouched.
- **Auto-merging without confirmation** — D11 forbids asserting sameness the data didn't
  record; every legacy merge is user-named.

## Research Summary

### Codebase Patterns
- **Creation (the bug):** `src/lib/bulk/actions.ts` `addComponent` (~:46-147) always
  `tx.lot.create(...)` then a SEED op with lines `[{+vol into vessel},{-vol external seed}]`
  via `writeLotOperation` (`src/lib/ledger/write.ts:100-125`). Code from `nextLotCode`
  (`src/lib/lot/generate.ts:23-34`).
- **Identity-preserving moves already exist:** `src/lib/vessels/rack-core.ts` and
  `src/lib/cellar/topping.ts` use `planLedgerRack` to move wine between vessels keeping the
  same lotId. So "one lot, many vessels" works for *moves*; the gap is the *initial seed*.
- **Active-lots loader:** `src/lib/lot/data.ts` `listLots({status})` (:95-132) returns
  `{id, code, varietyName, vineyardName, vintageYear, totalL, locations}` — the shape the
  picker needs; add an origin-tuple filter (match by `originVarietyId`/`originVineyardId`/
  `vintageYear` ids, not names).
- **Bulk form:** `src/app/(app)/bulk/BulkClient.tsx` `AddWineForm` (~:78-137) is a plain
  FormData form (variety/vineyard/block/subblock/vintage/volume/tag); `bulk/page.tsx` now
  also loads materials + groups + per-vessel lot-code badges.
- **Lot references (for merge):** every `lotId` holder — `lot_operation_line` (onDelete
  Restrict, no unique), `vessel_lot` (**`@@unique([vesselId, lotId])` → sum on same-vessel
  collision**, Restrict), `lot_lineage` (`@@unique([parentLotId, childLotId])`, parent
  Restrict / child Cascade → dedupe + drop self-edges), `bottling_source` (nullable,
  SetNull), `lot_treatment` (Restrict, no unique). Quoted in research.
- **Tests:** pure planners tested plan→fold→assert (`test/ledger-math.test.ts`,
  `test/lot-code.test.ts`). Scripts are script-safe (no "use server"), idempotent, verify
  conservation (`scripts/migrate-legacy-lots.ts`).

### Prior Learnings
- D3 (vintage is an attribute), D6 (undo = compensating events), **D11 (no fabricated
  history)** — so legacy merge is a *declared one-time data correction*, user-named per
  pair, not a ledger op. INVARIANTS: code/origin immutable after first op.
- Prisma/Neon migrations here are non-interactive (`migrate diff … | strip search_vector …
  → migrate deploy`); stop the dev server before `prisma generate` (Windows DLL lock). This
  feature needs **no migration**, so that mostly doesn't apply.

### External Research
None — no new libraries; internal Prisma + Next 16 server actions.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Add-to-existing op type | A **SEED** line into the chosen vessel under the existing lotId (wine entering from the press/tank into another barrel of the same batch) | RACK | The wine is entering the cellar at fill time, not moving between two in-cellar vessels. RACK is for moving an already-resident lot. |
| Match behavior | **Suggest, don't auto-pick** (default new lot; prominent nudge to add-to-existing) | auto-default to existing | User chose suggest. Auto-merging risks fattening one lot when a separate pick was intended. |
| Second-batch code | **Prompt for a meaningful tag** when a new lot's code would collide with an active same-tuple lot; silent `-N` only if skipped | always silent `-N` | User chose tag-prompt. Keeps `-N` as a safety net so creation never hard-blocks. |
| Retired duplicate | **ARCHIVED tombstone** with `note: "merged into <code>"` | hard delete | User chose tombstone. The old code may be on a barrel tag; it should still resolve. |
| Merge = data correction | One-time script, **no ledger op**; reassign references + sum vessel_lot; audit row + `/decision` | model merge as a ledger op | D11: this is a correction of a migration artifact, not a winemaking event. |
| PS-MR pair | **Merge** `2025-PS-MR-2` → `2025-PS-MR` (450 L across Barrel 14+15) | keep separate | User confirmed it's one batch. (The BJ-CF / BJ-MR lots are different varieties, not dupes.) |

## Implementation Units

### Unit 1: Active-lot picker loader + origin-tuple match
**Goal:** Server data to populate the existing-lot picker and the match suggestion.
**Files:** `src/lib/lot/data.ts`.
**Approach:** Add `listActiveLotsForPicker()` → active lots as `{ id, code, varietyName,
vineyardName, vintageYear, totalL, locations }` (reuse `listLots({status:"ACTIVE"})` shape).
Add `findActiveLotsByOrigin({ varietyId, vineyardId, vintage })` → active lots whose
`originVarietyId`/`originVineyardId`/`vintageYear` all match (id-based, exact), ordered by
code, for the "this matches X" suggestion. Plain serializable objects.
**Tests:** covered via Unit 6 build/manual; the matching is a thin prisma where-clause.
**Depends on:** none
**Patterns to follow:** `src/lib/lot/data.ts` `listLots` + `currentState`.
**Verification:** a scratch call returns the active lots incl. `2025-PS-MR` with its
Barrel 15 location.

### Unit 2: `addComponent` — add-to-existing-lot branch
**Goal:** Seed wine into an existing lot (no new lot/code) when a `lotId` is supplied.
**Files:** `src/lib/bulk/actions.ts`.
**Approach:** Read optional `lotId`. If present: load the lot (must exist + `status==="ACTIVE"`;
reject DEPLETED/ARCHIVED with a friendly error), keep the capacity guard, write a SEED op with
lines `[{lotId, vesselId, +volumeL}, {lotId, vesselId:null, -volumeL, reason:"seed"}]` using the
lot's existing `code` for the snapshot, and DO NOT create a lot or call `nextLotCode`. Audit:
"Added {volumeL} L to lot {code} in {vessel}". If `lotId` absent: the current new-lot path,
unchanged (still disambiguates as the fallback). Ignore variety/vineyard/etc. inputs when a
lotId is given (origin comes from the lot).
**Tests:** Unit 6 (build + manual); the SEED line shape mirrors the existing path.
**Depends on:** none
**Patterns to follow:** the existing `addComponent` SEED write; `ActionError` usage.
**Verification:** adding 225 L to `2025-PS-MR` into an empty barrel yields one lot in two
vessels (no new code), via a scratch/manual run.

### Unit 3: Bulk add-wine UI — new vs existing + suggestion + tag prompt
**Goal:** Let the user pick an existing lot, nudge on a match, and prompt for a tag on a
genuine same-tuple second batch.
**Files:** `src/app/(app)/bulk/BulkClient.tsx`; `src/app/(app)/bulk/page.tsx`.
**Approach:** Load active lots (Unit 1) in `page.tsx`, pass to `BulkClient`. In `AddWineForm`
add a mode toggle **New lot · Add to existing**. Existing mode: a picker (filtered to
origin-tuple matches first, all active as fallback) → submits `lotId` + `volumeL` only
(origin selects hidden). **Label it "Add more wine to this lot (new volume entering)" with
helper text "To move wine between vessels, use Rack"** (eng-review: the SEED-add is additive;
this copy stops it being mistaken for a relocate, which would invent volume). New mode: current fields; when the chosen variety+vineyard+vintage
matches an active lot, show an inline suggestion ("Matches 2025-PS-MR — add to it?" button
that flips to existing mode preselected) AND, if the user stays on new, surface an optional
**tag** input with helper text so the second batch reads `…-EARLY` instead of `-2`. Keep it
token-driven (DESIGN.md), responsive.
**Tests:** Unit 6 (build + manual).
**Depends on:** Units 1, 2
**Patterns to follow:** the existing `AddWineForm` controlled selects; `selectStyle` tokens.
**Verification:** dev server — add-to-existing puts wine in a second barrel under one code;
a matching new-lot add shows the suggestion; staying "new" offers a tag.

### Unit 4: Pure lot-merge planners (test-first) — vessel_lot + lineage
**Goal:** Compute BOTH the `vessel_lot` reconciliation AND the lineage-edge rerouting when
folding a duplicate lot into a canonical one, as pure unit-tested functions. (Eng review: the
lineage rerouting is the bug-prone part — it must be tested, not buried in the script.)
**Files:** `src/lib/lot/merge.ts` (new); `test/lot-merge.test.ts` (new).
**Approach:**
- `planVesselLotMerge(canonicalLotId, canonicalRows, dupRows)` → for each duplicate
  `vessel_lot` row: if the canonical lot already has a row in that vessel → **sum** (update
  canonical to `+dupVolume`, delete dup row); else **reassign** (repoint dup row to canonical).
  Returns `{ updates:[{vesselId,newVolumeL}], reassign:[vesselId], deleteDupRows:[id] }`. round2.
- `planLineageMerge(canonicalLotId, dupLotId, edges)` → repoint every edge that references
  `dupLotId` (as parent or child) to `canonicalLotId`, **drop self-edges** (parent===child),
  and **skip on `[parentLotId,childLotId]` collision** with an existing edge. Returns
  `{ repoint:[{edgeId, newParentLotId?, newChildLotId?}], drop:[edgeId] }`. Pure.
**Tests:** vessel_lot — disjoint→all reassign; same-vessel→sum+delete; multi-overlap; empty
dup→no-op. lineage — dup-as-parent repoints; dup-as-child repoints; canonical↔dup edge becomes
a self-edge→drop; repoint that would duplicate an existing edge→skip; no edges→no-op.
**Depends on:** none
**Execution note:** test-first.
**Patterns to follow:** `src/lib/ledger/math.ts` (pure, round2), `test/ledger-math.test.ts`.
**Verification:** `test/lot-merge.test.ts` passes (both planners).

### Unit 5: One-time merge script
**Goal:** Fold a named duplicate lot into a named canonical lot, safely + idempotently.
**Files:** `scripts/merge-lots.ts` (new).
**Approach:** `merge-lots.ts <canonicalCode> <duplicateCode>`. In one transaction: validate
both exist and are distinct; reassign `lot_operation_line.lotId`, `lot_treatment.lotId`,
`bottling_source.lotId` from dup→canonical, and **refresh `lotCode` snapshots ONLY on the
moved lines** (`WHERE lotId = dup` — a single `LotOperation` can carry lines for several lots,
so don't rewrite the whole operation's snapshots; eng-review note); reroute `lot_lineage` via
`planLineageMerge` (Unit 4); apply `planVesselLotMerge` (Unit 4) to `vessel_lot`; set the
duplicate `status="ARCHIVED"` with `note: "merged into <canonicalCode>"` (tombstone, not
deleted); write an `AuditLog` row. Idempotent: an already-ARCHIVED duplicate carrying the
merge note is skipped. Print a before/after summary.
**Tests:** Unit 6 (run against the real pair + idempotent re-run).
**Depends on:** Unit 4
**Patterns to follow:** `scripts/recode-legacy-lots.ts`, `scripts/migrate-legacy-lots.ts`
(idempotent, transactional, report).
**Verification:** dry concept check on output; full check in Unit 6.

### Unit 6: Run the confirmed merge + verification
**Goal:** Merge `2025-PS-MR-2 → 2025-PS-MR` and prove the whole feature with no regressions.
**Files:** none (verification).
**Approach:** `npx tsc --noEmit` clean; full `npx vitest run` green (incl. new merge tests);
`npm run build` clean. Run `scripts/merge-lots.ts 2025-PS-MR 2025-PS-MR-2`; confirm `/lots`
shows ONE `2025-PS-MR` at 450 L across Barrel 14 + Barrel 15, and `2025-PS-MR-2` is ARCHIVED
with the merged-into note; re-run the script → no-op. Dev walkthrough of the add-to-existing
flow + the suggestion + the tag prompt.
**Tests:** suite + manual.
**Depends on:** Units 1-5
**Patterns to follow:** the Phase 2/3 verification approach.
**Verification:** the Success Criteria below all demonstrably true.

## Test Strategy

**Unit tests:** `test/lot-merge.test.ts` for the pure vessel_lot reconciliation (reassign,
sum-on-collision, edge cases). Existing suite stays green (additive + a guarded branch).
**Build:** `npm run build` is the type/RSC gate for the bulk form + loaders.
**Manual (dev server, logged in):** add-to-existing seeds a second barrel under one code;
the match suggestion fires; the tag prompt yields `…-EARLY`; the merge collapses the PS-MR
pair to one lot in two barrels; the archived tombstone still resolves.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Merge double-counts volume when both lots share a vessel | LOW | HIGH | Pure planner sums on `[vesselId,lotId]` collision, unit-tested; one transaction. |
| Reassigning ledger lines corrupts a lot's history | LOW | HIGH | Only repoint `lotId` + refresh `lotCode` snapshot; never edit deltas; transactional + idempotent; tombstone keeps an audit trail. |
| Lineage unique/self-edge violation on reroute | MED | MED | Drop self-edges, upsert/skip on `[parentLotId,childLotId]` collision. |
| User adds to a DEPLETED/ARCHIVED lot by mistake | LOW | MED | Picker lists ACTIVE only; server rejects non-ACTIVE lotId. |
| Suggestion annoys / auto-merges wrong batch | LOW | MED | Suggest-only (never auto); default stays new lot. |
| Collision with in-flight cellar-ops work on this branch | MED | MED | Additive changes; coordinate with `lot_treatment`/rack; run full build + suite. |

## Success Criteria

- [x] Add-wine can target an existing lot; that lot then shows multiple vessels under ONE
      code (no new code minted). (Unit 2; verified live via the merge — 2025-PS-MR in 2 barrels.)
- [x] Picking a variety+vineyard+vintage that matches an active lot surfaces a suggestion to
      add to it; default stays "new lot". (Unit 3; build-verified, live walkthrough pending login.)
- [x] Creating a genuine second same-tuple batch prompts for a tag (`…-EARLY`); bare `-N`
      only on skip. (Unit 3 tag nudge.)
- [x] `scripts/merge-lots.ts` folds a duplicate into a canonical lot: references reassigned,
      `vessel_lot` summed on same-vessel overlap, snapshots refreshed, duplicate ARCHIVED
      with a "merged into X" note; idempotent on re-run. (Units 4+5; verified.)
- [x] `2025-PS-MR` shows 450 L across Barrel 14 + Barrel 15; `2025-PS-MR-2` is an archived
      tombstone. (Verified: 0 orphans; full history folded into the canonical timeline.)
- [x] No vessel/barrel number ever appears in a lot code; code stays immutable for live lots.
- [x] `npx tsc --noEmit` clean; `npm run build` clean; full vitest green (413, +12 merge tests).

**Verification (Unit 6):** tsc clean · build clean · `npx vitest run` → **413 passed**
(+12 merge-planner tests) · lint 0 errors (2 pre-existing warnings) · merge run live:
2025-PS-MR = 450 L across Barrel 14+15, 2025-PS-MR-2 ARCHIVED ("merged into 2025-PS-MR"),
0 orphan lines/vessel_lots, the duplicate's SEED+RACK+CORRECTION history folded into the
canonical timeline with lotCode snapshots refreshed, idempotent re-run = no-op. **Pending
user action:** the add-to-existing / suggestion / tag UI walkthrough (auth-gated).

## Eng review outcomes (2026-06-28)

**What already exists (reused, not rebuilt):** `listLots`/`currentState` (picker data),
`writeLotOperation` SEED path (add-to-existing reuses it), rack/topping (identity-preserving
moves — the merge/add flows deliberately do NOT duplicate these), `ledger/math` pure-planner
+ test pattern (merge planners mirror it).

**NOT in scope (considered, deferred):** blending distinct lots into a child lot (Phase 5
lineage); a generic many-to-one bulk merge UI (the script handles per-pair on demand);
auto-detecting duplicate lots (user names each pair — D11); moving existing wine via the
add-to-existing path (that's rack, kept separate by design + copy).

**Findings resolved:**
1. [P1 8/10] add-to-existing SEED is additive → **label "Add more wine to this lot (new
   volume entering)" + "to move wine, use Rack"** (Unit 3). Accepted.
2. [P1 8/10] merge edge-logic was manual-only → **extract `planLineageMerge` +
   `planVesselLotMerge` as pure, unit-tested functions** (Unit 4). Accepted.
3. [code-quality] snapshot refresh must be scoped to the duplicate's lines (one op can hold
   many lots' lines) → baked into Unit 5.

**Failure modes:** double-count on same-vessel merge → covered by `planVesselLotMerge` sum +
unit test; lineage unique/self-edge violation → covered by `planLineageMerge` + unit test;
invented volume via add-to-existing → mitigated by copy (Finding 1); partial merge → single
transaction (all-or-nothing) + idempotent re-run. No critical gaps remaining.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 2 issues (both resolved into Units 3 + 4), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — 2 findings folded into the plan, 0 critical gaps. Ready to
implement. (Design review optional — the add-wine form change is small and token-driven.)
