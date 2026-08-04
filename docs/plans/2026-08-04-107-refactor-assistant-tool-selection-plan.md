---
title: Assistant tool selection — measure what's used, then sharpen the surface
type: refactor
status: draft
date: 2026-08-04
branch: refactor/assistant-tool-selection
depth: standard
units: 6
council: docs/plans/council-feedback-107-assistant-tool-selection.md
---

> **Revised 2026-08-04 after a FULL council review (Gemini + Codex).** Gemini raised four criticals;
> three were accepted (composition rules stay in the prompt, the measurement must bucket by month, a new
> Unit 0 fixes the eval harness first) and one was rejected on the record. Codex then reviewed the
> types/Prisma/data lens and landed a finding that **changes what Unit 1 is for**: the trace is a
> survivorship-biased lower bound, so a zero-count can never justify deleting a tool. Unit 1 survives as
> a positive-usage signal only. Codex also caught a `bigint` crash, the real `vi.mock` failure mode, and
> a pre-existing error-message bug now folded into Unit 4. Full detail + verification status in
> `docs/plans/council-feedback-107-assistant-tool-selection.md`.
>
> **Unit 0 is BUILT** (commit `44af9425`); its live baseline is still uncaptured.
>
> **Owner decision 2026-08-04: forward instrumentation.** Old Unit 1 (mine the existing trace) is
> replaced by **Unit 1a** (an append-only `assistant_tool_call` event written before dispatch) and
> **Unit 1b** (the report over it). This re-introduces the tenant-scoped table + migration the plan had
> been pleased to avoid — on evidence this time, not assumption. It also makes Unit 1b **time-gated**:
> the report is worthless until the instrumented window is long enough to read, so it is the LAST unit,
> not the next one.

## Overview

The assistant ships all 96 tools to the model on every turn, against a selection cliff the
repo's own allow-list puts at ~40. The compensation has been ten hand-written routing rules
in the system prompt ("use `query_materials`, not `db_find`"). This plan measures which tools
real people actually reach for, then moves the routing guidance from the prompt into the tool
descriptions where the model reads it — and where, unlike the prompt, the eval harness can
actually test it.

No tools are deleted here. Deletion needs the usage data this plan produces.

## Problem Frame

An LLM dropped into Cellarhand today figures out what to do because we told it in prose, not
because the surface is self-describing. Every routing rule in `src/lib/assistant/prompt.ts` is
a patch for a tool-selection ambiguity that a tool description should have prevented. The rules
accumulate with each new tool, and they sit in the one place the tool-selection evals do not read.

If we do nothing: the prompt keeps growing, tool selection keeps degrading as the registry passes
100, and we keep discovering routing failures from user bug reports instead of from CI.

**Premise correction from research.** The office-hours design doc assumed read-side tool calls
were invisible and would need new logging. They are not. See Research Summary — this shrinks the
work substantially and removes the Phase 12 checklist risk entirely.

## Requirements

- MUST: produce a repeatable, read-only measurement of per-tool usage covering both reads and writes
- MUST: move the routing rules into the descriptions of the tools they govern, with content-pinning tests
- MUST: constrain the `db_*` `entity` param so an invalid entity is impossible, not recoverable-after-failure
- MUST: keep `npm run verify:ai-native` green and the generated coverage doc current
- MUST: capture a before/after tool-selection eval baseline, since this changes model behaviour
- SHOULD: pin the `metadata.trace.toolCalls` shape that both replay and the measurement depend on
- NICE: a committed usage artifact that later prune/consolidate decisions can cite

## Scope Boundaries

**In scope:**
- A measurement script over data that already exists
- Relocating existing routing prose from the prompt into tool descriptions
- JSON Schema `enum` on the four `db_*` tools' `entity` param
- Tests that pin both the moved descriptions and the enum↔runtime agreement

**Out of scope, and why:**
- Deleting, merging, or namespacing any tool. That is Approach C in the design doc and it needs
  Unit 1's data first. Guessing which of 96 tools to cut is how you break a workflow someone relies on.
- An MCP server. Separate ship, separate decision (see `docs/api-strategy.md`).
- A two-level / progressive-disclosure tool surface. Depends on the same data.
- Any new Prisma model, migration, or RLS policy. Research removed the need — see below.

## Research Summary

### Codebase Patterns

**1. Read-side tool calls are already persisted. This was the plan's biggest assumption and it was wrong.**
`src/app/api/assistant/route.ts:179` writes `metadata: { trace: run.trace }` on every assistant
message row, gated at `:173` on `run.text.trim() || run.trace.toolCalls.length > 0`. The comment
there records that the gate was deliberately widened so tool evidence is never dropped. `run.trace.toolCalls`
already carries `{ id, name, input, resultPreview, resultKind }` per call — reads included.

