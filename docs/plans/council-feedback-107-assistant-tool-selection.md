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

**RAN 2026-08-04 on the second attempt (gpt-5.6-sol, reasoning=high).** The `council-mcp` wrapper is
what fails, not Codex: it requests `gpt-5.4`/`gpt-5.4-mini` (which this install does not have) and
spawns Codex through a sandbox path that dies on `CreateProcessWithLogonW: 1907`
(`ERROR_PASSWORD_MUST_CHANGE` — the Windows account behind Codex's sandbox user has an expired
password). `codex exec -s read-only` **from Bash works fine**, but Codex cannot spawn a local shell,
so it cannot read repo files itself. **Workaround that worked: inline every excerpt into the prompt
and instruct it to run no commands.** Use that for future `/council` runs on this box.

### Codex findings, with verification status

**C-1 (CRITICAL, CONFIRMED + made worse). Unit 1's dataset is a survivorship-biased lower bound, and
an observed zero therefore cannot justify deleting a tool.** Loss is **whole-turn, not partial**: a
79-second run killed at a 60-second ceiling contributes **zero** rows even though it executed N tools.
Missing classes: timed-out/killed runs; `conversationId` absent; `appendMessage` throwing (swallowed
by `catch { /* best-effort */ }`). And **no attempted-turn denominator is persisted**, so the
undercount is not merely unknown but unbounded.

I verified a **third loss source Codex could not see**: `src/lib/assistant/trace.ts:80`,
`pushToolTrace` starts with `if (trace.toolCalls.length >= MAX_TOOL_CALLS) return;` with
`MAX_TOOL_CALLS = 40`. So even a turn that persists is silently truncated at 40 calls.

All three biases point the same way — against long, KB-heavy, multi-tool turns, which is exactly
where routing confusion lives. **This does not kill Unit 1; it narrows what Unit 1 may be used to
conclude.** See the plan's revised Unit 1.

**C-2 (CRITICAL, partially UNVERIFIED). `assistant_confirmation` escapes the post-run append path but
is not proven unbiased.** Unknown from the excerpts: when the row commits relative to execution;
whether rejected/expired/replayed confirmations persist; whether execution and status update are
atomic. **Do not group every confirmation row without an explicit executed/succeeded status and a
dedup key.** Still open.

**C-3 (CRITICAL, RESOLVED — not a defect).** Codex flagged that `runAsSystem` must use a real
`BYPASSRLS` connection rather than just setting async-local context. Verified at
`src/lib/tenant/system.ts:23`: it builds a **separate `PrismaClient` on `DATABASE_URL_UNPOOLED`** (the
Neon owner role, which carries `BYPASSRLS`) on a **plain, un-extended** client. Correct as planned. Its
doc comment says scripts-only and never the web app, which is what Unit 1 is.

**C-4 (CRITICAL, ACCEPTED). Postgres `COUNT`/`COUNT(DISTINCT …)` return `bigint`, and `JSON.stringify`
throws on `BigInt`.** A `$queryRaw` aggregate feeding the artifact writer will crash at runtime.
Normalize with a checked `Number(...)` at the SQL/TS boundary and validate the raw row shape rather
than trusting the generic.

**S-1 (ACCEPTED). Shape-safe JSON expansion.** Prisma `Json` maps to `jsonb`, so no cast is needed on
the column, but the expansion must tolerate SQL `NULL`, JSON `null`, a non-object `trace`, and a
non-array `toolCalls`:
```sql
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(am.metadata -> 'trace' -> 'toolCalls') = 'array'
       THEN am.metadata -> 'trace' -> 'toolCalls' ELSE '[]'::jsonb END
) AS call
WHERE jsonb_typeof(call) = 'object' AND jsonb_typeof(call -> 'name') = 'string'
```
Quote the camel-case columns (`"createdAt"`, `"conversationId"`).

**S-2 (ACCEPTED). No `metadata` index needed.** An unfiltered all-history aggregate is a linear scan
by definition; GIN would not help. If this becomes a repeated bounded report, add a standalone
`"createdAt"` index — the existing `(conversationId, createdAt)` composite cannot drive a global date
range.

**S-4 (ACCEPTED — sharper than the plan's own hazard note). The module-init enum will break the two
existing mocks with "not a function", not with a stale value.** `test/assistant-db-create-dedup.test.ts:34`
and `test/assistant-db-update-resolve.test.ts:52` mock the entities module **partially**; hoisting is
not the problem, the missing helper is. Extend both factories with every new helper the imported
module evaluates.

**S-5 (ACCEPTED — pre-existing bug, now in scope). `db_create` / `db_update` error messages advertise
all 8 entities as creatable/editable.** Both interpolate `allowedEntityNames()`, so the text names
entities the guard will reject. Unit 4 must switch them to the capability-filtered helpers; the enum
alone does not fix it.

**S-3 / S-6 (ACCEPTED). Predicates defined once, reused by both guard and enum**, exactly as written
(`creatable && buildCreate && create`; `editable && update && current`; find/delete = existence only).
Do **not** substitute `fields.length > 0` — it differs from the runtime predicate. Add a registry test
asserting each capability list is non-empty and unique.

### Codex design questions worth answering before Unit 1 is written

1. **Trace counts vs confirmation counts must not be summed** — a write tool appears once in the trace
   as the proposing call and again in `assistant_confirmation` on execution. Report them as two
   metrics with an explicit grain.
2. **"Invocation" is ambiguous** — the trace holds successful *and* failed calls. Keep
   attempted/succeeded/failed separate using `ok` / `resultKind`.
3. **Renamed/removed/new tools** — joining only to today's 96-entry registry drops historical names and
   gives brand-new tools a misleading lifetime zero. Keep an "unknown/retired" bucket.
4. **`createdAt` is completion time, not invocation time** — month-bucketing skews at boundaries and
   timed-out calls have no month at all. Compounds the seasonality caveat (C2 above). Declare the
   reporting timezone explicitly.
5. **PII: the guard belongs in the SQL projection, not the artifact writer.** `sanitizeTraceValue`
   redacts by key *name* only (`SENSITIVE_KEY` regex), so a free-text value carrying a person's name
   survives into `input`/`resultPreview`. Project only canonical name, bucket, counts and extrema —
   never pass raw `metadata` into the "pure" aggregation function.
6. **The enum makes entity names case-sensitive** while `getEntity` is case-insensitive. That is a
   deliberate behaviour change; keep the runtime fallback and test the intended compatibility.

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
