---
name: assistant-coverage-interview
description: >
  Interview the winemaker to define an AI-assistant write tool for one app capability, then emit a
  build-ready spec: the tool plan (which core it wraps), golden eval case(s), and a loop stop-condition.
  Use when adding assistant/MCP coverage for a feature — "add the assistant tool for additions",
  "make the assistant able to do X", working the assistant-coverage backlog, or the go-forward
  "assistant step" after shipping a feature. The judgment (what passes / stops / is refused) comes from
  the user; the formalization is yours.
---

# Assistant coverage interview

Turn one capability into an assistant write tool the right way: **judgment upstream (from the user),
typing downstream (a loop).** You produce the spec + evals + stop-condition; a `/work` run or `/loop`
builds against it. You are NOT allowed to invent the pass/refuse conditions on anything touching the
ledger, tenancy, compliance, or cost — those come from the user (no grading your own homework).

## 0. Orient (do this first, silently)

1. Read `docs/architecture/assistant-coverage.md`. If the user named a capability, use it; else propose
   the top uncovered Wave-1 item and confirm.
2. Read the **core** that capability wraps (the `*Core` named in the matrix) — its input type, its
   guards/throws, and which `verify:*` script proves it. The core already owns the domain invariants; the
   tool must call it, never re-implement or route around it via `db_*`.
3. Read one existing tool of the same kind as a template: a write tool + its `Committer`
   (`src/lib/assistant/tools/log-brix.ts`, `rack-wine.ts`), `signProposal` in `confirm.ts`, entity
   resolution in `tools/resolve.ts` / `scope.ts`, and the `AssistantTool` type in `registry.ts`.
4. Read `test/evals/assistant-write-tools.golden.ts` for the golden shape `{ utterance, tool, args, note? }`.

## 1. Interview the user (the heart)

Ask these as plain questions (batch with AskUserQuestion where it helps). Keep them about the
**assistant surface**, not the domain math — `verify:*` already proves the core is correct. Messy,
conversational answers are fine; you formalize them.

1. **Phrasings.** "How would a cellar hand say this out loud / type it?" Collect 3–6 real utterances,
   including a terse one and one with optional details.
2. **Args + required.** "What's the minimum to act? What's optional?" Identify the entity to resolve
   (lot / vessel / block / material) and its NL name form.
3. **Stop-and-ask (clarify).** "When should it NOT just do it — when should it ask you first?" e.g. two
   lots share a name, a required field is missing, the volume/amount is implausible.
4. **Refuse outright.** "What must it flat-out refuse?" e.g. dosing a non-additive material, saignée on a
   non-MUST lot, an over-draw, a cross-tenant target. Tie each to the core's guard where one exists.
5. **Confirmation preview.** "Before it commits, what should the confirmation say so you can trust it in
   one glance?" (This is the `signProposal` preview text.)
6. **Admin-only?** Should any user do this, or only an admin/foreman (`adminOnly`)?

For anything that touches the ledger/tenancy/compliance/cost, **you draft the stop/refuse conditions,
the user tightens them.** Read the drafted conditions back and get an explicit yes.

## 2. Emit the spec (write these artifacts)

1. **Tool spec** (append to the capability's plan file, or a short `docs/plans/…-assistant-<cap>.md`):
   tool `name`, `kind` (usually `write`), `adminOnly?`, the NL `inputSchema` args, the **core it calls**,
   the confirmation preview text, and the resolve strategy for each entity. State plainly: *this tool maps
   intent → `<Core>` args + confirm gate; it re-implements nothing.*
2. **Golden case(s)** — add to `test/evals/assistant-write-tools.golden.ts`: every happy-path utterance
   from step 1.1, plus (as a `note`) the expected clarify/refuse behavior for the step 1.3/1.4 cases the
   golden format can express. This is what makes the coverage guard pass — without it, CI reds.
3. **Persist the judgment durably** so later loops aren't amnesiac: record the refuse/stop rules as an
   architecture decision (`/decision` or the decision ledger) and, if it's a hard invariant, a note under
   `docs/architecture/invariants/`. The golden `note` fields carry the lighter cases.
4. **Flip the row** in `docs/architecture/assistant-coverage.md` to 🟨 (spec ready) → ✅ (built + evals).

## 3. Define the stop condition (for the build loop)

Write an explicit, machine-checkable "done" the loop can't fake:
- `npx tsc --noEmit` clean;
- the capability's own `verify:*` script green (the core's domain proof — unchanged by the tool);
- `npx vitest run test/evals/assistant-tools.eval.test.ts` green — i.e. the **structural coverage guard
  passes** (the new tool has its golden case) and every golden arg matches the real `inputSchema`;
- optionally `npm run eval:assistant` (gated LLM eval) green before merge;
- the tool calls `<Core>` and imports **no** `db_*` generic write.

## 4. Hand off

Summarize the spec + stop-condition and offer to `/work` it (or set up a `/loop` if batching several
capabilities). The build is mechanical against this spec; your review returns at the milestone —
confirmation legibility and disambiguation quality are human-judged, not loop-checkable.

## Guardrails

- **Never** let the model (you) author the refuse/stop conditions for ledger/tenancy/compliance/cost —
  source them from the user, draft-then-tighten.
- **Always** route the tool through the existing `*Core`; the generic `db_*` tools are not a domain-write
  path (see the coverage doc's cross-cutting risk).
- **Always** add the golden case in the same change as the tool, or the coverage guard (TRIP-AI-EVAL)
  fails CI — that's intended.
- One capability at a time. Breadth comes from repeating this, not from a mega-tool.
