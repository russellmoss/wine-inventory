---
title: Inline conversational voice mode in the assistant dock
type: feat
status: reviewed
date: 2026-07-21
branch: claude/conversational-mode-ui-d4a6a3
depth: standard
units: 8
reviews: council (Codex + Gemini) · eng · design
---

## Overview

Voice mode today opens a full-screen opaque curtain. The winemaker says "show me what's in Tank T5",
the assistant navigates there and keeps talking, and the user sees none of it, because the voice UI is
painted over the page. This plan retires the curtain and rebuilds voice as an inline mode of the
existing assistant dock: a small orb in the dock's title bar, the conversation in the dock's own
transcript, and persistent Interrupt / End controls. The page stays visible and clickable throughout.

**This was scoped as a pure presentation swap. Review proved it is not** — see Unit 3. Letting the user
type during a live voice session breaks the assistant's memory unless the session's history is
synced. That is a real engine change, small but genuine, and it is the highest-risk item here.

## Problem Frame

**Who has this problem:** anyone using hands-free voice on the cellar floor or at a desk. The point of
talking to an ERP is "take me there and tell me what I'm looking at." Today you get the telling
without the looking.

**What is actually broken:**

- `VoiceOverlay.tsx:114` is `position: fixed; inset: 0` filled with opaque `--surface-page`.
- `useVoiceSession.ts:318-325` already calls `router.push(evt.path)` mid-conversation and keeps the
  loop alive. The navigation the user wants **already works**. It is invisible.
- `useVoiceSession.ts:306-315` speaks *"I've put a draft on screen... Have a look at the card"* while
  the overlay covers that card. Voice mode instructs the user to look at something it is hiding. A
  shipped defect, not a missing feature.
- `VoiceOverlay.tsx:72-105` installs a Tab focus trap and `aria-modal="true"`, so even a transparent
  overlay would keep the page keyboard-unreachable.

**Cost of doing nothing:** voice stays a novelty. Its highest-value behavior is built, paid for, and
unreachable.

## Requirements

- **MUST** — voice runs inside the dock; the page behind stays visible, scrollable, clickable, and
  keyboard-reachable.
- **MUST** — no `aria-modal`, no focus trap, no `position: fixed; inset: 0` in the voice UI.
- **MUST** — a compact orb + state word in the dock title bar, centered, without breaking drag-to-move.
- **MUST** — Escape while voice is live ends **voice only**, never the dock.
- **MUST** — Interrupt always rendered, inert unless speaking, so the control row never reflows.
- **MUST** — the composer stays usable; `🎙 Talk` becomes `⏹ End` in place.
- **MUST** — **a typed message during a live voice session must reach the voice session's history.**
  (Unit 3. Without this the assistant silently forgets what you typed.)
- **MUST** — a typed message must not start a second assistant turn while a voice turn is in flight.
- **MUST** — voice write-confirmations pinned above the composer, never scrollable out of view.
- **MUST** — every interaction state specified: first-run, listening, thinking, speaking, error,
  mic-denied, voiceprint-mismatch, confirm-pending, ended.
- **MUST** — orb motion gated so it animates only while audio is flowing (`DESIGN.md` motion policy).
- **SHOULD** — reclaim vertical space while voice is live; the dock's default 440×620 is tight.
- **SHOULD** — screen-reader announcements do not fire on every listen/think/speak cycle.
- **NICE** — retire `VoiceOverlay.tsx` by reusing the inline panel on `/assistant` (Unit 7, separable).

## Scope Boundaries

**In scope:** the pure presentation-logic module, `VoiceHeaderOrb`, `VoiceInlinePanel`, the
session-history continuity fix, status plumbing to the dock, Escape ownership, transcript behavior
during voice, and the composer/layout changes.

**Out of scope:**

- **Hoisting the voice session into a global provider** so it survives navigation off `/assistant` —
  declined by the user. The dock already survives navigation via `AppShell.tsx:422`.
- **Any change to STT/TTS, VAD, barge-in, wake word, voiceprint gating, or the tool loop.** Unit 3
  adds one method to `VoiceSession`; it changes no voice *behavior*.
