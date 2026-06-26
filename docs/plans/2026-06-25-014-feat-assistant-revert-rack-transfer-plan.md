---
title: Revert / Undo a Wine Rack (vessel transfer) from the assistant
type: feat
status: draft
date: 2026-06-25
branch: feat/assistant-voice-mode
depth: standard
units: 7
---

## Overview

Make a rack undoable. After "I racked barrel 14 to barrel 16," the user can say "revert that" (or "undo the last rack of barrel 16") and the assistant reverses it: the moved wine goes back from the destination to the source, restoring the pre-rack state, behind the same confirm-before-write card. Reverts are recorded as their own transfer so history stays honest and a rack can't be double-reverted.

## Problem Frame

We just shipped racking (plan 013), but a rack is one-way: the user racked Barrel 14 → Barrel 16, asked to revert, and the assistant could only offer a manual "rack it back" workaround. For a system of record, an action you can't cleanly undo is a liability: the user fat-fingers a rack, or racks the wrong barrel, and now the cellar data is wrong with no first-class fix. The user said it plainly: transfers "should be revertable." Cost of doing nothing: every mis-rack becomes a manual reverse-rack the user has to reason about (which vessel, how much, which lots), and the audit trail shows two unrelated racks instead of "this was undone."

## Requirements

- MUST: An assistant **write** tool (`revert_transfer`, confirm-before-apply) that reverses a recorded rack.
- MUST: Identify the target rack from natural language — "revert that" / "the last rack" (most recent revertable), or scoped to a vessel ("the last rack of barrel 16").
- MUST: Reverse by moving the rack's recorded lots back from the destination to the source, restoring pre-rack volumes (minus any original lees loss, which can't be recreated).
- MUST: Validate the destination still holds enough of the moved lots; if it was bottled / blended / racked onward, refuse with a clear message naming what's missing.
- MUST: Validate the source has capacity to take the wine back.
- MUST: Prevent double-revert — a reverted rack can't be reverted again, and a reversal itself isn't revertable (tell the user to just rack it again).
- MUST: Record the reversal as its own `VesselTransfer` (from = original destination, to = original source) linked to the original, mark the original `revertedAt`, write the audit log — all in one transaction.
- MUST: Reuse the existing confirm/commit/nonce/audit flow.
- SHOULD: `query_transfers` shows whether a rack has been reverted.
- NICE: "revert the rack from yesterday" style date hints (not required; most-recent + vessel scoping covers the real case).

## Scope Boundaries

**In scope:**
- Schema: `revertedAt` + a self-link (`revertsId`) on `VesselTransfer`; migration.
- Enrich the rack `components` snapshot with `varietyId`/`vineyardId` (needed to target lots on revert); keep names for display. Name-based fallback for pre-existing transfers whose snapshot lacks ids.
- Pure `planRevert` math (+ tests); `revertTransfer` server action; a "find the revertable transfer" resolver.
- `revert_transfer` tool + committer; registry/commit/prompt/UI wiring.

**Out of scope:**
- Reverting bottling runs or inventory moves (only vessel transfers).
- Partial reverts (revert moves the whole recorded transfer, not part of it).
- Recreating lees loss (physically impossible; documented).
- A transfers/racking history UI (the data supports it later).
- Reverting an old rack when the wine has moved on — that errors rather than guessing.

## Research Summary

### Codebase Patterns
- **Transfer model + action:** `prisma/schema.prisma` `VesselTransfer` (from/to vessel ids + code snapshots, `volumeL` drawn, `lossL`, `components` JSON, `rackedAt`, actor). `src/lib/vessels/transfer.ts` `transferWine` — `action()`-wrapped, validates, `prisma.$transaction`: deduct source components (delete at 0) → upsert-increment destination on `@@unique([vesselId,varietyId,vineyardId,vintage])` → create `VesselTransfer` → `writeAudit(action:"STOCK_MOVEMENT", entityType:"VesselTransfer")`. The `components` snapshot is built from `plan.additions` and currently stores `{ varietyName, vineyardName, vintage, volumeL }` (the delivered breakdown, loss already excluded).
- **Pure math:** `src/lib/vessels/transfer-math.ts` `planTransfer` reuses `computeProportionalDraw`/`round2` from `src/lib/bottling/draw.ts`. Tested in `test/vessel-transfer-math.test.ts`.
- **Assistant write tool:** `src/lib/assistant/tools/rack-wine.ts` — `run()` resolves vessels (`resolveVessel` in `scope.ts`), previews, `signProposal("rack_wine", args)`; `commitRackWine` calls `transferWine`. Confirm/commit in `confirm.ts` + `commit.ts` (COMMITTERS map, single-use `AssistantConfirmation` nonce). Read tool `query-transfers.ts`.
- **Audit:** `writeAudit(tx, {...actor, action, entityType, entityId, summary})` inside the transaction (`src/lib/audit.ts`).

