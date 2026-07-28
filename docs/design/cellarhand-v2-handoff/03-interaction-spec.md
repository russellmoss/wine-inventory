# 03 · Interaction Specification

Each interaction is specified as **trigger → system response → visible feedback → data effect → error behaviour → accessibility behaviour**.

A standing rule applies to every entry: *never describe an operation as queued, synced, offline-ready, saved, submitted or completed unless the current system supports that guarantee.* Where the approved design relies on a capability that does not exist today, the entry is marked **[PROPOSED]** and cross-referenced to an RFC or to the data-dependency matrix.

---

## 1. Navigation and active state

**Trigger** Click / `Enter` on a nav item, or a route change from any source.
**Response** Client navigation; the target group expands if collapsed; the mobile bottom tab highlights.
**Feedback** Active item: wine fill `#722F37`, `--accent-on` text, weight 500. Hover: `--accent-soft` background, 120ms. Focus: 3px focus ring, never removed.
**Data** None.
**Error** A route that 404s renders `not-found.tsx` **inside the shell** with a link back to the section. Today there are zero `not-found.tsx` files across 57 routes — this is required, not optional.
**A11y** `aria-current="page"` on the active item (absent today on all routes). Group buttons carry `aria-expanded` and control a region by `aria-controls`. A skip link is the first focusable element on every page. Desktop keyboard cost before main content must fall from 13–21 tab stops to 1.

## 2. Global search

**Trigger** `⌘K` / `Ctrl-K`, click the field, or the mobile Find tab.
**Response** Overlay opens with focus in the input. Query runs debounced at 150ms against the server. Results grouped **Do → Go to → Ask**.
**Feedback** Skeleton rows while in flight; result count announced; the highlighted row has both a background and a left marker.
**Data** Read-only. No mutation is ever performed by pressing `Enter` on a **Go to** row.
**Error** "Search is unavailable. Use the sidebar, or scan a tag." The sidebar keeps working.
**A11y** `role="dialog" aria-modal="true"`, focus trapped, `Esc` closes and restores focus to the trigger. The listbox uses `role="listbox"`/`role="option"` with `aria-activedescendant`; the input keeps DOM focus. Result count in an `aria-live="polite"` region.

## 3. Natural-language commands

**Trigger** A query that parses as an intent (`top rack 14`, `new rack from 25-PN-04`).
**Response** A **Do** row appears above literal matches. Selecting it **creates a draft and navigates to it**. It never performs a write to the ledger.
**Feedback** The row states the object and the consequence: "Continue barrel-down 25-PN-04 — WO #253, barrel 3 of 9".
**Data** Either pure navigation, or a draft `WorkOrder` in `DRAFT` status. Nothing enters `ISSUED` without a human pressing Issue.
**Error** Ambiguous parse → do not guess; show the candidate objects as ordinary results.
**A11y** The Do group has a visible heading that is also the `aria-label` of its option group.

## 4. Saved views and narrowing

**Trigger** Click a saved view chip; type into the narrowing control; click a chip's `×`.
**Response** Applies **live** — there is no Apply button. The URL updates (`replaceState`) so the view is shareable and server-rendered on reload.
**Feedback** Active view chip is ink-filled; each narrowing term is a removable chip in accent outline; the result count updates in the same paint.
**Data** Read-only; server-side filtering (see `04-responsive-spec.md` — 63 orders and 8,000 barrels cannot be filtered client-side).
**Error** An unparsable term shows inline under the control and is not applied.
**A11y** The result count lives in `aria-live="polite"`, announced as "12 work orders". Chips are buttons with an accessible name of the form "Remove filter: Hall C".

## 5. Progressive disclosure

**Trigger** Click a `▸` row control, a group name, or a "show/hide" affordance.
**Response** Expands in place. Expanding a work-order row reveals **barrel groups**, not barrels. Expanding a group reveals barrels as chips with a "+52 more" affordance.
**Feedback** The chevron rotates 90° over 120ms; the revealed region fades in over 220ms; `prefers-reduced-motion` disables both.
**Data** Members are fetched on first expand and cached for the session.
**Error** "Couldn't load the barrels in this group. Retry." inside the expanded region; the row stays expanded.
**A11y** `aria-expanded` on the control, `aria-controls` pointing at the region. Expansion never moves focus.

## 6. Keyboard operation

| Context | Keys |
|---|---|
| Global | `⌘K` search · `/` focus search · `Esc` close topmost overlay |
| Nav | `Tab` order is skip link → search → scan → nav → main |
| Tables | `↑`/`↓` move the row cursor, `→` expands, `←` collapses, `Enter` opens |
| Capture grid | `Tab` moves down the active column (not across the row), `Enter` records the row and advances, `Space` ticks, `⌥F` fills remaining with planned |
| Dialogs | Focus trapped; `Esc` cancels; `Enter` confirms only when the confirm control has focus |
| Tabs | Roving tabindex with `←`/`→`/`Home`/`End` — already correct in `Tabs.tsx`, keep |

