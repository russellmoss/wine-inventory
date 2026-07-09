# PHASE 6 Report - Operations Gaps

Date: 2026-07-09
Branch: `codex/phase-6-operations-gaps`
Status: 6A partial landed; 6B-6E remain unimplemented

## Completed in This Slice

- Added a DB-aware reversibility helper, `reversibilityForOperation`, and routed the universal
  dispatcher through it.
- Routed `ADJUST` and `DEPLETE` through the existing append-only cellar correction core.
- Preserved richer ledger-line metadata in correction planning, including bucket, bottle count delta,
  bond fields, and line reasons.
- Added richer LIFO blocker detail via `laterTouchedBlockers`, so blocked correction errors can name
  the downstream operation id/type/date instead of only saying "later activity."
- Kept `SEED` fail-closed by default. Only seeds explicitly marked with
  `metadata.seedKind === "MANUAL_OPERATOR_SEED"` can become reversible, and only when DB-state checks
  find no import/migration/legacy marker, downstream touches, lineage, cost artifacts, bottle state, or
  filed-period implication.
- Stamped new manual bulk seeds with `metadata.seedKind: "MANUAL_OPERATOR_SEED"`.
- Added `verify:phase6-reversal`, a Demo Winery-only verifier. No new Bhutan Wine Co verifier work was
  added.

## Explicitly Not Completed

- No LIFO chain preview/executor UI yet.
- No neutral edit/delete retirement yet.
- No fenced metadata edit affordance yet.
- No split-in-place or lees sub-lot work yet.
- No vessel/barrel group workflow work yet.
- No long-tail operation enum or `CUSTOM` label work yet.
- No InnoVint or Vintrace adapter work.

## Verification

- `npm run verify:phase6-reversal` - passed
- `npx vitest run test/reverse-verdict.test.ts` - passed
- `npx tsc --noEmit` - passed
- `npm run verify:lifecycle` - passed
- `npm run test` - passed
- `npm run lint` - passed with existing warnings only
- `npm run build` - passed

## Notes

- Existing `verify:reverse` and `verify:reverse-transform` still need tenant review before being
  expanded for Phase 6 acceptance proof.
- This slice intentionally implements the safe backend foundation first. The rest of 6A still needs a
  dedicated LIFO preview/action workflow before 6A is complete.
