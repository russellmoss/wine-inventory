---
title: Assistant feedback/bug-report tool + weigh-in vineyard-block prefill
type: feat
status: draft
date: 2026-07-12
branch: feat/assistant-feedback-tool-weighin-block
depth: standard
units: 3
---

## Overview

Two related gaps surfaced in a real voice session where the winemaker built a fruit-intake work order.
First: the assistant told the user it "has no tool to file bugs or feedback" and could only offer a
paste-in write-up. It should be able to file the ticket itself when the user says "report this as a bug".
Second: when the user named "Russian River Pinot Noir (Block 1)", the block never landed on the
weigh-in / crush tasks — the block hint is dropped into summary text and never resolved to a real block,
so it doesn't prefill the execute screen. This plan adds a conversational feedback tool and wires the
named block through to the weigh-in task so it prefills.

## Problem Frame

- **Who:** the winemaker/operator talking to the in-app assistant (text or voice).
- **Problem 1 (feedback):** the assistant is a dead end for feedback. The whole feedback-fix loop
  (`createFeedbackTicket` → automation gate → fix agent) already exists and is reachable from the Help
  page and the 👍/👎 buttons, but not from a spoken/typed "file this as a bug". The user has to leave the
  conversation, open a form, and re-type context the assistant already has. That is exactly the friction
  the assistant is supposed to remove.
- **Problem 2 (block):** the operator named the exact lot/block; the work order silently didn't carry it.
  The in-app assistant explained this as "purely by design," which undersold a real half-wired gap: the
  data model (`WorkOrderTask.blockId`), the vocabulary field (`HARVEST_WEIGH_IN.blockId`), the canonical
  column extraction, and the execute-form prefill are ALL present — only the NL resolver fails to connect
  the named block to `values.blockId`. So the crew re-picks the block by hand and the authored WO looks
  like it "forgot" the lot.
- **Do nothing:** feedback keeps dying in conversation; every harvest WO makes the operator re-select a
  block the assistant already knew. Both are small, high-signal papercuts on the two flagship surfaces
  (assistant + work orders).

## Requirements

- MUST: a `write`-kind assistant tool that files a feedback ticket via `createFeedbackTicket()`, supporting
  both `BUG_REPORT` and `FEATURE_REQUEST`, following the confirm-before-write proposal/commit pattern.
- MUST: the tool is available to ALL users (not `adminOnly`).
- MUST: reject `FEATURE_REQUEST` under `AGENTIC_FIX` mode (already guarded in `tickets.ts`; surface it as a
  clean message, don't 500).
- MUST: at least one golden eval case per new write-tool name in
  `test/evals/assistant-write-tools.golden.ts` (D26/H8 coverage guard is a hard CI gate).
- MUST: the assistant's system prompt / tool description makes clear it CAN file feedback now (so it stops
  saying "I can't"), and it composes the ticket title+body from the conversation it already has in context.
- MUST: `HARVEST_WEIGH_IN` resolves a user-named vineyard block to a real `VineyardBlock.id` and stamps it
  into the task so the execute screen prefills it.
- MUST: block resolution supports the "no match" and "multiple matches" outcomes without crashing (fall
  back to the existing hint behavior on no-match; offer the clickable picker on ambiguity).
- SHOULD: for `CRUSH`, stamp the named lot/block into the task title/instructions (no formal block binding
  — crush binds to the harvest pick at run time).
- SHOULD: the assistant actually PASSES the block hint when the user names a lot/block (prompt/behavior
  gap observed in the transcript).
- NICE: attach a conversation snapshot as `debugContext` on the ticket (requires threading
  `conversationId` into `ToolContext` — a 3-file cross-cut; see Key Decisions, gated as optional Unit 3b).

## Scope Boundaries

**In scope:**
- One new assistant write tool `file_feedback` (kind param selects bug vs feature) + its committer + golden.
- Block resolution for the `HARVEST_WEIGH_IN` NL path at the tool layer, mirroring the existing
  pinned-material pattern in `propose-work-order.ts`.
- CRUSH title/instructions stamp with the named lot/block.
- Tool-description/prompt wording so the assistant knows it can file feedback and should pass the block.

