---
title: Bug-triage outcome notes — richer write-back + visible outcome in /developer
type: feat
status: completed
date: 2026-07-14
branch: claude/bug-triage-outcome-notes
depth: standard
units: 4
---

## Overview

When `/bug-triage` closes out a feedback item it should leave a clear **outcome note** —
what it did and *how* (root cause + the change/PR) when it fixed something, or *why* it
didn't and what's needed next when it couldn't. The write-back plumbing already exists;
the notes are just thin, and the `/developer` UI barely shows them. This plan makes the
notes richer and makes the outcome legible in the front-end so a human can see, at a
glance, what the goalie did to every item.

## Problem Frame

The winery operator (and the developer working the backlog) files feedback and wants to
know: did anything happen, and what? Today the answer is buried. `/bug-triage` writes a
one-liner like `"Auto-merged PR #123 via bug-triage."` into `developerNotes`, and the only
way to read it is to click **Open** on a row and squint at a raw editable `<textarea>`. There
is no outcome column, no signal a note even exists, and a not-fixed item's *reason* is a
single terse line with no "what next."

If we do nothing: the loop technically closes (status flips to RESOLVED/DISMISSED/TRIAGED)
but the *why* evaporates. The operator can't tell a real fix from a dismissal from a
"handed to a human," and every re-triage run re-reads a stub. The cost is trust — the
backlog looks worked but doesn't explain itself.

**Product note (pressure test):** the core capability is already there (`triage:resolve`
writes `developerNotes`, the UI reads it). This is a *legibility* upgrade, not a new system.
The right framing is "make the existing outcome readable and richer," which is why this is a
4-unit polish, not a schema project.

## Requirements

- MUST: every `/bug-triage` action (merge, dispatch, dismiss, plan-ready, queue-for-human,
  reconcile) writes an outcome note that states **what happened** and, for a fix, **how**
  (root cause + the change/PR); for a not-fix, **why** and **what's needed next**.
- MUST: keep the existing `[type]` disposition prefix, the stamped `[bug-triage <iso>]`
  entry format, the newest-first prepend/merge, the 5000-char cap, and the cluster fan-out.
- MUST: `/developer` renders `developerNotes` as a **read-friendly outcome/triage timeline**
  (parsed into stamped entries), not just a raw editable field.
- MUST: the backlog table shows an **outcome indicator** (a short last-outcome preview and/or
  a "has triage note" marker) per row, so you see it without opening the item.
- SHOULD: surface `resolvedAt` (and who resolved it, if cheap) and make `prUrl` visible in
  the row or editor, not only behind Open.
- SHOULD: keep a human's ability to add/edit a note without clobbering the machine history.
- NICE: distinguish machine entries (`[bug-triage …]`) from human entries visually.

## Scope Boundaries

**In scope:**
- Richer note copy in the global workflow `~/.claude/workflows/bug-triage.js` (Act step) and
  the contract documented in `~/.claude/skills/bug-triage/SKILL.md`.
- `/developer` front-end: outcome timeline in the item editor + row-level outcome preview.
- Threading `resolvedAt` (+ optional resolver email) through the developer data loader/type.

**Out of scope:**
- **No schema change.** `developerNotes` already carries the outcome as stamped entries; a
  new column/table is not warranted (see Key Decisions). If a future need for structured,
  queryable outcome data appears, that's a separate plan.
- The repo-side script `scripts/bug-triage-set-status.ts` — it already merges + caps + stamps
  notes and writes an audit row; **no change needed** there. The richness comes from the
  `--note` text the workflow passes.
- Changing status/disposition semantics, the auto-merge gate, or the dispatch pipeline.
- `/cockpit-bug-triage` (separate product, Neon `bug_reports`) — not touched.

## Research Summary

### Codebase Patterns

- **Write-back (repo):** `scripts/bug-triage-set-status.ts:130` `mergeNotes()` prepends
  `[bug-triage <ISO>] <note>`, separates prior entries with `\n\n---\n`, caps at 5000, and
  writes an audit row (`scripts/bug-triage-set-status.ts:115`). Invoked as `npm run
  triage:resolve -- --note="…"`. This is solid; it just needs a richer `<note>`.
- **Workflow note sites (global):** `~/.claude/workflows/bug-triage.js` Act step passes the
  notes today at: merge (`Auto-merged PR #<n> via bug-triage.` ~line 496), fan-out resolve
  (~497), dispatch (`Dispatched fix agent via bug-triage.` ~501), plan-ready (~504), dismiss
  (`<why one line>` ~508), queue-for-human (verdict ~512), reconcile (~248). Each already
  prefixes the `[type]` disposition and appends `--triage-class=<enum>`.
