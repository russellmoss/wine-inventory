# Council Feedback — Plan 089: Inline conversational voice mode in the assistant dock

**Date**: 2026-07-21
**Plan**: `docs/plans/2026-07-21-089-feat-inline-voice-in-dock-plan.md`
**Reviewers**: Codex `gpt-5.4` (React correctness + lifecycle), Gemini `gemini-3.1-pro-preview` (a11y + interaction design)

> Written plan-adjacent rather than to the repo-root `council-feedback.md`, which holds the committed
> record for plan 047 (voice focus / wake word) and should not be clobbered.

Every finding below was re-checked against the actual source before being accepted. Three were wrong
on the premise but pointed at a real defect anyway; those are marked **AMENDED** with what the code
actually says.

---

## Critical Issues

### C1. `onVoiceStatus` upward callback is a render-loop / React-warning hazard — ACCEPT
**Source:** Codex. **Unit 3.**
"AssistantChat calls `onVoiceStatus(status | null)` upward" is unsafe as written. If it fires during
render, React 19 warns *"Cannot update a component while rendering a different component."* If it
fires from an effect keyed on a freshly-allocated `{state, getLevel}` object, the dock re-renders on
every child render — and the dock re-render pulls the whole `AssistantChat` subtree with it.

**Fix:** notify from an effect with primitive deps only (`voiceOpen`, `session.state`). Parent stores
the state enum as a primitive and holds `getLevel` in a ref, never in the status object's identity.
Publish only when a lifecycle-visible field actually changes.

### C2. Unit ordering ships a silent Escape regression — ACCEPT
**Source:** Codex. **Units 3 → 5.**
Unit 3 deletes the `aria-modal` guard at `AssistantDock.tsx:132`, but the inline panel that reports
status does not exist until Units 4-5. In between, the **old overlay is still the live path** and the
guard is gone: one Escape collapses the dock mid-conversation. The plan asserted the mitigation was
"in the same unit"; it is not — it is in the same *plan*, three units apart.

**Fix:** either merge Unit 3's Escape rewrite into Unit 5, or ship a temporary dual guard
(`if (voiceStatus || document.querySelector('[role="dialog"][aria-modal="true"]')) return;`) until the
overlay is gone. Dual guard is safer and survives Unit 6 being dropped.

### C3. Typed-send during a live voice turn is unguarded — ACCEPT, **CONFIRMED IN SOURCE**
**Source:** Codex (flagged as hand-waving). **Unit 5.**
Codex was right to distrust this, and the code confirms it. `AssistantChat.tsx:500` guards with
`if (!text || busy) return;` — but `busy` is the **text chat's** flag. A voice turn runs entirely
through `useVoiceSession` and never sets it. So "the composer stays usable" as specified lets a user
fire a text turn while the voice loop is mid-`thinking`/`speaking`: two concurrent assistant turns
against one conversation.

**Fix:** the send guard becomes `busy || voiceTurnActive`, where a voice turn is active for any state
other than `listening`/`idle`. Typing while it listens is fine and is the actual use case (the mic
misheard a lot number). Typing while it is mid-reply is not.

### C4. `display:none` is not unmount — gate the panel on host visibility — ACCEPT
**Source:** Codex. **Units 4-5.**
The dock keeps `AssistantChat` mounted and merely `display:none` when collapsed. "Mount-once start /
unmount stop" therefore only holds if the panel's render condition includes host visibility.

**Fix:** render on `active && voiceOpen`, not `voiceOpen`.
**Rejected sub-claim:** Codex additionally called the existing `prevActive` render-phase
`setVoiceOpen(false)` block (`AssistantChat.tsx:160-164`) a React 19 anti-pattern to delete. That is
React's documented adjust-state-on-prop-change pattern, correctly guarded by a previous-value
comparison, and it is what makes teardown synchronous today. Keep it; add the `active &&` gate as
belt-and-braces.

### C5. Unit 1's announcement signature cannot express its own spec — ACCEPT
**Source:** Codex. **Unit 1.**
A pure `(prev, next) => string | null` cannot implement "announce `speaking → listening` **only on the
first turn**." That requires turn context. Straight logic error in the plan.

