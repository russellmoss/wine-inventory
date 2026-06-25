---
title: In-App AI Assistant — Phase 1 (chat panel, read + confirmed-write tools)
type: feat
status: completed
date: 2026-06-25
branch: feat/assistant-chat
depth: standard
units: 6
---

## Overview

Add an in-app chat assistant so winery staff can ask questions and make changes in plain
English instead of hunting through forms: "what's the latest brix on Block 3?", "log 22.4
brix for Block 3", "who changed the Marp Reserve inventory?". It runs server-side on
`@anthropic-ai/sdk` (`claude-opus-4-8`, key already in `.env`) with a multi-turn tool-use
loop whose tools wrap the app's existing, already-audited server actions. This is Phase 1 of
the APPROVED design doc (`~/.rstack/projects/wine-inventory/russe-feat-weekly-field-notes-design-20260625-065936.md`):
in-app chat only. MCP server, the `/sync-mcp` skill, vessel racking, and the interactive
weekly report are explicit follow-ups.

## Problem Frame

Every mutation today lives behind a different form/view; managers in the field want to log a
brix reading or check a yield from their phone in one sentence. The data and the safe write
paths already exist (`logBrix`, `recordYieldEstimate`, `moveStock`, plus scoped read
functions and `AuditLog`). What's missing is a natural-language front door. Do nothing and
the app stays form-bound; the audit data that already answers "who changed X?" stays
un-askable. The risk to manage: an LLM must never bypass auth, scoping, validation, or audit,
and must never silently commit a misparsed write.

## Requirements

- MUST: A chat panel inside the app, gated to logged-in staff, that streams Claude responses.
- MUST: Read tools — `query_brix`, `query_yield`, `query_vineyard_status`, `query_audit`
  (who-changed). Reads execute without confirmation.
- MUST: Write tools — `log_brix`, `set_yield_estimate`, `adjust_inventory` — that NEVER commit
  on first call. They return a human-readable preview; the user explicitly confirms before any
  DB change.
- MUST: Every tool calls existing server actions / scoped read functions. No raw Prisma writes
  in the tool layer; no raw SQL the existing code doesn't already use.
- MUST: Manager scoping enforced in the handler layer, never trusted to the model. Managers
  see/affect only their `assignedVineyardId`; admins see all.
- MUST: Every confirmed write produces an `AuditLog` row identical to the form path (free,
  because we call the real action).
- MUST: `query_audit` is admin-only (matches the existing `/audit` page gate).
- SHOULD: The tool-use loop is hard-capped (MAX_TURNS), surfaces tool errors back as
  `tool_result` `is_error`, and handles `refusal`/`pause_turn`/`end_turn` correctly.
- SHOULD: Confirm tokens are single-use and short-TTL so a stale/double confirm can't
  double-apply (critical for `adjust_inventory`, which applies a delta).
- NICE: Streamed "thinking"/typing aff; conversation kept in component state (stateless server).

## Scope Boundaries

**In scope:** the `src/lib/assistant/` shared core (registry, loop, confirm, tools), the
`/api/assistant` + `/api/assistant/confirm` routes, the `(app)/assistant` chat UI + nav entry,
7 tools over existing actions, manager/admin gating, pure-logic tests.

**Out of scope (follow-ups, see end):** `rack_wine` and the net-new vessel-to-vessel racking
action (design "Phase 0"); the MCP server and the `action()`→`fooImpl(ctx)` actor refactor it
needs (design "Phase 2"); the `/sync-mcp` self-updating skill; the interactive weekly
`FieldNote` fill-in; the action/DB integration test harness (`TODOS.md`); cross-vineyard
free-text analytics beyond the existing scoped read functions.

## Research Summary

### Codebase Patterns
- **Action wrappers** — `src/lib/actions.ts:35-52`: `action()`/`adminAction()` inject
  `ctx = { user, actor:{ actorUserId, actorEmail } }` from the session via
  `getActionUser()`; `ActionError(message, code)` in `src/lib/action-error.ts`.
- **Write actions to wrap** — `logBrix(blockId, brixValue, recordedAt?)`
  (`src/lib/harvest/actions.ts:85`, typed, validates 0–35 °Bx via `requireBlockAccess`);
  `recordYieldEstimate(blockId, estimate, unit, vintageYear)` (`:120`, typed, `toKg`+upsert);
  `moveStock(formData)` (`src/lib/inventory/actions.ts:74`) — ADJUST mode reads
  `kind|itemId|locationId|delta|reason` from `FormData`, delegates to `adjustStock`
  (`src/lib/stock/movements.ts:123`). FormData adapter needed only here.
