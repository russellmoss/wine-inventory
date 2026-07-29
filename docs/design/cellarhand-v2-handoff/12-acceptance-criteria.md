# 12 · Acceptance Criteria

Written so each can become a unit, integration, Playwright or visual-regression test. **ID prefixes:** `AC-F` foundations · `AC-C` component · `AC-S` screen · `AC-W` workflow · `AC-A` accessibility · `AC-R` responsive · `AC-D` domain · `AC-P` permissions · `AC-N` network · `AC-V` visual.

---

## 1. Foundations

| ID | Criterion | Test |
|---|---|---|
| AC-F1 | Every interactive element is ≥44×44px at 390px on all 24 audited routes | Playwright measurement pass; assert count of violations = 0 (baseline 293/376) |
| AC-F2 | Every route has ≤1 tab stop before main content | Playwright tab-count |
| AC-F3 | Every route renders exactly one nav item with `aria-current="page"` | Playwright DOM assert |
| AC-F4 | Every nav group disclosure has `aria-expanded` reflecting its state | Playwright |
| AC-F5 | `:focus-visible` produces a visible ring on every interactive element type | Visual regression on a focus-walk fixture |
| AC-F6 | With `prefers-reduced-motion: reduce`, no element has a non-trivial transition or transform | Playwright with the media feature emulated |
| AC-F7 | Zero axe violations at 390 and 1440 on all routes | axe-core |
| AC-F8 | No text uses `--golden-yellow`, `--orange`, `--lavender` or `--bright-mauve` | Static token lint |
| AC-F9 | All text meets AA contrast against its actual background | axe + token unit test |
| AC-F10 | No Google Fonts request blocks first paint | Lighthouse / network assert |

## 2. Components

| ID | Criterion | Test |
|---|---|---|
| AC-C1 | `Button` renders 44/48/56/68px for sm/md/lg/xl | Unit + visual |
| AC-C2 | A disabled `Button` is not `opacity:.45`; it has its own surface and a `cursor: not-allowed` | Unit |
| AC-C3 | A disabled primary button is always accompanied by visible text stating why — never only a `title` | Screen tests |
| AC-C4 | `Button pending` sets `aria-busy`, keeps its width, and keeps a stable accessible name | Unit |
| AC-C5 | No `Badge` in the codebase uses `tone="gold"` | Static grep test |
| AC-C6 | `StatusChip` renders glyph + text for all six statuses; greyscale screenshot remains distinguishable | Visual regression, `filter: grayscale(1)` |
| AC-C7 | `ConfirmButton` never auto-disarms | Unit: arm, wait 6s, assert still armed |
| AC-C8 | `ConfirmButton`'s label names its object | Unit |
| AC-C9 | `NumericUnitInput` has `inputMode="decimal"`, `step="any"`, `tabular-nums`, a separate unit box, and an `aria-live` derived readout | Unit + a11y |
| AC-C10 | `NumericUnitInput` default-fills from `planned` and remains editable with no mode switch | Unit |
| AC-C11 | `Skeleton` occupies the same box as the resolved element (no layout shift) | Playwright CLS assert = 0 |
| AC-C12 | `ActionReceipt` persists until dismissed or superseded; it is not time-dismissed | Unit |
| AC-C13 | `ResponsiveTable` transformation B keeps `<table>` semantics and `scope` attributes at every width | a11y test |
| AC-C14 | No table anywhere uses `display: block` at any breakpoint | Static CSS test |
| AC-C15 | `CommandPalette` groups render in the order Do → Go to → Ask, always | Unit |
| AC-C16 | `ProvenanceBadge` renders on every derived quantity and exposes its derivation via `aria-describedby` | Screen tests |
| AC-C17 | Every component in the migration map has a `/styleguide` entry | Static test against the export barrel |
| AC-C18 | `AIProposalCard` renders the B32 anatomy: state label, title, rationale, what it would change, primary / secondary / tertiary actions, and the footer "A draft changes nothing until you confirm it." | Source-contract test (no jsdom in this repo) |
| AC-C19 | `AIProposalCard` carries no sparkle glyph, gradient, or the words "AI-powered" / "smart" / "magic" / "I think" / "as an AI" | Static guard over `src/` |
| AC-C20 | The card's primary action names the act the press performs: "Review & create" when the outcome is a draft, "Review & issue" only when the user's own words asked for an issue | Unit (`assistant-issue-intent`) |
| AC-C21 | A voice user can advance a proposal card hands-free; no state requires touching the screen | Manual QA on the floor surface |

## 3. Screens

### Shell

