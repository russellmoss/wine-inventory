---
title: NL barrel group/range support for maintenance work-order tasks
type: feat
status: draft
date: 2026-07-12
branch: feat/nl-maintenance-barrel-group
depth: standard
units: 4
---

## Overview

Let a winemaker author one maintenance work order that spans a barrel group/range by natural
language — "clean and sanitize b1 through b4" fans out to one maintenance task per barrel — the
same way "rack barrels B101-B110 to tank 5" already expands today. Closes the root cause of Demo
Winery bug `cmria8qbs` (TRIAGED/PRODUCT_GAP).

## Problem Frame

The NL work-order path expands a barrel group/range (a range like `B101-B110`, a saved
VesselGroup name, or a comma/and list) **only** for `BARREL_DOWN` and `RACK_TO_TANK`, via the
`toGroup`/`fromGroup` fields. Maintenance kinds (`CLEAN`, `SANITIZE`, `STEAM`, `OZONE`, `GAS`,
`SO2`, `WET_STORAGE`) accept a single `vessel` only. So when a user says "clean/sanitize b1–b4"
the model mirrors the barrel-down group pattern, the range lands in no valid field, `vessel` comes
up empty, and `nl-proposal.ts:440-442` throws "A {kind} task needs a vessel." The user sees the
assistant refuse with "it wants the vessels" even though they gave b1–b4.

Do nothing: barrel maintenance (a routine, high-volume cellar chore — you clean barrels in batches,
never one at a time) stays un-authorable by voice/chat. The winemaker falls back to the visual
builder and adds four barrels by hand, or files another bug. This is a real workflow, not an edge case.

## Requirements

- MUST: A maintenance NL intent accepts a barrel group/range (range / saved group / comma-or-`and`
  list) as an alternative to a single `vessel`, and fans out to one maintenance task per member.
- MUST: The existing single-`vessel` maintenance path is unchanged (no regression).
- MUST: Each fanned task carries the same declared fields (material/amount/gasType/so2Method/
  durationMin/note) filtered by that kind's `TASK_VOCABULARY.fields`, exactly as the single-vessel
  path does today (WORKORDER-3: maintenance stays record-only, no ledger/cost, per barrel).
- MUST: A multi-barrel maintenance golden exists so the D26/H8 assistant-write-tool eval-coverage
  CI gate stays green.
- MUST: Reuse the existing range/group resolver (`resolveGroupMembers` / `expandVesselRange`), do
  not invent a second parser.
- SHOULD: A clear relayable error when neither a vessel nor a group is supplied, and when a range is
  inverted/oversized (the latter already surfaces from `expandVesselRange`).
- SHOULD: "clean **and** sanitize b1–b4" produces two maintenance kinds each fanned across the 4
  barrels (8 tasks) — falls out naturally since each raw intent expands independently.
- NICE: Fanned tasks share the intent's group sequence index so they run in parallel (order-free).

## Scope Boundaries

**In scope:**
- NL maintenance intent shape + proposal parse (`nl-proposal.ts`).
- Maintenance resolve fan-out (`nl-resolve.ts`).
- Assistant `propose_work_order` tool schema + description + prompt guidance.
- One eval golden + proposal unit tests.

**Out of scope:**
- Tank/vessel groups for non-maintenance kinds (already covered where relevant; not expanding scope).
- A grouped single-op model for maintenance (barrel-down uses ONE ledger op with N lines; maintenance
  has no ledger op, so N independent record-only tasks is correct — do NOT build a group-op wrapper).
- The visual builder (this is the NL/assistant path only; the builder already lets you add N barrels).
- Multi-lot / "one must, one reading" concerns — unrelated.

## Research Summary

### Codebase Patterns
- **Range/group resolver already exists and is the reuse target:** `resolveGroupMembers(expr)` in
  `src/lib/work-orders/nl-resolve.ts:142` returns an ordered, deduped `ResolvedVesselState[]` from a
  range / saved group / comma-`and` list, throwing relayable messages on empty/single/ambiguous. It
  wraps `expandVesselRange` (`src/lib/vessels/range.ts:17`, pure, throws on inverted/oversized) and
  `resolveGroupByName`. Barrel-down/rack-to-tank resolution already call it.