So the usage question is answerable today with a query against `assistant_message.metadata`, joined
with `assistant_confirmation` for the confirmed-write half. No new table, no new logging, no Phase 12
nine-step checklist, no migration.

**2. The tool-selection evals do not use the real system prompt.**
`test/evals/assistant-tools.eval.test.ts:159-161` and `assistant-fleet.eval.test.ts:53-56` build a
hardcoded two-sentence system string. `buildSystemPrompt()` is only used by the must-propose, currency,
and two KB evals — and none of those assert on prompt text. Consequence: **the ten routing rules have
zero eval coverage today.** Moving them into tool descriptions makes them newly visible to the exact
harness that tests tool selection. That is an argument *for* Unit 3, not a risk of it.

**3. CI gating is narrower than assumed.** `.github/workflows/ci.yml:41` runs `npx vitest run` on every
PR, which executes only the *structural* half of each eval (golden↔registry consistency, write-tool
coverage, committer wiring). The live-model half is `describe.skipIf`-gated on `ASSISTANT_EVAL=1` plus an
API key. The only workflow that runs a live eval is `.github/workflows/assistant-must-propose.yml`:
nightly cron, `continue-on-error: true` (`:46`), opens a labelled GitHub issue on failure rather than
blocking anything. So: coverage is a hard gate; model behaviour is a nightly advisory.

**4. "Use X instead of Y" in a description is already the house style.** Confirmed at
`query-measurements.ts:187`, `log-brix.ts:23`, `record-measurement.ts:91`, `receive-consumable.ts:20`,
`adjust-consumable.ts:20`, `add-equipment.ts:20`, `create-grower.ts:34`, `receive-finished-good.ts:41`.
Descriptions run 161–6768 chars, median ~524. `search-knowledge-base.ts:149` is a nine-rule policy
document. Unit 3 applies an existing convention rather than inventing one.

**5. There is a precedent for pinning description content in a test.**
`test/knowledge-tool-description.test.ts` asserts ~15 regexes against one tool's description, including
verbatim-stability of a specific rule. That is the pattern Unit 3's tests should copy.

**6. `allowedEntityNames()` is safe for a module-init enum, but a single shared enum would be wrong.**
`src/lib/assistant/entities.ts:768` returns `Object.keys(ENTITIES)` — synchronous, module-level,
request-independent, 8 entities. But capability is uneven: `db-create.ts:42-45` additionally requires
`entity.creatable && entity.buildCreate && entity.create`; `db-update.ts:43-45` requires editable;
`db-delete.ts` is `adminOnly` with its own check. A shared 8-value enum would advertise entities a given
tool will reject at runtime.

**7. Append-only table precedent (not needed now, recorded for the register).**
`prisma/migrations/20260728100100_latent_infection_event/` is the current reference: ENABLE + FORCE RLS,
`tenant_isolation` with USING and WITH CHECK, FK to `organization(id)` ON DELETE RESTRICT, and — load-bearing —
`REVOKE UPDATE, DELETE, TRUNCATE ... FROM app_rls` at `:167`, because the `app_rls_role` migration's
`ALTER DEFAULT PRIVILEGES` means a new table arrives with full DML already granted.

### Prior Learnings

- Green CI can prove nothing if the tests exercise a path no product surface calls. Unit 4's tests must
  assert enum↔runtime *agreement*, not just that an enum exists.
- `$queryRaw` bypasses the tenant extension; cross-tenant reads need `runAsSystem`, and `prismaBase`
  under RLS returns zero rows.
- Only main-checkout directories carry `.env`, so the measurement script runs from the main checkout.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where usage data comes from | Query existing `assistant_message.metadata.trace.toolCalls` + `assistant_confirmation` | New `assistant_tool_call` table; `AssistantMessage.metadata` extension | The data is already there. Building a table for data you already have is the exact overbuild this plan exists to avoid. |
| Routing rules location | Tool `description` fields | Leave in prompt; a separate routing doc | Descriptions are what the model reads at selection time, follow an existing convention, and are the only one of the two the eval harness sees. |
| Enum scope | Per-tool, derived from the same capability predicate the runtime uses | One shared enum from `allowedEntityNames()` | A shared enum advertises entities the tool will reject; per-tool enums cannot drift from the runtime check. |
| Tool deletion | Deferred to a later plan | Prune now | No data yet. Unit 1 produces it. |
| Behavioural safety net | Before/after `ASSISTANT_EVAL=1` baseline, recorded in the PR | Rely on CI | CI does not gate model behaviour; the nightly job is advisory. A recorded baseline is the only real check. |