### Prior Learnings
- The `components` snapshot stores **names, not ids** — the gap this plan must close to target lots on revert. Enrich going forward; name-fallback for the existing row.
- Loss is already excluded from the snapshot (snapshot sum == delivered/`addedL`), so "restore delivered volume" falls out for free — revert just moves the snapshot back.
- Recurring ops note: the dev server locks the Prisma engine on Windows; stop it before `db:generate`/migrate. The generated-`tsvector` column makes Prisma emit a stray `ALTER ... DROP DEFAULT` in new migrations — strip that line.
- Scoping: vessels aren't vineyard-scoped; `revert_transfer` is gated like `rack_wine` (any ready user) unless we decide admin-only later.

### External Research
None — internal patterns only.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Lossy revert | Allow; restore the **delivered** volume (snapshot sum), source ends short by the original loss | Block reverting lossy racks | User chose it. Honest: you can't un-lose lees. Snapshot already = delivered, so it's natural. |
| Which racks | **Any** rack that isn't already reverted and isn't itself a reversal, **if** the destination still holds the moved lots | Most-recent-only | User chose flexibility. Availability check keeps it safe. |
| Identify lots on revert | Enrich snapshot with `varietyId`/`vineyardId` going forward; name→id fallback for legacy rows | Reuse `transferWine` proportional draw from dest | Proportional draw would grab the wrong wine from a blended destination. Targeting the exact recorded lots is correct. |
| Reversal record | New `VesselTransfer` (from=origDest, to=origSource) with `revertsId` → original; set original `revertedAt` | Just set a flag / mutate in place | Symmetric, queryable history; double-revert prevention via `revertedAt`/`revertsId`. |
| Target selection (tool) | Most-recent revertable transfer, optionally scoped to a vessel | Require an explicit id (model has none) | Matches "revert that" and "revert the last rack of barrel 16". |
| Reuse vs new action | New `revertTransfer` action (dedicated lot-targeting logic) | Extend `transferWine` | Revert semantics (specific lots, availability check, linkage) differ enough to warrant its own action. |

## Implementation Units

### Unit 1: Schema — revert tracking on VesselTransfer

**Goal:** Track that a transfer was reverted and link the reversal to it.
**Files:** `prisma/schema.prisma`
**Approach:** Add `revertedAt DateTime?` and `revertsId String?` to `VesselTransfer`, with a self-relation: `reverts VesselTransfer? @relation("TransferReversal", fields: [revertsId], references: [id], onDelete: SetNull)` and back-relation `reversedBy VesselTransfer[] @relation("TransferReversal")`. Add `@@index([revertsId])`. A row with `revertsId` set IS a reversal; a row with `revertedAt` set HAS BEEN reverted.
**Tests:** none (schema); validated by client generation.
**Depends on:** none
**Patterns to follow:** existing `VesselTransfer` block.
**Verification:** `npm run db:generate` clean; new fields/types present.

### Unit 2: Migration

**Goal:** Add the new columns + index.
**Files:** `prisma/migrations/<ts>_add_transfer_revert/migration.sql`
**Approach:** Generate (create-only), **strip any stray `ALTER TABLE "assistant_message" ... DROP DEFAULT` line** (known tsvector drift), apply with `prisma migrate deploy`. Neon `directUrl`.
**Tests:** none.
**Depends on:** Unit 1
**Patterns to follow:** prior migrations; the plan-013 migration cleanup note.
**Verification:** `migrate status` up to date; columns exist; FTS column still `GENERATED ALWAYS` (verify via information_schema).

