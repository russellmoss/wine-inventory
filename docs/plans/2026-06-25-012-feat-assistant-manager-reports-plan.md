---
title: Manager reports in the assistant — read + interactive fill/edit
type: feat
status: draft
date: 2026-06-25
branch: feat/assistant-chat
depth: standard
units: 6
---

## Overview

Make the weekly "manager report" (the `FieldNote`) a first-class thing the assistant can
read, answer questions about, and fill out / edit by chat. The data and the safe write path
already exist (`createFieldNote`, the JSON validators, the AI briefing) — what's missing is
the assistant tooling. This is a missing capability (a few tools), NOT an MCP/Phase-2 thing:
the MCP only changes *where* you talk to the assistant, not *what* it can do, so it's not
involved here. Builds on the Phase 1 assistant (`src/lib/assistant/**`).

## Problem Frame

A user asked "how is Bajo doing? look at the manager reports" and the assistant correctly said
those reports aren't available through chat yet — because there's no tool for them, even though
every weekly report is a `FieldNote` row (weather, sprays, fertilizers, per-block statuses,
general notes) with an AI briefing already generated. Do nothing and the richest operational
data in the app stays un-askable, and managers still have to leave chat to file their weekly
report. Risk to manage: the report is a big structured object with block-coverage rules and a
spray/fertilizer master list — writing it must go through the existing validated action, never
raw JSON, or we corrupt the shape the briefing + UI depend on.

## Requirements

- MUST: A read tool to answer questions about recent weekly reports for a vineyard (scoped):
  weather, sprays, fertilizers, per-block statuses (block labels, not ids), general notes, and
  the AI briefing.
- MUST: Interactive fill/edit of a week's report by chat, confirm-gated, that commits through
  the EXISTING `createFieldNote` action (typed upsert on `[vineyardId, weekOf]`) — never a raw
  Prisma write of the JSON columns.
- MUST: Sprays/fertilizers resolve against the `FieldInput` master list; adding a brand-new one
  goes through the existing `addFieldInput` (normalizedKey dedupe, `FIELD_INPUT_CREATED` audit).
- MUST: Respect block coverage — `createFieldNote` requires a status for every current block;
  the tooling must surface the blocks and seed them (reuse `buildPrepopulationDefaults`).
- MUST: Confirm-before-write (reuse `confirm.ts` token + nonce burn; commit via
  `/api/assistant/confirm`), audited (`FIELD_NOTE_CREATED`/`UPDATE` already emitted by the
  action), manager-scoped (`canManagerAccessVineyard`), no raw SQL.
- SHOULD: After a successful save, requeue the AI briefing (the action already sets
  `aiSummaryStatus: PENDING`; trigger `generateBriefing` so it refreshes).
- SHOULD: A report write fits a DEDICATED field-report tool set, not the generic
  db_create/db_update (FieldNote has JSON payloads + master list + week anchoring).
- NICE: Let the model build the report section by section across turns before the single commit.

## Scope Boundaries

**In scope:** `query_field_reports` (read), `get_field_report_form` (read — blocks + master
list + current/prepopulated note for a week), `save_field_report` (write, confirm-gated) and
its committer, briefing re-trigger, prompt + UI labels, pure-logic tests.

**Out of scope (follow-ups):** the MCP server (Phase 2, orthogonal); photo uploads in the
report by chat; voice (plan 011, concurrent); editing the briefing text directly (it's
generated). Generic CRUD already covers other entities (plan 010).

## Research Summary

### Codebase Patterns (all reusable, exact)
- **Read actions (scope-checked, return `ParsedFieldNote`):** `getRecentFieldNotes(vineyardId, n)`,
  `getLatestFieldNote(vineyardId)`, `getFieldNoteById(id)` — `src/lib/fieldnotes/actions.ts:135-166`.
  `ParsedFieldNote` + `parseFieldNoteRow` in `src/lib/fieldnotes/types.ts`.