**Fix:** widen to `(prev, next, ctx: { turnCount: number })`, keep it pure, hold `turnCount` in a ref
in the panel.

### C6. Mobile / virtual-keyboard squeeze crushes the transcript to zero — ACCEPT
**Source:** Gemini. **Unit 4.**
Header + pinned proposal card + control row + composer + disclaimer, then a tablet virtual keyboard
removes ~50% of viewport height. Because the card is specified as "never scrollable out of view", the
transcript is the only flexible element left and it collapses to 0px.

**Fix:** `max-height` + internal scroll on the pinned ProposalCard, and a `min-height` (~60px) floor on
the transcript. Add a virtual-keyboard QA scenario.

### C7. Focus management is entirely unspecified — ACCEPT (partially)
**Source:** Gemini (WCAG 2.4.3). **Units 4-5.**
The plan deletes a focus trap and a focus-restore effect (`VoiceOverlay.tsx:65-69`) and never says
what replaces them.

**Fix:** Talk→End in place is already correct — same DOM button, so focus persists across the label
change and needs nothing. What needs specifying: Escape-to-end must return focus to that button, and a
voice-triggered `router.push` changes the whole page under a keyboard user with no announcement. Route
the page-change announcement through Unit 1's reducer.

**AMENDED — rejected premise:** Gemini asserted the shared transcript is an `aria-live` region that
would double-read over the TTS. It is not. The transcript scroller at `AssistantChat.tsx:781` has no
live region; the only `aria-live="polite"` in the chat is on the Draft card details at `:1271`. There
is no SR/TTS double-read of message text today. **Residual real risk:** the voice panel adds a
*second* concurrent live region alongside `:1271` and the NavToast's `aria-live="assertive"` at `:988`.
Coordinate the three; do not add a third naively.

---

## Design Questions

### Q1. Is this optimizing for the wrong persona? (the sharpest challenge in the review)
A 220px orb on a full-screen surface is legible from four feet away when a winemaker sets a tablet on
a barrel and walks away to wash a tank. A 28px orb in a 440px panel in the bottom-right corner
optimizes for a desk user with a mouse. Gemini's suggestion: auto-trigger the dock's existing
"expand to center" mode when voice starts on tablet breakpoints. **This challenges the premise of the
whole plan and needs a human answer.**

### Q2. Should the orb be tappable?
Gemini argues a pulsing animation in a title bar is a strong affordance and cellar workers will try to
tap it to stop the assistant — but `pointer-events: none` makes that a no-op (or a drag). Counter:
there is already a persistent Interrupt button, and two interrupt targets in two places is worse than
one. The affordance point still stands — if it is not tappable it should not *look* tappable.

### Q3. What happens when the **user** navigates mid-sentence?
The plan handles the assistant navigating. It ignores the user clicking a link while the assistant is
narrating — TTS keeps describing the page they just left. Auto-interrupt on user-initiated nav, or let
it finish? Genuinely ambiguous: mid-sentence cutoff is jarring, stale narration is confusing.

### Q4. Keyboard reachability once the trap is gone (WCAG 2.4.1)
A keyboard user on a navigated page must tab through potentially hundreds of nodes to reach the dock's
Interrupt or Confirm. Gemini proposes global hotkeys (`Alt+I`, `Alt+C`) — real scope. Cheaper
alternative: one shortcut that moves focus *into* the dock.

### Q5. Two tabs
Both docks are alive; mic lock and TTS streams could collide. Almost certainly **pre-existing** and not
caused by this change — but this change makes voice easier to leave running, so it gets hit more.

---

## Suggested Improvements

### S1. The autoscroll interaction is worse than Gemini thought — AMENDED, and it is ours to fix
Gemini's CRITICAL was "if the user scrolls up, auto-scroll pauses and voice captions land below the
fold unseen." **The premise is backwards.** `AssistantChat.tsx:447-462` force-snaps
`el.scrollTop = el.scrollHeight` on *every* `items` change, unconditionally, with no
"am-I-near-the-bottom" check — the comment at `:450-457` says this is deliberate and cites ticket #203
as the reason.

