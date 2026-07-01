# Council Feedback — Universal Timeline Undo (plan 024)
**Date**: 2026-07-01
**Plan**: docs/plans/2026-07-01-024-feat-universal-timeline-undo-plan.md
**Reviewers**: Gemini 3.1 Pro (domain/data-quality/UX + ledger) · Claude subagent (correctness, grounded in the actual cores; stood in for Codex which was unavailable)

Both reviewers independently flag the same two riskiest units: **Unit 2 (guard unification)** and **Unit 4 (origination/split reversal)**. The spine — one dispatcher + inverse-legs-through-the-chokepoint — is sound.

## Critical Issues

1. **Guard unification must NOT drop `planCorrection`'s shortfall check (Unit 2).** cellar/correct.ts and rack-core.ts call `planCorrection` (`math.ts:441-464`), which does TWO things: the later-touched-keys block AND a negative-fold "shortfall" pre-check. The plan's "extract the query into a helper" risks replacing `planCorrection` wholesale and losing the shortfall guard — turning a friendly CONFLICT into a raw chokepoint throw (or a semantically-wrong success). **Fix:** the shared helper is *guard-only* (returns the blocking op or null); each core keeps calling `planCorrection`. The only change to cellar/rack is how `touchedKeys` is built — add `operation: { correctedBy: { is: null } }` to that query. Add an A→B→reverse-B→reverse-A characterization test across the cellar family.

2. **Don't `DELETE` lineage/state on reverse — mark CORRECTED/VOIDED (Unit 4).** Deleting `LotLineage`/`BottledLotState` orphans any AnalysisPanel/tasting notes attached to child lots and dents auditability. This is in tension with the *existing* partial-disgorge code that deletes the SPLIT edge — resolve deliberately (keep a `correctedByOperationId`/status marker rather than a hard delete where downstream data can hang off the child).

3. **Origination guard is insufficient — must also block on lineage children (Unit 4, CRUSH/PRESS/SAIGNEE/BLEND).** The LIFO guard is keyed on later *ledger lines* for the lot. But an originated lot can be drawn to zero (position row deleted) while still having downstream **LotLineage children** (e.g., a press fraction later blended). A lot-scoped later-line query finds nothing and lets the reverse proceed — freeing picks / marking CORRECTED while a child still exists. **Fix:** also block if any `LotLineage.parentLotId == originatedLotId` edge exists that this op didn't create.

4. **BLEND reversal conflates GROW vs NEW_LOT (Unit 4).** `blendLotsCore` has both. NEW_LOT: mark child CORRECTED + remove this op's edges. GROW_EXISTING: the "child" pre-existed with its own history — must NOT be marked CORRECTED and must NOT lose pre-existing lineage; only inverse the legs + remove the edges *this* blend created. `blend-core.ts` doesn't stamp `metadata.mode` today (add it, like crush/press) and should snapshot pre-op lineage so reversal restores rather than blind-deletes.

5. **Inverse legs = exact negation of the original legs, never recomputed fractions.** Recomputing SAIGNEE/BLEND fractions leaves float-drift ghosts (`0.0001 L`) that never drain. Make "exact negation" an explicit, non-negotiable rule in Unit 4 (the existing reverseTirageCore already does this).

6. **Tenant parity must be explicit (post-multitenancy).** `reverseOperationCore` should assert `originalOp.tenantId === currentTenant` before writing, and the dispatcher must NOT open its own transaction — it selects and calls exactly ONE core, which owns its `runLedgerWrite` tx and sets the tenant GUC inside it (set + re-set on retry). No nested transactions; no RLS bypass in the chokepoint.

## Design Questions (answer these, then /refine)