- **Client (repo):** `src/app/(app)/developer/DeveloperClient.tsx` — backlog table rows
  (~239-268) show Created/Tenant/Type/Title/Severity/Disposition/Status/Automation/Actions,
  no outcome. `ItemEditor` (~326-393) renders `developerNotes` only as an editable
  `<Textarea>` (line 376); `prUrl`/`githubIssueUrl`/attachments appear as links at ~385-387.
  UI primitives `Badge, Button, Card, Input, Textarea` from `@/components/ui`; all styling via
  design tokens (`var(--…)`), no hardcoded colors — must stay that way (DESIGN.md).
- **Data loader (repo):** `src/lib/developer/feedback.ts` — `DeveloperFeedbackItem` (type at
  ~25-45) already exposes `developerNotes`, `prUrl`, `githubIssueUrl`, `planMarkdown`. It does
  **NOT** expose `resolvedAt`/`resolvedByUserId`. `developerNotes` is sanitized to 4000 chars
  (lines 136, 161) via `sanitizePlainText` — the timeline parser must tolerate truncation.
- **Update action (repo):** `src/lib/developer/actions.ts:135` `updateFeedbackItem` **replaces**
  `developerNotes` with the client string (cap 5000). So the current editor pre-fills the full
  field and a human save rewrites it whole — a read-only timeline + full-field editor risks a
  human clobbering machine history (addressed in Unit 4 / Key Decisions).
- **Disposition rendering:** `DispositionBadge` + `DISPOSITIONS` tone map already exist in
  `DeveloperClient.tsx` (~22-39) — reuse that visual language for outcome tone.

### Prior Learnings

- `[[plan059-feedback-triageclass-shipped]]` — the disposition (`triageClass`) column/filter
  and the goalie writing it back from root cause is the direct predecessor; the `[type]`
  prefix in notes is its convention. Reuse it.
- `[[bug-triage-skill-shipped]]` + `[[bug-triage-dryrun-args-gotcha]]` — the skill/workflow
  live GLOBAL in `~/.claude` (workflows gitignored); scripts live in the repo. Run from the
  main checkout. **Verify `status` reflects a real (non-dry-run) write before trusting it.**
- `[[build-in-main-checkout-not-worktrees]]` / `[[main-repo-has-env-verify-runs]]` — do the
  repo build on `main` checkout (has `.env`); worktrees lack `.env`.
- No RTL/jsdom in the repo (vitest is node-env) — the `/developer` UI ships **manual-QA-only**;
  unit-test only the pure note-parsing helper.

### External Research

None needed — no new framework/API. Next.js 16 App Router server-component → client-component
prop flow is already the pattern in `page.tsx` → `DeveloperClient.tsx`.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where the machine outcome lives | Keep it in `developerNotes` as stamped `[bug-triage <iso>]` entries | New `triageOutcome` column on both feedback models; new outcome table | `developerNotes` already accumulates a stamped, newest-first, capped, audited history and the UI already reads it. A column adds a migration on 2 models for no queryable benefit here; a table triggers the full Phase-12 tenant-scoped checklist. Lightest option that meets the need. |
| Note richness | Structured one-liner-plus: `[type] <verb> — <root cause / what changed> — <link or next step>` within the cap | Free-form paragraph | Keeps deterministic write-back + cap-safe, still says what+how / why+next. |
| Editor vs history clobber | Render a **read-only outcome timeline** parsed from `developerNotes`; keep the editable field but relabel it "Add / edit notes" and pre-fill with full text (unchanged save semantics) | Change save to *prepend* a stamped human entry (needs `updateFeedbackItem` change) | Lower risk, no server-action behavior change. Prepend-on-save is noted as a fast-follow if humans start clobbering history in practice. |
| `resolvedAt` exposure | Add `resolvedAt` (+ optional resolver email) to `DeveloperFeedbackItem` and the loader select | Leave it out | Cheap (2 selects + 2 mappings), and "when/by whom was this closed" is core to the outcome story. |

## Implementation Units

### Unit 1: Richer outcome notes in the bug-triage workflow (out-of-repo)