The real behavior is the opposite failure: during a voice conversation the user **cannot scroll up to
read anything**, because every turn yanks them back to the bottom. Full-screen voice hid this
(captions were a separate list). Inline voice exposes it. Worth an explicit decision: relax the
unconditional snap to a near-bottom check, now that the pinned card — not autoscroll — is what
guarantees the confirm button stays visible.

### S2. Make the dock the single Escape owner
Two sibling `window` keydown listeners with order-dependent behavior is the same class of bug as the
`querySelector` coupling being removed. Cleaner: the dock owns Escape and routes internally (voice
live → end voice; else → collapse/close).

### S3. Add mic-permission-denied to Unit 1 and Unit 7
`getUserMedia` denial is absent from all 13 QA scenarios. Wet hands, a mis-tap on the browser prompt,
and the UI can sit with no audio and no explanation. Add a `NotAllowedError` case to the Unit 1 state
model and a QA scenario.

### S4. Verify caption-parity before deleting the caption list
Codex asked where transient feedback lives before `onTurn` mirrors a turn into the transcript.
Checked: `useVoiceSession.ts:399` fires `onTurn` with the complete `assistantText` at end of turn, and
the overlay's own `pushCaption` fired on the same edge — the two are at parity and nothing is lost.
Worth one QA confirmation rather than an assumption.

---

## Verdict

Nothing here invalidates the approach. The plan's core claim — that this is a presentation swap over an
unchanged engine — survived both reviewers. What did not survive is the assertion that the risks were
already handled: **C2** (ordering) and **C3** (typed-send) are real defects that would have shipped, and
C3 was verified in source rather than taken on faith.

**Q1 needs a human answer before Unit 2 is built.** Everything else is mechanical.

---

## Raw Response — Codex (gpt-5.4)

**CRITICAL**

- Render-phase state sync is still sitting in the kill path, and the plan does not explicitly remove it. `src/app/(app)/assistant/AssistantChat.tsx` around the current `prevActive` block and Unit 5. Today `active -> setVoiceOpen(false)` happens during render. In React 19, that is exactly the pattern you should be deleting, not preserving as the mechanism that stops media on dock collapse. Concrete fix: gate the panel with `active && voiceOpen` so it unmounts in the same commit the dock hides, then clear `voiceOpen` from an effect or reducer (`useEffect(() => { if (!active) setVoiceOpen(false) }, [active])`). If you want zero-latency mic release, also expose an imperative stop and call it before the dock closes.

- The `onVoiceStatus` upward callback is a direct route to `Cannot update a component while rendering a different component` or a render loop if you implement it the naive way the plan describes. Unit 3, `src/app/(app)/assistant/AssistantChat.tsx`, `src/components/assistant/AssistantDock.tsx`. "AssistantChat calls `onVoiceStatus(status | null)` upward" is not safe unless it is effect-driven and equality-guarded. If it fires during render, React warns. If it fires from an effect keyed to a freshly allocated status object or the whole `session` object, the dock rerenders on every child render. Concrete fix: notify from an effect with minimal deps only (`voiceOpen`, `session.state`, maybe `session.getLevel` through a ref), and have the parent store primitives plus a getter ref, not an always-new object.

- Unit ordering is unsafe around Escape. `src/components/assistant/AssistantDock.tsx:125-138`, Unit 3 vs Units 4-5. If you remove the current `aria-modal` guard at line 132 before the inline panel is the active embedded path and before status reporting is guaranteed, one Escape on the existing overlay can collapse/close the dock. Concrete fix: land the Escape rewrite in the same commit as inline-panel activation, or keep a temporary dual guard (`voiceStatus || document.querySelector(...)`) until `VoiceOverlay` is no longer in play.

**SHOULD FIX**

- Two native `window` Escape listeners is still a coordination bug, just with a different predicate. `src/components/assistant/AssistantDock.tsx:125-138`, Unit 3/4. The plan says "dock defers" and "chat owns Escape ends voice," but that still leaves sibling listeners on the same target, with behavior depending on registration order and stale closures. Concrete fix: make the dock the single Escape owner and route internally: if voice is live, end voice; else collapse/close dock. If you refuse that, the voice listener needs capture-phase ownership and to stop further dispatch explicitly.

