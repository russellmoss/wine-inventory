# Design Review — Plan 089: Inline conversational voice mode in the assistant dock

**Date**: 2026-07-21
**Plan**: `docs/plans/2026-07-21-089-feat-inline-voice-in-dock-plan.md`
**Prior reviews (read, not re-derived)**: `2026-07-21-089-council-feedback.md`, `2026-07-21-089-eng-review.md`
**Graded against**: `DESIGN.md` (visual system) + `docs/architecture/ux-principles.md` (12 checkable rules)
**Mockups**: `DESIGN_NOT_AVAILABLE` — text review. Acceptable here: this plan introduces no new visual
language, it relocates existing components inside an existing panel.

**Initial overall design score: 5/10.**
It is a 5 because the plan is precise about *structure* (where things go, what gets deleted) and nearly
silent about *states* (what the user sees when there is nothing to see, when the mic is refused, when
voice ends) and about *responsive* (a 440×620 corner panel behaves completely differently at 375px
than at 1024px, and the plan treats "the dock" as one fixed thing). A 10 would specify every
interaction state, resolve the tablet persona question, and reconcile a continuously-animating element
against a design system that bans decorative animation.

---

## Pass 1 — Information Architecture · 6/10 → 9/10

The vertical hierarchy is actually well-reasoned and I am not going to pretend otherwise:

```
┌─ Assistant ──── ◉ Listening… ──── ⤢  × ─┐   ← state (glanceable, never scrolls away)
│                                          │
│  transcript (scrolls)                    │   ← history
│                                          │
├──────────────────────────────────────────┤
│  ⚠ Confirm change: ...  [Confirm][Cancel]│   ← pinned, never scrolls (ticket #203)
│  ⏸ Interrupt        My voice             │   ← persistent controls
│  [ textarea                            ] │
│  [⏹ End] [Report bug] [Send]             │
└──────────────────────────────────────────┘
```

Danger sits above controls sits above input. That respects **UX rule 6** (confirm the dangerous) and
**rule 4** (state always visible). The orb in the title bar is the correct home for state: it is the
only strip that never scrolls and never gets covered by the pinned card.

**Gap 1 (fixed inline):** the plan never states what happens to the **`/inbox`-style unread or
streaming indicator** when the transcript is scrolled. Not applicable — no such indicator exists.
Withdrawn.

**Gap 2 (real, fixed inline):** the plan does not say where **first-run guidance** lives.
`VoiceOverlay.tsx:259-261` currently renders *"Speak naturally — I'll answer out loud. Changes still
need your confirmation."* That line is in neither the keep-list nor the delete-list in Unit 4 — the
same silent-omission class as the eng review's `focusNotice` finding. On a first voice session the
transcript is empty, so without it the user gets an orb, the word "Listening…", and a blank panel.

**Fix:** Unit 4 keeps the helper line, shown **only while the transcript has no voice turns yet**, then
retires itself. That is an empty state doing real work rather than sitting there forever eating 2 lines
of a 620px panel.

---

## Pass 2 — Interaction State Coverage · 4/10 → 9/10

Weakest dimension in the plan. Four of nine states were unspecified.

| State | Plan says | Verdict |
|---|---|---|
| Listening | orb + "Listening…" | ✅ |
| Thinking | orb + "Thinking…" | ✅ |
| Speaking | orb + "Speaking…", Interrupt enabled | ✅ |
| Error | error line + "switch to text" | ✅ (kept from overlay) |
| Confirm pending | pinned card | ✅ |
| **First run / empty** | **nothing** | ❌ → Pass 1 Gap 2 |
| **Mic permission denied** | **nothing** | ❌ council S3, still unspecified as a *visual* |
| **Voice ended** | **nothing** | ❌ new |
| **Voiceprint mismatch** | **nothing** | ❌ eng review P1 (`focusNotice`) |

