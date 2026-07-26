# S4 — Phenology precision and the growth model (phase report)

**Phase:** S4 · Wave 1, lane D · **Status:** 🟪 QA — code MERGED to `main` and live, gates green, one QA line open
**Plan:** [S4-phenology-growth-model-plan.md](./S4-phenology-growth-model-plan.md) (v2, council-reconciled)
**Council:** [S4-council-feedback.md](./S4-council-feedback.md) — 23 findings
**QA:** [qa/S4-qa-report.md](../qa/S4-qa-report.md)
**Date:** 2026-07-26

---

## What shipped

Two PRs, in the order the plan specified.

**PR 1 — the schema slice** ([#521](https://github.com/russellmoss/wine-inventory/pull/521), merged,
migrations live in the DB). Two enums in their own migration (the Windows enum rule), then three
nullable columns on two already-RLS-forced tables: `VineyardBlock.trellisSystem`,
`VineyardBlock.clusterCompactness`, `Variety.clusterCompactness`. No backfill, no new table, no RLS
change. D12 precedence (block → variety → unknown) lands once, in
`src/lib/phenology/canopy-profile.ts`.

**PR 2 — the feature** ([#526](https://github.com/russellmoss/wine-inventory/pull/526), merged as `f377b053`; Units 3–10). Six new
`BlockStatus` observations carried through all five projections; the GDD phenology interpolator; the
growth-dilution model; the read seam, DTO, and pure honesty labels; the authoring and read-back UI;
the assistant payload; and `verify:phenology`.

**135 new tests.** Full suite 4386 passed / 0 failed.

## The acceptance gate, mapped

| Runbook §9 S4 gate line | Unit | Evidence |
|---|---|---|
| Growth-rate goldens | U6 | `test/phenology-growth-core.test.ts` — 27 cases incl. the hedge refusal and the C6 leaf-expansion tail |
| Interpolator goldens incl. the "no field note for 3 weeks" degrade | U5 | `test/phenology-stage-core.test.ts` — 27 cases; the named degrade is its own test, and `verify:phenology` re-proves it against the DB |
| Measured vs estimated distinguishable in the read DTO **and** the UI | U7, U8 | DTO negative assertion (every field enumerated) + 21 `labels.ts` copy tests. ⚠️ **UI half is copy-verified, not placement-verified** — see the open line below |
| Canopy state and fruit-present readable by S6/S7b | U7 | `dto.ts` exports; `fruitPresent` inherits provenance; `boundaryRisk` cases |
| Back-compat, no historical migration | U4, U10 | legacy 10-key parse test + draft-upgrade test + `verify:phenology` on a byte-exact legacy row |
| QA report | U10 | [qa/S4-qa-report.md](../qa/S4-qa-report.md) |
| QA-PROTOCOL §4 — all 23 safety cases | U10 | all addressed, skips stated explicitly, none blank |
| `verify:tenant-isolation` | U2 | all checks passed, incl. 5 new S4 cases |
| `verify:naming` before AND after | U10 | 25/25 both |
| `verify:ai-native` — no new tool, no allowlist entry | U9 | green; both cores reachable via `query-field-reports` |
| `tsc --noEmit`, full `vitest` | all | clean; 4386 passed |
| `weather-climate-math` / `weather-normals` pass **byte-unmodified** | — | ✅ untouched since the S1/P8 lane's own commits — the mechanical proof S4 stayed out of `src/lib/weather/` |
| Rolling-window scouting coverage recorded whatever it is | U10 | recorded below, and it is **not** flattering |

**Lane boundary held mechanically:** `git diff --name-only origin/main...HEAD` shows zero files
under `src/lib/weather/`, `src/lib/spray/`, or `src/lib/pesticide/`.

## The five things that must not get lost — where each one lives now

1. **`shootTip: STAGNANT` does not mean zero growth dilution.** `growth-core.ts` models a decaying
   leaf-expansion tail for ~14 days after the tip stops. The golden — *stagnant at day 0 still
   yields a non-zero unprotected fraction at day 7* — is the single most important test in the
   phase, and it is joined by a decay test and an exhaustion test. Constants named
   (`LEAF_EXPANSION_TAIL_DAYS`, `LEAF_EXPANSION_ONSET_RATE_PER_DAY`) and flagged in the file header
   as literature-shaped with no local validation.
2. **GDD accumulates from the BUD_BREAK biofix.** `stage-core.ts` finds the latest bud-break
   observation at or before the target and refuses without one. Two Bhutan goldens prove a February
   bud break with a March target resolves, and that accumulation continues past Oct 31. The
   calendar window survives only as a reported denominator, never a gate.
3. **Bands never produce a point rate.** Band-only input yields `{min,max}` or `unknown`;
   `cmPerWeek` is `null` by construction. A test asserts `CM_10_30 → CM_30_60` never reports a
   single 55 % figure and that the honest range spans both the ~nothing and the large-move case.
   `shootsAtLeast10cm` stays exact from a band alone.
4. **`undefined` vs `false` vs `0`.** Every projection uses explicit `!== undefined` / `!== null`.
   Tests pin `hedgedThisWeek: false`, `shootLengthCm: 0`, and the **pre-existing**
   `diseasePestSpotted: false` through all five projections.
5. **`NOT_ASSESSED` ≠ `NONE` ≠ `null`.** A contract test asserts three distinct outcomes, plus
   `wasScouted` / `isScoutedClean` helpers, plus a test that a truthiness check *would* collapse
   `NOT_ASSESSED` (a truthy string) and that the helpers do not. Three distinct label strings too.

## Measurements

### Rolling 4-week scouting coverage — S5b's sour-rot gate input

```
window: trailing 28 days to 2026-07-26 (all tenants, QA-* excluded)
block-week observations in window: 0
cluster damage:       0/0 gated observations scouted (0%)
vinegar-fly pressure: 0/0 gated observations scouted (0%)
OVERALL: 0/0 (0%) — S5b builds sour rot only above 60%
```

**Read this as "not yet measurable", not as 0 % coverage.** The denominator counts only block-weeks
where the control would actually have rendered (a grower cannot be faulted for not scouting at bud
break), and no live block reached `FRUIT_SET` inside the window. The only live field-note corpus is
two Bhutan notes from 2026-06-12/19, outside a 28-day window ending 2026-07-26. `verify:phenology`
prints that distinction in words rather than a bare `0%`, because a zero denominator rendered as
zero coverage is exactly the gap-read-as-a-result failure this program exists to prevent.

**This is the honest position and it is not encouraging for sour rot.** The fields shipped today;
the data does not exist yet, by construction, because nothing has been collected through them. The
gate is designed to be re-measured, and the measurement is what decides — not the fact that a column
exists. Re-run `npm run verify:phenology` before S5b plans sour rot.

### Fill-rate evidence, unchanged since planning

The plan's UI-adoption reasoning rests on 10 block-week observations from one tenant in one month
(every one-tap `Segmented` control at 100 %, photos at 0 %). Nothing in this phase improved that
sample. Confidence in UI adoption stays MEDIUM.

## What is still open

**One gate line: interactive UI placement.** The authoring form could not be driven in the browser.
The cause is **not S4** — `getCurrentUser` reads `vineyardMemberships` with no tenant context and
`user_vineyard` RLS fails closed, so an assigned manager still sees *"You haven't been assigned a
vineyard yet."* Proven three ways in the QA report. A task chip is raised.

⚠️ **This may be a release blocker for the `app_rls` activation**, not a cosmetic bug: if prod
currently connects as the owner role (BYPASSRLS) it is latent today and breaks every manager the
moment `DATABASE_URL` switches to the `app_rls` credential.

Mitigating evidence that the UI code itself is sound: the **production build passes** with
`/vineyards/field-notes` in the route table (which compiles the whole chain through `BlockCard` and
`NoteDetail`), the dev server serves the route 200 with no console or server errors, and the page is
free of horizontal overflow at 375×812. What is unverified is **placement**, not correctness — which
is precisely why council S3 forced the honesty strings into pure, CI-tested functions.

The ledger row therefore stays **🟪 QA**, not 🟩 shipped.

## Deviations from the plan

| # | Deviation | Why |
|---|---|---|
| 1 | Built on `claude/s4-phenology-feature-e9b928`, not the plan's `claude/s4-spray-phenology-precision-78661e` | That branch is checked out in a **different worktree**; git will not check out one branch twice. PR 1 went out on this session's worktree branch, PR 2 on a branch off it. |
| 2 | `FieldNoteParseError` moved to `src/lib/fieldnotes/parse-error.ts` (re-exported, zero call-site churn) | The plan's structure — S4 parsers in `phenology/observation-types.ts` throwing a class defined in `fieldnotes/types.ts`, which imports those parsers — is a genuine **runtime import cycle** in both directions. A leaf module with no imports of its own cannot be. |
| 3 | `isUntouchedBlockStatus` lives in `fieldnotes/block-status-compare.ts`, not `types.ts` | Keeps S4's diff inside the S3a-contended `types.ts` to **18 added lines** (mostly comments) instead of 47. The plan's ~7-line target was for the field declarations; the helper would have quadrupled it. |
| 4 | Leaf-expansion tail is **day**-denominated, not GDD | One mechanism, arithmetic goldens, no weather curve threaded into `growth-core`. `LEAF_EXPANSION_TAIL_GDD = 200` is recorded as the documented equivalent. A GDD formulation buys nothing until S5a has a NEWA oracle to check either version against. |
| 5 | `formatShootLength` in `phenology/units.ts` | The plan's own documented deviation — `units-core.ts` owns conversion but has no length formatter and is off-limits to this lane. **Runbook §4 updated** so S1 folds it in when that lane owns the file. |
| 6 | Dev server run from the worktree with a copied-then-deleted `.env` | The main checkout is occupied by the S0 lane. Detailed in the QA report. |

## Lessons that change later phases — runbook edited, not just recorded

1. **§4 shared-file map** gained a row for `src/lib/phenology/units.ts` → S1 folds `formatShootLength`
   into `units-core.ts`.
2. **§9 S5b** — sour rot's coverage gate now carries the measured number and, more importantly, the
   rule that **an empty denominator is `unknown`, not a failed gate**. That distinction did not exist
   in the runbook before this phase measured it and found 0/0.
3. **§4 parallel-build mechanics** — a hard-won operational note: the generated Prisma client sits in
   the **shared** `node_modules`, so a parallel lane clobbers it *mid-session*, not just at start.
   It was clobbered **four separate times** during this build, each time surfacing as phantom "column
   does not exist" type errors in already-correct code. `npx prisma generate` must be chained into
   the **same command** as the tsc/verify run, not merely run beforehand.
4. **S6 inherits the C6 correction.** Already recorded in runbook §9 S6 during planning; the tail is
   now built and golden-tested, and S6 must consume it rather than re-deriving dilution from shoot
   length alone.

## Follow-ups raised

| What | Where |
|---|---|
| Manager vineyard assignment invisible under RLS (possible `app_rls` activation blocker) | task chip `Investigate manager vineyard assignment invisible under RLS` |
| Interactive UI placement QA | this report, "What is still open" |
| Re-measure scouting coverage before S5b plans sour rot | runbook §9 S5b |