- **Any change to the confirmation / nonce security path.**
- **Tablet-specific auto-expand** (design D5) — user chose one behavior on every device. → TODO.
- **Touch-target debt** — the dock's existing header controls are already under 44px and `DESIGN.md`
  documents no minimum. Pre-existing, repo-wide. → TODO.
- **Global hotkeys for Interrupt/Confirm** (WCAG 2.4.1, council Q4) — real gap, real scope. → TODO.
- **Two-tab mic/TTS collision** (council Q5) — pre-existing, not caused by this change.
- **Adding jsdom + RTL** — would make 4 untestable components testable; a repo-wide tooling decision.
- **Renaming "Interrupt" → "Stop talking"** (UX rule 5) — copy polish, should not gate the plan.

## Research Summary

### Codebase Patterns

| Fact | Location | Why it matters |
|---|---|---|
| Voice engine is a pure hook, decoupled from chrome | `useVoiceSession.ts:108`, type at `:76-96` | the UI swap is safe; only Unit 3 touches the type |
| **Session history is snapshotted at mount, only ever appended by voice turns** | `useVoiceSession.ts:132`, sends at `:277`, appends at `:400`/`:469` | **the P0.** Nothing syncs a typed message in |
| Voice turns already mirror into the transcript | `AssistantChat.tsx:494`, wired `:968` | the transcript IS the caption stream; parity verified |
| **Every completed assistant message grows a FeedbackBar** | `AssistantChat.tsx:807-815` | voice turns would sprout 👍/👎 in a 440px panel |
| **Transcript force-snaps to bottom on every change, unconditionally** | `AssistantChat.tsx:447-462` | you cannot scroll up during a voice session |
| Orb already takes a size prop, reduced-motion aware | `AudioVisualizer.tsx:23` | 28px header orb is a prop |
| Title bar is `space-between`, center empty | `AssistantDock.tsx:301-337` | where the orb goes |
| Title bar is the drag handle, bails only on `closest("button")` | `AssistantDock.tsx:179-183` | a `<canvas>` is not a button → collision |
| **Dock Escape defers to voice via an `aria-modal` DOM query** | `AssistantDock.tsx:132` | breaks silently when `aria-modal` is removed |
| Dock mounts in the app shell | `AppShell.tsx:422` | survives navigation; `/assistant` page does not |
| Dock hides itself on `/assistant` | `AssistantDock.tsx:187` | Unit 7 must respect this |
| `active={open}` force-closes voice; chat stays mounted `display:none` | `AssistantDock.tsx:340`, `AssistantChat.tsx:160-164` | `display:none` ≠ unmount → gate on `active &&` |
| Text chat navigation uses a 3s cancellable countdown | `AssistantChat.tsx:984` | voice diverges deliberately (D4) |
| `focusNotice` renders in exactly one place | `VoiceOverlay.tsx:180-184` | delete it and voiceprint feedback vanishes |
| Test env is `node`, no jsdom | `vitest.config.ts:15` | **no component test is possible** |
| Dock clamps to `min(440, vw×0.94) × min(620, vh×0.80)` | `AssistantDock.tsx:43-51` | phone ≈ 94% width; only tablet is a small-orb band |

### Prior Learnings