- **Write action:** `createFieldNote(input: CreateFieldNoteInput): Promise<{id}>` —
  `src/lib/fieldnotes/actions.ts:58`. Typed (NOT FormData), upsert on `[vineyardId, weekOf]`,
  validates JSON via `parseWeatherData`/`parseInputApplications`/`parseBlockStatuses`, throws if
  a current block lacks a status, audits `FIELD_NOTE_CREATED`/`UPDATE`, sets
  `aiSummaryStatus: "PENDING"`.
- **Master list:** `listFieldInputs(): {sprays, fertilizers}` and
  `addFieldInput(type, name): FieldInputDTO` — `src/lib/fieldnotes/input-actions.ts:24,45`.
  Sanitizers `cleanInputName`/`normalizeInputKey` in `sanitize.ts`.
- **Shapes:** `WeatherData {rainfallMm,maxTempC,minTempC}`, `InputApplication {name, scope:
  "WHOLE"|"BLOCKS", blockIds[]}`, `BlockStatus` (pheno/canopy/disease/...), `EMPTY_BLOCK_STATUS`,
  `DEFAULT_HEALTHY_BLOCK_STATUS`, `CreateFieldNoteInput` — `types.ts`.
- **Week helpers:** `todayISODateUTC`, `parseISODateUTC`, `isValidReportDate` —
  `src/lib/fieldnotes/week.ts`.
- **Prepopulation:** `buildPrepopulationDefaults(prevStatuses, currentActiveBlockIds)` —
  `src/lib/fieldnotes/prepopulate.ts:48` (carries slow-changing block fields; blanks weather/
  sprays/disease).
- **Briefing:** `generateBriefing(noteId)` — `src/lib/fieldnotes/ai.ts:51`; async re-trigger
  pattern in `src/app/api/field-notes/[id]/summarize/route.ts` (`after()`); parse stored JSON
  with `parseBriefing` (`prompt.ts:179`).
- **Block labels:** map blockId→label as in `ai.ts:80-81` (query blocks, fallback to id).
- **Assistant seams to reuse:** `scope.ts` (`resolveVineyards`, manager scoping), `confirm.ts`,
  `commit.ts` committer map, the write-tool proposal pattern (`needsConfirmation/preview/token`).

### Prior Learnings
- Phase 1 invariants carry: writes via existing actions; reads may query; confirm tokens
  single-use + TTL; scoping in the handler. The generic CRUD plan (010) deliberately excluded
  FieldNote because of its JSON/coverage shape — this plan is that excluded piece, done right.

