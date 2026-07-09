---
title: "PHASE 5 - Lifecycle-writer debt"
type: feat
status: planned
date: 2026-07-09
branch: feat/phase-5-lifecycle-writers
depth: standard
units: 9
---

# PHASE 5 - Lifecycle-Writer Debt Plan

## Current Posture

This plan follows `FIX_RUNBOOK.md` v2.4 Decision 7 and the current repo state:

- Phases 0, 1, 2, and 3 are reported as shipped.
- Phase 4 and Phase 7 remain parked unless a human explicitly un-parks them with authorized partner data.
- Phase 5 is the next product phase: **lifecycle writers only**.
- The Phase 3 review found migration trust hardening work. That is a separate stop-gate before real
  migration use; it is not part of this Phase 5 implementation.

## Overview

Make declared-but-dead lifecycle states real:

- A lot with no live holdings becomes `DEPLETED`.
- A zero-balance lot can be intentionally `ARCHIVED` and later restored.
- The stale `LotLineage.kind = TRANSFORM` promise is resolved honestly: produce it only if a current
  truthful producer exists, otherwise formalize the actual lineage vocabulary and remove the stale
  expectation.

This phase is deliberately small. It must not change ledger truth, migration behavior, compliance math, or
operation semantics. Status is metadata derived from the authoritative projections; the ledger remains the
source of truth.

## Problem Frame

`Lot.status` currently allows `ACTIVE | DEPLETED | ARCHIVED | CORRECTED`, but only `ACTIVE` and
`CORRECTED` are reachable through real code paths. When a lot draws down to zero, the `VesselLot` row is
deleted by the ledger fold, but the lot itself remains `ACTIVE`. The lot list already exposes `DEPLETED`
and `ARCHIVED` filters, and lot detail already renders a status badge, so the UI advertises lifecycle
states the backend does not write.

`LotLineage.kind` is also under-specified. The schema comment says `SPLIT | BLEND | TRANSFORM`, while
existing code already writes more specific string values in places. Phase 5 should not invent lineage just
to satisfy an old comment; it should make the vocabulary honest and verified.

If we do nothing, the app keeps accumulating active-but-empty lots, archive remains a fake state, and the
schema continues to mislead future work.

## Requirements

- **MUST:** Write `DEPLETED` when a lot has no live vessel or bottle-storage holdings after the ledger fold.
- **MUST:** Write `ACTIVE` again when a previously depleted lot receives live holdings through a valid ledger
  write or reversal.
- **MUST:** Include both `vessel_lot` and `bottled_lot_state` in the live-holdings calculation.
- **MUST:** Never update status by mutating or adding ledger operations.
- **MUST:** Never auto-archive. `ARCHIVED` is an explicit operator metadata state.
- **MUST:** Reject normal operations against archived lots, except correction/reversal paths that must
  restore ledger truth.
- **MUST:** Provide admin-gated archive and unarchive actions.
- **MUST:** Reject archive while a lot has any live holdings.
- **MUST:** Append audit history for archive/unarchive.
- **MUST:** Resolve the `TRANSFORM` lineage promise by either producing a truthful edge or removing the
  stale expectation from schema/docs and verifying the real vocabulary.
- **MUST:** Add the missing `verify:projection` package script or stop naming it as an npm script.
- **MUST:** End green with the full cross-phase gates.

## Non-Goals

- No Phase 6 operation gaps: no new ops, no ADJUST/DEPLETE/SEED reversal, no LIFO unwind, no metadata edit
  affordance, no split-in-place, no lees sub-lot, no barrel-group break/combine.
- No migration adapter or Phase 3 kernel change.
- No compliance formula change.
- No schema table creation.
- No broad RBAC matrix. Archive/unarchive use the existing admin gate for now.
- No in-place ledger mutation or line rewrite.

## Research Summary

### Current Code Anchors

- `prisma/schema.prisma`: `Lot.status` is a string with default `ACTIVE` and comment
  `ACTIVE | DEPLETED | ARCHIVED | CORRECTED`.
