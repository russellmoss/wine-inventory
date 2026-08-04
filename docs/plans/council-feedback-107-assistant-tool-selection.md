# Council Feedback — Plan 107, Assistant tool selection

**Date**: 2026-08-04
**Plan**: `docs/plans/2026-08-04-107-refactor-assistant-tool-selection-plan.md`
**Reviewers**: Gemini 3.1 Pro (product logic + data quality + maintainability). **Codex did not run** —
`ask_codex` failed on this Windows box with `windows sandbox: CreateProcessWithLogonW failed: 1907`
(ERROR_PASSWORD_MUST_CHANGE) on both `gpt-5.4` and the `gpt-5.4-mini` fallback. Not a network fault and
not retryable from here; it needs `codex login` re-auth on the host. **The types / Prisma / data-layer
lens therefore went unreviewed** — treat Unit 1's SQL and Unit 4's typing as un-cross-validated.

---

## Critical Issues

### C1. Composition rules cannot move into tool descriptions — ACCEPTED, plan changed

The disease/pest rule is not a boundary rule, it is an **orchestration** rule: "call `query_spray_decision`
AND `query_field_reports`, then combine." Tool descriptions are read to answer "should I call *this* one?"
A model that reads `query_field_reports`, decides it satisfies the request, and fires it will never learn
it also owed a latent-infection check. Failure mode is a confident "no disease recorded" false negative,
which is the one answer in this domain that can cost a crop.

Gemini's distinction is the right one and the plan did not draw it:
- **Mutual-exclusion / boundary rules** (Brix vineyard-vs-tank, `query_materials` vs `db_find`,
  `query_cellar_contents` vs `db_find`, tasting-note vs measurement) → safe to move.
- **Composition / multi-tool rules** (disease/pest "consult BOTH") → must stay in the system prompt.

**Change:** Unit 3 keeps the disease/pest rule in `prompt.ts`. Unit 3's scope drops from ten rules to
the boundary rules only, and the plan now states the boundary-vs-composition test as the rule for
deciding what may ever move.

### C2. Seasonality confounds the usage measurement — ACCEPTED, plan changed

Wine production is violently seasonal. A trace window that does not span a full cycle shows zero calls for
harvest, ferment, and frost tooling for most of the year. If that artifact is later cited to prune, the
tools deleted are exactly the ones about to be needed.

**Change:** Unit 1's artifact must bucket counts **by month**, report the actual span of the trace data,
and carry an explicit `seasonal: protected` marker on harvest/ferment/frost/pruning tools whenever the
window is under 12 months. The artifact should state its own untrustworthiness rather than let a future
reader assume a zero means "unused."

### C3. "Fix the eval harness instead" — ACCEPTED as an addition, not a replacement

Gemini calls Unit 3's eval-visibility justification tail-wagging-the-dog: refactoring production prompt
architecture to suit a hardcoded test harness is backwards. Fair hit on that *justification*. The fix it
proposes — inject the real `buildSystemPrompt()` into `test/evals/assistant-tools.eval.test.ts` instead of
the hardcoded two-sentence string — is cheap, strictly good, and independent of everything else.

It does not replace Unit 3, because Unit 3's primary rationale stands on its own: descriptions are what
the model reads at selection time, and eight tools already carry "use X instead of Y" guidance, so the
prompt rules are the inconsistent ones. But it does mean we should **fix the harness first and get a real
baseline through the real prompt**, then move rules against that baseline.

**Change:** new **Unit 0** — point the tool-selection evals at the production system prompt. Runs before
Unit 3 and gives it a trustworthy before/after number.

### C4. "Halt Unit 3 until progressive disclosure ships" — REJECTED, recorded

Gemini argues the 96-tool flat list is the root cause and pushing more prose into descriptions worsens
lost-in-the-middle attention.

Rejecting the halt, for two reasons. First, Unit 3 is close to **token-neutral** — the prose leaves the
system prompt and enters the tool list; it is a relocation, not an addition. Second, the halt inverts the
plan's own sequencing: progressive disclosure needs the usage data Unit 1 produces, so "do progressive
disclosure first" is not actually available. Unit 3 is cheap, one-commit-per-rule reversible, and does not
foreclose the payload-shrinking work.

The underlying point — that relocation is a symptom fix and payload size is the disease — is right and is
already the plan's own framing. Recorded, not acted on.

---

## Design Questions

1. **Enum violation handling (Gemini, Unit 4).** If the model emits a value outside the new `entity`
   enum, does that surface as a retryable message to the model or a user-facing failure?
   **Answered from the code, no change needed:** `src/lib/assistant/run.ts:323` catches a thrown tool
   error and pushes it back as a `tool_result` with `is_error: true`, so the model sees the message and
   can retry. The existing `db-find.ts:25` error already names the allowed set. The enum narrows;
   the runtime check plus that error remain the backstop. Unit 4 must not remove either.

2. **Zero-count ambiguity (Gemini, Unit 1).** A zero means "nobody needed it" or "the model never picked
   it because the description is bad" — opposite conclusions, same number. **Accepted:** Unit 1 now also
   counts `db_find` / `db_create` fallback calls and their `entity` arguments, which is the visible
   signature of a domain tool the model failed to select.