### Unit 3: Enrich the rack snapshot with lot ids

**Goal:** Record `varietyId`/`vineyardId` in the transfer `components` snapshot so reverts can target exact lots.
**Files:** `src/lib/vessels/transfer.ts`
**Approach:** In `transferWine`, change the snapshot mapping to include `varietyId` and `vineyardId` alongside the existing `varietyName`/`vineyardName`/`vintage`/`volumeL`. No migration needed (JSON). Existing rows keep names only — handled by the fallback in Unit 5.
**Tests:** covered via the revert math/action tests (Units 4, 5) and existing rack tests.
**Depends on:** none (independent of 1-2)
**Patterns to follow:** the current snapshot build in `transfer.ts`.
**Verification:** A new rack writes a snapshot containing variety/vineyard ids (spot-check via `db:studio` or a query).

### Unit 4: Pure revert planning + tests

**Goal:** Decide, purely, which destination components to draw from and what to return to the source, with availability checks.
**Files:** `src/lib/vessels/transfer-math.ts`, `test/vessel-transfer-math.test.ts`
**Approach:** Add `planRevert(snapshotLots, destComponents)` where `snapshotLots = [{ varietyId, vineyardId, vintage, volumeL }]` and `destComponents = [{ id, varietyId, vineyardId, vintage, volumeL }]`. For each snapshot lot, find the matching dest component; if missing or `volumeL` short (beyond epsilon), collect a shortfall. Return `{ ok, shortfalls, deductions: [{id, deduct, remaining}], additions: [{varietyId, vineyardId, vintage, volumeL}], totalL }`. Use `round2`; exact arithmetic (no proportional split needed — volumes are explicit).
**Tests:** clean revert (dest has exactly the lots → full move back, dest lots emptied); blended dest (dest has extra wine → only the recorded lots move, extra untouched); shortfall (dest short on a lot → `ok:false` with the missing lot named); multi-lot.
**Depends on:** none
**Patterns to follow:** `planTransfer` structure; `test/vessel-transfer-math.test.ts`.
**Verification:** `npm run test` passes new cases.

### Unit 5: `revertTransfer` server action + transfer finder

**Goal:** Authoritative, transactional reversal + a resolver for "which transfer."
**Files:** `src/lib/vessels/transfer.ts`
**Approach:** `findRevertableTransfer({ vesselId? })` — most recent `VesselTransfer` with `revertedAt == null` AND `revertsId == null`, optionally filtered to `from/to == vesselId`; returns the row (or null). `revertTransfer({ transferId })` (`action()`-wrapped): load the original (+ from/to vessels + dest components); reject if already reverted, if it's a reversal, or if a vessel is missing (`fromVesselId`/`toVesselId` null). Resolve snapshot lots to ids — use snapshot ids when present, else look up variety/vineyard by name (legacy fallback; error if a name can't be resolved). Run `planRevert`; if `!ok`, throw naming the missing lots ("Barrel 16 no longer holds enough of that wine to revert — it may have been bottled, blended, or racked on."). Capacity-check the source (current + totalL ≤ capacity). In `prisma.$transaction`: decrement/delete dest components, upsert-increment source components, create the reversal `VesselTransfer` (from=origDest, to=origSource, `volumeL=totalL`, `lossL=0`, snapshot, `revertsId=original.id`, note), set `original.revertedAt = now`, `writeAudit`. Return `{ message, ... }`.
**Tests:** covered by Unit 4 math + manual DB verification (no DB-integration harness).
**Depends on:** Units 1, 3, 4
**Patterns to follow:** `transferWine` in the same file; `writeAudit` usage; `bulk/actions.ts` upsert.
**Verification:** Manually revert the existing Barrel 14 → 16 rack: Barrel 16 empties, Barrel 14 returns to 225 L, original marked reverted, a reversal row written.

### Unit 6: `revert_transfer` tool + committer + wiring

