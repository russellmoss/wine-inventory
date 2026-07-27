---
title: Whole-tank tasting notes — fan a note out to every co-resident lot
type: feat
status: draft
date: 2026-07-20
branch: feat/whole-tank-tasting-notes
depth: deep
units: 9
---

## Overview

You taste the tank, not one lot inside it. Today a tasting note on a multi-lot vessel forces the
winemaker to pin one of three lots for a note that describes all three. Chem panels solved this in
plan 060 by fanning one physical reading out to every co-resident lot, all rows sharing a group id.
This does the same for tasting notes, mirroring that precedent line for line.

## Problem Frame

**Who has this problem:** any winemaker tasting a co-ferment or a blended tank. Reported directly in
feedback `cmrsrs02`:

> "the reality is we are tasting the whole tank, not just one lot within it. the tank is now one lot,
> even though it's a collection of 3. but we still are required to select [one]. that's a problem
> because we are tasting the whole tank."

**What forces the choice today.** `recordTastingNoteCore` (src/lib/chemistry/tasting.ts:48) accepts a
`vesselId` but immediately collapses it through `resolveVesselLot`, which throws on ambiguity
(src/lib/chemistry/resolve-lot.ts:64): *"This vessel holds more than one lot — pick which lot the
record is for."* The assistant surfaces that as a clickable lot picker; the bench form disables submit
until a lot is chosen.

**Why the design is settled.** The one-lot rule is per ROW. A fan-out writes N rows, each still
attached to exactly one lot, so nothing in VISION D2 blocks it. The migration that added the chem
equivalent says so explicitly: *"VISION D2 preserved: every panel still attaches to exactly one lot.
This column only GROUPS the N single-lot panels produced by one physical whole-tank reading."*

**If we do nothing:** the winemaker keeps attributing a whole-tank impression to an arbitrary lot,
which is quietly wrong data. It also leaves the assistant inconsistent with itself — `record_measurement`
already fans out on the same tank while `record_tasting_note` refuses to.

**Pressure test.** Is this the right problem? Yes, and it is the reporter's actual ask; plan 083 fixed
a different bug found while investigating it. Is there a simpler framing? Yes, and it is worth naming:
we could fan out without a group id at all. Rejected — see Key Decisions.

## Requirements

- MUST: a tasting note on a multi-lot vessel writes one row per co-resident lot, sharing a group id.
- MUST: naming ONE lot explicitly still writes exactly one row.
- MUST: a single-lot vessel behaves byte-identically to today (null group, one row).
- MUST: the confirm card names the lots it will write to, so the human-in-the-loop step stays honest.
- MUST: voiding a fanned-out note voids the whole group, mirroring `voidPanelCore`.
- MUST: a retry with the same base is idempotent, not a duplicate.
- MUST: the free-text tasting search shows one hit per physical tasting, not N.
- SHOULD: the migration is additive, nullable, no backfill, and reviewable on its own.
- NICE: surface "whole tank · N lots" in the note's rendered summary so the reader knows.

## Scope Boundaries

**In scope:** the tasting core, its action wrapper, group-aware void, the assistant tool + committer,
the one display surface that would otherwise duplicate, tests, and the schema migration.

**Out of scope, with reasons:**
- **The bench form (`src/components/cellar/forms/TastingForm.tsx`).** Research turned up that plan 060
  never wired its own fan-out into the `/bulk` bench forms either — `AnalysisForm.tsx` still calls
  `useLotPick` and still forces a lot. The two bench forms are currently consistent with each other.
  Wiring only the tasting one would create a new inconsistency pointing the other way. Follow-up below.
- **The vessel timeline.** It does not render tasting notes at all today
  (`src/lib/vessel/timeline-data.ts` has zero tasting references), so there is nothing to dedup there.
  `TimelineEntryDetail.tsx` already has a `kind === "TASTING"` branch, but it is unreachable from the
  vessel timeline. Do not "fix" it here.