- **Scoped read functions (reuse directly — they self-enforce scope)** —
  `getLatestBrixByBlock(vineyardId)` (`src/lib/harvest/actions.ts:263`),
  `getBlockBrixHistory(blockId)` (`:245`), `getVineyardHarvest(vineyardId)` (`:287`); each
  calls `requireVineyardScope`/`requireBlockAccess` (`:438`, `:71`) internally.
- **Audit read** — `src/app/(app)/audit/page.tsx:16-29`: `requireAdmin()` then
  `prisma.auditLog.findMany({ where, orderBy:{createdAt:'desc'}, take })`; filter fields
  `entityType`, `actorEmail { contains, mode:'insensitive' }`. Schema
  `prisma/schema.prisma:520`.
- **Auth/scoping** — `getCurrentUser()` (`src/lib/dal.ts:56`), `canManagerAccessVineyard`
  (`src/lib/access.ts:31`), `AppUser` has `role` (`"admin"|null`) + `assignedVineyardId`.
- **Route conventions** — `src/app/api/field-notes/[id]/summarize/route.ts`:
  `export const runtime="nodejs"; export const maxDuration=60;`, `getCurrentUser()` 401 gate,
  `canManagerAccessVineyard` 403 gate, `after()` for async work, `Response.json`.
- **Claude single-shot precedent (NOT the loop)** — `src/lib/fieldnotes/ai.ts`: one
  `messages.create` with `output_config` structured output. Reuse client/key/model boilerplate
  only.
- **UI** — nav groups in `src/components/AppShell.tsx:12-35` (admin filter `:111`); layout
  `src/app/(app)/layout.tsx` wraps `requireReadyUser()`; components in `src/components/ui/`
  (`Button`, `Card`, `Badge`, `Input`, `ConfirmButton`, `Modal`); tokens in
  `src/styles/tokens/*.css` (`--wine-primary #722F37`, `--surface-raised`, `--radius-md`,
  `--space-*`, `--font-body` Inter). DESIGN.md governs.

### Prior Learnings
- No rstack learnings file or context-ledger entries exist for this project yet (both empty).
  The APPROVED design doc is the governing artifact; its "Reviewer Concerns" section already
  corrected four overstated reuse claims (no racking action; `transferGroupId` ≠ racking;
  MCP actor needs refactor; `ai.ts` is structured-output not a loop).
- Decisions made while building SHOULD be recorded in `.context-ledger` (currently empty).

### External Research (claude-api skill, verified against installed SDK)
- Tool def: `{ name, description, input_schema }` (`Anthropic.Tool`); pass top-level `tools`.
  Be prescriptive about WHEN to call. Optional `strict:true` + `additionalProperties:false`.
