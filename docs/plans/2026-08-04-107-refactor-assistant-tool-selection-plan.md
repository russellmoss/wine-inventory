---
title: Assistant tool selection — measure what's used, then sharpen the surface
type: refactor
status: draft
date: 2026-08-04
branch: refactor/assistant-tool-selection
depth: standard
units: 5
council: docs/plans/council-feedback-107-assistant-tool-selection.md
---

> **Revised 2026-08-04 after council review.** Gemini raised four criticals; three were accepted and
> changed this plan (composition rules stay in the prompt, the measurement must bucket by month, and a
> new Unit 0 fixes the eval harness first). One was rejected and recorded. Codex did not run — the
> type-safety / Prisma lens on Units 1 and 4 is **un-cross-validated**. Details in the council doc.

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

### Unit 1: Measure tool usage from data that already exists

**Goal:** A repeatable, read-only report of which of the 96 tools are actually invoked, by how many
distinct people, over what window — covering reads and writes.
**Files:** `scripts/measure-assistant-tool-usage.ts`, `package.json` (add `measure:assistant-tools`),
`docs/architecture/assistant-tool-usage.md` (generated artifact)
**Approach:** Two aggregations behind one `runAsSystem` entry point, since this is deliberately
cross-tenant. (a) Unnest `assistant_message.metadata->'trace'->'toolCalls'` and count by `->>'name'`,
with distinct-conversation and distinct-owner counts and first/last-seen timestamps. (b) Group
`assistant_confirmation` by tool. Join both against `ALL_TOOLS` from the registry so tools with **zero**
invocations appear as explicit zero rows — the zeros are the finding. Keep the aggregation logic in a
pure exported function so it can be unit-tested without a database.
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
**Hazard:** `test/assistant-db-create-dedup.test.ts:34` and `test/assistant-db-update-resolve.test.ts:52`
mock `allowedEntityNames` at module level. Building an enum at module-init interacts with `vi.mock`
hoisting — if the enum is captured eagerly at import, verify those mocks still take effect, and fall back
to building the schema lazily if not.
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
| A future reader cites the usage artifact to prune a **seasonal** tool that is simply out of season | MED | HIGH | Unit 1 buckets by month, declares its trace span, and stamps `seasonal: protected` under a 12-month window. This is the single most dangerous downstream misuse of this plan's output |
| Unit 0 moves the eval pass rate on its own, so the "before" number is not comparable to history | HIGH | LOW | Expected and intended — the model is newly seeing ten rules it never had. Record it as a new baseline, do not compare across the Unit 0 boundary |
| A rule is misclassified as boundary when it is really composition, and gets moved | LOW | HIGH | The boundary-vs-composition test is written into the unit; the only known composition rule is named explicitly and excluded. Any future rule move must state its classification in the PR |

## Success Criteria

- [ ] `test/evals/assistant-tools.eval.test.ts` and `assistant-fleet.eval.test.ts` call `buildSystemPrompt()`, not a hardcoded string
- [ ] `npm run measure:assistant-tools` produces a 96-row table, every registry tool represented, zeros explicit
- [ ] The usage artifact buckets by month, declares its trace span, and stamps `seasonal: protected` if that span is under 12 months
- [ ] The usage artifact reports `db_find`/`db_create` fallback counts so a zero can be read correctly
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
