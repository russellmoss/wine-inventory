---
title: Assistant history replay — stop the model narrating writes it never performed
type: fix
status: completed
date: 2026-07-20
branch: fix/assistant-history-tool-replay
depth: deep
units: 6
---

## Overview

The assistant tells winemakers it saved things it never saved. Ask it to log a tasting note
after a few write turns in the same chat and it replies "I've logged a tasting note on T5 —
review and confirm the card" without calling any tool. Nothing is written. This plan fixes the
mechanism (history replay drops all evidence that tools were ever called), builds the eval axis
that can actually see the failure, and upgrades the over-claim guard from a post-hoc apology
into a repair turn.

## Problem Frame

**Who has this problem:** every user of the assistant, on every write tool, in any conversation
long enough to contain a few writes. The cellar-floor case is the worst one: a winemaker with
gloves on, mid-tasting, is told the note is saved. It isn't. They find out later, or never.

**Root cause (measured, not inferred).** `src/lib/assistant/history.ts:16` keeps only
`typeof content === "string"`. `tool_use` and `tool_result` blocks are dropped. So the model's
visible history contains N of its own prior turns saying "review and confirm the card" as plain
prose **with no tool call attached anywhere**. It correctly infers the pattern — "a write request
is answered with prose claiming a card" — and completes it.

Replayed against `claude-opus-4-8`, the real system prompt, 84 tools, no `tool_choice`:

| Condition | Tool called |
|---|---|
| Cold start (what every eval measures today) | 8/8 |
| Real 11-turn history from feedback `cmrsrs02` | **0/8** |
| Ablation A — history with assistant turns stripped | 6/6 |
| Ablation B — history + a text marker saying a tool ran | **0/6** |

The 0/8 runs reproduce the live bug verbatim. Ablation A isolates the cause to the assistant's
own card-claiming prose, not history length. **Ablation B is the important negative result:** the
cheap "annotate the transcript" fix does not work, and the model copied the marker into its
user-visible reply. Whatever we build has to change the *structure* the model sees, not add prose
about it.

This is deterministic, not stochastic, and it is tool-agnostic. It is very likely the same
mechanism behind the 2/7 `propose_work_order` baseline recorded in plan 081 — which means plan
081's fix was measured under cold-start conditions that cannot exhibit it.

**If we do nothing:** every write surface silently degrades as conversations get longer, and the
only thing standing between the user and a false "saved" is `overclaim-guard.ts`, which detects
the lie after the fact and never retries.

**Pressure test.** Is this the right problem? Yes — it is confirmed data loss with a reproduction.
Is there a simpler framing? Possibly: Ablation A suggests *neutralizing* the stored prose might
work as well as replaying real blocks, for a fraction of the cost. That is a real fork, and it is
why Unit 1 is a spike rather than a build.

## Requirements

- MUST: with a realistic write-heavy history, a write request produces a tool call at or above the
  existing `CARD_RATE_THRESHOLD` (0.9), measured on the reproduction from `cmrsrs02`.
- MUST: never send the Anthropic API a `tool_use` block whose matching `tool_result` was dropped by
  windowing. That is a hard 400 and it has bricked long conversations before.
- MUST: no regression to conversation full-text search (`AssistantMessage.search_vector` is a
  generated column over `content`).
- MUST: text-only conversations behave exactly as today (no shape change for the common case).
- MUST: voice mode and text mode share one history path — they must not drift.
- SHOULD: rebuild history server-side from the DB rather than trusting the client-supplied array.
- SHOULD: when the over-claim guard fires, recover the user's intent, not just confess.
- NICE: re-measure the plan 081 cases under history replay and correct their recorded baselines.

## Scope Boundaries

**In scope:**
- History persistence fidelity and replay shape for the assistant loop.
- Windowing rules for paired tool blocks.
- The must-propose eval gaining a history axis.
- The over-claim guard's response to a detected no-tool write claim.

