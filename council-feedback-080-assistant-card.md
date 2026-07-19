# Council Feedback — Plan 080: Assistant confirmation card guarantee

**Date**: 2026-07-19
**Plan**: `docs/plans/2026-07-19-080-fix-assistant-confirmation-card-guarantee-plan.md`
**Reviewers**: Codex `gpt-5.4` (control flow + types + API contract), Gemini `gemini-3.1-pro-preview` (domain correctness + UX + data quality)

Both reviewers were given the plan in full, the relevant source (`run.ts` loop, `assistant-events.ts`,
`overclaim-guard.ts`), the Anthropic API constraints, and the author's own two stated concerns.

**VERDICT: the plan's core mechanism is wrong.** Both reviewers independently confirmed both author
concerns as real and load-bearing, and both independently arrived at the *same* alternative architecture.
This is not a polish pass — Units 1, 3, 4 and 5 need to be replaced, not amended.

## Critical Issues

**C1 — Forcing a tool call mechanically guarantees hallucinated arguments (both).**
This is the strongest finding, and it upgrades the author's concern (a) from a risk to a certainty.
Gemini's framing: `tool_choice: {type:"any"}` requires the model to emit JSON conforming to the tool's
schema. If a *required* field is unknown — and in the live repro the model explicitly said it did not know
the assignee's email — the model has no legal way to omit it. It must invent one. Codex: *"Never let the
model invent identifiers to satisfy a forced call."* The card then appears looking authoritative, and the
plan's only protection ("nothing commits without a click") is precisely what the change erodes.
Realistic bad outcomes span assignee, volume ("rack ALL the wine" — 4,200 L exactly? lees? headspace?),
vessel identity, lot identity, and dates.

**C2 — `decline_write` swallows the fix (both).**
Author concern (b), confirmed emphatically. A model already inclined to ask a question is handed a typed,
legal, *encouraged* way to ask a question. Gemini: *"Your >=95% emission metric will immediately fail
because the model will (correctly) use `decline_write` for missing arguments."* Codex: *"do not add a
generic repair-layer decline unless you are willing to count repair declines as failures for this bug."*
The plan would convert prose questions into structured questions while the user's actual complaint —
no card — remains unchanged.

**C3 — The domain objection is not a "soft" objection; the plan misclassifies it (Gemini).**
Must on skins is a slurry of juice, skins and seeds. You cannot rack it — racking moves clean liquid off
settled solids. A work order to rack T3→T4 gets laughed at, or gets attempted and clogs a positive-
displacement pump and blows a hose. The model's refusal was *correct*, and demoting it to a dismissible
warning banner is a downgrade of a real safety signal. If the operation is physically invalid the system
must not offer a one-click Confirm.

**C4 — The post-repair "explanation turn" breaks the invariant it is meant to serve (Codex).**
Plan Unit 4 hands control back to the model after the repair emits its structured outcome. That turn is
tools-enabled, so it can produce a second tool call, a second structured outcome, `pause_turn`,
`max_tokens`, or another prose-only dodge — directly contradicting "exactly one structured outcome."
Fix: once the repair yields a terminal outcome, stop the loop; if prose is wanted, author one
deterministic server-side sentence. Codex's design question puts it bluntly: *"Do you want explanation or
guarantee? The forced repair turn is compatible with guarantee. The follow-up model explanation turn is not."*

**C5 — Unit 1's regex classifier false-positives on ordinary read queries (Gemini).**
In this domain the write verbs are also the query verbs:
- "When did we last **rack** T4?" → matches `rack`
- "Are we ready to **bottle** the 2024 Cab?" → matches `bottle`

Both would trip the forced repair turn on a pure question. The plan's assumption that "a false positive
just costs one extra call" is wrong — a false positive on a read query forces a *write proposal* for
something the user never asked to do. Gemini: *"Delete Unit 1."*

**C6 — Unit 5's warnings contract does not work as specified (Codex).**
`WriteProposal.details` is typed `unknown`, and the client only renders warnings when `details` matches
the existing `WorkOrderProposalDetails` shape (which requires `tasks`, `warnings`, `cost`, `diff` — and
already has its own `warnings` field). Adding a generic optional `warnings: string[]` to `WriteProposal`
either does nothing or collides with the existing field. Fix: define a real proposal-details union,
extend the work-order details schema specifically (e.g. `assistantWarnings`), and update *both* emitters
(`run.ts`, `resolve-choice/route.ts`) and *both* consumers.

## The Alternative Architecture — converged on independently by both reviewers

