---
title: Cellarhand v2 Phase 9 — assistant behaviour (draft-by-default, navigate to it, object context, degraded AI)
type: feat
status: approved (council-applied)
date: 2026-07-29
revised: 2026-07-29 — v2 after council
branch: claude/cellarhand-v2-phase-9-bd9d68
base: main @ f7040b7e
depth: deep
units: 6
class: C (not behind the domain gate; no RFC-001/002/003/004 dependency)
council: council-feedback-105-phase9-assistant-behaviour.md
---

## Overview

Phase 9 is four items off `11-implementation-sequence.md:171-180`. The handoff calls the risk **low** and
the dock **untouched**. The dock part is true. The low-risk part is not, because the handoff got the
current behaviour wrong on the item that matters most.

**The headline finding: the assistant does not create a draft today. It creates a draft and then
immediately issues it.** `src/lib/assistant/tools/propose-work-order.ts:544` calls `issueWorkOrderAction`
one line after the builder action returns, and the receipt reads *"Issued work order #N"*. The v2 spec is
explicit in the other direction — `03-interaction-spec.md:179`: **"A `WorkOrder` in `DRAFT`. Never
`ISSUED`."**

The transport for the navigation, by contrast, already exists and the handoff missed that too.
`CommitResult.navigate` (`commit.ts:19`) is returned by the confirm route (`confirm/route.ts:30`) and
consumed by the client (`AssistantChat.tsx:850-854`) — where it is rendered as a *"View X →" markdown
link* the user has to click. The work is upgrading a link to a navigation, not building a channel.

### What changed in v2 (council-applied)

Codex and Gemini reviewed v1 independently and converged on three weak points. Full record in
`council-feedback-105-phase9-assistant-behaviour.md`.

| Change | Why |
|---|---|
| **Draft-by-default, but an explicit "issue it" still issues** (Owner decision 1, revised) | Gemini: refusing to issue when the user's own words said *issue* turns an assistant into a slow form-filler. A manager dictating five explicit tasks would confirm-land-Issue five times |
| **`ProvenancePanel` (B33) is CUT from Phase 9** (Owner decision 4) | Codex: an invisible component with a null-return contract is prop surface and test churn for zero user value. It lands with its first real producer. Phase 9 is now three items, not four |
| **The navigation rule guards the SOURCE surface, not just the destination** | Codex: navigating away *from* the full `/assistant` page ends the session — the exact thing AC-W2 forbids. v1 only guarded the destination |
| **The link-only path must carry a durable target** | Codex: the nonce is burned, the link lives only in client state, history is text-only. Confirm → downgrade → refresh → the draft exists and is unreachable from the conversation |
| **A non-mutating issue preflight before the commit returns** | Codex: `issueWorkOrderAction` is where reservation conflicts surface. Deleting it turns "confirm failed" into "success now, failure later", with the nonce already burned |
| **A token-semantics guard across the deploy** | Codex: a card minted pre-deploy saying "issue", confirmed post-deploy, only drafts |
| **Object context: narrow parser + non-cached resolver + XML escaping** | Codex: the leak is cache poisoning, not RLS failure. And v1 never mentioned escaping values going into a prompt |
| **PR order inverted: the correctness fix ships first, the refactor follows** | Codex: do not front-run a high-risk domain change with a refactor |
| **"PR A is zero-behaviour-change" claim dropped** | Codex: swapping `<details>` for `Collapsible` changes DOM semantics |

## Problem Frame

**The job:** a manager asks for a round, gets a draft, lands on it, and fixes it by talking. Today they get
an issued work order, a receipt in the dock, and a link. If the draft is wrong they start over — and
because it is already `ISSUED`, the assignee has already been notified about a work order nobody vetted.

**But the inverse is also a real workflow.** A manager who says *"issue a work order to Mike to rack T3 to
T4"* was unambiguous. Forcing that through a draft costs a press for no safety gain — the human press
already happened on the card. v2 honours the verb the user actually used.

## Conflicts found against the handoff

Codex argued the v1 list was noisy and that only 1, 3, 5 and 8 are implementation-blocking. Agreed in part —
retained below with that severity split made explicit. **Conflict 4 is disputed and kept as blocking:** in
this repo, shipping a component with no acceptance criterion is a shipping-quality failure even when it is
not a code failure.

**Implementation-blocking:**

| # | Handoff claim | Reality |
|---|---|---|
| 1 | DM-55: "the client does not navigate today" | Materially wrong. The tool creates **and issues** (`propose-work-order.ts:544`); a `navigate` payload already reaches the client as a link |
| 3 | DM-58 "Ranking is off right now" is a Phase 9 item | The copy belongs to the **"Now" ranked queue** — Phase 5+, does not exist. No `/now` route; `SavedViews`/`Narrow` unbuilt |
| 4 | "written so each can become a test" | AC-W2 is the **only** acceptance criterion for Phase 9. B32 and DM-58 have none |
| 5 | Provenance is one concept | `ProvenanceBadge` (derived quantities, RFC-003, Phase 8) ≠ B33 `ProvenancePanel` (AI evidence, class C). Conflating them drags Phase 9 behind the domain gate |
| 8 | Dock untouched ⇒ nothing structural needed | The dock **unmounts** on `/assistant*` (`AssistantDock.tsx:226`) and history does not persist cards (`history.ts:12-27`) |