- **Barrel-down proposal parse (the shape to mirror):** `nl-proposal.ts:291-317` reads `toGroup`/
  `fromGroup` from many aliases (`raw.toGroup ?? raw.destinations ?? raw.barrels ?? raw.group ?? raw.to`)
  and pushes a single intent carrying the group string; nl-resolve expands it later.
- **Maintenance parse (what changes):** `nl-proposal.ts:440-453` — `NL_MAINTENANCE_KINDS` set at
  `nl-proposal.ts:64`; intent type at `nl-proposal.ts:27` (`{ kind: NlMaintenanceKind; vessel: string; … }`).
- **Maintenance resolve (what changes):** `nl-resolve.ts:589-617` — resolves one `vessel`, builds ONE
  `taskBuild` (`taskType: intent.kind`) + one `task` summary, with fields filtered by
  `TASK_VOCABULARY[intent.kind].fields` and the verb from `TASK_LABELS[intent.kind]`.
- **Tool schema:** `src/lib/assistant/tools/propose-work-order.ts:326-335` — `toGroup`/`fromGroup`
  described for BARREL_DOWN/RACK_TO_TANK; `vessel` described as the maintenance/addition/etc. target.

### Prior Learnings
- `nl-maintenance-single-vessel-no-range` (confidence 9, this session): maintenance NL kinds are
  single-vessel; group/range expansion is wired only for barrel-down/rack-to-tank.
