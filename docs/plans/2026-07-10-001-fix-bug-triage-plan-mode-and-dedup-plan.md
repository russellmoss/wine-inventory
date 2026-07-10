---
title: /bug-triage — plan-mode/skip awareness + cross-tenant dedup
type: fix
status: draft
date: 2026-07-10
branch: fix/bug-triage-plan-mode-and-dedup
depth: standard
units: 6
---

## Overview

Two interacting fixes to the `/bug-triage` product-goalie so the backlog stops lying in two
ways. FIX 1: when the fix pipeline runs in plan mode (`PLANNED`) or declines (`SKIPPED`), the
triage workflow currently treats those items as generic "active" with only their original
title/body — so a submitted plan is never surfaced for review and a skip reason never reaches
the queue. FIX 2: there is no dedup anywhere, so when several tenants report the same bug they
each get dispatched as a separate fix run / separate PR for one tenant-agnostic code fix, and
merging one PR only writes `RESOLVED` to its single linked item, leaving the sibling tickets open.

## Problem Frame

The goalie's whole job is to keep the feedback queue truthful and to spend a human's attention
only where it's needed. Two structural blind spots break that:

- **Plan/skip outcomes are invisible.** The data model already distinguishes them —
  `FeedbackAutomationStatus` is `NOT_REQUESTED | AWAITING_APPROVAL | QUEUED | RUNNING | PLANNED |
  PR_OPENED | FAILED | SKIPPED`, there's a real `feedback_plan` GitHub Actions agent
  ([automation.ts:196](src/lib/feedback/automation.ts:196)), and the plan itself is stored in the
  DB (`planMarkdown` / `planTitle` columns, [schema.prisma:891](prisma/schema.prisma:891)).
  `getDeveloperFeedbackData` already selects `planMarkdown`, `githubIssueUrl`, `modeAtSubmission`,
  `developerNotes` ([feedback.ts:127](src/lib/developer/feedback.ts:127)). But the goalie never
  reads any of it: the intake script omits `planMarkdown`, and the workflow's intake schema drops
  the rest and only special-cases `MERGED` (reconcile) and `RUNNING`/`QUEUED` (in-flight). A
  `PLANNED` item falls into `active`, gets re-dispatched or punted to `needs-human` with no plan
  attached. A `SKIPPED` item loses its "here's why" reason.

- **Duplicates fan out into duplicate work.** The auto-fix fence is tenant-agnostic app code
  (`src/app/(app)`, `src/app/api/feedback`, `src/components`, `src/lib/assistant`), so ONE PR
  fixes a bug for ALL tenants. But the workflow ranks every item independently
  ([bug-triage.js:205](../../.claude/workflows/bug-triage.js:205)), so two tenants reporting the
  same 500 → two dispatches → two conflicting PRs → wasted CI, and resolving one leaves the other
  tenant's ticket open to reappear next run.