## Implementation Units

Unit 0 gates Unit 3. Units 1, 2 and 4 are independent and can run in parallel with either. Nothing here
depends on Unit 1's *results* — the results inform the *next* plan (pruning), not this one.

**The rule that decides what may move (council C1).** Before relocating any rule out of `prompt.ts`,
classify it:
- **Boundary rule** — "this tool covers X, that one covers Y" (Brix vineyard-vs-tank, `query_materials`
  vs `db_find`). A description is read to answer "should I call *this* one?", which is exactly the
  question a boundary rule answers. **Safe to move.**
- **Composition rule** — "call A and B, then combine" (disease/pest). A description is never read to
  answer "what else do I owe?". Split across two descriptions, the model reads one, decides it satisfies
  the request, and fires it alone. **Must stay in the prompt.**

### Unit 0: Point the tool-selection evals at the real system prompt

**Goal:** Make the eval harness test the prompt we actually ship, so Unit 3 has a trustworthy baseline.
**Files:** `test/evals/assistant-tools.eval.test.ts`, `test/evals/assistant-fleet.eval.test.ts`
**Approach:** Both files build a hardcoded two-sentence system string (`assistant-tools:159-161`,
`assistant-fleet:53-56`) instead of calling `buildSystemPrompt()`. That is why the ten routing rules have
never been under test. Replace the hardcoded string with `buildSystemPrompt()` — same call the
must-propose and currency evals already make, so there is a working precedent in the same directory.
Expect the pass rate to *move* on this change alone: the model is newly seeing ten routing rules it has
never had during these evals. Record the new number as the real baseline.
**Tests:** this unit changes tests. The structural half must stay green.
**Depends on:** none
**Execution note:** this is the first thing that runs, and its output is the baseline every later unit
is measured against.
**Verification:** `ASSISTANT_EVAL=1 npm run eval:assistant` before and after; both numbers recorded in
the PR body. `npx vitest run` green.

### Unit 1a: Instrument tool dispatch — an append-only attempt event

> **Owner decision 2026-08-04: go with forward instrumentation.** The alternative (mine the existing
> trace) was costed and rejected because its output cannot do the job it exists for — see the loss
> analysis below. This unit re-introduces the tenant-scoped table the plan was originally pleased to
> have avoided, but now on evidence rather than assumption.