Both reviewers, from different angles, propose the same thing. Gemini calls it the **Draft / Incomplete
Card**; Codex arrives at it as *"push structured blockers into the actual write tools — if the tool can
build a proposal, it must return a proposal."*

The root insight: the current system treats a card as binary — either a fully valid, ready-to-execute
proposal, or nothing at all. The user wants the *visual anchor* of the card immediately, even when the
data is incomplete or the operation is questionable. That is a UI state that does not currently exist.

Shape:
1. **Tool schema** — required fields become optional; add an `objection` / `missingInfo` field.
2. **Prompt** — "ALWAYS call the tool when the user requests an action, even if details are missing or the
   action looks physically wrong. Put your questions and warnings in `missingInfo`." This also resolves the
   `prompt.ts:40` vs `prompt.ts:45` contradiction rather than overriding it in code.
3. **UI** — render the card as a **Draft**: missing fields as highlighted empty inputs on the card itself,
   the objection displayed prominently, **Confirm disabled** until resolved.

What it buys:
- The card always appears (the actual user requirement).
- Nothing is hallucinated — missing is rendered as missing.
- Dangerous operations cannot be one-click confirmed (answers C1, C3 and the banner-blindness problem).
- Deletes the regex classifier, the forced repair turn, and `decline_write` — roughly 80% of plan 080.

## Design Questions (answer these before revising)

1. **Draft card vs forced repair** — adopt the Draft/Incomplete Card architecture and delete Units 1, 3, 4?
   Both reviewers say yes. It is a larger change to the 51 write tools' schemas but a much smaller change
   to the run loop, and it is the only option that satisfies "card always appears" without fabricating data.