**Out of scope:**
- No new DB tables or migrations (all infra exists: `FeedbackTicket`, `VineyardBlock.blockId` column).
- No change to the 👍/👎 `assistantFeedback` path or `FeedbackTicketModal` (button-driven path stays).
- No formal `blockId` binding on `CRUSH` (design: crush binds the pick at run time).
- No attachments/screenshots from the assistant tool (the Help-page form path already handles blob images;
  not re-plumbing that through chat here).
- No changes to money/ledger/tenancy — feedback + work-order authoring only.

## Research Summary

### Codebase Patterns

**Feedback infra (reuse, do not rebuild):**
- `createFeedbackTicket()` — `src/lib/feedback/tickets.ts:28`. Kinds `BUG_REPORT` / `FEATURE_REQUEST`,
  writes `FeedbackTicket` + `recordAutomationGate(FEEDBACK_TICKET)`; guards FEATURE_REQUEST≠AGENTIC_FIX
  (`tickets.ts:38`). Takes `{ tenantId, kind, title, body, pageUrl?, userAgent?, debugContext?,
  actorUserId?, actorEmail }`.
- `FeedbackDebugContext` shape — `src/lib/assistant/feedback-snapshot.ts:15`; `buildFeedbackSnapshot()`
  (`:79`) is only callable where `conversationId` is known (the feedback route, not the tool loop).

**Write-tool anatomy (mirror `record-tasting-note.ts`):**
- Tool exports `AssistantTool` (`kind:"write"`, `inputSchema`, `run()` → `{ needsConfirmation, preview,
  token }` via `signProposal(name, args)` — `confirm.ts:33`) AND a `Committer` that calls the real server
  action. Return contract: `WriteProposal` in `assistant-events.ts:72`.
- Committer registry: `COMMITTERS` map in `commit.ts:66`, keyed by tool name; `propose_work_order` import
  at `commit.ts:50`, registered `commit.ts:97`. **Tool files must NOT import `commit.ts`** (cycle — see
  note at `commit.ts:64`); `commit.ts` imports the committer from the tool file.
- Registry: add import (~`registry.ts:94`) + entry in `ALL_TOOLS` (~`registry.ts:160`). Omit `adminOnly`
  so `getToolsFor` (`registry.ts:164`) shows it to everyone.
- Single commit HTTP path: `src/app/api/assistant/confirm/route.ts:29` → `commitProposal` (nonce burned,
  `commit.ts:116`).

**Golden-eval gate (hard CI):**
- Dataset `test/evals/assistant-write-tools.golden.ts` — `GoldenCase = { utterance, tool, args, note? }`
  (`:16`). Coverage guard `test/evals/assistant-tools.eval.test.ts:96` filters `kind==="write"` tool names
  and asserts each is in `ASSISTANT_WRITE_GOLDEN` (keyed by `g.tool` === tool `name`) or `UNCOVERED_OK`
  (`:30`). Per-case structural check (`:57`): every golden `args` key must be a real `inputSchema`
  property, types match, and all `required` fields present.

**Block resolution (Unit B):**
- Model `VineyardBlock` — `prisma/schema.prisma:358`; identifiers `blockLabel`/`code`, relations
  `vineyard`/`variety`; composite `@@unique([tenantId, id])` (`:384`) is the target of
  `WorkOrderTask.blockId`.
- Reusable resolver `findScopedBlocks(user, {block,vineyard,variety})` — `src/lib/assistant/scope.ts:62`
  (fuzzy label/variety match, vineyard-access scoped) + `resolveExactlyOne` (`tools/resolve.ts:9`, throws)
  / `resolveOneOrChoice` (`resolve.ts:29`, returns a clickable `ChoiceRequest`). Already used by
  `log_harvest_pick` (`log-harvest-pick.ts:74`, signs `blockId: block.id`).
- Prefill path: `values.blockId` → `canonicalColumns` (`template-vocabulary.ts:390`) → `WorkOrderTask.blockId`
  → `HarvestWeighInTaskForm.tsx:29` (`task.blockId ?? blocks[0]?.blockId ?? ""`). No readiness block:
  `blockId` `runtime()` only appends to informational `runtimeInputs` (`proposal-readiness.ts:232,582`),
  never `unresolved`/`blocking`.