- **Lot-scoped views.** The lot timeline (`src/lib/lot/data.ts:294`) must keep showing one entry per
  lot. That is the same rule chem panels follow and it is correct: each lot really does carry the note.
- **A `search_tasting_notes` assistant read tool.** Does not exist; not this plan.

## Research Summary

### Codebase Patterns

**The planner is pure and tiny** — `src/lib/chemistry/fanout-plan.ts:1-24`.
`planVesselReadingFanout(residentLotIds, base)` returns
`{ vesselReadingGroupId: "vrg:" + base, perLot: [{ lotId, clientRequestId: groupId + "#" + lotId }] }`.
Fully deterministic, DB-free, so a replay lands the same keys and the DB unique turns it into a no-op.
Tested with no database in `test/chemistry-fanout.test.ts` (7 cases).

**The collapse helper is already generic** — same file, lines 26-47. `physicalReadingKey(p)` returns
`p.vesselReadingGroupId ?? p.id`; `dedupeByPhysicalReading(rows)` keeps one representative. Both are
typed over `{ id, vesselReadingGroupId }`, so a tasting row with a differently-named column will not fit
without a small generalization. Two call sites today, both vessel-scoped
(`src/lib/chemistry/data.ts:84-104`, `src/lib/vessel/timeline-data.ts:231-247`).

**The core shape to mirror** — `recordVesselReadingCore` (src/lib/chemistry/measurements.ts:199):
list residents → throw if empty → if exactly one, delegate to the unchanged single-lot path and return
a null group → else plan, check idempotency by querying the group, write N rows in `runInTenantTx`.

**Group-atomic void** — `voidPanelCore` (src/lib/chemistry/measurements.ts:279-315) selects
`targets = panel.vesselReadingGroupId ? <all live panels in that group> : [just this one]`, writes one
audit row per target, and returns `{ panelId, voidedPanelIds }`. The tasting equivalent
(`voidTastingNoteCore`, tasting.ts:123-144) is single-row and returns a scalar id.

**The migration precedent** — `prisma/migrations/20260712210000_analysis_panel_vessel_reading_group/migration.sql`
is 17 lines: one nullable `TEXT` column, one plain index on `(vesselId, groupId)`, one UNIQUE on
`(tenantId, groupId, lotId)`. No backfill, no staged NOT NULL. Postgres treats NULLs as distinct in a
unique index, so legacy rows never collide — effectively partial.

**Display surfaces for tasting notes are only two**, which is the scope-shrinking finding:
`src/lib/lot/data.ts:294` (lot timeline, lot-scoped, must NOT dedup) and `src/lib/lot/data.ts:116-134`
(`searchTastingNotes`, a flat `findMany` with `take: 25` feeding the `TastingSearch` list in
`LotsClient.tsx`). **Only the search list would show one whole-tank note three times.**

### Prior Learnings

- **Never `prisma migrate dev` in this repo.** It is interactive and injects a phantom
  `search_vector DROP DEFAULT` diff that errors. The documented flow is hand-authored:
  `migrate diff --from-url <DATABASE_URL_UNPOOLED> --to-schema-datamodel ./prisma/schema.prisma --script`,
  pipe through `grep -v 'search_vector'`, write to `prisma/migrations/<ts>_<name>/migration.sql`, then
  `migrate deploy` + `generate`. Stop the dev server before `generate` (EPERM on the query-engine DLL).
  This is documented in plan 019 and restated in plan 060, **not** in CLAUDE.md.
- **ONE DATABASE.** `.env` and production are the same Neon instance and it holds the real Bhutan
  tenant. Any migration applied locally is already live. `package.json` has no `db:deploy`;
  `db:migrate` maps to the forbidden `migrate dev`.
- **No schema-drift guard exists.** `verify:migration` is a false friend (it verifies the data-import
  feature, not schema migrations). CI applies migrations in `feedback-domain-verify` and
  `tenant-isolation` against ephemeral Postgres; the `check` job does not.