**Documentation drift — record, do not block:** §16's four-state table contradicts its own copy (2); the
registry holds 96 tools, not ~40 (6); Phase 9's stated Phase 5 dependency is unmet, items 1–3 need Phase 4
which shipped (7); `AIProposalCard` is an extraction, not new construction (10).

**Not a conflict:** (9) "AssistantDock is UNTOUCHED" vs object context — a provider *above* the dock is
fully compatible with not editing the dock. Codex is right; withdrawn.

**Separate problem, own ticket:** (11) `routes.ts:45-69` `SECTION_ROUTES` (22 labels) has drifted from
`src/lib/nav/sections.ts` and carries **no role gating** while the v2 nav gates `admin`/`requires`/
`vineyard`. The assistant will navigate a cellar hand to `/settings`. Unrelated to commit-result
navigation — **verify during QA (U6) and file it.**

## Requirements

- **MUST** a vague request produces a `WorkOrder` in `DRAFT`, never `ISSUED`.
- **MUST** an **explicit issue intent in the user's own words** may produce `ISSUED`, and only via a card
  whose primary action says so. The intent is decided **server-side at proposal time and signed into the
  token** — never re-derived at commit, never model-supplied.
- **MUST** issue blockers (reservation conflicts, readiness gates) surface **on the card**, not after the
  commit receipt. The nonce is burned before commit; there is no second chance.
- **MUST** on success the client navigates to the created object; the dock stays open; the conversation
  continues (AC-W2, DM-55).
- **MUST** navigation is suppressed when the **source** surface is `/assistant*` (the session would end),
  when the target is `/assistant*` (the dock would unmount), and when the path fails `isSafeInternalPath`.
- **MUST** when navigation is suppressed or cancelled, the target stays reachable from the conversation
  after a reload.
- **MUST** `router.refresh()` survives, in both the chat and the voice consumer.
- **MUST** a proposal token minted under the old contract cannot be confirmed under the new one.
- **MUST** zero schema change; zero new assistant tools; no RFC-001/002/003/004 surface touched.
- **MUST** `src/components/assistant/AssistantDock.tsx` is not edited.
- **MUST** the extracted card keeps the voice-confirm path — a cellar hand must not need to remove a glove.
- **MUST** no sparkle decoration, no gradient, no permanently open panel, no AI-only affordance for
  anything reachable without AI (`03-interaction-spec.md:183`).
- **MUST** keyboard hints read "Ctrl"; the `src/`-wide glyph scan (`test/search-palette.test.ts:57-79`)
  covers new components automatically.
- **SHOULD** the extracted card collapses the `AssistantChat` / `VoiceInlinePanel` duplicate.

## Scope Boundaries

**Out of scope, named:**
- **`ProvenancePanel` (B33) — cut from Phase 9.** Lands with its first real producer. See Follow-ups.
- The `SECTION_ROUTES` ↔ v2-nav drift and its missing role gating (Conflict 11) — verify, file, do not fix.
- The literal "Ranking is off right now" ranked-queue state — no host surface until Phase 5.
- Persisting proposal cards across reload generally (`history.ts:12-27`). U2 makes the *navigation target*
  durable; the broader card-persistence gap stays open.
- `ProvenanceBadge` / measured-vs-estimated (RFC-003, domain gate).
- B32's "Edit" secondary action — the spec names it, nothing in the app is its target. Do not invent one.
- A stale-draft retention policy (see Follow-ups).

## Research Summary

### The seams, verified against the working tree

| Concern | Location |
|---|---|
| Dock mounted as a sibling of `<main>`, survives client nav | `src/components/AppShell.tsx:580`, under `src/app/(app)/layout.tsx:55-57` |
| Dock unmounts on `/assistant*` | `src/components/assistant/AssistantDock.tsx:226` |
| Post-confirm side effect (the only one today) | `AssistantChat.tsx:863` (`router.refresh()`); mirror `voice/useVoiceSession.ts:306` |
| Commit result already carries a route | `commit.ts:14-20`; route `confirm/route.ts:30`; client `AssistantChat.tsx:850-854` |
| Rendered today as a link, not a navigation | `AssistantChat.tsx:1518`, `:1580-1584` |
| The auto-issue | `propose-work-order.ts:534-556` (issue at `:544`) |
| Stale-token rejection precedent | `propose-work-order.ts:513-517` (`schemaVersion` hard-reject) |
| Explicit-intent-from-the-user's-own-words precedent | `tools/navigate.ts:26-32` (`EXPLICIT_NAV` over `ctx.lastUserMessage`) |
| Nonce burned **before** commit | `commit.ts:201-203` (P2002 → "already confirmed") |
| Existing auto-nav machinery (3s cancellable, unsaved-work aware) | `AssistantChat.tsx:295-329` (`router.push` at `:323`) |
| Proposal sanitiser — an unnamed construction site | `assistant-events.ts:165-178` (`asProposal` rebuilds drafts to strip tokens) |
| Path safety gate, both ends | `assistant-events.ts:39-50` |
| Route builder | `routes.ts:21-38` (`entityPath`) |
| Card, duplicated | `AssistantChat.tsx:1479-1589`; `voice/VoiceInlinePanel.tsx:250` |
| Card gating, already pure + tested | `src/lib/assistant/proposal-card.ts:12-73` |
| Request body shape (the `timeZone` precedent) | `AssistantChat.tsx:713-719`; read at `api/assistant/route.ts:38-57` |
| Prompt build + appended-block precedent | `prompt.ts:9`; `run.ts:132`, `:141-157` (`<open_bug_clarification>`) |
| Tool registry | `registry.ts:143-240` — 96 tools |