**Goal:** Every Act-step (and reconcile) `--note` states what happened + how (fix) or why +
what's next (not-fixed), keeping the `[type]` prefix, stamps, cap, and fan-out.
**Files:** `~/.claude/workflows/bug-triage.js` (Act-step prompt strings + reconcile note).
*(Out-of-repo — global rstack workflow, gitignored; not part of the repo diff.)*
**Approach:** Upgrade the note templates the Act agent is instructed to write:
- Merge → `[<type>] Fixed — <root cause in a phrase>; merged PR #<n> (<what the change did>).`
- Dispatch → `[<type>] Fix dispatched — <root cause>; fix agent running, PR to follow.`
- Dismiss → `[<type>] Not a bug — <why, one line>; no code change warranted.`
- Plan-ready → `[<type>] Not auto-fixed (needs a plan) — <gap>; plan ready at <url>, run /work.`
- Queue/needs-human → `[<type>] Handed to a human — <verdict>; <deeper issue / next step>.`
- Model-behavior → `[<type>] Mitigation only — <lever tried>; behavior is stochastic, may recur.`
- Reconcile → `[<type>] Fixed (reconciled) — PR #<n> already merged; closed out.`
  Keep each within ~2 lines so the 5000-char merge cap holds across many entries. Keep the
  fan-out notes referencing the primary id + PR. Do not change the deterministic JS action sets.
**Tests:** None automated (workflow is a script). Verify by dry-run (Unit-4 manual QA reads
the resulting notes) — a `dryRun:true` run shows the intended `--note` text in `actions`.
**Depends on:** none
**Execution note:** Edit the global file directly; call it out in the PR description since it
won't appear in `git diff`.
**Patterns to follow:** existing Act prompt at `~/.claude/workflows/bug-triage.js` ~488-515.
**Verification:** `Workflow({ name:'bug-triage', args:{ dryRun:true } })` from the main
checkout; confirm `status:"dry-run"` and that each intended action carries a richer note string.

### Unit 2: Document the outcome-note contract in the skill (out-of-repo)

**Goal:** The skill spells out the outcome-note contract so future runs (and edits) keep it.
**Files:** `~/.claude/skills/bug-triage/SKILL.md`. *(Out-of-repo — global.)*
**Approach:** Add a short "Outcome notes (what gets written back)" subsection near the
Guardrails: the entry format, the what+how / why+next requirement per bucket, the cap/stamp/
fan-out rules, and that the `/developer` console renders these as the item's outcome timeline.
Cross-reference the disposition `[type]` prefix already documented.
**Tests:** none (doc).
**Depends on:** Unit 1 (describe what Unit 1 implements).
**Verification:** Re-read SKILL.md; the contract matches the Unit-1 templates.

### Unit 3: Expose `resolvedAt` (+ resolver) through the developer data loader (repo)

**Goal:** The client can show when/by whom an item was closed.
**Files:** `src/lib/developer/feedback.ts`.
**Approach:** Add `resolvedAt: string | null` (ISO) — and optionally `resolvedByEmail:
string | null` — to `DeveloperFeedbackItem`. In both `findMany` mappings (assistantFeedback
~116-139 and feedbackTicket ~142-164) select `resolvedAt` (already columns on both models) and
map to ISO; if including the resolver, `include` the `resolvedByUserId`→user email (or a
lightweight lookup) — keep it within the existing `runAsTenant` block. Do not widen the query
shape beyond these fields.
**Tests:** No node test harness for this loader; covered by manual QA in Unit 4. (If a cheap
pure mapping helper is extracted, unit-test it.)
**Depends on:** none
**Verification:** `npx tsc --noEmit` (type flows to client); the field appears in the prop.

### Unit 4: Outcome timeline + row indicator in /developer (repo)

**Goal:** A human sees the outcome without archaeology — a readable timeline in the editor and
a last-outcome preview in the table row.
**Files:** `src/app/(app)/developer/DeveloperClient.tsx`; new pure helper
`src/lib/developer/triage-notes.ts` (parser).
**Approach:**
- **Parser (`triage-notes.ts`):** pure fn `parseTriageNotes(developerNotes: string | null):
  { stamp: string | null; source: "bug-triage" | "human"; type: string | null; text: string }[]`.
  Split on `\n\n---\n`; for each entry detect a leading `[bug-triage <iso>]` stamp (→ machine)
  and a `[type]` disposition prefix; everything else is a human entry. Tolerate the loader's
  4000-char truncation (a trailing partial entry is fine). Newest-first order is preserved
  (notes are stored newest-first).
