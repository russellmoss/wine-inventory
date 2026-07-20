---
title: Assistant confirmation card — the Draft Card, so a card always appears without fabricating data
type: fix
status: draft
date: 2026-07-19
branch: claude/assistant-draft-card
depth: deep
units: 10
supersedes: plan 080 draft (forced-repair-turn architecture, killed by council review)
council: council-feedback-080-assistant-card.md
---

## Overview

When a user tells the assistant to do something ("issue a work order to Mike to rack all the wine from T3
to T4"), a confirmation card must appear. Today it appears **2 times out of 7** for that exact prompt,
because the card is emitted only if the model *chooses* to call a write tool.

The fix is not to force the model. It is to remove the reason it hesitates. Today a card is binary — either
a perfectly valid, ready-to-execute proposal, or nothing at all. There is no state for *"here is your card,
it is missing two things."* That missing state is the actual bug. This plan adds it: write tools can return
a **Draft** proposal carrying unresolved fields and objections, so the model can always call the tool
honestly, and the card always renders — with Confirm gated until the draft is resolved.

## Problem Frame

**Who has this problem:** Mike Juergens (design partner, Bhutan Wine Co.) has filed it four times —
`cmrmlumxh` (#205), `cmrmlvbb` (#203), `cmrmmbg85` (#206), and today's `cmrs4vasg` (#328). Russell has hit
it twice more via assistant thumbs-down (`cmrekb97r`, `cmqtvea2z`). Always the same wording: *"it says it
issued a confirmation card but it doesn't actually do it."*

**What happens if we do nothing:** this is the trust spine of an AI-native ERP. A cellar hand told a work
order was issued, who finds out on the floor that it wasn't, stops using the assistant for writes. Six
fixes have shipped against this symptom across five layers and it is still open.

**Measured, not assumed.** Reproduced live 2026-07-19 in the in-app browser against Demo Winery, NDJSON
stream tapped so server events could be compared against rendered DOM. Seven fresh chats, same prompt, same
data, same code:

| Trial | `proposal` event | Card rendered |
|-------|------------------|---------------|
| 1 | yes | yes |
| 2 | yes | yes |
| 3–7 | **none** | none |

Representative failing reply: *"that's still on skins, not finished wine. A rack normally moves free-run
wine, not must on skins. Do you want me to proceed with the rack work order anyway?"*

**The model was right.** Council (Gemini) supplied the domain fact the first draft of this plan lacked:
must on skins is a slurry of juice, skins and seeds. You cannot rack it — racking moves clean liquid off
settled solids. A work order to rack T3→T4 either gets laughed at or gets attempted, clogging a
positive-displacement pump and blowing a hose. In two of the five failures the model *also* correctly
flagged that it could not resolve the assignee's email.

So the hesitation is not noise to be suppressed. It is signal arriving through the wrong channel — prose,
which the UI cannot render as a card. The fix is to give that signal a structured channel that still
produces a card.

## Root Cause

**1. There is no Draft state, so the model's only honest options are "perfect card" or "prose."**
`src/lib/assistant/run.ts:136` emits a proposal only when `asProposal` matches, which requires a complete,
signed, ready-to-commit payload. A write tool that lacks a required field cannot produce one, so the model
falls back to prose — which renders as chat text, not a card.

**2. The system prompt contains a genuine self-contradiction.**
- `src/lib/assistant/prompt.ts:40` — *"If you have all the details but have not yet called the tool, CALL THE TOOL now instead of narrating a card"*
- `src/lib/assistant/prompt.ts:45` — *"ask ONE brief clarifying question first"* for atypical crush/press operations

Racking must on skins is exactly "atypical." Both rules fire; the model resolves it per sample. Note the
precondition on rule 40 — *"if you have all the details"* — which was false in several failing trials. The
model was obeying the prompt correctly. This is why prompt-level fixes have not held: the prompt is not
being disobeyed, it is ambiguous.

**3. The over-claim backstop disables itself on incidental words.**
`src/lib/assistant/overclaim-guard.ts:16` returns `false` if `can't|couldn't|didn't|unable|wasn't` appears
**anywhere** in the reply — a whole-text early-out. The assistant routinely says *"I can't verify Mike
Juergens' account from here"*, switching the guard off in the very turn it exists to police. Proven by
running `claimsWriteWithoutCard` on the verbatim transcript: returns `false` while the text says *"I've
proposed the work order — review and confirm the card."*

**4. The eval is structurally blind.**
`test/evals/assistant-tools.eval.test.ts:144` sends `tool_choice: {type:"any"}` — forcing a tool call, then
asserting *which* tool. It can never detect "the model called no tool at all." 99 golden cases, none of
which could have caught a 2/7 emission rate. `ASSISTANT_EVAL` appears in no workflow file.

### Why six prior fixes did not hold

| PR | Layer | Approach | Why it could not fix this |
|----|-------|----------|---------------------------|
| #116 | Prompt | Prose rule forbidding false card claims | Violated 2 days later; stochastic adherence |
| #82 | Client cache | `router.refresh()` after commit | Card did appear and did commit; visibility only |
| #82b | Tool selection | Tool-description steering + golden eval | Still prose, relocated into the schema |
| #216 | DOM delivery | rAF scroll-pin so the card is clickable | Logic correct; only fixes clipping |
| #217 | Runtime backstop | `claimsWriteWithoutCard` + `emittedProposal` | Corrects text after the fact; hole at line 16 |
| #322 | Commit path | `findConflict` + P2002 backstop | Card appeared and was approved; commit-time only |

Repo memory states the meta-pattern: *"the prompt is a mitigation, the guard is the protection."* This plan
is the guard — but it protects by widening the tool contract, not by overriding the model.

## What changed after council review

The first draft of this plan proposed a **forced repair turn**: detect write intent with a regex, and if no
card appeared, re-run the model with `tool_choice: {type:"any"}` over a reduced tool list plus a
`decline_write` escape hatch. Codex and Gemini independently killed it. Recorded here so the reasoning is
not re-litigated:

| Killed | Why |
|--------|-----|
| Forced `tool_choice` repair turn | `any` **mechanically requires** schema-valid JSON. A missing required field (the assignee email) *must* be fabricated. Not a risk — a guarantee. The card then looks authoritative and "nothing commits without a click" is exactly what the change erodes |
| `decline_write` escape hatch | A model inclined to ask a question gets a typed, legal, encouraged way to ask a question. Prose questions become JSON questions; still no card. Would have failed the ≥95% criterion on day one |
| Regex write-intent classifier | In this domain the write verbs *are* the query verbs: *"When did we last **rack** T4?"*, *"Are we ready to **bottle** the 2024 Cab?"* A false positive forces a write proposal the user never asked for |
| Warning as a dismissible banner | Cards that always appear make Confirm a reflex. A physically impossible operation must not be one click from issued |
| Post-repair explanation turn | It is tools-enabled, so it can emit a *second* structured outcome — breaking the "exactly one outcome" invariant it was meant to serve |

## Requirements

- **MUST:** when the user asks for a write, a card renders — Draft or Ready. Never prose that merely
  describes a card.
- **MUST:** no field is ever fabricated to satisfy a schema. Unknown renders as visibly unknown.
- **MUST:** a Draft card cannot be committed. Confirm is disabled until every required field is resolved.
- **MUST:** an operation the tool judges physically invalid renders with Confirm **blocked**, requiring an
  explicit typed override — not a dismissible warning (council C3 + Q2, reversing the earlier Q1 answer).
- **MUST:** the user is never told a card exists when it does not.
- **MUST:** commit-path semantics are unchanged — a Draft never mints a committable token.
- **SHOULD:** the model's objection text renders prominently on the card, not buried.
- **SHOULD:** resolving a Draft in place (typing the missing email) should not require restating the whole request.
- **NICE:** telemetry on draft-vs-ready emission rates.

## Scope Boundaries

**In scope:**
- A Draft proposal state in the tool→stream→client contract
- Draft-capable write tools for the **work-order authoring path first** (see Q4 decision below)
- Prompt reconciliation to remove the rule-40/rule-45 contradiction
- Draft Card UI: unresolved fields as inputs, objections surfaced, Confirm gating + typed override
- Exhaustive event handling in both stream consumers
- The over-claim guard whole-text early-out
- The client NDJSON trailing-buffer drop
- A `MUST_PROPOSE` eval that tracks proposal / draft / decline / wrong-tool rates separately, nightly

**Out of scope:**
- **Converting all 51 write tools at once.** Scoped decision — see Q4 below.
- **Ticket #328 / `cmrs4vasg`** (card appeared, then errored on block delete). Commit-path family, same as
  #322, not root-caused. Separate follow-up.
- Persisting pending proposals across reload / conversation switch (`src/lib/assistant/history.ts:9-10`).
- `maxDuration = 60` hardening (`src/app/api/assistant/route.ts:18`).
- Any change to confirm-route token semantics beyond refusing to mint one for a Draft.

### Q4 decision — scope the tool conversion, and say so

Gemini's Draft Card sketch proposes making arguments optional across all 51 write tools. Codex's counter is
sharper: *"If yes, the regex classifier is too blunt. If no, scope it and stop pretending it is generic."*

**Decision: build the Draft contract generically, convert tools incrementally, starting with the work-order
authoring path.** Rationale: relaxing `required` on 51 tool schemas at once removes the API-level guarantee
that *every* assistant write is well-formed, across the entire surface, in one change — that is an ocean,
not a lake. The reported bug is work-order authoring; that is also the highest-traffic write path. The
Draft infrastructure (Units 4, 7, 8) is generic and pays off immediately; each additional tool family is
then a small, independently verifiable follow-up gated by the eval. Any tool not yet converted keeps
today's exact behavior — no regression, just no Draft support yet.

## Research Summary

### Codebase Patterns

- **Write-tool contract** — `src/lib/assistant/registry.ts:25-33`; 51 `kind:"write"` declarations across 48
  files; `ALL_TOOLS` at `registry.ts:110-189`.
- **Proposals typed, refusals not** — `WriteProposal` at `assistant-events.ts:72`, guard `asProposal` at
  `assistant-events.ts:74-85`. Refusals are thrown `Error`s or bare prose: `propose-work-order.ts:394`,
  `propose-work-order.ts:408`, `file-feedback.ts:66`, `adjust-inventory.ts:62`, `record-measurement.ts:126`.
  "I need one more field" and "this is impossible" are indistinguishable to the loop — **this is the gap
  the Draft state closes.**
- **The client already renders a warnings region** — `WorkOrderProposalDetails` at
  `AssistantChat.tsx:1172-1283`, parsed by `asWorkOrderProposalDetails` at `AssistantChat.tsx:954-960`
  (degrades to `undefined` safely). Reuse, do not invent a second surface.
- **`parseEvent` is permissive** — `assistant-events.ts:54-66` casts any object with a string `type`; both
  clients use non-exhaustive `if/else` (`AssistantChat.tsx:528-549`, `useVoiceSession.ts:263-299`). A new
  event type compiles and silently no-ops. Unit 8 closes this.
- **Assert-or-fail-loudly precedent** — `src/app/api/assistant/resolve-choice/route.ts:36-38` runs a tool
  and asserts `asProposal` is non-null, model bypassed entirely.
- **No injection seam** — `new Anthropic()` inline at `run.ts:69`; `runAssistant` has zero tests.

### Prior Learnings

- `assistant-overclaim-write-guard.md` — *"prefer a deterministic code guard over another prompt tweak."*
- `assistant-disambiguation-picker.md` — *"the eval/golden tests prove tool selection, not that
  resolution/commit works."* Directly predicted the eval blindness found here.
- `assistant-confirm-card-below-fold-fix.md` — #216; live browser QA, not tests, is what has historically
  caught this family.
- `preview-start-uses-session-cwd.md` — the dev server compiles the **session worktree**, not the main
  checkout. Relevant to Unit 10.

### External Research

Anthropic Messages API (verified, platform.claude.com). Retained because it explains why forcing was
rejected, and constrains any future variant:

- `tool_choice:{type:"any"}` is a decode-time **prefill** — a `tool_use` block is mechanically guaranteed,
  which is precisely why required fields get fabricated when unknown.
- A forced turn emits **no user-facing text at all**.
- Forced `tool_choice` + extended/adaptive thinking → **400**.
- A forced turn can never return `end_turn`; leaving `tool_choice` set across turns is an infinite loop.
- Changing `tool_choice` invalidates cached message blocks; system + tools stay cached.
- SDK `@anthropic-ai/sdk@0.105.0` supports `tool_choice` in `stream()` (`messages.d.ts:2134`).

**This plan uses none of it.** No `tool_choice` is set anywhere. Recorded so the option is not
rediscovered and re-adopted without re-reading why it failed review.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Core mechanism | Draft proposal state in the tool contract | Forced `tool_choice` repair turn | Forcing fabricates required fields; Draft renders unknown as unknown |
| Refusal channel | Draft card carrying `missingInfo` / `objections` | `decline_write` tool; prose | A typed decline still yields no card — fails the actual requirement |
| Write-intent detection | **None.** The tool is always callable, so nothing needs classifying | Regex classifier over imperative verbs | Write verbs are query verbs in this domain; false positives propose unrequested writes |
| Physically-invalid op | Card renders, Confirm **blocked**, explicit typed override | Dismissible warning banner | Reverses the earlier Q1 answer on domain evidence: you cannot rack must on skins |
| Prompt contradiction | Resolve it (rule 40 vs 45) | Override it in code | Rule 40's precondition ("if you have all the details") was genuinely false; Draft makes it always true |
| Tool conversion scope | Generic contract, incremental conversion, work-order path first | All 51 tools at once | Relaxing `required` everywhere in one change removes schema validation across the whole surface |
| `details` typing | Real discriminated union; `assistantWarnings` distinct from existing `warnings` | Generic `warnings: string[]` on `WriteProposal` | Council C6: `details` is `unknown` and work-order details already has `warnings` — the generic field collides or no-ops |
| Regression net | Nightly CI, separate proposal/draft/decline/wrong-tool rates | Single `tool_use` boolean; per-PR | Council S4: a bare `tool_use` assertion passes on a wrong tool or a decline |

## Build note (discovered during Unit 4, 2026-07-19) — the Draft Card UI mostly already exists

While wiring the contract it turned out the work-order path **already computes the entire readiness
model** and then throws it away one line before returning:

- `src/lib/work-orders/proposal-readiness.ts:130,212` — `proposal.unresolved: UnresolvedItem[]`
  (`{ key, label, reason }`) and `proposal.warnings` with `severity: "blocking" | "confirmable" |
  "completion_check"`.
- `src/lib/assistant/tools/propose-work-order.ts:406-408` — when `status !== "ready"` it flattens all of
  that into a **prose string** (`"I could not make this work order ready to confirm: …"`) and returns it.
  That prose is the thing the UI cannot render as a card.
- `src/app/(app)/assistant/AssistantChat.tsx:53,1249-1265` — the client **already declares and renders**
  `details.unresolved` as a "Needs input" block, and already groups warnings into "Blocks creation" /
  "Confirm with warning" / "Checked at completion".

So the Draft Card is far less new construction than this plan assumed. The severity vocabulary the plan
invented (`advisory` / `blocking`) should be **dropped in favour of the existing**
`blocking` / `confirmable` / `completion_check`, and Unit 7 shrinks from "build a Draft variant" to
"stop discarding the data, and gate Confirm on it."

Revised effort: **U5 and U7 are substantially smaller; U4 should reuse the existing types rather than
introduce parallel ones.** The council's architecture is unchanged — this makes it cheaper, not different.

## Build note 2 (discovered during Units 5–9, 2026-07-19) — four things this plan got wrong

Recorded rather than worked around silently.

**1. The assignee was never a required arg.** U5 says to "relax genuinely-unknowable required arguments
(assignee) from required to optional." `propose_work_order`'s schema is already `required: ["sourceText"]`
and per-task `required: ["kind"]` — `assigneeEmail` has always been optional. No relaxation was needed or
made. What was missing was not schema permission but a *return shape* for an incomplete call. U5 therefore
reduced to the single line at `:406-408` plus tool-description steering.

**2. The typed override for a `blocking` objection is not implementable as specified, and should not be.**
U7 and the Requirements section call for "Confirm blocked, requiring an explicit typed override." But a
Draft carries no token, so Confirm has nothing to POST. An override could only work by re-driving the tool
to mint a token *past* the blocker — and `gateWorkOrderReadinessForWrite` re-runs readiness at commit and
throws on any blocking warning, so such a token would be refused server-side anyway. Building the override
would mean weakening that gate from the client. **Shipped instead: a blocked Draft cannot be confirmed at
all.** This is strictly stronger than council asked for ("not one click from issued" → "not issuable"), and
it keeps the server gate authoritative. If a genuine override is ever wanted, it belongs in the readiness
engine as an explicit, audited input — not in the card.

**3. "Racking must on skins" is not detected by anything in the codebase.** The plan (and Success Criteria)
assume it renders as a `blocking` warning. It does not: `proposal-readiness.ts` has no rule about lot form
at all — a RACK task validates vessel existence, sameness, volume and headroom, nothing about whether the
source is a MUST. The model's refusal in the live repro came from its own domain knowledge, not from the
engine. The Draft infrastructure will carry such a warning the moment one exists, and U5's test proves the
blocking path end to end using a real rule (`same_vessel`) — but **the must-on-skins rule itself is not
built**, and no unit in this plan assigns it. It is a one-rule addition to `readTask`'s RACK case
(source lot `form === "MUST"` → `blocking`) and should be its own follow-up, because it is a domain
judgment that wants the winemaker's sign-off on the exact severity.

**4. A single-turn eval measures the wrong thing (U9).** The first cut of the MUST_PROPOSE eval sent one
message and classified the response. It scored **0/3** on the seeded repro — not because no card appears,
but because the model's first move is `query_cellar_contents`, exactly as prompt rule 31 instructs. The
eval must run the full multi-turn exchange with stubbed read results, stopping when a write tool is called
or the model ends its turn. Corrected before landing; the fixtures are declared per case.

## Implementation Units

Ordered so the two independently-shippable fixes land first.

### Unit 1: Over-claim guard — scope the disclaimer to the claim sentence

**Goal:** Stop the backstop disabling itself when the reply contains an incidental "can't"/"didn't".
**Files:** `src/lib/assistant/overclaim-guard.ts`, `test/assistant-overclaim-guard.test.ts`
**Approach:** Split the reply into sentences; evaluate claim-vs-disclaimer **per sentence**, so a disclaimer
in one sentence no longer immunizes a false claim in another. Keep the positive patterns (lines 18-23)
unchanged. Header comment stays honest: this is a backstop, not the protection.
**Tests:** Add the verbatim live-repro transcript (currently `false`, must become `true`). All four existing
cases stay green, especially the correct-blocker non-firing case.
**Depends on:** none — **independently shippable, ship first**
**Execution note:** test-first
**Verification:** `npx vitest run test/assistant-overclaim-guard.test.ts`

### Unit 2: Client — stop dropping a trailing partial line

**Goal:** Close a real path where an emitted proposal never renders, and stop silent parse failures.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`, `src/app/(app)/assistant/voice/useVoiceSession.ts`
**Approach:** Both NDJSON read loops (`AssistantChat.tsx:551-562`, `useVoiceSession.ts:292-299`) `break` on
`done` and discard any residual buffer lacking a trailing newline. Flush it through `parseEvent` after the
reader completes. Add a dev-only log when `parseEvent` returns null on a non-empty line —
`AssistantChat.tsx:560` currently drops malformed lines with zero diagnostics.
**Tests:** Extract the line-splitting/flush logic into a pure helper if it comes out cleanly; otherwise
cover at Unit 10. Do not force an artificial extraction.
**Depends on:** none — **independently shippable**
**Note for honesty:** in the 2/7 repro the tapped stream showed the server emitted **no** `proposal` event,
so this was *not* the cause of those failures. Council flagged it as possibly explaining *historical*
reports; that is plausible but unproven. Fixing it is cheap and correct regardless.
**Verification:** `npx vitest run test/assistant-events.test.ts`

### Unit 3: Injection seam + first tests for `runAssistant`

**Goal:** Make the run loop testable at all. Zero tests today because `new Anthropic()` is inline.
**Files:** `src/lib/assistant/run.ts`, `test/assistant-run-loop.test.ts` (new)
**Approach:** Accept an optional client/stream factory on `runAssistant`'s options, defaulting to the
current inline construction so production and the single caller (`route.ts:83`) are untouched. Add a fake
returning scripted `finalMessage()` results so a turn sequence can be driven deterministically. Seam only,
no behavior change.
**Tests:** Characterization — a `tool_use` turn emits `tool` start/end plus a `proposal` when `asProposal`
matches; an `end_turn` turn emits text only. These become the regression net for Units 4-6.
**Depends on:** none
**Execution note:** characterization-first
**Verification:** `npx vitest run test/assistant-run-loop.test.ts`

### Unit 4: The Draft proposal contract

**Goal:** Type the Draft state end to end — the load-bearing unit everything else hangs off.
**Files:** `src/lib/assistant/assistant-events.ts`, `src/lib/assistant/confirm.ts`,
`src/lib/assistant/run.ts`, `test/assistant-events.test.ts`, `test/assistant-confirm.test.ts`
**Approach:** Extend `WriteProposal` with an optional draft descriptor: unresolved required fields (name +
human label + type), model objections, and a blocking severity (`advisory` vs `blocking`). Replace the
generic `details?: unknown` with a real discriminated union so the client can narrow — council C6.
`asProposal` must accept both Ready and Draft shapes, and a new `isDraftProposal` predicate must be the
single place "is this committable" is decided.

**Critical:** a Draft must **never** carry a commit token. `signProposal` (`confirm.ts:33-41`) is only
called for a Ready proposal; a Draft carries no token, so the confirm route cannot be driven even by a
crafted request. This is the security-relevant edge of the whole plan — the invariant is enforced at token
mint time, not in the UI.
**Tests:** `asProposal` accepts Ready and Draft; `isDraftProposal` discriminates; a Draft has no token; the
confirm route rejects any attempt to commit one; existing token sign/verify/expiry tests stay green.
**Depends on:** Unit 3
**Execution note:** test-first
**Patterns to follow:** `asChoice` at `assistant-events.ts:90-116`; `resolve-choice/route.ts:36-38`
**Verification:** `npx vitest run test/assistant-events.test.ts test/assistant-confirm.test.ts`

### Unit 5: Draft-capable work-order authoring

**Goal:** Make the reported bug's actual path emit a Draft instead of falling back to prose.
**Files:** `src/lib/assistant/tools/propose-work-order.ts`,
`src/lib/assistant/tools/create-work-order.ts`, `test/assistant-work-order-draft.test.ts` (new)
**Approach:** Relax genuinely-unknowable arguments (assignee) from required to optional in the tool schema,
and return a Draft naming them as unresolved rather than throwing or returning prose. Convert the existing
prose blockers (`propose-work-order.ts:394`, `:408`) into typed objections on the Draft. Classify severity:
a missing assignee is `advisory` (resolvable on the card); racking a lot still on skins is `blocking`
(requires typed override). Vessel/lot/volume resolution logic is untouched — a genuinely unresolvable
vessel still returns a `choice` picker, which already works.

Do **not** relax fields the tool can always resolve itself. Only fields whose value legitimately depends on
information the model may not have.
**Tests:** missing assignee → Draft with one unresolved field, no token; must-on-skins → Draft with a
`blocking` objection; fully-specified request → Ready proposal with a token, byte-identical to today;
ambiguous vessel → still a `choice`, not a Draft.
**Depends on:** Unit 4
**Execution note:** test-first
**Verification:** `npx vitest run test/assistant-work-order-draft.test.ts`; `npm run verify:work-orders`

### Unit 6: Resolve the prompt contradiction

**Goal:** Remove the ambiguity the model has been correctly obeying, now that Draft makes rule 40's
precondition always satisfiable.
**Files:** `src/lib/assistant/prompt.ts`
**Approach:** Rewrite rules 40 and 45 so they compose instead of compete: always call the write tool when
the user requests an action, even with details missing or the operation questionable; put unknowns and
objections into the tool's Draft fields rather than asking in prose. Keep the existing prohibition on
claiming a card exists. Remove "ask ONE brief clarifying question first" as a *substitute* for calling the
tool — the clarifying question now lives on the card.

This is a mitigation, not the protection (Units 4-5 are), and is deliberately sequenced **after** the
contract exists so the prompt describes real capability rather than aspiration.
**Tests:** none directly (prose). Measured by Unit 9's eval and Unit 10's live trials.
**Depends on:** Units 4, 5
**Verification:** Unit 9 eval pass-rate; Unit 10 live trials

### Unit 7: Draft Card UI

**Goal:** Render the Draft so it is obviously a card, obviously incomplete, and impossible to commit by reflex.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`, `test/assistant-draft-card.test.ts` (new if the
parsing logic extracts cleanly)
**Approach:** Extend `asWorkOrderProposalDetails` (`AssistantChat.tsx:954-960`) for the new union and render
a Draft variant of `ProposalCard` (`AssistantChat.tsx:1127-1170`):
- unresolved fields as labelled inputs **on the card**
- objections surfaced prominently, reusing the existing warnings region in `WorkOrderProposalDetails`
  (`AssistantChat.tsx:1172-1283`) — do not invent a second surface
- **Confirm disabled** while any required field is unresolved
- a `blocking` objection requires an explicit typed override before Confirm enables
- resolving fields in place re-drives the tool id-pinned via the existing `resume`-token path
  (`confirm.ts:49-53`, `resolve-choice/route.ts`) rather than routing back through the model

Styling per DESIGN.md tokens; no hardcoded colors. Keep the rAF scroll-pin from #216 intact — a Draft card
is taller than a Ready one, so re-verify it is not clipped.
**Tests:** parsing/gating logic as a pure helper where it extracts cleanly; visual + interaction proof at Unit 10.
**Depends on:** Units 4, 5
**Patterns to follow:** existing `ProposalCard` / `WorkOrderProposalDetails`; resume-token path
**Verification:** `npx vitest run`; browser proof at Unit 10

### Unit 8: Exhaustive event handling in both stream consumers

**Goal:** Make an unhandled event type a compile error instead of a silent runtime no-op (council S1).
**Files:** `src/lib/assistant/assistant-events.ts`, `src/app/(app)/assistant/AssistantChat.tsx`,
`src/app/(app)/assistant/voice/useVoiceSession.ts`, `test/assistant-events.test.ts`
**Approach:** Convert both consumers' `if/else` chains to exhaustive `switch` with a `never` default, so
adding a variant to `AssistantEvent` fails typecheck until both clients handle it. Tighten `parseEvent`
(`assistant-events.ts:54-66`) to validate the discriminant against known types rather than casting any
object with a string `type`. Define the voice-mode behavior for a Draft explicitly — council design
question 2: the voice client knows how to hold a pending proposal but not an incomplete one. Simplest
correct answer: voice speaks the unresolved fields and defers to the visual card rather than attempting
in-voice field resolution.
**Tests:** `parseEvent` rejects an unknown `type`; a Draft event is handled in both consumers.
**Depends on:** Unit 4
**Verification:** `npx tsc --noEmit`; `npx vitest run test/assistant-events.test.ts`

### Unit 9: `MUST_PROPOSE` eval + nightly schedule

**Goal:** A regression net that can detect this class of bug. The current eval structurally cannot.
**Files:** `test/evals/assistant-write-tools.golden.ts`,
`test/evals/assistant-must-propose.eval.test.ts` (new),
`.github/workflows/assistant-must-propose.yml` (new), `package.json`
**Approach:** New `MUST_PROPOSE` case array of utterances that must yield a card, with the fixture state
each assumes. Call the model with **`tool_choice` omitted** — the inverse of
`assistant-tools.eval.test.ts:144`, and the whole point. Production `claude-opus-4-8`, not the eval's Haiku
default.

Per council S4, do **not** assert a bare `content.some(b => b.type === "tool_use")` — that passes on a wrong
tool. Classify each run into **ready / draft / wrong-tool / no-tool** and assert separately: ready+draft
combined ≥ threshold, wrong-tool ≈ 0. Stochastic, so run each case N times and assert a pass-rate, reporting
the observed rate; vitest has no `repeats` configured, so use an explicit loop. Seed with the exact prompt
from this investigation and its measured **2/7 pre-fix baseline**, so the fix is provably what moved it.
Nightly, gated on the API key, opens a GitHub issue on regression, never auto-merges — matching
`docs/AUTOMATION.md`.
**Tests:** this unit is tests. Verify the non-LLM path stays green without an API key.
**Depends on:** Units 5, 6
**Patterns to follow:** `assistant-tools.eval.test.ts:120-157`; loop conventions in `docs/AUTOMATION.md`
**Verification:** `ASSISTANT_EVAL=1 npm run eval:assistant-must-propose`; confirm skip without the key

### Unit 10: Live browser proof on Demo Winery

**Goal:** Prove it against the real thing. Every prior fix in this family was found or confirmed by live QA.
**Files:** none (verification only); findings appended here
**Approach:** Repeat the experiment that produced the 2/7 baseline — in-app Claude browser, dev server, Demo
Winery, NDJSON tapped, `+ New chat` between trials, same prompt, **N ≥ 10**. Record ready / draft /
wrong-tool / none. Then:
- resolve a Draft in place (type the missing assignee) and confirm it commits
- confirm the must-on-skins case renders `blocking` with Confirm disabled until overridden
- confirm a fully-specified request still produces a Ready card in one shot, unchanged

Dev server runs from **this worktree** (`preview-start-uses-session-cwd`). Demo Winery only, `QA-*`
fixtures, cleaned up after; `verify:naming` green before and after. Note the harness gotcha from the
investigation: `form_input` does not fire React `onChange` on controlled inputs — use the native-setter +
`input` event, and drive long trial loops detached with polling (the JS bridge caps at 30s).
**Depends on:** Units 5, 6, 7
**Verification:** ready+draft ≥ 95% across N ≥ 10 trials (baseline 2/7); one Draft resolved and committed,
proven in the DB via a `runAsTenant("org_demo_winery", …)` read-back script

## Failure-Branch Table

Council S3: enumerate branches first, then require a test per branch. Every row must have a defined
user-visible outcome.

| Branch | Outcome | Covered by |
|--------|---------|-----------|
| Tool returns a complete proposal | Ready card, token minted, Confirm enabled | U4, U5 |
| Tool returns a Draft (missing field) | Draft card, **no token**, Confirm disabled | U4, U5, U7 |
| Tool returns a Draft (`blocking` objection) | Draft card, Confirm blocked pending typed override | U5, U7 |
| Tool returns a `choice` | Picker, unchanged | U3 characterization |
| Tool throws | `error` event surfaced to the user, not swallowed | U8 |
| Model returns prose with no tool call | Over-claim guard fires if it claims a card | U1 |
| Stream truncated mid-line | Residual buffer flushed, event still parsed | U2 |
| Unknown event type on the wire | `parseEvent` rejects; no silent no-op | U8 |
| `MAX_TURNS` reached | Loop terminates, existing behavior | U3 |
| Draft submitted to the confirm route | Rejected — no token was ever minted | U4 |

## Test Strategy

**Unit:** pure helpers in `test/` matching existing `assistant-*.test.ts` style — over-claim guard
(extended), events + confirm (Draft contract), work-order draft, draft-card parsing/gating.

**Integration:** `test/assistant-run-loop.test.ts` — first tests `runAssistant` has ever had, driven
through the Unit 3 fake, covering the branch table without touching the network.

**Eval:** `MUST_PROPOSE`, nightly, real model, unforced, N runs, classified ready/draft/wrong-tool/no-tool.

**Manual:** Unit 10 live browser QA, N ≥ 10, plus a DB read-back proving a resolved Draft committed.

**Security:** the Draft-carries-no-token invariant is asserted at the contract level (U4), not the UI level.

## Risks

Re-prioritised per council S6 — the earlier draft had latency at the top, which was wrong.

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A Draft is somehow committable (token minted for an incomplete payload) | LOW | **HIGH** | Token minted only for Ready; asserted in U4 tests; confirm route rejects tokenless commits. The one genuinely security-relevant edge |
| Relaxing `required` lets a *Ready* proposal ship with a silently-missing field | MED | HIGH | Only genuinely-unknowable fields relax (U5); Ready requires all fields resolved; a fully-specified request must produce a byte-identical proposal to today |
| Users click Confirm reflexively on Drafts | MED | MED | Confirm is *disabled*, not merely warned; `blocking` needs a typed override — the physical gate council demanded |
| Model puts real values in `missingInfo` instead of the real fields (mis-uses the Draft) | MED | MED | Eval classifies wrong-tool/misuse separately (U9); tool validates that a field named unresolved is genuinely absent |
| Draft renders but is clipped below the fold (regression of #216) | MED | MED | Draft cards are taller; re-verify the rAF scroll-pin in U10 |
| Prompt rewrite (U6) regresses unrelated assistant behavior | MED | MED | Sequenced after the contract exists; full golden suite (99 cases) must stay green; nightly eval watches |
| Voice mode has no coherent Draft behavior | MED | LOW | Explicitly defined in U8: speak the gaps, defer to the visual card |
| Incremental conversion leaves most write tools without Draft support | HIGH | LOW | Accepted and stated (Q4). Unconverted tools keep today's behavior exactly — no regression |
| Nightly eval flaky | MED | LOW | Pass-rate threshold over N runs; opens an issue, never blocks a merge |

## Success Criteria

- [ ] The reproduced prompt yields a card (Ready or Draft) in ≥ 95% of ≥ 10 fresh-chat trials — baseline 2/7
- [ ] No field is ever fabricated: a missing assignee renders as an empty labelled input, never a guess
- [ ] A Draft cannot be committed — no token is minted, and the confirm route rejects the attempt
- [ ] Racking must on skins renders a `blocking` objection with Confirm disabled until explicitly overridden
- [ ] A Draft can be resolved in place and committed, with the write proven in the DB by a tenant read-back
- [ ] A fully-specified request still produces a Ready card in one shot, unchanged from today
- [ ] `claimsWriteWithoutCard` returns `true` on the verbatim live-repro transcript
- [ ] `runAssistant` has integration tests covering every row of the failure-branch table
- [ ] `MUST_PROPOSE` eval exists, runs nightly, classifies ready/draft/wrong-tool/no-tool separately
- [ ] Adding an `AssistantEvent` variant fails typecheck until both clients handle it
- [ ] All gates green: `tsc`, `eslint`, full `vitest`, `verify:ai-native`, `verify:naming`,
      `verify:work-orders`, `next build`
- [ ] No regressions in the 99 existing golden cases or the D26 coverage guard

## Measured result (Units 4–9 landed, 2026-07-19)

`ASSISTANT_EVAL=1 ASSISTANT_EVAL_RUNS=3`, production `claude-opus-4-8`, real system prompt, `tool_choice`
omitted, multi-turn with declared fixtures:

| Case | Card rate | Notes |
|------|-----------|-------|
| **wo-rack-assignee-unknown** (the repro) | **3/3 (100%)** | baseline **2/7 (29%)**; 0 fabricated emails |
| wo-rack-fully-specified | 3/3 (100%) | control — unchanged one-shot Ready |
| wo-crush-atypical | 3/3 (100%) | the old rule-45 "ask first" case |
| wo-vague-target | 0/3 | **known gap**, see Build note 2 §4 / follow-up below |
| brix-write | 3/3 (100%) | a different write family |
| read-when-racked (control) | 0 write calls | no false positive |
| read-ready-to-bottle (control) | 0 write calls | no false positive |

Wrong-tool: 0 across every case. Fabricated unknowable fields: 0.

### Follow-ups this work identified

1. **Canonicalizer-stage throws are still prose.** `canonicalizeRawIntents` throws (e.g. "A topping task
   needs both a source and a destination vessel") *before* a proposal object exists, so those cannot become
   Drafts yet. This is the sole cause of the `wo-vague-target` gap. Converting them is the next increment.
2. **The must-on-skins readiness rule** (Build note 2 §3) — not built, wants winemaker sign-off on severity.
3. **In-place Draft resolution** — U7's "type the missing email on the card and re-drive id-pinned via the
   resume-token path" was deferred. Today the user answers in chat and the tool re-runs. The resume-token
   machinery exists (`confirm.ts:49-53`, `resolve-choice/route.ts`) and now carries a `draft` flag, so this
   is a UI-plus-route increment, not new architecture.
4. **Unit 10 (live browser QA) not run** — needs the interactive logged-in browser pane.

## Confidence

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Reproduced live, 2/7 measured; all three defects verified against the working tree |
| Root Cause | HIGH | Confirmed by direct execution. Council added the domain fact that reframed the model's refusal as correct |
| Scope Boundaries | HIGH | Q4 scoping decision made explicitly and justified |
| Implementation Units | MEDIUM-HIGH | U4 (contract) and U5 (relaxing `required`) are the risk — a mis-scoped relaxation could let an incomplete Ready proposal through. No undocumented API behavior is relied on any more, which is what made the previous draft MEDIUM |
| Test Strategy | HIGH | Branch table drives coverage; U3 seam unblocks loop tests; U9 closes the eval blindness |
| Risk Assessment | MEDIUM-HIGH | Re-prioritised per council. Residual unknown is how well the model actually uses Draft fields — measurable at U9 before shipping |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/council` | Independent 2nd opinion | 1 | **APPLIED** | 5 CRITICAL, 5 SHOULD FIX, 3 design questions — core mechanism rejected; plan rewritten |
| Gemini Review | `/council` | Product logic & domain | 1 | **APPLIED** | 4 CRITICAL, 3 SHOULD FIX — supplied the domain fact (must on skins is unrackable) that reversed the Q1 answer |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** COUNCIL APPLIED — architecture replaced (forced repair turn → Draft Card). Units 1 and 2 are
independently shippable and gate nothing. Full council record in `council-feedback-080-assistant-card.md`.

---

## Correction (plan 083, 2026-07-20): the measured result overstated the fix

This plan recorded the seeded repro going 2/7 → 3/3 and treated the card-emission bug as closed. Both
numbers are real. The conclusion was too strong, because **every run of the U9 eval started cold** —
one synthetic user message, no prior conversation.

Plan 083 found a second, independent cause of the same symptom: history was replayed as TEXT ONLY
(`history.ts` kept only string content), so prior `tool_use` / `tool_result` blocks were dropped and
the model saw its own turns claiming cards with no tool call attached. It completed that pattern.

Re-measuring this plan's own repro with conversation in front of it: **4/5**, below the 0.9 threshold
the cold case clears at 3/3. A different utterance (`record_tasting_note` on a vessel) measures 10/10
cold and **0/8** with real history — the same mechanism, more starkly.

So the 2/7 live baseline recorded here was probably this bug, not only the readiness/prompt issues U4-U6
addressed. Those fixes are still correct and still needed; they were simply measured in the one
condition that cannot exhibit the failure.

Fixed in plan 083 (`src/lib/assistant/replay.ts`). The eval gained a history axis so this cannot recur
silently. See `docs/architecture/assistant-coverage.md`.