- Manual loop: on `stop_reason==="tool_use"`, push the **full** `response.content` (keeps the
  `tool_use` blocks), execute each block, return **all** `tool_result` blocks in a **single**
  user message (`tool_use_id`, `content`, `is_error` on failure), loop until `end_turn`. Cap
  with `MAX_TURNS`. Handle `pause_turn` (resend) and `refusal` (don't index empty content).
- Streaming: `client.messages.stream({...})`, `stream.on("text", …)`, then
  `await stream.finalMessage()` to read `stop_reason`/content. Don't hand-roll completion.
- Opus 4.8 gotchas: `thinking:{type:"adaptive"}` only (no `budget_tokens`); NO
  `temperature/top_p/top_k`; no last-assistant prefill; `output_config` is separate from the
  tool loop; `tool_choice` default `auto` for open-ended chat. `max_tokens` ~16k non-stream /
  ~64k stream. Catch typed errors (`RateLimitError`→`APIError`), most-specific first.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Tool execution boundary | Tools call existing server actions / scoped reads only | Raw Prisma in tools | Inherits auth, validation, transactions, audit, scoping for free |
| Write confirmation | Two-phase: write tool returns preview + signed single-use TTL token; a dedicated confirm path verifies, burns the token, then calls the real action | Auto-apply writes; pure client-side confirm with no token | Confirm-before-write was a confirmed premise; token + burn prevents double-apply of deltas in serverless where in-memory single-use is unreliable |
| Single-use guarantee | New `AssistantConfirmation` nonce row marked used in a txn before commit | In-memory set (lost on cold start); rely on button-disable only | `adjust_inventory` applies a signed delta; double-commit corrupts stock |
| Streaming transport | SSE/`ReadableStream` from the route; client reads deltas + structured events (text, tool-status, proposal, done) | Non-streaming 202+poll like summarize route | Chat needs live text; loop fits inside `maxDuration=60` with a turn cap |
| `query_audit` access | Admin-only | Manager-scoped audit | Mirrors existing `/audit` page gate; manager audit scoping is a later refinement |
| Read scoping | Reuse the existing scoped read fns; add `scopedVineyardFilter(actor)` + name→id resolver for tools that don't already scope | Re-implement queries in tool layer | Existing fns already enforce `requireVineyardScope`; less code, no scope gaps |
| Vineyard/variety/block resolution | Tools accept names; a resolver maps "Cab"/"Marp" → ids, asking the user to disambiguate on ambiguity | Force the model to pass ids | Users speak names; keep resolution deterministic, not model-trusted |

## Implementation Units

### Unit 1: Vertical slice — tool-use loop + `query_brix` + minimal chat (de-risk)

**Goal:** Prove the end-to-end agentic loop with one read tool and a streamed answer before
adding breadth. This retires the single biggest risk (the net-new loop).
**Files:**
- `src/lib/assistant/registry.ts` (create) — `ToolKind = "read"|"write"`; `ToolContext`
  `{ user: AppUser }`; `ToolDef { name, description, kind, inputSchema, run(ctx,input) }`;
  empty-ish registry exporting an array + `getToolsFor(user)` (filters by role).
- `src/lib/assistant/run.ts` (create) — the streaming manual loop (model `claude-opus-4-8`,
  `MAX_TURNS`, system prompt stub, `tools` from registry, `stop_reason` handling, single
  `tool_result` user message, typed error catch). Emits an async event stream
  (text deltas, tool-status, done) for the route to forward.
- `src/lib/assistant/tools/query-brix.ts` (create) — wraps `getLatestBrixByBlock` /
  `getBlockBrixHistory`; resolves block/vineyard via a minimal resolver (inline for now).
- `src/app/api/assistant/route.ts` (create) — `runtime="nodejs"`, `maxDuration=60`,
  `getCurrentUser()` 401 gate, body `{ messages }`, returns a streamed `Response`.
- `src/app/(app)/assistant/page.tsx` (create) — server component, `requireReadyUser()`,
  renders the client chat.
- `src/app/(app)/assistant/AssistantChat.tsx` (create) — client: input, message list,
  consumes the stream. Minimal styling.
- `src/components/AppShell.tsx` (modify) — add an `Assistant` nav entry.
**Approach:** Model `run.ts` on the claude-api manual streaming loop (research §2-3). Borrow
client/model/env boilerplate from `ai.ts` only. Keep the system prompt minimal in this unit;
hardened in Unit 5. Stream via `ReadableStream`; define a tiny event protocol
(`{type:"text"|"tool"|"proposal"|"error"|"done", ...}`) the client parses.
**Tests:** none required to land the slice; manual verification is the gate. (Pure-logic tests
arrive in Unit 6.)
**Depends on:** none
**Verification:** `npm run dev`, open `/assistant`, ask "what's the latest brix for
<a real block>?" → streamed answer with the correct value; ask as a manager for another
vineyard's block → scoped-out / not found.

### Unit 2: Remaining read tools + scoping/resolution helpers

**Goal:** Full Phase-1 read coverage, with one shared scoping helper and one shared resolver.
**Files:**
- `src/lib/assistant/scope.ts` (create) — `scopedVineyardFilter(user)` (admin → all;
  manager → `{ vineyardId: user.assignedVineyardId }`); `resolveVineyard/Variety/Block(name,
  user)` returning id or an ambiguity/he-not-found signal.
- `src/lib/assistant/tools/query-yield.ts` (create) — wraps `getVineyardHarvest`; aggregates
  per block/variety/vineyard within scope.
- `src/lib/assistant/tools/query-vineyard-status.ts` (create) — composes vineyard + blocks +
  latest brix + harvest into a status summary (scoped).
- `src/lib/assistant/tools/query-audit.ts` (create) — **admin-only**; `auditLog.findMany`
  filtered by resolved `entityType`/`entityId`/`actorEmail`; returns who/when/summary.
- `src/lib/assistant/registry.ts` (modify) — register the three (audit gated to admin via
  `getToolsFor`).
**Approach:** Reuse the scoped read fns (they already enforce scope). `query_audit` mirrors
`audit/page.tsx` query. The resolver is deterministic (DB lookup), not model-trusted; on
ambiguity it returns options for the model to ask about.
**Tests:** deferred to Unit 6 (resolver + scope filter are pure-ish and get unit tests).
**Depends on:** Unit 1
**Verification:** manual — "yield of Block 2", "status of <vineyard>", and (as admin) "who
changed <entity>?" all return correct, scoped data; manager asking `query_audit` is refused.

### Unit 3: Confirm protocol infrastructure

**Goal:** A signed, single-use, short-TTL confirmation mechanism so writes can be previewed
then committed exactly once.
**Files:**
- `src/lib/assistant/confirm.ts` (create) — `signProposal(payload)` → token (HMAC over
  `{tool, args, exp, nonce}` using a server secret, e.g. `BETTER_AUTH_SECRET`);
  `verifyProposal(token)` → payload or throws on bad sig / expiry.
- `prisma/schema.prisma` (modify) — `AssistantConfirmation { id, nonce @unique, usedAt,
  createdAt }` (or equivalent) to enforce single-use.
- `src/app/api/assistant/confirm/route.ts` (create) — `runtime="nodejs"`, `getCurrentUser()`
  gate, body `{ token }`: verify → in a txn, insert/mark the nonce used (fail if already
  used) → call the resolved server action with the payload args → return result JSON.
**Approach:** Token is stateless-signed for integrity + TTL; the nonce row is the single-use
guard (insert-if-absent; reject on conflict). The confirm route is the ONLY commit path; it
calls the real `action()` so auth/scope/audit re-run server-side. Migration via
`npm run db:migrate` (handled by /work, not here).
**Tests:** Unit 6 covers sign/verify/expiry/tamper.
**Depends on:** Unit 1
**Verification:** unit tests green; manually POST a forged/expired/replayed token → rejected.

### Unit 4: Write tools (preview-only) + client confirm card

**Goal:** `log_brix`, `set_yield_estimate`, `adjust_inventory` propose-then-commit through the
confirm protocol; the chat renders a confirm card.
**Files:**
- `src/lib/assistant/tools/log-brix.ts`, `set-yield-estimate.ts`, `adjust-inventory.ts`
  (create) — each `kind:"write"`; on call, resolve + validate args (reusing the same range
  checks the actions enforce), then return `{ needsConfirmation:true, preview, token }`
  WITHOUT mutating. `adjust-inventory` builds the `FormData` payload (`kind|itemId|locationId|
  delta|reason`) into the signed args.
- `src/lib/assistant/commit.ts` (create) — maps a verified proposal `{tool,args}` → the real
  action call (`logBrix(...)`, `recordYieldEstimate(...)`, `moveStock(formData)`), used by the
  confirm route.
- `src/app/(app)/assistant/AssistantChat.tsx` (modify) — render a proposal as a confirm card
  (reuse `ConfirmButton`); on confirm POST `/api/assistant/confirm`, show result, optionally
  send a follow-up turn so the assistant acknowledges.
- `src/lib/assistant/registry.ts` (modify) — register the three write tools.
**Approach:** Write tools are proposal generators; the model relays the preview; the human
clicks Confirm; the confirm route burns the token and commits. The model never holds the
commit authority. Previews state exactly what will change ("Log 22.4 °Bx to Block 3 — Marp,
recorded today").
**Tests:** Unit 6 covers the FormData adapter + arg validation.
**Depends on:** Units 2, 3
**Verification:** manual — "log 22.4 brix for Block 3" → preview card → Confirm → a new
`BrixLog` row + `AuditLog` row identical to the form path; declining commits nothing;
confirming twice (replay) is rejected.

### Unit 5: System prompt, gating, and loop hardening

**Goal:** Make the assistant safe, scoped, and pleasant; finalize which tools each role sees.
**Files:**
- `src/lib/assistant/prompt.ts` (create) — system prompt: capabilities, the read-free/
  write-confirm rule, scoping rules ("you only see the user's permitted data"), instruction to
  ask for disambiguation, and to refuse out-of-scope/destructive requests (e.g. racking — not
  available yet).
- `src/lib/assistant/run.ts` (modify) — wire the prompt; enforce `MAX_TURNS`; map tool throws
  to `tool_result is_error`; handle `refusal`/`pause_turn`; typed error → friendly stream
  error.
- `src/lib/assistant/registry.ts` (modify) — `getToolsFor(user)` excludes `query_audit` for
  non-admins; (write tools available to managers within scope).
- `src/app/(app)/assistant/AssistantChat.tsx` (modify) — loading/streaming/error/empty states,
  proposal card, message styling per DESIGN tokens (`--surface-raised`, `--radius-md`,
  `--wine-primary`, `--space-*`, `--font-body`).
**Approach:** Prompt is frozen for cache stability. Gating is server-enforced (registry), not
just prompt-stated. UI uses existing `ui/` components + tokens; no hardcoded colors.
**Tests:** none (covered by Unit 6 + manual).
**Depends on:** Unit 4
**Verification:** manual — manager cannot get audit; out-of-scope/racking requests are politely
refused; a tool error (e.g. invalid brix) surfaces as a recoverable message, loop never hangs;
UI matches DESIGN.md.

### Unit 6: Pure-logic tests

**Goal:** Cover the deterministic seams without the (deferred) DB harness.
**Files:**
- `test/assistant-confirm.test.ts` (create) — sign/verify round-trip, expiry, tampered token,
  wrong-secret rejection.
- `test/assistant-scope.test.ts` (create) — `scopedVineyardFilter` for admin vs manager;
  resolver ambiguity/not-found/exact-match.
- `test/assistant-adapter.test.ts` (create) — `adjust_inventory` arg→FormData mapping; write
  tools never mutate on first call (return `needsConfirmation`).
**Approach:** Follow the existing pure-unit pattern in `test/**/*.test.ts` (node env, Vitest).
Mock Prisma only where a resolver touches it, or factor lookups so logic is testable without a
DB. Do NOT stand up the integration harness here (that's the `TODOS.md` follow-up).
**Tests:** these ARE the tests.
**Depends on:** Units 3, 4
**Verification:** `npm run lint` and the Vitest suite pass; no regressions in existing tests.

## Follow-ups (explicitly out of scope for this plan)

- **Phase 0 racking action + `rack_wine`** — net-new vessel-to-vessel volume move action +
  UI, then the tool. `transferGroupId` is bottle-location transfer, not racking.
- **Phase 2 MCP server** — needs the `action()` → `fooImpl(ctx, args)` split so a service
  token can supply the actor; then a stdio MCP server wrapping the same registry.
- **`/sync-mcp` skill** — dev-time skill that diffs actions/models vs the registry and opens a
  PR proposing new tools.
- **Interactive weekly `FieldNote` fill-in** — multi-turn report authoring via chat.
- **Action/DB integration test harness** (`TODOS.md`) — before the write surface grows.
- **Manager-scoped audit, cross-vineyard analytics, conversation persistence.**

## Test Strategy

**Unit tests:** Vitest node env (existing `test/**/*.test.ts` pattern) for confirm tokens,
scope/resolver, and the FormData adapter (Unit 6).
**Integration tests:** none in this plan; the action/DB harness is a tracked follow-up. The
highest-blast-radius path (`adjust_inventory`) is mitigated by single-use tokens + the real
action's own validation, and gets manual verification.
**Manual verification:** the per-unit checks above, end-to-end: read query, scoped denial,
admin-only audit, write preview→confirm→audit row, replay rejection, refusal handling.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tool-use loop misbehaves (hangs, drops tool blocks, splits results) | MED | HIGH | Unit 1 vertical slice de-risks it first; follow claude-api loop rules exactly (full content append, single tool_result message, MAX_TURNS) |
| Model misparses a write (wrong block/delta) | MED | HIGH | Preview-then-confirm; deterministic resolver; real action re-validates on commit |
| Double-commit of an inventory delta | LOW | HIGH | Single-use nonce burned in a txn before commit |
| Loop exceeds `maxDuration=60` | LOW | MED | Turn cap + streaming; keep tools fast (reuse indexed reads) |
| Read tool leaks cross-vineyard data | LOW | HIGH | Reuse scoped read fns + `scopedVineyardFilter`; scoping server-side, never model-trusted; `query_audit` admin-only |
| Opus 4.8 request-surface drift (params that 400) | LOW | MED | Follow claude-api skill: adaptive thinking only, no temperature/prefill; catch typed errors |

## Success Criteria

- [ ] `/assistant` chat panel streams answers; gated to logged-in staff.
- [ ] `query_brix`/`query_yield`/`query_vineyard_status` return correct, vineyard-scoped data.
- [ ] `query_audit` answers "who changed X?" for admins; refused for managers.
- [ ] `log_brix`/`set_yield_estimate`/`adjust_inventory` show a preview and commit ONLY after
      explicit confirm; each confirmed write creates an `AuditLog` row identical to the form path.
- [ ] A replayed/expired/forged confirm token is rejected; no double-apply.
- [ ] Manager cannot read or affect another vineyard; out-of-scope (racking) requests refused.
- [ ] Loop is turn-capped, surfaces tool errors, handles refusal/pause without hanging.
- [ ] UI matches DESIGN.md tokens; `npm run lint` clean.
- [ ] All new pure-logic tests pass; no regressions in existing tests.