### External Research
None — internal subsystem; Claude briefing already wired.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Tooling shape | Dedicated field-report tools | Force into generic db_create/db_update | JSON payloads + block coverage + master list + week anchor don't fit a scalar CRUD config |
| Write path | Assemble `CreateFieldNoteInput`, commit via `createFieldNote` | Raw prisma JSON write | Inherits validation, coverage check, audit, PENDING-requeue for free |
| Multi-turn fill | A read `get_field_report_form` (blocks + master list + current/prepopulated note) then one `save_field_report` commit | Many tiny per-section write tools | One commit = one confirm + one audit; the model gathers values conversationally, form tool gives it the shape |
| Block coverage | Seed every current block via `buildPrepopulationDefaults`; `save_field_report` fills unspecified blocks from the seed | Reject incomplete saves | Matches the manager form's carry-forward UX; avoids dead-ends |
| New sprays/ferts | Resolve against `listFieldInputs`; unknown name → `addFieldInput` in the same commit | Block unknown inputs | Mirrors the form; keeps the master list clean via normalizedKey |
| Briefing refresh | After commit, fire `generateBriefing` best-effort (don't block the reply) | Leave stale | Keeps "how's Bajo" answers current; failure is non-fatal (status stays PENDING) |
| Scope | Manager → own vineyard only; admins all (reuse scope.ts + the action's own check) | Trust the model | Double-enforced; consistent with the rest of the assistant |

## Implementation Units

### Unit 1: query_field_reports (read) — vertical slice

**Goal:** Answer questions about recent weekly reports for a vineyard.
**Files:**
- `src/lib/assistant/tools/query-field-reports.ts` (create) — input `{ vineyard?, weeks? }`;
  resolve vineyard(s) via `resolveVineyards` (scoped); for one vineyard call
  `getRecentFieldNotes(id, n)`; map block ids → labels; include the AI briefing (parse
  `aiSummary` with `parseBriefing` when `aiSummaryStatus === "READY"`); return a compact,
  model-friendly structure (weekOf, weather, sprays, fertilizers, per-block statuses, general
  notes, briefing headline/agenda).
- `src/lib/assistant/registry.ts` (modify, minimal) — register the read tool.
**Approach:** Pure read; reuse the scoped action + `parseFieldNoteRow` output. No write surface.
**Tests:** Unit 6 covers blockId→label mapping + the briefing-parse fallback.
**Depends on:** none
**Verification:** manual — "how's Bajo per the manager reports?", "what did they spray last
week?", "any disease flagged at Bajo?" return correct, scoped answers; a manager can't read
another vineyard's reports.

### Unit 2: get_field_report_form (read) — the fill/edit context

**Goal:** Give the model everything it needs to fill or edit a week's report.
**Files:**
- `src/lib/assistant/tools/get-field-report-form.ts` (create) — input `{ vineyard?, reportDate? }`;
  scope-resolve the vineyard; default date `todayISODateUTC` (validate with `isValidReportDate`);
  load the existing note for that date if any (else `buildPrepopulationDefaults` from the latest
  prior note + current active block ids); return the block list (id+label), the spray/fertilizer
  master list (`listFieldInputs`), the seeded/editable payload, and whether this would create or
  update.
- `src/lib/assistant/registry.ts` (modify) — register.
**Approach:** Read-only assembly; reuse prepopulate + week helpers + master list.
**Tests:** Unit 6 (week/date resolution; create-vs-update detection; block seeding).
**Depends on:** Unit 1
**Verification:** manual — "let's fill out Bajo's report" returns the blocks, current values,
and available sprays/fertilizers.

### Unit 3: save_field_report (write, confirm-gated) + committer

**Goal:** Commit a filled/edited report through the real action.
**Files:**
- `src/lib/assistant/tools/save-field-report.ts` (create) — input the assembled payload
  `{ vineyard, reportDate, weather, sprays[], fertilizers[], blockStatuses{}, generalNotes }`;
  scope-check; resolve sprays/fertilizers against the master list (collect unknown names to
  create); seed any missing block statuses from `buildPrepopulationDefaults`; build a human
  preview (week, # blocks covered, sprays/ferts, weather, whether create or update) and sign a
  proposal. Committer: in order — create any new `FieldInput`s via `addFieldInput`; call
  `createFieldNote(input)`; best-effort `generateBriefing(id)` (don't fail the commit on
  briefing error).
- `src/lib/assistant/commit.ts` (modify) — add the `save_field_report` committer.
- `src/lib/assistant/registry.ts` (modify) — register (write).
**Approach:** The committer reuses `createFieldNote` (audit + coverage + PENDING come free) and
`addFieldInput`; no raw prisma. Confirm/token/nonce path unchanged.
**Tests:** Unit 6 (payload assembly + coverage seeding + spray normalization via existing
sanitizers).
**Depends on:** Unit 2
**Verification:** manual — fill Bajo's report by chat → preview card → confirm → a `FieldNote`
row + audit identical to the manager-form path; a new spray name creates a `FieldInput`; the
briefing refreshes shortly after.

### Unit 4: briefing refresh wiring + edit flow polish

**Goal:** Keep the briefing current and make editing existing weeks smooth.
**Files:**
- `src/lib/assistant/tools/save-field-report.ts` (modify) — ensure the briefing re-trigger runs
  after a successful commit and is non-fatal; on update, the preview shows a before→after of the
  changed sections.
**Approach:** Mirror the summarize route's `after()` intent; here it's a direct best-effort call
in the committer since we're already server-side.
**Tests:** none (manual).
**Depends on:** Unit 3
**Verification:** manual — editing last week's report updates it (no duplicate) and the briefing
regenerates.

### Unit 5: prompt + UI labels (minimal, concurrency-aware)

**Goal:** Teach the model the report capabilities; label tool statuses.
**Files:**
- `src/lib/assistant/prompt.ts` (modify, minimal) — add: can read weekly manager reports and
  fill/edit them (confirm-gated); use `get_field_report_form` before saving; remove the "weekly
  field report by chat is not available yet" line.
- `src/app/(app)/assistant/AssistantChat.tsx` (modify, minimal) — `TOOL_LABELS` for the three
  tools.
**Approach:** Both files are concurrently edited by the voice session — edit minimally and last,
commit only these paths, re-read fresh immediately before editing.
**Tests:** none.
**Depends on:** Unit 4
**Verification:** manual — model no longer says reports are unavailable; offers to fill/edit.

### Unit 6: pure-logic tests

**Goal:** Cover the deterministic seams without a DB.
**Files:**
- `test/assistant-field-reports.test.ts` (create) — blockId→label mapping (incl. missing-label
  fallback); report-date resolution/validation (today default, reject future, parse explicit);
  create-vs-update detection from an existing-note lookup (mocked); payload assembly + coverage
  seeding (every current block ends with a status); spray/fertilizer name normalization via the
  existing `normalizeInputKey`.
**Approach:** Factor the pure assembly/seeding logic so it tests without Prisma (DB calls behind
thin wrappers).
**Depends on:** Units 1-3
**Verification:** `npm run lint` + Vitest green; no regressions.

## Test Strategy

**Unit tests:** Vitest node env (existing pattern; `server-only` already stubbed) for label
mapping, date resolution, coverage seeding, normalization (Unit 6).
**Integration:** none here (action/DB harness is the tracked `TODOS.md` follow-up). The write
goes through the already-tested `createFieldNote`, so the risky validation/coverage/audit is
covered by the existing action; the assistant layer only assembles input.
**Manual verification:** the per-unit checks, end-to-end: read Q&A, fill a new report, edit an
existing one, add a new spray, see the briefing refresh.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Model assembles a malformed report payload | MED | MED | `createFieldNote` validates every JSON shape + coverage and throws; confirm preview shows what will be saved |
| Block coverage gap → save rejected mid-flow | MED | LOW | Seed all current blocks from `buildPrepopulationDefaults`; preview states blocks covered |
| Duplicate note instead of edit | LOW | MED | Upsert on `[vineyardId, weekOf]`; form tool reports create-vs-update up front |
| Manager edits another vineyard's report | LOW | HIGH | scope.ts + the action's own `requireVineyardAccess` |
| Briefing regen fails | LOW | LOW | Best-effort; status stays PENDING; non-fatal |
| Collision with voice session on prompt/registry/UI | MED | LOW | Edit shared files minimally + last; commit only feature paths |

## Success Criteria

- [ ] "How's Bajo per the manager reports?" / "what did they spray last week?" / "any disease
      flagged?" answer correctly from real `FieldNote` data + briefing, scoped.
- [ ] A manager can fill out this week's report by chat → preview → confirm → a `FieldNote`
      row + audit identical to the manager form; coverage satisfied; a new spray creates a
      `FieldInput`.
- [ ] Editing an existing week updates (no duplicate) and the briefing refreshes.
- [ ] Managers are scoped to their vineyard; the LLM never writes JSON directly.
- [ ] New pure-logic tests pass; `npm run lint` clean; no regressions.
