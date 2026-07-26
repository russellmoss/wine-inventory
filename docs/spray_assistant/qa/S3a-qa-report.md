---
title: S3a spray record + planned harvest — QA report
type: qa-report
phase: S3a
date: 2026-07-26
branch: claude/s3a-spray-record-pr3-surface (detached at d11c38d8 for the pass)
tenant: org_demo_winery
---

# S3a — QA report

**Server:** main checkout, detached at PR3 head (`11bcbf20`, then `d11c38d8` after the two in-phase
fixes), `npx prisma generate` run before start, `.next` cleared (see env findings), `npm run dev`.
**Login:** user-authenticated in the in-app Claude browser pane (russellmoss87@gmail.com, Demo
Winery) before the pass; the session survived the dev-server restarts.
**verify:naming:** before ✅ / after ✅ (25/25 both times).
**Driving technique:** `get_page_text` / DOM reads for verification; native-setter + `input`/`change`
event dispatch for controlled React inputs (the proven approach on this box — QA-PROTOCOL §2);
`.click()` on checkboxes/buttons. No screenshots (they hang in the pane).

## Safety cases (§4)

| # | Case | Result | Evidence |
|---|---|---|---|
| SAFE-1 | Assistant recommendation from AI/trade name | ⏭ not-yet-applicable | No spray assistant tool exists until S5a/S11 (rule §3.15). |
| SAFE-2 | Block with no spray records reads **unknown**, never protected | ✅ (at S3a scope) | No surface anywhere renders a protection claim; the record list shows the honest empty state ("No spray records yet"); the read contracts return UNKNOWN, pinned by `verify:spray-record` #8/#10 + unit tests. The protection *rendering* surface itself arrives in S6 and must re-run this case. |
| SAFE-3 | Uncoded AI (a *gap*) renders unknown; rotation can't claim OK | ✅ | Detail page: resistance groups render "unknown — not determined" + a "facts unknown" badge visually distinct from "known" (evidence below); DB CHECK makes `[] ∧ known=true` impossible; `rotationContribution` returns `{unknown}` (verify #8). |
| SAFE-4 | Legitimately-no-code AI renders *no-code-exists*, distinct from a gap | ⏭ not-yet-applicable | Needs S2's code derivation — no registry data exists yet, so every product is a *gap* today. |
| SAFE-5 | Sulfur × HYBRID × post-application heat | ⏭ | S7b surface. |
| SAFE-6 | Oil↔sulfur separation | ⏭ | S7b surface. |
| SAFE-7 | Risk + data-confidence paired | ⏭ | S5a+/S9 surfaces. |
| SAFE-8 | LWD labelled estimated | ⏭ | S1 surface. |
| SAFE-9 | Dry forecast ≠ low powdery risk | ⏭ | S5a surface. |
| SAFE-10 | "Cannot determine safely" is its own state | ✅ | The REI cell for a block line with no finish time renders **"unknown — cannot determine safely"** — a distinct italic maroon state, not a degraded value, not an error page (evidence below). |
| SAFE-11 | "What we don't know" section | ⏭ | S9's decision record. |
| SAFE-12/13/14 | Assistant read/write discipline, source toggle | ⏭ | S5a/S11 tools. |
| SAFE-15 | Bulletins Live! Two | ⏭ | S2. |
| SAFE-16 | Plan is never evidence | ⏭ | S3b. |
| SAFE-17 | Legacy name-only spray = low-confidence record, blocks rotation-OK | ✅ (core level) | No legacy UI surface yet; proven at the consumable seam: `verify:spray-record` #11 (seeded FieldNote → LOW confidence, `usableFor.rotation=false`, unknown contribution) + `test/spray-legacy.test.ts`. |
| SAFE-18 | Harvest date pulled forward fires a hard warning | ⏭ | S7a's reverse-check. The stream it consumes IS proven: the pull-forward wrote v2 with the audited predecessor, and `plannedHarvestChangesSince` derives `PULLED_FORWARD` (verify #12). |
| SAFE-19 | Non-US tenant does not brick | ✅ (at S3a scope, Bhutan-SHAPED fixture in Demo) | The browser form submitted with a **blank EPA number** and wrote cleanly; the line resolved `factsCompleteness=UNKNOWN`, `productIdentitySource=UNKNOWN` (DB proof). The manual product-facts path is S2b. |
| SAFE-20 | Correction propagates to all four consumers | ⏭ | S9 gate — the consumers don't exist yet. Correction-as-event itself proven (below). |
| SAFE-21 | Forecast row never satisfies a historical read | ⏭ | S1's `seriesKind`. |
| SAFE-22 | Categorical protection, no raw % | ⏭ | S6. |
| SAFE-23 | `blockReason` verbatim | ⏭ | S7a/S11. |

## Phase functional cases (§5)