- `assistant-dock-history-shipped.md` — no jsdom/RTL; assistant UI is manual-QA-only. Drives Unit 1.
- `assistant-confirm-card-below-fold-fix.md` (#203/#216) — a confirm card below the fold read as
  "Confirm does nothing". Far easier to hit in 440×620. Motivates the pinned card.
- `preview-start-uses-session-cwd.md` — QA against the checkout with the edits; prefer
  `get_page_text`/`read_page` over screenshots.
- `voice-mode-barge-self-interrupt.md` — voiceprint gating was never wired into the live loop. This
  plan relocates the focus controls, it does not activate them.

### External Research
None needed. No new dependencies, no unfamiliar APIs.

## Key Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Typed-message history continuity | add `appendHistory(turn)` to `VoiceSession`; the panel pushes typed turns in | disable the composer during voice; do nothing | Doing nothing means the assistant silently forgets what you typed — the exact failure that destroys trust in an assistant. Disabling the composer removes the "mic misheard the lot number" escape hatch that motivated it. |
| Typed-send concurrency | send guard becomes `busy \|\| voiceTurnActive`, where active = any state other than `listening`/`idle` | allow it; block all typing | Typing while it listens is the real use case. Typing while it is mid-reply produces two concurrent assistant turns on one conversation. |
| Orb state → dock header | `onVoiceStatus` reported from an **effect** with primitive deps; parent stores the enum + a `getLevel` **ref** | callback during render; context; portal | A render-phase call trips React 19's cross-component update warning. An object identity in the dep list re-renders the dock (and the 1388-line chat subtree) every child render. |
| Escape ownership | the **dock** is the single Escape owner and routes internally | two sibling `window` listeners; keep the `aria-modal` query | Two listeners on one target is order-dependent and stale-closure-prone — the same class of bug being removed. |
| Escape rollout | Units 5 lands the Escape rewrite **in the same commit** as the panel, plus a temporary dual guard | rewrite it early in its own unit | Deleting the `aria-modal` guard before the replacement exists collapses the dock mid-conversation. |
| Orb motion | animates **only** on `listening`/`speaking`; static on `thinking`/`idle`; exception logged in `DESIGN.md` | always live; slow breathing only | `DESIGN.md:109-115` bans decorative animation. Gating it on audio-flow makes the motion encode information, which is what the policy actually permits. |
| Voice navigation | stays **instant** (unlike the text chat's 3s countdown); divergence documented | match the text chat; instant + undo | Asking out loud IS the confirmation, and the assistant announces it. A countdown you must reach over and tap defeats hands-free. |
| Tablet sizing | no special-casing; one behavior on every device | auto-expand 768–1024px; larger orb on tablet | User's call. Phone is already ~94% width; only tablet is affected, and it can be added later without rework. → TODO. |
| Focus-action logic | lives in `src/lib/voice/focus.ts` beside the existing label logic | a parallel model in `inline-ui.ts` | `focus.ts` already owns focus mode and its label (`test/voice-focus.test.ts:31`). Splitting one domain across two modules is the DRY violation. |
| Fate of `VoiceOverlay.tsx` | retire in Unit 7 — **separable** | keep both UIs | Two voice UIs is a standing maintenance tax. Not required for the user's goal, so it is isolated. |

## Implementation Units

### Unit 1: Pure presentation logic

**Goal:** put every presentation *decision* into testable pure functions, since components cannot be
tested in this repo.
**Files:** `src/lib/voice/inline-ui.ts` (new), `test/voice-inline-ui.test.ts` (new),
`src/lib/voice/focus.ts` (extend), `test/voice-focus.test.ts` (extend)
**Approach:** follow the existing `src/lib/voice/` convention (isomorphic, no React, no DOM — same
shape as `speech.ts`, `vad.ts`). `inline-ui.ts` exports: a state→label map for the header word; an
announcement reducer `(prev, next, ctx: { turnCount })` returning a string or `null`; and an
orb-motion predicate (animate only on `listening`/`speaking`). The **focus-action derivation goes into
`focus.ts`**, not here — that module already owns focus mode and its label. Rename
`test/voice-focus.test.ts:31`'s *"labels modes for the overlay"*, which names a thing Unit 7 deletes.
**Tests:** label for all 6 `VoiceState` values incl. `error`. Announcement returns `null` for
`listening→transcribing→thinking→speaking→listening` cycling; returns a string for `idle→listening`,
any→`error`, and `speaking→listening` only at `turnCount === 0`; boundary cases at turnCount 0/1/2.
Motion predicate true only for `listening`/`speaking`. Focus action: "Open to anyone" when `my_voice`,
"My voice" only when `team_session` **and** profile `active`, absent otherwise — a faithful extraction
of `VoiceOverlay.tsx:152-165`, not a redesign.
**Depends on:** none · **Execution note:** test-first
**Verification:** `npm run test -- voice-inline-ui voice-focus`

### Unit 2: `VoiceHeaderOrb`

**Goal:** the compact orb + state word for the dock title bar.
**Files:** `src/app/(app)/assistant/voice/VoiceHeaderOrb.tsx` (new)
**Approach:** thin wrapper over `AudioVisualizer` at `size={28}` plus the Unit 1 label, in a
`pointer-events: none` container so it cannot start a title-bar drag (not a `closest()` bail-out — the
next person adding a header element would re-break that). Motion gated by Unit 1's predicate.
`aria-hidden="true"` — the panel owns the single live region, so the state is announced once, not
twice. Label hides below ~380px panel width; the orb persists. Design tokens only, no hardcoded values
(UX rule 7).
**Tests:** none possible (component).
**Depends on:** Unit 1
**Verification:** manual — Unit 8 scenarios 1, 7, 13.

### Unit 3: Voice-session history continuity + send guard  ⚠️ **the P0**

**Goal:** a typed message during a live voice session reaches the assistant, and cannot start a
competing turn.
**Files:** `src/app/(app)/assistant/voice/useVoiceSession.ts`,
`src/app/(app)/assistant/AssistantChat.tsx`
**Approach:** `historyRef` (`:132`) is snapshotted at mount and only ever appended by voice turns
(`:400`, `:469`), while `:277` sends it to the API. Add an `appendHistory(turn)` method to the
`VoiceSession` type so the chat can push a typed turn (and its reply) into the live session's history,
respecting the same `MAX_HISTORY` trim at `:470-471`. Separately, `send()`'s guard at `:500` is
`!text || busy`, and `busy` is the **text chat's** flag which a voice turn never sets — widen it to
also block while a voice turn is in flight (any state other than `listening`/`idle`).
**Tests:** extract the history-merge/trim decision into a pure helper in `src/lib/voice/` and unit-test
it (append, ordering, `MAX_HISTORY` overflow). The wiring itself is manual — Unit 8 scenario 14, which
is **mandatory** under the regression rule.
**Depends on:** none (independent of the UI work; land it early)
**Verification:** `npm run test -- voice` + scenario 14.

```
BEFORE (broken by "composer stays usable")        AFTER (Unit 3)
  type ──> items[]                    ✅            type ──> items[]            ✅
       └─> historyRef                 ❌                 └─> appendHistory()    ✅
  say  ──> historyRef ──> POST /api/assistant       say  ──> historyRef ──> POST (complete)
           "make what 23?"                                   "Updated to 23."
```

### Unit 4: `VoiceInlinePanel` — the de-modalized voice UI

**Goal:** replace the full-screen shell with a strip that lives inside the dock.
**Files:** `src/app/(app)/assistant/voice/VoiceInlinePanel.tsx` (new)
**Approach:** same `useVoiceSession` wiring and mount-once-start / unmount-stop lifecycle as
`VoiceOverlay.tsx:36-56`.

**Deleted:** the `fixed; inset: 0` shell, opaque background, `role="dialog"`, `aria-modal`, the Tab
focus trap (`:72-105`), the standalone ✕ (`:129-148`), the 220px orb, the captions list (`:196-231`).

**Kept and relocated — explicitly, so nothing is dropped by omission:**
- the error line + its "switch to text" escape hatch,
- the focus-mode control,
- **`focusNotice` + its `unmatchedBursts >= 2` danger escalation** (`VoiceOverlay.tsx:180-184` — the
  only render site in the codebase; deleting it would leave `src/lib/voice/focus.ts` computing a
  string nobody sees),
- **the first-run helper line** (`:259-261`), shown only until the first voice turn lands, then retired,
- the `ProposalCard`, extracted to module scope so both call sites share it.

**Layout:** two stacked rows above the composer — the pinned `ProposalCard` (with `max-height` +
internal scroll so a tall card cannot crush the panel) and a control row with Interrupt (always
present; `aria-disabled` + no-op handler rather than the `disabled` attribute, so it stays announced
and focusable) plus the focus action. `Button size="sm"` (34px) to protect the vertical budget.

**States (all nine specified):** first-run · listening · thinking · speaking · error ·
**mic-denied** (`NotAllowedError`, in winery-plain language per UX rule 5 — *"I can't hear you — the
browser is blocking the mic for this site"*, not a `getUserMedia` string) · voiceprint-mismatch ·
confirm-pending · **ended** (a static mic-off glyph + "Voice ended" for ~2s at `--duration-normal`,
then back to the plain title — UX rule 2, no dead-ends).

Owns the single `aria-live="polite"` region, fed by Unit 1's reducer, coordinated with the two live
regions that already exist (`AssistantChat.tsx:1271` draft details, `:988` NavToast assertive). Reports
status upward via callback. Escape ends the session and returns focus to the End button. Stays lazily
imported, as the overlay is at `AssistantChat.tsx:25-26`.
**Depends on:** Unit 1

### Unit 5: Dock integration, Escape ownership, and chat wiring — **ONE COMMIT**

**Goal:** the orb reaches the title bar and Escape stops being a landmine.
**Files:** `src/components/assistant/AssistantDock.tsx`, `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:** `AssistantChat` takes an optional `onVoiceStatus` prop, reported **from an effect with
primitive deps** (`voiceOpen`, `session.state`) — never during render, and never with a
freshly-allocated object in the dep list. The dock stores the state enum as a primitive and `getLevel`
in a ref.

Two consumers: the title bar becomes a 3-column grid (`1fr auto 1fr`) with the orb centered and the
middle column shrinking first; and the Escape handler at `AssistantDock.tsx:128-138` becomes the
**single owner** — voice live → end voice, else collapse/close. Ship a temporary dual guard
(`voiceStatus || document.querySelector('[role="dialog"][aria-modal="true"]')`) so the window between
this and Unit 7 is safe. Update the stale comment at `:125-127`, which describes a mechanism that will
no longer exist. Reset status to `null` on dock close so a collapse-while-speaking leaves no stale orb.

In the chat: render the panel on `active && voiceOpen` (`display:none` is not unmount — the recorder
would keep running); keep the existing `prevActive` render-phase reset at `:160-164`, which is React's
sanctioned adjust-state-on-prop-change pattern and is what makes teardown synchronous. Talk flips to
`⏹ End` in place (same DOM button, so focus survives the label change). Send / Report bug / textarea
stay live. Hide the Converse/Transcribe toggle row (already disabled during voice) and collapse the
disclaimer to reclaim ~40px. Apply a `min-height` (~60px) floor to the transcript so a virtual keyboard
cannot crush it to zero.

**⚠️ Units 5 must be one commit.** Deleting the `aria-modal` guard before the panel that replaces it
exists means one Escape collapses the dock mid-conversation.
**Depends on:** Units 2, 3, 4

### Unit 6: Transcript behavior during a live voice session

**Goal:** the shared transcript has to behave like a caption stream, not a text chat.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`
**Approach:** two changes, both invisible until voice is live.
1. **Suppress `FeedbackBar`** (`:807-815`) on turns while a session is live. Voice turns mirror into
   the same `items` array, so without this every spoken reply grows a 👍/👎 pair you cannot act on by
   voice, in the panel where vertical space is the binding constraint.
2. **Relax the unconditional autoscroll** at `:447-462`. It force-snaps `scrollTop = scrollHeight` on
   every change with no near-bottom check; the comment at `:450-457` justifies this as the #203
   mitigation. Now that the **pinned card** guarantees the confirm button stays visible, the snap can
   become conditional (near-bottom only), so a user can actually scroll up and read during a
   conversation. **Do not remove the rAF-deferred instant scroll** — `behavior:"smooth"` was measured
   unreliable under streaming re-renders.
**Tests:** the near-bottom predicate is pure — unit-test it.
**Depends on:** Unit 5
**Verification:** manual scenarios 15-16.

### Unit 7 (SEPARABLE): Retire `VoiceOverlay.tsx`

**Goal:** one voice UI instead of two.
**Files:** `src/app/(app)/assistant/AssistantChat.tsx`; delete
`src/app/(app)/assistant/voice/VoiceOverlay.tsx`
**Approach:** use `VoiceInlinePanel` on `/assistant` too. **The non-embedded layout must be specified
explicitly** — Unit 5's composer, vertical-reclaim, and mount-point changes are all `embedded &&`
gated, and `/assistant` is `embedded === false`, so none of them apply there. Orb goes beside the
`<h1>` at `AssistantChat.tsx:740`; panel mounts above the composer in the non-embedded branch; the
vertical reclaim is skipped (the full page has room). Delete the overlay and its lazy import
(`:25-26`). Drop the dual Escape guard from Unit 5 once the overlay is gone.
**Known limitation to document, not fix:** on `/assistant` the chat unmounts on navigation, so a
voice-triggered `router.push` ends the session there. Already true today — the overlay lives in the
same page component — so no regression. The dock is the supported surface.
**Depends on:** Unit 6 · **Drop this unit if you would rather keep the overlay.**

### Unit 8: Manual QA + docs

**Goal:** prove it, then write down what changed.
**Files:** `AGENTS.md`, `DESIGN.md` (decision log), `NOW.md`, `TODOS.md`
**Approach:** QA per `CLAUDE.md`'s in-app-browser flow, **Demo Winery only**, dev server from the
checkout with the edits, user logs in once in the pane, reads via `get_page_text`/`read_page` rather
than screenshots. Then: update `AGENTS.md`'s `## Assistant voice mode` section, which documents a
"full-screen overlay" that will no longer exist; **log the orb-motion exception in `DESIGN.md`'s
decision table** (`:133-153`) so the deviation from "no decorative animation" is recorded rather than
silently standing; file the three TODOs; stamp `NOW.md`.
**Depends on:** Unit 6 (Unit 7 if taken)

## Test Strategy

**Automated (the honest ceiling):** `vitest.config.ts:15` is `environment: "node"` — no jsdom, no RTL.
**No component in this plan can be unit-tested.** Units 1, 3, and 6 exist partly to push as much
decision-making as possible into pure functions that *can* be. New/extended:
`test/voice-inline-ui.test.ts`, `test/voice-focus.test.ts`, plus the history-merge and near-bottom
helpers. All existing `test/voice-*.test.ts` must stay green.

**Integration:** none. No routes, no schema, no tenant surface. `verify:*` suites unaffected.

**Gates note (so `/work` does not re-derive it):** `src/lib/voice/inline-ui.ts` is **not** a `*-core.ts`,
so `verify:ai-native` does not apply. `src/lib/voice/` is **not** in
`.claude/hooks/inject-brain-context.mjs`'s governed list, so no invariant note and no `INVARIANTS.md`
entry are needed.

**Manual verification — the real gate:**

1. Open the dock on `/vessels`, hit Talk. Orb centered in the title bar, page still visible.
2. "Show me what's in Tank T5." Page navigates **and you can see it** while the assistant narrates.
3. During narration: scroll and click the page behind the dock. Both work.
4. Tab through the page while voice is live. Focus is not trapped.
5. Interrupt visible and inert while listening; active and effective while speaking.
6. Escape once → voice ends, dock stays open. Escape again → dock closes.
7. Drag the title bar from dead center (on the orb) → panel moves.
8. Type a message mid-session and Send. It goes through; voice keeps running.
9. Ask for a write. Confirm card pinned above the composer, fully visible at 440×620, confirmable by
   tap **and** by saying "confirm."
10. Close the dock with `×` while speaking. Audio stops, mic releases, no stale orb on reopen.
11. Resize to minimum; re-run 1, 5, 9.
12. Screen reader: one announcement at session start, not four per turn.
13. `prefers-reduced-motion` on; and orb is **static** during `thinking`, moving during listen/speak.
14. **MANDATORY REGRESSION.** Start voice, type "log 22.4 Brix for Block 3", Send, then *say*
    "make it 23". The assistant must resolve the reference. Fails today.
15. Ten rapid voice turns — no 👍/👎 bars appear.
16. Scroll up mid-conversation — the view stays put; a new turn does not yank you down.
17. Deny mic permission → plain-language message + "switch to text", not a stuck "Listening…".
18. First-ever session → helper line present; after the first turn → gone.
19. End voice → "Voice ended" appears briefly, then the plain title.
20. Tablet (~768px) and phone (~375px) → run 1, 5, 9.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Typed turn invisible to the voice session — assistant "forgets"** | **HIGH if unfixed** | **HIGH** — silent, reads as the assistant being broken | Unit 3 `appendHistory` + scenario 14 (mandatory regression) |
| Escape collapses the dock once `aria-modal` is deleted | HIGH if mis-ordered | MED | Unit 5 is one commit + a temporary dual guard. Scenario 6 |
| Concurrent text + voice turns on one conversation | MED | MED | send guard widened to `busy \|\| voiceTurnActive` (Unit 3) |
| Confirm card clipped — a repeat of #203 | MED | **HIGH** — this bug already shipped once | pinned outside the scroller, `max-height` + internal scroll; scenarios 9, 11, 20 |
| `focusNotice` / helper line deleted by omission | was HIGH | MED | both now on Unit 4's explicit keep-list |
| Virtual keyboard crushes the transcript to 0px | MED | MED | transcript `min-height` floor + card `max-height` (Unit 5); scenario 20 |
| Status callback re-renders the chat subtree | LOW | MED | effect-driven, primitive deps, `getLevel` behind a ref (Unit 5) |
| Orb reads as decorative / cheap in peripheral vision | MED | LOW | motion gated to audio-flow states + logged `DESIGN.md` exception |
| Mic left running behind `display:none` | LOW | **HIGH** — a hot mic is a trust event | render on `active && voiceOpen`; scenario 10 |
| **Zero automated coverage on the UI itself** | HIGH (structural) | MED | stated, not hidden. 20 manual scenarios are the compensating control |

## Success Criteria

- [ ] With voice live, the app behind the dock is visible, scrollable, clickable, Tab-reachable.
- [ ] "Show me Tank T5" navigates and narrates, and the user sees the destination.
- [ ] No `aria-modal`, no focus trap, no `fixed; inset: 0` remains in the voice UI.
- [ ] Escape ends voice without closing the dock; a second Escape closes the dock.
- [ ] Dragging the title bar from the orb still moves the panel.
- [ ] Interrupt is always present, inert unless speaking; the row never reflows.
- [ ] **A typed message during a live voice session is understood by the next spoken turn.**
- [ ] A typed message cannot start a second assistant turn mid-reply.
- [ ] A voice write-confirmation is fully visible and confirmable at default and minimum dock sizes.
- [ ] All nine interaction states render as specified.
- [ ] The orb is static during `thinking`; the exception is logged in `DESIGN.md`.
- [ ] No feedback bars on voice turns; scrolling up mid-conversation is not overridden.
- [ ] New pure-logic tests pass; all existing `test/voice-*.test.ts` stay green.
- [ ] `npm run lint` and `npx next build` clean.
- [ ] `AGENTS.md` describes the inline dock UI, not an overlay.

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | verified against source, including the self-contradicting "look at the card" line |
| Scope Boundaries | HIGH | every deferral is an explicit user decision or a filed TODO |
| Implementation Units | HIGH | every touch point is a known `file:line`; no new dependencies |
| Test Strategy | **LOW** | structural: `environment: "node"` means the UI cannot be automatically tested. Units 1/3/6 salvage what they can; 20 manual scenarios carry the rest. Raising this requires adding jsdom + RTL — a separate decision |
| Risk Assessment | MED-HIGH | raised from MED: the Escape coupling, the history divergence, and the two delete-by-omission losses were all found by reading and are now handled. Residual unknown: whether 440×620 holds up with the card pinned — scenario 11 surfaces it early |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (cross-LLM) | `/council` | Independent 2nd opinion | 1 | issues_found | 7 critical, 5 design questions, 4 improvements; 3 amended on source check |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_found | 6 issues, 2 critical gaps, 5 test gaps, 1 mandatory regression |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_found | score 5/10 → 8.4/10, 3 decisions escalated + resolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CROSS-MODEL:** Codex and Gemini overlapped on nothing — Codex found React-lifecycle defects, Gemini
found a11y/IxD gaps. Three Gemini findings were wrong on the premise but pointed at real, different
defects (transcript is not a live region; autoscroll never pauses, it force-snaps). The eng and design
passes each found a P0/P1 class issue neither council model reached: the history divergence, and the
`focusNotice` deletion-by-omission.

**UNRESOLVED:** 0. Three design decisions (orb motion, navigation timing, tablet sizing) were escalated
and answered by the user.

**VERDICT:** COUNCIL + ENG + DESIGN CLEARED — ready to implement. Unit 3 first; Unit 5 must be one commit.