- "Mount-once start / unmount stop" is incomplete for the actual host lifecycle you described. `src/components/assistant/AssistantDock.tsx` note after the header/body block, Units 4-5. The dock preserves chat state by hiding it with `display:none`; that is not an unmount. If the inline panel is ever left mounted while hidden, the recorder/audio/abort chain keeps running invisibly. Concrete fix: the render condition must include host visibility (`active && voiceOpen`), not just `voiceOpen`, and the plan should say that explicitly.

- Unit 1's announcement API does not match its own requirements. Unit 1. A pure `(prev, next) -> string | null` function cannot implement "announce `speaking -> listening` only on the first turn." That needs turn context. Concrete fix: pass turn index / `hasCompletedTurn` into the pure function, or keep that state in a ref in the panel and let the reducer stay purely state-to-label.

- The "stable getter" argument is only half the performance story. Unit 3. Avoiding a numeric level in React state prevents 60fps rerenders, but it does not prevent parent rerenders if you still `setVoiceStatus({ state, getLevel })` on every child render. Concrete fix: only publish status when lifecycle-visible fields change; keep `getLevel` in a ref at the dock.

- Typed-send while voice is live is hand-waved. Unit 5. "Normal send() path" is not automatically safe if the voice loop is already in `transcribing`, `thinking`, or `speaking`. You can end up with overlapping assistant turns unless the existing engine already serializes all entry points. Concrete fix: verify current behavior against `useVoiceSession` before landing; if it is undefined, disable text send while a voice turn is active.

**DESIGN QUESTIONS**

- Unit 4 deletes the captions list entirely. Where does transient voice feedback live before `onTurn` mirrors it into chat items? If there is any lag between STT/TTS state and transcript mirroring, you are removing the only immediate in-session feedback. If the transcript already reflects pending turns promptly, fine; if not, keep a compact last-caption strip.

- Unit 6 being separable is correctly reasoned. Reusing the inline panel on `/assistant` is a maintenance win, but the note that navigation there still ends the session is accurate and not a regression.

- Unit 2's `pointer-events:none` for the centered orb is the right call. It preserves drag-from-center without further entangling `onHeaderPointerDown` with header child structure.

---

## Raw Response — Gemini (gemini-3.1-pro-preview)

Lifting Escape precedence to the dock and using a pure-function reducer for SR announcements are exactly right. Move on.

Here is the adversarial review of the implementation plan.

### CRITICAL

**1. A11y: Screen Reader vs. TTS Collision (Units 4 & 5)**
* **The Flaw:** The plan states Unit 4 owns the "single `aria-live=polite` region" for voice status, but ignores the *shared text chat transcript* (Unit 5). Standard text chats use `aria-live` or `role="log"` to announce incoming messages. When the assistant speaks (ElevenLabs TTS), the transcript also updates. The screen reader will read the text transcript aloud at the exact same time the TTS is speaking.
* **WCAG / ARIA:** WCAG 1.4.2 Audio Control & ARIA live region collisions.
* **The Fix:** In Unit 5, you must dynamically apply `aria-live="off"` to the shared chat transcript whenever voice mode is active. Screen reader users will rely on the ElevenLabs TTS for the message content during voice sessions; do not force them to hear it twice simultaneously.

**2. IxD / Real World: Loss of Captions via Auto-Scroll Pause (Unit 5)**
* **The Flaw:** The plan deletes the dedicated caption list, relying entirely on mirroring turns into the shared chat transcript. In standard chat UX, if a user scrolls up to read history, auto-scrolling is paused to prevent yanking the viewport. On a noisy cellar floor, if auto-scroll is paused, the assistant will speak, the captions will render below the fold, and the user will see nothing.
* **The Fix:** Introduce a forced "snap to bottom" override in the transcript that triggers *only* on voice turns, OR render a sticky "New messages below" toast that repeats the current voice caption if the transcript is not scrolled to the bottom.