### The tension with plan 081, stated so it is not re-litigated

Plan 081 **killed a regex write-intent classifier**, on the grounds that in this domain the write verbs are
the query verbs (*"When did we last **rack** T4?"*), so a false positive proposes a write nobody asked for.

**This is not that.** Here we are already inside a confirmed write proposal; the only question is whether
the single human press also issues. A false positive is bounded — the user still reads a card that says
"Review & issue" and presses it. The detection also runs **server-side on the user's own last message**
(the `navigate.ts:26-32` pattern), never on model output, and its result is **signed into the token** so it
cannot be re-derived or tampered with at commit time. If the winemaker judges even that too loose, the
fallback is Owner decision 1's "always draft", which costs one press.

### Prior learnings that apply

- `assistant-overclaim-write-guard.md` — prefer a deterministic code guard over a prompt tweak.
- `assistant-write-refresh-and-wo-routing.md` — `router.refresh()` after every write, or stale data.
- `plan104-phase3b-ia-gap.md` — user-facing chips are their own leak surface: no ids, no emails.
- `preview-start-uses-session-cwd.md` — the dev server compiles this worktree, not main.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Item 1's real content | Draft by default; **explicit issue verb still issues**, via a "Review & issue" card | The spec's rule is *no write without a human press*, not *no write*. The press is the gate; the verb decides what it does |
| Where issue-intent is decided | **Server-side at proposal time, signed into the token** | Model-supplied or commit-time-re-derived intent is tamperable. The signed payload is the only trustworthy carrier |
| Issue blockers | A **non-mutating preflight** runs before the commit returns; blockers land on the card | The nonce burns before commit (`commit.ts:201-203`). A deferred failure has no retry path |
| Old tokens | Rejected under the new contract, reusing the `schemaVersion` mechanism | A pre-deploy card must not silently do something else post-deploy |
| Navigation mechanism | Reuse the existing 3s cancellable countdown, **plus** source-surface suppression and a durable fallback | Codex over Gemini here: the timer is not the defect, the missing rules are. One mechanism, and the unsaved-work downgrade is real safety |
| Link-only durability | The path goes into the plain-text message body that history **does** keep | Otherwise a confirmed draft becomes unreachable after a reload |
| Object context transport | A provider in `src/app/(app)/layout.tsx` + a **client bridge component** a server page renders | `page.tsx` is a server component and cannot call a client setter. The provider keeps `AssistantDock.tsx` byte-unchanged |
| Object context lifetime | **Cleared on pathname change** | A persistent dock would otherwise keep injecting the record the user already left |
| Object context trust | Narrow parser → **non-cached** resolver taking explicit `(tenantId, entity, id)` → **XML-escape** before injection | The leak is cache poisoning, not RLS failure (repo invariant K12). And the injection point is a prompt |
| Availability gate | **One server-owned check**, shared by the dock and `/api/assistant` | Otherwise the dock says "unavailable" while the route still streams and fails later |
| B33 ProvenancePanel | **Cut from Phase 9** | Zero user value until a producer exists |
| Component strategy | Extract **after** the correctness fix, as a literal DOM-identical extraction | Do not front-run a domain change with a refactor |
| New tools | **Zero** | Nothing needs one; the registry is at 96 |

## Implementation Units

Ordered so the correctness fix ships first.

### Unit 1: Draft by default, explicit issue still issues — the commit-path change

**Goal:** "Review & create" leaves a `DRAFT`; "Review & issue" is offered only when the user's own words
asked for it; issue blockers surface before the press, not after.
**Files:** `src/lib/assistant/tools/propose-work-order.ts`, `src/lib/assistant/confirm.ts` (token payload),
`src/lib/assistant/issue-intent.ts` (new, pure), `src/lib/work-orders/` (locate or extract the non-mutating
readiness/reservation validator), `test/assistant-issue-intent.test.ts` (new),
`test/assistant-work-order-draft.test.ts`, `test/assistant-confirm-draft-integration.test.ts` (new)
**Approach:** Three changes that must land together.