**Goal:** The assistant-facing undo.
**Files:** `src/lib/assistant/tools/revert-transfer.ts` (new), `src/lib/assistant/registry.ts`, `src/lib/assistant/commit.ts`, `src/lib/assistant/prompt.ts`
**Approach:** Tool input: `vessel?` (optional scope). `run()`: resolve `vesselId` via `resolveVessel` if given; `findRevertableTransfer`; if none, throw ("I don't see a rack to revert" + scope hint). Build a preview ("Revert the rack of 225 L Barrel 14 → Barrel 16 (Merlot 2025) from 2026-06-25: move 225 L back from Barrel 16 to Barrel 14."); `signProposal("revert_transfer", { transferId, ...labels })`. `commitRevertTransfer` calls `revertTransfer`. Register the tool in `registry.ts`, the committer in `commit.ts`, and update the prompt's Write line to mention reverting a rack. (Note the dependency: a write tool should not call `findRevertableTransfer` and then sign a transferId that could be reverted by a racing request — the commit re-validates `revertedAt`, so a double-submit fails safely.)
**Tests:** none (thin); covered by math + manual.
**Depends on:** Unit 5
**Patterns to follow:** `rack-wine.ts` (tool+committer), `registry.ts`, `commit.ts`, `prompt.ts`.
**Verification:** "revert that" after a rack shows a confirm card; confirming reverses it; a second "revert that" reports nothing to revert.

### Unit 7: query_transfers shows reverted state + UI label

**Goal:** Make reverts visible and label the tool.
**Files:** `src/lib/assistant/tools/query-transfers.ts`, `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:** In `query_transfers`, select `revertedAt` and `revertsId` and include a `reverted: boolean` (and mark reversal rows) in each result so the assistant can say "(reverted)". Add `revert_transfer: "Reverting the rack"` to `TOOL_LABELS`.
**Tests:** none.
**Depends on:** Units 1, 6
**Patterns to follow:** existing `query-transfers.ts` select; `TOOL_LABELS` map.
**Verification:** After a revert, "recent rackings" shows the original as reverted and the reversal entry.

## Test Strategy

**Unit (Vitest):** `planRevert` cases in `test/vessel-transfer-math.test.ts` — clean, blended-destination, shortfall, multi-lot. Existing 318 tests stay green.

**Integration:** none (no DB harness); `revertTransfer` verified manually against Neon.

**Manual end-to-end:**
1. Rack Barrel 14 → 16 (already done). "revert that" → confirm card → Barrel 16 empties, Barrel 14 back to 225 L; original marked reverted; reversal row present.
2. "revert that" again → "nothing to revert" (double-revert blocked).
3. Rack with loss, then revert → source returns the delivered volume (short by the loss); message says so.
4. Rack, then bottle/blend some of the destination, then revert → clear "can't revert, the wine has moved on" error.
5. Legacy transfer (names-only snapshot) reverts via name fallback.
6. `query_transfers` shows reverted state.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Legacy snapshot lacks lot ids → can't target lots | HIGH (1 existing row) | MED | Name→id fallback in `revertTransfer`; enrich snapshot going forward (Unit 3); clear error if a name can't resolve. |
| Destination wine moved on (bottled/blended/racked) → unfaithful revert | MED | HIGH | `planRevert` availability check; refuse with the specific missing lot, never guess. |
| Double-revert / racing confirm | LOW | MED | `revertedAt`/`revertsId` guards re-checked inside the commit transaction; single-use nonce. |
| Reverting re-overflows the source (it got refilled since) | LOW | MED | Source capacity check before the transaction (epsilon). |
| Float drift on volumes | LOW | MED | `round2` + explicit volumes (no proportional split in revert); unit tests. |
| Snapshot JSON shape change breaks `query_transfers` consumers | LOW | LOW | Additive fields only; UI ignores unknown keys. |

## Success Criteria

- [ ] "revert that" / "undo the last rack of barrel 16" reverses the rack behind a confirm card.
- [ ] Destination returns the moved lots to the source; pre-rack volumes restored (minus original loss).
- [ ] Reverting is refused with a clear reason when the wine has been bottled/blended/racked onward.
- [ ] A rack can't be double-reverted; reversals aren't themselves revertable.
- [ ] Each revert writes a linked reversal `VesselTransfer` + audit row, marks the original reverted, in one transaction.
- [ ] `query_transfers` reflects reverted state.
- [ ] New unit tests pass; `npm run lint` and `npm run build` clean; no regressions.