**Voice ended is a new finding.** UX **rule 2 is "no dead-ends."** When the user hits End or Escape,
the orb and the state word vanish from the title bar and… nothing marks the transition. The panel
silently becomes a text chat again. The user's own question — *"did it actually stop listening?"* — is
exactly the anxiety a mic-bearing feature must not create.

**Fix:** on session end, the title bar shows a static (non-animated) muted mic-off glyph plus
"Voice ended" for ~2s using `--duration-normal` (220ms) fade, then returns to the plain title. Cheap,
and it closes the loop.

**Mic denied fix:** the error line already exists; the plan must name `NotAllowedError` copy
explicitly, in winery-plain language per **rule 5** — not "getUserMedia failed" but *"I can't hear you
— the browser is blocking the mic for this site."* Plus the "switch to text" affordance already there.

---

## Pass 3 — User Journey & Emotional Arc · 5/10 → 8/10

| Step | User does | User feels | Plan supports it? |
|---|---|---|---|
| 1 | Taps Talk | "is it listening?" | ✅ orb + label |
| 2 | "show me what's in Tank T5" | anticipation | ✅ |
| 3 | Page navigates under the dock | **"wait, what just happened"** | ⚠️ **partial** |
| 4 | Assistant narrates what's on screen | understanding | ✅ — the payoff |
| 5 | Asks a follow-up | flow | ✅ |
| 6 | Says "log 22.4 for Block 3" | caution | ✅ pinned confirm |
| 7 | Ends voice | closure | ❌ → Pass 2 |

**Step 3 is the emotional crux of the whole feature and the plan under-serves it.** The entire reason
for this change is that the user should *see* the navigation. But a page yanking itself out from under
you while a voice talks is disorienting unless it is clearly *caused*. In the text chat, navigation
gets a 3-second cancellable `NavToast` countdown (`AssistantChat.tsx:984`, `aria-live="assertive"`) —
deliberate, cancellable, announced. In voice, `useVoiceSession.ts:322-324` pushes **immediately** with
only a spoken *"Showing Tank T5."*

Full-screen voice hid the inconsistency (you saw no page either way). Inline exposes it: the same app
now teleports you with a countdown in one mode and without one in the other.

**This is a genuine design decision, not an obvious fix** — carried to Pass 7 / Decision D4.

---

## Pass 4 — AI Slop Risk · 9/10

**Classifier: APP UI.** Correct rule set = calm surface hierarchy, dense but readable, minimal chrome,
utility language, cards only when the card *is* the interaction.

Zero hard-rejection patterns. No card mosaic, no gradient, no icons-in-circles, no centered-everything,
no decorative blobs. The plan **deletes** chrome rather than adding it (subtraction default, Rams). The
one card that remains — the confirm card — is a case where the card genuinely *is* the interaction.

Litmus: 7/7 pass or N/A. The single point off is copy: "Interrupt" is developer-ish. Winery-plain
would be **"Stop talking"** per **UX rule 5** (speak the winery's language — a cellar hand does not
"interrupt a process"). Minor, carried as a copy note rather than a blocking finding.

---

## Pass 5 — Design System Alignment · 5/10 → 8/10

### [D1] The orb violates `DESIGN.md`'s motion policy once it becomes persistent chrome. **NO PRIOR REVIEW CAUGHT THIS.**

`DESIGN.md:109-115`:

> **Motion** — Calm, editorial. Duration: fast 120ms · normal 220ms · slow 400ms.
> **Use:** transitions that aid comprehension (hover, state, drawer). **No scroll choreography, no
> decorative animation.**

A 60fps audio-reactive pulsing orb is not a 220ms comprehension transition. In the full-screen overlay
it was defensible: it was the *focal point of a dedicated surface* the user had deliberately entered,
and its motion *was* the information. Shrink it to 28px, pin it in a title bar, and leave it running
while the user reads a vessel page, and it becomes a permanently animating object in peripheral vision
on a surface that follows them across every route. That is much closer to what the design system
forbids.

This matters practically, not just doctrinally: peripheral motion is the single most reliable way to
make a persistent UI element feel cheap, and it competes for attention with the actual work.