- "50% rollers" (#121) precedent: fixes to `src/lib/work-orders/*` are **outside** the `src/lib/assistant`
  feedback auto-fix fence, so this ships as a normal human-reviewed PR (not the auto-fixer).
- Repo convention (memory): build in the MAIN checkout `C:\Users\russe\Documents\Wine-inventory`
  (has `.env` → `verify:*` + dev server work), branch, PR to protected `main`. Not in a worktree.
- D26/H8 (memory, plan 038): assistant write tools have a HARD eval-coverage CI gate — every write
  tool needs a golden. `propose_work_order` already has goldens in `test/evals/assistant-write-tools.golden.ts`.

### External Research
None — no new libraries. Pure internal refactor reusing existing helpers.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where to expand the group | At the **resolve** layer (`nl-resolve.ts`), fan N taskBuilds | Expand in `canonicalizeRawIntents` (proposal) | `resolveGroupMembers` is async + DB-backed (saved-group names); `canonicalizeRawIntents` is pure/sync. Keep the proposal layer pure; expand where the resolver already lives. |
| Intent shape | Add optional `vesselGroup?: string`; make `vessel` optional; require `vessel \|\| vesselGroup` | Overload `vessel` to hold a range string | An explicit field is unambiguous and matches the `toGroup`/`fromGroup` precedent; overloading `vessel` collides with single-vessel resolution. |
| Task model for the fan-out | N independent record-only maintenance tasks (one taskBuild per barrel) | One grouped op (like barrel-down) | Maintenance has NO ledger op (WORKORDER-3); a group-op wrapper would be dead weight. N tasks is the honest model and matches per-barrel `VesselActivityEvent` at completion. |
| Both `vessel` and group supplied | Group wins; single `vessel` ignored | Throw on ambiguity | Least surprising; a user naming a group meant the group. Note it in the tool description. |
| Sequencing of fanned tasks | Share the intent's group seq (parallel) | Sequential sub-seqs | Cleaning 4 barrels is order-free; parallel is correct and lets any one complete independently. |

## Implementation Units

### Unit 1: Maintenance intent accepts a barrel group/range (proposal parse)

**Goal:** `canonicalizeRawIntents` accepts a group/range for a maintenance kind and carries it on the
intent, without breaking the single-vessel path.
**Files:** `src/lib/work-orders/nl-proposal.ts`
**Approach:** Widen the maintenance intent union member (`nl-proposal.ts:27`) to
`{ kind: NlMaintenanceKind; vessel?: string; vesselGroup?: string; … }`. In the `NL_MAINTENANCE_KINDS`
branch (`:440`), read `vesselGroup` from aliases mirroring barrel-down
(`raw.vesselGroup ?? raw.group ?? raw.barrels ?? raw.vessels ?? raw.toGroup`) and `vessel` from
`raw.vessel ?? lastRackDestination`. If neither present, throw
`"A {kind} task needs a vessel, or a barrel group/range (e.g. B1-B4)."`. Push `vesselGroup` when set,
else `vessel` (keep existing field spreads). Do NOT resolve the range here (stays pure/sync).
**Tests:** `test/work-order-nl-proposal.test.ts` — (a) a CLEAN raw intent with `group: "B1-B4"` →
intent has `vesselGroup: "B1-B4"`, no `vessel`; (b) SANITIZE with `vessel: "barrel 7"` → unchanged
single-vessel intent; (c) neither → throws the new message.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** `nl-proposal.ts:291-317` (barrel-down alias read + single-intent push).
**Verification:** `npx vitest run test/work-order-nl-proposal.test.ts`

### Unit 2: Resolve fans a maintenance group into N tasks

**Goal:** When a maintenance intent carries `vesselGroup`, expand to N members and emit one taskBuild +
one task summary per barrel; single-`vessel` path unchanged.
**Files:** `src/lib/work-orders/nl-resolve.ts`
**Approach:** In the maintenance branch (`:589-617`), branch on `intent.vesselGroup`: if set, call
`const members = await resolveGroupMembers(intent.vesselGroup)`; else `members = [await
resolveVesselState(intent.vessel)]`. Factor the existing field-building (material lookup, `candidate`,
`Object.fromEntries(... in fields)`, verb) into a per-member loop so each member yields its own
`taskBuilds.push({ taskType: intent.kind, title: \`${verb} ${member.label}\`, values, taskKey: randomUUID() })`
and matching `tasks.push({ seq, kind, title: verb, summary: \`${verb} ${member.label}…\`, entities: […] })`.
Resolve `material` once (group-wide) before the loop. All fanned tasks share `seq`. WORKORDER-3 holds:
each is a record-only maintenance taskBuild, no ledger/cost.
**Tests:** covered by the Unit 4 golden + a resolve assertion if the existing suite has a DB-backed
harness; otherwise assert the fan-out via the golden's expected task count. (No new DB fixture invented
here — see Test Strategy.)
**Depends on:** Unit 1
**Patterns to follow:** `resolveGroupMembers` usage in the barrel-down/rack-to-tank resolve branches;
maintenance field-filter at `nl-resolve.ts:591-607`.
**Verification:** `npm run build` typecheck + the Unit 4 golden run.

### Unit 3: Tool schema + prompt teach the model the group affordance

**Goal:** The `propose_work_order` schema and assistant prompt tell the model maintenance is
single-vessel OR a barrel group/range that fans out — so it stops jamming a range into `vessel`.
**Files:** `src/lib/assistant/tools/propose-work-order.ts`, `src/lib/assistant/prompt.ts`
**Approach:** Add a maintenance-facing group field to the schema (`vesselGroup`, string) near the
existing `toGroup`/`fromGroup` (`propose-work-order.ts:333-335`), described:
"For maintenance across many barrels (clean/sanitize/steam/ozone/gas/SO2/wet-storage): a range
('B1-B4'), a saved group name, or a comma list. Fans one maintenance task per barrel." Tighten the
`vessel` description to "single target vessel" for maintenance. Add one line to `prompt.ts` maintenance
guidance: a barrel range/group for a cleaning/sanitizing task uses `vesselGroup` and creates one task
per barrel (mirror the barrel-down phrasing already there).
**Tests:** Unit 4 golden exercises this end-to-end.
**Depends on:** Unit 1 (field name must match the parse aliases)
**Patterns to follow:** `propose-work-order.ts:333-335` schema entries; barrel-down prompt guidance in
`prompt.ts`.
**Verification:** `npm run build`