3. **Bidirectional rule drift (Gemini, Unit 3).** Writing the same Brix boundary into both `log_brix` and
   `record_measurement` invites the two copies to drift. **Accepted:** each description states its own
   scope and points away ("for X, use Z") without restating Z's rule. The Unit 3 tests pin the pointer
   phrase, not a duplicated explanation.

4. **Open, for the user.** Does the MCP gap C1 exposes change the api-strategy build order? An external
   MCP client supplies its **own** system prompt, so any behaviour that must stay prompt-resident is
   simply absent over MCP. See the amendment recorded in `docs/api-strategy.md`.

---

## Suggested Improvements (not adopted, logged)

- Gemini suggests marking seasonal tools protected permanently rather than conditionally. Conditional on
  window length is enough and avoids a stale hardcoded list.
- Gemini flags the 6,768-char `search_knowledge_base` description as evidence descriptions are already
  sprawling. True, and worth its own cleanup, but out of scope here.

---

## Raw Response — Codex

**FAILED TO RUN.** `windows sandbox: CreateProcessWithLogonW failed: 1907` on `gpt-5.4` and
`gpt-5.4-mini`. Needs host re-auth (`codex login`). Correctness / type-safety / Prisma review is
**outstanding** for this plan.

## Raw Response — Gemini

**CRITICAL**

- **Split cross-tool coordination rules (Domain Correctness / Safety).** Moving the "consult BOTH"
  disease/pest rule into isolated tool descriptions will break it. LLMs evaluate tool descriptions to
  decide *which* tool to call. If a user asks "what did the scout see?", the model reads
  `query_field_reports`, decides it satisfies the prompt, and fires it. If the global rule requiring it to
  *also* check `query_spray_decision` isn't in the system prompt, it will short-circuit, ignore the other
  tool, and output a dangerous "no disease" false negative. *Fix:* Do not move orchestration or multi-tool
  rules to tool descriptions. Mutual-exclusion rules (like Brix vineyard vs. tank) are safe to move because
  they are boundary definitions. Composition rules must stay in the system prompt.
- **Seasonality confounder in usage data (Data Quality).** The plan assumes 0 invocations means a tool is
  unused. Wine production is violently seasonal. A 6-month historical trace taken in June will show zero
  `log_brix` (harvest) and zero fermentation tracking. If this artifact is used later to justify deletions,
  you will delete core harvest tools right before harvest. *Fix:* The artifact MUST group invocation counts
  by month. If the trace data does not span a full 12-month calendar across multiple tenants, mark all
  seasonal tools (harvest, frost-tracking, pruning) as explicitly protected in the artifact.
- **Tail-wagging-the-dog refactoring (User Outcome / Maintainability).** The plan justifies moving rules
  into tool descriptions because "the tool-selection evals do not use the real system prompt." Refactoring
  production prompt architecture, bloating payloads, and risking model behavior just to accommodate a lazy,
  hardcoded test harness is an anti-pattern. It does not improve the winemaker's outcome; it's pure internal
  hygiene optimized for broken CI. *Fix:* Fix the eval harness. Export the actual production system prompt
  and inject it into `test/evals/assistant-tools.eval.test.ts` instead of migrating prose to bypass a bad
  test setup.
- **Context window bloat (Maintainability / User Outcome).** 96 tools sent on every turn is the root cause
  of the selection cliff. The longest tool description is 6,768 characters (~1,500 tokens). Shoving more
  routing prose into 96 parallel descriptions inflates the tool payload further, worsening the
  "lost in the middle" attention failure mode. *Fix:* Halt Unit 3 until the "out of scope"
  progressive-disclosure/routing tools surface is built. Shrink the payload first; do not push more bytes
  into a 96-tool flat list.

**SHOULD FIX**

- **Model-ignored vs. User-unneeded confounder (Data Quality).** Unit 1 measures what the *model*
  successfully called, not what the *user* asked for. If a tool's current description is confusing, the
  model won't pick it, and it will register as a 0. You risk concluding nobody wants the workflow, when
  actually the prompt was just bad. *Fix:* Include a count of fallback `db_find` calls or general model
  failures in the artifact to baseline the 0-count tools against user requests that were routed incorrectly.
- **Brix bi-directional redundancy (Domain Correctness).** Writing the exact same vineyard vs. tank boundary
  rule in both `log_brix` and `record_measurement` descriptions risks them drifting apart in future PRs.
  *Fix:* Write the rule entirely from the perspective of the tool it belongs to ("Use this for X. For Y, use
  Z"). Do not duplicate the full explanation of Z in X's description.

**DESIGN QUESTIONS**

- **JSON Schema Enum behavior on `db_*`.** Unit 4 restricts the `entity` param to a dynamic enum. If a user
  asks for an entity not in the list, models often hallucinate an invalid string anyway rather than cleanly
  rejecting. *Fix:* If the model violates the schema Enum, does the system hard-crash or gracefully return
  the valid Enum list to the model and prompt a retry? Ensure the error boundary for schema validation
  failures is a system message back to the LLM, not a 500 error to the user.