**Options:**
- **(a)** Animate only on `listening` and `speaking`; hold static on `thinking`/`idle`. Motion then
  genuinely encodes "audio is flowing," which is comprehension, not decoration.
- **(b)** Drop audio-reactivity at small size — a slow 400ms breathing pulse, no level response.
- **(c)** Accept it as functional state (UX rule 4) and log an explicit exception in `DESIGN.md`'s
  decision table.

**Recommendation: (a) + (c).** (a) makes the motion earn itself; (c) is required regardless, because
`DESIGN.md:133-153` keeps a decision log and an undocumented standing exception is how design systems
rot. `DESIGN.md` is explicit that deviations need logged approval.

### [D2] Voice turns will sprout thumbs-up/thumbs-down after every spoken reply. **NO PRIOR REVIEW CAUGHT THIS.**

`AssistantChat.tsx:807-815` renders a `FeedbackBar` under every completed assistant message. Voice
turns are mirrored into the same `items` array (`:494`). So the moment the transcript becomes the
caption stream, **every spoken turn grows a 👍/👎 pair**.

The overlay's caption list had none. In a hands-free conversation this is visual noise you cannot
act on by voice, in a 440px panel where vertical space is already the binding constraint (council C6).
Ten turns of rapid back-and-forth = ten feedback bars nobody will ever click.

**Fix (no real alternatives — applying directly):** suppress `FeedbackBar` on turns while a voice
session is live. Feedback stays available on text turns and on the whole conversation after voice ends.

### [D3] Title-bar crowding and touch targets

`DESIGN.md` documents no touch-target minimum, and the dock's existing header controls are already
under 44px (enlarge ≈ 29px, `×` ≈ 28px). Adding a third element to a 440px header makes a cramped
strip more cramped, and the winemaker persona is explicitly a touch device.

Not caused by this plan, but made worse by it. **Fix:** the header's 3-column grid must let the middle
column shrink first and drop the state word below ~380px panel width, keeping the orb. Filed as a
TODO for the touch-target debt itself, since that is pre-existing and repo-wide.

---

## Pass 6 — Responsive & Accessibility · 3/10 → 8/10

Lowest score. A11y was well covered by the council (C6, C7) so I will not re-derive it. **Responsive
was not covered by anyone**, and it turns out to answer the open persona question.

### The persona question (council Q1) is narrower than it looks — I checked the numbers.

`AssistantDock.tsx:43-51`:

```
width  = min(440, vw × 0.94)
height = min(620, vh × 0.80)
```

| Device | Viewport | Actual dock size | % of screen |
|---|---|---|---|
| Phone | 375 × 812 | **352 × 620** | 94% wide, 76% tall |
| Tablet portrait | 768 × 1024 | 440 × 620 | 57% wide, 61% tall |
| Tablet landscape | 1024 × 768 | 440 × 614 | 43% wide, 80% tall |
| Desktop | 1440 × 900 | 440 × 620 | 31% wide, 69% tall |

**On a phone the dock is already effectively full-screen.** Gemini's "220px orb readable from four
feet" concern does not apply there — the panel occupies 94% of the width.

The concern is real in exactly **one band: tablet**, where the dock is under half the screen and a
28px orb sits in a corner. That is also precisely the barrel-top device. So Gemini was right about the
persona and wrong about the breadth: this is a tablet problem, not a mobile-and-tablet problem.

`DESIGN.md:97` already establishes **768px** as this app's breakpoint, so there is a house-standard
line to hang the behavior on rather than inventing one.

**This is a genuine product decision → Decision D5 in Pass 7.**

### Remaining a11y items not raised by the council

- The `Interrupt` button is `disabled` when not speaking (a user decision, correct for layout
  stability) — but a permanently-present disabled control is invisible to screen readers in some
  configurations and unreachable by keyboard. Use `aria-disabled` + a no-op handler rather than the
  `disabled` attribute, so it stays announced and focusable.