**Out of scope:**
- `trace.ts` `MAX_ARRAY = 20` truncating `toolNames` in stored feedback traces. Real bug (it
  misled the PR #391 fix agent into believing `record_tasting_note` was never offered) but a
  separate, one-line concern. Follow-up ticket, not this plan.
- The whole-tank tasting-note fan-out gap logged in `TODOS.md`. Different problem, same feedback item.
- Changing the system prompt to fix this. Instructions lose to in-context demonstration; that is
  what PR #391 already tried, and it measured 10/10 both with and without.
- Any change to how proposals/tokens are signed or committed.

## Research Summary

### Codebase Patterns

**String-only is enforced at three independent layers.** Any fix has to move all three or none:
1. `src/app/(app)/assistant/AssistantChat.tsx:511` — `filter(kind === "text")` drops proposal and
   choice items before building the outgoing history array.
2. `src/lib/assistant/message-window.ts:47` — non-string content is a hard `Invalid messages.` 400.
3. `src/lib/assistant/run.ts:75-78` — `convo` is seeded by mapping `content` straight through.

**History round-trips through the browser.** DB → `getConversation`
(`src/lib/assistant/conversations.ts:104-121`, selects `metadata`) → GET → client
`messagesToItems` (discards `metadata`) → client history array → POST → `parseAndWindowMessages`
→ `run.ts`. The server currently accepts whatever history the client sends.

**The in-turn shape already does this correctly** and is the model to copy:
`run.ts:141` pushes the full assistant content *including* `tool_use` blocks; `run.ts:268` returns
**all** tool results in a **single** user message. That richness is discarded at the end of the
request — only `assistantText` survives to `run.ts:306`.

**Storage constraints.** `AssistantMessage.content` is `String @db.Text`
(`prisma/schema.prisma:1204`) with a generated `search_vector` tsvector over it
(`:1209`, GIN-indexed `:1213`). `metadata Json?` (`:1205`) already exists and is the only
structured column available without a migration. It already carries `{ trace: run.trace }`
(`src/app/api/assistant/route.ts:90`).

**The persisted trace is not replay-grade.** `src/lib/assistant/trace.ts:10-27` has no
`tool_use_id` — the pairing key is never captured. Inputs are sanitized/depth-capped, results
truncated to 1000 chars, calls capped at 40.

**Two known gaps in what gets persisted at all:**
- `route.ts:84` only saves an assistant turn `if (run.text.trim())`. A turn that emits **only** a
  proposal card and no text persists **nothing**.
- Windowing's `slice(-40)` (`message-window.ts:36`) and the leading-`shift()` (`:71`) can both land
  between an assistant `tool_use` and the user message carrying its `tool_result`.

**Eval harness.** `test/evals/assistant-must-propose.eval.test.ts:63` builds
`messages` from exactly one user turn. Fixtures stub read tools by name
(`:96-105`). Gated by `ASSISTANT_EVAL=1` + `ANTHROPIC_API_KEY`; nightly-only via
`.github/workflows/assistant-must-propose.yml`, `continue-on-error: true`, never blocks a PR.
The structural half (`:215-254`) runs in normal CI.

### Prior Learnings

- Plan 081 (`docs/plans/2026-07-19-081-fix-assistant-draft-card-guarantee-plan.md`) built the
  over-claim guard, the run-loop injection seam, and the must-propose eval. Its recorded 2/7
  baseline for `wo-rack-assignee-unknown` is very likely this same bug. Its U10 (live browser QA)
  was never run.
- Plan 081 build note §4 already found that a **single-turn** eval scored 0/3 and needed multi-turn
  with stubbed reads. The harness learned to be multi-turn *within* a request but never gained
  prior-conversation history.
- The "Invalid messages" 400 regression (`test/assistant-message-window.test.ts:10-15`, feedback
  `cmrm9s97r0000ju04g6ry4hix`) is the precedent for how this breaks if windowing is careless.
- `docs/architecture/assistant-coverage.md` + tripwire `TRIP-AI-EVAL` (D26/H8) govern eval
  coverage. There is **no** registered invariant for the assistant; guarantees live in tests.
- Repo history has been bitten by duplicate plan numbers ("060" overloaded). 082 is already in use
  by an in-flight session; this plan is 083.

### External Research

Anthropic multi-turn tool use requires that a `tool_use` block in an assistant message be followed
by a user message containing a `tool_result` with the matching `tool_use_id`. An orphan on either
side is a 400. This is the constraint driving Unit 4.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| How to make tool evidence visible | **Structured `tool_use`/`tool_result` block replay, and nothing else** (Unit 1 spike, RESOLVED 2026-07-20) | Prose neutralization (0.88, below threshold); blocks+neutralization (1.00, no better than blocks alone); text markers (0/6, previously disproved) | Measured: A 0/8, **B 1.00**, C 0.88, D 1.00. Blocks alone are sufficient AND leave the stored transcript verbatim, so no prose is rewritten and no conversational context is lost. D buys nothing over B. |
| Where replay fidelity is stored | `AssistantMessage.metadata` JSON | New column; encode into `content` | No migration; `content` carries a generated tsvector, so changing its shape breaks FTS |
| Who assembles replayed history | Server, rebuilt from the DB | Keep trusting the client array | Client currently dictates history; three layers must agree, and a server rebuild collapses that to one. Also closes a trust gap. |
| Text markers in message content | Rejected | — | Measured 0/6, and the model leaked the marker into user-visible output |
| Prompt changes as the fix | Rejected | — | Measured 10/10 both with and without; in-context demonstration beats instruction |
| Over-claim guard behavior | Escalate to a repair turn | Keep the apology text | An apology leaves the user's request unperformed |

## Implementation Units

### Unit 1: Spike — pick the mechanism against the live reproduction — ✅ COMPLETE (2026-07-20)

**RESULT.** `claude-opus-4-8`, real system prompt, 84 tools, no `tool_choice`, n=8 per arm, replaying
the captured `cmrsrs02` transcript:

| Arm | `record_tasting_note` | Read |
|---|---|---|
| A — baseline, today's text-only replay | **0/8 (0.00)** | Bug reproduces. Spike is valid. |
| **B — reconstructed `tool_use`/`tool_result` blocks** | **8/8 (1.00)** | **WINNER** |
| C — assistant card-claiming prose neutralized | 7/8 (0.88) | Below the 0.9 threshold |
| D — blocks + neutralized | 8/8 (1.00) | No better than B |

**Decision: build arm B only.** Blocks alone are sufficient. Neutralization is both insufficient
alone and redundant on top of blocks, and it would rewrite the winemaker's transcript to fix a
replay bug — the wrong layer. Unit 3 therefore adds tool evidence and changes no stored prose.
Harness kept at `test/evals/assistant-history-replay.spike.test.ts` + fixture
`test/evals/fixtures/cmrsrs02-transcript.json`; Unit 2 absorbs both, then the spike file is deleted.

**Goal:** Empirically choose between structured block replay and prose neutralization before
building anything. This unit is a decision gate; it ships no production code.
**Files:** `test/evals/assistant-history-replay.spike.test.ts` (temporary), adapted from the
working harness in the session scratchpad (`replay-harness.test.ts`) — adapt, do not rewrite.
**Approach:** Fix the `cmrsrs02` transcript as a checked-in fixture. Measure four arms at n>=8 on
`claude-opus-4-8`: (a) baseline real history, (b) reconstructed `tool_use`/`tool_result` blocks
with synthesized ids, (c) assistant write-turn prose neutralized/summarized, (d) b+c combined.
Record tool-call rate per arm.
**Tests:** The spike is the test. Its output is a decision record.
**Depends on:** none
**Execution note:** characterization-first — reproduce 0/8 before changing anything, or the arms
mean nothing.
**Patterns to follow:** `test/evals/assistant-must-propose.eval.test.ts:58-108` for the exchange
loop and fixture stubbing.
**Verification:** Baseline arm reproduces at or near 0/8; at least one arm reaches >=0.9. Write the
winning arm and the numbers into this plan's decision table before Unit 3 starts. If no arm
clears 0.9, STOP and escalate rather than proceeding.

### Unit 2: Give the must-propose eval a history axis

**Goal:** Make the harness capable of seeing this class of failure at all, so Units 3-5 have a
scoreboard.
**Files:** `test/evals/assistant-must-propose.golden.ts`,
`test/evals/assistant-must-propose.eval.test.ts`, plus a checked-in transcript fixture directory.
**Approach:** Add an optional `history` field to `MustProposeCase` (a prior-turn transcript, or a
named fixture reference). `runExchange` seeds `messages` with that history before the utterance
instead of always starting cold. Absent `history`, behavior is byte-identical to today. Add the
`cmrsrs02` reproduction as a case, and a write-heavy synthetic history case so coverage does not
depend on one captured transcript. Keep the structural (non-LLM) validity block green.
**Tests:** Extend the existing `MUST_PROPOSE goldens are structurally valid` block to validate the
new field (roles alternate, ends on the utterance, referenced fixtures exist).
**Depends on:** Unit 1 (only for what the history fixture must contain)
**Patterns to follow:** the `fixture` field's existing shape and docs
(`assistant-must-propose.golden.ts:45-57`).
**Verification:** `npm run eval:assistant-must-propose` with the history case present reproduces
the failure pre-fix. A case that cannot fail before the fix is not a test.

### Unit 3: Server-side history reconstruction with tool evidence

**Goal:** The actual fix. The model sees what really happened in prior turns.
**Files:** `src/lib/assistant/history.ts`, `src/lib/assistant/conversations.ts`,
`src/app/api/assistant/route.ts`, `src/lib/assistant/run.ts`, `src/lib/assistant/trace.ts`
(capture `tool_use_id`), `src/app/(app)/assistant/AssistantChat.tsx`,
`src/app/(app)/assistant/voice/useVoiceSession.ts`
**Approach:** Shape is settled by Unit 1: **arm B — add structured `tool_use`/`tool_result` blocks,
change no stored prose.** Persist replay-grade tool evidence in
`AssistantMessage.metadata` (add `tool_use_id` to the trace's tool calls — today it is never
captured). Rebuild the API `messages` array server-side from persisted rows rather than the
client-supplied array; the client keeps sending its history for now, the server stops trusting it.
Close the `route.ts:84` gap so a proposal-only turn is still persisted. Text-only conversations
must produce an identical array to today.
**Tests:** Unit tests for the reconstruction function: text-only in → text-only out unchanged; a
tool turn round-trips to a well-formed `tool_use`/`tool_result` pair; a turn with a proposal and no
text still persists and replays; truncated/legacy rows lacking `tool_use_id` degrade to today's
text-only behavior rather than emitting an orphan block.
**Depends on:** Units 1, 2
**Execution note:** test-first on the reconstruction function; it is pure and easy to pin.
**Patterns to follow:** `run.ts:141` and `run.ts:268` — the in-turn shape is already correct;
mirror it.
**Verification:** `npm run eval:assistant-must-propose` — the `cmrsrs02` history case clears 0.9.
Existing text-only tests unchanged.

### Unit 4: Windowing must never orphan a tool block

**Goal:** Keep the fix from re-introducing the "Invalid messages" 400 that bricked long
conversations once already.
**Files:** `src/lib/assistant/message-window.ts`, `src/app/(app)/assistant/AssistantChat.tsx`
(`clampHistoryForSend` shares the rule)
**Approach:** Teach windowing about paired blocks: accept structured content, and make the
`slice(-40)` boundary and the leading-`shift()` pair-aware so a `tool_use` and its `tool_result`
are kept or dropped together. The existing invariants (starts on user, ends on user, alternates)
must still hold. String truncation must never be applied to structured content.
**Tests:** Extend `test/assistant-message-window.test.ts`: a window boundary landing mid-pair
keeps or drops the pair whole; a leading orphan `tool_result` is dropped; `assertModelReady` still
passes; long structured conversations are windowed, not rejected. Add a property-style case over
many boundary offsets — this is exactly where an off-by-one hides.
**Depends on:** Unit 3
**Verification:** `npx vitest run test/assistant-message-window.test.ts`, plus a long structured
conversation exercised end-to-end without a 400.

### Unit 5: Over-claim guard escalates to a repair turn

**Goal:** When the model claims a card that does not exist, recover the user's intent instead of
only apologizing for it.
**Files:** `src/lib/assistant/overclaim-guard.ts`, `src/lib/assistant/run.ts` (the wiring at ~:301)
**Approach:** On `claimsWriteWithoutCard()` with zero proposals emitted, run one bounded repair
turn instructing the model to actually call the tool, rather than emitting
`OVERCLAIM_CORRECTION` immediately. Strictly capped (one attempt, inside `MAX_TURNS`). If the
repair turn still produces no tool call, fall back to today's correction text — the user is never
worse off than now. The repair instruction must not leak into user-visible output (Ablation B
showed the model will happily echo injected scaffolding).
**Tests:** Extend `test/assistant-run-loop.test.ts` using the existing `createStream` injection
seam: a narrated write triggers exactly one repair turn; a repair that succeeds emits a proposal
and suppresses the correction; a repair that fails emits the correction exactly once; a legitimate
no-write reply never triggers a repair; the repair prompt never appears in emitted text.
**Depends on:** Unit 3
**Patterns to follow:** plan 081 U3's injection seam (`run.ts:50-51, 86-87`).
**Verification:** `npx vitest run test/assistant-run-loop.test.ts`

### Unit 6: Re-measure the plan 081 baselines and correct the record

**Goal:** Find out how much of the previously "fixed" behavior was only ever measured cold.
**Files:** `test/evals/assistant-must-propose.golden.ts` (baseline/note fields),
`docs/plans/2026-07-19-081-fix-assistant-draft-card-guarantee-plan.md` (correction note),
`docs/architecture/assistant-coverage.md` (document the history axis as part of coverage)
**Approach:** Run the full must-propose suite with and without history for every existing case,
including `wo-rack-assignee-unknown` (recorded 2/7) and `wo-vague-target` (the standing
`knownGap`). Correct any `baseline` string that was measured cold. Update the `tasting-note-vessel`
case comment, which currently records this cause as unruled-out — Unit 1 rules it in.
**Depends on:** Units 3, 4, 5
**Verification:** Every non-`knownGap` case clears 0.9 under both cold and history conditions, or
is honestly re-labelled with a reason.

## Test Strategy

**Unit tests:** Pure-function coverage for history reconstruction and windowing, in `test/`,
following the existing `assistant-*.test.ts` style. The run-loop repair path uses plan 081's
`createStream` injection seam — no network.

**Integration / eval:** `npm run eval:assistant-must-propose` is the scoreboard. It is nightly and
`continue-on-error`, so it must not be treated as a merge gate; Units 3-5 each state the rate they
must hit, and those runs happen during the work, not after.

**Manual verification:** In the Demo Winery sandbox (never Bhutan), per the repo's browser-QA rules
in CLAUDE.md: a chat with several write turns, then a tasting note on a multi-lot tank. Confirm a
card appears and the note persists — prove the DB with a short `runAsTenant("org_demo_winery", …)`
read-back, since the browser proves the UI and the script proves the write.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Orphaned `tool_use` → hard 400, long chats brick | MED | HIGH | Unit 4 exists solely for this; property-style boundary tests; precedent already documented in the windowing test header |
| No spike arm clears 0.9 | LOW | HIGH | Unit 1 is a gate. If nothing works, escalate rather than build. Ablation B is the reason this gate exists |
| Replaying tool results inflates context and cost | MED | MED | Reuse the trace's existing truncation caps; measure token delta in Unit 3; consider replaying `tool_use` without full result payloads if the spike shows that suffices |
| FTS regression on conversation search | LOW | MED | Decision: nothing goes in `content`; `search_vector` is generated over it |
| Voice mode diverges from text mode | MED | MED | `useVoiceSession.ts` has its own history array and `MAX_HISTORY`; Unit 3 lists it explicitly |
| Legacy rows lack `tool_use_id` | HIGH | LOW | Degrade to today's text-only replay for those rows; never emit a half-pair |
| Repair turn causes a double write | LOW | HIGH | Repair only fires when zero proposals were emitted; writes still require the user to confirm a card, so no write happens without human approval either way |
| Plan number collision with in-flight 082 | LOW | LOW | Confirmed 082 taken by a concurrent session; this is 083 |

## Success Criteria

- [ ] Unit 1 records measured rates for all four arms and names the winning mechanism
- [ ] The `cmrsrs02` history case reproduces the failure **before** the fix and clears 0.9 after
- [ ] `record_tasting_note` on a multi-lot tank, after several write turns, produces a confirmation
      card and a persisted row in Demo Winery
- [ ] No orphaned `tool_use`/`tool_result` can be produced at any window boundary
- [ ] Text-only conversations produce a byte-identical API messages array to today
- [ ] Over-claim guard performs one repair turn and falls back cleanly when it fails
- [ ] Plan 081 baselines re-measured; any cold-only measurement corrected in the golden file
- [ ] `npx tsc --noEmit` clean; `npx vitest run` green; no regressions in existing tests

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Reproduced 0/8 against the live transcript; two ablations isolate the cause and rule out the obvious fix |
| Scope Boundaries | HIGH | Three adjacent bugs found during investigation are explicitly pushed to follow-ups |
| Implementation Units | HIGH (was MEDIUM) | Unit 1 ran and resolved the open question: arm B at 1.00 against a 0.00 baseline. Unit 3's shape is now fixed, and it is the *less* invasive of the two candidates — no stored prose changes |
| Test Strategy | HIGH | The reproduction harness already exists and is proven to reproduce the failure on demand |
| Risk Assessment | MEDIUM | Two real unknowns: token/context cost of replaying tool results, and whether pair-aware windowing can be made airtight at every boundary. Both are named with mitigations; neither is measured yet |

**What would raise Implementation Units to HIGH:** running Unit 1. It is ~20 minutes of eval time
and it collapses the main open question.

## Follow-ups (not this plan)

- `src/lib/assistant/trace.ts` `MAX_ARRAY = 20` silently truncates `toolNames` in stored feedback
  traces. It misled the PR #391 fix agent into concluding `record_tasting_note` was never offered
  to the model. Either exempt `toolNames` or mark it as truncated.
- Whole-tank tasting notes (fan out like `record_measurement` / plan 060) — logged in `TODOS.md`.
- Consider registering an assistant invariant with a `verify:` guard. Today the
  writes-require-a-card guarantee lives only in tests, with no entry in
  `docs/architecture/invariants/`.

---

## Build result (2026-07-20) — all 6 units complete

| Case | Pre-fix (text-only replay) | Post-fix (production replay) |
|---|---|---|
| `tasting-note-vessel-history` (real cmrsrs02 transcript) | **0/5**, no-tool 5 | 5/5 |
| `brix-write-after-writes` (synthetic, 5 write turns) | 2/5 (40%) | 5/5 |
| `wo-rack-assignee-unknown-history` (plan 081 repro) | 4/5 (80%) | clears 0.9 |

Gates: `tsc` 0, eslint 0, vitest 2775 passed. Six commits.

### Deviations from the plan, and why

**Unit 3 shipped with NO client changes.** The plan listed `AssistantChat.tsx` and
`useVoiceSession.ts`. Rebuilding server-side made both unnecessary: the clients keep posting their
text history and the server ignores it whenever it can rebuild from the DB. Voice and text cannot
drift because neither decides the shape any more. Smaller blast radius, same outcome.

**Unit 4 changed approach.** The plan said to make windowing pair-aware. Windowing the rebuilt
messages is the dangerous version — a `tool_use` and its `tool_result` are adjacent entries, so any
cut or leading shift orphans one half. Cutting at ROW boundaries before the rebuild makes the orphan
case unrepresentable rather than merely guarded.

### Three things that were wrong on the first attempt

1. **The Unit 2 eval had no teeth.** It expanded history into blocks unconditionally, so the new case
   passed 5/5 against a bug that reproduces at 0/8 — the harness contained the fix and was measuring
   it. The same mistake PR #391 made. Fixed by routing the seam through the shipped
   `buildReplayMessages`.
2. **The synthetic history was too shallow.** At two write turns it measured 5/5 pre-fix. Depth is
   load-bearing; five turns is where the pattern dominates.
3. **A history fixture collided with its utterance.** The work-order case pointed at the cmrsrs02
   transcript, which already contains that work order, so the model correctly asked whether to
   duplicate it and scored a failure for behaving well.

### Still open

- **Not browser-verified.** No run against Demo Winery in the pane. The DB-level proof in the plan's
  test strategy has not been done.
- `trace.ts` `MAX_ARRAY = 20` still truncates `toolNames` in stored feedback traces (follow-up).
- PR #391 will conflict trivially in `assistant-must-propose.golden.ts`; keep both the cold
  `tasting-note-vessel` case and the history variant.