**Never** trap focus in the capture grid. **Never** bind a destructive action to a bare key.

## 7. Focus movement

- Opening a dialog moves focus to the dialog's heading (`tabindex="-1"`), not to the first control, so screen-reader users hear the context.
- Closing returns focus to the trigger.
- Recording a row moves focus to the next row's first input.
- Navigating routes moves focus to the `<h1>`; announce the page name.
- Focus is never moved by a background event (a socket update, an AI response arriving).

## 8. Form validation

**Trigger** Blur, and again on submit.
**Response** Validate on blur, re-validate on change once a field has errored. Never validate on first keystroke.
**Feedback** Message directly under the field, `--danger` text plus a `▲` glyph, and the field border switches to `--danger` at 1.5px.
**Data** No write is attempted while any field is invalid.
**Error** Server-side rejections render in the same slot as client-side ones, in the same voice.
**A11y** `aria-invalid="true"`, `aria-describedby` pointing at the message id, and the message container is `role="alert"`. Today the execute screen renders errors as a plain `<div style={{color:danger}}>` — that must change.

## 9. Save behaviour — no optimistic ledger writes

**Trigger** Record / Issue / Correct.
**Response** The request is sent with a client-minted `commandId` (already the pattern in `WorkOrderTaskAttempt.commandId`, unique). A double-tap is a server no-op.
**Feedback** The button label changes to a present-participle ("Recording…"), the button keeps its exact width, and `aria-busy="true"` is set on the form.
**Data** One `LotOperation` (+ lines) per attempt, exactly as the ledger core does today.
**Error** The optimistic UI is reverted and a row-level alert appears.
**A11y** Completion is announced via `role="status"`: "C-1410 topped, barrel 11 of 60."

**Rule:** a tile, row or badge may show an *in-flight* treatment, but must not show the *recorded* treatment until the server confirms. A ledger entry is the one thing the UI may never optimistically claim.

## 10. Numeric entry, units, planned vs. actual

- Numeric fields: `inputMode="decimal"`, `step="any"`, `font-variant-numeric: tabular-nums`, minimum 44px tall, 60px on floor surfaces.
- The unit is a **separate, non-editable adornment** at the same height, never a suffix inside the value.
- **Planned** values render as the field's default value with the label "planned 225 L" beside the field — the plan is the default, not a separate read-only mode. The Edit gate is deleted.
- **Actual** values, once recorded, render in the recorded colour with the actor and time.
- A value that differs from plan by more than the task type's tolerance shows a quiet inline note, never a block.
- Nudge buttons (`−1 / −0.5 / +0.5 / +1`) sit under the field at ≥46px for gloved hands.
- Units always come from tenant preferences (`useUnitPrefs`), including in CSV exports — the audit found CSV headers hardcoded to `(L)` while the UI honours preferences.

## 11. Connectivity messaging **[PROPOSED beyond the honest fallback]**

**Today's honest behaviour — build this now:**

| Condition | Banner | Primary action |
|---|---|---|
| Online | Small "Connected" indicator, `--positive` | Enabled, reads "Record …" |
| Offline | `--warning` banner: "No connection — you can't record right now. Your entry is still on screen." | **Disabled**, reads "Record …" |
| Request failed, online | Inline alert on the row | Enabled, reads "Try again" |

The current header string *"Offline — will retry"* must be removed. There is no outbox; the label invites the data loss it cannot prevent (audit S1).

**After Phase 28 / D25 lands — the approved target:** the state is named **Held**, the banner shows a live count and lists what is held, the sentence "not on the server yet" is explicit, and the primary verb changes from *Record* to *Hold*. The verb on the button is the contract.
**A11y** The connection state lives in one `aria-live="polite"` region and announces at most once per transition.

## 12. Undo and correction

There is no undo. The approved model is **correction**: the original entry stays in history and an amendment is written beside it.

**Trigger** "Correct this entry" on a receipt or a history row.
**Response** A dialog showing old → new, a required reason, and a plain statement of downstream effect.
**Feedback** On success, both rows appear in history and the object carries a "corrected" marker.
**Data** A `CORRECTION` `LotOperation` linked via `correctsOperationId` — the existing mechanism.
**Error (blocked, LEDGER-11)** Name the later operation and offer the LIFO unwind, in plain language. Never an error code.
**A11y** The dialog's heading names the object and the act. Both values are read as text, not as colour.

## 13. Destructive-action confirmation

Confirmation is keyed to **reversibility**, not to habit.

| Class | Pattern |
|---|---|
| Reversible, low value (untick a barrel before close-out) | No confirmation; a correction path exists |
| Reversible, bulk (tick the rest of the group) | Inline restatement with the exact count and value |
| Irreversible or compliance (file a TTB report, cancel a WO with reservations, archive a group) | A dialog that **restates the object, the scope and the consequence** and requires an explicit button press |

