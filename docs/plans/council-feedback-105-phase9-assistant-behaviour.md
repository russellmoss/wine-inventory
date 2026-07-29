# Council Feedback — Plan 105, Cellarhand v2 Phase 9 (assistant behaviour)

**Date**: 2026-07-29
**Plan**: `docs/plans/2026-07-29-105-feat-cellarhand-v2-phase9-assistant-behaviour-plan.md`
**Reviewers**: Codex `gpt-5.4` (correctness, types, contracts) · Gemini `gemini-3.1-pro-preview` (product logic, UX)

> Filed in `docs/plans/` to match the repo's existing `council-feedback-0NN-*.md` convention, not in the
> project root as the generic skill template says.

**Verdict: the plan survives, the PR split does not.** Both reviewers independently landed on the same three
soft spots — the post-commit navigation, the unwired provenance panel, and the object-context trust story.
Codex additionally found four concrete failure sequences the plan did not name, one of which (the stranded
draft) is caused by the plan's own link-only downgrade rule.

---

## Critical Issues

### C1. Deleting the auto-issue defers issue-time failures, and the nonce is already burned
*(Codex — CRITICAL. Not named in the plan.)*

`issueWorkOrderAction` at `propose-work-order.ts:544` is not a status flip. It is where **reservation
conflicts and readiness gates surface**. Delete it with no compensating preflight and the failure mode
changes from *"confirm failed, try again"* to *"success receipt now, issue failure ten minutes later."*
Worse: `commitProposal` (`commit.ts:201-203`) burns the single-use nonce **before** committing, so the user
cannot retry the same approval path after the deferred failure.

**Fix:** extract or reuse a **non-mutating issue validator** and run it before the commit returns, so
blockers are surfaced on the card rather than discovered at manual Issue time. Test `DRAFT` status *and*
the absence of issue side effects.

### C2. In-flight signed proposal tokens carry stale semantics across the deploy
*(Codex — CRITICAL. Not named in the plan.)*

A card minted **before** this deploy says "issue"; confirmed **after** it, it only drafts. The 5-minute
token TTL bounds but does not eliminate the window. Nothing in `commit.ts` protects against that semantic
drift — the committer map just routes to whatever the current implementation is.

**Fix:** audit the token payload. If it does not version the expected postcondition, either invalidate
outstanding `propose_work_order` confirmations at deploy or reject tokens minted under the old contract.
Note `propose-work-order.ts:513-517` already hard-rejects a stale `schemaVersion` — that mechanism exists
and should be reused.