2. **Hard block vs soft warning** — should a *physically invalid* operation (rack must on skins) render a
   Draft card with Confirm **disabled**, versus a warning the user can click past? Gemini says disabled,
   with an explicit typed override. This reverses the answer given during planning (Q1: "card always,
   warning on it") now that the domain consequence is on the table.
3. **Explanation or guarantee** (Codex) — if any forced turn survives, is the follow-up prose turn dropped
   in favour of a deterministic server-authored sentence?
4. **Scope** — is this a generic write-intent system across all 51 write tools, or scoped to work-order
   authoring? Codex: if generic, the classifier is too blunt; if not, stop pretending it is generic.
5. **Sequencing** — Gemini argues Unit 7 (the NDJSON trailing-buffer drop) should ship *first*, on the
   theory that some historical "no card" reports were actually client-swallowed proposals.
   *Author's note, for honesty:* in the 2/7 repro the tapped stream showed the server emitted **no
   `proposal` event at all**, so the client buffer was not the cause of *these* failures. It remains a real
   independent bug worth fixing early, but it is not the root cause measured here.

## Suggested Improvements (non-blocking)

- **S1 (Codex)** — `parseEvent()` casts any JSON object with a string `type`, and both clients use
  non-exhaustive `if/else`. An unhandled `decline` event would compile and then silently no-op at runtime.
  Add exhaustive `switch` handling plus runtime validation in both `AssistantChat.tsx` and
  `useVoiceSession.ts`, with explicit tests for the new event in chat *and* voice.
- **S2 (Codex)** — the fake model seam (Unit 2) proves loop logic, not the API contract. Keep it, but add
  one opt-in live contract test asserting the outgoing `tool_choice` / `thinking` payload shape.
- **S3 (Codex)** — the Unit 4 test matrix is missing branches that matter: forced-turn `pause_turn`,
  forced-turn tool exception, forced-turn `refusal`, and a post-repair turn calling another tool. Write the
  branch table first, then require one test per branch.
- **S4 (Codex)** — Unit 8's assertion (`content.some(b => b.type === "tool_use")`) is weaker than the bug:
  a wrong tool or a `decline_write` still passes. Track proposal rate, decline rate and wrong-tool rate
  separately.
- **S5 (Codex)** — "track tool-error as a terminal outcome" is not real today: a tool exception becomes a
  `tool_result {is_error:true}` fed back to the model, never an emitted `error` event. Map repair-turn
  exceptions, `refusal`, `pause_turn` and `max_tokens` to emitted events explicitly.
- **S6 (Codex)** — the risk table is misprioritised. Latency inside `maxDuration=60` is not the danger;
  false authoritative cards (C1) and `decline_write` collapse (C2) are. Rewrite with those at the top.
- **S7 (both)** — Unit 6 (over-claim guard whole-text early-out) is confirmed correct and independently
  shippable. Gemini: *"Ship this fix immediately, independent of the rest of the plan."*

## What survives unchanged

- **Unit 2** — injection seam + first tests for `runAssistant`. Valuable regardless of architecture.
- **Unit 6** — over-claim guard sentence-scoping. Ship now, standalone.
- **Unit 7** — NDJSON trailing-buffer flush. Real, small, independent.
- **Unit 8** — the finding that the existing eval is structurally blind (it forces a tool call, then
  asserts which tool) stands. The assertion needs strengthening per S4.
- **Unit 9** — live browser proof on Demo Winery. Both reviewers implicitly rely on it.
- **The diagnosis itself** — neither reviewer challenged the 2/7 measurement, the root cause, or the
  over-claim guard hole.

---

## Raw Response — Codex (`gpt-5.4`)

**CRITICAL**

1. The `force once, then revert to auto for an explanation turn` control flow is the wrong design, not just a risky one.
Where: Plan Unit 4, lines 255-274. Current loop behavior in `src/lib/assistant/run.ts:239-257` always re-enters the model after any `tool_result`.
What is wrong: after the forced repair emits a `proposal` or `decline`, handing control back to the model can produce a second tool call, a second structured outcome, `pause_turn`, `max_tokens`, or another prose-only dodge. That directly conflicts with the stated invariant "exactly one structured outcome."
Concrete fix: once the repair turn yields any terminal structured outcome, stop the loop. If you want prose, generate one deterministic server-authored sentence yourself. Do not give the model another tools-enabled turn after the repair.

2. `tool_choice: "any"` over "write tools + decline_write" does not guarantee the right tool, only some tool.
Where: Plan lines 193-196 and 261-264.
What is wrong: this is the real correctness hole. On the repro prompt, the model is already uncertain. Forcing "any write tool" can turn that uncertainty into the wrong write surface or fabricated args. Concern (a) is real. "Nothing commits without a click" is not enough, because the card itself becomes the trust signal.
Concrete fix: the repair path must narrow to a deterministically routed tool family before forcing. If you cannot route confidently, do not open the full write-tool set. For the work-order case, force only the work-order authoring tool path and make that tool carry unresolved fields/warnings or return a hard blocker. Never let the model invent identifiers to satisfy a forced call.

3. `decline_write` is likely to swallow the entire fix.
Where: Plan Unit 3 and Unit 4, lines 244-274; risk table line 378; success criteria line 387.
What is wrong: concern (b) is real. You are giving the model a first-class legal way to keep doing what it already does: hesitate. The result is structured declines instead of prose questions, while the card still does not appear. That fails your own `>=95%` card-emission goal on the repro prompt.
Concrete fix: do not add a generic repair-layer decline unless you are willing to count repair declines as failures for this bug. Better: push structured blockers into the actual write tools. If the tool can build a proposal, it must return a proposal; only deterministic tool-level blockers should decline.

4. The plan does not actually define how `tool-error` becomes a user-visible terminal outcome.
Where: Plan requirement lines 104-105 and Unit 4 lines 257-274. Current code in `src/lib/assistant/run.ts:222-229`.
What is wrong: today a tool exception becomes `tool_result { is_error: true }` back to Claude, not an emitted `error` event to the client. So "track tool-error as a terminal outcome" is fake unless you also define what the user sees.
Concrete fix: explicitly map repair-turn tool exceptions, `refusal`, `pause_turn`, and `max_tokens` into emitted `error` or `decline` events and stop. Do not rely on the model to narrate those branches correctly.

5. Unit 5's `warnings` contract is wrong for the current payload shape.
Where: Plan Unit 5 lines 279-290. Current consumer in `src/app/(app)/assistant/AssistantChat.tsx:954-958` and work-order details source in `src/lib/assistant/tools/propose-work-order.ts:411-412`.
What is wrong: `WriteProposal.details` is generic `unknown`. The chat client only renders warnings if `details` matches the existing work-order details shape, which requires `tasks`, `warnings`, `cost`, and `diff`. Adding a generic optional `warnings: string[]` to `WriteProposal.details` does nothing, or worse collides with the existing `warnings` object array.
Concrete fix: define a real proposal-details union and extend the work-order details schema specifically, e.g. `assistantWarnings: string[]`. Then update both proposal emitters (`run.ts`, `resolve-choice/route.ts`) and both consumers. Do not mutate the generic `WriteProposal` shape and hope the UI picks it up.

**SHOULD FIX**

1. Adding `decline` to the TypeScript union is not enough; the runtime parser will still accept and silently drop mishandled events.
Where: `src/lib/assistant/assistant-events.ts:54-60`, `AssistantChat.tsx:528-549`, `useVoiceSession.ts:263-299`.
What is wrong: `parseEvent()` accepts any JSON object with a string `type` and casts it. Both clients use non-exhaustive `if/else` handlers. A missing `decline` handler will compile and then noop at runtime.
Concrete fix: add real per-event runtime validation or exhaustive `switch` handling in both clients, plus explicit tests for `decline` rendering/behavior in chat and voice.

2. The fake seam is necessary but not sufficient to prove the Anthropic contract.
Where: Plan Unit 2 and Unit 4.
What is wrong: a fake `finalMessage()` proves your loop logic, not the SDK/API behavior. It will not catch bad request shape, `thinking` incompatibility, or the "forced turn emits no text" behavior.
Concrete fix: keep the fake, but add one opt-in live contract test against the real SDK for the exact forced request shape, and one adapter-level test asserting the outgoing `tool_choice` and `thinking` payload.

3. The failure-branch test matrix is incomplete.
Where: Plan Unit 4 tests (a)-(f).
What is wrong: you cover prose/proposal/decline/prose/MAX_TURNS. Missing branches that matter here: forced-turn `pause_turn`, forced-turn tool exception, forced-turn `refusal`, and post-repair explanation turn calling another tool.
Concrete fix: write the branch table first, then require a test per branch. Right now the plan does not prove termination or non-reentrancy on all branches.

4. The eval only proves "some tool was called," not "the server emitted the right card outcome."
Where: Plan Unit 8 lines 322-328.
What is wrong: `content.some(block.type==="tool_use")` is weaker than the bug. A wrong write tool or `decline_write` still passes that eval while the card bug remains.
Concrete fix: track proposal rate, decline rate, and wrong-tool rate separately. The seeded repro should fail if it turns into structured declines instead of proposals.

5. The stated medium-confidence risk is misplaced.
Where: plan risk table and self-assessed confidence.
What is wrong: latency is not the dangerous thing here. The dangerous things are false authoritative cards and `decline_write` collapsing the fix.
Concrete fix: rewrite the risk table so those are the top risks, and make the mitigation concrete at the tool/UI contract level, not "still user-confirmed."

**DESIGN QUESTIONS**

1. Is this really a generic write-intent repair system? If yes, the regex classifier is too blunt. If no, scope it to work-order authoring and stop pretending it is generic.

2. What is the exact UX for a `decline` event in voice mode? The voice client currently knows how to hold a pending proposal, not a terminal decline state.

3. Do you want explanation or guarantee? The forced repair turn is compatible with guarantee. The follow-up model explanation turn is not. Pick one.

---

## Raw Response — Gemini (`gemini-3.1-pro-preview`)

This is a classic case of taking a user's frustrated hyperbole ("it always must surface a confirmation card it cant fail") and treating it as a literal system requirement, even when doing so violates the laws of physics, data integrity, and basic UX principles.

The plan is a massive Rube Goldberg machine designed to force the model to do something it rightly deduced it shouldn't do. You are trading a visible, annoying friction (a prose question) for an invisible, catastrophic failure (corrupted cellar operations).

### CRITICAL (Will break the product, corrupt data, or fail the core requirements)

**1. Domain Correctness: You are automating a cellar-floor catastrophe.**
* *What is wrong:* You are forcing a work order for an impossible physical operation. "Must on skins" is a thick slurry of juice, skins, and seeds. You cannot "rack" it. Racking moves clean liquid off settled solids. If you give a cellarhand a work order to rack T3 to T4, they will either (a) laugh at the ERP for being stupid, or (b) try it, clog a positive displacement pump, blow a hose, and waste hours of labor.
* *The Fix:* Do not convert physical impossibilities into "soft warnings" on a card. The model was completely correct to halt the workflow. The ERP's job is to protect the wine and the workflow, not to blindly rubber-stamp a user's verbal slip. If the operation is physically invalid, it **must** refuse to propose the card.

**2. Data Quality Edge Cases & Hallucination Guarantee.**
* *What is wrong:* You noted the model explicitly refused because it didn't know Mike Juergens' email. If you force `tool_choice: "any"` on the repair turn, Anthropic's API **mechanically requires** the model to output a valid JSON schema for the chosen tool. Where does the email come from? The model will hallucinate one (e.g., `mike@example.com` or randomly assigning it to another Mike). The user clicks the card out of reflex, and the wrong person gets assigned. What if it doesn't know the exact racking volume? It will guess.
* *The Fix:* If a tool has required schema fields, you mathematically cannot force a tool call when the model lacks the data. You must either make all fields in your tool schemas `optional` (allowing a "Draft" card state in the UI that highlights missing fields in red), or you must allow the model to refuse.

**3. The `decline_write` Paradox (Answering Author's Concern B).**
* *What is wrong:* The author's concern is 100% correct. If you give the model a `decline_write` tool, a model that wants to ask for an email will just call `decline_write({reason: "Need email"})`. When it does this, **no card appears**. The user's exact complaint ("it has to actually render the card") is still violated, just via a structured JSON payload instead of a prose string. Your >=95% emission metric will immediately fail because the model will (correctly) use `decline_write` for missing arguments.
* *The Fix:* If you want the card to *always* appear, `decline_write` cannot exist. But if `decline_write` doesn't exist, the model hallucinates required arguments. The only logical exit is a **Draft Work Order** concept. The model calls `propose_work_order` but marks a flag `status: "needs_info"`. The UI renders the card, but the "Confirm" button is disabled until the user fills in the missing email or corrects the impossible "rack" to a "press" directly on the card.

**4. Unit 1: The Regex Classifier will cause rampant false positives.**
* *What is wrong:* Searching for imperative verbs (`rack, issue, transfer, bottle`) to force a write-repair turn is incredibly fragile in a winery.
    * User: "When did we last rack T4?" -> Regex matches `rack`.
    * User: "Are we ready to bottle the 2024 Cab?" -> Regex matches `bottle`.
    * System enters the forced repair turn, strips thinking, forces `tool_choice`, and either hallucinates a work order or fails.
* *The Fix:* Delete Unit 1. Never use regex to classify intent in a domain where the verbs are also standard domain nouns/verbs for querying state.

### SHOULD FIX (Implementation flaws and better approaches)

**1. The Human Factor (Answering Author's Concern A).**
* *What is wrong:* The author asks: *Is "nothing commits without a user click" adequate protection once the change makes the click routine?* **Absolutely not.** If cards always appear, users will develop banner blindness. They will skim the yellow warning, click confirm, and issue bad work orders. "Confirm" becomes a reflex, not a review.
* *The Fix:* The UI must physically prevent confirmation of dangerous actions. If the warning says "This tank contains must on skins, not liquid," the card should render, but the Confirm button must be disabled, forcing the user to either cancel or explicitly override via a typed confirmation.

**2. Unit 7: The Silently Truncated NDJSON Buffer.**
* *What is wrong:* Your client is silently discarding residual buffers without trailing newlines. This means valid proposals are being dropped into the void.
* *The Fix:* This is a massive bug. Fix this *first*. Before you build a massive server-side repair loop, patch the client NDJSON reader. It is highly probable that some of your historical "the model didn't propose" failures were actually "the model proposed but the client swallowed the last chunk."

**3. Unit 6: The Over-Claim Guard Bug.**
* *What is wrong:* Disabling the guard because the word "can't" appears anywhere in the text is a glaring regex flaw.
* *The Fix:* Ship this fix immediately, independent of the rest of the plan.

### DESIGN QUESTIONS (Challenging the Premise)

**Are you solving a prompt conflict with a code hammer?**
You noted a genuine self-contradiction in the ~15k character prompt:
1. "If you have all details, CALL THE TOOL now."
2. "Ask ONE brief clarifying question first for atypical crush/press operations."

Racking must on skins triggers Rule 2 (atypical). The model correctly obeys Rule 2. The user gets mad because they want Rule 1.

Instead of writing a complex 9-unit server-side repair loop to override the model, why not resolve the prompt contradiction and change the UI paradigm?

**The Alternative Architecture: The "Draft/Incomplete" Card**
The core problem is that your system treats a "Card" as a binary: it is either a perfectly valid, ready-to-execute Work Order, or it doesn't exist.
Users want the visual anchor of the card immediately, even if the data is incomplete or stupid.

1.  **Modify the Tool Schema:** Make all arguments in your 51 write tools `optional`, and add an `objection` or `missing_info` string field.
2.  **Update the Prompt:** "ALWAYS call the tool immediately when the user requests an action, even if details are missing or the action seems physically incorrect (like racking must). If details are missing or the action is dangerous, put your questions/warnings in the `missing_info` field."
3.  **Update the UI:** If the payload contains `missing_info` or lacks required fields, render the card, but render it as a **Draft**. Highlight the missing fields (e.g., Assignee Email) as empty input boxes on the card itself. Disable the "Confirm" button. Display the model's physical objection prominently.

This solves everything:
* The user gets their immediate card (satisfying their hyperbole).
* You don't hallucinate missing data (resolving data quality).
* You don't allow dangerous operations to be 1-click confirmed (resolving domain correctness).
* You don't need a deterministic regex, a forced repair turn, or a `decline_write` tool (deleting 80% of Plan 080's complexity).