- The orb is `pointer-events: none` and decorative-adjacent; it must be `aria-hidden="true"` so the
  state is announced exactly once, by the panel's single live region, not twice.

---

## Pass 7 — Unresolved Design Decisions

| # | Decision needed | If deferred, what ships |
|---|---|---|
| **D1** | Orb motion policy vs `DESIGN.md` "no decorative animation" | A permanently pulsing object in chrome on every page, contradicting the documented system with no logged exception |
| **D4** | Voice navigation: instant (today) vs the text chat's 3s cancellable `NavToast` | The same app teleports you with a countdown in text mode and without one in voice mode. Inline makes the inconsistency visible for the first time |
| **D5** | Tablet (768–1024px): auto-expand the dock when voice starts, or keep the corner panel | A 28px orb in a corner on the barrel-top device — the exact persona the feature is for |
| D2, D3 | FeedbackBar suppression, header shrink order | Applied directly, no decision needed |

---

## NOT in scope

- **Redesigning the dock's touch targets** — pre-existing repo-wide debt (`DESIGN.md` documents no
  minimum at all); a UI-relocation plan is the wrong vehicle. → TODO.
- **Adding a touch-target minimum to `DESIGN.md`** — a design-system decision, not a plan rider. → TODO.
- **Renaming "Interrupt" to "Stop talking"** — copy polish, worth doing, but should not gate the plan.
- **Dark mode** — `DESIGN.md:83`, light-only by design.
- **Full mobile redesign of the dock** — the numbers above show phone is already near-full-screen.

## What already exists (reuse audit)

| Asset | Location | Plan's use |
|---|---|---|
| Design tokens | `src/styles/tokens/*.css` | must be used; no hardcoded values (UX rule 7) |
| `Button` sm/md/lg = 34/42/50px | `DESIGN.md:129` | control row should use `sm` to protect vertical budget |
| `Badge` tones incl. `gold` | `DESIGN.md:130` | already used for focus mode; keep |
| Focus ring `--shadow-focus` | `DESIGN.md:82` | required on every newly-focusable control |
| `NavToast` countdown pattern | `AssistantChat.tsx:984` | **the precedent D4 should probably follow** |
| Motion durations 120/220/400 | `DESIGN.md:113` | the "Voice ended" fade and orb policy must use these |

---

## Completion Summary

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                     |
+====================================================================+
| System Audit         | DESIGN.md ✓ · ux-principles.md ✓ · APP UI   |
| Step 0               | initial 5/10 · all 7 passes                  |
| Pass 1  (Info Arch)  | 6/10 -> 9/10                                |
| Pass 2  (States)     | 4/10 -> 9/10   (4 states were unspecified)  |
| Pass 3  (Journey)    | 5/10 -> 8/10   (nav moment -> D4)           |
| Pass 4  (AI Slop)    | 9/10           (no hard rejections)         |
| Pass 5  (Design Sys) | 5/10 -> 8/10   (motion policy -> D1)        |
| Pass 6  (Responsive) | 3/10 -> 8/10   (tablet band -> D5)          |
| Pass 7  (Decisions)  | 2 applied, 3 escalated                      |
+--------------------------------------------------------------------+
| NOT in scope         | written (5 items)                           |
| What already exists  | written (6 rows)                            |
| TODOS proposed       | 2 (touch-target debt, DESIGN.md minimum)    |
| Overall design score | 5/10 -> 8.4/10                              |
+====================================================================+
```

**STATUS: DONE_WITH_CONCERNS.** Three decisions (D1, D4, D5) are genuine product/design choices with
real tradeoffs and must not be defaulted silently.

**New findings no prior review caught:** the orb's motion contradicts a documented design-system rule
once it becomes persistent chrome (D1); voice turns will grow feedback bars in the shared transcript
(D2); the navigation moment is inconsistent with the text chat's own cancellable countdown (D4); and
the persona question resolves to a **tablet-only** band, not a general mobile problem (D5).
