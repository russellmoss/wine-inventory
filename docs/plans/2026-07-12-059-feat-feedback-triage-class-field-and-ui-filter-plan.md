# Plan 059 — First-class `triageClass` disposition on feedback + `/developer` sort/filter

> Renumbered from 058 (collided with the multilot-measurement plan). This is the bug-triage
> granularity feature; the deferred multi-lot Brix want lives in the separate 058 plan.

**Status:** IN PROGRESS — building on branch `feat/feedback-triage-class-058`
**Date:** 2026-07-12
**Owner:** (assign on `/work`)
**Build location:** the MAIN checkout (`C:\Users\russe\Documents\Wine-inventory`) — this touches
`prisma/schema.prisma` + a migration, which need `.env` + Neon. Its own branch → PR to `main`.

## Why

Feedback comes in as one undifferentiated stream (`AssistantFeedback` 👎 + `FeedbackTicket`
bug/feature). Today the only intake dimensions are `kind` (BUG_REPORT | FEATURE_REQUEST),
`severity` (P0–P2), `status`, and `automationStatus`. There is **no field for the disposition**
— what *kind* of problem an item actually is once triaged (a real defect vs. a model/prompt-
adherence miss vs. a missing product capability vs. not-a-bug). This session surfaced all four in
one sitting, and each needs a different workflow (auto-fix / eval+prompt / `/plan` / dismiss).