- Current gap: `HARVEST_WEIGH_IN` intent handler `nl-resolve.ts:605-610` sets `values = {note}` and only
  interpolates `intent.block` into the summary — never `values.blockId`.
- Key wrinkle: `findScopedBlocks` needs an `AppUser`; `nl-resolve` resolvers are tenant-context-based and
  take no user. So resolve at the TOOL layer (`propose-work-order.ts` has `ctx.user`) — mirrors the
  existing `materialChoiceIfNeeded` + `inputForPinnedMaterial` pinned-`#id` pattern
  (`propose-work-order.ts:59,76`).
- CRUSH: no `blockId` column extraction (`canonicalColumns` only mirrors `destVesselId`,
  `template-vocabulary.ts:382`); the CRUSH execute form picks block→pick→lot itself
  (`CrushTaskForm.tsx:32,130`). So for CRUSH the only lever is the free-form title/instructions.

### Prior Learnings
No matching rstack learnings found for these keywords. Relevant memory: assistant write tools ship
manual-QA-only (no jsdom/RTL; vitest is node-env) — test pure logic + golden evals. D26/H8 golden-per-
write-tool is a known hard gate (see plan 038 memory).

### External Research
None needed — all internal patterns.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| One tool vs two | ONE tool `file_feedback` with a `kind` enum (`bug`\|`feature`) | Separate `report_bug` + `request_feature` | One tool = one golden-case family, one committer, less surface; the kind maps cleanly to `FeedbackTicketKind`. |
| Where feedback content comes from | Tool takes `title`/`body`/`kind` as **input args**; the assistant composes them from the conversation it already has | Auto-snapshot the live conversation in the tool | `ToolContext` has no `conversationId` (`registry.ts:15`); auto-snapshot needs a 3-file cross-cut. The model already holds the conversation and can summarize. |
| Conversation snapshot as debugContext | Optional Unit 3b (thread `conversationId` → `ToolContext` → `run.ts` → committer → `buildFeedbackSnapshot`) | Do it in the core unit | Nice-to-have richer debug context; not required for the tool to work. Keep the core unit small. |
| Where to resolve the block | TOOL layer in `propose-work-order.ts` (has `ctx.user`), pin resolved `#blockId` into the intent, mirror `materialChoiceIfNeeded` | Resolve inside `nl-resolve` (needs user threaded through `buildNlWorkOrderProposal`) | Tool layer already has the user + the pinned-`#id` + clickable-picker pattern; avoids a signature change across the NL core. |
| No-match block behavior | Keep the existing hint (block shows in summary, floor-confirmed); do NOT block the proposal | Hard-fail if block can't resolve | Weigh-in block is a runtime input; a wrong/unknown name shouldn't stop the WO. Graceful degrade = current behavior. |
| CRUSH block | Title/instructions stamp only | Add `blockId` binding to CRUSH | Crush binds the harvest pick at run time by design; a formal binding would fight the transform model. |

## Implementation Units

### Unit 1: `file_feedback` assistant write tool + committer + registration

**Goal:** Let the user file a bug report or feature request by talking to the assistant.
**Files:**
- create `src/lib/assistant/tools/file-feedback.ts` (`fileFeedbackTool` + `commitFileFeedback`)
- modify `src/lib/assistant/registry.ts` (import + `ALL_TOOLS` entry, no `adminOnly`)
- modify `src/lib/assistant/commit.ts` (import committer + `COMMITTERS["file_feedback"]`)
**Approach:** Copy the shape of `record-tasting-note.ts`. `inputSchema`: `kind` enum
(`"bug"|"feature"` → map to `FeedbackTicketKind`), `title` (string), `body` (string), all `required`.
`run(ctx, input)` validates, builds a `preview` like `File a bug report: "<title>"`, and returns
`signProposal("file_feedback", { kind, title, body })`. `commitFileFeedback(user, args)` resolves
`tenantId = user.supportOrganizationId ?? user.activeOrganizationId` (match the feedback route,
`feedback/route.ts:27`), calls `createFeedbackTicket({ tenantId, kind, title, body, actorUserId: user.id,
actorEmail: user.email })`, and returns `{ message: "Filed <kind> #… — thanks, the team will see it.",
navigate: { path: <help/feedback my-reports path>, label: "My reports" } }`. Catch the
FEATURE_REQUEST≠AGENTIC_FIX guard and return a clean message. Do NOT import `commit.ts` from the tool file.
**Tests:** Pure-logic unit test for the kind→`FeedbackTicketKind` mapping and title/body trimming if any
lives in the tool module; otherwise covered by the golden (Unit 2) + manual QA. No DB test in CI (node-env).
**Depends on:** none
**Verification:** `npm run build` (catches client/server import leaks — memory: `check` CI doesn't run
next build); manual: in the assistant say "report a bug: the weigh-in task doesn't carry the block" →
confirm card → confirm → row appears via a `runAsTenant("org_demo_winery", …)` read-back script.

