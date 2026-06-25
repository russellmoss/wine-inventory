---
title: Assistant Conversation Persistence, Auto-Titling & Cross-Conversation Search
type: feat
status: draft
date: 2026-06-25
branch: feat/assistant-chat
depth: standard
units: 8
---

## Overview

Turn the assistant chat from an ephemeral, in-memory session into durable conversations stored in Neon Postgres. Each conversation gets an LLM-generated title from the user's first message, shows up in a sidebar you can resume, and is searchable across your whole history via Postgres full-text search. The user outcome: stop losing chats on reload, and find "that thing the assistant told me about barrel topping last month" by typing a few words.

## Problem Frame

Today the assistant lives entirely in React `useState` (`src/app/(app)/assistant/AssistantChat.tsx`). Reload the page, the conversation is gone. There's no way to revisit a useful answer, no titles, no history, no search. For a tool people lean on for operational decisions (Brix logs, harvest, vineyard ops), losing context is a real cost: the user re-asks the same question, re-reads the same answer, and can't build on prior threads.

The Phase 1 plan (`docs/plans/2026-06-25-008-feat-assistant-chat-phase1-plan.md`) explicitly deferred conversation persistence as the planned next phase and kept the server stateless on purpose. This is that phase, not a redesign.

**Note on the reference implementation:** The user pointed at the Dashboard "knowledge base chat" as the model for "search across conversations." Research showed the Dashboard's search is actually RAG/vector search over a *knowledge-base corpus* (pgvector + ILIKE), invoked by the agent as a tool. It does **not** search a user's past chat history. What's requested here — finding a past conversation by its content — is a different and simpler thing: Postgres full-text search over the user's own persisted messages and titles. We build the requested capability, borrowing the Dashboard's persistence shape (threads + messages tables, auto-title, list/resume), not its corpus-search mechanism.

## Requirements

- MUST: Persist conversations and their messages in Neon Postgres via Prisma, scoped to the owning user.
- MUST: Auto-generate a short conversation title from the user's first message.
- MUST: List a user's past conversations (most recent first) and resume any of them with full message history.
- MUST: Search across all of a user's conversations by content (message text + titles) and jump to the matching conversation.
- MUST: Preserve existing behavior — streaming replies, tool-use loop, write-proposal confirm flow, feedback.
- SHOULD: Rename and delete conversations.
- SHOULD: Show a result snippet/highlight in search results so the match is obvious.
- NICE: "New chat" affordance that starts a fresh conversation without leaving the page.
- NICE: Auto-scroll / unread affordances unchanged.

## Scope Boundaries

**In scope:**
- New Prisma models for conversations and messages, plus a migration adding a Postgres full-text search column + GIN index.
- Persistence wired into the existing `/api/assistant` POST route (create conversation, persist user + assistant turns, generate title).
- New read APIs: list, resume, search, and (SHOULD) rename/delete.
- Sidebar UI in `AssistantChat.tsx` for list, new chat, resume, and search.