- `prisma/schema.prisma`: `LotLineage.kind` is a string, not a Prisma enum; the comment is stale.
- `src/lib/ledger/write.ts`: `writeLotOperation` is the chokepoint that folds `VesselLot`, deletes
  functional-zero rows, folds barrel fills, folds `BottledLotState`, syncs `vessel_component`, and cascades
  amendments.
- `src/lib/ledger/math.ts`: `foldLines` sweeps functional zero.
- `src/lib/sparkling/projection.ts`: bottled/in-process sparkling holdings have their own deterministic
  projection and can keep a lot live even after vessel volume is zero.
- `src/app/(app)/lots/page.tsx`: the lot list already supports `ACTIVE`, `DEPLETED`, `ARCHIVED`, `ALL`.
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`: lot detail already renders a status badge.
- `scripts/verify-projection.ts`: projection verifier exists, but `package.json` does not expose
  `verify:projection`.
- `scripts/verify-work-orders-transform.ts`: reversal of a fresh crush marks the must lot `CORRECTED`;
  Phase 5 status sync must not overwrite this terminal state.

### Existing Patterns To Reuse

- Mutations are wrapped in `action` or `adminAction` from `src/lib/actions.ts`.
- Tenant-scoped transactions use `runInTenantTx` for non-ledger metadata writes.
- Ledger-affecting writes stay inside `runLedgerWrite`.
- Audit uses `writeAudit`.
- Naming changes already use append-only event/audit discipline in `src/lib/lot/naming-actions.ts` and
  `src/lib/lot/rename.ts`.
- UI should reuse existing lot list/detail components and status badge patterns, not introduce a new
  lifecycle dashboard.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Status authority | Derived from live projections, not from event history alone | The ledger fold is already authoritative for holdings. |
| Live holdings | `vessel_lot` + `bottled_lot_state` | Bulk and in-process bottled/sparkling lots both represent live wine. |
| Auto transitions | `ACTIVE <-> DEPLETED` only | `ARCHIVED` is intentional metadata; `CORRECTED` is owned by transform reversal. |
| Archived lot operations | Block normal writes; allow correction/reversal paths to restore truth | Archive must not become deletion or a compliance trap. |
| Reopened archived lot | Correction/reversal that creates live holdings restores `ARCHIVED -> ACTIVE` with audit | A lot with live balance cannot remain archived. |
| Archive action | Admin-only metadata action | Coarse high-risk gate matches current conventions; granular RBAC remains Phase 23. |
| Lineage vocabulary | Formalize actual strings; produce `TRANSFORM` only if truthful | Avoid fake lineage and stale schema comments. |
| Verification | Add `verify:lifecycle`; add `verify:projection` package script | Keeps this debt from quietly returning. |

## Implementation Units

### Unit 0 - Pre-Work Audit

**Goal:** Confirm the exact current status and lineage behavior before editing.

**Files:**
- `prisma/schema.prisma`
- `src/lib/ledger/write.ts`
- `src/lib/sparkling/projection.ts`
- `src/lib/transform/*`
- `src/lib/cellar/topping.ts`
- `src/lib/lot/lineage.ts`
- `scripts/verify-projection.ts`

**Tasks:**
- Identify every writer of `Lot.status`.
- Identify every writer of `LotLineage.kind`.
- Record whether any existing operation truthfully needs `TRANSFORM`.
- Confirm `verify:projection` is missing from `package.json`.

**Output:** Notes in `PHASE-5-REPORT.md`; no separate audit file unless useful.

### Unit 1 - Lifecycle Status Core

**Goal:** Add one reusable helper that syncs lot lifecycle status from current projections.

**Files:**
- `src/lib/lot/lifecycle.ts` (new)
- `src/lib/ledger/write.ts`

**API shape:**

```ts
export async function syncLotLifecycleStatusTx(
  tx: Prisma.TransactionClient,
  input: {
    lotIds: string[];
    actor?: { actorUserId: string | null; actorEmail: string } | null;
    allowArchivedReopen?: boolean;
  },
): Promise<void>;
```

**Rules:**
- Read current statuses for affected lots.
- Aggregate live volume from `vesselLot`.
- Aggregate live volume/count from `bottledLotState`.
- Treat a lot as live if vessel volume is above functional zero or bottle-storage volume/count is live.
- `ACTIVE -> DEPLETED` when not live.
- `DEPLETED -> ACTIVE` when live.
- Skip `CORRECTED`.
- Skip `ARCHIVED` unless a correction/reversal path has made it live; then restore to `ACTIVE` and audit.
- Update only when the target status differs.

**Integration in `writeLotOperation`:**
- Build affected lot ids from all operation lines, including bottle-storage lines.
- Call the helper after vessel and bottled projections are folded, and before returning from the transaction.
- Do not let status sync change ledger lines, cost, compliance, or projections.

### Unit 2 - Archived-Lot Write Guard

**Goal:** Prevent ordinary writes from acting on archived lots.

**Files:**
- `src/lib/ledger/write.ts`
- `src/lib/lot/lifecycle.ts`
- tests/verifier from Unit 6

**Rules:**
- If any input lot is `ARCHIVED`, reject non-correction/non-reversal writes with a clear `ActionError`.
- Allow correction/reversal writes that are required to restore append-only truth.
- If an allowed correction/reversal creates live holdings, status becomes `ACTIVE`.
- Do not block read-only history/timeline loading.

**Design note:** The user should experience archive as "closed from normal work," not as deletion.

### Unit 3 - Archive / Unarchive Actions

**Goal:** Add explicit metadata lifecycle actions.

**Files:**
- `src/lib/lot/lifecycle.ts`
- `src/lib/lot/lifecycle-actions.ts` (new server action wrapper, or fold into an existing lot action file if
  that matches local style)
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`

**Actions:**
- `archiveLotAction({ lotId, reason? })` - admin-only.
- `unarchiveLotAction({ lotId })` - admin-only.

**Archive rules:**
- Reject missing/cross-tenant lot through normal tenant/RLS behavior.
- Reject `CORRECTED` unless the audit finds a strong reason to allow it.
- Reject if live vessel or bottle-storage holdings exist.
- Set `ARCHIVED`.
- Write audit with actor, lot id/code, previous status, and reason.

**Unarchive rules:**
- If live holdings exist, set `ACTIVE`.
- If still zero, set `DEPLETED`.
- Write audit with actor and previous status.

**Open choice resolved for this plan:** Archive is hidden from normal operations but still visible in lot
history, search, and correction contexts.

### Unit 4 - Lot UI Surface

**Goal:** Make the lifecycle states understandable and usable without creating a new page.

**Files:**
- `src/app/(app)/lots/LotsClient.tsx`
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`
- possibly lot view-model code in `src/lib/lot/data.ts`

**Lot list:**
- Keep existing `ACTIVE`, `DEPLETED`, `ARCHIVED`, `ALL` filters.
- Show `DEPLETED` as automatic lifecycle state.
- Show `ARCHIVED` as intentional closure.
- De-emphasize archived rows; do not make them look dangerous or deleted.

**Lot detail:**
- Add archive/unarchive affordance near lifecycle/status controls.
- Archive button is enabled only for zero-balance lots.
- If disabled, show a concise reason: live vessel/bottle holdings remain.
- Confirmation copy must make clear this is not deletion.
- Unarchive returns the lot to `DEPLETED` or `ACTIVE` based on current holdings.

**Action pickers:**
- Exclude archived lots from normal operation pickers where this phase touches the path.
- If a picker already receives an archived lot through a URL/state edge, backend guard still wins.

### Unit 5 - Lineage Vocabulary Cleanup

**Goal:** Resolve the `TRANSFORM` dead declaration honestly.

**Files:**
- `prisma/schema.prisma`
- `src/lib/lot/lineage.ts`
- `src/lib/transform/press-core.ts`
- `src/lib/transform/crush-core.ts`
- `src/lib/cellar/topping.ts`
- tests/verifier from Unit 6

**Tasks:**
- Audit current lineage kinds.
- Decide whether `TRANSFORM` has a truthful current producer:
  - If yes, add it at the domain core that creates a parent-lot -> child-lot identity transform.
  - If no, remove stale `TRANSFORM` language from schema comments/docs and formalize actual values.
- Add a central `LINEAGE_KINDS` helper if it reduces drift.
- Ensure `TOPPING` or any existing non-commented values are documented rather than treated as accidental.
- Do not fabricate lineage for `CRUSH` if the model truthfully uses `LotHarvestSource` instead of
  parent-lot -> child-lot edges.

**Preferred outcome unless audit proves otherwise:** no fake `TRANSFORM`; update stale docs/comments and
verify the actual vocabulary.

### Unit 6 - Verification

**Goal:** Guard the lifecycle behavior end to end.

**Files:**
- `scripts/verify-lifecycle.ts` (new)
- `package.json`
- optional focused unit tests under `test/`

**Package scripts:**
- Add `"verify:lifecycle": "tsx --conditions=react-server --env-file=.env scripts/verify-lifecycle.ts"`.
- Add `"verify:projection": "tsx --env-file=.env scripts/verify-projection.ts"`.

**Verifier tenant:**
- Use `runAsTenant("org_demo_winery", ...)`.
- Do not use `org_bhutan_wine_co`.

**Assertions:**
- Seed a bulk lot in Demo Winery; verify it starts `ACTIVE`.
- Draw the vessel position to zero through a real ledger path; verify `DEPLETED`.
- Restore volume through a valid correction/reversal path; verify `ACTIVE`.
- Bottle/sparkling storage keeps a lot live even if vessel volume is zero.
- Finish/drain bottle-storage to zero marks `DEPLETED` when no other holdings remain.
- Archive rejects while live holdings exist.
- Archive succeeds once zero-balance.
- Normal write to archived lot rejects.
- Unarchive zero-balance lot returns `DEPLETED`.
- Correction/reversal reopening an archived lot returns `ACTIVE` and does not corrupt the ledger fold.
- `CORRECTED` lots are not overwritten by lifecycle sync.
- Lineage vocabulary check passes: `TRANSFORM` is produced truthfully or stale references are removed.
- `npm run verify:projection` passes after lifecycle status writes.

### Unit 7 - Regression Gates

**Goal:** Prove Phase 5 did not disturb ledger, correction, migration, compliance, or governance.

**Commands:**
- `npm run verify:lifecycle`
- `npm run verify:projection`
- `npm run verify:reverse`
- `npm run verify:reverse-transform`
- `npm run verify:migration`
- `npm run verify:tenant-isolation`
- `npm run verify:invariants`
- `npm run verify:tripwires`
- `npm run test`
- `npm run lint`
- `npm run build`

**Notes:**
- `verify:migration` is a regression check only; do not expand migration behavior in this phase.
- If `verify:reverse` or `verify:reverse-transform` still target Bhutan, do not expand them here beyond
  running the existing gate; Phase 6 must move those scripts before adding new reversal coverage.

### Unit 8 - Phase Report

**Goal:** Close the phase honestly.

**File:**
- `PHASE-5-REPORT.md`

**Must record:**
- Status-transition rules implemented.
- Archive/unarchive behavior and guardrails.
- Whether `TRANSFORM` is produced or stale vocabulary was removed.
- New/updated verify scripts.
- Full gate results.
- Any deferred UX or operation-picker cleanup.
- Confirmation that Phase 4 and Phase 7 remain parked.

## Test Strategy

Primary guard is `verify:lifecycle`, backed by `verify:projection`. Unit tests are useful only for pure
helpers; the important proof is real ledger writes under Demo Winery because status changes depend on the
transactional projection fold.

Run the full regression suite before shipping. Phase 5 touches governed ledger behavior (`writeLotOperation`)
and lot UI, so a narrow test run is not enough.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Status sync corrupts append-only semantics | Low | High | Status writes are metadata only; verifier proves projection remains fold-authoritative. |
| Sparkling/bottle-storage lots incorrectly deplete | Medium | High | Live-holdings helper includes `bottledLotState`; verifier covers vessel-zero/bottle-live case. |
| Archived lots become hidden deletion | Medium | Medium | UI copy and audit make archive reversible; backend rejects live archive. |
| Correction into archived lot creates contradictory state | Medium | Medium | Allowed correction/reversal can reopen to `ACTIVE` with audit; normal writes remain blocked. |
| `CORRECTED` status is overwritten by generic sync | Medium | High | Helper explicitly skips `CORRECTED`; verifier covers transform reversal. |
| Lineage cleanup invents false `TRANSFORM` edges | Medium | Medium | Audit first; preferred path is vocabulary formalization unless a truthful producer exists. |
| Adding `verify:projection` exposes pre-existing drift | Low | High | Treat drift as a stop condition; do not paper over it with lifecycle changes. |

## Open Questions

1. **Should archive require a reason?**
   - Plan default: optional `reason` in v1, recorded if provided. Do not block on reason UX.

2. **Should `CORRECTED` lots be archivable?**
   - Plan default: reject in v1 unless audit reveals a clean existing use case. `CORRECTED` is terminal
     reversal state, not normal lifecycle closure.

3. **Should lifecycle status updates be represented in the lot timeline?**
   - Plan default: not required for Phase 5 unless cheap. Audit records are enough for v1.

4. **Should `TRANSFORM` be produced anywhere?**
   - Plan default: only if Unit 0 identifies a current parent-lot -> child-lot transformation that is not
     already truthfully represented by `SPLIT`, `BLEND`, `TOPPING`, `LotHarvestSource`, or `LotStateEvent`.

## Success Criteria

- [ ] `DEPLETED` is reachable through real ledger drawdown.
- [ ] `DEPLETED -> ACTIVE` works when volume is restored.
- [ ] Bottle-storage holdings keep lots live.
- [ ] `ARCHIVED` is reachable only through explicit admin action.
- [ ] Archive rejects live lots.
- [ ] Unarchive works and chooses `DEPLETED` or `ACTIVE` from holdings.
- [ ] Normal writes to archived lots are blocked.
- [ ] `CORRECTED` is not overwritten by lifecycle sync.
- [ ] `TRANSFORM` is produced truthfully or removed as a stale expectation.
- [ ] `verify:lifecycle` and `verify:projection` exist in `package.json`.
- [ ] Full regression gates green.
- [ ] `PHASE-5-REPORT.md` written.

## Review Adjudications - Engineering

Findings folded in:

- Phase 5 must specify full transitions, not only `ACTIVE -> DEPLETED`.
- Status sync must include `bottled_lot_state`, not only `vessel_lot`.
- `CORRECTED` must not be overwritten.
- `verify:projection` exists as a script file but not as a package script; add it.
- `LotLineage.kind` is a string and existing code already uses values beyond the stale comment, so this is a
  vocabulary cleanup, not a simple enum removal.
- Phase 6 verifier tenant issues are real but out of Phase 5 scope; do not expand reversal scripts here.

## Review Adjudications - Council

Council-style adversarial findings folded in:

- Keep Phase 4 and Phase 7 parked; do not smuggle adapter assumptions into lifecycle work.
- Do not describe Phase 5 as migration-trust work. It is product lifecycle debt.
- Phase 3 hardening findings are important but separate: first post-cutover TTB proof, publish-time filing
  recheck, fuller reconciliation-pack honesty, and tenant-isolation coverage gaps.
- Archive/unarchive must not alter legacy history, migration archive rows, cost, or compliance folds.
- Use Demo Winery for new verifier work.

Note: the external `ask_codex` / `ask_gemini` council MCP tools were not mounted in this session, so this
is folded from local multi-agent/council-style review rather than a live Codex+Gemini transcript.

## Review Adjudications - Design

Findings folded in:

- Archive must feel reversible and distinct from deletion.
- `DEPLETED` and `ARCHIVED` need visibly different meanings.
- Archive/unarchive belongs on lot detail, near the status badge, not in a new settings surface.
- Disabled archive state must name the reason: live holdings remain.
- Archived lots should be hidden or disabled in normal operation pickers, with backend guard as the real
  enforcement.
- In-place split, edit affordances, LIFO unwind, and reverse-and-rebook are Phase 6 and intentionally not
  built here.

## Gate Pipeline Summary

- **/plan:** Completed in this file.
- **Engineering review:** Completed and folded into requirements/units.
- **Council review:** Completed as a local council-style adversarial pass; external MCP council unavailable.
- **Design review:** Completed and folded into UI/actions.

**Verdict:** Plan is ready for `/work` after acknowledging that Phase 3 hardening is tracked separately and
Phase 4/7 remain parked.