1. **Intent.** A pure `issue-intent` module reads an explicit issue verb off `ctx.lastUserMessage`, in the
   shape of `navigate.ts:26-32`'s `EXPLICIT_NAV`. It runs **server-side at proposal time**; its boolean is
   **signed into the proposal token** and read back at commit. Never model-supplied; never re-derived from
   a message at commit time.
2. **Preflight.** Before the committer returns, run a **non-mutating** validator over the same reservation
   and readiness rules `issueWorkOrderAction` enforces, so a would-be blocker renders on the card while the
   token is still unburned. Locate the existing gate first — `gateWorkOrderReadinessForWrite` is named in
   plan 081 and re-runs readiness at commit; prefer extracting a read-only path from it over writing a
   parallel rule set.
3. **The branch.** Draft intent → create only, receipt is the approved copy (`09-content-terminology.md:175`):
   *"Created from your question, HH:MM. Nobody can see it on the floor until you issue it."* Issue intent →
   create + issue, receipt keeps today's shape. Either way the `navigate` payload is returned. The dead
   `catch` recovery branch at `:551-556` only exists to handle an issue failure and goes with it on the
   draft path. Add the **token-contract rejection** alongside the existing `schemaVersion` hard-reject at
   `:513-517` so a pre-deploy card cannot be confirmed under the new semantics.

`issue_operation_wo` and `commitIssueCapManagementWo` are separate explicitly-asked-for intents and are
**not** in scope.
**Tests:** the intent module exhaustively (explicit verb, query phrasing that merely contains a write verb,
absent message, model-supplied value ignored); draft path yields `DRAFT` + navigate + **no issue emission**;
issue path yields `ISSUED`; a blocker surfaces pre-commit rather than post-receipt; a second confirm hits
the P2002 "already confirmed" path; an old-contract token is rejected.
**Depends on:** none — ships first
**Execution note:** test-first
**Blast radius:** `verify:work-orders`, `verify:work-order-nl`, `verify:universal-work-order-authoring`,
`verify:work-orders-enhancements`. Note that **nothing** in `test/` or `scripts/` references
`commitProposeWorkOrder` or the string "Issued work order" — that is the *absence* of coverage, not
evidence of safety, which is why the integration test above is mandatory rather than nice-to-have.
**Verification:** the three test files; the four verify scripts

### Unit 2: Navigate on create (DM-55 / AC-W2)

**Goal:** After a confirmed create, actually go there — dock open, conversation continuing — without ever
ending the session or stranding the record.
**Files:** `src/lib/assistant/post-commit-nav.ts` (new, pure), `src/app/(app)/assistant/AssistantChat.tsx`,
`src/app/(app)/assistant/voice/useVoiceSession.ts`, `src/lib/assistant/assistant-events.ts` (typed confirm
response parser), `test/post-commit-nav.test.ts` (new)
**Approach:** A pure decision function taking the navigate payload, the **current pathname (the source)**,
and whether there is unsaved work; returning **navigate | link-only**. Rules:
- link-only when the **source** is `/assistant*` — the full page does not survive navigation and the nav
  would end the session (this is the rule v1 missed);
- never when the **target** is `/assistant*` — the dock unmounts there;
- never when the path fails `isSafeInternalPath`;
- link-only when already on the target (refresh only);
- link-only when there is unsaved work.

**On every link-only outcome the target path is written into the plain-text message body**, which
`history.ts:12-27` does persist — otherwise a confirmed draft becomes unreachable after a reload, with the
nonce already burned. Feed the decision into the **existing** countdown at `AssistantChat.tsx:295-329`
rather than adding a second `router.push` site; the countdown's cancel affordance must be keyboard-
reachable. Keep `router.refresh()` at `:863`. Mirror the whole change in `useVoiceSession.ts:306` — the two
have drifted before. Add a **typed parser for the confirm response**: the exhaustive `AssistantEvent`
switch does not cover it, so the `never` default will not catch a shape change here. Arrival moves focus to
the page `<h1>` per `03-interaction-spec.md:181` and §7 — confirm the route change already does this rather
than adding a second mechanism.
**Tests:** the pure module, one case per rule, plus "no navigate payload" and "link-only writes a durable
path".
**Depends on:** Unit 1 (for the end-to-end story; technically shippable alone)
**Execution note:** test-first
**Verification:** `npx vitest run test/post-commit-nav.test.ts`; browser proof in Unit 6

### Unit 3: Extract `AIProposalCard` (B32) — one card, two callers