**Out of scope:**
- Vector/semantic search or embeddings (the Dashboard's corpus-search mechanism). FTS only.
- Sharing conversations between users, or admins viewing others' conversations. Each user sees only their own.
- Persisting ephemeral write-proposal cards / confirmation UI state. Only text turns are persisted; proposals are reconstructed live, not stored.
- Changing the LLM, tool registry, scoping rules, or the confirm/feedback flows.
- Pagination beyond a sane LIMIT on list/search (cap, don't paginate, in v1).

## Research Summary

### Codebase Patterns

- **Chat UI (ephemeral today):** `src/app/(app)/assistant/AssistantChat.tsx` — `items` (TextItem | ProposalItem), `send()` posts `{ messages: history }` to `/api/assistant`, consumes NDJSON `AssistantEvent` stream (`text`, `tool`, `proposal`, `error`, `done`). No persistence of any kind. Page shell `page.tsx` loads user via `requireReadyUser()`. Markdown via local `Markdown.tsx`.
- **Chat API:** `src/app/api/assistant/route.ts` — POST, auth gate (`getCurrentUser()`, reject banned / mustChangePassword), validates messages (≤40, ≤8000 chars, must end on user turn), returns NDJSON stream. Core loop in `src/lib/assistant/run.ts` (Anthropic `claude-opus-4-8`, manual tool-use loop, `stream.on("text")`). Final assistant text is currently streamed out but not captured server-side — we'll accumulate it.
- **Existing assistant persistence precedents:** `AssistantConfirmation` (`prisma/schema.prisma:545`, migration `20260625104640_add_assistant_confirmation`) and `AssistantFeedback` (`schema.prisma:558`, migration `20260625120014_add_assistant_feedback`, stores transcript as JSONB). Both `@@map` to snake_case tables. Follow this naming/shape.
- **Prisma setup:** `prisma/schema.prisma` — postgresql, `url` (pooled) + `directUrl` (unpooled) for Neon. Client singleton `src/lib/prisma.ts`. Migrations via `npm run db:migrate`. `User.id` is the scoping key; `User` already has relation fields (e.g. `fieldNotes`).
- **API route conventions:** auth-first, `try/catch` JSON parse → 400, type-guard validation with early 400s, `Response.json({...}, {status})`; streaming routes return `new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } })`.
- **Tests:** Vitest configured (`vitest run`), but zero test files exist. Pure helpers are the testable surface (see `src/lib/access.ts` "no server-only imports" note).

### Prior Learnings

- No rstack learnings file or context-ledger entries exist for this project (both empty). The `rstack-learnings-search` binary isn't installed here. The Phase 1 plan is the governing prior artifact and carries a standing instruction: **record persistence/FTS/migration decisions in `.context-ledger`** as we implement (via `mcp__context-ledger-mcp__propose_decision`).
- Phase 1 stressed: **scoping is server-enforced, never model-trusted.** Persisted conversations must be scoped to the owning user the same way.
- `AGENTS.md`: this is **Next.js 16** with breaking changes — read `node_modules/next/dist/docs/` before writing route/server code. Dynamic route segment `params` is async in Next 16 (a Promise) — relevant for `/conversations/[id]`.

### External Research

- **Postgres full-text search on Neon:** Standard FTS — a generated `tsvector` column + GIN index, queried with `websearch_to_tsquery('english', $q)`, ranked with `ts_rank`, snippeted with `ts_headline`. Prisma has no first-class support for generated `tsvector` columns, so this column is created by raw SQL in the migration and queried via `prisma.$queryRaw`. The "no raw SQL" discipline in Phase 1 applied to the *tool layer*, not migrations or a dedicated search query.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Storage shape | Two relational tables: `AssistantConversation` + `AssistantMessage` (one row per turn) | Single table with JSONB message array (like `AssistantFeedback`) | Per-row messages are required for full-text search, ranking, and snippets; JSONB blob can't be indexed for FTS cleanly. Mirrors Dashboard's `kb_chat_threads`/`kb_chat_messages`. |
| Search mechanism | Postgres FTS: generated `tsvector` on message content, GIN index, `websearch_to_tsquery` + `ts_rank` + `ts_headline` | pgvector/embeddings (Dashboard corpus style); ILIKE | User wants to find *their past chats by words said*. FTS is the native, zero-dependency fit on Neon, gives ranking + highlight. Embeddings are overkill and add infra. ILIKE has no ranking/highlight. |
| tsvector management | Created/maintained by raw SQL in the migration; queried via `$queryRaw`. Column omitted from Prisma model (or declared `Unsupported("tsvector")?`) | Maintain via app code on every write; Prisma-native column | Generated column = always correct, zero app burden. Prisma can't express it natively, so keep it migration-managed. |
| Title generation | Cheap synchronous LLM call (`claude-haiku-4-5`, ~20 tokens) on first user message, emitted to the client as a `conversation` event before the main reply streams | Opus title call; first-N-words heuristic only; async post-hoc title | Haiku is fast/cheap and gives a real title up front so the sidebar updates immediately. Falls back to truncated first message on any failure. |
| Persistence trigger | Wire into existing `/api/assistant` POST (accept optional `conversationId`); create-on-first-message; persist user turn before streaming, assistant turn after stream completes | Separate `/messages` POST endpoint; client-driven writes | Single round-trip, server owns all writes (trustworthy scoping), least UI churn. Client-driven writes can't be trusted for ownership. |
| What gets persisted | Only `user`/`assistant` text turns | Persist proposal cards + confirmation state | Proposals are ephemeral, signed, single-use; storing them invites stale/replay confusion. Text history is what's worth resuming and searching. |
| Conversation scope | Owner-only (`ownerUserId == current user`), admins included | Admin can see all | This is personal chat history, not vineyard data. Simpler and privacy-correct. |
| List/search limits | `LIMIT` (e.g. 50 list / 30 search), newest-first; no pagination v1 | Full pagination | Matches Dashboard's capped approach; pagination is a later add if needed. |

## Implementation Units

### Unit 1: Schema — conversation & message models

**Goal:** Add `AssistantConversation` and `AssistantMessage` Prisma models, scoped to `User`.
**Files:** `prisma/schema.prisma`
**Approach:** Add `AssistantConversation { id (cuid) @id, ownerUserId, title, createdAt @default(now()), updatedAt @updatedAt, messages AssistantMessage[] }` with `@@index([ownerUserId, updatedAt])` and `@@map("assistant_conversation")`. Add `AssistantMessage { id (cuid) @id, conversationId, role, content @db.Text, metadata Json?, createdAt @default(now()), conversation AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade) }` with `@@index([conversationId, createdAt])` and `@@map("assistant_message")`. Add a relation field on `User` (e.g. `assistantConversations AssistantConversation[]`) and the FK `ownerUserId -> User.id`. Follow the exact style of `AssistantConfirmation`/`AssistantFeedback` at `schema.prisma:545-572`.
**Tests:** None (schema). Verified by client generation in Unit 2.
**Depends on:** none
**Patterns to follow:** `prisma/schema.prisma:545` (`AssistantConfirmation`), `:558` (`AssistantFeedback`).
**Verification:** `npm run db:generate` succeeds and types for the new models exist.

### Unit 2: Migration — tables + full-text search index

**Goal:** Create the tables and add the FTS `tsvector` generated column + GIN index.
**Files:** `prisma/migrations/<timestamp>_add_assistant_conversations/migration.sql` (generated, then hand-edited)
**Approach:** Run the migration generator (handled by `/work`, not inline) to produce the base `CREATE TABLE` statements from Unit 1. Then append raw SQL to the same migration: add a generated column on `assistant_message`, e.g. `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;` and `CREATE INDEX ... USING GIN (search_vector);`. Optionally add a trigram or `to_tsvector` index on `assistant_conversation.title` for title matches. Keep `search_vector` out of the Prisma model (managed here) or declare it `Unsupported("tsvector")?` so Prisma leaves it alone. Neon migrations use the unpooled `directUrl` (already configured).
**Tests:** None (DDL). Verified by querying.
**Depends on:** Unit 1
**Patterns to follow:** migration `20260625104640_add_assistant_confirmation/migration.sql` for structure/naming.
**Verification:** `npm run db:migrate` applies cleanly; `\d assistant_message` shows the generated column + GIN index; a manual `SELECT ... WHERE search_vector @@ websearch_to_tsquery('english','test')` runs without error.

### Unit 3: Persistence + title helpers (pure-ish lib)

**Goal:** Server helpers to create/find conversations, persist turns, and generate titles — isolated and testable.
**Files:** `src/lib/assistant/conversations.ts` (new), `src/lib/assistant/title.ts` (new)
**Approach:** `conversations.ts`: `getOrCreateConversation({ ownerUserId, conversationId? })`, `appendMessage({ conversationId, role, content, metadata? })`, `touchConversation(id)` (bumps `updatedAt`), `listConversations(ownerUserId)`, `getConversation({ id, ownerUserId })` (returns messages, ownership-checked), `searchConversations({ ownerUserId, query })` via `prisma.$queryRaw` using `websearch_to_tsquery` + `ts_rank` + `ts_headline`, grouped to distinct conversations with best-ranked snippet. `title.ts`: `generateTitle(firstUserMessage)` → Anthropic `claude-haiku-4-5`, ~20 max tokens, prompt "Write a 4-6 word title, no quotes"; `fallbackTitle(msg)` truncates to ~60 chars on whitespace. `generateTitle` wraps the call in try/catch and returns `fallbackTitle` on any failure. Keep a `sanitizeSearchQuery` pure function (strip control chars, cap length) so query building is unit-testable without a DB.
**Tests:** `src/lib/assistant/title.test.ts` — `fallbackTitle`: long message truncates on word boundary + ellipsis; empty message yields a sensible default. `src/lib/assistant/search.test.ts` — `sanitizeSearchQuery`: trims, caps length, strips control chars, empty/whitespace yields empty.
**Depends on:** Unit 1
**Patterns to follow:** Anthropic client usage in `src/lib/assistant/run.ts:1-30`; Prisma access via `src/lib/prisma.ts`.
**Verification:** `npm run test` passes the new unit tests; `npm run lint` clean.

### Unit 4: Wire persistence into the chat route

**Goal:** Make `/api/assistant` create/resume a conversation and persist both turns, emitting conversation identity to the client.
**Files:** `src/app/api/assistant/route.ts`, `src/lib/assistant/run.ts` (capture final assistant text)
**Approach:** Accept optional `conversationId` in the POST body (validate: string, owned by current user, else treat as new). Resolve via `getOrCreateConversation`. On a brand-new conversation, call `generateTitle` from the last user message, then emit a new `conversation` event `{ type: "conversation", id, title }` at the start of the stream (extend the `AssistantEvent` union). Persist the incoming user message (`appendMessage` role `user`) before running the loop. Accumulate the assistant's final text — `run.ts` already emits `text` events; capture the concatenation (or have `run.ts` return/callback the final assistant content) and, after the stream ends, `appendMessage` role `assistant` (skip if empty) and `touchConversation`. Keep all existing validation/auth and event types intact.
**Tests:** Pure mapping helper if extracted (e.g. building the persisted user content from the last history turn). Route itself verified manually (no route tests exist in repo).
**Depends on:** Units 1, 3
**Patterns to follow:** existing stream assembly in `route.ts:28-67` and `run.ts:73-146`.
**Verification:** Send a message with no `conversationId` → row created in `assistant_conversation`, two rows in `assistant_message`, a `conversation` event received with a title. Send again with that `conversationId` → appends, `updatedAt` bumps, no new conversation.

### Unit 5: List & resume APIs

**Goal:** Endpoints to list the user's conversations and load one with its messages.
**Files:** `src/app/api/assistant/conversations/route.ts` (GET list), `src/app/api/assistant/conversations/[id]/route.ts` (GET resume; PATCH rename + DELETE in Unit 7)
**Approach:** List: auth gate, `listConversations(user.id)` → `{ conversations: [{ id, title, updatedAt, messageCount }] }`, newest-first, `LIMIT 50`. Resume: auth gate, `getConversation({ id: params.id, ownerUserId: user.id })`; return `{ id, title, messages: [{ role, content, createdAt }] }` ordered ascending, `LIMIT` (e.g. 200) most-recent; 404 if not owned/found. **Next 16:** `params` is async — `const { id } = await params`. Read `node_modules/next/dist/docs/` for the current route handler signature before writing.
**Tests:** None (thin DB-backed routes); covered by Unit 3 helper tests + manual.
**Depends on:** Units 1, 3
**Patterns to follow:** auth-first + `Response.json` conventions from `src/app/api/assistant/confirm/route.ts`.
**Verification:** `GET /api/assistant/conversations` returns the user's list; `GET /api/assistant/conversations/<id>` returns ordered messages; requesting another user's id returns 404.

### Unit 6: Search API

**Goal:** Full-text search across the user's conversations.
**Files:** `src/app/api/assistant/conversations/search/route.ts` (GET `?q=`)
**Approach:** Auth gate; read `q`, run `sanitizeSearchQuery`; empty → `{ results: [] }`. Call `searchConversations({ ownerUserId: user.id, query })` which `$queryRaw`s: join messages→conversations, filter `search_vector @@ websearch_to_tsquery('english', $q)` (plus title match), `ORDER BY ts_rank(...) DESC`, `LIMIT 30`, returning distinct conversations with `{ id, title, snippet (ts_headline), updatedAt }`. Ensure parameterization (no string interpolation) to prevent injection.
**Tests:** `sanitizeSearchQuery` already covered in Unit 3. Query correctness verified manually against seeded data.
**Depends on:** Units 2, 3
**Patterns to follow:** `prisma.$queryRaw` tagged-template parameterization.
**Verification:** Seed two conversations; `GET ...?q=<word in one>` returns that conversation with a highlighted snippet and not the other; SQL-ish input (`a & b`, quotes) doesn't error.

### Unit 7: Rename & delete (SHOULD)

**Goal:** Let users rename and delete conversations.
**Files:** `src/app/api/assistant/conversations/[id]/route.ts` (add PATCH + DELETE)
**Approach:** PATCH `{ title }` — validate non-empty, length cap, ownership-checked update. DELETE — ownership-checked delete (cascade removes messages via FK `onDelete: Cascade`). Both auth-gated, 404 on non-owned.
**Tests:** None (thin); manual.
**Depends on:** Units 1, 5
**Patterns to follow:** same route conventions as Unit 5.
**Verification:** PATCH changes the title and reflects in list; DELETE removes the conversation and its messages; other users' ids 404.

### Unit 8: Sidebar UI — list, new chat, resume, search

**Goal:** Add a conversation sidebar to the assistant with list, new chat, resume, and search; track the active `conversationId`.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`, plus a `ConversationSidebar.tsx` (new) and small fetch helpers; `page.tsx` only if layout needs the wider shell.
**Approach:** Add `conversationId` state. On mount, fetch the conversation list. "New chat" clears `items` + `conversationId`. Selecting a conversation calls the resume endpoint and maps persisted `{role,content}` → `TextItem[]` (proposals are not restored — they were never persisted). `send()` includes `conversationId`; on the new `conversation` event, set `conversationId` + title and refresh the list. Add a search input that calls the search API (debounced) and renders results (title + snippet) that open the matched conversation. Reuse `Markdown.tsx` for snippets if it renders highlight markup, else plain text. Respect `DESIGN.md` tokens — no hardcoded colors/spacing/fonts (read `DESIGN.md` first).
**Tests:** Pure `messagesToItems` mapper extracted and unit-tested (persisted messages → `TextItem[]`, roles preserved, empty handled).
**Depends on:** Units 4, 5, 6 (and 7 for rename/delete controls)
**Patterns to follow:** existing `AssistantChat.tsx` state/stream handling; `Markdown.tsx` rendering.
**Verification:** Manual end-to-end — start a chat (title appears), reload (conversation persists and resumes from sidebar), start a second chat, search a word from the first and jump to it. `npm run lint` + `npm run build` clean.

## Test Strategy

**Unit tests (Vitest, the project's only framework; first tests in the repo):**
- `title.test.ts` — `fallbackTitle` truncation/word-boundary/empty.
- `search.test.ts` — `sanitizeSearchQuery` trim/cap/strip/empty.
- `messagesToItems` mapper test (Unit 8) — persisted rows → UI items.

**Integration tests:** None added — no DB/integration harness exists in the repo, and standing it up is out of scope. Persistence/search correctness is verified manually against Neon.

**Manual verification (end-to-end):**
1. New chat with no `conversationId` → conversation row + 2 message rows; `conversation` event carries an LLM title.
2. Reload page → conversation listed in sidebar; resume restores the full text history (no proposal cards).
3. Continue the conversation → appends, `updatedAt` bumps, title unchanged.
4. Start a second conversation; search a distinctive word from the first → only the first returns, with a highlighted snippet; clicking opens it.
5. Rename + delete work and are ownership-scoped (another user's id 404s).
6. Existing flows unaffected: streaming, tool-use, write-proposal confirm, feedback.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Prisma can't express the generated `tsvector` column; migration drift on future `db:migrate` | MED | MED | Manage `search_vector` purely in raw migration SQL; declare `Unsupported("tsvector")?` (or omit) so Prisma doesn't try to manage it; verify a no-op `migrate diff` after. |
| Next.js 16 route-handler / async `params` differences vs training data | MED | MED | Read `node_modules/next/dist/docs/` before writing routes; `await params` for `[id]`. |
| Capturing final assistant text from the streaming loop is fragile (partial streams, errors mid-flight) | MED | MED | Persist the user turn before streaming; accumulate assistant text in the route; persist assistant turn in a `finally`, skipping empty content; don't fail the response if the assistant-write fails (log it). |
| Title LLM call adds latency / can fail | LOW | LOW | Cheap Haiku, ~20 tokens; wrap in try/catch with `fallbackTitle`; emit early so UI isn't blocked on the main reply. |
| Search injection / malformed `tsquery` input | LOW | MED | `websearch_to_tsquery` (forgiving syntax) + parameterized `$queryRaw` + `sanitizeSearchQuery`; never interpolate `q` into SQL. |
| Scope leak (seeing others' conversations) | LOW | HIGH | Every query filtered by `ownerUserId = current user.id`; ownership re-checked on resume/rename/delete; covered in manual checks. |
| Resuming loses proposal/confirm context | LOW | LOW | By design — document it; proposals are single-use and ephemeral. Only text turns resume. |

## Success Criteria

- [ ] New conversations are created and both turns persisted in Neon, scoped to the user.
- [ ] First message produces an LLM-generated title, shown in the sidebar immediately.
- [ ] Sidebar lists past conversations (newest-first) and resumes full text history on click.
- [ ] Full-text search across the user's conversations returns ranked matches with highlighted snippets and opens the right conversation.
- [ ] Rename and delete work and are ownership-scoped.
- [ ] Existing streaming, tool-use, confirm, and feedback flows are unchanged.
- [ ] New unit tests pass; `npm run lint` and `npm run build` are clean.
- [ ] No regressions in existing behavior.
