# Council Feedback — TTB F 5120.17 Compliance & Reporting Engine (Phase 14 v1)
**Date**: 2026-07-01
**Reviewers**: Gemini 3.1 Pro (TTB domain + data quality) · Claude (types + data layer + ledger correctness; Codex CLI was unavailable this run)
**Plan**: `docs/plans/2026-07-01-025-feat-ttb-5120-17-compliance-reporting-plan.md`

## Critical Issues

**C1 — Tax class is modeled as a static per-lot property; the form is a per-class-column
reconciliation where volume MOVES between classes.** (Gemini #1, #3; Units 3/5/6.) A lot fermented
at 15% (class a) then fortified to 17% (class b) mid-period must show a *removal* from class a and an
*addition* to class b on the correct lines (A19 used-for-spirits / A4 produced-by-spirits, or A18/A3
for sweetening, A21/A6 for amelioration). Deriving one class at bottling silently drops these
movements and unbalances the columns. **Fix:** tax class is a point-in-time state; the fold detects
class transitions across the period and emits the paired remove-old/add-new lines. See plan revision.

**C2 — CRUSH must NOT post to A2 "produced by fermentation."** (Gemini #2; Unit 5.) Crushed
grapes/juice are not wine; putting them in §A inflates bulk-wine inventory and manufactures false
shortages later. A2 fires when juice *becomes* wine (fermentation-complete / a lot transitioning
MUST/JUICE→WINE), not at crush. Juice/must lives in Part VII (in-fermenters) / Part IV (materials).
**Fix:** map the MUST/JUICE→WINE transition (existing `LotForm`/`afState` change) to A2, not CRUSH.

**C3 — Amelioration / sweetening / spirits addition are volume-bearing production lines, not generic
ADDITION.** (Gemini #3; Units 4/5.) The volume of sugar-water/spirits *added* is reported on
A3/A4/A6. Generic `ADDITION` (SO₂, nutrient) is volume-neutral and non-reportable. **Fix:** the added
volume of these specific treatments maps to A3/A4/A6; the base wine is only removed+re-added when it
crosses a tax class (C1).

**C4 — Required `abv` on `BottlingInput` breaks every existing bottling caller, and mis-times ABV
for sparkling.** (Claude; Unit 2.) All construction sites of `executeBottling`/`applyBottling`
(actions, tests, any assistant bottling tool) break at compile time; and the sparkling path bottles
at **TIRAGE** (BOTTLED_IN_PROCESS) where final ABV isn't known (it rises with tirage sugar). **Fix:**
enumerate + update all callers; require ABV on the still-wine bottling entry; resolve sparkling ABV at
FINISH/disgorgement (base ABV + tirage bump); give historical `BottlingRun` rows a migration default.

**C5 — CORRECTION-op `observedAt` semantics vs report period are undefined → double-counting.**
(Claude; Units 4/8, R3.) `reverseOperationCore` appends a CORRECTION op. If it stamps `observedAt =
now`, a February correction of a January op folds into February and mis-periods the reconciliation.
**Fix:** define that a correction amending a filed period carries `observedAt` within that period (or
the fold groups a CORRECTION with the period of the op it corrects); this is the mechanism behind
Amended reports — nail it explicitly.

## Should-Fix

**S1 — Gallons rounding must not break `Begin + Add − Remove = End`.** (Gemini #4; Unit 6.) Compute
Begin/Add/Remove in exact liters, convert+round to 2dp, then **derive** `End = Begin + Add − Remove`
in the rounded domain; post any drift vs the physically-converted end to A9 (gain) / A30 (loss). TTB
systems reject columns that don't foot.

**S2 — `null` ABV must not drop volume off the form.** (Gemini #5; Unit 3.) Dropping an
unclassified lot unbalances inventory. Default `null` ABV to **class a (≤16%)** to keep the volume on
the ledger, flag for follow-up, and amend later if a reading reclassifies it. Use exact boundaries:
a ≤ 16.000%, b > 16.000%–≤ 21.000%, c > 21.000%–≤ 24.000%.

**S3 — On-hand "begin" should carry forward from the prior filed report, not full-refold every
time.** (Claude; Units 6/8.) The form's rule *is* carry-forward (on-hand-end → next on-hand-begin).
Full-history re-fold is O(all ops), grows unbounded, and can disagree with the last filed end after a
backdated/correction op. Use the prior **FILED** `ComplianceReport`'s on-hand-end as begin; full-fold
only for the first report or an explicit recompute. Add index `(tenantId, observedAt)` on LotOperation.

**S4 — "Final" is a business-closing flag, not a per-period state.** (Claude; Units 7/8/12.) The
form's Original/Amended/Final: *Final* = last report for the whole business. Separate the report
lifecycle (DRAFT→FILED) from the form version flag; don't offer per-period "Final."

**S5 — Removal disposition → §A vs §B is chosen by bulk/bottled state, not the disposition.** (Claude;
Unit 4/5.) `mapLineToForm` must pick the section from `bucket`; the enum doc listing "TAXPAID→A14/B8"
should read "→ A14 if bulk, B8 if bottled."

## Design Questions

**Q1 (scope fork) — How much cross-class / fermentation-transition accounting is in v1?** C1/C2/C3
reshape the model. Minimum-correct v1: (a) A2 on MUST/JUICE→WINE, (b) cross-class movement lines for
BLEND + sweetening/spirits/amelioration, (c) carry-forward begin. Do we build all of that now, or hold
v1 to a **grape-still-dry-wine happy path** (single class per lot, no fortification/cross-class blend)
and explicitly defer mid-period transitions — with an anomaly flag when a lot's class changes?

**Q2 — Cross-class blend fractional volumes (A5/A20).** (Gemini #6.) Does `BLEND` capture the exact
liters contributed by each source tax class, so A5 can report "X removed from class b, added to class
a"? If the BLEND op only records the child lot, the plan can't compute the per-class deltas.

**Q3 — Bottling runs spanning a period boundary.** (Gemini #7.) A run started 01-31 and recorded
02-01 must show the gallons physically bottled by 01-31 in January. Do we require operators to split
the run at month-end, or accept `observedAt`-based assignment (whole run lands in the recorded period)?

**Q4 — In-bond transfers / received-in-bond / taxpaid-returned-to-bond (A7/A15, B3/B9, B4).** (Claude.)
These need a counterparty bonded premises not modeled in single-winery v1. Leave the lines at zero and
document, or model inter-premises transfer now?

---
## Raw Response — Gemini (gemini-3.1-pro-preview)

### CRITICAL: Domain & Accounting Failures
1. **Mid-Period Tax Class Transitions (Violates Part I §A Math).** Deriving one tax class per lot
based on latest ABV / at bottling breaks the ledger math for bulk wine that changes class mid-period.
If a lot starts January at 15.0% (Class a) and is sweetened/fortified in February to 17.0% (Class b),
you cannot retroactively change January's ending inventory; the movement is a reportable event. Fix:
tax class must be a time-series state; a cross-boundary op auto-generates a removal from the old class
(e.g. A19) and an addition to the new class (e.g. A4).
2. **CRUSH does not produce wine (Line A2 mismatch).** Crushed grapes/juice are not wine; entering
them on §A inflates bulk-wine inventory and triggers false shortages. Juice is tracked in Part VII.
A2 triggers when juice becomes wine (≈0.5% ABV / declared finished). Fix: disconnect CRUSH from A2;
introduce a FERMENTATION_COMPLETE / DECLARE_WINE transition (Part VII → §A2).
3. **Amelioration and Sweetening are Volume-Increasing Additions.** Folding them into generic ADDITION
misses reportable volume. Adding sugar-water increases lot volume; report the volume gained on A6
(amelioration) / A3 (sweetening) / A4 (spirits). The base wine isn't removed+re-added unless it
crosses a tax class.

### SHOULD FIX
4. **Gallons Rounding breaks Begin + Add − Remove = End.** Rounding each cell independently drifts by
±0.01 gal and TTB rejects columns that don't balance. Compute Begin/Add/Remove in exact liters,
convert/round, then calculate End in the rounded domain; post drift to A9 (gain) / A30 (shortage).
5. **Tax Class Boundaries and Missing ABV.** Class a ≤16.000%, b strictly >16.000% and ≤21.000%.
null ABV cannot just "flag an anomaly and drop the volume" — that breaks the balance. Default null to
Class a to keep volume on the ledger; amend later if testing reclassifies.

### DESIGN QUESTIONS
6. **Cross-Class Blending Math (Line A5).** Blending 100G class a + 100G class b → 200G class a
requires A5 to report 100G removed from b and 100G added to a. Does BLEND capture exact fractional
volumes per source class, or just the final lot's class?
7. **Bottling Runs Spanning Midnight.** A run started Jan 31 finishing Feb 1 may be recorded Feb 1;
TTB wants gallons bottled by 11:59pm Jan 31 on January's form. Partial-run boundary splits, or forced
month-end chopping?

---
## Raw Response — Claude (types + data layer + ledger correctness; Codex CLI unavailable)

- **C4** Required `abv` on `BottlingInput` breaks all existing callers (actions/tests/assistant) and
  mis-times ABV for the sparkling TIRAGE→FINISH path (final ABV unknown at tirage). Enumerate callers;
  require ABV on still-wine bottling; resolve sparkling ABV at FINISH (base + tirage bump); migration
  default for historical BottlingRun rows.
- **C5** CORRECTION-op `observedAt` vs report period is undefined; a later-period correction of a
  filed op double-counts. Define correction→period assignment explicitly (it's the Amended mechanism).
- **S3** Carry forward on-hand-begin from the prior FILED report instead of full-history re-fold
  (perf O(all ops) + can disagree with the last filed end); index `(tenantId, observedAt)`.
- **S4** "Final" is a business-closing flag, not per-period; separate report lifecycle (DRAFT→FILED)
  from the form version flag.
- **S5** `mapLineToForm` picks §A vs §B from `bucket` (bulk/bottled), not the disposition enum.
- **Q4** In-bond transfer lines (A7/A15, B3/B9, B4) need an unmodeled counterparty — zero + document
  for single-winery v1, or model inter-premises transfer.
- **Sound as-is:** the pdf-lib AcroForm position-calibration approach; the full Phase-12 RLS checklist
  on the two new tables; reusing `foldLines()`; the operationId-order fold with an observedAt filter
  (given C5 is resolved).