**Goal:** Collapse the duplicated private card into one exported component matching B32's anatomy.
**This is not a zero-behaviour-change refactor** and the PR must not claim it is — see below.
**Files:** `src/components/ui/AIProposalCard.tsx` (new), `src/components/ui/index.ts`,
`src/app/(app)/assistant/AssistantChat.tsx`, `src/app/(app)/assistant/voice/VoiceInlinePanel.tsx`,
`src/app/styleguide/page.tsx`, `DESIGN.md`, `test/ui-primitives.test.ts`
**Approach:** Prefer a **literal extraction with identical DOM semantics** first; treat the
`<details>/<summary>` → `Collapsible` swap (`AssistantChat.tsx:1635`, `:1688`) as a **second, separately
reviewable commit**, because it changes DOM semantics and this repo's component tests are source-contract
assertions over `.tsx` text. Compose `Card` (replacing the hand-rolled surface at `:1536-1548`), `Alert`,
`Eyebrow`, `StatusChip`, `Button`. Reuse `proposalGate()` / `readDraftGaps()` from
`src/lib/assistant/proposal-card.ts` **unchanged**. Draft state carries text + glyph via `StatusChip`, not
the colour-only dashed edge alone (`:1529-1546`). Delete the hardcoded `var(--warning, #a66a00)` at `:1667`.
Render only actions that resolve — no "Edit" until it has a target. The primary action's label is driven by
Unit 1's signed intent: "Review & create" or "Review & issue".

**The voice path is a hard requirement, not a nice-to-have.** Chat assumes a mouse; voice assumes gloves. A
cellar hand must be able to say "confirm it" from three feet away rather than removing a glove to tap. The
extracted component carries the voice-confirm intent explicitly; verify against `useVoiceSession`'s existing
confirm handling before deleting the `VoiceInlinePanel` copy.

