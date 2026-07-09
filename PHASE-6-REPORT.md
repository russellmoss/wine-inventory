# PHASE 6 Report - Operations Gaps

Date: 2026-07-09
Branch: `codex/phase-6-operations-gaps`
Status: 6A, 6B, 6C, and 6D landed; 6E remains unimplemented

## Completed in This Slice

- Added a DB-aware reversibility helper, `reversibilityForOperation`, and routed the universal
  dispatcher through it.
- Routed `ADJUST` and `DEPLETE` through the existing append-only cellar correction core.
- Preserved richer ledger-line metadata in correction planning, including bucket, bottle count delta,
  bond fields, and line reasons.
- Added richer LIFO blocker detail via `laterTouchedBlockers`, so blocked correction errors can name
  the downstream operation id/type/date instead of only saying "later activity."
- Added a real LIFO undo preview/executor:
  - `previewReversalChain` recursively discovers newer blocking operations.
  - `reverseOperationChainCore` recomputes the chain server-side and executes newest-first.
  - client actions require the previewed step ids to match the recomputed chain before mutation.
- Updated the lot timeline and vessel history modal to preview the chain before executing undo.
- Retired the old neutral-op hard-delete path. The legacy delete action now voids neutral operations
  through append-only `CORRECTION`, keeping the original visible.
- Fenced the old in-place neutral edit path closed until Phase 6B metadata-only edits exist.
- Added the 6B fenced metadata edit affordance:
  - direct metadata edits allow only `metadata.supplementalNote`;
  - forbidden posting/fold/provenance fields are rejected centrally;
  - edits append an audit row and do not rewrite the original operation note;
  - lot and vessel timelines display the supplemental note.
- Switched vessel timeline reversibility to the same DB-aware verdict as the lot timeline.
- Kept `SEED` fail-closed by default. Only seeds explicitly marked with
  `metadata.seedKind === "MANUAL_OPERATOR_SEED"` can become reversible, and only when DB-state checks
  find no import/migration/legacy marker, downstream touches, lineage, cost artifacts, bottle state, or
  filed-period implication.
- Stamped new manual bulk seeds with `metadata.seedKind: "MANUAL_OPERATOR_SEED"`.
- Added `verify:phase6-reversal`, a Demo Winery-only verifier. No new Bhutan Wine Co verifier work was
  added.
- Added the 6C split-in-place / retained-lees workflow:
  - script-safe `splitLotInPlaceCore`/`splitLotInPlaceTx` for splitting a resident lot into tracked
    sub-lots without a phantom vessel;
  - retained lees are represented as an explicit child lot with `sublotTag`; discarded lees remain an
    ordinary external loss line;
  - children inherit form, ferment state, origin/provenance, tax-class inputs, tax ABV override, and
    ownership from the parent;
  - each tracked child gets truthful `SPLIT` lineage, never transform lineage.
- Added proportional inherited-cost transfer artifacts for 6C splits and reversal-time inverse
  transfer rows, plus fixed the cost read authority to include outgoing transfer events so parent
  remaining cost reflects split-out children.
- Added a compact lot-page split modal for same-vessel split/lees capture; the backend core already
  accepts destination vessel overrides for script/future workflow use.
- Updated the lot timeline so 6C split operations read as splits, even though they reuse the reversible
  `PRESS` ledger family under explicit `metadata.splitKind === "IN_PLACE"`.
- Added `verify:split-in-place`, a Demo Winery-only verifier covering split volume conservation,
  retained-vs-discarded lees, inherited fields, `SPLIT` lineage, proportional cost transfer, and
  transform reversal cleanup.
- Added the 6D saved barrel-group workflow hardening:
  - reused existing `VesselGroup` / `VesselGroupMember`; no parallel barrel-group model was added;
  - saved group "combine" is membership merge only and writes audit, not ledger operations;
  - member add/remove now writes audit inside tenant transactions;
  - group fan-out has a read-only preview with per-member ready/skipped/blocked states, capacity risk,
    empty-member skips, source-vessel skips, and source shortfall checks;
  - group apply consumes the same preview and returns a distinct `blocked` count instead of flattening
    all non-applied members into skipped;
  - batch correction outcomes now carry member operation type and vessel label for clearer partial unwind
    reporting;
  - the bulk group UI distinguishes saved groups from one-time selections and states that saved groups
    organize members only while physical wine movement uses cellar verbs.
- Added `verify:barrel-groups`, a Demo Winery-only verifier covering saved group membership merge, group
  apply preview, blocked capacity member, per-barrel fan-out, batch correction, and barrel-fill open/close
  cost projection.

## Explicitly Not Completed

- No reverse-and-rebook adapters for posting/fold edits yet.
- No long-tail operation enum or `CUSTOM` label work yet.
- No InnoVint or Vintrace adapter work.

## Verification

- `npm run verify:phase6-reversal` - passed, including LIFO chain execution and neutral edit/delete retirement
- `npm run verify:split-in-place` - passed, including retained/discarded lees, cost transfers, and reversal
- `npm run verify:barrel-groups` - passed, including saved group merge, preview, blocked member, fan-out, batch correction, and barrel-fill fold assertions
- `npm run verify:cost` - passed
- `npm run verify:lifecycle` - passed
- `npx vitest run test/cellar-edit-policy.test.ts test/vessel-timeline-view.test.ts test/lot-timeline.test.ts test/reverse-verdict.test.ts` - passed
- `npx vitest run test/reverse-verdict.test.ts` - passed
- `npx tsc --noEmit` - passed
- `npm run verify:lifecycle` - passed
- `npm run test` - passed
- `npm run lint` - passed with existing warnings only
- `npm run build` - passed
- `npm test` - passed

## Notes

- Existing `verify:reverse` and `verify:reverse-transform` still need tenant review before being
  expanded for Phase 6 acceptance proof.
- 6B v1 deliberately implements supplemental-note metadata edits only. Posting/fold changes still need
  typed reverse-and-rebook adapters before they can be offered.
- 6C uses the existing `PRESS` operation type with explicit split metadata to avoid an enum migration and
  preserve the existing transform reversal path. A future UX pass can expose destination-vessel splitting
  beyond the current same-vessel lot-page modal.
- 6D deliberately treats saved group merge/deactivate/add/remove as membership metadata. Physical
  combine/split/rack work must continue through typed cellar operations.
