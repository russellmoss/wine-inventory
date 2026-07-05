---
title: Assistant in-app navigation + entity deep-linking
type: feat
status: pr-a-complete (units 0-7,9-11 built on feat/assistant-navigation-deeplinks; Unit 8 dock = PR-B)
date: 2026-07-05
branch: feat/assistant-navigation-deeplinks
depth: deep
units: 13
prs: PR-A (server + text + voice + Markdown, absorbs #44) / PR-B (global dock, off updated main)
revised: 2026-07-05 after council + eng + design review — see "Post-review revisions"
---

## Overview

Make the Cellarhand assistant able to (1) hand back **working deep links** to specific
records it read or created — a lot, a work order, the work-order template it just authored,
a vineyard, a tank — and (2) **actually move the app** for you when you ask ("take me to
tank 11", "show me what's in it") by emitting a structured navigate action the client router
executes, no click required. Today the assistant can talk about tank 11 but can't take you
there or even link you there; this closes that loop while staying inside the existing
auth/tenant/confirm guarantees.

## Problem Frame

Real user (winery operator) feedback (`cmr7ovcly...`): "The assistant should be able to
provide links to anything throughout the app, including stuff it created itself... and I
should be able to just say 'can you take me there?' and it moves the page." Today:

- The assistant renders no links (open **PR #44** adds safe relative-link *rendering* and a
  prompt list of section routes, but explicitly forbids deep-link ids because **no tool
  returns an id or URL**).
- There is **zero** client router integration — even a rendered `<a href="/lots/x">` would
  full-page-reload, and nothing can navigate on the user's behalf.

Do nothing → the assistant stays a read-only oracle that can describe a record but strands
the user, who then hunts for it by hand. The whole point of an in-app assistant is that it
closes the last mile to the thing you care about.

## Requirements

- MUST: The assistant can navigate the app to a page on **explicit** request ("take me to…",
  "show me…", "go to…") via SPA navigation (Next.js router.push), across **all** assistant
  surfaces (text chat, voice overlay, and the global assistant dock from plan 038).
- MUST: The assistant can render **clickable deep links** to specific records (lots, work
  orders, work-order templates, vineyards) for incidental mentions, and links do SPA
  navigation, not full reload.
- MUST: The link/navigation target for a specific record is **built from a server-resolved
  id** (tool output or committer result) and re-validated against the current tenant + the
  manager's vineyard scope — never from a model-supplied free-text id.
- MUST: "Link me to the thing you just created" works (e.g. the Fermentation Monitoring
  template) — the new id/route rides the **confirm response**, since a created id only exists
  post-commit.
- MUST: The existing write-confirmation (signed-token / single-use nonce) flow is unchanged.
- MUST: "Tank N and its history" resolves to that vessel's **active lot detail** (`/lots/[id]`),
  which already is the reverse-chron ledger history of the wine in the vessel.
- MUST: **Hybrid consent** — explicit "take me there" auto-navigates; incidental mentions
  render a link and do not yank the user.
- SHOULD: Section-route allowlist lives in **one** place (shared by the prompt and the
  resolver), not duplicated.
- SHOULD: Absorb PR #44 (safe-href rendering + prompt section list) into this branch so there
  is one coherent change; close #44.
- NICE: Voice mode speaks a short "taking you to X" confirmation and dismisses the overlay on
  navigate.

## Scope Boundaries

**In scope:**
- A `navigate` assistant tool + a new `navigate` stream event, handled on all three client
  surfaces.
- A canonical route resolver + section allowlist (`src/lib/assistant/routes.ts`).
- Vessel → active-lot resolution for the "tank history" case.
- Enriching `db_find` results and the create committers (`db_create`, template create) with
  routes/ids.
- SPA-link upgrade in `Markdown.tsx` (folding PR #44).
- Prompt guidance for the hybrid navigate/deep-link behavior.

**Out of scope (and why):**
- Building a dedicated `/vessels/[id]` detail/history page — deferred; we redirect tanks to
  their active lot instead (user-approved). Note it as a future nice-to-have.
- New per-record routes for reports, inventory, finished goods, bottling — no detail routes
  exist; the assistant links to the **section** page for these and says where to look.
- Backfilling ids/routes into *every* read tool. v1 enriches `db_find` (the id source) + the
  `navigate` tool (which resolves any supported entity on demand). Other read tools keep their
  current PII-lean shapes.
- Multi-lot/blend "which lot?" rich disambiguation UI — v1 picks the vessel's primary/most
  recent active lot and, if ambiguous, links the vessels list and says so.

## Research Summary

### Codebase Patterns
- **Stream protocol:** `AssistantEvent` discriminated union at `src/lib/assistant/run.ts:16-22`
  (`text | tool | proposal | conversation | error | done`); sole writer is `send` at
  `src/app/api/assistant/route.ts:62-64` (`JSON.stringify(e)+"\n"`, NDJSON). The union is
  **triplicated** — also `AssistantChat.tsx:34-40` and `voice/useVoiceSession.ts:36-42`.
- **Proposal precedent (the pattern to mirror):** write tools return
  `{ needsConfirmation, preview, token }`; `run.ts` `asProposal` guard (`run.ts:26-37`) detects
  the shape and emits a `proposal` event (`run.ts:108-120`) without mutating, then returns a
  tool_result telling the model to ask the user to confirm. A `navigate` action will mirror
  this exactly: tool returns `{ navigate: {...} }`, `run.ts` detects + emits a `navigate`
  chunk, returns a tool_result.
- **Tool registry:** `src/lib/assistant/registry.ts` (`AssistantTool` type lines 17-25;
  `ALL_TOOLS` 48-69; `getToolsFor` filters `adminOnly`). Schemas passed verbatim as
  Anthropic `input_schema` (`run.ts:67-71`).
- **Ids to the model:** ONLY `db_find` returns ids — `src/lib/assistant/tools/db-find.ts:32`
  returns `{ entity, results: [{ id, label }] }`. `query_brix` fetches block ids but strips
  them (`query-brix.ts:58,84`). No tool returns a URL.
- **Created-id timing:** `db_create` computes `newId` only at commit (`db-create.ts:62-63`),
  returns only `{ message }` (`:75`). So created-record navigation must come from the confirm
  path, not the stream.
- **Confirm flow (must not break):** `confirm.ts` (sign/verify, HMAC over `BETTER_AUTH_SECRET`,
  5-min TTL, nonce), `commit.ts` (`commitProposal` burns nonce before commit via
  `assistantConfirmation` insert; `COMMITTERS` map lines 28-39), confirm route
  `src/app/api/assistant/confirm/route.ts`. Client confirm at `AssistantChat.tsx:301-320`.
- **Client read loops:** text `AssistantChat.tsx:255-290` + `handle()` switch `259-272`; voice
  `useVoiceSession.ts:220-258` + `handle()` `224-236`. No shared parser.
- **Router:** `useRouter` from `next/navigation` is used only in `AppShell.tsx:5,228`; not
  imported anywhere under `src/app/(app)/assistant/`. AppShell is in the `(app)` layout
  (`src/app/(app)/layout.tsx:21`), so the dock + any assistant client can push routes.
- **Markdown:** `src/app/(app)/assistant/Markdown.tsx` custom renderer, inline handles only
  bold/code (`:71-101`). PR #44 adds `safeInternalHref` + `<a>` (relative "/" only, blocks
  `:`, `//`, `\`). A plain `<a>` full-reloads; SPA needs an onClick→router.push.
- **Route map (deep-link readiness):**
  | Entity | Detail route | Pattern | Param |
  |---|---|---|---|
  | Lots | YES (= ledger history) | `/lots/[id]` | `id` |
  | Work orders | YES | `/work-orders/[id]` (+`/execute`,`/print`) | `id` |
  | WO templates | YES | `/work-orders/templates/[templateId]` | `templateId` |
  | Vineyards | via query param | `/vineyards/harvest?vineyard=<id>`, `/vineyards/field-notes?vineyard=<id>` | — |
  | Vessels | **NO** — redirect to active lot | (`/lots/[activeLotId]`) | — |
  | Reports / inventory / finished-goods / bottling | NO | section list only | — |

### Prior Learnings
- **Plan 038 (`plan038-wo-assistant-template-authoring`, SHIPPED to main 89bcad9):** added the
  global assistant dock (AppShell) + 6 work-order template tools + a **D26/H8 eval-coverage
  HARD CI gate** ("add a golden case per new assistant write tool"). This branch predates 038,
  so the dock + template tools are on `main`, not here → **build off updated `main`**.
- **Raw SQL tenant scoping (`raw-sql-tenant-scoping`):** any resolution query must go through
  the tenant-scoped `prisma` / `runInTenantTx`, never ALS-only or raw. The `navigate` tool's
  id re-resolution must be tenant-scoped.
- **K12 (CLAUDE.md):** never read the ALS tenant inside a cached fn; pass ids explicitly.

### External Research
- Next.js 16 app router: SPA navigation from a click handler uses `useRouter().push(path)`
  from `next/navigation`; query-param targets (`/vineyards/harvest?vineyard=x`) are fine.
  Anchor `<a>` without interception triggers a hard nav — must `preventDefault` + push.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Consent model | **Hybrid**: explicit ask auto-navigates; incidental → link | Always auto; always confirm | User-approved; avoids yanking the user on incidental mentions while still delivering "just take me there". |
| Tank "history" target | **Redirect tank → active lot `/lots/[id]`** | Build `/vessels/[id]`; `/vessels?selected=` | Lot detail already IS the ledger history of the wine in the vessel; reuses existing UI; cheapest. New vessel page deferred. |
| How navigate is emitted | **`navigate` tool → `run.ts` detects → `navigate` stream chunk** (mirrors proposals) | Bare markdown link only; model emits raw path | Server builds + validates the path from a resolved id; model only expresses intent. Consistent with the proposal pattern already in the loop. |
| Path construction | **Server-side resolver `routes.ts`** from a resolved id | Let the model format URLs | Model never fabricates ids/paths; single source of truth; tenant/scope re-checked. |
| Created-record link | **Rides the confirm response**, rendered as a "View →" link (not auto-nav) | Auto-navigate after create; stream it | The new id only exists post-commit; creating is not an explicit "take me there", so link (hybrid). |
| Section allowlist location | **`routes.ts`, prompt generated from it** | Keep the hard-coded list in prompt.ts (PR #44) | One source; prompt + resolver can't drift. |
| PR #44 | **Absorb its 2 changes into this branch, then close #44** | Merge #44 first then rebase | One coherent, reviewable change; avoids a half-feature landing (links that go nowhere). |
| Tenant safety | **Re-resolve every entity id via tenant-scoped prisma + vineyard scope before building a path** | Trust ids that came from a tool | Defense in depth; a navigate call could carry a stale/guessed id; RLS + `scope.ts` must gate it. |

## Post-review revisions (council + eng + design — user-decided 2026-07-05)

These **supersede** the original decisions/units below where they conflict.

1. **Tank semantics — NO blind redirect.** "Tank N and its history" → an **in-chat summary**
   of the vessel's current contents with smart links: single active lot → its `/lots/[id]`
   link (+ offer to navigate); blend → list **each** active lot with its own link; empty →
   link the tanks list + recent Work Orders. (Reverses the earlier active-lot-redirect pick;
   both reviewers showed lot-history ≠ vessel-history and blends break single-lot resolution.)
   → **rewrites Unit 2 + Unit 3's vessel branch.**
2. **Consent is a server control, not prompt copy.** A per-turn **`allowAutoNavigate`** flag
   (derived from the user turn / UI) gates auto-nav; the tool refuses to auto-navigate when
   false. → **Unit 3 + Unit 4.**
3. **Auto-nav safety valve:** a 3-second "Navigating to {label}… [Cancel]" line **before**
   push, **and** a dirty-form guard (if the current view has unsaved edits, downgrade to a
   link, don't push). → **Unit 6 (+ dock Unit 8).**
4. **Voice: do NOT dismiss the overlay.** Navigate the page **behind** the overlay and speak
   "Showing {label} — what's next?"; keep the hands-free session alive. → **rewrites Unit 7.**
5. **Create → "View →" link** (not auto-nav). → **Unit 5 (already).**
6. **Cross-vineyard explicit request:** don't auto-switch tenant/vineyard context; return a
   "Switch to Vineyard B" link. → **Unit 3.**
7. **Extract one `assistant-events.ts`** (union + NDJSON parser + `isNavigate`/`isProposal`
   guards); all sites import it — kills the triplication BEFORE adding `navigate`. → **new
   Unit 0.**
8. **Ship as two PRs:** PR-A = Units 0–7, 9–11 (buildable now, absorbs #44); PR-B = Unit 8
   (dock, off updated `main`).
9. Folded-in fixes (no decision): `isSafeInternalPath` on server emit + client consume;
   `encodeURIComponent` on every dynamic id; honor `metaKey`/`ctrlKey`/middle-click; structured
   `{ok:false,reason}` failure contracts; discriminated `ref` (`by:id`|`by:name`); batch
   active-lot lookups (no N+1); **vineyard-scope check on vessel resolution**; a11y
   (`aria-live` + focus to destination `h1`); PR #44 color-token fallback fix. See the
   "Design: interaction states + a11y" section.

### Unit 0 (NEW): Shared assistant-events module

**Goal:** Single source for the stream contract so `navigate` is added in ONE place.
**Files:** `src/lib/assistant/assistant-events.ts` (new); refactor `run.ts`,
`AssistantChat.tsx`, `voice/useVoiceSession.ts` to import it; `test/assistant-events.test.ts`.
**Approach:** Move the `AssistantEvent` union here; add a `parseEvent(line)` NDJSON parser +
`isNavigate`/`isProposal` guards + `isSafeInternalPath`. Replace the three hand-copied unions
with imports (make-the-change-easy, then add `navigate`). No behavior change in this unit.
**Tests:** parser round-trips every event type; unknown type → ignored safely; `isSafeInternalPath`
rejects `//x`, `\x`, `/%2f/x`, `/a?next=//x`, `javascript:`, colon paths.
**Depends on:** none (do FIRST).
**Verification:** `npx vitest run test/assistant-events.test.ts` + full build (no drift).

## Implementation Units

### Unit 1: Canonical route resolver + section allowlist

**Goal:** One pure module that maps a supported entity + server-resolved id to its canonical
in-app path, and holds the section-route allowlist (superseding PR #44's inline list).
**Files:** `src/lib/assistant/routes.ts` (new); `test/assistant-routes.test.ts` (new).
**Approach:** Export `SECTION_ROUTES` (label → path, mirroring the routes the Explore agent
confirmed exist). Export `entityPath(entity, id)` for the entities with real targets
(`lot`→`/lots/${id}`, `workOrder`→`/work-orders/${id}`, `template`→`/work-orders/templates/${id}`,
`vineyard`→`/vineyards/harvest?vineyard=${id}`). Export `describeSectionsForPrompt()` returning
the bulleted list prompt.ts will inline. Keep it pure (no prisma) — id resolution lives in the
tool. Encode the `templateId` vs `id` param difference here so callers never guess.
**Tests:** every entity kind maps to the expected string; unknown entity throws; section list
contains only "/"-relative paths (guards against reintroducing off-site links).
**Depends on:** none
**Patterns to follow:** small pure lib like `src/lib/assistant/scope.ts`.
**Verification:** `npx vitest run test/assistant-routes.test.ts`.

### Unit 2: Vessel contents resolver

> **REVISED (see Post-review #1, #9):** returns the vessel's **contents projection**
> (single lot | list of blend lots | empty), NOT a single "active lot" — and applies the
> **vineyard-scope check** on the target lot(s). Feeds Unit 3's in-chat summary + links, not a
> blind redirect.

**Goal:** Given a vessel (by resolved id or name), return its current contents so the assistant
can summarize + link (single→one lot, blend→many lots, empty→none), scope-checked.
**Files:** `src/lib/assistant/scope.ts` (extend; `resolveVessel` already there ~line 119);
`test/assistant-vessel-resolve.test.ts` (new).
**Approach:** Add `resolveVesselActiveLot(vesselId)` using the tenant-scoped `prisma` (RLS).
Reuse the projection the vessels UI uses for a vessel's lots (`VesselsClient` links
`/lots/${lotId}`). Return `{ lotId }` for a single active lot; `{ ambiguous: true }` for a
blend/multi-lot vessel; `{ empty: true }` when none. No vineyard scope on vessels (they're
cellar equipment) but stay tenant-scoped.
**Tests:** single-lot vessel → lotId; empty vessel → empty; multi-lot/blend → ambiguous;
cross-tenant vessel id → not found (RLS).
**Depends on:** none
**Patterns to follow:** `scope.ts:119 resolveVessel`; lot linkage in `VesselsClient.tsx:98`.
**Verification:** `npx vitest run test/assistant-vessel-resolve.test.ts`.

### Unit 3: `navigate` assistant tool

> **REVISED (see Post-review #1, #2, #6, #9):** discriminated `ref` (`by:id`|`by:name`);
> structured `{ok:false,reason}` failures; honors the per-turn `allowAutoNavigate` flag
> (refuses auto-nav when false); vessel target → Unit 2 contents summary (no single redirect);
> cross-vineyard accessible record → return a "switch vineyard" link, don't auto-switch context.

**Goal:** A read-kind tool the model calls **only** on an explicit "take me there" request;
the server resolves + validates the target and returns a navigate payload.
**Files:** `src/lib/assistant/tools/navigate.ts` (new); `src/lib/assistant/registry.ts` (wire);
`test/assistant-navigate-tool.test.ts` (new).
**Approach:** `inputSchema` = a discriminated target: `{ kind:"section", section }` |
`{ kind:"entity", entity, ref }` where `ref` is an id (preferably from a prior `db_find`) or a
name. In `run`: for `section`, validate against `SECTION_ROUTES`; for `entity`, resolve `ref`
to a real id via the tenant-scoped path (reuse `db_find`/`scope.ts` resolvers; for `vessel`
call Unit 2 → active lot). On success return `{ navigate: { path, label } }`; on
empty/ambiguous/not-found return `{ message }` so the model can explain (e.g. "tank 11 is
empty — opening the tanks list"). `kind: "read"`, not `adminOnly`.
**Tests:** valid entity → correct path; section allowlist enforced; **cross-tenant / unknown
id → refused** (no path); vessel empty → message + section fallback; vessel ambiguous →
message; name that matches nothing → message.
**Depends on:** Unit 1, Unit 2
**Patterns to follow:** `db-find.ts` (resolution), registry entry shape `registry.ts:48-69`.
**Verification:** `npx vitest run test/assistant-navigate-tool.test.ts`.

### Unit 4: `navigate` stream event

**Goal:** Carry the tool's navigate payload to the client as a first-class stream chunk,
mirroring how proposals are surfaced.
**Files:** `src/lib/assistant/run.ts` (union + guard + emit); `src/app/api/assistant/route.ts`
(re-export type if needed).
**Approach:** Add `{ type:"navigate", path, label }` to the `AssistantEvent` union
(`run.ts:16-22`). Add an `asNavigation` type guard next to `asProposal` (`run.ts:26-37`). In
the tool-run branch (`run.ts:106-135`), when a tool returns a navigate shape, `send` the
`navigate` chunk and return a tool_result string ("Navigating the user to {path}; tell them
you're taking them there") — do not loop on it. Non-mutating, so no token/confirm.
**Tests:** covered via Unit 3 + a run-loop unit test asserting a navigate tool result emits a
`navigate` event and a tool_result (extend existing `test/assistant-*` run tests).
**Depends on:** Unit 3
**Patterns to follow:** proposal emit `run.ts:108-120`.
**Verification:** `npx vitest run test/assistant-run*.test.ts` (or the existing run-loop test).

### Unit 5: Enrich read-tool + committer return shapes with routes

**Goal:** Give the model real deep-link targets for the incidental-mention (link) path, and
make "link me to what you just created" work.
**Files:** `src/lib/assistant/tools/db-find.ts` (add `route` per result); `src/lib/assistant/commit.ts`
(committers return optional `{ navigate }`); `src/lib/assistant/tools/db-create.ts` and the
template create committer (return the new id/route); `src/app/api/assistant/confirm/route.ts`
(pass `navigate` through); `test/assistant-db-find.test.ts` (extend).
**Approach:** In `db-find.ts:32`, for entities in `entityPath`, add `route` alongside `{id,label}`
(built via Unit 1). In `commit.ts`, let committers optionally return `{ message, navigate }`;
`db_create`/template-create build `navigate` from the freshly created id (`db-create.ts:62`).
Confirm route returns `{ ok, message, navigate? }`.
**Tests:** db_find returns `route` for routable entities and omits it otherwise; create commit
returns a `navigate` link to the new record; non-routable create returns none.
**Depends on:** Unit 1
**Patterns to follow:** `db-find.ts:32`, committer shape `commit.ts:28-61`, `db-create.ts:55-76`.
**Verification:** `npx vitest run test/assistant-db-find.test.ts` + confirm-path test.

### Unit 6: Text-chat client — handle `navigate`, render create links (SPA)

> **REVISED (see Post-review #3, #9):** 3-sec "Navigating to {label}… [Cancel]" line before
> push; dirty-form guard downgrades to a link; `aria-live="assertive"` announce before push +
> focus to destination `h1`; honor metaKey/ctrlKey/middle-click on links.

**Goal:** The text chat executes navigate chunks (with countdown + dirty-form guard) and shows
a "View →" link on create-confirm.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`.
**Approach:** Extend the local union (`:34-40`) with `navigate`; add a `handle` branch (`:259-272`)
that calls `useRouter().push(path)` (import `useRouter` from `next/navigation`) and appends a
short "Taking you to {label}…" system line to the transcript. In `confirmProposal`
(`:301-320`), if the confirm response carries `navigate`, render a "View {label} →" link
(SPA) under the success message.
**Tests:** component-level or a lightweight handler unit test asserting a `navigate` chunk
triggers `router.push`; manual verification in Test Strategy.
**Depends on:** Unit 4, Unit 5
**Patterns to follow:** existing `handle` switch; `AppShell.tsx:228` router usage.
**Verification:** `npm run build`; manual (Test Strategy).

### Unit 7: Voice client — handle `navigate`, keep overlay open

> **REVISED (see Post-review #4):** do NOT dismiss the overlay. Navigate the page *behind* it
> and keep the hands-free session alive so the user can issue a follow-up command.

**Goal:** Voice mode navigates on explicit ask WITHOUT tearing down the session.
**Files:** `src/app/(app)/assistant/voice/useVoiceSession.ts`; `voice/VoiceOverlay.tsx`.
**Approach:** Extend the voice union + `handle` (`:224-236`) with a `navigate` branch that calls
`router.push(path)` while the overlay stays mounted (it's `zIndex:1000`, `VoiceOverlay.tsx:76-79`
— the page updates underneath). Speak "Showing {label} — what's next?" via the existing
sentence/TTS path. Do **not** call `stop()`/`onClose`. Verify the mic/session survive a route
change (AppShell-level state; if the overlay unmounts on `/assistant`→elsewhere, hoist the voice
session or render the overlay above the router outlet — confirm during build).
**Tests:** handler unit test: navigate chunk → push called, `stop` NOT called. Manual voice check.
**Depends on:** Unit 4
**Patterns to follow:** voice `handle` `:224-236`; teardown `useVoiceSession.ts:371-381`,
`VoiceOverlay.tsx:56-69`.
**Verification:** `npm run build`; manual voice run (Test Strategy).

### Unit 8: Global assistant dock — handle `navigate` (target `main`)

**Goal:** The floating dock (plan 038, on `main`) navigates the underlying page while itself
persisting (it lives in AppShell, so it survives route changes).
**Files:** the dock's stream-consumer component (added by plan 038 under `src/components` /
AppShell; confirm exact path after branching off updated `main`).
**Approach:** Same `navigate` branch as Unit 6 (push + brief in-dock "Taking you to…" line).
Because the dock is mounted in AppShell it already has router access and survives `push`. If
plan 038 shares a stream parser with the page, add the branch once there instead.
**Tests:** handler unit test parity with Unit 6.
**Depends on:** Unit 4, Unit 5; **requires branching off updated `main`** (dock present).
**Patterns to follow:** Unit 6; AppShell router `AppShell.tsx:228`.
**Verification:** `npm run build`; manual from a non-/assistant page (Test Strategy).

### Unit 9: Markdown SPA links (absorb PR #44)

**Goal:** Rendered links do SPA navigation, not full reload; fold in PR #44's safe-href
rendering so this branch is self-contained.
**Files:** `src/app/(app)/assistant/Markdown.tsx`; then close PR #44.
**Approach:** Bring in PR #44's `safeInternalHref` + link inline-token handling. Upgrade the
rendered `<a>` to intercept clicks: `onClick` → `preventDefault` + `useRouter().push(href)`
(keep `href` for middle-click/open-in-new-tab and a11y). Keep the "unsafe → plain text" rule.
**Tests:** relative "/" link renders an anchor; `javascript:`/`//`/`http` render as plain text
(port PR #44's intent into a `test/assistant-markdown.test.ts`).
**Depends on:** none (independent; do early to unblock link rendering)
**Patterns to follow:** PR #44 diff (`assistant-fix/cmr7ovcl`).
**Verification:** `npx vitest run test/assistant-markdown.test.ts`.

### Unit 10: Prompt guidance (absorb + extend PR #44)

**Goal:** Teach the model the hybrid rule and the navigate tool; generate the section list
from `routes.ts` so it can't drift.
**Files:** `src/lib/assistant/prompt.ts`.
**Approach:** Replace PR #44's hard-coded section list with `describeSectionsForPrompt()`
(Unit 1). Add: on an **explicit** "take me there / show me / go to", call the `navigate` tool;
for **incidental** references, include a markdown deep link **only** using a `route` a tool
returned; never fabricate an id or path; for entities without a detail route, link the section
and say where to look. Keep the scoping/permission rules intact (`prompt.ts:20`).
**Tests:** none (prompt copy); covered by Unit 11 eval goldens.
**Depends on:** Unit 1, Unit 3
**Patterns to follow:** `prompt.ts` "What you can do" + PR #44's "Linking to the app" block.
**Verification:** `npm run build`; eval goldens (Unit 11).

### Unit 11: Tests, eval goldens, and coverage gate

**Goal:** Prove the loop end-to-end and satisfy plan 038's D26/H8 eval-coverage CI gate.
**Files:** the assistant eval harness added in plan 038 (find under `test/` on updated `main`,
e.g. `test/assistant-eval*.ts`); aggregate any new `verify:` wiring if the repo pattern
warrants it.
**Approach:** Add golden eval case(s): (a) "take me to tank 11" → navigate to that vessel's
active lot; (b) "give me the link to the template you just made" → confirm response carries a
template `navigate` link; (c) a cross-tenant/guessed id is refused. Confirm the D26/H8 gate
passes (it requires a golden per new assistant write tool; navigate is read, but add coverage
regardless).
**Tests:** the goldens above + the unit tests from Units 1-9 all green.
**Depends on:** Units 1-10
**Patterns to follow:** plan 038 eval harness.
**Verification:** full `npx vitest run` green; the eval-coverage gate green; `npm run build`.

## Test Strategy

**Unit tests:** `routes.ts` (path building + allowlist), vessel→active-lot resolver (single/
empty/blend/cross-tenant), navigate tool (valid/section/cross-tenant-refused/empty/ambiguous),
db_find route enrichment, confirm-response navigate, Markdown safe SPA links, and per-surface
`handle` navigate branches.

**Integration / eval:** plan-038 assistant eval goldens for the three headline flows above.

**Manual verification (end-to-end, on updated `main` with the dock):**
1. From `/assistant`, "take me to tank 11" → app SPA-navigates to that vessel's active lot
   detail; transcript shows "Taking you to…". Empty tank → tanks list + spoken/typed reason.
2. "Create a template called X" → confirm → success message shows a working "View X →" link
   that SPA-navigates to `/work-orders/templates/[templateId]`.
3. From a non-/assistant page, open the **global dock**, "take me to my work orders" → the
   underlying page navigates, dock persists.
4. **Voice**: "show me lot ..." → overlay speaks a confirmation, dismisses, lands on `/lots/[id]`.
5. Incidental mention ("logged that on tank 11") → renders a clickable link, does **not**
   auto-navigate.
6. Adversarial: ask it to link `/etc` or an off-site URL, or a record from another tenant →
   no navigation/link (server refusal + Markdown safe-href).

## Design: interaction states + a11y (from design review)

Calibrated to DESIGN.md (warm editorial, motion tokens fast 120ms / normal 220ms, one wine
accent, sentence-case, no decorative animation).

```
STATE            | WHAT THE USER SEES
-----------------|--------------------------------------------------------------
navigating       | Calm one-line "Taking you to {label}…" appended to the transcript
                 |   (body text, 220ms fade, NOT a spinner/toast pile); then SPA push.
nav blocked      | Current view is dirty (unsaved form) → do NOT push. Render a link
 (dirty form)    |   "You have unsaved changes — open {label} →" + let the user choose.
empty vessel     | In-chat: "Tank 11 is empty right now." + link to /vessels (tanks list).
blend vessel     | In-chat: name each active lot with its own link; never silently pick one.
refused (scope)  | In-chat: "I can't open that — it's outside what you can see." No link.
stale / 404      | Destination page shows a graceful "this record was archived/merged"
                 |   state, not a raw 404 (link-render → click race).
create → view    | After a confirmed create, a "View {label} →" link under the success line.
```

**Accessibility (MUST):**
- Fire the "Taking you to {label}…" text inside an `aria-live="assertive"` region **before**
  `router.push`, and move focus to the destination page's `h1` after navigation (prevents
  screen-reader "teleportation").
- Rendered links keep a real `href` and honor `metaKey`/`ctrlKey`/middle-click (new tab); only
  plain left-click is intercepted for SPA nav. Link hit area ≥ 44px touch target.
- Link styling: use `var(--accent)` / the `text-wine` utility — **not** a hardcoded fallback
  hex. (PR #44 currently ships `var(--accent, #7b1e3b)`; `#7b1e3b` ≠ the real wine token
  `#722F37` — drop the fallback when absorbing #44.)

**Responsive:** on ≤767px the app uses a slide-in drawer (`.bw-mobile-bar`); an auto-nav must
close the drawer if open and land cleanly. The global dock (PR-B) must not cover the mobile
top bar after navigating.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Model fabricates an id/path and navigates the user to a wrong/foreign record | MED | HIGH | Server re-resolves every entity id via tenant-scoped prisma + `scope.ts`; only server-built paths are emitted; Markdown safe-href as defense-in-depth. |
| Branch drift: dock + template tools + eval gate live on `main`, not this branch | HIGH | MED | Branch off **updated `main`**; Unit 8 + Unit 11 explicitly depend on it. |
| Triplicated `AssistantEvent` union drifts (server vs 2 clients) | MED | MED | Add the `navigate` type to all three in the same units (4/6/7); consider (NICE) extracting a shared type later. |
| Auto-navigation yanks the user mid-read | MED | MED | Hybrid consent: only explicit intent auto-navigates; prompt + tool gate on it; incidental → link. |
| Voice overlay left on top after navigate | MED | LOW | Unit 7 fires existing teardown (`stop`+`onClose`) on navigate. |
| Vessel has no active lot / is a blend | MED | LOW | Resolver returns empty/ambiguous → link tanks list and explain; no dead nav. |
| `<a>` click interception breaks middle-click/open-in-new-tab or a11y | LOW | MED | Keep real `href`, only `preventDefault` on plain left-click; router.push otherwise. |

## Success Criteria

- [ ] Explicit "take me to X" SPA-navigates on text chat, voice, and the global dock.
- [ ] Incidental mentions render clickable SPA deep links (lots, work orders, templates,
      vineyards); non-routable entities link their section.
- [ ] "Link me to the template you just made" works via the confirm response.
- [ ] "Tank N history" lands on that vessel's active lot detail; empty/blend handled gracefully.
- [ ] Every navigable/linked record path is server-resolved + tenant/scope-validated; guessed
      or cross-tenant ids are refused.
- [ ] Write-confirmation flow unchanged; PR #44 absorbed and closed.
- [ ] plan-038 D26/H8 eval-coverage gate green; full `vitest run` + `npm run build` clean.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Direct operator feedback (`cmr7ovcly...`); the gap is verified in code. |
| Scope Boundaries | HIGH | Deferrals (vessel page, non-routable entities) are explicit and user-approved. |
| Implementation Units | MEDIUM | Units 8 & 11 depend on plan-038 file locations that live on `main`, not this branch — confirm exact paths after branching off updated `main`. |
| Test Strategy | MEDIUM | The plan-038 assistant eval harness path is unconfirmed on this branch; locate it before Unit 11. |
| Risk Assessment | HIGH | Tenant-safety mitigation (server-side id re-resolution) is the load-bearing control and is designed in. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex+Gemini) | `/council` | Cross-LLM 2nd opinion | 1 | issues_open | 7 critical; tank→lot semantics + prompt-only consent + cross-vineyard scope + path validation + event triplication (`council-feedback.md`) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 3 critical gaps (cross-vineyard leak, stale-id 404, path injection); recommend split PR-A/PR-B + extract shared events module |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score 5→7 (interaction-state table + a11y added to plan; PR #44 color-token fallback bug flagged); 3 UX decisions pooled |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** none — all 5 pooled decisions resolved by user 2026-07-05 (see Post-review revisions).
**VERDICT:** Plan revised & decision-complete across council + eng + design. Ready to implement as
PR-A (Units 0–7, 9–11) then PR-B (Unit 8, off updated `main`). Eng-review "issues_open" items are
folded into the revised units; re-run `/review` on the actual diff before landing each PR.