Also update `asProposal` (`assistant-events.ts:165-178`) if the card's details shape grows — it rebuilds
the proposal object and will silently strip anything new.
**Tests:** extend `test/ui-primitives.test.ts` source-contract assertions (no hardcoded hex, no sparkle
glyph or prohibited vocabulary, tokens only, barrel-exported, styleguide entry). `test/assistant-draft-card.test.ts`
and `test/assistant-card-lifecycle.test.ts` stay green.
**Depends on:** Unit 1 (the card's primary label depends on the signed intent)
**Patterns to follow:** `src/components/ui/Alert.tsx`, `src/components/ui/Collapsible.tsx`,
`src/components/work-orders/WorkOrderReadinessPanel.tsx`
**Verification:** `npx tsc --noEmit`; `npx vitest run test/ui-primitives.test.ts test/design-static-guards.test.ts test/assistant-draft-card.test.ts`

### Unit 4: Page → dock object context (DM-56)

**Goal:** The conversation continues on the object the user is looking at, without becoming a cross-tenant
read or a prompt-injection seam.
**Files:** `src/components/assistant/AssistantObjectContext.tsx` (new provider + client bridge),
`src/app/(app)/layout.tsx`, `src/app/(app)/assistant/AssistantChat.tsx`,
`src/app/(app)/assistant/voice/useVoiceSession.ts`, `src/app/api/assistant/route.ts`,
`src/lib/assistant/run.ts`, `src/lib/assistant/object-context.ts` (new, pure),
the first consumer page under `src/app/(app)/work-orders/[id]/`, `test/assistant-object-context.test.ts` (new)
**Approach:** The provider mounts in the `(app)` layout beside `UnitsProvider` / `WineryTimeZoneProvider` /
`CurrencyProvider`. A **server** `page.tsx` cannot call a client setter, so it renders a **small client
bridge component** that publishes `{entity, id}`. The context is **cleared on pathname change**, or the
persistent dock keeps injecting the record the user already navigated away from. `AssistantChat` consumes
it. **`AssistantDock.tsx` is not edited.**

Transport copies the `timeZone` precedent: a fifth key on the POST body (`AssistantChat.tsx:718`,
`useVoiceSession.ts:367`), but read through a **narrow parser for a whitelisted `ObjectContextHint`** rather
than the inline `unknown` casts the route uses today (`route.ts:38-57`).

**Security, three layers, all required:**
1. The client value is a **hint**, never a fact.
2. The server re-resolves it in a **non-cached** function taking explicit `(tenantId, entity, id)` args.
   Passing the tenant explicitly is the repo's K12 invariant; the leak this prevents is **cache poisoning**
   — tenant A primes an entry for `id=X`, tenant B reads A's materialised title — which happens *even
   though Postgres RLS is correct*.
3. Resolved values are **XML-escaped** before being appended to the prompt near `run.ts:132`, in the shape
   of `<open_bug_clarification>` (`:141-157`) so the cached prefix survives.

An unresolvable or out-of-tenant id **resolves to nothing and injects nothing** — it must not throw, or a
pasted foreign URL 500s the dock for the session.
Dock copy on arrival per `09-content-terminology.md:176`.
**Tests:** the pure module — shape validation, unknown entity rejected, oversized/garbage input rejected,
escaping applied, absent context serialises to nothing, a stable serialisation (prompt-cache friendliness).
**Depends on:** none structurally; sequence after Unit 2 so the arrival copy has an arrival to attach to.
**Verification:** `npx vitest run test/assistant-object-context.test.ts`; `npx tsc --noEmit`

### Unit 5: Degraded-AI state (DM-58, rescoped)

**Goal:** When the assistant is unavailable, say so where the user is, from one source of truth, and prove
nothing else degrades.
**Files:** `src/lib/assistant/availability.ts` (new, pure + a server-side gate),
`src/app/api/assistant/route.ts`, `src/app/(app)/assistant/AssistantChat.tsx`,
`src/app/(app)/assistant/page.tsx`, `test/assistant-availability.test.ts` (new)
**Approach:** Build SC-12's row — *"AI unavailable | The dock says so; the page and the manual New work
order flow are unaffected"* (`02-screen-inventory.md:285`). Shape: `unavailableReason: string | null`,
matching `src/lib/voice/settings-types.ts:5` and `proposal-card.ts:22`; resolved from a capability gate
mirroring `hasVoyageCredentials()` (`knowledge/env.ts:11-13`) and `voiceEnabled()`.

**One server-owned check, shared.** The same gate must guard `/api/assistant`, or the dock says
"unavailable" while the route still attempts a stream and fails later with a different message. Do not fork
client and server truth.

The disabled composer gets a real surface, never `opacity` (`Button.tsx:123`). Prose voice per
`ForecastStrip.tsx:88`.

**The anti-AI-only assertion is the point:** `03-interaction-spec.md:183` forbids AI-only affordances. Test
that the manual "New work order" route and the command palette are reachable and unaffected when the
assistant is down — `CommandPalette.tsx:18-22` already states this contract, so assert it.

**Deferred:** the literal "Ranking is off right now" / plain-queue copy (`09-content-terminology.md:183`) —
it belongs to the Phase 5+ ranked queue. Record the deferral against DM-58 in the matrix.
**Depends on:** none
**Verification:** `npx vitest run test/assistant-availability.test.ts`

### Unit 6: The missing acceptance criteria, and QA at a non-admin role

**Goal:** Close Conflict 4, and stop inheriting the non-admin blind spot.
**Files:** `docs/design/cellarhand-v2-handoff/12-acceptance-criteria.md`,
`docs/design/cellarhand-v2-handoff/08-data-dependency-matrix.md` (DM-58 rescope, DM-57/B33 deferral),
`test/e2e/phase9-assistant.spec.ts` (new), `NOW.md`, `TODOS.md`
**Approach:** Write the criteria the handoff omitted — an AC-C for B32's anatomy and its never-sparkles
rule, an AC-W for the explicit-issue variant, an AC for the degraded state's everything-else-unaffected
clause, and an AC-A for the arrival focus move. Then AC-W2 end to end in Playwright against Demo Winery on
`:3007` with `E2E_BASE_URL` (`playwright.config.ts:15,41-46` honours it).

**The non-admin pass is not optional.** Every browser pass so far ran as the Demo Winery owner. Run the
dock, both card variants, the navigation and the arrival at a **plain user** and a **vineyard manager**.
While there, check Conflict 11 — whether the assistant will navigate a non-admin into an admin-gated
section — and **file it as its own ticket rather than fixing it here.**

Demo Winery only, `QA-*` fixtures, cleaned up, `verify:naming` green before and after. The user performs
any login themselves.
**Depends on:** Units 1–5
**Verification:** `npm run qa:a11y`; `npx playwright test phase9-assistant`; `npm run verify:naming`

## Failure-Branch Table

| Branch | Outcome | Unit |
|---|---|---|
| Vague request confirmed | `DRAFT` created, nothing issued, navigate returned | U1 |
| Explicit "issue it" confirmed | `ISSUED` created via a card that said "Review & issue" | U1 |
| Issue blocker exists (reservation conflict) | Surfaces **on the card**, before the nonce burns | U1 |
| Pre-deploy token confirmed post-deploy | Rejected, with a regenerate message | U1 |
| Second confirm of the same token | P2002 → "This change was already confirmed." | U1 |
| Commit succeeds, navigation allowed | Navigate after the countdown; dock stays open; `router.refresh()` runs | U2 |
| Source surface is `/assistant*` | **Link-only** — navigating would end the session | U2 |
| Target is `/assistant*` | Link-only — the dock unmounts there | U2 |
| Path fails `isSafeInternalPath` | Dropped at the server gate and again at the client | U2 |
| Already on the target route | `router.refresh()` only, no push | U2 |
| Unsaved work on the current page | Link-only, **and the path is written into the durable message body** | U2 |
| Countdown cancelled, then reload | Target still reachable from the transcript | U2 |
| Commit fails | "Couldn't create that draft. Nothing was written." + Retry + Build it by hand | U3 |
| Voice user confirms hands-free | Voice-confirm path works on the extracted card | U3 |
| Object context absent | Prompt block omitted; behaviour identical to today | U4 |
| Object context references another tenant's id | Resolves to nothing, injects nothing, **does not throw** | U4 |
| User navigates away from the context'd page | Context cleared; the dock stops injecting the old record | U4 |
| Assistant unavailable | Dock says so **and** `/api/assistant` refuses from the same gate; palette, manual New work order and recording unaffected | U5 |

## Test Strategy

**Pure-module unit tests** (the only kind that can test decisions here — no jsdom/RTL): `issue-intent`,
`post-commit-nav`, `object-context`, `availability`.

**One integration test, mandatory** (`test/assistant-confirm-draft-integration.test.ts`): around the
committer or `/api/assistant/confirm`, asserting status is `DRAFT`, `navigate` is returned, **no issue
emission occurs**, and a second confirm hits the P2002 path. Nothing in `test/` or `scripts/` currently
references `commitProposeWorkOrder` or "Issued work order" — that gap is why this is not optional.

**Typed parsers, not the event union.** Units 1, 2 and 4 change confirm JSON and request-body shape, not the
NDJSON union, so the exhaustive `switch`'s `never` default will not fire. Add explicit parsers for
`/api/assistant` and `/api/assistant/confirm` and audit `CommitResult.navigate` consumers directly.

**Source-contract assertions** for the extracted card, matching `test/ui-primitives.test.ts` and
`test/design-static-guards.test.ts`. The `src/`-wide Mac-glyph scan picks up new files automatically.

**Playwright** for AC-W2 end to end, the explicit-issue variant, and the arrival focus move; `qa:a11y` for
WCAG.

**Evals.** Phase 9 adds no tools, so the D26 coverage guard has nothing to say; the goldens assert tool
selection and argument shape, not commit receipts, so U1's message change should not move them — a
prediction, not a guarantee. **Run `eval:assistant` before and after U1 and diff.** If a golden moves, fix
it deliberately and say so; do not loosen an assertion.

**Manual.** The non-admin pass in U6. This family has historically been caught by live QA, not tests.

## Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Deferred issue failure with the nonce already burned | MED | **HIGH** | The U1 preflight; blockers surface on the card, before the press |
| A confirmed draft becomes unreachable after a reload | MED | **HIGH** | U2 writes the path into the durable message body on every link-only outcome |
| Post-confirm nav from `/assistant*` ends the session | MED | **HIGH** | Source-surface suppression in the U2 pure module, tested |
| Explicit-intent detection fires on a query ("when did we last rack T4?") | MED | MED | Bounded: the user still reads and presses a card that says "Review & issue". Detected server-side on the user's own words, signed into the token. Fallback is always-draft |
| Object context becomes a cross-tenant read via cache poisoning | LOW | **HIGH** | Non-cached resolver with explicit tenant args (K12); narrow parser; XML escaping |
| A pasted foreign URL 500s the dock | MED | MED | Unresolvable context injects nothing and does not throw — explicit branch, tested |
| Stale object context injected after navigation | MED | MED | Cleared on pathname change |
| Pre-deploy token confirmed under new semantics | LOW | MED | Token-contract rejection reusing the `schemaVersion` mechanism |
| Chat and voice consumers drift again | MED | MED | Both edited in the same unit; typed parsers, since the `never` default does not cover this |
| The extraction changes card behaviour by accident | MED | MED | Literal DOM-identical extraction first; the `Collapsible` swap is a separate commit |
| Voice-confirm path lost in the extraction | MED | **HIGH** | Explicit requirement + verified against `useVoiceSession` before the duplicate is deleted |
| Dock and server disagree about availability | MED | MED | One server-owned gate, shared |
| A golden moves on U1 | LOW | MED | Diff `eval:assistant` before/after |
| **Draft graveyard** — managers confirm and forget to issue | MED | MED | New, from council. No retention policy exists. Out of scope; filed as a follow-up |
| The non-admin pass finds the nav/role gap is worse than expected | MED | MED | Already out of scope and ticketed |
| `test/assistant-commit-tenant-context.test.ts` reds the suite | HIGH | LOW | Known transform-cost flake, documented in-file at `:60-69`. Re-run in isolation before calling it a regression |

## Success Criteria

- [ ] A vague request leaves a `WorkOrder` in `DRAFT` with **no issue emission** — proven by a
      `runAsTenant("org_demo_winery", …)` read-back, not by the UI
- [ ] An explicit "issue it" still issues, via a card whose primary action said "Review & issue", with the
      intent resolved server-side and carried in the signed token
- [ ] An issue blocker surfaces on the card before the nonce burns, not in a post-commit receipt
- [ ] A token minted under the old contract cannot be confirmed under the new one
- [ ] The client navigates to the created object; the dock stays open; the next sentence continues the same
      conversation (AC-W2, in the browser)
- [ ] Navigation is suppressed when the source **or** target is `/assistant*`, and every suppressed case
      leaves a target that survives a reload
- [ ] `router.refresh()` still runs after every assistant write, in chat and in voice
- [ ] `AIProposalCard` is one component with two callers; the `VoiceInlinePanel` duplicate is gone; a voice
      user can still confirm hands-free
- [ ] An out-of-tenant object context injects nothing and does not throw; context clears on navigation
- [ ] The assistant-unavailable state is one server-owned gate, and the palette + manual New work order flow
      are provably unaffected
- [ ] `src/components/assistant/AssistantDock.tsx` is unchanged — `git diff` on that path is empty
- [ ] Zero schema change; zero new assistant tools; no RFC-gated surface touched
- [ ] Acceptance criteria exist for B32, the explicit-issue variant, the degraded state and the arrival focus
- [ ] Verified at a **non-admin** role (plain user and vineyard manager), and the `SECTION_ROUTES`
      role-gating gap is filed as its own ticket
- [ ] All gates green: `npx tsc --noEmit`, `npx eslint` (0 errors), `npm run test`,
      `npm run verify:ai-native`, `npm run eval:assistant` (diffed against the pre-U1 run),
      `npm run qa:a11y`, `npm run verify:naming`

## Recommended PR split

Inverted from v1 per council: the correctness fix ships first, the refactor follows.

| PR | Units | Why it is its own PR | Risk |
|---|---|---|---|
| **B1** — `fix(assistant): Review & create leaves a draft; an explicit "issue it" still issues` | U1 | **The behaviour change.** Small diff, large blast radius, carries the preflight and the token-contract guard. Must not be buried in a refactor | **HIGH** |
| **B2** — `feat(assistant): navigate to the created object, keeping the conversation` | U2 | The navigation rules are subtle enough (source suppression, durable fallback) to deserve their own review | MED |
| **A** — `refactor(assistant): AIProposalCard as one component` | U3 | Behind B1 because the card's primary label depends on B1's signed intent. **Not billed as zero-behaviour-change** | MED |
| **C** — `feat(assistant): pages pass object context to the dock` | U4 | New transport with a cache-poisoning edge and a prompt-injection surface. Deserves its own security read | MED |
| **D** — `feat(assistant): degraded-AI state + the Phase 9 acceptance criteria` | U5, U6 | Smallest; carries the doc corrections + the non-admin QA record | LOW |

State in **PR B2** that the **standalone `/assistant` page degrades**: it does not survive client
navigation, which is exactly why B2 suppresses navigation when the source is that page. AC-W2 is written
against the dock, the supported surface.

## Follow-ups this plan identified

1. **`ProvenancePanel` (B33) + DM-57.** Cut from Phase 9. Lands with its first real evidence producer.
   When it does: the rule is *"the **provenance panel** is not shown"*, **not** *"the statement is not
   shown"* — Gemini's failure sequence is that gating the assistant's answer on an unwired predicate mutes
   correct answers and reads as a broken assistant. Re-read `05-design-system-v2.md:445` with that
   distinction before building.
2. **`SECTION_ROUTES` role gating** (Conflict 11). The assistant's 22-label route allowlist has no role
   gating while the v2 nav does. File after the U6 non-admin pass confirms the behaviour.
3. **Stale-draft retention.** Removing the auto-issue creates abandoned `DRAFT` work orders. No policy
   exists. Wants the winemaker's judgement on whether they expire, get surfaced, or just accumulate.
4. **Button copy: "Review & create" vs "Save as Draft".** Gemini argues the verb should name the state it
   produces. The handoff's approved copy says "Review & create" (`05-design-system-v2.md:438`).
   Spec-vs-clarity tension — an owner call, deliberately not resolved here.
5. **Proposal-card persistence across reload** (`history.ts:12-27`). U2 makes the navigation target durable;
   the general gap stays open.

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | **HIGH** | The auto-issue was read directly at `propose-work-order.ts:534-556`; the spec contradiction is verbatim; both reviewers agreed on the direction |
| Conflicts found | **HIGH** | Every one checked against the working tree with file:line; severity re-sorted after Codex disputed the list, with the one dispute I did not accept stated |
| Scope Boundaries | **HIGH** | B33's removal and the three out-of-scope items are named with reasons and routed to follow-ups |
| Implementation Units | **MEDIUM-HIGH** | U1's preflight is the residual unknown — it depends on how cleanly a read-only path extracts from the existing issue gate, which needs a look before estimating. U2–U5 land on read code with precedents to copy |
| Test Strategy | **MEDIUM-HIGH** | The integration test closes the real gap. Residual: no jsdom means the card is source-asserted plus Playwright — the same gap every UI change here has |
| Risk Assessment | **HIGH** | Raised from MEDIUM-HIGH: council surfaced four failure sequences v1 missed, and each now has a named mitigation and a branch-table row |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/council` | Correctness, types, contracts | 1 | **APPLIED** | 6 CRITICAL, 7 SHOULD FIX, 3 design questions — PR order inverted, B33 cut, four unnamed failure sequences added |
| Gemini Review | `/council` | Product logic & UX | 1 | **APPLIED** | 3 CRITICAL, 2 SHOULD FIX, 3 design questions — supplied the explicit-issue middle ground that reopened Owner decision 1, and the "not shown" misreading |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** COUNCIL APPLIED — three owner decisions revised (explicit-issue honoured, countdown kept with
its gaps closed, B33 cut). Full record in `council-feedback-105-phase9-assistant-behaviour.md`. Ready for
`/work` starting at PR B1.