1. **Nomenclature:** call it **"Correct / Void record"** rather than "Undo"? A winemaker can't physically un-press grapes or un-disgorge lees — the action is a ledger correction, not time travel. (Gemini)
2. **Strict vs loose LIFO:** should neutral cellar ops (ADDITION/FINING/CAP_MGMT) reverse *loosely* (a typo'd SO₂ addition shouldn't be blocked just because a rack happened later), while volume/lineage/state ops (CRUSH/PRESS/BLEND/RACK/BOTTLE) stay strict LIFO? (Today the zero-line void path has no volumetric guard — unification must preserve that.)
3. **Timeline verdict:** the client `OpItem` can't compute true reversibility for origination ops (needs downstream lineage). Pick one: (a) loader computes a server-side `canReverse(opId)` per op, or (b) drop the "disabled + reason" promise for LIFO-blocked ops and only statically disable SEED/ADJUST/DEPLETE/CORRECTION — everything else is "attempt → show the CONFLICT reason returned by the dispatcher." (Claude S5)
4. **Blast-radius preview:** before the confirm, show what else the reverse touches — "voids child lot X, returns 450 L to Tank 4, frees 2.5 t to Pick A" — via an `analyzeReversal(opId)` probe? A two-step ConfirmButton alone is thin for something that destroys child lots and moves wine. (Gemini)
5. **Non-undoable fix path:** if SEED/ADJUST are non-undoable, how does a user fix a typo'd SEED volume? State the remedy in the reason ("Requires a new ADJUST to correct"). Also: CORRECTION itself is non-undoable — say so with a reason ("redo the original op instead") so the dispatcher's default branch doesn't throw ugly. (Both)
6. **Dispatcher shape:** keep the router *thin* — don't share leg-generation between origination and transfer reversals (false uniformity). Only the final `writeLotOperation` call is shared. (Both)

## Suggested Improvements (SHOULD FIX)

- **PRESS is an ambiguous op type (Claude S2):** whole-cluster press (fruit origination, has `LotHarvestSource`) vs parent split (has SPLIT lineage). Reverse-press must branch on presence-of-picks vs lineage, not on `op.type`.
- **"Rewind form/AF" is a no-op for crush/press/blend (Claude S2):** they set child form at `lot.create` with NO `LotStateEvent`; only TIRAGE records one. Don't imply a symmetric rewind that doesn't exist.
- **BOTTLE/FINISH runId fallback can pick the wrong run for multi-run lots (Claude S3):** metadata.runId stamp fixes new ops; for old ops with >1 run, return "reverse from the bottling-run view" rather than guessing. (This bug already exists in `reverseFinalizeCore`'s fallback — don't copy it.)
- **Idempotency (Claude S4):** every new core must set `correctsOperationId` NON-null (the finalize path currently allows null → no double-reverse protection); add a `commandId` to `reverseOperationAction` so a double-tap on the timeline is a no-op success.
- **Blocked reason must name the specific blocking op** `{id, type, date}` with a link, not "a later step still stands." The shared guard should return it. (Both)
- **Pick over-restore integrity flag (Gemini):** warn if returning kg to a pick would exceed its original received weight.
- **Shared guard should use the LOT-SCOPED form** (`sparkling/correct.ts:244-250`), not the global-by-key form (`:60-71`), to avoid cross-lot false blocks. (Claude)
- **Fix Unit 4's dependency (Claude D3):** its verification says "reverse via dispatcher" but it only depends on Unit 2 — it needs Unit 3, or test the cores directly until Unit 8.

---
## Raw Response — Gemini (gemini-3.1-pro-preview)

### CRITICAL (Ledger Safety & Data Quality)
- **Violations of "Append-Only" (Units 4 & 7):** don't DELETE LotLineage/LotHarvestSource/BottledState; add a corrected-by marker and void via exact negative legs. Deleting orphans analysis/tasks/tasting notes on child lots.
- **Exact Leg Negation vs Recalculation:** never recalculate fractions on reverse; fetch the original signed legs and insert inverted values, else float drift leaves undrainable dust.
- **Multi-Tenancy Reversal Leaks:** reverseOperationCore must enforce tenantId parity explicitly and pass tenantId into the chokepoint; never bypass RLS for projections.