The existing `ConfirmButton` has two defects to fix before reuse: it **auto-disarms after 4s** (a WCAG 2.2.1 timing failure and a real mis-click trap, because the layout shifts back), and its default label is a bare "Delete" that never names its object. Fix both, or replace with a dialog for the irreversible class.

## 14. Status changes

Status is expressed by **hue + glyph + text**, never hue alone.

| Status | Glyph | Colour | Text |
|---|---|---|---|
| Not started | `○` | `--ink-700` on `--paper-200` | Not started |
| In progress | `◐` | `--deep-blue` | In progress |
| Held (post-Phase 28) | `◔` | `--warning-ink` | Held |
| Recorded | `●` | `--deep-green` | Recorded |
| Needs attention | `▲` | `--danger-ink` | Needs attention / Overdue |

**Wine is removed from the status vocabulary.** `Badge tone="gold"` currently renders wine, so PENDING, IN_PROGRESS and REJECTED are indistinguishable on the busiest screen in the product.
**A11y** The glyph is decorative (`aria-hidden`) because the text carries the meaning; if a badge is ever icon-only, it needs an `aria-label`.

## 15. Drawers, dialogs, overlays

- The mobile drawer is **removed** — bottom tabs replace it.
- Dialogs: `role="dialog" aria-modal="true"`, focus trapped, backdrop `rgba(20,19,15,0.45)`, `Esc` to dismiss, click-outside to dismiss **only for non-destructive** dialogs.
- The assistant dock is deliberately **not** modal (`aria-modal={false}`), stays mounted after first open, and owns `Esc` with the existing precedence: live voice → end voice; expanded → shrink; otherwise → close. Do not change this.
- Overlay z-order: dock 60/61 > dialog 50 > sticky headers 30–35.

## 16. AI proposals and confirmation

Four states, never blurred:

| State | Exists server-side? | Visual |
|---|---|---|
| Recommendation | No | Prose in the dock with source chips |
| Draft | Yes, as a `DRAFT` record | Card labelled "Draft — nothing created yet" / page badged `○ Draft — not issued` |
| Confirmed action | Yes, scheduled with the user's name | Standard object state |
| Completed action | Yes, in the ledger | Recorded receipt |

**Trigger** "Review & create" on a draft card.
**Response** Create the record in draft status and **navigate to it**. The dock stays open on the same object and continues the conversation.
**Feedback** The page states provenance and safety: "Created from your question, 12:58. Nobody can see it on the floor until you issue it."
**Data** A `WorkOrder` in `DRAFT`. Never `ISSUED`.
**Error** "Couldn't create that draft. Nothing was written." + Retry + Build it by hand.
**A11y** Navigation moves focus to the `<h1>`. The draft badge is text, not colour. Provenance chips are links with accessible names of the form "Source: 5 Brix readings, 22–27 July".

**Prohibited:** sparkle decoration, a permanently open chat panel, AI-only affordances for anything a user must be able to do without AI, and any AI action that writes to the ledger without a human press.

## 17. Voice

**Trigger** Hold the mic in the dock title bar, or the mic on a capture screen.
**Response** Transcribe, then **fill the same form the user would have filled**. Voice never writes.
**Feedback** The orb animates only while audio is flowing (`listening`/`speaking`) — the one sanctioned continuous animation, per DESIGN.md's 2026-07-21 decision. Show the recognised text and the parsed value separately, so a mis-hearing is visible.
**Data** None until the human presses the record button.
**Error** Low confidence → show the transcript and leave the field empty rather than guessing.
**A11y** A visible transcript is required; voice is never the only path. Announce state changes via the existing `HostVoiceStatus` plumbing.

## 18. Scan **[PROPOSED — RFC-004]**

**Trigger** The Scan control, or an NFC tag entering the field.
**Response** Inside a runner, scanning **sets the current position**; elsewhere it navigates to the object.
**Feedback** A short "Tag read" chip with the object code.
**Data** Read-only lookup.
**Error** Four named cases, each with approved copy: permission denied, unreadable, unknown tag, tag from another winery.
**A11y** Scan is never the only way to reach an object — search and browse always work.

## 19. Motion

Tokens from `spacing.css`, unchanged: `--duration-fast 120ms`, `--duration-normal 220ms`, `--duration-slow 400ms`; easings `standard`, `out`, `in-out`.

**Permitted:** hover and focus transitions, disclosure expansion, dialog entry, the recorded-tile colour change, the voice orb while audio flows.
**Prohibited:** scroll choreography, decorative loops, animated skeletons that pulse faster than 1.6s, any motion on a status change that is the *only* signal of that change.
**Required:** a global `@media (prefers-reduced-motion: reduce)` rule that disables transforms and reduces durations to 0.01ms. Today this is honoured in only 4 components individually and there is no global rule.