Do nothing → the goalie keeps re-dispatching planned/duplicate work and the queue keeps
misreporting state. Cost of inaction rises with tenant count (Phase 12 multi-tenancy is live;
winery #2 is expected).

## Requirements

- MUST: intake surfaces `planMarkdown` (capped), `planTitle` where available, `githubIssueUrl`,
  `modeAtSubmission`, `developerNotes`, and `githubRunUrl` per item.
- MUST: `PLANNED` items are a first-class outcome — surfaced with plan title + link + snippet and
  routed to a human/`/work`, written back to `TRIAGED` with a "plan ready" verdict, NEVER
  re-dispatched.
- MUST: `SKIPPED` items carry their reason (from `developerNotes`) into the queue; the lead
  decides `dismiss` (skip says not-a-bug/wontfix) vs `needs-human`; never left silently at NEW.
- MUST: a cluster/dedup pass runs AFTER intake and BEFORE prioritize, groups items by likely root
  cause **across tenants**, and includes `PLANNED`/`SKIPPED`/open-PR items so a fresh duplicate
  rides an existing outcome instead of spawning a new one.
- MUST: exactly ONE primary per cluster is prioritized/dispatched/reviewed; other members are
  `linked-duplicate` and take NO independent action.
- MUST: on a primary's merge/reconcile/dispatch/dismiss, the status write-back **fans out to every
  member** of the cluster with a note referencing the primary.
- MUST: `dryRun` shows clusters + intended fan-out + plan-ready/skip routing with zero writes.
- SHOULD: clustering is conservative — default to singleton when root-cause identity is uncertain;
  each grouping carries a one-line justification.
- SHOULD: election prefers the member furthest along (open PR > PLANNED > AWAITING dispatch > NEW)
  so duplicates inherit the most advanced outcome.
- NICE: report shows "N tenants affected" per cluster.

## Scope Boundaries

**In scope:**
- `scripts/bug-triage-list.ts` — the ONLY repo/PR-shipped change (add `planMarkdown` + counts).
- `~/.claude/workflows/bug-triage.js` — intake schema, classification, new Cluster phase,
  prioritize/review over primaries, Act fan-out, Report (global file, edited in place).
- `~/.claude/skills/bug-triage/SKILL.md` — document the new behavior (global file).

**Out of scope:**
- A hard `duplicateOfId` / cluster FK column. Linking is **note-based (soft)** via `triage:resolve`
  `--note`; a schema column would be a Phase-12 tenant-scoped migration (RLS checklist, out of
  fence) and isn't needed to close the loop. Flagged as a future enhancement.
- Changing the GitHub Actions plan/fix/skip agents themselves (e.g. making `SKIPPED` write a
  richer reason). We consume what they already persist; if the skip reason isn't in
  `developerNotes`/`githubRunUrl`, we surface what exists and note the limitation.
- `src/lib/developer/feedback.ts` query changes — it already selects `planMarkdown`,
  `githubIssueUrl`, `developerNotes`. Only add `planTitle`/`githubRunUrl` to its select+type IF
  Unit 1 shows they're needed and absent (verify first; likely a 2-line add each, keep optional).

## Research Summary

### Codebase Patterns
- Intake script maps `getDeveloperFeedbackData` items to JSON
  ([bug-triage-list.ts:25-44](scripts/bug-triage-list.ts:25)); `planMarkdown` is the one surfaced
  DB field it doesn't re-emit. Summary counts already include `running`/`failed`
  ([bug-triage-list.ts:47](scripts/bug-triage-list.ts:47)) — add `planned`/`skipped`/`prOpened`
  the same way.
- Workflow structure: `phase()` calls Intake → Reconcile → Prioritize → Review → Act → Report;
  deterministic classification is plain JS on the intake array
  ([bug-triage.js:160-170](../../.claude/workflows/bug-triage.js:160)); action gate is re-checked
  in JS after the LLM review ([bug-triage.js:260-272](../../.claude/workflows/bug-triage.js:260)).
  The new Cluster phase mirrors this: LLM agent proposes groups (schema-validated), JS derives the
  primary/duplicate sets deterministically.
- Loop-closing writes go through `npm run triage:resolve` with `--status` + `--note`
  ([bug-triage.js:317](../../.claude/workflows/bug-triage.js:317)); `set-status.ts` PREPENDS notes
  and accepts `RESOLVED|DISMISSED|TRIAGED|IN_PROGRESS` ([bug-triage-set-status.ts:34](scripts/bug-triage-set-status.ts:34))
  — fan-out is N of these calls, no new script capability required.
- Dispatch approves an `AWAITING_APPROVAL` run; `feedback_plan` vs `feedback_bug_fix` is chosen by
  `run.kind` ([automation.ts:195](src/lib/feedback/automation.ts:195)). We never trigger the plan
  agent from the goalie — a PLANNED item already ran it; we only surface the result.

### Prior Learnings
- Skill + workflow are GLOBAL in `~/.claude` and the workflow is **gitignored** — it does NOT ship
  through the repo PR and has no CI gate. Only Unit 1 (the script) lands on `main` via PR. Run the
  workflow from the main repo checkout that has `.env` (worktrees are `.env`-less) —
  [[bug-triage-skill-shipped]], [[main-repo-has-env-verify-runs]].
- `/loop`/Workflow on Windows/worktree: invoke by `scriptPath` if the name doesn't resolve; LF-only
  scripts — [[health-remediate-loop-gotchas]].

### External Research
None — no new framework surface.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Cluster placement | New phase AFTER Reconcile, BEFORE Prioritize | Cluster inside Prioritize | Prioritize/Review/Act must all act on primaries only; clustering has to be settled first, and reconciled/closed items must already be filtered out so we don't cluster around dead items. |
| Duplicate linking | Soft, note-based via `triage:resolve --note` | Hard `duplicateOfId` FK column | A column is a tenant-scoped migration (RLS checklist, out of fence). Notes close the loop today; hard link is a flagged future enhancement. |
| Primary election | Furthest-along wins (PR_OPENED/OPEN > PLANNED > AWAITING > NEW), tiebreak highest severity then earliest | Always earliest ticket | Duplicates should inherit the most advanced outcome so we never spawn a second fix for a bug already planned or in-PR. |
| Clustering engine | LLM agent proposes, JS derives sets, conservative default-to-singleton | Pure string/path heuristic | Root-cause identity needs judgment (same symptom ≠ same cause); JS derivation keeps the action sets deterministic and auditable. |
| PLANNED routing | Surface + `TRIAGED` "plan ready, /work it"; never dispatch | Auto-dispatch a fix from the plan | The plan is the awaiting-review artifact; auto-building it skips the human gate the plan mode exists to create. |
| Plan text in workflow JSON | Cap `planMarkdown` snippet (~1500 chars) in the script output | Emit full 8000-char plan | Keeps backlog JSON / agent context lean; full plan lives in the DB + `githubIssueUrl` link for the human. |

## Implementation Units

### Unit 1: Surface plan text + plan/skip counts in the intake script
**Goal:** The goalie can see the plan and the skip context that the DB already stores.
**Files:** `scripts/bug-triage-list.ts` (repo — ships via PR). Possibly `src/lib/developer/feedback.ts` ONLY if `planTitle`/`githubRunUrl` are needed and absent from the type (verify first).
**Approach:** Add `planMarkdown` to the per-item output map (the data layer already returns it,
capped 8000; re-cap to ~1500 here to keep the JSON lean, plus a `planPresent` boolean). Add
`planned`, `skipped`, `prOpened` to the `summary` block next to `running`/`failed`
([bug-triage-list.ts:47](scripts/bug-triage-list.ts:47)). If Unit 2 shows `planTitle`/`githubRunUrl`
add real value and they're missing from `DeveloperFeedbackItem`, add them to the select + type in
`feedback.ts` (2-line add each) — otherwise leave that file untouched.
**Tests:** Run `npm run triage:list` from the main repo checkout (has `.env`); assert the JSON
`items[]` include `planMarkdown` for any `PLANNED` item and `summary.planned/skipped/prOpened` are
present and numeric. No unit-test harness for scripts; this is a live-DB run assertion.
**Depends on:** none
**Verification:** `npm run triage:list` prints a parseable JSON object whose items carry
`planMarkdown` and whose summary has the three new counts.

### Unit 2: Intake schema + PLANNED/SKIPPED classification in the workflow
**Goal:** Plan/skip fields enter triage and become first-class classification outcomes.
**Files:** `~/.claude/workflows/bug-triage.js` (intake `BACKLOG_SCHEMA` + classification block).
**Approach:** Add `modeAtSubmission`, `githubIssueUrl`, `planMarkdown`, `planTitle?`,
`developerNotes`, `githubRunUrl?` to `BACKLOG_SCHEMA.items` and to the intake agent's field list.
In the deterministic classify block ([bug-triage.js:160-170](../../.claude/workflows/bug-triage.js:160)):
carve out `planReady = active items with automationStatus === 'PLANNED'` and `skipped = active
items with automationStatus === 'SKIPPED'`; keep `FAILED` in `active`. Add both to `handledIds` so
they leave the generic `active` pool but are carried forward (not dropped) into the Cluster + Report
stages. Update the `log()` line to count them.
**Tests:** Manual/dry-run: with a seeded `PLANNED` and a `SKIPPED` item in Demo Winery, confirm
they're classified into `planReady`/`skipped` and not into `active` for dispatch.
**Depends on:** Unit 1
**Verification:** `Workflow({ name: 'bug-triage', args: { dryRun: true } })` box score shows
`planReady`/`skipped` counts and neither appears under intended dispatch.

### Unit 3: Cluster/dedup pass (new phase, before Prioritize)
**Goal:** Group same-root-cause items across tenants and elect one primary each.
**Files:** `~/.claude/workflows/bug-triage.js` (new `phase('Cluster')` + `CLUSTER_SCHEMA`).
**Approach:** After Reconcile, feed the cluster agent the union of `active + planReady + skipped +
open-PR` items (id, tenantId, kind, title, body, automationStatus, prNumber, fence-path hints).
Agent returns clusters `{ clusterId, primaryId, memberIds[], rootCause, justification }`, conservative
(singleton when unsure). In JS: validate every id is real and each item appears in exactly one
cluster (unclustered → own singleton); re-elect the primary deterministically by the furthest-along
rule (don't fully trust the LLM's `primaryId`) — PR_OPENED/OPEN > PLANNED > AWAITING dispatch > NEW,
tiebreak severity then `createdAt`. Build `primaryIds` set + `membersByPrimary` map. Skip entirely
if `args.cluster === false` (default true) → every item is its own singleton.
**Tests:** Dry-run with two Demo-Winery tickets describing the same symptom (seed as `QA-*`
fixtures) → assert they land in one cluster with one primary; two unrelated tickets → two clusters.
**Depends on:** Unit 2
**Verification:** `dryRun` report includes a `clusters` array; a duplicate pair collapses to one
primary + one `linked-duplicate`.

### Unit 4: Prioritize + Review over primaries only; PLANNED/SKIPPED buckets
**Goal:** One action per cluster; plan/skip items get correct buckets.
**Files:** `~/.claude/workflows/bug-triage.js` (Prioritize prompt + `PLAN_SCHEMA` buckets, Review filter).
**Approach:** Prioritize ranks ONLY primaries. Extend the bucket enum/prompt with `plan-ready`
(PLANNED primary → surface plan, route to human/`/work`, never dispatch) and teach `dismiss` vs
`needs-human` for SKIPPED using `developerNotes` (skip-says-not-a-bug → dismiss; else needs-human).
Duplicates are assigned bucket `linked-duplicate` in JS (not sent to the lead). Review
([bug-triage.js:229](../../.claude/workflows/bug-triage.js:229)) already filters `review-pr` +
`prNumber`; since only primaries are ranked, it naturally reviews one PR per cluster — add an assert
that no duplicate id reaches review.
**Tests:** Dry-run: a cluster whose primary is PLANNED → bucket `plan-ready`; a SKIPPED singleton
with a "not reproducible / not a bug" note → `dismiss`; a SKIPPED with a real reason → `needs-human`.
**Depends on:** Unit 3
**Verification:** `dryRun` ranked list contains only primaries; `plan-ready` and the SKIPPED routing
appear with the plan/skip reason in the rationale.

### Unit 5: Act — fan-out write-back + loop-close new outcomes
**Goal:** One deployed solution closes every reporter; plan/skip items close their loop.
**Files:** `~/.claude/workflows/bug-triage.js` (Act agent prompt + `mergeCandidates`/dispatch/dismiss
builders + `ACTION_SCHEMA`).
**Approach:** Pass `membersByPrimary` into the Act agent. For each primary action, after the
existing write-back to the primary, iterate its members and run `triage:resolve` for EACH:
merge/reconcile → members `RESOLVED` note `"Resolved by fix for <primaryId> / PR #<n> — same root
cause (bug-triage cluster)."`; dispatch → members `IN_PROGRESS`(tickets)/`TRIAGED` note
`"Linked to dispatched fix for <primaryId>."`; dismiss → members `DISMISSED` with the same reason
(only when the cluster is a true root-cause match). PLANNED primary → primary `TRIAGED` note
`"Plan ready for review — run /work on the linked plan (<githubIssueUrl>)."`, members `TRIAGED`
linked. SKIPPED → `DISMISSED` or `TRIAGED` per Unit 4 carrying the reason. `dryRun` lists every
intended fan-out write (primary + each member) and executes nothing.
**Tests:** Dry-run shows, for a 2-tenant cluster with a mergeable primary PR, one merge + two
`RESOLVED` write-backs (primary + duplicate). Live (Demo Winery `QA-*` only): run without dryRun on
a seeded cluster, confirm both tickets flip to `RESOLVED` and `verify:naming` stays green.
**Depends on:** Unit 4
**Verification:** After a non-dry run on a seeded cluster, `npm run triage:list` shows all cluster
members closed with cross-referencing notes; PLANNED item is `TRIAGED` with the plan link in notes.

### Unit 6: Report + SKILL.md documentation
**Goal:** The operator sees clusters, plans, and skips; the skill doc matches behavior.
**Files:** `~/.claude/workflows/bug-triage.js` (Report return + counts), `~/.claude/skills/bug-triage/SKILL.md`.
**Approach:** Add to the Report: `clusters` (primary, members, tenants-affected, rootCause),
`planReady` (title + `githubIssueUrl` + snippet), `skipped` (reason), and counts
`clustersFormed`/`duplicatesLinked`/`planReady`/`skipped`. Update SKILL.md: a "Plan-mode & skip
outcomes" subsection (PLANNED → review/`/work`, SKIPPED → carry reason), a "Cross-tenant dedup"
subsection (cluster→primary→fan-out, soft note linking), the new `cluster` arg (default true) in the
args list, and note that one merged PR now closes all same-root-cause tenants.
**Tests:** Dry-run output renders the new report sections; re-read SKILL.md for accuracy against the
implemented buckets/args.
**Depends on:** Unit 5
**Verification:** `dryRun` returns `clusters`/`planReady`/`skipped` + new counts; SKILL.md documents
PLANNED/SKIPPED/clustering and the `cluster` arg.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Verified against enum, `feedback_plan` agent, `planMarkdown` columns, and the exact intake/classify gaps in-file. |
| Scope Boundaries | HIGH | Only Unit 1 ships via PR; workflow/SKILL.md are global+gitignored. Soft-link decision keeps us in-fence (no migration). |
| Implementation Units | HIGH | Each is a localized edit with a clear dry-run check; deterministic JS derivation mirrors the existing gate pattern. |
| Test Strategy | MEDIUM | No script/workflow unit-test harness in-repo; verification leans on `dryRun` + live Demo-Winery `QA-*` runs (the repo's standing QA convention). Seeding realistic PLANNED/SKIPPED/duplicate fixtures is the main effort. |
| Risk Assessment | MEDIUM | Clustering false-positives could over-close unrelated tenants. Mitigated by conservative default-to-singleton, per-group justification, JS re-election, and `dryRun`-first. Dismiss-fan-out is the riskiest write — gated on a true root-cause match. |

## Risks & Mitigations

- **Over-clustering → wrongful mass-close.** A dismiss/resolve fan-out across a bad cluster closes
  live bugs. Mitigate: conservative clustering, JS validation (one cluster per item, real ids),
  `dryRun` shows the full fan-out before any write, and dismiss-fan-out only on confirmed same
  root cause. The tight auto-merge gate is unchanged, so a wrong cluster still can't merge unsafe code.
- **Plan snippet bloats context.** Cap `planMarkdown` in the script (~1500) + link out via
  `githubIssueUrl`.
- **Global workflow has no CI gate.** Edits to `~/.claude/workflows/bug-triage.js` aren't covered by
  repo CI. Verification is `dryRun` + a live Demo-Winery run before trusting a real (non-dry) pass.
