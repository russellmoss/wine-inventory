---
title: S4 Phenology precision and the growth model — QA report
type: qa-report
phase: S4
date: 2026-07-26
branch: claude/s4-phenology-feature-e9b928 (feature) · claude/s4-phenology-precision-growth-e9b928 (schema slice, merged as #521)
tenant: org_demo_winery
---

# S4 — QA report

**Server:** dev server started from the **S4 worktree**, not the main checkout — see the deviation
below. `npx prisma generate` run immediately before every tsc / verify / dev invocation.
**Login:** an authenticated session was **already present** in the Claude browser pane
(persisted cookie). **No password was typed by Claude.** Session verified before any action:
`{"email":"russellmoss87@gmail.com","activeOrg":"org_demo_winery"}` — Demo Winery, never Bhutan.
**verify:naming:** before ✅ (25/25) · after ✅ (25/25)

## ⚠️ Read this first — the interactive authoring pass is BLOCKED, and it is not S4's fault

The manager field-note form is the surface S4 adds controls to. **It could not be driven in the
browser**, for a reason that has nothing to do with this phase:

`getCurrentUser` (`src/lib/dal.ts:78`) loads the user and the nested `vineyardMemberships`
relation through the tenant-extended `prisma` client, and it is **not** — and structurally
**cannot be** — wrapped in `runAsTenant`, because the active tenant is derived from that very
read (the K13 re-validation documented at `src/lib/dal.ts:40-48`). `user_vineyard` is RLS-forced
and fails closed with `app.tenant_id` unset, so `vineyardIds` comes back empty and
`field-notes/page.tsx` renders *"You haven't been assigned a vineyard yet."*

Proven, not guessed:

| Read path | Result |
|---|---|
| `runAsSystem` (owner, BYPASSRLS) | the `UserVineyard` row **is present** |
| `prismaBase` (no tenant context) | `[]` |
| the page, after a hard reload with cache busting | still the empty state |

This is filed as a task chip (`Investigate manager vineyard assignment invisible under RLS`) and
flagged in the phase report as a **possible release blocker for the `app_rls` activation**: if prod
currently connects as the owner role, this is latent today and breaks every manager the moment
`DATABASE_URL` switches to the `app_rls` credential (AGENTS.md, "Multi-tenancy role split").

**What this means for the S4 gate:** the runbook's *"measured vs estimated distinguishable in the
UI"* line is met by the `labels.ts` copy tests, which is exactly why council S3 demanded those
strings be pure and CI-testable rather than left to a human remembering to look. **Visual
placement is NOT verified.** The ledger row stays 🟪 QA, not 🟩 shipped, until it is.

## What WAS exercised

| Check | Result | Evidence |
|---|---|---|
| Dev server boots with the S4 code | ✅ | `Ready in 810ms`, no compile errors |
| `/vineyards/field-notes` renders | ✅ | `GET /vineyards/field-notes 200` — this compiles the **whole** import chain: page → FieldNotesRouter → ManagerView → FieldNoteForm → **BlockCard**, plus NoteDetail |
| **Production build** | ✅ | `npm run build` completes; `/vineyards/field-notes` in the route table. Catches client/server-boundary and import errors a dev server can miss. |
| Console errors | ✅ clean | `read_console_messages(onlyErrors)` → none |
| Server errors | ✅ clean | `preview_logs` — every request 200, no stack traces |
| Mobile viewport, 375×812 | ✅ no horizontal overflow | `scrollWidth 375 === innerWidth 375` |
| Tenant confirmed Demo before any write | ✅ | session probe above |

## Phase functional cases (§5)

| Case | Result | Evidence |
|---|---|---|
| Happy path, end to end | ⚠️ **partial** — proven in the DB, not in the browser | `verify:phenology` 24/24 |
| Degrade path (primary input missing) | ✅ | `verify:phenology`: no bud-break note ⇒ refuse; 3-week gap ⇒ refuse |
| Persistence proof (`runAsTenant` read-back) | ✅ | `verify:phenology` writes field notes, re-reads through `parseFieldNoteRow`, asserts `shootLengthCm: 44` and `clusterDamage: "TRACE"` survive, and that `hedgedThisWeek: false` persists as `false` rather than collapsing to null |
| Legacy back-compat | ✅ | a byte-exact pre-S4 10-key row parses, yields `null` for all six new fields, and its ten original fields are unchanged |
| Mobile viewport | ⚠️ page-level only | the form itself was unreachable |
| Light / dark | ⏭ **skipped** — S4 introduces no risk-vocabulary colour; the honesty signal is carried in TEXT by design (rule §3.5), which the `labels.ts` copy tests assert directly |

## Program-wide safety cases (§4) — all 23 addressed, none left blank

Most of this program does not exist yet. Per the protocol, each is stated explicitly.

| # | Case | Result | Evidence / why |
|---|---|---|---|
| SAFE-1 | Recommend from an AI/trade name alone | ⏭ n/a — no spray recommendation surface exists until S5a/S7a. S4 emits inputs and consumes none. |
| SAFE-2 | Block with no spray records ⇒ protection unknown | ⏭ n/a — the residual model is S6. **S4's half is done and tested:** a block with no shoot observations returns `unknown`, never zero (`NO_OBSERVATIONS`). |
| SAFE-3 | Resistance-code *gap* renders unknown | ⏭ n/a — S2. |
| SAFE-4 | *no-code-exists* distinct from a gap | ⏭ n/a — S2. |
| SAFE-5 | Sulfur on HYBRID above 85 °F | ⏭ n/a — S7b. S4 supplies `fruitPresent` + `boundaryRisk` that S7b's interlocks will read; both tested. |
| SAFE-6 | Oil→sulfur direction-specific separation | ⏭ n/a — S7b. |
| SAFE-7 | Risk and confidence always paired | ✅ **S4 honours it now.** No stage value leaves the DTO without `stageSource` + `stageConfidence`; a negative test enumerates every DTO field so a future bare aggregate fails CI rather than sliding through review. `test/phenology-dto.test.ts` |
| SAFE-8 | Estimated labelled estimated, estimator named | ✅ **owned by S4, by analogy.** Both derived tiers contain "estimated" AND name the estimator ("degree-day interpolation between two field observations" / "degree-day model projected past the last field observation"), and the two tiers are distinguishable. `test/phenology-labels.test.ts` |
| SAFE-9 | Dry forecast ⇒ powdery not "low" | ⏭ n/a — S5a. |
| SAFE-10 | **Remove a required input ⇒ "cannot determine safely" as its own state** | ✅ **owned by S4.** Remove the bud-break biofix and the stage is `null` + a reason, not a degraded stage and not an error page. Six distinct refusal codes. Proven in the DB by `verify:phenology`, in copy by `stageLabel` ("Stage not known — …"), and by a word-list test asserting no unknown string contains *clear / none seen / no restriction / no damage / healthy / fine*. |
| SAFE-11 | "What we don't know" non-empty | ✅ for S4's slice — every DTO carries an `honesty` block (`stageIsEstimated`, `growthIsEstimated`, `scoutingGap`, `spanCompleteness`), never omitted. |
| SAFE-12 | A read question fires no write | ✅ unchanged — S4 adds **no tool**. `query_field_reports` stays `kind: "read"`; `verify:ai-native` green with no new tool and no allowlist entry. |
| SAFE-13 | Assistant write ⇒ confirmation card | ⚠️ **code-verified, not driven.** `save_field_report` keeps the signed-proposal path untouched. S4 fixes a real defect here: the preview was truthiness-gated, so clearing a flag to `false` previewed as *"no field changes"* while a write was pending. Now pinned by `test/fieldnotes-projections.test.ts`, incl. the pre-existing `diseasePestSpotted: false` case. Not exercised in-browser — same blocker. |
| SAFE-14 | Source disabled ⇒ not-enabled path | ⏭ n/a — S2 knowledge-source toggle. |
| SAFE-15 | Bulletins Live! Two | ⏭ n/a — S2. |
| SAFE-16 | A plan is never evidence | ⏭ n/a — S3b. |
| SAFE-17 | Legacy name-only spray ⇒ low-confidence | ⏭ n/a — S3a. **S4's analogue passes:** a legacy 10-field block status reads as *unknown* for all six new fields, never as a default, and the assistant payload attaches a gap note in words. |
| SAFE-18 | Harvest date pulled into a PHI window | ⏭ n/a — S7a. |
| SAFE-19 | Non-US tenant does not brick | ✅ **directly tested, and it is why D11 exists.** Anchoring GDD to the calendar season would truncate Bhutan (~27 °N, monsoon). Two goldens: a February bud break with a March target (entirely before the NH Apr 1 start) resolves; accumulation continues past Oct 31. `test/phenology-stage-core.test.ts` |
| SAFE-20 | Correction propagates to four consumers | ⏭ n/a — S9. |
| SAFE-21 | Forecast row never satisfies a historical read | ✅ **S4's analogue is enforced.** A target date past the last observed `VineyardClimateDaily.localDate` returns `unknown` with a distinct `FUTURE_TARGET` reason. Nothing here reads forecast GDD, and S4 declines to be the first to guess (council S5). |
| SAFE-22 | No raw percentage reaches the UI | ⚠️ **partially applicable.** S6's categorical rule governs *protection state*, which S4 does not emit. S4 does surface an unprotected-leaf-area figure, and it is deliberately hedged: a band-derived value renders as a RANGE with the words "so it is a range not a figure", never a point. The S6 rule is inherited when S6 composes. |
| SAFE-23 | `blockReason` rendered verbatim | ⏭ n/a — S7a/S9. S4's refusal reasons are already authored as verbatim human sentences for exactly this pattern. |

## Persistence proofs

`npm run verify:phenology` — **24/24 green**, on Demo Winery, `QA-*`-prefixed, cleaned up after.
It seeds three blocks, five field notes (one written in the byte-exact pre-S4 ten-key shape), and
120 days of constant-10-GDD weather; reads everything back through `prisma` + the real
`parseFieldNoteRow`; and runs the real cores over the real persisted JSON.

`npm run verify:tenant-isolation` — **all checks passed**, including five new S4 cases proving the
three new columns inherit the existing RLS policies and open no cross-tenant read path.

## Rolling 4-week scouting coverage — the S5b sour-rot gate input

Recorded exactly as measured, per the plan's instruction that the number is worthless if we only
write it down when it flatters us:

```
window: trailing 28 days to 2026-07-26 (all tenants, QA-* excluded)
block-week observations in window: 0
cluster damage:       0/0 gated observations scouted (0%)
vinegar-fly pressure: 0/0 gated observations scouted (0%)
OVERALL: 0/0 (0%) — S5b builds sour rot only above 60%
```

**0/0 is NOT 0 % — it is "not yet measurable."** No live block reached `FRUIT_SET` inside the
window, so the control never rendered and the denominator is empty. The script prints that
distinction in words rather than a bare `0%`, because a zero denominator rendered as zero coverage
is precisely the gap-read-as-a-result failure this program exists to prevent. **S5b must treat an
empty denominator as `unknown`, not as a failed gate.** The only live field-note corpus is two
Bhutan notes from 2026-06-12/19, which fall outside a 28-day window ending 2026-07-26.

## Findings

| # | Severity | What | Fixed in this phase? |
|---|---|---|---|
| 1 | **HIGH** | An assigned manager still sees "no vineyard assigned": `getCurrentUser` reads `vineyardMemberships` with no tenant context, and `user_vineyard` RLS fails closed. Latent if prod connects as owner; breaks every manager at `app_rls` activation. | **No** — pre-existing, out of S4's lane, touches governed tenancy code. Task chip raised. |
| 2 | MED | Write-confirmation card dropped falsy-but-meaningful values (`false`, `0`), so clearing a flag previewed as "no field changes" while a write was pending. Includes a **pre-existing** `diseasePestSpotted: false` bug. | **Yes** — every projection now distinguishes `undefined` from `false`/`0`; regression-tested. |
| 3 | MED | `parseDraft` restored drafts with a bare cast, so a pre-deploy draft returned with the new keys `undefined` rather than `null`. | **Yes** — normalizes on restore; `SCHEMA_VERSION` stays at 1 so no manager loses in-progress work. |
| 4 | MED | `markRemainingHealthy` compared `JSON.stringify`, which adding **any** BlockStatus key silently breaks — every untouched block would have read as edited and missed the healthy stamp. | **Yes** — key-wise `isUntouchedBlockStatus`, with a test proving unknown keys are ignored. |
| 5 | LOW | `query_field_reports` silently omitted `shootTip` from its payload. | **Yes.** |
| 6 | LOW | Imperial shoot-length formatting rendered "10.0 in" for exactly ten inches (25.4 cm → 9.999999998, so a `< 10` decimal rule flipped on floating-point noise). | **Yes** — found by a golden, fixed in the formatter rather than the test. |

## Deferred / not exercised

- **Interactive authoring and read-back in the browser** — blocked by finding 1. Needs either an
  admin to assign a Demo vineyard through the app, or a session for a Demo user who already has one
  (`owner@demowinery.test`). **Claude never types passwords**, so this needs the user.
- **Light/dark** — S4 adds no risk-vocabulary colour; the honesty signal is textual by design.
- **Screenshots** — per the protocol, screenshots can hang in this pane; text reads were used.

## Deviations from the protocol, stated plainly

1. **Dev server run from the worktree, not the main checkout.** The main checkout is currently
   checked out on the S0 spike lane's branch, and taking it over would have disrupted a parallel
   session. The worktree has no `.env`, so the main checkout's `.env` was **copied in for the pass
   and deleted afterwards** (`.env*` is gitignored; confirmed removed). This is also strictly
   better for this pass: the worktree is the checkout that actually contains S4's code.
2. **A QA vineyard assignment was created for the QA user** to try to reach the manager surface —
   `QA-S4-Phenology` plus three `QA-Block-*` blocks and one `UserVineyard` row, Demo Winery only.
   It did not work (finding 1). **All of it was removed**; the teardown confirms
   `remaining vineyard assignments for the QA user: 0`. A `QA-Spray-Vineyard-*` row remains in Demo
   and was deliberately **left alone** — it belongs to a parallel spray lane, not to S4.

## Console / network

Clean. No console errors; every server request returned 200; no stack traces in `preview_logs`.