- **There is no vitest harness for `recordVesselReadingCore`.** Its only coverage is
  `scripts/verify-chemistry.ts` section 7, which hits the real DB with `ZZ-TEST-*` fixtures and scrubs
  in a `finally`. That script already imports `recordTastingNoteCore` and already scrubs
  `lotTastingNote` by `enteredByEmail`, so the tasting fan-out belongs there, not in a new harness.
- Plan 083: a golden case that cannot fail before the fix is decoration. Route it through shipped code.

### External Research

None needed. Postgres NULL-distinct-in-unique-index behavior is the only non-obvious dependency and it
is already relied on by the chem precedent.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Grouping column | `vesselTastingGroupId String?` on `LotTastingNote`, mirroring the chem column | No group id, just N independent rows | Without a group, void cannot be atomic, retries duplicate, and search cannot dedup. The chem precedent already proved the shape |
| Migration shape | One additive nullable column + `@@unique([tenantId, vesselTastingGroupId, lotId])` + `@@index([vesselId, vesselTastingGroupId])`, no backfill | Staged add-then-constrain | Copy the 17-line chem migration. NULLs distinct means legacy rows are untouched and the unique is effectively partial |
| Migration procedure | Hand-authored `migrate diff` → `grep -v search_vector` → `migrate deploy` → `generate` | `npm run db:migrate` (`migrate dev`) | `migrate dev` is interactive and produces a phantom diff against this Neon instance. It is also pointed at production |
| Where the migration is first applied | **A throwaway Neon branch, diffed, then the shared instance** (approved 2026-07-20) | Straight to the shared instance, as plan 060 did | `.env` is production and holds the real Bhutan tenant. The chem migration going fine is not evidence this one will. Ten minutes of proof against a branch is cheap next to a bad `ALTER TABLE` on a customer's data |
| Planner | Generalize `fanout-plan.ts` to take a group prefix; tasting uses `vtg:` | A copy-pasted tasting planner; reuse `vrg:` verbatim | One pure module, two prefixes. Sharing the `vrg:` prefix would make group ids ambiguous across tables |
| Dedup helper | Generalize `physicalReadingKey` / `dedupeByPhysicalReading` to read a caller-named group field | A second near-identical pair | They are already generic apart from the field name |
| Void semantics | Group-atomic. Voiding any row in a group voids all live rows in it; return `{ tastingNoteId, voidedNoteIds }` | Void one row only | Mirrors `voidPanelCore` exactly. A half-voided group is a data state nothing else in the app can represent |
| Bench form | OUT of scope | Wire it now | `AnalysisForm.tsx` is in the identical state; fixing one leaves the pair inconsistent. Do both together, later |
| Which display collapses | Only `searchTastingNotes` | Also the lot timeline | Lot-scoped views must NOT dedup — each lot genuinely carries the note. Same rule chem panels follow |
| Test home | Extend `scripts/verify-chemistry.ts` + `test/chemistry-fanout.test.ts` | New vitest DB harness | No DB vitest harness exists for this area; verify-chemistry already covers the chem twin and scrubs tasting rows |

## Implementation Units

### Unit 1: Generalize the pure fan-out planner and dedup helpers

**Goal:** One pure module serves both readings and tastings, with no behavior change for readings.
**Files:** `src/lib/chemistry/fanout-plan.ts`, `test/chemistry-fanout.test.ts`
**Approach:** Add a group-prefix parameter so a caller can mint `vrg:` or `vtg:` ids, and let the
dedup helpers read a caller-named group field instead of hard-coding `vesselReadingGroupId`. Keep
`planVesselReadingFanout` exported with its current signature and behavior so existing callers and
their tests are untouched.
**Tests:** Existing 7 cases must pass unmodified — that is the proof of no behavior change. Add: a
tasting-prefixed plan produces `vtg:`-prefixed ids; two plans from the same base but different
prefixes never collide; the generalized dedup collapses by whichever field it is told to read.
**Depends on:** none
**Execution note:** characterization-first — run the existing suite before touching anything.
**Patterns to follow:** `src/lib/chemistry/fanout-plan.ts:1-47`; test style at `test/chemistry-fanout.test.ts`
**Verification:** `test/chemistry-fanout.test.ts` green with the original cases unedited.