### C3. The link-only downgrade can strand the created draft
*(Codex — CRITICAL. This one is caused by the plan's own rule.)*

Sequence: confirm succeeds → nav downgrades to link-only (unsaved work) → the user refreshes or leaves →
the link lived only in client state (`AssistantChat.tsx:850-854`) and persisted history is text-only
(`history.ts:12-27`) → the path is gone → a second confirm returns *"This change was already confirmed."*
**A real work order now exists that the user cannot find from the conversation.**

**Fix:** make the target durable on the link-only path — persist the receipt, or embed the path in the
plain-text message body that history *does* keep.

### C4. Unit 4 guards the destination and ignores the source surface
*(Codex — CRITICAL. The plan's rule is half a rule.)*

The plan forbids navigating **to** `/assistant*`. The real kill is navigating **from** it: the full
`/assistant` page does not survive client navigation, so a post-confirm nav there ends the session — and
AC-W2 requires the conversation to continue.

**Fix:** `post-commit-nav` must take the current pathname and force link-only when the **source** is
`/assistant*`, in both the chat and the voice consumer.

### C5. "Server re-resolves tenant-scoped" is not sufficient on its own
*(Codex — CRITICAL. Sharper than the plan's version.)*

The concrete leak is **cache poisoning, not RLS failure**: tenant A primes a cache entry for object `id=X`;
tenant B hits the same resolver and reads A's already-materialised title/status, even though Postgres RLS
is doing its job. This is the repo's own K12 invariant (never read the ALS tenant inside a cached fn).

**Fix:** a narrow parser for a whitelisted `ObjectContextHint`; resolve in a **non-cached** function with
explicit `(tenantId, entityType, entityId)` arguments; and **XML-escape the resolved values** before
appending them near `run.ts:132` — the plan never mentioned escaping, and the injection point is a prompt.

### C6. The "not shown" rule, as written, mutes real answers
*(Gemini — CRITICAL. This is a spec-reading error in the plan, not just a scope question.)*

The plan gates **the statement** on `hasProvenance()`. With no producer wired, the predicate is always
false. A winemaker asks a real question, the assistant computes a correct answer, and the UI silently
swallows it. The user sees a broken assistant.

**Fix (Gemini's, and it is right):** the rule gates **the provenance panel**, not the assistant's answer.
`05-design-system-v2.md:445` says *"If provenance cannot be produced, the statement is not shown"* — but a
statement *making a provenance claim* is not the same as every assistant reply. Narrow the rule to
provenance-bearing statements, or the phase ships a mute button.

### C7. Explicit "issue it" should still issue
*(Gemini — CRITICAL. A middle ground the owner did not see before deciding.)*

Removing auto-issue for a vague request ("rack T3") is right. Refusing when the user **explicitly commands**
it ("issue a work order to Mike to rack T3 to T4") is a regression. A manager dictating five explicit tasks
on a Friday afternoon now confirms, waits, lands, and clicks Issue — five times.

**Gemini's fix:** when the utterance carries an explicit issue intent, the card's primary action becomes
**"Review & issue"** instead of "Review & create". The spec's rule — no write without a human press — is
still honoured; the press just does more. There is precedent: `tools/navigate.ts:28` already reads explicit
intent off the user's actual last message (`EXPLICIT_NAV`) rather than trusting the model.

**This reopens Owner decision 1.** It was decided without this option on the table.

---

## Design Questions

1. **Does explicit "issue it" still issue?** (C7.) Reopens the decision already made. Three readings:
   remove auto-issue entirely (spec-literal, decided); honour an explicit issue verb via a "Review & issue"
   variant (Gemini); or remove it now and add the variant as a follow-up once the draft flow is proven.

2. **The 3-second countdown — the reviewers disagree, so this is no longer low-stakes.**
   *Gemini:* scrap it. Auto-navigation belongs in linear wizards, not a persistent chat dock. It destroys
   batch workflows (queue three work orders, get yanked after the first) and a timed background navigation
   while focus sits in a dock is hostile to screen-reader users. Ship the receipt link and let the user go.
   *Codex:* reusing the countdown is fine; the missing requirements are source-surface suppression (C4) and
   a durable fallback (C3), not a different timer.
   **Note:** AC-W2 and `03-interaction-spec.md:177` both require landing on the draft, so "never navigate"
   contradicts the spec. The live options are: navigate immediately, navigate after the countdown, or
   navigate only on an explicit user action.

3. **Ship B33 with no producer?** *Codex: hold it.* An invisible component with a null-return contract adds
   prop surface, caller-gating rules and source-contract churn for zero user value; land it in the same PR
   as the first real evidence producer. *Gemini:* ship it, but fix the rule first (C6). Both agree the
   current framing is wrong.

4. **Draft graveyard.** *(Gemini.)* Removing auto-issue creates abandoned `DRAFT` work orders that managers
   confirmed and forgot to issue. Is there a stale-draft policy, or do they clutter the queue?

5. **Button copy.** *(Gemini.)* "Review & create" describes a review; the press creates a server-side
   record. Gemini wants **"Save as Draft"**. But "Review & create" is the handoff's own approved copy
   (`05-design-system-v2.md:438`). **Spec-vs-clarity tension — an owner call, not an implementer's.**

6. **Should confirm surface issue blockers immediately, or defer them to manual Issue?** *(Codex.)* The
   plan chooses "defer" by deletion, silently. Whichever way it goes, say it plainly in the PR and in the
   user-facing receipt.

7. **Cross-tenant id in a pasted URL** — does U5 fail gracefully or 500 the dock for the session? *(Gemini.)*

---

## Suggested Improvements

**S1. The PR split is wrong — both on ordering and on content.** *(Codex.)* The bug fix is the domain change
(U3), not the refactor. Do not front-run a high-risk correctness fix with a refactor plus an unwired
component. Revised split:

| PR | Content | Was |
|---|---|---|
| **B1** | Stop auto-issue + the non-mutating preflight (C1) + token-semantics guard (C2) + a real integration test | inside old PR B |
| **B2** | Post-commit navigation, with source-surface suppression (C4) and a durable link-only fallback (C3) | inside old PR B |
| **A** | `AIProposalCard` extraction — moved **behind** B1, and no longer billed as zero-risk | was first |
| **C** | Object context, with the narrow parser + non-cached resolver + XML escaping (C5) | unchanged |
| **D** | Degraded state (server-owned gate, S4) + acceptance criteria | unchanged |
| **—** | `ProvenancePanel` — **cut from Phase 9** unless C6 is resolved and a producer lands with it | was in PR A |

**S2. PR A is not zero-behaviour-change, and the plan should stop saying it is.** *(Codex.)* Swapping native
`<details>/<summary>` for `Collapsible` changes DOM semantics; hiding unresolved actions changes what
renders. In a repo whose component tests are source-contract assertions over `.tsx` text, an extraction
alone moves the goalposts. Either make it a literal extraction with identical DOM, or drop the "zero
behaviour change" claim.

**S3. `asProposal` is an unnamed construction site.** *(Codex.)* `assistant-events.ts:165-178` rebuilds the
proposal object to strip tokens off drafts. Any proposal-side metadata a later producer adds gets silently
stripped there. Naming the two stream consumers is not enough.

**S4. Unit 6 cannot be dock-only copy.** *(Codex.)* If assistant availability is degraded, the **same
server-owned check** must gate `/api/assistant`, or the dock says "unavailable" while the route still
attempts a stream and fails later. One source of truth, not a client fork.

**S5. `page.tsx` cannot call a client context setter.** *(Codex — implementation-blocking.)* Unit 5's "a page
publishes through a hook" does not work on App Router server pages. Needs a small client bridge component
the server page renders. And the context must be **cleared on pathname change**, or the persistent dock
keeps injecting the previous record after the user navigates away.

**S6. The exhaustive `switch` guard does not protect this change set.** *(Codex.)* Units 3–5 change confirm
JSON and request-body shape, not the NDJSON union — the `never` default never fires. Add typed
request/response parsers for `/api/assistant` and `/api/assistant/confirm` and audit `CommitResult.navigate`
consumers directly.

**S7. The validation plan does not cover the regression.** *(Codex.)* The plan noted that nothing in `test/`
or `scripts/` references `commitProposeWorkOrder` or "Issued work order" — that is the *absence* of
coverage, not evidence of safety, and the listed `verify:work-orders*` scripts do not fill the gap. Add a
targeted integration test around the committer or `/api/assistant/confirm` asserting: status is `DRAFT`,
`navigate` is returned, no issue emission occurs, and a second confirm hits the P2002 "already confirmed"
path.

**S8. The unified card must not drop the voice confirm path.** *(Gemini.)* Chat assumes a mouse; voice
assumes gloves. A cellar hand must be able to say "confirm it" from three feet away rather than removing a
glove to tap. The extraction must carry the voice-confirm intent explicitly.

**S9. Trim the conflict list.** *(Codex.)* Keep 1, 3, 5, 8 as implementation-blocking. Conflict 9 is not a
conflict — a provider above the dock is fully compatible with "do not edit `AssistantDock.tsx`". Conflicts
2, 4, 6, 7, 10 are documentation drift worth recording but not blockers. Conflict 11 is a separate
`navigate`-tool/IA problem, unrelated to commit-result navigation. *(Partially disputed: conflict 4 — three
of four items having no acceptance criterion — is a shipping-quality blocker in this repo even if it is not
a code blocker.)*

---

## What the reviewers agreed on, independently

Three findings arrived from both directions, which is the strongest signal in the pass:

1. The post-commit navigation is under-specified and possibly wrong (C3, C4, DQ2).
2. `ProvenancePanel` should not ship as currently framed (C6, DQ3).
3. The object-context trust story needs more than "the server re-resolves it" (C5, DQ7).

## What survived unchallenged

- Removing the auto-issue **as a direction** — neither reviewer defended today's behaviour.
- Deferring the ranked-queue copy (Owner decision 2). Gemini: *"the correct product call. Moving on."*
- Zero new tools; zero schema change; leaving `AssistantDock.tsx` untouched.
- The non-admin QA pass, and treating the `SECTION_ROUTES` role-gating gap as its own ticket.

---
## Raw Response — Codex (`gpt-5.4`)

**CRITICAL**
- Auto-issue removal is the right direction, but the plan treats `issueWorkOrderAction` in
  `commitProposeWorkOrder` (`propose-work-order.ts:544`) as a pure status flip. That is not safe. This is
  also where issue-time reservation conflicts, readiness gates, and assignee-side effects can surface. If
  you delete it with no compensating preflight, the failure mode changes from "confirm failed" to "success
  receipt now, issue failure later." Because `commitProposal` (`commit.ts:14`) burns the nonce before
  commit, the user cannot retry the same approval path after the later failure. Fix: extract or reuse a
  non-mutating issue validator before PR B1, and explicitly test `DRAFT` status plus absence of issue side
  effects.
- The plan missed compatibility for in-flight signed proposal cards. A stale card emitted before this deploy
  can still be confirmed after this deploy. If the token payload does not encode the expected postcondition,
  the user can approve a card that said "issue" and get only a draft. Nothing in `commit.ts` protects
  against that semantic drift; the committer map only routes to the current implementation. Fix: audit the
  token payload now. If it does not version the expected outcome, invalidate outstanding
  `propose_work_order` confirmations or reject old versions.
- "Downgrade to link-only on unsaved work" is incomplete and can strand the created draft. The confirm nonce
  is single-use in `commit.ts`, the confirm handlers only keep the link in client state in
  `AssistantChat.tsx:843` and `useVoiceSession.ts:306`, and persisted history is text-only in
  `history.ts:12`. Sequence: confirm succeeds, nav downgrades to link-only, user refreshes or leaves, link
  metadata is gone, second confirm returns "already confirmed." Fix: make the target durable on the
  link-only path: persist the receipt, embed the path in plain text, or hold the refresh until the user
  acts.
- Unit 4 protects the target route, not the source surface. That is the wrong rule. Starting from the full
  `/assistant` page, auto-nav to the new work order kills the session because the dock is absent there and
  the full page does not survive navigation; `AssistantDock.tsx:226` returning `null` on `/assistant*` is
  only half the story. AC-W2 says the conversation continues. Fix: `post-commit-nav` must take the current
  pathname/surface and force link-only when the source is `/assistant*`, in both chat and voice.
- The validation plan does not cover the actual regression. You have verified there is no test or script
  that references `commitProposeWorkOrder` or even the "Issued work order" string. The listed
  `verify:work-orders*` scripts are not evidence. Fix: add a targeted integration test around
  `/api/assistant/confirm` or the committer that asserts `status === DRAFT`, `navigate` is returned, no
  issue emission occurs, and a second confirm hits the P2002 "already confirmed" path.
- Unit 5's security claim is too weak. "Client context is a hint; server re-resolves tenant-scoped" is not
  enough if the resolver reads ALS tenant inside a cached function, which this repo explicitly forbids.
  Concrete leak: tenant A primes a cache entry for object `id=X`; tenant B hits the same resolver and gets
  A's already-materialized title/status even though Postgres RLS is correct. The route parser in
  `/api/assistant/route.ts:38` also currently trusts inline `unknown` casts. Fix: add a narrow parser for a
  whitelisted `ObjectContextHint`, resolve with explicit `(tenantId, entityType, entityId)` args in a
  non-cached function, and XML-escape the injected values before appending them near `run.ts:132`.

**SHOULD FIX**
- The plan leans on the exhaustive `AssistantEvent` switches as if they protect this change set. They do
  not. Units 3, 4, and 5 change confirm JSON and request-body shape, not the NDJSON union in
  `assistant-events.ts:8`. The `never` default will not fire. Fix: add typed request/response parsers for
  `/api/assistant` and `/api/assistant/confirm`, and audit every `CommitResult.navigate` consumer directly.
- The plan missed `asProposal` (`assistant-events.ts:165`) as a construction site. If B33 or any later
  producer adds proposal-side metadata, `asProposal` will strip it unless you update that sanitizer too.
  Naming the two stream consumers is not enough.
- PR A is not zero-behavior. Replacing native `<details>/<summary>` with `Collapsible`, hiding unresolved
  actions, and moving the duplicated markup into a new component all change behavior or at least test
  surface. In this repo, component tests are source-contract assertions over `.tsx` text; extraction alone
  will move those goalposts. Fix: either make A a literal extraction with identical DOM semantics, or stop
  calling it low-risk/no-behavior-change.
- Unit 5's "a page publishes through a hook" is not implementable as written on App Router pages. Server
  `page.tsx` files cannot call a client context setter. Fix: introduce a tiny client bridge component that
  the server page renders, and clear stale object context on pathname change so the persistent dock does not
  keep injecting the previous record after navigation.
- The PR order is wrong. The bug fix is the domain change in Unit 3, not the component extraction. Do not
  front-run a high-risk correctness fix with a refactor and an unwired provenance component. Split B into
  `B1 = stop auto-issue + tests` and `B2 = post-commit navigation`; move A behind B1 or cut it entirely.
- Unit 6 cannot be dock-only copy. If assistant availability is degraded, the same reason needs to gate the
  server entry path too, or the dock says "AI unavailable" while `/api/assistant` still attempts a stream
  and fails later. Reuse one server-owned capability check; do not fork client and server truth.
- The conflict list is noisy. Keep 1, 3, 5, and 8. Conflict 9 is not a conflict; a provider above the dock
  is compatible with "do not edit `AssistantDock.tsx`." Conflicts 2, 4, 6, 7, and 10 are documentation
  drift, not implementation blockers. Conflict 11 is a separate `navigate`-tool/IA problem and is not part
  of commit-result navigation.

**DESIGN QUESTIONS**
- B33 should not ship without a producer. Hold it. An invisible component with a null-return contract adds
  prop surface, caller-gating rules, and source-contract churn with zero user value. Land `ProvenancePanel`
  only in the same PR as the first real evidence producer.
- Decide explicitly whether assistant confirm should surface issue blockers immediately or intentionally
  defer them to manual issue. The current plan silently chooses defer by deleting auto-issue. If that is the
  product decision, say it plainly in PR B1 and in the user-facing receipt. If it is not, extract a
  read-only validator from the issue path before changing behavior.
- Reusing the existing 3-second cancellable countdown is fine. The missing requirement is not a different
  countdown; it is source-surface suppression and a durable fallback on the link-only path.

---
## Raw Response — Gemini (`gemini-3.1-pro-preview`)

**CRITICAL**

**1. The "Not-Shown" Provenance Rule (U2) will mute the assistant completely.**
You plan to ship the B33 provenance component without a producer, while enforcing the rule: *"if provenance
cannot be produced, the statement is not shown."*
*The failure sequence:* A winemaker asks, "What were the fill volumes for WO #171?" The assistant generates
the correct answer, but because the provenance producer isn't wired yet, the predicate returns false. The UI
silently swallows the answer. The user sees a broken, unresponsive assistant.
*The fix:* Change the rule to "the *provenance panel* is not shown." Do not gate the AI's actual statement
on a half-built trust affordance.

**2. Capability removal on explicit "Issue" intents ignores the manager's core workflow.**
Removing auto-issue for vague requests ("rack T3") is correct. Refusing to auto-issue when the user
explicitly commands it ("issue a work order to Mike to rack T3 to T4") is a massive regression.
*The failure sequence:* A manager on a Friday afternoon dictates five explicit tasks to the assistant.
Instead of executing, the assistant generates five drafts. The manager must now click confirm, wait for
navigation, land on the draft, and click "Issue" five separate times. You have turned an automated assistant
into a slow form-filler.
*The fix:* If the utterance contains an explicit "issue" intent, the AI proposal card should change its
state and button from "Review & create [Draft]" to "Review & issue". The spec's rule against writing to the
ledger without a human press is still honored by the confirm button — you just bypass the intermediate Draft
state when explicitly asked to.

**3. The 3-second auto-navigate (U4) punishes batch workflows and violates accessibility.**
*The failure sequence:* A manager is looking at the vessel register and asks the assistant to queue up three
topping work orders. They confirm the first one. Three seconds later, they are violently yanked away from
the register and dumped onto the new Draft page. Their batch workflow is destroyed. For screen-reader users,
a timed, cancellable background navigation while focus is in a chat dock is deeply disorienting.
*The fix:* Scrap the countdown. Auto-navigation belongs in linear wizards, not persistent chat docks. Output
the receipt with a clear *"View Work Order #123 →"* link and let the user navigate when they are ready.

**SHOULD FIX**

**1. Unifying voice and chat cards (U1) ignores the cellar hand's physical constraints.**
You are collapsing the inline voice card and the chat card into one component. Chat assumes a mouse. Voice
assumes wet hands and gloves.
*The failure sequence:* A cellar hand on the floor uses voice to pull up a draft. The new unified card
renders a visual "Confirm" button but drops the hidden voice-command hook that allows the user to shout
"Confirm it" from three feet away. The cellar hand has to take off their gloves to tap the screen.
*The fix:* The extracted `AIProposalCard` must explicitly support and document a `onVoiceConfirm` prop or
intent-listener, ensuring voice-mode users never have to touch the screen to advance the state.

**2. Blurring "Confirming" and "Drafting".**
The plan states the draft card copy reads *"Draft — nothing created yet"*, but pressing the button creates
the record server-side.
*The failure sequence:* The user clicks "Review & create". The record is instantly created server-side as a
Draft, but the visual feedback (especially if navigation is cancelled or drops to a link) makes it feel like
it's still just an AI proposal.
*The fix:* The button on the proposal card should say "Save as Draft", not "Review & create". Align the
button copy exactly with the ledger state it produces.

*(Note: Deferring the ranked-queue copy in U6 because the /now route doesn't exist is the correct product
call. Moving on.)*

**DESIGN QUESTIONS**

- **Page context (U5) cross-tenant leakage:** The plan mentions resolving the page entity server-side to
  append to the system prompt. If a user pastes a URL containing an ID belonging to a different tenant, does
  U5 fail gracefully, or does it throw a hard 500 that crashes the assistant dock for that session?
- **Draft abandonment:** If we remove auto-issue, we are going to create a graveyard of abandoned DRAFT work
  orders that managers confirmed but forgot to issue. Does the system have a garbage collection policy for
  stale drafts, or will they clutter the cellar hand's filtering views?
- **Navigation countdown cancellation:** If you ignore my advice and keep the 3-second countdown, how
  exactly does a user cancel it if their hands are off the mouse? Is there a keyboard shortcut, or are you
  forcing them to scramble for the cursor?
