---
title: Assistant widget conversation persistence + searchable history
type: feat
status: completed
date: 2026-07-05
branch: feat/assistant-widget-history
depth: standard
units: 4
---

## Overview

Surface the assistant's existing conversation history inside the global floating widget (the dock). Add a "History" button that opens a searchable list of past conversations, let the user click one to load it back into the normal chat view, and persist the active conversation so it survives a page reload. The persistence + search backend already exists and is fully shared with the `/assistant` page — this plan wires the same seams into the dock, it does not build a parallel system.

## Problem Frame

Today the dock (`AssistantDock`) reuses the same `AssistantChat` brain as the full `/assistant` page, but in `embedded` mode it *hides* the conversation sidebar (gated at `AssistantChat.tsx:456`) and never restores the last conversation on reload (`conversationId` is React state only — `AssistantChat.tsx:190`). Result: a winemaker chatting from the dock on any working page (tanks, work orders, etc.) can't get back to a previous conversation without navigating to `/assistant`, and a refresh silently starts a fresh chat. The conversations *are* saved server-side already; the widget just has no door to them.

Do nothing → the dock stays a scratchpad and users bounce to `/assistant` for anything they said earlier, defeating the point of an always-available assistant.

## Requirements

- MUST: A "History" affordance in the dock opens a searchable list of the user's past conversations (same list + full-text search as `/assistant`).
- MUST: Clicking a past conversation loads its messages back into the normal dock chat view.
- MUST: The dock remembers the active conversation across reloads/sessions (reopen it, or gracefully fall back to a new chat if it's gone).
- MUST: A way to start a "New chat" from the dock (so the history view isn't a one-way trip).
- MUST: Do not break voice mode or the write-confirmation flow.
- SHOULD: Reuse `ConversationSidebar` and the existing `openConversation`/`refreshList`/search handlers rather than duplicating them.
- SHOULD: Fit the narrow dock panel (`min(440px, 94vw)`) — a full-panel takeover, not a side-by-side sidebar.
- NICE: Rename/delete from the dock history (already wired in `AssistantChat`, free if we reuse the sidebar).

## Scope Boundaries

**In scope:**
- Embedded (dock) history UI: a toggle + a full-panel history view inside `AssistantChat` embedded mode.
- Persisting/restoring the dock's active `conversationId` via `localStorage`.
- Making `ConversationSidebar` render in a narrow "panel" layout without forking it.

**Out of scope:**
- The full `/assistant` page (its sidebar already works; behavior unchanged).
- Any change to the DB models, API routes, or search implementation (`AssistantConversation`/`AssistantMessage`, `src/app/api/assistant/conversations/*`, `src/lib/assistant/conversations.ts`) — all reused as-is.
- An external event bus / imperative "open the dock to conversation X from elsewhere" (no consumer needs it yet).
- Persisting proposal/confirmation cards on resume — `history.ts:12-22` deliberately keeps only text turns; unchanged.

## Research Summary

### Codebase Patterns

The persistence + search stack is already generic and user-scoped (not page-scoped):

- **Models** — `prisma/schema.prisma`: `AssistantConversation` (821-834, tenant-scoped, `@@index([ownerUserId, updatedAt])`) and `AssistantMessage` (840-857, generated `search_vector` tsvector + GIN index). No change needed.
- **Write path** — `src/app/api/assistant/route.ts:69-95` creates the conversation server-side, emits a `{type:"conversation", id}` stream event, and persists user+assistant turns (best-effort). `src/lib/assistant/conversations.ts` holds `createConversation`/`appendMessage`/`listConversations`/`searchConversations`.
- **History APIs** — `src/app/api/assistant/conversations/route.ts` (list), `.../search/route.ts` (`?q=` full-text with `<mark>` snippets), `.../[id]/route.ts` (GET rehydrate / PATCH rename / DELETE). All auth-gated + tenant-scoped. Reused unchanged.
- **Shared brain** — `src/app/(app)/assistant/AssistantChat.tsx` already holds ALL the state and handlers this feature needs:
  - `conversationId` state (190), set from the stream `conversation` event (~386) and `openConversation` (264).
  - `conversations`/`listLoading`/`query`/`searchResults`/`searching` (191-195), `refreshList` (199-211), debounced search effect (220-244).
  - `startNewChat` (246-254), `openConversation` (256-271, fetches `/[id]` → `messagesToItems` → sets items+id), `renameConversation` (273-284), `deleteConversation` (286-294).
- **History UI** — `src/app/(app)/assistant/ConversationSidebar.tsx` is fully presentational (fixed `width: 320`, `borderRight`), rendered only when `!embedded` (`AssistantChat.tsx:456-470`).
- **Dock** — `src/components/assistant/AssistantDock.tsx`: panel is `width: min(440px, 94vw)`, `height: min(620px, 80vh)` (95-96); mounts `<AssistantChat ... embedded active={open} />` (116); mounted app-wide via `AppShell.tsx:322`; self-hides on `/assistant` (53).
- **localStorage precedent** — `AssistantChat.tsx:127-143` persists the voice mic-mode: post-mount `useEffect` read (avoids SSR/hydration mismatch) + `try/catch` write. Mirror this exact pattern for `conversationId`.
- **Voice desync hazard** — `voiceOpen`/`setVoiceOpen` (100); `active={open}` force-closes voice on dock collapse (117); `VoiceOverlay` gets `conversationId` + `onConversationId` (634-649). Loading a conversation from history while voice is live would desync the voice session's `conversationId` — must close voice first.

### Prior Learnings

- Plan 042 (assistant navigation): the dock is the global surface; `assistant-events.ts` is a type/parser contract, not an event bus. This plan needs no cross-component event — the History button lives *inside* `AssistantChat` where the state already is.
- K12 / cached-fn tenant rule and RLS: not touched (no new server code).

### External Research

None needed — no new framework surface. React 19 + existing lazy/`Suspense` patterns only.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where the History button lives | Inside `AssistantChat` embedded toolbar | In `AssistantDock` header | All history state/handlers live in `AssistantChat`; putting the button there avoids lifting state or inventing an event bus. |
| History layout in the dock | Full-panel takeover that overlays the chat, toggled by a button; selecting a convo returns to chat | Side-by-side 320px sidebar; separate dropdown | Dock is only ~440px wide; a permanent sidebar won't fit. Matches the user's ask ("opens history → click one → back to the chat widget"). |
| Reuse vs fork `ConversationSidebar` | Add a `variant`/`compact` prop → panel layout (100% width, no right border) | Duplicate a dock-specific list | Single source of truth for list+search+rename+delete; zero behavior drift from `/assistant`. |
| Reload persistence | Persist `conversationId` to `localStorage`; restore on mount (embedded), fall back to new chat on 404 | Server-side "last active" pointer; nothing | Mirrors the existing `assistant.voiceMode` pattern; no schema/API change; server already durably stores the messages. |
| Scope of auto-restore | Embedded (dock) only | Also the full page | The page has a visible sidebar; silently re-opening the last convo there would change established UX. Keep the request tight. |

## Implementation Units

### Unit 1: `ConversationSidebar` narrow "panel" variant

**Goal:** Let the existing history list+search render full-width inside the dock without forking the component.
**Files:** `src/app/(app)/assistant/ConversationSidebar.tsx`
**Approach:** Add an optional prop (e.g. `variant?: "sidebar" | "panel"`, default `"sidebar"`). In `"panel"` mode the root `<aside>` uses `width: "100%"`, drops `flexShrink`/`borderRight`/`paddingRight`, and keeps `height: "100%"` so it fills the dock body. All list/search/rename/delete internals (`SearchList`, `ConversationList`, `ConversationRow`, `Snippet`) stay identical. No logic change — layout only.
**Tests:** Component render smoke test if RTL is available (see Test Strategy); otherwise covered by manual QA + typecheck. Extract nothing new.
**Depends on:** none
**Patterns to follow:** existing `aside` style block `ConversationSidebar.tsx:79-90`.
**Verification:** `npm run build` + eyeball the dock panel (Unit 2) shows a full-width list.

### Unit 2: History toggle + panel in embedded `AssistantChat`

**Goal:** A "History" button in the dock opens the searchable list; picking a conversation loads it and returns to chat; a "New chat" button resets.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:**
- Add embedded-only UI state `historyOpen` (default `false`).
- In `embedded` mode only, render a compact top toolbar (History toggle + "New chat"), sitting where the page `<h1>` block is skipped (`AssistantChat.tsx:472-480`). Keep the non-embedded page layout untouched.
- When `historyOpen` and `embedded`, render `<ConversationSidebar variant="panel" .../>` filling the chat body (overlay/replace the transcript area), wired to the EXISTING handlers: `conversations`, `activeId={conversationId}`, `loading={listLoading}`, `query`/`onQueryChange={setQuery}`, `searching`, `searchResults`, `onRename`, `onDelete`, and:
  - `onSelect={(id) => { void openConversation(id); setHistoryOpen(false); }}`
  - `onNew={() => { startNewChat(); setHistoryOpen(false); }}`
- Voice-safety: before loading from history, close voice — either disable/hide the History button while `voiceOpen`, or call `setVoiceOpen(false)` in the `onSelect` path. Prefer closing voice in the select handler so the flow never desyncs (`AssistantChat.tsx:100,634-649`).
- Refresh the list when opening history (call `refreshList()` on toggle-open) so it reflects conversations created since mount.
- Accessibility: button `aria-pressed`/`aria-expanded`, focus moves into the panel on open (match dock a11y conventions in `AssistantDock.tsx:30-36`); reduced-motion aware if animated.
**Tests:** Manual QA (Test Strategy). If RTL present, test: History button toggles the panel; `onSelect` calls `openConversation` and closes the panel.
**Depends on:** Unit 1
**Patterns to follow:** embedded gates at `AssistantChat.tsx:455-480`; existing sidebar wiring `456-470`; design tokens only (no hardcoded colors/spacing per DESIGN.md).
**Verification:** In the dock on a non-`/assistant` page: click History → search → click a result → transcript loads and panel closes; "New chat" clears it.

### Unit 3: Persist + restore the dock's active conversation

**Goal:** After a reload, the dock reopens the conversation the user was in (or starts fresh if it's gone).
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:**
- Persist: a `useEffect` (embedded only) that writes `conversationId` to `localStorage` (key e.g. `assistant.dock.conversationId`) whenever it changes; clear the key when `conversationId` is `null` (new chat). Wrap writes in `try/catch` like `AssistantChat.tsx:138-142`.
- Restore: a one-shot post-mount `useEffect` (embedded only) that reads the key and, if present, calls `openConversation(saved)`. `openConversation` already handles a bad id by throwing → surface nothing and leave a fresh chat (tweak so a restore failure silently clears the stored key rather than showing the error banner). Do NOT use a lazy `useState` initializer (SSR/hydration) — post-mount read only, exactly like the voiceMode hydration comment at `127-135`.
- Guard against clobbering an in-progress chat: only restore when `items` is empty and `conversationId` is null at mount.
**Tests:** Extract the tiny decision ("should restore?" / key name) only if it clarifies; otherwise manual QA. Existing `/[id]` GET returns 404 for a non-owned/deleted id → restore no-ops.
**Depends on:** Unit 2 (shares `openConversation`; not strictly required but sequenced after)
**Patterns to follow:** `assistant.voiceMode` persistence `AssistantChat.tsx:127-143`.
**Verification:** Open the dock, send a message (conversation created), reload the page, reopen the dock → same transcript. Delete that conversation from history, reload → clean new chat, no error banner.

### Unit 4: Tests + QA pass

**Goal:** Lock the behavior and prove no regression.
**Files:** `test/` (new or extended, e.g. `test/assistant-*.test.ts`); reuse `src/lib/assistant/history.ts` coverage.
**Approach:** The genuinely new logic is UI-thin. Cover what's pure: any extracted helper (localStorage key resolution / restore guard) gets a vitest unit test; `messagesToItems` is already tested (`history.ts`). If React Testing Library is configured in the repo, add a `ConversationSidebar` panel-variant render test and an `AssistantChat` embedded history-toggle test; if not, rely on typecheck + the manual QA checklist below and note that explicitly (no fake coverage).
**Tests:** as above.
**Depends on:** Units 1-3
**Verification:** `npm run lint`, `npx tsc --noEmit` (or `npm run build`), `npx vitest run` green (ignore the pre-broken `invariant-drift.test.ts` load error — known, per project memory).

## Test Strategy

**Unit tests:** vitest. Cover pure helpers only (history mapping already covered; add tests for any new pure decision helper). Confirm whether RTL/jsdom component testing exists before promising component tests — if it does, add the two render tests in Unit 4; if not, say so.
**Integration tests:** none new — the history APIs already have their behavior exercised server-side; this plan adds no server code.
**Manual verification (end-to-end, the real proof):**
1. On `/tanks` (or any non-`/assistant` page) open the dock, ask something, get a reply → a conversation is created.
2. Reload → reopen dock → same transcript restored (Unit 3).
3. Click History → the list shows recent conversations; type a query → full-text results with highlighted snippets (Unit 2 reusing search).
4. Click a result → its messages load into the chat, panel closes, sending appends to that same conversation (conversationId posted back, `route.ts:69-84`).
5. "New chat" → empty transcript, `localStorage` key cleared.
6. Rename + delete from the dock history behave like `/assistant`.
7. Open voice, then open History and pick a conversation → voice closes cleanly, no desync (Unit 2 voice guard).
8. `/assistant` full page unchanged (dock still hidden there; page sidebar intact).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Loading a conversation from history while voice is live desyncs the voice session | MED | MED | Close voice (`setVoiceOpen(false)`) in the history `onSelect` path, or disable History while `voiceOpen` (Unit 2). |
| Auto-restore clobbers an in-progress chat or fires on the full page | LOW | MED | Gate restore to `embedded`, one-shot, only when `items` empty + `conversationId` null (Unit 3). |
| Restoring a deleted/foreign conversation shows an error banner | MED | LOW | On restore failure, silently clear the stored key and stay on a fresh chat (Unit 3). |
| `ConversationSidebar` panel variant regresses the page sidebar | LOW | MED | Default the prop to `"sidebar"`; page call site passes nothing (Unit 1). |
| localStorage disabled (private mode) | LOW | LOW | `try/catch`; feature degrades to "no restore," chat still works (mirrors voiceMode). |
| SSR/hydration mismatch reading localStorage | LOW | MED | Post-mount effect only, never a lazy `useState` initializer (Unit 3, per existing comment). |

## Success Criteria

- [ ] Dock has a visible, accessible History button that opens a searchable conversation list.
- [ ] Searching in the dock returns the same full-text results (with `<mark>` snippets) as `/assistant`.
- [ ] Selecting a conversation loads it into the dock chat and returns to the normal chat view.
- [ ] "New chat" resets the dock and clears the stored active conversation.
- [ ] Reloading reopens the last dock conversation; a deleted one falls back to a clean chat with no error.
- [ ] Voice + write-confirmation flows still work; no desync when switching conversations from history.
- [ ] `/assistant` full page behavior is unchanged.
- [ ] `npm run lint`, typecheck/build, and `npx vitest run` pass (minus the known pre-broken suite).
- [ ] No new API/DB/env surface; no regressions in existing tests.