### Unit 2: Golden eval case(s) for `file_feedback` (D26/H8 gate)

**Goal:** Satisfy the hard CI coverage guard and lock the NL→tool mapping.
**Files:** modify `test/evals/assistant-write-tools.golden.ts`
**Approach:** Add ≥2 `GoldenCase`s with `tool: "file_feedback"`: one bug (`"report this as a bug: X"` →
`args: { kind: "bug", title, body }`), one feature (`"file a feature request to let weigh-in tasks carry a
block"` → `{ kind: "feature", title, body }`). Ensure every `args` key is a real `inputSchema` property and
all `required` fields present (structural check `assistant-tools.eval.test.ts:57`).
**Tests:** the eval suite itself — `npx vitest run test/evals/assistant-tools.eval.test.ts`.
**Depends on:** Unit 1 (tool name + schema must exist)
**Verification:** eval suite green; the coverage guard (`…eval.test.ts:96`) no longer lists `file_feedback`
as ungoverned.

### Unit 3: Resolve + prefill vineyard block on HARVEST_WEIGH_IN (and CRUSH title stamp)

**Goal:** A user-named block lands on the weigh-in task and prefills the execute screen; crush task shows
the lot/block in its title.
**Files:**
- modify `src/lib/assistant/tools/propose-work-order.ts` (add block-resolution step, mirror
  `materialChoiceIfNeeded`/`inputForPinnedMaterial`)
- modify `src/lib/work-orders/nl-proposal.ts` (carry a resolved `blockId` on the `HARVEST_WEIGH_IN` intent;
  optionally a `blockLabel` for CRUSH title)
- modify `src/lib/work-orders/nl-resolve.ts` (`HARVEST_WEIGH_IN` handler ~`:605` → `values.blockId =
  <resolved>`; CRUSH handler ~`:545` → stamp lot/block into title/instructions)
**Approach:** In `propose-work-order.ts`, after `canonicalizeNlWorkOrderDraft`, for each `HARVEST_WEIGH_IN`
intent whose `block` is a plain name (not already `#id`), call `findScopedBlocks(ctx.user, { block })`
(scope.ts:62). Zero matches → leave the hint as-is (graceful degrade). Exactly one → pin `#<blockId>` into
the intent (new `inputForPinnedBlock` helper modeled on `inputForPinnedMaterial`, re-`signResume` for the
picker path). Multiple → return a `ChoiceRequest` (reuse `resolveOneOrChoice` semantics) so the user taps
the right block. In `nl-resolve.ts`, when the intent carries a resolved `blockId`, set `values.blockId` so
`canonicalColumns` mirrors it to the column and the form prefills. For CRUSH, when the source lot/block is
known from the draft, append it to the task title/instructions (free-form; no column).
**Tests:** Extend `test/work-order-harvest-weigh-in.test.ts` and/or `test/work-order-nl-proposal.test.ts`
(pure): given a draft with a resolvable block name, the built task carries `blockId`; given an ambiguous
name, a choice is returned; given no match, it degrades to hint-only (no throw, WO still ready). CRUSH title
includes the block label when provided.
**Depends on:** none (independent of Units 1-2; can land separately)
**Verification:** `npm run verify:work-order-nl` (memory: NL WO verify script) + manual QA in Demo Winery:
voice/text "take in the Russian River Pinot (Block 1), weigh it, destem to T6" → open the issued WO →
weigh-in execute screen shows Block 1 preselected; crush task title names the lot.