| ID | Criterion |
|---|---|
| AC-S1 | The skip link is the first focusable element and moves focus to `#main` |
| AC-S2 | A failed badge query omits the badge; it never renders `0` or `?` |
| AC-S3 | The string "Offline — will retry" appears nowhere in the codebase |
| AC-S4 | At ≤1023px the sidebar is absent and the four labelled tabs are present; no drawer exists |
| AC-S5 | Every mobile tab has a visible text label |

### Work-order queue

| ID | Criterion |
|---|---|
| AC-S6 | Narrowing applies without a submit; the URL updates and a reload reproduces the view |
| AC-S7 | The result count is announced in an `aria-live` region on every change |
| AC-S8 | At 390px, at least one work order is visible without scrolling |
| AC-S9 | The title row stacks below 768px and the `h1` is never squeezed below 200px |
| AC-S10 | The empty state offers at least one next action in every variant |
| AC-S11 | With 63 orders and 8,142 barrels seeded, the first paint is ≤2s on a throttled connection and the payload contains no more than the visible page of rows |

### Work-order brief

| ID | Criterion |
|---|---|
| AC-S12 | The definition list renders Moving / From / Into / Equipment / Measure; a missing row is omitted, never rendered empty |
| AC-S13 | The **Take care** row renders only when there is content |
| AC-S14 | The reason a disabled Issue is disabled is visible text, reachable by touch and by screen reader |
| AC-S15 | Cancel opens a dialog restating number, title, recorded count and reservation effect |

### Topping runner

| ID | Criterion |
|---|---|
| AC-S16 | A round of 60 barrels completes with zero numeric keystrokes until close-out |
| AC-S17 | The ribbon renders 20 columns ≤767px and 30 columns ≥768px, with tiles ≥10×14px |
| AC-S18 | Every ribbon tile has an `aria-label`; the same information is available in the member table |
| AC-S19 | The phone tick button is ≥68px tall and within thumb reach (bottom third) |
| AC-S20 | A tile shows the recorded treatment **only after** the server confirms |
| AC-S21 | "Tick the rest of the group" restates the exact remaining count before confirming |

### Tanks

| ID | Criterion |
|---|---|
| AC-S22 | Every tank tile displays its lot code as well as its tank code |
| AC-S23 | Fill height is proportional to `volumeL / capacityL` within 1px |
| AC-S24 | Tank state is distinguishable in a greyscale screenshot |
| AC-S25 | The fermentation chart is followed by a complete data table containing every plotted point |
| AC-S26 | Chart series are distinguishable by dash pattern and marker with colour removed |
| AC-S27 | Chart annotations agree with the numeric facts stated elsewhere on the page (no contradiction between a stated delta and the plotted series) |

### Barrel groups

| ID | Criterion |
|---|---|
| AC-S28 | A group's member list is ordered and the order drives "barrel *n* of *N*" |
| AC-S29 | A group holding two lots renders a warning, not an error, and remains usable |
| AC-S30 | Archiving a group with open work orders warns and leaves those orders working |

## 4. Workflows

| ID | Scenario |
|---|---|
| AC-W1 | **Cellar hand, full topping round.** Sign in → Work tab → open the overdue round → tick 21 barrels → add a note on one → close out the keg → verify one measured withdrawal and 21 estimated additions → correct one entry → verify the re-fan. Zero mode switches; zero numeric entry before close-out. |
| AC-W2 | **Manager, triage to issue.** Sign in → queue → narrow to Hall C → open a group → ask the assistant for a round → Review & create → land on the draft → change the schedule in the dock → Issue → verify status `ISSUED` and the assignee notified. |
| AC-W3 | **Find one barrel in 8,142.** ⌘K → type a barrel number → open it in ≤2 keystrokes after the code. Repeat with scan. Repeat with the camera disabled and keyboard only. |
| AC-W4 | **Winemaker, stalled ferment.** Tank board → spot the attention glyph → open T-09 → read the chart → read the tasting note → record a reading → verify it appears in the chart and history. |
| AC-W5 | **Correction after a blend.** Attempt to correct a topping entry whose wine was later blended → verify the blocked message names WO #244 in prose and offers the LIFO unwind. |
| AC-W7 | **The assistant creates a draft, not issued work.** Ask the assistant for a round without saying "issue" → Review & create → verify the work order is `DRAFT`, that no reservation was taken and no assignee was notified, and that the receipt says nobody can see it on the floor yet. |
| AC-W8 | **An explicit "issue it" still issues.** Ask with the word "issue" → the card's primary action reads "Review & issue" → confirm → verify status `ISSUED` and the assignee notified. Repeat with "but don't issue it yet" and verify `DRAFT`. |
| AC-W9 | **The conversation continues on the object.** From any page except `/assistant`, Review & create → land on the draft with the dock still open → say "change the schedule to Friday" without naming the order → verify it lands on that order. From `/assistant` itself, verify the app does NOT navigate (it would end the session) and the receipt link is offered instead. |
| AC-W6 | **Seasonal worker, first day.** With no training, complete one topping round using only on-screen text. No step requires knowing a code, an abbreviation or an icon's meaning. |