| Case | Result | Evidence |
|---|---|---|
| Happy path: record a pass in the browser | ✅ | Form at `/vineyards/sprays/new` → submitted → redirected to detail. Header (applicator+license, method, times, pest, 900 L/ha, NNW 8 kph 21 °C), 1 material (5 LB per area/acre, REI 24 as-written), 2 block lines. |
| Honesty rendering on the detail | ✅ | "facts unknown" badge + "unknown — not determined" groups + facts-as-of caption; REI known for B1 anchored on its OWN 11:30 finish (+24 h → 2026-07-21 11:30), **never** the header's 13:00; B2 (no finish) → "unknown — cannot determine safely"; drying → "not determined" (never "no"); rate provenance shown (measured 939 L/ha = 380 L / 0.405 ha vs header volume 900). |
| Correction flow | ✅ | "Correct" reopens the form fully prefilled; wind 8→12 + reason → **revision 2**; chain renders "v1 (superseded) → v2 (active, amendment)"; reason displayed. |
| Superseded revision reachable + immutable | ✅ | v1 loads with "superseded" badge, "not correctable — already-superseded", ORIGINAL content intact (wind 8, unshifted times), successor linked. |
| Planned harvest: set / pull forward / split pick / retract | ✅ | B9: set 2026-10-10 (v1) → pulled to 2026-09-30 (v2) → "sparkling: 2026-08-25 (v1)" coexisting (earliest first) → sparkling retracted (row gone, main remains). |
| Degrade path: no derivable area | ✅ | Blocks without spacing render "no derivable area — enter one if selected" (never a guessed number); an underivable + unentered area is a server-side error, not a default. |
| Persistence proofs | ✅ | 16-assertion `runAsTenant` read-back (below). |
| Mobile viewport (375×812) | ✅ | Body never scrolls horizontally; the wide materials/blocks tables scroll inside themselves (`.app-main table` display:block overflow-x:auto; probed: scrollW 1235 in clientW 310, canScroll=true). |
| Light/dark | n/a | The app is light-only by design (DESIGN.md). |

## Persistence proofs

`tmp-s3a-qa-proof.ts` (run with `tsx --conditions=react-server --env-file=.env`, then deleted) —
**16/16 ✓**: chain 1 = two revisions with correct pointers/status, v1 content byte-level intact
(wind 8, 2026-07-20T10:00Z), v2 carries the correction; v1's two block lines (one null finish);
material UNKNOWN facts + null EPA + `resistanceGroupsKnown=false`; **fix 1 at the DB**
(`treatedAreaSource=DERIVED_FROM_SPACING` for an untouched prefill); **fix 2 at the DB** (untouched
correction: identical `startedAt` across revisions); planned-harvest stream (main v1 SUPERSEDED
2026-10-10 + v2 ACTIVE open 2026-09-30; sparkling RETRACTED + closed, no successor); audit rows
present. Teardown purged 4 applications (+cascaded lines), 3 harvest events, 10 blocks, 1 vineyard
via the owner+GUC path; final count: zero spray records, QA vineyard gone.

## Findings

| # | Severity | What | Fixed in this phase? |
|---|---|---|---|
| 1 | MED | Untouched pre-filled block area submitted as a number → recorded `OPERATOR_ENTERED` instead of `DERIVED_FROM_SPACING` (CQ2 provenance wrong for the default path). | ✅ `d11c38d8` — untouched drafts send null; the core derives. Re-proven in browser + DB. |
| 2 | HIGH | Correction prefill rendered stored UTC instants into `datetime-local` inputs (browser reads local wall time) → an untouched correction silently shifted every timestamp by the viewer's UTC offset (proven: v1 10:00Z → v2 14:00Z). On a REI/PHI record a silent +4 h shift is a compliance defect. | ✅ `d11c38d8` — server sends full ISO; the client converts UTC→browser-local. Re-proven: untouched correction keeps identical instants. |

Environment notes (not code defects): a stale `.next` Turbopack cache from a pre-S3a server made
every NEW nested route 404 until `.next` was cleared — switching branches under a running dev
server requires kill + `rm -rf .next` + restart; and the dev server must be restarted after
`prisma generate` (the in-process client predates new models — the "findMany of undefined" error).

## Deferred / not exercised

- The 17 ⏭ SAFE rows above, each with the phase that owns its surface — none left blank.
- Voiding from the UI: no void button in the minimal surface (deliberate — correction covers the
  QA path; `voidSprayApplicationCore` is DB-proven by `verify:spray-record` #5). Surface arrives
  with the S11 write tool or Phase 20's WO lifecycle.
- Cross-site (multi-vineyard) pass via the form: core-proven (verify #3/KD-12); not driven in the
  browser this pass.

## Console / network

`read_console_messages onlyErrors` — clean (no console errors after the cache fix). Server log:
only the known `inbox.countUnread.slow` notices.