- **Editor (`ItemEditor`):** above the editable field, render a read-only "Outcome / triage
  history" list from `parseTriageNotes(item.developerNotes)` — each entry as a small card:
  disposition Badge (reuse `DISPOSITION_META` tone), a "goalie" vs "you" tag, the timestamp,
  the text. Keep the existing editable `<Textarea>` (relabel "Add / edit notes"). Surface
  `item.resolvedAt` (+ resolver) and keep the `prUrl` link.
- **Row (backlog table):** add an "Outcome" cell showing the newest entry's short preview
  (first ~60 chars) with a marker/📝 when a triage note exists; `title=` full newest entry.
  Reuse `cellStyle`; tokens only, no hardcoded colors.
**Tests:** Vitest (node-env) unit tests for `parseTriageNotes` in `test/triage-notes.test.ts`:
- input: null / empty → `[]`.
- input: one machine entry `"[bug-triage 2026-07-14T…] [defect] Fixed — …"` → 1 entry, source
  `bug-triage`, type `defect`, timestamp parsed.
- input: machine + human entries joined by `\n\n---\n` → correct count, order, source tags.
- input: truncated trailing entry (mid-string cut) → does not throw, best-effort last entry.
**Depends on:** Unit 3 (for `resolvedAt`); parser has no deps.
**Execution note:** test-first for the parser (pure, easy goldens).
**Patterns to follow:** `DispositionBadge`/`DISPOSITIONS` (`DeveloperClient.tsx` ~22-39);
row/cell style `cellStyle` (~282); links block (~385-387).
**Verification:** `npx next build` (UI PR gate — `npm run build` runs migrations, avoid it per
`[[plan053-work-order-builder-drafted]]`; use `next build`), then manual browser QA on the
Demo Winery `/developer` console: an item with a `[bug-triage …]` note renders the timeline and
the row preview; the editable field still saves.

## Test Strategy

**Unit tests:** `test/triage-notes.test.ts` for the pure parser (the only logic with a
deterministic contract). No RTL/jsdom in repo → no component tests.
**Integration tests:** none — the loader + action are exercised by manual QA.
**Manual verification (end-to-end, Demo Winery sandbox only):**
1. From the main checkout, run `Workflow({ name:'bug-triage', args:{ dryRun:true } })`; confirm
   the intended notes read as rich outcomes (what+how / why+next).
2. Optionally run a real triage pass (or hand-write one `triage:resolve --note` on a `QA-*`
   Demo item) so a `[bug-triage …]` note exists.
3. In `/developer` (user logs in as Demo), confirm: row shows the outcome preview + marker;
   Open shows the read-only timeline with disposition badge + goalie/you tag + timestamp +
   `resolvedAt`; the editable notes field still saves.
4. `verify:naming` green before and after; clean up `QA-*` fixtures.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Human save clobbers machine note history (full-field editable) | MED | MED | Read-only timeline is the source of truth for reading; note in Unit 4. Fast-follow: change `updateFeedbackItem` to prepend a stamped human entry instead of replacing. |
| Loader 4000-char truncation cuts an entry mid-string | MED | LOW | Parser tolerates a partial trailing entry (test covers it); raise the sanitize cap only if needed. |
| Global workflow/skill edits invisible in `git diff` → look "undone" | MED | LOW | Call out the out-of-repo files explicitly in the PR body; Unit-1 dry-run is the proof. |
| Note templates blow the 5000-char cap over many entries | LOW | LOW | Keep each note ≤2 lines; `mergeNotes` already hard-caps (oldest entries drop off). |
| Row "Outcome" column crowds the table | LOW | LOW | Short preview + `title=` tooltip; reuse existing overflow-ellipsis pattern from the Title cell. |

## Success Criteria

- [ ] Every `/bug-triage` action writes an outcome note that says what+how (fix) or why+next
      (not-fix), with the `[type]` prefix, stamps, cap, and fan-out intact (Unit 1, dry-run proof).
- [ ] SKILL.md documents the outcome-note contract (Unit 2).
- [ ] `DeveloperFeedbackItem` carries `resolvedAt` (+ resolver if included) end-to-end (Unit 3).
- [ ] `/developer` renders a read-only outcome/triage timeline in the editor and a last-outcome
      preview + marker in the row; `resolvedAt`/`prUrl` visible (Unit 4).
- [ ] `parseTriageNotes` unit tests pass (null/empty, single, multi, truncated).
- [ ] `npx next build` clean; `verify:naming` green; manual QA on Demo Winery passes.
- [ ] No schema migration; no change to `scripts/bug-triage-set-status.ts` behavior.