### Unit 3b (OPTIONAL): attach conversation snapshot as debugContext

**Goal:** Richer bug reports carry the recent conversation + trace.
**Files:** `src/lib/assistant/registry.ts` (`ToolContext += conversationId?`), `src/app/api/assistant/route.ts`
(pass `conversationId` into `runAssistant`), `src/lib/assistant/run.ts` (thread into `tool.run` ctx),
`src/lib/assistant/tools/file-feedback.ts` (committer calls `buildFeedbackSnapshot` when `conversationId`
present).
**Approach:** Only if the user wants it. Thread `conversationId` end-to-end, then in `commitFileFeedback`
build the snapshot and pass `debugContext`. Keep a clean fallback when `conversationId` is absent.
**Depends on:** Unit 1
**Verification:** filed ticket's `debugContext.source === "server-conversation"` with a windowed transcript.

## Test Strategy

**Unit tests:** pure-logic only (node-env vitest). Golden eval (Unit 2) is the primary automated gate for
the feedback tool; NL-proposal/weigh-in tests (Unit 3) cover block resolve/degrade/ambiguity + CRUSH title.
**Integration tests:** none new in CI. DB persistence proven out-of-band with a
`runAsTenant("org_demo_winery", …)` read-back script (never Bhutan).
**Manual verification:** (1) assistant "report this as a bug …" → confirm → ticket row in Demo Winery;
(2) "file a feature request …" → ticket kind FEATURE_REQUEST; (3) harvest-intake WO from NL → weigh-in
execute screen prefills the named block; crush task title names the lot. Run `npm run build` before the PR
(client→server import leaks only surface in `next build`, not `check` CI — memory).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| D26/H8 golden guard fails PR | MED | LOW | Unit 2 adds the golden; run the eval suite locally before pushing. |
| Block name resolves to the wrong block (fuzzy) | MED | MED | Use the clickable picker on >1 match; degrade to hint on 0; block is a floor-confirmed runtime input anyway. |
| `findScopedBlocks` vineyard-access scoping hides a block for a manager | LOW | MED | Same scoping the log-harvest-pick tool already uses; acceptable/consistent. On 0 matches, degrade to hint. |
| Client/server import leak in the new tool (only caught by `next build`) | MED | MED | Run `npx next build` before merging; `file-feedback.ts` is `server-only` like siblings. |
| FEATURE_REQUEST under AGENTIC_FIX 500s | LOW | LOW | Catch the `tickets.ts:38` guard, return a clean message. |
| Build done in .env-less worktree (verify:* / build can't hit Neon) | MED | LOW | Execute this plan in the MAIN checkout `C:\Users\russe\Documents\Wine-inventory` (memory), branch + PR. |

## Success Criteria

- [ ] Assistant files a `BUG_REPORT` and a `FEATURE_REQUEST` from chat via confirm-before-write; rows land
      in Demo Winery (read-back proven).
- [ ] Assistant no longer claims it "can't file bugs" (tool description/prompt updated).
- [ ] `file_feedback` is covered by ≥1 golden case; D26/H8 coverage guard green.
- [ ] Naming a vineyard block on a harvest-intake WO prefills the weigh-in execute screen's block picker.
- [ ] Ambiguous block name shows a picker; unknown name degrades to hint (WO still issues).
- [ ] CRUSH task title/instructions name the lot/block.
- [ ] `npm run build` clean; NL work-order verify green; no regressions in existing tests.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Reproduced from a real transcript; both gaps traced to specific lines. |
| Scope Boundaries | HIGH | Reuses existing infra; no schema/migration. |
| Implementation Units | HIGH | Write-tool wiring + block-resolution path both mapped to file:line by research agents. |
| Test Strategy | MEDIUM | Automated coverage is golden-eval + pure NL tests; DB persistence is manual read-back (no jsdom/node-env). |
| Risk Assessment | HIGH | Main risks are the known golden-gate and fuzzy block match, both mitigated. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET -- run `/autoplan` for full review pipeline, or individual reviews above.