**Goal:** Every tool dispatch produces a durable row BEFORE the tool runs, so the count survives a
timeout, an error, a swallowed write, and the 40-call trace cap.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_assistant_tool_call/migration.sql`,
`src/lib/assistant/tool-log.ts` (new), `src/lib/assistant/run.ts`,
`scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`

**Model — `AssistantToolCall` / `assistant_tool_call`.** Mirror `CalculationLog`
(`prisma/schema.prisma:5413`), which is the closest structural precedent: tenant-scoped, append-only,
`userId` + `userEmail` snapshot FK-free by design so the row survives a user rename/delete.
Fields: `tenantId`, `id`, `conversationId` (plain string, NOT an FK — an FK would make a logging miss
break the chat, and a cascade delete would silently rewrite history), `userId`, `userEmail`,
`toolName`, `toolKind` (`read`/`write`), `modelTurn` (int — which model turn inside the user turn),
`createdAt`. Indexes `@@index([tenantId, createdAt])` and `@@index([tenantId, toolName, createdAt])`.

⛔ **NO ARGUMENTS, NO RESULTS, NO UTTERANCE TEXT.** This is the PII boundary and it is structural: the
table has no column that could hold free text from a user. `sanitizeTraceValue` redacts by key *name*
only, so anything argument-shaped can carry a person's name — which is exactly why the existing trace
is unsafe to aggregate directly. Add a schema test in the style of `test/commerce7-schema.test.ts`
that FAILS if a PII-capable column is ever added here.

**Where the write goes — batched per model turn, not per tool call.** `src/lib/assistant/run.ts:204`
already collects `toolUses` as an array and then loops. Insert ONE awaited `createMany` immediately
before `for (const tu of toolUses)`. That gives before-dispatch durability at **one write per model
turn** (typically 1–3 per user turn) rather than one per tool call, which matters because this is a hot
path that is already hitting a serverless ceiling. `MAX_TOOL_CALLS = 40` does not apply — this is not
the trace.

**Follow `logCalculation` (`src/lib/winemaking-calc/log.ts:39`) exactly**, including its two gotchas:
- ⚠️ **TENANT-3:** `await` INSIDE the `runAsTenant` callback. A non-async callback returns a lazy
  `PrismaPromise` that executes after the ALS context has already exited, and the write lands on the
  wrong tenant. This is a closed bug (#531) that will re-open if the pattern is copied carelessly.
- **Best-effort, wrapped in try/catch, and it must NEVER break a chat turn.** No tenant → skip silently.
  A logging miss is acceptable; a failed answer is not. Note the honest consequence: this makes the new
  table best-effort too — but it removes the whole-turn, timeout, and 40-cap losses, which are the ones
  that made the old data unusable.

**Migration — the full Phase-12 checklist, plus the append-only posture.** Copy
`prisma/migrations/20260728100100_latent_infection_event/migration.sql`: `tenantId` + index + FK to
`organization(id)` ON DELETE RESTRICT, `ENABLE` + `FORCE ROW LEVEL SECURITY`, a `tenant_isolation`
policy with USING **and** WITH CHECK on `current_setting('app.tenant_id', true)`, and — load-bearing —
`GRANT SELECT, INSERT` followed by **`REVOKE UPDATE, DELETE, TRUNCATE … FROM app_rls`**. The
`..._app_rls_role` migration's `ALTER DEFAULT PRIVILEGES` means a new table arrives with full DML
already granted, so a bare GRANT changes nothing. Close with the same `DO $$ … $$` self-verify block
that raises if RLS, the policy, or the grant posture drifts.
✅ **Step 3 of the checklist (backfill-then-enforce) is vacuous here** — a brand-new table has no rows,
so `NOT NULL` can be set at creation. This is the one easy case of the live-tenant rule.

**Tests:** a case in `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts`; the
no-PII-column schema test; a unit test that the batch write happens BEFORE dispatch (assert ordering,
not just occurrence); and a test that a thrown logging error does not fail the turn.
**Depends on:** none
**Verification:** `npm run verify:tenant-isolation` includes the new table; a live Demo Winery chat turn
produces rows readable via `runAsTenant("org_demo_winery", …)`; and a deliberately-thrown logging error
still returns a normal answer.

### Unit 1b: Report over the instrumented data

**Goal:** The artifact that later prune decisions actually cite.
**Files:** `scripts/measure-assistant-tool-usage.ts`, `package.json` (add `measure:assistant-tools`),
`docs/architecture/assistant-tool-usage.md` (generated artifact)
**Approach:** Group `assistant_tool_call` by `toolName` behind one `runAsSystem` entry point
(deliberately cross-tenant; verified correct at `src/lib/tenant/system.ts:23` — a separate client on
`DATABASE_URL_UNPOOLED`, Neon owner, `BYPASSRLS`, un-extended). Bucket by month. Join against
`ALL_TOOLS` from the registry so zero-invocation tools appear as explicit zero rows — **now the zeros
mean something.** Keep `assistant_confirmation` as a SECOND, separately-reported metric (never summed —
a write tool appears in both). Keep an "unknown/retired" bucket for names absent from today's registry.
Aggregation logic in a pure exported function, unit-testable without a database.
**The legacy trace is a caveated historical annex, not the primary source.** If it is reported at all,
it goes in its own clearly-labelled section carrying the loss analysis below verbatim.
**Depends on:** Unit 1a — **and on elapsed time.** This report is worthless until the instrumented
window is long enough to be read (see the seasonality note); it is the last thing to run, not the next.
**⛔ WHY WE INSTRUMENT INSTEAD OF MINING (Codex C-1) — and the caveat the legacy annex must carry.**
The existing trace is a **survivorship-biased lower bound**, from three independent, same-direction
losses. Unit 1a removes all three at the source; this analysis stays here as the justification for
building it, and must be reproduced verbatim on any report that touches historical trace data:
1. **Whole-turn loss — ⚠️ NOW ONLY PARTIAL. PR #581 MERGED and shrank this.** Re-checked against
   `origin/main` 2026-08-04 after #581 landed. It added a **soft deadline**
   (`run.ts:197`, `hasRoomForAnotherRoundTrip`): the loop breaks with `stopReason = "deadline"`, so
   `runAssistant` returns *normally* and the append still happens. Its own comment names the exact
   failure — *"Vercel kills the function mid-stream, so this catch never runs, no row is persisted and
   nothing reaches Sentry."*
   **What survives:** the deadline is a heuristic, and by design it **never gates the first
   round-trip**, so one very long first round-trip can still be killed outright. Plus `appendMessage`
   throwing (swallowed at `route.ts:191`) and a missing `conversationId`. The write is still
   after-the-run rather than before-dispatch, which is a categorically weaker guarantee.
   **Be honest about the consequence: this was the headline argument for instrumenting, and it is now
   the weakest of the three.**
2. **Per-turn truncation.** `trace.ts:80` — `pushToolTrace` returns silently once `MAX_TOOL_CALLS = 40`
   is reached. A persisted turn can still be missing calls.
3. **No denominator.** Attempted turns are not persisted anywhere, so the undercount cannot even be
   estimated.

All three bias against long, KB-heavy, multi-tool turns — which is exactly where routing confusion
lives. For **historical** trace data that remains permanently true:
- ✅ **VALID:** "these tools are definitely used" (positive signal), relative ordering among
  frequently-used tools, and `db_find` fallback evidence.
- ⛔ **INVALID:** a zero is not evidence of disuse. History cannot be repaired retroactively, so the
  pre-instrumentation window is never deletion-grade no matter how long we wait.

Unit 1a fixes all three going forward: written **before** dispatch, not subject to the 40-call cap, and
rows-per-turn give a usable denominator. It remains best-effort at the try/catch level — a deliberate,
stated trade, because a logging miss must never break a chat answer.

**⚖️ The case for Unit 1a AFTER #581 landed, stated fairly.** Loss #1 shrank from "total" to "partial",
so the strongest remaining arguments are #2 (the 40-call cap, untouched by #581), #3 (no denominator,
untouched), and the categorical point that before-dispatch beats after-the-run. That is still a real
case — a capped, denominator-less signal cannot retire a tool — but it is a **narrower** case than the
one the owner said yes to, and the honest read is that #581 already bought a meaningful share of the
benefit for free. If the batching measurement in Unit 1a shows any turn-latency regression, revisit
whether the remaining delta is worth a hot-path write at all. Recorded so this is a decision, not drift.

**Seasonality (council C2 — this is what makes the artifact safe to cite later).** Wine work is violently
seasonal: a window that does not span a full cycle shows zero calls for harvest, ferment and frost tooling
for most of the year, and a future reader pruning on that would delete harvest tools in August. So the
artifact MUST bucket counts **by month**, state the actual first/last timestamp span of the underlying
trace data, and — whenever that span is under 12 months — stamp harvest / ferment / frost / pruning tools
`seasonal: protected`. The artifact states its own untrustworthiness rather than presenting a zero as a
verdict.
**Zero-count disambiguation (council DQ2).** A zero means "nobody needed it" or "the model never picked it
because the description is poor" — opposite conclusions from the same number. Also count `db_find` /
`db_create` calls and their `entity` arguments: a domain question falling through to generic CRUD is the
visible signature of a domain tool the model failed to select, and it is the tie-breaker between those two
readings.
**Privacy:** the committed artifact carries tool names, counts, and distinct-actor *counts* only. No
emails, no user ids, no utterance text.
**Tests:** unit test the pure aggregation function over a fixture of raw rows, including a row whose
`metadata` is null, one whose `trace.toolCalls` is `[]`, one whose shape is malformed, and one spanning a
month boundary (to pin the bucketing).
**Depends on:** none
**SQL requirements (Codex S-1, C-4 — these are not optional).** The `jsonb` expansion rules apply ONLY
to the legacy-trace historical annex; the primary report reads flat columns off `assistant_tool_call`
and needs none of it. The `bigint`, PII-projection and `runAsSystem` rules apply to **both**.
- Expand shape-safely; the column is `jsonb` (Prisma `Json` → `jsonb`) so no cast is needed, but the
  array is not guaranteed to exist or be an array:
  `CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(am.metadata->'trace'->'toolCalls')='array' THEN am.metadata->'trace'->'toolCalls' ELSE '[]'::jsonb END) AS call`
  then `WHERE jsonb_typeof(call)='object' AND jsonb_typeof(call->'name')='string'`.
- Quote camel-case columns (`"createdAt"`, `"conversationId"`).
- **`COUNT`/`COUNT(DISTINCT …)` return `bigint` and `JSON.stringify` throws on `BigInt`** — normalize
  with a checked `Number(...)` at the boundary and validate the raw row shape.
- **PII is guarded in the SQL projection, not in the writer.** `sanitizeTraceValue` redacts by key
  *name* only, so free-text values survive into `input`/`resultPreview`. Project **only** canonical
  name, month bucket, counts and extrema; never pass raw `metadata` into the pure function.
- `runAsSystem` is correct and verified — `src/lib/tenant/system.ts:23` opens a separate client on
  `DATABASE_URL_UNPOOLED` (Neon owner, `BYPASSRLS`), un-extended. No index is needed; an all-history
  aggregate is a linear scan by definition and GIN would not help.
- Report trace counts and `assistant_confirmation` counts as **two separate metrics** — never summed
  (a write tool appears in both). Keep attempted / succeeded / failed separate via `ok`/`resultKind`.
  Keep an "unknown/retired" bucket for trace names absent from today's registry.
- ⚠️ Still open (Codex C-2): `assistant_confirmation` needs an explicit executed/succeeded status
  filter and a dedup key. Confirm its lifecycle before grouping it.
**Verification:** `npm run measure:assistant-tools` from the main checkout prints a table where the
row count equals `ALL_TOOLS.length` (96) and every registry tool is represented.

### Unit 2: Pin the `metadata.trace.toolCalls` shape

**Goal:** Stop a silent data-loss regression in the structure both replay and Unit 1 now depend on.
**Files:** `test/assistant-trace-shape.test.ts` (new)
**Approach:** `src/lib/assistant/replay.ts:59` degrades a whole message to text-only if *any* entry in
`toolCalls` lacks a string `id` or `name` — silently. Nothing tests that today, and Unit 1 gives the
same structure a second consumer. Add a test asserting the persisted shape: a trace produced by a real
`runAssistant` tool call round-trips through `replayableCalls` without degrading, and each entry carries
`id`, `name`, `input`, `resultPreview`, `resultKind`.
**Tests:** this unit is the test.
**Depends on:** none
**Verification:** `npx vitest run test/assistant-trace-shape.test.ts`; then mutate one field name locally
and confirm it fails.

### Unit 3: Move routing rules from the prompt into tool descriptions

**Goal:** Put the disambiguation guidance where the model reads it and where the evals can see it.
**Files:** `src/lib/assistant/prompt.ts`, plus the tools each *boundary* rule governs —
`query-cellar-contents.ts`, `query-materials.ts`, `log-brix.ts`, `record-measurement.ts`,
`record-tasting-note.ts`, `create-material.ts`, `receive-consumable.ts`, `db-find.ts`.
(`query-spray-decision.ts` and `query-field-reports.ts` are no longer touched — their rule stays put.)
**Approach:** Boundary rules only — apply the boundary-vs-composition test above before touching a rule.
One commit per rule so a regression bisects cleanly. Each rule moves to the description of the tool it
steers work *toward*, phrased in the established "use this / do NOT use X for this" form already at
`query-measurements.ts:187`.

Two rules are bidirectional (Brix routing, tasting-note routing) and need a sentence on *both* tools,
matching how `log-brix.ts:23` and `record-measurement.ts:91` already mirror each other. **Each side states
its own scope and points away — "use this for X; for Y use Z" — and never restates Z's full rule**
(council DQ3: two copies of the same explanation drift apart in later PRs).

**The disease/pest rule does NOT move (council C1).** "Consult BOTH `query_spray_decision` AND
`query_field_reports`, then combine" is a composition rule. Split across two descriptions, a model asked
"what did the scout see?" reads `query_field_reports`, decides it satisfies the request, and never learns
it also owed a latent-infection check — producing a confident "no disease recorded" that is wrong in the
one direction that costs a crop. It stays in `prompt.ts` verbatim.

Leave in the prompt anything that is not a boundary rule: card semantics, unit handling, formatting, the
never-issue-a-work-order rule, and the disease/pest composition rule.
**Tests:** a new `test/assistant-tool-routing-descriptions.test.ts` modelled on
`test/knowledge-tool-description.test.ts` — one assertion per moved rule, pinning the phrase that
carries the routing so it cannot be silently dropped in a future description edit.
**Depends on:** Unit 0 (the baseline is meaningless until the evals read the real prompt)
**Execution note:** capture the eval baseline BEFORE the first commit.
**Verification:** `ASSISTANT_EVAL=1 npm run eval:assistant` and `ASSISTANT_EVAL=1 npm run eval:assistant-must-propose`
run before and after, both numbers recorded in the PR body. Tool-selection accuracy must be >= baseline.
Plus `npx vitest run` and `npm run verify:ai-native`.

### Unit 4: Constrain the `db_*` `entity` parameter

**Goal:** Make an invalid entity impossible to pass rather than recoverable after a failed call.
**Files:** `src/lib/assistant/entities.ts`, `tools/db-find.ts`, `tools/db-create.ts`,
`tools/db-update.ts`, `tools/db-delete.ts`
**Approach:** Add capability-filtered name helpers beside `allowedEntityNames()` — findable, creatable,
editable, deletable — each derived from the *same* predicate its `db_*` tool already checks at runtime
(`db-create.ts:42-45`, `db-update.ts:43-45`, `db-delete.ts:32-35`). Each tool's `inputSchema.entity`
becomes `{ type: "string", enum: <its own list>, description: … }`. Keep the existing runtime check and
its error message: the enum is a narrowing, not a replacement, and a model can still emit an
out-of-enum value.
**Hazard (Codex S-4 corrected this — the failure mode is not what the plan first said).**
`test/assistant-db-create-dedup.test.ts:34` and `test/assistant-db-update-resolve.test.ts:52` mock the
entities module **partially**. Hoisting is not the problem: the mocks simply do not provide the new
helpers, so a module-init enum fails with **"not a function"**, not with a stale value. Extend both mock
factories with every helper the imported module evaluates.
**Also in scope (Codex S-5 — a pre-existing bug the enum alone does not fix).** `db-create.ts:44` and
`db-update.ts:45` interpolate `allowedEntityNames()` into their error text, so the message advertises
all 8 entities as creatable/editable including ones the guard just rejected. Switch both to the
capability-filtered helpers.
**Behaviour change to test deliberately (Codex DQ-6):** `getEntity` is case-insensitive; a JSON Schema
`enum` is not. Keep the canonical spellings in the enum AND keep the case-insensitive runtime fallback,
and add a test pinning that combination.
**Do NOT** substitute `fields.length > 0` for the property-truthiness predicates — it differs from the
runtime check. Add a registry test asserting each capability list is non-empty and unique.
**Tests:** for each of the four tools, assert its enum is exactly the set of entities its runtime check
accepts — iterate every entity in `ENTITIES`, run the tool's capability predicate, and assert
membership agreement in both directions. This is the assertion that makes the test meaningful rather
than tautological.
**Depends on:** none
**Verification:** `npx vitest run` green; structural half of `assistant-tools.eval.test.ts` green
(it type-checks golden args against `inputSchema`, so a wrong enum surfaces there).

## Test Strategy

**Unit tests:** `test/` with vitest, matching existing assistant test style. Three new files:
trace-shape, routing-descriptions, and the enum-agreement assertions folded into the existing
`assistant-db-*` tests where they already have entity fixtures.

**Integration:** none new. The structural eval layer already integration-tests golden↔registry consistency
on every PR and will exercise the new enums for free.

**Manual verification:** in the Demo Winery tenant only (never Bhutan), run the utterances behind the
moved rules through the chat and confirm the tool actually selected matches the rule's intent — at
minimum: "how many cases of X are in the tasting room" → `query_cellar_contents`, "how much DAP is left"
→ `query_materials`, "log 10.5 Brix on tank T4" → `record_measurement` not `log_brix`, "do we have any
disease anywhere" → both `query_spray_decision` and `query_field_reports`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Moving rules changes prod model behaviour, and no PR-gated test catches behavioural regressions | MED | HIGH | Before/after `ASSISTANT_EVAL=1` baseline recorded in the PR; one commit per rule so a bad rule bisects; nightly must-propose job opens an issue within 24h |
| A rule loses meaning out of prompt context (it referenced sibling rules) | MED | MED | The disease/pest and consumables-routing rules are the two that cross tools — handle each as a paired edit, not a cut-and-paste |
| Enum narrows something that was working (an entity passed today that fails the capability predicate) | MED | MED | Derive the enum from the same predicate as the runtime check, so the enum can only ever match what already succeeded. Unit 1's data shows whether any `db_*` call used an entity outside it |
| `vi.mock` hoisting vs module-init enum construction breaks two existing tests | MED | LOW | Named as a hazard in Unit 4; lazy schema construction is the fallback |
| PII leaks into the committed usage artifact | LOW | HIGH | Artifact carries counts only, no emails/ids/utterances; stated in Unit 1 |
| Prompt-cache bust from editing `prompt.ts` | HIGH | LOW | One-time re-cache. The file's own comment flags cache-friendliness as the reason wording is stable; accepted cost |
| Measurement window is too short to be meaningful (single-winery volume) | MED | MED | Report first/last-seen and total turn count alongside; if the sample is thin, say so in the artifact rather than pruning on it |
| **Unit 1a adds an awaited DB write to the assistant hot path, which is already hitting a serverless ceiling** | MED | HIGH | Batched to ONE `createMany` per MODEL TURN (not per tool call) at `run.ts:204`, so typically 1–3 writes per user turn. `logCalculation` already does an awaited per-call write on the same path, so the precedent exists. Measure turn latency before/after on Demo Winery; if it regresses, move to fire-and-forget and accept a weaker guarantee |
| **Unit 1a edits `run.ts`, which PR #581 also edited — #581 is MERGED and this branch is 2 commits behind** | HIGH | MED | ✅ Collision resolved by the merge, but `claude/upbeat-vaughan-4c914c` does **not** yet contain #581's `run.ts` (+38) / `route.ts` (+25). **Rebase onto `origin/main` BEFORE writing Unit 1a**, or the insertion point at `run.ts:204` is wrong and the deadline logic gets clobbered. This is the #571 lesson: rebase early, do not let a stale branch age |
| A logging failure breaks a chat turn | LOW | HIGH | try/catch swallow + no-tenant skip, copied verbatim from `logCalculation`; an explicit test throws from the logger and asserts the turn still answers |
| TENANT-3 lazy-`PrismaPromise`: the write lands on the wrong tenant | MED | HIGH | `await` INSIDE the `runAsTenant` callback (closed bug #531). The tenant-isolation test case is the guard |
| A future edit adds an argument/result column and quietly makes the table a PII store | MED | HIGH | Schema test in the style of `test/commerce7-schema.test.ts` fails on any PII-capable column |
| A future reader cites the usage artifact to prune a **seasonal** tool that is simply out of season | MED | HIGH | Unit 1 buckets by month, declares its trace span, and stamps `seasonal: protected` under a 12-month window. This is the single most dangerous downstream misuse of this plan's output |
| Unit 0 moves the eval pass rate on its own, so the "before" number is not comparable to history | HIGH | LOW | Expected and intended — the model is newly seeing ten rules it never had. Record it as a new baseline, do not compare across the Unit 0 boundary |
| A rule is misclassified as boundary when it is really composition, and gets moved | LOW | HIGH | The boundary-vs-composition test is written into the unit; the only known composition rule is named explicitly and excluded. Any future rule move must state its classification in the PR |

## Success Criteria

- [ ] `test/evals/assistant-tools.eval.test.ts` and `assistant-fleet.eval.test.ts` call `buildSystemPrompt()`, not a hardcoded string
- [ ] `npm run measure:assistant-tools` produces a 96-row table, every registry tool represented, zeros explicit
- [ ] The usage artifact buckets by month, declares its trace span, and stamps `seasonal: protected` if that span is under 12 months
- [ ] The usage artifact reports `db_find`/`db_create` fallback counts so a zero can be read correctly
- [ ] `assistant_tool_call` exists with RLS ENABLE+FORCE, a `tenant_isolation` policy with USING **and** WITH CHECK, an FK to `organization(id)` ON DELETE RESTRICT, and **`REVOKE UPDATE, DELETE, TRUNCATE` FROM app_rls** (a bare GRANT is not enough)
- [ ] The table has **no column capable of holding user free text**, enforced by a schema test
- [ ] The attempt row is written **before** dispatch, batched per model turn, and proven by an ordering assertion — not merely "a row exists"
- [ ] A thrown logging error still returns a normal chat answer (explicit test)
- [ ] `npm run verify:tenant-isolation` covers the new table
- [ ] Demo Winery turn latency measured before/after Unit 1a, and recorded
- [ ] Any report over the LEGACY trace carries the three-loss caveat verbatim and is labelled a historical annex
- [ ] Trace counts and `assistant_confirmation` counts are reported as two separate metrics, never summed
- [ ] `bigint` counts are normalized before serialization (a `JSON.stringify` of a raw `COUNT` throws)
- [ ] The SQL projects only name/bucket/counts/extrema — raw `metadata` never reaches the pure function
- [ ] `db_create`/`db_update` error messages name the capability-filtered set, not all 8 entities
- [ ] The committed usage artifact contains no emails, user ids, or utterance text
- [ ] Every **boundary** rule removed from `prompt.ts` exists in a tool description and is pinned by a test
- [ ] The disease/pest composition rule is still in `prompt.ts`, unchanged, and a test asserts it is there
- [ ] `prompt.ts` retains all non-boundary guidance (cards, units, formatting, work-order policy, composition rules)
- [ ] All four `db_*` tools expose an `entity` enum that provably equals their runtime-accepted set
- [ ] `ASSISTANT_EVAL=1 npm run eval:assistant` tool-selection accuracy >= the recorded pre-change baseline
- [ ] `npm run verify:ai-native` green and `docs/architecture/assistant-coverage.md` regenerated
- [ ] `npx vitest run` green
- [ ] No new Prisma model, migration, or RLS policy in the diff

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | The 96-vs-~40 gap and the ten prompt rules are both directly observed in the code |
| Scope Boundaries | HIGH | Research collapsed the ambiguous part (logging) into "already done" |
| Implementation Units | HIGH | Units 1, 2, 4 are mechanical. Unit 3 is prose surgery with a test per rule |
| Test Strategy | MEDIUM | The structural layer is solid. Behavioural coverage depends on a live-API eval that is not PR-gated — the baseline is a mitigation, not a gate |
| Risk Assessment | MEDIUM | The behavioural risk of Unit 3 is real and only partly testable in CI. It is reversible, which is the main comfort |

The one LOW-adjacent item is behavioural testing. What would raise it: making the tool-selection eval
PR-gated on a cheap model. That is worth its own decision and is deliberately not smuggled into this plan.