**3. A11y: Keyboard Focus on Open, Close, and Navigation (Units 3 & 4)**
* **The Flaw:** Deleting `aria-modal="true"` and the focus trap is necessary for the inline requirement, but the plan completely ignores focus management. When clicking "🎙 Talk", where does focus go? When pressing Escape to end voice, where does focus return? If the assistant navigates the page (e.g., "Showing Tank T5"), focus is left behind in the dock while the DOM completely changes underneath them.
* **WCAG / ARIA:** WCAG 2.4.3 Focus Order.
* **The Fix:** In Unit 4, explicitly move focus to the "⏹ End" button or the "Interrupt" button when voice starts. On Escape/close, return focus to the "🎙 Talk" button. If the assistant triggers a route change, you must announce the page change via the Unit 1 `voiceAnnouncement` reducer so the SR user knows their surrounding context just changed.

**4. Failure Mode: Mobile Viewport & Virtual Keyboard Squeeze (Unit 4)**
* **The Flaw:** Pinned proposal card + control row + text composer + header + horizontal disclaimer + transcript. On a tablet/mobile device (winemaker context), tapping the composer opens the virtual keyboard, reducing the viewport height by ~50%. Because the proposal card is "never scrollable out of view", the math fails: the transcript height will literally be crushed to 0px, or the UI will overflow the viewport entirely.
* **The Fix:** Apply a `max-height` with internal scrolling to the pinned ProposalCard, and implement a `min-height` (e.g., 60px) for the transcript so it is never completely squished out of existence.

### SHOULD FIX

**1. Failure Mode: Missing Mic Permission (Units 1 & 7)**
* **The Flaw:** The manual QA lists 13 scenarios but ignores `getUserMedia` denial. If a worker with wet hands taps "Talk" and the browser auto-denies or prompts, the UI state silently fails or gets stuck in "Listening" without audio.
* **The Fix:** Add a specific error state to the Unit 1 pure function for `NotAllowedError`. In Unit 4, render a clear "Mic access denied" UI with a button linking to instructions on how to unblock it. Add this as QA Scenario 14.

**2. A11y: Keyboard Reachability (Unit 4)**
* **The Flaw:** Without a focus trap, a keyboard user on the navigated page (e.g., tabbing through a table in Tank T5) has to tab through potentially hundreds of DOM nodes to reach the dock's "Interrupt" or "Confirm" buttons.
* **WCAG:** WCAG 2.4.1 Bypass Blocks.
* **The Fix:** Add a global hotkey (e.g., `Alt + C` for Confirm, `Alt + I` for Interrupt/End) bound when the dock is in voice mode. Announce these shortcuts in the Unit 1 session-start announcement.

**3. Failure Mode: User-Initiated Navigation Mid-Sentence (Unit 5)**
* **The Flaw:** The plan handles the assistant navigating the app, but ignores the *user* navigating the app while the assistant speaks. If the user clicks a link to view a different vessel, the TTS continues narrating about the previous context.
* **The Fix:** Bind to the router's route-change event. If the user initiates navigation, either auto-interrupt the TTS or explicitly pass the new page context to the assistant's context window.

### DESIGN QUESTIONS

**1. Is the plan optimizing for the wrong persona?**
A 220px orb and full-screen overlay (the old UI) is highly visible from 4 feet away when a winemaker has set the tablet on a barrel and is washing a tank. Moving to a 28px orb in a 440px dock tucked into the bottom corner optimizes for a desk user multi-tasking with a mouse. Has interaction design considered automatically triggering the dock's existing "expand to center" mode when voice is activated on tablet breakpoints?

**2. What happens with two tabs?**
The dock survives client-side navigation, but if the user duplicate-tabs the app (common in ERP workflows), both docks are alive. If they hit "Talk" in Tab A, does the mic lock in Tab B? Do ElevenLabs streams collide?

**3. Drag target ambiguity.**
Unit 2 wraps the orb in `pointer-events: none` to fix drag collision. However, a pulsing animation in a title bar is a massive visual affordance. Cellar workers will try to tap the orb to stop the assistant. If `pointer-events` is `none`, tapping it will either do nothing or register as a drag/click on the title bar. Should the orb instead be an active button that toggles `Interrupt` / `Talk`?