The `bug-triage` skill+workflow now **assigns** this disposition at triage (recorded in the
write-back note, prefixed `[type]`, and returned as a `byType` tally) — see the global
`~/.claude/skills/bug-triage/SKILL.md` and `~/.claude/workflows/bug-triage.js`. But it lives only
in free-text `developerNotes`, so the `/developer` backlog UI can't **sort or filter** by it. This
plan makes it a first-class column so the human inbox can slice the backlog ("show me the
product-gaps", "hide not-a-bugs") and the next triage run can read the prior disposition
structurally instead of parsing a note.

**Scope guard:** this is the *only* new dimension. `severity` (impact) and the auto-fix `fence`
(domain-risk) already exist and stay orthogonal. Disposition = *which workflow*; severity =
*priority order*; fence = *auto vs. human gate*. One field, action-bound — not a metadata dump.

## The taxonomy (must match the skill exactly)

`enum FeedbackTriageClass { DEFECT MODEL_BEHAVIOR PRODUCT_GAP NOT_A_BUG UNCLEAR }`

- `DEFECT` — real code bug, concrete lever → auto-fix (in-fence) / human (out-of-fence)
- `MODEL_BEHAVIOR` — LLM/assistant adherence miss; prompt/eval mitigation, recurrence expected
- `PRODUCT_GAP` — missing capability / unmodeled path / design decision → `/plan` or `/office-hours`
- `NOT_A_BUG` — works-as-designed / user-error / permissions / empty-state → dismiss
- `UNCLEAR` — needs `/investigate`

Nullable (`triageClass FeedbackTriageClass?`) — an untriaged NEW item has no disposition yet;
the goalie sets it. Never trusted from intake; assigned at triage.

## Units

### Unit 0 — enum migration, committed ALONE (the Windows enum rule)
Per `main-repo-has-env` + the compliance-enum precedent: a Postgres `ALTER TYPE` / `CREATE TYPE`
must land in its **own** migration, committed **before** any column defaults to it, or Windows
Prisma chokes.
1. Add `enum FeedbackTriageClass { DEFECT MODEL_BEHAVIOR PRODUCT_GAP NOT_A_BUG UNCLEAR }` to
   `prisma/schema.prisma`.
2. `npm run db:migrate` → name `feedback_triage_class_enum`. Migration body = `CREATE TYPE` only.
3. Commit this migration on its own.

### Unit 1 — add the nullable column to BOTH models
`AssistantFeedback` and `FeedbackTicket` are both tenant-scoped (`tenantId`, RLS, `@@unique([tenantId, id])`).
This is a **column add** to existing tables — NOT a new table, so no new RLS policy, no FK, no
app_rls grant needed (the existing `tenant_isolation` policy + default privileges already cover
new columns). Phase-12 checklist steps 2/3/4/5/6 that apply to *new tables* do **not** apply here.
1. Add `triageClass FeedbackTriageClass?` to each model. No default (untriaged = null).
2. Add `@@index([tenantId, triageClass, createdAt])` to `FeedbackTicket` (mirror the existing
   `[tenantId, kind, status, createdAt]` index) and `@@index([tenantId, triageClass])` scope to
   `AssistantFeedback`.
3. `npm run db:migrate` → name `feedback_triage_class_column`. Verify the generated SQL is a plain
   `ALTER TABLE ... ADD COLUMN` + `CREATE INDEX` (no phantom `search_vector` diff — stop the dev
   server before generate per `prisma-neon-migrations-windows`).

### Unit 2 — write the disposition through the triage scripts
`scripts/bug-triage-set-status.ts` (wired as `npm run triage:resolve`) is the single write path
the workflow calls. Add an optional `--triage-class=<DEFECT|...>` arg that sets `triageClass`
alongside `status`/`note`. Backward-compatible: absent → leave `triageClass` untouched.
1. Parse + validate the arg against the enum (reject unknown values).
2. Set it in the same `update` that writes status, inside the existing tenant scope.
3. Update `scripts/bug-triage-list.ts` (`npm run triage:list`) to SELECT + emit `triageClass` per
   item so the workflow's Intake sees the prior disposition (and the BACKLOG_SCHEMA can carry it).

### Unit 3 — teach the workflow to persist it structurally
In `~/.claude/workflows/bug-triage.js` (global; edit + note it's not a repo commit):
1. Add `triageClass` to `BACKLOG_SCHEMA.items` so Intake passes the prior disposition through.
2. In the Act agent, when writing status back, also pass `--triage-class=<TYPE>` (map the skill's
   lowercase `type` → the enum: `defect`→`DEFECT`, `model-behavior`→`MODEL_BEHAVIOR`, etc.).
   Keep the `[type]` note prefix too (belt + suspenders; human-readable + structured).

### Unit 4 — `/developer` backlog UI: column + sort + filter
In-fence (`src/app/(app)/developer/**` + `src/components/**`), so a normal PR (not out-of-fence).
1. Show a **disposition** chip/column in the backlog table (color-coded; reuse DESIGN.md tokens —
   no hardcoded colors).
2. Add a **filter** control (multi-select: DEFECT / MODEL_BEHAVIOR / PRODUCT_GAP / NOT_A_BUG /
   UNCLEAR / untriaged) and make the column **sortable**. Server-side filter via the new index.
3. Empty/untriaged state reads "untriaged" (null), visually distinct from a set disposition.

### Unit 5 — proof
1. `runAsTenant("org_demo_winery", …)` script: create a `QA-*` ticket, run `triage:resolve` with
   `--triage-class=PRODUCT_GAP`, read the row back — assert `triageClass` persisted + RLS-scoped.
   Clean up the `QA-*` fixture; keep `verify:naming` green before AND after.
2. Browser QA (in-app Claude browser, Demo Winery): the `/developer` filter narrows to one
   disposition and the column renders. Confirm persistence with the read-back script.
3. `npx next build` locally before merging the UI PR (client→server import leaks only surface on
   Vercel otherwise — see `plan053` note).

## Out of scope / explicitly NOT doing

- **No richer intake form.** Intake stays dumb (what happened + auto-context). Disposition is a
  triage output, never a reporter input. A reporter self-tag would be garbage-in.
- **No change to `severity` or the fence.** Orthogonal axes; leave them alone.
- **No auto-merge of this plan's PRs by the goalie.** It touches `prisma/` → out-of-fence by
  design; lands via human-reviewed PR.

## Risk / rollback

Column is nullable + additive; no backfill required (existing rows stay `null` = untriaged).
Rollback = drop column + drop type in a down migration; no data loss for other columns.