### Unit 4: Multi-barrel maintenance eval golden (D26/H8 gate)

**Goal:** A golden proves "clean and sanitize barrels b1 through b4" yields two maintenance kinds fanned
across 4 barrels, and keeps the assistant-write-tool coverage gate green.
**Files:** `test/evals/assistant-write-tools.golden.ts` (and `test/evals/assistant-fleet.golden.ts` if
the coverage guard indexes it there)
**Approach:** Add a golden case for `propose_work_order` with utterance
"clean and sanitize barrels b1 through b4": expect two maintenance intents (CLEAN + SANITIZE) each
carrying `vesselGroup` covering b1–b4 (assert on the tool-call arguments per the existing golden shape).
Match the existing golden structure for `propose_work_order`; do not hand-edit the generated
`assistant-coverage.md` (it is generated).
**Tests:** this IS the test.
**Depends on:** Units 1–3
**Patterns to follow:** existing `propose_work_order` goldens (barrel-down entry) in
`test/evals/assistant-write-tools.golden.ts`.
**Verification:** `npx vitest run test/evals` and the repo's assistant eval-coverage verify (D26/H8 gate).

## Test Strategy

**Unit tests:** `test/work-order-nl-proposal.test.ts` for the pure proposal parse (Unit 1) — the
repo's vitest is node-env, so keep new assertions on pure `canonicalizeRawIntents` output, no DOM/DB.
**Eval golden:** `test/evals/assistant-write-tools.golden.ts` for the end-to-end tool-call shape (Unit 4),
which is also the D26/H8 CI gate.
**Integration/resolve:** the resolve fan-out (Unit 2) is DB-backed via `resolveGroupMembers`. Prefer to
prove it through the golden's expected task count rather than inventing a new seeded fixture. If the
existing suite already has a seeded harness that resolves a group (barrel-down resolve tests), extend it;
otherwise verify manually (below).
**Manual verification:** in the MAIN checkout dev server, as Demo Winery, ask the assistant
"draft a barrel cleaning and sanitizing order for b1 through b4" → confirm a draft WO with 8 tasks
(4 clean + 4 sanitize), one per barrel, each record-only; confirm single-barrel "clean barrel 7"
still works.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Refactoring the maintenance resolve block regresses the single-vessel path | MED | MED | Keep single-vessel as the `else` branch that builds `members=[one]`; run existing NL tests + golden. |
| Model keeps stuffing a range into `vessel` despite the new field | LOW | MED | Explicit `vesselGroup` field + prompt line + golden asserting `vesselGroup` is used. |
| Group resolves to a non-barrel/tank member unexpectedly | LOW | LOW | `resolveGroupMembers` dedupes + surfaces relayable errors; ranges are barrel-oriented by syntax. |
| WORKORDER-3 (no ledger/cost on maintenance) accidentally violated in the loop | LOW | HIGH | Each fanned taskBuild is `taskType: intent.kind` with fields filtered by `TASK_VOCABULARY.fields` exactly as today — no new op path introduced. |
| Eval-coverage guard indexes goldens somewhere unexpected | LOW | MED | Locate the guard's source list before adding the golden; run the verify locally before PR. |

## Success Criteria

- [ ] "clean and sanitize b1 through b4" drafts a WO with one clean + one sanitize task per barrel (8 total)
- [ ] Single-vessel maintenance ("clean barrel 7") is unchanged
- [ ] Inverted/oversized range surfaces a clear relayable error (via `expandVesselRange`)
- [ ] Each fanned task is record-only (no ledger op, no cost) — WORKORDER-3 preserved
- [ ] New/updated golden green; D26/H8 assistant eval-coverage gate green
- [ ] All tests pass; no regressions in `test/work-order-nl-proposal.test.ts`
- [ ] Built in the MAIN checkout, branched `feat/nl-maintenance-barrel-group`, PR'd to `main`