## 5. Permissions

| ID | Criterion |
|---|---|
| AC-P1 | Role `user` cannot see Compliance, Accounting or Setup in the nav, and gets a clear refusal at those routes |
| AC-P2 | Role `user` can tick and close out a keg, but cannot edit group settings |
| AC-P3 | A user with no vineyard membership sees the actionable empty state naming the manager, not a dead end |
| AC-P4 | A vessel or group from another tenant is never returned by search, scan or any list |
| AC-P5 | Correction permissions match `02-screen-inventory.md` SC-07 |

## 6. Irreversible actions

| ID | Criterion |
|---|---|
| AC-I1 | Filing a compliance report requires a dialog restating period, form type and totals |
| AC-I2 | No irreversible action is reachable in one click anywhere in the product |
| AC-I3 | Every confirmation dialog's confirm button names the act, never "OK" |
| AC-I4 | A confirmation dialog does not dismiss on outside click |

## 7. Network and interruption

| ID | Criterion |
|---|---|
| AC-N1 | Offline: the primary capture action is disabled, the banner states the situation, and entered values persist on screen |
| AC-N2 | Assistant unavailable: the dock says so before the user types, and the SAME server gate refuses `/api/assistant` — the composer and the route never disagree |
| AC-N3 | Assistant unavailable: global search, the sidebar, the command palette and the manual New work order flow are all unaffected (03-interaction-spec.md:183 forbids AI-only affordances) |
| AC-N2 | The words "queued", "synced", "will retry" and "offline-ready" appear nowhere unless a durable outbox exists and drains |
| AC-N3 | A request that fails mid-record leaves nothing written and says so explicitly |
| AC-N4 | Submitting the same `commandId` twice produces exactly one record |
| AC-N5 | Losing connection mid-round preserves position, ticks made so far, and any typed note |
| AC-N6 | Reconnecting does not auto-submit anything the user did not confirm |

## 8. Domain (post-gate)

| ID | Criterion |
|---|---|
| AC-D1 | A work order recorded on a past date reads group membership **as of that date** — add a barrel afterwards and assert the historical count is unchanged |
| AC-D2 | Keg close-out is atomic: an injected failure writes nothing |
| AC-D3 | Close-out produces one measured withdrawal + N estimated additions sharing one `batchId` |
| AC-D4 | Source tank volume after close-out = prior volume − fill volume, exactly |
| AC-D5 | Every estimated line recomputes exactly from its stored divisor and inputs |
| AC-D6 | Correcting a fill volume re-fans every estimate on that fill and states the effect before confirming |
| AC-D7 | Topping a barrel at nominal capacity succeeds; >15% of nominal warns and is overridable with a reason |
| AC-D8 | Derived lines are selectable by an indexed query with no JSON parsing |
| AC-D9 | A batch action across 60 members failing on 3 records the other 57 and names the 3 |
| AC-D10 | Membership changes, group settings changes and corrections all write audit entries with actor and before/after |
| AC-D11 | The ledger balance identity holds with derived lines included |
| AC-D12 | A split (press) and a merge (blend) both render correctly in the lineage view and in the lineage table, with parents and children named in the row text |

## 9. Responsive

| ID | Criterion |
|---|---|
| AC-R1 | Every screen renders without horizontal overflow at 390, 430, 768, 1024, 1440 |
| AC-R2 | No chip or label is clipped at 390px (baseline defect: `Barrels` rendering as "Barr") |
| AC-R3 | The assistant FAB overlaps no page content at any width, including above a sticky action bar |
| AC-R4 | Sticky actions respect `env(safe-area-inset-bottom)` |
| AC-R5 | With every string lengthened 40%, no layout clips or overlaps |
| AC-R6 | Lot, barrel and tank codes are never truncated below 8 characters |
| AC-R7 | The lineage phone view is the event stream, not a scaled graph |

## 10. Visual regression

| ID | Criterion |
|---|---|
| AC-V1 | Snapshots of every screen at 390 and 1440, both states of every interactive component, taken on `/styleguide` and on the real routes |
| AC-V2 | Greyscale snapshots of every status, chart and lineage view remain interpretable |
| AC-V3 | Focus-walk snapshots show a visible ring on every interactive element type |
| AC-V4 | The recreation of today's screens (`prototype/Current State.dc.html`) is retained as the before/after reference |