### Unit 2: Schema + migration for `vesselTastingGroupId`

**Goal:** The column exists in production with the right constraints and nothing else changed.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_lot_tasting_note_vessel_tasting_group/migration.sql`
**Approach:** Mirror the chem migration exactly: nullable `TEXT`, a `(vesselId, vesselTastingGroupId)`
index, a `(tenantId, vesselTastingGroupId, lotId)` unique. Author the SQL by hand via `migrate diff`
filtered for `search_vector`, never `migrate dev`. Carry over the explanatory comments — they are the
reason the next person will not "tidy" the partial unique away. Also add the missing
`@@unique([tenantId, id])` **only if** research confirms it is required by the tenant extension for
this table; otherwise leave it alone and note why.
**Tests:** The generated SQL contains ONLY the column and the two indexes — diff it before applying.
**Depends on:** none
**Execution note:** This unit is the irreversible one, and the approved procedure is branch-first:
create a throwaway Neon branch, apply the migration there, diff it to confirm ONLY the column and the
two indexes changed, then apply to the shared instance and delete the branch. Neon branch tooling is
available to the agent. Apply it as its own commit so it can be reasoned about in isolation.
**Patterns to follow:** `prisma/migrations/20260712210000_analysis_panel_vessel_reading_group/migration.sql`
**Verification:** the Neon branch diff shows only the column and two indexes; after applying to the
shared instance `migrate diff` reports no remaining drift; `db:generate` produces the field; full
`vitest` still green (schema change alone must break nothing); the throwaway branch is deleted.

### Unit 3: `recordVesselTastingNoteCore`

**Goal:** The core writes N rows for a multi-lot vessel and exactly one for everything else.
**Files:** `src/lib/chemistry/tasting.ts`
**Approach:** Mirror `recordVesselReadingCore`: list residents, throw a friendly error if the vessel
is empty, delegate to the unchanged single-lot path when there is exactly one resident (returning a
null group), otherwise plan with the `vtg:` prefix, check for a pre-existing group, and write the rows
in one `runInTenantTx`. Leave `recordTastingNoteCore` alone — an explicit `lotId` must keep writing one row.
**Tests:** Covered in Unit 7 (live DB). Pure planning behavior is already covered by Unit 1.
**Depends on:** Units 1, 2
**Patterns to follow:** `src/lib/chemistry/measurements.ts:199-260`
**Verification:** `npx tsc --noEmit` clean; exercised by Unit 7.

### Unit 4: Group-atomic void

**Goal:** Undoing a whole-tank tasting note removes it from every lot, not one.
**Files:** `src/lib/chemistry/tasting.ts`, `src/lib/chemistry/actions.ts`
**Approach:** Rewrite `voidTastingNoteCore` to select targets by group when the row carries one, write
one audit row per target with a group-aware summary, and return `{ tastingNoteId, voidedNoteIds }`.
Update the action's return type and any caller that reads it.
**Tests:** Covered in Unit 7. Callers: the two void buttons in `TimelineEntryDetail.tsx:331` and
`LotDetailClient.tsx:867` — confirm neither breaks on the wider return type.
**Depends on:** Unit 3
**Patterns to follow:** `src/lib/chemistry/measurements.ts:279-315`
**Verification:** `npx tsc --noEmit`; Unit 7 asserts group-atomic void.

### Unit 5: Action wrapper

**Goal:** The fan-out is reachable as a server action with the repo's usual guard.
**Files:** `src/lib/chemistry/actions.ts`
**Approach:** Add `recordVesselTastingNoteAction` next to `recordVesselReadingAction`, same `action()`
wrapper, same actor derivation, same error surface.
**Tests:** Type-level; exercised end-to-end by Unit 7 and the browser QA.
**Depends on:** Unit 3
**Patterns to follow:** `src/lib/chemistry/actions.ts:53` and `:70`
**Verification:** `npx tsc --noEmit`.

### Unit 6: Assistant tool stops asking and starts fanning out

**Goal:** "log a tasting note on T7 that it smells like rotten eggs" writes to all three lots.
**Files:** `src/lib/assistant/tools/record-tasting-note.ts`
**Approach:** Mirror `record-measurement.ts`: before falling through to `resolveLotTargetOrChoice`,
detect the whole-vessel case and build a fan-out proposal instead of a picker. The confirm card must
name the lots. The committer branches on a `fanout` flag plus `vesselId`, calls the new action, and
reports "…on the whole T7 — 3 lots." An explicitly named lot must still take the single-lot path and
still get the picker when genuinely ambiguous.
**Tests:** Unit 8.
**Depends on:** Units 3, 5
**Patterns to follow:** `src/lib/assistant/tools/record-measurement.ts:123-141` (tool) and its
`commitRecordMeasurement` fan-out branch
**Verification:** `npx tsc --noEmit`; Unit 8 evals.

### Unit 7: Live-DB proof in `verify:chemistry`

**Goal:** Prove the fan-out, the single-lot passthrough, idempotency, and group-atomic void against a
real database.
**Files:** `scripts/verify-chemistry.ts`
**Approach:** Add a tasting section mirroring section 7's reading assertions, reusing the existing
`ZZ-TEST-*` fixture helpers and the `finally` scrub (which already deletes `lotTastingNote` by
`enteredByEmail`).
**Tests:** Assert: single-lot vessel writes one row with a null group; multi-lot writes one row per
resident sharing one group id; every row is still single-lot; an explicit lot writes exactly one row;
a lot named on a vessel it does not occupy is refused; a re-run with the same base adds no rows;
voiding one row in a group voids all of them.
**Depends on:** Units 3, 4, 5
**Patterns to follow:** `scripts/verify-chemistry.ts:184-237`
**Verification:** `npm run verify:chemistry` green, fixtures scrubbed, `verify:naming` still green.

### Unit 8: Assistant evals

**Goal:** The routing is provably fixed, and provably was broken before.
**Files:** `test/evals/assistant-write-tools.golden.ts`, `test/evals/assistant-fleet.golden.ts`,
`test/evals/assistant-must-propose.golden.ts`
**Approach:** Add a whole-tank tasting utterance to the write-tools golden (selection), a fleet case
(discrimination against `record_measurement`, which owns the numeric side of the same tank), and a
must-propose case. The assistant-coverage definition of done requires a golden AND a fleet case, so
both are mandatory, not optional.
**Tests:** The new must-propose case must be measured FAILING before Unit 6 and passing after. Route
it through shipped code — do not encode the expectation in the harness. Depth is load-bearing on
history cases; a fixture must not collide with its own utterance.
**Depends on:** Unit 6
**Execution note:** test-first — measure the pre-fix rate before Unit 6 lands, or the case proves nothing.
**Patterns to follow:** plan 083's history axis; `docs/architecture/assistant-coverage.md` DoD
**Verification:** `npm run eval:assistant-must-propose` for the new case; structural half green with no key.

### Unit 9: Collapse the search list, and update the registers

**Goal:** One whole-tank note appears once in tasting search, and the docs tell the truth.
**Files:** `src/lib/lot/data.ts`, `docs/architecture/assistant-coverage.md`, `TODOS.md`,
`docs/.brain-refresh-marker`
**Approach:** Apply the generalized dedup to `searchTastingNotes` only. Note the `take: 25` interacts
with dedup — collapsing after the limit can return fewer than 25 results; decide and state whether to
over-fetch. Update the coverage matrix row for tasting, remove the TODOS entry this plan closes, and
refresh the brain marker because `prisma/schema.prisma` and `prisma/migrations/` were touched.
**Tests:** A pure test over the dedup at the search boundary; assert the lot timeline still does NOT dedup.
**Depends on:** Units 1, 3
**Patterns to follow:** `src/lib/chemistry/data.ts:84-104`; CLAUDE.md's brain-refresh rule
**Verification:** `npm run verify:ai-native` green (regenerate the coverage doc if stale); full `vitest`.

## Test Strategy

**Pure unit:** `test/chemistry-fanout.test.ts` for planner and dedup. The existing 7 reading cases
passing unmodified is the no-regression proof.

**Live DB:** `npm run verify:chemistry`, extended. This is where the fan-out, idempotency and
group-atomic void are actually proven, because no vitest DB harness exists for this area.

**Eval:** write-tools + fleet + must-propose. The must-propose case must be shown failing pre-fix.

**Manual, in the Demo Winery sandbox only (`org_demo_winery`, never Bhutan):** ask the assistant to
log a tasting note on **T7** (a genuine 3-lot tank: 2024-OAK-1-CS-2, 2024-RRR-1-PN, 2024-PN). Confirm
the card names all three lots, confirm it, then prove three rows sharing one group id with a
`runAsTenant` read-back. Void one and prove all three go. Then check the tasting search shows the note
once, and the lot timeline shows it on each lot. Clean up; `verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration applied to production by accident | LOW (was MED) | HIGH | `.env` IS production. Mitigated by branch-first: prove and diff on a throwaway Neon branch before the shared instance. Unit 2 is its own commit; the change is additive and nullable so existing rows are untouched |
| `migrate dev` used out of habit | MED | HIGH | It is the default-looking `npm run db:migrate`. The plan names the hand-authored flow explicitly; do not use the npm script |
| Generalizing the shared planner regresses chem readings | LOW | HIGH | Keep `planVesselReadingFanout`'s signature and behavior; the existing 7 tests must pass unedited |
| Void return-type change breaks a caller | LOW | MED | Only two void buttons consume it; `tsc` catches the rest |
| Dedup applied to a lot-scoped view by mistake | MED | MED | The helper's doc comment already warns; Unit 9 asserts the lot timeline does NOT dedup |
| `take: 25` + dedup returns short pages | MED | LOW | Called out in Unit 9 as a decision, not a surprise |
| Bench form left inconsistent with the assistant | HIGH | LOW | Deliberate and documented; `AnalysisForm` is in the same state, so the pair stays consistent |
| Voiding a group surprises the user | MED | MED | Pre-existing for chem panels — none of the four void affordances warn. Inherited, not introduced; logged as a follow-up |

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Reporter's own words, and the forcing throw is identified at a specific line |
| Scope Boundaries | HIGH | Research found the vessel timeline does not show tastings at all, which removed a surface I expected to need work |
| Implementation Units | HIGH | Every unit mirrors a named precedent with file:line references |
| Test Strategy | HIGH | The live-DB harness already exists and already scrubs tasting rows |
| Risk Assessment | HIGH (was MEDIUM) | Raised by the branch-first decision: the migration is now proven on a throwaway Neon branch and diffed before it touches the instance holding the real Bhutan tenant |

## Follow-ups (not this plan)

- **Wire the fan-out into both `/bulk` bench forms.** `TastingForm.tsx` and `AnalysisForm.tsx` both
  still force a lot pick; `FermentMonitor.tsx` shows the pattern with its "Whole tank · N lots" scope
  toggle. Do them together so the pair stays consistent.
- **Warn before voiding a grouped record.** None of the four void affordances tell the user it will
  drop off every co-resident lot. Pre-existing for chem panels; this plan inherits it.
- **`voidTastingNoteCore` has no assistant tool** (the coverage matrix records `void = ❌`).
- **`trace.ts` `MAX_ARRAY = 20`** truncates `toolNames` in stored feedback traces (from plan 083).