### SHOULD FIX (Domain Logic & UX)
- **Strict LIFO vs Cellar Reality:** bifurcate the guard — strict LIFO for volume/lineage/state ops; loose for non-volumetric cellar ops (ADDITION/FINING) so a typo'd addition isn't blocked by a later rack.
- **Blind Confirmation / Blast Radius:** add analyzeReversal(opId) to show an impact summary before enabling Confirm (child lots voided, volume returned, picks freed).
- **Vague Blocked Reasons:** guard returns the specific blocking op {opId,type,date}; UI links to it.
- **Pick Consumption Re-use:** flag if returning tons exceeds the pick's original received weight.

### DESIGN QUESTIONS
- Is "Undo" the right mental model? Prefer "Correct Ledger / Void Record" — a winemaker can't un-press grapes.
- Is the universal dispatcher false uniformity? Keep the router thin; keep origination vs transfer reversal logic distinct, sharing only the chokepoint.
- What happens to SEED/ADJUST/DEPLETE? If non-undoable, state the remedy ("requires manual ADJUST"); otherwise reconsider allowing a CORRECTION leg for ADJUST.

## Raw Response — Claude subagent (correctness, grounded in the cores)

**CRITICAL**
- C1. Guard unification silently drops planCorrection's shortfall check — weakening cellar+rack. Keep planCorrection; make the shared helper guard-only; only change how touchedKeys is built (add correctedBy exclusion). math.ts:441-464, cellar/correct.ts:72-97, rack-core.ts:309-331.
- C2. The correctedBy-exclusion is not universally safe without the shortfall pass (A→B→reverse-B→reverse-A). Keep the negative-fold pre-check; add a characterization test across the cellar family.
- C3. CRUSH/origination guard insufficient: must also block if the originated lot has LotLineage children not created by this op (a must lot drawn to zero still has downstream children). Freeing picks / marking CORRECTED while a child exists is the hazard.
- C4. BLEND reversal conflates grow vs new-lot (blend-core.ts:120-128). Branch on metadata.mode (not currently stamped — add it, crush-core.ts:303 precedent). GROW must not mark the lot CORRECTED or delete pre-existing lineage; snapshot pre-op lineage to restore, not blind-delete.

**SHOULD FIX**
- S1. Dispatcher must key on op.type; a "rack" can be a BLEND-typed op (rack-core.ts:248,267) with no VesselTransfer — route by type, not by user intent.
- S2. PRESS is ambiguous (whole-cluster fruit origination with picks vs parent split with lineage) — detect by picks-vs-lineage. "Rewind form/AF" is a no-op for crush/press/blend (no LotStateEvent written; only TIRAGE writes one).
- S3. metadata.runId fallback picks the wrong run for multi-run lots; return a "reverse from bottling-run view" reason instead of guessing. Same latent bug in reverseFinalizeCore.
- S4. correctsOperationId must be non-null in every new core (reverseFinalizeCore allows null → no double-reverse guard); add commandId to reverseOperationAction for true idempotency.
- S5. Unit 6 timeline verdict can't be computed client-side from OpItem (needs lineage/later-lines). Either compute server-side canReverse(opId) in the loader, or only statically disable SEED/ADJUST/DEPLETE/CORRECTION and make everything else attempt→show-CONFLICT. timeline.ts:441, LotDetailClient.tsx:176-179,29-30.

**DESIGN QUESTIONS**
- D1. Enum coverage is exhaustive; but state CORRECTION as non-undoable with a reason (cellar/correct.ts:37 rejects correcting a CORRECTION) so the default branch doesn't throw ugly.
- D2. Dispatcher must NOT open a transaction; it calls exactly one core which owns its runLedgerWrite tx (tenant GUC set inside). No nested tx.
- D3. Unit 4's verification depends on Unit 3 (dispatcher), not just Unit 2 — fix the dependency or test cores directly until Unit 8.

Bottom line: spine is right; fix C1–C4 before /work executes. Unit 2 (guard) and Unit 4 (origination reversal) are the two units most likely to ship a correctness bug.
